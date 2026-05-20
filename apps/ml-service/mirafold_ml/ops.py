"""Opérations sur les photos : suppression (corbeille) et renommage en lot."""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from send2trash import send2trash

from . import db
from .thumbnails import delete_thumb


def delete_photos(ids: list[int], permanent: bool = False) -> tuple[int, list[str]]:
    deleted = 0
    errors: list[str] = []
    for pid in ids:
        row = db.get().execute(
            "SELECT path FROM photos WHERE id = ?", (pid,)
        ).fetchone()
        if row is None:
            continue
        path = row["path"]
        try:
            if Path(path).exists():
                if permanent:
                    Path(path).unlink()
                else:
                    send2trash(path)
            db.get().execute("DELETE FROM photos WHERE id = ?", (pid,))
            delete_thumb(pid)
            deleted += 1
        except Exception as e:
            errors.append(f"{path}: {e}")
    return deleted, errors


_TOKEN_RE = re.compile(r"\{(\w+)\}")


def _render_template(template: str, idx: int, photo: dict) -> str:
    """Tokens supportés :
      {n}    : numéro séquentiel (1-based, zéro-paddé)
      {n:N}  : numéro séquentiel zéro-paddé à N chiffres
      {date} : date de prise (YYYY-MM-DD) ou indexation
      {orig} : nom original sans extension
    """

    def repl(m: re.Match[str]) -> str:
        token = m.group(1)
        if token == "n":
            return f"{idx:04d}"
        if token == "date":
            ts = photo.get("taken_at") or photo.get("indexed_at")
            if ts:
                try:
                    return datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime(
                        "%Y-%m-%d"
                    )
                except Exception:
                    return ""
            return ""
        if token == "orig":
            return Path(photo["path"]).stem
        return m.group(0)

    return _TOKEN_RE.sub(repl, template)


def rename_photos(ids: list[int], template: str) -> tuple[int, list[str]]:
    renamed = 0
    errors: list[str] = []
    for idx, pid in enumerate(ids, start=1):
        row = db.get().execute(
            "SELECT id, path, filename, taken_at, indexed_at FROM photos WHERE id = ?",
            (pid,),
        ).fetchone()
        if row is None:
            continue
        d = dict(row)
        src = Path(d["path"])
        if not src.exists():
            errors.append(f"{src}: not found")
            continue
        new_stem = _render_template(template, idx, d).strip()
        if not new_stem:
            errors.append(f"{src}: empty name")
            continue
        # Nettoyer caractères interdits Windows
        new_stem = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", new_stem)
        dst = src.with_name(f"{new_stem}{src.suffix}")
        if dst == src:
            continue
        # Éviter collision
        if dst.exists():
            base = dst.stem
            for i in range(1, 9999):
                candidate = dst.with_name(f"{base}-{i}{src.suffix}")
                if not candidate.exists():
                    dst = candidate
                    break
        try:
            src.rename(dst)
            db.get().execute(
                "UPDATE photos SET path = ?, filename = ? WHERE id = ?",
                (str(dst), dst.name, pid),
            )
            renamed += 1
        except Exception as e:
            errors.append(f"{src}: {e}")
    return renamed, errors
