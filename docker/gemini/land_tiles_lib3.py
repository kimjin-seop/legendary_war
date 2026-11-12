"""land_set 3부: 성벽·성문·성내 바닥·계단·망루, 기와지붕·한옥 벽체·작은 집·초가, 울타리·돌담, 설원·사막·늪.
3/4 내려다보기(윗면 + 정면), 광원 좌상단, 외곽은 재질별 최암색. 이미지 생성 모델 호출 0회.
역사 고증: 조선 읍성 석축(장대석 층쌓기)·여장(성가퀴), 기와(회청색 암·수키와), 초가 — 세부 형태는 단순화(verify)."""
import numpy as np
from land_tiles_lib import T, GR, ST, SD, DT, RF, PL, WD, LQ, SN, DS, MW, FO, hx, ramp, stamp, put, shade_map, smooth_noise, grass_tile, bay

# ---------- 공용 ----------

def masonry(img, x0, y0, x1, y1, seed, course=5, wmin=6, wmax=11, pal=ST, base=4, period=32):
    """장대석 층쌓기(가로 주기 period 로 이음새 없음). 돌마다 명암 ±1, 윗·왼 변 밝게, 아래·오른 줄눈 어둡게"""
    rng = np.random.default_rng(seed)
    y = y0; row = 0
    while y < y1:
        h = min(course, y1 - y)
        # 한 줄의 줄눈 위치(주기 내)
        xs = [int(rng.integers(0, wmin))]
        while True:
            nx = xs[-1] + int(rng.integers(wmin, wmax + 1))
            if nx >= xs[0] + period - wmin + 1: break
            xs.append(nx)
        tones = rng.choice([-1, 0, 0, 1], len(xs))
        for x in range(x0, x1):
            px = (x - x0) % period
            seg = None
            for i, sx in enumerate(xs):
                ex = xs[i + 1] if i + 1 < len(xs) else xs[0] + period
                for q in (px, px + period):
                    if sx <= q < ex: seg = (i, sx, ex, q)
            i, sx, ex, q = seg
            for yy in range(y, y + h):
                c = base + tones[i]
                if yy == y: c += 1
                if q == sx: c += 1
                if yy == y + h - 1 or q == ex - 1: c = base - 2
                if (yy - y) == 1 and (q - sx) == 1: c += 1
                img[yy, x] = pal[int(np.clip(c, 0, len(pal) - 1))]
        y += h; row += 1


def fill(img, x0, y0, x1, y1, col):
    img[y0:y1, x0:x1] = col


# ---------- 성벽(정면 3/4: 여장 윗면 + 여장 면 + 성벽 면) ----------

def wall_face(seed, coping=True, moss=0):
    img = np.zeros((T, T, 3), np.uint8)
    # 여장 윗면(밝음) y0-2, 여장 면 y3-8 (총안 구멍), 그늘 y9, 성벽 면 y10-31
    fill(img, 0, 0, 32, 3, ST[6]); fill(img, 0, 0, 32, 1, ST[7])
    masonry(img, 0, 3, 32, 9, seed + 1, course=3, wmin=4, wmax=6, base=5)
    # 타구(凹 사이 틈): 8칸 간격 어두운 틈
    for gx in (7, 23):
        fill(img, gx, 0, gx + 2, 6, ST[1]); fill(img, gx, 6, gx + 2, 7, ST[2])
        img[0:6, gx + 2] = ST[4]
    # 총안(작은 구멍)
    for hx_ in (14, 30):
        img[5:7, hx_] = ST[0]; img[5:7, hx_ + 1] = ST[2]
    fill(img, 0, 9, 32, 10, ST[1])
    masonry(img, 0, 10, 32, 31, seed, course=5, wmin=7, wmax=12, base=4)
    fill(img, 0, 31, 32, 32, ST[1])
    rng = np.random.default_rng(seed)
    for _ in range(moss):
        x, y = int(rng.integers(1, 30)), int(rng.integers(20, 30))
        img[y, x] = GR[3]; img[y, x + 1] = GR[2]; img[y + 1, x] = GR[2]
    return img


def wall_top_v(seed):
    """세로로 이어지는 성벽(윗면 내려다보기): 가운데 성곽길, 양쪽 여장. 90도 회전하면 가로 윗면"""
    img = np.zeros((T, T, 3), np.uint8)
    masonry(img, 0, 0, 32, 32, seed, course=4, wmin=5, wmax=8, base=5, pal=ST)  # 길 바닥(판석)
    img[:] = np.rot90(img, 1)[:32, :32]
    for x0, x1, lit in ((0, 7, True), (25, 32, False)):
        fill(img, x0, 0, x1, 32, ST[6] if lit else ST[4])
        for y in range(0, 32, 8):
            fill(img, x0, y + 6, x1, y + 8, ST[2])  # 타구 틈
        img[:, x0] = ST[7] if lit else ST[5]
        img[:, x1 - 1] = ST[3] if lit else ST[1]
    img[:, 7] = ST[2]; img[:, 24] = ST[5]  # 안쪽 그늘/밝은 턱
    return img


def tower(seed, roof=True):
    """모서리 망루(각루): 아래 석축 정면 + 여장 고리 + 기와 우진각 지붕(성벽과 실루엣 구분)"""
    img = np.zeros((T, T, 3), np.uint8)
    masonry(img, 0, 21, 32, 31, seed, course=5, wmin=6, wmax=10, base=4)
    fill(img, 0, 31, 32, 32, ST[1])
    fill(img, 0, 0, 32, 21, ST[6]); img[0, :] = ST[7]; img[:21, 0] = ST[7]; img[:21, 31] = ST[4]
    fill(img, 0, 19, 32, 21, ST[5]); img[20, :] = ST[2]
    for x in (5, 13, 21, 28):
        fill(img, x, 0, x + 2, 3, ST[2])
    if roof:  # 우진각 지붕(3/4): 용마루(짧은 가로) -> 앞면 사다리꼴 + 좌우 삼각면, 처마 귀 솟음
        ry, rx0, rx1 = 4, 11, 21   # 용마루 높이·양 끝
        ye, ex0, ex1 = 17, 2, 30   # 처마 선·양 끝
        sil = np.zeros((T, T), bool); facet = {}
        for y in range(ry, ye + 1):
            t = (y - ry) / (ye - ry)
            xl = rx0 + (ex0 - rx0) * min(1, t * 1.25); xr = rx1 + (ex1 - rx1) * min(1, t * 1.25)
            for x in range(int(round(xl)), int(round(xr))):
                sil[y, x] = True
                # 면 구분: 용마루 끝 -> 처마 귀 대각선
                if x < rx0 and (rx0 - x) > (y - ry) * (rx0 - ex0) / (ye - ry) - 0.5: facet[(x, y)] = 'L'
                elif x >= rx1 and (x - rx1) > (y - ry) * (ex1 - rx1) / (ye - ry) - 1.5: facet[(x, y)] = 'R'
                else: facet[(x, y)] = 'F'
        for (x, y), f in facet.items():
            k = {'L': 5, 'F': 4, 'R': 2}[f]
            if f == 'F' and x % 3 == 2: k = 3
            if f == 'L' and (x + y) % 3 == 0: k = 4
            if f == 'R' and (x - y) % 3 == 0: k = 1
            img[y, x] = RF[k]
        for y, x in zip(*np.nonzero(sil)):
            if not sil[y, x - 1] or (x + 1 < T and not sil[y, x + 1]) or not sil[y - 1, x]: img[y, x] = RF[0]
        img[ry, rx0 - 1:rx1 + 1] = RF[0]; img[ry + 1, rx0:rx1] = RF[6]  # 용마루
        img[ye, ex0:ex1] = RF[6]; img[ye + 1, ex0:ex1] = RF[0]  # 처마 끝 + 그늘
        img[ye - 1, ex0 - 1] = RF[6]; img[ye - 2, ex0 - 1] = RF[5]; img[ye - 1, ex1] = RF[4]; img[ye - 2, ex1] = RF[3]  # 귀 솟음
        fill(img, 6, ye + 2, 8, 21, LQ[1]); fill(img, 24, ye + 2, 26, 21, LQ[1])  # 붉은 기둥
    else:
        fill(img, 5, 5, 27, 17, ST[3]); fill(img, 5, 5, 27, 7, ST[1])
    return img


def gate(seed):
    """성문: 홍예(아치) 석문 + 두 짝 판문(정 박힘)"""
    img = wall_face(seed)
    cx = 16
    for y in range(10, 32):
        for x in range(5, 27):
            dx = x + 0.5 - cx
            top = 13 + (dx * dx) / 22  # 아치
            if y >= top: img[y, x] = WD[2] if x < cx else WD[1]
    for y in range(10, 32):
        for x in range(4, 28):
            dx = x + 0.5 - cx; top = 13 + (dx * dx) / 22
            if top - 2.2 <= y < top and 5 <= x < 27: img[y, x] = ST[6] if x < cx else ST[5]  # 홍예석
            if top - 0.9 <= y < top + 0.2 and 5 <= x < 27: img[y, x] = ST[2]
    for x in range(6, 26):
        for y in range(16, 32):
            dx = x + 0.5 - cx
            if y < 13 + (dx * dx) / 22: continue
            if (x - 6) % 4 == 3: img[y, x] = WD[0]  # 널 줄
            if y in (19, 26) and x % 3 == 1: img[y, x] = ST[6]  # 정
    img[14:32, cx - 1] = WD[0]; img[14:32, cx] = WD[0]
    img[22, cx - 3] = ST[7]; img[22, cx + 2] = ST[7]  # 문고리
    fill(img, 5, 30, 27, 32, ST[2])
    return img


def door_house(seed):
    """민가 출입문(한옥 판문 두 짝 + 문틀 + 댓돌). 성문 아님 — 9번 대체용은 gate()"""
    img = hanok_wall('C', seed)
    fill(img, 9, 7, 23, 27, WD[1])
    fill(img, 10, 8, 22, 27, WD[3])
    for x in range(10, 22):
        if (x - 10) % 3 == 2: img[8:27, x] = WD[2]
    img[8:27, 15] = WD[0]; img[8:27, 16] = WD[1]
    img[8, 10:22] = WD[4]
    img[17, 14] = ST[7]; img[17, 17] = ST[7]
    fill(img, 8, 27, 24, 29, ST[5]); img[27, 8:24] = ST[6]
    return img


def stairs(seed):
    img = np.zeros((T, T, 3), np.uint8)
    fill(img, 0, 0, 32, 32, ST[3])
    for i, y in enumerate(range(1, 27, 5)):
        fill(img, 3, y, 29, y + 2, ST[6] if i else ST[5])  # 디딤면
        fill(img, 3, y + 2, 29, y + 5, ST[3])  # 챌면
        img[y, 3:29] = ST[7]
        img[y + 4, 3:29] = ST[1]
    fill(img, 0, 0, 3, 32, ST[5]); fill(img, 29, 0, 32, 32, ST[2])  # 소맷돌
    img[:, 0] = ST[6]; img[:, 31] = ST[1]
    return img


# ---------- 성내 바닥(성벽 회청과 구분되는 따뜻한 화강암) ----------
WS = ramp('2e2a26', '45403a', '5e5850', '7a7368', '958d80', 'b0a898', 'cac2b2', 'e2dccc')


def paving(seed, kind='slab', pal=WS):
    ST = pal
    img = np.zeros((T, T, 3), np.uint8)
    if kind == 'slab':  # 큰 박석(불규칙 판석)
        masonry(img, 0, 0, 32, 32, seed, course=8, wmin=8, wmax=14, base=4, pal=pal)
    elif kind == 'brick':  # 작은 전돌(엇갈림)
        masonry(img, 0, 0, 32, 32, seed, course=4, wmin=8, wmax=8, base=4, pal=pal)
    else:  # 'square' 정방형 판석 2x2 + 가운데 모서리 장식
        for by in (0, 16):
            for bx in (0, 16):
                fill(img, bx, by, bx + 16, by + 16, ST[4])
                img[by, bx:bx + 16] = ST[5]; img[by:by + 16, bx] = ST[5]
                img[by + 15, bx:bx + 16] = ST[2]; img[by:by + 16, bx + 15] = ST[2]
                img[by + 1, bx + 1:bx + 15] = ST[6]
    rng = np.random.default_rng(seed)
    n = smooth_noise(rng, cell=8)
    for y in range(T):
        for x in range(T):
            if n[y, x] > 0.55 and (x + y) % 2 == 0 and tuple(img[y, x]) == tuple(ST[4]): img[y, x] = ST[3]
    for _ in range(2):  # 줄눈 이끼
        x, y = int(rng.integers(2, 29)), int(rng.integers(2, 29))
        if tuple(img[y, x]) == tuple(ST[2]): img[y, x] = GR[3]
    return img


# ---------- 기와 지붕 ----------

def roof_tex(seed, img=None, x0=0, y0=0, x1=T, y1=T):
    """기와골(수키와 줄 4px 주기, 왼쪽 밝음) + 기와 단(6px) 그림자. 가로·세로 주기 32"""
    if img is None: img = np.zeros((T, T, 3), np.uint8)
    rng = np.random.default_rng(seed)
    for y in range(y0, y1):
        for x in range(x0, x1):
            u = x % 4; v = y % 6
            k = [4, 5, 3, 1][u]
            if v == 5: k = max(0, k - 2)
            if v == 0 and u in (0, 1): k += 1
            img[y, x] = RF[int(np.clip(k, 0, 6))]
    for _ in range(3):  # 오래된 기와 얼룩
        x, y = int(rng.integers(x0, x1)), int(rng.integers(y0, y1))
        if (x % 4) in (0, 1): img[y, x] = RF[3]
    return img


def roof_patch(img, x0, y0, x1, y1, seed):
    roof_tex(seed, img, x0, y0, x1, y1)
    img[y0, x0:x1] = RF[0]; img[y0 + 1, x0:x1] = RF[5]
    img[y1 - 1, x0:x1] = RF[0]; img[y1 - 2, x0:x1] = RF[6]


def roof_piece(row, col, seed, grass=None):
    """row: top|mid|bot, col: L|C|R. top = 용마루, bot = 처마(서까래 끝 + 그늘). L/R = 박공 끝(바깥 1px 테)"""
    img = roof_tex(seed)
    if row == 'top':
        fill(img, 0, 0, 32, 7, RF[2])
        img[0, :] = RF[0]; img[1, :] = RF[5]; img[2, :] = RF[4]; img[5, :] = RF[1]; img[6, :] = RF[0]
        for x in range(0, 32, 3): img[3, x] = RF[3]
    if row == 'bot':
        fill(img, 0, 24, 32, 27, RF[5]); img[24, :] = RF[6]  # 처마 끝 막새줄
        for x in range(1, 32, 4): img[25:27, x] = RF[2]
        fill(img, 0, 27, 32, 32, RF[0])  # 처마 밑 그늘
        for x in range(2, 32, 4): img[28, x] = WD[2]; img[28, x + 1] = WD[1]  # 서까래 끝
    if col in ('L', 'R'):
        e = 0 if col == 'L' else 31; i1 = 1 if col == 'L' else 30
        img[:, e] = RF[0]; img[:, i1] = RF[6] if col == 'L' else RF[2]
        if row == 'bot':  # 처마 귀 솟음
            img[22:24, e] = RF[6]; img[23, i1] = RF[6]
    return img


def hanok_wall(col, seed, window=False):
    """한옥 벽체: 위 그늘(처마 밑) + 기둥(나무) + 회벽 + 아래 댓돌·기단. col L/C/R 기둥 위치"""
    img = np.zeros((T, T, 3), np.uint8)
    fill(img, 0, 0, 32, 4, RF[0]); img[3, :] = WD[1]
    fill(img, 0, 4, 32, 26, PL[2])
    img[4, :] = WD[2]; img[5, :] = WD[3]; img[6, :] = WD[1]  # 창방(가로 부재)
    img[24, :] = WD[1]; img[25, :] = WD[2]  # 하인방
    posts = {'L': [1], 'C': [], 'R': [27]}[col]
    for px in posts + [15]:
        fill(img, px, 4, px + 4, 26, WD[3]); img[4:26, px] = WD[4]; img[4:26, px + 3] = WD[1]
    for px0 in (5, 20):
        img[8:23, px0] = PL[1]  # 회벽 면 분할선
    if window:
        fill(img, 5, 9, 14, 20, WD[1]); fill(img, 6, 10, 13, 19, PL[3])
        for y in range(10, 19, 3): img[y, 6:13] = WD[2]
        for x in range(6, 13, 3): img[10:19, x] = WD[2]
        fill(img, 19, 9, 28, 20, WD[1]); fill(img, 20, 10, 27, 19, PL[3])
        for y in range(10, 19, 3): img[y, 20:27] = WD[2]
        for x in range(20, 27, 3): img[10:19, x] = WD[2]
    masonry(img, 0, 26, 32, 31, seed, course=5, wmin=6, wmax=10, base=4)
    img[26, :] = ST[6]; fill(img, 0, 31, 32, 32, ST[1])
    return img


def house_small(grass, seed, thatch=False):
    """한 칸짜리 민가: 지붕(기와 또는 초가) + 회벽 + 문, 풀 바탕·오른쪽 아래 그림자"""
    img = grass.copy()
    sh = np.zeros((T, T), bool); sh[6:31, 27:31] = True; sh[29:31, 5:31] = True
    img = shade_map(img, sh, GR, -2)
    # 벽체
    fill(img, 4, 17, 28, 28, PL[2]); img[17:28, 4] = WD[3]; img[17:28, 27] = WD[1]
    img[17:28, 15] = WD[3]; img[17:28, 16] = WD[1]
    fill(img, 11, 19, 15, 28, WD[2]); fill(img, 17, 19, 21, 28, WD[2]); img[19:28, 14] = WD[1]; img[19:28, 17] = WD[3]
    fill(img, 6, 19, 10, 23, WD[1]); fill(img, 7, 20, 9, 22, PL[3])
    fill(img, 22, 19, 26, 23, WD[1]); fill(img, 23, 20, 25, 22, PL[3])
    fill(img, 3, 28, 29, 30, ST[4]); img[28, 3:29] = ST[6]; img[29, 3:29] = ST[2]
    if not thatch:
        for y in range(3, 18):
            spread = int((y - 3) * 0.25)
            xa, xb = 4 - spread, 28 + spread
            roof_tex(seed, img, max(1, xa), y, min(31, xb), y + 1)
            img[y, max(1, xa)] = RF[0]; img[y, min(30, xb - 1)] = RF[0]
        fill(img, 5, 2, 27, 5, RF[1]); img[2, 5:27] = RF[0]; img[3, 5:27] = RF[5]; img[4, 5:27] = RF[2]
        img[1:4, 4] = RF[5]; img[1:4, 27] = RF[3]; img[1, 3] = RF[6]; img[1, 28] = RF[4]  # 용마루 끝 솟음
        img[17, 1:31] = RF[6]; img[18, 2:30] = RF[0]
        img[15:17, 1] = RF[6]; img[15:17, 30] = RF[4]  # 처마 귀
    else:
        TH = ramp('5a4018', '7e5a24', 'a07830', 'c09a48', 'dcbc6c', 'f0d890')
        for y in range(3, 19):
            r = 13.5 + min(3, (y - 3) * 0.6)
            for x in range(T):
                dx = x + 0.5 - 16
                if abs(dx) < r:
                    t = dx / r
                    k = 3 - (1 if t > 0.35 else 0) + (1 if t < -0.4 else 0) - (1 if y > 16 else 0)
                    if (x * 3 + y) % 5 == 0: k -= 1
                    if y in (7, 12) and (x % 2 == 0): k = 1  # 새끼줄
                    img[y, x] = TH[int(np.clip(k, 0, 5))]
        for x in range(T):
            dx = x + 0.5 - 16
            if abs(dx) < 15: img[18, x] = TH[0]
        for y in range(2, 6):
            for x in range(T):
                if abs(x + 0.5 - 16) < 9 - (5 - y) and y == 2: img[y, x] = TH[4]
    return img


# ---------- 울타리·돌담(풀 바탕) ----------

def fence(grass, horizontal=True):
    img = grass.copy()
    sh = np.zeros((T, T), bool); sh[18:20, :] = True
    img = shade_map(img, sh, GR, -2)
    img[12, :] = WD[3]; img[13, :] = WD[1]; img[16, :] = WD[3]; img[17, :] = WD[1]
    for px in (3, 19):
        fill(img, px, 9, px + 3, 19, WD[2]); img[9:19, px] = WD[4]; img[9:19, px + 2] = WD[0]; img[9, px:px + 3] = WD[4]
    return img if horizontal else np.rot90(img, -1).copy()


def lowwall(grass, seed, horizontal=True):
    """돌담(막돌 쌓기 + 기와 얹은 담 머리)"""
    img = grass.copy()
    sh = np.zeros((T, T), bool); sh[22:24, :] = True
    img = shade_map(img, sh, GR, -2)
    masonry(img, 0, 13, 32, 22, seed, course=3, wmin=3, wmax=6, base=4)
    roof_tex(seed, img, 0, 9, 32, 13); img[9, :] = RF[5]; img[12, :] = RF[0]
    img[22, :] = ST[1]
    return img if horizontal else np.rot90(img, -1).copy()


# ---------- 설원·사막·늪 ----------

def snow_tile(seed, bumps=2, grasses=0):
    rng = np.random.default_rng(seed)
    img = np.zeros((T, T, 3), np.uint8); img[:] = SN[4]
    n = smooth_noise(rng, cell=8)
    for y in range(T):
        for x in range(T):
            v = n[y, x] + rng.normal(0, 0.15)
            if v > 0.55: img[y, x] = SN[5]
            elif v < -0.55: img[y, x] = SN[3]
    for _ in range(bumps):  # 눈 둔덕(왼위 밝고 오른아래 푸른 그늘)
        cx, cy, r = rng.uniform(8, 24), rng.uniform(8, 24), rng.uniform(3, 5)
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                dx, dy = x + 0.5 - cx, (y + 0.5 - cy) * 1.6
                if dx * dx + dy * dy < r * r:
                    img[y, x] = SN[5] if dx + dy < -r * 0.3 else SN[2] if dx + dy > r * 0.5 else SN[4]
    for _ in range(grasses):
        x, y = int(rng.integers(3, 28)), int(rng.integers(3, 28))
        img[y, x] = DS[1]; img[y - 1, x + 1] = DS[2]; img[y, x + 2] = DS[1]; img[y + 1, x + 1] = SN[2]
    return img


def desert_tile(seed, rocks=0):
    rng = np.random.default_rng(seed)
    img = np.zeros((T, T, 3), np.uint8); img[:] = DS[3]
    for y in range(T):
        for x in range(T):
            w = np.sin((x * 0.35 + y * 0.9) + np.sin(x * 0.2) * 1.5)
            if w > 0.8: img[y, x] = DS[4]
            elif w < -0.85: img[y, x] = DS[2]
    for _ in range(rocks):
        x, y = int(rng.integers(5, 25)), int(rng.integers(5, 25))
        stamp(img, x, y, [".lm.", "lmmd", "dddd"], {'l': hx('d8c8a8'), 'm': hx('a89070'), 'd': DS[1]})
    return img


def swamp_tile(grass_dark, seed):
    rng = np.random.default_rng(seed)
    img = shade_map(grass_dark, np.ones((T, T), bool), GR, -1)
    for _ in range(2):
        cx, cy, rx, ry = rng.uniform(9, 23), rng.uniform(9, 23), rng.uniform(4, 7), rng.uniform(3, 4.5)
        for y in range(T):
            for x in range(T):
                d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
                if d < 1:
                    k = 2 if d > 0.55 else 1
                    if (y + 0.5 - cy) < -ry * 0.4 and d > 0.5: k = 0  # 윗 둑 그늘
                    img[y, x] = MW[k]
                    if d < 0.3 and (x + y) % 5 == 0: img[y, x] = MW[3]
                elif d < 1.35: img[y, x] = GR[2]
    for _ in range(4):  # 갈대
        x, y = int(rng.integers(3, 28)), int(rng.integers(6, 28))
        img[y - 3:y, x] = GR[6]; img[y - 4, x] = DT[2]; img[y, x] = GR[1]
    return img
