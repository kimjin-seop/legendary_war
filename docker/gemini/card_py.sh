#!/bin/sh
# 카드 UI(안아트 카드 담당) 파이썬 후처리 실행기(API 호출 없음). pip 공식 레지스트리 pillow 11.0.0(HPND)·numpy 2.1.3(BSD-3) 를 named volume(pylib_card)에 캐시.
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"; export MSYS_NO_PATHCONV=1
cd <repo>
W="$(pwd -W)"
docker run --rm -v pylib_card:/pylib -v "$W:/app" -w /app -e PYTHONPATH=/pylib python:3.12 sh -c "[ -f /pylib/.ok ] || (pip install -q --target /pylib pillow==11.0.0 numpy==2.1.3 >/dev/null 2>&1 && touch /pylib/.ok); $*"
