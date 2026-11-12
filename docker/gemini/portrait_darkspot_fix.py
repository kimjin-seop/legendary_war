"""초상화 '검은 얼룩' 후처리 복구(호출 없음). portrait_darkspot_check.py 와 같은 판정으로 찾은 화소를 원본 JPEG 의 색으로 되돌린다.
원인: alpha_process B 의 임계가 흰·회색 의복 그늘을 반투명으로 잡고 defringe 가 그 자리를 검정으로 덮음 → 원본 JPEG 에는 정상 색이 있다.
방법: 판정 마스크(원본 최대값>=120 & 결과 최대값<=40 & 알파>128)를 2px 팽창하고, 그 안에서 원본 색이 마젠타가 아닌 화소만
      RGB = 원본 색, 알파 = 255 로 복구. 경계 1px 은 50% 혼합(이음 자국 방지). 마젠타(배경) 화소는 건드리지 않음.
사용: python portrait_darkspot_fix.py <src.jpg> <in.png> <out.png>   (출력: 복구 화소 수, 복구 후 잔여 darkened 수)"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi

src_p, in_p, out_p = sys.argv[1:4]
o = np.asarray(Image.open(in_p).convert('RGBA')).astype(np.int32)
im = Image.open(src_p).convert('RGB')
if im.size != (o.shape[1], o.shape[0]): im = im.resize((o.shape[1], o.shape[0]), Image.LANCZOS)
s = np.asarray(im).astype(np.int32)
bad = (s.max(2) >= 120) & (o[..., :3].max(2) <= 40) & (o[..., 3] > 128)
magenta = (s[..., 0] - s[..., 1] > 60) & (s[..., 2] - s[..., 1] > 60)
core = ndi.binary_dilation(bad, iterations=2) & ~magenta & (o[..., 3] > 32)
# 팽창 영역 중 결과가 원본보다 많이 어두운 화소만(정상 윤곽선은 원본도 어두우므로 제외)
core &= (s.max(2) - o[..., :3].max(2)) > 40
ring = ndi.binary_dilation(core, iterations=1) & ~core & ~magenta & (o[..., 3] > 32) & ((s.max(2) - o[..., :3].max(2)) > 20)
b = o.copy()
b[core, :3] = s[core]; b[core, 3] = 255
b[ring, :3] = (s[ring] + o[ring, :3]) // 2
# 내부(원본에서 배경이 아닌 영역을 4px 침식) 중 반투명이 되었거나 원본과 색이 크게 달라진 화소 → 원본 색·불투명으로(의복 그늘이 반투명/검게 변한 경우)
loose_bg = (s[..., 0] - s[..., 1] > 50) & (s[..., 2] - s[..., 1] > 50)
interior = ndi.binary_erosion(~loose_bg, iterations=4)
diff = np.abs(s - b[..., :3]).sum(2) / 3
fix2 = interior & ((b[..., 3] < 230) | (diff > 50))
b[fix2, :3] = s[fix2]; b[fix2, 3] = 255
print(f"  interior_restored={int(fix2.sum())}", end=' ')
# 원본이 마젠타(=배경)인데 결과가 검은 불투명 → 닫힌 배경 주머니가 메워진 것(portrait_pocket_fix 와 같은 원인) → 투명으로
pocket = (o[..., :3].max(2) <= 40) & (o[..., 3] > 128) & magenta
pocket |= ndi.binary_dilation(pocket, iterations=2) & (o[..., :3].max(2) <= 24) & magenta
b[pocket] = 0
print(f"  pocket_to_transparent={int(pocket.sum())}", end=' ')
after = ((s.max(2) >= 120) & (b[..., :3].max(2) <= 40) & (b[..., 3] > 128)).sum()
Image.fromarray(b.clip(0, 255).astype(np.uint8), 'RGBA').save(out_p, optimize=True, compress_level=9)
print(f"{out_p.split('/')[-1]:28s} before={int(bad.sum())} restored_px={int(core.sum())} ring={int(ring.sum())} after={int(after)}")
