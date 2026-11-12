#!/bin/sh
# 삼국 초상 후처리(호출 없음): raw_portrait/<code>.jpg → alpha_process.py B(portrait_alpha_batch.sh) → portrait_out/<code>.png(높이 1200) + thumb webp 256 + 마젠타 잔여 점검 + QA 접촉 시트.
# 실행(프로젝트 루트): docker run --rm -v samguk_pylib:/pylib -v "$(pwd -W):/app" -w /app python:3.12 sh docker/gemini/samguk_recraft/portrait_pp.sh <contact_name> code1 code2 ...
set -e
W=docker/gemini/samguk_recraft; R=$W/raw_portrait; O=$W/portrait_out; NAME=$1; shift
mkdir -p "$O/thumb" "$W/qa"
export PYTHONPATH=/pylib
python -c "import PIL, scipy, cv2" 2>/dev/null || pip install -q --target /pylib pillow numpy scipy opencv-python-headless >/dev/null 2>&1
ALPHA_ARGS="${ALPHA_ARGS:-T_lo=30 T_hi=60}" sh docker/gemini/portrait_alpha_batch.sh "$R" "$O" "$@" 2>&1 | grep -v '^$' | grep -v preview || true
L=""
for c in "$@"; do
  python -c "
from PIL import Image; im=Image.open('$O/$c.png'); w,h=im.size; t=im.resize((256, round(h*256/w)), Image.LANCZOS); t.save('$O/thumb/$c.webp','WEBP',quality=88,method=6); print('$c', im.size, 'thumb', t.size)"
  python docker/gemini/portrait_magenta_check.py "$O/$c.png" | tail -1
  L="$L $O/$c.png"
done
python $W/contact.py $W/qa/p_$NAME.jpg 560 $L
