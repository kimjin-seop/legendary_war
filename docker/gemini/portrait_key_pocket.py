"""닫힌 마젠타 주머니(귀걸이 고리 안쪽 등) 투명화(호출 없음). 엄격 마젠타(R,B>140, G가 R·B보다 50 이상 낮음)와 그 1px 이웃 → alpha 0.
사용: python portrait_key_pocket.py <in.png> <out.png>"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
a = np.asarray(Image.open(sys.argv[1]).convert('RGBA')).copy(); r, g, b = (a[..., i].astype(int) for i in range(3))
m = (r > 140) & (b > 140) & (g < r - 50) & (g < b - 50) & (a[..., 3] > 0)
m = ndi.binary_dilation(m, iterations=1) & (a[..., 3] > 0) & ((r - g > 25) & (b - g > 25) | m)
a[m] = 0; Image.fromarray(a, 'RGBA').save(sys.argv[2], optimize=True, compress_level=9)
print(f"{sys.argv[2].split('/')[-1]:28s} pocket_cleared_px={int(m.sum())}")
