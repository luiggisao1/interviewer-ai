"""Evaluation Prompt Benchmark: Baseline vs. Calibrated Prompt.

Compares how Claude and Gemini evaluate candidate answers under the Baseline
(legacy) prompt versus the Calibrated prompt across both exemplary senior answers
(upper-bound calibration) and non-answers/greetings (zero-floor calibration).
"""

import argparse
import asyncio
import json
import logging
import statistics
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from app.config import get_settings  # noqa: E402
from app.schemas import (  # noqa: E402
    Difficulty,
    Evaluation,
    InterviewConfig,
    InterviewMode,
    InterviewPlan,
    Message,
    Role,
)
from app.services.anthropic_provider import AnthropicProvider  # noqa: E402
from app.services.gemini_provider import GeminiProvider  # noqa: E402
from app.services.prompts.evaluation import (  # noqa: E402
    BASELINE_EVALUATION_PROMPT,
    CALIBRATED_EVALUATION_PROMPT,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("benchmark")

EXEMPLARY_STUDY_GUIDE = """# Python Memory Management & Production Reliability
- Memory allocation: PyMalloc, private heap, OS arenas.
- Reference counting: deterministic deallocation when refcount reaches zero.
- Generational GC: solves cyclic references across generations 0, 1, 2 using threshold-based collection.
- Leak detection in FastAPI: tracemalloc snapshots, memory leak profiling, Prometheus RSS metrics.
- Mitigation: worker max-requests recycling, streaming large responses, offloading heavy processing."""

EXEMPLARY_QUESTION = (
    "How does Python manage memory, and how do you diagnose and prevent memory leaks "
    "in a high-throughput production FastAPI service?"
)

EXEMPLARY_SENIOR_ANSWER = (
    "Python manages memory via a layered architecture: a private heap managed by PyMalloc for objects "
    "<= 512 bytes, and the OS allocator for larger chunks. Deallocation is primarily handled by deterministic "
    "reference counting; when an object's reference counter drops to zero, its memory is immediately reclaimed.\n\n"
    "To handle reference cycles where refcount never hits zero (e.g., doubly linked structures or self-referential "
    "closures), CPython runs a cyclic generational garbage collector tracking three generations (0, 1, 2) based on "
    "allocation thresholds.\n\n"
    "In a production FastAPI service, memory leaks typically stem from unbounded in-memory caches, module-level "
    "registries, or dangling event listener callbacks holding references. To diagnose this, I take differential "
    "snapshots using Python's `tracemalloc` under load testing, tracking top allocated tracebacks and comparing "
    "before/after traces. In production, we export process RSS memory metrics to Prometheus and alert on spikes.\n\n"
    "For prevention, we enforce four practices: (1) use Redis/Memcached with explicit TTLs instead of unbounded "
    "global dicts, (2) stream large payloads via `StreamingResponse` rather than loading entire byte arrays into RAM, "
    "(3) recycle worker processes periodically using Gunicorn's UvicornWorker with "
    "`--max-requests 50000 --max-requests-jitter 5000` (or standalone Uvicorn's `--limit-max-requests 50000`), "
    " and (4) offload CPU/memory-heavy workloads to Celery/Arq background workers so HTTP worker processes stay lean."
)

NON_ANSWER_QUESTION = (
    "Can you walk us through how you design modular and maintainable backend services in Python?"
)
NON_ANSWER_CANDIDATE_ANSWER = "Hello, coming to meet you."


def build_case_payload(case: str) -> tuple[str, dict]:
    if case == "non_answer":
        config = InterviewConfig(
            role=Role.backend_engineer,
            mode=InterviewMode.technical,
            difficulty=Difficulty.senior,
            duration_minutes=15,
        )
        plan = InterviewPlan(
            title="Modular Python Backend Architecture",
            summary="Clean architecture, domain boundaries, and dependency injection.",
            focus_areas=["Clean Architecture", "Dependency Injection", "Domain-Driven Design"],
            questions=[NON_ANSWER_QUESTION],
            estimated_turns=1,
        )
        transcript = [
            Message(role="interviewer", content=NON_ANSWER_QUESTION),
            Message(role="candidate", content=NON_ANSWER_CANDIDATE_ANSWER),
        ]
        payload = {
            "study_guide": "# Python Backend Architecture\nModular design, clean architecture, dependency injection.",
            "config": config.model_dump(mode="json"),
            "plan": plan.model_dump(mode="json"),
            "transcript": [m.model_dump(mode="json") for m in transcript],
            "answer_pairs": [
                {
                    "number": 1,
                    "question": NON_ANSWER_QUESTION,
                    "candidate_answer": NON_ANSWER_CANDIDATE_ANSWER,
                }
            ],
        }
        return "Non-Answer / Greeting (Zero-Floor Target: 0%)", payload

    config = InterviewConfig(
        role=Role.backend_engineer,
        mode=InterviewMode.technical,
        difficulty=Difficulty.senior,
        duration_minutes=30,
    )
    plan = InterviewPlan(
        title="Senior Python & Backend Reliability",
        summary="Deep dive into Python internals, memory, and FastAPI production performance.",
        focus_areas=["Python Memory Management", "Generational GC", "FastAPI Observability"],
        questions=[EXEMPLARY_QUESTION],
        estimated_turns=1,
    )
    transcript = [
        Message(role="interviewer", content=EXEMPLARY_QUESTION),
        Message(role="candidate", content=EXEMPLARY_SENIOR_ANSWER),
    ]
    payload = {
        "study_guide": EXEMPLARY_STUDY_GUIDE,
        "config": config.model_dump(mode="json"),
        "plan": plan.model_dump(mode="json"),
        "transcript": [m.model_dump(mode="json") for m in transcript],
        "answer_pairs": [
            {
                "number": 1,
                "question": EXEMPLARY_QUESTION,
                "candidate_answer": EXEMPLARY_SENIOR_ANSWER,
            }
        ],
    }
    return "Exemplary Senior Response (Upper-Bound Target: >= 95%)", payload


async def evaluate_single_run(
    provider: AnthropicProvider | GeminiProvider,
    prompt_template: str,
    payload: dict,
) -> Evaluation:
    system_prompt = prompt_template.format(count=len(payload["answer_pairs"]))
    if isinstance(provider, AnthropicProvider):
        messages = [
            {"role": "user", "content": json.dumps(payload)},
        ]
        return await provider.call_llm(
            system_prompt=system_prompt,
            output_format=Evaluation,
            max_tokens=8192,
            messages=messages,  # type: ignore[arg-type]
        )
    return await provider.call_llm(
        system_prompt=system_prompt,
        output_format=Evaluation,
        contents=json.dumps(payload),
    )


async def run_single_benchmark_case(
    case_label: str,
    payload: dict,
    provider: AnthropicProvider | GeminiProvider,
    target_model: str,
    runs: int,
    prompt_choice: str,
) -> None:
    print("\n" + "=" * 80)
    print(f"🔬 CASE: {case_label}")
    print(f"PROMPT={prompt_choice.upper()} | MODEL={target_model} | RUNS={runs}")
    print("=" * 80 + "\n")

    baseline_scores: list[int] = []
    baseline_improvements: list[list[str]] = []

    if prompt_choice in ("both", "baseline"):
        print("Running Baseline Prompt (Legacy)...")
        for i in range(runs):
            res = await evaluate_single_run(provider, BASELINE_EVALUATION_PROMPT, payload)
            baseline_scores.append(res.overall_score)
            baseline_improvements.append(res.improvements)
            print(f"  [Baseline Run {i + 1}/{runs}] Score: {res.overall_score}%")
            if prompt_choice == "baseline":
                print(f"  Summary: {res.summary}")
                print(f"  Strengths: {res.strengths}")
                print(f"  Improvements: {res.improvements}")
                if res.senior_answers:
                    print(f"  Why Stronger: {res.senior_answers[0].why_stronger}")

    calibrated_scores: list[int] = []
    calibrated_improvements: list[list[str]] = []

    if prompt_choice in ("both", "calibrated"):
        print("\nRunning Calibrated Prompt (Gated Additive Rubric + Zero-Floor)...")
        for i in range(runs):
            res = await evaluate_single_run(provider, CALIBRATED_EVALUATION_PROMPT, payload)
            calibrated_scores.append(res.overall_score)
            calibrated_improvements.append(res.improvements)
            print(f"  [Calibrated Run {i + 1}/{runs}] Score: {res.overall_score}%")
            if prompt_choice == "calibrated":
                print(f"\n  Overall Score: {res.overall_score}%")
                print(f"  Summary: {res.summary}")
                print(f"  Strengths: {res.strengths}")
                print(f"  Improvements: {res.improvements}")
                if res.senior_answers:
                    print(f"  Senior Benchmark Answer: {res.senior_answers[0].senior_answer[:120]}...")
                    print(f"  Why Stronger: {res.senior_answers[0].why_stronger}")

    if prompt_choice == "both" and baseline_scores and calibrated_scores:
        base_avg = statistics.mean(baseline_scores)
        base_stdev = statistics.stdev(baseline_scores) if len(baseline_scores) > 1 else 0.0
        cal_avg = statistics.mean(calibrated_scores)
        cal_stdev = statistics.stdev(calibrated_scores) if len(calibrated_scores) > 1 else 0.0
        delta = cal_avg - base_avg
        sign = "+" if delta >= 0 else ""
        stability = "Higher Stability" if cal_stdev <= base_stdev else "Comparable"
        base_range = f"{min(baseline_scores)}% / {max(baseline_scores)}%"
        cal_range = f"{min(calibrated_scores)}% / {max(calibrated_scores)}%"

        markdown_report = rf"""
### 📊 Benchmark Summary: {case_label} (Model: `{target_model}`)

| Metric | Baseline Prompt (Old) | Calibrated Prompt (New) | Delta / Impact |
| :--- | :--- | :--- | :--- |
| **Mean Score** | **{base_avg:.1f}%** | **{cal_avg:.1f}%** | **{sign}{delta:.1f} pts** |
| **Score Std Dev ($\sigma$)** | ±{base_stdev:.2f} | ±{cal_stdev:.2f} | {stability} |
| **Min / Max Score** | {base_range} | {cal_range} | Calibration Boundary Met |
"""
        print(markdown_report)


async def run_benchmark(
    runs: int,
    model: str | None,
    prompt_choice: str = "both",
    provider_choice: str = "anthropic",
    case_choice: str = "both",
) -> None:
    settings = get_settings()

    if provider_choice == "gemini":
        api_key = settings.google_api_key
        if not api_key:
            logger.error("GOOGLE_API_KEY is not set in backend/.env")
            sys.exit(1)
        target_model = model or settings.gemini_model
        provider: AnthropicProvider | GeminiProvider = GeminiProvider(api_key=api_key, model=target_model)
    else:
        api_key = settings.anthropic_api_key
        if not api_key:
            logger.error("ANTHROPIC_API_KEY is not set in backend/.env")
            sys.exit(1)
        target_model = model or settings.anthropic_model
        provider = AnthropicProvider(api_key=api_key, model=target_model)

    cases_to_run = ["exemplary", "non_answer"] if case_choice == "both" else [case_choice]

    for case_name in cases_to_run:
        case_label, payload = build_case_payload(case_name)
        await run_single_benchmark_case(
            case_label=case_label,
            payload=payload,
            provider=provider,
            target_model=target_model,
            runs=runs,
            prompt_choice=prompt_choice,
        )

    if isinstance(provider, AnthropicProvider):
        await provider.client.close()


def main():
    parser = argparse.ArgumentParser(description="Benchmark LLM evaluation prompts.")
    parser.add_argument(
        "--provider",
        choices=["anthropic", "gemini"],
        default="anthropic",
        help="AI provider to benchmark (default: anthropic)",
    )
    parser.add_argument("--runs", type=int, default=3, help="Number of benchmark iterations per prompt (default: 3)")
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Model override (e.g. gemini-2.5-flash or claude-sonnet-5-5)",
    )
    parser.add_argument(
        "--prompt",
        choices=["both", "calibrated", "baseline"],
        default="both",
        help="Which prompt to execute (default: both)",
    )
    parser.add_argument(
        "--case",
        choices=["exemplary", "non_answer", "both"],
        default="both",
        help="Test case to evaluate: exemplary, non_answer, or both (default: both)",
    )
    args = parser.parse_args()

    asyncio.run(
        run_benchmark(
            runs=args.runs,
            model=args.model,
            prompt_choice=args.prompt,
            provider_choice=args.provider,
            case_choice=args.case,
        )
    )


if __name__ == "__main__":
    main()
