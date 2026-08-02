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

    def test_ungrounded_model_answer_is_blocked(
        self,
    ) -> None:
        metadata = {
            "grounded": False,
            "grade": "Class 7",
            "topic": (
                "Explain Bandana worship in simple "
                "Class 7 language"
            ),
            "teaching_mode": "explain",
            "language": "english",
            "_verified_response": "",
            "sources": [],
        }

        model_answer = (
            "BANDAN WATERS IS A FUN DANCE OF THE "
            "BRETHORN ORDER WITH ENHYDRATED PAPERS."
        )

        response, model_rejected = select_tutor_response(
            model_answer,
            metadata,
        )

        self.assertTrue(model_rejected)
        self.assertEqual(
            metadata.get("_response_mode_override"),
            "source_required",
        )
        self.assertIn(
            "upload the relevant textbook page",
            response.lower(),
        )
        self.assertNotIn(
            "enhydrated papers",
            response.lower(),
        )

    def test_grounded_valid_answer_is_preserved(
        self,
    ) -> None:
        metadata = {
            "grounded": True,
            "grade": "Class 7",
            "topic": "Respiration",
            "teaching_mode": "explain",
            "language": "english",
            "_verified_response": (
                "Respiration releases energy from glucose. "
                "What does respiration release?"
            ),
        }

        model_answer = (
            "Respiration is a chemical process inside living "
            "cells that releases energy from glucose. Why do "
            "living organisms need this energy?"
        )

        response, model_rejected = select_tutor_response(
            model_answer,
            metadata,
        )

        self.assertFalse(model_rejected)
        self.assertEqual(
            response,
            model_answer,
        )

    def test_safe_ungrounded_source_request_is_preserved(
        self,
    ) -> None:
        metadata = {
            "grounded": False,
            "grade": "Class 7",
            "topic": "Unknown lesson",
            "teaching_mode": "explain",
            "language": "english",
            "_verified_response": "",
        }

        safe_response = (
            "I do not have a verified textbook passage "
            "for that topic. Could you provide the "
            "chapter or page?"
        )

        response, rejected = select_tutor_response(
            safe_response,
            metadata,
        )

        self.assertFalse(rejected)
        self.assertEqual(
            response,
            safe_response,
        )
        self.assertEqual(
            metadata.get("_response_mode_override"),
            "source_required",
        )


if __name__ == "__main__":
    unittest.main()
