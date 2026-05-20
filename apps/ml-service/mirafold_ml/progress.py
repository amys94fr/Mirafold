"""État de progression du scan, partagé entre threads."""
from __future__ import annotations

import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Literal

ScanStatus = Literal[
    "idle", "scanning", "hashing", "embedding", "faces", "done", "error"
]


@dataclass
class ScanProgress:
    status: ScanStatus = "idle"
    total_files: int = 0
    processed: int = 0
    current_path: str | None = None
    errors: int = 0
    started_at: str | None = None
    finished_at: str | None = None
    cancel_requested: bool = field(default=False, repr=False)

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("cancel_requested", None)
        return d


_state = ScanProgress()
_lock = threading.Lock()


def snapshot() -> dict:
    with _lock:
        return _state.to_dict()


def start(total: int = 0) -> None:
    with _lock:
        _state.status = "scanning"
        _state.total_files = total
        _state.processed = 0
        _state.errors = 0
        _state.current_path = None
        _state.started_at = datetime.now(timezone.utc).isoformat()
        _state.finished_at = None
        _state.cancel_requested = False


def set_status(status: ScanStatus) -> None:
    with _lock:
        _state.status = status


def set_total(n: int) -> None:
    with _lock:
        _state.total_files = n


def reset_phase(total: int) -> None:
    """Réinitialise le compteur pour une nouvelle phase (CLIP, faces, etc.)."""
    with _lock:
        _state.total_files = total
        _state.processed = 0
        _state.current_path = None


def tick(current: str | None, processed_delta: int = 1, error: bool = False) -> None:
    with _lock:
        _state.processed += processed_delta
        if error:
            _state.errors += 1
        _state.current_path = current


def finish(error: bool = False) -> None:
    with _lock:
        _state.status = "error" if error else "done"
        _state.finished_at = datetime.now(timezone.utc).isoformat()
        _state.current_path = None


def request_cancel() -> None:
    with _lock:
        _state.cancel_requested = True


def cancel_requested() -> bool:
    with _lock:
        return _state.cancel_requested
