"""초상화 보라·자홍 계열(보라 금지 규칙) 픽셀 측정·치환. 호출 없음.
사용: python portrait_purple_fix.py check <png...>
      python portrait_purple_fix.py fix <in.png> <out.png> [target_hue=0.07] [sat_scale=0.6]
판정: alpha>128, hue 0.72~0.93, sat>0.30, value>0.15 를 보라로 본다. 치환은 명도 유지·색상만 target_hue 로, 채도는 sat_scale 배."""
import sys, os, numpy as np, colorsys
LO = float(os.environ.get("PURPLE_LO", "0.72"))
from PIL import Image
def hsv(a):
    f = a[..., :3] / 255.0; mx = f.max(2); mn = f.min(2); d = mx - mn + 1e-6
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return h, s, mx
def mask(a):
    h, s, v = hsv(a.astype(np.float32))
    return (a[..., 3] > 128) & (h > LO) & (h < 0.93) & (s > 0.30) & (v > 0.15), s, v
if __name__ == '__main__':
    if sys.argv[1] == 'check':
        for p in sys.argv[2:]:
            a = np.asarray(Image.open(p).convert('RGBA')); m, _, _ = mask(a)
            print(f"{p.split('/')[-1]:34s} purple_px={int(m.sum())}")
    else:
        src, dst = sys.argv[2:4]; th = float(sys.argv[4]) if len(sys.argv) > 4 else 0.07; ss = float(sys.argv[5]) if len(sys.argv) > 5 else 0.6
        a = np.asarray(Image.open(src).convert('RGBA')).copy(); m, s, v = mask(a)
        ys, xs = np.nonzero(m)
        for y, x in zip(ys, xs):
            r, g, b = colorsys.hsv_to_rgb(th, min(1.0, s[y, x] * ss), v[y, x]); a[y, x, :3] = (int(r * 255), int(g * 255), int(b * 255))
        Image.fromarray(a, 'RGBA').save(dst, optimize=True, compress_level=9); print(f'{dst}: {len(ys)} px 치환')
