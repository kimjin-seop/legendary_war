# 액티브 스킬 2단계 - 추가 템플릿 스펙 (제안)

작성: 임밸런 / 2026-11-01 / 상태: 제안(미구현, 미측정)
데이터 원본: `database/data/active_skill_templates_proposal.json` (파라미터 스키마·의사코드·검증·배정 전체)

> 모든 수치는 **가정 시작값**이며 시뮬레이션은 실행하지 않았다(미측정). 근거 수준 표기: 엔진 사실=코드 직접 확인 / 산술=기준 피해 18(검병 atk28 vs def10 중립) / 가설=미검증. 최종 느낌은 사람 플레이 피드백 필요. `T_ACTIVE_DECOY`(공성계)는 제외(송서사: 정사 근거 확인 전 사용 금지).

## 1. 현황 (엔진 사실)

- `Engine::ACTIVE_TEMPLATES` = `T_ACTIVE_STRIKE` 하나. `use_skill{unit_id,skill,target_id}`는 적 대상 + 일반 공격 사거리, 영웅 행동 소모.
- `skill_state[code]={cd,uses_left}`; 쿨다운 틱은 일반=`endTurn`(다음 진영), 교대 행동=`endRound`(양측).
- `GameData::heroActives`는 params 중 `power_pct/cooldown/uses`만 읽는다 -> 신규 파라미터는 현재 전달되지 않음.
- `HeuristicBot::combatSteps`는 템플릿 구분 없이 `usableActive` 첫 항목으로 일반 공격을 대체한다.
- 관찰(산술): uses 기본 2 때문에 쿨다운 3 vs 2 차이는 실전에서 거의 무의미할 가능성이 크다(미측정).

## 2. 신규 템플릿 4종 요약

| 템플릿 | 효과 | 핵심 파라미터(시작값) | 영웅 행동 | 엔진 난이도 |
|---|---|---|---|---|
| `T_ACTIVE_AOE` | 대상 중심 인접 적에게 감쇠 피해 | power 100, radius 1(고정), splash 60%, friendly_fire false, cd 4, uses 1 | 소모 | 중(사망 처리 헬퍼 분리) |
| `T_ACTIVE_BUFF` | 아군 atk/def/move 택일 N턴 | stat, amount(atk 10%/def 20%/move 1), duration 1, self_area r2 또는 ally, cd 4, uses 2 | 소모(move는 미소모 권장) | 중(buffs 상태, 만료 틱) |
| `T_ACTIVE_HEAL` | 치유량 방식 회복 | heal_flat 14, heal_pct 20(= max(flat, max_hp%)), radius 0, cast_range 2, cd 4, uses 2 | 소모 | 소~중 |
| `T_ACTIVE_SURGE` | 이번 턴 이동력 +N, 선택적 돌진 공격 배율 | move_bonus 2, attack_pct 100~110, min_turn 2, leap false, cd 4, uses 2 | **미소모**(사용->move->attack) | 소(moveBudget 가산) |

### 2.1 T_ACTIVE_AOE
- 의사코드: 검증(적, 사거리) -> cd/uses 차감, acted=true -> center=대상 위치 -> 주 대상 `doAttack`(powerMult) + 반격은 일반 규칙 -> 맨해튼 반경 1 적(id 오름차순)에 `damageInfo(counter=true: 정면 취급)` x power x splash, **반격 없음** -> 대상별 kill/collapse/commander_defeated 처리, 전투 종료 시 중단. 시전자가 반격으로 죽으면 splash 취소.
- 이벤트: `skill_use` + `kind:'aoe', center, radius, targets[], splash_pct, friendly_fire`; `attack`에 `via_skill`, `splash`.
- 봇: (인접 splash 적 수 - 아군 오폭) >= 1일 때만 사용.
- FE: 대상 타일 원형 파동, 십자 5칸 하이라이트, 중심 큰 숫자/주변 옅고 작은 숫자.
- 산술: 인접 적 n명 총 피해 18+10.8n (n=0..3: 18/28.8/39.6/50.4). 강타 130은 23.4(+5.4). 즉 n>=2에서 강타의 약 4배 가치.
- 극단 위험: HIGH n>=2 편향(uses 1, power<=100으로 완화), HIGH 지휘관 선제 처치(min_turn 검토), MED friendly_fire=true(v1 비허용).

### 2.2 T_ACTIVE_BUFF
- 의사코드: 검증 -> 차감 -> 수혜자(self_area: 시전자 중심 반경 내 아군+소속 부대 / ally: 사거리 내 아군) 결정 -> `buffs[]`에 {stat,amount,left}. 같은 stat은 max로 갱신(합산 금지) -> damageInfo의 `$aAtk/$dDef` 가산 풀에 합산(기존 clamp/def_total_cap/facing_cap이 상한, 반격에도 적용), move는 `moveBudget` 가산 -> 시전 진영 틱에서 left-1, 0이면 `buff_expire`.
- 이벤트: `skill_use{kind:'buff',stat,amount,duration,targets[],center}`, 신규 `buff_apply`, `buff_expire`, 유닛 뷰 `buffs[]`.
- 봇: self_area 반경 내 아군 3명 이상 + 교전 임박일 때. 같은 stat 버프가 남아 있으면 재사용 안 함.
- FE: 시전자 중심 색 파동(atk 주황/def 파랑/move 초록), 수혜 유닛 스탯 아이콘+남은 턴 점, 만료 시 페이드.
- 산술: atk+10% = 순피해 18->20.8(+15.6%/공격). def+20% = 18->16(-11%/피격). move+1 = 보병 +25%. 클램프 주의: 상성 유리에서 가산 합이 +20% 넘으면 초과분 소실(지휘관 오라 부대는 효용 저하, 확인 필요).
- 극단 위험: HIGH move+2/duration 2(선공 기습·교착), HIGH atk 버프가 후공 보정과 합산되어 선후공 편향 변동, MED def 30%+지형이 def_total_cap 60 도달.

### 2.3 T_ACTIVE_HEAL
- 의사코드: 검증(같은 진영, 사거리, hp<max_hp 아니면 `skill_no_effect`) -> 차감, acted=true -> 치유량 = min(결손, max(heal_flat, ceil(max_hp x heal_pct%))) -> `heal` 이벤트 재사용(`via_skill`). radius=1이면 인접 아군에 area_pct. **heal_cap과 분리**(영웅 행동 소모의 대가) 권장.
- 봇: 최저 HP 비율 아군의 결손이 예상 치유량의 70% 이상일 때만.
- FE: 초록 십자 파티클 + `+N`, HP바 트윈.
- 산술: 17~20 HP는 일반 공격 1회(18)와 비슷 -> 행동 기회비용 상쇄, 이득은 처치 방지에서 발생. 기존 패시브: max(12, max_hp 15%), 진영 턴 합 cap 30.
- 극단 위험: MED 치유사 패시브+액티브 교착(턴 제한률), MED 지휘관 보호로 처치 승률 하락, LOW radius 1 밀집 증폭.

### 2.4 T_ACTIVE_SURGE
- 설계 선택: 복합 액션이 아닌 **사용 -> 일반 move -> 일반 attack**. 경로탐색 수정 없이 `moveBudget`에 가산만 하면 `reachable()`이 검증한다(가장 구현 쉬움).
- 의사코드: 검증(moved=false, turn>=min_turn) -> 차감 -> acted 변경 없음, `skill_move_bonus`/`skill_attack_pct` 설정 -> 턴 종료 리셋 루프에서 unset. `attack_pct`는 그 턴 첫 일반 공격에서만 소비(strike 계열과 곱 금지). 교대 행동 on: acted 미소모라 활성화 종료에 영향 없음. `first_move_limit` 슬롯도 소모하지 않음.
- 봇: 일반 이동으로는 사거리 밖이나 (이동+bonus)로는 닿고 도착 칸 위험이 한계 내일 때만.
- FE: 속도선, 이동 범위가 바깥으로 한 겹 확장, 잔상. attack_pct>100이면 도착 후 공격 연출 강화.
- 산술: 근접 위협 반경 5->7, 도달 면적 25->49(약 +96%). attack_pct 110은 +1.8 피해로 미미.
- 극단 위험: HIGH 선공 2턴 후열/지휘관 처치(지휘관 영웅 부여 금지), HIGH bonus 3+기병(지형 의미 저하), MED 장애물 우회. `leap`(유닛 통과)은 v1 비허용.

## 3. 영웅 배정안 (25명, 1영웅 1액티브)

공통: 스킬명·효과는 게임 창작(is_invented), flavor는 숨김, `ev`는 근거로 삼은 특성의 hero_profiles 근거 수준. `*`=needs_verify. hero_unit_type은 영웅 본인 유닛(사거리 결정), troop은 hero_troop_types(임시 각색).

| 템플릿 | 영웅(등급, 영웅유닛/부대) | 스킬명 | ev | 비고 |
|---|---|---|---|---|
| AOE 100/60 | 나폴레옹(A, archer/spear) | 포병 집중 사격 | confirmed | 툴롱 포병 |
| AOE | 메흐메트 2세(A, archer/sword) | 공성포 포격 | confirmed | 패시브 m2_siege_strong과 컨셉 중복 |
| AOE | 오다 노부나가(A, archer/spear) | 화승총 집중 사격 | accepted | 3단 사격 연상 금지 |
| AOE 95/55 | 헨리 5세(B, archer/heavy) | 장궁 일제 사격 | confirmed | |
| AOE 95/55 | 주유*(B, mage/archer) | 적벽의 불길 | confirmed | 화공 귀속 논쟁(basis 명시) |
| BUFF atk 10 r2 | 스키피오(A) / 김유신(A) / 유방(A) / 조조(A) | 군단·전군·연합 독려, 대군 지휘 | accepted~confirmed | 조조는 패시브 보유로 스킬 수 예산 확인 |
| BUFF atk 8 r2 | 잔 다르크*(A, sword/heavy) | 사기 고취 | accepted | 근거=사기 진작 상징(지휘권 없음), 종교 표현 금지 |
| BUFF def 20 | 레오니다스(C, r1) / 웰링턴(B) / 쩐흥다오(B) / 강감찬(B) | 방패 대열/횡대 방어/방어 진지/방어 태세 | accepted | 300명 서사·역사면·귀주 연도 금지 |
| BUFF def 25 | 보방(A, heavy/archer) | 보루 구축 | confirmed | 패시브와 방어 축 중복, def_total_cap 주의 |
| BUFF move 1 r2 | 산마르틴(A, mage/cavalry) | 종대 분진 기동 | confirmed | 6개 종대 횡단 |
| HEAL 14/20% | 허준(C) / 이븐 시나(C) / 호세 리살*(C) | 동의보감·의학정전 처방, 진료소 처방 | confirmed/accepted | 의학 업적 근거(군사 아님), 리살 의사 직업 근거 basis에 없음 |
| HEAL 16/22% r1 | 힐데가르트(B, healer/heavy) | 약초 처방 | accepted | 범위 치유 시험, 저서명 사용 금지 |
| SURGE bonus2 atk105 | 할리드(B, cavalry/cavalry) | 사막 횡단 기동 | accepted | 경로 세부 전승 편차 |
| SURGE bonus2 atk110 | 요시쓰네*(A, cavalry/cavalry) | 기습 강습 | accepted | 기동 근거 없음, 병종 기반, 일화 연출 금지 |
| STRIKE 125 | 항우(C) / 리처드 1세(A) / 사나다 유키무라*(B) | 결사 일격/선두 돌격/본진 돌파 | confirmed/accepted | 사나다는 원문 citation needed 다수 |

집계: AOE 5 + BUFF 11 + HEAL 4 + SURGE 2 + STRIKE 3 = 25.

### 3.1 현 활성 4종과의 정합
| 영웅 | 스킬 | 정합 판단 |
|---|---|---|
| 이순신 | naval_barrage (강타 130, cd3) | 정합(archer 사거리 2). 현 4종 최고 배율 |
| 한니발 | cannae_encirclement (강타 120) | 불일치 소지: '포위' 이름 vs 단일 강타. 이름 일반화 또는 AOE 전환 후 재측정, needs_verify |
| 알렉산드로스 | cavalry_charge (강타 125) | 정합. 같은 영웅에 SURGE 추가 금지(중복) |
| 칭기즈칸 | horde_arrows (강타 120, cd2) | 불일치 소지: '화살'인데 영웅 유닛 cavalry(사거리 1). FE 연출 '화살 비' 금지 또는 이름 변경. cd2는 uses 2가 먼저 소진돼 무의미(산술) |

신규 배정은 4종과 영웅 중복이 없고(25명 모두 별도), 4종은 S/A 시그니처이므로 신규 STRIKE는 C~A에서 125 이하로 제한했다.

## 4. 박백엔 구현 요구사항 (엔진/백엔드)

1. `ACTIVE_TEMPLATES`에 `aoe|buff|heal|surge` 등록. `doUseSkill`을 템플릿별 핸들러로 분기. 공통 검증 후에만 cd/uses 차감(기존 규약 유지).
2. `GameData::heroActives`: params 전체를 검증된 형태로 전달(`param_schema` clamp, 템플릿별 uses 기본값 AOE=1). 범위 밖 시드는 거부 또는 clamp+로그. 시드/적재 검증 테스트.
3. `doAttack`의 사망/붕괴/지휘관 처치 블록을 헬퍼로 분리(AOE 재사용). 전투 종료 후 처리 중단 가드.
4. `damageInfo`에 버프 합산(가산 풀, 기존 clamp/def_total_cap/facing_cap 이내, 반격에도 적용), `moveBudget`에 buff/surge 가산(first_turn_move_cap 초과 금지).
5. 만료 틱: `tickCooldowns` 호출 지점에 `buffs[].left` 감소 + `buff_expire`. `endTurn`/`endRound` 리셋 루프에서 `skill_move_bonus/skill_attack_pct` unset. 같은 stat 버프는 max 갱신(합산 금지).
6. 이벤트 확장(하위호환: 키 없음=기존 의미): `skill_use.kind/targets/center/...`, `attack.via_skill/splash`, `heal.via_skill`, 신규 `buff_apply/buff_expire`. 시뮬레이터 `skill_uses` 템플릿별 집계(`skill_uses_by_template`).
7. 뷰: `activeSkillView`에 `kind, target_kind, params, targets(아군 포함)`. 에러코드 신규: `skill_turn_locked`(409), `skill_no_effect`(422).
8. 봇: `usableActive`를 템플릿별 판단으로 확장(2장의 봇 규칙). 현재 "첫 액티브 무조건 사용" 로직은 buff/heal/surge에 부적합.
9. 정책 결정 필요: (a) 액티브 치유와 `heal_cap` 분리 여부(제안: 분리), (b) `stat=move` 버프를 acted 미소모로 할지(제안: 미소모), (c) AOE 타일 지정은 v2.
10. 테스트(최소): 템플릿별 핵심 동작 1개(AOE 감쇠+반격 없음, BUFF 만료, HEAL 만피 거부, SURGE 이동 범위) + 실패 시 상태 불변.

## 5. 측정 계획 (구현 후, 임밸런)

- 이번 작업에서는 `game:simulate`를 실행하지 않았다(엔진 미구현이라 측정 불가) -> 위 판단은 모두 산술·가설.
- 구현 후: 동일 시드로 액티브 off/on 기준선 -> 템플릿 1종씩 켜서 비교. 지표: 진영·선후공 승률(95% CI), 평균 턴, 턴 제한률, 선공 1턴 처치율, 템플릿별 skill_uses. 매치업당 500판 이상 권장(승률 CI 약 ±4.4%p).
- 극단 판정 기준(가정): 영웅 보유 팀 승률 >60%/<40%, 선공 편향 >55%, 턴 제한률 +5%p.

## 6. 사람이 확인할 것
- 송서사: `*` 표시 5명(주유, 잔 다르크, 호세 리살, 요시쓰네, 사나다) + 기존 한니발 스킬명(사건 암시) 및 연출 금지 항목.
- 플레이 체감: AOE 가치 과다 여부, 버프 지속 1턴이 체감 가능한지, SURGE 이동 범위 UI 이해도, 치유 교착.
- 팀장 승인: 시드 반영 시점, 한 영웅 다중 액티브 허용 여부.

## 7. MP 방식 전환 (v1 구현, 2026-11-01 사용자 결정 / 문기획 확정안 그대로)

쿨다운/전투당 횟수를 MP로 대체한다. 모든 수치는 가정 시작값(미측정, 밸런스 대상). 공식은 `app/Game/MpRules.php` 한 곳.

- 스위치: `config/game.php` rules `mp_skills`(기본 false, 기존 `active_skills`와 별개). 켜면 새 전투 생성 시 `state.mp_mode=true`·`state.mp_knobs`로 고정, 키 없는 진행 중 전투는 레거시 cd/uses.
- 영웅 1턴 스킬 1회(`turn_skill_used`, surge·move 버프 포함) -> 위반 `skill_turn_locked` 409. MP 부족 `insufficient_mp` 409(검증 통과 후에만 차감).
- `mp_max = clamp(희귀도 C40/B45/A50/S55 + 2x(level-1) + mage·healer 영웅 +10, 30, 100)`, 시작 `mp_start_pct=50`. 영웅(액티브 보유)만 MP, 병사 없음.
- 회복: 진영 턴 시작(교대 행동은 라운드 시작) `max(mp_regen_min=5, round(mp_max x mp_regen_pct=15%))`, 상한 초과분 버림(state `mp_overflow` 누적 계측, delta=0인 만땅 회복은 `mp_change` 미발행). 진영 단위 턴 모드는 후공 진영의 1턴 시작 회복을 첫 틱 1회 건너뜀(노브 `mp_skip_first_regen`, 기본 true, `state.mp_first_tick_skipped`; 교대 행동은 1라운드 회복 없음과 일치해 해당 없음). `mp_wait_pct`(기본 0)는 wait 추가 회복 옵션. `mp_on_hit`/`mp_on_kill`(기본 0)은 노브만(v1 미구현, 피격·격파 회복과 MP 회복 스킬은 없음).
- 비용: `skills.params.mp_cost`(5~100) 우선, 없으면 strike `20+round((power-100)x0.5)`, aoe `40+round((power-100)x0.5+(splash-60)x0.5)`, buff atk `22+amount x0.8`/def `10+amount x0.75`/move `20`, heal `30`(radius>=1 +4), surge `25`(attack_pct>=110 +3), 반올림 정수. (구현 가정: 명세의 "heal r1 16/22%"는 radius=1 변형으로 해석해 +4)
- 공개 정책(팀장 결정): 상대에게 공개 = 스킬 정의·소모량(`mp_cost`, 정적 카탈로그. `/heroes`도 노출). 비공개 = 현재 MP 수치(5% 단위 비율 `mp_pct`만 공개)·사용 가능 여부(`usable`)·대상 후보(`targets`). 뷰·이벤트에서 상대의 mp/mp_max/delta/overflow/mp_left 제거, mp_pct는 5% 양자화. 상대 영웅 `active_skills[]`(MP 방식)는 usable·mp_left 제거, targets는 빈 배열(usable 1비트 누설 방지), mp_cost는 유지(레거시 모드는 기존 그대로). `skill_use` 이벤트의 mp_cost도 정적 값이라 공개(일관성), mp_left만 제거. 본인 진영은 정확값. 방/PvP는 내 진영 기준 가림.
- 허용된 한계(LOW-2): mp_pct 5% 양자화 + 공개 mp_cost + 이벤트 누적으로 상대 MP를 대략 추정할 수 있음. 정확값 은닉이 아닌 "수치 직접 노출 방지"가 목표이므로 허용.
- 시뮬레이터 지표: `mp_spent`, `mp_overflow`, `skill_blocked_by_mp`(MP가 영웅 최저 스킬 비용 미만일 때 일반 공격 선택 횟수), `skill_first_use_turn{a,b}`.
- API/이벤트 계약: `routes/api.php` 액티브 MP 방식 주석 참조.
- 미정/확인 필요: 수치 전부 임밸런 측정 후 확정, 기존 5명 비활성(주유 등)·DB 스키마는 변경 없음.

## 8. 스킬 등급 재분배 2단계 템플릿 (2026-11-04, 박백엔)
- 액티브 `T_ACTIVE_PIERCE`(kind=pierce): 강타와 같은 경로(영웅 행동 소모, 반격 규칙 동일) + 대상 **기본 방어**의 `def_ignore_pct`%(20~40, 기본 30) 무시(지형·오라 방어 보정 유지, 마법사 방어 무시와는 큰 쪽만 적용). params `power_pct`(100~150, 기본 120), `cooldown`, `uses`.
- 액티브 `T_ACTIVE_STANCE`(kind=stance, target_kind=self): 시전자 중심 `radius`(1~2) 내 아군(본인 포함)에 `duration` 라운드 동안 buff stat=`counter`(amount=`counter_pct` 30~60) 부여. 반격 피해 가산(같은 가산 풀, 총배율 clamp 이내) + 반격 시 상성 불리 배율 1.0 취급. 영웅 행동 소모. 봇은 교전 임박 + 반경 내 아군 2명 이상일 때 사용.
- 패시브 확장: `T_PURSUIT`(when.target_hp_below_pct, 공격 효과), `T_SIEGE_ATK`(when.target_terrain[], 공격 효과), `T_MOVE_UP`(effects[{move:N}] -> 영웅 이동력 +N, `Engine::moveBudget`), `T_REGEN`(effects[{regen_hp:N}] -> 자기 진영 턴 종료 시 영웅이 최대 HP의 N% 회복, heal_cap 과 별개), `T_TERRAIN_MASTER`(해당 지형 위 공/방 효과 + params.move_discount{terrain[],amount} 로 진입 이동비용 -N, 최소 1), `T_MATCHUP_NEGATE`(params.matchup_negate[병종] 상대 상성 불리 배율을 1.0으로. 유리 배율 불변).
- 규칙 옵션 `passive_skills` 가 꺼지면 패시브류(move/regen/special)는 모두 무시. 진행 중 전투 호환: 유닛에 `special`/`passive.move` 키가 없으면 동작 불변.
- 데이터/시드: `docs/SKILL_GRADE_PLAN.md`, `game:seed-skill-grades`, `game:audit-skills`.

## 속성 시스템 (첫 증분, 2026-11-04)
- 속성: `fire`(불) / `thunder`(번개) / `water_ice`(물·얼음) / `poison`(독). 원본 `database/data/elements.json`(내성 표, 시작값 미측정), 로직 `app/Game/Elements.php`.
- 스킬: `T_ACTIVE_STRIKE/AOE/PIERCE`의 선택 params `element`(알 수 없는 값은 normalize가 생략, 시드 `violations`가 거부). 현재 fire 스킬 = `zy_fire_aoe`(적벽의 불길, param_overrides + assignments 반영). 영웅별 속성 배정(마력 폭발 등)은 같은 `element` 키로 가능.
- 피해: `damageInfo`에서 방어 감산 뒤 최종 피해에 `1 - 합산내성%/100`을 곱한다(합산 = 피격자 병종 + 피격자 타일 지형 + 영웅 + 장비(다음 증분), +-50 clamp). element 없으면 1.0으로 기존과 동일. AOE 주 대상·splash 모두 대상별로 적용.
- 이벤트: `skill_use.element`(속성 스킬만), `attack.element`, `attack.element_pct`(내성 반영 증감 %, +30 약점 / -30 내성). 속성 없으면 키 생략(하위 호환).
- 뷰: 스킬 목록 `element`(없으면 null), 유닛 `resists{element: %}`(병종+영웅 기준, 0 생략), 스킬 설명 문구에 `[불 속성] ` 접두.
- 이번 제외: 연소·날씨, 장비 내성 가산, 봇의 약점 대상 선택(봇은 element 스킬을 일반 스킬처럼 사용).

## 레벨 마일스톤 MP 계단 (2026-11-04)
- `config('game.level_rewards.milestones')`(`app/Game/LevelRewards.php`): Lv10(부대 3개, MP +10), Lv20(부대 4개), Lv30(MP +10). 최대 MP = 기존 공식(희귀도 기본 + 2 x (Lv-1) + 시전 병종 20) + 누적 mp_bonus, 30~160 clamp. 진행 중 전투는 생성 시 mp_max가 고정되어 영향 없음.
