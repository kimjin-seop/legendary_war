# 초상 내부 반투명 구멍 점검(호출 없음): 실루엣 내부(외곽 8px 침식 후)에서 alpha<250 픽셀 수. 크로마키 근접색(진홍·흰색) 의상이 반투명해지는 결함 탐지.
import sys, numpy as np
from PIL import Image
from scipy import ndimage
for f in sys.argv[1:]:
    a = np.asarray(Image.open(f).convert('RGBA'))[..., 3]
    filled = ndimage.binary_fill_holes(a > 128)
    inner = ndimage.binary_erosion(filled, iterations=8)
    bad = inner & (a < 250)
    ys, xs = np.where(bad)
    print(f.split('/')[-1], 'holes', int(bad.sum()), ('bbox %d,%d-%d,%d' % (xs.min(), ys.min(), xs.max(), ys.max())) if len(xs) else '')
