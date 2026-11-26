from collections.abc import Callable, Iterator
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from starlette.websockets import WebSocketDisconnect

from app.config import Settings, get_settings
from app.database import InterviewRepository
from app.main import app
from app.models import AccessKey
from app.routers.admin import admin_rate_limiter
from app.routers.api import get_repository

GUIDE = "# Python\nGenerators, GIL, and asyncio event loops\n# SQL\nIndexes, joins, and window functions"

CONFIG = {
    "role": "Backend Engineer",
    "custom_role": "",
    "mode": "Technical",
    "difficulty": "Senior",
    "duration_minutes": 10,
    "custom_instructions": "",
    "candidate_name": "Security Tester",
    "storage_mode": "none",
    "study_guide_section": "Python",
}


@pytest.fixture
def security_harness(
    tmp_path: Path,
) -> Iterator[Callable[[bool, str | None], tuple[TestClient, InterviewRepository]]]:
    db_path = tmp_path / "access_keys_test.db"
    repo = InterviewRepository(db_path)
    previous_overrides = app.dependency_overrides.copy()
    admin_rate_limiter.clear_all()

    def configure(require_access_key: bool = False, admin_secret: str | None = "super-secret-admin") -> tuple[
        TestClient, InterviewRepository
    ]:
        test_settings = Settings(
            ai_provider="mock",
            database_path=str(db_path),
            require_access_key=require_access_key,
            admin_secret=admin_secret,
        )
        app.dependency_overrides[get_settings] = lambda: test_settings
        app.dependency_overrides[get_repository] = lambda: repo
        return TestClient(app), repo

    try:
        yield configure
    finally:
        admin_rate_limiter.clear_all()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def test_dev_mode_allows_interview_endpoints_without_key(
    security_harness: Callable[[bool, str | None], tuple[TestClient, InterviewRepository]],
) -> None:
    client, _ = security_harness(False, "super-secret-admin")

    providers_res = client.get("/api/providers")
    assert providers_res.status_code == 200
    assert providers_res.json()["require_access_key"] is False

    plan_res = client.post("/api/plan", json={"study_guide": GUIDE, "config": CONFIG})
    assert plan_res.status_code == 200
    plan_body = plan_res.json()

    transcript = [{"role": "interviewer", "content": plan_body["opening_message"]}]
    turn_res = client.post(
        "/api/turn",
        json={
            "plan": plan_body["plan"],
            "config": CONFIG,
            "transcript": transcript,
            "candidate_answer": "The GIL serializes bytecode execution in CPython.",
        },
    )
    assert turn_res.status_code == 200

    eval_res = client.post(
        "/api/evaluation",
        json={
            "study_guide": GUIDE,
            "config": CONFIG,
            "plan": plan_body["plan"],
            "transcript": [
                *transcript,
                {"role": "candidate", "content": "The GIL serializes bytecode execution in CPython."},
            ],
        },
    )
    assert eval_res.status_code == 200


def test_enforced_mode_blocks_unauthenticated_requests_with_cors_and_allows_public_routes(
    security_harness: Callable[[bool, str | None], tuple[TestClient, InterviewRepository]],
) -> None:
    client, _ = security_harness(True, "super-secret-admin")

    origin_headers = {"Origin": "http://localhost:5173"}
    sample_plan = {
        "title": "Sample",
        "summary": "Summary",
        "focus_areas": ["Python"],
        "questions": ["What is the GIL?"],
        "estimated_turns": 1,
    }

    plan_res = client.post(
        "/api/plan",
        json={"study_guide": GUIDE, "config": CONFIG},
        headers=origin_headers,
    )
    assert plan_res.status_code == 401
    assert plan_res.headers.get("access-control-allow-origin") == "http://localhost:5173"

    turn_res = client.post(
        "/api/turn",
        json={
            "plan": sample_plan,
            "config": CONFIG,
            "transcript": [{"role": "interviewer", "content": "What is the GIL?"}],
            "candidate_answer": "A mutex.",
        },
        headers=origin_headers,
    )
    assert turn_res.status_code == 401
    assert turn_res.headers.get("access-control-allow-origin") == "http://localhost:5173"

    eval_res = client.post(
        "/api/evaluation",
        json={
            "study_guide": GUIDE,
            "config": CONFIG,
            "plan": sample_plan,
            "transcript": [
                {"role": "interviewer", "content": "What is the GIL?"},
                {"role": "candidate", "content": "A mutex."},
            ],
        },
        headers=origin_headers,
    )
    assert eval_res.status_code == 401
    assert eval_res.headers.get("access-control-allow-origin") == "http://localhost:5173"

    bad_key_res = client.post(
        "/api/plan",
        json={"study_guide": GUIDE, "config": CONFIG},
        headers={"X-Access-Key": "inai_not_a_real_key"},
    )
    assert bad_key_res.status_code == 401

    # Public routes stay open without an access key
    assert client.get("/api/health").status_code == 200
    providers_res = client.get("/api/providers")
    assert providers_res.status_code == 200
    assert providers_res.json()["require_access_key"] is True
    assert client.get("/api/study-guide/sections").status_code == 200
    assert client.get("/api/history/questions").status_code == 200
    assert client.get("/api/history/export").status_code == 200


def test_enforced_mode_key_lifecycle_limits_revocation_and_expiration(
    security_harness: Callable[[bool, str | None], tuple[TestClient, InterviewRepository]],
) -> None:
    client, repo = security_harness(True, "super-secret-admin")
    admin_headers = {"X-Admin-Secret": "super-secret-admin"}

    create_res = client.post(
        "/api/admin/keys",
        json={"label": "Maria", "max_uses": 1, "expires_in_days": 7},
        headers=admin_headers,
    )
    assert create_res.status_code == 200
    created = create_res.json()
    raw_key = created["raw_key"]
    key_id = created["id"]
    assert raw_key.startswith("inai_")

    key_headers = {"X-Access-Key": raw_key}

    # First session consumes uses_count == 1 on /api/plan, not on /turn or /evaluation
    plan_res = client.post("/api/plan", json={"study_guide": GUIDE, "config": CONFIG}, headers=key_headers)
    assert plan_res.status_code == 200
    plan_body = plan_res.json()

    transcript = [{"role": "interviewer", "content": plan_body["opening_message"]}]
    turn_res = client.post(
        "/api/turn",
        json={
            "plan": plan_body["plan"],
            "config": CONFIG,
            "transcript": transcript,
            "candidate_answer": "GIL coordinates CPython bytecode.",
        },
        headers=key_headers,
    )
    assert turn_res.status_code == 200

    eval_res = client.post(
        "/api/evaluation",
        json={
            "study_guide": GUIDE,
            "config": CONFIG,
            "plan": plan_body["plan"],
            "transcript": [
                *transcript,
                {"role": "candidate", "content": "GIL coordinates CPython bytecode."},
            ],
        },
        headers=key_headers,
    )
    assert eval_res.status_code == 200

    keys_after_one_session = client.get("/api/admin/keys", headers=admin_headers).json()
    assert keys_after_one_session[0]["uses_count"] == 1
    assert keys_after_one_session[0]["requests_used"] == 3

    # Second session exceeds max_uses=1
    second_plan = client.post("/api/plan", json={"study_guide": GUIDE, "config": CONFIG}, headers=key_headers)
    assert second_plan.status_code == 403

    # Unlimited / higher limit key can be revoked and re-activated
    unlimited_res = client.post(
        "/api/admin/keys",
        json={"label": "Unlimited User", "max_uses": None, "expires_in_days": None},
        headers=admin_headers,
    ).json()
    u_key_id = unlimited_res["id"]
    u_headers = {"X-Access-Key": unlimited_res["raw_key"]}

    assert client.post(f"/api/admin/keys/{u_key_id}/revoke", headers=admin_headers).status_code == 200
    revoked_plan = client.post("/api/plan", json={"study_guide": GUIDE, "config": CONFIG}, headers=u_headers)
    assert revoked_plan.status_code == 403

    assert client.post(f"/api/admin/keys/{u_key_id}/activate", headers=admin_headers).status_code == 200
    reactivated_plan = client.post("/api/plan", json={"study_guide": GUIDE, "config": CONFIG}, headers=u_headers)
    assert reactivated_plan.status_code == 200

    # Expired key is rejected with 403
    with Session(repo.engine) as db:
        row = db.exec(select(AccessKey).where(AccessKey.id == u_key_id)).one()
        row.expires_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        db.add(row)
        db.commit()

    expired_plan = client.post("/api/plan", json={"study_guide": GUIDE, "config": CONFIG}, headers=u_headers)
    assert expired_plan.status_code == 403

    # Key list never exposes raw_key or key_hash
    listed = client.get("/api/admin/keys", headers=admin_headers).json()
    assert len(listed) == 2
    for entry in listed:
        assert "raw_key" not in entry
        assert "key_hash" not in entry
        assert entry["id"] in {key_id, u_key_id}


def test_realtime_websocket_enforces_access_key(
    security_harness: Callable[[bool, str | None], tuple[TestClient, InterviewRepository]],
) -> None:
    client, _ = security_harness(True, "super-secret-admin")

    with client.websocket_connect("/api/realtime/ws") as ws:
        ws.send_json({"type": "setup", "provider": "mock", "study_guide": GUIDE, "config": CONFIG})
        event = ws.receive_json()
        assert event["type"] == "error"
        assert "access key" in event["message"].lower()
        with pytest.raises(WebSocketDisconnect) as exc_info:
            ws.receive_json()
        assert exc_info.value.code == 1008


def test_admin_endpoints_fail_closed_and_require_valid_secret(
    security_harness: Callable[[bool, str | None], tuple[TestClient, InterviewRepository]],
) -> None:
    disabled_client, _ = security_harness(True, None)
    res_disabled = disabled_client.get("/api/admin/keys", headers={"X-Admin-Secret": "anything"})
    assert res_disabled.status_code == 503
    assert "backend/.env" not in res_disabled.text
    assert "ADMIN_SECRET" not in res_disabled.text

    enabled_client, _ = security_harness(True, "top-secret-password")
    missing_res = enabled_client.get("/api/admin/keys")
    assert missing_res.status_code == 401
    assert "ADMIN_SECRET" not in missing_res.text

    wrong_res = enabled_client.get("/api/admin/keys", headers={"X-Admin-Secret": "wrong"})
    assert wrong_res.status_code == 401
    assert "ADMIN_SECRET" not in wrong_res.text

    verify_res = enabled_client.get("/api/admin/verify", headers={"X-Admin-Secret": "top-secret-password"})
    assert verify_res.status_code == 200
    assert verify_res.json() == {"authenticated": True, "require_access_key": True}

    missing_toggle = enabled_client.post(
        "/api/admin/keys/nonexistent/revoke",
        headers={"X-Admin-Secret": "top-secret-password"},
    )
    assert missing_toggle.status_code == 404


def test_admin_rate_limiting_blocks_after_failed_attempts(
    security_harness: Callable[[bool, str | None], tuple[TestClient, InterviewRepository]],
) -> None:
    client, _ = security_harness(True, "top-secret-password")

    # 3 failed attempts followed by valid secret succeeds and resets the counter
    for _ in range(3):
        res = client.get("/api/admin/verify", headers={"X-Admin-Secret": "wrong"})
        assert res.status_code == 401

    ok_res = client.get("/api/admin/verify", headers={"X-Admin-Secret": "top-secret-password"})
    assert ok_res.status_code == 200

    # 5 consecutive failures trigger lockout (429 with Retry-After)
    for _ in range(5):
        res = client.get("/api/admin/verify", headers={"X-Admin-Secret": "wrong"})
        assert res.status_code == 401

    locked_res = client.get("/api/admin/verify", headers={"X-Admin-Secret": "top-secret-password"})
    assert locked_res.status_code == 429
    assert int(locked_res.headers["Retry-After"]) >= 1
