# 삼국 재제작 QA 접촉 시트(호출 없음, 안아트 2026-11-08). 사용: python contact.py out.png H file1 [file2 ...]
# 각 이미지를 높이 H 로 맞춰(픽셀 스프라이트는 정수 배 nearest) 회색·어두운 배경 두 줄로 배치, 파일명 라벨.
import sys, os
from PIL import Image, ImageDraw
out, H, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
tiles = []
for f in files:
    im = Image.open(f).convert('RGBA')
    w, h = im.size
    if h <= 600:
        s = max(1, H // h); im = im.resize((w * s, h * s), Image.NEAREST)
    else:
        im = im.resize((round(w * H / h), H), Image.LANCZOS)
    tiles.append((os.path.basename(os.path.dirname(f)) + '/' + os.path.basename(f), im))
W = sum(t.size[0] for _, t in tiles) + 10 * (len(tiles) + 1)
HH = max(t.size[1] for _, t in tiles)
sheet = Image.new('RGBA', (W, 2 * HH + 60), (0, 0, 0, 255))
d = ImageDraw.Draw(sheet)
x = 10
for name, t in tiles:
    for row, col in ((0, (150, 150, 150, 255)), (1, (40, 44, 52, 255))):
        y = 20 + row * (HH + 20)
        bg = Image.new('RGBA', t.size, col); bg.alpha_composite(t); sheet.paste(bg, (x, y))
    d.text((x, 4), name[-40:], fill=(255, 255, 0, 255))
    x += t.size[0] + 10
sheet.convert('RGB').save(out, quality=92)
print(out, sheet.size)
