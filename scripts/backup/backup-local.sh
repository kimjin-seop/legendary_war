#!/usr/bin/env bash
# [초안 / 로컬 개발 전용] 개발 SQLite 일관 스냅샷 백업. 서버 적용 금지(docs/BACKUP_PROCEDURE.md 참조).
# 사용: scripts/backup/backup-local.sh [백업 디렉터리(기본 docker/db-backup)] [보관 개수(기본 14)]
# 방식: SQLite VACUUM INTO (실행 중에도 일관된 스냅샷, WAL 포함). 컨테이너 안에서 dbdata 볼륨을 직접 읽는다.
set -euo pipefail
DEST_DIR="${1:-docker/db-backup}"
KEEP="${2:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="dev-${STAMP}.sqlite"
mkdir -p "$DEST_DIR"

# MSYS_NO_PATHCONV: Git Bash 경로 변환 방지. --entrypoint "": 자동 마이그레이션 실행 방지(백업 전에 DB 를 바꾸지 않는다).
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps --entrypoint "" app \
  php -r '$p="/var/www/dbdata/database.sqlite"; $d="/var/www/html/'"$DEST_DIR"'/'"$NAME"'"; if(!is_file($p)){fwrite(STDERR,"원본 DB 없음\n");exit(1);} if(is_file($d)){fwrite(STDERR,"대상 존재\n");exit(1);} $db=new PDO("sqlite:$p"); $db->exec("VACUUM INTO ".$db->quote($d)); $c=new PDO("sqlite:$d"); $r=$c->query("PRAGMA integrity_check")->fetchColumn(); echo "integrity_check=$r\n"; exit($r==="ok"?0:2);'

echo "백업 완료: $DEST_DIR/$NAME ($(du -h "$DEST_DIR/$NAME" | cut -f1))"
# 보관 개수 초과분 삭제(이 스크립트가 만든 dev-*.sqlite 만)
ls -1t "$DEST_DIR"/dev-*.sqlite 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f --
