# 로비 크롬 후처리(호출 없음, 안아트 2026-11-04): 우측 내비 아이콘 8·원형 프레임(기본/선택)·레일 띠 + 좌측 배너 목록 프레임(기본/선택, 절차).
#   입력 public/assets/ui_skin/library/raw/{nav_icons,nav_frame,nav_rail}.jpg → public/assets/ui_skin/library/nav/*.webp + manifest 조각(ui.nav.*)
#   배너 목록: public/assets/gacha_ui/keyart/list_compact(.selected).png 를 같은 크기(480x152, 표시 240x76)·같은 썸네일 칸(x12 y12 128)으로 다시 그림(서고 금장 톤, 선택 = 밝은 금테 + 좌우 마름모 + 바깥 빛)
# 실행(docker python:3.12 + pillow numpy scipy): python -X utf8 docker/gemini/lobby_chrome_pp.py
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
R = 'public/assets/ui_skin/library/raw'; O = 'public/assets/ui_skin/library/nav'; os.makedirs(O, exist_ok=True)
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
items = []
def add(key, p, note, extra=None):
    im = Image.open(p); items.append({'key': key, 'path': p.replace('public/', ''), 'type': 'image', 'size': list(im.size), 'alpha': True, 'format': p.rsplit('.', 1)[1], 'scope': 'boot', 'bytes': os.path.getsize(p),
        'generator': {'model': 'gemini-nano-banana-2.1', 'api': 'Interactions API', 'size': '2K', 'script': 'docker/gemini/uiskin_lib_gen.mjs → lobby_chrome_pp.py'}, 'license': '자체 생성', 'note': note, **(extra or {})})
# 1) 아이콘 8(4x2, 행·열 순서)
im, solid = keyed(f'{R}/nav_icons.jpg'); lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=6)); sizes = ndimage.sum(solid, lab, range(1, n + 1)); objs = ndimage.find_objects(lab)
big = sorted(np.argsort(-sizes)[:8], key=lambda i: ((objs[i][0].start + objs[i][0].stop) // 2 > im.height // 2, objs[i][1].start))
NAMES = ['single', 'hero', 'gacha', 'multi', 'growth', 'reward', 'more', 'record']
for nm, i in zip(NAMES, big):
    ys, xs = objs[i]; c = im.crop((xs.start, ys.start, xs.stop, ys.stop)); a = np.asarray(c).copy(); a[..., 3] = a[..., 3] * (lab[ys, xs] == i + 1); c = Image.fromarray(a)
    p = f'{O}/nav_{nm}.webp'; fit(c, 192, 10).save(p, 'WEBP', quality=92, alpha_quality=100, method=6)
    add(f'ui.nav.{nm}', p, f'우측 세로 내비 아이콘({nm}). 192x192(@2x, 표시 96). 원형 프레임 ui.nav.frame 안쪽 60% 크기로 얹기', {'display': [96, 96]})
# 2) 원형 프레임 기본/선택(선택 = 금 밝게 + 바깥 금빛 번짐)
im, _ = keyed(f'{R}/nav_frame.jpg'); fr = fit(im, 256, 18); p = f'{O}/nav_frame.webp'; fr.save(p, 'WEBP', quality=92, alpha_quality=100, method=6)
add('ui.nav.frame', p, '내비 원형 프레임(기본). 256x256(@2x, 표시 128 안팎). 가운데 지름 약 62% 가 아이콘 자리', {'display': [112, 112]})
a = np.asarray(fr).astype(np.float32); rgb = a[..., :3]; gold = (rgb[..., 0] > rgb[..., 2] + 30) & (a[..., 3] > 0)
rgb[gold] = np.clip(rgb[gold] * 1.18 + 18, 0, 255); a[..., :3] = rgb
sel = Image.fromarray(a.astype(np.uint8)); glow = Image.new('RGBA', sel.size, (0, 0, 0, 0)); gd = ImageDraw.Draw(glow); gd.ellipse([10, 10, 246, 246], outline=(255, 222, 140, 230), width=14)
glow = glow.filter(ImageFilter.GaussianBlur(9)); out = Image.new('RGBA', sel.size, (0, 0, 0, 0)); out.alpha_composite(glow); out.alpha_composite(sel)
p = f'{O}/nav_frame_selected.webp'; out.save(p, 'WEBP', quality=92, alpha_quality=100, method=6)
add('ui.nav.frame_selected', p, '내비 원형 프레임(선택): 밝은 금테 + 바깥 금빛 번짐. 기본과 같은 크기·같은 중심', {'display': [112, 112]})
# 3) 레일 띠(세로 3-slice: 위·아래 끝 장식 높이 = slice)
im, _ = keyed(f'{R}/nav_rail.jpg'); im = trim(im); w = 96; h = round(im.height * w / im.width); im = im.resize((w, h), Image.LANCZOS)
al = np.asarray(im)[..., 3] > 128; cols = al.sum(1); body = int(np.median(cols)); top = next(y for y in range(h) if cols[y] >= body * 0.9); bot = next(y for y in range(h - 1, 0, -1) if cols[y] >= body * 0.9)
sl = int(max(top, h - 1 - bot) + 6); p = f'{O}/nav_rail.webp'; im.save(p, 'WEBP', quality=92, alpha_quality=100, method=6)
add('ui.nav.rail', p, '우측 세로 레일 바탕 띠. 세로 3-slice(위·아래 slice_px 고정, 가운데만 늘림)', {'slice': {'t': sl, 'b': sl, 'l': 0, 'r': 0}, 'stretch': 'vertical'})
# 4) 좌측 배너 목록 프레임(gacha.list.compact(.selected) 같은 파일·같은 칸 규격)
K = 'public/assets/gacha_ui/keyart'; GOLD, GOLD_L, GOLD_D, NAVY, NAVY_D = (217, 180, 90), (243, 220, 142), (138, 102, 40), (22, 36, 70), (11, 19, 40)
def rr(d, box, r, **kw): d.rounded_rectangle(box, radius=r, **kw)
def compact(sel):
    W, H, Rr = 480, 152, 14; im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    rr(d, (2, 2, W - 3, H - 3), Rr, fill=(*NAVY_D, 228))
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(g); rr(gd, (8, 8, W - 9, H // 2), Rr - 4, fill=(255, 255, 255, 12)); im.alpha_composite(g)
    if sel:
        gl = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gld = ImageDraw.Draw(gl); rr(gld, (4, 4, W - 5, H - 5), Rr, outline=(*GOLD_L, 210), width=10); im.alpha_composite(gl.filter(ImageFilter.GaussianBlur(5)))
    rr(d, (2, 2, W - 3, H - 3), Rr, outline=(*(GOLD_L if sel else GOLD_D), 255), width=5 if sel else 3)
    rr(d, (9, 9, W - 10, H - 10), Rr - 6, outline=(*(GOLD if sel else GOLD_D), 150), width=1)    # 안쪽 가는 금선(서고 이중 테)
    tx, ty, ts = 12, (H - 128) // 2, 128
    m = Image.new('L', (W, H), 255); ImageDraw.Draw(m).rounded_rectangle((tx, ty, tx + ts, ty + ts), radius=12, fill=0)
    im.putalpha(Image.fromarray(np.minimum(np.asarray(im.getchannel('A')), np.asarray(m))))
    d = ImageDraw.Draw(im); d.rounded_rectangle((tx, ty, tx + ts, ty + ts), radius=12, outline=(*(GOLD_L if sel else GOLD), 255), width=3)
    d.line((tx + ts + 18, H // 2, W - 24, H // 2), fill=(*GOLD_D, 140), width=2)
    if sel:   # 좌우 마름모 장식(바깥으로 반쯤 나옴)
        for cx in (16, W - 17):
            cy = H // 2; d.polygon([(cx, cy - 16), (cx + 13, cy), (cx, cy + 16), (cx - 13, cy)], fill=(*GOLD_L, 255), outline=(*GOLD_D, 255)); d.polygon([(cx, cy - 7), (cx + 6, cy), (cx, cy + 7), (cx - 6, cy)], fill=(*NAVY, 255))
    return im
for sel, fn in ((False, 'list_compact.png'), (True, 'list_compact_selected.png')):
    compact(sel).save(f'{K}/{fn}', optimize=True)
json.dump({'note': '로비 크롬(안아트 2026-11-04): 우측 내비 아이콘·프레임·레일. 좌측 배너 목록 프레임은 기존 키 gacha.list.compact(.selected) 파일을 같은 규격으로 다시 그림', 'assets': items},
          open(f'{O}/manifest_fragment_nav.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# 미리보기
pv = Image.new('RGBA', (900, 520), (24, 32, 56, 255)); fr0 = Image.open(f'{O}/nav_frame.webp').resize((112, 112)); fr1 = Image.open(f'{O}/nav_frame_selected.webp').resize((112, 112))
for k, nm in enumerate(NAMES):
    x, y = 20 + (k % 4) * 130, 20 + (k // 4) * 130; pv.alpha_composite(fr1 if k == 2 else fr0, (x, y)); pv.alpha_composite(Image.open(f'{O}/nav_{nm}.webp').resize((68, 68)), (x + 22, y + 22))
rail = Image.open(f'{O}/nav_rail.webp'); pv.alpha_composite(rail.resize((48, round(rail.height * 48 / rail.width))) if rail.height * 48 / rail.width < 500 else rail.resize((48, 500)), (560, 10))
pv.alpha_composite(Image.open(f'{K}/list_compact.png').resize((240, 76)), (640, 40)); pv.alpha_composite(Image.open(f'{K}/list_compact_selected.png').resize((240, 76)), (640, 140))
os.makedirs('docker/gemini/uiskin_lib_preview', exist_ok=True); pv.convert('RGB').save('docker/gemini/uiskin_lib_preview/lobby_chrome.jpg', quality=90)
print([(i['key'], i['size'], i['bytes']) for i in items])
