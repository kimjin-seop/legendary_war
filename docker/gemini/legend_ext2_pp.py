"""지형 전환 타일 2차 확장 시트(tileset_ext2.png) 생성기 — 이미지 생성 모델 호출 0회, 원본 TileMap.png 픽셀·팔레트로 절차 조립.
원칙(Unity 타일맵 가이드): 32x32 격자·여백 0·Point 필터, 사람이 골라 칠하는 개별 타일(오토타일 규칙 없음), 회전 90도 단위만.
읽기 전용 입력: public/assets/third_party/unity_tilemap/TileMap.png(0~29), public/assets/tiles/legend_tileset/tileset_ext.png(30~103, 미리보기용).
기존 파일은 수정하지 않는다. 전역 인덱스 110부터(기존 tileset_ext.png 320x256 텍스처가 프레임 74~79 = 전역 104~109 빈 칸을 이미 차지하므로 겹침 방지).
실행(컨테이너): docker run --rm -v "<repo>:/app" -w /app python:3.12 sh -c "pip install -q pillow numpy && python docker/gemini/legend_ext2_pp.py"
의존(pip 공식 레지스트리): pillow(HPND) numpy(BSD-3)
산출: public/assets/tiles/legend_tileset/{tileset_ext2.png, tileset_ext2_x2.png, tileset_ext2_spec.json, v2_tilemap_ext2.json,
      manifest_fragment_tileset_ext2.json, preview_ext2_sheet.png, preview_ext2_river.png, preview_ext2_beach.png, preview_ext2_lake.png,
      preview_ext2_repeat.png, qa_ext2.json}
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw

SRC = 'public/assets/third_party/unity_tilemap/TileMap.png'
EXT1 = 'public/assets/tiles/legend_tileset/tileset_ext.png'
OUT = 'public/assets/tiles/legend_tileset'
T, COLS = 32, 10
BASE = 110

src = np.array(Image.open(SRC).convert('RGBA'))
ext1 = np.array(Image.open(EXT1).convert('RGBA'))
def otile(i):
    if i < 30:
        return src[(i // 10) * T:(i // 10) * T + T, (i % 10) * T:(i % 10) * T + T].copy()
    j = i - 30
    return ext1[(j // 10) * T:(j // 10) * T + T, (j % 10) * T:(j % 10) * T + T].copy()

def hx(s):
    return np.array([int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255], np.uint8)

# 원본 팔레트(legend_ext_pp.py 와 동일) + 신규 1색(ford_hi: 여울 물무늬, 물 3단 명도 사다리의 맨 위 칸)
C = {k: hx(v) for k, v in dict(
    deep='005aff', mid='0094ff', light='00d4ff', ford_hi='80e8ff', foam='ffffff',
    sand='ffcead', sand2='cfae91', sand3='d3966c',
    grass='a5bd00', grass2='86a500', dgrass='7b9100', dgrass2='6a8000',
    leaf='115100', leaf2='397b00',
    wood='d64a00', wood2='982e00', wood3='541400',
    st='959aa8', sthi='d0d0ce', st2='59595a', stdk='343434', blk='282828').items()}

T0, T1, T2, T3, T5 = (otile(i) for i in (0, 1, 2, 3, 5))
WPAT = np.all(T1[:, :, :3] == C['light'][:3], axis=2)  # 원본 0·1번 공통 물무늬(주기 16) — 모든 수심 단계가 같은 무늬 위치를 써서 칸 경계에서 이어짐
assert np.array_equal(WPAT, np.all(T0[:, :, :3] == C['mid'][:3], axis=2))

# 수심 단계: 0=여울(신규) 1=얕은 물(원본 1번) 2=깊은 물(원본 0번). (무늬색, 바탕색)
WL = {0: ('ford_hi', 'light'), 1: ('light', 'mid'), 2: ('mid', 'deep')}
def water(x, y, lv):
    p, b = WL[lv]
    return C[p] if WPAT[y, x] else C[b]

# 가장자리 들쭉날쭉: 칸 끝 4px 은 0(직선·모서리 끝단이 픽셀 단위로 맞물림) — legend_ext_pp.py 와 같은 표
JAG = [0, 0, 0, 0, 1, 1, 0, -1, -1, 0, 1, 1, 1, 0, 0, -1, 0, 1, 1, 0, -1, -1, -1, 0, 1, 1, 0, 0, 0, 0, 0, 0]
def jag(t):
    t = int(t) % 32
    return JAG[t] if 4 <= t <= 27 else 0
SIDES = {'N': lambda x, y: (y, x), 'S': lambda x, y: (31 - y, x), 'W': lambda x, y: (x, y), 'E': lambda x, y: (31 - x, y)}
CORN = {'NW': (-0.5, -0.5), 'NE': (31.5, -0.5), 'SW': (-0.5, 31.5), 'SE': (31.5, 31.5)}
R_IN = 28  # 안쪽 모서리(A 가 두 변) 둥글림 반경: B 쪽 볼록 모서리를 반경 R 원호로. 칸 끝(>=R)에서는 직선과 같아 이웃 타일과 맞물림
def dist(x, y, sides, diags):
    if len(sides) == 2 and {sides[0], sides[1]} not in ({'N', 'S'}, {'E', 'W'}):
        u, au = SIDES[sides[0]](x, y)
        v, av = SIDES[sides[1]](x, y)
        if u < R_IN and v < R_IN:
            return R_IN - math.hypot(R_IN - u, R_IN - v)
        return min(u + jag(au), v + jag(av))
    best = 99.0
    for s in sides:
        d, a = SIDES[s](x, y)
        best = min(best, d + jag(a))
    for c in diags:
        cx, cy = CORN[c]
        dx, dy = x - cx, y - cy
        ang = math.atan2(abs(dy), abs(dx)) / (math.pi / 2)
        best = min(best, math.hypot(dx, dy) - 0.5 + jag(int(round(ang * 31))))  # 끝단(각 0/1)에서 jag 0 → 직선 타일과 맞물림
    return best

# 장식 점: 3x3 지터 격자(x·y 가 6~8, 14~16, 23~25 띠에 걸치도록) — 타일 안쪽 3~28px 에만 그려 칸 경계 이음새에 영향 없음
REED_PTS = [(7, 7), (15, 8), (24, 6), (6, 15), (16, 14), (25, 16), (8, 24), (14, 23), (23, 25)]
TUFT_PTS = [(9, 6), (18, 8), (25, 7), (7, 17), (17, 16), (24, 14), (10, 25), (19, 24), (26, 23)]
def interior(x, y):
    return 3 <= x <= 28 and 3 <= y <= 28

# ---- 전환 프로필: d = A(높은/마른 쪽) 경계로부터의 거리 → (색, 등급) ----
def prof_grass_ford(x, y, d):
    """풀→여울(둑 없음): 풀 → 젖은 풀 테 1px → 밝은 물결선 1px → 여울"""
    if d < 4:
        return T3[y, x], 'G'
    if d < 5:
        return C['dgrass'], 'rim'
    if d < 6:
        return (C['foam'] if (x + y) % 5 < 2 else C['ford_hi']), 'lap'
    return water(x, y, 0), 'W0'

def prof_ford_deep(x, y, d):
    """여울→심수: 여울(0) → 얕은 물(1, 원본 1번 색) → 깊은 물(2, 원본 0번 색). 경계 1px 은 무늬색으로 물턱 표시"""
    if d < 7:
        return water(x, y, 0), 'W0'
    if d < 8:
        return C['light'], 'W1e'
    if d < 14:
        return water(x, y, 1), 'W1'
    if d < 15:
        return C['mid'], 'W2e'
    return water(x, y, 2), 'W2'

def prof_grass_sand(x, y, d):
    """풀→모래: 풀 → 짙은 풀 테 1px → 모래 그늘 1px → 모래"""
    if d < 4:
        return T3[y, x], 'G'
    if d < 5:
        return C['grass2'], 'rim'
    if d < 6:
        return C['sand2'], 'sh'
    return T2[y, x], 'S'

def prof_sand_ford(x, y, d):
    """모래→여울(해변, 둑 없음): 모래 → 젖은 모래 2px → 흰 파도선(끊김) → 여울, 안쪽에 두 번째 물거품 점선"""
    if d < 4:
        return T2[y, x], 'S'
    if d < 6:
        return C['sand2'], 'wet'
    if d < 7:
        return (C['foam'] if not (WPAT[y, x] and x % 2 == 0) else C['ford_hi']), 'foam'
    if 9 <= d < 10 and WPAT[y, x]:
        return C['foam'], 'W0'
    return water(x, y, 0), 'W0'

def decorate_grass_ford(img, cls, x, y, d):
    # 물가 갈대 2줄기(물 쪽 6~9px 지점, 타일 안쪽만)
    if (x, y) in REED_PTS and 6 <= d < 9 and interior(x, y) and interior(x + 1, y - 2):
        img[y, x] = C['dgrass2']; img[y - 1, x] = C['dgrass']; img[y - 2, x] = C['grass']
        img[y, x + 1] = C['dgrass2']; img[y - 1, x + 1] = C['grass2']

def decorate_grass_sand(img, cls, x, y, d):
    # 모래 위 작은 풀 포기(V자 3px)
    if (x, y) in TUFT_PTS and 6 <= d < 10 and interior(x - 1, y - 1) and interior(x + 1, y):
        img[y, x] = C['grass2']; img[y - 1, x - 1] = C['grass']; img[y - 1, x + 1] = C['grass']

PROFILES = {
    'grass_ford': (prof_grass_ford, decorate_grass_ford, 'G', 'W0'),
    'ford_deep': (prof_ford_deep, None, 'W0', 'W2'),
    'grass_sand': (prof_grass_sand, decorate_grass_sand, 'G', 'S'),
    'sand_ford': (prof_sand_ford, None, 'S', 'W0'),
}

def make(kind, sides, diags=()):
    pf, deco, _, _ = PROFILES[kind]
    img = np.zeros((T, T, 4), np.uint8)
    cls = np.empty((T, T), object)
    ds = np.zeros((T, T))
    for y in range(T):
        for x in range(T):
            d = dist(x, y, sides, diags)
            ds[y, x] = d
            img[y, x], cls[y, x] = pf(x, y, d)
    if deco:
        for y in range(T):
            for x in range(T):
                deco(img, cls, x, y, ds[y, x])
    return img, cls

# ---- 여울 내부(반복) ----
def ford_inner(var):
    img = np.zeros((T, T, 4), np.uint8)
    for y in range(T):
        for x in range(T):
            img[y, x] = water(x, y, 0)
    stones = [(6, 7, 3, 2), (20, 5, 2, 2), (13, 18, 4, 2), (25, 22, 2, 2), (5, 25, 3, 2)] if var == 'a' else \
             [(9, 10, 3, 2), (22, 14, 4, 2), (6, 22, 2, 2), (17, 25, 3, 2)]
    for sx, sy, w, h in stones:  # 물에 잠긴 강돌: 아래 그늘(mid) + 위 밝은 테(ford_hi) + 모래 점
        img[sy:sy + h, sx:sx + w] = C['mid']
        img[sy, sx:sx + w] = C['ford_hi']
        img[sy + h, sx:sx + w] = C['light']
    if var == 'b':  # 물살 흰 줄(돌 아래쪽 흐름)
        for sx, sy, w, h in stones:
            for k in range(3):
                xx = sx + w + 1 + k
                if 3 <= xx <= 28:
                    img[sy + 1, xx] = C['foam'] if k < 2 else C['ford_hi']
    cls = np.full((T, T), 'W0', object)
    return img, cls

# ---- 다리 끝(도로 모래 칸에 칠함, 이름 방향 = 판자 다리(원본 5번)가 이어지는 쪽) ----
def bridge_end(side):
    over = np.zeros((T, T, 4), np.uint8)
    over[0:13] = T5[0:13]
    over[13] = C['stdk']
    over[14] = C['sthi']
    over[15] = C['st']
    over[15, 3::8] = C['st2']
    over[16] = C['st2']
    over[17] = C['sand2']
    k = {'N': 0, 'E': -1, 'S': 2, 'W': 1}[side]
    over = np.rot90(over, k).copy()
    img = T2.copy()
    m = over[:, :, 3] > 0
    img[m] = over[m]
    cls = np.full((T, T), 'S', object)
    cls[m] = 'P'
    return img, cls

# ---- 타일 목록(순서 = 인덱스) ----
D4 = ['N', 'E', 'S', 'W']
CR = ['NW', 'NE', 'SE', 'SW']
TILES = []
def add(name, ic, use, code, collider, near, paint_on, toward):
    TILES.append(dict(name=name, img=ic[0], cls=ic[1], use=use, code=code, collider=collider, near=near, paint_on=paint_on, toward=toward))

SETS = [
    ('grass_ford', '풀→여울', '여울(ford) 칸', '풀(3)', 's(ford)', 'None'),
    ('ford_deep', '여울→심수', '깊은 물(0) 칸', '여울(ford_a/b)', 'w', 'Sprite'),
    ('grass_sand', '풀→모래', '모래(2) 칸', '풀(3)', 'r|n(desert)', 'None'),
    ('sand_ford', '모래→여울(해변)', '여울(ford) 칸', '모래(2)', 's(ford)', 'None'),
]
for k, label, on, a_name, code, col in SETS:
    for s in D4:
        add(f'{k}_{s}', make(k, [s]), f'{label} 직선: {on}에 칠함, {a_name}이(가) {s}쪽', code, col, [f'{s}쪽: {a_name}', '반대쪽: 같은 칸 종류(내부)'], on, s)
    for c in CR:
        add(f'{k}_{c}_inner', make(k, [c[0], c[1]]), f'{label} 안쪽 모서리: {on}, {a_name}이(가) {c[0]}·{c[1]} 두 변', code, col,
            [f'{c[0]}·{c[1]}쪽: {a_name}', f'{c[0]}쪽 줄 이웃은 {k}_{c[0]}, {c[1]}쪽 줄 이웃은 {k}_{c[1]}'], on, c)
    for c in CR:
        add(f'{k}_{c}_outer', make(k, [], [c]), f'{label} 바깥 모서리: {on}, {a_name}은(는) {c} 대각 꼭짓점에만', code, col,
            [f'{c[0]}쪽 이웃: {k}_{c[1]}', f'{c[1]}쪽 이웃: {k}_{c[0]}'], on, c)
add('ford_a', ford_inner('a'), '여울 내부(잠긴 강돌) — 반복 바탕', 's(ford)', 'None', ['ford_b 와 섞어 반복 완화'], '여울 칸', '-')
add('ford_b', ford_inner('b'), '여울 내부 변형(강돌+물살 흰 줄)', 's(ford)', 'None', ['ford_a'], '여울 칸', '-')
for s in D4:
    add(f'bridge_end_{s}', bridge_end(s), f'다리 끝(돌 문턱): 도로 모래 칸에 칠함, 판자 다리(5)가 {s}쪽으로 이어짐', 'r', 'None',
        [f'{s}쪽: 판자(5, 가로 다리는 rot 1)', '반대쪽: 도로(2)'], '도로(2) 칸', s)

N = len(TILES)
ROWS = math.ceil(N / COLS)
sheet = np.zeros((ROWS * T, COLS * T, 4), np.uint8)
for i, t in enumerate(TILES):
    sheet[(i // COLS) * T:(i // COLS) * T + T, (i % COLS) * T:(i % COLS) * T + T] = t['img']
os.makedirs(OUT, exist_ok=True)
sim = Image.fromarray(sheet, 'RGBA')
sim.save(f'{OUT}/tileset_ext2.png')
sim.resize((sim.width * 2, sim.height * 2), Image.NEAREST).save(f'{OUT}/tileset_ext2_x2.png')
idx = {t['name']: BASE + i for i, t in enumerate(TILES)}
I = idx
TL = {BASE + i: t for i, t in enumerate(TILES)}

# ---- 바탕 타일 등급(이음새 검사용) ----
BASECLS = {3: 'G', 49: 'G', 2: 'S', 0: 'W2', 1: 'W1', 5: 'P'}
def tile_img(i):
    return TL[i]['img'] if i >= BASE else otile(i)
def tile_cls(i):
    if i >= BASE:
        return TL[i]['cls']
    return np.full((T, T), BASECLS.get(i, '?'), object)

# ---- 미리보기 장면(사람이 칠하듯 고른 결과를 재현: 런타임 규칙 아님) ----
# g 풀, s 모래, f 여울, d 깊은 물, r 도로(모래 2번, 전환 없음), b 판자 다리(5번)
SCENES = {
 'river': ['ggggggggggggrggg',
           'ggggggggggggrggg',
           'fffffffggfffbfff',
           'dddfffffffddbddd',
           'dddfffddddddbddd',
           'dddfffddddddbddd',
           'dddffffffdddbddd',
           'ffffffffffffbfff',
           'ggggggggggggrggg',
           'ggggggggggggrggg'],
 'beach': ['gggggggggggggggg',
           'ggggggggssgggggg',
           'gggsssssssssgggg',
           'sssssssssssssggg',
           'sssssfffssssssss',
           'ffffffffffffssss',
           'ffffddddddffffff',
           'ddddddddddddffff',
           'dddddddddddddddd',
           'dddddddddddddddd'],
 'lake':  ['gggggggggggggggg',
           'gssssggggggggggg',
           'gssssggfffffgggg',
           'gsssgggfdddfffgg',
           'ggggggffdddddffg',
           'gggggffdddddddfg',
           'gggggffdddddddfg',
           'gggggffddddffffg',
           'ggggggfffffffggg',
           'gggggggggggggggg'],
}
PAIRS = {'f': {'g': 'grass_ford', 's': 'sand_ford'}, 'd': {'f': 'ford_deep'}, 's': {'g': 'grass_sand'}}
DIRS = {'N': (-1, 0), 'E': (0, 1), 'S': (1, 0), 'W': (0, -1)}
DIAG = {'NW': (-1, -1), 'NE': (-1, 1), 'SE': (1, 1), 'SW': (1, -1)}
def corner(a, b):
    return ''.join(sorted([a, b], key=lambda s: 'NS'.find(s) if s in 'NS' else 2))
def build(lay):
    H, W = len(lay), len(lay[0])
    def at(y, x, base):
        if not (0 <= y < H and 0 <= x < W):
            return base
        ch = lay[y][x]
        return base if ch in 'br' else ch
    grid, issues = [[0] * W for _ in range(H)], []
    for y in range(H):
        for x in range(W):
            ch = lay[y][x]
            if ch == 'g':
                grid[y][x] = 49 if (x * 7 + y * 13) % 9 == 0 else 3; continue
            if ch == 'r':
                nb = [d for d, (oy, ox) in DIRS.items() if 0 <= y + oy < H and 0 <= x + ox < W and lay[y + oy][x + ox] == 'b']
                grid[y][x] = I[f'bridge_end_{nb[0]}'] if nb else 2; continue
            if ch == 'b':
                grid[y][x] = 5; continue
            plain = {'f': I['ford_a'] if (x + 2 * y) % 3 else I['ford_b'], 'd': 0, 's': 2}[ch]
            hi = PAIRS[ch]
            kinds = {at(y + oy, x + ox, ch) for oy, ox in list(DIRS.values()) + list(DIAG.values())} & set(hi)
            if not kinds:
                grid[y][x] = plain; continue
            if len(kinds) > 1:
                issues.append((y, x, 'A 종류 2개 이상')); grid[y][x] = plain; continue
            a = kinds.pop(); k = hi[a]
            open_ = [d for d, (oy, ox) in DIRS.items() if at(y + oy, x + ox, ch) == a]
            diag = [n for n, (oy, ox) in DIAG.items() if at(y + oy, x + ox, ch) == a and n[0] not in open_ and n[1] not in open_]
            if len(open_) >= 3 or sorted(open_) in (['N', 'S'], ['E', 'W']) or len(diag) > 1 or (open_ and diag):
                issues.append((y, x, f'미지원 조합 open={open_} diag={diag}'))
            if len(open_) == 2 and sorted(open_) not in (['N', 'S'], ['E', 'W']):
                grid[y][x] = I[f'{k}_{corner(*open_)}_inner']
            elif len(open_) >= 1:
                grid[y][x] = I[f'{k}_{open_[0]}']
            elif diag:
                grid[y][x] = I[f'{k}_{diag[0]}_outer']
            else:
                grid[y][x] = plain
    return grid, issues

def seam_check(grid):
    """이웃 칸 경계 양쪽 픽셀의 등급(풀/테/물 단계 등)이 같아야 함. 판자(P)·도로-풀 경계는 원래 단단한 경계라 제외."""
    H, W = len(grid), len(grid[0])
    bad = []
    for y in range(H):
        for x in range(W):
            a = tile_cls(grid[y][x])
            for (oy, ox) in ((0, 1), (1, 0)):
                yy, xx = y + oy, x + ox
                if yy >= H or xx >= W:
                    continue
                b = tile_cls(grid[yy][xx])
                ea, eb = (a[:, -1], b[:, 0]) if ox else (a[-1, :], b[0, :])
                n = sum(1 for p, q in zip(ea, eb) if p != q and 'P' not in (p, q) and {p, q} != {'G', 'S'})
                if n:
                    bad.append(((y, x), (yy, xx), n))
    return bad

qa = {'scenes': {}}
for name, lay in SCENES.items():
    grid, issues = build(lay)
    bad = seam_check(grid)
    H, W = len(grid), len(grid[0])
    sc = np.zeros((H * T, W * T, 4), np.uint8)
    for y in range(H):
        for x in range(W):
            sc[y * T:y * T + T, x * T:x * T + T] = tile_img(grid[y][x])
    Image.fromarray(sc, 'RGBA').resize((W * T * 2, H * T * 2), Image.NEAREST).save(f'{OUT}/preview_ext2_{name}.png')
    qa['scenes'][name] = {'layout': lay, 'grid_global_index': grid, 'unsupported_cells': issues, 'seam_class_mismatch': bad}
    print(name, 'unsupported', issues, 'seam_mismatch', bad)

# ---- 반복 이음새: 단독 반복 타일 3x3 + 직선 타일 가로/세로 반복 ----
def selfseam(cls, horiz):
    e1, e2 = (cls[:, -1], cls[:, 0]) if horiz else (cls[-1, :], cls[0, :])
    return int(sum(1 for p, q in zip(e1, e2) if p != q))
rep_issue = {}
for t in TILES:
    n = t['name']
    if n in ('ford_a', 'ford_b'):
        rep_issue[n] = selfseam(t['cls'], True) + selfseam(t['cls'], False)
    elif n.endswith(('_N', '_S')) and not n.startswith('bridge'):
        rep_issue[n] = selfseam(t['cls'], True)
    elif n.endswith(('_E', '_W')) and not n.startswith('bridge'):
        rep_issue[n] = selfseam(t['cls'], False)
qa['straight_repeat_class_mismatch'] = {k: v for k, v in rep_issue.items() if v}
# 먼 쪽 가장자리 = 바탕 타일 픽셀과 동일해야 함(직선 타일)
far = {}
FARBASE = {'grass_ford': I['ford_a'], 'ford_deep': 0, 'grass_sand': 2, 'sand_ford': I['ford_a']}
OPP = {'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E'}
for k in FARBASE:
    for s in D4:
        im, ref = TL[I[f'{k}_{s}']]['img'], tile_img(FARBASE[k])
        o = OPP[s]
        sl = {'N': (0, slice(None)), 'S': (31, slice(None)), 'W': (slice(None), 0), 'E': (slice(None), 31)}[o]
        # ford_a 는 강돌이 안쪽에만 있어 가장자리는 순수 여울 물과 같음
        far[f'{k}_{s}'] = int(np.any(im[sl][:, :3] != ref[sl][:, :3], axis=1).sum())
qa['far_edge_pixel_diff_vs_base'] = {k: v for k, v in far.items() if v}
# 팔레트: 시트에 쓰인 색이 원본 팔레트(+ford_hi)에 속하는지
pal = {tuple(c[:3]) for c in C.values()} | {tuple(c[:3]) for c in np.unique(src.reshape(-1, 4), axis=0)}
used = {tuple(c[:3]) for c in np.unique(sheet.reshape(-1, 4), axis=0) if c[3] > 0}
qa['off_palette_colors'] = ['%02x%02x%02x' % c for c in used - pal]
qa['new_colors'] = {'ford_hi': '80e8ff'}
qa['alpha_values'] = sorted({int(a) for a in np.unique(sheet[:, :, 3])})
print('repeat', qa['straight_repeat_class_mismatch'], 'far', qa['far_edge_pixel_diff_vs_base'], 'offpal', qa['off_palette_colors'], 'alpha', qa['alpha_values'])

rp = [I['ford_a'], I['ford_b'], I['grass_ford_N'], I['ford_deep_N'], I['grass_sand_N'], I['sand_ford_N'], I['grass_ford_W'], I['ford_deep_E']]
rep = np.zeros((3 * T, len(rp) * (3 * T + 8), 4), np.uint8); rep[:] = (24, 28, 44, 255)
for k, ti in enumerate(rp):
    rep[:, k * (3 * T + 8):k * (3 * T + 8) + 3 * T] = np.tile(tile_img(ti), (3, 3, 1))
Image.fromarray(rep, 'RGBA').resize((rep.shape[1] * 2, rep.shape[0] * 2), Image.NEAREST).save(f'{OUT}/preview_ext2_repeat.png')

# ---- 인덱스 표기 미리보기 ----
K = 2
pv = Image.new('RGBA', (COLS * (T * K + 4) + 4, ROWS * (T * K + 16) + 4), (24, 28, 44, 255))
dr = ImageDraw.Draw(pv)
for i, t in enumerate(TILES):
    x0, y0 = 4 + (i % COLS) * (T * K + 4), 4 + (i // COLS) * (T * K + 16)
    pv.paste(Image.fromarray(t['img'], 'RGBA').resize((T * K, T * K), Image.NEAREST), (x0, y0))
    dr.text((x0, y0 + T * K + 1), str(BASE + i), fill=(255, 220, 120, 255))
pv.save(f'{OUT}/preview_ext2_sheet.png')

# ---- 명세·매핑·manifest 조각 ----
spec = {
    'version': 1, 'date': '2026-11-01', 'key': 'tileset.unity32_ext2',
    'principle': 'Unity 타일맵 가이드 방식: 32x32 격자·여백 0·PPU 32·Point 필터, 사람이 골라 칠하는 개별 타일. 오토타일/런타임 이웃 규칙 없음. 회전 90도 단위만.',
    'sheet': {'file': '/assets/tiles/legend_tileset/tileset_ext2.png', 'size': [COLS * T, ROWS * T], 'cols': COLS, 'rows': ROWS, 'count': N,
              'index_range': [BASE, BASE + N - 1], 'frame_of_global': f'frame = 전역 인덱스 - {BASE}', 'x2': '/assets/tiles/legend_tileset/tileset_ext2_x2.png',
              'empty_frames': [BASE + i for i in range(N, ROWS * COLS)],
              'why_start_110': '기존 tileset_ext.png(320x256)의 프레임 74~79(전역 104~109)는 빈 칸이지만 텍스처에 이미 존재 — 겹침 방지로 110부터',
              'source': 'generated(procedural) — 이미지 생성 모델 호출 0회. 원본 TileMap.png 0·1·2·3·5번 픽셀/팔레트 파생 + 신규 1색 ford_hi(80e8ff)'},
    'conventions': {
        'pair_rule': 'A→B 세트(grass_ford, ford_deep, grass_sand, sand_ford)는 항상 B 칸(낮은/젖은 쪽)에 칠한다. 이름 방향 = A 가 있는 쪽. 기존 shore_* 와 같은 규칙.',
        'inner_outer': '_inner = A 가 두 변(예: NW_inner = N·W 쪽이 A). _outer = A 가 대각 꼭짓점에만(예: NW_outer = 북서 대각만 A). 기존 shore_NW_inner/outer 와 동일 의미.',
        'chain': '풀 → (grass_ford) → 여울 → (ford_deep) → 깊은 물(0). 풀 → (grass_sand) → 모래 → (sand_ford) → 여울. 각 B 칸의 먼 쪽 가장자리는 B 바탕 타일과 픽셀 동일 → 단계를 이어 붙일 수 있음.',
        'water_ramp': '수심 3단(무늬색/바탕색): 여울 80e8ff/00d4ff, 얕은 물(원본 1번) 00d4ff/0094ff, 깊은 물(원본 0번) 0094ff/005aff. 무늬 위치는 원본 0·1번과 같아 칸 경계에서 이어짐.',
        'ford_vs_water_light': '여울(ford_a/b)은 원본 1번(water_light, s)보다 한 단계 밝음. 1번과 여울을 직접 맞대면 경계가 생김 — ford_deep 의 중간 띠가 1번 색이므로 깊은 물로 갈 때 사용.',
        'bridge_end': '도로 모래(2) 칸에 칠함. 방향 = 판자 다리(5)가 있는 쪽. 가로 다리(E/W)는 판자 5번을 rot 1(90도)로 둔 것과 맞물림.',
        'unsupported': 'A 가 마주보는 두 변(N·S 또는 E·W), 3변 이상, 직선+반대편 대각, 한 칸에 서로 다른 A 두 종(풀과 모래 동시) 조합 타일은 없음 — 지도에서 피하거나 추가 제작 요청. 또한 B 칸의 대각 이웃에 A 보다 한 단계 위 지형이 닿으면(예: 깊은 물 칸 대각에 풀) 모서리 3~6px 이 어긋남 → 깊은 물은 대각 포함 8방향을 여울로 감쌀 것.',
    },
    'tiles': [{'index': BASE + i, 'frame': i, 'row': i // COLS, 'col': i % COLS, 'name': t['name'], 'use': t['use'], 'paint_on': t['paint_on'], 'toward': t['toward'],
               'code': t['code'], 'collider': t['collider'], 'place_next_to': t['near'], 'alpha': False, 'source': 'generated'} for i, t in enumerate(TILES)],
}
json.dump(spec, open(f'{OUT}/tileset_ext2_spec.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(sorted(idx.items())), open(f'{OUT}/v2_tilemap_ext2.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
frag = {'tileset.unity32_ext2': {
    'path': '/assets/tiles/legend_tileset/tileset_ext2.png', 'type': 'tileset', 'frame': [T, T], 'size': [COLS * T, ROWS * T], 'count': N,
    'global_index_start': BASE, 'variants': {'x2': '/assets/tiles/legend_tileset/tileset_ext2_x2.png'}, 'alpha': '전부 불투명',
    'filter': 'nearest(Point), pixelArt=true, 정수 배율만', 'spec': '/assets/tiles/legend_tileset/tileset_ext2_spec.json',
    'index_map': '/assets/tiles/legend_tileset/v2_tilemap_ext2.json',
    'generator': 'docker/gemini/legend_ext2_pp.py (절차적 조립, 이미지 모델 호출 0회)',
    'license': '원본 TileMap.png 파생물 — 원본 라이선스 미확인(개발 한정). 원본 권리 확인 전 외부 공개 금지', 'verify': True,
    'load_hint': f"this.load.spritesheet('unity_tilemap_ext2', path, {{frameWidth:32, frameHeight:32}}) — 프레임 = 전역 인덱스 - {BASE}"}}
json.dump(frag, open(f'{OUT}/manifest_fragment_tileset_ext2.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(qa, open(f'{OUT}/qa_ext2.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('tiles', N, 'sheet', sim.size, 'range', BASE, BASE + N - 1)
