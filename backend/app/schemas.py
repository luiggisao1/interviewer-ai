import json
from enum import Enum
from typing import Literal

from fastapi import WebSocket
from pydantic import BaseModel, Field, field_validator


class Role(str, Enum):
    software_engineer = "Software Engineer"
    frontend_engineer = "Frontend Engineer"
    backend_engineer = "Backend Engineer"
    data_scientist = "Data Scientist"
    product_manager = "Product Manager"
    custom = "Custom Role"


class InterviewMode(str, Enum):
    technical = "Technical"
    behavioral = "Behavioral"
    mixed = "Mixed"


class Difficulty(str, Enum):
    junior = "Junior"
    mid = "Mid-level"
    senior = "Senior"


class StorageMode(str, Enum):
    all = "all"
    senior_only = "senior_only"
    none = "none"


class InterviewConfig(BaseModel):
    role: Role
    custom_role: str = Field(default="", max_length=100)
    mode: InterviewMode
    difficulty: Difficulty
    duration_minutes: int = Field(ge=5, le=60)
    custom_instructions: str = Field(default="", max_length=2000)
    provider: str | None = Field(default=None, max_length=50)
    evaluation_provider: str | None = Field(default=None, max_length=50)
    candidate_name: str = Field(default="", max_length=100)
    storage_mode: StorageMode = Field(default=StorageMode.all)
    study_guide_section: str = Field(default="", max_length=100)

    @field_validator("candidate_name", "study_guide_section", mode="before")
    @classmethod
    def strip_optional_text(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value).strip()


class PlanRequest(BaseModel):
    study_guide: str = Field(min_length=20, max_length=30000)
    config: InterviewConfig

    @field_validator("study_guide")
    @classmethod
    def guide_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Study guide cannot be blank")
        return value.strip()


class InterviewPlan(BaseModel):
    title: str
    summary: str
    focus_areas: list[str] = Field(min_length=1)
    questions: list[str] = Field(min_length=1)
    estimated_turns: int = Field(ge=1)


class PlanResponse(BaseModel):
    plan: InterviewPlan
    opening_message: str
    provider: str


class Message(BaseModel):
    role: str = Field(pattern="^(interviewer|candidate)$")
    content: str = Field(min_length=1, max_length=10000)


class NextTurnRequest(BaseModel):
    plan: InterviewPlan
    config: InterviewConfig
    transcript: list[Message] = Field(default_factory=list, max_length=100)
    candidate_answer: str = Field(min_length=1, max_length=10000)


class NextTurnResponse(BaseModel):
    interviewer_message: str
    is_complete: bool
    turn_number: int


class RealtimeCallRequest(BaseModel):
    sdp: str = Field(min_length=20, max_length=100000)
    study_guide: str = Field(min_length=20, max_length=30000)
    config: InterviewConfig
    plan: InterviewPlan


class EvaluationRequest(BaseModel):
    study_guide: str = Field(min_length=20, max_length=30000)
    config: InterviewConfig
    plan: InterviewPlan
    transcript: list[Message] = Field(min_length=1, max_length=100)


class AnswerPair(BaseModel):
    number: int
    question: str
    candidate_answer: str


class EvaluationContext(BaseModel):
    system_prompt: str
    payload: dict[str, object]
    answer_pairs: list[AnswerPair]

    @property
    def count(self) -> int:
        return len(self.answer_pairs)

    @property
    def payload_json(self) -> str:
        return json.dumps(self.payload)


class LiveSessionUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    input_cost: float = 0.0
    output_cost: float = 0.0
    total_cost: float = 0.0


class LiveSessionResult(BaseModel):
    transcript: list[Message] = Field(default_factory=list)
    interviewer_turns: str = ""
    usage: LiveSessionUsage = Field(default_factory=LiveSessionUsage)


class SeniorAnswer(BaseModel):
    question: str = Field(default="Interview question")
    candidate_answer: str = Field(default="")
    senior_answer: str = Field(default="")
    why_stronger: str = Field(default="")


class Evaluation(BaseModel):
    overall_score: int = Field(
        default=50,
        ge=0,
        le=100,
        description="Overall score as an integer percentage from 0 to 100 based on weighted rubric",
    )
    summary: str = Field(default="Interview evaluation completed.")
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    study_guide_feedback: list[str] = Field(default_factory=list)
    technical_feedback: list[str] = Field(default_factory=list)
    senior_answers: list[SeniorAnswer] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)


class CreatePlanOutputFormat(BaseModel):
    plan: InterviewPlan
    opening_message: str

class NextTurnOutputFormat(BaseModel):
    interviewer_message: str
    is_complete: bool

class EvaluationResponse(BaseModel):
    evaluation: Evaluation
    provider: str
    saved_session_id: str | None = None
    storage_mode: StorageMode = StorageMode.all


class StoredResponseItem(BaseModel):
    id: int
    session_id: str
    candidate_name: str
    storage_mode: StorageMode
    role: str
    difficulty: str
    mode: str
    study_guide_section: str
    plan_title: str
    provider: str
    overall_score: int | None = None
    question_order: int
    question: str
    candidate_answer: str | None = None
    senior_answer: str
    why_stronger: str
    created_at: str


class StoredSessionSummary(BaseModel):
    id: str
    candidate_name: str
    storage_mode: StorageMode
    role: str
    difficulty: str
    mode: str
    study_guide_section: str
    plan_title: str
    provider: str
    overall_score: int | None = None
    summary: str
    response_count: int
    created_at: str


class StoredSessionDetail(StoredSessionSummary):
    responses: list[StoredResponseItem] = Field(default_factory=list)


class QuestionAnswerEntry(BaseModel):
    response_id: int
    session_id: str
    candidate_name: str
    storage_mode: StorageMode
    difficulty: str
    role: str
    study_guide_section: str
    overall_score: int | None = None
    candidate_answer: str | None = None
    senior_answer: str
    why_stronger: str
    created_at: str


class QuestionGroup(BaseModel):
    question: str
    study_guide_section: str
    answer_count: int
    entries: list[QuestionAnswerEntry] = Field(default_factory=list)


class CreateAccessKeyRequest(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    max_uses: int | None = Field(default=5, ge=1, le=10000)
    expires_in_days: int | None = Field(default=30, ge=1, le=3650)

    @field_validator("label")
    @classmethod
    def label_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Label cannot be blank")
        return cleaned


class AccessKeySummary(BaseModel):
    id: str
    label: str
    key_prefix: str
    is_active: bool
    max_uses: int | None = None
    uses_count: int
    requests_used: int
    expires_at: str | None = None
    last_used_at: str | None = None
    created_at: str


class CreateAccessKeyResponse(AccessKeySummary):
    raw_key: str


class RealtimeSessionStarted(BaseModel):
    type: Literal["session_started"] = "session_started"
    provider: str
    model: str


class RealtimeInterrupted(BaseModel):
    type: Literal["interrupted"] = "interrupted"


class RealtimeTranscriptChunk(BaseModel):
    type: Literal["transcript_chunk"] = "transcript_chunk"
    role: Literal["interviewer", "candidate"]
    content: str


class RealtimeTranscriptFinal(BaseModel):
    type: Literal["transcript_final"] = "transcript_final"
    role: Literal["interviewer", "candidate"]
    content: str


class RealtimeError(BaseModel):
    type: Literal["error"] = "error"
    message: str


class RealtimeSessionCompleted(BaseModel):
    type: Literal["session_completed"] = "session_completed"
    transcript: list[Message]


type RealtimeServerEvent = (
    RealtimeSessionStarted
    | RealtimeInterrupted
    | RealtimeTranscriptChunk
    | RealtimeTranscriptFinal
    | RealtimeError
    | RealtimeSessionCompleted
)


async def send_realtime_event(websocket: WebSocket, event: RealtimeServerEvent) -> None:
    await websocket.send_json(event.model_dump(mode="json"))
