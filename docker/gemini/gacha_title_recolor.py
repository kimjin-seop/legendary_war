# 뽑기 타이틀 채움 색 보정(이미지 API 호출 없음, 안아트 2026-11-03): 어두운 먹 채움 -> 밝은 아이보리~금 세로 그라데이션, 금 외곽선 -> 어두운 외곽선 + 바깥 3px 어두운 테(어두운 하늘 위 대비)
# 사용: python gacha_title_recolor.py <in.png> <out.png>
import sys
import numpy as np
from PIL import Image, ImageFilter
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA'); a = np.array(im).astype(np.float32); A = a[..., 3]
rgb = a[..., :3]; lum = rgb @ np.array([0.299, 0.587, 0.114])
sat = rgb.max(-1) - rgb.min(-1)
on = A > 0
fill = on & (lum < 110)                         # 먹 채움(광택 포함 어두운 부분)
rim = on & ~fill                                # 금 외곽선·밝은 광택 띠
ys = np.where(on.any(1))[0]; y0, y1 = ys.min(), ys.max()
t = np.clip((np.arange(a.shape[0]) - y0) / max(1, y1 - y0), 0, 1)[:, None]
top, bot = np.array([255, 246, 214]), np.array([226, 168, 72])          # 아이보리 -> 금
grad = top * (1 - t[..., None]) + bot * t[..., None]
gloss = np.clip((lum - lum[fill].min()) / max(1.0, np.ptp(lum[fill])), 0, 1)[..., None] if fill.any() else 0
out = a.copy()
out[..., :3] = np.where(fill[..., None], np.clip(grad * (0.86 + 0.14 * gloss), 0, 255), out[..., :3])
out[..., :3] = np.where(rim[..., None], np.array([42, 24, 18]), out[..., :3])       # 외곽선 = 짙은 적갈 먹색
o = Image.fromarray(out.astype(np.uint8))
# 바깥 테: 알파 팽창 3px 영역을 어두운 색으로(원래 글자 아래)
m = Image.fromarray((A > 40).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))
ring = Image.new('RGBA', o.size, (28, 16, 14, 0)); ring.putalpha(m)
base = Image.new('RGBA', o.size, (0, 0, 0, 0)); base.alpha_composite(ring); base.alpha_composite(o)
b = np.array(base); b[..., 3] = np.where(b[..., 3] > 127, 255, np.where(b[..., 3] > 0, b[..., 3], 0))
Image.fromarray(b).save(dst, optimize=True)
print('fill px', int(fill.sum()), 'rim px', int(rim.sum()))
