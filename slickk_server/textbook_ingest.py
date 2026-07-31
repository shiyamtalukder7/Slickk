from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from slickk_server.knowledge_base import (
    KNOWLEDGE_DIR,
    load_curriculum_catalog,
    load_subject_catalog,
    normalize_language,
    resolve_curriculum_id,
    resolve_level_id,
    resolve_subject_id,
)


DEFAULT_IMPORT_DIRECTORY = KNOWLEDGE_DIR / "_imports"
SUPPORTED_SUFFIXES = {".pdf", ".txt", ".md"}


class TextbookIngestError(RuntimeError):
    """Raised when a textbook cannot be staged safely."""


def slugify(value: str) -> str:
    """Create a filesystem-safe identifier."""

    slug = re.sub(
        r"[^a-z0-9]+",
        "-",
        value.lower(),
    ).strip("-")

    return slug or "textbook"


def normalize_extracted_text(value: str) -> str:
    """Clean PDF or text extraction without changing meaning."""

    text = value.replace("\x00", "")
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def file_sha256(path: Path) -> str:
    """Calculate a stable source-file fingerprint."""

    digest = hashlib.sha256()

    with path.open("rb") as file:
        while block := file.read(1024 * 1024):
            digest.update(block)

    return digest.hexdigest()


def split_text(
    text: str,
    *,
    max_chars: int = 2400,
    overlap_chars: int = 200,
) -> list[str]:
    """Split extracted text into reviewable overlapping chunks."""

    if max_chars < 100:
        raise ValueError(
            "max_chars must be at least 100."
        )

    if (
        overlap_chars < 0
        or overlap_chars >= max_chars
    ):
        raise ValueError(
            "overlap_chars must be between 0 and max_chars - 1."
        )

    normalized = normalize_extracted_text(text)

    if not normalized:
        return []

    chunks: list[str] = []
    start = 0
    text_length = len(normalized)

    while start < text_length:
        end = min(
            start + max_chars,
            text_length,
        )

        if end < text_length:
            candidate = normalized[start:end]
            minimum_boundary = max_chars // 2

            paragraph_boundary = candidate.rfind(
                "\n\n",
                minimum_boundary,
            )
            sentence_boundary = candidate.rfind(
                ". ",
                minimum_boundary,
            )

            boundary = max(
                paragraph_boundary,
                sentence_boundary,
            )

            if boundary > 0:
                if boundary == sentence_boundary:
                    end = start + boundary + 1
                else:
                    end = start + boundary

        chunk = normalized[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end >= text_length:
            break

        next_start = end - overlap_chars

        if next_start <= start:
            next_start = end

        start = next_start

    return chunks


def extract_source_pages(
    source_path: Path,
) -> list[dict[str, Any]]:
    """Extract text per page from PDF, TXT or Markdown files."""

    suffix = source_path.suffix.lower()

    if suffix not in SUPPORTED_SUFFIXES:
        raise TextbookIngestError(
            "Unsupported textbook format. "
            "Use PDF, TXT or Markdown."
        )

    if suffix == ".pdf":
        try:
            reader = PdfReader(str(source_path))
        except Exception as error:
            raise TextbookIngestError(
                f"Could not read PDF: {error}"
            ) from error

        pages: list[dict[str, Any]] = []

        for page_number, page in enumerate(
            reader.pages,
            start=1,
        ):
            try:
                extracted = page.extract_text() or ""
            except Exception:
                extracted = ""

            pages.append(
                {
                    "page": page_number,
                    "text": normalize_extracted_text(
                        extracted
                    ),
                }
            )

        return pages

    try:
        text = source_path.read_text(
            encoding="utf-8-sig"
        )
    except (OSError, UnicodeError) as error:
        raise TextbookIngestError(
            f"Could not read text file: {error}"
        ) from error

    return [
        {
            "page": 1,
            "text": normalize_extracted_text(text),
        }
    ]


def canonicalize_metadata(
    *,
    curriculum: str,
    level: str,
    subject: str,
    language: str,
) -> dict[str, str]:
    """Validate metadata against Slickk registries."""

    curriculum_id = resolve_curriculum_id(curriculum)
    subject_id = resolve_subject_id(subject)
    level_id = resolve_level_id(level)
    language_id = normalize_language(language)

    curricula = {
        str(item.get("id")): item
        for item in load_curriculum_catalog()
    }

    subjects = {
        str(item.get("id")): item
        for item in load_subject_catalog()
    }

    if curriculum_id not in curricula:
        raise TextbookIngestError(
            f"Unknown curriculum: {curriculum}"
        )

    if subject_id not in subjects:
        raise TextbookIngestError(
            f"Unknown subject: {subject}"
        )

    curriculum_record = curricula[curriculum_id]

    registered_levels = {
        resolve_level_id(str(item)): str(item)
        for item in curriculum_record.get(
            "levels",
            [],
        )
    }

    if level_id not in registered_levels:
        raise TextbookIngestError(
            f"{level} is not registered for "
            f"{curriculum_id}."
        )

    registered_languages = {
        normalize_language(str(item))
        for item in curriculum_record.get(
            "languages",
            [],
        )
    }

    if language_id == "multilingual":
        if len(registered_languages) < 2:
            raise TextbookIngestError(
                "This curriculum is not registered "
                "for multilingual lessons."
            )
    elif language_id not in registered_languages:
        raise TextbookIngestError(
            f"{language} is not registered for "
            f"{curriculum_id}."
        )

    return {
        "curriculum": curriculum_id,
        "level": registered_levels[level_id],
        "level_id": level_id,
        "subject": subject_id,
        "language": language_id,
    }


def build_staging_chunks(
    pages: list[dict[str, Any]],
    *,
    source_fingerprint: str,
    max_chars: int,
    overlap_chars: int,
) -> list[dict[str, Any]]:
    """Convert extracted pages into human-review chunks."""

    chunks: list[dict[str, Any]] = []

    for page in pages:
        page_number = int(page["page"])
        page_text = str(page.get("text", ""))

        page_chunks = split_text(
            page_text,
            max_chars=max_chars,
            overlap_chars=overlap_chars,
        )

        for chunk_index, chunk_text in enumerate(
            page_chunks,
            start=1,
        ):
            chunks.append(
                {
                    "id": (
                        f"{source_fingerprint[:12]}"
                        f"-p{page_number:04d}"
                        f"-c{chunk_index:03d}"
                    ),
                    "page_start": page_number,
                    "page_end": page_number,
                    "text": chunk_text,
                    "review": {
                        "approved": False,
                        "reviewer": "",
                        "chapter": "",
                        "topic": "",
                        "learning_objectives": [],
                        "verified_facts": [],
                        "common_mistakes": [],
                        "notes": "",
                    },
                }
            )

    return chunks


def ingest_textbook(
    source: str | Path,
    *,
    curriculum: str,
    level: str,
    subject: str,
    language: str,
    title: str = "",
    output_directory: str | Path | None = None,
    max_chars: int = 2400,
    overlap_chars: int = 200,
) -> tuple[Path, dict[str, Any]]:
    """Extract a textbook into a non-production review package."""

    source_path = Path(source).expanduser().resolve()

    if not source_path.exists():
        raise TextbookIngestError(
            f"Source file does not exist: {source_path}"
        )

    if not source_path.is_file():
        raise TextbookIngestError(
            "The source path must be a file."
        )

    metadata = canonicalize_metadata(
        curriculum=curriculum,
        level=level,
        subject=subject,
        language=language,
    )

    pages = extract_source_pages(source_path)
    fingerprint = file_sha256(source_path)

    chunks = build_staging_chunks(
        pages,
        source_fingerprint=fingerprint,
        max_chars=max_chars,
        overlap_chars=overlap_chars,
    )

    if not chunks:
        raise TextbookIngestError(
            "No extractable text was found. "
            "The PDF may be scanned or image-only. "
            "This importer does not guess using OCR."
        )

    textbook_title = (
        title.strip()
        or source_path.stem.replace("_", " ")
    )

    payload: dict[str, Any] = {
        "format": "slickk-textbook-staging-v1",
        "status": "needs_human_review",
        "production_knowledge": False,
        "imported_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "source": {
            "filename": source_path.name,
            "file_type": source_path.suffix.lower(),
            "sha256": fingerprint,
            "page_count": len(pages),
            "pages_with_text": sum(
                bool(page.get("text"))
                for page in pages
            ),
        },
        "metadata": {
            **metadata,
            "title": textbook_title,
        },
        "chunks": chunks,
        "promotion_requirements": [
            "Assign every approved chunk to a chapter and topic.",
            "Verify factual claims against the source page.",
            "Write verified facts instead of copying unreviewed text.",
            "Check curriculum, class, subject and language metadata.",
            "Validate the final lesson against lesson_schema.json.",
        ],
    }

    destination_directory = Path(
        output_directory
        or DEFAULT_IMPORT_DIRECTORY
    )
    destination_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_name = (
        f"{slugify(textbook_title)}-"
        f"{fingerprint[:12]}.json"
    )
    output_path = destination_directory / output_name

    output_path.write_text(
        json.dumps(
            payload,
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    return output_path, payload


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Extract a textbook into Slickk's "
            "human-review staging format."
        )
    )

    parser.add_argument("source")
    parser.add_argument(
        "--curriculum",
        required=True,
    )
    parser.add_argument(
        "--level",
        required=True,
    )
    parser.add_argument(
        "--subject",
        required=True,
    )
    parser.add_argument(
        "--language",
        required=True,
    )
    parser.add_argument(
        "--title",
        default="",
    )
    parser.add_argument(
        "--output-directory",
        default=str(DEFAULT_IMPORT_DIRECTORY),
    )
    parser.add_argument(
        "--max-chars",
        type=int,
        default=2400,
    )
    parser.add_argument(
        "--overlap-chars",
        type=int,
        default=200,
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_argument_parser()
    arguments = parser.parse_args(argv)

    try:
        output_path, payload = ingest_textbook(
            arguments.source,
            curriculum=arguments.curriculum,
            level=arguments.level,
            subject=arguments.subject,
            language=arguments.language,
            title=arguments.title,
            output_directory=arguments.output_directory,
            max_chars=arguments.max_chars,
            overlap_chars=arguments.overlap_chars,
        )
    except (
        TextbookIngestError,
        ValueError,
    ) as error:
        print(
            f"[Slickk] Import failed: {error}",
            file=sys.stderr,
        )
        return 2

    print("[Slickk] Textbook staged successfully.")
    print(f"Output: {output_path}")
    print(f"Status: {payload['status']}")
    print(f"Pages: {payload['source']['page_count']}")
    print(f"Chunks: {len(payload['chunks'])}")
    print(
        "The extracted content is not production "
        "knowledge until reviewed."
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
