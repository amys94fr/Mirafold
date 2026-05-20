"""FastAPI : surface HTTP du sidecar Mirafold sur 127.0.0.1:8765."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from . import db, duplicates, faces, ops, progress, scanner
from .clip_embed import search as clip_search
from .thumbnails import ensure_thumb


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init()
    yield


app = FastAPI(
    title="Mirafold ML Service",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(https?://localhost(:\d+)?|https?://127\.0\.0\.1(:\d+)?|tauri://localhost|https?://tauri\.localhost)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "version": "0.1.0"}


# ---------- Library roots ----------

class RootPayload(BaseModel):
    path: str


@app.get("/library/roots")
def get_roots() -> dict:
    return {"roots": scanner.list_roots()}


@app.post("/library/roots")
def add_root(payload: RootPayload) -> dict:
    try:
        scanner.add_root(payload.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@app.delete("/library/roots")
def remove_root(payload: RootPayload) -> dict:
    scanner.remove_root(payload.path)
    return {"ok": True}


# ---------- Scan ----------

class ScanStart(BaseModel):
    full: bool = False


@app.post("/scan/start")
def start_scan(payload: ScanStart = ScanStart()) -> dict:
    if payload.full:
        db.get().execute("UPDATE photos SET has_clip_embedding = 0")
        db.get().execute("DELETE FROM faces")
    scanner.start_scan(full=payload.full)
    return progress.snapshot()


@app.get("/scan/status")
def scan_status() -> dict:
    return progress.snapshot()


@app.post("/scan/cancel")
def cancel_scan() -> dict:
    progress.request_cancel()
    return {"ok": True}


@app.post("/photos/backfill_dates")
def backfill_dates() -> dict:
    """Extrait la date EXIF des photos qui en sont dépourvues. Rapide, sans recalculer hash/embeddings."""
    from .exif import extract_taken_at

    rows = db.get().execute(
        "SELECT id, path FROM photos WHERE taken_at IS NULL"
    ).fetchall()
    updated = 0
    for r in rows:
        date = extract_taken_at(r["path"])
        if date:
            db.get().execute(
                "UPDATE photos SET taken_at = ? WHERE id = ?", (date, r["id"])
            )
            updated += 1
    return {"updated": updated, "scanned": len(rows)}


@app.post("/photos/backfill_cameras")
def backfill_cameras() -> dict:
    """Extrait marque/modèle EXIF des photos sans appareil détecté."""
    from .exif import extract_camera

    rows = db.get().execute(
        "SELECT id, path FROM photos WHERE camera_make IS NULL AND camera_model IS NULL"
    ).fetchall()
    updated = 0
    for r in rows:
        make, model = extract_camera(r["path"])
        if make or model:
            db.get().execute(
                "UPDATE photos SET camera_make = ?, camera_model = ? WHERE id = ?",
                (make, model, r["id"]),
            )
            updated += 1
    return {"updated": updated, "scanned": len(rows)}


@app.post("/photos/backfill_gps")
def backfill_gps() -> dict:
    """Extrait les coordonnées GPS EXIF puis fait du reverse-geocoding offline."""
    from .exif import extract_gps
    from .geocoding import reverse_batch

    rows = db.get().execute(
        "SELECT id, path FROM photos WHERE lat IS NULL"
    ).fetchall()
    pending: list[tuple[int, float, float]] = []
    for r in rows:
        gps = extract_gps(r["path"])
        if gps is None:
            continue
        lat, lon = gps
        db.get().execute(
            "UPDATE photos SET lat=?, lon=? WHERE id=?", (lat, lon, r["id"])
        )
        pending.append((r["id"], lat, lon))

    if not pending:
        return {"scanned": len(rows), "with_gps": 0, "geocoded": 0}

    results = reverse_batch([(lat, lon) for _, lat, lon in pending])
    geocoded = 0
    for (pid, _, _), res in zip(pending, results):
        if res is None:
            continue
        city, country = res
        db.get().execute(
            "UPDATE photos SET city=?, country=? WHERE id=?",
            (city, country, pid),
        )
        geocoded += 1

    return {"scanned": len(rows), "with_gps": len(pending), "geocoded": geocoded}


# ---------- Photos ----------

@app.get("/photos")
def list_photos(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    query: str | None = None,
) -> dict:
    base = (
        "SELECT id, path, filename, size_bytes, width, height, taken_at, "
        "lat, lon, city, country, camera_make, camera_model, "
        "indexed_at, phash, has_clip_embedding, "
        "(SELECT COUNT(*) FROM faces WHERE photo_id = photos.id) AS face_count "
        "FROM photos"
    )
    args: list = []
    where = ""
    if query:
        where = " WHERE filename LIKE ? OR path LIKE ?"
        like = f"%{query}%"
        args = [like, like]

    total = db.get().execute(
        f"SELECT COUNT(*) AS c FROM photos{where}", args
    ).fetchone()["c"]

    rows = db.get().execute(
        f"{base}{where} ORDER BY indexed_at DESC, id DESC LIMIT ? OFFSET ?",
        [*args, limit, offset],
    ).fetchall()
    return {"photos": [dict(r) for r in rows], "total": total}


@app.get("/photos/{photo_id}/thumb")
def photo_thumb(photo_id: int):
    row = db.get().execute(
        "SELECT path FROM photos WHERE id = ?", (photo_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="photo not found")
    try:
        thumb = ensure_thumb(photo_id, row["path"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"thumb error: {e}")
    return FileResponse(thumb, media_type="image/webp")


@app.get("/photos/{photo_id}/full")
def photo_full(photo_id: int):
    row = db.get().execute(
        "SELECT path, filename FROM photos WHERE id = ?", (photo_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="photo not found")
    from pathlib import Path as _P
    p = _P(row["path"])
    if not p.exists():
        raise HTTPException(status_code=404, detail="file missing on disk")
    # Laisse FastAPI deviner le media-type via filename
    return FileResponse(p, filename=row["filename"])


class DeletePayload(BaseModel):
    ids: list[int]
    permanent: bool = False


@app.post("/photos/delete")
def delete_photos(payload: DeletePayload) -> dict:
    deleted, errors = ops.delete_photos(payload.ids, payload.permanent)
    return {"deleted": deleted, "errors": errors}


class RenamePayload(BaseModel):
    ids: list[int]
    template: str = Field(min_length=1, max_length=200)


@app.post("/photos/rename")
def rename_photos(payload: RenamePayload) -> dict:
    renamed, errors = ops.rename_photos(payload.ids, payload.template)
    return {"renamed": renamed, "errors": errors}


# ---------- Duplicates ----------

@app.get("/duplicates")
def get_duplicates(
    similarity: float = Query(default=0.95, ge=0.5, le=1.0),
) -> dict:
    return {"groups": duplicates.find_groups(threshold=similarity)}


# ---------- Faces ----------

class ClusterLabel(BaseModel):
    label: str


class FaceSearchPayload(BaseModel):
    photo_id: int
    face_index: int = 0


@app.get("/faces/clusters")
def list_face_clusters() -> dict:
    return {"clusters": faces.list_clusters()}


class ReclusterPayload(BaseModel):
    distance_threshold: float = Field(default=0.32, ge=0.1, le=0.8)
    min_cluster_size: int = Field(default=3, ge=2, le=20)


@app.post("/faces/recluster")
def recluster(payload: ReclusterPayload = ReclusterPayload()) -> dict:
    faces.cluster_faces(
        distance_threshold=payload.distance_threshold,
        min_cluster_size=payload.min_cluster_size,
    )
    return {"ok": True, "clusters": len(faces.list_clusters())}


@app.get("/faces/clusters/{cluster_id}/photos")
def photos_for_cluster(cluster_id: int) -> dict:
    return {"photos": faces.photos_in_cluster(cluster_id)}


@app.patch("/faces/clusters/{cluster_id}")
def rename_cluster(cluster_id: int, payload: ClusterLabel) -> dict:
    faces.rename_cluster(cluster_id, payload.label)
    return {"ok": True}


@app.post("/faces/search")
def face_search(payload: FaceSearchPayload) -> dict:
    return {"results": faces.search_by_face(payload.photo_id, payload.face_index)}


# ---------- Semantic search ----------

class SemanticQuery(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=60, ge=1, le=200)


@app.post("/search/semantic")
def semantic_search(payload: SemanticQuery) -> dict:
    return {"results": clip_search(payload.query, payload.limit)}


@app.exception_handler(Exception)
def all_errors(_req, exc: Exception):
    import traceback

    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )
