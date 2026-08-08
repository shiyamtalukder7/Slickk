"""Run the Slickk Universal Tutor Brain HTTP API."""

from __future__ import annotations

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from slickk_server.brain_api import (
    create_default_application,
    create_http_server,
)


def main() -> None:
    """Start the local tutor-brain service."""

    host = os.environ.get(
        "SLICKK_BRAIN_HOST",
        "127.0.0.1",
    )

    port = int(
        os.environ.get(
            "SLICKK_BRAIN_PORT",
            "11436",
        )
    )

    data_directory = Path(
        os.environ.get(
            "SLICKK_BRAIN_DATA",
            str(
                PROJECT_ROOT
                / "tmp"
                / "brain_api"
            ),
        )
    )

    application = create_default_application(
        data_directory
    )

    server = create_http_server(
        application,
        host=host,
        port=port,
    )

    print()
    print("SLICKK UNIVERSAL TUTOR BRAIN API")
    print(f"Listening: http://{host}:{port}")
    print(f"Data: {data_directory.resolve()}")
    print("Health: /health")
    print("Press Ctrl+C to stop.")
    print()

    try:
        server.serve_forever(
            poll_interval=0.25
        )
    except KeyboardInterrupt:
        print("\nStopping tutor-brain API...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
