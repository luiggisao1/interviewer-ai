from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.config import Settings, get_settings
from app.database import InterviewRepository
from app.main import app
from app.models import InterviewResponse, InterviewSession
from app.routers.api import get_repository
from app.schemas import (
    Difficulty,
    Evaluation,
    InterviewConfig,
    InterviewMode,
    InterviewPlan,
    Role,
    SeniorAnswer,
    StorageMode,
)

GUIDE = "# Python\nGenerators, GIL, and asyncio event loops\n# SQL\nIndexes, joins, and window functions"

BASE_CONFIG = {
    "role": "Backend Engineer",
    "custom_role": "",
    "mode": "Technical",
    "difficulty": "Senior",
    "duration_minutes": 10,
    "custom_instructions": "",
    "study_guide_section": "Python",
}

PLAN = {
    "title": "Senior Backend Practice",
    "summary": "Concurrency and Python internals",
    "focus_areas": ["AsyncIO", "GIL"],
    "questions": ["How does the Python GIL affect CPU-bound threads?"],
    "estimated_turns": 1,
}


@pytest.fixture
def history_client(tmp_path: Path) -> Iterator[tuple[TestClient, InterviewRepository]]:
    db_path = tmp_path / "history_test.db"
    repo = InterviewRepository(db_path)
    test_settings = Settings(ai_provider="mock", database_path=str(db_path))

    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_settings] = lambda: test_settings
    app.dependency_overrides[get_repository] = lambda: repo
    try:
        yield TestClient(app), repo
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def test_evaluate_stores_full_responses_when_storage_mode_all(
    history_client: tuple[TestClient, InterviewRepository],
) -> None:
    client, _ = history_client
    cand_answer = "Only one thread executes Python bytecode at a time; use multiprocessing."
    payload = {
        "study_guide": GUIDE,
        "config": {
            **BASE_CONFIG,
            "candidate_name": "Alice Rivera",
            "storage_mode": "all",
        },
        "plan": PLAN,
        "transcript": [
            {"role": "interviewer", "content": "How does the Python GIL affect CPU-bound threads?"},
            {"role": "candidate", "content": cand_answer},
        ],
    }

    response = client.post("/api/evaluation", json=payload)
    assert response.status_code == 200
    body = response.json()
    session_id = body["saved_session_id"]
    assert session_id is not None
    assert body["storage_mode"] == "all"

    detail_res = client.get(f"/api/history/sessions/{session_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["candidate_name"] == "Alice Rivera"
    assert detail["storage_mode"] == "all"
    assert detail["study_guide_section"] == "Python"
    assert detail["overall_score"] == body["evaluation"]["overall_score"]
    assert detail["summary"] == body["evaluation"]["summary"]
    assert detail["response_count"] == 1
    assert len(detail["responses"]) == 1
    row = detail["responses"][0]
    assert row["question"] == "How does the Python GIL affect CPU-bound threads?"
    assert row["candidate_answer"] == cand_answer
    assert row["senior_answer"]
    assert row["why_stronger"]


def test_evaluate_omits_candidate_answers_when_storage_mode_senior_only(
    history_client: tuple[TestClient, InterviewRepository],
) -> None:
    client, _ = history_client
    payload = {
        "study_guide": GUIDE,
        "config": {
            **BASE_CONFIG,
            "candidate_name": "Bob Chen",
            "storage_mode": "senior_only",
        },
        "plan": PLAN,
        "transcript": [
            {"role": "interviewer", "content": "How does the Python GIL affect CPU-bound threads?"},
            {"role": "candidate", "content": "Secret personal draft answer that must not be saved."},
        ],
    }

    response = client.post("/api/evaluation", json=payload)
    assert response.status_code == 200
    body = response.json()
    session_id = body["saved_session_id"]
    assert session_id is not None
    assert body["storage_mode"] == "senior_only"

    detail_res = client.get(f"/api/history/sessions/{session_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["candidate_name"] == "Bob Chen"
    assert detail["storage_mode"] == "senior_only"
    assert detail["overall_score"] is None
    assert detail["summary"] == ""
    assert len(detail["responses"]) == 1
    row = detail["responses"][0]
    assert row["question"] == "How does the Python GIL affect CPU-bound threads?"
    assert row["candidate_answer"] is None
    assert row["senior_answer"]
    assert row["why_stronger"]


def test_evaluate_skips_database_when_storage_mode_none(
    history_client: tuple[TestClient, InterviewRepository],
) -> None:
    client, _ = history_client
    payload = {
        "study_guide": GUIDE,
        "config": {
            **BASE_CONFIG,
            "candidate_name": "Private Candidate",
            "storage_mode": "none",
        },
        "plan": PLAN,
        "transcript": [
            {"role": "interviewer", "content": "How does the Python GIL affect CPU-bound threads?"},
            {"role": "candidate", "content": "Do not store anything."},
        ],
    }

    response = client.post("/api/evaluation", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["saved_session_id"] is None
    assert body["storage_mode"] == "none"

    assert client.get("/api/history/sessions").json() == []
    assert client.get("/api/history/responses").json() == []


def test_questions_endpoint_groups_answers_from_multiple_candidates(
    history_client: tuple[TestClient, InterviewRepository],
) -> None:
    client, _ = history_client
    shared_question = "Explain database indexing trade-offs."

    for name, cand_ans in [
        ("Alice", "Indexes speed up reads using B-trees."),
        ("Bob", "Indexes help SELECT queries but add write amplification on INSERT/UPDATE."),
    ]:
        res = client.post(
            "/api/evaluation",
            json={
                "study_guide": GUIDE,
                "config": {
                    **BASE_CONFIG,
                    "candidate_name": name,
                    "storage_mode": "all",
                    "study_guide_section": "SQL",
                },
                "plan": {**PLAN, "questions": [shared_question]},
                "transcript": [
                    {"role": "interviewer", "content": shared_question},
                    {"role": "candidate", "content": cand_ans},
                ],
            },
        )
        assert res.status_code == 200

    grouped_res = client.get("/api/history/questions")
    assert grouped_res.status_code == 200
    groups = grouped_res.json()
    assert len(groups) == 1
    assert groups[0]["question"] == shared_question
    assert groups[0]["answer_count"] == 2
    entries = groups[0]["entries"]
    by_name = {entry["candidate_name"]: entry for entry in entries}
    assert set(by_name.keys()) == {"Alice", "Bob"}
    assert by_name["Alice"]["candidate_answer"] == "Indexes speed up reads using B-trees."
    assert (
        by_name["Bob"]["candidate_answer"]
        == "Indexes help SELECT queries but add write amplification on INSERT/UPDATE."
    )
    assert by_name["Alice"]["senior_answer"]
    assert by_name["Bob"]["senior_answer"]


def test_history_filtering_across_endpoints(
    history_client: tuple[TestClient, InterviewRepository],
) -> None:
    client, repo = history_client

    repo.save_evaluation(
        config=InterviewConfig(
            role=Role.backend_engineer,
            mode=InterviewMode.technical,
            difficulty=Difficulty.senior,
            duration_minutes=15,
            candidate_name="Alice",
            storage_mode=StorageMode.all,
            study_guide_section="Python",
        ),
        plan=InterviewPlan(
            title="Python Deep Dive",
            summary="Python internals",
            focus_areas=["GIL", "Memory"],
            questions=["Explain the GIL", "Explain tracemalloc"],
            estimated_turns=2,
        ),
        evaluation=Evaluation(
            overall_score=88,
            summary="Strong Python answers.",
            senior_answers=[
                SeniorAnswer(
                    question="Explain the GIL",
                    candidate_answer="Global interpreter lock",
                    senior_answer="Mutex protecting CPython object refcounts",
                    why_stronger="Explains refcount safety",
                ),
                SeniorAnswer(
                    question="Explain tracemalloc",
                    candidate_answer="Profiles Python allocations",
                    senior_answer="Tracks Python heap blocks by traceback",
                    why_stronger="Notes native extension blindspots",
                ),
            ],
        ),
        provider="mock",
    )

    repo.save_evaluation(
        config=InterviewConfig(
            role=Role.data_scientist,
            mode=InterviewMode.technical,
            difficulty=Difficulty.mid,
            duration_minutes=15,
            candidate_name="Bob",
            storage_mode=StorageMode.senior_only,
            study_guide_section="SQL",
        ),
        plan=InterviewPlan(
            title="SQL Query Tuning",
            summary="SQL tuning",
            focus_areas=["Window Functions"],
            questions=["Compare RANK and DENSE_RANK"],
            estimated_turns=1,
        ),
        evaluation=Evaluation(
            overall_score=74,
            summary="Decent SQL.",
            senior_answers=[
                SeniorAnswer(
                    question="Compare RANK and DENSE_RANK",
                    candidate_answer="Bob secret answer",
                    senior_answer="DENSE_RANK leaves no gaps after ties",
                    why_stronger="Clarifies tie numbering behavior",
                ),
            ],
        ),
        provider="mock",
    )

    filters_res = client.get("/api/history/filters")
    assert filters_res.status_code == 200
    assert filters_res.json() == {"candidates": ["Alice", "Bob"], "sections": ["Python", "SQL"]}

    # Filter by candidate_name
    bob_sessions = client.get("/api/history/sessions", params={"candidate_name": "bob"}).json()
    assert len(bob_sessions) == 1
    assert bob_sessions[0]["candidate_name"] == "Bob"
    assert bob_sessions[0]["overall_score"] is None

    # Filter by section
    py_questions = client.get("/api/history/questions", params={"section": "Python"}).json()
    assert len(py_questions) == 2

    # Filter by storage_mode
    senior_only_responses = client.get("/api/history/responses", params={"storage_mode": "senior_only"}).json()
    assert len(senior_only_responses) == 1
    assert senior_only_responses[0]["candidate_name"] == "Bob"
    assert senior_only_responses[0]["candidate_answer"] is None

    # Search inside session with multiple questions keeps accurate total response_count
    search_sessions = client.get("/api/history/sessions", params={"search": "tracemalloc"}).json()
    assert len(search_sessions) == 1
    assert search_sessions[0]["candidate_name"] == "Alice"
    assert search_sessions[0]["response_count"] == 2

    search_responses = client.get("/api/history/responses", params={"search": "DENSE_RANK"}).json()
    assert len(search_responses) == 1
    assert search_responses[0]["candidate_name"] == "Bob"


def test_history_is_read_only_no_public_delete(
    history_client: tuple[TestClient, InterviewRepository],
) -> None:
    client, _ = history_client
    res = client.post(
        "/api/evaluation",
        json={
            "study_guide": GUIDE,
            "config": {**BASE_CONFIG, "candidate_name": "Temp User", "storage_mode": "all"},
            "plan": PLAN,
            "transcript": [
                {"role": "interviewer", "content": "How does the Python GIL affect CPU-bound threads?"},
                {"role": "candidate", "content": "It serializes bytecode execution."},
            ],
        },
    )
    assert res.status_code == 200
    session_id = res.json()["saved_session_id"]

    del_res = client.delete(f"/api/history/sessions/{session_id}")
    assert del_res.status_code == 405
    assert client.get(f"/api/history/sessions/{session_id}").status_code == 200

    cors_middleware = next(m for m in app.user_middleware if m.cls is CORSMiddleware)
    assert "DELETE" not in cors_middleware.kwargs["allow_methods"]


def test_export_markdown_grouped_by_questions(
    history_client: tuple[TestClient, InterviewRepository],
) -> None:
    client, repo = history_client
    question = "What is the Python GIL?"
    repo.save_evaluation(
        config=InterviewConfig(
            role=Role.backend_engineer,
            mode=InterviewMode.technical,
            difficulty=Difficulty.senior,
            duration_minutes=15,
            candidate_name="Alice",
            storage_mode=StorageMode.all,
            study_guide_section="Python",
        ),
        plan=InterviewPlan(
            title="Python Session",
            summary="Summary",
            focus_areas=["GIL"],
            questions=[question],
            estimated_turns=1,
        ),
        evaluation=Evaluation(
            overall_score=85,
            summary="Strong answer.",
            senior_answers=[
                SeniorAnswer(
                    question=question,
                    candidate_answer="Alice answer on GIL mutex.",
                    senior_answer="Senior GIL explanation.",
                    why_stronger="Mentions CPython refcounts.",
                )
            ],
        ),
        provider="mock",
    )
    repo.save_evaluation(
        config=InterviewConfig(
            role=Role.backend_engineer,
            mode=InterviewMode.technical,
            difficulty=Difficulty.mid,
            duration_minutes=15,
            candidate_name="Bob",
            storage_mode=StorageMode.senior_only,
            study_guide_section="Python",
        ),
        plan=InterviewPlan(
            title="Python Session",
            summary="Summary",
            focus_areas=["GIL"],
            questions=[question],
            estimated_turns=1,
        ),
        evaluation=Evaluation(
            overall_score=60,
            summary="Private.",
            senior_answers=[
                SeniorAnswer(
                    question=question,
                    candidate_answer="Secret Bob draft.",
                    senior_answer="Senior GIL explanation for Bob.",
                    why_stronger="Covers multiprocessing.",
                )
            ],
        ),
        provider="mock",
    )

    export_res = client.get("/api/history/export", params={"view": "questions"})
    assert export_res.status_code == 200
    assert export_res.headers["content-type"].startswith("text/markdown")
    assert 'attachment; filename="interview-archive-questions.md"' == export_res.headers["content-disposition"]

    text = export_res.text
    assert "# Interview Response Archive — Grouped by Question" in text
    assert f"## Q1. {question}" in text
    assert "Alice answer on GIL mutex." in text
    assert "Secret Bob draft." not in text
    assert "_Candidate answer not stored (Senior-only mode)_" in text
    assert "Senior GIL explanation." in text
    assert "Senior GIL explanation for Bob." in text


def test_export_markdown_single_session_and_404(
    history_client: tuple[TestClient, InterviewRepository],
) -> None:
    client, repo = history_client
    session_id = repo.save_evaluation(
        config=InterviewConfig(
            role=Role.backend_engineer,
            mode=InterviewMode.technical,
            difficulty=Difficulty.senior,
            duration_minutes=15,
            candidate_name="Carla",
            storage_mode=StorageMode.all,
            study_guide_section="SQL",
        ),
        plan=InterviewPlan(
            title="SQL Deep Dive",
            summary="SQL",
            focus_areas=["Indexes"],
            questions=["How do B-tree indexes work?"],
            estimated_turns=1,
        ),
        evaluation=Evaluation(
            overall_score=92,
            summary="Excellent database internals answer.",
            senior_answers=[
                SeniorAnswer(
                    question="How do B-tree indexes work?",
                    candidate_answer="Balanced tree nodes sorted by key.",
                    senior_answer="",
                    why_stronger="Gold Standard: Complete explanation.",
                )
            ],
        ),
        provider="mock",
    )
    assert session_id is not None

    export_res = client.get("/api/history/export", params={"session_id": session_id})
    assert export_res.status_code == 200
    assert f'filename="interview-session-{session_id[:8]}.md"' in export_res.headers["content-disposition"]
    assert "# Interview Session: Carla" in export_res.text
    assert "SQL Deep Dive" in export_res.text
    assert "Balanced tree nodes sorted by key." in export_res.text
    assert "Gold Standard: Complete explanation." in export_res.text

    missing_res = client.get("/api/history/export", params={"session_id": "nonexistent-id"})
    assert missing_res.status_code == 404


def test_export_markdown_respects_visibility_flags(
    history_client: tuple[TestClient, InterviewRepository],
) -> None:
    client, repo = history_client
    repo.save_evaluation(
        config=InterviewConfig(
            role=Role.software_engineer,
            mode=InterviewMode.mixed,
            difficulty=Difficulty.mid,
            duration_minutes=10,
            candidate_name="Diego",
            storage_mode=StorageMode.all,
            study_guide_section="Python",
        ),
        plan=InterviewPlan(
            title="Python Basics",
            summary="Summary",
            focus_areas=["Generators"],
            questions=["Why use generators?"],
            estimated_turns=1,
        ),
        evaluation=Evaluation(
            overall_score=80,
            summary="Good.",
            senior_answers=[
                SeniorAnswer(
                    question="Why use generators?",
                    candidate_answer="Diego private answer.",
                    senior_answer="Generators yield lazily with O(1) memory.",
                    why_stronger="Quantifies memory complexity.",
                )
            ],
        ),
        provider="mock",
    )

    export_res = client.get(
        "/api/history/export",
        params={"view": "questions", "include_candidate_answers": "false"},
    )
    assert export_res.status_code == 200
    assert "Diego private answer." not in export_res.text
    assert "Generators yield lazily with O(1) memory." in export_res.text


def test_settings_resolved_database_url_supports_sqlite_and_postgres(tmp_path: Path) -> None:
    backend_root = Path(__file__).resolve().parents[1]

    default_settings = Settings(_env_file=None, database_path="data/interviewer.db", database_url=None)
    assert default_settings.resolved_database_url == f"sqlite:///{backend_root / 'data/interviewer.db'}"

    rel_sqlite = Settings(_env_file=None, database_url="sqlite:///data/custom.db")
    assert rel_sqlite.resolved_database_url == f"sqlite:///{backend_root / 'data/custom.db'}"

    abs_db = tmp_path / "absolute.db"
    abs_sqlite = Settings(_env_file=None, database_url=f"sqlite:///{abs_db}")
    assert abs_sqlite.resolved_database_url == f"sqlite:///{abs_db}"

    mem_sqlite = Settings(_env_file=None, database_url="sqlite:///:memory:")
    assert mem_sqlite.resolved_database_url == "sqlite:///:memory:"

    pg_url = "postgresql+psycopg://user:pass@localhost:5432/interviewer"
    pg_settings = Settings(_env_file=None, database_url=pg_url)
    assert pg_settings.resolved_database_url == pg_url


def test_sqlmodel_orm_persistence_and_cascade(tmp_path: Path) -> None:
    repo = InterviewRepository(f"sqlite:///{tmp_path / 'orm_test.db'}")
    session_id = repo.save_evaluation(
        config=InterviewConfig(
            role=Role.backend_engineer,
            mode=InterviewMode.technical,
            difficulty=Difficulty.senior,
            duration_minutes=15,
            candidate_name="ORM Tester",
            storage_mode=StorageMode.all,
            study_guide_section="Python",
        ),
        plan=InterviewPlan(
            title="ORM Test Plan",
            summary="Summary",
            focus_areas=["SQLModel"],
            questions=["How does SQLModel combine SQLAlchemy and Pydantic?"],
            estimated_turns=1,
        ),
        evaluation=Evaluation(
            overall_score=91,
            summary="Clear explanation.",
            senior_answers=[
                SeniorAnswer(
                    question="How does SQLModel combine SQLAlchemy and Pydantic?",
                    candidate_answer="Single model class defines table columns and validation.",
                    senior_answer="SQLModel inherits from Pydantic BaseModel and SQLAlchemy DeclarativeMeta.",
                    why_stronger="Explains metadata sharing.",
                ),
            ],
        ),
        provider="mock",
    )
    assert session_id is not None

    with Session(repo.engine) as db:
        orm_session = db.exec(select(InterviewSession).where(InterviewSession.id == session_id)).one()
        assert orm_session.candidate_name == "ORM Tester"
        assert len(orm_session.responses) == 1
        assert orm_session.responses[0].question == "How does SQLModel combine SQLAlchemy and Pydantic?"

    assert repo.delete_session(session_id) is True

    with Session(repo.engine) as db:
        assert db.exec(select(InterviewSession)).all() == []
        assert db.exec(select(InterviewResponse)).all() == []
