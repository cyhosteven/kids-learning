"""產生 App 圖示（自製，不用任何外部素材）：天空＋草地背景，中間一個圓臉獅子造型與 ABC。

用法：python tools/make_icons.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "icons")


def font(size):
    for name in ("arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_icon(n):
    s = 4                                  # 先畫 4 倍再縮小，邊緣平滑
    N = n * s
    im = Image.new("RGB", (N, N), "#bfe6ff")
    d = ImageDraw.Draw(im)
    d.rectangle([0, int(N * 0.62), N, N], fill="#9fd98c")
    cx, cy = N // 2, int(N * 0.46)
    # 鬃毛
    r_mane = int(N * 0.27)
    for k in range(12):
        a = 2 * math.pi * k / 12
        x, y = cx + int(math.cos(a) * r_mane * 0.78), cy + int(math.sin(a) * r_mane * 0.78)
        rr = int(N * 0.09)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill="#e07a1f")
    d.ellipse([cx - r_mane, cy - r_mane, cx + r_mane, cy + r_mane], fill="#e07a1f")
    # 臉
    r = int(N * 0.19)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#ffc94d")
    e = int(N * 0.025)
    for dx in (-0.07, 0.07):
        ex = cx + int(N * dx)
        ey = cy - int(N * 0.03)
        d.ellipse([ex - e, ey - e, ex + e, ey + e], fill="#2c3a2a")
    nose = int(N * 0.03)
    d.ellipse([cx - nose, cy + int(N * 0.03), cx + nose, cy + int(N * 0.03) + nose * 2], fill="#8a4b1c")
    # ABC
    f = font(int(N * 0.15))
    text = "ABC"
    w = d.textlength(text, font=f)
    d.text((cx - w / 2, int(N * 0.74)), text, font=f, fill="#ffffff", stroke_width=int(N * 0.012), stroke_fill="#5fae4e")
    return im.resize((n, n), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, n in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        draw_icon(n).save(os.path.join(OUT, name), optimize=True)
        print(name)


main()
