import asyncio
import base64
import json
import logging
from typing import Any, cast

import openai
from fastapi import WebSocketDisconnect
from langsmith import get_current_run_tree, traceable
from langsmith.schemas import ExtractedUsageMetadata
from langsmith.wrappers import wrap_openai
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam
from openai.types.realtime import (
    AudioTranscriptionParam,
    RealtimeAudioConfigInputParam,
    RealtimeAudioConfigOutputParam,
    RealtimeAudioConfigParam,
    RealtimeResponseCreateParamsParam,
    RealtimeSessionCreateRequestParam,
)
from openai.types.realtime.realtime_audio_formats_param import AudioPCM
from openai.types.realtime.realtime_audio_input_turn_detection_param import ServerVad
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


class OpenAIProvider(AIProvider):
    name = "openai"

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        realtime_model: str = "gpt-realtime-2.1-mini",
        recruiter_name: str = "Iris",
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.realtime_model = realtime_model
        self.recruiter_name = recruiter_name
        self.client = wrap_openai(AsyncOpenAI(api_key=api_key))

    @property
    def supports_realtime_audio(self) -> bool:
        return True

    @traceable(name="OpenAI Realtime Interview", run_type="chain")
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

        transcript: list[Message] = []
        current_interviewer_text: list[str] = []
        kickoff_message = (
            f"Please start the interview now by introducing yourself briefly as {self.recruiter_name} "
            "and asking the first question."
        )
        token_usage: dict[str, int] = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

        @traceable(
            name=self.realtime_model,
            run_type="llm",
            metadata={
                "ls_provider": "openai",
                "ls_model_type": "chat",
                "ls_model_name": self.realtime_model,
            },
        )
        async def _run_live_session(kickoff_prompt: str) -> LiveSessionResult:
            nonlocal token_usage
            async with self.client.realtime.connect(model=self.realtime_model) as connection:
                pcm_format = AudioPCM(type="audio/pcm", rate=24000)
                session_config = RealtimeSessionCreateRequestParam(
                    type="realtime",
                    instructions=instructions,
                    output_modalities=["audio"],
                    audio=RealtimeAudioConfigParam(
                        input=RealtimeAudioConfigInputParam(
                            format=pcm_format,
                            transcription=AudioTranscriptionParam(model="gpt-4o-mini-transcribe"),
                            turn_detection=ServerVad(
                                type="server_vad",
                                create_response=True,
                                interrupt_response=True,
                                silence_duration_ms=600,
                            ),
                        ),
                        output=RealtimeAudioConfigOutputParam(
                            format=pcm_format,
                            voice="marin",
                        ),
                    ),
                )
                await connection.session.update(session=session_config)

                await websocket.send_json(
                    {
                        "type": "session_started",
                        "provider": self.name,
                        "model": self.realtime_model,
                    }
                )

                await connection.response.create(
                    response=RealtimeResponseCreateParamsParam(instructions=kickoff_prompt)
                )

                async def receive_from_openai() -> None:
                    try:
                        async for event in connection:
                            event_type = getattr(event, "type", None)

                            if event_type == "input_audio_buffer.speech_started":
                                await websocket.send_json({"type": "interrupted"})
                                current_interviewer_text.clear()

                            elif event_type in ("response.output_audio.delta", "response.audio.delta"):
                                delta = getattr(event, "delta", None)
                                if isinstance(delta, str) and delta:
                                    pcm_bytes = base64.b64decode(delta)
                                    await websocket.send_bytes(pcm_bytes)

                            elif event_type in (
                                "response.output_audio_transcript.delta",
                                "response.audio_transcript.delta",
                            ):
                                delta = getattr(event, "delta", None)
                                if isinstance(delta, str) and delta:
                                    current_interviewer_text.append(delta)
                                    streaming_text = "".join(current_interviewer_text).strip()
                                    await websocket.send_json(
                                        {
                                            "type": "transcript_chunk",
                                            "role": "interviewer",
                                            "content": streaming_text,
                                        }
                                    )

                            elif event_type in (
                                "response.output_audio_transcript.done",
                                "response.audio_transcript.done",
                            ):
                                transcript_val = getattr(event, "transcript", None)
                                final_text = (
                                    transcript_val
                                    if isinstance(transcript_val, str) and transcript_val
                                    else "".join(current_interviewer_text)
                                ).strip()
                                if final_text:
                                    transcript.append(Message(role="interviewer", content=final_text))
                                    await websocket.send_json(
                                        {
                                            "type": "transcript_final",
                                            "role": "interviewer",
                                            "content": final_text,
                                        }
                                    )
                                    current_interviewer_text.clear()

                            elif event_type == "conversation.item.input_audio_transcription.delta":
                                delta = getattr(event, "delta", None)
                                if isinstance(delta, str) and delta:
                                    await websocket.send_json(
                                        {
                                            "type": "transcript_chunk",
                                            "role": "candidate",
                                            "content": delta,
                                        }
                                    )

                            elif event_type == "conversation.item.input_audio_transcription.completed":
                                transcript_val = getattr(event, "transcript", None)
                                cand_text = (transcript_val if isinstance(transcript_val, str) else "").strip()
                                if cand_text:
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

                            elif event_type == "response.done":
                                resp = getattr(event, "response", None)
                                usage = getattr(resp, "usage", None) if resp else None
                                if usage is not None:
                                    inp = getattr(usage, "input_tokens", None)
                                    out = getattr(usage, "output_tokens", None)
                                    tot = getattr(usage, "total_tokens", None)
                                    if isinstance(inp, int) and inp:
                                        token_usage["input_tokens"] += inp
                                    if isinstance(out, int) and out:
                                        token_usage["output_tokens"] += out
                                    if isinstance(tot, int) and tot:
                                        token_usage["total_tokens"] += tot

                            elif event_type == "error":
                                err_obj = getattr(event, "error", None)
                                err_msg = getattr(err_obj, "message", None) if err_obj else None
                                if not isinstance(err_msg, str) or not err_msg:
                                    err_msg = str(err_obj or "OpenAI Realtime error")
                                logger.error("OpenAI Realtime error event: %s", err_msg)
                                await websocket.send_json({"type": "error", "message": err_msg})

                    except asyncio.CancelledError:
                        pass
                    except Exception as exc:
                        logger.error("Error receiving from OpenAI Realtime: %s", exc)
                        await websocket.send_json({"type": "error", "message": str(exc)})

                async def send_to_openai() -> None:
                    try:
                        while True:
                            msg = await websocket.receive()
                            if "bytes" in msg and msg["bytes"]:
                                b64_audio = base64.b64encode(msg["bytes"]).decode("ascii")
                                await connection.input_audio_buffer.append(audio=b64_audio)
                            elif "text" in msg and msg["text"]:
                                data = json.loads(msg["text"])
                                if data.get("type") == "end_session":
                                    break
                    except WebSocketDisconnect:
                        pass
                    except asyncio.CancelledError:
                        pass
                    except Exception as exc:
                        logger.error("Error sending to OpenAI Realtime: %s", exc)

                recv_task = asyncio.create_task(receive_from_openai())
                send_task = asyncio.create_task(send_to_openai())

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
        messages: list[ChatCompletionUserMessageParam],
    ) -> T:
        full_messages = [ChatCompletionSystemMessageParam(role="system", content=system_prompt), *messages]
        try:
            response = await self.client.beta.chat.completions.parse(
                model=self.model,
                messages=full_messages,
                response_format=output_format,
            )
            if not response.choices:
                raise LLMProviderError(
                    message="OpenAI returned empty choices.",
                    provider=self.name,
                    status_code=502,
                    is_retryable=False,
                )
            choice = response.choices[0]
            if choice.message.refusal:
                raise LLMProviderError(
                    message=f"OpenAI refused the request: {choice.message.refusal}",
                    provider=self.name,
                    status_code=400,
                    is_retryable=False,
                )
            if not choice.message.parsed:
                raise LLMProviderError(
                    message="OpenAI returned empty parsed output.",
                    provider=self.name,
                    status_code=502,
                    is_retryable=False,
                )
            return cast(T, choice.message.parsed)
        except LLMProviderError:
            raise
        except openai.RateLimitError as e:
            raise LLMProviderError(
                message="OpenAI rate limit reached. Please wait a moment.",
                provider=self.name,
                status_code=429,
                is_retryable=True,
                original_error=e,
            ) from e
        except openai.APIConnectionError as e:
            raise LLMProviderError(
                message="Failed to connect to OpenAI servers.",
                provider=self.name,
                status_code=504,
                is_retryable=True,
                original_error=e,
            ) from e
        except openai.APIStatusError as e:
            raise LLMProviderError(
                message=f"OpenAI returned error: {e.message}",
                provider=self.name,
                status_code=e.status_code,
                is_retryable=e.status_code >= 500,
                original_error=e,
            ) from e
        except openai.OpenAIError as e:
            raise LLMProviderError(
                message=f"OpenAI error: {str(e)}",
                provider=self.name,
                status_code=502,
                is_retryable=False,
                original_error=e,
            ) from e

    async def create_plan(self, request: PlanRequest) -> tuple[InterviewPlan, str]:
        messages = [
            ChatCompletionUserMessageParam(content=json.dumps(request.model_dump(mode="json")), role="user"),
        ]
        result = await self.call_llm(
            self.create_plan_system_prompt,
            output_format=CreatePlanOutputFormat,
            messages=messages,
        )
        return result.plan, result.opening_message

    async def next_turn(self, request: NextTurnRequest) -> tuple[str, bool]:
        messages = [
            ChatCompletionUserMessageParam(content=json.dumps(request.model_dump(mode="json")), role="user"),
        ]
        result = await self.call_llm(
            self.next_turn_system_prompt,
            output_format=NextTurnOutputFormat,
            messages=messages,
        )
        return result.interviewer_message, result.is_complete

    async def evaluate(self, request: EvaluationRequest) -> Evaluation:
        ctx = self.prepare_evaluation_prompt(request)
        messages = [
            ChatCompletionUserMessageParam(content=ctx.payload_json, role="user"),
        ]
        result = await self.call_llm(
            system_prompt=ctx.system_prompt,
            output_format=Evaluation,
            messages=messages,
        )

        if 1 <= result.overall_score <= 10 and ctx.count > 0:
            if any(len(p.candidate_answer.split()) >= 3 for p in ctx.answer_pairs):
                result.overall_score = min(100, result.overall_score * 10)

        return result
