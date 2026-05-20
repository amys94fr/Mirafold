"""Génération et cache de miniatures."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps

from .config import THUMB_SIZE, thumb_dir
from .hashing import open_image_safe


def thumb_path(photo_id: int) -> Path:
    return thumb_dir() / f"{photo_id}.webp"


def ensure_thumb(photo_id: int, source_path: str | Path) -> Path:
    out = thumb_path(photo_id)
    if out.exists():
        return out
    img = open_image_safe(source_path)
    img = ImageOps.fit(img, (THUMB_SIZE, THUMB_SIZE), Image.Resampling.LANCZOS)
    img.save(out, format="WEBP", quality=82, method=4)
    return out


def delete_thumb(photo_id: int) -> None:
    p = thumb_path(photo_id)
    if p.exists():
        try:
            p.unlink()
        except OSError:
            pass
