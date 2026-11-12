# S등급 초상 시안 합성(호출 없음, 안아트 2026-11-04): 배경 판(테마) → 인물 컷아웃 → frame.rank.s(9-slice) → frame.rank.s.ornament
# 실행(docker python:3.12 + pylib_b): python -X utf8 docker/gemini/portrait_s_mock.py
import json, sys
import numpy as np
from PIL import Image
sys.path.insert(0, 'docker/gemini')
from alpha_process import method_b
R = 'docker/gemini/portrait_s'; A = 'public/assets/ui_skin/atlas/ui_skin_gacha@3x'
rgb = np.asarray(Image.open(f'{R}/raw/s_yi_sun_sin.jpg').convert('RGB'))
rgb2, al = method_b(np.ascontiguousarray(rgb), T_lo=40, T_hi=90)
fig = Image.fromarray(np.dstack([rgb2, (al * 255 if al.max() <= 1 else al)]).astype(np.uint8), 'RGBA').resize((896, 1200), Image.LANCZOS)
fig.save(f'{R}/preview/s_yi_sun_sin_cut.png')
bgs = Image.open(f'{R}/raw/s_bg_a.jpg').convert('RGB'); W, H = bgs.size
names = ['sea', 'fire', 'steppe', 'royal']; cells = {}
for i, n in enumerate(names):
    c, r = i % 2, i // 2; m = int(W * 0.012)
    cells[n] = bgs.crop((c * W // 2 + m, r * H // 2 + m, (c + 1) * W // 2 - m, (r + 1) * H // 2 - m)).resize((896, 1200), Image.LANCZOS)
    cells[n].save(f'{R}/preview/s_bg_{n}.jpg', quality=90)
atl = Image.open(A + '.png').convert('RGBA'); fr = json.load(open(A + '.json', encoding='utf-8'))['frames']
def sub(k): f = fr[k]['frame']; return atl.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
def nine(im, w, h, b):
    out = Image.new('RGBA', (w, h)); s = im.width
    xs = [(0, b, 0, b), (b, s - b, b, w - b), (s - b, s, w - b, w)]; ys = [(0, b, 0, b), (b, s - b, b, h - b), (s - b, s, h - b, h)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in ys:
            out.alpha_composite(im.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.LANCZOS), (dx0, dy0))
    return out
CW, CH = 600, 800; frame = nine(sub('frame.rank.s'), CW, CH, 76); orn = sub('frame.rank.s.ornament'); anc = fr['frame.rank.s.ornament']['anchor']
def card(bg, f):
    pad = 60; cv = Image.new('RGBA', (CW + 2 * pad, CH + 2 * pad), (20, 24, 42, 255))
    inner = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    if bg is not None: inner.paste(bg.resize((CW, CH), Image.LANCZOS).convert('RGBA'), (0, 0))
    inner.alpha_composite(f.resize((CW, CH), Image.LANCZOS)); cv.alpha_composite(inner, (pad, pad)); cv.alpha_composite(frame, (pad, pad))
    # ornament: 288px 프레임 기준 오프셋 → 모서리 장식이므로 가로 폭 비율로 크게 늘리지 않고, 위 가운데 크레스트만 맞춰 배치
    o = orn.resize((CW + 24 * CW // 288, int(orn.height * (CW + 24 * CW // 288) / orn.width)), Image.LANCZOS)
    cv.alpha_composite(o, (pad + anc['offsetX_px'] * CW // 288, pad + anc['offsetY_px'] * CW // 288)); return cv
old = Image.open('public/assets/portraits/yi_sun_sin.webp').convert('RGBA')
a = card(None, old); b = card(cells['sea'], fig); c = card(cells['fire'], fig)
sheet = Image.new('RGBA', (a.width * 3 + 40, a.height), (20, 24, 42, 255)); [sheet.alpha_composite(x, (i * (a.width + 20), 0)) for i, x in enumerate([a, b, c])]
sheet.convert('RGB').save(f'{R}/preview/s_mock_compare.jpg', quality=88)
sm = sheet.resize((sheet.width // 4, sheet.height // 4), Image.LANCZOS); sm.convert('RGB').save(f'{R}/preview/s_mock_compare_small.jpg', quality=90)
# 알파 가장자리 검사: 밝은 남색 위 인물 확대
chk = Image.new('RGBA', fig.size, (16, 26, 51, 255)); chk.alpha_composite(fig); chk.crop((420, 0, 896, 480)).resize((952, 960), Image.NEAREST).convert('RGB').save(f'{R}/preview/s_edge_check.jpg', quality=90)
print('ok', fig.size)
