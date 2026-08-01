from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import gdown

from slickk_server.textbook_batch import (
    TextbookBatchError,
    load_catalog,
    project_root_for_catalog,
    resolve_project_path,
    save_catalog,
)


DEFAULT_CATALOG_PATH = (
    Path(__file__).resolve().parent
    / "knowledge"
    / "textbook_catalog.json"
)


class TextbookDownloadError(RuntimeError):
    """Raised when an official textbook cannot be downloaded."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_valid_pdf(path: Path) -> bool:
    """Check that a file looks like a non-empty PDF."""

    if not path.is_file():
        return False

    if path.stat().st_size < 1024:
        return False

    try:
        with path.open("rb") as file:
            return file.read(5) == b"%PDF-"
    except OSError:
        return False


def selected_source_ids(
    books: list[dict[str, Any]],
    book_ids: list[str] | None,
) -> set[str]:
    """Resolve unique source IDs selected for download."""

    requested_ids = set(book_ids or [])
    sources: set[str] = set()

    for book in books:
        if book.get("enabled") is not True:
            continue

        book_id = str(book.get("id", "")).strip()

        if requested_ids and book_id not in requested_ids:
            continue

        source_id = str(
            book.get("source_file_id", "")
        ).strip()

        if source_id:
            sources.add(source_id)

    if requested_ids:
        existing_ids = {
            str(book.get("id", "")).strip()
            for book in books
        }
        missing_ids = requested_ids - existing_ids

        if missing_ids:
            raise TextbookDownloadError(
                "Unknown catalogue book IDs: "
                + ", ".join(sorted(missing_ids))
            )

    return sources


def source_groups(
    books: list[dict[str, Any]],
    source_ids: set[str],
) -> dict[str, list[dict[str, Any]]]:
    """Group curriculum records that share one physical file."""

    groups: dict[
        str,
        list[dict[str, Any]],
    ] = defaultdict(list)

    for book in books:
        source_id = str(
            book.get("source_file_id", "")
        ).strip()

        if source_id in source_ids:
            groups[source_id].append(book)

    return dict(groups)


def canonical_local_file(
    records: list[dict[str, Any]],
) -> str:
    """Ensure shared records use one physical destination."""

    paths = {
        str(record.get("local_file", "")).strip()
        for record in records
        if str(record.get("local_file", "")).strip()
    }

    if not paths:
        raise TextbookDownloadError(
            "No local destination is configured."
        )

    if len(paths) != 1:
        raise TextbookDownloadError(
            "Records sharing one source use different "
            "local file paths: "
            + ", ".join(sorted(paths))
        )

    return next(iter(paths))


def update_records(
    records: list[dict[str, Any]],
    *,
    status: str,
    local_file: str,
    error: str | None = None,
) -> None:
    """Apply one source result to every shared record."""

    timestamp = utc_now()

    for record in records:
        record["local_file"] = local_file
        record["download_status"] = status
        record["download_error"] = error

        if status == "complete":
            record["last_downloaded_at"] = timestamp
            record.pop("last_download_failed_at", None)
        elif status == "failed":
            record["last_download_failed_at"] = timestamp


def download_catalog_textbooks(
    catalog_file: str | Path = DEFAULT_CATALOG_PATH,
    *,
    book_ids: list[str] | None = None,
    limit: int | None = None,
    force: bool = False,
    dry_run: bool = False,
) -> dict[str, int]:
    """Download selected unique official textbook sources resumably."""

    catalog_path = Path(
        catalog_file
    ).expanduser().resolve()

    if not catalog_path.is_file():
        raise TextbookDownloadError(
            f"Catalogue does not exist: {catalog_path}"
        )

    try:
        catalog = load_catalog(catalog_path)
    except TextbookBatchError as error:
        raise TextbookDownloadError(
            str(error)
        ) from error

    books = [
        book
        for book in catalog.get("books", [])
        if isinstance(book, dict)
    ]

    source_ids = selected_source_ids(
        books,
        book_ids,
    )
    groups = source_groups(
        books,
        source_ids,
    )

    project_root = project_root_for_catalog(
        catalog_path
    )

    summary = {
        "selected_sources": len(groups),
        "planned": 0,
        "downloaded": 0,
        "skipped": 0,
        "failed": 0,
        "records_updated": 0,
    }

    processed = 0

    for source_id in sorted(groups):
        if limit is not None and processed >= limit:
            break

        processed += 1
        records = groups[source_id]

        try:
            local_value = canonical_local_file(
                records
            )
            destination = resolve_project_path(
                local_value,
                project_root=project_root,
            )
        except TextbookDownloadError as error:
            summary["failed"] += 1

            if not dry_run:
                for record in records:
                    record["download_status"] = "failed"
                    record["download_error"] = str(error)
                    record["last_download_failed_at"] = (
                        utc_now()
                    )

                save_catalog(
                    catalog_path,
                    catalog,
                )

            continue

        if not force and is_valid_pdf(destination):
            summary["skipped"] += 1
            summary["records_updated"] += len(records)

            if not dry_run:
                update_records(
                    records,
                    status="complete",
                    local_file=local_value,
                )
                save_catalog(
                    catalog_path,
                    catalog,
                )

            continue

        summary["planned"] += 1

        if dry_run:
            continue

        destination.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        temporary = destination.with_suffix(
            destination.suffix + ".part"
        )

        temporary.unlink(missing_ok=True)

        try:
            result = gdown.download(
                id=source_id,
                output=str(temporary),
                quiet=False,
            )

            if not result or not is_valid_pdf(temporary):
                raise TextbookDownloadError(
                    "Downloaded content is missing or is not "
                    "a valid PDF."
                )

            temporary.replace(destination)

            update_records(
                records,
                status="complete",
                local_file=local_value,
            )

            summary["downloaded"] += 1
            summary["records_updated"] += len(records)

        except Exception as error:
            temporary.unlink(missing_ok=True)

            update_records(
                records,
                status="failed",
                local_file=local_value,
                error=str(error),
            )

            summary["failed"] += 1

        save_catalog(
            catalog_path,
            catalog,
        )

    return summary


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Download unique official textbook files "
            "from the Slickk catalogue."
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
        "--limit",
        type=int,
    )
    parser.add_argument(
        "--force",
        action="store_true",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_argument_parser().parse_args(
        argv
    )

    try:
        summary = download_catalog_textbooks(
            arguments.catalog,
            book_ids=arguments.book_ids,
            limit=arguments.limit,
            force=arguments.force,
            dry_run=arguments.dry_run,
        )
    except TextbookDownloadError as error:
        print(
            f"[Slickk] Textbook download failed: {error}",
            file=sys.stderr,
        )
        return 2

    print("[Slickk] Textbook download run complete.")
    print(
        f"Selected sources: "
        f"{summary['selected_sources']}"
    )
    print(f"Planned: {summary['planned']}")
    print(f"Downloaded: {summary['downloaded']}")
    print(f"Skipped: {summary['skipped']}")
    print(f"Failed: {summary['failed']}")
    print(
        f"Records updated: "
        f"{summary['records_updated']}"
    )

    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
