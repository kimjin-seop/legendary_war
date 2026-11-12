"""전후 비교 확대: python portrait_zoom.py <before.png> <after.png> <out.png> [x y w h]  (회색 배경 3배 확대 나란히)"""
import sys
from PIL import Image
b, a, o = sys.argv[1:4]
x, y, w, h = (int(v) for v in sys.argv[4:8]) if len(sys.argv) > 7 else (0, 300, 300, 300)
tiles = []
for p in (b, a):
    im = Image.open(p).convert('RGBA').crop((x, y, x + w, y + h))
    bg = Image.new('RGBA', im.size, (90, 90, 90, 255)); bg.alpha_composite(im)
    tiles.append(bg.resize((w * 3, h * 3), Image.NEAREST))
sheet = Image.new('RGB', (w * 6 + 10, h * 3), (255, 255, 255)); sheet.paste(tiles[0], (0, 0)); sheet.paste(tiles[1], (w * 3 + 10, 0)); sheet.save(o)
