# 관리자 도구 API 명세 (시즌 전쟁 + 채팅 운영, 2026-11-03)

공통: `/api/admin/*` (Sanctum 쿠키 + `role=admin`, throttle 60/분). 비관리자 403. 에러는 `{error:{code,message}}`. 모든 변경은 `audit_logs`(누가/언제/전후값/사유)에 기록. 기존 `/api/admin/users/{id}/ban`, `/audit-logs` 등은 그대로.

## 1. 시즌 전쟁
안전장치: 변경 API는 `Cache::lock('war:tick')`(war:tick 과 동일 락)을 잡고 실행한다. 틱 실행 중이면 409 `war_tick_busy`(잠시 후 재시도). 종료된 시즌/그 소속 영토 수정은 409 `season_ended`. 파괴적 동작은 `confirm` 문자열이 정확히 일치해야 한다(422 `confirm_required`). 사유(`reason`)는 5~200자 필수.

| 메서드 경로 | 입력 | 설명 |
|---|---|---|
| GET `/api/admin/war/season[?season_id=]` | - | 요약(기본: 활성 시즌, 없으면 최신). `season{id,scenario_code,name,status,start_at,end_at}`, `countries[{id,code,score,member_count,territories}]`, `territories[{id,code,owner,state,siege_country,occupation,last_battle_at,version}]`, `recent_events[30]` |
| POST `/api/admin/war/seasons` | `confirm:"CREATE_SEASON"`, `scenario_code?`(기본 imjin) | 해당 시나리오 활성 시즌이 없을 때만 생성(201 `{season_id}`). 있으면 409 `season_exists` |
| POST `/api/admin/war/seasons/{id}/end` | `confirm:"END_SEASON_<id>"`, `reason` | 활성 시즌 강제 종료(순위·MVP·season_results 는 정상 종료와 동일, 영토/점령도 기록 보존). 새 시즌은 다음 war:tick 이 자동 생성(필요 시 위 생성 API). 응답 `{ok,ended}` |
| PATCH `/api/admin/war/territories/{id}/occupation` | `occupation:0..99`, `reason` | **공성(siege) 중인 영토만**(아니면 422 `not_in_siege`). 0이면 공성 종료(peace). 100 이상(소유권 이전)은 불가. `territory_occupation_logs(kind=admin)`·`war_events(admin_adjust|siege_end)` 기록. 낙관적 락 충돌 409 `version_conflict` |

## 2. 채팅 운영
- 신고 큐 `GET /api/admin/chat/reports[?status=open|all&page=]`: `open`(기본)=미처리(`handled_at` null). 항목에 `handled_at`, `handled_action` 추가. 메시지 삭제 시 해당 메시지의 미처리 신고는 `deleted`로 자동 처리.
- `POST /api/admin/chat/reports/{id}/handle` `{action:"dismissed"|"resolved", note?}`: 처리 완료 표시(멱등: 이미 처리면 `already_handled:true`).
- `DELETE /api/admin/chat/messages/{id}`: 소프트 삭제(멱등).
- `POST /api/admin/chat/users/{id}/restrict` `{minutes:1..43200, reason}`: 수동 제재. 기존 `users.chat_restricted_until` 재사용(더 긴 기존 제재는 줄이지 않음), `chat_sanctioned_at` 갱신(이전 신고는 자동 제재 카운트에서 제외), 대상의 미처리 신고는 `sanctioned`로 처리. 관리자 대상 422 `cannot_restrict_admin`. 응답 `{restricted_until}`. 해당 유저의 `GET /rooms/{code}/messages`·`chat-settings`에 `restricted_until`로 노출.
- `POST /api/admin/chat/users/{id}/unrestrict` `{reason}`: 제재 해제(`chat_sanctioned_at` 갱신: 해제 전 신고는 다시 합산되지 않음).
- 스키마: 마이그레이션 `2026_11_03_300100_add_handled_to_chat_reports`(chat_reports.handled_at/handled_by_user_id/handled_action, 롤백 가능). 적용 전 개발 DB 백업 `docker/db-backup-20261103/before-admin.sqlite`.

## 3. FE 후속 목록 (윤프론)
1. 관리자 화면(관리자 계정 전용 진입): 시즌 요약 대시보드(국가 점수·영토 표·최근 이벤트), 점령도 보정 폼(사유 필수), 시즌 생성/강제 종료 모달(확인 문자열 직접 입력 UI, 종료 전 요약 재확인), `war_tick_busy` 재시도 안내.
2. 채팅 신고 큐 화면: 미처리/전체 탭, 메시지 원문 스냅샷, 처리(기각/해결)·삭제·제재(분 선택+사유)·해제 버튼.
3. 일반 사용자 채팅 UI: `restricted_until`을 "채팅 제한 중 (HH:mm까지)"로 표시.
4. 개인 전적 화면: `docs/PVP_RECORD_SPEC.md`의 `GET /api/me/record` 연결.
5. 제재/삭제 동작 시 감사 로그 화면 링크(`/api/admin/audit-logs`).

## 관리자 계정 부여/회수 (CLI, 사용자가 직접 실행)
- 신규 관리자 계정 생성 또는 기존 계정 승격: `php artisan game:make-admin {email} [--name=Admin]` (신규면 비밀번호를 숨김 프롬프트로 입력, 인자·로그에 남지 않음. 게스트는 불가).
- 기존 정식 계정에 권한만 부여: `php artisan admin:grant {email}`, 회수: `php artisan admin:revoke {email}` (마지막 관리자는 회수 불가, 게스트 불가, 비밀번호·토큰은 다루거나 출력하지 않음, 회수 시 해당 계정의 개인 액세스 토큰 폐기). 모두 `audit_logs` 에 기록(`make_admin`/`admin_grant`/`admin_revoke`, user_id=null=CLI).
- Docker: `docker compose run --rm --no-deps app php artisan admin:grant you@example.com`.

## FE 지원 API 추가 (2026-11-03)
- `GET /api/admin/dashboard`: `{active_seasons[{id,scenario_code,name,end_at,members,recent_events}], open_chat_reports, users{total,today,banned}, battles{today,in_progress}, audit_logs_today}`.
- `GET /api/admin/war/scenarios`: `{scenarios[{code,name,shelf_code,season_days,active_season_id}]}` (imjin·france·rome). `POST /api/admin/war/seasons {scenario_code, confirm:"CREATE_SEASON"}` 는 시나리오마다 활성 시즌 1개까지 동시 생성 가능. `GET /api/admin/war/season?scenario_code=` 로 시나리오별 요약.
- `GET /api/admin/users?q=&role=&is_guest=&banned=&per_page=` (이름·이메일 부분일치, 페이지네이션 `data/total/...`).
- `GET /api/admin/battles?status=&user_id=&stage_id=&from=&to=&per_page=`, `GET /api/admin/audit-logs?actor=&action=&entity=&from=&to=&per_page=`.
- `GET /api/admin/config/{entity}`: `q`·`page`·`per_page` 중 하나라도 있으면 검색(name·code·name_ko 부분일치)+페이지네이션, 없으면 기존 `{items}`(최대 500). `PATCH` 응답은 `{item, before, after}` 이고 선택 `reason`(<=200자)은 audit `after._reason` 에 저장.
- `POST /api/admin/users/{id}/ban|unban` 은 선택 `reason` 을 audit `after.reason` 에 저장.
- `GET /api/admin/config/{entity}/{id}` 의 미정의 변수 사용 버그(maps 에서 오류 가능)를 수정.

## 교환소 상품 관리 (2026-11-04)
- `GET /api/admin/exchange/products`: `{products[{id,code,name_ko,description,kind,payload,payload_decoded,price_gold,daily_limit,enabled,sort_order,...}]}`.
- `POST /api/admin/exchange/products {code(소문자·숫자·밑줄 2~40), name_ko, kind(equipment|currency), payload, price_gold, daily_limit(0=무제한), description?, enabled?, sort_order?, reason?}` -> 201 `{item}`. payload: equipment `{equipment_code}`, currency `{currency(gold 제외), amount 1~1000000}`. 잘못된 payload 422 invalid_payload.
- `PATCH /api/admin/exchange/products/{id}` (부분 수정, `reason?`) -> `{item,before,after}`. 삭제 없음(enabled=false).
- 모두 audit_logs entity=`exchange-products`. 상세: docs/SHOP_EXCHANGE_SPEC.md.

## 공지·점검 관리 (2026-11-04)
- `GET|POST /api/admin/announcements`, `PATCH /api/admin/announcements/{id}`, `GET|PUT /api/admin/maintenance`(켤 때 `confirm:"MAINTENANCE"`). 점검 중에도 관리자는 모든 API 사용 가능. 상세: docs/ANNOUNCE_MAINTENANCE_SPEC.md.

## 정검수 반영 (2026-11-04)
- 교환소 상품·공지·점검 변경 API 는 `reason` 필수. (기존 config PATCH·ban/unban 의 `reason` 은 선택 유지.)
- 교환소 상품: `price_currency`(gold|pen) 지원, `price_gold=0 && daily_limit=0` 거부(422 invalid_free_unlimited).

## 관리자 로그인 QA 수행 방법 (비밀번호를 채팅·코드·로그에 남기지 않는 방식) — 절차만 정리, 실행 금지
전제: 계정 생성·권한 부여는 사용자 승인 후 팀장이 결정한다. 이 절차는 실행하지 않았다.
1. 계정 준비(택1, 사용자가 본인 터미널에서 직접 실행)
   - 새 관리자: `docker compose run --rm app php artisan game:make-admin qa-admin@example.test --name=QAAdmin` — 비밀번호는 숨김 프롬프트로 입력(화면·셸 기록에 남지 않음).
   - 기존 정식 회원에 권한만: `docker compose run --rm app php artisan admin:grant <기존 이메일>` (비밀번호 불필요, audit 기록).
2. 로그인(강화면)
   - 브라우저에서 사용자가 직접 비밀번호를 입력해 로그인한 세션을 사용한다(자동화 스크립트·채팅에 비밀번호 전달 금지). 헤드리스 검증이 필요하면 사용자가 로그인한 브라우저 프로필/세션 쿠키 파일을 로컬에서만 재사용하고 저장소·로그에 커밋하지 않는다.
   - 비밀번호를 파일에 둘 수밖에 없으면 gitignore 된 임시 파일(예: scratchpad) + 환경변수 `QA_ADMIN_PASSWORD` 로만 주입하고 작업 후 삭제한다.
3. 종료 후 정리
   - QA 전용으로 만든 계정은 `php artisan admin:revoke <이메일>` 로 권한 회수, 필요 시 계정 비활성(ban). 토큰은 revoke 가 폐기한다.
   - 점검 모드 QA 중에는 관리자 우회가 되므로, 일반 사용자 화면 확인은 별도 게스트 세션으로 한다.
4. 점검 모드 QA 주의: 켜기 전 `PUT /api/admin/maintenance` 에 `confirm:"MAINTENANCE"`·`reason` 필수, 검증 후 반드시 해제(`enabled:false`).

## 클라이언트 에러 리포트 (#17, 2026-11-04)
- 수집(공개): `POST /api/client-errors {message(필수), stack?, level?(error|warn), scene?, url?, app_version?, platform?}` -> 202 `{ok:true}`.
  - 인증 불필요, IP당 분당 20회(throttle `client-errors`), 본문 8KB 초과 413 `payload_too_large`, 점검 모드 중에도 허용.
  - 저장 시 message 300자·stack 2000자로 자르고, URL 은 경로만 저장(쿼리·해시 제거), 이메일·Bearer/긴 토큰 형태·쿼리스트링 값은 마스킹한다. 사용자 id·IP·쿠키는 저장하지 않는다.
  - 같은 오류(level+message+stack 첫 줄+scene)는 하루(KST 05:00 기준) 1행에 `count` 누적.
- 조회(관리자): `GET /api/admin/client-errors?q=&level=&from=&to=&min_count=&per_page=` — 최근 발생 순 페이지네이션(`data/total`), 행 = `{id, period_key, fingerprint, level, message, stack, scene, path, app_version, platform, count, first_seen_at, last_seen_at}`.
- 보관: `config game.client_errors` (`retention_days` 14, `max_rows` 5000). `php artisan client-errors:prune [--dry-run]` 가 보관기간 초과 삭제 + 용량 초과분을 오래된 것부터 삭제하며 스케줄러가 매일 04:10 에 실행한다.
- 테스트: tests/Feature/ClientErrorTest.php (수집·마스킹·누적·413·어드민 조회·정리).

## /api/rules 소탕 규칙 (2026-11-04)
- 최상위 `sweep: {enabled, max_count, daily_cap}` 추가(FE 는 `sweep.max_count` 를 우선 사용).

## 유저 진행도 초기화 (2026-11-14)
- `POST /api/admin/users/{id}/reset-progress {confirm, reason}`: `confirm` 은 대상 유저 이름과 정확히 일치해야 하고 `reason` 은 2~200자 필수. 게스트 포함 일반 유저만(본인·관리자 계정 422).
- 응답: `{ok, counts{테이블:삭제행수, battles_abandoned, wallet_balance_zeroed}, granted{gold,pen,level,heroes[{hero_id,name_ko,rarity}]}, audit_id, warning, kept[]}`. 오류: 422 `confirm_mismatch|cannot_reset_self|cannot_reset_admin`, 409 `user_in_active_room`, 404 `not_found`, 403 비관리자.
- 초기화(삭제): user_lineups, parties, hero_equipment, user_equipment, equipment_purchases, user_heroes, hero_star_ups, user_stage_progress(캠페인 진행), stage_sweeps, user_quests, quest_event_log, user_items, item_purchases, exchange_purchases, gacha_pulls, gacha_user_states, user_protagonists, season_members(+국가 member_count 감소), territory_contributions, rank_ratings, rank_queue, 해당 유저 daily_counters. users.level/exp=1/0, 튜토리얼 진행 리셋. 진행 중 전투는 abandoned.
- 유지: users 행(이름·이메일·권한·정지), 인증 토큰·세션, guests, 채팅 메시지·신고, audit_logs, wallets 행과 wallet_transactions 원장 전체(잔액은 `admin_reset` 상쇄 행으로 0 처리, 시작 지급 행은 reason 에 `_r{audit_id}` 접미), 종료된 battles·rank_matches·rooms.
- **원장 행의 reason_code 개명이 일어난다**: 기존 `starter_grant`·`starter_pen` 행은 `starter_grant_r{audit_id}`·`starter_pen_r{audit_id}`로 바뀐다(grantStarter 재지급 허용 목적, 원장 합계는 보존, audit_logs 에 audit_id 기록). DB 드라이버 무관(PHP 행별 update).
- 초기화 후 ProgressionService::grantStarter 재사용(시작 골드·펜, 이순신+시작 등급 영웅·편성). 튜토리얼 보상(tutorial_reward)은 원장 멱등키로 재지급되지 않는다.
- 단일 트랜잭션 + 대상 users 행 잠금, 진행 중(waiting|deployment|in_progress) 방에 있으면 409. audit_logs: action=reset_progress, before(레벨·골드·펜)/after(reason·counts·granted).
- **운영에서는 실행 전 DB 백업 필수**: docs/BACKUP_PROCEDURE.md. 코드는 자동 스냅샷을 만들지 않는다.
