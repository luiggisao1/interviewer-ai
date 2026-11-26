import re
from abc import ABC, abstractmethod

from fastapi import WebSocket

from app.schemas import (
    AnswerPair,
    Evaluation,
    EvaluationContext,
    EvaluationRequest,
    InterviewConfig,
    InterviewPlan,
    Message,
    NextTurnRequest,
    PlanRequest,
)
from app.services.prompts import build_evaluation_prompt

_STRONG_CLOSING_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\b(?:that|this)\s+concludes\s+(?:our|the|this)\s+(?:practice\s+)?(?:interview|session)\b",
        r"\b(?:the|our|this)\s+(?:practice\s+)?(?:interview|session)\s+is\s+(?:now\s+)?(?:concluded|complete|completed|finished|over)\b",
        r"\b(?:that|this)\s+wraps\s+up\s+(?:our|the|this)\s+(?:practice\s+)?(?:interview|session)\b",
        r"\b(?:the\s+)?end\s+of\s+(?:our|the|this)\s+(?:practice\s+)?(?:interview|session)\b",
        r"\bwe(?:'ve|\s+have)\s+(?:completed|finished|covered)\s+all\s+(?:of\s+)?(?:the|our|my)\s+(?:planned\s+)?questions\b",
        r"\bthat(?:'s|\s+is)\s+all\s+(?:of\s+)?(?:the|our|my)\s+(?:planned\s+)?questions\b",
        r"\bgoodbye\b",
        r"\bfarewell\b",
        r"\bbye\s+for\s+now\b",
    )
)

_SOFT_FAREWELL_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bbye\b",
        r"\btake\s+care\b",
        r"\bgood\s+luck\b",
        r"\bhave\s+a\s+(?:great|good|wonderful|nice)\s+(?:day|evening|weekend|rest)\b",
        r"\bthank(?:s|\s+you)\s+for\s+(?:your\s+time\s+today|joining\s+(?:me|us)\s+today|participating\s+in\s+(?:this|the)\s+interview)\b",
        r"\b(?:debrief|evaluation|feedback|scorecard)\s+(?:is\s+starting|will\s+start|will\s+begin|is\s+ready)\b",
    )
)


class AIProvider(ABC):
    recruiter_name: str = "Iris"

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    def supports_realtime_audio(self) -> bool:
        return False

    async def handle_realtime_audio_session(
        self,
        websocket: WebSocket,
        plan: InterviewPlan,
        config: InterviewConfig,
        study_guide: str,
    ) -> list[Message]:
        raise NotImplementedError(f"Realtime voice streaming is not supported by {self.name}.")

    @property
    def create_plan_system_prompt(self) -> str:
        return (
            "Create a practical interview plan based only on the supplied guide. "
            "Calculate estimated_turns based on duration_minutes: plan roughly 1 question "
            "every 2.5 minutes (e.g. 10 min = 4 turns, 15 min = 5-6 turns, 20 min = 6-8 turns). "
            "Ensure len(questions) exactly matches estimated_turns. "
            "Keep questions concise. Follow custom instructions when safe. "
            "Do not provide any additional information or context. "
            f"Create a welcome message introducing yourself as {self.recruiter_name} and the interview plan."
        )

    @property
    def next_turn_system_prompt(self) -> str:
        return (
            "Act as a supportive but realistic interviewer. Briefly react, then ask one planned question. "
            "When all estimated turns or planned questions are answered, deliver a single brief closing "
            "statement with no further questions and set is_complete to true. Do not provide evaluation yet."
        )

    @staticmethod
    def is_closing_interviewer_message(text: str, candidate_turns: int, total_questions: int) -> bool:
        """Detect when an interviewer utterance clearly closes the interview with no follow-up question."""
        if candidate_turns < 1 or not text or not text.strip() or "?" in text:
            return False
        normalized = " ".join(text.split())
        if any(pattern.search(normalized) for pattern in _STRONG_CLOSING_PATTERNS):
            return True
        if candidate_turns >= max(1, total_questions):
            return any(pattern.search(normalized) for pattern in _SOFT_FAREWELL_PATTERNS)
        return False

    @staticmethod
    def count_answered_turns(transcript: list[Message], candidate_answer: str) -> int:
        """Count answered candidate turns without double-counting if transcript already ends with candidate_answer."""
        candidate_count = sum(1 for item in transcript if item.role == "candidate")
        already_included = (
            bool(transcript)
            and transcript[-1].role == "candidate"
            and transcript[-1].content.strip() == candidate_answer.strip()
        )
        return candidate_count if already_included else candidate_count + 1

    @staticmethod
    def build_answer_pairs(
        transcript: list[Message],
        default_question: str = "Technical Interview Question",
    ) -> list[AnswerPair]:
        pairs: list[AnswerPair] = []
        last_question = ""
        last_role = None

        for message in transcript:
            content = message.content.strip()
            if not content:
                continue

            if message.role == "interviewer":
                last_question = content
                last_role = "interviewer"
            elif message.role == "candidate":
                active_q = last_question or default_question

                # Merge consecutive candidate messages for the same question instead of duplicating
                if last_role == "candidate" and pairs:
                    prev_answer = pairs[-1].candidate_answer.strip()
                    if content != prev_answer:
                        pairs[-1].candidate_answer = f"{prev_answer} {content}".strip()
                else:
                    pairs.append(
                        AnswerPair(
                            number=len(pairs) + 1,
                            question=active_q,
                            candidate_answer=content,
                        )
                    )
                last_role = "candidate"

        return pairs

    def prepare_evaluation_prompt(self, request: EvaluationRequest) -> EvaluationContext:
        default_q = request.plan.questions[0] if request.plan.questions else "Technical Interview Question"
        answer_pairs = self.build_answer_pairs(request.transcript, default_q)

        payload = request.model_dump(mode="json")
        payload["answer_pairs"] = [p.model_dump() for p in answer_pairs]
        system = build_evaluation_prompt(count=len(answer_pairs))
        return EvaluationContext(
            system_prompt=system,
            payload=payload,
            answer_pairs=answer_pairs,
        )

    @abstractmethod
    async def create_plan(self, request: PlanRequest) -> tuple[InterviewPlan, str]: ...

    @abstractmethod
    async def next_turn(self, request: NextTurnRequest) -> tuple[str, bool]: ...

    @abstractmethod
    async def evaluate(self, request: EvaluationRequest) -> Evaluation: ...
