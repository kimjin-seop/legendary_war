# 영웅 스킬 등급별 재분배 계획서 (시작값 / needs tuning)

작성: 임밸런 3호기, 2026-11-04. 원본 데이터: `database/data/hero_skill_redistribution.json` (version 1, 미적용 제안본).
근거 철학: `docs/BALANCE_PHILOSOPHY.md` (평준화 금지, 상성·상황 의존 스킬 우선). 아래 수치는 모두 시작값이며 실전 감각은 사람 플레이 피드백이 필요하다.

## 1. 지침과 JSON rules

| 영웅 등급 | 패시브 | 액티브 | 합계 |
|---|---|---|---|
| S | 3 | 2 | 5 |
| A | 2 | 2 | 4 |
| B | 2 | 1 | 3 |
| C | 1 | 1 | 2 |

- 스킬 자체의 실전 가치도 S~C로 평가해 각 슬롯에 `grade`를 매겼다. 기존 영웅 정체성(기존 스킬·지형 특화)은 유지하는 방향.
- action 의미: keep(유지) / add(신규 추가) / replace(교체) / convert(기존 스킬을 액티브 등으로 변환) / dormant(보류, 개수 밖) / default_only(병종 기본 스킬만 사용). `removed`는 개수에서 빠진 기존 스킬(41건), `dormant` 58건.
- 엔진 지원 템플릿만 사용. 엔진 미구현 스킬은 `engine: pending`(20슬롯)로 표시, 2단계 스킬은 `phase2`(3명)에 별도 보관.
- 적용 전 단계: JSON은 제안본이며 DB·시드에 반영되지 않았다.

## 2. 개수 검증 (node 전수, 130명)

| 등급 | 인원 | 출처 |
|---|---|---|
| S | 3 | player 3 (이순신, 알렉산드로스 대왕, 칭기즈 칸) |
| A | 31 | player 27, expansion_hold 4 |
| B | 52 | player 42, expansion_hold 10 |
| C | 44 | player 41, expansion_hold 3 |

- 패시브/액티브 개수 위반 영웅: **0명 (130/130 통과)**. JSON 수정 없음.
- 같은 영웅 내 패시브 템플릿 중복: 0명.
- action 집계(슬롯): keep 201, add 58, convert 26, replace 15, default_only 83 (stats 필드의 add 50·materialize 8은 add 58에 합산되는 값으로 보임, 아래 미결 참조).
- 슬롯 중 엔진 pending 20개.

주의: 1단계(phase2 제외) 기준 S급 3명은 2단계 템플릿 의존으로 "S급 스킬 2개"가 0이다(이순신 노트). S 영웅의 스킬은 현재 A/B 수준이고 S급 가치는 2단계 엔진 후에 채워진다.

### 영웅 등급 대비 스킬 등급 분포 (슬롯 수)

| 영웅\스킬 | A | B | C | S |
|---|---|---|---|---|
| S영웅 | 8 | 6 | 1 | 0 |
| A영웅 | 33 | 44 | 47 | 0 |
| B영웅 | 19 | 85 | 52 | 0 |
| C영웅 | 5 | 20 | 63 | 0 |

- 영웅 등급보다 높은 스킬 등급이 붙은 슬롯: B영웅의 A스킬 19, C영웅의 A 5 + B 20 (C 영웅 22명). 대부분 지형 특화(권율 산악, 곽재우 산악·숲, 김시민 성 등) 신규 스킬로 정체성 유지 목적. 규칙상 "등급 상한"을 어떻게 볼지는 미결(아래).

## 3. 신규 스킬 요약 (new_skills 99개)

- 유형/등급: 액티브 56(A 12, B 4, C 40), 패시브 43(A 21, B 22). 전부 `name_ko`/`flavor`는 null, `needs_scenario_review: true`.
- 템플릿: T_ACTIVE_STRIKE 24, T_ACTIVE_BUFF 18, T_ACTIVE_SURGE 10, T_ATKDEF_HYBRID 7, T_TERRAIN_DEF 7, T_FORMATION 6, T_ATK_UP 6, T_LAST_STAND 6, T_ACTIVE_AOE 4, T_DEF_UP 4, T_FIRST_STRIKE 3, T_COUNTER_ATK 3, T_CHARGE 1.
- 지형 특화 패시브는 `terrain_specialist: true`(T_TERRAIN_DEF 방어 +40% 등, 특정 지형 조건부). 철학상 "지형이 병종 성능을 바꾼다"에 맞춘 상황 의존 설계.
- 병종 기본 액티브가 부족한 영웅은 `(병종기본-등급보정)` 슬롯(T_ACTIVE_AOE 등)으로 채움. 이 슬롯은 아직 DB에 존재하지 않아 materialize가 필요.

## 4. 박백엔 전달: engine_changes_required

| ID | 항목 | 필요 이유 |
|---|---|---|
| E1 | HeuristicBot 다중 액티브 사용 (현재는 첫 usableActive만) | S/A 액티브 2개 |
| E2 | 병종 기본 액티브 주입 규칙: 영웅 액티브 수가 목표 미만이면 채움, 또는 materialize 행 사용 | A/S 2개, B/C 1개 |
| E3 | `game:audit-skills` 검증(등급별 개수·등급 상한·동일 템플릿 중복) | 규칙 강제 |
| E4 | T_MOVE_UP / T_PURSUIT(target_hp_below_pct) / T_SIEGE_ATK(target_terrain) / T_REGEN 구현 또는 대체 | 엔진대기 슬롯 20개 |
| E5 | 신규 템플릿 T_MATCHUP_NEGATE, T_TERRAIN_MASTER, T_ACTIVE_STANCE, T_ACTIVE_PIERCE, T_ACTIVE_DECOY | S급 스킬(2단계) |
| E6 | BUFF/HEAL 액티브 순효과 보정(행동 미소모 또는 지속 2턴) 검토 | 지원형 액티브 가치 |
| E7 | seed: new_skills 적재(skills.template/params/enabled) + hero_skills sort_order, 개발 DB 한정, 멱등 | 적용 |

검증 방법 제안: E1·E2 적용 후 `game:simulate`로 같은 시드 전후 비교(등급별 승률, 평균 턴, 스킬 사용률). E5 이전에는 S 영웅이 B 영웅 대비 우월하지 않을 수 있어 별도 측정 필요.

## 5. 리스크 / 미결정 (사용자 검토 후보는 "아침 결정 대기")

1. **[아침 결정 대기] 영웅 등급 상한 vs 스킬 등급**: B/C 영웅에 A·B 스킬이 붙는 지형 특화 예외(44슬롯 중 C영웅 22명 등)를 허용할지, 모든 스킬을 영웅 등급 이하로 제한할지. 허용하면 정체성 유지, 제한하면 E3 감사 규칙이 단순해진다.
2. **[아침 결정 대기] S영웅 3명의 1단계 한계**: 2단계 엔진(E5) 전까지 S 스킬이 A/B 수준. 2단계를 먼저 할지, 1단계를 임시로 쓸지.
3. **[아침 결정 대기] 병종 기본 액티브 materialize 방식**(E2): 영웅별 DB 행 생성 vs 런타임 주입.
4. 신규 스킬 99개의 이름·flavor는 송서사 작성 필요(역사 근거 수준 표기는 대사에 넣지 않는다는 규칙 준수).
5. 엔진 pending 20슬롯은 E4 전까지 동작하지 않아 해당 영웅의 실제 스킬 수가 목표 미만이 된다.
6. stats 필드의 add(50)/materialize(8)와 영웅별 action 집계 add(58)가 합산 방식으로 일치하는지 박백엔 적용 시 확인 필요(검증으로 개수 위반은 없음).
7. 모든 수치(power_pct, cooldown, uses, 보정 %)는 시작값이며 시뮬 미측정. 상성이 뚜렷한 방향(평준화 금지)으로 설계했으나 측정으로 확인되지 않은 가설이다.
8. 사람이 확인할 것: S/A 액티브 2개 사용감, 지형 특화 영웅의 지형 외 약세 체감, 신규 스킬 가독성.

## 7. 적용 결과 (박백엔, 2026-11-04)
- 데이터 v2: `new_skills` 99개에 송서사 이름·flavor 병합 + S급 2단계 6개(이순신·알렉산드로스·칭기즈 칸의 패시브 1 + 액티브 1, 임시 이름 `provisional_name`, 송서사 검수 대상) 추가 = 105개.
- 정책 결정(기본안): 영웅 등급보다 높은 스킬 등급 허용(지형 특화, 현재 시드 영웅 113명 기준 19슬롯), S 영웅은 엔진 2단계(E5)를 먼저 구현해 S급 스킬로 채움. 칭기즈 칸의 교체 대상 패시브는 원안의 `gk_hyb_weak` 가 이미 액티브로 전환되어 `gk_atk_mid` 로 변경.
- 엔진: E4(PURSUIT/SIEGE/MOVE_UP/REGEN) 구현, E5(TERRAIN_MASTER/MATCHUP_NEGATE/PIERCE/STANCE) 구현, E1 은 변경 없음(코드 확인), E2 는 데이터가 모든 A/S 영웅의 2번째 액티브를 명시 행으로 제공하므로 런타임 주입 변경 없음(B/C 의 default_only 는 기존 병종 기본 액티브 주입). E6 은 측정 후 결정으로 보류. DECOY 는 미구현 유지(데이터 비활성).
- 적용: `game:seed-skill-grades`(개발 DB 113명 적용, 확장 보류 17명은 heroes 시드 후 재실행), 기존 keep 스킬 20개(engine:pending) 활성화 — 이 중 `jr_clinic_heal` 등 액티브 5개와 `gb_last_mid` 는 근거 검수 보류(needs_verify/pending_review) 이력이 있어 송서사 확인 필요.
- 검증: `game:audit-skills` 위반 0건. 테스트 `SkillGradeSeedTest`, `SkillGradeTemplatesTest`.
- 재시드 순서: `game:seed` -> `game:seed-active-skills` -> `game:seed-skill-grades`.
- 후속(2026-11-04): S급 6개 이름 정식화(송서사)를 skills 에 반영, 검수 보류 6개 스킬(zy_fire_aoe·ja_morale_atk·jr_clinic_heal·my_raid_surge·sy_breakthrough_strike·gb_last_mid)의 flavor 확정·needs_verify/pending_review 해제(`active_skill_assignments.json`·`hero_skill_assignments.json` 갱신, 개발 DB 는 `game:seed-skill-grades` 가 공개 처리. sy_breakthrough_strike 는 원문 citation 노트 유지). 영웅 상세 `effect` 에 T_TERRAIN_MASTER 는 "해당 지형 이동 비용 -N(최소 1)", T_MATCHUP_NEGATE 는 "<병종> 상대 상성 불리 무효" 문구가 붙는다.
- 주의: 스킬 등급 적용 뒤에는 영웅당 액티브가 2개가 되어 `game:seed-active-skills` 의 "한 영웅 액티브 1개" 검증이 실패한다. 재시드 순서는 `game:seed` → `game:seed-active-skills` → `game:seed-skill-grades`(이미 적용된 DB 에서 seed-active-skills 를 다시 돌려도 재분배 영웅의 연결은 건드리지 않는다). `game:seed-shelf` 는 스킬 연결을 건드리지 않는다(적용 후 seed-skill-grades 재실행 시 변경 0건으로 확인).
