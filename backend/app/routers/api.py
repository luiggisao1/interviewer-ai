import logging
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response

from app.config import Settings, get_settings
from app.database import InterviewRepository
from app.export import (
    format_questions_markdown,
    format_session_markdown,
    format_sessions_markdown,
)
from app.schemas import (
    EvaluationRequest,
    EvaluationResponse,
    NextTurnRequest,
    NextTurnResponse,
    PlanRequest,
    PlanResponse,
    QuestionGroup,
    StorageMode,
    StoredResponseItem,
    StoredSessionDetail,
    StoredSessionSummary,
)
from app.services.base import AIProvider
from app.services.factory import create_provider
from app.study_guide import StudyGuideSection, load_study_guide_sections

router = APIRouter(prefix="/api", tags=["main"])
logger = logging.getLogger(__name__)


def get_repository(config: Settings = Depends(get_settings)) -> InterviewRepository:
    return InterviewRepository(config.resolved_database_url)


@router.get("/health")
async def health(config: Settings = Depends(get_settings)) -> dict[str, str]:
    return {"status": "ok", "provider": config.resolved_provider, "recruiter_name": config.recruiter_name}


@router.get("/providers")
async def get_providers(config: Settings = Depends(get_settings)):
    return {
        "active": config.resolved_provider,
        "available": config.available_providers,
        "recruiter_name": config.recruiter_name,
        "require_access_key": config.require_access_key,
    }


@router.get("/study-guide/sections", response_model=list[StudyGuideSection])
async def study_guide_sections() -> list[StudyGuideSection]:
    sections = load_study_guide_sections()
    if not sections:
        raise HTTPException(
            status_code=404,
            detail="No study guide sections were found in study_guide.md.",
        )
    return sections


@router.post("/plan", response_model=PlanResponse)
async def create_plan(
    request: PlanRequest, config: Settings = Depends(get_settings)
) -> PlanResponse:
    provider = create_provider(config, request.config.provider)
    try:
        plan, opening = await provider.create_plan(request)
        return PlanResponse(plan=plan, opening_message=opening, provider=provider.name)
    except ValueError as exc:
        logger.exception("Plan generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (httpx.HTTPError, KeyError) as exc:
        logger.exception("Plan generation failed")
        raise HTTPException(
            status_code=502,
            detail="The AI provider could not create a plan. Please try again.",
        ) from exc


@router.post("/turn", response_model=NextTurnResponse)
async def next_turn(
    request: NextTurnRequest, config: Settings = Depends(get_settings)
) -> NextTurnResponse:
    provider = create_provider(config, request.config.provider)
    try:
        message, complete = await provider.next_turn(request)
        answered = AIProvider.count_answered_turns(request.transcript, request.candidate_answer)
        if not complete and AIProvider.is_closing_interviewer_message(
            message, candidate_turns=answered, total_questions=len(request.plan.questions)
        ):
            complete = True
        return NextTurnResponse(
            interviewer_message=message, is_complete=complete, turn_number=answered
        )
    except ValueError as exc:
        logger.exception("Turn generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (httpx.HTTPError, KeyError) as exc:
        logger.exception("Turn generation failed")
        raise HTTPException(
            status_code=502,
            detail="The AI provider could not continue the interview. Please try again.",
        ) from exc


@router.post("/evaluation", response_model=EvaluationResponse)
async def evaluate(
    request: EvaluationRequest,
    config: Settings = Depends(get_settings),
    repo: InterviewRepository = Depends(get_repository),
) -> EvaluationResponse:
    eval_provider_name = request.config.evaluation_provider or request.config.provider
    provider = create_provider(config, eval_provider_name)
    try:
        result = await provider.evaluate(request)
        saved_session_id = repo.save_evaluation(
            config=request.config,
            plan=request.plan,
            evaluation=result,
            provider=provider.name,
            study_guide=request.study_guide,
        )
        return EvaluationResponse(
            evaluation=result,
            provider=provider.name,
            saved_session_id=saved_session_id,
            storage_mode=request.config.storage_mode,
        )
    except ValueError as exc:
        logger.exception("Evaluation failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (httpx.HTTPError, KeyError) as exc:
        logger.exception("Evaluation failed")
        raise HTTPException(
            status_code=502,
            detail="The AI provider could not evaluate this interview. Please try again.",
        ) from exc


@router.get("/history/sessions", response_model=list[StoredSessionSummary])
async def list_history_sessions(
    candidate_name: str | None = None,
    section: str | None = None,
    storage_mode: StorageMode | None = None,
    search: str | None = None,
    repo: InterviewRepository = Depends(get_repository),
) -> list[StoredSessionSummary]:
    return repo.list_sessions(
        candidate_name=candidate_name,
        section=section,
        storage_mode=storage_mode,
        search=search,
    )


@router.get("/history/sessions/{session_id}", response_model=StoredSessionDetail)
async def get_history_session(
    session_id: str,
    repo: InterviewRepository = Depends(get_repository),
) -> StoredSessionDetail:
    detail = repo.get_session(session_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    return detail


@router.get("/history/questions", response_model=list[QuestionGroup])
async def list_history_questions(
    candidate_name: str | None = None,
    section: str | None = None,
    storage_mode: StorageMode | None = None,
    search: str | None = None,
    repo: InterviewRepository = Depends(get_repository),
) -> list[QuestionGroup]:
    return repo.list_grouped_by_question(
        candidate_name=candidate_name,
        section=section,
        storage_mode=storage_mode,
        search=search,
    )


@router.get("/history/responses", response_model=list[StoredResponseItem])
async def list_history_responses(
    candidate_name: str | None = None,
    section: str | None = None,
    storage_mode: StorageMode | None = None,
    search: str | None = None,
    repo: InterviewRepository = Depends(get_repository),
) -> list[StoredResponseItem]:
    return repo.list_responses(
        candidate_name=candidate_name,
        section=section,
        storage_mode=storage_mode,
        search=search,
    )


@router.get("/history/filters")
async def get_history_filters(
    repo: InterviewRepository = Depends(get_repository),
) -> dict[str, list[str]]:
    return {
        "candidates": repo.list_candidates(),
        "sections": repo.list_sections(),
    }


@router.get("/history/export")
async def export_history_markdown(
    view: Literal["questions", "sessions"] = "questions",
    session_id: str | None = None,
    candidate_name: str | None = None,
    section: str | None = None,
    storage_mode: StorageMode | None = None,
    search: str | None = None,
    include_candidate_answers: bool = True,
    include_senior_answers: bool = True,
    repo: InterviewRepository = Depends(get_repository),
) -> Response:
    if session_id is not None:
        detail = repo.get_session(session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Interview session not found.")
        markdown = format_session_markdown(
            detail,
            include_candidate_answers=include_candidate_answers,
            include_senior_answers=include_senior_answers,
        )
        safe_prefix = "".join(ch for ch in session_id[:8] if ch.isalnum() or ch in "-_") or "session"
        filename = f"interview-session-{safe_prefix}.md"
    elif view == "sessions":
        summaries = repo.list_sessions(
            candidate_name=candidate_name,
            section=section,
            storage_mode=storage_mode,
            search=search,
        )
        details = [
            detail
            for summary in summaries
            if (detail := repo.get_session(summary.id)) is not None
        ]
        markdown = format_sessions_markdown(
            details,
            include_candidate_answers=include_candidate_answers,
            include_senior_answers=include_senior_answers,
        )
        filename = "interview-archive-sessions.md"
    else:
        groups = repo.list_grouped_by_question(
            candidate_name=candidate_name,
            section=section,
            storage_mode=storage_mode,
            search=search,
        )
        markdown = format_questions_markdown(
            groups,
            include_candidate_answers=include_candidate_answers,
            include_senior_answers=include_senior_answers,
        )
        filename = "interview-archive-questions.md"

    return Response(
        content=markdown,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
