"""Tests for the Slickk Socratic Teaching Planner."""

import unittest

from slickk_core.brain import (
    DifficultyLevel,
    LearningStage,
    SocraticPlannerError,
    SocraticTeachingPlanner,
    StudentProfile,
    StudentState,
    UniversalPrimitiveCompiler,
)


class SocraticTeachingPlannerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.compiler = UniversalPrimitiveCompiler()
        self.planner = SocraticTeachingPlanner()

        self.profile = StudentProfile(
            student_id="student-001",
            name="Mahir",
            grade="Class 7",
            curriculum="IGCSE Edexcel",
            preferred_language="English",
        )

        self.state = StudentState(
            student_id="student-001",
            current_subject="Mathematics",
            current_topic="Division",
            difficulty=DifficultyLevel.BEGINNER,
        )

    def test_plans_basic_division_without_revealing_answer(self) -> None:
        query = self.compiler.compile(
            "What is 12 divided by 3?"
        )

        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )

        self.assertEqual(
            plan.stage,
            LearningStage.SOCRATIC_SCAFFOLDING,
        )
        self.assertIn(
            "Which operation",
            plan.socratic_question,
        )
        self.assertNotIn(
            "equals 4",
            plan.socratic_question,
        )

    def test_preserves_required_verification_tools(self) -> None:
        query = self.compiler.compile(
            "What is 12 divided by 3?"
        )

        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )

        self.assertIn(
            "calculator",
            plan.required_tools,
        )
        self.assertIn(
            "response_auditor",
            plan.required_tools,
        )

    def test_prioritizes_missing_prerequisite(self) -> None:
        query = self.compiler.compile(
            "What is 12 divided by 3?"
        )

        state = StudentState(
            student_id="student-001",
            current_subject="Mathematics",
            current_topic="Division",
            difficulty=DifficultyLevel.FOUNDATION,
            missing_prerequisites=[
                "Basic multiplication"
            ],
        )

        plan = self.planner.plan(
            query,
            self.profile,
            state,
        )

        self.assertIn(
            "Basic multiplication",
            plan.learning_objective,
        )
        self.assertIn(
            "Basic multiplication",
            plan.socratic_question,
        )
        self.assertEqual(
            plan.prerequisite_skills,
            ["Basic multiplication"],
        )

    def test_verification_intent_selects_verification_stage(self) -> None:
        query = self.compiler.compile(
            "Check my answer: 12 divided by 3 equals 4."
        )

        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )

        self.assertEqual(
            plan.stage,
            LearningStage.VERIFICATION,
        )
        self.assertIn(
            "supports your answer",
            plan.socratic_question,
        )

    def test_high_mastery_selects_reverse_teaching(self) -> None:
        query = self.compiler.compile(
            "Explain division."
        )

        state = StudentState(
            student_id="student-001",
            current_subject="Mathematics",
            current_topic="Division",
            difficulty=DifficultyLevel.EXPERT,
            mastery_score=0.9,
            confidence=0.9,
        )

        plan = self.planner.plan(
            query,
            self.profile,
            state,
        )

        self.assertEqual(
            plan.stage,
            LearningStage.REVERSE_TEACHING,
        )
        self.assertIn(
            "Teach Division back",
            plan.socratic_question,
        )

    def test_mastered_practice_selects_stress_testing(self) -> None:
        query = self.compiler.compile(
            "Quiz me on chemical reactions."
        )

        state = StudentState(
            student_id="student-001",
            current_subject="Chemistry",
            current_topic="Chemical Reactions",
            difficulty=DifficultyLevel.ADVANCED,
            mastery_score=0.7,
        )

        plan = self.planner.plan(
            query,
            self.profile,
            state,
        )

        self.assertEqual(
            plan.stage,
            LearningStage.STRESS_TESTING,
        )

    def test_low_focus_adds_short_question_strategy(self) -> None:
        query = self.compiler.compile(
            "Explain photosynthesis."
        )

        state = StudentState(
            student_id="student-001",
            difficulty=DifficultyLevel.BEGINNER,
            focus=0.2,
        )

        plan = self.planner.plan(
            query,
            self.profile,
            state,
        )

        self.assertIn(
            "ask_single_short_question",
            plan.explanation_strategy,
        )
        self.assertEqual(
            plan.maximum_attempts,
            3,
        )

    def test_frustration_reduces_attempt_limit(self) -> None:
        query = self.compiler.compile(
            "Explain photosynthesis."
        )

        state = StudentState(
            student_id="student-001",
            difficulty=DifficultyLevel.BEGINNER,
            frustration=0.6,
        )

        plan = self.planner.plan(
            query,
            self.profile,
            state,
        )

        self.assertEqual(
            plan.maximum_attempts,
            4,
        )
        self.assertIn(
            "reduce_step_size",
            plan.explanation_strategy,
        )

    def test_generates_grouped_expression_stress_tests(self) -> None:
        query = self.compiler.compile(
            "Work out (5 + 3) multiplied by 2."
        )

        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )

        self.assertTrue(
            plan.stress_test_variations
        )
        self.assertNotEqual(
            plan.stress_test_variations[0],
            "(5 + 3) * 2",
        )

    def test_external_evidence_uses_source_literacy_question(self) -> None:
        query = self.compiler.compile(
            "Who discovered penicillin? Give a source."
        )

        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )

        self.assertTrue(
            query.requires_external_evidence
        )
        self.assertIn(
            "reliable source",
            plan.socratic_question,
        )
        self.assertNotIn(
            "General Inquiry means",
            plan.socratic_question,
        )
        self.assertIn(
            "trusted source",
            plan.learning_objective,
        )

    def test_rejects_mismatched_student_identity(self) -> None:
        query = self.compiler.compile(
            "Explain photosynthesis."
        )

        wrong_state = StudentState(
            student_id="different-student"
        )

        with self.assertRaises(SocraticPlannerError):
            self.planner.plan(
                query,
                self.profile,
                wrong_state,
            )


if __name__ == "__main__":
    unittest.main()
