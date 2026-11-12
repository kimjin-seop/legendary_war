#!/bin/sh
# 생성 래퍼(호스트). 사용(프로젝트 루트): sh docker/gemini/portrait_campaign_gen.sh portrait_<code>,... [--force] [--note=..] [--extra=..] [--dry]
# 키는 --env-file .env 로만 컨테이너에 전달(호스트에서 읽거나 출력하지 않음)
export MSYS_NO_PATHCONV=1
docker run --rm --env-file .env -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 node docker/gemini/portrait_campaign_gen.mjs "$@" 2>&1 | tail -40
