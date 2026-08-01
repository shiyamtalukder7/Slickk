from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from slickk_server.textbook_ingest import (
    TextbookIngestError,
    canonicalize_metadata,
    extract_source_pages,
    file_sha256,
    ingest_textbook,
    ocr_language_for_metadata,
)


DEFAULT_CATALOG_PATH = (
    Path(__file__).resolve().parent
    / "knowledge"
    / "textbook_catalog.json"
)

COMPLETED_IMPORT_STATUSES = {
    "needs-human-review",
    "approved",
    "promoted",
}

EXTRACTION_CACHE_FORMAT = (
    "slickk-textbook-extraction-cache-v1"
)

RUNTIME_STATE_FORMAT = (
    "slickk-textbook-runtime-state-v1"
)

RUNTIME_BOOK_FIELDS = frozenset(
    {
        "download_status",
        "download_error",
        "last_downloaded_at",
        "last_download_failed_at",
        "import_status",
        "staging_file",
        "promotion_status",
        "last_started_at",
        "last_imported_at",
        "last_failed_at",
        "last_error",
    }
)


class TextbookBatchError(RuntimeError):
    """Raised when the textbook batch catalogue is invalid."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def local_state_path_for_catalog(
    catalog_path: Path,
) -> Path:
    """Return the ignored runtime-state file for a catalogue."""

    resolved = catalog_path.expanduser().resolve()

    return (
        resolved.parent
        / "_imports"
        / "textbook_runtime_state.json"
    )


def load_runtime_state(
    state_path: Path,
) -> dict[str, Any]:
    """Load local textbook progress without touching Git data."""

    if not state_path.is_file():
        return {
            "format": RUNTIME_STATE_FORMAT,
            "books": {},
        }

    try:
        payload = json.loads(
            state_path.read_text(
                encoding="utf-8-sig"
            )
        )
    except (
        OSError,
        UnicodeError,
        json.JSONDecodeError,
    ) as error:
        raise TextbookBatchError(
            f"Could not read textbook runtime state: {error}"
        ) from error

    if not isinstance(payload, dict):
        raise TextbookBatchError(
            "The textbook runtime state must be a JSON object."
        )

    if payload.get("format") != RUNTIME_STATE_FORMAT:
        raise TextbookBatchError(
            "Unsupported textbook runtime-state format."
        )

    if not isinstance(payload.get("books"), dict):
        raise TextbookBatchError(
            "The textbook runtime state has no valid books object."
        )

    return payload


def apply_runtime_state(
    catalog: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, Any]:
    """Overlay local progress onto immutable catalogue records."""

    state_books = state.get("books", {})

    for raw_book in catalog.get("books", []):
        if not isinstance(raw_book, dict):
            continue

        book_id = str(
            raw_book.get("id") or ""
        ).strip()

        if not book_id:
            continue

        saved = state_books.get(book_id)

        if not isinstance(saved, dict):
            continue

        for field in RUNTIME_BOOK_FIELDS:
            if field in saved:
                raw_book[field] = saved[field]

    return catalog


def build_runtime_state(
    catalog: dict[str, Any],
) -> dict[str, Any]:
    """Extract only machine-local progress from a catalogue."""

    state_books: dict[str, dict[str, Any]] = {}

    for raw_book in catalog.get("books", []):
        if not isinstance(raw_book, dict):
            continue

        book_id = str(
            raw_book.get("id") or ""
        ).strip()

        if not book_id:
            continue

        values = {
            field: raw_book[field]
            for field in RUNTIME_BOOK_FIELDS
            if field in raw_book
        }

        if values:
            state_books[book_id] = values

    return {
        "format": RUNTIME_STATE_FORMAT,
        "updated_at": utc_now(),
        "catalog_version": catalog.get(
            "catalog_version"
        ),
        "books": state_books,
    }


def load_catalog(path: Path) -> dict[str, Any]:
    """Load and validate the master textbook catalogue."""

    try:
        payload = json.loads(
            path.read_text(encoding="utf-8-sig")
        )
    except (
        OSError,
        UnicodeError,
        json.JSONDecodeError,
    ) as error:
        raise TextbookBatchError(
            f"Could not read textbook catalogue: {error}"
        ) from error

    if not isinstance(payload, dict):
        raise TextbookBatchError(
            "The textbook catalogue must contain a JSON object."
        )

    if payload.get("format") != "slickk-textbook-catalog-v1":
        raise TextbookBatchError(
            "Unsupported textbook catalogue format."
        )

    if not isinstance(payload.get("books"), list):
        raise TextbookBatchError(
            "The textbook catalogue has no valid books list."
        )

    state_path = local_state_path_for_catalog(path)
    state = load_runtime_state(state_path)

    return apply_runtime_state(
        payload,
        state,
    )


def save_catalog(
    path: Path,
    payload: dict[str, Any],
) -> None:
    """Save machine-local progress outside the tracked catalogue."""

    state_path = local_state_path_for_catalog(path)
    state_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    state_payload = build_runtime_state(
        payload
    )

    temporary_path = state_path.with_name(
        state_path.name + ".tmp"
    )

    temporary_path.write_text(
        json.dumps(
            state_payload,
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    temporary_path.replace(state_path)


def project_root_for_catalog(
    catalog_path: Path,
) -> Path:
    """Resolve the project root from the catalogue location."""

    resolved = catalog_path.resolve()

    if len(resolved.parents) >= 3:
        return resolved.parents[2]

    return Path.cwd().resolve()


def resolve_project_path(
    value: str,
    *,
    project_root: Path,
) -> Path:
    path = Path(value).expanduser()

    if path.is_absolute():
        return path.resolve()

    return (project_root / path).resolve()


def catalogue_path_value(
    path: Path,
    *,
    project_root: Path,
) -> str:
    resolved = path.resolve()

    try:
        return resolved.relative_to(
            project_root
        ).as_posix()
    except ValueError:
        return str(resolved)


def completed_staging_exists(
    book: dict[str, Any],
    *,
    project_root: Path,
) -> bool:
    status = str(
        book.get("import_status", "")
    ).strip()

    if status not in COMPLETED_IMPORT_STATUSES:
        return False

    staging_value = str(
        book.get("staging_file") or ""
    ).strip()

    if not staging_value:
        return False

    staging_path = resolve_project_path(
        staging_value,
        project_root=project_root,
    )

    return staging_path.is_file()


def extraction_cache_path(
    *,
    project_root: Path,
    source_identity: str,
    source_sha256: str,
    ocr_language: str,
) -> Path:
    """Build a stable cache path for extracted source pages."""

    cache_material = "\0".join(
        (
            source_identity,
            source_sha256,
            ocr_language,
        )
    ).encode("utf-8")

    cache_key = hashlib.sha256(
        cache_material
    ).hexdigest()

    return (
        project_root
        / "slickk_server"
        / "knowledge"
        / "_imports"
        / "_extraction_cache"
        / f"{cache_key}.json.gz"
    )


def load_cached_pages(
    cache_path: Path,
    *,
    source_identity: str,
    source_sha256: str,
    ocr_language: str,
) -> list[dict[str, Any]] | None:
    """Load cached pages only when every cache key matches."""

    if not cache_path.is_file():
        return None

    try:
        with gzip.open(
            cache_path,
            "rt",
            encoding="utf-8",
        ) as cache_file:
            payload = json.load(cache_file)
    except (
        OSError,
        UnicodeError,
        json.JSONDecodeError,
    ):
        return None

    if not isinstance(payload, dict):
        return None

    if payload.get("format") != EXTRACTION_CACHE_FORMAT:
        return None

    expected = {
        "source_identity": source_identity,
        "source_sha256": source_sha256,
        "ocr_language": ocr_language,
    }

    for name, value in expected.items():
        if payload.get(name) != value:
            return None

    raw_pages = payload.get("pages")

    if not isinstance(raw_pages, list):
        return None

    pages: list[dict[str, Any]] = []

    for raw_page in raw_pages:
        if not isinstance(raw_page, dict):
            return None

        try:
            pages.append(
                {
                    "page": int(raw_page["page"]),
                    "text": str(
                        raw_page.get("text", "")
                    ),
                }
            )
        except (
            KeyError,
            TypeError,
            ValueError,
        ):
            return None

    return pages


def save_cached_pages(
    cache_path: Path,
    *,
    source_identity: str,
    source_sha256: str,
    ocr_language: str,
    pages: list[dict[str, Any]],
) -> None:
    """Save extracted pages atomically in compressed JSON."""

    cache_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    payload = {
        "format": EXTRACTION_CACHE_FORMAT,
        "source_identity": source_identity,
        "source_sha256": source_sha256,
        "ocr_language": ocr_language,
        "pages": pages,
    }

    temporary_path = cache_path.with_name(
        cache_path.name + ".tmp"
    )

    with gzip.open(
        temporary_path,
        "wt",
        encoding="utf-8",
    ) as cache_file:
        json.dump(
            payload,
            cache_file,
            ensure_ascii=False,
        )

    temporary_path.replace(cache_path)


def cached_source_pages(
    *,
    book: dict[str, Any],
    source_path: Path,
    required_fields: dict[str, Any],
    project_root: Path,
) -> tuple[list[dict[str, Any]], str]:
    """Load cached extraction or extract the source once."""

    metadata = canonicalize_metadata(
        curriculum=str(
            required_fields["curriculum"]
        ),
        level=str(required_fields["level"]),
        subject=str(required_fields["subject"]),
        language=str(required_fields["language"]),
    )

    ocr_language = ocr_language_for_metadata(
        subject=metadata["subject"],
        language=metadata["language"],
    )

    source_sha256 = file_sha256(source_path)

    source_identity = str(
        book.get("source_file_id")
        or source_path.resolve()
    ).strip()

    cache_path = extraction_cache_path(
        project_root=project_root,
        source_identity=source_identity,
        source_sha256=source_sha256,
        ocr_language=ocr_language,
    )

    cached_pages = load_cached_pages(
        cache_path,
        source_identity=source_identity,
        source_sha256=source_sha256,
        ocr_language=ocr_language,
    )

    if cached_pages is not None:
        print(
            "Extraction cache hit: "
            f"{source_path.name}",
            flush=True,
        )
        return cached_pages, source_sha256

    print(
        "Extraction cache miss: "
        f"{source_path.name}",
        flush=True,
    )

    pages = extract_source_pages(
        source_path,
        ocr_language=ocr_language,
    )

    save_cached_pages(
        cache_path,
        source_identity=source_identity,
        source_sha256=source_sha256,
        ocr_language=ocr_language,
        pages=pages,
    )

    print(
        "Extraction cache saved: "
        f"{cache_path.name}",
        flush=True,
    )

    return pages, source_sha256


def run_batch(
    catalog_file: str | Path = DEFAULT_CATALOG_PATH,
    *,
    book_ids: list[str] | None = None,
    force: bool = False,
    limit: int | None = None,
) -> dict[str, int]:
    """Import every selected enabled textbook resumably."""

    catalog_path = Path(
        catalog_file
    ).expanduser().resolve()

    if not catalog_path.is_file():
        raise TextbookBatchError(
            f"Catalogue does not exist: {catalog_path}"
        )

    catalog = load_catalog(catalog_path)
    project_root = project_root_for_catalog(
        catalog_path
    )

    selected_ids = set(book_ids or [])

    summary = {
        "imported": 0,
        "skipped": 0,
        "failed": 0,
        "disabled": 0,
    }

    attempted = 0

    for raw_book in catalog["books"]:
        if not isinstance(raw_book, dict):
            summary["failed"] += 1
            continue

        book = raw_book
        book_id = str(
            book.get("id", "")
        ).strip()

        if selected_ids and book_id not in selected_ids:
            continue

        if book.get("enabled") is not True:
            summary["disabled"] += 1
            continue

        if (
            limit is not None
            and attempted >= limit
        ):
            break

        if (
            not force
            and completed_staging_exists(
                book,
                project_root=project_root,
            )
        ):
            summary["skipped"] += 1
            continue

        attempted += 1

        local_file = str(
            book.get("local_file") or ""
        ).strip()

        if not local_file:
            book["import_status"] = "failed"
            book["last_error"] = (
                "No local textbook file is configured."
            )
            book["last_failed_at"] = utc_now()
            summary["failed"] += 1
            save_catalog(catalog_path, catalog)
            continue

        source_path = resolve_project_path(
            local_file,
            project_root=project_root,
        )

        if not source_path.is_file():
            book["import_status"] = "failed"
            book["last_error"] = (
                f"Local textbook file does not exist: "
                f"{source_path}"
            )
            book["last_failed_at"] = utc_now()
            summary["failed"] += 1
            save_catalog(catalog_path, catalog)
            continue

        required_fields = {
            "curriculum": book.get("curriculum"),
            "level": book.get("level"),
            "subject": book.get("subject"),
            "language": book.get("language"),
            "title": book.get("title"),
        }

        missing = [
            name
            for name, value in required_fields.items()
            if not str(value or "").strip()
        ]

        if missing:
            book["import_status"] = "failed"
            book["last_error"] = (
                "Missing catalogue fields: "
                + ", ".join(missing)
            )
            book["last_failed_at"] = utc_now()
            summary["failed"] += 1
            save_catalog(catalog_path, catalog)
            continue

        book["import_status"] = "importing"
        book["last_started_at"] = utc_now()
        book["last_error"] = None
        save_catalog(catalog_path, catalog)

        try:
            (
                extracted_pages,
                source_fingerprint,
            ) = cached_source_pages(
                book=book,
                source_path=source_path,
                required_fields=required_fields,
                project_root=project_root,
            )

            output_path, _ = ingest_textbook(
                source_path,
                curriculum=str(
                    required_fields["curriculum"]
                ),
                level=str(
                    required_fields["level"]
                ),
                subject=str(
                    required_fields["subject"]
                ),
                language=str(
                    required_fields["language"]
                ),
                title=str(
                    required_fields["title"]
                ),
                extracted_pages=extracted_pages,
                source_fingerprint=source_fingerprint,
            )
        except (
            TextbookIngestError,
            OSError,
            ValueError,
        ) as error:
            book["import_status"] = "failed"
            book["last_error"] = str(error)
            book["last_failed_at"] = utc_now()
            summary["failed"] += 1
            save_catalog(catalog_path, catalog)
            continue

        book["staging_file"] = catalogue_path_value(
            output_path,
            project_root=project_root,
        )
        book["import_status"] = "needs-human-review"
        book["promotion_status"] = (
            book.get("promotion_status")
            or "not-promoted"
        )
        book["last_imported_at"] = utc_now()
        book["last_error"] = None

        summary["imported"] += 1
        save_catalog(catalog_path, catalog)

    return summary


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Import enabled textbooks from the Slickk "
            "master catalogue."
        )
    )

    parser.add_argument(
        "--catalog",
        default=str(DEFAULT_CATALOG_PATH),
    )
    parser.add_argument(
        "--book-id",
        action="append",
        dest="book_ids",
    )
    parser.add_argument(
        "--force",
        action="store_true",
    )
    parser.add_argument(
        "--limit",
        type=int,
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_argument_parser().parse_args(
        argv
    )

    try:
        summary = run_batch(
            arguments.catalog,
            book_ids=arguments.book_ids,
            force=arguments.force,
            limit=arguments.limit,
        )
    except TextbookBatchError as error:
        print(
            f"[Slickk] Batch import failed: {error}",
            file=sys.stderr,
        )
        return 2

    print("[Slickk] Batch textbook import complete.")
    print(f"Imported: {summary['imported']}")
    print(f"Skipped: {summary['skipped']}")
    print(f"Failed: {summary['failed']}")
    print(f"Disabled: {summary['disabled']}")

    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
