import unittest

from slickk_server.knowledge_base import (
    resolve_curriculum_id,
    retrieve_knowledge,
)
from slickk_server.tutor_engine import (
    model_response_is_low_quality,
    select_tutor_response,
)


class RespirationQualityTests(unittest.TestCase):
    def test_retrieves_nctb_class_7_lesson(self) -> None:
        documents = retrieve_knowledge(
            subject="Biology",
            topic="Respiration",
            grade="Class 7",
            curriculum="nctb-english-version",
            language="english",
            query="Explain respiration.",
        )

        self.assertTrue(documents)
        self.assertEqual(
            documents[0].get("id"),
            "biology-grade7-respiration-001",
        )
        self.assertEqual(
            documents[0].get("curriculum"),
            "nctb-english-version",
        )
        self.assertEqual(
            documents[0].get("grade"),
            "Class 7",
        )

    def test_rejects_incorrect_respiratory_anatomy(self) -> None:
        answer = (
            "The human respiratory system consists of three parts: "
            "nostrils, mouth, stomach and the windpipe."
        )

        self.assertTrue(
            model_response_is_low_quality(
                answer,
                topic="Respiration",
            )
        )

    def test_rejects_respiration_as_breathing(self) -> None:
        self.assertTrue(
            model_response_is_low_quality(
                "Respiration is simply breathing air in and out.",
                topic="Respiration",
            )
        )

    def test_rejects_respiration_in_lungs(self) -> None:
        self.assertTrue(
            model_response_is_low_quality(
                "Respiration occurs mainly in the lungs.",
                topic="Respiration",
            )
        )

    def test_accepts_accurate_respiration_answer(self) -> None:
        answer = (
            "Respiration is a chemical process inside living cells "
            "that releases energy from glucose. Breathing moves air "
            "into and out of the lungs, so breathing and respiration "
            "are different processes."
        )

        self.assertFalse(
            model_response_is_low_quality(
                answer,
                topic="Respiration",
            )
        )

    def test_accurate_correction_is_not_rejected(self) -> None:
        answer = (
            "Respiration does not happen only in the lungs. "
            "It occurs inside living cells."
        )

        self.assertFalse(
            model_response_is_low_quality(
                answer,
                topic="Respiration",
            )
        )

    def test_bad_grounded_answer_uses_verified_fallback(self) -> None:
        metadata = {
            "grounded": True,
            "topic": "Respiration",
            "_verified_response": (
                "Respiration releases energy from glucose "
                "inside living cells."
            ),
        }

        response, used_fallback = select_tutor_response(
            "Respiration occurs mainly in the lungs.",
            metadata,
        )

        self.assertTrue(used_fallback)
        self.assertEqual(
            response,
            "Respiration releases energy from glucose "
            "inside living cells.",
        )

    def test_valid_grounded_answer_is_preserved(self) -> None:
        model_answer = (
            "Aerobic respiration releases energy from glucose "
            "inside cells and uses oxygen."
        )

        metadata = {
            "grounded": True,
            "topic": "Respiration",
            "_verified_response": "Fallback answer.",
        }

        response, used_fallback = select_tutor_response(
            model_answer,
            metadata,
        )

        self.assertFalse(used_fallback)
        self.assertEqual(response, model_answer)


    def test_mobile_curriculum_aliases_are_resolved(self) -> None:
        self.assertEqual(
            resolve_curriculum_id("nctb-bangla-version"),
            "nctb-bangla",
        )
        self.assertEqual(
            resolve_curriculum_id("cambridge-international"),
            "cambridge",
        )
        self.assertEqual(
            resolve_curriculum_id(
                "pearson-edexcel-international"
            ),
            "edexcel",
        )

    def test_bangla_curriculum_cannot_use_english_lesson(
        self,
    ) -> None:
        documents = retrieve_knowledge(
            subject="Biology",
            topic="Respiration",
            grade="Class 7",
            curriculum="nctb-bangla-version",
            language="bangla",
            query="????? ???",
        )

        self.assertEqual(documents, [])

    def test_cambridge_cannot_use_nctb_lesson(self) -> None:
        documents = retrieve_knowledge(
            subject="Biology",
            topic="Respiration",
            grade="Class 7",
            curriculum="cambridge-international",
            language="english",
            query="Explain respiration.",
        )

        self.assertEqual(documents, [])


if __name__ == "__main__":
    unittest.main()
