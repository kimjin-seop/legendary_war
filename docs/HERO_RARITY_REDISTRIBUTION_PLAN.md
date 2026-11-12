# 영웅 등급 재분배 계획 (임밸런 v5 기준, 단계 0 개발 DB 적용 완료, 2026-11-04)

원본 데이터: `database/data/hero_skill_redistribution.json`(v3, 시더 입력), 제안 원본 `database/data/proposals/hero_final_skills_v5.json`·`hero_stat_patch_v5.json`·`new_heroes_v5.json`·`consumables_policy_v1.json`. 숫자는 파일이 우선한다. 운영 DB에는 아직 적용하지 않았다(아래 7절 절차 참고).

## 1. 등급 판정 기준
- 등급 = 역사적 영향력(비전투 인물 포함). 비전투 B 상한 규칙은 폐기했다.
- 마법사·치유사 영웅의 등급도 같은 기준으로 재판정했다.

## 2. 인원표 (재분배 대상 135명)
| 단계 | S | A | B | C | 합계 | 비고 |
|---|---|---|---|---|---|---|
| 적용 전(보류 17명 해제 후) | 3 | 31 | 52 | 44 | 130 | |
| 단계 0 적용 후 (개발 DB) | 29 | 41 | 60 | 5 | 135 | 신규 S 3(척준경·벨리사리우스·바이바르스) + NPC 승격 2(시마즈 요시히로·수부타이) 포함 |
| 단계 1 목표 | 17 | 68 | 68 | 17 | 170 | v4 안. 재판정 결과 단계 0에서 S가 이미 초과했으므로 비율 재협의 필요 |
| 단계 2 목표 | 26 | 104 | 104 | 26 | 260 | v4 안. 위와 같음 |

- 개발 DB 전체 heroes 569행(NPC 425행 포함, 비NPC 144행: S27/A41/B71/C5). 재분배 135명에는 NPC 승격 영웅(`npc_shimazu_yoshihiro`, `npc_subutai`)이 포함된다.
- 단계 0 변경 규모: 영웅 속성(등급·영웅 유닛·병종) 68건, param 보정 45건, skills 신규 159·갱신 80, hero_skills 신규 197·해제 45·순서변경 21.
- 목표 비율 10/40/40/10 은 단계 0 결과(S 21% / A 30% / B 44% / C 4%)와 어긋난다. 단계 1·2 목표는 임밸런·문기획이 다시 정한다.

## 3. 틀 v2 (hero_stat_rules.json)
- 등급 평탄 보너스(hp/atk/def): S [30,8,4], A [21,5,2.5], B [15,3.5,2], C [10,2.5,1.5].
- 성장률(%): S 4.6~5.2, A 3.8~4.3, B 3.3~3.7, C 3.0. 코스트: S6/A4/B3/C2.
- gunner 틀은 archer 와 동일하게 추가했다.
- 코스트는 단일 컬럼이라 보유 영웅은 기존 값을 유지했다(grandfather). 코스트 재설정 정책은 미결정.

## 4. 스킬 슬롯과 가치 상한
- 슬롯(패시브+액티브): S 3+2 / A 2+2 / B 2+1 / C 1+1.
- 광역 힐·광역 버프(반경 2 이상)·AOE 상위·관통·태세·유인·상성 무효·지형 달인은 S 전용(`skill_value_ceiling_by_rarity`).
- 패시브: C weak / B weak~mid / A mid(조건부 단일 strong 1개 허용) / S mid~strong. FORMATION·DEF_UP·ATKDEF_HYBRID strong 은 S 전용.
- `game:audit-skills` 결과: 위반 0건, 경고 32건(S 전용 효과를 가진 A 영웅 스킬과 병종 분포, 정보용).
- 병종 기본 액티브는 `default_active_skills.json` 의 `by_rarity` 로 등급 보정한다(현재 기병 SURGE 만 채워짐).

## 5. 병종 원칙
- 부대 병종은 `hero_troop_types.json` 의 `heroes` 맵이 우선한다. 송서사 9절 병종 12건을 우선 적용했다(료마·다테 gunner, 장수왕·한니발·관우·광개토 cavalry, 공자·무라사키·이순신 archer, 아리스토텔레스·유방 spear, 레오나르도 gunner).
- 시더는 병종이 NULL 인 영웅만 채운다(`--force` 는 사용하지 않는다).
- 병종 분포 목표는 각 18~32%이며 현재 archer 가 16.4% 로 경고 상태다.
- 신규 S 병종: 척준경 sword, 벨리사리우스 cavalry, 바이바르스 archer.

## 6. 시드 확장 내용 (이번 단계)
- `game:seed-skill-grades`: `param_overrides`(skills.params 보정)와 `enable_existing`(엔진 지원 스킬만 활성화)을 처리하고 heroes 의 등급·영웅 유닛·부대 병종을 문서와 동기화한다. 코스트는 건드리지 않는다. `npc_` 영웅이 heroes 에 없는 DB(테스트 신규 DB)에서는 오류 대신 생략한다.
- `game:audit-skills`: 같은 경우 `npc_` 영웅 미존재를 위반으로 세지 않는다.
- 신규 영웅 3명은 `hero_expansion_stats.json`·`hero_expansion_narrative.json` 에 추가했다(문화권은 `hero_cultures.json` 등록 값만 사용: korea·ancient_med·middle_east). 인연 상대가 미등록인 항목은 보류했다.
- `app_settings.skill_grades` 표식이 있는 영웅은 `game:seed` 가 스킬 연결을 되돌리지 않는다.
- 스탯 패치(`hero_stat_patch_v5.json`)는 `game:seed` 가 기존 행을 덮어쓰지 않으므로 개발 DB heroes 를 직접 UPDATE 했다(아래 8절). 신규 DB 는 갱신된 `heroes.json`·`hero_expansion_stats.json` 으로 시드된다. NPC 행(시마즈·수부타이)은 `npc_roster_v3.json` 에도 반영했으나 이미 적재된 DB 에는 직접 UPDATE 가 필요하다.

## 7. 적용 절차와 롤백
1. 스냅샷: `bash scripts/backup/backup-local.sh docker/db-backup 14` (이번 적용은 `dev-20261104-183226`, `dev-20261104-191541`).
2. DB 복사본 dry-run: `docker compose run --rm --no-deps -e DB_DATABASE=/var/www/html/docker/_dry.sqlite app ...` (`MSYS_NO_PATHCONV=1`).
3. 개발 DB 적용 순서: `game:seed` → `game:npc-promote` → `game:seed-skill-grades` → (스탯 패치 직접 UPDATE) → `game:audit-skills` → `game:hero-audit --file=database/data/heroes.json`.
4. `game:seed --force` 는 금지(skills.enabled 덮어씀).
5. 롤백: 스냅샷 파일(`docker/db-backup/dev-*.sqlite`)을 `/var/www/dbdata/database.sqlite` 로 복원한다(컨테이너 정지 상태에서). 운영 DB 는 이 절차의 대상이 아니다.
6. 운영 적용은 사용자 승인 후 별도로 진행한다. 기존 보유 영웅 코스트·저장 편성 처리와 가챠 확률 변경(현행 S2/A10/B30/C58 → 제안 S3/A17/B40/C40, 10연 A 이상 1회 보장 유지, S 소프트 천장 100회, 픽업 배너)은 정책 결정 후 진행한다.

## 8. 능력치 패치 (1회차 적용 완료)
- 대상 56건 중 이미 값이 같은 wellington·frederick_great 를 제외한 54명에 적용했다(`heroes.json` 53명, 확장 1명, NPC 2명 포함 집계 별도). 개발 DB heroes 56행을 UPDATE 했다.
- 방식: 목표 = 틀 v2 + 영웅 고유 편차. 1회 보너스 증가는 (병종 기본 + 현재 보너스)의 +20%, 성장률은 +0.5%p 로 제한(단계 상한). 초과분은 2회차로 넘긴다.
- `game:hero-audit`(`heroes.json`) 그룹 편차: S -18.6% → -2.8%, A -11.1% → -1.5%. 합계 OK 718 / WARN 57 / FAIL 68.

## 9. 남은 FAIL 68건과 2회차 패치 계획
- FAIL 대부분은 A3(성장률 범위 밖)로, 1회차 단계 상한(+0.5%p)이 원인이다. 2회차 패치(임밸런)에서 해소한다. 예: 공자·키루스 2세·하룬 알라시드 등.
- napoleon A2(Lv1 보너스 편차 +39.6%) FAIL 과 healer 병종 평균 -8.9% WARN 은 임밸런이 별도 조정한다.
- 2회차 패치가 오면 같은 절차(스냅샷 → 복사본 dry-run → 개발 DB UPDATE → hero-audit 재측정)로 적용한다.

## 10. 사람 확인 항목
- 단계 1·2 인원 목표와 10/40/40/10 비율 유지 여부(단계 0 결과가 S 21%).
- 코스트 재설정 정책(보유 영웅 유지 vs 등급 기준 재설정).
- 가챠 확률 변경 시점.
- 병종 분포 archer 16.4% 보정을 위한 병종 변경 후보.
- 신규 S 3명의 gacha 풀 포함 여부(현재 `campaign_only=0`, 가챠 풀 검증 OK 149명).
