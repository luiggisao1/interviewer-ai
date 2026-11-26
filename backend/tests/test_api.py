import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

os.environ["AI_PROVIDER"] = "mock"
os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(prefix="interviewer-api-test-"), "test.db")
os.environ.pop("OPENAI_API_KEY", None)

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.schemas import Evaluation, SeniorAnswer

get_settings.cache_clear()
client = TestClient(app)

CONFIG = {
    "role": "Software Engineer",
    "custom_role": "",
    "mode": "Mixed",
    "difficulty": "Mid-level",
    "duration_minutes": 10,
    "custom_instructions": "Focus on examples",
}
GUIDE = (
    "# APIs\nREST design and status codes\n# Testing\nUnit tests and integration tests"
)


def test_health_uses_mock_without_key() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "provider": "mock", "recruiter_name": "Iris"}


def test_study_guide_sections_start_with_python() -> None:
    response = client.get("/api/study-guide/sections")
    assert response.status_code == 200
    sections = response.json()
    assert sections[0]["title"] == "Python"
    assert "Core Python fundamentals" in sections[0]["content"]
    assert any(section["title"] == "SQL" for section in sections)


def test_complete_interview_flow() -> None:
    plan_response = client.post(
        "/api/plan", json={"study_guide": GUIDE, "config": CONFIG}
    )
    assert plan_response.status_code == 200
    payload = plan_response.json()
    assert payload["provider"] == "mock"
    assert payload["plan"]["questions"]

    transcript = [{"role": "interviewer", "content": payload["opening_message"]}]
    turn_response = client.post(
        "/api/turn",
        json={
            "plan": payload["plan"],
            "config": CONFIG,
            "transcript": transcript,
            "candidate_answer": "REST APIs use resources and clear HTTP semantics to create predictable interfaces.",
        },
    )
    assert turn_response.status_code == 200
    turn = turn_response.json()
    transcript += [
        {
            "role": "candidate",
            "content": "REST APIs use resources and clear HTTP semantics.",
        },
        {"role": "interviewer", "content": turn["interviewer_message"]},
    ]

    evaluation = client.post(
        "/api/evaluation",
        json={
            "study_guide": GUIDE,
            "config": CONFIG,
            "plan": payload["plan"],
            "transcript": transcript,
        },
    )
    assert evaluation.status_code == 200
    body = evaluation.json()["evaluation"]
    assert 0 <= body["overall_score"] <= 100
    assert body["technical_feedback"]
    assert body["study_guide_feedback"]
    assert len(body["senior_answers"]) == 1
    assert body["senior_answers"][0]["candidate_answer"]


def test_rejects_short_study_guide() -> None:
    response = client.post(
        "/api/plan", json={"study_guide": "too short", "config": CONFIG}
    )
    assert response.status_code == 422


def test_evaluation_defensive_defaults() -> None:
    partial_data = {
        "overall_score": 75,
        "summary": "Solid interview performance.",
    }
    evaluation = Evaluation.model_validate(partial_data)
    assert evaluation.overall_score == 75
    assert evaluation.summary == "Solid interview performance."
    assert evaluation.strengths == []
    assert evaluation.technical_feedback == []
    assert evaluation.senior_answers == []
    assert evaluation.next_steps == []


def test_evaluation_senior_answer_defaults() -> None:
    sa = SeniorAnswer()
    assert sa.question == "Interview question"
    assert sa.candidate_answer == ""
    assert sa.senior_answer == ""
    assert sa.why_stronger == ""


def test_single_turn_early_evaluation_no_duplication() -> None:
    plan = {
        "title": "Senior Python Engineer Practice",
        "summary": "Deep dive into architecture",
        "focus_areas": ["Concurrency", "Memory", "API Design", "Distributed Systems"],
        "questions": ["Q1: Concurrency", "Q2: Memory", "Q3: API Design", "Q4: Distributed Systems"],
        "estimated_turns": 4,
    }
    transcript = [
        {"role": "interviewer", "content": "Q1: Concurrency"},
        {"role": "candidate", "content": "I use asyncio tasks and queues for concurrency."},
    ]
    response = client.post(
        "/api/evaluation",
        json={
            "study_guide": GUIDE,
            "config": CONFIG,
            "plan": plan,
            "transcript": transcript,
        },
    )
    assert response.status_code == 200
    body = response.json()["evaluation"]
    assert len(body["senior_answers"]) == 1
    assert body["senior_answers"][0]["question"] == "Q1: Concurrency"
    assert body["senior_answers"][0]["candidate_answer"] == "I use asyncio tasks and queues for concurrency."


def test_cors_origins_strips_trailing_slashes() -> None:
    from app.config import Settings

    s = Settings(frontend_origins="https://inai.duiggi.dev/,http://localhost:5173")
    assert s.cors_origins == ["https://inai.duiggi.dev", "http://localhost:5173"]


def test_evaluation_uses_custom_evaluation_provider() -> None:
    custom_config = {
        **CONFIG,
        "provider": "openai",
        "evaluation_provider": "gemini",
    }
    plan = {
        "title": "System Design Practice",
        "summary": "Distributed systems",
        "focus_areas": ["Caching"],
        "questions": ["How do you invalidate cache?"],
        "estimated_turns": 1,
    }
    transcript = [
        {"role": "interviewer", "content": "How do you invalidate cache?"},
        {"role": "candidate", "content": "Write-through and cache TTLs."},
    ]

    mock_provider = MagicMock()
    mock_provider.name = "gemini"
    mock_provider.evaluate = AsyncMock(
        return_value=Evaluation(
            overall_score=90,
            summary="Great explanation of caching.",
            strengths=["Clear"],
            improvements=[],
            study_guide_feedback=[],
            technical_feedback=[],
            senior_answers=[],
            next_steps=[],
        )
    )

    with patch("app.routers.api.create_provider", return_value=mock_provider) as mock_create_provider:
        response = client.post(
            "/api/evaluation",
            json={
                "study_guide": GUIDE,
                "config": custom_config,
                "plan": plan,
                "transcript": transcript,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["provider"] == "gemini"
        mock_create_provider.assert_called_once()
        call_args = mock_create_provider.call_args
        called_provider = (
            call_args.kwargs.get("provider_override")
            if "provider_override" in call_args.kwargs
            else call_args.args[1]
        )
        assert called_provider == "gemini"

    from app.schemas import EvaluationRequest
    req = EvaluationRequest.model_validate({
        "study_guide": GUIDE,
        "config": custom_config,
        "plan": plan,
        "transcript": transcript,
    })
    assert getattr(req.config, "evaluation_provider", None) == "gemini"


def test_is_closing_interviewer_message() -> None:
    from app.services.base import AIProvider

    assert AIProvider.is_closing_interviewer_message("That concludes our interview.", 1, 3) is True
    assert AIProvider.is_closing_interviewer_message("Thanks so much, goodbye!", 1, 3) is True
    assert AIProvider.is_closing_interviewer_message("Your debrief is starting now.", 3, 3) is True
    assert AIProvider.is_closing_interviewer_message("Thank you for your time today!", 3, 3) is True
    assert AIProvider.is_closing_interviewer_message("Thank you for your time today!", 1, 3) is False
    assert AIProvider.is_closing_interviewer_message("Goodbye!", 0, 3) is False
    assert AIProvider.is_closing_interviewer_message("Goodbye — do you have any questions?", 3, 3) is False
    assert AIProvider.is_closing_interviewer_message("Good point on caching.", 1, 3) is False


def test_turn_marks_complete_on_verbal_closing_and_avoids_double_counting() -> None:
    plan = {
        "title": "System Design Practice",
        "summary": "Distributed systems",
        "focus_areas": ["Caching", "Sharding"],
        "questions": ["How do you invalidate cache?", "How do you shard data?"],
        "estimated_turns": 2,
    }
    transcript = [
        {"role": "interviewer", "content": "How do you invalidate cache?"},
        {"role": "candidate", "content": "Write-through and TTLs."},
    ]
    mock_provider = MagicMock()
    mock_provider.name = "openai"
    mock_provider.next_turn = AsyncMock(
        return_value=("Thanks! That concludes our interview. Goodbye.", False)
    )

    with patch("app.routers.api.create_provider", return_value=mock_provider):
        response = client.post(
            "/api/turn",
            json={
                "plan": plan,
                "config": CONFIG,
                "transcript": transcript,
                "candidate_answer": "Write-through and TTLs.",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["is_complete"] is True
    assert body["turn_number"] == 1


def test_realtime_ws_emits_session_completed() -> None:
    import json

    from app.schemas import Message

    plan = {
        "title": "Python Practice",
        "summary": "Async",
        "focus_areas": ["AsyncIO"],
        "questions": ["Explain the event loop."],
        "estimated_turns": 1,
    }
    expected_transcript = [
        Message(role="interviewer", content="Explain the event loop."),
        Message(role="candidate", content="It runs cooperative coroutines."),
        Message(role="interviewer", content="Thank you, the interview is concluded."),
    ]
    mock_provider = MagicMock()
    mock_provider.name = "openai"
    mock_provider.supports_realtime_audio = True
    mock_provider.handle_realtime_audio_session = AsyncMock(return_value=expected_transcript)
    setup_payload = json.dumps(
        {
            "type": "setup",
            "provider": "openai",
            "study_guide": GUIDE,
            "config": CONFIG,
            "plan": plan,
        }
    )

    with patch("app.routers.realtime.create_provider", return_value=mock_provider):
        with client.websocket_connect("/api/realtime/ws") as ws:
            ws.send_text(setup_payload)
            event = ws.receive_json()

    assert event == {
        "type": "session_completed",
        "transcript": [
            {"role": "interviewer", "content": "Explain the event loop."},
            {"role": "candidate", "content": "It runs cooperative coroutines."},
            {"role": "interviewer", "content": "Thank you, the interview is concluded."},
        ],
    }

