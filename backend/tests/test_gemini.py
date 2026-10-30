from unittest.mock import AsyncMock, MagicMock

import pytest
from google.genai import errors

from app.config import Settings
from app.exceptions import LLMProviderError
from app.schemas import (
    CreatePlanOutputFormat,
    Difficulty,
    Evaluation,
    EvaluationRequest,
    InterviewConfig,
    InterviewMode,
    InterviewPlan,
    Message,
    NextTurnOutputFormat,
    NextTurnRequest,
    PlanRequest,
    Role,
    SeniorAnswer,
)
from app.services.factory import create_provider
from app.services.gemini_provider import GeminiProvider


def test_factory_creates_gemini_provider() -> None:
    settings = Settings(ai_provider="gemini", google_api_key="test-google-key")
    provider = create_provider(settings)
    assert isinstance(provider, GeminiProvider)
    assert provider.name == "gemini"


def test_factory_creates_gemini_provider_with_google_alias() -> None:
    settings = Settings(ai_provider="google", google_api_key="test-google-key")
    provider = create_provider(settings)
    assert isinstance(provider, GeminiProvider)
    assert provider.name == "gemini"


@pytest.fixture
def plan_request() -> PlanRequest:
    return PlanRequest(
        study_guide="Python concurrency: asyncio event loop, thread pools, and GIL internals.",
        config=InterviewConfig(
            role=Role.software_engineer,
            mode=InterviewMode.technical,
            difficulty=Difficulty.senior,
            duration_minutes=20,
        ),
    )


@pytest.fixture
def evaluation_request() -> EvaluationRequest:
    plan = InterviewPlan(
        title="Senior Python Practice Interview",
        summary="A technical interview grounded in Python concurrency and memory.",
        focus_areas=["AsyncIO", "GIL", "Memory Management"],
        questions=["How does asyncio scheduling differ from preemptive threads?"],
        estimated_turns=1,
    )
    return EvaluationRequest(
        study_guide="Python internals and async concurrency.",
        config=InterviewConfig(
            role=Role.software_engineer,
            mode=InterviewMode.technical,
            difficulty=Difficulty.senior,
            duration_minutes=20,
        ),
        plan=plan,
        transcript=[
            Message(role="interviewer", content="How does asyncio scheduling differ from threads?"),
            Message(
                role="candidate",
                content=(
                    "AsyncIO uses cooperative multitasking on a single OS thread via an event loop, "
                    "whereas threads use kernel-level preemptive scheduling with GIL contention."
                ),
            ),
        ],
    )


@pytest.mark.asyncio
async def test_create_plan_success(plan_request: PlanRequest) -> None:
    provider = GeminiProvider(api_key="test-key", model="gemini-2.5-flash")

    mock_plan = InterviewPlan(
        title="Senior Python Practice Interview",
        summary="Concurrency and internals review.",
        focus_areas=["AsyncIO", "GIL"],
        questions=["Explain the event loop.", "What is cooperative multitasking?"],
        estimated_turns=2,
    )
    mock_output = CreatePlanOutputFormat(
        plan=mock_plan,
        opening_message="Welcome to the interview!",
    )
    mock_response = MagicMock()
    mock_response.parsed = mock_output
    mock_response.text = None

    provider.client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    plan, opening = await provider.create_plan(plan_request)
    assert plan.title == "Senior Python Practice Interview"
    assert len(plan.questions) == 2
    assert opening == "Welcome to the interview!"


@pytest.mark.asyncio
async def test_next_turn_success(plan_request: PlanRequest) -> None:
    provider = GeminiProvider(api_key="test-key", model="gemini-2.5-flash")

    plan = InterviewPlan(
        title="Test Plan",
        summary="Summary",
        focus_areas=["AsyncIO"],
        questions=["Q1?"],
        estimated_turns=1,
    )
    request = NextTurnRequest(
        plan=plan,
        config=plan_request.config,
        candidate_answer="My answer on asyncio.",
    )

    mock_output = NextTurnOutputFormat(
        interviewer_message="Good explanation. That concludes our interview.",
        is_complete=True,
    )
    mock_response = MagicMock()
    mock_response.parsed = mock_output
    mock_response.text = None

    provider.client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    msg, is_done = await provider.next_turn(request)
    assert msg == "Good explanation. That concludes our interview."
    assert is_done is True


@pytest.mark.asyncio
async def test_evaluate_success(evaluation_request: EvaluationRequest) -> None:
    provider = GeminiProvider(api_key="test-key", model="gemini-2.5-flash")

    mock_eval = Evaluation(
        overall_score=94,
        summary="Exemplary understanding of Python cooperative multitasking.",
        strengths=["Clear articulation of event loop mechanics"],
        improvements=["Consider discussing uvloop performance trade-offs"],
        study_guide_feedback=["Grounded deeply in asyncio fundamentals"],
        technical_feedback=["Accurately distinguished cooperative from preemptive scheduling"],
        senior_answers=[
            SeniorAnswer(
                question="How does asyncio scheduling differ from threads?",
                candidate_answer="AsyncIO uses cooperative multitasking...",
                senior_answer="AsyncIO relies on cooperative task yielding...",
                why_stronger="Highlights kernel context switch overhead vs event loop tick.",
            )
        ],
        next_steps=["Review asyncio queue primitives"],
    )
    mock_response = MagicMock()
    mock_response.parsed = mock_eval
    mock_response.text = None

    provider.client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    result = await provider.evaluate(evaluation_request)
    assert result.overall_score == 94
    assert len(result.senior_answers) == 1
    assert result.strengths[0] == "Clear articulation of event loop mechanics"


@pytest.mark.asyncio
async def test_gemini_api_error_mapped_to_llm_provider_error(plan_request: PlanRequest) -> None:
    provider = GeminiProvider(api_key="test-key", model="gemini-2.5-flash")

    # Simulate Gemini APIError (e.g. rate limit 429)
    err = errors.APIError(code=429, response_json={"error": {"message": "Resource exhausted"}})
    err.message = "Resource exhausted"
    provider.client.aio.models.generate_content = AsyncMock(side_effect=err)

    with pytest.raises(LLMProviderError) as exc_info:
        await provider.create_plan(plan_request)

    assert exc_info.value.provider == "gemini"
    assert exc_info.value.status_code == 429
    assert exc_info.value.is_retryable is True


@pytest.mark.asyncio
async def test_gemini_server_error_is_retryable(plan_request: PlanRequest) -> None:
    provider = GeminiProvider(api_key="test-key", model="gemini-2.5-flash")

    err = errors.APIError(code=503, response_json={"error": {"message": "Service unavailable"}})
    err.message = "Service unavailable"
    provider.client.aio.models.generate_content = AsyncMock(side_effect=err)

    with pytest.raises(LLMProviderError) as exc_info:
        await provider.create_plan(plan_request)

    assert exc_info.value.provider == "gemini"
    assert exc_info.value.status_code == 503
    assert exc_info.value.is_retryable is True


@pytest.mark.asyncio
async def test_gemini_empty_response_raises_error(plan_request: PlanRequest) -> None:
    provider = GeminiProvider(api_key="test-key", model="gemini-2.5-flash")

    mock_response = MagicMock()
    mock_response.parsed = None
    mock_response.text = None
    provider.client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with pytest.raises(LLMProviderError) as exc_info:
        await provider.create_plan(plan_request)

    assert exc_info.value.provider == "gemini"
    assert "empty parsed output" in exc_info.value.message
