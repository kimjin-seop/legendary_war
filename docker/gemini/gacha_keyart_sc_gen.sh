#!/bin/sh
# 뽑기 화면 에셋 생성 래퍼. 사용: sh docker/gemini/gacha_gen.sh gacha[:ids]  (FORCE=1 재생성, SUFFIX=_2 후보 추가, MAX_CALLS 기본 30)
# 키는 --env-file .env 로만 컨테이너에 전달(호스트에서 읽거나 출력하지 않음).
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"; export MSYS_NO_PATHCONV=1
cd <repo>
W="$(pwd -W)"
docker run --rm --env-file .env -e MAX_CALLS=${MAX_CALLS:-17} -e FORCE=${FORCE:-0} -e SUFFIX=${SUFFIX:-} -e RULE_V=${RULE_V:-1} -e ROUND=${ROUND:-} -v "$W:/app" -w /app node:22 node docker/gemini/gacha_keyart_sc_gen.mjs "$@" 2>&1 | tail -30
