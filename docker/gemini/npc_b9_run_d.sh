#!/bin/sh
# npc_b9 D2~D4 순차 생성(D1 종료 대기 후). 각 배치 20명, 예산 가드는 npc_b9_gen.mjs(STOP_AT 135)
export MSYS_NO_PATHCONV=1
G=docker/gemini/npc_b9
until grep -q "완료:" $G/gen_D1.out; do sleep 10; done
for i in 2 3 4; do
  L=$(node -e "const d=require('./$G/tiers.json').D;console.log(d.slice(($i-1)*20,$i*20).join(','))")
  docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/npc_b9_gen.mjs $L --note=batchD$i > $G/gen_D$i.out 2>&1
  rc=$?; echo "D$i rc=$rc"; [ $rc -ne 0 ] && break
done
