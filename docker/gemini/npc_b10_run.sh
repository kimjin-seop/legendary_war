#!/bin/sh
# npc_b10 순차 생성(호출): E1 → E2 → E3a/E3b(20명 단위). 예산 가드 = npc_b10_gen.mjs(b9+b10 누계 240). 배치 생성 직후 후처리+접촉 시트(10명씩)
export MSYS_NO_PATHCONV=1
G=docker/gemini/npc_b10
run() { # $1=배치명 $2=코드 목록
  docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/npc_b10_gen.mjs $2 --note=batch$1 > $G/gen_$1.out 2>&1; rc=$?; echo "$1 rc=$rc $(tail -1 $G/gen_$1.out)"
  L=$(node -e "console.log('$2'.split(',').filter(c=>require('fs').existsSync('$G/raw/'+c+'.jpg')).join(','))")
  sh docker/gemini/npc_b10_pp.sh $L $1all > $G/pp_$1.out 2>&1
  n=$(echo $L | tr ',' '\n' | wc -l); i=1; k=1
  while [ $i -le $n ]; do S=$(echo $L | cut -d, -f$i-$((i+9))); docker run --rm -v sharpcache:/sp -v "$(pwd -W):/app" -w /app node:22 sh -c "SHARP_DIR=/sp node docker/gemini/npc_b10_contact.mjs $S $1_$k" >> $G/pp_$1.out 2>&1; i=$((i+10)); k=$((k+1)); done
  return $rc
}
T=$G/tiers.json
run E1 $(node -e "console.log(require('./$T').E1.join(','))") || exit 1
run E2 $(node -e "console.log(require('./$T').E2.join(','))") || exit 1
run E3a $(node -e "console.log(require('./$T').E3.slice(0,21).join(','))") || exit 1
run E3b $(node -e "console.log(require('./$T').E3.slice(21).join(','))") || exit 1
echo ALLDONE
