# [안아트 2026-11-06] 통그림 맵 파일럿: pk_05 지형을 칸 단위 색 구획 가이드로 렌더(읽기 전용 입력)
import json, sys
from PIL import Image, ImageDraw
ROOT = r'<repo>'
OUT = ROOT + '/scratchpad/painted_map_pilot'
d = json.load(open(ROOT + '/database/data/maps_pack20_v2.json', encoding='utf-8'))
m = [i for i in d['items'] if i['code'] == 'pk_05_forest_ambush'][0]
rows = m['tiles']; H = len(rows); W = len(rows[0])
# 장식용 흙길(평지 칸만, 이동 규칙 동일 cost1): 6행·9행 가로 + 중앙 세로 연결은 없음
PATH = set()
for x in range(W):
    for y in (6, 9):
        if rows[y][x] == 'p': PATH.add((x, y))
COL = {'p': (120, 200, 90), 'f': (20, 90, 40), 'v': (190, 70, 50), 'path': (205, 170, 110)}
json.dump({'w': W, 'h': H, 'rows': rows, 'path': sorted(PATH)}, open(OUT + '/pk05_layout.json', 'w'))
for C, name, grid in ((32, 'guide_32', False), (64, 'guide_64_grid', True)):
    im = Image.new('RGB', (W * C, H * C)); dr = ImageDraw.Draw(im)
    for y in range(H):
        for x in range(W):
            k = 'path' if (x, y) in PATH else rows[y][x]
            dr.rectangle([x * C, y * C, x * C + C - 1, y * C + C - 1], fill=COL[k])
    if grid:
        for x in range(W + 1): dr.line([x * C, 0, x * C, H * C], fill=(0, 0, 0), width=1)
        for y in range(H + 1): dr.line([0, y * C, W * C, y * C], fill=(0, 0, 0), width=1)
    im.save(f'{OUT}/pk05_{name}.png')
print(W, H, len(PATH))
