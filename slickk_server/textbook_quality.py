from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

from slickk_server.textbook_batch import (
    load_catalog,
    project_root_for_catalog,
    resolve_project_path,
)


DEFAULT_CATALOG_FILE = Path(
    "slickk_server/knowledge/textbook_catalog.json"
)

DEFAULT_REPORT_FILE = Path(
    "tmp/textbook-quality-report.json"
)


def _letter_script(character: str) -> str:
    """Return the broad script family for a letter."""

    code_point = ord(character)

    if (
        0x0041 <= code_point <= 0x005A
        or 0x0061 <= code_point <= 0x007A
        or 0x00C0 <= code_point <= 0x024F
    ):
        return "latin"

    if 0x0980 <= code_point <= 0x09FF:
        return "bengali"

    if (
        0x0600 <= code_point <= 0x06FF
        or 0x0750 <= code_point <= 0x077F
        or 0x08A0 <= code_point <= 0x08FF
        or 0xFB50 <= code_point <= 0xFDFF
        or 0xFE70 <= code_point <= 0xFEFF
    ):
        return "arabic"

    if 0x0900 <= code_point <= 0x097F:
        return "devanagari"

    return "other"


def _expected_scripts(
    ocr_language: str,
) -> set[str]:
    languages = {
        item.strip().casefold()
        for item in ocr_language.split("+")
        if item.strip()
    }

    scripts = {"latin"}

    if "ben" in languages:
        scripts.add("bengali")

    if "ara" in languages:
        scripts.add("arabic")

    if {"san", "hin"} & languages:
        scripts.add("devanagari")

    return scripts


def _orphan_mark_count(text: str) -> int:
    """Count combining marks that have no preceding base."""

    orphan_marks = 0
    previous_is_base = False

    for character in text:
        category = unicodedata.category(character)

        if category in {"Mn", "Mc", "Me"}:
            if not previous_is_base:
                orphan_marks += 1

            continue

        if character in {"\u200c", "\u200d"}:
            continue

        if character.isspace():
            previous_is_base = False
            continue

        previous_is_base = (
            character.isalpha()
            or character.isdigit()
        )

    return orphan_marks


def score_chunk(
    chunk: dict[str, Any],
    *,
    ocr_language: str,
) -> dict[str, Any]:
    """Score one review chunk without modifying it."""

    text = str(chunk.get("text") or "")
    text_length = len(text)

    letters = [
        character
        for character in text
        if character.isalpha()
    ]

    expected_scripts = _expected_scripts(
        ocr_language
    )

    script_counts = Counter(
        _letter_script(character)
        for character in letters
    )

    unexpected_letters = [
        character
        for character in letters
        if _letter_script(character)
        not in expected_scripts
    ]

    unexpected_ratio = (
        len(unexpected_letters) / len(letters)
        if letters
        else 0.0
    )

    symbol_count = sum(
        unicodedata.category(character).startswith(
            ("P", "S")
        )
        for character in text
    )

    symbol_ratio = (
        symbol_count / text_length
        if text_length
        else 0.0
    )

    letter_ratio = (
        len(letters) / text_length
        if text_length
        else 0.0
    )

    control_count = sum(
        unicodedata.category(character)
        in {"Cc", "Cf"}
        and character not in {
            "\n",
            "\r",
            "\t",
            "\u200c",
            "\u200d",
        }
        for character in text
    )

    orphan_marks = _orphan_mark_count(text)

    repeated_character_runs = re.findall(
        r"([^\s])\1{4,}",
        text,
    )

    repeated_punctuation_runs = re.findall(
        r"[^\w\s]{4,}",
        text,
        flags=re.UNICODE,
    )

    mixed_script_tokens = []

    for token in re.findall(r"\S+", text):
        token_scripts = {
            _letter_script(character)
            for character in token
            if character.isalpha()
        }

        if len(token_scripts) > 1:
            mixed_script_tokens.append(token)

    isolated_uppercase_tokens = []

    if script_counts.get("bengali", 0) >= 20:
        isolated_uppercase_tokens = re.findall(
            r"(?<![A-Za-z])[A-Z]{3,12}"
            r"(?![A-Za-z])",
            text,
        )

    issues: list[dict[str, Any]] = []
    score = 0

    def add_issue(
        code: str,
        severity: str,
        points: int,
        message: str,
        *,
        count: int = 1,
    ) -> None:
        nonlocal score

        score += points

        issues.append(
            {
                "code": code,
                "severity": severity,
                "points": points,
                "count": count,
                "message": message,
            }
        )

    if not text.strip():
        add_issue(
            "empty-text",
            "critical",
            100,
            "Chunk contains no reviewable text.",
        )

    if "\ufffd" in text:
        add_issue(
            "replacement-character",
            "critical",
            80,
            "Unicode replacement characters were found.",
            count=text.count("\ufffd"),
        )

    if control_count:
        add_issue(
            "unexpected-control-character",
            "critical",
            60,
            "Unexpected control characters were found.",
            count=control_count,
        )

    if orphan_marks:
        add_issue(
            "orphan-combining-mark",
            "high",
            40,
            "Combining marks appear without a valid base.",
            count=orphan_marks,
        )

    if (
        len(unexpected_letters) >= 3
        and unexpected_ratio > 0.02
    ):
        add_issue(
            "unexpected-script",
            "high",
            35,
            "Letters outside the expected OCR scripts "
            "were detected.",
            count=len(unexpected_letters),
        )

    if mixed_script_tokens:
        add_issue(
            "mixed-script-token",
            "high",
            25,
            "Individual tokens contain multiple scripts.",
            count=len(mixed_script_tokens),
        )

    if (
        text_length >= 80
        and letters
        and letter_ratio < 0.25
    ):
        add_issue(
            "low-letter-ratio",
            "medium",
            20,
            "The chunk contains unusually little "
            "alphabetic content.",
        )

    if (
        text_length >= 80
        and symbol_ratio > 0.30
    ):
        add_issue(
            "high-symbol-ratio",
            "medium",
            20,
            "The chunk contains an unusually high "
            "symbol or punctuation ratio.",
        )

    if repeated_character_runs:
        add_issue(
            "repeated-character-run",
            "medium",
            20,
            "A character repeats five or more times.",
            count=len(repeated_character_runs),
        )

    if repeated_punctuation_runs:
        add_issue(
            "repeated-punctuation-run",
            "medium",
            10,
            "Long repeated punctuation sequences "
            "were detected.",
            count=len(repeated_punctuation_runs),
        )

    if isolated_uppercase_tokens:
        add_issue(
            "isolated-uppercase-fragment",
            "warning",
            10,
            "Isolated uppercase Latin fragments appear "
            "inside Bengali-dominant text.",
            count=len(isolated_uppercase_tokens),
        )

    if 0 < text_length < 80:
        add_issue(
            "short-chunk",
            "warning",
            5,
            "The chunk is shorter than 80 characters.",
        )

    score = min(score, 100)

    if score >= 60:
        band = "critical"
    elif score >= 15:
        band = "review"
    else:
        band = "low-risk"

    return {
        "chunk_id": chunk.get("id"),
        "page_start": chunk.get("page_start"),
        "page_end": chunk.get("page_end"),
        "characters": text_length,
        "letters": len(letters),
        "letter_ratio": round(letter_ratio, 4),
        "symbol_ratio": round(symbol_ratio, 4),
        "script_counts": dict(script_counts),
        "unexpected_letters": len(
            unexpected_letters
        ),
        "unexpected_letter_ratio": round(
            unexpected_ratio,
            4,
        ),
        "mixed_script_tokens": (
            mixed_script_tokens[:10]
        ),
        "isolated_uppercase_tokens": (
            isolated_uppercase_tokens[:10]
        ),
        "quality_score": score,
        "quality_band": band,
        "issues": issues,
    }


def score_staging_payload(
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Create a non-mutating quality report."""

    source = payload.get("source", {})
    metadata = payload.get("metadata", {})
    chunks = payload.get("chunks", [])

    if not isinstance(chunks, list):
        raise ValueError(
            "Staging payload chunks must be a list."
        )

    ocr_language = str(
        source.get("ocr_language") or "eng"
    )

    chunk_reports = [
        score_chunk(
            chunk,
            ocr_language=ocr_language,
        )
        for chunk in chunks
    ]

    bands = Counter(
        report["quality_band"]
        for report in chunk_reports
    )

    issue_counts = Counter(
        issue["code"]
        for report in chunk_reports
        for issue in report["issues"]
    )

    critical_chunks = [
        report["chunk_id"]
        for report in chunk_reports
        if report["quality_band"] == "critical"
    ]

    review_chunks = [
        report["chunk_id"]
        for report in chunk_reports
        if report["quality_band"] == "review"
    ]

    return {
        "format": "slickk-textbook-quality-report-v1",
        "automatic_approval": False,
        "production_knowledge": False,
        "metadata": metadata,
        "source": source,
        "summary": {
            "total_chunks": len(chunk_reports),
            "quality_bands": dict(bands),
            "issue_counts": dict(issue_counts),
            "critical_chunks": len(
                critical_chunks
            ),
            "review_chunks": len(review_chunks),
        },
        "critical_chunk_ids": critical_chunks,
        "review_chunk_ids": review_chunks,
        "chunks": chunk_reports,
    }


def build_catalog_quality_report(
    catalog_file: str | Path,
) -> dict[str, Any]:
    """Score all staged catalogue records."""

    catalog_path = Path(catalog_file).resolve()
    catalog = load_catalog(catalog_path)

    project_root = project_root_for_catalog(
        catalog_path
    )

    book_reports = []
    errors = []

    for book in catalog.get("books", []):
        book_id = str(book.get("id") or "")
        staging_value = str(
            book.get("staging_file") or ""
        ).strip()

        if not staging_value:
            errors.append(
                {
                    "book_id": book_id,
                    "error": "No staging file recorded.",
                }
            )
            continue

        staging_path = resolve_project_path(
            staging_value,
            project_root=project_root,
        )

        if not staging_path.is_file():
            errors.append(
                {
                    "book_id": book_id,
                    "error": (
                        "Staging file does not exist: "
                        f"{staging_path}"
                    ),
                }
            )
            continue

        try:
            payload = json.loads(
                staging_path.read_text(
                    encoding="utf-8"
                )
            )

            report = score_staging_payload(
                payload
            )
        except Exception as error:
            errors.append(
                {
                    "book_id": book_id,
                    "error": str(error),
                }
            )
            continue

        report["book_id"] = book_id
        report["staging_file"] = str(
            staging_path
        )

        book_reports.append(report)

    total_chunks = sum(
        report["summary"]["total_chunks"]
        for report in book_reports
    )

    critical_chunks = sum(
        report["summary"]["critical_chunks"]
        for report in book_reports
    )

    review_chunks = sum(
        report["summary"]["review_chunks"]
        for report in book_reports
    )

    return {
        "format": "slickk-catalog-quality-report-v1",
        "automatic_approval": False,
        "production_knowledge": False,
        "catalog_file": str(catalog_path),
        "summary": {
            "catalogue_records": len(
                catalog.get("books", [])
            ),
            "books_scored": len(book_reports),
            "books_with_errors": len(errors),
            "total_chunks": total_chunks,
            "critical_chunks": critical_chunks,
            "review_chunks": review_chunks,
        },
        "errors": errors,
        "books": book_reports,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Score staged textbook OCR quality "
            "without approving or promoting content."
        )
    )

    parser.add_argument(
        "--catalog",
        default=str(DEFAULT_CATALOG_FILE),
    )

    parser.add_argument(
        "--output",
        default=str(DEFAULT_REPORT_FILE),
    )

    arguments = parser.parse_args()

    report = build_catalog_quality_report(
        arguments.catalog
    )

    output_path = Path(
        arguments.output
    ).resolve()

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_path.write_text(
        json.dumps(
            report,
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    summary = report["summary"]

    print("[Slickk] Textbook quality scan complete.")
    print(
        "Catalogue records: "
        f"{summary['catalogue_records']}"
    )
    print(
        "Books scored: "
        f"{summary['books_scored']}"
    )
    print(
        "Books with errors: "
        f"{summary['books_with_errors']}"
    )
    print(
        "Total chunks: "
        f"{summary['total_chunks']}"
    )
    print(
        "Critical chunks: "
        f"{summary['critical_chunks']}"
    )
    print(
        "Review chunks: "
        f"{summary['review_chunks']}"
    )
    print(f"Report: {output_path}")
    print(
        "Automatic approval: disabled"
    )
    print(
        "Production promotion: disabled"
    )

    return (
        1
        if summary["books_with_errors"]
        else 0
    )


if __name__ == "__main__":
    raise SystemExit(main())
