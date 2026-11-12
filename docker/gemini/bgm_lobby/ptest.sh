#!/bin/sh
# 프리롤 길이(P)별 opus 40k 마커 이음새 비교. 실행: sh /scripts/ptest.sh NAME a b gain bitrate
N=$1; mkdir -p /work/pt
for pad in 0.2 0.24 0.25 0.26 0.3 0.4; do
  python -I /scripts/pad.py ${N}p $2 $3 1.0 $pad >/dev/null
  ffmpeg -v error -y -f f32le -ar 48000 -ac 2 -i /work/${N}p_pad.f32 -af "volume=$4dB" -c:a libopus -b:a $5k -vbr on -application audio /work/pt/${N}_$pad.opus
  printf "pad=$pad "; python -I /scripts/burst_pct.py /work/${N}p_pad.json /work/pt/${N}_$pad.opus
  python -I /scripts/check2.py /work/${N}p_pad.json $4 /work/pt/${N}_$pad.opus | python -c "import sys,json;d=json.loads(sys.stdin.read());print('   ',d['marker_loop'])"
done
