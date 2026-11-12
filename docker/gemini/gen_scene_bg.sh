#!/bin/sh
# 대사 장면 배경 생성 래퍼(호스트 bash). 사용: sh docker/gemini/gen_scene_bg.sh scene_bg[:id1,id2]   (FORCE=1 재생성, MAX_CALLS 기본 14)
# 키는 --env-file .env 로만 컨테이너에 전달(호스트에서 읽거나 출력하지 않음). 결과 raw → public/assets/raw/scene_bg/<id>.jpg
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"; export MSYS_NO_PATHCONV=1
W="$(pwd -W)"
docker run --rm --env-file .env -e MAX_CALLS=${MAX_CALLS:-14} -e ROUND=scene_bg_${ROUND:-1} -e FORCE=${FORCE:-0} -v "$W:/app" -w /app node:22 node docker/gemini/gen_scene_bg.mjs "$@" 2>&1 | tail -30
