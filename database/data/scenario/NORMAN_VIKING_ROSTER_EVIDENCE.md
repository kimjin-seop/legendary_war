# ch23_s1 바이킹·노르망디 연합 이름 있는 장수 10명 근거

작성: 송서사 (2026-11-04). 제안 데이터는 `database/data/viking_roster_proposal.json` 의 viking / norman 배열. 유닛 타입·수치는 임밸런, 초상은 안아트, 시드는 박백엔. 게임 표시 문자열(이름·대사·설명)에는 근거 표기가 없다. 외부 재검증은 하지 않았고 일반 역사 지식 기준이다(원문 대조 필요 항목은 verify).

## 0. 게임 구성 메모
- ch23_s1 은 1066.9.27 솜 강 하구 생발레리 승선 장면이다. 같은 시기 노르웨이 왕 하랄 하르드라다는 9.25 스탬퍼드 브리지에서 전사해 이 장소에 있을 수 없다. 이 스테이지의 '바이킹'은 게임 구성상 노르드 계열 적대 세력으로, 대표 인물 10명은 1066년 잉글랜드 북부 침공 맥락의 노르드 인물을 모은 것이다(각색, 문서에서만 밝힘). 사용자 지시에 따른 구성이며, 불편하면 사건을 ch23 후속 스테이지로 옮기는 안도 가능.
- 대사에서 '약탈 무리 / 약탈 무리 대장'은 s1 한정으로 '바이킹'으로 바꿨다. 변경한 대사는 시오리 목표 줄 1곳(`ch23_s1_pre`).
- 스테이지 JSON 의 `약탈 무리` 표기 목록(임밸런 처리): `stages_ch23_hastings.json` line 17, 82, 604, 631, 639, 666, 674, 701, 717, 754, 791. 모두 ch23_s1 항목이다. 대장 부분(line 82, 604, 717)은 영웅이 아닌 일반 지휘관이라 이름 있는 장수로 교체될 때 함께 정리.
- ch23 다른 스테이지의 '약탈' 표현(건드리지 않음): `ch23_hastings.json` line 353(s8 사절 호송, 피츠오스번 대사 "약탈하려는 소부대") 1건.

## 1. 바이킹(노르드) 10명
| code | 이름 | 근거 수준 | 비고 |
|---|---|---|---|
| npc_harald_hardrada | 하랄 하르드라다 | confirmed | 노르웨이 왕, 1066.9.25 스탬퍼드 브리지에서 전사. 헤이스팅스와 직접 접점 없음 |
| npc_tostig_godwinson | 토스티그 고드윈손 | confirmed | 해럴드 고드윈슨의 동생, 노섬브리아 백작이었다가 추방. 노르웨이 침공에 합류, 스탬퍼드 브리지에서 전사. 앵글로색슨 귀족이라 '바이킹 동맹' 위치 |
| npc_olaf_haraldsson | 올라프 하랄손 | accepted | 하랄의 아들. 스탬퍼드 브리지 후 해럴드와 합의해 철수(후일 올라프 3세 키레). 사료 정보 폭 있음 |
| npc_eystein_orre | 에이스테인 오레 | accepted | 헤임스크링글라에 스탬퍼드 브리지 막판 원군 장수로 등장. 세부(도착 시각, 사망)는 verify |
| npc_paul_thorfinnsson | 파울 토르핀손 | accepted | 오크니 백작, 하랄 곁 참전. 전투 후 철수한 것으로 전함 |
| npc_erlend_thorfinnsson | 에를렌드 토르핀손 | accepted | 파울의 형제, 공동 오크니 백작. 세부 verify |
| npc_ulf_ospaksson | 울프 오스팍손 | accepted | 하랄의 마샬(군마 관리), 헤임스크링글라에 전함 |
| npc_styrkar_marshal | 스튀르카르 | verify | 마샬로 등장하는 인물, 시기·역할은 사료마다 차이 |
| npc_thjodolf_arnorsson | 티오돌프 아르노르손 | accepted | 하랄 곁 스칼드. 1066년 스탬퍼드 브리지 현장 여부 verify |
| npc_hakon_ivarsson | 하콘 이바르손 | verify | 하랄 시대 노르웨이 귀족. 1066 참전은 단정하지 않음 |
- 병종 성향 제안은 json 의 troop_hint. 임밸런이 확정.
- 대사는 노르드 어조(짧고 직설)로 구성할 예정이나 이번에는 이름만 제안.

## 2. 노르망디 연합 10명
스테이지 s1 현재 ally_npcs: `npc_william_i`, `npc_odo_bayeux`, `npc_william_fitzosbern`(+ 수레 npc_cart_1/2). 이 3명은 포함, 7명 추가.
| code | 이름 | 근거 수준 | 비고 |
|---|---|---|---|
| npc_william_i | 노르망디 공 윌리엄 | confirmed | 기존. 주의: heroes.json 코드는 `william_i`, 스테이지·roster 는 `npc_william_i`, 대사는 `hero:william_i`. 코드 정합 확인 필요 |
| npc_odo_bayeux | 오도 | confirmed | 기존(바이외 주교, 윌리엄의 이복형제) |
| npc_william_fitzosbern | 윌리엄 피츠오스번 | confirmed | 기존 |
| npc_robert_mortain | 로베르 드 모르탱 | confirmed | 이복형제, 헤이스팅스 참전 |
| npc_eustace_boulogne | 외스타슈 2세 | accepted | 불로뉴 백작, 헤이스팅스 참전(바이외 태피스트리 등장) |
| npc_roger_montgomery | 로제 드 몽고메리 | accepted | 헤이스팅스 부대장 서술. 요청 목록의 '로제 드 보몽'(Roger de Beaumont)은 헤이스팅스에 직접 참전하지 않고 노르망디에 남았다는 서술이 일반적이라(verify) 몽고메리로 대체. 보몽은 아들 로베르 드 보몽 쪽이 참전 서술이 있다 |
| npc_william_de_warenne | 윌리엄 드 와렌 | accepted | 헤이스팅스 참전 명단에 거론 |
| npc_alan_rufus | 알랭 루프스 | accepted | 브르타뉴 부대 지휘관 서술(또는 알랭 르 루 / 알랭 피르강). 표기 verify |
| npc_walter_giffard | 월터 지파드 | accepted | 노르만 기사 지휘관 서술 |
| npc_geoffrey_coutances | 조프루아 드 몽브레 | accepted | 쿠탕스 주교, 군에 동행 |
- 요청 목록의 기 드 퐁티외(Guy of Ponthieu)는 해럴드를 붙잡았던 영주로, 헤이스팅스 현장 참전 서술이 약해(verify) 후보에서 제외(대체: 월터 지파드).
- 해럴드 쪽 인물(해럴드 고드윈슨, 거스·리오프웨인 형제)은 이 스테이지 진영이 아니어서 제외.
