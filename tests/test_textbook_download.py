import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from slickk_server.textbook_batch import (
    load_catalog,
    local_state_path_for_catalog,
)
from slickk_server.textbook_download import (
    TextbookDownloadError,
    download_catalog_textbooks,
)


SOURCE_ID = "shared-google-drive-source"


def make_book(
    *,
    book_id: str,
    curriculum: str,
    local_file: str = "textbooks/shared.pdf",
) -> dict:
    return {
        "id": book_id,
        "curriculum": curriculum,
        "level": "Class 7",
        "subject": "english",
        "language": "English",
        "title": "English for Today",
        "source_file_id": SOURCE_ID,
        "source_url": (
            "https://drive.google.com/file/d/"
            f"{SOURCE_ID}/view"
        ),
        "local_file": local_file,
        "download_status": "pending",
        "import_status": "pending",
        "enabled": True,
    }


class TextbookDownloadTests(unittest.TestCase):
    def create_project(
        self,
        root: Path,
        books: list[dict],
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
                {
                    "format": (
                        "slickk-textbook-catalog-v1"
                    ),
                    "catalog_version": 1,
                    "books": books,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        return project, catalog_path

    @staticmethod
    def write_valid_pdf(path: Path) -> None:
        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        path.write_bytes(
            b"%PDF-1.4\n"
            + b"0" * 2048
        )

    def test_shared_source_downloads_once_and_updates_both(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            books = [
                make_book(
                    book_id="bangla-record",
                    curriculum="nctb-bangla",
                ),
                make_book(
                    book_id="english-version-record",
                    curriculum="nctb-english-version",
                ),
            ]

            project, catalog_path = self.create_project(
                root,
                books,
            )

            destination = (
                project
                / "textbooks"
                / "shared.pdf"
            )

            original_catalog = catalog_path.read_bytes()

            def fake_download(
                *,
                id: str,
                output: str,
                quiet: bool,
            ) -> str:
                self.assertEqual(id, SOURCE_ID)
                self.assertFalse(quiet)

                temporary = Path(output)
                self.write_valid_pdf(temporary)
                return str(temporary)

            with patch(
                "slickk_server.textbook_download."
                "gdown.download",
                side_effect=fake_download,
            ) as mocked_download:
                summary = download_catalog_textbooks(
                    catalog_path
                )

            mocked_download.assert_called_once()

            self.assertTrue(destination.exists())
            self.assertEqual(
                summary["selected_sources"],
                1,
            )
            self.assertEqual(
                summary["downloaded"],
                1,
            )
            self.assertEqual(
                summary["records_updated"],
                2,
            )

            self.assertEqual(
                catalog_path.read_bytes(),
                original_catalog,
            )

            state_path = local_state_path_for_catalog(
                catalog_path
            )
            self.assertTrue(state_path.is_file())

            updated = load_catalog(
                catalog_path
            )

            self.assertTrue(
                all(
                    book["download_status"]
                    == "complete"
                    for book in updated["books"]
                )
            )

    def test_existing_valid_pdf_is_skipped(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            project, catalog_path = self.create_project(
                root,
                [
                    make_book(
                        book_id="existing-record",
                        curriculum="nctb-bangla",
                    )
                ],
            )

            destination = (
                project
                / "textbooks"
                / "shared.pdf"
            )
            self.write_valid_pdf(destination)

            with patch(
                "slickk_server.textbook_download."
                "gdown.download"
            ) as mocked_download:
                summary = download_catalog_textbooks(
                    catalog_path
                )

            mocked_download.assert_not_called()

            self.assertEqual(
                summary["skipped"],
                1,
            )
            self.assertEqual(
                summary["downloaded"],
                0,
            )

    def test_dry_run_does_not_download_or_modify_catalog(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            _, catalog_path = self.create_project(
                root,
                [
                    make_book(
                        book_id="dry-run-record",
                        curriculum="nctb-bangla",
                    )
                ],
            )

            original = catalog_path.read_bytes()

            with patch(
                "slickk_server.textbook_download."
                "gdown.download"
            ) as mocked_download:
                summary = download_catalog_textbooks(
                    catalog_path,
                    dry_run=True,
                )

            mocked_download.assert_not_called()

            self.assertEqual(
                summary["planned"],
                1,
            )
            self.assertEqual(
                summary["downloaded"],
                0,
            )
            self.assertEqual(
                catalog_path.read_bytes(),
                original,
            )

    def test_unknown_book_id_is_rejected(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            _, catalog_path = self.create_project(
                root,
                [
                    make_book(
                        book_id="known-record",
                        curriculum="nctb-bangla",
                    )
                ],
            )

            with self.assertRaises(
                TextbookDownloadError
            ):
                download_catalog_textbooks(
                    catalog_path,
                    book_ids=["unknown-record"],
                )


if __name__ == "__main__":
    unittest.main()
