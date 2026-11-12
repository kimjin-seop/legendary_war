# 숨은 종장(ch999) 해금

- 구현: `app/Services/HiddenChapterService.php`, 게이트: `BattleService::stageUnlocked`, `GameController::stages()`, 설정: `config/game.php` `hidden_chapter`.
- 해금 조건: 대상 집합의 필수 스테이지가 모두 `clear_count>0`.
  - 대상 챕터 = `database/data/shelf_map_meta.json` 의 `shelves[].status=active` 의 `chapter` + `hidden_chapter.main_chapters`(기본 101~104) - `exclude_shelves`(기본 빈 목록).
  - 필수 = `stages.rules.optional` 이 true 가 아닌 스테이지. 시드 JSON 의 스테이지 최상위 `optional:true` 를 `game:seed-shelf` 가 `rules.optional` 로 저장한다(기존 스테이지는 `--update` 재시드 필요). 메인 4막은 optional 없음.
  - 서가를 meta 에 `active` 로 올리면 자동으로 집합에 포함된다(코드 수정 불필요). 스테이지가 없는 챕터는 요구하지 않는다.
- 유지: 최초 해금 시 `quest_event_log(event=chapter_unlock, ref=ch999)` 1건 기록(DDL 없음). 이후 서가가 늘어도 기록이 있으면 해금 유지.
- 게이트: ch999 스테이지는 미해금이면 `GET /api/stages` 목록에서 빠지고 도전은 403(`stage_locked`). 해금 후에는 선행 스테이지 규칙을 그대로 따른다.
- 종장 영웅은 `campaign_only=1`(보상 전용)로 두어 가챠에서 제외한다. 일반 영웅으로 승격하면 `gacha_pool.json` 의 `exclude_codes` 에 넣는다.
- ch999 실데이터는 아직 없음(테스트는 가짜 서가/스테이지 사용: `tests/Feature/HiddenChapterTest.php`).

## 종장 보상 영웅(바하 앗딘 등) 승격과 가챠 제외 설계 메모
- 현재 가챠 풀 규칙(`GachaService::pool`): `npc_*` 이면서 `campaign_only=0`(승격) 이고 주인공이 아니면 자동 포함. 즉 **승격하는 순간 가챠 풀에 들어간다.** 종장 보상 전용 영웅은 승격(소유/출전 가능)이 필요하지만 뽑기에는 나오면 안 된다.
- 절차: 로스터에 `playable:true` 로 승격하는 같은 변경에서 `database/data/gacha_pool.json` 의 `exclude_codes` 에 해당 코드(예: `npc_baha_ad_din`)를 추가한다. 풀 구성이 바뀌므로 version 은 승격 시 올린다(제외만 추가해 풀이 그대로면 불변).
- (정정 2026-11-09) ch999 클리어 영웅 지급은 없다(영웅은 뽑기로만 획득, join_hero 비활성). 이 절의 승격 절차는 보상 지급과 무관한 참고용이다.
- 호송/장애물 NPC(짐수레·나룻배 등)는 `exclude_patterns`(`npc_cart*`, `npc_boat*`)로 승격돼도 제외된다. 새 패턴은 gacha_pool.json 에 추가.

## 서가별 시드 체크리스트 (준비 중 -> active)
순서: 개발 DB 백업(`VACUUM INTO docker/db-backup-YYYYMMDD/before-chNN.sqlite`) -> 맵 -> 로스터 -> stages -> 대사 동기화 -> meta active. 운영 DB 금지.
1. 필요 파일: `maps_chNN_*.json`(맵), `npc_roster_shelf_chNN*.json`(신규 NPC; `*_stats.json`/`*_additions.json` 은 제안 문서라 무시됨), `stages_chNN_*.json`(좌표 확정: zone_ref/tiles 채움, cues 의 좌표는 rect/tiles), `chNN_*.json`(대사), `shelf_map_meta.json`.
2. 맵 허용 등록(한 번): `GameSeedMapPack::ALLOWED`, `ScaleUpMaps::FILES` 에 파일명 추가(ch12 완료). 명령: `game:seed-maps-pack --path=<파일> --dry-run` -> 검증 에러 0 -> 본 실행.
3. NPC: `game:seed-shelf --chapters=<기존챕터> --with-npc` (--update 없음 = 신규 code 만 추가; 기존 NPC 덮어쓰기 방지).
4. stages: `game:seed-shelf --chapters=NN --dry-run` -> `game:seed-shelf --chapters=NN`(신규 행) / 수정 반영은 `--update`(--with-npc 와 같이 쓰지 않음). 범위 11~99 (ch18 은 `game:seed-ch18`, ch1x 전용 명령 별도).
5. 대사: `node docker/sync_dialogue_data.mjs`(FILES 등록 완료) 후 FE 빌드.
6. 검증: `game:audit-stages`(해당 챕터 항목 0), 해당 챕터 FlowTest(필요 시), 강화면 실화면, 선택 스테이지는 JSON `optional:true`(rules.optional 로 저장되어 숨은 종장 집합에서 제외).
7. 공개: `shelf_map_meta.json` 서가를 `status:"active"` 로 -> `node docker/sync_dialogue_data.mjs`(FE 사본). active 가 되면 숨은 종장(ch999) 해금 집합에 자동 포함되므로, 기존 유저의 해금 상태가 바뀌지 않는지(이미 연 유저는 유지) 확인.

## 응답 계약: GET /api/hidden-chapter (윤프론용)
- 인증 필요(게스트 토큰 포함). 해금 전에도 호출 가능. 읽기 전용이며 부작용은 최초 해금 시 `quest_event_log` 1건 기록뿐.
- 잠김: `{"unlocked":false,"progress":{"cleared":N,"total":M},"chapter":null}` — 이름·위치·스테이지 목록 비노출. `total`=필수 스테이지 수(active 서가+메인 4막, optional 제외), `cleared`=그중 클리어(clear_count>0) 수. 서가가 active 로 추가되면 total 이 늘어난다.
- 해금: `{"unlocked":true,"progress":{...},"chapter":{"chapter":999,"stages":[{"id","code","name","clear_count"}]}}` (stages 는 sort_order 순; 스테이지 데이터가 아직 없으면 빈 배열). 해금 후 progress 는 이전 기록으로 유지(서가 추가로 cleared<total 이어도 unlocked=true).
- `GET /api/stages` 는 미해금 중 ch999 스테이지를 목록에서 제외하고, 해금 후 일반 스테이지처럼 나온다(chapter=999, 선행 규칙 동일). 지도 위치는 `shelf_map_meta` 의 ch999 서가 항목(해금 전에는 FE 가 이 API 가 unlocked=true 일 때만 표시).

## ch999 시드 규칙 (선행 체인)
- 시드: `game:seed-shelf --chapters=999 --dry-run` -> `game:seed-shelf --chapters=999` (`--chapters` 범위 11~999). 입력은 `stages_ch999_*.json`, 코드는 `ch999_s1~s8`, `sort_order = 99900 + N` 규칙을 시드가 강제한다.
- 선행은 스테이지 JSON 의 `prerequisite` 필드로 정한다: `ch999_s1` 은 `null`(선행 없음), `ch999_s2 -> ch999_s1`, `s3 -> s2`, `s4 -> s3` (현재 `stages_ch999_finale.json` 이 이미 이 형태). 같은 챕터 안에서만 허용.
- 선행이 없는 첫 스테이지라도 `BattleService::stageUnlocked` 가 ch999 는 해금 집합 완료 전까지 잠그므로 외부에서 직접 도전할 수 없다.
- (정정 2026-11-09) 보상 영웅 지급 없음. `join_hero` 는 비어 있다.

## 해금 집합 교착 점검 (개발 DB, 2026-11-03)
- 대상 챕터 [101~104, 1, 18, 21, 22, 23, 24] 필수 스테이지 56개. 필수 스테이지의 선행이 optional 인 경우 0건(선행 체인 끊김 없음). 영웅 요구가 있는 필수 스테이지는 ch1_s1·s3·s7·s9 의 `yi_sun_sin` 뿐이며 시작 영웅이라 항상 보유(`game.starter_heroes`).
- 같은 선행을 공유하는 분기(ch18_s3/s4, s6/s7, ch21_s3/s4, s5/s6, ch22_s2/s3, s4/s5)는 모두 한쪽이 `optional` 이라 필수 집합에서는 교착이 없다. 배타 분기(한쪽 클리어 시 다른 쪽 불가)는 엔진에 없다.
- 따라서 추가 optional 지정이 필요한 스테이지는 없다(재시드 불필요). 새 서가를 active 로 올릴 때 같은 점검을 반복할 것.

### 체크리스트 보충: battle_cues
- 대사 JSON 의 `battle_cues.<stage_code>` 는 4단계 `game:seed-shelf` 가 stages 에 병합한다(CUTSCENE_SPEC 13-5). 시드 전 `--dry-run` 으로 "battle_cues 병합 불일치" 가 없는지 확인하고, 있으면 송서사(zone_ref 이름)·맵디자이너(tile_tags) 중 맞는 쪽을 정렬한 뒤 `--update` 로 재시드.
