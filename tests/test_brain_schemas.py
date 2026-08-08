"""Tests for the core Universal Tutor brain schemas."""

import unittest

from slickk_core.brain import (
    Claim,
    ClaimType,
    DifficultyLevel,
    LearningStage,
    MasteryResult,
    NormalizedQuery,
    StudentProfile,
    StudentState,
    TutorPlan,
    VerificationStatus,
)


class BrainSchemaTests(unittest.TestCase):
    def test_student_profile_is_created(self) -> None:
        profile = StudentProfile(
            student_id="student-001",
            name="Mahir",
            grade="Class 7",
            curriculum="IGCSE Edexcel",
        )

        self.assertEqual(profile.name, "Mahir")
        self.assertEqual(profile.preferred_language, "English")

    def test_student_state_accepts_valid_scores(self) -> None:
        state = StudentState(
            student_id="student-001",
            difficulty=DifficultyLevel.BEGINNER,
            confidence=0.7,
            focus=0.8,
            mastery_score=0.4,
        )

        self.assertEqual(state.focus, 0.8)

    def test_student_state_rejects_invalid_scores(self) -> None:
        with self.assertRaises(ValueError):
            StudentState(
                student_id="student-001",
                confidence=1.5,
            )

    def test_normalized_query_is_created(self) -> None:
        query = NormalizedQuery(
            original_text="What is 12 divided by 3?",
            normalized_text="calculate 12 / 3",
            subject="Mathematics",
            topic="Division",
            intent="solve_and_teach",
            variables={"dividend": 12, "divisor": 3},
            requires_calculation=True,
        )

        self.assertTrue(query.requires_calculation)
        self.assertEqual(query.variables["dividend"], 12)

    def test_claim_starts_pending(self) -> None:
        claim = Claim(
            text="12 divided by 3 equals 4.",
            claim_type=ClaimType.ARITHMETIC,
            confidence=0.95,
        )

        self.assertEqual(
            claim.verification_status,
            VerificationStatus.PENDING,
        )

    def test_tutor_plan_requires_positive_attempt_limit(self) -> None:
        with self.assertRaises(ValueError):
            TutorPlan(
                learning_objective="Understand division",
                stage=LearningStage.SOCRATIC_SCAFFOLDING,
                explanation_strategy="Use equal groups",
                socratic_question="How many groups can you make?",
                maximum_attempts=0,
            )

    def test_mastery_requires_minimum_score(self) -> None:
        with self.assertRaises(ValueError):
            MasteryResult(
                skill="Basic division",
                score=0.5,
                mastered=True,
            )

    def test_valid_mastery_result(self) -> None:
        result = MasteryResult(
            skill="Basic division",
            score=0.9,
            mastered=True,
            correct_elements=["Explained equal grouping correctly"],
            recommended_next_action="Begin division with remainders",
        )

        self.assertTrue(result.mastered)
        self.assertEqual(result.score, 0.9)


if __name__ == "__main__":
    unittest.main()
