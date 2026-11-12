"""육상 타일(land_set) 절차 생성 공용 함수. 이미지 생성 모델 호출 0회.
원칙(style: 32x32, Point/NEAREST, 광원 좌상단, 외곽선은 순흑 대신 각 재질의 가장 어두운 색):
 - 바닥 텍스처(풀 3·모래 2)는 테두리 1px 링을 원본 TileMap.png 픽셀 그대로 유지 -> 기존 해안/여울/언덕(water_set 포함) 전이 타일과 이음새 픽셀 동일.
 - 전이 타일(숲 가장자리·길·풀↔모래·절벽)은 '월드 필드' 방식: 3x3 이웃 점유로 정의된 전역 함수에서 칸을 잘라냄 -> 인접 칸끼리 경계 픽셀이 자동으로 일치.
"""
import numpy as np

T = 32


def hx(s):
    s = s.lstrip('#'); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


def ramp(*hexes):
    return [hx(h) for h in hexes]


# ---- 팔레트(원본 TileMap 색을 축으로 명암 단계만 확장) ----
GR = ramp('2f4500', '4a6600', '6a8000', '7b9100', '86a500', 'a5bd00', 'bcd21a', 'd4e65c')  # 풀 0..7 (5=원본 바탕)
FO = ramp('001400', '002a00', '0f4500', '1d5e06', '397b00', '4f9a12', '6fbc2c', '9ad656')  # 수관
TR = ramp('2a1608', '4a2a10', '6e4019', '93591f')  # 줄기
ST = ramp('202126', '35363d', '4b4d56', '666873', '858894', 'a3a6b2', 'c2c5ce', 'e0e2e6')  # 석재
SD = ramp('9c7658', 'b8907a', 'cfae91', 'e6c0a0', 'ffcead', 'ffdcc0', 'fff0dc')  # 모래(4=원본)
DT = ramp('3e2a18', '5c4128', '7a5a38', '987448', 'b08c5a', 'c8a672', 'dcc08e')  # 흙길
RF = ramp('16191e', '23272e', '323740', '444a55', '58606c', '6f7886', '8e98a6')  # 기와(회청)
PL = ramp('8e8576', 'b8b0a0', 'd8d2c4', 'eeeae0')  # 회벽
WD = ramp('2e180a', '4e2c14', '74431e', '9a5c28', 'c07a38')  # 목재
LQ = ramp('5a1a12', '86281a', 'a8382a')  # 단청 붉은 기둥
SN = ramp('6f86a6', '93a8c4', 'b8c8dc', 'd8e4f0', 'eef4fa', 'ffffff')  # 눈
DS = ramp('8a6428', 'ae8438', 'cca450', 'e2be66', 'f2d27c', 'fae49c')  # 사막
MW = ramp('1e3028', '2c4438', '3c5848', '507060', '6a8a74')  # 늪 물

BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16


def bay(x, y):
    return BAYER[y % 4, x % 4]


def yy_xx(n=T):
    return np.mgrid[0:n, 0:n]


def smooth_noise(rng, n=T, cell=8, periodic=True):
    """주기 n 의 값 노이즈(격자 cell, 코사인 보간) -> -1..1"""
    g = n // cell
    lat = rng.uniform(-1, 1, (g + 1, g + 1))
    if periodic: lat[g, :] = lat[0, :]; lat[:, g] = lat[:, 0]
    y, x = yy_xx(n)
    fx = x / cell; fy = y / cell
    ix = fx.astype(int); iy = fy.astype(int)
    tx = fx - ix; ty = fy - iy
    tx = (1 - np.cos(tx * np.pi)) / 2; ty = (1 - np.cos(ty * np.pi)) / 2
    a = lat[iy, ix]; b = lat[iy, ix + 1]; c = lat[iy + 1, ix]; d = lat[iy + 1, ix + 1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def put(img, x, y, col, wrap=False):
    if wrap: x %= img.shape[1]; y %= img.shape[0]
    if 0 <= x < img.shape[1] and 0 <= y < img.shape[0]:
        img[y, x, :3] = col
        if img.shape[2] == 4: img[y, x, 3] = 255


def stamp(img, x0, y0, rows, pal, wrap=False, lo=0, hi=T):
    """문자 그림 찍기. pal: 문자 -> 색, '.'/' ' = 투명. lo/hi: 허용 영역(링 보호)"""
    for dy, row in enumerate(rows):
        for dx, ch in enumerate(row):
            if ch in '. ': continue
            x, y = x0 + dx, y0 + dy
            if not wrap and not (lo <= x < hi and lo <= y < hi): continue
            put(img, x, y, pal[ch], wrap)


def nearest_idx(col, pal):
    d = [int(np.sum((col.astype(int) - p.astype(int)) ** 2)) for p in pal]
    return int(np.argmin(d))


def shade_map(img, mask, pal, steps):
    """mask 픽셀을 팔레트(pal) 안에서 steps 단계 이동(음수=어둡게)"""
    out = img.copy()
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        i = nearest_idx(img[y, x, :3], pal)
        out[y, x, :3] = pal[max(0, min(len(pal) - 1, i + steps))]
    return out


def ring_mask(n=T, w=1):
    m = np.zeros((n, n), bool); m[:w, :] = m[-w:, :] = m[:, :w] = m[:, -w:] = True; return m


# ---- 풀 덤불(광원 좌상단: 끝 밝음, 밑동 어두움, 오른쪽 아래 그림자) ----
TUFTS = [
    ["h.h..", "lhl.h", "slsls", ".nsn."],
    ["..h..", "h.l.h", "lsls.", ".nsn."],
    ["h..h", "lhls", "nsln", ".nn."],
    [".h.", "hls", "sln", ".n."],
    ["h...h.", "l.h.lh", "slslsl", ".nsnsn"],
]
TUFT_PAL = {'h': GR[7], 'l': GR[6], 's': GR[4], 'n': GR[2], 'd': GR[1]}
SOFT_PAL = {'h': GR[6], 'l': GR[6], 's': GR[4], 'n': GR[3], 'd': GR[3]}
FLOWERS = [(hx('f4f0e0'), hx('c8c0a8')), (hx('ffe066'), hx('c89a20')), (hx('f0a0c0'), hx('b06080')), (hx('a8c8ff'), hx('6080c0'))]


def grass_tile(base3, seed, tufts=5, patches=0.5, flowers=0, pebbles=0, lush=False, soft=False):
    """원본 풀(3) 테두리 링 유지 + 안쪽에 결(패치·덤불·꽃·돌)"""
    rng = np.random.default_rng(seed)
    img = base3.copy()
    n = smooth_noise(rng, cell=8, periodic=False) * 0.7 + smooth_noise(rng, cell=4, periodic=False) * 0.3
    y, x = yy_xx()
    inner = (x >= 2) & (x <= 29) & (y >= 2) & (y <= 29)
    jit = rng.normal(0, 0.22, (T, T))
    for yy in range(T):
        for xx in range(T):
            if not inner[yy, xx]: continue
            v = n[yy, xx] + jit[yy, xx]
            if v > 0.62: img[yy, xx] = GR[6]
            elif v < (-0.55 if lush else -0.7):
                img[yy, xx] = GR[3] if (lush and v < -0.95) else GR[4]
    placed = []
    for _ in range(tufts * 6):
        if len(placed) >= tufts: break
        t = TUFTS[rng.integers(len(TUFTS))]
        w, h = len(t[0]), len(t)
        x0 = int(rng.integers(2, 30 - w)); y0 = int(rng.integers(2, 30 - h))
        if any(abs(x0 - px) < 6 and abs(y0 - py) < 5 for px, py in placed): continue
        placed.append((x0, y0)); stamp(img, x0, y0, t, SOFT_PAL if soft else TUFT_PAL, lo=1, hi=31)
    for _ in range(flowers):
        for _try in range(20):
            fx, fy = int(rng.integers(3, 28)), int(rng.integers(3, 28))
            if all(abs(fx - px) > 3 or abs(fy - py) > 3 for px, py in placed): break
        c, cs = FLOWERS[rng.integers(len(FLOWERS))]
        put(img, fx, fy, c); put(img, fx + 1, fy, c); put(img, fx, fy + 1, cs); put(img, fx + 1, fy + 1, GR[3]); placed.append((fx, fy))
    for _ in range(pebbles):
        px, py = int(rng.integers(3, 27)), int(rng.integers(3, 27))
        stamp(img, px, py, [".lm", "lmd", "mdk"][:2] if rng.random() < 0.5 else ["lm.", "mmd", ".dk"], {'l': ST[6], 'm': ST[4], 'd': ST[2], 'k': GR[2]}, lo=1, hi=31)
    return img


def sand_tile(base2, seed, ripples=3, shells=0, stones=0):
    rng = np.random.default_rng(seed)
    img = base2.copy()
    n = smooth_noise(rng, cell=8, periodic=False)
    for yy in range(2, 30):
        for xx in range(2, 30):
            v = n[yy, xx]
            if v > 0.5 and bay(xx, yy) < (v - 0.4) * 1.5: img[yy, xx] = SD[5]
            elif v < -0.5 and bay(xx, yy) < (-v - 0.4) * 1.5: img[yy, xx] = SD[3]
    for _ in range(ripples):  # 바람 물결(얕은 호)
        x0, y0 = int(rng.integers(3, 18)), int(rng.integers(4, 27)); L = int(rng.integers(6, 11))
        for i in range(L):
            yy = y0 + (1 if 1 < i < L - 2 else 0)
            put(img, x0 + i, yy, SD[3]); put(img, x0 + i, yy - 1, SD[5]) if i % 2 == 0 else None
    for _ in range(stones):
        px, py = int(rng.integers(4, 26)), int(rng.integers(4, 26))
        stamp(img, px, py, [".lm.", "lmmd", ".dd."], {'l': ST[6], 'm': ST[4], 'd': SD[1]}, lo=1, hi=31)
    for _ in range(shells):
        px, py = int(rng.integers(4, 27)), int(rng.integers(4, 27))
        put(img, px, py, SD[6]); put(img, px + 1, py, SD[5]); put(img, px, py + 1, SD[1])
    return img


def dirt_tex(seed, n=T):
    """흙길 바탕(주기 32 -> 모든 길 조각이 같은 바탕을 공유해 이음새 없음)"""
    rng = np.random.default_rng(seed)
    img = np.zeros((n, n, 3), np.uint8); img[:] = DT[4]
    a = smooth_noise(rng, cell=8) * 0.6 + smooth_noise(rng, cell=4) * 0.4
    for yy in range(n):
        for xx in range(n):
            v = a[yy, xx]
            v += rng.normal(0, 0.2)
            if v > 0.5: img[yy, xx] = DT[5]
            elif v < -0.5: img[yy, xx] = DT[3]
    for _ in range(6):  # 자갈(1~2px, 밝은 윗면 + 어두운 아랫면)
        px, py = int(rng.integers(0, n)), int(rng.integers(0, n))
        put(img, px, py, DT[6], True); put(img, px, py + 1, DT[2], True)
        if rng.random() < 0.5: put(img, px + 1, py, DT[5], True); put(img, px + 1, py + 1, DT[2], True)
    for _ in range(8):
        put(img, int(rng.integers(0, n)), int(rng.integers(0, n)), DT[2], True)
    return img


# ================= 숲: 월드 필드(3x3 이웃 점유 -> 가운데 칸) =================
# 칸 상대 수관 격자(주기 32). (cx, cy, r) — 각 칸이 같은 격자를 가짐 -> 인접 칸 경계 픽셀 일치
CROWNS = [(4, 3, 7), (15, 0, 7), (26, 5, 7), (9, 12, 7), (20, 14, 7), (31, 15, 7), (3, 23, 7), (14, 24, 7), (25, 26, 7)]
DIRS8 = {'N': (0, -1), 'S': (0, 1), 'W': (-1, 0), 'E': (1, 0), 'NW': (-1, -1), 'NE': (1, -1), 'SW': (-1, 1), 'SE': (1, 1)}


def near_dirs(cx, cy, dn=6, ds=11, dw=6, de=6):
    n = cy < dn; s = cy > 31 - ds; w = cx < dw; e = cx > 31 - de
    out = [d for d, f in (('N', n), ('S', s), ('W', w), ('E', e)) if f]
    if n and w: out.append('NW')
    if n and e: out.append('NE')
    if s and w: out.append('SW')
    if s and e: out.append('SE')
    return out


def crown_lumps(cx, cy, r, rng):
    lumps = [(cx, cy, r)]
    for ang, k in ((-2.4, 0.62), (-0.7, 0.6), (2.6, 0.55), (0.6, 0.58), (-1.57, 0.55), (1.6, 0.5)):
        a = ang + rng.uniform(-0.45, 0.45)
        rad = r * rng.uniform(0.42, 0.62)
        lumps.append((cx + np.cos(a) * rad, cy + np.sin(a) * rad, r * k * rng.uniform(0.85, 1.12)))
    return lumps


def draw_crown(canvas, cx, cy, r, seed, pal=FO, trunk=True, cover=None):
    """수관(광원 좌상단). 덩이 5~6개 합성 높이장 -> 법선 음영 -> 팔레트 양자화(잎 결 지터)"""
    rng = np.random.default_rng(seed)
    H, W = canvas.shape[:2]
    lumps = crown_lumps(cx, cy, r, rng)
    x0, x1 = int(cx - r - 3), int(cx + r + 4); y0, y1 = int(cy - r - 3), int(cy + r + 4)
    if trunk:
        for ty in range(int(cy + r * 0.55), int(cy + r + 3)):
            for tx in (int(cx) - 1, int(cx)):
                if 0 <= tx < W and 0 <= ty < H: canvas[ty, tx] = TR[1] if tx == int(cx) else TR[2]
        by = int(cy + r + 2)
        if 0 <= by < H:
            for tx in (int(cx) - 2, int(cx) + 1):
                if 0 <= tx < W: canvas[by, tx] = TR[0]
    L = np.array([-0.55, -0.65, 0.75]); L /= np.linalg.norm(L)
    hmap = {}
    for yy in range(max(0, y0), min(H, y1)):
        for xx in range(max(0, x0), min(W, x1)):
            best = None
            for (lx, ly, lr) in lumps:
                dx, dy = xx + 0.5 - lx, yy + 0.5 - ly
                d2 = dx * dx + dy * dy
                if d2 < lr * lr:
                    h = np.sqrt(lr * lr - d2) + (cy - ly) * 0.15
                    if best is None or h > best[0]: best = (h, dx / lr, dy / lr, np.sqrt(max(0, 1 - d2 / (lr * lr))))
            if best: hmap[(xx, yy)] = best
    for (xx, yy), (h, nx, ny, nz) in hmap.items():
        lit = nx * L[0] + ny * L[1] + nz * L[2]
        lit += rng.normal(0, 0.12)
        idx = 2 + lit * 4.2
        if (xx + yy) % 2 and abs(idx - round(idx)) > 0.35: idx += 0.5
        k = int(np.clip(round(idx), 2, 7))
        if (xx + 1, yy) not in hmap or (xx, yy + 1) not in hmap: k = 1 if ((xx, yy + 1) not in hmap) else min(k, 2)
        if (xx, yy - 1) not in hmap and k > 3: k = max(k, 5)
        canvas[yy, xx] = pal[k]
        if cover is not None: cover[yy, xx] = True


def forest_world(occ, grass, seed=7, interior_mod=None, margins=None, pal=FO):
    """occ: 3x3 bool(가운데=자기 칸, 반드시 True). grass: 32x32 풀 바탕. 반환 32x32"""
    mg = margins or {}
    C = 96
    can = np.zeros((C, C, 3), np.uint8)
    for j in range(3):
        for i in range(3): can[j * 32:(j + 1) * 32, i * 32:(i + 1) * 32] = grass
    def is_f(i, j):
        if 0 <= i < 3 and 0 <= j < 3: return bool(occ[j][i])
        return True
    crowns = []
    for j in range(3):
        for i in range(3):
            if not is_f(i, j): continue
            for k, (cx, cy, r) in enumerate(CROWNS):
                ok = all(is_f(i + DIRS8[d][0], j + DIRS8[d][1]) for d in near_dirs(cx, cy, **mg))
                if not ok: continue
                jr = np.random.default_rng(1000 + k)
                rr = r + int(jr.choice([-1, 0, 0, 1]))
                pp = pal if jr.random() > 0.3 else [pal[0]] + pal[:-1]
                crowns.append([i * 32 + cx + int(jr.integers(-2, 3)), j * 32 + cy + int(jr.integers(-1, 2)), rr, 1000 + k, pp])
    if interior_mod: crowns = interior_mod(crowns)
    yy, xx = np.mgrid[0:C, 0:C]
    dark = np.zeros((C, C), bool); shadow = np.zeros((C, C), bool)
    for cx, cy, r, s, p in crowns:
        dark |= (xx - cx - 1) ** 2 + (yy - cy - 2) ** 2 < (r + 1.5) ** 2
        shadow |= (xx - cx - 3) ** 2 + (yy - cy - 4) ** 2 < (r + 1.2) ** 2
    sh = shade_map(can, shadow & ~dark, GR, -2)
    can = sh
    can[dark] = FO[0]
    # 숲 바닥 군데군데 어둔 풀
    for cx, cy, r, s, p in sorted(crowns, key=lambda c: (c[1], c[0])):
        draw_crown(can, cx, cy, r, s, pal=p)
    return can[32:64, 32:64].copy()


def occ_from(open_dirs):
    o = [[True] * 3 for _ in range(3)]
    for d in open_dirs:
        dx, dy = DIRS8[d]; o[1 + dy][1 + dx] = False
    return o
