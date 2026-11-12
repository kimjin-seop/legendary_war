#!/bin/sh
# 삼국 스프라이트 후처리(호출 없음): hero_dir_pp_v4.mjs(도트 샘플·32색·알파 0/255·적 팀색 스왑·발밑 받침) → sprite_out/{64,64_x2} + QA 접촉 시트(ally/enemy x2).
# 실행(프로젝트 루트, 호스트): sh docker/gemini/samguk_recraft/sprite_pp.sh code1,code2 <contact_name>
export MSYS_NO_PATHCONV=1
W=docker/gemini/samguk_recraft
mkdir -p $W/sprite_out/64 $W/sprite_out/64_x2 $W/sprite_preview $W/qa
docker run --rm -v sharpcache:/sp -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 sh -c "SHARP_DIR=/sp HERO_RAWD=$W/raw_sprite HERO_OUT=$W/sprite_out HERO_PV=$W/sprite_preview HERO_FACE=$W/facing.json node docker/gemini/hero_dir_pp_v4.mjs $1" | tail -n 8
L=""; for c in $(echo $1 | tr ',' ' '); do L="$L $W/sprite_out/64_x2/hero_${c}_ally_sheet.png $W/sprite_out/64_x2/hero_${c}_enemy_sheet.png"; done
docker run --rm -v samguk_pylib:/pylib -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app -e PYTHONPATH=/pylib python:3.12 python $W/contact.py $W/qa/s_$2.jpg 512 $L
