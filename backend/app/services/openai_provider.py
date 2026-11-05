import json
import logging
from typing import cast

import openai
from langsmith.wrappers import wrap_openai
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam
from pydantic import BaseModel

from app.exceptions import LLMProviderError
from app.schemas import (
    CreatePlanOutputFormat,
    Evaluation,
    EvaluationRequest,
    InterviewPlan,
    NextTurnOutputFormat,
    NextTurnRequest,
    PlanRequest,
)
from app.services.base import AIProvider

logger = logging.getLogger(__name__)


class OpenAIProvider(AIProvider):
    name = "openai"

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        recruiter_name: str = "Iris",
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.recruiter_name = recruiter_name
        self.client = wrap_openai(AsyncOpenAI(api_key=api_key))

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
