"""Dependency-free HTTP server for the Slickk native runtime."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from slickk_models import ModelRegistry
from slickk_runtime.manager import RuntimeManager, RuntimeManagerError


PROJECT_ROOT = Path(__file__).resolve().parent.parent

MODEL_REGISTRY = ModelRegistry(PROJECT_ROOT / "slickk_models")
RUNTIME_MANAGER = RuntimeManager(PROJECT_ROOT / "slickk_models")


def registered_models() -> list[dict[str, Any]]:
    return [
        {
            "name": model["name"],
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


class SlickkRequestHandler(BaseHTTPRequestHandler):
    """Handle requests sent to the Slickk local runtime."""

    server_version = "SlickkRuntime/0.2"

    def send_json(
        self,
        status_code: int,
        payload: dict[str, Any] | list[Any],
    ) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")

        self.send_response(status_code)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8",
        )
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type",
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS",
        )
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict[str, Any]:
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
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
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
        self.send_json(
            error.status_code,
            {
                "error": {
                    "code": error.code,
                    "message": error.message,
                }
            },
        )

    def do_OPTIONS(self) -> None:
        self.send_json(204, {})

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/health":
            self.send_json(
                200,
                {
                    "name": "Slickk Native Runtime",
                    "status": "healthy",
                    "phase": 2,
                    "runtime": "slickk-native",
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
            self.send_json(200, RUNTIME_MANAGER.state())
            return

        self.send_json(
            404,
            {
                "error": {
                    "code": "route_not_found",
                    "message": f"No Slickk route exists at {path}",
                }
            },
        )

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        try:
            if path == "/v1/models/load":
                payload = self.read_json()
                model_name = payload.get("name")

                if not isinstance(model_name, str) or not model_name:
                    raise RuntimeManagerError(
                        code="model_name_required",
                        message="Provide a non-empty model name.",
                        status_code=400,
                    )

                self.send_json(
                    200,
                    RUNTIME_MANAGER.load_model(model_name),
                )
                return

            if path == "/v1/models/unload":
                self.send_json(
                    200,
                    RUNTIME_MANAGER.unload_model(),
                )
                return

            if path == "/v1/generate":
                payload = self.read_json()
                prompt = payload.get("prompt")

                if not isinstance(prompt, str) or not prompt.strip():
                    raise RuntimeManagerError(
                        code="prompt_required",
                        message="Provide a non-empty prompt.",
                        status_code=400,
                    )

                self.send_json(
                    200,
                    RUNTIME_MANAGER.generate(prompt, payload.get("max_new_tokens", 96)),
                )
                return

        except RuntimeManagerError as error:
            self.send_runtime_error(error)
            return

        self.send_json(
            404,
            {
                "error": {
                    "code": "route_not_found",
                    "message": f"No Slickk route exists at {path}",
                }
            },
        )

    def log_message(self, format: str, *args: object) -> None:
        print(f"[Slickk] {self.address_string()} - {format % args}")


def serve(host: str = "127.0.0.1", port: int = 11435) -> None:
    server = ThreadingHTTPServer(
        (host, port),
        SlickkRequestHandler,
    )

    print("Slickk Native Runtime")
    print(f"Server: http://{host}:{port}")
    print(f"Health: http://{host}:{port}/health")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Slickk server...")
    finally:
        server.server_close()

