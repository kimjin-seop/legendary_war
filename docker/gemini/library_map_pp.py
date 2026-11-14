# 잊힌 서고 도서관 지도 배경 후처리(안아트 2026-11-14, API 호출 없음)
# raw/<id>.jpg(21:9 4K) -> 가운데 2.2 비 크롭 -> 구역별 톤 보정(로비·1막 바닥 밝기 낮춤: 금색 노드 대비) + 약한 비네트 -> WebP 3520x1600 / 1760x800
# 실행(저장소 루트): python docker/gemini/library_map_pp.py [id=lib_a3]
# 산출: public/assets/maps/library/library_base_3520.webp, library_base_1760.webp, docker/gemini/library_map/library_map_qa.json(노드 자리 대비 측정)
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
ID = sys.argv[1] if len(sys.argv) > 1 else 'lib_a3'
P = json.load(open('resources/js/game/data/library_map_profile.json', encoding='utf8'))
A = P['aspect']; OUT = 'public/assets/maps/library'; os.makedirs(OUT, exist_ok=True)
# 구역별 밝기 계수(chapter -> 곱), 경계는 부드럽게 보간
GAIN = {0: 0.76, 101: 0.70, 102: 0.80, 103: 0.94, 104: 0.82}  # v2: 1차 측정 금색 노드 대비 최소 1.43 -> 바닥 밝기 더 낮춤
SAT = {0: 0.88, 101: 0.86, 102: 1.0, 103: 1.0, 104: 1.0}
VIGNETTE = 0.10  # 가장자리 최대 10% 어둡게(약하게)

src = Image.open(f'docker/gemini/library_map/raw/{ID}.jpg').convert('RGB')
w, h = src.size; cw = round(h * A); x0 = (w - cw) // 2
src = src.crop((x0, 0, x0 + cw, h))

def grade(im):
    a = np.asarray(im).astype(np.float32) / 255.0; H, W = a.shape[:2]
    xs = (np.arange(W) + 0.5) / W
    cen = [((z['rect'][0] + z['rect'][2]) / 2, z['chapter']) for z in P['zones']]
    cx = np.array([c for c, _ in cen]); g = np.interp(xs, cx, [GAIN[k] for _, k in cen]); s = np.interp(xs, cx, [SAT[k] for _, k in cen])
    # 구역 보정은 바닥 높이(위 띠·아래 띠 제외)에서 가장 세고 위아래로 갈수록 절반까지 약해짐
    ys = (np.arange(H) + 0.5) / H; band = np.clip(1 - np.maximum(0, np.abs(ys - 0.52) - 0.30) / 0.25, 0.5, 1.0)
    G = 1 - (1 - g[None, :]) * band[:, None]; S = 1 - (1 - s[None, :]) * band[:, None]
    lum = (a * [0.299, 0.587, 0.114]).sum(2, keepdims=True)
    a = lum + (a - lum) * S[..., None]
    # 하이라이트 위주로 낮춤(어두운 곳은 덜): 밝기에 비례한 계수
    k = 1 - (1 - G[..., None]) * np.clip(lum * 1.4, 0.35, 1.0)
    a = a * k
    # 약한 타원 비네트
    yy, xx = np.meshgrid(ys, xs, indexing='ij'); r = np.sqrt(((xx - 0.5) / 0.5) ** 2 + ((yy - 0.5) / 0.5) ** 2) / np.sqrt(2)
    a = a * (1 - VIGNETTE * np.clip((r - 0.55) / 0.45, 0, 1) ** 2)[..., None]
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))

out = {}
for W_, H_, q in [(3520, 1600, 82), (1760, 800, 80)]:
    im = grade(src.resize((W_, H_), Image.LANCZOS))
    if W_ == 3520: im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=3))
    p = f'{OUT}/library_base_{W_}.webp'; im.save(p, 'WEBP', quality=q, method=6)
    out[W_] = {'path': p, 'bytes': os.path.getsize(p), 'size': f'{W_}x{H_}'}
    if W_ == 1760: im.save(f'docker/gemini/library_map/preview/{ID}_final_1760.jpg', quality=88); small = im

# 노드 자리 대비: 노드 아이콘(약 22x28px @1760) 영역 배경 평균 상대휘도 vs 금색 accent(0xc9a24b)·accentLight(0xf0d58c)
def rl(c):
    c = np.asarray(c, np.float64) / 255; c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4); return float(c @ [0.2126, 0.7152, 0.0722])
cr = lambda l1, l2: (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
GOLD, GOLD_L = rl((0xc9, 0xa2, 0x4b)), rl((0xf0, 0xd5, 0x8c))
arr = np.asarray(small).astype(np.float64); rows = []
for s in P['stages']:
    x, y = s['map']['pin']['x'] * 1760, s['map']['pin']['y'] * 800
    patch = arr[int(y - 28):int(y), int(x - 11):int(x + 11)].reshape(-1, 3)
    L = rl(patch.mean(0)); rows.append({'stage': s['stage_code'], 'bg_lum': round(L, 3), 'cr_gold': round(cr(L, GOLD), 2), 'cr_gold_light': round(cr(L, GOLD_L), 2), 'bg_std': round(float(patch.std()), 1)})
json.dump({'id': ID, 'outputs': out, 'nodes': rows}, open('docker/gemini/library_map/library_map_qa.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(json.dumps(out)); print('min cr_gold', min(r['cr_gold'] for r in rows), 'max bg_std', max(r['bg_std'] for r in rows))
for r in rows: print(r['stage'], r['bg_lum'], r['cr_gold'], r['bg_std'])
