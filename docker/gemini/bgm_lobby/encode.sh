#!/bin/sh
# 루프 float -> -17 LUFS 선형 게인(리미터 없음) -> 후보 인코딩 -> 디코드 재검증. 실행: sh /scripts/encode.sh NAME
set -e
N=$1; W=/work; O=$W/enc; mkdir -p $O
RAW="-f f32le -ar 48000 -ac 2 -i $W/$N.f32"
I=$(ffmpeg -nostats $RAW -af ebur128=framelog=quiet -f null - 2>&1 | awk '/^ +I:/{v=$2} END{print v}')
G=$(awk "BEGIN{printf \"%.3f\", -17 - ($I)}")
ffmpeg -v error -y $RAW -af "volume=${G}dB" -c:a pcm_f32le $W/${N}_n.wav
echo "$N srcI=$I gain=${G}dB"
P="-v error -y -i $W/${N}_n.wav -map_metadata -1"
for b in 32 40 48; do
  ffmpeg $P -c:a libopus -b:a ${b}k -vbr on -application audio $O/${N}_opus${b}.opus
  ffmpeg $P -c:a libopus -b:a ${b}k -vbr on -application audio -f webm $O/${N}_opus${b}.webm
done
ffmpeg $P -c:a libvorbis -b:a 64k $O/${N}_vorbis64.ogg
for b in 64 96; do ffmpeg $P -ar 44100 -c:a libmp3lame -b:a ${b}k $O/${N}_mp3_${b}.mp3; done
for f in $O/${N}_*; do
  sz=$(wc -c < $f)
  ffmpeg -v error -y -i $f -f f32le -ar 48000 -ac 2 $W/dec.f32
  L=$(ffmpeg -nostats -i $f -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | awk '/^ +I:/{i=$2} /^ +Peak:/{p=$2} END{print i" "p}')
  smp=$(( $(wc -c < $W/dec.f32) / 8 ))
  br=$(ffprobe -v error -show_entries format=bit_rate,duration -of csv=p=0 $f)
  echo "FILE $(basename $f) bytes=$sz samples48k=$smp I_TP=$L fmt=$br"
  python -I /scripts/build.py --check $W/dec.f32 $(basename $f) 0.65951
done
