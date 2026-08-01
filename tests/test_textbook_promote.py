import json
import tempfile
import unittest
from pathlib import Path

from slickk_server.textbook_promote import (
    TextbookPromotionError,
    promote_textbook,
)


SOURCE_HASH = "a" * 64


def staging_payload(
    *,
    approved: bool = True,
    reviewer: str = "Teacher Rahman",
    facts: list[str] | None = None,
    objectives: list[str] | None = None,
) -> dict:
    return {
        "format": "slickk-textbook-staging-v1",
        "status": "needs_human_review",
        "production_knowledge": False,
        "source": {
            "filename": "biology.pdf",
            "file_type": ".pdf",
            "sha256": SOURCE_HASH,
            "page_count": 10,
            "pages_with_text": 10,
        },
        "metadata": {
            "curriculum": "nctb-english-version",
            "level": "Class 7",
            "level_id": "class-7",
            "subject": "biology",
            "language": "english",
            "title": "Class 7 Biology",
        },
        "chunks": [
            {
                "id": "chunk-1",
                "page_start": 4,
                "page_end": 4,
                "text": "Extracted source text.",
                "review": {
                    "approved": approved,
                    "reviewer": reviewer,
                    "chapter": "Life Processes",
                    "topic": "Respiration",
                    "learning_objectives": (
                        objectives
                        if objectives is not None
                        else [
                            "Define respiration."
                        ]
                    ),
                    "verified_facts": (
                        facts
                        if facts is not None
                        else [
                            (
                                "Respiration releases energy "
                                "from glucose inside living cells."
                            )
                        ]
                    ),
                    "common_mistakes": [
                        (
                            "Respiration is not simply "
                            "breathing."
                        )
                    ],
                    "notes": "",
                },
            }
        ],
    }


class TextbookPromotionTests(unittest.TestCase):
    def write_staging(
        self,
        root: Path,
        payload: dict,
    ) -> Path:
        path = root / "staging.json"
        path.write_text(
            json.dumps(
                payload,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        return path

    def test_approved_chunk_becomes_production_lesson(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.write_staging(
                root,
                staging_payload(),
            )

            output_path, payload = promote_textbook(
                source,
                output_directory=root / "approved",
            )

            self.assertTrue(output_path.exists())
            self.assertTrue(
                payload["production_knowledge"]
            )
            self.assertEqual(
                len(payload["documents"]),
                1,
            )

            lesson = payload["documents"][0]

            self.assertEqual(
                lesson["curriculum"],
                "nctb-english-version",
            )
            self.assertEqual(
                lesson["grade"],
                "Class 7",
            )
            self.assertEqual(
                lesson["subject"],
                "biology",
            )
            self.assertEqual(
                lesson["topic"],
                "Respiration",
            )
            self.assertEqual(
                lesson["facts"],
                lesson["verified_facts"],
            )
            self.assertEqual(
                lesson["misconceptions"],
                lesson["common_mistakes"],
            )
            self.assertEqual(
                lesson["source_type"],
                "Human-reviewed textbook lesson",
            )

    def test_unchanged_promotion_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.write_staging(
                root,
                staging_payload(),
            )
            output_directory = root / "approved"

            first_path, first_payload = promote_textbook(
                source,
                output_directory=output_directory,
            )
            second_path, second_payload = promote_textbook(
                source,
                output_directory=output_directory,
            )

            self.assertEqual(
                first_path,
                second_path,
            )
            self.assertEqual(
                first_payload["promotion_sha256"],
                second_payload["promotion_sha256"],
            )
            self.assertEqual(
                first_payload["promoted_at"],
                second_payload["promoted_at"],
            )

    def test_unapproved_chunks_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.write_staging(
                root,
                staging_payload(approved=False),
            )

            with self.assertRaises(TextbookPromotionError):
                promote_textbook(
                    source,
                    output_directory=root / "approved",
                )

    def test_approved_chunk_requires_reviewer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.write_staging(
                root,
                staging_payload(reviewer=""),
            )

            with self.assertRaises(TextbookPromotionError):
                promote_textbook(
                    source,
                    output_directory=root / "approved",
                )

    def test_approved_chunk_requires_verified_facts(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.write_staging(
                root,
                staging_payload(facts=[]),
            )

            with self.assertRaises(TextbookPromotionError):
                promote_textbook(
                    source,
                    output_directory=root / "approved",
                )

    def test_approved_chunk_requires_objectives(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.write_staging(
                root,
                staging_payload(objectives=[]),
            )

            with self.assertRaises(TextbookPromotionError):
                promote_textbook(
                    source,
                    output_directory=root / "approved",
                )


if __name__ == "__main__":
    unittest.main()
