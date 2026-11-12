#!/bin/sh
# 육상 타일(land_set) 파이썬 실행기(API 호출 없음). pylib_b 볼륨(pillow 11.0.0·numpy 2.1.3, PyPI) 재사용. 스크래치 출력은 /sp 로 마운트.
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"; export MSYS_NO_PATHCONV=1
W="$(pwd -W)"
SP="${LAND_SP:-$W}"
docker run --rm -v pylib_b:/pylib -v "$W:/app" -v "$SP:/sp" -w /app -e PYTHONPATH=/pylib python:3.12 sh -c "$*"
