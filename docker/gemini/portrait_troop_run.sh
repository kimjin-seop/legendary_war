#!/bin/sh
# 일반 병종 기본 초상화 생성 래퍼(호스트 bash, docker 필요). 라운드 상한 ROUND_LIMIT(기본 10) - 이미 쓴 호출 = 이번 실행 MAX_CALLS.
# 사용: sh docker/gemini/portrait_troop_run.sh korea[,japan,...]   (FORCE=1 이면 기존 raw 덮어 재생성 — 재시도 시 기존 raw 는 먼저 _v1 로 보존할 것)
# 키는 --env-file .env 로만 컨테이너에 전달(호스트에서 읽거나 출력하지 않음).
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"; export MSYS_NO_PATHCONV=1
W="$(pwd -W)"
LIMIT=${ROUND_LIMIT:-10}
USED=$(node -e "const l=require('./docker/gemini/calls_log.json');console.log(l.calls.filter(c=>c.round==='portrait_troop').length)")
LEFT=$((LIMIT-USED)); WANT=${MAX_CALLS:-$LEFT}; [ "$WANT" -gt "$LEFT" ] && WANT=$LEFT
echo "portrait_troop 라운드 사용 ${USED}/${LIMIT}, 이번 실행 MAX_CALLS=${WANT}"
[ "$WANT" -le 0 ] && { echo "라운드 예산 소진, 중단"; exit 3; }
docker run --rm --env-file .env -e MAX_CALLS=$WANT -e ROUND=portrait_troop -e FORCE=${FORCE:-0} -v "$W:/app" -w /app node:22 node docker/gemini/gen.mjs "portrait_troop:$1" 2>&1 | tail -12
node docker/gemini/portrait_troop_usage.mjs
