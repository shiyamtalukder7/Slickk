from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from slickk_server.knowledge_base import (
    KNOWLEDGE_DIR,
    normalize_language,
    resolve_curriculum_id,
    resolve_level_id,
    resolve_subject_id,
)


LESSON_SCHEMA_PATH = KNOWLEDGE_DIR / "lesson_schema.json"
DEFAULT_OUTPUT_DIRECTORY = KNOWLEDGE_DIR / "approved"
OCR_REJECTION_MARKER = "[OCR_REJECTED_PAGE]"


class TextbookPromotionError(RuntimeError):
    """Raised when staged content cannot be promoted safely."""


def slugify(value: str) -> str:
    """Create a stable lowercase identifier."""

    slug = re.sub(
        r"[^a-z0-9]+",
        "-",
        value.lower(),
    ).strip("-")

    return slug or "lesson"


def read_json_object(
    path: Path,
    *,
    label: str,
) -> dict[str, Any]:
    """Read a JSON file whose root must be an object."""

    try:
        with path.open(
            "r",
            encoding="utf-8-sig",
        ) as file:
            payload = json.load(file)
    except (
        OSError,
        UnicodeError,
        json.JSONDecodeError,
    ) as error:
        raise TextbookPromotionError(
            f"Could not read {label}: {error}"
        ) from error

    if not isinstance(payload, dict):
        raise TextbookPromotionError(
            f"{label} must contain a JSON object."
        )

    return payload


def clean_string_list(value: Any) -> list[str]:
    """Return unique non-empty strings while preserving order."""

    if not isinstance(value, list):
        return []

    cleaned: list[str] = []
    seen: set[str] = set()

    for item in value:
        if not isinstance(item, str):
            continue

        text = item.strip()

        if not text:
            continue

        key = text.casefold()

        if key in seen:
            continue

        seen.add(key)
        cleaned.append(text)

    return cleaned


def load_lesson_schema() -> dict[str, Any]:
    """Load Slickk's authoritative production lesson schema."""

    return read_json_object(
        LESSON_SCHEMA_PATH,
        label="lesson schema",
    )


def validate_staging_payload(
    payload: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    """Validate the outer textbook staging package."""

    if payload.get("format") != "slickk-textbook-staging-v1":
        raise TextbookPromotionError(
            "Unsupported staging format."
        )

    if payload.get("production_knowledge") is not False:
        raise TextbookPromotionError(
            "The source must be a non-production staging package."
        )

    metadata = payload.get("metadata")
    source = payload.get("source")
    chunks = payload.get("chunks")

    if not isinstance(metadata, dict):
        raise TextbookPromotionError(
            "The staging package has no valid metadata."
        )

    if not isinstance(source, dict):
        raise TextbookPromotionError(
            "The staging package has no valid source record."
        )

    if not isinstance(chunks, list):
        raise TextbookPromotionError(
            "The staging package has no valid chunks list."
        )

    valid_chunks = [
        chunk
        for chunk in chunks
        if isinstance(chunk, dict)
    ]

    return metadata, source, valid_chunks


def validate_approved_chunk(
    chunk: dict[str, Any],
) -> dict[str, Any] | None:
    """Validate one approved human-review record."""

    review = chunk.get("review")

    if not isinstance(review, dict):
        return None

    if review.get("approved") is not True:
        return None

    notes = str(
        review.get("notes", "")
    )

    if OCR_REJECTION_MARKER in notes:
        chunk_id = str(
            chunk.get("id", "unknown")
        )

        raise TextbookPromotionError(
            f"Approved chunk {chunk_id} contains "
            f"{OCR_REJECTION_MARKER} and cannot "
            "be promoted."
        )

    reviewer = str(
        review.get("reviewer", "")
    ).strip()
    chapter = str(
        review.get("chapter", "")
    ).strip()
    topic = str(
        review.get("topic", "")
    ).strip()

    objectives = clean_string_list(
        review.get("learning_objectives")
    )
    facts = clean_string_list(
        review.get("verified_facts")
    )
    mistakes = clean_string_list(
        review.get("common_mistakes")
    )

    missing: list[str] = []

    if not reviewer:
        missing.append("reviewer")

    if not chapter:
        missing.append("chapter")

    if not topic:
        missing.append("topic")

    if not objectives:
        missing.append("learning_objectives")

    if not facts:
        missing.append("verified_facts")

    if missing:
        chunk_id = str(
            chunk.get("id", "unknown")
        )

        raise TextbookPromotionError(
            f"Approved chunk {chunk_id} is missing: "
            + ", ".join(missing)
        )

    try:
        page_start = int(
            chunk.get("page_start", 0)
        )
        page_end = int(
            chunk.get("page_end", page_start)
        )
    except (TypeError, ValueError) as error:
        raise TextbookPromotionError(
            "Approved chunk contains invalid page numbers."
        ) from error

    if page_start < 1 or page_end < page_start:
        raise TextbookPromotionError(
            "Approved chunk contains an invalid page range."
        )

    return {
        "reviewer": reviewer,
        "chapter": chapter,
        "topic": topic,
        "learning_objectives": objectives,
        "verified_facts": facts,
        "common_mistakes": mistakes,
        "page_start": page_start,
        "page_end": page_end,
    }


def metadata_identity(
    metadata: dict[str, Any],
) -> dict[str, str]:
    """Canonicalize and validate staged lesson identity."""

    curriculum = resolve_curriculum_id(
        str(metadata.get("curriculum", ""))
    )
    level = str(
        metadata.get("level", "")
    ).strip()
    level_id = resolve_level_id(
        str(
            metadata.get("level_id")
            or level
        )
    )
    subject = resolve_subject_id(
        str(metadata.get("subject", ""))
    )
    language = normalize_language(
        str(metadata.get("language", ""))
    )
    title = str(
        metadata.get("title", "")
    ).strip()

    missing = [
        name
        for name, value in {
            "curriculum": curriculum,
            "level": level,
            "level_id": level_id,
            "subject": subject,
            "language": language,
            "title": title,
        }.items()
        if not value
    ]

    if missing:
        raise TextbookPromotionError(
            "Staging metadata is missing: "
            + ", ".join(missing)
        )

    return {
        "curriculum": curriculum,
        "level": level,
        "level_id": level_id,
        "subject": subject,
        "language": language,
        "title": title,
    }


def stable_lesson_id(
    *,
    identity: dict[str, str],
    chapter: str,
    topic: str,
    source_hash: str,
) -> str:
    """Create a deterministic lesson identifier."""

    base = "-".join(
        [
            identity["curriculum"],
            identity["level_id"],
            identity["subject"],
            slugify(chapter),
            slugify(topic),
            source_hash[:10],
        ]
    )

    return slugify(base)


def build_source_references(
    *,
    filename: str,
    page_ranges: list[tuple[int, int]],
) -> list[str]:
    """Build readable source-page references."""

    references: list[str] = []

    for page_start, page_end in sorted(
        set(page_ranges)
    ):
        if page_start == page_end:
            page_label = f"page {page_start}"
        else:
            page_label = (
                f"pages {page_start}-{page_end}"
            )

        references.append(
            f"{filename}, {page_label}"
        )

    return references


def build_production_documents(
    payload: dict[str, Any],
) -> list[dict[str, Any]]:
    """Convert approved review groups into production lessons."""

    metadata, source, chunks = validate_staging_payload(
        payload
    )
    identity = metadata_identity(metadata)

    approved: list[dict[str, Any]] = []

    for chunk in chunks:
        validated = validate_approved_chunk(chunk)

        if validated is not None:
            approved.append(validated)

    if not approved:
        raise TextbookPromotionError(
            "No human-approved chunks were found."
        )

    grouped: dict[
        tuple[str, str],
        list[dict[str, Any]],
    ] = defaultdict(list)

    for item in approved:
        grouped[
            (
                item["chapter"],
                item["topic"],
            )
        ].append(item)

    filename = str(
        source.get("filename", "unknown source")
    )
    source_hash = str(
        source.get("sha256", "")
    ).strip()

    if not re.fullmatch(
        r"[a-fA-F0-9]{64}",
        source_hash,
    ):
        raise TextbookPromotionError(
            "The staging source SHA256 is invalid."
        )

    documents: list[dict[str, Any]] = []

    for (chapter, topic), items in sorted(
        grouped.items()
    ):
        objectives = clean_string_list(
            [
                objective
                for item in items
                for objective in item[
                    "learning_objectives"
                ]
            ]
        )
        facts = clean_string_list(
            [
                fact
                for item in items
                for fact in item["verified_facts"]
            ]
        )
        mistakes = clean_string_list(
            [
                mistake
                for item in items
                for mistake in item[
                    "common_mistakes"
                ]
            ]
        )
        reviewers = clean_string_list(
            [
                item["reviewer"]
                for item in items
            ]
        )
        page_ranges = [
            (
                item["page_start"],
                item["page_end"],
            )
            for item in items
        ]

        sources = build_source_references(
            filename=filename,
            page_ranges=page_ranges,
        )

        keywords = clean_string_list(
            re.findall(
                r"[A-Za-z0-9]+",
                f"{chapter} {topic}",
            )
        )

        lesson_id = stable_lesson_id(
            identity=identity,
            chapter=chapter,
            topic=topic,
            source_hash=source_hash,
        )

        document: dict[str, Any] = {
            "id": lesson_id,
            "title": topic,
            "curriculum": identity["curriculum"],
            "level": identity["level"],
            "grade": identity["level"],
            "subject": identity["subject"],
            "chapter": chapter,
            "topic": topic,
            "language": identity["language"],
            "keywords": keywords,
            "learning_objectives": objectives,
            "verified_facts": facts,
            "facts": facts,
            "common_mistakes": mistakes,
            "misconceptions": mistakes,
            "teaching": {
                "simple_explanation": facts[0],
                "detailed_explanation": " ".join(
                    facts
                ),
                "socratic_questions": [
                    (
                        "What is the main idea you "
                        f"understand about {topic}?"
                    )
                ],
                "real_life_examples": [],
                "memory_tricks": [],
            },
            "sources": sources,
            "source_type": (
                "Human-reviewed textbook lesson"
            ),
            "review": {
                "reviewers": reviewers,
                "source_sha256": source_hash,
                "source_pages": [
                    {
                        "start": start,
                        "end": end,
                    }
                    for start, end in sorted(
                        set(page_ranges)
                    )
                ],
            },
        }

        documents.append(document)

    return documents


def validate_production_documents(
    documents: list[dict[str, Any]],
) -> None:
    """Validate every lesson against the authoritative schema."""

    schema = load_lesson_schema()
    validator = Draft202012Validator(schema)

    for document in documents:
        errors = sorted(
            validator.iter_errors(document),
            key=lambda error: list(error.path),
        )

        if not errors:
            continue

        lesson_id = str(
            document.get("id", "unknown")
        )

        details = "; ".join(
            (
                f"{'.'.join(map(str, error.path)) or '<root>'}: "
                f"{error.message}"
            )
            for error in errors[:5]
        )

        raise TextbookPromotionError(
            f"Lesson {lesson_id} failed schema validation: "
            f"{details}"
        )


def promotion_fingerprint(
    documents: list[dict[str, Any]],
) -> str:
    """Fingerprint the reviewed production content."""

    encoded = json.dumps(
        documents,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")

    return hashlib.sha256(encoded).hexdigest()


def promote_textbook(
    staging_file: str | Path,
    *,
    output_directory: str | Path | None = None,
    overwrite: bool = False,
) -> tuple[Path, dict[str, Any]]:
    """Promote approved staging chunks into production lessons."""

    staging_path = Path(
        staging_file
    ).expanduser().resolve()

    if not staging_path.is_file():
        raise TextbookPromotionError(
            f"Staging file does not exist: {staging_path}"
        )

    staging_payload = read_json_object(
        staging_path,
        label="staging package",
    )

    documents = build_production_documents(
        staging_payload
    )
    validate_production_documents(documents)

    fingerprint = promotion_fingerprint(
        documents
    )

    metadata = staging_payload["metadata"]

    output_root = Path(
        output_directory
        or DEFAULT_OUTPUT_DIRECTORY
    )

    curriculum = str(
        metadata.get("curriculum", "unknown")
    )
    level_id = str(
        metadata.get("level_id")
        or resolve_level_id(
            str(metadata.get("level", ""))
        )
    )
    subject = str(
        metadata.get("subject", "unknown")
    )

    destination_directory = (
        output_root
        / slugify(curriculum)
        / slugify(level_id)
        / slugify(subject)
    )
    destination_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    title = str(
        metadata.get("title", "textbook")
    )

    output_path = destination_directory / (
        f"{slugify(title)}-"
        f"{fingerprint[:12]}.json"
    )

    if output_path.exists():
        existing_payload = read_json_object(
            output_path,
            label="existing production file",
        )

        if (
            existing_payload.get("promotion_sha256")
            == fingerprint
            and existing_payload.get("documents")
            == documents
        ):
            return output_path, existing_payload

        if not overwrite:
            raise TextbookPromotionError(
                f"Production file already exists: {output_path}. "
                "Use --overwrite only after reviewing the change."
            )

    production_payload: dict[str, Any] = {
        "format": "slickk-production-lessons-v1",
        "production_knowledge": True,
        "promoted_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "source_staging_file": staging_path.name,
        "promotion_sha256": fingerprint,
        "documents": documents,
    }

    serialized = (
        json.dumps(
            production_payload,
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )

    output_path.write_text(
        serialized,
        encoding="utf-8",
    )

    return output_path, production_payload


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Promote human-approved textbook chunks "
            "into Slickk production lessons."
        )
    )

    parser.add_argument("staging_file")
    parser.add_argument(
        "--output-directory",
        default=str(DEFAULT_OUTPUT_DIRECTORY),
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_argument_parser()
    arguments = parser.parse_args(argv)

    try:
        output_path, payload = promote_textbook(
            arguments.staging_file,
            output_directory=arguments.output_directory,
            overwrite=arguments.overwrite,
        )
    except TextbookPromotionError as error:
        print(
            f"[Slickk] Promotion failed: {error}",
            file=sys.stderr,
        )
        return 2

    print("[Slickk] Textbook promotion successful.")
    print(f"Output: {output_path}")
    print(
        f"Production lessons: "
        f"{len(payload['documents'])}"
    )
    print(
        "Only human-approved verified facts "
        "were promoted."
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
