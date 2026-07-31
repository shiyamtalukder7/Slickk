"""Small local knowledge retrieval layer for Slickk Tutor."""

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any


KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"


def normalize(value: str) -> str:
    """Normalize text for lightweight matching."""

    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


CURRICULUM_CATALOG_PATH = (
    KNOWLEDGE_DIR / "curricula" / "catalog.json"
)

SUBJECT_CATALOG_PATH = (
    KNOWLEDGE_DIR / "subjects.json"
)

CURRICULUM_ALIASES = {
    "nctb bangla version": "nctb-bangla",
    "nctb bangla medium": "nctb-bangla",
    "nctb english version": "nctb-english-version",
    "cambridge international": "cambridge",
    "pearson edexcel": "edexcel",
    "pearson edexcel international": "edexcel",
}

SUBJECT_ALIASES = {
    "science": "general-science",
    "general science": "general-science",
    "ict": "ict",
    "information and communication technology": "ict",
    "bangladesh and global studies":
        "bangladesh-global-studies",
    "higher mathematics": "higher-mathematics",
    "computer science": "computer-science",
    "finance and banking": "finance-banking",
    "business entrepreneurship":
        "business-entrepreneurship",
    "religion and moral education": "religion",
    "agricultural studies": "agriculture",
    "physical education and health":
        "physical-education",
}


@lru_cache(maxsize=1)
def load_curriculum_catalog() -> list[dict[str, Any]]:
    """Load registered curriculum definitions."""

    try:
        with CURRICULUM_CATALOG_PATH.open(
            "r",
            encoding="utf-8-sig",
        ) as file:
            payload = json.load(file)
    except (OSError, UnicodeError, json.JSONDecodeError):
        return []

    curricula = payload.get("curricula")

    if not isinstance(curricula, list):
        return []

    return [
        item
        for item in curricula
        if isinstance(item, dict)
        and isinstance(item.get("id"), str)
    ]


@lru_cache(maxsize=1)
def load_subject_catalog() -> list[dict[str, Any]]:
    """Load registered subject definitions."""

    try:
        with SUBJECT_CATALOG_PATH.open(
            "r",
            encoding="utf-8-sig",
        ) as file:
            payload = json.load(file)
    except (OSError, UnicodeError, json.JSONDecodeError):
        return []

    subjects = payload.get("subjects")

    if not isinstance(subjects, list):
        return []

    return [
        item
        for item in subjects
        if isinstance(item, dict)
        and isinstance(item.get("id"), str)
    ]


def resolve_subject_id(value: str) -> str:
    """Resolve subject names and mobile labels to subject IDs."""

    normalized = normalize(str(value))

    if not normalized:
        return ""

    alias = SUBJECT_ALIASES.get(normalized)

    if alias:
        return alias

    for subject in load_subject_catalog():
        subject_id = str(subject.get("id", ""))
        subject_name = str(subject.get("name", ""))

        if normalized in {
            normalize(subject_id),
            normalize(subject_name),
        }:
            return subject_id

    return normalized.replace(" ", "-")


def resolve_level_id(value: str) -> str:
    """Normalize class and grade labels for exact matching."""

    normalized = normalize(str(value))

    if not normalized:
        return ""

    class_match = re.fullmatch(
        r"(?:class|grade)\s*(\d{1,2})",
        normalized,
    )

    if class_match:
        return f"class-{int(class_match.group(1))}"

    return normalized.replace(" ", "-")


def resolve_curriculum_id(value: str) -> str:
    """Resolve curriculum names and mobile aliases to registry IDs."""

    normalized = normalize(str(value))

    if not normalized:
        return ""

    alias = CURRICULUM_ALIASES.get(normalized)

    if alias:
        return alias

    for curriculum in load_curriculum_catalog():
        curriculum_id = str(curriculum.get("id", ""))
        curriculum_name = str(curriculum.get("name", ""))

        if normalized in {
            normalize(curriculum_id),
            normalize(curriculum_name),
        }:
            return curriculum_id

    return normalized.replace(" ", "-")


def normalize_language(value: str) -> str:
    """Normalize supported teaching and lesson languages."""

    normalized = normalize(str(value))

    if normalized in {
        "english",
        "en",
        "en us",
        "english or banglish",
    }:
        return "english"

    if normalized in {
        "bangla",
        "bengali",
        "bn",
        "bn bd",
        "bengali or banglish",
    }:
        return "bangla"

    if normalized in {
        "bilingual",
        "banglish",
        "english bangla",
    }:
        return "multilingual"

    return normalized


def load_documents() -> list[dict[str, Any]]:
    """Load valid local lesson documents from all knowledge folders."""

    documents: list[dict[str, Any]] = []

    if not KNOWLEDGE_DIR.exists():
        return documents

    configuration_files = {
        "catalog.json",
        "lesson_schema.json",
        "subjects.json",
        "teaching_methods.json",
    }

    for path in sorted(KNOWLEDGE_DIR.rglob("*.json")):
        if path.name.lower() in configuration_files:
            continue

        try:
            with path.open("r", encoding="utf-8-sig") as file:
                payload = json.load(file)
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            print(
                f"[Slickk] Skipping invalid knowledge file "
                f"{path}: {error}"
            )
            continue

        if not isinstance(payload, dict):
            continue

        items = payload.get("documents")

        if not isinstance(items, list):
            continue

        documents.extend(
            item for item in items if isinstance(item, dict)
        )

    return documents


def retrieve_knowledge(
    *,
    subject: str,
    topic: str,
    grade: str,
    curriculum: str,
    query: str,
    language: str = "",
    limit: int = 3,
) -> list[dict[str, Any]]:
    """Return the best matching educational documents."""

    requested_curriculum_id = resolve_curriculum_id(
        curriculum
    )
    requested_subject_id = resolve_subject_id(subject)
    requested_level_id = resolve_level_id(grade)
    requested_language = normalize_language(language)

    search_text = normalize(
        " ".join(
            [
                subject,
                topic,
                grade,
                curriculum,
                query,
            ]
        )
    )
    search_terms = set(search_text.split())

    scored: list[tuple[int, dict[str, Any]]] = []

    for document in load_documents():
        document_curriculum_id = resolve_curriculum_id(
            str(document.get("curriculum", ""))
        )
        document_subject_id = resolve_subject_id(
            str(document.get("subject", ""))
        )
        document_level_id = resolve_level_id(
            str(
                document.get("level")
                or document.get("grade", "")
            )
        )

        # Never mix lessons from different curriculum tracks.
        if (
            requested_curriculum_id
            and document_curriculum_id
            != requested_curriculum_id
        ):
            continue

        # Never use one subject's lesson for another subject.
        if (
            requested_subject_id
            and document_subject_id != requested_subject_id
        ):
            continue

        # Never use another class or grade's lesson.
        if (
            requested_level_id
            and document_level_id != requested_level_id
        ):
            continue

        document_language = normalize_language(
            str(document.get("language", ""))
        )

        # English and Bangla lesson content remain isolated.
        # Bilingual and Banglish requests may use either language.
        if (
            requested_language in {"english", "bangla"}
            and document_language
            and document_language != requested_language
        ):
            continue

        document_text = normalize(
            " ".join(
                [
                    str(document.get("subject", "")),
                    str(document.get("topic", "")),
                    str(document.get("grade", "")),
                    str(document.get("curriculum", "")),
                    str(document.get("title", "")),
                    " ".join(document.get("keywords", [])),
                    " ".join(document.get("facts", [])),
                ]
            )
        )

        document_terms = set(document_text.split())
        score = len(search_terms & document_terms)

        if (
            requested_subject_id
            and requested_subject_id == document_subject_id
        ):
            score += 8

        normalized_topic = normalize(topic)
        document_topic = normalize(
            str(document.get("topic", ""))
        )

        if (
            normalized_topic
            and document_topic
            and (
                normalized_topic in document_text
                or document_topic in search_text
            )
        ):
            score += 6

        if (
            requested_level_id
            and requested_level_id == document_level_id
        ):
            score += 4

        if (
            requested_curriculum_id
            and requested_curriculum_id
            == document_curriculum_id
        ):
            score += 3

        if score > 0:
            scored.append((score, document))

    scored.sort(key=lambda item: item[0], reverse=True)

    return [
        document
        for _, document in scored[:limit]
    ]


def format_grounding(
    documents: list[dict[str, Any]],
) -> str:
    """Format retrieved documents for the tutor prompt."""

    if not documents:
        return (
            "No trusted local lesson was found. Clearly state that "
            "verified course material is unavailable and avoid "
            "inventing detailed facts."
        )

    sections: list[str] = []

    for document in documents:
        facts = document.get("facts", [])
        misconceptions = document.get("misconceptions", [])

        section = [
            f"Source ID: {document.get('id', 'unknown')}",
            f"Title: {document.get('title', 'Untitled')}",
            "Verified facts:",
        ]

        section.extend(f"- {fact}" for fact in facts)

        if misconceptions:
            section.append("Misconceptions to correct:")
            section.extend(
                f"- {item}" for item in misconceptions
            )

        sections.append("\n".join(section))

    return "\n\n".join(sections)
