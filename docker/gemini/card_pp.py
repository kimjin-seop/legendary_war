"""영웅 메뉴 카드 UI 후처리(안아트 카드 담당, 2026-11-01). API 호출 없음.
public/assets/card/raw/<cat>/*.jpg -> 크로마키(마젠타/초록) + 디스필 -> 부품 정규화 -> 레이아웃(card_layout.json) 좌표로 합성
-> 프레임 오버레이(희귀도별, 투명 PNG/WebP @2x·@3x) + 부품 PNG + 배경 WebP/JPG + 도트 스탯 아이콘(24/32px, x2/x3) + 미리보기 + manifest 조각.
실행(컨테이너): sh docker/gemini/card_py.sh python docker/gemini/card_pp.py [all|icons|parts|preview]
의존(pip 공식 레지스트리): pillow 11.0.0(HPND), numpy 2.1.3(BSD-3). 폰트: docker/gemini/fonts(Cinzel, GowunBatang, OFL).
"""
import sys, os, json, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = 'public/assets/card'
RAW = f'{ROOT}/raw'
LAYOUT = json.load(open(f'{ROOT}/card_layout.json', encoding='utf-8'))
W, H = LAYOUT['master']['w'], LAYOUT['master']['h']
FONT_LETTER = 'docker/gemini/fonts/cinzel/Cinzel-VF.ttf'
FONT_NAME = 'docker/gemini/fonts/gowunbatang/GowunBatang-Bold.ttf'
RAR = ['s', 'a', 'b', 'c']
RCOL = {'s': (240, 178, 60), 'a': (176, 106, 216), 'b': (47, 181, 166), 'c': (139, 151, 168)}
KEY = {'a': 'g'}  # frame_a / flag_a 는 초록 키
OL = (20, 12, 28)


def ensure(*ds):
    for d in ds:
        os.makedirs(d, exist_ok=True)


# ---------------- 크로마키 ----------------
def keyout(path, kind='m', grow=2, soft=True):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    if kind == 'm':
        strict = (r > 150) & (b > 150) & (g < 120) & (r - g > 100) & (b - g > 100)
        loose = (r - g > 40) & (b - g > 40)
        spill = np.clip(np.minimum(r, b) - g - 20, 0, None)
    else:
        strict = (g > 150) & (r < 140) & (b < 140) & (g - r > 90) & (g - b > 90)
        loose = (g - r > 35) & (g - b > 35)
        spill = np.clip(g - np.maximum(r, b) - 15, 0, None)
    m = strict.copy()
    for _ in range(grow):  # 경계 부드러운 픽셀까지 확장(loose 안에서만)
        n = m.copy()
        n[1:] |= m[:-1]; n[:-1] |= m[1:]; n[:, 1:] |= m[:, :-1]; n[:, :-1] |= m[:, 1:]
        m = m | (n & loose)
    alpha = np.where(m, 0, 255).astype(np.uint8)
    out = im.copy()
    if kind == 'm':
        out[..., 0] -= spill; out[..., 2] -= spill
    else:
        out[..., 1] -= spill
    out = np.clip(out, 0, 255).astype(np.uint8)
    a = Image.fromarray(alpha)
    if soft:  # 1px 침식 후 살짝 블러 -> 계단·헤일로 완화
        a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    rgba = np.dstack([out, np.asarray(a)])
    return Image.fromarray(rgba, 'RGBA')


def trim(im, thr=40):
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > thr)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def drop_small(im, min_frac=0.002):
    """작은 잡티 성분 제거(알파 연결요소)."""
    from collections import deque
    arr = np.asarray(im).copy(); a = arr[..., 3] > 30
    h, w = a.shape; lab = np.zeros((h, w), np.int32); cur = 0; sizes = {}
    for y0, x0 in zip(*np.where(a)):
        if lab[y0, x0]:
            continue
        cur += 1; q = deque([(y0, x0)]); lab[y0, x0] = cur; c = 0
        while q:
            y, x = q.popleft(); c += 1
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < h and 0 <= xx < w and a[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = cur; q.append((yy, xx))
        sizes[cur] = c
    tot = a.sum(); kill = [k for k, v in sizes.items() if v < tot * min_frac]
    if kill:
        arr[np.isin(lab, kill), 3] = 0
    return Image.fromarray(arr, 'RGBA')


def rect(name):
    r = LAYOUT['rects'][name]
    return [round(r[0] * W), round(r[1] * W), round(r[2] * W), round(r[3] * W)]


def fit(im, w, h):
    return im.resize((w, h), Image.LANCZOS)


def save_pair(im, base, sizes):
    """master 이미지를 지정 폭들로 PNG+WebP 저장. 반환: 파일 목록."""
    out = []
    for tag, w in sizes:
        h = round(im.height * w / im.width)
        r = im.resize((w, h), Image.LANCZOS) if w != im.width else im
        p = f'{base}@{tag}.png'; r.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(p, optimize=True); out.append(p)  # PNG 는 폴백: 256색 팔레트(알파 포함)
        q = f'{base}@{tag}.webp'; r.save(q, 'WEBP', quality=88, method=6, alpha_quality=90); out.append(q)
    return out


def font(path, size, var=None):
    f = ImageFont.truetype(path, size)
    if var:
        try:
            f.set_variation_by_name(var)
        except Exception:
            pass
    return f


def slice3(im, w, h, cap_frac):
    """가로 3-slice: 좌우 캡 유지(높이 맞춤 비율), 가운데 늘림."""
    s = h / im.height
    cap = round(im.width * cap_frac)
    capw = max(1, round(cap * s))
    L = im.crop((0, 0, cap, im.height)).resize((capw, h), Image.LANCZOS)
    R = im.crop((im.width - cap, 0, im.width, im.height)).resize((capw, h), Image.LANCZOS)
    M = im.crop((cap, 0, im.width - cap, im.height)).resize((max(1, w - 2 * capw), h), Image.LANCZOS)
    o = Image.new('RGBA', (w, h))
    o.alpha_composite(L, (0, 0)); o.alpha_composite(M, (capw, 0)); o.alpha_composite(R, (w - capw, 0))
    return o


def round_mask(w, h, r):
    m = Image.new('L', (w * 4, h * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 4 - 1, h * 4 - 1), r * 4, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def raw(cat, name):
    p = f'{RAW}/{cat}/{name}.jpg'
    return p if os.path.exists(p) else None


PICK = json.load(open(f'{ROOT}/card_picks.json', encoding='utf-8')) if os.path.exists(f'{ROOT}/card_picks.json') else {}


def pick(cat, name):
    v = PICK.get(name, name)
    if '/' in v:  # "<category>/<file>" 형태로 다른 폴더 후보 지정
        c, n = v.split('/', 1)
        return raw(c, n)
    return raw(cat, v)


def dark_navy_bbox(im, region):
    """깃발/메달 안쪽 남색 빈 면 bbox(글자·숫자 자리) 측정."""
    x0, y0, x1, y1 = region
    a = np.asarray(im).astype(int)[y0:y1, x0:x1]
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    m = (al > 200) & (b > r + 8) & (r < 70) & (g < 90) & (b < 140)
    ys, xs = np.where(m)
    if len(xs) < 50:
        return None
    xa, xb = np.percentile(xs, [3, 97]); ya, yb = np.percentile(ys, [3, 97])
    return (x0 + xa, y0 + ya, x0 + xb, y0 + yb)


LETTER_FILL = {'s': [(255, 244, 196), (240, 178, 60), (150, 100, 20)], 'a': [(250, 236, 255), (214, 170, 240), (130, 70, 180)],
               'b': [(232, 255, 250), (140, 225, 212), (30, 120, 110)], 'c': [(250, 252, 255), (196, 204, 216), (110, 120, 136)]}


def draw_letter(canvas, box, ch, rar):
    x0, y0, x1, y1 = box
    hgt = int((y1 - y0) * 0.78)
    f = font(FONT_LETTER, hgt, 'Bold')
    tmp = Image.new('L', canvas.size, 0)
    d = ImageDraw.Draw(tmp)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    d.text((cx, cy), ch, font=f, fill=255, anchor='mm')
    bb = tmp.getbbox()
    top, mid, bot = LETTER_FILL[rar]
    grad = Image.new('RGBA', canvas.size)
    gd = ImageDraw.Draw(grad)
    for y in range(bb[1], bb[3] + 1):
        t = (y - bb[1]) / max(1, bb[3] - bb[1])
        c = [round(top[k] + (mid[k] - top[k]) * t / 0.55) if t < 0.55 else round(mid[k] + (bot[k] - mid[k]) * (t - 0.55) / 0.45) for k in range(3)]
        gd.line((bb[0], y, bb[2], y), fill=(*c, 255))
    sw = max(2, hgt // 14)
    outline = tmp.filter(ImageFilter.MaxFilter(2 * (sw // 2) + 1))
    for _ in range(max(0, sw // 2 - 1)):
        outline = outline.filter(ImageFilter.MaxFilter(3))
    ol = Image.new('RGBA', canvas.size, (11, 19, 40, 0)); ol.putalpha(outline)
    shadow = Image.new('RGBA', canvas.size, (0, 0, 0, 0)); shadow.putalpha(outline.point(lambda v: int(v * 0.6)))
    canvas.alpha_composite(shadow.transform(canvas.size, Image.AFFINE, (1, 0, -max(1, sw // 2), 0, 1, -sw)))
    canvas.alpha_composite(ol)
    grad.putalpha(tmp)
    canvas.alpha_composite(grad)


def make_shade():
    s = Image.new('RGBA', (8, 256))
    px = s.load()
    for y in range(256):
        t = y / 255 * (H / W)
        a = 0.0
        if t < 0.30:
            a = 0.55 * (1 - t / 0.30) ** 1.6
        if t > 0.92:
            a = max(a, 0.88 * min(1, ((t - 0.92) / 0.30)) ** 1.3)
        for x in range(8):
            px[x, y] = (11, 19, 40, round(a * 255))
    return s


def corner_r():
    return round(LAYOUT['master']['corner_radius'] * W)


def measure_slice(b):
    """테두리 9-slice insets(px): 변 두께 t, 모서리 장식이 안쪽으로 뻗은 범위까지 포함한 코너 크기."""
    a = np.asarray(b)[..., 3] > 40
    h, w = a.shape
    col = a[:, w // 2]; t = int(np.argmin(col[: h // 4])) if not col[: h // 4].all() else h // 4
    rowm = a[h // 2]; tl = int(np.argmin(rowm[: w // 4]))
    # 왼쪽 위 코너: 테두리 안쪽(t+2 아래, tl+2 오른쪽)에 남은 불투명 = 장식
    sub = a[t + 2: h // 3, tl + 2: w // 2]
    ys, xs = np.where(sub)
    cx = (tl + 2 + xs.max() + 1) if len(xs) else tl
    cy = (t + 2 + ys.max() + 1) if len(ys) else t
    # 위쪽 변의 장식 가로 범위
    sub2 = a[t + 2: t + 2 + max(4, h // 6), tl + 2: w // 2]
    ys2, xs2 = np.where(sub2)
    return {'l': int(max(cx, tl) + 2), 'r': int(max(cx, tl) + 2), 't': int(max(cy, t) + 2), 'b': int(max(cy, t) + 2), 'edge_px': [int(tl), int(t)], 'at': '@3x(672x900)'}


def build_parts():
    ensure(f'{ROOT}/frames', f'{ROOT}/parts', f'{ROOT}/qa')
    files = {}
    rf = rect('rank_flag'); nb = rect('name_banner'); sb = rect('stat_bar'); cm = rect('cost_medal')
    banner = trim(drop_small(keyout(pick('piece', 'banner'))))
    statbar = trim(drop_small(keyout(pick('piece', 'statbar'))))
    medal = trim(drop_small(keyout(pick('piece', 'medal'))))
    banner_r = slice3(banner, nb[2], nb[3], PICK.get('banner_cap', 0.16))
    statbar_r = slice3(statbar, sb[2], sb[3], PICK.get('statbar_cap', 0.08))
    medal_r = fit(medal, cm[2], cm[3])
    measured = {}
    mb = dark_navy_bbox(medal_r, (0, 0, cm[2], cm[3]))
    if mb:
        measured['cost_text'] = [(cm[0] + mb[0]) / W, (cm[1] + mb[1]) / W, (mb[2] - mb[0]) / W, (mb[3] - mb[1]) / W]
    make_shade().save(f'{ROOT}/parts/card.shade.png', optimize=True)
    for k, v in {'banner': banner, 'statbar': statbar, 'medal': medal}.items():
        s = 600 / max(v.size)
        (v.resize((round(v.width * s), round(v.height * s)), Image.LANCZOS) if s < 1 else v).save(f'{ROOT}/parts/card.part.{k}.png', optimize=True)
    for r in RAR:
        kind = KEY.get(r, 'm')
        fr = trim(drop_small(keyout(pick('frame', f'frame_{r}'), kind)))
        fr = fit(fr, W, H)
        fr.putalpha(Image.fromarray(np.minimum(np.asarray(fr)[..., 3], np.asarray(round_mask(W, H, corner_r())))))
        border = fr.copy()
        SLICE[r] = measure_slice(border.resize((672, 900), Image.LANCZOS))
        fl = trim(drop_small(keyout(pick('flag', f'flag_{r}'), kind)))
        fl = fl.resize((rf[2], round(fl.height * rf[2] / fl.width)), Image.LANCZOS)
        comp = Image.new('RGBA', (W, H))
        comp.alpha_composite(fr)
        comp.alpha_composite(statbar_r, (sb[0], sb[1]))
        comp.alpha_composite(banner_r, (nb[0], nb[1]))
        comp.alpha_composite(medal_r, (cm[0], cm[1]))
        flc = Image.new('RGBA', fl.size); flc.alpha_composite(fl)
        lb = dark_navy_bbox(flc, (0, int(fl.height * 0.15), fl.width, int(fl.height * 0.85)))
        if lb:
            side = min(lb[2] - lb[0], lb[3] - lb[1])
            cx, cy = (lb[0] + lb[2]) / 2, (lb[1] + lb[3]) / 2
            box = (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2)
            draw_letter(flc, box, r.upper(), r)
            measured['rank_letter'] = [(rf[0] + box[0]) / W, (rf[1] + box[1]) / W, side / W, side / W]
        else:
            print('WARN flag medal not found', r)
        comp.alpha_composite(flc, (rf[0], rf[1]))
        measured[f'rank_flag_h_{r}'] = fl.height / W
        files[f'card.frame.{r}'] = save_pair(comp, f'{ROOT}/frames/card.frame.{r}', [('2x', 448), ('3x', 672)])
        files[f'card.border.{r}'] = save_pair(border, f'{ROOT}/frames/card.border.{r}', [('3x', 672)])
        flc.save(f'{ROOT}/parts/card.flag.{r}.png', optimize=True)
        comp.save(f'{ROOT}/qa/_frame_master_{r}.png')
    for r in RAR:
        p = pick('bg', f'bg_{r}')
        if not p:
            continue
        b = Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS)
        for tag, w in [('2x', 448), ('3x', 672)]:
            bb = b.resize((w, round(w * H / W)), Image.LANCZOS)
            bb.save(f'{ROOT}/frames/card.bg.{r}@{tag}.webp', 'WEBP', quality=80, method=6)
            bb.save(f'{ROOT}/frames/card.bg.{r}@{tag}.jpg', quality=82, optimize=True, progressive=True)
        b.save(f'{ROOT}/qa/_bg_master_{r}.png')
    p = pick('piece', 'card_back')
    if p:
        b = Image.open(p).convert('RGBA')
        ins = PICK.get('card_back_inset', 0)
        if ins:  # 원본 바깥 흰 모서리 제거용 안쪽 크롭
            dx, dy = round(b.width * ins), round(b.height * ins)
            b = b.crop((dx, dy, b.width - dx, b.height - dy))
        b = b.resize((W, H), Image.LANCZOS)
        b.putalpha(round_mask(W, H, corner_r()))
        save_pair(b, f'{ROOT}/frames/card.back', [('2x', 448), ('3x', 672)])
    p = pick('piece', 'lockseal')
    if p:
        seal = trim(drop_small(keyout(p)))
        sw = round(W * 0.62); seal = seal.resize((sw, round(seal.height * sw / seal.width)), Image.LANCZOS)
        # 사슬 끝(캔버스에서 잘린 부분) 좌우 12% 알파 페이드
        sa = np.asarray(seal).copy(); f = max(1, round(sw * 0.12))
        ramp = np.ones(sw); ramp[:f] = np.linspace(0, 1, f); ramp[-f:] = np.linspace(1, 0, f)
        sa[..., 3] = (sa[..., 3] * ramp[None, :]).astype(np.uint8); seal = Image.fromarray(sa, 'RGBA')
        lk = Image.new('RGBA', (W, H), (8, 12, 26, 0))
        veil = Image.new('RGBA', (W, H), (8, 12, 26, 255))
        veil.putalpha(round_mask(W, H, corner_r()).point(lambda v: int(v * 0.6)))
        lk.alpha_composite(veil)
        lk.alpha_composite(seal, ((W - sw) // 2, round(H * 0.47 - seal.height / 2)))
        save_pair(lk, f'{ROOT}/frames/card.locked', [('2x', 448), ('3x', 672)])
    json.dump(measured, open(f'{ROOT}/qa/_measured.json', 'w'), indent=1)
    print('measured', json.dumps(measured))


# ---------------- 도트 스탯 아이콘 ----------------
ICON_ORDER = ['stat_atk', 'stat_hp', 'stat_def', 'stat_move', 'stat_range', 'stat_mp', 'stat_cost', 'star', 'star_empty', 'hourglass', 'lock', 'lvup']


def pixelize(cell_rgba, n, ncol=12):
    """마젠타 키된 칸 -> 대상 n px 도트(블록 평균 -> 팔레트 양자화 -> 알파 이진화 -> 외곽 1px 어두운 선)."""
    t = trim(cell_rgba, 100)
    inner = n - 2
    s = inner / max(t.size)
    w, h = max(1, round(t.width * s)), max(1, round(t.height * s))
    # 프리멀티플 박스 평균으로 축소(헤일로 방지)
    arr = np.asarray(t).astype(float)
    a = arr[..., 3:4] / 255
    pm = np.concatenate([arr[..., :3] * a, a * 255], 2).astype(np.float32)
    small = np.stack([np.asarray(Image.fromarray(pm[..., k]).resize((w, h), Image.BOX)) for k in range(4)], 2)
    al = small[..., 3]
    rgb = np.where(al[..., None] > 1, small[..., :3] / np.maximum(al[..., None], 1) * 255, 0)
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    solid = al > 110
    q = Image.fromarray(rgb).quantize(ncol, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    q = np.asarray(q).copy()
    out = np.zeros((n, n, 4), np.uint8)
    ox, oy = (n - w) // 2, (n - h) // 2
    out[oy:oy + h, ox:ox + w, :3] = q
    out[oy:oy + h, ox:ox + w, 3] = np.where(solid, 255, 0)
    # 외곽선: 투명과 맞닿은 불투명 픽셀 중 너무 밝은 것만 어둡게(원래 외곽선은 유지)
    A = out[..., 3] > 0
    nb = np.zeros_like(A)
    nb[1:] |= ~A[:-1]; nb[:-1] |= ~A[1:]; nb[:, 1:] |= ~A[:, :-1]; nb[:, :-1] |= ~A[:, 1:]
    edge = A & nb
    lum = out[..., :3].astype(int).sum(2)
    fix = edge & (lum > 200)
    out[fix, :3] = OL
    return Image.fromarray(out, 'RGBA')


def build_icons():
    ensure(f'{ROOT}/icons/16', f'{ROOT}/icons/24', f'{ROOT}/icons/32', f'{ROOT}/icons/x2', f'{ROOT}/icons/x3')
    src = pick('icons', 'icons')
    im = keyout(src, 'm', grow=2, soft=False)
    Wd, Hd = im.size
    cols, rows = 4, 3
    sheet = []
    for k, name in enumerate(ICON_ORDER):
        r, c = divmod(k, cols)
        cell = im.crop((c * Wd // cols, r * Hd // rows, (c + 1) * Wd // cols, (r + 1) * Hd // rows))
        cell = drop_small(cell, 0.01)
        for n in (16, 24, 32):
            if name == 'star_empty' and PICK.get('star_empty_from_star', True):
                # 빈 별 = 채운 별을 어두운 회청으로 탈색(남색 배경에서도 보이도록 외곽선 유지)
                p = Image.open(f'{ROOT}/icons/{n}/ico.star.png').convert('RGBA')
                a = np.asarray(p).astype(int).copy()
                lum = a[..., :3].mean(2)
                isol = (lum < 50)
                v = (lum / 255) * 0.5 + 0.3
                tint = np.stack([v * 150, v * 165, v * 200], 2)
                a[..., :3] = np.where(isol[..., None], a[..., :3], np.clip(tint, 0, 255))
                p = Image.fromarray(a.astype(np.uint8), 'RGBA')
            else:
                p = pixelize(cell, n)
            p.save(f'{ROOT}/icons/{n}/ico.{name}.png', optimize=True)
            if n == 32:
                p.resize((64, 64), Image.NEAREST).save(f'{ROOT}/icons/x2/ico.{name}.png', optimize=True)
                p.resize((96, 96), Image.NEAREST).save(f'{ROOT}/icons/x3/ico.{name}.png', optimize=True)
                sheet.append(p)
    # 아틀라스(32px, 1행) + QA 확대
    at = Image.new('RGBA', (32 * len(sheet), 32))
    for i, p in enumerate(sheet):
        at.alpha_composite(p, (i * 32, 0))
    at.save(f'{ROOT}/icons/card_icons@1x.png', optimize=True)
    fr = {f'ico.{n}': {'frame': {'x': i * 32, 'y': 0, 'w': 32, 'h': 32}} for i, n in enumerate(ICON_ORDER)}
    json.dump({'frames': fr, 'meta': {'image': 'card_icons@1x.png', 'size': {'w': at.width, 'h': 32}, 'scale': 1}}, open(f'{ROOT}/icons/card_icons@1x.json', 'w'), indent=1)
    qa = Image.new('RGBA', (at.width * 4 + 40, 32 * 4 * 2 + 30), (16, 28, 58, 255))
    qa.alpha_composite(at.resize((at.width * 4, 128), Image.NEAREST), (20, 10))
    light = Image.new('RGBA', (at.width * 4, 128), (232, 220, 190, 255)); light.alpha_composite(at.resize((at.width * 4, 128), Image.NEAREST))
    qa.alpha_composite(light, (20, 148))
    qa.save(f'{ROOT}/qa/_icons_x4.png')
    print('icons ok')


# ---------------- 미리보기 ----------------
PORTRAITS = 'public/assets/portraits'
BADGES = 'public/assets/ui/pixel/x1'  # 담당 B 산출물(읽기 전용 사용)
DEMO = [  # 수치는 미리보기용 더미값(실데이터 아님)
    {'id': 'yi_sun_sin', 'name': '이순신', 'rar': 's', 'lv': 30, 'atk': 1250, 'hp': 4820, 'cost': 9, 'badges': ['badge_hero_naval', 'badge_troop_naval']},
    {'id': 'joan_of_arc', 'name': '잔 다르크', 'rar': 'a', 'lv': 24, 'atk': 980, 'hp': 3960, 'cost': 7, 'badges': ['badge_hero_cavalry', 'badge_troop_cavalry']},
    {'id': 'jose_rizal', 'name': '호세 리살', 'rar': 'c', 'lv': 12, 'atk': 410, 'hp': 2150, 'cost': 3, 'badges': ['badge_hero_mage', 'badge_troop_mage']},
]


def R(name, cw):
    r = LAYOUT['rects'][name] if isinstance(name, str) else name
    return [round(v * cw) for v in r]


def stroke_text(img, xy, text, f, fill, stroke, sw, anchor):
    d = ImageDraw.Draw(img)
    d.text(xy, text, font=f, fill=fill, stroke_width=sw, stroke_fill=stroke, anchor=anchor)


def best_icon(name, px):
    for n in (32, 24, 16):
        if n <= px * 1.15:
            return Image.open(f'{ROOT}/icons/{n}/ico.{name}.png').convert('RGBA')
    return Image.open(f'{ROOT}/icons/16/ico.{name}.png').convert('RGBA')


def render(h, cw, locked=False):
    ch = round(cw * H / W)
    T = LAYOUT['text']
    bgp = f'{ROOT}/qa/_bg_master_{h["rar"]}.png'
    card = Image.open(bgp).convert('RGBA').resize((cw, ch), Image.LANCZOS) if os.path.exists(bgp) else Image.new('RGBA', (cw, ch), (40, 52, 90, 255))
    por = Image.open(f'{PORTRAITS}/{h["id"]}.png').convert('RGBA').resize((cw, ch), Image.LANCZOS)
    if locked:
        g = por.convert('LA').convert('RGBA'); g.putalpha(por.getchannel('A')); por = g
    card.alpha_composite(por)
    card.alpha_composite(Image.open(f'{ROOT}/parts/card.shade.png').convert('RGBA').resize((cw, ch), Image.BILINEAR))
    card.alpha_composite(Image.open(f'{ROOT}/qa/_frame_master_{h["rar"]}.png').resize((cw, ch), Image.LANCZOS))
    compact = cw < LAYOUT['compact_mode']['when_card_width_px_below']
    # 이름
    nt = R('name_text', cw)
    sz = max(T['name']['min_px'], round(T['name']['size'] * cw))
    f = font(FONT_NAME, sz)
    while f.getlength(h['name']) > nt[2] and sz > T['name']['min_px']:
        sz -= 1; f = font(FONT_NAME, sz)
    stroke_text(card, (nt[0] + nt[2] / 2, nt[1] + nt[3] / 2), h['name'], f, T['name']['color'], T['name']['stroke'], max(1, round(T['name']['stroke_w'] * cw)), 'mm')
    # 별
    st = LAYOUT['star']; sr = R('star_row', cw)
    spx = max(10, round(st['size'] * cw)); gap = max(1, round(st['gap'] * cw))
    n_on = st['rarity_default'][h['rar'].upper()]
    tot = st['max'] * spx + (st['max'] - 1) * gap
    x = sr[0] + (sr[2] - tot) // 2
    for i in range(st['max']):
        ic = best_icon('star' if i < n_on else 'star_empty', spx)
        s = max(1, spx // ic.width) if spx >= ic.width else None
        icr = ic.resize((ic.width * s, ic.height * s), Image.NEAREST) if s else ic.resize((spx, spx), Image.LANCZOS)
        card.alpha_composite(icr, (x + (spx - icr.width) // 2, sr[1] + (sr[3] - icr.height) // 2)); x += spx + gap
    # 병종 뱃지 2개
    for i, b in enumerate(h['badges']):
        br = R(f'badge_slot_{i + 1}', cw)
        p = f'{BADGES}/{b}.png'
        if os.path.exists(p):
            bi = Image.open(p).convert('RGBA')
            s = br[2] / bi.width
            bi = bi.resize((bi.width * int(s), bi.height * int(s)), Image.NEAREST) if s >= 1 else bi.resize((br[2], round(bi.height * s)), Image.LANCZOS)
            card.alpha_composite(bi, (br[0], br[1]))
    # 코스트
    ct = R('cost_text', cw)
    f = font(FONT_LETTER, max(T['cost']['min_px'], round(T['cost']['size'] * cw)), 'Bold')
    stroke_text(card, (ct[0] + ct[2] / 2, ct[1] + ct[3] / 2), str(h['cost']), f, T['cost']['color'], T['cost']['stroke'], max(1, round(T['cost']['stroke_w'] * cw)), 'mm')
    if compact:
        lt = R(LAYOUT['compact_mode']['compact_lv_rect'], cw)
        f = font(FONT_LETTER, max(T['lv']['min_px'], round(T['lv']['size'] * cw)), 'Bold')
        stroke_text(card, (lt[0] + lt[2] / 2, lt[1] + lt[3] / 2), f'Lv.{h["lv"]}', f, T['lv']['color'], T['lv']['stroke'], 1, 'mm')
    else:
        lt = R('lv_text', cw)
        f = font(FONT_LETTER, max(T['lv']['min_px'], round(T['lv']['size'] * cw)), 'Bold')
        stroke_text(card, (lt[0], lt[1] + lt[3] / 2), f'Lv.{h["lv"]}', f, T['lv']['color'], T['lv']['stroke'], max(1, round(T['lv']['stroke_w'] * cw)), 'lm')
        for row in LAYOUT['stat_rows']:
            ir = R(row['icon_rect'], cw); tr = R(row['text_rect'], cw)
            ic = best_icon(row['icon'].replace('ico.', ''), ir[2])
            card.alpha_composite(ic, (ir[0] + (ir[2] - ic.width) // 2, ir[1] + (ir[3] - ic.height) // 2))
            f = font(FONT_LETTER, max(T['stat']['min_px'], round(T['stat']['size'] * cw)), 'Bold')
            stroke_text(card, (tr[0], tr[1] + tr[3] / 2), str(h[row['key']]), f, T['stat']['color'], T['stat']['stroke'], max(1, round(T['stat']['stroke_w'] * cw)), 'lm')
    if locked:
        card.alpha_composite(Image.open(f'{ROOT}/frames/card.locked@3x.png').convert('RGBA').resize((cw, ch), Image.LANCZOS))
    m = round_mask(cw, ch, round(LAYOUT['master']['corner_radius'] * cw))
    card.putalpha(Image.fromarray(np.minimum(np.asarray(card.getchannel('A')), np.asarray(m))))
    return card


def build_preview():
    ensure(f'{ROOT}/preview')
    bgc = (11, 19, 40, 255)
    lab = font(FONT_NAME, 16)
    # 데스크톱(카드 폭 240) + 확대(448) 시트
    rows = []
    for cw, title in [(448, '확대 448px(@2x 원본 크기)'), (240, '데스크톱 카드 폭 240px'), (172, '390px 모바일 2열 카드 폭 172px'), (120, '390px 3열 카드 폭 120px(compact)')]:
        cards = [render(h, cw) for h in DEMO]
        cards.append(render(DEMO[1], cw, locked=True))
        back = Image.open(f'{ROOT}/frames/card.back@3x.png').convert('RGBA').resize((cw, round(cw * H / W)), Image.LANCZOS)
        cards.append(back)
        rows.append((title, cards))
    gap = 16
    Wt = max(sum(c.width for c in cs) + gap * (len(cs) + 1) for _, cs in rows)
    Ht = sum(cs[0].height + 40 for _, cs in rows) + gap
    sheet = Image.new('RGBA', (Wt, Ht), bgc)
    d = ImageDraw.Draw(sheet); y = 8
    for title, cs in rows:
        d.text((gap, y), title + '  (S 이순신 / A 잔 다르크 / C 호세 리살 / 미보유 잠금 / 뒷면, 수치는 더미)', font=lab, fill=(243, 220, 142))
        y += 28; x = gap
        for c in cs:
            sheet.alpha_composite(c, (x, y)); x += c.width + gap
        y += cs[0].height + 12
    sheet.convert('RGB').save(f'{ROOT}/preview/card_preview_sheet.png', optimize=True)
    # 390px 모바일 화면 목업(2열)
    mob = Image.new('RGBA', (390, 844), bgc)
    md = ImageDraw.Draw(mob)
    md.text((16, 14), '영웅', font=font(FONT_NAME, 20), fill=(243, 220, 142))
    cw = 172; x0 = 16; y = 52
    for i, h in enumerate(DEMO + [DEMO[1]]):
        c = render(h, cw, locked=(i == 3))
        mob.alpha_composite(c, (x0 + (i % 2) * (cw + 14), y + (i // 2) * (c.height + 14)))
    mob.convert('RGB').save(f'{ROOT}/preview/card_preview_mobile390.png', optimize=True)
    # 희귀도 4종 프레임 비교(같은 초상)
    cmp_ = Image.new('RGBA', (4 * 240 + 5 * gap, 321 + 2 * gap), bgc)
    for i, r in enumerate(RAR):
        c = render({**DEMO[0], 'rar': r}, 240)
        cmp_.alpha_composite(c, (gap + i * (240 + gap), gap))
    cmp_.convert('RGB').save(f'{ROOT}/preview/card_rarity_compare.png', optimize=True)
    print('preview ok')


def write_layout(measured):
    for k in ('rank_letter', 'cost_text'):
        if k in measured:
            LAYOUT['rects'][k] = [round(v, 4) for v in measured[k]]
    hs = [v for k, v in measured.items() if k.startswith('rank_flag_h_')]
    if hs:
        LAYOUT['rects']['rank_flag'][3] = round(max(hs), 4)
    json.dump(LAYOUT, open(f'{ROOT}/card_layout.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)


def build_manifest():
    import datetime
    base = 'public/'
    rel = lambda p: p[len(base):] if p.startswith(base) else p
    sz = lambda p: os.path.getsize(p) if os.path.exists(p) else None
    dim = lambda p: list(Image.open(p).size) if os.path.exists(p) and not p.endswith('.json') else None
    for r in RAR:
        if r not in SLICE and os.path.exists(f'{ROOT}/frames/card.border.{r}@3x.png'):
            SLICE[r] = measure_slice(Image.open(f'{ROOT}/frames/card.border.{r}@3x.png').convert('RGBA'))
    common = {'generator': 'gemini interactions API', 'model': 'gemini-nano-banana-2.1', 'script': 'docker/gemini/card_gen.mjs + card_pp.py',
              'prompt_ref': 'docker/gemini/card_style.mjs', 'license': '자체 생성(AI 생성물, 상업 이용 조건 공개 전 법무 확인 메모)', 'provenance': '사용자 첨부 참고 이미지는 구성만 참고(복제·트레이싱 없음)'}
    items = []

    def add(key, kind, files, **kw):
        fs = [f for f in files if os.path.exists(f)]
        if not fs:
            return
        items.append({'key': key, 'type': kind, 'files': {os.path.basename(f).split('@')[-1] if '@' in f else os.path.basename(f): {'path': rel(f), 'size': dim(f), 'bytes': sz(f)} for f in fs}, **kw, **common})

    for r in RAR:
        add(f'card.frame.{r}', 'card_overlay', [f'{ROOT}/frames/card.frame.{r}@{t}.{e}' for t in ('2x', '3x') for e in ('webp', 'png')],
            alpha=True, filter='LINEAR', use='카드 전체 오버레이(테두리+명판+등급 깃발 글자 포함+스탯 바+코스트 메달). art_rect 에 균등 스케일', slice9=None,
            load='@2x: 카드 표시 폭*DPR <= 448, 그 외 @3x. WebP 우선, 미지원 시 PNG', qa='pass', verify=False)
        add(f'card.border.{r}', 'card_border', [f'{ROOT}/frames/card.border.{r}@3x.{e}' for e in ('webp', 'png')], alpha=True, filter='LINEAR',
            use='테두리만(합성 오버레이 대신 부품으로 조립할 때). 9-slice 가능', slice9_px_at_3x=SLICE.get(r), qa='pass')
        add(f'card.bg.{r}', 'card_backdrop', [f'{ROOT}/frames/card.bg.{r}@{t}.{e}' for t in ('2x', '3x') for e in ('webp', 'jpg')], alpha=False, filter='LINEAR',
            use='초상화 뒤 배경(초상 PNG 가 투명 배경이므로 필수). art_rect 에 cover', qa='pass')
        add(f'card.flag.{r}', 'card_part', [f'{ROOT}/parts/card.flag.{r}.png'], alpha=True, filter='LINEAR', use='등급 깃발(글자 포함) 단독 부품', qa='pass')
    add('card.back', 'card_overlay', [f'{ROOT}/frames/card.back@{t}.{e}' for t in ('2x', '3x') for e in ('webp', 'png')], alpha=True, filter='LINEAR', use='카드 뒷면(가챠 연출·빈 슬롯)', qa='pass')
    add('card.locked', 'card_overlay', [f'{ROOT}/frames/card.locked@{t}.{e}' for t in ('2x', '3x') for e in ('webp', 'png')], alpha=True, filter='LINEAR',
        use='미보유 오버레이(어두운 막+잠금 인장). 아래 초상은 FE 에서 흑백(desaturate)+밝기 60% 권장, 프레임은 해당 희귀도 그대로', qa='pass')
    add('card.shade', 'card_part', [f'{ROOT}/parts/card.shade.png'], alpha=True, filter='LINEAR', use='8x256 세로 그라데이션, art_rect 로 늘림(상단 이름·하단 스탯 가독성)', qa='pass')
    for k in ('banner', 'statbar', 'medal'):
        add(f'card.{"banner" if k == "banner" else "part." + k}', 'card_part', [f'{ROOT}/parts/card.part.{k}.png'], alpha=True, filter='LINEAR',
            use={'banner': '이름 명판(가로 3-slice, 좌우 캡 16%)', 'statbar': '스탯 바(가로 3-slice, 좌우 캡 8%)', 'medal': '원형 코스트 메달'}[k], qa='pass')
    for n in ICON_ORDER:
        add(f'ico.{n}', 'pixel_icon', [f'{ROOT}/icons/{s}/ico.{n}.png' for s in ('16', '24', '32', 'x2', 'x3')], alpha=True, filter='NEAREST',
            use='도트 아이콘. 정수 배율만(16/24/32 원본, x2=64, x3=96). 주의: 로더 pixelKeys 정규식(tile|unit|icon|fx|deco)에 ico. 가 없으므로 NEAREST 를 직접 지정', qa=ICON_QA.get(n, 'pass'))
    add('atlas.card_icons', 'atlas', [f'{ROOT}/icons/card_icons@1x.png', f'{ROOT}/icons/card_icons@1x.json'], filter='NEAREST', use='32px 아이콘 12종 1행 아틀라스(Phaser JSON hash)')
    total = {}
    for it in items:
        for f in it['files'].values():
            ext = f['path'].rsplit('.', 1)[-1]
            total[ext] = total.get(ext, 0) + (f['bytes'] or 0)
    frag = {'_note': '영웅 메뉴 카드 UI manifest 조각(안아트 카드 담당). 본 manifest.json 에 병합하지 않음(팀장 확인 후 병합). 레이아웃: assets/card/card_layout.json',
            'generatedAt': datetime.datetime.utcnow().isoformat() + 'Z', 'basePath': 'public', 'layout': 'assets/card/card_layout.json',
            'key_rules': {'card.frame.<s|a|b|c>': '합성 오버레이', 'card.border.<r>': '테두리만(9-slice)', 'card.bg.<r>': '초상 뒤 배경', 'card.flag.<r>': '등급 깃발',
                          'card.banner': '이름 명판', 'card.part.statbar|medal': '부품', 'card.shade': '가독성 그라데이션', 'card.back': '뒷면', 'card.locked': '미보유 오버레이',
                          'ico.stat_<atk|hp|def|move|range|mp|cost>': '스탯 도트 아이콘', 'ico.star|star_empty|hourglass|lock|lvup': '보조 도트 아이콘'},
            'bytes_by_ext': total, 'items': items}
    json.dump(frag, open(f'{ROOT}/manifest_fragment.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('manifest items', len(items), total)


SLICE = {}
ICON_QA = {}


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('all', 'icons'):
        build_icons()
    if what in ('all', 'parts'):
        build_parts()
        write_layout(json.load(open(f'{ROOT}/qa/_measured.json')))
    if what in ('all', 'preview', 'parts'):
        build_preview()
    if what in ('all', 'parts', 'manifest'):
        build_manifest()
