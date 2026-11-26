import uuid
from datetime import datetime, timezone

from sqlmodel import Field, Relationship, SQLModel


class InterviewSession(SQLModel, table=True):
    __tablename__ = "interview_sessions"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    candidate_name: str = Field(index=True, max_length=100)
    storage_mode: str = Field(index=True, max_length=20)
    role: str = Field(max_length=100)
    difficulty: str = Field(max_length=50)
    mode: str = Field(max_length=50)
    study_guide_section: str = Field(default="", index=True, max_length=100)
    plan_title: str = Field(default="", max_length=300)
    provider: str = Field(default="", max_length=50)
    overall_score: int | None = Field(default=None)
    summary: str = Field(default="")
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        index=True,
    )

    responses: list["InterviewResponse"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "order_by": "InterviewResponse.question_order",
        },
    )


class InterviewResponse(SQLModel, table=True):
    __tablename__ = "interview_responses"

    id: int | None = Field(default=None, primary_key=True)
    session_id: str = Field(foreign_key="interview_sessions.id", index=True)
    question_order: int
    question: str
    candidate_answer: str | None = Field(default=None)
    senior_answer: str = Field(default="")
    why_stronger: str = Field(default="")
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
    )

    session: InterviewSession | None = Relationship(back_populates="responses")


class AccessKey(SQLModel, table=True):
    __tablename__ = "access_keys"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    label: str = Field(max_length=100)
    key_prefix: str = Field(max_length=24, index=True)
    key_hash: str = Field(unique=True, index=True, max_length=64)
    is_active: bool = Field(default=True, index=True)
    max_uses: int | None = Field(default=None)
    uses_count: int = Field(default=0)
    requests_used: int = Field(default=0)
    expires_at: str | None = Field(default=None)
    last_used_at: str | None = Field(default=None)
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        index=True,
    )
