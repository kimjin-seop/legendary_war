#!/bin/sh
# npc_b9 D 배치 후처리 대기 실행(호출 없음): gen_D<i>.out 완료 후 pp + 접촉 시트 2장(10명씩). 실행: sh docker/gemini/npc_b9_pp_batch.sh <i>
export MSYS_NO_PATHCONV=1
G=docker/gemini/npc_b9; i=$1
until [ -f $G/gen_D$i.out ] && grep -q "완료:\|중단" $G/gen_D$i.out; do sleep 10; done
tail -2 $G/gen_D$i.out
L=$(node -e "const d=require('./$G/tiers.json').D.slice(($i-1)*20,$i*20).filter(c=>require('fs').existsSync('$G/raw/'+c+'.jpg'));console.log(d.join(','))")
sh docker/gemini/npc_b9_pp.sh $L D${i}all 2>&1 | grep -v '^\[npc' | tail -2
A=$(echo $L | cut -d, -f1-10); B=$(echo $L | cut -d, -f11-20)
docker run --rm -v sharpcache:/sp -v "$(pwd -W):/app" -w /app node:22 sh -c "SHARP_DIR=/sp node docker/gemini/npc_b9_contact.mjs $A D${i}a && ( [ -z '$B' ] || SHARP_DIR=/sp node docker/gemini/npc_b9_contact.mjs $B D${i}b )"
