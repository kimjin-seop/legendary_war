# 영웅 스킬 이펙트 시트 절차 생성(안아트 2026-11-06, 이미지 모델 호출 0).
# 방법: pixelfx 방식(color 버퍼 + light 버퍼, 팔레트 램프의 단단한 계단, 4x4 Bayer 디더 알파, 시드 고정 난수,
#       빠른 시작·느린 끝 이징, 원샷은 빈 프레임으로 끝남)을 이 파일 안에서 직접 구현한다. 외부 코드 미사용(Pillow·numpy 만).
# 그림체 기준: snes_style.mjs(광원 좌상단, 순흑 대신 각 램프의 가장 어두운 톤으로 1px 외곽선, 3~5단 계단 음영, 안티앨리어싱 없음),
#             effects/gun(총구 화염 0/255 알파, 연기만 단계 알파).
# 밀도: 1 이펙트 px = 64px 유닛 시트 1 px(유닛과 도트 크기 동일). 단일 대상 64x64, 범위(반경 1 = 3x3 타일) 160x160.
# 실행(저장소 루트): python docker/gemini/skill_fx_build.py [key 접두사 ...] [--preview <폴더>]
import sys, os, json, math
import numpy as np
from PIL import Image

OUT = 'public/assets/fx/skills'
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16.0

def hexrgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

# 램프: 어두운 -> 밝은. [0] 은 외곽선 톤
PAL = {
    'fire':   ['#4a1410', '#a42a18', '#e2581c', '#f8a030', '#ffe27a', '#fffbe0'],
    'volt':   ['#161a4e', '#2f48c0', '#5a9cff', '#a8e0ff', '#f0fcff', '#ffffff'],
    'ice':    ['#16285a', '#2a62a8', '#4aa6e0', '#9adcf8', '#e4fbff', '#ffffff'],
    'water':  ['#122a52', '#1e5c9c', '#3a98d0', '#7cd0ec', '#d4f4ff', '#ffffff'],
    'impact': ['#4a2e10', '#a8681c', '#e8b030', '#ffe07a', '#fff8d8', '#ffffff'],
    'steel':  ['#1e2a48', '#4a6a9c', '#8cb4e0', '#d0e8ff', '#ffffff', '#ffffff'],
    'holy':   ['#4e3a0e', '#a8801e', '#e8c440', '#fff09a', '#fffce4', '#ffffff'],
    'atk':    ['#4e1414', '#b02c22', '#f06a32', '#ffb84a', '#fff0a0', '#ffffff'],
    'def':    ['#14285a', '#2a58b0', '#4a9ae8', '#9cd4ff', '#eaf8ff', '#ffffff'],
    'move':   ['#103a28', '#1e8a50', '#46c870', '#a2ec9a', '#ecffe0', '#ffffff'],
    'heal':   ['#103e2a', '#22924e', '#4ad06a', '#a8f08c', '#f0ffd8', '#ffffff'],
    'arcane': ['#26103e', '#5a2890', '#9a50d0', '#d098f0', '#f6e4ff', '#ffffff'],
    'poison': ['#1c2a10', '#4a7418', '#86b42a', '#c4e44a', '#f0ffb0', '#ffffff'],
    'smoke':  ['#2a2a34', '#4c4c5a', '#74747e', '#a0a0a8', '#cacace', '#e8e8ea'],
    'dust':   ['#3a2a1a', '#6e5232', '#9c7a4e', '#c8a674', '#e8d0a4', '#f8ecd0'],
    'wood':   ['#2a1a0e', '#5a3a1c', '#8a6034', '#bc9058', '#e0c08a', '#fff0c8'],
}
PALRGB = {k: [hexrgb(c) for c in v] for k, v in PAL.items()}

# ---------- 난수·노이즈(시드 고정) ----------
class RNG:
    def __init__(self, seed): self.s = (seed * 2654435761 + 12345) & 0xffffffff
    def f(self):
        self.s = (self.s * 1664525 + 1013904223) & 0xffffffff; return self.s / 4294967296.0
    def r(self, a, b): return a + (b - a) * self.f()
    def i(self, a, b): return int(math.floor(self.r(a, b + 1 - 1e-9)))

def _hash(ix, iy, seed):
    # numpy uint64 정수 해시(하위 32비트만 사용, 파이썬 int 판과 결과 동일)
    M = np.uint64(0xffffffff)
    ix = np.asarray(ix).astype(np.uint64); iy = np.asarray(iy).astype(np.uint64)
    h = (ix * np.uint64(374761393) + iy * np.uint64(668265263) + np.uint64(seed) * np.uint64(2246822519)) & M
    h = ((h ^ (h >> np.uint64(13))) * np.uint64(1274126177)) & M
    return (h ^ (h >> np.uint64(16))).astype(np.float64) / 4294967296.0

def vnoise(x, y, seed=0):
    xi = np.floor(x).astype(np.int64); yi = np.floor(y).astype(np.int64)
    xf = x - xi; yf = y - yi
    u = xf * xf * (3 - 2 * xf); v = yf * yf * (3 - 2 * yf)
    h = _hash
    a = h(xi, yi, seed); b = h(xi + 1, yi, seed); c = h(xi, yi + 1, seed); d = h(xi + 1, yi + 1, seed)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v

def fbm(x, y, seed=0, oct=3):
    s, amp, tot = 0.0, 1.0, 0.0
    for o in range(oct):
        s = s + amp * vnoise(x * (2 ** o), y * (2 ** o), seed + o * 17); tot += amp; amp *= 0.5
    return s / tot

def outQuart(t): return 1 - (1 - t) ** 4
def outCubic(t): return 1 - (1 - t) ** 3
def inQuad(t): return t * t
def clamp01(t): return max(0.0, min(1.0, t))
def seg(t, a, b): return clamp01((t - a) / (b - a)) if b > a else (1.0 if t >= a else 0.0)

# ---------- 프레임: 색 버퍼(램프 인덱스 단계) + 빛 버퍼 ----------
class Frame:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.rgb = np.zeros((h, w, 3), np.uint8)
        self.a = np.zeros((h, w), np.uint8)
        self.light = np.zeros((h, w), np.float32)   # 0..1 빛 세기
        self.lightc = np.zeros((h, w, 3), np.float32)
        self.yy, self.xx = np.mgrid[0:h, 0:w].astype(np.float32)

    def field(self, F, pal, cuts=(0.2, 0.4, 0.6, 0.8, 0.93), outline=True, alpha=255, dither_below=None):
        """F(0..1) 를 램프 계단으로 양자화해 덮어 그림. cuts[0] 미만 투명. outline=램프[0] 1px 테두리.
        dither_below: (lo) cuts[0]~lo 구간은 Bayer 디더로 성기게(가장자리 흩어짐)."""
        ramp = PALRGB[pal]
        F = np.asarray(F, np.float32)
        idx = np.zeros(F.shape, np.int32)
        for k, c in enumerate(cuts): idx[F >= c] = k + 1
        on = idx > 0
        if dither_below is not None:
            bt = np.tile(BAYER, (self.h // 4 + 1, self.w // 4 + 1))[:self.h, :self.w]
            band = on & (F < dither_below)
            keep = (F - cuts[0]) / max(1e-6, dither_below - cuts[0]) > bt
            on = on & ~(band & ~keep)
        if outline:
            ring = np.zeros_like(on)
            ring[1:, :] |= on[:-1, :]; ring[:-1, :] |= on[1:, :]; ring[:, 1:] |= on[:, :-1]; ring[:, :-1] |= on[:, 1:]
            ring &= ~on
            self.rgb[ring] = ramp[0]; self.a[ring] = np.maximum(self.a[ring], alpha)
        for k in range(1, len(cuts) + 1):
            m = on & (idx == k)
            self.rgb[m] = ramp[min(k, len(ramp) - 1)]
            self.a[m] = np.maximum(self.a[m], alpha)
        return on

    def px(self, x, y, pal, k, alpha=255):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.rgb[y, x] = PALRGB[pal][k]; self.a[y, x] = max(self.a[y, x], alpha)

    def glow(self, F, pal, k=3, strength=1.0):
        F = np.clip(np.asarray(F, np.float32) * strength, 0, 1)
        c = np.array(PALRGB[pal][k], np.float32)
        upd = F > self.light
        self.light = np.where(upd, F, self.light)
        self.lightc[upd] = c

    def image(self):
        # 빛: 단계 알파(2단)로 색이 없는 곳에만 굽는다(가산처럼 읽히는 반투명 후광). 색 있는 곳은 한 단계 밝힘 없음(계단 유지)
        rgba = np.zeros((self.h, self.w, 4), np.uint8)
        L = self.light
        bt = np.tile(BAYER, (self.h // 4 + 1, self.w // 4 + 1))[:self.h, :self.w]
        g1 = (L > 0.28) & (self.a == 0)
        g2 = (L > 0.55) & (self.a == 0)
        rgba[g1, :3] = self.lightc[g1].astype(np.uint8); rgba[g1, 3] = 72
        rgba[g2, 3] = 130
        # 가장 옅은 띠는 Bayer 로 흩어 그라데이션 대신 도트 감
        g0 = (L > 0.12) & (L <= 0.28) & (self.a == 0) & ((L - 0.12) / 0.16 > bt)
        rgba[g0, :3] = self.lightc[g0].astype(np.uint8); rgba[g0, 3] = 56
        on = self.a > 0
        rgba[on, :3] = self.rgb[on]; rgba[on, 3] = self.a[on]
        return Image.fromarray(rgba, 'RGBA')

# ---------- 도형 필드 ----------
def disc(fr, cx, cy, r, sx=1.0, sy=1.0):
    d = np.sqrt(((fr.xx - cx) / sx) ** 2 + ((fr.yy - cy) / sy) ** 2)
    return np.clip(1 - d / max(r, 1e-3), 0, 1)

def ring(fr, cx, cy, r, w, sx=1.0, sy=1.0):
    d = np.sqrt(((fr.xx - cx) / sx) ** 2 + ((fr.yy - cy) / sy) ** 2)
    return np.clip(1 - np.abs(d - r) / max(w, 1e-3), 0, 1)

def seg_field(fr, x0, y0, x1, y1, w):
    px, py = fr.xx - x0, fr.yy - y0; dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy + 1e-6
    t = np.clip((px * dx + py * dy) / L2, 0, 1)
    d = np.sqrt((px - t * dx) ** 2 + (py - t * dy) ** 2)
    return np.clip(1 - d / max(w, 1e-3), 0, 1)

def tri_field(fr, cx, cy, half_w, h, ang=-math.pi / 2):
    """밑변 중심 (cx,cy) 에서 ang 방향으로 높이 h 인 뾰족한 결정(1=중심선)."""
    ca, sa = math.cos(ang), math.sin(ang)
    lx = (fr.xx - cx) * ca + (fr.yy - cy) * sa          # 축 방향
    ly = -(fr.xx - cx) * sa + (fr.yy - cy) * ca         # 폭 방향
    wid = half_w * np.clip(1 - lx / max(h, 1e-3), 0, 1)
    inside = (lx >= 0) & (lx <= h) & (np.abs(ly) <= wid + 0.5)
    F = np.where(inside, 1 - np.abs(ly) / (wid + 1.0), 0)
    return np.clip(F, 0, 1), ly  # ly: 좌/우 면 음영용

def star4(fr, x, y, r, pal, k_core=5, k_arm=3):
    """4방향 반짝이(+ 모양), 도트 단위."""
    r = int(round(r))
    for i in range(-r, r + 1):
        k = k_core if i == 0 else (k_arm if abs(i) < r else 1)
        fr.px(x + i, y, pal, k); fr.px(x, y + i, pal, k)

# ---------- 이펙트 정의 ----------
# 각 항목: size(w,h), frames, fps, loop, anchor(px), dir('right' 면 오른쪽을 향함), draw(fr, i, n, rng)
FX = {}
def fx(key, **kw):
    def deco(fn): FX[key] = dict(kw, draw=fn, key=key); return fn
    return deco

# 1) 불: 폭염(단일 대상). fire_blob 은 범위형·포격에서도 재사용(s = 크기 배율, t = 0..1 국소 시간)
def fire_blob(fr, t, cx, cy, s, seed, R, smoke=True, pal='fire'):
    if t <= 0 or t >= 1: return
    grow = outQuart(seg(t, 0, 0.35)); fade = seg(t, 0.35, 0.9)
    r = (4 + 18 * grow - 6 * fade) * s
    lift = 10 * s * inQuad(seg(t, 0.2, 1))
    nz = fbm((fr.xx - cx) / (7.0 * s) + seed * 3.1, (fr.yy + t * 30.0 * s) / (6.0 * s), 11 + seed, 3)
    body = disc(fr, cx, cy - lift, r, 1.0, 1.05)
    mask = disc(fr, cx, cy - lift - 3 * s, r + 7 * s, 1.0, 1.25) > 0
    F = body * (1.15 - 0.2 * fade) + (nz - 0.5) * (0.5 + 0.4 * fade) * mask
    F = F + 0.22 * np.clip(-(fr.yy - (cy - lift)) / (20.0 * s), 0, 1) * (nz > 0.5) * mask
    F = (F - fade * 0.45) * (1 - seg(t, 0.8, 1.0)) * mask
    if t <= 0.12: F = F + 0.5 * disc(fr, cx, cy, 10 * s)
    fr.glow(disc(fr, cx, cy - lift, r + 10 * s), pal, 3, 0.9 * (1 - fade))
    if smoke and t > 0.4:
        st = seg(t, 0.4, 1)
        S = disc(fr, cx - 4 * s, cy - (14 + 16 * st) * s, (7 + 6 * st) * s) + disc(fr, cx + 6 * s, cy - (10 + 14 * st) * s, (6 + 5 * st) * s)
        S = (S + (fbm(fr.xx / 5, fr.yy / 5 + t * 9, 5 + seed) - 0.5) * 0.5 * (S > 0) - st * 0.7) * (1 - seg(t, 0.85, 1.0))
        fr.field(S, 'smoke', cuts=(0.15, 0.35, 0.6), outline=False, alpha=150, dither_below=0.3)
    fr.field(F, pal, cuts=(0.18, 0.34, 0.52, 0.72, 0.9))
    rr = RNG(seed * 13 + 1)
    for k in range(int(10 * s) + 2):
        a = rr.r(-2.6, -0.5); sp = rr.r(14, 30) * s; life = rr.r(0.45, 0.8); d0 = rr.r(0, 0.15)
        tt = (t - d0) / life
        if 0 < tt < 1 and t < 0.92:
            x = cx + math.cos(a) * sp * outCubic(tt); y = cy + math.sin(a) * sp * outCubic(tt) - 6 * s * tt
            fr.px(x, y, pal, 4 if tt < 0.5 else 2)

@fx('fire.burst', size=(64, 64), frames=11, fps=16, anchor=(32, 44), family='fire', note='대상 위 화염 폭발. 중심=대상 몸통(앵커). 연기는 위로 흩어지며 소멸')
def fire_burst(fr, i, n, R):
    fire_blob(fr, max(1e-3, i / (n - 1)) if i < n - 1 else 1.0, 32, 44, 1.0, 1, R)

# 2) 번개: 낙뢰(단일 대상)
@fx('lightning.strike', size=(64, 80), frames=10, fps=18, anchor=(32, 66), family='lightning', note='하늘에서 대상 발밑(앵커)으로 떨어지는 낙뢰 + 착지 방전. 프레임 높이 80(위로 16px 넘침)')
def lightning_strike(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 66
    # 지그재그 경로(프레임마다 약간 다른 갈래, 시드 고정)
    def bolt(seed, x0, y0, x1, y1, steps, jit):
        rr = RNG(seed); pts = [(x0, y0)]
        for s in range(1, steps):
            u = s / steps
            pts.append((x0 + (x1 - x0) * u + rr.r(-jit, jit), y0 + (y1 - y0) * u))
        pts.append((x1, y1)); return pts
    F = np.zeros((fr.h, fr.w), np.float32)
    if i == 0:   # 전조: 가는 선
        for a, b in zip(*(lambda p: (p[:-1], p[1:]))(bolt(3, 30, 0, gx, gy - 30, 6, 4))):
            F = np.maximum(F, seg_field(fr, *a, *b, 1.2) * 0.6)
    elif i <= 4:
        main = bolt(7 + (i // 2), 28, 0, gx, gy, 9, 5)
        w = 3.2 if i in (1, 2) else 2.2
        for a, b in zip(main[:-1], main[1:]): F = np.maximum(F, seg_field(fr, *a, *b, w))
        if i >= 2:  # 갈래
            br = bolt(20 + i, *main[4], main[4][0] + (10 if i % 2 else -11), main[4][1] + 16, 4, 3)
            for a, b in zip(br[:-1], br[1:]): F = np.maximum(F, seg_field(fr, *a, *b, 1.4) * 0.8)
        fr.glow(np.maximum(F * 1.0, disc(fr, gx, gy - 4, 16, 1.4, 0.7)), 'volt', 2, 1.0 if i <= 2 else 0.6)
    # 착지 방전 링·튀는 전기
    if i >= 1:
        st = seg(t, 0.1, 0.85)
        if st < 1:
            Rg = ring(fr, gx, gy, 4 + 16 * outQuart(st), 2.0 - 1.2 * st, 1.0, 0.45)
            F = np.maximum(F, Rg * (1 - st) * 1.1)
        if i in (1, 2): F = np.maximum(F, disc(fr, gx, gy - 2, 9, 1.3, 0.8) * 1.2)
    fr.field(F, 'volt', cuts=(0.2, 0.4, 0.6, 0.8, 0.92))
    if 2 <= i <= 7:
        for k in range(6):
            a = R.r(-math.pi, 0); d = R.r(6, 18) * (0.5 + t)
            x, y = gx + math.cos(a) * d, gy + math.sin(a) * d * 0.6
            fr.px(x, y, 'volt', 4); fr.px(x + (1 if k % 2 else -1), y - 1, 'volt', 3)

# 3) 얼음: 빙결 분출(단일 대상)
@fx('ice.burst', size=(64, 64), frames=12, fps=14, anchor=(32, 52), family='ice', note='대상 발밑(앵커)에서 얼음 결정이 솟고 부서져 흩어짐')
def ice_burst(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 52
    rr = RNG(41)
    cr = [(-12, 9, 18, -1.95), (-5, 7, 26, -1.70), (3, 8, 30, -1.52), (11, 7, 22, -1.25), (17, 5, 14, -0.95), (-18, 5, 12, -2.25)]
    grow = outQuart(seg(t, 0.0, 0.3)); brk = seg(t, 0.55, 0.75)
    # 바닥 서리
    fz = disc(fr, gx, gy + 1, 22, 1.0, 0.32) * (1.0 - seg(t, 0.6, 1.0)) * min(1, grow * 1.5)
    fz = fz + (fbm(fr.xx / 3, fr.yy / 2, 9) - 0.5) * 0.4
    fr.field(fz, 'ice', cuts=(0.25, 0.5, 0.75), outline=False, dither_below=0.4)
    if brk < 1:
        for j, (dx, hw, h, ang) in enumerate(cr):
            hh = h * grow * (1 - 0.3 * brk)
            if hh < 2: continue
            F, ly = tri_field(fr, gx + dx * 0.6, gy, hw * 0.5, hh, ang)
            # 좌상단 광원: 결정 왼쪽 면 밝게, 오른쪽 면 어둡게(2면 계단)
            F2 = np.where(F > 0, np.where(ly < 0, 0.95, 0.55), 0)
            F2 = np.where((F > 0) & (np.abs(ly) < 0.8), 0.78, F2)
            if brk > 0:  # 부서짐: 디더로 갉아먹음
                bt = np.tile(BAYER, (fr.h // 4 + 1, fr.w // 4 + 1))[:fr.h, :fr.w]
                F2 = np.where(bt < brk * 1.1, 0, F2)
            fr.field(F2, 'ice', cuts=(0.2, 0.5, 0.7, 0.9))
    if i <= 1: fr.field(disc(fr, gx, gy - 8, 9, 1.0, 1.2) * 1.3, 'ice', cuts=(0.3, 0.55, 0.8, 0.95, 1.1))
    fr.glow(disc(fr, gx, gy - 10, 26, 1.0, 0.9), 'ice', 3, 0.9 * (1 - seg(t, 0.3, 0.8)))
    # 파편: 깨지면 튀어 떨어짐
    if brk > 0:
        for k in range(12):
            a = rr.r(-2.8, -0.35); sp = rr.r(10, 24); ph = (t - 0.55) / 0.45
            x = gx + math.cos(a) * sp * outCubic(ph); y = gy - 12 + math.sin(a) * sp * outCubic(ph) + 26 * ph * ph
            if ph < 0.95: fr.px(x, y, 'ice', 4 if k % 3 else 3); fr.px(x + 1, y, 'ice', 2)
    # 반짝이
    if 0.15 < t < 0.6:
        for k in range(3):
            star4(fr, gx + rr.i(-14, 14), gy - rr.i(10, 28), 2 if (i + k) % 2 else 1, 'ice')

# 4) 돌격 충격(단일 대상, 오른쪽을 향함)
@fx('impact.charge', size=(64, 64), frames=9, fps=18, anchor=(40, 38), dir='right', family='impact', note='돌진 타격. 앵커=타격점(대상 몸통 왼쪽면). 왼쪽에서 오는 속도선 + 충격 별 + 흙먼지. 왼쪽을 향하면 flipX')
def impact_charge(fr, i, n, R):
    t = i / (n - 1); hx, hy = 40, 38
    rr = RNG(5)
    # 흙먼지(바닥, 뒤로 퍼짐)
    if t > 0.15:
        st = seg(t, 0.15, 1)
        D = disc(fr, hx - 10 - 10 * st, 54, 8 + 6 * st, 1.6, 0.7) + disc(fr, hx + 4, 55, 6 + 5 * st, 1.5, 0.6)
        D = (D + (fbm(fr.xx / 4, fr.yy / 3 + i, 3) - 0.5) * 0.6 * (D > 0) - st * 0.6) * (1 - seg(t, 0.8, 1.0))
        fr.field(D, 'dust', cuts=(0.15, 0.35, 0.6), outline=False, alpha=190, dither_below=0.3)
    # 속도선(처음 4프레임)
    if i <= 3:
        for k in range(7):
            y = hy + rr.r(-14, 14); L = rr.r(14, 28) * (1 - i / 4)
            x1 = hx - 4 - rr.r(0, 6) + i * 2
            F = seg_field(fr, x1 - L, y, x1, y, 0.9)
            fr.field(F * (0.7 if k % 2 else 0.95), 'impact', cuts=(0.4, 0.7, 0.9), outline=False)
    # 충격 별(뾰족 4~6 방향), 1~4 프레임
    if 1 <= i <= 5:
        s = [0.6, 1.0, 0.95, 0.75, 0.45][i - 1]
        F = disc(fr, hx, hy, 8 * s) * 1.1
        for k, a in enumerate([0.0, 0.8, 1.7, 2.6, 3.3, 4.2, 5.3]):
            L = (19 if k % 2 == 0 else 12) * s * (1.15 if k == 3 else 1.0)
            ex, ey = hx + math.cos(a) * L, hy + math.sin(a) * L
            F = np.maximum(F, seg_field(fr, hx, hy, ex, ey, 4.2 * s) * np.clip(1.05 - np.hypot(fr.xx - hx, fr.yy - hy) / (L + 2), 0.25, 1))
        if i <= 2: F = F * 1.2
        fr.field(F, 'impact', cuts=(0.16, 0.36, 0.56, 0.76, 0.92))
        fr.glow(disc(fr, hx, hy, 18 * s), 'impact', 3, 0.9)
    # 충격 링
    if 2 <= i <= 5:
        st = seg(i, 2, 5)
        fr.field(ring(fr, hx, hy, 10 + 9 * outQuart(st), 2.2 * (1 - st) + 0.7, 0.6, 1.0), 'impact', cuts=(0.3, 0.65), outline=False)
    # 파편 도트
    if i >= 2:
        for k in range(8):
            a = rr.r(-1.9, 1.2); sp = rr.r(10, 22); ph = seg(t, 0.2, 1)
            x = hx + math.cos(a) * sp * outCubic(ph); y = hy + math.sin(a) * sp * outCubic(ph) + 10 * ph * ph
            if ph < 0.9: fr.px(x, y, 'impact', 3 if k % 2 else 4)

# 5) 신성 버프(자신 중심, 공격 강화 기본형)
@fx('holy.blessing', size=(64, 80), frames=14, fps=12, anchor=(32, 68), family='holy', note='대상 발밑(앵커)에서 금빛 기둥·문양 고리가 일어서고 빛 알갱이가 올라감. 프레임 높이 80(머리 위 16px 여유)')
def blessing(fr, i, n, R, pal='holy'):
    t = i / (n - 1); gx, gy = 32, 68
    rr = RNG(77)
    up = outQuart(seg(t, 0, 0.35)); out = seg(t, 0.6, 1)
    # 발밑 문양 고리(타원 2겹 + 마디 점)
    rg = 10 + 12 * up
    G = ring(fr, gx, gy, rg, 1.3, 1.0, 0.38) * (1 - out)
    fr.field(G * 1.05, pal, cuts=(0.3, 0.6, 0.85))
    for k in range(8):
        a = k / 8 * math.tau + t * 2.0
        x, y = gx + math.cos(a) * rg, gy + math.sin(a) * rg * 0.38
        if out < 0.7: fr.px(x, y - 1, pal, 4)
    # 빛 기둥: 가운데 밝고 위로 갈수록 성기게(디더)
    hgt = 56 * up
    col = np.clip(1 - np.abs(fr.xx - gx) / (7 + 3 * up), 0, 1) * ((fr.yy <= gy) & (fr.yy >= gy - hgt))
    vfall = np.clip(1 - (gy - fr.yy) / max(hgt, 1), 0, 1)
    P = col * (0.45 + 0.6 * vfall) * (1 - out * 1.2)
    fr.glow(np.maximum(P * 0.8, disc(fr, gx, gy, 20, 1.0, 0.45) * (1 - out)), pal, 3, 0.9)
    fr.field(P, pal, cuts=(0.4, 0.6, 0.8, 0.95), outline=False, alpha=190, dither_below=0.55)
    # 상승 빛 알갱이(4점 반짝이)
    for k in range(9):
        d0 = rr.r(0, 0.5); life = rr.r(0.35, 0.55); xo = rr.r(-15, 15)
        ph = (t - d0) / life
        if 0 < ph < 1:
            y = gy - 4 - 44 * outCubic(ph); x = gx + xo + math.sin(ph * 6 + k) * 1.5
            star4(fr, x, y, 2 if ph < 0.6 else 1, pal, 5, 3)

# ---------- 2차: 나머지 계열 ----------
def reg(key, fn, **kw):
    FX[key] = dict(kw, draw=fn, key=key)

def glyph(fr, x, y, rows, pal, alpha=255):
    """문자 비트맵(0~5 = 램프 단계, '.' 투명, 'o' = 외곽선 램프[0])."""
    for j, row in enumerate(rows):
        for k, ch in enumerate(row):
            if ch == '.': continue
            fr.px(x + k, y + j, pal, 0 if ch == 'o' else int(ch), alpha)

PLUS = ['.ooo.', 'o343o', 'o454o', 'o343o', '.ooo.']
PLUS_BIG = ['..ooo..', '..o4o..', 'ooo5ooo', 'o45554o', 'ooo5ooo', '..o3o..', '..ooo..']
CHEV_UP = ['...o...', '..o4o..', '.o454o.', 'o43.34o', 'oo...oo']
CHEV_DN = ['oo...oo', 'o23.32o', '.o232o.', '..o2o..', '...o...']
SHIELD = ['ooooooo', 'o45553o', 'o45543o', 'o45443o', '.o443o.', '..o3o..', '...o...']

def bless_atk(fr, i, n, R): blessing(fr, i, n, R, 'atk')
reg('buff.atk', bless_atk, size=(64, 80), frames=14, fps=12, anchor=(32, 68), family='buff',
    note='공격 강화. holy.blessing 형태 + 적주황 램프 + 위 화살표(chevron). 앵커=발밑')
_old_bless_atk = bless_atk
def bless_atk2(fr, i, n, R):
    blessing(fr, i, n, R, 'atk'); t = i / (n - 1)
    if 0.2 < t < 0.8:
        y = int(30 - 14 * seg(t, 0.2, 0.8)); glyph(fr, 9, y, CHEV_UP, 'atk'); glyph(fr, 48, y + 4, CHEV_UP, 'atk')
FX['buff.atk']['draw'] = bless_atk2

# 방어 강화: 방패 결계(돔) + 육각 무늬
def buff_def(fr, i, n, R, pal='def'):
    t = i / (n - 1); cx, cy = 32, 40
    up = outQuart(seg(t, 0, 0.3)); out = seg(t, 0.65, 1)
    rx = 24 * (0.4 + 0.6 * up)
    D = np.sqrt(((fr.xx - cx) / rx) ** 2 + ((fr.yy - cy) / (rx * 1.18)) ** 2)
    shell = np.clip(1 - np.abs(D - 1) * rx / 1.6, 0, 1)
    # 육각 격자(희미) + 위에서 아래로 훑는 반짝 띠
    hx = ((np.abs(((fr.xx + (fr.yy // 11 % 2) * 6) % 12) - 6) < 0.6) & (fr.yy % 11 < 6)) | (fr.yy % 11 == 0)
    inner = (D < 1) & hx
    sweep = np.clip(1 - np.abs(fr.yy - (cy - 30 + 70 * seg(t, 0.15, 0.6))) / 3, 0, 1) * (D < 1)
    bt = np.tile(BAYER, (fr.h // 4 + 1, fr.w // 4 + 1))[:fr.h, :fr.w]
    keep = bt >= out * 1.05
    F = np.maximum(shell * 1.0, inner * 0.36 + sweep * 0.5) * keep
    if out >= 1: F = F * 0
    fr.glow(np.clip(1.2 - D, 0, 1) * (1 - out), pal, 2, 0.55)
    fr.field(F, pal, cuts=(0.3, 0.5, 0.75, 0.92), outline=False, alpha=210)
    if 0.25 < t < 0.75: glyph(fr, cx + 16, int(cy - 26 + 3 * seg(t, 0.25, 0.75)), SHIELD, pal)
    if i == 1: star4(fr, cx - 10, cy - 14, 3, pal)
reg('buff.def', buff_def, size=(64, 80), frames=12, fps=12, anchor=(32, 66), family='buff',
    note='방어 강화. 유닛을 감싸는 청색 결계 돔(육각 무늬·훑는 띠) + 머리 위 방패 표식. 앵커=발밑(돔 중심은 몸통)')

# 반격 태세(STANCE): 발밑 고리를 따라 바깥을 향한 창끝 6개가 솟고 돎
def buff_ward(fr, i, n, R, pal='steel', gpal='def'):
    t = i / (n - 1); gx, gy = 48, 66
    up = outQuart(seg(t, 0, 0.3)); out = seg(t, 0.7, 1)
    rg = 18 + 18 * up
    fr.field(ring(fr, gx, gy, rg, 1.4, 1.0, 0.42) * (1 - out) * 1.05, pal, cuts=(0.3, 0.6, 0.85))
    for k in range(6):
        a = k / 6 * math.tau + t * 1.6
        x, y = gx + math.cos(a) * rg, gy + math.sin(a) * rg * 0.42
        h = 12 * up * (1 - out)
        if h < 2: continue
        F, ly = tri_field(fr, x, y, 2.6, h, -math.pi / 2 + math.cos(a) * 0.35)
        F2 = np.where(F > 0, np.where(ly < 0, 0.95, 0.6), 0)
        fr.field(F2, pal, cuts=(0.3, 0.7, 0.9))
    fr.glow(disc(fr, gx, gy, rg + 6, 1.0, 0.45), gpal, 2, 0.6 * (1 - out))
    if i in (2, 3): star4(fr, gx + 14, gy - 30, 2, pal)
reg('buff.ward', buff_ward, size=(96, 80), frames=12, fps=12, anchor=(48, 66), family='buff',
    note='반격 태세(방진). 발밑 고리를 따라 바깥으로 향한 창끝 6개가 솟아 돌다 가라앉음. 앵커=발밑')

# 기동(SURGE·이동 증가): 몸을 감아 오르는 바람 줄기 + 발밑 먼지 + 위 화살표
def haste(fr, i, n, R, pal='move'):
    t = i / (n - 1); gx, gy = 32, 66
    out = seg(t, 0.7, 1)
    for k in range(3):
        ph = (t * 1.4 + k / 3) % 1.0
        yc = gy - 6 - 44 * ph; rx = 25 - 7 * ph
        a0 = (t * 9 + k * 2.1) % math.tau
        ang = np.arctan2((fr.yy - yc) / 0.35, fr.xx - gx)
        dang = (ang - a0) % math.tau
        F = ring(fr, gx, yc, rx, 2.4, 1.0, 0.35) * (dang < 2.8) * (1 - dang / 2.8 * 0.5)
        fr.field(F * (1 - out) * (1 - 0.4 * ph) * 1.1, pal, cuts=(0.3, 0.55, 0.8, 0.95), outline=True)
    if t < 0.5:
        st = seg(t, 0, 0.5)
        Dd = disc(fr, gx - 8 - 8 * st, gy, 6 + 4 * st, 1.7, 0.6) + disc(fr, gx + 9 + 7 * st, gy, 5 + 4 * st, 1.7, 0.6)
        fr.field(Dd * (1 - st) * 1.2, 'dust', cuts=(0.2, 0.45, 0.7), outline=False, alpha=190, dither_below=0.35)
    if 0.15 < t < 0.85:
        y = int(34 - 16 * seg(t, 0.15, 0.85)); glyph(fr, gx - 26, y, CHEV_UP, pal); glyph(fr, gx - 26, y + 6, CHEV_UP, pal); glyph(fr, gx + 19, y + 3, CHEV_UP, pal)
reg('buff.haste', haste, size=(64, 80), frames=12, fps=14, anchor=(32, 66), family='buff',
    note='기동 강화(SURGE 시전). 녹색 바람 줄기가 몸을 감아 오르고 발밑 흙먼지·위 화살표. 앵커=발밑')
reg('lightning.dash', lambda fr, i, n, R: (haste(fr, i, n, R, 'volt'), [fr.px(32 + RNG(i * 5 + k).r(-14, 14), 66 - RNG(i * 7 + k).r(4, 44), 'volt', 4) for k in range(4) if i < n - 2]),
    size=(64, 80), frames=12, fps=14, anchor=(32, 66), family='lightning',
    note='번개 기동(질풍·전광석화류 SURGE). buff.haste 형태 + 청백 전광 램프 + 튀는 전기 도트. 앵커=발밑')

# 함성·지휘: 머리 위치에서 퍼지는 음파 호 3겹 + 방사 선
def rally(fr, i, n, R, pal='atk'):
    t = i / (n - 1); hx, hy = 64, 40
    for k in range(3):
        st = seg(t, k * 0.14, k * 0.14 + 0.6)
        if 0 < st < 1:
            r = 10 + 46 * outCubic(st)
            ang = np.arctan2(fr.yy - hy, fr.xx - hx)
            side = (np.abs(ang) < 0.8) | (np.abs(np.abs(ang) - math.pi) < 0.8)
            F = ring(fr, hx, hy, r, 2.2 * (1 - st) + 0.8, 1.0, 0.8) * side
            fr.field(F * (1.05 - 0.3 * st), pal, cuts=(0.3, 0.6, 0.85, 0.97))
    if t < 0.45:
        st = seg(t, 0, 0.45)
        for a in [-2.5, -2.0, -1.57, -1.14, -0.64]:
            r0 = 10 + 10 * st; r1 = r0 + 9 * (1 - st)
            fr.field(seg_field(fr, hx + math.cos(a) * r0, hy + math.sin(a) * r0, hx + math.cos(a) * r1, hy + math.sin(a) * r1, 1.6) * 1.0, pal, cuts=(0.4, 0.75, 0.95))
        fr.glow(disc(fr, hx, hy, 18), pal, 3, 0.7 * (1 - st))
reg('shout.rally', rally, size=(128, 96), frames=12, fps=14, anchor=(64, 40), family='shout',
    note='함성·지휘(호령·독려·연설류 공격 강화). 앵커=시전자 머리(유닛 발밑에서 약 -26px). 좌우로 퍼지는 음파 호 3겹 + 위 방사선')

# 계책·약화: 머리 위 회전 문양 + 내려앉는 보랏빛 알갱이 + 아래 화살표
def scheme(fr, i, n, R, pal='arcane', cx=32, cy=22, gy=66, rad=13, motes=8):
    t = i / (n - 1); up = outQuart(seg(t, 0, 0.3)); out = seg(t, 0.68, 1)
    r = rad * (0.4 + 0.6 * up)
    fr.field(ring(fr, cx, cy, r, 1.3, 1.0, 0.45) * (1 - out) * 1.05, pal, cuts=(0.3, 0.6, 0.88))
    for k in range(4):
        a = k / 4 * math.tau - t * 3
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.45
        if out < 0.8: glyph(fr, int(x) - 1, int(y) - 1, ['o3o', '353', 'o3o'], pal)
    rr = RNG(31)
    for k in range(motes):
        d0 = rr.r(0.1, 0.55); ph = (t - d0) / 0.4; xo = rr.r(-r, r)
        if 0 < ph < 1:
            y = cy + (gy - 10 - cy) * inQuad(ph); fr.px(cx + xo, y, pal, 3); fr.px(cx + xo, y - 1, pal, 2); fr.px(cx + xo, y - 2, pal, 1)
    fr.glow(disc(fr, cx, cy, r + 8, 1.0, 0.6), pal, 2, 0.6 * (1 - out))
    if 0.3 < t < 0.85 and motes <= 10:
        y = int(gy - 34 + 10 * seg(t, 0.3, 0.85)); glyph(fr, cx - 17, y, CHEV_DN, pal); glyph(fr, cx + 11, y, CHEV_DN, pal)
reg('debuff.scheme', scheme, size=(64, 80), frames=13, fps=12, anchor=(32, 66), family='debuff',
    note='계책·약화(대상 1). 대상 머리 위 보랏빛 회전 문양 + 내려앉는 알갱이 + 좌우 아래 화살표. 앵커=대상 발밑')

def scheme_aoe(fr, i, n, R):
    t = i / (n - 1); cx, cy = 80, 92; up = outQuart(seg(t, 0, 0.35)); out = seg(t, 0.65, 1)
    r = 66 * (0.3 + 0.7 * up)
    fr.field(ring(fr, cx, cy, r, 1.6, 1.0, 0.62) * (1 - out) * 1.05, 'arcane', cuts=(0.3, 0.6, 0.88))
    fr.field(ring(fr, cx, cy, r * 0.62, 1.2, 1.0, 0.62) * (1 - out), 'arcane', cuts=(0.35, 0.7))
    for k in range(8):
        a = k / 8 * math.tau + t * 1.5
        x, y = cx + math.cos(a) * r * 0.81, cy + math.sin(a) * r * 0.81 * 0.62
        if out < 0.8: glyph(fr, int(x) - 1, int(y) - 1, ['o3o', '353', 'o3o'], 'arcane')
    fr.glow(disc(fr, cx, cy, r + 6, 1.0, 0.62), 'arcane', 1, 0.5 * (1 - out))
    rr = RNG(32)
    for k in range(26):
        d0 = rr.r(0.05, 0.6); ph = (t - d0) / 0.35; xo, yo = rr.r(-60, 60), rr.r(-34, 34)
        if 0 < ph < 1:
            y = cy + yo - 40 * (1 - inQuad(ph)); fr.px(cx + xo, y, 'arcane', 3); fr.px(cx + xo, y - 1, 'arcane', 2)
reg('debuff.scheme_aoe', scheme_aoe, size=(160, 160), frames=14, fps=12, anchor=(80, 92), family='debuff',
    note='계책 범위(반경 1 = 3x3 칸). 지면 보랏빛 이중 고리 + 마디 문양 + 내려앉는 알갱이. 앵커=중심 칸 발밑(중심 칸 정중앙에서 +12px)')

# 독: 몸통을 휘감는 녹색 독운 + 터지는 거품
def poison(fr, i, n, R):
    t = i / (n - 1); cx, cy = 32, 48; up = outQuart(seg(t, 0, 0.3)); out = seg(t, 0.55, 1)
    C = disc(fr, cx - 11, cy + 4, 14 * up + 3, 1.2, 0.8) + disc(fr, cx + 11, cy + 2, 13 * up + 3, 1.2, 0.8) + disc(fr, cx, cy - 8 - 6 * out, 13 * up + 2)
    C = (C + (fbm(fr.xx / 4, fr.yy / 4 - t * 6, 23) - 0.5) * 0.6 * (C > 0) - out * 0.85) * (1 - seg(t, 0.85, 1.0))
    fr.field(C, 'poison', cuts=(0.15, 0.35, 0.6, 0.85), outline=True, alpha=200, dither_below=0.3)
    rr = RNG(9)
    for k in range(7):
        d0 = rr.r(0.1, 0.6); ph = (t - d0) / 0.3; x = cx + rr.r(-14, 14); y0 = cy + rr.r(-4, 8)
        if 0 < ph < 1:
            y = y0 - 14 * ph
            if ph < 0.75: glyph(fr, int(x) - 1, int(y) - 1, ['.o.', 'o4o', '.o.'] if k % 2 else ['oo', 'o4'], 'poison')
            else: fr.px(x - 1, y, 'poison', 4); fr.px(x + 1, y, 'poison', 4)
reg('poison.cloud', poison, size=(64, 64), frames=12, fps=12, anchor=(32, 48), family='poison',
    note='독·중독(현재 배정 스킬 없음, 예비). 대상 몸통 둘레 녹색 독운 + 오르며 터지는 거품. 앵커=대상 몸통')

# 연막(DECOY 공성계): 유닛을 가리는 큰 연기 뭉치
def smoke_decoy(fr, i, n, R):
    t = i / (n - 1); cx, cy = 48, 56; up = outQuart(seg(t, 0, 0.35)); out = seg(t, 0.5, 1)
    S = np.zeros((fr.h, fr.w), np.float32)
    rr = RNG(55)
    for k in range(7):
        a = k / 7 * math.tau; d = 14 + 8 * up
        S = np.maximum(S, disc(fr, cx + math.cos(a) * d * 1.3, cy + math.sin(a) * d * 0.6 - 10 * out, (8 + 9 * up) * rr.r(0.8, 1.2)))
    S = np.maximum(S, disc(fr, cx, cy - 10, 14 * up + 2, 1.2, 1.0))
    S = S + (fbm(fr.xx / 6, fr.yy / 6 - t * 5, 4) - 0.5) * 0.5 * (S > 0) - out * 0.9
    # 좌상단 광원: 위쪽 왼편 한 단 밝게
    S = S + 0.12 * np.clip((cy - fr.yy) / 30 + (cx - fr.xx) / 60, 0, 1) * (S > 0.15)
    fr.field(S * (1 - seg(t, 0.85, 1.0)), 'smoke', cuts=(0.15, 0.32, 0.55, 0.78), outline=True, alpha=215, dither_below=0.3)
reg('debuff.smoke', smoke_decoy, size=(96, 80), frames=12, fps=12, anchor=(48, 66), family='debuff',
    note='연막·기만(공성계 DECOY). 시전자를 가리는 연기 뭉치가 피었다가 위로 흩어짐. 앵커=발밑')

# 치유: 발밑 녹색 고리 + 떠오르는 십자 + 반짝
def heal_one(fr, t, gx, gy, s, seed, big=True):
    up = outQuart(seg(t, 0, 0.3)); out = seg(t, 0.7, 1)
    rg = (8 + 12 * up) * s
    fr.field(ring(fr, gx, gy, rg, 1.3, 1.0, 0.38) * (1 - out) * 1.05, 'heal', cuts=(0.3, 0.6, 0.85))
    col = np.clip(1 - np.abs(fr.xx - gx) / (10 * s), 0, 1) * ((fr.yy <= gy) & (fr.yy >= gy - 44 * s * up))
    fr.glow(np.maximum(col * 0.7, disc(fr, gx, gy, rg + 4, 1.0, 0.45)) * (1 - out), 'heal', 3, 0.8)
    rr = RNG(seed)
    for k in range(int(5 * s) + 1):
        d0 = rr.r(0.05, 0.5); ph = (t - d0) / 0.45; xo = rr.r(-13, 13) * s
        if 0 < ph < 1:
            y = gy - 8 - 38 * s * outCubic(ph)
            g = PLUS_BIG if (big and k % 3 == 0 and ph < 0.7) else PLUS
            glyph(fr, int(gx + xo) - len(g[0]) // 2, int(y), g, 'heal')
    if 0.2 < t < 0.65: star4(fr, gx + rr.i(-12, 12) * s, gy - rr.i(18, 36) * s, 2, 'heal')
reg('heal.single', lambda fr, i, n, R: heal_one(fr, i / (n - 1), 32, 68, 1.0, 3), size=(64, 80), frames=14, fps=12, anchor=(32, 68),
    family='heal', note='치유(대상 1). 발밑 녹색 고리 + 옅은 빛 기둥 + 떠오르는 십자. 앵커=대상 발밑')
def heal_area(fr, i, n, R):
    t = i / (n - 1); cx, cy = 80, 108
    up = outQuart(seg(t, 0, 0.3)); out = seg(t, 0.7, 1)
    fr.field(ring(fr, cx, cy - 16, 62 * (0.3 + 0.7 * up), 1.6, 1.0, 0.6) * (1 - out) * 1.05, 'heal', cuts=(0.3, 0.6, 0.88))
    pts = [(80, 108, 0.0), (36, 80, 0.12), (124, 80, 0.18), (44, 128, 0.24), (116, 128, 0.3)]
    for k, (x, y, d) in enumerate(pts):
        lt = (t - d) / (1 - 0.3)
        if 0 < lt < 1: heal_one(fr, lt, x, y - 16, 0.8, 11 + k, big=(k == 0))
reg('heal.area', heal_area, size=(160, 160), frames=16, fps=12, anchor=(80, 92), family='heal',
    note='치유 범위(반경 1). 큰 녹색 고리 + 5지점 순차 치유. 앵커=중심 칸 발밑')

# 화염 범위
def fire_aoe(fr, i, n, R):
    t = i / (n - 1); cx, cy = 80, 92
    st = seg(t, 0, 0.5)
    if st < 1:
        fr.field(ring(fr, cx, cy, 10 + 60 * outQuart(st), 2.6 * (1 - st) + 0.8, 1.0, 0.6) * (1 - st) * 1.1, 'fire', cuts=(0.3, 0.6, 0.85), outline=True)
    pts = [(40, 64, 0.08), (120, 64, 0.12), (80, 92, 0.0), (40, 122, 0.18), (120, 122, 0.22), (80, 56, 0.26), (80, 130, 0.3)]
    for k, (x, y, d) in sorted(enumerate(pts), key=lambda e: e[1][1]):
        lt = (t - d) / 0.68
        if 0 < lt < 1: fire_blob(fr, lt, x, y, 1.15 if k == 2 else 0.8, k + 2, R, smoke=(k % 2 == 0))
reg('fire.aoe', fire_aoe, size=(160, 160), frames=16, fps=16, anchor=(80, 92), family='fire',
    note='화공 범위(반경 1 = 3x3 칸). 지면 불꽃 고리 + 7지점 순차 폭염. 앵커=중심 칸 몸통 높이')

# 물보라(수전·물길)
def splash(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 66; up = outQuart(seg(t, 0, 0.28)); out = seg(t, 0.35, 0.8)
    h = 30 * up * (1 - out)
    v = np.clip((gy - fr.yy) / max(h, 1), 0, 1)
    wid = 8 - 5 * v + (fbm(fr.xx / 2, fr.yy / 3 - t * 9, 7) - 0.5) * 3
    col = np.clip(1 - np.abs(fr.xx - gx) / np.maximum(wid, 0.5), 0, 1) * ((fr.yy <= gy) & (fr.yy >= gy - h)) * (h > 1.5)
    crown = disc(fr, gx, gy - h, 4 + 4 * out, 1.4, 0.8) * (h > 4)
    for sx in (-1, 1):
        crown = np.maximum(crown, seg_field(fr, gx, gy - h, gx + sx * (6 + 6 * out), gy - h - 4 + 8 * out, 1.6) * (h > 4))
    W = np.maximum(col * (0.75 + 0.35 * (fr.xx < gx)), crown * 0.95)
    fr.field(W, 'water', cuts=(0.2, 0.45, 0.7, 0.9))
    for k in range(2):
        st = seg(t, 0.1 + k * 0.2, 0.7 + k * 0.2)
        if 0 < st < 1: fr.field(ring(fr, gx, gy, 6 + 20 * outCubic(st), 1.4, 1.0, 0.35) * (1 - st) * 1.1, 'water', cuts=(0.3, 0.7))
    rr = RNG(8)
    for k in range(14):
        a = rr.r(-2.7, -0.45); sp = rr.r(14, 26); ph = seg(t, 0.15, 0.95)
        x = gx + math.cos(a) * sp * ph; y = gy - 26 + math.sin(a) * sp * ph + 34 * ph * ph
        if 0 < ph < 0.95 and y < gy + 2 and t < 0.93: fr.px(x, y, 'water', 4); fr.px(x, y + 1, 'water', 2)
reg('water.splash', splash, size=(64, 80), frames=12, fps=14, anchor=(32, 66), family='water',
    note='물보라(수전·물길 계열). 대상 발밑에서 물기둥이 솟고 물방울이 포물선으로 떨어짐 + 파문 2겹. 앵커=발밑')

# 베기(STRIKE 기본): 초승달 궤적, 오른쪽을 향한 휘두름
def slash(fr, i, n, R, pal='steel'):
    cx, cy = 26, 38
    sw = [(0.0, 0.35), (0.0, 0.85), (0.15, 1.0), (0.45, 1.0), (0.7, 1.0), (0.88, 1.0), (1.0, 1.0)][min(i, 6)]
    a0, a1 = -2.2, 1.0
    ang = np.arctan2(fr.yy - cy, fr.xx - cx)
    u = (ang - a0) / (a1 - a0)
    d = np.hypot(fr.xx - cx, (fr.yy - cy) * 1.1)
    thick = 6.5 * np.sin(np.clip(u, 0, 1) * math.pi) + 0.5
    F = np.clip(1 - np.abs(d - 22) / np.maximum(thick, 0.6), 0, 1) * ((u >= sw[0]) & (u <= sw[1]))
    F = F * (0.65 + 0.45 * np.clip((u - sw[0]) / max(1e-3, sw[1] - sw[0]), 0, 1))
    fr.field(F * 1.15, pal, cuts=(0.2, 0.4, 0.65, 0.85, 1.0))
    if 1 <= i <= 3:
        fr.glow(np.clip(1 - np.abs(d - 22) / 9, 0, 1) * ((u >= sw[0]) & (u <= sw[1])), pal, 3, 0.8)
    if 2 <= i <= 4:
        hx, hy = cx + 22 * math.cos(0.15), cy + 22 * math.sin(0.15)
        s = [1.0, 0.8, 0.5][i - 2]
        for a in [0.3, 1.2, -0.6, 2.4, -1.6]:
            fr.field(seg_field(fr, hx, hy, hx + math.cos(a) * 10 * s, hy + math.sin(a) * 10 * s, 1.6 * s + 0.4), 'impact', cuts=(0.35, 0.7, 0.92))
reg('impact.slash', slash, size=(64, 64), frames=8, fps=20, anchor=(40, 38), dir='right', family='impact',
    note='베기 일격(강타류 STRIKE 기본). 오른쪽 위에서 아래로 쓸어내리는 초승달 궤적 + 타격 불꽃. 앵커=타격점(대상 몸통). 왼쪽을 향하면 flipX')

# 관통(PIERCE): 긴 찌르기 + 방어 파쇄 파편
def pierce(fr, i, n, R, pal='steel', spal='def'):
    hy = 36; tip = [26, 64, 74, 76, 76, 76, 76, 76, 76, 76][i]
    out = seg(i, 3, 7)
    if i <= 6:
        F = np.zeros((fr.h, fr.w), np.float32)
        tail = 4 + 30 * out
        F = np.maximum(F, seg_field(fr, tail, hy, tip, hy, 3.4 * (1 - out) + 0.6))
        F = np.maximum(F, tri_field(fr, tip - 2, hy, 5.5 * (1 - out * 0.7), 14, 0.0)[0] * 1.1)
        fr.field(F * 1.1, pal, cuts=(0.2, 0.45, 0.7, 0.9))
        if i <= 3: fr.glow(seg_field(fr, tail, hy, tip + 10, hy, 9), pal, 2, 0.8)
        for k in range(5):
            y = hy + RNG(k + 3).r(-12, 12); L = RNG(k + 9).r(10, 22)
            if i <= 2: fr.field(seg_field(fr, tip - 30 - L, y, tip - 30, y, 0.8) * 0.9, pal, cuts=(0.4, 0.8), outline=False)
    if 1 <= i <= 4:
        s = [1.0, 1.0, 0.75, 0.45][i - 1]
        C = disc(fr, 76, hy, 9 * s, 0.8, 1.2)
        fr.field(C * 1.2, 'impact', cuts=(0.2, 0.45, 0.7, 0.9))
    if i >= 2:
        rr = RNG(17); ph = seg(i, 2, n - 1)
        for k in range(7):
            a = rr.r(-1.1, 1.1); sp = rr.r(8, 18)
            x = 76 + math.cos(a) * sp * outCubic(ph); y = hy + math.sin(a) * sp * outCubic(ph) + 8 * ph * ph
            if ph < 0.9: glyph(fr, int(x), int(y), ['o3', '3o'] if k % 2 else ['3o', 'o2'], spal)
reg('impact.pierce', pierce, size=(96, 64), frames=10, fps=20, anchor=(76, 36), dir='right', family='impact',
    note='관통(방어 무시 PIERCE). 왼쪽에서 오른쪽으로 길게 뻗는 청백 찌르기 + 끝점 섬광 + 방어 파쇄 파편. 앵커=타격점. 시전자는 앵커에서 왼쪽 약 60px')

# 화살비(궁·사격 범위)
ARROW_D = (0.42, 1.0)
def arrow_rain(fr, i, n, R):
    t = i / (n - 1); cx, cy = 80, 92
    dx, dy = ARROW_D; L = math.hypot(dx, dy); dx, dy = dx / L, dy / L
    rr = RNG(21)
    for k in range(16):
        d0 = rr.r(0.0, 0.42); tx = cx + rr.r(-62, 62); ty = cy + rr.r(-36, 36)
        fall = 0.18; ph = (t - d0) / fall
        if 0 <= ph < 1:
            hx, hy = tx - dx * 70 * (1 - ph), ty - dy * 70 * (1 - ph)
            fr.field(seg_field(fr, hx - dx * 15, hy - dy * 15, hx, hy, 1.2), 'wood', cuts=(0.25, 0.7), outline=True)
            fr.field(tri_field(fr, hx - dx * 2, hy - dy * 2, 2.2, 5, math.atan2(dy, dx))[0] * 1.1, 'steel', cuts=(0.2, 0.6, 0.9))
            for q in (13, 15): fr.px(hx - dx * q - 1, hy - dy * q, 'holy', 4); fr.px(hx - dx * q + 1, hy - dy * q, 'holy', 3)
        elif ph >= 1:
            age = (t - d0 - fall)
            if age < 0.38 and t < 0.93:
                fr.field(seg_field(fr, tx - dx * 9, ty - dy * 9, tx, ty, 1.1), 'wood', cuts=(0.25, 0.7), outline=True)
                fr.px(tx - dx * 9 - 1, ty - dy * 9, 'holy', 4); fr.px(tx - dx * 9 + 1, ty - dy * 9, 'holy', 3)
                if age < 0.1:
                    fr.field(disc(fr, tx, ty + 1, 6, 1.6, 0.6) * 1.1, 'dust', cuts=(0.2, 0.5, 0.8), outline=False, alpha=210)
                    fr.px(tx + 2, ty - 2, 'impact', 4); fr.px(tx - 2, ty - 1, 'impact', 4)
reg('arrow.rain', arrow_rain, size=(160, 160), frames=16, fps=16, anchor=(80, 92), family='arrow',
    note='화살비(궁병 범위 AOE). 왼쪽 위에서 비스듬히 쏟아지는 화살 20발 → 꽂혀 흙먼지 → 사라짐. 앵커=중심 칸 발밑. 시전자가 오른쪽이면 flipX')

# 포격·사격(화포·화승총·투석 범위)
def barrage(fr, i, n, R, stone=False):
    t = i / (n - 1)
    pts = [(80, 92, 0.0), (42, 66, 0.1), (118, 70, 0.16), (52, 122, 0.24), (114, 120, 0.3), (82, 60, 0.36)]
    for k, (x, y, d) in sorted(enumerate(pts), key=lambda e: e[1][1]):
        inc = 0.12; lt = (t - d)
        if -inc < lt < 0:  # 낙하 포탄
            ph = (lt + inc) / inc
            bx, by = x - 30 * (1 - ph), y - 60 * (1 - ph)
            glyph(fr, int(bx) - 1, int(by) - 1, ['oo', 'oo'] if not stone else ['o1o', '121', 'o1o'], 'smoke' if not stone else 'dust')
            fr.px(bx - 3 * (1 - ph) - 2, by - 4, 'smoke', 3)
        elif lt >= 0:
            lt2 = lt / 0.6
            if lt2 < 1:
                fire_blob(fr, lt2, x, y, 0.62 if k else 0.8, k + 30, R, smoke=True)
                if lt2 < 0.5:
                    rr = RNG(k + 40)
                    for m in range(5):
                        a = rr.r(-2.8, -0.3); sp = rr.r(8, 16)
                        fr.px(x + math.cos(a) * sp * lt2 * 2, y + math.sin(a) * sp * lt2 * 2 + 10 * lt2 * lt2, 'dust', 1)
reg('shot.barrage', barrage, size=(160, 160), frames=18, fps=16, anchor=(80, 92), family='shot',
    note='포격·일제 사격(화포·화승총·함포·투석 범위). 6지점 순차 착탄 폭발 + 연기 + 흙 파편. 앵커=중심 칸 몸통 높이')

# 패시브 발동 소형(32): 공격·방어·회복
def proc(fr, i, n, R, kind):
    t = i / (n - 1); pal = {'atk': 'atk', 'def': 'def', 'heal': 'heal'}[kind]
    st = seg(t, 0, 0.5); out = seg(t, 0.6, 1)
    if st < 1: fr.field(ring(fr, 16, 18, 4 + 10 * outCubic(st), 1.4, 1.0, 0.8) * (1 - st) * 1.1, pal, cuts=(0.3, 0.7))
    g = {'atk': CHEV_UP, 'def': SHIELD, 'heal': PLUS_BIG}[kind]
    if out < 1:
        y = int(14 - 6 * outCubic(seg(t, 0, 0.6)) - 3 * out)
        if out < 0.6 or (i % 2 == 0): glyph(fr, 16 - len(g[0]) // 2, y, g, pal)
    if i == 1: star4(fr, 24, 9, 2, pal)
for _k in ('atk', 'def', 'heal'):
    reg(f'proc.{_k}', (lambda kk: (lambda fr, i, n, R: proc(fr, i, n, R, kk)))(_k), size=(32, 32), frames=8, fps=14, anchor=(16, 26),
        family='proc', note=f'패시브 발동 소형 표식({_k}). 유닛 머리 위(앵커=유닛 머리끝 높이)에 0.6초. SkillFx 패시브 팝업 대체 후보')

# ---------- 최종 키 규약: fx.skill.<fx_family>.<variant> (fx_family = 서버 skill_use.fx_family 7종 + decoy·passive) ----------
# variant = 서버 fx_variant(속성 코드 fire/thunder/water_ice/poison) 또는 base / 하위 연출명(charge·water·shot·scheme·atk·def·rally·holy·single·area)
ELEM_PAL = {'fire': 'fire', 'thunder': 'volt', 'water_ice': 'ice', 'poison': 'poison'}
FINAL = {}
def final(key, src=None, **over):
    """src = FX 정의 키(그대로 쓰기) 또는 None(over 에 draw 포함)."""
    base = dict(FX[src]) if src else {}
    base.update(over); base['key'] = key; base['src'] = src
    FINAL[key] = base

# strike
final('strike.base', 'impact.slash')
final('strike.charge', 'impact.charge')
final('strike.fire', 'fire.burst')
final('strike.thunder', 'lightning.strike')
final('strike.water_ice', 'ice.burst')
final('strike.poison', 'poison.cloud')
final('strike.water', 'water.splash')
# pierce
final('pierce.base', 'impact.pierce')
for el, pal in ELEM_PAL.items():
    final(f'pierce.{el}', 'impact.pierce', draw=(lambda p: (lambda fr, i, n, R: pierce(fr, i, n, R, p, p)))(pal),
          note=f'관통 {el} 속성. impact.pierce 형태 + {pal} 램프(창끝·파편). 앵커=타격점, 왼쪽을 향하면 flipX')
# surge
final('surge.base', 'buff.haste')
final('surge.thunder', 'lightning.dash')
for el in ('fire', 'water_ice', 'poison'):
    final(f'surge.{el}', 'buff.haste', draw=(lambda p: (lambda fr, i, n, R: haste(fr, i, n, R, p)))(ELEM_PAL[el]),
          note=f'기동 {el} 속성. buff.haste 형태 + {ELEM_PAL[el]} 램프. 앵커=발밑')
# stance
final('stance.base', 'buff.ward')
for el, pal in ELEM_PAL.items():
    final(f'stance.{el}', 'buff.ward', draw=(lambda p: (lambda fr, i, n, R: buff_ward(fr, i, n, R, p, p)))(pal),
          note=f'반격 태세 {el} 속성. buff.ward 형태 + {pal} 램프. 앵커=발밑')
# buff
final('buff.atk', 'buff.atk')
final('buff.def', 'buff.def')
final('buff.rally', 'shout.rally')
final('buff.holy', 'holy.blessing')
# heal
final('heal.single', 'heal.single')
final('heal.area', 'heal.area')
# aoe: 무속성 3종 + 속성 4종(단일 대상 시트를 3x3 칸에 흩뿌린 합성 + 지면 고리)
final('aoe.base', 'arrow.rain')
final('aoe.shot', 'shot.barrage')
final('aoe.scheme', 'debuff.scheme_aoe')
final('aoe.fire', 'fire.aoe')
AOE_PTS = [(80, 92, 0), (40, 64, 2), (120, 66, 3), (42, 122, 4), (118, 120, 5)]
for el, src, dy in (('thunder', 'lightning.strike', 14), ('water_ice', 'ice.burst', 14), ('poison', 'poison.cloud', 0)):
    final(f'aoe.{el}', None, size=(160, 160), frames=FX[src]['frames'] + 6, fps=FX[src]['fps'], anchor=(80, 92), family='aoe',
          compose=dict(src=src, pts=[(x, y + dy, d) for x, y, d in AOE_PTS], ring=ELEM_PAL[el]),
          note=f'{el} 속성 범위(반경 1). strike.{el} 을 5칸에 순차 배치 + 지면 고리. 앵커=중심 칸 몸통 높이')
# decoy(서버 FAMILY 표에 없음 — 박백엔 확인 필요), passive
final('decoy.base', 'debuff.smoke')
for k in ('atk', 'def', 'heal'): final(f'passive.{k}', f'proc.{k}')

def compose_frames(spec, cache):
    c = spec['compose']; src = FX[c['src']]
    if c['src'] not in cache:
        cache[c['src']] = [render_frame(src, i) for i in range(src['frames'])]
    sf = cache[c['src']]; sax, say = src['anchor']; w, h = spec['size']; n = spec['frames']
    out = []
    for i in range(n):
        fr = Frame(w, h); t = i / (n - 1); st = seg(t, 0, 0.45)
        if st < 1:
            fr.field(ring(fr, 80, 92, 10 + 60 * outQuart(st), 2.6 * (1 - st) + 0.8, 1.0, 0.6) * (1 - st) * 1.1, c['ring'], cuts=(0.3, 0.6, 0.85))
        im = fr.image()
        for x, y, d in sorted(c['pts'], key=lambda p: p[1]):
            j = i - d
            if 0 <= j < len(sf): im.alpha_composite(sf[j], (int(x - sax), int(y - say)))
        out.append(im)
    return out

def render_frame(spec, i):
    fr = Frame(*spec['size']); spec['draw'](fr, i, spec['frames'], RNG(1000 + i * 7 + len(spec['key']))); return fr.image()

# ---------- 출력 ----------
def unit_bg():
    try:
        sh = Image.open('public/assets/sprites/64/sword_ally_sheet.png').convert('RGBA')
        return sh.crop((64, 0, 128, 64))
    except Exception:
        return None

COLS_MAX = 8
def build(spec, outdir, prevdir=None, cache=None):
    w, h = spec['size']; n = spec['frames']
    frames = compose_frames(spec, cache) if spec.get('compose') else [render_frame(spec, i) for i in range(n)]
    cols = min(n, COLS_MAX); rows = (n + cols - 1) // cols
    sheet = Image.new('RGBA', (w * cols, h * rows), (0, 0, 0, 0))
    for i, im in enumerate(frames): sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    fam, var = spec['key'].split('.', 1)
    os.makedirs(f'{outdir}/{fam}', exist_ok=True)
    path = f'{outdir}/{fam}/{var}.png'
    sheet.save(path, optimize=True)
    if prevdir: preview(spec, frames, prevdir)
    return path, frames, cols, rows

def preview(spec, frames, d):
    os.makedirs(d, exist_ok=True)
    w, h = spec['size']; n = len(frames); ax, ay = spec['anchor']
    unit = unit_bg()
    S = 2
    def comp(im, dark):
        bg = Image.new('RGBA', (w, h), (30, 34, 46, 255) if dark else (96, 140, 72, 255))
        if not dark:  # 풀밭 체크
            px = bg.load()
            for y in range(h):
                for x in range(w):
                    if ((x // 8) + (y // 8)) % 2: px[x, y] = (88, 130, 66, 255)
        if unit is not None and w >= 64:
            # 유닛 발 = 앵커 기준(버프·지면형) / 몸통 = 앵커(타격형)
            ux = ax - 32 if spec.get('dir') != 'right' else ax - 14
            uy = (ay - 60) if ay >= h - 20 else (ay - 34)
            bg.alpha_composite(unit, (int(ux), int(uy)))
        bg.alpha_composite(im)
        return bg
    rows = []
    for dark in (True, False):
        row = Image.new('RGBA', (w * n, h))
        for i, im in enumerate(frames): row.paste(comp(im, dark), (i * w, 0))
        rows.append(row)
    cs = Image.new('RGBA', (w * n, h * 2)); cs.paste(rows[0], (0, 0)); cs.paste(rows[1], (0, h))
    cs = cs.resize((w * n * S, h * 2 * S), Image.NEAREST)
    name = spec['key'].replace('.', '_')
    cs.save(f'{d}/{name}_contact_x2.png')
    g = [comp(im, False).resize((w * 3, h * 3), Image.NEAREST).convert('P', palette=Image.ADAPTIVE, colors=255) for im in frames]
    g[0].save(f'{d}/{name}.gif', save_all=True, append_images=g[1:], duration=int(1000 / spec['fps']), loop=0, disposal=2)

def fragment_item(key, sp, path, cols, rows):
    w, h = sp['size']; ax, ay = sp['anchor']
    return {
        'key': f'fx.skill.{key}', 'path': path.replace('public/', '', 1), 'type': 'spritesheet',
        'frameWidth': w, 'frameHeight': h, 'frames': sp['frames'], 'columns': cols, 'rows': rows,
        'size': f'{w * cols}x{h * rows}', 'alpha': True, 'fps_hint': sp['fps'], 'loop': sp.get('loop', False),
        'anchor': {'x': ax, 'y': ay, 'originX': round(ax / w, 4), 'originY': round(ay / h, 4)},
        'facing': 'right(왼쪽을 향하면 flipX)' if sp.get('dir') == 'right' else 'none(좌우 대칭, 뒤집기 불필요)',
        'note': sp['note'], 'displayScale': '1배(1 이펙트 px = 64px 유닛 시트 1 px). 확대 시 정수 배율·NEAREST',
        'scope': 'battle', 'load_hint': f'scope battle(스킬 시전 시 지연 로드 권장). Phaser spritesheet frameWidth {w} frameHeight {h}, {sp["frames"]}프레임, 1회 재생 후 제거(마지막 프레임 빈칸)',
        'generator': {'model': 'none(절차 생성, 이미지 모델 호출 0)', 'script': 'docker/gemini/skill_fx_build.py (Python Pillow·numpy)', 'method': 'pixelfx 방식(색+빛 2버퍼·램프 계단·Bayer 디더·시드 고정) 자체 구현 — pixelfx 저장소 코드 미사용'},
        'prompt_ref': 'docker/gemini/skill_fx_build.py FINAL[' + key + ']', 'license': '자체 제작(코드 생성), 외부 소스 없음',
        'qa': {'checked': True, 'verdict': QA.get(key, ('minor', ['자동 점검만']))[0], 'issues': QA.get(key, ('minor', ['자동 점검만']))[1]},
        'verify': False, 'bytes': os.path.getsize(path),
    }

QA = {}
try:
    QA = {k: tuple(v) for k, v in json.load(open('docker/gemini/skill_fx_qa.json', encoding='utf-8')).items()}
except Exception:
    pass

if __name__ == '__main__':
    args = sys.argv[1:]; prev = None
    if '--preview' in args:
        k = args.index('--preview'); prev = args[k + 1]; args = args[:k] + args[k + 2:]
    keys = [k for k in FINAL if not args or any(k.startswith(a) for a in args)]
    cache = {}; items = []
    fp = f'{OUT}/manifest_fragment_skill_fx.json'
    old = json.load(open(fp, encoding='utf-8')) if os.path.exists(fp) else {'items': []}
    byk = {it['key']: it for it in old.get('items', [])}
    for k in keys:
        sp = FINAL[k]
        path, frames, cols, rows = build(sp, OUT, prev, cache)
        it = fragment_item(k, sp, path, cols, rows); it['empty_last'] = frames[-1].getbbox() is None
        byk[it['key']] = it
        print(k, path, sp['frames'], 'f', it['size'], it['bytes'], 'B', 'last-empty' if it['empty_last'] else 'LAST-NOT-EMPTY')
    order = ['fx.skill.' + k for k in FINAL]
    frag = {'_note': '영웅 스킬 이펙트 시트(안아트 2026-11-06, 이미지 모델 호출 0). 키 규약 fx.skill.<fx_family>.<variant>: fx_family = 서버 skill_use.fx_family, variant = fx_variant(속성) 또는 base/하위 연출. 연결 요청서 = fx/skills/skill_fx_request.json. 병합 merge_fragments.mjs FRAGMENTS',
            'items': [byk[k] for k in order if k in byk]}
    json.dump(frag, open(fp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
