#!/bin/sh
# 담당 B 생성 래퍼(호스트 bash). 사용: sh docker/gemini/gen_b.sh <category>[:ids]   (FORCE=1 재생성, MAX_CALLS 기본 30)
# 키는 --env-file .env 로만 컨테이너에 전달(호스트에서 읽거나 출력하지 않음). 결과 raw → public/assets/raw/<category>/
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"; export MSYS_NO_PATHCONV=1
W="$(pwd -W)"
docker run --rm --env-file .env -e MAX_CALLS=${MAX_CALLS:-30} -e ROUND=b_${ROUND:-1} -e FORCE=${FORCE:-0} ${RAW_DIR:+-e RAW_DIR=$RAW_DIR} -v "$W:/app" -w /app node:22 node docker/gemini/gen_b.mjs "$@" 2>&1 | tail -20
