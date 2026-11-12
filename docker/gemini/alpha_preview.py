"""투명 PNG 를 네이비/베이지/체커보드 위에 합성한 비교 미리보기 생성.
실행: python docker/gemini/alpha_preview.py <출력.png> <입력1.png> [입력2.png ...]  (입력 여러 장이면 위아래로 쌓음)
"""
import sys
import numpy as np
from PIL import Image

W, H = 448, 600
def bgs():
    navy = np.zeros((H, W, 3), np.uint8); navy[:] = (16, 24, 52)
    beige = np.zeros((H, W, 3), np.uint8); beige[:] = (232, 220, 190)
    yy, xx = np.mgrid[0:H, 0:W]
    c = (((yy // 16) + (xx // 16)) % 2)[..., None]
    chk = np.where(c, 200, 120).astype(np.uint8).repeat(3, axis=2)
    return [navy, beige, chk]

def row(path):
    im = Image.open(path).convert('RGBA').resize((W, H), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32); al = a[..., 3:4] / 255
    return np.concatenate([(a[..., :3] * al + b * (1 - al)).astype(np.uint8) for b in bgs()], axis=1)

if __name__ == '__main__':
    out, ins = sys.argv[1], sys.argv[2:]
    Image.fromarray(np.concatenate([row(p) for p in ins], axis=0)).save(out, optimize=True)
