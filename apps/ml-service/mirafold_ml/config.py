"""Configuration et chemins de Mirafold."""
from __future__ import annotations

import os
from pathlib import Path


def data_dir() -> Path:
    """Dossier de données utilisateur (Windows AppData)."""
    base = os.environ.get("MIRAFOLD_DATA_DIR")
    if base:
        p = Path(base)
    elif os.name == "nt":
        appdata = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
        p = Path(appdata or Path.home()) / "Mirafold"
    else:
        p = Path.home() / ".local" / "share" / "mirafold"
    p.mkdir(parents=True, exist_ok=True)
    return p


def db_path() -> Path:
    return data_dir() / "library.db"


def thumb_dir() -> Path:
    p = data_dir() / "thumbs"
    p.mkdir(parents=True, exist_ok=True)
    return p


def model_cache_dir() -> Path:
    p = data_dir() / "models"
    p.mkdir(parents=True, exist_ok=True)
    return p


SUPPORTED_EXTS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".gif",
    ".heic",
    ".heif",
}

THUMB_SIZE = 320
DUPLICATE_HAMMING_BITS = 64  # 8x8 phash
DEFAULT_SIMILARITY_THRESHOLD = 0.95
