# 스킬 등급 재분배 - 엔진·백엔드 검토 (코드 변경 없음)

작성: 박백엔, 2026-11-04. 대상: `docs/SKILL_GRADE_PLAN.md` 의 `engine_changes_required` E1~E7.
결론: 코드는 수정하지 않았다. 승인 전에는 계획서 JSON도 DB에 적재하지 않는다. 아래는 현재 코드를 읽고 확인한 사실이다.

## 1. 항목별 판단

| ID | 계획서 가정 | 코드 확인 결과 | 필요한 변경 | 단계 |
|---|---|---|---|---|
| E1 | 봇이 첫 액티브만 쓴다 | `Engine::usableActive`·`supportActive` 는 `$u['actives']` 를 순회해 쿨다운 0·잔여 횟수>0 인 첫 항목을 반환한다. 영웅 액티브가 2개여도 첫 번째가 쿨다운 중이면 두 번째를 쓴다. 한 턴에 영웅 행동은 1회(`acted`)이므로 한 턴에 둘을 쓰는 구조는 불가능하다 | 코드 변경 불필요. 우선순위는 `hero_skills.sort_order` 순서로 결정된다. 필요하면 봇의 선택 규칙(강한 것 우선)만 조정 | 1 |
| E2 | 병종 기본 액티브 주입 규칙 | `ArmyBuilder::withDefaultActives` 는 영웅에게 액티브가 하나도 없을 때만 병종 기본 액티브 1개를 얹는다. 목표 개수(A/S 2, B/C 1)에 맞추는 부족분 채우기는 없다 | 방식 결정 필요(아래 3번). 런타임 주입은 `withDefaultActives` 를 "부족분만큼" 확장. materialize 는 `hero_skills` 행 생성 | 1 |
| E3 | `game:audit-skills` | 해당 명령 없음. `game:audit-stages`·`GameSeedActiveSkills` 가 비슷한 패턴 | 신규 읽기 전용 명령. 등급별 패시브/액티브 개수, 영웅 등급 대비 스킬 등급 상한(정책 결정 후), 같은 영웅 내 템플릿 중복, `enabled=0` 슬롯 수 집계 | 1 |
| E4 | T_MOVE_UP / T_PURSUIT / T_SIEGE_ATK / T_REGEN 미구현 | `GameSeed` 는 T_PURSUIT(`target_hp_below_pct`)·T_SIEGE_ATK(`target_terrain`)를 when 으로 변환하지만, `PassiveEffects::WHEN_KEYS` 와 `SUPPORTED_TEMPLATES` 에 없어 `enabled=0` 으로만 적재된다. T_MOVE_UP(move)·T_REGEN(regen_hp)은 KEYS(`atk_pct`,`def_pct`,`heal`) 밖이라 `normalize` 가 버린다 | PURSUIT/SIEGE: `WHEN_KEYS` 두 키 추가 + `Engine::skillContext` 해석(대상 HP 비율, 대상 지형) + `SUPPORTED_TEMPLATES` 추가. MOVE_UP: 이동력 보정 경로 신설(이동 계산, 도달 범위 영향이 크다). REGEN: 턴 시작 회복 경로 신설 | 1 (PURSUIT·SIEGE), 2 (MOVE_UP·REGEN 권장) |
| E5 | S급 신규 템플릿 5종 | `Engine::ACTIVE_TEMPLATES` 는 strike/aoe/buff/heal/surge 5종뿐이고 `T_ACTIVE_DECOY` 는 데이터 비활성 상태다. 스탠스·관통·미끼·상성무효·지형 숙련은 모두 신설 | 템플릿별 설계·`ActiveParams` 스키마·엔진 처리·봇 판단·테스트가 각각 필요. 규모가 가장 크다 | 2 |
| E6 | BUFF/HEAL 순효과 보정 | 지원형 액티브는 영웅 행동을 소모한다(`acted`). 순효과 비교는 `game:simulate` 측정이 먼저 | 측정 후 결정. 행동 미소모로 바꾸면 규칙 변경이므로 승인 필요 | 2 |
| E7 | new_skills 99개 적재 | `skills`(template/params/enabled)·`hero_skills`(sort_order) 구조로 적재 가능. 지원 템플릿은 `enabled=1`, 미지원은 `enabled=0` 으로 들어가는 기존 규칙이 있다 | 전용 시더(멱등, 개발 DB 한정, `--dry-run`, 스냅샷 선행). 이름·flavor 는 null 이므로 송서사 작성 후 적재 권장 | 1 |

## 2. 1단계로 가능한 범위

- 지원 템플릿 12종(패시브)과 액티브 5종만 쓰는 슬롯은 시드 적재만으로 동작한다.
- E7 시더, E3 감사 명령, E2 부족분 주입(또는 materialize), E4 중 T_PURSUIT·T_SIEGE_ATK.
- 엔진 pending 20슬롯 중 PURSUIT·SIEGE 해당분만 살아나고, MOVE_UP·REGEN 해당분은 2단계까지 `enabled=0` 으로 남는다. 해당 영웅은 실제 스킬 수가 목표 미만이다.
- 시뮬레이션 비교(같은 시드 전후)는 E2·E7 적용 후 가능하다.

## 3. 2단계가 필요한 범위

- E5 S급 템플릿 5종(S 영웅 3명의 S 스킬 슬롯 0개 문제는 여기서 해소된다).
- E4 의 T_MOVE_UP·T_REGEN, E6.

## 4. 개수 정합성 (50+8 vs 58)

- 계획서 `stats` 의 add 50 + materialize 8 = 58 이고 영웅별 action 집계의 add 58 과 합이 같다. 같은 슬롯을 다른 이름으로 센 것으로 보이며 중복 계산은 아니다. 다만 JSON 원본을 이 검토에서 다시 집계하지는 않았고 계획서 수치만 대조했다. E7 시더 dry-run 에서 add 와 materialize 를 각각 출력해 실제 행 수로 확정한다.

## 5. 위험

- `skills.template` 에 DB 기준으로 없는 템플릿이 들어가도 현재는 `enabled=0` 으로 안전하게 비활성된다. 이 안전장치(`SUPPORTED_TEMPLATES`)를 유지해야 한다.
- 진행 중 전투 호환: 엔진 규칙을 바꾸면 기존 전투 상태에 영향이 없도록 `state['frozen']` 방식(전투 생성 시 규칙 고정)을 적용한다. 새 when 키는 구형 전투에서 무시되어도 결과가 깨지지 않게 한다.
- 영웅 액티브를 늘리면 `game.active_skill_uses`(기본 2)·쿨다운 기본값이 곧 밸런스다. 전투 지속 시간이 길어질 수 있어 승률·평균 턴 재측정이 필요하다.
- 영웅 등급 상한 정책(계획서 5-1)은 E3 감사 규칙에 직접 반영되므로 결정이 먼저다.
- 자동 전투 금지 원칙: 봇은 시뮬레이션·적 AI 용이며 플레이어 자동 전투로 연결하지 않는다.

## 6. 권장 순서

1. 아침 결정 3건(등급 상한 정책, S 영웅 1단계 한계, materialize 방식) 확정.
2. E7 시더(dry-run) + E3 감사 명령.
3. E2, E4(PURSUIT·SIEGE).
4. `game:simulate` 전후 비교, 임밸런 검토.
5. 2단계(E5, MOVE_UP·REGEN, E6)는 별도 설계 후 진행.

## 7. 구현 결과 (2026-11-04)
E1~E7 구현/적용 완료, 상세는 `docs/SKILL_GRADE_PLAN.md` 7절. 검토 시점의 가정과 달라진 점: E1 코드 변경 없음, E2 런타임 주입 변경 없음(명시 행), E6 보류.
