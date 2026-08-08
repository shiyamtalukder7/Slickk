"""Tests for the Slickk Student-Brain Mirror."""

import tempfile
import unittest
from pathlib import Path

from slickk_core.brain import (
    DifficultyLevel,
    MasteryResult,
    StudentBrainMirror,
    StudentBrainMirrorError,
    StudentProfile,
)


class StudentBrainMirrorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.storage_path = (
            Path(self.temporary_directory.name)
            / "student_brain.json"
        )

        self.profile = StudentProfile(
            student_id="student-001",
            name="Mahir",
            grade="Class 7",
            curriculum="IGCSE Edexcel",
        )

        self.mirror = StudentBrainMirror(self.storage_path)
        self.mirror.register_student(self.profile)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_registers_student(self) -> None:
        self.assertTrue(
            self.mirror.has_student("student-001")
        )
        self.assertEqual(
            self.mirror.get_profile("student-001").name,
            "Mahir",
        )

    def test_rejects_duplicate_registration(self) -> None:
        with self.assertRaises(StudentBrainMirrorError):
            self.mirror.register_student(self.profile)

    def test_state_is_persisted_and_reloaded(self) -> None:
        self.mirror.process_interaction(
            "student-001",
            "I understand this answer.",
            correctness_score=0.9,
            subject="Mathematics",
            topic="Division",
        )

        reloaded = StudentBrainMirror(self.storage_path)
        state = reloaded.get_state("student-001")

        self.assertEqual(state.current_subject, "Mathematics")
        self.assertEqual(state.current_topic, "Division")
        self.assertGreater(state.mastery_score, 0.0)
        self.assertEqual(
            reloaded.get_interaction_count("student-001"),
            1,
        )

    def test_frustration_signal_changes_state(self) -> None:
        update = self.mirror.process_interaction(
            "student-001",
            "I don't understand. This is too hard and I am stuck.",
            correctness_score=0.1,
        )

        self.assertGreater(
            update.updated_state.frustration,
            update.previous_state.frustration,
        )
        self.assertIn(
            "reduce_step_size",
            update.recommended_strategies,
        )

    def test_correct_answer_increases_mastery(self) -> None:
        update = self.mirror.process_interaction(
            "student-001",
            "My answer is 4.",
            correctness_score=1.0,
        )

        self.assertGreater(
            update.updated_state.mastery_score,
            update.previous_state.mastery_score,
        )
        self.assertGreater(
            update.updated_state.confidence,
            update.previous_state.confidence,
        )

    def test_missing_prerequisite_forces_foundation(self) -> None:
        update = self.mirror.process_interaction(
            "student-001",
            "I am not sure.",
            correctness_score=0.2,
            missing_prerequisites=["Basic multiplication"],
        )

        self.assertEqual(
            update.updated_state.difficulty,
            DifficultyLevel.FOUNDATION,
        )
        self.assertIn(
            "teach_missing_prerequisite",
            update.recommended_strategies,
        )

    def test_misconceptions_are_deduplicated(self) -> None:
        self.mirror.process_interaction(
            "student-001",
            "I think division makes numbers larger.",
            correctness_score=0.2,
            misconceptions=[
                "Division always increases a number",
                "division always increases a number",
            ],
        )

        state = self.mirror.get_state("student-001")

        self.assertEqual(
            state.misconceptions,
            ["Division always increases a number"],
        )

    def test_record_mastery_result_marks_skill(self) -> None:
        result = MasteryResult(
            skill="Basic division",
            score=0.9,
            mastered=True,
            correct_elements=["Used equal groups"],
        )

        update = self.mirror.record_mastery_result(
            "student-001",
            "Division separates a total into equal groups.",
            result,
            subject="Mathematics",
            topic="Division",
        )

        self.assertIn(
            "Basic division",
            update.updated_state.mastered_skills,
        )

    def test_repeated_success_increases_difficulty(self) -> None:
        for _ in range(7):
            self.mirror.process_interaction(
                "student-001",
                "I understand. My answer is correct.",
                correctness_score=1.0,
            )

        state = self.mirror.get_state("student-001")

        self.assertEqual(
            state.difficulty,
            DifficultyLevel.EXPERT,
        )
        self.assertIn(
            "run_adversarial_stress_test",
            self.mirror.recommend_strategies(state),
        )

    def test_returned_state_cannot_mutate_internal_state(self) -> None:
        external_state = self.mirror.get_state("student-001")
        external_state.confidence = 0.0

        internal_state = self.mirror.get_state("student-001")

        self.assertEqual(internal_state.confidence, 0.5)

    def test_rejects_invalid_correctness_score(self) -> None:
        with self.assertRaises(StudentBrainMirrorError):
            self.mirror.process_interaction(
                "student-001",
                "My answer.",
                correctness_score=1.5,
            )


if __name__ == "__main__":
    unittest.main()
