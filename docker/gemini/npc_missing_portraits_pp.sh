#!/bin/sh
# [npc_missing 사본(2026-11-09) ← npc_ch26 사본: npc_b11_portraits_pp.sh] NPC 초상 후처리(호출 없음, 안아트 2026-11-07, portrait_campaign_pp.sh + portrait_npc_v3_pp.sh 와 같은 처리, 폴더만 npc_missing/portraits/).
# 크로마키 raw → 투명 PNG(alpha_process.py B) → 높이 1200 → 3배경 미리보기 → <code>.png + 256폭 webp 썸네일(q88) + 마젠타 점검 + 점검 시트·측정.
# 실행(프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm [-e ALPHA_ARGS="T_lo=40 T_hi=90"] -v "$(pwd -W):/app" -w /app python:3.12 sh docker/gemini/npc_missing/portraits_pp.sh portrait_npc_toghan ...
# 의존(pip 공식 레지스트리): pillow(HPND) numpy(BSD-3) scipy(BSD-3) opencv-python-headless(Apache-2.0)
set -e
R=docker/gemini/npc_missing/portraits/raw; O=docker/gemini/npc_missing/portraits/out
mkdir -p "$O/preview" "$O/thumb"
sh docker/gemini/portrait_alpha_batch.sh "$R" "$O" "$@" 2>&1 | grep -v '^$' || true
export PYTHONPATH=/pylib
codes=""
for id in "$@"; do
  code=${id#portrait_}; codes="$codes $code"
  mv -f "$O/$id.png" "$O/$code.png"; mv -f "$O/preview/$id.png" "$O/preview/$code.png"
  python -c "
from PIL import Image; im=Image.open('$O/$code.png'); w,h=im.size; t=im.resize((256, round(h*256/w)), Image.LANCZOS); t.save('$O/thumb/$code.webp', 'WEBP', quality=88, method=6); print('$code', im.size, 'thumb', t.size)"
  python docker/gemini/portrait_magenta_check.py "$O/$code.png"
done
python -X utf8 docker/gemini/npc_missing_portraits_sheet.py "$O/qa_${TAG:-x}" $codes
