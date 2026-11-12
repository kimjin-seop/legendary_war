# 적 강도·병종 다양화 조정 (2026-11-07, 임밸런)

모든 수치는 시작값(needs tuning)이며 사람 플레이 확인 전입니다.

## 측정 조건
- `GAME_MICRO_MODE=off php artisan game:simulate --sections=level --stage=<code> --levels=48 --companions` (+0 = 영웅 Lv=권장 Lv). 단일 영웅(지휘관1+부대3) 기본, 파티 3은 `--party=3`.
- 현행 코드(적 스킬·봇 AI 켜짐) 기준. 적 스킬 on/off 차이는 대부분 CI 안쪽.
- 서빙 컨테이너 환경변수는 `GAME_MICRO_MODE=on`(docker-compose.yml). 일부 5개 스테이지 on 재측정은 off와 유사(표본 32판).
- 도구가 아군 손실률을 출력하지 않아 손실률은 미측정.

## 진단 요약
- 단일 영웅 시뮬레이션에서는 "전반적으로 약함"이 아님. 60% 초과: ch101_s1/s3, ch103_s5, ch104_s2, ch22_s5, ch17_s6(, ch1_s5 67).
- 파티 3으로 재면 승률이 크게 상승(ch101_s3 79->100, ch103_s3 33->81 등). 체감 약함의 큰 후보.
- ch1 패치(11/6)가 적을 과약화했다는 증거 없음. ch1_s4/s8/s10은 오히려 매우 어려움.
- 적 병종은 sword/spear/archer 위주, healer/flyer/gunner/assassin 0, mage 2개 스테이지, cavalry 소수.

## 적용 내역 (파일 + 개발 DB `game:seed-main --act=1..4 --update`)
| 스테이지 | 변경 키 | 단일 전 -> 후(seed1/2/3) | 파티3 후 |
|---|---|---|---|
| ch101_s1 | squads에 bow(궁수) 추가 | 83 -> 48/46/48 | 92 |
| ch101_s3 | guard 보병->궁수, mage 추가, enemy_level 2->3 | 79 -> 48/54/56 | 94 |
| ch101_s5 | sword sub -> 궁수 | 25 -> 23/25/23 | 71 |
| ch102_s3 | bow 궁수->치유사, enemy_level 8->6 | 0 -> 27/23/19 | 54 |
| ch102_s5 | rear1 창->치유사, rear2 창->기병, enemy_level 4->3 | 23 -> 31/21/19 | 96 |
| ch103_s1 | 지휘관 hp_mult 1.5->1.0, spear hp_mult 1.3->1.0, enemy_level 10->6 | 0 -> 35/35/31 | 85 |
| ch103_s5 | hl(치유사)·cv(기병) 추가, enemy_level 11->13, objective.hold_turns 0->2 | 100 -> 94/94/88 | 79 |
| ch104_s2 | mg(마법사1)·cv(기병2)·gn(총병2)·hl(치유사) 추가, enemy_level 12->16 | 100 -> 56/65/65 | 81 |

수정 파일: `database/data/stages_main_a1.json`, `stages_main_a2.json`, `stages_main_a3.json`, `stages_main_a4.json`.
시드 후 DB를 백업과 비교해 의도한 컬럼(enemy_level/enemy_squad/objective)만 변경됨을 확인.

## 백업
- `docker/db-backup-20261107/balance-1107/*.orig` (stages_main_a1~a4, stages_ch17_gaugamela_ext2, stages_ch22_panipat, stages_ch1_enemy_v3, stage_companions)
- `docker/db-backup-20261107/balance-1107/dev-before-balance.sqlite` (VACUUM INTO 스냅샷)
- 롤백: .orig 복원 후 `game:seed-main --act=N --update`, 또는 스냅샷 복원.

## 미적용 / 남은 위험
- ch103_s5: 원래 점령 목표를 1턴에 달성(평균 1.00턴). hold_turns 2로도 단일 영웅 88~94%. 점령 지점 위치(맵) 문제 -> 맵디자이너 검토 필요.
- ch102_s2, ch1_s9(해전): 시뮬레이터가 수군 배치를 재현 못하는 것으로 의심(적 1척이어도 6~8%). 이 하네스로 튜닝 불가.
- ch1_s8/s10: seed-imjin10 재시드가 im_06 맵 meta를 되돌리는 부작용이 있어 미적용. 후보: ch1_s8 부대 C,D,E 삭제 + offset -3 (단일 21%, 파티3 23%, 추가 조정 필요), ch1_s10 offset -3(단일 4%/파티3 63%), -6(단일 15%).
- ch17_s6: 파일이 B1 미션전환 작업 중이라 미수정. 후보 offset -9->-3 (측정 73%).
- ch22_s5: offset으로 안 움직임(-3에서 98%). 증원 트리거/편성 확대 필요.
- ch12 계열은 지시대로 미수정.
- 마법사 부대 추가는 승률을 크게 떨어뜨림(ch103_s5 100->12). 한 부대씩 신중히.
- 새 병종(치유사·마법사·총병·기병) 스프라이트가 문화권 null("공백병")에서 어떻게 보이는지 미확인.
- 표본 48판, CI 약 +-14%p. 단일 영웅과 파티 3의 격차가 커서 두 기준을 동시에 맞추지 못함.

## 요청
- 맵디자이너: ch103_s5 점령 지점 위치.
- 박백엔: 수군 시뮬레이션 재현 점검, seed-imjin10 im_06 meta 보호, 손실률 출력.
