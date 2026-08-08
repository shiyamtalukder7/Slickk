"""Tests for the complete Universal Tutor Brain Orchestrator."""

import tempfile
import unittest
from pathlib import Path

from slickk_core.brain import (
    LearningStage,
    StudentProfile,
    StudentState,
    UniversalTutorBrain,
    UniversalTutorBrainError,
)


class UniversalTutorBrainTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()

        self.storage_path = (
            Path(self.temporary_directory.name)
            / "universal_tutor_memory.json"
        )

        self.brain = UniversalTutorBrain(
            self.storage_path
        )

        self.profile = StudentProfile(
            student_id="student-001",
            name="Mahir",
            grade="Class 7",
            curriculum="IGCSE Edexcel",
            preferred_language="English",
            secondary_languages=["Bangla"],
        )

        self.brain.register_student(
            self.profile,
            StudentState(
                student_id="student-001",
                focus=0.7,
            ),
        )

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_processes_complete_socratic_math_turn(self) -> None:
        result = self.brain.process_turn(
            "student-001",
            "What is 12 divided by 3?",
        )

        self.assertTrue(result.deliverable)
        self.assertTrue(result.response.safe_to_deliver)
        self.assertEqual(
            result.plan.stage,
            LearningStage.SOCRATIC_SCAFFOLDING,
        )
        self.assertEqual(
            result.arithmetic_results[0].exact_value,
            "4",
        )

    def test_socratic_response_hides_internal_answer(self) -> None:
        result = self.brain.process_turn(
            "student-001",
            "What is 12 divided by 3?",
        )

        visible_text = " ".join(
            [
                result.response.message,
                result.response.question_for_student or "",
                " ".join(result.response.hints),
            ]
        )

        self.assertNotRegex(
            visible_text,
            r"(?<!\d)4(?!\d)",
        )

    def test_correct_answer_verification(self) -> None:
        result = self.brain.process_turn(
            "student-001",
            (
                "Check my answer: "
                "12 divided by 3 equals 4."
            ),
        )

        self.assertEqual(
            result.plan.stage,
            LearningStage.VERIFICATION,
        )
        self.assertIn(
            "is correct",
            result.response.message,
        )
        self.assertTrue(result.deliverable)

    def test_incorrect_answer_verification(self) -> None:
        result = self.brain.process_turn(
            "student-001",
            (
                "Check my answer: "
                "12 divided by 3 equals 5."
            ),
        )

        self.assertIn(
            "not correct",
            result.response.message,
        )
        self.assertTrue(result.audit_report.warnings)
        self.assertTrue(result.deliverable)

    def test_grouped_expression_is_verified_but_hidden(self) -> None:
        result = self.brain.process_turn(
            "student-001",
            "Work out (5 + 3) multiplied by 2.",
        )

        self.assertEqual(
            result.arithmetic_results[0].exact_value,
            "16",
        )

        visible_text = " ".join(
            [
                result.response.message,
                result.response.question_for_student or "",
                " ".join(result.response.hints),
            ]
        )

        self.assertNotRegex(
            visible_text,
            r"(?<!\d)16(?!\d)",
        )

    def test_general_biology_turn_requires_no_calculation(self) -> None:
        result = self.brain.process_turn(
            "student-001",
            "Explain photosynthesis.",
        )

        self.assertEqual(result.query.subject, "Biology")
        self.assertEqual(
            result.query.topic,
            "Photosynthesis",
        )
        self.assertEqual(result.arithmetic_results, [])
        self.assertTrue(result.deliverable)

    def test_external_fact_without_source_abstains(self) -> None:
        result = self.brain.process_turn(
            "student-001",
            "Who discovered penicillin? Give a source.",
        )

        self.assertIn(
            "verified source",
            result.response.message,
        )
        self.assertTrue(result.response.safe_to_deliver)
        self.assertTrue(result.audit_report.warnings)

    def test_frustrated_message_changes_pacing(self) -> None:
        result = self.brain.process_turn(
            "student-001",
            (
                "I don't understand photosynthesis. "
                "It is too hard and I am stuck."
            ),
        )

        self.assertGreater(
            result.state_after.frustration,
            result.state_before.frustration,
        )
        self.assertIn(
            "one small step",
            result.response.message,
        )

    def test_student_memory_is_persistent(self) -> None:
        self.brain.process_turn(
            "student-001",
            "Explain photosynthesis.",
        )

        reloaded = UniversalTutorBrain(
            self.storage_path
        )

        self.assertTrue(
            reloaded.has_student("student-001")
        )
        self.assertEqual(
            reloaded.student_mirror.get_interaction_count(
                "student-001"
            ),
            1,
        )

    def test_external_fact_asks_relevant_source_question(self) -> None:
        result = self.brain.process_turn(
            "student-001",
            "Who discovered penicillin? Give a source.",
        )

        self.assertIn(
            "reliable source",
            result.response.question_for_student,
        )
        self.assertNotIn(
            "General Inquiry means",
            result.response.question_for_student,
        )
        self.assertTrue(result.deliverable)

    def test_unknown_student_is_rejected(self) -> None:
        with self.assertRaises(UniversalTutorBrainError):
            self.brain.process_turn(
                "unknown-student",
                "Explain photosynthesis.",
            )

    def test_turn_result_is_json_compatible_structure(self) -> None:
        result = self.brain.process_turn(
            "student-001",
            "What is 12 divided by 3?",
        )

        payload = result.to_dict()

        self.assertEqual(
            payload["query"]["subject"],
            "Mathematics",
        )
        self.assertTrue(
            payload["response"]["safe_to_deliver"]
        )
        self.assertTrue(payload["deliverable"])


if __name__ == "__main__":
    unittest.main()
