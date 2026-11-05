import pytest
from fastapi.testclient import TestClient

import app.services.base as base_service
from app.config import get_settings
from app.main import app
from app.schemas import (
    InterviewConfig,
    InterviewPlan,
    Message,
    NextTurnRequest,
)
from app.services.base import AIProvider
from app.services.mock_provider import MockProvider
from app.services.prompts.evaluation import CALIBRATED_EVALUATION_PROMPT

get_settings.cache_clear()
client = TestClient(app)

# Support both AIProvider and BaseLLMProvider alias (AC-1, AC-4)
BaseProvider = getattr(base_service, "BaseLLMProvider", AIProvider)

DEFAULT_CONFIG = {
    "role": "Software Engineer",
    "custom_role": "",
    "mode": "Mixed",
    "difficulty": "Senior",
    "duration_minutes": 10,
    "custom_instructions": "",
}

DEFAULT_PLAN = {
    "title": "Senior Systems Engineer Practice",
    "summary": "Distributed systems, caching, and database design",
    "focus_areas": ["Caching", "Message Brokers", "Databases"],
    "questions": [
        "How would you design a low-latency read caching layer?",
        "How do you ensure message delivery guarantees in event-driven systems?",
        "What strategies do you use for database indexing and query optimization?",
    ],
    "estimated_turns": 3,
}

CLOSING_MESSAGE = (
    "Thanks—that concludes the interview. End the session when you're ready to review your feedback."
)


# ==============================================================================
# AC-1: Next Turn System Prompt Staff+ Persona & Pacing Guardrails
# ==============================================================================


def test_base_llm_provider_next_turn_system_prompt_has_staff_persona_and_guardrail() -> None:
    """AC-1: next_turn_system_prompt includes Staff+ persona, drill-down directives, and pacing guardrails."""
    mock = MockProvider()
    prompt = mock.next_turn_system_prompt.lower()

    # Must specify Staff+ interviewer persona or deep drill-down/probing instructions
    assert any(
        term in prompt
        for term in ["staff", "drill-down", "drill down", "probing", "probe"]
    ), "next_turn_system_prompt must include Staff+ persona or drill-down probing instructions"

    # Must include pacing guardrail (max 1 follow-up / bounded by estimated_turns)
    assert any(
        term in prompt
        for term in [
            "pacing",
            "guardrail",
            "max 1 follow-up",
            "at most 1 follow-up",
            "at most one follow-up",
            "one follow-up per topic",
        ]
    ), "next_turn_system_prompt must specify a pacing guardrail (e.g. max 1 follow-up per topic)"


# ==============================================================================
# AC-2: MockProvider Staff+ Follow-Up Probing & Pacing Guardrail
# ==============================================================================


@pytest.mark.asyncio
async def test_mock_provider_probes_redis_caching_keywords() -> None:
    """AC-2: MockProvider detects Redis/caching keywords and asks a contextual drill-down."""
    provider = MockProvider()
    plan = InterviewPlan.model_validate(DEFAULT_PLAN)
    config = InterviewConfig.model_validate(DEFAULT_CONFIG)

    request = NextTurnRequest(
        plan=plan,
        config=config,
        transcript=[
            Message(role="interviewer", content=plan.questions[0]),
        ],
        candidate_answer="We place Redis in front of PostgreSQL for caching frequently requested user profiles.",
    )

    message, is_complete = await provider.next_turn(request)
    assert is_complete is False
    msg_lower = message.lower()
    # Must probe on caching drill-downs (invalidation, stampede, TTL, eviction, consistency)
    assert any(
        kw in msg_lower
        for kw in ["cache", "redis", "invalidation", "stampede", "ttl", "eviction", "consistency"]
    ), f"Expected contextual drill-down on caching/Redis, got: {message}"


@pytest.mark.asyncio
async def test_mock_provider_probes_kafka_message_broker_keywords() -> None:
    """AC-2: MockProvider detects Kafka keywords and asks a contextual drill-down."""
    provider = MockProvider()
    plan = InterviewPlan.model_validate(DEFAULT_PLAN)
    config = InterviewConfig.model_validate(DEFAULT_CONFIG)

    request = NextTurnRequest(
        plan=plan,
        config=config,
        transcript=[
            Message(role="interviewer", content=plan.questions[1]),
        ],
        candidate_answer="We publish checkout events to Kafka topic partitions for asynchronous fulfillment.",
    )

    message, is_complete = await provider.next_turn(request)
    assert is_complete is False
    msg_lower = message.lower()
    assert any(
        kw in msg_lower
        for kw in ["kafka", "partition", "consumer lag", "skew", "ordering", "replay", "at-least-once"]
    ), f"Expected contextual drill-down on Kafka, got: {message}"


@pytest.mark.asyncio
async def test_mock_provider_probes_database_indexing_keywords() -> None:
    """AC-2: MockProvider detects indexing keywords and asks a contextual drill-down."""
    provider = MockProvider()
    plan = InterviewPlan.model_validate(DEFAULT_PLAN)
    config = InterviewConfig.model_validate(DEFAULT_CONFIG)

    request = NextTurnRequest(
        plan=plan,
        config=config,
        transcript=[
            Message(role="interviewer", content=plan.questions[2]),
        ],
        candidate_answer="We create B-tree composite indexes on (org_id, created_at) to avoid table scans.",
    )

    message, is_complete = await provider.next_turn(request)
    assert is_complete is False
    msg_lower = message.lower()
    assert any(
        kw in msg_lower
        for kw in ["index", "b-tree", "write amplification", "selectivity", "cardinality", "composite"]
    ), f"Expected contextual drill-down on indexing, got: {message}"


@pytest.mark.asyncio
async def test_mock_provider_probes_concurrency_keywords() -> None:
    """AC-2: MockProvider detects concurrency keywords and asks a contextual drill-down."""
    provider = MockProvider()
    plan = InterviewPlan.model_validate(DEFAULT_PLAN)
    config = InterviewConfig.model_validate(DEFAULT_CONFIG)

    request = NextTurnRequest(
        plan=plan,
        config=config,
        transcript=[
            Message(role="interviewer", content=plan.questions[0]),
        ],
        candidate_answer="We leverage concurrency with worker thread pools and mutex locks for high throughput.",
    )

    message, is_complete = await provider.next_turn(request)
    assert is_complete is False
    msg_lower = message.lower()
    assert any(
        kw in msg_lower
        for kw in ["concurrency", "mutex", "deadlock", "race condition", "lock contention", "threads"]
    ), f"Expected contextual drill-down on concurrency, got: {message}"


@pytest.mark.asyncio
async def test_mock_provider_enforces_single_drill_down_pacing_guardrail() -> None:
    """AC-2: MockProvider allows at most 1 follow-up drill-down per topic before advancing to planned questions."""
    provider = MockProvider()
    plan = InterviewPlan.model_validate(DEFAULT_PLAN)
    config = InterviewConfig.model_validate(DEFAULT_CONFIG)

    # Transcript already includes an interviewer drill-down on caching/Redis
    transcript = [
        Message(role="interviewer", content=plan.questions[0]),
        Message(role="candidate", content="We use Redis caching."),
        Message(
            role="interviewer",
            content="How do you handle cache invalidation and cache stampedes under heavy traffic?",
        ),
    ]

    # Candidate mentions Redis/caching again
    request = NextTurnRequest(
        plan=plan,
        config=config,
        transcript=transcript,
        candidate_answer="We use probabilistic early expiration and distributed Redis locks with a 5 second TTL.",
    )

    message, is_complete = await provider.next_turn(request)
    assert is_complete is False
    # Must NOT ask another drill-down on caching; must transition to next planned question
    assert plan.questions[1] in message or "message" in message.lower() or "event" in message.lower()


@pytest.mark.asyncio
async def test_mock_provider_completes_when_estimated_turns_reached() -> None:
    """AC-2: MockProvider marks is_complete=True once candidate has answered estimated_turns."""
    provider = MockProvider()
    plan = InterviewPlan.model_validate(DEFAULT_PLAN)  # estimated_turns = 3
    config = InterviewConfig.model_validate(DEFAULT_CONFIG)

    transcript = [
        Message(role="interviewer", content=plan.questions[0]),
        Message(role="candidate", content="First answer about Redis."),
        Message(role="interviewer", content=plan.questions[1]),
        Message(role="candidate", content="Second answer about Kafka."),
        Message(role="interviewer", content=plan.questions[2]),
    ]

    # Third candidate answer reaches estimated_turns (3)
    request = NextTurnRequest(
        plan=plan,
        config=config,
        transcript=transcript,
        candidate_answer="Third answer about database indexing with B-trees.",
    )

    message, is_complete = await provider.next_turn(request)
    assert is_complete is True
    assert any(
        term in message.lower()
        for term in ["concludes", "conclude", "wrap up", "feedback", "end the session"]
    )


# ==============================================================================
# AC-3: /api/turn Rejection on Completed Interview Sessions
# ==============================================================================


def test_turn_rejects_with_400_when_session_already_completed() -> None:
    """AC-3: /api/turn returns 400 Bad Request with specific detail if the session is already completed."""
    transcript_with_conclusion = [
        {"role": "interviewer", "content": DEFAULT_PLAN["questions"][0]},
        {"role": "candidate", "content": "I use Redis for distributed caching."},
        {"role": "interviewer", "content": DEFAULT_PLAN["questions"][1]},
        {"role": "candidate", "content": "We use Kafka for event-driven messaging."},
        {"role": "interviewer", "content": CLOSING_MESSAGE},
    ]

    response = client.post(
        "/api/turn",
        json={
            "plan": DEFAULT_PLAN,
            "config": DEFAULT_CONFIG,
            "transcript": transcript_with_conclusion,
            "candidate_answer": "Thank you so much Iris, I appreciate your time!",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "The interview session is already complete."


def test_turn_rejects_with_400_for_various_conclusion_phrasings() -> None:
    """AC-3: /api/turn returns 400 for different closing phrasing variations."""
    conclusion_messages = [
        "That wraps up our interview today. Thank you for your time.",
        "Thank you for your time, that concludes our interview session.",
        "That is all the questions I have for you today.",
    ]

    for closing_text in conclusion_messages:
        transcript = [
            {"role": "interviewer", "content": DEFAULT_PLAN["questions"][0]},
            {"role": "candidate", "content": "Answer 1."},
            {"role": "interviewer", "content": closing_text},
        ]

        response = client.post(
            "/api/turn",
            json={
                "plan": DEFAULT_PLAN,
                "config": DEFAULT_CONFIG,
                "transcript": transcript,
                "candidate_answer": "Thanks, goodbye!",
            },
        )

        assert response.status_code == 400, f"Failed to reject turn for closing phrase: {closing_text}"
        assert response.json()["detail"] == "The interview session is already complete."


# ==============================================================================
# AC-4: build_answer_pairs Filtering of Conclusion & Closing Pleasantries
# ==============================================================================


def test_build_answer_pairs_excludes_conclusion_turns_and_closing_pleasantries() -> None:
    """AC-4: build_answer_pairs() strictly excludes wrap-up/conclusion turns and candidate parting pleasantries."""
    stampede_answer = (
        "I would use probabilistic early expiration or distributed mutex locks to ensure single-worker replenishment."
    )
    transcript = [
        Message(role="interviewer", content="How would you design a distributed cache?"),
        Message(role="candidate", content="I would use Redis with consistent hashing and write-through caching."),
        Message(role="interviewer", content="How do you mitigate cache stampede under heavy load?"),
        Message(role="candidate", content=stampede_answer),
        Message(role="interviewer", content=CLOSING_MESSAGE),
        Message(role="candidate", content="Thank you so much, take care!"),
    ]

    pairs = BaseProvider.build_answer_pairs(transcript)

    assert len(pairs) == 2, f"Expected 2 technical pairs, but got {len(pairs)}: {pairs}"
    assert pairs[0].question == "How would you design a distributed cache?"
    assert "Redis" in pairs[0].candidate_answer
    assert pairs[1].question == "How do you mitigate cache stampede under heavy load?"
    assert "probabilistic early expiration" in pairs[1].candidate_answer

    # Verify no conclusion turn is captured as a question
    for pair in pairs:
        assert "concludes" not in pair.question.lower()
        assert "feedback" not in pair.question.lower()
        assert "take care" not in pair.candidate_answer.lower()


def test_build_answer_pairs_excludes_standalone_goodbye_pleasantries() -> None:
    """AC-4: build_answer_pairs() filters parting pleasantries like 'Thank you, goodbye!' or 'Thanks Iris!'."""
    pleasantries = [
        "Thank you so much, take care!",
        "Thanks, have a good day",
        "Goodbye",
        "Thanks Iris, bye!",
        "Have a wonderful weekend!",
    ]

    for pleasantry in pleasantries:
        transcript = [
            Message(role="interviewer", content="Explain how B-tree indexes improve database queries."),
            Message(role="candidate", content="B-trees allow logarithmic time complexity lookups."),
            Message(role="interviewer", content="That wraps up our interview today. Thank you for your time."),
            Message(role="candidate", content=pleasantry),
        ]

        pairs = BaseProvider.build_answer_pairs(transcript)
        assert len(pairs) == 1, f"Failed to filter out pleasantry: '{pleasantry}'. Got pairs: {pairs}"
        assert pairs[0].candidate_answer == "B-trees allow logarithmic time complexity lookups."


def test_build_answer_pairs_preserves_technical_answers_starting_with_courtesy() -> None:
    """AC-4: build_answer_pairs() preserves candidate answers with technical content despite polite opening."""
    answer = (
        "Thank you for the question. We configure PostgreSQL streaming replication with automated failover "
        "managed by Patroni."
    )
    transcript = [
        Message(role="interviewer", content="How do you handle database failovers?"),
        Message(role="candidate", content=answer),
    ]

    pairs = BaseProvider.build_answer_pairs(transcript)
    assert len(pairs) == 1
    assert "Patroni" in pairs[0].candidate_answer


# ==============================================================================
# AC-5: CALIBRATED_EVALUATION_PROMPT Directs Ignoring Wrap-Ups
# ==============================================================================


def test_calibrated_evaluation_prompt_instructs_ignoring_wrapup_turns() -> None:
    """AC-5: CALIBRATED_EVALUATION_PROMPT directs scoring and senior answers solely for technical questions."""
    prompt_lower = CALIBRATED_EVALUATION_PROMPT.lower()

    # Must contain explicit instructions to ignore wrap-up / conclusion / closing pleasantries
    assert any(
        term in prompt_lower
        for term in [
            "wrap-up",
            "wrap up",
            "conclusion",
            "closing pleasantry",
            "parting pleasantr",
            "concluding message",
        ]
    ), "CALIBRATED_EVALUATION_PROMPT must explicitly mention ignoring wrap-ups or closing pleasantries"


# ==============================================================================
# End-to-End Evaluation Integration: Wrap-up Turn Not Included in Senior Answers
# ==============================================================================


def test_api_evaluation_ignores_conclusion_turn_in_senior_answers() -> None:
    """Integration: /api/evaluation does not produce senior_answers for wrap-up/conclusion turns."""
    transcript = [
        {"role": "interviewer", "content": "How would you design a distributed cache?"},
        {
            "role": "candidate",
            "content": "I would use Redis with consistent hashing and write-through caching.",
        },
        {"role": "interviewer", "content": "How do you mitigate cache stampede?"},
        {
            "role": "candidate",
            "content": "I would use probabilistic early expiration or mutex locks.",
        },
        {"role": "interviewer", "content": CLOSING_MESSAGE},
        {"role": "candidate", "content": "Thank you so much, take care!"},
    ]

    response = client.post(
        "/api/evaluation",
        json={
            "study_guide": "# Caching\nRedis and Memcached caching strategies.",
            "config": DEFAULT_CONFIG,
            "plan": DEFAULT_PLAN,
            "transcript": transcript,
        },
    )

    assert response.status_code == 200
    body = response.json()["evaluation"]
    senior_answers = body["senior_answers"]

    # Exactly 2 senior answers for the 2 technical questions, 0 for conclusion
    assert len(senior_answers) == 2, f"Expected 2 senior answers, got {len(senior_answers)}"
    for sa in senior_answers:
        assert "concludes" not in sa["question"].lower()
        assert "take care" not in sa["candidate_answer"].lower()
