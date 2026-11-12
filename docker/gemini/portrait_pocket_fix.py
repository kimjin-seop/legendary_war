"""기존 초상화의 '검은 주머니' 보정(호출 없음). 원인: 구 portrait_edge_fix.py 의 binary_fill_holes 가 팔-몸통 사이·활 안쪽 등
닫힌 투명 주머니를 불투명으로 메워 RGB(0,0,0) 면이 생김(2026-11-01 스크립트 수정 완료). 원본 JPEG 가 없는 파일용 사후 보정.
판정: alpha>200 이고 RGB 가 정확히 (0,0,0) 인 연결 영역 중 면적 MIN_AREA 이상이면서 매끈한 형태(원형도 4πA/P²>0.25, 구멍 메움률>0.97)만 → 투명.
      (그림 속 짙은 그림자도 (0,0,0)일 수 있으나 경계가 거칠어 원형도가 낮음: 2026-11-01 육안 대조로 기준 확정) 경계 2px 안의 거의 검은(최대값<=16) 픽셀도 투명.
사용: python portrait_pocket_fix.py <in.png> <out.png>   (출력: 보정 픽셀 수)"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
MIN_AREA = 200
def fix(a):
    blk = (a[..., 3] > 200) & (a[..., :3].max(2) == 0)
    l, n = ndi.label(blk)
    if not n: return a, 0
    s = ndi.sum(blk, l, range(1, n + 1))
    keep = []
    for i, v in enumerate(s, 1):
        if v < MIN_AREA: continue
        m = l == i; per = (m & ~ndi.binary_erosion(m)).sum()
        if 4 * np.pi * v / per ** 2 > 0.25 and v / ndi.binary_fill_holes(m).sum() > 0.97: keep.append(i)
    if not keep: return a, 0
    pocket = np.isin(l, keep)
    near = ndi.binary_dilation(pocket, iterations=2) & (a[..., :3].max(2) <= 16)
    m = pocket | near
    b = a.copy(); b[m, 3] = 0; b[m, :3] = 0
    return b, int(m.sum())
if __name__ == '__main__':
    a = np.asarray(Image.open(sys.argv[1]).convert('RGBA'))
    b, k = fix(a)
    if k: Image.fromarray(b, 'RGBA').save(sys.argv[2], optimize=True, compress_level=9)
    print(f"{sys.argv[1].split('/')[-1]:34s} fixed_px={k}")
