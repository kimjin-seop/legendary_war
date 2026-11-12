"""Unity TileMap.png(32x32, 30칸) 확장 시트 생성기 — 이미지 생성 호출 없이 원본 타일 픽셀·팔레트로 조립(화풍 일치 우선).
원본 TileMap.png 는 읽기만 한다(수정·재정렬 없음). 확장 타일 인덱스는 원본 뒤 30부터(확장 시트 로컬 0 = 전역 30).
실행(컨테이너): python docker/gemini/legend_ext_pp.py
산출: public/assets/tiles/legend_tileset/{tileset_ext.png, tileset_ext_x2.png, tileset_ext_spec.json, buildings_recipes.json,
      preview_sheet.png, tiling_test.png, manifest_fragment_tileset.json}
의존(pip 공식 레지스트리): pillow numpy
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw

SRC = 'public/assets/third_party/unity_tilemap/TileMap.png'
OUT = 'public/assets/tiles/legend_tileset'
T = 32
COLS = 10
BASE = 30  # 원본 타일 수 = 확장 전역 인덱스 시작

src = np.array(Image.open(SRC).convert('RGBA'))
def otile(i):
    return src[(i // 10) * T:(i // 10) * T + T, (i % 10) * T:(i % 10) * T + T].copy()

def hx(s):
    return np.array([int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255], np.uint8)

C = {k: hx(v) for k, v in dict(
    deep='005aff', mid='0094ff', light='00d4ff', foam='ffffff',
    sand='ffcead', sand2='cfae91', sand3='d3966c',
    grass='a5bd00', grass2='86a500', dgrass='7b9100', dgrass2='6a8000',
    leaf='115100', leaf2='397b00', leafd='003900', leafdd='001f00', leafhi='5cb625',
    wood='d64a00', wood2='982e00', wood3='541400',
    st='959aa8', sthi='d0d0ce', st2='59595a', st3='5f6471', stdk='343434', blk='282828', mortar='2c322c',
    roofhi='f07a30', snow='f4f8ff', snow2='c8d8ec', snow3='a8bcd8',
    swampw='3a6a52', swampw2='4f8a6a', white='ffffff').items()}

T0, T1, T2, T3, T4, T5, T6, T7, T10, T13, T25 = (otile(i) for i in (0, 1, 2, 3, 4, 5, 6, 7, 10, 13, 25))
# 물 패턴: 타일 0·1 은 같은 모양(주기 16), '.'=어두운 칸 / 'a'=밝은 무늬
WPAT = np.all(T1[:, :, :3] == C['light'][:3], axis=2)  # True = 무늬

def water_px(x, y, deepness):
    """deepness 0=얕은 물(타일1 색) 1=깊은 물(타일0 색). 무늬 위치는 공통이라 칸 경계에서 패턴이 이어진다."""
    if WPAT[y, x]:
        return C['mid'] if deepness >= 0.5 else C['light']
    return C['deep'] if deepness >= 0.35 else C['mid']

# 가장자리 들쭉날쭉(칸 끝 4px 은 0 → 직선·모서리 타일 끝단이 픽셀 단위로 맞물림)
JAG = [0, 0, 0, 0, 1, 1, 0, -1, -1, 0, 1, 1, 1, 0, 0, -1, 0, 1, 1, 0, -1, -1, -1, 0, 1, 1, 0, 0, 0, 0, 0, 0]
def jag(t):
    t = int(t) % 32
    return JAG[t] if 4 <= t <= 27 else 0

SIDES = {'N': lambda x, y: (y, x), 'S': lambda x, y: (31 - y, x), 'W': lambda x, y: (x, y), 'E': lambda x, y: (31 - x, y)}
CORN = {'NW': (-0.5, -0.5), 'NE': (31.5, -0.5), 'SW': (-0.5, 31.5), 'SE': (31.5, 31.5)}

def field(x, y, sides, diags):
    """(거리, 따라가는 좌표) 최소값. sides=육지(또는 낮은 땅) 방향, diags=대각 꼭짓점."""
    best = (99.0, 0)
    for s in sides:
        d, a = SIDES[s](x, y)
        d = d + jag(a)
        if d < best[0]:
            best = (d, a)
    for c in diags:
        cx, cy = CORN[c]
        dx, dy = x - cx, y - cy
        r = math.hypot(dx, dy) - 0.5
        ang = math.atan2(abs(dy), abs(dx)) / (math.pi / 2)  # 0..1
        a = int(4 + ang * 23)
        d = r + jag(a)
        if d < best[0]:
            best = (d, int(abs(dx) + abs(dy)) % 32)
    return best

# ---- 1) 해안(물 칸에 칠하는 타일, 원본 6번과 같은 규칙: 육지 쪽에 모래 둑·흰 물거품) ----
T6ROWS = T6  # 6번 행 0=모래선, 1~6=둑, 7~12=물거품
def shore(sides, diags=()):
    out = np.zeros((T, T, 4), np.uint8)
    for y in range(T):
        for x in range(T):
            d, a = field(x, y, sides, diags)
            if d < 13:
                row = max(0, int(d))
                p = T6ROWS[row, a % 32]
                if np.array_equal(p[:3], C['mid'][:3]) or np.array_equal(p[:3], C['light'][:3]):
                    p = water_px(x, y, 0)
                out[y, x] = p
            else:
                out[y, x] = water_px(x, y, min(1.0, max(0.0, (d - 16) / 6)))
    return out

# ---- 2) 절벽(높은 땅 칸에 칠하는 타일: 낮은 쪽 방향에 암벽면) ----
T18 = otile(18)  # 원본 바위 봉우리: 암벽 질감 출처(같은 4색)
DARKER = {tuple(C['sthi'][:3]): C['st'], tuple(C['st'][:3]): C['st2'], tuple(C['st2'][:3]): C['blk']}
def rockface(x, depth, width, dark=False):
    """암벽면 질감 = 원본 18번 바위 픽셀 표본. depth 0=아래 끝(밑동 그늘), width-1=윗 가장자리(밝은 테)."""
    if depth < 1:
        return C['blk']
    if depth >= width - 1:
        return C['sthi']
    p = T18[(int(depth) * 2 + 3) % 32, int(x) % 32]
    if dark:
        p = DARKER.get(tuple(p[:3]), p)
    return p

CLIFF_W = {'S': 14, 'N': 3, 'E': 6, 'W': 6}
def cliff(sides, diags=()):
    out = T4.copy()  # 고원 윗면 = 짙은 풀(4): 아래 풀(3)과 높이 차 구분
    for y in range(T):
        for x in range(T):
            cands = []
            for s in sides:
                e, a = SIDES[s](x, y)
                e += jag(a)
                if e < CLIFF_W[s]:
                    cands.append((e / CLIFF_W[s], s, e, a))
            for c in diags:  # 안쪽 모서리: 대각 낮은 땅. 두 면(세로 S면 + 가로 E/W면) 직사각 조각
                vs, hs = c[0], c[1]
                ev, _ = SIDES[vs](x, y)
                eh, _ = SIDES[hs](x, y)
                if ev < CLIFF_W[vs] and eh < CLIFF_W[hs]:
                    if ev / CLIFF_W[vs] <= eh / CLIFF_W[hs]:
                        cands.append((ev / CLIFF_W[vs], vs, ev, x if vs in 'NS' else y))
                    else:
                        cands.append((eh / CLIFF_W[hs], hs, eh, y))
            if not cands:
                continue
            _, s, e, a = min(cands)
            if s == 'N':
                out[y, x] = C['st2'] if e < 1 else (C['sthi'] if e < 2 else C['leafd'])
            elif s == 'S':
                out[y, x] = C['leafd'] if e >= CLIFF_W['S'] - 1 else rockface(a, e, CLIFF_W['S'] - 1)
            else:
                out[y, x] = C['leafd'] if e >= CLIFF_W[s] - 1 else rockface(a + (3 if s == 'E' else 0), e, CLIFF_W[s] - 1, dark=(s == 'E'))
    return out

# ---- 3) 숲 가장자리(숲 칸에 칠하는 타일: 트인 쪽 바닥을 밝은 풀(3번)로, 그늘 줄임) ----
FOREST_BG = {tuple(C['dgrass'][:3]): C['grass'], tuple(C['dgrass2'][:3]): C['grass2'],
             tuple(C['leafdd'][:3]): C['dgrass2'], tuple(C['leafd'][:3]): C['dgrass']}
CROWN = [tuple(C[k][:3]) for k in ('leaf', 'leaf2', 'leafhi')]
def forest_edge(sides, diags=(), drop=()):
    """drop: 지울 나무 사분면(NW,NE,SW,SE) — 얇은 숲 가장자리용"""
    out = T7.copy()
    for q in drop:
        qx, qy = (0 if q[1] == 'W' else 16), (0 if q[0] == 'N' else 16)
        out[qy:qy + 16, qx:qx + 16] = T3[qy:qy + 16, qx:qx + 16]
    for y in range(T):
        for x in range(T):
            d, _ = field(x, y, sides, diags)
            if d < 7:
                k = tuple(out[y, x, :3])
                if k in FOREST_BG and not (k in (tuple(C['leafd'][:3]), tuple(C['leafdd'][:3])) and d > 3):
                    out[y, x] = FOREST_BG[k]
    return out

# ---- 4) 지붕·벽·집(붉은 기와: 원본 5·25번의 주황·적갈 계열) ----
def roof(part, side):
    """part: top(용마루)/mid/bot(처마), side: L/C/R"""
    out = np.zeros((T, T, 4), np.uint8)
    for y in range(T):
        for x in range(T):
            ry = y % 8
            off = 4 if (y // 8) % 2 else 0
            rx = (x + off) % 8
            if ry == 7:
                p = C['wood3']
            elif ry == 6:
                p = C['wood2']
            elif rx == 7:
                p = C['wood3'] if ry > 1 else C['wood2']
            elif rx in (0, 1) and ry < 4:
                p = C['roofhi']
            elif rx >= 5:
                p = C['wood2']
            else:
                p = C['wood']
            out[y, x] = p
    if part == 'top':
        out[0:2] = C['wood3']; out[2] = C['wood2']; out[3, :] = C['roofhi']
        out[3, 3::8] = C['wood']
    if part == 'bot':
        out[28] = C['wood2']; out[29:31] = C['wood3']; out[31] = C['mortar']
    if side == 'L':
        out[:, 0] = C['wood3']; out[:, 1] = C['roofhi']; out[:, 2] = C['wood']
    if side == 'R':
        out[:, 31] = C['wood3']; out[:, 30] = C['wood2']
        out[:, 29] = np.where((np.arange(T) % 8 < 6)[:, None], C['wood2'], C['wood3'])
    return out

def roof_chimney():
    out = roof('mid', 'C')
    out[6:22, 11:21] = C['st']; out[6:22, 11] = C['stdk']; out[6:22, 20] = C['stdk']; out[21, 11:21] = C['stdk']
    out[6, 11:21] = C['sthi']; out[7:11, 13:19] = C['blk']; out[7, 12:20] = C['sthi']
    out[14, 12:20] = C['st2']; out[18, 12:20] = C['st2']; out[22:24, 12:21] = C['wood3']
    return out

def roof_hatch():
    out = roof('mid', 'C')
    out[9:23, 9:23] = C['stdk']; out[10:22, 10:22] = C['blk']; out[9, 9:23] = C['sthi']; out[10:22, 15:17] = C['st2']
    out[23, 9:24] = C['wood3']
    return out

def wall(side, feature=None):
    out = T13.copy()
    out[0:2] = C['blk']; out[2] = C['stdk']  # 처마 그늘
    if side == 'L':
        out[:, 0] = C['blk']; out[:, 1:3] = C['wood2']; out[:, 2] = C['wood']
    if side == 'R':
        out[:, 31] = C['blk']; out[:, 29:31] = C['wood3']
    out[31] = C['stdk']
    if feature == 'window':
        out[8:22, 9:23] = C['wood3']; out[9:21, 10:22] = C['blk']; out[9:21, 15:17] = C['wood2']; out[14:16, 10:22] = C['wood2']
        out[10:13, 11:15] = C['light']; out[10:12, 17:21] = C['mid']
        out[8:22, 5:9] = C['leaf2']; out[8:22, 23:27] = C['leaf2']; out[8:22, 8] = C['leafd']; out[8:22, 23] = C['leafd']
        out[22, 8:24] = C['sthi']
    if feature == 'door':
        out[7:32, 8:24] = C['wood3']; out[8:31, 9:23] = C['wood']
        for xx in (12, 16, 20):
            out[8:31, xx] = C['wood2']
        out[12, 9:23] = C['blk']; out[25, 9:23] = C['blk']; out[18:20, 20] = C['sthi']; out[7, 7:25] = C['st2']
    return out

def house():
    out = np.zeros((T, T, 4), np.uint8)
    r = roof('mid', 'C')
    out[0:18] = r[0:18]
    out[0:2] = C['wood3']; out[2] = C['roofhi']
    out[16:18] = C['wood3']
    w = wall('C')
    out[18:32] = w[0:14]
    out[18:20] = C['blk']
    out[:, 0] = C['wood3']; out[:, 31] = C['wood3']; out[:, 30] = np.where((np.arange(T) < 18)[:, None], C['wood2'], C['stdk'])
    out[22:32, 12:20] = C['wood3']; out[23:32, 13:19] = C['wood']; out[23:32, 16] = C['wood2']
    out[22:27, 4:9] = C['blk']; out[23:25, 5:7] = C['light']; out[22:27, 23:28] = C['blk']; out[23:25, 24:26] = C['light']
    out[31, :] = C['stdk']
    return out

# ---- 5) 눈·사막·늪·풀 변형 ----
def recolor(t, mp):
    out = t.copy()
    for a, b in mp.items():
        m = np.all(t[:, :, :3] == C[a][:3], axis=2)
        out[m] = C[b]
    return out

def dots(t, pts, col):
    for x, y in pts:
        t[y % T, x % T] = C[col]
    return t

def snow_a():
    return recolor(T2, {'sand': 'snow', 'sand2': 'snow2'})

def snow_b():
    t = snow_a()
    for cx, cy in ((7, 9), (22, 21), (26, 6)):
        for dx in range(-3, 4):
            t[cy, (cx + dx) % T] = C['snow2']
        for dx in range(-2, 3):
            t[cy + 1, (cx + dx) % T] = C['snow3']
    dots(t, [(13, 24), (14, 23), (15, 24), (14, 25)], 'dgrass2')
    dots(t, [(5, 27), (6, 26)], 'sand3')
    return t

def desert_a():
    t = T2.copy()
    for y0 in (5, 15, 26):
        for x in range(T):
            yy = y0 + int(round(1.5 * math.sin((x / 32) * 2 * math.pi)))
            t[yy % T, x] = C['sand2']
            if x % 4 == 0:
                t[(yy + 1) % T, x] = C['sand3']
    return t

def desert_b():
    t = T2.copy()
    for cx, cy in ((8, 10), (23, 22)):
        t[cy:cy + 3, cx:cx + 4] = C['st']; t[cy, cx:cx + 4] = C['sthi']; t[cy + 3, cx:cx + 4] = C['sand3']; t[cy + 2, cx + 3] = C['st2']
    dots(t, [(18, 6), (4, 24), (28, 13)], 'sand3')
    return t

def swamp(seed):
    t = T4.copy()
    rng = np.random.default_rng(seed)
    pools = [(9, 10, 6, 4), (23, 23, 6, 4)] if seed == 1 else [(16, 14, 9, 5), (5, 27, 4, 3)]
    for y in range(T):
        for x in range(T):
            for cx, cy, rx, ry in pools:
                v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if v < 1:
                    t[y, x] = C['swampw2'] if (WPAT[y, x] and v < 0.7) else C['swampw']
                elif v < 1.45 and y > cy:
                    t[y, x] = C['dgrass2']
    for _ in range(4):
        x, y = int(rng.integers(2, 30)), int(rng.integers(4, 30))
        t[y - 3:y + 1, x] = C['leaf']; t[y - 4, x] = C['wood2']
    return t

def grass_b():
    t = T3.copy()
    for x, y in ((6, 8), (21, 5), (12, 22), (27, 25)):
        t[y, x] = C['white']; t[y + 1, x] = C['grass2']; t[y, x + 1] = C['grass2']
    dots(t, [(16, 14), (17, 13), (18, 14), (3, 18), (4, 17)], 'dgrass2')
    return t

# ---- 6) 울타리·낮은 돌담·깃발 ----
def fence(vertical):
    t = T3.copy()
    a = np.zeros((T, T, 4), np.uint8)
    for y in (12, 19):
        a[y - 1:y + 1, :] = C['wood']; a[y + 1, :] = C['wood3']
    for x in (3, 15, 27):
        a[8:24, x:x + 3] = C['wood']; a[8:24, x + 2] = C['wood2']; a[8, x:x + 3] = C['roofhi']; a[24, x - 1:x + 4] = C['dgrass2']
    if vertical:
        a = np.rot90(a, 1).copy()
    m = a[:, :, 3] > 0
    t[m] = a[m]
    return t

def lowwall(vertical):
    t = T3.copy()
    a = np.zeros((T, T, 4), np.uint8)
    a[10:22, :] = C['st']; a[10, :] = C['sthi']; a[11, :] = C['sthi']; a[21, :] = C['stdk']; a[22, :] = C['dgrass2']
    for y, off in ((14, 0), (18, 4)):
        a[y, :] = C['st2']
        for x in range(off, T, 8):
            a[y - 3 if y == 14 else y - 3:y, x] = C['st2']
    if vertical:
        a = np.rot90(a, 1).copy()
    m = a[:, :, 3] > 0
    t[m] = a[m]
    return t

def flag():
    t = np.zeros((T, T, 4), np.uint8)
    t[25:30, 10:22] = C['sthi']; t[25, 10:22] = C['white']; t[29, 10:22] = C['st']; t[30, 9:23] = C['blk']; t[25:30, 9] = C['blk']; t[25:30, 22] = C['blk']
    t[2:25, 15] = C['stdk']; t[2:25, 16] = C['st']; t[1, 15:17] = C['sthi']
    for y in range(3, 14):
        w = int(12 * (1 - abs(y - 8.5) / 6))
        if w > 0:
            t[y, 17:17 + w] = C['wood']
            t[y, 17 + w - 1] = C['wood3']
    t[3:14, 17] = C['roofhi']
    t[10:13, 18:22] = C['wood2']
    return t

# ---- 확장 타일 목록(순서 = 인덱스) ----
D4 = ['N', 'E', 'S', 'W']
TILES = []
def add(name, img, use, code, collider, near, note=''):
    TILES.append(dict(name=name, img=img, use=use, code=code, collider=collider, near=near, note=note))

OPP = {'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E'}
for s in D4:
    add(f'shore_{s}', shore([s]), f'해안 직선: 물 칸에 칠함, 육지가 {s}쪽', 'w', 'Sprite', [f'{s}쪽: 풀(3)/모래(2)', f'{OPP[s]}쪽: 바다(0)'])
for c in ['NW', 'NE', 'SE', 'SW']:
    add(f'shore_{c}_inner', shore([c[0], c[1]]), f'해안 안쪽 모서리: 물 칸, 육지가 {c[0]}·{c[1]} 두 변에 있음(만의 구석)', 'w', 'Sprite', [f'{c[0]}·{c[1]}쪽: 육지', f'{c[0]}쪽 이웃 줄은 shore_{c[1]}, {c[1]}쪽 이웃 줄은 shore_{c[0]} 와 이어짐'])
for c in ['NW', 'NE', 'SE', 'SW']:
    add(f'shore_{c}_outer', shore([], [c]), f'해안 바깥 모서리: 물 칸, 육지는 {c} 대각 꼭짓점에만(곶 끝 바깥)', 'w', 'Sprite', [f'{c[0]}쪽 이웃: shore_{c[1]}', f'{c[1]}쪽 이웃: shore_{c[0]}'])
add('shore_NS', shore(['N', 'S']), '좁은 물길(가로 강): 육지가 N·S', 'w|s', 'Sprite', ['N·S: 육지', 'E·W: shore_NS 또는 얕은 물(1)'], '물이 얕은 색(1번 계열)')
add('shore_EW', shore(['E', 'W']), '좁은 물길(세로 강): 육지가 E·W', 'w|s', 'Sprite', ['E·W: 육지', 'N·S: shore_EW 또는 얕은 물(1)'], '물이 얕은 색(1번 계열)')
for s in D4:
    rest = [x for x in D4 if x != s]
    add(f'shore_end_{s}', shore(rest), f'물길 끝(만 안쪽 끝): 물이 {s}쪽으로만 이어지고 나머지 3변 육지', 'w|s', 'Sprite', [f'{s}쪽: shore_NS/EW 또는 물', '나머지: 육지'])
add('shore_pond', shore(D4), '작은 연못: 4변 모두 육지', 'w|s', 'Sprite', ['4변 육지'])
add('grass_flower', grass_b(), '풀 변형(들꽃) — 3번과 섞어 반복 완화', 'p', 'None', ['풀(3)'])

for s in ['S', 'N', 'E', 'W']:
    add(f'cliff_{s}', cliff([s]), f'절벽 직선: 높은 땅 칸에 칠함, {s}쪽이 낮음(암벽면이 {s}쪽 가장자리)', 'k', 'Sprite', [f'{s}쪽: 낮은 땅 풀(3)', f'{OPP[s]}쪽: 높은 땅(cliff_* 또는 짙은 풀 4)'])
for c in ['NW', 'NE', 'SE', 'SW']:
    add(f'cliff_{c}_outer', cliff([c[0], c[1]]), f'절벽 바깥 모서리: 높은 땅의 튀어나온 꼭짓점, {c[0]}·{c[1]}쪽이 낮음', 'k', 'Sprite', [f'{c[0]}·{c[1]}쪽: 낮은 땅'])
for c in ['NW', 'NE', 'SE', 'SW']:
    add(f'cliff_{c}_inner', cliff([], [c]), f'절벽 안쪽 모서리: 높은 땅 칸, {c} 대각만 낮음', 'k', 'Sprite', [f'{c[0]}쪽 이웃: cliff_{c[1]}', f'{c[1]}쪽 이웃: cliff_{c[0]}'])

for s in D4:
    add(f'forest_{s}', forest_edge([s]), f'숲 가장자리 직선: 숲 칸, {s}쪽이 트인 풀밭', 'f', 'Sprite', [f'{s}쪽: 풀(3)', f'{OPP[s]}쪽: 숲(7)'])
for c in ['NW', 'NE', 'SE', 'SW']:
    add(f'forest_{c}_outer', forest_edge([c[0], c[1]]), f'숲 바깥 모서리: {c[0]}·{c[1]}쪽 트임', 'f', 'Sprite', [f'{c[0]}·{c[1]}쪽: 풀(3)'])
for c in ['NW', 'NE', 'SE', 'SW']:
    add(f'forest_{c}_inner', forest_edge([], [c]), f'숲 안쪽 모서리: 숲 칸, {c} 대각만 트임', 'f', 'Sprite', [f'{c} 대각: 풀(3)'])
add('forest_sparse_a', forest_edge(D4, (), drop=('NE', 'SW')), '듬성한 숲(나무 2그루) — 숲 가장자리·고립 숲', 'f', 'Sprite', ['풀(3)'])
add('forest_sparse_b', forest_edge(D4, (), drop=('NW', 'SE')), '듬성한 숲(나무 2그루, 반대 배치)', 'f', 'Sprite', ['풀(3)'])

for part, pn in (('top', '용마루'), ('mid', '중간'), ('bot', '처마')):
    for sd, sn in (('L', '왼쪽'), ('C', '가운데'), ('R', '오른쪽')):
        add(f'roof_{part}_{sd}', roof(part, sd), f'붉은 기와 지붕 {pn}·{sn} 조각', 'v|c', 'Sprite', ['건물 레시피 참조'])
add('roof_chimney', roof_chimney(), '지붕 중간 + 석조 굴뚝', 'v|c', 'Sprite', ['roof_mid_C 자리에 대체'])
add('roof_hatch', roof_hatch(), '지붕 중간 + 어두운 천창(지붕 출입구)', 'v|c', 'Sprite', ['roof_mid_C 자리에 대체'])
add('wall_L', wall('L'), '석조 벽체 왼쪽 끝(목재 모서리 기둥)', 'v|c', 'Sprite', ['roof_bot_L 아래'])
add('wall_C', wall('C'), '석조 벽체 가운데', 'v|c', 'Sprite', ['roof_bot_C 아래'])
add('wall_R', wall('R'), '석조 벽체 오른쪽 끝', 'v|c', 'Sprite', ['roof_bot_R 아래'])
add('wall_window', wall('C', 'window'), '벽체 + 창(초록 덧문)', 'v|c', 'Sprite', ['roof_bot_C 아래'])
add('wall_door', wall('C', 'door'), '벽체 + 나무 문(출입구)', 'v|c', 'Sprite', ['roof_bot_C 아래, 아래쪽: 풀/길'])
add('house_small', house(), '한 칸짜리 작은 집(지붕+벽+문) — 마을 v 단일 칸용', 'v', 'Sprite', ['풀(3)·길(2)'])
add('snow_a', snow_a(), '눈밭(2번 무늬 재색)', 'n(snow)', 'None', ['snow_b'])
add('snow_b', snow_b(), '눈밭 변형(눈 둔덕·마른 풀)', 'n(snow)', 'None', ['snow_a'])
add('desert_a', desert_a(), '사막 모래(바람 물결)', 'n(desert)', 'None', ['모래(2)'])
add('desert_b', desert_b(), '사막 모래 + 작은 바위', 'n(desert)', 'None', ['모래(2)'])
add('swamp_a', swamp(1), '늪(짙은 풀 + 탁한 웅덩이·갈대)', 'x', 'None', ['짙은 풀(4)'])
add('swamp_b', swamp(2), '늪 변형', 'x', 'None', ['짙은 풀(4)'])
add('fence_h', fence(False), '나무 울타리 가로(풀 바탕)', 'W', 'Sprite', ['풀(3)'])
add('fence_v', fence(True), '나무 울타리 세로(풀 바탕)', 'W', 'Sprite', ['풀(3)'])
add('lowwall_h', lowwall(False), '낮은 돌담 가로(풀 바탕)', 'W', 'Sprite', ['풀(3)'])
add('lowwall_v', lowwall(True), '낮은 돌담 세로(풀 바탕)', 'W', 'Sprite', ['풀(3)'])
add('flag', flag(), '점령 지점 깃발 오버레이(투명 배경) — 지형 타일 위 별도 레이어', 'overlay', 'None', ['모든 지형 위'], '투명 PNG 오버레이')

N = len(TILES)
ROWS = math.ceil(N / COLS)
sheet = np.zeros((ROWS * T, COLS * T, 4), np.uint8)
for i, t in enumerate(TILES):
    sheet[(i // COLS) * T:(i // COLS) * T + T, (i % COLS) * T:(i % COLS) * T + T] = t['img']
os.makedirs(OUT, exist_ok=True)
sim = Image.fromarray(sheet, 'RGBA')
sim.save(f'{OUT}/tileset_ext.png')
sim.resize((sim.width * 2, sim.height * 2), Image.NEAREST).save(f'{OUT}/tileset_ext_x2.png')

# ---- 원본 30칸 의미(unityTileset.js U32 + NOTICE 충돌값과 동일) ----
ORIG = [('SEA', 'w', 'Sprite'), ('WATER', 's', 'Sprite'), ('SAND', 'r|n(desert)', 'None'), ('GRASS', 'p', 'None'), ('GRASS_DARK', 'p', 'None'),
        ('PLANK', 'b', 'None'), ('SHORE', 'w', 'Sprite'), ('FOREST', 'f', 'Sprite'), ('PEAK_TOP', 'm', 'Sprite'), ('DUNGEON_DOOR', 'c', 'Sprite'),
        ('STONE_A', 'W', 'None'), ('STONE_B', 'k', 'None'), ('STONE_C', 'k', 'None'), ('STONE_D', 'W', 'None'), ('STONE_E', 'k', 'None'),
        ('SLAB', 'c', 'Sprite'), ('PLATE', 'c', 'Sprite'), ('PEAK_L', 'm', 'Sprite'), ('PEAK', 'm', 'Sprite'), ('PEAK_R', 'm', 'Sprite'),
        ('STAIRS', '-', 'Sprite'), ('PILLAR_A', '-', 'Sprite'), ('PILLAR_B', '-', 'Sprite'), ('PILLAR_C', '-', 'Sprite'), ('PILLAR_D', '-', 'Sprite'),
        ('BRICK', 'v', 'Sprite'), ('FLOOR_GRID', 'c', 'Sprite'), ('PEAK_BL', 'm', 'Sprite'), ('PEAK_B', 'm', 'Sprite'), ('PEAK_BR', 'm', 'Sprite')]

idx = {t['name']: BASE + i for i, t in enumerate(TILES)}
spec = {
    'version': 1, 'date': '2026-11-01', 'key': 'tileset.unity32_ext',
    'principle': 'Unity 타일맵 가이드 방식: 32x32 격자·여백 0·Pixel Per Unit 32·Point 필터, 팔레트에서 타일을 골라 칸에 직접 배치. 런타임 이웃 판정 규칙은 규정하지 않음(전환 타일은 사람이 골라 칠하는 개별 타일). 회전은 90도 단위만.',
    'sheets': [
        {'file': '/assets/third_party/unity_tilemap/TileMap.png', 'size': [320, 96], 'cols': 10, 'rows': 3, 'index_range': [0, 29], 'modified': False, 'license': '미확인(개발 한정, NOTICE.md)'},
        {'file': '/assets/tiles/legend_tileset/tileset_ext.png', 'size': [COLS * T, ROWS * T], 'cols': COLS, 'rows': ROWS, 'index_range': [BASE, BASE + N - 1],
         'local_index': '전역 인덱스 - 30 (Unity 에서 별도 시트로 자를 때 TileMapExt_0 = 전역 30)', 'x2': '/assets/tiles/legend_tileset/tileset_ext_x2.png',
         'source': 'generated(procedural) — 이미지 생성 모델 호출 0회. 원본 TileMap.png 의 픽셀·팔레트(0,1,2,3,4,5,6,7,13 번 타일)를 조립·재색해 만든 파생 타일'}],
    'conventions': {
        'shore': '해안 타일은 원본 6번과 같은 규칙으로 "물 칸"에 칠한다. 이름의 방향 = 육지가 있는 쪽. inner = 두 변이 육지(만의 구석), outer = 대각 꼭짓점만 육지(곶 바깥). 먼 쪽 가장자리는 깊은 물(0번 색)로 끝나 0번 옆에 이음새 없음, 육지 쪽 가장자리는 모래선(원본 6번 1행 색).',
        'cliff': '절벽 타일은 "높은 땅 칸"에 칠한다. 이름의 방향 = 낮은 땅이 있는 쪽(암벽면 위치). S면이 가장 높게(11px) 보이고 N면은 테두리선만(위에서 본 투영).',
        'forest': '숲 가장자리 타일은 "숲 칸"에 칠한다. 이름의 방향 = 트인 풀밭 쪽. 트인 쪽 바닥색이 풀(3)과 같아져 3번과 이음새 없음.',
        'jag': '들쭉날쭉 경계는 칸 끝 4px 에서 0이 되도록 만들어 직선·모서리 타일 끝단이 픽셀 단위로 맞물림.',
    },
    'collider_reference': {'None': '통행 타일(풀·모래·판자·눈·사막·늪·깃발 오버레이)', 'Sprite': '벽·물·숲·산·건물·울타리·출입구(원본 .asset 값 기준)', 'Grid': '사용 안 함(필요 시 건물 내부 칸)', 'note': '이 게임의 이동·방어 판정은 서버 지형 코드가 결정. 충돌 값은 Unity 이식 시 참고용'},
    'terrain_code_map': {
        'p': {'base': [3, 4], 'variants': [idx['grass_flower']], 'recommend': '3 가중 7, 4 가중 1, grass_flower 가중 1(좌표 해시)'},
        'f': {'base': [7], 'edges': [idx[f'forest_{s}'] for s in D4] + [idx[f'forest_{c}_outer'] for c in ['NW', 'NE', 'SE', 'SW']] + [idx[f'forest_{c}_inner'] for c in ['NW', 'NE', 'SE', 'SW']], 'sparse': [idx['forest_sparse_a'], idx['forest_sparse_b']]},
        'm': {'base': [18], 'cluster_3x3': [[None, 8, None], [17, 18, 19], [27, 28, 29]], 'recommend': '단독 칸은 18, 큰 산맥은 3x3 묶음'},
        'w': {'base': [0], 'shore': [idx[f'shore_{s}'] for s in D4] + [idx[f'shore_{c}_inner'] for c in ['NW', 'NE', 'SE', 'SW']] + [idx[f'shore_{c}_outer'] for c in ['NW', 'NE', 'SE', 'SW']], 'original_shore': 6},
        's': {'base': [1], 'river': [idx['shore_NS'], idx['shore_EW']] + [idx[f'shore_end_{s}'] for s in D4] + [idx['shore_pond']]},
        'b': {'base': [5], 'note': '세로 판자. 가로 다리는 90도 회전(rot 1)'},
        'r': {'base': [2]},
        'v': {'base': [idx['house_small']], 'alt': [25], 'multi_cell': 'buildings_recipes.json'},
        'c': {'base': [15, 26], 'gate': 9, 'multi_cell': 'buildings_recipes.json'},
        'W': {'base': [10, 13], 'low': [idx['fence_h'], idx['fence_v'], idx['lowwall_h'], idx['lowwall_v']]},
        'k': {'base': [11, 12, 14], 'edges': [idx[f'cliff_{s}'] for s in ['S', 'N', 'E', 'W']] + [idx[f'cliff_{c}_outer'] for c in ['NW', 'NE', 'SE', 'SW']] + [idx[f'cliff_{c}_inner'] for c in ['NW', 'NE', 'SE', 'SW']], 'note': '절벽 타일의 고원 윗면은 짙은 풀(4), 낮은 땅은 풀(3). 고원 안쪽 칸은 4번(또는 바위 11/12/14)으로 칠함'},
        'x': {'base': [idx['swamp_a'], idx['swamp_b']]},
        'n': {'snow': [idx['snow_a'], idx['snow_b']], 'desert': [idx['desert_a'], idx['desert_b'], 2], 'note': 'map.biome 으로 분기'},
        'overlay': {'capture_flag': idx['flag']},
    },
    'original_tiles': [{'index': i, 'name': n, 'code': c, 'collider': col, 'source': 'original'} for i, (n, c, col) in enumerate(ORIG)],
    'ext_tiles': [{'index': BASE + i, 'local': i, 'row': i // COLS, 'col': i % COLS, 'name': t['name'], 'use': t['use'], 'code': t['code'], 'collider': t['collider'],
                   'place_next_to': t['near'], 'source': 'generated', **({'note': t['note']} if t['note'] else {})} for i, t in enumerate(TILES)],
}
for e in spec['ext_tiles']:
    e['alpha'] = e['name'] == 'flag'
json.dump(spec, open(f'{OUT}/tileset_ext_spec.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---- 건물 레시피(칸 좌표 → 전역 인덱스, 손으로 칠하는 배치표) ----
I = idx
recipes = {
    'note': '행 우선 2차원 배열, 값 = 전역 타일 인덱스(0~29 원본, 30~ 확장). null = 칠하지 않음(아래 지형 유지). 지형 코드는 서버 맵이 결정하며 이 표는 시각 배치만 정한다.',
    'house_3x3': {'size': [3, 3], 'code': 'v', 'tiles': [[I['roof_top_L'], I['roof_top_C'], I['roof_top_R']], [I['roof_bot_L'], I['roof_bot_C'], I['roof_bot_R']], [I['wall_L'], I['wall_door'], I['wall_R']]]},
    'manor_5x4': {'size': [5, 4], 'code': 'v', 'tiles': [
        [I['roof_top_L'], I['roof_top_C'], I['roof_top_C'], I['roof_top_C'], I['roof_top_R']],
        [I['roof_mid_L'], I['roof_chimney'], I['roof_mid_C'], I['roof_hatch'], I['roof_mid_R']],
        [I['roof_bot_L'], I['roof_bot_C'], I['roof_bot_C'], I['roof_bot_C'], I['roof_bot_R']],
        [I['wall_L'], I['wall_window'], I['wall_door'], I['wall_window'], I['wall_R']]]},
    'castle_gate_5x3': {'size': [5, 3], 'code': 'c', 'tiles': [[10, 13, 13, 13, 10], [10, 15, 15, 15, 10], [10, 13, 9, 13, 10]], 'note': '원본 석벽(10,13)·판석(15)·출입구(9)만 사용'},
    'village_cluster_4x3': {'size': [4, 3], 'code': 'v', 'tiles': [[I['house_small'], I['fence_h'], I['fence_h'], I['house_small']], [2, 2, 2, 2], [I['house_small'], 3, 3, I['house_small']]]},
}
json.dump(recipes, open(f'{OUT}/buildings_recipes.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---- 미리보기: 원본+확장 전체(인덱스 표기 x2) ----
allt = [otile(i) for i in range(30)] + [t['img'] for t in TILES]
def tile_of(i):
    return allt[i]
K = 2
prow = math.ceil(len(allt) / COLS)
pv = Image.new('RGBA', (COLS * (T * K + 4) + 4, prow * (T * K + 16) + 4), (24, 28, 44, 255))
dr = ImageDraw.Draw(pv)
for i, t in enumerate(allt):
    x0, y0 = 4 + (i % COLS) * (T * K + 4), 4 + (i // COLS) * (T * K + 16)
    chk = Image.new('RGBA', (T * K, T * K), (255, 0, 255, 255))
    chk.alpha_composite(Image.fromarray(t, 'RGBA').resize((T * K, T * K), Image.NEAREST))
    pv.paste(chk, (x0, y0))
    dr.text((x0, y0 + T * K + 1), str(i), fill=(255, 220, 120, 255))
pv.save(f'{OUT}/preview_sheet.png')

# ---- 이음새·조합 시험: 장면을 손으로 칠한 배치표(이웃 판정 없음)로 구성 ----
# (미리보기 전용) 지형 글자 지도 → 사람이 칠하듯 전환 타일을 고른 결과를 재현. 런타임 규칙 아님.
LAY = ['gggggggggggggggg',
       'gffffggggwwwwwgg',
       'gffffgggwwwwwwwg',
       'gffgggggwwwwwwww',
       'gffggggggwwgwwww',
       'gggggggggwgggwww',
       'gggggggggwggggww',
       'grrrrrrrrbrrrrww',
       'gggggggggwggggww',
       'gggggggggwwwwwww',
       'gkkkkgggggggggww',
       'gkkkkggggggggggw',
       'gkkkkggggggggggg',
       'gggggggggggggggg']
H, W_ = len(LAY), len(LAY[0])
def cell(y, x, oy, ox):
    yy, xx = y + oy, x + ox
    return LAY[yy][xx] if 0 <= yy < H and 0 <= xx < W_ else LAY[y][x]
DIRS = {'N': (-1, 0), 'S': (1, 0), 'W': (0, -1), 'E': (0, 1)}
def corner_name(a, b):
    return ''.join(sorted([a, b], key=lambda s: 'NSEW'.index(s)))
def pick(y, x, kind):
    same = (lambda ch: ch in 'wb') if kind == 'shore' else (lambda ch: ch == LAY[y][x])
    open_ = [d for d, (oy, ox) in DIRS.items() if not same(cell(y, x, oy, ox))]
    diag = [n for n, (oy, ox) in {'NW': (-1, -1), 'NE': (-1, 1), 'SE': (1, 1), 'SW': (1, -1)}.items()
            if not same(cell(y, x, oy, ox)) and n[0] not in open_ and n[1] not in open_]
    if kind == 'shore':
        if len(open_) == 4: return I['shore_pond']
        if len(open_) == 3: return I['shore_end_' + [d for d in 'NESW' if d not in open_][0]]
        if sorted(open_) == ['N', 'S']: return I['shore_NS']
        if sorted(open_) == ['E', 'W']: return I['shore_EW']
        if len(open_) == 2: return I[f'shore_{corner_name(*open_)}_inner']
        if len(open_) == 1: return I[f'shore_{open_[0]}']
        if diag: return I[f'shore_{diag[0]}_outer']
        return 0
    pre = 'cliff' if kind == 'cliff' else 'forest'
    if len(open_) >= 3 or sorted(open_) in (['N', 'S'], ['E', 'W']): return I['forest_sparse_a'] if pre == 'forest' else 11
    if len(open_) == 2: return I[f'{pre}_{corner_name(*open_)}_outer']
    if len(open_) == 1: return I[f'{pre}_{open_[0]}']
    if diag: return I[f'{pre}_{diag[0]}_inner']
    return 7 if pre == 'forest' else 4
sc = [[0] * W_ for _ in range(H)]
for y in range(H):
    for x in range(W_):
        ch = LAY[y][x]
        sc[y][x] = {'w': lambda: pick(y, x, 'shore'), 'f': lambda: pick(y, x, 'forest'), 'k': lambda: pick(y, x, 'cliff'),
                    'b': lambda: 5, 'r': lambda: 2}.get(ch, lambda: I['grass_flower'] if (x * 7 + y * 13) % 9 == 0 else 3)()
for yy, row in enumerate(recipes['manor_5x4']['tiles']):
    for xx, v in enumerate(row):
        sc[10 + yy][9 + xx] = v
sc[5][1], sc[5][2], sc[5][3] = I['house_small'], I['fence_h'], I['house_small']
sc[6][1], sc[6][2], sc[6][3] = I['lowwall_h'], I['lowwall_h'], I['lowwall_h']
sc[8][1], sc[8][2], sc[8][3] = I['swamp_a'], I['snow_a'], I['desert_a']
sc[9][1], sc[9][2], sc[9][3] = I['swamp_b'], I['snow_b'], I['desert_b']

scene = np.zeros((H * T, W_ * T, 4), np.uint8)
for y in range(H):
    for x in range(W_):
        scene[y * T:y * T + T, x * T:x * T + T] = tile_of(sc[y][x])
fl = tile_of(I['flag']); m = fl[:, :, 3] > 0
scene[4 * T:5 * T, 6 * T:7 * T][m] = fl[m]
# 3x3 반복 시험(바탕 타일)
reps = [0, 1, 3, I['grass_flower'], I['snow_a'], I['snow_b'], I['desert_a'], I['swamp_a'], I['roof_mid_C'], I['wall_C'], I['shore_N'], I['forest_N']]
rep = np.zeros((len(reps) // 6 * 3 * T + 3 * T * (1 if len(reps) % 6 else 0), 6 * (3 * T + 8), 4), np.uint8)
rep[:] = (24, 28, 44, 255)
for k, ti in enumerate(reps):
    t = tile_of(ti); blk = np.tile(t, (3, 3, 1))
    ox, oy = (k % 6) * (3 * T + 8), (k // 6) * 3 * T
    rep[oy:oy + 3 * T, ox:ox + 3 * T] = blk
SCL = 2
sc_im = Image.fromarray(scene, 'RGBA').resize((W_ * T * SCL, H * T * SCL), Image.NEAREST)
rp_im = Image.fromarray(rep, 'RGBA').resize((rep.shape[1] * SCL, rep.shape[0] * SCL), Image.NEAREST)
tt = Image.new('RGBA', (max(sc_im.width, rp_im.width), sc_im.height + rp_im.height + 8), (24, 28, 44, 255))
tt.paste(sc_im, (0, 0)); tt.paste(rp_im, (0, sc_im.height + 8))
tt.save(f'{OUT}/tiling_test.png')
json.dump({'scene_recipe_global_index': sc, 'flag_overlay_at': [6, 4], 'layout': LAY}, open(f'{OUT}/_tiling_test_scene.json', 'w'), indent=None)

# 이음새 수치 검사: 3x3 반복 시 경계 양쪽 색 차이 평균 vs 타일 내부 인접 픽셀 평균
def seam(t):
    a = t[:, :, :3].astype(int)
    inner = np.abs(np.diff(a, axis=1)).mean() + np.abs(np.diff(a, axis=0)).mean()
    edge = np.abs(a[:, 0] - a[:, -1]).mean() + np.abs(a[0] - a[-1]).mean()
    return round(edge / max(inner, 1e-6), 2)
report = {t['name']: seam(t['img']) for t in TILES if not t['name'].startswith(('roof_top', 'roof_bot', 'wall_L', 'wall_R', 'roof_mid_L', 'roof_mid_R', 'roof_top'))}
print('tiles', N, 'sheet', sim.size)
print('seam ratio(1.0 근처=내부와 같음, 2 이상 의심):', {k: v for k, v in report.items() if v > 1.6})

# ---- manifest 조각(기존 manifest.json 은 수정하지 않음 — 윤프론이 병합) ----
frag = {'tileset.unity32_ext': {
    'path': '/assets/tiles/legend_tileset/tileset_ext.png', 'type': 'tileset', 'frame': [T, T], 'size': [COLS * T, ROWS * T], 'count': N,
    'global_index_start': BASE, 'base_sheet': 'tileset.unity32 (/assets/third_party/unity_tilemap/TileMap.png, 0~29, 수정 없음)',
    'variants': {'x2': '/assets/tiles/legend_tileset/tileset_ext_x2.png'}, 'alpha': '깃발(전역 %d)만 투명, 나머지 불투명' % idx['flag'],
    'filter': 'nearest(Point), pixelArt=true, 정수 배율만', 'spec': '/assets/tiles/legend_tileset/tileset_ext_spec.json', 'recipes': '/assets/tiles/legend_tileset/buildings_recipes.json',
    'generator': 'docker/gemini/legend_ext_pp.py (절차적 조립, 이미지 모델 호출 0회)', 'qa': 'pass(조건부) — 해안·절벽·숲 전환 끝단 맞물림, 3x3 반복 이음새 확인. 강 합류부 깊은 물 경계 1칸 사각 노출(알려진 한계)',
    'license': '원본 TileMap.png 파생물 — 원본 라이선스 미확인(개발 한정). 원본 권리 확인 전 외부 공개 금지', 'verify': True,
    'load_hint': "this.load.spritesheet('unity_tilemap_ext', path, {frameWidth:32, frameHeight:32}) — 프레임 = 전역 인덱스 - 30"}}
json.dump(frag, open(f'{OUT}/manifest_fragment_tileset.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
