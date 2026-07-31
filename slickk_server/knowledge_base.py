"""Small local knowledge retrieval layer for Slickk Tutor."""

import json
import re
from pathlib import Path
from typing import Any


KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"


def normalize(value: str) -> str:
    """Normalize text for lightweight matching."""

    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


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
    limit: int = 3,
) -> list[dict[str, Any]]:
    """Return the best matching educational documents."""

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

        if normalize(subject) == normalize(
            str(document.get("subject", ""))
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

        if normalize(grade) == normalize(
            str(document.get("grade", ""))
        ):
            score += 4

        if normalize(curriculum) == normalize(
            str(document.get("curriculum", ""))
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
