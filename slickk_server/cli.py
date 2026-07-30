"""Command-line interface for Slickk."""

import argparse
import json
from pathlib import Path

from slickk_models import ModelRegistry
from slickk_server.diagnose import main as diagnose_main


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def list_models() -> None:
    registry = ModelRegistry(project_root() / "slickk_models")
    models = registry.list_models()

    output = [
        {
            "name": model["name"],
            "display_name": model.get("display_name", model["name"]),
            "format": model["model_format"],
            "engine": model["runtime"]["engine"],
            "context_length": model.get("context_length"),
        }
        for model in models
    ]

    print(json.dumps(output, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="slickk",
        description="Slickk native local AI runtime",
    )

    subcommands = parser.add_subparsers(dest="command")

    subcommands.add_parser(
        "diagnose",
        help="Check the Slickk runtime environment",
    )

    subcommands.add_parser(
        "models",
        help="List registered Slickk models",
    )

    arguments = parser.parse_args()

    if arguments.command == "diagnose":
        diagnose_main()
        return

    if arguments.command == "models":
        list_models()
        return

    parser.print_help()


if __name__ == "__main__":
    main()
