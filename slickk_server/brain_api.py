"""Local HTTP API for the Slickk Universal Tutor Brain.

This module deliberately exposes only student-safe response fields.

Private internal data that must never reach the mobile application includes:

- hidden deterministic answers;
- arithmetic proof details;
- expected answers;
- verification evidence;
- internal claims;
- response-gate diagnostics.

The service uses Python's standard library and therefore introduces no new
runtime dependency.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import (
    BaseHTTPRequestHandler,
    ThreadingHTTPServer,
)
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

from slickk_core.brain import (
    SessionStateError,
    StudentBrainMirrorError,
    StudentProfile,
    StudentState,
    TutorSession,
    TutorSessionStateMachine,
    UniversalTutorBrain,
    UniversalTutorBrainError,
)


class BrainApiError(ValueError):
    """Raised when an API request is invalid."""


@dataclass(slots=True)
class ApiResponse:
    """Framework-independent HTTP response."""

    status_code: int
    payload: dict[str, Any]
    headers: dict[str, str] = field(default_factory=dict)


class BrainApiApplication:
    """Route validated API requests into the tutor brain."""

    API_VERSION = "1.0"

    def __init__(
        self,
        brain: UniversalTutorBrain,
        sessions: TutorSessionStateMachine,
    ) -> None:
        self.brain = brain
        self.sessions = sessions

    def handle(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, list[str]] | None = None,
        body: dict[str, Any] | None = None,
    ) -> ApiResponse:
        """Handle one parsed HTTP request."""

        request_method = method.upper().strip()
        request_path = path.rstrip("/") or "/"
        query_values = query or {}
        request_body = body or {}

        try:
            if (
                request_method == "GET"
                and request_path == "/health"
            ):
                return self._health()

            if (
                request_method == "POST"
                and request_path == "/students/register"
            ):
                return self._register_student(request_body)

            if (
                request_method == "GET"
                and request_path == "/students/state"
            ):
                return self._student_state(query_values)

            if (
                request_method == "POST"
                and request_path == "/lessons/start"
            ):
                return self._start_lesson(request_body)

            if (
                request_method == "POST"
                and request_path == "/lessons/answer"
            ):
                return self._submit_answer(request_body)

            if (
                request_method == "GET"
                and request_path == "/lessons/active"
            ):
                return self._active_lesson(query_values)

            if (
                request_method == "POST"
                and request_path == "/lessons/pause"
            ):
                return self._pause_lesson(request_body)

            if (
                request_method == "POST"
                and request_path == "/lessons/resume"
            ):
                return self._resume_lesson(request_body)

            return ApiResponse(
                status_code=HTTPStatus.NOT_FOUND,
                payload={
                    "ok": False,
                    "error": "route_not_found",
                    "message": (
                        f"No API route matches "
                        f"{request_method} {request_path}"
                    ),
                },
            )

        except (
            BrainApiError,
            SessionStateError,
            StudentBrainMirrorError,
            UniversalTutorBrainError,
            ValueError,
        ) as exc:
            return ApiResponse(
                status_code=HTTPStatus.BAD_REQUEST,
                payload={
                    "ok": False,
                    "error": "invalid_request",
                    "message": str(exc),
                },
            )

        except Exception:
            # Never expose stack traces or internal server details
            # through the student-facing API.
            return ApiResponse(
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
                payload={
                    "ok": False,
                    "error": "internal_error",
                    "message": (
                        "The tutor brain could not safely process "
                        "this request."
                    ),
                },
            )

    def _health(self) -> ApiResponse:
        """Return service readiness without exposing learner data."""

        return ApiResponse(
            status_code=HTTPStatus.OK,
            payload={
                "ok": True,
                "service": "slickk-universal-tutor-brain",
                "api_version": self.API_VERSION,
                "status": "ready",
            },
        )

    def _register_student(
        self,
        body: dict[str, Any],
    ) -> ApiResponse:
        """Register a learner without silently overwriting memory."""

        student_id = self._require_body_text(
            body,
            "student_id",
        )

        replace = bool(body.get("replace", False))

        profile = StudentProfile(
            student_id=student_id,
            name=self._require_body_text(
                body,
                "name",
            ),
            grade=self._require_body_text(
                body,
                "grade",
            ),
            curriculum=self._require_body_text(
                body,
                "curriculum",
            ),
            preferred_language=self._optional_text(
                body.get("preferred_language"),
                default="English",
            ),
            secondary_languages=self._string_list(
                body.get("secondary_languages", []),
                "secondary_languages",
            ),
            learning_preferences=self._string_list(
                body.get("learning_preferences", []),
                "learning_preferences",
            ),
            accessibility_needs=self._string_list(
                body.get("accessibility_needs", []),
                "accessibility_needs",
            ),
        )

        created = not self.brain.has_student(student_id)

        if created or replace:
            initial_state = StudentState(
                student_id=student_id,
            )

            state = self.brain.register_student(
                profile,
                initial_state,
                replace=replace,
            )
        else:
            state = self.brain.student_mirror.get_state(
                student_id
            )

        return ApiResponse(
            status_code=(
                HTTPStatus.CREATED
                if created
                else HTTPStatus.OK
            ),
            payload={
                "ok": True,
                "created": created,
                "student": {
                    "student_id": student_id,
                    "name": (
                        self.brain.student_mirror
                        .get_profile(student_id)
                        .name
                    ),
                },
                "state": self._public_student_state(state),
            },
        )

    def _student_state(
        self,
        query: dict[str, list[str]],
    ) -> ApiResponse:
        """Return the adaptive instructional state."""

        student_id = self._require_query_text(
            query,
            "student_id",
        )

        profile = self.brain.student_mirror.get_profile(
            student_id
        )
        state = self.brain.student_mirror.get_state(
            student_id
        )

        return ApiResponse(
            status_code=HTTPStatus.OK,
            payload={
                "ok": True,
                "student": {
                    "student_id": profile.student_id,
                    "name": profile.name,
                    "grade": profile.grade,
                    "curriculum": profile.curriculum,
                    "preferred_language": (
                        profile.preferred_language
                    ),
                },
                "state": self._public_student_state(state),
            },
        )

    def _start_lesson(
        self,
        body: dict[str, Any],
    ) -> ApiResponse:
        """Begin a persistent lesson."""

        student_id = self._require_body_text(
            body,
            "student_id",
        )
        question = self._require_body_text(
            body,
            "question",
        )

        expected_concepts = self._string_list(
            body.get("expected_concepts", []),
            "expected_concepts",
        )
        sources = self._string_list(
            body.get("sources", []),
            "sources",
        )

        result = self.sessions.start_lesson(
            student_id=student_id,
            question=question,
            expected_concepts=(
                expected_concepts or None
            ),
            sources=sources or None,
        )

        return ApiResponse(
            status_code=HTTPStatus.CREATED,
            payload=self._public_session_turn(result),
        )

    def _submit_answer(
        self,
        body: dict[str, Any],
    ) -> ApiResponse:
        """Submit only the learner's latest response."""

        student_id = self._require_body_text(
            body,
            "student_id",
        )
        answer = self._require_body_text(
            body,
            "answer",
        )

        result = self.sessions.submit_answer(
            student_id=student_id,
            student_answer=answer,
        )

        return ApiResponse(
            status_code=HTTPStatus.OK,
            payload=self._public_session_turn(result),
        )

    def _active_lesson(
        self,
        query: dict[str, list[str]],
    ) -> ApiResponse:
        """Recover the current lesson after app or server restart."""

        student_id = self._require_query_text(
            query,
            "student_id",
        )

        session = self.sessions.get_active_session(
            student_id
        )

        return ApiResponse(
            status_code=HTTPStatus.OK,
            payload={
                "ok": True,
                "session": self._public_session(session),
                "message": session.last_tutor_message,
                "question_for_student": (
                    session.last_question_for_student
                ),
                "deliverable": True,
            },
        )

    def _pause_lesson(
        self,
        body: dict[str, Any],
    ) -> ApiResponse:
        """Pause a learner's active lesson."""

        student_id = self._require_body_text(
            body,
            "student_id",
        )

        session = self.sessions.pause_session(
            student_id
        )

        return ApiResponse(
            status_code=HTTPStatus.OK,
            payload={
                "ok": True,
                "session": self._public_session(session),
                "message": "The lesson has been paused.",
                "question_for_student": None,
                "deliverable": True,
            },
        )

    def _resume_lesson(
        self,
        body: dict[str, Any],
    ) -> ApiResponse:
        """Resume a paused lesson."""

        student_id = self._require_body_text(
            body,
            "student_id",
        )

        session_id_value = body.get("session_id")

        session_id = (
            None
            if session_id_value is None
            else self._optional_text(
                session_id_value,
                default="",
            )
        )

        session = self.sessions.resume_session(
            student_id=student_id,
            session_id=session_id or None,
        )

        return ApiResponse(
            status_code=HTTPStatus.OK,
            payload={
                "ok": True,
                "session": self._public_session(session),
                "message": (
                    session.last_tutor_message
                    or "The lesson has resumed."
                ),
                "question_for_student": (
                    session.last_question_for_student
                ),
                "deliverable": True,
            },
        )

    def _public_session_turn(
        self,
        result: Any,
    ) -> dict[str, Any]:
        """Serialize only fields approved for the learner application."""

        payload: dict[str, Any] = {
            "ok": True,
            "session": self._public_session(
                result.session
            ),
            "message": result.message,
            "question_for_student": (
                result.question_for_student
            ),
            "deliverable": bool(result.deliverable),
        }

        if result.mastery_result is not None:
            evaluation = (
                result.mastery_result.evaluation.result
            )

            payload["progress"] = {
                "mastered": evaluation.mastered,
                "score": evaluation.score,
                "next_stage": (
                    result.mastery_result.next_stage.value
                ),
                "recommended_next_action": (
                    evaluation.recommended_next_action
                ),
            }

        return payload

    @staticmethod
    def _public_session(
        session: TutorSession,
    ) -> dict[str, Any]:
        """Return non-sensitive session fields."""

        return {
            "session_id": session.session_id,
            "student_id": session.student_id,
            "subject": session.subject,
            "topic": session.topic,
            "stage": session.stage.value,
            "status": session.status.value,
            "attempt_count": session.attempt_count,
            "stage_attempt_count": (
                session.stage_attempt_count
            ),
            "strategy_shift_count": (
                session.strategy_shift_count
            ),
            "created_at": session.created_at,
            "updated_at": session.updated_at,
        }

    @staticmethod
    def _public_student_state(
        state: StudentState,
    ) -> dict[str, Any]:
        """Return instructional state without internal session history."""

        return {
            "student_id": state.student_id,
            "current_subject": state.current_subject,
            "current_topic": state.current_topic,
            "difficulty": state.difficulty.value,
            "confidence": state.confidence,
            "frustration": state.frustration,
            "focus": state.focus,
            "mastery_score": state.mastery_score,
            "working_memory_load": (
                state.working_memory_load
            ),
            "mastered_skills": list(
                state.mastered_skills
            ),
            "missing_prerequisites": list(
                state.missing_prerequisites
            ),
        }

    @staticmethod
    def _require_body_text(
        body: dict[str, Any],
        field_name: str,
    ) -> str:
        """Read one required non-empty body field."""

        value = body.get(field_name)

        if not isinstance(value, str):
            raise BrainApiError(
                f"{field_name} must be text"
            )

        cleaned = value.strip()

        if not cleaned:
            raise BrainApiError(
                f"{field_name} cannot be empty"
            )

        return cleaned

    @staticmethod
    def _require_query_text(
        query: dict[str, list[str]],
        field_name: str,
    ) -> str:
        """Read one required query-string value."""

        values = query.get(field_name, [])

        if not values:
            raise BrainApiError(
                f"Missing query parameter: {field_name}"
            )

        value = values[0].strip()

        if not value:
            raise BrainApiError(
                f"{field_name} cannot be empty"
            )

        return value

    @staticmethod
    def _optional_text(
        value: Any,
        *,
        default: str,
    ) -> str:
        """Read an optional text field."""

        if value is None:
            return default

        if not isinstance(value, str):
            raise BrainApiError(
                "Optional text value must be text"
            )

        cleaned = value.strip()
        return cleaned or default

    @staticmethod
    def _string_list(
        value: Any,
        field_name: str,
    ) -> list[str]:
        """Validate, clean, and deduplicate a JSON string list."""

        if value is None:
            return []

        if not isinstance(value, list):
            raise BrainApiError(
                f"{field_name} must be a list"
            )

        cleaned: list[str] = []

        for item in value:
            if not isinstance(item, str):
                raise BrainApiError(
                    f"{field_name} must contain only text"
                )

            normalized = item.strip()

            if normalized and normalized not in cleaned:
                cleaned.append(normalized)

        return cleaned


class BrainApiRequestHandler(BaseHTTPRequestHandler):
    """Thin HTTP transport around BrainApiApplication."""

    application: BrainApiApplication
    MAX_BODY_BYTES = 1_048_576

    server_version = "SlickkBrainAPI/1.0"
    sys_version = ""

    def do_GET(self) -> None:
        self._handle_request()

    def do_POST(self) -> None:
        self._handle_request()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.send_header(
            "Content-Length",
            "0",
        )
        self.end_headers()

    def _handle_request(self) -> None:
        """Parse the request and send a JSON response."""

        split = urlsplit(self.path)
        query = parse_qs(
            split.query,
            keep_blank_values=True,
        )

        try:
            body = self._read_json_body()
        except BrainApiError as exc:
            self._write_response(
                ApiResponse(
                    status_code=HTTPStatus.BAD_REQUEST,
                    payload={
                        "ok": False,
                        "error": "invalid_json",
                        "message": str(exc),
                    },
                )
            )
            return

        response = self.application.handle(
            self.command,
            split.path,
            query=query,
            body=body,
        )

        self._write_response(response)

    def _read_json_body(self) -> dict[str, Any]:
        """Read a bounded JSON object."""

        content_length_text = self.headers.get(
            "Content-Length",
            "0",
        )

        try:
            content_length = int(content_length_text)
        except ValueError as exc:
            raise BrainApiError(
                "Invalid Content-Length header"
            ) from exc

        if content_length < 0:
            raise BrainApiError(
                "Invalid Content-Length header"
            )

        if content_length > self.MAX_BODY_BYTES:
            raise BrainApiError(
                "Request body is too large"
            )

        if content_length == 0:
            return {}

        raw_body = self.rfile.read(
            content_length
        )

        try:
            payload = json.loads(
                raw_body.decode("utf-8")
            )
        except (
            UnicodeDecodeError,
            json.JSONDecodeError,
        ) as exc:
            raise BrainApiError(
                "Request body must be valid UTF-8 JSON"
            ) from exc

        if not isinstance(payload, dict):
            raise BrainApiError(
                "JSON request body must be an object"
            )

        return payload

    def _write_response(
        self,
        response: ApiResponse,
    ) -> None:
        """Write a UTF-8 JSON response."""

        encoded = json.dumps(
            response.payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")

        self.send_response(
            int(response.status_code)
        )
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8",
        )
        self.send_header(
            "Content-Length",
            str(len(encoded)),
        )
        self._send_cors_headers()

        for name, value in response.headers.items():
            self.send_header(name, value)

        self.end_headers()
        self.wfile.write(encoded)

    def _send_cors_headers(self) -> None:
        """Permit local app development requests."""

        self.send_header(
            "Access-Control-Allow-Origin",
            "*",
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS",
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type",
        )

    def log_message(
        self,
        format: str,
        *args: Any,
    ) -> None:
        """Use compact server logging."""

        print(
            f"[brain-api] {self.address_string()} "
            f"{format % args}"
        )


def create_http_server(
    application: BrainApiApplication,
    host: str = "127.0.0.1",
    port: int = 11436,
) -> ThreadingHTTPServer:
    """Create a threaded HTTP server for one API application."""

    class ConfiguredHandler(
        BrainApiRequestHandler
    ):
        pass

    ConfiguredHandler.application = application

    return ThreadingHTTPServer(
        (host, port),
        ConfiguredHandler,
    )


def create_default_application(
    data_directory: str | Path,
) -> BrainApiApplication:
    """Create the production application with persistent storage."""

    data_path = Path(data_directory)
    data_path.mkdir(
        parents=True,
        exist_ok=True,
    )

    brain = UniversalTutorBrain(
        data_path / "student_memory.json"
    )

    sessions = TutorSessionStateMachine(
        brain,
        data_path / "sessions.json",
    )

    return BrainApiApplication(
        brain,
        sessions,
    )
