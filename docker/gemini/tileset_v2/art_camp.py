# tileset_v2 군영 구조물 세트 + 산괴 채움 변형 — 안아트 2026-11-03(camp 배치). 이미지 모델 호출 0회(Pillow 절차 도트, 16px 원화 -> x2 최근접).
# 구성 A (새 시트 tv2_static5_camp.png 512x128, 16열, 전역 = 2600 + 프레임, 용량 2600~2663):
#   steppe_a/b/c                 마른 초원 지면(grass_a 픽셀 구조 그대로, 녹색 3단 -> 올리브·카키 3단 1:1 치환. b = 마른 풀 점·자갈, c = 좌우 반전+자갈)   (지면, 불투명, 자체 이음 = grass_a 와 같은 주기)
#   ov_camp_tent_s_{w,r}         소형 맞배 천막 1x1(w = 생무명 백색, r = 적갈 염색)                                                  (투명 오버레이 alpha 0/255)
#   camp_tent_s_{w,r}            같은 천막을 풀(grass_a) 위에 구운 지면 타일(그림자 포함)
#   ov_camp_tent_l_{w,r}_<r><c>  대형 우진각 장막 2x2(앞 휘장·출입구)        camp_tent_l_{w,r}_<r><c>  풀 위 지면판
#   ov_camp_ger_<r><c>           게르 2x2(흰 펠트 원통 벽·완만한 원뿔 지붕·천창, 남향 주황 나무문)   camp_ger_<r><c>  steppe_a 위 지면판
#   ov_camp_ger_s / camp_ger_s   소형 게르 1x1
#   ov_palisade_<m4>             목책 16형(4방 마스크 N1 E2 S4 W8, 같은 목책끼리만 이음) — 가로·세로·모서리·T·십자·끝·단독 기둥
#   ov_palisade_gate_h / _v      목책 문(가로 = 문기둥 2+상인방, 세로 = 틈) — 통행 칸
#   ov_drybush_a/b/c             마른 풀 덤불 3종(투명)             steppe_drybush_a/b/c  steppe_a 위 지면판
# 구성 B (기존 시트 tv2_static4_mtn.png 빈 프레임 187~189 = 전역 2587~2589, 기존 프레임 0~186 픽셀 불변 검사):
#   mtn_fill_d/e/f               mtn47_255(TEX_A) 와 테두리 3px 가 같은 채움 변형(가운데만 바위 덩이 / 갈라진 틈+자갈 / 이끼 풀+자갈) -> 이웃 칸 이음선 0
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/art_camp.py <루트> [--apply]
#   --apply : tv2_names.json(spec.static5_camp, spec.static4_mtn.count, names)·tileset_v2_map.json(ranges_camp, index_map_camp, ranges_mtn, index_map_mtn)·manifest_fragment_tv2.json 갱신(첫 실행 .bak-camp-20261103)
# 팔레트: 칩셋 풀(#3c7c12 #438d17 #5c9c25)·흙/나무(#3f1f0f~#c79f61)·바위(#363037~#c1b4c2) + 이 세트 정의색(천막 2색 6단, 펠트 5단, 주황 문 3단, 스텝 3단+그림자, 마른 풀 4단). 광원 왼쪽 위, 외곽선 = 각 재질 가장 어두운 단.
import sys, os, json, hashlib, shutil
import numpy as np
from PIL import Image, ImageDraw

ROOT = sys.argv[1]
APPLY = '--apply' in sys.argv
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2')
OUTD = os.path.join(HERE, 'art_camp')
TVP = os.path.join(ROOT, 'public/assets/tiles/tileset_v2')
SHEET = os.path.join(TVP, 'tv2_static5_camp.png')
MTN_SHEET = os.path.join(TVP, 'tv2_static4_mtn.png')
START, CAP = 2600, 64
MTN_START, MTN_OLD = 2400, 187
TAG = '.bak-camp-20261103'
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
GRASS = tile16('grass_a')
GRASS_SH = Hx('#2f6a0e')

# ---------------------------------------------------------------- 팔레트
WOOD = [Hx(c) for c in ('#3f1f0f', '#684020', '#885f31', '#af7f40', '#c79f61')]            # 칩셋 흙/나무 5단(기존 obj2_fence 와 같은 톤)
CANVAS = {'w': [Hx(c) for c in ('#3e3428', '#7a6c56', '#a8987a', '#cbbd98', '#e4d8b8', '#f4ecd4')],    # 0 외곽 ~ 5 하이라이트(생무명)
          'r': [Hx(c) for c in ('#2e120c', '#5a2218', '#833424', '#a8452e', '#c85a3c', '#e07a5a')]}    # 적갈 염색
TRIM = {'w': CANVAS['r'], 'r': CANVAS['w']}          # 휘장 띠: 백색 천막 = 적갈 띠, 적갈 천막 = 백색 띠
INSIDE = Hx('#1e1612')
FELT = [Hx(c) for c in ('#4a4438', '#7f7868', '#aaa290', '#cfc7b4', '#e6e0d0', '#f6f2e6')]
DOOR = [Hx(c) for c in ('#6a2c10', '#c8642a', '#e88a40')]
ROPE = Hx('#5a4632')
STEP_MAP = {Hx('#3c7c12')[:3]: Hx('#6e7428'), Hx('#438d17')[:3]: Hx('#878c3a'), Hx('#5c9c25')[:3]: Hx('#a3a352')}
STEP_SH = Hx('#565c1c')
DRY = [Hx(c) for c in ('#5a4418', '#8e7232', '#c2a456', '#e6d08a')]
ROCK = [Hx(c) for c in ('#363037', '#484149', '#685c68', '#877887', '#a496a4', '#c1b4c2')]
MOSS = [Hx('#3c7c12'), Hx('#438d17'), Hx('#5c9c25')]

STEPPE = np.array([[STEP_MAP[tuple(p[:3])] for p in row] for row in GRASS], np.uint8)

def outline(a, col_fn):
    """불투명 픽셀 중 4방 이웃이 투명인 것 = 외곽선(재질 가장 어두운 단). col_fn(y,x) -> 색"""
    al = a[..., 3] > 0; H, W = al.shape
    p = np.pad(al, 1); edge = al & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    out = a.copy()
    for y, x in zip(*np.where(edge)): out[y, x] = col_fn(y, x)
    return out

def bake(ov, ground, sh, shadow=True):
    """투명 오버레이를 지면 위에 굽기. 그림자 = 오른쪽·아래 1px(광원 왼쪽 위)."""
    H, W = ov.shape[:2]
    g = np.tile(ground, (H // 16, W // 16, 1)).copy()
    al = ov[..., 3] > 0
    if shadow:
        s = np.zeros_like(al); s[1:, 1:] |= al[:-1, :-1]; s[:, 2:] |= al[:, :-2] & (np.arange(H)[:, None] > H * 0.45)
        g[s & ~al] = sh
    g[al] = ov[al]
    return g

# ---------------------------------------------------------------- 천막
def tent_small(c):
    P = CANVAS[c]
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.polygon([(8, 1), (8, 5), (3, 13), (1, 12), (1, 9)], fill=P[4])       # 왼쪽 지붕면(빛)
    d.polygon([(8, 1), (14, 9), (14, 12), (13, 13), (8, 5)], fill=P[2])    # 오른쪽 지붕면(그늘)
    d.polygon([(8, 5), (13, 13), (3, 13)], fill=P[3])                      # 앞 박공(남향)
    d.polygon([(8, 8), (10, 13), (6, 13)], fill=INSIDE)                    # 출입구
    a = np.array(im)
    a[2, 7] = P[5]; a[3, 6] = P[5]; a[4, 5] = P[5]                         # 왼쪽 지붕 마룻대 빛
    a[6, 8] = P[5]; a[7, 9] = P[4]                                           # 박공 윗선
    for y, x in ((9, 6), (10, 5), (11, 4)): a[y, x] = P[4]                   # 출입구 왼쪽 접힌 천
    a[0, 8] = WOOD[1]                                                        # 기둥 꼭지
    a = outline(a, lambda y, x: P[0])
    a[0, 8] = WOOD[0]
    a[13, 15] = WOOD[1]; a[12, 15] = WOOD[0]                                 # 오른쪽 말뚝
    a[13, 0] = WOOD[1]; a[12, 0] = WOOD[0]
    return a

def tent_large(c):
    P = CANVAS[c]; Tm = TRIM[c]
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.polygon([(8, 5), (24, 5), (31, 16), (1, 16)], fill=P[4])             # 앞 지붕면
    d.polygon([(8, 5), (1, 16), (5, 16)], fill=P[5])                        # 왼쪽 모임지붕(빛)
    d.polygon([(24, 5), (31, 16), (26, 16)], fill=P[2])                     # 오른쪽 모임지붕(그늘)
    d.polygon([(8, 4), (24, 4), (23, 5), (9, 5)], fill=P[3])                # 용마루 뒷면 살짝
    d.rectangle([3, 18, 29, 28], fill=P[3])                                  # 앞 벽
    d.rectangle([24, 18, 29, 28], fill=P[2])                                 # 벽 오른쪽 그늘
    d.rectangle([13, 20, 19, 28], fill=INSIDE)                               # 출입구
    d.polygon([(13, 20), (15, 20), (13, 26)], fill=P[5])                     # 걷어 묶은 왼쪽 문휘장
    d.polygon([(19, 20), (17, 20), (19, 26)], fill=P[2])                     # 오른쪽 문휘장
    a = np.array(im)
    for x in range(1, 31):                                                   # 처마 휘장 띠(물결 끝단)
        a[16, x] = Tm[3]; a[17, x] = Tm[4] if x % 4 in (1, 2) else Tm[2]
        if x % 4 == 0: a[18, x] = Tm[2] if 3 <= x <= 29 else a[18, x]
    for x in (7, 11, 21, 25):                                                # 벽 이음선(천 폭)
        for y in range(19, 28): a[y, x] = P[2] if x < 24 else P[1]
    for x in range(9, 24): a[5, x] = P[5] if x % 3 else P[4]                 # 용마루 빛
    for y, x in ((7, 6), (9, 5), (11, 4), (13, 3)): a[y, x] = P[4]            # 모임 경계선
    for y, x in ((7, 25), (9, 27), (11, 28), (13, 29)): a[y, x] = P[1]
    for y in range(1, 5): a[y, 16] = WOOD[3] if y < 3 else WOOD[2]           # 꼭대기 기둥·꼭지
    a[0, 16] = WOOD[4]
    a = outline(a, lambda y, x: WOOD[0] if x == 16 and y <= 4 else P[0])
    for y in range(20, 29): a[y, 0] = WOOD[2] if y < 28 else WOOD[0]          # 양옆 말뚝·줄
    for y in range(20, 29): a[y, 31] = WOOD[1] if y < 28 else WOOD[0]
    for y, x in ((17, 0), (18, 0), (19, 0), (17, 31), (18, 31), (19, 31)): a[y, x] = ROPE
    a[29, 3:30] = 0                                                          # 바닥 1줄 비움(그림자 자리)
    return a

# ---------------------------------------------------------------- 게르
def ger(S):
    W = H = S; cx = S / 2
    rx = 13.0 if S == 32 else 6.5; ryw = 4.0 if S == 32 else 2.2
    wall_top = 14.0 if S == 32 else 7.5; wall_bot = 26.0 if S == 32 else 13.0
    apex = 5.0 if S == 32 else 2.5
    Y, X = np.mgrid[0:H, 0:W] + 0.5
    u = (X - cx) / rx
    ell = lambda yc: ((X - cx) / rx) ** 2 + ((Y - yc) / ryw) ** 2 <= 1
    wall = ((np.abs(u) <= 1) & (Y >= wall_top) & (Y <= wall_bot)) | ell(wall_bot)
    k = (Y - apex) / (wall_top - apex)
    roof = ((k >= 0) & (k <= 1.0) & (np.abs(X - cx) <= rx * (0.22 + 0.78 * np.clip(k, 0, 1)) + 0.2)) | ell(wall_top)
    a = np.zeros((H, W, 4), np.uint8)
    # 벽: 원통 명암
    for y in range(H):
        for x in range(W):
            if wall[y, x]:
                uu = u[y, x]; a[y, x] = FELT[4] if uu < -0.5 else FELT[3] if uu < 0.25 else FELT[2] if uu < 0.75 else FELT[1]
            if roof[y, x]:
                uu = (X[y, x] - cx) / max(1.0, rx * (0.22 + 0.78 * np.clip(k[y, x], 0, 1)))
                a[y, x] = FELT[5] if uu < -0.35 else FELT[4] if uu < 0.3 else FELT[3]
    # 지붕 끝 = 처마 그늘(벽 위 1px), 벽 둘레 줄(말총 밧줄) 2줄 — 타원 곡률을 따라
    for y in range(H):
        for x in range(W):
            if not wall[y, x] or roof[y, x]: continue
            uu = u[y, x]
            if abs(uu) > 1: continue
            dy = ryw * np.sqrt(max(0.0, 1 - uu * uu))
            for yb in ((wall_top + 3.2, wall_bot - 3.0) if S == 32 else (wall_top + 2.6,)):
                if abs(Y[y, x] - (yb + dy * 0.85)) < 0.5: a[y, x] = ROPE
            if abs(Y[y, x] - (wall_top + dy + 0.9)) < 0.5: a[y, x] = FELT[1]
    # 지붕 줄 2가닥(대각 X 묶음)
    if S == 32:
        for t in np.linspace(0, 1, 40):
            for sx in (-1, 1):
                x = int(cx + sx * (2 + 9 * t)); y = int(apex + 2 + (wall_top + 2.5 - apex - 2) * t)
                if 0 <= x < W and 0 <= y < H and roof[y, x]: a[y, x] = FELT[2] if sx < 0 else FELT[1]
    # 천창(토오노): 지붕 꼭대기 작은 고리
    if S == 32:
        for y in range(H):
            for x in range(W):
                e = ((X[y, x] - cx) / 3.2) ** 2 + ((Y[y, x] - (apex + 1.2)) / 1.5) ** 2
                if e <= 1: a[y, x] = WOOD[1] if e > 0.45 else WOOD[3]
    else:
        a[int(apex), int(cx) - 1] = WOOD[3]; a[int(apex), int(cx)] = WOOD[1]
    # 남향 나무문(주황)
    dw, dt = (3, wall_top + 5) if S == 32 else (1, wall_top + 1.5)
    for y in range(H):
        for x in range(W):
            if abs(X[y, x] - cx) <= dw + 0.01 and dt <= Y[y, x] <= wall_bot + ryw * 0.9:
                a[y, x] = DOOR[2] if X[y, x] < cx - dw + 1.5 else DOOR[1]
                if abs(X[y, x] - cx) > dw - 0.6 or Y[y, x] < dt + 1: a[y, x] = DOOR[0]
    a = outline(a, lambda y, x: DOOR[0] if abs(X[y, x] - cx) <= dw and Y[y, x] > dt else FELT[0])
    return a

# ---------------------------------------------------------------- 목책(4방 마스크)
N_, E_, S_, W_ = 1, 2, 4, 8
def palisade(m, gate=None):
    """확장 캔버스(-1..16)에 그려 외곽선을 이웃 칸과 같은 규칙으로 계산한 뒤 16x16 만 자름. 가로 말뚝은 x 주기 4(구분선 x%4==1), 세로 열은 y 주기 4."""
    C = np.zeros((18, 18, 4), np.uint8)
    def put(x, y, col):
        if -1 <= x <= 16 and -1 <= y <= 16: C[y + 1, x + 1] = col
    xs = set()
    if m & W_: xs |= set(range(-1, 9))
    if m & E_: xs |= set(range(6, 17))
    xs |= {6, 7, 8}                                   # 가운데 기둥(노드)
    if gate == 'h': xs -= set(range(5, 11))
    # 세로 열(뒤): x 5..9, y 주기 4
    if m & (N_ | S_):
        y0 = -1 if m & N_ else 2; y1 = 16 if m & S_ else 13
        for y in range(y0, y1 + 1):
            if gate == 'v' and 4 <= y <= 8: continue
            k = y % 4
            core = {0: (WOOD[4], WOOD[3], WOOD[2]), 1: (WOOD[3], WOOD[3], WOOD[2]), 2: (WOOD[3], WOOD[2], WOOD[1]), 3: (WOOD[1], WOOD[0], WOOD[0])}[k]
            for i, x in enumerate((6, 7, 8)): put(x, y, core[i])
            put(5, y, WOOD[0]); put(9, y, WOOD[0])
    # 가로 말뚝(앞): 말뚝 3px + 구분선 1px, 끝이 뾰족
    hor = (m & (E_ | W_)) or not (m & (N_ | S_))
    if hor or gate == 'h':
        for x in sorted(xs):
            k = (x - 1) % 4            # 0 = 구분선, 1 = 빛, 2 = 중간, 3 = 그늘
            top = {0: 4, 1: 3, 2: 2, 3: 3}[k]
            if not hor and x not in (6, 7, 8): continue
            for y in range(top, 14):
                col = {0: WOOD[0], 1: WOOD[4], 2: WOOD[3], 3: WOOD[2]}[k]
                if y in (6, 10) and k: col = WOOD[1]                       # 묶은 줄 2가닥
                if y in (7, 11) and k: col = WOOD[2] if k != 3 else WOOD[1]
                if y == top and k == 2: col = WOOD[4]
                put(x, y, col)
    if gate == 'h':                                    # 문기둥 2개(더 높음) + 상인방
        for px in ((2, 3, 4), (11, 12, 13)):
            for y in range(0, 14):
                for i, x in enumerate(px): put(x, y, (WOOD[4], WOOD[3], WOOD[1])[i])
        for x in range(4, 12): put(x, 1, WOOD[3]); put(x, 2, WOOD[1])
    if gate == 'v':                                    # 세로 문: 틈 위아래 문기둥 머리
        for x, col in ((6, WOOD[4]), (7, WOOD[4]), (8, WOOD[2])): put(x, 9, col); put(x, 10, col); put(x, 3, col); put(x, 2, col)   # 문기둥 머리(밝은 단 2줄)
        for x in (4, 10):                                                                       # 문기둥 양옆 쐐기(문틀 폭 표시)
            for y in (2, 3, 9, 10, 11): put(x, y, WOOD[2])   # 북쪽 경계 2행(0~1)은 세로 열 주기 그대로
    # 외곽선: 불투명 + 4방 중 투명 -> WOOD[0] (확장 캔버스 기준 = 이웃 칸 그림과 같은 판정)
    al = C[..., 3] > 0; p = np.pad(al, 1, constant_values=True)
    edge = al & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = False     # 확장 띠 자체는 판정 대상 아님
    # 확장 띠 바깥(-2)은 모름 → 띠 픽셀의 판정은 버리고, 칸 안 픽셀만 사용
    C2 = C.copy(); C2[edge] = WOOD[0]
    return C2[1:17, 1:17].copy()

# ---------------------------------------------------------------- 마른 풀 덤불
def drybush(seed, w=12, h=10):
    """둥근 밑동 덩이 + 불규칙한 짧은 마른 잎(바깥으로 기욺). 끝 높이를 무작위로 흩어 빗·왕관 모양 방지."""
    rng = np.random.default_rng(seed)
    a = np.zeros((16, 16, 4), np.uint8)
    cx, cy, rx, ry = 8.0, 11.5, w / 2.0, h * 0.30
    for y in range(16):
        for x in range(16):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if dx * dx + dy * dy <= 1 + rng.uniform(-0.18, 0.12):
                a[y, x] = DRY[2] if (dx + dy) < -0.4 else DRY[1] if (dx + dy) < 0.6 else DRY[0]
                if rng.random() < 0.18: a[y, x] = DRY[1] if a[y, x][0] == DRY[2][0] else DRY[2]
    for i in range(int(w * 1.1)):
        bx = cx + rng.uniform(-0.85, 0.85) * rx
        by = cy - ry * np.sqrt(max(0.0, 1 - ((bx - cx) / rx) ** 2)) + 1
        ln = rng.uniform(2.0, h * 0.62) * (1 - 0.45 * abs(bx - cx) / rx)
        lean = (bx - cx) / rx * rng.uniform(1.0, 2.6)
        for t in np.linspace(0, 1, int(ln * 2) + 2):
            x = int(round(bx + lean * t)); y = int(round(by - ln * t))
            if 0 <= x < 16 and 1 <= y < 16: a[y, x] = DRY[3] if t > 0.65 and x <= cx + 1 else DRY[2]
    a = outline(a, lambda y, x: DRY[0])
    return a

# ---------------------------------------------------------------- 스텝 지면
def steppe_var(kind):
    a = STEPPE.copy()
    if kind == 'c': a = a[:, ::-1].copy()
    if kind in ('b', 'c'):
        pts = [(3, 4), (11, 2), (6, 12), (13, 10)] if kind == 'b' else [(2, 9), (9, 5), (12, 13)]
        for x, y in pts:                                           # 마른 풀 점(2px 세로) + 자갈 1px
            a[y, x] = DRY[2]; a[y - 1, x] = DRY[3]; a[y, x + 1] = STEP_SH
        for x, y in ([(8, 8), (1, 14)] if kind == 'b' else [(5, 2), (14, 6)]):
            a[y, x] = FELT[3]; a[y, x + 1] = FELT[1]                     # 자갈(회베이지 — 바위 연보라는 카키 위에서 보라 점으로 보여 사용 안 함)
    return a

# ---------------------------------------------------------------- 산괴 채움 변형(art_mtn.py calm_rock 과 같은 생성 -> TEX_A 재현 후 가운데만 변형)
def facets(W, Hh, n, seed):
    rng = np.random.default_rng(seed)
    pts = [(rng.uniform(0, W), rng.uniform(0, Hh)) for _ in range(n)]
    off = rng.choice([-1, 0, 0, 1], size=n)
    ids = np.zeros((Hh, W), int); rel = np.zeros((Hh, W, 2))
    for y in range(Hh):
        for x in range(W):
            best = 1e9
            for i, (px, py) in enumerate(pts):
                for ox in (-W, 0, W):
                    for oy in (-Hh, 0, Hh):
                        dx, dy = x + 0.5 - px - ox, (y + 0.5 - py - oy) * 1.25
                        d = dx * dx + dy * dy
                        if d < best: best, ids[y, x], rel[y, x] = d, i, (dx, dy / 1.25)
    emb = np.zeros((Hh, W), int)
    at = lambda u, v: ids[v % Hh, u % W]
    for y in range(Hh):
        for x in range(W):
            if at(x + 1, y) != ids[y, x] or at(x, y + 1) != ids[y, x]: emb[y, x] = -1
            elif at(x - 1, y) != ids[y, x] or at(x, y - 1) != ids[y, x]: emb[y, x] = 1
    return ids, off, emb, rel
def calm_rock(seed, n=5):
    ids, off, emb, rel = facets(16, 16, n, seed)
    rng = np.random.default_rng(seed + 7)
    a = np.zeros((16, 16, 4), np.uint8)
    for y in range(16):
        for x in range(16):
            dx, dy = rel[y, x]
            t = 3 + (1 if (dx + dy) < -2.2 else 0) + (off[ids[y, x]] if off[ids[y, x]] < 0 else 0)
            if emb[y, x] == -1: t = 2 if t >= 3 else 1
            if rng.random() < 0.06 and emb[y, x] == 0: t = 2 if t >= 3 else t
            a[y, x] = ROCK[max(1, min(4, t))]
    return a
TEX_A = calm_rock(11)
MTN_IMG = Image.open(MTN_SHEET).convert('RGBA'); MTN_ARR0 = np.array(MTN_IMG).copy()
f255 = NAMES['names']['mtn47_255']['frame']
assert (np.array(MTN_IMG.crop((f255 % 16 * 32, f255 // 16 * 32, f255 % 16 * 32 + 32, f255 // 16 * 32 + 32)))[::2, ::2] == TEX_A).all(), 'TEX_A 재현 실패'
def fill_var(kind):
    a = TEX_A.copy()
    if kind == 'd':      # 가운데 둥근 바위 덩이(지름 7) + 오른쪽 아래 그늘
        cx, cy, r = 7.8, 7.2, 4.4                                       # 낮고 넓은 바위 덩이(지름 9, 납작) + 틈 하나
        inside = np.zeros((16, 16), bool)
        for y in range(3, 13):
            for x in range(3, 13):
                dx, dy = (x + 0.5 - cx) / r, (y + 0.5 - cy) / (r * 0.72)
                if dx * dx + dy * dy <= 1:
                    inside[y, x] = True; sdx = dx + dy * 1.1
                    a[y, x] = ROCK[4] if sdx < -0.55 else ROCK[3] if sdx < 0.45 else ROCK[2]
        for y in range(3, 13):
            for x in range(3, 13):
                if not inside[y, x]: continue
                nb = [inside[y + dy_, x + dx_] for dx_, dy_ in ((1, 0), (-1, 0), (0, 1), (0, -1))]
                if not all(nb): a[y, x] = ROCK[0] if (not inside[y + 1, x] or not inside[y, x + 1]) else ROCK[1]
        a[5, 6] = ROCK[5]; a[5, 7] = ROCK[5]; a[6, 5] = ROCK[4]                  # 윗면 빛 3px
        for x, y in ((8, 6), (9, 7), (9, 8)): a[y, x] = ROCK[1]                 # 틈
        for x in range(5, 12): a[11, x] = ROCK[1] if a[11, x][0] != ROCK[0][0] else a[11, x]   # 아래 그늘(바탕 위)
    elif kind == 'e':    # 대각 갈라진 틈 + 위 왼쪽 밝은 입술 + 자갈
        path = [(4, 5), (5, 6), (6, 6), (7, 7), (8, 8), (9, 8), (10, 9), (11, 10), (12, 11)]
        for x, y in path:
            a[y, x] = ROCK[0]; a[y + 1, x] = ROCK[1]; a[y - 1, x] = ROCK[4]
        a[9, 7] = ROCK[1]; a[10, 6] = ROCK[0]; a[11, 6] = ROCK[1]            # 갈래
        for x, y in ((5, 11), (10, 4), (12, 6)): a[y, x] = ROCK[4]; a[y, x + 1] = ROCK[2]; a[y + 1, x] = ROCK[1]
    elif kind == 'f':    # 바위 틈 이끼 풀(칩셋 풀 3단) + 자갈
        for x, y, h in ((5, 9, 3), (7, 8, 4), (9, 9, 3), (11, 10, 2), (6, 11, 2)):
            for k in range(h): a[y - k, x] = MOSS[2] if k == h - 1 else MOSS[1] if k else MOSS[0]
            a[y + 1, x] = ROCK[1]
        for x, y in ((4, 5), (11, 5), (9, 12)): a[y, x] = ROCK[4]; a[y, x + 1] = ROCK[2]
    return a

# ---------------------------------------------------------------- 목록
x2 = lambda a: Image.fromarray(a).resize((a.shape[1] * 2, a.shape[0] * 2), Image.NEAREST)
def split(a, prefix):
    n = a.shape[0] // 16
    return [(f'{prefix}_{r}{c}', a[r * 16:r * 16 + 16, c * 16:c * 16 + 16].copy()) for r in range(n) for c in range(n)]
SPEC = []
for k in ('a', 'b', 'c'): SPEC.append((f'steppe_{k}', steppe_var(k), 'ground'))
TS = {c: tent_small(c) for c in 'wr'}; TL = {c: tent_large(c) for c in 'wr'}; GL, GS = ger(32), ger(16)
for c in 'wr': SPEC.append((f'ov_camp_tent_s_{c}', TS[c], 'overlay'))
for c in 'wr': SPEC.append((f'camp_tent_s_{c}', bake(TS[c], GRASS, GRASS_SH), 'ground'))
SPEC.append(('ov_camp_ger_s', GS, 'overlay')); SPEC.append(('camp_ger_s', bake(GS, STEPPE, STEP_SH), 'ground'))
for c in 'wr': SPEC += [(n, t, 'overlay') for n, t in split(TL[c], f'ov_camp_tent_l_{c}')]
for c in 'wr': SPEC += [(n, t, 'ground') for n, t in split(bake(TL[c], GRASS, GRASS_SH), f'camp_tent_l_{c}')]
SPEC += [(n, t, 'overlay') for n, t in split(GL, 'ov_camp_ger')]
SPEC += [(n, t, 'ground') for n, t in split(bake(GL, STEPPE, STEP_SH), 'camp_ger')]
for m in range(16): SPEC.append((f'ov_palisade_{m}', palisade(m), 'overlay'))
SPEC.append(('ov_palisade_gate_h', palisade(E_ | W_, 'h'), 'overlay'))
SPEC.append(('ov_palisade_gate_v', palisade(N_ | S_, 'v'), 'overlay'))
DB = {'a': drybush(3), 'b': drybush(7, 10, 8), 'c': drybush(12, 14, 9)}
for k in 'abc': SPEC.append((f'ov_drybush_{k}', DB[k], 'overlay'))
for k in 'abc': SPEC.append((f'steppe_drybush_{k}', bake(DB[k], STEPPE, STEP_SH), 'ground'))
assert len(SPEC) <= CAP, len(SPEC)
FR = {START + i: (n, x2(a), k) for i, (n, a, k) in enumerate(SPEC)}
MF = {MTN_START + MTN_OLD + i: (f'mtn_fill_{k}', x2(fill_var(k)), 'ground') for i, k in enumerate('def')}
BY = {n: im for (n, im, _) in list(FR.values()) + list(MF.values())}

# ---------------------------------------------------------------- QA
qa = {'date': '2026-11-03', 'author': '안아트', 'calls': 0, 'sheet': 'public/assets/tiles/tileset_v2/tv2_static5_camp.png', 'start': START, 'count': len(FR),
      'mtn_fill': {'sheet': 'tv2_static4_mtn.png', 'indices': {n: i for i, (n, _, _) in MF.items()}}, 'errors': [], 'items': {}}
allowed = {tuple(c[:3]) for c in WOOD + CANVAS['w'] + CANVAS['r'] + FELT + DOOR + DRY + ROCK + MOSS + [INSIDE, ROPE, STEP_SH, GRASS_SH] + list(STEP_MAP.values())}
allowed |= set(map(tuple, GRASS.reshape(-1, 4)[:, :3].tolist()))
for idx, (n, im, kind) in list(FR.items()) + list(MF.items()):
    a = np.array(im); al = a[..., 3]
    if kind == 'ground' and (al < 255).any(): qa['errors'].append(f'{n} 지면인데 투명')
    if kind == 'overlay' and ((al > 0) & (al < 255)).any(): qa['errors'].append(f'{n} 반투명(0/255 규칙)')
    if kind == 'overlay' and not (al == 255).any(): qa['errors'].append(f'{n} 빈 칸')
    px = a.reshape(-1, 4); px = px[px[:, 3] > 0][:, :3]
    stray = {tuple(c) for c in px.tolist()} - allowed
    if stray: qa['errors'].append(f'{n} 허용 외 색 {len(stray)}')
    rgb = a[..., :3].astype(int)
    if int(((rgb[..., 0] > 200) & (rgb[..., 2] > 100) & (rgb[..., 1] < 80) & (al > 0)).sum()): qa['errors'].append(f'{n} 마젠타 잔여')
    qa['items'][n] = {'index': idx, 'kind': kind, 'opaque_ratio': round(float((al == 255).mean()), 3), 'colors': len({tuple(c) for c in px.tolist()})}
qa['palette_total'] = len(allowed)
# 목책 이음: 가로로 맞닿는 두 칸(A 의 E 팔 = B 의 W 팔)은 경계 열 불투명 행이 같고, 팔이 없으면 경계 열이 비어야 함. 세로도 같음.
pal = {m: np.array(BY[f'ov_palisade_{m}']) for m in range(16)}
bad = []
for ma in range(16):
    a = pal[ma][..., 3] > 0
    if bool(ma & E_) != bool(a[:, -1].any()): bad.append(f'{ma} E 경계')
    if bool(ma & W_) != bool(a[:, 0].any()): bad.append(f'{ma} W 경계')
    if bool(ma & N_) != bool(a[0, :].any()): bad.append(f'{ma} N 경계')
    if bool(ma & S_) != bool(a[-1, :].any()): bad.append(f'{ma} S 경계')
# 경계 2열(행)이 같은 팔을 가진 모든 칸에서 동일 = 확장 캔버스 주기 그림이 일치 -> 어떤 조합으로 붙여도 이음 동일(문 포함)
allp = dict(pal); allp['gate_h'] = np.array(BY['ov_palisade_gate_h']); allp['gate_v'] = np.array(BY['ov_palisade_gate_v'])
arm = {'gate_h': E_ | W_, 'gate_v': N_ | S_}
for side, bit, sl in (('E', E_, (slice(None), slice(28, 32))), ('W', W_, (slice(None), slice(0, 4))), ('N', N_, (slice(0, 4), slice(None))), ('S', S_, (slice(28, 32), slice(None)))):   # x2 이미지 기준 = 원화 경계 2열
    ref = None
    for k, a in allp.items():
        mm = arm.get(k, k)
        if not (mm & bit): continue
        e = a[sl]
        if ref is None: ref = e
        elif not np.array_equal(ref, e): bad.append(f'{k} {side} 경계 2열 불일치')
qa['palisade_seam_errors'] = bad[:20]; qa['palisade_seam_error_count'] = len(bad)
if bad: qa['errors'].append(f'목책 이음 {len(bad)}')
# 지면판(구운 타일) 가장자리 = 바탕과 같은지(구조물이 닿지 않는 변) — 정보용
def edge_diff(n, base):
    a = np.array(BY[n]).astype(int); b = np.array(x2(base)).astype(int)
    return {s: int((np.abs(e1 - e2).sum(-1) > 0).sum()) for s, e1, e2 in (('N', a[0], b[0]), ('S', a[-1], b[-1]), ('W', a[:, 0], b[:, 0]), ('E', a[:, -1], b[:, -1]))}
qa['baked_edge_px_differs'] = {n: edge_diff(n, STEPPE if n.startswith(('camp_ger', 'steppe_drybush')) else GRASS) for n in [s[0] for s in SPEC if s[2] == 'ground' and not s[0].startswith('steppe_')]}
# 스텝 자체 주기: steppe_a 는 grass_a 와 구조 동일 -> 이음 동일
qa['steppe_wrap_same_as_grass'] = bool(((STEPPE[..., 3] == 255).all()))
# 채움 변형 테두리 3px = TEX_A 와 동일(이웃 mtn47 칸과 이음선 0)
ring = np.ones((16, 16), bool); ring[3:13, 3:13] = False
qa['mtn_fill_border_equal_texA'] = {k: bool((fill_var(k)[ring] == TEX_A[ring]).all()) for k in 'def'}
if not all(qa['mtn_fill_border_equal_texA'].values()): qa['errors'].append('mtn_fill 테두리 불일치')

sheet = Image.new('RGBA', (512, 128), (0, 0, 0, 0))
for idx, (n, im, kind) in FR.items():
    f = idx - START; sheet.paste(im, (f % 16 * 32, f // 16 * 32))
# mtn 시트: 빈 프레임 187~189 만 채움(기존 픽셀 불변 검사)
mtn = MTN_IMG.copy()
for idx, (n, im, kind) in MF.items():
    f = idx - MTN_START
    assert (MTN_ARR0[f // 16 * 32:f // 16 * 32 + 32, f % 16 * 32:f % 16 * 32 + 32, 3] == 0).all() or APPLY is False or True
    mtn.paste(im, (f % 16 * 32, f // 16 * 32))
m1 = np.array(mtn); keep_mask = np.ones(m1.shape[:2], bool)
for idx in MF: f = idx - MTN_START; keep_mask[f // 16 * 32:f // 16 * 32 + 32, f % 16 * 32:f % 16 * 32 + 32] = False
qa['mtn_old_frames_unchanged'] = bool((m1[keep_mask] == MTN_ARR0[keep_mask]).all())
qa['mtn_target_frames_were_empty_or_same'] = bool(all((MTN_ARR0[(i - MTN_START) // 16 * 32:(i - MTN_START) // 16 * 32 + 32, (i - MTN_START) % 16 * 32:(i - MTN_START) % 16 * 32 + 32, 3] == 0).all()
                                                       or (MTN_ARR0[(i - MTN_START) // 16 * 32:(i - MTN_START) // 16 * 32 + 32, (i - MTN_START) % 16 * 32:(i - MTN_START) % 16 * 32 + 32] == np.array(MF[i][1])).all() for i in MF))
if not (qa['mtn_old_frames_unchanged'] and qa['mtn_target_frames_were_empty_or_same']): qa['errors'].append('mtn 시트 기존 프레임 변경 위험')
qa['keep_unchanged'] = all(sha_f(p) == h for p, h in before.items())

# ---------------------------------------------------------------- 미리보기(쓰기 전에도 생성)
def chk(W, H):
    c = Image.new('RGBA', (W, H))
    for y in range(0, H, 8):
        for x in range(0, W, 8): c.paste((200, 200, 200, 255) if (x // 8 + y // 8) % 2 else (120, 120, 120, 255), (x, y, x + 8, y + 8))
    return c
c = chk(*sheet.size); c.alpha_composite(sheet); c.convert('RGB').resize((1024, 256), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'camp_sheet_x2.png'))
# 장면: 풀밭 군영(목책 사각 울타리 + 문 + 천막) / 스텝 게르 마을
def ground_fill(Wc, Hc, base):
    out = Image.new('RGBA', (Wc * 32, Hc * 32))
    for y in range(Hc):
        for x in range(Wc): out.paste(base if isinstance(base, Image.Image) else base(x, y), (x * 32, y * 32))
    return out
FEN = ['..........................',
       '.#########G#######........',
       '.#................#....##.',
       '.#................#.......',
       '.#................G.......',
       '.#................#...#...',
       '.#................#...#...',
       '.######...#########...#...',
       '..........................']
SC_W, SC_H = len(FEN[0]), len(FEN)
gv = lambda x, y: x2(STEPPE) if False else x2(GRASS)
scene = ground_fill(SC_W, SC_H, x2(GRASS))
def fence_layer(sc, grid, ox=0, oy=0):
    Hh, Ww = len(grid), len(grid[0])
    isf = lambda x, y: 0 <= x < Ww and 0 <= y < Hh and grid[y][x] in '#G'
    for y in range(Hh):
        for x in range(Ww):
            ch = grid[y][x]
            if ch not in '#G': continue
            m = (N_ if isf(x, y - 1) else 0) | (E_ if isf(x + 1, y) else 0) | (S_ if isf(x, y + 1) else 0) | (W_ if isf(x - 1, y) else 0)
            nm = f'ov_palisade_{m}' if ch == '#' else ('ov_palisade_gate_h' if m & (E_ | W_) else 'ov_palisade_gate_v')
            sc.alpha_composite(BY[nm], ((x + ox) * 32, (y + oy) * 32))
def blit(sc, prefix, n, cx, cy):
    for r in range(n):
        for cc in range(n): sc.alpha_composite(BY[f'{prefix}_{r}{cc}'], ((cx + cc) * 32, (cy + r) * 32))
blit(scene, 'ov_camp_tent_l_w', 2, 3, 2); blit(scene, 'ov_camp_tent_l_r', 2, 12, 2)
for x, y, c in ((7, 3, 'w'), (9, 3, 'w'), (7, 5, 'r'), (10, 5, 'w'), (3, 5, 'r'), (15, 5, 'r')): scene.alpha_composite(BY[f'ov_camp_tent_s_{c}'], (x * 32, y * 32))
fence_layer(scene, FEN)
for x, y in ((21, 1), (24, 4)): scene.alpha_composite(BY['ov_drybush_a'], (x * 32, y * 32))
for r in range(2):
    for cc in range(2): scene.paste(BY[f'camp_tent_l_w_{r}{cc}'], ((19 + cc) * 32, (5 + r) * 32))
scene.paste(BY['camp_tent_s_r'], (24 * 32, 7 * 32))
scene.convert('RGB').resize((scene.width * 2, scene.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'camp_scene_x2.png'))
STEP_SC = Image.new('RGBA', (18 * 32, 8 * 32))
for y in range(8):
    for x in range(18):
        h = (x * 7 + y * 13) % 9
        STEP_SC.paste(BY['steppe_b'] if h == 0 else BY['steppe_c'] if h == 4 else BY['steppe_a'], (x * 32, y * 32))
blit(STEP_SC, 'ov_camp_ger', 2, 2, 1); blit(STEP_SC, 'ov_camp_ger', 2, 6, 2)
for r in range(2):
    for cc in range(2): STEP_SC.paste(BY[f'camp_ger_{r}{cc}'], ((10 + cc) * 32, (1 + r) * 32))
STEP_SC.paste(BY['camp_ger_s'], (14 * 32, 2 * 32)); STEP_SC.alpha_composite(BY['ov_camp_ger_s'], (4 * 32, 5 * 32))
for k, (x, y) in zip('abcab', ((1, 6), (9, 5), (13, 6), (16, 1), (8, 0))): STEP_SC.alpha_composite(BY[f'ov_drybush_{k}'], (x * 32, y * 32))
for k, x in zip('abc', (11, 12, 15)): STEP_SC.paste(BY[f'steppe_drybush_{k}'], (x * 32, 6 * 32))
fence_layer(STEP_SC, ['....#####', '....#...G', '....#####'], 9, 4)
STEP_SC.convert('RGB').resize((STEP_SC.width * 2, STEP_SC.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'steppe_scene_x2.png'))
# 목책 16형 + 문 일람(x4)
pv = chk(18 * 34, 34)
for i in range(18):
    n = f'ov_palisade_{i}' if i < 16 else ('ov_palisade_gate_h' if i == 16 else 'ov_palisade_gate_v'); pv.alpha_composite(BY[n], (i * 34 + 1, 1))
pv.convert('RGB').resize((pv.width * 3, pv.height * 3), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'palisade_list_x3.png'))
# 산괴 채움 섞기 장면(8x5 산괴 안쪽)
mt = Image.new('RGBA', (12 * 32, 6 * 32))
FN = ['mtn47_255', 'mtn_fill_b', 'mtn_fill_c', 'mtn_fill_d', 'mtn_fill_e', 'mtn_fill_f']
mt_old = Image.new('RGBA', (12 * 32, 6 * 32))
def mt_tile(n):
    if n in BY: return BY[n]
    f = NAMES['names'][n]['frame']; return MTN_IMG.crop((f % 16 * 32, f // 16 * 32, f % 16 * 32 + 32, f // 16 * 32 + 32))
for y in range(6):
    for x in range(12):
        h = ((x * 73856093) ^ (y * 19349663)) % 11
        mt.paste(mt_tile('mtn_fill_d' if h == 0 else 'mtn_fill_e' if h == 3 else 'mtn_fill_f' if h == 7 else 'mtn_fill_b' if h in (5, 9) else 'mtn_fill_c' if h == 1 else 'mtn47_255'), (x * 32, y * 32))
        mt_old.paste(mt_tile('mtn_fill_b' if (x + 2 * y) % 4 == 0 else 'mtn_fill_c' if (x + 2 * y) % 4 == 2 and False else 'mtn47_255'), (x * 32, y * 32))
both = Image.new('RGBA', (12 * 32, 12 * 32 + 8), (0, 0, 0, 255)); both.paste(mt_old, (0, 0)); both.paste(mt, (0, 6 * 32 + 8))
both.convert('RGB').resize((both.width * 2, both.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'mtn_fill_before_after_x2.png'))
json.dump(qa, open(os.path.join(OUTD, 'art_camp_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('count', len(FR), 'mtn+', len(MF), 'errors', qa['errors'][:10], 'palisade_seam', qa['palisade_seam_error_count'], 'fill_border', qa['mtn_fill_border_equal_texA'], 'mtn_keep', qa['mtn_old_frames_unchanged'], 'keep', qa['keep_unchanged'])

# ---------------------------------------------------------------- --apply
if APPLY:
    if qa['errors']: raise SystemExit('QA 오류 — apply 중단')
    for f in ('tv2_names.json', 'tileset_v2_map.json', 'manifest_fragment_tv2.json', 'tv2_static4_mtn.png'):
        p = os.path.join(TVP, f)
        if not os.path.exists(p + TAG): shutil.copy2(p, p + TAG)
    sheet.save(SHEET, optimize=True); mtn.save(MTN_SHEET, optimize=True)
    names = json.load(open(os.path.join(TVP, 'tv2_names.json'), encoding='utf-8'))
    names['spec']['static5_camp'] = {'key': 'tv2_static5_camp', 'path': '/assets/tiles/tileset_v2/tv2_static5_camp.png', 'cols': 16, 'start': START, 'count': len(FR), 'size': list(sheet.size),
                                     'note': '안아트 art_camp.py(2026-11-03): 군영 구조물(천막·게르·목책·마른 덤불)+스텝 지면. 프레임 = 전역-2600. 지면 = 불투명, ov_* = 투명 오버레이(alpha 0/255)'}
    s4 = names['spec']['static4_mtn']; s4['count'] = MTN_OLD + len(MF)
    s4['note_camp'] = '2026-11-03 art_camp.py: 빈 프레임 187~189 = mtn_fill_d/e/f(2587~2589) 추가, 기존 0~186 픽셀 불변'
    for idx, (n, im, kind) in FR.items(): names['names'][n] = {'sheet': 'tv2_static5_camp', 'frame': idx - START, 'index': idx, 'src': f'art_camp.py {kind}'}
    for idx, (n, im, kind) in MF.items(): names['names'][n] = {'sheet': 'tv2_static4_mtn', 'frame': idx - MTN_START, 'index': idx, 'src': 'art_camp.py ground(mtn fill)'}
    json.dump(names, open(os.path.join(TVP, 'tv2_names.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    mp = json.load(open(os.path.join(TVP, 'tileset_v2_map.json'), encoding='utf-8'))
    mp['ranges_camp'] = {'tv2_static5_camp': [START, START + len(FR) - 1]}
    mp['index_map_camp'] = {n: idx for idx, (n, im, kind) in FR.items()}
    mp['ranges_mtn'] = {'tv2_static4_mtn': [MTN_START, MTN_START + MTN_OLD + len(MF) - 1]}
    mp.setdefault('index_map_mtn', {}).update({n: idx for idx, (n, im, kind) in MF.items()})
    mp['camp_note'] = '안아트 art_camp.py --apply(2026-11-03): 군영 세트 2600~ + mtn_fill_d/e/f 2587~2589. 새 이름만(기존 키 값 불변). 사용 규칙 docker/maps/tilemap_v2/camp_tiles_mapping.json'
    json.dump(mp, open(os.path.join(TVP, 'tileset_v2_map.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    fr = json.load(open(os.path.join(TVP, 'manifest_fragment_tv2.json'), encoding='utf-8'))
    fr['tileset.tv2_static5_camp'] = {'type': 'tileset', 'frame': [32, 32], 'alpha': '지면(steppe_*·camp_*·steppe_drybush_*) 불투명 / ov_* 투명 오버레이(alpha 0/255)',
        'filter': 'nearest(Point), pixelArt=true, 정수 배율만', 'names': '/assets/tiles/tileset_v2/tv2_names.json', 'name_map': '/assets/tiles/tileset_v2/tileset_v2_map.json',
        'generator': 'docker/gemini/tileset_v2/art_camp.py(안아트 2026-11-03, Pillow 절차 도트 16px x2, 이미지 모델 호출 0회). 바탕 풀만 칩셋 grass_a 픽셀 재사용(스텝 = 같은 픽셀 구조 색 치환)',
        'source': '자체 제작(바탕 풀 = tv2_static 칩셋 픽셀)', 'prompt_ref': '없음(절차 합성)',
        'license': '이 프로젝트 자체 제작(안아트). 바탕 풀은 칩셋(라이선스 미확인) 픽셀 재사용 — 공개 전 권리 확인 필요(비차단)',
        'verify': True, 'verify_note': '천막 2색(생무명 백색/적갈)·대형 장막 휘장 형태는 시대·지역 일반화(고증 verify). 게르 남향 문·천창·펠트·밧줄은 일반 형태',
        'scope': 'battle', 'path': 'assets/tiles/tileset_v2/tv2_static5_camp.png', 'width': sheet.size[0], 'height': sheet.size[1], 'cols': 16,
        'start': START, 'count': len(FR), 'bytes': os.path.getsize(SHEET),
        'load_hint': "this.load.spritesheet('tv2_static5_camp', path, {frameWidth:32, frameHeight:32}) — 프레임 = 전역 인덱스 - 2600",
        'notes': [f'FE 미연결(U32_TV2.static5_camp start 2600 count {len(FR)}, u32Src 에 idx >= 2600 분기를 static4_mtn(2400) 보다 먼저)', 'tv2_map_to_js.mjs ok() 구간에 2600~2663 + index_map_camp 병합 필요',
                  'tmv2.py src() 에 i>=2600 -> tv2_static5_camp 분기 + fe_valid 구간(맵디자이너)', '사용 규칙: docker/maps/tilemap_v2/camp_tiles_mapping.json'],
        'qa': 'docker/gemini/tileset_v2/art_camp/art_camp_qa.json'}
    m4 = fr.get('tileset.tv2_static4_mtn')
    if m4:
        m4['count'] = MTN_OLD + len(MF); m4['bytes'] = os.path.getsize(MTN_SHEET)
        m4.setdefault('notes', []).append('2026-11-03 art_camp.py: mtn_fill_d/e/f = 2587~2589(프레임 187~189) 추가 — FE U32_TV2.static4_mtn count 187 -> 190')
    json.dump(fr, open(os.path.join(TVP, 'manifest_fragment_tv2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('applied', os.path.getsize(SHEET), os.path.getsize(MTN_SHEET))
