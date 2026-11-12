#!/bin/sh
# 담당 B 파이썬 후처리 실행기(API 호출 없음). pip 공식 레지스트리 pillow·numpy·scipy·opencv-python-headless 를 named volume(pylib_b)에 캐시.
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"; export MSYS_NO_PATHCONV=1
W="$(pwd -W)"
docker run --rm -v pylib_b:/pylib -v "$W:/app" -w /app -e PYTHONPATH=/pylib python:3.12 sh -c "[ -f /pylib/.ok ] || (pip install -q --target /pylib pillow==11.0.0 numpy==2.1.3 scipy==1.14.1 opencv-python-headless==4.10.0.84 >/dev/null 2>&1 && touch /pylib/.ok); $*"
