# 구대륙 세계판 장식 레이어(장성 오버레이·바다 문양·테두리) — world_map_pp.py 와 같은 그림, 투영만 구대륙 뷰(world_map_regional_build.REGIONS['oldworld']).
# 입력: public/assets/map_world/ui/{corner_tl,wave,compass@2x}.png(기존 산출물 재사용), 출력: public/assets/map_world/oldworld/decor/*.webp
# 사용: python -X utf8 docker/gemini/world_map_oldworld_pp.py
import os, sys, math, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ROOT)
import world_map_pp as wp
from world_map_regional_build import REGIONS, PUB

R = REGIONS['oldworld']
OUT = os.path.join(R['outdir'], 'decor')
UI = os.path.join(PUB, 'assets', 'map_world', 'ui')
PREV = os.path.join(ROOT, 'world_map_preview', 'regional')

def proj(lon, lat, W, H):
    return ((lon - R['lon0']) / (R['lon1'] - R['lon0']) * W, (R['lat1'] - lat) / (R['lat1'] - R['lat0']) * H)

def great_wall(W, H):
    ss = 4; sc = W / 2048 * ss
    im = Image.new('RGBA', (W * ss, H * ss), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    pts = [proj(x, y, W * ss, H * ss) for x, y in wp.GREAT_WALL]
    d.line(pts, fill=(58, 36, 20, 235), width=int(5.6 * sc), joint='curve')
    d.line(pts, fill=(214, 200, 168, 255), width=int(3.4 * sc), joint='curve')
    seg = []; tot = 0
    for p, q in zip(pts, pts[1:]):
        l = math.dist(p, q); seg.append((p, q, l)); tot += l
    step = 9 * sc; s = 0.0
    while s < tot:
        acc = 0
        for p, q, l in seg:
            if acc + l >= s:
                t = (s - acc) / l; x = p[0] + (q[0] - p[0]) * t; y = p[1] + (q[1] - p[1]) * t; h = 3.2 * sc
                d.rectangle([x - h, y - h * 1.3, x + h, y + h * 0.7], fill=(226, 212, 180, 255), outline=(58, 36, 20, 255), width=max(1, int(0.8 * sc)))
                break
            acc += l
        s += step
    im = im.resize((W, H), Image.LANCZOS)
    sa = im.getchannel('A').filter(ImageFilter.GaussianBlur(1.2 * W / 2048)).point(lambda v: int(v * 0.35))
    sh = Image.new('RGBA', im.size, wp.SHADOW + (255,)); sh.putalpha(sa)
    base = Image.new('RGBA', im.size, (0, 0, 0, 0))
    base.alpha_composite(sh, (int(1 * W / 2048), int(1.5 * W / 2048))); base.alpha_composite(im)
    return base

def border(W, H, corner):
    sc = W / 2048
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    e = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy)) / (40 * sc)
    al = np.clip(1 - e, 0, 1) ** 2 * 0.55
    vig = np.zeros((H, W, 4), np.uint8); vig[..., 0] = 96; vig[..., 1] = 58; vig[..., 2] = 28; vig[..., 3] = (al * 255).astype(np.uint8)
    im = Image.fromarray(vig, 'RGBA'); d = ImageDraw.Draw(im)
    m1 = int(14 * sc); m2 = int(20 * sc)
    d.rectangle([m1, m1, W - 1 - m1, H - 1 - m1], outline=(70, 42, 20, 230), width=max(2, int(3 * sc)))
    d.rectangle([m2, m2, W - 1 - m2, H - 1 - m2], outline=(176, 132, 62, 220), width=max(1, int(1.5 * sc)))
    cs = int(150 * sc); c = corner.resize((cs, int(cs * corner.height / corner.width)), Image.LANCZOS)
    o = int(6 * sc)
    for fx, fy, x, y in ((0, 0, o, o), (1, 0, W - c.width - o, o), (0, 1, o, H - c.height - o), (1, 1, W - c.width - o, H - c.height - o)):
        cc = c.transpose(Image.FLIP_LEFT_RIGHT) if fx else c
        cc = cc.transpose(Image.FLIP_TOP_BOTTOM) if fy else cc
        im.alpha_composite(cc, (x, y))
    return im

# 구대륙 뷰 안의 대양 한가운데(핀 후보 없음) — (lon, lat, 크기 배율)
WAVE_SPOTS = [(-16, 28, 0.9), (-10, -22, 1.0), (68, -18, 1.1), (62, 10, 0.75), (100, -28, 0.9), (158, 22, 1.0), (150, 40, 0.8)]
COMPASS_AT = (84, -23)    # 남인도양(핀 후보 없음)

def sea_decor(W, H, wave, compass):
    sc = W / 2048
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for lon, lat, s in WAVE_SPOTS:
        sz = int(110 * sc * s); w = wave.resize((sz, sz), Image.LANCZOS)
        x, y = proj(lon, lat, W, H); im.alpha_composite(w, (int(x - sz / 2), int(y - sz / 2)))
    cs = int(150 * sc); c = compass.resize((cs, cs), Image.LANCZOS)
    x, y = proj(*COMPASS_AT, W, H)
    ca = np.asarray(c, np.float32); ca[..., 3] *= 0.85
    im.alpha_composite(Image.fromarray(ca.astype(np.uint8), 'RGBA'), (int(x - cs / 2), int(y - cs / 2)))
    return im

if __name__ == '__main__':
    corner = Image.open(os.path.join(UI, 'corner_tl.png')).convert('RGBA')
    wave = Image.open(os.path.join(UI, 'wave.png')).convert('RGBA')
    compass = Image.open(os.path.join(UI, 'compass@2x.png')).convert('RGBA')
    W0 = int(round((R['lon1'] - R['lon0']) * R['ppd'])); H0 = int(round((R['lat1'] - R['lat0']) * R['ppd']))
    sizes = {}
    for W, H in ((W0, H0), (W0 // 2, H0 // 2)):
        for nm, im in (('overlay_greatwall', great_wall(W, H)), ('border', border(W, H, corner)), ('sea_ornament', sea_decor(W, H, wave, compass))):
            p = os.path.join(OUT, f'{nm}_{W}.webp'); sizes[os.path.relpath(p, PUB).replace(os.sep, '/')] = wp.save_webp(im, p)
    print(json.dumps(sizes, indent=1))
    # 컨택트: 모바일 베이스 + 장식 + 아이콘 몇 개(정규화 좌표 → 뷰 좌표)
    base = Image.open(os.path.join(R['outdir'], f"oldworld_base_{W0 // 2}.webp")).convert('RGBA')
    W, H = base.size
    for n in ('sea_ornament', 'overlay_greatwall', 'border'):
        base.alpha_composite(Image.open(os.path.join(OUT, f'{n}_{W}.webp')).convert('RGBA'))
    demo = [('walled_capital', 112.45, 34.62), ('eupseong', 126.98, 37.57), ('port', 128.6, 34.9), ('palace_hall', 135.77, 35.01),
            ('harbor_city', 10.32, 36.86), ('stone_castle', 1.9, 47.9), ('mudbrick_city', 43.13, 36.34), ('yurt_camp', 75, 46),
            ('gorge_fortress', 113.6, 29.9), ('mountain_fortress', 126.0, 40.6)]
    gem = Image.open(os.path.join(PUB, 'assets', 'map_world', 'icons', 'pin_gem.png')).resize((22, 22), Image.LANCZOS)
    for n, lon, lat in demo:
        ic = Image.open(os.path.join(PUB, 'assets', 'map_world', 'icons', f'{n}.png')).resize((48, 48), Image.LANCZOS)
        x, y = proj(lon, lat, W, H)
        base.alpha_composite(ic, (int(x - 24), int(y - 44))); base.alpha_composite(gem, (int(x - 11), int(y - 4)))
    os.makedirs(PREV, exist_ok=True)
    base.convert('RGB').save(os.path.join(PREV, 'oldworld_contact_2000.jpg'), quality=88)
