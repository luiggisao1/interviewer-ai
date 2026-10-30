BASELINE_EVALUATION_PROMPT = """Evaluate the candidate against their study guide. Be specific and constructive.

Scoring rules:
The overall_score must be an integer percentage from 0 to 100.
Do not use a 1–10 scale. For example:
- 7/10 must be returned as 70
- 8.5/10 must be returned as 85
- 3/10 must be returned as 30

Calculate the score using this weighted rubric:
- Technical accuracy: 30 points
- Practical examples: 20 points
- Senior-level judgment and trade-offs: 20 points
- Production readiness: 20 points
- Communication clarity: 10 points

Add the awarded points from all categories to produce overall_score.
Do not penalize technical accuracy for grammar mistakes.
Do not penalize the candidate for missing or corrupted transcription.

Score anchors:
90–100: Exceptional senior-level response
80–89: Strong senior-level response
70–79: Good response with some missing depth
60–69: Generally correct but below senior-level depth
40–59: Partial understanding or significant omissions
20–39: Major technical misunderstandings
0–19: Mostly incorrect, irrelevant, or no usable answer

You MUST generate all schema fields:
- overall_score: integer percentage 0 to 100
- summary: concise executive assessment of candidate readiness
- strengths: 2-4 concise bullet points
- improvements: 2-4 concise actionable improvement areas
- study_guide_feedback: 2-4 concise points mapping directly to topics in the guide
- technical_feedback: 2-4 concise points on engineering depth, edge cases, and architectural trade-offs
- senior_answers: exactly {count} items, one for every answer_pairs item, in the same order
- next_steps: 2-3 concise practice steps

Keep each bullet point punchy and concise so the complete evaluation fits comfortably within token limits.

The payload contains an indexed answer_pairs list with {count} captured candidate answers. Return exactly {count}
senior_answers items, one for every answer_pairs item, in the same order. Do not omit short, incomplete, incorrect,
or follow-up answers; those are especially important to coach. Copy each matching question and candidate_answer
accurately.
For each item, provide a strong first-person senior-level answer grounded in the guide and a concise explanation of
why it is stronger. Demonstrate practical experience, trade-offs, production concerns, and clear decision-making
without inventing personal facts or metrics. Use clearly hypothetical examples when needed."""


CALIBRATED_EVALUATION_PROMPT = """Evaluate the candidate against their study guide. Be specific and constructive.

Scoring rules:
The overall_score must be an integer percentage from 0 to 100.
Do not use a 1–10 scale (e.g. 8/10 must be returned as 80).

Calculate the score additively using this weighted rubric:
- Technical accuracy & constraints: 30 points (correct architecture, memory models, mechanisms)
- Concrete practical examples: 20 points (actionable production tooling, diagnostics, code patterns)
- Senior judgment & trade-offs: 20 points (justifying decisions, e.g. streaming vs. buffering, worker recycling)
- Production readiness & observability: 20 points (metrics, alerts, profiling, failure mitigation)
- Communication clarity & structure: 10 points (well-structured, concise, professional tone)

Award points for each category satisfied in context without requiring explicit keyword labels.
Add the awarded points from all categories to produce overall_score.
Do not penalize technical accuracy for grammar mistakes or transcription artifacts.

Calibration & Anti-Bias Guidelines:
- Full Score Anchor: Award 95–100 when a candidate demonstrates solid senior-level mastery across architecture,
  practical tooling, and production readiness. 100 points is fully expected for comprehensive answers.
- No Artificial Nitpicks: Do not invent minor flaws or shift goalposts when an answer already covers constraints,
  trade-offs, and operational realities. If the rubric categories are met, do not deduct points.
- Coaching vs. Grading Differentiation:
  * For senior-level answers (score >= 90): Do NOT frame feedback as corrective remediation. Instead, frame
    `improvements` and `senior_answers` around Staff/Principal-level frontiers (e.g. multi-region scale,
    cross-system failure cascades, zero-downtime evolution, allocator fragmentation). Validate that the candidate's
    answer already meets senior production standards.
  * For developing answers (score < 90): Provide direct, actionable senior-level coaching addressing specific
    missing architectural trade-offs or operational details.

Score anchors:
95–100: Exemplary senior-level response. Comprehensive coverage of trade-offs, failure modes, and production practices.
85–94: Strong senior-level response with solid reasoning, missing only minor edge-case depth.
75–84: Good response with accurate fundamentals, but limited discussion of alternatives or operational impact.
60–74: Partial understanding; defines concepts without demonstrating senior decision-making or practical trade-offs.
40–59: Significant technical omissions or conceptual misunderstandings.
0–39: Incorrect, irrelevant, or unusable answer.

You MUST generate all schema fields:
- overall_score: integer percentage 0 to 100
- summary: concise executive assessment of candidate readiness
- strengths: 2-4 concise bullet points
- improvements: 2-4 concise actionable improvement areas
- study_guide_feedback: 2-4 concise points mapping directly to topics in the guide
- technical_feedback: 2-4 concise points on engineering depth, edge cases, and architectural trade-offs
- senior_answers: exactly {count} items, one for every answer_pairs item, in the same order
- next_steps: 2-3 concise practice steps

Keep each bullet point punchy and concise so the complete evaluation fits comfortably within token limits.

The payload contains an indexed answer_pairs list with {count} captured candidate answers. Return exactly {count}
senior_answers items, one for every answer_pairs item, in the same order. Do not omit short, incomplete, incorrect,
or follow-up answers; those are especially important to coach. Copy each matching question and candidate_answer
accurately.
For each item, provide a strong first-person senior-level answer grounded in the guide and a concise explanation of
why it is stronger. Demonstrate practical experience, trade-offs, production concerns, and clear decision-making
without inventing personal facts or metrics. Use clearly hypothetical examples when needed."""


def build_evaluation_prompt(count: int, version: str = "calibrated") -> str:
    template = CALIBRATED_EVALUATION_PROMPT if version == "calibrated" else BASELINE_EVALUATION_PROMPT
    return template.format(count=count)
