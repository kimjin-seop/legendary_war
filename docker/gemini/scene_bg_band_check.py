# 대사 배경 raw 의 레터박스형 단색 띠 측정 + 미리보기 시트(호출 없음, 안아트 2026-11-03). 사용: python scene_bg_band_check.py <out.jpg> <prefix> ...
import sys, glob, os
import numpy as np
from PIL import Image
out, pre = sys.argv[1], sys.argv[2:]
fs = sorted(f for p in pre for f in glob.glob(f'public/assets/raw/scene_bg/{p}_*.jpg'))
for f in fs:
    a = np.asarray(Image.open(f).convert('L')).astype(float); h = a.shape[0]; flat = (a.std(1) < 3) & (a.mean(1) < 25)
    t = 0
    while t < h and flat[t]: t += 1
    b = h
    while b > 0 and flat[b - 1]: b -= 1
    print(os.path.basename(f), 'top', round(t / h, 3), 'bot', round(b / h, 3))
W, H = 480, 268; s = Image.new('RGB', (W * 3, H * ((len(fs) + 2) // 3)))
for i, f in enumerate(fs): s.paste(Image.open(f).convert('RGB').resize((W, H)), ((i % 3) * W, (i // 3) * H))
s.save(out, quality=85); print([os.path.basename(f) for f in fs])
