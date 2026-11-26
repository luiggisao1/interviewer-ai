from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import get_settings
from app.database import InterviewRepository
from app.routers.api import get_repository

PROTECTED_INTERVIEW_PATHS = frozenset(
    {
        "/api/plan",
        "/api/turn",
        "/api/evaluation",
        "/api/realtime/call",
    }
)


class AccessKeyMiddleware:
    """Enforces X-Access-Key on protected LLM endpoints when REQUIRE_ACCESS_KEY is true."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope.get("type") != "http"
            or scope.get("method") == "OPTIONS"
            or scope.get("path") not in PROTECTED_INTERVIEW_PATHS
        ):
            await self.app(scope, receive, send)
            return

        fastapi_app = scope.get("app")
        overrides = getattr(fastapi_app, "dependency_overrides", {})
        settings_provider = overrides.get(get_settings, get_settings)
        settings = settings_provider()

        if not settings.require_access_key:
            await self.app(scope, receive, send)
            return

        repo_provider = overrides.get(get_repository)
        repo = repo_provider() if repo_provider is not None else InterviewRepository(settings.resolved_database_url)

        raw_key: str | None = None
        for header_name, header_value in scope.get("headers", ()):
            if header_name.lower() == b"x-access-key":
                raw_key = header_value.decode("latin-1")
                break

        ok, status_code, message = repo.validate_and_consume_access_key(
            raw_key,
            consume_session=(scope.get("path") == "/api/plan"),
        )
        if not ok:
            response = JSONResponse({"detail": message}, status_code=status_code)
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
