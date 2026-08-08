"""Deterministic Socratic lesson planning for the Slickk AI Tutor.

The planner decides how a concept should be taught before a language model
is allowed to generate the student-facing response.

It does not calculate mathematical answers. Those remain the responsibility
of the Deterministic Truth Core.

It does not diagnose medical, neurological, or psychological conditions.
Student-state values are instructional control signals only.
"""

from __future__ import annotations

import re

from .schemas import (
    Claim,
    ClaimType,
    DifficultyLevel,
    LearningStage,
    NormalizedQuery,
    StudentProfile,
    StudentState,
    TutorPlan,
)


class SocraticPlannerError(ValueError):
    """Raised when a safe teaching plan cannot be constructed."""


class SocraticTeachingPlanner:
    """Create adaptive, answer-safe Socratic teaching plans."""

    DEFAULT_MAXIMUM_ATTEMPTS = 5

    def plan(
        self,
        query: NormalizedQuery,
        profile: StudentProfile,
        state: StudentState,
        *,
        recommended_strategies: list[str] | None = None,
    ) -> TutorPlan:
        """Create a complete internal teaching plan.

        Args:
            query:
                Structured student request produced by the Primitive Compiler.
            profile:
                Stable student information.
            state:
                Current Student-Brain Mirror state.
            recommended_strategies:
                Optional strategies already selected by the mirror.

        Returns:
            A validated TutorPlan.
        """

        if profile.student_id != state.student_id:
            raise SocraticPlannerError(
                "Student profile and state IDs must match"
            )

        strategies = self._normalize_strategies(
            recommended_strategies
        )

        stage = self._select_stage(query, state)
        objective = self._build_learning_objective(
            query=query,
            profile=profile,
            state=state,
        )
        explanation_strategy = self._build_explanation_strategy(
            query=query,
            profile=profile,
            state=state,
            strategies=strategies,
        )
        socratic_question = self._build_socratic_question(
            query=query,
            state=state,
            stage=stage,
        )
        prerequisite_skills = list(
            dict.fromkeys(state.missing_prerequisites)
        )
        expected_claims = self._build_expected_claims(query)
        stress_tests = self._build_stress_tests(query)
        maximum_attempts = self._select_maximum_attempts(state)

        return TutorPlan(
            learning_objective=objective,
            stage=stage,
            explanation_strategy=explanation_strategy,
            socratic_question=socratic_question,
            required_tools=list(
                dict.fromkeys(query.required_tools)
            ),
            prerequisite_skills=prerequisite_skills,
            expected_claims=expected_claims,
            stress_test_variations=stress_tests,
            maximum_attempts=maximum_attempts,
        )

    def _select_stage(
        self,
        query: NormalizedQuery,
        state: StudentState,
    ) -> LearningStage:
        """Select the next stage of the five-stage workflow."""

        if query.intent == "verify_student_answer":
            return LearningStage.VERIFICATION

        if state.missing_prerequisites:
            return LearningStage.SOCRATIC_SCAFFOLDING

        same_topic = (
            bool(state.current_topic)
            and state.current_topic.casefold()
            == query.topic.casefold()
        )

        if (
            state.mastery_score >= 0.85
            and same_topic
            and query.intent != "summarize"
        ):
            return LearningStage.REVERSE_TEACHING

        if (
            query.intent == "practice_and_assess"
            and state.mastery_score >= 0.65
        ):
            return LearningStage.STRESS_TESTING

        return LearningStage.SOCRATIC_SCAFFOLDING

    def _build_learning_objective(
        self,
        *,
        query: NormalizedQuery,
        profile: StudentProfile,
        state: StudentState,
    ) -> str:
        """Create a precise and student-specific lesson objective."""

        # External factual claims must be grounded in evidence
        # before the tutor presents them as certain.
        if query.requires_external_evidence:
            return (
                "Verify the external factual claim in the student's "
                "question using a trusted source before presenting it "
                "as certain."
            )

        if state.missing_prerequisites:
            prerequisite = state.missing_prerequisites[0]

            return (
                f"Rebuild the prerequisite skill '{prerequisite}' "
                f"before continuing {query.topic} in {query.subject}."
            )

        if query.intent == "verify_student_answer":
            return (
                f"Verify the student's reasoning about {query.topic} "
                f"and identify the first unsupported step."
            )

        if query.intent == "practice_and_assess":
            return (
                f"Assess and strengthen the student's independent "
                f"mastery of {query.topic} in {query.subject}."
            )

        return (
            f"Help {profile.name} understand and explain "
            f"{query.topic} in {query.subject} at the "
            f"{state.difficulty.value} level."
        )

    def _build_explanation_strategy(
        self,
        *,
        query: NormalizedQuery,
        profile: StudentProfile,
        state: StudentState,
        strategies: list[str],
    ) -> str:
        """Construct the ordered instructional strategy."""

        ordered_controls: list[str] = []

        if state.missing_prerequisites:
            ordered_controls.extend(
                [
                    "teach_missing_prerequisite",
                    "use_foundation_example",
                ]
            )

        if state.frustration >= 0.40:
            ordered_controls.extend(
                [
                    "reduce_step_size",
                    "give_one_hint_at_a_time",
                ]
            )

        if state.frustration >= 0.65:
            ordered_controls.append(
                "use_patient_reframing"
            )

        if state.working_memory_load >= 0.70:
            ordered_controls.extend(
                [
                    "use_short_explanation",
                    "present_one_rule_at_a_time",
                ]
            )

        if state.focus <= 0.35:
            ordered_controls.extend(
                [
                    "ask_single_short_question",
                    "use_active_recall",
                ]
            )

        if state.difficulty == DifficultyLevel.FOUNDATION:
            ordered_controls.extend(
                [
                    "use_concrete_example",
                    "avoid_unnecessary_jargon",
                ]
            )

        elif state.difficulty == DifficultyLevel.BEGINNER:
            ordered_controls.extend(
                [
                    "model_one_example",
                    "ask_guided_question",
                ]
            )

        elif state.difficulty == DifficultyLevel.INTERMEDIATE:
            ordered_controls.extend(
                [
                    "ask_student_to_choose_next_step",
                    "require_reason_for_step",
                ]
            )

        elif state.difficulty == DifficultyLevel.ADVANCED:
            ordered_controls.extend(
                [
                    "withhold_solution",
                    "request_multi_step_reasoning",
                ]
            )

        elif state.difficulty == DifficultyLevel.EXPERT:
            ordered_controls.extend(
                [
                    "request_independent_solution",
                    "test_edge_cases",
                    "request_teach_back",
                ]
            )

        ordered_controls.extend(strategies)

        if query.requires_visual_explanation:
            ordered_controls.append(
                "include_visual_scaffold"
            )

        ordered_controls.append(
            f"respond_in_{self._slug(profile.preferred_language)}"
        )

        unique_controls = list(
            dict.fromkeys(ordered_controls)
        )

        return " -> ".join(unique_controls)

    def _build_socratic_question(
        self,
        *,
        query: NormalizedQuery,
        state: StudentState,
        stage: LearningStage,
    ) -> str:
        """Create one question appropriate to the student's state."""

        if state.missing_prerequisites:
            prerequisite = state.missing_prerequisites[0]

            return (
                f"Before we continue with {query.topic}, what do you "
                f"already know about {prerequisite}?"
            )

        if stage == LearningStage.VERIFICATION:
            return (
                "What rule, calculation, or evidence supports your "
                "answer?"
            )

        if stage == LearningStage.REVERSE_TEACHING:
            return (
                f"Teach {query.topic} back to me in your own words, "
                f"including the rule and one example."
            )

        if stage == LearningStage.STRESS_TESTING:
            return (
                f"Solve one unfamiliar example of {query.topic} and "
                f"explain why your method still works."
            )

        # When trusted retrieval is required but evidence has not
        # yet been supplied, teach source evaluation instead of asking
        # an unrelated generic subject question.
        if query.requires_external_evidence:
            return (
                "What evidence from a reliable source would verify "
                "the factual claim in your question?"
            )

        if query.subject == "Mathematics":
            return self._build_mathematics_question(
                query,
                state,
            )

        if query.subject == "Biology":
            return self._build_biology_question(query)

        if query.subject == "Physics":
            return self._build_physics_question(query)

        if query.subject == "Chemistry":
            return self._build_chemistry_question(query)

        if query.subject == "Computer Science":
            return self._build_computer_science_question(
                query
            )

        if query.intent == "compare_concepts":
            return (
                f"What is one important similarity and one important "
                f"difference between the concepts in your question?"
            )

        return (
            f"In your own words, what do you currently think "
            f"{query.topic} means?"
        )

    def _build_mathematics_question(
        self,
        query: NormalizedQuery,
        state: StudentState,
    ) -> str:
        """Create a mathematical question without revealing the answer."""

        expressions = query.variables.get(
            "expressions",
            [],
        )

        expression = (
            expressions[0]
            if isinstance(expressions, list) and expressions
            else None
        )

        unknown_symbols = query.variables.get(
            "unknown_symbols",
            [],
        )

        if (
            expression
            and unknown_symbols
            and any(
                operator in expression
                for operator in ("=", "==")
            )
        ):
            unknown = unknown_symbols[0]

            return (
                f"What operation would help isolate {unknown} first "
                f"in {expression}?"
            )

        if expression:
            if state.difficulty in {
                DifficultyLevel.FOUNDATION,
                DifficultyLevel.BEGINNER,
            }:
                return (
                    f"Which operation should you perform first in "
                    f"{expression}?"
                )

            if state.difficulty == DifficultyLevel.INTERMEDIATE:
                return (
                    f"What should you calculate first in "
                    f"{expression}, and why?"
                )

            return (
                f"Solve {expression} independently, then explain "
                f"which mathematical rule justified each step."
            )

        if query.topic == "Division":
            return (
                "How can equal groups help you represent this "
                "division problem?"
            )

        if query.topic == "Fractions":
            return (
                "What do the numerator and denominator each represent?"
            )

        if query.topic == "Percentages":
            return (
                "What quantity represents the whole, or 100 percent?"
            )

        return (
            f"What mathematical rule do you think applies to "
            f"{query.topic}?"
        )

    @staticmethod
    def _build_biology_question(
        query: NormalizedQuery,
    ) -> str:
        """Create a biology-specific Socratic question."""

        if query.topic == "Photosynthesis":
            return (
                "What materials and energy source must a plant have "
                "before it can produce glucose?"
            )

        if query.topic == "Cell Biology":
            return (
                "Which cell structure is most relevant to the process "
                "in this question, and what does it do?"
            )

        if query.topic == "Respiration":
            return (
                "Why do cells need to release energy from glucose?"
            )

        return (
            f"What biological process is central to {query.topic}?"
        )

    @staticmethod
    def _build_physics_question(
        query: NormalizedQuery,
    ) -> str:
        """Create a physics-specific Socratic question."""

        if query.topic == "Motion":
            return (
                "Which quantities are changing: distance, time, speed, "
                "or velocity?"
            )

        if query.topic == "Forces":
            return (
                "What forces are acting, and in which directions?"
            )

        if query.topic == "Electricity":
            return (
                "Which electrical quantities are known, and which one "
                "must be found?"
            )

        return (
            f"Which physical quantities control {query.topic}?"
        )

    @staticmethod
    def _build_chemistry_question(
        query: NormalizedQuery,
    ) -> str:
        """Create a chemistry-specific Socratic question."""

        if query.topic == "Chemical Reactions":
            return (
                "Which substances are the reactants, and what evidence "
                "would show that a new product formed?"
            )

        if query.topic == "Atomic Structure":
            return (
                "Which subatomic particles determine the property in "
                "this question?"
            )

        if query.topic == "Acids and Bases":
            return (
                "What evidence would help you decide whether the "
                "substance is acidic or alkaline?"
            )

        return (
            f"What particles or changes are involved in {query.topic}?"
        )

    @staticmethod
    def _build_computer_science_question(
        query: NormalizedQuery,
    ) -> str:
        """Create a computer-science-specific Socratic question."""

        if query.topic == "Programming Fundamentals":
            return (
                "What input should the program receive, and what output "
                "should it produce?"
            )

        if query.topic == "Algorithms":
            return (
                "What exact sequence of steps would solve the problem "
                "for every valid input?"
            )

        return (
            f"What inputs, rules, and outputs define {query.topic}?"
        )

    def _build_expected_claims(
        self,
        query: NormalizedQuery,
    ) -> list[Claim]:
        """Create claims that must be checked before delivery."""

        expressions = query.variables.get(
            "expressions",
            [],
        )

        if not isinstance(expressions, list):
            return []

        claims: list[Claim] = []

        for expression in expressions:
            if not isinstance(expression, str):
                continue

            is_proposition = any(
                operator in expression
                for operator in (
                    "==",
                    "!=",
                    "<=",
                    ">=",
                    "=",
                    "<",
                    ">",
                )
            )

            if is_proposition:
                claims.append(
                    Claim(
                        text=expression,
                        claim_type=ClaimType.ARITHMETIC,
                    )
                )

        return claims

    def _build_stress_tests(
        self,
        query: NormalizedQuery,
    ) -> list[str]:
        """Create safe variations that test conceptual transfer."""

        expressions = query.variables.get(
            "expressions",
            [],
        )

        if (
            query.subject == "Mathematics"
            and isinstance(expressions, list)
            and expressions
        ):
            expression = expressions[0]

            if isinstance(expression, str):
                variations = [
                    self._mutate_numbers(expression, 1),
                    self._mutate_numbers(expression, 2),
                ]

                return [
                    variation
                    for variation in dict.fromkeys(variations)
                    if variation != expression
                ]

        return [
            (
                f"Explain {query.topic} using a different example "
                f"from the original question."
            ),
            (
                f"Compare {query.topic} with one closely related "
                f"concept."
            ),
            (
                f"Identify one common mistake a student might make "
                f"when using {query.topic}."
            ),
        ]

    def _select_maximum_attempts(
        self,
        state: StudentState,
    ) -> int:
        """Limit retries and prevent an unproductive infinite loop."""

        if (
            state.frustration >= 0.75
            or state.working_memory_load >= 0.75
            or state.focus <= 0.25
        ):
            return 3

        if state.frustration >= 0.40:
            return 4

        return self.DEFAULT_MAXIMUM_ATTEMPTS

    @staticmethod
    def _mutate_numbers(
        expression: str,
        delta: int,
    ) -> str:
        """Create a structurally similar arithmetic expression."""

        def replace(match: re.Match[str]) -> str:
            token = match.group(0)

            try:
                if "." in token:
                    value = float(token) + delta
                    return str(round(value, 6))

                return str(int(token) + delta)

            except ValueError:
                return token

        return re.sub(
            r"(?<![\w.])-?\d+(?:\.\d+)?",
            replace,
            expression,
        )

    @staticmethod
    def _normalize_strategies(
        strategies: list[str] | None,
    ) -> list[str]:
        """Clean and deduplicate externally recommended strategies."""

        if strategies is None:
            return []

        cleaned: list[str] = []

        for strategy in strategies:
            if not isinstance(strategy, str):
                continue

            normalized = strategy.strip()

            if normalized and normalized not in cleaned:
                cleaned.append(normalized)

        return cleaned

    @staticmethod
    def _slug(value: str) -> str:
        """Convert a language name into a machine-readable identifier."""

        slug = re.sub(
            r"[^a-z0-9]+",
            "_",
            value.lower(),
        ).strip("_")

        return slug or "english"
