"""
Generate every icon and splash image the EUNOCURA mobile shell needs.

Run from `frontend/`:
    python tools/make_icons.py

Writes:
  public/icons/*.png|svg         -> web manifest / PWA / favicon
  android/app/src/main/res/**    -> launcher icon + adaptive icon + splash

The mark is the same one the web header uses (a heart), drawn from the
parametric heart curve so every size is crisp instead of a scaled bitmap.
Brand ramp: primary-700 #0369a1 -> primary-600 #0284c7 -> primary-400 #38bdf8.
"""

from __future__ import annotations

import math
import os
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent                      # frontend/
PUBLIC_ICONS = ROOT / "public" / "icons"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"

# Brand ramp pulled from tailwind.config.js `primary`.
BRAND_TOP = (3, 105, 161)      # #0369a1  primary-700
BRAND_MID = (2, 132, 199)      # #0284c7  primary-600
BRAND_BOTTOM = (56, 189, 248)  # #38bdf8  primary-400
INK = (255, 255, 255)


def _lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size: int) -> Image.Image:
    """Diagonal three-stop ramp, cached per size by the caller."""
    img = Image.new("RGB", (size, size), BRAND_MID)
    px = img.load()
    for y in range(size):
        for x in range(size):
            # Project onto the diagonal so the light comes from the top left.
            t = (x + y) / (2 * (size - 1)) if size > 1 else 0
            if t < 0.5:
                px[x, y] = _lerp(BRAND_TOP, BRAND_MID, t * 2)
            else:
                px[x, y] = _lerp(BRAND_MID, BRAND_BOTTOM, (t - 0.5) * 2)
    return img


def heart_polygon(cx: float, cy: float, scale: float, steps: int = 720):
    """Parametric heart, flipped so it points down like a real heart glyph."""
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * scale / 16.0, cy - y * scale / 16.0))
    return pts


def draw_mark(canvas: Image.Image, scale_factor: float = 1.0, colour=INK, opacity=255):
    """Paste a white heart, sized as a fraction of the canvas."""
    size = canvas.width
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    # The heart curve spans roughly -16..16 in x and -17..13 in y; the /16
    # normalisation plus this factor leaves a comfortable optical margin.
    span = size * 0.52 * scale_factor
    cx, cy = size / 2.0, size * 0.50
    draw.polygon(heart_polygon(cx, cy, span), fill=colour + (opacity,))
    canvas.alpha_composite(layer)
    return canvas


def rounded_mask(size: int, radius_ratio: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=int(size * radius_ratio), fill=255
    )
    return mask


def app_icon(size: int, radius_ratio: float | None = 0.225) -> Image.Image:
    """Full-bleed icon: gradient plate + white heart. radius_ratio=None = square."""
    plate = gradient(size).convert("RGBA")
    if radius_ratio:
        plate.putalpha(rounded_mask(size, radius_ratio))
    return draw_mark(plate)


def maskable_icon(size: int) -> Image.Image:
    """Maskable: full-bleed gradient with the heart inside the 40% safe zone."""
    return draw_mark(gradient(size).convert("RGBA"), scale_factor=0.68)


def adaptive_foreground(size: int) -> Image.Image:
    """Android adaptive foreground: transparent, art inside the 66dp safe zone."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # 66/108 of the canvas is the guaranteed-visible area; 0.72 keeps the heart
    # a touch inside it so circle/squircle masks never clip the lobes.
    return draw_mark(layer, scale_factor=0.72)


def adaptive_foreground_mono(size: int) -> Image.Image:
    """Themed-icon variant: same geometry, no gradient, tinted by the launcher."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    return draw_mark(layer, scale_factor=0.72)


def solid(colour, size: int):
    return Image.new("RGBA", (size, size), colour + (255,))


def splash(width: int, height: int) -> Image.Image:
    """Brand plate with the heart centred; Android scales this with CENTER_CROP."""
    plate = gradient(max(width, height)).resize((width, height), Image.LANCZOS)
    canvas = plate.convert("RGBA")
    mark_size = int(min(width, height) * 0.42)
    layer = Image.new("RGBA", (mark_size, mark_size), (0, 0, 0, 0))
    draw_mark(layer, scale_factor=0.95)
    canvas.alpha_composite(
        layer, ((width - mark_size) // 2, (height - mark_size) // 2)
    )
    return canvas


def soft_glow(size: int) -> Image.Image:
    """Radial falloff used behind the splash heart so the plate is not flat."""
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    steps = 60
    for i in range(steps, 0, -1):
        r = int(size * 0.5 * i / steps)
        alpha = int(38 * (1 - i / steps) ** 1.6)
        draw.ellipse(
            (size // 2 - r, size // 2 - r, size // 2 + r, size // 2 + r),
            fill=(255, 255, 255, alpha),
        )
    return glow.filter(ImageFilter.GaussianBlur(size // 48))


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="EUNOCURA">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0369a1"/>
      <stop offset="0.5" stop-color="#0284c7"/>
      <stop offset="1" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="115" fill="url(#g)"/>
  <path fill="#fff" d="M256 402c-9 0-17-3-23-9-24-21-101-91-101-158 0-45 33-79 76-79 24 0 40 12 48 24 8-12 24-24 48-24 43 0 76 34 76 79 0 67-77 137-101 158-6 6-14 9-23 9z"/>
</svg>
"""


def main() -> None:
    PUBLIC_ICONS.mkdir(parents=True, exist_ok=True)

    # --- web / PWA -------------------------------------------------------
    (PUBLIC_ICONS / "eunocura.svg").write_text(SVG, encoding="utf-8")
    app_icon(192).save(PUBLIC_ICONS / "icon-192.png", optimize=True)
    app_icon(512).save(PUBLIC_ICONS / "icon-512.png", optimize=True)
    app_icon(180, radius_ratio=None).save(PUBLIC_ICONS / "apple-touch-icon.png", optimize=True)
    maskable_icon(512).save(PUBLIC_ICONS / "maskable-512.png", optimize=True)
    app_icon(32, radius_ratio=None).save(PUBLIC_ICONS / "favicon-32.png", optimize=True)

    # --- android ---------------------------------------------------------
    if not ANDROID_RES.exists():
        print(f"android res not found at {ANDROID_RES}; skipping native icons")
        return

    mipmaps = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, size in mipmaps.items():
        target = ANDROID_RES / folder
        target.mkdir(parents=True, exist_ok=True)
        # Legacy launcher icon (pre-API 26): a rounded-square plate reads well
        # through the launchers that just draw the bitmap.
        icon = app_icon(size)
        icon.save(target / "ic_launcher.png", optimize=True)
        circle = app_icon(size, radius_ratio=0.5)
        circle.save(target / "ic_launcher_round.png", optimize=True)

    # Adaptive icon layers (API 26+). The foreground mipmap is 108dp, so the
    # sizes below are 1.5x the launcher density buckets.
    adaptives = {
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }
    for folder, size in adaptives.items():
        target = ANDROID_RES / folder
        target.mkdir(parents=True, exist_ok=True)
        adaptive_foreground(size).save(target / "ic_launcher_foreground.png", optimize=True)
        adaptive_foreground_mono(size).save(
            target / "ic_launcher_monochrome.png", optimize=True
        )

    # Adaptive background + splash colour live in colors.xml next to the theme
    # colours; a separate file with the same colour name would be a duplicate
    # resource error.
    colours = ANDROID_RES / "values"
    colours.mkdir(parents=True, exist_ok=True)
    stale = colours / "ic_launcher_background.xml"
    if stale.exists():
        stale.unlink()
    (colours / "colors.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="colorPrimary">#0284C7</color>\n'
        '    <color name="colorPrimaryDark">#0369A1</color>\n'
        '    <color name="colorAccent">#38BDF8</color>\n'
        '    <color name="ic_launcher_background">#0284C7</color>\n'
        '    <color name="splash_background">#0284C7</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )

    anydpi = ANDROID_RES / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    adaptive_xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n'
        "</adaptive-icon>\n"
    )
    (anydpi / "ic_launcher.xml").write_text(adaptive_xml, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(adaptive_xml, encoding="utf-8")

    # --- splash ----------------------------------------------------------
    drawable = ANDROID_RES / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)
    # Capacitor ships one plate per orientation bucket. Replacing all of them
    # keeps the launch screen identical on a tablet and a phone, and stops the
    # stock blue Capacitor logo from flashing before the app renders.
    splash_sizes = {
        "drawable": 1920,
        "drawable-port-mdpi": 320,
        "drawable-port-hdpi": 480,
        "drawable-port-xhdpi": 720,
        "drawable-port-xxhdpi": 960,
        "drawable-port-xxxhdpi": 1280,
        "drawable-land-mdpi": 480,
        "drawable-land-hdpi": 800,
        "drawable-land-xhdpi": 1280,
        "drawable-land-xxhdpi": 1600,
        "drawable-land-xxxhdpi": 1920,
    }
    for folder, px in splash_sizes.items():
        target = ANDROID_RES / folder
        target.mkdir(parents=True, exist_ok=True)
        if folder == "drawable":
            plate = splash(1920, 1920)
            glow = soft_glow(int(1920 * 0.7))
            plate.alpha_composite(glow, ((1920 - glow.width) // 2, (1920 - glow.height) // 2))
        else:
            # Portrait buckets are 2:3, landscape buckets are 3:2.
            landscape = "-land-" in folder
            w, h = (int(px * 1.5), px) if landscape else (px, int(px * 1.5))
            plate = splash(w, h)
            glow = soft_glow(int(min(w, h) * 0.7))
            plate.alpha_composite(glow, ((w - glow.width) // 2, (h - glow.height) // 2))
        plate.save(target / "splash.png", optimize=True)

    print("icons written:")
    for p in sorted(PUBLIC_ICONS.iterdir()):
        print(f"  public/icons/{p.name}  {p.stat().st_size // 1024}kB")
    print(f"  android mipmaps + {drawable / 'splash.png'}")


if __name__ == "__main__":
    main()
