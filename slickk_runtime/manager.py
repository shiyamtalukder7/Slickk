"""Model lifecycle management for the Slickk native runtime."""

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

        model_state = {
            "name": manifest["name"],
            "display_name": manifest.get(
                "display_name",
                manifest["name"],
            ),
            "format": manifest["model_format"],
            "engine": manifest["runtime"]["engine"],
            "context_length": manifest.get("context_length"),
            "mode": "metadata-only",
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

    def generate(self, prompt: str) -> dict[str, Any]:
        with self._lock:
            if self._active_model is None:
                raise RuntimeManagerError(
                    code="model_not_loaded",
                    message="Load a Slickk model before generating text.",
                    status_code=503,
                )

        raise RuntimeManagerError(
            code="native_engine_pending",
            message=(
                "The model lifecycle is active, but the native "
                "transformer execution engine is not implemented yet."
            ),
            status_code=501,
        )
