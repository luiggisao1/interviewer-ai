import copy
import json
import logging
from typing import cast

import anthropic
from anthropic import DefaultAioHttpClient
from anthropic.types.beta import BetaMessageParam, BetaUserMessageParam
from langsmith.wrappers import wrap_anthropic
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


def _dereference_schema(schema: dict) -> dict:
    normalized = copy.deepcopy(schema)
    defs = normalized.pop("$defs", {})

    def visit(node: object) -> None:
        if isinstance(node, dict):
            if "$ref" in node:
                ref = node.pop("$ref")
                key = ref.split("/")[-1]
                if key in defs:
                    node.update(copy.deepcopy(defs[key]))
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for item in node:
                visit(item)

    visit(normalized)
    return normalized


class AnthropicProvider(AIProvider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022") -> None:
        self.api_key = api_key
        self.model = model
        self.client = wrap_anthropic(anthropic.AsyncAnthropic(api_key=self.api_key, http_client=DefaultAioHttpClient()))

    async def call_llm[T: BaseModel](
        self, system_prompt: str, output_format: type[T], max_tokens: int, messages: list[BetaMessageParam]
    ) -> T:
        try:
            response = await self.client.beta.messages.parse(
                model=self.model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=messages,
                output_format=output_format,
            )
            if response.stop_reason == "max_tokens":
                logger.warning("Anthropic response reached max_tokens limit (%s)", max_tokens)

            if not response.parsed_output:
                raise LLMProviderError("Claude returned empty parsed output.")
            return cast(T, response.parsed_output)

        except anthropic.RateLimitError as e:
            raise LLMProviderError(
                message="Anthropic rate limit reached. Please wait a moment.",
                provider="anthropic",
                status_code=429,
                is_retryable=True,
                original_error=e,
            ) from e
        except anthropic.APIConnectionError as e:
            raise LLMProviderError(
                message="Failed to connect to Anthropic servers.",
                provider="anthropic",
                status_code=504,
                is_retryable=True,
                original_error=e,
            ) from e
        except anthropic.APIStatusError as e:
            raise LLMProviderError(
                message=f"Anthropic returned error: {e.message}",
                provider="anthropic",
                status_code=e.status_code,
                is_retryable=e.status_code >= 500,
                original_error=e,
            ) from e

    async def create_plan(self, request: PlanRequest) -> tuple[InterviewPlan, str]:
        messages: list[BetaMessageParam] = [
            BetaUserMessageParam(role="user", content=json.dumps(request.model_dump(mode="json"))),
        ]
        max_tokens = 8192
        result = await self.call_llm(
            self.create_plan_system_prompt,
            output_format=CreatePlanOutputFormat,
            max_tokens=max_tokens,
            messages=messages,
        )

        return result.plan, result.opening_message

    async def next_turn(self, request: NextTurnRequest) -> tuple[str, bool]:
        messages: list[BetaMessageParam] = [
            BetaUserMessageParam(role="user", content=json.dumps(request.model_dump(mode="json"))),
        ]
        max_tokens = 1024
        result = await self.call_llm(
            self.next_turn_system_prompt,
            output_format=NextTurnOutputFormat,
            max_tokens=max_tokens,
            messages=messages,
        )
        return result.interviewer_message, result.is_complete

    async def evaluate(self, request: EvaluationRequest) -> Evaluation:
        ctx = self.prepare_evaluation_prompt(request)
        messages: list[BetaMessageParam] = [
            BetaUserMessageParam(role="user", content=ctx.payload_json),
        ]

        result = await self.call_llm(
            system_prompt=ctx.system_prompt,
            output_format=Evaluation,
            max_tokens=8192,
            messages=messages,
        )

        if 1 <= result.overall_score <= 10 and ctx.count > 0:
            if any(len(p.candidate_answer.split()) >= 3 for p in ctx.answer_pairs):
                result.overall_score = min(100, result.overall_score * 10)

        return result
