# 연출용 액터 보행 cue 설계서 (CUTSCENE_ACTOR_WALK)

- 작성: 박백엔, 2026-11-08. 상태: **서버 구현 완료(2026-11-08, 스펙은 CUTSCENE_SPEC.md 14절), FE 미구현**. 전제 문서: `docs/CUTSCENE_SPEC.md`(1~3단계), `app/Game/Cues.php`.
- 목적: 스토리 전개 중 적/아군 유닛이 걸어 다니고(경로 이동), 이동 중·도착 후 대사하고, 등장·퇴장(배·문 통과)하는 연출을 **전 시나리오 공통 기능**으로 만든다. 옥포(ch1_s1)는 파일럿.
- 원칙 유지: cue 는 판정에 영향이 없다. 연출용 임시 액터는 전투 판정(승패·유닛 수·AI·별 조건·kill 집계)에 들어가지 않는다.

## 1. 현행으로 가능한 범위 / 불가능한 범위

| 필요 | 현행 cue | 판정 |
|---|---|---|
| 기존 유닛을 한 칸으로 걷게 하기 | `move`(`unit`: id / `hero:<code>` / `UNIT@x,y`) | 가능. 단 **직선 목적지 1개**(FE `pathBetween` 이 경로 추정), 경로 지정 불가, 통행 불가 지형이면 조용히 무시 |
| 대사 | `say`(speaker 문자열, `hero:<code>`) | 가능. 단 move 와 **동기 불가**: 서버는 한 시점의 cue 를 정의 순서로 이벤트 나열, FE 가 큐 순서대로 재생하므로 "move 후 say" 순서는 되지만 "걷는 도중 말풍선"·"병렬"은 안 됨 |
| 카메라 화자 추적 | `camera{unit,follow}` | 가능(FE 구현 있음). say 와 자동 연동은 없음(수동으로 camera 를 앞에 둬야 함) |
| 등장 | `spawn`(실제 전투 유닛 생성) | **판정에 포함됨**(적 수·all_alive·집계). 연출용으로 부적합 |
| 퇴장 | `retreat`(`unit_removed`) | 기존 유닛에는 가능. 지휘관·주인공 불가. `state.retreated` 에 기록되어 집계·speakerGone 에 영향 |
| spawn 한 유닛 지목 | 불가 | `move.unit` 은 id/hero:/UNIT@ 만 해석. spawn 의 `tag` 는 소비처 없음 → 임시 유닛을 cue 로 움직일 수 없음 |
| 배에서 내림 / 배로 탐 | 불가 | 옥포 적은 전부 수상 병종(naval, 승선 보병). `scriptMove` 가 병종 통행 가능 지형만 허용 → 수상 칸에서 육지 칸으로 못 걷는다 |
| 이동 완료 대기 / 이동 중 대사 / 병렬 / wait / face | 불가 | 해당 do 없음 |

결론: **옥포 "상륙대 → 곳간 → 횃불 → 배로 복귀·퇴장" 은 기존 cue 만으로는 구현 불가**(연출용 임시 액터 + 경로 이동 + 퇴장 부재). 아래 신규 cue 가 필요하다. 그래서 ch1_s1 stages_imjin10.json 에 연출 cue 초안은 넣지 않았다(넣어도 검증기는 통과하지만 동작하지 않는 데이터가 되므로).

## 2. 신규 cue 설계 (서버 스키마·검증기)

공통: `Cues::DO` 에 추가, `normalize` 에서 필드 검증(잘못되면 cue 째로 버림 = 기존 규칙), 시드 경고는 기존 `Cues::dropped` 가 그대로 커버.

### 2.1 액터 모델: `state.actors` (판정 제외)
- `state.actors[actor_id] = {id, side:'a|b|n', name, sprite:{unit_type|hero|npc_ref}, x, y, facing, alive:true}`. `state.units` 와 **완전히 분리** → 승패/AI/집계/ZOC/점령/`unitAt` 에 안 잡힌다. 맵 위 칸은 겹쳐도 됨(시각 전용).
- id 는 저작자가 정한다: `[a-z0-9_]{1,24}` (예 `ox_raider1`). 같은 id 는 `spawn_actor` 1회만. 상한: 전투당 액터 12, cue 당 path 길이 40.
- 뷰: `battle.cues.actors`(현재 존재하는 액터와 위치)로 재접속 복원(= 이미 끝난 연출의 액터는 퇴장 상태라 비어 있음이 일반적). `cues.start` 재생 규칙은 기존과 동일(FE sessionStorage 로 1회).
- 참조: 신규 cue 의 `actor` 는 액터 id. 기존 유닛도 움직이려면 `actor` 대신 `unit`(기존 resolveUnit 규칙)을 써 같은 `actor_walk` 를 쓸 수 있다(둘 중 정확히 하나).

### 2.2 신규 do
| do | 필드 | 의미 |
|---|---|---|
| `spawn_actor` | `actor`, `tile:[x,y]`, `side?`, `sprite`:{`unit_type`\|`hero`\|`npc_ref`}, `name?`, `facing?`, `fx?`:`fade`(기본)/`ship`/`door` | 연출 액터 생성(등장). 이벤트 `cue{do:'spawn_actor'}`. 맵 안·`tile` 만 검증(통행 불문: 배 위·문 앞 허용) |
| `walk` | `actor`\|`unit`, `path:[[x,y]..]`(1~40) 또는 `to:[x,y]`, `speed?`(칸/초, 기본 4, 1~12), `wait?`(기본 true: 도착까지 큐 정지) , `id?` | 경로 이동. `path` 있으면 그 칸을 순서대로, `to` 만 있으면 FE 경로 탐색. **actor 는 통행 검사 없음**(배→해안 가능), **unit(실제 유닛)은 기존 scriptMove 규칙**(마지막 칸만 서버 좌표 반영, 중간 path 는 FE 연출). 이벤트 `cue{do:'walk', actor|unit_id, path, speed, wait}` |
| `despawn_actor` | `actor`, `fx?`:`fade`/`ship`(배에 오름→수평 퇴장)/`door` | 액터 제거(퇴장). 실제 유닛 퇴장은 기존 `retreat` |
| `face` | `actor`\|`unit`, `dir`:up/down/left/right | 방향 전환 |
| `wait` | `ms`(100~5000) | 큐 정지(연출 호흡) |
| `parallel` | `cues:[ {walk\|say\|face...} ... ]`(최대 6, 중첩 금지) | 안의 cue 를 동시에 재생하고 **모두 끝나면** 다음으로. 서버는 이벤트에 `group` 번호를 부여해 나열만 한다 |
| `say`(확장) | 기존 필드 + `actor?`, `during?`:`<walk id>`, `focus?`:true | `actor`: 화자 액터(말풍선 위치). `during`: 지정 walk 가 재생되는 동안 말풍선만 띄움(parallel 없이 이동 중 대사). `focus` 기본 true: 카메라가 화자(액터/유닛)를 따라간다 |

- `say.speaker` 가 `actor:<id>` 형식이면 액터 이름·초상, `hero:<code>` 이면 기존. 액터 대사는 BattleDialogue 줄 형식과 동일하게 `lineFx` 를 통과.
- 서버는 이동 시뮬레이션을 하지 않는다. `walk` 의 `actor` 좌표만 마지막 칸으로 갱신(재접속 복원용). 재생 시간은 FE 가 `speed`·path 길이로 결정하므로 서버 타이밍 의존 없음.
- 발동 시점은 기존 `on`(battle_start / turn / when) 그대로. 한 시점의 cue 는 정의 순서대로 이벤트화 → FE 가 순서 재생(wait/parallel 의 동기는 FE 큐가 책임).
- 검증기(`Cues::normalize` + `dropped`): actor id 중복 spawn·미생성 actor 참조는 **정적 검증**으로 경고 (`Cues::validateActors(array $normalized): array<string>` 신설, `GameSeedImjin10::seedStages` 의 `dropped` 경고 옆에서 호출). 참조 순서 오류(spawn 전에 walk), despawn 후 사용, 액터 상한 초과를 잡는다.

### 2.3 보행 경로 규칙 (통과 금지, 2026-11-08 사용자 제약)
전투 이동 규칙(`Engine::reachable`) 확인 결과: 4방향 이동, 지형 비용이 null(통행 불가)인 칸 불가, **적대 유닛 칸 통과 불가**, **같은 편 유닛 칸은 `ally_passthrough_cost`>0 일 때만 통과(기본 0 = 통과 불가)**. 연출 보행도 이 규칙을 따른다(`ally_passthrough_cost` 값 포함). 퇴장(배 복귀)도 예외 없음.

**서버 정적 검사** (`Cues::validateWalk`, 시드 경고 + 런타임 normalize 이전 단계; 전투 생성 시점의 배치·맵 기준):
1. 경로는 4방향 인접 칸의 연속이어야 한다(대각·점프 금지, 시작 칸과 인접).
2. 모든 칸이 맵 경계 안.
3. 각 칸이 해당 액터/유닛 병종(`move_type`)에 대해 통행 가능 지형(`terrainMod(...).cost !== null`). 단 `spawn_actor.fx:'ship'` 의 출발 칸은 수상 칸이어도 허용, 수상 → 육지 전이는 `boarding`/상륙 지형(승선 보병 규칙)일 때만 허용하고 아니면 오류.
4. 경로 칸이 **적대 진영의 시작 배치 칸**(enemy_squad `cells`, 맵 spawns, 플레이어 배치 구역 안 고정 영웅)과 겹치면 오류. 같은 편 배치 칸은 `ally_passthrough_cost`=0 이면 오류, >0 이면 경고.
5. `to` 만 주는 경우 서버가 전투 이동과 같은 Dijkstra 로 경로를 계산해 보는 검사: 경로가 없으면 오류(= "길이 막힘"). 검증기는 거부하되 자동 재탐색은 하지 않는다(저작자가 path 를 고치게 함).
6. **최종 위치**: walk 의 마지막 칸(실제 유닛) / despawn 되지 않는 액터의 마지막 칸이 전투 시작 배치(양 진영 유닛 시작 칸)와 겹치면 오류. 실제 유닛은 연출 후 원래 칸 복귀 또는 비어 있는 칸만 허용. 퇴장하는 액터는 마지막 칸이 `despawn_actor` 로 사라지므로 면제이나 경로 1~4 는 동일 적용.
7. cue 가 여러 개일 때의 칸 점유는 정적 시뮬레이션: 순서대로 액터 위치를 갱신하며 같은 시점 다른 액터와의 칸 충돌(parallel 동시 진입)도 오류.

**서버 런타임**: 실제 유닛(`unit`) walk 는 기존 `scriptMove` 규칙으로 마지막 칸만 검사(빈 칸·통행 가능). 막히면 이벤트 없이 건너뜀(현행). 경로 중간 칸이 그 사이 적 유닛으로 막힌 경우 → `walk` 이벤트에 서버가 현재 상태로 재검사한 `path_ok:false` 를 싣고 FE 는 해당 walk 를 순간 이동 없이 생략.

**FE 동적 검사** (재생 시점의 실제 유닛 위치):
- 각 걸음 직전, 다음 칸에 (연출 액터가 아닌) **실제 유닛**이 있고 통과 불가 규칙(적대, 또는 동편이면서 passthrough 0)에 해당하면 그 칸을 장애물로 보고 BFS(4방향, 같은 통행 지형 규칙)로 남은 경로를 재탐색한다. 재탐색 실패 시 그 지점에서 정지하고 `path_blocked` 를 콘솔 경고 → 대사/후속 cue 는 정상 진행, despawn 은 제자리 페이드로 대체(적 유닛 위를 가로지르지 않는다).
- 액터끼리는 충돌 검사 없음(둘 다 비판정). 단 같은 칸에 겹치면 시각적으로 약간 어긋나게 그리는 정도의 처리만.
- 퇴장도 동일: 경로 위에 적대 유닛이 서면 재탐색, 불가 시 제자리 페이드.

## 3. FE 변경안 (윤프론용 명세, 미구현)

대상: `resources/js/game/fx/CuePlayer.js`, 전투 씬의 유닛 스프라이트 레이어, `BattleDialogue`.
1. **액터 레이어**: 유닛과 같은 스프라이트 팩토리로 비-판정 스프라이트를 만들고 `store.state.cueActors{id→sprite}` 에 보관. 클릭·선택·HP바·ZOC 표시 없음. 연출 종료 시 남은 액터는 모두 정리.
2. **walk**: 칸 중심 좌표를 path 순서로 tween(칸당 `1/speed` 초), 이동 방향으로 facing/걷기 애니메이션 갱신. `wait:true` 면 Fx 큐가 완료 promise 를 기다린다. 기존 `scripted move` 의 tween 코드를 재사용.
3. **say 동기**: `during` 이 지정되면 walk tween 이 진행되는 동안 화자 머리 위에 말풍선(또는 BattleDialogue 약식 모드)을 띄우고 walk 종료와 함께 닫는다. 일반 say 는 기존대로 모달 대사. `focus` 가 true 면 대사 시작 시 `camera{unit/actor, follow:true}` 를 자동 적용하고, 대사/연출 종료 시 기존 camera restore 규칙으로 복귀(첫 camera 직전 위치 저장 재사용). 화자가 이동 중이면 follow 로 추적, 화자 소멸 시 해제.
4. **parallel**: 하위 cue 를 `Promise.all` 로 실행. say 가 섞이면 말풍선(during) 형만 허용, 모달 say 는 그룹 끝난 뒤.
5. **spawn_actor/despawn_actor fx**: `fade`(알파), `ship`(수상 스프라이트가 해안으로 들어오고/나가며 병사가 내림·오름; 배 스프라이트는 기존 naval 유닛 스프라이트 재사용), `door`(문 타일에서 페이드). 에셋 신규는 필요 없음(재사용).
6. **재접속**: 연출은 `cues.start` 로 1회만 재생(sessionStorage). 이미 본 경우 액터는 만들지 않는다(`battle.cues.actors` 가 비어 있으면 정상).
7. 알 수 없는 `do` 는 무시(전방 호환) — 서버 선배포 가능.

## 4. 옥포(ch1_s1) 파일럿 예시 (구조 초안, 대사는 placeholder)

전제: 상륙지 해안 타일 `L=(13,14)`·`(13,15)`, 배 위 출발 `S=(16,14)`·`(16,15)`(수상), 곳간 앞 `G=(11,14)`. 좌표는 맵(40x30, 해안 x≈13~16) 기준 추정이며 **맵디자이너/강화면 확인 필요**(통행 불문이라 오배치해도 에러는 없으나 시각이 어색할 수 있다).

```json
[
 {"on":{"battle_start":true},"do":"camera","tile":[13,14],"ms":600},
 {"on":{"battle_start":true},"do":"spawn_actor","actor":"ox_r1","tile":[16,14],"side":"b","sprite":{"unit_type":"sword"},"name":"왜군","fx":"ship"},
 {"on":{"battle_start":true},"do":"spawn_actor","actor":"ox_r2","tile":[16,15],"side":"b","sprite":{"unit_type":"sword"},"name":"왜군","fx":"ship"},
 {"on":{"battle_start":true},"do":"parallel","cues":[
   {"do":"walk","actor":"ox_r1","path":[[15,14],[14,14],[13,14],[12,14],[11,14]],"speed":3},
   {"do":"walk","actor":"ox_r2","path":[[15,15],[14,15],[13,15],[12,15],[11,15]],"speed":3}]},
 {"on":{"battle_start":true},"do":"say","speaker":"actor:ox_r1","text":"(placeholder) 곳간부터 비워라."},
 {"on":{"battle_start":true},"do":"say","speaker":"actor:ox_r2","text":"(placeholder) 불을 붙여라."},
 {"on":{"battle_start":true},"do":"fire","tiles":[[10,14],[10,15]],"turns":1},
 {"on":{"battle_start":true},"do":"sfx","key":"sfx_fire"},
 {"on":{"battle_start":true},"do":"face","actor":"ox_r1","dir":"right"},
 {"on":{"battle_start":true},"do":"parallel","cues":[
   {"do":"walk","actor":"ox_r1","path":[[12,14],[13,14],[14,14],[15,14],[16,14]],"speed":4},
   {"do":"walk","actor":"ox_r2","path":[[12,15],[13,15],[14,15],[15,15],[16,15]],"speed":4}]},
 {"on":{"battle_start":true},"do":"despawn_actor","actor":"ox_r1","fx":"ship"},
 {"on":{"battle_start":true},"do":"despawn_actor","actor":"ox_r2","fx":"ship"},
 {"on":{"battle_start":true},"do":"camera","mode":"restore"}
]
```
이 블록을 기존 battle_start cue(정운 대사·fire·camera) **앞**에 둔다. 기존 fire(10,14),(10,15) 와 연결되므로 위 fire 한 줄은 기존 것과 중복이면 제거. 대사 3~4줄은 송서사 작성 후 교체.

## 5. 구현 규모와 순서 제안

1. (서버, 박백엔 약 1일) `Cues::DO`·normalize 확장(spawn_actor/walk/despawn_actor/face/wait/parallel, say 확장), `state.actors`, 뷰 `cues.actors`, `validateActors`, 시드 경고 연결, `CutsceneCuesTest` 케이스 3~4개. 판정 영향 없음 회귀 테스트(액터가 있어도 유닛 수·승패 불변).
2. (FE, 윤프론 약 2~3일) 3절 1~7.
3. (데이터) 옥포 파일럿 적용 → 강화면 실화면 검증 → 하플레이.
4. 서버만 먼저 배포해도 FE 가 알 수 없는 do 를 무시하므로 안전(단 연출이 안 보임).

## 6. 열린 결정 (권고안 기본)
- 실제 유닛 보행에 중간 path 를 서버가 검증할지: 권고 = 검증 안 함(마지막 칸만 기존 규칙).
- 액터 side 는 시각 색상 전용(`a`/`b`/`n`), 판정 무관.
- 모달 say 와 말풍선 say 를 둘 다 유지(대화 흐름이 필요한 곳은 모달).
