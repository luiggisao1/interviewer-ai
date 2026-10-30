from unittest.mock import AsyncMock, MagicMock

import anthropic
import httpx
import pytest

from app.config import Settings
from app.exceptions import LLMProviderError
from app.schemas import (
    Difficulty,
    Evaluation,
    EvaluationRequest,
    InterviewConfig,
    InterviewMode,
    InterviewPlan,
    Message,
    NextTurnRequest,
    PlanRequest,
    Role,
    SeniorAnswer,
)
from app.services.anthropic_provider import (
    AnthropicProvider,
    CreatePlanOutputFormat,
    NextTurnOutputFormat,
    _dereference_schema,
)
from app.services.factory import create_provider


def test_anthropic_dereferences_schema() -> None:
    schema = Evaluation.model_json_schema()
    dereferenced = _dereference_schema(schema)
    assert "$defs" not in dereferenced
    assert "$ref" not in str(dereferenced)
    assert "properties" in dereferenced["properties"]["senior_answers"]["items"]


def test_factory_creates_anthropic_provider() -> None:
    settings = Settings(ai_provider="anthropic", anthropic_api_key="sk-ant-test-12345")
    provider = create_provider(settings)
    assert isinstance(provider, AnthropicProvider)
    assert provider.name == "anthropic"


@pytest.fixture
def plan_request() -> PlanRequest:
    return PlanRequest(
        study_guide="Python concurrency: asyncio event loop, thread pools, and GIL internals.",
        config=InterviewConfig(
            role=Role.backend_engineer,
            mode=InterviewMode.technical,
            difficulty=Difficulty.senior,
            duration_minutes=30,
        ),
    )


@pytest.mark.asyncio
async def test_create_plan_success(plan_request: PlanRequest) -> None:
    provider = AnthropicProvider(api_key="test-key", model="claude-3-5-sonnet-20241022")

    mock_plan = InterviewPlan(
        title="Senior Backend Practice",
        summary="Focused technical interview on concurrency",
        focus_areas=["Concurrency", "AsyncIO"],
        questions=["How does the asyncio event loop work?", "Explain the GIL."],
        estimated_turns=2,
    )
    mock_output = CreatePlanOutputFormat(
        plan=mock_plan,
        opening_message="Welcome! Let's start with your asyncio experience.",
    )

    mock_response = MagicMock()
    mock_response.stop_reason = "end_turn"
    mock_response.parsed_output = mock_output
    provider.client.beta.messages.parse = AsyncMock(return_value=mock_response)

    result = await provider.create_plan(plan_request)
    assert result is not None
    plan, opening_message = result

    assert plan == mock_plan
    assert opening_message == "Welcome! Let's start with your asyncio experience."
    provider.client.beta.messages.parse.assert_awaited_once()

    _, kwargs = provider.client.beta.messages.parse.call_args
    assert kwargs["model"] == "claude-3-5-sonnet-20241022"
    assert kwargs["max_tokens"] == 8192
    assert kwargs["output_format"] == CreatePlanOutputFormat
    assert "Create a practical interview plan" in kwargs["system"]


@pytest.mark.asyncio
async def test_next_turn_success() -> None:
    provider = AnthropicProvider(api_key="test-key", model="claude-3-5-sonnet-20241022")

    mock_output = NextTurnOutputFormat(
        interviewer_message="Good explanation of event loops. Now, what about thread contention?",
        is_complete=False,
    )
    mock_response = MagicMock()
    mock_response.stop_reason = "end_turn"
    mock_response.parsed_output = mock_output
    provider.client.beta.messages.parse = AsyncMock(return_value=mock_response)

    request = NextTurnRequest(
        plan=InterviewPlan(
            title="Interview",
            summary="Summary",
            focus_areas=["AsyncIO"],
            questions=["Q1", "Q2"],
            estimated_turns=2,
        ),
        config=InterviewConfig(
            role=Role.backend_engineer,
            mode=InterviewMode.technical,
            difficulty=Difficulty.senior,
            duration_minutes=15,
        ),
        transcript=[
            Message(role="interviewer", content="Explain the event loop."),
        ],
        candidate_answer="It runs an infinite loop checking the queue for ready I/O callbacks.",
    )

    message, is_complete = await provider.next_turn(request)
    assert message == mock_output.interviewer_message
    assert is_complete is False


@pytest.mark.asyncio
async def test_evaluate_success() -> None:
    provider = AnthropicProvider(api_key="test-key", model="claude-3-5-sonnet-20241022")

    mock_evaluation = Evaluation(
        overall_score=85,
        summary="Strong technical foundation in Python concurrency.",
        strengths=["Clear async understanding"],
        improvements=["Detail production monitoring"],
        study_guide_feedback=["AsyncIO event loop"],
        technical_feedback=["Cover CPU-bound tasks with ProcessPoolExecutor"],
        senior_answers=[
            SeniorAnswer(
                question="Explain the event loop.",
                candidate_answer="It runs ready callbacks.",
                senior_answer="The event loop is a single-threaded scheduler orchestrating non-blocking tasks.",
                why_stronger="Discusses cooperative multitasking and task starvation prevention.",
            )
        ],
        next_steps=["Practice architecture trade-offs"],
    )
    mock_response = MagicMock()
    mock_response.stop_reason = "end_turn"
    mock_response.parsed_output = mock_evaluation
    provider.client.beta.messages.parse = AsyncMock(return_value=mock_response)

    request = EvaluationRequest(
        study_guide="Python concurrency and event loops.",
        config=InterviewConfig(
            role=Role.backend_engineer,
            mode=InterviewMode.technical,
            difficulty=Difficulty.senior,
            duration_minutes=15,
        ),
        plan=InterviewPlan(
            title="Interview",
            summary="Summary",
            focus_areas=["AsyncIO"],
            questions=["Explain the event loop."],
            estimated_turns=1,
        ),
        transcript=[
            Message(role="interviewer", content="Explain the event loop."),
            Message(role="candidate", content="It runs ready callbacks."),
        ],
    )

    result = await provider.evaluate(request)
    assert result.overall_score == 85
    assert result.summary == "Strong technical foundation in Python concurrency."
    assert len(result.senior_answers) == 1


@pytest.mark.asyncio
async def test_create_plan_empty_parsed_output_raises_error(plan_request: PlanRequest) -> None:
    provider = AnthropicProvider(api_key="test-key", model="claude-3-5-sonnet-20241022")

    mock_response = MagicMock()
    mock_response.stop_reason = "end_turn"
    mock_response.parsed_output = None
    provider.client.beta.messages.parse = AsyncMock(return_value=mock_response)

    with pytest.raises(LLMProviderError, match="Claude returned empty parsed output."):
        await provider.create_plan(plan_request)


@pytest.mark.asyncio
async def test_create_plan_api_status_error_raises_llm_provider_error(plan_request: PlanRequest) -> None:
    provider = AnthropicProvider(api_key="test-key", model="claude-3-5-sonnet-20241022")

    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    resp = httpx.Response(500, request=req)
    error = anthropic.APIStatusError(message="Internal Server Error", response=resp, body={"error": "failed"})
    provider.client.beta.messages.parse = AsyncMock(side_effect=error)

    with pytest.raises(LLMProviderError) as exc_info:
        await provider.create_plan(plan_request)
    assert exc_info.value.status_code == 500
    assert exc_info.value.provider == "anthropic"


@pytest.mark.asyncio
async def test_create_plan_connection_error_raises_llm_provider_error(plan_request: PlanRequest) -> None:
    provider = AnthropicProvider(api_key="test-key", model="claude-3-5-sonnet-20241022")

    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    error = anthropic.APIConnectionError(request=req)
    provider.client.beta.messages.parse = AsyncMock(side_effect=error)

    with pytest.raises(LLMProviderError) as exc_info:
        await provider.create_plan(plan_request)
    assert exc_info.value.status_code == 504
    assert exc_info.value.is_retryable is True


@pytest.mark.asyncio
async def test_create_plan_rate_limit_error_raises_llm_provider_error(plan_request: PlanRequest) -> None:
    provider = AnthropicProvider(api_key="test-key", model="claude-3-5-sonnet-20241022")

    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    resp = httpx.Response(429, request=req)
    error = anthropic.RateLimitError(message="Rate limit exceeded", response=resp, body={"error": "rate_limited"})
    provider.client.beta.messages.parse = AsyncMock(side_effect=error)

    with pytest.raises(LLMProviderError) as exc_info:
        await provider.create_plan(plan_request)
    assert exc_info.value.status_code == 429
    assert exc_info.value.is_retryable is True
