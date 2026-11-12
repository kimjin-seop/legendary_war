#!/bin/sh
# 마젠타 크로마키 원본(JPEG) → 투명 PNG(방법 B, alpha_process.py) → 900x1200 리사이즈 → 3배경 비교 미리보기.
# 실행: docker run --rm -v "$PWD":/app -w /app python:3.12 sh docker/gemini/portrait_alpha_batch.sh <raw폴더> <출력폴더> [id ...]
# 의존(pip 공식 레지스트리): pillow(HPND) numpy(BSD-3) scipy(BSD-3) opencv-python-headless(Apache-2.0)
set -e
RAWDIR="$1"; OUTDIR="$2"; shift 2
mkdir -p /pylib "$OUTDIR/preview"
pip install -q --target /pylib pillow numpy scipy opencv-python-headless >/dev/null 2>&1
export PYTHONPATH=/pylib
IDS="$*"; [ -z "$IDS" ] && IDS=$(ls "$RAWDIR" | grep '\.jpg$' | sed 's/\.jpg$//')
for id in $IDS; do
  # ALPHA_ARGS 로 임계값 조정(연회색·연보라 의상이 반투명해지면 ALPHA_ARGS="T_lo=40 T_hi=90"; hyujeong 에 적용함)
  python docker/gemini/alpha_process.py B "$RAWDIR/$id.jpg" "$OUTDIR/$id.png" $ALPHA_ARGS
  python - "$OUTDIR/$id.png" <<'EOF'
import sys
from PIL import Image
p = sys.argv[1]; im = Image.open(p).convert('RGBA')
w, h = im.size
if h > 1200:
    im = im.resize((round(w * 1200 / h), 1200), Image.LANCZOS)
im.save(p, optimize=True, compress_level=9)
import os; print(f"{p}: {im.size[0]}x{im.size[1]} {os.path.getsize(p)//1024}KB")
EOF
  python docker/gemini/alpha_preview.py "$OUTDIR/preview/$id.png" "$OUTDIR/$id.png"
done
