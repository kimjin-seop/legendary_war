# 배포 세팅 가이드

작성 기준일: 2026-11-14. 이 문서는 저장소 코드(`composer.json`, `Dockerfile`, `docker-compose.yml`, `docker/entrypoint.sh`, `.env.example`, `config/game.php`, `routes/console.php`, `docs/BACKUP_PROCEDURE.md`, `docs/SEASON_WAR_OPS.md`)를 읽고 정리했다. 운영 서버에서 실제로 검증한 절차가 아니다. 근거를 확인하지 못한 항목은 **확인 필요**로 표시한다.

> 현재 저장소에는 운영용 배포 설정(운영 Dockerfile, nginx 설정, systemd/supervisor 파일, CI)이 없다. `docker-compose.yml` 은 개발용(`APP_ENV=local`, `APP_DEBUG=true`)이다. 아래 운영 절차는 코드가 요구하는 조건을 기준으로 한 권장안이다.

## 1. 사전 준비

| 항목 | 요구 | 근거 |
|---|---|---|
| PHP | 8.3 이상 | `composer.json` `"php": "^8.3"`, Dockerfile `php:8.3-cli` |
| PHP 확장 | pdo_sqlite, zip, mbstring, bcmath, intl, pcntl (MySQL 사용 시 pdo_mysql 추가) | Dockerfile `docker-php-ext-install` |
| Composer | 2.x | Dockerfile (`composer:2`) |
| Laravel | 13.x | `composer.json` `laravel/framework ^13.17` |
| Node.js | 22 (FE 빌드용. 빌드는 운영 서버가 아니라 빌드 머신에서 해도 됨) | `docker-compose.yml` vite 서비스 `node:22-alpine`. 운영 최소 버전은 확인 필요 |
| FE 빌드 도구 | vite 8, laravel-vite-plugin, vue, tailwind, phaser 4.2.1 | `package.json` |
| DB | 현재 개발은 SQLite. 운영 DB 종류(SQLite 유지 / MySQL 전환)는 **확인 필요(미확정)** | `docs/BACKUP_PROCEDURE.md` 상단, `.env.example` `DB_CONNECTION=sqlite` |
| 도커 | 선택. 개발 환경은 `docker compose` 로 구동 | `docker-compose.yml` |

주의
- SQLite 로 운영하면 쓰기 락 경합이 있으므로 단일 서버 전제다. 세션·캐시는 `file` 드라이버(`.env.example` 주석). 다중 서버면 redis 등으로 교체해야 하고, `war:tick` 락(`Cache::lock`)도 파일 캐시 기준이라 공유 캐시로 바꿔야 한다(`docs/SEASON_WAR_OPS.md`).
- MySQL 전환 시 어드민 검색 LIKE `escape '\'` 가 SQLite 기준이라 점검이 필요하다(`docs/BACKUP_PROCEDURE.md` 4-B). 전환 자체의 검증 여부는 **확인 필요**.
- `docker/entrypoint.sh` 는 컨테이너 시작 때마다 `.env` 의 `DB_CONNECTION` 을 sqlite 로 고치고 `DB_HOST/PORT/USERNAME/PASSWORD/DATABASE` 줄을 삭제하며 **`php artisan migrate --force` 를 자동 실행**한다. 이 엔트리포인트를 운영에 그대로 쓰면 컨테이너 재기동만으로 마이그레이션이 적용되고 MySQL 설정은 지워진다. 운영에서는 이 엔트리포인트를 쓰지 않거나(`--entrypoint ""`), 별도 운영 엔트리포인트를 만들 것.

## 2. .env 필수 항목 (키 이름과 의미만. 값은 환경별로 별도 관리)

`.env.example` 기준. `.env` 는 `.gitignore` 대상이며 저장소에 올리지 않는다.

앱 기본
- `APP_ENV` — 운영은 `production`(`.env.example` 기본값). `production` 에서는 `game:grant-pen-switch` 같은 개발용 커맨드가 실행을 거부한다.
- `APP_DEBUG` — 운영은 `false`.
- `APP_KEY` — 암호화 키. `php artisan key:generate` 로 생성하며 한 번 정해진 뒤 바꾸지 않는다(변경 시 기존 세션·암호화 값 무효).
- `APP_URL` — 서비스 공개 URL.
- `APP_LOCALE`, `APP_FALLBACK_LOCALE`, `APP_FAKER_LOCALE` — `.env.example` 기본은 `en`. 게임 UI 는 FE 문구를 쓰므로 영향 범위는 **확인 필요**.
- 타임존: `config/app.php` 는 `'timezone' => 'UTC'` 로 고정(env 없음). 일일 초기화는 코드가 KST 05:00 기준으로 계산한다(`config/game.php` 주석).

DB
- `DB_CONNECTION` — `sqlite` 또는 `mysql` 등.
- SQLite: `DB_DATABASE`(미지정 시 `database/database.sqlite`, 개발 컨테이너는 `/var/www/dbdata/database.sqlite` 가 있으면 그것을 사용 — `config/database.php`). 파일과 부모 디렉터리에 웹서버 쓰기 권한 필요.
- MySQL: `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`.

세션·캐시·큐
- `SESSION_DRIVER`(file), `SESSION_LIFETIME`, `SESSION_ENCRYPT`, `SESSION_PATH`, `SESSION_DOMAIN`
- `CACHE_STORE`(file)
- `QUEUE_CONNECTION`(`.env.example` 기본 `database`). 이 코드베이스에서 큐 작업(Job)을 쓰는지는 **확인 필요**(`app/Jobs` 확인 안 함). 쓰지 않으면 워커는 불필요.

로그·프록시·인증
- `LOG_CHANNEL`, `LOG_STACK`(daily), `LOG_LEVEL`(warning)
- `TRUSTED_PROXIES` — 신뢰할 프록시(쉼표 구분 IP/CIDR 또는 `*`). 비우면 신뢰 안 함. 리버스 프록시/로드밸런서 뒤에 두면 반드시 설정(HTTPS 판별·클라이언트 IP 에 영향). 배포 토폴로지 확정 후 설정.
- `SANCTUM_STATEFUL_DOMAINS` — 쿠키 인증 SPA 도메인(`host:port`).
- `MAIL_*`, `AWS_*`, `REDIS_*`, `BROADCAST_CONNECTION` — `.env.example` 기본값 그대로(메일은 `log`). 사용 여부는 **확인 필요**.

게임 기능 스위치 (`config/game.php`; `.env.example` 에는 없음, 필요할 때만 추가)
- `GAME_SEASON_WAR_ENABLED` — 시즌 전쟁 쓰기 경로(가입·공격) 스위치. **기본 false**(`env('GAME_SEASON_WAR_ENABLED', false)`). false 면 join/attack 이 403 `season_war_disabled`. 읽기·진행 중 데이터·`war:tick` 정산은 영향 없음. 오픈 전까지 false 유지.
- 랭크전: `game.rank.enabled` 는 **env 로 제어되지 않고 `config/game.php` 에 `false` 로 하드코딩**되어 있다. 기본 비활성이며 비활성 시 `/api/rank/*` 가 404 `rank_disabled`, 정산 훅도 동작하지 않는다. 오픈하려면 설정 파일 수정이 필요(열기 전 병종 v2·밸런스 확인 필요 — 설정 주석).
- `GAME_GACHA_CURRENCY` — `gold` | `pen`, 기본 `pen`(잘못된 값이면 `gold`). 가챠 결제 통화. 펜 결제는 이번 마이그레이션 `pay_currency` 컬럼이 있어야 동작한다(3장 참고).
- `GAME_PEN_ENABLED`(기본 true), `GAME_PEN_DAILY_CAP`(15), `GAME_PEN_DAILY_QUEST`, `GAME_PEN_PVE_FIRST_CLEAR`, `GAME_PEN_PVE_FIRST_CLEAR_AMOUNT` — 재화 펜.
- `GAME_STAR_ENABLED`(기본 true), `GAME_STAR_APPLY_PVP`(기본 false) — 영웅 별 강화. 테이블 `hero_star_ups` 가 없으면 404 `star_disabled`.
- `GAME_SWEEP_ENABLED`(기본 true) — 소탕.
- `GAME_MICRO_MODE` — `off|shadow|on`, 코드 기본 `off`. 개발 compose 는 `on` 으로 켜 둠. 운영 값은 **확인 필요**(결정 사항). 새 전투 생성 시에만 반영.
- `GAME_MP_SKILLS`(기본 true), `GAME_GUNNER_RULES`(true), `GAME_ALLY_PASSTHROUGH_COST`(2), `GAME_COMPANIONS`(true), `GAME_ENCOUNTER_DEX`(true), `GAME_GACHA_REQUIRED_PITY`(30), `GAME_GACHA_REQUIRED_BOOST`(5), `GAME_GACHA_REQUIRED_LIBRARY`(false), 그 외 `GAME_*` 는 `config/game.php` 참고. 새 전투 생성 시 고정되는 값이 많아 바꿔도 진행 중 전투에는 적용되지 않는다.
- 개발 compose 전용: `DEV_SQLITE_PATH`, `PHP_CLI_SERVER_WORKERS` — 운영에는 해당 없음(운영 웹서버는 php-fpm 등 별도 구성).

`.env` 를 바꾼 뒤 `config:cache` 를 쓰고 있다면 `php artisan config:clear && php artisan config:cache` 로 갱신한다. `php artisan serve` 는 `.env` 변경 시 자동 재시작하지 않는다(docker-compose 주석).

## 3. 설치 순서

### 3.1 코드·의존성
```
git pull / 코드 배포
composer install --no-dev --optimize-autoloader --no-interaction
cp .env.example .env        # 최초 1회, 이후 값 채우기
php artisan key:generate    # 최초 1회(APP_KEY 비어 있을 때만)
```
- `storage`, `bootstrap/cache`(SQLite 면 DB 파일 경로 포함)에 웹서버 사용자 쓰기 권한.
- `php artisan storage:link` 필요 여부는 **확인 필요**(`/public/storage` 가 .gitignore 에 있음. 업로드 사용 여부 미확인).
- `config:cache` / `route:cache` 사용 가능 여부는 **확인 필요**(캐시 적용 후 스모크로 검증할 것).

### 3.2 마이그레이션 (운영 적용 전 백업 필수)
이번 배포에서 새로 추가된 마이그레이션 3개(전부 가산 전용, `hasTable/hasColumn` 가드로 재실행 안전):

| 파일 | 내용 | down |
|---|---|---|
| `2026_11_14_000100_add_pay_currency_to_gacha_pulls.php` | `gacha_pulls` 에 `pay_currency`(string 8, 기본 gold), `pen_spent`(uint, 기본 0) 추가. 컬럼이 없으면 펜 결제가 503 `gacha_pen_unavailable` | 두 컬럼 drop |
| `2026_11_14_000200_create_hero_star_ups.php` | 영웅 별 강화 멱등·감사 로그 테이블 신규. `unique(user_id, request_id)`. 없으면 404 `star_disabled` | 테이블 drop |
| `2026_11_14_000300_create_user_lineups.php` | 편성 라인업(최대 5명) 테이블 신규(`unique(user_id, slot)`, `unique(user_id, user_hero_id)`) | 테이블 drop |

적용 절차
1. 점검 모드 ON(관리자 `PUT /api/admin/maintenance`, confirm `MAINTENANCE`; `docs/ANNOUNCE_MAINTENANCE_SPEC.md`). 쓰기를 막고 공지한다.
2. DB 백업. SQLite 는 파일 복사가 아니라 스냅샷(`VACUUM INTO` 또는 `sqlite3 <db> ".backup '<dest>'"`)을 쓰고 직후 `PRAGMA integrity_check`. 개발용 스크립트: `bash scripts/backup/backup-local.sh`, 검증 `scripts/backup/restore-verify-local.sh`(`docs/BACKUP_PROCEDURE.md`). MySQL 이면 `mysqldump --single-transaction`. 운영 백업 방식 확정은 **확인 필요**.
3. `php artisan migrate:status` 로 대기 목록이 위 3개(및 의도한 것만)인지 확인.
4. `php artisan migrate --force`.
5. 컨테이너 엔트리포인트가 자동 `migrate` 하므로(1장), 컨테이너 운영 시 3번 확인 전에 재기동하지 않는다.

롤백
- 개별: `php artisan migrate:rollback --step=3 --force`(위 3개가 최신 배치일 때. `migrate:status` 의 batch 로 먼저 확인). `down()` 은 컬럼/테이블을 삭제하므로 **이미 쌓인 펜 결제 이력·별 강화 로그·라인업 데이터가 사라진다**.
- 안전한 롤백은 2번의 스냅샷으로 복원: 점검 ON → 현재 DB 를 `pre-restore-*` 로 따로 보존 → 백업 `integrity_check` 후 교체 → `migrate:status` 확인 → 스모크 → 점검 OFF(`docs/BACKUP_PROCEDURE.md` 5장).
- 가산 전용이라 코드만 이전 버전으로 되돌리고 스키마는 둔 채 운영해도 구 코드는 새 컬럼·테이블을 쓰지 않는다(구 코드의 `gacha_pulls` insert 가 새 컬럼의 기본값으로 동작하는지는 **확인 필요**).

### 3.3 게임 데이터(시드) 적재
게임 설정·맵·스테이지·영웅은 DB 테이블이며 `database/data/*.json` 을 artisan 커맨드로 적재한다. `DatabaseSeeder` 는 테스트 유저 1명만 만들 뿐 게임 시드를 호출하지 않는다. 대사·배너·칭호·챕터 문구는 별도 테이블이 아니라 `database/data/*.json` 을 런타임에 읽으므로 배포 코드에 해당 JSON 이 모두 있어야 한다.

**검증 결과(2026-11-14, 임시 SQLite 리허설)**: 아래 시드만으로는 개발 DB 와 동등해지지 않는다. 개발 DB 에만 있고 시드 원본(JSON)이 없는 스킬이 47개(`rd_*` 28, `w3_*` 18, `divine_banner`) 있어 `game:seed-hero-wave3` 가 롤백되고 그 영향으로 영웅·스테이지 일부가 빠진다. 또한 `seed-active-skills`·`seed-skill-grades`·`seed-hero-wave3`·`troop-v2-apply`·`apply-grade-gap`·`npc-promote` 는 `APP_ENV=production` 이면 코드가 실행을 거부한다. 따라서 운영 최초 적재는 개발 DB 의 콘텐츠 테이블 읽기 전용 덤프 이관을 권장한다(결정 대기). 리허설에서 통과한 시드 순서(참고): `migrate --force` → `game:seed` → `game:seed-protagonist` → `game:seed-maps-pack --path=` (maps_pack20, maps_pack20_v2, maps_scaleup_pilot/ch1/swap/late 순) → `game:seed-ch1` → `game:seed-imjin10 --with-npc`(NPC 182·im_* 맵·ch1_s1~10 의 유일한 출처이나 개발 전용 도구) → `game:troop-v2-apply` → `game:seed-ch18` → `game:seed-main --act=1..4 --with-npc` → `game:seed-active-skills` → `game:seed-skill-grades` → `game:seed-shelf --chapters=N --with-npc --with-ext`(챕터 11,13~17,19~26,999 는 개별 실행 통과, 12 는 wave3 영웅 zhang_fei 필요로 실패).

커맨드 성격 (각 커맨드 `$signature`/docblock 기준)

| 커맨드 | 성격 | 운영 사용 |
|---|---|---|
| `game:seed` | 설정 JSON 멱등 적재. 기본은 **없는 행만 추가**(어드민 수정값 보존) | 필요(최초 적재). 먼저 `--force` 없이 |
| `game:seed --force` | 기존 행을 JSON 값으로 **덮어씀**(어드민 수정값 소실) | 금지에 준함. 백업 후 의도적일 때만 |
| `game:seed-main --act=N`, `game:seed-shelf`, `game:seed-protagonist`, `game:seed-active-skills`, `game:seed-titles`, `game:seed-maps-pack` | 가산·멱등 적재(`--dry-run` 지원). `--update`/`--overwrite` 는 기존 행 갱신 | 필요 항목만. 반드시 `--dry-run` 먼저, `--update`/`--overwrite` 는 신중히. 필요 목록은 확인 필요 |
| `game:seed-hero-wave3` | 3차 영웅 확장. 기본 dry-run, `--apply` 시 자동 백업 | 확인 필요(운영 반영 여부 결정) |
| `game:apply-grade-gap` | 등급 격차: heroes/hero_levels/user_level_costs 동기화. 기본 dry-run, `--apply` 로 쓰기 | 이번 변경(heroes.json·hero_levels.json·user_level_costs.json 수정)을 운영에 반영하려면 필요. 백업 후 dry-run 결과 확인 → `--apply`. 정확한 적용 대상은 **확인 필요** |
| `game:apply-map-patch --path=… ` | 맵 패치. 기본 dry-run, `--apply` 시 백업 후 쓰기 | 신규 파일 `map_patch_castle_gates_20261114.json` 반영 시. 운영 반영 여부 확인 필요 |
| `war:seed {scenario}` | 시즌 전쟁 활성 시즌 생성(멱등). `GAME_SEASON_WAR_ENABLED=false` 인 동안 필요 없음 | 시즌 전쟁 오픈 때 |
| `game:make-admin {email}` | 관리자 계정 생성·승격 | 필요(최초 관리자) |
| `game:seed-imjin10` | 임진왜란 10맵 적재 + ch1 스테이지 재배정. docblock 에 **"운영 DB 사용 금지(개발 DB 전용 도구)"** 명시. `--force` 는 보상·이름 등 전체 필드 덮어씀 | **운영에서 실행 금지.** 기본 실행(옵션 없음)도 ch1_s1~s7 의 맵·목표·편성을 재배정하므로 주의. 개발 DB 에서 `--dry-run` 으로만 확인 |
| `game:grant-pen-switch` | 계정 일괄 펜 지급. dry-run 기본, `APP_ENV=production` 이면 실행 거부 | 운영 실행 금지(코드가 차단) |
| `game:qa-account` | QA 게스트 계정. `local/testing` 한정 | 운영 금지(코드가 차단) |
| `game:clone-map`, `game:replace-heroes`, `game:hero-generate`, `game:simulate` 등 | 개발·분석 도구 | 운영 사용 안 함. 필요 시 각 커맨드 확인 |

공통 원칙: 모든 시드는 먼저 `--dry-run`(없으면 기본 dry-run 인 커맨드의 출력)으로 변경 계획을 보고, DB 백업 후 적용한다. 개발 DB 에서 먼저 같은 순서로 리허설한다.

### 3.4 프런트엔드 빌드
```
npm ci
npm run build          # vite build -> public/build (manifest.json, assets/)
```
- 엔트리: `resources/css/app.css`, `resources/js/app.js`(`vite.config.js`). 뷰는 `@vite([...])` 로 `public/build` 를 읽는다(`resources/views/welcome.blade.php`).
- `public/build` 는 `.gitignore` 대상이다. 서버에서 빌드하거나, 빌드 산출물을 별도로 업로드해야 한다. 어느 쪽인지는 **확인 필요**.
- **캐시 버스팅(ASSET_VERSION)**: 게임 에셋 URL 에 `?v=` 가 붙는다. 값은 `resources/js/game/assetVersion.js` 의 `ASSET_VERSION` 상수(현재 `20261114-a30`)이며 `assets.js` 가 매니페스트 항목 URL 전부에 붙인다. 이미지·JSON 등 `public/assets/**` 를 바꿨다면 **빌드 전에 이 값을 올려야** 브라우저 캐시가 갱신된다(env 가 아니라 소스 수정). 이번 배포에서 올렸는지는 팀 규칙대로 확인.
- 빌드 교체 방식(개발 중 관행): 새 빌드 전 기존 `public/build` 를 `public/build-prev-*` 로 보관해 롤백에 사용한다. 이 폴더들은 `.gitignore`(`/public/build-prev-*`)로 저장소에서 제외되며 운영에 올릴 필요 없다. 운영에서도 같은 방식으로 `public/build` 를 통째로 교체하고 이전 폴더를 보관하면 롤백이 쉽다(권장).
- 빌드 후 `public/build/manifest.json` 존재와 해시 파일이 모두 업로드됐는지 확인(일부 누락 시 화면 공백).

### 3.5 스케줄러·큐 등록
`routes/console.php` 에 등록된 스케줄:
- `war:tick` — 매시간, `withoutOverlapping`. 시즌 종료 처리·정체 감소·AI 행동(`docs/SEASON_WAR_OPS.md`). 시즌 전쟁을 오픈하기 전까지 데이터가 없으면 사실상 no-op 이지만 **정확한 no-op 여부는 확인 필요**.
- `client-errors:prune` — 매일 04:10(보관기간·용량 상한: `game.client_errors`).
- `rank:sweep`(클로저) — 매분. `game.rank.enabled=false` 면 no-op.

운영 등록(택1, 서버 1대 기준)
- cron: `* * * * * cd /경로 && php artisan schedule:run >> /dev/null 2>&1` (`docs/SEASON_WAR_OPS.md` 에 같은 방식 명시)
- 또는 상시 프로세스 `php artisan schedule:work` 를 supervisor/systemd 로 구동(개발 compose 의 `scheduler` 서비스와 동일. `docker compose up -d scheduler`).
- 서버가 여러 대면 `war:tick` 락이 파일 캐시 기준이므로 공유 캐시로 교체 필요(1장).
- 큐 워커(`queue:work`): `QUEUE_CONNECTION=database` 가 기본이지만 Job 사용 여부 **확인 필요**. 쓰는 경우 `jobs` 테이블 마이그레이션과 워커 프로세스 관리가 필요.

### 3.6 웹서버
- 문서 루트는 `public/`. 저장소에는 nginx/apache 설정이 없다(작성 필요, **확인 필요**). 일반적인 Laravel 규칙: 모든 비정적 요청을 `public/index.php` 로 전달(php-fpm).
- 개발 컨테이너는 `php artisan serve --host=0.0.0.0 --port=8000 --no-reload` 를 쓴다(Dockerfile CMD). 운영 부적합으로 보이며 운영은 php-fpm + nginx/apache 권장.
- 정적 에셋(`/assets/**`, `/build/**`)은 웹서버가 직접 서빙하고 장기 캐시를 걸어도 `?v=`/해시 덕분에 갱신된다.
- 헬스체크: `/up`(`bootstrap/app.php`).
- HTTPS 종료를 프록시가 한다면 `TRUSTED_PROXIES` 설정.
- 용량: `public/assets`(게임 에셋)가 크므로 서버 디스크·전송 방식(rsync 등)을 확인할 것. 에셋 manifest(`public/assets/manifest.json`)와 실제 파일이 함께 올라가야 한다.

## 4. 저장소 푸시·배포 전 정리 사항 (.gitignore)
다음은 `.gitignore` 로 저장소에서 제외한다(디스크 파일은 유지): `_bak_*`, `*.bak_*`, `_backup_*`, `_candidates_*`, `public/build-prev-*`, 기존 `*.bak`, `*.bak-*`, `/_asset_quarantine_*/`, `/docker/db-backup*/`. 운영에 불필요한 백업·후보 산출물이므로 배포 산출물에도 포함하지 않는다. `/CLAUDE.md`, `/AGENTS.md`, `docs/HANDOFF.md` 등 개인 지침·작업 로그도 제외 대상이다.

## 5. 배포 후 스모크 체크리스트
1. `GET /up` 200.
2. 메인 페이지 로드: `public/build/manifest.json` 해시 파일 404 없음, 브라우저 콘솔 오류 없음, 게임 에셋 `?v=` 값이 새 ASSET_VERSION.
3. `GET /api/rules`, `GET /api/announcements`, `GET /api/maintenance` 응답(공개 API, 점검 중에도 허용).
4. 게스트/로그인: 로그인 → `/api/profile` 정상.
5. 마이그레이션 반영: `php artisan migrate:status` 전부 Ran. 가챠 1회(펜 결제 경로: `gacha_pen_unavailable` 503 없음), 영웅 별 강화 API(404 `star_disabled` 아님), 편성 라인업 저장·조회.
6. 전투 1건 생성·진행(캠페인 스테이지 1개), 결과 정산·재화 지급.
7. 지갑 정합: `wallet_transactions` 합 = `wallets.balance`(`docs/BACKUP_PROCEDURE.md` 5장).
8. 시즌 전쟁: `GAME_SEASON_WAR_ENABLED=false` 이면 join/attack 이 403 `season_war_disabled`, 랭크 `/api/rank/*` 404 `rank_disabled` 인지(의도된 비활성 확인).
9. 스케줄러: `php artisan schedule:list` 에 `war:tick`, `client-errors:prune`, `rank:sweep` 표시. 다음 정시 이후 로그에 `war:tick` 실행 흔적.
10. `storage/logs` 에 오류 없음(`LOG_LEVEL=warning` 이상만 기록됨).
11. 점검 모드 해제 확인(`GET /api/maintenance` active=false).
12. 가챠·교환 요청이 타임아웃(20초) 후 재시도해도 이중 차감되지 않는지: FE 가 동일 `request_id` 를 재사용(코드 점검 결과 정상, 7장 참조).

## 6. 롤백
- 코드: 이전 릴리스로 되돌린다(릴리스 디렉터리 방식 또는 git 태그. 방식은 **확인 필요**).
- FE: 보관해 둔 이전 `public/build` 폴더로 교체. `ASSET_VERSION` 은 이전 값으로 되돌릴 필요 없고(올려 둔 채여도 무해, 단 에셋 파일을 함께 되돌렸다면 값을 한 번 더 올려 캐시 갱신).
- DB: 3.2 의 롤백(스냅샷 복원 우선). 마이그레이션 `down()` 은 데이터를 삭제한다.
- 설정: `.env` 변경은 이전 값 복원 후 `config:clear`(캐시 사용 시 재생성).
- 기능 스위치로 완화 가능: 시즌 전쟁 `GAME_SEASON_WAR_ENABLED=false`, 펜 관련 `GAME_PEN_ENABLED`, 별 강화 `GAME_STAR_ENABLED=false`, 소탕 `GAME_SWEEP_ENABLED=false`.
- 점검 모드로 쓰기 차단 후 작업(`PUT /api/admin/maintenance`).

## 7. 부록: 가챠·교환 재시도 시 중복 차감 점검 (2026-11-14)
FE 코드 읽기 결과, 타임아웃·네트워크 오류 후 사용자가 다시 눌렀을 때 pending `request_id` 가 유지된다(코드 수정 없음).
- `resources/js/game/api/client.js`: 타임아웃은 `ApiError{status:0, code:'timeout'}`.
- 가챠(`scenes/Gacha.js` `pull`, `scenes/Lobby.js` `gachaPull`): `pending[키] ??= newGachaRequestId()` 로 같은 요청에 같은 ID 재사용. 성공 시와 비재시도 오류에서만 삭제. 재시도 가능 오류(`network`, `timeout`, `gacha_conflict`, `db_busy`, 5xx)는 pending 유지. Gacha.js 는 `inFlight` 로 동시 2건도 차단.
- 교환소·상점(`scenes/lobbyExtra.js` `buy`): `pending[it.code] ??= newReqId(...)`. 오류 시 `e.status && e.status < 500` 일 때만 삭제하는데 타임아웃·네트워크는 status 가 0(falsy)이라 삭제되지 않아 같은 ID 로 재시도된다.
- 한계: 로비 가챠·상점·교환소의 pending 은 씬/탭 인스턴스 메모리라서 **페이지를 새로고침하면 사라진다**(Gacha.js 는 모듈 변수라 씬 재진입에는 유지, 새로고침에는 사라짐). 새로고침 후 재시도는 새 ID 가 되어 서버가 먼저 처리를 끝낸 요청이라면 이중 차감 가능성이 있다. 필요 시 sessionStorage 보관을 후속 과제로 검토.
