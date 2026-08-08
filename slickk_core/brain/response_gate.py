"""Student-facing response composition and final verification gate.

The response composer converts an internal TutorPlan into a TutorResponse.
The verification gate then checks that the response is safe to deliver.

The language generator is never trusted to decide whether its own output is
correct. Delivery approval belongs to this independent gate.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field

from .schemas import (
    Claim,
    LearningStage,
    NormalizedQuery,
    StudentState,
    TutorPlan,
    TutorResponse,
    VerificationStatus,
)
from .truth_core import ArithmeticResult


class ResponseGateError(ValueError):
    """Raised when response composition inputs are structurally invalid."""


@dataclass(slots=True)
class ResponseAuditReport:
    """Detailed result produced by the response verification gate."""

    safe_to_deliver: bool
    violations: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    answer_leak_detected: bool = False
    audited_claim_count: int = 0

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-compatible audit report."""

        return {
            "safe_to_deliver": self.safe_to_deliver,
            "violations": list(self.violations),
            "warnings": list(self.warnings),
            "answer_leak_detected": self.answer_leak_detected,
            "audited_claim_count": self.audited_claim_count,
        }


class TutorResponseComposer:
    """Create an adaptive response without deciding factual truth."""

    HINT_MAP: dict[str, str] = {
        "teach_missing_prerequisite": (
            "Start by recalling the prerequisite idea."
        ),
        "use_foundation_example": (
            "Use a small concrete example before returning to the problem."
        ),
        "reduce_step_size": (
            "Focus only on the first step."
        ),
        "give_one_hint_at_a_time": (
            "Use one hint before attempting the next step."
        ),
        "use_patient_reframing": (
            "A difficult first attempt does not mean you cannot learn it."
        ),
        "use_short_explanation": (
            "Keep the explanation to one rule at a time."
        ),
        "present_one_rule_at_a_time": (
            "Identify one rule before combining several rules."
        ),
        "ask_single_short_question": (
            "Answer only the current question."
        ),
        "use_active_recall": (
            "Try to recall the rule before checking notes."
        ),
        "use_concrete_example": (
            "Represent the idea with real objects or equal groups."
        ),
        "model_one_example": (
            "Think about a similar small example first."
        ),
        "test_edge_cases": (
            "Consider whether the rule still works in an unusual case."
        ),
    }

    def compose(
        self,
        query: NormalizedQuery,
        plan: TutorPlan,
        state: StudentState,
        *,
        arithmetic_results: list[ArithmeticResult] | None = None,
        verified_claims: list[Claim] | None = None,
        sources: list[str] | None = None,
    ) -> TutorResponse:
        """Compose a candidate response for independent auditing."""

        results = arithmetic_results or []
        claims = copy.deepcopy(verified_claims or [])
        response_sources = list(dict.fromkeys(sources or []))

        if query.requires_external_evidence and not response_sources:
            return TutorResponse(
                message=(
                    "I need a verified source before presenting an "
                    "external factual claim as certain."
                ),
                stage=plan.stage,
                claims=[],
                question_for_student=plan.socratic_question,
                hints=[],
                sources=[],
                uncertainty_notes=[
                    "External evidence is required but is not yet available."
                ],
                safe_to_deliver=False,
            )

        opening = self._build_opening(state, plan)

        if plan.stage == LearningStage.VERIFICATION:
            message = self._compose_verification_message(
                opening=opening,
                arithmetic_results=results,
            )
        elif plan.stage == LearningStage.REVERSE_TEACHING:
            message = (
                f"{opening} I will listen for the definition, the rule, "
                f"and a correct example."
            )
        elif plan.stage == LearningStage.STRESS_TESTING:
            message = (
                f"{opening} This next task checks whether the method "
                f"works beyond the original example."
            )
        else:
            message = (
                f"{opening} Do not calculate everything at once; identify "
                f"the next justified step."
            )

        hints = self._select_hints(plan)

        return TutorResponse(
            message=message,
            stage=plan.stage,
            claims=claims,
            question_for_student=plan.socratic_question,
            hints=hints,
            sources=response_sources,
            uncertainty_notes=[],
            safe_to_deliver=False,
        )

    def _build_opening(
        self,
        state: StudentState,
        plan: TutorPlan,
    ) -> str:
        """Select pacing language from the learner state."""

        if plan.prerequisite_skills:
            return "Let us strengthen the foundation before moving ahead."

        if state.frustration >= 0.65:
            return (
                "You are not expected to solve everything at once. "
                "We will work through one small step."
            )

        if state.frustration >= 0.40:
            return (
                "Let us simplify this and focus on one small step."
            )

        if state.focus <= 0.35:
            return "We will keep this short and answer one question."

        if state.mastery_score >= 0.80:
            return "You are ready to demonstrate the method independently."

        return "Let us work through this carefully."

    def _compose_verification_message(
        self,
        *,
        opening: str,
        arithmetic_results: list[ArithmeticResult],
    ) -> str:
        """Give correctness feedback when verification was requested."""

        if not arithmetic_results:
            return (
                f"{opening} I cannot confirm the answer until the "
                f"relevant claim has been checked."
            )

        result = arithmetic_results[0]

        if result.result_type == "boolean":
            if result.verified:
                return (
                    f"{opening} Your mathematical statement is correct."
                )

            return (
                f"{opening} Your mathematical statement is not correct."
            )

        return (
            f"{opening} The calculation has been checked, but you should "
            f"still explain the rule supporting each step."
        )

    def _select_hints(
        self,
        plan: TutorPlan,
    ) -> list[str]:
        """Convert internal controls into limited student-safe hints."""

        controls = [
            item.strip()
            for item in plan.explanation_strategy.split("->")
            if item.strip()
        ]

        hints: list[str] = []

        for control in controls:
            hint = self.HINT_MAP.get(control)

            if hint and hint not in hints:
                hints.append(hint)

            if len(hints) == 2:
                break

        return hints


class ResponseVerificationGate:
    """Audit candidate responses before application delivery."""

    REQUIRED_QUESTION_STAGES = {
        LearningStage.SOCRATIC_SCAFFOLDING,
        LearningStage.STRESS_TESTING,
        LearningStage.REVERSE_TEACHING,
        LearningStage.VERIFICATION,
    }

    ABSTENTION_MARKERS = (
        "need a verified source",
        "cannot verify",
        "cannot confirm",
        "not yet available",
    )

    def audit(
        self,
        response: TutorResponse,
        query: NormalizedQuery,
        plan: TutorPlan,
        *,
        arithmetic_results: list[ArithmeticResult] | None = None,
    ) -> tuple[TutorResponse, ResponseAuditReport]:
        """Audit and return an isolated finalized response."""

        audited = copy.deepcopy(response)
        results = arithmetic_results or []

        violations: list[str] = []
        warnings: list[str] = []

        if audited.stage != plan.stage:
            violations.append(
                "Response stage does not match the approved teaching plan."
            )

        if (
            plan.stage in self.REQUIRED_QUESTION_STAGES
            and not audited.question_for_student
        ):
            violations.append(
                "The approved teaching stage requires a student question."
            )

        if (
            audited.question_for_student
            and audited.question_for_student.strip()
            != plan.socratic_question.strip()
        ):
            violations.append(
                "Student question differs from the approved Socratic plan."
            )

        self._audit_claims(
            claims=audited.claims,
            stage=plan.stage,
            violations=violations,
            warnings=warnings,
        )

        # Scan only generated explanatory content and hints.
        # The student question is checked separately against the exact
        # planner-approved Socratic question.
        combined_text = " ".join(
            part
            for part in (
                audited.message,
                " ".join(audited.hints),
            )
            if part
        )

        answer_leak_detected = self._detect_answer_leak(
            text=combined_text,
            stage=plan.stage,
            arithmetic_results=results,
        )

        if answer_leak_detected:
            violations.append(
                "A verified final answer leaked during Socratic scaffolding."
            )

        if query.requires_external_evidence and not audited.sources:
            if not self._is_abstention(audited.message):
                violations.append(
                    "External factual content lacks verified sources."
                )
            else:
                warnings.append(
                    "The response safely abstains because evidence is absent."
                )

        audited.safe_to_deliver = not violations

        for violation in violations:
            if violation not in audited.uncertainty_notes:
                audited.uncertainty_notes.append(violation)

        report = ResponseAuditReport(
            safe_to_deliver=audited.safe_to_deliver,
            violations=violations,
            warnings=warnings,
            answer_leak_detected=answer_leak_detected,
            audited_claim_count=len(audited.claims),
        )

        return audited, report

    def _audit_claims(
        self,
        *,
        claims: list[Claim],
        stage: LearningStage,
        violations: list[str],
        warnings: list[str],
    ) -> None:
        """Reject claims without acceptable verification states."""

        for claim in claims:
            status = claim.verification_status

            if status in {
                VerificationStatus.PENDING,
                VerificationStatus.UNVERIFIED,
            }:
                violations.append(
                    f"Claim is not verified: {claim.text}"
                )

            elif status == VerificationStatus.PARTIALLY_VERIFIED:
                violations.append(
                    f"Claim is only partially verified: {claim.text}"
                )

            elif status == VerificationStatus.CONTRADICTED:
                if stage == LearningStage.VERIFICATION:
                    warnings.append(
                        f"Contradicted student claim was reported as "
                        f"incorrect: {claim.text}"
                    )
                else:
                    violations.append(
                        f"Contradicted claim cannot be delivered: {claim.text}"
                    )

    def _detect_answer_leak(
        self,
        *,
        text: str,
        stage: LearningStage,
        arithmetic_results: list[ArithmeticResult],
    ) -> bool:
        """Detect final numerical answers exposed during scaffolding.

        Complete numeric tokens are extracted first. Sentence punctuation
        therefore does not hide a leaked answer, while a value such as 4.5
        is not incorrectly split into the separate token 4.
        """

        if stage != LearningStage.SOCRATIC_SCAFFOLDING:
            return False

        numeric_tokens = set(
            re.findall(
                r"(?<!\w)"
                r"-?\d+(?:\.\d+)?"
                r"(?:/\d+(?:\.\d+)?)?"
                r"(?!\w)",
                text,
            )
        )

        for result in arithmetic_results:
            if result.result_type != "number":
                continue

            candidates = {result.exact_value}

            if result.decimal_value is not None:
                decimal_value = float(result.decimal_value)

                candidates.add(str(decimal_value))

                if decimal_value.is_integer():
                    candidates.add(str(int(decimal_value)))

            if numeric_tokens.intersection(candidates):
                return True

        return False

    def _is_abstention(self, message: str) -> bool:
        """Recognize a safe refusal to make an unsupported claim."""

        lowered = message.casefold()

        return any(
            marker in lowered
            for marker in self.ABSTENTION_MARKERS
        )
