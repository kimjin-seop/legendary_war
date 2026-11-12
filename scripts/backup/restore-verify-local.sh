#!/usr/bin/env bash
# [초안 / 로컬 개발 전용] 백업 파일 복구 가능성 검증(원본 DB 는 건드리지 않는다).
# 사용: scripts/backup/restore-verify-local.sh docker/db-backup/dev-YYYYMMDD-HHMMSS.sqlite
# 검증: integrity_check, 핵심 테이블 행 수, 마이그레이션 수. 실제 복구(덮어쓰기)는 docs/BACKUP_PROCEDURE.md 의 수동 절차를 따른다.
set -euo pipefail
F="${1:?백업 파일 경로를 지정하세요}"
[ -f "$F" ] || { echo "파일 없음: $F" >&2; exit 1; }
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps --entrypoint "" app \
  php -r '$db=new PDO("sqlite:/var/www/html/'"$F"'"); $ic=$db->query("PRAGMA integrity_check")->fetchColumn(); echo "integrity_check=$ic\n"; foreach(["users","heroes","stages","maps","battles","wallets","wallet_transactions","migrations"] as $t){ try{ echo str_pad($t,22),$db->query("select count(*) from $t")->fetchColumn(),"\n"; }catch(Throwable $e){ echo str_pad($t,22),"(없음)\n"; } } exit($ic==="ok"?0:2);'
