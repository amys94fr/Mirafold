"""Mirafold ML sidecar entry point.

Lancé par le shell Tauri ou manuellement via `pnpm run ml:dev`.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> None:
    import uvicorn

    host = os.environ.get("MIRAFOLD_HOST", "127.0.0.1")
    port = int(os.environ.get("MIRAFOLD_PORT", "8765"))

    uvicorn.run(
        "mirafold_ml.app:app",
        host=host,
        port=port,
        log_level=os.environ.get("MIRAFOLD_LOG", "info"),
        reload=False,
        access_log=False,
    )


if __name__ == "__main__":
    main()
