"""Installer artwork for the NSIS and WiX (MSI) bundles.

Writes BMPs into src-tauri/installer/. Run from apps/desktop:
    python scripts/make-installer-art.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "src-tauri" / "installer"
ICON = HERE.parent / "src-tauri" / "icons" / "icon.png"

GRAPHITE = (22, 32, 42)
GRAPHITE_2 = (31, 43, 56)
BLUE = (58, 85, 201)
INK_2 = (159, 176, 192)
WHITE = (255, 255, 255)
LOOK = (255, 143, 143)

FONTS = Path("C:/Windows/Fonts")


def font(bold: bool, size: int) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(FONTS / name), size)


def mono(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / "consola.ttf"), size)


def graphite_panel(w: int, h: int) -> Image.Image:
    """Graphite with a soft blue light from the top right, like the app."""
    img = Image.new("RGB", (w, h), GRAPHITE)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = y / max(1, h - 1)
            base = [GRAPHITE_2[i] + (GRAPHITE[i] - GRAPHITE_2[i]) * t for i in range(3)]
            dx, dy = (x - w * 0.9) / w, (y - 0) / h
            glow = max(0.0, 1 - (dx * dx + dy * dy) ** 0.5 / 0.9) ** 2 * 0.55
            px[x, y] = tuple(int(base[i] + (BLUE[i] - base[i]) * glow) for i in range(3))
    return img


def logo(size: int) -> Image.Image:
    return Image.open(ICON).convert("RGBA").resize((size, size), Image.LANCZOS)


def address_lines(d: ImageDraw.ImageDraw, x: int, y: int, size: int) -> None:
    """A known address over its lookalike, differences in red."""
    f = mono(size)
    rows = [("0x28C6c0", "6298d514", "1d60"), ("0x28C6C0", "aaAAaAAA", "1d60")]
    for i, (a, mid, b) in enumerate(rows):
        cx = x
        for part, colour in ((a, INK_2), (mid, LOOK if i else INK_2), (b, INK_2)):
            d.text((cx, y + i * (size + 6)), part, font=f, fill=colour)
            cx += d.textlength(part, font=f)


def sidebar(w: int, h: int, top: int) -> Image.Image:
    img = graphite_panel(w, h)
    mark = logo(64)
    img.paste(mark, ((w - 64) // 2, top), mark)
    d = ImageDraw.Draw(img)
    title = "Kenning"
    f = font(True, 22)
    d.text(((w - d.textlength(title, font=f)) / 2, top + 76), title, font=f, fill=WHITE)
    tag = "Know what you copied."
    f2 = font(False, 12)
    d.text(((w - d.textlength(tag, font=f2)) / 2, top + 106), tag, font=f2, fill=INK_2)
    address_lines(d, 14, h - 52, 11)
    return img


def header(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), WHITE)
    mark = logo(h - 18)
    img.paste(mark, (w - (h - 18) - 9, 9), mark)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # NSIS: sidebar on the welcome and finish pages, header on the others.
    sidebar(164, 314, 70).save(OUT / "nsis-sidebar.bmp")
    header(150, 57).save(OUT / "nsis-header.bmp")
    # WiX: the dialog background (art on the left 164 px, text on the right)
    # and the banner across the top of the inner pages.
    dialog = Image.new("RGB", (493, 312), WHITE)
    dialog.paste(sidebar(164, 312, 70), (0, 0))
    dialog.save(OUT / "wix-dialog.bmp")
    header(493, 58).save(OUT / "wix-banner.bmp")
    print("written to", OUT)


if __name__ == "__main__":
    main()
