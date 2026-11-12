#!/bin/sh
# legend32 타일셋 생성 래퍼(호스트 bash, docker 필요). 작업 상한 ROUND_LIMIT(기본 5)·라운드 잔여(round3_usage.remaining) 중 작은 값까지만 호출.
# 사용: sh docker/gemini/legend_run.sh legend_tex[,legend_obj]   키는 --env-file .env 로만 전달(호스트에서 읽거나 출력하지 않음)
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"; export MSYS_NO_PATHCONV=1
W="$(pwd -W)"
LIMIT=${ROUND_LIMIT:-5}
USED=$(node -e "const l=require('./docker/gemini/calls_log.json');console.log(l.calls.filter(c=>c.round==='legend_tiles').length)")
GLEFT=$(node -e "const l=require('./docker/gemini/calls_log.json');console.log(l.round3_usage.remaining)")
LEFT=$((LIMIT-USED)); [ "$GLEFT" -lt "$LEFT" ] && LEFT=$GLEFT
WANT=${MAX_CALLS:-$LEFT}; [ "$WANT" -gt "$LEFT" ] && WANT=$LEFT
echo "legend_tiles 사용 ${USED}/${LIMIT}, 라운드 잔여 ${GLEFT}, 이번 실행 MAX_CALLS=${WANT}"
[ "$WANT" -le 0 ] && { echo "예산 소진, 중단"; exit 3; }
docker run --rm --env-file .env -e MAX_CALLS=$WANT -e ROUND=legend_tiles -e FORCE=${FORCE:-0} -v "$W:/app" -w /app node:22 node docker/gemini/gen.mjs "legend_tiles:$1" 2>&1 | tail -8
node docker/gemini/legend_usage.mjs
