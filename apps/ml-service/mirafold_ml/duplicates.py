"""Détection de doublons et photos similaires via pHash."""
from __future__ import annotations

from collections import defaultdict
from typing import Iterable

import imagehash

from . import db
from .config import DUPLICATE_HAMMING_BITS


def _hex_to_int(h: str) -> int:
    return int(h, 16)


def _bucket(h: int, prefix_bits: int = 16) -> int:
    """Bucket sur les N bits de poids fort pour clustering rapide."""
    return h >> (DUPLICATE_HAMMING_BITS - prefix_bits)


def find_groups(threshold: float = 0.95) -> list[dict]:
    """Retourne les groupes de photos similaires au-dessus du seuil.

    Approche : bucket sur le préfixe du pHash, puis comparaison Hamming
    exhaustive intra-bucket. Pour des bibliothèques < 100k photos c'est suffisant.
    """
    max_distance = max(0, int(round((1.0 - threshold) * DUPLICATE_HAMMING_BITS)))

    rows = db.get().execute(
        "SELECT id, path, filename, size_bytes, width, height, taken_at, "
        "indexed_at, phash, "
        "(SELECT COUNT(*) FROM faces WHERE faces.photo_id = photos.id) AS face_count "
        "FROM photos WHERE phash IS NOT NULL"
    ).fetchall()

    buckets: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        d = dict(r)
        d["_hash_int"] = _hex_to_int(d["phash"])
        d["_hash_obj"] = imagehash.hex_to_hash(d["phash"])
        # Bucket large : on prend plusieurs préfixes voisins pour couvrir les bords
        buckets[_bucket(d["_hash_int"])].append(d)

    visited: set[int] = set()
    groups: list[dict] = []

    flat = [d for bucket in buckets.values() for d in bucket]
    by_id = {d["id"]: d for d in flat}

    # Union-find simple pour fusionner les groupes
    parent: dict[int, int] = {d["id"]: d["id"] for d in flat}

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for bucket in buckets.values():
        for i in range(len(bucket)):
            a = bucket[i]
            for j in range(i + 1, len(bucket)):
                b = bucket[j]
                dist = a["_hash_obj"] - b["_hash_obj"]
                if dist <= max_distance:
                    union(a["id"], b["id"])

    # Regrouper
    components: dict[int, list[dict]] = defaultdict(list)
    for d in flat:
        components[find(d["id"])].append(d)

    for root, members in components.items():
        if len(members) < 2:
            continue
        # Référence = plus grande résolution, sinon plus gros fichier
        members.sort(
            key=lambda m: (
                -((m.get("width") or 0) * (m.get("height") or 0)),
                -m["size_bytes"],
            )
        )
        ref_hash = members[0]["_hash_obj"]
        worst = max((m["_hash_obj"] - ref_hash) for m in members[1:]) if len(members) > 1 else 0
        sim = 1.0 - (worst / DUPLICATE_HAMMING_BITS)
        groups.append(
            {
                "group_id": f"g{root}",
                "similarity": round(sim, 4),
                "photos": [_clean(m) for m in members],
            }
        )
        visited.update(m["id"] for m in members)

    groups.sort(key=lambda g: -len(g["photos"]))
    return groups


def _clean(row: dict) -> dict:
    return {
        "id": row["id"],
        "path": row["path"],
        "filename": row["filename"],
        "size_bytes": row["size_bytes"],
        "width": row.get("width"),
        "height": row.get("height"),
        "taken_at": row.get("taken_at"),
        "indexed_at": row.get("indexed_at"),
        "phash": row.get("phash"),
        "has_clip_embedding": bool(row.get("has_clip_embedding", 0)),
        "face_count": row.get("face_count", 0),
    }
