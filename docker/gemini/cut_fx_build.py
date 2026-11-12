# 전투 컷신 속도선 오버레이(호출 없음, 안아트 2026-11-04): fx.cut_speedlines 1024x512 투명 webp.
#   왼쪽 가장자리에서 화면 안쪽(오른쪽 소실점)으로 뻗는 흰 속도선. 굵은 쪽 = 왼쪽 가장자리, 끝으로 갈수록 가늘고 투명. 오른쪽 진영은 코드가 좌우 반전.
#   4배 슈퍼샘플 후 축소(가장자리 부드럽게). 시드 고정(재현 가능).
import os, math, json
import numpy as np
from PIL import Image, ImageDraw
OUT = 'public/assets/fx/cut'; os.makedirs(OUT, exist_ok=True)
W, H, K = 1024, 512, 4
rng = np.random.default_rng(20261104)
im = Image.new('L', (W * K, H * K), 0); d = ImageDraw.Draw(im)
VX, VY = 1250 * K, 256 * K   # 소실점(화면 밖 오른쪽)
for i in range(46):
    y0 = rng.uniform(-0.05, 1.05) * H * K
    ln = rng.uniform(0.18, 0.62) * W * K * (1.0 - 0.55 * abs(y0 / (H * K) - 0.5))   # 가운데 선은 짧게(인물·유닛 가림 방지)
    ang = math.atan2(VY - y0, VX - 0); wd = rng.uniform(2.0, 9.0) * K * (1.3 if rng.random() < 0.15 else 1.0)
    a0 = int(rng.uniform(150, 255))
    steps = 40
    for s in range(steps):
        t0, t1 = s / steps, (s + 1) / steps
        x0, yy0 = math.cos(ang) * ln * t0, y0 + math.sin(ang) * ln * t0
        x1, yy1 = math.cos(ang) * ln * t1, y0 + math.sin(ang) * ln * t1
        w = max(1, int(wd * (1 - t0) ** 1.2)); a = int(a0 * (1 - t0) ** 1.6)
        layer = Image.new('L', im.size, 0); ImageDraw.Draw(layer).line([(x0, yy0), (x1, yy1)], fill=a, width=w)
        im = Image.fromarray(np.maximum(np.asarray(im), np.asarray(layer)))
al = im.resize((W, H), Image.LANCZOS)
rgba = Image.merge('RGBA', (Image.new('L', (W, H), 255),) * 3 + (al,))
p = f'{OUT}/cut_speedlines.webp'; rgba.save(p, 'WEBP', lossless=True, method=6)
print(p, os.path.getsize(p))
