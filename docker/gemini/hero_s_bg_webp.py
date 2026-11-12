# S 배경 판 2x2 시트 → 칸별 896x1200 WebP(호출 없음, 안아트 2026-11-04). 실행: python -X utf8 docker/gemini/hero_s_bg_webp.py
import os
from PIL import Image
R = 'docker/gemini/portrait_s/raw'; O = 'public/assets/portraits/s_bg'; os.makedirs(O, exist_ok=True)
for sheet, names in [('s_bg_a', ['sea', 'fire', 'steppe', 'royal_west']), ('s_bg_b', ['royal_east', 'storm', 'dawn', 'snow'])]:
    im = Image.open(f'{R}/{sheet}.jpg').convert('RGB'); W, H = im.size; m = int(W * 0.012)
    for i, n in enumerate(names):
        c, r = i % 2, i // 2
        cell = im.crop((c * W // 2 + m, r * H // 2 + m, (c + 1) * W // 2 - m, (r + 1) * H // 2 - m)).resize((896, 1200), Image.LANCZOS)
        cell.save(f'{O}/{n}.webp', 'WEBP', quality=86, method=6); print(n, os.path.getsize(f'{O}/{n}.webp'))
