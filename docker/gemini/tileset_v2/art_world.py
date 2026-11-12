# tileset_v2 준비 중 서가용 세트 5종(타일 큐 ②~⑥) — 안아트 2026-11-03. 이미지 모델 호출 0회(Pillow 절차 도트 16px -> x2). 공용 규칙 tile_lib.py.
#   ② desert    tv2_static9_desert    3700~  서아시아: 흙벽돌 성벽 16형+성문·탑 2x2·흙벽 집·야자수 2·페르시아 왕 장막 2x2 / 3800~ clay47(건조 점토, 모래 바탕) / 3900~ dune47(모래 둔덕)
#   ③ crusader  tv2_static10_crusader 4000~  사암 석벽 16형+성문·아치·키프 2x2·원탑 2x2·방파제 16형(물 위, 통행)
#   ④ med       tv2_static11_med      4100~  갤리선 3x1(동·서)/1x3, 석조 부두 16형(통행), 사이프러스·올리브, 흰 회벽 집 1x1 2종·2x2 / 4200~ lagoon47(석호 얕은 물, 모래 바탕)
#   ⑤ levee     tv2_static12_levee    4300~  ch11 물막이 둑(소가죽 싼 흙둑) 16형 + 터진 둑 가로/세로(물 넘침)
#   ⑥ archive   tv2_static13_archive  4400~  흰 방 바닥 4종(지면), 흰 벽 16형(둥근 모서리 = 곡선 벽 대체안), 책장 번호 표지판 1~5(글자 대신 눈금 표식), 마지막 칸 표지
# 규칙: 문장·글자·숫자·종교 상징 없음. 통행: 벽·탑·건물·배·나무 = 불통 / 성문·아치·부두·방파제·터진 둑 = 통행 / 47형 지면 = 맵 규칙
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/art_world.py <루트> [desert|crusader|med|levee|archive|all] [--apply]
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tile_lib import Hx, sha_f, N_, E_, S_, W_, MASKS, x2, ctx, outline, ext4, arms, classify, split, mask47, mask4, seam4, shape_seam, check, sheet_of, apply, mapping

ROOT = sys.argv[1]; WHICH = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else 'all'; APPLY = '--apply' in sys.argv
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2'); OUTD = os.path.join(HERE, 'art_world'); os.makedirs(os.path.join(OUTD, 'preview'), exist_ok=True)
TVP, NAMES, crop16 = ctx(ROOT); TAG = '.bak-world-20261103'
assert MASKS == NAMES['spec']['masks']
GRASS, SAND, WATER = crop16('grass_a'), crop16('sand47_255'), crop16('water47_255')
WOOD = [Hx(c) for c in ('#3f1f0f', '#684020', '#885f31', '#af7f40', '#c79f61')]
ADOBE = [Hx(c) for c in ('#3e2a18', '#6a4a2c', '#8e6a42', '#b08a5a', '#ccaa76', '#e2c896')]      # 흙벽돌
SANDST = [Hx(c) for c in ('#3a2e22', '#64503a', '#8c7456', '#b09874', '#cdb894', '#e6d6b4')]     # 사암 석벽
LIME = [Hx(c) for c in ('#5c5a54', '#9a978c', '#cfcbc0', '#ece9e0', '#fbf9f2')]                  # 흰 회벽
TERRA = [Hx(c) for c in ('#4a2414', '#7a3a20', '#a8552e', '#c87444')]                            # 테라코타 기와
PALM = [Hx(c) for c in ('#1e3a10', '#2f5a16', '#4a7e22', '#6aa036')]
OLIVE = [Hx(c) for c in ('#2a3420', '#46553a', '#66755a', '#8a9878')]
CYP = [Hx(c) for c in ('#142414', '#1e3a1e', '#2e5430', '#447046')]
CLAY = [Hx(c) for c in ('#5a3e24', '#86603a', '#a8804e', '#c6a06a')]
DUNE = [Hx(c) for c in ('#8a6a3a', '#b08e56', '#d0b070', '#e8cc8c', '#f6e2a8')]
HIDE = [Hx(c) for c in ('#3a2a1a', '#6a5034', '#927248', '#b89462')]
EARTH = [Hx(c) for c in ('#3f1f0f', '#684020', '#885f31', '#af7f40', '#c79f61')]
CLOTH = {'red': [Hx(c) for c in ('#3a1210', '#7a2420', '#a83a2e', '#cc5a44')], 'blue': [Hx(c) for c in ('#141c3a', '#243a6e', '#3a5a9a', '#5a7cc0')],
         'white': [Hx(c) for c in ('#5a5446', '#a69e88', '#d4ccb4', '#f0ead6')], 'gold': [Hx(c) for c in ('#4a3210', '#8a6420', '#b88a34', '#dcb058')]}
PAPER = [Hx(c) for c in ('#7e7a72', '#b8b4aa', '#dcd8ce', '#efece4', '#fbf9f4')]
INK = [Hx(c) for c in ('#121018', '#2a2834', '#4a4858')]
DARK = Hx('#140e0c'); GRASS_SH = Hx('#2f6a0e')
wcols = {tuple(c[:3]) for c in WATER.reshape(-1, 4)}
LAGOON = {c: Hx('#%02x%02x%02x' % (min(255, int(c[0] * 0.4 + 60)), min(255, int(c[1] * 0.5 + 110)), min(255, int(c[2] * 0.45 + 110)))) for c in wcols}   # 석호(밝은 청록)
scols = {tuple(c[:3]) for c in SAND.reshape(-1, 4)}

# ---------------------------------------------------------------- 공용 그리기
def wall_paint_factory(TOP, FACE, merlon=True, face_h=6, roundcorner=False):
    """art_west.py 석벽과 같은 구조(윗면 arms(4..11, 3..8) + 남쪽 벽면 face_h + 북쪽/옆 총안 주기 4). 팔레트만 교체."""
    def paint(m, put, sp):
        T = arms(m, 4, 11, 3, 8)
        if sp == 'breach_h': T0 = T; T = lambda x, y: T0(x, y) and not (5 <= x <= 10)
        for y in range(-1, 17):
            for x in range(-1, 17):
                if T(x, y):
                    c = TOP[3]
                    if y % 4 == 0 or (x + (4 if (y // 4) % 2 else 0)) % 8 == 0: c = TOP[2]
                    if not T(x, y - 1) or not T(x - 1, y): c = TOP[4]
                    if roundcorner and ((not T(x - 1, y) and not T(x, y - 1)) or (not T(x + 1, y) and not T(x, y - 1))): continue   # 볼록 모서리 1px 깎기(둥근 벽)
                    put(x, y, c); continue
                k = next((k for k in range(1, face_h + 1) if T(x, y - k)), None)
                if k is not None:
                    course = (k - 1) // 3; c = FACE[2]
                    if (k - 1) % 3 == 2 or (x + (4 if course % 2 else 0)) % 8 == 0: c = FACE[1]
                    if k == 1: c = FACE[1]
                    if k == face_h: c = FACE[0]
                    put(x, y, c); continue
                if merlon:
                    if (T(x, y + 1) or T(x, y + 2)) and x % 4 in (0, 1): put(x, y, TOP[5] if T(x, y + 2) and not T(x, y + 1) else TOP[4]); continue
                    if (T(x + 1, y) or T(x + 2, y)) and y % 4 in (0, 1) and not T(x, y + 1): put(x, y, TOP[4]); continue
                    if (T(x - 1, y) or T(x - 2, y)) and y % 4 in (0, 1) and not T(x, y + 1): put(x, y, TOP[3]); continue
        if sp in ('gate_h', 'arch_h'):
            for y in range(7, 15):
                for x in range(5, 11):
                    top = 10 - np.sqrt(max(0.0, 9 - (x - 7.5) ** 2)) * 0.9
                    if y + 0.5 >= top: put(x, y, (WOOD[1] if x in (7, 8) else WOOD[3]) if sp == 'gate_h' else DARK)
        if sp in ('gate_v', 'arch_v'):
            for y in range(5, 11):
                for x in range(4, 12): put(x, y, (WOOD[3] if y in (6, 9) else WOOD[2]) if sp == 'gate_v' else (TOP[2] if (x + y) % 5 else TOP[1]))
                put(3, y, FACE[1]); put(12, y, FACE[1])
            for x in range(3, 13): put(x, 4, TOP[5]); put(x, 11, FACE[0])
        if sp == 'breach_h':
            rng = np.random.default_rng(5)
            for _ in range(16): x = int(rng.integers(4, 12)); y = int(rng.integers(9, 14)); put(x, y, FACE[int(rng.integers(2, 5))]); put(x + 1, y, FACE[1])
    return paint

def strip_paint_factory(P, ocol, plank=False, x0=3, x1=12, sack=False):
    """물 위 띠 구조물(부두·방파제·둑) 16형: 가운데 노드 + 팔, 결 = 판자(plank) 또는 돌 블록."""
    def paint(m, put, sp):
        ins = arms(m, x0, x1, x0, x1)
        if sp == 'breach_h': i0 = ins; ins = lambda x, y: i0(x, y) and not (5 <= x <= 10)
        if sp == 'breach_v': i0 = ins; ins = lambda x, y: i0(x, y) and not (5 <= y <= 10)
        for y in range(-1, 17):
            for x in range(-1, 17):
                if not ins(x, y): continue
                horiz = bool(m & (E_ | W_)) and x0 <= y <= x1
                if plank: c = P[1] if ((x if horiz else y) % 4 == 0) else P[3] if (x + y) % 7 else P[4]
                elif sack:   # 소가죽 자루: 6x4 주기 타원, 왼쪽 위 빛, 아래 그늘, 자루 사이 흙
                    u, v = (x + (3 if (y // 4) % 2 else 0)) % 6, y % 4
                    c = EARTH[1] if (u == 0 or v == 3) else P[4] if (u == 1 and v == 0) else P[3] if v <= 1 else P[2]
                    if u == 3 and v == 1: c = P[1]                                   # 묶은 끈
                else: c = P[1] if (y % 4 == 0 or (x + (3 if (y // 4) % 2 else 0)) % 6 == 0) else P[3]
                if not ins(x, y - 1) or not ins(x - 1, y): c = P[4]
                if not ins(x, y + 1): c = P[1]
                put(x, y, c)
        if sp in ('breach_h', 'breach_v'):   # 터진 자리로 넘치는 물(흰 물보라)
            for y in range(4, 13):
                for x in range(4, 13):
                    if (sp == 'breach_h' and 5 <= x <= 10) or (sp == 'breach_v' and 5 <= y <= 10):
                        put(x, y, Hx('#3a6ac8') if (x + y) % 3 else Hx('#5a8ee0'))
                        if (x * 3 + y) % 5 == 0: put(x, y, PAPER[4])
    return paint

def region47(m, base, inner, face, F=5, rim=None, edge=None, mapcol=None):
    cls = classify(m, F=F); a = base.copy(); g = lambda u, v, c: cls[v, u] if 0 <= u < 16 and 0 <= v < 16 else c
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 1: a[y, x] = inner(x, y)
            elif c == 2:
                k = 0
                while y - k - 1 >= 0 and cls[y - k - 1, x] == 2: k += 1
                a[y, x] = face[min(len(face) - 1, k)]
    res = a.copy()
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 0:
                if g(x, y - 1, 0) == 2 and edge: res[y, x] = edge
                continue
            if rim and c == 1 and (g(x, y - 1, c) == 0 or g(x - 1, y, c) == 0 or g(x + 1, y, c) == 0): res[y, x] = rim
    return res

def blk(W, H): return np.zeros((H, W, 4), np.uint8)
def draw_img(W, H, fn, oc):
    im = Image.fromarray(blk(W, H)); d = ImageDraw.Draw(im); fn(d); return outline(np.array(im), oc)

# ---------------------------------------------------------------- ② 서아시아
def adobe_house():
    def f(d):
        d.rectangle([2, 4, 13, 14], fill=ADOBE[3]); d.rectangle([10, 4, 13, 14], fill=ADOBE[2]); d.rectangle([2, 3, 13, 4], fill=ADOBE[4])   # 평지붕 상자
        d.rectangle([6, 9, 8, 14], fill=DARK); d.rectangle([3, 7, 4, 8], fill=DARK); d.rectangle([11, 7, 12, 8], fill=ADOBE[1])
        for x in (4, 8, 12): d.point((x, 3), fill=WOOD[3])                                                                     # 서까래 끝
    return draw_img(16, 16, f, ADOBE[0])
def palm(var):
    a = blk(16, 16)
    for y in range(6, 16):
        x = 8 + (1 if (var == 'b' and y < 10) else 0) - (1 if y > 12 else 0)
        a[y, x] = WOOD[3] if y % 2 else WOOD[2]; a[y, x + 1] = WOOD[1]
    cx, cy = (8, 5) if var == 'a' else (9, 5)
    for ang in range(0, 360, 45):
        t = np.deg2rad(ang)
        for r in range(1, 7):
            x = int(round(cx + np.cos(t) * r)); y = int(round(cy + np.sin(t) * r * 0.6 + (r * r) * 0.08))
            if 0 <= x < 16 and 0 <= y < 16: a[y, x] = PALM[3] if r < 3 else PALM[2] if r < 5 else PALM[1]
    a[cy, cx] = WOOD[2]
    return outline(a, PALM[0])
def persian_tent():
    a = blk(32, 32); P = CLOTH['blue']; T = CLOTH['gold']; W = CLOTH['white']
    for y in range(2, 16):
        for x in range(1, 31): a[y, x] = W[3] if y < 9 else W[2]
    for x in range(1, 31):
        a[2, x] = T[3]; a[15, x] = P[2]; a[16, x] = P[3] if x % 4 in (1, 2) else P[1]
        if x % 6 == 0:
            for y in range(3, 15): a[y, x] = T[2]                                                                                # 금빛 세로 띠(무늬 없음)
    for y in range(17, 29):
        for x in range(3, 29): a[y, x] = P[2] if x < 23 else P[1]
    a[20:29, 13:19] = DARK; a[0:2, 15] = T[3]; a[0:2, 16] = T[1]
    for y in range(18, 29): a[y, 0] = WOOD[2]; a[y, 31] = WOOD[1]
    return outline(a, P[0])
def adobe_tower():
    a = blk(32, 32)
    for y in range(4, 22):
        for x in range(4, 28): a[y, x] = ADOBE[3] if (y % 4 and (x + (4 if (y // 4) % 2 else 0)) % 8) else ADOBE[2]
    for x in range(4, 28):
        if x % 4 in (0, 1): a[2, x] = ADOBE[5]; a[3, x] = ADOBE[4]
    for y in range(22, 30):
        for x in range(4, 28): a[y, x] = ADOBE[1] if (y - 22) % 3 == 2 or (x + (4 if ((y - 22) // 3) % 2 else 0)) % 8 == 0 else ADOBE[2]
    a[24:28, 15:17] = DARK
    return outline(a, ADOBE[0])

# ---------------------------------------------------------------- ③ 십자군
def keep_():
    a = blk(32, 32)
    for y in range(3, 20):
        for x in range(2, 30): a[y, x] = SANDST[3] if (y % 4 and (x + (4 if (y // 4) % 2 else 0)) % 8) else SANDST[2]
    for x in range(2, 30):
        if x % 4 in (0, 1): a[1, x] = SANDST[5]; a[2, x] = SANDST[4]
    for (x0, y0) in ((2, 1), (26, 1)):
        for y in range(y0, y0 + 5):
            for x in range(x0, x0 + 4): a[y, x] = SANDST[4]                                                                       # 모서리 작은 탑 머리
    a[7:15, 9:23] = SANDST[2]; a[8:14, 10:22] = WOOD[2]                                                                         # 지붕 마루 판자
    for y in range(20, 31):
        for x in range(2, 30): a[y, x] = SANDST[1] if (y - 20) % 3 == 2 or (x + (4 if ((y - 20) // 3) % 2 else 0)) % 8 == 0 else SANDST[2]
    for x in (8, 15, 23): a[22:26, x] = DARK
    return outline(a, SANDST[0])
def round_tower():
    a = blk(32, 32); cx, cy, R = 15.5, 11.0, 11.5
    for y in range(32):
        for x in range(32):
            d = np.hypot(x - cx, (y - cy) * 1.15)
            if d <= R:                                                                     # 윗면(판석) + 가장자리 총안 고리
                a[y, x] = SANDST[3] if (int(d) % 4 and (x + y) % 6) else SANDST[2]
                if d > R - 2.2: a[y, x] = SANDST[4] if int(np.degrees(np.arctan2(y - cy, x - cx)) // 20) % 2 == 0 else SANDST[1]
            elif abs(x - cx) <= R and y > cy and y <= cy + np.sqrt(max(0, R * R - (x - cx) ** 2)) / 1.15 + 9:   # 남쪽 원통 벽면
                t = (x - cx) / R
                a[y, x] = SANDST[3] if t < -0.5 else SANDST[2] if t < 0.4 else SANDST[1]
                if (y + (3 if int(x) % 8 < 4 else 0)) % 4 == 0: a[y, x] = SANDST[1]
    a[24:28, 15:17] = DARK
    return outline(a, SANDST[0])

# ---------------------------------------------------------------- ④ 지중해
def galley():
    L, H = 48, 16; a = blk(L, H)
    for x in range(L):
        t = x / (L - 1); half = 4.8 * (min(1, t / 0.08) ** 0.5) * (min(1, (1 - t) / 0.15) ** 0.6)
        for y in range(H):
            dy = abs(y - 8 + 0.5)
            if dy <= half: a[y, x] = WOOD[1] if dy > half - 1.1 else WOOD[3] if y < 8 else WOOD[2]
    for x in range(44, 48): a[8, x] = WOOD[4]; a[9, x] = WOOD[1]                                                                 # 충각
    for x in range(4, 44, 3): a[1, x] = WOOD[3]; a[2, x] = WOOD[2]; a[13, x] = WOOD[2]; a[14, x] = WOOD[3]                      # 노 양현
    for y in range(3, 13): a[y, 20] = WOOD[4]; a[y, 21] = WOOD[2]
    for y in range(4, 12):
        for x in range(22, 30): a[y, x] = CLOTH['white'][3] if x < 26 else CLOTH['white'][2]                                      # 사각 돛(무지)
    return outline(a, WOOD[0])
def cypress():
    a = blk(16, 16)
    for y in range(1, 15):
        hw = max(1, int(3.2 * np.sin(np.pi * (y - 0.5) / 15) ** 0.8))
        for x in range(8 - hw, 8 + hw + 1): a[y, x] = CYP[3] if x < 8 else CYP[2] if x < 9 else CYP[1]
    a[15, 7] = WOOD[2]; a[15, 8] = WOOD[1]
    return outline(a, CYP[0])
def olive():
    a = blk(16, 16)
    for y in range(9, 16): a[y, 7] = WOOD[2]; a[y, 8] = WOOD[1] if y % 2 else WOOD[3]
    for y in range(1, 11):
        for x in range(1, 15):
            if ((x - 7.5) / 6.5) ** 2 + ((y - 5.5) / 4.5) ** 2 <= 1 and (x * 7 + y * 3) % 5: a[y, x] = OLIVE[3] if (x + y) < 12 else OLIVE[2] if x < 11 else OLIVE[1]
    return outline(a, OLIVE[0])
def lime_house(var):
    def f(d):
        d.rectangle([2, 6, 13, 14], fill=LIME[3]); d.rectangle([10, 6, 13, 14], fill=LIME[2])
        if var == 'a': d.rectangle([1, 3, 14, 6], fill=TERRA[3]); d.rectangle([1, 5, 14, 6], fill=TERRA[2])
        else: d.rectangle([2, 4, 13, 6], fill=LIME[4])                                                                           # 평지붕
        d.rectangle([7, 10, 8, 14], fill=CLOTH['blue'][2]); d.rectangle([3, 8, 4, 9], fill=CLOTH['blue'][1])
    return draw_img(16, 16, f, LIME[0])
def lime_big():
    def f(d):
        d.rectangle([2, 10, 29, 29], fill=LIME[3]); d.rectangle([22, 10, 29, 29], fill=LIME[2])
        d.rectangle([1, 4, 30, 10], fill=TERRA[3]); d.rectangle([1, 8, 30, 10], fill=TERRA[2])
        d.rectangle([13, 20, 18, 29], fill=CLOTH['blue'][2])
        for x0 in (5, 23): d.rectangle([x0, 14, x0 + 2, 17], fill=CLOTH['blue'][1])
    a = draw_img(32, 32, f, LIME[0])
    for y in (5, 7):
        for x in range(2, 30, 3): a[y, x] = TERRA[1]
    return a

# ---------------------------------------------------------------- ⑥ 서고(흰 방)
def white_floor(k):
    a = np.zeros((16, 16, 4), np.uint8); a[...] = PAPER[3]
    for y in range(16):
        for x in range(16):
            if k in ('a', 'b') and (x % 8 == 0 or y % 8 == 0): a[y, x] = PAPER[2]                                                   # 흰 판석 줄눈(주기 8)
            if k == 'b' and (x * 5 + y * 3) % 23 == 0: a[y, x] = PAPER[4]
            if k == 'c' and y % 4 == 0 and x % 2 == 0: a[y, x] = PAPER[2]                                                              # 희미한 줄 칸(글자 없음)
            if k == 'd' and (x + y) % 16 in (0, 1): a[y, x] = PAPER[2]                                                               # 대각 결
    return a
def marker(n):
    """책장 번호 표지판: 숫자 대신 금 눈금 n개(1~5). 나무 판 + 금 테."""
    a = blk(16, 16)
    for y in range(3, 12):
        for x in range(3, 13): a[y, x] = WOOD[3] if y < 7 else WOOD[2]
    for x in range(3, 13): a[3, x] = CLOTH['gold'][3]; a[11, x] = CLOTH['gold'][1]
    xs = [8] if n == 1 else list(np.linspace(5, 10, n).round().astype(int))
    for x in xs:
        for y in range(5, 10): a[y, x] = CLOTH['gold'][3] if y < 8 else CLOTH['gold'][2]
    for y in range(12, 16): a[y, 7] = WOOD[1]; a[y, 8] = WOOD[2]
    return outline(a, WOOD[0])
def last_cell():
    a = np.zeros((16, 16, 4), np.uint8); a[...] = PAPER[4]
    for i in range(16):
        for (x, y) in ((i, 1), (i, 14), (1, i), (14, i)): a[y, x] = CLOTH['gold'][3]
        for (x, y) in ((i, 2), (i, 13), (2, i), (13, i)): a[y, x] = CLOTH['gold'][1] if 2 <= i <= 13 else a[y, x]
    for y in range(6, 10):
        for x in range(4, 12): a[y, x] = PAPER[2] if y == 9 else PAPER[3]                                                         # 비어 있는 한 줄 자리
    a[7:9, 4] = INK[1]
    return a

# ---------------------------------------------------------------- 세트 정의
def build(which):
    S = {}
    if which == 'desert':
        key, start, end, sets = 'tv2_static9_desert', 3700, 3999, {'structure': 3700, 'clay': 3800, 'dune': 3900}
        AD = wall_paint_factory(ADOBE, ADOBE)
        S['structure'] = [(f'ov_adobe_{m}', ext4(m, AD, ADOBE[0]), 'overlay', 'block') for m in range(16)]
        S['structure'] += [('ov_adobe_gate_h', ext4(E_ | W_, AD, ADOBE[0], 'gate_h'), 'overlay', 'pass'), ('ov_adobe_gate_v', ext4(N_ | S_, AD, ADOBE[0], 'gate_v'), 'overlay', 'pass')]
        S['structure'] += [(n, t, 'overlay', 'block') for n, t in split(adobe_tower(), 'ov_adobe_tower')]
        S['structure'] += [('ov_adobe_house', adobe_house(), 'overlay', 'block'), ('ov_palm_a', palm('a'), 'overlay', 'block'), ('ov_palm_b', palm('b'), 'overlay', 'block')]
        S['structure'] += [(n, t, 'overlay', 'tent') for n, t in split(persian_tent(), 'ov_persian_tent')]
        S['clay'] = [(f'clay47_{m}', region47(m, SAND, lambda x, y: CLAY[2] if (x * 3 + y * 5) % 11 else CLAY[0] if (x + y) % 7 == 0 else CLAY[1], [CLAY[1], CLAY[0]], F=2, rim=CLAY[3], edge=DUNE[0]), 'ground', 'map_rule') for m in MASKS]
        S['dune'] = [(f'dune47_{m}', region47(m, SAND, lambda x, y: DUNE[3] if (x + 2 * y) % 9 else DUNE[4], [DUNE[2], DUNE[1], DUNE[1], DUNE[0]], F=5, rim=DUNE[4], edge=DUNE[0]), 'ground', 'map_rule') for m in MASKS]
        note = '서아시아 사막·성채(ch17 가우가멜라·ch19 성지): 흙벽돌 성벽 16형·성문·탑·흙벽 집·야자수·페르시아 왕 장막 + 건조 점토 47형·모래 둔덕 47형(모래 바탕)'
        rules = {'ov_adobe_<m4>': '흙벽돌 성벽 16형. 불통(W)', 'ov_adobe_gate_h/v': '흙벽 성문. 통행(c)', 'ov_adobe_tower_<r><c>': '흙벽 탑 2x2. 불통', 'ov_adobe_house': '흙벽 평지붕 집. 불통',
                 'ov_palm_a/b': '야자수. 불통 또는 숲(f) 규칙', 'ov_persian_tent_<r><c>': '페르시아 왕 장막 2x2(흰·남·금 무지). kind tent', 'clay47_<mask>': '건조 점토 지면 47형(바깥 = 모래 sand47). 평지(p)',
                 'dune47_<mask>': '모래 둔덕 47형(남쪽 비탈 그늘). 언덕 규칙(이동 비용 가산)'}
        vn = '아케메네스·아이유브 시대 흙벽·장막 일반화(문장 없음)'
    elif which == 'crusader':
        key, start, end, sets = 'tv2_static10_crusader', 4000, 4099, {'structure': 4000}
        SW = wall_paint_factory(SANDST, SANDST); BW = strip_paint_factory(SANDST, SANDST[0])
        S['structure'] = [(f'ov_swall_{m}', ext4(m, SW, SANDST[0]), 'overlay', 'block') for m in range(16)]
        S['structure'] += [('ov_swall_gate_h', ext4(E_ | W_, SW, SANDST[0], 'gate_h'), 'overlay', 'pass'), ('ov_swall_gate_v', ext4(N_ | S_, SW, SANDST[0], 'gate_v'), 'overlay', 'pass'),
                           ('ov_swall_arch_h', ext4(E_ | W_, SW, SANDST[0], 'arch_h'), 'overlay', 'pass'), ('ov_swall_arch_v', ext4(N_ | S_, SW, SANDST[0], 'arch_v'), 'overlay', 'pass'),
                           ('ov_swall_breach_h', ext4(E_ | W_, SW, SANDST[0], 'breach_h'), 'overlay', 'pass')]
        S['structure'] += [(n, t, 'overlay', 'block') for n, t in split(keep_(), 'ov_keep')] + [(n, t, 'overlay', 'block') for n, t in split(round_tower(), 'ov_rtower')]
        S['structure'] += [(f'ov_mole_{m}', ext4(m, BW, SANDST[0]), 'overlay', 'pass') for m in range(16)]
        note = '십자군 성(ch19 성지): 사암 석벽 16형·성문·아치·틈·키프 2x2·원탑 2x2·방파제 16형(물 위)'
        rules = {'ov_swall_<m4>': '사암 석벽 16형. 불통(W)', 'ov_swall_gate_h/v·arch_h/v': '성문·아치. 통행(c)', 'ov_swall_breach_h': '무너진 틈. 통행', 'ov_keep_<r><c>': '키프(주탑) 2x2. 불통',
                 'ov_rtower_<r><c>': '원탑 2x2. 불통', 'ov_mole_<m4>': '항구 방파제 16형(물 위 석축). 통행(b)'}
        vn = '12세기 레반트 십자군·아이유브 성곽 일반화(십자가·문장 없음)'
    elif which == 'med':
        key, start, end, sets = 'tv2_static11_med', 4100, 4299, {'harbor': 4100, 'lagoon': 4200}
        Q = strip_paint_factory(LIME[:1] + [LIME[1], LIME[1], LIME[2], LIME[3]], LIME[0])
        GL = galley()
        S['harbor'] = [(n, t, 'overlay', 'block') for n, t in split(GL, 'ov_galley_e')] + [(n, t, 'overlay', 'block') for n, t in split(np.ascontiguousarray(GL[:, ::-1]), 'ov_galley_w')]
        S['harbor'] += [(n, t, 'overlay', 'block') for n, t in split(np.ascontiguousarray(np.rot90(GL, 1)), 'ov_galley_v')]
        S['harbor'] += [(f'ov_quay_{m}', ext4(m, Q, LIME[0]), 'overlay', 'pass') for m in range(16)]
        S['harbor'] += [('ov_cypress', cypress(), 'overlay', 'block'), ('ov_olive', olive(), 'overlay', 'block'), ('ov_lime_house_a', lime_house('a'), 'overlay', 'block'), ('ov_lime_house_b', lime_house('b'), 'overlay', 'block')]
        S['harbor'] += [(n, t, 'overlay', 'block') for n, t in split(lime_big(), 'ov_lime_big')]
        S['lagoon'] = [(f'lagoon47_{m}', region47(m, SAND, lambda x, y: LAGOON[tuple(WATER[y, x][:3])], [DUNE[3], DUNE[2]], F=2, rim=DUNE[3], edge=DUNE[0]), 'ground', 'map_rule') for m in MASKS]
        note = '지중해(ch15·ch19): 갤리선 3x1(동·서)/1x3, 석조 부두 16형, 사이프러스·올리브, 흰 회벽 집 + 석호 47형(모래 바탕 얕은 물)'
        rules = {'ov_galley_e/w_<c>·ov_galley_v_<r>': '갤리선(무지 사각 돛, 충각). 물 위 불통', 'ov_quay_<m4>': '석조 부두 16형(물 위). 통행(b)', 'ov_cypress/ov_olive': '나무. 불통 또는 숲 규칙',
                 'ov_lime_house_a/b·ov_lime_big_<r><c>': '흰 회벽 집(테라코타 기와/평지붕). 불통', 'lagoon47_<mask>': '석호 47형(얕은 청록 물, 바깥 = 모래). 얕은 여울(s) 권장'}
        vn = '고대~중세 지중해 갤리·항구 일반화'
    elif which == 'levee':
        key, start, end, sets = 'tv2_static12_levee', 4300, 4399, {'levee': 4300}
        LP = [HIDE[0], HIDE[1], HIDE[2], HIDE[2], HIDE[3]]
        LV = strip_paint_factory(LP, HIDE[0], x0=2, x1=13, sack=True)
        S['levee'] = [(f'ov_levee_{m}', ext4(m, LV, HIDE[0]), 'overlay', 'pass') for m in range(16)]
        S['levee'] += [('ov_levee_breach_h', ext4(E_ | W_, LV, HIDE[0], 'breach_h'), 'overlay', 'pass'), ('ov_levee_breach_v', ext4(N_ | S_, LV, HIDE[0], 'breach_v'), 'overlay', 'pass')]
        note = 'ch11 물막이 둑(소가죽으로 싼 흙둑) 16형(물 위) + 터진 둑 가로/세로(물 넘침)'
        rules = {'ov_levee_<m4>': '물막이 둑 16형(물 위, 소가죽 싼 흙 자루 결). 통행(둑 위)', 'ov_levee_breach_h/v': '터진 둑(물 넘침). cue 로 교체, 통행 여부 맵 규칙'}
        vn = '1019 귀주 대첩 강 물막이 전승의 소가죽 둑 일반화'
    else:
        key, start, end, sets = 'tv2_static13_archive', 4400, 4499, {'archive': 4400}
        WW = wall_paint_factory(PAPER + [PAPER[4]], PAPER, merlon=False, face_h=5, roundcorner=True)
        S['archive'] = [(f'whitefloor_{k}', white_floor(k), 'ground', 'pass') for k in 'abcd']
        S['archive'] += [(f'ov_wwhite_{m}', ext4(m, WW, PAPER[0]), 'overlay', 'block') for m in range(16)]
        S['archive'] += [(f'ov_shelf_marker_{n}', marker(n), 'overlay', 'block') for n in range(1, 6)]
        S['archive'].append(('lastcell', last_cell(), 'ground', 'pass'))
        note = 'ch999 서고: 흰 방 바닥 4종, 흰 벽 16형(볼록 모서리 둥글게 = 곡선 벽 대체안), 책장 번호 표지판 1~5(숫자 대신 금 눈금 개수), 마지막 칸 표지(지면)'
        rules = {'whitefloor_a/b/c/d': '흰 방 바닥(판석·반짝임·희미한 줄·대각 결). 통행', 'ov_wwhite_<m4>': '흰 벽 16형(모서리 둥근 처리). 불통(W). 원형 방은 이 벽을 계단식으로 배치',
                 'ov_shelf_marker_<n>': '책장 번호 표지판(금 눈금 n개 = 번호 1~5, 글자 없음). 불통 소품', 'lastcell': '마지막 칸 타일(금 테 + 비어 있는 한 줄). 통행 — last_line in_zone 지점'}
        vn = '창작 공간(글자 없음)'
    return key, start, end, sets, S, note, rules, vn

def run(which):
    key, start, end, sets, S, note, rules, vn = build(which)
    FR = {}
    for k, lst in S.items():
        assert len(lst) <= (100 if len(sets) > 1 else end - start + 1), (k, len(lst))
        for i, (n, a, kind, walk) in enumerate(lst): FR[sets[k] + i] = (n, x2(a), kind, walk, k)
    BY = {v[0]: v[1] for v in FR.values()}
    allowed = {tuple(c[:3]) for c in WOOD + ADOBE + SANDST + LIME + TERRA + PALM + OLIVE + CYP + CLAY + DUNE + HIDE + EARTH + PAPER + INK + sum(CLOTH.values(), []) + [DARK, GRASS_SH, Hx('#3a6ac8'), Hx('#5a8ee0')] + list(LAGOON.values())}
    allowed |= set(map(tuple, GRASS.reshape(-1, 4)[:, :3].tolist())) | scols
    errs, items = check(FR, allowed)
    qa = {'date': '2026-11-03', 'author': '안아트', 'calls': 0, 'set': which, 'sheet': f'public/assets/tiles/tileset_v2/{key}.png', 'start': start, 'count': len(FR),
          'sets': {k: [sets[k], sets[k] + len(v) - 1] for k, v in S.items()}, 'errors': errs, 'items': items, 'seam4': {}}
    for pre, ex in {'desert': [('ov_adobe', {'gate_h': E_ | W_, 'gate_v': N_ | S_})], 'crusader': [('ov_swall', {'gate_h': E_ | W_, 'gate_v': N_ | S_, 'arch_h': E_ | W_, 'arch_v': N_ | S_, 'breach_h': E_ | W_}), ('ov_mole', None)],
                    'med': [('ov_quay', None)], 'levee': [('ov_levee', {'breach_h': E_ | W_, 'breach_v': N_ | S_})], 'archive': [('ov_wwhite', None)]}[which]:
        b = seam4(BY, pre, ex); qa['seam4'][pre] = b[:12]
        if b: qa['errors'].append(f'{pre} 이음 {len(b)}')
    for fam, F in {'desert': [('clay', 2), ('dune', 5)], 'med': [('lagoon', 2)]}.get(which, []):
        r = shape_seam(F=F); qa[f'{fam}_shape_seam'] = r
        if r['jumps_gt_1px']: qa['errors'].append(f'{fam}47 이음 오류')
    sheet = sheet_of(FR, start); qa['sheet_size'] = list(sheet.size)
    preview(which, BY)
    json.dump(qa, open(os.path.join(OUTD, f'art_world_{which}_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(which, 'count', len(FR), {k: len(v) for k, v in S.items()}, 'errors', qa['errors'][:5], 'seam4', {k: len(v) for k, v in qa['seam4'].items()}, {k: v for k, v in qa.items() if k.endswith('_shape_seam')})
    if APPLY:
        if qa['errors']: raise SystemExit(f'{which} QA 오류 — apply 중단')
        MAPF = f'docker/gemini/tileset_v2/art_world/{which}_tiles_mapping.json'
        cnt, by = apply(TVP, key, start, end, FR, sheet, qa['sets'], TAG, 'art_world.py', f'안아트 art_world.py {which}(2026-11-03): {note}. 프레임 = 전역-{start}', vn, f'docker/gemini/tileset_v2/art_world/art_world_{which}_qa.json', MAPF)
        mapping(os.path.join(ROOT, MAPF), f'안아트 2026-11-03 {note}. 시트 public/assets/tiles/tileset_v2/{key}.png, 전역 {start}~{max(FR)}(프레임 = 전역-{start}). 이름 = tv2_names.json / tileset_v2_map.json index_map_{key.replace("tv2_", "")}',
                qa['sets'], rules, items, key, start, cnt)
        print('applied', which, key, start, max(FR), cnt, by)

def preview(which, BY):
    G2, S2, W2 = x2(GRASS), x2(SAND), x2(WATER)
    if which == 'desert':
        SC = ['ssssssssssssssssss', 'sAAAAGAAAAsssCCCss', 'sAsssssssAssCCCCss', 'sAsHsPsTsAssCCCss', 'sAAAAAAAAAssssssss', 'ssssssssssssDDDDDs', 'ssKKssssssssDDDDDs', 'ssKKsssssssssDDDss', 'ssssssssssssssssss']
    elif which == 'crusader':
        SC = ['gggggggggggggggggg', 'gWWWWGWWWWWWgggggg', 'gWgggggggggWgggggg', 'gWgggggggggAgggggg', 'gWWWWWXWWWWWgggggg', 'gggggggggggggggggg', '~~~~~~~~MMMMMMM~~~', '~~~~~~~~~~~~~~M~~~', '~~~~~~~~~~~~~~~~~~']
    elif which == 'med':
        SC = ['ssssssssssssssssss', 'ssLLLLLsssssssssss', 'sLLLLLLLsssssssss~', 'ssLLLLssssssssss~~', 'sssssssssss~~~~~~~', '~~~~~~~~~~QQQQQ~~~', '~~~~~~~~~~~~~~Q~~~', '~~~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~~~']
    elif which == 'levee':
        SC = ['gggggggggggggggggg', '~~~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~~~', 'VVVVVVVBVVVVVVVVVV', '~~~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~~~', 'gggggggggggggggggg']
    else:
        SC = ['ffffffffffffffffff', 'fZZZZZZZZZZZZZffff', 'fZffffffffffffZfff', 'fZffffffLfffffZfff', 'fZffffffffffffZfff', 'fZZZZZZZZZZZZZZfff', 'ffffffffffffffffff']
    Wm = max(len(r) for r in SC); SC = [r.ljust(Wm, r[0]) for r in SC]
    Hh, Ww = len(SC), len(SC[0]); out = Image.new('RGBA', (Ww * 32, Hh * 32))
    for y in range(Hh):
        for x in range(Ww):
            ch = SC[y][x]
            if which == 'archive': base = BY['lastcell'] if ch == 'L' else BY['whitefloor_' + 'abcd'[(x * 7 + y * 3) % 4]]
            elif ch in '~MQVB': base = W2
            elif which in ('desert', 'med') and ch not in 'g': base = S2
            else: base = G2
            if ch == 'C': base = BY[f'clay47_{mask47(SC, x, y, "C")}']
            if ch == 'D': base = BY[f'dune47_{mask47(SC, x, y, "D")}']
            if ch == 'L' and which == 'med': base = BY[f'lagoon47_{mask47(SC, x, y, "L")}']
            out.paste(base, (x * 32, y * 32))
    pre = {'desert': ('ov_adobe', 'AG'), 'crusader': ('ov_swall', 'WGAX'), 'med': ('ov_quay', 'Q'), 'levee': ('ov_levee', 'VB'), 'archive': ('ov_wwhite', 'Z')}[which]
    for y in range(Hh):
        for x in range(Ww):
            ch = SC[y][x]
            if ch in pre[1]:
                m = mask4(SC, x, y, pre[1]); hv = 'h' if m & (E_ | W_) else 'v'
                n = {'G': f'{pre[0]}_gate_{hv}', 'A': f'{pre[0]}_arch_{hv}' if which == 'crusader' else f'{pre[0]}_{m}', 'X': f'{pre[0]}_breach_h', 'B': f'{pre[0]}_breach_h'}.get(ch, f'{pre[0]}_{m}')
                out.alpha_composite(BY[n], (x * 32, y * 32))
            if which == 'crusader' and ch == 'M': out.alpha_composite(BY[f'ov_mole_{mask4(SC, x, y, "M")}'], (x * 32, y * 32))
    def blit(prefix, cx, cy, R=2, C=2):
        for r in range(R):
            for c in range(C): out.alpha_composite(BY[f'{prefix}_{r}{c}' if R > 1 and C > 1 else f'{prefix}_{r if R > 1 else c}'], ((cx + c) * 32, (cy + r) * 32))
    if which == 'desert':
        out.alpha_composite(BY['ov_adobe_house'], (3 * 32, 3 * 32)); out.alpha_composite(BY['ov_palm_a'], (5 * 32, 3 * 32)); out.alpha_composite(BY['ov_palm_b'], (16 * 32, 7 * 32)); blit('ov_adobe_tower', 6, 2); blit('ov_persian_tent', 2, 6)
    if which == 'crusader': blit('ov_keep', 5, 1); blit('ov_rtower', 14, 2)
    if which == 'med':
        blit('ov_galley_e', 1, 6, 1, 3); blit('ov_galley_w', 5, 7, 1, 3); blit('ov_galley_v', 16, 5, 3, 1); blit('ov_lime_big', 10, 1)
        for i, n in enumerate(('ov_cypress', 'ov_olive', 'ov_lime_house_a', 'ov_lime_house_b')): out.alpha_composite(BY[n], ((13 + i) * 32, 1 * 32))
    if which == 'archive':
        for i in range(5): out.alpha_composite(BY[f'ov_shelf_marker_{i + 1}'], ((3 + i * 2) * 32, 2 * 32))
    out.convert('RGB').resize((out.width * 2, out.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', f'{which}_scene_x2.png'))

for w in (['desert', 'crusader', 'med', 'levee', 'archive'] if WHICH == 'all' else [WHICH]): run(w)
