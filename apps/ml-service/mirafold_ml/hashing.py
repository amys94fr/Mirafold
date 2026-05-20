"""Perceptual hashing : pHash + dHash pour la détection de doublons et similaires."""
from __future__ import annotations

from pathlib import Path

import imagehash
from PIL import Image, ImageOps


def open_image_safe(path: str | Path) -> Image.Image:
    img = Image.open(path)
    img.draft("RGB", (1024, 1024))
    img = ImageOps.exif_transpose(img)
    return img.convert("RGB")


def compute_hashes(path: str | Path) -> tuple[str, str, int, int]:
    """Retourne (phash_hex, dhash_hex, width, height)."""
    img = open_image_safe(path)
    w, h = img.size
    p = imagehash.phash(img, hash_size=8)
    d = imagehash.dhash(img, hash_size=8)
    return str(p), str(d), w, h


def hamming(a: str, b: str) -> int:
    """Distance de Hamming entre deux hash hex (64 bits)."""
    ha = imagehash.hex_to_hash(a)
    hb = imagehash.hex_to_hash(b)
    return ha - hb


def similarity(hash_a: str, hash_b: str, bits: int = 64) -> float:
    return 1.0 - (hamming(hash_a, hash_b) / bits)
