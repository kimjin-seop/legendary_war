# 시즌 전쟁 운영 메모 (2단계)

## 시간당 배치 `war:tick`
- `routes/console.php`에 `Schedule::command('war:tick')->hourly()->withoutOverlapping()` 등록됨.
- 하는 일(멱등): ① `end_at` 지난 시즌 종료(국가 점수 순위·MVP를 `season_results`에 저장, 새 시즌 자동 생성) ② 공성 정체 감소(마지막 전투 후 48h, 이후 24h마다 -10, 영토당 하루 -20·3회 상한, 0이면 공성 종료) ③ AI 국가 행동(실행당 `war.ai.max_battles_per_tick`건, 사람 기여 보호 규칙 ①~④).
- 수동 실행: `docker compose exec app php artisan war:tick` (장애로 놓쳐도 다음 실행이 상태 기반으로 따라잡는다).
- 스케줄러 프로세스는 아직 개발 compose에 없다(후속): `docker-compose.yml`에 `php artisan schedule:work` 서비스를 추가하거나 운영 cron `* * * * * php artisan schedule:run`을 둔다. 단일 서버 기준이라 `onOneServer` 불필요.

## 시즌 데이터 갱신
- `php artisan war:seed`는 활성 시즌이 있으면 유지하고 시나리오 JSON에 새로 생긴 국가·영토만 추가한다(소유권·점령도·점수는 건드리지 않음). 인접/좌표/표시 정보는 JSON을 바로 읽으므로 즉시 반영된다.
- 영토 좌표·방어 난이도는 근사 시작값(송서사·임밸런 검수 대기).

## 가정
- 오프라인 방어 상한은 정체 감소 로직에 적용(영토당 하루 -20, 처리 3회). 방어 전투 자체는 항상 AI garrison이고 방어 승은 점령도 변화 0이다.
- 모든 국가에 AI가 행동하되 사람 있는 국가는 그 국가 사람 공격 수의 50%, 사람 없는 국가는 하루 3회까지다. 명은 AI 전용(가입 불가)이며 동맹(조선) 영토가 2곳 이상 시작 소유국을 잃으면 참전한다.

## 3차 리뷰 반영 정책(정검수 2단계 Med 4건)
- **동맹 제한(M1):** 시작 소유국이 동맹이고 지금도 동맹국이 가진 영토만 공격 불가(`allied`). 동맹국이 점령한 원소유국 영토, 적이 점령한 동맹 영토는 사람·AI 모두 공격 가능.
- **우승 산정:** AI 전용 국가(명)는 순위표/기록에 표시하되 시즌 승자(`winner`, `seasons.winner_season_country_id`)는 사람이 가입 가능한 국가 중 최고 점수(동점은 영토 수, id).
- **동시성(M2):** `war:tick` 전체를 `Cache::lock('war:tick')`으로 직렬화(수동 실행 포함, 락 중이면 "이미 실행 중" 메시지 후 종료). 정체 감소는 영토별 트랜잭션에서 `lockForUpdate` 재조회 후 siege·시간·일일 상한을 재검증하고 `version` 조건부 UPDATE. 락은 파일 캐시 기준이므로 다중 서버로 가면 공유 캐시/DB 락으로 교체.
- **정체 타이머(M3):** `last_battle_at`은 공성이 새로 시작되거나 인수될 때 설정, 이미 공성 중이면 사람 전투(및 AI끼리 영토)가 리셋, 평시 방어 승은 설정하지 않음.
- **AI 유예(M4):** `war.ai.grace_hours`(24) 동안 시즌 시작 직후 AI 공격 없음. 해당 시즌에 사람 가입자가 1명이라도 생기면 즉시 해제.
- **시즌 종료 경계:** `end_at`이 지났으면 `war:tick` 종료 처리 전이라도 진행 중이던 전투 결과는 기록만 남기고 영토·점령도·점수에 반영하지 않는다(draw). 종료 직후 새 시즌 생성에 실패해도 다음 `war:tick`이 "활성 시즌 없음"만으로 재생성한다.
- **API:** events는 `after_id` 지정 시 오름차순으로 limit만큼 이어받고(`order=asc`) `last_id`는 실제 반환한 최대 id. 응답/payload에서 내부 `season_country` id는 국가 코드로 대체. ranking/history는 `user_id` 대신 `me` 플래그(닉네임 공개 범위는 기존 정책 유지). FE가 사용자 id가 꼭 필요하면 알려 달라.

## 가입자 화면 BE 2차 (open_battle / my-battles / party_check / 정산 순위)
- **스키마 변경 없음.** `GET /api/war/state` 에 `open_battle{battle_id,territory_id,territory_name,turn,status}|null`(내 in_progress 시즌 전투)과 `party_check{code|null,used,max}` 추가. `party_check` 는 `GET /api/war/map` 에도 포함. 규칙은 공격 시작(createBattle)과 동일 함수(`warPartyIds`+`validateParty`) 사용: 캠페인 전용 영웅 제외, maxSlots 절단, code 는 party_empty/cost_exceeded 등.
- **정산(result.war) 추가 필드:** `my_contribution_gain`(attack_win 가산분), `capture_bonus_gain`(점령 시 capture_bonus), `rank_before`/`rank_after` `{personal,country}`(개인 기여도 순위 / 내 국가 점수 순위, ranking 과 같은 정렬). 기존 `occupation_before/after/delta/captured` 유지. 중복 정산 방지(settled_at 조건부 UPDATE)는 그대로.
- **`GET /api/war/my-battles?limit=10`**: 활성 시즌 내 공격 이력 최신순(limit 1~50). 진행 중 전투는 result=null.

## 시즌 전투 보상(AC6) / 로비 알림
- **보상:** `WarService::settleBattle`(settled_at 조건부 UPDATE 통과 시에만) 에서 출전 영웅 각자에게 경험치 지급. 골드 0 유지. 수치는 `config/game.php` `game.war`(임밸런 조정): `reward_win_exp`=30, `reward_lose_exp`=6(패·무), `reward_capture_bonus_exp`=20(점령 성공 시 승리분에 가산), `reward_daily_cap`=3(유저당 하루 지급 횟수, KST 05:00 기준 DailyCounter `war_reward:user:{id}`, 0=무제한). 상한 초과 시 exp 0 + `blocked=daily_cap`(전투 결과는 유지). 포기(abandon) 전투는 finished 가 아니라 정산 자체가 없어 무보상. 시작값은 가정(캠페인 초반 승리 exp 60~130 대비 약 30~40% / 패 약 10%).
- **결과:** `result.war` 는 그대로, 최상위 `result.reward{exp,heroes[],blocked}` 와 `result.heroes`(동일 배열, 레벨업 정보 포함). 캠페인/자유 대전 정산 경로는 미변경.
- **`GET /api/war/unread?after_id=N`** -> `{count,last_id,my_country}`. count = after_id 이후 `capture|capital_fall|capital_siege` 중 `country==내 국가` 또는 `payload.from==내 국가` 또는(capital_siege 이고 영토 현재 소유국==내 국가) 인 이벤트 수(FE `isMyCountryAlert` 와 동일 정의, 최대 200건 범위 조회, `war_events(season_id,id)` 인덱스 사용). last_id = 활성 시즌 최대 이벤트 id. 시즌 없음/미가입/게스트는 `{0,0,null}`. 집계만 반환하며 타 유저 정보 없음.

## 2세력 개편 (2026-11-03)
- 시나리오는 **주 대립 2세력만** 국가·영토·점수·수도를 가진다. 원군·동맹(imjin의 명)은 영토 없이 주 세력 소속 `supporters`로만 표현한다. imjin = 조선 vs 일본, 11영토(요동·북경 제거, 의주는 조선 북단 끝).
- 시나리오 JSON: `countries[].supporters:[{code,name,label}]`. API `countries[].allies`는 이 값을 `[{code,name,label:'원군'}]`로 내려준다(코드 문자열 배열이 아님). `retired_countries`는 과거 시즌 기록(순위·히스토리)의 철수 국가 표기용.
- 기존 활성 시즌 정리: `php artisan war:seed`(syncSeason)가 시나리오에서 빠진 국가·영토를 삭제(해당 영토의 전투·기여·점수·로그·이벤트 포함)하고, 빠진 국가 가입자는 첫 사람 국가(조선)로 옮긴다. 종료된 과거 시즌은 건드리지 않는다.
- 동맹 제한(`allied`)·reactive AI·`ai_only` 코드는 시나리오 데이터가 쓰는 한 유효한 범용 규칙으로 남겨 두었고, imjin 데이터는 더 이상 쓰지 않는다.

## 시나리오별 시즌 동시 운영 (imjin / france / rome, 2026-11-03)
- **동시 활성**: 시나리오마다 활성 시즌 1개까지 동시에 둘 수 있다(`ensureSeason`·관리 API 생성 모두 시나리오 단위로 중복 검사). `war:tick`은 활성 시즌 전부를 처리하고, 종료된 시즌은 **같은 시나리오**로 자동 재생성한다(`war.season.auto_next`).
- **시즌 해석 규칙**(`WarService::resolveSeason`): `?scenario=<코드>`(조회) 또는 body `scenario`(가입·공격) 지정 > 유저가 가입한 활성 시즌(가장 최근) > 최신 활성 시즌. 지정한 시나리오에 활성 시즌이 없으면 `season_not_found`(404). 적용 API: `GET /api/war/active|state|map|ranking|events|unread|my-battles`, `POST /api/war/join`, `POST /api/war/territories/{code}/attack`. `GET /api/war/preview?scenario=`는 기존대로 시즌 없이 지도 미리보기.
- **신규 `GET /api/war/seasons`**: 진행 중 시즌 목록 `{seasons:[{season_id,scenario_code,name,end_at,joined,country}]}`. `GET /api/war/active` 에도 `scenario_code`·`seasons` 필드가 추가됐다.
- **주의**: 아직 미가입인 유저가 `scenario` 없이 가입하면 최신 활성 시즌에 가입된다. FE는 가입 요청에 `scenario` 를 항상 보낸다.

### 프랑스(france) 시즌을 개발 DB 에서 만들어 보는 절차 (사용자 확인 후 실행)
1. 개발 DB 파일 복사 백업(`docker compose run --rm --no-deps --entrypoint "" app cp /var/www/dbdata/database.sqlite /var/www/html/docker/db-backup-20261103/before-season-france.sqlite`).
2. 생성(택1):
   - CLI: `docker compose run --rm --no-deps app php artisan war:seed france` (활성 france 시즌이 없으면 생성, 있으면 시나리오 신규 영토만 보충, 멱등).
   - 관리 API: `POST /api/admin/war/seasons` body `{"scenario_code":"france","confirm":"CREATE_SEASON"}` (관리자 토큰, 감사 로그 기록).
3. 확인: `GET /api/war/seasons` 에 france 가 보이고, `GET /api/war/state?scenario=france`, `GET /api/war/map?scenario=france` 응답의 `scenario_code` 가 france 인지 본다. imjin 시즌은 영향 없다.
4. 되돌리기: 관리 API `POST /api/admin/war/seasons/{id}/end`(confirm `END_SEASON_<id>`) 또는 1번 백업 복원.
- 시나리오 데이터 검증: `tests/Unit/WarScenarioDataTest.php`(imjin·france·rome 국가 2·수도 1·좌표·링크·연결성).

### FE 요구사항 (윤프론)
- 시즌 시나리오 선택 UI: `GET /api/war/seasons` 목록으로 시나리오 탭/카드, 선택값을 이후 war 호출의 `?scenario=`(가입·공격은 body `scenario`)로 전달. 가입한 시즌은 `joined`·`country` 로 표시, 진입 시 `/api/war/active` 의 `scenario_code` 를 기본 선택으로.
- 지도 view: `state`/`map`/`preview` 응답의 `view`(`map_view` lon/lat 범위)와 `scenario_code` 로 시나리오별 지도 투영·배경을 바꾼다(영토 좌표는 lon/lat). 시나리오별 색·국호(`countries[].color/plaque`)는 응답 값 사용.
- 랭킹·이벤트·미확인 알림 등도 같은 `scenario` 를 넘기지 않으면 가입한 시즌 또는 최신 활성 시즌 기준이 된다.
