from pathlib import Path

from pydantic import BaseModel


def get_study_guide_path() -> Path | None:
    candidate_paths = [
        Path(__file__).resolve().parent / "study_guide.md",
        Path(__file__).resolve().parents[1] / "study_guide.md",
        Path(__file__).resolve().parents[2] / "study_guide.md",
        Path.cwd() / "study_guide.md",
    ]
    for p in candidate_paths:
        if p.is_file():
            return p
    return None


SECTION_TITLES = (
    "Python",
    "SQL",
    "Google BigQuery",
    "Google Cloud Platform (GCP)",
    "ETL Pipelines and Data Engineering",
    "Connecting the Technologies Together",
)


class StudyGuideSection(BaseModel):
    id: str
    title: str
    content: str


def _section_id(title: str) -> str:
    return title.lower().replace("(", "").replace(")", "").replace(" ", "-")


def load_study_guide_sections() -> list[StudyGuideSection]:
    guide_path = get_study_guide_path()
    if not guide_path or not guide_path.is_file():
        return []

    text = guide_path.read_text(encoding="utf-8")
    positions: list[tuple[int, str]] = []
    for title in SECTION_TITLES:
        marker = f"\n{title}\n"
        position = text.find(marker)
        if position >= 0:
            positions.append((position + 1, title))

    positions.sort()
    sections: list[StudyGuideSection] = []
    for index, (start, title) in enumerate(positions):
        end = positions[index + 1][0] if index + 1 < len(positions) else len(text)
        content = text[start:end].strip()
        if content:
            sections.append(
                StudyGuideSection(id=_section_id(title), title=title, content=content)
            )
    return sections
