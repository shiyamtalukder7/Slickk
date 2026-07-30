"""Diagnostic entry point for the Slickk native runtime."""

import json
import platform
import sys
from pathlib import Path

from slickk_models import ModelRegistry


def main() -> None:
    project_root = Path(__file__).resolve().parent.parent
    registry = ModelRegistry(project_root / "slickk_models")
    models = registry.list_models()

    report = {
        "name": "Slickk Native Runtime",
        "phase": 1,
        "status": "architecture-ready",
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "registered_models": [
            {
                "name": model["name"],
                "format": model["model_format"],
                "engine": model["runtime"]["engine"],
            }
            for model in models
        ],
    }

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
