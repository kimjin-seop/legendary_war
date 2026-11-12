# VS 엠블럼 후처리(호출 없음, 안아트 2026-11-04): raw/vs_notext.jpg·vs_text.jpg(가로 A/B/C) → 안별 512x512 투명 webp + 64/96/128 미리보기 + manifest 조각.
# 채택안 ADOPT(기본 B) 만 키 등록: ui.vs_emblem(글자 없음) / ui.vs_emblem_text('VS' 새김). 나머지 안은 candidates/ 에 보존(키 없음)
# 실행(docker python:3.12 + pillow numpy scipy): python -X utf8 docker/gemini/vs_emblem_pp.py [A|B|C]
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
RAW = 'public/assets/ui/vs_emblem/raw'; OUT = 'public/assets/ui'; CAND = 'public/assets/ui/vs_emblem/candidates'; G = 'docker/gemini'
ADOPT = sys.argv[1] if len(sys.argv) > 1 else 'B'; S, PAD = 512, 16
os.makedirs(CAND, exist_ok=True)

def cut3(path):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.int32); r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mag = (r > 150) & (b > 150) & (g < 120) & (r - g > 90) & (b - g > 90)
    fg = ndimage.binary_opening(~mag, iterations=2); lab, k = ndimage.label(fg); sizes = ndimage.sum(fg, lab, range(1, k + 1)); objs = ndimage.find_objects(lab)
    big = sorted(np.argsort(-sizes)[:3], key=lambda i: objs[i][1].start); out = []
    for i in big:
        ys, xs = objs[i]; y0, y1, x0, x1 = max(0, ys.start - 8), min(rgb.shape[0], ys.stop + 8), max(0, xs.start - 8), min(rgb.shape[1], xs.stop + 8)
        sub = rgb[y0:y1, x0:x1].astype(np.float32); m = lab[y0:y1, x0:x1] == i + 1
        rr, gg, bb = sub[..., 0], sub[..., 1], sub[..., 2]; d = np.clip((np.minimum(rr, bb) - gg) / 255.0, 0, 1)
        edge = m & ~ndimage.binary_erosion(m, iterations=2)
        a = np.where(m, 255.0, 0.0); a = np.where(edge, 255 * (1 - np.clip((d - 0.25) / 0.45, 0, 1)), a)
        spill = np.clip(np.minimum(rr, bb) - gg - 30, 0, None) * edge; sub[..., 0] -= spill; sub[..., 2] -= spill
        im = Image.fromarray(np.dstack([np.clip(sub, 0, 255), a]).astype(np.uint8), 'RGBA'); im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox())
        s = min((S - 2 * PAD) / im.width, (S - 2 * PAD) / im.height); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        c = Image.new('RGBA', (S, S), (0, 0, 0, 0)); c.alpha_composite(im, ((S - im.width) // 2, (S - im.height) // 2)); out.append(c)
    return out

res = {}
for kind in ('notext', 'text'):
    for name, im in zip('ABC', cut3(f'{RAW}/vs_{kind}.jpg')):
        p = f'{CAND}/vs_emblem_{kind}_{name}.webp'; im.save(p, 'WEBP', quality=92, alpha_quality=100, method=6); res[(kind, name)] = im
# 미리보기: 3안 x 2종 x (512 축소 128 / 96 / 64), 어두운·밝은 바탕
pv = Image.new('RGBA', (6 * 140, 2 * 300), (0, 0, 0, 0))
for row, bgc in enumerate(((22, 30, 52, 255), (226, 214, 184, 255))):
    for j, (kind, name) in enumerate([(k, n) for k in ('notext', 'text') for n in 'ABC']):
        x, y = j * 140, row * 300; pv.paste(Image.new('RGBA', (140, 300), bgc), (x, y)); im = res[(kind, name)]
        pv.alpha_composite(im.resize((128, 128), Image.LANCZOS), (x + 6, y + 6)); pv.alpha_composite(im.resize((96, 96), Image.LANCZOS), (x + 22, y + 140)); pv.alpha_composite(im.resize((64, 64), Image.LANCZOS), (x + 38, y + 230))
os.makedirs(f'{G}/vs_emblem_preview', exist_ok=True); pv.convert('RGB').save(f'{G}/vs_emblem_preview/vs_emblem_candidates.jpg', quality=92)
items = []
for kind, key in (('notext', 'ui.vs_emblem'), ('text', 'ui.vs_emblem_text')):
    p = f'{OUT}/{"vs_emblem" if kind == "notext" else "vs_emblem_text"}.webp'
    if os.path.exists(p) and not os.path.exists(p + '.adopt_' + ADOPT): pass
    res[(kind, ADOPT)].save(p, 'WEBP', quality=92, alpha_quality=100, method=6)
    items.append({'key': key, 'path': p.replace('public/', ''), 'type': 'image', 'size': [S, S], 'display': [112, 112], 'display_range': '96~128px', 'scope': 'map', 'alpha': True, 'format': 'webp',
                  'bytes': os.path.getsize(p), 'variant': ADOPT, 'has_text': kind == 'text', 'text': 'VS' if kind == 'text' else None,
                  'candidates': [f'assets/ui/vs_emblem/candidates/vs_emblem_{kind}_{n}.webp' for n in 'ABC'],
                  'generator': {'model': 'gemini-nano-banana-2.1', 'api': 'Interactions API', 'size': '2K', 'script': 'docker/gemini/vs_emblem_gen.mjs → vs_emblem_pp.py', 'sheet': f'vs_{kind}'},
                  'license': '자체 생성(이미지 모델 출력), 제3자 소스 없음', 'note': '서가 지도 가운데 대결 엠블럼(FE 도형+텍스트 대체). 글자 없는 판은 FE 가 텍스트를 얹을 수 있게 가운데 비움'})
json.dump({'note': '서가 지도 VS 엠블럼(안아트 2026-11-04). 채택안 ' + ADOPT, 'assets': items}, open(f'{OUT}/vs_emblem/manifest_fragment_vs_emblem.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('adopt', ADOPT, [(i['key'], i['path'], i['bytes']) for i in items])
