"""Command-line interface for Slickk."""

import argparse
import json
from pathlib import Path

from slickk_models import ModelRegistry
from slickk_server.diagnose import main as diagnose_main
from slickk_server.http_server import serve


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

    serve_parser = subcommands.add_parser(
        "serve",
        help="Start the Slickk local HTTP server",
    )

    serve_parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Server address",
    )

    serve_parser.add_argument(
        "--port",
        type=int,
        default=11435,
        help="Server port",
    )

    serve_parser.add_argument(
        "--model",
        default="slickk-edu-local",
        help="Registered model to load automatically",
    )

    arguments = parser.parse_args()

    if arguments.command == "diagnose":
        diagnose_main()
        return

    if arguments.command == "models":
        list_models()
        return

    if arguments.command == "serve":
        serve(
            arguments.host,
            arguments.port,
            arguments.model,
        )
        return

    parser.print_help()


if __name__ == "__main__":
    main()
