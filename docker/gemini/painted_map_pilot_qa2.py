# [안아트 2026-11-06] 2라운드(30x20) 칸 일치 점검 + 판독성 합성 + 유닛 배치. 평지군(. r g)=1, 숲 F, 마을 H, 장애 x(육안만)
import json, heapq, colorsys, sys
from PIL import Image, ImageDraw
ROOT = r'<repo>'; DIR = ROOT + '/scratchpad/painted_map_pilot'
name = sys.argv[1]
L = json.load(open(DIR + '/pk05b_layout.json')); W, H, rows = L['w'], L['h'], L['rows']; C = 64
src = Image.open(f'{DIR}/pk05_painted_{name}.jpg').convert('RGB').resize((W*C, H*C), Image.LANCZOS); src.save(f'{DIR}/pk05_painted_{name}_64px.png')
def classify(cell):
    px = list(cell.resize((16, 16), Image.BOX).getdata()); n = len(px); f = hs = rd = 0
    for r, g, b in px:
        h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255); h *= 360
        if 15 <= h <= 50 and s < 0.6 and v > 0.55: rd += 1
        elif (h < 60 or h > 300) and v <= 0.55: hs += 1
        elif 60 <= h <= 170 and v < 0.50: f += 1
        elif 60 <= h <= 170 and v < 0.62 and s > 0.45: f += 0.6
    if hs/n >= .35 and hs > f: return 'H'
    if rd/n >= .35: return 'r'
    if f/n >= .35: return 'F'
    return '.'
grp = lambda c: {'.': 'flat', 'r': 'flat', 'g': 'flat', 'F': 'F', 'H': 'H', 'x': 'x'}[c]
ov = src.copy(); d = ImageDraw.Draw(ov, 'RGBA'); ok = tot = 0; conf = {}; road_ok = road_n = 0
for y in range(H):
    for x in range(W):
        t = rows[y][x]; p = classify(src.crop((x*C, y*C, x*C+C, y*C+C)))
        if t == 'r': road_n += 1; road_ok += p == 'r'
        if t == 'x': continue
        tot += 1; k = f'{grp(t)}->{grp(p)}'; conf[k] = conf.get(k, 0) + 1
        if grp(t) == grp(p): ok += 1
        else: d.line([x*C+8, y*C+8, x*C+C-8, y*C+C-8], fill=(255, 0, 0, 220), width=4); d.line([x*C+C-8, y*C+8, x*C+8, y*C+C-8], fill=(255, 0, 0, 220), width=4)
        if t == 'F': d.rectangle([x*C+3, y*C+3, x*C+C-4, y*C+C-4], outline=(255, 230, 0, 200), width=2)
        if t == 'H': d.rectangle([x*C+3, y*C+3, x*C+C-4, y*C+C-4], outline=(60, 140, 255, 230), width=3)
        if t == 'r': d.rectangle([x*C+3, y*C+3, x*C+C-4, y*C+C-4], outline=(255, 140, 0, 230), width=2)
    for xx in range(W+1): d.line([xx*C, 0, xx*C, H*C], fill=(0, 0, 0, 80))
for yy in range(H+1): d.line([0, yy*C, W*C, yy*C], fill=(0, 0, 0, 80))
ov.save(f'{DIR}/pk05_painted_{name}_overlay.png')
print(name, f'일치(장애칸 제외) {ok}/{tot} = {ok/tot:.1%}', f'길 칸 길색 {road_ok}/{road_n}', json.dumps(conf))
# 판독성 합성: 격자 + 숲 점 + 장애 빗금 + 기병(아군)/보병(적) 이동범위 + 현행 유닛
COST = {'cav': {'.': 1, 'r': 1, 'g': 1, 'H': 1, 'F': 3}, 'foot': {'.': 1, 'r': 1, 'g': 1, 'H': 1, 'F': 2}}
def reach(sx, sy, mv, kind):
    dist = {(sx, sy): 0}; q = [(0, sx, sy)]
    while q:
        dd, x, y = heapq.heappop(q)
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < W and 0 <= ny < H and rows[ny][nx] != 'x':
                nd = dd + COST[kind][rows[ny][nx]]
                if nd <= mv and nd < dist.get((nx, ny), 99): dist[(nx, ny)] = nd; heapq.heappush(q, (nd, nx, ny))
    return dist
base = Image.open(f'{DIR}/pk05_painted_{name}_64px.png').convert('RGBA'); lay = Image.new('RGBA', base.size, (0,0,0,0)); d = ImageDraw.Draw(lay)
for (sx, sy, mv, kind, col) in ((3, 11, 6, 'cav', (60, 140, 255, 95)), (25, 16, 4, 'foot', (255, 70, 60, 95))):
    for (x, y) in reach(sx, sy, mv, kind): d.rectangle([x*C+1, y*C+1, x*C+C-2, y*C+C-2], fill=col)
for x in range(W+1): d.line([x*C, 0, x*C, H*C], fill=(0, 0, 0, 70))
for y in range(H+1): d.line([0, y*C, W*C, y*C], fill=(0, 0, 0, 70))
for y in range(H):
    for x in range(W):
        if rows[y][x] == 'F': d.ellipse([x*C+4, y*C+4, x*C+12, y*C+12], fill=(255, 230, 0, 200), outline=(0, 0, 0, 200))
        if rows[y][x] == 'x':
            for k in range(0, C, 12): d.line([x*C+k, y*C, x*C, y*C+k], fill=(255, 0, 0, 160), width=2)
out = Image.alpha_composite(base, lay); plain = base.copy()
U = (('cavalry_ally', (3, 11)), ('spear_ally', (2, 10)), ('archer_ally', (5, 4)), ('sword_ally', (12, 9)),
     ('sword_enemy', (25, 16)), ('archer_enemy', (24, 15)), ('heavy_enemy', (20, 13)), ('spear_enemy', (17, 8)))
for nm, (x, y) in U:
    sp = Image.open(f'{ROOT}/public/assets/sprites/64/{nm}_sheet.png').convert('RGBA').crop((64, 0, 128, 64))
    out.alpha_composite(sp, (x*C, y*C)); plain.alpha_composite(sp, (x*C, y*C))
out.convert('RGB').save(f'{DIR}/pk05_{name}_readability_composite.png')
plain.convert('RGB').save(f'{DIR}/pk05_{name}_units.png', quality=90)
# r1 대비 비교 시트
sh = Image.new('RGB', (960*2, 640*2), (255, 255, 255))
for i, f in enumerate(['pk05_guide_64.png', 'pk05_painted_r1_64px.png', 'pk05b_guide_64.png', f'pk05_painted_{name}_64px.png']):
    sh.paste(Image.open(f'{DIR}/{f}').convert('RGB').resize((960, 640), Image.LANCZOS), ((i % 2)*960, (i // 2)*640))
sh.save(f'{DIR}/pk05_round2_vs_r1.jpg', quality=88)
