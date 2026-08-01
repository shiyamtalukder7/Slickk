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


def make_catalog(book: dict) -> dict:
    return {
        "format": "slickk-textbook-catalog-v1",
        "catalog_version": 1,
        "books": [book],
    }


def make_book(
    *,
    import_status: str = "pending",
    local_file: str = "textbooks/science.txt",
    staging_file: str | None = None,
) -> dict:
    return {
        "id": "science-book",
        "curriculum": "nctb-english-version",
        "level": "Class 7",
        "level_id": "class-7",
        "subject": "general-science",
        "language": "English",
        "title": "Class 7 Science",
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
