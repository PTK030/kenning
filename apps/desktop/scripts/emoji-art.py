"""Prepare the address book's emoji artwork, and pick each emoji's default
tile background.

    python scripts/emoji-art.py <folder of source PNGs>

The sources are Noto Emoji 3D PNGs (emoji_u1f3e6.png, 128 px). Each one is
cropped to its ink, centred and scaled to fill the same share of a 72 px
square, so a briefcase drawn low on its canvas sits like the rest, and saved
to ui/src/assets/emoji as 1f3e6.png.

The default background is the --tint-* (tokens.css) whose hue is closest to
the emoji's own colour and that still stands off the emoji's edge by enough,
in both themes, that the two do not run together. Emoji with little colour
get a neutral; nearly black or white ones the neutral that cuts them out.
The result is written to ui/src/emojiTints.ts."""
import colorsys, math, os, re, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "ui", "src")
OUT = os.path.join(ROOT, "assets", "emoji")
SIZE = 72
FILL = 0.86  # the ink's longer side, as a share of the square
NEUTRAL = ("gray", "mist", "slate", "snow", "night")
# A background in another colour family than the emoji clashes; past this
# gap in hue a neutral is the better choice.
NEAR = 35 / 360
# How far apart, in OKLab, an emoji's edge and its background must be in
# the theme where they are closest: below this they start to merge.
APART = 0.16


def tints():
    css = open(os.path.join(ROOT, "styles", "tokens.css"), encoding="utf-8").read()
    found = re.findall(r"--tint-(\w+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)", css, re.I)
    return {name: (rgb(light), rgb(dark)) for name, light, dark in found}


def rgb(h):
    return tuple(int(h[i : i + 2], 16) / 255 for i in (1, 3, 5))


def oklab(c):
    r, g, b = (x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    )


def apart(a, b):
    return math.dist(oklab(a), oklab(b))


def hue_gap(a, b):
    d = abs(a - b) % 1
    return min(d, 1 - d)


def centred(src):
    im = Image.open(src).convert("RGBA")
    box = im.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
    ink = im.crop(box)
    scale = SIZE * FILL / max(ink.size)
    ink = ink.resize((max(1, round(ink.width * scale)), max(1, round(ink.height * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (SIZE, SIZE))
    out.alpha_composite(ink, ((SIZE - ink.width) // 2, (SIZE - ink.height) // 2))
    return out


def colours(im):
    """The emoji's dominant hue and how colourful it is, from all its ink;
    the mean colour of its edge, where it meets the background; and how
    light it is overall."""
    a = im.getchannel("A")
    px, al = im.load(), a.load()
    w, h = im.size
    bins = [0.0] * 36
    sat_sum = weight = 0.0
    edge = [0.0, 0.0, 0.0]
    edges = 0
    light = 0.0
    for y in range(h):
        for x in range(w):
            if al[x, y] < 128:
                continue
            r, g, b = (v / 255 for v in px[x, y][:3])
            hh, s, v = colorsys.rgb_to_hsv(r, g, b)
            bins[int(hh * 36) % 36] += s * v
            sat_sum += s * v
            weight += 1
            light += oklab((r, g, b))[0]
            # An edge pixel has transparency within 2 px.
            if any(
                not (0 <= x + dx < w and 0 <= y + dy < h) or al[x + dx, y + dy] < 128
                for dx in (-2, 0, 2)
                for dy in (-2, 0, 2)
            ):
                edge = [e + c for e, c in zip(edge, (r, g, b))]
                edges += 1
    smooth = [bins[i - 1] + 2 * bins[i] + bins[(i + 1) % 36] for i in range(36)]
    peak = max(range(36), key=smooth.__getitem__)
    n = max(weight, 1)
    return (peak + 0.5) / 36, sat_sum / n, tuple(e / max(edges, 1) for e in edge), light / n


def pick(hue, colourful, edge, light, palette):
    def worst(name):
        return min(apart(edge, bg) for bg in palette[name])

    order = []
    if colourful >= 0.22:
        gaps = {n: hue_gap(hue, colorsys.rgb_to_hsv(*palette[n][0])[0]) for n in palette if n not in NEUTRAL}
        order = sorted((n for n in gaps if gaps[n] <= NEAR), key=gaps.__getitem__)
    # A grey or black emoji can merge with a dark neutral even where its rim
    # stands off it, and a white one with a pale neutral: try the opposite
    # end first.
    neutral = list(NEUTRAL)
    if colourful < 0.22 and light < 0.45:
        neutral = ["snow", "gray", "mist", "slate", "night"]
    elif colourful < 0.22 and light > 0.8:
        neutral = ["slate", "gray", "mist", "night", "snow"]
    for name in order + neutral:
        if worst(name) >= APART:
            return name
    return max(palette, key=worst)


def main(src_dir):
    palette = tints()
    chosen = {}
    for f in sorted(os.listdir(src_dir)):
        m = re.fullmatch(r"(?:emoji_u)?([0-9a-f_-]+)\.png", f)
        if not m:
            continue
        code = m.group(1).replace("_", "-")
        im = centred(os.path.join(src_dir, f))
        im.save(os.path.join(OUT, f"{code}.png"), optimize=True)
        chosen[code] = pick(*colours(im), palette)
        print(f"{code:>8}  {chosen[code]}")
    lines = "\n".join(f'  "{c}": "{t}",' for c, t in chosen.items())
    with open(os.path.join(ROOT, "emojiTints.ts"), "w", encoding="utf-8", newline="\n") as out:
        out.write(
            "// Generated by scripts/emoji-art.py from the artwork in assets/emoji:\n"
            "// the tile background each emoji gets until the user picks one.\n\n"
            'import type { Tint } from "./emoji";\n\n'
            f"export const AUTO_TINT: Record<string, Tint> = {{\n{lines}\n}};\n"
        )


if __name__ == "__main__":
    main(sys.argv[1])
