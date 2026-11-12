#!/bin/sh
# 사용자 제공 BGM(lobby/battle) -> 루프 본체 + 프리/포스트롤 -> -17 LUFS 선형 게인 -> Opus/MP3 저용량 후보 -> 이음새·품질 수치 점검
# 실행: WORK=dir SCR=scriptdir sh final2.sh NAME a_samp b_samp xf_s pad_s curve "opus_kbps..." "mp3spec..."   (mp3spec = kbps:ch:rate)
set -e
N=$1; W=$WORK; O=$W/fin; mkdir -p $O
python -I $SCR/pad.py $N $2 $3 $4 $5 $6
I=$(ffmpeg -nostats -f f32le -ar 48000 -ac 2 -i $W/$N.f32 -af ebur128=framelog=quiet -f null - 2>&1 | awk '/^ +I:/{v=$2} END{print v}')
G=$(awk "BEGIN{printf \"%.3f\", -17 - ($I)}")
echo "$N loopI=$I gain=${G}dB"
ffmpeg -v error -y -f f32le -ar 48000 -ac 2 -i $W/${N}_pad.f32 -af "volume=${G}dB" -c:a pcm_f32le $W/${N}_padn.wav
P="-v error -y -i $W/${N}_padn.wav -map_metadata -1"
for b in $7; do ffmpeg $P -c:a libopus -b:a ${b}k -vbr on -compression_level 10 -application audio $O/${N}_opus${b}.opus; done
for s in $8; do k=${s%%:*}; r=${s#*:}; c=${r%%:*}; ar=${r#*:}
  ffmpeg $P -ac $c -ar $ar -c:a libmp3lame -b:a ${k}k $O/${N}_mp3_${k}_${c}ch_${ar}.mp3; done
for f in $O/${N}_*; do
  L=$(ffmpeg -nostats -i $f -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | awk '/^ +I:/{i=$2} /^ +Peak:/{p=$2} END{print i" "p}')
  echo "FILE $(basename $f) bytes=$(wc -c < $f) I_TP=$L kbps=$(ffprobe -v error -show_entries format=bit_rate -of csv=p=0 $f)"
done
echo "$G" > $W/${N}_gain.txt
