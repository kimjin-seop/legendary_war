#!/bin/sh
# 영웅 전용 지휘관 스프라이트 파이프라인(호스트에서 실행, Docker 필요).
# 1) docker/gemini/sprite_prompts.json items 에 구조화 항목(code,name,rarity,unit_type,mounted,style_ref,portrait,headgear,body,cloak,weapon,symbol,colors,forbid) 추가(portrait 는 public/assets/raw/ 기준 상대경로, 없으면 생략 가능)
# 2) sh docker/gemini/hero_sprite.sh <code1>[,<code2>...]
#    → 생성(public/assets/raw/heroes/<code>.jpg, 호출 1회/영웅) → 후처리(sprites/64/hero_<code>_{ally,enemy}.png, 64_x2) → manifest 재생성
# 키는 .env 의 GEMINI_API_KEY 를 --env-file 로만 전달한다(출력·기록 없음).
set -e
CODES="$1"; [ -z "$CODES" ] && { echo "usage: sh docker/gemini/hero_sprite.sh code1,code2"; exit 1; }
N=$(echo "$CODES" | tr ',' '\n' | wc -l)
export MSYS_NO_PATHCONV=1
docker run --rm --env-file .env -e MAX_CALLS=$((N * 3)) -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 node docker/gemini/gen.mjs "heroes:$CODES"
docker run --rm -v "$(pwd -W 2>/dev/null || pwd):/app" -w /app node:22 sh -c "mkdir -p /tmp/pp && cd /tmp/pp && npm i sharp@0.33.5 --silent && cd /app && SHARP_DIR=/tmp/pp node docker/gemini/pp.mjs heroes && node docker/gemini/build_manifest.mjs"
echo "완료: public/assets/sprites/preview_64_heroes_x3.png 를 열어 QA 후 docker/gemini/qa.json 에 판정을 적고 build_manifest.mjs 를 다시 실행"
