import asyncio
import base64
import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import openai
import pytest

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
from app.services.openai_provider import OpenAIProvider


def test_openai_realtime_model_setting_default() -> None:
    assert Settings.model_fields["openai_realtime_model"].default == "gpt-realtime-2.1-mini"
    settings = Settings(_env_file=None)
    assert settings.openai_realtime_model == "gpt-realtime-2.1-mini"


def test_factory_creates_openai_provider() -> None:
    settings = Settings(ai_provider="openai", openai_api_key="sk-openai-test-12345")
    provider = create_provider(settings)
    assert isinstance(provider, OpenAIProvider)
    assert provider.name == "openai"


def test_factory_creates_openai_provider_with_realtime_model() -> None:
    settings = Settings(ai_provider="openai", openai_api_key="sk-test")
    provider = create_provider(settings)
    assert isinstance(provider, OpenAIProvider)
    assert provider.realtime_model == "gpt-realtime-2.1-mini"

    custom_settings = Settings(
        ai_provider="openai",
        openai_api_key="sk-test",
        openai_realtime_model="gpt-realtime-custom",
    )
    custom_provider = create_provider(custom_settings)
    assert isinstance(custom_provider, OpenAIProvider)
    assert custom_provider.realtime_model == "gpt-realtime-custom"


def test_openai_provider_supports_realtime_audio() -> None:
    provider = OpenAIProvider(api_key="test-key")
    assert provider.supports_realtime_audio is True
    assert provider.realtime_model == "gpt-realtime-2.1-mini"

    custom_provider = OpenAIProvider(api_key="test-key", realtime_model="gpt-realtime-custom")
    assert custom_provider.realtime_model == "gpt-realtime-custom"


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
    provider = OpenAIProvider(api_key="test-key", model="gpt-4o-mini")

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

    mock_choice = MagicMock()
    mock_choice.message.refusal = None
    mock_choice.message.parsed = mock_output
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    provider.client.beta.chat.completions.parse = AsyncMock(return_value=mock_response)

    plan, opening_message = await provider.create_plan(plan_request)
    assert plan == mock_plan
    assert opening_message == "Welcome! Let's start with your asyncio experience."
    provider.client.beta.chat.completions.parse.assert_awaited_once()

    _, kwargs = provider.client.beta.chat.completions.parse.call_args
    assert kwargs["model"] == "gpt-4o-mini"
    assert kwargs["response_format"] == CreatePlanOutputFormat
    assert any(
        m.get("role") == "system" and "Create a practical interview plan" in m.get("content", "")
        for m in kwargs.get("messages", [])
    )


@pytest.mark.asyncio
async def test_next_turn_success() -> None:
    provider = OpenAIProvider(api_key="test-key", model="gpt-4o-mini")

    mock_output = NextTurnOutputFormat(
        interviewer_message="Good explanation of event loops. Now, what about thread contention?",
        is_complete=False,
    )
    mock_choice = MagicMock()
    mock_choice.message.refusal = None
    mock_choice.message.parsed = mock_output
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    provider.client.beta.chat.completions.parse = AsyncMock(return_value=mock_response)

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
    provider.client.beta.chat.completions.parse.assert_awaited_once()

    _, kwargs = provider.client.beta.chat.completions.parse.call_args
    assert kwargs["model"] == "gpt-4o-mini"
    assert kwargs["response_format"] == NextTurnOutputFormat
    assert any(
        m.get("role") == "system" and "Act as a supportive but realistic interviewer" in m.get("content", "")
        for m in kwargs.get("messages", [])
    )


@pytest.mark.asyncio
async def test_evaluate_success() -> None:
    provider = OpenAIProvider(api_key="test-key", model="gpt-4o-mini")

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
    mock_choice = MagicMock()
    mock_choice.message.refusal = None
    mock_choice.message.parsed = mock_evaluation
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    provider.client.beta.chat.completions.parse = AsyncMock(return_value=mock_response)

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
    provider.client.beta.chat.completions.parse.assert_awaited_once()

    _, kwargs = provider.client.beta.chat.completions.parse.call_args
    assert kwargs["response_format"] == Evaluation


@pytest.mark.asyncio
async def test_evaluate_normalizes_1_to_10_score() -> None:
    provider = OpenAIProvider(api_key="test-key", model="gpt-4o-mini")

    mock_evaluation = Evaluation(
        overall_score=8,
        summary="Solid performance.",
        strengths=["Clear explanation"],
        improvements=["Expand on edge cases"],
        study_guide_feedback=["Concurrency"],
        technical_feedback=["Threading"],
        senior_answers=[],
        next_steps=["Review"],
    )
    mock_choice = MagicMock()
    mock_choice.message.refusal = None
    mock_choice.message.parsed = mock_evaluation
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    provider.client.beta.chat.completions.parse = AsyncMock(return_value=mock_response)

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
            Message(role="candidate", content="The event loop coordinates execution of asynchronous tasks."),
        ],
    )

    result = await provider.evaluate(request)
    assert result.overall_score == 80


@pytest.mark.asyncio
async def test_rate_limit_error(plan_request: PlanRequest) -> None:
    provider = OpenAIProvider(api_key="test-key", model="gpt-4o-mini")

    req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    resp = httpx.Response(429, request=req)
    error = openai.RateLimitError(message="Rate limit reached", response=resp, body={"error": "rate_limited"})
    provider.client.beta.chat.completions.parse = AsyncMock(side_effect=error)

    with pytest.raises(LLMProviderError) as exc_info:
        await provider.create_plan(plan_request)
    assert exc_info.value.status_code == 429
    assert exc_info.value.is_retryable is True
    assert exc_info.value.provider == "openai"


@pytest.mark.asyncio
async def test_api_connection_error(plan_request: PlanRequest) -> None:
    provider = OpenAIProvider(api_key="test-key", model="gpt-4o-mini")

    req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    error = openai.APIConnectionError(request=req)
    provider.client.beta.chat.completions.parse = AsyncMock(side_effect=error)

    with pytest.raises(LLMProviderError) as exc_info:
        await provider.create_plan(plan_request)
    assert exc_info.value.status_code == 504
    assert exc_info.value.is_retryable is True
    assert exc_info.value.provider == "openai"


@pytest.mark.asyncio
async def test_api_status_error(plan_request: PlanRequest) -> None:
    provider = OpenAIProvider(api_key="test-key", model="gpt-4o-mini")

    req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    resp = httpx.Response(500, request=req)
    error = openai.APIStatusError(message="Internal Server Error", response=resp, body={"error": "server_error"})
    provider.client.beta.chat.completions.parse = AsyncMock(side_effect=error)

    with pytest.raises(LLMProviderError) as exc_info:
        await provider.create_plan(plan_request)
    assert exc_info.value.status_code == 500
    assert exc_info.value.is_retryable is True
    assert exc_info.value.provider == "openai"


@pytest.mark.asyncio
async def test_refusal_raises_provider_error(plan_request: PlanRequest) -> None:
    provider = OpenAIProvider(api_key="test-key", model="gpt-4o-mini")

    mock_choice = MagicMock()
    mock_choice.message.refusal = "Safety policy violation: prompt violates guidelines."
    mock_choice.message.parsed = None
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    provider.client.beta.chat.completions.parse = AsyncMock(return_value=mock_response)

    with pytest.raises(LLMProviderError) as exc_info:
        await provider.create_plan(plan_request)
    assert "refused" in exc_info.value.message.lower() or "safety" in exc_info.value.message.lower()
    assert exc_info.value.provider == "openai"


@pytest.mark.asyncio
async def test_empty_parsed_output_raises_provider_error(plan_request: PlanRequest) -> None:
    provider = OpenAIProvider(api_key="test-key", model="gpt-4o-mini")

    mock_choice = MagicMock()
    mock_choice.message.refusal = None
    mock_choice.message.parsed = None
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    provider.client.beta.chat.completions.parse = AsyncMock(return_value=mock_response)

    with pytest.raises(LLMProviderError) as exc_info:
        await provider.create_plan(plan_request)
    assert "empty" in exc_info.value.message.lower()
    assert exc_info.value.provider == "openai"


@pytest.mark.asyncio
async def test_openai_handle_realtime_audio_session() -> None:
    provider = OpenAIProvider(api_key="test-key", recruiter_name="Iris")

    mock_ws = MagicMock()
    mock_ws.send_json = AsyncMock()
    mock_ws.send_bytes = AsyncMock()

    client_pcm = b"\x10\x20"
    b64_client_pcm = base64.b64encode(client_pcm).decode("ascii")

    server_pcm = b"\x01\x02\x03\x04"
    b64_server_pcm = base64.b64encode(server_pcm).decode("ascii")

    class MockRealtimeEvent:
        def __init__(self, type_: str, **kwargs: Any) -> None:
            self.type = type_
            for k, v in kwargs.items():
                setattr(self, k, v)

        def __getitem__(self, item: str) -> Any:
            return getattr(self, item)

        def get(self, item: str, default: Any = None) -> Any:
            return getattr(self, item, default)

    server_events = [
        MockRealtimeEvent("response.output_audio.delta", delta=b64_server_pcm),
        MockRealtimeEvent("response.output_audio_transcript.delta", delta="Hello, let's start."),
        MockRealtimeEvent("response.output_audio_transcript.done", transcript="Hello, let's start."),
        MockRealtimeEvent(
            "conversation.item.input_audio_transcription.completed",
            transcript="Event loop uses epoll.",
        ),
        MockRealtimeEvent("input_audio_buffer.speech_started"),
        MockRealtimeEvent(
            "response.done",
            response=SimpleNamespace(
                usage=SimpleNamespace(
                    input_tokens=100,
                    output_tokens=50,
                    total_tokens=150,
                    input_token_details=SimpleNamespace(
                        audio_tokens=80,
                        text_tokens=20,
                        cached_tokens=0,
                    ),
                    output_token_details=SimpleNamespace(
                        audio_tokens=40,
                        text_tokens=10,
                    ),
                )
            ),
        ),
    ]

    all_server_events_done = asyncio.Event()

    async def mock_connection_aiter():
        for event in server_events:
            yield event
            await asyncio.sleep(0.001)
        all_server_events_done.set()
        while True:
            await asyncio.sleep(1)

    mock_connection = MagicMock()
    mock_connection.session = AsyncMock()
    mock_connection.response = AsyncMock()
    mock_connection.input_audio_buffer = AsyncMock()
    mock_connection.__aiter__ = MagicMock(side_effect=mock_connection_aiter)

    mock_connect_cm = AsyncMock()
    mock_connect_cm.__aenter__.return_value = mock_connection
    mock_connect_cm.__aexit__.return_value = None

    mock_realtime = MagicMock()
    mock_realtime.connect = MagicMock(return_value=mock_connect_cm)
    provider.client.realtime = mock_realtime

    client_messages = [
        {"bytes": client_pcm},
        {"text": json.dumps({"type": "end_session"})},
    ]

    async def mock_ws_receive() -> dict[str, Any]:
        if client_messages:
            msg = client_messages.pop(0)
            if "text" in msg:
                await all_server_events_done.wait()
            return msg
        while True:
            await asyncio.sleep(1)

    mock_ws.receive = AsyncMock(side_effect=mock_ws_receive)

    plan = InterviewPlan(
        title="Senior Python Practice",
        summary="Concurrency",
        focus_areas=["AsyncIO"],
        questions=["How does asyncio scheduling work?", "Explain epoll."],
        estimated_turns=2,
    )
    config = InterviewConfig(
        role=Role.backend_engineer,
        mode=InterviewMode.technical,
        difficulty=Difficulty.senior,
        duration_minutes=20,
    )
    study_guide = "Python async guide: event loops and non-blocking I/O."

    transcript = await provider.handle_realtime_audio_session(
        websocket=mock_ws,
        plan=plan,
        config=config,
        study_guide=study_guide,
    )

    mock_realtime.connect.assert_called_once_with(model="gpt-realtime-2.1-mini")

    mock_connection.session.update.assert_awaited_once()
    session_call_kwargs = mock_connection.session.update.call_args.kwargs
    session_dict = session_call_kwargs.get("session", session_call_kwargs)
    instructions = session_dict.get("instructions", "")
    assert "Iris" in instructions
    assert "How does asyncio scheduling work?" in instructions
    assert session_dict.get("type") == "realtime" or "type" in session_dict

    mock_ws.send_json.assert_any_await({
        "type": "session_started",
        "provider": "openai",
        "model": "gpt-realtime-2.1-mini",
    })

    mock_connection.response.create.assert_awaited_once()

    mock_ws.send_bytes.assert_awaited_with(server_pcm)

    mock_ws.send_json.assert_any_await({
        "type": "transcript_chunk",
        "role": "interviewer",
        "content": "Hello, let's start.",
    })
    mock_ws.send_json.assert_any_await({
        "type": "transcript_final",
        "role": "interviewer",
        "content": "Hello, let's start.",
    })

    mock_ws.send_json.assert_any_await({
        "type": "transcript_chunk",
        "role": "candidate",
        "content": "Event loop uses epoll.",
    })

    mock_ws.send_json.assert_any_await({"type": "interrupted"})

    mock_connection.input_audio_buffer.append.assert_awaited_with(audio=b64_client_pcm)

    interviewer_turns = [m for m in transcript if m.role == "interviewer"]
    candidate_turns = [m for m in transcript if m.role == "candidate"]
    assert len(interviewer_turns) == 1
    assert interviewer_turns[0].content == "Hello, let's start."
    assert len(candidate_turns) == 1
    assert candidate_turns[0].content == "Event loop uses epoll."
