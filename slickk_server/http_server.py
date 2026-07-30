"""Dependency-free HTTP server for the Slickk native runtime."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from slickk_models import ModelRegistry


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def registered_models() -> list[dict]:
    registry = ModelRegistry(PROJECT_ROOT / "slickk_models")

    return [
        {
            "name": model["name"],
            "display_name": model.get("display_name", model["name"]),
            "format": model["model_format"],
            "engine": model["runtime"]["engine"],
            "context_length": model.get("context_length"),
        }
        for model in registry.list_models()
    ]


class SlickkRequestHandler(BaseHTTPRequestHandler):
    """Handle requests sent to the Slickk local runtime."""

    server_version = "SlickkRuntime/0.1"

    def send_json(self, status_code: int, payload: dict | list) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")

        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

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

        if path == "/v1/generate":
            self.send_json(
                503,
                {
                    "error": {
                        "code": "model_not_loaded",
                        "message": (
                            "The Slickk server is running, but the native "
                            "inference engine is not loaded yet."
                        ),
                    }
                },
            )
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
    server = ThreadingHTTPServer((host, port), SlickkRequestHandler)

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
