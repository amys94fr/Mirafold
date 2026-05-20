"""Pilote Chromium headless sur le Vite dev server pour capturer une demo GIF.

Pré-requis : sidecar Python (127.0.0.1:8765) et Vite (5173) déjà lancés.

Usage :
    python scripts/record_demo.py            # version avec photos visibles
    python scripts/record_demo.py --blur     # version anonymisée pour README public
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

BLUR_CSS = """
/* Vignettes du sidecar = src vers /photos/<id>/thumb. On floute uniquement celles-ci. */
img[src*='/photos/'][src*='/thumb'] {
  filter: blur(14px) saturate(1.4) contrast(1.1) !important;
}
/* Aperçus circulaires de visages dans la sidebar Visages */
aside img[src*='/photos/'] {
  filter: blur(10px) saturate(1.4) !important;
}
/* Lightbox full-size */
img[src*='/photos/'][src*='/full'] {
  filter: blur(20px) saturate(1.4) !important;
}
"""

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "screenshots"
OUT_DIR.mkdir(parents=True, exist_ok=True)
FRAMES_DIR = OUT_DIR / "_frames"
FRAMES_DIR.mkdir(exist_ok=True)


def shot(page, name: str, delay: float = 0.6) -> Path:
    page.wait_for_load_state("networkidle", timeout=8000)
    time.sleep(delay)  # laisse Tailwind animer + images charger
    out = FRAMES_DIR / f"{name}.png"
    page.screenshot(path=str(out), full_page=False, type="png")
    print(f"  captured {out.name}")
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--blur",
        action="store_true",
        help="Floute les vignettes des photos (pour README public).",
    )
    parser.add_argument(
        "--locale",
        default="en",
        choices=["en", "fr"],
        help="Force la langue de l'UI (défaut: en).",
    )
    args = parser.parse_args()

    frames: list[Path] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--force-color-profile=srgb"],
        )
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 800},
            color_scheme="dark",
            device_scale_factor=1.0,
        )
        page = ctx.new_page()
        # Force la langue avant le boot de React
        page.add_init_script(
            f"try {{ localStorage.setItem('mirafold:locale', '{args.locale}'); }} catch (e) {{}}"
        )
        page.goto("http://localhost:5173/library", wait_until="domcontentloaded")
        page.wait_for_selector("img", timeout=10000)
        if args.blur:
            page.add_style_tag(content=BLUR_CSS)
            # Vérifier que le filtre est bien appliqué avant la première capture
            applied = page.evaluate(
                "() => { const i = document.querySelector(\"img[src*='/photos/'][src*='/thumb']\"); return i ? getComputedStyle(i).filter : null; }"
            )
            print(f"  blur applied: {applied!r}")
        time.sleep(2.0)  # initial photo load

        # Sélecteurs i18n-agnostiques : on cible le radiogroup library.group par position
        group_radios = 'div[role="radiogroup"] > button[role="radio"]'

        # 1. Library default
        frames.append(shot(page, "01-library"))

        # 2. Group by year (index 2: none=0, folder=1, year=2)
        page.locator(group_radios).nth(2).click()
        frames.append(shot(page, "02-library-year"))

        # 3. Scroll into second section
        page.evaluate("window.scrollTo({top: 600, behavior: 'instant'})")
        frames.append(shot(page, "03-library-year-scroll"))

        # 4. Country (index 5)
        page.locator(group_radios).nth(5).click()
        time.sleep(0.8)
        frames.append(shot(page, "04-library-country"))

        # 5. Camera brand (index 6)
        page.locator(group_radios).nth(6).click()
        time.sleep(0.8)
        frames.append(shot(page, "05-library-camera-make"))

        # 6. Duplicates
        page.locator('a[href="/duplicates"]').click()
        page.wait_for_selector("img, section", timeout=15000)
        time.sleep(2.0)
        frames.append(shot(page, "06-duplicates"))

        # 7. Faces
        page.locator('a[href="/faces"]').click()
        page.wait_for_selector("aside button img, aside button svg", timeout=15000)
        time.sleep(2.0)
        frames.append(shot(page, "07-faces"))

        # Click second cluster
        clusters = page.locator("aside button").all()
        if len(clusters) > 1:
            clusters[1].click()
            page.wait_for_load_state("networkidle", timeout=8000)
            time.sleep(2.0)
            frames.append(shot(page, "08-faces-cluster"))

        # 9. Search
        page.locator('a[href="/search"]').click()
        page.wait_for_selector('input[type="text"]', timeout=8000)
        time.sleep(1.0)
        frames.append(shot(page, "09-search-empty"))

        # 10. Type query
        search = page.locator('input[type="text"]')
        search.click()
        search_query = (
            "family with cake" if args.locale == "en" else "famille avec gâteau"
        )
        search.type(search_query, delay=60)
        frames.append(shot(page, "10-search-typed", delay=0.3))
        page.keyboard.press("Enter")
        # Attendre que des résultats apparaissent (présence du badge %)
        try:
            page.wait_for_selector(
                'span:text-matches("\\d+%")',
                timeout=60000,
            )
        except Exception:
            pass
        time.sleep(4.0)  # marge pour le rendu des thumbs
        frames.append(shot(page, "11-search-results", delay=1.0))

        browser.close()

    # Stitch into GIF
    print(f"\nAssembling GIF from {len(frames)} frames...")
    images: list[Image.Image] = []
    for f in frames:
        im = Image.open(f).convert("P", palette=Image.Palette.ADAPTIVE, colors=256)
        images.append(im)

    out_gif = OUT_DIR / ("demo.gif" if args.blur else "demo-raw.gif")
    images[0].save(
        out_gif,
        save_all=True,
        append_images=images[1:],
        duration=1500,   # 1.5s per frame
        loop=0,
        optimize=True,
        disposal=2,
    )
    size_kb = out_gif.stat().st_size / 1024
    print(f"\n[OK] GIF written: {out_gif} ({size_kb:.0f} KB, {len(images)} frames)")


if __name__ == "__main__":
    main()
