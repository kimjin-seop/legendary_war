#!/bin/sh
# BGM 루프 이음새 처리(끝 2초와 앞 2초를 등전력 크로스페이드로 합쳐 끝->처음이 연속) + 128kbps MP3 재인코딩 + 길이/피크 점검.
# 실행: docker run --rm -v "$PWD":/app -w /app node:22 sh docker/gemini/bgm_postprocess.sh   (컨테이너에서 apt로 ffmpeg 설치)
set -e
apt-get update -qq >/dev/null && apt-get install -y -qq ffmpeg >/dev/null
N=2
IN=public/assets/audio/_raw; OUT=public/assets/audio/bgm; mkdir -p "$OUT"
for f in "$IN"/*.mp3; do
  id=$(basename "$f" .mp3)
  L=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  S=$(awk "BEGIN{print $L-$N}")
  ffmpeg -v error -y -i "$f" -filter_complex "\
[0]atrim=0:$N,asetpts=PTS-STARTPTS,afade=t=in:d=$N:curve=qsin[h];\
[0]atrim=$S:$L,asetpts=PTS-STARTPTS,afade=t=out:d=$N:curve=qsin[t];\
[h][t]amix=inputs=2:normalize=0:duration=longest[x];\
[0]atrim=$N:$S,asetpts=PTS-STARTPTS[b];\
[x][b]concat=n=2:v=0:a=1[o]" -map "[o]" -ac 2 -ar 44100 -c:a libmp3lame -b:a 128k "$OUT/$id.mp3"
  D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$id.mp3")
  SZ=$(wc -c < "$OUT/$id.mp3")
  PK=$(ffmpeg -v info -i "$OUT/$id.mp3" -af volumedetect -f null - 2>&1 | grep -E "max_volume|mean_volume" | tr -s ' ' | tr '\n' ' ')
  echo "$id 원본길이=${L}s -> 루프길이=${D}s 크기=${SZ}B $PK"
done
