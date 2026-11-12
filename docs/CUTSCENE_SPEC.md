# 전투 연출(cue) 스펙 (CUTSCENE_SPEC)

- 작성: 박백엔, 2026-11-02. 조사: `docs/CUTSCENE_SURVEY.md`. 범위: 1단계(say/camera/sfx/shake) + 2단계(move) + 3단계(fire, 시각 전용). 4단계(판정 있는 화염)는 제외.
- 원칙: **cue 는 판정에 영향이 없다.** 유일한 상태 변화는 `move` 의 유닛 좌표(+facing)뿐이다. `stages.rules.cues` 가 없는 전투(방 모드 PvP·solo 포함)는 서버 동작·이벤트가 기존과 100% 같다.
- 코드: `app/Game/Cues.php`, `Engine::scriptMove`, `BattleService`(호출 4곳 + 뷰 1곳). 기존 `stages.triggers`(증원)·`BattleStory`(대사) 경로는 무변경.

## 1. 데이터 스키마 (stages.rules.cues)

저장 위치: 기존 JSON 컬럼 `stages.rules` 의 `cues` 키(마이그레이션 없음). `GameSeed` 의 스테이지 JSON 에 `"rules": {"cues": [...]}` 로 쓰면 그대로 저장된다(`Engine::sanitizeStageRules` 가 `cues` 키는 맵 규칙 검증에서 제외). 전투 생성 시 정규화되어 `state.cues` 에 고정된다(이후 데이터 변경에 불변). 잘못된 항목은 예외 없이 건너뛴다.

```json
{"rules": {"cues": [
  {"on": {"battle_start": true}, "do": "say", "speaker": "narrator", "text": "안개가 짙게 깔렸다."},
  {"on": {"turn": 3}, "do": "camera", "tile": [12, 7], "ms": 500},
  {"on": {"turn": 3}, "do": "move", "unit": "b5", "to": [10, 7]},
  {"on": {"turn": 3}, "do": "fire", "tiles": [[9,7],[10,7],[11,7]], "turns": 2},
  {"on": {"turn": 3}, "do": "sfx", "key": "sfx_fire"},
  {"on": {"turn": 3}, "do": "shake", "power": 3, "ms": 400},
  {"on": {"turn": 5}, "do": "camera", "mode": "restore"}
]}}
```

### on (조건, 1회만 발동)
- `{"battle_start": true}`: 배치 확정(confirm) 직후.
- `{"turn": N}` (정수 1~99): 현재 라운드 >= N 이 되는 첫 시점. 라운드가 올라가는 적 턴 마지막 행동 직후(= 아군 턴 시작 직전)에 발동한다. `turn: 1` 은 battle_start 와 같은 시점.
- 같은 시점에 여러 개면 정의 순서대로 발동하고 이벤트 순서도 그대로다.

### do 별 필드
| do | 필드 | 규칙 |
|---|---|---|
| say | `text`(필수, 200자 이하), `speaker?`, `expr?` | 대사 한 줄(판정 없음). BattleDialogue 줄 형식(speaker/expr/text)과 같다 |
| camera | `mode`: `focus`(기본)/`overview`/`restore`, `tile:[x,y]`(focus 필수), `ms`(0~3000, 기본 500), `unit?`, `follow?` | 유닛 추적은 아래 "camera 유닛 기준·추적" |
| sfx | `key`(필수) | FE 효과음 키 |
| shake | `power`(1~10, 기본 3), `ms`(100~2000, 기본 400) | |
| move | `unit`(필수: 유닛 id `b5` 또는 `hero:<code>`), `to:[x,y]` | 아래 2단계 규칙 |
| fire | `tiles:[[x,y]...]`(최대 40), `turns`(1~10) | 아래 3단계 규칙 |
| spawn | 아래 7절 | 증원 병사/이름 있는 영웅 난입·합류 |
| set_flag | `key`(`[a-z0-9_]{1,32}`), `value`(bool/int, 기본 true) | 무음 cue(이벤트 없음): `state.flags[key]` 만 바꾼다. 6절 `flag` 조건과 짝 |

## 2. 이벤트 형식 (FE 계약)

cue 이벤트는 기존 이벤트 배열(`submitAction` 응답의 `events`, 봇 턴 이벤트 포함)에 다른 이벤트와 같은 `seq` 체계로 섞여 들어온다(`seq`, `type` 등 공통 필드 동일). FE 는 순서대로 `fx.enqueue` 재생하면 된다.

### camera 유닛 기준·추적 (FE 구현 2026-11-03 윤프론, 서버 통과는 미구현)
- 스키마(제안): `{"do":"camera","mode":"focus","unit":"b5"|"hero:<code>"|"UNIT@x,y","tile":[x,y]?,"follow":true?,"ms":500}`.
- FE(`fx/CuePlayer.js`): 이벤트의 `unit_id`(서버가 해석한 유닛 id, 우선) 또는 `unit`(유닛 id / `hero:<code>` = `u.hero`·`u.npc_ref` 생존 유닛)으로 **재생 시점의 유닛 화면 위치**에 focus. 유닛을 못 찾으면 `tile` 로 폴백, 둘 다 없으면 건너뜀.
- `follow:true`: focus 도착 후 그 유닛을 매 프레임 화면 중앙으로 따라간다(뒤이은 `move` cue 의 걷기 tween 추적). 해제: 다음 camera cue(모든 mode), 사용자 드래그·핀치, 연출 큐 종료, 유닛 소멸. 흔들림 중에는 잠시 멈춘다. restore 지점은 기존과 같이 첫 camera cue 직전.
- 서버 요청(박백엔): `Cues::camera` 가 현재 `mode`/`ms`/`tile` 만 통과시키고 focus 는 `tile` 필수다. ① `unit`(문자열)이 있으면 `tile` 없이도 통과 ② 발동 시 `resolveUnit` 으로 해석한 id 를 `unit_id` 로 실어 보냄(`UNIT@x,y` 자리표시는 FE 가 해석 불가) ③ `follow`(bool) 통과. 반영 전에는 `unit`/`follow` 가 서버에서 버려져 기존 tile focus 로만 동작한다.
- 서버 구현(2026-11-03): `unit`(문자열)이 있으면 `tile` 없이도 focus cue 가 통과하고(둘 다 없으면 무효), `follow:true` 는 그대로 통과한다. 발동 시 `resolveUnit`(`hero:<code>` 는 `u.hero`·`u.npc_ref`)으로 해석한 유닛 id 가 있으면 이벤트에 `unit_id` 로 실린다. `UNIT@x,y` 는 배치 직후 `bindUnitPlaceholders` 가 실제 적 유닛 id 로 치환한다.

### type = `cue` (say/camera/sfx/shake/fire/fire_end)
공통: `type:"cue"`, `do`, `cue_id`("c<정의 인덱스>"). 나머지 공통 필드(`actor_unit_id` 등)는 null/기본값이다.

```json
{"seq":41,"type":"cue","do":"say","cue_id":"c0","speaker":"narrator","expr":null,"text":"안개가 짙게 깔렸다."}
{"seq":42,"type":"cue","do":"camera","cue_id":"c1","mode":"focus","ms":500,"tile":[12,7]}
{"seq":43,"type":"cue","do":"camera","cue_id":"c6","mode":"restore","ms":500}
{"seq":44,"type":"cue","do":"sfx","cue_id":"c4","key":"sfx_fire"}
{"seq":45,"type":"cue","do":"shake","cue_id":"c5","power":3,"ms":400}
{"seq":46,"type":"cue","do":"fire","cue_id":"c3","tiles":[[9,7],[10,7],[11,7]],"turns":2,"until_turn":5}
{"seq":60,"type":"cue","do":"fire_end","cue_id":"c3"}
```
- `fire`: 맵 밖 칸은 서버가 제거한다. `until_turn` 라운드 시작 시점(그 라운드의 첫 이벤트 발생 시)에 `fire_end` 가 온다. 불은 **시각 전용**: 이동·피해·AI·지형 판정에 영향 없음, 칸에 유닛이 있어도 된다.
- 알 수 없는 `do` 는 FE 가 무시하면 된다(전방 호환).

### type = `move` (do:"move", 기존 이벤트 재사용)
```json
{"seq":50,"type":"move","actor_unit_id":"b5","from":[14,7],"to":[10,7],"terrain":"plain","terrain_def_pct":0,"facing":"left","cue_id":"c2","scripted":true}
```
- 기존 `move` 와 형식이 같고 `scripted:true`, `cue_id` 가 추가된다. FE 는 수정 없이 걷기 애니메이션이 재생된다(`pathBetween` 경로 없으면 순간이동 폴백).
- 서버 규칙: 이동력·`reachable`·`moved` 검사를 건너뛰고, 맵 안·빈 칸·해당 병종이 통행 가능한 지형만 확인한다. 유닛이 없거나 죽었거나 칸이 막혔으면 **이벤트 없이 조용히 건너뛴다**(재시도 없음). 이동 후처리 중 **capture 도달형(hold_turns=0) 점령 판정만** 일반 이동과 동일하게 즉시 실행한다(cue move 로 아군이 목표 칸에 서면 그 자리에서 승리하며, 전투가 끝나면 남은 cue 는 발동하지 않는다). 돌격 `move_from`·반격·ZOC 등은 발동하지 않으며 `moved` 플래그도 바꾸지 않는다. 좌표와 `facing`(facing 시스템 on 일 때)만 바뀐다.

## 3. 뷰 (재접속·새로고침 복원)
전투 조회/배치확정 응답의 `battle.cues`:
```json
{"start": [ /* battle_start 에서 발동한 cue·move 이벤트 */ ], "fires": [{"cue_id":"c3","tiles":[[9,7]],"until_turn":5}]}
```
- `start`: 배치 확정 응답에서 FE 가 재생할 시작 연출. (confirm 응답의 `events` 로는 오지 않으므로 `battle.cues.start` 를 읽을 것. 이미 본 연출 재생 방지는 FE 가 sessionStorage 로 처리, `story_events` 와 같은 방식.)
- `fires`: 현재 타고 있는 불(`turn < until_turn`). 재접속 시 불 오버레이 복원용.
- cues 가 없는 전투는 `{"start":[],"fires":[]}`.

## 4. 호출 시점 (서버)
`BattleService`: 배치 확정 직후(battle_start), 플레이어 행동 직후, 봇 행동마다(`BattleStory::collect` 와 같은 자리). 상태가 종료(`finished`)면 발동하지 않는다.

## 5. 알려진 한계
- `on.turn` 은 "라운드 N 이상 첫 시점"이다. 플레이어 행동으로 라운드가 안 오르는 경우 발동이 다음 행동으로 밀리지 않는다(라운드는 적 턴 끝에서 오른다). 알(교대 행동) 모드도 같은 collect 호출이라 동일.
- move 도착 칸에 유닛이 있으면 건너뛴다(FE 는 move 이벤트 없음 = 아무 일 없음으로 처리).
- 시드 단계 cues 검증: 무효 항목 수는 `Cues::dropped` 경고, 액터 cue 는 14절 정적 검증.
- 시범 데이터는 넣지 않았다. 검증은 `tests/Feature/CutsceneCuesTest.php`(스테이지 rules 에 cues 주입).

## 6. 조건 기반 발동 (on.when, 2026-11-02 추가, `app/Game/EventConditions.php`)
- `on` 에 `when`(조건 트리)을 주면 "라운드 >= `on.turn`(기본 1) 이후 조건이 참이 되는 첫 시점"에 1회 발동한다(행동마다 재평가, 거짓이면 대기). `battle_start` 와 같이 쓰지 않는다(when 이 우선). 잘못된 조건은 `normalize` 에서 cue 째로 버려진다(기존 규칙과 동일). `when` 이 없는 cue·cues 가 없는 전투는 동작 불변.
- 조건 노드: `{all:[..]}` `{any:[..]}` `{not:node}`(깊이 4, 자식 10개 이하) 또는 leaf `{type, ...}`.

| type | 필드 | 의미 |
|---|---|---|
| turn_gte | `value`(1~99) | 현재 라운드 >= value |
| hp_pct_lte | `unit`, `pct`(0~100) | 살아있는 해당 유닛 중 HP% <= pct 가 하나라도 있음 |
| defeated | `unit` | 해당 유닛이 격파됨(`state.defeated`, cues/story 가 있는 전투만 기록) |
| alive_count | `side`(a/b), `op`(lte/gte/eq, 기본 lte), `value`, `kind`(any/hero/troop) | 진영 생존 유닛 수 |
| in_zone | `unit` 또는 `side` + `rect:[x1,y1,x2,y2]` 또는 `tiles:[[x,y]..]` | 해당 유닛이 구역 안 |
| adjacent | `a`, `b` | a 유닛과 b 유닛(맨해튼 거리 1 이하, 서로 다른 유닛). 전투 이벤트 데이터의 `units_adjacent` 트리거가 이 리프로 평가됨 |
| unit_distance_lte | `a`, `b`, `distance`(0~40) | a·b 유닛 사이 맨해튼 거리가 distance 이하(서로 다른 유닛). `a` 에 `player_hero_any`(플레이어 편성 영웅: 아군 영웅/지휘관 중 NPC·병사 제외) 참조 가능. 전투 이벤트 `unit_distance_lte` 트리거 |
| unit_enter_tile | `side`(a\|b; 데이터의 enemy=b, player=a), `tile_tag` | 해당 진영 유닛이 `state.tile_tags[tag]`(칸 목록) 위에 있음. 태그 칸을 제공하는 전투에서만 참이다. 현재 제공 맵: `su_ch1_s2_jeongamjin`(sandbar 19칸), `su_ch1_s3_hansando`(lure_zone 41칸), 개발 DB 반영 완료(2026-11-03). ch23·ch24 맵(`maps_ch23_ch24.json`, 2026-11-03)도 `meta.tile_tags` 를 가진다: ch23_s1 quay 30·causeway_low 12 / s2 plaza 24·plaza_center 4·beach_supply 32·landing 8 / s3 low_hill 4·hill_near 90·ridge_far 92 / s4 ridge_center 8·left_wing 36·camp_rear 120·ridge_line 106·slope 110 / s5 bridgehead 8·rear_road 17·wagon 2·bridge 10·kent_entry 3 / ch24_s1 ford 16·north_bank 40·south_entry 32 / s2 forest_edge 32·signal_point 12·fork 1·narrow_path 61·mill 29 / s3(ch24_s4 공용) hill_crest 60·oak_belt 63·camp_rear 48·brook_crossing 4·defense_line 83·enemy_camp 13. 그 외 맵은 항상 false. 최초 1회는 이벤트 발화 기록이 보장. 전투 이벤트 `unit_enter_tile` 트리거 |

**맵 tile_tags (2026-11-03)**: 맵 `meta.tile_tags = {"태그": [[x,y],...]}`(태그 소문자·숫자·밑줄 1~32자, 맵 안 정수 칸, 태그당 200칸, 최대 16태그)를 스테이지 전투 생성 시 `state.tile_tags` 로 복사한다(`EventConditions::normalizeTileTags`). 키가 없으면 state 불변. `unit_enter_tile` 이 이 목록을 쓴다. 맵디자이너 요구 목록(현재 필요한 것만):

| 스테이지 / 맵 | 태그 | 용도 | 비고 |
|---|---|---|---|
| ch1_s2 / su_ch1_s2_jeongamjin(40x30) | `sandbar` | 이벤트 ch1_s2_e01 "모래톱의 첫 부딪침": 적 유닛이 모래톱 칸에 처음 올라선 직후 발화 | 강 가운데 모래톱 칸 전부(통행 가능 칸) |
| ch1_s3 / su_ch1_s3_hansando(40x30) | `lure_zone` | 이벤트 ch1_s3_e01 "적이 바다로 들어서다": 적이 바다 중앙 유인 해역에 처음 들어선 직후 발화 | 유인 해역 수상 칸 영역 |

참고(다른 트리거 `units_on_tiles`/`turn_phase_start` 용 태그, 평가기 미구현 또는 효과 위치용이라 이번 범위 아님): ch1_s2_e05 `ford`·`forest_side`, ch1_s4_e05 `outer_north`, ch1_s5_e03 `gate_target`, ch1_s5_e04 `ally_rear`.
| flag | `key`, `value`(기본 true) | `set_flag` 로 켠 플래그가 값과 같음 |

- `unit` 참조: 유닛 id(`b5`, 아군 NPC `n0`) | `hero:<code>` | `enemy_commander` | `ally_commander`. `adjacent.b`/`in_zone.side` 는 `side:a`/`side:b` 도 가능.
- `BattleStory` 연동: 스토리 이벤트 `trigger` 에 `{"type":"cond","when":<조건 트리>}` 를 쓸 수 있다(이벤트당 1회는 기존 `story_events` 규칙). 승패 종료 후에는 기존대로 `battle_end` 만 허용.
- 예: `{"on":{"turn":2,"when":{"all":[{"type":"hp_pct_lte","unit":"enemy_commander","pct":30},{"not":{"type":"defeated","unit":"hero:gwak_jae_u"}}]}},"do":"say","speaker":"hero:gwak_jae_u","text":"..."}`
- 한계: `dialogue_conditions.json` 의 보유/편성/클리어 횟수(owned/party_has/clear_count 등)는 전투 상태가 아니라 FE 평가기 몫이며 이 평가기는 전투 상태 조건만 다룬다. `defeated` 는 이 문서 적용 이전에 시작된 진행 중 전투에서는 기록이 없다.

## 7. 유닛 생성 cue (do:"spawn", 2026-11-02, `Engine::spawnUnit`)
```json
{"on":{"battle_start":true},"do":"spawn","side":"a","hero":"gwak_jae_u","tile":[8,9],"tag":"guest","ready":false}
{"on":{"turn":3,"when":{"type":"hp_pct_lte","unit":"enemy_commander","pct":50}},"do":"spawn","side":"b","unit_type":"cavalry","tiles":[[20,4],[21,4]],"tag":"ambush","ready":true,"level":3}
```
| 필드 | 규칙 |
|---|---|
| `side` | `a`/`b`(기본 b) |
| `hero` 또는 `unit_type` | 정확히 하나. hero=이름 있는 영웅(영웅 행은 서버가 조회, 단독 유닛 kind hero), unit_type=병사(지휘관 `<side>0` 소속, 문화권 계승) |
| `tile:[x,y]` 또는 `tiles:[[x,y]..]`(최대 12) | 우선 칸. 막혔으면 가장 가까운 빈 통행 칸(BFS). 갈 수 있는 칸이 없으면 생성하지 않고 `skipped:true` |
| `level?` | 1~99, 기본 = 해당 진영 지휘관 레벨 |
| `ready?` | 기본 **false**: 생성된 그 턴에는 행동 불가(`moved/acted=true`), 다음 턴 시작에 초기화. true 면 즉시 행동 가능 |
| `tag?` | `[a-z0-9_]{1,24}`. 유닛에 보존(후속 ai_pattern/force_retreat 대상 지정용, 아직 소비처 없음) |
| `npc_ally?` | 기본 = (hero 이고 side a). true 면 AI 조종 아군(id `n0..`, 플레이어 행동 403, all_alive 제외). false 인 side a 영웅은 플레이어가 조종하는 합류 영웅(id `a<N>`) |
| `must_survive?` | true 면 사망 즉시 패배 |
- 참고(적 편성): `enemy_squad.squads[].hold_until_turn`(정수 1~99)을 주면 그 부대(지휘관+소속 병사)는 해당 라운드 전까지 HeuristicBot 이 행동을 건너뛰어 제자리 대기한다(공격 사거리 안에 아군이 있어도 해제하지 않는 단순 대기). 아군이 먼저 공격하면 반격은 엔진 규칙대로 한다.
- 참고(적 편성): `addGenericSide` 는 부대(`enemy_squad` 및 `squads[]`)마다 `units[]` 의 병종을 그 지휘관 병종(`troop_type`, 생략 시 `unit_type`)으로 통일한다(길이 유지, 혼합 입력은 경고 로그). 병종을 섞으려면 부대를 나누거나 cue `spawn` 을 쓴다.
- 참고(주인공 병종): `stages.rules.protagonist_troop`(병종 코드, 예: `naval`)을 주면 `@protagonist` 로 출전하는 주인공의 unit_type/troop_type 이 그 값으로 덮인다(`BattleService::forcedOf`, 해전 이순신 수군 대여와 같은 경로). 알 수 없는 병종은 무시, 시드(`game:seed-main`)는 거부. 스테이지 `forced_heroes` 형식은 `["@protagonist"]` 그대로라 FE 판정 불변.
- 참고(적 편성): 부대(`enemy_squad`, `squads[]`)에 선택 필드 `soldier_display_name_ko`(1~20자)를 주면 그 부대 병사 유닛의 표시명(`name`)이 된다(없으면 병종 기본 이름). 지휘관은 `commander.display_name_ko`.
- 발동은 6절 `when`/`turn`/`battle_start` 규칙을 그대로 쓴다. **`battle_start`·`turn:1` 허용**(cue 는 배치 확정 이후 collect 에서 실행). `stages.triggers`(증원 spawn)는 기존대로 turn >= 2 만 허용한다(라운드 증가 시점에만 평가되므로).
- 이벤트: FE 호환을 위해 기존 `reinforce` 형식을 재사용한다: `{type:"reinforce", unit_ids:[id], side, turn, zone:null, delayed:0, tag, hero(코드|null), ready, cue_id}`. 생성 실패는 `unit_ids:[]`, `skipped:true`. FE 는 새 id 를 뷰에 추가하고 `npc_ally`/`tag` 유닛 필드를 읽으면 된다.
- 알 수 없는 병종·영웅(영웅 조회기가 없는 시뮬레이터 포함)은 이벤트 없이 건너뛴다. 병사 성장률은 전투 생성 시 `state.troop_growth` 에 고정된다.
- 한계: ready=false 는 생성 턴의 행동만 막는다(표시용 "등장 연출"은 FE 몫). `ai_pattern`/`force_retreat` 는 미구현.

## 8. 지형 변경 cue (do:"terrain_change", 2026-11-03, `Cues.php`)

- 스키마: `{"on":{...},"do":"terrain_change","tiles":[[x,y],...(최대 40)],"to":"<terrains 의 지형 코드>"}`. 발동 규칙은 6절과 동일(turn/battle_start/when).
- 선택 필드 `tile`: tv2 전역 정수 인덱스(0~9999) 또는 이름 문자열(`[a-z0-9_]{1,40}`). 형식이 틀리면 무시. 있으면 이벤트 `changed[]` 와 `state.tile_patch[]` 항목에 `tile` 로 그대로 실려 FE 가 지형 코드 기본 타일 대신 이 타일로 그린다(판정은 `to` 만 사용). 없으면 응답 형태는 기존과 동일.
  - `tile` 이름 문자열 검증은 `/^[a-z0-9_]{1,40}\z/` (개행 끼워넣기 거부).
- 서버: `state.tiles` 를 직접 바꿔 이동·방어 판정이 즉시 갱신된다. **유닛이 서 있는 칸·맵 밖·정의되지 않은 지형은 건너뛴다**(예외 없음). 변경분은 `state.tile_patch[{x,y,to}]` 에 누적된다.
- 이벤트: `{type:"cue", do:"terrain_change", cue_id, to, changed:[{x,y,from,to}], skipped:[[x,y]]}`. 뷰: `battle.cues.tile_patch`(재접속 복원용; cues 가 없는 스테이지는 기존 형식 유지). `battle.tiles` 는 항상 현재 지형이다.
- FE 요청(윤프론): `cue/terrain_change` 이벤트의 `changed` 칸 재렌더 + 이동 범위 캐시 무효화, 재접속 시 `cues.tile_patch` 적용(`tile_layer` decor 는 정적이므로 해당 칸 덮어쓰기). 안아트: 변경 지형 타일(먹물·붕괴 등) 필요 시.
- FE 재렌더(2026-11-03 확인): unity32 지면은 `UnityGround.patchCells` 가 칸 전체(바닥+mid)를 새 타일로 덮고, tile_layer.v2 전경(유닛 위 캔버스)의 그 칸 덧그림도 지운다(산봉우리·나무 꼭대기 잔상 방지). 실내 맵에서 `to:"wall"` 만 주면 기본 타일이 야외 성벽(idx 13)이라 `tile`(예: `int_wallface_bot_C2` = 2215)을 함께 주는 것을 권장한다.
- 연출 이동(`move`) 한정: 아군 NPC 가 cue 로 이동하면 그 턴 `moved=true` 가 되어 같은 턴 AI(`allyPhase`)가 건너뛴다(지정 칸에 머묾).

## 9. 퇴각 cue·서브 목표 (2026-11-03)

### 9-1. 퇴각 (`do:"retreat"`, `Engine::retreatUnit`)
- 스키마: `{"on":{...},"do":"retreat","unit":"<유닛 참조>"}` (참조: 유닛 id | `hero:<code>` | `enemy_commander` 제외 불가 — 지휘관은 퇴각 불가). 발동 규칙은 6절과 동일.
- 동작: 유닛을 전장에서 제거한다. **사망이 아니다**: `kill` 이벤트·격파(`state.defeated`) 기록·지휘관/`must_survive` 패배 판정 없음. 지휘관(`kind=commander`)·캠페인 주인공은 퇴각하지 않고 조용히 건너뛴다. squad 모드면 소속 부대원도 함께 제거된다.
- 이벤트: `{type:"unit_removed", actor_unit_id, unit_ids:[...], reason:"retreat", side, hero, cue_id}` (FE 요청 윤프론: 해당 유닛 스프라이트 퇴장 연출 후 제거, `collapse` 처리와 유사). 기록: `state.retreated[id]={side,kind,hero,turn}`.
- 조건: EventConditions 에 `{"type":"retreated","unit":"<참조>"}` 추가(퇴각한 유닛이 있는가). `alive_count` 는 자연히 줄어든다.
- 활용: 진린·원균 퇴각, 사자(전령) 이탈 등. `set_flag` + `when.retreated` 로 후속 대사를 건다.

### 9-2. 서브 목표 (`stages.rules.sub_objectives`, `app/Game/SubObjectives.php`)
- 스키마(최대 6개, `id` `[a-z0-9_]{1,32}` 유일, `label` 40자 이하, 잘못된 항목은 조용히 버림):
  - `{"id":"escort","type":"unit_survive","unit":"hero:npc_won_gyun","label":"원균을 지켜라"}`: 대상이 격파되면 즉시 실패, 종료 시 격파되지 않았으면 달성(퇴각은 생존으로 본다).
  - `{"id":"hold","type":"hold_zone","tiles":[[x,y],...<=20],"turns":N(1~30),"label":"거점 사수"}`: 라운드가 바뀔 때마다 아군(NPC 포함) 유닛이 tiles 중 한 칸에 서 있으면 연속 카운트 +1(비면 0), N 도달 시 달성 확정.
  - `{"id":"desks","type":"protect_tiles","tiles":[[x,y],...<=20],"max_breach":N(0~20,기본 0),"turns":T(선택,1~30),"label":"책상 보호"}`: 적(side b) 유닛이 tiles 중 한 칸에 서면 그 칸을 침범으로 1회 기록(칸당 1회)하고, 침범 칸 수가 max_breach 를 넘으면 즉시 실패. turns 가 있으면 라운드 T 도달 시 달성 확정, 없으면 종료 시 실패하지 않았으면 달성. 승패 영향 없음(별점 sub_objective 연동만).
  - protect_tiles 침범 집계 시점: 엔진 행동 직후(봇 포함) `tick` 시점에 칸 위에 서 있는 적만 센다. 이동 중 경유만 하고 멈추지 않은 칸은 침범이 아니다. 같은 칸은 1회만 센다.
- 승패와 무관한 보너스 판정이다. 별점 연동: `stages.star_conditions` 에 `{"type":"sub_objective","id":"escort"}` 를 넣으면 달성 시 별 조건 충족(`BattleService::starsFromConditions`; 시드 검증 허용 목록 `GameSeedCh1`/`GameSeedCh18` 갱신).
- 뷰: `battle.sub_objectives=[{id,label,type,status:pending|met|failed,progress,target}]` (종료 후에는 최종 판정). FE 요청(윤프론): 전투 HUD 에 서브 목표 목록·진행(`progress/target`) 표시.
- API: `GET /api/stages` 항목에 `sub_objectives:[{id,label,type}]`(stage rules 기준, 없으면 [])가 추가되어 `star_conditions` 의 `sub_objective` id 와 매칭해 라벨을 표시한다. 전투 종료 뷰는 **승리(winner a)일 때만** pending 을 달성 판정(`met()`)하고, 패배·무승부에서는 이미 확정된 met 만 met, 나머지는 failed.
- 구현 메모: 격파 기록(`state.defeated`)은 `sub_objectives` 가 있는 전투에서도 남긴다. 갱신은 `Cues::collect` 시작부(`SubObjectives::tick`)에서 한다. `sanitizeStageRules` 는 `sub_objectives` 를 맵 규칙 검증에서 제외한다.
- 미구현(보류): 시야 제한/암전, `ai_pattern`, 호위 대상의 이동 AI(NPC 는 휴리스틱 AI 그대로).

## 10. 승패 규칙 (stages.rules.win_mode / win_conditions / lose_conditions, 2026-11-03, `app/Game/StageRules.php`)

기존 스테이지(키 없음)는 동작·응답 불변. 전투 생성 시 `state.win_rule` / `state.lose_rules` 에 고정된다. 평가는 `Cues::collect` 시점(플레이어·봇·아군 NPC 행동 직후, cue 발동 직후 포함).

```json
{"rules": {
  "win_mode": "all",
  "win_conditions": [
    {"label": "배가 나루에 도착", "latch": false, "when": {"type": "in_zone", "unit": "hero:npc_baetsagong", "tiles": [[10,3],[10,4]]}}
  ],
  "lose_conditions": [
    {"id": "door_first", "label": "공백병이 문을 먼저 통과", "when": {"any": [{"type": "in_zone", "side": "b", "tiles": [[13,6],[14,6]]}]}}
  ]
}}
```
- `win_mode: "all"`: 기본 목표(`stages.objective` 의 capture 도달·점유 / survive_turns / 적 지휘관 격파) 달성 **AND** `win_conditions` 전부 참 → 승리(순서 무관: 한쪽이 먼저 채워지면 대기). 예) capture 도달 + `{"type":"defeated","unit":"enemy_commander"}`.
- `win_mode: "only"`: 기본 목표 달성은 승리로 **인정하지 않는다**(지휘관 격파·점령도 무시). `win_conditions` 전부 참일 때만 승리. 예) 배 NPC 가 in_zone 에 닿아야만 승리(주인공 단독 도달 불가).
- `win_conditions[]` 항목: `when`(필수, 6절 EventConditions 조건 트리), `label?`(40자), `latch?`(true 면 한 번 참이 된 뒤 계속 참). 1~6개. 모드가 없거나 조건이 0개면 규칙 없음.
- `lose_conditions[]` 항목: `when`(필수), `id?`, `label?`. 전투 중 조건이 참이 되는 즉시 패배(승리 판정이 같은 시점에 성립하면 승리 우선). "문을 먼저 통과하면 패배" 는 적(`side:b`) in_zone 으로 선언한다. 한계: 칸 위에 **멈춘** 순간만 판정(경유 통과는 못 잡음 → 문 안쪽 칸/`rect` 를 함께 지정).
- 두 모드 모두 턴 상한(max_turns)에 도달하면 HP 비교 대신 **패배**.
- 이벤트: 규칙으로 끝나면 `battle_end{winner, reason:"objective"(승) | "objective_lost"(패), rule:"win_all"|"win_only"|<lose id>, label?}` (reason 은 FE 기존 메시지 재사용).
- 뷰: 승리/패배 규칙이 있을 때만 `battle.stage_rules = {mode, primary(기본 목표 달성 기록), conditions:[{label,met}], lose:[label...]}`. `lose_conditions` 만 있는 스테이지는 `mode:"default"`, `conditions:[]`, `primary` 생략(기본 목표 + 패배 조건 표시). 규칙이 전혀 없으면 키 자체가 없다 (FE 요청 윤프론: 목표 패널에 조건 체크리스트 표시).
- `defeated` 조건은 이 규칙이 있는 전투에서도 격파 기록을 남긴다. 시드(`game:seed-main`)는 유효하지 않은 win/lose 항목이 있으면 거부(조용히 버려지면 승리가 쉬워지므로).

## 11. 아군 NPC 경로 이동 AI (ally_npcs[].route, `app/Game/RouteAi.php`)
```json
{"hero": "npc_baetsagong", "x": 6, "y": 4, "unit_type": "naval", "must_survive": true,
 "route": {"waypoints": [[10,3]], "from_turn": 2, "move_cap": 2}}
```
- `waypoints`(1~8 칸), `from_turn`(1~99, 기본 1: 그 라운드부터 이동), `move_cap`(1~12, 턴당 이동 비용 상한, 기본 = 유닛 이동력).
- route 가 있는 NPC 는 휴리스틱 봇 대신 이 AI 로만 움직인다(공격·대기 없음). 아군 턴 시작(allyPhase)마다 다음 웨이포인트까지 최단 비용(지형 비용·병종 통행 반영, 다른 유닛은 장애물)이 가장 작아지는 도달 가능 칸으로 1회 이동. 지형이 바뀌면(terrain_change) 자동 우회. 마지막 웨이포인트에 닿으면 머문다. 혼잡·봉쇄로 우회로가 없으면 유닛을 무시한 거리 기준으로 접근하되, 어떤 경우에도 유닛 무시 거리가 현재보다 줄지 않는 칸(제자리 높이·후퇴)으로는 가지 않는다(2026-11-03: 수레가 왕복하던 문제 수정). 연출 `move` cue 로 옮겨진 턴은 건너뛰고 다음 턴부터 현재 칸에서 이어서 간다.
- 수로 이동(channel): `unit_type: "naval"` + 물 칸 웨이포인트. 수레: `unit_type: "heavy"`(늪 불통행 → 우회). 도달 승리와 짝: 10절 `win_mode:"only"` + in_zone.
- 데이터 적용(2026-11-03): ch102_s2 사공 수로(웨이포인트 [13,9],[14,9]), ch102_s3 앞 수레(→[18,7]) + 뒤 수레(turn 4 cue 로 [6,8] 지체), ch103_s1 수레 2기(→성문), ch103_s3 뱃사공 배(→나루, turn 4 cue 표류 후 복귀) + 나룻배(boat_2), ch103_s5 `lose_conditions`(문·성당 내부 적 진입). 수레·배 NPC 영웅 행: `npc_roster_main_a2/a3.json`(npc_cart_front/rear, npc_cart_1/2, npc_boat_2).

## 11-2. 적 부대 경로 이동 (enemy_squads[].route, 2026-11-03, `EnemyV3Adapter`·`ArmyBuilder`·`HeuristicBot`)
- 스키마(11절 RouteAi 와 동일): `enemy_squads[]` 항목(main/sub)에 `"route": {"waypoints": [[x,y]..1~8], "from_turn": 1~99(기본 1), "move_cap": 1~12(선택, 기본 유닛 이동력)}`. 무효 route 는 시드 단계(`EnemyV3Adapter::squad`)에서 오류로 중단된다.
- 예: `{"id":"B","role":"sub","leader":{"troop_type":"cavalry"},"soldiers":1,"cells":[[22,21],[14,19]],"route":{"waypoints":[[22,20],[30,20]],"from_turn":6,"move_cap":6}}` (ch24_s2 정찰대: 신호 지점에 닿으면 `lose_conditions` in_zone side b 로 패배).
- 그 부대의 지휘관과 병사 전원에 같은 route 가 붙고, `HeuristicBot` 은 route 유닛을 `RouteAi::step` 으로만 움직인다(공격·대기 없음, from_turn 전·마지막 웨이포인트 도착 후엔 제자리). route 없는 유닛은 기존 휴리스틱 그대로. 적 `ai` 문자열(advance_to_gate 등)은 메타데이터이며 행동에 영향이 없다.
- 진행 인덱스 `route.i` 는 `Engine::doMove` 가 웨이포인트에 선 순간 state 에 고정한다(봇 계획은 복사본에서 계산되므로, 고정하지 않으면 웨이포인트를 지나친 유닛이 되돌아가는 왕복이 생긴다).
- flee(후방 퇴각)는 마지막 웨이포인트를 후방 칸으로 두면 된다. 일반 전투 부대에 쓰면 접근한 아군에게도 반격하지 않으니 연출용 정찰·퇴각 부대에만 쓴다.

## 12. 물 차오름 연출 (terrain_change 의 `fx:"water_rise"`)
- 스키마: 8절 `terrain_change` 에 선택 필드 추가 — `{"on":{...},"do":"terrain_change","tiles":[[x,y]...],"to":"shallows"|"water"|"sea","fx":"water_rise","ms":1200,"dir":"up"}`.
  - `fx`: 현재 `"water_rise"` 만 허용(그 외 값은 무시되어 일반 terrain_change). `ms`: 200~3000(기본 1200, 차오르는 총 연출 시간). `dir`: `up|down|left|right`(차오르는 진행 방향, 생략 가능 → FE 가 tiles 순서/거리순).
- 판정: 8절과 동일(서 있는 칸·맵 밖·미정의 지형은 건너뜀, `state.tiles` 즉시 갱신, `tile_patch` 누적). 연출 필드는 판정에 영향 없음.
- 이벤트: `{type:"cue", do:"terrain_change", cue_id, to, changed:[{x,y,from,to}], skipped:[[x,y]], fx:"water_rise", ms, dir?}` — `fx`/`ms`/`dir` 는 지정된 경우에만 실린다. FE 가 fx 를 몰라도 기존대로 `changed` 칸을 재렌더하므로 하위 호환.
- FE 요청(윤프론): `fx==="water_rise"` 이면 `changed` 칸을 `dir` 순서로 `ms` 에 걸쳐 파문/수위 상승 애니메이션 후 새 타일로 교체(skipped 칸은 무시). 재접속 복원은 `cues.tile_patch` 그대로.

## 12. 적 지휘관 보호 AI (stages.rules.commander_guard, 2026-11-03, `HeuristicBot`)
- 기본 켜짐(config `game.bot.commander_guard`). 스테이지 단위로 끄려면 `rules: {"commander_guard": false}` (`StageRules::initialize` 가 `state.commander_guard_off` 설정, 맵 규칙 검증에서는 스크립트 키로 제외). 적용 대상은 컴퓨터 적 진영(b)의 지휘관·호위뿐이다.
- 동작(재조정판): (a) 다음 적 턴에 닿는 상대 예상 피해 합이 허용치(`commander_guard_risk` 기본 0.8 x 현재 HP, HP 40% 미만이면 `cg_low_risk` 0.3 x HP)를 넘을 때만, 그중 `cg_pct`%(기본 12, 시드 고정 rng) 확률로 보호 행동: 지금보다 위협이 낮고 주변 2칸에 아군이 있는 칸으로만 후퇴(없으면 제자리 교전), 확정 처치는 예외. (b) 지휘관 HP가 `cg_escort_hp`(0.7) 미만일 때 지휘관에 가장 가까운 `cg_escort_n`(2)기 후방 병사만 지휘관에서 적 쪽 2칸 지점으로 이동해 접근로를 막음. 지휘관에게 닿는 적은 점수 +40으로 우선 공격. 위험이 허용치 이하이면 기존 행동 그대로.
- 튜닝/측정용 옵션(`game:simulate --bot=key=value`): `commander_guard=0|1`, `commander_guard_risk`, `cg_low_risk`, `cg_pct`(보호 행동 확률, 승률 조절 다이얼), `cg_escort_n`, `cg_escort_hp`, `cg_retreat`, `cg_escort`, `cg_bonus`(각각 0이면 해당 부분만 끔).
- 측정(n=48/레벨, +0): ch1_s3 끔 81.2% -> 켬 66.7%(cg_pct=12), stage_01 16.7->16.7, ch1_s1 2.1->2.1, ch101_s3 64.6->66.7(cg_pct=15 기준). 시간초과 증가 없음. 지휘관 격파가 승리 경로인 스테이지는 임밸런 재측정 후 `commander_guard:false` 또는 `cg_pct`로 조정.

## 전투 view `rules_effective` (2026-11-03)
- 위치: 전투 view(`GET /api/battles/{id}`·액션 응답의 `battle`, 방 poll 의 view) 최상위. **맵/스테이지 rules 오버라이드가 있는 전투에만** 나오고 없으면 키 자체가 없다(FE 는 공개 규칙 `/api/profile` rules 기본값 사용).
- 구조: `{<오버라이드된 키>: 엔진이 실제 쓰는 값, ..., first_side:'a'|'b'}`. 키는 `Engine::MAP_RULE_KEYS`(second_atk_pct, facing_mult[side,back 기본과 병합], facing_cap, first_turn_move_cap, first_move_limit, highground_mult, forest_cover_mult, forest_cover_exclude_ranged_target, village_heal_pct, def_total_cap, dmg_mult, naval_water_atk_mult, boarded_atk_mult, naval_land_atk_mult) 중 오버라이드된 것만.
- FE 예측(`combat.js`)은 키가 있으면 공개 규칙 값 위에 덮어 쓴다(예: `R = {...publicRules, ...view.rules_effective}`). `second_atk_pct` 는 `first_side` 가 아닌 진영의 공격에 +%(교대 행동 모드에서는 무시).

## 13. 서가 제작용 엔진 지원 요약 (2026-11-03)
| 연출 | 지원 | 사용 예 (`stages.rules.cues[]`) |
|---|---|---|
| 턴 기반 지형 변경(다리 붕괴·조수) | 기존 `terrain_change` + `on.turn` | `{"on":{"turn":4},"do":"terrain_change","tiles":[[12,12],[13,12]],"to":"shallows","fx":"water_rise"}` (ch23_s1) |
| 화염 확산 | 기존 `fire`(불 연출) + `terrain_change` 를 라운드별로 나열 | 턴마다 `fire`+`terrain_change`(예: `to:"plain"`) cue 를 칸 집합만 바꿔 반복 작성 |
| 연출용 퇴장 | 기존 `retreat`(사망 아님, `retreated` 기록, 지휘관·주인공 불가) | `{"on":{"turn":7},"do":"retreat","unit":"hero:npc_gyrth_godwinson"}` (ch23_s4) |
| 연출용 사망 | **신규** `retreat` + `"reason":"death"` — 제거하되 `state.defeated` 에 기록(`defeated` 조건·`say` 화자 필터에 잡힘), 이벤트 `unit_removed.reason="death"` | `{"on":{"turn":5},"do":"retreat","reason":"death","unit":"hero:npc_x"}` |
| 이탈·배신(진영 전환) | **신규** `defect` — 유닛과 소속 병사의 진영을 `to`(a\|b, 기본 a)로 전환. a 로 가면 아군 NPC AI 가 조종(`npc_ally`), b 로 가면 적 봇. route/hold/must_survive 제거. 지휘관·주인공·같은 진영·사망 유닛은 조용히 건너뜀. 이벤트 `unit_defected{unit_ids,from,to,hero,cue_id}` | `{"on":{"turn":4,"when":{"type":"hp_pct_lte","unit":"enemy_commander","pct":50}},"do":"defect","unit":"hero:npc_ally_traitor","to":"a"}` |
| 신호 타일 도달 증원 | 기존 `spawn` + `on.when`(in_zone / unit_enter_tile, `@protagonist` 포함) | `{"on":{"turn":1,"when":{"type":"in_zone","unit":"@protagonist","rect":[20,3,22,5]}},"do":"spawn","side":"a","hero":"npc_aid","tile":[19,4],"ready":true}` 또는 `when:{"type":"unit_enter_tile","side":"a","tile_tag":"signal"}`(맵 `meta.tile_tags.signal`) |
| 아군 NPC 한정 참조 | **신규** 유닛 참조 `ally_npc:<code>` — `npc_ally` 유닛(ally_npcs/아군 spawn/defect→a)만 대상, 플레이어 소유 동일 코드 영웅 제외. 정확 일치(hero/npc_ref==code) 우선, 없으면 `npc_X`↔`X` 별칭. move/retreat/defect/set_hp/camera 및 조건(defeated·retreated·hp_pct_lte·in_zone·adjacent 등) 전부에서 동작. 격파·퇴각 기록에 `npc_ally:true` 가 함께 남는다. 대상이 없으면(플레이어가 실제 영웅 출전 → NPC 소환 생략) 조용히 무동작 | `{"on":{"turn":6},"do":"retreat","reason":"death","unit":"ally_npc:npc_zhang_fei"}` / `{"type":"defeated","unit":"ally_npc:zhang_fei"}` |
| 연출용 HP 조정 | **신규** `set_hp` `{unit, pct:1~100}` — 현재 hp 를 `ceil(max_hp*pct/100)` 이하로만 낮춤(최소 1, 사망·지휘관 패배·must_survive 판정 없음). 변화가 있을 때만 `cue{do:"set_hp",unit_id,hp_before,hp_after,max_hp}` 이벤트(현 FE 는 미지의 do 를 무시 → 상태 동기화로 반영) | `{"on":{"turn":5},"do":"set_hp","unit":"ally_npc:npc_guan_yu","pct":15}` |

FE 계약 알림: `unit_defected` 와 `unit_removed.reason="death"` 는 신규 이벤트/값이다(FE 처리 필요: 진영 색 전환, 사망 연출).

### 13-1. FE 계약 요약 (윤프론용)
- `unit_defected` : `{type:"unit_defected", actor_unit_id, unit_ids:[...], from:"b", to:"a"|"b", hero, cue_id}`. `unit_ids` 의 유닛(본인+소속 병사)의 진영 색·HP바 색을 `to` 기준으로 바꾼다. `to:"a"` 는 조종 불가 아군 NPC(자동 행동). 재접속 시에는 battle view 의 유닛 `side` 가 이미 갱신돼 있다.
- `unit_removed` : `reason` 이 `"retreat"` 이면 퇴장(페이드), `"death"` 이면 사망 연출(쓰러짐/소멸). 두 경우 모두 유닛은 view 에서 사라지며 death 는 `defeated` 조건에도 잡힌다.
- 두 이벤트 모두 모르는 FE 도 `units` 재동기화로 깨지지 않는다(연출만 누락).

### 13-2. spawn count (2026-11-03)
- 병종 spawn 에 `count`(정수 1~6, 기본 1) 지원. `tiles` 후보 중 가장 가까운 빈 칸에 차례로 생성하고 칸이 없으면 해당 기는 skipped reinforce. 영웅 spawn 은 count>1 이면 cue 무효. 상세·예: docs/original_story/ch12_engine_answers.md

### 13-3. must_survive 정책 (리뷰 반영)
- `retreat` + `reason:"death"` 대상이 `must_survive` 유닛(예: 호위 대상 아군 NPC)이면 `resolveDeath` 와 같이 즉시 패배 판정한다(아군이면 적 승리, 적(b)이면 StageRules 게이트 통과 시 승리). 연출 사망으로 생존 목표를 우회할 수 없다.
- 일반 `retreat`(reason 생략/retreat)는 의도된 퇴장이라 패배 판정을 하지 않는다(사망 기록 없음).
- `defect` 는 `must_survive` 유닛을 전환하지 않고 조용히 건너뛴다(생존 의무 해제 우회 방지). 지휘관·주인공과 같은 제외 대상.

### 13-4. 병사 외형 troop_look (윤프론 요청)
- 적 부대(`enemy_squad` 또는 `squads[]`)에 `soldier_look: "npc_xxx"`(`npc_[a-z0-9_]+`)를 두면 그 부대 병사 유닛의 상태에 `troop_look` 으로 복사되어 전투 뷰로 내려간다(squad on/off 무관). 키가 없고 부대 지휘관의 `npc_ref` 가 `npc_erased_line` 이면 같은 값이 자동으로 붙는다. 형식이 틀리면 키 생략. 지휘관/영웅 유닛에는 붙지 않는다.
- FE: `assets.js` 의 `NPC_TROOP_LOOK` 에 있는 코드면 해당 NPC 시트로 병사를 그린다(서버 `troop_look` 우선).

### 13-5. battle_cues 시드 병합 (서가 대사 -> stages.rules.cues)
- 서가 대사 JSON(`database/data/ch{N}_*.json`)의 `battle_cues.<stage_code>[]`(say/camera/sfx 등 전투 중 연출)는 `game:seed-shelf` 가 시드할 때 해당 스테이지 `rules.cues` 뒤에 붙여 저장한다. 인라인 텍스트(`text`)라 FE 에 별도 대사 사본은 필요 없다(FE `CuePlayer` 가 `say` cue 를 처리, `narrator` 는 caption).
- `on.when` 안의 `zone_ref` 는 스테이지 맵 `meta.tile_tags[zone_ref]` 좌표(최대 60칸)로 치환하고 `zone_ref` 키는 지운다. 태그가 없거나 엔진 정규화에서 버려질 cue 가 있으면 임의 보정 없이 시드가 "battle_cues 병합 불일치 N건" 목록과 함께 전체 롤백한다.
- 멱등: 병합 결과로 `rules.cues` 전체를 교체하므로 재시드(`--update`)해도 cue 가 중복되지 않는다. 기존 스테이지에 반영하려면 `--update` 필요.
- 이름 규칙: 대사의 `zone_ref` = 맵 `tile_tags` 키(맵디자이너 maps JSON `meta.tile_tags`), flag 조건 키 = 같은 스테이지 `set_flag` 키.

## 14. 연출용 액터·보행 cue (2026-11-08 서버 구현, 설계 `docs/CUTSCENE_ACTOR_WALK_20261108.md`)
판정 제외: 액터는 `state.actors`(유닛과 분리)에만 있고 승패·AI·AP/턴·ZOC·`unitAt`·집계에 잡히지 않는다. FE 가 모르는 `do` 는 무시하므로 서버 선배포 가능.

| do | 필드(정규화 후) | 비고 |
|---|---|---|
| `spawn_actor` | `actor`(`[a-z0-9_]{1,24}`), `tile`, `side`(a/b/n, 기본 n), `sprite`(`unit_type`\|`hero`\|`npc_ref` 정확히 1개), `name?`(20자), `facing?`, `fx`(fade/ship/door, 기본 fade) | id 당 전투 1회, 동시 12 상한(초과·재spawn·맵 밖은 런타임 무시) |
| `walk` | `actor`\|`unit`(정확히 하나), `path`(1~40칸) 또는 `to`, `speed`(1~12, 기본 4), `wait`(기본 true), `walk_id?`(입력 키는 `id`; cue 의 `id` 는 예약이라 `walk_id` 로 노출) | actor: 서버는 마지막 칸만 `state.actors` 에 반영. unit: 기존 `move` 이벤트(`scripted`)로 발행되며 `walk:true,path,speed,wait,walk_id` 가 추가됨. 경로 중간이 막혀 있으면(path 만 해당, 현재 상태 기준) 이동하지 않고 `cue{do:'walk',unit_id,path_ok:false}` 만 발행 |
| `despawn_actor` | `actor`, `fx`(fade/ship/door) | |
| `face` | `actor`\|`unit`, `dir` | unit 은 FE 표시 전용(서버 facing 불변) |
| `wait` | `ms`(100~5000) | |
| `parallel` | `cues`(1~6, 중첩 금지; walk/say/face/wait/spawn_actor/despawn_actor) | 하위 하나라도 무효면 그룹째 버림. 이벤트는 하위별로 나열되고 모두 같은 `group`(정수) 부여. FE 는 같은 `group` 의 연속 이벤트를 동시에 재생(하위가 건너뛰어져 개수는 줄 수 있음) |
| `say` 확장 | `actor?`, `during?`(walk_id), `focus?`(bool, 생략=FE 기본 true), 기존 필드 | 형식이 틀리면 해당 필드만 무시. `speaker:"actor:<id>"` 허용 |

- 이벤트 예: `{"type":"cue","do":"spawn_actor","actor":"r1","tile":[16,14],"side":"b","sprite":{"unit_type":"sword"},"name":null,"facing":"down","fx":"ship"}`, `{"type":"cue","do":"walk","actor":"r1","path":[[15,14],[14,14]],"speed":3,"wait":true,"walk_id":"w1","group":1}`.
- 뷰: `battle.cues.actors`(현재 살아 있는 액터 배열 `{id,side,name,sprite,x,y,facing,alive}`)는 액터가 있을 때만 포함된다(연출이 끝났으면 키 없음).
- 정적 검증: `Cues::validateActors`(중복 spawn·spawn 전 참조·despawn 후 사용·상한·미정의 `during`) / `Cues::validateWalk`(4방향 인접·맵 경계·병종 통행 지형·적대 시작 배치 칸 통과 금지·같은 편 시작 칸은 `ally_passthrough_cost`=0 오류/>0 경고·`to` 만 있으면 Dijkstra 경로 존재·정지 액터 칸 진입 금지·parallel 동시 진입·최종 위치와 시작 배치 충돌(despawn 면제)). `fx:ship` 액터는 수상 칸을 통행 가능으로 본다. 실제 `unit` walk 는 정적 검증하지 않는다. `App\Services\CueWalkAudit` 가 맵·규칙 DB 로 컨텍스트를 만들어 `game:seed-imjin10` 경고와 `game:audit-stages`(kind `ERROR cue_walk` / `WARN cue_actor`)에 연결된다. 적대 시작 칸 = enemy_squad(+squads) `cells`(없으면 맵 `spawns.b`), 플레이어 = 고정 슬롯 칸.
- 한계: `parallel` 하위의 `unit:"UNIT@x,y"` 자리표시는 치환되지 않는다(실제 유닛 id 또는 `hero:` 사용). `cue_start`(재접속 복원)에는 액터 이벤트도 그대로 들어간다.
