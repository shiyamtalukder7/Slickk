"""Central orchestration engine for the Slickk Universal AI Tutor.

This module connects:

1. Universal Primitive Compiler
2. Student-Brain Mirror
3. Deterministic Truth Core
4. Socratic Teaching Planner
5. Response Composer
6. Final Verification Gate

No candidate response is returned for delivery unless it passes the
independent verification gate.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .compiler import UniversalPrimitiveCompiler
from .planner import SocraticTeachingPlanner
from .response_gate import (
    ResponseAuditReport,
    ResponseVerificationGate,
    TutorResponseComposer,
)
from .schemas import (
    Claim,
    LearningStage,
    NormalizedQuery,
    StudentProfile,
    StudentState,
    TutorPlan,
    TutorResponse,
    VerificationStatus,
)
from .student_mirror import (
    StudentBrainMirror,
    StudentBrainMirrorError,
)
from .truth_core import (
    ArithmeticResult,
    DeterministicTruthCore,
    TruthCoreError,
)


class UniversalTutorBrainError(RuntimeError):
    """Raised when a tutor turn cannot be completed safely."""


@dataclass(slots=True)
class BrainTurnResult:
    """Complete internal and student-facing result of one tutor turn."""

    student_id: str
    turn_number: int
    query: NormalizedQuery
    state_before: StudentState
    state_after: StudentState
    plan: TutorPlan
    arithmetic_results: list[ArithmeticResult]
    verified_claims: list[Claim]
    response: TutorResponse
    audit_report: ResponseAuditReport
    deliverable: bool
    diagnostic_errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Return a compact JSON-compatible turn representation."""

        return {
            "student_id": self.student_id,
            "turn_number": self.turn_number,
            "query": {
                "subject": self.query.subject,
                "topic": self.query.topic,
                "intent": self.query.intent,
                "normalized_text": self.query.normalized_text,
                "required_tools": list(self.query.required_tools),
            },
            "student_state": {
                "difficulty": self.state_after.difficulty.value,
                "confidence": self.state_after.confidence,
                "frustration": self.state_after.frustration,
                "focus": self.state_after.focus,
                "mastery_score": self.state_after.mastery_score,
                "working_memory_load": (
                    self.state_after.working_memory_load
                ),
            },
            "plan": {
                "stage": self.plan.stage.value,
                "learning_objective": self.plan.learning_objective,
                "socratic_question": self.plan.socratic_question,
                "required_tools": list(self.plan.required_tools),
                "maximum_attempts": self.plan.maximum_attempts,
            },
            "arithmetic_results": [
                result.to_dict()
                for result in self.arithmetic_results
            ],
            "verified_claims": [
                {
                    "text": claim.text,
                    "status": claim.verification_status.value,
                    "confidence": claim.confidence,
                    "evidence": list(claim.evidence),
                }
                for claim in self.verified_claims
            ],
            "response": {
                "message": self.response.message,
                "question_for_student": (
                    self.response.question_for_student
                ),
                "hints": list(self.response.hints),
                "sources": list(self.response.sources),
                "safe_to_deliver": self.response.safe_to_deliver,
            },
            "audit": self.audit_report.to_dict(),
            "deliverable": self.deliverable,
            "diagnostic_errors": list(self.diagnostic_errors),
        }


class UniversalTutorBrain:
    """Run complete verified student interactions."""

    def __init__(
        self,
        storage_path: str | Path | None = None,
    ) -> None:
        """Initialize all tutor-brain components.

        Args:
            storage_path:
                Optional JSON path for persistent learner memory.
        """

        self.compiler = UniversalPrimitiveCompiler()
        self.student_mirror = StudentBrainMirror(storage_path)
        self.truth_core = DeterministicTruthCore()
        self.planner = SocraticTeachingPlanner()
        self.response_composer = TutorResponseComposer()
        self.response_gate = ResponseVerificationGate()

    def register_student(
        self,
        profile: StudentProfile,
        initial_state: StudentState | None = None,
        *,
        replace: bool = False,
    ) -> StudentState:
        """Register a learner with persistent tutor memory."""

        return self.student_mirror.register_student(
            profile,
            initial_state,
            replace=replace,
        )

    def has_student(self, student_id: str) -> bool:
        """Return whether the learner is registered."""

        return self.student_mirror.has_student(student_id)

    def process_turn(
        self,
        student_id: str,
        message: str,
        *,
        sources: list[str] | None = None,
    ) -> BrainTurnResult:
        """Process one complete student-to-tutor interaction.

        The sequence is fixed:

        1. Read the learner profile and previous state.
        2. Compile the message.
        3. Update observable instructional signals.
        4. Create the teaching plan.
        5. Execute supported deterministic calculations.
        6. Verify expected arithmetic propositions.
        7. Compose a candidate response.
        8. Audit it through the independent delivery gate.
        9. Replace unsafe output with a safe fallback.
        """

        try:
            profile = self.student_mirror.get_profile(
                student_id
            )
            state_before = self.student_mirror.get_state(
                student_id
            )
        except StudentBrainMirrorError as exc:
            raise UniversalTutorBrainError(str(exc)) from exc

        query = self.compiler.compile(
            message,
            default_language=profile.preferred_language,
        )

        mirror_update = self.student_mirror.process_interaction(
            student_id=student_id,
            message=message,
            subject=query.subject,
            topic=query.topic,
        )

        state_after = mirror_update.updated_state

        plan = self.planner.plan(
            query=query,
            profile=profile,
            state=state_after,
            recommended_strategies=(
                mirror_update.recommended_strategies
            ),
        )

        diagnostic_errors: list[str] = []

        arithmetic_results = self._execute_arithmetic(
            query=query,
            diagnostic_errors=diagnostic_errors,
        )

        verified_claims = self._verify_expected_claims(
            plan=plan,
            diagnostic_errors=diagnostic_errors,
        )

        response_claims = self._select_response_claims(
            plan=plan,
            verified_claims=verified_claims,
        )

        candidate = self.response_composer.compose(
            query=query,
            plan=plan,
            state=state_after,
            arithmetic_results=arithmetic_results,
            verified_claims=response_claims,
            sources=sources,
        )

        audited_response, audit_report = (
            self.response_gate.audit(
                response=candidate,
                query=query,
                plan=plan,
                arithmetic_results=arithmetic_results,
            )
        )

        if not audited_response.safe_to_deliver:
            audited_response, audit_report = (
                self._create_and_audit_fallback(
                    query=query,
                    plan=plan,
                    arithmetic_results=arithmetic_results,
                    diagnostic_errors=diagnostic_errors,
                    original_report=audit_report,
                )
            )

        if not audited_response.safe_to_deliver:
            raise UniversalTutorBrainError(
                "No response passed the final verification gate"
            )

        return BrainTurnResult(
            student_id=student_id,
            turn_number=mirror_update.interaction_count,
            query=query,
            state_before=copy.deepcopy(state_before),
            state_after=copy.deepcopy(state_after),
            plan=plan,
            arithmetic_results=arithmetic_results,
            verified_claims=verified_claims,
            response=audited_response,
            audit_report=audit_report,
            deliverable=True,
            diagnostic_errors=diagnostic_errors,
        )

    def _execute_arithmetic(
        self,
        *,
        query: NormalizedQuery,
        diagnostic_errors: list[str],
    ) -> list[ArithmeticResult]:
        """Execute every supported expression independently."""

        expressions = query.variables.get(
            "expressions",
            [],
        )

        if not isinstance(expressions, list):
            diagnostic_errors.append(
                "Compiler expressions were not stored as a list."
            )
            return []

        results: list[ArithmeticResult] = []

        for expression in expressions:
            if not isinstance(expression, str):
                diagnostic_errors.append(
                    "Ignored a non-text mathematical expression."
                )
                continue

            try:
                results.append(
                    self.truth_core.evaluate(expression)
                )
            except TruthCoreError as exc:
                diagnostic_errors.append(
                    f"Arithmetic verification unavailable for "
                    f"'{expression}': {exc}"
                )

        return results

    def _verify_expected_claims(
        self,
        *,
        plan: TutorPlan,
        diagnostic_errors: list[str],
    ) -> list[Claim]:
        """Verify every mathematical proposition identified by the plan."""

        verified_claims: list[Claim] = []

        for expected_claim in plan.expected_claims:
            try:
                verified_claims.append(
                    self.truth_core.verify_claim(
                        expected_claim
                    )
                )
            except TruthCoreError as exc:
                failed_claim = copy.deepcopy(expected_claim)
                failed_claim.verification_status = (
                    VerificationStatus.UNVERIFIED
                )
                failed_claim.confidence = 0.0
                failed_claim.explanation = str(exc)

                verified_claims.append(failed_claim)

                diagnostic_errors.append(
                    f"Claim verification failed for "
                    f"'{expected_claim.text}': {exc}"
                )

        return verified_claims

    @staticmethod
    def _select_response_claims(
        *,
        plan: TutorPlan,
        verified_claims: list[Claim],
    ) -> list[Claim]:
        """Select claims the student-facing response may reference.

        During ordinary scaffolding, internal calculations remain hidden.

        During verification, only deterministically verified or contradicted
        student claims are included. Unverified claims are never presented.
        """

        if plan.stage != LearningStage.VERIFICATION:
            return []

        permitted_statuses = {
            VerificationStatus.VERIFIED,
            VerificationStatus.CONTRADICTED,
        }

        return [
            copy.deepcopy(claim)
            for claim in verified_claims
            if claim.verification_status in permitted_statuses
        ]

    def _create_and_audit_fallback(
        self,
        *,
        query: NormalizedQuery,
        plan: TutorPlan,
        arithmetic_results: list[ArithmeticResult],
        diagnostic_errors: list[str],
        original_report: ResponseAuditReport,
    ) -> tuple[TutorResponse, ResponseAuditReport]:
        """Replace blocked output with a minimal safe response."""

        diagnostic_errors.extend(
            f"Blocked candidate: {violation}"
            for violation in original_report.violations
        )

        if query.requires_external_evidence:
            message = (
                "I need a verified source before presenting that "
                "factual answer as certain."
            )
        else:
            message = (
                "I could not verify enough information to present a "
                "reliable answer. Let us continue with the approved "
                "next step."
            )

        fallback = TutorResponse(
            message=message,
            stage=plan.stage,
            claims=[],
            question_for_student=plan.socratic_question,
            hints=[],
            sources=[],
            uncertainty_notes=[
                "The original candidate response was blocked by "
                "the verification gate."
            ],
            safe_to_deliver=False,
        )

        return self.response_gate.audit(
            response=fallback,
            query=query,
            plan=plan,
            arithmetic_results=arithmetic_results,
        )
