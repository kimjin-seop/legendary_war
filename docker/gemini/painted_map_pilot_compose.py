# [안아트 2026-11-06] 통그림 맵 판독성 합성: 칸 격자 + 기병 이동범위(숲 보2·기3, Dijkstra) + 현행 유닛 스프라이트 배치
import json, heapq
from PIL import Image, ImageDraw
ROOT = r'<repo>'; DIR = ROOT + '/scratchpad/painted_map_pilot'
L = json.load(open(DIR + '/pk05_layout.json')); W, H, rows = L['w'], L['h'], L['rows']; C = 64
base = Image.open(DIR + '/pk05_painted_r2_64px.png').convert('RGBA')
COST = {'foot': {'p': 1, 'f': 2, 'v': 1}, 'cav': {'p': 1, 'f': 3, 'v': 1}}
def reach(sx, sy, mv, kind):
    dist = {(sx, sy): 0}; q = [(0, sx, sy)]
    while q:
        d, x, y = heapq.heappop(q)
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < W and 0 <= ny < H:
                nd = d + COST[kind][rows[ny][nx]]
                if nd <= mv and nd < dist.get((nx, ny), 99): dist[(nx, ny)] = nd; heapq.heappush(q, (nd, nx, ny))
    return dist
def sprite(name):
    sh = Image.open(f'{ROOT}/public/assets/sprites/64/{name}_sheet.png').convert('RGBA'); return sh.crop((64, 0, 128, 64))  # 정면 가운데 프레임
lay = Image.new('RGBA', base.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
# 기병(아군) 6,7 이동 5 / 보병(적) 17,8 이동 4
for (sx, sy, mv, kind, col) in ((6, 7, 5, 'cav', (60, 140, 255, 95)), (17, 8, 4, 'foot', (255, 70, 60, 95))):
    for (x, y), v in reach(sx, sy, mv, kind).items():
        d.rectangle([x*C+1, y*C+1, x*C+C-2, y*C+C-2], fill=col)
for x in range(W + 1): d.line([x*C, 0, x*C, H*C], fill=(0, 0, 0, 70))
for y in range(H + 1): d.line([0, y*C, W*C, y*C], fill=(0, 0, 0, 70))
# 숲 칸 표시: 칸 왼쪽 위 작은 방패 마크(방어+20) 대신 간단한 점
for y in range(H):
    for x in range(W):
        if rows[y][x] == 'f': d.ellipse([x*C+4, y*C+4, x*C+12, y*C+12], fill=(255, 230, 0, 200), outline=(0, 0, 0, 200))
out = Image.alpha_composite(base, lay)
for name, (x, y) in (('cavalry_ally', (6, 7)), ('spear_ally', (4, 8)), ('archer_ally', (8, 6)), ('sword_enemy', (17, 8)), ('archer_enemy', (19, 6)), ('heavy_enemy', (13, 10)), ('spear_enemy', (5, 11))):
    try: sp = sprite(name)
    except FileNotFoundError: print('없음', name); continue
    out.alpha_composite(sp, (x*C, y*C))
out.convert('RGB').save(DIR + '/pk05_readability_composite.png')
# 원본 판(오버레이 없음)+유닛만: 어울림 점검
plain = base.copy()
for name, (x, y) in (('cavalry_ally', (6, 7)), ('spear_ally', (4, 8)), ('archer_ally', (8, 6)), ('sword_enemy', (17, 8)), ('archer_enemy', (19, 6)), ('heavy_enemy', (13, 10)), ('spear_enemy', (5, 11))):
    try: plain.alpha_composite(sprite(name), (x*C, y*C))
    except FileNotFoundError: pass
plain.convert('RGB').crop((0, 4*C, 14*C, 13*C)).save(DIR + '/pk05_units_closeup.png')
# 비교 시트: 가이드 | v1 | e1 | e2 | r2 (축소)
tiles = ['pk05_guide_64.png'] + [f'pk05_painted_{n}_64px.png' for n in ('v1', 'e1', 'e2', 'r1', 'r2')]
sheet = Image.new('RGB', (768 * 3, 512 * 2), (255, 255, 255))
for i, t in enumerate(tiles): sheet.paste(Image.open(DIR + '/' + t).convert('RGB').resize((768, 512), Image.LANCZOS), ((i % 3) * 768, (i // 3) * 512))
sheet.save(DIR + '/pk05_compare_sheet.jpg', quality=88)
print('ok')
