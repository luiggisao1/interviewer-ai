import json
from enum import Enum
from typing import Any

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


class InterviewConfig(BaseModel):
    role: Role
    custom_role: str = Field(default="", max_length=100)
    mode: InterviewMode
    difficulty: Difficulty
    duration_minutes: int = Field(ge=5, le=60)
    custom_instructions: str = Field(default="", max_length=2000)
    provider: str | None = Field(default=None, max_length=50)


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
    payload: dict[str, Any]
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
