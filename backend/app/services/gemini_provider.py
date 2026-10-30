import json
import logging
from typing import cast

from google import genai
from google.genai import errors
from google.genai.types import GenerateContentConfig, HttpOptions
from langsmith import wrappers
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
from app.services.prompts import build_evaluation_prompt

logger = logging.getLogger(__name__)


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        self.api_key = api_key
        self.model = model
        gemini_client = genai.Client(
            api_key=api_key,
            http_options=HttpOptions(api_version="v1"),
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

        return await self.call_llm(
            system_prompt=system,
            output_format=Evaluation,
            contents=json.dumps(payload),
        )
