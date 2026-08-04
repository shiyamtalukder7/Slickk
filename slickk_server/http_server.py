"""Dependency-free HTTP server for the Slickk native runtime."""

import json
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from slickk_models import ModelRegistry
from slickk_runtime.manager import RuntimeManager, RuntimeManagerError
from slickk_server.tutor_engine import (
    build_tutor_prompt,
    select_tutor_response,
)


PROJECT_ROOT = Path(__file__).resolve().parent.parent

MODEL_REGISTRY = ModelRegistry(PROJECT_ROOT / "slickk_models")
RUNTIME_MANAGER = RuntimeManager(PROJECT_ROOT / "slickk_models")


def registered_models() -> list[dict[str, Any]]:
    """Return registered models in API-friendly form."""

    return [
        {
            "id": model["name"],
            "name": model["name"],
            "object": "model",
            "owned_by": "slickk",
            "display_name": model.get(
                "display_name",
                model["name"],
            ),
            "format": model["model_format"],
            "engine": model["runtime"]["engine"],
            "context_length": model.get("context_length"),
        }
        for model in MODEL_REGISTRY.list_models()
    ]


def messages_to_prompt(messages: Any) -> str:
    """Convert OpenAI-style chat messages into a text prompt."""

    if not isinstance(messages, list) or not messages:
        raise RuntimeManagerError(
            code="messages_required",
            message="Provide a non-empty messages array.",
            status_code=400,
        )

    prompt_sections: list[str] = []

    for message in messages:
        if not isinstance(message, dict):
            raise RuntimeManagerError(
                code="invalid_message",
                message="Every message must be a JSON object.",
                status_code=400,
            )

        role = message.get("role")
        content = message.get("content")

        if role not in {"system", "user", "assistant"}:
            raise RuntimeManagerError(
                code="invalid_message_role",
                message=(
                    "Message role must be system, user, or assistant."
                ),
                status_code=400,
            )

        if not isinstance(content, str) or not content.strip():
            raise RuntimeManagerError(
                code="invalid_message_content",
                message="Every message must contain non-empty text.",
                status_code=400,
            )

        role_label = {
            "system": "System",
            "user": "User",
            "assistant": "Assistant",
        }[role]

        prompt_sections.append(
            f"{role_label}: {content.strip()}"
        )

    prompt_sections.append("Assistant:")

    return "\n\n".join(prompt_sections)


class SlickkRequestHandler(BaseHTTPRequestHandler):
    """Handle requests sent to the Slickk local runtime."""

    server_version = "SlickkRuntime/0.3"
    protocol_version = "HTTP/1.1"

    def send_json(
        self,
        status_code: int,
        payload: dict[str, Any] | list[Any],
    ) -> None:
        """Send a normal JSON response."""

        body = json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")

        self.send_response(status_code)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8",
        )
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization",
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS",
        )
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

        try:
            if body:
                self.wfile.write(body)
                self.wfile.flush()
        except (
            BrokenPipeError,
            ConnectionResetError,
            ConnectionAbortedError,
        ):
            print(
                "[Slickk] Client disconnected while "
                "receiving a JSON response."
            )

    def start_sse(self) -> None:
        """Start a Server-Sent Events response."""

        self.send_response(200)
        self.send_header(
            "Content-Type",
            "text/event-stream; charset=utf-8",
        )
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization",
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS",
        )
        self.end_headers()

    def send_sse_data(
        self,
        payload: dict[str, Any] | str,
    ) -> None:
        """Send one SSE data frame."""

        if isinstance(payload, str):
            data = payload
        else:
            data = json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
            )

        frame = f"data: {data}\n\n".encode("utf-8")
        self.wfile.write(frame)
        self.wfile.flush()

    def read_json(self) -> dict[str, Any]:
        """Read and validate a JSON request body."""

        try:
            content_length = int(
                self.headers.get("Content-Length", "0")
            )
        except ValueError as exc:
            raise RuntimeManagerError(
                code="invalid_content_length",
                message="Content-Length must be an integer.",
                status_code=400,
            ) from exc

        if content_length <= 0:
            return {}

        if content_length > 1_000_000:
            raise RuntimeManagerError(
                code="request_too_large",
                message="The request body exceeds the 1 MB limit.",
                status_code=413,
            )

        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (
            UnicodeDecodeError,
            json.JSONDecodeError,
        ) as exc:
            raise RuntimeManagerError(
                code="invalid_json",
                message="The request body must contain valid JSON.",
                status_code=400,
            ) from exc

        if not isinstance(payload, dict):
            raise RuntimeManagerError(
                code="invalid_request",
                message="The JSON body must be an object.",
                status_code=400,
            )

        return payload

    def send_runtime_error(
        self,
        error: RuntimeManagerError,
    ) -> None:
        """Send a structured runtime error."""

        self.send_json(
            error.status_code,
            {
                "error": {
                    "type": "slickk_runtime_error",
                    "code": error.code,
                    "message": error.message,
                }
            },
        )

    def do_OPTIONS(self) -> None:
        """Handle browser CORS preflight requests."""

        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization",
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS",
        )
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def do_GET(self) -> None:
        """Handle GET routes."""

        path = urlparse(self.path).path

        if path == "/health":
            self.send_json(
                200,
                {
                    "name": "Slickk Native Runtime",
                    "status": "healthy",
                    "phase": 3,
                    "runtime": "slickk-native",
                    "streaming": True,
                },
            )
            return

        if path == "/v1/models":
            self.send_json(
                200,
                {
                    "object": "list",
                    "data": registered_models(),
                },
            )
            return

        if path == "/v1/runtime":
            self.send_json(
                200,
                RUNTIME_MANAGER.state(),
            )
            return

        self.send_json(
            404,
            {
                "error": {
                    "type": "invalid_request_error",
                    "code": "route_not_found",
                    "message": (
                        f"No Slickk route exists at {path}"
                    ),
                }
            },
        )

    def do_POST(self) -> None:
        """Handle POST routes."""

        path = urlparse(self.path).path

        try:
            if path == "/v1/models/load":
                self.handle_model_load()
                return

            if path == "/v1/models/unload":
                self.send_json(
                    200,
                    RUNTIME_MANAGER.unload_model(),
                )
                return

            if path == "/v1/generate":
                self.handle_generate()
                return

            if path == "/v1/chat/completions":
                self.handle_chat_completions()
                return

            if path == "/v1/tutor/chat":
                self.handle_tutor_chat()
                return

        except RuntimeManagerError as error:
            self.send_runtime_error(error)
            return
        except (
            BrokenPipeError,
            ConnectionResetError,
            ConnectionAbortedError,
        ):
            print(
                "[Slickk] Client disconnected before "
                "the response completed."
            )
            return

        self.send_json(
            404,
            {
                "error": {
                    "type": "invalid_request_error",
                    "code": "route_not_found",
                    "message": (
                        f"No Slickk route exists at {path}"
                    ),
                }
            },
        )

    def handle_model_load(self) -> None:
        """Load a registered model."""

        payload = self.read_json()
        model_name = payload.get("name")

        if not isinstance(model_name, str) or not model_name.strip():
            raise RuntimeManagerError(
                code="model_name_required",
                message="Provide a non-empty model name.",
                status_code=400,
            )

        self.send_json(
            200,
            RUNTIME_MANAGER.load_model(
                model_name.strip(),
            ),
        )

    def handle_generate(self) -> None:
        """Handle the original Slickk generation endpoint."""

        payload = self.read_json()
        prompt = payload.get("prompt")
        stream = payload.get("stream", False)
        max_new_tokens = payload.get(
            "max_new_tokens",
            96,
        )

        if not isinstance(prompt, str) or not prompt.strip():
            raise RuntimeManagerError(
                code="prompt_required",
                message="Provide a non-empty prompt.",
                status_code=400,
            )

        if not isinstance(stream, bool):
            raise RuntimeManagerError(
                code="invalid_stream",
                message="stream must be true or false.",
                status_code=400,
            )

        if stream:
            self.handle_generate_stream(
                prompt=prompt,
                max_new_tokens=max_new_tokens,
            )
            return

        result = RUNTIME_MANAGER.generate(
            prompt,
            max_new_tokens,
        )

        self.send_json(200, result)

    def handle_generate_stream(
        self,
        prompt: str,
        max_new_tokens: Any,
    ) -> None:
        """Stream the native Slickk generation format."""

        stream_iterator = RUNTIME_MANAGER.generate_stream(
            prompt,
            max_new_tokens,
        )

        self.start_sse()

        try:
            for event in stream_iterator:
                self.send_sse_data(event)

            self.send_sse_data("[DONE]")
        except RuntimeManagerError as error:
            self.send_sse_data(
                {
                    "event": "error",
                    "error": {
                        "code": error.code,
                        "message": error.message,
                    },
                }
            )
            self.send_sse_data("[DONE]")

        self.close_connection = True

    def handle_tutor_chat(self) -> None:
        """Handle structured educational tutor requests."""

        payload = self.read_json()
        prompt, tutor_metadata = build_tutor_prompt(payload)

        stream = payload.get("stream", False)
        max_new_tokens = payload.get(
            "max_tokens",
            payload.get("max_new_tokens", 160),
        )

        if not isinstance(stream, bool):
            raise RuntimeManagerError(
                code="invalid_stream",
                message="stream must be true or false.",
                status_code=400,
            )

        model = payload.get(
            "model",
            "slickk-edu-local",
        )

        if not isinstance(model, str) or not model.strip():
            raise RuntimeManagerError(
                code="invalid_model",
                message="model must be a non-empty string.",
                status_code=400,
            )

        if stream:
            self.handle_chat_stream(
                prompt=prompt,
                model=model.strip(),
                max_new_tokens=max_new_tokens,
            )
            return

        result = RUNTIME_MANAGER.generate(
            prompt,
            max_new_tokens,
        )

        response_text, fallback_used = select_tutor_response(
            result.get("text"),
            tutor_metadata,
        )

        response_mode_override = tutor_metadata.pop(
            "_response_mode_override",
            None,
        )

        tutor_metadata["response_mode"] = (
            response_mode_override
            if isinstance(
                response_mode_override,
                str,
            )
            and response_mode_override.strip()
            else (
                "verified_fallback"
                if fallback_used
                else "local_model"
            )
        )

        tutor_metadata["model_answer_rejected"] = fallback_used

        self.send_json(
            200,
            {
                "id": f"tutor-{uuid.uuid4().hex}",
                "object": "slickk.tutor.response",
                "created": int(time.time()),
                "model": model.strip(),
                "message": {
                    "role": "assistant",
                    "content": response_text,
                },
                "tutor": tutor_metadata,
                "backend": result.get("backend"),
                "persistent_worker": True,
            },
        )

    def handle_chat_completions(self) -> None:
        """Handle OpenAI-style chat completion requests."""

        payload = self.read_json()

        prompt = messages_to_prompt(
            payload.get("messages")
        )

        stream = payload.get("stream", False)
        max_new_tokens = payload.get(
            "max_tokens",
            payload.get("max_new_tokens", 96),
        )

        if not isinstance(stream, bool):
            raise RuntimeManagerError(
                code="invalid_stream",
                message="stream must be true or false.",
                status_code=400,
            )

        model = payload.get(
            "model",
            "slickk-edu-local",
        )

        if not isinstance(model, str) or not model.strip():
            raise RuntimeManagerError(
                code="invalid_model",
                message="model must be a non-empty string.",
                status_code=400,
            )

        if stream:
            self.handle_chat_stream(
                prompt=prompt,
                model=model.strip(),
                max_new_tokens=max_new_tokens,
            )
            return

        result = RUNTIME_MANAGER.generate(
            prompt,
            max_new_tokens,
        )

        completion_id = (
            f"chatcmpl-{uuid.uuid4().hex}"
        )

        self.send_json(
            200,
            {
                "id": completion_id,
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model.strip(),
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": result["text"],
                        },
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": None,
                    "completion_tokens": None,
                    "total_tokens": None,
                },
                "backend": result.get("backend"),
                "persistent_worker": True,
            },
        )

    def handle_chat_stream(
        self,
        prompt: str,
        model: str,
        max_new_tokens: Any,
    ) -> None:
        """Stream OpenAI-compatible chat completion chunks."""

        completion_id = (
            f"chatcmpl-{uuid.uuid4().hex}"
        )
        created = int(time.time())

        stream_iterator = RUNTIME_MANAGER.generate_stream(
            prompt,
            max_new_tokens,
        )

        self.start_sse()

        try:
            self.send_sse_data(
                {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {
                                "role": "assistant",
                            },
                            "finish_reason": None,
                        }
                    ],
                }
            )

            for event in stream_iterator:
                if event.get("event") == "chunk":
                    self.send_sse_data(
                        {
                            "id": completion_id,
                            "object": (
                                "chat.completion.chunk"
                            ),
                            "created": created,
                            "model": model,
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {
                                        "content": event.get(
                                            "text",
                                            "",
                                        ),
                                    },
                                    "finish_reason": None,
                                }
                            ],
                        }
                    )

                elif event.get("event") == "done":
                    self.send_sse_data(
                        {
                            "id": completion_id,
                            "object": (
                                "chat.completion.chunk"
                            ),
                            "created": created,
                            "model": model,
                            "choices": [
                                {
                                    "index": 0,
                                    "delta": {},
                                    "finish_reason": "stop",
                                }
                            ],
                        }
                    )

            self.send_sse_data("[DONE]")

        except RuntimeManagerError as error:
            self.send_sse_data(
                {
                    "error": {
                        "type": "slickk_runtime_error",
                        "code": error.code,
                        "message": error.message,
                    }
                }
            )
            self.send_sse_data("[DONE]")

        self.close_connection = True

    def log_message(
        self,
        format: str,
        *args: object,
    ) -> None:
        """Print compact server request logs."""

        print(
            f"[Slickk] {self.address_string()} - "
            f"{format % args}"
        )


def serve(
    host: str = "127.0.0.1",
    port: int = 11435,
    model_name: str | None = "slickk-edu-local",
) -> None:
    """Start the Slickk local HTTP server."""

    server = ThreadingHTTPServer(
        (host, port),
        SlickkRequestHandler,
    )

    print("Slickk Native Runtime")
    print(f"Server: http://{host}:{port}")
    print(f"Health: http://{host}:{port}/health")
    print(
        "Chat API: "
        f"http://{host}:{port}/v1/chat/completions"
    )
    print("Streaming: enabled")
    print("Press Ctrl+C to stop.")

    if model_name:
        print(f"Loading model: {model_name}")

        try:
            state = RUNTIME_MANAGER.load_model(model_name)
            active_model = state.get("active_model") or {}

            print(
                "Model ready: "
                f"{active_model.get('name', model_name)}"
            )
        except RuntimeManagerError as error:
            print(
                "[Slickk] Automatic model load failed "
                f"({error.code}): {error.message}"
            )
            print(
                "[Slickk] Server will continue. The model can "
                "still be loaded through POST /v1/models/load."
            )

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Slickk server...")
    finally:
        RUNTIME_MANAGER.unload_model()
        server.server_close()