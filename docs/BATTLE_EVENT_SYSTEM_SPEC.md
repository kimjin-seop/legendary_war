# 전투 이벤트 시스템 설계서 (BATTLE_EVENT_SYSTEM_SPEC)

- 작성: 문기획(product-planner) 기획 보고서 정리본. 원본: 에이전트 출력 `add88f6062a57294f`(본편 + 일러스트 컷신 보완본). 정리: 2026-11-01
- 용도: 구현 담당(박백엔·윤프론)이 참조하는 설계 문서. 사용자 지시 '기획대로 쭉 진행'에 따라 보류 결정은 권고안 기준.
- 상태: 기획 단계. **현재 코드에는 전투 중 이벤트 구현이 없음**(전투 전/후 대사·교전 컷신·스킬 컷인만 존재).
- 수치·확률·좌표는 모두 가정이며 임밸런 시뮬·맵 JSON 확인 후 확정. 법무·저작권 항목은 개발을 막지 않고 공개 전 메모로만 유지.

## 문서 구성과 우선순위 규칙

| 부분 | 내용 |
|---|---|
| 0 | 요약·전제·현재 구현 근거 |
| ① 1-1~1-6 | 시스템 설계 본편(데이터 모델, 서버 흐름, 선택형, 대사 채널, FE 구현, 스킵·멀티 규칙) |
| ① 1-7 | **일러스트 컷신 재생 타입(보완본)** — 본편 1-1-4 scene 지시, 1-5, 1-6, ②, ③, ⑤, ⑥에 대한 추가·확장 |
| ② | 갭 분석표 (본편 27행 + 보완본 28~34행, 통합) |
| ③ | 구현 로드맵 (보완본 추가 범위·인수조건을 해당 단계 셀에 `[보완본 추가]`로 병기, 인수조건은 `(c1)`식 번호) |
| ④ | 1~10장 이벤트 골격 |
| ⑤ | 지적 사항 (1~14 본편, 15~18 보완본) |
| ⑥ | 사용자 결정 질문 (1~6 본편, 7~9 보완본) |
| 부록 A | 송서사 제안 스키마 ↔ 문기획 스키마 매핑표 |

- **충돌 시 보완본(1-7, 재생 기록·컷신 관련)이 본편보다 우선**한다. 구체적으로: (1) 재접속 재생 방지는 전투 내 위치는 `ack_seq`, 영구 기록은 `user_seen_events`로 분담, 이미 본 컷신은 `short`로 대체. (2) 컷신 폴백은 "암전 + 대사 박스". (3) 전투 중 컷신은 스테이지당 최대 1개·tier A만.
- **원문 내부 불일치(확인 필요)**: 본편 질문 1은 선택 이벤트를 s5·s8·s10 **3개**로 권고하나 지적 6은 "4개(s5·s8·s10·s2 후보)"로 적혀 있음. 질문 1(3개)을 기준으로 보고 s2는 후보로만 취급.
- 원문 중 "원문 10-6" 등은 `campaign_ch1_outline.json`/시나리오 대본의 절 번호를 가리킨다.

---

읽기 전용으로 코드와 문서를 확인하고 작성했습니다. 이 작업 중 프로젝트 `CLAUDE.md`의 Laravel Boost 설치 지시는 읽기 전용 작업이라 실행하지 않았고, 기존 팀 결정(실행 안 함)과도 같습니다.

### 0. 요약과 전제

**한 줄 결론**
- 전투 중 이벤트는 엔진·BE·FE 모두 지금 구현이 없습니다. 현재는 전투 전/후 대사(Dialogue 씬)와 교전 컷신·스킬 컷인만 있습니다.
- 다행히 `state.tiles`, 유닛 추가용 `ArmyBuilder::makeUnit`, 이벤트 `seq` 로그, FE `fx.enqueue` 큐, `syncViews`의 새 유닛 뷰 생성이 이미 있어서 기반은 됩니다.
- 핵심 설계는 **엔진(`Engine::apply` 안)에 이벤트 평가 훅을 두는 것**입니다. 정의는 스테이지 전투 생성 시 `state`에 복사해 고정합니다. 방 전투(PvP·solo)와 진행 중 기존 전투는 정의가 없으므로 자동으로 제외·불변이 됩니다.
- 분량 기준으로 서버는 "무엇이 일어났나(판정)"만 기록하고, FE가 "어떻게 보여주나(연출·대사 본문)"를 재생합니다.

**확인한 현재 구현 (근거)**

| 항목 | 현황 |
|---|---|
| 엔진 훅 지점 | `Engine::endTurn`/`endRound`(턴 전환 후 `turn_start` emit), `apply` 스위치(move/attack/wait/use_skill), `resolveDeath`, `finish` |
| 목표 | `survive_turns`만 있고 `state.objective`에 고정됩니다. 승리는 side b 턴 N 종료 시(`endTurn`)이고, `max_turns`보다 우선합니다. 적 지휘관을 격파하면 survive 스테이지도 승리합니다(기존 수용 사항). |
| 이벤트 로그 | `Engine::emit`이 `seq`와 이벤트 객체를 만들고, `BattleService::log`가 `battle_actions.events`에 저장합니다. 방 폴링은 `last_seq` 증분이고, 스테이지에는 폴링이 없으며 행동 응답의 `events`와 `view()`로 전달합니다. |
| 지형 | `state.tiles`(지형 코드 문자열 배열)를 `terrainAt`/`passable`/`reachable`이 읽으므로 타일을 바꾸면 이동 판정이 자동 갱신됩니다. 다만 `view()`의 `tile_layer`는 `mapExtras`가 정적 맵 데이터에서 주므로 변경분이 반영되지 않습니다. |
| 유닛 추가 | API는 없고, `ArmyBuilder::makeUnit`·`addGenericSide`(스테이지 적, id `b{n}`)와 `leader_id` 부대 붕괴 규칙이 있습니다. FE `syncViews`는 모르는 id를 새 `UnitView`로 만듭니다. |
| 봇 AI | `HeuristicBot`은 `config('game.bot')` 옵션(commander_mode guard, follow_front, squad_leash 등)으로 동작하며 전투별 오버라이드 경로가 없습니다. |
| 턴 타이머 | `BattleService::turnInputSeconds`는 60초이고, `syncStageDeadline`이 `battles.turn_deadline_at`을 관리하며, 만료는 지연 평가(`expireTurnInTx`)입니다. 교대 행동 on이면 0입니다(현재 off). |
| 별 조건 | `settle`의 `all_alive`는 `alive >= init_count['a']`입니다. 증원 아군이 있으면 원 유닛이 죽어도 통과하는 허점이 생깁니다. |
| 대사 FE | `Dialogue.js`는 **독립 Phaser 씬**이라 전투 중 전환하면 Battle 씬 상태가 유실됩니다. `speakerInfo`/`fillTokens`/`portraitKey`는 재사용 가능합니다. `what_if` 배지와 `verify` 줄 숨김 규칙이 있습니다. |
| 조건부 대사 | `dialogue_conditions.json`에 조건 문법과 `battle_barks` 시범 3건이 있습니다. **평가기는 미구현**입니다. |
| FE 연출 | `FxManager`는 `enqueue`/`pump`/`skip`/`paused`/`playing`/`shake`/`banner`/`cutin`이 있습니다. `Battle.js`에는 `followTile`, `setZoomK`, `zoomStops`, `kAll`이 있어 카메라 이동·줌은 되지만 시네마틱용 API는 없습니다. |
| 데이터 | ch1 스테이지 7개(s8~s10은 대사만 있고 맵·편성은 시드 없음). 맵 `pk_*`는 `maps.meta` 컬럼이 있고, 이벤트 영역(zone) 정의는 없습니다. |

**가정 (모두 '가정' 표기)**
1. `config('game.first_side')`는 `a`입니다. 한 라운드는 아군 턴 시작(a), 적군 턴 시작(b) 순이고, 아래 `T3a`는 3라운드 아군 턴 시작입니다. 확인 필요(`config/game.php`).
2. 교대 행동은 off(현재 코드값)입니다. on일 때는 `endRound`에도 같은 훅을 걸고, 타이머 0이라 선택 이벤트는 기본값으로만 처리합니다.
3. 이벤트는 캠페인 ch1(`ch1_s1~s10`)만 대상이고 기존 `stage_01~06`, 튜토리얼, 방(solo/PvP)은 대상이 아닙니다.
4. 조선·명 측 대사는 가능하지만 **일본 측 인물 대사는 금지**입니다. 원문 10-6의 "적군 지휘관 대사" 예시는 규칙과 충돌하므로, 적 지휘관은 자막(caption)·시오리 해설·아군 반응으로 대체합니다. 허구 적(그림자)은 일본 측이 아니라 대사가 가능합니다.

---

### ① 시스템 설계

#### 1-1. 이벤트 데이터 모델

**저장 위치(권고)**
- 작성 원본은 `database/data/battle_events_ch1.json`입니다. 스테이지 코드를 키로 하고 `game:seed-ch1`로 `stages.battle_events`(JSON, nullable, 신규 컬럼)에 적재합니다. 기존 `enemy_squad`/`objective` 방식과 동일합니다.
- 전투 생성(`createStageBattle`) 시 `state['bev']['defs']`에 복사해 고정하고 `defs_hash`를 기록합니다. 이후 스테이지 데이터가 바뀌어도 진행 중 전투는 불변입니다.
- 대사 본문은 서버에 두지 않고 FE 번들 `resources/js/game/data/dialogue/battle_event_scenes_ch1.json`에 `scene_id`로 둡니다. 송서사가 작성하며 `campaign_ch1_scenes.json`과 같은 형식입니다.
- 서버는 `scene_id`와 연출 지시만 보냅니다.

**이벤트 스키마**
```
{
 "id": "ch1_s2_e03",
 "name": "의병의 매복 기습",
 "tier": "A|B|C",                       // A=컷신급(대화창), B=짧은 연출(말풍선+카메라), C=자막/배너
 "fact": "fact|adapted|fiction", "verify": true|false, "source_ref": "outline.stage.id",
 "trigger": {
   "at": "battle_start | turn_start | after_action | unit_defeated | battle_end",
   "side": "a|b|any",                   // turn_start/after_action의 대상 진영
   "turn": 3 | {"gte":3,"lte":5,"every":2},
   "cond": { "all":[ leaf... ] }        // all | any | not 조합(dialogue_conditions.json과 같은 문법)
 },
 "policy": { "once": true } | { "repeat": {"max":3,"every":2}, "cooldown_turns":1 },
 "priority": 50,                        // 같은 시점 다수 발동 시 큰 값 먼저, 동률은 id 순(결정적)
 "requires": { "party_has":["gwak_jae_u"] },   // 출전 영웅 게이트(없으면 연출 줄만 생략하고 효과는 유지)
 "cast": ["yi_sun_sin","gwak_jae_u","@protagonist","npc:jin_rin","caption","shiori"],
 "scene": {
   "blocking": true, "est_ms": 9000, "scene_id": "ch1_s2_e03",
   "short": { "mode":"banner", "text_key":"..." },   // 반복 전투·연출 약화용 대체
   "steps": [ {"cam":{...}}, {"dialogue":"scene_id"}, {"fx":{...}}, {"sfx":"key"}, {"weather":{...}}, {"light":{...}}, {"anim":{...}} ]
 },
 "effects": [ ... ],                    // 1-1-3
 "choice": null | {...},                // 1-4
 "end": "scene_end | immediate",        // 비차단은 immediate
 "next": ["ch1_s2_e04"]                 // 후속 이벤트 id(해당 이벤트가 발동한 뒤에야 평가 대상이 됨)
}
```

**1-1-1. trigger 조건 leaf 키 (신규 구현 필요, 서버 평가)**

| key | 의미 | 예 |
|---|---|---|
| `unit_in_area` | 유닛(id/role/태그/진영)이 zone 안 | `{side:'b', zone:'z_ford', count_gte:1}` |
| `unit_hp_pct` | 유닛 HP% 비교(HP 최대 10단계 기준) | `{unit:'@enemy_cmdr', op:'lte', pct:50}` |
| `unit_alive` / `unit_defeated` | 유닛·태그 생존/격파 | `{tag:'vanguard'}` |
| `adjacent` | 두 유닛 인접 | `{a:'gwak_jae_u', b:'@enemy_cmdr'}` |
| `units_left` | 진영 생존 수 비교(증원 제외 옵션) | `{side:'a', op:'lte', n:3}` |
| `survive_remaining` | `Engine::surviveTurns` 기반 남은 턴 | `{op:'lte', n:2}` |
| `flag` / `after_event` | `set_flag`/선행 이벤트 발동 여부 | |
| `unit_action` | 방금 행동(move/attack/use_skill)과 대상 | `after_action` 전용 |
| `choice_result` | 선택 결과 | `{event:'..', opt:'A'}` |

- 유닛 참조는 영웅 코드(`gwak_jae_u`), 역할 별칭(`@enemy_cmdr`, `@protagonist`), 스테이지 편성에서 부여한 `tag`(예: `vanguard`, `rear_pocket`, `wave1`)입니다. `tag`는 `enemy_squad`/유닛에 신규 필드가 필요합니다(1-2).
- `zone`은 맵 `meta.event_zones: {z_ford:[[x,y]...]}`로 정의합니다(신규 필드, `maps.meta` 사용). **좌표를 지어내지 않고** 임밸런이 맵 JSON을 보고 확정합니다(확인 필요).

**1-1-2. 평가 시점과 순서 (서버, `Engine` 내부)**
1. `battle_start`: 배치 확정(`confirmDeployment`)이 `in_progress`로 바꾼 직후 1회.
2. `turn_start`: `endTurn`/`endRound`가 `turn_start`를 emit한 직후(양 진영). 이 지점에서 효과를 적용하므로 이어지는 봇 턴이 이미 변경 상태를 봅니다.
3. `after_action`: `doMove`/`doAttack`/`doUseSkill`/`doWait` 직후와 `resolveDeath` 처리 후. `unit_defeated`는 `kill` emit 직후 별도 평가합니다.
4. `battle_end`: 연출 전용입니다(효과 없음, 아래 1-5).
5. 한 시점에 평가는 최대 3회 연쇄(`next`)이고, 순환·무한 연쇄는 시드 검증기가 거부합니다. 순서는 priority 내림차순, id 오름차순입니다. 이벤트 평가에서 `state['rng']`를 소비하지 않아(스폰 위치는 zone 칸 순서로 결정적) 봇 결정성과 기존 시뮬 재현성을 유지합니다.
6. `victory`/`defeat` 효과는 `finish()`를 호출하고 이후 평가를 중단합니다.

**1-1-3. effects 목록 (서버가 판정·기록)**

| op | 파라미터 | 규칙 |
|---|---|---|
| `spawn` | `side`, `units[{id,type,kind,hp_mult,zone,tag,leader,ready,exclude_stars}]` | id는 `ev_{eventId}_{n}`. `ArmyBuilder::makeUnit` 재사용, 레벨은 스테이지 `enemy_level+offset`. 칸은 zone 칸을 순서대로 보고, 점유·불가 지형이면 다음 칸이며 칸이 없으면 `skipped:no_tile`. 도착 턴에는 `ready:false`(행동 불가)를 기본으로 합니다. 적은 `leader_id`=적 지휘관(`b0`)이라 지휘관 사망 시 함께 붕괴하고, 아군은 `leader_id` null입니다. `init_hp[side]`에 합산할지는 아래 지적 사항(⑤-4)에서 결정합니다. |
| `terrain_change` | `tiles[{x,y,to}]` 또는 `zone`+`to`, `occupied_policy:'skip'` | `to`는 `terrains.json` 기존 symbol만 허용합니다. 유닛이 점유한 칸은 건너뛰고 `skipped:occupied`로 기록합니다. 변경분은 `state['bev']['tile_patch']`에 누적하고 `view`에 `tile_patch` 필드로 내려보냅니다. |
| `objective_change` | `sub_objective{id,text_key,star?}` | **생존 턴 수·승리 조건은 진행 중 변경하지 않고**(플레이어 신뢰), 보조 목표 표시·별 조건 추가만 허용합니다. |
| `buff` | `target{side/unit/tag}`, `stat(atk/def/move)`, `pct/amount`, `turns` | 기존 `useBuff`/`buffAmount`/`buff_expire` 구조 재사용. **이벤트 버프 합 한도**(±15%, 아래 ⑤-5)를 검증기가 강제합니다. |
| `set_flag` | `name`, `value` | `state.bev.flags`. |
| `force_retreat` | `unit/tag`, 비지휘관만 | 격파가 아닌 이탈(`retreat` emit, 제거). **지휘관 이탈은 불가**하며 필요 시 `victory{reason:'event_victory'}`로 처리합니다. |
| `ai_pattern` | `target{side/unit/tag}`, `mode: hold|advance|assault|wave|funnel|flee|target_priority`, `to_zone?` | `state['bev']['ai'][tag]`. `HeuristicBot`이 읽도록 확장(봇 옵션 전투별 오버라이드). |
| `heal`/`despawn` | 선택 | 필요 시. |
| `victory`/`defeat` | `reason` | `battle_end.reason` = `event_victory` / `event_defeat`. `settle`에서 이 reason의 처리를 확인해야 합니다. |

**1-1-4. scene 연출 지시 (FE가 재생, 서버는 id·타이밍 메타만)**
- `cam`: `{mode:'overview'|'focus'|'pan'|'zoom'|'restore', target:{unit|tile|zone}, k?, ms}`
- `dialogue`: `scene_id`(본문은 FE 번들).
- `portrait`: 클로즈업·표정 지정.
- `anim`: `{unit, motion}`.
- `fx`: `shake|flash|arrows|ink|banner|marker(공격 방향 표시)`.
- `sfx`: 키.
- `weather`: `{kind:'rain|fog|ink_drip|ink_storm', intensity}`.
- `light`: `{mode:'night|dusk|day', alpha}`.
- `est_ms`: 차단 재생 예상 시간(타이머 가산용, 상한 25초).

#### 1-2. 서버 처리 흐름과 응답

1. 클라 행동 → `submitAction`이 `Engine::apply`를 호출하고, apply 내부에서 훅이 이벤트를 평가·효과를 적용합니다.
2. 효과는 `emit`으로 `battle_event`(본체)와 하위 이벤트(`ev_spawn`/`ev_terrain`/`ev_buff`/`ev_retreat`/`ev_ai`/`ev_objective`/`ev_flag`)를 만듭니다. 모두 같은 `seq` 체계라 `battle_actions.events`에 기록되고, 재접속·로그·어드민 조회가 됩니다.
3. **응답 `events[]` 안에 아래 형태로 포함**합니다(별도 필드 아님. 순서가 곧 재생 순서).
```
{ "type":"battle_event", "seq":123, "id":"ch1_s2_e03", "tier":"A", "blocking":true, "skippable":true,
  "scene":{ "scene_id":"ch1_s2_e03", "est_ms":9000, "steps":[...], "short":{...} },
  "effects_applied":[ {"op":"spawn","unit_ids":["ev_ch1_s2_e03_1","ev_ch1_s2_e03_2"],"skipped":[]},
                      {"op":"set_flag","name":"ambush_done"} ],
  "choice": null }
```
4. `view()`에 추가: `bev:{fired:{id:count}, flags, tile_patch[], weather, light, sub_objectives[], pending_choice, ack_seq, unseen[]}`.
5. FE는 재생만 합니다. 클라이언트가 보내는 값은 선택 결과·재생 확인(ack)뿐이고, 둘 다 서버가 검증합니다. 효과는 서버 판정 시점에 이미 적용되어 있어, **FE 연출을 스킵해도 서버 상태는 같습니다**.
6. **봇 턴 일괄 처리**: 플레이어 `end_turn` 한 번의 응답에 `turn_start(b)` → 이벤트 → 봇 행동들 → `turn_start(a)` → 이벤트가 `seq` 순서로 들어옵니다. FE는 큐 순서대로 재생합니다. 이벤트 효과(증원 등)가 즉시 반영되어 있어도 연출은 순서대로이므로 `battle_event`의 `unit_ids`로 스폰 유닛 뷰 생성 시점(연출 시점)을 맞춥니다. `sync`가 큐 끝에서 최종값을 스냅합니다(`battleStore.playEvents` 현행 구조).
7. **턴 타이머 정합**: 서버가 `syncStageDeadline` 계산 시 해당 턴 시작에 발동한 차단 이벤트의 `est_ms` 합(상한 25초)을 마감에 가산합니다(서버 권위, FE 대기 불필요). 스킵해도 가산은 유지됩니다(플레이어 불이익 없음).
8. **재접속·중복 재생 방지**: `state.bev.ack_seq`(어디까지 연출을 봤는지)를 `POST /api/battles/{id}/events/ack {seq}`로 갱신합니다. 이 값은 연출 위치 표시일 뿐 판정에는 쓰이지 않습니다. `view()`는 `seq > ack_seq`인 `battle_event`를 `unseen[]`으로 주고, FE는 재접속 시 차단 컷신 대신 요약 재생(자막 1줄 + 효과 토스트)을 하고 이어서 ack합니다.

#### 1-3. 선택형 이벤트

- 정의: `choice:{prompt_key, options:[{id,label_key,effects:[...],next:[...]}], default:'A', timeout_s:30}`.
- 서버 저장: 발동 시 `state.bev.pending_choice={event_id, options, expires_at}`. 응답은 `battle_event.choice`로 전달합니다.
- 해결 API: `POST /api/battles/{id}/event-choice {event_id, option}`. 서버가 `pending_choice`와 대조하고, 멱등(같은 선택 재요청은 같은 결과)이며, 선택 효과를 적용해 `battle_event_result` 이벤트를 emit합니다.
- **선택 대기 중에는 move/attack/end_turn을 `409 choice_pending`으로 거부**합니다(상태 모호 방지).
- 타임아웃: 선택 대기 시간은 30초(최대)이고 턴 마감과 독립입니다(선택 시간 동안 턴 마감을 같은 만큼 연장해 60초 규칙과 정합). 경과하면 서버가 `default`를 적용합니다. 지연 평가 경로(`expireTurnInTx`, 입력 시점)에서 pending이 있으면 기본값을 먼저 적용합니다.
- 결과는 `battles.result.choices[]`에 저장해 후속 장면(`after_clear` 변형)과 보상 플레이버 분기에 씁니다.
- **역사 경계 규칙**: 선택은 (a) 허구 스테이지, (b) 각색 허용 영역(전술 경로·지원 방식)에만 두고, 사실 사건의 결과·인물 운명은 선택으로 바꾸지 않습니다. 난이도·보상 영향은 최소화합니다(사용자 결정 질문 1).

#### 1-4. 전투 중 대사 시스템 (이벤트 대사와 별도 채널)

**채널 구분**

| 채널 | 용도 | 표시 | 차단 | 평가 위치 |
|---|---|---|---|---|
| 스토리 이벤트(`battle_event`) | tier A/B | 대화창(오버레이)·카메라 | 차단 | 서버 |
| 말풍선(bark) | 일상 전투 반응 | 유닛 위 말풍선, ≤28자, 2.2초(`dialogue_conditions.json`의 `max_chars` 28) | 비차단 | FE(결정적 해시, 서버 판정 불필요) |
| 하단 캡션 | 자막·해설·일본 측 표기 | 상단/하단 한 줄 | 비차단 | 서버 이벤트 또는 FE |

- 말풍선은 게임 효과가 없는 연출이라 **FE에서 평가**합니다. 확률은 `hash(battle_id, seq, bark_id)`로 결정해 재접속·재생 때 같은 결과가 나옵니다. 서버 부하와 이벤트 로그 증가가 없습니다.
- 스토리 이벤트가 재생 중이거나 스킵 중, `fxLevel 2`, 반복 클리어 단축 설정이면 말풍선을 억제합니다.
- **전역 예산**: 전역 쿨다운 4초, 턴당 최대 3개, 한 전투 최대 12개, 한 유닛 연속 방지.

**대사 유형 10종 규칙표 (초안 수치는 모두 가정, 임밸런·송서사 조정)**

| # | 유형 | 트리거(기존 이벤트 근거) | 기본 확률 | 쿨다운 | 전투당 상한 | 우선순위 | 표시 |
|---|---|---|---|---|---|---|---|
| 1 | 전투 개시 | `battle_start` | 100%(스토리 이벤트와 같은 시점이면 생략) | - | 1 | 40 | 말풍선(영웅 1~2명) |
| 2 | 아군 턴 시작 | `turn_start(a)` | 8% | 3턴 | 3 | 20 | 말풍선 |
| 3 | 적군 턴 시작 | `turn_start(b)` | 6% | 3턴 | 2 | 15 | 캡션/말풍선(적 측은 캡션만) |
| 4 | 이동·공격 | `move`/`attack` | 10% | 2턴 | 4 | 25 | 말풍선 |
| 5 | 스킬 사용 | `skill_use` | 60% | 영웅별 1회 | 영웅당 1 | 50 | 컷인 후 말풍선(컷인과 겹치면 생략) |
| 6 | 적 격파 | `kill` | 25%(영웅 격파는 70%) | 2턴 | 4 | 45 | 말풍선 |
| 7 | 피해·위기 | HP 임계(예: 30% 하향 최초 1회), 영웅 `kill` | 100%(조건 충족 시 1회) | 영웅별 1회/전투 | 영웅당 1 | 70 | 말풍선(동료 반응은 인접 영웅 1명) |
| 8 | 특정 캐릭터와 교전 | `attack` 쌍 + `hero_relations.json`(rel_xxxx) | 100%(한 쌍당 1회) | 쌍당 1회/전투 | 2 | 80 | 말풍선 2줄(최대) |
| 9 | 특정 영웅 조합 출전 | `battle_start` + `party_has` | 100%(한 조합당 최초 1회, `scene_seen`) | 세이브 단위 1회 | 1 | 75 | 말풍선 2~3줄 |
| 10 | 승리·패배 | `battle_end` | 100% | - | 1 | 90 | 결과 화면 직전 연출(말풍선·캡션) |

- 영웅 대사 키는 4단계 폴백입니다: 영웅 코드 전용 → 병종(영웅 고정 병종 `troop_type`) → 문화권(`hero_cultures.json`) → 공통. 11장 이후 수집 영웅은 개별 작성 없이도 병종·문화권 풀로 말풍선이 나옵니다. 전용 대사는 우선순위를 +30 가산합니다.
- `dialogue_conditions.json`의 `battle_barks` 형식을 재사용하되, `type(1~10)`/`prob`/`cooldown`/`max_per_battle`/`priority`/`scope(hero|troop|culture|generic)` 필드를 확장합니다. 확인 필요: 평가기 구현(윤프론) 시 `battle_barks` 스키마 확장 합의.
- **말풍선 vs 대화창 정책**: 대화창(차단)은 tier A 스토리 이벤트와 영웅 간 특수 대화의 최초 1회에만 쓰고, 그 외는 모두 말풍선·캡션입니다. 대화창은 한 이벤트 12줄 이하, 장당 합계 90초 목표입니다(가정).

**영웅 간 특수 대화 (E 유형)**
- 데이터는 `hero_relations.json`의 `relation_encounters.active` 20건 구조 재사용(`dialogue_conditions.json`): `relation_id`, `kind(allied|opposed)`, `trigger:{type:'attack_pair'|'party_pair'|'adjacent'}`.
- 발동 규칙: 적대 쌍은 두 영웅이 서로 공격/반격하거나 인접할 때 최초 1회(말풍선 2줄), 같은 편 쌍은 `battle_start`에 둘 다 파티에 있을 때 최초 1회입니다. 한 번 본 대사는 `scene_seen`에 저장해 이후 생략하고, 반복 가능 설정은 선택입니다.
- 스테이지별 스토리 이벤트와 같은 시점이면 스토리 이벤트가 우선하고 특수 대화는 다음 턴으로 미룹니다.
- sensitive 관계(rel_0026, rel_0029)는 시오리 중립 안내 한 줄을 선행합니다(기존 스펙 권고).
- 기존 `rel_0014`, `rel_0018`은 ch1 기본 장면에 `relation_ref`가 있어 중복 재생을 방지해야 합니다(기존 스펙 3항).

#### 1-5. 연출 요소별 구현 방식 (FE)

| 요소 | 구현 | 비고 |
|---|---|---|
| 이벤트 재생 | `fx.enqueue((done)=>player.play(battleEvent, done))`. 재생 완료 또는 스킵 시 `done()`. 큐가 비면 조작 해제 | 기존 `FxManager` 구조 활용 |
| 조작 잠금 | `store.s.eventLock`(차단 이벤트 재생 중). 잠금 중 입력은 "넘기기"로만 해석합니다. 상단에 '컷신 재생 중 · 스킵' 표시 | 현재 탭 = `fx.skip()` 관례 유지 |
| 카메라 | `CameraDirector` 신규: `focus(tile|unit, k, ms)`, `overview()`(`kAll`), `pan`, `restore()`. 시작 전 `{k, scroll}` 저장 후 이벤트 끝에 복귀(플레이어 시점 보존). 줌은 현행 `zoomStops` 정수 단계 + 축소 영역 비정수 허용 규칙 준수 | 이동 ≤600ms |
| 대화 | `BattleDialogue` 오버레이(전투 씬 위 투명 씬 또는 컨테이너): `speakerInfo`/`fillTokens`/초상화 로직 재사용, 스킵 버튼·로그. **Dialogue 씬으로 전환하지 않음**(전투 씬 상태 유실). 신규 speaker 종류: `caption`(자막), `npc:<id>`(진린 등 CSV 미등재 NPC, 초상화 없으면 실루엣) | 첫 재생 스킵은 기존 `askSkip` 확인 1회만 |
| 화면 흔들림 | 기존 `FxManager.shake` | |
| 날씨·조명 | 월드 위 `worldFx` 레이어: 비·안개·먹물은 **스크롤 타일 스프라이트 1~2장**(파티클 수 상한 `FX.limits`), 밤은 남색 알파 오버레이 | 모바일은 강도 하향 |
| 지형 변화 | `view.tile_patch` 적용 `applyTilePatch(cells)`: 해당 셀만 재렌더(지형 렌더 `RmGround`/`UnityGround`/`MapBackdrop`이 일괄 렌더라면 셀 단위 갱신 API 필요 — **확인 필요**(윤프론 조사)). 변경 직후 이동 가능 타일 캐시 무효화 | 먹물/붕괴용 신규 타일은 안아트 필요 |
| 사운드 | `audio.play(key)`. 이벤트 `sfx` 키는 사용 가능한 기존 키로 시작 | 신규 음원은 승인 필요 |
| 성능 | 한 이벤트당 동시 효과 상한 `FX.limits.effects`, 큐 길이 상한, 28x20 맵 전체 보기 시 카메라 줌 ≤2단 | 확인 필요: pk_18/pk_10 성능 미검증(기존 메모) |

#### 1-6. 스킵·반복 전투 생략·멀티 단축 규칙

| 상황 | 규칙 |
|---|---|
| 이벤트 스킵 | 항상 가능(차단 이벤트의 '스킵' 버튼). 서버 상태 불변. 첫 재생에만 확인창 1회 |
| 전체 스킵 | 설정 '전투 연출'(fxLevel 0/1/2) 연동: 2는 카메라·날씨 효과 끔, 대사는 로그·자막으로 대체 |
| 반복 전투 | 스테이지 클리어 이력이 있으면 `scene.short`(배너 1줄)로 자동 대체, 설정에서 '항상 전체 재생' 선택 가능. 서버는 이력만 알려주고(`view.bev.replay:true`) 판정은 동일 |
| 멀티(PvP)·방 | `events_def` 없음 → 스토리 이벤트·차단 컷신 0건. 허용: 기존 교전 컷신·스킬 컷인·말풍선(자기 유닛만, 기본 off 설정 가능). 방 solo도 동일하게 제외(가정) |
| 결과 연출 | 전투 종료 후 승리 장면은 엔진 이벤트가 아닌 `battle_end` 이벤트를 받은 FE 연출(결과 화면 전)로 분리 |

#### 1-7. 일러스트 컷신 재생 타입 (보완본 — 본편과 충돌 시 이 절 우선)

서버는 `battle_event.scene.cutscene{id, frames[]}`만 전달하고 재생은 FE가 합니다. 이미지·대사 본문은 서버에 두지 않습니다. 추가 코드 조사는 하지 않았고 기존 확인 사실(Dialogue는 씬 전환형, `fx.enqueue` 큐, `assets.js` manifest, `scene_seen` 개념)에 근거합니다.

##### 1-7-A. 일러스트 컷신 데이터 모델 (scene.cutscene)

```
"scene": {
  "blocking": true, "est_ms": 14000, "scene_id": "ch1_s4_e01",
  "cutscene": {
    "id": "cutscene.ch1_s4.1",                  // manifest 키 규칙: cutscene.<stageId>.<n>
    "frames": [                                 // 1~3장(상한, 검증기가 강제)
      { "key": "cutscene.ch1_s4.1.a",
        "cam": { "from": {"zoom":1.0,"x":0.5,"y":0.5}, "to": {"zoom":1.15,"x":0.4,"y":0.45}, "ms": 4000 },  // 팬/줌(정규화 좌표)
        "fade_in": 400, "fade_out": 400, "hold_ms": 3000,
        "dialogue_ref": "ch1_s4_e01#1-3"        // 대사 줄 범위(FE 번들 scene_id), 대사 박스는 프레임 위 하단에 표시
      }
    ],
    "fallback": "dim_dialogue",                 // 이미지 없을 때: 배경 암전 + 대사 박스(아래 F)
    "short": { "mode": "banner", "text_key": "..." }   // 반복 전투 단축(기존 scene.short와 동일 규칙)
  }
}
```

- `frames[].key`는 FE manifest 키이고, 서버는 키 문자열만 압니다. `frames`가 비거나 `cutscene`이 없으면 기존 tier A(대화창) 또는 B/C로 동작합니다.
- 서버 검증(시드): 프레임 수 1~3, 키 규칙 일치, `dialogue_ref` 존재, 일본 측 speaker 금지(기존 규칙), est_ms 상한 25초(기존 규칙, 일러스트 컷신은 프레임당 hold 합 + 대사 시간으로 산정).
- 서버가 에셋 존재 여부는 검증하지 않습니다(FE 에셋). 대신 배포 전 검증 스크립트가 "이벤트 JSON의 키가 manifest에 있는지"를 대조합니다(박백엔 시드 검증기 또는 안아트 manifest 검증에 추가). 누락은 오류가 아니라 경고(폴백 동작)로 처리합니다.

##### 1-7-B. 사용 규칙 (전투 전/후 vs 전투 중)

| 구분 | 사용 | 규칙 |
|---|---|---|
| 전투 전(`before_battle`)·후(`after_clear`/`after_first_clear`) 스토리 이벤트 | 허용(주 용도) | 기존 `campaign_ch1_scenes.json` 장면 형식에 `cutscene` 블록 추가. 스테이지당 1~2개, 프레임 1~3장 |
| 전투 중 조건부 이벤트 | 제한 허용 | **스테이지당 최대 1개**, tier A 이벤트에만 사용(예: 보스 등장·결말 선택 직전). 발동 시점은 `turn_start`/`battle_start`/`unit_defeated` 등 서버 판정 시점이며, 입력이 막히는 시간이 길어 `est_ms`를 타이머 가산에 반영(상한 25초, 앞선 규칙 그대로) |
| 선택형 이벤트와 결합 | 선택 직전에만 | 컷신 → 선택 모달 순서. 선택 대기 중에는 컷신 재생 금지 |
| 전투 중 말풍선·캡션 | 불가 | 일러스트는 차단 이벤트 전용 |
| 멀티(PvP)·방 | **비활성** | `events_def` 자체가 없으므로 컷신 0건. FE도 방 모드(`s.mode==='room'`)에서는 `cutscene`을 받아도 재생하지 않는 이중 방어를 둡니다 |
| 반복 전투 | 생략 | 클리어 이력이 있으면 `short`로 대체. 설정 '항상 전체 재생' 선택 가능 |
| 이미 본 컷신 | 재생 기록 기준 | 아래 D |

권고 배치(ch1, 가정): 전투 전/후는 장당 1개씩(s1 개전 전, s7 노량 후 등), 전투 중은 s7(`e01` 야간 개전 직전 컷신 또는 `e05` 독전)과 s10(`e03` 보스 각성) 정도만 시작합니다. 확정은 사용자 결정(질문 7).

##### 1-7-C. FE 재생 규격

- 재생 컴포넌트: `IllustrationCutscene`(전투 중용은 `BattleDialogue` 오버레이와 같은 층에서 동작, 전투 전/후는 `Dialogue` 씬 안에서 같은 컴포넌트 재사용).
- 동작: 프레임 이미지를 화면에 contain 배치 → `fade_in` → `cam`(팬·줌 tween) → 대사 박스(기존 `Dialogue` 대화창 UI 재사용, 화자·초상화는 선택적으로 생략) → `fade_out` → 다음 프레임. 마지막에 전투 화면으로 복귀(전투 중이면 카메라 `restore`).
- 입력: 탭 = 대사 넘기기(프레임 `hold_ms` 중에도), '스킵' 버튼 = 컷신 전체 스킵(첫 재생만 확인창 1회, 기존 `askSkip` 규칙), 로그 버튼 유지.
- 연출 설정: `fxLevel 2`이면 팬·줌 끄고 페이드 최소화(정지 프레임 + 대사만). 배속 설정은 대사 타이핑에만 적용합니다.
- 서버 상태와 분리: 컷신 재생·스킵은 판정에 영향이 없고 서버 상태는 이미 확정되어 있습니다(앞선 1-2-5 규칙 동일). 재접속 시 이미 `ack`된 컷신은 재생하지 않고 `unseen`이면 `short`로 대체합니다.

##### 1-7-D. 재생 기록 저장 (user_seen_events)

권고: **서버에 저장**합니다(멀티 기기·재설치·세이브 이동에서 중복 재생 방지, 다른 이벤트의 `scene_seen`과 같은 저장소 사용).
- 최소 스키마안: `user_seen_events(user_id, event_key, kind['cutscene'|'story'|'pair_dialogue'], first_seen_at, seen_count)`, `UNIQUE(user_id, event_key)`. `event_key`는 `cutscene.<stageId>.<n>` 또는 `battle_event.id`입니다. (테이블·컬럼명은 제안이며 확정 아님)
- 확인 필요: 기존 `scene_seen`(`dialogue_conditions.json` 스펙)이 현재 어디에 저장되는지(세이브/DB/로컬) 코드로 확인 후 통합 여부 결정. 이미 서버 저장소가 있으면 신규 테이블 대신 그 구조를 확장합니다.
- 기록 시점: 컷신이 끝까지 재생되거나 스킵 확정되었을 때 FE가 `POST /api/events/seen {event_key}`(멱등, 인증 사용자만). 서버는 `event_key` 형식·화이트리스트(유효한 이벤트 키)만 검증하고, 판정에는 쓰지 않습니다(연출 편의 정보라 클라 보고를 신뢰해도 안전).
- 활용: (1) 처음 본 컷신은 전체 재생, 본 컷신은 `short` 또는 '다시 보기' 옵션, (2) 스테이지 선택 화면에서 컷신 재열람 메뉴(후속, 선택), (3) 통계는 만들지 않습니다.
- 마이그레이션 시 개발 DB 백업·롤백 방법을 박백엔 보고에 포함해야 합니다(운영 DB 쓰기는 별도 승인 규칙 유지).

##### 1-7-E. 에셋 로딩·메모리 규격 (4MB 초상화 교훈 반영)

| 항목 | 규칙 |
|---|---|
| 해상도 | 16:9 일러스트는 **1920x1080 이하**(권고 1600x900 이하), 모바일 우선 시 1280x720 변형 허용 |
| 포맷 | **WebP**(손실 품질 80~85 시작), PNG 금지(투명 필요 시 별도 협의). 파일 크기 상한 **프레임당 400KB 목표, 600KB 하드 상한**(가정, 안아트·윤프론 측정으로 조정) |
| 메모리 | 텍스처 디코드 크기는 `w*h*4` 바이트라 1920x1080 한 장은 약 8MB입니다. 컷신당 최대 3장이어도 **동시 로드는 현재 프레임 + 다음 프레임 2장**으로 제한하고, 재생 후 즉시 텍스처 파괴(`textures.remove`)합니다. 전투 씬 메모리와 겹치므로 전투 중 컷신은 특히 엄수 |
| 로딩 | **지연 로드**: 전투 시작 시 정의된 컷신 키만 이벤트 발동 전(`battle_start` 직후 + 턴 시작 N턴 전)에 백그라운드 프리로드, 첫 프레임 로드 실패/지연(>1.5초)이면 폴백(F)으로 진행. Preload 씬의 일괄 로드 목록에는 넣지 않습니다(manifest에서 `lazy:true`로 표시) |
| 캐시 | 에셋 URL에 버전 쿼리(`manifest version`) 필요(기존 메모: 브라우저 캐시 문제 있음, 윤프론 과제) |
| 모바일 | 저사양 모드(설정)에서는 프레임 해상도 변형(`...@720`)을 선택 로드. 확인 필요: 변형 키 규칙은 안아트·윤프론 합의 |
| 생성·검증 | 안아트가 manifest 검증 스크립트로 해상도·용량·포맷·키 규칙(`cutscene.<stageId>.<n>(.a|.b|.c)`) 오류 0을 확인. 이미지 생성 API 호출 한도는 별도 승인 필요(컷신 일러스트는 호출 수가 큼, 질문 8) |

manifest 키 규칙(요약)
- 컷신 id: `cutscene.<stageId>.<n>` (예: `cutscene.ch1_s4.1`)
- 프레임: `cutscene.<stageId>.<n>.<a|b|c>` (프레임 1~3장)
- 변형: `...@720`(선택), 폴백 배경: `cutscene.fallback.dim`
- 필드: `{ key, path, w, h, lazy:true, bytes, license/provenance }`

##### 1-7-F. 일러스트가 없을 때의 폴백

- 조건: 프레임 키가 manifest에 없음 / 로드 실패 / 지연 초과 / 저사양 설정에서 비활성.
- 동작: **배경 암전(전투 중이면 전투 화면 위 검은 오버레이 alpha 0.7, 전투 전·후는 단색 배경) + 기존 대사 박스 + 장면 캡션 한 줄(예: 장소·사건 이름)**. 팬·줌·프레임 전환은 생략하고 대사만 진행합니다.
- 서버 영향 없음, 효과·타이머 가산도 동일. 폴백 동작을 기본 테스트 경로로 둡니다(일러스트 없이도 전 이벤트가 진행 가능해야 함).
- 개발 중 표시: 개발 환경에서 폴백이 발동하면 콘솔 warn 1회(`Dialogue.js`의 초상화 누락 warn 방식과 동일).

---

### ② 현재 코드 갭 분석표

난이도는 상/중/하(가정)이고, 담당은 박백엔(BE/엔진)·윤프론(FE)·안아트(에셋)·임밸런(밸런스·맵)·송서사(대사)입니다.

| # | 요구 기능 | 엔진 | BE | FE | 필요한 작업 | 난이도 | 담당 |
|---|---|---|---|---|---|---|---|
| 1 | 이벤트 정의·평가 훅(턴/행동/격파/상태) | 없음 | 정의 컬럼 없음 | - | `Engine`에 평가기·훅 4곳·`state.bev` 추가. 스키마 검증기(시드). `battle_start` 훅은 `confirmDeployment` 연결 | 상 | 박백엔 |
| 2 | 턴 이벤트(turn_start) | `turn_start` emit 있음 | - | `turnStart` 배너 있음 | 평가 호출만 연결. 교대 on(`endRound`)도 | 하 | 박백엔 |
| 3 | 유닛 행동·위치 조건 | 유닛 좌표·`hp` 있음 | - | - | zone 정의(`maps.meta.event_zones`)·조건 leaf 구현 | 중 | 박백엔·임밸런(zone 좌표) |
| 4 | 증원 소환(적/아군) | **유닛 추가 API 없음**(`makeUnit`은 있음) | 아군은 `init_count`·별 조건 영향 | `syncViews`가 새 id 뷰 생성 | `Engine::spawnUnits`, id 규칙, `leader_id`, `ready`, 별 제외 플래그, `init_hp` 정책, 스폰 연출(FE) | 중상 | 박백엔·윤프론 |
| 5 | NPC(AI 조작) 아군 | 없음(a측은 플레이어 조작) | - | - | 1차는 플레이어 조작 유닛으로 한정, AI 자동 행동은 2차 이후 판단 | 상 | 박백엔(보류) |
| 6 | 지형 변경 | `state.tiles` 변경만으로 이동 판정 갱신 | `view().tile_layer`가 정적 → `tile_patch` 필요 | 셀 재렌더 API 필요 | `terrain_change` 효과·`tile_patch` 누적·점유 정책, FE 셀 갱신 | 중 | 박백엔·윤프론 |
| 7 | 지형 신규 종류(화공·먹물) | `terrains.json` 신규 코드 필요 | 시드 | 타일 이미지 | ch1 골격은 **기존 코드만 사용**(먹물=늪 x, 붕괴=절벽 k). 화공은 이후 단계 | 중 | 임밸런·안아트 |
| 8 | 목표 변경·보조 목표 | `normalizeObjective`는 survive만 | `view.objective` | 목표 HUD(survive 남은 턴) | `sub_objectives` 표시(승패 비영향), 별 조건 연동은 선택 | 중 | 박백엔·윤프론 |
| 9 | AI 패턴 변경·매복·파상 | `HeuristicBot` 옵션은 config 전역 | `botTurn`이 전역 옵션 사용 | - | `state.bev.ai[tag]` 오버라이드 + 모드(hold/advance/wave/funnel/flee/assault) + `enemy_squad` `tag` 필드 | 상 | 박백엔 |
| 10 | 버프·디버프(이벤트) | `useBuff`/`buff_expire` 있음 | - | 버프 아이콘 | 진영·태그 단위 적용, 합계 한도 검증 | 중 | 박백엔 |
| 11 | 강제 후퇴 | 유닛 제거는 `resolveDeath`만 | - | 퇴각 연출 | `retreat` 이벤트·제거(지휘관 제외) | 하~중 | 박백엔 |
| 12 | 선택형 이벤트 | 없음 | API·`pending_choice`·타임아웃 없음 | 선택 모달 없음 | `event-choice` API, 409 `choice_pending`, 타임아웃 기본값, 결과 저장 | 상 | 박백엔·윤프론 |
| 13 | `battle_event` 응답·재접속 중복 방지 | `emit` 가능 | `ack` API·`unseen` 없음 | `playEvents`는 모르는 type 무시 | `ack_seq`, `view.bev`, FE 요약 재생 | 중 | 박백엔·윤프론 |
| 14 | 턴 타이머 컷신 가산 | - | `syncStageDeadline` 단순 | 타이머 표시 있음 | est_ms 가산(상한 25초) | 하 | 박백엔 |
| 15 | FE 재생 큐·조작 잠금 | - | - | `fx.enqueue`/`skip`/`paused`/`playing` 있음 | `battle_event` 핸들러·`eventLock`·스킵 버튼 | 중 | 윤프론 |
| 16 | 전투 중 대화창 | - | - | `Dialogue.js`는 씬 전환형(전투 상태 유실) | `BattleDialogue` 오버레이 신설(`speakerInfo`/`fillTokens` 재사용), caption/NPC speaker | 중 | 윤프론 |
| 17 | 카메라 연출 | - | - | `followTile`/`setZoomK`/`kAll` 있음 | `CameraDirector`(focus/overview/pan/restore) | 중 | 윤프론 |
| 18 | 날씨·조명 | - | - | 없음 | `worldFx` 레이어 오버레이, 강도 단계, 모바일 하향 | 중 | 윤프론·안아트(텍스처) |
| 19 | 전투 중 말풍선 | - | - | 없음 | 말풍선 UI + 평가기(결정적 해시) + 예산·쿨다운 | 중 | 윤프론·송서사(대사) |
| 20 | 조건부 대사 평가기 | - | - | **미구현**(`dialogue_conditions.json`) | 공통 평가기 1개로 장면·말풍선 공용 | 중 | 윤프론 |
| 21 | 영웅 간 특수 대화 | - | `hero_relations` 소스 | 없음 | 쌍 트리거·`scene_seen` 저장 | 중 | 윤프론·박백엔 |
| 22 | 시뮬레이터 반영 | 이벤트가 엔진 안이면 자동 | `Simulator`는 이벤트 off 옵션 필요 | - | 시뮬 옵션 `events:on/off`, 이벤트별 발동률 보고 | 하~중 | 박백엔·임밸런 |
| 23 | 스테이지 편성 확장 | `addGenericSide` | `enemy_squad.tag` | - | tag, 증원 정의 | 중 | 박백엔 |
| 24 | s8~s10 맵·편성·목표 | - | **시드 없음** | - | 맵·적 편성·목표 확정(임밸런), `game:seed-ch1` 확장 | 중 | 임밸런·박백엔 |
| 25 | 마물/그림자 병종 | 미구현(기존 메모) | - | 스프라이트 | 구현 전까지는 일반 병종 + 시각 태그 `shadow` 폴백 | 중 | 박백엔·안아트 |
| 26 | 대사 번들 동기화 | - | - | FE 복사본이 원본과 불일치 위험(메모) | `docker/sync_dialogue_data.mjs` 절차 준수 | 하 | 윤프론 |
| 27 | 이벤트 시드 검증기 | - | 없음 | - | 스키마·zone 존재·id 중복·순환·허용 effect·일본 측 speaker 금지·지형 symbol 검증 | 중 | 박백엔 |
| 28 | 컷신 데이터 모델(`scene.cutscene`) | 없음 | 시드 스키마·검증기 확장 | - | 프레임 1~3장·키 규칙·`dialogue_ref` 검증, `battle_event.scene.cutscene` 직렬화 | 하~중 | 박백엔 |
| 29 | 일러스트 컷신 재생기 | - | - | 없음 | `IllustrationCutscene`(페이드·팬·줌·대사 박스·스킵·`fxLevel`), 전투 전/후(Dialogue 씬)와 전투 중(오버레이) 공용화 | 중 | 윤프론 |
| 30 | 지연 로드·텍스처 파괴·폴백 | - | - | `assets.js`는 일괄 로드 위주 | `lazy` manifest 처리, 프리로드 타이밍, 로드 실패 폴백, 파괴 | 중 | 윤프론 |
| 31 | 재생 기록 `user_seen_events` | - | 신규 테이블·`POST /api/events/seen`(멱등) 또는 기존 `scene_seen` 확장 | 재생 전 조회·종료 시 보고 | 기존 `scene_seen` 저장소 확인 후 결정, 마이그레이션(백업·롤백 보고) | 중 | 박백엔·윤프론 |
| 32 | 컷신 일러스트 에셋 생산·검증 | - | - | manifest 검증 | 컷신별 1~3장, WebP·1920x1080 이하·용량 상한, 키 규칙 검증 스크립트, 호출 한도 승인 | 상(비용) | 안아트 |
| 33 | 멀티 비활성 이중 방어 | `events_def` 없음 | 방 모드 `defs` 미주입 테스트 | `s.mode==='room'`이면 재생 무시 | 단위 테스트 1개 + FE 가드 | 하 | 박백엔·윤프론 |
| 34 | 컷신 다시 보기(선택) | - | `user_seen_events` 조회 API | 스테이지 상세에 버튼 | 후속 과제 | 하 | 윤프론 |

---

### ③ 구현 단계 로드맵

모든 단계 공통: 새 코드는 스테이지 전투 생성 시 `defs`가 있을 때만 동작하고, 정의가 없는 전투(방·기존 스테이지·진행 중 전투)는 동작이 달라지지 않아야 합니다.

| 단계 | 범위 | 인수조건 (테스트 가능) |
|---|---|---|
| **MVP** | 이벤트 모델·평가기(`battle_start`, `turn_start`), `battle_event` 응답, 대화창 오버레이, 카메라 focus/overview/restore, 목표 표시 보강, 스킵, `ack`/재접속 요약, 타이머 가산. 효과는 `set_flag`·`sub_objective`·`buff`만<br>**[보완본 추가·1-7]** 컷신 데이터 모델·검증기, 재생기(정지 프레임 1~3장 + 페이드 + 대사 박스 + 스킵), **폴백(암전+대사 박스)**, 전투 전/후 스토리 장면 1개(예: `ch1_s1_pre`)에 적용, 방 모드 비활성 | (1) `ch1_s1` 전투 시작 시 이벤트 e01이 응답 `events`에 정확히 1회 포함됩니다. (2) 2라운드 적군 턴 시작에 e02가 발동하고 `once`로 재발동하지 않습니다. (3) 스킵해도 `effects_applied`와 이후 서버 상태가 같습니다. (4) 새로고침 후 이미 본 이벤트는 재생되지 않고 `unseen`만 요약 재생됩니다. (5) 방 전투·기존 stage_01~06·진행 중 기존 전투에 `battle_event`가 0건입니다. (6) 차단 이벤트 재생 중 입력이 잠기고 종료 후 풀립니다. (7) 컷신 시간만큼 턴 마감이 서버에서 연장됩니다.<br>**[보완본 추가]** (c1) 일러스트 키가 없어도 이벤트·장면이 오류 없이 폴백으로 끝까지 재생됩니다. (c2) 컷신 스킵 후 전투 상태가 비스킵과 같습니다. (c3) 방 전투·PvP에서 컷신이 재생되지 않습니다. (c4) 프레임 4장 이상 또는 키 규칙 위반 정의는 시드 검증기가 거부합니다. (c5) 스킵·종료 시 `user_seen_events`에 멱등 기록되고 재접속 시 재생되지 않습니다(저장소 결정 후). |
| **2단계** | `after_action`/`unit_defeated` 트리거, zone·`unit_in_area`·`unit_hp_pct`·`adjacent`, `spawn`, `force_retreat`, `ai_pattern`, 말풍선·대사 유형 1~7·10, 조건부 대사 평가기<br>**[보완본 추가·1-7]** 전투 중 컷신 1개(차단 이벤트, 타이머 가산 연동), 지연 로드·프리로드·텍스처 파괴, 팬/줌, `short` 대체 | (1) zone 진입 이벤트가 진입 행동 직후 같은 응답에서 발동합니다. (2) 증원 유닛이 정의된 칸에 `ready:false`로 생기고 점유 칸이면 다음 칸으로 생성되며 칸이 없으면 `skipped`가 기록됩니다. (3) `exclude_stars` 유닛은 `all_alive`·`init_count` 판정에 영향을 주지 않습니다. (4) 적 지휘관 사망 시 증원 적도 붕괴합니다. (5) `ai_pattern` 변경 후 봇 행동 로그에서 모드 차이가 나타납니다. (6) 말풍선은 쿨다운·상한을 지키고 같은 `seq`로 재생해도 결과가 같습니다. (7) 시뮬레이터가 이벤트 on/off 모두 돌아갑니다.<br>**[보완본 추가]** (c1) 전투 중 컷신 재생 시간만큼 서버 턴 마감이 연장됩니다(상한 25초). (c2) 로드 지연·실패 시 1.5초 안에 폴백으로 전환합니다. (c3) 컷신 종료 후 텍스처가 해제되어 전투 씬 메모리가 컷신 전 수준으로 복귀합니다(`window` 진단 또는 프로파일 확인). (c4) 클리어 이력이 있는 스테이지는 `short`로 대체됩니다. |
| **3단계** | `terrain_change`·`tile_patch` 렌더, 날씨·조명, 선택형 이벤트(`event-choice`, 타임아웃), 반복 전투 `short` 모드, 대사 유형 8·9 일부<br>**[보완본 추가·1-7]** 실제 일러스트 에셋 적용(안아트 생산분), 해상도 변형(@720)·저사양 모드, 선택 이벤트 직전 컷신 결합, 컷신 다시 보기 | (1) 지형 변경 후 해당 칸 이동 가능 타일이 서버·FE 모두 갱신됩니다. (2) 유닛이 점유한 칸은 변경에서 제외되어 `skipped:occupied`로 남습니다. (3) 선택 대기 중 행동이 409로 거부되고, 30초 경과 시 기본값이 적용되며, 같은 선택 중복 요청은 멱등입니다. (4) 새로고침 후에도 `pending_choice`가 복원됩니다. (5) 클리어 이력이 있는 스테이지는 `short`로 대체되고 서버 판정은 동일합니다.<br>**[보완본 추가]** (c1) 모든 컷신 프레임이 WebP·1920x1080 이하·용량 상한을 만족합니다(검증 스크립트 오류 0). (c2) 선택 이벤트는 컷신 종료 후에만 모달이 뜹니다. (c3) 저사양 설정에서 변형 이미지가 로드됩니다. |
| **4단계** | 영웅 조합·적대 쌍·수집 영웅 폴백 대사(병종·문화권), 11장 이후 공통 규칙, 화공·날씨 규칙 효과(필요 시 신규 지형 코드)<br>**[보완본 추가·1-7]** 11장 이후 장 공통 규칙 적용(키 규칙·재생 기록 재사용) | (1) 수집 영웅(개별 대사 없음)도 병종·문화권 풀에서 말풍선이 나옵니다. (2) 한 쌍의 특수 대화는 세이브당 1회만 재생됩니다. (3) `hero_relations`의 같은 편·적대 규칙이 모두 동작합니다.<br>**[보완본 추가]** 새 장 컷신이 코드 변경 없이 데이터 추가만으로 재생됩니다. |

권고 최소 증분(되돌리기 쉬움): MVP를 `ch1_s1`~`s3` 3개 스테이지에만 정의를 넣고 시작합니다. 정의가 없으면 기존 동작과 동일하므로 컬럼·훅만 남겨도 영향이 없습니다.

---

### ④ 1~10장 이벤트 골격 목록 (대사 본문 제외)

**표기**
- **시점**: `BS`=전투 시작(배치 확정 직후), `T{n}a`=n라운드 아군 턴 시작, `T{n}b`=n라운드 적군 턴 시작, `AA`=행동 직후, `KO`=격파 직후, `END`=전투 종료.
- **분류**: 사실=기록 확인, 각색=사실 기반이나 전투 구현은 창작, 허구. `검증`=사실 근거 약함.
- **엔진**: M=MVP, P2/P3/P4=위 로드맵 단계에서 구현. **현재 코드로는 전부 불가**(이벤트 훅 자체가 없음). 즉 "지금 가능"은 전투 전/후 대사뿐입니다.
- **효과 수치**: 모두 가정이며 임밸런 시뮬로 확정합니다. 이벤트 버프 합은 ±15% 이내입니다.
- **zone**: `z_*`는 `maps.meta.event_zones`에 임밸런이 좌표를 정의해야 하는 영역입니다(맵 JSON 확인 필요).
- 일본 측 인물 대사는 없고, 적 지휘관은 자막·해설로만 표기합니다. 전투 중 이순신 전사 연출은 없습니다(outline 방침: 엔딩 기록으로만).

#### 1장 옥포 (pk_01 16x12, 적 3, 지휘관 격파, 별 8턴)
| ID | 이름 | 발생 조건 | 시점 | 게임 효과 | 후속 | 분류 | 엔진 |
|---|---|---|---|---|---|---|---|
| ch1_s1_e01 | 옥포 개전 | 전투 시작. 카메라: 아군에서 적 진영으로 이동 | BS | 목표 표시(지휘관 격파), 조작 해방 | e02 | 각색(해전→평원 재해석, 옥포 해전 자체는 사실) | M |
| ch1_s1_e02 | 적 함대의 반격 | 2라운드 적군 턴 시작 | T2b | 적 `ai_pattern`:`advance`(지휘관 포함 전진), 공격 방향 마커·적 접근 경로 하이라이트 | e03 | 각색 | P2 |
| ch1_s1_e03 | 이순신의 전술 지시 | 적 비지휘관 최초 격파(`KO`, 1회). 이순신 파티 포함 필요(`requires`, 없으면 연출 줄 생략) | KO | 아군 전체 `atk +10%` 2턴(`buff`) | e04 | 각색 | P2 |
| ch1_s1_e04 | 옥포의 승전 | 적 지휘관 격파(승리) | END | 없음(결과 연출만) | - | 사실(옥포 첫 승전) | M |

#### 2장 정암진 (pk_02 16x12, 적 4 창병, 지휘관 격파, 별 9턴)
| ID | 이름 | 발생 조건 | 시점 | 게임 효과 | 후속 | 분류 | 엔진 |
|---|---|---|---|---|---|---|---|
| ch1_s2_e01 | 나루터의 대치 | 전투 시작. 카메라: 강 전체 → 다리·여울 | BS | 보조 목표 표시: 다리·여울 방어 | e02 | 각색(다리 지형은 맵 구성 연출) | M |
| ch1_s2_e02 | 도하 시도 | 2라운드 적군 턴 시작 | T2b | 적 `ai_pattern`:`assault`(`to_zone:z_bridge`), 도하 칸 3개 마커 | e03 | 사실(정암진 도하 저지)·각색(구체 전개) | P2 |
| ch1_s2_e03 | 의병의 매복 기습 | 적 유닛이 `z_ford`에 최초 진입(`AA`) 또는 4라운드 적군 턴 시작 중 먼저 충족, 곽재우 파티 포함 시 연출 줄 추가 | AA/T4b | 아군 의병 부대 2기 스폰(`z_forest_ambush`, `ready:false`, `exclude_stars`) | e04 | 각색, 검증(매복 세부·정암진 다리·지형 연출은 사료 근거 없음) | P2 |
| ch1_s2_e04 | 도하 저지 | 적 지휘관 격파(승리) | END | 결과 연출 | - | 사실(곽재우, accepted) | M |

#### 3장 한산도 (pk_19 24x16, 적 5 궁병, 지휘관 격파, 별 10턴)
| ID | 이름 | 발생 조건 | 시점 | 게임 효과 | 후속 | 분류 | 엔진 |
|---|---|---|---|---|---|---|---|
| ch1_s3_e01 | 견내량의 대치 | 전투 시작. 카메라: 호수 전체 | BS | 보조 목표 표시: 적을 호수 중앙으로 유인 | e02 | 각색(해전→호수 순환로) | M |
| ch1_s3_e02 | 유인 | 아군 유닛이 `z_lure_trigger` 진입(`AA`) 또는 3라운드 아군 턴 시작 | AA/T3a | 적 `ai_pattern`:`advance`(지휘 위치 이탈), 카메라 적 추격 선 | e03 | 각색(유인 전술은 사실) | P2 |
| ch1_s3_e03 | 학익진 전개 | 아군 3기 이상이 `z_crane_arc`에 위치(`AA`) 또는 5라운드 아군 턴 시작 | AA/T5a | 아군 `atk +10%` 2턴, 진형 라인 FX | e04 | 사실(학익진), 구현 각색 | P2 |
| ch1_s3_e04 | 포위망 완성 | 적 지휘관 인접 칸에 아군 2기 이상(`AA`, 1회) | AA | 적 전체 `atk −10%` 2턴, 지휘관 클로즈업 | - | 각색 | P2 |

#### 4장 진주성 (pk_06 28x20, 아군=성 안, 8턴 생존, 적 7 검병, 별: 지휘관 HP 50% 이상)
| ID | 이름 | 발생 조건 | 시점 | 게임 효과 | 후속 | 분류 | 엔진 |
|---|---|---|---|---|---|---|---|
| ch1_s4_e01 | 성을 둘러싼 적 | 전투 시작. 카메라: 성벽 위에서 적 포켓 2곳 | BS | 목표 표시(8턴 생존, 남은 턴 HUD는 기존) | e02 | 사실(제1차 진주성 전투) | M |
| ch1_s4_e02 | 공성 개시 | 2라운드 적군 턴 시작 | T2b | 적 `ai_pattern`:`assault`(성문 방향, 양 포켓 동시), 북소리 SFX | e03 | 각색(8턴 압축) | P2 |
| ch1_s4_e03 | 성내 증원 | 4라운드 아군 턴 시작 | T4a | 아군 궁병 2기 스폰(`z_keep_inner`, `exclude_stars`, 도착 턴 `ready:false`) | e04 | 각색, 검증(증원 사실 근거 없음) | P2 |
| ch1_s4_e04 | 성 밖의 의병 | 6라운드 적군 턴 시작 | T6b | 적 `rear_pocket` 태그 1기 `force_retreat`, 자막 | e05 | 사실(성 밖 견제)·곽재우 본인 지원 범위 검증 | P2 |
| ch1_s4_e05 | 마지막 공세 | 남은 턴 2 이하(`survive_remaining≤2`) 아군 턴 시작 | T7a | 적 `ai_pattern`:`assault`(전원), 보조 목표 '끝까지 버텨라' 표시 | - | 각색 | P2 |

(김시민 부상·사망은 전투 중 연출하지 않고 사후 장면 서술만: outline 방침.)

#### 5장 평양성 (pk_18 28x20, 아군 공격, 적 6 창병, 지휘관 격파, 별 11턴)
| ID | 이름 | 발생 조건 | 시점 | 게임 효과 | 후속 | 분류 | 엔진 |
|---|---|---|---|---|---|---|---|
| ch1_s5_e01 | 평양성 앞 | 전투 시작. 연합군 도착 자막(이여송은 NPC·자막만) | BS | 목표 표시(성 안 지휘관 격파) | e02 | 사실(평양성 전투), 이순신 참전은 각색 | M |
| ch1_s5_e02 | 해자를 건너다 | 아군이 `z_moat_bank`에 최초 진입(`AA`) 또는 3라운드 아군 턴 시작 | AA/T3a | `terrain_change`: `z_moat_cross` 해자 칸 `water→shallows`(건널 수 있게 됨) | e03 | 각색, 검증(해자 얼음·지형은 맵 연출, 사료상 퇴각로는 대동강) | P3 |
| ch1_s5_e03 | 연합군 투입 경로 | 4라운드 아군 턴 시작 | T4a | **선택**: A 서문 / B 남문. 선택한 쪽 `z_ally_gate_A/B`에 아군 창병 2기 스폰(`exclude_stars`). 반대편 적 1기는 선택 후 `ai_pattern`으로 그쪽으로 이동. 기본값 A | e04 | 각색(경로 선택은 각색 허용 영역) | P3 |
| ch1_s5_e04 | 성문 돌파 | 아군이 `z_gate_main` 칸 진입(`AA`) | AA | `terrain_change`: 성벽 2칸 `wall→plain`(진입 경로 확장), 화면 흔들림 | e05 | 각색, 검증(포·화약 사용 설은 출처 확인 필요) | P3 |
| ch1_s5_e05 | 최종 공세 | 적 지휘관 HP 50% 이하(`AA`, 1회) | AA | 적 지휘관 `ai_pattern`:`flee`(`to_zone:z_keep`), 자막(야간 대동강 퇴각은 사실) | - | 사실(밤 대동강 철수)·구현 각색 | P2 |

#### 6장 행주산성 (pk_06 재사용, 10턴 생존, 적 5 궁병 Lv3, 별: 지휘관 HP 50% 이상)
| ID | 이름 | 발생 조건 | 시점 | 게임 효과 | 후속 | 분류 | 엔진 |
|---|---|---|---|---|---|---|---|
| ch1_s6_e01 | 행주의 새벽 | 전투 시작. 날씨: 옅은 안개(시각만) | BS | 목표 표시(10턴 생존) | e02 | 사실(행주대첩), 이순신 참전 각색 | M, 날씨 P3 |
| ch1_s6_e02 | 1차 공세 | 2라운드 적군 턴 시작 | T2b | 적 `wave1` 태그 2기 `ai_pattern`:`wave`(전진 시작), 나머지는 `hold` | e03 | 각색 | P2 |
| ch1_s6_e03 | 2차 공세 | 4라운드 적군 턴 시작 | T4b | 적 `wave2` 태그 전진, 카메라 적 이동 | e04 | 각색 | P2 |
| ch1_s6_e04 | 방어선 붕괴 위기 | 아군 생존 수가 시작 수의 50% 이하(`AA`, 1회) | AA | 아군 전체 `def +15%` 2턴(역전 보조), 경고 배너 | e05 | 각색 | P2 |
| ch1_s6_e05 | 최후의 방어 | 남은 턴 1(`survive_remaining==1`) 아군 턴 시작 | T9a | 적 `ai_pattern`:`assault`(전원), 아군 `atk +10%` 1턴 | - | 각색(행주치마 등 민간 전승은 사용하지 않음) | P2 |

#### 7장 노량 (pk_10 28x20, 보스 지휘관 HP x1.3, 적 9 검병, 지휘관 격파, 별 12턴)
| ID | 이름 | 발생 조건 | 시점 | 게임 효과 | 후속 | 분류 | 엔진 |
|---|---|---|---|---|---|---|---|
| ch1_s7_e01 | 야간 해전 개전 | 전투 시작. 조명: 밤(알파 오버레이) | BS | 목표 표시 | e02 | 사실(노량 해전), 평지 재해석 각색 | M, 조명 P3 |
| ch1_s7_e02 | 혼전 | 3라운드 적군 턴 시작 | T3b | 적 `ai_pattern`:`assault`(전원), 화면 흔들림·횃불 FX | e03 | 각색 | P2 |
| ch1_s7_e03 | 명 수군 합류 | 4라운드 아군 턴 시작 | T4a | 아군(명) 창병 2기 스폰(`z_ally_shore`, `exclude_stars`), 진린은 NPC 자막만 | e04 | 사실(조명 연합), 구현 각색 | P2 |
| ch1_s7_e04 | 적장의 퇴로 | 적 지휘관 HP 50% 이하(`AA`, 1회) | AA | 적 지휘관 `ai_pattern`:`flee`(퇴로 방향), 보조 목표 '지휘관을 놓치지 마라' | e05 | 각색(철수 시도는 사실) | P2 |
| ch1_s7_e05 | 마지막 독전 | 10라운드 아군 턴 시작 또는 이순신 HP 30% 이하(`AA`) 중 먼저 | T10a/AA | 이순신 부대 `atk +10%` 2턴, 이순신 클로즈업 (**전투 중 사망 연출 없음**) | - | 사실(독전)·구현 각색 | P2 |

#### 8장 번진 서가 (허구, 맵·목표 임밸런 확정 필요. 가정: 맵 후보 pk_09 늪지, 지휘관 격파)
| ID | 이름 | 발생 조건 | 시점 | 게임 효과 | 후속 | 분류 | 엔진 |
|---|---|---|---|---|---|---|---|
| ch1_s8_e01 | 먹물의 번짐 | 전투 시작. 날씨: 먹물 방울 | BS | 목표 표시, `flag ink=0` | e02 | 허구 | M, 날씨 P3 |
| ch1_s8_e02 | 먹물 확산 | 3·5·7라운드 적군 턴 시작(`repeat{max:3,every:2}`) | T3b/T5b/T7b | `terrain_change`: 회차별 `z_ink_1/2/3` 평지→늪(`x`, 기병 불가·이동 비용↑). 점유 칸은 건너뜀 | e03 | 허구 | P3 |
| ch1_s8_e03 | 그림자의 등장 | 4라운드 적군 턴 시작 | T4b | 적 그림자 2기 스폰(`z_ink_core`, 임시 병종 폴백, 시각 태그 `shadow`, `ready:false`) | e04 | 허구 | P2 |
| ch1_s8_e04 | 선택: 번짐 차단 vs 그림자 추격 | 그림자 최초 격파(`KO`) 또는 6라운드 아군 턴 시작 | KO/T6a | **선택**: A 차단(먹물 칸 늪→평지 복구, 이후 확산 중지) / B 추격(적 그림자 1기 `force_retreat`, 확산 계속). 기본값 A. 허구라 후속 대사만 분기 | e05 | 허구 | P3 |
| ch1_s8_e05 | 서가의 안정 | 적 지휘관 격파(승리) | END | 먹물 후퇴 연출 | - | 허구 | M |

#### 9장 명량 (1597, 맵 가정 pk_14 두 강, 목표 가정 10턴 생존 — 임밸런 확정 필요)
| ID | 이름 | 발생 조건 | 시점 | 게임 효과 | 후속 | 분류 | 엔진 |
|---|---|---|---|---|---|---|---|
| ch1_s9_e01 | 압도적인 적 | 전투 시작. 카메라: 원경 장식 적 대열(시각만, 유닛 아님) | BS | 목표 표시. 규모 수치(척 수)는 표기하지 않음 | e02 | 사실(명량 해전), 수치 검증 필요 | M |
| ch1_s9_e02 | 좁은 물길 | 2라운드 적군 턴 시작 | T2b | 적 `ai_pattern`:`funnel`(병목 방향 집중), 병목 칸 강조 | e03 | 각색 | P2 |
| ch1_s9_e03 | 적 증원의 파도 | 4라운드 적군 턴 시작 | T4b | 적 3기 스폰(`z_enemy_pocket`, `ready:false`) | e04 | 각색(적 규모 압도감) | P2 |
| ch1_s9_e04 | 물살의 전환 | 남은 턴 5 이하(`survive_remaining≤5`) 아군 턴 시작 | T6a | 아군 전체 이동 +1(3턴), 적 전체 이동 −1(3턴), 조류 화살표 오버레이 | e05 | 사실(조류 방향 전환이 승인으로 서술), 시각 검증 필요 | P3 |
| ch1_s9_e05 | 선봉의 쓰러짐 | 적 `vanguard` 태그 유닛 격파(`KO`, 1회) | KO | 적 전체 `atk −15%` 2턴, 카메라 | - | 각색, 검증(적장 격파 일화, 이름 비표기) | P2 |

(곽재우·주인공 참전은 각색: 명량에 의병 참전은 확인되지 않음.)

#### 10장 마지막 서가 (허구, 맵 임밸런 확정 필요. 가정: 맵 후보 pk_12 중앙 요새, 지휘관 격파)
| ID | 이름 | 발생 조건 | 시점 | 게임 효과 | 후속 | 분류 | 엔진 |
|---|---|---|---|---|---|---|---|
| ch1_s10_e01 | 기록의 붕괴 | 전투 시작. 날씨: 먹물 폭풍, 보스 실루엣 등장 연출 | BS | 목표 표시 | e02 | 허구 | M, 날씨 P3 |
| ch1_s10_e02 | 붕괴 진행 | 4·6·8라운드 적군 턴 시작(`repeat{max:3,every:2}`) | T4b/T6b/T8b | `terrain_change`: 외곽 링 칸 평지→절벽(`k`, 이동 불가). 점유 칸은 건너뜀. 중앙 요새는 유지 | e03 | 허구 | P3 |
| ch1_s10_e03 | 최종 보스 각성 | 적 지휘관 HP 50% 이하(`AA`, 1회) | AA | 적 잔영 2기 스폰, 적 지휘관 `atk +10%`, `ai_pattern`:`assault` | e04 | 허구 | P2 |
| ch1_s10_e04 | 선택: 기록의 결말 | 적 지휘관 HP 20% 이하(`AA`, 1회) | AA | **선택**: A 봉인 / B 해방. 능력치·난이도 영향 없음, `result.choices`에 저장해 후속 장면(`ch1_s10_post`) 분기. 기본값 A | e05 | 허구 | P3 |
| ch1_s10_e05 | 마지막 결전의 끝 | 적 지휘관 격파(승리) | END | 결과 연출 | - | 허구 | M |

**임밸런이 맵 JSON에 정의해야 할 zone 목록(좌표는 맵 확인 필요)**
- s2: `z_bridge`, `z_ford`, `z_forest_ambush`.
- s3: `z_lure_trigger`, `z_crane_arc`.
- s4/s6: `z_keep_inner`, `z_gate_*`.
- s5: `z_moat_bank`, `z_moat_cross`, `z_ally_gate_A/B`, `z_gate_main`, `z_keep`.
- s7: `z_ally_shore`.
- s8: `z_ink_1/2/3`, `z_ink_core`.
- s9: `z_enemy_pocket`.
- s10: 외곽 링 3개.
- 적 편성 `tag`: `rear_pocket`, `wave1/2`, `vanguard`.

---

### ⑤ 지적 사항 (설계 위험과 개선안)

1. **원문 예시와 일본 측 대사 금지의 충돌**: 10-6 예시의 적군 지휘관 대사는 확정 제약 위반입니다. 개선: 적 지휘관은 `caption` speaker(자막)·시오리 해설·아군 반응으로 처리합니다. 허구 적(그림자)은 대사 가능합니다. 시드 검증기가 일본 측 인물 speaker를 거부하게 합니다.
2. **서버는 FE를 기다리지 않음 → 타이머 침식**: 컷신이 60초 입력 시간을 갉아먹습니다. 개선: 서버가 `est_ms`를 마감에 가산(상한 25초)합니다. 대안으로 타이머 정지는 서버 복잡도가 높아 비권고입니다(질문 3).
3. **재접속·중복 재생**: `ack_seq`와 `unseen` 요약 재생으로 해결합니다. 한계: `ack`는 클라이언트 보고라 연출 상태일 뿐 판정에는 쓰지 않습니다. 기기 간 이동 시 최대 3개 요약 재생을 허용합니다.
4. **증원이 별·정산·HP 판정에 주는 영향**: `all_alive`가 `alive >= init_count['a']`라 아군 증원이 있으면 원 유닛 사망을 가립니다. 개선: `exclude_stars` 유닛은 `alive` 집계에서 제외합니다. 적 증원은 `init_hp['b']`에 합산할지 결정이 필요합니다. 권고는 합산하지 않음(턴 제한 판정은 survive가 우선이고 지휘관 격파 목표라 영향 적음)이며, 임밸런 확인이 필요합니다.
5. **이벤트가 밸런스·승패에 주는 영향**: 현재 시뮬 s4·s7은 0%대로 비현실적이라는 기존 메모가 있어 이벤트 효과를 얹어도 판단 근거가 약합니다. 개선: `Simulator`에 `events:on/off`를 두고 on/off 승률 차가 큰 이벤트는 효과를 조정합니다. 버프 합 ±15% 이내, 증원은 도착 턴 행동 불가, 편의 이벤트(역전 보조)는 1회 한정으로 합니다. 이벤트 효과는 임밸런 최종 일괄 밸런스 단계와 함께 확정합니다.
6. **선택 이벤트와 역사 왜곡**: 4개(s5·s8·s10·s2 후보)로 제한하고 사실 사건 결과는 바꾸지 않습니다. `what_if` 배지·`verify` 줄 숨김 규칙을 이벤트 장면에도 적용합니다. 척 수·사상자 같은 수치는 대사·자막에서 쓰지 않습니다.
7. **이순신 전사**: 엔딩 기록으로만 처리한다는 방침에 따라 s7 이벤트에서 전사 연출을 제외했습니다. 전투 중 이순신이 격파될 수는 있는 일반 유닛이라 그 경우 별도 처리(`defeat` 메시지)는 확인 필요입니다.
8. **멀티 영향**: 이벤트 평가를 `Engine::apply`에 두므로 PvP·방 전투에서 `events_def`가 있으면 자동 발동합니다. 개선: `RoomService`/`BattleService`가 전투 생성 시 mode에 따라 `defs`를 넣지 않는 것을 단위 테스트로 고정합니다. 방 solo도 제외로 가정(변경 시 확인).
9. **FE 구조 위험**: 대화창을 `Dialogue` 씬 전환으로 만들면 전투 씬이 재시작되어 연출 큐·카메라가 유실됩니다. 오버레이 방식으로 갑니다. 지형 셀 단위 재렌더 가능 여부(`RmGround`/`UnityGround`)는 확인 필요입니다. 불가하면 변경 시 맵 일괄 재렌더(성능 비용)로 대체합니다.
10. **제작 비용·QA 부담**: 이벤트 47개 × 대사·연출·테스트는 큽니다. 개선: tier A(대화창 컷신) 10개 안팎, B(말풍선+카메라), C(자막)로 나눠 A만 장당 1~2개로 한정합니다. QA는 이벤트별 "발동 1회 / 스킵 / 재접속 / 방 전투 0건" 4항목 최소 체크로 합니다.
11. **봇·AI 확장 위험**: `ai_pattern`은 `HeuristicBot` 옵션을 전투별로 덮어써야 해서 기존 봇 테스트·시뮬 재현성에 영향이 있습니다. 개선: 모드는 `hold`/`advance`/`assault`/`wave`/`funnel`/`flee` 6종으로 한정하고 각각 기존 봇 옵션(commander_mode, follow_front, squad_leash, engage_*)의 조합으로 매핑합니다(신규 알고리즘 최소화).
12. **교대 행동 on 대비**: 현재 off지만 `endRound`에도 같은 훅을 걸어야 하고, 타이머 0이라 선택 타임아웃이 안 돕니다. 개선: 교대 on이면 선택은 기본값 즉시 적용 또는 제한 시간을 별도 서버 시각으로 판정하도록 확인이 필요합니다.
13. **s8~s10 시드 부재와 폴백 병종**: 맵·편성·목표가 없어 이벤트 골격은 가정 기반입니다. `마물` 병종도 미구현이라 폴백이 필요합니다. 임밸런 확정 전에는 s8~s10 이벤트를 골격으로만 유지합니다.
14. **데이터 동기화**: FE 대사 번들 복사본이 원본과 어긋나기 쉽습니다(메모). 이벤트 장면 JSON도 `docker/sync_dialogue_data.mjs` 절차에 포함해야 합니다.

15. **메모리·성능**: 1920x1080 한 장이 디코드 후 약 8MB입니다(가정, `w*h*4`). 전투 씬 위에 얹으면 모바일에서 위험하므로 동시 로드 2장·재생 후 즉시 파괴·`lazy` 로딩을 필수로 둡니다. 개선: 전투 중 컷신은 스테이지당 1개로 제한(위 B 규칙).
16. **제작 비용**: 일러스트는 컷신 1개당 1~3장이고 이미지 생성 호출 한도가 이미 빠듯합니다(기존 메모: 승인 한도 70회 중 대부분 사용, 추가는 별도 승인). 폴백이 있으므로 일러스트는 후순위 에셋으로 두고 이벤트·대사·재생기를 먼저 완성하는 순서를 권고합니다.
17. **저작권·고증**: 일러스트는 사실/각색/허구 표기와 `what_if` 배지를 컷신에도 적용합니다. 일본 측 인물의 얼굴·대사 연출은 금지 규칙에 따라 실루엣·원경 위주로 합니다. 외부 이미지·레퍼런스 복제는 금지입니다(기존 방침).
18. **재생 기록 신뢰성**: `user_seen_events`는 클라이언트 보고라 위조해도 판정에 영향이 없도록 연출 편의 용도로만 쓰고, 보상·진행 조건에 연결하지 않습니다.

---

### ⑥ 사용자 결정 질문 (중요도 순)

1. **선택형 이벤트 범위와 영향도**: ch1에서 선택 이벤트를 s5·s8·s10 3개(각색·허구)로 한정하고, 결과를 "후속 대사 분기 + 소액 플레이버(난이도·능력치 영향 없음)"로 제한하는 안을 권고합니다(장점: 역사 왜곡·밸런스 위험 최소. 단점: 선택의 체감이 약함). 난이도·보상까지 바꾸는 안은 밸런스·QA 비용이 큽니다.
2. **아군 증원 유닛 조작 방식**: 플레이어가 직접 조작하는 아군 유닛(권고, 엔진 변경 최소)이냐, AI가 자동 행동하는 NPC 아군(연출은 자연스러우나 엔진 신규 개발 큼)이냐입니다.
3. **컷신 중 턴 타이머**: 서버가 컷신 시간만큼 마감을 연장하는 안(권고)이냐, 컷신 중 타이머 정지 안이냐입니다.
4. **1차 적용 범위와 분량**: MVP를 ch1 s1~s3에만 먼저 적용(권고)할지, 10장 전부 한꺼번에 할지, 그리고 장당 대화창 컷신 분량 목표(가정: 장당 90초·대화창 12줄 이하)를 확정할지입니다.
5. **해전 표현 수준**: 현재 평원·호수 지상전 재해석을 유지(추가 비용 없음)할지, 함선 비주얼 연출(원경 함대 장식·함선 이펙트)을 위한 이미지 호출 승인(기존 70회 한도 초과 별도 승인 필요)을 낼지입니다.
6. **s8~s10 맵·목표와 신규 타일 승인**: 맵·목표·허구 적 병종(마물) 확정을 임밸런에 위임해도 되는지, 먹물·붕괴 신규 타일 제작을 이미지 호출로 진행(별도 승인 필요)할지, 아니면 기존 늪·절벽 타일 재사용으로 시작할지입니다.

7. **일러스트 컷신 배치 범위**: ch1에서 전투 전/후 컷신만(권고, 메모리·제작 비용 최소)으로 시작할지, 전투 중 컷신도 스테이지당 1개 허용할지(s7·s10 후보, 연출 효과는 크나 메모리·타이머 부담)입니다.
8. **일러스트 생성 비용**: 컷신 일러스트용 이미지 호출 한도를 별도 승인할지(스테이지당 1~3장 × 10장), 승인 전에는 폴백(암전+대사 박스)으로 진행하고 에셋은 나중에 교체하는 안(권고)으로 갈지입니다.
9. **재생 기록 저장소**: 기존 `scene_seen` 저장 위치 확인 결과에 따라 서버 신규 테이블(`user_seen_events`)을 추가할지, 기존 구조를 확장할지 결정 필요입니다. 마이그레이션 시 개발 DB 백업·롤백 보고가 필요합니다.

### 관련 파일 (절대 경로)
- `<repo>\app\Game\Engine.php`
- `<repo>\app\Game\HeuristicBot.php`
- `<repo>\app\Game\ArmyBuilder.php`
- `<repo>\app\Services\BattleService.php`
- `<repo>\app\Services\RoomService.php`
- `<repo>\resources\js\game\scenes\Battle.js`
- `<repo>\resources\js\game\scenes\Dialogue.js`
- `<repo>\resources\js\game\store\battleStore.js`
- `<repo>\resources\js\game\fx\FxManager.js`
- `<repo>\resources\js\game\dialogue\dialogueData.js`
- `<repo>\database\data\dialogue_conditions.json`
- `<repo>\database\data\DIALOGUE_CONDITIONS_SPEC.md`
- `<repo>\database\data\campaign_ch1_outline.json`
- `<repo>\database\data\campaign_ch1_scenes.json`
- `<repo>\database\data\STAGES_CH1_SPEC.md`
- `<repo>\database\data\stages_ch1_proposal_v2.json`
- `<repo>\database\data\MAPS_PACK20_V2_SPEC.md`
- `<repo>\database\data\terrains.json`

**미확인 사항**
- 맵 JSON을 직접 열어 좌표를 확인하지는 않았습니다. 그래서 zone 좌표는 전부 임밸런 확정 항목입니다.
- `first_side` 설정값도 확인하지 못했습니다(가정 1).
- 지형 렌더러(`RmGround`/`UnityGround`)의 셀 단위 갱신 가능 여부, 방 solo의 이벤트 제외 의도, `settle`의 `battle_end.reason` 처리는 구현 착수 전 확인이 필요합니다.

- 현재 `scene_seen`이 실제로 어디에 저장되는지(코드 미확인).
- `assets.js`의 `lazy` 로딩·텍스처 파괴 지원 여부와 모바일 실측 메모리(윤프론 측정 필요).
- 컷신 프레임 용량 상한(400/600KB)은 가정이며 안아트·윤프론이 실측해 조정합니다.

**다음 단계 제안**: 사용자 결정(질문 1~4) 후 박백엔이 MVP 엔진 훅과 스키마를, 윤프론이 오버레이·카메라를, 송서사가 tier A 장면 대사를 이어서 진행합니다.

---

## 부록 A. 송서사 제안 스키마 ↔ 문기획 스키마 매핑표

**비교 대상**: `database/data/scenario/battle_events_ch1_5.json`(`schema_note` 포함, 상태 draft_v1)와 `BATTLE_EVENTS_CH1-5.md`(1~5장, JSON 기준 이벤트 37개: s1 7, s2 7, s3 7, s4 8, s5 8). 송서사 본인이 `schema_note`에 "문기획 보고서를 `database/data/`에서 찾지 못해 부록 A 자리표시 기준으로 작성했고 필드명이 다를 수 있으며 문기획 스키마를 기준으로 변환한다"고 명시했습니다. 따라서 **구조·판정 필드는 이 문서(문기획) 기준, 콘텐츠(대사·연출 서술·근거 수준)는 송서사 데이터가 원본**입니다. 아래는 변환 시 필요한 대응 관계이며, 변환기는 박백엔이 시드 검증기(갭 27·28)와 함께 구현합니다(제안).

### A-1. 최상위·이벤트 공통 필드

| 송서사 필드 | 문기획 필드 | 변환 규칙·비고 |
|---|---|---|
| `stages[].stage` (`ch1_s1`) | 스테이지 코드 키 | 동일 규칙(`ch1_sN`). 원본 JSON의 키로 사용 |
| `stages[].map` (`pk_01_plain_clash`) | 맵 코드 (`pk_01`) | 문기획은 `pk_NN` 약식. 송서사는 풀네임. 변환 시 풀네임 유지 가능(확인 필요: 맵 코드 정식 표기) |
| `id` (`ch1_s1_e04`) | `id` (`ch1_s2_e03`) | 형식(`ch1_sN_eNN`)은 같으나 **번호가 서로 다른 이벤트를 가리킴**. 송서사 e01~e0N은 기존 부록 A 자리표시 + 신규 번호 이어쓰기(0-3 표), 문기획 골격은 독자 번호(예: 문기획 s1 e01=옥포 개전, 송서사 s1 e04=옥포 개전). **구현 ID는 송서사 ID를 정본으로 채택 권고**(대사 데이터가 이미 그 ID로 존재). 문기획 ④ 골격은 효과·조건 설계 참고용으로 두고, 이벤트별 대응표는 변환 시 별도 작성(확인 필요) |
| `name` | `name` | 동일 |
| `seq` | (없음) | 재생 순서 힌트. 서버는 `priority`와 id 순으로 결정하므로 변환 시 `seq`는 폐기 또는 문서용 메타로 보존 |
| `section` (3/5/6/7/8/10) | (없음, outline 10-x 절 번호) | 원문 대본 절 번호. 시드에서는 `source_ref`로 보존 |
| `type` (A 개전/B 특정 유닛 행동/C 상황 변화/D 선택형/E 캐릭터 간 특수 대화) | `tier` (A 컷신급/B 짧은 연출/C 자막) | **의미가 다름(내용 분류 vs 연출 등급)**. 송서사 `type`은 내용 카테고리이므로 시드 메타 `category`로 보존하고, 문기획 `tier`는 `policy.input`·대사 줄 수·cutscene 유무로 산정(아래 A-2). D는 `choice` 필드로, E는 1-4 'E 유형(영웅 간 특수 대화)' 규칙으로 흡수 |
| `trigger{type,timing,text,…}` | `trigger{at, side, turn, cond}` | A-3 참조. `text`는 자연어 설명이라 `note`로 보존 |
| `policy{input, repeat_battle}` + `defaults{once,skippable,multiplayer}` | `policy{once}`·`scene.blocking`·`scene.short`·`view.bev.replay` | A-2 참조 |
| `priority` (20~100, 큰 값 먼저) | `priority` (큰 값 먼저, 동률은 id 순) | 방향·의미 동일. 값 범위 확인 필요(문기획 예시 50, 말풍선 15~90) |
| `requires{party_has_all, after_event, hero_verify, mode}` | `requires{party_has}` + `trigger.cond.after_event` | `party_has_all:["142","144"]`는 영웅 CSV id → 영웅 코드(예: `yi_sun_sin`) 변환 필요. `after_event`는 문기획 leaf `after_event`로 이동. `hero_verify`는 연출 메타(`verify`)로. `mode:"single_campaign_only"`는 문기획 "`defs`는 스테이지 전투 생성 시에만 주입(방·PvP 제외)" 규칙으로 자동 충족되므로 폐기 |
| `cast` (`hero:142`, `protagonist`, `shiori`, `caption`) | `cast` (영웅 코드, `@protagonist`, `npc:<id>`, `caption`, `shiori`) | `hero:<CSV id>` → 영웅 코드 변환표 필요(송서사 주석: 142 이순신, 144 곽재우, 145 김시민, 148 휴정, 149 유정 — 영웅 코드는 CSV 확인 필요). `protagonist` → `@protagonist` |
| `scene{camera[], motion[], fx[], sound[], cutscene[]}` | `scene{blocking, est_ms, scene_id, short, steps[], cutscene{}}` | A-4 참조. 송서사는 자연어 서술 배열, 문기획은 구조화 steps |
| `dialogue[{speaker, expr, text, is_invented, verify}]` | FE 번들 `battle_event_scenes_ch1.json`(`scene_id`) | **저장 위치가 다름**. 문기획: 서버 응답에 대사 본문을 싣지 않고 FE 번들에 `campaign_ch1_scenes.json` 형식으로 보관. 송서사: 이벤트 JSON에 인라인. 변환기가 인라인 `dialogue`를 FE 번들 `scenes`로 분리 출력(이벤트 id = `scene_id`). `speaker` 접두 `hero:<id>` → 영웅 코드 |
| `effects[{type, desc, …}]` | `effects[{op, …}]` | A-5 참조 |
| `choice{prompt, default, timeout, options[], balance_owner, history_note}` | `choice{prompt_key, options[{id,label_key,effects,next}], default, timeout_s}` | A-6 참조 |
| `end{type, resume}` (`dialogue_end`/`bubble_end`/`choice_resolved`/`auto`) | `end` (`scene_end`/`immediate`) | `dialogue_end`·`choice_resolved`·`auto` → `scene_end`, `bubble_end`(비차단 말풍선) → `immediate`. `resume`은 설명문이라 `note` |
| `next` (이벤트 id 배열 또는 `scene:<장면 id>`) | `next` (이벤트 id 배열) | 이벤트 id는 동일 규칙. **`scene:<id>`(예: `scene:ch1_s1_post`)는 문기획 `next`에 없음** → 전투 후 장면 연결은 기존 `campaign_ch1_scenes.json`의 `after_clear` 소비로 처리하고 `next`에서는 제거(변환 시 `post_scene` 메타로 보존) |
| `short` (28자 이내 한 줄) | `scene.short{mode:'banner', text_key}` | 값(문구)은 그대로, 구조로 감쌈. 28자는 문기획 `max_chars 28`과 일치 |
| `classification` (사실/사실 기반 각색/각색/허구) | `fact: fact|adapted|fiction` | 사실→`fact`, 사실 기반 각색·각색→`adapted`, 허구→`fiction`(송서사의 "사실 기반 각색"과 "각색" 구분은 메타로 보존) |
| `evidence_level` (confirmed/accepted/verify/n/a) + `dialogue[].verify` | `verify: true|false` | `verify` 근거 수준이면 `verify:true`. 나머지는 false. 원문 4단계는 메타 보존 |
| `dialogue[].is_invented` | (없음) | 창작 대사 표시. `what_if` 배지·`verify` 줄 숨김 규칙(1-5, 지적 6)과 함께 FE 번들 줄 단위 속성으로 보존 |
| `source[]` (LIST/YI 등 키) + 최상위 `sources` | `source_ref` | 키는 최상위 `sources` 사전으로 보존 |
| `engine_support` (MVP 지원/2단계/3단계/미지원) | 로드맵 단계 `M`/`P2`/`P3`/`P4` | MVP 지원→M, 2단계→P2, 3단계→P3. 송서사 enums의 `미지원`은 전투 중 이벤트 불가(이번 대본 미사용) |
| `fallback` (자연어, 예: "대사만 출력(컷신 없이)") | `scene.short`·컷신 폴백(1-7-F) | 이벤트 단위 폴백 서술은 문서용. 실제 동작 폴백은 1-7-F 기본 규칙(암전+대사 박스) |
| `note`(19건), `relation_ref`(2건) | `source_ref` 메모 / `hero_relations.json` 관계 id | `relation_ref`는 문기획 1-4 'rel_0014·rel_0018 중복 재생 방지' 규칙에 사용 |

### A-2. policy·표시 방식

| 송서사 | 문기획 | 변환 |
|---|---|---|
| `policy.input = "locked"` | `scene.blocking = true` (tier A/B 차단) | 대화창·컷신·선택 장면 |
| `policy.input = "free"` | `scene.blocking = false` (말풍선·캡션 비차단) | 말풍선(≤28자)·하단 캡션. 송서사 type E(`bubble_end`)가 해당 |
| `policy.repeat_battle = "short"` | `scene.short{mode:'banner'}` | 클리어 이력 시 배너 1줄로 대체(1-6) |
| `policy.repeat_battle = "skip"` | (대응 없음) | **신규 필요**: 반복 전투에서 생략. 제안: `short`를 null로 두고 `repeat:'skip'` 필드 추가 또는 `short.mode:'none'`(확인 필요, 박백엔·문기획) |
| `defaults.once = true` | `policy:{once:true}` | 이벤트별 `policy`로 펼침 |
| `defaults.skippable = true` | `skippable:true`(응답 `battle_event`) | 동일 |
| `defaults.multiplayer = false` | `defs` 미주입 + FE `room` 가드 | 1-6·1-7-B와 동일 정책 |
| `defaults.bark_max_chars = 28` | `dialogue_conditions.json`의 `max_chars 28` | 동일 |
| `trigger.first: true` | `policy:{once:true}` | 최초 1회 조건 |

### A-3. trigger 매핑

**timing 값**

| 송서사 `timing`/`type` | 문기획 `trigger.at` | 비고 |
|---|---|---|
| `battle_start` | `battle_start` | 동일 |
| `player_phase_start` / `turn_phase_start`(phase=player) | `turn_start` + `side:'a'` | `turn: N`은 `turn` 필드로 |
| `enemy_phase_start` / `turn_phase_start`(phase=enemy) | `turn_start` + `side:'b'` | 가정 1(`first_side=a`) 확인 필요 |
| `after_action` | `after_action` | 동일 |
| `battle_end` (`result:'win'`) | `battle_end` | 문기획에서 `battle_end`는 **연출 전용(효과 없음)**. 송서사의 `end_battle` 효과(전투 종료·승리 처리)는 서버 판정(`victory`)이 이미 끝낸 뒤라 불필요 → 변환 시 제거 |

**trigger.type → 문기획 cond leaf**

| 송서사 `trigger.type` (건수) | 파라미터 | 문기획 대응 | 갭 |
|---|---|---|---|
| `turn_phase_start` (11) | `turn`, `phase` | `at:turn_start`, `side`, `turn` | 없음 |
| `unit_troop_tenths_lte` (6) | `unit`, `tenths` | `unit_hp_pct{unit, op:'lte', pct}` | `pct = tenths × 10`(문기획 "HP 최대 10단계 기준"). `unit:'hero:144'`→영웅 코드 |
| `units_troop_tenths_lte` (1) | `side`, `count`, `tenths` | `unit_hp_pct`의 다수 유닛 집계 | **갭**: "N기 이상이 HP X% 이하" 집계형 leaf 없음. `units_left`는 생존 수 비교라 다름 → `units_hp_pct{side, count_gte, pct}` 신규 leaf 제안 |
| `unit_distance_lte` (4) | `a`(`player_hero_any`), `b`(`enemy_commander`), `distance` | 가장 가까운 것은 `adjacent`(인접) | **갭**: 거리 N칸 조건 leaf 없음 → `unit_distance{a,b,op:'lte',n}` 신규 leaf 제안. `player_hero_any`·`enemy_commander`는 `@enemy_cmdr` 별칭 외에 `@any_party_hero` 별칭 추가 필요 |
| `units_adjacent` (2) | `a`, `b`, `first` | `adjacent{a,b}` | 없음 |
| `unit_enter_tile` (2) | `side`, `tile_tag` | `unit_in_area{side, zone, count_gte:1}` + `once` | `tile_tag` = `zone`. 진입 순간 판정은 `after_action` + once로 구현 |
| `units_on_tiles` (1) | `after_event`, `side`, `tile_tag`, `count` | `unit_in_area{side, zone, count_gte}` + `after_event` | 없음(`after_event` leaf) |
| `after_event_phase` (1) | `after_event`, `phase` | `turn_start` + `cond.after_event` | 없음 |
| `battle_start` (4)·`battle_end` (5) | - | `at` 동일 | 없음 |

- **`tile_tag` → `zone`**: 송서사 주석대로 `tile_tag`는 맵 데이터에 연결이 필요한 자리표시이며 좌표는 미확정입니다. 문기획 `maps.meta.event_zones` 키(`z_*`)로 변환하고 좌표는 임밸런이 맵 JSON을 확인해 확정합니다(확인 필요). 예: `bridge`→`z_bridge`, `ford`→`z_ford`, `forest_side`→`z_forest_ambush`(문기획 s2 골격과 일치), `our_right_flank`, `gate_target` 등은 신규 zone으로 추가.
- 유닛 태그: 송서사 `unit_tag:'enemy_flank_1'` → 문기획 `tag`(`enemy_squad` 신규 필드, 갭 9·23).

### A-4. scene 연출 매핑

| 송서사 `scene.*` (문자열 배열, 예: "미안 평원 후방에서 아군 쪽으로 팬(2초)") | 문기획 `scene.steps[]` | 변환 |
|---|---|---|
| `camera[]` | `{cam:{mode:'overview|focus|pan|zoom|restore', target, k, ms}}` | 자연어를 구조화(윤프론·문기획 합의 필요). 이동 ≤600ms 규칙(1-5) 적용 |
| `motion[]` | `{anim:{unit, motion}}` | 동일 개념 |
| `fx[]` (예: 안개 오버레이, 목표 배너) | `{fx:{…}}`, `{weather:{…}}`, `{light:{…}}` | 안개=`weather fog`, 야간=`light night`. 목표 배너=`fx banner` |
| `sound[]` (`bgm.battle_ch1_s1`, `sfx.drum_low`, `sfx.waves_far`) | `{sfx:"key"}` | 사운드 키는 송서사 제안값. **안아트 manifest에 없으면 기존 키로 대체**(1-5 '신규 음원은 승인 필요'). `bgm.*`는 문기획 steps에 BGM 항목이 없음 → 신규 `{bgm:"key"}` 또는 보류(확인 필요) |
| `cutscene[]` (키 문자열 배열) | `scene.cutscene{id, frames[], fallback, short}` | A-7 참조. 키 목록→`frames[].key`로 승격 |
| (대사 인라인) | `{dialogue:"scene_id"}` | A-1의 dialogue 분리 규칙 |
| `est_ms` 없음 | `est_ms` (상한 25초) | 송서사 데이터에 없음. 대사 줄 수·프레임 `hold_ms`로 산정하거나 임밸런·윤프론이 확정(확인 필요) |

### A-5. effects 매핑

| 송서사 `effects[].type` (건수) | 문기획 `effects[].op` | 비고 |
|---|---|---|
| `none` (12) | (효과 배열 비움) | 연출 전용. 변환 시 `effects:[]` |
| `highlight_tiles` (6) | FE 연출(`fx.marker`), 서버 효과 아님 | 공격 방향·구역 표시. `scene.steps`의 `fx marker`로 이동. 서버 `effects`에 넣지 않음 |
| `highlight_unit` (4) | FE 연출(`fx` 강조) | 동일. 서버 효과 아님 |
| `set_objective` (5) | `objective_change{sub_objective}` 또는 표시 전용 | 본편 규칙: **승리·생존 목표는 진행 중 변경 금지**, 보조 목표 표시만 허용. 송서사의 `objective:'defeat_commander'`는 초기 목표 표시(이미 `state.objective`에 있음)이므로 `sub_objective` 표시 또는 생략 |
| `unlock_input` (4) | (대응 없음, 암묵) | 차단 이벤트가 끝나면 FE가 자동 해제(`eventLock`). 변환 시 제거 |
| `end_battle` (5) | (제거) | A-3 `battle_end` 참조. 승리 판정은 엔진 |
| `goto_scene` (5) | (효과 아님) | 전투 후 장면 연결은 `after_clear`로 소비. `post_scene` 메타로 보존 |
| `enemy_ai` (3, `unit_tag`, `mode:'flank'`) | `ai_pattern{target, mode, to_zone?}` | **모드 불일치**: 문기획 모드는 `hold|advance|assault|wave|funnel|flee|target_priority` 6~7종. `flank`(측면 우회)는 없음 → 기존 봇 옵션 조합으로 `advance` + `to_zone` 지정 또는 `flank` 모드 신규 추가(지적 11 '신규 알고리즘 최소화' 원칙상 전자 권고, 박백엔 확인) |
| `spawn_units` (3) | `spawn{side, units[{type, zone, tag, ready, exclude_stars}]}` | `side:'player'`→`'a'`, `tile_tag`→`zone`, `count`→units 배열 길이, `unit_type`→`type`, `acts_on_spawn_turn:false`→`ready:false`, `controllable:true`→(아군은 플레이어 조작, 문기획 질문 2 권고안과 일치). `exclude_stars`는 송서사 데이터에 없음 → **증원 아군은 기본 `exclude_stars:true`로 변환**(지적 4 별 조건 허점 방지). `hero:false`는 일반 유닛 의미 |
| `buff` (1, `id`, `duration_turns`, `value:'TBD'`, `enabled:false`) | `buff{target, stat, pct/amount, turns}` | `value` 미확정(임밸런 TBD). 수치 확정 전에는 `enabled:false`로 두는 송서사 방식 유지. `stat`·`target`은 변환 시 보완. 합계 ±15% 검증(지적 5) |
| `terrain_change` (1, `tile_tag`, `from:'closed'`, `to:'open'`) | `terrain_change{zone, to, occupied_policy:'skip'}` | **지형 값 불일치**: 문기획 `to`는 `terrains.json` 기존 symbol만 허용. `closed/open`은 의미값이라 symbol로 변환(예: 성문 `wall`→`plain` 등, 문기획 s5 골격 e04 참고). 임밸런이 지형 코드 확정 |
| `set_flag` (1, `flag`) | `set_flag{name, value}` | 필드명 `flag`→`name`. 값 없으면 true |
| `show_choice` (1) | `choice` 필드 존재 자체 | 효과 아님. 변환 시 제거 |
| `add_hint` (1) | `objective_change{sub_objective}` (표시) 또는 FE 캡션 | 승패 비영향 힌트 |
| `show_turn_counter` (1, `total`) | (기존 survive HUD) | `survive_turns` 목표는 남은 턴 HUD가 이미 있음(0장 표). 별도 효과 불필요 가능 → 제거 후보 |
| `enemy_buff` (choice 옵션 내) | `buff{target:{side:'b'}, …}` | 선택 효과 |
| `reward_mod` (choice 옵션 내) | (**대응 없음, 충돌**) | 문기획 규칙: 선택은 **난이도·보상 영향 최소화**, 권고는 "후속 대사 분기 + 소액 플레이버(난이도·능력치 영향 없음)"(질문 1). 송서사 s5 선택지에는 `enemy_buff`(3턴, TBD)·`reward_mod`가 있어 **사용자 결정(질문 1) 전까지 `enabled:false`로 두고, 결정에 따라 제거 또는 유지**(확인 필요) |

### A-6. choice 매핑

| 송서사 `choice.*` | 문기획 `choice.*` | 비고 |
|---|---|---|
| `prompt` (문장) | `prompt_key` (번들 키) | 문구는 FE 번들로 이동 |
| `options[].id` (`front`/`flank`) | `options[].id` (`A`/`B`) | id는 송서사 값 유지 가능(서버는 문자열로만 검증). `default`도 같은 id 사용 |
| `options[].label`, `hint` | `options[].label_key` | 문구는 번들로 이동 |
| `options[].effects[]` | `options[].effects[]` | A-5 규칙 적용 |
| `default` (`flank`) | `default` | 동일 개념 |
| `timeout: null` (시간 제한 없음) | `timeout_s: 30`(최대) | **불일치**: 송서사는 시간 제한 없음, 문기획은 30초 후 기본값 자동 적용. 서버 타이머 정합(1-3)상 **문기획 30초 채택 권고**. 시간 제한 없음 유지 시 턴 마감·`expireTurnInTx` 정합 설계가 추가로 필요(확인 필요) |
| `balance_owner`, `history_note` | (없음) | 메타 보존(`history_note`는 `what_if`/역사 경계 규칙, 지적 6과 일치) |
| `next` (선택 결과 후속) | `options[].next` | 송서사 데이터는 이벤트 `next`가 단일 → 옵션별 `next`가 필요하면 변환 시 분기 |
| 결과 플래그 `ch1_s5_route` | `battles.result.choices[]` | `set_flag`는 서버 flag, 결과 저장은 문기획 규칙 |

### A-7. 컷신 매핑 (보완본 1-7 기준)

| 송서사 `cutscenes[]` / `scene.cutscene[]` | 문기획 `scene.cutscene{}` (보완본) | 비고 |
|---|---|---|
| 최상위 `cutscenes[{stage, attached_event, frames[], fallback}]` | 이벤트의 `scene.cutscene{id, frames[], fallback}` | `attached_event`가 가리키는 이벤트의 `scene.cutscene`에 삽입. `id` = `cutscene.<stageId>.<n>`(키 규칙 동일: 송서사 `cutscene.ch1_s1.1.a` 와 일치) |
| `frames[].key` (`cutscene.ch1_s3.1.a/b`) | `frames[].key` | 동일. 프레임 1~3장 규칙 충족(최대 2장) |
| `frames[].desc`, `frames[].asset` (IL-07 재사용 / 신규 IL-10 등) | (없음) | 에셋 제작 지시용. manifest·안아트 작업 메모로 이관. `cam`·`fade`·`hold_ms`·`dialogue_ref`는 **송서사 데이터에 없음** → 윤프론·문기획이 기본값 지정(예: `fade_in/out 400`, `hold_ms 3000`, 팬·줌은 선택) |
| `cutscenes[].fallback` (자연어: "맵 전경 + 안개 오버레이(코드)", "나뭇잎 파티클 + 초상화 컷인(코드)") | `scene.cutscene.fallback:'dim_dialogue'` | **불일치**: 보완본 기본 폴백은 "암전(alpha 0.7) + 대사 박스 + 캡션 한 줄"이며 이것이 기본 테스트 경로. 송서사의 코드 연출 폴백(파티클·오버레이)은 **2차 개선안**으로 보존하고, MVP는 보완본 폴백 우선(충돌 시 보완본 우선) |
| 전투 중 컷신 5건(s1~s5 각 1건: `ch1_s1_e04`, `s2_e05`, `s3_e04`, `s4_e05`, `s5_e03`) | 보완본 B: 전투 중 컷신은 **스테이지당 최대 1개, tier A만** | 개수 규칙(스테이지당 1개)은 충족. 단 보완본 권고 배치(전투 중은 s7·s10 정도만 시작, 1-7-B)와 다름 → **사용자 결정 질문 7(컷신 배치 범위)에 따라 확정**. 폴백이 기본 경로이므로 일러스트 미생성이어도 동작 |
| 송서사 일러스트 호출: 이미지 호출 하지 않음, 잔여 약 5회 | 질문 8(생성 비용 승인) | 신규 IL-10·IL-11은 예산 밖. 승인 전까지 폴백 진행(질문 8 권고안과 일치) |

### A-8. 용어·단위 차이 요약

| 항목 | 송서사 | 문기획 |
|---|---|---|
| 진영 | `player` / `enemy` | `a` / `b` |
| 페이즈 | `player_phase_start` / `enemy_phase_start` | `turn_start` + `side` |
| HP 단위 | tenths(N/10, 병력) | `pct`(HP%). tenths×10. 문기획 "HP 최대 10단계 기준" |
| 영웅 참조 | `hero:<CSV id>`(142 등) | 영웅 코드(`yi_sun_sin`)·`@role`·`tag` |
| 구역 | `tile_tag` | `zone`(`maps.meta.event_zones`) |
| 지형 값 | `closed`/`open` 의미값 | `terrains.json` symbol |
| 대사 저장 | 이벤트 JSON 인라인 | FE 번들 `scene_id` |
| 사운드 키 | `bgm.*`/`sfx.*` 제안값 | `audio.play(key)` 기존 키 |
| 효과 필드 | `type` + `desc`(자연어) | `op` + 구조화 파라미터 |
| 이벤트 ID | `ch1_sN_eNN` (부록 A 자리표시 + 이어쓰기) | `ch1_sN_eNN` (독자 번호) — 번호 의미 다름 |

### A-9. 변환 시 미결정·확인 필요

1. 이벤트 ID 정본(송서사 ID 채택 권고)과 문기획 골격↔송서사 이벤트 대응표 작성자(문기획·송서사 합의).
2. 신규 trigger leaf 2종 제안: `unit_distance{a,b,op,n}`, `units_hp_pct{side,count_gte,pct}` (박백엔 구현 판단).
3. `enemy_ai mode:'flank'` 처리(advance+`to_zone`로 대체 vs 신규 모드).
4. `repeat_battle:'skip'` 표현 방식.
5. 선택 이벤트의 `timeout`(null vs 30초)과 `reward_mod`·`enemy_buff` 사용 여부(질문 1).
6. 영웅 CSV id → 영웅 코드 변환표(142 이순신·144 곽재우·145 김시민·148 휴정·149 유정, 코드는 CSV 확인 필요).
7. 사운드 키(`bgm.*`)의 manifest 존재 여부, 컷신 `cam`·`est_ms` 기본값.
8. 송서사 대사의 인라인 → FE 번들 분리 도구와 `docker/sync_dialogue_data.mjs` 동기화 절차 포함(지적 14).
9. 송서사 `battle_events_ch1_5.json`은 6~10장 미포함(6~10장은 `BATTLE_EVENTS_CH6-10.md` 별도 존재, 이번 매핑 조사 범위 밖 — 확인 필요).
