"""Render the 1024 px app icon: the tray tag (see src-tauri/src/icon.rs) in
white on a rounded square in the brand's muted blue. Run, then
`npx tauri icon scripts/icon-1024.png` to produce the platform sizes."""
import math, sys
from PIL import Image

N = 1024
SS = 2  # supersampling
BLUE = (0x3A, 0x55, 0xC9)

def rounded_box(px, py, hx, hy, r):
    qx, qy = abs(px) - hx + r, abs(py) - hy + r
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r

def cov(d, aa):
    return min(max(0.5 - d / aa, 0.0), 1.0)

img = Image.new("RGBA", (N, N))
px = img.load()
aa = 1.0 / (N * SS)
c = 1 / math.sqrt(2)
for y in range(N):
    for x in range(N):
        bg = ink = 0.0
        for sy in range(SS):
            for sx in range(SS):
                ux = (x + (sx + 0.5) / SS) / N - 0.5
                uy = (y + (sy + 0.5) / SS) / N - 0.5
                bg += cov(rounded_box(ux, uy, 0.44, 0.44, 0.19), aa)
                # Tag, scaled to 70 % of the icon.
                s = 0.70
                p0, p1 = c * (ux + uy) / s, c * (ux - uy) / s
                d = rounded_box(p0, p1, 0.40, 0.21, 0.13)
                t = cov(abs(d) - 0.095 / 2, aa / s)
                dh = math.hypot(p0 + 0.24, p1)
                t = max(t, cov(dh - 0.075, aa / s))
                ink += t
        bg /= SS * SS
        ink /= SS * SS
        r = round(BLUE[0] * (1 - ink) + 255 * ink)
        g = round(BLUE[1] * (1 - ink) + 255 * ink)
        b = round(BLUE[2] * (1 - ink) + 255 * ink)
        px[x, y] = (r, g, b, round(255 * bg))
out = sys.argv[1] if len(sys.argv) > 1 else "icon-1024.png"
img.save(out)
print(out)
