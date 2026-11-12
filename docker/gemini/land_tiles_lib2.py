"""land_set 2부: 영역 전이(풀↔모래/흙길), 산, 험지. 이미지 생성 모델 호출 0회."""
import numpy as np
from land_tiles_lib import T, GR, ST, SD, DT, SN, FO, hx, ramp, stamp, shade_map, smooth_noise

MT = ramp('201c1a', '342e2a', '4a423c', '625850', '7c7266', '9a8f80', 'b9ae9c', 'ddd4c2')  # 바위(따뜻한 회갈)


# ================= 영역 전이: 월드 필드 =================
def jit(t, phase, amp=1.2):
    """주기 32 경계 흔들림(정수 px) -> 같은 방향 조각끼리 경계가 이어짐"""
    return int(round(amp * (np.sin(2 * np.pi * t / 32 * 2 + phase) * 0.6 + np.sin(2 * np.pi * t / 32 * 3 + phase * 1.7) * 0.4)))


def region_world(occ, rule):
    """occ 3x3(True=B 영역 칸). rule(x, y, nb) -> bool, nb(dx,dy)=그 칸 기준 이웃이 B 인가. 3x3 밖은 B 로 가정(가운데 칸에 닿지 않음)"""
    def is_b(i, j):
        if 0 <= i < 3 and 0 <= j < 3: return bool(occ[j][i])
        return True
    m = np.zeros((96, 96), bool)
    for j in range(3):
        for i in range(3):
            if not is_b(i, j): continue
            nb = lambda dx, dy, i=i, j=j: is_b(i + dx, j + dy)
            for y in range(32):
                for x in range(32):
                    m[j * 32 + y, i * 32 + x] = rule(x, y, nb)
    return m


def sand_rule(depth=6):
    def r(x, y, nb):
        dN = depth + jit(x, 0.3); dS = depth + jit(x, 1.9); dW = depth + jit(y, 2.6); dE = depth + jit(y, 4.1)
        if not nb(0, -1) and y < dN: return False
        if not nb(0, 1) and y > 31 - dS: return False
        if not nb(-1, 0) and x < dW: return False
        if not nb(1, 0) and x > 31 - dE: return False
        for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            if not nb(dx, dy):
                cx = 0 if dx < 0 else 32; cy = 0 if dy < 0 else 32
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < (depth + 1.5) ** 2: return False
        return True
    return r


def road_rule(half=7):
    lo, hi = 16 - half, 15 + half
    def r(x, y, nb):
        a = lo + jit(y, 0.7, 1.0); b = hi + jit(y, 2.2, 1.0)
        c = lo + jit(x, 1.3, 1.0); d = hi + jit(x, 3.4, 1.0)
        inV = a <= x <= b; inH = c <= y <= d
        if inV and inH: return True
        if inV and ((y < 16 and nb(0, -1)) or (y >= 16 and nb(0, 1))): return True
        if inH and ((x < 16 and nb(-1, 0)) or (x >= 16 and nb(1, 0))): return True
        for (sx, sy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):  # 꺾이는 안쪽 모서리 둥글게
            if nb(sx, 0) and nb(0, sy):
                qx = x if sx < 0 else 31 - x; qy = y if sy < 0 else 31 - y
                if qx < lo and qy < lo and (lo - qx) + (lo - qy) <= 4: return True
        return False
    return r


def blend_tile(occ, rule, texA, texB, edgeA, edgeB, rimB=None, tufts=True):
    """A=바깥(풀), B=영역(모래/흙). 경계 음영: A 쪽 1px edgeA, B 쪽 1px edgeB, B 윗변 아래 한 줄 rimB(움푹한 길 느낌)"""
    m = region_world(occ, rule)
    can = np.zeros((96, 96, 3), np.uint8)
    for j in range(3):
        for i in range(3):
            can[j * 32:(j + 1) * 32, i * 32:(i + 1) * 32] = np.where(m[j * 32:(j + 1) * 32, i * 32:(i + 1) * 32, None], texB, texA)
    up = np.roll(m, 1, 0); dn = np.roll(m, -1, 0); lf = np.roll(m, 1, 1); rt = np.roll(m, -1, 1)
    bB = m & ~(up & dn & lf & rt)
    bA = ~m & (up | dn | lf | rt)
    can[bB] = edgeB
    can[bA] = edgeA
    if rimB is not None:  # B 윗변 바로 아래(풀 둑 그늘)
        can[m & ~bB & np.roll(bB & ~up, 1, 0)] = rimB
    if tufts:  # 경계 풀 삐침(결정론, 월드 좌표 기반)
        ys, xs = np.nonzero(bA)
        for Y, X in zip(ys, xs):
            if ((X % 32) * 7 + (Y % 32) * 13) % 6 == 0 and 0 < Y < 95 and 0 < X < 95:
                for dy, dx in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                    if m[Y + dy, X + dx]: can[Y + dy, X + dx] = GR[5]; can[Y, X] = GR[6]; break
    return can[32:64, 32:64].copy()


# ================= 산 =================
def peak_mask(px, top, hw, base, seed, n=T):
    rng = np.random.default_rng(seed)
    m = np.zeros((n, n), bool)
    jag = rng.integers(-1, 2, n)
    for x in range(n):
        d = abs(x + 0.5 - px)
        if d > hw: continue
        t = d / hw
        ytop = top + (base - top) * (t ** 1.7) + (jag[x] if 1.5 < d < hw - 1 else 0)
        ytop -= 2.2 * np.exp(-((x - (px - hw * 0.55)) ** 2) / 6) + 1.6 * np.exp(-((x - (px + hw * 0.5)) ** 2) / 5)
        ybot = base - (1 if t > 0.85 else 0)
        for y in range(int(max(1, round(ytop))), min(n - 1, ybot + 1)): m[y, x] = True
    return m


def facets(m, seed, n_pts=12):
    """Voronoi 면(바위 결): 반환 (면 번호, 경계 여부)"""
    rng = np.random.default_rng(seed)
    ys, xs = np.nonzero(m)
    if len(ys) == 0: return np.zeros(m.shape, int), np.zeros(m.shape, bool)
    pick = rng.choice(len(ys), size=min(n_pts, len(ys)), replace=False)
    P = np.stack([xs[pick], ys[pick] * 1.0], 1).astype(float)
    yy, xx = np.mgrid[0:m.shape[0], 0:m.shape[1]]
    d = np.sqrt((xx[..., None] + 0.5 - P[:, 0]) ** 2 + ((yy[..., None] + 0.5 - P[:, 1]) * 0.8) ** 2)
    o = np.sort(d, -1)
    return np.argmin(d, -1), (o[..., 1] - o[..., 0]) < 0.9


def _paint_peak(img, m, px, top, base, seed, snow, pal=MT):
    ys, xs = np.nonzero(m)
    def ridge_x(y): return px + (y - top) * 0.25 + np.sin(y * 0.7 + seed) * 0.8
    fid, edge = facets(m, seed, n_pts=10 + int(m.sum() // 60))
    off = np.random.default_rng(seed + 9).choice([-1, 0, 0, 0, 1], 64)
    for y, x in zip(ys, xs):
        rx = ridge_x(y); lit = x + 0.5 < rx
        depth = (y - top) / max(1, base - top)
        k = (5 if lit else 3) - (1 if depth > 0.82 else 0) + off[fid[y, x] % 64]
        if edge[y, x] and depth > 0.12: k = (3 if lit else 1)
        elif edge[y, x - 1 if x > 0 else 0] and lit and depth > 0.12: k += 1  # 결 아래쪽 하이라이트
        if lit and rx - 1.4 < x + 0.5: k = 6
        if not lit and x + 0.5 < rx + 1: k = 2
        if snow and depth < 0.3 + 0.07 * np.sin(x * 1.7): img[y, x] = SN[4] if lit else SN[2]
        else: img[y, x] = pal[int(np.clip(k, 1, 7))]
    for y, x in zip(ys, xs):
        r = not m[y, x + 1] if x + 1 < T else True; b = not m[y + 1, x] if y + 1 < T else True
        l = not m[y, x - 1] if x > 0 else True; t = not m[y - 1, x] if y > 0 else True
        if r or b: img[y, x] = pal[0]
        elif l or t: img[y, x] = SN[1] if (snow and (y - top) / max(1, base - top) < 0.3) else pal[2]


def mountain_tile(grass, seed, peaks, snow=False, foot=True):
    """peaks: [(px, top, hw, base)] 뒤(먼저) -> 앞 순서. 테두리 1px 는 풀 유지(어느 풀 칸과도 이음새 없음)"""
    img = grass.copy()
    rng = np.random.default_rng(seed)
    masks = [peak_mask(px, top, hw, base, seed + i) for i, (px, top, hw, base) in enumerate(peaks)]
    allm = np.zeros((T, T), bool)
    for m in masks: allm |= m
    sh = np.zeros_like(allm); sh[2:, 3:] = allm[:-2, :-3]
    sh[:, 31] = sh[31, :] = sh[0, :] = sh[:, 0] = False
    img = shade_map(img, sh & ~allm, GR, -2)
    for i, ((px, top, hw, base), m) in enumerate(zip(peaks, masks)):
        _paint_peak(img, m, px, top, base, seed + i, snow)
    if foot:  # 기슭 자갈
        for _ in range(4):
            x, y = int(rng.integers(3, 27)), int(rng.integers(27, 29))
            if not allm[y, x] and not allm[y, x + 1] and not allm[y + 1, x]:
                stamp(img, x, y, ["lm", "md"], {'l': MT[6], 'm': MT[4], 'd': MT[1]}, lo=1, hi=31)
    return img


def rock_ground(seed, base_k=4):
    """험지(절벽 k 칸 단일 타일, FE 에서 0x8a7462 곱하기 틴트): 주기 32 바위 지면"""
    rng = np.random.default_rng(seed)
    img = np.zeros((T, T, 3), np.uint8); img[:] = MT[base_k]
    n = smooth_noise(rng, cell=8)
    for y in range(T):
        for x in range(T):
            v = n[y, x] + rng.normal(0, 0.2)
            if v > 0.5: img[y, x] = MT[base_k + 1]
            elif v < -0.5: img[y, x] = MT[base_k - 1]
    for k in range(6):
        cx, cy, r = rng.uniform(0, 32), rng.uniform(0, 32), rng.uniform(3, 5.5)
        for y in range(int(cy - r - 2), int(cy + r + 3)):
            for x in range(int(cx - r - 2), int(cx + r + 3)):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy; d = (dx * dx + dy * dy * 1.3) ** 0.5
                X, Y = x % 32, y % 32
                if d < r:
                    s = -(dx + dy) / r
                    kk = base_k + (2 if s > 0.6 else 1 if s > 0 else 0) - (1 if s < -0.6 else 0)
                    img[Y, X] = MT[int(np.clip(kk, 0, 7))]
                elif d < r + 1.3 and dx + dy > 0: img[Y, X] = MT[max(0, base_k - 3)]
    for _ in range(4):
        x, y = int(rng.integers(0, 32)), int(rng.integers(0, 32))
        for i in range(int(rng.integers(3, 7))):
            img[y % 32, x % 32] = MT[1]; x += int(rng.integers(0, 2)); y += 1
    return img


# ================= 절벽 가장자리(높은 땅 칸에 칠함, 면은 열린 쪽 가장자리) =================
FACE = {'S': 11, 'N': 3, 'W': 5, 'E': 5}


def cliff_tile(top_tex, open_dirs, seed=3):
    """open_dirs: 낮은 쪽 집합(N,E,S,W 및 대각 NW.. 은 안쪽 모서리용). 면 음영: S 면 정면(중간), W 면 밝음, E 면 어두움, N 은 얇은 턱"""
    img = top_tex.copy()
    face = np.full((T, T), '', dtype=object)
    for y in range(T):
        for x in range(T):
            dS = FACE['S'] + jit(x, 0.9, 1.0); dN = FACE['N'] + jit(x, 2.1, 0.6)
            dW = FACE['W'] + jit(y, 1.4, 0.8); dE = FACE['E'] + jit(y, 3.3, 0.8)
            f = ''
            if 'S' in open_dirs and y > 31 - dS: f = 'S'
            if 'E' in open_dirs and x > 31 - dE and not f: f = 'E'
            if 'W' in open_dirs and x < dW and not f: f = 'W'
            if 'N' in open_dirs and y < dN and not f: f = 'N'
            # 안쪽 모서리(대각만 낮음): 이웃 칸 세로 면이 이 칸 모서리까지 이어짐
            if not f:
                if 'SE' in open_dirs and x > 31 - dE and y > 31 - dS: f = 'E'
                if 'SW' in open_dirs and x < dW and y > 31 - dS: f = 'W'
                if 'NE' in open_dirs and x > 31 - dE and y < dN: f = 'N'
                if 'NW' in open_dirs and x < dW and y < dN: f = 'N'
            face[y, x] = f
    fm = face != ''
    fid, edge = facets(fm, seed, n_pts=max(4, int(fm.sum() // 18)))
    off = np.random.default_rng(seed).choice([-1, 0, 0, 1], 64)
    for y in range(T):
        for x in range(T):
            f = face[y, x]
            if not f: continue
            k = {'S': 4, 'W': 5, 'E': 2, 'N': 3}[f] + off[fid[y, x] % 64]
            if f == 'S' and y > 31 - 3: k -= 1
            if edge[y, x]: k = 1 if f != 'W' else 3
            img[y, x] = MT[int(np.clip(k, 1, 6))]
    # 턱(윗 가장자리 밝은 선) + 면 밑동 어두운 선
    for y in range(T):
        for x in range(T):
            f = face[y, x]
            if not f: continue
            above = face[y - 1, x] if y > 0 else f
            if f == 'S' and not above: img[y, x] = MT[6]
            if f in ('W', 'E') and ((x + 1 < T and not face[y, x + 1] and f == 'W') or (x > 0 and not face[y, x - 1] and f == 'E')):
                img[y, x] = MT[6] if f == 'W' else MT[4]
            if f == 'N' and y + 1 < T and not face[y + 1, x]: img[y, x] = MT[6]
            if f == 'S' and y == 31: img[y, x] = MT[1]
    return img


def shade_any(img, mask, steps, ramps=None):
    """색이 속한 램프(풀·바위·모래·흙·수관)를 찾아 그 안에서 명암 이동 -> 바탕이 무엇이든 그림자 색이 어긋나지 않음"""
    ramps = ramps or [GR, MT, SD, DT, FO, ST]
    out = img.copy()
    for y, x in zip(*np.nonzero(mask)):
        c = img[y, x].astype(int); best = None
        for rp in ramps:
            for k, col in enumerate(rp):
                d = int(((c - col.astype(int)) ** 2).sum())
                if best is None or d < best[0]: best = (d, rp, k)
        _, rp, k = best
        out[y, x] = rp[int(np.clip(k + steps, 0, len(rp) - 1))]
    return out


def scree_tex(seed):
    """산지 바닥(돌무더기 비탈, 주기 32): 산 군집 사이를 메워 산맥이 한 덩어리로 읽히게"""
    rng = np.random.default_rng(seed)
    img = np.zeros((T, T, 3), np.uint8); img[:] = MT[4]
    n = smooth_noise(rng, cell=8) * 0.7 + smooth_noise(rng, cell=4) * 0.3
    for y in range(T):
        for x in range(T):
            v = n[y, x] + rng.normal(0, 0.15)
            img[y, x] = MT[5] if v > 0.45 else MT[3] if v < -0.45 else MT[4]
    for _ in range(14):
        x, y = int(rng.integers(0, 32)), int(rng.integers(0, 32))
        img[y, x] = MT[6]; img[(y + 1) % 32, x] = MT[2]; img[(y + 1) % 32, (x + 1) % 32] = MT[2]
    for _ in range(5):  # 마른 풀 포기
        x, y = int(rng.integers(0, 32)), int(rng.integers(0, 32))
        img[y, x] = GR[3]; img[y, (x + 1) % 32] = GR[4]
    return img


def peaks_on(base, seed, peaks, snow=False):
    """임의 바탕(풀 또는 산지 바닥) 위 봉우리 + 오른아래 그림자(바탕 램프 유지)"""
    img = base.copy()
    masks = [peak_mask(px, top, hw, bs, seed + i) for i, (px, top, hw, bs) in enumerate(peaks)]
    allm = np.zeros((T, T), bool)
    for m in masks: allm |= m
    sh = np.zeros_like(allm); sh[2:, 3:] = allm[:-2, :-3]
    sh[:, 31] = sh[31, :] = sh[0, :] = sh[:, 0] = False
    img = shade_any(img, sh & ~allm, -2)
    for i, ((px, top, hw, bs), m) in enumerate(zip(peaks, masks)):
        _paint_peak(img, m, px, top, bs, seed + i, snow)
    return img
