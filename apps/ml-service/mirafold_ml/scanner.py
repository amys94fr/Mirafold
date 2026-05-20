"""Scan filesystem : indexe les photos d'un ou plusieurs dossiers racines."""
from __future__ import annotations

import os
import threading
from pathlib import Path

from . import db, progress
from .config import SUPPORTED_EXTS
from .exif import extract_camera, extract_gps, extract_taken_at
from .hashing import compute_hashes
from .thumbnails import ensure_thumb


def list_roots() -> list[str]:
    cur = db.get().execute("SELECT path FROM library_roots ORDER BY path")
    return [r["path"] for r in cur.fetchall()]


def add_root(path: str) -> None:
    p = Path(path).resolve()
    if not p.is_dir():
        raise ValueError(f"Not a directory: {path}")
    db.get().execute(
        "INSERT OR IGNORE INTO library_roots(path) VALUES (?)", (str(p),)
    )


def remove_root(path: str) -> None:
    db.get().execute("DELETE FROM library_roots WHERE path = ?", (str(Path(path).resolve()),))


def _walk_files(roots: list[str]) -> list[Path]:
    out: list[Path] = []
    for root in roots:
        try:
            for dirpath, _dirs, files in os.walk(root):
                for name in files:
                    ext = Path(name).suffix.lower()
                    if ext in SUPPORTED_EXTS:
                        out.append(Path(dirpath) / name)
        except OSError:
            continue
    return out


def _index_one(path: Path) -> int | None:
    """Indexe une photo. Retourne l'id ou None en cas d'erreur."""
    try:
        st = path.stat()
    except OSError:
        return None

    cur = db.get().execute(
        "SELECT id, mtime, size_bytes FROM photos WHERE path = ?", (str(path),)
    )
    row = cur.fetchone()
    if row is not None and row["mtime"] == st.st_mtime and row["size_bytes"] == st.st_size:
        return row["id"]  # déjà à jour

    try:
        phash, dhash, w, h = compute_hashes(path)
    except Exception:
        return None

    taken_at = extract_taken_at(path)
    gps = extract_gps(path)
    lat, lon = (gps[0], gps[1]) if gps else (None, None)
    cam_make, cam_model = extract_camera(path)

    if row is None:
        cur = db.get().execute(
            """
            INSERT INTO photos(path, filename, size_bytes, mtime, width, height, taken_at,
                               lat, lon, camera_make, camera_model, phash, dhash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (str(path), path.name, st.st_size, st.st_mtime, w, h, taken_at,
             lat, lon, cam_make, cam_model, phash, dhash),
        )
        photo_id = cur.lastrowid
    else:
        photo_id = row["id"]
        db.get().execute(
            """
            UPDATE photos
            SET filename=?, size_bytes=?, mtime=?, width=?, height=?, taken_at=?,
                lat=?, lon=?, camera_make=?, camera_model=?, phash=?, dhash=?,
                has_clip_embedding=0
            WHERE id=?
            """,
            (path.name, st.st_size, st.st_mtime, w, h, taken_at, lat, lon,
             cam_make, cam_model, phash, dhash, photo_id),
        )
        db.get().execute(
            "DELETE FROM faces WHERE photo_id=?", (photo_id,)
        )

    try:
        ensure_thumb(int(photo_id), path)
    except Exception:
        pass

    return int(photo_id) if photo_id is not None else None


_scan_thread: threading.Thread | None = None


def is_running() -> bool:
    return _scan_thread is not None and _scan_thread.is_alive()


def _geocode_pending() -> None:
    rows = db.get().execute(
        "SELECT id, lat, lon FROM photos WHERE lat IS NOT NULL AND city IS NULL"
    ).fetchall()
    if not rows:
        return
    from .geocoding import reverse_batch

    coords = [(r["lat"], r["lon"]) for r in rows]
    results = reverse_batch(coords)
    for r, res in zip(rows, results):
        if res is None:
            continue
        city, country = res
        db.get().execute(
            "UPDATE photos SET city=?, country=? WHERE id=?",
            (city, country, r["id"]),
        )


def start_scan(full: bool = False) -> None:
    global _scan_thread
    if is_running():
        return

    def _run() -> None:
        try:
            roots = list_roots()
            files = _walk_files(roots)
            progress.start(total=len(files))

            for path in files:
                if progress.cancel_requested():
                    break
                photo_id = _index_one(path)
                progress.tick(str(path), processed_delta=1, error=photo_id is None)

            _geocode_pending()

            progress.set_status("embedding")
            from . import clip_embed

            clip_missing = db.get().execute(
                "SELECT COUNT(*) AS c FROM photos WHERE has_clip_embedding = 0"
            ).fetchone()["c"]
            progress.reset_phase(total=clip_missing)
            clip_embed.embed_missing(progress.tick, progress.cancel_requested)

            progress.set_status("faces")
            from . import faces

            faces_missing = db.get().execute(
                """
                SELECT COUNT(*) AS c FROM photos p
                LEFT JOIN faces f ON f.photo_id = p.id
                WHERE f.id IS NULL
                """
            ).fetchone()["c"]
            progress.reset_phase(total=faces_missing)
            faces.process_missing(progress.tick, progress.cancel_requested)

            progress.set_status("done")
            progress.finish()
        except Exception:
            import traceback

            traceback.print_exc()
            progress.finish(error=True)

    _scan_thread = threading.Thread(target=_run, name="mirafold-scan", daemon=True)
    _scan_thread.start()
