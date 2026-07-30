"""Model lifecycle and inference management for Slickk."""

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any

from slickk_models import ModelRegistry


class RuntimeManagerError(Exception):
    """A structured error produced by the runtime manager."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class RuntimeManager:
    """Manage the currently active Slickk model."""

    def __init__(self, manifests_directory: Path) -> None:
        self._registry = ModelRegistry(manifests_directory)
        self._project_root = manifests_directory.parent
        self._bridge_directory = (
            self._project_root / "tools" / "slickk-wasm"
        )
        self._bridge_script = (
            self._bridge_directory / "inference.mjs"
        )

        self._lock = RLock()
        self._active_model: dict[str, Any] | None = None
        self._loaded_at: str | None = None

    def state(self) -> dict[str, Any]:
        with self._lock:
            return {
                "status": "ready",
                "model_loaded": self._active_model is not None,
                "active_model": (
                    dict(self._active_model)
                    if self._active_model is not None
                    else None
                ),
                "loaded_at": self._loaded_at,
            }

    def load_model(self, name: str) -> dict[str, Any]:
        models = self._registry.list_models()

        manifest = next(
            (model for model in models if model["name"] == name),
            None,
        )

        if manifest is None:
            raise RuntimeManagerError(
                code="model_not_found",
                message=f"No registered Slickk model named '{name}'.",
                status_code=404,
            )

        if not self._bridge_script.exists():
            raise RuntimeManagerError(
                code="inference_bridge_missing",
                message=(
                    "The Slickk Node inference bridge was not found."
                ),
                status_code=500,
            )

        model_state = {
            "name": manifest["name"],
            "display_name": manifest.get(
                "display_name",
                manifest["name"],
            ),
            "format": "onnx-q4",
            "engine": "slickk-transformers-js",
            "context_length": manifest.get("context_length"),
            "mode": "cpu-on-demand",
        }

        with self._lock:
            self._active_model = model_state
            self._loaded_at = datetime.now(
                timezone.utc
            ).isoformat()

            return self.state()

    def unload_model(self) -> dict[str, Any]:
        with self._lock:
            self._active_model = None
            self._loaded_at = None
            return self.state()

    def generate(
        self,
        prompt: str,
        max_new_tokens: int = 96,
    ) -> dict[str, Any]:
        with self._lock:
            active_model = (
                dict(self._active_model)
                if self._active_model is not None
                else None
            )

        if active_model is None:
            raise RuntimeManagerError(
                code="model_not_loaded",
                message="Load a Slickk model before generating text.",
                status_code=503,
            )

        request = {
            "prompt": prompt,
            "max_new_tokens": max_new_tokens,
        }

        try:
            result = subprocess.run(
                [
                    "node",
                    str(self._bridge_script),
                ],
                input=json.dumps(request),
                text=True,
                capture_output=True,
                cwd=self._bridge_directory,
                timeout=300,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeManagerError(
                code="node_not_found",
                message="Node.js was not found on the system PATH.",
                status_code=500,
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeManagerError(
                code="generation_timeout",
                message="Slickk generation exceeded 300 seconds.",
                status_code=504,
            ) from exc

        if result.returncode != 0:
            error_message = result.stderr.strip()

            try:
                error_payload = json.loads(error_message)
                error_message = error_payload.get(
                    "error",
                    error_message,
                )
            except json.JSONDecodeError:
                pass

            raise RuntimeManagerError(
                code="inference_failed",
                message=error_message or "Local inference failed.",
                status_code=500,
            )

        try:
            response = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeManagerError(
                code="invalid_inference_response",
                message=(
                    "The inference bridge returned invalid JSON."
                ),
                status_code=500,
            ) from exc

        return {
            "id": (
                "slickk-"
                + datetime.now(timezone.utc).strftime(
                    "%Y%m%d%H%M%S%f"
                )
            ),
            "object": "text_generation",
            "model": active_model["name"],
            "text": response.get("text", ""),
            "backend": response.get("backend"),
            "usage": {
                "max_new_tokens": response.get(
                    "max_new_tokens",
                    max_new_tokens,
                )
            },
        }
