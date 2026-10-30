import copy
import json
import logging
from typing import TypeVar, cast

import anthropic
from anthropic import DefaultAioHttpClient
from anthropic.types.beta import BetaMessageParam, BetaUserMessageParam
from langsmith.wrappers import wrap_anthropic
from pydantic import BaseModel

from app.exceptions import LLMProviderError
from app.schemas import (
    Evaluation,
    EvaluationRequest,
    InterviewPlan,
    NextTurnRequest,
    PlanRequest,
)
from app.services.base import AIProvider
from app.services.prompts import build_evaluation_prompt

logger = logging.getLogger(__name__)


T = TypeVar("T", bound=BaseModel)


class CreatePlanOutputFormat(BaseModel):
    plan: InterviewPlan
    opening_message: str

class NextTurnOutputFormat(BaseModel):
    interviewer_message: str
    is_complete: bool


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
        self.client = wrap_anthropic(
            anthropic.AsyncAnthropic(api_key=self.api_key, http_client=DefaultAioHttpClient())
        )

    async def call_llm(
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
        system_prompt = (
            "Create a practical interview plan based only on the supplied guide. "
            "Keep questions concise. Follow custom instructions when safe. "
            "Do not provide any additional information or context."
            "Create a welcome message introducing yourself and the interview plan."
        )

        result = await self.call_llm(
            system_prompt, output_format=CreatePlanOutputFormat, max_tokens=max_tokens, messages=messages
        )

        return result.plan, result.opening_message

    async def next_turn(self, request: NextTurnRequest) -> tuple[str, bool]:
        messages: list[BetaMessageParam] = [
            BetaUserMessageParam(role="user", content=json.dumps(request.model_dump(mode="json"))),
        ]
        max_tokens = 1024
        system_prompt = (
            "Act as a supportive but realistic interviewer. Briefly react, then ask one planned question. "
            "Mark complete when estimated turns are answered. Do not provide evaluation yet."
        )

        result = await self.call_llm(
            system_prompt, output_format=NextTurnOutputFormat, max_tokens=max_tokens, messages=messages
        )
        return result.interviewer_message, result.is_complete

    async def evaluate(self, request: EvaluationRequest) -> Evaluation:
        answer_pairs: list[dict[str, str | int]] = []
        last_question = "Interview question"
        for message in request.transcript:
            if message.role == "interviewer":
                last_question = message.content
            elif message.role == "candidate":
                answer_pairs.append(
                    {
                        "number": len(answer_pairs) + 1,
                        "question": last_question,
                        "candidate_answer": message.content,
                    }
                )

        payload = request.model_dump(mode="json")
        payload["answer_pairs"] = answer_pairs
        count = len(answer_pairs)
        system = build_evaluation_prompt(count=count)

        messages: list[BetaMessageParam] = [
            BetaUserMessageParam(role="user", content=json.dumps(payload)),
        ]

        result = await self.call_llm(
            system_prompt=system,
            output_format=Evaluation,
            max_tokens=8192,
            messages=messages,
        )

        if 1 <= result.overall_score <= 10 and count > 0:
            if any(len(str(p.get("candidate_answer", "")).split()) >= 3 for p in answer_pairs):
                result.overall_score = min(100, result.overall_score * 10)

        return result
