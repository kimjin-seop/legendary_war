# 배치 슬롯 (stages.rules.deploy_slots) - 2026-11-08

스테이지가 아군 영웅 자리를 지정한다. 슬롯을 정의한 스테이지만 슬롯 모드이며, 미정의 스테이지·방 대전·PvP·자유전은 현행 동작이다.

## 규칙
- 고정 슬롯(fixed_slots): 주인공(`@protagonist`) 또는 스토리 영웅을 스테이지가 지정한 타일에 둔다. 해제·교체·제외·이동 불가.
  보유 필수(대여 없음): 주인공 외 영웅을 미보유하면 입장 422 `required_hero_missing`.
- 선택 슬롯(free_slots): 스테이지가 정한 지정 타일에 유저가 보유 영웅을 자유롭게 둔다(비워도 확정 가능). `unit_types` 로 병종을 제한할 수 있다(선택).
- 총 영웅 수 = 고정 + 선택. 슬롯 모드에서 이 슬롯 수가 유저 레벨 곡선 `maxSlots` 를 대체한다(고정 영웅은 슬롯 수 면제, 선택 슬롯 수만 `max_party_slots`).
- 코스트: 고정(강제 출전) 영웅의 영웅 코스트도 합산에 포함한다(2026-11-08 사용자 번복, 이전에는 면제). 2026-11-15: 부대 병종 코스트는 합산하지 않는다(`game.rules.troop_cost=false`): 판정 = 영웅 코스트 합 <= 상한, 코스트 바 24/24면 출진 가능, 25 이상 cost_exceeded. 상한 = `rules.deploy_slots.cost_cap`(정수, 선택) 우선, 없으면 `max(현행 곡선 max(user_level_costs, 슬롯x8), (선택 슬롯 수 + 강제·고정 영웅 수) x 8)` (`ProgressionService::campaignCostCap`). 2026-11-14 등급 격차 v1 이후 곡선 부분은 `game.campaign_slots.cost_cap_by_level` 표(없으면 슬롯x8 폴백) + 강제 영웅 수 x 8 로 계산한다(HANDOFF '등급 격차 v1' 절).
  강제·고정 영웅도 슬롯 1칸 몫(8)의 코스트 예산을 가진다. 코스트 면제를 폐지하자 신규 유저 stage_01 기본 편성(주인공 3 + 이순신 6 + 곽재우 2 = 11 + 당시 합산하던 부대 6 = 17, 현재는 부대 미합산이라 11)이 곡선 상한 16에 걸려 422 cost_exceeded 가 났기 때문(2026-11-08 강화면 발견). 강제 영웅이 없거나 캠페인이 아니면(방·PvP·자유전) 종전과 같다.
- 이 코스트 포함 규칙은 기존 `forced_heroes` 에도 적용된다(슬롯 면제는 유지, 코스트 면제 폐지). `ProgressionService::validateParty` 가 단일 출처.
- 봇 아군(`rules.ally_npcs`)은 기존 그대로(슬롯·코스트 소비 없음). 부대는 영웅에 딸려 기존 SquadPlanner / `troop_place_radius` 자동 배치.
- 진행 중(deployment) 전투는 레거시 검증: 슬롯은 전투 생성 시 `battles.state.deploy_slots` 에 고정(스냅샷)되며 키가 없으면 레거시다. 스테이지 데이터를 바꿔도 이미 만든 전투는 불변.
- 슬롯 좌표가 맵 `deploy_zones.a` 밖이면 전투 생성 시 슬롯 모드를 켜지 않고(경고 로그) 현행 편성으로 폴백한다(감사에서 ERROR).

## 스키마
```json
"rules": {
  "deploy_slots": {
    "fixed_slots": [{"id":"f1","x":2,"y":7,"hero":"@protagonist"}, {"id":"f2","x":3,"y":6,"hero":"yi_sun_sin","unit_type":"naval","troop_type":"naval"}],
    "free_slots":  [{"id":"s1","x":2,"y":11}, {"id":"s2","x":2,"y":2,"unit_types":["archer","spear"]}],
    "cost_cap": 20
  },
  "required_heroes": ["yi_sun_sin"]
}
```
- `id` 문자열 유일, 좌표 정수·슬롯 간 중복 금지, 고정 슬롯 `hero` 필수. 형식 오류 항목은 조용히 버리고(`Engine::normalizeDeploySlots`) 감사가 보고한다. 유효 슬롯이 0개면 슬롯 미정의로 취급.
- `@protagonist` 고정 슬롯은 fixed_slots 첫 항목(지휘관, 첫 배치). 주인공 사망=패배, `rules.protagonist_troop` 는 기존대로.
- 슬롯 `unit_type`/`troop_type` 는 forced_heroes 항목과 같은 의미(병종 덮어쓰기).
- `rules.required_heroes`: 스테이지 단위 보유 필수 영웅 코드 목록(주인공 제외). 고정 슬롯 영웅과 `forced_heroes`·`required_hero` 와 합쳐져 `GET /api/stages` 의 `required_heroes/missing_heroes/playable` 및 입장 게이트로 쓰인다.
- 롤백: stages.rules 에서 `deploy_slots` 키 삭제(시드 JSON 에 `"deploy_slots": null` 두고 재시드하면 StageRulesMerge 가 키 삭제). 데이터 외 코드 롤백은 `docker/db-backup-20261108/deploy-slots/` 백업 복원.

## API 계약 (FE)
`POST /api/stages/{id}/challenge`, `GET /api/battles/{id}/deployment` 응답 추가 키 (모든 스테이지에 존재, 슬롯 미정의면 비활성값):
| 키 | 슬롯 모드 | 미정의 |
|---|---|---|
| `slot_mode` | true | false |
| `slots[]` | fixed: `{id,kind:'fixed',locked:true,x,y,hero,user_hero_id\|null,unit_type\|null,troop_type\|null}` / free: `{id,kind:'free',locked:false,x,y,unit_types\|null}` | `[]` |
| `slot_counts` | `{fixed,free,total}` | null |
| `max_party_slots` | 선택 슬롯 수 | 캠페인 곡선 |
| `max_cost` | `cost_cap` 또는 곡선 | 곡선 |
| `cost_cap_source` | 'stage' \| 'level' | 'level' |
| `forced_cost` | 고정/강제 영웅 `{hero,troop,total}` (상한에 포함됨) | 강제 영웅 있으면 값 |
| `default_party`, `default_positions`, `default_troop_positions` | 고정 영웅=자기 슬롯, 저장 파티는 맞는 선택 슬롯에 배치 | 기존 spread |
| `forced[].free_cost` | false (코스트 포함) | false |

`GET /api/stages` 행 추가: `deploy_slot_counts: {fixed,free,cost_cap}|null`.

배치 제출 `PUT /api/battles/{id}/deployment` 슬롯 모드 신규 오류(422): `not_a_slot`, `slot_hero_mismatch`, `slot_unit_type_mismatch`. 재사용: `forced_hero_required`, `protagonist_must_lead`, `hero_not_owned`, `duplicate_hero`, `tile_occupied`, `too_many_slots`, `cost_exceeded`, `required_hero_missing`(입장).

## 감사 (`php artisan game:audit-stages`)
옵션: `--enemy-ratio=1.0`(기본), `--user-level=N`, `--enemy-all`(슬롯 미정의 스테이지도 적 병력 상한 검사), `--fail-on-error`.
| kind | 수준 | 내용 |
|---|---|---|
| `slot_invalid` | ERROR | 슬롯 형식/중복, 배치 영역 밖, 통행 불가, 없는 영웅, 주인공 슬롯 순서, ally_npcs 와 겹침 |
| `forced_cost_over` / `forced_cost_over_legacy` | ERROR | 고정/강제 영웅 코스트 합(부대 코스트 미합산) > 상한(슬롯 스테이지는 cost_cap, 그 외 곡선). 유저 레벨 = `--user-level` 또는 스테이지 recommended_level |
| `forced_cost_no_room` | WARN | 합 == 상한(선택 슬롯 코스트 여유 0) |
| `enemy_alive_over` | ERROR | 적 초기 + 증원(triggers spawn, side b) > `max_alive_per_side_stage` |
| `enemy_below_ally` | WARN | 적 초기 유닛 수 < 아군 최대 유닛(영웅 슬롯 + 영웅당 부대(레벨·troop_bonus, 선택 슬롯은 최대 troop_bonus 가정) + 아군 NPC 본체·동반병) x ratio |
| `required_hero_unobtainable` | ERROR | 필수 영웅이 뽑기 풀(및 가입 시 시작 영웅)에 없음 / heroes 에 없음. 스테이지 보상·대여 경로는 없음(영웅은 뽑기로만 획득) |
적 병력은 전투 생성과 같은 코드 경로(`BattleService::populateStageEnemy`: enemy_squad + withEnemyCompanions + addGenericSide 또는 프리셋 + enemy_extra_troops)를 호출해 센다. cue(rules.cues) 소환 병력은 합산하지 않는다.

## 시범 데이터와 시드 절차
- 후보 출력(쓰기 없음): `php artisan game:gen-deploy-slots --stage=stage_01 --free=2 --dry-run`
- `database/data/stages.json` 의 stage_01~03 `rules.deploy_slots` 추가 완료: 고정 = 주인공, 선택 = 2/3/4 (현행 Lv1~2/3~4/5~6 캠페인 곡선 슬롯과 동일).
- 개발 DB 반영(미실행): 백업 후 `php artisan game:seed`(stages.rules 는 StageRulesMerge 병합, 다른 키 보존). 확인: `php artisan game:audit-stages`.
- 스테이지별 필수 영웅(송서사 제안 `database/data/stage_required_heroes.json` `{stage_code:[hero_code]}`): `php artisan game:seed-required-heroes`(계획 출력) -> `--apply`(개발 DB `rules.required_heroes` 병합, 빈 배열=삭제).

## 테스트
`tests/Feature/DeploySlotsTest.php` (슬롯 검증, 고정 코스트 포함, 미정의/진행 중 전투 폴백, 필수 영웅, 감사). 사전 시드(game:seed + game:seed-protagonist)가 필요해 파일당 1분 안팎.

## 추가 반영 (2026-11-08 오후)
- `deploymentInfo.default_party_cost`: 기본 편성(강제·고정 영웅 + 선택 영웅, `default_party` 기준)의 코스트 합 + `max`(= `max_cost`). 서버 판정(validateParty)과 같은 합산이라 화면 표시와 일치한다.
- `deploymentInfo.enemy_preview`: `{initial, reinforce}`(`previewEnemyCounts`). 스테이지가 없거나 계산 실패면 null. 기존 필드 변경 없음.
- 개발 DB: stage_01~03 `rules.deploy_slots` 단건 반영(백업 `docker/db-backup-20261108/stage-slots/`). game:seed 전체는 실행하지 않았다.
- join_hero 비활성(영웅은 뽑기로만 획득): 개발 DB 8개 스테이지 `join_hero=[]` + 시드 JSON(stages_ch1_proposal(_v2), stages_main_a2~a4, stages_ch999_finale) 비움. 백업 `docker/db-backup-20261108/join-hero/`. `grantJoinHeroes` 코드는 유지(빈 값이면 생략).
- ch1 이순신 고정 슬롯 초안: `database/data/deploy_slots_proposal_ch1.json`(ch1_s1/s3/s7/s9, DB 미반영).
- 레거시 경로(임의 타일 배치)를 검증하는 기존 테스트는 `Tests\Concerns\StripsDeploySlots::stripDeploySlots()` 로 시드 직후 deploy_slots 를 제거한다.
