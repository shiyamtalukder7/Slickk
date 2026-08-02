import unittest

from slickk_server.tutor_engine import (
    build_verified_response,
)


class VerifiedFallbackTests(unittest.TestCase):
    def test_bandana_fallback_is_concise_and_topic_aware(
        self,
    ) -> None:
        document = {
            "title": "Buddhist Religion Studies",
            "topic": "Bandana (worship) 15",
            "language": "english",
            "facts": [
                """
2026

Bandana (worship) 15

Lesson-2
Rules of worshipping the triple gem:

We are to follow some rules compulsorily before
worshipping triple gem. Worship is done at a monastery
and in front of the statue of Buddha at home. Worship
is done twice in the morning and evening.

Activity

Describe the rules before worship.

Lesson-3
This later lesson must not appear.
"""
            ],
        }

        response = build_verified_response(
            [document],
            teaching_mode="explain",
        )

        self.assertIn(
            "Rules of worshipping the triple gem",
            response,
        )
        self.assertIn(
            "learned about Bandana (worship)?",
            response,
        )
        self.assertNotIn(
            "Does respiration",
            response,
        )
        self.assertNotIn(
            "Activity",
            response,
        )
        self.assertNotIn(
            "Lesson-3",
            response,
        )
        self.assertLess(
            len(response),
            750,
        )

    def test_bangla_fallback_uses_bangla_question(
        self,
    ) -> None:
        document = {
            "title": "\u09ac\u09bf\u099c\u09cd\u099e\u09be\u09a8",
            "topic": "\u09b6\u09cd\u09ac\u09b8\u09a8",
            "language": "bangla",
            "facts": [
                (
                    "\u09b6\u09cd\u09ac\u09b8\u09a8 "
                    "\u099c\u09c0\u09ac\u0995\u09cb\u09b7\u09c7 "
                    "\u09b8\u0982\u0998\u099f\u09bf\u09a4 "
                    "\u098f\u0995\u099f\u09bf "
                    "\u09b0\u09be\u09b8\u09be\u09af\u09bc\u09a8\u09bf\u0995 "
                    "\u09aa\u09cd\u09b0\u0995\u09cd\u09b0\u09bf\u09af\u09bc\u09be\u0964"
                )
            ],
        }

        response = build_verified_response(
            [document],
            teaching_mode="explain",
        )

        self.assertIn(
            "\u09ac\u09cb\u099d\u09be\u09b0 "
            "\u099c\u09a8\u09cd\u09af "
            "\u09aa\u09cd\u09b0\u09b6\u09cd\u09a8",
            response,
        )
        self.assertNotIn(
            "Check your understanding",
            response,
        )

    def test_verified_facts_are_preserved(
        self,
    ) -> None:
        document = {
            "title": "Respiration",
            "topic": "Respiration",
            "language": "english",
            "facts": [
                (
                    "Respiration is a chemical process "
                    "inside living cells."
                ),
                (
                    "It releases energy from glucose."
                ),
            ],
        }

        response = build_verified_response(
            [document],
            teaching_mode="revision",
        )

        self.assertIn(
            "Respiration is a chemical process",
            response,
        )
        self.assertIn(
            "It releases energy from glucose.",
            response,
        )
        self.assertIn(
            "learned about Respiration?",
            response,
        )

    def test_homework_mode_does_not_force_question(
        self,
    ) -> None:
        document = {
            "title": "Plant Growth",
            "topic": "Plant Growth",
            "language": "english",
            "facts": [
                (
                    "Plants grow by producing new cells "
                    "and increasing in size."
                )
            ],
        }

        response = build_verified_response(
            [document],
            teaching_mode="homework",
        )

        self.assertNotIn(
            "Check your understanding",
            response,
        )


if __name__ == "__main__":
    unittest.main()
