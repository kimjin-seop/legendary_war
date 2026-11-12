#!/bin/sh
# 사용: sh docker/gemini/portrait_r1_run.sh gen "id,id" [attempt] [note] | post "id id"   (호스트 bash, docker 필요)
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"; export MSYS_NO_PATHCONV=1
W="$(pwd -W)"
case "$1" in
gen) docker run --rm --env-file .env -v "$W:/app" -w /app node:22 node docker/gemini/portrait_r1_generate.mjs ${PROMPTS:-docker/gemini/portrait_all_prompts.json} public/assets/portraits/_r1 "$2" "${3:-1}" "$4" 2>&1 | tail -15 ;;
post) docker run --rm -v "$W:/app" -w /app python:3.12 sh docker/gemini/portrait_alpha_batch.sh public/assets/portraits/_r1 public/assets/portraits/_r1/out $2 2>&1 | grep -v transparent ;;
esac
