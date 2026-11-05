import asyncio
import json
import logging
from typing import Any, cast

from fastapi import WebSocketDisconnect
from google import genai
from google.genai import errors, types
from google.genai.types import GenerateContentConfig, HttpOptions
from langsmith import get_current_run_tree, traceable, wrappers
from langsmith.schemas import ExtractedUsageMetadata
from pydantic import BaseModel

from app.exceptions import LLMProviderError
from app.schemas import (
    CreatePlanOutputFormat,
    Evaluation,
    EvaluationRequest,
    InterviewConfig,
    InterviewPlan,
    LiveSessionResult,
    LiveSessionUsage,
    Message,
    NextTurnOutputFormat,
    NextTurnRequest,
    PlanRequest,
    Role,
)
from app.services.base import AIProvider

logger = logging.getLogger(__name__)


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.5-flash-lite",
        live_model: str = "gemini-3.8-live",
        recruiter_name: str = "Iris",
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.live_model = live_model
        self.recruiter_name = recruiter_name
        gemini_client = genai.Client(
            api_key=api_key,
            http_options=HttpOptions(api_version="v1alpha"),
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

    @traceable(name="Gemini Live Realtime Interview", run_type="chain")
    async def handle_realtime_audio_session(
        self,
        websocket: Any,
        plan: InterviewPlan,
        config: InterviewConfig,
        study_guide: str,
    ) -> list[Message]:
        role = config.custom_role.strip() if config.role == Role.custom and config.custom_role else config.role.value
        diff = config.difficulty.value
        questions = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(plan.questions))

        instructions = (
            f"Your name is {self.recruiter_name}. You are conducting a spoken {diff} {role} practice interview.\n"
            f"Use only the supplied study guide as your technical ground truth.\n"
            f"Ask one concise question at a time and follow the planned questions in order:\n{questions}\n"
            "Listen patiently to natural pauses and non-native English. "
            "Keep spoken responses concise (1-2 sentences), then wait for the candidate's answer.\n"
            f"Start immediately by introducing yourself briefly as {self.recruiter_name} "
            "and asking the first interview question.\n"
            "When all planned questions are completed, state that the interview is concluded.\n\n"
            f"Study guide content:\n{study_guide[:15000]}"
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
            system_instruction=instructions,
        )

        transcript: list[Message] = []
        current_interviewer_text: list[str] = []
        kickoff_message = (
            f"Please start the interview now by introducing yourself briefly as {self.recruiter_name} "
            "and asking the first question."
        )
        token_usage: dict[str, int] = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

        @traceable(
            name=self.live_model,
            run_type="llm",
            metadata={
                "ls_provider": "google",
                "ls_model_type": "chat",
                "ls_model_name": self.live_model,
            },
        )
        async def _run_live_session(kickoff_prompt: str) -> LiveSessionResult:
            nonlocal token_usage
            async with self.client.aio.live.connect(model=self.live_model, config=live_config) as session:
                await websocket.send_json(
                    {
                        "type": "session_started",
                        "provider": self.name,
                        "model": self.live_model,
                    }
                )

                await session.send(
                    input=kickoff_prompt,
                    end_of_turn=True,
                )

                async def receive_from_gemini() -> None:
                    try:
                        while True:
                            async for response in session.receive():
                                if response.usage_metadata is not None:
                                    u = response.usage_metadata
                                    if u.prompt_token_count is not None:
                                        token_usage["input_tokens"] = u.prompt_token_count
                                    if u.response_token_count is not None:
                                        token_usage["output_tokens"] = u.response_token_count
                                    if u.total_token_count is not None:
                                        token_usage["total_tokens"] = u.total_token_count

                                server_content = response.server_content
                                if server_content is not None:
                                    if server_content.interrupted:
                                        await websocket.send_json({"type": "interrupted"})
                                        current_interviewer_text.clear()

                                    text_chunk: str | None = None
                                    model_turn = server_content.model_turn
                                    if model_turn is not None:
                                        for part in model_turn.parts:
                                            if part.inline_data and part.inline_data.data:
                                                await websocket.send_bytes(part.inline_data.data)
                                            if part.text:
                                                text_chunk = str(part.text)

                                    if server_content.output_transcription and server_content.output_transcription.text:
                                        text_chunk = str(server_content.output_transcription.text)

                                    if isinstance(text_chunk, str) and text_chunk:
                                        current_interviewer_text.append(text_chunk)
                                        streaming_text = "".join(current_interviewer_text).strip()
                                        await websocket.send_json(
                                            {
                                                "type": "transcript_chunk",
                                                "role": "interviewer",
                                                "content": streaming_text,
                                            }
                                        )

                                    cand_text: str | None = None
                                    if (
                                        server_content.interim_input_transcription
                                        and server_content.interim_input_transcription.text
                                    ):
                                        cand_text = str(server_content.interim_input_transcription.text).strip()
                                    if server_content.input_transcription and server_content.input_transcription.text:
                                        cand_text = str(server_content.input_transcription.text).strip()

                                    if isinstance(cand_text, str) and cand_text:
                                        if transcript and transcript[-1].role == "candidate":
                                            transcript[-1].content = cand_text
                                        else:
                                            transcript.append(Message(role="candidate", content=cand_text))
                                        await websocket.send_json(
                                            {
                                                "type": "transcript_chunk",
                                                "role": "candidate",
                                                "content": cand_text,
                                            }
                                        )

                                    if server_content.turn_complete:
                                        full_text = "".join(current_interviewer_text).strip()
                                        if full_text:
                                            transcript.append(Message(role="interviewer", content=full_text))
                                            await websocket.send_json(
                                                {
                                                    "type": "transcript_final",
                                                    "role": "interviewer",
                                                    "content": full_text,
                                                }
                                            )
                                            current_interviewer_text.clear()
                    except asyncio.CancelledError:
                        pass
                    except Exception as exc:
                        logger.error("Error receiving from Gemini Live: %s", exc)
                        await websocket.send_json({"type": "error", "message": str(exc)})

                async def send_to_gemini() -> None:
                    try:
                        while True:
                            msg = await websocket.receive()
                            if "bytes" in msg and msg["bytes"]:
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

            final_input_tokens = token_usage["input_tokens"] or max(1, len(instructions) // 4)
            final_output_tokens = token_usage["output_tokens"]
            final_total_tokens = token_usage["total_tokens"] or (final_input_tokens + final_output_tokens)
            final_interviewer_turns = "\n\n".join(m.content for m in transcript if m.role == "interviewer")

            llm_run = get_current_run_tree()
            if llm_run:
                llm_usage_meta: ExtractedUsageMetadata = {
                    "input_tokens": final_input_tokens,
                    "output_tokens": final_output_tokens,
                    "total_tokens": final_total_tokens,
                }
                llm_run.set(usage_metadata=llm_usage_meta)

            return LiveSessionResult(
                transcript=transcript,
                interviewer_turns=final_interviewer_turns,
                usage=LiveSessionUsage(
                    input_tokens=final_input_tokens,
                    output_tokens=final_output_tokens,
                    total_tokens=final_total_tokens,
                ),
            )

        live_result = await _run_live_session(kickoff_prompt=kickoff_message)

        current_run = get_current_run_tree()
        if current_run:
            usage_meta: ExtractedUsageMetadata = {
                "input_tokens": live_result.usage.input_tokens,
                "output_tokens": live_result.usage.output_tokens,
                "total_tokens": live_result.usage.total_tokens,
            }
            current_run.set(usage_metadata=usage_meta)

        return live_result.transcript

    async def call_llm[T: BaseModel](
        self,
        system_prompt: str,
        output_format: type[T],
        contents: str,
        temperature: float = 0.5,
    ) -> T:
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=contents,
                config=GenerateContentConfig(
                    system_instruction=system_prompt,
                    response_mime_type="application/json",
                    response_schema=output_format,
                    temperature=temperature,
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
        )
