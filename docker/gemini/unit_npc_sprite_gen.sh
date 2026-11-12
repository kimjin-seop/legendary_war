#!/bin/sh
# NPC 전용 전투 스프라이트 생성 래퍼(호스트). 사용(프로젝트 루트): sh docker/gemini/unit_npc_sprite_gen.sh code1,code2 [--force] [--note=..] [--extra=..] [--dry]
# 키는 --env-file .env 로만 컨테이너에 전달(호스트에서 읽거나 출력하지 않음)
export MSYS_NO_PATHCONV=1
docker run --rm --env-file .env -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 node docker/gemini/unit_npc_sprite_gen.mjs "$@" 2>&1 | tail -40
