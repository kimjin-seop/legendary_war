# 세계지도 아이콘·UI 조각·장식 레이어 후처리.
# 입력: docker/gemini/world_map_raw/{icon,ui}/*.jpg (마젠타 크로마 시트), public/assets/map_world/world_base_2048.webp
# 출력: public/assets/map_world/icons/*.png, ui/*.png, decor/*.webp, 미리보기 docker/gemini/world_map_preview/contact_*.jpg
# 사용: python -X utf8 docker/gemini/world_map_pp.py
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(ROOT, '..', '..', 'public', 'assets', 'map_world'))
RAW = os.path.join(ROOT, 'world_map_raw')
PREV = os.path.join(ROOT, 'world_map_preview')
SHADOW = (58, 36, 20)

ICONS = ['port', 'eupseong', 'mountain_fortress', 'walled_capital',
         'palace_hall', 'mountains', 'library_tower', 'yurt_camp',
         'gorge_fortress', 'volcano', 'great_wall', 'stone_castle',
         'mudbrick_city', 'harbor_city', 'beacon_tower', 'pin_gem']

def key_out(img):
    """마젠타 키 → 알파. 보라 계열(키+어둠 혼합) 접지 그림자는 반투명 짙은 갈색으로 재해석."""
    c = np.asarray(img.convert('RGB'), np.float32)
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    purple = (R > G + 25) & (B > G + 25) & (np.abs(R - B) < 50)
    mx = np.maximum(R, B)
    a = np.ones(R.shape, np.float32)
    # 키 혼합 픽셀: 밝을수록(=키에 가까울수록) 투명
    sh_a = np.clip((255 - mx) / 255 * 1.15, 0, 0.6)
    a = np.where(purple, sh_a, a)
    rgb = c.copy()
    rgb[purple] = SHADOW
    # 비보라 픽셀 디스필: R·B 가 G 보다 함께 높은 만큼 깎음
    m = np.clip(np.minimum(R, B) - G, 0, None)
    sp = (~purple) & (m > 8)
    rgb[sp, 0] -= m[sp] * 0.5; rgb[sp, 2] -= m[sp] * 0.5
    # 경계 1px 침식으로 남은 테두리 제거
    al = Image.fromarray((a * 255).astype(np.uint8))
    out = np.dstack([np.clip(rgb, 0, 255), np.asarray(al, np.float32)]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

def trim_square(im, pad=0.04):
    bb = im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    im = im.crop(bb)
    s = int(max(im.size) * (1 + pad * 2))
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sq.paste(im, ((s - im.width) // 2, s - im.height - int(s * pad)))   # 바닥 정렬(접지 그림자 기준)
    return sq

def resize_rgba(im, size):
    # 프리멀티플라이 리사이즈(경계 색 번짐 방지)
    a = np.asarray(im, np.float32) / 255
    pm = a.copy(); pm[..., :3] *= pm[..., 3:4]
    r = Image.fromarray((pm * 255).astype(np.uint8), 'RGBA').resize((size, size), Image.LANCZOS)
    r = np.asarray(r, np.float32) / 255
    al = r[..., 3:4]
    rgb = np.where(al > 0.003, r[..., :3] / np.maximum(al, 1e-3), 0)
    return Image.fromarray((np.clip(np.dstack([rgb, al]), 0, 1) * 255).astype(np.uint8), 'RGBA')

def state_variant(im, state):
    a = np.asarray(im, np.float32) / 255
    rgb, al = a[..., :3], a[..., 3:4]
    lum = (rgb @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
    if state == 'locked':   # 회색 실루엣(형태만 약하게 남김)
        g = 0.30 + lum * 0.22
        rgb = np.concatenate([g * 0.95, g * 0.97, g * 1.05], axis=2)
        al = al * 0.92
    elif state == 'cleared':  # 금빛 톤
        lo = np.array([0.36, 0.25, 0.06]); mid = np.array([0.85, 0.68, 0.30]); hi = np.array([1.0, 0.93, 0.66])
        t = np.clip(lum * 1.25, 0, 1)
        rgb = np.where(t < 0.5, lo + (mid - lo) * (t * 2), mid + (hi - mid) * ((t - 0.5) * 2))
    return Image.fromarray((np.clip(np.concatenate([rgb, al], 2), 0, 1) * 255).astype(np.uint8), 'RGBA')

def save_png(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'PNG', optimize=True)

def icons():
    sheet = key_out(Image.open(os.path.join(RAW, 'icon', 'landmarks_4x4.jpg')))
    cw = sheet.width // 4
    res = []
    for i, name in enumerate(ICONS):
        cell = sheet.crop(((i % 4) * cw, (i // 4) * cw, (i % 4 + 1) * cw, (i // 4 + 1) * cw))
        sq = trim_square(cell)
        for st in (['normal'] if name == 'pin_gem' else ['normal', 'locked', 'cleared']):
            v = sq if st == 'normal' else state_variant(sq, st)
            suf = '' if st == 'normal' else '_' + st
            for sz, tag in ((96, ''), (192, '@2x')):
                save_png(resize_rgba(v, sz), os.path.join(OUT, 'icons', f'{name}{suf}{tag}.png'))
        res.append(name)
    return res

def ui():
    sheet = key_out(Image.open(os.path.join(RAW, 'ui', 'ui_parts.jpg')))
    cw = sheet.width // 2
    cells = {n: sheet.crop(((i % 2) * cw, (i // 2) * cw, (i % 2 + 1) * cw, (i // 2 + 1) * cw)) for i, n in enumerate(['chip_frame', 'compass', 'corner', 'wave'])}
    chip = trim_square(cells['chip_frame'], 0.02)
    for sz, tag in ((128, ''), (256, '@2x')):
        save_png(resize_rgba(chip, sz), os.path.join(OUT, 'ui', f'chip_frame{tag}.png'))
    comp = trim_square(cells['compass'], 0.02)
    for sz, tag in ((192, ''), (384, '@2x')):
        save_png(resize_rgba(comp, sz), os.path.join(OUT, 'ui', f'compass{tag}.png'))
    corner = cells['corner'].crop(cells['corner'].getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox())
    corner = corner.resize((256, int(256 * corner.height / corner.width)), Image.LANCZOS)
    save_png(corner, os.path.join(OUT, 'ui', 'corner_tl.png'))
    # 물결: 채도·명도 낮춘 청록 선 문양, 반투명
    w = trim_square(cells['wave'], 0.02)
    a = np.asarray(w, np.float32) / 255
    lum = a[..., :3].mean(2, keepdims=True)
    ink = np.array([0.36, 0.58, 0.56]); paper = np.array([0.80, 0.90, 0.86])
    rgb = paper + (ink - paper) * np.clip((0.85 - lum) * 2.2, 0, 1)
    al = a[..., 3:4] * (0.25 + 0.6 * np.clip((0.85 - lum) * 2.2, 0, 1))
    wave = Image.fromarray((np.clip(np.concatenate([rgb, al], 2), 0, 1) * 255).astype(np.uint8), 'RGBA')
    save_png(resize_rgba(wave, 256), os.path.join(OUT, 'ui', 'wave.png'))
    return chip, comp, corner, wave

def ripple(size=256):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    r = np.hypot(xx - size / 2 + 0.5, yy - size / 2 + 0.5) / (size / 2)
    ring = np.exp(-((r - 0.82) / 0.07) ** 2) + 0.5 * np.exp(-((r - 0.62) / 0.05) ** 2)
    glow = np.exp(-((r - 0.82) / 0.18) ** 2) * 0.35
    al = np.clip(ring + glow, 0, 1)
    gold = np.array([0.95, 0.86, 0.55]); green = np.array([0.30, 0.78, 0.52])
    t = np.clip((r - 0.55) / 0.35, 0, 1)[..., None]
    rgb = green * (1 - t) + gold * t
    im = Image.fromarray((np.concatenate([rgb * np.ones_like(al)[..., None], al[..., None]], 2) * 255).astype(np.uint8), 'RGBA')
    save_png(im, os.path.join(OUT, 'ui', 'ripple_ring.png'))
    return im

def proj(lon, lat, W, H):
    return ((lon + 180) / 360 * W, (90 - lat) / 180 * H)

# 명대 장성 대략 경로(동→서) — 미술용 근사, verify
GREAT_WALL = [(119.75, 40.0), (118.5, 40.4), (117.2, 40.6), (116.05, 40.36), (115.0, 40.6), (113.6, 40.5), (112.4, 39.9),
              (111.2, 39.5), (110.3, 38.6), (109.6, 38.3), (108.0, 37.7), (106.6, 37.9), (106.2, 38.6), (105.6, 38.0),
              (104.4, 37.4), (103.3, 37.0), (102.6, 37.9), (101.4, 38.4), (100.4, 38.9), (99.2, 39.4), (98.2, 39.8)]

def great_wall(W):
    H = W // 2; ss = 4
    im = Image.new('RGBA', (W * ss, H * ss), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    pts = [proj(x, y, W * ss, H * ss) for x, y in GREAT_WALL]
    sc = W / 2048 * ss
    d.line(pts, fill=(58, 36, 20, 235), width=int(5.6 * sc), joint='curve')
    d.line(pts, fill=(214, 200, 168, 255), width=int(3.4 * sc), joint='curve')
    # 망대: 경로를 따라 등간격 작은 사각
    seg = []; tot = 0
    for p, q in zip(pts, pts[1:]):
        l = math.dist(p, q); seg.append((p, q, l)); tot += l
    step = 9 * sc; s = 0.0
    while s < tot:
        acc = 0
        for p, q, l in seg:
            if acc + l >= s:
                t = (s - acc) / l; x = p[0] + (q[0] - p[0]) * t; y = p[1] + (q[1] - p[1]) * t
                h = 3.2 * sc
                d.rectangle([x - h, y - h * 1.3, x + h, y + h * 0.7], fill=(226, 212, 180, 255), outline=(58, 36, 20, 255), width=max(1, int(0.8 * sc)))
                break
            acc += l
        s += step
    im = im.resize((W, H), Image.LANCZOS)
    # 그림자
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
    sa = im.getchannel('A').filter(ImageFilter.GaussianBlur(1.2 * W / 2048)).point(lambda v: int(v * 0.35))
    sh.putalpha(sa); sh = Image.composite(Image.new('RGBA', im.size, SHADOW + (255,)), sh, sa).copy(); sh.putalpha(sa)
    base = Image.new('RGBA', im.size, (0, 0, 0, 0))
    base.alpha_composite(sh, (int(1 * W / 2048), int(1.5 * W / 2048)))
    base.alpha_composite(im)
    return base

def border(W, corner):
    H = W // 2; sc = W / 2048
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    # 가장자리 그을린 종이 비네팅(투명→갈색)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    e = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy)) / (40 * sc)
    al = np.clip(1 - e, 0, 1) ** 2 * 0.55
    vig = np.zeros((H, W, 4), np.uint8); vig[..., 0] = 96; vig[..., 1] = 58; vig[..., 2] = 28; vig[..., 3] = (al * 255).astype(np.uint8)
    im = Image.fromarray(vig, 'RGBA'); d = ImageDraw.Draw(im)
    m1 = int(14 * sc); m2 = int(20 * sc)
    d.rectangle([m1, m1, W - 1 - m1, H - 1 - m1], outline=(70, 42, 20, 230), width=max(2, int(3 * sc)))
    d.rectangle([m2, m2, W - 1 - m2, H - 1 - m2], outline=(176, 132, 62, 220), width=max(1, int(1.5 * sc)))
    cs = int(150 * sc)
    c = corner.resize((cs, int(cs * corner.height / corner.width)), Image.LANCZOS)
    for fx, fy, x, y in ((0, 0, int(6 * sc), int(6 * sc)), (1, 0, W - c.width - int(6 * sc), int(6 * sc)),
                         (0, 1, int(6 * sc), H - c.height - int(6 * sc)), (1, 1, W - c.width - int(6 * sc), H - c.height - int(6 * sc))):
        cc = c.transpose(Image.FLIP_LEFT_RIGHT) if fx else c
        cc = cc.transpose(Image.FLIP_TOP_BOTTOM) if fy else cc
        im.alpha_composite(cc, (x, y))
    return im

# 바다 물결 장식 위치(lon, lat, 크기 배율) — 모두 대양 한가운데
WAVE_SPOTS = [(-35, 30, 1.0), (-30, -25, 0.9), (75, -20, 1.1), (160, 25, 1.0), (-150, -10, 0.9), (60, 8, 0.7), (95, -42, 0.8), (-160, 40, 0.8)]

def sea_decor(W, wave, compass):
    H = W // 2; sc = W / 2048
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for lon, lat, s in WAVE_SPOTS:
        sz = int(110 * sc * s); w = wave.resize((sz, sz), Image.LANCZOS)
        x, y = proj(lon, lat, W, H); im.alpha_composite(w, (int(x - sz / 2), int(y - sz / 2)))
    cs = int(150 * sc); c = compass.resize((cs, cs), Image.LANCZOS)
    x, y = proj(-125, -38, W, H)   # 남동 태평양 쪽(아메리카 흐림 영역, 핀 후보 없음)
    ca = np.asarray(c, np.float32); ca[..., 3] *= 0.85
    im.alpha_composite(Image.fromarray(ca.astype(np.uint8), 'RGBA'), (int(x - cs / 2), int(y - cs / 2)))
    return im

def save_webp(im, path, q=82):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=q, method=6, alpha_quality=90)
    return os.path.getsize(path)

if __name__ == '__main__':
    names = icons()
    chip, comp, corner, wave = ui()
    rip = ripple()
    sizes = {}
    for W in (2048, 4096):
        sizes[f'greatwall_{W}'] = save_webp(great_wall(W), os.path.join(OUT, 'decor', f'overlay_greatwall_{W}.webp'))
        sizes[f'border_{W}'] = save_webp(border(W, corner), os.path.join(OUT, 'decor', f'border_{W}.webp'))
        sizes[f'sea_{W}'] = save_webp(sea_decor(W, wave, comp), os.path.join(OUT, 'decor', f'sea_ornament_{W}.webp'))
    print(sizes)
    # 컨택트: 2048 베이스 + 모든 장식 합성, 아이콘 3상태 시트
    base = Image.open(os.path.join(OUT, 'world_base_2048.webp')).convert('RGBA')
    for n in ('sea_ornament_2048', 'overlay_greatwall_2048', 'border_2048'):
        base.alpha_composite(Image.open(os.path.join(OUT, 'decor', n + '.webp')).convert('RGBA'))
    demo = [('walled_capital', 112.45, 34.62), ('eupseong', 126.98, 37.57), ('port', 128.6, 34.9), ('volcano', 130.65, 31.6),
            ('palace_hall', 135.77, 35.01), ('harbor_city', 10.32, 36.86), ('stone_castle', 1.9, 47.9), ('mudbrick_city', 43.13, 36.34),
            ('yurt_camp', 75, 46), ('library_tower', 60, 25), ('gorge_fortress', 110.5, 31.0), ('mountain_fortress', 126.0, 40.6)]
    gem = Image.open(os.path.join(OUT, 'icons', 'pin_gem.png')).resize((22, 22), Image.LANCZOS)
    for i, (n, lon, lat) in enumerate(demo):
        st = '_cleared' if i % 4 == 1 else ('_locked' if i % 4 == 3 else '')
        ic = Image.open(os.path.join(OUT, 'icons', f'{n}{st}.png')).resize((48, 48), Image.LANCZOS)
        x, y = proj(lon, lat, 2048, 1024)
        base.alpha_composite(ic, (int(x - 24), int(y - 44))); base.alpha_composite(gem, (int(x - 11), int(y - 4)))
    base.convert('RGB').save(os.path.join(PREV, 'contact_map_2048.jpg'), quality=88)
    # 아이콘 시트(3상태, 96px, 지도 바탕 위)
    bg = Image.open(os.path.join(OUT, 'world_base_2048.webp')).convert('RGBA').crop((1000, 200, 1900, 460)).resize((16 * 104 + 8, 3 * 104 + 8 + 110))
    for i, n in enumerate(names):
        for j, st in enumerate(['', '_locked', '_cleared']):
            p = os.path.join(OUT, 'icons', f'{n}{st}.png')
            if os.path.exists(p):
                bg.alpha_composite(Image.open(p), (8 + i * 104, 8 + j * 104))
    x = 8
    for im, sz in ((chip, 96), (comp, 96), (rip, 96), (wave, 96)):
        bg.alpha_composite(resize_rgba(im, sz), (x, 3 * 104 + 12)); x += 110
    bg.alpha_composite(corner.resize((96, int(96 * corner.height / corner.width))), (x, 3 * 104 + 12))
    bg.convert('RGB').save(os.path.join(PREV, 'contact_icons.jpg'), quality=90)
