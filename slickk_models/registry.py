"""Slickk model discovery and manifest validation."""

import json
from pathlib import Path
from typing import Any


class ModelRegistryError(Exception):
    """Raised when a Slickk model manifest is invalid."""


class ModelRegistry:
    def __init__(self, manifests_directory: Path) -> None:
        self.manifests_directory = manifests_directory

    def list_models(self) -> list[dict[str, Any]]:
        if not self.manifests_directory.exists():
            return []

        models: list[dict[str, Any]] = []

        for manifest_path in sorted(
            self.manifests_directory.glob("*.json")
        ):
            models.append(self.load_manifest(manifest_path))

        return models

    def load_manifest(self, manifest_path: Path) -> dict[str, Any]:
        try:
            data = json.loads(
                manifest_path.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError) as exc:
            raise ModelRegistryError(
                f"Unable to read manifest: {manifest_path}"
            ) from exc

        required_fields = {
            "format_version",
            "name",
            "architecture",
            "model_format",
            "runtime",
        }

        missing = required_fields.difference(data)

        if missing:
            missing_text = ", ".join(sorted(missing))
            raise ModelRegistryError(
                f"Manifest is missing fields: {missing_text}"
            )

        data["_manifest_path"] = str(manifest_path)
        return data
