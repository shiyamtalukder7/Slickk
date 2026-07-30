"""Persistent local inference management for Slickk."""

import atexit
import json
import subprocess
from collections.abc import Iterator
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
    """Manage the active model and persistent inference worker."""

    def __init__(self, manifests_directory: Path) -> None:
        self._registry = ModelRegistry(manifests_directory)
        self._lock = RLock()

        self._active_model: dict[str, Any] | None = None
        self._loaded_at: str | None = None
        self._worker: subprocess.Popen[str] | None = None

        self._project_root = manifests_directory.resolve().parent
        self._worker_directory = (
            self._project_root / "tools" / "slickk-wasm"
        )
        self._worker_script = (
            self._worker_directory / "persistent-worker.mjs"
        )

        atexit.register(self._shutdown_worker)

    def state(self) -> dict[str, Any]:
        """Return the current runtime state."""

        with self._lock:
            worker_running = (
                self._worker is not None
                and self._worker.poll() is None
            )

            return {
                "status": "ready",
                "model_loaded": self._active_model is not None,
                "worker_running": worker_running,
                "active_model": (
                    dict(self._active_model)
                    if self._active_model is not None
                    else None
                ),
                "loaded_at": self._loaded_at,
            }

    def _start_worker(self) -> dict[str, Any]:
        """Start the persistent Node inference worker."""

        if not self._worker_script.exists():
            raise RuntimeManagerError(
                code="worker_missing",
                message=(
                    "The persistent inference worker was not found at "
                    f"{self._worker_script}"
                ),
                status_code=500,
            )

        if self._worker is not None:
            if self._worker.poll() is None:
                return {
                    "event": "ready",
                    "backend": "transformers-js-onnx-cpu",
                }

            self._worker = None

        try:
            self._worker = subprocess.Popen(
                [
                    "node",
                    str(self._worker_script),
                ],
                cwd=self._worker_directory,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                bufsize=1,
            )
        except FileNotFoundError as exc:
            raise RuntimeManagerError(
                code="node_not_found",
                message=(
                    "Node.js was not found. Confirm that the node "
                    "command works in PowerShell."
                ),
                status_code=500,
            ) from exc
        except OSError as exc:
            raise RuntimeManagerError(
                code="worker_start_failed",
                message=f"Could not start the inference worker: {exc}",
                status_code=500,
            ) from exc

        if self._worker.stdout is None:
            self._shutdown_worker()

            raise RuntimeManagerError(
                code="worker_output_missing",
                message="The inference worker has no output stream.",
                status_code=500,
            )

        ready_line = self._worker.stdout.readline()

        if not ready_line:
            error_message = self._read_worker_error()
            self._shutdown_worker()

            raise RuntimeManagerError(
                code="worker_startup_failed",
                message=(
                    error_message
                    or "The inference worker stopped during startup."
                ),
                status_code=500,
            )

        try:
            ready_payload = json.loads(ready_line)
        except json.JSONDecodeError as exc:
            self._shutdown_worker()

            raise RuntimeManagerError(
                code="invalid_worker_startup_response",
                message=(
                    "The inference worker returned invalid startup JSON."
                ),
                status_code=500,
            ) from exc

        if ready_payload.get("event") != "ready":
            error_message = ready_payload.get(
                "error",
                "The inference worker did not become ready.",
            )

            self._shutdown_worker()

            raise RuntimeManagerError(
                code="worker_not_ready",
                message=str(error_message),
                status_code=500,
            )

        return ready_payload

    def _read_worker_error(self) -> str:
        """Read worker stderr after the process has stopped."""

        worker = self._worker

        if worker is None or worker.stderr is None:
            return ""

        if worker.poll() is None:
            return ""

        return worker.stderr.read().strip()

    def _shutdown_worker(self) -> None:
        """Stop the persistent worker safely."""

        worker = self._worker
        self._worker = None

        if worker is None:
            return

        if worker.poll() is None:
            try:
                if worker.stdin is not None:
                    worker.stdin.write(
                        json.dumps({"command": "shutdown"}) + "\n"
                    )
                    worker.stdin.flush()
            except (BrokenPipeError, OSError):
                pass

            try:
                worker.wait(timeout=5)
            except subprocess.TimeoutExpired:
                worker.terminate()

                try:
                    worker.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    worker.kill()
                    worker.wait(timeout=3)

        for stream in (
            worker.stdin,
            worker.stdout,
            worker.stderr,
        ):
            if stream is not None:
                try:
                    stream.close()
                except OSError:
                    pass

    def load_model(self, name: str) -> dict[str, Any]:
        """Load a registered model and start its worker."""

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

        with self._lock:
            worker_info = self._start_worker()

            self._active_model = {
                "name": manifest["name"],
                "display_name": manifest.get(
                    "display_name",
                    manifest["name"],
                ),
                "format": "onnx-q4",
                "engine": "transformers-js",
                "backend": worker_info.get(
                    "backend",
                    "transformers-js-onnx-cpu",
                ),
                "context_length": manifest.get("context_length"),
                "mode": "persistent-local-cpu-inference",
            }

            self._loaded_at = datetime.now(
                timezone.utc
            ).isoformat()

            return self.state()

    def unload_model(self) -> dict[str, Any]:
        """Unload the active model and stop the worker."""

        with self._lock:
            self._shutdown_worker()
            self._active_model = None
            self._loaded_at = None

            return self.state()

    def generate(
        self,
        prompt: str,
        max_new_tokens: int = 96,
    ) -> dict[str, Any]:
        """Generate a complete response using the persistent worker."""

        self._validate_generation_input(
            prompt,
            max_new_tokens,
        )

        max_new_tokens = min(max(max_new_tokens, 1), 256)

        with self._lock:
            worker = self._require_worker()

            if worker.stdin is None or worker.stdout is None:
                raise RuntimeManagerError(
                    code="worker_stream_missing",
                    message=(
                        "The inference worker communication stream "
                        "is unavailable."
                    ),
                    status_code=500,
                )

            request_payload = {
                "prompt": prompt.strip(),
                "max_new_tokens": max_new_tokens,
                "stream": False,
            }

            try:
                worker.stdin.write(
                    json.dumps(request_payload) + "\n"
                )
                worker.stdin.flush()

                response_line = worker.stdout.readline()
            except (BrokenPipeError, OSError) as exc:
                raise RuntimeManagerError(
                    code="worker_communication_failed",
                    message=(
                        "Communication with the local inference "
                        "worker failed."
                    ),
                    status_code=500,
                ) from exc

            if not response_line:
                error_message = self._read_worker_error()

                raise RuntimeManagerError(
                    code="worker_stopped",
                    message=(
                        error_message
                        or "The local inference worker stopped."
                    ),
                    status_code=500,
                )

            try:
                result = json.loads(response_line)
            except json.JSONDecodeError as exc:
                raise RuntimeManagerError(
                    code="invalid_worker_response",
                    message=(
                        "The inference worker returned invalid JSON."
                    ),
                    status_code=500,
                ) from exc

            if result.get("ok") is not True:
                raise RuntimeManagerError(
                    code="local_inference_failed",
                    message=str(
                        result.get(
                            "error",
                            "Local inference failed.",
                        )
                    ),
                    status_code=500,
                )

            generated_text = result.get("text")

            if not isinstance(generated_text, str):
                raise RuntimeManagerError(
                    code="missing_generated_text",
                    message=(
                        "The inference worker did not return text."
                    ),
                    status_code=500,
                )

            if self._active_model is None:
                raise RuntimeManagerError(
                    code="model_not_loaded",
                    message="No active model is available.",
                    status_code=503,
                )

            return {
                "object": "text_completion",
                "model": self._active_model["name"],
                "text": generated_text,
                "backend": result.get(
                    "backend",
                    "transformers-js-onnx-cpu",
                ),
                "persistent_worker": True,
                "max_new_tokens": max_new_tokens,
            }

    def generate_stream(
        self,
        prompt: str,
        max_new_tokens: int = 96,
    ) -> Iterator[dict[str, Any]]:
        """Generate text incrementally using the persistent worker."""

        self._validate_generation_input(
            prompt,
            max_new_tokens,
        )

        max_new_tokens = min(max(max_new_tokens, 1), 256)

        with self._lock:
            worker = self._require_worker()

            if worker.stdin is None or worker.stdout is None:
                raise RuntimeManagerError(
                    code="worker_stream_missing",
                    message=(
                        "The inference worker communication stream "
                        "is unavailable."
                    ),
                    status_code=500,
                )

            request_id = (
                f"slickk-stream-"
                f"{datetime.now(timezone.utc).timestamp()}"
            )

            request_payload = {
                "id": request_id,
                "prompt": prompt.strip(),
                "max_new_tokens": max_new_tokens,
                "stream": True,
            }

            try:
                worker.stdin.write(
                    json.dumps(request_payload) + "\n"
                )
                worker.stdin.flush()
            except (BrokenPipeError, OSError) as exc:
                raise RuntimeManagerError(
                    code="worker_communication_failed",
                    message=(
                        "Communication with the local inference "
                        "worker failed."
                    ),
                    status_code=500,
                ) from exc

            while True:
                response_line = worker.stdout.readline()

                if not response_line:
                    error_message = self._read_worker_error()

                    raise RuntimeManagerError(
                        code="worker_stopped",
                        message=(
                            error_message
                            or "The local inference worker stopped."
                        ),
                        status_code=500,
                    )

                try:
                    result = json.loads(response_line)
                except json.JSONDecodeError as exc:
                    raise RuntimeManagerError(
                        code="invalid_worker_response",
                        message=(
                            "The inference worker returned invalid JSON."
                        ),
                        status_code=500,
                    ) from exc

                event = result.get("event")

                if event == "chunk":
                    text = result.get("text", "")

                    if isinstance(text, str) and text:
                        yield {
                            "event": "chunk",
                            "id": result.get(
                                "id",
                                request_id,
                            ),
                            "text": text,
                        }

                    continue

                if event == "done" and result.get("ok") is True:
                    active_model = self._active_model

                    if active_model is None:
                        raise RuntimeManagerError(
                            code="model_not_loaded",
                            message=(
                                "The active model became unavailable."
                            ),
                            status_code=503,
                        )

                    yield {
                        "event": "done",
                        "id": result.get(
                            "id",
                            request_id,
                        ),
                        "model": active_model["name"],
                        "backend": result.get(
                            "backend",
                            "transformers-js-onnx-cpu",
                        ),
                        "max_new_tokens": result.get(
                            "max_new_tokens",
                            max_new_tokens,
                        ),
                    }

                    break

                if result.get("ok") is False:
                    raise RuntimeManagerError(
                        code="local_streaming_failed",
                        message=str(
                            result.get(
                                "error",
                                "Local streaming inference failed.",
                            )
                        ),
                        status_code=500,
                    )

    def _validate_generation_input(
        self,
        prompt: str,
        max_new_tokens: int,
    ) -> None:
        """Validate common generation arguments."""

        if not isinstance(prompt, str) or not prompt.strip():
            raise RuntimeManagerError(
                code="prompt_required",
                message="Provide a non-empty prompt.",
                status_code=400,
            )

        if isinstance(max_new_tokens, bool) or not isinstance(
            max_new_tokens,
            int,
        ):
            raise RuntimeManagerError(
                code="invalid_max_new_tokens",
                message="max_new_tokens must be an integer.",
                status_code=400,
            )

    def _require_worker(self) -> subprocess.Popen[str]:
        """Return the active worker or raise a structured error."""

        if self._active_model is None:
            raise RuntimeManagerError(
                code="model_not_loaded",
                message="Load a Slickk model before generating text.",
                status_code=503,
            )

        worker = self._worker

        if worker is None or worker.poll() is not None:
            raise RuntimeManagerError(
                code="worker_not_running",
                message=(
                    "The persistent inference worker is not running. "
                    "Unload and reload the model."
                ),
                status_code=503,
            )

        return worker