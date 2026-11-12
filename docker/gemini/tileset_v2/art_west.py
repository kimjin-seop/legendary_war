# tileset_v2 서유럽 세트(ch23 헤이스팅스·ch24 투르 대체 타일 교체용) — 안아트 2026-11-03. 이미지 모델 호출 0회(Pillow 절차 도트, 16px 원화 -> x2 최근접).
# 합의(팀장·맵디자이너 2026-11-03): 전역 2700~3699, 4방 16형(성벽·부두·갈대·울타리), 47형(능선 언덕), 통행 = 성문·아치·성벽 틈·부두 칸, 불통 = 배·석탑·건물 본체.
# 새 시트 tv2_static6_west.png(512x928, 16열, 프레임 = 전역 - 2700). 세트별 구간:
#   2700~ 서유럽 석벽·성문·아치(ov_wwall_<m4> 16형, ov_wwall_gate_h/v, ov_wwall_arch_h/v, ov_wwall_breach_h/v, ov_wtower_<r><c> 2x2, ov_ruin_h/v/corner/pile)
#   2800~ 능선 언덕 ridge47_<mask>(47형 지면, 남쪽 = 완만한 풀 비탈) + ridge_fill_b/c + ridge_path_199/68(비탈 흙길, 통행)
#   2900~ 민가 ov_whouse_{thatch,shingle,stone,gable} 1x1, ov_wlong_<r><c>·ov_wmanor_<r><c>·ov_wmill_<r><c> 2x2, ov_wheel(물레방아 1x1), ov_wfence_<m4> 16형
#   3000~ 배·부두 ov_longship_h_<c>(3x1)·ov_longship_v_<r>(1x3), ov_boat_h/v, ov_pier_<m4> 16형(부두 = 통행), ov_piling_a/b
#   3100~ 소품 ov_reed_<m4> 16형 + ov_reed_a/b, ov_wflag_{red,blue,white}, ov_bell_tent, ov_pavilion_<r><c> 2x2, ov_andalus_tent_<r><c> 2x2, ov_cart_h/v
# 4방 마스크 = N1 E2 S4 W8(art_camp.py 목책과 같은 규칙). 47형 = landPaint.js red() 규칙(art_mtn.py 와 같은 classify).
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/art_west.py <루트> [--apply]   (의존: pillow, numpy)
#   --apply : tv2_static6_west.png 저장 + tv2_names.json(spec.static6_west, names)·tileset_v2_map.json(ranges_west, index_map_west)·manifest_fragment_tv2.json 갱신(첫 실행 .bak-west-20261103)
import sys, os, json, hashlib, shutil
import numpy as np
from PIL import Image, ImageDraw

ROOT = sys.argv[1]; APPLY = '--apply' in sys.argv
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2'); OUTD = os.path.join(HERE, 'art_west'); os.makedirs(os.path.join(OUTD, 'preview'), exist_ok=True)
TVP = os.path.join(ROOT, 'public/assets/tiles/tileset_v2'); SHEET = os.path.join(TVP, 'tv2_static6_west.png')
START, END = 2700, 3699; TAG = '.bak-west-20261103'
SETS = {'wall': 2700, 'ridge': 2800, 'house': 2900, 'ship': 3000, 'prop': 3100}
Hx = lambda s: (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16), 255)
sha_f = lambda p: hashlib.sha1(open(p, 'rb').read()).hexdigest()[:12]
KEEP = [os.path.join(TVP, f) for f in os.listdir(TVP) if f.startswith('tv2_') and f.endswith('.png') and 'static6' not in f]
before = {p: sha_f(p) for p in KEEP}
NAMES = json.load(open(os.path.join(TVP, 'tv2_names.json'), encoding='utf-8'))
STATIC = Image.open(os.path.join(TVP, 'tv2_static.png')).convert('RGBA')
def tile16(name):
    f = NAMES['names'][name]['index'] - 1000
    return np.ascontiguousarray(np.array(STATIC.crop((f % 16 * 32, f // 16 * 32, f % 16 * 32 + 32, f // 16 * 32 + 32)))[::2, ::2]).copy()
GRASS = tile16('grass_a')
def anim16(name):   # 미리보기용 물(tv2_anim 첫 프레임)
    nm = NAMES['names'][name]; im = Image.open(os.path.join(TVP, nm['sheet'] + '.png')).convert('RGBA'); f = nm['frame']
    return np.ascontiguousarray(np.array(im.crop((f % 16 * 32, f // 16 * 32, f % 16 * 32 + 32, f // 16 * 32 + 32)))[::2, ::2]).copy()
WATER = anim16('water47_255')

# ---------------------------------------------------------------- 팔레트(광원 왼쪽 위, 외곽선 = 재질 가장 어두운 단)
STONE = [Hx(c) for c in ('#2e2a2c', '#4a4446', '#6a6260', '#8c8378', '#ada392', '#cfc6b0')]      # 석회·사암 회갈 6단
MOSSY = [Hx(c) for c in ('#3c7c12', '#438d17', '#5c9c25')]                                          # 칩셋 풀 3단(이끼)
WOOD = [Hx(c) for c in ('#3f1f0f', '#684020', '#885f31', '#af7f40', '#c79f61')]                     # 칩셋 흙/나무 5단
THATCH = [Hx(c) for c in ('#3e2c12', '#6e5222', '#9a7a36', '#c2a252', '#e0c67c')]
SLATE = [Hx(c) for c in ('#24222c', '#3c3a48', '#57546a', '#77748a', '#9a98ac')]
PLASTER = [Hx(c) for c in ('#5e5444', '#9a8e74', '#c6ba9a', '#e4d9bc')]
DARK = Hx('#1a1414')
CLOTH = {'red': [Hx(c) for c in ('#3a1210', '#7a2420', '#a83a2e', '#cc5a44')], 'blue': [Hx(c) for c in ('#141c3a', '#243a6e', '#3a5a9a', '#5a7cc0')],
         'white': [Hx(c) for c in ('#5a5446', '#a69e88', '#d4ccb4', '#f0ead6')], 'ochre': [Hx(c) for c in ('#4a3210', '#8a6420', '#b88a34', '#dcb058')]}
REED = [Hx(c) for c in ('#3a3a14', '#5e6222', '#868c36', '#aab052', '#cfc27a')]
GRASS_SH = Hx('#2f6a0e'); LIP = Hx('#5c9c25'); RIM = Hx('#8fc451')
HIGRASS = {Hx('#3c7c12')[:3]: Hx('#438d17'), Hx('#438d17')[:3]: Hx('#5c9c25'), Hx('#5c9c25')[:3]: Hx('#76b03a')}
SLOPE = [Hx(c) for c in ('#5c9c25', '#438d17', '#3c7c12', '#2f6a0e', '#25560a')]
EARTH = WOOD

def outline(a, col):
    al = a[..., 3] > 0; p = np.pad(al, 1); edge = al & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    o = a.copy(); o[edge] = col; return o
N_, E_, S_, W_ = 1, 2, 4, 8

# ---------------------------------------------------------------- 4방 16형 공통: 확장 캔버스(-1..16)에 그리고 외곽선 판정 후 16x16 자름 -> 이웃 칸과 경계 동일
def ext4(m, paint, ocol, special=None):
    C = np.zeros((18, 18, 4), np.uint8)
    def put(x, y, col):
        if -1 <= x <= 16 and -1 <= y <= 16: C[y + 1, x + 1] = col
    paint(m, put, special)
    al = C[..., 3] > 0; p = np.pad(al, 1, constant_values=True)
    edge = al & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]); edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = False
    C2 = C.copy(); C2[edge] = ocol
    return C2[1:17, 1:17].copy()

def arms(m, cx0, cx1, cy0, cy1):
    """칸 안 영역 함수: 가운데 노드 [cx0..cx1]x[cy0..cy1] + 팔(N·S = 같은 x 폭, E·W = 같은 y 폭)이 경계 밖 -1/16 까지."""
    def inside(x, y):
        if cx0 <= x <= cx1 and cy0 <= y <= cy1: return True
        if m & W_ and x <= cx1 and cy0 <= y <= cy1: return True
        if m & E_ and x >= cx0 and cy0 <= y <= cy1: return True
        if m & N_ and y <= cy1 and cx0 <= x <= cx1: return True
        if m & S_ and y >= cy0 and cx0 <= x <= cx1: return True
        return False
    return inside

# ---- 석벽: 윗면(걷는 길, 판석) + 북쪽·옆 총안(merlon 2px, 주기 4) + 남쪽 벽면(벽돌 줄 3px 주기, 세로 줄눈 엇갈림 주기 8)
FACE_H = 6
def wall_paint(m, put, sp):
    T = arms(m, 4, 11, 3, 8)
    if sp in ('breach_h',): T0 = T; T = lambda x, y: T0(x, y) and not (5 <= x <= 10)
    if sp in ('breach_v',): T0 = T; T = lambda x, y: T0(x, y) and not (6 <= y <= 10)
    for y in range(-1, 17):
        for x in range(-1, 17):
            if T(x, y):
                c = STONE[3]
                if y % 4 == 0 or (x + (4 if (y // 4) % 2 else 0)) % 8 == 0: c = STONE[2]
                if not T(x, y - 1) or not T(x - 1, y): c = STONE[4]
                put(x, y, c); continue
            # 벽면: 위쪽 1~FACE_H 안에 윗면이 있고, 그 사이에 윗면이 아닌 칸
            k = next((k for k in range(1, FACE_H + 1) if T(x, y - k)), None)
            if k is not None:
                course = (k - 1) // 3; c = STONE[2]
                if (k - 1) % 3 == 2: c = STONE[1]
                elif (x + (4 if course % 2 else 0)) % 8 == 0: c = STONE[1]
                if k == 1: c = STONE[1]
                if k == FACE_H: c = STONE[0]
                put(x, y, c); continue
            # 총안: 북쪽 가장자리 위 2px(가로 팔), 서·동 가장자리 옆 2px(세로 팔), 주기 4 중 2칸
            if (T(x, y + 1) or T(x, y + 2)) and x % 4 in (0, 1): put(x, y, STONE[5] if T(x, y + 2) and not T(x, y + 1) else STONE[4]); continue
            if (T(x + 1, y) or T(x + 2, y)) and y % 4 in (0, 1) and not T(x, y + 1): put(x, y, STONE[4]); continue
            if (T(x - 1, y) or T(x - 2, y)) and y % 4 in (0, 1) and not T(x, y + 1): put(x, y, STONE[3]); continue
    if sp == 'gate_h' or sp == 'arch_h':        # 벽면(가로)에 아치 통로: x 5..10, 벽면 k 2..6 + 윗면 아래쪽 2줄까지(높은 아치)
        for y in range(7, 15):
            for x in range(5, 11):
                r = 3.0; cx = 7.5
                top = 10 - np.sqrt(max(0.0, r * r - (x + 0.5 - (cx + 0.5)) ** 2)) * 0.9
                if y + 0.5 >= top:
                    put(x, y, (WOOD[2] if (x in (5, 10) or y == 14) else WOOD[3] if x < 8 else WOOD[1]) if sp == 'gate_h' else DARK)
                    if sp == 'gate_h' and x in (7, 8): put(x, y, WOOD[0])
    if sp == 'gate_v' or sp == 'arch_v':        # 세로 벽: 윗면 y 5..10 을 끊고 통로(판석 바닥) + 문짝
        for y in range(5, 11):
            for x in range(4, 12):
                if sp == 'arch_v': put(x, y, STONE[2] if (x + y) % 5 else STONE[1])
                else: put(x, y, WOOD[3] if y in (6, 9) else WOOD[2] if x % 3 else WOOD[1])
            put(3, y, STONE[1]); put(12, y, STONE[1])
        for x in range(3, 13): put(x, 4, STONE[5]); put(x, 11, STONE[0])
    if sp in ('breach_h', 'breach_v'):           # 무너진 돌 더미(통행 칸)
        rng = np.random.default_rng(5)
        for _ in range(16):
            x = int(rng.integers(4, 12)); y = int(rng.integers(9, 14)) if sp == 'breach_h' else int(rng.integers(6, 11))
            put(x, y, STONE[int(rng.integers(2, 5))]); put(x + 1, y, STONE[1])
def wall(m, sp=None): return ext4(m, wall_paint, STONE[0], sp)

def tower():
    a = np.zeros((32, 32, 4), np.uint8)
    for y in range(4, 20):
        for x in range(3, 29):
            c = STONE[3] if (y % 4 and (x + (4 if (y // 4) % 2 else 0)) % 8) else STONE[2]
            if y == 4 or x == 3: c = STONE[4]
            a[y, x] = c
    for x in range(3, 29):
        if x % 4 in (0, 1):
            a[2, x] = STONE[5]; a[3, x] = STONE[4]
    for y in range(4, 20, 4):
        a[y, 1] = a[y, 2] = STONE[4]; a[y + 1, 1] = a[y + 1, 2] = STONE[4]
        a[y, 29] = a[y, 30] = STONE[3]; a[y + 1, 29] = a[y + 1, 30] = STONE[3]
    for y in range(7, 17):
        for x in range(8, 24): a[y, x] = DARK if (x in (8, 23) or y in (7, 16)) else WOOD[2] if (x + y) % 6 else WOOD[1]   # 지붕 없는 안뜰 판자 바닥
    for y in range(20, 30):
        for x in range(3, 29):
            k = y - 20; a[y, x] = STONE[1] if (k % 3 == 2 or (x + (4 if (k // 3) % 2 else 0)) % 8 == 0) else STONE[2]
    for y in range(22, 27): a[y, 15] = DARK; a[y, 16] = DARK          # 화살 구멍
    a[29, 3:29] = STONE[0]
    return outline(a, STONE[0])

def ruin(kind):
    a = np.zeros((16, 16, 4), np.uint8); rng = np.random.default_rng({'h': 1, 'v': 2, 'corner': 3, 'pile': 4}[kind])
    def block(x0, y0, x1, y1, face=3):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if rng.random() < 0.1 and (y == y0): continue
                a[y, x] = STONE[3] if (x + y) % 5 else STONE[2]
                if y == y0 and rng.random() < 0.45: a[y, x] = MOSSY[int(rng.integers(0, 3))]
        for y in range(y1 + 1, min(16, y1 + 1 + face)):
            for x in range(x0, x1 + 1): a[y, x] = STONE[1] if (y - y1) % 2 == 0 else STONE[2]
    if kind == 'h': block(0, 7, 15, 9); [a.__setitem__((7, x), 0) for x in (3, 4, 11)]
    if kind == 'v': block(6, 0, 9, 12)
    if kind == 'corner': block(6, 7, 15, 9); block(6, 0, 9, 9)
    if kind == 'pile':
        for _ in range(26):
            x, y = int(rng.integers(2, 14)), int(rng.integers(6, 14)); a[y, x] = STONE[int(rng.integers(2, 5))]; a[y, x + 1] = STONE[1]; a[y + 1, x] = STONE[1]
        a[5, 6] = MOSSY[2]; a[6, 9] = MOSSY[1]
    return outline(a, STONE[0])

# ---------------------------------------------------------------- 능선 언덕 47형(art_mtn.py classify 복사: 같은 마스크·요철 규칙)
BITS = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}
def red(m):
    for d, a, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not ((m & BITS[a]) and (m & BITS[b])): m &= ~BITS[d]
    return m
MASKS = sorted(set(red(m) for m in range(256))); assert len(MASKS) == 47 and MASKS == NAMES['spec']['masks']
WOB2 = [0, 1, 1, 2, 2, 1, 1, 0, 0, 1, 2, 2, 1, 0, 0, 0]; FACEW = [0, 0, 1, 1, 0, -1, -1, 0, 1, 1, 1, 0, 0, -1, 0, 0]
def classify(m, mN=2, mS=2, mE=2, mW=2, F=5):
    out = lambda d: not (m & BITS[d]); cls = np.ones((16, 16), np.uint8)
    for y in range(16):
        for x in range(16):
            n_ = mN + WOB2[x]; s_ = mS; e_ = mE + WOB2[(y + 3) % 16]; w_ = mW + WOB2[(y + 9) % 16]; Fx = F + FACEW[x]
            dN, dS, dE, dW = y + 0.5, 16 - y - 0.5, 16 - x - 0.5, x + 0.5; c = 1
            if out('N') and dN < n_: c = 0
            if out('W') and dW < w_: c = 0
            if out('E') and dE < e_: c = 0
            if out('S'):
                if dS < s_: c = 0
                elif dS < s_ + Fx and c: c = 2
            if not out('N') and not out('E') and out('NE') and dE < e_ and dN < n_: c = 0
            if not out('N') and not out('W') and out('NW') and dW < w_ and dN < n_: c = 0
            if not out('S') and not out('E') and out('SE') and dE < e_:
                if dS < s_: c = 0
                elif dS < s_ + Fx: c = 2
            if not out('S') and not out('W') and out('SW') and dW < w_:
                if dS < s_: c = 0
                elif dS < s_ + Fx: c = 2
            if c and out('N') and out('W') and dN < n_ + 1 and dW < w_ + 1: c = 0
            if c and out('N') and out('E') and dN < n_ + 1 and dE < e_ + 1: c = 0
            cls[y, x] = c
    return cls
def ridge(m, var=None, path=False):
    cls = classify(m); a = GRASS.copy()
    g = lambda u, v, c: cls[v, u] if 0 <= u < 16 and 0 <= v < 16 else c
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 1: a[y, x] = HIGRASS.get(tuple(GRASS[y, x][:3]), GRASS[y, x])
            elif c == 2:
                k = 0
                while y - k - 1 >= 0 and cls[y - k - 1, x] == 2: k += 1
                a[y, x] = SLOPE[min(4, k)] if not (x % 5 == 2 and k in (2, 3)) else SLOPE[min(4, k + 1)]
    res = a.copy()
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 0:
                if g(x, y - 1, 0) == 2: res[y, x] = GRASS_SH
                continue
            if c == 1 and (g(x, y - 1, c) == 0 or g(x - 1, y, c) == 0): res[y, x] = RIM
            elif c == 1 and (g(x + 1, y, c) == 0): res[y, x] = LIP
    if var == 'b':
        for x, y in ((4, 5), (10, 3), (7, 11), (12, 9)): res[y, x] = Hx('#e0d070'); res[y + 1, x] = MOSSY[0]
    if var == 'c':
        for x, y in ((5, 6), (11, 10)): res[y, x] = STONE[4]; res[y, x + 1] = STONE[2]; res[y + 1, x] = STONE[1]; res[y + 1, x + 1] = STONE[1]
    if path:   # 남쪽 비탈을 가로지르는 흙길(가운데 x 6..9, 비탈 칸에서 계단 줄)
        for y in range(16):
            for x in range(6, 10):
                near = cls[y, x] == 1 and any(y + k < 16 and cls[y + k, x] == 2 for k in range(1, 4))
                if cls[y, x] == 2 or near or (m == 68 and cls[y, x] == 1):
                    res[y, x] = EARTH[3] if y % 2 else EARTH[2]
                    if x in (6, 9): res[y, x] = EARTH[1]
    return res

# ---------------------------------------------------------------- 민가
def house(kind):
    a = np.zeros((16, 16, 4), np.uint8); im = Image.fromarray(a); d = ImageDraw.Draw(im)
    R = THATCH if kind in ('thatch', 'stone', 'gable') else SLATE
    Wl = STONE if kind == 'stone' else PLASTER
    if kind == 'gable':     # 박공이 남쪽(정면)
        d.rectangle([2, 8, 13, 14], fill=Wl[2]); d.rectangle([10, 8, 13, 14], fill=Wl[1])
        d.polygon([(8, 1), (15, 8), (1, 8)], fill=R[3]); d.polygon([(8, 1), (15, 8), (9, 8)], fill=R[2])
        d.rectangle([6, 10, 8, 14], fill=WOOD[1])
    else:
        d.rectangle([1, 2, 14, 9], fill=R[3]); d.rectangle([1, 6, 14, 9], fill=R[2])                 # 지붕 앞면(위 = 빛, 아래 = 처마 그늘)
        d.rectangle([1, 1, 14, 1], fill=R[4])                                                        # 용마루
        d.rectangle([2, 10, 13, 14], fill=Wl[2]); d.rectangle([11, 10, 13, 14], fill=Wl[1])         # 벽
        d.rectangle([7, 11, 9, 14], fill=WOOD[1]); d.point((8, 12), fill=WOOD[3])                   # 문
        d.rectangle([3, 11, 4, 12], fill=DARK)                                                       # 창
    a = np.array(im)
    if kind in ('thatch', 'stone'):
        for x in range(1, 15):
            if x % 3 == 0: a[4, x] = R[4]; a[7, x] = R[1]
        for x in range(1, 15): a[9, x] = R[1] if x % 2 else R[0]                                     # 짚 처마 끝
    if kind == 'shingle':
        for y in (3, 5, 7):
            for x in range(1, 15): a[y, x] = R[1] if (x + y) % 4 == 0 else a[y, x]
        a[0, 11] = a[1, 11] = STONE[2]; a[0, 12] = a[1, 12] = STONE[1]                              # 굴뚝
    if kind != 'gable' and kind != 'stone':
        for x in (2, 13): a[10:15, x] = WOOD[1]                                                       # 목조 기둥
    if kind == 'stone':
        for y in (11, 13):
            for x in range(2, 14): a[y, x] = Wl[1] if (x + y) % 4 == 0 else a[y, x]
    return outline(a, R[0])

def big(kind):
    a = np.zeros((32, 32, 4), np.uint8); im = Image.fromarray(a); d = ImageDraw.Draw(im)
    if kind == 'long':
        R, Wl = THATCH, PLASTER
        d.rectangle([1, 3, 30, 18], fill=R[3]); d.rectangle([1, 12, 30, 18], fill=R[2]); d.rectangle([1, 2, 30, 2], fill=R[4])
        d.rectangle([2, 19, 29, 28], fill=Wl[2]); d.rectangle([24, 19, 29, 28], fill=Wl[1])
        d.rectangle([14, 21, 17, 28], fill=WOOD[1]); d.rectangle([5, 21, 7, 23], fill=DARK); d.rectangle([22, 21, 24, 23], fill=DARK)
        a = np.array(im)
        for x in range(1, 31):
            if x % 3 == 0: a[6, x] = R[4]; a[10, x] = R[4]; a[15, x] = R[1]
            a[18, x] = R[1] if x % 2 else R[0]
        for x in (2, 9, 20, 29): a[19:29, x] = WOOD[1]
        a[24, 2:30] = np.where(a[24, 2:30, 3:4] > 0, WOOD[2], a[24, 2:30])
        return outline(a, R[0])
    if kind == 'manor':
        R, Wl = SLATE, STONE
        d.rectangle([1, 3, 30, 16], fill=R[3]); d.rectangle([1, 11, 30, 16], fill=R[2]); d.rectangle([1, 2, 30, 2], fill=R[4])
        d.rectangle([2, 17, 29, 29], fill=Wl[3]); d.rectangle([24, 17, 29, 29], fill=Wl[2])
        d.rectangle([13, 21, 18, 29], fill=WOOD[1]); d.rectangle([13, 21, 18, 21], fill=Wl[1])
        for x0 in (5, 22): d.rectangle([x0, 20, x0 + 2, 23], fill=DARK)
        a = np.array(im)
        for y in (5, 8, 11, 14):
            for x in range(1, 31): a[y, x] = R[1] if (x + y) % 4 == 0 else a[y, x]
        for y in (19, 22, 25, 28):
            for x in range(2, 30): a[y, x] = Wl[1] if (x + (2 if y % 2 else 0)) % 6 == 0 else a[y, x]
        a[0:3, 25] = STONE[2]; a[0:3, 26] = STONE[1]; a[0, 24:28] = STONE[3]
        return outline(a, R[0])
    if kind == 'mill':
        R, Wl = THATCH, PLASTER
        d.rectangle([1, 3, 21, 16], fill=R[3]); d.rectangle([1, 11, 21, 16], fill=R[2]); d.rectangle([1, 2, 21, 2], fill=R[4])
        d.rectangle([2, 17, 20, 29], fill=Wl[2]); d.rectangle([16, 17, 20, 29], fill=Wl[1]); d.rectangle([8, 22, 11, 29], fill=WOOD[1])
        a = np.array(im)
        for x in range(1, 22): a[16, x] = R[1] if x % 2 else R[0]
        for x in (2, 11, 20): a[17:30, x] = WOOD[1]
        a = outline(a, R[0])
        w = wheel(20)
        for y in range(20):
            for x in range(20):
                if w[y, x, 3] and 11 + x < 32 and 11 + y < 32: a[11 + y, 11 + x] = w[y, x]
        return a
def wheel(S=16):
    a = np.zeros((S, S, 4), np.uint8); c = (S - 1) / 2; R = S / 2 - 1
    for y in range(S):
        for x in range(S):
            r = np.hypot(x - c, y - c); th = np.arctan2(y - c, x - c)
            if R - 1.6 <= r <= R: a[y, x] = WOOD[3] if (x + y) < S else WOOD[2]
            elif r < R - 1.6 and (abs(np.sin(4 * th)) < 0.18 and r > 1.2): a[y, x] = WOOD[2]
            elif r <= 1.5: a[y, x] = WOOD[1]
            if R - 0.6 <= r <= R + 0.6 and int((th + np.pi) / (2 * np.pi) * 12) % 2 == 0: a[y, x] = WOOD[4]   # 물받이 판
    return outline(a, WOOD[0])

# ---- 울타리(나무 기둥 + 가로대 2줄), 4방 16형
def fence_paint(m, put, sp):
    for x in range(-1, 17):
        hor = (m & W_ and x <= 8) or (m & E_ and x >= 7) or (6 <= x <= 9 and not (m & (N_ | S_)))
        if hor:
            for y in (7, 10): put(x, y, WOOD[3]); put(x, y + 1, WOOD[1])
    for y in range(-1, 17):
        ver = (m & N_ and y <= 9) or (m & S_ and y >= 7)
        if ver: put(7, y, WOOD[3]); put(8, y, WOOD[2])
    for px in ([7] + ([0] if m & W_ else []) + ([15] if m & E_ else [])):     # 기둥(노드 + 칸 경계 기둥 = 이웃 칸과 공유 위치)
        if px == 7 or True:
            for y in range(5, 13): put(px, y, WOOD[4] if px != 15 else WOOD[2]); put(px + 1 if px < 15 else px, y, WOOD[2])
def fence(m): return ext4(m, fence_paint, WOOD[0])

# ---------------------------------------------------------------- 배·부두
def longship(vertical=False):
    L, Wd = 48, 16; a = np.zeros((Wd, L, 4), np.uint8)
    for x in range(L):
        t = x / (L - 1); half = 5.2 * np.sin(np.pi * min(1, max(0, (t - 0.03) / 0.94))) ** 0.6
        for y in range(Wd):
            dy = abs(y - 8 + 0.5)
            if dy <= half:
                a[y, x] = WOOD[3] if y < 8 else WOOD[2]
                if dy > half - 1.2: a[y, x] = WOOD[1]
                if half > 2 and dy <= half - 2.2: a[y, x] = WOOD[2] if x % 4 else WOOD[1]      # 갑판 판자
    for x, col in ((1, WOOD[4]), (2, WOOD[3]), (45, WOOD[4]), (46, WOOD[3])):                  # 높이 휜 이물·고물 기둥
        for y in range(4, 12): a[y, x] = col if 5 <= y <= 10 else a[y, x]
    for i, x in enumerate(range(9, 40, 5)):                                                     # 무지 둥근 방패 줄(양현)
        cl = CLOTH['red' if i % 2 else 'white']
        for (yy) in (3, 12):
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if abs(dx) + abs(dy) <= 1: a[yy + dy, x + dx] = cl[2] if (dx, dy) != (0, 0) else WOOD[3]
    for y in range(4, 12): a[y, 23] = WOOD[4]; a[y, 24] = WOOD[2]                               # 돛대 + 접은 돛(무지)
    for x in range(18, 30): a[7, x] = CLOTH['white'][3]; a[8, x] = CLOTH['white'][2]
    a = outline(a, WOOD[0])
    return np.ascontiguousarray(np.rot90(a, 1)) if vertical else a
def boat(vertical=False):
    a = np.zeros((16, 16, 4), np.uint8)
    for x in range(1, 15):
        half = 4 * np.sin(np.pi * (x - 0.5) / 14) ** 0.7
        for y in range(16):
            dy = abs(y - 8 + 0.5)
            if dy <= half: a[y, x] = WOOD[1] if dy > half - 1.1 else WOOD[3] if y < 8 else WOOD[2]
    for y in range(6, 10): a[y, 7] = WOOD[1]                                                    # 가로 좌판
    for x in range(4, 12): a[8, x] = WOOD[4] if x in (4, 11) else a[8, x]                        # 노
    a = outline(a, WOOD[0])
    return np.ascontiguousarray(np.rot90(a, 1)) if vertical else a
def pier_paint(m, put, sp):
    inside = arms(m, 3, 12, 3, 12)
    for y in range(-1, 17):
        for x in range(-1, 17):
            if inside(x, y):
                horiz = (m & (E_ | W_)) and 3 <= y <= 12 and not (m & (N_ | S_) and 3 <= x <= 12 and not (m & (E_ | W_)))
                plank = (x % 4 == 0) if (m & (E_ | W_)) and 3 <= y <= 12 else (y % 4 == 0)
                put(x, y, WOOD[1] if plank else WOOD[3] if (x + y) % 7 else WOOD[4])
    for (x, y) in ((3, 13), (12, 13), (3, 2), (12, 2)):                       # 노드 모서리 말뚝 머리
        if inside(x, y - 1 if y == 13 else y + 1): put(x, y, WOOD[0])
def pier(m): return ext4(m, pier_paint, WOOD[0])
def piling(k):
    a = np.zeros((16, 16, 4), np.uint8); pts = [(5, 6), (10, 9)] if k == 'a' else [(4, 4), (11, 5), (7, 11)]
    for x, y in pts:
        a[y:y + 3, x] = WOOD[3]; a[y:y + 3, x + 1] = WOOD[1]; a[y - 1, x] = WOOD[4]; a[y - 1, x + 1] = WOOD[2]
    return outline(a, WOOD[0])

# ---------------------------------------------------------------- 소품
def reed_paint(m, put, sp):
    inside = arms(m, 2, 13, 2, 13)
    HGT = [4, 6, 5, 3, 6, 4, 5, 6, 3, 5, 4, 6, 5, 3, 4, 6]
    for y in range(-1, 17):
        for x in range(-1, 17):
            if not inside(x, y): continue
            if y % 4 == 3 and (x + (2 if (y // 4) % 2 else 0)) % 4 == 0:          # 덤불 밑동(주기 4, 경계 이음): 줄기 3가닥(가운데 높게)
                h = HGT[(x + (y // 4) * 7) % 16]
                for dx, hh in ((-1, h - 2), (0, h), (1, h - 1)):
                    for k in range(max(1, hh) + 1):
                        if inside(x + dx, y - k) or k == 0: put(x + dx, y - k, REED[4] if k == hh else REED[3] if k > hh // 2 else REED[2])
                put(x, y + 1 if inside(x, y + 1) else y, REED[1])
def reed(m):
    C = np.zeros((18, 18, 4), np.uint8)
    def put(x, y, col):
        if -1 <= x <= 16 and -1 <= y <= 16: C[y + 1, x + 1] = col
    reed_paint(m, put, None)
    return C[1:17, 1:17].copy()   # 가는 줄기는 외곽선 없이(외곽선을 두르면 64px 에서 검은 낙서처럼 보임)
def reed_clump(seed):
    a = np.zeros((16, 16, 4), np.uint8); rng = np.random.default_rng(seed)
    for i in range(9):
        bx = int(rng.integers(3, 13)); h = int(rng.integers(5, 11)); lean = rng.uniform(-1.5, 1.5)
        for k in range(h):
            x = int(round(bx + lean * k / h)); y = 14 - k
            if 0 <= x < 16: a[y, x] = REED[4] if k == h - 1 else REED[3] if k > h // 2 else REED[2]
        a[15 - h:16 - h, bx] = REED[4]
    for x in range(3, 14):
        if a[14, x, 3]: a[15, x] = REED[1]                                                       # 밑동 그늘 1px(외곽선 대신)
    return a
def wflag(c):
    a = np.zeros((16, 16, 4), np.uint8); P = CLOTH[c]
    for y in range(1, 16): a[y, 4] = WOOD[3]; a[y, 5] = WOOD[1]
    a[0, 4] = WOOD[4]
    for y in range(2, 9):
        for x in range(6, 14):
            wv = 1 if (x // 2) % 2 else 0
            if y + wv <= 8: a[y + wv, x] = P[3] if x < 9 else P[2] if x < 12 else P[1]
    return outline(a, P[0])
def bell_tent():
    a = np.zeros((16, 16, 4), np.uint8); P = CLOTH['white']
    for y in range(1, 14):
        hw = 1 + (y - 1) * 0.55
        for x in range(16):
            if abs(x - 7.5) <= hw: a[y, x] = P[3] if x < 7 else P[2] if x < 10 else P[1]
    for x in range(1, 15):
        if a[10, x, 3]: a[10, x] = CLOTH['red'][2] if x % 2 else CLOTH['red'][1]
    a[9:14, 7] = DARK; a[9:14, 8] = DARK; a[0, 7] = WOOD[4]; a[0, 8] = WOOD[2]
    return outline(a, P[0])
def pavilion():
    a = np.zeros((32, 32, 4), np.uint8); P = CLOTH['white']; T = CLOTH['blue']
    for y in range(1, 30):
        for x in range(32):
            r = np.hypot((x - 15.5) / 14.5, (y - 18.0) / 11.0)
            if y < 18:
                hw = 1.5 + (y - 1) * 0.8
                if abs(x - 15.5) <= hw: a[y, x] = P[3] if x < 13 else P[2] if x < 20 else P[1]
            elif abs(x - 15.5) <= 14 and y <= 28: a[y, x] = P[2] if x < 22 else P[1]
    for x in range(2, 30):
        a[18, x] = T[2]; a[19, x] = T[3] if x % 4 in (1, 2) else T[1]                            # 휘장 띠(파랑 무지, 물결)
    a[22:29, 13:19] = DARK; a[22:29, 13] = P[3]; a[0, 15] = WOOD[4]; a[0, 16] = WOOD[2]
    return outline(a, P[0])
def andalus_tent():
    a = np.zeros((32, 32, 4), np.uint8); S1, S2 = CLOTH['white'], CLOTH['red']
    for y in range(3, 29):
        for x in range(2, 30):
            if y < 14 and abs(x - 15.5) > 13.5 - (14 - y) * 0.0: pass
            st = S1 if (x // 3) % 2 == 0 else S2
            if y < 14: a[y, x] = st[3] if y < 8 else st[2]                                           # 낮은 박공 지붕(세로 줄무늬)
            else: a[y, x] = st[2] if x < 24 else st[1]
    for x in range(2, 30): a[14, x] = CLOTH['ochre'][1]; a[3, x] = CLOTH['ochre'][3]
    a[19:29, 13:19] = DARK
    for y in range(18, 29): a[y, 0] = WOOD[2]; a[y, 31] = WOOD[1]
    return outline(a, CLOTH['red'][0])
def cart(vertical=False):
    a = np.zeros((16, 16, 4), np.uint8)
    if not vertical:
        a[6:11, 2:12] = WOOD[3]; a[6, 2:12] = WOOD[4]; a[10, 2:12] = WOOD[1]
        for x in range(12, 16): a[9, x] = WOOD[2]                                                  # 끌채
        for cx in (5,):
            for y in range(9, 15):
                for x in range(2, 9):
                    r = np.hypot(x - cx, y - 12)
                    if 2.2 <= r <= 3.2: a[y, x] = WOOD[1]
            a[12, 5] = WOOD[0]
    else:
        a[3:12, 5:11] = WOOD[3]; a[3:12, 5] = WOOD[4]; a[11, 5:11] = WOOD[1]
        for y in range(12, 16): a[y, 7] = WOOD[2]; a[y, 8] = WOOD[2]
        for y in range(5, 10): a[y, 3] = WOOD[1]; a[y, 12] = WOOD[1]
    return outline(a, WOOD[0])

# ---------------------------------------------------------------- 목록 조립
x2 = lambda a: Image.fromarray(a).resize((a.shape[1] * 2, a.shape[0] * 2), Image.NEAREST)
def split(a, prefix):
    R, C = a.shape[0] // 16, a.shape[1] // 16
    return [(f'{prefix}_{r}{c}' if R > 1 and C > 1 else f'{prefix}_{r if R > 1 else c}', a[r * 16:r * 16 + 16, c * 16:c * 16 + 16].copy()) for r in range(R) for c in range(C)]
SPEC = {k: [] for k in SETS}
for m in range(16): SPEC['wall'].append((f'ov_wwall_{m}', wall(m), 'overlay', 'block'))
for sp, mm in (('gate_h', E_ | W_), ('gate_v', N_ | S_), ('arch_h', E_ | W_), ('arch_v', N_ | S_), ('breach_h', E_ | W_), ('breach_v', N_ | S_)):
    SPEC['wall'].append((f'ov_wwall_{sp}', wall(mm, sp), 'overlay', 'pass'))
SPEC['wall'] += [(n, t, 'overlay', 'block') for n, t in split(tower(), 'ov_wtower')]
for k in ('h', 'v', 'corner', 'pile'): SPEC['wall'].append((f'ov_ruin_{k}', ruin(k), 'overlay', 'pass' if k == 'pile' else 'block'))
for m in MASKS: SPEC['ridge'].append((f'ridge47_{m}', ridge(m), 'ground', 'pass'))
SPEC['ridge'] += [('ridge_fill_b', ridge(255, 'b'), 'ground', 'pass'), ('ridge_fill_c', ridge(255, 'c'), 'ground', 'pass'),
                  ('ridge_path_199', ridge(199, path=True), 'ground', 'pass'), ('ridge_path_68', ridge(68, path=True), 'ground', 'pass')]
for k in ('thatch', 'shingle', 'stone', 'gable'): SPEC['house'].append((f'ov_whouse_{k}', house(k), 'overlay', 'block'))
for k, nm in (('long', 'ov_wlong'), ('manor', 'ov_wmanor'), ('mill', 'ov_wmill')): SPEC['house'] += [(n, t, 'overlay', 'block') for n, t in split(big(k), nm)]
SPEC['house'].append(('ov_wheel', wheel(16), 'overlay', 'block'))
for m in range(16): SPEC['house'].append((f'ov_wfence_{m}', fence(m), 'overlay', 'block'))
SPEC['ship'] += [(n, t, 'overlay', 'block') for n, t in split(longship(), 'ov_longship_h')]
SPEC['ship'] += [(n, t, 'overlay', 'block') for n, t in split(longship(True), 'ov_longship_v')]
SPEC['ship'] += [('ov_boat_h', boat(), 'overlay', 'block'), ('ov_boat_v', boat(True), 'overlay', 'block')]
for m in range(16): SPEC['ship'].append((f'ov_pier_{m}', pier(m), 'overlay', 'pass'))
SPEC['ship'] += [('ov_piling_a', piling('a'), 'overlay', 'block'), ('ov_piling_b', piling('b'), 'overlay', 'block')]
for m in range(16): SPEC['prop'].append((f'ov_reed_{m}', reed(m), 'overlay', 'pass'))
SPEC['prop'] += [('ov_reed_a', reed_clump(3), 'overlay', 'pass'), ('ov_reed_b', reed_clump(9), 'overlay', 'pass')]
for c in ('red', 'blue', 'white'): SPEC['prop'].append((f'ov_wflag_{c}', wflag(c), 'overlay', 'block'))
SPEC['prop'].append(('ov_bell_tent', bell_tent(), 'overlay', 'tent'))
SPEC['prop'] += [(n, t, 'overlay', 'tent') for n, t in split(pavilion(), 'ov_pavilion')]
SPEC['prop'] += [(n, t, 'overlay', 'tent') for n, t in split(andalus_tent(), 'ov_andalus_tent')]
SPEC['prop'] += [('ov_cart_h', cart(), 'overlay', 'block'), ('ov_cart_v', cart(True), 'overlay', 'block')]
FR = {}
for k, lst in SPEC.items():
    assert len(lst) <= 100, (k, len(lst))
    for i, (n, a, kind, walk) in enumerate(lst): FR[SETS[k] + i] = (n, x2(a), kind, walk, k)
BY = {v[0]: v[1] for v in FR.values()}

# ---------------------------------------------------------------- QA
qa = {'date': '2026-11-03', 'author': '안아트', 'calls': 0, 'sheet': 'public/assets/tiles/tileset_v2/tv2_static6_west.png', 'start': START, 'count': len(FR),
      'sets': {k: [SETS[k], SETS[k] + len(v) - 1] for k, v in SPEC.items()}, 'errors': [], 'items': {}}
allowed = {tuple(c[:3]) for c in STONE + MOSSY + WOOD + THATCH + SLATE + PLASTER + REED + SLOPE + sum(CLOTH.values(), []) + [DARK, GRASS_SH, LIP, RIM, Hx('#e0d070')] + list(HIGRASS.values())}
allowed |= set(map(tuple, GRASS.reshape(-1, 4)[:, :3].tolist()))
stray_all = {}
for idx, (n, im, kind, walk, st) in FR.items():
    a = np.array(im); al = a[..., 3]
    if kind == 'ground' and (al < 255).any(): qa['errors'].append(f'{n} 지면인데 투명')
    if kind == 'overlay' and ((al > 0) & (al < 255)).any(): qa['errors'].append(f'{n} 반투명(0/255 규칙)')
    if kind == 'overlay' and not (al == 255).any(): qa['errors'].append(f'{n} 빈 칸')
    px = a.reshape(-1, 4); px = px[px[:, 3] > 0][:, :3]; stray = {tuple(c) for c in px.tolist()} - allowed
    if stray: stray_all[n] = len(stray)
    rgb = a[..., :3].astype(int)
    if int(((rgb[..., 0] > 200) & (rgb[..., 2] > 100) & (rgb[..., 1] < 80) & (al > 0)).sum()): qa['errors'].append(f'{n} 마젠타 잔여')
    qa['items'][n] = {'index': idx, 'set': st, 'kind': kind, 'walk': walk, 'opaque_ratio': round(float((al == 255).mean()), 3)}
if stray_all: qa['errors'].append(f'허용 외 색 {stray_all}')
# 4방 16형 이음: 같은 팔(E/W/N/S)을 가진 모든 칸의 경계 2열(x2 기준 4열)이 동일 + 팔 없으면 경계 비어 있음
def seam4(prefix, extra=None):
    bad = []; tiles = {m: np.array(BY[f'{prefix}_{m}']) for m in range(16)}
    for k, mm in (extra or {}).items(): tiles[k] = np.array(BY[f'{prefix}_{k}'])
    arm = {m: m for m in range(16)}; arm.update(extra or {})
    for side, bit, sl, edge in (('E', E_, (slice(None), slice(30, 32)), (slice(None), -1)), ('W', W_, (slice(None), slice(0, 2)), (slice(None), 0)),
                                ('N', N_, (slice(0, 2), slice(None)), (0, slice(None))), ('S', S_, (slice(30, 32), slice(None)), (-1, slice(None)))):   # 경계 1px(원화) = 실제 맞닿는 줄
        ref = None
        for k, t in tiles.items():
            has = bool(arm[k] & bit); occ = bool((t[edge][..., 3] > 0).any())
            if isinstance(k, int) and has != occ: bad.append(f'{k} {side} 팔/경계 불일치')
            if not has: continue
            e = t[sl]
            if ref is None: ref = e
            elif not np.array_equal(ref, e): bad.append(f'{k} {side} 경계 불일치')
    return bad
GATES = {'gate_h': E_ | W_, 'arch_h': E_ | W_, 'breach_h': E_ | W_, 'gate_v': N_ | S_, 'arch_v': N_ | S_, 'breach_v': N_ | S_}
qa['seam4'] = {p: seam4(p, GATES if p == 'ov_wwall' else None)[:12] for p in ('ov_wwall', 'ov_wfence', 'ov_pier', 'ov_reed')}
for p, b in qa['seam4'].items():
    if b: qa['errors'].append(f'{p} 이음 {len(b)}')
def shape_seam():
    rng = np.random.default_rng(2); jumps = 0; tot = 0
    gm = lambda d: red(sum(BITS[k] for k, v in d.items() if v))
    for _ in range(2000):
        G = rng.random((5, 5)) < 0.62
        def g(u, v): return bool(G[v, u]) if 0 <= u < 5 and 0 <= v < 5 else True
        def mk(x, y): return gm({'N': g(x, y - 1), 'NE': g(x + 1, y - 1), 'E': g(x + 1, y), 'SE': g(x + 1, y + 1), 'S': g(x, y + 1), 'SW': g(x - 1, y + 1), 'W': g(x - 1, y), 'NW': g(x - 1, y - 1)})
        for (x, y, u, v) in ((2, 2, 3, 2), (2, 2, 2, 3)):
            ca = classify(mk(x, y)) if g(x, y) else np.zeros((16, 16), np.uint8); cb = classify(mk(u, v)) if g(u, v) else np.zeros((16, 16), np.uint8)
            ea, eb = (ca[:, 15], cb[:, 0]) if u != x else (ca[15, :], cb[0, :])
            for i in range(16):
                tot += 1
                if ea[i] != eb[i] and not any(0 <= j < 16 and eb[j] == ea[i] for j in (i - 1, i + 1)): jumps += 1
    return {'pixels': tot, 'jumps_gt_1px': jumps}
qa['ridge_shape_seam'] = shape_seam()
if qa['ridge_shape_seam']['jumps_gt_1px']: qa['errors'].append('ridge47 형상 이음 오류')

rows = (max(FR) - START) // 16 + 1
sheet = Image.new('RGBA', (512, rows * 32), (0, 0, 0, 0))
for idx, (n, im, kind, walk, st) in FR.items(): f = idx - START; sheet.paste(im, (f % 16 * 32, f // 16 * 32))
qa['sheet_size'] = list(sheet.size); qa['keep_unchanged'] = all(sha_f(p) == h for p, h in before.items())

# ---------------------------------------------------------------- 미리보기
def chk(W, H):
    c = Image.new('RGBA', (W, H))
    for y in range(0, H, 8):
        for x in range(0, W, 8): c.paste((200, 200, 200, 255) if (x // 8 + y // 8) % 2 else (120, 120, 120, 255), (x, y, x + 8, y + 8))
    return c
c = chk(*sheet.size); c.alpha_composite(sheet); c.convert('RGB').save(os.path.join(OUTD, 'preview', 'west_sheet_x1.png'))
G2, W2 = x2(GRASS), (x2(WATER) if WATER is not None else Image.new('RGBA', (32, 32), (40, 90, 160, 255)))
def scene(grid, legend):
    Hh, Ww = len(grid), len(grid[0]); out = Image.new('RGBA', (Ww * 32, Hh * 32))
    for y in range(Hh):
        for x in range(Ww): out.paste(W2 if grid[y][x] in '~PbBL' else G2, (x * 32, y * 32))
    def m4(x, y, chars):
        f = lambda u, v: 0 <= u < Ww and 0 <= v < Hh and grid[v][u] in chars
        return (N_ if f(x, y - 1) else 0) | (E_ if f(x + 1, y) else 0) | (S_ if f(x, y + 1) else 0) | (W_ if f(x - 1, y) else 0)
    for y in range(Hh):
        for x in range(Ww):
            ch = grid[y][x]
            if ch in '#GAX':
                m = m4(x, y, '#GAX'); hv = 'h' if m & (E_ | W_) else 'v'
                nm = {'#': f'ov_wwall_{m}', 'G': f'ov_wwall_gate_{hv}', 'A': f'ov_wwall_arch_{hv}', 'X': f'ov_wwall_breach_{hv}'}[ch]; out.alpha_composite(BY[nm], (x * 32, y * 32))
            elif ch == 'f': out.alpha_composite(BY[f'ov_wfence_{m4(x, y, "f")}'], (x * 32, y * 32))
            elif ch == 'P': out.alpha_composite(BY[f'ov_pier_{m4(x, y, "P")}'], (x * 32, y * 32))
            elif ch == 'r': out.alpha_composite(BY[f'ov_reed_{m4(x, y, "r")}'], (x * 32, y * 32))
            elif ch in legend: out.alpha_composite(BY[legend[ch]], (x * 32, y * 32))
    return out
def blit2(sc, prefix, cx, cy, R=2, C=2):
    for r in range(R):
        for c_ in range(C):
            n = f'{prefix}_{r}{c_}' if R > 1 and C > 1 else f'{prefix}_{r if R > 1 else c_}'; sc.alpha_composite(BY[n], ((cx + c_) * 32, (cy + r) * 32))
SC = ['....................',
      '.####G#####....fffff',
      '.#........#....f...f',
      '.A........X....f...f',
      '.#..1.2...#....fffff',
      '.#........#.........',
      '.#####A####..rrr....',
      '............rrrr~~~~',
      '..3..4......rr~~PPPP',
      '.............~~~~~~P',
      '~~~~~~~~~~~~~~~~~~~P',
      '~~~~~~~~~~~~~~~~~~~~']
sc = scene(SC, {'1': 'ov_whouse_thatch', '2': 'ov_whouse_shingle', '3': 'ov_whouse_stone', '4': 'ov_whouse_gable'})
sc.alpha_composite(BY['ov_wflag_red'], (6 * 32, 2 * 32)); sc.alpha_composite(BY['ov_bell_tent'], (8 * 32, 4 * 32))
blit2(sc, 'ov_wtower', 11, 0); blit2(sc, 'ov_longship_h', 2, 10, 1, 3); blit2(sc, 'ov_wmill', 16, 2)
sc.alpha_composite(BY['ov_boat_h'], (9 * 32, 10 * 32)); sc.alpha_composite(BY['ov_piling_a'], (14 * 32, 9 * 32))
sc.convert('RGB').resize((sc.width * 2, sc.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'west_scene_x2.png'))
sc2 = Image.new('RGBA', (20 * 32, 8 * 32))
for y in range(8):
    for x in range(20): sc2.paste(G2, (x * 32, y * 32))
blit2(sc2, 'ov_wlong', 1, 1); blit2(sc2, 'ov_wmanor', 4, 1); blit2(sc2, 'ov_pavilion', 8, 1); blit2(sc2, 'ov_andalus_tent', 11, 1)
blit2(sc2, 'ov_longship_v', 15, 0, 3, 1); sc2.alpha_composite(BY['ov_boat_v'], (17 * 32, 1 * 32))
for i, n in enumerate(('ov_ruin_h', 'ov_ruin_v', 'ov_ruin_corner', 'ov_ruin_pile', 'ov_cart_h', 'ov_cart_v', 'ov_wflag_blue', 'ov_wflag_white', 'ov_reed_a', 'ov_reed_b', 'ov_wheel')):
    sc2.alpha_composite(BY[n], ((1 + i) * 32, 5 * 32))
sc2.convert('RGB').resize((sc2.width * 2, sc2.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'west_objects_x2.png'))
RG = ['....................', '..RRRRRRR.....RRR...', '.RRRbRRRRR...RRRRR..', '.RRRRRRcRRR..RRRRR..', '..RRRRRRRR....RRR...', '....RRRR............', '.........RRRRRRRRR..', '.........R.......R..', '....................']
def paint47(grid):
    Hh, Ww = len(grid), len(grid[0]); out = Image.new('RGBA', (Ww * 32, Hh * 32)); gm = lambda d: red(sum(BITS[k] for k, v in d.items() if v))
    for y in range(Hh):
        for x in range(Ww):
            ch = grid[y][x]
            if ch in 'Rbc':
                def g(u, v): return grid[v][u] in 'Rbc' if 0 <= u < Ww and 0 <= v < Hh else True
                m = gm({'N': g(x, y - 1), 'NE': g(x + 1, y - 1), 'E': g(x + 1, y), 'SE': g(x + 1, y + 1), 'S': g(x, y + 1), 'SW': g(x - 1, y + 1), 'W': g(x - 1, y), 'NW': g(x - 1, y - 1)})
                out.paste(BY['ridge_fill_' + ch] if (m == 255 and ch in 'bc') else BY[f'ridge47_{m}'], (x * 32, y * 32))
            else: out.paste(G2, (x * 32, y * 32))
    return out
rgs = paint47(RG); rgs.paste(BY['ridge_path_199'], (6 * 32, 4 * 32))
rgs.convert('RGB').resize((rgs.width * 2, rgs.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'ridge_scene_x2.png'))
json.dump(qa, open(os.path.join(OUTD, 'art_west_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('count', len(FR), {k: len(v) for k, v in SPEC.items()}, 'errors', qa['errors'][:8], 'seam4', {k: len(v) for k, v in qa['seam4'].items()}, 'ridge', qa['ridge_shape_seam'], 'keep', qa['keep_unchanged'])

# ---------------------------------------------------------------- --apply
if APPLY:
    if qa['errors']: raise SystemExit('QA 오류 — apply 중단')
    for f in ('tv2_names.json', 'tileset_v2_map.json', 'manifest_fragment_tv2.json'):
        p = os.path.join(TVP, f)
        if not os.path.exists(p + TAG): shutil.copy2(p, p + TAG)
    sheet.save(SHEET, optimize=True)
    names = json.load(open(os.path.join(TVP, 'tv2_names.json'), encoding='utf-8'))
    names['spec']['static6_west'] = {'key': 'tv2_static6_west', 'path': '/assets/tiles/tileset_v2/tv2_static6_west.png', 'cols': 16, 'start': START, 'count': max(FR) - START + 1, 'size': list(sheet.size), 'capacity': [START, END],
                                     'sets': qa['sets'], 'note': '안아트 art_west.py(2026-11-03): 서유럽 석벽·능선 언덕·민가·배·부두·소품. 프레임 = 전역-2700(구간 사이 빈 프레임 있음). 지면 = 불투명, ov_* = 투명 오버레이(alpha 0/255)'}
    for idx, (n, im, kind, walk, st) in FR.items(): names['names'][n] = {'sheet': 'tv2_static6_west', 'frame': idx - START, 'index': idx, 'src': f'art_west.py {st} {kind}', 'walk': walk}
    json.dump(names, open(os.path.join(TVP, 'tv2_names.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    mp = json.load(open(os.path.join(TVP, 'tileset_v2_map.json'), encoding='utf-8'))
    mp['ranges_west'] = {'tv2_static6_west': [START, max(FR)], 'sets': qa['sets']}
    mp['index_map_west'] = {n: idx for idx, (n, im, kind, walk, st) in FR.items()}
    mp['west_note'] = '안아트 art_west.py --apply(2026-11-03): 서유럽 세트 2700~. 새 이름만(기존 키 값 불변). 사용 규칙 docker/gemini/tileset_v2/art_west/west_tiles_mapping.json'
    json.dump(mp, open(os.path.join(TVP, 'tileset_v2_map.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    fr = json.load(open(os.path.join(TVP, 'manifest_fragment_tv2.json'), encoding='utf-8'))
    fr['tileset.tv2_static6_west'] = {'type': 'tileset', 'frame': [32, 32], 'alpha': '지면(ridge*) 불투명 / ov_* 투명 오버레이(alpha 0/255)', 'filter': 'nearest(Point), pixelArt=true, 정수 배율만',
        'names': '/assets/tiles/tileset_v2/tv2_names.json', 'name_map': '/assets/tiles/tileset_v2/tileset_v2_map.json',
        'generator': 'docker/gemini/tileset_v2/art_west.py(안아트 2026-11-03, Pillow 절차 도트 16px x2, 이미지 모델 호출 0회). 바탕 풀만 칩셋 grass_a 픽셀 재사용',
        'source': '자체 제작(바탕 풀 = tv2_static 칩셋 픽셀)', 'prompt_ref': '없음(절차 합성)', 'license': '이 프로젝트 자체 제작(안아트). 바탕 풀은 칩셋(라이선스 미확인) 픽셀 재사용 — 공개 전 권리 확인 필요(비차단)',
        'verify': True, 'verify_note': '11세기 노르만·8세기 프랑크 건축·선박은 일반화(롱십 계열 수송선·초가 민가·석조 장원). 안달루스 천막 줄무늬는 각색',
        'scope': 'battle', 'path': 'assets/tiles/tileset_v2/tv2_static6_west.png', 'width': sheet.size[0], 'height': sheet.size[1], 'cols': 16, 'start': START, 'count': max(FR) - START + 1, 'bytes': os.path.getsize(SHEET),
        'load_hint': "this.load.spritesheet('tv2_static6_west', path, {frameWidth:32, frameHeight:32}) — 프레임 = 전역 인덱스 - 2700",
        'notes': [f'FE 미연결(U32_TV2.static6_west start 2700 count {max(FR) - START + 1}, u32Src 에서 idx >= 2700 분기를 static5_camp(2600) 보다 먼저)', 'tv2_map_to_js.mjs ok() 구간에 2700~3699 + index_map_west 병합 필요',
                  'tmv2.py src() 에 i>=2700 -> tv2_static6_west 분기 + fe_valid 구간(맵디자이너)', '사용 규칙: docker/gemini/tileset_v2/art_west/west_tiles_mapping.json'],
        'qa': 'docker/gemini/tileset_v2/art_west/art_west_qa.json'}
    json.dump(fr, open(os.path.join(TVP, 'manifest_fragment_tv2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('applied', os.path.getsize(SHEET))
