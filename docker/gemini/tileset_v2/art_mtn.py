# tileset_v2 확장 맵(36x26 후반) 산·절벽 세트 — 안아트 2026-11-03. 이미지 모델 호출 0회(Pillow 절차 도트, 16px 원화 -> x2 최근접).
# 근거: docs/PLAN_MAP_SCALE_UP.md 6절 1번("바위산 타일이 peak_full 1종뿐, 산 덩이 2x2·3x2 또는 절벽 47형 요청"), TILESET_V2_SPEC.md 5절 4번(전투 축척 산·절벽 부족).
# 구성(전역 인덱스 = 2400 + 프레임, 새 시트 tv2_static4_mtn.png 512x384 16열, 용량 2400~2591):
#   mtn47_<mask>      바위 산괴(임의 모양 군집, 47형). 바깥 = 풀, 남쪽 가장자리 = 바위 절벽면(높이), 북·동·서 = 바위 테두리   (지면, 불투명)
#   mtn_fill_b/c      mtn47_255 대체 채움 2종(반복 깨기)                                                                  (지면)
#   cliff47_<mask>    풀 고원(대지) 47형. 윗면 = 풀, 남쪽 = 흙·바위 절벽면, 북·동·서 = 좁은 흙 테두리                        (지면)
#   snowmtn47_<mask>  눈 덮인 바위 산괴 47형(바깥 = 눈 들판, snow47_255 와 이어짐)                                          (지면)
#   mtnpk2_<r><c>     큰 바위 봉우리 2x2 (풀 바탕)          ov_mtnpk2_<r><c>  같은 봉우리 투명 오버레이(산괴·눈 위 얹기)
#   mtnpk3_<r><c>     큰 바위 봉우리 3x3 (풀 바탕)          ov_mtnpk3_<r><c>  투명 오버레이
#   ov_snowpk2_<r><c> 눈 모자 봉우리 2x2 투명 오버레이      ov_snowpk3_<r><c> 눈 모자 봉우리 3x3 투명 오버레이
#   cliff_stair_199 / cliff_stair_68   cliff47 남쪽 면을 깎은 돌계단(통행 칸용, mask 199 = 남쪽만 열림·위로 고원 / 68 = 1칸 두께 능선 관통)
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/art_mtn.py <루트> [--apply]
#   --apply : tv2_names.json(spec.static4_mtn + 이름)·tileset_v2_map.json(ranges_mtn, index_map_mtn)·manifest_fragment_tv2.json(tileset.tv2_static4_mtn) 갱신(멱등, 첫 실행 .bak-mtn-20261103)
# 팔레트: 칩셋 C 바위(#363037~#c1b4c2 6단)·풀(#3c7c12 #438d17 #5c9c25)·흙(#3f1f0f~#c79f61)·눈(#acabe8~#dfe0f6) 그대로 + 풀 그림자 #2f6a0e, 눈 그림자 #9c9bd8. 광원 왼쪽 위.
import sys, os, json, hashlib, shutil, math
import numpy as np
from PIL import Image

ROOT = sys.argv[1]
APPLY = '--apply' in sys.argv
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2')
OUTD = os.path.join(HERE, 'art_mtn')
TVP = os.path.join(ROOT, 'public/assets/tiles/tileset_v2')
SHEET = os.path.join(TVP, 'tv2_static4_mtn.png')
START, CAP = 2400, 192
os.makedirs(os.path.join(OUTD, 'preview'), exist_ok=True)
Hx = lambda s: (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16), 255)
sha_f = lambda p: hashlib.sha1(open(p, 'rb').read()).hexdigest()[:12]
KEEP = [os.path.join(TVP, f) for f in ('tv2_static.png', 'tv2_anim.png', 'tv2_anim2.png', 'tv2_static2.png', 'tv2_static3.png', 'tv2_static3_art.png', 'tv2_static3_a2.png')]
before = {p: sha_f(p) for p in KEEP if os.path.exists(p)}
NAMES = json.load(open(os.path.join(TVP, 'tv2_names.json'), encoding='utf-8'))
STATIC = Image.open(os.path.join(TVP, 'tv2_static.png')).convert('RGBA')
def tile16(name):
    f = NAMES['names'][name]['index'] - 1000
    a = np.array(STATIC.crop((f % 16 * 32, f // 16 * 32, f % 16 * 32 + 32, f // 16 * 32 + 32)))
    return np.ascontiguousarray(a[::2, ::2]).copy()
GRASS = tile16('grass_a'); SNOWG = tile16('snow47_255')

ROCK = [Hx(c) for c in ('#363037', '#484149', '#685c68', '#877887', '#a496a4', '#c1b4c2')]   # 0 외곽 ~ 5 하이라이트
EARTH = [Hx(c) for c in ('#3f1f0f', '#684020', '#885f31', '#af7f40', '#c79f61')]
SNOW = [Hx(c) for c in ('#acabe8', '#ccccf2', '#d6d6f2', '#dfe0f6', '#f4f4ff')]
GRASS_SH = Hx('#2f6a0e'); SNOW_SH = Hx('#9c9bd8')
LIP_GRASS = Hx('#5c9c25')
HIGRASS = {Hx('#3c7c12')[:3]: Hx('#438d17'), Hx('#438d17')[:3]: Hx('#5c9c25'), Hx('#5c9c25')[:3]: Hx('#76b03a')}   # 고원 윗면 = 한 단계 밝은 풀(높이감)
RIM_GRASS = Hx('#8fc451')

BITS = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}
def red(m):
    for d, a, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not ((m & BITS[a]) and (m & BITS[b])): m &= ~BITS[d]
    return m
MASKS = sorted(set(red(m) for m in range(256))); assert len(MASKS) == 47
assert MASKS == NAMES['spec']['masks'], '마스크 규칙 불일치'

# ---------------------------------------------------------------- 주기 16 요철(이웃 칸과 이어지도록 좌표 주기 16)
WOB2 = [0, 1, 1, 2, 2, 1, 1, 0, 0, 1, 2, 2, 1, 0, 0, 0]      # 가장자리 요철(0~2px), 주기 16
FACEW = [0, 0, 1, 1, 0, -1, -1, 0, 1, 1, 1, 0, 0, -1, 0, 0]   # 절벽면 윗선 높낮이(-1~+1px)
CRACK = {2: 1, 7: 2, 11: 1, 14: 2}   # 절벽면 세로 금(x -> 시작 깊이)

def classify(m, mN=2, mS=2, mE=2, mW=2, F=7):
    """칸 안 픽셀 분류: 0 바깥, 1 윗면(산괴/고원), 2 절벽면. 경계 띠는 칸 안에만 있어 이웃 칸과 이음이 맞는다."""
    out = lambda d: not (m & BITS[d])
    cls = np.ones((16, 16), np.uint8)
    for y in range(16):
        for x in range(16):
            n_ = mN + WOB2[x]; s_ = mS; e_ = mE + WOB2[(y + 3) % 16]; w_ = mW + WOB2[(y + 9) % 16]; Fx = F + FACEW[x]
            dN, dS, dE, dW = y + 0.5, 16 - y - 0.5, 16 - x - 0.5, x + 0.5
            c = 1
            if out('N') and dN < n_: c = 0
            if out('W') and dW < w_: c = 0
            if out('E') and dE < e_: c = 0
            if out('S'):
                if dS < s_: c = 0
                elif dS < s_ + Fx and c: c = 2
            # 안쪽 모서리(대각만 바깥): 이웃 칸 띠의 연장
            if not out('N') and not out('E') and out('NE') and dE < e_ and dN < n_: c = 0
            if not out('N') and not out('W') and out('NW') and dW < w_ and dN < n_: c = 0
            if not out('S') and not out('E') and out('SE') and dE < e_:
                if dS < s_: c = 0
                elif dS < s_ + Fx: c = 2
            if not out('S') and not out('W') and out('SW') and dW < w_:
                if dS < s_: c = 0
                elif dS < s_ + Fx: c = 2
            # 볼록 모서리 둥글리기(바깥 두 변이 만나는 꼭짓점 1px)
            if c and out('N') and out('W') and dN < n_ + 1 and dW < w_ + 1: c = 0
            if c and out('N') and out('E') and dN < n_ + 1 and dE < e_ + 1: c = 0
            cls[y, x] = c
    return cls

def facets(W, Hh, n, seed, wrap=True):
    """보로노이 바위 면(주기 W·Hh). 반환: 셀 id 맵, 셀별 명암 오프셋(-1/0/+1), 경계 엠보스(-1 = 아래·오른쪽 틈, +1 = 위·왼쪽 빛, 0)."""
    rng = np.random.default_rng(seed)
    pts = [(rng.uniform(0, W), rng.uniform(0, Hh)) for _ in range(n)]
    off = rng.choice([-1, 0, 0, 1], size=n)
    ids = np.zeros((Hh, W), int); rel = np.zeros((Hh, W, 2))
    for y in range(Hh):
        for x in range(W):
            best = 1e9
            for i, (px, py) in enumerate(pts):
                for ox in ((-W, 0, W) if wrap else (0,)):
                    for oy in ((-Hh, 0, Hh) if wrap else (0,)):
                        dx, dy = x + 0.5 - px - ox, (y + 0.5 - py - oy) * 1.25
                        d = dx * dx + dy * dy
                        if d < best: best, ids[y, x], rel[y, x] = d, i, (dx, dy / 1.25)
    emb = np.zeros((Hh, W), int)
    at = lambda u, v: ids[v % Hh, u % W] if wrap else ids[min(max(v, 0), Hh - 1), min(max(u, 0), W - 1)]
    for y in range(Hh):
        for x in range(W):
            if at(x + 1, y) != ids[y, x] or at(x, y + 1) != ids[y, x]: emb[y, x] = -1
            elif at(x - 1, y) != ids[y, x] or at(x, y - 1) != ids[y, x]: emb[y, x] = 1
    return ids, off, emb, rel

def rock_texture(seed, n=7):
    """주기 16 바위 윗면: 큰 면 6~8개, 면마다 명암 차 + 위·왼쪽 빛 / 아래·오른쪽 틈."""
    ids, off, emb, rel = facets(16, 16, n, seed)
    a = np.zeros((16, 16, 4), np.uint8)
    for y in range(16):
        for x in range(16):
            dx, dy = rel[y, x]
            lit = (dx * 0.75 + dy * 0.9) < 0.3          # 바위 덩이마다 왼쪽 위 = 빛, 오른쪽 아래 = 그늘 (뾰족한 바위 무리)
            t = (4 if lit else 2) + off[ids[y, x]] * (1 if lit else 0)
            if emb[y, x] == -1: t = 1 if lit else 0
            elif emb[y, x] == 1 and lit: t = 5
            a[y, x] = ROCK[max(0, min(5, t))]
    return a

def face_px(x, k, F, pal, snow=False):
    """절벽면 픽셀: k = 면 위에서부터 깊이(0 = 윗선). pal = 6단(0 외곽)."""
    if pal is not ROCK:   # 흙 절벽(cliff47): 윗선 = 풀 처마(들쭉날쭉), 몸 = 세로 결 흙·바위
        if k == 0: return HIGRASS[Hx('#5c9c25')[:3]] if x % 3 else HIGRASS[Hx('#438d17')[:3]]
        if k == 1: return pal[4] if x % 4 == 1 else Hx('#438d17') if x % 5 == 0 else pal[3]
        if k == F - 1: return pal[0]
        if x in CRACK and k >= CRACK[x]: return pal[1]
        if (x - 1) in CRACK and k >= CRACK[x - 1]: return pal[3]
        return pal[2] if (k + x // 3) % 4 else pal[1]
    if k == 0: return SNOW[3] if snow else pal[5 if pal is ROCK else 4]
    if k == F - 1: return pal[0]
    if x in CRACK and k >= CRACK[x]: return pal[1]
    if (x - 1) in CRACK and k >= CRACK[x - 1] + 1: return pal[3] if pal is ROCK else pal[3]
    if k == 1: return pal[4] if pal is ROCK else pal[3]
    return pal[3] if k < F // 2 + 1 else pal[2]

def render47(m, kind, var_tex=None):
    """kind: mtn | cliff | snowmtn"""
    F = 7 if kind != 'cliff' else 8
    cls = classify(m, F=F)
    base = SNOWG if kind == 'snowmtn' else GRASS
    top = GRASS if kind == 'cliff' else (var_tex if var_tex is not None else TEX_A)
    sh = SNOW_SH if kind == 'snowmtn' else GRASS_SH
    facepal = EARTH + [EARTH[4]] if kind == 'cliff' else ROCK
    a = base.copy()
    out = lambda d: not (m & BITS[d])
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 1: a[y, x] = HIGRASS.get(tuple(top[y, x][:3]), top[y, x]) if kind == 'cliff' else top[y, x]
            elif c == 2:
                k = 0
                while y - k - 1 >= 0 and cls[y - k - 1, x] == 2: k += 1
                a[y, x] = face_px(x, k, F, facepal, snow=(kind == 'snowmtn'))
    if kind == 'snowmtn':   # r2: 윗면 = 눈 덮인 바위 면(면 단위로 눈/바위, 줄무늬 없음)
        for y in range(16):
            for x in range(16):
                if cls[y, x] != 1: continue
                dx, dy = SNREL[y, x]; cell = SNIDS[y, x]
                if SNOFF[cell] < 0: a[y, x] = ROCK[1] if SNEMB[y, x] == -1 else ROCK[3] if (dx + dy) < 0 else ROCK[2]
                else: a[y, x] = SNOW[0] if SNEMB[y, x] == -1 else SNOW[4] if (dx + dy) < -2.0 else SNOW[3] if (dx + dy) < 1.0 else SNOW[1]
    # 외곽선·테두리 음영(칸 밖 이웃은 같은 분류로 간주 = 띠가 칸 안에 있어 안전)
    g = lambda u, v, c: cls[v, u] if 0 <= u < 16 and 0 <= v < 16 else c
    res = a.copy()
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 0:
                # 바위 아래·오른쪽 풀 그림자(광원 왼쪽 위)
                if g(x, y - 1, 0) != 0 or g(x - 1, y, 0) != 0 or g(x - 1, y - 1, 0) != 0: res[y, x] = sh
                continue
            nb = [g(x, y - 1, c), g(x, y + 1, c), g(x - 1, y, c), g(x + 1, y, c)]
            if 0 in nb:
                if kind == 'cliff' and c == 1:
                    res[y, x] = EARTH[0] if (g(x, y + 1, c) == 0 or g(x + 1, y, c) == 0) else EARTH[1]
                else:
                    res[y, x] = facepal[0]
                continue
            if c == 1 and kind != 'cliff':
                if g(x, y - 2, c) == 0 or g(x - 2, y, c) == 0: res[y, x] = ROCK[5] if kind == 'mtn' else SNOW[4]          # 북·서 테두리 빛
                elif g(x + 2, y, c) == 0 or g(x, y + 2, c) == 2 and False: res[y, x] = ROCK[2]                            # 동쪽 그늘
            if c == 1 and kind == 'cliff':
                if g(x, y - 1, c) == 0 or g(x - 1, y, c) == 0 or g(x, y - 2, c) == 0: res[y, x] = RIM_GRASS
                elif g(x + 2, y, c) == 0 or g(x + 1, y, c) == 0: res[y, x] = EARTH[2] if g(x + 1, y, c) == 0 else EARTH[3]                                                          # 고원 가장자리 흙 입술
    return Image.fromarray(res)

def cone_texture(cones, seed):
    """주기 16 작은 바위 봉우리 무리(산괴 윗면). cones = [(꼭짓점x, 꼭짓점y, 높이, 밑변 반폭)], 뒤(위)에서 앞(아래) 순으로 그림. 틈 = 어두운 자갈."""
    rng = np.random.default_rng(seed)
    a = np.zeros((16, 16, 4), np.uint8); owner = -np.ones((16, 16), int)
    for y in range(16):
        for x in range(16):
            a[y, x] = ROCK[3] if (x * 5 + y * 3 + rng.integers(0, 3)) % 5 else ROCK[2]
    order = sorted(range(len(cones)), key=lambda i: cones[i][1] + cones[i][2])
    for i in order:
        ax, ay, h, hw = cones[i]
        for y in range(16):
            for x in range(16):
                for ox in (-16, 0, 16):
                    for oy in (-16, 0, 16):
                        u, v = x + 0.5 - ax - ox, y + 0.5 - ay - oy
                        if 0 <= v <= h and abs(u) <= hw * v / h + 0.3:
                            lit = u < v * 0.18
                            k = v / h
                            t = (5 if k < 0.3 else 4 if k < 0.75 else 3) if lit else (3 if k < 0.25 else 2 if k < 0.7 else 1)
                            if lit and abs(u - v * 0.18) < 0.8 and k > 0.15: t = 5   # 능선 빛
                            a[y, x] = ROCK[t]; owner[y, x] = i
    res = a.copy()
    for y in range(16):
        for x in range(16):
            o = owner[y, x]
            if o < 0: continue
            if owner[(y + 1) % 16, x] != o: res[y, x] = ROCK[0]                      # 밑선
            elif owner[y, (x + 1) % 16] != o: res[y, x] = ROCK[1]                     # 그늘 쪽 옆선
            elif owner[y, (x - 1) % 16] != o and owner[y, (x - 1) % 16] >= 0: res[y, x] = ROCK[2]
    return res
def calm_rock(seed, n=5):
    """r4: 낮은 대비 바위 윗면(큰 면 4~6개, 면 사이 금은 아래·오른쪽만 한 단계 어둡게). 산 느낌은 위에 얹는 봉우리 오버레이가 담당 — 반복 무늬가 눈에 띄지 않게."""
    ids, off, emb, rel = facets(16, 16, n, seed)
    rng = np.random.default_rng(seed + 7)
    a = np.zeros((16, 16, 4), np.uint8)
    for y in range(16):
        for x in range(16):
            dx, dy = rel[y, x]
            t = 3 + (1 if (dx + dy) < -2.2 else 0) + (off[ids[y, x]] if off[ids[y, x]] < 0 else 0)
            if emb[y, x] == -1: t = 2 if t >= 3 else 1
            if rng.random() < 0.06 and emb[y, x] == 0: t = 2 if t >= 3 else t        # 잔 점(자갈)
            a[y, x] = ROCK[max(1, min(4, t))]
    return a
TEX_A = calm_rock(11); TEX_B = calm_rock(23, 4); TEX_C = calm_rock(37, 6)
SNIDS, SNOFF, SNEMB, SNREL = facets(16, 16, 6, 41)

# ---------------------------------------------------------------- 큰 봉우리(2x2 = 32px, 3x3 = 48px 원화)
def peak(S, seed, snow=False, ground=None):
    rng = np.random.default_rng(seed)
    W = Hh = S
    sx = W * 0.47; top = 1 if S == 32 else 1
    base_y = Hh - 3
    # 능선 높이: 주봉 + 오른쪽 어깨봉, 1px 랜덤 워크 요철
    ridge = np.zeros(W)
    for x in range(W):
        u = (x + 0.5 - sx) / (W * 0.5)
        h = top + abs(u) ** 0.92 * (base_y - top - 3) * (1.0 if u < 0 else 0.92)
        sh_x = W * 0.76; v = (x + 0.5 - sh_x) / (W * 0.16)
        if abs(v) < 1: h = min(h, top + (base_y - top) * 0.40 + abs(v) * (base_y - top) * 0.25)
        ridge[x] = h
    walk = 0
    for x in range(W):
        walk = max(-1, min(1, walk + rng.integers(-1, 2)))
        ridge[x] += walk * 0.8
    foot = lambda x: base_y - (2.5 * ((x + 0.5 - W / 2) / (W / 2)) ** 2)
    a = np.zeros((Hh, W, 4), np.uint8)
    inside = np.zeros((Hh, W), bool)
    for x in range(W):
        for y in range(Hh):
            if ridge[x] <= y <= foot(x) and 1 <= x <= W - 2: inside[y, x] = True
    # 주 능선(정상 -> 오른쪽 아래)과 보조 능선
    rx = lambda y: sx + (y - top) * 0.30
    rx2 = lambda y: W * 0.76 + (y - (top + (base_y - top) * 0.40)) * 0.22
    snow_line = lambda x: top + (base_y - top) * (0.50 + 0.07 * math.sin(x * 1.7)) + (3 if (x % 5 == 0) else 0)
    ids, off, emb, _ = facets(W, Hh, {16: 5, 32: 14, 48: 26}[S], seed + 100, wrap=False)
    for y in range(Hh):
        for x in range(W):
            if not inside[y, x]: continue
            lit = x + 0.5 < rx(y)
            if x + 0.5 > W * 0.62 and y > top + (base_y - top) * 0.40:   # 어깨봉 구역: 보조 능선 기준
                lit = x + 0.5 < rx2(y)
            depth = (y - ridge[x]) / max(1.0, foot(x) - ridge[x])
            yd = (y - top) / (base_y - top)
            if lit: t = (5 if yd < 0.18 else 4 if yd < 0.7 else 3) + off[ids[y, x]] * (1 if yd > 0.18 else 0)
            else: t = (3 if yd < 0.15 else 2 if yd < 0.65 else 1) + min(0, off[ids[y, x]])
            e = emb[y, x]
            if e == -1: t = t - 2
            elif e == 1 and lit: t = t + 1
            t = max(0 if not lit else 1, min(5, t))
            c = ROCK[t]
            if snow and y < snow_line(x):
                if lit: c = SNOW[1] if e == -1 else SNOW[4] if (yd < 0.12 or e == 1) else SNOW[3]
                else: c = SNOW[0] if e == -1 or yd > 0.2 else SNOW[1]
            a[y, x] = c
    # 능선 강조선(정상에서 내려가는 1px 밝은 선은 빛 쪽 경계)
    for y in range(Hh):
        xr = int(rx(y))
        if 0 <= xr < W and inside[y, xr] and y < base_y - 3:
            a[y, xr] = (SNOW[4] if snow and y < snow_line(xr) else ROCK[5]) if y > top + 1 else a[y, xr]
    # 산자락 돌 부스러기
    for _ in range({16: 1, 32: 4, 48: 7}[S]):
        cx = rng.uniform(3, W - 3); cy = foot(cx) - rng.uniform(0.5, 2.5); r = rng.uniform(1.2, 2.0)
        for y in range(Hh):
            for x in range(W):
                dx, dy = (x + 0.5 - cx) / r, (y + 0.5 - cy) / (r * 0.8)
                if dx * dx + dy * dy <= 1:
                    inside[y, x] = True
                    a[y, x] = ROCK[4] if (dx + dy) < -0.3 else ROCK[3] if dx < 0.4 else ROCK[2]
    # 외곽선
    res = a.copy()
    for y in range(Hh):
        for x in range(W):
            if not inside[y, x]: continue
            if any(not (0 <= u < W and 0 <= v < Hh and inside[v, u]) for u, v in ((x, y - 1), (x, y + 1), (x - 1, y), (x + 1, y))): res[y, x] = ROCK[0]
    if ground is not None:
        g = np.tile(ground, (S // 16, S // 16, 1)).copy()
        shc = SNOW_SH if ground is SNOWG else GRASS_SH
        for y in range(Hh):
            for x in range(W):
                if inside[y, x]: g[y, x] = res[y, x]
                elif (y > 0 and x > 0 and inside[y - 1, x - 1]) or (x > 1 and inside[y, x - 2] and y > Hh * 0.4) or (y > 0 and inside[y - 1, x]): g[y, x] = shc
        res = g
    else:
        res[~inside] = 0
    return Image.fromarray(res)

def split(im, n, prefix):
    out = []
    for r in range(n):
        for c in range(n):
            out.append((f'{prefix}_{r}{c}', im.crop((c * 16, r * 16, c * 16 + 16, r * 16 + 16))))
    return out

# ---------------------------------------------------------------- 돌계단(cliff47 남쪽 면을 깎음)
def stair(m):
    im = np.array(render47(m, 'cliff'))
    cls = classify(m, F=8)
    for y in range(16):
        for x in range(4, 12):
            if cls[y, x] == 2 or (cls[y, x] == 0 and y >= 13) or (cls[y, x] == 1 and y >= 6 and m == 199) or (m == 68 and cls[y, x] == 1):
                step = (y % 3)
                im[y, x] = ROCK[5] if step == 0 else ROCK[3] if step == 1 else ROCK[1]
            if x in (4, 11) and (cls[y, x] != 0 or y >= 13) and (m == 68 or y >= 6): im[y, x] = ROCK[0]
    if m == 68:   # 능선 관통: 위쪽(북) 바깥 풀 띠까지 길이 이어지도록 입구 표시
        for x in range(5, 11):
            for y in range(0, 3): im[y, x] = EARTH[3] if (x + y) % 2 else EARTH[4]
    return Image.fromarray(im)

x2 = lambda im: im.resize((32, 32), Image.NEAREST)
SPEC = []
for m in MASKS: SPEC.append((f'mtn47_{m}', render47(m, 'mtn'), 'ground'))
SPEC.append(('mtn_fill_b', render47(255, 'mtn', TEX_B), 'ground'))
SPEC.append(('mtn_fill_c', render47(255, 'mtn', TEX_C), 'ground'))
for m in MASKS: SPEC.append((f'cliff47_{m}', render47(m, 'cliff'), 'ground'))
for m in MASKS: SPEC.append((f'snowmtn47_{m}', render47(m, 'snowmtn'), 'ground'))
PK2, PK3 = peak(32, 5), peak(48, 9)
SPEC += [(n, im, 'ground') for n, im in split(peak(32, 5, ground=GRASS), 2, 'mtnpk2')]
SPEC += [(n, im, 'ground') for n, im in split(peak(48, 9, ground=GRASS), 3, 'mtnpk3')]
SPEC += [(n, im, 'overlay') for n, im in split(PK2, 2, 'ov_mtnpk2')]
SPEC += [(n, im, 'overlay') for n, im in split(PK3, 3, 'ov_mtnpk3')]
SPEC += [(n, im, 'overlay') for n, im in split(peak(32, 5, snow=True), 2, 'ov_snowpk2')]
SPEC += [(n, im, 'overlay') for n, im in split(peak(48, 9, snow=True), 3, 'ov_snowpk3')]
SPEC.append(('ov_crag_a', peak(16, 3), 'overlay'))
SPEC.append(('ov_crag_b', peak(16, 8).transpose(Image.FLIP_LEFT_RIGHT), 'overlay'))
SPEC.append(('ov_snowcrag_a', peak(16, 3, snow=True), 'overlay'))
SPEC.append(('cliff_stair_199', stair(199), 'ground'))
SPEC.append(('cliff_stair_68', stair(68), 'ground'))
assert len(SPEC) <= CAP, len(SPEC)
FR = {START + i: (n, x2(im), k) for i, (n, im, k) in enumerate(SPEC)}
BY = {n: im for _, (n, im, _) in FR.items()}

# ---------------------------------------------------------------- QA
qa = {'date': '2026-11-03', 'author': '안아트', 'calls': 0, 'sheet': 'public/assets/tiles/tileset_v2/tv2_static4_mtn.png', 'start': START, 'count': len(FR), 'errors': [], 'items': {}}
for idx, (n, im, kind) in FR.items():
    a = np.array(im); al = a[..., 3]
    if kind == 'ground' and (al < 255).any(): qa['errors'].append(f'{n} 지면인데 투명')
    if kind == 'overlay' and ((al > 0) & (al < 255)).any(): qa['errors'].append(f'{n} 반투명(0/255 규칙)')
    rgb = a[..., :3].astype(int)
    if int(((rgb[..., 0] > 200) & (rgb[..., 2] > 100) & (rgb[..., 1] < 80) & (al > 0)).sum()): qa['errors'].append(f'{n} 마젠타 잔여')
    qa['items'][n] = {'index': idx, 'kind': kind, 'opaque_ratio': round(float((al == 255).mean()), 3), 'colors': len(set(map(tuple, a.reshape(-1, 4)[al.reshape(-1) > 0][:, :3].tolist())))}
# 팔레트: 허용 색 외 사용 금지(풀·눈 원본 타일 색 + 정의 팔레트)
allowed = set(map(tuple, GRASS.reshape(-1, 4)[:, :3].tolist())) | set(map(tuple, SNOWG.reshape(-1, 4)[:, :3].tolist()))
allowed |= {c[:3] for c in ROCK + EARTH + SNOW + [GRASS_SH, SNOW_SH, LIP_GRASS, RIM_GRASS] + list(HIGRASS.values())}
stray = {}
for idx, (n, im, kind) in FR.items():
    a = np.array(im); px = a.reshape(-1, 4); px = px[px[:, 3] > 0][:, :3]
    s = {tuple(c) for c in px.tolist()} - allowed
    if s: stray[n] = len(s)
qa['palette_total'] = len(allowed); qa['palette_stray'] = stray
if stray: qa['errors'].append(f'허용 외 색 {stray}')
# 이음 검사: 47형 모든 마스크 쌍 중 가로·세로로 맞닿을 수 있는 조합의 경계 픽셀 차(같은 지형끼리 = 0 이어야 함)
def seam_check(fam):
    bad = 0; worst = 0; pairs = 0
    gm = lambda nb: red(sum(BITS[k] for k, v in nb.items() if v))
    # 3x3 무작위 칸 그리드 2000회: 실제 칠하기와 같은 방식으로 두 칸의 경계 2열 비교
    rng = np.random.default_rng(1)
    for _ in range(2000):
        G = rng.random((5, 6)) < 0.6
        def mask(x, y):
            def g(u, v): return bool(G[v, u]) if 0 <= u < 6 and 0 <= v < 5 else True
            return gm({'N': g(x, y - 1), 'NE': g(x + 1, y - 1), 'E': g(x + 1, y), 'SE': g(x + 1, y + 1), 'S': g(x, y + 1), 'SW': g(x - 1, y + 1), 'W': g(x - 1, y), 'NW': g(x - 1, y - 1)})
        y, x = 2, 2
        for (u, v) in ((3, 2), (2, 3)):
            A_in, B_in = G[y, x], G[v, u]
            ta = np.array(BY[f'{fam}_{mask(x, y)}'] if A_in else BY['__base_' + fam]).astype(int)
            tb = np.array(BY[f'{fam}_{mask(u, v)}'] if B_in else BY['__base_' + fam]).astype(int)
            if u != x: ea, eb = ta[:, -1, :3], tb[:, 0, :3]
            else: ea, eb = ta[-1, :, :3], tb[0, :, :3]
            # 경계에서 지형 분류(바깥/안)가 바뀌면 안 됨: 바탕(풀/눈) 픽셀 여부 비교
            pairs += 1
            d = int(np.abs(ea - eb).max())
            worst = max(worst, d)
    return pairs, worst
BY['__base_mtn47'] = x2(Image.fromarray(GRASS)); BY['__base_cliff47'] = x2(Image.fromarray(GRASS)); BY['__base_snowmtn47'] = x2(Image.fromarray(SNOWG))
# 정량 이음: 경계 열의 "분류(바탕/윗면/면)" 일치율 — 색 차가 아니라 형상 이음
def cls_of(name_or_base, m, kind):
    return np.zeros((16, 16), np.uint8) if m is None else classify(m, F=7 if kind != 'cliff' else 6)
def shape_seam(kind):
    """경계 두 줄의 형상 분류 비교. 요철 함수는 전역 주기 16 이라 경계 양쪽 위치 차가 1px 이하여야 함(그보다 큰 어긋남 = 이음 오류 수)."""
    rng = np.random.default_rng(2); jumps = 0; tot = 0
    gm = lambda d: red(sum(BITS[k] for k, v in d.items() if v))
    for _ in range(3000):
        G = rng.random((5, 5)) < 0.62
        def g(u, v): return bool(G[v, u]) if 0 <= u < 5 and 0 <= v < 5 else True
        def mk(x, y): return gm({'N': g(x, y - 1), 'NE': g(x + 1, y - 1), 'E': g(x + 1, y), 'SE': g(x + 1, y + 1), 'S': g(x, y + 1), 'SW': g(x - 1, y + 1), 'W': g(x - 1, y), 'NW': g(x - 1, y - 1)})
        for (x, y, u, v) in ((2, 2, 3, 2), (2, 2, 2, 3)):
            ca = classify(mk(x, y), F=7 if kind != 'cliff' else 8) if g(x, y) else np.zeros((16, 16), np.uint8)
            cb = classify(mk(u, v), F=7 if kind != 'cliff' else 8) if g(u, v) else np.zeros((16, 16), np.uint8)
            ea, eb = (ca[:, 15], cb[:, 0]) if u != x else (ca[15, :], cb[0, :])
            for i in range(16):
                tot += 1
                if ea[i] != eb[i] and not any(0 <= j < 16 and eb[j] == ea[i] for j in (i - 1, i + 1)): jumps += 1
    return {'pixels': tot, 'jumps_gt_1px': jumps}
qa['seam_shape_mismatch_ratio'] = {'mtn': shape_seam('mtn'), 'cliff': shape_seam('cliff')}
# 채움 타일 자체 주기성(mtn47_255 좌우·상하 경계 색차 평균)
f255 = np.array(BY['mtn47_255']).astype(int)
qa['fill_wrap_mean'] = {'x': round(float(np.abs(f255[:, 0, :3] - f255[:, -1, :3]).mean()), 1), 'y': round(float(np.abs(f255[0, :, :3] - f255[-1, :, :3]).mean()), 1)}

sheet = Image.new('RGBA', (512, 384), (0, 0, 0, 0))
for idx, (n, im, kind) in FR.items():
    f = idx - START; sheet.paste(im, (f % 16 * 32, f // 16 * 32))
sheet.save(SHEET, optimize=True)
qa['sheet_size'] = list(sheet.size); qa['sheet_bytes'] = os.path.getsize(SHEET)
qa['keep_unchanged'] = all(sha_f(p) == h for p, h in before.items())

# ---------------------------------------------------------------- 미리보기: 칠하기 장면(실제 47형 선택 규칙으로 조립)
def paint(grid, fam, base_name):
    Hh, W = len(grid), len(grid[0])
    out = Image.new('RGBA', (W * 32, Hh * 32))
    gm = lambda d: red(sum(BITS[k] for k, v in d.items() if v))
    for y in range(Hh):
        for x in range(W):
            def g(u, v): return grid[v][u] in fam[1] if 0 <= u < W and 0 <= v < Hh else grid[y][x] in fam[1]
            ch = grid[y][x]
            if ch in fam[1]:
                m = gm({'N': g(x, y - 1), 'NE': g(x + 1, y - 1), 'E': g(x + 1, y), 'SE': g(x + 1, y + 1), 'S': g(x, y + 1), 'SW': g(x - 1, y + 1), 'W': g(x - 1, y), 'NW': g(x - 1, y - 1)})
                nm = f'{fam[0]}_{m}'
                if m == 255 and fam[0] == 'mtn47' and ch in 'bc': nm = f'mtn_fill_{ch}'
                out.paste(BY[nm], (x * 32, y * 32))
            else:
                out.paste(x2(Image.fromarray(base_name)), (x * 32, y * 32))
    return out
SC_MTN = ['..........................',
          '..MMMMMM.......MMMMMMM....',
          '.MMMbMMMMM....MMMcMMMMM...',
          '.MMMMMMMMMM....MMMMMM.....',
          '..MMMM..MMM......MM.......',
          '...MM....M........M.......',
          '.........................M',
          '....M.M.......MMMMM.....MM',
          '...MMMMM.....MM...MM....MM',
          '....MMM......MMMMMMM......',
          '..........................']
scene = paint(SC_MTN, ('mtn47', 'Mbc'), GRASS)
# 봉우리 얹기(산괴 위 오버레이 + 풀 위 지면 봉우리)
def blit(prefix, n, cx, cy):
    for r in range(n):
        for c in range(n): scene.alpha_composite(BY[f'{prefix}_{r}{c}'], ((cx + c) * 32, (cy + r) * 32))
blit('ov_mtnpk3', 3, 2, 1); blit('ov_mtnpk2', 2, 16, 1); blit('ov_mtnpk2', 2, 6, 2)
for cx, cy, nm in ((9, 2, 'ov_crag_a'), (19, 2, 'ov_crag_b'), (4, 4, 'ov_crag_b'), (17, 3, 'ov_crag_a')): scene.alpha_composite(BY[nm], (cx * 32, cy * 32))
for r in range(3):
    for c in range(3): scene.paste(BY[f'mtnpk3_{r}{c}'], ((22 + c) * 32, (2 + r) * 32))
for r in range(2):
    for c in range(2): scene.paste(BY[f'mtnpk2_{r}{c}'], ((10 + c) * 32, (6 + r) * 32))
scene.convert('RGB').save(os.path.join(OUTD, 'preview', 'mtn_scene_x1.png'))
scene.crop((0, 0, 24 * 32, 6 * 32)).convert('RGB').resize((24 * 64, 6 * 64), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'mtn_zoom_x2.png'))
scene.convert('RGB').resize((scene.width * 2, scene.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'mtn_scene_x2.png'))
SC_CL = ['..........................',
         '..KKKKKKKKKK....KKKKKKK...',
         '..KKKKKKKKKK....KK...KK...',
         '..KKKKK..KKK....KKKKKKK...',
         '..KKKKK..KKK..............',
         '.....KK...........KKKKKKKK',
         '..........KKKKK...........',
         '..........K...K...........',
         '..........KKKKK...........']
cl = paint(SC_CL, ('cliff47', 'K'), GRASS)
cl.paste(BY['cliff_stair_199'], (7 * 32, 4 * 32))   # (7,4): 남쪽 열린 가장자리 칸 → 계단
cl.paste(BY['cliff_stair_68'], (22 * 32, 5 * 32))
cl.convert('RGB').resize((cl.width * 2, cl.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'cliff_scene_x2.png'))
SC_SN = ['....................',
         '..SSSSSS....SSSSS...',
         '.SSSSSSSS...SSSSSS..',
         '..SSSSSS.....SSS....',
         '....SS..............',
         '....................']
sn = paint(SC_SN, ('snowmtn47', 'S'), SNOWG)
for r in range(3):
    for c in range(3): sn.alpha_composite(BY[f'ov_snowpk3_{r}{c}'], ((3 + c) * 32, (0 + r) * 32))
for r in range(2):
    for c in range(2): sn.alpha_composite(BY[f'ov_snowpk2_{r}{c}'], ((13 + c) * 32, (1 + r) * 32))
for r in range(2):
    for c in range(2): sn.alpha_composite(BY[f'ov_snowpk2_{r}{c}'], ((16 + c) * 32, (3 + r) * 32))
sn.convert('RGB').resize((sn.width * 2, sn.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'snow_scene_x2.png'))
# 시트 미리보기(체커 배경 = 투명 확인)
chk = Image.new('RGBA', sheet.size)
for y in range(0, sheet.height, 8):
    for x in range(0, sheet.width, 8): chk.paste((200, 200, 200, 255) if (x // 8 + y // 8) % 2 else (120, 120, 120, 255), (x, y, x + 8, y + 8))
chk.alpha_composite(sheet); chk.convert('RGB').resize((1024, 768), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'sheet_x2.png'))
json.dump(qa, open(os.path.join(OUTD, 'art_mtn_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('count', len(FR), 'errors', qa['errors'][:10], 'seam', qa['seam_shape_mismatch_ratio'], 'wrap', qa['fill_wrap_mean'], 'keep', qa['keep_unchanged'], 'bytes', qa['sheet_bytes'])

# ---------------------------------------------------------------- --apply: 이름표·매핑·manifest 조각
if APPLY:
    if qa['errors']: raise SystemExit('QA 오류 — apply 중단')
    TAG = '.bak-mtn-20261103'
    for f in ('tv2_names.json', 'tileset_v2_map.json', 'manifest_fragment_tv2.json'):
        p = os.path.join(TVP, f)
        if not os.path.exists(p + TAG): shutil.copy2(p, p + TAG)
    names = json.load(open(os.path.join(TVP, 'tv2_names.json'), encoding='utf-8'))
    names['spec']['static4_mtn'] = {'key': 'tv2_static4_mtn', 'path': '/assets/tiles/tileset_v2/tv2_static4_mtn.png', 'cols': 16, 'start': START, 'count': len(FR), 'size': list(sheet.size),
                                    'note': '안아트 art_mtn.py(2026-11-03): 확장 맵 산·절벽 세트. 프레임 = 전역-2400. 지면 = 불투명, ov_* = 투명 오버레이(alpha 0/255)'}
    for idx, (n, im, kind) in FR.items():
        names['names'][n] = {'sheet': 'tv2_static4_mtn', 'frame': idx - START, 'index': idx, 'src': f'art_mtn.py {kind}'}
    json.dump(names, open(os.path.join(TVP, 'tv2_names.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    mp = json.load(open(os.path.join(TVP, 'tileset_v2_map.json'), encoding='utf-8'))
    mp['ranges_mtn'] = {'tv2_static4_mtn': [START, START + len(FR) - 1]}
    mp['index_map_mtn'] = {n: idx for idx, (n, im, kind) in FR.items()}
    mp['mtn_note'] = '안아트 art_mtn.py --apply(2026-11-03): 산·절벽 세트 2400~. 기존 tile_layer 이름과 겹치지 않는 새 이름만(기존 키 값 불변). 사용 규칙은 docker/maps/tilemap_v2/mtn_tiles_mapping.json'
    json.dump(mp, open(os.path.join(TVP, 'tileset_v2_map.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    fr = json.load(open(os.path.join(TVP, 'manifest_fragment_tv2.json'), encoding='utf-8'))   # 형식: {키: 항목}
    fr['tileset.tv2_static4_mtn'] = {'type': 'tileset', 'frame': [32, 32], 'alpha': '지면(mtn47·cliff47·snowmtn47·mtnpk*·cliff_stair) 불투명 / ov_* 투명 오버레이(alpha 0/255)',
        'filter': 'nearest(Point), pixelArt=true, 정수 배율만', 'names': '/assets/tiles/tileset_v2/tv2_names.json', 'name_map': '/assets/tiles/tileset_v2/tileset_v2_map.json',
        'generator': 'docker/gemini/tileset_v2/art_mtn.py(안아트 2026-11-03, Pillow 절차 도트 16px x2, 이미지 모델 호출 0회). 바탕 풀·눈만 칩셋 grass_a·snow47_255 픽셀 재사용',
        'source': '자체 제작(바탕 풀·눈 = tv2_static 칩셋 픽셀)', 'prompt_ref': '없음(절차 합성)',
        'license': '이 프로젝트 자체 제작(안아트). 바탕 풀·눈은 칩셋(라이선스 미확인) 픽셀 재사용 — 공개 전 권리 확인 필요(비차단)',
        'verify': False, 'scope': 'battle', 'path': 'assets/tiles/tileset_v2/tv2_static4_mtn.png', 'width': sheet.size[0], 'height': sheet.size[1], 'cols': 16,
        'start': START, 'count': len(FR), 'bytes': qa['sheet_bytes'],
        'load_hint': "this.load.spritesheet('tv2_static4_mtn', path, {frameWidth:32, frameHeight:32}) — 프레임 = 전역 인덱스 - 2400",
        'notes': [f'FE 미연결(U32_TV2.static4_mtn start 2400 count {len(FR)}, u32Src 에 idx >= 2400 분기를 static3_a2(2364) 보다 먼저)',
                  'tmv2.py src() 에 i>=2400 -> tv2_static4_mtn 분기 + fe_valid 구간 필요(맵디자이너)', '사용 규칙: docker/maps/tilemap_v2/mtn_tiles_mapping.json'],
        'qa': 'docker/gemini/tileset_v2/art_mtn/art_mtn_qa.json'}
    json.dump(fr, open(os.path.join(TVP, 'manifest_fragment_tv2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('applied')
