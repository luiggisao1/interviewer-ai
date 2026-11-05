import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.schemas import (
    EvaluationRequest,
    EvaluationResponse,
    NextTurnRequest,
    NextTurnResponse,
    PlanRequest,
    PlanResponse,
)
from app.services.base import is_conclusion_turn
from app.services.factory import create_provider
from app.study_guide import StudyGuideSection, load_study_guide_sections

router = APIRouter(prefix="/api", tags=["main"])
logger = logging.getLogger(__name__)


@router.get("/health")
async def health(config: Settings = Depends(get_settings)) -> dict[str, str]:
    return {"status": "ok", "provider": config.resolved_provider, "recruiter_name": config.recruiter_name}


@router.get("/providers")
async def get_providers(config: Settings = Depends(get_settings)):
    return {
        "active": config.resolved_provider,
        "available": config.available_providers,
        "recruiter_name": config.recruiter_name,
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
    if any(
        item.role == "interviewer" and is_conclusion_turn(item.content)
        for item in request.transcript
    ):
        raise HTTPException(
            status_code=400,
            detail="The interview session is already complete.",
        )
    provider = create_provider(config, request.config.provider)
    try:
        message, complete = await provider.next_turn(request)
        answered = 1 + sum(1 for item in request.transcript if item.role == "candidate")
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
    request: EvaluationRequest, config: Settings = Depends(get_settings)
) -> EvaluationResponse:
    eval_provider_name = request.config.evaluation_provider or request.config.provider
    provider = create_provider(config, eval_provider_name)
    try:
        result = await provider.evaluate(request)
        return EvaluationResponse(evaluation=result, provider=provider.name)
    except ValueError as exc:
        logger.exception("Evaluation failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except (httpx.HTTPError, KeyError) as exc:
        logger.exception("Evaluation failed")
        raise HTTPException(
            status_code=502,
            detail="The AI provider could not evaluate this interview. Please try again.",
        ) from exc
