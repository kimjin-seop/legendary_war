# 시즌제 국가 전쟁 + 자유 대전 분석·설계서 (MVP 1단계 산출물)

작성: 박백엔(백엔드) / 2026-11-02 / 상태: **초안 - 사용자 확정 전, 기존 코드·DB·데이터 변경 없음(읽기 전용 분석)**
요구 원문: `docs/SEASON_WAR_REQUEST.md` (소규모 커뮤니티 추가 요구 포함)

전제(추가 요구 반영): 액티브 유저 50~100명, 국가 3개, 영토 12~20개, 시즌 전투는 비동기 기본, 자유 대전은 기존 실시간 방 유지, 인프라 최소(Redis/WebSocket/별도 큐 서버 도입 금지).

---

## 0. 한 페이지 결론

1. **전투 엔진·결과 처리·봇 AI·편성·맵 렌더링은 모두 재사용 가능하다.** 새 엔진/타일/전투 UI는 만들지 않는다.
2. **비동기 전투 = "방어자 부대 스냅샷(고스트) vs 공격자(실제 플레이)".** 기존 solo 방(컴퓨터 상대) 흐름과 동일하게 서버가 상대(side b) 턴을 `HeuristicBot`으로 처리한다. 방어자가 온라인이든 오프라인이든 같은 경로이므로 "오프라인 자동 방어"가 별도 기능이 아니라 기본 동작이 된다.
3. **AI 국가 전투는 `Simulator::run()`(봇 vs 봇 완주, DB 미사용)으로 서버 스케줄러에서 처리**한다. 신규 AI 로직 불필요(기존 `HeuristicBot` 재사용), 신규는 "무엇을 공격할지" 고르는 전략 규칙뿐.
4. **스케줄러는 Laravel scheduler(`schedule:work`/cron `schedule:run`) + 동기 실행으로 충분**하다. `jobs` 테이블(DB 큐)은 이미 있으나 이 규모에서는 큐 워커 불필요(선택 사항). 현재 `docker-compose.yml`에는 scheduler/worker 컨테이너가 없어 **서비스 1개 추가가 필요**(compose는 타 에이전트 작업 중이라 이번 단계에서 미수정).
5. **자유 대전의 방 생성/공개 목록/참가/맵 선택/편성/1:1/채팅은 이미 구현**돼 있다. 없는 것: 비밀번호, 친구 초대, 규칙 옵션 선택, 개인 전적 조회 화면. (시즌 전쟁과 무관하게 후속 과제로 분리 - 요구상 "이미 구현된 것은 재개발 금지"이므로 미구현 3건은 사용자 판단 대상.)
6. **기존 코드 변경은 3곳 이내(BattleService::settle 훅 1건, 라우트 파일 추가 include, FE Lobby 진입 버튼)로 최소화**한다. 나머지는 신규 파일.
7. 가장 큰 기술 위험: (a) `battles.mode` CHECK 제약(SQLite 테이블 재생성 필요) - 회피안 있음, (b) SQLite 쓰기 직렬화·동시성, (c) 시즌 영토 폴리곤 데이터가 없음(핀 방식으로 해결), (d) AI 자동 전투 1건당 CPU 시간(실측 필요).

---

## 1. 현재 구조 분석

### 1.1 스택·실행 환경
| 항목 | 현황 | 근거 |
|---|---|---|
| 백엔드 | Laravel(PHP), Sanctum SPA 쿠키 + 게스트 토큰(`X-Guest-Token`) | `routes/api.php` 상단 주석(= API 문서 원본) |
| DB | 개발 SQLite(`DB_CONNECTION=sqlite`), docker에서 `/var/www/dbdata/database.sqlite` named volume. 운영 DB 종류는 코드상 미확정(아래 5.0 참고) | `.env`, `docker-compose.yml` |
| 큐/캐시/세션 | `QUEUE_CONNECTION=database`(jobs 테이블 존재), `CACHE_STORE=file`, `SESSION_DRIVER=file` | `.env`, `database/migrations/0001_01_01_000002_create_jobs_table.php` |
| 스케줄러 | **없음**: `routes/console.php`에는 inspire만. compose에 scheduler/worker 서비스 없음 | `routes/console.php`, `docker-compose.yml` |
| 서버 타임존 | `UTC`. 일일 경계는 `Support\Period`(KST 05:00)로만 변환 | `config/app.php`, `app/Support/Period.php` |
| 프론트 | Vue 라우터 껍데기(`resources/js/pages`) + **Phaser 씬 기반 게임**(`resources/js/game/scenes/*`: Boot/Title/Lobby/Deploy/Battle/Room/Dialogue…) | `resources/js/game/` |
| 일일 카운터 | `Support\DailyCounter::tryIncrement(key, cap, amount)` - 일일 상한 공용 장치 | 사용 예 `BattleService::settle` |

### 1.2 라우트 / 컨트롤러 / 서비스 / 모델
- 라우트: `routes/api.php`(주석이 API 문서 원본), SPA 진입은 `routes/web.php`.
- 컨트롤러(`app/Http/Controllers`): `AuthController`, `GameController`(스테이지/전투), `RoomController`(방), `ChatController`, `RankingController`, `QuestController`, `GachaController`, `EquipmentController`, `ProtagonistController`, `TutorialController`, `AdminController`.
- 서비스(`app/Services`): `BattleService`(1253줄: 스테이지 전투 생성·배치·행동·봇턴·정산), `RoomService`(625줄: 방/PvP/solo), `MapCatalog`, `GameData`(참조 데이터 로더), `ProgressionService`(재화·경험치·편성 검증), `RankingService`, `QuestService`, `ChatService` 등.
- 모델: Eloquent는 `Battle`, `User` 둘뿐. 나머지는 `DB::table()` 직접 사용 -> **신규 코드도 동일하게 DB::table + 서비스 클래스 스타일을 따르면 일관적**.
- 게임 코어(`app/Game`, 순수 PHP): `Engine`(2160줄), `HeuristicBot`(895), `Simulator`, `ArmyBuilder`(진영 구성), `BotDeployer`, `EnemyV3Adapter`, `RuleSet`, `Rng` 등.

### 1.3 전투 엔진·결과 처리
- 엔진은 **상태(JSON 배열) + 행동 -> 새 상태 + 이벤트**의 순수 함수형 구조: `Engine::initialState()`, `Engine::apply($state,$side,$action)`. 시드 기반 `Rng`로 **결정적**(같은 시드·같은 행동이면 같은 결과). -> 서버 검증·재현에 유리. (`app/Game/Engine.php`, `Rng.php`)
- 전투 행 `battles`: `state`(JSON 전체 상태), `seed`, `version`(낙관적 락), `winner`('a'/'b'), `settled_at`(정산 1회 보장), `result`(JSON), `mode`('stage'|'free'|'pvp'), `room_id`, `opponent_user_id`, `winner_user_id`, `pvp_recognized`. 행동 로그는 `battle_actions`(seq 단조 증가 이벤트 소싱).
  - 근거: `database/migrations/2026_10_31_000200_create_game_player_tables.php`, `..._000300_create_rooms_tables.php`, `..._000480_add_ranking_columns.php`, `..._000490_add_pvp_recognized_to_battles.php`
- **결과는 서버가 계산**한다. 클라이언트는 행동(`POST /api/battles/{id}/actions`)만 보내고 승패는 서버 `Engine`이 확정 -> `BattleService::submitAction` -> `applyStatus` -> `persist`(version 조건부 UPDATE) -> `finished`면 `settle()`. 클라가 결과를 보고하는 API는 없음(= 요구의 "전투 결과는 서버" 이미 충족).
- 정산 `BattleService::settle(Battle,User)`(`app/Services/BattleService.php:855`): `settled_at IS NULL` 조건부 UPDATE로 중복 정산 방지. `mode==='pvp'`면 보상 0 + 퀘스트/랭킹 인정 판정(`pvpRecognized`: 최소 라운드·양측 행동·동일 상대쌍 일일 상한) 후 return, 그 외는 스테이지/자유 보상·별점·합류 영웅.
- 타이머: PvP만 턴 제한(`turn_deadline_at`, 기본 60초, 이탈 90초, 연속 미응답 2회 기권 - `config/game.php` `room`). solo/스테이지는 제한 없음(`BattleService::syncStageDeadline`).

### 1.4 AI / 자동 전투 유무
- **봇 AI 있음**: `HeuristicBot`(처치/상성 우선 공격, 접근 이동, 치유사 AI, 교대 행동 `planActivation` 지원). 운영 경로는 `BattleService::botTurn`(solo/스테이지 side b 자동), 시뮬레이션 경로는 `Simulator::run($state)`(**양 진영을 봇이 완주**, DB 미사용, `game:simulate` 콘솔에서 사용 - `app/Console/Commands/GameSimulate.php`).
- **자동 전투(양측 AI) 가능**: `Simulator::run()`이 이미 존재. 안전장치 `safetySteps`(기본 400, 교대 행동 4000). 비동기/오프라인/AI 국가 전투에 그대로 사용 가능.
- 적 부대 생성: 스테이지는 `EnemyV3Adapter` + `ArmyBuilder::addGenericSide`, solo는 `ArmyBuilder::randomParty`. 영토 수비대(AI 주둔군)도 이 둘로 생성 가능.

### 1.5 영웅·부대 구조
- 참조: `heroes`(희귀도 S/A/B/C, culture, troop_type, title…), `presets`(영웅별 기본 부대), `skills/auras`, `hero_levels`, `user_level_costs`(레벨별 코스트·편성 슬롯). 소유: `user_heroes`(레벨·경험치), `parties`(편성), `hero_equipment`/`user_equipment`, `user_protagonists`(주인공). 근거: migrations `..._000100_create_game_reference_tables.php`, `..._000200_...`, `..._000400_create_equipment_tables.php`, `..._300100_create_protagonist.php`.
- 편성 검증: `ProgressionService::validateParty / maxCost / maxSlots`. 방 대전은 **캠페인 전용 영웅 출전 불가**(`RoomService::beginBattle`) -> 시즌 전투도 동일 규칙 권장.
- 전투 부대 조립: `ArmyBuilder::addSide`(플레이어 영웅 편성), `addGenericSide`(NPC 편성), `EquipmentService::attach`(장비, PvP는 `equipment.pvp_scale` 보정).

### 1.6 맵·타일 렌더링
- **전장 맵(타일)**: DB `maps`(+ `rules/biome/meta` 컬럼), `MapCatalog`(`app/Services/MapCatalog.php`), 방용 프리셋 `config('game.room_map_codes')` 8종(river_01/02, plain_01, forest_01, mountain_01, desert_01, swamp_01, castle_01) + random. 렌더링은 `resources/js/game/scenes/Battle.js` + `systems/grid.js`, 타일셋 `data/unityTileset.js`·`rmTileset.js`, 배경 `public/assets/bg/battle_*`.
- **세계/영토 지도(캠페인 선택 화면)**:
  - `resources/js/game/ui/StageMapView.js`(약 97KB): 지도 위에 핀·세력 라벨(판)·영토 폴리곤·영웅 칩·점선 연결·카메라 이동/줌 연출을 그린다. 수학 유틸 `ui/stageMapMath.js`(project/fitBounds/declutter/placeLabels 등).
  - 데이터: `data/shelf_map_meta.json`(서가/캠페인 메타, `shelf_code` ch1~ch20, 세력 라벨·핀 좌표, 등장방형 정규화 x=(경도+180)/360, y=(90-위도)/180), `data/shelf_territories.json`(세력권 폴리곤 `[경도,위도]`, ch1은 `ch1_joseon / ch1_japan / ch1_ming` 3 세력 + 시점별 점령 스냅샷 `ch1_occ_hanseong, ch1_occ_mid_1592, ch1_occ_jan_1593, ch1_occ_coast_1597_98, ch1_occ_incursion_1597, ch1_ming_front_*`). 원본 스펙 `database/data/SHELF_MAP_META_SPEC.md`, `SHELF_TERRITORIES_SPEC.md`. 로더 `campaign/campaignMapData.js`(`loadTerritories`, `territoriesFor`).
  - 지도 에셋: `public/assets/manifest.json`의 `map.oldworld.base / overlay.greatwall / decor.sea / decor.border`(구대륙판 4000px, `assets/map_world/oldworld/…webp`) 또는 `map.world.*`. 모바일 변형(2048) 지원.
  - **중요**: 코드/데이터에 `imjin_battle`라는 별도 이름의 자산은 발견되지 않았다. 임진왜란 지도 자산은 **`ch1` 서가(shelf) 데이터 + `map.oldworld.*` 레이어**다(요청 문구의 imjin_battle = ch1 임진왜란 캠페인으로 해석. 사용자 확인 필요 - 미결 Q12). 참고: 임진 10개 스테이지 시드는 `app/Console/Commands/GameSeedImjin10.php`.
  - ch1 전장 범위: `battle_map_range` lon 123.5~131.5, lat 32.5~40.5(요동의 명군 거점은 범위 밖 -> 시즌 지도는 범위를 넓혀야 함).

### 1.7 멀티플레이(Room) 현황
`RoomController` / `RoomService`, 테이블 `rooms`, `room_players`, `room_messages`, `chat_reports`. 폴링 방식(웹소켓 없음): `GET /api/rooms/{code}?after_seq=N`.

### 1.8 자유 대전 요구 기능 대조표 (있음/없음)
| 요구 | 현황 | 근거 |
|---|---|---|
| 방 생성 | **있음** `POST /api/rooms` {mode solo/pvp, visibility public/private, map_code}, 분당 제한 throttle `room-create` | `RoomController::store`, `RoomService::create` |
| 공개 방 목록 | **있음** `GET /api/rooms`(공개 대기 pvp) | `RoomService::listPublic` |
| 참가 | **있음** 코드(8자리 난수)로 `POST /api/rooms/join` | `RoomService::join` |
| 비공개(코드 공유) | **있음**: visibility=private + 코드 | 동일 |
| **비밀번호** | **없음**(코드/private가 대체 수단). `rooms`에 비번 컬럼 없음 | `..._000300_create_rooms_tables.php` |
| **친구 초대** | **없음**(친구 시스템·초대 없음. 코드 공유만 가능) | routes/api.php 전수(친구/초대 키워드 0건) |
| 맵 선택 | **있음**: 8종 + random(solo) | `MapCatalog::pick`, `GET /api/maps`, `/maps/{code}/preview` |
| **규칙(옵션) 설정** | **부분**: 턴 제한/이탈 시간은 서버 고정값(`config('game.room')`), 방 단위 사용자 옵션 없음. 맵별 `rules`는 있음 | `rooms.turn_limit_seconds` 컬럼은 있으나 생성 API가 받지 않음 |
| 영웅 편성/배치 | **있음**: `/rooms/{code}/deployment`(GET/PUT), `/confirm`, 코스트·슬롯 검증 | `RoomService::deployment/submitDeployment/confirm` |
| 1:1 | **있음**(pvp 2인, side a/b) | `room_players` unique(room_id, side) |
| 컴퓨터 상대(solo) | **있음** | `RoomService::beginBattle` solo 분기 |
| 준비/시작/기권/나가기 | **있음** | `ready/start/leave` |
| 이탈·타임아웃 처리 | **있음**(연속 미응답 기권, 하트비트 `last_seen_at`) | `RoomService::tick/forfeit` |
| 채팅·신고 | **있음** | `ChatService`, `room_messages` |
| 개인 전적 | **부분**: PvP 승자 기록(`battles.winner_user_id`)·주간 랭킹 보드(`RankingService`, `GET /api/ranking`)·퀘스트 pvp_win. **개인 전적 목록/상세 API는 없음** | `..._000480_add_ranking_columns.php`, `RankingService` |
| 시즌/국가 무관 | **충족**(rooms는 시즌 개념 없음) | - |

=> 요구된 자유 대전 중 **재개발 대상은 없음**. 미구현 4건(비밀번호·친구 초대·규칙 옵션·개인 전적 조회)은 시즌 전쟁의 선행 조건이 아니므로 **별도 트랙(사용자 결정)** 으로 분리한다(Q1).

---

## 2. 재사용 가능 기능·에셋

| 영역 | 재사용 대상 | 용도 |
|---|---|---|
| 전투 엔진 | `Engine`, `Rng`(시드 결정성), `RuleSet`, `HeuristicBot`, `Simulator` | 영토 전투 본체, AI 자동 전투 |
| 진영 조립 | `ArmyBuilder::addSide/addGenericSide/randomParty`, `EnemyV3Adapter`, `BotDeployer`, `SquadPlanner` | 공격자·방어자 고스트·AI 수비대 편성 |
| 전투 진행 API | `BattleService::submitAction / botTurn / abandon`, `/api/battles/{id}/actions·units/{u}/moves·result` | 공격자 실플레이(solo 방과 동일 경로) |
| 편성·성장 | `ProgressionService::validateParty/maxCost/maxSlots`, `parties`, `user_heroes`, 장비 | 시즌 편성·영웅 육성 연동(전투력 별도 가산 없음) |
| 정산 안전장치 | `settled_at` 조건부 UPDATE 패턴, `version` 낙관적 락, `DailyCounter`, `Period`(KST 05:00) | 중복 점령 방지·일일 상한·기여도 감쇠 |
| 어뷰징 판정 | `pvpRecognized` 개념(최소 라운드·양측 행동·동일 상대 상한) | 시즌 전투 인정 판정의 모델 |
| 맵 | `MapCatalog`, `maps`, 전장 프리셋 8종, `public/assets/bg/battle_*` | 영토 종류별(평야/성/산/강) 전장 매핑 |
| 세계지도 렌더 | `StageMapView`, `stageMapMath`, `campaignMapData`, `shelf_map_meta.json`, `shelf_territories.json`, `map.oldworld.*` 에셋, 판(plaque) 글꼴 `plaqueFonts` | 시즌 세계지도(핀·국가 색·라벨) |
| 국가 상징 | ch1 세력 정의(색 `#3F6FB5` 등, 국호 판 朝鮮 등, 근거수준 필드), `emblem_kind` | 조선/일본/명 문양·색 |
| UI | `ui/Button`, `widgets.ScrollList`, `PortraitCard`, `common`, `Lobby.js` 탭 구조, `Room.js`(대기실/채팅) | 시즌 허브·영토 패널·기여도 목록 |
| 데이터 | 영웅 `culture`, `title`, 초상화(`ensurePortrait`), 영웅 스프라이트 매핑 | 대표 영웅·국가 영웅 표시 |
| 랭킹/퀘스트 | `RankingService`(보드 패턴), `QuestService::record(user,type,ref)` | 시즌 랭킹 보드, 시즌 퀘스트 훅(선택) |
| 채팅 | `ChatService` | 국가 채팅은 후속(필요 시 룸 채팅 구조 재사용) |

---

## 3. 신규 개발 필요 기능 (시즌 전용만)

1. 시즌/시나리오/국가/영토 **데이터 모델과 시드**(임진왜란 1종).
2. **국가 소속**(선택 1회, 시즌 종료까지 고정, 인원 균형 안내).
3. **영토 점령 규칙 서비스**(`WarService`): 공격 가능 판정(인접 적국), 공성 개시/단독 공성, 점령도 계산(설정값), 100 도달 소유 이전 트랜잭션, 정체(48h 무전투 -> 일일 -10), 이력 기록.
4. **시즌 전투 어댑터**(`WarBattleService`): 방어 고스트 구성 + 기존 엔진 battle 생성 + 종료 시 정산 훅 연결. 기존 전투 코드를 복제하지 않고 `ArmyBuilder`/`BattleService` 호출.
5. **AI 국가 전략기**(`WarAiService`): 성향 프로파일 기반 공격 대상 선택 + `Simulator`로 자동 전투 + 행동 제한(빈도·점령도 상한).
6. **스케줄러 명령**(`war:tick`): 정체 처리, AI 턴, 시즌 종료 판정, 알림 생성. 멱등·재진입 안전.
7. **점수·기여도·랭킹**(원장 방식), **알림/전황 피드**(폴링 조회).
8. **시즌 종료 처리**(천하통일 판정, 영구 기록 보존, 초기화, 다음 시즌 시작).
9. FE: 시즌 허브 씬/패널(국가 선택, 세계지도, 영토 패널, 공격 흐름, 전황 피드, 순위). 지도는 `StageMapView` 확장/재사용(별도 지도 컴포넌트 제작 금지).
10. 관리자 도구: 시즌 생성/시작/강제 종료, 점령도 수동 보정(감사 로그) - `AdminController` 패턴.

---

## 4. 기존 코드 변경 영역 (최소화)

| # | 파일 | 변경 | 캠페인 영향 | 비고 |
|---|---|---|---|---|
| C1 | `app/Services/BattleService.php::settle()` | 함수 최상단에 "이 전투가 시즌 영토 전투면(`territory_battles.battle_id` 존재) `WarService::settleBattle()`에 위임하고 return" 훅 1개. 기존 분기 불변 | 없음(조건 불충족 시 기존 경로 그대로) | 자유 대전 보상 로직(`stage_id===null`)을 건드리지 않으려면 이 훅이 필수. 대안 없음 |
| C2 | `routes/api.php` | `/api/war/*` 라우트 그룹 추가(또는 별도 파일 include) | 없음 | 상단 주석에 API 문서 동기화 필요(프로젝트 규칙) |
| C3 | `routes/console.php`(+ 필요 시 `bootstrap/app.php`) | `Schedule::command('war:tick')->everyFiveMinutes()` 등록 | 없음 | 현재 비어 있음 |
| C4 | `docker-compose.yml` | `scheduler` 서비스(`php artisan schedule:work`) 추가 | 없음 | **타 에이전트 작업 중 -> 4단계 시점에 별도 승인 후 반영** |
| C5 | `resources/js/game/scenes/Lobby.js` | "시즌 전쟁" 진입 버튼/탭 1개 | 없음 | 파일에 백업 다수 = 병행 수정 잦음, 충돌 주의 |
| C6 | `StageMapView.js` | 가능하면 **수정 0**. 필요 시 "외부 데이터 주입 + 핀 색/상태" 옵션만 추가 | 회귀 위험(97KB 큰 파일) | 대안: 신규 `WarMapView`가 `stageMapMath`와 에셋 로더만 import(복붙 금지, 헬퍼 재사용) |
| C7 | `battles.mode` CHECK 제약 | **변경하지 않는 것을 권장**(5.3, 위험 R1). `mode='free'`로 생성하고 `territory_battles`로 식별 | 없음 | 사용자 선택 Q7 |

원칙 준수: 엔진(`app/Game/*`)·`RoomService`·캠페인 데이터·기존 마이그레이션은 **수정하지 않는다**.

---

## 5. 신규 DB 설계 초안

### 5.0 공통 규칙 / SQLite vs 운영 DB 주의
- 기존 마이그레이션 관례: `foreignId()->constrained()`, JSON 컬럼, `hasTable/hasColumn` 가드, 상태 문자열 + CHECK(SQLite는 테이블 재생성). **신규 테이블은 CHECK 없이 시작**(앱 레벨 검증), 필요 시 후속.
- 운영 DB 종류는 코드 상 확정 불가(`.env`는 sqlite). 단 기존 코드에 SQLite 전용 SQL이 있음(`MAX(a,b)` 스칼라 함수 - `BattleService::settle`). 신규 코드는 **DB 이식 가능한 쿼리만** 사용하고 SQLite 전용 구문 금지. 사용자에게 운영 DB 확인 필요(Q11).
- SQLite 주의: (a) 부분(partial) 유니크 인덱스는 MySQL 미지원 -> **"공성 중 영토당 1국" 같은 제약은 영토 행 컬럼(`siege_country_id`) + 조건부 UPDATE로 구현**하고 DB 부분 인덱스에 의존하지 않는다. (b) JSON 컬럼은 SQLite에서 TEXT, 쿼리 필터에 JSON 함수 사용 금지(필요한 값은 일반 컬럼으로). (c) 컬럼 DROP/CHECK 변경은 테이블 재생성 필요 -> 신규 테이블은 처음부터 필요한 컬럼 확보. (d) `unsignedBigInteger` FK + nullable unique는 SQLite/MySQL 모두 NULL 중복 허용 -> `battle_id` unique 용도로 사용 가능. (e) 동시 쓰기 직렬화: 프로젝트에 `app/Database/ImmediateSqliteConnector`(BEGIN IMMEDIATE) 존재 -> 영토 행 갱신은 트랜잭션 + 낙관적 `version`.
- 모든 시각은 UTC 저장, 일일 기준은 `Period`(KST 05:00).
- **데이터 중심**: 시나리오 정의(국가·영토·인접·규칙값)는 JSON 시드 파일(`database/data/war/*.json`, 신규)에서 로드해 `war_*` 정의 테이블에 upsert. 점수·점령도 수치는 `seasons.settings`(JSON) / `config/war.php`(신규) 설정값.

### 5.1 정의(시나리오 단위, 시즌 간 불변)
```
war_scenarios
  id, code(unique, 'imjin'), name, shelf_code('ch1' - 지도 메타 연결), map_view(json: 카메라 bounds·기본 줌),
  config(json: 점령/점수/정체/AI 기본값 - 시즌 settings의 기본), is_active, timestamps

war_countries                      -- 시나리오 소속 국가 정의
  id, scenario_id FK, code('joseon'|'japan') (2026-11-03 개편: 명은 국가가 아닌 조선 소속 원군 메타), name, color, emblem_key(null 가능),
  intro(text), traits(json: 군사 특성 설명·보조 효과 키), ai_profile(json: 성향 가중치),
  capital_def_id(null, 순환 FK 피하려 후설정), rep_hero_codes(json), unique(scenario_id, code)

war_territory_defs                 -- 영토 정의
  id, scenario_id FK, code, name, kind('normal'|'chokepoint'|'fortress'|'capital'),
  value(int 가치), defense_level(int 1~5), importance(int),
  lon(decimal), lat(decimal)        -- 핀 좌표(shelf 지도와 같은 좌표계)
  battle_map_code(string, maps.code 연결: 이 영토 전투에 쓸 전장),
  start_country_code, unique(scenario_id, code)

war_territory_links                -- 인접(무방향: a_id < b_id 로 1행 저장)
  scenario_id, a_def_id, b_def_id, unique(a_def_id, b_def_id)
```

### 5.2 시즌 인스턴스(진행 상태: 시즌 종료 시 초기화 대상)
```
seasons
  id, scenario_id FK, name, status('scheduled'|'active'|'ended'), start_at, end_at,
  settings(json: 점령도 증감·정체·점수표·AI 제한·승리조건 오버라이드),
  winner_country_id(null), unified(bool), ended_at, timestamps, index(status)

season_countries                   -- 시즌 내 국가 상태
  id, season_id FK, country_id FK(war_countries), is_ai(bool: 인원 0이거나 AI 운영 지정),
  score(int, 캐시), member_count(int, 캐시), ai_state(json: 일일 행동 카운트·쿨다운),
  eliminated_at(null), unique(season_id, country_id)

season_members                     -- 국가 소속(시즌당 1회)
  id, season_id FK, user_id FK, season_country_id FK, joined_at,
  contribution(int 캐시), rank_title(string), last_feed_id(int, 알림 커서),
  unique(season_id, user_id)       -- 소속 고정/변경 제한은 앱 규칙(+ 변경 이력은 audit_logs 재사용)

season_territories
  id, season_id FK, def_id FK(war_territory_defs), owner_season_country_id FK,
  state('peace'|'siege'|'recapture'), siege_season_country_id(null FK),
  occupation(unsigned tinyint 0~100... 등급별 필요치>100 대비 smallint),
  last_battle_at(null), version(낙관적 락), timestamps,
  unique(season_id, def_id), index(season_id, owner_season_country_id)

territory_battles                  -- 영토 전투 1건 = 1행 (플레이어/AI 공통, 점령 판정 근거)
  id, season_id, season_territory_id,
  battle_id(null unique FK battles: 플레이어 직접 전투; AI 시뮬은 null),
  source('player'|'ai_sim'), seed(bigint),
  attacker_sc_id, defender_sc_id,
  attacker_user_id(null=AI), defender_user_id(null=AI 수비대/고스트 주인 없음),
  defender_kind('ghost'|'garrison'),
  result('att_win'|'def_win'|'draw'|'abandoned'),
  occ_before, occ_after, occ_delta, captured(bool),
  settled_at, created_at, index(season_id, created_at), index(attacker_user_id), index(defender_user_id)

territory_occupation_logs          -- 점령도·소유권 변경 이력(요구: 변경 이력)
  id, season_id, season_territory_id, kind('battle'|'stagnation'|'capture'|'admin'|'reset'),
  occ_before, occ_after, owner_before_sc_id, owner_after_sc_id, ref_territory_battle_id(null), created_at

territory_contributions            -- 개인 기여 원장
  id, season_id, user_id, season_country_id, season_territory_id,
  territory_battle_id(null FK), kind('attack_win'|'defend_win'|'capture_bonus'|'capital_bonus'),
  points(int), decayed(bool), created_at, unique(territory_battle_id, user_id, kind)  -- 중복 지급 방지

season_country_scores              -- 국가 점수 원장(합계는 season_countries.score 캐시)
  id, season_id, season_country_id, kind('capture'|'defense'|'bonus'|'adjust'),
  points, season_territory_id(null), territory_battle_id(null), created_at

war_events                         -- 전황 피드/알림(폴링 조회; 푸시 인프라 불필요)
  id, season_id, type('capture'|'siege_start'|'capital_siege'|'capital_fall'|'defense_win'|'ai_attack'|'season_end'…),
  season_country_id(null: 전체 공개), season_territory_id(null), user_id(null), payload(json), created_at,
  index(season_id, id)

war_defense_squads (선택, MVP 5단계 이후)  -- 방어 편성 지정
  id, season_id, user_id, hero_slots(json), unique(season_id, user_id)
```
기존 모델 관계: `season_members.user_id -> users`, `territory_battles.battle_id -> battles`, 편성은 `parties/user_heroes` 읽기 전용 참조(복제 저장은 고스트 스냅샷이 필요한 경우 `territory_battles`가 아닌 `battles.deployment`/`state`에 이미 보관됨). 영웅·성장 테이블은 시즌과 무관 -> **초기화 대상 아님**.

### 5.3 기존 테이블 변경 (최소: 0~1건)
- **권장: 기존 테이블 변경 없음.** `battles.mode='free'`로 생성하고 `territory_battles.battle_id`로 시즌 전투를 식별(정산 훅 C1). 이유: `battles_mode_enum`(`stage|free|pvp`) CHECK 제약이 SQLite에 이미 박혀 있어(`2026_10_31_000700_add_check_constraints.php`) 'war' 모드를 추가하려면 battles 테이블 재생성(FK OFF + 복사 + DROP, 운영 위험)이 필요하다.
- 대안(Q7): 'war' 모드를 정식 추가 - 테이블 재생성 마이그레이션 + 운영 DB 백업 선행. 코드 가독성은 좋아지나 위험·작업량 증가.
- 시즌 전적 통합 보기가 필요하면 `battles`에 컬럼 추가 대신 `territory_battles` 조인으로 처리.

### 5.4 영구 보존 vs 초기화
- **영구**: `seasons`, `season_countries`(최종 점수·순위), `season_members`, `territory_battles`, `territory_contributions`, `season_country_scores`, `territory_occupation_logs`, `war_events`(주요 이벤트), 신규 `season_results`/`season_user_results`(우승국·순위·MVP·국가 영웅·통일 여부·개인 기여 순위의 **요약 스냅샷 JSON** - 시즌 종료 시 1회 기록).
- **초기화 = 새 시즌 행을 만드는 것**: 소유권·점령도·공성·점수는 `season_id`로 분리돼 있어 "이전 시즌 삭제 없이" 새 `season_territories`를 시드하면 된다 -> 초기화 로직이 사실상 필요 없고 기록 보존이 자동 충족.
- 유지: 개인 전적(`battles`), 영웅/육성, 업적(후속).

---

## 6. 서버·클라이언트 역할 분리

### 6.1 원칙
- **모든 판정·확정은 서버**: 공격 가능 여부, 전투 승패(기존 엔진), 점령도 증감, 소유권 이전, 점수/기여도, 시간 판정(서버 UTC `now()`).
- 클라이언트는 표시·입력만. 클라가 보내는 것은 "어느 영토를 어떤 편성으로 공격" 요청과 기존 전투 행동뿐이며 **결과를 보고하는 API는 만들지 않는다**.

### 6.2 플레이어 비동기 공격 흐름 (기존 API 재사용 범위)
1. `POST /api/war/territories/{id}/attack` (신규): 서버 검증(국가 소속·인접 적국·공성 가능·일일 공격 한도·쿨다운) 후 **방어 고스트 결정**(해당 영토 수비 플레이어 중 후보 선정 -> 없으면 AI 수비대) -> 영웅 편성 검증(`ProgressionService::validateParty`) -> `ArmyBuilder`로 진영 조립 -> `battles` 행 생성(solo 방과 같은 구조, 방 없음) + `territory_battles(battle_id)` 예약.
2. 배치/전투: **기존 `GET /api/battles/{id}` · `POST /api/battles/{id}/actions` · `/units/{u}/moves` · `/abandon` · `/bot-turn` · `/result` 그대로**. side b는 서버가 `HeuristicBot`으로 진행(`BattleService::botTurn`). 제한시간 없음(solo와 동일) -> 비동기 친화적.
   - 단, 기존 `/battles/{id}/deployment`(PUT/GET)는 스테이지 의존(`deploymentInfo`가 stage 사용)이므로, 시즌 배치는 신규 `/api/war/attacks/{id}/deployment`(내부에서 `RoomService::deployment`와 같은 검증 로직 재사용)로 두고, **MVP는 자동 배치(`defaultPositions`)로 시작**하는 선택지(Q6).
3. 종료 시 `settle()` 훅(C1) -> `WarService::settleBattle()`: **한 DB 트랜잭션**에서 `territory_battles.settled_at` 조건부 UPDATE(중복 방지) -> 점령도 증감(설정값) -> 100 도달 시 소유권 이전(요구 8단계 순서) -> 점수·기여도 원장 -> 이력·이벤트 -> 캐시 갱신.
4. 포기/이탈 = `abandoned`(패배 0 변화), 중복 호출 멱등.

### 6.3 방어(온라인/오프라인) 처리
- 방어자는 항상 **고스트(방어자의 현재 편성 스냅샷을 AI가 운용)**: 온라인 여부 무관 동일 로직 -> "오프라인 자동 방어"는 추가 개발 없이 충족되고, 규칙(승패·점령도)도 직접 전투와 동일.
- 고스트 선정: 해당 영토에 "방어 지정" 또는 최근 활동한 아군 멤버 중 일일 방어 횟수 한도 내 1명을 무작위/라운드로빈 선택. 없으면 AI 수비대(`defense_level`로 `ArmyBuilder::randomParty`/NPC 편성 + 레벨 보정).
- 방어자 접속 시 "내 고스트가 방어한 전투" 목록(`territory_battles.defender_user_id`)을 `war_events`로 표시(요구: 접속 시 결과 표시).
- 방어자 고스트의 **자동 방어 횟수·점령도 변화 제한**: 일일 고스트 방어 인정 횟수(예: 사용자당 3회/일) 초과분은 전투는 성립하나 **기여도 미지급**, 영토당 일일 점령도 순감소 상한(Q9).
- (후속 옵션) 실시간 수비 참여: 기존 pvp 방(`RoomService`)을 영토 전투용으로 쓰는 확장은 가능하나 MVP 범위 밖.

### 6.4 AI 자동 전투를 서버에서 돌릴 수 있는가
- **가능**: `Simulator::run($state)`가 순수 PHP로 양측 봇 완주. 상태 조립 -> `Engine::initialState` + `ArmyBuilder` 양측 -> `run` -> `state['winner']`. DB 미사용이라 전투 로그가 필요 없으면 `battles` 행도 생략 가능(요약만 `territory_battles(source='ai_sim', seed)`에 기록, 시드 저장으로 재현 가능).
- **미확인(실측 필요)**: 1건당 CPU 시간·메모리(Engine 2160줄, 400~4000 스텝). 설계상 5분 주기 틱에서 AI 전투 상한을 두고(예: 틱당 최대 N건) 구현 단계 3에서 `game:simulate`로 1건 소요 시간 측정 후 N 확정.
- 승패 동률/미종료(`safetySteps` 초과): `draw`(점령도 변화 0)로 처리.

### 6.5 스케줄러/큐 필요성 판단
- **Laravel scheduler로 충분, 큐 워커는 불필요(권장)**. 근거: 유저 50~100명, 영토 12~20, AI 국가 최대 3, AI 행동은 "주기당 소수 건"이라 틱 내 동기 처리가 가능. 별도 큐 서버·Redis 도입 불필요.
- 필요한 것: (1) 프로세스 1개 `php artisan schedule:work`(docker compose에 서비스 추가 또는 운영 cron `* * * * * schedule:run`), (2) `war:tick` 명령: `withoutOverlapping()` + `onOneServer` 불필요(단일 서버), 멱등 설계.
- 틱 주기 제안: **5분마다** 가벼운 처리(정체 판정, 시즌 종료/시작 판정, 알림 정리) + **AI 행동은 설정 주기(예: 영토/국가당 2~4시간 쿨다운)** 로만 실행 -> "모든 AI를 실시간 계산하지 않음" 충족.
- DB 큐(`jobs`)는 AI 전투가 무거워질 때 `dispatch()`로 분산하는 **확장 옵션**으로만 남긴다(이미 테이블/설정 존재, 코드 추가 최소).
- 실패 복구: 틱은 상태 기반(`last_battle_at`, `ai_state`)으로 "지금 해야 할 일"을 재계산하므로 놓친 틱이 있어도 다음 틱에서 따라잡는다. 한 틱 처리량 상한으로 폭주 방지.

### 6.6 AI가 플레이어 기여를 과도하게 빼앗지 않는 장치 (추가 요구 반영, 전부 설정값)
1. **AI 행동 빈도 상한**: 국가당 일일 AI 공격 N회(기본 2~3), 영토당 AI 공격 쿨다운(기본 6h), 틱당 AI 전투 상한.
2. **AI 점령도 상한(마지막 한 걸음은 플레이어)**: AI가 올릴 수 있는 점령도는 상한(기본 80)까지. 100 도달(소유 이전)은 플레이어 전투에서만. 예외: 해당 국가 구성원이 0명(AI 전용 국가)이거나 공성이 `ai_finish_after_hours`(기본 72h) 이상 정체된 경우 AI가 마무리 허용.
3. **플레이어 공성 우선권**: 플레이어가 공성 중인 영토는 AI가 같은 편이 아닌 한 개입/공격 불가(요구상 영토당 공성국 1개 원칙과 일관). 플레이어 활동이 최근 N시간 있는 영토는 AI가 방어 측만 수행.
4. **인원 균형 보정**: 플레이어가 많은 국가의 AI 활동 비중을 줄이고(국가 `is_ai` 또는 활동 인원 비례 가중치), 부족 국가는 AI가 보완. 가중치는 `ai_profile`/`settings`로 조절.
5. **점수 분리**: AI 점령 점수는 국가 점수에는 가산하되 개인 기여도에는 미가산(기본). 계급/MVP는 플레이어만 대상.
6. **AI는 수도/요충지 선공 금지 단계 설정**(시즌 초반 N일 보호 기간)으로 초반 쏠림 방지.

### 6.7 국가 AI 전략 (MVP 단순 규칙)
틱에서 국가별로: 후보 = (인접 적 영토 중 공성 가능) -> 점수 = 가치 x 성향 가중치(일본 공격성/거점 우선, 조선 수복·수도 방어, 명 "참전 조건(조선 영토 손실 N 이상 시 활성화)") x 전력 비 보정 -> 상한 내에서 1건 선택 -> `Simulator` 전투 -> `WarService`의 동일 점령도 규칙 호출(**플레이어·AI 점령 판정 코드 경로 동일**). 위기 이벤트(수도 인접 공성 시 `war_events` 'capital_siege' -> "한양이 포위되었습니다!").

### 6.8 무결성 체크리스트 구현 위치
| 요구 | 구현 |
|---|---|
| 서버 검증 | 결과는 엔진이 확정, 신규 결과 보고 API 없음 |
| 중복 결과/점령 방지 | `territory_battles.battle_id` unique + `settled_at` 조건부 UPDATE + 영토 `version` |
| 동일 상대 반복 감소 | `DailyCounter` 키 `war_pair:{a}:{b}`로 기여도 가중 감쇠(`decayed`) |
| 같은 국가 내부 점령 제외 | 공격 검증에서 거부(인접 "적국"만) |
| 승패 조작/윈트레이딩 | 최소 라운드·양측 행동 판정(`pvpRecognized` 모델), 이상 징후는 `audit_logs` |
| 이탈 처리 | 포기 = 패배(변화 0), 기여도 없음 |
| 국가 변경 제한 | 시즌당 1회 소속, 변경은 관리자/시즌 시작 전 |
| 오프라인 자동 전투 제한 | 6.3 한도 |
| 점령도 변경 이력 | `territory_occupation_logs` |
| 소유권·점령도 트랜잭션 | `DB::transaction` + `version` 낙관적 락, 실패 시 재시도 |

---

## 7. 단계별 구현 순서와 완료 기준 (요구 MVP 7단계 매핑)

| 단계 | 내용 | 산출물/변경 | 완료 기준 |
|---|---|---|---|
| 1 | 분석·설계 | 본 문서 | 사용자가 미결 사항(9장)에 답하고 설계 승인 |
| 2 | 자유 대전 확인·유지 | **코드 변경 없음**. 회귀 확인(기존 `tests`의 Room 관련 테스트 실행, 수동 시나리오) + 미구현 4건 처리 여부 사용자 결정 | 방 생성/목록/참가/전투가 현행과 동일 동작 확인 |
| 3 | 시즌 기본 | 마이그레이션(5.1·5.2 일부: scenarios/countries/defs/links/seasons/season_countries/season_members), 임진 시나리오 JSON 시드, 국가 선택 API, 시즌 허브·세계지도(읽기 전용) | 시즌 시작 상태 생성, 국가 선택·소속 고정, 세계지도에 12~20 영토와 소유국 색 표시, 캠페인/영웅 육성 회귀 이상 없음 |
| 4 | 영토 점령 | `season_territories`·`territory_battles`·로그·기여도 테이블, `WarService`, `WarBattleService`, 정산 훅 C1, 공격 UI, 공성/점령도 표시 | 인접 적 영토만 공격 가능, 기존 엔진으로 전투, 승 시 점령도 +20, 100에서 소유 이전, 중복 정산 불가, 수도 점령 처리, 정체 처리(`war:tick` 기본 + scheduler 서비스 C3/C4) |
| 5 | AI 국가 전쟁 | `WarAiService`, `Simulator` 자동 전투, 고스트 방어, 오프라인 한도, AI 제한 장치(6.6) | AI끼리 공방으로 소유권 변경, AI가 플레이어 영토 침공, 오프라인 방어 결과 접속 시 표시, AI 점령도 상한 동작, 틱 처리시간 측정 |
| 6 | 국가 경쟁 | 점수 원장·캐시, 기여도, 랭킹 보드(`RankingService` 패턴), `war_events` 알림, 위기 이벤트 | 국가 점수·개인 기여도 집계 정확, 순위 표시, 점령/수도 포위 알림 |
| 7 | 시즌 종료 | 천하통일 판정, 시간 종료 순위, `season_results` 스냅샷, 다음 시즌 생성, 관리자 도구 | 종료 조건에서 시즌이 ended, 기록 영구 보존, 새 시즌이 초기 상태로 시작, 이전 시즌 조회 가능 |

각 단계 공통: 캠페인·자유 대전 회귀 테스트(기존 테스트 스위트) 유지, 마이그레이션은 롤백 가능(`down()`), API 문서 주석 동기화, FE 변경은 강화면 실화면 검증, 운영 반영 전 백업.
요구 완료 기준 15개 중 1~2(캠페인·자유 대전 유지)는 모든 단계의 회귀 조건이며 3~15는 단계 3~7에 위 표대로 배분된다.

---

## 8. 임진왜란 시즌 지도 자산 재사용 가능성

| 구성 | 재사용 | 비고 |
|---|---|---|
| 기본 지도 이미지 | **가능**: `map.oldworld.base`(+ `decor.sea/border`), 모바일 변형 | `StageMapView`가 동일 레이어 사용. 새 이미지 불필요 |
| 지도 투영/카메라/라벨 배치 | **가능**: `stageMapMath`(project/fitBounds/declutter/placeLabels), `StageMapView` 연출 | 별도 컴포넌트 신규 시에도 수학 유틸을 import(복붙 금지) |
| 국가 정의(조선/일본/명 색·국호 판·근거수준) | **가능**: `shelf_territories.json`의 `ch1_joseon/japan/ming` | `war_countries` 시드의 색·emblem 출처로 사용 |
| 세력권 폴리곤 | **부분**: 국가 단위 폴리곤과 시점별 점령 스냅샷은 있으나 **12~20개 영토 단위 폴리곤은 없음** | 해결안: MVP는 **핀 + 반투명 원/라벨**(영토 좌표 `lon/lat`는 `war_territory_defs`에 신규 작성, 송서사/안아트 검수)로 소유국 색 표시. 폴리곤 분할은 후속(안아트/송서사) |
| 영토 목록·인접·수치 | **신규 데이터 필요**: 한양·평양·부산·한산도·의주·교토·베이징… (`manifest.json`에 기준점 15곳 메모 존재: 서울·평양·부산·의주·한산도·명량·쓰시마·히젠나고야·교토·에도·베이징·상하이… ) | 시드 JSON 작성 주체: 송서사(역사 근거) + 임밸런(가치/방어 난이도) |
| 지도 범위 | ch1 `battle_map_range` 123.5~131.5E/32.5~40.5N는 조선 한정. 일본(교토 135E)·명(베이징 116E) 포함하려면 `war_scenarios.map_view` bounds를 별도 지정 | 코드 변경 아님(데이터) |
| 영토 전투용 전장 | `war_territory_defs.battle_map_code`로 기존 8종 프리셋(평야/성/산/강/숲) 매핑 | 신규 맵 제작 불필요. 해전(한산도·명량)은 water 속성 지원 migration(`..._200100_add_water_attrs...`)이 있어 이후 매핑 가능 |
| 주의 | 지도 라벨 정책(당대 국명, 현대 분쟁 표기 금지, 근거 수준 표기)은 `shelf_map_meta.json`의 `label_policy`를 시즌 지도에도 적용 | 영토 이름은 as_of 연도의 당대 지명 |

타 에이전트가 ch18 데이터·초상화·compose를 작업 중이므로 본 설계는 `shelf_*` 파일을 **수정하지 않고** 읽기 전용 참조만 가정한다(시즌 전용 JSON은 `database/data/war/` 신규 경로).

---

## 9. 기술 위험과 해결안

| ID | 위험 | 해결안 |
|---|---|---|
| R1 | `battles.mode` CHECK(SQLite 재생성 필요) | `mode='free'` + `territory_battles` 연결로 회피(5.3). 정식 모드 추가 시 백업 선행 |
| R2 | SQLite 단일 라이터: 틱의 AI 전투와 유저 요청이 쓰기 충돌 | 틱은 트랜잭션을 짧게(전투 계산은 트랜잭션 밖, 확정만 트랜잭션), 영토 `version` 낙관적 락 + 재시도, `ImmediateSqliteConnector` 활용, 틱당 처리량 상한 |
| R3 | AI 전투 CPU 시간(실측 미확인) | 단계 5 초기에 `game:simulate`로 측정, 틱당 상한 N, 필요 시 DB 큐 분산 |
| R4 | 스테이지 의존 코드(`deploymentInfo` 등)를 시즌 전투에 재사용 불가 | 시즌 전용 배치 엔드포인트가 `RoomService`/`BattleService`의 공용 메서드(`validatePlacementList`, `defaultPositions`)를 호출. 어려우면 MVP 자동 배치 |
| R5 | `settle()` 훅이 기존 보상 로직과 얽힘 | 훅을 함수 최상단 1곳, 시즌 전투는 보상 0·return. 기존 테스트로 회귀 확인 |
| R6 | 영토 폴리곤 부재 | 핀 기반 표시(8장), 폴리곤은 후속 |
| R7 | 스케줄러 프로세스 부재(compose) | 단계 4에서 `scheduler` 서비스 추가(승인 후). 장애 시 수동 `php artisan war:tick`으로 따라잡기 가능 |
| R8 | 소수 인원 국가 불균형/한쪽 쏠림 | 국가 선택 화면에 인원·AI 여부 표시 + 권고, 가입 인원 편차 상한 옵션(Q4), AI 보완, 점수 외 1인당 지표 표시 |
| R9 | 승패 조작(담합으로 같은 국가 외 친구에게 져주기) | 최소 라운드·양측 행동 판정, 동일 상대 반복 감쇠, 일일 방어/공격 한도, 이상 징후 감사 로그 |
| R10 | 시간 기준 혼란(UTC vs KST) | 저장 UTC, 일일 경계는 `Period` 재사용, 정체 48h는 UTC 절대 시간 |
| R11 | `Lobby.js`/`StageMapView.js` 병행 수정 충돌 | FE는 신규 씬/파일 중심, 기존 파일은 진입 버튼 1곳 수정만 |
| R12 | 운영 DB가 SQLite가 아닐 수 있음 | 이식 가능한 쿼리만 사용(5.0), 운영 DB 확인 Q11 |
| R13 | 시즌 데이터 설정값 하드코딩 위험 | `war_scenarios.config`/`seasons.settings`/`config/war.php` 3단 오버라이드 |
| R14 | 방어 고스트로 특정 유저 영웅이 반복 노출/피로 | 고스트 후보 라운드로빈, 사용자 옵트아웃(후속), 일일 방어 인정 한도 |

---

## 10. 사용자에게 물을 미결 사항 (권장 기본값 포함)

| # | 질문 | 권장 기본값 |
|---|---|---|
| Q1 | 자유 대전 미구현 4건(비밀번호·친구 초대·규칙 옵션·개인 전적 조회)을 시즌 작업과 별도 트랙으로 할지, 아예 보류할지 | 별도 트랙으로 분리, 시즌 MVP 이후. 개인 전적 조회만 가볍게 먼저 |
| Q2 | 방어 방식: 방어자 편성 = 현재 `parties` 스냅샷 자동 사용(권장) vs 별도 "방어 편성" 지정 | MVP는 현재 파티 자동, 방어 편성 지정은 단계 5 이후 |
| Q3 | 국가 선택 시점/변경: 시즌 시작 후 최초 1회 선택, 이후 시즌 종료까지 변경 불가(관리자 예외) | 그대로 |
| Q4 | 인원 불균형 보정: 가입 인원 편차 상한(예: 최다국 - 최소국 > 3명이면 최다국 신규 가입 제한) 적용 여부 | 편차 상한 3 + 인원 표시 |
| Q5 | 국가 군사 특성(조선 궁병 등)을 전투력에 반영할지 | **전투 스탯 가산 없음**(과대 격차 금지). 대표 영웅·시작 영웅 지급/표시·기여도 보너스 등 비전투 특성만 |
| Q6 | 시즌 전투 배치: 자동 배치(MVP) vs 기존 배치 화면 재사용 | MVP 자동 배치 -> 단계 4 후반에 배치 화면 연결 |
| Q7 | `battles.mode`에 'war' 정식 추가(테이블 재생성) vs 기존 'free' + 연결 테이블 | 후자(위험 낮음) |
| Q8 | 점령도 수치: 공격 승 +20 / 방어 승 -20 / 무승부 0 / 필요치 100 / 정체 48h 후 일 -10, AI 점령도 상한 80, AI 일일 공격 2회, 영토 쿨다운 6h | 요구 수치 + AI 제한 기본값 |
| Q9 | 일일 한도: 개인 공격 하루 5회, 고스트 방어 인정 3회, 동일 상대 반복 기여도 감쇠 시작 3회 | 위 값 |
| Q10 | 시즌 기간·종료 조건: 기간(예: 4주), 천하통일 = 일본·명 vs 조선 어느 쪽 기준? (적국 수도 전부 점령) | 4주, 적 수도 2곳 점령 또는 시간 종료 점수 순위 |
| Q11 | 운영 DB 종류(SQLite 유지 vs MySQL 등)와 운영 스케줄러 방식(cron / docker 서비스) | SQLite 유지 가정, 이식 가능한 쿼리 작성 |
| Q12 | "imjin_battle"가 가리키는 자산이 ch1 서가(shelf) + 임진 10 스테이지 데이터인지 확인. 영토 12~20개 목록(한양·평양·부산 등)과 인접·가치 시드 작성 주체(송서사/임밸런) 승인 | ch1 shelf 사용, 시드 JSON은 송서사·임밸런 작성 후 박백엔 로더 |
| Q13 | 영토 표시: 핀+원(MVP) vs 영토별 폴리곤(안아트/송서사 추가 작업) | 핀+원 |
| Q14 | AI 점령의 개인 기여도 지급 여부 | 국가 점수만, 개인 기여도 미지급 |
| Q15 | 알림 방식: 접속 시 폴링/피드(권장) vs 외부 푸시(이메일 등, 인프라 없음) | 접속 시 피드 + 시즌 허브 뱃지 |
| Q16 | 게스트 계정의 시즌 참가 허용 여부 | 회원만(게스트는 다계정 위험) |
| Q17 | 시즌 전투 보상(골드/경험치): 없음 vs 소량 | 영웅 경험치만 소량(스테이지 대비 축소), 일일 상한은 `DailyCounter` |

---

## 11. 근거 파일 인덱스
- 요구: `docs/SEASON_WAR_REQUEST.md`
- API 문서 원본: `routes/api.php` (상단 주석), `routes/web.php`, `routes/console.php`
- 전투/방: `app/Services/BattleService.php`, `app/Services/RoomService.php`, `app/Http/Controllers/RoomController.php`, `GameController.php`
- 엔진/AI: `app/Game/Engine.php`, `HeuristicBot.php`, `Simulator.php`, `ArmyBuilder.php`, `EnemyV3Adapter.php`, `BotDeployer.php`
- 설정: `config/game.php`(room, free_limits, quests, ranking, bot 등), `config/app.php`(UTC)
- DB: `database/migrations/2026_10_31_000200_*`, `_000300_*`(rooms), `_000480_*`/`_000490_*`(랭킹/인정), `_000700_*`(CHECK), `0001_01_01_000002_create_jobs_table.php`
- 보조: `app/Support/Period.php`, `DailyCounter.php`, `app/Database/ImmediateSqliteConnector.php`, `app/Services/RankingService.php`, `QuestService.php`
- 지도/FE: `resources/js/game/ui/StageMapView.js`, `ui/stageMapMath.js`, `campaign/campaignMapData.js`, `data/shelf_map_meta.json`, `data/shelf_territories.json`, `database/data/SHELF_MAP_META_SPEC.md`, `SHELF_TERRITORIES_SPEC.md`, `public/assets/manifest.json`(`map.oldworld.*`), `scenes/Lobby.js`, `scenes/Room.js`, `scenes/Battle.js`
- 인프라: `docker-compose.yml`, `.env`

## 12. 이번 조사의 한계 (미확인 항목)
- 운영 DB 종류, AI 자동 전투 1건의 실제 소요 시간, 기존 테스트 스위트 통과 상태, `map.oldworld.*` 실제 에셋 파일 존재 여부는 실행/실측하지 않았다(코드·manifest 문자열 근거만).
- `battles_mode_enum` CHECK가 실제 DB에 적용되어 있는지는 마이그레이션 소스 기준이며 DB 스키마를 직접 조회하지 않았다.
- FE 씬 내부(예: Room.js의 UI 세부)는 구조 수준으로만 확인했다.
