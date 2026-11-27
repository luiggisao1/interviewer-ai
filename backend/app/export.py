from app.schemas import (
    QuestionGroup,
    StorageMode,
    StoredSessionDetail,
)


def _storage_label(storage_mode: StorageMode) -> str:
    return "Senior Only" if storage_mode == StorageMode.senior_only else "My Answers + Senior"


def _append_answer_sections(
    lines: list[str],
    *,
    candidate_answer: str | None,
    senior_answer: str,
    why_stronger: str,
    heading_level: str,
    include_candidate_answers: bool,
    include_senior_answers: bool,
) -> None:
    if include_candidate_answers:
        lines.append(f"{heading_level} Candidate Answer")
        if candidate_answer is None:
            lines.append("_Candidate answer not stored (Senior-only mode)_")
        else:
            lines.append(candidate_answer.strip() or "_No response recorded._")
        lines.append("")

    if include_senior_answers:
        lines.append(f"{heading_level} LLM Suggested Senior Answer")
        if senior_answer.strip():
            lines.append(senior_answer.strip())
            if why_stronger.strip():
                lines.append("")
                lines.append(f"> **Why stronger:** {why_stronger.strip()}")
        else:
            validation = why_stronger.strip() or "Candidate response already matched senior benchmark bar."
            lines.append(f"_Gold Standard Validation:_ {validation}")
        lines.append("")


def format_session_markdown(
    detail: StoredSessionDetail,
    *,
    include_candidate_answers: bool = True,
    include_senior_answers: bool = True,
) -> str:
    title = (
        detail.study_guide_section.strip()
        or detail.plan_title.strip()
        or f"{detail.difficulty} {detail.role}"
    )
    lines: list[str] = [
        f"# Interview Session: {title}",
        "",
    ]
    if detail.plan_title.strip():
        lines.append(f"- **Plan:** {detail.plan_title.strip()}")
    lines.append(f"- **Role:** {detail.difficulty} {detail.role} ({detail.mode})")
    if detail.study_guide_section.strip():
        lines.append(f"- **Topic:** {detail.study_guide_section.strip()}")
    lines.append(f"- **Storage Mode:** {_storage_label(detail.storage_mode)}")
    if detail.overall_score is not None:
        lines.append(f"- **Score:** {detail.overall_score}/100")
    lines.append(f"- **Date:** {detail.created_at}")
    if detail.provider.strip():
        lines.append(f"- **Engine:** {detail.provider.strip()}")
    lines.append("")

    if detail.summary.strip():
        lines.extend(
            [
                "## Executive Summary",
                "",
                detail.summary.strip(),
                "",
            ]
        )

    for item in detail.responses:
        lines.extend(
            [
                f"## Q{item.question_order}. {item.question}",
                "",
            ]
        )
        _append_answer_sections(
            lines,
            candidate_answer=item.candidate_answer,
            senior_answer=item.senior_answer,
            why_stronger=item.why_stronger,
            heading_level="###",
            include_candidate_answers=include_candidate_answers,
            include_senior_answers=include_senior_answers,
        )

    return "\n".join(lines).rstrip() + "\n"


def format_questions_markdown(
    groups: list[QuestionGroup],
    *,
    include_candidate_answers: bool = True,
    include_senior_answers: bool = True,
) -> str:
    total_responses = sum(group.answer_count for group in groups)
    lines: list[str] = [
        "# Interview Response Archive — Grouped by Question",
        "",
        f"- **Questions:** {len(groups)}",
        f"- **Responses:** {total_responses}",
        "",
    ]

    if not groups:
        lines.append("_No saved responses matched your filters._")
        return "\n".join(lines).rstrip() + "\n"

    for group_idx, group in enumerate(groups, start=1):
        lines.extend(
            [
                f"## Q{group_idx}. {group.question}",
                "",
            ]
        )
        meta_parts: list[str] = []
        if group.study_guide_section.strip():
            meta_parts.append(f"**Topic:** {group.study_guide_section.strip()}")
        meta_parts.append(f"**Responses:** {group.answer_count}")
        lines.append(" · ".join(meta_parts))
        lines.append("")

        for entry_idx, entry in enumerate(group.entries, start=1):
            header_meta = [
                f"{entry.difficulty} {entry.role}",
                _storage_label(entry.storage_mode),
            ]
            if entry.overall_score is not None:
                header_meta.append(f"Score: {entry.overall_score}/100")
            header_meta.append(entry.created_at)

            lines.extend(
                [
                    f"### Response {entry_idx} ({' · '.join(header_meta)})",
                    "",
                ]
            )
            _append_answer_sections(
                lines,
                candidate_answer=entry.candidate_answer,
                senior_answer=entry.senior_answer,
                why_stronger=entry.why_stronger,
                heading_level="####",
                include_candidate_answers=include_candidate_answers,
                include_senior_answers=include_senior_answers,
            )

    return "\n".join(lines).rstrip() + "\n"


def format_sessions_markdown(
    details: list[StoredSessionDetail],
    *,
    include_candidate_answers: bool = True,
    include_senior_answers: bool = True,
) -> str:
    lines: list[str] = [
        "# Interview Response Archive — Sessions",
        "",
        f"- **Sessions:** {len(details)}",
        "",
    ]
    if not details:
        lines.append("_No saved sessions matched your filters._")
        return "\n".join(lines).rstrip() + "\n"

    sections = [
        format_session_markdown(
            detail,
            include_candidate_answers=include_candidate_answers,
            include_senior_answers=include_senior_answers,
        ).rstrip()
        for detail in details
    ]
    return "\n".join(lines) + "\n---\n\n" + "\n\n---\n\n".join(sections) + "\n"
