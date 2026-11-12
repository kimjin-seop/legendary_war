# 적 장수 코드 -> 인물 매핑 (선행 반영본)

작성: 송서사 (2026-11-03). 임밸런 확정 전에 후보 목록(EXPAND_*.md)으로 대사·battle_cues 를 선행 작성했다. 확정 코드가 다르면 대사 파일의 `hero:<코드>` 문자열(speaker_profile 키와 cue speaker)만 교체하면 된다. 대사에는 근거 표기가 없고, 근거 수준은 이 표에만 둔다.
전체 코드는 NPC_NAMES·roster 등록 대상이다(박백엔). 기존 코드는 "기존"으로 표기.

## 적벽 (ch12_redcliff.json)
| 코드 | 인물 | 근거 | 배치(cue 스테이지, 턴) | 비고 |
|---|---|---|---|---|
| npc_cao_ren | 조인 | confirmed | s4(기존 대사) | 기존 |
| npc_xu_huang | 서황 | accepted | s4 t2 등장, t7 퇴각 | 신규 |
| npc_li_tong | 이통 | accepted | s4 t3 | 신규 |
| npc_cai_mao | 채모 | accepted | s2 t1 | 신규, 연의 간계 서술 미사용 |
| npc_zhang_yun | 장윤 | accepted(verify) | s2 t3 | 신규 |
| npc_cheng_yu | 정욱 | accepted | s2 t6 | 신규, 후미 조언 형태 |
| npc_wen_pin | 문빙 | accepted | s6 t1 등장, t6 퇴각 | 신규. 박백엔 보고(ch12_s1 시드의 npc_wen_pin 미존재)와 연결 |
| npc_man_chong | 만총 | accepted | s7 t2, t6 | 신규 |
| npc_yue_jin | 악진 | accepted | s9 t2, t6 | 신규 |
| npc_zhang_liao | 장료 | verify | s10 t2, t6 | 신규, 적벽 정사 참전 기록 없음이라 유수구에만 배치 |

## 황산벌 (ch13_hwangsanbeol.json)
| 코드 | 인물 | 근거 | 배치 | 비고 |
|---|---|---|---|---|
| gyebaek | 계백 | confirmed | s2(기존) | 기존 |
| npc_heungsu | 흥수 | accepted | s1 t2 | 신규 |
| npc_seongchung | 성충 | accepted | s1 t5(회상조 한 줄) | 신규. 656년경 옥중 간언 전승이라 현장 인물이 아님. 장면 이름표 처리 가능 |
| npc_yunchung | 윤충 | accepted(verify) | s1 t3(sword 슬롯), s2 t1(spear 슬롯) | 신규. 슬롯 병종이 s1 sword / s2 spear 라서 대사는 병종 중립 또는 슬롯 병종에 맞춤(s2 "선두 창", s1 "칼 닿는 거리"). 660년 현장 참전 여부 verify |
| npc_chungsang | 충상 | verify | s2 t4 | 신규 |
| npc_sangyeong | 상영 | verify | s2 t5, t7 | 신규 |
| npc_buyeo_yung | 부여융 | accepted | s3 t3, s6 t6 | 신규 |
| npc_ye_sikjin | 예식진 | accepted | s6 t3 | 신규, 평가어 없음 |
| npc_dochim | 도침 | accepted | s7 t2 | 신규 |
| npc_uija | 의자왕 | confirmed | s6 외(기존 장면) | 기존 |

## 가우가멜라 (ch17_gaugamela.json)
| 코드 | 인물 | 근거 | 배치 | 비고 |
|---|---|---|---|---|
| npc_darius_iii / npc_mazaeus | 다리우스 3세 / 마자이오스 | confirmed | 기존 | 기존 |
| npc_bessus | 베소스 | confirmed | s3 t1, t8 / s4 t5 | 신규. 후일 행적 미언급 |
| npc_barsaentes | 바르사엔테스 | accepted | s3 t2 | 신규 |
| npc_satibarzanes | 사티바르자네스 | accepted | s3 t3 | 신규 |
| npc_phrataphernes | 프라타페르네스 | accepted | s3 t2 | 신규 |
| npc_atropates | 아트로파테스 | accepted | s3 t3 | 신규 |
| npc_orontes | 오론테스 | accepted | s3 t4 | 신규 |
| npc_mithraustes | 미트라우스테스 | accepted | s3 t4 | 신규 |
| npc_nabarzanes | 낫바르자네스 | accepted(verify) | s4 t2 | 신규 |
- 개별 인물의 실제 발언은 사료에 없어 대사는 전부 창작.

## 나이만 (resources/js/game/data/dialogue/ch18_mongol.json, 스테이지 ch18_s1)
| 코드 | 인물 | 근거 | 배치 | 비고 |
|---|---|---|---|---|
| npc_tayang_khan | 타양 칸 | confirmed | s1 t1 | 신규. 실제 1204 전투, 스테이지(1206)와 연대 불일치(각색) |
| npc_kuchlug | 쿠츨루크 | confirmed | s1 t1, t8 | 신규. 후일담 미언급 |
| npc_jamukha | 자모카 | confirmed | s1 t2 | 신규. 감정 서술 최소 |
| npc_toqto_a_beki | 토크타 베키 | confirmed | s1 t2 | 신규 |
| npc_buyruq_khan | 부이룩 칸 | confirmed | s1 t3 | 신규 |
| npc_qutuqa_beki | 쿠투카 베키 | accepted | s1 t3 | 신규 |
| npc_kokse_u_sabraq | 케크세우 사브락 | accepted | s1 t4 | 신규 |
| npc_qudu | 쿠두 | accepted | s1 t4 | 신규 |
| npc_dayir_usun | 다이르 우순 | accepted(verify) | s1 t5 | 신규. 표기 verify |
| npc_naiman_remnant_chief | 나이만 계열 잔당 우두머리 | invented | s1 t5 | 기존 스테이지 NPC. 이전 제안 npc_naiman_captain 을 이 코드로 통합(대사·profile 교체 완료) |

## 푸아티에·투르 (ch24_tours.json, s3 / s4)
| 코드 | 인물 | 근거 | 배치 | 비고 |
|---|---|---|---|---|
| npc_abd_al_rahman_ghafiqi | 압드 알라흐만 | confirmed | 기존 | 기존 |
| npc_munuza | 무누자 | accepted | 이름표만(s3 t5 압드 알라흐만 대사 속 언급) | 신규, 직접 발화 없음 |
| npc_anbasa | 안바사 | accepted | 이름표만(같은 대사) | 신규 |
| npc_al_samh | 알삼흐 | accepted | 이름표만(같은 대사) | 신규 |
| npc_berber_cavalry_chief | 베르베르 기병대장 | invented | s3 t1 | 신규 |
| npc_arab_guard_chief | 아랍 근위 기병대장 | invented | s3 t3 | 신규. 스테이지 s3 에만 편성돼 s4 cue 는 제거 |
| npc_zaragoza_detachment | 사라고사 파견대장 | invented | s3 t4 | 신규 |
| npc_umayyad_infantry_chief | 우마이야 기병 대장(표시명 조정) | invented | s4 t2 | 코드는 유지. 슬롯 병종이 cavalry 라서 대사 속 명칭·말투를 기병으로 맞춤. roster name_ko·스테이지 display_name_ko "우마이야 보병 대장" -> "우마이야 기병 대장" 수정 필요(아래 변경 목록) |
| npc_andalus_quartermaster | 안달루스 보급 책임자 | invented | s3 t6 | 스테이지 s3 에만 편성돼 s4 cue 에서 s3 로 이동 |
| npc_berber_cavalry_chief | 베르베르 기병대장 | invented | s3 t1, s4 t6 | s4 에도 편성돼 s4 t6 cue 추가 |
| npc_umayyad_rearguard | 후위 지휘관 | invented | s4 t7 | 신규 |
- 투르·푸아티에는 같은 전투의 두 이름이라 직함형은 두 스테이지에 나눠 두었다.

## 스테이지 JSON·roster 변경 목록 (박백엔/임밸런 전달, 저는 수정하지 않음)
1. `npc_roster_shelf_enemy_final.json` npc_umayyad_infantry_chief: name_ko·short_name "우마이야 보병 대장" -> "우마이야 기병 대장"(또는 임밸런 판단으로 troop_type 을 cavalry 로). 슬롯이 cavalry 이므로 명칭 조정이 기본안.
2. `stages_ch24_tours.json`: s3 스쿼드(약 line 1662)·s4 스쿼드(약 line 2496)의 display_name_ko "우마이야 보병 대장" -> "우마이야 기병 대장".
3. `stages_ch24_tours.json` leader.ref null -> 연결 후보(대사 cue 가 이름표로 부르는 직함형): s3 베르베르 기병대장(line 1423) = npc_berber_cavalry_chief, 안달루스 보급 책임자(1475) = npc_andalus_quartermaster, 아랍 근위 기병대장(1499) = npc_arab_guard_chief, 후위 지휘관(1555) = npc_umayyad_rearguard, 사라고사 파견대장(1638) = npc_zaragoza_detachment, 우마이야 보병 대장(1661) = npc_umayyad_infantry_chief; s4 사라고사(2472)·우마이야(2495)·베르베르(2518)·후위(2627) 동일 코드.
4. `stages_ch18_mongol.json` ch18_s4: 쿠출루크(line 1342, 1389, 1519 부근) leader.ref 를 npc_kuchlug 로 연결하고 표기를 "쿠츨루크"로 통일(ch18_s1 의 line 184 는 이미 npc_kuchlug). 대사 파일 표기는 이번에 "쿠츨루크"로 통일 완료.
5. ch18_s1 잔당 우두머리: 대사는 npc_naiman_remnant_chief 로 통일 완료. 추가 변경 없음.
6. 위 ch24 cue 배치는 스테이지 JSON 의 실제 편성(s3: 베르베르·보급·근위·후위·사라고사·보병, s4: 사라고사·보병·베르베르·후위)에 맞춰 조정했다.

## 교체 방법
1. 확정 코드가 다르면 해당 파일에서 `hero:<제안코드>` 를 확정 코드로 일괄 치환(speaker_profile 키 포함).
2. 인물 병종·말투는 speaker_profile.note 참고.
3. 임밸런이 인원을 줄이면 해당 cue 한 줄만 삭제하면 된다(다른 cue 와 의존 없음).
