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
            "Mark complete when estimated turns are answered. Do not provide evaluation yet."
        )

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
