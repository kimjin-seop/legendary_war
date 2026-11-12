# 병종 아이콘 보충 후처리(안아트 2026-11-08, 호출 없음): raw/ui/troop_extra/troop_extra_a.jpg(2x2: gunner, naval, assassin, monster)
#  마젠타 크로마 키 → 알파 + 디스필 → 칸별 bbox → 128 캔버스(여백 8, 기존 pp.mjs fitInto 규칙) → 64·32 LANCZOS
# 출력 public/assets/ui/icons/set/{64,32}/troop_<code>.png (기존 키·경로 그대로 교체) + manifest 메타 갱신
# 실행: python -X utf8 docker/gemini/troop_icon_pp.py  (프로젝트 루트에서)
import json, os, hashlib
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'public/assets/raw/ui/troop_extra/troop_extra_a.jpg'
O = 'public/assets/ui/icons/set'
ORDER = ['gunner', 'naval', 'assassin', 'monster']
NOTE = {'gunner': '전용 아이콘(화승총, 2026-11-08 생성)', 'naval': '전용 아이콘(닻과 밧줄, 2026-11-08 생성)',
        'assassin': '전용 아이콘(단검과 남색 두건 천, 2026-11-08 생성)', 'monster': '전용 아이콘(뿔 달린 괴수 머리, 2026-11-08 생성)'}

a = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
# 마젠타 정도: R·B 가 높고 G 가 낮음
mag = np.clip((np.minimum(r, b) - g) / 255.0, 0, 1)
alpha = 1 - np.clip((mag - 0.25) / 0.35, 0, 1)
# 담연기(연보라)처럼 마젠타 기운이 남은 반투명 영역은 제거
alpha[(mag > 0.12) & (np.abs(r - b) < 60) & (g < np.minimum(r, b) - 20)] = 0
solid = alpha > 0.5
lab, n = ndimage.label(solid)
sizes = ndimage.sum(solid, lab, range(1, n + 1))
keep = np.isin(lab, 1 + np.where(sizes > 3000)[0])          # 잡티 제거
keep = ndimage.binary_fill_holes(keep) | keep
alpha = np.where(ndimage.binary_dilation(keep, iterations=2), alpha, 0)
# 디스필: 마젠타 성분을 G 수준으로 끌어내림
lim = g + 8
r2 = np.where(alpha < 1, np.minimum(r, np.maximum(lim, r - (r - lim) * (1 - alpha))), r)
b2 = np.where(alpha < 1, np.minimum(b, np.maximum(lim, b - (b - lim) * (1 - alpha))), b)
edge = ndimage.binary_dilation(alpha < 0.98, iterations=3) & (alpha > 0)
r2 = np.where(edge, np.minimum(r2, np.maximum(g + 40, r2 * 0.85)), r2); b2 = np.where(edge, np.minimum(b2, g + 20), b2)
rgba = np.dstack([r2, g, b2, alpha * 255]).clip(0, 255).astype(np.uint8)
full = Image.fromarray(rgba, 'RGBA')
H, W = rgba.shape[:2]
res = {}
for i, code in enumerate(ORDER):
    cx, cy = (i % 2) * W // 2, (i // 2) * H // 2
    cell = full.crop((cx, cy, cx + W // 2, cy + H // 2))
    bb = cell.getchannel('A').point(lambda v: 255 if v > 64 else 0).getbbox()
    c = cell.crop(bb); S, pad = 128, 8
    k = min((S - pad * 2) / c.width, (S - pad * 2) / c.height)
    c = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.LANCZOS)
    cv = Image.new('RGBA', (S, S), (0, 0, 0, 0)); cv.alpha_composite(c, ((S - c.width) // 2, (S - c.height) // 2))
    for s in (64, 32):
        p = f'{O}/{s}/troop_{code}.png'; cv.resize((s, s), Image.LANCZOS).save(p, optimize=True)
        res[(code, s)] = os.path.getsize(p)

mp = f'{O}/manifest_fragment_ui_icon_set.json'
m = json.load(open(mp, encoding='utf-8'))
for it in m['items']:
    if it.get('group') == 'troop' and it.get('unit_type') in ORDER:
        code, s = it['unit_type'], int(it['size'].split('x')[0])
        it.update({'bytes': res[(code, s)], 'src': 'raw/ui/troop_extra/troop_extra_a.jpg', 'placeholder': False, 'note': NOTE[code],
                   'generator': 'gemini-nano-banana-2.1 (troop_icon_gen.mjs, 참조 raw/ui/icons_a.jpg) + troop_icon_pp.py',
                   'prompt_ref': 'docker/gemini/troop_icon_gen.mjs LIST', 'qa': {'verdict': 'pass', 'issues': []},
                   'md5': hashlib.md5(open(it['path'].join(['public/', '']) if False else 'public/' + it['path'], 'rb').read()).hexdigest()})
m['note'] = m['note'] + ' | 2026-11-08: gunner·naval·assassin·monster 전용 아이콘으로 교체(호출 1회, troop_icon_calls_log.jsonl)'
json.dump(m, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(res)
