import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from slickk_server.textbook_batch import (
    TextbookBatchError,
    load_catalog,
    run_batch,
)


def make_catalog(
    book: dict | list[dict],
) -> dict:
    books = (
        book
        if isinstance(book, list)
        else [book]
    )

    return {
        "format": "slickk-textbook-catalog-v1",
        "catalog_version": 1,
        "books": books,
    }


def make_book(
    *,
    import_status: str = "pending",
    local_file: str = "textbooks/science.txt",
    staging_file: str | None = None,
    book_id: str = "science-book",
    title: str = "Class 7 Science",
    source_file_id: str = "science-source",
) -> dict:
    return {
        "id": book_id,
        "curriculum": "nctb-english-version",
        "level": "Class 7",
        "level_id": "class-7",
        "subject": "general-science",
        "language": "English",
        "title": title,
        "source_file_id": source_file_id,
        "local_file": local_file,
        "staging_file": staging_file,
        "import_status": import_status,
        "promotion_status": "not-promoted",
        "enabled": True,
    }


class TextbookBatchTests(unittest.TestCase):
    def create_project(
        self,
        root: Path,
        book: dict,
    ) -> tuple[Path, Path]:
        project = root / "project"
        knowledge = (
            project
            / "slickk_server"
            / "knowledge"
        )
        knowledge.mkdir(parents=True)

        catalog_path = (
            knowledge
            / "textbook_catalog.json"
        )
        catalog_path.write_text(
            json.dumps(
                make_catalog(book),
                indent=2,
            ),
            encoding="utf-8",
        )

        return project, catalog_path

    def test_completed_book_is_skipped_without_reimport(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            book = make_book(
                import_status="needs-human-review",
                staging_file=(
                    "slickk_server/knowledge/"
                    "_imports/science.json"
                ),
            )

            project, catalog_path = self.create_project(
                root,
                book,
            )

            textbook = (
                project
                / "textbooks"
                / "science.txt"
            )
            textbook.parent.mkdir(parents=True)
            textbook.write_text(
                "Science lesson.",
                encoding="utf-8",
            )

            staging = (
                project
                / "slickk_server"
                / "knowledge"
                / "_imports"
                / "science.json"
            )
            staging.parent.mkdir(parents=True)
            staging.write_text(
                "{}",
                encoding="utf-8",
            )

            with patch(
                "slickk_server.textbook_batch."
                "ingest_textbook"
            ) as mocked_ingest:
                summary = run_batch(catalog_path)

            self.assertEqual(
                summary["skipped"],
                1,
            )
            self.assertEqual(
                summary["imported"],
                0,
            )
            mocked_ingest.assert_not_called()

    def test_pending_book_imports_and_updates_catalog(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            book = make_book()

            project, catalog_path = self.create_project(
                root,
                book,
            )

            textbook = (
                project
                / "textbooks"
                / "science.txt"
            )
            textbook.parent.mkdir(parents=True)
            textbook.write_text(
                "Respiration releases energy.",
                encoding="utf-8",
            )

            staging = (
                project
                / "slickk_server"
                / "knowledge"
                / "_imports"
                / "science.json"
            )
            staging.parent.mkdir(parents=True)
            staging.write_text(
                "{}",
                encoding="utf-8",
            )

            with patch(
                "slickk_server.textbook_batch."
                "ingest_textbook",
                return_value=(staging, {}),
            ) as mocked_ingest:
                summary = run_batch(catalog_path)

            self.assertEqual(
                summary["imported"],
                1,
            )
            self.assertEqual(
                summary["failed"],
                0,
            )
            mocked_ingest.assert_called_once()

            updated = json.loads(
                catalog_path.read_text(
                    encoding="utf-8"
                )
            )
            updated_book = updated["books"][0]

            self.assertEqual(
                updated_book["import_status"],
                "needs-human-review",
            )
            self.assertEqual(
                updated_book["staging_file"],
                (
                    "slickk_server/knowledge/"
                    "_imports/science.json"
                ),
            )
            self.assertIsNone(
                updated_book["last_error"]
            )

    def test_missing_local_file_is_recorded_as_failure(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            book = make_book(
                local_file="textbooks/missing.pdf",
            )

            _, catalog_path = self.create_project(
                root,
                book,
            )

            summary = run_batch(catalog_path)

            self.assertEqual(
                summary["failed"],
                1,
            )

            updated = json.loads(
                catalog_path.read_text(
                    encoding="utf-8"
                )
            )
            updated_book = updated["books"][0]

            self.assertEqual(
                updated_book["import_status"],
                "failed",
            )
            self.assertIn(
                "does not exist",
                updated_book["last_error"],
            )

    def test_shared_source_uses_persistent_cache(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            first_book = make_book(
                book_id="science-first",
                title="Science First Edition",
                source_file_id="shared-science-source",
            )

            project, catalog_path = self.create_project(
                root,
                first_book,
            )

            textbook = (
                project
                / "textbooks"
                / "science.txt"
            )
            textbook.parent.mkdir(parents=True)
            textbook.write_text(
                "Respiration releases energy.",
                encoding="utf-8",
            )

            first_staging = (
                project
                / "slickk_server"
                / "knowledge"
                / "_imports"
                / "science-first.json"
            )

            extracted_pages = [
                {
                    "page": 1,
                    "text": (
                        "Respiration releases energy."
                    ),
                }
            ]

            with (
                patch(
                    "slickk_server.textbook_batch."
                    "extract_source_pages",
                    return_value=extracted_pages,
                ) as first_extract,
                patch(
                    "slickk_server.textbook_batch."
                    "ingest_textbook",
                    return_value=(first_staging, {}),
                ) as first_ingest,
            ):
                first_summary = run_batch(
                    catalog_path
                )

            self.assertEqual(
                first_summary["imported"],
                1,
            )
            first_extract.assert_called_once()
            first_ingest.assert_called_once()

            cache_directory = (
                project
                / "slickk_server"
                / "knowledge"
                / "_imports"
                / "_extraction_cache"
            )

            cache_files = list(
                cache_directory.glob("*.json.gz")
            )

            self.assertEqual(
                len(cache_files),
                1,
            )

            second_book = make_book(
                book_id="science-second",
                title="Science Second Edition",
                source_file_id="shared-science-source",
            )

            catalog_path.write_text(
                json.dumps(
                    make_catalog(second_book),
                    indent=2,
                ),
                encoding="utf-8",
            )

            second_staging = (
                project
                / "slickk_server"
                / "knowledge"
                / "_imports"
                / "science-second.json"
            )

            with (
                patch(
                    "slickk_server.textbook_batch."
                    "extract_source_pages"
                ) as second_extract,
                patch(
                    "slickk_server.textbook_batch."
                    "ingest_textbook",
                    return_value=(second_staging, {}),
                ) as second_ingest,
            ):
                second_summary = run_batch(
                    catalog_path
                )

            self.assertEqual(
                second_summary["imported"],
                1,
            )
            second_extract.assert_not_called()
            second_ingest.assert_called_once()

            second_kwargs = (
                second_ingest.call_args.kwargs
            )

            self.assertEqual(
                second_kwargs["extracted_pages"],
                extracted_pages,
            )
            self.assertEqual(
                len(
                    second_kwargs[
                        "source_fingerprint"
                    ]
                ),
                64,
            )

    def test_invalid_catalog_format_is_rejected(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            catalog_path = (
                Path(directory)
                / "catalog.json"
            )
            catalog_path.write_text(
                json.dumps(
                    {
                        "format": "invalid-format",
                        "books": [],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaises(
                TextbookBatchError
            ):
                load_catalog(catalog_path)


if __name__ == "__main__":
    unittest.main()
