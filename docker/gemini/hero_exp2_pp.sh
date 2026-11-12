#!/bin/sh
# [hero_exp2] 후처리+비교 시트(호출 없음, hero_v4_pp.sh 사본). 실행(프로젝트 루트): sh docker/gemini/hero_exp2_pp.sh code1,code2
# 출력: docker/gemini/hero_exp2/sprite_out/{64,64_x2}, docker/gemini/hero_exp2/sprite_preview/{<code>_qa.png,compare/,pp_report.json}. public/assets 는 건드리지 않음(반영은 hero_exp2_sprite_publish.mjs)
export MSYS_NO_PATHCONV=1
G=docker/gemini/hero_exp2
mkdir -p $G/sprite_out/64 $G/sprite_out/64_x2 $G/sprite_preview/compare
docker run --rm -v sharpcache:/sp -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 sh -c "SHARP_DIR=/sp HERO_RAWD=$G/sprite_raw HERO_OUT=$G/sprite_out HERO_PV=$G/sprite_preview HERO_FACE=$G/sprite_facing.json node docker/gemini/hero_dir_pp_v4.mjs $1 && SHARP_DIR=/sp node docker/gemini/hero_v3_compare.mjs $G/sprite_out $G/sprite_preview/compare $1"
