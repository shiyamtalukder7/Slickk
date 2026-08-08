"""Tests for the persistent tutor-session state machine."""

import tempfile
import unittest
from pathlib import Path

from slickk_core.brain import (
    LearningStage,
    SessionStateError,
    SessionStatus,
    StudentProfile,
    StudentState,
    TutorSessionStateMachine,
    UniversalTutorBrain,
)


class TutorSessionStateMachineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()

        root = Path(
            self.temporary_directory.name
        )

        self.memory_path = root / "student_memory.json"
        self.session_path = root / "sessions.json"

        self.brain = UniversalTutorBrain(
            self.memory_path
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

        self.machine = TutorSessionStateMachine(
            self.brain,
            self.session_path,
        )

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_start_lesson_remembers_active_question(self) -> None:
        result = self.machine.start_lesson(
            "student-001",
            "What is 12 divided by 3?",
        )

        self.assertEqual(
            result.session.root_question,
            "What is 12 divided by 3?",
        )
        self.assertEqual(
            result.session.active_question,
            "What is 12 divided by 3?",
        )
        self.assertEqual(
            result.session.stage,
            LearningStage.SOCRATIC_SCAFFOLDING,
        )
        self.assertTrue(result.deliverable)

    def test_submit_answer_requires_only_student_answer(self) -> None:
        self.machine.start_lesson(
            "student-001",
            "What is 12 divided by 3?",
        )

        result = self.machine.submit_answer(
            "student-001",
            "4",
        )

        self.assertTrue(
            result.mastery_result.evaluation.result.mastered
        )
        self.assertEqual(
            result.session.stage,
            LearningStage.STRESS_TESTING,
        )

    def test_wrong_answer_keeps_context(self) -> None:
        self.machine.start_lesson(
            "student-001",
            "What is 12 divided by 3?",
        )

        result = self.machine.submit_answer(
            "student-001",
            "5",
        )

        self.assertEqual(
            result.session.root_question,
            "What is 12 divided by 3?",
        )
        self.assertEqual(
            result.session.status,
            SessionStatus.ACTIVE,
        )
        self.assertFalse(
            result.mastery_result.evaluation.result.mastered
        )

    def test_correct_answer_creates_stress_question(self) -> None:
        self.machine.start_lesson(
            "student-001",
            "What is 12 divided by 3?",
        )

        result = self.machine.submit_answer(
            "student-001",
            "4",
        )

        self.assertEqual(
            result.session.stage,
            LearningStage.STRESS_TESTING,
        )
        self.assertNotEqual(
            result.session.active_question,
            result.session.root_question,
        )
        self.assertIn(
            "Work out",
            result.session.active_question,
        )

    def test_complete_automatic_progression(self) -> None:
        self.machine.start_lesson(
            "student-001",
            "What is 12 divided by 3?",
        )

        stress_turn = self.machine.submit_answer(
            "student-001",
            "4",
        )

        stress_query = self.brain.compiler.compile(
            stress_turn.session.active_question
        )

        stress_result = (
            self.brain.truth_core
            .verify_query_expressions(
                stress_query
            )[0]
        )

        reverse_turn = self.machine.submit_answer(
            "student-001",
            (
                f"{stress_result.exact_value} because division "
                f"separates a total into equal groups."
            ),
        )

        self.assertEqual(
            reverse_turn.session.stage,
            LearningStage.REVERSE_TEACHING,
        )

        complete_turn = self.machine.submit_answer(
            "student-001",
            (
                "The answer is 4 because 12 objects split into "
                "3 equal groups gives 4 objects in each group. "
                "For example, 12 apples shared among 3 students "
                "gives 4 apples each."
            ),
        )

        self.assertEqual(
            complete_turn.session.status,
            SessionStatus.COMPLETED,
        )
        self.assertEqual(
            complete_turn.session.stage,
            LearningStage.COMPLETE,
        )
        self.assertIsNone(
            complete_turn.question_for_student
        )

    def test_session_survives_server_reload(self) -> None:
        started = self.machine.start_lesson(
            "student-001",
            "What is 12 divided by 3?",
        )

        reloaded_brain = UniversalTutorBrain(
            self.memory_path
        )

        reloaded_machine = TutorSessionStateMachine(
            reloaded_brain,
            self.session_path,
        )

        restored = reloaded_machine.get_active_session(
            "student-001"
        )

        self.assertEqual(
            restored.session_id,
            started.session.session_id,
        )
        self.assertEqual(
            restored.active_question,
            "What is 12 divided by 3?",
        )

    def test_new_lesson_cancels_old_active_lesson(self) -> None:
        first = self.machine.start_lesson(
            "student-001",
            "What is 12 divided by 3?",
        )

        second = self.machine.start_lesson(
            "student-001",
            "Explain photosynthesis.",
        )

        old_session = self.machine.get_session(
            first.session.session_id
        )

        self.assertEqual(
            old_session.status,
            SessionStatus.CANCELLED,
        )
        self.assertNotEqual(
            first.session.session_id,
            second.session.session_id,
        )

    def test_answer_without_active_session_is_rejected(self) -> None:
        with self.assertRaises(SessionStateError):
            self.machine.submit_answer(
                "student-001",
                "4",
            )

    def test_pause_and_resume_session(self) -> None:
        started = self.machine.start_lesson(
            "student-001",
            "Explain photosynthesis.",
        )

        paused = self.machine.pause_session(
            "student-001"
        )

        self.assertEqual(
            paused.status,
            SessionStatus.PAUSED,
        )

        resumed = self.machine.resume_session(
            "student-001",
            started.session.session_id,
        )

        self.assertEqual(
            resumed.status,
            SessionStatus.ACTIVE,
        )

    def test_custom_rubric_persists_in_session(self) -> None:
        started = self.machine.start_lesson(
            "student-001",
            "Explain the Treaty of Versailles.",
            expected_concepts=[
                "peace treaty",
                "World War I",
            ],
        )

        restored = self.machine.get_session(
            started.session.session_id
        )

        self.assertEqual(
            restored.expected_concepts,
            [
                "peace treaty",
                "World War I",
            ],
        )


if __name__ == "__main__":
    unittest.main()
