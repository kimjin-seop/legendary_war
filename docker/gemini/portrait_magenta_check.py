"""투명 PNG 의 잔여 마젠타/분홍 점검. 사용: python portrait_magenta_check.py <png...>
불투명(alpha>128) 픽셀 중 R,B 높고 G 낮은 마젠타 계열 개수와, 반투명 가장자리(0<alpha<255)의 마젠타 개수를 보고."""
import sys, numpy as np
from PIL import Image
for p in sys.argv[1:]:
    a = np.asarray(Image.open(p).convert('RGBA')).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mg = (r > 140) & (b > 140) & (g < r - 50) & (g < b - 50)
    print(f"{p.split('/')[-1]}: opaque_magenta={int((mg & (al > 128)).sum())} edge_magenta={int((mg & (al > 0) & (al <= 128)).sum())}")
