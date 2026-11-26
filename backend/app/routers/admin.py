import hmac
import math
import threading
import time
from collections import deque

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.config import Settings, get_settings
from app.database import InterviewRepository
from app.routers.api import get_repository
from app.schemas import AccessKeySummary, CreateAccessKeyRequest, CreateAccessKeyResponse

ADMIN_MAX_FAILED_ATTEMPTS = 5
ADMIN_LOCKOUT_WINDOW_SECONDS = 15 * 60


class AdminAuthRateLimiter:
    """In-memory per-IP sliding window limiter for failed admin auth attempts."""

    def __init__(
        self,
        max_attempts: int = ADMIN_MAX_FAILED_ATTEMPTS,
        window_seconds: int = ADMIN_LOCKOUT_WINDOW_SECONDS,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._failures: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, entries: deque[float], now: float) -> None:
        cutoff = now - self.window_seconds
        while entries and entries[0] <= cutoff:
            entries.popleft()

    def check_locked(self, client_ip: str) -> int | None:
        now = time.monotonic()
        with self._lock:
            entries = self._failures.get(client_ip)
            if not entries:
                return None
            self._prune(entries, now)
            if len(entries) >= self.max_attempts:
                remaining = math.ceil((entries[0] + self.window_seconds) - now)
                return max(1, int(remaining))
            if not entries:
                self._failures.pop(client_ip, None)
            return None

    def record_failure(self, client_ip: str) -> None:
        now = time.monotonic()
        with self._lock:
            entries = self._failures.setdefault(client_ip, deque())
            self._prune(entries, now)
            entries.append(now)

    def reset(self, client_ip: str) -> None:
        with self._lock:
            self._failures.pop(client_ip, None)

    def clear_all(self) -> None:
        with self._lock:
            self._failures.clear()


admin_rate_limiter = AdminAuthRateLimiter()


def _get_client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def verify_admin(
    request: Request,
    x_admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
    config: Settings = Depends(get_settings),
) -> None:
    expected = (config.admin_secret or "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Admin access is currently disabled.",
        )

    client_ip = _get_client_ip(request)
    retry_after = admin_rate_limiter.check_locked(client_ip)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    provided = (x_admin_secret or "").strip()
    if not provided or not hmac.compare_digest(provided, expected):
        admin_rate_limiter.record_failure(client_ip)
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    admin_rate_limiter.reset(client_ip)


router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(verify_admin)],
)


@router.get("/verify")
async def verify_admin_session(config: Settings = Depends(get_settings)) -> dict[str, bool]:
    return {"authenticated": True, "require_access_key": config.require_access_key}


@router.get("/keys", response_model=list[AccessKeySummary])
async def list_keys(
    repo: InterviewRepository = Depends(get_repository),
) -> list[AccessKeySummary]:
    return repo.list_access_keys()


@router.post("/keys", response_model=CreateAccessKeyResponse)
async def create_key(
    request: CreateAccessKeyRequest,
    repo: InterviewRepository = Depends(get_repository),
) -> CreateAccessKeyResponse:
    return repo.create_access_key(
        label=request.label,
        max_uses=request.max_uses,
        expires_in_days=request.expires_in_days,
    )


@router.post("/keys/{key_id}/revoke", response_model=AccessKeySummary)
async def revoke_key(
    key_id: str,
    repo: InterviewRepository = Depends(get_repository),
) -> AccessKeySummary:
    updated = repo.set_access_key_active(key_id, is_active=False)
    if updated is None:
        raise HTTPException(status_code=404, detail="Access key not found.")
    return updated


@router.post("/keys/{key_id}/activate", response_model=AccessKeySummary)
async def activate_key(
    key_id: str,
    repo: InterviewRepository = Depends(get_repository),
) -> AccessKeySummary:
    updated = repo.set_access_key_active(key_id, is_active=True)
    if updated is None:
        raise HTTPException(status_code=404, detail="Access key not found.")
    return updated
