# 캠페인 내비 아이콘(ui.nav.single) 후보 후처리(안아트 2026-11-14, 호출 없음).
#   입력 public/assets/ui/_candidates_campaign/raw_trio.jpg(가로 3안, 마젠타 배경)
#   출력 같은 폴더 cand_{a,b,c}.png(192x192, lobby_chrome_pp.py 와 같은 키잉·fit(192, pad 10)) + compare_sheet.png
#   적용: python -X utf8 docker/gemini/nav_campaign_book_pp.py --apply <a|b|c>  → nav_single.webp 교체(기존은 _bak_캠페인아이콘_20261114/ 로 백업)
import os, sys, shutil, json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
D = 'public/assets/ui/_candidates_campaign'; NAV = 'public/assets/ui_skin/library/nav'
def keyed(path):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32); r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = np.clip((np.minimum(r, b) - g - 40) / 140.0, 0, 1); a = 1 - m; a = np.where(a < 0.08, 0, a)
    solid = ndimage.binary_opening(a > 0.5, iterations=1); a = a * ndimage.binary_dilation(solid, iterations=3)
    sp = np.clip(np.minimum(r, b) - g - 15, 0, None) * 0.85; out = rgb.copy(); out[..., 0] -= sp; out[..., 2] -= sp
    return Image.fromarray(np.dstack([np.clip(out, 0, 255), a * 255]).astype(np.uint8), 'RGBA'), solid
trim = lambda im: im.crop(im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
def fit(im, S, pad):
    im = trim(im); s = (S - 2 * pad) / max(im.size); im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    c = Image.new('RGBA', (S, S), (0, 0, 0, 0)); c.alpha_composite(im, ((S - im.width) // 2, (S - im.height) // 2)); return c
if '--enhance' in sys.argv:   # 2026-11-14 A안 확정 후 소형 판독 보강(호출 없음): cand_a.png → cand_a_plus.png
    from PIL import ImageFilter
    src = Image.open(f'{D}/cand_a.png').convert('RGBA'); al = np.asarray(src)[..., 3]
    rgb = np.asarray(src.convert('RGB').filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=2))).astype(np.float32)
    lum = rgb @ np.array([0.299, 0.587, 0.114]); mx, mn = rgb.max(2), rgb.min(2); sat = (mx - mn) / np.maximum(mx, 1)
    ys, xs = np.mgrid[0:192, 0:192]; x0, y0, x1, y1 = Image.fromarray(al).getbbox(); bw, bh = x1 - x0, y1 - y0
    # (1) 외곽선 대비: 어두운 선을 더 짙게(갈금 → 거의 흑갈)
    ol = (lum < 105) & (al > 0); rgb[ol] *= 0.80
    # (2) 책등(왼쪽 18%): 중앙값 기준 대비 1.4배 후 0.82배 → 표지와 명도 분리, 띠 돌기는 상대적으로 밝게 남음
    sp = (xs < x0 + bw * 0.18) & (ys < y0 + bh * 0.80) & (al > 128) & ~ol
    if sp.any(): med = np.median(lum[sp]); rgb[sp] = np.clip((rgb[sp] - med) * 1.4 + med, 0, 255) * 0.82
    # (3) 종이 단면(아래 30%, 채도 낮고 밝은 크림): 더 밝게 → 작은 크기에서 흰 줄로 읽힘
    pp = (ys > y0 + bh * 0.70) & (sat < 0.42) & (lum > 140) & (al > 128); rgb[pp] = rgb[pp] * 0.5 + np.array([253, 247, 230]) * 0.5 + 6
    out = np.dstack([np.clip(rgb, 0, 255), al]).astype(np.uint8); Image.fromarray(out, 'RGBA').save(f'{D}/cand_a_plus.png', optimize=True)
    print('enhanced', int(ol.sum()), int(sp.sum()), int(pp.sum())); sys.exit(0)
if '--apply' in sys.argv:
    pick = sys.argv[sys.argv.index('--apply') + 1]; bak = f'{NAV}/_bak_캠페인아이콘_20261114'; os.makedirs(bak, exist_ok=True)
    if not os.path.exists(f'{bak}/nav_single.webp'): shutil.copy2(f'{NAV}/nav_single.webp', f'{bak}/nav_single.webp')
    p = f'{NAV}/nav_single.webp'; Image.open(f'{D}/cand_{pick}.png').save(p, 'WEBP', quality=92, alpha_quality=100, method=6)
    print('applied', pick, os.path.getsize(p), Image.open(p).size); sys.exit(0)
im, solid = keyed(f'{D}/raw_trio.jpg'); lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=6)); sizes = ndimage.sum(solid, lab, range(1, n + 1)); objs = ndimage.find_objects(lab)
big = sorted(np.argsort(-sizes)[:3], key=lambda i: objs[i][1].start)
for nm, i in zip('abc', big):
    ys, xs = objs[i]; c = im.crop((xs.start, ys.start, xs.stop, ys.stop)); a = np.asarray(c).copy(); a[..., 3] = a[..., 3] * (lab[ys, xs] == i + 1)
    f = np.asarray(fit(Image.fromarray(a), 192, 10)).copy(); r, g, b, al = (f[..., k].astype(int) for k in range(4))
    fr_ = (al < 220) & ((np.minimum(r, b) - g) > 8); f[fr_, :3] = (92, 68, 16)   # 잔여 마젠타 프린지 → 외곽선 갈금(goldShadow)
    Image.fromarray(f).save(f'{D}/cand_{nm}.png', optimize=True)
# 비교 시트: 행 = 후보(기존 single 포함), 열 = 프레임 112 표시 / 프레임 56 / 프레임 40 / 아이콘 32 단독 / 기존 이웃 아이콘(hero·record·reward)과 나란히(56)
fr = Image.open(f'{NAV}/nav_frame.webp').convert('RGBA'); cur = f'{NAV}/_bak_캠페인아이콘_20261114/nav_single.webp'
cur = cur if os.path.exists(cur) else f'{NAV}/nav_single.webp'
def btn(ic, s):
    t = fr.resize((s, s), Image.LANCZOS); k = round(s * 0.6); t.alpha_composite(ic.resize((k, k), Image.LANCZOS), ((s - k) // 2, (s - k) // 2)); return t
rows = [('NOW', Image.open(cur).convert('RGBA'))] + [(nm.upper(), Image.open(f'{D}/cand_{nm}.png')) for nm in 'abc']
W, H = 760, 140 * len(rows) + 10; sh = Image.new('RGBA', (W, H), (11, 19, 40, 255)); d = ImageDraw.Draw(sh)
nb = [Image.open(f'{NAV}/nav_{n}.webp').convert('RGBA') for n in ('hero', 'record', 'reward')]
for r, (lb, ic) in enumerate(rows):
    y = 10 + r * 140; d.text((8, y + 50), lb, fill=(243, 220, 142, 255))
    sh.alpha_composite(btn(ic, 112), (40, y)); sh.alpha_composite(btn(ic, 56), (170, y + 28)); sh.alpha_composite(btn(ic, 40), (240, y + 36)); sh.alpha_composite(ic.resize((32, 32), Image.LANCZOS), (300, y + 40))
    for j, ic2 in enumerate([ic] + nb): sh.alpha_composite(btn(ic2, 72), (360 + j * 98, y + 20))
sh.save(f'{D}/compare_sheet.png', optimize=True); print('ok', [os.path.getsize(f'{D}/cand_{x}.png') for x in 'abc'])
