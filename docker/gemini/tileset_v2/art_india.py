# tileset_v2 인도(무굴·로디) 세트 tv2_static14_india(전역 4500~4699) — 안아트 2026-11-03. 이미지 모델 호출 0회(Pillow 절차 도트 16px -> x2 최근접). 공용 규칙 tile_lib.py.
#   요구서 docs/PLAN_TILE_CULTURE.md 부록 A. 프레임 = 전역 - 4500.
#   4500~ 붉은 사암 성벽 16형(흰 대리석 갓돌·띠) / 4516~ 성문·아치(뾰족 아치) / 4520~ 틈 / 4522~ 차트리 2x2 / 4530~ 민가 1x1 3종 + 하벨리 2x2
#   4540~ 샤미아나 2x2 + 작은 천막 / 4545~ 수레벽 / 4550~ 무지 깃발 3색 / 4553~ 반얀 2x2·야자·계단 우물·사석포 / 4560~ 코끼리(장식)
#   4600~ 차르바그 정원 47형 + fill_b(연못)·fill_c(꽃 화단) / 4650~ 데칸 붉은 흙 47형 + fill_b/c
# 규칙: 글자·문장·종교 표지(돔 꼭대기 상징·사원 기호) 없음. 돔은 무지 흰 대리석.
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/art_india.py <루트> [--apply]
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tile_lib import Hx, sha_f, N_, E_, S_, W_, MASKS, x2, ctx, outline, ext4, arms, classify, split, mask47, mask4, seam4, shape_seam, check, sheet_of, apply, mapping

ROOT = sys.argv[1]; APPLY = '--apply' in sys.argv
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2'); OUTD = os.path.join(HERE, 'art_india'); os.makedirs(os.path.join(OUTD, 'preview'), exist_ok=True)
TVP, NAMES, crop16 = ctx(ROOT); TAG = '.bak-india-20261103'
assert MASKS == NAMES['spec']['masks']
KEY, START, END = 'tv2_static14_india', 4500, 4699
KEEP = [os.path.join(TVP, f) for f in os.listdir(TVP) if f.startswith('tv2_') and f.endswith('.png') and 'static14' not in f]
before = {p: sha_f(p) for p in KEEP}
GRASS, WATER = crop16('grass_a'), crop16('water47_255')

# ---------------------------------------------------------------- 팔레트(붉은 사암·흰 대리석·황토·정원 녹색)
RS = [Hx(c) for c in ('#3a1a12', '#6a2e1e', '#8e4430', '#b05a3e', '#c8764e', '#dc9468')]       # 붉은 사암
MB = [Hx(c) for c in ('#6e6a66', '#a8a49c', '#d6d2c8', '#eeebe4', '#fbfaf6')]                  # 흰 대리석·회벽
OC = [Hx(c) for c in ('#5a3a14', '#8a5e24', '#b48434', '#d4a64e', '#ecc874')]                  # 황토 회벽(하벨리)
WOOD = [Hx(c) for c in ('#3f1f0f', '#684020', '#885f31', '#af7f40', '#c79f61')]
IRON = [Hx(c) for c in ('#1a1a1e', '#3a3a42', '#62626e', '#8a8a98')]
BRONZE = [Hx(c) for c in ('#3a2410', '#6a4420', '#9a6a34', '#c89a50')]
ELE = [Hx(c) for c in ('#26262c', '#5a5a66', '#80808e', '#a8a8b4')]
LEAF = [Hx(c) for c in ('#142a10', '#1e4216', '#2e5e1e', '#45802a', '#62a03a')]
PALM = [Hx(c) for c in ('#1e3a10', '#2f5a16', '#4a7e22', '#6aa036')]
SOIL = [Hx(c) for c in ('#4a1c10', '#7a3018', '#9a4224', '#b45634', '#c87048')]                # 데칸 붉은 흙
CLOTH = {'red': [Hx(c) for c in ('#3a1210', '#7a2420', '#a83a2e', '#cc5a44')], 'green': [Hx(c) for c in ('#0e2a16', '#1a4a26', '#2a6a38', '#3e8a4c')],
         'saffron': [Hx(c) for c in ('#5a2a08', '#a8520e', '#e07a1a', '#f4a040')], 'white': [Hx(c) for c in ('#5a5446', '#a69e88', '#d4ccb4', '#f0ead6')],
         'gold': [Hx(c) for c in ('#4a3210', '#8a6420', '#b88a34', '#dcb058')]}
AQUA = [Hx(c) for c in ('#1e3e7a', '#2a5aa8', '#3a6ac8', '#5a8ee0', '#a8d0f0')]
FLOWER = [Hx('#e04a3a'), Hx('#f4a040'), Hx('#f6e6a0')]
DARK = Hx('#140e0c'); GRASS_SH = Hx('#2f6a0e')

def blk(W, H): return np.zeros((H, W, 4), np.uint8)
def draw_img(W, H, fn, oc):
    im = Image.fromarray(blk(W, H)); d = ImageDraw.Draw(im); fn(d); return outline(np.array(im), oc)

# ---------------------------------------------------------------- 성벽 16형(art_world.py 석벽 구조 + 대리석 갓돌·띠, 뾰족 아치)
def iwall_paint(m, put, sp):
    T = arms(m, 4, 11, 3, 8)
    if sp == 'breach_h': T0 = T; T = lambda x, y: T0(x, y) and not (5 <= x <= 10)
    if sp == 'breach_v': T1 = T; T = lambda x, y: T1(x, y) and not (5 <= y <= 10)
    for y in range(-1, 17):
        for x in range(-1, 17):
            if T(x, y):
                c = RS[3]
                if y % 4 == 0 or (x + (4 if (y // 4) % 2 else 0)) % 8 == 0: c = RS[2]
                if not T(x, y - 1) or not T(x - 1, y): c = MB[3]                    # 흰 대리석 갓돌
                put(x, y, c); continue
            k = next((k for k in range(1, 7) if T(x, y - k)), None)
            if k is not None:
                course = (k - 1) // 3; c = RS[2]
                if (k - 1) % 3 == 2 or (x + (4 if course % 2 else 0)) % 8 == 0: c = RS[1]
                if k == 1: c = RS[1]
                if k == 3: c = MB[2]                                                     # 대리석 띠
                if k == 6: c = RS[0]
                put(x, y, c); continue
            if (T(x, y + 1) or T(x, y + 2)) and x % 4 in (0, 1): put(x, y, RS[5] if T(x, y + 2) and not T(x, y + 1) else RS[4]); continue   # 칸구라(둥근 총안)
            if (T(x + 1, y) or T(x + 2, y)) and y % 4 in (0, 1) and not T(x, y + 1): put(x, y, RS[4]); continue
            if (T(x - 1, y) or T(x - 2, y)) and y % 4 in (0, 1) and not T(x, y + 1): put(x, y, RS[3]); continue
    if sp in ('gate_h', 'arch_h'):
        top = lambda x: 7.2 + 0.95 * abs(x - 7.5)                                        # 뾰족 아치
        ins = lambda x, y: 5 <= x <= 10 and 6 <= y <= 14 and y + 0.5 >= top(x)
        for y in range(5, 15):
            for x in range(4, 12):
                if ins(x, y): put(x, y, (WOOD[1] if x in (7, 8) or y == 11 else WOOD[3]) if sp == 'gate_h' else DARK)
                elif any(ins(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): put(x, y, MB[3])   # 대리석 아치 테
        if sp == 'gate_h':
            for x in (6, 9): put(x, 12, BRONZE[3])                                       # 문 장식 못
    if sp in ('gate_v', 'arch_v'):   # 2026-11-04 맵디자이너 요청(ch22 su_pk18): 문 띠 6px -> 10px, 더 어둡게(세로 성벽에서 성문이 얇게 보이던 문제)
        for y in range(3, 13):
            for x in range(4, 12):
                if sp == 'gate_v': c = WOOD[0] if y in (3, 12) or x in (4, 11) else WOOD[1] if (x - 4) % 3 == 2 else WOOD[2]   # 짙은 나무 문짝 + 판자 줄
                else: c = DARK if 5 <= x <= 10 else RS[1]                                                                       # 문 없는 아치 = 어두운 통로
                put(x, y, c)
            put(3, y, MB[2]); put(12, y, MB[2])
        if sp == 'gate_v':
            for y in (5, 10): put(6, y, BRONZE[3]); put(9, y, BRONZE[3])                                                         # 쇠 장식 못
            for y in range(4, 12): put(7, y, WOOD[0]); put(8, y, WOOD[0])                                                         # 가운데 맞닿는 문 틈
        for x in range(3, 13): put(x, 2, MB[4]); put(x, 13, RS[0])
    if sp in ('breach_h', 'breach_v'):
        rng = np.random.default_rng(5 if sp == 'breach_h' else 9)
        for _ in range(16):
            if sp == 'breach_h': x = int(rng.integers(4, 12)); y = int(rng.integers(9, 14))
            else: x = int(rng.integers(4, 11)); y = int(rng.integers(5, 11))
            put(x, y, RS[int(rng.integers(2, 6))]); put(x + 1, y, RS[1])
def iwall(m, sp=None): return ext4(m, iwall_paint, RS[0], sp)

# ---------------------------------------------------------------- 건물·소품
def chhatri():
    def f(d):
        d.rectangle([3, 18, 28, 30], fill=RS[2]); d.rectangle([22, 18, 28, 30], fill=RS[1]); d.rectangle([3, 16, 28, 18], fill=RS[4])   # 기단
        for y in (21, 25): d.line([3, y, 28, y], fill=RS[1])
        d.rectangle([5, 10, 26, 16], fill=DARK)                                                    # 열린 정자 안
        for x0 in (5, 11, 18, 24): d.rectangle([x0, 10, x0 + 2, 16], fill=MB[3]); d.line([x0 + 2, 10, x0 + 2, 16], fill=MB[1])   # 대리석 기둥
        d.rectangle([2, 7, 29, 9], fill=RS[4]); d.line([2, 9, 29, 9], fill=RS[1])                  # 차자(처마 돌출)
        d.ellipse([7, 0, 24, 10], fill=MB[3]); d.rectangle([7, 6, 24, 7], fill=MB[2])             # 무지 대리석 돔
        d.ellipse([9, 1, 14, 5], fill=MB[4]); d.pieslice([7, 0, 24, 10], 300, 60, fill=MB[1])
        d.rectangle([7, 6, 24, 7], fill=MB[2])
    return draw_img(32, 32, f, RS[0])
def ihouse(var):
    W_, R_ = {'a': (MB, MB), 'b': (OC, OC), 'c': (RS, MB)}[var]
    def f(d):
        d.rectangle([2, 5, 13, 14], fill=W_[3]); d.rectangle([10, 5, 13, 14], fill=W_[2])        # 회벽 상자
        d.rectangle([1, 3, 14, 5], fill=R_[4] if var != 'b' else OC[4]); d.line([1, 5, 14, 5], fill=R_[1] if var != 'b' else OC[1])   # 평지붕 난간
        d.rectangle([6, 10, 9, 14], fill=DARK); d.point((7, 9), fill=DARK); d.point((8, 9), fill=DARK)   # 아치 문
        d.rectangle([2, 7, 5, 9], fill=RS[3] if var != 'c' else MB[3]); d.line([2, 9, 5, 9], fill=WOOD[1])   # 발코니(자로카)
        d.rectangle([3, 7, 4, 8], fill=DARK)
        d.rectangle([11, 7, 12, 8], fill=W_[1])
        for x in (3, 7, 11): d.point((x, 2), fill=R_[3] if var != 'b' else OC[3])                # 난간 작은 머리
    return draw_img(16, 16, f, W_[0] if var != 'a' else MB[0])
def haveli():
    def f(d):
        d.rectangle([2, 3, 29, 12], fill=OC[4]); d.rectangle([9, 5, 22, 10], fill=OC[1]); d.rectangle([10, 6, 21, 10], fill=Hx('#5c9c25'))   # 지붕 + 안뜰
        d.rectangle([2, 12, 29, 30], fill=OC[3]); d.rectangle([24, 12, 29, 30], fill=OC[2]); d.line([2, 12, 29, 12], fill=OC[1])
        for x in range(3, 29, 3): d.point((x, 2), fill=OC[3])
        d.rectangle([12, 21, 19, 30], fill=DARK); d.polygon([(12, 21), (15, 18), (16, 18), (19, 21)], fill=DARK)   # 뾰족 아치 대문
        d.line([12, 20, 15, 17], fill=MB[3]); d.line([16, 17, 19, 20], fill=MB[3])
        for x0 in (3, 22):                                                                         # 자로카 발코니(작은 차양)
            d.rectangle([x0, 15, x0 + 6, 20], fill=RS[3]); d.rectangle([x0 + 1, 16, x0 + 5, 19], fill=DARK)
            d.rectangle([x0 - 1, 13, x0 + 7, 14], fill=RS[4]); d.line([x0, 21, x0 + 6, 21], fill=WOOD[1])
            for x in range(x0 + 2, x0 + 5, 2): d.line([x, 16, x, 19], fill=OC[2])             # 격자창
        for x0 in (4, 24): d.rectangle([x0, 24, x0 + 3, 27], fill=OC[1])
    return draw_img(32, 32, f, OC[0])
def shamiana():
    R, Wt, G = CLOTH['red'], CLOTH['white'], CLOTH['gold']
    a = blk(32, 32)
    for y in range(17, 30):
        for x in range(3, 29): a[y, x] = R[1] if (x + y) % 6 else G[1]                            # 바닥 깔개(그늘)
    for y in range(2, 15):
        for x in range(1, 31): a[y, x] = R[3] if y < 8 else R[2]
        for x in range(1, 31, 5): a[y, x] = Wt[3] if y < 8 else Wt[2]                          # 흰 줄
    for x in range(1, 31): a[2, x] = G[3]; a[14, x] = G[2]; a[15, x] = R[2] if x % 3 else 0; a[16, x] = R[1] if x % 3 == 1 else 0   # 금 테 + 물결 가장자리
    for x0 in (1, 30, 11, 20):
        for y in range(16, 30): a[y, x0] = WOOD[3] if x0 < 16 else WOOD[2]                       # 기둥
    a[0:2, 15] = G[3]; a[0:2, 16] = G[1]
    return outline(a, R[0])
def itent():
    Wt, R = CLOTH['white'], CLOTH['red']
    def f(d):
        d.polygon([(8, 1), (15, 12), (1, 12)], fill=Wt[3]); d.polygon([(8, 1), (15, 12), (8, 12)], fill=Wt[2])
        d.line([1, 12, 15, 12], fill=R[2]); d.line([2, 13, 14, 13], fill=R[1])
        d.polygon([(8, 6), (10, 12), (6, 12)], fill=DARK)
        d.line([8, 0, 8, 1], fill=WOOD[3])
    return draw_img(16, 16, f, Wt[0])
def cart(kind):
    a = blk(16, 16)
    if kind == 'v':
        for y in range(2, 14):
            for x in range(4, 12): a[y, x] = WOOD[3] if (y % 3) else WOOD[1]                       # 수레 바닥 판자(세로)
        for y in (4, 11):
            for x in (2, 3, 12, 13): a[y - 1:y + 2, x] = WOOD[2] if x in (3, 12) else WOOD[0]     # 바퀴
        for y in list(range(0, 2)) + list(range(14, 16)): a[y, 7] = IRON[2]; a[y, 8] = IRON[1]   # 사슬(위아래 이음)
        a[1, 7] = IRON[3]; a[14, 8] = IRON[3]
    else:
        for x in range(1, 15):
            for y in range(5, 10): a[y, x] = WOOD[3] if x % 3 else WOOD[1]                        # 수레 옆판
        for x in range(1, 15): a[4, x] = WOOD[4]
        for (cx) in (4, 11):
            for y in range(9, 15):
                for x in range(cx - 3, cx + 4):
                    r = np.hypot(x - cx, y - 11.5)
                    if r <= 3.2: a[y, x] = WOOD[1] if r > 2.2 else WOOD[2] if r > 0.8 else IRON[2]   # 바퀴
        if kind == 'h':
            for x in list(range(0, 2)) + list(range(14, 16)): a[7, x] = IRON[2]; a[8, x] = IRON[1]   # 사슬(좌우 이음)
        else:
            for y in range(1, 5):
                for x in range(9, 15): a[y, x] = WOOD[2] if x % 2 else WOOD[3]                    # 끝 수레: 나무 방패(맨틀릿)
            for x in range(0, 2): a[7, x] = IRON[2]; a[8, x] = IRON[1]
    return outline(a, WOOD[0]) if kind != 'v' else outline(a, WOOD[0])
def iflag(c):
    P = CLOTH[c]; a = blk(16, 16)
    for y in range(1, 16): a[y, 4] = WOOD[3]; a[y, 5] = WOOD[1]
    for y in range(2, 9):
        for x in range(6, 14):
            if x - 6 <= 7 - abs(y - 5) * 0.4 + 2: a[y + (1 if x % 3 == 0 else 0), x] = P[3] if y < 5 else P[2]   # 무지 깃(끝이 살짝 가늘게)
    a[1, 4] = BRONZE[3]
    return outline(a, P[0])
def banyan():
    a = blk(32, 32); rng = np.random.default_rng(7)
    for y in range(17, 31):                                                                         # 기근(공중뿌리)·줄기 여럿
        for x in (6, 10, 15, 16, 21, 25):
            if y > 18 + (x % 3) or x in (15, 16): a[y, x] = WOOD[2] if x in (15, 16) else WOOD[1]
    for y in range(24, 31): a[y, 14] = WOOD[1]; a[y, 17] = WOOD[3]
    lobes = [(9, 9, 8), (16, 7, 9), (23, 9, 8), (12, 14, 7), (20, 14, 7), (16, 12, 8)]
    for y in range(32):
        for x in range(32):
            for cx, cy, r in lobes:
                if ((x - cx) / r) ** 2 + ((y - cy) / (r * 0.75)) ** 2 <= 1:
                    t = (x - cx) / r + (y - cy) / r
                    a[y, x] = LEAF[4] if t < -0.9 else LEAF[3] if t < -0.2 else LEAF[2] if t < 0.6 else LEAF[1]
                    break
    for _ in range(40):
        x, y = int(rng.integers(2, 30)), int(rng.integers(1, 20))
        if a[y, x, 3]: a[y, x] = LEAF[1]
    return outline(a, LEAF[0])
def ipalm():
    a = blk(16, 16)
    for y in range(6, 16):
        x = 8 - (1 if y > 12 else 0)
        a[y, x] = WOOD[3] if y % 2 else WOOD[2]; a[y, x + 1] = WOOD[1]
    cx, cy = 8, 5
    for ang in range(0, 360, 40):
        t = np.deg2rad(ang)
        for r in range(1, 7):
            x = int(round(cx + np.cos(t) * r)); y = int(round(cy + np.sin(t) * r * 0.55 + (r * r) * 0.1))
            if 0 <= x < 16 and 0 <= y < 16: a[y, x] = PALM[3] if r < 3 else PALM[2] if r < 5 else PALM[1]
    a[cy, cx] = WOOD[2]; a[6, 7] = BRONZE[2]; a[6, 9] = BRONZE[2]
    return outline(a, PALM[0])
def stepwell():
    a = blk(16, 16)
    for y in range(1, 15):
        for x in range(1, 15):
            k = min(x - 1, y - 1, 14 - x, 14 - y)
            a[y, x] = (RS[4], RS[3], RS[2], RS[1], RS[1])[min(k, 4)] if k < 4 else AQUA[1] if (x + y) % 3 else AQUA[2]
            if k < 4 and (x + y) % 2 == 0 and k > 0: a[y, x] = RS[min(5, 5 - k)]
    for i in range(1, 15): a[1, i] = MB[3]; a[i, 1] = MB[3]
    return outline(a, RS[0])
def cannon():
    a = blk(16, 16)
    for x in range(2, 15):
        r = 1.8 if x > 4 else 2.4
        for y in range(4, 10):
            if abs(y - 6.5) <= r: a[y, x] = IRON[3] if y < 6 else IRON[2] if y < 8 else IRON[1]        # 쇠 포신
    a[5:9, 14] = DARK; a[4:10, 2] = BRONZE[2]
    for x in (6, 10): a[4:9, x] = BRONZE[3]                                                      # 포신 테(청동)
    for x in range(3, 11): a[9, x] = WOOD[3]; a[10, x] = WOOD[2]                                   # 포가
    for cx in (4, 9):
        for y in range(10, 15):
            for x in range(cx - 2, cx + 3):
                rr = np.hypot(x - cx, y - 12)
                if rr <= 2.3: a[y, x] = WOOD[1] if rr > 1.4 else IRON[2]
    return outline(a, BRONZE[0])
def elephant(kind):
    a = blk(16, 16); R, G = CLOTH['red'], CLOTH['gold']
    if kind == 'h':
        for y in range(16):
            for x in range(16):
                if ((x - 6.5) / 5.5) ** 2 + ((y - 8) / 3.8) ** 2 <= 1: a[y, x] = ELE[2] if y < 8 else ELE[1]
                if ((x - 12) / 2.8) ** 2 + ((y - 6.5) / 3) ** 2 <= 1: a[y, x] = ELE[3] if y < 6 else ELE[2]
        for y in range(8, 15): a[y, 14] = ELE[2]; a[y, 15 if y > 12 else 14] = ELE[1]            # 코
        a[9, 15] = MB[4]; a[10, 15] = MB[3]                                                        # 상아
        for y in range(4, 10): a[y, 10] = ELE[1]; a[y, 11] = ELE[1] if y > 5 else a[y, 11]       # 귀
        for x0 in (2, 5, 8, 10):
            for y in range(11, 16): a[y, x0] = ELE[2]; a[y, x0 + 1] = ELE[1]                    # 다리
        for y in range(5, 10):
            for x in range(3, 10): a[y, x] = R[2] if y < 9 else G[2]                             # 붉은 덮개 + 금 테
        for y in range(1, 5):
            for x in range(4, 9): a[y, x] = G[3] if y > 2 else R[3]                              # 하우다(가마)
    else:   # 정면(남향): 넓은 귀 + 머리 + 길게 늘어진 코 + 상아, 등 위 붉은 덮개
        for y in range(1, 5):
            for x in range(3, 13): a[y, x] = R[2] if y < 4 else G[2]
        for y in range(16):
            for x in range(16):
                for ex in (2.6, 12.4):
                    if ((x - ex) / 2.4) ** 2 + ((y - 7) / 3.4) ** 2 <= 1: a[y, x] = ELE[1] if abs(x - ex) > 1 else ELE[2]
                if ((x - 7.5) / 3.6) ** 2 + ((y - 7) / 3.6) ** 2 <= 1: a[y, x] = ELE[3] if x < 7 else ELE[2]
        for y in range(10, 16): a[y, 7] = ELE[3] if y < 13 else ELE[2]; a[y, 8] = ELE[2]
        a[15, 8] = ELE[1]
        for (x, y) in ((5, 10), (5, 11), (10, 10), (10, 11)): a[y, x] = MB[4] if y == 10 else MB[3]
        a[6, 6] = DARK; a[6, 9] = DARK
        for x0 in (3, 11):
            for y in range(12, 16): a[y, x0] = ELE[2]; a[y, x0 + 1] = ELE[1]
    return outline(a, ELE[0])

# ---------------------------------------------------------------- 47형 지면
def region47(m, base, inner, face, F=2, rim=None, edge=None):
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
BED = {tuple(Hx(c)[:3]): Hx(d) for c, d in (('#3c7c12', '#2e6a14'), ('#438d17', '#3a7e1a'), ('#5c9c25', '#4a8e22'))}
def char_inner(var):
    # a(기본) = 꽃 화단 + 타일 경계 산책길(이웃 타일과 2px 길) / b = 가운데 연못·분수 / c = 십자 수로(대리석 테)
    def f(x, y):
        if x in (0, 15) or y in (0, 15): return RS[4] if (x + y) % 4 else RS[3]
        if var == 'c':
            if x in (7, 8) or y in (7, 8): return AQUA[3] if (x + y) % 3 else AQUA[2]
            if x in (6, 9) or y in (6, 9): return MB[3]
        if var == 'b':
            if 6 <= x <= 9 and 6 <= y <= 9: return AQUA[4] if (x, y) in ((7, 7), (8, 8)) else AQUA[3] if (x + y) % 2 else AQUA[2]
            if 5 <= x <= 10 and 5 <= y <= 10: return MB[3]
        if x in (1, 14) or y in (1, 14): return LEAF[2]
        if (x * 5 + y * 3) % 11 == 0: return FLOWER[(x + y) % 3]
        return BED.get(tuple(GRASS[y, x][:3]), LEAF[3])
    return f
def soil_inner(var):
    def f(x, y):
        c = SOIL[3] if (x * 3 + y * 5) % 11 else SOIL[1] if (x + y) % 7 == 0 else SOIL[2]
        if var == 'b' and (x, y) in ((4, 5), (11, 10), (12, 3)): c = MB[1]                          # 돌 조각
        if var == 'c' and (x * 7 + y * 11) % 17 == 0: c = Hx('#5c9c25')                              # 마른 풀 포기
        return c
    return f

# ---------------------------------------------------------------- 목록(요구서 구간 고정)
FR = {}
def put(idx, n, a, kind, walk, st):
    assert START <= idx <= END and idx not in FR, (idx, n); FR[idx] = (n, x2(a), kind, walk, st)
def put_list(idx0, lst, st):
    for i, (n, a, kind, walk) in enumerate(lst): put(idx0 + i, n, a, kind, walk, st)
put_list(4500, [(f'ov_iwall_{m}', iwall(m), 'overlay', 'block') for m in range(16)], 'structure')
put_list(4516, [('ov_iwall_gate_h', iwall(E_ | W_, 'gate_h'), 'overlay', 'pass'), ('ov_iwall_gate_v', iwall(N_ | S_, 'gate_v'), 'overlay', 'pass'),
                ('ov_iwall_arch_h', iwall(E_ | W_, 'arch_h'), 'overlay', 'pass'), ('ov_iwall_arch_v', iwall(N_ | S_, 'arch_v'), 'overlay', 'pass'),
                ('ov_iwall_breach_h', iwall(E_ | W_, 'breach_h'), 'overlay', 'pass'), ('ov_iwall_breach_v', iwall(N_ | S_, 'breach_v'), 'overlay', 'pass')], 'structure')
put_list(4522, [(n, t, 'overlay', 'block') for n, t in split(chhatri(), 'ov_chhatri')], 'structure')
put_list(4530, [('ov_ihouse_a', ihouse('a'), 'overlay', 'block'), ('ov_ihouse_b', ihouse('b'), 'overlay', 'block'), ('ov_ihouse_c', ihouse('c'), 'overlay', 'block')]
         + [(n, t, 'overlay', 'block') for n, t in split(haveli(), 'ov_haveli')], 'structure')
put_list(4540, [(n, t, 'overlay', 'tent') for n, t in split(shamiana(), 'ov_shamiana')] + [('ov_itent', itent(), 'overlay', 'tent')], 'structure')
put_list(4545, [('ov_cartwall_h', cart('h'), 'overlay', 'block'), ('ov_cartwall_v', cart('v'), 'overlay', 'block'), ('ov_cartwall_end', cart('end'), 'overlay', 'block')], 'structure')
put_list(4550, [(f'ov_iflag_{c}', iflag(c), 'overlay', 'block') for c in ('green', 'red', 'saffron')], 'structure')
put_list(4553, [(n, t, 'overlay', 'block') for n, t in split(banyan(), 'ov_banyan')] + [('ov_ipalm', ipalm(), 'overlay', 'block'), ('ov_stepwell', stepwell(), 'overlay', 'pass'), ('ov_cannon', cannon(), 'overlay', 'pass')], 'structure')
put_list(4560, [('ov_elephant_h', elephant('h'), 'overlay', 'block'), ('ov_elephant_v', elephant('v'), 'overlay', 'block')], 'structure')
CH_FACE = [MB[2], MB[1]]
put_list(4600, [(f'ichar47_{m}', region47(m, GRASS, char_inner('a'), CH_FACE, F=2, rim=MB[3], edge=GRASS_SH), 'ground', 'map_rule') for m in MASKS]
         + [('ichar_fill_b', region47(255, GRASS, char_inner('b'), CH_FACE, F=2, rim=MB[3], edge=GRASS_SH), 'ground', 'pass'),
            ('ichar_fill_c', region47(255, GRASS, char_inner('c'), CH_FACE, F=2, rim=MB[3], edge=GRASS_SH), 'ground', 'pass')], 'garden')
SO_FACE = [SOIL[1], SOIL[0]]
put_list(4650, [(f'redsoil47_{m}', region47(m, GRASS, soil_inner('a'), SO_FACE, F=2, rim=SOIL[4], edge=GRASS_SH), 'ground', 'map_rule') for m in MASKS]
         + [('redsoil_fill_b', region47(255, GRASS, soil_inner('b'), SO_FACE, F=2, rim=SOIL[4], edge=GRASS_SH), 'ground', 'pass'),
            ('redsoil_fill_c', region47(255, GRASS, soil_inner('c'), SO_FACE, F=2, rim=SOIL[4], edge=GRASS_SH), 'ground', 'pass')], 'redsoil')
FR = dict(sorted(FR.items()))
BY = {v[0]: v[1] for v in FR.values()}

# ---------------------------------------------------------------- QA
allowed = {tuple(c[:3]) for c in RS + MB + OC + WOOD + IRON + BRONZE + ELE + LEAF + PALM + SOIL + AQUA + FLOWER + sum(CLOTH.values(), []) + [DARK, GRASS_SH, Hx('#5c9c25')] + list(BED.values())}
allowed |= set(map(tuple, GRASS.reshape(-1, 4)[:, :3].tolist()))
errs, items = check(FR, allowed)
SETS_R = {}
for idx, (n, im, kind, walk, st) in FR.items(): SETS_R.setdefault(st, [idx, idx]); SETS_R[st][1] = idx
qa = {'date': '2026-11-03', 'author': '안아트', 'calls': 0, 'sheet': f'public/assets/tiles/tileset_v2/{KEY}.png', 'start': START, 'count': len(FR), 'sets': SETS_R, 'errors': errs, 'items': items, 'seam4': {}}
b = seam4(BY, 'ov_iwall', {'gate_h': E_ | W_, 'gate_v': N_ | S_, 'arch_h': E_ | W_, 'arch_v': N_ | S_, 'breach_h': E_ | W_, 'breach_v': N_ | S_}); qa['seam4']['ov_iwall'] = b[:12]
if b: qa['errors'].append(f'ov_iwall 이음 {len(b)}')
# 수레벽 사슬 이음(가로: 좌우 끝 열, 세로: 위아래 끝 행)
ch = np.array(BY['ov_cartwall_h']); cv = np.array(BY['ov_cartwall_v'])
qa['cartwall_seam'] = {'h': bool(np.array_equal(ch[:, 0:2], ch[:, 30:32])), 'v': bool(np.array_equal(cv[0:2], cv[30:32]))}
if not all(qa['cartwall_seam'].values()): qa['errors'].append('수레벽 사슬 이음')
r = shape_seam(F=2); qa['ichar_redsoil_shape_seam'] = r
if r['jumps_gt_1px']: qa['errors'].append('47형 이음 오류')
sheet = sheet_of(FR, START); qa['sheet_size'] = list(sheet.size); qa['keep_unchanged'] = all(sha_f(p) == h for p, h in before.items())

# ---------------------------------------------------------------- 미리보기: 성곽 + 마을 + 진영 + 정원 + 붉은 흙
SC = ['gggggggggggggggggggggg',
      'gWWWWWGWWWWWggggSSSSgg',
      'gWgggggggggWgggSSSSSSg',
      'gWgCCCCCCCgWggggSSSSgg',
      'gWgCCCCCCCgAgggggggggg',
      'gWgCCCCCCCgWgggggggggg',
      'gWWWWXWWWWWWgggggggggg',
      'gggggggggggggggggggggg',
      'gggggggggggggggggggggg',
      'ggggggggggggggKKKKKKgg',
      'gggggggggggggggggggggg',
      'gggggggggggggggggggggg']
Hh, Ww = len(SC), len(SC[0]); out = Image.new('RGBA', (Ww * 32, Hh * 32)); G2 = x2(GRASS)
for y in range(Hh):
    for x in range(Ww):
        c = SC[y][x]; base = G2
        if c == 'C': base = BY[f'ichar47_{mask47(SC, x, y, "C")}'] if mask47(SC, x, y, 'C') != 255 else BY[('ichar47_255', 'ichar_fill_b', 'ichar_fill_c')[(x * 3 + y) % 3]]
        if c == 'S': base = BY[f'redsoil47_{mask47(SC, x, y, "S")}']
        out.paste(base, (x * 32, y * 32))
for y in range(Hh):
    for x in range(Ww):
        c = SC[y][x]
        if c in 'WGAX':
            m = mask4(SC, x, y, 'WGAX'); hv = 'h' if m & (E_ | W_) else 'v'
            out.alpha_composite(BY[{'G': f'ov_iwall_gate_{hv}', 'A': f'ov_iwall_arch_{hv}', 'X': f'ov_iwall_breach_{hv}'}.get(c, f'ov_iwall_{m}')], (x * 32, y * 32))
        if c == 'K':
            m = mask4(SC, x, y, 'K'); n = 'ov_cartwall_end' if not (m & E_) else 'ov_cartwall_h'
            out.alpha_composite(BY[n], (x * 32, y * 32))
def blit(prefix, cx, cy, R=2, C=2):
    for r_ in range(R):
        for c_ in range(C): out.alpha_composite(BY[f'{prefix}_{r_}{c_}'], ((cx + c_) * 32, (cy + r_) * 32))
blit('ov_chhatri', 12, 0); blit('ov_haveli', 1, 8); blit('ov_shamiana', 8, 8); blit('ov_banyan', 18, 5)
for i, n in enumerate(('ov_ihouse_a', 'ov_ihouse_b', 'ov_ihouse_c')): out.alpha_composite(BY[n], ((3 + i) * 32, 9 * 32))
for i, n in enumerate(('ov_itent', 'ov_iflag_green', 'ov_iflag_red', 'ov_iflag_saffron', 'ov_elephant_h', 'ov_elephant_v', 'ov_cannon')): out.alpha_composite(BY[n], ((10 + i) * 32 if i < 4 else (11 + i) * 32, 10 * 32 if i < 4 else 11 * 32))
out.alpha_composite(BY['ov_ipalm'], (16 * 32, 5 * 32)); out.alpha_composite(BY['ov_stepwell'], (14 * 32, 7 * 32))
for y in range(9, 12): out.alpha_composite(BY['ov_cartwall_v'], (21 * 32, y * 32))
out.convert('RGB').resize((out.width * 2, out.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'india_scene_x2.png'))
sheet_prev = Image.new('RGBA', sheet.size, (40, 40, 48, 255)); sheet_prev.alpha_composite(sheet)
sheet_prev.convert('RGB').resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'india_sheet_x2.png'))
json.dump(qa, open(os.path.join(OUTD, 'art_india_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('count', len(FR), SETS_R, 'errors', qa['errors'][:6], 'seam4', len(qa['seam4']['ov_iwall']), qa['cartwall_seam'], r, 'keep', qa['keep_unchanged'], 'sheet', sheet.size)

if APPLY:
    if qa['errors']: raise SystemExit('QA 오류 — apply 중단')
    MAPF = 'docker/gemini/tileset_v2/art_india/india_tiles_mapping.json'
    note = '인도(무굴·로디, ch22·ch18_s6): 붉은 사암 성벽 16형(대리석 갓돌)·뾰족 아치 성문·아치·틈·차트리 2x2·민가 3·하벨리 2x2·샤미아나 2x2·작은 천막·수레벽·무지 깃발·반얀·야자·계단 우물·사석포·코끼리(장식) + 차르바그 정원 47형 + 데칸 붉은 흙 47형'
    vn = '16세기 무굴·로디 건축 일반화(붉은 사암·대리석 테, 돔 꼭대기 상징 없음). 무굴과 로디 양식 구분은 하지 않음. 코끼리·수레벽은 파니파트 전승 일반화'
    cnt, by = apply(TVP, KEY, START, END, FR, sheet, SETS_R, TAG, 'art_india.py', f'안아트 art_india.py(2026-11-03): {note}. 프레임 = 전역-{START}', vn, 'docker/gemini/tileset_v2/art_india/art_india_qa.json', MAPF)
    rules = {'ov_iwall_<m4>': '붉은 사암 총안 성벽 16형(m4 = N1 E2 S4 W8). 불통(W)', 'ov_iwall_gate_h/v': '아치형 성문(나무 문짝). 통행(c)', 'ov_iwall_arch_h/v': '문 없는 뾰족 아치. 통행(c)',
             'ov_iwall_breach_h/v': '무너진 틈. 통행(p)', 'ov_chhatri_<r><c>': '차트리(기둥 정자 탑) 2x2. 불통 — 성 모서리', 'ov_ihouse_a/b/c': '평지붕 민가(a 흰 회벽·b 황토·c 붉은 사암). 불통(W) 또는 마을(v) 덧그림',
             'ov_haveli_<r><c>': '하벨리 2x2(안뜰·자로카 발코니). 불통', 'ov_shamiana_<r><c>': '샤미아나 기둥 차양 장막 2x2. kind tent(v)', 'ov_itent': '작은 천막 1x1. kind tent',
             'ov_cartwall_h/v/end': '사슬로 묶은 수레벽(가로·세로·끝 수레). 불통(k). 가로는 좌우, 세로는 위아래로 사슬이 이어짐', 'ov_iflag_green/red/saffron': '무지 깃발. 불통 소품',
             'ov_banyan_<r><c>': '반얀 2x2. 숲(f) 칸 덧그림(불통 표기는 맵 규칙에 따름)', 'ov_ipalm': '야자. 숲 칸 덧그림', 'ov_stepwell': '계단 우물 1x1. 통행 칸 소품', 'ov_cannon': '사석포. 통행 칸 소품',
             'ov_elephant_h/v': '전투 코끼리 장식 오브젝트(유닛 아님). 불통', 'ichar47_<mask>': '차르바그 정원 47형(사암 산책길·꽃 화단, 바깥 = 풀). 평지(p)', 'ichar_fill_b/c': '정원 안쪽 변형(b 연못·분수, c 십자 수로). 수로가 이어지지 않으므로 c 는 정원 가운데 한두 칸에만',
             'redsoil47_<mask>': '데칸 붉은 흙 47형(바깥 = 풀). 평지(p)', 'redsoil_fill_b/c': '붉은 흙 안쪽 변형(b 돌 조각, c 마른 풀)'}
    mapping(os.path.join(ROOT, MAPF), f'안아트 2026-11-03 {note}. 시트 public/assets/tiles/tileset_v2/{KEY}.png, 전역 {START}~{max(FR)}(프레임 = 전역-{START}, 빈 칸 4526~4529·4537~4539·4548~4549·4562~4599·4649 투명). 이름 = tv2_names.json / tileset_v2_map.json index_map_static14_india',
            SETS_R, rules, items, KEY, START, cnt)
    print('applied', KEY, START, max(FR), cnt, by)
