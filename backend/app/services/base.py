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

    @abstractmethod
    async def create_plan(self, request: PlanRequest) -> tuple[InterviewPlan, str]: ...

    @abstractmethod
    async def next_turn(self, request: NextTurnRequest) -> tuple[str, bool]: ...

    @abstractmethod
    async def evaluate(self, request: EvaluationRequest) -> Evaluation: ...
