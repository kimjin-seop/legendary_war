# 전투 연출(컷신) 지원 범위 조사 (CUTSCENE_SURVEY)

- 작성: 윤프론(frontend-developer), 2026-11-02. 코드 수정 없이 읽기만 해서 조사함.
- 질문: "캐릭터가 특정 방향으로 자동 이동하거나, 화공을 쓰면 불이 나는 식의 연출도 들어가나?"
- 결론 한 줄: **지금 엔진으로는 둘 다 안 된다.** 전투 중 연출로 지원되는 것은 (1) 라운드 시작 증원 등장, (2) 조건부 대사 오버레이(ch1_s1~s3만), (3) 교전 컷신·스킬 컷인·임팩트뿐이다. 스크립트 이동, 지형 불, 카메라 지시, 날씨·조명 효과는 데이터 필드도 실행기도 없다.
- 참고: `docs/BATTLE_EVENT_SYSTEM_SPEC.md`는 기획 문서다(이벤트 스키마·effects·scene.steps 설계). 그 이후 구현된 것은 아래 ①·⑤의 일부뿐이다.

---

## ① 스테이지 triggers 종류와 스키마

전투 중 이벤트 경로는 서로 다른 두 개다.

### A. `stages.triggers` = 증원 전용 (모든 스테이지)
- 정규화 함수: `app/Game/Engine.php:2002-2019` `normalizeTriggers`. **`action !== 'spawn'`이면 버린다(2006행).** 증원 말고 다른 종류는 없다.
- 입력 스키마: `{on:{turn:N(>=2)}, action:'spawn', side:'a'|'b', zone:<맵 meta.enemy_extra_zones 키>, units:[병종코드...], limit?:int}`
- 고정 시점: 전투를 만들 때 `state['triggers']`에 복사된다(`app/Services/BattleService.php:163-166`, Duel `app/Game/Duel.php:91`).
- 실행: 라운드가 증가한 직후 `runTriggers`가 돈다(`Engine.php:1485`, `1783`, 본체는 `2038-2075`). 칸이 점유돼 있으면 가장 가까운 빈 칸에 놓고, 자리가 없으면 다음 라운드로 미룬다. 이벤트 `reinforce{unit_ids, side, turn, zone, delayed}`를 낸다.
- 뷰: `triggersView`가 `[{id,turn,side,count,zone,cells}]`를 준다(`Engine.php:2022-2032`).
- FE: 예고 구역 빗금과 "적 증원 ×N · 다음 라운드" 표시(`resources/js/game/scenes/Battle.js:774-801`), 등장 연출로 알림·카메라 팔로우·페이드인·링·물보라(`Battle.js:746-771`).
- 조건은 턴 번호뿐이다. HP·위치·격파 같은 조건은 없다.

### B. `BattleStory` = 대사 전용 (ch1_s1~s3만)
- `app/Game/BattleStory.php`. `STAGES = ['ch1_s1','ch1_s2','ch1_s3']`(8행). 원본 데이터는 `database/data/scenario/battle_events_ch1_5.json`(133행). 데이터에는 s4·s5도 있지만 화이트리스트에 없어서 무시된다.
- 지원하는 trigger.type(`BattleStory.php:85-90`):
  - `battle_start`: 배치 확정 직후(`BattleService.php:627-633`)
  - `turn_phase_start` `{turn, phase:'player'|'enemy'}`
  - `unit_troop_tenths_lte` `{unit:'enemy_commander'|'hero:<csv>', tenths}`: 피격으로 병력이 N/10 이하가 됐을 때
  - `battle_end` `{result:'win'}`: 아군 승리 시(82-83행)
  - 그 외는 `default => false`이다. (2026-11-03 갱신: `unit_distance_lte`·`units_adjacent`·`unit_enter_tile`은 BattleStory::spatial 이 EventConditions 리프로 평가해 발동한다. 단 `unit_enter_tile` 은 맵이 `tile_tags` 를 제공해야 하며 현재 없음) 데이터에 있는 `units_on_tiles`(1), `after_event_phase`(1), `units_troop_tenths_lte`(1)는 **발동하지 않는다.**
- 이벤트 데이터 필드: `id,name,seq,type,trigger,policy{input,repeat_battle},priority,requires{after_event},cast,scene{camera,motion,fx,sound,cutscene},dialogue[],effects[],choice,end,next,short,engine_support,fallback`
  - **`scene.*`(camera/motion/fx/sound/cutscene)는 한국어 서술 문자열 배열**이다(예: `"camera":["적 함대 원경에서 아군 기함으로 팬(2초)"]`). 기계가 실행할 수 있는 지시가 아니고 서버도 내보내지 않는다.
  - **`effects[]`(spawn_units, terrain_change, enemy_ai, buff, highlight_tiles, set_objective, end_battle 등 15종)는 전부 무시된다.** 서버는 `speaker/expr/text/is_invented`만 걸러서 보낸다(`BattleStory.php:60-61`). 89행 주석에 "Tile/AI/reinforcement/buff/choice effects remain intentionally unsupported"라고 적혀 있다.
- 평가 시점: 플레이어 행동마다, 봇 행동마다 `collect`를 호출한다(`BattleService.php:669, 772, 785`). 발동 기록은 `state.story_events`에 남아 1회만 발동한다.

## ② 유닛 스크립트 이동(자동 이동 연출)

**불가.** 근거는 다음과 같다.
- 서버에서 유닛 좌표를 바꾸는 경로는 `doMove`뿐이다(`Engine.php:748-775`). 이 함수는 `moved`, 도달 가능 여부(`reachable`), 점유 여부를 검사하고, 플레이어나 봇 행동(`apply`, 665/1693행)에서만 호출된다. 이벤트나 스크립트로 이동시키는 API·효과는 없다.
- 봇 AI 모드(`EnemyV3Adapter::KNOWN_AI`, `app/Game/EnemyV3Adapter.php:23`: advance/hold_ambush/guard_point 등)는 편성 때 고정된다. 전투 중에 바꾸는 경로(`enemy_ai` 효과)도 없다.
- FE에는 `move` 이벤트만 있으면 걷기 애니메이션을 재생하는 기반이 이미 있다. `battleStore.js:134-140`이 `from/to`로 `pathBetween`(`systems/grid.js:71-75`, 범위 99·실패 시 순간이동)을 돌리고, `FxManager.move`(`fx/FxManager.js:112-147`)가 칸별 슬라이드·걷기 방향·물보라를 그린다. **서버가 `move` 이벤트만 내면 FE 수정 없이도 이동 연출이 나온다.**

## ③ 화공·불 등 타일·지형 이펙트

**지속 타일 효과는 없다. 스킬 이펙트도 불 전용 연출이 없다.**
- 지형 상태: 서버 `state.tiles`(지형 코드)를 `terrainAt`(`Engine.php:268`)이 읽는다. 진행 중에 이를 바꾸는 코드, 화염 칸 피해·턴 경과 같은 "타일 상태" 개념이 없다. 뷰의 `tile_layer`도 정적 맵 데이터에서 온다(설계서 0절과 일치).
- FE 지형 렌더(`fx/RmGround.js`, `fx/UnityGround.js`)는 생성자에서 한 번에 합성하고 칸 단위 갱신 API가 없다(`constructor/cull/tick/destroy`만 있음). 지형을 바꾸려면 다시 만들거나 그 위에 오버레이 레이어를 얹어야 한다.
- 스킬 연출(`fx/SkillFx.js`): 템플릿과 연출 종류 매핑은 `T_ACTIVE_STRIKE → 'strike'` 하나뿐이고 모르는 템플릿도 strike로 처리한다(16행). 시전 링(charge), 충격 링·방사 스파크(impact), 슬로모션, 컷신 배너·오라, 패시브 팝업이 있고 모두 코드 드로잉이다. 속성(불·물 등)에 따른 분기는 없다.
- 사용 가능한 FX 목록(현재):
  - `FxManager`: `move`, `attack`(교전 컷신 `BattleCutscene` 포함), `collapse`, `heal`(heal_glow), `kill`(+shards), `splash`(물보라), `spark`(fx_hit_spark / fx_slash 이미지), `popup`(피해 숫자), `shake`, `banner`(턴 배너), `cutin`(초상 컷인), `useEffect`(동시 효과 상한)
  - `ArrowFx.fireVolley`(화살 일제사격), `BattleCutscene` 내부의 피·먼지 puff와 불꽃 사각 파티클(500행, 타격 스파크 용도)
  - 이미지 에셋: `assets.js:41`에 `fx.fire_burst`, `fx.lightning`, `fx.levelup_pillar` 폴백 키가 있고 파일도 있다(`public/assets/test/effects/256/`). 다만 **`fire_burst`·`lightning`을 쓰는 코드는 없다(미사용).**
  - 날씨·조명(안개·비·야간) 오버레이: 없다(Battle.js 검색 결과 없음).

## ④ 대화 컷신이 지원하는 명령

### 전투 전/후 `Dialogue` 씬 (`scenes/Dialogue.js`, 독립 Phaser 씬)
- 장면 단위 필드: `bg_key`/`bg`(배경 키 `bg.<set>.<name>`, 없으면 그라데이션, 450ms 크로스페이드, 밝은 배경 dim), `caption`(상단 나레이션 띠, 6초 후 흐려짐), `what_if`('각색' 배지), 튜토리얼 스텝마다 배경 전환(`nextStep`, 351행). 근거는 `dialogue/dialogueData.js:48-59`, `Dialogue.js:162-217`.
- 줄 단위 필드: `speaker`(shiori / protagonist / hero:<code> / 이름), `expr`(표정 키, 0.15초 크로스페이드, 표정 파일이 없으면 바운스), `text`(토큰 `fillTokens`), `is_invented`('창작 대사' 표시), `verify`(true면 숨김).
- 효과음: 줄 전환·넘기기·완료 때 고정 UI 효과음 `sfx_tut_msg_tick/next/complete`만 난다(303·323·360행). BGM은 직전 화면 것을 유지한다(57행). **줄별·장면별 효과음과 BGM 지정 필드는 없다.**
- 카메라·화면 흔들림·플래시·초상 이동(줌인, 등장 방향 지정)·일러스트 컷신 프레임: 없다.
- 기타: 로그, 스킵 확인창, 회전 시 복구.

### 전투 중 `BattleDialogue` 오버레이 (`ui/BattleDialogue.js`, 전투 씬 위 컨테이너)
- 줄 필드: `speaker`(caption이면 상단 자막 띠, `npc:<id>`, hero / shiori / protagonist), `expr`, `text`, `is_invented`, `verify`. 이벤트 필드: `name`(상단 제목), `tokens`.
- 반투명 차단막(alpha 0.5), 좌우 초상과 비화자 dim, 페이지 나누기, 스킵 버튼, ESC, Enter. **배경 전환, 카메라, 효과음, 로그는 없다.**

## ⑤ 전투 중 대사 삽입 (trigger → dialogue)

**가능하다. 단 ch1_s1~s3, 위 4개 trigger 종류에 한한다.**
- 흐름: 서버 `BattleStory::collect`가 `story_dialogue{event_id, name, dialogue[], priority, input, short}`를 emit한다(`BattleStory.php:71-75`). FE에서 `battleStore.js:132-133`(방 모드 제외) → `Battle.onEvent`(724행) → `onStoryEvent`(`Battle.js:820-840`)가 `fx.enqueue`로 이전 연출이 끝난 뒤 `BattleDialogue`를 띄우고, 닫히면 다음 연출로 넘어간다. 중복 방지는 sessionStorage `lw.story:<battleId>:<eventId>`이다.
- 반복 전투(`repeat_battle`)에서는 `policy.repeat_battle`이 skip이면 생략하고, short면 자막 한 줄로 바꾼다(`BattleStory.php:53-58`).
- 대사를 띄우는 것 외에 효과(유닛 이동·증원·지형 변화)를 같이 일으키는 연결은 없다.

---

## 제안: '연출 단계 목록' 최소 버전 도입 범위 (의견)

예시 형식:
```
"steps": [
  {"at": {"turn": 3, "phase": "player"}, "do": "say",    "scene": "ch1_s2_e03"},
  {"do": "camera", "tile": [12, 7], "ms": 500},
  {"do": "move",   "unit": "b5", "to": [10, 7]},
  {"do": "fire",   "tiles": [[9,7],[10,7],[11,7]], "turns": 2},
  {"do": "camera", "mode": "restore"}
]
```
원칙: 서버가 판정과 상태 변화(move·fire)를 확정하고 이벤트로 기록한다. FE는 이벤트 순서대로 재생만 한다(기존 `fx.enqueue` 구조). 연출 전용 단계(camera·say·sfx·shake)는 서버가 판정하지 않고 그대로 전달한다.

### BE (박백엔)

| 항목 | 내용 | 공수 | 위험 |
|---|---|---|---|
| 정의 위치·고정 | `battle_events_*.json` 이벤트에 `steps[]`(기계 판독용) 추가. 전투를 만들 때 state에 복사(현재 `BattleStory`는 매번 파일을 읽으므로, 진행 중 전투가 데이터 변경의 영향을 받지 않게 하려면 state 고정이 필요) | 소 | 데이터 변경 시 진행 중 전투가 어긋남(지금도 같은 문제) |
| `say`/`camera`/`sfx`/`shake` 전달 | `story_dialogue`와 같은 방식으로 `cue` 이벤트를 emit(효과 없음) | 소 | 낮음 |
| `move`(스크립트 이동) | 새 내부 함수 `scriptMove`: `moved`·`reachable` 검사를 건너뛰고 점유·통행만 검사, 기존 `move` 이벤트 형식(`from/to/facing/terrain`)으로 emit. 점유 시 skip으로 기록 | 소~중 | 반격·ZOC·점령(`objective.held`)·돌격 `move_from`·소속 리쉬 등 이동 후처리와 겹침. 봇이 같은 응답 안에서 바뀐 위치를 보는지 확인 필요 |
| `fire`(지속 화염) | `state.hazards[{x,y,kind,turns_left}]`를 새로 두고, 라운드 시작 때 피해·감소·소멸(`runTriggers` 옆), 이동 판정(통행 불가 또는 비용)에 반영, 봇 회피, `view.hazards` 추가, `hazard_tick`/`hazard_add`/`hazard_end` 이벤트 | **중~대** | **밸런스와 AI에 영향(임밸런 측정 필요)**. 판정 규칙(피해량·통행·병종 예외·수상 칸)이 필요해 단순 연출에서 규칙 변경으로 커진다. 연출만 원하면 판정 없이 "시각 전용 불"로 범위를 줄이는 것(소)을 권한다 |
| trigger 확장 | 데이터에 이미 있는 `unit_enter_tile`/`unit_distance_lte`/`units_adjacent` 평가 추가(현재 false) | 소~중 | after_action 평가 빈도 증가. 성능은 낮은 위험 |
| `BattleStory` 화이트리스트 | s4·s5 이후 확장, 결정적 순서 유지 | 소 | `verify` 필터 유지 필요 |
| 테스트 | 스크립트 이동·화염 tick 결정성(rng 미사용) 단위 테스트 | 소 | 기존 시뮬 재현성 |

BE 합계: 시각 전용 불이면 **중**, 판정이 있는 화공이면 **대**.

### FE (윤프론)

| 항목 | 내용 | 공수 | 위험 |
|---|---|---|---|
| `cue` 재생기 | `battleStore` 이벤트 매핑 추가 → `Battle.onEvent`에서 `fx.enqueue` 단계별 실행(camera / say / sfx / shake / wait) | 소 | 큐 순서와 스킵(`fx.skip`/`snapAll`) 정합 |
| 카메라 지시 | `focusTile`(220ms 고정)을 확장해 `CameraDirector`(focus(tile,k,ms), overview=kAll, restore=저장한 k·scroll)를 새로 만든다. 설정 `autoFollow=false` 처리 정책 필요 | 소~중 | 줌 단계 규칙(`zoomStops`, unity32 정수 배), 사용자 시점 복귀 |
| `move` | 서버 `move` 이벤트를 재사용하므로 **추가 작업 거의 없음** | 소 | 순간이동 폴백(경로 없을 때) |
| 불 오버레이 | 새 `HazardLayer`(타일 위 불꽃 애니메이션·연기). 기존 `fx.fire_burst` PNG 1장 또는 코드 파티클로 시작하고 `view.hazards` 동기화. 지형 재합성 없이 오버레이로 처리 | 중 | 모바일 성능(큰 맵 pk_18 등 검증 안 됨), 에셋 부족(애니메이션 불은 안아트 필요) |
| 대화 확장 | `BattleDialogue`에 줄별 `sfx`, `shake`, `bg`(암전/일러스트) 필드 | 소 | 낮음 |
| 재접속·스킵 | 이미 본 cue 재생 방지(현재 sessionStorage 방식 확장), 스킵 시 최종 상태 스냅 | 소 | 서버 기록이 없어 기기를 바꾸면 다시 재생됨(현재와 같음) |

FE 합계: **중**. 단계 재생기와 카메라는 소, 불 오버레이가 중의 대부분을 차지한다.

### 권고 순서
1. (소) cue 재생기 + camera/say/sfx/shake + 서버 `cue` 이벤트: 연출만 있고 판정 변화가 없어 위험이 낮다.
2. (소~중) 스크립트 `move`: 서버 함수 하나와 FE 재사용. 이동 후처리 정합을 정검수가 리뷰해야 한다.
3. (소~중) 시각 전용 불(`fire`, 판정 없음, N라운드 뒤 소멸): "화공 쓰면 불이 난다"는 연출 요구는 이 단계로 충족된다.
4. (대) 판정 있는 화염 지형: 기획(문기획)과 밸런스(임밸런)를 결정한 뒤 진행한다.

### 확인 필요·가정
- 화공을 스킬로 쓸지 이벤트로 쓸지 미정이다. 스킬이면 `SKILL_FX.templates`에 새 템플릿과 서버 스킬 템플릿이 필요하다(별도 범위).
- 방 모드(PvP·solo)는 현재처럼 이벤트 0건으로 둔다고 가정했다.
- 줄 번호는 2026-11-02 기준 작업 트리 기준이다.
