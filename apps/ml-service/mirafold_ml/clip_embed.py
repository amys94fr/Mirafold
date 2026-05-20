"""Recherche sémantique via OpenCLIP (ViT-B-32)."""
from __future__ import annotations

import os
import shutil
import struct
from pathlib import Path
from typing import Callable

import numpy as np

from . import db
from .config import model_cache_dir
from .hashing import open_image_safe

_model = None
_preprocess = None
_tokenizer = None
_device = "cpu"


def _fix_hf_symlinks(cache_root: Path) -> None:
    """Sur Windows non-admin, les symlinks HF sont créés mais cassés.

    Cette fonction parcourt les snapshots/ et remplace chaque symlink cassé
    par une copie du blob réel.
    """
    if os.name != "nt":
        return
    if not cache_root.exists():
        return
    for repo_dir in cache_root.iterdir():
        if not repo_dir.is_dir() or not repo_dir.name.startswith("models--"):
            continue
        snapshots = repo_dir / "snapshots"
        if not snapshots.exists():
            continue
        for snap in snapshots.iterdir():
            if not snap.is_dir():
                continue
            for entry in snap.iterdir():
                try:
                    if entry.is_symlink() and not entry.exists():
                        target = Path(os.readlink(entry))
                        if not target.is_absolute():
                            target = (entry.parent / target).resolve(strict=False)
                        if target.exists():
                            entry.unlink()
                            shutil.copy2(target, entry)
                except OSError:
                    continue


def _ensure_model() -> bool:
    """Charge le modèle CLIP. Retourne False si non disponible."""
    global _model, _preprocess, _tokenizer
    if _model is not None:
        return True
    try:
        import open_clip
        import torch

        os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
        cache_path = model_cache_dir()
        os_cache = str(cache_path)
        _fix_hf_symlinks(cache_path)
        _model, _, preprocess = open_clip.create_model_and_transforms(
            "ViT-B-32",
            pretrained="laion2b_s34b_b79k",
            cache_dir=os_cache,
        )
        _model.eval()
        _model = _model.to(_device)
        _preprocess = preprocess
        _tokenizer = open_clip.get_tokenizer("ViT-B-32")
        torch.set_num_threads(max(1, (torch.get_num_threads() or 4) // 2))
        return True
    except Exception as e:
        import logging

        logging.warning("CLIP unavailable: %s", e)
        return False


def is_available() -> bool:
    return _ensure_model()


def _to_blob(vec: np.ndarray) -> bytes:
    vec = vec.astype(np.float32).flatten()
    return struct.pack(f"{len(vec)}f", *vec.tolist())


def _from_blob(blob: bytes) -> np.ndarray:
    n = len(blob) // 4
    return np.array(struct.unpack(f"{n}f", blob), dtype=np.float32)


def embed_image(path: str) -> np.ndarray | None:
    if not _ensure_model():
        return None
    import torch

    img = open_image_safe(path)
    x = _preprocess(img).unsqueeze(0).to(_device)
    with torch.no_grad():
        feat = _model.encode_image(x)
        feat = feat / feat.norm(dim=-1, keepdim=True)
    return feat.cpu().numpy()[0].astype(np.float32)


def embed_text(text: str) -> np.ndarray | None:
    if not _ensure_model():
        return None
    import torch

    tokens = _tokenizer([text]).to(_device)
    with torch.no_grad():
        feat = _model.encode_text(tokens)
        feat = feat / feat.norm(dim=-1, keepdim=True)
    return feat.cpu().numpy()[0].astype(np.float32)


def _store(photo_id: int, vec: np.ndarray) -> None:
    if db.has_vec():
        db.get().execute(
            "INSERT OR REPLACE INTO clip_vec(photo_id, embedding) VALUES (?, ?)",
            (photo_id, _to_blob(vec)),
        )
    else:
        db.get().execute(
            "INSERT OR REPLACE INTO clip_vec_fallback(photo_id, embedding) VALUES (?, ?)",
            (photo_id, _to_blob(vec)),
        )
    db.get().execute(
        "UPDATE photos SET has_clip_embedding=1 WHERE id=?", (photo_id,)
    )


def embed_missing(
    on_tick: Callable[[str | None, int, bool], None] | None = None,
    cancel: Callable[[], bool] | None = None,
) -> None:
    if not _ensure_model():
        return
    cur = db.get().execute(
        "SELECT id, path FROM photos WHERE has_clip_embedding = 0"
    )
    rows = cur.fetchall()
    for r in rows:
        if cancel and cancel():
            break
        try:
            vec = embed_image(r["path"])
            if vec is not None:
                _store(r["id"], vec)
                if on_tick:
                    on_tick(r["path"], 1, False)
            elif on_tick:
                on_tick(r["path"], 1, True)
        except Exception:
            if on_tick:
                on_tick(r["path"], 1, True)


def search(query: str, limit: int = 60) -> list[dict]:
    if not _ensure_model():
        return []
    vec = embed_text(query)
    if vec is None:
        return []

    if db.has_vec():
        rows = db.get().execute(
            """
            SELECT photo_id, distance
            FROM clip_vec
            WHERE embedding MATCH ?
              AND k = ?
            ORDER BY distance
            """,
            (_to_blob(vec), limit),
        ).fetchall()
        results = []
        for r in rows:
            p = db.get().execute(
                "SELECT id, path, filename, size_bytes, width, height, taken_at, "
                "indexed_at, phash, has_clip_embedding, "
                "(SELECT COUNT(*) FROM faces WHERE photo_id = photos.id) AS face_count "
                "FROM photos WHERE id = ?",
                (r["photo_id"],),
            ).fetchone()
            if p:
                # Convertir distance L2 (vec normalisé) en score [0,1] approximatif
                # cos_sim = 1 - dist^2 / 2 pour vecteurs normalisés
                d = r["distance"]
                score = max(0.0, 1.0 - (d * d) / 2.0)
                results.append({"photo": dict(p), "score": float(score)})
        return results
    else:
        # Fallback : produit scalaire en Python (lent mais marche)
        rows = db.get().execute(
            "SELECT photo_id, embedding FROM clip_vec_fallback"
        ).fetchall()
        scored: list[tuple[float, int]] = []
        for r in rows:
            other = _from_blob(r["embedding"])
            score = float(np.dot(vec, other))
            scored.append((score, r["photo_id"]))
        scored.sort(reverse=True)
        scored = scored[:limit]
        results = []
        for score, pid in scored:
            p = db.get().execute(
                "SELECT id, path, filename, size_bytes, width, height, taken_at, "
                "indexed_at, phash, has_clip_embedding, "
                "(SELECT COUNT(*) FROM faces WHERE photo_id = photos.id) AS face_count "
                "FROM photos WHERE id = ?",
                (pid,),
            ).fetchone()
            if p:
                results.append({"photo": dict(p), "score": max(0.0, score)})
        return results
