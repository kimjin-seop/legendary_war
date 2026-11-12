# [안아트 2026-11-06] 통그림 파일럿 2라운드: 30x20 비대칭·불규칙 매복 구도 가이드(시안, 게임 데이터 아님)
# . 초원(1)  F 숲(보2·기3, 은신)  r 흙길(1)  H 오두막(마을 2x2)  g 밭(1)  x 울타리·우물(이동 불가)
import json, random
from PIL import Image, ImageDraw
DIR = r'<repo>/scratchpad/painted_map_pilot'
W, H = 30, 20; rnd = random.Random(505)
G = [['.'] * W for _ in range(H)]
def blob(cx, cy, rx, ry, hole=None):
    for y in range(H):
        for x in range(W):
            v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if v < 1 + rnd.uniform(-0.45, 0.35): G[y][x] = 'F'
    if hole:
        hx, hy, hrx, hry = hole
        for y in range(H):
            for x in range(W):
                if ((x - hx) / hrx) ** 2 + ((y - hy) / hry) ** 2 < 1: G[y][x] = '.'
blob(5, 4, 6.5, 4.5, hole=(5.5, 4.2, 1.7, 1.3))      # 북서 대삼림 + 은신 공터
blob(2.5, 16.5, 4, 3.5)                               # 남서 숲
blob(14, 2, 2.4, 1.6); blob(20, 5.5, 1.6, 1.3)        # 북중앙 작은 숲 2
blob(26.5, 3, 4.5, 3.6)                               # 북동 숲
blob(24.5, 15.5, 6, 4.6, hole=(24.5, 16, 1.8, 1.3))   # 남동 대삼림 + 은신 공터
blob(17, 9.5, 2.3, 1.7); blob(9.5, 11.5, 1.4, 1.1)    # 중앙 숲·소림
def line(a, b):
    (x0, y0), (x1, y1) = a, b; x, y = x0, y0; pts = [(x, y)]
    while (x, y) != (x1, y1):
        if abs(x1 - x) >= abs(y1 - y): x += 1 if x1 > x else -1
        else: y += 1 if y1 > y else -1
        pts.append((x, y))
    return pts
ROAD = []
for seg in ([(0, 11), (5, 11), (7, 10), (12, 9)],                  # 서쪽 진입 → 갈림길
            [(12, 9), (13, 7), (15, 5), (16, 3), (17, 2), (18, 0)],  # 북쪽 갈래
            [(12, 9), (13, 12), (19, 13), (20, 12)],            # 동남 갈래(20,12에서 끊김)
            [(23, 11), (26, 11), (29, 10)]):                    # 끊긴 뒤 숲 사이 오솔길 재개
    for a, b in zip(seg, seg[1:]): ROAD += line(a, b)
for x, y in ROAD: G[y][x] = 'r'
def put(x, y, w, h, c):
    for yy in range(y, y + h):
        for xx in range(x, x + w): G[yy][xx] = c
for (x, y) in ((8, 14), (11, 15), (14, 17), (6, 17)): put(x, y, 2, 2, 'H')   # 오두막 4채 엇갈림
put(15, 14, 3, 2, 'g'); put(18, 14, 1, 3, 'x'); put(15, 16, 3, 1, 'x')      # 밭 + 울타리
put(10, 13, 1, 1, 'x')                                                        # 우물
for y in range(H):        # 외톨이 숲 제거(지형 단독 1칸 금지 규칙)
    for x in range(W):
        if G[y][x] == 'F' and not any(0 <= x+dx < W and 0 <= y+dy < H and G[y+dy][x+dx] == 'F' for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))): G[y][x] = '.'
rows = [''.join(r) for r in G]
COL = {'.': (120, 200, 90), 'F': (20, 90, 40), 'r': (205, 170, 110), 'H': (190, 70, 50), 'g': (230, 210, 80), 'x': (150, 150, 160)}
json.dump({'w': W, 'h': H, 'rows': rows}, open(DIR + '/pk05b_layout.json', 'w'))
im = Image.new('RGB', (W * 64, H * 64)); d = ImageDraw.Draw(im)
for y in range(H):
    for x in range(W): d.rectangle([x*64, y*64, x*64+63, y*64+63], fill=COL[rows[y][x]])
im.save(DIR + '/pk05b_guide_64.png')
d = ImageDraw.Draw(im)
for x in range(W + 1): d.line([x*64, 0, x*64, H*64], fill=(0, 0, 0))
for y in range(H + 1): d.line([0, y*64, W*64, y*64], fill=(0, 0, 0))
im.save(DIR + '/pk05b_guide_64_grid.png')
print('\n'.join(rows)); print({k: sum(r.count(k) for r in rows) for k in COL})
