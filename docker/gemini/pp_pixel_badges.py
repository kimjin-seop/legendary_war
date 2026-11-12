"""도트 뱃지·표식 후처리(담당 B, 2026-11-01). API 호출 없음.
raw/pix/<sheet>.jpg(4x4, 마젠타 배경, '32px 도트 x16 확대' 형태) -> 칸 분할 -> 마젠타 키 -> 도트 격자 재표본(목표 크기 N px, 블록 최빈색)
-> 팔레트 양자화(아이콘당 <=12색) -> 1px 외곽선 보정 -> 원형(영웅)/방패(병사) 프레임·등급 글자는 코드로 픽셀 단위 조립.
실행(컨테이너): python docker/gemini/pp_pixel_badges.py extract <sheet> [<sheet>...]   (심볼 후보 미리보기: public/assets/ui/pixel/qa/)
              python docker/gemini/pp_pixel_badges.py build <picks.json>             (최종 PNG x1/x2/x3 + 아틀라스 + manifest 조각)
의존(pip 공식 레지스트리): pillow numpy
"""
import sys, os, json
import numpy as np
from PIL import Image

RAW = 'public/assets/raw/pix'
OUT = 'public/assets/ui/pixel'
OL = (20, 12, 28)  # 외곽선 #140C1C


def key_mask(rgb):
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    return (r - g > 70) & (b - g > 70) & (r > 130) & (b > 130)


def cells(path, n=4):
    im = np.asarray(Image.open(path).convert('RGB'))
    H, W = im.shape[:2]
    out = []
    for k in range(n * n):
        r, c = divmod(k, n)
        out.append(im[r * H // n:(r + 1) * H // n, c * W // n:(c + 1) * W // n])
    return out


def period(sig, lo=9.0, hi=24.0):
    """경계 신호(열/행 색 변화량)에서 도트 주기·위상 추정."""
    best = (0, 16.0, 0.0)
    n = len(sig)
    base = sig.mean() + 1e-6
    for p in np.arange(lo, hi, 0.25):
        for ph in np.arange(0, p, 0.5):
            idx = np.round(np.arange(ph, n - 1, p)).astype(int)
            idx = idx[idx < n]
            if len(idx) < 4:
                continue
            s = sig[idx].mean() / base
            if s > best[0]:
                best = (s, p, ph)
    return best


def extract(cell, target=None):
    """칸 -> (도트 RGBA, 추정 주기). target 이 있으면 bbox 긴 변을 target 픽셀로 재표본."""
    key = key_mask(cell)
    ys, xs = np.where(~key)
    if len(xs) < 50:
        return None, None
    # 칸 가장자리 잡티 제외: 가장 큰 덩어리 bbox 대신 1~99 백분위
    x0, x1 = np.percentile(xs, [0.2, 99.8]).astype(int)
    y0, y1 = np.percentile(ys, [0.2, 99.8]).astype(int)
    sub = cell[y0:y1 + 1, x0:x1 + 1].astype(int)
    k = key[y0:y1 + 1, x0:x1 + 1]
    dx = np.abs(np.diff(sub, axis=1)).sum(axis=2).mean(axis=0)
    dy = np.abs(np.diff(sub, axis=0)).sum(axis=2).mean(axis=1)
    if target:
        p = max(sub.shape[:2]) / target
        px, phx, py, phy = p, 0.0, p, 0.0
    else:
        _, px, phx = period(dx)
        _, py, phy = period(dy)
        p = (px + py) / 2
        px = py = p
    nx = int(np.ceil((sub.shape[1] - phx) / px)); ny = int(np.ceil((sub.shape[0] - phy) / py))
    outc = np.zeros((ny, nx, 4), np.uint8)
    for j in range(ny):
        for i in range(nx):
            a0 = int(round(phy + (j - (1 if phy > 0 else 0)) * py)) if phy > 0 else int(round(j * py))
            b0 = int(round(phx + (i - (1 if phx > 0 else 0)) * px)) if phx > 0 else int(round(i * px))
            a0 = max(0, a0); b0 = max(0, b0)
            a1 = min(sub.shape[0], int(round(a0 + py))); b1 = min(sub.shape[1], int(round(b0 + px)))
            if a1 <= a0 or b1 <= b0:
                continue
            # 블록 안쪽 60% 만 사용(경계 번짐 제외)
            ma = (a1 - a0) // 5; mb = (b1 - b0) // 5
            blk = sub[a0 + ma:a1 - ma or a1, b0 + mb:b1 - mb or b1]; kb = k[a0 + ma:a1 - ma or a1, b0 + mb:b1 - mb or b1]
            if blk.size == 0 or kb.mean() > 0.5:
                continue
            px_ = blk[~kb]
            # 최빈색(16단계 양자화 후 최빈 bin 의 평균)
            q = (px_ // 24)
            codes = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
            vals, cnt = np.unique(codes, return_counts=True)
            m = px_[codes == vals[cnt.argmax()]].mean(axis=0)
            outc[j, i, :3] = m.astype(np.uint8); outc[j, i, 3] = 255
    return outc, round(float(p), 2)


def quantize(rgba, ncol=12):
    a = rgba[..., 3] > 0
    if not a.any():
        return rgba
    im = Image.fromarray(rgba[..., :3]).quantize(colors=ncol, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    o = rgba.copy(); o[..., :3] = np.asarray(im); o[~a] = 0
    return o


def despeckle(rgba):
    """고립 1픽셀(상하좌우 모두 투명) 제거, 투명 1픽셀 구멍(상하좌우 모두 불투명) 메움."""
    a = rgba[..., 3] > 0
    p = np.pad(a, 1)
    nb = p[:-2, 1:-1].astype(int) + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]
    o = rgba.copy()
    o[a & (nb == 0)] = 0
    hole = (~a) & (nb == 4)
    if hole.any():
        pr = np.pad(rgba, ((1, 1), (1, 1), (0, 0)))
        for y, x in zip(*np.where(hole)):
            o[y, x] = pr[y, x + 1]  # 위 이웃 색
    return o


def outline(rgba):
    """불투명 가장자리 픽셀이 밝으면 바깥 투명 칸에 1px 외곽선 추가(이미 어두운 외곽선이면 그대로)."""
    a = rgba[..., 3] > 0
    lum = rgba[..., :3].astype(int) @ np.array([3, 6, 1]) / 10
    H, W = a.shape
    o = np.pad(rgba, ((1, 1), (1, 1), (0, 0))); ap = np.pad(a, 1); lp = np.pad(lum, 1)
    add = np.zeros_like(ap)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nb_a = np.roll(np.roll(ap, dy, 0), dx, 1); nb_l = np.roll(np.roll(lp, dy, 0), dx, 1)
        add |= (~ap) & nb_a & (nb_l > 70)
    o[add] = (*OL, 255)
    return o


def trim(rgba):
    a = rgba[..., 3] > 0
    ys, xs = np.where(a)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def up(rgba, s):
    return np.repeat(np.repeat(rgba, s, 0), s, 1)


def panel(items, scale=6, cols=8, bg=(16, 28, 58)):
    """미리보기: 각 항목 x scale(nearest) + x1 실제 크기, 남색 바탕."""
    mw = max(i[1].shape[1] for i in items); mh = max(i[1].shape[0] for i in items)
    tw = mw * scale + 16; th = mh * scale + mh * 2 + 20
    rows = (len(items) + cols - 1) // cols
    cv = Image.new('RGBA', (tw * cols, th * rows), (*bg, 255))
    for n, (name, im) in enumerate(items):
        r, c = divmod(n, cols)
        big = Image.fromarray(up(im, scale), 'RGBA')
        cv.alpha_composite(big, (c * tw + 8, r * th + 4))
        y2 = r * th + mh * scale + 10
        cv.alpha_composite(Image.fromarray(im, 'RGBA'), (c * tw + 8, y2))
        cv.alpha_composite(Image.fromarray(up(im, 2), 'RGBA'), (c * tw + 8 + im.shape[1] + 6, y2))
    return cv


def cmd_extract(sheets):
    os.makedirs(f'{OUT}/qa', exist_ok=True); os.makedirs(f'{OUT}/sym', exist_ok=True)
    rep = {}
    for sh in sheets:
        names = json.load(open('docker/gemini/pix_names.json'))[sh.rstrip('0123456789')]
        items = []
        for idx, cell in enumerate(cells(f'{RAW}/{sh}.jpg')):
            if idx >= len(names):
                break
            for tgt in (None, 22, 28):
                im, p = extract(cell, tgt)
                if im is None:
                    continue
                im = trim(outline(despeckle(quantize(despeckle(im)))))
                tag = f'{names[idx]}@{"auto" if tgt is None else tgt}'
                Image.fromarray(im, 'RGBA').save(f'{OUT}/sym/{sh}_{tag}.png')
                items.append((tag, im)); rep[f'{sh}:{tag}'] = {'period': p, 'size': list(im.shape[:2][::-1])}
        panel(items, scale=5, cols=9).save(f'{OUT}/qa/extract_{sh}.png')
    json.dump(rep, open(f'{OUT}/qa/extract_report.json', 'w'), indent=1)
    print(json.dumps(rep))


# ===================================================================== build: 프레임·글자 코드 조립
# 병종 고유색(채움 3단: 어두움/중간/밝음). 팀장 권고: 보병 청, 창병 녹, 기병 적, 수병 청록, 궁병 황, 마법사 보라, 승려 흰/금, 마물 암적, 암살자 검정/회
TROOP_FILL = {
    'sword': ['#182C70', '#2C58C0', '#4E80E8'], 'spear': ['#1C5020', '#2E7A2A', '#4CA444'], 'cavalry': ['#5A1018', '#9A2028', '#CC443C'],
    'naval': ['#0C4850', '#167E80', '#30AEA6'], 'archer': ['#8A6A08', '#D8B020', '#F8DC60'], 'mage': ['#2E1450', '#5A2C90', '#8250C4'],
    'healer': ['#9C9070', '#D4CCB0', '#F4F0E0'], 'gunner': ['#7A3A0A', '#C86418', '#F09440'], 'monster': ['#22040A', '#3E0A14', '#5C1420'], 'assassin': ['#4A4A5C', '#6E6E84', '#9898AC'],
}
RING = {'gold': ['#6A4410', '#C08A28', '#F0C84A', '#FFF0A8'], 'silver': ['#3C4A6A', '#7E90B4', '#BCCAE4', '#F0F6FF']}
RARITY = {'S': ['#7A4E08', '#F0B23C', '#FFE08A'], 'A': ['#4A2068', '#B06AD8', '#E0B0FF'], 'B': ['#0C5650', '#2FB5A6', '#90EEDC'], 'C': ['#3C4454', '#8B97A8', '#D0D8E4']}
GLYPH = {
    'S': ['.#####.', '##...##', '##.....', '.###...', '..####.', '.....##', '.....##', '##...##', '.#####.'],
    'A': ['..###..', '.##.##.', '##...##', '##...##', '#######', '##...##', '##...##', '##...##', '##...##'],
    'B': ['######.', '##...##', '##...##', '######.', '##...##', '##...##', '##...##', '##...##', '######.'],
    'C': ['.#####.', '##...##', '##.....', '##.....', '##.....', '##.....', '##.....', '##...##', '.#####.'],
}
hx = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))


def erode(m):
    p = np.pad(m, 1)
    return m & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]


def shape_mask(kind, W, H):
    yy, xx = np.mgrid[0:H, 0:W] + 0.5
    if kind == 'circle':
        return (xx - W / 2) ** 2 + (yy - H / 2) ** 2 <= (W / 2) ** 2 - 0.5
    if kind == 'shield':  # 위 평평(모서리 1px 깎음) → 양옆 수직 → 아래 뾰족
        cx = W / 2; top, mid = 1, H * 0.56
        m = (yy >= top) & (np.abs(xx - cx) <= cx - 1)
        lower = yy > mid
        t = (yy - mid) / (H - 0.5 - mid)  # 0..1
        half = (cx - 1) * np.sqrt(np.clip(1 - t ** 1.6, 0, 1))
        m &= ~lower | (np.abs(xx - cx) <= half)
        m[0:2, 0:2] = m[0:2, -2:] = False; m[1, 2] = m[1, -3] = m[2, 1] = m[2, -2] = False
        return m
    if kind == 'gem':  # 팔각 판(등급)
        c = W * 0.28
        return (xx >= 0) & (xx <= W) & (np.abs(xx - W / 2) + np.abs(yy - H / 2) <= W / 2 + H / 2 - c)
    raise ValueError(kind)


def frame(kind, W, H, ring, fill, ring_w=2):
    """외곽선(1) + 링(ring_w, 광원 왼쪽 위 명암) + 안쪽 선(1) + 채움(3단)."""
    m0 = shape_mask(kind, W, H); layers = [m0]
    for _ in range(ring_w + 2):
        layers.append(erode(layers[-1]))
    o = np.zeros((H, W, 4), np.uint8)
    yy, xx = np.mgrid[0:H, 0:W]
    diag = (xx + yy) / (W + H - 2)  # 0 = 왼쪽 위, 1 = 오른쪽 아래
    o[m0] = (*OL, 255)
    ringm = layers[1] & ~layers[1 + ring_w]
    rc = [hx(c) for c in ring]
    for y, x in zip(*np.where(ringm)):
        d = diag[y, x]
        inner = not layers[1 + ring_w - 1][y, x] if ring_w > 1 else False
        c = rc[3] if d < 0.22 else rc[2] if d < 0.5 else rc[1] if d < 0.8 else rc[0]
        if inner and d < 0.8:  # 링 안쪽 줄은 한 단계 어둡게(입체감)
            c = rc[max(0, rc.index(c) - 1)]
        o[y, x] = (*c, 255)
    inl = layers[1 + ring_w] & ~layers[2 + ring_w]
    o[inl] = (*OL, 255)
    fm = layers[2 + ring_w]; fc = [hx(c) for c in fill]
    for y, x in zip(*np.where(fm)):
        d = diag[y, x]
        o[y, x] = (*(fc[2] if d < 0.3 else fc[1] if d < 0.72 else fc[0]), 255)
    # 채움 왼쪽 위 1px 하이라이트 줄(안쪽 선 바로 안)
    hl = fm & ~erode(fm) & (diag < 0.42)
    lc = np.clip(np.array(fc[2]) * 1.18 + 20, 0, 255).astype(np.uint8)
    o[hl] = (*lc, 255)
    return o


def paste(dst, src, x0, y0):
    a = src[..., 3] > 0
    H, W = src.shape[:2]
    for y in range(H):
        for x in range(W):
            if a[y, x] and 0 <= y + y0 < dst.shape[0] and 0 <= x + x0 < dst.shape[1]:
                dst[y + y0, x + x0] = src[y, x]
    return dst


def glyph(ch, col):
    g = GLYPH[ch]; h, w = len(g), len(g[0])
    o = np.zeros((h + 2, w + 2, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            if g[y][x] == '#':
                o[y + 1, x + 1] = (*hx(col), 255)
    return outline_dark(o)


def outline_dark(rgba):
    a = rgba[..., 3] > 0
    p = np.pad(a, 1)
    nb = p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:]
    o = rgba.copy(); o[nb & ~a] = (*OL, 255)
    return o


def proc_symbol(name, target):
    """코드로 그린 도트 심볼(2026-11-03 안아트, 총병): 비스듬한 화승총(짙은 개머리판 + 굵은 쇠 총열) + 총구 연기. 1px 짙은 외곽선 강제(궁병 활 심볼과 같은 대비)."""
    from PIL import ImageDraw
    n = target; im = Image.new('RGBA', (n, n), (0, 0, 0, 0)); d = ImageDraw.Draw(im); k = n / 24.0
    P = lambda x, y: (round(x * k), round(y * k))
    d.line([P(5, 18), P(17, 6)], fill=(46, 48, 58, 255), width=max(3, round(3 * k)))           # 굵은 쇠 총열
    d.line([P(5, 17), P(16, 6)], fill=(132, 136, 152, 255), width=1)                            # 총열 빛
    d.polygon([P(2, 21), P(8, 14), P(12, 18), P(5, 23)], fill=(78, 44, 20, 255))                # 개머리판(짙은 나무)
    d.line([P(3, 20), P(8, 15)], fill=(140, 90, 44, 255), width=1)
    d.rectangle([P(9, 12), P(12, 15)], fill=(220, 180, 70, 255))                                # 화승 장치(놋쇠)
    d.ellipse([P(17, 1), P(23, 7)], fill=(236, 236, 240, 255))                                  # 연기
    a = np.asarray(im).copy(); a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
    al = a[..., 3] > 0; o = np.pad(a, ((1, 1), (1, 1), (0, 0))); ap = np.pad(al, 1); add = np.zeros_like(ap)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)): add |= (~ap) & np.roll(np.roll(ap, dy, 0), dx, 1)
    o[add] = (*OL, 255)
    return trim(o)


def symbol(pick, target):
    if pick[0] == 'proc': return proc_symbol(pick[1], target)
    sheet, name = pick
    names = json.load(open('docker/gemini/pix_names.json'))[sheet.rstrip('0123456789')]
    cell = cells(f'{RAW}/{sheet}.jpg')[names.index(name)]
    im, _ = extract(cell, target)
    return trim(outline(despeckle(quantize(despeckle(im)))))


def center(canvas, sym, dy=0):
    H, W = canvas.shape[:2]; h, w = sym.shape[:2]
    return paste(canvas, sym, (W - w) // 2, (H - h) // 2 + dy)


def fit(sym, W, H):
    o = np.zeros((H, W, 4), np.uint8)
    return center(o, sym)


def cmd_build(picks_path):
    P = json.load(open(picks_path))
    out = {}  # key -> (rgba, note)
    for t in TROOP_FILL:
        s_c = symbol(P['troop'][t], P.get('sym_size_circle', 20))
        s_s = symbol(P['troop'][t], P.get('sym_size_shield', 18))
        out[f'badge.hero.{t}'] = center(frame('circle', 32, 32, RING['gold'], TROOP_FILL[t]), s_c)
        out[f'badge.troop.{t}'] = center(frame('shield', 30, 32, RING['silver'], TROOP_FILL[t]), s_s, dy=-2)
        out[f'sym.troop.{t}'] = fit(symbol(P['troop'][t], 24), 24, 24)
    for r, col in RARITY.items():
        b = frame('gem', 20, 20, [col[0], col[1], col[2], '#FFFFFF'], ['#141C38', '#1E2A50', '#2C3C6C'], ring_w=2)
        out[f'badge.rarity.{r}'] = center(b, glyph(r, '#FFFFFF' if r != 'S' else '#FFF0A8'))
    for k, (pick, n) in P['marks'].items():
        out[k] = fit(symbol(pick, n), n, n)
    for k, (pick, n, box) in P['icons'].items():
        out[k] = fit(symbol(pick, n), box, box)
    return out


def save_all(out, P):
    import shutil
    for s in (1, 2, 3):
        os.makedirs(f'{OUT}/x{s}', exist_ok=True)
    files = {}
    for k, im in out.items():
        fn = k.replace('.', '_')
        for s in (1, 2, 3):
            Image.fromarray(up(im, s), 'RGBA').save(f'{OUT}/x{s}/{fn}.png', optimize=True)
        files[k] = (fn, im.shape[1], im.shape[0])
    # 아틀라스(Phaser hash JSON) x1/x2/x3: 가로 줄 배치, 프레임 사이 2px(x1 기준) 여백
    for s in (1, 2, 3):
        pad = 2 * s; x = pad; frames = {}; Hh = 0; comps = []
        for k, im in out.items():
            u = up(im, s); h, w = u.shape[:2]
            comps.append((x, u)); frames[k] = {'frame': {'x': x, 'y': pad, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
                                               'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h}}
            x += w + pad; Hh = max(Hh, h + 2 * pad)
        cv = Image.new('RGBA', (x, Hh), (0, 0, 0, 0))
        for x0, u in comps:
            cv.alpha_composite(Image.fromarray(u, 'RGBA'), (x0, pad))
        cv.save(f'{OUT}/pixel_badges@{s}x.png', optimize=True)
        json.dump({'frames': frames, 'meta': {'app': 'docker/gemini/pp_pixel_badges.py', 'image': f'pixel_badges@{s}x.png', 'format': 'RGBA8888', 'size': {'w': x, 'h': Hh}, 'scale': str(s),
                   'note': '도트 원본 x%d 정수 확대(nearest). Phaser: texture filter NEAREST 필수(pixelArt), 표시 배율도 정수 권장' % s}}, open(f'{OUT}/pixel_badges@{s}x.json', 'w'), indent=1)
    return files


def qa_panel(out):
    """남색·흰 바탕 x1(실제)·x2·x4, 24px 축소(nearest·linear) 가독성 확인."""
    keys = list(out)
    rows = []
    for bg in ((16, 28, 58), (240, 240, 236), (60, 30, 80)):
        rows.append(bg)
    cell = 32 * 4 + 12
    cv = Image.new('RGBA', (cell * 9, (cell + 60) * ((len(keys) + 8) // 9)), (16, 28, 58, 255))
    for n, k in enumerate(keys):
        r, c = divmod(n, 9); im = out[k]
        x0, y0 = c * cell + 4, r * (cell + 60) + 4
        cv.alpha_composite(Image.fromarray(up(im, 4), 'RGBA'), (x0, y0))
        y1 = y0 + 32 * 4 + 6
        cv.alpha_composite(Image.fromarray(im, 'RGBA'), (x0, y1))
        cv.alpha_composite(Image.fromarray(up(im, 2), 'RGBA'), (x0 + 36, y1))
        sm = Image.fromarray(im, 'RGBA').resize((max(1, im.shape[1] * 24 // 32), max(1, im.shape[0] * 24 // 32)), Image.LANCZOS)
        cv.alpha_composite(sm, (x0 + 36 + im.shape[1] * 2 + 4, y1))
        wb = Image.new('RGBA', (im.shape[1] + 4, im.shape[0] + 4), (240, 240, 236, 255)); wb.alpha_composite(Image.fromarray(im, 'RGBA'), (2, 2))
        cv.alpha_composite(wb, (x0 + 36 + im.shape[1] * 2 + 4 + 26, y1))
    os.makedirs(f'{OUT}/qa', exist_ok=True)
    cv.save(f'{OUT}/qa/badges_panel.png')


def metrics(im):
    a = im[..., 3]; rgb = im[..., :3].astype(int)
    semi = int(((a > 0) & (a < 255)).sum())
    mag = int(((a > 0) & (rgb[..., 0] - rgb[..., 1] > 70) & (rgb[..., 2] - rgb[..., 1] > 70) & (rgb[..., 0] > 160)).sum())
    cols = len(np.unique(rgb[a > 0].reshape(-1, 3), axis=0)) if (a > 0).any() else 0
    return {'semi_alpha_px': semi, 'magenta_px': mag, 'colors': cols}


if __name__ == '__main__':
    if sys.argv[1] == 'extract':
        cmd_extract(sys.argv[2:])
    elif sys.argv[1] == 'build':
        P = json.load(open(sys.argv[2]))
        out = cmd_build(sys.argv[2])
        ico = {k: fit(symbol(pick, n), box, box) for k, (pick, n, box) in P.get('ico', {}).items()}
        files = save_all(out, P)
        if ico:  # ui_skin 과 같은 단위(아이콘 36unit = 108px@3x). 도트 36px 원본 x3 정수 확대, @1.5x 는 x1.5 nearest(비정수 — 가능하면 @3x 를 축소 표시)
            frames3, frames15 = {}, {}
            for s, frames, name in ((3, frames3, 'ui_pixel_ico@3x'), (1.5, frames15, 'ui_pixel_ico@1.5x')):
                pad = 4; x = pad; comps = []; Hh = 0
                for k, im in ico.items():
                    u = up(im, 3)
                    if s == 1.5:
                        u = np.asarray(Image.fromarray(im, 'RGBA').resize((round(im.shape[1] * 1.5), round(im.shape[0] * 1.5)), Image.NEAREST))
                    h, w = u.shape[:2]; comps.append((x, u))
                    frames[k] = {'frame': {'x': x, 'y': pad, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False, 'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h}, 'slice': None, 'sliceMode': 'image'}
                    x += w + pad; Hh = max(Hh, h + 2 * pad)
                cv = Image.new('RGBA', (x, Hh), (0, 0, 0, 0))
                for x0, u in comps:
                    cv.alpha_composite(Image.fromarray(u, 'RGBA'), (x0, pad))
                cv.save(f'{OUT}/{name}.png', optimize=True)
                json.dump({'frames': frames, 'meta': {'app': 'docker/gemini/pp_pixel_badges.py', 'image': f'{name}.png', 'format': 'RGBA8888', 'size': {'w': x, 'h': Hh}, 'scale': str(s), 'unitPx': s,
                           'note': '도트 ico.* 대체 아틀라스(같은 frame 키). 텍스처 필터 NEAREST 필수'}}, open(f'{OUT}/{name}.json', 'w'), indent=1)
            for k, im in ico.items():
                Image.fromarray(up(im, 3), 'RGBA').save(f'{OUT}/x3/{k.replace(".", "_")}.png', optimize=True)
            out.update({f'{k}(pixel36)': v for k, v in ico.items()})
        qa_panel(out)
        rep = {k: {'file': files[k][0] if k in files else 'ui_pixel_ico@3x', 'size': [v.shape[1], v.shape[0]], **metrics(v)} for k, v in out.items()}
        json.dump(rep, open(f'{OUT}/qa/build_report.json', 'w'), indent=1)
        print(json.dumps({k: (v['size'], v['magenta_px'], v['colors']) for k, v in rep.items()}))
