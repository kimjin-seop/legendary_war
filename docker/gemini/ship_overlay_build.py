"""수상 이동용 배 오버레이 스프라이트 생성기 — 이미지 생성 모델 호출 0회, 절차적 도트.
유닛 스프라이트 규격(64x64 프레임, 시트 행 = down 0 / left 1 / right 2 / up 3, assets.js SHEET_ROW)에 맞춘 2겹 구조:
  ship_<type>_back.png   유닛 '뒤'에 그림(갑판 안쪽·먼 뱃전·돛대·돛·선루)   256x256 = 4열(애니 프레임) x 4행(방향)
  ship_<type>_front.png  유닛 '앞'에 덮음(가까운 뱃전·선체·뱃머리·노·물거품) 256x256
  ship_wake.png          배 아래 물결(모든 배 공용, 유닛 그림자 대신)          256x256
  ship_splash.png        물보라 파티클 32x32 x 6프레임(이동 시작/정지·피격)   192x32
  preview_*.png          실제 병종 스프라이트 + 바다 타일과 합성한 점검 이미지
실행: docker run --rm -v "<repo>:/app" -v "<scratch>:/s" -w /app python:3.12 python docker/gemini/ship_overlay_build.py
의존: pillow 13.0.0, numpy 2.5.4 (/s/deps, PyPI)
"""
import sys, json, math, os
sys.path.insert(0, '/s/deps')
import numpy as np
from PIL import Image

OUT = 'public/assets/sprites/ship_overlay'
os.makedirs(OUT, exist_ok=True)
F, NF = 64, 4
DIRS = ['down', 'left', 'right', 'up']
YY, XX = np.mgrid[0:F, 0:F]
PX, PY = XX + 0.5, YY + 0.5

def hx(s, a=255): return np.array([int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a], np.uint8)
P = {k: hx(v) for k, v in dict(
    ln='2a1608', foam='ffffff', foam2='80e8ff', w_light='00d4ff', w_mid='0094ff', w_shade='0040c0',
    # 공용 금속·천·장식
    gold='ffd23c', gold2='c89a1e', red='c8281e', red2='8a1a14', white='f2efe6', cloth='e8dcc0', cloth2='c8b48c', cloth3='9c8660',
    blk='282828', st='959aa8', sthi='d0d0ce', st2='59595a', st3='39434d', teal='2f8f83', teal2='1f5f58', blue='2a4fa0', sand3='d3966c',
).items()}
WOODS = {  # 선체 나무 팔레트(밝음, 기본, 중간, 어두움)
    'natural': ['c89a62', 'a87642', '86582c', '5e3a1a'],
    'korea': ['b07e4a', '8c5c30', '6c4220', '4a2a12'],
    'turtle': ['8a6a46', '6a4e30', '4e3820', '33230f'],
    'japan_light': ['dcb886', 'bf9660', '9a7444', '6e5030'],
    'black': ['5a5a5e', '3c3c40', '2a2a2e', '18181a'],
    'west': ['9a6a40', '7a4e2a', '5e381a', '40240e'],
    'china': ['c0603a', 'a0462a', '7e321e', '561e10'],
}

def blank(): return np.zeros((F, F, 4), np.uint8)
def put(img, m, c): img[m] = P[c] if isinstance(c, str) else c
def wc(img, m, pal, i): img[m] = hx(pal[i])
def outline(img, m, col='ln'):
    e = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1)); put(img, e, col); return e
def hsh(*v):
    h = 2166136261
    for x in v: h = ((h ^ (int(x) & 0xffffffff)) * 16777619) & 0xffffffff
    h ^= h >> 13; h = (h * 0x5bd1e995) & 0xffffffff; h ^= h >> 15
    return h / 4294967296.0

# ------------------------------------------------------------------ 측면(오른쪽을 향함). 왼쪽 = 좌우 반전
WL = 62  # 흘수선(유닛 발 끝 y=63 을 가림)
def side_geo(t):
    xs, xb = t['xs'], t['xb']; xm = (xs + xb) / 2 + t.get('mid_shift', 0)
    g0 = t['deck']
    def g(x):
        x = np.asarray(x, float)
        r = np.where(x < xm, t['stern_rise'] * ((xm - x) / (xm - xs)) ** 2, t['bow_rise'] * ((x - xm) / (xb - xm)) ** 2)
        return g0 - r
    def k(x):  # 선체 바닥선
        x = np.asarray(x, float); kb = WL * np.ones_like(x)
        bl = t.get('bow_len', 14); sl = t.get('stern_len', 6)
        tb = np.clip((x - (xb - bl)) / bl, 0, 1); kb = kb - (WL - g(xb) - 2) * tb ** t.get('bow_pow', 1.6)
        ts = np.clip(((xs + sl) - x) / sl, 0, 1); kb = kb - (WL - g(xs) - 3) * ts ** 2.5
        return kb
    return g, k, xs, xb
def side_front(t, f):
    img = blank(); pal = WOODS[t['wood']]
    g, k, xs, xb = side_geo(t)
    gx, kx = g(PX), k(PX)
    hull = (PX >= xs) & (PX <= xb) & (PY >= gx) & (PY <= kx)
    wc(img, hull, pal, 1)
    rel = PY - gx
    wc(img, hull & (rel % 4 >= 3), pal, 2)                      # 판자 이음선
    wc(img, hull & (PY > gx + (kx - gx) * 0.62), pal, 2)        # 아래쪽 그늘
    wc(img, hull & (PY > gx + (kx - gx) * 0.62) & (rel % 4 >= 3), pal, 3)
    wc(img, hull & (rel < 2), pal, 0)                           # 뱃전 난간(위 2px 밝음)
    wc(img, hull & (rel >= 2) & (rel < 3), pal, 3)
    t['side_deco'](img, hull, gx, kx, pal, f, t)
    outline(img, hull)
    # 흘수선 거품(애니)
    wl = (PY >= WL - 1) & (PY <= WL + 1) & (PX >= xs + 3) & (PX <= xb - 1)
    ph = (XX + f * 3) % 7
    put(img, wl & (YY == WL) & (ph < 4), 'foam'); put(img, wl & (YY == WL + 1) & (ph >= 2) & (ph < 5), 'foam2')
    bow = (np.abs(PX - (xb - 1)) <= 2 + (f % 2)) & (YY >= WL - 2) & (YY <= WL + 1); put(img, bow & ((XX + YY + f) % 2 == 0), 'foam')
    return img
def side_back(t, f):
    img = blank(); pal = WOODS[t['wood']]
    g, k, xs, xb = side_geo(t)
    gx = g(PX); depth = t.get('deck_depth', 7)
    gf = gx - depth
    deck = (PX >= xs + 2) & (PX <= xb - 3) & (PY >= gf) & (PY < gx + 1)
    wc(img, deck, pal, 0); wc(img, deck & (YY % 2 == 1), pal, 1)
    far = (PX >= xs + 1) & (PX <= xb - 2) & (PY >= gf - 2) & (PY < gf + 0.5)
    wc(img, far, pal, 1); wc(img, far & (PY < gf - 1), pal, 0); outline(img, far | deck)
    t['back_deco'](img, gx, gf, pal, f, t)
    return img

# ------------------------------------------------------------------ 정면(down: 뱃머리가 화면 아래) / 후면(up: 고물이 화면 아래)
def fb_geo(t):
    hw = t.get('beam', 21)  # 반폭
    return 32 - hw, 32 + hw, hw
def down_back(t, f):
    img = blank(); pal = WOODS[t['wood']]; x0, x1, hw = fb_geo(t)
    top = t.get('stern_y', 22)
    body = (PX >= x0) & (PX <= x1) & (PY >= top) & (PY <= WL) & (np.abs(PX - 32) <= hw - np.clip(PY - 50, 0, None) * 1.3)
    wc(img, body, pal, 0); wc(img, body & (YY % 3 == 2), pal, 1)            # 갑판(세로 시점 판자)
    rails = body & ((PX <= x0 + 3) | (PX >= x1 - 3)); wc(img, rails, pal, 1); wc(img, rails & ((PX <= x0 + 1) | (PX >= x1 - 1)), pal, 0)
    st = (PX >= x0) & (PX <= x1) & (PY >= top) & (PY <= top + 4); wc(img, st, pal, 1); wc(img, st & (YY == top), pal, 0); wc(img, st & (YY == top + 4), pal, 3)
    outline(img, body)
    t['fb_deco'](img, 'down_back', x0, x1, top, pal, f, t)
    return img
def down_front(t, f):
    img = blank(); pal = WOODS[t['wood']]; x0, x1, hw = fb_geo(t)
    rail = 44 + 3 * (1 - ((PX - 32) / hw) ** 2)
    shape = (np.abs(PX - 32) <= hw - np.clip(PY - 50, 0, None) * 1.3) & (PY >= rail) & (PY <= WL + 0.5)
    wc(img, shape, pal, 1)
    rel = PY - rail
    wc(img, shape & (rel < 2), pal, 0); wc(img, shape & (rel >= 2) & (rel < 3), pal, 3)
    wc(img, shape & (rel >= 3) & ((YY % 4) == 2), pal, 2)
    wc(img, shape & (PX > 32) & (rel >= 3), pal, 2); wc(img, shape & (PX > 32) & (rel >= 3) & (YY % 4 == 2), pal, 3)  # 오른쪽(광원 반대) 그늘
    stem = shape & (np.abs(PX - 32) < 1.1) & (rel >= 2); wc(img, stem, pal, 3)
    # 옆 뱃전(유닛 옆)
    side = (PY >= 30) & (PY < rail) & (((PX >= x0) & (PX <= x0 + 2)) | ((PX >= x1 - 2) & (PX <= x1)))
    wc(img, side, pal, 1); wc(img, side & ((PX <= x0 + 0.9) | (PX >= x1 - 0.9)), pal, 3)
    t['fb_deco'](img, 'down_front', x0, x1, rail, pal, f, t, shape)
    outline(img, shape | side)
    wl = (YY >= WL - 1) & (YY <= WL + 1) & (np.abs(PX - 32) <= hw - 14) ; ph = (XX + f * 2) % 5
    put(img, wl & (ph < 3) & (YY == WL), 'foam'); put(img, wl & (ph >= 2) & (YY == WL + 1), 'foam2')
    return img
def up_back(t, f):
    img = blank(); pal = WOODS[t['wood']]; x0, x1, hw = fb_geo(t)
    tip = t.get('bow_y', 10)
    yy = np.clip(PY - tip, 0, None)
    w = hw * np.clip(yy / 16, 0, 1) ** 0.6
    body = (np.abs(PX - 32) <= w) & (PY >= tip) & (PY <= 50)
    wc(img, body, pal, 0); wc(img, body & (YY % 3 == 2), pal, 1)
    rails = body & (np.abs(PX - 32) >= w - 2.5); wc(img, rails, pal, 1); wc(img, rails & (np.abs(PX - 32) >= w - 1), pal, 3)
    outline(img, body)
    t['fb_deco'](img, 'up_back', x0, x1, tip, pal, f, t)
    return img
def up_front(t, f):
    img = blank(); pal = WOODS[t['wood']]; x0, x1, hw = fb_geo(t)
    top = 43
    tr = (PX >= x0 + 1) & (PX <= x1 - 1) & (PY >= top) & (PY <= WL + 0.5) & (np.abs(PX - 32) <= hw - 1 - np.clip(PY - 56, 0, None) * 1.6)
    wc(img, tr, pal, 1); wc(img, tr & ((YY - top) % 4 == 3), pal, 2)
    wc(img, tr & (PY < top + 2), pal, 0); wc(img, tr & (PY >= top + 2) & (PY < top + 3), pal, 3)
    wc(img, tr & (PY > 54), pal, 2)
    side = (PY >= 30) & (PY < top) & (((PX >= x0) & (PX <= x0 + 2)) | ((PX >= x1 - 2) & (PX <= x1)))
    wc(img, side, pal, 1); wc(img, side & ((PX <= x0 + 0.9) | (PX >= x1 - 0.9)), pal, 3)
    rud = (np.abs(PX - 32) <= 1.5) & (PY >= 52) & (PY <= WL + 1); wc(img, rud, pal, 3)
    t['fb_deco'](img, 'up_front', x0, x1, top, pal, f, t, tr)
    outline(img, tr | side)
    wl = (YY >= WL - 1) & (YY <= WL + 1) & (np.abs(PX - 32) <= hw - 6); ph = (XX + f * 2) % 5
    put(img, wl & (ph < 3) & (YY == WL), 'foam'); put(img, wl & (ph >= 2) & (YY == WL + 1), 'foam2')
    return img

# ------------------------------------------------------------------ 장식 도우미
def flag(img, x, y, f, col='red', w=8, h=5, left=False):
    put(img, (XX == x) & (YY >= y) & (YY <= y + h + 6), 'ln')
    wave = [0, 1, 0, -1][f]
    for i in range(w):
        xx = x - 1 - i if left else x + 1 + i
        off = int(round(wave * math.sin(i / max(1, w - 1) * math.pi)))
        hh = max(1, h - i // 3)
        for j in range(hh):
            if 0 <= xx < F: img[y + j + off, xx] = P[col]
        if 0 <= xx < F: img[y + off, xx] = P['white'] if col != 'white' else P['cloth2']
def mast(img, x, y0, y1, pal):
    m = (XX >= x) & (XX <= x + 1) & (YY >= y0) & (YY <= y1); wc(img, m, pal, 2); wc(img, m & (XX == x), pal, 1)
def sail_square(img, cx, y0, y1, half, f, cols=('cloth', 'cloth2', 'cloth3'), batten=None, vertical_seams=False):
    belly = [0, 1, 1, 0][f]; tmp = blank()
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0); hw = half + int(round(math.sin(t * math.pi) * (1 + belly)))
        for x in range(cx - hw, cx + hw + 1):
            if 0 <= x < F:
                c = cols[0] if x < cx else cols[1]
                if (vertical_seams and (x - cx) % 4 == 0) or (not vertical_seams and batten is None and (y - y0) % 5 == 4): c = cols[2]
                if batten and (y - y0) % 4 == 3: c = batten
                tmp[y, x] = P[c] if c in P else hx(c)
    m = tmp[..., 3] > 0
    outline(tmp, m, 'cloth3' if batten is None else 'ln')
    img[m] = tmp[m]
    for yy in (y0 - 1, y1 + 1):  # 활대(위·아래 가로대)
        if 0 <= yy < F: put(img, (YY == yy) & (np.abs(XX - cx) <= half + 1), 'ln')
def sail_lateen(img, x_mast, y_top, y_bot, length, f, right=True):
    belly = [0, 1, 1, 0][f]; m = np.zeros((F, F), bool)
    for y in range(y_top, y_bot + 1):
        t = (y - y_top) / max(1, y_bot - y_top)
        span = int(length * t + belly * math.sin(t * math.pi))
        for i in range(span + 1):
            x = x_mast + i if right else x_mast - i
            if 0 <= x < F: m[y, x] = True
    put(img, m, 'white'); put(img, m & (XX % 5 == 0), 'cloth2'); outline(img, m, 'cloth3')
    yard = np.zeros((F, F), bool)
    for i in range(length + 3):
        x = x_mast + i - 2 if right else x_mast - i + 2; y = y_top + int(i * (y_bot - y_top) / (length + 2) * 0.15)
        if 0 <= x < F: yard[y_top - 1, x] = True
    put(img, yard, 'ln')
def shields(img, hull, gx, x0, x1, step, cols, h=6, ports=True):
    """뱃전 위 방패판/여장(세로 판자 줄): 뱃전선 위로 h px"""
    m = (PX >= x0) & (PX <= x1) & (PY >= gx - h) & (PY < gx)
    put(img, m, cols[0]); put(img, m & ((XX - x0) % step == 0), cols[1]); put(img, m & (PY < gx - h + 1), cols[2])
    if ports: put(img, m & ((XX - x0) % step == step // 2) & (PY >= gx - h + 2) & (PY < gx - h + 4), 'blk')
    outline(img, m)
    return m

# ------------------------------------------------------------------ 배 종류
def nodeco(*a, **k): pass

def boat_side(img, hull, gx, kx, pal, f, t):
    put(img, hull & (np.abs(PY - (gx + 6)) < 0.6), hx(pal[3]))
def boat_back(img, gx, gf, pal, f, t):
    seat = (XX >= 44) & (XX <= 47) & (PY >= gf) & (PY < gx); wc(img, seat, pal, 2)
def boat_fb(img, which, x0, x1, y, pal, f, t, m=None):
    if which == 'down_back': wc(img, (YY == 36) & (XX > x0 + 2) & (XX < x1 - 2), pal, 2)

def pan_side(img, hull, gx, kx, pal, f, t):
    ports = hull & (PY >= gx + 4) & (PY < gx + 7) & ((XX - 6) % 9 < 3) & (XX > t['xs'] + 5) & (XX < t['xb'] - 9); put(img, ports, 'blk')
    put(img, ports & (YY == np.floor(gx + 4).astype(int)), hx(pal[3]))
    shields(img, hull, gx, t['xs'] + 3, t['xb'] - 6, 4, (hx('d8c49a'), hx(pal[2]), hx('efe2c0')), h=6)
def pan_back(img, gx, gf, pal, f, t):
    # 판옥(갑판 위 2층 누각): 고물 쪽 + 돛대 2개 + 돛
    mast(img, 22, 4, 40, pal); mast(img, 40, 9, 40, pal)
    sail_square(img, 23, 6, 22, 7, f, cols=('cloth', 'cloth2', 'cloth3'))
    sail_square(img, 41, 11, 24, 6, f, cols=('cloth', 'cloth2', 'cloth3'))
    house = (XX >= 6) & (XX <= 20) & (YY >= 26) & (YY <= 38)
    put(img, house, hx(pal[1])); put(img, house & (XX % 3 == 0), hx(pal[2])); put(img, house & (YY <= 28), hx('3a3a40')); put(img, house & (YY == 26), hx('6a6a70'))
    outline(img, house)
    flag(img, 22, 0, f, 'red', 7, 4)
def pan_fb(img, which, x0, x1, y, pal, f, t, m=None):
    if which == 'down_front':
        sh = (PX >= x0 + 1) & (PX <= x1 - 1) & (PY >= y - 5) & (PY < y) & (np.abs(PX - 32) <= 21)
        put(img, sh, hx('d8c49a')); put(img, sh & (XX % 4 == 0), hx(pal[2])); put(img, sh & (PY < y - 4), hx('efe2c0')); put(img, sh & (XX % 4 == 2) & (PY >= y - 3) & (PY < y - 1), 'blk')
        outline(img, sh)
    if which == 'down_back':
        house = (XX >= 14) & (XX <= 50) & (YY >= 15) & (YY <= 24); put(img, house, hx(pal[1])); put(img, house & (YY <= 17), hx('3a3a40')); outline(img, house)
        flag(img, 50, 2, f, 'red', 6, 4)
    if which == 'up_back':
        mast(img, 31, 2, 30, pal); sail_square(img, 32, 4, 20, 9, f); flag(img, 31, 0, f, 'red', 6, 3)
    if which == 'up_front':
        sh = (PX >= x0 + 2) & (PX <= x1 - 2) & (PY >= y - 4) & (PY < y); put(img, sh, hx('d8c49a')); put(img, sh & (XX % 4 == 0), hx(pal[2])); outline(img, sh)

def turtle_side(img, hull, gx, kx, pal, f, t):
    ports = hull & (PY >= gx + 5) & (PY < gx + 8) & ((XX - 8) % 8 < 3) & (XX > t['xs'] + 6) & (XX < t['xb'] - 12); put(img, ports, 'blk')
    # 귀갑(등판) 가장자리: 뱃전 위 7px, 육각 무늬 + 쇠못
    m = (PX >= t['xs'] + 3) & (PX <= t['xb'] - 9) & (PY >= gx - 7) & (PY < gx)
    put(img, m, 'teal2'); put(img, m & (((XX + (YY // 3) * 2) % 6) == 0), 'st3'); put(img, m & (YY % 3 == 0), 'st3')
    put(img, m & (PY < gx - 6), 'teal')
    spk = (PY >= gx - 9) & (PY < gx - 7) & (XX % 4 == 1) & (PX >= t['xs'] + 4) & (PX <= t['xb'] - 10); put(img, spk, 'sthi'); put(img, spk & (YY % 2 == 0), 'st')
    outline(img, m)
    # 용머리(뱃머리)
    hx0 = t['xb'] - 9; head = (np.hypot((PX - hx0 - 3) / 5.5, (PY - (gx - 4)) / 4.2) < 1) & (PX >= hx0 - 1)
    put(img, head, 'gold'); put(img, head & (PY > gx - 3), 'gold2')
    jaw = head & (PY > gx - 3) & (PX > hx0 + 4); put(img, jaw, 'red')
    put(img, (XX == hx0 + 3) & (YY == np.floor(gx[0, 0] * 0 + gx[int(gx.shape[0] / 2), hx0 + 3] - 6).astype(int)), 'blk')
    outline(img, head)
    smoke = [(hx0 + 9, -7), (hx0 + 11, -9), (hx0 + 12, -11)]
    for i, (sx, sy) in enumerate(smoke):
        if (i + f) % 3 != 2:
            yy = int(gx[0, min(F - 1, sx)] + sy) - (f % 2)
            if 0 <= yy < F and 0 <= sx < F: img[yy, sx] = P['st']
def turtle_back(img, gx, gf, pal, f, t):
    # 등판 지붕 뒷부분(유닛 뒤): 낮은 돔 + 육각 무늬 + 쇠못, 낮춘 돛대
    dome = (np.hypot((PX - 30) / 26, (PY - 40) / 8) < 1) & (PY < 40)
    put(img, dome, 'teal2'); put(img, dome & (((XX + (YY // 3) * 2) % 6) == 0), 'st3'); put(img, dome & (YY % 3 == 0), 'st3'); put(img, dome & (YY < 34) & (XX < 30), 'teal')
    spk = dome & (YY % 3 == 1) & (XX % 4 == 1); put(img, spk, 'sthi')
    outline(img, dome)
    mast(img, 20, 10, 34, pal); sail_square(img, 21, 12, 26, 6, f, cols=('cloth', 'cloth2', 'cloth3'))
    flag(img, 20, 6, f, 'red', 6, 3)
def turtle_fb(img, which, x0, x1, y, pal, f, t, m=None):
    if which == 'down_back':
        dome = (np.hypot((PX - 32) / 21, (PY - 34) / 13) < 1) & (PY < 44)
        put(img, dome, 'teal2'); put(img, dome & (((XX + (YY // 3) * 2) % 6) == 0), 'st3'); put(img, dome & (YY % 3 == 0), 'st3'); put(img, dome & (XX < 30) & (YY < 32), 'teal')
        put(img, dome & (YY % 3 == 1) & (XX % 4 == 1), 'sthi'); outline(img, dome)
    if which == 'down_front':  # 정면 용머리
        head = (np.hypot((PX - 32) / 6, (PY - 50) / 5) < 1)
        put(img, head, 'gold'); put(img, head & (PY > 51), 'gold2'); put(img, head & (PY > 52) & (np.abs(PX - 32) < 3), 'red')
        put(img, (YY == 48) & ((XX == 29) | (XX == 35)), 'blk'); outline(img, head)
        for i in range(3):
            if (i + f) % 3 != 2: img[42 - i * 2 - (f % 2), 32 + (i % 2)] = P['st']
    if which == 'up_back':
        dome = (np.hypot((PX - 32) / 18, (PY - 30) / 15) < 1) & (PY >= 16)
        put(img, dome, 'teal2'); put(img, dome & (((XX + (YY // 3) * 2) % 6) == 0), 'st3'); put(img, dome & (YY % 3 == 0), 'st3'); put(img, dome & (YY % 3 == 1) & (XX % 4 == 1), 'sthi'); outline(img, dome)
        head = (np.hypot((PX - 32) / 4, (PY - 11) / 3.5) < 1); put(img, head, 'gold'); outline(img, head)
    if which == 'up_front':
        sh = (PX >= x0 + 2) & (PX <= x1 - 2) & (PY >= y - 5) & (PY < y); put(img, sh, 'teal2'); put(img, sh & (XX % 4 == 1) & (YY == y - 5), 'sthi'); put(img, sh & (YY % 3 == 0), 'st3'); outline(img, sh)

def seki_side(img, hull, gx, kx, pal, f, t):
    m = shields(img, hull, gx, t['xs'] + 4, t['xb'] - 10, 5, (hx('e8d2a8'), hx('2a2a2e'), hx('f4e6c8')), h=7, ports=True)
    put(img, hull & (np.abs(PY - (gx + 5)) < 0.6), hx(pal[3]))
    # 긴 이물 기둥
    xb = t['xb']; put(img, (XX >= xb - 3) & (XX <= xb + 1) & (YY == np.clip(int(gx[0, min(F - 1, xb - 2)]) - 2, 0, F - 1)), hx(pal[3]))
def seki_back(img, gx, gf, pal, f, t):
    mast(img, 30, 4, 40, pal)
    sail_square(img, 31, 6, 26, 9, f, cols=('white', 'cloth', 'cloth2'), vertical_seams=True)
    flag(img, 30, 0, f, 'white', 6, 6)
def seki_fb(img, which, x0, x1, y, pal, f, t, m=None):
    cols = (hx('e8d2a8'), hx('2a2a2e'), hx('f4e6c8'))
    if which in ('down_front', 'up_front'):
        sh = (PX >= x0 + 2) & (PX <= x1 - 2) & (PY >= y - 6) & (PY < y)
        put(img, sh, cols[0]); put(img, sh & ((XX - x0) % 5 == 0), cols[1]); put(img, sh & (PY < y - 5), cols[2]); put(img, sh & ((XX - x0) % 5 == 2) & (PY >= y - 4) & (PY < y - 2), 'blk'); outline(img, sh)
    if which == 'down_back': flag(img, 50, 4, f, 'white', 5, 6)
    if which == 'up_back': mast(img, 31, 2, 30, pal); sail_square(img, 32, 4, 20, 9, f, cols=('white', 'cloth', 'cloth2'), vertical_seams=True)

def ataka_side(img, hull, gx, kx, pal, f, t):
    m = shields(img, hull, gx, t['xs'] + 2, t['xb'] - 5, 6, (hx('2e2e32'), hx('c8a060'), hx('4a4a50')), h=9, ports=True)
    put(img, hull & (np.abs(PY - (gx + 6)) < 0.6), 'gold2')
def ataka_back(img, gx, gf, pal, f, t):
    # 2층 망루(흰 벽 + 검은 지붕), 고물 쪽
    for (x0, x1, y0, y1) in [(5, 24, 24, 36), (8, 21, 14, 23)]:
        wall = (XX >= x0) & (XX <= x1) & (YY >= y0 + 3) & (YY <= y1); put(img, wall, 'white'); put(img, wall & (XX % 4 == 0), 'cloth2'); put(img, wall & (YY == y1), 'cloth3')
        put(img, wall & (YY >= y0 + 5) & (YY <= y0 + 6) & (XX % 4 == 2), 'blk')
        roof = (YY >= y0) & (YY <= y0 + 2) & (XX >= x0 - 2) & (XX <= x1 + 2); put(img, roof, 'st3'); put(img, roof & (YY == y0), 'st2'); outline(img, roof | wall)
    mast(img, 40, 6, 40, pal); sail_square(img, 41, 8, 24, 7, f, cols=('white', 'cloth', 'cloth2'), vertical_seams=True)
    flag(img, 14, 6, f, 'white', 5, 6)
def ataka_fb(img, which, x0, x1, y, pal, f, t, m=None):
    if which in ('down_front', 'up_front'):
        sh = (PX >= x0 + 1) & (PX <= x1 - 1) & (PY >= y - 8) & (PY < y)
        put(img, sh, hx('2e2e32')); put(img, sh & ((XX - x0) % 6 == 0), hx('c8a060')); put(img, sh & (PY < y - 7), hx('4a4a50')); put(img, sh & ((XX - x0) % 6 == 3) & (PY >= y - 6) & (PY < y - 4), 'blk'); outline(img, sh)
    if which == 'down_back':
        for (xa, xb_, y0, y1) in [(12, 52, 14, 24)]:
            wall = (XX >= xa) & (XX <= xb_) & (YY >= y0 + 3) & (YY <= y1); put(img, wall, 'white'); put(img, wall & (XX % 4 == 0), 'cloth2')
            roof = (YY >= y0) & (YY <= y0 + 2) & (XX >= xa - 2) & (XX <= xb_ + 2); put(img, roof, 'st3'); outline(img, roof | wall)
    if which == 'up_back': mast(img, 31, 2, 28, pal); sail_square(img, 32, 4, 18, 8, f, cols=('white', 'cloth', 'cloth2'), vertical_seams=True)

def galley_side(img, hull, gx, kx, pal, f, t):
    band = hull & (PY >= gx + 3) & (PY < gx + 6); put(img, band, 'red'); put(img, band & (PY < gx + 4), 'gold')
    # 노 5개: 노구멍에서 물까지 비스듬히, 프레임마다 각도 변화
    ang = [0, 2, 3, 1][f]
    for i in range(5):
        x0 = t['xs'] + 12 + i * 8; y0 = int(gx[0, x0] + 7)
        for s in range(0, 12):
            xx = x0 - 4 + ang + int(s * (0.2 + 0.1 * (ang - 1.5) / 1.5) * -2) + s // 2; yy = y0 + s
            if 0 <= xx < F and yy <= WL + 1: img[yy, xx] = hx('c8a070') if s < 10 else P['foam']
        img[y0, x0] = P['blk']
def galley_back(img, gx, gf, pal, f, t):
    mast(img, 34, 2, 40, pal); sail_lateen(img, 35, 4, 32, 22, f, right=False)
    flag(img, 34, 0, f, 'red', 6, 3)
def galley_fb(img, which, x0, x1, y, pal, f, t, m=None):
    ang = [0, 2, 3, 1][f]
    if which in ('down_front', 'up_front'):
        band = (m if m is not None else np.zeros((F, F), bool)) & (PY >= y + 3) & (PY < y + 5); put(img, band, 'red'); put(img, band & (PY < y + 4), 'gold')
        for i in range(3):  # 양쪽 노
            yy0 = 36 + i * 6 + (ang % 2)
            for s in range(7):
                for side in (-1, 1):
                    xx = 32 + side * (21 + s); yy = yy0 + s // 2 + ang // 2
                    if 0 <= xx < F and yy < F: img[yy, xx] = hx('c8a070') if s < 6 else P['foam']
    if which == 'down_back': mast(img, 31, 6, 30, pal); flag(img, 31, 2, f, 'red', 6, 3)
    if which == 'up_back': mast(img, 31, 2, 30, pal); sail_lateen(img, 32, 4, 24, 14, f, right=True)

def junk_side(img, hull, gx, kx, pal, f, t):
    put(img, hull & (np.abs(PY - (gx + 4)) < 0.6), 'gold')
    # 뱃머리 눈
    xb = t['xb']; ex = xb - 9; ey = int(gx[0, ex] + 4)
    eye = np.hypot(PX - ex - 0.5, PY - ey - 0.5) < 2.6; put(img, eye, 'white'); put(img, np.hypot(PX - ex - 1, PY - ey - 0.5) < 1.2, 'blk'); outline(img, eye, 'ln')
def junk_back(img, gx, gf, pal, f, t):
    # 높은 고물 누각 + 대나무 살 돛(적갈색)
    cast = (XX >= 4) & (XX <= 17) & (YY >= 24) & (YY <= 38); put(img, cast, hx(pal[1])); put(img, cast & (XX % 3 == 0), hx(pal[2])); put(img, cast & (YY <= 26), 'gold2'); outline(img, cast)
    mast(img, 28, 2, 40, pal); sail_square(img, 29, 4, 26, 9, f, cols=('d3966c', 'b8784a', '7e4a2a'), batten='541400')
    flag(img, 28, 0, f, 'red', 7, 4)
def junk_fb(img, which, x0, x1, y, pal, f, t, m=None):
    if which == 'down_front':
        for ex in (24, 40):
            eye = np.hypot(PX - ex, PY - 51) < 2.6; put(img, eye, 'white'); put(img, np.hypot(PX - ex, PY - 51) < 1.2, 'blk')
        put(img, (m if m is not None else False) & (np.abs(PY - (y + 4)) < 0.6), 'gold')
    if which == 'down_back':
        cast = (XX >= 12) & (XX <= 52) & (YY >= 12) & (YY <= 24); put(img, cast, hx(pal[1])); put(img, cast & (XX % 3 == 0), hx(pal[2])); put(img, cast & (YY <= 14), 'gold2'); outline(img, cast)
        flag(img, 52, 0, f, 'red', 6, 4)
    if which == 'up_back': mast(img, 31, 2, 30, pal); sail_square(img, 32, 4, 22, 10, f, cols=('d3966c', 'b8784a', '7e4a2a'), batten='541400')
    if which == 'up_front':
        cast = (PX >= x0 + 1) & (PX <= x1 - 1) & (PY >= y - 6) & (PY < y); put(img, cast, hx(pal[1])); put(img, cast & (YY <= y - 5), 'gold2'); put(img, cast & (XX % 3 == 0), hx(pal[2])); outline(img, cast)

TYPES = {
    'default': dict(label='기본형 거룻배', culture='공용', wood='natural', xs=6, xb=58, deck=46, stern_rise=3, bow_rise=6, deck_depth=6, beam=18, stern_y=26, bow_y=14,
                    side_deco=boat_side, back_deco=boat_back, fb_deco=boat_fb),
    'korea_panokseon': dict(label='판옥선', culture='korea', wood='korea', xs=2, xb=61, deck=46, stern_rise=4, bow_rise=4, deck_depth=8, beam=22, bow_len=8, bow_pow=1.2,
                            side_deco=pan_side, back_deco=pan_back, fb_deco=pan_fb, verify='판옥 누각 형태·돛 색·깃발 색은 고증 확인 필요'),
    'korea_geobukseon': dict(label='거북선(이순신 전용 후보)', culture='korea', wood='turtle', xs=2, xb=59, deck=47, stern_rise=3, bow_rise=3, deck_depth=8, beam=22, bow_len=8, bow_pow=1.2,
                             side_deco=turtle_side, back_deco=turtle_back, fb_deco=turtle_fb, verify='등판 철갑·쇠못·용머리 연기 표현은 사료 해석이 갈림. 유닛 상체가 보여야 해 등판 지붕을 낮게 단순화함'),
    'japan_sekibune': dict(label='세키부네', culture='japan', wood='japan_light', xs=3, xb=62, deck=46, stern_rise=3, bow_rise=8, deck_depth=6, beam=18, bow_len=18, bow_pow=1.8,
                           side_deco=seki_side, back_deco=seki_back, fb_deco=seki_fb, verify='방패판 색·돛 이음 방향 고증 확인 필요(가문 문장은 넣지 않음)'),
    'japan_atakebune': dict(label='아타케부네', culture='japan', wood='black', xs=2, xb=61, deck=47, stern_rise=2, bow_rise=3, deck_depth=8, beam=23, bow_len=7, bow_pow=1.1,
                            side_deco=ataka_side, back_deco=ataka_back, fb_deco=ataka_fb, verify='흑칠 선체·망루 층수 단순화'),
    'west_galley': dict(label='서양 갤리', culture='europe', wood='west', xs=2, xb=62, deck=46, stern_rise=7, bow_rise=4, deck_depth=6, beam=19, bow_len=14,
                        side_deco=galley_side, back_deco=galley_back, fb_deco=galley_fb, verify='시대(16세기 지중해 갤리)·삼각돛 조합 확인'),
    'china_junk': dict(label='중국 전선(복선형)', culture='china', wood='china', xs=3, xb=61, deck=46, stern_rise=9, bow_rise=5, deck_depth=7, beam=21, bow_len=10, mid_shift=4,
                       side_deco=junk_side, back_deco=junk_back, fb_deco=junk_fb, verify='명 수군 전선 형식(복선/광선) 중 복선 근사, 뱃머리 눈·돛 색 확인'),
}

def render(t, layer, d, f):
    if d in ('left', 'right'):
        img = side_back(t, f) if layer == 'back' else side_front(t, f)
        return img[:, ::-1].copy() if d == 'left' else img
    if d == 'down': return down_back(t, f) if layer == 'back' else down_front(t, f)
    return up_back(t, f) if layer == 'back' else up_front(t, f)

def wake(d, f):
    """배 아래 물결(바다 타일 위, 유닛보다 아래). 흰 거품 줄 + 밝은 물빛, 투명 배경"""
    img = blank()
    if d in ('left', 'right'):
        for i in range(3):  # 고물 뒤로 퍼지는 물결
            r = 4 + i * 6 + f * 1.5
            arc = (np.abs(np.hypot((PX - 8) / 1.0, (PY - 61) * 2.4) - r) < 0.7) & (PX < 8) & (PY > 56)
            put(img, arc & ((XX + i) % 3 != 0), 'foam' if i == 0 else 'foam2')
        band = (YY >= 59) & (YY <= 63) & (XX >= 4) & (XX <= 60); put(img, band & ((XX + YY * 2 + f) % 6 == 0), 'w_light')
        ring = (np.abs(np.hypot((PX - 32) / 30, (PY - 61) / 3.2) - 1) < 0.06); put(img, ring & ((XX + f) % 4 != 0), 'w_light')
        if d == 'left': img = img[:, ::-1].copy()
    else:
        ring = (np.abs(np.hypot((PX - 32) / 24, (PY - 60) / 4) - 1 - 0.05 * f) < 0.07); put(img, ring & ((XX + f) % 4 != 0), 'w_light')
        tail_y = 22 if d == 'down' else 63
        if d == 'down':
            for i in range(2):
                m = (np.abs(np.abs(PX - 32) - (8 + i * 6 + f)) < 0.8) & (PY < 30) & (PY > 18 - i * 4); put(img, m & ((YY + i) % 3 != 0), 'foam2')
        else:
            for i in range(2):
                m = (np.abs(np.abs(PX - 32) - (6 + i * 5 + f)) < 0.8) & (PY > 56); put(img, m & ((YY + i) % 2 == 0), 'foam')
    return img

def splash(f):
    """물보라 6프레임(32x32, 앵커 하단 3/4): 물기둥 솟음 -> 물방울 흩어짐 -> 고리 퍼짐"""
    img = np.zeros((32, 32, 4), np.uint8)
    yy, xx = np.mgrid[0:32, 0:32]
    r = [3, 5, 7, 9, 11, 12][f]
    ring = np.abs(np.hypot(xx + 0.5 - 16, (yy + 0.5 - 25) * 2.4) - r) < 1.1
    img[ring & ((xx + yy) % (1 + f // 2) == 0)] = P['foam'] if f < 3 else P['foam2'] if f < 5 else P['w_light']
    inner = (np.hypot(xx + 0.5 - 16, (yy + 0.5 - 25) * 2.4) < r - 1) & ((xx + yy) % 2 == 0); img[inner & (f < 4)] = P['w_light']
    h = [5, 11, 13, 9, 3, 0][f]  # 물기둥 높이
    if h:
        col = (np.abs(xx + 0.5 - 16) <= 2.2 - (yy < 25 - h + 3) * 1.0) & (yy >= 25 - h) & (yy <= 25)
        img[col] = P['foam']; img[col & (xx >= 17)] = P['foam2']
    for i, (vx, vy) in enumerate([(-3.2, -3.4), (3.0, -3.8), (-5.0, -2.0), (5.2, -2.2), (-1.4, -4.6), (1.6, -4.2)]):
        t = f - 1
        if 0 <= t <= 3:
            x = int(16 + vx * t * 1.1); y = int(22 + vy * t * 1.2 + 1.3 * t * t)
            if 0 <= x < 31 and 0 <= y < 31:
                img[y, x] = P['foam']; img[y + 1, x] = P['foam2']; img[y, x + 1] = P['foam2'] if t < 2 else img[y, x + 1]
    return img

def sheet(fn):
    s = np.zeros((F * 4, F * NF, 4), np.uint8)
    for r, d in enumerate(DIRS):
        for f in range(NF): s[r * F:(r + 1) * F, f * F:(f + 1) * F] = fn(d, f)
    return s
def save(arr, path): Image.fromarray(arr, 'RGBA').save(path, optimize=True)

out_files = {}
for name, t in TYPES.items():
    for layer in ('back', 'front'):
        arr = sheet(lambda d, f: render(t, layer, d, f)); p = f'{OUT}/ship_{name}_{layer}.png'; save(arr, p); out_files[f'{name}_{layer}'] = p
save(sheet(wake), f'{OUT}/ship_wake.png')
save(np.concatenate([splash(f) for f in range(6)], 1), f'{OUT}/ship_splash.png')

# ------------------------------------------------------------------ 점검 미리보기: 바다 타일(32px)을 2배 정수 확대 = 64px 칸 1개, 유닛 64x64 를 그대로 겹침(유닛 텍셀 밀도와 동일)
src = np.array(Image.open('public/assets/third_party/unity_tilemap/TileMap.png').convert('RGBA'))
sea = src[0:32, 0:32].repeat(2, 0).repeat(2, 1)
def comp(*layers):
    o = sea.copy().astype(float)
    for L in layers:
        a = L[..., 3:4] / 255.0; o[..., :3] = L[..., :3] * a + o[..., :3] * (1 - a)
    return o.astype(np.uint8)
units = ['archer_ally', 'cavalry_ally', 'heavy_ally', 'mage_ally']
usheets = {u: np.array(Image.open(f'public/assets/sprites/64/{u}_sheet.png').convert('RGBA')) for u in units}
wk = sheet(wake)
rows = []
for ti, (name, t) in enumerate(TYPES.items()):
    bk = sheet(lambda d, f: render(t, 'back', d, f)); fr = sheet(lambda d, f: render(t, 'front', d, f))
    cells = []
    for r, d in enumerate(DIRS):
        u = usheets[units[(ti + r) % len(units)]][r * F:(r + 1) * F, F:2 * F]
        cells.append(comp(wk[r * F:(r + 1) * F, 0:F], bk[r * F:(r + 1) * F, 0:F], u, fr[r * F:(r + 1) * F, 0:F]))
    for r, d in enumerate(DIRS):  # 유닛 없는 배만(형태 점검)
        cells.append(comp(wk[r * F:(r + 1) * F, F:2 * F], bk[r * F:(r + 1) * F, F:2 * F], fr[r * F:(r + 1) * F, F:2 * F]))
    rows.append(np.concatenate(cells, 1))
pv = np.concatenate(rows, 0)
save(pv, f'{OUT}/preview_ships_x1.png')
Image.fromarray(pv).resize((pv.shape[1] * 2, pv.shape[0] * 2), Image.NEAREST).save(f'{OUT}/preview_ships_x2.png', optimize=True)
# 애니 GIF(판옥선·거북선 오른쪽, 2배)
frames = []
for f in range(NF):
    cs = []
    for name in ('korea_panokseon', 'korea_geobukseon', 'west_galley'):
        t = TYPES[name]; u = usheets['archer_ally'][2 * F:3 * F, F:2 * F]
        cs.append(comp(wake('right', f), render(t, 'back', 'right', f), u, render(t, 'front', 'right', f)))
    frames.append(Image.fromarray(np.concatenate(cs, 1)).resize((F * 3 * 3, F * 3), Image.NEAREST))
frames[0].save(f'{OUT}/preview_ships_anim.gif', save_all=True, append_images=frames[1:], duration=250, loop=0)

spec = {
    'version': 1, 'date': '2026-11-01', 'key_prefix': 'ship_overlay', 'source': 'generated(procedural) — 이미지 생성 모델 호출 0회',
    'frame': {'w': F, 'h': F, 'cols': NF, 'rows': 4, 'row_order': DIRS, 'row_note': 'assets.js SHEET_ROW 와 동일(down 0, left 1, right 2, up 3)', 'fps_hint': 4,
              'anim': '열 = 애니 프레임 0..3(돛 부풂·깃발·노·흘수선 거품). 선체 자체는 움직이지 않음(유닛과 어긋남 방지)'},
    'layers': {'wake': '바다 타일 위, 유닛 컨테이너 맨 아래(그림자 대신)', 'back': '유닛 몸통 바로 뒤', 'front': '유닛 몸통 바로 앞(HP 바·배지·오라 링보다는 아래)'},
    'anchor': {'origin': [0.5, 0.5], 'note': '유닛 body 와 같은 원점·같은 표시 크기(setDisplaySize(TILE,TILE)). 오프셋 0. 흘수선 y=62/64'},
    'types': {k: {'label': v['label'], 'culture': v['culture'], 'back': f'/assets/sprites/ship_overlay/ship_{k}_back.png', 'front': f'/assets/sprites/ship_overlay/ship_{k}_front.png', 'verify': v.get('verify')} for k, v in TYPES.items()},
    'shared': {'wake': '/assets/sprites/ship_overlay/ship_wake.png', 'splash': {'file': '/assets/sprites/ship_overlay/ship_splash.png', 'frame': [32, 32], 'frames': 6, 'fps_hint': 12, 'anchor': [0.5, 0.75], 'loop': False}},
}
json.dump(spec, open(f'{OUT}/ship_spec.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ok', len(out_files))
