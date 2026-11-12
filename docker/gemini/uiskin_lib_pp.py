# 서고 UI 스킨 1단계 새 조각 후처리(호출 없음, 안아트 2026-11-04): public/assets/ui_skin/library/raw/*.jpg → public/assets/ui_skin/library/*.webp + manifest 조각.
#   lib_damask : 이음 없는 배경 타일 512x512(원본 축소 256 → 상하좌우 거울 배치로 이음 보장) + 1024 고해상도판
#   lib_crest  : 상단 가운데 문장·휘장 장식(마젠타 키, 폭 1200)
#   lib_deco   : 소품 4개 분리(지구의·랜턴·두루마리·책, 각 긴 변 384 안쪽 맞춤 384x384)
#   lib_corner : 화면 금테 왼쪽 위 모서리 512x512(다른 모서리는 FE 가 flipX/flipY)
# 실행(docker python:3.12 + pillow numpy scipy): python -X utf8 docker/gemini/uiskin_lib_pp.py
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage
R = 'public/assets/ui_skin/library/raw'; O = 'public/assets/ui_skin/library'; os.makedirs(O, exist_ok=True)

def keyed(path):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32); r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = np.clip((np.minimum(r, b) - g - 40) / 140.0, 0, 1); a = 1 - m; a = np.where(a < 0.08, 0, a)
    solid = ndimage.binary_opening(a > 0.5, iterations=2); a = a * ndimage.binary_dilation(solid, iterations=3)
    sp = np.clip(np.minimum(r, b) - g - 15, 0, None) * 0.85; out = rgb.copy(); out[..., 0] -= sp; out[..., 2] -= sp
    return Image.fromarray(np.dstack([np.clip(out, 0, 255), a * 255]).astype(np.uint8), 'RGBA'), solid
def trim(im): return im.crop(im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
def save(im, name, **kw): p = f'{O}/{name}.webp'; im.save(p, 'WEBP', quality=kw.get('q', 92), alpha_quality=100, method=6); return p
items = []
def add(key, p, note, extra=None):
    im = Image.open(p); items.append({'key': key, 'path': p.replace('public/', ''), 'type': 'image', 'size': list(im.size), 'alpha': im.mode == 'RGBA', 'format': 'webp', 'scope': 'boot',
        'bytes': os.path.getsize(p), 'generator': {'model': 'gemini-nano-banana-2.1', 'api': 'Interactions API', 'size': '2K', 'script': 'docker/gemini/uiskin_lib_gen.mjs → uiskin_lib_pp.py'},
        'license': '자체 생성(이미지 모델 출력)', 'note': note, **(extra or {})})
# 다마스크 타일
src = Image.open(f'{R}/lib_damask.jpg').convert('RGB')
for S, nm in ((512, 'bg_damask'), (1024, 'bg_damask@2x')):
    q = src.resize((S // 2, S // 2), Image.LANCZOS); t = Image.new('RGB', (S, S))
    t.paste(q, (0, 0)); t.paste(q.transpose(Image.FLIP_LEFT_RIGHT), (S // 2, 0)); t.paste(q.transpose(Image.FLIP_TOP_BOTTOM), (0, S // 2)); t.paste(q.transpose(Image.ROTATE_180), (S // 2, S // 2))
    p = f'{O}/{nm}.webp'; t.save(p, 'WEBP', quality=88, method=6)
add('ui.skin.bg_damask', f'{O}/bg_damask.webp', '서고 네이비 다마스크 배경 타일(이음 없음, 반복 배치 TileSprite). 대사 씬 배경 전체', {'alpha': False, 'tile': True, 'variants': {'x2': {'path': 'assets/ui_skin/library/bg_damask@2x.webp', 'size': [1024, 1024], 'bytes': os.path.getsize(f'{O}/bg_damask@2x.webp')}}})
# 문장·휘장
im, _ = keyed(f'{R}/lib_crest.jpg'); im = trim(im); im = im.resize((1200, round(im.height * 1200 / im.width)), Image.LANCZOS)
add('ui.deco.crest_top', save(im, 'crest_top'), '상단 가운데 문장(날개 달린 사자 방패)·휘장·깃발 장식. 화면 위 가운데 정렬, 위쪽 가장자리에 붙여 배치')
# 소품 4개
im, solid = keyed(f'{R}/lib_deco.jpg'); lab, n = ndimage.label(solid); sizes = ndimage.sum(solid, lab, range(1, n + 1)); objs = ndimage.find_objects(lab)
big = sorted(np.argsort(-sizes)[:4], key=lambda i: ((objs[i][0].start + objs[i][0].stop) // 2 > im.height // 2, objs[i][1].start))
for name, i in zip(('globe', 'lantern', 'scrolls', 'books'), big):
    ys, xs = objs[i]; c = im.crop((max(0, xs.start - 12), max(0, ys.start - 12), min(im.width, xs.stop + 12), min(im.height, ys.stop + 12)))
    a = np.asarray(c).copy(); keep = ndimage.binary_dilation(lab[max(0, ys.start - 12):ys.stop + 12, max(0, xs.start - 12):xs.stop + 12] == i + 1, iterations=4); a[..., 3] = a[..., 3] * keep
    c = trim(Image.fromarray(a)); s = 360 / max(c.size); c = c.resize((round(c.width * s), round(c.height * s)), Image.LANCZOS)
    cv = Image.new('RGBA', (384, 384), (0, 0, 0, 0)); cv.alpha_composite(c, ((384 - c.width) // 2, 384 - c.height - 8))
    add(f'ui.deco.{name}', save(cv, f'deco_{name}'), f'대사 씬 좌우 장식 소품({name}). 바닥 기준 정렬(아래 8px 여백)', {'anchor': 'bottom-center'})
# 모서리
im, _ = keyed(f'{R}/lib_corner.jpg'); im = trim(im); cv = Image.new('RGBA', (512, 512), (0, 0, 0, 0)); s = 512 / max(im.size); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS); cv.alpha_composite(im, (0, 0))
add('ui.skin.frame_corner', save(cv, 'frame_corner'), '화면 금테 왼쪽 위 모서리. 나머지 모서리는 flipX/flipY, 모서리 사이 변은 FE 가 금선(#D9B45A 2px + #8A6A1E 1px)으로 그림', {'anchor': 'top-left', 'mirror': ['tr=flipX', 'bl=flipY', 'br=flipX+flipY']})
json.dump({'note': '서고 UI 스킨 1단계 새 조각(안아트 2026-11-04). atlas.uiskin 의 dialog.box·dialog.nameplate·panel.main·panel.hud·topbar.strip 은 같은 프레임명으로 아틀라스 교체', 'assets': items},
          open(f'{O}/manifest_fragment_library.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pv = Image.new('RGBA', (1400, 900), (0, 0, 0, 255)); t = Image.open(f'{O}/bg_damask.webp').convert('RGBA')
for x in range(0, 1400, 512):
    for y in range(0, 900, 512): pv.alpha_composite(t, (x, y))
pv.alpha_composite(Image.open(f'{O}/crest_top.webp').resize((700, round(Image.open(f'{O}/crest_top.webp').height * 700 / 1200))), (350, 0))
cr = Image.open(f'{O}/frame_corner.webp').resize((200, 200)); pv.alpha_composite(cr, (0, 0)); pv.alpha_composite(cr.transpose(Image.FLIP_LEFT_RIGHT), (1200, 0)); pv.alpha_composite(cr.transpose(Image.FLIP_TOP_BOTTOM), (0, 700)); pv.alpha_composite(cr.transpose(Image.ROTATE_180), (1200, 700))
for k, nm in enumerate(('globe', 'lantern', 'scrolls', 'books')): pv.alpha_composite(Image.open(f'{O}/deco_{nm}.webp').resize((192, 192)), (60 + k * 340, 600))
os.makedirs('docker/gemini/uiskin_lib_preview', exist_ok=True); pv.convert('RGB').save('docker/gemini/uiskin_lib_preview/library_scene.jpg', quality=90)
print([(i['key'], i['size'], i['bytes']) for i in items])
