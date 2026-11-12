# 결과 화면(result_ui) 후처리: raw JPEG → 마젠타 키/검정 휘도 알파 → 분할·정규화 → PNG + 절차 생성(광선·후광) + 미리보기 + manifest_fragment.json
# 실행(API 호출 없음): sh docker/gemini/result_py.sh "python docker/gemini/result_pp.py"
# 의존: pillow 11.0.0(HPND), numpy 2.1.3(BSD-3) — pip 공식 레지스트리, named volume pylib_card 캐시(card_py.sh 와 공유)
import json, math, os, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = 'public/assets/result_ui'
RAW = f'{ROOT}/raw/result'
OUT = ROOT
os.makedirs(f'{OUT}/preview', exist_ok=True)
FONT_T = 'docker/gemini/fonts/blackhansans/BlackHanSans-Regular.ttf'
FONT_B = 'docker/gemini/fonts/gowunbatang/GowunBatang-Bold.ttf'
REPORT = {}


def load(n):
    return np.asarray(Image.open(f'{RAW}/{n}.jpg').convert('RGB')).astype(np.int32)


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


def grid(rgba, cols, rows):
    h, w = rgba.shape[:2]; out = []
    for j in range(rows):
        for i in range(cols):
            c = rgba[j * h // rows:(j + 1) * h // rows, i * w // cols:(i + 1) * w // cols]
            out.append(trim(drop_specks(c, 200)))
    return out


def im(a):
    return Image.fromarray(a, 'RGBA')


def fit_w(a, w):
    i = im(a); return i.resize((w, max(1, round(i.height * w / i.width))), Image.LANCZOS)


def fit_box(a, s):
    i = im(a); k = s / max(i.width, i.height)
    return i.resize((max(1, round(i.width * k)), max(1, round(i.height * k))), Image.LANCZOS)


def center_on(img, w, h, ax=0.5, ay=0.5):
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0)); c.alpha_composite(img, (round((w - img.width) * ax), round((h - img.height) * ay))); return c


def mirror_sym(a):
    # 좌우 대칭 강제(왼쪽 절반을 오른쪽에 반사). 리본·장식처럼 대칭이 규칙인 조각만
    a = a.copy(); w = a.shape[1]; a[:, w - w // 2:] = a[:, :w // 2][:, ::-1]; return a


def save(img, key, path, kind, display, note='', blend='normal', extra=None):
    p = f'{OUT}/{path}'; os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p, optimize=True)
    REPORT[key] = {'key': key, 'path': f'assets/result_ui/{path}', 'type': kind, 'size': [img.width, img.height], 'display': display,
                   'scale': '@2x (display=CSS px, file=2배)', 'alpha': True, 'blend': blend, 'bytes': os.path.getsize(p), 'note': note, **(extra or {})}
    return img


def tone(a, sat=1.0, val=1.0, tint=None, tint_k=0.0):
    rgb = a[..., :3].astype(np.float32); l = (rgb * [0.3, 0.59, 0.11]).sum(2, keepdims=True)
    rgb = l + (rgb - l) * sat; rgb *= val
    if tint is not None: rgb = rgb * (1 - tint_k) + np.array(tint, np.float32) * (l / 255) * tint_k * 1.4
    o = a.copy(); o[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8); return o


# ---------------- 배너 ----------------
for k in ('victory', 'defeat'):
    a = drop_specks(erode(key_magenta(load(f'banner_{k}'))), 400)
    a = trim(a)
    save(fit_w(a, 1200), f'result.banner.{k}', f'banner_{k}.png', 'image', [600, None], '글자 없음. FE 가 한글 제목을 몸통 중앙(textY 비율)에 얹음')

# ---------------- 상단 장식·구분선 ----------------
a = trim(drop_specks(erode(key_magenta(load('ornament_top'))), 300))
orn = fit_w(a, 640)
save(orn, 'result.ornament.victory', 'ornament_top_victory.png', 'image', [320, None], '패널 윗변 중앙(배너 아래 탭 영역) 또는 보상부 제목 위')
save(im(tone(np.asarray(orn), sat=0.55, val=0.78)), 'result.ornament.defeat', 'ornament_top_defeat.png', 'image', [320, None], '승리 장식 파생(채도 55%·명도 78%, 빛바랜 금)')
a = trim(drop_specks(erode(key_magenta(load('divider'))), 150))
dv = fit_w(a, 1040)
save(dv, 'result.divider.victory', 'divider_victory.png', 'image', [520, None], '가로 구분선, 폭은 패널 안쪽 폭에 맞춰 setDisplaySize(가로만 축소 권장)')
save(im(tone(np.asarray(dv), sat=0.55, val=0.8)), 'result.divider.defeat', 'divider_defeat.png', 'image', [520, None], '승리 구분선 파생')

# ---------------- 별 3종(같은 캔버스·같은 기준점) ----------------
a = drop_specks(erode(key_magenta(load('stars'))), 300)
parts = split(a, 'x', 3)
# 별 몸체 크기 = 채운 별(가운데) 기준. 반짝 별은 십자 반짝임이 오른쪽 위로 튀어나오므로 왼쪽·아래 기준으로 정렬
ref = parts[1]; S = 120; k = S / max(ref.shape[:2])
names = ['empty', 'filled', 'shine']
for nm, p in zip(names, parts):
    i = im(p).resize((max(1, round(p.shape[1] * k)), max(1, round(p.shape[0] * k))), Image.LANCZOS)
    c = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
    bx = (160 - round(ref.shape[1] * k)) // 2; by = (160 - round(ref.shape[0] * k)) // 2
    c.alpha_composite(i, (bx, by + round(ref.shape[0] * k) - i.height))
    save(c, f'result.star.{nm}', f'star_{nm}.png', 'image', [80, 80], '160x160 캔버스, 별 몸체 120px 중앙. 3장 같은 좌표에 겹쳐 교체/크로스페이드')

# ---------------- 보상 카드·썸네일 액자 ----------------
a = trim(drop_specks(erode(key_magenta(load('reward_card'))), 400))
save(fit_box(a, 260), 'result.card.reward', 'reward_card.png', 'image', [None, 130], '아이콘 영역=위 74%, 수치 띠=아래 26%')
raw = key_magenta(load('thumb_frame'))
# 안쪽 창(마젠타)은 이미 투명. 바깥 배경과 구분되도록 바깥만 trim
a = trim(drop_specks(erode(raw), 400))
save(center_on(fit_box(a, 128), 128, 128), 'result.frame.thumb', 'thumb_frame.png', 'image', [56, 56], '안쪽 창 투명. 초상화를 액자 아래 레이어에 마스크(둥근 사각) 후 배치')

# ---------------- 색종이·보상 아이콘 ----------------
a = drop_specks(erode(key_magenta(load('confetti'))), 200)
for n, p in enumerate(grid(a, 4, 2), 1):
    save(fit_box(p, 64), f'result.confetti.{n}', f'fx/confetti_{n}.png', 'particle', [24, 24], '파티클 텍스처(회전·낙하)', extra={'group': 'confetti'})
a = drop_specks(erode(key_magenta(load('reward_icons'))), 300)
for nm, p in zip(['exp', 'hero', 'equip', 'chest'], split(a, 'x', 4)):
    big = fit_box(p, 128)
    save(center_on(big, 128, 128), f'result.ico.{nm}', f'icons/ico_{nm}_128.png', 'icon', [64, 64], '보상 카드 아이콘')
    save(center_on(fit_box(p, 64), 64, 64), f'result.ico.{nm}.sm', f'icons/ico_{nm}_64.png', 'icon', [32, 32], '경험치 행·요약용 작은 아이콘')

# ---------------- 검정 배경 이펙트 → 알파 ----------------
fw = lum_alpha(load('firework'), floor=18)
save(center_on(fit_box(trim(fw), 480), 512, 512), 'result.fx.firework', 'fx/firework.png', 'fx', [256, 256], '폭죽 1송이: scale 0.2→1.1 + alpha 1→0 트윈', blend='add 권장(normal 도 가능)')
sp = lum_alpha(load('sparks'), floor=18)
for n, p in zip(['cross', 'orb', 'star8', 'streak'], split(sp, 'x', 4, thr=20)):
    save(center_on(fit_box(p, 128), 128, 128), f'result.fx.spark.{n}', f'fx/spark_{n}.png', 'particle', [32, 32], '반짝임 파티클', blend='add')
sm = lum_alpha(load('smoke_defeat'), floor=16, gamma=1.15)
smi = im(sm).resize((1280, 720), Image.LANCZOS)
save(smi, 'result.fx.smoke', 'fx/smoke_defeat.png', 'overlay', [None, None], '패배 하단 연기: 화면 폭에 맞춰 늘림, 좌우로 천천히 흐름(tilePositionX 또는 x 트윈), alpha 0.7', blend='normal')

# ---------------- 절차 생성: 광선(sunburst)·후광 ----------------
def sunburst(size=1024, rays=18, col=(246, 207, 106)):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32); c = (size - 1) / 2
    dx, dy = x - c, y - c; r = np.hypot(dx, dy) / c; th = np.arctan2(dy, dx)
    wave = (np.cos(th * rays) + 1) / 2                      # 0..1 광선
    ray = np.clip((wave - 0.35) / 0.4, 0, 1) ** 1.3          # 부드러운 가장자리(계단 없는 AA)
    fall = np.clip(1 - r, 0, 1) ** 1.6                       # 중심 밝고 바깥 사라짐
    core = np.exp(-(r / 0.22) ** 2) * 0.55
    a = np.clip(ray * fall * 0.85 + core, 0, 1)
    rgb = np.zeros((size, size, 3), np.float32) + col
    rgb = rgb + (255 - rgb) * np.exp(-(r / 0.25) ** 2)[..., None] * 0.8   # 중심 흰빛
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8), 'RGBA')

save(sunburst(), 'result.fx.sunburst', 'fx/sunburst.png', 'overlay', [520, 520], '배너 뒤 광선. 회전 360°/40s 무한, alpha 0→0.55. 절차 생성(18광선)', blend='add', extra={'generator': 'procedural:result_pp.py sunburst()'})

def glow(size=512, col=(255, 233, 168), k=0.5):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32); c = (size - 1) / 2; r = np.hypot(x - c, y - c) / c
    a = np.clip(np.exp(-(r / k) ** 2) - np.exp(-(1 / k) ** 2), 0, 1)
    return Image.fromarray(np.dstack([np.zeros((size, size, 3)) + col, a * 255]).astype(np.uint8), 'RGBA')

save(glow(), 'result.fx.glow.victory', 'fx/glow_victory.png', 'overlay', [400, 400], '배너·별 뒤 부드러운 후광', blend='add', extra={'generator': 'procedural'})
save(glow(col=(194, 87, 74), k=0.55), 'result.fx.glow.defeat', 'fx/glow_defeat.png', 'overlay', [400, 400], '패배 배너 뒤 은은한 붉은 후광(alpha 0.35 이하)', blend='normal', extra={'generator': 'procedural'})

# ---------------- 미리보기: 컨택트 시트 + 390/1280 목업 ----------------
NAVY = (16, 28, 58, 255)
def contact():
    keys = [k for k in REPORT]
    cell = 200; cols = 6; rows = math.ceil(len(keys) / cols)
    sheet = Image.new('RGBA', (cols * cell, rows * (cell + 24)), NAVY)
    d = ImageDraw.Draw(sheet); f = ImageFont.truetype(FONT_B, 12)
    for n, k in enumerate(keys):
        i = Image.open(f"{OUT}/{REPORT[k]['path'].split('result_ui/')[1]}").convert('RGBA'); i.thumbnail((cell - 16, cell - 16))
        x, y = (n % cols) * cell, (n // cols) * (cell + 24)
        # 체커(알파 확인)
        for yy in range(0, cell, 16):
            for xx in range(0, cell, 16):
                if (xx // 16 + yy // 16) % 2: d.rectangle([x + xx, y + yy, x + xx + 15, y + yy + 15], fill=(26, 40, 76, 255))
        sheet.alpha_composite(i, (x + (cell - i.width) // 2, y + (cell - i.height) // 2))
        d.text((x + 4, y + cell + 4), k.replace('result.', ''), font=f, fill=(240, 213, 140, 255))
    sheet.convert('RGB').save(f'{OUT}/preview/contact.png')
contact()

PANEL = 'public/assets/ui_skin/pieces/panel.main.png'
def nine(path, w, h, b):
    s = Image.open(path).convert('RGBA'); W, H = s.size; o = Image.new('RGBA', (w, h))
    xs = [(0, b, 0, b), (b, W - b, b, w - b), (W - b, W, w - b, w)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in [(0, b, 0, b), (b, H - b, b, h - b), (H - b, H, h - b, h)]:
            o.alpha_composite(s.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.LANCZOS), (dx0, dy0))
    return o

def P(p):
    return Image.open(f'{OUT}/{p}').convert('RGBA')

def mock(win, W, H, name):
    bg = Image.open('public/assets/ui_skin/bg/bg_lobby.jpg').convert('RGBA').resize((W, H)) if os.path.exists('public/assets/ui_skin/bg/bg_lobby.jpg') else Image.new('RGBA', (W, H), (40, 60, 40, 255))
    bg.alpha_composite(Image.new('RGBA', (W, H), (5, 8, 18, 150)))
    pw = min(600, W - 24); s = pw / 600
    gold = (240, 213, 140, 255); white = (232, 236, 245, 255); mute = (154, 168, 196, 255)
    ft = ImageFont.truetype(FONT_T, round(40 * s)); fb = ImageFont.truetype(FONT_B, max(12, round(17 * s))); fs = ImageFont.truetype(FONT_B, max(11, round(14 * s)))
    bn = P(f'banner_{"victory" if win else "defeat"}.png'); bw = pw; bh = round(bn.height * bw / bn.width); bn = bn.resize((bw, bh), Image.LANCZOS)
    ph = 600 if W < 600 else 560
    total = bh * 0.78 + ph; top = max(12, round((H - total) / 2))
    px = (W - pw) // 2; py = round(top + bh * 0.78)
    if win:
        sb = P('fx/sunburst.png').resize((round(bw * 1.15),) * 2); sb.putalpha(sb.getchannel('A').point(lambda v: int(v * 0.55)))
        bg.alpha_composite(sb, (W // 2 - sb.width // 2, round(top + bh * 0.5 - sb.height / 2)))
    else:
        g = P('fx/glow_defeat.png').resize((round(bw * 0.9),) * 2); g.putalpha(g.getchannel('A').point(lambda v: int(v * 0.35)))
        bg.alpha_composite(g, (W // 2 - g.width // 2, round(top + bh * 0.5 - g.height / 2)))
    if not win:  # 연기는 패널 뒤(딤 위) 레이어
        smk = P('fx/smoke_defeat.png').resize((W, round(W * 9 / 16)), Image.LANCZOS); smk.putalpha(smk.getchannel('A').point(lambda v: int(v * 0.7)))
        bg.alpha_composite(smk, (0, H - smk.height))
    if os.path.exists(PANEL):
        bg.alpha_composite(nine(PANEL, pw, ph, 66), (px, py))
    bg.alpha_composite(bn, (px, top))
    d = ImageDraw.Draw(bg)
    title = '승리' if win else '패배'
    d.text((W // 2, round(top + bh * 0.5)), title, font=ft, anchor='mm', fill=(90, 58, 16, 255) if win else (246, 220, 210, 255),
           stroke_width=3 if win else 4, stroke_fill=(248, 231, 176, 255) if win else (11, 16, 32, 255))
    y = py + round(bh * 0.22) + round(10 * s)
    d.text((W // 2, y), '모든 적을 물리쳤습니다' if win else '전열을 정비해 다시 도전하세요', font=fb, anchor='mt', fill=white); y += round(30 * s)
    if win:
        st = 64 if W >= 600 else 48
        for n, nm in enumerate(['filled', 'shine', 'empty']):
            i = P(f'star_{nm}.png').resize((round(st * (1.2 if n == 1 else 1)),) * 2, Image.LANCZOS)
            cx = W // 2 + (n - 1) * round(st * 1.1)
            bg.alpha_composite(i, (cx - i.width // 2, y + (0 if n == 1 else round(st * 0.12))))
        y += round(st * 1.25)
    else:
        d.text((W // 2, y), '조언: 상성 유리한 병종을 앞에 세우세요', font=fs, anchor='mt', fill=(230, 170, 150, 255)); y += round(28 * s)
    dv = P(f'divider_{"victory" if win else "defeat"}.png'); dv = dv.resize((pw - 80, max(1, round(dv.height * (pw - 80) / dv.width))), Image.LANCZOS)
    bg.alpha_composite(dv, (W // 2 - dv.width // 2, y)); y += dv.height + round(10 * s)
    cards = [('ico_chest', '+120'), ('ico_exp', '+39'), ('ico_hero', '1')] if win else [('ico_exp', '+19')]
    ch = round(110 * s) if W < 600 else 120
    card = P('reward_card.png'); card = card.resize((round(card.width * ch / card.height), ch), Image.LANCZOS)
    gap = 12; tw = len(cards) * card.width + (len(cards) - 1) * gap; x0 = W // 2 - tw // 2
    for n, (ic, val) in enumerate(cards):
        cx = x0 + n * (card.width + gap); bg.alpha_composite(card, (cx, y))
        i = P(f'icons/{ic}_128.png').resize((round(ch * 0.5),) * 2, Image.LANCZOS)
        bg.alpha_composite(i, (cx + card.width // 2 - i.width // 2, y + round(ch * 0.12)))
        d.text((cx + card.width // 2, y + round(ch * 0.87)), val, font=fs, anchor='mm', fill=gold)
    y += ch + round(14 * s)
    fr = P('thumb_frame.png'); th = 40 if W < 600 else 48; fr = fr.resize((th, th), Image.LANCZOS)
    for n in range(3):
        ry = y + n * (th + 8)
        d.rounded_rectangle([px + 34 + 4, ry + 4, px + 34 + th - 4, ry + th - 4], 4, fill=(70, 90, 130, 255))
        bg.alpha_composite(fr, (px + 34, ry))
        d.text((px + 34 + th + 10, ry + 2), ['플레이어  Lv 2', '잔 다르크  Lv 3', '이순신  Lv 3'][n], font=fs, fill=white)
        bx0, bx1 = px + 34 + th + 10, px + pw - 40; by = ry + th - 18
        d.rounded_rectangle([bx0, by, bx1, by + 12], 6, fill=(10, 18, 38, 255), outline=(138, 106, 30, 255))
        d.rounded_rectangle([bx0 + 2, by + 2, bx0 + 2 + int((bx1 - bx0 - 4) * [0.4, 0.6, 0.6][n]), by + 10], 5, fill=(110, 190, 255, 255))
    by0 = y + 3 * (th + 8) + 12
    for n, (k, lab) in enumerate([('primary', '다음 스테이지' if win else '다시 도전'), ('secondary', '로비로')]):
        b = Image.open(f'public/assets/ui_skin/pieces/btn.{k}.normal.png').convert('RGBA'); bw2 = (pw - 80) // 2; b = b.resize((bw2, 48), Image.LANCZOS)
        bx = px + 32 + n * (bw2 + 16); bg.alpha_composite(b, (bx, by0))
        d.text((bx + bw2 // 2, by0 + 24), lab, font=fb, anchor='mm', fill=(26, 20, 6, 255) if k == 'primary' else white)
    if win:
        fw = P('fx/firework.png').resize((round(180 * s),) * 2, Image.LANCZOS)
        bg.alpha_composite(fw, (px - fw.width // 3, top - fw.height // 4))
        for n in range(1, 9):
            c = P(f'fx/confetti_{n}.png').resize((22, 22)).rotate(n * 37, expand=True)
            bg.alpha_composite(c, ((n * 97) % W, (top + n * 53) % (py + 40)))
    bg.convert('RGB').save(f'{OUT}/preview/{name}.png')

for win in (True, False):
    mock(win, 390, 844, f'mock_{"victory" if win else "defeat"}_390')
    mock(win, 1280, 720, f'mock_{"victory" if win else "defeat"}_1280')

json.dump(REPORT, open(f'{OUT}/preview/pp_report.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('done', len(REPORT))
