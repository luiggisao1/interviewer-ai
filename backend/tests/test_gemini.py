import asyncio
import json
from types import SimpleNamespace
from typing import Any
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


def test_gemini_supports_realtime_audio() -> None:
    provider = GeminiProvider(api_key="test-key")
    assert provider.supports_realtime_audio is True


def test_mock_provider_does_not_support_realtime_audio() -> None:
    from app.services.mock_provider import MockProvider

    provider = MockProvider()
    assert provider.supports_realtime_audio is False


@pytest.mark.asyncio
async def test_mock_provider_raises_not_implemented_for_realtime() -> None:
    from app.services.mock_provider import MockProvider

    provider = MockProvider()
    plan = InterviewPlan(
        title="T", summary="S", focus_areas=["A"], questions=["Q"], estimated_turns=1
    )
    config = InterviewConfig(
        role=Role.software_engineer,
        mode=InterviewMode.technical,
        difficulty=Difficulty.senior,
        duration_minutes=10,
    )
    with pytest.raises(NotImplementedError):
        await provider.handle_realtime_audio_session(None, plan, config, "guide")


@pytest.mark.asyncio
async def test_gemini_handle_realtime_audio_session() -> None:
    provider = GeminiProvider(api_key="test-key")

    mock_ws = MagicMock()
    mock_ws.receive = AsyncMock(return_value={"text": json.dumps({"type": "end_session"})})
    mock_ws.send_json = AsyncMock()
    mock_ws.send_bytes = AsyncMock()

    mock_session = AsyncMock()
    mock_response = MagicMock()
    mock_response.usage_metadata = MagicMock(prompt_token_count=150, response_token_count=40, total_token_count=190)
    mock_response.server_content = MagicMock()
    mock_response.server_content.interrupted = False
    mock_response.server_content.model_turn = MagicMock()
    mock_part = MagicMock()
    mock_part.inline_data = None
    mock_part.text = "Hello candidate, let us start."
    mock_response.server_content.model_turn.parts = [mock_part]
    mock_response.server_content.output_transcription = None
    mock_response.server_content.interim_input_transcription = None
    mock_response.server_content.input_transcription = None
    mock_response.server_content.turn_complete = True

    async def mock_receive_gen():
        yield mock_response
        await asyncio.sleep(0.01)

    mock_session.receive = mock_receive_gen

    mock_connect_cm = AsyncMock()
    mock_connect_cm.__aenter__.return_value = mock_session
    mock_connect_cm.__aexit__.return_value = None

    provider.client.aio.live.connect = MagicMock(return_value=mock_connect_cm)

    plan = InterviewPlan(
        title="T", summary="S", focus_areas=["A"], questions=["Q1"], estimated_turns=1
    )
    config = InterviewConfig(
        role=Role.software_engineer,
        mode=InterviewMode.technical,
        difficulty=Difficulty.senior,
        duration_minutes=10,
    )
    transcript = await provider.handle_realtime_audio_session(mock_ws, plan, config, "guide")
    assert len(transcript) == 1
    assert transcript[0].role == "interviewer"
    assert transcript[0].content == "Hello candidate, let us start."


def _gemini_server_msg(
    *,
    text: str | None = None,
    audio: bytes | None = None,
    output_transcription: str | None = None,
    input_transcription: str | None = None,
    turn_complete: bool = False,
    function_calls: list[Any] | None = None,
) -> SimpleNamespace:
    parts = []
    if audio is not None:
        parts.append(SimpleNamespace(inline_data=SimpleNamespace(data=audio), text=None))
    if text is not None:
        parts.append(SimpleNamespace(inline_data=None, text=text))

    server_content = (
        SimpleNamespace(
            interrupted=False,
            model_turn=SimpleNamespace(parts=parts) if parts else None,
            output_transcription=SimpleNamespace(text=output_transcription) if output_transcription else None,
            interim_input_transcription=None,
            input_transcription=SimpleNamespace(text=input_transcription) if input_transcription else None,
            turn_complete=turn_complete,
        )
        if any([parts, output_transcription, input_transcription, turn_complete])
        else None
    )
    tool_call = SimpleNamespace(function_calls=function_calls) if function_calls is not None else None
    return SimpleNamespace(server_content=server_content, tool_call=tool_call)


def _gemini_realtime_plan_and_config() -> tuple[InterviewPlan, InterviewConfig]:
    plan = InterviewPlan(
        title="T",
        summary="S",
        focus_areas=["AsyncIO"],
        questions=["Explain asyncio."],
        estimated_turns=1,
    )
    config = InterviewConfig(
        role=Role.software_engineer,
        mode=InterviewMode.technical,
        difficulty=Difficulty.senior,
        duration_minutes=10,
    )
    return plan, config


@pytest.mark.asyncio
async def test_gemini_realtime_ends_on_end_interview_tool_with_audio() -> None:
    provider = GeminiProvider(api_key="test-key", recruiter_name="Iris")

    mock_ws = MagicMock()
    mock_ws.send_json = AsyncMock()
    mock_ws.send_bytes = AsyncMock()

    async def ws_receive():
        while True:
            await asyncio.sleep(1)

    mock_ws.receive = AsyncMock(side_effect=ws_receive)

    mock_session = AsyncMock()

    async def mock_receive_gen():
        yield _gemini_server_msg(text="Explain asyncio.", turn_complete=True)
        yield _gemini_server_msg(input_transcription="It schedules coroutines on an event loop.")
        yield _gemini_server_msg(
            audio=b"\x01\x02",
            output_transcription="Thank you! Your debrief is starting now.",
        )
        yield _gemini_server_msg(
            function_calls=[SimpleNamespace(id="fn_1", name="end_interview")],
        )

    mock_session.receive = mock_receive_gen

    mock_connect_cm = AsyncMock()
    mock_connect_cm.__aenter__.return_value = mock_session
    mock_connect_cm.__aexit__.return_value = None
    provider.client.aio.live.connect = MagicMock(return_value=mock_connect_cm)

    plan, config = _gemini_realtime_plan_and_config()
    transcript = await asyncio.wait_for(
        provider.handle_realtime_audio_session(mock_ws, plan, config, "AsyncIO guide."),
        timeout=3.0,
    )

    assert [(m.role, m.content) for m in transcript] == [
        ("interviewer", "Explain asyncio."),
        ("candidate", "It schedules coroutines on an event loop."),
        ("interviewer", "Thank you! Your debrief is starting now."),
    ]
    mock_session.send_tool_response.assert_not_awaited()


@pytest.mark.asyncio
async def test_gemini_realtime_ends_on_silent_end_interview_tool_triggers_farewell() -> None:
    provider = GeminiProvider(api_key="test-key", recruiter_name="Iris")

    mock_ws = MagicMock()
    mock_ws.send_json = AsyncMock()
    mock_ws.send_bytes = AsyncMock()

    async def ws_receive():
        while True:
            await asyncio.sleep(1)

    mock_ws.receive = AsyncMock(side_effect=ws_receive)

    mock_session = AsyncMock()
    tool_response_sent = asyncio.Event()

    async def record_tool_response(**_kwargs: Any) -> None:
        tool_response_sent.set()

    mock_session.send_tool_response = AsyncMock(side_effect=record_tool_response)

    async def mock_receive_gen():
        yield _gemini_server_msg(text="Explain asyncio.", turn_complete=True)
        yield _gemini_server_msg(input_transcription="Event loop runs non-blocking I/O.")
        yield _gemini_server_msg(
            function_calls=[SimpleNamespace(id="fn_silent", name="end_interview")],
        )
        await tool_response_sent.wait()
        yield _gemini_server_msg(
            audio=b"\x03\x04",
            output_transcription="Thanks for your time! Starting your debrief.",
            turn_complete=True,
        )

    mock_session.receive = mock_receive_gen

    mock_connect_cm = AsyncMock()
    mock_connect_cm.__aenter__.return_value = mock_session
    mock_connect_cm.__aexit__.return_value = None
    provider.client.aio.live.connect = MagicMock(return_value=mock_connect_cm)

    plan, config = _gemini_realtime_plan_and_config()
    transcript = await asyncio.wait_for(
        provider.handle_realtime_audio_session(mock_ws, plan, config, "AsyncIO guide."),
        timeout=3.0,
    )

    mock_session.send_tool_response.assert_awaited_once()
    assert [(m.role, m.content) for m in transcript] == [
        ("interviewer", "Explain asyncio."),
        ("candidate", "Event loop runs non-blocking I/O."),
        ("interviewer", "Thanks for your time! Starting your debrief."),
    ]


@pytest.mark.asyncio
async def test_gemini_realtime_fallback_ends_on_verbal_goodbye_without_tool() -> None:
    provider = GeminiProvider(api_key="test-key", recruiter_name="Iris")

    mock_ws = MagicMock()
    mock_ws.send_json = AsyncMock()
    mock_ws.send_bytes = AsyncMock()

    async def ws_receive():
        while True:
            await asyncio.sleep(1)

    mock_ws.receive = AsyncMock(side_effect=ws_receive)

    mock_session = AsyncMock()

    async def mock_receive_gen():
        yield _gemini_server_msg(text="Explain asyncio.", turn_complete=True)
        yield _gemini_server_msg(input_transcription="Cooperative multitasking on one thread.")
        yield _gemini_server_msg(
            output_transcription="That concludes our interview. Goodbye!",
            turn_complete=True,
        )

    mock_session.receive = mock_receive_gen

    mock_connect_cm = AsyncMock()
    mock_connect_cm.__aenter__.return_value = mock_session
    mock_connect_cm.__aexit__.return_value = None
    provider.client.aio.live.connect = MagicMock(return_value=mock_connect_cm)

    plan, config = _gemini_realtime_plan_and_config()
    transcript = await asyncio.wait_for(
        provider.handle_realtime_audio_session(mock_ws, plan, config, "AsyncIO guide."),
        timeout=3.0,
    )

    assert [(m.role, m.content) for m in transcript] == [
        ("interviewer", "Explain asyncio."),
        ("candidate", "Cooperative multitasking on one thread."),
        ("interviewer", "That concludes our interview. Goodbye!"),
    ]
