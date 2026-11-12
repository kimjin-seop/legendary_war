#!/bin/sh
# 담당 A2 영웅 시트 v3 실행 래퍼(호스트 bash). 키는 --env-file .env 로만 전달(호스트에서 읽거나 출력하지 않음).
#  sh docker/gemini/hero_v3_a2.sh gen code1,code2 [--force] [--note=..] [--extra=..]
#  sh docker/gemini/hero_v3_a2.sh pp code1,code2      (후처리 → hero_v3_out_a2, 미리보기·비교 → hero_v3_preview_a2)
#  sh docker/gemini/hero_v3_a2.sh node <script> args  (sharp 사용 스크립트, 호출 없음)
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"; export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/../.." && W="$(pwd -W)"; CMD="$1"; shift
ENVS="-e SHARP_DIR=/sp/pp -e HERO_RAWD=docker/gemini/hero_v3_raw_a2 -e HERO_OUT=docker/gemini/hero_v3_out_a2 -e HERO_PV=docker/gemini/hero_v3_preview_a2 -e HERO_FACE=docker/gemini/hero_v3_facing_a2.json"
mkdir -p docker/gemini/hero_v3_out_a2/64 docker/gemini/hero_v3_out_a2/64_x2 docker/gemini/hero_v3_preview_a2/compare
case "$CMD" in
  gen) docker run --rm --env-file .env -v "$W:/app" -w /app node:22 node docker/gemini/hero_v3_gen_a2.mjs "$@" 2>&1 | tail -40 ;;
  pp) docker run --rm -v sharpcache:/sp/pp $ENVS -v "$W:/app" -w /app node:22 sh -c "node docker/gemini/hero_dir_pp_a2.mjs $1 && node docker/gemini/hero_v3_compare.mjs docker/gemini/hero_v3_out_a2 docker/gemini/hero_v3_preview_a2/compare $1" 2>&1 | tail -60 ;;
  node) docker run --rm -v sharpcache:/sp/pp $ENVS -v "$W:/app" -w /app node:22 node "$@" 2>&1 | tail -40 ;;
  *) echo "usage: gen|pp|node"; exit 1 ;;
esac
