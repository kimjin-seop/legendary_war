#!/bin/sh
# [npc_ch25b 사본: npc_b11_pp.sh] 시트 후처리 + QA 접촉 시트(호출 없음, hero_dir_pp_v4.mjs 파이프라인, pal_mode unique, 적 시트 = 파랑 계열 적색 스왑).
# 실행(프로젝트 루트): sh docker/gemini/npc_ch25b_pp.sh code1,code2 [contact_name]
# 출력: docker/gemini/npc_ch25b/sprite_out/{64,64_x2}/hero_<code>_{ally,enemy}_sheet.png, sprite_preview/{<code>_qa.png,pp_report.json,contact_<name>.png,ship_<name>.png}. public/assets 는 건드리지 않음(반영은 npc_ch25b_publish.mjs)
export MSYS_NO_PATHCONV=1
G=docker/gemini/npc_ch25b
mkdir -p $G/sprite_out/64 $G/sprite_out/64_x2 $G/sprite_preview
docker run --rm -v sharpcache:/sp -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 sh -c "SHARP_DIR=/sp HERO_RAWD=$G/raw HERO_OUT=$G/sprite_out HERO_PV=$G/sprite_preview HERO_FACE=$G/facing.json node docker/gemini/hero_dir_pp_v4.mjs $1 && SHARP_DIR=/sp node docker/gemini/npc_ch25b_contact.mjs $1 ${2:-last}"
