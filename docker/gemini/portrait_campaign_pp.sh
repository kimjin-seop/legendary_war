#!/bin/sh
# 준비 중 캠페인 초상화 후처리(호출 없음, npc_naval_portrait_pp.sh 복제): 크로마키 raw → 투명 PNG(alpha_process.py B) → 높이 1200 → 3배경 미리보기 → 이름 정리(<code>.png) + 256폭 webp 썸네일 + 마젠타 잔여 점검.
# 실행(프로젝트 루트): docker run --rm -v "$(pwd -W):/app" -w /app python:3.12 sh docker/gemini/portrait_campaign_pp.sh portrait_npc_a portrait_npc_b ...
# 의존(pip 공식 레지스트리): pillow(HPND) numpy(BSD-3) scipy(BSD-3) opencv-python-headless(Apache-2.0)
set -e
R=docker/gemini/portrait_campaign/raw; O=docker/gemini/portrait_campaign/out
mkdir -p "$O/preview" "$O/thumb"
sh docker/gemini/portrait_alpha_batch.sh "$R" "$O" "$@" 2>&1 | grep -v '^$' || true
export PYTHONPATH=/pylib
for id in "$@"; do
  code=${id#portrait_}
  mv -f "$O/$id.png" "$O/$code.png"; mv -f "$O/preview/$id.png" "$O/preview/$code.png"
  python -c "
from PIL import Image; im=Image.open('$O/$code.png'); w,h=im.size; t=im.resize((256, round(h*256/w)), Image.LANCZOS); t.save('$O/thumb/$code.webp', 'WEBP', quality=88, method=6); print('$code', im.size, 'thumb', t.size)"
  python docker/gemini/portrait_magenta_check.py "$O/$code.png"
done
