import asyncio
import json
import logging
from typing import cast

from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import errors, types
from google.genai.types import GenerateContentConfig
from langsmith import wrappers
from pydantic import BaseModel

from app.exceptions import LLMProviderError
from app.schemas import (
    CreatePlanOutputFormat,
    Evaluation,
    EvaluationRequest,
    InterviewConfig,
    InterviewPlan,
    Message,
    NextTurnOutputFormat,
    NextTurnRequest,
    PlanRequest,
    RealtimeError,
    RealtimeInterrupted,
    RealtimeSessionStarted,
    RealtimeTranscriptChunk,
    RealtimeTranscriptFinal,
    Role,
    send_realtime_event,
)
from app.services.base import AIProvider

logger = logging.getLogger(__name__)


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-3.8-flash",
        evaluation_model: str | None = None,
        evaluation_thinking_level: str | None = "medium",
        live_model: str = "gemini-3.8-live",
        recruiter_name: str = "Iris",
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.evaluation_model = (evaluation_model or "").strip() or model
        self.evaluation_thinking_level = (evaluation_thinking_level or "").strip() or None
        self.live_model = live_model
        self.recruiter_name = recruiter_name
        gemini_client = genai.Client(
            api_key=api_key,
        )
        self.client = wrappers.wrap_gemini(
            gemini_client,
            tracing_extra={
                "tags": ["gemini", "python"],
                "metadata": {
                    "integration": "google-genai",
                },
            },
        )

    @property
    def supports_realtime_audio(self) -> bool:
        return True

    async def handle_realtime_audio_session(
        self,
        websocket: WebSocket,
        plan: InterviewPlan,
        config: InterviewConfig,
        study_guide: str,
    ) -> list[Message]:
        role = config.custom_role.strip() if config.role == Role.custom and config.custom_role else config.role.value
        diff = config.difficulty.value
        questions = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(plan.questions))

        candidate = config.candidate_name.strip()
        candidate_line = (
            f"The candidate's name is {candidate}. Address them warmly by name.\n" if candidate else ""
        )

        instructions = (
            f"Your name is {self.recruiter_name}. You are conducting a spoken {diff} {role} practice interview.\n"
            f"{candidate_line}"
            f"Use only the supplied study guide as your technical ground truth.\n"
            f"Ask one concise question at a time and follow the planned questions in order:\n{questions}\n"
            "Listen patiently to natural pauses and non-native English. "
            "Keep spoken responses concise (1-2 sentences), then wait for the candidate's answer.\n"
            f"Start immediately by introducing yourself briefly as {self.recruiter_name} "
            "and asking the first interview question.\n"
            f"There are {len(plan.questions)} planned questions in total. "
            "Keep track of them and ask each one in order.\n"
            "Once the candidate has finished answering the final planned question, give a single brief closing "
            "remark thanking them and stating that the interview is concluded and their debrief is starting now, "
            "and immediately call the `end_interview` tool. "
            "Do not ask if the candidate has any questions, and do not continue talking or repeating goodbyes.\n\n"
            f"Study guide content:\n{study_guide[:15000]}"
        )

        end_interview_tool = types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="end_interview",
                    description=(
                        "Conclude the interview session and automatically start the candidate's evaluation debrief. "
                        "Call this immediately after the candidate answers the final planned question."
                    ),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "reason": types.Schema(
                                type=types.Type.STRING,
                                description=(
                                    "Brief reason the interview is concluding "
                                    "(e.g., all planned questions answered)."
                                ),
                            )
                        },
                        required=["reason"],
                    ),
                )
            ]
        )

        live_config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede"))
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            realtime_input_config=types.RealtimeInputConfig(
                turn_coverage=types.TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY
            ),
            tools=[end_interview_tool],
            system_instruction=instructions,
        )

        transcript: list[Message] = []
        current_interviewer_text: list[str] = []
        kickoff_message = (
            f"Please start the interview now by introducing yourself briefly as {self.recruiter_name} "
            "and asking the first question."
        )

        async def _run_live_session(kickoff_prompt: str) -> list[Message]:
            accepting_audio = True
            interview_concluding = False
            had_audio_in_turn = False
            awaiting_farewell_turn = False

            async with self.client.aio.live.connect(model=self.live_model, config=live_config) as session:
                await send_realtime_event(
                    websocket,
                    RealtimeSessionStarted(provider=self.name, model=self.live_model),
                )

                await session.send(
                    input=kickoff_prompt,
                    end_of_turn=True,
                )

                async def receive_from_gemini() -> None:
                    nonlocal accepting_audio
                    nonlocal awaiting_farewell_turn
                    nonlocal had_audio_in_turn
                    nonlocal interview_concluding
                    try:
                        while True:
                            async for response in session.receive():
                                tool_call = getattr(response, "tool_call", None)
                                function_calls = (
                                    getattr(tool_call, "function_calls", None) if tool_call is not None else None
                                )
                                if isinstance(function_calls, list):
                                    for fn_call in function_calls:
                                        if getattr(fn_call, "name", None) == "end_interview":
                                            interview_concluding = True
                                            accepting_audio = False
                                            if awaiting_farewell_turn or had_audio_in_turn:
                                                full_text = "".join(current_interviewer_text).strip()
                                                if full_text:
                                                    transcript.append(Message(role="interviewer", content=full_text))
                                                    await send_realtime_event(
                                                        websocket,
                                                        RealtimeTranscriptFinal(
                                                            role="interviewer",
                                                            content=full_text,
                                                        ),
                                                    )
                                                    current_interviewer_text.clear()
                                                return
                                            awaiting_farewell_turn = True
                                            await session.send_tool_response(
                                                function_responses=[
                                                    types.FunctionResponse(
                                                        id=getattr(fn_call, "id", None),
                                                        name="end_interview",
                                                        response={
                                                            "status": "concluded",
                                                            "instruction": (
                                                                "Give a brief, warm one-sentence closing remark "
                                                                "thanking the candidate and letting them know the "
                                                                "interview is complete and their debrief is starting "
                                                                "now. Do not ask any questions."
                                                            ),
                                                        },
                                                    )
                                                ]
                                            )

                                server_content = response.server_content
                                if server_content is not None:
                                    if server_content.interrupted:
                                        if not interview_concluding:
                                            await send_realtime_event(websocket, RealtimeInterrupted())
                                            current_interviewer_text.clear()
                                            had_audio_in_turn = False

                                    text_chunk: str | None = None
                                    model_turn = server_content.model_turn
                                    if model_turn is not None:
                                        for part in model_turn.parts:
                                            if part.inline_data and part.inline_data.data:
                                                had_audio_in_turn = True
                                                await websocket.send_bytes(part.inline_data.data)
                                            if part.text:
                                                text_chunk = str(part.text)

                                    if server_content.output_transcription and server_content.output_transcription.text:
                                        text_chunk = str(server_content.output_transcription.text)

                                    if isinstance(text_chunk, str) and text_chunk:
                                        had_audio_in_turn = True
                                        current_interviewer_text.append(text_chunk)
                                        streaming_text = "".join(current_interviewer_text).strip()
                                        await send_realtime_event(
                                            websocket,
                                            RealtimeTranscriptChunk(
                                                role="interviewer",
                                                content=streaming_text,
                                            ),
                                        )

                                    if not interview_concluding:
                                        cand_text: str | None = None
                                        if (
                                            server_content.interim_input_transcription
                                            and server_content.interim_input_transcription.text
                                        ):
                                            cand_text = str(server_content.interim_input_transcription.text).strip()
                                        if (
                                            server_content.input_transcription
                                            and server_content.input_transcription.text
                                        ):
                                            cand_text = str(server_content.input_transcription.text).strip()

                                        if isinstance(cand_text, str) and cand_text:
                                            if transcript and transcript[-1].role == "candidate":
                                                transcript[-1].content = cand_text
                                            else:
                                                transcript.append(Message(role="candidate", content=cand_text))
                                            await send_realtime_event(
                                                websocket,
                                                RealtimeTranscriptChunk(
                                                    role="candidate",
                                                    content=cand_text,
                                                ),
                                            )

                                    if server_content.turn_complete:
                                        full_text = "".join(current_interviewer_text).strip()
                                        if full_text:
                                            transcript.append(Message(role="interviewer", content=full_text))
                                            await send_realtime_event(
                                                websocket,
                                                RealtimeTranscriptFinal(
                                                    role="interviewer",
                                                    content=full_text,
                                                ),
                                            )
                                            current_interviewer_text.clear()
                                        had_audio_in_turn = False
                                        if awaiting_farewell_turn or interview_concluding:
                                            return
                                        candidate_turns = sum(1 for m in transcript if m.role == "candidate")
                                        if full_text and self.is_closing_interviewer_message(
                                            full_text, candidate_turns, len(plan.questions)
                                        ):
                                            interview_concluding = True
                                            accepting_audio = False
                                            return
                    except asyncio.CancelledError:
                        pass
                    except Exception as exc:
                        logger.error("Error receiving from Gemini Live: %s", exc)
                        await send_realtime_event(websocket, RealtimeError(message=str(exc)))

                async def send_to_gemini() -> None:
                    try:
                        while True:
                            msg = await websocket.receive()
                            if "bytes" in msg and msg["bytes"]:
                                if not accepting_audio:
                                    continue
                                pcm_chunk = msg["bytes"]
                                await session.send_realtime_input(
                                    audio=types.Blob(data=pcm_chunk, mime_type="audio/pcm;rate=16000")
                                )
                            elif "text" in msg and msg["text"]:
                                data = json.loads(msg["text"])
                                if data.get("type") == "end_session":
                                    break
                    except WebSocketDisconnect:
                        pass
                    except asyncio.CancelledError:
                        pass
                    except Exception as exc:
                        logger.error("Error sending to Gemini Live: %s", exc)

                recv_task = asyncio.create_task(receive_from_gemini())
                send_task = asyncio.create_task(send_to_gemini())

                done, pending = await asyncio.wait(
                    [recv_task, send_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)

            return transcript

        return await _run_live_session(kickoff_prompt=kickoff_message)

    async def call_llm[T: BaseModel](
        self,
        system_prompt: str,
        output_format: type[T],
        contents: str,
        temperature: float = 0.5,
        model: str | None = None,
        thinking_level: str | None = None,
    ) -> T:
        target_model = (model or "").strip() or self.model
        thinking_config: types.ThinkingConfig | None = None
        cleaned_level = (thinking_level or "").strip()
        if cleaned_level and not target_model.startswith(("gemini-1.", "gemini-2.")):
            thinking_config = types.ThinkingConfig(
                thinking_level=cast(types.ThinkingLevel, cleaned_level.upper()),
            )
        try:
            response = await self.client.aio.models.generate_content(
                model=target_model,
                contents=contents,
                config=GenerateContentConfig(
                    system_instruction=system_prompt,
                    response_mime_type="application/json",
                    response_schema=output_format,
                    temperature=temperature,
                    thinking_config=thinking_config,
                ),
            )
            if response.parsed:
                return cast(T, response.parsed)
            if response.text:
                return output_format.model_validate_json(response.text)
            raise LLMProviderError("Gemini returned empty parsed output.", provider=self.name)

        except errors.APIError as exc:
            is_retryable = (exc.code in (429, 500, 503, 504)) or (exc.code is not None and exc.code >= 500)
            raise LLMProviderError(
                message=f"Gemini API error ({exc.code}): {exc.message}",
                provider=self.name,
                status_code=exc.code or 502,
                is_retryable=is_retryable,
                original_error=exc,
            ) from exc
        except LLMProviderError:
            raise
        except Exception as exc:
            raise LLMProviderError(
                message=f"Gemini request failed: {exc!s}",
                provider=self.name,
                status_code=500,
                is_retryable=False,
                original_error=exc,
            ) from exc

    async def create_plan(self, request: PlanRequest) -> tuple[InterviewPlan, str]:
        contents = json.dumps(request.model_dump(mode="json"))
        result = await self.call_llm(
            system_prompt=self.create_plan_system_prompt,
            output_format=CreatePlanOutputFormat,
            contents=contents,
        )
        return result.plan, result.opening_message

    async def next_turn(self, request: NextTurnRequest) -> tuple[str, bool]:
        contents = json.dumps(request.model_dump(mode="json"))
        result = await self.call_llm(
            system_prompt=self.next_turn_system_prompt,
            output_format=NextTurnOutputFormat,
            contents=contents,
        )
        return result.interviewer_message, result.is_complete

    async def evaluate(self, request: EvaluationRequest) -> Evaluation:
        ctx = self.prepare_evaluation_prompt(request)
        return await self.call_llm(
            system_prompt=ctx.system_prompt,
            output_format=Evaluation,
            contents=ctx.payload_json,
            temperature=0.2,
            model=self.evaluation_model,
            thinking_level=self.evaluation_thinking_level,
        )
