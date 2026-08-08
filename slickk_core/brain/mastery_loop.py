"""Mastery-loop integration with persistent learner memory."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .mastery import (
    MasteryEvaluationEngine,
    MasteryEvaluationReport,
)
from .orchestrator import UniversalTutorBrain
from .schemas import (
    LearningStage,
    NormalizedQuery,
    StudentState,
)
from .truth_core import (
    ArithmeticResult,
    TruthCoreError,
)


@dataclass(slots=True)
class MasteryLoopResult:
    """Result of evaluating and recording one student answer."""

    student_id: str
    original_question: str
    student_answer: str
    query: NormalizedQuery
    evaluation: MasteryEvaluationReport
    state_before: StudentState
    state_after: StudentState
    next_stage: LearningStage
    recommended_strategies: list[str]

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-compatible mastery-loop result."""

        return {
            "student_id": self.student_id,
            "original_question": self.original_question,
            "student_answer": self.student_answer,
            "query": {
                "subject": self.query.subject,
                "topic": self.query.topic,
                "intent": self.query.intent,
            },
            "evaluation": self.evaluation.to_dict(),
            "state_before": {
                "mastery_score": self.state_before.mastery_score,
                "difficulty": self.state_before.difficulty.value,
                "misconceptions": list(
                    self.state_before.misconceptions
                ),
                "missing_prerequisites": list(
                    self.state_before.missing_prerequisites
                ),
            },
            "state_after": {
                "mastery_score": self.state_after.mastery_score,
                "difficulty": self.state_after.difficulty.value,
                "misconceptions": list(
                    self.state_after.misconceptions
                ),
                "missing_prerequisites": list(
                    self.state_after.missing_prerequisites
                ),
                "mastered_skills": list(
                    self.state_after.mastered_skills
                ),
            },
            "next_stage": self.next_stage.value,
            "recommended_strategies": list(
                self.recommended_strategies
            ),
        }


class MasteryLoopController:
    """Evaluate student work and feed the result back into memory."""

    def __init__(
        self,
        brain: UniversalTutorBrain,
    ) -> None:
        """Connect mastery evaluation to one UniversalTutorBrain."""

        self.brain = brain
        self.evaluator = MasteryEvaluationEngine(
            brain.truth_core
        )

    def assess(
        self,
        student_id: str,
        original_question: str,
        student_answer: str,
        *,
        stage: LearningStage = (
            LearningStage.SOCRATIC_SCAFFOLDING
        ),
        expected_concepts: list[str] | None = None,
    ) -> MasteryLoopResult:
        """Evaluate, record, and select the next learning stage."""

        profile = self.brain.student_mirror.get_profile(
            student_id
        )
        state_before = self.brain.student_mirror.get_state(
            student_id
        )

        query = self.brain.compiler.compile(
            original_question,
            default_language=profile.preferred_language,
        )

        arithmetic_results = self._calculate_results(
            query
        )

        evaluation = self.evaluator.evaluate(
            query=query,
            student_answer=student_answer,
            arithmetic_results=arithmetic_results,
            stage=stage,
            expected_concepts=expected_concepts,
        )

        update = self.brain.student_mirror.record_mastery_result(
            student_id=student_id,
            message=student_answer,
            result=evaluation.result,
            subject=query.subject,
            topic=query.topic,
        )

        state_after = update.updated_state
        recommended_strategies = update.recommended_strategies

        # Verified mastery disproves known misconceptions associated
        # with this exact topic. Unrelated misconceptions remain stored.
        if evaluation.result.mastered:
            for misconception in (
                self.evaluator.misconceptions_resolved_by_mastery(
                    query
                )
            ):
                self.brain.student_mirror.resolve_misconception(
                    student_id,
                    misconception,
                )

            state_after = self.brain.student_mirror.get_state(
                student_id
            )

            recommended_strategies = (
                self.brain.student_mirror.recommend_strategies(
                    state_after
                )
            )

        next_stage = self._select_next_stage(
            stage=stage,
            evaluation=evaluation,
        )

        return MasteryLoopResult(
            student_id=student_id,
            original_question=original_question,
            student_answer=student_answer,
            query=query,
            evaluation=evaluation,
            state_before=state_before,
            state_after=state_after,
            next_stage=next_stage,
            recommended_strategies=recommended_strategies,
        )

    def _calculate_results(
        self,
        query: NormalizedQuery,
    ) -> list[ArithmeticResult]:
        """Calculate compiler expressions independently."""

        expressions = query.variables.get(
            "expressions",
            [],
        )

        if not isinstance(expressions, list):
            return []

        results: list[ArithmeticResult] = []

        for expression in expressions:
            if not isinstance(expression, str):
                continue

            try:
                results.append(
                    self.brain.truth_core.evaluate(
                        expression
                    )
                )
            except TruthCoreError:
                continue

        return results

    @staticmethod
    def _select_next_stage(
        *,
        stage: LearningStage,
        evaluation: MasteryEvaluationReport,
    ) -> LearningStage:
        """Advance only after verified mastery."""

        if not evaluation.result.mastered:
            return LearningStage.SOCRATIC_SCAFFOLDING

        if stage == LearningStage.STRESS_TESTING:
            return LearningStage.REVERSE_TEACHING

        if stage == LearningStage.REVERSE_TEACHING:
            return LearningStage.COMPLETE

        return LearningStage.STRESS_TESTING
