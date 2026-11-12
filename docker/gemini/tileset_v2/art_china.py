# tileset_v2 중국 수전 세트(ch12 적벽 208) — 안아트 2026-11-03. 이미지 모델 호출 0회(Pillow 절차 도트 16px -> x2 최근접). art_west.py 와 같은 규칙·검사.
# 새 시트 tv2_static7_china.png(16열, 프레임 = 전역 - 3200). 구간:
#   3200~ 배·수채(오버레이): ov_louchuan_e_<r><c> / ov_louchuan_w_<r><c>(누선 3x2, 뱃머리 동/서), ov_louchuan_fire_<r><c>(불타는 누선, 동향),
#          ov_mengchong_e_<c> / _w_<c>(몽충 2x1), ov_mengchong_fire_<c>, ov_fireboat_e_<c>(휘장 덮은 화선 2x1), ov_sampan_h/v(작은 배), ov_tow_h(뒤에 묶은 거룻배),
#          ov_chain_h / ov_chain_v(연환 쇠사슬, 물 위), ov_wreck_a/b(불탄 잔해), ov_shuizhai_<m4>(수채 목책 16형, 물 위) + ov_shuizhai_gate_h/v(수문, 통행),
#          ov_han_tent(한대 맞배 군막 1x1), ov_han_hq_<r><c>(지휘 장막 2x2), ov_hflag_{red,black,yellow}(무지 깃발)
#   3300~ 적벽 붉은 절벽 redcliff47_<mask>(47형 지면: 붉은 사암 대지, 남쪽 = 붉은 절벽면) + redcliff_fill_b/c
# 통행: 배·잔해·말뚝·천막 본체 = 불통 / 수문·사슬(배 사이 건널목)은 맵 규칙(기본 통행 표기 'pass')
# 규칙: 깃발·돛 문양·글자·한자 없음. 당·명대 누각 장식(용머리·치미) 금지 — 낮은 박공·난간 위주 후한 일반화(verify)
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/art_china.py <루트> [--apply]
import sys, os, json, hashlib, shutil
import numpy as np
from PIL import Image

ROOT = sys.argv[1]; APPLY = '--apply' in sys.argv
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2'); OUTD = os.path.join(HERE, 'art_china'); os.makedirs(os.path.join(OUTD, 'preview'), exist_ok=True)
TVP = os.path.join(ROOT, 'public/assets/tiles/tileset_v2'); SHEET = os.path.join(TVP, 'tv2_static7_china.png')
START, END = 3200, 3399; TAG = '.bak-china-20261103'
SETS = {'naval': 3200, 'redcliff': 3300}
Hx = lambda s: (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16), 255)
sha_f = lambda p: hashlib.sha1(open(p, 'rb').read()).hexdigest()[:12]
KEEP = [os.path.join(TVP, f) for f in os.listdir(TVP) if f.startswith('tv2_') and f.endswith('.png') and 'static7' not in f]
before = {p: sha_f(p) for p in KEEP}
NAMES = json.load(open(os.path.join(TVP, 'tv2_names.json'), encoding='utf-8'))
def crop16(sheet, f):
    im = Image.open(os.path.join(TVP, sheet + '.png')).convert('RGBA')
    return np.ascontiguousarray(np.array(im.crop((f % 16 * 32, f // 16 * 32, f % 16 * 32 + 32, f // 16 * 32 + 32)))[::2, ::2]).copy()
nm = lambda n: NAMES['names'][n]
GRASS = crop16(nm('grass_a')['sheet'], nm('grass_a')['frame']); WATER = crop16(nm('water47_255')['sheet'], nm('water47_255')['frame'])

# ---------------------------------------------------------------- 팔레트
LACQ = [Hx(c) for c in ('#1c1210', '#3a2018', '#5a3424', '#7a4a30', '#9c6440')]            # 옻칠한 짙은 선체
WOOD = [Hx(c) for c in ('#3f1f0f', '#684020', '#885f31', '#af7f40', '#c79f61')]
ROOF = [Hx(c) for c in ('#1e1e24', '#34343e', '#4c4c58', '#6a6a76')]                       # 검은 기와·판자 지붕
HIDE = [Hx(c) for c in ('#3a2a1a', '#6a5034', '#927248', '#b89462')]                       # 몽충 생가죽 덮개
CLOTH = {'red': [Hx(c) for c in ('#3a1210', '#7a2420', '#a83a2e', '#cc5a44')], 'black': [Hx(c) for c in ('#101014', '#24242c', '#3a3a46', '#56566a')],
         'yellow': [Hx(c) for c in ('#4a3210', '#8a6420', '#b88a34', '#dcb058')], 'drape': [Hx(c) for c in ('#2a2418', '#5a4e34', '#80724e', '#a8986c')]}
FIRE = [Hx(c) for c in ('#5a1408', '#a82a0c', '#e0601a', '#f8a030', '#ffe27a')]
SMOKE = [Hx(c) for c in ('#24201e', '#3e3834', '#5a524c')]
IRON = [Hx(c) for c in ('#1a1a1e', '#3a3a42', '#62626e', '#8a8a98')]
RSTONE = [Hx(c) for c in ('#2e1410', '#5a2a1e', '#83402a', '#a85a3a', '#c87a50', '#e0a070')]   # 붉은 사암
DARK = Hx('#140e0c'); GRASS_SH = Hx('#2f6a0e'); RIM = Hx('#8fc451')
REDTOP = {Hx('#3c7c12')[:3]: Hx('#83402a'), Hx('#438d17')[:3]: Hx('#a85a3a'), Hx('#5c9c25')[:3]: Hx('#c87a50')}
HIGRASS = {Hx('#3c7c12')[:3]: Hx('#438d17'), Hx('#438d17')[:3]: Hx('#5c9c25'), Hx('#5c9c25')[:3]: Hx('#76b03a')}

def outline(a, col):
    al = a[..., 3] > 0; p = np.pad(al, 1); edge = al & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    o = a.copy(); o[edge] = col; return o
N_, E_, S_, W_ = 1, 2, 4, 8
def ext4(m, paint, ocol, special=None):
    C = np.zeros((18, 18, 4), np.uint8)
    def put(x, y, col):
        if -1 <= x <= 16 and -1 <= y <= 16: C[y + 1, x + 1] = col
    paint(m, put, special)
    al = C[..., 3] > 0; p = np.pad(al, 1, constant_values=True)
    edge = al & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]); edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = False
    C2 = C.copy(); C2[edge] = ocol
    return C2[1:17, 1:17].copy()

# ---------------------------------------------------------------- 배(가로 = 뱃머리 동쪽, 서향 = 좌우 반전)
def hull(L, Wd, half_max, a, y_c, pal=LACQ, deck=True):
    for x in range(L):
        t = x / (L - 1)
        half = half_max * (min(1, t / 0.12) ** 0.5) * (min(1, (1 - t) / 0.22) ** 0.7)   # 고물 넓고 이물 뾰족
        for y in range(Wd):
            dy = abs(y - y_c + 0.5)
            if dy <= half:
                a[y, x] = pal[2] if y < y_c else pal[1]
                if dy > half - 1.2: a[y, x] = pal[0] if y >= y_c else pal[1]
                elif deck and dy <= half - 2.0: a[y, x] = WOOD[2] if x % 3 else WOOD[1]
def louchuan(fire=False):
    """누선 3x2(48x32): 짙은 옻칠 선체(뱃전 붉은 테) + 갑판 위 2층 선루(검은 판자 지붕 2단, 붉은 난간), 고물(서쪽) 높은 선루."""
    L, H = 48, 32; a = np.zeros((H, L, 4), np.uint8)
    for x in range(L):
        t = x / (L - 1); half = 9.5 * (min(1, t / 0.10) ** 0.5) * (min(1, (1 - t) / 0.25) ** 0.8)
        for y in range(H):
            dy = abs(y - 20 + 0.5)
            if dy <= half:
                a[y, x] = LACQ[3] if (x % 4) else LACQ[2]                                          # 갑판(옻칠 판자)
                if dy > half - 2.2: a[y, x] = LACQ[1] if y >= 20 else LACQ[2]                     # 뱃전(아래 = 그늘 측면)
                if half - 2.2 < dy <= half - 1.2 and y < 20: a[y, x] = CLOTH['red'][2]           # 뱃전 붉은 테
    for y in range(24, 31):                                                                       # 남쪽 선체 측면(높이감)
        for x in range(4, 42):
            if a[y - 1, x, 3] and not a[y, x, 3]: a[y, x] = LACQ[0]
    def cabin(x0, x1, y0, y1):
        for y in range(y0, y1):
            for x in range(x0, x1): a[y, x] = WOOD[3] if (x - x0) % 4 else WOOD[1]               # 벽(창살)
        for x in range(x0, x1): a[y1 - 1, x] = CLOTH['red'][1]                                    # 아래 난간
        for y in range(y0 - 5, y0):                                                               # 검은 판자 지붕(낮은 박공)
            for x in range(x0 - 2, x1 + 2): a[y, x] = ROOF[3] if y < y0 - 3 else ROOF[2] if x < (x0 + x1) // 2 else ROOF[1]
        for x in range(x0 - 2, x1 + 2): a[y0 - 5, x] = ROOF[3]; a[y0, x] = ROOF[0]
    cabin(10, 36, 15, 22); cabin(12, 26, 8, 13)
    for y in range(0, 6): a[y, 31] = WOOD[4]; a[y, 32] = WOOD[2]
    for y in range(0, 4):
        for x in range(33, 38): a[y + (1 if x % 2 else 0), x] = CLOTH['red'][3 if x < 35 else 2]
    for x in range(6, 42, 3): a[31, x] = WOOD[3]
    if fire: burn(a, [(16, 1, 9), (24, 6, 10), (33, 11, 8), (40, 15, 6)])
    return outline(a, LACQ[0])
def mengchong(fire=False):
    L, H = 32, 16; a = np.zeros((H, L, 4), np.uint8)
    hull(L, H, 5.5, a, 9, deck=False)
    for x in range(5, 26):                                                          # 생가죽 덮개(둥근 지붕)
        for y in range(4, 10):
            dy = y - 4
            a[y, x] = HIDE[3] if dy < 2 else HIDE[2] if dy < 4 else HIDE[1]
            if x % 5 == 0: a[y, x] = HIDE[1]                                       # 덮개 늑골
    for x in range(8, 24, 4): a[6, x] = DARK                                       # 창 구멍
    for x in range(3, 29, 3): a[14, x] = WOOD[3]; a[15, x] = WOOD[1]
    if fire: burn(a, [(10, 4, 4), (18, 5, 5)])
    return outline(a, LACQ[0])
def fireboat():
    L, H = 32, 16; a = np.zeros((H, L, 4), np.uint8)
    hull(L, H, 5.5, a, 9, deck=True)
    D = CLOTH['drape']
    for x in range(6, 26):                                                          # 휘장 덮은 짐(장작·기름), 휘장 주름
        for y in range(3, 10): a[y, x] = D[3] if (x // 2) % 2 else D[2]
        a[10, x] = D[1]
    for y in range(0, 4): a[y, 24] = WOOD[4]; a[y, 25] = WOOD[2]                  # 낮은 돛대(돛 접음)
    for x in range(26, 32): a[9, x] = WOOD[1] if x % 2 else 0                      # 뒤에 매단 밧줄
    return outline(a, LACQ[0])
def sampan(vertical=False, tow=False):
    a = np.zeros((16, 16, 4), np.uint8)
    for x in range(1, 15):
        half = 3.6 * np.sin(np.pi * (x - 0.5) / 14) ** 0.6
        for y in range(16):
            dy = abs(y - 8 + 0.5)
            if dy <= half: a[y, x] = WOOD[1] if dy > half - 1.1 else WOOD[3] if y < 8 else WOOD[2]
    for x in range(5, 10): a[7, x] = HIDE[3]; a[8, x] = HIDE[2]                   # 거룻배 대나무 덮개
    if tow:
        for x in range(0, 2): a[8, x] = WOOD[1]                                     # 앞으로 이어지는 밧줄
    a = outline(a, WOOD[0])
    return np.ascontiguousarray(np.rot90(a, 1)) if vertical else a
def burn(a, flames):  # 크게: 불혀 폭 h*0.6
    """불길(정적 도트): 아래 주황 -> 위 노랑 혀 + 검은 연기 꼬리. a 에 직접."""
    H, W = a.shape[:2]
    for cx, top, h in flames:
        for k in range(h):
            y = top + h - k; hw = max(0, int((h - k) * 0.6 + 0.5))
            for x in range(cx - hw, cx + hw + 1):
                if 0 <= x < W and 0 <= y < H: a[y, x] = FIRE[min(4, 1 + k * 4 // max(1, h))] if abs(x - cx) < hw or k > h - 2 else FIRE[1]
        for k in range(3):
            y = top - k - 1
            for x in (cx - 1 + k % 2, cx + k % 2):
                if 0 <= x < W and 0 <= y < H: a[y, x] = SMOKE[2 - k]
def chain(vertical=False):
    a = np.zeros((16, 16, 4), np.uint8)
    for x in range(16):
        y = 8 + (1 if x % 4 in (1, 2) else 0)
        a[y, x] = IRON[3] if x % 4 == 0 else IRON[2]; a[y + 1, x] = IRON[1]
        if x % 4 == 2: a[y - 1, x] = IRON[2]
    a = outline(a, IRON[0])
    return np.ascontiguousarray(np.rot90(a, 1)) if vertical else a
def wreck(k):
    a = np.zeros((16, 16, 4), np.uint8); rng = np.random.default_rng(11 if k == 'a' else 23)
    for i in range(5 if k == 'a' else 7):
        x0, y0 = int(rng.integers(1, 10)), int(rng.integers(3, 13)); ln = int(rng.integers(4, 8)); dy = int(rng.choice([-1, 0, 1]))
        for t in range(ln):
            x, y = x0 + t, y0 + (t * dy) // 3
            if 0 <= x < 16 and 0 <= y < 16: a[y, x] = LACQ[1] if t % 3 else DARK; (y + 1 < 16) and a.__setitem__((y + 1, x), LACQ[0])
    a[int(rng.integers(4, 10)), int(rng.integers(4, 10))] = FIRE[2]
    return outline(a, DARK)
def shuizhai_paint(m, put, sp):
    xs = set()
    if m & W_: xs |= set(range(-1, 9))
    if m & E_: xs |= set(range(6, 17))
    xs |= {6, 7, 8}
    if sp == 'h': xs -= set(range(4, 12))
    hor = (m & (E_ | W_)) or not (m & (N_ | S_))
    if m & (N_ | S_):
        y0 = -1 if m & N_ else 3; y1 = 16 if m & S_ else 12
        for y in range(y0, y1 + 1):
            if sp == 'v' and 4 <= y <= 11: continue
            put(6, y, WOOD[3] if y % 3 else WOOD[4]); put(7, y, WOOD[2]); put(8, y, WOOD[1] if y % 3 else WOOD[2])
    if hor:
        for x in sorted(xs):
            k = x % 3
            for y in range(3 if k == 1 else 4, 13):
                put(x, y, (WOOD[1], WOOD[4], WOOD[2])[k] if y != 12 else LACQ[1])         # 말뚝 밑동 = 젖은 짙은 색
                if y in (6, 9) and k: put(x, y, WOOD[1])
    if sp == 'h':
        for px in ((2, 3), (12, 13)):
            for y in range(1, 13):
                for i, x in enumerate(px): put(x, y, (WOOD[4], WOOD[1])[i])
        for x in range(2, 14): put(x, 1, ROOF[3]); put(x, 2, ROOF[1])                       # 수문 위 지붕보
    if sp == 'v':
        for x in range(4, 11): put(x, 3, ROOF[3]); put(x, 12, ROOF[1])
def shuizhai(m, sp=None): return ext4(m, shuizhai_paint, WOOD[0], sp)
def han_tent():
    a = np.zeros((16, 16, 4), np.uint8); P = CLOTH['black']; T = CLOTH['red']
    for y in range(2, 10):
        for x in range(1, 15): a[y, x] = P[3] if y < 6 else P[2]
    for x in range(1, 15): a[2, x] = P[3]; a[9, x] = T[2] if x % 2 else T[1]
    for y in range(10, 14):
        for x in range(2, 14): a[y, x] = P[2] if x < 11 else P[1]
    a[10:14, 7] = DARK; a[10:14, 8] = DARK
    return outline(a, P[0])
def han_hq():
    a = np.zeros((32, 32, 4), np.uint8); P = CLOTH['red']; B = CLOTH['black']
    for y in range(3, 17):
        for x in range(1, 31): a[y, x] = P[3] if y < 10 else P[2]
    for x in range(1, 31): a[3, x] = P[3]; a[16, x] = B[2] if x % 3 else B[1]; a[17, x] = B[1] if x % 2 else B[0]
    for y in range(18, 29):
        for x in range(3, 29): a[y, x] = P[2] if x < 22 else P[1]
    for y in range(21, 29):
        for x in range(13, 19): a[y, x] = DARK
    for y in range(19, 29): a[y, 0] = WOOD[2]; a[y, 31] = WOOD[1]
    a[0:3, 15] = WOOD[4]; a[0:3, 16] = WOOD[2]
    return outline(a, P[0])
def hflag(c):
    a = np.zeros((16, 16, 4), np.uint8); P = CLOTH[c]
    for y in range(1, 16): a[y, 4] = WOOD[3]; a[y, 5] = WOOD[1]
    for y in range(2, 11):                                                              # 세로로 긴 무지 기(한대 기 형태 일반화)
        for x in range(6, 11): a[y + (1 if (x % 2) else 0), x] = P[3] if x < 8 else P[2]
    for x in range(6, 11): a[12 if x % 2 else 11, x] = P[1]
    return outline(a, P[0])

# ---------------------------------------------------------------- 붉은 절벽 47형(art_west.py classify 와 같은 규칙, F=7 절벽면)
BITS = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}
def red(m):
    for d, a_, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not ((m & BITS[a_]) and (m & BITS[b])): m &= ~BITS[d]
    return m
MASKS = sorted(set(red(m) for m in range(256))); assert len(MASKS) == 47 and MASKS == NAMES['spec']['masks']
WOB2 = [0, 1, 1, 2, 2, 1, 1, 0, 0, 1, 2, 2, 1, 0, 0, 0]; FACEW = [0, 0, 1, 1, 0, -1, -1, 0, 1, 1, 1, 0, 0, -1, 0, 0]
CRACK = {2: 1, 7: 2, 11: 1, 14: 2}
def classify(m, mN=2, mS=2, mE=2, mW=2, F=7):
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
def redcliff(m, var=None):
    cls = classify(m); a = GRASS.copy(); g = lambda u, v, c: cls[v, u] if 0 <= u < 16 and 0 <= v < 16 else c
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 1:   # 윗면 = 붉은 흙·바위 대지(풀 픽셀 구조를 붉은 3단으로 치환 -> 주기 16 이음 동일)
                a[y, x] = REDTOP.get(tuple(GRASS[y, x][:3]), RSTONE[3])
            elif c == 2:
                k = 0
                while y - k - 1 >= 0 and cls[y - k - 1, x] == 2: k += 1
                col = RSTONE[4] if k == 0 else RSTONE[3] if k < 3 else RSTONE[2]
                if x in CRACK and k >= CRACK[x]: col = RSTONE[1]
                if (x + k) % 7 == 0 and k > 1: col = RSTONE[5]
                a[y, x] = col
    res = a.copy()
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 0:
                if g(x, y - 1, 0) == 2: res[y, x] = GRASS_SH
                continue
            nb = [g(x, y - 1, c), g(x, y + 1, c), g(x - 1, y, c), g(x + 1, y, c)]
            if 0 in nb: res[y, x] = RSTONE[0]; continue
            if c == 1 and (g(x, y - 1, c) == 0 or g(x - 1, y, c) == 0 or g(x, y - 2, c) == 0): res[y, x] = RSTONE[5]
            elif c == 1 and (g(x + 1, y, c) == 0 or g(x + 2, y, c) == 0): res[y, x] = RSTONE[3]
            elif c == 1 and g(x, y + 1, c) == 2: res[y, x] = RSTONE[4]
    if var == 'b':
        for x, y in ((4, 5), (11, 9)): res[y, x] = RSTONE[4]; res[y, x + 1] = RSTONE[2]; res[y + 1, x] = RSTONE[1]
    if var == 'c':
        for x, y, h in ((5, 9, 3), (9, 7, 4)):
            for k in range(h): res[y - k, x] = Hx('#2a5a14') if k < h - 1 else Hx('#3c7c12')   # 관목
    return res

# ---------------------------------------------------------------- 목록
x2 = lambda a: Image.fromarray(a).resize((a.shape[1] * 2, a.shape[0] * 2), Image.NEAREST)
def split(a, prefix):
    R, C = a.shape[0] // 16, a.shape[1] // 16
    return [(f'{prefix}_{r}{c}' if R > 1 and C > 1 else f'{prefix}_{r if R > 1 else c}', a[r * 16:r * 16 + 16, c * 16:c * 16 + 16].copy()) for r in range(R) for c in range(C)]
mir = lambda a: np.ascontiguousarray(a[:, ::-1])
SPEC = {k: [] for k in SETS}
LC = louchuan(); SPEC['naval'] += [(n, t, 'overlay', 'block') for n, t in split(LC, 'ov_louchuan_e')]
SPEC['naval'] += [(n, t, 'overlay', 'block') for n, t in split(mir(LC), 'ov_louchuan_w')]
SPEC['naval'] += [(n, t, 'overlay', 'block') for n, t in split(louchuan(True), 'ov_louchuan_fire')]
MC = mengchong(); SPEC['naval'] += [(n, t, 'overlay', 'block') for n, t in split(MC, 'ov_mengchong_e')]
SPEC['naval'] += [(n, t, 'overlay', 'block') for n, t in split(mir(MC), 'ov_mengchong_w')]
SPEC['naval'] += [(n, t, 'overlay', 'block') for n, t in split(mengchong(True), 'ov_mengchong_fire')]
SPEC['naval'] += [(n, t, 'overlay', 'block') for n, t in split(fireboat(), 'ov_fireboat_e')]
SPEC['naval'] += [('ov_sampan_h', sampan(), 'overlay', 'block'), ('ov_sampan_v', sampan(True), 'overlay', 'block'), ('ov_tow_h', sampan(tow=True), 'overlay', 'block')]
SPEC['naval'] += [('ov_chain_h', chain(), 'overlay', 'pass'), ('ov_chain_v', chain(True), 'overlay', 'pass'), ('ov_wreck_a', wreck('a'), 'overlay', 'block'), ('ov_wreck_b', wreck('b'), 'overlay', 'block')]
for m in range(16): SPEC['naval'].append((f'ov_shuizhai_{m}', shuizhai(m), 'overlay', 'block'))
SPEC['naval'] += [('ov_shuizhai_gate_h', shuizhai(E_ | W_, 'h'), 'overlay', 'pass'), ('ov_shuizhai_gate_v', shuizhai(N_ | S_, 'v'), 'overlay', 'pass')]
SPEC['naval'].append(('ov_han_tent', han_tent(), 'overlay', 'tent'))
SPEC['naval'] += [(n, t, 'overlay', 'tent') for n, t in split(han_hq(), 'ov_han_hq')]
for c in ('red', 'black', 'yellow'): SPEC['naval'].append((f'ov_hflag_{c}', hflag(c), 'overlay', 'block'))
for m in MASKS: SPEC['redcliff'].append((f'redcliff47_{m}', redcliff(m), 'ground', 'map_rule'))
SPEC['redcliff'] += [('redcliff_fill_b', redcliff(255, 'b'), 'ground', 'pass'), ('redcliff_fill_c', redcliff(255, 'c'), 'ground', 'pass')]
FR = {}
for k, lst in SPEC.items():
    assert len(lst) <= 100, (k, len(lst))
    for i, (n, a, kind, walk) in enumerate(lst): FR[SETS[k] + i] = (n, x2(a), kind, walk, k)
# ---- 열린 성문(ch12_s4 이릉 성문 개방 연출, 2026-11-03 팀장 요청): 레거시 닫힌 성문 gate_L(222)·gate_R(224) = water_set ws_static 프레임 22·24 와 같은 그림에서
#      문짝(붉은 판·금 못, 행 22~31 x 9~22)만 열린 상태로 바꿈 — 가운데 x 11~20 = 어두운 통로(안쪽 판석 바닥), 양끝 2열 = 안쪽으로 젖힌 문짝 옆면. 32px 원화 그대로(x2 아님)
WS = np.array(Image.open(os.path.join(ROOT, 'public/assets/tiles/water_set/ws_static.png')).convert('RGBA'))
def gate_open(f):
    t = WS[f // 10 * 32:f // 10 * 32 + 32, f % 10 * 32:f % 10 * 32 + 32].copy()
    for y in range(22, 32):
        for x in range(11, 21):
            k = (y - 22) / 9.0
            t[y, x] = (int(18 + 30 * k), int(12 + 26 * k), int(10 + 24 * k), 255)
            if y >= 28 and (x + y) % 4 == 0: t[y, x] = (70, 62, 56, 255)          # 안쪽 판석 줄눈
        for x in (9, 10, 21, 22):
            t[y, x] = (122, 34, 28, 255) if x in (10, 21) else (82, 22, 18, 255)   # 젖힌 문짝 옆면(붉은 판 두께)
    return Image.fromarray(t)
GATE_START = 3349
for i, (n, f) in enumerate((('int_gate_open_L', 22), ('int_gate_open_R', 24))): FR[GATE_START + i] = (n, gate_open(f), 'ground', 'pass', 'gate')
SETS['gate'] = GATE_START; SPEC['gate'] = [('int_gate_open_L', None, 'ground', 'pass'), ('int_gate_open_R', None, 'ground', 'pass')]
BY = {v[0]: v[1] for v in FR.values()}

# ---------------------------------------------------------------- QA
qa = {'date': '2026-11-03', 'author': '안아트', 'calls': 0, 'sheet': 'public/assets/tiles/tileset_v2/tv2_static7_china.png', 'start': START, 'count': len(FR),
      'sets': {k: [SETS[k], SETS[k] + len(v) - 1] for k, v in SPEC.items()}, 'errors': [], 'items': {}}
allowed = {tuple(c[:3]) for c in LACQ + WOOD + ROOF + HIDE + FIRE + SMOKE + IRON + RSTONE + sum(CLOTH.values(), []) + [DARK, GRASS_SH, RIM, Hx('#2a5a14'), Hx('#3c7c12')] + list(HIGRASS.values())}
allowed |= set(map(tuple, GRASS.reshape(-1, 4)[:, :3].tolist()))
stray_all = {}
for idx, (n, im, kind, walk, st) in FR.items():
    a = np.array(im); al = a[..., 3]
    if kind == 'ground' and (al < 255).any(): qa['errors'].append(f'{n} 지면인데 투명')
    if kind == 'overlay' and ((al > 0) & (al < 255)).any(): qa['errors'].append(f'{n} 반투명')
    if kind == 'overlay' and not (al == 255).any(): qa['errors'].append(f'{n} 빈 칸')
    px = a.reshape(-1, 4); px = px[px[:, 3] > 0][:, :3]; stray = {tuple(c) for c in px.tolist()} - allowed
    if stray and st != 'gate': stray_all[n] = len(stray)
    rgb = a[..., :3].astype(int)
    if int(((rgb[..., 0] > 200) & (rgb[..., 2] > 100) & (rgb[..., 1] < 80) & (al > 0)).sum()): qa['errors'].append(f'{n} 마젠타 잔여')
    qa['items'][n] = {'index': idx, 'set': st, 'kind': kind, 'walk': walk, 'opaque_ratio': round(float((al == 255).mean()), 3)}
if stray_all: qa['errors'].append(f'허용 외 색 {stray_all}')
def seam4(prefix, extra=None):
    bad = []; tiles = {m: np.array(BY[f'{prefix}_{m}']) for m in range(16)}
    for k in (extra or {}): tiles[k] = np.array(BY[f'{prefix}_{k}'])
    arm = {m: m for m in range(16)}; arm.update(extra or {})
    for side, bit, sl, edge in (('E', E_, (slice(None), slice(30, 32)), (slice(None), -1)), ('W', W_, (slice(None), slice(0, 2)), (slice(None), 0)),
                                ('N', N_, (slice(0, 2), slice(None)), (0, slice(None))), ('S', S_, (slice(30, 32), slice(None)), (-1, slice(None)))):
        ref = None
        for k, t in tiles.items():
            has = bool(arm[k] & bit); occ = bool((t[edge][..., 3] > 0).any())
            if isinstance(k, int) and has != occ: bad.append(f'{k} {side} 팔/경계')
            if not has: continue
            e = t[sl]
            if ref is None: ref = e
            elif not np.array_equal(ref, e): bad.append(f'{k} {side} 경계')
    return bad
qa['seam4'] = {'ov_shuizhai': seam4('ov_shuizhai', {'gate_h': E_ | W_, 'gate_v': N_ | S_})[:12]}
if qa['seam4']['ov_shuizhai']: qa['errors'].append(f"수채 이음 {len(qa['seam4']['ov_shuizhai'])}")
def shape_seam():
    rng = np.random.default_rng(2); jumps = 0; tot = 0; gm = lambda d: red(sum(BITS[k] for k, v in d.items() if v))
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
qa['redcliff_shape_seam'] = shape_seam()
if qa['redcliff_shape_seam']['jumps_gt_1px']: qa['errors'].append('redcliff47 형상 이음 오류')
rows = (max(FR) - START) // 16 + 1
sheet = Image.new('RGBA', (512, rows * 32), (0, 0, 0, 0))
for idx, (n, im, kind, walk, st) in FR.items(): f = idx - START; sheet.paste(im, (f % 16 * 32, f // 16 * 32))
qa['sheet_size'] = list(sheet.size); qa['keep_unchanged'] = all(sha_f(p) == h for p, h in before.items())

# ---------------------------------------------------------------- 미리보기: 장강 선단 + 수채 + 붉은 절벽
G2, W2 = x2(GRASS), x2(WATER)
SC = ['RRRRRRRR............',
      'RRRRRRRRR...........',
      'RRRRRRRR~~~~~~~~~~~~',
      '..~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~',
      '~~zzzzGzzzz~~~~~~~~~',
      '~~z~~~~~~~z~~~~~~~~~',
      '..................TT',
      '....................']
Hh, Ww = len(SC), len(SC[0]); out = Image.new('RGBA', (Ww * 32, Hh * 32)); gm = lambda d: red(sum(BITS[k] for k, v in d.items() if v))
for y in range(Hh):
    for x in range(Ww):
        ch = SC[y][x]
        if ch == 'R':
            def g(u, v): return SC[v][u] == 'R' if 0 <= u < Ww and 0 <= v < Hh else True
            m = gm({'N': g(x, y - 1), 'NE': g(x + 1, y - 1), 'E': g(x + 1, y), 'SE': g(x + 1, y + 1), 'S': g(x, y + 1), 'SW': g(x - 1, y + 1), 'W': g(x - 1, y), 'NW': g(x - 1, y - 1)})
            out.paste(BY[f'redcliff47_{m}'], (x * 32, y * 32))
        else: out.paste(W2 if ch in '~zG' else G2, (x * 32, y * 32))
for y in range(Hh):
    for x in range(Ww):
        if SC[y][x] in 'zG':
            f = lambda u, v: 0 <= u < Ww and 0 <= v < Hh and SC[v][u] in 'zG'
            m = (N_ if f(x, y - 1) else 0) | (E_ if f(x + 1, y) else 0) | (S_ if f(x, y + 1) else 0) | (W_ if f(x - 1, y) else 0)
            out.alpha_composite(BY['ov_shuizhai_gate_h' if SC[y][x] == 'G' else f'ov_shuizhai_{m}'], (x * 32, y * 32))
def blit(prefix, cx, cy, R, C):
    for r in range(R):
        for c_ in range(C):
            n = f'{prefix}_{r}{c_}' if R > 1 and C > 1 else f'{prefix}_{r if R > 1 else c_}'; out.alpha_composite(BY[n], ((cx + c_) * 32, (cy + r) * 32))
blit('ov_louchuan_e', 2, 4, 2, 3); blit('ov_louchuan_w', 10, 3, 2, 3); blit('ov_louchuan_fire', 14, 5, 2, 3)
for x in (13,): out.alpha_composite(BY['ov_chain_h'], (x * 32, 4 * 32))
blit('ov_mengchong_e', 6, 6, 1, 2); blit('ov_mengchong_fire', 9, 7, 1, 2); blit('ov_fireboat_e', 3, 7, 1, 2)
out.alpha_composite(BY['ov_tow_h'], (5 * 32, 7 * 32)); out.alpha_composite(BY['ov_sampan_v'], (18, 32 * 6)); out.alpha_composite(BY['ov_wreck_a'], (17 * 32, 8 * 32)); out.alpha_composite(BY['ov_wreck_b'], (12 * 32, 9 * 32))
blit('ov_han_hq', 18, 10, 2, 2) if False else None
out.alpha_composite(BY['ov_han_tent'], (14 * 32, 10 * 32)); out.alpha_composite(BY['ov_han_tent'], (16 * 32, 11 * 32))
for i, c in enumerate(('red', 'black', 'yellow')): out.alpha_composite(BY[f'ov_hflag_{c}'], ((2 + i) * 32, 10 * 32))
hq = Image.new('RGBA', (64, 64)); [hq.alpha_composite(BY[f'ov_han_hq_{r}{c}'], (c * 32, r * 32)) for r in range(2) for c in range(2)]
out.alpha_composite(hq, (7 * 32, 10 * 32))
out.convert('RGB').resize((out.width * 2, out.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'china_scene_x2.png'))
json.dump(qa, open(os.path.join(OUTD, 'art_china_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('count', len(FR), {k: len(v) for k, v in SPEC.items()}, 'errors', qa['errors'][:8], 'seam4', {k: len(v) for k, v in qa['seam4'].items()}, 'redcliff', qa['redcliff_shape_seam'], 'keep', qa['keep_unchanged'])

if APPLY:
    if qa['errors']: raise SystemExit('QA 오류 — apply 중단')
    for f in ('tv2_names.json', 'tileset_v2_map.json', 'manifest_fragment_tv2.json'):
        p = os.path.join(TVP, f)
        if not os.path.exists(p + TAG): shutil.copy2(p, p + TAG)
    sheet.save(SHEET, optimize=True)
    names = json.load(open(os.path.join(TVP, 'tv2_names.json'), encoding='utf-8'))
    cnt = max(FR) - START + 1
    names['spec']['static7_china'] = {'key': 'tv2_static7_china', 'path': '/assets/tiles/tileset_v2/tv2_static7_china.png', 'cols': 16, 'start': START, 'count': cnt, 'size': list(sheet.size), 'capacity': [START, END],
                                      'sets': qa['sets'], 'note': '안아트 art_china.py(2026-11-03): 중국 수전(누선·몽충·화선·거룻배·연환 사슬·잔해·수채 목책·한대 군막·무지 깃발) + 적벽 붉은 절벽 47형. 프레임 = 전역-3200'}
    for idx, (n, im, kind, walk, st) in FR.items(): names['names'][n] = {'sheet': 'tv2_static7_china', 'frame': idx - START, 'index': idx, 'src': f'art_china.py {st} {kind}', 'walk': walk}
    json.dump(names, open(os.path.join(TVP, 'tv2_names.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    mp = json.load(open(os.path.join(TVP, 'tileset_v2_map.json'), encoding='utf-8'))
    mp['ranges_china'] = {'tv2_static7_china': [START, max(FR)], 'sets': qa['sets']}
    mp['index_map_china'] = {n: idx for idx, (n, im, kind, walk, st) in FR.items()}
    mp['china_note'] = '안아트 art_china.py --apply(2026-11-03): 중국 수전 세트 3200~ + 붉은 절벽 3300~. 새 이름만(기존 키 불변). 사용 규칙 docker/gemini/tileset_v2/art_china/china_tiles_mapping.json'
    json.dump(mp, open(os.path.join(TVP, 'tileset_v2_map.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    fr = json.load(open(os.path.join(TVP, 'manifest_fragment_tv2.json'), encoding='utf-8'))
    fr['tileset.tv2_static7_china'] = {'type': 'tileset', 'frame': [32, 32], 'alpha': '지면(redcliff*) 불투명 / ov_* 투명 오버레이(alpha 0/255)', 'filter': 'nearest(Point), pixelArt=true, 정수 배율만',
        'names': '/assets/tiles/tileset_v2/tv2_names.json', 'name_map': '/assets/tiles/tileset_v2/tileset_v2_map.json',
        'generator': 'docker/gemini/tileset_v2/art_china.py(안아트 2026-11-03, Pillow 절차 도트 16px x2, 이미지 모델 호출 0회). 바탕 풀만 칩셋 grass_a 픽셀 재사용',
        'source': '자체 제작', 'prompt_ref': '없음(절차 합성)', 'license': '이 프로젝트 자체 제작(안아트). 바탕 풀은 칩셋(라이선스 미확인) 픽셀 재사용 — 공개 전 권리 확인 필요(비차단)',
        'verify': True, 'verify_note': '후한 말 누선·몽충 형태는 일반화(낮은 박공·난간, 당·명대 장식 배제). 적벽 붉은 절벽은 지명 연상 각색',
        'scope': 'battle', 'path': 'assets/tiles/tileset_v2/tv2_static7_china.png', 'width': sheet.size[0], 'height': sheet.size[1], 'cols': 16, 'start': START, 'count': cnt, 'bytes': os.path.getsize(SHEET),
        'load_hint': "this.load.spritesheet('tv2_static7_china', path, {frameWidth:32, frameHeight:32}) — 프레임 = 전역 인덱스 - 3200",
        'notes': [f'FE 미연결(U32_TV2.static7_china start 3200 count {cnt}, u32Src 에서 idx >= 3200 분기를 static6_west(2700) 보다 먼저)', 'tv2_map_to_js.mjs ok() 에 3200~3399 + index_map_china 병합', 'tmv2.py src() 에 i>=3200 분기(맵디자이너)'],
        'qa': 'docker/gemini/tileset_v2/art_china/art_china_qa.json'}
    json.dump(fr, open(os.path.join(TVP, 'manifest_fragment_tv2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('applied', os.path.getsize(SHEET), cnt)
