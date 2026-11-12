#!/bin/sh
# 누락 영웅 초상 후처리(호출 없음, 안아트-2 2026-11-09). ch25_portraits_pp.sh 와 같은 처리, 폴더만 missing_heroes/.
# raw/<code>.jpg → 투명 PNG(portrait_alpha_batch.sh → alpha_process.py B, 높이 1200) → out/<code>.png + 3배경 preview + thumb/<code>.webp(256폭 q88) + 마젠타 점검.
# 실행(프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/app" -w /app python:3.12 sh docker/gemini/missing_heroes/mh_pp.sh npc_memnon ...
# 의존(pip 공식 레지스트리): pillow(HPND) numpy(BSD-3) scipy(BSD-3) opencv-python-headless(Apache-2.0)
set -e
R=docker/gemini/missing_heroes/raw; O=docker/gemini/missing_heroes/out
mkdir -p "$O/preview" "$O/thumb"
sh docker/gemini/portrait_alpha_batch.sh "$R" "$O" "$@" 2>&1 | grep -v '^$' || true
export PYTHONPATH=/pylib
for code in "$@"; do
  python -c "
from PIL import Image; im=Image.open('$O/$code.png'); w,h=im.size; t=im.resize((256, round(h*256/w)), Image.LANCZOS); t.save('$O/thumb/$code.webp', 'WEBP', quality=88, method=6); print('$code', im.size, 'thumb', t.size)"
  python docker/gemini/portrait_magenta_check.py "$O/$code.png"
done
