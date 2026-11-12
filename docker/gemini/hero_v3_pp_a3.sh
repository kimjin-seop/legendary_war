#!/bin/sh
# [A3] 후처리+비교 시트(호출 없음). 실행(프로젝트 루트): sh docker/gemini/hero_v3_pp_a3.sh code1,code2
# 출력: docker/gemini/hero_v3_out_a3/{64,64_x2}, docker/gemini/hero_v3_preview_a3/{<code>_qa.png,compare/}
# 단일 정면 폴백은 pp 가 "이미 있으면 유지"하므로 a3 출력 폴더의 이전본만 지우고 다시 굽는다(public/assets 는 건드리지 않음)
export MSYS_NO_PATHCONV=1
for c in $(echo "$1" | tr ',' ' '); do
  for d in 64 64_x2; do rm -f "docker/gemini/hero_v3_out_a3/$d/hero_${c}_ally.png" "docker/gemini/hero_v3_out_a3/$d/hero_${c}_enemy.png"; done
done
docker run --rm -v sharpcache:/sp -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 sh -c "SHARP_DIR=/sp HERO_RAWD=docker/gemini/hero_v3_raw_a3 HERO_OUT=docker/gemini/hero_v3_out_a3 HERO_PV=docker/gemini/hero_v3_preview_a3 HERO_FACE=docker/gemini/hero_v3_facing_a3.json node docker/gemini/hero_dir_pp_a3.mjs $1 && SHARP_DIR=/sp node docker/gemini/hero_v3_compare.mjs docker/gemini/hero_v3_out_a3 docker/gemini/hero_v3_preview_a3/compare $1"
