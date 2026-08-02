from __future__ import annotations

import copy
import unittest

from slickk_server.textbook_quality import (
    score_chunk,
    score_staging_payload,
)


class TextbookQualityTests(unittest.TestCase):
    def test_clean_english_is_low_risk(self) -> None:
        report = score_chunk(
            {
                "id": "english-1",
                "page_start": 1,
                "page_end": 1,
                "text": (
                    "Respiration releases energy from "
                    "glucose inside living cells. "
                )
                * 4,
            },
            ocr_language="eng",
        )

        self.assertEqual(
            report["quality_band"],
            "low-risk",
        )
        self.assertEqual(
            report["unexpected_letters"],
            0,
        )

    def test_clean_bengali_is_low_risk(self) -> None:
        text = (
            "\u09ac\u09be\u0982\u09b2\u09be "
            "\u09aa\u09be\u09a0\u09cd\u09af\u09ac\u0987 "
            "\u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0\u09a6\u09c7\u09b0 "
            "\u099c\u09cd\u099e\u09be\u09a8 "
            "\u0993 "
            "\u09a6\u0995\u09cd\u09b7\u09a4\u09be "
            "\u09ac\u09c3\u09a6\u09cd\u09a7\u09bf "
            "\u0995\u09b0\u09c7\u0964 "
        ) * 4

        report = score_chunk(
            {
                "id": "bangla-1",
                "page_start": 1,
                "page_end": 1,
                "text": text,
            },
            ocr_language="ben+eng",
        )

        self.assertEqual(
            report["quality_band"],
            "low-risk",
        )
        self.assertGreater(
            report["script_counts"].get(
                "bengali",
                0,
            ),
            20,
        )

    def test_corrupted_mixed_script_is_flagged(
        self,
    ) -> None:
        text = (
            "\u09ac\u09be\u0982\u09b2\u09be\u027b "
            "\u09aa\u09be\u09a0\u038e "
            "\u09b6\u09bf\u0995\u09cd\u09b7\u09be\u031c "
        ) * 20

        report = score_chunk(
            {
                "id": "corrupt-1",
                "page_start": 1,
                "page_end": 1,
                "text": text,
            },
            ocr_language="ben+eng",
        )

        issue_codes = {
            issue["code"]
            for issue in report["issues"]
        }

        self.assertNotEqual(
            report["quality_band"],
            "low-risk",
        )
        self.assertTrue(
            {
                "unexpected-script",
                "mixed-script-token",
                "orphan-combining-mark",
            }
            & issue_codes
        )

    def test_isolated_uppercase_fragment_is_flagged(
        self,
    ) -> None:
        text = (
            "\u09ac\u09be\u0982\u09b2\u09be "
            "\u09aa\u09be\u09a0\u09cd\u09af\u09ac\u0987 "
            "\u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0\u09a6\u09c7\u09b0 "
            "\u099c\u09cd\u099e\u09be\u09a8 "
        ) * 8 + "\nTRON"

        report = score_chunk(
            {
                "id": "fragment-1",
                "page_start": 1,
                "page_end": 1,
                "text": text,
            },
            ocr_language="ben+eng",
        )

        issue_codes = {
            issue["code"]
            for issue in report["issues"]
        }

        self.assertIn(
            "isolated-uppercase-fragment",
            issue_codes,
        )

    def test_arabic_bidi_marks_are_allowed(
        self,
    ) -> None:
        text = (
            "\u09ac\u09be\u0982\u09b2\u09be "
            "\u09aa\u09be\u09a0\u09cd\u09af\u09ac\u0987 "
            "\u200f"
            "\u0627\u0644\u0639\u0631\u0628\u064a\u0629"
            "\u200e "
            "\u09ad\u09be\u09b7\u09be\u09b0 "
            "\u09aa\u09be\u09a0\u0964 "
        ) * 6

        report = score_chunk(
            {
                "id": "arabic-bidi-1",
                "page_start": 1,
                "page_end": 1,
                "text": text,
            },
            ocr_language="ara+ben+eng",
        )

        issue_codes = {
            issue["code"]
            for issue in report["issues"]
        }

        self.assertEqual(
            report["quality_band"],
            "low-risk",
        )
        self.assertNotIn(
            "unexpected-control-character",
            issue_codes,
        )
        self.assertGreater(
            report[
                "allowed_bidi_control_characters"
            ],
            0,
        )
        self.assertEqual(
            report[
                "unexpected_control_characters"
            ],
            0,
        )

    def test_bidi_mark_is_flagged_without_arabic_ocr(
        self,
    ) -> None:
        text = (
            "English textbook content contains "
            "\u200f an unexpected direction mark. "
        ) * 5

        report = score_chunk(
            {
                "id": "english-bidi-1",
                "page_start": 1,
                "page_end": 1,
                "text": text,
            },
            ocr_language="eng",
        )

        issue_codes = {
            issue["code"]
            for issue in report["issues"]
        }

        self.assertIn(
            "unexpected-control-character",
            issue_codes,
        )
        self.assertGreater(
            report[
                "unexpected_control_characters"
            ],
            0,
        )

    def test_latin_compatibility_ligature_is_valid(
        self,
    ) -> None:
        text = (
            "The authority should take "
            "\ufb06eps to protect the environment. "
        ) * 5

        report = score_chunk(
            {
                "id": "ligature-1",
                "page_start": 1,
                "page_end": 1,
                "text": text,
            },
            ocr_language="eng",
        )

        issue_codes = {
            issue["code"]
            for issue in report["issues"]
        }

        self.assertEqual(
            report["quality_band"],
            "low-risk",
        )
        self.assertEqual(
            report["mixed_script_tokens"],
            [],
        )
        self.assertNotIn(
            "mixed-script-token",
            issue_codes,
        )

    def test_scoring_does_not_modify_payload(
        self,
    ) -> None:
        payload = {
            "status": "needs_human_review",
            "production_knowledge": False,
            "metadata": {
                "curriculum": "nctb-bangla",
                "title": "Test",
            },
            "source": {
                "ocr_language": "ben+eng",
            },
            "chunks": [
                {
                    "id": "chunk-1",
                    "page_start": 1,
                    "page_end": 1,
                    "text": (
                        "A safe textbook sentence. "
                        * 10
                    ),
                    "review": {
                        "approved": False,
                    },
                }
            ],
        }

        original = copy.deepcopy(payload)

        report = score_staging_payload(
            payload
        )

        self.assertEqual(payload, original)
        self.assertFalse(
            report["automatic_approval"]
        )
        self.assertFalse(
            report["production_knowledge"]
        )


if __name__ == "__main__":
    unittest.main()
