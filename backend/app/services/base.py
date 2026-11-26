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

CONCLUSION_PHRASES = (
    "concludes the interview",
    "interview is concluded",
    "that concludes",
    "wrap up our interview",
    "wraps up our interview",
    "thank you for your time",
    "end the session",
    "all the questions i have for you",
    "that is all the questions",
    "that's all the questions",
    "conclude",
)

PARTING_PLEASANTRIES = (
    "thank you so much",
    "take care",
    "have a good day",
    "have a wonderful",
    "goodbye",
    "thanks iris",
    "thanks, bye",
    "bye!",
    "bye",
    "appreciate your time",
    "thank you for your time",
    "thanks for your time",
    "thank you for the interview",
    "thanks for the interview",
    "thanks for having me",
    "thank you",
    "thanks",
)

TECHNICAL_INDICATORS = (
    "redis",
    "kafka",
    "postgres",
    "postgresql",
    "mysql",
    "sql",
    "nosql",
    "aws",
    "gcp",
    "azure",
    "docker",
    "kubernetes",
    "k8s",
    "cache",
    "caching",
    "memcached",
    "index",
    "indexes",
    "indexing",
    "b-tree",
    "queue",
    "broker",
    "rabbit",
    "rabbitmq",
    "pub/sub",
    "pubsub",
    "lock",
    "locks",
    "mutex",
    "thread",
    "threads",
    "concurrency",
    "asyncio",
    "http",
    "rest",
    "grpc",
    "database",
    "sharding",
    "replication",
    "partition",
    "partitioning",
    "acid",
    "cap",
    "latency",
    "throughput",
    "scale",
    "scaling",
    "load balancer",
    "api",
    "schema",
    "query",
    "table",
    "write amplification",
    "contention",
)


def is_conclusion_turn(text: str) -> bool:
    if not text:
        return False
    lower = text.lower()
    return any(phrase in lower for phrase in CONCLUSION_PHRASES)


def is_parting_pleasantry(text: str) -> bool:
    if not text:
        return False
    words = text.strip().split()
    if len(words) > 15:
        return False
    lower = text.lower()
    if any(tech in lower for tech in TECHNICAL_INDICATORS):
        return False
    return any(phrase in lower for phrase in PARTING_PLEASANTRIES)


class AIProvider(ABC):
    recruiter_name: str = "Iris"

    is_conclusion_turn = staticmethod(is_conclusion_turn)
    is_parting_pleasantry = staticmethod(is_parting_pleasantry)

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
            "Act as a supportive but realistic interviewer. You are an experienced Staff+ Principal Technical "
            "Interviewer conducting a rigorous technical practice interview. "
            "Evaluate the candidate's answers with Staff-level engineering standards. "
            "Probing & Drill-Down Directives: When the candidate mentions specific tools, architectures, "
            "or high-level systems (such as Redis, Kafka, PostgreSQL, AWS, caching, database indexing, "
            "or concurrency), execute an incisive drill-down probing question on failure modes, trade-offs, "
            "invalidation, race conditions, or operational bottlenecks. "
            "Pacing Guardrail: Enforce a strict pacing guardrail—ask at most 1 follow-up drill-down per topic, "
            "bounded by the session's estimated turns. Do not linger on a single topic. If a drill-down was "
            "already asked or the candidate has adequately answered, advance to the next planned question "
            "from the interview plan. "
            "Briefly react with realistic feedback (1 sentence), then ask the question. "
            "Mark is_complete=True only when estimated turns are reached or all questions are concluded. "
            "Do not provide overall scoring or evaluation yet."
        )

    @staticmethod
    def build_answer_pairs(
        transcript: list[Message],
        default_question: str = "Technical Interview Question",
    ) -> list[AnswerPair]:
        pairs: list[AnswerPair] = []
        last_question = ""
        last_role = None
        concluded = False

        for message in transcript:
            content = message.content.strip()
            if not content:
                continue

            if message.role == "interviewer":
                if is_conclusion_turn(content):
                    concluded = True
                    continue
                last_question = content
                last_role = "interviewer"
            elif message.role == "candidate":
                if concluded or is_parting_pleasantry(content):
                    continue
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


BaseLLMProvider = AIProvider

__all__ = [
    "AIProvider",
    "BaseLLMProvider",
    "is_conclusion_turn",
    "is_parting_pleasantry",
]
