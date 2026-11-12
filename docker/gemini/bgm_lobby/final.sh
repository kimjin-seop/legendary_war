#!/bin/sh
# 실행: sh /scripts/final.sh NAME a b   (xf 1.0s, pad 0.25s, -17 LUFS)
set -e
N=$1; W=/work; O=$W/fin; mkdir -p $O
python -I /scripts/pad.py $N $2 $3 1.0 0.25
I=$(ffmpeg -nostats -f f32le -ar 48000 -ac 2 -i $W/$N.f32 -af ebur128=framelog=quiet -f null - 2>&1 | awk '/^ +I:/{v=$2} END{print v}')
G=$(awk "BEGIN{printf \"%.3f\", -17 - ($I)}")
echo "$N loopI=$I gain=${G}dB"
ffmpeg -v error -y -f f32le -ar 48000 -ac 2 -i $W/${N}_pad.f32 -af "volume=${G}dB" -c:a pcm_f32le $W/${N}_padn.wav
P="-v error -y -i $W/${N}_padn.wav -map_metadata -1"
for b in 32 40 48; do
  ffmpeg $P -c:a libopus -b:a ${b}k -vbr on -application audio $O/${N}_opus${b}.opus
  ffmpeg $P -c:a libopus -b:a ${b}k -vbr on -application audio -f webm $O/${N}_opus${b}.webm
done
ffmpeg $P -c:a libvorbis -b:a 64k $O/${N}_vorbis64.ogg
for b in 64 96; do ffmpeg $P -ar 44100 -c:a libmp3lame -b:a ${b}k $O/${N}_mp3_${b}.mp3; done
for f in $O/${N}_*; do
  L=$(ffmpeg -nostats -i $f -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | awk '/^ +I:/{i=$2} /^ +Peak:/{p=$2} END{print i" "p}')
  echo "FILE $(basename $f) bytes=$(wc -c < $f) I_TP=$L kbps=$(ffprobe -v error -show_entries format=bit_rate -of csv=p=0 $f)"
done
python -I /scripts/check2.py $W/${N}_pad.json $G $O/${N}_*
