#!/bin/sh
# 주인공 방향 시트 후처리(호출 없음) = 영웅 v4 파이프라인(hero_dir_pp_v4.mjs) 재사용. 사용(프로젝트 루트): sh docker/gemini/protagonist_pp.sh sheet_male_a_base,sheet_male_a_sword
# 출력: docker/gemini/protagonist_out/sprites/{64,64_x2}/hero_<id>_{ally,enemy}_sheet.png (public 반영은 protagonist_publish.mjs), QA: docker/gemini/protagonist_preview/sprites/
export MSYS_NO_PATHCONV=1
mkdir -p docker/gemini/protagonist_out/sprites/64 docker/gemini/protagonist_out/sprites/64_x2
for c in $(echo "$1" | tr ',' ' '); do for d in 64 64_x2; do rm -f "docker/gemini/protagonist_out/sprites/$d/hero_${c}_ally_sheet.png" "docker/gemini/protagonist_out/sprites/$d/hero_${c}_enemy_sheet.png"; done; done
docker run --rm -v sharpcache:/sp -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 sh -c "SHARP_DIR=/sp HERO_RAWD=docker/gemini/protagonist_raw HERO_OUT=docker/gemini/protagonist_out/sprites HERO_PV=docker/gemini/protagonist_preview/sprites HERO_FACE=docker/gemini/protagonist_facing.json node docker/gemini/hero_dir_pp_v4.mjs $1 && SHARP_DIR=/sp node docker/gemini/protagonist_compare.mjs" 2>&1 | grep -v '^\[.*\] {' | tail -20
