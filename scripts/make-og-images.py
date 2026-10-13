"""OGP画像（1200x630, WebP）を生成する。実行: python3 scripts/make-og-images.py
新しいツールを追加したら IMAGES に1行足して実行する。Pillow が必要。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"
OUT = Path(__file__).resolve().parent.parent / "assets" / "img"
IMAGES = {
    "og-default.webp": ("お金の計算ツール箱", "転職・給与・手取りの無料計算ツール"),
    "og-jisshitsu-nenshu.webp": ("実質年収比較ツール", "手取り＋福利厚生で、転職先を比べる"),
}

def make(name, title, sub):
    img = Image.new("RGB", (1200, 630), "#0b5cad")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((60, 60, 1140, 570), radius=36, fill="#ffffff")
    d.text((120, 200), title, font=ImageFont.truetype(FONT, 84), fill="#1b1f24")
    d.text((120, 330), sub, font=ImageFont.truetype(FONT, 44), fill="#4a5360")
    d.text((120, 470), "お金の計算ツール箱", font=ImageFont.truetype(FONT, 34), fill="#0b5cad")
    img.save(OUT / name, "WEBP", quality=72, method=6)

for name, (title, sub) in IMAGES.items():
    make(name, title, sub)
    print(name, (OUT / name).stat().st_size, "bytes")
