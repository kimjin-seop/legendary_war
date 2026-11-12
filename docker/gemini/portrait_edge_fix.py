"""초상화 PNG 가장자리 링 정리(후처리). 사용: python portrait_edge_fix.py <in.png> <out.png>
1) 알파 경계 정리: 알파 0.5 이진화 후 1px 침식 + 0.7px 블러(반투명 톱니·번짐 제거)
2) 링(투명 경계 4px 이내) 중 분홍/마젠타 계열 픽셀: 가까운 '내부 코어(투명 경계 5px 이상, 분홍 아님 우선)' 색으로 치환 후 R,B 를 G 쪽으로 끌어 스필 제거
   (윤곽선 어두운 픽셀(밝기<70)은 보존)
"""
import sys, numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
def fix(path):
    a = np.asarray(Image.open(path).convert('RGBA')).copy()
    rgb = a[..., :3].astype(np.float32); al = a[..., 3].astype(np.float32) / 255
    m = al > 0.5
    m = ndi.binary_erosion(m, iterations=1)
    # 작은 구멍(200px 미만)만 메움. 큰 닫힌 주머니(활과 시위 사이 등)는 투명 유지(2026-11-01: 전체 메움 시 RGB 0 검은 면 발생 버그 수정)
    holes = ndi.binary_fill_holes(m) & ~m
    hl, hn = ndi.label(holes)
    if hn:
        hs = ndi.sum(holes, hl, range(1, hn + 1))
        small = np.isin(hl, [i for i, v in enumerate(hs, 1) if v < 200])
        m = m | small
    al2 = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.7)
    al2[~ndi.binary_dilation(m, iterations=2)] = 0
    dist = ndi.distance_transform_edt(m)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    pink = (b > g - 8) & (r > g + 15)
    core = m & (dist > 5) & ~pink
    ring = (dist <= 4) & (lum >= 70)
    bad = ring & pink
    _, (iy, ix) = ndi.distance_transform_edt(~core, return_indices=True)
    near = rgb[iy, ix]
    rgb2 = rgb.copy()
    rgb2[bad] = near[bad]
    # 남은 링 스필: R,B 를 G 쪽으로
    rr = ring & (np.minimum(rgb2[..., 0], rgb2[..., 2]) > rgb2[..., 1])
    sp = np.clip(np.minimum(rgb2[..., 0], rgb2[..., 2]) - rgb2[..., 1], 0, None)
    rgb2[..., 0] = np.where(rr, rgb2[..., 0] - sp, rgb2[..., 0]); rgb2[..., 2] = np.where(rr, rgb2[..., 2] - sp, rgb2[..., 2])
    out = np.dstack([np.clip(rgb2, 0, 255).astype(np.uint8), (al2 * 255 + .5).astype(np.uint8)])
    out[al2 <= 0.002, :3] = 0
    return out
if __name__ == '__main__':
    Image.fromarray(fix(sys.argv[1]), 'RGBA').save(sys.argv[2], optimize=True, compress_level=9)
