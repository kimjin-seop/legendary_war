# 뽑기(소집) 화면 에셋 후처리 + 절차 생성(2026-11-03, 안아트-2)
#   raw JPEG(gacha_gen.mjs) -> 마젠타 키·디스필 -> 분할 -> PNG
#   절차 생성(모델 호출 없음): 소환진 3층, 등급별 빛줄기·오라 시트, 카드 글로우, 파티클 시트, 섬광, 광선, 배너 배경, 인장 파편
# 실행(API 호출 없음, 저장소 루트): python docker/gemini/gacha_pp.py [--proc-only]
# 의존: pillow, numpy(pip 공식 레지스트리). 산출 = public/assets/gacha_ui/, 조각 = public/assets/gacha_ui/manifest_fragment.json
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# 아래 키 처리 함수는 result_pp.py 에서 복사(그 파일은 import 시 결과 화면 전체를 다시 쓰므로 import 금지)
def key_magenta(rgb, grow=3):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    strict = (r > 150) & (b > 150) & (g < 120) & (r - g > 100) & (b - g > 100)
    loose = (r - g > 50) & (b - g > 50)
    for _ in range(grow):
        n = np.zeros_like(strict)
        n[1:] |= strict[:-1]; n[:-1] |= strict[1:]; n[:, 1:] |= strict[:, :-1]; n[:, :-1] |= strict[:, 1:]
        strict = strict | (n & loose)
    a = np.where(strict, 0, 255).astype(np.int32)
    # 경계 반투명: 마젠타와의 혼합 비율로 알파 추정(가장자리 1~2px 만)
    edge = np.zeros_like(strict)
    edge[1:] |= strict[:-1]; edge[:-1] |= strict[1:]; edge[:, 1:] |= strict[:, :-1]; edge[:, :-1] |= strict[:, 1:]
    edge &= ~strict
    m = np.clip((np.minimum(r, b) - g) / 255.0, 0, 1)
    a = np.where(edge, (255 * (1 - m * 0.9)).astype(np.int32), a)
    # 디스필: 남은 마젠타 기 제거
    spill = np.clip(np.minimum(r, b) - g - 20, 0, None)
    out = rgb.copy()
    out[..., 0] = r - spill; out[..., 2] = b - spill
    rgba = np.dstack([np.clip(out, 0, 255), a]).astype(np.uint8)
    return rgba


def erode(rgba, n=1):
    a = rgba[..., 3] > 0
    for _ in range(n):
        k = a.copy()
        k[1:] &= a[:-1]; k[:-1] &= a[1:]; k[:, 1:] &= a[:, :-1]; k[:, :-1] &= a[:, 1:]
        a = k
    rgba = rgba.copy(); rgba[..., 3] = np.where(a, rgba[..., 3], 0)
    return rgba


def drop_specks(rgba, min_area):
    from collections import deque
    a = rgba[..., 3] > 32
    h, w = a.shape
    lab = np.zeros((h, w), np.int32); cur = 0; keep = []
    ys, xs = np.nonzero(a)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        cur += 1; q = deque([(y0, x0)]); lab[y0, x0] = cur; cnt = 0
        while q:
            y, x = q.popleft(); cnt += 1
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < h and 0 <= xx < w and a[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = cur; q.append((yy, xx))
        if cnt >= min_area:
            keep.append(cur)
    mask = np.isin(lab, keep)
    rgba = rgba.copy(); rgba[..., 3] = np.where(mask, rgba[..., 3], 0)
    return rgba


def lum_alpha(rgb, floor=14, gamma=1.0):
    # 검정 배경 이펙트 → 비사전곱 RGBA(일반 블렌드로도 같은 모양). 바닥 잡음(JPEG) 제거
    mx = rgb.max(axis=2).astype(np.float32)
    a = np.clip((mx - floor) / (255 - floor), 0, 1) ** gamma
    col = np.where(mx[..., None] > 0, rgb * (255.0 / np.maximum(mx, 1))[..., None], 0)
    return np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)


def bbox(rgba, thr=40):
    ys, xs = np.nonzero(rgba[..., 3] > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def trim(rgba, pad=0):
    x0, y0, x1, y1 = bbox(rgba)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    return rgba[y0:y1 + pad, x0:x1 + pad]


def split(rgba, axis, n, thr=40):
    # 빈 열/행으로 구분된 덩어리 중 큰 것 n개(위치 순)
    occ = (rgba[..., 3] > thr).sum(axis=0 if axis == 'x' else 1) > 1
    segs = []; s = None
    for i, v in enumerate(list(occ) + [False]):
        if v and s is None: s = i
        if not v and s is not None: segs.append((s, i)); s = None
    segs = sorted(sorted(segs, key=lambda t: t[1] - t[0], reverse=True)[:n])
    return [trim(rgba[:, a:b] if axis == 'x' else rgba[a:b, :]) for a, b in segs]


ROOT = 'public/assets/gacha_ui'
RAW = f'{ROOT}/raw/gacha'
os.makedirs(f'{ROOT}/preview', exist_ok=True)
RAR = {  # gacha_style.mjs GACHA_RARITY / rarity.js 동기화
    'c': {'base': (0x8B, 0x97, 0xA8), 'glow': (0xD6, 0xDE, 0xE8), 'core': (255, 255, 255)},
    'b': {'base': (0x2F, 0xB5, 0xA6), 'glow': (0x8F, 0xF2, 0xE4), 'core': (242, 255, 252)},
    'a': {'base': (0xB0, 0x6A, 0xD8), 'glow': (0xE2, 0xB8, 0xFF), 'core': (255, 246, 255)},
    's': {'base': (0xF0, 0xB2, 0x3C), 'glow': (0xFF, 0xE3, 0x9A), 'core': (255, 253, 240)},
}
ITEMS = []
FX_PREFIX = ('gacha.beam.', 'gacha.aura.', 'gacha.pop.', 'gacha.halo.', 'gacha.cardglow.', 'gacha.flash', 'gacha.rays', 'gacha.particle', 'gacha.glyph', 'gacha.seal', 'gacha.book.', 'gacha.circle.', 'gacha.mask.emerge', 'gacha.badge.new')


def scope_of(key):
    # gacha_ui = 뽑기 메인 화면(탭 진입), gacha_fx = 소환 연출(뽑기 버튼 누른 직후 ensureScope, 등급별 시트는 filter 로 필요한 등급만)
    return 'gacha_fx' if key.startswith(FX_PREFIX) else 'gacha_ui'
QA = {}


def save(img, key, path, typ, display=None, blend='normal', note='', extra=None, qa='pass'):
    p = f'{ROOT}/{path}'
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p, optimize=True)
    it = {'key': key, 'path': f'assets/gacha_ui/{path}', 'type': typ, 'size': [img.width, img.height], 'scope': scope_of(key),
          'alpha': True, 'blend': blend, 'scale': '@2x', 'display': display or [img.width // 2, img.height // 2], 'note': note, 'qa': qa, 'verify': False}
    if extra:
        it.update(extra)
    ITEMS.append(it)
    return img


def rgba_from(col_rgb, alpha):
    h, w = alpha.shape
    out = np.zeros((h, w, 4), np.float32)
    out[..., :3] = col_rgb
    out[..., 3] = np.clip(alpha, 0, 1) * 255
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')


def grad_col(t, stops):
    # t(0..1 배열) -> stops [(pos,(r,g,b))] 보간
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), np.float32)
    for (p0, c0), (p1, c1) in zip(stops[:-1], stops[1:]):
        m = (t >= p0) & (t <= p1)
        k = ((t - p0) / max(p1 - p0, 1e-6))[..., None]
        out = np.where(m[..., None], np.array(c0) * (1 - k) + np.array(c1) * k, out)
    return out


# ---------- 1. 소환진(흰 선, FE setTint 로 등급 색) ----------
def circle_layers():
    S = 1024; c = S / 2
    def canvas():
        return Image.new('L', (S * 2, S * 2), 0)  # 2배 슈퍼샘플
    def done(L, blur=0):
        L = L.resize((S, S), Image.LANCZOS)
        if blur:
            L = L.filter(ImageFilter.GaussianBlur(blur))
        a = np.asarray(L).astype(np.float32) / 255
        return rgba_from((255, 255, 255), a)
    k = 2
    # 바깥 고리: 이중 원 + 눈금 72 + 큰 눈금 8 + 점 24
    L = canvas(); d = ImageDraw.Draw(L)
    for r, w in ((500, 6), (470, 3), (440, 2)):
        d.ellipse([(c - r) * k, (c - r) * k, (c + r) * k, (c + r) * k], outline=255, width=w * k)
    for i in range(72):
        a = i / 72 * math.tau; big = i % 9 == 0
        r0, r1 = (440, 500) if big else (470, 488)
        d.line([((c + r0 * math.cos(a)) * k, (c + r0 * math.sin(a)) * k), ((c + r1 * math.cos(a)) * k, (c + r1 * math.sin(a)) * k)], fill=255, width=(4 if big else 2) * k)
    for i in range(24):
        a = (i + 0.5) / 24 * math.tau; r = 455
        x, y = c + r * math.cos(a), c + r * math.sin(a)
        d.ellipse([(x - 4) * k, (y - 4) * k, (x + 4) * k, (y + 4) * k], fill=255)
    for i in range(8):  # 큰 눈금 위 마름모
        a = i / 8 * math.tau; r = 500
        x, y = c + r * math.cos(a), c + r * math.sin(a); s = 14
        d.polygon([((x + s * math.cos(a)) * k, (y + s * math.sin(a)) * k), ((x + s * math.cos(a + 1.57)) * k, (y + s * math.sin(a + 1.57)) * k),
                   ((x - s * math.cos(a)) * k, (y - s * math.sin(a)) * k), ((x - s * math.cos(a + 1.57)) * k, (y - s * math.sin(a + 1.57)) * k)], fill=255)
    outer = done(L)
    # 안쪽: 8각 별(두 사각형) + 원 2 + 별자리 점선 + 중심 원
    L = canvas(); d = ImageDraw.Draw(L)
    for r, w in ((380, 3), (240, 3), (90, 4)):
        d.ellipse([(c - r) * k, (c - r) * k, (c + r) * k, (c + r) * k], outline=255, width=w * k)
    for off in (0, math.pi / 4):
        pts = [((c + 380 * math.cos(off + i * math.pi / 2)) * k, (c + 380 * math.sin(off + i * math.pi / 2)) * k) for i in range(4)]
        d.polygon(pts, outline=255, width=3 * k)
    star = [((c + (240 if i % 2 == 0 else 120) * math.cos(i * math.pi / 8 - math.pi / 2)) * k, (c + (240 if i % 2 == 0 else 120) * math.sin(i * math.pi / 8 - math.pi / 2)) * k) for i in range(16)]
    d.polygon(star, outline=255, width=3 * k)
    rng = np.random.default_rng(7)
    for j in range(8):  # 칸마다 작은 별자리(점 3~4 + 선)
        base = j / 8 * math.tau + math.pi / 8
        pts = []
        for t in range(rng.integers(3, 5)):
            a = base + rng.uniform(-0.25, 0.25); r = rng.uniform(270, 360)
            pts.append((c + r * math.cos(a), c + r * math.sin(a)))
        d.line([(x * k, y * k) for x, y in pts], fill=170, width=2 * k)
        for x, y in pts:
            d.ellipse([(x - 6) * k, (y - 6) * k, (x + 6) * k, (y + 6) * k], fill=255)
    inner = done(L)
    # 글로우: 두 층 합친 뒤 흐림(가산용)
    both = Image.alpha_composite(outer, inner)
    a = np.asarray(both.split()[3].filter(ImageFilter.GaussianBlur(14))).astype(np.float32) / 255
    glow = rgba_from((255, 255, 255), np.clip(a * 2.2, 0, 1))
    save(outer, 'gacha.circle.outer', 'circle/circle_outer.png', 'image', [512, 512], 'add',
         '소환진 바깥 고리(흰 선). FE: setTint(등급 색), 느리게 시계방향 회전, 바닥 원근은 scaleY 0.34', extra={'tintable': True})
    save(inner, 'gacha.circle.inner', 'circle/circle_inner.png', 'image', [512, 512], 'add',
         '소환진 안쪽 별·별자리(흰 선). 바깥과 반대 방향 회전', extra={'tintable': True})
    save(glow, 'gacha.circle.glow', 'circle/circle_glow.png', 'image', [512, 512], 'add', '소환진 번짐(가산). 점등 시 alpha 0->1', extra={'tintable': True})


# ---------- 2. 빛줄기 시트(등급별 8프레임) ----------
def beam_sheets():
    FW, FH, N = 192, 768, 8
    yy, xx = np.mgrid[0:FH, 0:FW].astype(np.float32)
    x = (xx - FW / 2) / (FW / 2)
    v = yy / FH
    vert = np.clip(v / 0.12, 0, 1) * np.clip((1 - v) / 0.04, 0, 1) ** 0.5  # 위로 갈수록 0, 바닥 직전 유지
    vert = vert * (0.35 + 0.65 * v)  # 아래가 밝음
    rng = np.random.default_rng(3)
    streak_x = rng.uniform(-0.6, 0.6, 14); streak_w = rng.uniform(0.02, 0.06, 14); streak_p = rng.uniform(0, 1, 14); streak_l = rng.uniform(0.15, 0.35, 14)
    for r, c in RAR.items():
        sheet = Image.new('RGBA', (FW * N, FH), (0, 0, 0, 0))
        for f in range(N):
            ph = f / N
            wpulse = 1 + 0.12 * math.sin(ph * math.tau)
            core = np.exp(-(x / (0.07 * wpulse)) ** 2)
            glow = np.exp(-(x / (0.38 * wpulse)) ** 2) * 0.75
            st = np.zeros_like(x)
            for i in range(14):  # 위로 흐르는 밝은 줄
                yc = (streak_p[i] - ph * 1.0) % 1.0
                st += np.exp(-((x - streak_x[i]) / streak_w[i]) ** 2) * np.exp(-((v - yc) / streak_l[i]) ** 2) * 0.45
            a = np.clip((core + glow + st * np.exp(-(x / 0.55) ** 2)) * vert, 0, 1)
            t = np.clip(core * 1.2 + st * 0.5, 0, 1)
            col = grad_col(t, [(0, c['base']), (0.45, c['glow']), (1, c['core'])])
            arr = np.dstack([col, a * 255]).clip(0, 255).astype(np.uint8)
            sheet.alpha_composite(Image.fromarray(arr, 'RGBA'), (f * FW, 0))
        save(sheet, f'gacha.beam.{r}', f'fx/beam_{r}.png', 'spritesheet', [96, 384], 'add',
             f'등급 {r.upper()} 빛줄기(소환진 중심에서 위로). 프레임 {FW}x{FH} x{N}, 12fps 반복. origin(0.5,1) 을 소환진 중심에',
             extra={'frameWidth': FW, 'frameHeight': FH, 'frames': N, 'fps': 12, 'loop': True})


# ---------- 3. 오라(등급별 4x2 = 8프레임: 광선 회전 + 고리 확산) ----------
def aura_sheets():
    FS, N = 384, 8
    yy, xx = np.mgrid[0:FS, 0:FS].astype(np.float32)
    x = (xx - FS / 2) / (FS / 2); y = (yy - FS / 2) / (FS / 2)
    rr = np.sqrt(x * x + y * y); th = np.arctan2(y, x)
    for r, c in RAR.items():
        nray = {'c': 8, 'b': 10, 'a': 12, 's': 16}[r]
        strength = {'c': 0.55, 'b': 0.7, 'a': 0.85, 's': 1.0}[r]
        sheet = Image.new('RGBA', (FS * 4, FS * 2), (0, 0, 0, 0))
        for f in range(N):
            ph = f / N
            rays = (0.5 + 0.5 * np.cos(nray * (th + ph * math.tau / nray))) ** 6
            rays *= np.clip(1 - rr, 0, 1) ** 1.4 * np.clip(rr / 0.15, 0, 1)
            ringr = 0.25 + 0.6 * ph
            ring = np.exp(-((rr - ringr) / 0.035) ** 2) * (1 - ph) ** 1.2
            disk = np.exp(-(rr / 0.28) ** 2) * 0.9
            a = np.clip((rays * 0.8 + ring + disk) * strength, 0, 1)
            t = np.clip(disk * 1.1 + ring * 0.6, 0, 1)
            col = grad_col(t, [(0, c['base']), (0.5, c['glow']), (1, c['core'])])
            arr = np.dstack([col, a * 255]).clip(0, 255).astype(np.uint8)
            sheet.alpha_composite(Image.fromarray(arr, 'RGBA'), ((f % 4) * FS, (f // 4) * FS))
        save(sheet, f'gacha.aura.{r}', f'fx/aura_{r}.png', 'spritesheet', [384, 192], 'add',
             f'등급 {r.upper()} 리빌 오라(카드 뒤). 프레임 {FS}x{FS} 4열x2행=8, 16fps 1회 재생 후 마지막 2프레임 반복 또는 페이드',
             extra={'frameWidth': FS, 'frameHeight': FS, 'frames': N, 'fps': 16, 'loop': False})


# ---------- 4. 카드 글로우(등급별, card.* 448x600 @2x 에 맞춤) ----------
def card_glows():
    CW, CH, PAD, RAD = 448, 600, 72, 30
    W, H = CW + PAD * 2, CH + PAD * 2
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle([PAD, PAD, PAD + CW, PAD + CH], RAD, fill=255)
    inside = np.asarray(m).astype(np.float32) / 255
    for r, c in RAR.items():
        k = {'c': 0.5, 'b': 0.7, 'a': 0.85, 's': 1.0}[r]
        g1 = np.asarray(m.filter(ImageFilter.GaussianBlur(28))).astype(np.float32) / 255
        g2 = np.asarray(m.filter(ImageFilter.GaussianBlur(9))).astype(np.float32) / 255
        a = np.clip((g1 * 1.3 + g2 * 0.9) * (1 - inside * 0.92), 0, 1) * k
        t = np.clip(g2 * (1 - inside), 0, 1)
        col = grad_col(t, [(0, c['base']), (0.6, c['glow']), (1, c['core'])])
        img = Image.fromarray(np.dstack([col, a * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
        save(img, f'gacha.cardglow.{r}', f'card/cardglow_{r}.png', 'image', [W // 2, H // 2], 'add',
             f'등급 {r.upper()} 카드 외곽 글로우. 카드(224x300 표시) 중심에 같은 중심으로, 표시 {W // 2}x{H // 2}. S/A 는 alpha 0.7~1 맥동',
             extra={'cardInset': PAD // 2})


# ---------- 5. 파티클 시트(흰색, 64x64 x 8, FE 틴트) ----------
def particles():
    FS = 64; N = 8; SS = 4
    sheet = Image.new('RGBA', (FS * N, FS), (0, 0, 0, 0))
    names = ['spark4', 'spark8', 'dot', 'ember', 'ring', 'streak', 'petal', 'diamond']
    for i, n in enumerate(names):
        L = Image.new('L', (FS * SS, FS * SS), 0); d = ImageDraw.Draw(L); c = FS * SS / 2
        if n in ('spark4', 'spark8'):
            arms = 4 if n == 'spark4' else 8
            for j in range(arms):
                a = j / arms * math.tau; ln = c * (0.95 if j % 2 == 0 or arms == 4 else 0.55)
                w = c * 0.12
                d.polygon([(c + ln * math.cos(a), c + ln * math.sin(a)), (c + w * math.cos(a + 1.57), c + w * math.sin(a + 1.57)),
                           (c - w * 0.3 * math.cos(a), c - w * 0.3 * math.sin(a)), (c + w * math.cos(a - 1.57), c + w * math.sin(a - 1.57))], fill=255)
            d.ellipse([c - c * 0.16, c - c * 0.16, c + c * 0.16, c + c * 0.16], fill=255)
            blur = 3
        elif n == 'dot':
            d.ellipse([c - c * 0.5, c - c * 0.5, c + c * 0.5, c + c * 0.5], fill=255); blur = 18
        elif n == 'ember':
            d.ellipse([c - c * 0.22, c - c * 0.22, c + c * 0.22, c + c * 0.22], fill=255); blur = 8
        elif n == 'ring':
            d.ellipse([c - c * 0.8, c - c * 0.8, c + c * 0.8, c + c * 0.8], outline=255, width=int(c * 0.1)); blur = 3
        elif n == 'streak':
            d.ellipse([c - c * 0.07, c - c * 0.95, c + c * 0.07, c + c * 0.95], fill=255); blur = 4
        elif n == 'petal':
            d.ellipse([c - c * 0.28, c - c * 0.7, c + c * 0.28, c + c * 0.7], fill=255); blur = 3
        else:
            d.polygon([(c, c * 0.15), (c * 1.55, c), (c, c * 1.85), (c * 0.45, c)], fill=255); blur = 2
        L = L.filter(ImageFilter.GaussianBlur(blur)).resize((FS, FS), Image.LANCZOS)
        if n in ('spark4', 'spark8', 'ember'):  # 밝은 중심 + 번짐
            b = np.asarray(L).astype(np.float32) / 255
            halo = np.asarray(L.filter(ImageFilter.GaussianBlur(5))).astype(np.float32) / 255
            L = Image.fromarray((np.clip(b + halo * 0.6, 0, 1) * 255).astype(np.uint8))
        sheet.paste(Image.merge('RGBA', [Image.new('L', (FS, FS), 255)] * 3 + [L]), (i * FS, 0))
    save(sheet, 'gacha.particle', 'fx/particles.png', 'spritesheet', [32 * N, 32], 'add',
         '흰 파티클 8종(FE 틴트). 프레임 순서: ' + ', '.join(f'{i}={n}' for i, n in enumerate(names)),
         extra={'frameWidth': FS, 'frameHeight': FS, 'frames': N, 'frameNames': names, 'tintable': True})


# ---------- 6. 섬광·광선·배너 배경·신규 배지 ----------
def misc():
    S = 512
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    x = (xx - S / 2) / (S / 2); y = (yy - S / 2) / (S / 2); rr = np.sqrt(x * x + y * y); th = np.arctan2(y, x)
    flash = np.clip(np.exp(-(rr / 0.22) ** 2) + np.exp(-(rr / 0.6) ** 2) * 0.5, 0, 1) * np.clip((1 - rr) / 0.1, 0, 1)
    save(rgba_from((255, 255, 255), flash), 'gacha.flash', 'fx/flash.png', 'image', [256, 256], 'add', '리빌 순간 화면 섬광(흰, 틴트 가능). 0.08s 에 scale 0.5->4, alpha 1->0', extra={'tintable': True})
    rays = ((0.5 + 0.5 * np.cos(18 * th)) ** 3) * np.clip(1 - rr, 0, 1) ** 1.2 * np.clip(rr / 0.08, 0, 1)
    save(rgba_from((255, 255, 255), rays), 'gacha.rays', 'fx/rays.png', 'image', [256, 256], 'add', '최고 등급 카드 뒤 회전 광선(흰, 틴트). 회전 20s/바퀴', extra={'tintable': True})
    # 배너 배경(피처드 영웅 뒤): 1280x560 @2x, 등급 S·A
    BW, BH = 1280, 560
    yy, xx = np.mgrid[0:BH, 0:BW].astype(np.float32)
    cx, cy = BW * 0.62, BH * 0.55
    dx, dy = (xx - cx) / BW, (yy - cy) / BH
    d2 = np.sqrt(dx * dx + dy * dy); th = np.arctan2(dy, dx)
    for r in ('s', 'a', 'b'):
        c = RAR[r]
        base = grad_col(np.clip(1 - d2 * 1.6, 0, 1), [(0, (8, 14, 32)), (0.55, (16, 28, 58)), (0.85, tuple(int(v * 0.55) for v in c['base'])), (1, c['glow'])])
        ray = ((0.5 + 0.5 * np.cos(22 * th)) ** 8) * np.clip(1 - d2 * 1.3, 0, 1) * 0.35
        col = base + np.array(c['glow'], np.float32) * ray[..., None]
        vign = np.clip(1 - (np.abs((xx - BW / 2) / (BW / 2)) ** 3) * 0.45, 0, 1)
        col = col * vign[..., None]
        img = Image.fromarray(np.dstack([col, np.full((BH, BW), 255.0)]).clip(0, 255).astype(np.uint8), 'RGBA').convert('RGB')
        p = f'{ROOT}/banner/banner_bg_{r}.jpg'; os.makedirs(os.path.dirname(p), exist_ok=True); img.save(p, quality=90)
        ITEMS.append({'key': f'gacha.banner.bg.{r}', 'path': f'assets/gacha_ui/banner/banner_bg_{r}.jpg', 'type': 'image', 'size': [BW, BH], 'scope': 'gacha_ui', 'alpha': False,
                      'scale': '@2x', 'display': [640, 280], 'note': f'피처드 배너 배경(등급 {r.upper()} 빛 중심이 오른쪽 62%: 영웅 초상 자리). 둥근 마스크는 FE', 'qa': 'pass', 'verify': False})
    # 신규 배지(톱니 원형 별 배지, 글자는 FE)
    S2 = 160; SS = 4; L = Image.new('L', (S2 * SS, S2 * SS), 0); d = ImageDraw.Draw(L); c = S2 * SS / 2
    pts = [(c + (c * 0.92 if i % 2 == 0 else c * 0.78) * math.cos(i * math.pi / 14), c + (c * 0.92 if i % 2 == 0 else c * 0.78) * math.sin(i * math.pi / 14)) for i in range(28)]
    d.polygon(pts, fill=255)
    L = L.resize((S2, S2), Image.LANCZOS)
    a = np.asarray(L).astype(np.float32) / 255
    yy, xx = np.mgrid[0:S2, 0:S2].astype(np.float32); rr = np.sqrt((xx - S2 / 2) ** 2 + (yy - S2 / 2) ** 2) / (S2 / 2)
    col = grad_col(np.clip((yy / S2), 0, 1), [(0, (240, 96, 72)), (1, (150, 32, 28))])
    rim = (rr > 0.68) & (rr < 0.74)
    col = np.where(rim[..., None], np.array([243, 220, 142], np.float32), col)
    hl = np.exp(-(((xx - S2 * 0.4) / (S2 * 0.25)) ** 2 + ((yy - S2 * 0.32) / (S2 * 0.12)) ** 2)) * 60
    col = col + hl[..., None]
    save(Image.fromarray(np.dstack([col, a * 255]).clip(0, 255).astype(np.uint8), 'RGBA'), 'gacha.badge.new', 'ui/badge_new.png', 'image', [80, 80], 'normal',
         '신규 획득 배지(진홍 톱니 원 + 금 테). 글자 "NEW"/"신규"는 FE 텍스트(흰, 외곽선 #5A1A17)')


# ---------- 6b. 배너 목록·칩·NEW 리본·확률 UP 태그·초상 마스크(팀장 추가 지시: 레퍼런스 구성) ----------
def gold_rim(W, H, rad, width, sel=False):
    # 둥근 사각 금 테두리(위 밝고 아래 어두운 베벨) + 선택 시 바깥 글로우. 안쪽 투명(초상 크롭이 비쳐 보임)
    SS = 3
    outer = Image.new('L', (W * SS, H * SS), 0); ImageDraw.Draw(outer).rounded_rectangle([0, 0, W * SS - 1, H * SS - 1], rad * SS, fill=255)
    inner = Image.new('L', (W * SS, H * SS), 0); ImageDraw.Draw(inner).rounded_rectangle([width * SS, width * SS, (W - width) * SS - 1, (H - width) * SS - 1], max(1, rad - width) * SS, fill=255)
    o = np.asarray(outer.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255
    i = np.asarray(inner.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255
    ring = np.clip(o - i, 0, 1)
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32) / H
    col = grad_col(yy, [(0, (243, 220, 142)), (0.5, (217, 180, 90)), (1, (138, 106, 30))])
    # 가는 안쪽 하이라이트 선
    inner2 = Image.new('L', (W * SS, H * SS), 0); ImageDraw.Draw(inner2).rounded_rectangle([(width + 2) * SS, (width + 2) * SS, (W - width - 2) * SS - 1, (H - width - 2) * SS - 1], max(1, rad - width - 2) * SS, outline=255, width=SS)
    hl = np.asarray(inner2.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255 * 0.55
    a = np.clip(ring + hl, 0, 1)
    col = np.where(hl[..., None] > ring[..., None], np.array([243, 220, 142], np.float32), col)
    # 아래쪽 이름 띠 그라데이션(글자 가독성): 아래 34% 남흑 0 -> 0.85
    band = np.clip((yy - 0.62) / 0.38, 0, 1) * 0.85 * i
    col = np.where(band[..., None] > a[..., None], np.array([8, 12, 26], np.float32), col)
    a = np.maximum(a, band)
    img = Image.fromarray(np.dstack([col, a * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
    if sel:
        pad = 18
        big = Image.new('RGBA', (W + pad * 2, H + pad * 2), (0, 0, 0, 0))
        g = Image.new('L', (W + pad * 2, H + pad * 2), 0); ImageDraw.Draw(g).rounded_rectangle([pad, pad, pad + W, pad + H], rad, outline=255, width=6)
        g = np.asarray(g.filter(ImageFilter.GaussianBlur(9))).astype(np.float32) / 255
        big.alpha_composite(rgba_from((255, 227, 154), np.clip(g * 2.0, 0, 1)))
        big.alpha_composite(img, (pad, pad))
        return big
    return img


def banner_parts():
    # 좌측 배너 목록 항목(@2x 560x240 = 표시 280x120), 선택(+글로우), 모바일 칩(@2x 304x128 = 152x64)
    save(gold_rim(560, 240, 26, 6), 'gacha.list.frame', 'ui/list_frame.png', 'image', [280, 120], 'normal',
         '배너 목록 항목 테두리(안쪽 투명 + 아래 이름 띠 그라데이션 포함). 초상 크롭을 같은 둥근 사각(반경 13px 표시)으로 마스크해 아래에 깔고 이 테두리를 위에', extra={'radius': 13, 'inner': [3, 3, 277, 117]})
    sel = gold_rim(560, 240, 26, 8, sel=True)
    save(sel, 'gacha.list.frame.selected', 'ui/list_frame_selected.png', 'image', [sel.width // 2, sel.height // 2], 'normal',
         '선택된 배너 테두리(+바깥 금 글로우 9px 표시). 일반 프레임보다 사방 9px 큼 -> 같은 중심에 배치, 선택 항목은 scale 1.08', extra={'glowPad': 9})
    save(gold_rim(304, 128, 20, 4), 'gacha.chip.frame', 'ui/chip_frame.png', 'image', [152, 64], 'normal', '모바일 세로: 상단 가로 스크롤 배너 칩 테두리(초상 얼굴 크롭 + 이름)')
    chs = gold_rim(304, 128, 20, 5, sel=True)
    save(chs, 'gacha.chip.frame.selected', 'ui/chip_frame_selected.png', 'image', [chs.width // 2, chs.height // 2], 'normal', '모바일 칩 선택 상태(+글로우 9px)', extra={'glowPad': 9})
    # NEW 모서리 리본(왼쪽 위 대각 띠, @2x 160x160)
    S = 160; SS = 4
    L = Image.new('L', (S * SS, S * SS), 0); d = ImageDraw.Draw(L)
    d.polygon([(0, 70 * SS), (70 * SS, 0), (118 * SS, 0), (0, 118 * SS)], fill=255)
    L = L.resize((S, S), Image.LANCZOS); a = np.asarray(L).astype(np.float32) / 255
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32); diag = (xx + yy) / S
    col = grad_col(np.clip((diag - 0.43) / 0.32, 0, 1), [(0, (243, 220, 142)), (0.12, (224, 74, 58)), (0.88, (158, 43, 37)), (1, (243, 220, 142))])
    save(Image.fromarray(np.dstack([col, a * 255]).clip(0, 255).astype(np.uint8), 'RGBA'), 'gacha.ribbon.new', 'ui/ribbon_new.png', 'image', [80, 80], 'normal',
         '신규 배너 모서리 리본(항목 왼쪽 위에 맞춤). 글자 "NEW"는 FE: 회전 -45deg, 중심 (29,29) 표시 px, 흰 12px 굵게')
    # 확률 UP 태그(주황 사다리꼴 판, @2x 360x72 = 180x36). 글자 FE
    W, H = 360, 72; L = Image.new('L', (W * SS, H * SS), 0)
    ImageDraw.Draw(L).polygon([(0, 0), (W * SS, 0), ((W - 18) * SS, H * SS), (0, H * SS)], fill=255)
    L = L.resize((W, H), Image.LANCZOS); a = np.asarray(L).astype(np.float32) / 255
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32) / H
    col = grad_col(yy, [(0, (255, 190, 92)), (0.5, (236, 138, 38)), (1, (190, 92, 20))])
    col[:4] = (255, 232, 176); col[-3:] = (120, 56, 10)
    save(Image.fromarray(np.dstack([col, a * 255]).clip(0, 255).astype(np.uint8), 'RGBA'), 'gacha.tag.rateup', 'ui/tag_rateup.png', 'image', [180, 36], 'normal',
         '피처드 영웅 이름 위 "확률 UP" 태그. 글자 FE: 흰 20px 굵게, 외곽선 #6A3208 3px, 왼쪽 12px 여백')
    # 피처드 초상 마스크(가산 아님: alpha 마스크용, 흰 + 알파). 왼쪽 22%·아래 18% 페이드
    W, H = 896, 1200
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    a = np.clip(xx / (W * 0.22), 0, 1) ** 1.5 * np.clip((H - yy) / (H * 0.18), 0, 1) ** 1.2
    save(rgba_from((255, 255, 255), a), 'gacha.mask.feature', 'ui/mask_feature.png', 'image', [896, 1200], 'normal',
         '피처드 초상(portrait.* 896x1200)과 같은 크기의 알파 마스크: 왼쪽·아래를 부드럽게 지워 배경에 녹임. Phaser BitmapMask 또는 캔버스 합성(1회 합성 후 RenderTexture 캐시 권장)', extra={'scale': '@1x(초상과 1:1)'})


def emerge_mask():
    # 책에서 튀어나오는 초상용 마스크(초상 896x1200 과 1:1): 아래 30% 페이드(페이지 면에서 솟는 느낌), 위 3% 아주 약한 페이드
    W, H = 896, 1200
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32)
    a = np.clip((H - yy) / (H * 0.30), 0, 1) ** 1.4 * np.clip(yy / (H * 0.03), 0, 1)
    save(rgba_from((255, 255, 255), a), 'gacha.mask.emerge', 'ui/mask_emerge.png', 'image', [896, 1200], 'normal',
         '리빌 초상 마스크: 초상 아래쪽을 펼친 페이지 면(layout.page 아래 1/3 지점)에서 녹아 나오게. 팝 인 동안 마스크는 초상과 함께 이동', extra={'scale': '@1x(초상과 1:1)'})


# ---------- 7. 생성 조각(raw -> PNG) ----------
def raw(n):
    p = f'{RAW}/{n}.jpg'
    return np.asarray(Image.open(p).convert('RGB')).astype(np.int32) if os.path.exists(p) else None


def clean(rgb, speck=400):
    return drop_specks(erode(key_magenta(rgb), 1), speck)


def fitw(a, w):
    i = Image.fromarray(a, 'RGBA'); return i.resize((w, max(1, round(i.height * w / i.width))), Image.LANCZOS)


def fith(a, h):
    i = Image.fromarray(a, 'RGBA'); return i.resize((max(1, round(i.width * h / i.height)), h), Image.LANCZOS)


def edge_report(img):
    a = np.asarray(img).astype(np.int32)
    vis = a[..., 3] > 16
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = vis & (r - g > 60) & (b - g > 60)
    return {'opaque_px': int(vis.sum()), 'magenta_px': int(mag.sum())}


def generated():
    got = []
    s = raw('seal')
    if s is not None:
        a = trim(clean(s))
        img = fith(a, 320)
        save(img, 'gacha.seal', 'seal/seal.png', 'image', [img.width // 2, img.height // 2], 'normal',
             '카드 앞을 봉한 밀랍 인장(봉인 상태). 리빌: 흔들림 -> 금(gacha.seal.crack) -> 파편(gacha.seal.shard.*) 비산', extra={'edge': edge_report(img)})
        QA['gacha.seal'] = edge_report(img)
        seal_crack_and_shards(img)
        got.append('seal')
    b = raw('pull_buttons')
    if b is not None:
        parts = split(clean(b), 'y', 2)
        for nm, p in zip(('single', 'ten'), parts):
            img = fitw(p, 600)
            save(img, f'gacha.btn.pull.{nm}', f'ui/btn_pull_{nm}.png', 'image', [img.width // 2, img.height // 2], 'normal',
                 ('1회 뽑기 버튼(남색 칠기)' if nm == 'single' else '10연 뽑기 버튼(진홍·금, 주 버튼)') + '. 고정 비율 이미지(9-slice 아님). 눌림=scale 0.96+밝기 0.85, 비활성=채도 0·alpha 0.6(FE)',
                 extra={'edge': edge_report(img)})
            QA[f'gacha.btn.pull.{nm}'] = edge_report(img)
        got.append('pull_buttons')
    t = raw('scroll_tag')
    if t is not None:
        parts = split(clean(t), 'y', 2)
        if len(parts) == 2:
            img = fitw(parts[0], 960)
            save(img, 'gacha.scroll', 'ui/scroll.png', 'image', [img.width // 2, img.height // 2], 'normal', '두루마리 명판(배너 이름·영웅 이름). 글자 색 #3A2A10, 종이 안쪽 가로 70% 안전 영역', extra={'edge': edge_report(img)})
            img2 = fitw(parts[1], 280)
            save(img2, 'gacha.tag.discount', 'ui/tag_discount.png', 'image', [img2.width // 2, img2.height // 2], 'normal', '할인 꼬리표 리본(10연 버튼 오른쪽 위). 글자 "10% 할인"은 FE(흰, 외곽선 #5A1A17)', extra={'edge': edge_report(img2)})
            QA['gacha.scroll'] = edge_report(img); QA['gacha.tag.discount'] = edge_report(img2)
        got.append('scroll_tag')
    w = raw('war_banners')
    if w is not None:
        parts = split(clean(w), 'x', 2)
        for nm, p in zip(('l', 'r'), parts):
            img = fith(p, 900)
            save(img, f'gacha.warbanner.{nm}', f'deco/warbanner_{nm}.png', 'image', [img.width // 2, img.height // 2], 'normal', '소환진 좌우 군기 장식. 바람 흔들림은 FE(skew/sin 0.5deg)', extra={'edge': edge_report(img)})
            QA[f'gacha.warbanner.{nm}'] = edge_report(img)
        got.append('war_banners')
    book_parts(got)
    z = raw('brazier') if os.environ.get('GACHA_LEGACY') else None  # 역사책 전환으로 미등록(raw 보존)
    if z is not None:
        img = fith(trim(clean(z)), 400)
        save(img, 'gacha.brazier', 'deco/brazier.png', 'image', [img.width // 2, img.height // 2], 'normal', '청동 삼족 화로(소환진 앞 좌우). 불꽃 = gacha.particle ember/dot 를 등급 색으로 위로 방출', extra={'edge': edge_report(img)})
        QA['gacha.brazier'] = edge_report(img)
        got.append('brazier')
    h = f'{RAW}/bg_hall.jpg'
    if os.path.exists(h) and os.environ.get('GACHA_LEGACY'):  # 역사책 전환: 배경은 기존 bg.screen.gacha(서고) 재사용, 홀 배경은 미등록
        src = Image.open(h).convert('RGB')
        for w in (1920, 1280):
            im2 = src.resize((w, round(src.height * w / src.width)), Image.LANCZOS)
            p = f'{ROOT}/bg/hall_{w}.jpg'; os.makedirs(os.path.dirname(p), exist_ok=True); im2.save(p, quality=90)
        ITEMS.append({'key': 'gacha.bg.hall', 'path': 'assets/gacha_ui/bg/hall_1920.jpg', 'type': 'bg', 'size': [1920, round(src.height * 1920 / src.width)], 'scope': 'gacha_ui', 'alpha': False,
                      'variants': {'1280': 'assets/gacha_ui/bg/hall_1280.jpg'}, 'filter': 'LINEAR', 'display': 'cover', 'note': '소집 홀 배경(왼쪽 35% 목록 자리 어둡게, 오른쪽 60% 피처드 초상 자리). 기존 bg.screen.gacha 는 결과 화면·폴백으로 유지', 'qa': 'see report', 'verify': False})
        QA['gacha.bg.hall'] = {'src': 'bg_hall.jpg'}
        got.append('bg_hall')
    return got


def book_parts(got):
    bc, bo = raw('book_closed'), raw('book_open')
    if bc is None or bo is None:
        return
    OW = 1200  # 펼친 책 @2x 폭(표시 600)
    op = trim(clean(bo, 2000))
    open_img = fitw(op, OW)
    W, H = open_img.size
    A = np.asarray(open_img).astype(np.int32)
    # 페이지 영역(미색): 밝고 r>=g>=b
    r, g, b, al = A[..., 0], A[..., 1], A[..., 2], A[..., 3]
    page = (al > 200) & (r > 170) & (g > 140) & (b > 115) & (r >= g) & (g >= b - 4) & (r - b > 20) & (r - b < 85)  # 금 장식(b 낮고 r-b 큼) 제외
    cols = page.sum(axis=0)
    ys, xs = np.nonzero(page)
    ptop, pbot = int(np.percentile(ys, 0.5)), int(np.percentile(ys, 99.5))
    pl, pr = int(np.percentile(xs, 0.5)), int(np.percentile(xs, 99.5))
    spine = (pl + pr) // 2  # 접힘 = 좌우 대칭 페이지 범위의 중앙(합성 확인: 실제 골과 일치)
    save(open_img, 'gacha.book.open', 'book/book_open.png', 'image', [W // 2, H // 2], 'normal',
         '펼친 역사책(정면, 빈 페이지). 등(접힘) x = layout.spineX, 페이지 영역 = layout.page(표시 px). 빛·문양·글자는 위에 겹침',
         extra={'layout': {'spineX': spine // 2, 'page': [pl // 2, ptop // 2, pr // 2, pbot // 2]}, 'edge': edge_report(open_img)})
    QA['gacha.book.open'] = edge_report(open_img)
    # 닫힌 표지: 펼친 책 높이의 98% 로 맞춤. FE: 표지 왼쪽 끝을 spineX 에 맞춰 배치 -> 열 때 origin(0,0.5) scaleX 1->0, 이어서 표지 안쪽(cover.inner) scaleX 0->1 을 왼쪽으로
    cl = trim(clean(bc, 2000))
    cover = fith(cl, round(H * 0.98))
    save(cover, 'gacha.book.cover', 'book/book_cover.png', 'image', [cover.width // 2, cover.height // 2], 'normal',
         '닫힌 역사책 앞표지(정면). 가운데 남색 원판 = gacha.seal 자리(layout.sealCenter, 지름 sealD 표시 px). 열림 연출 축 = 표지 왼쪽 끝(책등)',
         extra={'layout': {'sealCenter': [round(cover.width * 0.47) // 2, round(cover.height * 0.475) // 2], 'sealD': round(cover.width * 0.36) // 2}, 'edge': edge_report(cover)})
    QA['gacha.book.cover'] = edge_report(cover)
    # 표지 안쪽(넘어간 표지 뒷면): 표지 실루엣 + 짙은 가죽 + 미색 면지
    ca = np.asarray(cover).astype(np.float32)
    inner = ca.copy(); inner[..., :3] = ca[..., :3] * 0.45
    m = Image.new('L', cover.size, 0); cw, ch = cover.size
    ImageDraw.Draw(m).rounded_rectangle([int(cw * 0.1), int(ch * 0.06), int(cw * 0.9), int(ch * 0.94)], 10, fill=255)
    mm = np.asarray(m.filter(ImageFilter.GaussianBlur(2))).astype(np.float32)[..., None] / 255
    inner[..., :3] = inner[..., :3] * (1 - mm) + np.array([214, 196, 150], np.float32) * mm * 0.85
    cin = Image.fromarray(inner.clip(0, 255).astype(np.uint8), 'RGBA').transpose(Image.FLIP_LEFT_RIGHT)
    save(cin, 'gacha.book.cover_inner', 'book/book_cover_inner.png', 'image', [cw // 2, ch // 2], 'normal', '넘어간 표지의 안쪽 면(좌우 반전 완료). origin(1,0.5) 을 spineX 에 두고 scaleX 0->1')
    # 페이지 넘김 시트: 오른쪽 페이지(등~오른끝) 텍스처를 등 축으로 회전(폭 cos, 그늘, 위쪽 들림). 프레임 = 펼친 책 크기 @1x(표시 크기), 3열x2행=6
    FW, FH = W // 2, H // 2
    rp = np.asarray(open_img).copy(); rp[..., 3] = np.where(page, rp[..., 3], 0); rp[:, :spine, 3] = 0
    rp_img = Image.fromarray(rp, 'RGBA').crop((spine, 0, W, H)).resize(((W - spine) // 2, FH), Image.LANCZOS)
    pw = rp_img.width; sx = spine // 2
    N = 6; sheet = Image.new('RGBA', (FW * 3, FH * 2), (0, 0, 0, 0))
    for f in range(N):
        th = (f + 0.5) / N * math.pi  # 0 ~ pi
        cw2 = abs(math.cos(th)); w2 = max(2, round(pw * cw2))
        pg = rp_img.resize((w2, FH), Image.LANCZOS)
        arr = np.asarray(pg).astype(np.float32)
        shade = 0.55 + 0.45 * cw2  # 세워질수록 어둡게
        xr = np.linspace(0, 1, w2)[None, :, None]
        arr[..., :3] *= shade * (0.85 + 0.15 * xr) if math.cos(th) > 0 else shade * (1 - 0.15 * xr)
        pg = Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA')
        lift = round(math.sin(th) * FH * 0.04)  # 넘어가는 동안 살짝 위로
        fr = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        if math.cos(th) > 0:
            fr.alpha_composite(pg, (sx, -lift if lift else 0) if False else (sx, 0))
        else:
            fr.alpha_composite(pg.transpose(Image.FLIP_LEFT_RIGHT), (sx - w2, 0))
        if lift:
            fr = fr.transform(fr.size, Image.AFFINE, (1, 0, 0, 0, 1, lift), Image.BICUBIC)
        sheet.alpha_composite(fr, ((f % 3) * FW, (f // 3) * FH))
    save(sheet, 'gacha.book.pageflip', 'book/pageflip.png', 'spritesheet', [FW * 3, FH * 2], 'normal',
         f'페이지 넘김 6프레임(오른쪽 -> 왼쪽). 프레임 {FW}x{FH} = gacha.book.open 표시 크기와 1:1, 같은 위치에 겹침. 24fps(0.25s/장), 10연은 영웅마다 1~2회 반복',
         extra={'frameWidth': FW, 'frameHeight': FH, 'frames': N, 'fps': 24, 'loop': False, 'scale': '@1x(표시 크기)'})
    # 등급별 페이지 빛(가산): 페이지 마스크를 흐리게 + 등 중심 방사광
    pm = Image.fromarray((page * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))
    pmf = np.asarray(pm).astype(np.float32) / 255
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rad = np.exp(-(((xx - spine) / (W * 0.28)) ** 2 + ((yy - (ptop + pbot) / 2) / (H * 0.42)) ** 2))
    for rk, c in RAR.items():
        a = np.clip(pmf * (0.25 + 0.75 * rad), 0, 1) * {'c': 0.55, 'b': 0.7, 'a': 0.85, 's': 1.0}[rk]
        col = grad_col(rad, [(0, c['base']), (0.6, c['glow']), (1, c['core'])])
        save(Image.fromarray(np.dstack([col, a * 255]).clip(0, 255).astype(np.uint8), 'RGBA'), f'gacha.book.pageglow.{rk}', f'book/pageglow_{rk}.png', 'image', [W // 2, H // 2], 'add',
             f'등급 {rk.upper()} 페이지 빛(gacha.book.open 위에 같은 크기·위치, 가산). 페이지 넘김 중 alpha 0->1, 리빌 직전 최대')
    got.append('book')


def glyph_particles():
    # 책에서 흩날리는 "글자 조각": 실제 문자 아님(붓획·획 조각 추상 도형), 먹/금 두 색 x 8 = 16 프레임 64x64
    FS = 64; SS = 4; rng = np.random.default_rng(21)
    sheet = Image.new('RGBA', (FS * 8, FS * 2), (0, 0, 0, 0))
    for i in range(8):
        L = Image.new('L', (FS * SS, FS * SS), 0); d = ImageDraw.Draw(L)
        for s in range(rng.integers(2, 4)):  # 획 2~3개(가로·세로·삐침)
            kind = rng.integers(0, 3)
            x0, y0 = rng.uniform(0.2, 0.5) * FS * SS, rng.uniform(0.2, 0.5) * FS * SS
            ln = rng.uniform(0.35, 0.6) * FS * SS; wd = rng.uniform(0.07, 0.11) * FS * SS
            if kind == 0: x1, y1 = x0 + ln, y0 + rng.uniform(-0.05, 0.05) * ln
            elif kind == 1: x1, y1 = x0 + rng.uniform(-0.05, 0.05) * ln, y0 + ln
            else: x1, y1 = x0 + ln * 0.7, y0 + ln * 0.7
            x1, y1 = min(x1, FS * SS * 0.88), min(y1, FS * SS * 0.88)
            d.line([(x0, y0), (x1, y1)], fill=255, width=int(wd))
            d.ellipse([x0 - wd * 0.6, y0 - wd * 0.6, x0 + wd * 0.6, y0 + wd * 0.6], fill=255)  # 붓 머리
        L = L.resize((FS, FS), Image.LANCZOS)
        for row, col in ((0, (34, 24, 18)), (1, (243, 220, 142))):
            tile = Image.merge('RGBA', [Image.new('L', (FS, FS), v) for v in col] + [L])
            if row == 1:  # 금 획은 번짐 추가(가산용)
                hal = L.filter(ImageFilter.GaussianBlur(4))
                tile = Image.merge('RGBA', [Image.new('L', (FS, FS), v) for v in col] + [Image.fromarray(np.clip(np.asarray(L).astype(np.int32) + np.asarray(hal) * 0.7, 0, 255).astype(np.uint8))])
            sheet.paste(tile, (i * FS, row * FS))
    save(sheet, 'gacha.glyph', 'fx/glyphs.png', 'spritesheet', [32 * 8, 32 * 2], 'normal',
         '책에서 솟는 글자 조각(실제 문자 아닌 붓획 추상 도형). 0~7 = 먹색(normal 블렌드), 8~15 = 금(가산, 등급 색 틴트 가능). 위로 떠오르며 회전·페이드',
         extra={'frameWidth': FS, 'frameHeight': FS, 'frames': 16})


def pop_and_halo():
    # 팝 인 충격파(등급별 8프레임 4x2, 512): 캐릭터가 책에서 튀어나올 때 초상 뒤
    FS, N = 512, 8
    yy, xx = np.mgrid[0:FS, 0:FS].astype(np.float32)
    x = (xx - FS / 2) / (FS / 2); y = (yy - FS / 2) / (FS / 2); rr = np.sqrt(x * x + y * y); th = np.arctan2(y, x)
    rng = np.random.default_rng(5); spikes = rng.uniform(0, math.tau, 14); slen = rng.uniform(0.6, 1.0, 14)
    for rk, c in RAR.items():
        sheet = Image.new('RGBA', (FS * 4, FS * 2), (0, 0, 0, 0))
        for f in range(N):
            ph = (f + 1) / N
            ring = np.exp(-((rr - 0.15 - 0.8 * ph) / (0.05 + 0.04 * ph)) ** 2) * (1 - ph) ** 0.8
            core = np.exp(-(rr / (0.5 * (1 - ph) + 0.12)) ** 2) * (1 - ph) ** 1.1
            sp = np.zeros_like(rr)
            for a0, l0 in zip(spikes, slen):
                da = np.angle(np.exp(1j * (th - a0)))
                sp += np.exp(-(da / 0.045) ** 2) * np.clip(1 - np.abs(rr - (0.2 + ph * 0.8) * l0) / 0.3, 0, 1)
            a = np.clip(ring * 1.4 + core * 1.3 + sp * (1 - ph * 0.7) * 1.4, 0, 1)
            t = np.clip(core + ring * 0.5, 0, 1)
            col = grad_col(t, [(0, c['base']), (0.5, c['glow']), (1, c['core'])])
            sheet.alpha_composite(Image.fromarray(np.dstack([col, a * 255]).clip(0, 255).astype(np.uint8), 'RGBA'), ((f % 4) * FS, (f // 4) * FS))
        save(sheet, f'gacha.pop.{rk}', f'fx/pop_{rk}.png', 'spritesheet', [FS * 2, FS], 'add',
             f'등급 {rk.upper()} 팝 인 충격파(초상이 책에서 튀어나오는 순간, 초상 중심). 프레임 {FS}x{FS} 4x2=8, 30fps 1회',
             extra={'frameWidth': FS, 'frameHeight': FS, 'frames': N, 'fps': 30, 'loop': False})
    # 초상 후광(등급별 1024, 가산): 가운데 큰 초상 뒤, 천천히 회전하는 부드러운 광선 + 원광
    S = 1024
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    x = (xx - S / 2) / (S / 2); y = (yy - S / 2) / (S / 2); rr = np.sqrt(x * x + y * y); th = np.arctan2(y, x)
    for rk, c in RAR.items():
        k = {'c': 0.45, 'b': 0.65, 'a': 0.85, 's': 1.0}[rk]
        rays = ((0.5 + 0.5 * np.cos(12 * th)) ** 4 * 0.5 + (0.5 + 0.5 * np.cos(7 * th + 1)) ** 6 * 0.3) * np.clip(1 - rr, 0, 1) ** 1.6
        disk = np.exp(-(rr / 0.45) ** 2)
        a = np.clip((rays + disk * 0.8) * k, 0, 1) * np.clip((1 - rr) / 0.08, 0, 1)
        col = grad_col(np.clip(disk, 0, 1), [(0, c['base']), (0.6, c['glow']), (1, c['core'])])
        save(Image.fromarray(np.dstack([col, a * 255]).clip(0, 255).astype(np.uint8), 'RGBA'), f'gacha.halo.{rk}', f'fx/halo_{rk}.png', 'image', [512, 512], 'add',
             f'등급 {rk.upper()} 초상 후광(가운데 큰 초상 뒤, 회전 30s/바퀴, 맥동 alpha 0.8~1). 표시 지름 = 초상 표시 높이의 1.1배')


def seal_crack_and_shards(img):
    # 결정적 파쇄: 인장 중심에서 방사형 다각형 6조각 + 균열선 오버레이
    W, H = img.size; cx, cy = W / 2, H / 2
    rng = np.random.default_rng(11)
    N = 6
    angs = sorted((i + rng.uniform(-0.25, 0.25)) / N * math.tau for i in range(N))
    R = max(W, H)
    crack = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dc = ImageDraw.Draw(crack)
    for a in angs:  # 지그재그 균열선
        pts = [(cx + rng.uniform(-4, 4), cy + rng.uniform(-4, 4))]
        for s in range(1, 7):
            r = R * 0.5 * s / 6; aa = a + rng.uniform(-0.08, 0.08)
            pts.append((cx + r * math.cos(aa), cy + r * math.sin(aa)))
        dc.line(pts, fill=(255, 236, 180, 255), width=5)
        dc.line(pts, fill=(40, 8, 6, 255), width=2)
    ca = np.asarray(crack).copy(); ca[..., 3] = np.minimum(ca[..., 3], np.asarray(img)[..., 3])
    crack_img = Image.fromarray(ca, 'RGBA')
    save(crack_img, 'gacha.seal.crack', 'seal/seal_crack.png', 'image', [W // 2, H // 2], 'normal', '인장 위에 겹치는 균열선(같은 크기·같은 위치). S/A 리빌에서 금빛 틈 = 가산 섬광과 함께')
    meta = []
    for i in range(N):
        a0, a1 = angs[i], angs[(i + 1) % N] + (math.tau if i == N - 1 else 0)
        m = Image.new('L', (W, H), 0)
        poly = [(cx, cy)] + [(cx + R * math.cos(a0 + (a1 - a0) * t / 8), cy + R * math.sin(a0 + (a1 - a0) * t / 8)) for t in range(9)]
        ImageDraw.Draw(m).polygon(poly, fill=255)
        part = np.asarray(img).copy(); part[..., 3] = np.minimum(part[..., 3], np.asarray(m))
        ys, xs = np.nonzero(part[..., 3] > 8)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        piece = Image.fromarray(part[y0:y1, x0:x1], 'RGBA')
        mid = (a0 + a1) / 2
        save(piece, f'gacha.seal.shard.{i}', f'seal/seal_shard_{i}.png', 'image', [piece.width // 2, piece.height // 2], 'normal',
             '인장 파편. 배치 = 인장 왼쪽 위 기준 offset(표시 px), 비산 방향 = dir(라디안)',
             extra={'offset': [int(x0) // 2, int(y0) // 2], 'dir': round(mid, 3)})
        meta.append(i)


def preview():
    # 검정·남색 바탕 위 대조 시트(QA 용, manifest 미등록)
    files = [it for it in ITEMS if it['path'].endswith('.png')]
    tiles = []
    for it in files:
        im = Image.open('public/' + it['path']).convert('RGBA')
        im.thumbnail((256, 256))
        bg = Image.new('RGBA', (264, 264), (16, 28, 58, 255)); bg.alpha_composite(im, ((264 - im.width) // 2, (264 - im.height) // 2))
        tiles.append(bg)
    cols = 6; rows = math.ceil(len(tiles) / cols)
    sheet = Image.new('RGB', (cols * 264, rows * 264), (0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t.convert('RGB'), ((i % cols) * 264, (i // cols) * 264))
    sheet.save(f'{ROOT}/preview/contact.png')


if __name__ == '__main__':
    circle_layers(); beam_sheets(); aura_sheets(); card_glows(); particles(); misc(); banner_parts(); glyph_particles(); pop_and_halo(); emerge_mask()
    got = [] if '--proc-only' in sys.argv else generated()
    for it in ITEMS:
        it['bytes'] = os.path.getsize('public/' + it['path'])
        it.setdefault('generator', {'model': 'gemini-nano-banana-2.1 (2K JPEG) + gacha_pp.py' if it['key'] in QA or it['key'].startswith('gacha.seal') else 'procedural (gacha_pp.py, 모델 호출 없음)',
                                    'script': 'docker/gemini/gacha_gen.mjs + gacha_style.mjs / docker/gemini/gacha_pp.py'})
        it.setdefault('license', '자체 생성(이미지 모델 출력 + 절차 생성), 제3자 소스 없음. 모델 출력물 상업 이용 약관은 사람 확인')
        it.setdefault('prompt_ref', 'gacha_style.mjs JOBS.gacha' if it['key'] in QA or it['key'].startswith('gacha.seal') else 'gacha_pp.py(절차)')
    frag = {'note': '뽑기(소집) 화면 에셋 조각(안아트-2, 2026-11-03). 스펙 = public/assets/gacha_ui/gacha_ui_spec.json. scope gacha_ui(뽑기 메인) / gacha_fx(소환 연출). 기존 scope gacha(atlas.uiskin_gacha·bg.screen.gacha)와 별개',
            'base_path': 'assets/gacha_ui/', 'raw_generated': got, 'assets': ITEMS,
            'total_bytes': sum(it['bytes'] for it in ITEMS)}
    with open(f'{ROOT}/manifest_fragment.json', 'w', encoding='utf8') as f:
        json.dump(frag, f, ensure_ascii=False, indent=1)
    preview()
    print(len(ITEMS), 'items', frag['total_bytes'], 'bytes', 'generated:', got)
