# 전투 컷신 붓 스트로크·리본 후처리(호출 없음, 안아트 2026-11-04): raw/cut_*.jpg(마젠타) → 투명 webp + manifest 조각(속도선 포함).
#   알파 = 마젠타 거리(min(r,b)-g) 연속값(붓 갈필 반투명 유지) + 디스필. 본체에서 멀리 떨어진 흐린 잔상 띠는 제거(본체 bbox 확장 영역 밖 성분 삭제).
#   brush: 1024x1024 캔버스, 왼쪽 아래 모서리 기준(원본 위치 유지, 가장자리 맞닿음 보존). ribbon: 가로 1024 로 맞추고 세로는 비율(가운데 정렬)
# 실행(docker python:3.12 + pillow numpy scipy): python -X utf8 docker/gemini/cut_fx_pp.py
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage
RAW = 'public/assets/fx/cut/raw'; OUT = 'public/assets/fx/cut'

def key(path):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32); r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = np.clip((np.minimum(r, b) - g - 40) / 140.0, 0, 1)              # 1 = 순수 마젠타
    a = 1 - m
    # 본체 + 가까운 물방울만: 진한 영역(a>0.6) 의 가장 큰 덩어리 bbox 를 6% 넓힌 범위 밖은 지움
    solid = a > 0.6; lab, n = ndimage.label(solid)
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1)); big = int(np.argmax(sizes)) + 1; ys, xs = np.nonzero(lab == big)
        H, W = a.shape; py, px = int(H * 0.06), int(W * 0.06)
        keep = np.zeros_like(a, bool); keep[max(0, ys.min() - py):ys.max() + py, max(0, xs.min() - px):xs.max() + px] = True; a = a * keep
    a = np.where(a < 0.06, 0, a)
    sp = np.clip(np.minimum(r, b) - g - 10, 0, None) * (1 - a) * 0.9 + np.clip(np.minimum(r, b) - g - 10, 0, None) * a * 0.6
    out = rgb.copy(); out[..., 0] -= sp; out[..., 2] -= sp
    return Image.fromarray(np.dstack([np.clip(out, 0, 255), a * 255]).astype(np.uint8), 'RGBA')

items = []
def add(key_, path, size, note, extra=None):
    items.append({'key': key_, 'path': path.replace('public/', ''), 'type': 'image', 'size': list(size), 'alpha': True, 'format': 'webp', 'scope': 'battle', 'bytes': os.path.getsize(path),
                  'generator': {'model': 'gemini-nano-banana-2.1' if 'speedlines' not in key_ else 'procedural (cut_fx_build.py, 모델 호출 없음)', 'script': 'docker/gemini/cut_fx_gen.mjs → cut_fx_pp.py' if 'speedlines' not in key_ else 'docker/gemini/cut_fx_build.py'},
                  'license': '자체 생성', 'note': note, **(extra or {})})
for k, c in (('cut_brush_ally', 'ally'), ('cut_brush_enemy', 'enemy')):
    im = key(f'{RAW}/{k}.jpg'); im = im.resize((1024, 1024), Image.LANCZOS); p = f'{OUT}/{k}.webp'; im.save(p, 'WEBP', quality=90, alpha_quality=95, method=6)
    add(f'fx.{k}', p, im.size, f'초상 뒤 붓 스트로크({"청·흰" if c == "ally" else "적·흰"}). 기준 = 왼쪽 진영: 왼쪽 아래(바깥) → 오른쪽 위(안쪽) 사선. 오른쪽 진영에 쓸 때 FE 가 setFlipX', {'anchor': 'bottom-left', 'flip_for_right_side': True, 'blend': 'normal'})
im = key(f'{RAW}/cut_ribbon.jpg'); bb = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox(); im = im.crop(bb)
h = round(im.height * 1024 / im.width); im = im.resize((1024, h), Image.LANCZOS); p = f'{OUT}/cut_ribbon.webp'; im.save(p, 'WEBP', quality=90, alpha_quality=95, method=6)
add('ui.cut_ribbon', p, im.size, '상단 상성 리본(검은 붓 띠 + 붉은 결). 가운데 70% 폭이 일정 → 가로 늘림 허용(세로는 비율 유지 권장). 글자는 FE', {'stretch': 'horizontal', 'safe_center_x': [0.15, 0.85]})
sp = f'{OUT}/cut_speedlines.webp'; add('fx.cut_speedlines', sp, Image.open(sp).size, '흰 속도선 오버레이. 기준 = 왼쪽 가장자리에서 오른쪽 안쪽으로 뻗음. 오른쪽 진영은 FE 가 setFlipX', {'anchor': 'left', 'flip_for_right_side': True, 'blend': 'add 또는 normal'})
json.dump({'note': '전투 컷신 연출 에셋(안아트 2026-11-04). scope battle', 'assets': items}, open(f'{OUT}/manifest_fragment_cut_fx.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# 미리보기(풀 배경 위)
pv = Image.new('RGBA', (1024, 1024 + 300), (70, 120, 70, 255))
pv.alpha_composite(Image.open(sp).resize((1024, 512)), (0, 0)); pv.alpha_composite(Image.open(f'{OUT}/cut_brush_ally.webp').resize((512, 512)), (0, 512)); pv.alpha_composite(Image.open(f'{OUT}/cut_brush_enemy.webp').resize((512, 512)), (512, 512)); pv.alpha_composite(Image.open(p), (0, 1024 + 60))
os.makedirs('docker/gemini/cut_fx_preview', exist_ok=True); pv.convert('RGB').save('docker/gemini/cut_fx_preview/cut_fx_preview.jpg', quality=90)
print([(i['key'], i['size'], i['bytes']) for i in items])
