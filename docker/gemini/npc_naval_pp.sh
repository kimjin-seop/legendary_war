#!/bin/sh
# 시트 후처리(호출 없음): hero_dir_pp_v4.mjs(영웅 v4 파이프라인 그대로)로 raw 3x3 → 192x256 ally/enemy 시트(+64_x2) + QA 미리보기.
# 실행(프로젝트 루트): sh docker/gemini/npc_naval_pp.sh code1,code2   출력: docker/gemini/npc_naval/out/{64,64_x2}/hero_<code>_{ally,enemy}_sheet.png, docker/gemini/npc_naval/preview/<code>_qa.png
export MSYS_NO_PATHCONV=1
mkdir -p docker/gemini/npc_naval/out/64 docker/gemini/npc_naval/out/64_x2 docker/gemini/npc_naval/preview
docker run --rm -v sharpcache:/sp -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 sh -c "SHARP_DIR=/sp HERO_RAWD=docker/gemini/npc_naval/raw HERO_OUT=docker/gemini/npc_naval/out HERO_PV=docker/gemini/npc_naval/preview HERO_FACE=docker/gemini/npc_naval/facing.json node docker/gemini/hero_dir_pp_v4.mjs $1"
