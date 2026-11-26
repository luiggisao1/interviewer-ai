import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event, exists, func, or_
from sqlalchemy.orm import aliased
from sqlmodel import Session, SQLModel, col, select

from app.models import AccessKey, InterviewResponse, InterviewSession
from app.schemas import (
    AccessKeySummary,
    CreateAccessKeyResponse,
    Evaluation,
    InterviewConfig,
    InterviewPlan,
    QuestionAnswerEntry,
    QuestionGroup,
    Role,
    StorageMode,
    StoredResponseItem,
    StoredSessionDetail,
    StoredSessionSummary,
)

_engine_cache: dict[str, Engine] = {}


def hash_access_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.strip().encode("utf-8")).hexdigest()


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _normalize_database_url(db_url_or_path: Path | str) -> str:
    if isinstance(db_url_or_path, str) and "://" in db_url_or_path:
        return db_url_or_path
    return f"sqlite:///{Path(db_url_or_path)}"


def get_engine(database_url: str) -> Engine:
    cached = _engine_cache.get(database_url)
    if cached is not None:
        return cached

    if database_url.startswith("sqlite:///"):
        raw_path = database_url[len("sqlite:///") :].split("?", 1)[0]
        if raw_path and raw_path != ":memory:":
            Path(raw_path).parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(database_url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def _configure_sqlite(dbapi_connection: Any, _connection_record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()
    else:
        engine = create_engine(database_url, pool_pre_ping=True)

    _engine_cache[database_url] = engine
    return engine


class InterviewRepository:
    """SQLModel ORM persistence layer for interview sessions and evaluated Q&A responses."""

    def __init__(self, db_path_or_url: Path | str) -> None:
        self.database_url = _normalize_database_url(db_path_or_url)
        self.engine = get_engine(self.database_url)
        self.init_db()

    def init_db(self) -> None:
        SQLModel.metadata.create_all(self.engine)

    def save_evaluation(
        self,
        *,
        config: InterviewConfig,
        plan: InterviewPlan,
        evaluation: Evaluation,
        provider: str,
    ) -> str | None:
        if config.storage_mode == StorageMode.none:
            return None

        created_at = datetime.now(timezone.utc).isoformat()
        role_label = (
            config.custom_role.strip()
            if config.role == Role.custom and config.custom_role.strip()
            else config.role.value
        )
        candidate_name = config.candidate_name.strip() or "Anonymous"
        is_full = config.storage_mode == StorageMode.all

        session_obj = InterviewSession(
            candidate_name=candidate_name,
            storage_mode=config.storage_mode.value,
            role=role_label,
            difficulty=config.difficulty.value,
            mode=config.mode.value,
            study_guide_section=config.study_guide_section.strip(),
            plan_title=plan.title,
            provider=provider,
            overall_score=evaluation.overall_score if is_full else None,
            summary=evaluation.summary if is_full else "",
            created_at=created_at,
            responses=[
                InterviewResponse(
                    question_order=idx,
                    question=item.question,
                    candidate_answer=item.candidate_answer if is_full else None,
                    senior_answer=item.senior_answer,
                    why_stronger=item.why_stronger,
                    created_at=created_at,
                )
                for idx, item in enumerate(evaluation.senior_answers, start=1)
            ],
        )

        with Session(self.engine) as db:
            db.add(session_obj)
            db.commit()
            return session_obj.id

    @staticmethod
    def _session_filter_conditions(
        *,
        candidate_name: str | None = None,
        section: str | None = None,
        storage_mode: StorageMode | None = None,
    ) -> list[Any]:
        conditions: list[Any] = []
        if candidate_name and candidate_name.strip():
            conditions.append(
                func.lower(col(InterviewSession.candidate_name)) == candidate_name.strip().lower()
            )
        if section and section.strip():
            conditions.append(
                func.lower(col(InterviewSession.study_guide_section)) == section.strip().lower()
            )
        if storage_mode is not None and storage_mode != StorageMode.none:
            conditions.append(col(InterviewSession.storage_mode) == storage_mode.value)
        return conditions

    @staticmethod
    def _to_session_summary(record: InterviewSession, response_count: int) -> StoredSessionSummary:
        return StoredSessionSummary(
            id=record.id,
            candidate_name=record.candidate_name,
            storage_mode=StorageMode(record.storage_mode),
            role=record.role,
            difficulty=record.difficulty,
            mode=record.mode,
            study_guide_section=record.study_guide_section,
            plan_title=record.plan_title,
            provider=record.provider,
            overall_score=record.overall_score,
            summary=record.summary,
            response_count=response_count,
            created_at=record.created_at,
        )

    @staticmethod
    def _to_response_item(
        response: InterviewResponse,
        session: InterviewSession,
    ) -> StoredResponseItem:
        assert response.id is not None
        return StoredResponseItem(
            id=response.id,
            session_id=response.session_id,
            candidate_name=session.candidate_name,
            storage_mode=StorageMode(session.storage_mode),
            role=session.role,
            difficulty=session.difficulty,
            mode=session.mode,
            study_guide_section=session.study_guide_section,
            plan_title=session.plan_title,
            provider=session.provider,
            overall_score=session.overall_score,
            question_order=response.question_order,
            question=response.question,
            candidate_answer=response.candidate_answer,
            senior_answer=response.senior_answer,
            why_stronger=response.why_stronger,
            created_at=response.created_at,
        )

    def list_sessions(
        self,
        *,
        candidate_name: str | None = None,
        section: str | None = None,
        storage_mode: StorageMode | None = None,
        search: str | None = None,
    ) -> list[StoredSessionSummary]:
        conditions = self._session_filter_conditions(
            candidate_name=candidate_name,
            section=section,
            storage_mode=storage_mode,
        )
        if search and search.strip():
            pattern = f"%{_escape_like(search.strip().lower())}%"
            resp_alias = aliased(InterviewResponse)
            response_match = exists(
                select(resp_alias.id).where(
                    col(resp_alias.session_id) == col(InterviewSession.id),
                    or_(
                        func.lower(col(resp_alias.question)).like(pattern, escape="\\"),
                        func.lower(func.coalesce(col(resp_alias.candidate_answer), "")).like(
                            pattern, escape="\\"
                        ),
                        func.lower(col(resp_alias.senior_answer)).like(pattern, escape="\\"),
                    ),
                )
            )
            conditions.append(
                or_(
                    func.lower(col(InterviewSession.candidate_name)).like(pattern, escape="\\"),
                    func.lower(col(InterviewSession.plan_title)).like(pattern, escape="\\"),
                    func.lower(col(InterviewSession.study_guide_section)).like(pattern, escape="\\"),
                    response_match,
                )
            )

        stmt = (
            select(InterviewSession, func.count(col(InterviewResponse.id)))
            .outerjoin(
                InterviewResponse,
                col(InterviewResponse.session_id) == col(InterviewSession.id),
            )
            .group_by(col(InterviewSession.id))
            .order_by(col(InterviewSession.created_at).desc())
        )
        if conditions:
            stmt = stmt.where(*conditions)

        with Session(self.engine) as db:
            rows = db.exec(stmt).all()
            return [
                self._to_session_summary(record, int(response_count))
                for record, response_count in rows
            ]

    def get_session(self, session_id: str) -> StoredSessionDetail | None:
        with Session(self.engine) as db:
            record = db.get(InterviewSession, session_id)
            if record is None:
                return None
            responses = [self._to_response_item(resp, record) for resp in record.responses]
            summary = self._to_session_summary(record, response_count=len(responses))
            return StoredSessionDetail(**summary.model_dump(), responses=responses)

    def list_responses(
        self,
        *,
        candidate_name: str | None = None,
        section: str | None = None,
        storage_mode: StorageMode | None = None,
        search: str | None = None,
    ) -> list[StoredResponseItem]:
        conditions = self._session_filter_conditions(
            candidate_name=candidate_name,
            section=section,
            storage_mode=storage_mode,
        )
        if search and search.strip():
            pattern = f"%{_escape_like(search.strip().lower())}%"
            conditions.append(
                or_(
                    func.lower(col(InterviewSession.candidate_name)).like(pattern, escape="\\"),
                    func.lower(col(InterviewSession.plan_title)).like(pattern, escape="\\"),
                    func.lower(col(InterviewSession.study_guide_section)).like(pattern, escape="\\"),
                    func.lower(col(InterviewResponse.question)).like(pattern, escape="\\"),
                    func.lower(func.coalesce(col(InterviewResponse.candidate_answer), "")).like(
                        pattern, escape="\\"
                    ),
                    func.lower(col(InterviewResponse.senior_answer)).like(pattern, escape="\\"),
                )
            )

        stmt = (
            select(InterviewResponse, InterviewSession)
            .join(
                InterviewSession,
                col(InterviewResponse.session_id) == col(InterviewSession.id),
            )
            .order_by(
                col(InterviewResponse.created_at).desc(),
                col(InterviewResponse.question_order).asc(),
            )
        )
        if conditions:
            stmt = stmt.where(*conditions)

        with Session(self.engine) as db:
            rows = db.exec(stmt).all()
            return [self._to_response_item(resp, session) for resp, session in rows]

    def list_grouped_by_question(
        self,
        *,
        candidate_name: str | None = None,
        section: str | None = None,
        storage_mode: StorageMode | None = None,
        search: str | None = None,
    ) -> list[QuestionGroup]:
        items = self.list_responses(
            candidate_name=candidate_name,
            section=section,
            storage_mode=storage_mode,
            search=search,
        )
        buckets: dict[str, dict[str, object]] = {}

        for item in items:
            normalized_key = " ".join(item.question.strip().lower().split())
            entry = QuestionAnswerEntry(
                response_id=item.id,
                session_id=item.session_id,
                candidate_name=item.candidate_name,
                storage_mode=item.storage_mode,
                difficulty=item.difficulty,
                role=item.role,
                study_guide_section=item.study_guide_section,
                overall_score=item.overall_score,
                candidate_answer=item.candidate_answer,
                senior_answer=item.senior_answer,
                why_stronger=item.why_stronger,
                created_at=item.created_at,
            )
            if normalized_key not in buckets:
                buckets[normalized_key] = {
                    "question": item.question.strip(),
                    "study_guide_section": item.study_guide_section,
                    "newest": item.created_at,
                    "entries": [entry],
                }
            else:
                bucket = buckets[normalized_key]
                entries = bucket["entries"]
                assert isinstance(entries, list)
                entries.append(entry)
                if item.created_at > str(bucket["newest"]):
                    bucket["newest"] = item.created_at
                if not bucket["study_guide_section"] and item.study_guide_section:
                    bucket["study_guide_section"] = item.study_guide_section

        records: list[tuple[str, QuestionGroup]] = []
        for bucket in buckets.values():
            entries = bucket["entries"]
            assert isinstance(entries, list)
            group = QuestionGroup(
                question=str(bucket["question"]),
                study_guide_section=str(bucket["study_guide_section"]),
                answer_count=len(entries),
                entries=entries,
            )
            records.append((str(bucket["newest"]), group))

        records.sort(key=lambda pair: pair[0], reverse=True)
        records.sort(key=lambda pair: pair[1].answer_count, reverse=True)
        return [group for _, group in records]

    def list_candidates(self) -> list[str]:
        with Session(self.engine) as db:
            rows = db.exec(select(InterviewSession.candidate_name).distinct()).all()
        return sorted((str(name) for name in rows), key=str.lower)

    def list_sections(self) -> list[str]:
        with Session(self.engine) as db:
            rows = db.exec(
                select(InterviewSession.study_guide_section)
                .where(col(InterviewSession.study_guide_section) != "")
                .distinct()
            ).all()
        return sorted((str(sec) for sec in rows), key=str.lower)

    def delete_session(self, session_id: str) -> bool:
        with Session(self.engine) as db:
            record = db.get(InterviewSession, session_id)
            if record is None:
                return False
            db.delete(record)
            db.commit()
            return True

    @staticmethod
    def _to_access_key_summary(record: AccessKey) -> AccessKeySummary:
        return AccessKeySummary(
            id=record.id,
            label=record.label,
            key_prefix=record.key_prefix,
            is_active=record.is_active,
            max_uses=record.max_uses,
            uses_count=record.uses_count,
            requests_used=record.requests_used,
            expires_at=record.expires_at,
            last_used_at=record.last_used_at,
            created_at=record.created_at,
        )

    def create_access_key(
        self,
        *,
        label: str,
        max_uses: int | None = None,
        expires_in_days: int | None = None,
    ) -> CreateAccessKeyResponse:
        raw_key = f"inai_{secrets.token_urlsafe(24)}"
        key_prefix = f"{raw_key[:12]}..."
        key_hash = hash_access_key(raw_key)
        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(days=expires_in_days)).isoformat() if expires_in_days is not None else None

        record = AccessKey(
            label=label.strip(),
            key_prefix=key_prefix,
            key_hash=key_hash,
            is_active=True,
            max_uses=max_uses,
            uses_count=0,
            requests_used=0,
            expires_at=expires_at,
            created_at=now.isoformat(),
        )
        with Session(self.engine) as db:
            db.add(record)
            db.commit()
            db.refresh(record)
            summary = self._to_access_key_summary(record)

        return CreateAccessKeyResponse(**summary.model_dump(), raw_key=raw_key)

    def list_access_keys(self) -> list[AccessKeySummary]:
        stmt = select(AccessKey).order_by(col(AccessKey.created_at).desc())
        with Session(self.engine) as db:
            records = db.exec(stmt).all()
            return [self._to_access_key_summary(record) for record in records]

    def set_access_key_active(self, key_id: str, *, is_active: bool) -> AccessKeySummary | None:
        with Session(self.engine) as db:
            record = db.get(AccessKey, key_id)
            if record is None:
                return None
            record.is_active = is_active
            db.add(record)
            db.commit()
            db.refresh(record)
            return self._to_access_key_summary(record)

    def validate_and_consume_access_key(
        self,
        raw_key: str | None,
        *,
        consume_session: bool = False,
    ) -> tuple[bool, int, str]:
        if not raw_key or not raw_key.strip():
            return False, 401, "An access key is required to run interviews."

        key_hash = hash_access_key(raw_key)
        now = datetime.now(timezone.utc)
        with Session(self.engine) as db:
            record = db.exec(select(AccessKey).where(col(AccessKey.key_hash) == key_hash)).first()
            if record is None:
                return False, 401, "Invalid access key."
            if not record.is_active:
                return False, 403, "This access key has been revoked."
            if record.expires_at:
                expires_dt = datetime.fromisoformat(record.expires_at)
                if expires_dt.tzinfo is None:
                    expires_dt = expires_dt.replace(tzinfo=timezone.utc)
                if expires_dt <= now:
                    return False, 403, "This access key has expired."
            if record.max_uses is not None:
                if consume_session and record.uses_count >= record.max_uses:
                    return False, 403, "This access key has reached its interview session limit."
                max_requests = max(25, record.max_uses * 25)
                if record.requests_used >= max_requests:
                    return False, 403, "This access key has reached its request limit."

            record.requests_used += 1
            if consume_session:
                record.uses_count += 1
            record.last_used_at = now.isoformat()
            db.add(record)
            db.commit()

        return True, 200, "ok"
