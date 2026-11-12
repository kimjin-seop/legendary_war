# tileset_v2 메인 2막(조선 순회지) 소품·지형 — 안아트 2026-11-03. 이미지 모델 호출 0회(Pillow 절차 도트, 16px 원화 -> x2 최근접).
# 대상(맵: database/data/maps_main_a2.json meta, 2-1 봉수대 / 2-3 수레·곡식 / 2-4 돌무더기·낙석 / 2-5 약 보따리 / 얇은 절벽 대체 능선):
#   2364 a2_beacon_chimney      봉수대 연조(돌 굴뚝, 불 꺼짐)        오브젝트(알파 0/255)
#   2365 a2_beacon_chimney_lit  연조(불 붙음: 아궁이 불 + 위 불꽃)    오브젝트
#   2366 a2_smoke_rise          연기 기둥(상하 이음)                  반투명 오버레이
#   2367 a2_smoke_top           연기 기둥 끝(흩어짐)                  반투명 오버레이
#   2368 a2_smoke_drift         바람에 쏠린 연기(좌우 이음)           반투명 오버레이
#   2369 a2_smoke_drift_end     쏠린 연기 끝(동쪽 끝, 흩어짐)         반투명 오버레이
#   2370 a2_cart_grain_E        곡식 실은 두바퀴 수레(동향)            오브젝트
#   2371 a2_cart_grain_W        같은 수레(서향, 좌우 반전)            오브젝트
#   2372 a2_cart_stuck_E        진흙에 바퀴가 빠진 수레(동향, 기울어짐) 오브젝트
#   2373 a2_grain_bags          짚 곡식 섬 3개 더미                   오브젝트
#   2374 a2_grain_bag_single    짚 곡식 섬 1개                        오브젝트
#   2375 a2_medicine_bundle     약 보따리(쪽빛 보자기 + 약초 다발)     오브젝트
#   2376 a2_stonepile_carried   나른 돌 더미(주먹돌)                  오브젝트
#   2377 a2_stonepile_wall      벽에 붙여 쌓은 돌                     오브젝트
#   2378 a2_rubble_ground_a     풀밭 위 흩어진 돌(통행 가능 지면)     지면(불투명)
#   2379 a2_rubble_ground_b     같은 변형 b                           지면
#   2380 a2_rockfall            낙석 무더기(산 m 대체, 통행 제한 지면) 지면
#   2381~2384 a2_ridge_W/C/E/single  얇은 돌 능선(1칸 높이 절벽 k 대체, 가로 이음) 지면
# 출력: 새 시트 public/assets/tiles/tileset_v2/tv2_static3_a2.png (512x64, 16열, 프레임 = 전역-2364). static3 용량(2200~2399) 안. 기존 시트 6장 무수정(해시 검사).
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/art_a2.py <루트> [--apply]
#   --apply : tv2_names.json(이름 등록)·tileset_v2_map.json(ranges_ext3.tv2_static3_a2, 지면은 index_map_ext3)·manifest_fragment_tv2.json(tileset.tv2_static3_a2) 갱신(멱등, 첫 실행 .bak-a2props-20261103)
# 팔레트: 기존 칩셋 목재(#3f1f0f~#e8c888)·바위(#443e4b~#bbb1c4)·화로 불(#d6282d #f26d2a #f5b251 #fbfb76) 재사용 + 쪽빛 천 4색·연기 3색 추가. 광원 왼쪽 위.
import sys, os, json, hashlib, shutil
import numpy as np
from PIL import Image

ROOT = sys.argv[1]
APPLY = '--apply' in sys.argv
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2')
OUTD = os.path.join(HERE, 'art_a2')
TVP = os.path.join(ROOT, 'public/assets/tiles/tileset_v2')
SHEET = os.path.join(TVP, 'tv2_static3_a2.png')
START = 2364
os.makedirs(os.path.join(OUTD, 'preview'), exist_ok=True)
H = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
sha_f = lambda p: hashlib.sha1(open(p, 'rb').read()).hexdigest()[:12]
KEEP = [os.path.join(TVP, f) for f in ('tv2_static.png', 'tv2_anim.png', 'tv2_anim2.png', 'tv2_static2.png', 'tv2_static3.png', 'tv2_static3_art.png')]
before = {p: sha_f(p) for p in KEEP if os.path.exists(p)}
NAMES = json.load(open(os.path.join(TVP, 'tv2_names.json'), encoding='utf-8'))['names']
STATIC = Image.open(os.path.join(TVP, 'tv2_static.png')).convert('RGBA')
def tile16(name):
    f = NAMES[name]['index'] - 1000
    a = np.array(STATIC.crop((f % 16 * 32, f // 16 * 32, f % 16 * 32 + 32, f // 16 * 32 + 32)))
    return Image.fromarray(np.ascontiguousarray(a[::2, ::2])).copy()
GRASS = tile16('grass_a')

# ---------------------------------------------------------------- 팔레트
WOOD = [H(c) for c in ('#2a1408', '#3f1f0f', '#674020', '#885f31', '#af7f40', '#c79f61', '#d8b374', '#e8c888')]   # 0 외곽 ~ 7 하이라이트
STONE = [H(c) for c in ('#2b2732', '#443e4b', '#60586a', '#7d748a', '#9d95a3', '#bbb1c4')]                    # 0 외곽 ~ 5
FIRE = [H(c) for c in ('#d6282d', '#f26d2a', '#f5b251', '#fbfb76')]
CLOTH = [H(c) for c in ('#141c30', '#22345a', '#34507e', '#4f71a3', '#7895c2')]                                 # 쪽빛 0 외곽 ~ 4
COTTON = [H(c) for c in ('#9b8f78', '#d1c5ae', '#efe8d6')]
HERB = [H(c) for c in ('#2d3d12', '#515e19', '#6f8a22', '#93ad3a')]
MUD = [H(c) for c in ('#3a2a16', '#55401f', '#6c522a')]
SOOT = H('#1a1416')
GRASS_SH = H('#3c6e14')   # 풀 위 그림자(지면 타일 전용, grass_a 가장 어두운 색보다 한 단계)

def new(): return Image.new('RGBA', (16, 16), (0, 0, 0, 0))
def put(P, x, y, c):
    if 0 <= x < 16 and 0 <= y < 16: P[x, y] = c

def outline(im, col, open_sides=''):
    """불투명 픽셀 중 투명과 4방향으로 맞닿은 칸을 외곽색으로. open_sides('W','E') = 칸 밖으로 이어지는 변(외곽선 없음, 이음용)."""
    a = np.array(im); al = a[..., 3] > 0; P = im.load(); out = []
    def opaque(u, v):
        if 0 <= u < 16 and 0 <= v < 16: return al[v, u]
        return (u < 0 and 'W' in open_sides) or (u > 15 and 'E' in open_sides)
    for y in range(16):
        for x in range(16):
            if not al[y, x]: continue
            nb = [(x, y - 1), (x, y + 1), (x - 1, y), (x + 1, y)]
            if any(not opaque(u, v) for u, v in nb): out.append((x, y))
    for x, y in out: P[x, y] = col
    return im

def stone_blob(P, cx, cy, rx, ry, pal=STONE, hi=True):
    """둥근 돌 1개: 왼쪽 위 광원 3단 음영 + 아래 외곽 진하게."""
    for y in range(16):
        for x in range(16):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            d = dx * dx + dy * dy
            if d > 1: continue
            l = -(dx * 0.7 + dy * 0.7)     # 왼쪽 위가 +
            if d > 0.72 and (dx + dy) > 0.2: t = 1
            elif l > 0.55 and hi: t = 5
            elif l > 0.05: t = 4
            elif l > -0.45: t = 3
            else: t = 2
            P[x, y] = pal[t]

# ---------------------------------------------------------------- 봉수대 연조(돌 굴뚝). verify: 조선 봉수대 연조 형태(원통/방형)는 지역마다 다름 -> 원통형 석축으로 표현
def chimney(lit):
    im = new(); P = im.load()
    x0, x1, yt, yb = 3, 12, 4, 14
    for y in range(yt, yb + 1):
        for x in range(x0, x1 + 1):
            u = (x - x0) / (x1 - x0)
            t = 5 if u < 0.18 else 4 if u < 0.42 else 3 if u < 0.7 else 2
            row = (y - yt) // 3; joint = (y - yt) % 3 == 2
            vj = (x - x0 + (row % 2) * 2) % 4 == 3
            if joint or vj: t = max(1, t - 2)
            P[x, y] = STONE[t]
    # 윗면 테두리(타원) + 안쪽 그을음 구멍
    for y in range(1, 7):
        for x in range(2, 14):
            dx, dy = (x + 0.5 - 8) / 5.6, (y + 0.5 - 4) / 2.6
            if dx * dx + dy * dy <= 1:
                P[x, y] = STONE[5] if (dx + dy) < -0.5 else STONE[4] if dx < 0.3 else STONE[3]
            ex, ey = (x + 0.5 - 8) / 3.4, (y + 0.5 - 3.8) / 1.4
            if ex * ex + ey * ey <= 1: P[x, y] = SOOT if not lit else (FIRE[0] if ey > 0.2 else SOOT)
    # 아궁이(앞 아래 아치)
    for y in range(10, 15):
        for x in range(6, 10):
            if y == 10 and x in (6, 9): continue
            P[x, y] = SOOT
    im = outline(im, STONE[0])
    if lit:
        for x, y, c in ((7, 13, 1), (8, 13, 1), (7, 12, 2), (8, 12, 1), (7, 11, 3), (6, 13, 0), (9, 13, 0), (8, 11, 2)):
            P[x, y] = FIRE[c]
        # 구멍 위 불꽃(3px 혀)
        for x, y, c in ((7, 3, 1), (8, 3, 2), (9, 3, 1), (6, 3, 0), (10, 3, 0), (7, 2, 2), (8, 2, 3), (9, 2, 1), (8, 1, 2), (7, 1, 0), (8, 0, 1)):
            P[x, y] = FIRE[c]
    return im

# ---------------------------------------------------------------- 연기(반투명, r2: 풀 위에서 초록으로 물들지 않게 밝은 색 + 알파 상향)
SMK = [(150, 144, 150), (204, 198, 198), (240, 236, 230)]
def smoke(kind):
    im = new(); P = im.load()
    def puff(cx, cy, r, a, period_x=False, period_y=False):
        for y in range(16):
            for x in range(16):
                for ox in ((-16, 0, 16) if period_x else (0,)):
                    for oy in ((-16, 0, 16) if period_y else (0,)):
                        dx, dy = x + 0.5 - (cx + ox), y + 0.5 - (cy + oy)
                        d = (dx * dx + dy * dy) ** 0.5 / r
                        if d > 1: continue
                        l = -(dx * 0.8 + dy) / r
                        t = 2 if l > 0.2 else 0 if (d > 0.78 and l < -0.25) else 1
                        na = min(240, int(a * 1.08)) if d < 0.8 else int(a * 0.85)
                        P[x, y] = SMK[t] + (na,)        # 나중에 그린 덩이가 위(앞)
    if kind == 'rise':      # 상하 이음(y 주기 16)
        for cx, cy, r in ((7.5, 13.5, 4.0), (8.5, 8, 4.2), (7, 2.5, 3.9)): puff(cx, cy, r, 215, period_y=True)
    elif kind == 'top':
        for cx, cy, r, a in ((12, 2, 1.8, 120), (4.5, 3.5, 2.2, 140), (9.5, 4.5, 3.0, 170), (7, 9, 3.8, 200), (7.5, 13.5, 4.0, 215)): puff(cx, cy, r, a)
    elif kind == 'drift':   # 좌우 이음(x 주기 16), 동쪽으로 눕는 띠
        for cx, cy, r in ((13.5, 8.5, 3.9), (2.5, 9, 3.9), (8, 7.5, 4.3)): puff(cx, cy, r, 205, period_x=True)
    elif kind == 'drift_end':
        for cx, cy, r, a in ((14.5, 5, 1.5, 110), (12.5, 10, 1.5, 110), (11.5, 6.5, 2.4, 140), (7.5, 7.5, 3.3, 175), (2.5, 9, 3.9, 205)): puff(cx, cy, r, a)
    return im

# ---------------------------------------------------------------- 짚 섬(곡식 가마) 1개: 가로로 누운 원통 + 새끼 두 줄
def bag(P, x0, y0, w, h):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            if (x in (x0, x0 + w - 1)) and (y in (y0, y0 + h - 1)): continue      # 둥근 모서리
            v = (y - y0) / max(1, h - 1)
            t = 7 if v < 0.25 else 6 if v < 0.55 else 5 if v < 0.85 else 4
            if (x - x0) % 2 == 1 and 0.2 < v < 0.9: t = max(4, t - 1)             # 짚 결(세로줄)
            P[x, y] = WOOD[t]
    for rx in (x0 + 1 + (w > 6), x0 + w - 2 - (w > 6)):                          # 새끼줄 띠
        for y in range(y0, y0 + h):
            if 0 <= rx < 16: P[rx, y] = WOOD[3]

def grain_bags(n):
    im = new(); P = im.load()
    if n == 1: bag(P, 2, 7, 12, 6)
    else:
        bag(P, 1, 9, 8, 5); bag(P, 8, 9, 8, 5); bag(P, 4, 4, 9, 5)
    return outline(im, WOOD[1])

# ---------------------------------------------------------------- 두바퀴 수레(동향 옆모습, 곡식 섬 2개 적재). r2: 바퀴살 사이를 비워 바닥이 비치게(바퀴 판독성)
# verify: 조선 소달구지/손수레 형태(바퀴살 수·채 길이)
import math
def cart(stuck=False):
    body = new(); P = body.load()
    bag(P, 1, 3, 6, 5); bag(P, 6, 3, 7, 5); bag(P, 3, 0, 7, 4)
    for y in range(8, 10):
        for x in range(0, 13):
            P[x, y] = WOOD[5] if y == 8 else WOOD[3]
            if x % 4 == 1 and y == 9: P[x, y] = WOOD[2]
    for x, y in ((13, 9), (14, 9), (15, 10), (14, 10), (15, 9)): P[x, y] = WOOD[4]     # 채(앞으로 뻗은 막대)
    body = outline(body, WOOD[1])
    wh = new(); Q = wh.load()
    cx, cy, R = 5.5, 11.3, 4.7
    for y in range(16):
        for x in range(16):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy; d = math.hypot(dx, dy)
            if d > R: continue
            if d > R - 1.0: Q[x, y] = WOOD[0]                                              # 테 외곽(어둡게: 흙길 위 판독)
            elif d > R - 2.0: Q[x, y] = WOOD[3] if (dx + dy) < 0 else WOOD[2]           # 테(빛/그늘)
            elif d < 1.4: Q[x, y] = WOOD[5] if (dx + dy) < 0 else WOOD[1]               # 통
            else:
                ang = (math.degrees(math.atan2(dy, dx)) + 360) % 45
                if ang < 10 or ang > 35: Q[x, y] = WOOD[1]                               # 바퀴살 8
    out = body.copy(); out.alpha_composite(wh)
    if stuck:   # 뒤(서)로 1px 기울고 바퀴 아래 1/3 이 진흙에 묻힘
        a = np.array(out); b = np.zeros_like(a)
        for x in range(16):
            sh = 1 if x < 9 else 0
            b[sh:, x] = a[:16 - sh, x]
        out = Image.fromarray(b).copy(); P = out.load()
        for y in range(11, 16):
            for x in range(0, 13):
                dx, dy = (x + 0.5 - 6) / 6.6, (y + 0.5 - 15.5) / 3.6
                if dx * dx + dy * dy <= 1:
                    P[x, y] = MUD[0] if dy > 0.1 and abs(dx) > 0.75 else MUD[2] if dy < -0.6 else MUD[1]
        for x, y in ((0, 11), (12, 11), (1, 10)): P[x, y] = MUD[1]
    return out

# ---------------------------------------------------------------- 약 보따리 r2: 납작한 쪽빛 보자기 + 위 매듭(가운데 공 + 좌우 귀) + 옆으로 비죽 나온 약초 잎
def medicine():
    im = new(); P = im.load()
    for y in range(7, 15):                                  # 몸통: 둥근 사각(가로로 넓게)
        for x in range(1, 15):
            if (x in (1, 14)) and (y in (7, 8, 14)): continue
            if y == 7 and x in (2, 13): continue
            l = -((x - 7.5) / 7 * 0.6 + (y - 10.5) / 4 * 0.8)
            P[x, y] = CLOTH[4] if l > 0.45 else CLOTH[3] if l > -0.05 else CLOTH[2] if l > -0.5 else CLOTH[1]
    for x, y in ((4, 10), (5, 11), (6, 11), (10, 11), (11, 10), (12, 12), (3, 13)): P[x, y] = CLOTH[2]   # 주름
    KNOT = {1: (2, 3, 4, 11, 12, 13), 2: (2, 3, 4, 5, 10, 11, 12, 13), 3: (3, 4, 5, 6, 7, 8, 9, 10, 11, 12), 4: (4, 5, 6, 7, 8, 9, 10, 11), 5: (6, 7, 8, 9), 6: (5, 6, 7, 8, 9, 10)}
    for y, xs in KNOT.items():                                                          # 매듭: 좌우 귀(넓은 삼각) + 목 + 묶음
        for x in xs: P[x, y] = CLOTH[4] if (x < 7 and y <= 3) else CLOTH[3] if x < 9 else CLOTH[2]
    for x, y in ((7, 4), (8, 4), (7, 5)): P[x, y] = CLOTH[2]                              # 매듭 가운데 조임 그늘
    for x, y, c in ((13, 6, 2), (14, 5, 3), (14, 6, 2), (15, 5, 2), (15, 4, 3), (14, 4, 2)): P[x, y] = HERB[c]   # 약초 잎
    im = outline(im, CLOTH[0]); P = im.load()
    for x, y in ((3, 9), (8, 9), (12, 8), (5, 13), (10, 13)): P[x, y] = COTTON[1]     # 보자기 무늬 점(흰 꽃점)
    for x, y in ((14, 5), (15, 4)): P[x, y] = HERB[3]
    return im

# ---------------------------------------------------------------- 돌 더미
def stonepile(kind):
    im = new(); P = im.load()
    if kind == 'carried':
        for cx, cy, rx, ry in ((4, 13, 2.8, 2.2), (8.5, 13.2, 3.0, 2.3), (12.5, 12.8, 2.6, 2.2), (6.2, 10.2, 2.6, 2.1), (10.5, 10, 2.7, 2.1), (8.3, 7.2, 2.5, 2.0), (3, 10.5, 1.6, 1.3)):
            stone_blob(P, cx, cy, rx, ry)
        return outline(im, STONE[0])
    # r2 벽에 붙여 쌓은 돌: 사각 돌 3단(위로 갈수록 좁게), 단마다 엇갈림, 돌마다 위 빛/아래 그늘
    rows = [(5, 4, 11, 3), (8, 2, 13, 3), (11, 1, 14, 4)]     # (y0, x0, x1, 높이)
    for i, (y0, x0, x1, h) in enumerate(rows):
        cuts = list(range(x0 + (2 if i % 2 else 0), x1 + 1, 4))
        for y in range(y0, y0 + h):
            for x in range(x0, x1 + 1):
                t = 3
                if y == y0: t = 5
                elif y == y0 + h - 1: t = 2
                if x in cuts and x != x0: t = 1
                elif x - 1 in cuts and y != y0 + h - 1: t = 4
                P[x, y] = STONE[t]
    return outline(im, STONE[0])

# ---------------------------------------------------------------- 지면: 풀 + 돌 / 낙석 / 능선
def ground_base(): return GRASS.copy()
def shadow_under(im, mask_im):
    """오브젝트 마스크 아래 오른쪽(1,1) 칸 풀에 그림자."""
    P = im.load(); m = np.array(mask_im)[..., 3] > 0
    for y in range(16):
        for x in range(16):
            if not m[y, x] and y > 0 and x > 0 and m[y - 1, x - 1]: P[x, y] = GRASS_SH
    return im
DIRT = [H(c) for c in ('#684020', '#885f31', '#9c7038')]
def dirt_patch(im, cx, cy, rx, ry, seed):
    P = im.load(); rng = np.random.default_rng(seed)
    for y in range(16):
        for x in range(16):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            d = dx * dx + dy * dy + rng.uniform(-0.18, 0.18)
            if d < 1: P[x, y] = H('#af7f40') if d < 0.4 else DIRT[2]
def rubble(var):
    """r2: 흙이 드러난 자리 + 중간 크기 돌 3~4개(통행 가능 지면 — 칸 가장자리는 풀이라 이웃 풀과 이어짐)."""
    im = ground_base(); ob = new(); P = ob.load()
    if var == 'a':
        dirt_patch(im, 8, 9, 6.0, 4.5, 3)
        pts = ((5, 8, 2.6, 2.1), (10.5, 7, 2.2, 1.8), (9, 11.5, 2.8, 2.1), (4, 12.2, 1.5, 1.2))
    else:
        dirt_patch(im, 7.5, 8, 5.6, 5.0, 5)
        pts = ((6.5, 5.5, 2.4, 1.9), (11, 9.5, 2.7, 2.2), (5, 10.5, 2.2, 1.8), (9, 13, 1.4, 1.1))
    for cx, cy, rx, ry in pts: stone_blob(P, cx, cy, rx, ry)
    ob = outline(ob, STONE[0])
    im = shadow_under(im, ob); im.alpha_composite(ob)
    return im
def rockfall():
    """r2: 흙 둔덕 + 바위가 겹쳐 쌓인 낙석(틈 없이 덩어리로 읽힘). 산(m) 판정 칸 대체 그림."""
    im = ground_base(); dirt_patch(im, 8, 9.5, 7.2, 6.0, 9)
    ob = new(); P = ob.load()
    for y in range(16):
        for x in range(16):
            dx, dy = (x + 0.5 - 8) / 6.6, (y + 0.5 - 10) / 5.0
            if dx * dx + dy * dy <= 1: P[x, y] = STONE[2]
    for cx, cy, rx, ry in ((3.8, 12, 2.8, 2.3), (12.3, 12.2, 2.9, 2.3), (8, 13, 2.8, 2.0), (5.5, 8.3, 3.0, 2.5), (10.8, 8, 3.1, 2.6), (8.2, 4.8, 3.2, 2.7)):
        stone_blob(P, cx, cy, rx, ry)
    ob = outline(ob, STONE[0])
    im = shadow_under(im, ob); im.alpha_composite(ob)
    return im
def ridge(kind):
    """가로 돌 능선: 윗면(밝음) + 앞면(어두움, 세로 금) + 아래 풀 그림자. W/C/E 가 좌우로 이어짐(이어지는 변엔 외곽선 없음)."""
    im = ground_base(); ob = new(); P = ob.load()
    L = kind in ('W', 'single'); R = kind in ('E', 'single')
    for x in range(16):
        top, bot = 4, 11
        if L and x < 3: top += 3 - x; bot -= (3 - x) // 2
        if R and x > 12: top += x - 12; bot -= (x - 12) // 2
        top += (0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0)[x]          # 윗선 요철(주기 16)
        for y in range(top, bot + 1):
            if y <= top + 2:
                t = 5 if y == top else 4
                if (x * 7 + y) % 9 == 0: t = 3
            else:
                t = 3 if y == top + 3 else 2
                if x % 5 == 2 and y > top + 3: t = 1                            # 세로 금
            P[x, y] = STONE[t]
    ob = outline(ob, STONE[0], open_sides=('E' if not R else '') + ('W' if not L else ''))
    Q = ob.load(); a = np.array(ob)[..., 3] > 0
    for x in range(16):                                                         # 윗면 테두리는 한 단계 밝은 외곽(광원 위)
        ys = np.where(a[:, x])[0]
        if len(ys): Q[x, int(ys[0])] = STONE[1]
    im = shadow_under(im, ob)
    Pm = im.load()
    for x in range(16):
        ys = np.where(a[:, x])[0]
        if len(ys) and ys[-1] + 1 < 16: Pm[x, int(ys[-1]) + 1] = GRASS_SH
    im.alpha_composite(ob)
    return im

x2 = lambda im: im.resize((32, 32), Image.NEAREST)
def mirror(im): return im.transpose(Image.FLIP_LEFT_RIGHT)
cartE = cart()
SPEC = [  # (이름, 16px 그림, 종류)
    ('a2_beacon_chimney', chimney(False), 'object'),
    ('a2_beacon_chimney_lit', chimney(True), 'object'),
    ('a2_smoke_rise', smoke('rise'), 'overlay'),
    ('a2_smoke_top', smoke('top'), 'overlay'),
    ('a2_smoke_drift', smoke('drift'), 'overlay'),
    ('a2_smoke_drift_end', smoke('drift_end'), 'overlay'),
    ('a2_cart_grain_E', cartE, 'object'),
    ('a2_cart_grain_W', mirror(cartE), 'object'),
    ('a2_cart_stuck_E', cart(stuck=True), 'object'),
    ('a2_grain_bags', grain_bags(3), 'object'),
    ('a2_grain_bag_single', grain_bags(1), 'object'),
    ('a2_medicine_bundle', medicine(), 'object'),
    ('a2_stonepile_carried', stonepile('carried'), 'object'),
    ('a2_stonepile_wall', stonepile('wall'), 'object'),
    ('a2_rubble_ground_a', rubble('a'), 'ground'),
    ('a2_rubble_ground_b', rubble('b'), 'ground'),
    ('a2_rockfall', rockfall(), 'ground'),
    ('a2_ridge_W', ridge('W'), 'ground'),
    ('a2_ridge_C', ridge('C'), 'ground'),
    ('a2_ridge_E', ridge('E'), 'ground'),
    ('a2_ridge_single', ridge('single'), 'ground'),
]
FR = {START + i: (n, x2(im), k) for i, (n, im, k) in enumerate(SPEC)}
assert max(FR) <= 2399, '용량 초과(static3 capacity 2399)'

# ---------------------------------------------------------------- QA
qa = {'date': '2026-11-03', 'author': '안아트', 'calls': 0, 'sheet': 'public/assets/tiles/tileset_v2/tv2_static3_a2.png', 'start': START, 'items': {}, 'errors': []}
for idx, (n, im, kind) in FR.items():
    a = np.array(im); al = a[..., 3]
    semi = int(((al > 0) & (al < 255)).sum())
    if kind == 'ground' and (al < 255).any(): qa['errors'].append(f'{n} 지면인데 투명 픽셀')
    if kind == 'object' and semi: qa['errors'].append(f'{n} 오브젝트 반투명 {semi}px(0/255 규칙)')
    if not (al > 0).any(): qa['errors'].append(f'{n} 비어 있음')
    rgb = a[..., :3].astype(int)
    if int(((rgb[..., 0] > 200) & (rgb[..., 2] > 200) & (rgb[..., 1] < 80) & (al > 0)).sum()): qa['errors'].append(f'{n} 마젠타')
    colors = len(set(map(tuple, a.reshape(-1, 4)[al.reshape(-1) > 0][:, :3].tolist())))
    qa['items'][n] = {'index': idx, 'frame': idx - START, 'kind': kind, 'opaque_ratio': round(float((al == 255).mean()), 3), 'semi_alpha_px': semi, 'colors': colors,
                      'bbox16': list(Image.fromarray(a).getbbox() or ()) if kind != 'ground' else None, 'sha1_12': hashlib.sha1(im.tobytes()).hexdigest()[:12]}
def wrap(im, axis):
    a = np.array(im).astype(int)
    return int(np.abs(a[:, 0] - a[:, -1]).sum()) if axis == 'x' else int(np.abs(a[0] - a[-1]).sum())
qa['seam'] = {'smoke_rise_y_alpha': wrap(np.array(FR[2366][1])[..., 3:], 'y'), 'smoke_drift_x_alpha': wrap(np.array(FR[2368][1])[..., 3:], 'x'),
              'ridge_C_x_rgb': wrap(np.array(FR[2382][1])[..., :3], 'x'),
              'ridge_W_to_C_rgb': int(np.abs(np.array(FR[2381][1])[:, -1, :3].astype(int) - np.array(FR[2382][1])[:, 0, :3].astype(int)).sum()),
              'ridge_C_to_E_rgb': int(np.abs(np.array(FR[2382][1])[:, -1, :3].astype(int) - np.array(FR[2383][1])[:, 0, :3].astype(int)).sum())}

sheet = Image.new('RGBA', (512, 64), (0, 0, 0, 0))
for idx, (n, im, kind) in FR.items():
    f = idx - START; sheet.paste(im, (f % 16 * 32, f // 16 * 32))
sheet.save(SHEET, optimize=True)
qa['sheet_size'] = list(sheet.size); qa['sheet_bytes'] = os.path.getsize(SHEET)
qa['sheet_pixel_sha1'] = hashlib.sha1(Image.open(SHEET).convert('RGBA').tobytes()).hexdigest()

# ---------------------------------------------------------------- 미리보기: 전체 x3 / 풀·석단 위 장면 조립 x3
grass32 = x2(GRASS); cf = NAMES['castlefloor47_255']['index'] - 1000
floor32 = STATIC.crop((cf % 16 * 32, cf // 16 * 32, cf % 16 * 32 + 32, cf // 16 * 32 + 32))
d255 = NAMES['dirt47_255']['index'] - 1000
dirt32 = STATIC.crop((d255 % 16 * 32, d255 // 16 * 32, d255 % 16 * 32 + 32, d255 // 16 * 32 + 32))
cat = Image.new('RGBA', (len(FR) * 34, 34), (40, 40, 40, 255))
for i, (idx, (n, im, kind)) in enumerate(FR.items()):
    cat.paste(grass32, (i * 34, 0)); cat.alpha_composite(im, (i * 34, 0))
cat.convert('RGB').resize((cat.width * 3, cat.height * 3), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'a2_all_on_grass_x3.png'))
BY = {n: im for _, (n, im, _) in FR.items()}
W, Hh = 12, 6
sc = Image.new('RGBA', (W * 32, Hh * 32))
for y in range(Hh):
    for x in range(W): sc.paste(grass32, (x * 32, y * 32))
# 봉수대: 석단 4x2 + 연조 2 + 연기
for x in range(1, 5):
    for y in (3, 4): sc.paste(floor32, (x * 32, y * 32))
sc.alpha_composite(BY['a2_beacon_chimney_lit'], (2 * 32, 3 * 32)); sc.alpha_composite(BY['a2_beacon_chimney'], (3 * 32, 3 * 32))
sc.alpha_composite(BY['a2_smoke_rise'], (2 * 32, 2 * 32)); sc.alpha_composite(BY['a2_smoke_top'], (2 * 32, 1 * 32))
sc.alpha_composite(BY['a2_smoke_drift'], (3 * 32, 2 * 32)); sc.alpha_composite(BY['a2_smoke_drift'], (4 * 32, 2 * 32)); sc.alpha_composite(BY['a2_smoke_drift_end'], (5 * 32, 2 * 32))
# 능선 줄
for x, k in ((1, 'W'), (2, 'C'), (3, 'C'), (4, 'E')): sc.paste(BY['a2_ridge_' + k], (x * 32, 5 * 32))
sc.paste(BY['a2_ridge_single'], (6 * 32, 0))
# 보급로: 흙길 + 수레
for x in range(6, 12):
    for y in (3, 4): sc.paste(dirt32, (x * 32, y * 32))
sc.alpha_composite(BY['a2_cart_grain_E'], (8 * 32, 3 * 32)); sc.alpha_composite(BY['a2_cart_stuck_E'], (7 * 32, 4 * 32)); sc.alpha_composite(BY['a2_cart_grain_W'], (10 * 32, 4 * 32))
sc.alpha_composite(BY['a2_grain_bags'], (7 * 32, 2 * 32)); sc.alpha_composite(BY['a2_grain_bag_single'], (9 * 32, 2 * 32))
sc.alpha_composite(BY['a2_medicine_bundle'], (11 * 32, 2 * 32))
sc.paste(BY['a2_rubble_ground_a'], (7 * 32, 0)); sc.paste(BY['a2_rubble_ground_b'], (8 * 32, 0)); sc.paste(BY['a2_rockfall'], (9 * 32, 0)); sc.paste(BY['a2_rockfall'], (10 * 32, 0))
sc.alpha_composite(BY['a2_stonepile_carried'], (8 * 32, 5 * 32)); sc.alpha_composite(BY['a2_stonepile_wall'], (9 * 32, 5 * 32))
sc.convert('RGB').resize((sc.width * 3, sc.height * 3), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'a2_scene_x3.png'))
sc.convert('RGB').save(os.path.join(OUTD, 'preview', 'a2_scene_x1.png'))

# ---------------------------------------------------------------- 등록(--apply)
if APPLY:
    for f in ('tv2_names.json', 'tileset_v2_map.json', 'manifest_fragment_tv2.json'):
        b = os.path.join(TVP, f + '.bak-a2props-20261103')
        if not os.path.exists(b): shutil.copyfile(os.path.join(TVP, f), b)
    NP = os.path.join(TVP, 'tv2_names.json'); doc = json.load(open(NP, encoding='utf-8')); names = doc['names']
    for idx, (n, im, kind) in FR.items():
        names[n] = {'sheet': 'tv2_static3_a2', 'frame': idx - START, 'index': idx, 'src': '안아트 art_a2.py 절차 도트(2026-11-03, 호출 0)', 'alpha': kind != 'ground', 'semi_alpha': kind == 'overlay', 'a2': True}
    doc['spec']['static3_a2'] = {'key': 'tv2_static3_a2', 'path': '/assets/tiles/tileset_v2/tv2_static3_a2.png', 'cols': 16, 'start': START, 'count': len(FR), 'size': [512, 64],
        'note': '안아트 art_a2.py(2026-11-03, 호출 0): 메인 2막 소품·지형. 2364~2365 봉수대 연조, 2366~2369 연기(반투명), 2370~2375 수레·곡식 섬·약 보따리, 2376~2377 돌 더미(오브젝트 0/255), 2378~2384 돌 지면·낙석·얇은 능선(불투명 지면). static3 용량 2200~2399 안'}
    json.dump(doc, open(NP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    MP = os.path.join(TVP, 'tileset_v2_map.json'); mp = json.load(open(MP, encoding='utf-8'))
    for idx, (n, im, kind) in FR.items():
        if kind == 'ground': mp.setdefault('index_map_ext3', {})[n] = idx
    mp.setdefault('ranges_ext3', {})['tv2_static3_a2'] = [START, START + len(FR) - 1]
    mp['a2_note'] = '안아트 art_a2.py --apply(2026-11-03): 2막 소품·지형 2364~2384(시트 tv2_static3_a2). 지면(a2_rubble_*·a2_rockfall·a2_ridge_*)은 index_map_ext3, 오브젝트·연기는 tv2_names 이름으로만 등록'
    json.dump(mp, open(MP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    FP = os.path.join(TVP, 'manifest_fragment_tv2.json'); fr = json.load(open(FP, encoding='utf-8'))
    fr['tileset.tv2_static3_a2'] = {
        'type': 'tileset', 'frame': [32, 32],
        'alpha': '2364~2365·2370~2377 오브젝트 투명(alpha 0/255) / 2366~2369 연기 반투명 오버레이(alpha 0~170) / 2378~2384 지면 불투명',
        'filter': 'nearest(Point), pixelArt=true, 정수 배율만',
        'names': '/assets/tiles/tileset_v2/tv2_names.json', 'name_map': '/assets/tiles/tileset_v2/tileset_v2_map.json',
        'generator': 'docker/gemini/tileset_v2/art_a2.py(안아트 2026-11-03, Pillow 절차 도트 16px x2, 이미지 모델 호출 0회). 풀 바탕만 칩셋 grass_a 픽셀 재사용',
        'source': '자체 제작(지면 7칸의 풀 바탕 = tv2_static grass_a 1000)', 'prompt_ref': '없음(절차 합성)',
        'license': '이 프로젝트 자체 제작(안아트). 지면 칸 풀 바탕은 칩셋(라이선스 미확인) 픽셀 재사용 — 공개 전 권리 확인 필요',
        'verify': True, 'verify_items': ['봉수대 연조 형태(원통 석축, 지역별 차이)', '조선 두바퀴 수레 형태·바퀴살 수', '곡식 섬(짚 가마) 묶음 방식'],
        'scope': 'battle', 'path': 'assets/tiles/tileset_v2/tv2_static3_a2.png', 'width': 512, 'height': 64, 'cols': 16, 'start': START, 'count': len(FR),
        'bytes': os.path.getsize(SHEET),
        'load_hint': "this.load.spritesheet('tv2_static3_a2', path, {frameWidth:32, frameHeight:32}) — 프레임 = 전역 인덱스 - 2364",
        'notes': ['FE 미연결(U32_TV2.static3_a2 start 2364 count 21, u32Src 2364 분기를 static3_art 보다 먼저 또는 2364~2384 범위 분기)', 'tmv2.py src() 에 i>=2364 -> tv2_static3_a2 분기 필요(맵디자이너)', '연기 2366~2369 는 정적. 흔들림은 FE tween(알파 0.7~1, y -2px) 권장'],
        'qa': 'docker/gemini/tileset_v2/art_a2/art_a2_qa.json'}
    json.dump(fr, open(FP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('applied')

after = {p: sha_f(p) for p in before}
qa['existing_sheets_unchanged'] = before == after
json.dump(qa, open(os.path.join(OUTD, 'art_a2_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'frames': len(FR), 'range': [START, max(FR)], 'errors': qa['errors'], 'seam': qa['seam'], 'existing_unchanged': qa['existing_sheets_unchanged'], 'bytes': qa['sheet_bytes']}, ensure_ascii=False))
