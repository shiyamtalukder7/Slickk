"""Persistent adaptive learner model for the Slickk Universal AI Tutor.

The Student-Brain Mirror maintains an instructional estimate of the learner's:

- mastery;
- confidence;
- frustration;
- focus;
- working-memory load;
- misconceptions;
- missing prerequisites;
- mastered skills.

These values are teaching-control signals. They are not psychological,
neurological, or medical diagnoses.
"""

from __future__ import annotations

import copy
import json
import os
import re
import tempfile
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .schemas import (
    DifficultyLevel,
    MasteryResult,
    StudentProfile,
    StudentState,
)


class StudentBrainMirrorError(ValueError):
    """Raised when learner-state operations cannot be completed safely."""


@dataclass(slots=True)
class BrainMirrorUpdate:
    """Result returned after processing one student interaction."""

    student_id: str
    previous_state: StudentState
    updated_state: StudentState
    detected_signals: dict[str, float]
    recommended_strategies: list[str]
    interaction_count: int


class StudentBrainMirror:
    """Track, adapt, and persist individual student learning states."""

    STORAGE_VERSION = 1

    FRUSTRATION_MARKERS: dict[str, float] = {
        "i don't understand": 0.18,
        "i do not understand": 0.18,
        "dont understand": 0.18,
        "do not get it": 0.18,
        "i don't get it": 0.18,
        "confused": 0.16,
        "too hard": 0.18,
        "this is hard": 0.14,
        "stuck": 0.16,
        "wrong again": 0.18,
        "i can't": 0.14,
        "i cannot": 0.14,
        "help me": 0.08,
        "বুঝতে পারছি না": 0.18,
        "কঠিন": 0.14,
    }

    CONFIDENCE_MARKERS: dict[str, float] = {
        "i understand": 0.16,
        "i got it": 0.16,
        "got it": 0.12,
        "makes sense": 0.14,
        "i know": 0.10,
        "easy": 0.10,
        "i am sure": 0.14,
        "my answer is": 0.05,
        "বুঝেছি": 0.16,
        "সহজ": 0.10,
    }

    LOW_FOCUS_MARKERS: dict[str, float] = {
        "i am tired": 0.16,
        "i'm tired": 0.16,
        "tired": 0.10,
        "distracted": 0.18,
        "can't focus": 0.20,
        "cannot focus": 0.20,
        "boring": 0.12,
        "later": 0.06,
        "ঘুম পাচ্ছে": 0.16,
        "মনোযোগ দিতে পারছি না": 0.20,
    }

    POSITIVE_FOCUS_MARKERS: dict[str, float] = {
        "ready": 0.10,
        "let's continue": 0.12,
        "lets continue": 0.12,
        "next question": 0.10,
        "give me another": 0.10,
        "চালিয়ে যাই": 0.12,
    }

    def __init__(
        self,
        storage_path: str | Path | None = None,
    ) -> None:
        """Initialize the mirror and load existing learner data.

        Args:
            storage_path:
                Optional JSON database location. When omitted, the mirror
                operates in memory only.
        """

        self.storage_path = (
            Path(storage_path) if storage_path is not None else None
        )

        self._profiles: dict[str, StudentProfile] = {}
        self._states: dict[str, StudentState] = {}
        self._interaction_counts: dict[str, int] = {}

        if self.storage_path is not None and self.storage_path.exists():
            self._load()

    def register_student(
        self,
        profile: StudentProfile,
        initial_state: StudentState | None = None,
        *,
        replace: bool = False,
    ) -> StudentState:
        """Register a learner and create their initial adaptive state."""

        student_id = profile.student_id

        if student_id in self._profiles and not replace:
            raise StudentBrainMirrorError(
                f"Student already registered: {student_id}"
            )

        if initial_state is None:
            state = StudentState(student_id=student_id)
        else:
            if initial_state.student_id != student_id:
                raise StudentBrainMirrorError(
                    "Profile and state student IDs must match"
                )

            state = copy.deepcopy(initial_state)

        self._profiles[student_id] = copy.deepcopy(profile)
        self._states[student_id] = state
        self._interaction_counts[student_id] = 0

        self._save()

        return copy.deepcopy(state)

    def has_student(self, student_id: str) -> bool:
        """Return whether a learner has been registered."""

        return student_id.strip() in self._profiles

    def get_profile(self, student_id: str) -> StudentProfile:
        """Return an isolated copy of the learner profile."""

        clean_id = self._require_student(student_id)
        return copy.deepcopy(self._profiles[clean_id])

    def get_state(self, student_id: str) -> StudentState:
        """Return an isolated copy of the learner's current state."""

        clean_id = self._require_student(student_id)
        return copy.deepcopy(self._states[clean_id])

    def get_interaction_count(self, student_id: str) -> int:
        """Return the number of recorded learning interactions."""

        clean_id = self._require_student(student_id)
        return self._interaction_counts[clean_id]

    def process_interaction(
        self,
        student_id: str,
        message: str,
        *,
        correctness_score: float | None = None,
        subject: str | None = None,
        topic: str | None = None,
        misconceptions: list[str] | None = None,
        mastered_skills: list[str] | None = None,
        missing_prerequisites: list[str] | None = None,
        response_time_seconds: float | None = None,
    ) -> BrainMirrorUpdate:
        """Update the learner state from one verified interaction.

        Args:
            correctness_score:
                Verified correctness from 0.0 to 1.0. It must not be a raw
                language-model guess.
            response_time_seconds:
                Optional response duration used only as a weak pacing signal.
        """

        clean_id = self._require_student(student_id)

        if not isinstance(message, str) or not message.strip():
            raise StudentBrainMirrorError(
                "Interaction message cannot be empty"
            )

        if correctness_score is not None:
            self._validate_unit_interval(
                correctness_score,
                "correctness_score",
            )

        if (
            response_time_seconds is not None
            and response_time_seconds < 0
        ):
            raise StudentBrainMirrorError(
                "response_time_seconds cannot be negative"
            )

        previous_state = copy.deepcopy(self._states[clean_id])
        updated_state = copy.deepcopy(previous_state)

        signals = self.detect_signals(message)

        if subject is not None:
            updated_state.current_subject = subject.strip()

        if topic is not None:
            updated_state.current_topic = topic.strip()

        self._update_affective_state(
            state=updated_state,
            signals=signals,
            correctness_score=correctness_score,
            response_time_seconds=response_time_seconds,
        )

        self._update_mastery(
            state=updated_state,
            correctness_score=correctness_score,
        )

        self._merge_unique(
            updated_state.misconceptions,
            misconceptions or [],
        )
        self._merge_unique(
            updated_state.mastered_skills,
            mastered_skills or [],
        )
        self._merge_unique(
            updated_state.missing_prerequisites,
            missing_prerequisites or [],
        )

        for mastered_skill in mastered_skills or []:
            self._remove_case_insensitive(
                updated_state.missing_prerequisites,
                mastered_skill,
            )

        updated_state.difficulty = self._select_difficulty(updated_state)

        self._states[clean_id] = updated_state
        self._interaction_counts[clean_id] += 1
        self._save()

        strategies = self.recommend_strategies(updated_state)

        return BrainMirrorUpdate(
            student_id=clean_id,
            previous_state=previous_state,
            updated_state=copy.deepcopy(updated_state),
            detected_signals=signals,
            recommended_strategies=strategies,
            interaction_count=self._interaction_counts[clean_id],
        )

    def record_mastery_result(
        self,
        student_id: str,
        message: str,
        result: MasteryResult,
        *,
        subject: str | None = None,
        topic: str | None = None,
    ) -> BrainMirrorUpdate:
        """Apply a verified MasteryResult to the learner model."""

        mastered_skills = [result.skill] if result.mastered else []

        return self.process_interaction(
            student_id=student_id,
            message=message,
            correctness_score=result.score,
            subject=subject,
            topic=topic,
            misconceptions=result.misconceptions,
            mastered_skills=mastered_skills,
            missing_prerequisites=result.missing_prerequisites,
        )

    def resolve_misconception(
        self,
        student_id: str,
        misconception: str,
    ) -> bool:
        """Remove a misconception after verified correction."""

        clean_id = self._require_student(student_id)
        removed = self._remove_case_insensitive(
            self._states[clean_id].misconceptions,
            misconception,
        )

        if removed:
            self._save()

        return removed

    def resolve_prerequisite(
        self,
        student_id: str,
        prerequisite: str,
    ) -> bool:
        """Mark a missing prerequisite as resolved."""

        clean_id = self._require_student(student_id)
        state = self._states[clean_id]

        removed = self._remove_case_insensitive(
            state.missing_prerequisites,
            prerequisite,
        )

        if removed:
            self._merge_unique(
                state.mastered_skills,
                [prerequisite],
            )
            state.difficulty = self._select_difficulty(state)
            self._save()

        return removed

    def detect_signals(self, message: str) -> dict[str, float]:
        """Detect transparent instructional signals from student wording."""

        normalized = self._normalize(message)

        frustration = self._score_markers(
            normalized,
            self.FRUSTRATION_MARKERS,
        )
        confidence = self._score_markers(
            normalized,
            self.CONFIDENCE_MARKERS,
        )
        low_focus = self._score_markers(
            normalized,
            self.LOW_FOCUS_MARKERS,
        )
        positive_focus = self._score_markers(
            normalized,
            self.POSITIVE_FOCUS_MARKERS,
        )

        question_marks = message.count("?")

        uncertainty = min(
            0.18,
            question_marks * 0.03
            + (
                0.08
                if re.search(
                    r"\b(maybe|not sure|guess|perhaps)\b",
                    normalized,
                )
                else 0.0
            ),
        )

        return {
            "frustration": round(frustration, 4),
            "confidence": round(confidence, 4),
            "low_focus": round(low_focus, 4),
            "positive_focus": round(positive_focus, 4),
            "uncertainty": round(uncertainty, 4),
        }

    def recommend_strategies(
        self,
        state: StudentState,
    ) -> list[str]:
        """Select teaching controls from the current learner state."""

        strategies: list[str] = []

        if state.missing_prerequisites:
            strategies.extend(
                [
                    "teach_missing_prerequisite",
                    "use_foundation_example",
                ]
            )

        # Moderate frustration requires immediate instructional
        # simplification before the learner becomes overwhelmed.
        if state.frustration >= 0.40:
            strategies.extend(
                [
                    "reduce_step_size",
                    "give_one_hint_at_a_time",
                ]
            )

        # Severe frustration additionally requires emotional reframing
        # and reassurance while preserving academic accuracy.
        if state.frustration >= 0.65:
            strategies.append("use_patient_reframing")

        if state.working_memory_load >= 0.70:
            strategies.extend(
                [
                    "reduce_cognitive_load",
                    "use_short_explanation",
                ]
            )

        if state.focus <= 0.35:
            strategies.extend(
                [
                    "ask_single_short_question",
                    "use_active_recall",
                ]
            )

        if (
            state.mastery_score >= 0.80
            and state.confidence >= 0.65
            and not state.missing_prerequisites
        ):
            strategies.extend(
                [
                    "increase_challenge",
                    "run_adversarial_stress_test",
                    "request_teach_back",
                ]
            )

        if not strategies:
            strategies.append("use_socratic_scaffolding")

        return list(dict.fromkeys(strategies))

    def export_snapshot(self, student_id: str) -> dict[str, Any]:
        """Return a JSON-compatible learner snapshot."""

        clean_id = self._require_student(student_id)

        return {
            "profile": self._serialize_profile(
                self._profiles[clean_id]
            ),
            "state": self._serialize_state(
                self._states[clean_id]
            ),
            "interaction_count": self._interaction_counts[clean_id],
        }

    def _update_affective_state(
        self,
        *,
        state: StudentState,
        signals: dict[str, float],
        correctness_score: float | None,
        response_time_seconds: float | None,
    ) -> None:
        """Apply bounded state adjustments from observable signals."""

        score_effect = (
            0.0
            if correctness_score is None
            else (correctness_score - 0.5)
        )

        state.confidence = self._clamp(
            state.confidence
            + signals["confidence"]
            - signals["uncertainty"] * 0.35
            - signals["frustration"] * 0.25
            + score_effect * 0.28
        )

        incorrect_pressure = (
            0.0
            if correctness_score is None
            else max(0.0, 0.5 - correctness_score) * 0.30
        )

        state.frustration = self._clamp(
            state.frustration
            + signals["frustration"]
            + incorrect_pressure
            - signals["confidence"] * 0.30
            - max(0.0, score_effect) * 0.12
        )

        time_penalty = 0.0

        if response_time_seconds is not None:
            if response_time_seconds > 180:
                time_penalty = 0.10
            elif response_time_seconds > 90:
                time_penalty = 0.05

        state.focus = self._clamp(
            state.focus
            + signals["positive_focus"]
            - signals["low_focus"]
            - time_penalty
        )

        token_count = len(re.findall(r"\S+", state.current_topic))
        message_complexity = min(1.0, token_count / 20.0)

        target_load = self._clamp(
            message_complexity * 0.25
            + state.frustration * 0.45
            + (1.0 - state.focus) * 0.30
        )

        state.working_memory_load = self._clamp(
            state.working_memory_load * 0.55
            + target_load * 0.45
        )

    def _update_mastery(
        self,
        *,
        state: StudentState,
        correctness_score: float | None,
    ) -> None:
        """Update mastery using a stable exponential moving average."""

        if correctness_score is None:
            return

        learning_rate = 0.30

        state.mastery_score = self._clamp(
            state.mastery_score * (1.0 - learning_rate)
            + correctness_score * learning_rate
        )

    def _select_difficulty(
        self,
        state: StudentState,
    ) -> DifficultyLevel:
        """Choose the safest productive difficulty for the learner."""

        if state.missing_prerequisites:
            return DifficultyLevel.FOUNDATION

        if state.frustration >= 0.78:
            return DifficultyLevel.FOUNDATION

        mastery = state.mastery_score

        if mastery < 0.25:
            return DifficultyLevel.BEGINNER

        if mastery < 0.55:
            return DifficultyLevel.INTERMEDIATE

        if mastery < 0.80:
            return DifficultyLevel.ADVANCED

        return DifficultyLevel.EXPERT

    def _save(self) -> None:
        """Persist the database with an atomic file replacement."""

        if self.storage_path is None:
            return

        self.storage_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        payload = {
            "version": self.STORAGE_VERSION,
            "profiles": {
                student_id: self._serialize_profile(profile)
                for student_id, profile in self._profiles.items()
            },
            "states": {
                student_id: self._serialize_state(state)
                for student_id, state in self._states.items()
            },
            "interaction_counts": self._interaction_counts,
        }

        temporary_path: Path | None = None

        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.storage_path.parent,
                prefix=f"{self.storage_path.name}.",
                suffix=".tmp",
                delete=False,
            ) as temporary_file:
                json.dump(
                    payload,
                    temporary_file,
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                )
                temporary_file.flush()
                os.fsync(temporary_file.fileno())
                temporary_path = Path(temporary_file.name)

            temporary_path.replace(self.storage_path)

        finally:
            if (
                temporary_path is not None
                and temporary_path.exists()
            ):
                temporary_path.unlink(missing_ok=True)

    def _load(self) -> None:
        """Load and validate the persistent learner database."""

        if self.storage_path is None:
            return

        try:
            payload = json.loads(
                self.storage_path.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError) as exc:
            raise StudentBrainMirrorError(
                f"Could not load learner database: {exc}"
            ) from exc

        version = payload.get("version")

        if version != self.STORAGE_VERSION:
            raise StudentBrainMirrorError(
                f"Unsupported learner database version: {version}"
            )

        profiles_payload = payload.get("profiles", {})
        states_payload = payload.get("states", {})
        counts_payload = payload.get("interaction_counts", {})

        for student_id, profile_data in profiles_payload.items():
            self._profiles[student_id] = StudentProfile(
                **profile_data
            )

        for student_id, state_data in states_payload.items():
            state_copy = dict(state_data)
            state_copy["difficulty"] = DifficultyLevel(
                state_copy["difficulty"]
            )
            self._states[student_id] = StudentState(**state_copy)

        for student_id in self._profiles:
            if student_id not in self._states:
                raise StudentBrainMirrorError(
                    f"Missing state for student: {student_id}"
                )

            self._interaction_counts[student_id] = int(
                counts_payload.get(student_id, 0)
            )

    def _require_student(self, student_id: str) -> str:
        """Validate and return a registered student ID."""

        if not isinstance(student_id, str):
            raise StudentBrainMirrorError(
                "student_id must be text"
            )

        clean_id = student_id.strip()

        if clean_id not in self._profiles:
            raise StudentBrainMirrorError(
                f"Unknown student: {clean_id}"
            )

        return clean_id

    @staticmethod
    def _serialize_profile(
        profile: StudentProfile,
    ) -> dict[str, Any]:
        """Serialize a profile to plain JSON data."""

        return asdict(profile)

    @staticmethod
    def _serialize_state(
        state: StudentState,
    ) -> dict[str, Any]:
        """Serialize a state while converting its enum explicitly."""

        payload = asdict(state)
        payload["difficulty"] = state.difficulty.value
        return payload

    @staticmethod
    def _normalize(message: str) -> str:
        """Normalize text for transparent phrase detection."""

        normalized = unicodedata.normalize("NFKC", message)
        normalized = normalized.lower()
        normalized = re.sub(r"\s+", " ", normalized)
        return normalized.strip()

    @staticmethod
    def _score_markers(
        normalized_message: str,
        markers: dict[str, float],
    ) -> float:
        """Calculate a capped score from matched phrases."""

        score = sum(
            weight
            for phrase, weight in markers.items()
            if phrase in normalized_message
        )

        return min(0.40, score)

    @staticmethod
    def _merge_unique(
        destination: list[str],
        values: list[str],
    ) -> None:
        """Append normalized unique strings while preserving order."""

        existing = {
            value.strip().casefold()
            for value in destination
        }

        for value in values:
            cleaned = value.strip()

            if not cleaned:
                continue

            key = cleaned.casefold()

            if key not in existing:
                destination.append(cleaned)
                existing.add(key)

    @staticmethod
    def _remove_case_insensitive(
        values: list[str],
        target: str,
    ) -> bool:
        """Remove one matching value without case sensitivity."""

        target_key = target.strip().casefold()

        for index, value in enumerate(values):
            if value.strip().casefold() == target_key:
                del values[index]
                return True

        return False

    @staticmethod
    def _validate_unit_interval(
        value: float,
        field_name: str,
    ) -> None:
        """Require a numerical value between zero and one."""

        if not isinstance(value, (int, float)):
            raise StudentBrainMirrorError(
                f"{field_name} must be numerical"
            )

        if not 0.0 <= float(value) <= 1.0:
            raise StudentBrainMirrorError(
                f"{field_name} must be between 0.0 and 1.0"
            )

    @staticmethod
    def _clamp(value: float) -> float:
        """Restrict a state signal to the inclusive unit interval."""

        return round(max(0.0, min(1.0, value)), 4)
