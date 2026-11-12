"""초상화 JPEG -> 투명 배경 PNG 후처리 (방법 A: 가장자리 flood-fill, 방법 B: 마젠타 크로마키).
실행(컨테이너): python docker/gemini/alpha_process.py A|B <입력.jpg> <출력.png> [옵션]
의존: pillow numpy scipy opencv-python-headless (pip 공식 레지스트리)
"""
import sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi


def load(path):
    return np.asarray(Image.open(path).convert('RGB'))


def lab(rgb):
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def defringe(rgb, alpha, core_thr=0.97, mix=1.0):
    """반투명/가장자리 픽셀의 색을 가장 가까운 '확실한 전경' 픽셀 색으로 교체 (배경색 번짐 제거)."""
    core = alpha >= core_thr
    core = ndi.binary_erosion(core, iterations=1)
    _, (iy, ix) = ndi.distance_transform_edt(~core, return_indices=True)
    near = rgb[iy, ix].astype(np.float32)
    w = (1 - smoothstep((alpha - 0.97) / 0.03))[..., None] * mix  # alpha<1 인 곳만
    out = rgb.astype(np.float32) * (1 - w) + near * w
    return np.clip(out, 0, 255).astype(np.uint8)


def method_a(rgb, T_core=8.0, T_hi=14.0, T_lo=6.0, grad=6.0, grow=2, feather=0.9, hole_T=4.0, hole_min=4000, speck=1500, pinhole=120, iters=3, open_px=2, Lmax=100.0, growmax=1.25):
    """가장자리 flood-fill. 배경 팔레트(테두리 k-means) 와의 Lab 거리 < T_core 이고 기울기(윤곽선) < grad 인 픽셀만
    외곽에서 연결 채움 -> 윤곽선이 장벽 역할. 이후 grow px 만큼 T_hi 이내로 측지 팽창해 윤곽 앞까지 닿게 하고,
    경계 2px 대역에 색 거리 기반 부드러운 알파 + feather. 마지막에 de-fringe."""
    h, w, _ = rgb.shape
    Lb = lab(cv2.GaussianBlur(rgb, (0, 0), 0.8))
    band = np.zeros((h, w), bool); band[:4] = band[-4:] = True; band[:, :4] = band[:, -4:] = True
    def palette(pts, k):
        _, _, c = cv2.kmeans(pts, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.1), 3, cv2.KMEANS_PP_CENTERS)
        return c
    def dist(cs):
        return np.min(np.stack([np.linalg.norm(Lb - c, axis=2) for c in cs]), axis=0)
    d = dist(palette(Lb[band], 6))
    gx = cv2.Sobel(Lb[..., 0], cv2.CV_32F, 1, 0); gy = cv2.Sobel(Lb[..., 0], cv2.CV_32F, 0, 1)
    g = np.hypot(gx, gy) / 4.0
    def fill(d):
        cand = (d < T_core) & (g < grad) & (Lb[..., 0] < Lmax * 2.55)
        lbl, _ = ndi.label(cand)
        el = np.unique(np.concatenate([lbl[0], lbl[-1], lbl[:, 0], lbl[:, -1]])); el = el[el > 0]
        b = np.isin(lbl, el)
        return ndi.binary_opening(b, iterations=int(open_px)) if open_px else b
    bg = fill(d)
    for _ in range(int(iters) - 1):  # 배경 팔레트를 채워진 영역에서 재추정(글로우/그라데이션 추종)
        idx = np.flatnonzero(bg.ravel())
        if len(idx) < 1000: break
        sel = Lb.reshape(-1, 3)[np.random.RandomState(0).choice(idx, min(len(idx), 60000), replace=False)]
        d2 = dist(palette(sel, 10))
        nb = fill(d2)
        if nb.sum() > growmax * bg.sum(): break  # 누수 의심(면적 급증) -> 이전 결과 유지
        d, bg = d2, nb
    # 측지 팽창: 윤곽선(기울기 큰 픽셀)까지 배경을 조금 넓힘 (d<T_hi 조건)
    for _ in range(int(grow)):
        bg = bg | (ndi.binary_dilation(bg) & (d < T_hi))
    # 닫힌 배경 구멍: 엄격한 조건(d<hole_T, 평탄) + 큰 면적만
    cand2 = (d < hole_T) & (g < grad) & ~bg
    lbl2, n2 = ndi.label(cand2)
    if n2:
        sizes = ndi.sum(cand2, lbl2, range(1, n2 + 1))
        for i, s in enumerate(sizes, 1):
            if s >= hole_min:
                bg |= ndi.binary_dilation(lbl2 == i, iterations=2) & (d < T_hi)
    # 배경 잔여 얼룩 제거: 불투명 영역 중 면적 speck 미만 연결요소는 배경 처리, 작은 투명 핀홀은 메움
    fg = ~bg
    fl, fn = ndi.label(fg)
    if fn:
        fs = ndi.sum(fg, fl, range(1, fn + 1))
        small = np.isin(fl, [i for i, s in enumerate(fs, 1) if s < speck])
        bg = bg | small
    bl, bn = ndi.label(bg)
    if bn:
        bs = ndi.sum(bg, bl, range(1, bn + 1))
        pin = np.isin(bl, [i for i, s in enumerate(bs, 1) if s < pinhole])
        bg = bg & ~pin
    alpha = np.ones((h, w), np.float32)
    alpha[bg] = 0
    dist_bg = ndi.distance_transform_edt(~bg)
    zone = (~bg) & (dist_bg <= 2)
    alpha[zone] = smoothstep((d[zone] - T_lo) / max(T_hi - T_lo, 1e-3))
    alpha = cv2.GaussianBlur(alpha, (0, 0), feather)
    alpha[~ndi.binary_dilation(bg, iterations=3)] = 1.0
    alpha = np.clip(alpha, 0, 1)
    return defringe(rgb, alpha), alpha


def method_b(rgb, key=(255, 0, 255), T_lo=60.0, T_hi=120.0, feather=0.8, despill=True, pocket_min=40):
    """마젠타 크로마키: 키색과의 Lab 거리 기반 알파 + 스필 제거(R,B 를 G 쪽으로 클램프)."""
    L = lab(cv2.GaussianBlur(rgb, (0, 0), 0.8))
    kl = lab(np.array([[key]], np.uint8))[0, 0]
    d = np.linalg.norm(L - kl, axis=2)
    alpha = smoothstep((d - T_lo) / (T_hi - T_lo))
    # 외곽에서 연결되지 않은 마젠타 유사색(전경 내부 분홍 등)은 보존: 외곽 연결 + 경계 인접만 투명 처리
    keyish = alpha < 0.999
    lbl, n = ndi.label(keyish)
    el = np.unique(np.concatenate([lbl[0], lbl[-1], lbl[:, 0], lbl[:, -1]])); el = el[el > 0]
    # 닫힌 마젠타 주머니(팔-몸통 사이 등): 키색에 매우 가깝고(alpha~0) 면적 pocket_min 이상이면 배경으로 간주
    if n:
        amin = ndi.minimum(alpha, lbl, range(1, n + 1)); asz = ndi.sum(keyish, lbl, range(1, n + 1))
        extra = [i for i, (m, s) in enumerate(zip(amin, asz), 1) if m < 0.02 and s >= pocket_min]
        el = np.unique(np.concatenate([el, extra]))
    conn = np.isin(lbl, el)
    alpha = np.where(conn, alpha, 1.0).astype(np.float32)
    alpha = cv2.GaussianBlur(alpha, (0, 0), feather)
    alpha = np.where(ndi.binary_dilation(conn, iterations=4), alpha, 1.0)
    f = rgb.astype(np.float32)
    if despill:
        # 마젠타 스필: R,B 가 G 보다 클 때 초과분 제거 (경계 근처 8px 에서만 적용 -> 전경 붉은/보라 색 보호)
        near = ndi.binary_dilation(conn, iterations=8)
        r, g, b = f[..., 0], f[..., 1], f[..., 2]
        lim = np.maximum(g, 0) + 0.0
        excess_r = np.clip(r - np.maximum(g, b * 0 + g), 0, None)
        m = np.minimum(r, b)
        spill = np.clip(m - g, 0, None)  # 마젠타 성분량
        spill = np.where(near, spill, 0)
        f[..., 0] = r - spill
        f[..., 2] = b - spill
    rgb2 = np.clip(f, 0, 255).astype(np.uint8)
    rgb2 = defringe(rgb2, alpha, core_thr=0.99)
    return rgb2, alpha


def save(rgb, alpha, out):
    rgba = np.dstack([rgb, (alpha * 255 + 0.5).astype(np.uint8)])
    rgba[alpha <= 0.002, :3] = 0  # 완전 투명 픽셀의 RGB 는 0 으로 (압축 효율)
    Image.fromarray(rgba, 'RGBA').save(out, optimize=True, compress_level=9)


if __name__ == '__main__':
    mode, src, dst = sys.argv[1:4]
    kw = {k: float(v) for k, v in (a.split('=') for a in sys.argv[4:])}
    rgb = load(src)
    rgb2, a = (method_a if mode == 'A' else method_b)(rgb, **kw)
    save(rgb2, a, dst)
    print(f'{dst}: transparent={(a < 0.05).mean():.3f} partial={((a >= 0.05) & (a < 0.95)).mean():.3f}')
