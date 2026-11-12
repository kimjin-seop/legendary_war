#!/bin/sh
# 주인공 전신 일러스트 크로마키 → 투명 PNG(alpha_process.py B) → 높이 1600 리사이즈 → 3배경 미리보기 + 마젠타 잔여 점검(전 초상화 포함). 호출 없음
# 실행: docker run --rm -v "$PWD":/app -w /app python:3.12 sh docker/gemini/protagonist_fullbody_alpha.sh
set -e
mkdir -p /pylib docker/gemini/protagonist_out/fullbody/preview
pip install -q --target /pylib pillow numpy scipy opencv-python-headless >/dev/null 2>&1
export PYTHONPATH=/pylib
for f in male_a male_b male_c female_a female_b female_c; do
  o=docker/gemini/protagonist_out/fullbody/fullbody_$f.png
  python docker/gemini/alpha_process.py B docker/gemini/protagonist_raw/fullbody_$f.jpg $o
  python -c "
from PIL import Image; import sys, os; p='$o'; im=Image.open(p).convert('RGBA'); w,h=im.size; im=im.resize((round(w*1600/h),1600),Image.LANCZOS); im.save(p,optimize=True,compress_level=9); print(p, im.size, os.path.getsize(p)//1024,'KB')"
  python docker/gemini/alpha_preview.py docker/gemini/protagonist_out/fullbody/preview/fullbody_$f.png $o
done
python docker/gemini/portrait_magenta_check.py docker/gemini/protagonist_out/portraits/*.png docker/gemini/protagonist_out/fullbody/*.png
