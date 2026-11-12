#!/bin/sh
# [v4] 후처리+비교 시트(호출 없음). 실행(프로젝트 루트): sh docker/gemini/hero_v4_pp.sh code1,code2
# 출력: docker/gemini/hero_v4_out/{64,64_x2}, docker/gemini/hero_v4_preview/{<code>_qa.png,compare/,pp_report.json}. public/assets 는 건드리지 않음(반영은 hero_v4_publish.mjs)
export MSYS_NO_PATHCONV=1
for c in $(echo "$1" | tr ',' ' '); do
  for d in 64 64_x2; do rm -f "docker/gemini/hero_v4_out/$d/hero_${c}_ally.png" "docker/gemini/hero_v4_out/$d/hero_${c}_enemy.png"; done
done
docker run --rm -v sharpcache:/sp -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 sh -c "SHARP_DIR=/sp HERO_RAWD=docker/gemini/hero_v4_raw HERO_OUT=docker/gemini/hero_v4_out HERO_PV=docker/gemini/hero_v4_preview HERO_FACE=docker/gemini/hero_v4_facing.json node docker/gemini/hero_dir_pp_v4.mjs $1 && SHARP_DIR=/sp node docker/gemini/hero_v3_compare.mjs docker/gemini/hero_v4_out docker/gemini/hero_v4_preview/compare $1"
