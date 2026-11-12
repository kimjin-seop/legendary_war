# 생성본에 그려진 격자선(어두운 직선)을 배경 마젠타로 덮는다(호출 없음). 사용: python degrid.py in.jpg out.jpg
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); w, h = im.size; px = im.load()
def dark(p): return sum(p) < 150
cols = [x for x in range(w) if sum(dark(px[x, y]) for y in range(0, h, 4)) > 0.8 * h / 4]
rows = [y for y in range(h) if sum(dark(px[x, y]) for x in range(0, w, 4)) > 0.8 * w / 4]
for x in cols:
    for dx in range(-3, 4):
        for y in range(h):
            if 0 <= x + dx < w: px[x + dx, y] = (255, 0, 255)
for y in rows:
    for dy in range(-3, 4):
        for x in range(w):
            if 0 <= y + dy < h: px[x, y + dy] = (255, 0, 255)
im.save(sys.argv[2], quality=95); print('cols', cols[:3], len(cols), 'rows', rows[:3], len(rows))
