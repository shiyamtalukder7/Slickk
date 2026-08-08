"""Verified mastery evaluation for the Slickk Universal AI Tutor.

The evaluator grades student responses using:

- exact deterministic arithmetic;
- explicit curriculum concept rubrics;
- misconception patterns;
- reasoning and example requirements;
- stage-specific mastery thresholds.

It does not ask a language model to assign an unsupported score.
Unknown concepts remain ungraded until a verified rubric is supplied.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Any

from .schemas import (
    LearningStage,
    MasteryResult,
    NormalizedQuery,
)
from .truth_core import (
    ArithmeticResult,
    DeterministicTruthCore,
    TruthCoreError,
)


class MasteryEvaluationError(ValueError):
    """Raised when a student answer cannot be evaluated safely."""


@dataclass(slots=True)
class MasteryEvaluationReport:
    """Detailed evidence supporting one mastery decision."""

    result: MasteryResult
    evaluation_mode: str
    expected_answer: str | None = None
    matched_concepts: list[str] = field(default_factory=list)
    missing_concepts: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)
    reasoning_present: bool = False
    example_present: bool = False

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-compatible evaluation report."""

        return {
            "result": self.result.to_dict(),
            "evaluation_mode": self.evaluation_mode,
            "expected_answer": self.expected_answer,
            "matched_concepts": list(self.matched_concepts),
            "missing_concepts": list(self.missing_concepts),
            "evidence": list(self.evidence),
            "reasoning_present": self.reasoning_present,
            "example_present": self.example_present,
        }


class MasteryEvaluationEngine:
    """Evaluate student answers through deterministic checks and rubrics."""

    TOPIC_RUBRICS: dict[
        str,
        tuple[tuple[str, tuple[str, ...]], ...],
    ] = {
        "Division": (
            (
                "equal grouping or sharing",
                (
                    "equal group",
                    "equal groups",
                    "equally",
                    "shared equally",
                    "split equally",
                ),
            ),
            (
                "total quantity",
                (
                    "total",
                    "whole amount",
                    "quantity",
                    "number being divided",
                ),
            ),
            (
                "number of groups or group size",
                (
                    "number of groups",
                    "group size",
                    "in each group",
                    "each group",
                ),
            ),
        ),
        "Photosynthesis": (
            (
                "light energy",
                (
                    "light energy",
                    "sunlight",
                    "light from the sun",
                ),
            ),
            (
                "carbon dioxide",
                (
                    "carbon dioxide",
                    "co2",
                ),
            ),
            (
                "water",
                (
                    "water",
                    "h2o",
                ),
            ),
            (
                "glucose production",
                (
                    "glucose",
                    "sugar",
                    "food is produced",
                ),
            ),
            (
                "oxygen production",
                (
                    "oxygen",
                    "o2",
                ),
            ),
            (
                "chlorophyll or chloroplast",
                (
                    "chlorophyll",
                    "chloroplast",
                    "chloroplasts",
                ),
            ),
        ),
        "Cell Biology": (
            (
                "cell membrane",
                (
                    "cell membrane",
                    "membrane",
                ),
            ),
            (
                "cytoplasm",
                (
                    "cytoplasm",
                ),
            ),
            (
                "genetic control",
                (
                    "nucleus",
                    "dna",
                    "genetic material",
                ),
            ),
        ),
        "Respiration": (
            (
                "glucose",
                (
                    "glucose",
                    "sugar",
                ),
            ),
            (
                "energy release",
                (
                    "release energy",
                    "releases energy",
                    "energy is released",
                ),
            ),
            (
                "cellular process",
                (
                    "cell",
                    "cells",
                    "cellular",
                ),
            ),
        ),
        "Chemical Reactions": (
            (
                "reactants",
                (
                    "reactant",
                    "reactants",
                    "starting substances",
                ),
            ),
            (
                "products",
                (
                    "product",
                    "products",
                    "new substances",
                ),
            ),
            (
                "rearrangement of particles",
                (
                    "atoms rearrange",
                    "particles rearrange",
                    "bonds break",
                    "bonds form",
                ),
            ),
        ),
        "Motion": (
            (
                "distance or displacement",
                (
                    "distance",
                    "displacement",
                ),
            ),
            (
                "time",
                (
                    "time",
                ),
            ),
            (
                "speed or velocity",
                (
                    "speed",
                    "velocity",
                ),
            ),
        ),
        "Programming Fundamentals": (
            (
                "input",
                (
                    "input",
                    "receives data",
                ),
            ),
            (
                "processing rules",
                (
                    "process",
                    "logic",
                    "instructions",
                    "algorithm",
                ),
            ),
            (
                "output",
                (
                    "output",
                    "returns",
                    "displays",
                ),
            ),
        ),
    }

    SKILL_NAMES: dict[str, str] = {
        "Division": "Division as equal grouping",
        "Photosynthesis": "Photosynthesis",
        "Cell Biology": "Cell structure and function",
        "Respiration": "Cellular respiration",
        "Chemical Reactions": "Chemical reactions",
        "Motion": "Motion quantities",
        "Programming Fundamentals": "Programming fundamentals",
    }

    MISCONCEPTION_PATTERNS: dict[
        str,
        tuple[tuple[str, str], ...],
    ] = {
        "Division": (
            (
                r"\bdivision always (?:makes|makes a number) larger\b",
                "Division does not always make a number larger.",
            ),
            (
                r"\bdivision means multiply\b",
                "Division was confused with multiplication.",
            ),
        ),
        "Photosynthesis": (
            (
                r"\bplants? (?:get|gets) (?:their )?food from "
                r"(?:the )?soil\b",
                (
                    "Plants absorb water and minerals from soil, "
                    "but produce glucose through photosynthesis."
                ),
            ),
            (
                r"\bphotosynthesis happens? only at night\b",
                "Photosynthesis was incorrectly described as a night-only process.",
            ),
            (
                r"\bplants? use oxygen to make glucose\b",
                (
                    "Oxygen was incorrectly identified as an input "
                    "for photosynthesis."
                ),
            ),
        ),
        "Respiration": (
            (
                r"\brespiration means breathing only\b",
                (
                    "Cellular respiration was confused with breathing "
                    "alone."
                ),
            ),
        ),
        "Chemical Reactions": (
            (
                r"\batoms are created\b",
                (
                    "Chemical reactions rearrange atoms rather than "
                    "creating them."
                ),
            ),
        ),
    }

    REASONING_MARKERS = (
        "because",
        "therefore",
        "so that",
        "which means",
        "this means",
        "as a result",
        "since",
        "কারণ",
        "তাই",
    )

    EXAMPLE_MARKERS = (
        "for example",
        "such as",
        "for instance",
        "e.g.",
        "example:",
        "উদাহরণ",
    )

    def __init__(
        self,
        truth_core: DeterministicTruthCore | None = None,
    ) -> None:
        """Initialize the evaluator with a deterministic truth engine."""

        self.truth_core = truth_core or DeterministicTruthCore()

    def evaluate(
        self,
        query: NormalizedQuery,
        student_answer: str,
        *,
        arithmetic_results: list[ArithmeticResult] | None = None,
        stage: LearningStage = LearningStage.SOCRATIC_SCAFFOLDING,
        expected_concepts: list[str] | None = None,
    ) -> MasteryEvaluationReport:
        """Evaluate one student answer.

        Args:
            query:
                Original compiled learning question.
            student_answer:
                Student's attempted answer or teach-back.
            arithmetic_results:
                Deterministically calculated expected results.
            stage:
                Current learning workflow stage.
            expected_concepts:
                Optional trusted rubric supplied by curriculum content.

        Unknown conceptual topics are not guessed. They require an explicit
        verified rubric before mastery can be awarded.
        """

        if not isinstance(student_answer, str):
            raise MasteryEvaluationError(
                "Student answer must be text"
            )

        clean_answer = student_answer.strip()

        if not clean_answer:
            raise MasteryEvaluationError(
                "Student answer cannot be empty"
            )

        results = arithmetic_results or []

        if query.requires_calculation and results:
            return self._evaluate_arithmetic(
                query=query,
                student_answer=clean_answer,
                arithmetic_result=results[0],
                stage=stage,
            )

        return self._evaluate_conceptual(
            query=query,
            student_answer=clean_answer,
            stage=stage,
            expected_concepts=expected_concepts,
        )

    def _evaluate_arithmetic(
        self,
        *,
        query: NormalizedQuery,
        student_answer: str,
        arithmetic_result: ArithmeticResult,
        stage: LearningStage,
    ) -> MasteryEvaluationReport:
        """Compare a student answer with an exact deterministic result."""

        reasoning_present = self._contains_any(
            student_answer,
            self.REASONING_MARKERS,
        )
        example_present = self._contains_any(
            student_answer,
            self.EXAMPLE_MARKERS,
        )

        correct = self._arithmetic_answer_matches(
            student_answer,
            arithmetic_result,
        )

        skill = self.SKILL_NAMES.get(
            query.topic,
            query.topic,
        )

        correct_elements: list[str] = []
        misconceptions: list[str] = []
        missing_prerequisites: list[str] = []

        if correct:
            correct_elements.append(
                "Final value matches the deterministic result"
            )

            if reasoning_present:
                correct_elements.append(
                    "The answer includes a stated reason"
                )
        else:
            misconceptions.append(
                "The final numerical value does not match the verified result"
            )
            missing_prerequisites.append(skill)

        if correct:
            if (
                stage == LearningStage.REVERSE_TEACHING
                and not reasoning_present
            ):
                score = 0.75
                mastered = False
                recommended_action = (
                    "Explain why the calculation works, not only "
                    "the final value."
                )
            else:
                score = 1.0
                mastered = True

                if stage == LearningStage.STRESS_TESTING:
                    recommended_action = (
                        "Proceed to reverse teaching."
                    )
                elif stage == LearningStage.REVERSE_TEACHING:
                    recommended_action = (
                        "Record complete mastery."
                    )
                else:
                    recommended_action = (
                        "Proceed to an unfamiliar stress-test example."
                    )
        else:
            operation_credit = self._operation_credit(
                query,
                student_answer,
            )
            score = operation_credit
            mastered = False
            recommended_action = (
                "Return to a smaller worked example and verify "
                "the first incorrect step."
            )

        result = MasteryResult(
            skill=skill,
            score=score,
            mastered=mastered,
            correct_elements=correct_elements,
            misconceptions=misconceptions,
            missing_prerequisites=missing_prerequisites,
            recommended_next_action=recommended_action,
            requires_new_strategy=(
                not correct and score <= 0.2
            ),
        )

        return MasteryEvaluationReport(
            result=result,
            evaluation_mode="deterministic_arithmetic",
            expected_answer=arithmetic_result.exact_value,
            matched_concepts=correct_elements,
            missing_concepts=(
                [] if correct else ["verified final value"]
            ),
            evidence=[
                (
                    f"Expected exact result: "
                    f"{arithmetic_result.exact_value}"
                ),
                (
                    f"Student answer evaluated as "
                    f"{'correct' if correct else 'incorrect'}."
                ),
            ],
            reasoning_present=reasoning_present,
            example_present=example_present,
        )

    def _evaluate_conceptual(
        self,
        *,
        query: NormalizedQuery,
        student_answer: str,
        stage: LearningStage,
        expected_concepts: list[str] | None,
    ) -> MasteryEvaluationReport:
        """Evaluate a concept explanation against a trusted rubric."""

        rubric = self._resolve_rubric(
            query.topic,
            expected_concepts,
        )

        skill = self.SKILL_NAMES.get(
            query.topic,
            query.topic,
        )

        if not rubric:
            result = MasteryResult(
                skill=skill,
                score=0.0,
                mastered=False,
                correct_elements=[],
                misconceptions=[],
                missing_prerequisites=[],
                recommended_next_action=(
                    "Load a verified curriculum rubric before "
                    "grading conceptual mastery."
                ),
                requires_new_strategy=False,
            )

            return MasteryEvaluationReport(
                result=result,
                evaluation_mode="insufficient_verified_rubric",
                expected_answer=None,
                evidence=[
                    (
                        "No verified rubric is available for "
                        f"{query.topic}."
                    )
                ],
            )

        normalized_answer = self._normalize(
            student_answer
        )

        matched: list[str] = []
        missing: list[str] = []

        for label, alternatives in rubric:
            if any(
                self._phrase_present(
                    normalized_answer,
                    alternative,
                )
                for alternative in alternatives
            ):
                matched.append(label)
            else:
                missing.append(label)

        coverage = len(matched) / len(rubric)

        reasoning_present = self._contains_any(
            student_answer,
            self.REASONING_MARKERS,
        )
        example_present = self._contains_any(
            student_answer,
            self.EXAMPLE_MARKERS,
        )

        misconceptions = self._detect_misconceptions(
            query.topic,
            normalized_answer,
        )

        if stage == LearningStage.REVERSE_TEACHING:
            score = (
                coverage * 0.70
                + (0.15 if reasoning_present else 0.0)
                + (0.15 if example_present else 0.0)
            )
        else:
            score = (
                coverage * 0.85
                + (0.15 if reasoning_present else 0.0)
            )

        if misconceptions:
            score = min(score, 0.69)

        score = round(
            max(0.0, min(1.0, score)),
            4,
        )

        mastered = (
            score >= 0.80
            and coverage >= 0.75
            and not misconceptions
        )

        if mastered:
            if stage == LearningStage.STRESS_TESTING:
                recommended_action = (
                    "Proceed to reverse teaching."
                )
            elif stage == LearningStage.REVERSE_TEACHING:
                recommended_action = (
                    "Record complete mastery."
                )
            else:
                recommended_action = (
                    "Proceed to adversarial stress testing."
                )
        elif misconceptions:
            recommended_action = (
                "Correct the detected misconception before "
                "continuing."
            )
        elif missing:
            recommended_action = (
                "Re-teach the missing concepts using one example "
                "at a time."
            )
        else:
            recommended_action = (
                "Ask the student to explain the reasoning more clearly."
            )

        result = MasteryResult(
            skill=skill,
            score=score,
            mastered=mastered,
            correct_elements=matched,
            misconceptions=misconceptions,
            missing_prerequisites=[],
            recommended_next_action=recommended_action,
            requires_new_strategy=(
                bool(misconceptions)
                or score < 0.50
            ),
        )

        return MasteryEvaluationReport(
            result=result,
            evaluation_mode="verified_concept_rubric",
            expected_answer=None,
            matched_concepts=matched,
            missing_concepts=missing,
            evidence=[
                (
                    f"Matched {len(matched)} of "
                    f"{len(rubric)} required concept groups."
                ),
                f"Concept coverage: {coverage:.2%}.",
            ],
            reasoning_present=reasoning_present,
            example_present=example_present,
        )

    def misconceptions_resolved_by_mastery(
        self,
        query: NormalizedQuery,
    ) -> list[str]:
        """Return misconceptions directly disproved by verified mastery.

        Only known misconceptions associated with the current topic are
        returned. This prevents a correct answer in one topic from erasing
        unrelated learner difficulties.
        """

        resolved: list[str] = []

        if query.requires_calculation:
            resolved.append(
                "The final numerical value does not match the verified result"
            )

        for _, explanation in self.MISCONCEPTION_PATTERNS.get(
            query.topic,
            (),
        ):
            resolved.append(explanation)

        return list(dict.fromkeys(resolved))

    def _arithmetic_answer_matches(
        self,
        student_answer: str,
        expected: ArithmeticResult,
    ) -> bool:
        """Check complete equations or extracted exact numerical values."""

        normalized = student_answer.strip()

        try:
            evaluated = self.truth_core.evaluate(
                normalized
            )

            if evaluated.result_type == "boolean":
                return evaluated.verified

            if expected.result_type == "number":
                return (
                    Fraction(evaluated.exact_value)
                    == Fraction(expected.exact_value)
                )

        except (
            TruthCoreError,
            ValueError,
            ZeroDivisionError,
        ):
            pass

        if expected.result_type == "boolean":
            lowered = normalized.casefold()

            if expected.verified:
                return lowered in {
                    "true",
                    "correct",
                    "yes",
                }

            return lowered in {
                "false",
                "incorrect",
                "no",
            }

        number_tokens = re.findall(
            r"(?<![\w.])"
            r"-?\d+(?:\.\d+)?"
            r"(?:/\d+(?:\.\d+)?)?"
            r"(?![\w.])",
            normalized,
        )

        if not number_tokens:
            return False

        candidate = number_tokens[-1]

        try:
            return (
                Fraction(candidate)
                == Fraction(expected.exact_value)
            )
        except (
            ValueError,
            ZeroDivisionError,
        ):
            return False

    def _resolve_rubric(
        self,
        topic: str,
        expected_concepts: list[str] | None,
    ) -> tuple[tuple[str, tuple[str, ...]], ...]:
        """Resolve a built-in or externally supplied trusted rubric."""

        if expected_concepts:
            cleaned = [
                concept.strip()
                for concept in expected_concepts
                if isinstance(concept, str)
                and concept.strip()
            ]

            return tuple(
                (
                    concept,
                    (concept,),
                )
                for concept in cleaned
            )

        return self.TOPIC_RUBRICS.get(
            topic,
            (),
        )

    def _detect_misconceptions(
        self,
        topic: str,
        normalized_answer: str,
    ) -> list[str]:
        """Detect explicit known misconception patterns."""

        detected: list[str] = []

        for pattern, explanation in (
            self.MISCONCEPTION_PATTERNS.get(
                topic,
                (),
            )
        ):
            if re.search(
                pattern,
                normalized_answer,
            ):
                detected.append(explanation)

        return detected

    def _operation_credit(
        self,
        query: NormalizedQuery,
        student_answer: str,
    ) -> float:
        """Award limited credit for identifying the correct operation."""

        operations = query.variables.get(
            "operations",
            [],
        )

        if not isinstance(operations, list):
            return 0.0

        normalized = self._normalize(
            student_answer
        )

        operation_terms = {
            "addition": ("add", "addition", "plus"),
            "subtraction": (
                "subtract",
                "subtraction",
                "minus",
            ),
            "multiplication": (
                "multiply",
                "multiplication",
                "times",
            ),
            "division": (
                "divide",
                "division",
                "equal groups",
            ),
            "equality": (
                "equal",
                "equals",
            ),
        }

        for operation in operations:
            terms = operation_terms.get(
                operation,
                (),
            )

            if any(
                term in normalized
                for term in terms
            ):
                return 0.2

        return 0.0

    @staticmethod
    def _contains_any(
        text: str,
        phrases: tuple[str, ...],
    ) -> bool:
        """Return whether any instructional marker is present."""

        normalized = MasteryEvaluationEngine._normalize(
            text
        )

        return any(
            phrase.casefold() in normalized
            for phrase in phrases
        )

    @staticmethod
    def _phrase_present(
        normalized_text: str,
        phrase: str,
    ) -> bool:
        """Match a complete phrase while supporting Unicode text."""

        normalized_phrase = (
            MasteryEvaluationEngine._normalize(
                phrase
            )
        )

        if not normalized_phrase:
            return False

        return normalized_phrase in normalized_text

    @staticmethod
    def _normalize(text: str) -> str:
        """Normalize student text for transparent rubric matching."""

        normalized = text.casefold()
        normalized = re.sub(
            r"\s+",
            " ",
            normalized,
        )
        return normalized.strip()
