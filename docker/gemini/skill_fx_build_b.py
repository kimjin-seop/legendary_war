# 영웅 스킬 이펙트 시트 배치 B(안아트 2026-11-08, 이미지 모델 호출 0).
# 목적: 계열 기본값(strike.base·aoe.base·buff.atk·buff.def·surge.base·stance.base)으로 떨어지던 w3_*·p1_* 액티브 44종에
#       스킬 이름·플레이버에 맞춘 전용 변형 시트를 절차 생성한다. 그림 규칙·버퍼·램프·디더는 skill_fx_build.py 를 그대로 가져다 쓴다
#       (광원 좌상단, 램프 최암 톤 1px 외곽선, 3~5단 계단 음영, 안티앨리어싱 없음, 1 이펙트 px = 64px 유닛 시트 1 px).
# 키 규약: fx.skill.<계열>.<변형>. 계열은 반드시 해당 스킬 template 의 계열(SkillFxSheet.anchorMode·CAST/IMPACT 단계가 계열로 정해짐).
#   strike.* / pierce.* = 앵커 대상 몸통, aoe.* = 중심 칸, buff.*·surge.*·stance.* = 발밑.
# 실행(저장소 루트): python docker/gemini/skill_fx_build_b.py [key 접두사 ...] [--preview <폴더>]
# 산출: public/assets/fx/skills/<계열>/<변형>.png, 조각 public/assets/fx/skills/manifest_fragment_skill_fx_b.json
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import skill_fx_build as B
from skill_fx_build import (Frame, RNG, PAL, PALRGB, BAYER, hexrgb, fbm, disc, ring, seg_field, tri_field, star4, glyph,
                            outQuart, outCubic, inQuad, seg, fire_blob, CHEV_UP, CHEV_DN, SHIELD, PLUS)

# 추가 램프(어두운 -> 밝은, [0] 외곽선)
PAL.update({
    'leaf':  ['#0e2614', '#1e5a26', '#3a8a34', '#78b844', '#c8e070', '#f0f8c0'],
    'shade': ['#120c1c', '#2a2040', '#463a62', '#6a5c88', '#9a8cb4', '#d0c4e4'],
    'stone': ['#26222a', '#4a4650', '#706a74', '#9a949c', '#c4bec4', '#ece8ec'],
    'gsmoke': ['#5a5a62', '#8a8a92', '#b0b0b6', '#d2d2d6', '#ececee', '#ffffff'],
})
for k in ('leaf', 'shade', 'stone', 'gsmoke'): PALRGB[k] = [hexrgb(c) for c in PAL[k]]

def bt(fr): return np.tile(BAYER, (fr.h // 4 + 1, fr.w // 4 + 1))[:fr.h, :fr.w]
def rect(fr, x0, y0, x1, y1): return ((fr.xx >= x0) & (fr.xx <= x1) & (fr.yy >= y0) & (fr.yy <= y1)).astype(np.float32)
def lvl(m, v): return np.where(m > 0, v, 0).astype(np.float32)
L2, L3, L4, L5 = 0.5, 0.7, 0.86, 0.96     # 기본 cuts 에서 램프 2·3·4·5단

def puff(fr, t, x, y, s, seed, pal='dust', alpha=200, rise=6):
    """흙먼지/연기 뭉치(t 0..1, 피었다 흩어짐)."""
    if t <= 0 or t >= 1: return
    g = outQuart(seg(t, 0, 0.4)); o = seg(t, 0.35, 1)
    D = disc(fr, x, y - rise * t * s, (3 + 6 * g) * s, 1.5, 0.8) + disc(fr, x + 3 * s, y - (2 + rise * t) * s, (2 + 4 * g) * s, 1.3, 0.8)
    D = D + (fbm(fr.xx / 4 + seed, fr.yy / 3 - t * 6, 3 + seed) - 0.5) * 0.6 * (D > 0) - o * 0.75
    D = D + 0.1 * np.clip((y - fr.yy) / 10 + (x - fr.xx) / 20, 0, 1) * (D > 0.15)
    fr.field(D, pal, cuts=(0.15, 0.35, 0.6), outline=False, alpha=alpha, dither_below=0.3)

def burst(fr, x, y, s, pal='impact', rays=6, seed=0, glow=True):
    """충격 별(뾰족 광선 + 핵)."""
    rr = RNG(seed + 3)
    F = disc(fr, x, y, 6 * s) * 1.15
    for k in range(rays):
        a = k / rays * math.tau + rr.r(-0.25, 0.25); Lr = (15 if k % 2 == 0 else 10) * s
        F = np.maximum(F, seg_field(fr, x, y, x + math.cos(a) * Lr, y + math.sin(a) * Lr, 3.4 * s) * np.clip(1.05 - np.hypot(fr.xx - x, fr.yy - y) / (Lr + 2), 0.25, 1))
    fr.field(F, pal, cuts=(0.16, 0.36, 0.56, 0.76, 0.92))
    if glow: fr.glow(disc(fr, x, y, 16 * s), pal, 3, 0.85)

def debris(fr, t, x, y, n, seed, pal='impact', spread=(-2.8, -0.3), sp=(8, 20), grav=14, k=(3, 4)):
    rr = RNG(seed)
    for j in range(n):
        a = rr.r(*spread); v = rr.r(*sp)
        if 0 < t < 0.92:
            fr.px(x + math.cos(a) * v * outCubic(t), y + math.sin(a) * v * outCubic(t) + grav * t * t, pal, k[j % 2])

def arrow(fr, hx, hy, dx, dy, Ln=15, w=1.2, head=(2.2, 5), fl='holy'):
    d = math.hypot(dx, dy); dx, dy = dx / d, dy / d
    fr.field(seg_field(fr, hx - dx * Ln, hy - dy * Ln, hx, hy, w), 'wood', cuts=(0.25, 0.7), outline=True)
    fr.field(tri_field(fr, hx - dx * 2, hy - dy * 2, head[0], head[1], math.atan2(dy, dx))[0] * 1.1, 'steel', cuts=(0.2, 0.6, 0.9))
    for q in (Ln - 2, Ln):
        fr.px(hx - dx * q - dy, hy - dy * q + dx, fl, 4); fr.px(hx - dx * q + dy, hy - dy * q - dx, fl, 3)

def shield_mask(fr, cx, top, w, h):
    mid = top + h * 0.45; bot = top + h
    half = np.where(fr.yy <= mid, w / 2, (w / 2) * np.clip(1 - (fr.yy - mid) / max(bot - mid, 1), 0, 1) ** 0.7)
    return ((np.abs(fr.xx - cx) <= half) & (fr.yy >= top) & (fr.yy <= bot)).astype(np.float32)

def draw_shield(fr, cx, top, w, h, pal='def', boss=True, alpha=255):
    m = shield_mask(fr, cx, top, w, h)
    if m.sum() == 0: return
    F = lvl(m, L3) + lvl(m * (fr.xx < cx - 0.5) * (fr.yy < top + h * 0.55), L4 - L3) - lvl(m * (fr.xx > cx + w * 0.22), L3 - L2)
    rim = m * (1 - shield_mask(fr, cx, top + 1.5, w - 3, h - 3))
    F = np.where(rim > 0, L2, F)
    if boss: F = np.maximum(F, lvl(disc(fr, cx, top + h * 0.38, 2.2) > 0.01, L5))
    fr.field(F, pal, alpha=alpha)

def wagon(fr, cx, base, w=22, h=10, pal='wood', back=False):
    x0, x1 = cx - w / 2, cx + w / 2
    body = rect(fr, x0, base - h - 4, x1, base - 4)
    F = lvl(body, L3) + lvl(body * (fr.yy < base - h - 1), L4 - L3) - lvl(body * (fr.xx > x1 - 4), L3 - L2)
    plank = body * ((np.round(fr.xx - x0) % 6) == 0)
    F = np.where(plank > 0, L2, F)
    fr.field(F * (0.8 if back else 1.0) + (0.12 if back else 0), pal)
    for wx in (x0 + 4, x1 - 4):
        Wh = ring(fr, wx, base - 3, 3.0, 1.1); hub = disc(fr, wx, base - 3, 1.2)
        fr.field(np.maximum(Wh * 0.75, hub * 1.5), 'wood' if pal == 'wood' else pal, cuts=(0.3, 0.6, 0.9))

def spear(fr, x, base, hgt, lean=0.0, pal='steel'):
    tx = x + lean * hgt
    fr.field(seg_field(fr, x, base, tx, base - hgt, 0.9), 'wood', cuts=(0.3, 0.7), outline=True)
    fr.field(tri_field(fr, tx, base - hgt + 1, 2.0, 6, -math.pi / 2 + lean)[0] * 1.1, pal, cuts=(0.2, 0.6, 0.9))

def sword(fr, x, base, hgt, pal='steel'):
    fr.field(np.maximum(rect(fr, x - 1, base - hgt, x + 1, base - 5) * 0.8, rect(fr, x - 1, base - hgt, x - 1, base - 5) * 1.0) * (fr.yy > base - hgt + 1)
             + tri_field(fr, x, base - hgt + 2, 1.6, 3, -math.pi / 2)[0] * 0.9, pal, cuts=(0.2, 0.6, 0.9))
    fr.field(rect(fr, x - 3, base - 5, x + 3, base - 4) * 0.8, 'holy', cuts=(0.3, 0.6, 0.9))
    fr.field(rect(fr, x, base - 3, x, base) * 0.6, 'wood', cuts=(0.3, 0.6, 0.9))

def flat_ring(fr, cx, cy, r, w, pal, amt=1.05, sy=0.42, cuts=(0.3, 0.6, 0.85)):
    fr.field(ring(fr, cx, cy, r, w, 1.0, sy) * amt, pal, cuts=cuts)

FX = {}
def reg(key, fn, **kw): FX[key] = dict(kw, draw=fn, key=key)

# =================== STRIKE (앵커 = 대상 몸통) ===================
def s_focus(fr, i, n, R):
    t = i / (n - 1); cx, cy = 32, 36
    if i <= 4:   # 사방에서 한 점으로 모이는 기세선
        ph = seg(i, 0, 4)
        for k in range(8):
            a = k / 8 * math.tau + 0.2; r0 = 28 * (1 - ph) + 3; r1 = r0 + 9 * (1 - ph) + 2
            fr.field(seg_field(fr, cx + math.cos(a) * r0, cy + math.sin(a) * r0, cx + math.cos(a) * r1, cy + math.sin(a) * r1, 1.1) * 1.0, 'steel', cuts=(0.4, 0.75, 0.95), outline=False)
        fr.glow(disc(fr, cx, cy, 6 + 4 * ph), 'steel', 3, 0.5 + 0.5 * ph)
    if 4 <= i <= 7:
        s = [0.7, 1.15, 0.85, 0.45][i - 4]
        burst(fr, cx, cy, s, 'impact', rays=4, seed=2)
        star4(fr, cx, cy, int(12 * s), 'impact', 5, 4)
        fr.field(ring(fr, cx, cy, 6 + 14 * seg(i, 4, 7), 1.6) * (1 - seg(i, 4, 8)) * 1.05, 'impact', cuts=(0.3, 0.65), outline=False)
    if i >= 5: debris(fr, seg(i, 5, n - 1), cx, cy, 8, 7, 'impact', (-math.pi, math.pi), (10, 20), 6)
reg('strike.focus', s_focus, size=(64, 64), frames=10, fps=18, anchor=(32, 36), family='strike',
    note='일점 강타. 사방 8줄 기세선이 대상 한 점으로 모였다가 십자 섬광 + 원형 충격파로 터짐. 앵커=대상 몸통, 좌우 대칭')

def s_press(fr, i, n, R):
    t = i / (n - 1); hx, hy = 40, 38
    for k in range(3):   # 앞으로 밀려 나가는 > 모양 충격호 3겹
        st = seg(i, k, k + 4)
        if 0 < st < 1:
            x = 8 + (hx + 10 - 8) * outCubic(st); rr = 9 + 5 * st
            ang = np.arctan2(fr.yy - hy, fr.xx - (x - rr))
            F = ring(fr, x - rr, hy, rr, 2.6 * (1 - st) + 1.0, 1.0, 1.0) * (np.abs(ang) < 1.0)
            fr.field(F * (1.1 - 0.4 * st), 'steel', cuts=(0.3, 0.6, 0.85, 0.97))
    if i <= 3:   # 찌르는 칼끝 선
        tip = 14 + 26 * seg(i, 0, 2)
        fr.field(np.maximum(seg_field(fr, 2, hy, tip, hy, 2.2), tri_field(fr, tip - 1, hy, 3.5, 8, 0.0)[0]) * 1.1, 'steel', cuts=(0.2, 0.45, 0.7, 0.9))
    if 2 <= i <= 5:
        s = [0.8, 1.0, 0.7, 0.4][i - 2]
        F = np.maximum(tri_field(fr, hx - 4, hy, 10 * s, 18 * s, 0.0)[0], disc(fr, hx, hy, 6 * s) * 1.1)
        fr.field(F * 1.1, 'impact', cuts=(0.16, 0.36, 0.56, 0.76, 0.92)); fr.glow(disc(fr, hx + 4, hy, 16 * s), 'impact', 3, 0.85)
    if i >= 3: debris(fr, seg(i, 3, n - 1), hx + 2, hy, 8, 13, 'impact', (-1.0, 1.0), (10, 20), 8)
    if 0.2 < t < 0.85: puff(fr, seg(t, 0.2, 0.85), 14, 56, 1.0, 2)
reg('strike.press', s_press, size=(64, 64), frames=9, fps=18, anchor=(40, 38), dir='right', family='strike',
    note='강공(밀어붙이기). 왼쪽에서 곧게 뻗는 칼끝 + 앞으로 밀려 나가는 충격호 3겹 + 앞쪽 원뿔 섬광. 앵커=대상 몸통, 왼쪽을 향하면 flipX')

def s_quick(fr, i, n, R):
    cx, cy = 32, 36
    def cut(a, prog, w):
        dx, dy = math.cos(a), math.sin(a); L = 22
        x0, y0 = cx - dx * L, cy - dy * L; x1, y1 = cx - dx * L + dx * 2 * L * prog, cy - dy * L + dy * 2 * L * prog
        F = seg_field(fr, x0, y0, x1, y1, w) * np.clip(0.55 + 0.5 * (((fr.xx - x0) * dx + (fr.yy - y0) * dy) / (2 * L)), 0, 1.1)
        fr.field(F * 1.15, 'steel', cuts=(0.25, 0.5, 0.75, 0.92))
    A, Bn = -0.75, 0.75
    tab = {0: [(A, 0.6, 1.6)], 1: [(A, 1.0, 1.8)], 2: [(A, 1.0, 1.0), (Bn, 0.7, 1.6)], 3: [(A, 1.0, 0.7), (Bn, 1.0, 1.8)], 4: [(Bn, 1.0, 1.0)], 5: [(Bn, 1.0, 0.6)]}
    for a, p, w in tab.get(i, []): cut(a, p, w)
    if i in (1, 3): fr.glow(disc(fr, cx, cy, 18), 'steel', 3, 0.7)
    if 3 <= i <= 5:
        s = [1.0, 0.7, 0.4][i - 3]; star4(fr, cx, cy, int(8 * s), 'impact', 5, 4)
        fr.field(disc(fr, cx, cy, 4 * s) * 1.2, 'impact', cuts=(0.2, 0.5, 0.8, 0.95))
    if i >= 4: debris(fr, seg(i, 4, n - 1), cx, cy, 6, 21, 'steel', (-math.pi, math.pi), (8, 14), 6)
reg('strike.quick', s_quick, size=(64, 64), frames=8, fps=20, anchor=(32, 36), family='strike',
    note='일격(짧고 정확한 타격). 가는 칼선 두 줄이 순식간에 X 로 교차 + 작은 십자 섬광. 앵커=대상 몸통, 좌우 대칭')

def s_heavy(fr, i, n, R):
    t = i / (n - 1); cx, cy, gy = 32, 46, 72
    if i <= 3:   # 머리 위에서 수직으로 내려치는 굵은 칼선
        y1 = 4 + (gy - 4) * seg(i, 0, 2)
        w = [2.0, 4.2, 3.2, 1.6][i]
        F = seg_field(fr, cx, 2, cx, y1, w) * np.clip(0.6 + 0.5 * (fr.yy / gy), 0, 1.1)
        fr.field(F * 1.15, 'steel', cuts=(0.2, 0.42, 0.66, 0.88)); fr.glow(seg_field(fr, cx, 2, cx, y1, 9), 'steel', 3, 0.8)
    if 2 <= i <= 6:   # 땅 갈라짐 + 납작한 충격파
        st = seg(i, 2, 6)
        rr = RNG(44)
        for sgn in (-1, 1):
            x, y = cx, gy
            for k in range(4):
                nx, ny = x + sgn * rr.r(4, 7) * min(1, st * 2), y + rr.r(-1.5, 1.5)
                fr.field(seg_field(fr, x, y, nx, ny, 1.0) * (1 - seg(st, 0.7, 1)), 'dust', cuts=(0.3, 0.8), outline=False); x, y = nx, ny
        fr.field(ring(fr, cx, gy, 6 + 22 * outQuart(st), 1.8 * (1 - st) + 0.7, 1.0, 0.3) * (1 - st) * 1.1, 'impact', cuts=(0.3, 0.65, 0.9))
    if 2 <= i <= 5:
        s = [1.0, 0.9, 0.6, 0.35][i - 2]; burst(fr, cx, cy + 8, s, 'impact', rays=5, seed=4)
    for k, sgn in enumerate((-1, 1)):
        if t > 0.2: puff(fr, seg(t, 0.2, 1), cx + sgn * 12, gy, 1.1, 5 + k)
    if i >= 3: debris(fr, seg(i, 3, n - 1), cx, gy - 2, 10, 31, 'stone', (-2.9, -0.25), (8, 18), 18, (2, 3))
reg('strike.heavy', s_heavy, size=(64, 80), frames=11, fps=18, anchor=(32, 46), family='strike',
    note='강한 내려치기(정면 승부의 한 방). 머리 위에서 수직으로 떨어지는 굵은 칼선 → 발밑 땅 갈라짐·납작 충격파·흙먼지·돌 파편. 앵커=대상 몸통, 좌우 대칭')

def s_mighty(fr, i, n, R):
    t = i / (n - 1); cx, cy, gy = 40, 46, 70
    if i <= 1:
        fr.glow(disc(fr, cx, cy - 20, 10 + 8 * i), 'holy', 3, 0.9); star4(fr, cx, cy - 22 + 6 * i, 4 + 2 * i, 'holy')
    if 1 <= i <= 6:
        s = [0.8, 1.3, 1.2, 0.95, 0.6, 0.35][i - 1]
        burst(fr, cx, cy, s, 'holy', rays=8, seed=9)
        if i <= 3: fr.field(disc(fr, cx, cy, 5 * s) * 1.3, 'holy', cuts=(0.2, 0.4, 0.6, 0.8, 0.95))
    if 2 <= i <= 8:
        st = seg(i, 2, 8)
        fr.field(ring(fr, cx, gy, 8 + 30 * outQuart(st), 2.4 * (1 - st) + 0.8, 1.0, 0.32) * (1 - st) * 1.1, 'holy', cuts=(0.3, 0.6, 0.88))
        fr.field(ring(fr, cx, cy, 10 + 24 * outQuart(st), 1.4 * (1 - st) + 0.5) * (1 - st), 'impact', cuts=(0.35, 0.7), outline=False)
        rr = RNG(52)
        for k in range(6):
            a = math.pi + k / 5 * math.pi; x, y = cx, gy
            L = 6 + 14 * min(1, st * 1.6)
            fr.field(seg_field(fr, cx, gy, cx + math.cos(a) * L * 1.3, gy + math.sin(a) * L * 0.3 + rr.r(-1, 1), 1.0) * (1 - seg(st, 0.6, 1)), 'dust', cuts=(0.3, 0.8), outline=False)
    if t > 0.2:
        for k, dx in enumerate((-16, 16, 0)): puff(fr, seg(t, 0.2 + 0.05 * k, 1), cx + dx, gy, 1.2, 8 + k)
    if i >= 3: debris(fr, seg(i, 3, n - 1), cx, gy - 4, 12, 61, 'stone', (-3.0, -0.15), (10, 26), 20, (2, 3))
reg('strike.mighty', s_mighty, size=(80, 80), frames=12, fps=16, anchor=(40, 46), family='strike',
    note='영웅의 일격(신화적 장사의 한 방). 금빛 예고 섬광 → 8갈래 금빛 충격별 + 지면 충격고리·방사 균열·큰 돌 파편. 앵커=대상 몸통, 좌우 대칭')

def s_resolve(fr, i, n, R):
    t = i / (n - 1); hx, hy = 48, 38
    if i <= 4:   # 수평으로 길게 긋는 결단의 칼선(앞쪽이 밝음)
        x1 = 30 + 46 * seg(i, 0, 1.5); x0 = 6 + 50 * seg(i, 2, 5)
        prog = np.clip((fr.xx - x0) / max(x1 - x0, 1), 0, 1)
        F = seg_field(fr, x0, hy + 3, x1, hy - 3, 2.6 - 0.4 * i) * (0.55 + 0.55 * prog)
        fr.field(F * 1.15, 'steel', cuts=(0.2, 0.42, 0.66, 0.86, 1.0))
        fr.field(seg_field(fr, x0 + (x1 - x0) * 0.4, hy + 1.8, x1, hy - 3.4, 0.6) * 1.0, 'holy', cuts=(0.4, 0.8, 0.95), outline=False)
        fr.glow(seg_field(fr, x0, hy + 3, x1, hy - 3, 8), 'holy', 3, 0.7)
    if 2 <= i <= 5:
        s = [1.0, 0.85, 0.55, 0.3][i - 2]; burst(fr, hx, hy, s, 'impact', rays=6, seed=12); star4(fr, hx, hy, int(9 * s), 'holy')
    if t < 0.7: puff(fr, seg(t, 0, 0.7), 12, 58, 1.0, 3)   # 내딛는 발 먼지
    if i >= 3: debris(fr, seg(i, 3, n - 1), hx, hy, 8, 71, 'holy', (-1.2, 1.2), (10, 22), 10)
reg('strike.resolve', s_resolve, size=(80, 64), frames=9, fps=18, anchor=(48, 38), dir='right', family='strike',
    note='결단의 일격(주인공 검). 왼쪽에서 오른쪽으로 길게 그어지는 수평 칼선(금빛 날 선) + 내딛는 발 먼지 + 충격별. 앵커=대상 몸통, 왼쪽을 향하면 flipX')

def s_snipe(fr, i, n, R):
    t = i / (n - 1); hx, hy = 76, 36
    if i <= 4:   # 조준 고리가 좁혀짐(붉은 표적)
        st = seg(i, 0, 4); r = 16 - 9 * st
        fr.field(ring(fr, hx, hy, r, 1.0) * 1.05, 'atk', cuts=(0.3, 0.7, 0.92))
        for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
            fr.field(seg_field(fr, hx + math.cos(a) * (r + 1), hy + math.sin(a) * (r + 1), hx + math.cos(a) * (r + 5), hy + math.sin(a) * (r + 5), 0.8), 'atk', cuts=(0.3, 0.8), outline=False)
    if 3 <= i <= 5:   # 한 발이 빠르게 날아듦
        ph = seg(i, 3, 5); x = 10 + (hx - 10) * ph
        if ph < 1: arrow(fr, x, hy, 1, 0, 16)
        fr.field(seg_field(fr, max(0, x - 40), hy, x - 16, hy, 0.7) * 0.9, 'holy', cuts=(0.4, 0.8), outline=False)
    if 5 <= i <= 8:
        s = [1.0, 0.8, 0.5, 0.3][i - 5]; burst(fr, hx, hy, s * 0.9, 'impact', rays=6, seed=15)
        if i >= 6: arrow(fr, hx + 3, hy, 1, 0.05, 10)
        for a in (0.4, 2.0, 3.6, 5.2):   # 표적 고리 파편
            d = 7 + 12 * seg(i, 5, 8); fr.px(hx + math.cos(a) * d, hy + math.sin(a) * d, 'atk', 3)
    if 9 <= i < n - 1: arrow(fr, hx + 3, hy, 1, 0.05, 10)
reg('strike.snipe', s_snipe, size=(96, 64), frames=12, fps=18, anchor=(76, 36), dir='right', family='strike',
    note='장수 저격. 대상에 붉은 조준 고리가 좁혀진 뒤 왼쪽에서 화살 한 발이 직선으로 꽂힘 + 충격별·고리 파편, 꽂힌 화살 잠시 남음. 앵커=대상 몸통, 시전자 쪽(왼쪽)으로 64px 비행 구간, 왼쪽을 향하면 flipX')

def s_longbow(fr, i, n, R):
    t = i / (n - 1); hx, hy = 76, 36
    if i <= 3:
        x = 8 + (hx - 8) * seg(i, 0, 3)
        for k in range(2):   # 화살을 감싸는 바람 나선
            for j in range(4):
                cxr = x - 8 - j * 9 - k * 4
                if cxr > 2: fr.field(ring(fr, cxr, hy, 4.5 - j * 0.6, 0.9, 0.4, 1.0) * (1 - j * 0.2), 'steel', cuts=(0.35, 0.75), outline=False)
        arrow(fr, x, hy, 1, 0, 20, w=1.6, head=(3.2, 7))
        fr.glow(seg_field(fr, x - 30, hy, x, hy, 6), 'steel', 3, 0.7)
    if 3 <= i <= 7:
        s = [1.2, 1.15, 0.9, 0.6, 0.35][i - 3]; burst(fr, hx, hy, s, 'impact', rays=7, seed=17)
        st = seg(i, 3, 7); fr.field(ring(fr, hx, hy, 12 + 12 * outQuart(st), 2.0 * (1 - st) + 0.6, 0.6, 1.0) * (1 - st) * 1.1, 'steel', cuts=(0.3, 0.65, 0.9))
    if i >= 4: debris(fr, seg(i, 4, n - 1), hx, hy, 10, 81, 'impact', (-1.3, 1.3), (12, 24), 10)
    if 5 <= i < n - 1: arrow(fr, hx + 6, hy, 1, 0, 14, w=1.6, head=(3.2, 7))
reg('strike.longbow', s_longbow, size=(96, 64), frames=11, fps=18, anchor=(76, 36), dir='right', family='strike',
    note='강궁 일격. 굵은 화살이 바람 나선을 두르고 날아와 관통하듯 꽂힘 + 큰 충격별·세로 충격고리·파편. 앵커=대상 몸통, 왼쪽을 향하면 flipX')

def s_volley(fr, i, n, R):
    hx, hy = 76, 36; shots = [(0, -5), (3, 3), (6, -1)]
    for k, (d, dy) in enumerate(shots):
        j = i - d
        if 0 <= j <= 1:
            x = 20 + (hx - 20) * (j + 1) / 2
            arrow(fr, x, hy + dy, 1, 0, 13)
            fr.field(seg_field(fr, max(0, x - 30), hy + dy, x - 13, hy + dy, 0.6) * 0.9, 'holy', cuts=(0.4, 0.8), outline=False)
        if 2 <= j <= 4:
            s = [0.85, 0.6, 0.35][j - 2]; burst(fr, hx - 2, hy + dy, s, 'impact', rays=5, seed=19 + k)
        if 3 <= j and i < n - 1: arrow(fr, hx + 1, hy + dy, 1, 0.08 * (k - 1), 9)
reg('strike.volley', s_volley, size=(96, 64), frames=12, fps=20, anchor=(76, 36), dir='right', family='strike',
    note='연속 사격. 화살 3발이 3프레임 간격으로 연달아 꽂힘(각각 작은 충격별) → 꽂힌 화살 3개 잠시 남음. 앵커=대상 몸통, 왼쪽을 향하면 flipX')

def s_trample(fr, i, n, R):
    t = i / (n - 1); cx, cy, gy = 48, 50, 72
    for k, (fx, d) in enumerate(((38, 0), (58, 3))):   # 큰 발이 차례로 짓밟음
        j = i - d
        if 0 <= j <= 6:
            down = seg(j, 0, 1.5); out = seg(j, 3, 6)
            if j <= 1:  # 내려오는 그림자
                fr.field(disc(fr, fx, gy, 8 + 4 * down, 1.0, 0.4) * 0.6, 'shade', cuts=(0.2, 0.5), outline=False, alpha=150)
            F = disc(fr, fx, gy, 10, 1.0, 0.42) * (1 - out)
            if j >= 1:
                fr.field(F * 1.05, 'dust', cuts=(0.2, 0.45, 0.7), alpha=230)
                for tx in (-6, 0, 6): fr.field(disc(fr, fx + tx, gy - 3, 2.2, 1.0, 0.8) * (1 - out) * 1.2, 'dust', cuts=(0.3, 0.7))
            if 1 <= j <= 5:
                st = seg(j, 1, 5)
                fr.field(ring(fr, fx, gy, 10 + 26 * outQuart(st), 1.8 * (1 - st) + 0.7, 1.0, 0.32) * (1 - st) * 1.1, 'impact', cuts=(0.3, 0.65, 0.9))
                if j == 1: burst(fr, fx, gy - 8, 0.9, 'impact', rays=6, seed=23 + k)
    for k, dx in enumerate((-30, -14, 14, 30)):
        if t > 0.12: puff(fr, seg(t, 0.12 + 0.06 * k, 1), cx + dx, gy, 1.3, 30 + k, rise=10)
    if i >= 2: debris(fr, seg(i, 2, n - 1), cx, gy - 4, 14, 91, 'stone', (-3.0, -0.15), (12, 30), 22, (2, 3))
reg('strike.trample', s_trample, size=(96, 80), frames=12, fps=16, anchor=(48, 50), family='strike',
    note='코끼리 부대 짓밟기. 큰 발 그림자 → 발바닥 자국 2번 쿵·쿵 + 납작 지진 고리 2겹 + 넓은 흙먼지·돌 파편. 앵커=대상 몸통, 좌우 대칭')

def s_breach(fr, i, n, R):
    t = i / (n - 1); hx, hy = 40, 44
    if i <= 1:   # 성벽면(돌 블록) 위에 충격 직전
        for bx, by in ((-12, -10), (0, -10), (12, -10), (-6, 0), (6, 0), (-12, 10), (0, 10), (12, 10)):
            m = rect(fr, hx + bx - 5, hy + by - 4, hx + bx + 5, hy + by + 4)
            fr.field(lvl(m, L3) + lvl(m * (fr.yy < hy + by - 2), L4 - L3), 'stone', alpha=200 if i == 0 else 230)
    if 1 <= i <= 5:
        s = [0.9, 1.25, 1.0, 0.7, 0.4][i - 1]; burst(fr, hx, hy, s, 'impact', rays=7, seed=27)
        rr = RNG(28)
        for k in range(6):   # 방사 균열
            a = k / 6 * math.tau + 0.3; L = 10 + 12 * seg(i, 1, 3)
            fr.field(seg_field(fr, hx, hy, hx + math.cos(a) * L, hy + math.sin(a) * L, 1.0) * (1 - seg(i, 3, 6)), 'stone', cuts=(0.3, 0.8), outline=False)
    if i >= 2:   # 돌 블록·나무 조각이 날아감
        ph = seg(i, 2, n - 1); rr = RNG(33)
        for k in range(9):
            a = rr.r(-math.pi, math.pi); v = rr.r(14, 30)
            x = hx + math.cos(a) * v * outCubic(ph); y = hy + math.sin(a) * v * outCubic(ph) + 16 * ph * ph
            if ph < 0.9:
                g = ['ooo', 'o4o', 'o2o'] if k % 3 else ['oo', 'o3']
                glyph(fr, int(x) - 1, int(y) - 1, g, 'stone' if k % 3 else 'wood')
    if t > 0.25:
        for k, dx in enumerate((-10, 8)): puff(fr, seg(t, 0.25 + 0.1 * k, 1), hx + dx, hy + 22, 1.2, 40 + k, 'stone', rise=10)
reg('strike.breach', s_breach, size=(80, 80), frames=12, fps=16, anchor=(40, 44), family='strike',
    note='도성 돌파(성문·성벽을 부딪쳐 깸). 돌 블록 면이 비쳤다가 큰 충격별 + 방사 균열 → 돌 블록·나무 조각이 사방으로 튀고 돌먼지. 앵커=대상 몸통, 좌우 대칭')

# =================== AOE (160x160, 앵커 = 중심 칸 (80,92)) ===================
CELLS = [(80, 92), (40, 64), (120, 64), (40, 120), (120, 120), (80, 64), (80, 120), (40, 92), (120, 92)]
def ground_ring(fr, t, pal, a=0, b=0.5, amt=1.1):
    st = seg(t, a, b)
    if 0 < st < 1 and t > a: fr.field(ring(fr, 80, 92, 10 + 60 * outQuart(st), 2.6 * (1 - st) + 0.8, 1.0, 0.6) * (1 - st) * amt, pal, cuts=(0.3, 0.6, 0.85))

def a_focus(fr, i, n, R):
    t = i / (n - 1); cx, cy = 80, 92; rr = RNG(101)
    for k in range(12):   # 사방 화망이 한 점으로 수렴
        a = rr.r(-math.pi, math.pi); d0 = rr.r(0, 0.15); ph = (t - d0) / 0.18
        if 0 <= ph < 1:
            r = 78 * (1 - ph); x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.75
            fr.field(seg_field(fr, x, y, x + math.cos(a) * 14, y + math.sin(a) * 10, 1.1) * 1.0, 'fire', cuts=(0.35, 0.7, 0.92), outline=True)
    lt = seg(t, 0.25, 0.85)
    if 0 < lt < 1: fire_blob(fr, lt, cx, cy, 1.25, 3, R, smoke=True)
    ground_ring(fr, t, 'fire', 0.3, 0.7)
    for k, (x, y) in enumerate(CELLS[1:5]):
        lt = seg(t, 0.38 + 0.03 * k, 0.75)
        if 0 < lt < 1:
            if lt < 0.4: burst(fr, x, y, 0.55 * (1 - lt), 'impact', rays=5, seed=110 + k, glow=False)
            puff(fr, lt, x, y + 4, 0.9, 120 + k)
reg('aoe.focus_fire', a_focus, size=(160, 160), frames=16, fps=16, anchor=(80, 92), family='aoe',
    note='집중 포화. 화망 12줄이 사방에서 중심 칸 한 점으로 수렴 → 중심 큰 폭염 + 지면 고리 → 대각 4칸에 튀어 번지는 작은 착탄. 앵커=중심 칸, 좌우 대칭')

def a_gunvolley(fr, i, n, R):
    t = i / (n - 1); rr = RNG(131)
    hits = [(x + rr.r(-8, 8), y + rr.r(-6, 6)) for (x, y) in CELLS] + [(x + rr.r(-10, 10), y + rr.r(-8, 8)) for (x, y) in CELLS]
    for k, (x, y) in enumerate(hits):   # 같은 순간 한꺼번에(지연 0~1프레임)
        d = (k % 2) * 0.05; lt = seg(t, d, d + 0.5)
        if 0 <= lt < 0.3:
            fr.glow(disc(fr, x, y, 9), 'fire', 3, 0.8)
            fr.field(disc(fr, x, y, 4.5 * (1 - lt * 2)) * 1.2, 'fire', cuts=(0.2, 0.45, 0.7, 0.9)); fr.px(x - 3, y - 2, 'fire', 4); fr.px(x + 3, y - 1, 'fire', 4)
        if 0 < lt < 1: puff(fr, lt, x, y, 0.75, 140 + k, 'gsmoke', alpha=170, rise=10)
    if t > 0.25:   # 흰 화약 연기 띠가 흘러감
        st = seg(t, 0.25, 1)
        S = disc(fr, 80 + 10 * st, 70 - 8 * st, 58, 1.0, 0.35) * (0.9 - st)
        S = S + (fbm(fr.xx / 9 + st * 2, fr.yy / 7, 77) - 0.5) * 0.7 * (S > 0)
        fr.field(S, 'gsmoke', cuts=(0.25, 0.45, 0.7), outline=False, alpha=130, dither_below=0.4)
reg('aoe.gun_volley', a_gunvolley, size=(160, 160), frames=14, fps=14, anchor=(80, 92), family='aoe',
    note='화승총 일제 사격. 3x3 칸 18지점에 같은 순간 총탄 착탄 섬광 → 흰 화약 연기가 피어 옆으로 흘러감(포탄 폭발 aoe.shot 과 구별). 앵커=중심 칸, 좌우 대칭')

def a_suppress(fr, i, n, R):
    t = i / (n - 1); rr = RNG(151)
    for k in range(30):   # 길게 이어지는 촘촘한 흙 튐(제압)
        x = 80 + rr.r(-62, 62); y = 92 + rr.r(-34, 34); d0 = rr.r(0, 0.7); lt = (t - d0) / 0.25
        if 0 < lt < 1:
            h = 9 * math.sin(lt * math.pi)
            fr.field(seg_field(fr, x, y, x + rr.r(-2, 2), y - h, 1.4) * (1 - lt * 0.5), 'dust', cuts=(0.3, 0.6, 0.85), outline=True)
            if lt < 0.25: fr.px(x, y - 1, 'impact', 5); fr.px(x - 1, y, 'impact', 4)
            if lt > 0.3: fr.field(disc(fr, x, y, 3 + 3 * lt, 1.6, 0.6) * (1 - lt) * 1.2, 'dust', cuts=(0.3, 0.6), outline=False, alpha=180)
    if 0.15 < t < 0.85:   # 내리누르는 화살표(고개를 못 듦)
        y = int(40 + 18 * seg(t, 0.15, 0.85))
        for x in (50, 80, 110): glyph(fr, x - 3, y + (6 if x == 80 else 0), CHEV_DN, 'atk'); glyph(fr, x - 3, y + 6 + (6 if x == 80 else 0), CHEV_DN, 'atk')
    ground_ring(fr, t, 'dust', 0, 0.45, 0.9)
reg('aoe.suppress', a_suppress, size=(160, 160), frames=16, fps=16, anchor=(80, 92), family='aoe',
    note='제압 사격. 3x3 칸 전체에 30발이 길게 이어지며 흙이 튐 + 위에서 내리누르는 붉은 아래 화살표 3줄. 앵커=중심 칸, 좌우 대칭')

def a_gunpowder(fr, i, n, R):
    t = i / (n - 1); cx, cy = 80, 92
    if i <= 2:   # 위에서 떨어지는 큰 포탄
        y = 10 + (cy - 10) * i / 2.5
        glyph(fr, cx - 2, int(y) - 2, ['.oo.', 'o12o', 'o11o', '.oo.'], 'smoke'); fr.px(cx, y - 6, 'smoke', 3); fr.px(cx + 1, y - 10, 'smoke', 2)
    lt = seg(t, 0.15, 0.8)
    if 0 < lt < 1: fire_blob(fr, lt, cx, cy, 1.45, 41, R, smoke=True)
    ground_ring(fr, t, 'fire', 0.15, 0.55, 1.15)
    for k, (x, y) in enumerate(CELLS[1:]):   # 둘레 총탄 착탄
        lt = seg(t, 0.25 + 0.04 * k, 0.75 + 0.02 * k)
        if 0 < lt < 0.25: fr.field(disc(fr, x, y, 3) * 1.2, 'fire', cuts=(0.2, 0.5, 0.8, 0.95))
        if 0 < lt < 1: puff(fr, lt, x, y, 0.85, 160 + k, 'gsmoke', alpha=170, rise=8)
    if i >= 3: debris(fr, seg(i, 3, n - 1), cx, cy, 14, 171, 'dust', (-3.0, -0.15), (16, 40), 30, (1, 2))
reg('aoe.gunpowder', a_gunpowder, size=(160, 160), frames=16, fps=16, anchor=(80, 92), family='aoe',
    note='화포+총 일제 사격. 큰 포탄 1발이 중심에 떨어져 큰 폭염·지면 고리, 이어 둘레 8칸에 총탄 섬광과 흰 화약 연기. 앵커=중심 칸, 좌우 대칭')

def a_wildfire(fr, i, n, R):
    t = i / (n - 1)
    rr = RNG(181)
    for k in range(5):   # 바람 줄기(왼쪽 위에서)
        y = 50 + k * 20 + rr.r(-4, 4); ph = seg(t, 0.02 * k, 0.4 + 0.02 * k)
        if 0 < ph < 1:
            x = -20 + 200 * ph
            fr.field(seg_field(fr, x - 26, y, x, y - 3, 0.8) * (1 - ph * 0.5), 'gsmoke', cuts=(0.4, 0.8), outline=False, alpha=170)
    front = -20 + 200 * seg(t, 0.1, 0.7)   # 불길 띠가 왼쪽에서 오른쪽으로 쓸고 감
    pts = [(x, y) for y in (60, 76, 92, 108, 124) for x in (24, 52, 80, 108, 136)]
    for k, (x, y) in enumerate(sorted(pts, key=lambda p: p[1])):
        x2 = x + (y - 92) * 0.3
        d = (x2 + 20) / 200
        lt = (t - 0.1 - d * 0.6) / 0.42
        if 0 < lt < 1: fire_blob(fr, lt, x2, y, 0.62 if (k % 3) else 0.78, 190 + k, R, smoke=(k % 4 == 0))
reg('aoe.wildfire', a_wildfire, size=(160, 160), frames=16, fps=16, anchor=(80, 92), family='aoe',
    note='화공(바람 탄 불길). 왼쪽에서 바람 줄기가 먼저 지나고 불길 띠가 3x3 칸을 왼쪽→오른쪽으로 한 줄씩 삼킴(25지점). 바람 방향 연출이라 flip 불필요. 앵커=중심 칸')

def a_screen(fr, i, n, R):
    t = i / (n - 1); cx, cy = 80, 92
    sh = seg(t, 0, 0.2) * (1 - seg(t, 0.55, 0.8))   # 하늘을 덮는 화살 그림자
    if sh > 0:
        S = disc(fr, cx, cy, 74, 1.0, 0.55) * sh * 0.8
        fr.field(S, 'shade', cuts=(0.2, 0.45), outline=False, alpha=110, dither_below=0.4)
    rr = RNG(201)
    for k in range(34):   # 거의 수직으로 쏟아지는 촘촘한 화살
        d0 = rr.r(0.08, 0.5); tx = cx + rr.r(-64, 64); ty = cy + rr.r(-34, 34); fall = 0.14; ph = (t - d0) / fall
        if 0 <= ph < 1: arrow(fr, tx + 4 * (1 - ph), ty - 60 * (1 - ph), 0.08, 1.0, 11, w=1.0, head=(1.8, 4))
        elif ph >= 1 and (t - d0 - fall) < 0.34 and t < 0.93:
            fr.field(seg_field(fr, tx - 0.5, ty - 7, tx, ty, 1.0), 'wood', cuts=(0.25, 0.7), outline=True); fr.px(tx, ty - 7, 'holy', 4)
            if (t - d0 - fall) < 0.08: fr.field(disc(fr, tx, ty + 1, 4, 1.6, 0.6) * 1.1, 'dust', cuts=(0.2, 0.6), outline=False, alpha=200)
reg('aoe.arrow_screen', a_screen, size=(160, 160), frames=16, fps=16, anchor=(80, 92), family='aoe',
    note='화살 장막. 3x3 칸 위로 어두운 그림자가 덮이고 화살 34발이 거의 수직으로 촘촘히 쏟아져 꽂힘(비스듬한 aoe.base 화살비와 구별). 앵커=중심 칸, 좌우 대칭')

def a_arc(fr, i, n, R):
    t = i / (n - 1)
    tg = [(80, 92, 0.0), (44, 66, 0.06), (118, 68, 0.1), (48, 120, 0.16), (114, 118, 0.2), (80, 62, 0.26), (80, 124, 0.3)]
    for k, (x, y, d) in enumerate(tg):   # 멀리서 높이 쏘아 올린 포물선 궤적(금빛 꼬리)
        ph = (t - d) / 0.28
        if 0 <= ph < 1:
            pts = []
            for q in range(6):
                u = max(0, ph - q * 0.06); pts.append((x - 26 * (1 - u), y - 90 * (1 - u) ** 2 - 10 * (1 - u)))
            for a, b in zip(pts[:-1], pts[1:]):
                fr.field(seg_field(fr, *a, *b, 0.9) * (0.95 - 0.1 * pts.index(a)), 'holy', cuts=(0.35, 0.7, 0.9), outline=False)
            (hx, hy), (px_, py_) = pts[0], pts[1]
            arrow(fr, hx, hy, hx - px_ + 1e-3, hy - py_ + 1e-3, 13)
        elif ph >= 1 and t < 0.93:
            age = (t - d - 0.28)
            if age < 0.4: fr.field(seg_field(fr, x - 4, y - 8, x, y, 1.1), 'wood', cuts=(0.25, 0.7), outline=True); fr.px(x - 4, y - 8, 'holy', 4)
            if age < 0.12: star4(fr, x, y - 2, 4, 'holy'); fr.field(disc(fr, x, y + 1, 7, 1.6, 0.6) * 1.1, 'dust', cuts=(0.2, 0.5, 0.8), outline=False, alpha=210)
    ground_ring(fr, t, 'holy', 0.3, 0.75, 1.0)
reg('aoe.arrow_arc', a_arc, size=(160, 160), frames=16, fps=16, anchor=(80, 92), family='aoe',
    note='먼 곳의 일제 사격(주인공 궁). 화살 7발이 금빛 꼬리를 그리며 높은 포물선으로 떨어져 칸마다 금빛 반짝 착탄 + 지면 금빛 고리. 앵커=중심 칸')

# =================== BUFF 공격(앵커 = 발밑) ===================
DRUM = ['.ooooo.', 'o55555o', 'o34443o', 'o3o3o3o', 'o23332o', '.ooooo.']
def b_drum(fr, i, n, R):
    t = i / (n - 1); gx, gy = 48, 82
    for k in range(3):   # 북소리 박자 3번: 발밑 고리 맥동
        st = seg(t, k * 0.22, k * 0.22 + 0.4)
        if 0 < st < 1: flat_ring(fr, gx, gy, 6 + 38 * outQuart(st), 2.2 * (1 - st) + 0.7, 'atk', 1.1 * (1 - st * 0.6))
    beat = any(abs(t - k * 0.22) < 0.05 for k in range(3))
    if t < 0.85:
        y = 10 - (2 if beat else 0)
        body = rect(fr, gx - 7, y, gx + 7, y + 7)
        lace = body * (np.abs(((fr.xx - gx + 7) % 6) - np.abs(fr.yy - y - 3.5) * 0.85) < 0.6)
        fr.field(np.where(lace > 0, L4 + 0.05, lvl(body, L2 + 0.05) + lvl(body * (fr.xx < gx - 2), L3 - L2)), 'atk')
        fr.field(lvl(disc(fr, gx, y, 7.5, 1.0, 0.3) > 0.01, L4), 'dust')
        fr.field(lvl(rect(fr, gx - 7, y + 7, gx + 7, y + 8), L2), 'wood', outline=False)
        if beat:
            for a in (-2.6, -1.57, -0.5): fr.field(seg_field(fr, gx + math.cos(a) * 10, y + math.sin(a) * 7, gx + math.cos(a) * 15, y + math.sin(a) * 11, 1.0), 'atk', cuts=(0.4, 0.8))
    if 0.2 < t < 0.85:
        y = int(56 - 14 * seg(t, 0.2, 0.85)); glyph(fr, gx - 22, y, CHEV_UP, 'atk'); glyph(fr, gx + 16, y + 3, CHEV_UP, 'atk')
    fr.glow(disc(fr, gx, gy, 30, 1.0, 0.45), 'atk', 2, 0.6 * (1 - seg(t, 0.6, 1)))
reg('buff.drum', b_drum, size=(96, 96), frames=14, fps=12, anchor=(48, 82), family='buff',
    note='사기 고취(북소리). 프레임 높이 96. 머리 위 북이 3번 울릴 때마다 발밑 붉은 고리가 맥동 + 좌우 위 화살표. 앵커=발밑')

def b_cheer(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 66
    if 0.05 < t < 0.6:   # 어깨 쪽 짧은 외침(작은 별꼴)
        st = seg(t, 0.05, 0.6); x, y = gx + 14, 22
        for a in (-2.4, -1.6, -0.8, 0.0):
            fr.field(seg_field(fr, x + math.cos(a) * 3, y + math.sin(a) * 3, x + math.cos(a) * (6 + 3 * st), y + math.sin(a) * (6 + 3 * st), 1.0) * (1 - st * 0.5), 'atk', cuts=(0.35, 0.75, 0.95))
    rr = RNG(211)
    for k in range(7):   # 따뜻한 작은 불티
        d0 = rr.r(0, 0.5); ph = (t - d0) / 0.4; x = gx + rr.r(-12, 12)
        if 0 < ph < 1: fr.px(x + math.sin(ph * 5 + k), gy - 14 - 30 * outCubic(ph), 'atk', 4 if ph < 0.5 else 3)
    if 0.15 < t < 0.85:   # 가슴에서 오르는 큰 화살표 하나
        y = int(40 - 18 * seg(t, 0.15, 0.85))
        glyph(fr, gx - 3, y, CHEV_UP, 'atk'); glyph(fr, gx - 3, y + 5, CHEV_UP, 'atk')
    if t < 0.7: flat_ring(fr, gx, gy, 8 + 8 * outQuart(seg(t, 0, 0.3)), 1.1, 'atk', 1.0 * (1 - seg(t, 0.4, 0.7)))
reg('buff.cheer', b_cheer, size=(64, 80), frames=12, fps=12, anchor=(32, 66), family='buff',
    note='독려(어깨를 두드리는 한마디). 어깨 옆 작은 외침 표식 + 따뜻한 불티 + 가슴에서 오르는 화살표 1개, 작은 발밑 고리. 일부러 소박하게. 앵커=발밑')

def b_pursuit(fr, i, n, R):
    t = i / (n - 1); gx, gy = 48, 66; hx, hy = 48, 14
    for k in range(2):   # 머리에서 퍼지는 외침호(앞뒤로)
        st = seg(t, k * 0.15, k * 0.15 + 0.5)
        if 0 < st < 1:
            r = 6 + 30 * outCubic(st); ang = np.arctan2(fr.yy - hy, fr.xx - hx)
            side = (np.abs(ang) < 0.7) | (np.abs(np.abs(ang) - math.pi) < 0.7)
            fr.field(ring(fr, hx, hy, r, 1.8 * (1 - st) + 0.7, 1.0, 0.8) * side * (1.05 - 0.3 * st), 'atk', cuts=(0.3, 0.6, 0.85))
    rr = RNG(221)
    for k in range(6):   # 몸 둘레를 앞으로 스치는 추격 속도선
        y = gy - rr.r(6, 44); d0 = rr.r(0.1, 0.5); ph = (t - d0) / 0.3
        if 0 < ph < 1:
            x = 6 + 84 * ph; fr.field(seg_field(fr, x - 16, y, x, y, 0.9) * 1.0, 'atk', cuts=(0.4, 0.8, 0.95), outline=False)
    if 0.25 < t < 0.85:
        y = int(44 - 14 * seg(t, 0.25, 0.85)); glyph(fr, gx - 22, y, CHEV_UP, 'atk'); glyph(fr, gx + 16, y + 3, CHEV_UP, 'atk')
    if t < 0.55: puff(fr, seg(t, 0, 0.55), gx - 10, gy, 1.0, 4)
reg('buff.pursuit', b_pursuit, size=(96, 80), frames=12, fps=14, anchor=(48, 66), family='buff',
    note='추격 호령. 머리에서 좌우로 퍼지는 외침호 2겹 + 몸 둘레를 스치는 붉은 추격 속도선 + 위 화살표. 앵커=발밑(외침호 중심은 머리 높이 -52px)')

def b_banner(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 82
    up = outQuart(seg(t, 0, 0.35)); out = seg(t, 0.72, 1)
    keep = bt(fr) >= out * 1.05
    px0 = gx + 10; top = gy - 80 * up + 4
    if up > 0.05:   # 깃대 + 펄럭이는 큰 군기(붉은 바탕 금빛 테)
        pole = seg_field(fr, px0, gy - 6, px0, top, 0.9) * keep
        fr.field(pole, 'wood', cuts=(0.3, 0.7), outline=True)
        fr.field(tri_field(fr, px0, top + 1, 1.8, 5, -math.pi / 2)[0] * keep * 1.1, 'holy', cuts=(0.2, 0.6, 0.9))
        wv = np.sin((fr.xx - px0) / 4 - t * 12) * 1.6
        clothw = 22 * seg(t, 0.12, 0.45)
        m = (fr.xx < px0) & (fr.xx > px0 - clothw) & (fr.yy > top + 4 + wv) & (fr.yy < top + 22 + wv - (px0 - fr.xx) * 0.25)
        m = m.astype(np.float32) * keep
        inner = (fr.xx < px0 - 1) & (fr.xx > px0 - clothw + 1) & (fr.yy > top + 6 + wv) & (fr.yy < top + 20 + wv - (px0 - fr.xx) * 0.25)
        F = lvl(m * inner, L2) + lvl(m * inner * (np.sin((fr.xx - px0) / 4 - t * 12) > 0.3), L3 - L2)
        fr.field(lvl(m, L3) * (1 - inner), 'holy'); fr.field(F, 'atk', outline=False)
    flat_ring(fr, gx, gy, 10 + 22 * up, 1.5, 'holy', 1.05 * (1 - out))
    rr = RNG(231)
    for k in range(8):
        d0 = rr.r(0.1, 0.55); ph = (t - d0) / 0.4
        if 0 < ph < 1: star4(fr, gx + rr.r(-16, 16), gy - 6 - 40 * outCubic(ph), 1 if ph > 0.5 else 2, 'holy')
    fr.glow(disc(fr, gx, gy, 26, 1.0, 0.45) * (1 - out), 'holy', 3, 0.5)
reg('buff.banner', b_banner, size=(64, 96), frames=14, fps=12, anchor=(32, 82), family='buff',
    note='총사령의 호령. 시전자 뒤로 깃대가 솟고 금빛 테 두른 붉은 군기가 펄럭이며 펼쳐짐 + 발밑 금빛 고리·빛 알갱이. 프레임 높이 96(머리 위 30px). 앵커=발밑')

def b_oath(fr, i, n, R):
    t = i / (n - 1); gx, gy = 48, 66
    up = outQuart(seg(t, 0, 0.4)); out = seg(t, 0.7, 1)
    rg = 30 - 10 * seg(t, 0.3, 0.6)
    pts = [(math.cos(a) * rg, math.sin(a) * rg * 0.4) for a in [k / 6 * math.tau + 0.3 for k in range(6)]]
    for dx, dy in sorted(pts, key=lambda p: p[1]):   # 여러 칼날이 둘러서 함께 세워짐
        h = 18 * up * (1 - out)
        if h > 4: sword(fr, gx + dx, gy + dy - 2 * up, h, 'steel')
    if 0.45 < t < 0.65: star4(fr, gx, gy - 46, 5, 'holy'); fr.glow(disc(fr, gx, gy - 30, 24), 'atk', 3, 0.8)
    flat_ring(fr, gx, gy, rg + 2, 1.4, 'atk', 1.05 * (1 - out))
    if 0.5 < t < 0.9:
        y = int(36 - 12 * seg(t, 0.5, 0.9)); glyph(fr, gx - 3, y, CHEV_UP, 'atk'); glyph(fr, gx - 3, y + 5, CHEV_UP, 'atk')
reg('buff.oath', b_oath, size=(96, 80), frames=14, fps=12, anchor=(48, 66), family='buff',
    note='연합의 결의. 발밑 둘레에 칼 6자루가 날을 위로 세우며 솟아 안쪽으로 모임 → 머리 위 금빛 섬광 + 위 화살표. 앵커=발밑')

def b_rekindle(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 66
    if t < 0.75:   # 발밑에서 다시 일어나는 불씨
        for k, dx in enumerate((-10, 0, 10)):
            lt = seg(t, 0.05 * k, 0.75)
            if 0 < lt < 1: fire_blob(fr, lt, gx + dx * 1.2, gy, 0.26, 240 + k, R, smoke=False)
    rr = RNG(241)
    for k in range(12):   # 나선을 그리며 오르는 불티
        d0 = rr.r(0, 0.5); ph = (t - d0) / 0.45
        if 0 < ph < 1:
            a = ph * 7 + k; y = gy - 6 - 50 * outCubic(ph)
            fr.px(gx + math.cos(a) * (12 - 6 * ph), y, 'fire', 4 if ph < 0.5 else 3); fr.px(gx + math.cos(a) * (12 - 6 * ph), y + 1, 'fire', 2)
    if 0.3 < t < 0.88:
        y = int(36 - 16 * seg(t, 0.3, 0.88)); glyph(fr, gx - 19, y, CHEV_UP, 'atk'); glyph(fr, gx + 13, y + 3, CHEV_UP, 'atk')
    fr.glow(disc(fr, gx, gy - 16, 24, 1.0, 1.2), 'fire', 3, 0.55 * (1 - seg(t, 0.5, 1)))
reg('buff.rekindle', b_rekindle, size=(64, 80), frames=14, fps=12, anchor=(32, 66), family='buff',
    note='재기의 호령. 발밑 작은 불씨 3개가 되살아나고 불티가 나선으로 올라감 + 위 화살표. 앵커=발밑')

# =================== BUFF 방어(앵커 = 발밑) ===================
def b_shieldwall(fr, i, n, R):
    t = i / (n - 1); gx, gy = 48, 66
    out = seg(t, 0.72, 1); keep = bt(fr) >= out * 1.05
    for k, dx in enumerate((-28, -14, 0, 14, 28)):   # 방패 5개가 어깨를 맞대며 차례로 솟음
        up = outQuart(seg(t, 0.04 * abs(k - 2), 0.3 + 0.04 * abs(k - 2)))
        if up <= 0.05: continue
        h = 22 * up; top = gy + 2 - h
        m = shield_mask(fr, gx + dx, top, 13, h)
        F = lvl(m, L3) + lvl(m * (fr.xx < gx + dx), L4 - L3)
        F = np.where(m * (1 - shield_mask(fr, gx + dx, top + 1.5, 10, h - 3)) > 0, L2, F)
        F = np.maximum(F, lvl(disc(fr, gx + dx, top + h * 0.38, 1.8) > 0.01, L5))
        fr.field(F * keep, 'def', alpha=235)
    if 0.3 < t < 0.6:   # 맞댄 방패 위를 훑는 빛
        x = 14 + 68 * seg(t, 0.3, 0.6); fr.field(rect(fr, x - 1, gy - 22, x + 1, gy - 2) * shield_mask(fr, x, gy - 20, 80, 22) * 1.0, 'def', cuts=(0.5, 0.9), outline=False)
    fr.glow(disc(fr, gx, gy - 10, 40, 1.0, 0.5), 'def', 2, 0.55 * (1 - out))
reg('buff.shieldwall', b_shieldwall, size=(96, 80), frames=12, fps=12, anchor=(48, 66), family='buff',
    note='방진 구축(방패벽). 발 앞줄에 방패 5개가 가운데부터 차례로 솟아 어깨를 맞댄 한 장의 벽이 되고 빛이 훑고 지나감. 앵커=발밑(방패는 유닛 하반신을 가림)')

def b_palisade(fr, i, n, R):
    t = i / (n - 1); gx, gy = 48, 66
    out = seg(t, 0.72, 1); keep = bt(fr) >= out * 1.05
    up = outQuart(seg(t, 0.05, 0.4))
    M = disc(fr, gx, gy - 4, 38 * (0.5 + 0.5 * up), 1.0, 0.26) * (fr.yy < gy - 2)   # 뒤쪽 흙둔덕
    fr.field((M + (fbm(fr.xx / 4, fr.yy / 3, 251) - 0.5) * 0.3 * (M > 0)) * keep * 1.2, 'dust', cuts=(0.2, 0.45, 0.7, 0.9), alpha=230)
    for k in range(9):   # 목책 말뚝 반원
        a = math.pi + k / 8 * math.pi; x = gx + math.cos(a) * 34; y = gy - 2 + math.sin(a) * 10
        h = (14 + 3 * (k % 2)) * outQuart(seg(t, 0.1 + 0.025 * k, 0.4 + 0.025 * k))
        if h < 2 or abs(x - gx) < 13: continue
        m = rect(fr, x - 1.5, y - h + 3, x + 1.5, y)
        Fm = lvl(m, L3) + lvl(m * (fr.xx < x), L4 - L3)
        Fm = np.maximum(Fm, tri_field(fr, x, y - h + 4, 2.0, 4, -math.pi / 2)[0] * L4)
        fr.field(Fm * keep, 'wood')
    flat_ring(fr, gx, gy, 30, 1.2, 'def', 0.95 * (1 - out))
    if t < 0.5: puff(fr, seg(t, 0.05, 0.5), gx - 24, gy - 2, 1.0, 6); puff(fr, seg(t, 0.1, 0.55), gx + 24, gy - 2, 1.0, 7)
    if 0.3 < t < 0.75: glyph(fr, gx + 18, int(gy - 50 + 3 * seg(t, 0.3, 0.75)), SHIELD, 'def')
reg('buff.palisade', b_palisade, size=(96, 80), frames=12, fps=12, anchor=(48, 66), family='buff',
    note='방어 진지(흙벽·목책). 뒤쪽에 흙둔덕이 쌓이고 말뚝 9개가 반원으로 솟음 + 흙먼지·방패 표식. 앵커=발밑')

def b_brace(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 66
    out = seg(t, 0.72, 1); keep = bt(fr) >= out * 1.05
    up = outQuart(seg(t, 0, 0.25)); shake = (1 if i in (4, 6) else (-1 if i == 5 else 0))
    if up > 0.05:   # 앞에 크게 올라오는 방패 1장
        h = 30 * up; top = gy - 8 - h
        m = shield_mask(fr, gx + 12 + shake, top, 20, h)
        F = lvl(m, L3) + lvl(m * (fr.xx < gx + 12 + shake), L4 - L3)
        F = np.where(m * (1 - shield_mask(fr, gx + 12 + shake, top + 2, 16, h - 4)) > 0, L2, F)
        F = np.maximum(F, lvl(disc(fr, gx + 12 + shake, top + h * 0.38, 2.4) > 0.01, L5))
        fr.field(F * keep, 'def', alpha=190)
    if 3 <= i <= 6:   # 첫 충격을 받아냄
        s = [0.9, 1.0, 0.7, 0.4][i - 3]
        fr.field(ring(fr, gx + 12, gy - 24, 6 + 10 * seg(i, 3, 6), 1.6 * (1 - seg(i, 3, 7)) + 0.6, 0.7, 1.0) * 1.05, 'def', cuts=(0.3, 0.65, 0.9), outline=False)
        star4(fr, gx + 12, gy - 24, int(6 * s), 'def')
    if 0.1 < t < 0.6: puff(fr, seg(t, 0.1, 0.6), gx - 6, gy, 1.0, 8)   # 무릎 낮출 때 먼지
    fr.glow(disc(fr, gx + 6, gy - 24, 22) * (1 - out), 'def', 2, 0.5)
reg('buff.brace', b_brace, size=(64, 80), frames=12, fps=12, anchor=(32, 66), family='buff',
    note='방어 태세. 몸 앞에 큰 방패 1장이 올라오고 첫 충격을 받아내며 흔들림(충격 고리·반짝) + 발밑 먼지. 앵커=발밑')

def b_formation(fr, i, n, R):
    t = i / (n - 1); gx, gy = 64, 80
    up = outQuart(seg(t, 0, 0.35)); out = seg(t, 0.72, 1); keep = bt(fr) >= out * 1.05
    s = 54 * (0.4 + 0.6 * up)
    u = (fr.xx - gx) / s; v = (fr.yy - gy) / (s * 0.45)   # 마름모(지면 정사각) 진형 격자
    d = np.abs(u) + np.abs(v)
    edge = np.clip(1 - np.abs(d - 1) * s / 1.4, 0, 1)
    grid = ((np.abs(((u + v) * 3) - np.round((u + v) * 3)) < 0.06) | (np.abs(((u - v) * 3) - np.round((u - v) * 3)) < 0.06)) & (d < 1)
    fr.field(np.maximum(edge * 1.05, grid * 0.55) * keep, 'steel', cuts=(0.3, 0.5, 0.75, 0.92), outline=False, alpha=220)
    for cx, cy in ((gx - s, gy), (gx + s, gy), (gx, gy - s * 0.45), (gx, gy + s * 0.45)):   # 네 모서리 작은 깃발
        if up > 0.6 and out < 0.9:
            fr.field(seg_field(fr, cx, cy, cx, cy - 10, 0.7), 'wood', cuts=(0.3, 0.7))
            glyph(fr, int(cx) + 1, int(cy) - 10, ['oooo', 'o44o', 'ooo.'], 'def')
    wall = np.clip(1 - np.abs(fr.xx - gx) / (s * 1.0), 0, 1) * ((fr.yy < gy - 2) & (fr.yy > gy - 2 - 40 * up)) * (np.abs(fr.xx - gx) < s * 0.95)
    fr.field(wall * 0.55 * keep * (np.round(fr.yy) % 3 != 0), 'def', cuts=(0.3, 0.55), outline=False, alpha=110)
    if 0.3 < t < 0.75: glyph(fr, gx - 3, int(gy - 70 + 4 * seg(t, 0.3, 0.75)), SHIELD, 'def')
    fr.glow(disc(fr, gx, gy - 16, 56, 1.0, 0.6) * (1 - out), 'def', 2, 0.5)
reg('buff.formation', b_formation, size=(128, 96), frames=14, fps=12, anchor=(64, 80), family='buff',
    note='철벽 대진(반경 2·2턴). 발밑에 넓은 마름모 진형 격자가 펼쳐지고 네 모서리 깃발 + 반투명 결계 벽이 솟음 + 방패 표식. 앵커=발밑')

def b_wagon_chain(fr, i, n, R):
    t = i / (n - 1); gx, gy = 64, 66
    out = seg(t, 0.72, 1)
    xs = (-46, -18, 18, 46)
    for k, dx in enumerate(xs):   # 수레 3대가 옆으로 이어 세워짐
        up = outQuart(seg(t, 0.05 + 0.08 * k, 0.32 + 0.08 * k))
        if up <= 0.05 or out > 0.95: continue
        y = gy - 6 + (1 - up) * 8
        wagon(fr, gx + dx, y, 24, 10)
    if t > 0.35 and out < 0.9:   # 수레 사이 쇠사슬
        for a, b in ((-35, -29), (29, 35)):
            for q in range(a, b + 1, 3): glyph(fr, gx + q - 1, gy - 15 + int(1.5 * math.sin(q)), ['o3o', '3.3', 'o3o'] if q % 2 else ['o3', '3o'], 'steel')
    for k, dx in enumerate((-32, 32)):   # 수레 틈 화약 연기
        lt = seg(t, 0.45 + 0.08 * k, 1)
        if 0 < lt < 1:
            if lt < 0.12: fr.field(disc(fr, gx + dx, gy - 20, 3) * 1.2, 'fire', cuts=(0.2, 0.5, 0.8, 0.95))
            puff(fr, lt, gx + dx, gy - 20, 1.0, 260 + k, 'gsmoke', alpha=170, rise=8)
    flat_ring(fr, gx, gy, 46, 1.3, 'def', 0.95 * (1 - out))
    fr.glow(disc(fr, gx, gy - 12, 50, 1.0, 0.4) * (1 - out), 'def', 2, 0.45)
reg('buff.wagon_chain', b_wagon_chain, size=(128, 80), frames=14, fps=12, anchor=(64, 66), family='buff',
    note='수레 방어진(수레를 사슬로 이어 세우고 사이에 화포). 시전자 좌우로 수레 4대가 차례로 옆으로 놓이고 쇠사슬로 연결 + 틈에서 화약 섬광·연기 + 청색 고리. 앵커=발밑')

def b_wagenburg(fr, i, n, R):
    t = i / (n - 1); gx, gy = 64, 76
    out = seg(t, 0.75, 1)
    pos = [(math.cos(a) * 46, math.sin(a) * 16) for a in [k / 6 * math.tau for k in range(6)]]
    order = sorted(range(6), key=lambda k: pos[k][1])
    for k in order:   # 유닛을 둘러싸는 수레 6대 원진(뒤쪽부터)
        dx, dy = pos[k]; up = outQuart(seg(t, 0.04 * k, 0.3 + 0.04 * k))
        if up <= 0.05 or out > 0.95: continue
        wagon(fr, gx + dx, gy + dy - (1 - up) * 10, 24 if dy > 0 else 20, 10 if dy > 0 else 8, back=dy < 0)
    flat_ring(fr, gx, gy, 52, 1.4, 'def', 1.0 * (1 - out), sy=0.36)
    if 0.35 < t < 0.75: glyph(fr, gx - 3, int(gy - 72 + 3 * seg(t, 0.35, 0.75)), SHIELD, 'def')
    fr.glow(disc(fr, gx, gy - 14, 56, 1.0, 0.45) * (1 - out), 'def', 2, 0.45)
reg('buff.wagenburg', b_wagenburg, size=(128, 96), frames=14, fps=12, anchor=(64, 76), family='buff',
    note='마차 요새(수레 원진). 유닛 둘레 타원에 수레 6대가 뒤쪽부터 차례로 내려앉아 둥근 진지 + 청색 고리·방패 표식. 앵커=발밑')

def b_guard(fr, i, n, R):
    t = i / (n - 1); gx, gy = 48, 66
    up = outQuart(seg(t, 0, 0.3)); out = seg(t, 0.72, 1); keep = bt(fr) >= out * 1.05
    if up > 0.1 and out < 0.9:   # 가운데 큰 방패
        draw_shield(fr, gx, 1 + 10 * (1 - up), 10 * up + 1, 12 * up + 1, 'def')
    for sgn in (-1, 1):   # 곁의 아군 쪽으로 뻗는 보호 호 + 끝의 작은 방패
        st = seg(t, 0.2, 0.5)
        if st > 0 and out < 1:
            ang = np.arctan2(fr.yy - (gy - 20), (fr.xx - gx) * sgn)
            F = ring(fr, gx, gy - 20, 34 * st + 4, 1.4, 1.0, 0.75) * (ang > -1.5) * (ang < 0.6)
            fr.field(F * keep * 1.05, 'def', cuts=(0.3, 0.65, 0.9))
            if st >= 1 and out < 0.85: glyph(fr, gx + sgn * 38 - 3, gy - 14, SHIELD, 'def')
    flat_ring(fr, gx, gy, 12 + 10 * up, 1.2, 'def', 1.0 * (1 - out))
    fr.glow(disc(fr, gx, gy - 24, 30) * (1 - out), 'def', 2, 0.5)
reg('buff.guard', b_guard, size=(96, 80), frames=12, fps=12, anchor=(48, 66), family='buff',
    note='곁을 지키는 방패. 머리 위 큰 방패 + 좌우 곁의 아군 쪽으로 뻗는 보호 호와 끝의 작은 방패 2개. 앵커=발밑')

def b_spearwall(fr, i, n, R):
    t = i / (n - 1); gx, gy = 48, 66
    out = seg(t, 0.72, 1); keep = bt(fr) >= out * 1.05
    XS = (-40, -33, -26, -19, 19, 26, 33, 40)
    for k, dx in enumerate(XS):   # 창 8자루가 시전자 좌우에서 앞으로 기울며 솟음(창숲, 몸은 가리지 않음)
        h = (40 - abs(dx) * 0.3) * outQuart(seg(t, 0.03 * (k % 4), 0.3 + 0.03 * (k % 4))) * (1 - out)
        if h < 4: continue
        spear(fr, gx + dx, gy - 2 - (k % 2) * 3, h, lean=0.18, pal='steel')
    if 0.3 < t < 0.6:
        sx = gx - 44 + 88 * seg(t, 0.3, 0.6)
        for dx in XS:
            if abs(gx + dx - sx) < 8: star4(fr, gx + dx + 0.18 * 34, gy - 38, 2, 'def')
    flat_ring(fr, gx, gy, 36, 1.3, 'def', 1.0 * (1 - out), sy=0.3)
    fr.glow(disc(fr, gx, gy - 24, 40, 1.0, 0.7) * (1 - out), 'def', 2, 0.45)
reg('buff.spearwall', b_spearwall, size=(96, 80), frames=12, fps=12, anchor=(48, 66), family='buff',
    note='굳건한 창진(주인공 창). 대열 뒤로 창 9자루가 가운데부터 솟아 앞으로 기운 창숲 + 창끝을 훑는 청색 반짝·청색 고리. 앵커=발밑(stance.base 의 돌아가는 창끝 고리와 구별)')

def b_bulwark(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 82
    out = seg(t, 0.72, 1); keep = bt(fr) >= out * 1.05
    drop = seg(i, 0, 2); gx0 = gx; gx = gx + 18
    if out < 1:   # 큰 탑방패가 위에서 내려와 땅에 박힘
        top = gy - 46 - 30 * (1 - drop)
        m = rect(fr, gx - 10, top, gx + 10, top + 42) * (np.abs(fr.xx - gx) <= 10 - np.clip(fr.yy - (top + 36), 0, 5))
        F = lvl(m, L3) + lvl(m * (fr.xx < gx - 4), L4 - L3) - lvl(m * (fr.xx > gx + 8), L3 - L2)
        F = np.where(m * (1 - rect(fr, gx - 8, top + 2, gx + 8, top + 39)) > 0, L2, F)
        F = np.maximum(F, lvl(rect(fr, gx - 1, top + 6, gx + 1, top + 34) * m, L4))
        F = np.maximum(F, lvl(rect(fr, gx - 6, top + 14, gx + 6, top + 16) * m, L4))
        fr.field(F * keep, 'steel', alpha=235)
    if 2 <= i <= 7:
        st = seg(i, 2, 7)
        fr.field(ring(fr, gx0, gy - 4, 8 + 24 * outQuart(st), 1.8 * (1 - st) + 0.7, 1.0, 0.32) * (1 - st) * 1.1, 'def', cuts=(0.3, 0.65, 0.9))
        for sgn in (-1, 1): puff(fr, st, gx + sgn * 14, gy - 4, 1.2, 270 + sgn, 'stone', rise=6)
        if i == 2: burst(fr, gx, gy - 6, 0.8, 'def', rays=6, seed=31)
    fr.glow(disc(fr, gx0, gy - 26, 30, 1.0, 1.0) * (1 - out), 'def', 2, 0.5)
reg('buff.bulwark', b_bulwark, size=(64, 96), frames=12, fps=12, anchor=(32, 82), family='buff',
    note='버티는 자의 방벽(주인공 중갑). 큰 강철 탑방패가 위에서 떨어져 시전자 오른쪽 앞 땅에 박힘(얼굴은 가리지 않음) → 청색 지면 충격 고리·돌먼지. 프레임 높이 96. 앵커=발밑')

# =================== STANCE ===================
def st_riposte(fr, i, n, R):
    t = i / (n - 1); gx, gy = 48, 66
    out = seg(t, 0.8, 1)
    if t < 0.6:   # 고요히 기다림: 잔잔한 고리 파문
        for k in range(2):
            st = (t * 1.6 + k * 0.5) % 1.0
            flat_ring(fr, gx, gy, 10 + 22 * st, 1.1, 'steel', 0.95 * (1 - st))
        fr.glow(disc(fr, gx, gy - 24, 20), 'steel', 2, 0.35)
    if 0.5 <= t < 0.85:   # 되받아치는 X 칼선 두 줄이 순식간에
        st = seg(t, 0.5, 0.85)
        for k, a in enumerate((-0.6, 0.6)):
            pr = clamp = min(1, st * 3 - k * 0.6)
            if pr <= 0: continue
            dx, dy = math.cos(a), math.sin(a); L = 30
            x0, y0 = gx - dx * L, gy - 26 - dy * L
            F = seg_field(fr, x0, y0, x0 + dx * 2 * L * pr, y0 + dy * 2 * L * pr, 2.2 * (1 - st) + 0.6)
            fr.field(F * 1.15, 'steel', cuts=(0.2, 0.45, 0.7, 0.9))
        if st < 0.5: star4(fr, gx, gy - 26, 7, 'impact'); fr.glow(disc(fr, gx, gy - 26, 22), 'impact', 3, 0.8)
        debris(fr, st, gx, gy - 26, 8, 281, 'impact', (-math.pi, math.pi), (10, 22), 6)
    flat_ring(fr, gx, gy, 34, 1.2, 'def', 0.9 * (1 - out))
reg('stance.riposte', st_riposte, size=(96, 80), frames=14, fps=14, anchor=(48, 66), family='stance',
    note='후발제인(먼저 치게 두고 되받아침). 발밑 잔잔한 파문으로 고요히 기다리다 X 칼선 두 줄이 순식간에 교차 + 섬광·파편. 앵커=발밑')

# =================== SURGE(앵커 = 발밑, 시전 시) ===================
def su_longrun(fr, i, n, R):
    t = i / (n - 1); gx, gy = 48, 66; rr = RNG(301)
    for k in range(7):   # 지면을 길게 끄는 먼지 궤적
        y = gy - rr.r(0, 3); d0 = rr.r(0, 0.3); ph = (t - d0) / 0.5
        if 0 < ph < 1:
            L = 70 * outCubic(ph); x1 = gx + 20 - 2 * k
            fr.field(seg_field(fr, x1 - L, y, x1, y - 1, 1.6 + 0.4 * (k % 2)) * (1 - ph) * 1.1, 'dust', cuts=(0.3, 0.6, 0.85), outline=False, alpha=210)
    for k in range(3):   # 잔상(세로 빛줄기가 뒤로 밀려남)
        st = seg(t, 0.1 + 0.1 * k, 0.6 + 0.1 * k)
        if 0 < st < 1:
            x = gx - 8 - 30 * st
            fr.field(np.clip(1 - np.abs(fr.xx - x) / 2.5, 0, 1) * ((fr.yy < gy) & (fr.yy > gy - 46)) * (1 - st) * 0.8, 'move', cuts=(0.4, 0.65, 0.85), outline=False, alpha=170, dither_below=0.55)
    for k in range(5):
        y = gy - 10 - k * 8; ph = seg(t, 0.05 * k, 0.4 + 0.05 * k)
        if 0 < ph < 1: fr.field(seg_field(fr, 96 * (1 - ph) - 20, y, 96 * (1 - ph), y, 0.8) * 1.0, 'move', cuts=(0.4, 0.8, 0.95), outline=False)
    if 0.15 < t < 0.85:
        y = int(30 - 12 * seg(t, 0.15, 0.85)); glyph(fr, gx + 18, y, CHEV_UP, 'move'); glyph(fr, gx + 18, y + 6, CHEV_UP, 'move')
reg('surge.longrun', su_longrun, size=(96, 80), frames=12, fps=14, anchor=(48, 66), family='surge',
    note='장거리 강습(먼 거리를 단숨에). 지면에 길게 끌리는 먼지 궤적 7줄 + 뒤로 밀려나는 세로 잔상 3개 + 바람선·위 화살표. 앵커=발밑')

def su_swift(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 66; rr = RNG(311)
    for k in range(4):   # 지그재그 빛 대시
        d0 = k * 0.12; ph = (t - d0) / 0.3
        if 0 < ph < 1:
            pts = [(gx - 20 + 40 * (q % 2), gy - 8 - q * 11) for q in range(5)]
            pts = [(x + rr.r(-3, 3), y) for x, y in pts]
            m = int(ph * 4) + 1
            for a, b in list(zip(pts[:-1], pts[1:]))[max(0, m - 2):m]:
                fr.field(seg_field(fr, *a, *b, 1.0) * (1 - ph * 0.4), 'steel', cuts=(0.35, 0.7, 0.92), outline=True)
    for k in range(6):
        d0 = rr.r(0.1, 0.6); ph = (t - d0) / 0.2
        if 0 < ph < 1: star4(fr, gx + rr.r(-18, 18), gy - rr.r(6, 50), 2 if ph < 0.5 else 1, 'steel')
    if t < 0.4: puff(fr, seg(t, 0, 0.4), gx, gy, 0.9, 9)
    if 0.2 < t < 0.85:
        y = int(30 - 12 * seg(t, 0.2, 0.85)); glyph(fr, gx - 3, y, CHEV_UP, 'steel'); glyph(fr, gx - 3, y + 5, CHEV_UP, 'steel')
reg('surge.swift', su_swift, size=(64, 80), frames=12, fps=16, anchor=(32, 66), family='surge',
    note='기동 강습(빠른 발이 허점을 찾음). 청백 지그재그 빛 대시가 몸을 타고 오르고 작은 반짝이 + 가벼운 발 먼지·위 화살표. 앵커=발밑')

def su_shadow(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 66
    up = outQuart(seg(t, 0, 0.3)); out = seg(t, 0.6, 1)
    fr.field(disc(fr, gx, gy, 22 * up + 2, 1.0, 0.35) * (1 - out) * 1.1, 'shade', cuts=(0.2, 0.5, 0.8), outline=False, alpha=200)   # 발밑 그림자 웅덩이
    for k in range(4):   # 몸을 감싸며 오르는 어두운 연기 갈래
        ph = (t * 1.3 + k / 4) % 1.0
        x = gx + math.sin(ph * 6 + k * 1.7) * (10 + 4 * k % 3); y = gy - 6 - 46 * ph
        S = disc(fr, x, y, 6 - 3 * ph, 1.0, 1.4) + (fbm(fr.xx / 3, fr.yy / 3 - t * 8, 320 + k) - 0.5) * 0.5 * (disc(fr, x, y, 8, 1.0, 1.4) > 0)
        fr.field(S * (1 - out) * 1.1, 'shade', cuts=(0.2, 0.45, 0.7, 0.9), outline=True, alpha=210, dither_below=0.35)
    rr = RNG(321)
    for k in range(3):
        d0 = rr.r(0.1, 0.5); ph = (t - d0) / 0.25
        if 0 < ph < 1: fr.field(seg_field(fr, gx - 22 + 44 * ph, gy - rr.r(14, 40), gx - 34 + 44 * ph, gy - rr.r(14, 40), 0.7), 'shade', cuts=(0.3, 0.7, 0.9), outline=False)
    if 0.25 < t < 0.8: fr.px(gx - 3, 22, 'shade', 5); fr.px(gx + 3, 22, 'shade', 5)   # 그림자 속 두 눈빛
reg('surge.shadow', su_shadow, size=(64, 80), frames=12, fps=12, anchor=(32, 66), family='surge',
    note='급습(그림자처럼 다가옴). 발밑 그림자 웅덩이 + 몸을 감고 오르는 어두운 보랏빛 연기 갈래 + 스치는 그림자선, 잠깐 두 눈빛. 앵커=발밑')

LEAF = [['.o.', 'o3o', 'o4o', '.o.'], ['oo..', 'o3o.', '.o4o', '..oo'], ['..oo', '.o4o', 'o3o.', 'oo..']]
def su_jungle(fr, i, n, R):
    t = i / (n - 1); gx, gy = 48, 66
    out = seg(t, 0.75, 1)
    if t < 0.7:   # 발밑 수풀 덤불
        for k, dx in enumerate((-18, 0, 18)):
            up = outQuart(seg(t, 0.05 * k, 0.3)); dn = seg(t, 0.4, 0.7)
            Bm = disc(fr, gx + dx, gy - 2, (8 + 2 * (k % 2)) * up * (1 - dn) + 0.1, 1.2, 0.7) + (fbm(fr.xx / 3, fr.yy / 3, 330 + k) - 0.5) * 0.5 * (disc(fr, gx + dx, gy - 2, 12, 1.2, 0.7) > 0)
            fr.field(Bm * 1.1 * (fr.yy <= gy + 1), 'leaf', cuts=(0.25, 0.45, 0.7, 0.9), alpha=240)
    rr = RNG(331)
    for k in range(14):   # 소용돌이치며 스쳐 가는 잎
        d0 = rr.r(0, 0.55); ph = (t - d0) / 0.42
        if 0 < ph < 1:
            a = ph * 5 + k; r = 30 - 10 * ph
            x = gx + math.cos(a) * r; y = gy - 10 - 40 * ph + math.sin(a) * 6
            g = LEAF[k % 3]; glyph(fr, int(x) - 1, int(y) - 1, g, 'leaf')
    if 0.2 < t < 0.85:
        y = int(30 - 12 * seg(t, 0.2, 0.85)); glyph(fr, gx - 3, y, CHEV_UP, 'leaf')
    fr.glow(disc(fr, gx, gy - 8, 34, 1.0, 0.5) * (1 - out), 'leaf', 2, 0.35)
reg('surge.jungle', su_jungle, size=(96, 80), frames=12, fps=12, anchor=(48, 66), family='surge',
    note='밀림의 기습. 발밑에 수풀 덤불이 부풀었다 가라앉고 짙은 녹색 잎 14장이 소용돌이치며 스쳐 감(바람 줄기 surge.base 와 구별). 앵커=발밑')

def su_flank(fr, i, n, R):
    t = i / (n - 1); gx, gy = 48, 66
    out = seg(t, 0.75, 1)
    prog = seg(t, 0.05, 0.6)   # 유닛 둘레를 돌아 들어가는 지면 곡선 화살표
    if prog > 0 and out < 1:
        a0 = math.pi * 0.9; a1 = a0 - prog * math.pi * 1.55
        ang = np.arctan2((fr.yy - gy) / 0.42, fr.xx - gx)
        span = (a0 - ang) % math.tau
        F = ring(fr, gx, gy, 34, 2.4, 1.0, 0.42) * (span <= prog * math.pi * 1.55)
        fr.field(F * (1 - out) * 1.1, 'impact', cuts=(0.3, 0.6, 0.85, 0.97))
        hx, hy = gx + math.cos(a1) * 34, gy + math.sin(a1) * 34 * 0.42
        tan = (math.sin(a1), -math.cos(a1) * 0.42)
        fr.field(tri_field(fr, hx, hy, 4.5, 8, math.atan2(tan[1], tan[0]))[0] * (1 - out) * 1.2, 'impact', cuts=(0.2, 0.5, 0.8, 0.95))
        puff(fr, seg(t, 0.1, 0.9), hx, hy + 1, 0.8, 340)
    if 0.25 < t < 0.85:
        y = int(30 - 12 * seg(t, 0.25, 0.85)); glyph(fr, gx - 3, y, CHEV_UP, 'impact'); glyph(fr, gx - 3, y + 5, CHEV_UP, 'impact')
    fr.glow(disc(fr, gx, gy, 40, 1.0, 0.42) * (1 - out), 'impact', 2, 0.35)
reg('surge.flank', su_flank, size=(96, 80), frames=12, fps=14, anchor=(48, 66), family='surge',
    note='쾌속 우회(옆구리로 돌아 들어감). 발밑 둘레를 4분의 3 바퀴 돌아 그려지는 금빛 곡선 화살표 + 화살촉 먼지 + 위 화살표. 앵커=발밑')

def su_horde(fr, i, n, R):
    t = i / (n - 1); gx, gy = 64, 66; rr = RNG(351)
    for row in range(3):   # 말발굽 먼지 줄(여러 기마가 한 방향으로)
        y = gy - 2 - row * 6
        for k in range(6):
            x = 8 + k * 22 + row * 7; d0 = 0.05 * k + 0.07 * row
            lt = seg(t, d0, d0 + 0.55)
            if 0 < lt < 1: puff(fr, lt, x, y, 0.85 + 0.15 * (row == 0), 360 + row * 10 + k, rise=5)
    if t > 0.1:   # 뒤쪽 흙먼지 둑
        st = seg(t, 0.1, 1)
        S = disc(fr, gx - 10 + 10 * st, gy - 18, 60, 1.0, 0.25) * (0.95 - st)
        S = S + (fbm(fr.xx / 7 - st * 3, fr.yy / 5, 371) - 0.5) * 0.6 * (S > 0)
        fr.field(S, 'dust', cuts=(0.2, 0.4, 0.65), outline=False, alpha=150, dither_below=0.35)
    for k in range(6):   # 같은 방향 평행 속도선
        y = gy - 12 - k * 6; ph = seg(t, 0.03 * k, 0.4 + 0.03 * k)
        if 0 < ph < 1:
            x = -20 + 170 * ph; fr.field(seg_field(fr, x - 24, y, x, y, 0.8), 'impact', cuts=(0.4, 0.8, 0.95), outline=False)
    if 0.2 < t < 0.85:
        y = int(26 - 10 * seg(t, 0.2, 0.85))
        for x in (gx - 20, gx, gx + 20): glyph(fr, x - 3, y + (4 if x != gx else 0), CHEV_UP, 'atk')
reg('surge.horde', su_horde, size=(128, 80), frames=14, fps=14, anchor=(64, 66), family='surge',
    note='서진의 철기(대군이 한 방향으로 쏟아짐). 3줄로 이어지는 말발굽 먼지 18개 + 뒤쪽 흙먼지 둑 + 평행 속도선 + 위 화살표 3개. 앵커=발밑')

EXCL = ['ooo', 'o5o', 'o4o', 'o4o', 'o3o', 'ooo', 'o4o', 'ooo']
def su_rush(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 66
    out = seg(t, 0.7, 1)
    if t < 0.5:   # 위급: 붉은 경보 고리 두 번
        for k in range(2):
            st = seg(t, k * 0.18, k * 0.18 + 0.32)
            if 0 < st < 1: flat_ring(fr, gx, gy, 6 + 22 * outQuart(st), 1.8 * (1 - st) + 0.6, 'atk', 1.1 * (1 - st))
    if 0.05 < t < 0.55 and (i % 2 == 0 or t < 0.3): glyph(fr, gx - 1, 2, EXCL, 'atk')
    rr = RNG(381)
    for k in range(8):   # 위로 치솟는 금빛 질주선
        x = gx + rr.r(-16, 16); d0 = rr.r(0.15, 0.55); ph = (t - d0) / 0.25
        if 0 < ph < 1:
            y = gy - 4 - 56 * ph; fr.field(seg_field(fr, x, y, x, y + 12, 0.9) * (1 - ph * 0.3), 'impact', cuts=(0.4, 0.8, 0.95), outline=False)
    if t < 0.6: puff(fr, seg(t, 0.15, 0.6), gx - 8, gy, 1.0, 10); puff(fr, seg(t, 0.2, 0.65), gx + 8, gy, 1.0, 11)
    if 0.3 < t < 0.9:
        y = int(34 - 14 * seg(t, 0.3, 0.9)); glyph(fr, gx - 19, y, CHEV_UP, 'impact'); glyph(fr, gx + 13, y + 3, CHEV_UP, 'impact')
    fr.glow(disc(fr, gx, gy, 22, 1.0, 0.45) * (1 - out), 'impact', 2, 0.4)
reg('surge.rush', su_rush, size=(64, 80), frames=12, fps=14, anchor=(32, 66), family='surge',
    note='충신의 질주(위급한 곳으로 가장 먼저). 머리 위 붉은 느낌표 + 발밑 붉은 경보 고리 2번 → 위로 치솟는 금빛 질주선·발 먼지. 앵커=발밑')

PAGE = ['oooo', 'o54o', 'o43o', 'o43o', 'oooo']
def su_chronicle(fr, i, n, R):
    t = i / (n - 1); gx, gy = 32, 66
    out = seg(t, 0.72, 1)
    if 0.05 < t < 0.6:   # 시대를 가르는 세로 금빛 틈
        st = seg(t, 0.05, 0.6); hh = 60 * outQuart(seg(st, 0, 0.4))
        w = 2.4 * (1 - seg(st, 0.5, 1)) + 0.4
        F = np.clip(1 - np.abs(fr.xx - (gx + 12)) / w, 0, 1) * ((fr.yy < gy) & (fr.yy > gy - hh))
        fr.field(F * 1.1, 'holy', cuts=(0.2, 0.5, 0.8, 0.95)); fr.glow(np.clip(1 - np.abs(fr.xx - (gx + 12)) / 10, 0, 1) * (fr.yy < gy) * (fr.yy > gy - hh), 'holy', 3, 0.7)
    rr = RNG(391)
    for k in range(9):   # 나선으로 휘날려 오르는 책장
        d0 = rr.r(0, 0.5); ph = (t - d0) / 0.45
        if 0 < ph < 1:
            a = ph * 6 + k * 0.7; x = gx + math.cos(a) * (16 - 4 * ph); y = gy - 8 - 48 * outCubic(ph)
            g = PAGE if math.cos(a * 2) > 0 else ['ooo', 'o4o', 'o3o', 'ooo']
            glyph(fr, int(x) - 1, int(y) - 2, g, 'holy')
    flat_ring(fr, gx, gy, 10 + 14 * outQuart(seg(t, 0, 0.3)), 1.4, 'holy', 1.05 * (1 - out))
    if t < 0.45: puff(fr, seg(t, 0.05, 0.45), gx - 6, gy, 1.0, 12)
reg('surge.chronicle', su_chronicle, size=(64, 80), frames=14, fps=14, anchor=(32, 66), family='surge',
    note='역사를 가르는 돌격(주인공 기병). 세로로 열리는 금빛 틈 + 나선으로 휘날려 오르는 금빛 책장 9장 + 발밑 금빛 고리·먼지(서고 테마). 앵커=발밑')

# ---------- 출력 ----------
OUT = B.OUT
FRAG = f'{OUT}/manifest_fragment_skill_fx_b.json'
QA = {}
try: QA = {k: tuple(v) for k, v in json.load(open('docker/gemini/skill_fx_qa_b.json', encoding='utf-8')).items()}
except Exception: pass

def fragment_item(key, sp, path, cols, rows):
    it = B.fragment_item(key, sp, path, cols, rows)
    it['generator']['script'] = 'docker/gemini/skill_fx_build_b.py (Python Pillow·numpy, skill_fx_build.py 공용 함수 사용)'
    it['prompt_ref'] = 'docker/gemini/skill_fx_build_b.py FX[' + key + ']'
    v = QA.get(key, ('minor', ['자동 점검만']))
    it['qa'] = {'checked': key in QA, 'verdict': v[0], 'issues': v[1]}
    return it

if __name__ == '__main__':
    args = sys.argv[1:]; prev = None
    if '--preview' in args:
        k = args.index('--preview'); prev = args[k + 1]; args = args[:k] + args[k + 2:]
    keys = [k for k in FX if not args or any(k.startswith(a) for a in args)]
    old = json.load(open(FRAG, encoding='utf-8')) if os.path.exists(FRAG) else {'items': []}
    byk = {it['key']: it for it in old.get('items', [])}
    base_keys = set(B.FINAL)
    for k in keys:
        assert k not in base_keys, f'기존 39종과 키 충돌: {k}'
        sp = FX[k]
        path, frames, cols, rows = B.build(sp, OUT, prev, {})
        it = fragment_item(k, sp, path, cols, rows); it['empty_last'] = frames[-1].getbbox() is None
        byk[it['key']] = it
        print(k, path, sp['frames'], 'f', it['size'], it['bytes'], 'B', 'last-empty' if it['empty_last'] else 'LAST-NOT-EMPTY')
    frag = {'_note': '영웅 스킬 이펙트 시트 배치 B(안아트 2026-11-08, 이미지 모델 호출 0). 계열 기본값으로 떨어지던 w3_*·p1_* 액티브 전용 변형. 키 규약 fx.skill.<계열>.<변형>(기존 39종 fx/skills/manifest_fragment_skill_fx.json 과 같은 규약·경로). 스킬 코드 매핑 = docker/gemini/skill_fx_map_b.json. 병합 merge_fragments.mjs FRAGMENTS 에 이 경로 1줄 추가 필요',
            'items': [byk['fx.skill.' + k] for k in FX if 'fx.skill.' + k in byk]}
    json.dump(frag, open(FRAG, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('items', len(frag['items']), FRAG)
