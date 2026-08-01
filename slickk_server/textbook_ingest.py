from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz
import pytesseract
from PIL import Image

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


def native_text_is_usable(
    value: str,
    *,
    ocr_language: str,
    minimum_characters: int = 80,
) -> bool:
    """Reject short or structurally corrupted PDF text layers."""

    text = normalize_extracted_text(value)

    if len(text) < minimum_characters:
        return False

    if "\ufffd" in text:
        return False

    language_ids = {
        item.strip().casefold()
        for item in ocr_language.split("+")
        if item.strip()
    }

    letters = [
        character
        for character in text
        if character.isalpha()
    ]

    if len(letters) < 12:
        return False

    def is_allowed_letter(
        character: str,
    ) -> bool:
        code_point = ord(character)

        # Basic Latin, Latin-1 and common Latin Extended-A.
        if (
            0x0041 <= code_point <= 0x005A
            or 0x0061 <= code_point <= 0x007A
            or 0x00C0 <= code_point <= 0x017F
        ):
            return True

        if (
            "ben" in language_ids
            and 0x0980 <= code_point <= 0x09FF
        ):
            return True

        if "ara" in language_ids and (
            0x0600 <= code_point <= 0x06FF
            or 0x0750 <= code_point <= 0x077F
            or 0x08A0 <= code_point <= 0x08FF
            or 0xFB50 <= code_point <= 0xFDFF
            or 0xFE70 <= code_point <= 0xFEFF
        ):
            return True

        if (
            {"san", "hin"} & language_ids
            and 0x0900 <= code_point <= 0x097F
        ):
            return True

        return False

    unexpected_letters = [
        character
        for character in letters
        if not is_allowed_letter(character)
    ]

    unexpected_ratio = (
        len(unexpected_letters)
        / len(letters)
    )

    if (
        len(unexpected_letters) >= 3
        and unexpected_ratio > 0.05
    ):
        return False

    # A combining mark or dependent vowel sign cannot safely
    # begin a word. Malformed PDF font mappings commonly create
    # these orphan marks.
    previous_is_base = False

    for character in text:
        category = unicodedata.category(
            character
        )

        if category in {"Mn", "Mc", "Me"}:
            if not previous_is_base:
                return False

            continue

        if character in {
            "\u200c",
            "\u200d",
        }:
            continue

        if character.isspace():
            previous_is_base = False
        else:
            previous_is_base = (
                character.isalpha()
                or character.isdigit()
            )

    return True


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
    """Split text without cutting through words."""

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
        hard_end = min(
            start + max_chars,
            text_length,
        )
        end = hard_end

        if hard_end < text_length:
            window = normalized[start:hard_end]
            minimum_boundary = max_chars // 2

            boundary_patterns = (
                r"\n{2,}",
                r"(?<=[.!?])\s+",
                r"\n+",
                r"\s+",
            )

            for boundary_pattern in boundary_patterns:
                matches = list(
                    re.finditer(
                        boundary_pattern,
                        window[minimum_boundary:],
                    )
                )

                if matches:
                    match = matches[-1]
                    end = (
                        start
                        + minimum_boundary
                        + match.start()
                    )
                    break

        chunk = normalized[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end >= text_length:
            break

        target_start = max(
            start + 1,
            end - overlap_chars,
        )

        preceding_space = max(
            normalized.rfind(
                " ",
                start + 1,
                target_start + 1,
            ),
            normalized.rfind(
                "\n",
                start + 1,
                target_start + 1,
            ),
        )

        if preceding_space >= start + 1:
            next_start = preceding_space + 1
        else:
            next_start = target_start

        while (
            next_start < text_length
            and normalized[next_start].isspace()
        ):
            next_start += 1

        if next_start <= start:
            next_start = end

        start = next_start

    return chunks



def configure_tesseract() -> str:
    """Locate and configure the local Tesseract executable."""

    candidates = [
        shutil.which("tesseract"),
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]

    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            pytesseract.pytesseract.tesseract_cmd = candidate
            return candidate

    raise TextbookIngestError(
        "Tesseract OCR was not found. Expected it at "
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )


def ocr_language_for_metadata(
    *,
    subject: str,
    language: str,
) -> str:
    """Select Tesseract languages for the textbook content."""

    subject_key = (
        subject.strip()
        .casefold()
        .replace("_", "-")
    )
    language_key = language.strip().casefold()

    if subject_key == "arabic":
        return "ara+ben+eng"

    if (
        subject_key == "bangla"
        or language_key in {
            "bangla",
            "bengali",
            "\u09ac\u09be\u0982\u09b2\u09be",
        }
    ):
        return "ben+eng"

    return "eng"


def extract_source_pages(
    source_path: Path,
    *,
    ocr_language: str = "eng",
) -> list[dict[str, Any]]:
    """Extract text with language-aware OCR fallback."""

    suffix = source_path.suffix.lower()

    if suffix not in SUPPORTED_SUFFIXES:
        raise TextbookIngestError(
            "Unsupported textbook format. "
            "Use PDF, TXT or Markdown."
        )

    if suffix == ".pdf":
        try:
            document = fitz.open(str(source_path))
        except Exception as error:
            raise TextbookIngestError(
                f"Could not read PDF: {error}"
            ) from error

        pages: list[dict[str, Any]] = []
        page_count = len(document)
        ocr_configured = False
        ocr_page_count = 0
        native_page_count = 0

        try:
            for page_number, page in enumerate(
                document,
                start=1,
            ):
                print(
                    f"Processing page "
                    f"{page_number}/{page_count}...",
                    flush=True,
                )

                try:
                    native_text = normalize_extracted_text(
                        page.get_text("text") or ""
                    )
                except Exception:
                    native_text = ""

                if native_text_is_usable(
                    native_text,
                    ocr_language=ocr_language,
                ):
                    extracted = native_text
                    native_page_count += 1
                else:
                    if not ocr_configured:
                        executable = configure_tesseract()
                        print(
                            "OCR fallback enabled: "
                            f"{executable} "
                            f"(languages: {ocr_language})",
                            flush=True,
                        )
                        ocr_configured = True

                    print(
                        f"  OCR page "
                        f"{page_number}/{page_count}...",
                        flush=True,
                    )

                    try:
                        pixmap = page.get_pixmap(
                            dpi=200,
                            alpha=False,
                        )

                        image = Image.frombytes(
                            "RGB",
                            (pixmap.width, pixmap.height),
                            pixmap.samples,
                        )

                        extracted = (
                            pytesseract.image_to_string(
                                image,
                                lang=ocr_language,
                                config="--oem 3 --psm 3",
                            )
                        )
                    except Exception as error:
                        raise TextbookIngestError(
                            "OCR failed on PDF page "
                            f"{page_number}: {error}"
                        ) from error

                    extracted = normalize_extracted_text(
                        extracted
                    )
                    ocr_page_count += 1

                pages.append(
                    {
                        "page": page_number,
                        "text": extracted,
                    }
                )
        finally:
            document.close()

        print(
            "PDF extraction complete: "
            f"{native_page_count} native-text pages, "
            f"{ocr_page_count} OCR pages.",
            flush=True,
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
    extracted_pages: list[dict[str, Any]] | None = None,
    source_fingerprint: str | None = None,
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

    ocr_language = ocr_language_for_metadata(
        subject=metadata["subject"],
        language=metadata["language"],
    )

    if extracted_pages is None:
        pages = extract_source_pages(
            source_path,
            ocr_language=ocr_language,
        )
    else:
        try:
            pages = [
                {
                    "page": int(page["page"]),
                    "text": str(page.get("text", "")),
                }
                for page in extracted_pages
            ]
        except (
            KeyError,
            TypeError,
            ValueError,
        ) as error:
            raise TextbookIngestError(
                "Cached extraction pages are invalid."
            ) from error

    fingerprint = str(
        source_fingerprint or ""
    ).strip()

    if not fingerprint:
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
            "ocr_language": ocr_language,
            "extraction_reused": (
                extracted_pages is not None
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
        f"{slugify(metadata['curriculum'])}-"
        f"{slugify(metadata['level_id'])}-"
        f"{slugify(metadata['subject'])}-"
        f"{slugify(metadata['language'])}-"
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
