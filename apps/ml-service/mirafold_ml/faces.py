"""Reconnaissance faciale via OpenCV (YuNet detection + SFace embedding 512D).

Aucune dépendance native lourde : tout passe par opencv-python (wheel Windows pur).
Les modèles ONNX sont téléchargés depuis l'OpenCV Zoo au premier usage.
"""
from __future__ import annotations

import struct
import urllib.request
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

from . import db
from .config import model_cache_dir
from .hashing import open_image_safe

_YUNET_URL = (
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/"
    "models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
)
_SFACE_URL = (
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/"
    "models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
)
_MIN_SIZE_BYTES = 100_000  # garde-fou contre les pointeurs LFS et redirects HTML

_detector = None
_recognizer = None


def _download(url: str, dest: Path) -> None:
    if dest.exists():
        if dest.stat().st_size >= _MIN_SIZE_BYTES:
            return
        dest.unlink()  # fichier corrompu/pointeur LFS, retélécharge
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as r, tmp.open("wb") as f:
        while chunk := r.read(64 * 1024):
            f.write(chunk)
    if tmp.stat().st_size < _MIN_SIZE_BYTES:
        tmp.unlink()
        raise RuntimeError(
            f"Downloaded file too small ({tmp.stat().st_size} B) from {url}, "
            "likely a Git LFS pointer or redirect HTML"
        )
    tmp.rename(dest)


def _ensure_model() -> bool:
    global _detector, _recognizer
    if _detector is not None and _recognizer is not None:
        return True
    try:
        cache = model_cache_dir() / "opencv"
        yunet = cache / "face_detection_yunet_2023mar.onnx"
        sface = cache / "face_recognition_sface_2021dec.onnx"
        _download(_YUNET_URL, yunet)
        _download(_SFACE_URL, sface)

        _detector = cv2.FaceDetectorYN_create(
            str(yunet),
            "",
            (320, 320),
            score_threshold=0.65,
            nms_threshold=0.3,
            top_k=5000,
        )
        _recognizer = cv2.FaceRecognizerSF_create(str(sface), "")
        return True
    except Exception as e:
        import logging

        logging.warning("Face models unavailable: %s", e)
        return False


def is_available() -> bool:
    return _ensure_model()


def _to_blob(vec: np.ndarray) -> bytes:
    vec = vec.astype(np.float32).flatten()
    return struct.pack(f"{len(vec)}f", *vec.tolist())


def _from_blob(blob: bytes) -> np.ndarray:
    n = len(blob) // 4
    return np.array(struct.unpack(f"{n}f", blob), dtype=np.float32)


def _normalize(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    return vec / norm if norm > 0 else vec


def detect_and_embed(path: str) -> list[tuple[tuple[float, float, float, float], np.ndarray]]:
    if not _ensure_model():
        return []

    pil = open_image_safe(path)
    arr = np.array(pil)[..., ::-1].copy()  # PIL RGB -> BGR contigu pour OpenCV
    h, w = arr.shape[:2]

    _detector.setInputSize((w, h))
    _, dets = _detector.detect(arr)
    if dets is None:
        return []

    out: list[tuple[tuple[float, float, float, float], np.ndarray]] = []
    for face in dets:
        x, y, bw, bh = float(face[0]), float(face[1]), float(face[2]), float(face[3])
        aligned = _recognizer.alignCrop(arr, face)
        emb = _recognizer.feature(aligned).flatten().astype(np.float32)
        out.append(((x, y, bw, bh), _normalize(emb)))
    return out


def process_missing(
    on_tick: Callable[[str | None, int, bool], None] | None = None,
    cancel: Callable[[], bool] | None = None,
) -> None:
    if not _ensure_model():
        return
    cur = db.get().execute(
        """
        SELECT p.id, p.path FROM photos p
        LEFT JOIN faces f ON f.photo_id = p.id
        WHERE f.id IS NULL
        GROUP BY p.id
        """
    )
    rows = cur.fetchall()
    for r in rows:
        if cancel and cancel():
            break
        try:
            faces_data = detect_and_embed(r["path"])
            for idx, (bbox, emb) in enumerate(faces_data):
                fcur = db.get().execute(
                    """
                    INSERT INTO faces(photo_id, face_index, bbox_x, bbox_y, bbox_w, bbox_h)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (r["id"], idx, bbox[0], bbox[1], bbox[2], bbox[3]),
                )
                face_id = fcur.lastrowid
                if db.has_vec():
                    db.get().execute(
                        "INSERT OR REPLACE INTO face_vec(face_id, embedding) VALUES (?, ?)",
                        (face_id, _to_blob(emb)),
                    )
                else:
                    db.get().execute(
                        "INSERT OR REPLACE INTO face_vec_fallback(face_id, embedding) VALUES (?, ?)",
                        (face_id, _to_blob(emb)),
                    )
            if on_tick:
                on_tick(r["path"], 1, False)
        except Exception as e:
            import logging
            logging.warning("face_detect failed on %s: %s", r["path"], e)
            if on_tick:
                on_tick(r["path"], 1, True)

    cluster_faces()


def cluster_faces(
    distance_threshold: float = 0.32,
    min_cluster_size: int = 3,
) -> None:
    """Regroupe les visages via Agglomerative Clustering (linkage average, distance cosinus).

    Pourquoi pas DBSCAN : l'effet de chaînage agglutine tous les visages flous/de profil
    dans un méga-cluster. Le clustering hiérarchique average-linkage est robuste à ça.

    distance_threshold = 0.32 ⇒ même personne si distance cosinus moyenne < 0.32
    (équivalent à cosine sim > 0.68, calibré pour SFace).
    min_cluster_size : on jette les clusters de moins de N visages (bruit).
    """
    try:
        from sklearn.cluster import AgglomerativeClustering
    except Exception:
        return

    if db.has_vec():
        rows = db.get().execute(
            "SELECT face_id, embedding FROM face_vec"
        ).fetchall()
    else:
        rows = db.get().execute(
            "SELECT face_id, embedding FROM face_vec_fallback"
        ).fetchall()

    if len(rows) < min_cluster_size:
        return

    face_ids = [r["face_id"] for r in rows]
    vecs = np.stack([_from_blob(r["embedding"]) for r in rows])

    alg = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=distance_threshold,
        metric="cosine",
        linkage="average",
    )
    raw_labels = alg.fit_predict(vecs)

    # Filtrer les clusters trop petits (bruit)
    from collections import Counter
    counts = Counter(int(l) for l in raw_labels)
    valid = {lbl for lbl, n in counts.items() if n >= min_cluster_size}
    labels = np.array(
        [int(l) if int(l) in valid else -1 for l in raw_labels],
        dtype=np.int64,
    )

    db.get().execute("DELETE FROM face_clusters")
    db.get().execute("UPDATE faces SET cluster_id = NULL")

    unique_labels = sorted({int(l) for l in labels if l >= 0})
    label_to_cluster: dict[int, int] = {}
    for lbl in unique_labels:
        cur = db.get().execute(
            "INSERT INTO face_clusters(label) VALUES (NULL)"
        )
        if cur.lastrowid is not None:
            label_to_cluster[lbl] = int(cur.lastrowid)

    for fid, lbl in zip(face_ids, labels):
        if lbl < 0:
            continue
        cluster_id = label_to_cluster.get(int(lbl))
        if cluster_id is not None:
            db.get().execute(
                "UPDATE faces SET cluster_id = ? WHERE id = ?",
                (cluster_id, fid),
            )


def list_clusters() -> list[dict]:
    rows = db.get().execute(
        """
        SELECT
          c.id AS cluster_id,
          c.label,
          COUNT(f.id) AS face_count,
          (SELECT photo_id FROM faces WHERE cluster_id = c.id LIMIT 1) AS preview_photo_id,
          (SELECT json_array(bbox_x, bbox_y, bbox_w, bbox_h)
             FROM faces WHERE cluster_id = c.id LIMIT 1) AS preview_face_box
        FROM face_clusters c
        LEFT JOIN faces f ON f.cluster_id = c.id
        GROUP BY c.id
        HAVING face_count > 0
        ORDER BY face_count DESC
        """
    ).fetchall()
    import json as _json

    out = []
    for r in rows:
        d = dict(r)
        if d.get("preview_face_box"):
            try:
                d["preview_face_box"] = _json.loads(d["preview_face_box"])
            except Exception:
                d["preview_face_box"] = None
        out.append(d)
    return out


def photos_in_cluster(cluster_id: int) -> list[dict]:
    rows = db.get().execute(
        """
        SELECT DISTINCT p.id, p.path, p.filename, p.size_bytes, p.width, p.height,
               p.taken_at, p.indexed_at, p.phash, p.has_clip_embedding,
               (SELECT COUNT(*) FROM faces WHERE photo_id = p.id) AS face_count
        FROM photos p
        INNER JOIN faces f ON f.photo_id = p.id
        WHERE f.cluster_id = ?
        ORDER BY p.taken_at DESC, p.id DESC
        """,
        (cluster_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def rename_cluster(cluster_id: int, label: str) -> None:
    db.get().execute(
        "UPDATE face_clusters SET label = ? WHERE id = ?",
        (label.strip() or None, cluster_id),
    )


def search_by_face(photo_id: int, face_index: int, limit: int = 60) -> list[dict]:
    row = db.get().execute(
        "SELECT id FROM faces WHERE photo_id = ? AND face_index = ?",
        (photo_id, face_index),
    ).fetchone()
    if row is None:
        return []
    face_id = row["id"]

    if db.has_vec():
        emb_row = db.get().execute(
            "SELECT embedding FROM face_vec WHERE face_id = ?", (face_id,)
        ).fetchone()
    else:
        emb_row = db.get().execute(
            "SELECT embedding FROM face_vec_fallback WHERE face_id = ?",
            (face_id,),
        ).fetchone()

    if emb_row is None:
        return []
    query_vec = _from_blob(emb_row["embedding"])

    if db.has_vec():
        rows = db.get().execute(
            """
            SELECT face_id, distance FROM face_vec
            WHERE embedding MATCH ? AND k = ?
            ORDER BY distance
            """,
            (_to_blob(query_vec), limit * 3),
        ).fetchall()
        face_scores = [(r["face_id"], 1.0 - (r["distance"] ** 2) / 2.0) for r in rows]
    else:
        rows = db.get().execute(
            "SELECT face_id, embedding FROM face_vec_fallback"
        ).fetchall()
        scored = [(r["face_id"], float(np.dot(query_vec, _from_blob(r["embedding"])))) for r in rows]
        scored.sort(key=lambda x: -x[1])
        face_scores = scored[: limit * 3]

    seen_photos: set[int] = set()
    results: list[dict] = []
    for fid, score in face_scores:
        pf = db.get().execute(
            "SELECT photo_id FROM faces WHERE id = ?", (fid,)
        ).fetchone()
        if pf is None:
            continue
        pid = pf["photo_id"]
        if pid in seen_photos:
            continue
        seen_photos.add(pid)
        p = db.get().execute(
            "SELECT id, path, filename, size_bytes, width, height, taken_at, "
            "indexed_at, phash, has_clip_embedding, "
            "(SELECT COUNT(*) FROM faces WHERE photo_id = photos.id) AS face_count "
            "FROM photos WHERE id = ?",
            (pid,),
        ).fetchone()
        if p:
            results.append({"photo": dict(p), "score": max(0.0, float(score))})
        if len(results) >= limit:
            break
    return results
