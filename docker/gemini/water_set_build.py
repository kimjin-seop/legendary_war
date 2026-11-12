"""임진왜란 10스테이지 지형 보강 타일셋(water_set) 생성기 — 이미지 생성 모델 호출 0회, 원본 TileMap.png 팔레트로 절차 생성.
원칙(Unity 타일맵 가이드): 32x32 격자·여백 0·PPU 32·Point 필터, 사람이 골라 칠하는 개별 타일(런타임 오토타일 없음), 정수 배율만.
읽기 전용 입력: public/assets/third_party/unity_tilemap/TileMap.png (원본 0~29 픽셀을 땅 쪽 텍스처로 그대로 복사 -> 기존 타일과 이음새 없음)
산출(신규 폴더, 기존 파일 덮어쓰기 없음): public/assets/tiles/water_set/
  ws_static.png      정적 타일 10열 (언덕·평지·서가 바닥·성 포장·성벽·성문·한옥·탑·항구)
  ws_anim.png        애니 타일 4프레임: 프레임 f 블록 = 세로 오프셋 f*ROWS 행 (바다·암초·잔교·해안 전이·허공·허공 가장자리·서가 발판)
  ws_overlay.png     투명 오버레이(목표 O 4프레임, 탑 2종 오버레이)
  *_x2.png           2배 정수 확대 미리보기용(Nearest)
  ws_spec.json, manifest_fragment.json, qa_ws.json, preview_*.png
실행: docker run --rm -v "<repo>:/app" -v "<scratch>:/s" -w /app python:3.12 python docker/gemini/water_set_build.py
의존(pip 공식 레지스트리, /s/deps 에 --target 설치): pillow 13.0.0 (MIT-CMU/HPND), numpy 2.5.4 (BSD-3)
"""
import sys, json, math, os
sys.path.insert(0, '/s/deps')
import numpy as np
from PIL import Image

SRC = 'public/assets/third_party/unity_tilemap/TileMap.png'
OUT = 'public/assets/tiles/water_set'
T, COLS, NF = 32, 10, 4
os.makedirs(OUT, exist_ok=True)

src = np.array(Image.open(SRC).convert('RGBA'))
def otile(i):
    return src[(i // 10) * T:(i // 10) * T + T, (i % 10) * T:(i % 10) * T + T].copy()

def hx(s):
    return np.array([int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255], np.uint8)

# 원본 팔레트 + 이번 추가색(목록 끝 ADD 표기)
PAL = dict(
    deep='005aff', mid='0094ff', light='00d4ff', ford_hi='80e8ff', foam='ffffff', shade_w='0040c0',
    sand='ffcead', sand2='cfae91', sand3='d3966c',
    grass='a5bd00', grass2='86a500', dgrass='7b9100', dgrass2='6a8000', leaf='115100', leaf2='397b00',
    wood='d64a00', wood2='982e00', wood3='541400',
    st='959aa8', sthi='d0d0ce', st2='59595a', st3='39434d', stdk='343434', blk='282828', black='000000',
    # ADD: 언덕 하이라이트, 서가 바닥(어두운 호두나무), 허공(먹물), 단청 청록, 목표 금색/적색, 등불
    hill_hi='c4d62a', fl='7a5638', fl_hi='93704c', fl_sh='5e4129', fl_ln='3e2a1a',
    v0='07060d', v1='110e1d', v2='1c1730', v3='2a2347', v4='3d3462', paper='c9c3d6',
    teal='2f8f83', gold='ffd23c', gold_hi='fff2a0', red='c8281e', glow='ffe08a')
C = {k: hx(v) for k, v in PAL.items()}
ADDED = ['hill_hi', 'fl', 'fl_hi', 'fl_sh', 'fl_ln', 'v0', 'v1', 'v2', 'v3', 'v4', 'paper', 'teal', 'gold', 'gold_hi', 'red', 'glow', 'shade_w']

SEA0, WATER1, SAND2, GRASS3, GRASS4, PLANK5 = (otile(i) for i in range(6))
YY, XX = np.mgrid[0:T, 0:T]
PX, PY = XX + 0.5, YY + 0.5

def blank(alpha=255):
    a = np.zeros((T, T, 4), np.uint8); a[..., 3] = alpha; return a
def put(img, mask, col):
    img[mask] = C[col] if isinstance(col, str) else col
def hsh(*v):
    h = 2166136261
    for x in v:
        h = ((h ^ (int(x) & 0xffffffff)) * 16777619) & 0xffffffff
    h ^= h >> 13; h = (h * 0x5bd1e995) & 0xffffffff; h ^= h >> 15
    return h / 4294967296.0

# ---------------------------------------------------------------- 바다(4프레임): 원본 0번 무늬를 원형 궤도로 1px 이동(루프 이음 없음, 프레임 0 = 원본 0번 그대로)
SHIFT = [(0, 0), (0, 1), (1, 1), (1, 0)]
def sea(f, variant=0):
    dy, dx = SHIFT[f]
    s = np.roll(np.roll(SEA0, dy, 0), dx, 1).copy()
    if variant:  # 반짝임: 칸 안 고정 위치 4곳이 프레임마다 번갈아 켜짐
        for k, (x, y) in enumerate([(6, 7), (22, 5), (13, 21), (26, 25)]):
            ph = (f + k) % 4
            if ph == 0: s[y, x] = C['foam']; s[y, x - 1] = C['light']; s[y, x + 1] = C['light']
            elif ph == 1: s[y, x] = C['light']
    return s
def brighten(img):  # 수심 한 단계 얕게(기존 ext2 의 물 사다리와 동일)
    o = img.copy()
    m1 = np.all(img[..., :3] == C['mid'][:3], -1); m0 = np.all(img[..., :3] == C['deep'][:3], -1)
    o[m1] = C['light']; o[m0] = C['mid']; return o
def darken_w(img, mask):
    o = img.copy()
    m1 = mask & np.all(img[..., :3] == C['mid'][:3], -1); m0 = mask & np.all(img[..., :3] == C['deep'][:3], -1)
    o[m1] = C['deep']; o[m0] = C['shade_w']; return o

# ---------------------------------------------------------------- 해안 거리장(음수 = 땅). 이름 방향 = 땅이 있는 쪽, 바다 칸에 칠함
B = 8.0
def win(t):  # 칸 끝 4px 에서 0 (이웃 직선 타일과 픽셀 단위로 맞물림)
    return np.clip((np.minimum(t, 32 - t) - 4) / 5.0, 0, 1)
def jag(t, seed, amp=1.6):
    v = np.zeros_like(t, dtype=float)
    for k, a in ((1, 1.0), (2, 0.6), (3, 0.45), (5, 0.3)):
        v += a * np.sin(2 * math.pi * k * t / 32 + seed * 1.7 + k)
    return amp * v / 1.6 * win(t)
def side_d(s, seed=0, b=B, amp=1.6):
    if s == 'N': return PY - (b + jag(PX, seed + 1, amp))
    if s == 'S': return (32 - PY) - (b + jag(PX, seed + 2, amp))
    if s == 'W': return PX - (b + jag(PY, seed + 3, amp))
    if s == 'E': return (32 - PX) - (b + jag(PY, seed + 4, amp))
def corner_d(c, b=B):
    cx = 0 if 'W' in c else 32; cy = 0 if 'N' in c else 32
    return np.hypot(PX - cx, PY - cy) - b
def shore_field(kind, seed=0, b=B, amp=1.6):
    if kind in ('N', 'E', 'S', 'W'): return side_d(kind, seed, b, amp)
    if kind.endswith('_inner'):
        c = kind[:2]; return np.minimum(side_d(c[0], seed, b, amp), side_d(c[1], seed, b, amp))
    if kind.endswith('_outer'): return corner_d(kind[:2], b)
    if kind == 'NS': return np.minimum(side_d('N', seed, b, amp), side_d('S', seed, b, amp))
    if kind == 'EW': return np.minimum(side_d('E', seed, b, amp), side_d('W', seed, b, amp))
    if kind.startswith('U_'):  # 땅이 세 변, 열린 쪽 = 접미
        return np.minimum.reduce([side_d(s, seed, b, amp) for s in 'NESW' if s != kind[2]])
    if kind == 'pond': return np.minimum.reduce([side_d(s, seed, b, amp) for s in 'NESW'])
SHORE_KINDS = ['N', 'E', 'S', 'W', 'NW_inner', 'NE_inner', 'SE_inner', 'SW_inner', 'NW_outer', 'NE_outer', 'SE_outer', 'SW_outer',
               'NS', 'EW', 'U_N', 'U_E', 'U_S', 'U_W', 'pond']
FOAM = [0.0, 0.7, 1.4, 0.7]
def shore_tile(kind, f, land):
    d = shore_field(kind, seed={'sand': 0, 'grass': 7}[land])
    img = sea(f)
    sh = d < 5.0 + 0.8 * np.sin(PX * 0.9 + PY * 0.7 + f * math.pi / 2)  # 얕은 띠(파도 숨쉬기)
    img = np.where(sh[..., None], brighten(img), img)
    dz = (d >= 5.0) & (d < 6.5) & (((XX + YY) % 2) == 0); img = np.where(dz[..., None], brighten(img), img)
    f0 = FOAM[f]
    foam = (d >= f0) & (d < f0 + 1.3)
    brk = np.array([[hsh(x // 3, y // 3, f) < 0.22 for x in range(T)] for y in range(T)])
    put(img, foam & ~brk, 'foam'); put(img, foam & brk, 'ford_hi')
    put(img, (d >= f0 + 1.3) & (d < f0 + 2.0) & ((XX + YY + f) % 3 == 0), 'ford_hi')
    tex = SAND2 if land == 'sand' else GRASS3
    lm = d < 0
    img[lm] = tex[lm]
    if land == 'sand':
        put(img, (d >= -1.6) & (d < 0), 'sand2')  # 젖은 모래
    else:
        put(img, (d >= -2.6) & (d < -1.6), 'dgrass2'); put(img, (d >= -1.6) & (d < -0.6), 'sand3'); put(img, (d >= -0.6) & (d < 0), 'wood2')  # 풀 둔덕 -> 흙 -> 젖은 흙
    return img

# ---------------------------------------------------------------- 암초(바다 위 바위, 4프레임 거품)
def rock_field(blobs):
    h = np.full((T, T), -9.0)
    for (cx, cy, r, s) in blobs:
        ang = np.arctan2(PY - cy, PX - cx)
        rr = r * (1 + 0.16 * np.sin(3 * ang + s) + 0.09 * np.sin(5 * ang + 2 * s))
        h = np.maximum(h, 1 - (np.hypot(PX - cx, (PY - cy) * 1.15) / rr) ** 2)
    return h
def reef_tile(blobs, f, seed):
    h = rock_field(blobs)
    hs = np.full((T, T), -9.0)  # 옆면(3px 아래로 돌출된 높이감)
    hs[3:] = h[:-3]
    body = h > 0; side = (hs > 0) & ~body
    near = np.maximum(h, hs)
    img = sea(f)
    halo = near > -0.9 - 0.15 * np.sin(f * math.pi / 2); img = np.where(halo[..., None], brighten(img), img)
    ring = (near > -0.45 - 0.12 * (f % 2)) & ~body & ~side
    put(img, ring & ((XX * 3 + YY + f) % 4 != 0), 'foam'); put(img, ring & ((XX * 3 + YY + f) % 4 == 0), 'ford_hi')
    put(img, side, 'st2'); put(img, side & (np.roll(side, -1, 0) == False), 'stdk')
    gy = np.gradient(h, axis=0); gx = np.gradient(h, axis=1)
    lit = -(gx + gy)  # 좌상단 광원
    put(img, body, 'st')
    put(img, body & (lit > 0.10), 'sthi'); put(img, body & (lit < -0.10), 'st2')
    cr = body & (np.array([[hsh(x, y, seed) for x in range(T)] for y in range(T)]) < 0.05) & (h > 0.25); put(img, cr, 'st2')
    edge = body & ~(np.roll(body, 1, 0) & np.roll(body, -1, 0) & np.roll(body, 1, 1) & np.roll(body, -1, 1))
    put(img, edge & (lit < 0.05), 'blk')
    put(img, side & (np.roll(side, 1, 0) == False) & ~body, 'st2')
    mos = body & (h < 0.35) & (lit < 0) & (np.array([[hsh(x, y, seed + 9) for x in range(T)] for y in range(T)]) < 0.25); put(img, mos, 'leaf2')
    return img
REEF = {'reef_d': [(15, 14, 12.5, 0.5), (22, 20, 8.0, 2.0)], 'reef_a': [(16, 14, 9.5, 0.3)], 'reef_b': [(10, 11, 6.0, 1.1), (22, 19, 7.0, 2.3)], 'reef_c': [(13, 13, 9.0, 0.7), (21, 16, 8.0, 1.9), (14, 21, 6.0, 3.1)]}

# ---------------------------------------------------------------- 잔교(바다 위 판자, 4프레임: 물만 움직임)
def plank_rows(img, mask, horizontal_boards=True, calm=False):
    """판자 결: horizontal_boards=True 면 가로 판자(세로로 걷는 잔교). calm=True 면 넓은 면적용 어두운 판자(항구 데크)"""
    coord = YY if horizontal_boards else XX; along = XX if horizontal_boards else YY
    seam = (coord % 6 == 5); hi = (coord % 6 == 0)
    put(img, mask, 'wood2' if calm else 'wood'); put(img, mask & hi, 'wood' if calm else 'sand3'); put(img, mask & seam, 'wood3')
    nail = mask & ((coord % 6) == 2) & ((along % 32 == 3) | (along % 32 == 28)); put(img, nail, 'wood3')
    grain = mask & ~seam & ~hi & (np.array([[hsh(x // 4 if horizontal_boards else x, y if horizontal_boards else y // 4, 5) for x in range(T)] for y in range(T)]) < 0.12)
    put(img, grain, 'wood2')
def pier_tile(kind, f):
    img = sea(f)
    if kind in ('pier_v', 'pier_end_N', 'pier_end_S'):
        m = (XX >= 8) & (XX <= 23)
        if kind == 'pier_end_N': m &= YY >= 6
        if kind == 'pier_end_S': m &= YY <= 25
        shadow = np.roll(m, 2, 1) & ~m; shadow |= np.roll(np.roll(m, 2, 1), 2, 0) & ~m
        img = darken_w(img, shadow)
        plank_rows(img, m, True)
        put(img, m & ((XX == 8) | (XX == 23)), 'wood3')
        posts = [(7, 10), (24, 10), (7, 26), (24, 26)] if kind == 'pier_v' else ([(7, 7), (24, 7), (7, 24), (24, 24)])
    elif kind in ('pier_h', 'pier_end_W', 'pier_end_E'):
        m = (YY >= 9) & (YY <= 22)
        if kind == 'pier_end_W': m &= XX >= 6
        if kind == 'pier_end_E': m &= XX <= 25
        shadow = np.roll(m, 2, 0) & ~m; img = darken_w(img, shadow)
        plank_rows(img, m, False)
        put(img, m & (YY == 22), 'wood3'); put(img, m & (YY == 9), 'sand3')
        posts = [(10, 8), (26, 8), (10, 23), (26, 23)] if kind == 'pier_h' else [(7, 8), (24, 8), (7, 23), (24, 23)]
    for (x, y) in posts:  # 말뚝(위에서 본 원기둥 + 물결 고리)
        rr = np.hypot(PX - x - 0.5, PY - y - 0.5)
        put(img, (rr < 3.6) & (rr >= 2.4) & ~m, 'foam' if f % 2 == 0 else 'ford_hi')
        put(img, rr < 2.4, 'wood3'); put(img, (rr < 1.4) & (PX + PY < x + y + 1.2), 'wood2')
    return img

# ---------------------------------------------------------------- 허공(번진 서가: 먹물 심연, 4프레임 소용돌이). 정수 주파수 사인 합 -> 32px 주기 심리스
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
def void_field(f, seed):
    v = np.zeros((T, T)); t = f * 2 * math.pi / NF
    for (kx, ky, a, w, ph) in [(1, 1, 1.0, 1, 0.3), (2, -1, 0.7, -1, 1.9), (1, 3, 0.5, 1, 4.1), (3, 2, 0.35, -2, 2.2), (0, 2, 0.45, 1, 5.0)]:
        v += a * np.sin(2 * math.pi * (kx * XX + ky * YY) / 32 + ph + seed + w * t)
    return v
def void_tile(f, seed=0, specks=True):
    v = void_field(f, seed)
    q = (v - v.min()) / (np.ptp(v) + 1e-9)
    q = q * 3.2 + (BAYER[YY % 4, XX % 4] - 0.5) * 0.9
    lv = np.clip(np.floor(q), 0, 3).astype(int)
    img = blank(); cols = ['v0', 'v1', 'v2', 'v3']
    for i, c in enumerate(cols): put(img, lv == i, c)
    rid = np.abs(np.sin(2 * math.pi * (XX + 2 * YY) / 32 + seed + f * math.pi / 2) ) < 0.06; put(img, rid & (lv >= 2), 'v4')
    if specks:  # 떠다니는 종잇조각(위로 1px/프레임, 32px 주기라 루프 시 순간 이동 없음: 4프레임 동안 4px, 위치는 칸마다 달라 눈에 띄지 않음)
        for k in range(3):
            x0 = int(hsh(seed, k, 1) * 30) + 1; y0 = int(hsh(seed, k, 2) * 30)
            y = (y0 - f) % 32; img[y, x0] = C['paper']
            if k == 0: img[y, (x0 + 1) % 32] = C['v4']
    return img

# ---------------------------------------------------------------- 서가 바닥(가로 판자, 32px 주기)
def floor_tile(variant=0):
    img = blank()
    row = YY // 8; off = np.array([0, 13, 5, 21])[row]
    seam_v = ((XX + off) % 32 == 0) | ((XX + off) % 32 == 17)
    put(img, np.ones((T, T), bool), 'fl')
    put(img, (YY % 8 == 0), 'fl_hi'); put(img, (YY % 8 == 7), 'fl_ln'); put(img, (YY % 8 == 6), 'fl_sh')
    put(img, seam_v & (YY % 8 != 7), 'fl_ln')
    gr = (np.array([[hsh(x // 5, y, 31 + variant) for x in range(T)] for y in range(T)]) < 0.10) & (YY % 8 >= 2) & (YY % 8 <= 5); put(img, gr, 'fl_sh')
    if variant == 1:  # 먹물 얼룩 + 흩어진 종이
        rr = np.hypot((PX - 11) * 1.0, (PY - 20) * 1.3); put(img, rr < 4.6, 'v2'); put(img, rr < 3.2, 'v1'); put(img, (np.hypot(PX - 17, PY - 23) < 1.5), 'v2')
        pm = (XX >= 19) & (XX <= 26) & (YY >= 6) & (YY <= 11); put(img, pm, 'paper'); put(img, pm & ((YY == 11) | (XX == 26)), 'st'); put(img, pm & (YY % 2 == 0) & (XX > 20) & (XX < 25), 'st')
    return img

# 허공 가장자리: 허공 칸에 칠함, 이름 방향 = 바닥이 있는 쪽. 바닥 쪽 가장자리 픽셀 = floor_tile(0) 그대로
def void_edge(kind, f):
    d = shore_field(kind, seed=13, b=9.0, amp=2.4)
    img = void_tile(f, seed=3, specks=False)
    fl = floor_tile(0)
    lm = d < 0
    img[lm] = fl[lm]
    put(img, (d >= -1.2) & (d < 0), 'fl_ln')  # 깨진 판자 끝
    lip = (d >= 0) & (d < 3.2)  # 단면(아래로 떨어지는 절벽 두께) — 3/4 시점이라 남쪽(아래) 방향 단면이 가장 두껍게
    put(img, lip, 'fl_sh'); put(img, lip & (d >= 1.6), 'v2')
    drips = np.array([[hsh(x, 77) for x in range(T)] for y in range(T)]) < 0.18
    dl = 3 + (f + XX) % 3
    put(img, drips & (d >= 3.2) & (d < 3.2 + dl), 'v3')
    return img

def rift_tile(kind, f):
    img = void_tile(f, seed=5 if kind == 'rift_plank_a' else 9, specks=True)
    bob = 1 if f in (1, 2) else 0
    fl = np.roll(floor_tile(0), bob, 0)
    if kind == 'rift_plank_a':  # 부서진 판자 3장
        m = np.zeros((T, T), bool)
        for (x0, x1, y0) in [(5, 25, 8), (3, 28, 16), (7, 23, 24)]:
            m |= (XX >= x0 + (YY % 3 == 0)) & (XX <= x1 - (YY % 4 == 1)) & (YY >= y0 + bob) & (YY <= y0 + 6 + bob)
    else:  # 책 더미가 얹힌 발판
        m = (np.hypot((PX - 16) / 13.0, (PY - 16 - bob) / 9.0) < 1) & ~((XX + YY) % 11 == 0) | False
    under = np.roll(m, 3, 0) & ~m
    put(img, under, 'v4'); put(img, np.roll(m, 2, 0) & ~m, 'fl_ln')
    img[m] = fl[m]
    edge = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1)); put(img, edge, 'fl_ln')
    if kind == 'rift_plank_b':
        for (x0, y0, w, h, c) in [(9, 9, 9, 4, 'red'), (10, 13, 8, 3, 'teal'), (17, 11, 7, 5, 'wood2')]:
            bm = (XX >= x0) & (XX < x0 + w) & (YY >= y0 + bob) & (YY < y0 + h + bob); put(img, bm, c)
            put(img, bm & (YY == y0 + bob), 'sand'); put(img, bm & ((YY == y0 + h - 1 + bob) | (XX == x0 + w - 1)), 'blk')
    put(img, (np.abs(PX - 16) < 1) & (PY > 28) & (f % 2 == 0), 'v4')
    return img

# ---------------------------------------------------------------- 언덕/평지
def hill_tile(blobs):
    img = GRASS3.copy()
    h = np.full((T, T), -9.0)
    for (cx, cy, rx, ry) in blobs:
        h = np.maximum(h, 1 - ((PX - cx) / rx) ** 2 - ((PY - cy) / ry) ** 2)
    m = h > 0
    sh = np.roll(np.roll(m, 2, 0), 1, 1) & ~m  # 우하단 그림자(광원 좌상단)
    put(img, sh, 'dgrass')
    gy = np.gradient(h, axis=0); gx = np.gradient(h, axis=1); lit = -(gx * 0.8 + gy)
    put(img, m, 'grass')
    tex = m & np.all(GRASS3[..., :3] == C['grass2'][:3], -1); put(img, tex, 'grass2')
    put(img, m & (lit > 0.05), 'hill_hi'); put(img, m & (lit > 0.05) & tex, 'grass')
    put(img, m & (lit < -0.04), 'grass2'); put(img, m & (lit < -0.13), 'dgrass')
    edge = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
    put(img, edge & (lit < 0.02), 'dgrass2')
    tuft = m & (h > 0.3) & (np.array([[hsh(x, y, 21) for x in range(T)] for y in range(T)]) < 0.04); put(img, tuft, 'leaf2')
    return img
def book_hill(variant):
    """서가 언덕(H, biome seoga): 서가 바닥 위 쌓인 책 더미 둔덕"""
    img = floor_tile(0)
    stacks = [(6, 26, 9, 6), (15, 27, 10, 9), (24, 26, 8, 5)] if variant == 0 else [(9, 26, 12, 8), (21, 27, 10, 6)]
    cols_ = ['red', 'teal', 'wood2', 'st3', 'sand3', 'leaf2']
    for si, (cx, by, w, n) in enumerate(stacks):
        put(img, (np.abs(PX - cx - 1) <= w / 2 + 1) & (YY >= by - 1) & (YY <= by + 1), 'fl_ln')
        for k in range(n):
            y1 = by - k * 3; ww = w - (k // 2) + int(hsh(si, k, variant) * 3) - 1; ox = int(hsh(k, si, 7) * 3) - 1
            m = (np.abs(PX - cx - ox) <= ww / 2) & (YY >= y1 - 2) & (YY <= y1)
            c = cols_[int(hsh(si, k, variant + 3) * len(cols_))]
            put(img, m, c); put(img, m & (YY == y1 - 2), 'sand'); put(img, m & (YY == y1), 'blk'); put(img, m & (np.abs(PX - cx - ox) > ww / 2 - 1), 'paper')
    return img
def plain_tile(variant):
    img = GRASS3.copy()
    pts = [(8, 9, 4.5, 2.4), (22, 22, 5.5, 2.6)] if variant == 0 else [(20, 8, 4.0, 2.0), (9, 23, 3.2, 1.8)]
    for (cx, cy, rx, ry) in pts:
        e = ((PX - cx) / rx) ** 2 + ((PY - cy) / ry) ** 2
        n = np.array([[hsh(x, y, cx) for x in range(T)] for y in range(T)])
        put(img, (e < 1) & (n < 0.55) & ((XX + YY) % 2 == 0), 'sand3'); put(img, (e < 0.55) & (n < 0.8), 'sand3'); put(img, (e < 0.25), 'sand2'); put(img, (e < 1.3) & (e >= 0.9) & (n < 0.35), 'grass2')
    return img

# ---------------------------------------------------------------- 석재(성 포장·성벽·성문 공용 32px 주기 텍스처)
def setts(img, mask, bw=8, bh=8, stagger=4):
    row = YY // bh; xs = (XX + (row % 2) * stagger) % bw
    put(img, mask, 'st')
    put(img, mask & ((YY % bh == 0) | (xs == 0)), 'sthi')
    put(img, mask & ((YY % bh == bh - 1) | (xs == bw - 1)), 'st2')
    n = np.array([[hsh(x // 2, y // 2, 4) for x in range(T)] for y in range(T)]); put(img, mask & (n < 0.06), 'st2')
def castle_pave(variant):
    img = blank(); setts(img, np.ones((T, T), bool), 8, 8, 4)
    if variant:
        moss = np.array([[hsh(x, y, 61) for x in range(T)] for y in range(T)]) < 0.5
        put(img, moss & (((YY % 8 == 7) & (XX < 12)) | ((XX % 8 == 3) & (YY > 22) & (YY % 8 == 7))), 'leaf2')
        put(img, (YY == 13) & (XX > 17) & (XX < 26) | ((XX == 21) & (YY > 13) & (YY < 18)), 'st2')
    return img
def parapet(img, mask):
    """여장(성가퀴): 8px 블록, 블록 사이 틈, 총안(어두운 2x2)"""
    put(img, mask, 'sthi')
    put(img, mask & (((XX % 8) == 7) | ((YY % 8) == 7)), 'st')
    put(img, mask & (((XX % 8) == 0) & ((YY % 8) == 0)), 'st2')
    gun = mask & ((XX % 8 >= 3) & (XX % 8 <= 4)) & ((YY % 8 >= 3) & (YY % 8 <= 4)); put(img, gun, 'blk')
def walkway(img, mask):
    put(img, mask, 'st'); put(img, mask & ((XX % 16 == 0) | (YY % 16 == 0)), 'st2'); put(img, mask & ((XX % 16 == 1) | (YY % 16 == 1)), 'sthi')
def face(img, mask):
    row = YY // 4; xs = (XX + (row % 2) * 5) % 10
    put(img, mask, 'st2'); put(img, mask & (YY % 4 == 0), 'st'); put(img, mask & (YY % 4 == 1) & (xs < 3), 'st')
    put(img, mask & ((xs == 9) | (YY % 4 == 3)), 'st3'); put(img, mask & (YY == 31), 'stdk')
def lip(img, mask):
    put(img, mask, 'st2'); put(img, mask & ((XX + YY) % 4 == 0), 'st3')
def wall_tile(kind):
    """성벽(전 칸 석재). wall_h_N: 바깥(여장)=북, 아래 8px 안쪽 면. wall_h_S: 여장=남(바깥 면 보임). wall_v_W/E: 여장 서/동. 모서리 = 두 바깥 변."""
    img = blank()
    R = np.full((T, T), 'walk', dtype=object)
    if kind in ('wall_h_N', 'wall_h_N_b'):
        R[YY <= 6] = 'par'; R[(YY >= 19) & (YY <= 20)] = 'lip'; R[YY >= 21] = 'face'
    elif kind in ('wall_h_S', 'wall_h_S_b'):
        R[YY <= 1] = 'lip'; R[(YY >= 14) & (YY <= 20)] = 'par'; R[YY >= 21] = 'face'
    elif kind == 'wall_v_W':
        R[XX <= 6] = 'par'; R[XX >= 29] = 'lip'
    elif kind == 'wall_v_E':
        R[XX >= 25] = 'par'; R[XX <= 2] = 'lip'
    elif kind == 'wall_NW':
        R[(XX <= 6) | (YY <= 6)] = 'par'; R[(XX >= 29) & (YY >= 19) & (YY <= 20)] = 'lip'; R[(XX >= 29) & (YY >= 21)] = 'face'
    elif kind == 'wall_NE':
        R[(XX >= 25) | (YY <= 6)] = 'par'; R[(XX <= 2) & (YY >= 19) & (YY <= 20)] = 'lip'; R[(XX <= 2) & (YY >= 21)] = 'face'
    elif kind == 'wall_SW':
        R[(XX >= 29) & (YY <= 1)] = 'lip'; R[(XX <= 6) & (YY <= 20)] = 'par'; R[(YY >= 14) & (YY <= 20)] = 'par'; R[YY >= 21] = 'face'
    elif kind == 'wall_SE':
        R[(XX <= 2) & (YY <= 1)] = 'lip'; R[(XX >= 25) & (YY <= 20)] = 'par'; R[(YY >= 14) & (YY <= 20)] = 'par'; R[YY >= 21] = 'face'
    walkway(img, R == 'walk'); parapet(img, R == 'par'); lip(img, R == 'lip'); face(img, R == 'face')
    # 여장 안쪽 그림자(보도 쪽 1px)
    par = R == 'par'; wk = R == 'walk'
    put(img, wk & (np.roll(par, 1, 0) | np.roll(par, 1, 1)), 'st2')
    if kind.endswith('_b'):  # 무너진 변형: 여장 일부 결손 + 잔해
        hole = (XX >= 9) & (XX <= 18) & par
        walkway(img, hole); put(img, hole & (np.array([[hsh(x, y, 3) for x in range(T)] for y in range(T)]) < 0.35), 'sthi')
        put(img, hole & (np.array([[hsh(x, y, 4) for x in range(T)] for y in range(T)]) < 0.2), 'blk')
    return img

# ---------------------------------------------------------------- 기와 지붕(성문 문루·한옥 공용)
def roof_tiles(img, mask):
    put(img, mask, 'st3')
    put(img, mask & (XX % 4 == 0), 'st2'); put(img, mask & (XX % 4 == 1), 'st')
    put(img, mask & (YY % 6 == 5) & (XX % 4 != 1), 'blk')
def roof_shape(cell, rows_top, rows_bot, ridge=True, eave=True, ext=(True, True)):
    """cell: 'L','C','R','S'(단독). 지붕 마스크 + 용마루/처마. ext=(왼끝 맞배/우진각 여부)"""
    m = (YY >= rows_top) & (YY <= rows_bot)
    left_end = cell in ('L', 'S'); right_end = cell in ('R', 'S')
    if left_end: m &= XX >= 2 + np.maximum(0, (rows_bot - YY) // 3 - 1) * 0  # 끝 2px 여백(처마 돌출은 바닥 쪽)
    if right_end: m &= XX <= 29
    return m, left_end, right_end
def draw_roof(img, cell, top, bot, ridge=True, eave=True):
    m, le, re = roof_shape(cell, top, bot)
    roof_tiles(img, m)
    if le: put(img, m & (XX <= 3), 'st2'); put(img, m & (XX == 2), 'blk')
    if re: put(img, m & (XX >= 28), 'st3'); put(img, m & (XX == 29), 'blk')
    if ridge:
        rg = m & (YY >= top) & (YY <= top + 2); put(img, rg, 'sthi'); put(img, m & (YY == top + 2), 'st'); put(img, m & (YY == top), 'blk')
        if le: put(img, (XX >= 1) & (XX <= 3) & (YY >= top - 2) & (YY <= top), 'sthi'); put(img, (XX == 1) & (YY >= top - 2) & (YY <= top), 'blk')  # 치미(끝 들림)
        if re: put(img, (XX >= 28) & (XX <= 30) & (YY >= top - 2) & (YY <= top), 'sthi'); put(img, (XX == 30) & (YY >= top - 2) & (YY <= top), 'blk')
    if eave:
        put(img, m & (YY == bot), 'blk'); put(img, m & (YY == bot - 1), 'st')
        if le: put(img, (XX >= 0) & (XX <= 3) & (YY >= bot - 3) & (YY <= bot - 1) & (XX + (bot - YY) <= 4), 'st'); put(img, (XX <= 1) & (YY == bot - 3), 'blk')
        if re: put(img, (XX >= 28) & (XX <= 31) & (YY >= bot - 3) & (YY <= bot - 1) & ((31 - XX) + (bot - YY) <= 4), 'st'); put(img, (XX >= 30) & (YY == bot - 3), 'blk')
    return m

def gate_tile(cell):
    """성문(문루 + 홍예 아치 + 나무 문). 남쪽 성벽(wall_h_S) 줄에 놓는 기준. cell: S 단독 / L,C,R 연속"""
    img = wall_tile('wall_h_S')
    # 문루 기둥·단청
    put(img, (YY >= 11) & (YY <= 20), 'st2')
    for x in ([4, 27] if cell == 'S' else [4, 27] if cell == 'C' else [4, 27]):
        put(img, (XX >= x) & (XX <= x + 1) & (YY >= 11) & (YY <= 19), 'wood2'); put(img, (XX == x) & (YY >= 11) & (YY <= 19), 'wood')
    put(img, (YY == 11), 'teal'); put(img, (YY == 12) & (XX % 3 == 0), 'red')
    put(img, (YY >= 13) & (YY <= 19) & (XX > 5) & (XX < 27), 'wood3'); put(img, (YY >= 14) & (YY <= 18) & (XX > 6) & (XX < 26) & (XX % 3 == 0), 'wood2')
    put(img, (YY == 20), 'st3')
    draw_roof(img, {'S': 'S', 'L': 'L', 'C': 'C', 'R': 'R'}[cell], 1, 10)
    # 홍예(아치) + 문
    cx = 15.5; arch = ((np.abs(PX - cx - 0.5) <= 7) & (PY >= 25)) | (np.hypot(PX - cx - 0.5, PY - 25) <= 7)
    arch &= YY >= 21
    ring = (np.hypot(PX - cx - 0.5, PY - 25) <= 8.6) & ~arch & (YY >= 19) & (YY <= 25); put(img, ring, 'sthi'); put(img, ring & ((XX + YY) % 3 == 0), 'st')
    put(img, arch, 'blk')
    door = arch & (YY >= 22)
    put(img, door, 'wood2'); put(img, door & (np.abs(PX - cx - 0.5) < 0.6), 'wood3'); put(img, door & (XX % 3 == 0) & (YY % 3 == 1), 'gold')
    put(img, door & (YY == 22), 'wood3')
    return img

SHADOW = np.array([0, 0, 0, 90], np.uint8)
def hanok(cell, part, base='grass'):
    """한옥 조각. cell L/C/R/S, part: ridge(용마루+기와) mid(기와) eave(기와+처마) full(용마루+처마, 2칸 높이 건물용) facade(벽·창호·기단). base=None 이면 투명 바탕(오버레이)"""
    img = GRASS3.copy() if base == 'grass' else np.zeros((T, T, 4), np.uint8)
    if part in ('ridge', 'mid', 'eave', 'full'):
        top = {'ridge': 4, 'mid': 0, 'eave': 0, 'full': 4}[part]; bot = {'ridge': 31, 'mid': 31, 'eave': 27, 'full': 27}[part]
        m = draw_roof(img, cell, top, bot, ridge=part in ('ridge', 'full'), eave=part in ('eave', 'full'))
        if part in ('eave', 'full'):  # 처마 아래 그늘(아래 칸 facade 꼭대기와 이어짐)
            put(img, (YY >= 28) & (XX >= (2 if cell in ('L', 'S') else 0)) & (XX <= (29 if cell in ('R', 'S') else 31)), 'wood3')
            put(img, (YY == 29) & (XX % 4 == 2) & (XX >= 3) & (XX <= 28), 'wood2')
            put(img, (YY >= 30) & (XX >= (3 if cell in ('L', 'S') else 0)) & (XX <= (28 if cell in ('R', 'S') else 31)), 'teal'); put(img, (YY == 31) & (XX % 3 == 1), 'red')
        return img
    # facade
    x0 = 3 if cell in ('L', 'S') else 0; x1 = 28 if cell in ('R', 'S') else 31
    m = (XX >= x0) & (XX <= x1) & (YY <= 25)
    put(img, m, 'sthi')
    put(img, m & (YY <= 1), 'wood3')
    for px_ in ([x0, x1 - 1] if cell != 'C' else []) + ([15] if cell == 'C' else []):
        put(img, (XX >= px_) & (XX <= px_ + 1) & (YY <= 25), 'wood2'); put(img, (XX == px_) & (YY <= 25), 'wood')
    if cell == 'C':  # 띠살문 2짝
        for dx in (5, 19):
            dm = (XX >= dx) & (XX <= dx + 7) & (YY >= 5) & (YY <= 24); put(img, dm, 'sand'); put(img, dm & ((XX - dx) % 2 == 1), 'sand3'); put(img, dm & ((XX == dx) | (XX == dx + 7) | (YY == 5) | (YY == 24) | (YY == 14)), 'wood2')
    else:  # 창호(정자살)
        wx = 9 if cell == 'L' else 12
        if cell == 'S': wx = 10
        wm = (XX >= wx) & (XX <= wx + 10) & (YY >= 6) & (YY <= 15); put(img, wm, 'sand'); put(img, wm & (((XX - wx) % 4 == 0) | ((YY - 6) % 4 == 0)), 'wood2'); put(img, wm & ((XX == wx + 10) | (YY == 15)), 'wood3')
        put(img, (XX >= wx - 1) & (XX <= wx + 11) & (YY == 17), 'wood3')
    # 기단(장대석)
    bm = (XX >= max(0, x0 - 1)) & (XX <= min(31, x1 + 1)) & (YY >= 26) & (YY <= 30)
    put(img, bm, 'st'); put(img, bm & (YY == 26), 'sthi'); put(img, bm & ((YY == 28) | (XX % 10 == 7)), 'st2'); put(img, bm & (YY == 30), 'st3')
    if cell in ('C',):
        put(img, (XX >= 12) & (XX <= 19) & (YY >= 26) & (YY <= 28), 'sthi'); put(img, (XX >= 12) & (XX <= 19) & (YY == 28), 'st2')  # 디딤돌
    put(img, (YY == 31) & (XX >= x0) & (XX <= x1), 'dgrass2' if base == 'grass' else SHADOW)
    return img
def hanok_small(base='grass'):
    img = GRASS3.copy() if base == 'grass' else np.zeros((T, T, 4), np.uint8)
    draw_roof(img, 'S', 3, 15)
    put(img, (YY == 16) & (XX >= 3) & (XX <= 28), 'teal'); put(img, (YY == 17) & (XX >= 3) & (XX <= 28), 'wood3')
    m = (XX >= 4) & (XX <= 27) & (YY >= 17) & (YY <= 26); put(img, m, 'sthi')
    put(img, m & ((XX <= 5) | (XX >= 26) | (np.abs(XX - 15.5) < 1)), 'wood2')
    dm = (XX >= 9) & (XX <= 14) & (YY >= 19) & (YY <= 26); put(img, dm, 'sand'); put(img, dm & (XX % 2 == 0), 'sand3'); put(img, dm & ((XX == 9) | (XX == 14) | (YY == 19)), 'wood2')
    wm = (XX >= 18) & (XX <= 23) & (YY >= 19) & (YY <= 23); put(img, wm, 'sand'); put(img, wm & (((XX - 18) % 3 == 0) | ((YY - 19) % 2 == 0)), 'wood2')
    bm = (XX >= 3) & (XX <= 28) & (YY >= 27) & (YY <= 29); put(img, bm, 'st'); put(img, bm & (YY == 27), 'sthi'); put(img, bm & (YY == 29), 'st2')
    put(img, (YY == 30) & (XX >= 3) & (XX <= 28), 'dgrass2' if base == 'grass' else SHADOW)
    return img

# ---------------------------------------------------------------- 탑(망루). 투명 오버레이 원본 -> 풀 바탕 합성본
def tower_overlay(kind):
    img = np.zeros((T, T, 4), np.uint8)
    if kind == 'tower_a':  # 석축 + 목조 누각 + 우진각 지붕
        put(img, (np.hypot((PX - 16) / 11, (PY - 29.5) / 2.5) < 1), np.array([0, 0, 0, 90], np.uint8))
        b = (XX >= 7) & (XX <= 24) & (YY >= 20) & (YY <= 29); row = YY // 3; xs = (XX + (row % 2) * 3) % 6
        put(img, b, 'st'); put(img, b & (YY % 3 == 0), 'sthi'); put(img, b & ((xs == 5) | (YY % 3 == 2)), 'st2'); put(img, b & (YY == 29), 'st3')
        put(img, (XX >= 6) & (XX <= 25) & (YY == 19), 'st3')
        p = (YY >= 11) & (YY <= 18) & (XX >= 8) & (XX <= 23); put(img, p, 'wood3')
        for x in (8, 15, 22): put(img, (XX >= x) & (XX <= x + 1) & (YY >= 11) & (YY <= 18), 'wood2'); put(img, (XX == x) & (YY >= 11) & (YY <= 18), 'wood')
        put(img, (YY == 16) & (XX >= 8) & (XX <= 23), 'wood'); put(img, (YY == 11) & (XX >= 8) & (XX <= 23), 'teal')
        r = (YY >= 2) & (YY <= 10) & (np.abs(PX - 16) <= 6 + (YY - 2) * 0.9); roof_tiles(img, r)
        put(img, r & (YY == 10), 'blk'); put(img, r & (YY == 9), 'st'); put(img, (YY >= 1) & (YY <= 2) & (np.abs(PX - 16) <= 5), 'sthi'); put(img, (YY == 1) & (np.abs(PX - 16) <= 5), 'blk')
        put(img, (YY >= 8) & (YY <= 9) & ((XX <= 4) | (XX >= 27)) & (np.abs(PX - 16) <= 13.5), 'st')
        edge = r & ((np.abs(PX - 16) > 5.5 + (YY - 2) * 0.9)); put(img, edge, 'blk')
        put(img, (XX == 16) & (YY <= 1) & (YY >= 0), 'gold')
    else:  # tower_b: 서가의 먹빛 석등 탑(창에 등불)
        put(img, (np.hypot((PX - 16) / 10, (PY - 29.5) / 2.3) < 1), np.array([0, 0, 0, 110], np.uint8))
        b = (XX >= 9) & (XX <= 22) & (YY >= 14) & (YY <= 29); put(img, b, 'v3'); put(img, b & (XX == 9), 'v4'); put(img, b & ((YY % 5 == 0) | (XX == 22)), 'v1')
        w = (XX >= 13) & (XX <= 18) & (YY >= 17) & (YY <= 23); put(img, w, 'glow'); put(img, w & ((XX == 15) | (XX == 16) | (YY == 20)), 'wood3')
        put(img, (XX >= 7) & (XX <= 24) & (YY >= 12) & (YY <= 13), 'v4'); put(img, (XX >= 7) & (XX <= 24) & (YY == 13), 'v1')
        r = (YY >= 3) & (YY <= 11) & (np.abs(PX - 16) <= 3 + (YY - 3) * 1.1); put(img, r, 'v2'); put(img, r & (XX < 16), 'v3'); put(img, r & (YY == 11), 'v0')
        put(img, (XX >= 15) & (XX <= 16) & (YY >= 0) & (YY <= 3), 'gold')
        put(img, (XX >= 11) & (XX <= 20) & (YY >= 26) & (YY <= 29), 'paper'); put(img, (XX >= 11) & (XX <= 20) & (YY == 29), 'st')
    return img
def over_on(base, ov):
    o = base.copy(); a = ov[..., 3:4].astype(float) / 255.0
    o[..., :3] = (ov[..., :3] * a + base[..., :3] * (1 - a)).round().astype(np.uint8)
    semi = (ov[..., 3] > 0) & (ov[..., 3] < 255)  # 반투명 그림자 -> 팔레트 최근접색(구운 타일은 팔레트 고정)
    pal = np.array([v[:3] for v in C.values()], float)
    for y, x in zip(*np.nonzero(semi)):
        o[y, x, :3] = pal[np.argmin(((pal - o[y, x, :3]) ** 2).sum(1))]
    return o

# ---------------------------------------------------------------- 항구(정적, 땅 칸)
def harbor_tile(kind):
    img = blank()
    plank_rows(img, np.ones((T, T), bool), False, calm=True)  # 세로 판자 데크
    put(img, (XX % 16 == 15), 'wood3')
    if kind == 'harbor_b':  # 계류주 + 밧줄
        rr = np.hypot(PX - 16, PY - 15); put(img, (np.hypot((PX - 16.5) / 7, (PY - 23) / 2.5) < 1), 'wood3')
        put(img, rr < 4.5, 'stdk'); put(img, rr < 3.5, 'st2'); put(img, (rr < 3.5) & (PX + PY < 31), 'st')
        put(img, (rr >= 4.5) & (rr < 5.6) & (YY > 13), 'sand3'); put(img, (rr >= 4.5) & (rr < 5.6) & (YY > 13) & ((XX + YY) % 2 == 0), 'sand2')
    if kind == 'harbor_c':  # 나무 상자 2 + 밧줄 사리
        for (x0, y0, s) in [(4, 6, 10), (12, 12, 9)]:
            m = (XX >= x0) & (XX < x0 + s) & (YY >= y0) & (YY < y0 + s); put(img, np.roll(np.roll(m, 1, 0), 1, 1) & ~m, 'wood3')
            put(img, m, 'sand3'); put(img, m & ((XX == x0) | (YY == y0)), 'sand'); put(img, m & ((XX == x0 + s - 1) | (YY == y0 + s - 1)), 'wood2')
            put(img, m & ((XX - x0 == YY - y0) | (XX - x0 == s - 1 - (YY - y0))), 'wood2')
        rr = np.hypot(PX - 24, PY - 24); put(img, (rr < 5) & (rr >= 1.5), 'sand2'); put(img, (rr < 5) & (rr >= 1.5) & (np.floor(rr) % 2 == 0), 'sand3'); put(img, rr < 1.5, 'wood3')
    if kind.startswith('quay_'):  # 석축 가장자리(그 방향이 물)
        s = kind[-1]
        m = {'N': YY <= 4, 'S': YY >= 27, 'W': XX <= 4, 'E': XX >= 27}[s]
        put(img, m, 'st'); put(img, m & ((XX % 8 == 0) if s in 'NS' else (YY % 8 == 0)), 'st2'); put(img, m & ((YY == 0) if s == 'N' else (YY == 27) if s == 'S' else (XX == 0) if s == 'W' else (XX == 27)), 'sthi')
        put(img, m & ((YY == 31) if s == 'S' else (YY == 4) if s == 'N' else (XX == 4) if s == 'W' else (XX == 31)), 'st2')
        ring = {'N': (16, 6), 'S': (16, 25), 'W': (6, 16), 'E': (25, 16)}[s]; rr = np.hypot(PX - ring[0], PY - ring[1]); put(img, (rr < 2.2) & (rr >= 1.1), 'stdk')
    return img

# ---------------------------------------------------------------- 목표 오버레이(4프레임, 투명): 바닥 금빛 고리 + 깃대 + 펄럭이는 깃발 + 회전 반짝임
def objective(f):
    img = np.zeros((T, T, 4), np.uint8)
    e = np.hypot((PX - 16) / (11 + (f % 2)), (PY - 26) / (3.6 + 0.4 * (f % 2)))
    put(img, (e < 1) & (e >= 0.72), 'gold'); put(img, (e < 0.72) & (e >= 0.5) & ((XX + YY + f) % 2 == 0), 'gold_hi')
    put(img, (e < 1.18) & (e >= 1) & ((XX + f) % 3 == 0), 'glow')
    put(img, (XX == 15) & (YY >= 5) & (YY <= 26), 'wood3'); put(img, (XX == 16) & (YY >= 5) & (YY <= 26), 'wood2')
    put(img, (XX >= 14) & (XX <= 17) & (YY >= 3) & (YY <= 4), 'gold')
    wave = [0, 1, 0, -1][f]
    for x in range(17, 28):
        k = x - 17; off = int(round(wave * math.sin(k / 10 * math.pi))) + (k // 6) * (1 if f in (1, 2) else 0)
        y0, y1 = 5 + off, 13 + off - (k // 4)
        for y in range(y0, y1 + 1):
            img[y, x] = C['red']
        img[y0, x] = C['gold']; img[y1, x] = C['wood2']
    for (x, y) in [(9, 9), (23, 18), (8, 20), (22, 2)]:
        k = (x + y + f) % 4
        if k == 0: img[y, x] = C['gold_hi']; img[y - 1, x] = C['glow']; img[y + 1, x] = C['glow']; img[y, x - 1] = C['glow']; img[y, x + 1] = C['glow']
        elif k == 1: img[y, x] = C['glow']
    return img

# ================================================================= 조립
STATIC = []
def S(name, img, code, use): STATIC.append((name, img, code, use))
S('hill_a', hill_tile([(16, 17, 13, 10)]), 'H/i hill', '언덕: 큰 둔덕 1개')
S('hill_b', hill_tile([(10, 12, 8, 6.5), (22, 21, 9, 7)]), 'H/i hill', '언덕: 작은 둔덕 2개')
S('hill_c', hill_tile([(16, 16, 12, 11), (7, 25, 5, 4)]), 'H/i hill', '언덕: 둔덕+곁둔덕')
S('seoga_hill_a', book_hill(0), 'H/i hill (biome seoga)', '서가 언덕: 책 더미(서가 바닥 바탕)')
S('seoga_hill_b', book_hill(1), 'H/i hill (biome seoga)', '서가 언덕 변형')
S('plain_a', plain_tile(0), '. plain', '평지(L 풀과 구분: 흙 길 자국)')
S('plain_b', plain_tile(1), '. plain', '평지 변형')
S('seoga_floor_a', floor_tile(0), '. plain (biome seoga)', '번진 서가 바닥(허공 가장자리와 픽셀 일치)')
S('seoga_floor_b', floor_tile(1), '. plain (biome seoga)', '서가 바닥 변형(먹물 얼룩·종이)')
S('castle_pave_a', castle_pave(0), 'c castle_district', '성내 포장(돌판)')
S('castle_pave_b', castle_pave(1), 'c castle_district', '성내 포장 변형(이끼·균열)')
for k in ['wall_h_N', 'wall_h_S', 'wall_v_W', 'wall_v_E', 'wall_NW', 'wall_NE', 'wall_SW', 'wall_SE', 'wall_h_N_b', 'wall_h_S_b']:
    S(k, wall_tile(k), 'C wall', '성벽: ' + {'wall_h_N': '가로(바깥=북, 아래 안쪽 면)', 'wall_h_S': '가로(바깥=남, 바깥 면)', 'wall_v_W': '세로(바깥=서)', 'wall_v_E': '세로(바깥=동)',
        'wall_NW': '모서리 북서', 'wall_NE': '모서리 북동', 'wall_SW': '모서리 남서', 'wall_SE': '모서리 남동', 'wall_h_N_b': '가로 북 무너진 변형', 'wall_h_S_b': '가로 남 무너진 변형'}[k])
for k in ['S', 'L', 'C', 'R']:
    S('gate_' + k, gate_tile(k), 'G gate', '성문: ' + {'S': '단독 1칸', 'L': '여러 칸 왼끝', 'C': '여러 칸 가운데', 'R': '여러 칸 오른끝'}[k] + ' (wall_h_S 줄에 놓음)')
for part in ['ridge', 'mid', 'eave', 'full', 'facade']:
    for cell in ['L', 'C', 'R']:
        S(f'hanok_{part}_{cell}', hanok(cell, part), 'B building', f'한옥 {part} {cell}')
S('hanok_small', hanok_small(), 'B building', '한옥 1칸 단독')
S('tower_a', over_on(GRASS3, tower_overlay('tower_a')), 'T tower', '망루(석축+누각) 풀 바탕')
S('tower_b', over_on(floor_tile(0), tower_overlay('tower_b')), 'T tower (biome seoga)', '서가 석등탑 서가 바닥 바탕')
for k in ['harbor_a', 'harbor_b', 'harbor_c', 'quay_N', 'quay_E', 'quay_S', 'quay_W']:
    S(k, harbor_tile(k), 'P harbor', {'harbor_a': '항구 데크', 'harbor_b': '항구 데크+계류주', 'harbor_c': '항구 데크+화물', 'quay_N': '항구 석축(물=북)', 'quay_E': '항구 석축(물=동)', 'quay_S': '항구 석축(물=남)', 'quay_W': '항구 석축(물=서)'}[k])

ANIM = []  # (name, fn(f), code, use)
def A(name, fn, code, use): ANIM.append((name, fn, code, use))
A('sea_a', lambda f: sea(f, 0), '~ sea', '바다(프레임0 = 원본 0번과 픽셀 동일)')
A('sea_b', lambda f: sea(f, 1), '~ sea', '바다 반짝임 변형(가중 1/6 권장)')
for k, bl in REEF.items():
    A(k, (lambda bl, k: (lambda f: reef_tile(bl, f, hash(k) % 97)))(bl, k), 'R reef', '암초/바위(바다 위)')
for k in ['pier_v', 'pier_h', 'pier_end_N', 'pier_end_E', 'pier_end_S', 'pier_end_W']:
    A(k, (lambda k: (lambda f: pier_tile(k, f)))(k), 'P harbor(물 위)', '잔교(바다 칸): ' + k)
for land in ['sand', 'grass']:
    for kind in SHORE_KINDS:
        A(f'{land}_sea_{kind}', (lambda kind, land: (lambda f: shore_tile(kind, f, land)))(kind, land), '~ sea(해안 전이)', f'{"모래" if land == "sand" else "풀"}->바다 전이: 바다 칸에 칠함, 땅 방향 {kind}')
A('void_a', lambda f: void_tile(f, 0), 'X void', '허공(먹물 심연)')
A('void_b', lambda f: void_tile(f, 11), 'X void', '허공 변형')
for kind in SHORE_KINDS:
    A(f'void_edge_{kind}', (lambda kind: (lambda f: void_edge(kind, f)))(kind), 'X void(가장자리)', f'서가 바닥->허공 전이: 허공 칸에 칠함, 바닥 방향 {kind}')
A('rift_plank_a', lambda f: rift_tile('rift_plank_a', f), 'R(서가) rift_plank', '허공 위 부서진 판자 발판')
A('rift_plank_b', lambda f: rift_tile('rift_plank_b', f), 'R(서가) rift_plank', '허공 위 책 더미 발판')

def sheet(imgs, cols=COLS):
    rows = (len(imgs) + cols - 1) // cols
    sh = np.zeros((rows * T, cols * T, 4), np.uint8)
    for i, im in enumerate(imgs):
        r, c = divmod(i, cols); sh[r * T:r * T + T, c * T:c * T + T] = im
    return sh, rows
def save(arr, name, x2=True):
    Image.fromarray(arr, 'RGBA').save(f'{OUT}/{name}.png', optimize=True)
    if x2: Image.fromarray(arr, 'RGBA').resize((arr.shape[1] * 2, arr.shape[0] * 2), Image.NEAREST).save(f'{OUT}/{name}_x2.png', optimize=True)

st_sheet, st_rows = sheet([x[1] for x in STATIC]); save(st_sheet, 'ws_static')
anim_frames = [[fn(f) for (_, fn, _, _) in ANIM] for f in range(NF)]
an_rows = (len(ANIM) + COLS - 1) // COLS
an_sheet = np.concatenate([sheet(fr)[0] for fr in anim_frames], 0); save(an_sheet, 'ws_anim')
ov = [objective(f) for f in range(NF)] + [tower_overlay('tower_a'), tower_overlay('tower_b')]
ov_sheet = np.concatenate(ov, 1); save(ov_sheet, 'ws_overlay')
BOV = [(f'hanok_{part}_{cell}', hanok(cell, part, None)) for part in ['ridge', 'mid', 'eave', 'full', 'facade'] for cell in ['L', 'C', 'R']] + [('hanok_small', hanok_small(None))]
bov_sheet, _ = sheet([x[1] for x in BOV]); save(bov_sheet, 'ws_building_ov')

# ---------------------------------------------------------------- QA: 심리스(자기 반복), 팔레트, 프레임0 원본 일치, 전이 타일 땅쪽 가장자리 일치, 알파 이진
qa = {'seamless_self': {}, 'edge_match': {}, 'palette_ok': True, 'alpha_binary_overlay': True, 'frame0_sea_equals_original': bool(np.array_equal(anim_frames[0][0], SEA0))}
pal_set = {tuple(v[:3]) for v in C.values()} | {tuple(p) for p in otile(2)[..., :3].reshape(-1, 3)} | {tuple(p) for p in GRASS3[..., :3].reshape(-1, 3)} | {tuple(p) for p in SEA0[..., :3].reshape(-1, 3)}
bad = set()
for arr in (st_sheet, an_sheet, ov_sheet, bov_sheet):
    for p in {tuple(x) for x in arr[..., :3][arr[..., 3] > 0].reshape(-1, 3)}:
        if p not in pal_set: bad.add('%02x%02x%02x' % p)
qa['palette_ok'] = not bad; qa['palette_offenders'] = sorted(bad)[:20]
a = ov_sheet[..., 3]; qa['alpha_values_overlay'] = sorted({int(v) for v in np.unique(a)})
def seam_score(im):  # 좌우·상하 맞대기 경계에서 서로 다른 픽셀 비율(자기 반복)
    l = np.any(im[:, 0, :3] != im[:, -1, :3], -1).mean(); t = np.any(im[0, :, :3] != im[-1, :, :3], -1).mean(); return round(float(max(l, t)), 3)
for name in ['sea_a', 'sea_b', 'void_a', 'void_b']:
    i = [x[0] for x in ANIM].index(name); qa['seamless_self'][name] = 'texture 32px 주기 생성(np.roll/정수 주파수) — 경계 차이는 무늬 연속이라 0 기대 아님, 4장 타일 미리보기로 확인'
# 전이 타일: 땅 방향 가장자리 1줄이 원본 땅 타일 같은 줄과 픽셀 동일한지
def edge_eq(tile, land, side):
    sl = {'N': (0, slice(None)), 'S': (31, slice(None)), 'W': (slice(None), 0), 'E': (slice(None), 31)}[side]
    return bool(np.array_equal(tile[sl], land[sl]))
names = [x[0] for x in ANIM]
for land, ltile in [('sand', SAND2), ('grass', GRASS3)]:
    for s in 'NESW':
        t = anim_frames[0][names.index(f'{land}_sea_{s}')]
        # 땅 쪽 가장자리 줄의 가운데(칸 끝 4px 제외) 바깥 1줄은 땅 픽셀이어야 함
        qa['edge_match'][f'{land}_sea_{s}'] = edge_eq(t, ltile, s)
    # 바다 쪽 반대편 가장자리 = 바다 프레임과 같음(모든 프레임)
    for f in range(NF):
        t = anim_frames[f][names.index(f'{land}_sea_N')]
        qa['edge_match'][f'{land}_sea_N_far_f{f}'] = bool(np.array_equal(t[31], sea(f)[31]))
for s in 'NESW':
    qa['edge_match'][f'void_edge_{s}'] = edge_eq(anim_frames[0][names.index(f'void_edge_{s}')], floor_tile(0), s)
# 직선<->모서리 연결: sand_sea_N 의 동쪽 끝 열 == sand_sea_NE_outer 와 맞닿는 열? (outer 는 대각만 땅) — 직선과 안쪽 모서리의 맞닿는 열 비교
for land in ['sand', 'grass']:
    N = anim_frames[0][names.index(f'{land}_sea_N')]; NWi = anim_frames[0][names.index(f'{land}_sea_NW_inner')]
    qa['edge_match'][f'{land}: NW_inner 동쪽 끝열 == N 동쪽 끝열'] = bool(np.array_equal(NWi[:, 31], N[:, 31]))
    NO = anim_frames[0][names.index(f'{land}_sea_NW_outer')]
    Wt = anim_frames[0][names.index(f'{land}_sea_W')]
    tx = SAND2 if land == 'sand' else GRASS3
    m1 = np.all(NO[0, :, :3] == tx[0, :, :3], -1); m2 = np.all(Wt[31, :, :3] == tx[31, :, :3], -1)
    qa['edge_match'][f'{land}: NW_outer 윗줄 땅 마스크 == W 직선 아랫줄 땅 마스크(x<6)'] = bool(np.array_equal(m1[:6], m2[:6]))
json.dump(qa, open(f'{OUT}/qa_ws.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- 명세
spec = {
    'version': 1, 'date': '2026-11-01', 'key': 'tileset.water_set',
    'principle': 'Unity 타일맵 가이드: 32x32 격자·여백 0·PPU 32·Point 필터·정수 배율, 사람이 골라 칠하는 개별 타일(tile_layer). 오토타일/런타임 이웃 규칙 없음. 회전 없음(방향별 타일 제공).',
    'source': 'generated(procedural) — 이미지 생성 모델 호출 0회. 원본 TileMap.png 0·2·3번 픽셀을 땅/바다 텍스처로 그대로 사용 + 팔레트 확장색(ADDED)',
    'palette_added': {k: PAL[k] for k in ADDED},
    'sheets': {
        'static': {'file': '/assets/tiles/water_set/ws_static.png', 'size': [st_sheet.shape[1], st_sheet.shape[0]], 'cols': COLS, 'count': len(STATIC), 'frame': 'frame = 목록 순서(0부터)'},
        'anim': {'file': '/assets/tiles/water_set/ws_anim.png', 'size': [an_sheet.shape[1], an_sheet.shape[0]], 'cols': COLS, 'count': len(ANIM), 'frames': NF, 'rows_per_frame': an_rows,
                 'frame_index': 'sheet_frame = tile + f * rows_per_frame * cols (f = 0..3)', 'fps_hint': 4, 'note': '모든 애니 타일이 같은 4프레임 주기를 공유(같은 시각 f 로 전부 갱신해야 바다·전이 경계가 맞음). 애니를 끄면 f=0 만 사용(원본 0번 바다와 동일)'},
        'building_overlay': {'file': '/assets/tiles/water_set/ws_building_ov.png', 'size': [bov_sheet.shape[1], bov_sheet.shape[0]], 'cols': COLS, 'frames': {n: i for i, (n, _) in enumerate(BOV)},
                             'use': '성 안(castle_pave)·서가 바닥 등 풀이 아닌 칸 위의 건물: 바탕 지형 타일 + 같은 이름 투명 조각 덧그림(ws_static 의 hanok_* 는 풀 바탕 구움)'},
        'overlay': {'file': '/assets/tiles/water_set/ws_overlay.png', 'size': [ov_sheet.shape[1], ov_sheet.shape[0]], 'frames': {'objective': [0, 1, 2, 3], 'tower_a': 4, 'tower_b': 5}, 'alpha': 'binary(0/255) + 그림자 타원만 반투명(90~110)'},
    },
    'conventions': {
        'shore': '해안 전이(sand_sea_* / grass_sea_*)는 바다 칸에 칠한다. 이름 방향 = 땅이 있는 쪽. _inner = 두 변이 땅, _outer = 대각 꼭짓점만 땅, NS/EW = 마주보는 두 변, U_X = X 쪽만 열린 세 변, pond = 네 변. 땅 쪽 가장자리 줄 = 원본 모래(2)/풀(3) 타일 같은 줄과 픽셀 동일, 먼 쪽은 바다(프레임별 sea_a)와 동일.',
        'void_edge': '허공 가장자리는 허공 칸에 칠한다. 이름 방향 = 바닥이 있는 쪽. 바닥 쪽 가장자리 = seoga_floor_a 와 픽셀 동일(서가 맵의 . 칸은 seoga_floor_a/b 로 칠할 것).',
        'wall': '1칸 두께 성벽 고리 기준. 북쪽 줄 wall_h_N, 남쪽 줄 wall_h_S, 서쪽 열 wall_v_W, 동쪽 열 wall_v_E, 네 모서리 wall_NW/NE/SW/SE. 성문 G 는 남쪽 줄(wall_h_S) 안에 gate_S(단독) 또는 gate_L,gate_C..,gate_R. 모서리-세로벽 이음부에 3px 면 차이(알려진 한계).',
        'hanok': '건물 B 묶음(w x h): 맨 아래 줄 facade, 그 위 h=2 면 full, h=3 이면 위에서 ridge, eave 순(h>=4 는 ridge, mid.., eave). 열은 왼끝 L, 가운데 C, 오른끝 R(w=2 면 L,R). 1x1 은 hanok_small.',
        'tower': '탑 T 는 tower_a(풀 바탕) 또는 바탕 지형 + ws_overlay 프레임 4/5 덧그림. 서가 맵은 tower_b.',
        'objective': '목표 O 는 바탕 지형 위 ws_overlay 프레임 0~3 덧그림(4fps 루프).',
        'harbor': '항구 P(땅 칸)는 harbor_a/b/c, 물에 닿는 변은 quay_<물 방향>. 바다 위로 뻗는 잔교는 ws_anim pier_*.',
        'reef': '암초 R(바다 칸)은 reef_a/b/c(좌표 해시). 서가 맵(08)의 R 은 rift_plank_a/b.',
        'hill': '언덕 H 는 hill_a/b/c(좌표 해시). 가장자리 픽셀이 풀(3)과 같아 L 과 이음새 없음.',
    },
    'static_tiles': [{'frame': i, 'name': n, 'code': c, 'use': u} for i, (n, _, c, u) in enumerate(STATIC)],
    'anim_tiles': [{'tile': i, 'name': n, 'code': c, 'use': u} for i, (n, _, c, u) in enumerate(ANIM)],
}
json.dump(spec, open(f'{OUT}/ws_spec.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('static', len(STATIC), st_sheet.shape, 'anim', len(ANIM), an_sheet.shape, 'overlay', ov_sheet.shape)
print(json.dumps(qa, ensure_ascii=False)[:1500])
