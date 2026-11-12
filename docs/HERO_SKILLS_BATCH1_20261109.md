# 영웅 스킬 batch1 설계 근거 (임밸런, 2026-11-09)

데이터: `database/data/hero_skills_batch1_20261109.json` (hero_skill_redistribution.json 과 같은 스키마의 병합용 조각). 시드 미적용, stages*.json/DB 미변경. 수치는 전부 시작값(미측정, needs tuning).

## 1. 범위 (사실: DB 읽기 조회 + 데이터 파일)
- 수집형(campaign_only=0) 중 활성 액티브 연결이 없는 영웅 306명(NPC 승격으로 풀이 465명으로 커짐; 재고조사 문서의 202명보다 큼). 이 중 P1(25행)과 겹치지 않는 우선 대상 48명을 batch1으로 선정.
  - A급 5명(스킬 전무): npc_ukita_hideie, npc_i_yeoseong, npc_abd_al_rahman_ghafiqi, npc_yelu_longxu, npc_mark_antony -> 2P+2A 신규 (패시브 10 + 액티브 10).
  - B급 43명(패시브만 있고 병종 기본 액티브에 의존, redistribution에 포함): 고유 액티브 1개씩 신규 43. 패시브는 현행 항목을 keep으로 복사.
- 합계 영웅 48, 신규 스킬 63(패시브 10, 액티브 53). 이후 배치 후보(미착수): B/C 중 redistribution 밖 약 250명(패시브도 없는 B 약 116, C 약 135), S/A 외 보강.

## 2. 설계 원칙
- 영웅 HP 고정이라 개성은 공격/방어 성향으로 분화: 공격형(ATK_UP/CHARGE/FIRST_STRIKE 패시브) -> STRIKE 125~130 또는 SURGE, 지원형 -> BUFF atk 10, 수비형 -> BUFF def 15~20, 광역형 -> AOE 90~95 / splash 50~60.
- 병종 기본 액티브(sword STRIKE115, spear BUFF def r2, cavalry SURGE, archer/mage AOE, gunner STRIKE120, healer HEAL)와 템플릿 또는 효과 종류가 다르게 배정: 기병 B 11명은 STRIKE 6/BUFF atk 3/AOE 2(SURGE 기본과 분리), 창 12명은 STRIKE 6/AOE 3/atk BUFF 2/SURGE 1, 검 14명은 BUFF 6/STRIKE 3/SURGE 3/AOE 2, 총병 4명은 AOE 2/BUFF 2(기본 STRIKE와 분리).
- 예외(겹침): sword STRIKE 130 3명(black_prince, saigo_takamori, gyebaek)은 기본 115보다 15% 센 "공격 특화"라 템플릿은 같고 수치만 다름. 힐러 2명은 HEAL 유지(치유사에게서 치유를 빼면 역할 상실)하되 파라미터 분화(christine 12/25% 사거리3, seondeok 16/18% 사거리2).
- 등급 상한(game:audit-skills sOnlyReason) 준수: B/A는 BUFF 반경 <=1, HEAL 반경 0, PIERCE/STANCE/DECOY/지형/MATCHUP_NEGATE 미사용. B STRIKE<=130, AOE<=95/60, BUFF atk 10/def 15~20, A BUFF atk 11. 평준화 금지 원칙에 따라 같은 B 안에서도 STRIKE 120~130, AOE 90~95로 격차를 둠.
- 엔진 사실: 고유 액티브가 있으면 병종 기본 액티브 주입이 일어나지 않는다. 즉 batch1 B 43명은 기본 액티브를 잃고 고유로 대체된다(창병이 광역 방어 버프를 잃고 공격 액티브를 얻는 것 등이 역할 변화).

## 3. 검증 (읽기 확인)
- `ActiveParams::violations()` 로 전 액티브 53개 검사, `PassiveEffects::SUPPORTED_TEMPLATES` 로 패시브 10개 검사, 기존 new_skills 코드와 중복 검사, 영웅별 슬롯 수 = target 검사: 결과 `RESULT_BATCH1 skills=63 bad=0` (컨테이너 tinker, DB 쓰기 없음).
- 미실행: `game:seed-skill-grades --dry-run`/`game:audit-skills`는 병합 파일을 읽으므로 병합 후 박백엔이 실행(원본 redistribution 미수정). 시뮬레이션 미실행(측정 없음).

## 4. 적용 절차 (박백엔, 개발 DB만)
1. 스냅샷 -> hero_skill_redistribution.json 백업 -> 병합 스크립트(P1 문서 3절과 동일)로 heroes/new_skills 병합(B 43명 기존 항목은 batch1 항목으로 덮어쓰기).
2. `game:seed-skill-grades --dry-run` -> 실적용 -> `game:audit-skills`.
3. 이름/설명: provisional_name=true 전량. 송서사 확정 후 재시드. flavor는 사실 주장을 피한 일반 문구지만 영웅별 서사 검수 필요.
4. 이펙트: 신규 코드는 skillFxMap 재생성 필요(기존 7계열 재사용이면 매핑만).

## 5. 시뮬 계획 (적용 후, 임밸런)
- 계열별(STRIKE/AOE/BUFF/SURGE/HEAL) 대표 샘플 각 300전 이상 x 양측 교대, 동일 시드 전후 비교. 확인: 승률 편차, 선공 편향, 턴리밋률, 첫턴 처치율, 기본 액티브 대체로 인한 창병/총병 승률 변화.
- 가설(미측정): 창병 B가 방어 버프를 잃어 수비 상성 우위가 줄 수 있음 -> 문제 시 spear 3명을 def BUFF r1 20으로 환원.

## 6. 엔진에 없는 효과 요청
- 이번 batch1은 없음(기존 템플릿만 사용).
- 후속 배치에서 필요할 수 있는 목록(미구현): T_ACTIVE_DECOY(공성계, 송서사 근거 대기), T_RANGE_UP, T_MORALE_RESIST 패시브, 상태이상(빙결/도발 등), 사거리 연장 액티브, 반격 전용 액티브.

## 7. 사람이 확인할 것
- 이름/flavor 톤, 영웅별 병종·성향 정합(병종과 스킬 성격이 어긋나지 않는지), 창병 B의 기본 방어 버프 상실 체감, 기병 STRIKE 6명 쏠림 체감.

## 8. 이펙트 매핑 요청 (윤프론용, 박백엔 작성 2026-11-09)

신규 액티브 53개(패시브 11개는 연출 없음). skillFxMap 재생성은 필수 아님: 미등록 코드는 skillFxResolve.js 폴백으로 계열 기본값(strike.base, aoe.base, surge.base, buff.atk/def, heal)이 표시된다. 연출을 맞추려면 SKILL_FX_BY_CODE 에 아래를 추가(기존 7계열 variant 재사용, 신규 시트 불필요). 규칙: STRIKE power 130 이상 -> strike.charge, 그 외 strike.base / AOE -> aoe.shot / SURGE -> surge.base / BUFF atk -> buff.rally / BUFF def -> buff.def / HEAL(radius 0) -> heal.single.

| variant | 스킬 코드 |
|---|---|
| strike.charge (10) | b1_lakshmibai_a1, b1_jalal_ad_din_a1, b1_trung_trac_a1, b1_william_wallace_a1, b1_rana_pratap_a1, b1_black_prince_a1, b1_saigo_takamori_a1, b1_gyebaek_a1, b1_abd_al_rahman_ghafiqi_a2, b1_mark_antony_a1 |
| strike.base (10) | b1_el_cid_a1, b1_sakamoto_ryoma_a1, b1_prithviraj_iii_a1, b1_tariq_ibn_ziyad_a1, b1_yujeong_a1, b1_honda_tadakatsu_a1, b1_rajaraja_i_a1, b1_anawrahta_a1, b1_ukita_hideie_a2, b1_yelu_longxu_a2 |
| aoe.shot (11) | b1_date_masamune_a1, b1_attila_a1, b1_gustavus_adolphus_a1, b1_suleiman_i_a1, b1_alexander_nevsky_a1, b1_darius_i_a1, b1_boudicca_a1, b1_william_i_a1, b1_tipu_sultan_a1, b1_i_yeoseong_a1, b1_mark_antony_a2 |
| buff.rally (11) | b1_alp_arslan_a1, b1_hayam_wuruk_a1, b1_zenobia_a1, b1_frederick_great_a1, b1_wang_geon_a1, b1_vercingetorix_a1, b1_peter_great_a1, b1_liu_bei_a1, b1_wat_tyler_a1, b1_i_yeoseong_a2, b1_yelu_longxu_a1 |
| buff.def (5) | b1_kim_si_min_a1, b1_charles_martel_a1, b1_jayavarman_vii_a1, b1_shah_jahan_a1, b1_ukita_hideie_a1 |
| heal.single (2) | b1_christine_de_pizan_a1, b1_seondeok_a1 |
| surge.base (4) | b1_spartacus_a1, b1_minamoto_yoritomo_a1, b1_theseus_a1, b1_abd_al_rahman_ghafiqi_a1 |

갱신(2026-11-09): b1_sakamoto_ryoma_a1 은 SURGE 에서 STRIKE 125(cd3, uses2, 이름 "해원대의 일격")로 교체했다. 연출 매핑은 strike.base.

## 9. 병합 적용 결과 (박백엔, 2026-11-09, 개발 DB)

- hero_skill_redistribution.json 에 batch1 영웅 48명(기존 43명 덮어쓰기, 신규 5명)·신규 스킬 63개 병합 + gunner3 제안 중 date dm_charge_mid -> dm_fs_mid(T_FIRST_STRIKE mid 공+14%, 이름 "첫 사격", provisional_name=true라 송서사 검수 전까지 flavor 숨김) 교체, 사카모토·다테·레오나르도 unit_type=gunner 갱신. 레오나르도 a2 이름 변경은 보류(미적용).
- 적용: game:seed-skill-grades 영웅 182명 / skills 신규 64 / hero_skills 신규 64·해제 1(dm_charge_mid). game:audit-skills 위반 2건(선재 protagonist heavy T_DEF_UP 중복)만 남음, 경고 목록은 적용 전과 동일.
- 사카모토 료마: batch1 이 배정한 b1_sakamoto_ryoma_a1 은 SURGE 라 총병(이동 후 사용 불가, gunner3 제안 근거)에게 죽은 스킬. 조치 완료(2026-11-09): STRIKE 125 로 교체.
- 스냅샷/백업: docker/db-backup-20261108/skills-batch1/.
