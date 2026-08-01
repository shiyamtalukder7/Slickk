import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from slickk_server.textbook_ingest import (
    TextbookIngestError,
    ingest_textbook,
    ocr_language_for_metadata,
    split_text,
)


class TextbookIngestTests(unittest.TestCase):
    def test_split_text_creates_bounded_chunks(self) -> None:
        text = " ".join(
            f"Sentence number {index} contains lesson content."
            for index in range(30)
        )

        chunks = split_text(
            text,
            max_chars=180,
            overlap_chars=25,
        )

        self.assertGreater(len(chunks), 1)
        self.assertTrue(
            all(
                1 <= len(chunk) <= 180
                for chunk in chunks
            )
        )

    def test_split_text_preserves_whole_word_boundaries(self) -> None:
        text = " ".join(
            f"scienceword{index:03d}"
            for index in range(120)
        )
        original_words = set(text.split())

        chunks = split_text(
            text,
            max_chars=180,
            overlap_chars=35,
        )

        self.assertGreater(len(chunks), 1)

        for chunk in chunks:
            chunk_words = chunk.split()

            self.assertIn(
                chunk_words[0],
                original_words,
            )
            self.assertIn(
                chunk_words[-1],
                original_words,
            )

        for previous, current in zip(
            chunks,
            chunks[1:],
        ):
            self.assertTrue(
                set(previous.split())
                & set(current.split())
            )

    def test_ocr_language_selection(self) -> None:
        self.assertEqual(
            ocr_language_for_metadata(
                subject="general-science",
                language="English",
            ),
            "eng",
        )

        self.assertEqual(
            ocr_language_for_metadata(
                subject="bangla",
                language="Bangla",
            ),
            "ben+eng",
        )

        self.assertEqual(
            ocr_language_for_metadata(
                subject="general-science",
                language="\u09ac\u09be\u0982\u09b2\u09be",
            ),
            "ben+eng",
        )

        self.assertEqual(
            ocr_language_for_metadata(
                subject="arabic",
                language="Bangla",
            ),
            "ara+ben+eng",
        )

    def test_ingest_passes_selected_ocr_language(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "bangla.txt"
            output_directory = root / "output"

            source.write_text(
                "Bangla textbook test content.",
                encoding="utf-8",
            )

            with patch(
                "slickk_server.textbook_ingest."
                "extract_source_pages",
                return_value=[
                    {
                        "page": 1,
                        "text": (
                            "Bangla textbook test content."
                        ),
                    }
                ],
            ) as mocked_extract:
                _, payload = ingest_textbook(
                    source,
                    curriculum="nctb-bangla",
                    level="Class 7",
                    subject="Bangla",
                    language="Bangla",
                    output_directory=output_directory,
                )

            mocked_extract.assert_called_once_with(
                source.resolve(),
                ocr_language="ben+eng",
            )

            self.assertEqual(
                payload["source"]["ocr_language"],
                "ben+eng",
            )

    def test_plain_text_is_staged_for_review(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "biology.txt"
            output_directory = root / "output"

            source.write_text(
                (
                    "Respiration releases energy from glucose "
                    "inside living cells. "
                )
                * 30,
                encoding="utf-8",
            )

            output_path, payload = ingest_textbook(
                source,
                curriculum="nctb-english-version",
                level="Class 7",
                subject="Biology",
                language="English",
                title="Class 7 Biology",
                output_directory=output_directory,
                max_chars=300,
                overlap_chars=30,
            )

            self.assertTrue(output_path.exists())
            self.assertEqual(
                payload["status"],
                "needs_human_review",
            )
            self.assertFalse(
                payload["production_knowledge"]
            )
            self.assertEqual(
                payload["metadata"]["curriculum"],
                "nctb-english-version",
            )
            self.assertEqual(
                payload["metadata"]["level"],
                "Class 7",
            )
            self.assertEqual(
                payload["metadata"]["subject"],
                "biology",
            )
            self.assertGreater(
                len(payload["chunks"]),
                1,
            )
            self.assertTrue(
                all(
                    not chunk["review"]["approved"]
                    for chunk in payload["chunks"]
                )
            )

    def test_unknown_curriculum_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "lesson.txt"
            source.write_text(
                "A valid lesson paragraph.",
                encoding="utf-8",
            )

            with self.assertRaises(TextbookIngestError):
                ingest_textbook(
                    source,
                    curriculum="unknown-board",
                    level="Class 7",
                    subject="Biology",
                    language="English",
                    output_directory=directory,
                )

    def test_empty_source_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "empty.txt"
            source.write_text(
                "   \n\n   ",
                encoding="utf-8",
            )

            with self.assertRaises(TextbookIngestError):
                ingest_textbook(
                    source,
                    curriculum="nctb-english-version",
                    level="Class 7",
                    subject="Biology",
                    language="English",
                    output_directory=directory,
                )


if __name__ == "__main__":
    unittest.main()
