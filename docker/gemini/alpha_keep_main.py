# 투명 PNG 에서 본체(가장 큰 불투명 연결 영역)와 떨어진 작은 조각(생성 잔상)을 지운다(호출 없음, 안아트 2026-11-03).
# 사용: python alpha_keep_main.py <in.png> <out.png> [min_keep_ratio=0.02]  — 본체 대비 min_keep_ratio 미만 크기의 떨어진 조각만 alpha 0
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
src, dst = sys.argv[1], sys.argv[2]
ratio = float(sys.argv[3]) if len(sys.argv) > 3 else 0.02
im = Image.open(src).convert('RGBA'); a = np.array(im)
mask = a[..., 3] > 8
lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
if n:
    sizes = ndimage.sum(mask, lab, range(1, n + 1)); big = sizes.max()
    drop = [i + 1 for i, s in enumerate(sizes) if s < big * ratio]
    kill = np.isin(lab, drop); a[kill, 3] = 0
    print(f'components {n}, removed {len(drop)} ({int(kill.sum())}px)')
Image.fromarray(a).save(dst, optimize=True)
