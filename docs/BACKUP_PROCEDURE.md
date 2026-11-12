# DB 백업 절차 (#18) — 초안

상태: 문서·로컬 스크립트 초안. **서버(운영) 적용 금지.** 운영 DB 종류(SQLite 유지/MySQL 전환)가 확정되면 4장을 해당 방식으로 확정한다.

## 1. 원칙
- 백업 대상: DB(사용자·진행·지갑·전투 로그), `storage/app`(업로드가 생기면), `.env`(별도 비밀 저장소, 백업 파일에 평문 포함 금지).
- 일관성: 파일 복사(cp)가 아니라 DB 엔진의 스냅샷 기능을 쓴다. 쓰기 중 단순 복사는 깨진 파일을 만들 수 있다.
- 백업 전에 마이그레이션이 돌지 않게 한다(개발 컨테이너는 엔트리포인트가 자동 `migrate` 하므로 `--entrypoint ""` 를 쓴다).
- 모든 백업은 만든 직후 `integrity_check` 로 검증하고, 복구 리허설을 정기적으로 한다. 검증 안 된 백업은 백업이 아니다.
- 백업 파일에는 이메일·해시된 비밀번호·Sanctum 토큰 해시가 있다. 접근 권한을 제한하고 저장소(git)에 올리지 않는다(`docker/db-backup` 는 커밋 제외 대상).

## 2. 개발 환경(로컬, 이미 사용 가능)
- 생성: `bash scripts/backup/backup-local.sh [디렉터리=docker/db-backup] [보관개수=14]`
  - SQLite `VACUUM INTO` 로 스냅샷 -> `dev-YYYYMMDD-HHMMSS.sqlite`, 생성 직후 `integrity_check`, 오래된 것부터 보관 개수 초과분 삭제.
- 검증: `bash scripts/backup/restore-verify-local.sh <백업 파일>` (원본 무변경, 핵심 테이블 행 수 출력).
- 위험 작업(시드 `--update`, 맵 일괄 갱신, 마이그레이션) 전에는 항상 먼저 실행한다.
- 복구(개발): 컨테이너를 멈춘 뒤 백업 파일을 `/var/www/dbdata/database.sqlite` 로 덮어쓴다.
  `MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps --entrypoint "" app cp /var/www/html/docker/db-backup/<파일> /var/www/dbdata/database.sqlite`
  복구 후 `php artisan migrate:status` 로 백업 시점 이후 마이그레이션이 대기 상태인지 확인한다.

## 3. 주기·보관(운영 제안, 확정 필요)
| 항목 | 제안 |
|---|---|
| 정기 백업 | 하루 1회(KST 04:30, 일일 초기화 05:00 직전) + 점검·배포 직전 수동 1회 |
| 보관 | 일 14개 + 주 8개 + 월 6개(오래된 것부터 삭제) |
| 위치 | 앱 서버와 다른 디스크/호스트 1곳 이상(오프사이트 1곳 권장), 전송·저장 시 암호화 |
| 복구 리허설 | 월 1회 임시 환경에 복구 후 `restore-verify` 와 같은 점검 + 로그인·전투 1건 스모크 |
| 목표 | RPO 24시간(정기 백업 기준), RTO 1시간 이내(리허설로 실측해 갱신) |

## 4. 운영 방식(DB 확정 후 택1, 서버 적용은 별도 승인)
### 4-A. SQLite 운영
- 스냅샷: `sqlite3 <db> ".backup '<dest>'"` 또는 `VACUUM INTO '<dest>'`(로컬 스크립트와 동일). WAL 모드면 `-wal`/`-shm` 파일을 따로 복사하지 않는다(스냅샷이 포함).
- 정기 실행: cron 또는 Laravel 스케줄러 `Schedule::exec(...)->dailyAt('04:30')` (서버 도입은 승인 후).
- 점검 모드 연동: 복구·대형 작업 전 `PUT /api/admin/maintenance`(confirm) 로 점검을 켜 쓰기를 막은 뒤 백업/복구한다(docs/ANNOUNCE_MAINTENANCE_SPEC.md).
### 4-B. MySQL 전환 시
- 논리 백업 `mysqldump --single-transaction --routines --triggers`(InnoDB 무중단), 대용량이면 Percona XtraBackup. 바이너리 로그로 시점 복구(PITR) 구성.
- 주의: 현재 어드민 검색의 LIKE `escape '\'` 는 SQLite 기준이라 MySQL 전환 시 점검 필요.

## 5. 복구 절차(운영, 초안)
1. 점검 모드 ON(쓰기 차단) 및 공지.
2. 현재 DB 를 먼저 스냅샷해 `pre-restore-*` 로 보존(복구 실패 대비).
3. 대상 백업 `integrity_check` 후 교체/복원.
4. `migrate:status` 로 대기 마이그레이션 확인, 필요 시 `migrate --force`.
5. 스모크: 로그인, `/api/profile`, 전투 1건 생성, 지갑 잔액·거래 합계 일치 확인(`wallet_transactions` 합 = `wallets.balance`).
6. 점검 모드 OFF. 복구 사유·백업 시점·유실 구간을 기록한다.

## 6. 하지 않는 것
- 서버 cron/스케줄러 등록, 운영 DB 접근, 외부 저장소 연결은 이 초안에 포함하지 않는다(별도 승인).
- 자동 삭제는 스크립트가 만든 `dev-*.sqlite` 파일만 대상으로 한다.
