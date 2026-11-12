"""초상화 내부 반투명 점검(호출 없음). 투명 경계에서 8px 이상 안쪽인데 alpha<250 인 픽셀 수(옅은 의상이 비치는 결함 탐지).
사용: python portrait_interior_alpha.py <png...>"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
for p in sys.argv[1:]:
    al = np.asarray(Image.open(p).convert('RGBA'))[..., 3].astype(int)
    filled = ndi.binary_fill_holes(al > 0)
    inner = ndi.distance_transform_edt(filled) > 8
    bad = inner & (al < 250)
    print(f"{p.split('/')[-1]:30s} interior_semi={int(bad.sum()):7d} ({bad.sum()/max(1,inner.sum())*100:.2f}%)")
