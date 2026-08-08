"""Persistent lesson-session state machine for the Slickk AI Tutor.

The state machine remembers the active lesson between messages so clients
do not need to resend the original question, current stage, attempt number,
or verified rubric with every student response.

Workflow:

NEW LESSON
    -> SOCRATIC SCAFFOLDING
    -> STRESS TESTING
    -> REVERSE TEACHING
    -> COMPLETE

Failed attempts remain inside a bounded lesson loop. After repeated failures,
the session pauses instead of creating an infinite interaction loop.
"""

from __future__ import annotations

import copy
import json
import os
import re
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from .mastery_loop import (
    MasteryLoopController,
    MasteryLoopResult,
)
from .orchestrator import (
    BrainTurnResult,
    UniversalTutorBrain,
)
from .schemas import LearningStage


class SessionStateError(RuntimeError):
    """Raised when a lesson session cannot be processed safely."""


class SessionStatus(str, Enum):
    """Persistent lifecycle state of one tutor lesson."""

    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


@dataclass(slots=True)
class TutorSession:
    """Persistent state for one guided learning session."""

    session_id: str
    student_id: str
    root_question: str
    active_question: str
    subject: str
    topic: str
    stage: LearningStage
    status: SessionStatus
    maximum_attempts: int
    attempt_count: int = 0
    stage_attempt_count: int = 0
    strategy_shift_count: int = 0
    expected_concepts: list[str] = field(default_factory=list)
    stress_test_queue: list[str] = field(default_factory=list)
    last_tutor_message: str = ""
    last_question_for_student: str | None = None
    history: list[dict[str, Any]] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serialize the session into JSON-compatible data."""

        return {
            "session_id": self.session_id,
            "student_id": self.student_id,
            "root_question": self.root_question,
            "active_question": self.active_question,
            "subject": self.subject,
            "topic": self.topic,
            "stage": self.stage.value,
            "status": self.status.value,
            "maximum_attempts": self.maximum_attempts,
            "attempt_count": self.attempt_count,
            "stage_attempt_count": self.stage_attempt_count,
            "strategy_shift_count": self.strategy_shift_count,
            "expected_concepts": list(self.expected_concepts),
            "stress_test_queue": list(self.stress_test_queue),
            "last_tutor_message": self.last_tutor_message,
            "last_question_for_student": (
                self.last_question_for_student
            ),
            "history": copy.deepcopy(self.history),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(
        cls,
        payload: dict[str, Any],
    ) -> "TutorSession":
        """Restore a validated session from persistent JSON."""

        return cls(
            session_id=str(payload["session_id"]),
            student_id=str(payload["student_id"]),
            root_question=str(payload["root_question"]),
            active_question=str(payload["active_question"]),
            subject=str(payload["subject"]),
            topic=str(payload["topic"]),
            stage=LearningStage(payload["stage"]),
            status=SessionStatus(payload["status"]),
            maximum_attempts=int(
                payload.get("maximum_attempts", 5)
            ),
            attempt_count=int(
                payload.get("attempt_count", 0)
            ),
            stage_attempt_count=int(
                payload.get("stage_attempt_count", 0)
            ),
            strategy_shift_count=int(
                payload.get("strategy_shift_count", 0)
            ),
            expected_concepts=list(
                payload.get("expected_concepts", [])
            ),
            stress_test_queue=list(
                payload.get("stress_test_queue", [])
            ),
            last_tutor_message=str(
                payload.get("last_tutor_message", "")
            ),
            last_question_for_student=payload.get(
                "last_question_for_student"
            ),
            history=list(
                payload.get("history", [])
            ),
            created_at=str(
                payload.get("created_at", "")
            ),
            updated_at=str(
                payload.get("updated_at", "")
            ),
        )


@dataclass(slots=True)
class SessionTurnResult:
    """Student-facing result from starting or continuing a lesson."""

    session: TutorSession
    message: str
    question_for_student: str | None
    deliverable: bool
    initial_turn: BrainTurnResult | None = None
    mastery_result: MasteryLoopResult | None = None

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-compatible API response."""

        return {
            "session": self.session.to_dict(),
            "message": self.message,
            "question_for_student": (
                self.question_for_student
            ),
            "deliverable": self.deliverable,
            "initial_turn": (
                None
                if self.initial_turn is None
                else self.initial_turn.to_dict()
            ),
            "mastery_result": (
                None
                if self.mastery_result is None
                else self.mastery_result.to_dict()
            ),
        }


class TutorSessionStateMachine:
    """Manage persistent, bounded, stage-aware tutor conversations."""

    STORAGE_VERSION = 1
    MAXIMUM_STRATEGY_SHIFTS = 3

    def __init__(
        self,
        brain: UniversalTutorBrain,
        storage_path: str | Path | None = None,
    ) -> None:
        """Initialize the state machine.

        When no explicit session path is provided, a sibling file is derived
        from the Student-Brain Mirror database when possible.
        """

        self.brain = brain
        self.mastery_loop = MasteryLoopController(brain)

        if storage_path is not None:
            self.storage_path = Path(storage_path)

        elif brain.student_mirror.storage_path is not None:
            memory_path = brain.student_mirror.storage_path

            self.storage_path = memory_path.with_name(
                f"{memory_path.stem}_sessions.json"
            )

        else:
            self.storage_path = None

        self._sessions: dict[str, TutorSession] = {}
        self._active_by_student: dict[str, str] = {}

        if (
            self.storage_path is not None
            and self.storage_path.exists()
        ):
            self._load()

    def start_lesson(
        self,
        student_id: str,
        question: str,
        *,
        sources: list[str] | None = None,
        expected_concepts: list[str] | None = None,
    ) -> SessionTurnResult:
        """Start and persist a new guided lesson."""

        clean_question = self._require_text(
            question,
            "question",
        )

        concepts = self._clean_strings(
            expected_concepts or []
        )

        old_session_id = self._active_by_student.get(
            student_id
        )

        if old_session_id:
            old_session = self._sessions.get(
                old_session_id
            )

            if (
                old_session is not None
                and old_session.status == SessionStatus.ACTIVE
            ):
                old_session.status = SessionStatus.CANCELLED
                old_session.updated_at = self._now()

        initial_turn = self.brain.process_turn(
            student_id=student_id,
            message=clean_question,
            sources=sources,
        )

        now = self._now()
        session_id = str(uuid.uuid4())

        session = TutorSession(
            session_id=session_id,
            student_id=student_id,
            root_question=clean_question,
            active_question=clean_question,
            subject=initial_turn.query.subject,
            topic=initial_turn.query.topic,
            stage=initial_turn.plan.stage,
            status=SessionStatus.ACTIVE,
            maximum_attempts=(
                initial_turn.plan.maximum_attempts
            ),
            expected_concepts=concepts,
            stress_test_queue=list(
                initial_turn.plan.stress_test_variations
            ),
            last_tutor_message=(
                initial_turn.response.message
            ),
            last_question_for_student=(
                initial_turn.response.question_for_student
            ),
            history=[
                {
                    "event": "lesson_started",
                    "question": clean_question,
                    "stage": initial_turn.plan.stage.value,
                    "created_at": now,
                }
            ],
            created_at=now,
            updated_at=now,
        )

        self._sessions[session_id] = session
        self._active_by_student[student_id] = session_id
        self._save()

        return SessionTurnResult(
            session=copy.deepcopy(session),
            message=initial_turn.response.message,
            question_for_student=(
                initial_turn.response.question_for_student
            ),
            deliverable=(
                initial_turn.response.safe_to_deliver
            ),
            initial_turn=initial_turn,
        )

    def submit_answer(
        self,
        student_id: str,
        student_answer: str,
    ) -> SessionTurnResult:
        """Evaluate one answer using the remembered lesson context."""

        answer = self._require_text(
            student_answer,
            "student_answer",
        )

        session = self._require_active_session(
            student_id
        )

        stage_before = session.stage
        question_before = session.active_question

        mastery_result = self.mastery_loop.assess(
            student_id=student_id,
            original_question=question_before,
            student_answer=answer,
            stage=stage_before,
            expected_concepts=(
                session.expected_concepts or None
            ),
        )

        session.attempt_count += 1
        session.stage_attempt_count += 1

        session.history.append(
            {
                "event": "answer_evaluated",
                "question": question_before,
                "answer": answer,
                "stage_before": stage_before.value,
                "score": (
                    mastery_result.evaluation.result.score
                ),
                "mastered": (
                    mastery_result.evaluation.result.mastered
                ),
                "next_stage": (
                    mastery_result.next_stage.value
                ),
                "created_at": self._now(),
            }
        )

        if mastery_result.evaluation.result.mastered:
            message, next_question = (
                self._advance_mastered_session(
                    session=session,
                    mastery_result=mastery_result,
                )
            )
        else:
            message, next_question = (
                self._handle_unmastered_answer(
                    session=session,
                    mastery_result=mastery_result,
                )
            )

        session.last_tutor_message = message
        session.last_question_for_student = next_question
        session.updated_at = self._now()

        self._save()

        return SessionTurnResult(
            session=copy.deepcopy(session),
            message=message,
            question_for_student=next_question,
            deliverable=True,
            mastery_result=mastery_result,
        )

    def get_active_session(
        self,
        student_id: str,
    ) -> TutorSession:
        """Return the learner's current active lesson."""

        return copy.deepcopy(
            self._require_active_session(student_id)
        )

    def get_session(
        self,
        session_id: str,
    ) -> TutorSession:
        """Return any stored session by identifier."""

        clean_id = self._require_text(
            session_id,
            "session_id",
        )

        session = self._sessions.get(clean_id)

        if session is None:
            raise SessionStateError(
                f"Unknown session: {clean_id}"
            )

        return copy.deepcopy(session)

    def pause_session(
        self,
        student_id: str,
    ) -> TutorSession:
        """Pause the active lesson explicitly."""

        session = self._require_active_session(
            student_id
        )

        session.status = SessionStatus.PAUSED
        session.updated_at = self._now()
        self._active_by_student.pop(
            student_id,
            None,
        )

        self._save()
        return copy.deepcopy(session)

    def resume_session(
        self,
        student_id: str,
        session_id: str | None = None,
    ) -> TutorSession:
        """Resume a paused session."""

        if session_id is not None:
            session = self._sessions.get(
                session_id
            )
        else:
            candidates = [
                item
                for item in self._sessions.values()
                if (
                    item.student_id == student_id
                    and item.status == SessionStatus.PAUSED
                )
            ]

            candidates.sort(
                key=lambda item: item.updated_at,
                reverse=True,
            )

            session = candidates[0] if candidates else None

        if session is None:
            raise SessionStateError(
                "No paused lesson is available to resume"
            )

        if session.student_id != student_id:
            raise SessionStateError(
                "The session belongs to a different student"
            )

        if session.status != SessionStatus.PAUSED:
            raise SessionStateError(
                "Only paused sessions can be resumed"
            )

        session.status = SessionStatus.ACTIVE
        session.stage_attempt_count = 0
        session.updated_at = self._now()

        self._active_by_student[student_id] = (
            session.session_id
        )

        self._save()
        return copy.deepcopy(session)

    def _advance_mastered_session(
        self,
        *,
        session: TutorSession,
        mastery_result: MasteryLoopResult,
    ) -> tuple[str, str | None]:
        """Move a mastered lesson into its next verified stage."""

        next_stage = mastery_result.next_stage

        session.stage = next_stage
        session.stage_attempt_count = 0
        session.strategy_shift_count = 0

        if next_stage == LearningStage.STRESS_TESTING:
            active_question = self._next_stress_question(
                session
            )

            session.active_question = active_question

            message = (
                "Correct. Now apply the same concept to an "
                "unfamiliar problem."
            )

            question = active_question

        elif next_stage == LearningStage.REVERSE_TEACHING:
            session.active_question = (
                session.root_question
            )

            message = (
                "Your method passed the stress test. Now teach "
                "the concept back using the rule, your reasoning, "
                "and one example."
            )

            question = (
                f"Teach {session.topic} back to me in your own "
                f"words. Explain why it works and include an example."
            )

        elif next_stage == LearningStage.COMPLETE:
            session.status = SessionStatus.COMPLETED

            self._active_by_student.pop(
                session.student_id,
                None,
            )

            message = (
                f"Mastery confirmed for {session.topic}. "
                f"The lesson is complete."
            )

            question = None

        else:
            session.active_question = (
                session.root_question
            )

            message = (
                "That step is verified. Continue explaining "
                "the concept."
            )

            question = session.root_question

        session.history.append(
            {
                "event": "stage_advanced",
                "new_stage": next_stage.value,
                "active_question": session.active_question,
                "created_at": self._now(),
            }
        )

        return message, question

    def _handle_unmastered_answer(
        self,
        *,
        session: TutorSession,
        mastery_result: MasteryLoopResult,
    ) -> tuple[str, str | None]:
        """Create bounded remediation without revealing hidden answers."""

        evaluation = mastery_result.evaluation
        recommendation = (
            evaluation.result.recommended_next_action
        )

        session.stage = mastery_result.next_stage

        if (
            session.stage_attempt_count
            >= session.maximum_attempts
        ):
            session.strategy_shift_count += 1
            session.stage_attempt_count = 0

            if (
                session.strategy_shift_count
                >= self.MAXIMUM_STRATEGY_SHIFTS
            ):
                session.status = SessionStatus.PAUSED

                self._active_by_student.pop(
                    session.student_id,
                    None,
                )

                session.history.append(
                    {
                        "event": "session_paused",
                        "reason": (
                            "Maximum bounded strategy shifts reached"
                        ),
                        "created_at": self._now(),
                    }
                )

                return (
                    "This lesson is paused so the missing foundation "
                    "can be reviewed before continuing.",
                    None,
                )

            message = (
                "We will change the teaching method instead of "
                "repeating the same explanation. "
                f"{recommendation}"
            )

        else:
            message = recommendation

        missing = evaluation.missing_concepts

        if missing:
            next_question = (
                f"Can you explain this part first: {missing[0]}?"
            )

        elif evaluation.result.misconceptions:
            next_question = (
                "Try the current problem again after correcting "
                "the identified misconception."
            )

        else:
            next_question = (
                "Try the current problem again and explain your "
                "first justified step."
            )

        session.history.append(
            {
                "event": "remediation_requested",
                "stage": session.stage.value,
                "question": session.active_question,
                "created_at": self._now(),
            }
        )

        return message, next_question

    def _next_stress_question(
        self,
        session: TutorSession,
    ) -> str:
        """Return and consume the next stress-test variation."""

        if session.stress_test_queue:
            variation = session.stress_test_queue.pop(0)
        else:
            variation = (
                f"Explain {session.topic} with a new example "
                f"that was not used in the original lesson."
            )

        if self._looks_like_expression(variation):
            return (
                f"Work out {variation}. Explain why your "
                f"method works."
            )

        return variation

    def _require_active_session(
        self,
        student_id: str,
    ) -> TutorSession:
        """Return a mutable active session or raise an error."""

        session_id = self._active_by_student.get(
            student_id
        )

        if not session_id:
            raise SessionStateError(
                f"No active lesson for student: {student_id}"
            )

        session = self._sessions.get(session_id)

        if session is None:
            raise SessionStateError(
                "The active session record is missing"
            )

        if session.status != SessionStatus.ACTIVE:
            raise SessionStateError(
                f"Session is not active: {session.status.value}"
            )

        return session

    def _save(self) -> None:
        """Persist sessions using atomic file replacement."""

        if self.storage_path is None:
            return

        self.storage_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        payload = {
            "version": self.STORAGE_VERSION,
            "sessions": {
                session_id: session.to_dict()
                for session_id, session in self._sessions.items()
            },
            "active_by_student": dict(
                self._active_by_student
            ),
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
                temporary_path = Path(
                    temporary_file.name
                )

            temporary_path.replace(
                self.storage_path
            )

        finally:
            if (
                temporary_path is not None
                and temporary_path.exists()
            ):
                temporary_path.unlink(
                    missing_ok=True
                )

    def _load(self) -> None:
        """Load the persistent session database."""

        if self.storage_path is None:
            return

        try:
            payload = json.loads(
                self.storage_path.read_text(
                    encoding="utf-8"
                )
            )
        except (
            OSError,
            json.JSONDecodeError,
        ) as exc:
            raise SessionStateError(
                f"Could not load session database: {exc}"
            ) from exc

        if payload.get("version") != self.STORAGE_VERSION:
            raise SessionStateError(
                "Unsupported session database version"
            )

        sessions_payload = payload.get(
            "sessions",
            {},
        )

        for session_id, session_payload in (
            sessions_payload.items()
        ):
            session = TutorSession.from_dict(
                session_payload
            )

            self._sessions[session_id] = session

        active_payload = payload.get(
            "active_by_student",
            {},
        )

        for student_id, session_id in (
            active_payload.items()
        ):
            session = self._sessions.get(
                session_id
            )

            if (
                session is not None
                and session.status == SessionStatus.ACTIVE
            ):
                self._active_by_student[
                    student_id
                ] = session_id

    @staticmethod
    def _looks_like_expression(
        value: str,
    ) -> bool:
        """Detect simple numerical mathematical expressions."""

        return bool(
            re.fullmatch(
                r"[\d\s().+\-*/=<>!]+",
                value.strip(),
            )
            and re.search(
                r"[+\-*/=<>]",
                value,
            )
        )

    @staticmethod
    def _clean_strings(
        values: list[str],
    ) -> list[str]:
        """Clean and deduplicate persistent string lists."""

        cleaned: list[str] = []

        for value in values:
            if not isinstance(value, str):
                continue

            item = value.strip()

            if item and item not in cleaned:
                cleaned.append(item)

        return cleaned

    @staticmethod
    def _require_text(
        value: str,
        field_name: str,
    ) -> str:
        """Require a non-empty text field."""

        if not isinstance(value, str):
            raise SessionStateError(
                f"{field_name} must be text"
            )

        cleaned = value.strip()

        if not cleaned:
            raise SessionStateError(
                f"{field_name} cannot be empty"
            )

        return cleaned

    @staticmethod
    def _now() -> str:
        """Return the current UTC timestamp."""

        return datetime.now(
            timezone.utc
        ).isoformat()
