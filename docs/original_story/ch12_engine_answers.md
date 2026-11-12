# ch12 엔진 확인 5건 답변 (박백엔, 2026-11-03)

근거는 코드 위치와 테스트로 표기한다. 대상: `stages_ch12_redcliff.json` engine_checks 5건.

## 1. `@protagonist` 를 `in_zone` 의 unit 으로 쓸 수 있는가 -> 가능
- `EventConditions::matches`: `@protagonist` = side a 이고 영웅 코드가 `protagonist_` 로 시작하는 유닛. `in_zone.unit` 은 문자열 참조면 통과(`zone()` 이 `unit` 또는 `side` 중 하나 필수).
- 구역은 `rect:[x1,y1,x2,y2]`(0-based, x1<=x2, y1<=y2) 또는 `tiles:[[x,y]..]`(최대 60칸) 중 하나만 인정된다.
- **주의(현재 ch12 JSON)**: `zone_ref` 와 빈 `tiles:[]` 는 엔진이 모르는 필드/빈 구역이라 cue 전체가 무효로 버려진다(`Cues::dropped` 경고 로그). 맵 확정 후 좌표를 `rect`/`tiles` 로 직접 채워 넣어야 한다(시드 JSON 에 zone_ref 를 남겨 두려면 저작용 필드로만 쓰고 시드 전 치환).
- 사용 예: `{"on":{"turn":1,"when":{"type":"in_zone","unit":"@protagonist","rect":[20,3,22,5]}},"do":"terrain_change",...}` (`on.turn:1` = 1라운드부터 매 행동 후 평가, 조건 충족 첫 시점에 1회 발동).

## 2. `set_flag` -> 같은 패스의 `flag` 조건 spawn -> 가능(정의 순서 의존)
- `Cues::runCues` 는 cues 배열을 정의 순서대로 한 번 훑고, `set_flag` 는 `state.flags` 를 즉시 바꾼다. 따라서 **set_flag cue 를 flag 조건 cue 보다 앞에** 두면 같은 패스에서 발동한다. 뒤에 두면 다음 행동 후 평가에서 발동한다.
- 조건: `{"type":"flag","key":"gate_open","value":true}` (key `^[a-z0-9_]{1,32}$`, value 기본 true). set_flag cue: `{"do":"set_flag","key":"gate_open","value":true}`.
- 테스트: `CutsceneCuesTest::test_set_flag_뒤에_정의된_flag_조건_spawn은_같은_패스에서_count만큼_생성된다`.

## 3. `spawn hero:guan_yu` 를 소유와 무관하게 npc_ally 로 -> 가능
- `spawn.hero` 는 `BattleService::registerCueHeroResolver` 가 heroes 테이블에서 코드로 찾는다(유저 소유 여부 미확인). 일반 영웅 행도 가능.
- `side:"a"` + `hero` 이면 `npc_ally` 기본 true(조종 불가 AI 아군, id `n<k>`). 명시하려면 `"npc_ally":true`.
- 주의: 같은 영웅을 플레이어가 출전시켜도 막지 않는다(중복 가능). 필요하면 `forced_heroes`/출전 제한으로 별도 처리. `hero:guan_yu` 참조는 필드의 첫 일치 유닛을 가리킨다.
- 영웅 병종은 영웅 행의 unit_type 을 따른다(cue 의 unit_type 불필요/지정 불가: hero 와 unit_type 은 택일).

## 4. `terrain_change` 의 `int_gate_open` 유효성 -> `to` 는 지형 코드, `tile` 은 FE 렌더용 이름
- `to` 는 `terrains` 에 있는 코드여야 한다(`[a-z0-9_]{1,24}`). 현재: plain, forest, mountain, water, castle, shallows, bridge, road, swamp, snow_desert, cliff, wall, village, sea, reef, harbor, sand, hill, void, rift_plank. 성문 열림은 `"to":"castle"`(또는 `road`)이 맞다.
- `tile` 은 선택 필드로 형식만 본다(정수 0~9999 또는 `[A-Za-z0-9_]{1,40}`). 이름은 엔진이 검증하지 않고 FE(tv2 타일 매니페스트)에 있어야 보인다 -> `int_gate_open` 이 타일셋에 있는지는 맵디자이너/안아트 확인 사항. 없으면 `to` 지형의 기본 타일로 표시된다.
- 점유 칸(유닛이 서 있음)은 건너뛴다(`skipped`). 칸은 최대 40개, 맵 안 정수 좌표.

## 5. `spawn` 의 `count` -> 미지원이었음, 이번에 최소 구현
- 구현: 병종 spawn(`unit_type`)에 `count`(정수 1~6, 기본 1) 추가. 같은 `tiles`(최대 12칸 후보) 에서 가장 가까운 빈 칸에 차례로 `count` 기 생성, 칸이 부족하면 해당 기는 skipped reinforce. 영웅 spawn 은 `count>1` 이면 cue 무효(영웅은 1명).
- 사용 예: `{"on":{"turn":5,"when":{...}},"do":"spawn","side":"a","unit_type":"cavalry","tiles":[[3,4],[4,4],[3,5],[4,5]],"count":3,"level":8,"ready":true,"tag":"main_force","npc_ally":true}`
- 테스트: 위 2번 테스트가 count=2 생성과 영웅 count>1 무효 처리를 같이 확인한다. 위치: `app/Game/Cues.php` spawn 정규화/실행.

## 부가: ch12 로스터
- `database/data/npc_roster_shelf_ch12.json` 신규(npc_lu_su·npc_cheng_pu·npc_huang_gai, 임밸런 stats 제안값 그대로). 개발 DB 에는 `game:seed-shelf --chapters=21,22 --with-npc`(--update 없음 = 신규 code 만 추가)로 3행 적재 완료. 기존 NPC·ch21/22 스테이지는 변경 없음.
- ch12 스테이지 시드는 `game:seed-shelf --chapters=12` 로 가능하되(19 미만 챕터는 현재 `--chapters` 검증에서 거부됨 -> ch12 시드 시 범위 확장 필요), 맵 확정 전이라 보류.
