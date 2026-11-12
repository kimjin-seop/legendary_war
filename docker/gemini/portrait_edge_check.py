"""초상화 PNG 가장자리 잔여 마젠타/분홍 측정. 사용: python portrait_edge_check.py <png...>
ring = alpha>0 이면서 완전 투명(alpha==0) 픽셀에서 3px 이내인 픽셀.
pink = 분홍/마젠타 계열(B가 G 근처 이상, R이 G보다 15 이상 큼). 가장자리 내측 5~9px 대역(core)의 pink 비율을 기준선으로 같이 출력.
semi = ring 중 반투명(0<alpha<255) 비율. 출력: ring_px pink_ring% pink_core% semi% -> FAIL 조건: pink_ring 픽셀 > 150 (색상 기반: 피부색 제외한 마젠타~분홍 hue)"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
def measure(p):
    a = np.asarray(Image.open(p).convert('RGBA')).astype(int)
    r, g, b, al = (a[..., i] for i in range(4))
    dist = ndi.distance_transform_edt(al > 0)   # 투명 픽셀까지 거리
    ring = (al > 0) & (dist <= 3)
    core = (al == 255) & (dist > 5) & (dist <= 9)
    import colorsys
    hsv = np.stack(np.vectorize(colorsys.rgb_to_hsv)(r / 255, g / 255, b / 255))
    pink = (hsv[0] > 0.79) & (hsv[0] < 0.97) & (hsv[1] > 0.2) & (hsv[2] > 0.35)  # 마젠타~분홍 색상(피부색 제외)
    n = int(ring.sum())
    pr = float(pink[ring].mean() * 100) if n else 0
    pc = float(pink[core].mean() * 100) if core.any() else 0
    semi = float(((al < 255)[ring]).mean() * 100) if n else 0
    return n, pr, pc, semi, int((pink & ring).sum())
if __name__ == '__main__':
    for p in sys.argv[1:]:
        n, pr, pc, semi, cnt = measure(p)
        flag = "FAIL" if cnt > 150 else "ok"
        print(f"{p.split('/')[-1]:34s} ring={n:6d} pink_ring={pr:5.1f}% pink_core={pc:5.1f}% semi={semi:5.1f}% pink_px={cnt:5d} {flag}")
