#!/bin/sh
# npc_missing 초상 내부 반투명·검은 얼룩 복구(호출 없음, 안아트 2026-11-09): portrait_darkspot_fix.py(원본 JPEG 색 복원) → 썸네일 재생성 → 마젠타 점검 → 점검 시트(TAG).
# 실행(프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm -e TAG=b1fix -v "$(pwd -W):/app" -w /app python:3.12 sh docker/gemini/npc_missing_darkfix.sh <code> ...
set -e
R=docker/gemini/npc_missing/portraits/raw; O=docker/gemini/npc_missing/portraits/out
mkdir -p /pylib; pip install -q --target /pylib pillow numpy scipy opencv-python-headless >/dev/null 2>&1; export PYTHONPATH=/pylib
for c in "$@"; do
  python docker/gemini/portrait_darkspot_fix.py "$R/portrait_$c.jpg" "$O/$c.png" "$O/$c.png"; echo
  python -c "
from PIL import Image; im=Image.open('$O/$c.png'); w,h=im.size; im.resize((256, round(h*256/w)), Image.LANCZOS).save('$O/thumb/$c.webp','WEBP',quality=88,method=6)"
  python docker/gemini/portrait_magenta_check.py "$O/$c.png"
done
python -X utf8 docker/gemini/npc_missing_portraits_sheet.py "$O/qa_${TAG:-fix}" "$@"
