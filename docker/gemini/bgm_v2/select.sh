#!/bin/sh
# 최종 서비스 인코딩(약 300KB 목표). final2.sh 가 만든 ${N}_padn.wav(-17 LUFS 선형 게인, 프리/포스트롤 포함)에서 출발.
# 실행: WORK=dir sh select.sh NAME SLOT opus_kbps opus_ch opus_gain_db mp3_abr_kbps mp3_cutoff_hz mp3_gain_db
# 모노 인코딩은 다운믹스로 라우드니스가 내려가므로(측정 기준 스테레오 디코드) gain 으로 -17 LUFS 근처에 맞춘다. MP3 는 TP -1 dBTP 이하 유지.
set -e
N=$1; SLOT=$2; W=$WORK; O=$W/out; mkdir -p $O
IN="-v error -y -i $W/${N}_padn.wav -map_metadata -1"
ffmpeg $IN -af "volume=$5dB" -ac $4 -c:a libopus -b:a $3k -vbr on -compression_level 10 -application audio $O/$SLOT.opus
ffmpeg $IN -af "volume=$8dB" -ac 1 -ar 22050 -c:a libmp3lame -abr 1 -b:a $6k -cutoff $7 $O/$SLOT.mp3
for f in $O/$SLOT.opus $O/$SLOT.mp3; do
  L=$(ffmpeg -nostats -i $f -ac 2 -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | awk '/^ +I:/{i=$2} /^ +Peak:/{p=$2} END{print "I="i" TP="p}')
  echo "OUT $(basename $f) bytes=$(wc -c < $f) $L $(ffprobe -v error -show_entries stream=sample_rate,channels:format=duration,bit_rate -of csv=p=0 $f | tr '\n' ' ')"
done
