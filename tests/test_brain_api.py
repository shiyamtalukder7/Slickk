"""Tests for the local Slickk Tutor Brain HTTP API."""

import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import urlopen

from slickk_core.brain import (
    TutorSessionStateMachine,
    UniversalTutorBrain,
)
from slickk_server.brain_api import (
    BrainApiApplication,
    create_http_server,
)


class BrainApiApplicationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()

        root = Path(
            self.temporary_directory.name
        )

        self.brain = UniversalTutorBrain(
            root / "student_memory.json"
        )

        self.sessions = TutorSessionStateMachine(
            self.brain,
            root / "sessions.json",
        )

        self.application = BrainApiApplication(
            self.brain,
            self.sessions,
        )

        self._register_student()

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def _register_student(self) -> None:
        response = self.application.handle(
            "POST",
            "/students/register",
            body={
                "student_id": "student-001",
                "name": "Mahir",
                "grade": "Class 7",
                "curriculum": "IGCSE Edexcel",
                "preferred_language": "English",
            },
        )

        self.assertEqual(
            response.status_code,
            201,
        )

    def test_health_endpoint(self) -> None:
        response = self.application.handle(
            "GET",
            "/health",
        )

        self.assertEqual(
            response.status_code,
            200,
        )
        self.assertTrue(
            response.payload["ok"]
        )
        self.assertEqual(
            response.payload["status"],
            "ready",
        )

    def test_duplicate_registration_does_not_overwrite(self) -> None:
        response = self.application.handle(
            "POST",
            "/students/register",
            body={
                "student_id": "student-001",
                "name": "Different Name",
                "grade": "Class 8",
                "curriculum": "Different Curriculum",
            },
        )

        self.assertEqual(
            response.status_code,
            200,
        )
        self.assertFalse(
            response.payload["created"]
        )
        self.assertEqual(
            response.payload["student"]["name"],
            "Mahir",
        )

    def test_start_lesson_returns_only_public_output(self) -> None:
        response = self.application.handle(
            "POST",
            "/lessons/start",
            body={
                "student_id": "student-001",
                "question": "What is 12 divided by 3?",
            },
        )

        self.assertEqual(
            response.status_code,
            201,
        )
        self.assertTrue(
            response.payload["deliverable"]
        )

        serialized = json.dumps(
            response.payload
        )

        self.assertNotIn(
            "arithmetic_results",
            serialized,
        )
        self.assertNotIn(
            "exact_value",
            serialized,
        )
        self.assertNotIn(
            "expected_answer",
            serialized,
        )
        self.assertNotIn(
            "diagnostic_errors",
            serialized,
        )

    def test_submit_answer_progresses_session(self) -> None:
        self.application.handle(
            "POST",
            "/lessons/start",
            body={
                "student_id": "student-001",
                "question": "What is 12 divided by 3?",
            },
        )

        response = self.application.handle(
            "POST",
            "/lessons/answer",
            body={
                "student_id": "student-001",
                "answer": "4",
            },
        )

        self.assertEqual(
            response.status_code,
            200,
        )
        self.assertEqual(
            response.payload["session"]["stage"],
            "stress_testing",
        )
        self.assertTrue(
            response.payload["progress"]["mastered"]
        )

    def test_active_lesson_can_be_recovered(self) -> None:
        started = self.application.handle(
            "POST",
            "/lessons/start",
            body={
                "student_id": "student-001",
                "question": "Explain photosynthesis.",
            },
        )

        recovered = self.application.handle(
            "GET",
            "/lessons/active",
            query={
                "student_id": ["student-001"],
            },
        )

        self.assertEqual(
            recovered.status_code,
            200,
        )
        self.assertEqual(
            recovered.payload["session"]["session_id"],
            started.payload["session"]["session_id"],
        )

    def test_pause_and_resume_endpoints(self) -> None:
        started = self.application.handle(
            "POST",
            "/lessons/start",
            body={
                "student_id": "student-001",
                "question": "Explain photosynthesis.",
            },
        )

        paused = self.application.handle(
            "POST",
            "/lessons/pause",
            body={
                "student_id": "student-001",
            },
        )

        self.assertEqual(
            paused.payload["session"]["status"],
            "paused",
        )

        resumed = self.application.handle(
            "POST",
            "/lessons/resume",
            body={
                "student_id": "student-001",
                "session_id": (
                    started.payload["session"]["session_id"]
                ),
            },
        )

        self.assertEqual(
            resumed.payload["session"]["status"],
            "active",
        )

    def test_invalid_route_returns_404(self) -> None:
        response = self.application.handle(
            "GET",
            "/does-not-exist",
        )

        self.assertEqual(
            response.status_code,
            404,
        )
        self.assertFalse(
            response.payload["ok"]
        )

    def test_missing_required_field_returns_400(self) -> None:
        response = self.application.handle(
            "POST",
            "/lessons/start",
            body={
                "student_id": "student-001",
            },
        )

        self.assertEqual(
            response.status_code,
            400,
        )
        self.assertFalse(
            response.payload["ok"]
        )

    def test_real_http_health_request(self) -> None:
        server = create_http_server(
            self.application,
            host="127.0.0.1",
            port=0,
        )

        thread = threading.Thread(
            target=server.serve_forever,
            daemon=True,
        )

        thread.start()

        try:
            host, port = server.server_address

            with urlopen(
                f"http://{host}:{port}/health",
                timeout=3,
            ) as response:
                payload = json.loads(
                    response.read().decode("utf-8")
                )

            self.assertEqual(
                response.status,
                200,
            )
            self.assertTrue(payload["ok"])
            self.assertEqual(
                payload["status"],
                "ready",
            )

        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
