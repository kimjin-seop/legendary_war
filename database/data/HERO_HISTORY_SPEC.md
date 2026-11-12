# 영웅 역사 설명 데이터 스펙 (hero_history)

작성: 송서사 / 2026-11-01. 신규 파일이며 기존 데이터·앱 코드·DB는 수정하지 않았다.

## 파일 구성
- `hero_history.json`: 매니페스트(색인). 본문 아님.
- `hero_history_part1~4.json`: 본문. 각 파일 `items[]`, 총 101명(26+26+26+23), 키는 `code`(hero_pool100.json과 동일, 중복 없음).
- 병합: part 파일의 `items[]`를 이어 붙여 `code`로 조회한다. NPC 추가 시 같은 스키마로 part5 이후에 추가한다.

## 항목 스키마
| 필드 | 형식 | 규칙 |
|---|---|---|
| code, hero_id, name_ko | string, int(CSV id), string | 키·표시용. hero_id는 heroes_candidates.csv id (DB heroes.id 아님) |
| one_line | string | 40자 내 한 줄 소개 |
| life | string | 생몰·출신·시대 1문장. 이설은 문장에 병기 |
| summary | string | 생애·업적 3~5문장 (약 150~330자). 확립된 사실만 |
| battle_style | string | 전투 스타일·대표 전투 + 게임 병종 연결 1~2문장. 비전투 인물은 그 사실을 먼저 명시 |
| anecdote | object/null | `{text, kind: fact/quote/tradition, is_invented:false, level}`. 확실치 않으면 null. kind=tradition 또는 level=verify는 단정 금지 표기용 |
| relations[] | `{code, type, note}` | code는 풀 내 영웅. type: ally/rival/mentor/kin/lord_vassal/same_event/lineage. hero_relations.json과 용어 동일 |
| tags | string[3] | [시대, 문명/지역, 직업] 순서 고정 |
| evidence | `{level, verify_fields[]}` | level: confirmed/accepted/verify. verify_fields는 "필드: 사유" 문자열 |
| game_note | string | 역사와 게임 설정이 다른 점 1문장 |

## 원칙
- 창작 대사·은유는 넣지 않았다(is_invented는 전부 false, 필드는 향후 창작 문구를 넣을 때 구분용). 병종·오라 설명은 게임 설정이며 역사 주장이 아니다.
- 근거: 이번 작업에서 외부 페이지를 새로 열람하지 않았다. 작성자 지식 + 내부 파일(hero_fact_checks, hero_profiles, hero_unit_basis, hero_titles_v2_proposal). 따라서 전원 사람 확인 후 확정 권장.
- 논란 인물(칭기즈 칸, 조조, 당태종, 측천무후, 노부나가, 히데요시, 나폴레옹, 투생 관련 서술)은 사건 위주 중립 서술, 평가어·학살 서술 없음.
- 프로필 null 8명(곽재우·휴정·유정·지토·시키부·아만니레나스·계백·아르테미시아)은 evidence.level=verify.

## BE 제안 (박백엔)
`GameData::heroDetail()`(app/Services/GameData.php) 응답에 `profile` 키 추가. 이미 FE가 `hh.detail?.profile` 또는 `hh.profile`을 읽는다.
```
profile: {
  era: tags[0], region: tags[1], role: tags[2],       // FE 현행 필드 그대로
  summary: summary,
  evidence_level: confirmed->accepted, accepted->accepted(+needs_verify 판정), verify->verify,
  needs_verify: verify_fields 비어있지 않음,
  // 신규 확장 필드(FE 추가 구현 필요)
  one_line, life, battle_style, anecdote, relations: [{code,name_ko,type,note}], game_note
}
```
- 로딩: part 4개를 code 키로 캐시(GameData의 다른 JSON 로더와 동일 방식). heroes.code로 조회.
- relations[].name_ko는 BE에서 풀 조회로 채운다(code 미존재 시 항목 제외).
- 주의: 현재 FE `lvMap`에 `confirmed` 키가 없어 원문이 그대로 표시된다. BE에서 `accepted`로 매핑하거나 FE에 confirmed 추가.
- 시드 시 DB 컬럼 추가가 필요하면 별도 마이그레이션이 필요(이 작업 범위 밖). JSON 직접 로드를 권장.

## FE 제안 (윤프론) — 영웅 상세 `역사적 설명` 섹션 구성 (Lobby.js heroDetail, 현재 파일 649행 부근)
1. 헤더 한 줄: `one_line` (강조 색), 우측 칩 `근거: …`(기존).
2. 표(kvTable): 시대·지역·역할(tags) + `생애`(life).
3. 요약 박스: `summary` (기존 박스 재사용, 길이 200~330자 → 스크롤 영역 내 wrap).
4. `전투 스타일` 라벨-값 또는 소박스: `battle_style`.
5. `일화` 있을 때만: `anecdote.text` + kind가 tradition이면 `전승` 태그, level=verify이면 `검증 필요` 태그.
6. `인연` 칩 목록: relations를 `name_ko · 관계유형(한글) · note` 형태로 최대 3개, 더 있으면 `외 N명`. 관계 한글: ally 동맹/rival 라이벌/mentor 스승·제자/kin 혈연/lord_vassal 군신/same_event 같은 사건/lineage 계보.
7. 하단 작은 회색 글씨: `game_note`, needs_verify이면 기존 안내문(`※ 일부 내용은 사료 확인이 필요합니다`) 유지.
- 모든 키가 없으면 섹션 숨김(기존 동작 유지).
- 길이: summary가 길어 좁은 화면에서는 `더 보기` 접기 권장.
