# 적 장수 10명 확장: 후보 목록 (임밸런 협의용)

작성: 송서사 (2026-11-03). 임밸런이 확정하는 순서대로 해당 서가 대사·battle_cues 에 반영한다(등장·퇴각·조우 대사). 근거 표기는 이 문서에만 둔다. 대사에는 사실/각색 표기 없음.
- 적벽(조조군 10명): `EXPAND_ch11_ch12_ch14.md` 3-B 절.
- 가우가멜라(페르시아 10명): `EXPAND_ch15_ch17.md` 2-B 절.
- 아래: 황산벌(백제), 나이만, 투르, 푸아티에.
- 모두 heroes.json/npc_roster 에 아직 없는 코드는 "신규"로 취급. 코드는 제안값.

## A. 황산벌(ch13) 백제 장수 후보 10명
기존 신규(ch13 s4~s10): 흑치상지, 지수신, 복신, 부여풍, 의자왕(npc_uija 기존), 왜 수군 지휘관. 아래는 거기에 겹치지 않게 추가하는 후보.
| 후보 | 코드 제안 | 병종 | 배치 제안 | 근거 수준 | 비고 |
|---|---|---|---|---|---|
| 계백 | gyebaek (hero 기존) | sword | s2 | confirmed | 황산벌. 가족 서술은 장면에서 다루지 않음 |
| 성충 | npc_seongchung | sword | s1 회상 한 줄 | accepted | 좌평. 옥중 간언으로 전함. 장면 최소(탄현 방어 진언 언급 정도) |
| 흥수 | npc_heungsu | sword | s1 | accepted | 좌평. 유배 중 탄현·백강 방어를 진언한 서술(삼국사기) |
| 충상 | npc_chungsang | sword | s2 | verify | 달솔. 황산벌 후 신라에 항복한 장수들 중 거명(자료 간 이름 표기 차이) |
| 상영 | npc_sangyeong | spear | s2 | verify | 달솔. 위와 같은 계열 |
| 부여융 | npc_buyeo_yung | sword | s3, s6 | accepted | 태자. 웅진성 항복 장면 동행 |
| 예식진 | npc_ye_sikjin | spear | s6 | accepted | 웅진 방령. 의자왕을 당에 넘긴 것으로 전함(묘지명). 평가어 금지 |
| 도침 | npc_dochim | sword | s7~s9 | accepted | 부흥군 지도자(승려). 복신과 병립 |
| 윤충 | npc_yunchung | cavalry | s1~s2 | accepted | 642 대야성 공격을 지휘한 장수. 학살 서술은 다루지 않고 김춘추와의 대비 한 줄 이하 |
| 달솔 사택(가칭 제외) | - | - | - | - | 확정된 이름이 없는 자리는 직함형 "백제 달솔"로 둔다(invented) |
- 병종: 검 6, 창 2, 기병 1. 결사대 5천 중심이라 s2는 계백 단독 지휘 + 충상·상영은 3전 중 후반 증원 후보.
- 제외 검토: 사택적덕, 사택천복 등 이름만 전하는 인물은 대사 없이 이름표만.

## B. 나이만 잔당 스테이지 후보 10명
- 위치 확인: "나이만 잔당" 스테이지는 `stages_ch18_mongol.json`(ch18, 1206 쿠릴타이 전 각색 전투)에 있다. 팀장 메시지는 ch21 로 적혀 있어 확인 요청. ch21(레그니차) 파일에는 나이만이 없다. ch18 대사 파일은 현재 별도 JSON 이 없으므로 반영처는 임밸런 확정 후 협의.
- 사료 기준 = 몽골비사, 집사(Jami al-tawarikh). 1204 타양 칸 전투에서 몽골 측에 맞선 나이만 연합 인물.
| 후보 | 코드 제안 | 병종 | 근거 수준 | 비고 |
|---|---|---|---|---|
| 타양 칸 | npc_tayang_khan | cavalry | confirmed | 나이만 군주. 1204 칭기즈 칸과 전투 |
| 쿠츨루크 | npc_kuchlug | cavalry | confirmed | 타양의 아들, 후일 서요 찬탈. 본편 후일담 비노출 |
| 자모카 | npc_jamukha | cavalry | confirmed | 칭기즈 칸의 안다였다 갈라선 인물. 1204 나이만 쪽 연합. 감정 서술 최소 |
| 토크타 베키 | npc_toqto_a_beki | cavalry | confirmed | 메르키트 수장. 나이만 연합 |
| 쿠투카 베키 | npc_qutuqa_beki | spear | accepted | 오이라트 수장. 나이만 연합 |
| 케크세우 사브락 | npc_kokse_u_sabraq | spear | accepted | 나이만 장수(몽골비사) |
| 부이룩 칸 | npc_buyruq_khan | cavalry | confirmed | 타양의 동생, 나이만의 다른 계열 |
| 쿠두 | npc_qudu | cavalry | accepted | 토크타 베키의 아들(메르키트) |
| 다이르 우순 | npc_dayir_usun | spear | accepted(verify) | 메르키트 수장 계열. 이름 표기 verify |
| 나이만 부장(직함형) | npc_naiman_captain | spear | invented | 기존 stage 의 `npc_naiman_remnant_chief`(각색) 와 중복 정리 필요 |
- 기존 stage 의 `npc_naiman_remnant_chief`(나이만 계열 잔당 우두머리, 각색)와 위 후보의 관계는 임밸런 정리 필요(실명 후보를 쓸지, 각색 우두머리를 유지할지).
- 1206 쿠릴타이 전 습격이라는 설정 자체가 각색이므로, 실명 인물을 사용할 경우 "잔당 소속 장수"로 두고 사건 연도는 caption 에서 흐리게 처리한다(대사에 각색 표기 금지, 문서에서만).

## C. 투르(ch24 s4) / 푸아티에(ch24 s3) 우마이야 측 장수 후보 각 10명
- 사료 한계: 732년 투르(푸아티에) 전투에서 우마이야 측 개별 지휘관 이름은 거의 전해지지 않는다(754년 연대기, 아랍 사료 단편). 같은 전투의 두 이름이므로 두 스테이지에 10명씩 배치하려면 일부 인물은 직함형(invented)이 되며, 문서에서만 표기한다.
| 후보 | 코드 제안 | 병종 | 근거 수준 | 비고 |
|---|---|---|---|---|
| 압드 알라흐만 알가피키 | npc_abd_al_rahman_ghafiqi (기존) | cavalry | confirmed | 총독, 전투 중 전사 서술(ch24 s4) |
| 우스만 이븐 나이사(무누자) | npc_munuza | cavalry | accepted | 베르베르 지방관. 외드와 연합했다가 압드 알라흐만에게 진압된 것으로 전함(731). 회상/언급만 |
| 안바사 이븐 수하임 | npc_anbasa | cavalry | accepted | 725~726 갈리아 원정을 이끈 총독. 회상/언급만 |
| 알삼흐 이븐 말리크 | npc_al_samh | cavalry | accepted | 719~721 총독, 툴루즈 포위 중 전사. 회상/언급만 |
| 베르베르 기병대장 | npc_berber_cavalry_chief | cavalry | invented | 직함형 |
| 아랍 근위 기병대장 | npc_arab_guard_chief | cavalry | invented | 직함형 |
| 안달루스 보급 책임자 | npc_andalus_quartermaster | sword | invented | 약탈 물자·수레 관리자. 야영지 서사와 연결 |
| 사라고사 파견대장 | npc_zaragoza_detachment | spear | invented | 직함형 |
| 보병 대장 | npc_umayyad_infantry_chief | spear | invented | 직함형 |
| 후위 지휘관 | npc_umayyad_rearguard | cavalry | invented | 다음 날 아침 철수 장면 |
- 제안: 푸아티에(s3)에는 압드 알라흐만 + 회상 인물(무누자, 안바사, 알삼흐)을 이름표로, 직함형 3명을 전장에 배치. 투르(s4)에는 직함형 4명 + 압드 알라흐만 본진. 실존 이름 4명은 전장 출전자가 아닌 "이름표 NPC"(대사 속 언급)를 권장한다.
- 대사에는 근거 표기를 쓰지 않는다. 직함형 인물의 이름은 대사에서 직함으로만 부른다.

## D. 반영 순서와 방법
1. 임밸런 확정 목록 수령 -> 서가별 `speaker_profile` 추가, 조우 대사(등장 1줄 + 퇴각/격파 1줄)를 기존 `battle_cues` 의 해당 스테이지 배열에 추가(후미에 append).
2. 대사 톤은 병종·진영별로 차이를 둔다(기병=단문 명령조, 창=직설, 검=상황 판단, 수군=용어).
3. 적 장수의 "퇴각/격파 대사"는 혐오·잔혹 표현 없이 한 줄.
4. 확정 순서: 적벽(조조) -> 황산벌(백제) -> 가우가멜라(페르시아) -> 나이만 -> 투르·푸아티에.
