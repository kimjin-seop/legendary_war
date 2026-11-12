# 김춘추(npc_kim_chunchu) 금관 초상 r3 게시(호출 없음, 안아트 2026-11-08).
# 입력: portrait_campaign/out/npc_kim_chunchu.png(portrait_campaign_pp.sh 결과, 896x1200 RGBA)
# 처리: 금관 끝 상단 여백 1.67% -> 약 6% 맞춤(아래 가장자리 기준 0.955배 축소, 가로 중앙, 허리 잘림 유지)
#       -> 정식 webp(lossy q90, alpha_quality 100, method 6 = webp_convert.py portraits 규칙) + 썸네일 256x343 webp(q88 = pp 규칙)
# 실행(프로젝트 루트): docker run --rm -v "$(pwd -W):/app" -w /app python:3.12 sh -c "pip install -q pillow numpy && python docker/gemini/kim_chunchu_crown_publish.py"
import os
import numpy as np
from PIL import Image

SRC = 'docker/gemini/portrait_campaign/out/npc_kim_chunchu.png'
PRE = 'docker/gemini/portrait_campaign/out/npc_kim_chunchu_r3_preframe.png'
DST = 'public/assets/portraits/npc/npc_kim_chunchu.webp'
THUMB = 'public/assets/portraits/npc/thumb/npc_kim_chunchu.webp'
W, H, S = 896, 1200, 0.955

im = Image.open(SRC).convert('RGBA')
assert im.size == (W, H), im.size
if not os.path.exists(PRE):
    im.save(PRE, optimize=True)
src = Image.open(PRE).convert('RGBA')
nw, nh = round(W * S), round(H * S)
small = src.resize((nw, nh), Image.LANCZOS)
out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
out.alpha_composite(small, ((W - nw) // 2, H - nh))
out.save(SRC, optimize=True, compress_level=9)

al = np.asarray(out)[..., 3]
ys, xs = np.where(al > 0)
print('bbox', xs.min(), ys.min(), xs.max(), ys.max(), 'top%', round(ys.min() / H * 100, 2), 'bottom_row_opaque', int((al[-1] == 255).sum()))

out.save(DST, 'WEBP', quality=90, alpha_quality=100, method=6)
t = out.resize((256, round(H * 256 / W)), Image.LANCZOS)
t.save(THUMB, 'WEBP', quality=88, method=6)
chk = np.asarray(Image.open(DST).convert('RGBA')).astype(np.int16)
print(DST, os.path.getsize(DST), 'alpha_max_diff', int(np.abs(chk[..., 3] - np.asarray(out)[..., 3]).max()))
print(THUMB, t.size, os.path.getsize(THUMB))
