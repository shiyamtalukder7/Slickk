"""Structured data models for the Slickk Universal AI Tutor.

These models form the shared language between:

1. The Universal Primitive Compiler
2. The Student-Brain Mirror
3. The Teaching and Reasoning Core
4. The Deterministic Verification Core
5. The Mastery and Reverse-Teaching Engine

The first implementation intentionally uses only Python's standard library.
This keeps the tutor brain portable and avoids unnecessary dependencies.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class DifficultyLevel(str, Enum):
    """Instructional difficulty selected for the student."""

    FOUNDATION = "foundation"
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    EXPERT = "expert"


class LearningStage(str, Enum):
    """Current stage in the five-stage learning workflow."""

    INGESTION = "ingestion"
    VERIFICATION = "verification"
    SOCRATIC_SCAFFOLDING = "socratic_scaffolding"
    STRESS_TESTING = "stress_testing"
    REVERSE_TEACHING = "reverse_teaching"
    COMPLETE = "complete"


class VerificationStatus(str, Enum):
    """Result of checking a claim through deterministic tools or evidence."""

    PENDING = "pending"
    VERIFIED = "verified"
    PARTIALLY_VERIFIED = "partially_verified"
    UNVERIFIED = "unverified"
    CONTRADICTED = "contradicted"


class ClaimType(str, Enum):
    """Type of assertion produced or evaluated by the tutor."""

    ARITHMETIC = "arithmetic"
    ALGEBRAIC = "algebraic"
    LOGICAL = "logical"
    FACTUAL = "factual"
    INTERPRETIVE = "interpretive"
    PROCEDURAL = "procedural"


@dataclass(slots=True)
class StudentProfile:
    """Long-term information about a learner.

    This contains relatively stable information such as grade, curriculum,
    preferred language, and accessibility preferences.
    """

    student_id: str
    name: str
    grade: str
    curriculum: str
    preferred_language: str = "English"
    secondary_languages: list[str] = field(default_factory=list)
    learning_preferences: list[str] = field(default_factory=list)
    accessibility_needs: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.student_id = self.student_id.strip()
        self.name = self.name.strip()
        self.grade = self.grade.strip()
        self.curriculum = self.curriculum.strip()
        self.preferred_language = self.preferred_language.strip()

        if not self.student_id:
            raise ValueError("student_id cannot be empty")

        if not self.name:
            raise ValueError("name cannot be empty")

        if not self.grade:
            raise ValueError("grade cannot be empty")

        if not self.curriculum:
            raise ValueError("curriculum cannot be empty")


@dataclass(slots=True)
class StudentState:
    """Real-time cognitive and instructional state of the student.

    The values are estimates, not medical or psychological diagnoses.
    They help the tutor control pacing, explanation size, and difficulty.
    """

    student_id: str
    current_subject: str = ""
    current_topic: str = ""
    difficulty: DifficultyLevel = DifficultyLevel.BEGINNER
    working_memory_load: float = 0.0
    confidence: float = 0.5
    frustration: float = 0.0
    focus: float = 0.5
    mastery_score: float = 0.0
    misconceptions: list[str] = field(default_factory=list)
    mastered_skills: list[str] = field(default_factory=list)
    missing_prerequisites: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.student_id = self.student_id.strip()

        if not self.student_id:
            raise ValueError("student_id cannot be empty")

        bounded_values = {
            "working_memory_load": self.working_memory_load,
            "confidence": self.confidence,
            "frustration": self.frustration,
            "focus": self.focus,
            "mastery_score": self.mastery_score,
        }

        for field_name, value in bounded_values.items():
            if not 0.0 <= value <= 1.0:
                raise ValueError(
                    f"{field_name} must be between 0.0 and 1.0"
                )


@dataclass(slots=True)
class NormalizedQuery:
    """Machine-readable representation of a student's input."""

    original_text: str
    normalized_text: str
    subject: str
    topic: str
    intent: str
    variables: dict[str, Any] = field(default_factory=dict)
    constraints: list[str] = field(default_factory=list)
    axioms: list[str] = field(default_factory=list)
    requested_language: str = "English"
    requires_calculation: bool = False
    requires_external_evidence: bool = False
    requires_visual_explanation: bool = False
    required_tools: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.original_text = self.original_text.strip()
        self.normalized_text = self.normalized_text.strip()
        self.subject = self.subject.strip()
        self.topic = self.topic.strip()
        self.intent = self.intent.strip()

        if not self.original_text:
            raise ValueError("original_text cannot be empty")

        if not self.normalized_text:
            raise ValueError("normalized_text cannot be empty")

        if not self.intent:
            raise ValueError("intent cannot be empty")


@dataclass(slots=True)
class Claim:
    """An individual claim that must be audited before presentation."""

    text: str
    claim_type: ClaimType
    verification_status: VerificationStatus = VerificationStatus.PENDING
    evidence: list[str] = field(default_factory=list)
    tool_used: str | None = None
    confidence: float = 0.0
    explanation: str = ""

    def __post_init__(self) -> None:
        self.text = self.text.strip()

        if not self.text:
            raise ValueError("claim text cannot be empty")

        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("claim confidence must be between 0.0 and 1.0")


@dataclass(slots=True)
class TutorPlan:
    """Internal teaching plan created before the tutor answers."""

    learning_objective: str
    stage: LearningStage
    explanation_strategy: str
    socratic_question: str
    required_tools: list[str] = field(default_factory=list)
    prerequisite_skills: list[str] = field(default_factory=list)
    expected_claims: list[Claim] = field(default_factory=list)
    stress_test_variations: list[str] = field(default_factory=list)
    maximum_attempts: int = 5

    def __post_init__(self) -> None:
        self.learning_objective = self.learning_objective.strip()
        self.explanation_strategy = self.explanation_strategy.strip()
        self.socratic_question = self.socratic_question.strip()

        if not self.learning_objective:
            raise ValueError("learning_objective cannot be empty")

        if not self.explanation_strategy:
            raise ValueError("explanation_strategy cannot be empty")

        if self.maximum_attempts < 1:
            raise ValueError("maximum_attempts must be at least 1")


@dataclass(slots=True)
class TutorResponse:
    """Audited response that can be delivered to the student."""

    message: str
    stage: LearningStage
    claims: list[Claim] = field(default_factory=list)
    question_for_student: str | None = None
    hints: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    uncertainty_notes: list[str] = field(default_factory=list)
    safe_to_deliver: bool = False

    def __post_init__(self) -> None:
        self.message = self.message.strip()

        if not self.message:
            raise ValueError("message cannot be empty")


@dataclass(slots=True)
class MasteryResult:
    """Result of evaluating a student answer or teach-back attempt."""

    skill: str
    score: float
    mastered: bool
    correct_elements: list[str] = field(default_factory=list)
    misconceptions: list[str] = field(default_factory=list)
    missing_prerequisites: list[str] = field(default_factory=list)
    recommended_next_action: str = ""
    requires_new_strategy: bool = False

    def __post_init__(self) -> None:
        self.skill = self.skill.strip()

        if not self.skill:
            raise ValueError("skill cannot be empty")

        if not 0.0 <= self.score <= 1.0:
            raise ValueError("score must be between 0.0 and 1.0")

        if self.mastered and self.score < 0.8:
            raise ValueError(
                "A skill cannot be marked mastered below the 0.8 threshold"
            )

    def to_dict(self) -> dict[str, Any]:
        """Return a serializable dictionary representation."""

        return asdict(self)
