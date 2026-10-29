import os

os.environ["AI_PROVIDER"] = "mock"
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
    assert response.json() == {"status": "ok", "provider": "mock"}


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
