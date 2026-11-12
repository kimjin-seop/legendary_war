# 장수 설명 공백 목록과 채움 현황 (송서사, 2026-11-04)

원인: 툴팁은 `hero_tips.json`(build_hero_tips.mjs 생성물, 2026-11-02 기준으로 오래됨)을 쓴다. 생성기가 `hero_history_part_npc1.json`과 `npc_roster_shelf_*.json`을 읽지 않고, 서가 NPC는 `title`(직함)만 설명으로 쓴다. 그래서 "생몰년 미상"만 보이거나 한 단어 설명만 나온다.

## 이번에 채운 항목 (shelf_*_npcs.json 에 `life`·`desc` 필드 추가, 9명)
| 코드 | 이름 | 파일 | 생몰 | 근거 수준(문서 전용) |
|---|---|---|---|---|
| npc_lu_su | 노숙 | scenario/shelf_12_npcs.json | 172~217 | confirmed |
| npc_cheng_pu | 정보 | shelf_12_npcs.json | ?~210 | accepted |
| npc_huang_gai | 황개 | shelf_12_npcs.json | 미상 | confirmed(사실), 생몰 미확인 |
| npc_gang_min_cheom | 강민첨 | scenario/shelf_11_npcs.json | 미상 | accepted |
| npc_so_baeap | 소배압 | shelf_11_npcs.json | 미상 | accepted |
| npc_so_sonnyeong | 소손녕 | shelf_11_npcs.json | 미상 | accepted (소항덕과 동일인 verify) |
| npc_dae_dosu | 대도수 | shelf_11_npcs.json | 미상 | verify |
| npc_yu_bang | 유방 | shelf_11_npcs.json | 미상 | verify |
| npc_kim_jong_hyeon | 김종현 | shelf_11_npcs.json | 미상 | verify |

## 아직 비어 있는 항목 (미확인, 지어내지 않음)
- hero_history_part_npc1.json: npc_baidar, npc_kadan, npc_ustad_ali_quli, npc_dawlat_khan_lodi, npc_mahmud_lodi (`"생몰년 미상, ..."` 형태). 생성기가 이 파일을 읽지 않음.
- npc_roster_shelf_ch21_22.json: baidar·kadan·ali quli 의 era 가 `생몰년 미상(verify)`.
- hero_history_part2/3/4.json: eulji_mundeok, artemisia, amanirenas (`life: 생몰년 미상`, 실제로 미상이 맞는 인물).
- npc_kuki_yoshitaka(구키 요시타카, 1542~1600 알려졌으나 이번에 미반영), shelf_map_meta의 설세웅·형원항·위문승(수 장수, 생몰 미확인).
- 이 문서의 생몰 "미상"은 웹 검색(2회)에서 확인되지 못한 것이다. 나무위키 직접 열람은 하지 못했다.

## 적용에 필요한 후속 (코드 변경, 팀장 경유)
1. `build_hero_tips.mjs`가 `sn.life`·`sn.desc`를 우선 사용하도록 수정(서가 NPC 우선), `hero_history_part_npc1.json` 정규식 포함.
2. `node resources/js/game/tools/build_hero_tips.mjs`로 `hero_tips.json` 재생성.
3. 시드: 이 필드들은 표시 전용이라 `--update` 재시드 불필요(npc_roster 필드 아님).
