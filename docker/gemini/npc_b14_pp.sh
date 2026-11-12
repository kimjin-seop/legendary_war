#!/bin/sh
# [npc_b14 사본: npc_b11_pp.sh] 시트 후처리 + QA 접촉 시트(호출 없음, hero_dir_pp_v4.mjs 파이프라인: 32색·1px 외곽선·알파 0/255·적 파랑→빨강 스왑·발밑 팀색 받침·우측=좌측 미러)
# 실행(프로젝트 루트): sh docker/gemini/npc_b14_pp.sh code1,code2 [contact_name]
export MSYS_NO_PATHCONV=1
G=docker/gemini/npc_b14
mkdir -p $G/sprite_out/64 $G/sprite_out/64_x2 $G/sprite_preview
docker run --rm -v sharpcache:/sp -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 sh -c "SHARP_DIR=/sp HERO_RAWD=$G/raw HERO_OUT=$G/sprite_out HERO_PV=$G/sprite_preview HERO_FACE=$G/facing.json node docker/gemini/hero_dir_pp_v4.mjs $1 && SHARP_DIR=/sp node docker/gemini/npc_b14_contact.mjs $1 ${2:-last}"
