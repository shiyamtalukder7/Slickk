"""Tests for response composition and the final verification gate."""

import unittest

from slickk_core.brain import (
    Claim,
    ClaimType,
    DeterministicTruthCore,
    LearningStage,
    ResponseVerificationGate,
    SocraticTeachingPlanner,
    StudentProfile,
    StudentState,
    TutorResponse,
    TutorResponseComposer,
    UniversalPrimitiveCompiler,
    VerificationStatus,
)


class ResponseVerificationGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.compiler = UniversalPrimitiveCompiler()
        self.truth_core = DeterministicTruthCore()
        self.planner = SocraticTeachingPlanner()
        self.composer = TutorResponseComposer()
        self.gate = ResponseVerificationGate()

        self.profile = StudentProfile(
            student_id="student-001",
            name="Mahir",
            grade="Class 7",
            curriculum="IGCSE Edexcel",
        )

        self.state = StudentState(
            student_id="student-001",
            current_subject="Mathematics",
            current_topic="Division",
            focus=0.7,
        )

    def test_socratic_response_is_safe_and_hides_answer(self) -> None:
        query = self.compiler.compile(
            "What is 12 divided by 3?"
        )
        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )
        results = self.truth_core.verify_query_expressions(query)

        candidate = self.composer.compose(
            query,
            plan,
            self.state,
            arithmetic_results=results,
        )
        audited, report = self.gate.audit(
            candidate,
            query,
            plan,
            arithmetic_results=results,
        )

        combined = (
            audited.message
            + " "
            + (audited.question_for_student or "")
        )

        self.assertTrue(audited.safe_to_deliver)
        self.assertTrue(report.safe_to_deliver)
        self.assertFalse(report.answer_leak_detected)
        self.assertNotRegex(combined, r"(?<!\d)4(?!\d)")

    def test_direct_answer_leak_is_blocked(self) -> None:
        query = self.compiler.compile(
            "What is 12 divided by 3?"
        )
        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )
        results = self.truth_core.verify_query_expressions(query)

        leaked = TutorResponse(
            message="The answer is 4.",
            stage=plan.stage,
            question_for_student=plan.socratic_question,
        )

        audited, report = self.gate.audit(
            leaked,
            query,
            plan,
            arithmetic_results=results,
        )

        self.assertFalse(audited.safe_to_deliver)
        self.assertTrue(report.answer_leak_detected)

    def test_verified_student_answer_can_receive_feedback(self) -> None:
        query = self.compiler.compile(
            "Check my answer: 12 divided by 3 equals 4."
        )
        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )
        results = self.truth_core.verify_query_expressions(query)

        claim = self.truth_core.verify_claim(
            Claim(
                text="12 divided by 3 equals 4",
                claim_type=ClaimType.ARITHMETIC,
            )
        )

        candidate = self.composer.compose(
            query,
            plan,
            self.state,
            arithmetic_results=results,
            verified_claims=[claim],
        )
        audited, report = self.gate.audit(
            candidate,
            query,
            plan,
            arithmetic_results=results,
        )

        self.assertEqual(
            plan.stage,
            LearningStage.VERIFICATION,
        )
        self.assertIn(
            "is correct",
            audited.message,
        )
        self.assertTrue(report.safe_to_deliver)

    def test_incorrect_student_claim_can_be_reported(self) -> None:
        query = self.compiler.compile(
            "Check my answer: 12 divided by 3 equals 5."
        )
        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )
        results = self.truth_core.verify_query_expressions(query)

        claim = self.truth_core.verify_claim(
            Claim(
                text="12 divided by 3 equals 5",
                claim_type=ClaimType.ARITHMETIC,
            )
        )

        candidate = self.composer.compose(
            query,
            plan,
            self.state,
            arithmetic_results=results,
            verified_claims=[claim],
        )
        audited, report = self.gate.audit(
            candidate,
            query,
            plan,
            arithmetic_results=results,
        )

        self.assertIn(
            "not correct",
            audited.message,
        )
        self.assertTrue(audited.safe_to_deliver)
        self.assertTrue(report.warnings)

    def test_pending_claim_is_blocked(self) -> None:
        query = self.compiler.compile(
            "Explain photosynthesis."
        )
        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )

        pending = Claim(
            text="Plants create glucose during photosynthesis.",
            claim_type=ClaimType.FACTUAL,
        )

        candidate = self.composer.compose(
            query,
            plan,
            self.state,
            verified_claims=[pending],
        )
        audited, report = self.gate.audit(
            candidate,
            query,
            plan,
        )

        self.assertFalse(audited.safe_to_deliver)
        self.assertTrue(report.violations)

    def test_contradicted_claim_outside_verification_is_blocked(self) -> None:
        query = self.compiler.compile(
            "Explain division."
        )
        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )

        contradicted = Claim(
            text="12 divided by 3 equals 5",
            claim_type=ClaimType.ARITHMETIC,
            verification_status=VerificationStatus.CONTRADICTED,
        )

        candidate = self.composer.compose(
            query,
            plan,
            self.state,
            verified_claims=[contradicted],
        )
        audited, _ = self.gate.audit(
            candidate,
            query,
            plan,
        )

        self.assertFalse(audited.safe_to_deliver)

    def test_evidence_request_without_sources_abstains_safely(self) -> None:
        query = self.compiler.compile(
            "Who discovered penicillin? Give a source."
        )
        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )

        candidate = self.composer.compose(
            query,
            plan,
            self.state,
        )
        audited, report = self.gate.audit(
            candidate,
            query,
            plan,
        )

        self.assertTrue(audited.safe_to_deliver)
        self.assertTrue(report.warnings)
        self.assertIn(
            "verified source",
            audited.message,
        )

    def test_unsupported_external_fact_is_blocked(self) -> None:
        query = self.compiler.compile(
            "Who discovered penicillin? Give a source."
        )
        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )

        unsupported = TutorResponse(
            message="Alexander Fleming discovered penicillin.",
            stage=plan.stage,
            question_for_student=plan.socratic_question,
            sources=[],
        )

        audited, report = self.gate.audit(
            unsupported,
            query,
            plan,
        )

        self.assertFalse(audited.safe_to_deliver)
        self.assertTrue(report.violations)

    def test_external_response_with_source_can_pass(self) -> None:
        query = self.compiler.compile(
            "Who discovered penicillin? Give a source."
        )
        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )

        sourced = TutorResponse(
            message=(
                "A verified source is available for the factual claim."
            ),
            stage=plan.stage,
            question_for_student=plan.socratic_question,
            sources=["trusted-source-001"],
        )

        audited, _ = self.gate.audit(
            sourced,
            query,
            plan,
        )

        self.assertTrue(audited.safe_to_deliver)

    def test_stage_mismatch_is_blocked(self) -> None:
        query = self.compiler.compile(
            "Explain photosynthesis."
        )
        plan = self.planner.plan(
            query,
            self.profile,
            self.state,
        )

        mismatched = TutorResponse(
            message="Let us work carefully.",
            stage=LearningStage.COMPLETE,
            question_for_student=plan.socratic_question,
        )

        audited, _ = self.gate.audit(
            mismatched,
            query,
            plan,
        )

        self.assertFalse(audited.safe_to_deliver)

    def test_frustration_changes_response_pacing(self) -> None:
        query = self.compiler.compile(
            "Explain photosynthesis."
        )

        frustrated_state = StudentState(
            student_id="student-001",
            frustration=0.7,
            focus=0.5,
        )

        plan = self.planner.plan(
            query,
            self.profile,
            frustrated_state,
        )

        candidate = self.composer.compose(
            query,
            plan,
            frustrated_state,
        )

        self.assertIn(
            "one small step",
            candidate.message,
        )


if __name__ == "__main__":
    unittest.main()
