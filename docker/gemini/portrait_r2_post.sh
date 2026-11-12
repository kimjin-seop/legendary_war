#!/bin/sh
# 컨테이너(python:3.12) 안에서: 알파 후처리 → 가장자리 정리 → 점검 → QA 패널. 사용: sh portrait_r2_post.sh <rawdir> <outdir> id...
# 주의(2026-11-01): 흰·연회색 의상(터번·숄·러프)은 기본 임계(T_hi=120)에서 회색 그늘이 반투명→defringe 로 검게 변함. ALPHA_ARGS="T_lo=40 T_hi=90" 로 실행하고 portrait_darkspot_check.py <src.jpg> <out.png> 로 확인. 닫힌 마젠타 주머니는 portrait_key_pocket.py
set -e
RAW="$1"; OUT="$2"; shift 2
mkdir -p /pylib "$OUT/qa"
pip install -q --target /pylib pillow numpy scipy opencv-python-headless >/dev/null 2>&1
export PYTHONPATH=/pylib
for id in "$@"; do
  python docker/gemini/alpha_process.py B "$RAW/$id.jpg" "$OUT/$id.png" $ALPHA_ARGS >/dev/null
  python -c "
from PIL import Image; p='$OUT/$id.png'; im=Image.open(p).convert('RGBA'); w,h=im.size
im=im.resize((round(w*1200/h),1200),Image.LANCZOS) if h>1200 else im; im.save(p,optimize=True,compress_level=9)"
  python docker/gemini/portrait_edge_fix.py "$OUT/$id.png" "$OUT/$id.png"
  python docker/gemini/portrait_edge_check.py "$OUT/$id.png"
  python docker/gemini/portrait_qa_panel.py "$OUT/$id.png" "$OUT/qa/$id.png"
done
