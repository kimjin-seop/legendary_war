# S 초상 외곽 크림색 스티커 테두리 제거(호출 없음, 안아트 2026-11-04): 투명 경계에서 7px 안의 크림색 띠와 그 바깥 검은 선을 지워 안쪽 검은 외곽선을 가장자리로 만듦
# 사용: python portrait_s_outline_fix.py <in.png> <out.png>
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
a = np.array(Image.open(sys.argv[1]).convert('RGBA')).astype(np.int32)
op = a[..., 3] > 128
dist = ndimage.distance_transform_edt(op)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
cream = (r > 190) & (g > 165) & (b > 100) & (r - b > 25) & (dist <= 7) & op
M = ndimage.maximum_filter(np.where(cream, dist, 0), size=11)
kill = op & (M > 0) & (dist <= M + 0.5)
a[kill, 3] = 0
# 남은 가장자리 1px 부드럽게
al = a[..., 3].astype(np.float32); edge = (al > 0) & (ndimage.binary_erosion(al > 0, iterations=1) == 0); al[edge] *= 0.6; a[..., 3] = al.astype(np.int32)
print(f'cream {int(cream.sum())}px, removed {int(kill.sum())}px')
Image.fromarray(a.astype(np.uint8)).save(sys.argv[2], optimize=True)
