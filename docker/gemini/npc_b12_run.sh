#!/bin/sh
# npc_b12 시트 생성(호출) → 후처리 + 접촉 시트(호출 없음). 예산 가드 = npc_b12_gen.mjs(b9+b10+b11 누계 270). 실행(프로젝트 루트): sh docker/gemini/npc_b12_run.sh <codes> <tag> [extra]
export MSYS_NO_PATHCONV=1
G=docker/gemini/npc_b12
if [ -n "$3" ]; then docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/npc_b12_gen.mjs $1 --force --note=$2 "--extra=$3" > $G/gen_$2.out 2>&1
else docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/npc_b12_gen.mjs $1 --note=$2 > $G/gen_$2.out 2>&1; fi
echo "gen rc=$? $(tail -1 $G/gen_$2.out)"
sh docker/gemini/npc_b12_pp.sh $1 $2 > $G/pp_$2.out 2>&1; echo "pp rc=$?"
