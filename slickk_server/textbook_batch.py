from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from slickk_server.textbook_ingest import (
    TextbookIngestError,
    ingest_textbook,
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


class TextbookBatchError(RuntimeError):
    """Raised when the textbook batch catalogue is invalid."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


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

    return payload


def save_catalog(
    path: Path,
    payload: dict[str, Any],
) -> None:
    """Save catalogue progress atomically."""

    payload["updated_at"] = utc_now()

    temporary_path = path.with_name(
        path.name + ".tmp"
    )

    temporary_path.write_text(
        json.dumps(
            payload,
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    temporary_path.replace(path)


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
