from abc import ABC, abstractmethod

from app.schemas import (
    Evaluation,
    EvaluationRequest,
    InterviewPlan,
    NextTurnRequest,
    PlanRequest,
)


class AIProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    def create_plan_system_prompt(self) -> str:
        return (
            "Create a practical interview plan based only on the supplied guide. "
            "Calculate estimated_turns based on duration_minutes: plan roughly 1 question "
            "every 2.5 minutes (e.g. 10 min = 4 turns, 15 min = 5-6 turns, 20 min = 6-8 turns). "
            "Ensure len(questions) exactly matches estimated_turns. "
            "Keep questions concise. Follow custom instructions when safe. "
            "Do not provide any additional information or context. "
            "Create a welcome message introducing yourself and the interview plan."
        )

    @property
    def next_turn_system_prompt(self) -> str:
        return (
            "Act as a supportive but realistic interviewer. Briefly react, then ask one planned question. "
            "Mark complete when estimated turns are answered. Do not provide evaluation yet."
        )

    @abstractmethod
    async def create_plan(self, request: PlanRequest) -> tuple[InterviewPlan, str]: ...

    @abstractmethod
    async def next_turn(self, request: NextTurnRequest) -> tuple[str, bool]: ...

    @abstractmethod
    async def evaluate(self, request: EvaluationRequest) -> Evaluation: ...
