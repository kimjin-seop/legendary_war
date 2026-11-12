#!/bin/sh
# 후처리(호출 없음): raw/<code>.jpg → portrait_alpha_batch.sh(alpha_process.py B) → out/<code>.png(높이 1200) + out/thumb/<code>.webp(256, q88) + 마젠타 잔여 점검.
# 실행(프로젝트 루트): docker run --rm -v samguk_pylib:/pylib -v "$(pwd -W):/app" -w /app python:3.12 sh docker/gemini/portrait_redo3/pp.sh code1 code2 ...
set -e
W=docker/gemini/portrait_redo3; O=$W/out
mkdir -p "$O/thumb"; export PYTHONPATH=/pylib
python -c "import PIL, scipy, cv2" 2>/dev/null || pip install -q --target /pylib pillow numpy scipy opencv-python-headless >/dev/null 2>&1
ALPHA_ARGS="${ALPHA_ARGS:-T_lo=30 T_hi=60}" sh docker/gemini/portrait_alpha_batch.sh "$W/raw" "$O" "$@" 2>&1 | grep -v '^$' | grep -v preview || true
for c in "$@"; do
  python -c "
from PIL import Image; im=Image.open('$O/$c.png'); w,h=im.size
if (w,h)!=(896,1200): im=im.resize((896,1200),Image.LANCZOS); im.save('$O/$c.png')
t=im.resize((256,343),Image.LANCZOS); t.save('$O/thumb/$c.webp','WEBP',quality=88,method=6); print('$c',im.size)"
  python docker/gemini/portrait_magenta_check.py "$O/$c.png" | tail -1
done
