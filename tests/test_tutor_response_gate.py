import unittest

from slickk_server.tutor_engine import (
    model_response_is_low_quality,
    select_tutor_response,
)


class TutorResponseGateTests(unittest.TestCase):
    def test_rejects_observed_questionless_step_sequence(
        self,
    ) -> None:
        answer = (
            "Teacher: Now we will see how you do it. "
            "First step: Wash your hands and face. "
            "Second step: Put your hands together. "
            "Third step: Take your hands away. "
            "Fourth step: Finally, bow towards the statue. "
            "Fifth step: Prepare for another action. "
            "Sixth step: Finally, thank the person. "
            "Seventh step: Look around the room. "
            "Eighth step: Turn around carefully."
        )

        self.assertTrue(
            model_response_is_low_quality(
                answer,
                topic="Bandana",
                teaching_mode="explain",
                language="english",
            )
        )

    def test_long_explanation_requires_check_question(
        self,
    ) -> None:
        answer = (
            "Bandana means showing respect during worship. "
            "A learner should understand that respectful behaviour "
            "includes a calm mind, proper attention, and sincere "
            "conduct. These actions should not be treated as a game "
            "or performed carelessly because their purpose is to "
            "develop respect and thoughtful behaviour."
        )

        self.assertTrue(
            model_response_is_low_quality(
                answer,
                topic="Bandana",
                teaching_mode="explain",
                language="english",
            )
        )

    def test_valid_explanation_with_question_is_preserved(
        self,
    ) -> None:
        answer = (
            "Bandana means showing respect during worship. "
            "It should be performed with attention and sincerity, "
            "rather than carelessly. This helps the learner practise "
            "respectful and thoughtful behaviour. Why is sincerity "
            "important during worship?"
        )

        self.assertFalse(
            model_response_is_low_quality(
                answer,
                topic="Bandana",
                teaching_mode="explain",
                language="english",
            )
        )

    def test_rejects_obviously_truncated_english_response(
        self,
    ) -> None:
        self.assertTrue(
            model_response_is_low_quality(
                (
                    "Respiration releases energy inside living "
                    "cells and is important because"
                ),
                topic="Respiration",
                teaching_mode="revision",
                language="english",
            )
        )

    def test_rejects_major_drift_from_grounding(
        self,
    ) -> None:
        self.assertTrue(
            model_response_is_low_quality(
                (
                    "Volcanoes release molten rock, ash, and gases "
                    "through openings in the Earth's crust. Pressure "
                    "builds beneath the surface before an eruption."
                ),
                topic="Respiration",
                teaching_mode="revision",
                language="english",
                grounding_text=(
                    "Respiration is a chemical process in living "
                    "cells that releases energy from glucose."
                ),
            )
        )

    def test_non_english_response_is_not_forced_to_use_question_mark(
        self,
    ) -> None:
        answer = (
            "শ্বসন জীবকোষে সংঘটিত একটি রাসায়নিক প্রক্রিয়া। "
            "এই প্রক্রিয়ায় গ্লুকোজ থেকে জীবের প্রয়োজনীয় "
            "শক্তি উৎপন্ন হয়।"
        )

        self.assertFalse(
            model_response_is_low_quality(
                answer,
                topic="শ্বসন",
                teaching_mode="explain",
                language="bangla",
            )
        )

    def test_questionless_grounded_answer_uses_verified_fallback(
        self,
    ) -> None:
        metadata = {
            "grounded": True,
            "topic": "Bandana",
            "teaching_mode": "explain",
            "language": "english",
            "_verified_response": (
                "Bandana is an expression of respect during worship. "
                "What attitude should a learner show during Bandana?"
            ),
        }

        model_answer = (
            "First step: Wash your hands. Second step: Stand near "
            "the statue. Third step: Look around. Fourth step: Bow. "
            "Fifth step: Turn around. Sixth step: Finally leave. "
            "Seventh step: Finally return. Eighth step: Sit down."
        )

        response, used_fallback = select_tutor_response(
            model_answer,
            metadata,
        )

        self.assertTrue(used_fallback)
        self.assertIn(
            "expression of respect",
            response,
        )


if __name__ == "__main__":
    unittest.main()
