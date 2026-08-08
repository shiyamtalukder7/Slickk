"""Tests for deterministic mastery evaluation and progression."""

import tempfile
import unittest
from pathlib import Path

from slickk_core.brain import (
    LearningStage,
    MasteryLoopController,
    StudentProfile,
    StudentState,
    UniversalTutorBrain,
)


class MasteryEvaluationEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()

        memory_path = (
            Path(self.temporary_directory.name)
            / "mastery_memory.json"
        )

        self.brain = UniversalTutorBrain(
            memory_path
        )

        self.brain.register_student(
            StudentProfile(
                student_id="student-001",
                name="Mahir",
                grade="Class 7",
                curriculum="IGCSE Edexcel",
            ),
            StudentState(
                student_id="student-001",
                focus=0.7,
            ),
        )

        self.loop = MasteryLoopController(
            self.brain
        )

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_correct_arithmetic_answer_is_mastered(self) -> None:
        result = self.loop.assess(
            "student-001",
            "What is 12 divided by 3?",
            "4",
        )

        self.assertTrue(
            result.evaluation.result.mastered
        )
        self.assertEqual(
            result.evaluation.result.score,
            1.0,
        )
        self.assertEqual(
            result.next_stage,
            LearningStage.STRESS_TESTING,
        )

    def test_incorrect_arithmetic_answer_records_gap(self) -> None:
        result = self.loop.assess(
            "student-001",
            "What is 12 divided by 3?",
            "5",
        )

        self.assertFalse(
            result.evaluation.result.mastered
        )
        self.assertIn(
            "Division as equal grouping",
            result.state_after.missing_prerequisites,
        )
        self.assertEqual(
            result.next_stage,
            LearningStage.SOCRATIC_SCAFFOLDING,
        )

    def test_equivalent_fraction_and_decimal_are_equal(self) -> None:
        result = self.loop.assess(
            "student-001",
            "What is 1 divided by 2?",
            "0.5",
        )

        self.assertTrue(
            result.evaluation.result.mastered
        )
        self.assertEqual(
            result.evaluation.expected_answer,
            "1/2",
        )

    def test_reverse_teaching_requires_reasoning(self) -> None:
        result = self.loop.assess(
            "student-001",
            "What is 12 divided by 3?",
            "4",
            stage=LearningStage.REVERSE_TEACHING,
        )

        self.assertFalse(
            result.evaluation.result.mastered
        )
        self.assertEqual(
            result.evaluation.result.score,
            0.75,
        )

    def test_reverse_teaching_with_reasoning_can_complete(self) -> None:
        result = self.loop.assess(
            "student-001",
            "What is 12 divided by 3?",
            (
                "The answer is 4 because 12 split into 3 "
                "equal groups gives 4 in each group."
            ),
            stage=LearningStage.REVERSE_TEACHING,
        )

        self.assertTrue(
            result.evaluation.result.mastered
        )
        self.assertEqual(
            result.next_stage,
            LearningStage.COMPLETE,
        )

    def test_complete_photosynthesis_explanation_is_mastered(self) -> None:
        result = self.loop.assess(
            "student-001",
            "Explain photosynthesis.",
            (
                "Plants use sunlight captured by chlorophyll. "
                "They combine carbon dioxide and water to make "
                "glucose and release oxygen because light "
                "provides the required energy."
            ),
        )

        self.assertTrue(
            result.evaluation.result.mastered
        )
        self.assertGreaterEqual(
            result.evaluation.result.score,
            0.8,
        )

    def test_misconception_blocks_conceptual_mastery(self) -> None:
        result = self.loop.assess(
            "student-001",
            "Explain photosynthesis.",
            (
                "Plants get their food from the soil. They also "
                "use sunlight, carbon dioxide and water, producing "
                "glucose and oxygen with chlorophyll."
            ),
        )

        self.assertFalse(
            result.evaluation.result.mastered
        )
        self.assertTrue(
            result.evaluation.result.misconceptions
        )
        self.assertLess(
            result.evaluation.result.score,
            0.8,
        )

    def test_verified_concept_mastery_clears_old_misconception(self) -> None:
        first = self.loop.assess(
            "student-001",
            "Explain photosynthesis.",
            (
                "Plants get their food from the soil. They use "
                "sunlight, carbon dioxide and water, producing "
                "glucose and oxygen with chlorophyll."
            ),
        )

        old_misconception = (
            "Plants absorb water and minerals from soil, "
            "but produce glucose through photosynthesis."
        )

        self.assertIn(
            old_misconception,
            first.state_after.misconceptions,
        )

        second = self.loop.assess(
            "student-001",
            "Explain photosynthesis.",
            (
                "Plants use sunlight captured by chlorophyll. "
                "They combine carbon dioxide and water to produce "
                "glucose and release oxygen because light provides "
                "the required energy."
            ),
        )

        self.assertTrue(
            second.evaluation.result.mastered
        )
        self.assertNotIn(
            old_misconception,
            second.state_after.misconceptions,
        )

    def test_unknown_topic_requires_verified_rubric(self) -> None:
        result = self.loop.assess(
            "student-001",
            "Explain the Treaty of Versailles.",
            "It was an agreement after a war.",
        )

        self.assertEqual(
            result.evaluation.evaluation_mode,
            "insufficient_verified_rubric",
        )
        self.assertFalse(
            result.evaluation.result.mastered
        )

    def test_custom_verified_rubric_can_grade_new_topic(self) -> None:
        result = self.loop.assess(
            "student-001",
            "Explain the Treaty of Versailles.",
            (
                "The Treaty of Versailles was a peace treaty "
                "signed after World War I."
            ),
            expected_concepts=[
                "peace treaty",
                "World War I",
            ],
        )

        self.assertTrue(
            result.evaluation.result.mastered
        )

    def test_stress_test_mastery_advances_to_reverse_teaching(self) -> None:
        result = self.loop.assess(
            "student-001",
            "What is 12 divided by 3?",
            "4 because division separates a total into equal groups.",
            stage=LearningStage.STRESS_TESTING,
        )

        self.assertTrue(
            result.evaluation.result.mastered
        )
        self.assertEqual(
            result.next_stage,
            LearningStage.REVERSE_TEACHING,
        )

    def test_correct_answer_repairs_matching_prerequisite(self) -> None:
        first = self.loop.assess(
            "student-001",
            "What is 12 divided by 3?",
            "5",
        )

        self.assertIn(
            "Division as equal grouping",
            first.state_after.missing_prerequisites,
        )

        second = self.loop.assess(
            "student-001",
            "What is 12 divided by 3?",
            "4",
        )

        self.assertNotIn(
            "Division as equal grouping",
            second.state_after.missing_prerequisites,
        )
        self.assertIn(
            "Division as equal grouping",
            second.state_after.mastered_skills,
        )
        self.assertNotIn(
            "The final numerical value does not match the verified result",
            second.state_after.misconceptions,
        )


if __name__ == "__main__":
    unittest.main()
