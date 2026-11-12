# ch25 대사 본문 검수 노트 (내부용, 대사·화면에는 표기하지 않음)

- 작성: 송서사, 2026-11-07. 대상: database/data/ch25_bachdang.json
- 근거 수준 표기는 이 문서에만 둔다. 출처: 아웃라인 1절 사료 대조표(대월사기전서, 원사 안남전, 안남지략, 현대 개설).

## 1. 장면별 사실/창작 구분

| 장면 | 사실로 쓴 것 | 근거 수준 | 창작·각색한 것 |
|---|---|---|---|
| ch25_open | 1284 말 원의 참파 원정 명목 통과 요구, 거절 | accepted | 서신 낭독 문장, 사신 도착 장면, 주인공과 흥다오 대화(invented) |
| s1 | 1285 정월 국경 방어 후 후퇴, 청야로 곡식 치움 | confirmed(큰 줄기) | 7턴 지연, 응우라오·척후장 대사(invented). 응우라오 참전은 accepted |
| s2 | 함뜨에서 녓주엇 등이 원군 격파, 오마르 수군 | accepted / 오마르 confirmed | 코아이 역할, 모래톱, 과거 사신 질문(invented) |
| s3 | 쯔엉즈엉 전투, 꾸옥 또안 사병 참전 | accepted / verify | 꽝카이와 또안 대화, 목책 구조(invented). 소게투 부대 존재는 대사에서 '깃발이라고 하는 자도 있다'로 완충 |
| s4 | 탕롱 탈환(1285 6월), 곡식은 이미 치워짐 | confirmed | 3거점·불·수로 우회, 수비대장(invented) |
| s5 | 철수하는 원군 후위 공격, 리항 독화살 부상 | accepted | 토간 후퇴 대사, 협곡 안개(invented). 리항 대사는 부상까지만, 사망 서술 없음 |
| s6 | 쩐 익딱의 원 투항 | confirmed | 군막 서류와 인장은 invented(드라마 장치). 비난 톤 없이 '뜻은 모른다'로 처리 |
| s7 | 1288 정월 번돈 군량선단 타격, 장원호 피해 후 퇴각, 칸즈 직위 복귀 | confirmed / accepted | 세 척 점화, 바람 지시, 대사 전반(invented) |
| s8 | 1288 3월 토간 철수, 곡식 부족 | confirmed | 몽골 포로 길 안내, 응우라오 측면 타격(invented) |
| s9 | 바익당 말뚝 매복 준비, 판제 수군 부장 | accepted | 옛끼에우·자뜨엉(verify 인물을 이름표로), 간조 3구역 작업(invented) |
| s10 | 만조 유인, 간조 좌초, 오마르 생포, 판제 투신 | confirmed(생포) / accepted(판제) | 한 시진 반복 대사, 흥다오와 오마르 대화(invented). 오마르의 이후 운명은 서술하지 않음 |
| ch25_end | 입성한 임금과 상황, 쿠빌라이의 재원정 준비 | accepted | 녓똥·흥다오 대사, 쿠빌라이 서신 한 줄(invented). 재원정 포기 여부는 미언급 |

## 2. 사람 검수 필요 항목

1. 소게투가 쯔엉즈엉 목책에 있었는지(전사 장소 verify). 대사는 존재를 단정하지 않고, s3 cue 의 소게투 발화는 stages 가 npc_sogetu 를 지휘관으로 배정했기 때문에 남김. 익명 부장으로 교체 시 cue 화자만 수정.
2. 함뜨와 쯔엉즈엉의 선후와 지휘관(1.3-1). 현재는 함뜨 -> 쯔엉즈엉 -> 탕롱 순으로 서술.
3. 쩐 익딱 인장 문서는 창작 장치. 실제 사료에는 이런 문서 발견이 없음(확인 필요). 불편하면 '투항 부대의 명부'로 바꿀 수 있음.
4. 옛끼에우·자뜨엉은 후대 전승 비중이 큼. 이름표 가신으로만 사용, 사료 인물처럼 서술하지 않음.
5. 판제 투신 연출: 사료상 강에 뛰어들어 사망(accepted). 장면은 대사 한 줄만, 묘사 없음.
6. 오마르 최후는 전승(송환 중 침몰)이라 서술하지 않음. 'ch25_s10_post'는 '그대의 처분은 임금께서 정하신다'까지만.
7. 쩐 꾸옥 또안: 사망 시점·깃발 문구 verify. 사망 연출과 깃발 문구 모두 쓰지 않음(깃발은 '있었습니다'만).
8. 쿠빌라이 대사(서신 낭독 2건)는 창작. kublai_khan 영웅 DB 적재 여부는 박백엔 확인.
9. 쩐 녓똥이 3차 때 탕롱 입성한 시점과 상황(타인똥)이 동행했는지는 verify. 엔딩은 캡션에서 두 사람을 함께 두었음(타인똥은 발화 없음).
10. 한국어 표기(쩐 칸즈, 팜 응우라오 등)는 로스터 표기를 따랐으며 최종 표기 확정 필요.
11. 날짜: s10 '4월 9일'은 stages year_label 을 따랐으며 음력/양력 확인 필요.

## 3. stages_ch25_bachdang.json 에 필요한 변경 제안 (stages 는 수정하지 않음)

1. 목표 문구와 objective.type 불일치(UI 목표 문구가 type 에서 파생되면 오해 소지):
   - s2: objective.type=defeat_commander, 실제 승리 조건은 win_mode only(주인공이 far_ferry 도달). 대사 목표 안내는 '도달'로 작성.
   - s7: type=defeat_commander, 실제는 flag 3개(boat_1~3). 안내는 '군량선 세 척에 불을 붙인다'.
   - s8: type=defeat_commander, 실제는 waterway_mouth 도달. 안내는 '수로 입구에 닿는다'.
   - s9: type=defeat_commander, 실제는 stake_w/m/e 3 flag(win_mode all). 안내는 '말뚝 작업 세 곳'.
   - s10: type=defeat_commander, win_conditions 는 ebb_began + 흥다오 생존이며 오마르 격파는 type 으로 처리. 안내는 '간조까지 흥다오를 지키며 오마르 기함을 쓰러뜨린다'.
   - 위 5건은 objective.type 을 reach/flag 계열로 바꾸거나 UI 가 win_conditions.label 을 쓰도록 하는 것이 일치에 가장 안전.
2. s1: 아웃라인은 '흥다오 격파 또는 남쪽 입구 구역 넘음'. stages lose 는 south_exit/withdraw_road 구역. 안내 문구 일치함.
3. s9 요청 ch25_s9_e1_ebb_warn 의 화자가 hero:tran_hung_dao 였으나 s9 필드에 흥다오가 없음. 칸즈가 전갈을 전하는 형식으로 화자를 hero:npc_tran_khanh_du 로 바꿈. 요청 id 는 그대로.
4. s10 추가 cue 요청 1건: ch25_s10_e5_fanyi (turn 6, hp_pct_lte omar 40, 판제 대사 1줄). stages 의 retreat reason death(판제) 와 같은 조건이라 발화 후 투신으로 이어짐. 순서는 판제 -> 오마르.
5. s7 장원호 retreat cue 가 rules 에 없음. 대사는 후퇴 여부와 무관하게 성립하도록 작성.
6. s8: ally_npcs 비어 있고 응우라오가 turn5 에 합류. 전투 전 대사는 응우라오가 브리핑하는 형태로 작성. 후 대사(s8_post)의 흥다오는 필드 밖 인물(전투 후 장면 허용 가정).
7. 요청 id 를 cue_id 키로 넣었음. 시드가 알 수 없는 키를 거부하면 박백엔이 제거 필요.
8. narrator 화자 cue 2건(ch25_s7_convoy, ch25_s8_e1_guide)은 FE CuePlayer 가 caption 으로 처리하는지 확인.

## 4. 연출 요청 (미구현, 제안만)

- s10 간조 후: 오마르 기함 좌초 컷(카메라 이동). CUTSCENE_SPEC 지원 범위 내이면 camera cue 로 대체 가능.
- ch25_open, ch25_end: 쿠빌라이 서신 컷인 초상 표시(kublai_khan.png).
