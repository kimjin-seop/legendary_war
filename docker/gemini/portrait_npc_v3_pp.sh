#!/bin/sh
# 신규 NPC v3 초상 후처리(호출 없음, 안아트 2026-11-02): portrait_campaign_pp.sh(크로마키→투명 PNG·thumb·마젠타 점검) + 점검 시트·측정(머리 상단·잘림·내부 반투명).
# 실행(프로젝트 루트): docker run --rm -e TAG=b1 -v "$(pwd -W):/app" -w /app python:3.12 sh docker/gemini/portrait_npc_v3_pp.sh portrait_npc_a ...
# ALPHA_ARGS 환경변수는 alpha_process.py 로 전달(흰 옷 내부 반투명 시 "T_lo=40 T_hi=90")
set -e
sh docker/gemini/portrait_campaign_pp.sh "$@"
export PYTHONPATH=/pylib
codes=""; for id in "$@"; do codes="$codes ${id#portrait_}"; done
python -X utf8 docker/gemini/portrait_npc_enemy_sheet.py out "docker/gemini/portrait_campaign/npc_v3_${TAG:-x}" $codes
