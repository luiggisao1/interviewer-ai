import re

from app.schemas import (
    Evaluation,
    EvaluationRequest,
    InterviewPlan,
    NextTurnRequest,
    PlanRequest,
    SeniorAnswer,
)
from app.services.base import AIProvider


class MockProvider(AIProvider):
    name = "mock"

    @staticmethod
    def _topics(text: str) -> list[str]:
        headings = re.findall(r"(?:^|\n)\s*(?:#{1,3}\s*|[-*]\s+)([^\n]{3,80})", text)
        if not headings:
            words = re.findall(r"\b[A-Za-z][A-Za-z+#.-]{3,}\b", text)
            ignored = {
                "this",
                "that",
                "with",
                "from",
                "have",
                "will",
                "your",
                "about",
                "study",
                "guide",
            }
            headings = [word for word in words if word.lower() not in ignored]
        unique: list[str] = []
        for item in headings:
            clean = item.strip(" .:#-*\t")
            if clean and clean.lower() not in {x.lower() for x in unique}:
                unique.append(clean)
        return (unique or ["Core concepts", "Practical application", "Trade-offs"])[:5]

    async def create_plan(self, request: PlanRequest) -> tuple[InterviewPlan, str]:
        config = request.config
        role = (
            config.custom_role.strip()
            if config.role.value == "Custom Role" and config.custom_role.strip()
            else config.role.value
        )
        topics = self._topics(request.study_guide)
        count = max(2, min(8, config.duration_minutes // 5))
        stems = [
            "Explain {topic} in your own words and give a practical example.",
            "What trade-offs would you consider when applying {topic}?",
            "Describe a difficult scenario involving {topic} and how you would approach it.",
            "How would you validate that your use of {topic} is successful?",
        ]
        questions = [
            stems[i % len(stems)].format(topic=topics[i % len(topics)])
            for i in range(count)
        ]
        plan = InterviewPlan(
            title=f"{config.difficulty.value} {role} practice interview",
            summary=(
                f"A {config.mode.value.lower()} interview grounded in your study guide, "
                "focusing on clear reasoning and practical examples."
            ),
            focus_areas=topics,
            questions=questions,
            estimated_turns=count,
        )
        opening = f"Welcome! I’ll be your interviewer for this {role} practice session. {questions[0]}"
        return plan, opening

    async def next_turn(self, request: NextTurnRequest) -> tuple[str, bool]:
        answered = 1 + sum(
            1 for message in request.transcript if message.role == "candidate"
        )
        complete = answered >= request.plan.estimated_turns
        if complete:
            return (
                "Thanks—that concludes the interview. End the session when you’re ready to review your feedback.",
                True,
            )
        answer = request.candidate_answer.strip()
        bridge = (
            "Good explanation."
            if len(answer.split()) >= 15
            else "Thanks. Try to add a concrete example and explain your reasoning."
        )
        question = request.plan.questions[
            min(answered, len(request.plan.questions) - 1)
        ]
        return f"{bridge} {question}", False

    async def evaluate(self, request: EvaluationRequest) -> Evaluation:
        answers = [m.content for m in request.transcript if m.role == "candidate"]
        word_count = sum(len(answer.split()) for answer in answers)
        completeness = min(1.0, len(answers) / max(1, request.plan.estimated_turns))
        depth = min(1.0, word_count / max(40, len(answers) * 45))
        score = round(45 + completeness * 30 + depth * 25)
        ctx = self.prepare_evaluation_prompt(request)
        senior_answers: list[SeniorAnswer] = []
        for pair in ctx.answer_pairs:
            focus = request.plan.focus_areas[
                min(len(senior_answers), len(request.plan.focus_areas) - 1)
            ]
            senior_answers.append(
                SeniorAnswer(
                    question=pair.question,
                    candidate_answer=pair.candidate_answer,
                    senior_answer=(
                        f"I would approach {focus} by first clarifying the requirements, scale, and failure modes. "
                        "I would choose the simplest maintainable design that meets those constraints, "
                        "validate inputs and edge cases, and add structured logging, tests, and operational "
                        "metrics. I would then explain the alternatives I considered, the trade-offs behind "
                        "my choice, and how I would verify the outcome in production."
                    ),
                    why_stronger=(
                        "It frames the problem, explains a decision, discusses trade-offs, and includes "
                        "production validation rather than only defining the concept."
                    ),
                )
            )

        return Evaluation(
            overall_score=score,
            summary=(
                "You completed a focused practice interview and showed a useful foundation. Your strongest next "
                "gain will come from making each answer more specific and evidence-based."
            ),
            strengths=[
                "Stayed relevant to the interview topics",
                "Communicated ideas in a direct, understandable way",
            ],
            improvements=[
                "Use a clear situation–action–result structure",
                "State trade-offs and assumptions explicitly",
                "Support claims with concrete examples",
            ],
            study_guide_feedback=[
                f"Review and add examples for: {area}"
                for area in request.plan.focus_areas[:3]
            ],
            technical_feedback=[
                "Explain why you chose an approach, not only what it does",
                "Discuss edge cases, validation, and operational impact",
            ],
            senior_answers=senior_answers,
            next_steps=[
                "Rehearse the same questions with 60–90 second answers",
                "Add one measurable outcome to every example",
                "Repeat the interview at a higher difficulty",
            ],
        )
