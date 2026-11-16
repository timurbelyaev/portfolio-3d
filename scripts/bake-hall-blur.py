"""Bake the blurred backdrop of the hero hall: public/hero/hall-blur.webp.

The gilded frame (with its transparent opening) is painted over with the
surrounding wall, so the backdrop never shows a second, ghost frame at a
different scale than the sharp one. Then the photo is shrunk, blurred and
washed slightly towards the haze so text on top of it stays readable. The
browser stretches it to the screen; at this size the upscale stays smooth.

    python scripts/bake-hall-blur.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT: Path = Path(__file__).resolve().parent.parent
SRC: Path = ROOT / "public" / "hero" / "hall.png"
OUT: Path = ROOT / "public" / "hero" / "hall-blur.webp"

GROUND: tuple[int, int, int] = (238, 222, 206)
# Frame box in photo pixels (HALL.frame in src/world/story.js) plus its shadow.
FRAME: tuple[int, int, int, int] = (855 - 30, 155 - 30, 1615 + 40, 728 + 40)
WIDTH: int = 480
BLUR: float = 5.0
WASH: float = 0.15


def fill_hole(img: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    """Push-pull fill: blur repeatedly, keeping known pixels, until the box is
    a smooth continuation of the wall around it."""
    keep: Image.Image = Image.new("L", img.size, 255)
    ImageDraw.Draw(keep).rectangle(box, fill=0)
    out: Image.Image = img.copy()
    for radius in (24, 16, 12, 8, 6, 4, 3, 2) * 3:
        out = Image.composite(img, out.filter(ImageFilter.GaussianBlur(radius)), keep)
    return out


def main() -> None:
    photo: Image.Image = Image.open(SRC).convert("RGBA")
    flat: Image.Image = Image.new("RGBA", photo.size, GROUND + (255,))
    flat.alpha_composite(photo)
    height: int = round(WIDTH * photo.height / photo.width)
    k: float = WIDTH / photo.width
    small: Image.Image = flat.convert("RGB").resize((WIDTH, height), Image.LANCZOS)
    box: tuple[int, int, int, int] = tuple(round(v * k) for v in FRAME)  # type: ignore[assignment]
    small = fill_hole(small, box)
    # Blur twice at reduced strength: closer to a true gaussian at this radius.
    soft: Image.Image = small.filter(ImageFilter.GaussianBlur(BLUR / 1.4)).filter(ImageFilter.GaussianBlur(BLUR / 1.4))
    washed: Image.Image = Image.blend(soft, Image.new("RGB", soft.size, GROUND), WASH)
    washed.save(OUT, "WEBP", quality=82, method=6)
    print(OUT, washed.size, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
