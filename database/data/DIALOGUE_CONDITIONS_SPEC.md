# 조건부 대사 표시 스펙 v1 (송서사, 2026-11-01)

데이터: `database/data/dialogue_conditions.json` (기존 `campaign_ch1_scenes.json`, `tutorial_dialogue.json`, `hero_relations.json`은 수정하지 않음). 앱 코드는 수정하지 않았으며 평가기 구현은 윤프론/박백엔 담당.

## 현재 코드와의 간극 (확인한 사실)
- `resources/js/game/scenes/Dialogue.js`는 `scenes.find(s => s.id === this.id)`로 장면을 고르고, `verify` 줄만 숨긴다. `timing`, `stage_code`, `relation_ref`, `unlock_hero`는 읽지 않는다.
- `dialogueData.js`의 `speakerInfo`는 `hero:<숫자>`는 CSV id로 이름을 찾지만, `hero:<code>`는 `HERO_NAMES`(시드 8명)에 없으면 code 문자열을 이름으로 표시한다. 조건부 장면의 대사는 `hero:<csv id>`를 사용했고, code 표기를 쓰려면 이름표 확장이 필요하다.
- `resources/js/game/data/dialogue/`에 JSON 사본이 있다(빌드용). 이 데이터를 쓰려면 같은 폴더로 복사하는 절차가 필요(적용 담당 확인).

## 구조
1. 슬롯: 기본 장면은 (stage_code, timing)으로 찾고, 같은 슬롯에서 조건이 참인 `conditional_scenes`/`relation_encounters`를 priority 내림차순으로 최대 2개 이어 붙인다(`mode: append`).
2. 줄 게이트: `hero:<x>` 줄은 x를 보유(owned)했거나 해당 scene의 `guests`일 때만 표시. 줄이 전부 걸러지면 장면 생략.
3. 조건 노드: `{all|any|not}` + leaf `{key, op, value}`. 알 수 없는 key/예외는 해당 장면 건너뜀(기본 흐름 보호).
4. once: `scene_seen`(세이브) 기준 1회. 랜덤 조건은 두지 않음(재현성).

## 조건 키
| key | 기본 op | 출처 | 상태 |
|---|---|---|---|
| owned | has | 보유 영웅 code | 보유 목록 접근 필요 |
| party_has | has_all | 이번 출격 편성 | before_battle 재생 시점이 편성 확정 전이면 평가 시점 확인 필요 |
| enemy_has | has_any | 스테이지 적 지휘관 code | enemy_preset→영웅 매핑 필요 |
| clear_count | gte | 스테이지 누적 클리어 | 진행 데이터 확인 필요 |
| fail_count | gte | 연속/누적 패배 | 정의 확정 필요 |
| no_hero_down | eq | 클리어 시 영웅 쓰러짐 없음 | 결과 요약 필드 필요 |
| hero_hp_pct | lte | 전투 중 임계 하향 이벤트 | 전투 이벤트 훅 필요 |
| scene_seen / what_if / stage_code / timing / first_clear | - | 기존/세이브 | 기존 필드 재사용 |

## 데이터 요약
- `scene_overrides`: ch1 16개 scene의 `guests`(스토리 게스트: 곽재우·김시민·휴정·유정·권율).
- `relation_encounters.active`: hero_relations 30건 중 양쪽이 풀에 있는 20건(같은 편/적대 규칙 포함). `pending_not_in_pool` 10건은 상대가 풀 밖이거나 null.
- `conditional_scenes`: 4건(권율 합류 재방문, 연속 패배 힌트, 무손실 클리어, 반복 클리어).
- `battle_barks`: 시범 3건(이벤트 훅 필요).

## 적용 담당에게 넘길 사항
1. 평가기 구현(윤프론/박백엔): 위 슬롯·게이트·조건 문법. 단위 테스트는 핵심 2~3개(guests 예외, side=opposed, once)면 충분.
2. 상태 소스 확정: owned/party_has/enemy_has/fail_count/no_hero_down 각각의 실제 데이터 위치(코드 확인 필요).
3. rel_0014·rel_0018은 ch1 기본 장면에 이미 relation_ref가 있어 중복 재생 방지 필요.
4. sensitive 관계(rel_0026, rel_0029)는 시오리 중립 안내 한 줄 선행 권장.
5. 표시 규칙: 창작 대사(`is_invented: true`)는 현재와 동일하게 처리. `verify` 줄 비표시 유지.

## 부록: 스킬 배정 확정 사항과 hv 목록 (송서사, 2026-11-01)
대상 데이터: `database/data/hero_skill_assignments.json`. 팀장 권고안 확정 반영 내용이다.

### 확정 반영
- 잔 다르크: `divine_banner`(신의 깃발) -> `ja_hyb_mid`(사기의 상징)로 교체. 근거는 hero_profiles CMD(accepted: 공식 지휘권은 없었으나 사기 진작 상징으로 취급). 신앙 서사는 제외. `heroes.json`/`skills.json`의 divine_banner 정리는 적용 담당 몫.
- 계백: 고유 스킬 `gb_last_mid`는 `pending_review`로 이동(원안 보존, enabled=false). 병종(heavy) 공유 스킬 `sh_def_w`(p1) + `sh_hyb_w`로 대체. nominal_points는 미갱신(임밸런 재산정 필요).
- 프로필 6축 전부 null인 영웅은 현행(공유 스킬만) 유지: 계백, 곽재우, 휴정, 유정, 아만니레나스, 지토 천황, 무라사키 시키부, 아르테미시아 1세(합계 8명, 팀장 요청서의 7명과 차이 -> hero_profiles.json으로 확인 필요).
- 스킬 수 248 유지(항목 수 기준). 코드 유일값 기준 집계는 gb_last_mid 이동으로 달라질 수 있으니 적용 담당이 집계 방식 확인.

### hv=true 목록 (사건 암시가 있으나 hero_profiles basis로 직접 확인하지 못해 사람 확인 필요, 총 33건: 배정 32 + pending_review 1)
- 알렉산드로스 al_atk_mid(결정적 전투 승리) / 사카모토 료마 sr_hyb_mid(중재) / 강감찬 gm_ctr_mid(귀주) / 유비 lbei_form_mid(의형제, rel_0003) / 관우 gy_charge_mid / 제갈량 zl_form_mid(팔진)
- 메흐메트 2세 m2_siege_strong(콘스탄티노폴리스) / 산마르틴 sm_move_mid(안데스) / 보방 vb_siege_strong / 필리포스 2세 p2_form_strong(군제 개혁) / 오다 노부나가 on_vs_mid(나가시노)
- 을지문덕 em_pur_mid(살수) / 한신 hx_last_strong(배수진) / 도요토미 히데요시 th_siege_mid / 나폴레옹 np_atk_mid, np_fs_mid / 아르키메데스 ar_tdef_mid(시라쿠사)
- 헨리 5세 h5_atk_weak(장궁) / 프리드리히 대왕 fg_fs_mid(사선 전술) / 넬슨 ns_last_mid / 사나다 유키무라 sy_charge_mid, sy_tdef_mid(오사카성)
- 술레이만 1세 su_siege_mid, su_form_mid(예니체리) / 권율 gy2_tdef_weak(행주산성) / 김시민 ksm_tdef_weak(진주성) / 레오니다스 ld_last_weak
- 람세스 2세 rm_atk_weak(전차 궁수) / 소크라테스 sc_last_weak(중장보병 참전) / 레오나르도 다 빈치 ld2_siege_weak / 서희 sh2_def_weak(외교 담판) / 정약용 jy_def_weak(축성)
- 계백 gb_last_mid(pending_review 보존)
처리 방침: 이번에는 그대로 두고, 해당 사건을 hero_profiles basis나 hero_fact_checks에서 확인하면 hv를 해제한다. 확인 전까지 flavor는 사실 주장이 아닌 '모티프' 표현으로만 쓴다.
