import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.config import Settings, get_settings
from app.schemas import InterviewConfig, InterviewPlan
from app.services.factory import create_provider

router = APIRouter(prefix="/api/realtime", tags=["realtime"])
logger = logging.getLogger(__name__)


@router.websocket("/ws")
async def realtime_audio_websocket(
    websocket: WebSocket,
    settings: Settings = Depends(get_settings),
) -> None:
    await websocket.accept()
    try:
        init_message = await websocket.receive_text()
        init_data = json.loads(init_message)

        provider_name = init_data.get("provider", settings.resolved_provider)
        provider = create_provider(settings, provider_name)

        if not provider.supports_realtime_audio:
            await websocket.send_json({
                "type": "error",
                "message": f"Realtime voice streaming is not supported by {provider.name}.",
            })
            await websocket.close(code=1008)
            return

        study_guide = init_data.get("study_guide", "")
        config = InterviewConfig.model_validate(init_data["config"])
        plan = InterviewPlan.model_validate(init_data["plan"])

        transcript = await provider.handle_realtime_audio_session(
            websocket=websocket,
            plan=plan,
            config=config,
            study_guide=study_guide,
        )

        try:
            await websocket.send_json({
                "type": "session_completed",
                "transcript": [m.model_dump(mode="json") for m in transcript],
            })
            await websocket.close(code=1000)
        except (RuntimeError, WebSocketDisconnect):
            pass

    except WebSocketDisconnect:
        logger.info("Realtime audio websocket disconnected normally.")
    except Exception as exc:
        logger.exception("Realtime websocket exception: %s", exc)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
            await websocket.close(code=1011)
        except RuntimeError:
            pass
