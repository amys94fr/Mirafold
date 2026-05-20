"""Couche SQLite avec sqlite-vec pour les embeddings vectoriels."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable

from .config import db_path

_CLIP_DIM = 512  # ViT-B-32 output
_FACE_DIM = 128  # OpenCV SFace output


_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS library_roots (
    path TEXT PRIMARY KEY,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    mtime REAL NOT NULL,
    width INTEGER,
    height INTEGER,
    taken_at TEXT,
    lat REAL,
    lon REAL,
    city TEXT,
    country TEXT,
    camera_make TEXT,
    camera_model TEXT,
    phash TEXT,
    dhash TEXT,
    has_clip_embedding INTEGER NOT NULL DEFAULT 0,
    indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_photos_phash ON photos(phash);
CREATE INDEX IF NOT EXISTS idx_photos_filename ON photos(filename);

CREATE TABLE IF NOT EXISTS faces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    face_index INTEGER NOT NULL,
    bbox_x REAL NOT NULL,
    bbox_y REAL NOT NULL,
    bbox_w REAL NOT NULL,
    bbox_h REAL NOT NULL,
    cluster_id INTEGER,
    UNIQUE(photo_id, face_index)
);

CREATE INDEX IF NOT EXISTS idx_faces_cluster ON faces(cluster_id);
CREATE INDEX IF NOT EXISTS idx_faces_photo ON faces(photo_id);

CREATE TABLE IF NOT EXISTS face_clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS clip_vec USING vec0(
    photo_id INTEGER PRIMARY KEY,
    embedding FLOAT[{_CLIP_DIM}]
);

CREATE VIRTUAL TABLE IF NOT EXISTS face_vec USING vec0(
    face_id INTEGER PRIMARY KEY,
    embedding FLOAT[{_FACE_DIM}]
);
"""


def _try_load_vec(conn: sqlite3.Connection) -> bool:
    try:
        import sqlite_vec  # type: ignore

        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        return True
    except Exception:
        return False


def _create_fallback_vec_tables(conn: sqlite3.Connection) -> None:
    """Tables de secours BLOB si sqlite-vec n'est pas dispo. Recherche vectorielle naïve."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS clip_vec_fallback (
            photo_id INTEGER PRIMARY KEY,
            embedding BLOB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS face_vec_fallback (
            face_id INTEGER PRIMARY KEY,
            embedding BLOB NOT NULL
        );
        """
    )


_initialized = False
_has_vec: bool = False


def has_vec() -> bool:
    return _has_vec


def _connect() -> sqlite3.Connection:
    p: Path = db_path()
    conn = sqlite3.connect(p, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


_MIGRATIONS = [
    "ALTER TABLE photos ADD COLUMN lat REAL",
    "ALTER TABLE photos ADD COLUMN lon REAL",
    "ALTER TABLE photos ADD COLUMN city TEXT",
    "ALTER TABLE photos ADD COLUMN country TEXT",
    "ALTER TABLE photos ADD COLUMN camera_make TEXT",
    "ALTER TABLE photos ADD COLUMN camera_model TEXT",
]


def _migrate(conn: sqlite3.Connection) -> None:
    for stmt in _MIGRATIONS:
        try:
            conn.execute(stmt)
        except sqlite3.OperationalError:
            pass  # colonne déjà présente


def init() -> sqlite3.Connection:
    """Initialise le schéma (idempotent) et tente de charger sqlite-vec."""
    global _initialized, _has_vec
    conn = _connect()
    _has_vec = _try_load_vec(conn)
    if _has_vec:
        conn.executescript(_SCHEMA)
    else:
        # Schema without vec tables
        schema_no_vec = _SCHEMA.split("CREATE VIRTUAL TABLE")[0]
        conn.executescript(schema_no_vec)
        _create_fallback_vec_tables(conn)
    _migrate(conn)
    _initialized = True
    return conn


_singleton: sqlite3.Connection | None = None


def get() -> sqlite3.Connection:
    global _singleton
    if _singleton is None:
        _singleton = init()
    elif _has_vec:
        # Reload extension into this connection if needed (per-thread connection later if needed)
        pass
    return _singleton


@contextmanager
def cursor():
    c = get().cursor()
    try:
        yield c
    finally:
        c.close()


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rows]
