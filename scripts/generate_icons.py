"""Génère les icônes Tauri pour Mirafold depuis un fichier source PNG.

Source attendue : scripts/source-icon.png (idéalement 1024×1024 ou plus, fond transparent).
Sortie : apps/desktop/src-tauri/icons/{32x32,128x128,128x128@2x,icon}.png + icon.ico + icon.icns
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts" / "source-icon.png"
ICON_DIR = ROOT / "apps" / "desktop" / "src-tauri" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)

LOGO_FRONTEND = ROOT / "apps" / "desktop" / "public" / "logo.png"


def resize(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    if not SOURCE.exists():
        print(
            f"ERREUR : place ton logo à {SOURCE} (PNG, fond transparent, carré, 1024+ recommandé)",
            file=sys.stderr,
        )
        sys.exit(1)

    src = Image.open(SOURCE).convert("RGBA")
    if src.width != src.height:
        side = min(src.width, src.height)
        left = (src.width - side) // 2
        top = (src.height - side) // 2
        src = src.crop((left, top, left + side, top + side))

    sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
    }
    for name, size in sizes.items():
        resize(src, size).save(ICON_DIR / name, optimize=True)

    ico = resize(src, 256)
    ico.save(
        ICON_DIR / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    resize(src, 1024).save(ICON_DIR / "icon.icns")

    LOGO_FRONTEND.parent.mkdir(parents=True, exist_ok=True)
    resize(src, 256).save(LOGO_FRONTEND, optimize=True)

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(f"[OK] Icones Tauri regenerees dans {ICON_DIR}")
    print(f"[OK] Logo frontend copie a {LOGO_FRONTEND}")


if __name__ == "__main__":
    main()
