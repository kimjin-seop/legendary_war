# 전투 맵 확장 계획 (맵디자이너, 2026-11-03)

사용자 요청: "맵이 너무 작은데 지금보다 3~4배(면적) 확장, 부대도 훨씬 많이. 초반 스테이지는 3~4부대로 가볍게, 후반은 20부대. 맵 확장은 내가 어제 말한 맵 제작 규칙을 철저하게 지켜."
규칙 원천: `docs/TILEMAP_DESIGN_BRIEF.md`(사용자 원문 요약), `docs/TILESET_V2_SPEC.md`, `docs/TILEMAP_PLAN.md`, `docker/gemini/tileset_v2/`.
표기: [사실] 파일·실행으로 확인 / [가정] 확인 안 됨 / [요청] 다른 담당 변경 필요. 이번 작업에서 엔진·FE 코드, DB, 시드는 손대지 않았다.

## 1. 해석

| 항목 | 해석 | 근거 |
|---|---|---|
| 면적 3~4배 | 한 변 약 1.7~2배. 중반은 28x20을 유지하고, 후반은 36x26(936칸)부터 시작. 보스·대규모 전은 40x28(1120칸)까지 | 현재 최소 16x12(192), 최대 28x20(560). 20x14(280)를 기준으로 하면 36x26은 3.3배, 40x28은 4배 |
| "부대" 수 | **진영 한쪽 유닛 수. 사용자가 확정했다(2026-11-03, "한쪽 유닛이 20개야")**. 초반은 적 3~4유닛, 후반은 적 약 20유닛 | 팀장 전달. 참고로 `STAGES_ENEMY_V3_SPEC.md`에서는 "부대 = 지휘관 1 + 병사 n"이라는 용어를 쓰지만, 이번 확장 곡선은 유닛 수 기준이다 |
| 적용 범위 | 기존 1~4막·stage_01~06·im_* 맵은 **크기를 바꾸지 않는다**(spawns·deploy_zones·triggers·cues·win_conditions가 좌표를 참조함). 신규·후반 스테이지부터 적용한다 | 되돌리기 쉬운 쪽을 택함 |

## 2. 엔진 한계 [사실]
- `config/game.php`: `max_units_enemy_stage` 24, `max_alive_per_side_stage` 28(증원 포함), `max_units_per_side_stage` 24(아군), `max_units_hard_cap` 32(`ArmyBuilder::unitHardCap`), `deploy_zone_size` 30(imjin 시드 BFS 확장), `troop_place_radius` 3.
- → 한쪽 20유닛은 **현재 상한 안**이다. 적 20 + 증원 8까지 가능하다.
- `MapChecker`에는 맵 크기 상한이 **없다**. 검사 항목은 크기 정합, 배치·스폰 통행, 지휘관 도달·대칭, 보병 불가 비율 35% 이하, 평지 30~85%, 단일 지형 50% 이하, 고립 칸이다. → 36x26도 수정 없이 통과한다(5절에서 실행 결과 확인).
- FE: `resources/js/game/ui/MiniMap.js`가 **이미 있다**. Battle.js에서 큰 맵(`big`)일 때 생성하고, 지형 색 칸·유닛 점·카메라 사각형을 그리며 탭하면 그 칸으로 이동한다. 팀장 배경 분석의 "미니맵은 현재 없음"은 이 내용으로 정정한다. 36x26에서 실제로 동작하는지는 확인하지 않았다(7절 요청).
- 현재 대형 스테이지 참고: stage_05는 20x14에 적 20유닛, stage_06은 24x16에 23유닛이다(`STAGES_ENEMY_V3_SPEC.md` 3절). 즉 유닛 수보다 **밀도(유닛/칸)** 문제가 먼저다. stage_06은 칸당 0.06이고, 36x26에 20 대 20이면 0.043이다.

## 3. 규모 곡선 초안 (시작값, 밸런스는 임밸런이 측정)

| 구간 | 맵 크기 | 적(한쪽) | 아군 배치 칸 | 건널목·병목 | 비고 |
|---|---|---|---|---|---|
| 초반(튜토리얼~1막 전반) | 현행 16x12~20x14 | 3~4 | 10~15 | 1~2 | 현행 유지. ch1_s1 5·s2 6은 사용자 기준(3~4)보다 1~2 많다 → 조정 여부는 임밸런·사용자 결정 |
| 중반 | 28x20 | 8~10 | 25~30 | 3(폭 1·2·여울) | 시범 `su_mid_river_town` |
| 후반 | 36x26 | 15~20 | 40~50 | 3 + 성문 | 시범 `su_late_mountain_fortress` |
| 보스·결전 | 40x28 | 20(+증원 최대 8) | 50 이상 | 4 이상 | 시범 없음. 28 생존 상한 안 |

설계 기준(두 시범 맵에서 지킨 것):
1. 적 시작 칸과 아군 배치 구역 사이 최소 맨해튼 거리: 중반 12 이상, 후반 16 이상(접촉까지 2~3턴).
2. 보병 불가 칸 15~20%, 평지 60~65%, 엄폐(숲·언덕·마을·성) 15~20%.
3. 건널목·성문은 "막으면 끊기는" 진짜 병목이어야 한다. 검사 스크립트가 증명한다. 각 건널목 하나만 남겨도 도달할 수 있어야 한다(죽은 건널목 금지).
4. 아군 배치 구역 = 최대 출격 유닛 x 2 이상(troop_place_radius 3 안에서 자동 배치 여유).

## 4. 맵 제작 규칙 적용 방식 (브리프 1~8항)
- 순서: ① 공간 기획(구역·목적) ② 길·건널목·출입구 ③ 건축물 조립(논리 오브젝트) ④ 오브젝트 군집 ⑤ 검증(tmv2 V1~V8 + 독립 검사 + MapChecker) → 렌더 확인 → 수정 → 재검증. 생성기 `scaleup_pilot_gen.py`가 이 순서대로 칠한다.
- **새 타일을 만들지 않는다.** 바닥은 tv2(풀·흙길·밭·자갈·판석·숲·언덕·물·여울·다리)를 쓴다. 건물은 기존 맵(im_04_jinju·main_a3_5 등)이 이미 쓰는 레거시 조립 이름(집 `roof_top/roof_bot/wall_*`, 한옥 `hanok_ridge/eave/facade`, 성곽 `wall_NW..SE/h_N/h_S/v_W/v_E`, 성문 `gate_L/C/R`, 망루 `tower_a`, 바위 `peak_full`)과 같은 인덱스를 쓴다. 생성기는 값이 맵마다 다르면 중단한다. 오브젝트는 베이크된 칩셋 키만 쓴다.
- 건물 몸체 = `W`(전 병종 불가, 엄폐·골목 병목), 문 앞 한 칸 = `v`(자갈 마당) 또는 `c`(판석). TILEMAP_PLAN 3-3 B단계의 "집 몸체 = W, 문 앞 = v" 규약이다. 그래서 "유닛이 지붕 위에 서는" 문제가 없다.
- 레거시 세트의 제약 때문에 정한 규칙: 성곽은 **직사각 고리만**(안쪽 모서리 조각이 없음), 성문은 **남벽 4칸**만(성문 그림이 남향 정면), 집은 3줄 높이에 폭 3~5(문 = 벽 줄 가운데 또는 왼쪽에서 셋째)이고, 문 앞은 반드시 길·광장과 닿는다.

## 5. 시범 맵 2개 [사실]

파일:
- 데이터 `database/data/maps_scaleup_pilot.json`(items[], `maps_main_a3.json`과 같은 형식: code·name·biome·tiles·spawns·deploy_zones·meta·tile_layer(names-v1 + v2)). `meta.stage_code = null`, `pilot: true`, `pvp_listing: excluded`.
- 생성기 `docker/maps/tilemap_v2/scaleup_pilot_gen.py` → 편집 원본 `su_*.design.json`, 레거시 이름 층 `su_*.prev_v1.json` → `tmv2.py all/apply` → `su_*.layers.json`.
- 독립 검사 `docker/maps/tilemap_v2/scaleup_pilot_check.py`. 렌더 `docker/maps/tilemap_v2/preview/su_*_{full_x2,engine_x2,grid,compare}.png`.
- tmv2.py는 `DATA_FILES`에 새 파일 이름만 추가했다(백업 `tmv2.py.bak-scaleup-20261103`).

### 5-1. su_mid_river_town "나루 고을 쟁탈" 28x20 (중반, 적 10)
- 구역: 서안 = 아군 숙영(0~3,7~13, 28칸)·농가(집 1 + 밭 2)·언덕·강변 숲 / 남북 강(폭 2, 두 번 꺾임) / 동안 = 나루 고을(집 4채, 대로·북골목·남골목, 자갈 장터 골목 + 우물) / 북동 고지(언덕 + 바위) / 남동 숲.
- 동선: 정면 = 대로 y9~10 → 중앙 다리(폭 2). 북 우회 = 북 다리(폭 1). 다리를 건너면 바위 두 덩이 사이로 나오는 좁은 길이고 고지 궁병 사거리 안이다. 남 우회 = 강변 숲 엄폐 → 여울(방어 -10) → 남골목 → 장터.
- 적 10: 장터 지휘관, 중앙 다리 동단 2, 북 다리 1, 고을 3, 고지 궁병 2, 여울 1.

### 5-2. su_late_mountain_fortress "산성 공방전" 36x26 (후반, 적 20 / 아군 20)
- 구역: 북쪽 산줄기(바위 덩이 3 + 언덕 + 산기슭 숲, 일렬 반복 피함) / 북동 산성(고리 12x11, 남문 4칸, 관아 한옥 4x3·병영 3x3·창고 3x3·망루 2, 성 안 판석길 `c` 방어 30) / ㄱ자 강(서쪽 남북 + 남쪽 동서) / 서안 고을(집 3채, 1채는 한 줄 물러앉음, 밭 2, 우물) / 남쪽 들판(대로·언덕·바위·숲) / 아군 배치(남서 0~6,19~25, 49칸).
- 동선: 정면 = 대로 → 남 다리(폭 2) → 성 앞 마당 → 남문(폭 4) → 관아(이중 병목). 서 우회 = 고을 길 → 서 다리(폭 1) → 성벽 아래 길(성벽 옆 노출). 동 우회 = 대로 동쪽 → 동 여울 → 성 동쪽 숲 띠.
- 적 20: 성 안 8(지휘관은 관아 문 앞), 성 앞 4, 서 다리 동단 3, 동 여울 북안 3, 남 다리 남단 초병 2. 선택 목표 `objective_points` = 관아 문 앞(25~26,8).

### 5-3. 검증 결과 (2026-11-03 실행)
| 검사 | mid | late |
|---|---|---|
| tmv2 validate V1~V8(인덱스·지형 정합·이음·출입구/다리/막다른 길·오브젝트 지형/동선·병종별 도달/고립·전경·불변) | 오류 0, 경고 0 | 오류 0, 경고 0 |
| scaleup_pilot_check.py | 오류 0. 적 10, 배치 a 28 / b 68, 적-아군 최소 거리 14, 보병 불가 14%, 평지 65%, 엄폐 16%, 건널목 3곳 모두 유일 경로이고 각각 단독으로도 도달 가능 | 오류 0. 적 20, 아군 기본 20, 배치 a 49 / b 92, 최소 거리 19, 보병 불가 18%, 평지 62%, 엄폐 17%, 성문을 막으면 성 안 58칸 고립(유일 진입 확인) |
| 엔진 MapChecker(앱 컨테이너 tinker, JSON 직접 입력, DB 쓰기 없음) | 전 항목 OK, 지휘관 경로 비용 a↔b 22(대칭 0%) | 전 항목 OK, a↔b 37(대칭 0%) |
| 렌더 확인(full_x2) | 집 지붕·벽·문 정합, 문 앞 자갈 → 길 연결, 다리 양끝 길 연결 | 1차 렌더에서 산줄기가 같은 바위 일렬 반복이었고, 서 다리 동쪽 길 한 칸이 성벽으로 뻗어 있었고, 고을 집 3채가 같은 줄이었다 → 산줄기 덩이화, 길 칸 제거, 집 1채 물러앉힘으로 수정 후 재검증 |

## 6. 위험·남은 제약
1. **바위산 타일이 1종(`peak_full`)뿐이다**: 산줄기를 덩이로 나눠도 같은 봉우리가 반복되어 보인다. 전투 축척의 다칸 산·절벽 세트는 없다(TILESET_V2_SPEC 5절 4번). [요청: 안아트] 산 덩이 2x2·3x2 조립 세트 또는 절벽 47형.
2. **여울(ford47) 밝은 사각형**: 강 한가운데 2x2 여울이 밝은 사각형으로 보인다(TILEMAP_PLAN 8-6과 같은 현상). 통행 표시는 분명하다. 안아트 8-5 4번 요청(여울-흙길 전환)과 같은 문제다.
3. 성문은 남벽에만 둘 수 있다(북·동·서 성문 그림 없음). 성곽은 직사각형만 가능하다(안쪽 모서리 없음). 망루(`tower_a`)는 성 안 모서리 칸 1장(W)이고, 성벽 위 망루 덧그림은 쓰지 않았다.
4. 큰 맵에서 문제가 될 수 있는 것(가정, 미측정): 봇 AI·경로 계산 비용(20 대 20, 936칸), 턴 길이(접촉까지 2~3턴 + 이중 병목), 카메라 이동 피로. 임밸런 시뮬과 하플레이 플레이로 확인해야 한다.
5. 시드하지 않았다. 현재 시드 명령(`game:seed-main --act=N`, `seed-maps-pack --path`)이 이 파일을 그대로 읽는지는 확인하지 않았다. 스테이지 연결 없이 맵만 넣으려면 `game:seed-maps-pack --path=maps_scaleup_pilot.json --dry-run`부터 시도하는 것을 권장한다. 형식은 items[]이고 `GameSeedMapPack`이 `tileLayerFits`를 검사한다(미실행).

## 7. 후속 담당 배분 [요청]
| 담당 | 내용 | 검증 |
|---|---|---|
| 팀장 → 사용자 | 곡선 승인: 초반 적 3~4(현 ch1_s1 5·s2 6을 줄일지), 중반 28x20/8~10, 후반 36x26/15~20, 결전 40x28 | 답변 |
| 윤프론(FE) | ① 36x26에서 미니맵이 생성되는지(`big` 판정 기준 확인), 카메라 줌·이동 ② 배치 화면(Deploy.js)에서 49칸 구역과 20유닛 자동 배치 ③ 청크 합성 시간(`[terrain] ... ms` 로그) ④ tv2 레이어 합성(building·object) — 기존 요청과 같음 | 강화면 실화면(시범 2맵을 개발 DB에 임시 시드한 뒤) |
| 박백엔(BE) | ① 시범 맵 시드 경로 결정(위 6-5) ② `GameData::tileLayerFits` 전 행 검사(기존 요청) ③ 20 대 20 봇 턴 처리 시간 측정 | `game:map-check --map=su_*`, 턴 처리 ms |
| 임밸런 | 20 대 20 시뮬(승률·평균 라운드), 적 배치 앵커·증원 칸, 곡선 수치 확정 | game:simulate |
| 송서사·문기획 | 시범 맵을 실제 스테이지에 쓸지, 서사 배치(나루 고을·산성) | — |
| 맵디자이너(후속) | 확정 곡선으로 신규 스테이지 맵 제작(같은 생성기 패턴), 40x28 결전 맵 | tmv2 + 독립 검사 + MapChecker + 렌더 |
| 안아트 | 6절 1·2번 타일 | 렌더 비교 |

법무 메모(비차단): tileset_v2는 RPG Maker 2003 계열 칩셋이다. 공개 전에 라이선스를 확인해야 한다(PRE_RELEASE_NOTICES).

## 8. 1차 확장 제작 (2026-11-03 오후, 이동력 상향 반영) [사실]
- 이동력: 보병 6·궁병 5·기병 8·해군 6·중갑 4·비행 8(`unit_types.json`). 설계 기준: 보병이 가장 먼 적까지 6턴 이내, 첫 접촉 1~4턴(초반은 2~3턴). 계산 도구 `docker/maps/tilemap_v2/scaleup_turns.py`(다익스트라, ZOC·유닛 막힘 무시 → 실제 턴은 이 값 이상).
- 방식 = **코어 보존 확장**: 기존 맵을 지형·칠하기·이름 층·구조물·오브젝트째 (+ox,+oy)로 옮기고, 가장자리를 바깥으로 이어 그린 뒤(강·바다·길이 판 끝까지) 구역 목적이 있는 띠(마을·진·산·강·여울·서고 방)를 붙였다. 스테이지 좌표는 전부 평행 이동만 하면 된다. 생성기 `scaleup_embed_gen.py`, 독립 검사 `scaleup_embed_check.py`, 배치 렌더 `scaleup_units_render.py`.
- 산출: `database/data/maps_scaleup_ch1.json`(ch1_s1~s5, 24x20→40x30), `maps_scaleup_swap.json`(16x12 교체 필수: pk_01→32x24[ch18_s1·ch21_s1], pk_02→36x26[ch21_s2], main_a2_5→32x24[ch102_s5], main_a3_3→32x24[ch103_s3]), `maps_scaleup_late.json`(main_a4_3·a4_5 24x20→36x26[ch104_s3·s5]). 매핑표 `maps_scaleup_mapping.json`, 배치 24칸 미만 9맵 제안 `maps_scaleup_deploy_proposals.json`. 시드·스테이지 연결 안 함.
- 코어 지형 변경은 서가 맵의 판자 j(허공 V → j) 7칸·17칸뿐(매핑표 core_tile_changes). 코어 칠하기 변경: 옥포 1칸(서쪽 길 연결), 피난 고개 바위 32칸(산괴 mtn47).
- 산 타일: 안아트 `tv2_static4_mtn`(2400~2586)의 mtn47 을 칠하기 코드 `I` 로 tmv2.py 에 추가(바깥 띠 m 칸). 사용 맵: su_ch1_s4_jinju, su_ch1_s5_pyeongyang, su_pk01_plain_clash, su_ch102_s5_refuge_pass.
- 남은 일: 시드 경로(`game:seed-maps-pack` 은 `--path` 허용 목록·`pk_` 코드만 받음 → 박백엔), 스테이지 map 교체·좌표 이동·적 수 편성(임밸런·박백엔, 매핑표 사용), 남은 47개 스테이지 확장(같은 생성기 패턴).

## 9. 개발 DB 적용 (2026-11-03, 박백엔) [사실]
- 시드: `game:seed-maps-pack` 이 `maps_scaleup_{pilot,ch1,swap,late}.json` 과 `su_` 접두 코드를 허용한다(pilot 은 허용만, 미시드). 스테이지 시드(`game:seed-imjin10/ch18/shelf/main`)는 `su_` 맵을 참조하면 DB에 없을 때만 `App\Support\ScaleUpMaps::ensureFor` 로 맵을 먼저 넣는다(이미 있으면 재upsert 안 함 = 스테이지 시드가 병합한 meta 보존).
- 스테이지 12개(ch1_s1~s5, ch18_s1, ch21_s1·s2, ch102_s5, ch103_s3, ch104_s3·s5)의 `map` 을 su_ 맵으로 교체하고 매핑표의 307개 좌표 + 매핑표에 없던 `UNIT@x,y` 문자열 7개·`rect` 3개를 같은 오프셋으로 평행이동했다. 이동 전후 지형 일치는 스크립트로 전수 확인(불일치 0).
- `rules.map_size` 는 엔진 맵 규칙 허용 키가 아니어서(sanitizeMapRules가 예외) 넣지 않았다. 스테이지 JSON 최상위 `map_size`(ch18/ch21 파일에만 존재)만 갱신했다.
- ch1_s4 의 `ally_zone_override`(im_04 전용 아군 구역)는 su_ch1_s4_jinju 자체 배치 구역으로 대체되어 더는 쓰이지 않는다(좌표는 이동해 둠).

## 10. 후속 수정 mapfix (2026-11-03, 맵디자이너, 팀장 승인) [사실]
- **su_pk01_plain_clash**(ch18_s1 오논 강·ch21_s1 레그니차 공유): v 2x2 마당 2곳의 한옥 기와집 그림 -> 길가 야영지(흙 마당 R + 보급 수레·곡식 자루·땔감 + 말 매는 가로대 obj2_wood_frame 3칸, 기존 우물 유지). 천막·게르·목책·마른 풀 타일은 세트에 없음(만들지 않음). 언덕 띠 덩이 나눔 + 잔돌·덤불. 맵 분리 불필요.
- **su_ch102_s5_refuge_pass**: 산괴 채움 칸 해시 변형(mtn_fill_b/c 35%) + 봉우리 ov_mtnpk3 2·ov_mtnpk2 3·ov_crag 9(m 칸만, 2x2·3x3 아랫줄은 남쪽 면에서 2칸 이상 안쪽) + 언덕(i) 덩이 나눔(paint '2') + 잔돌·덤불·외딴 나무 7.
- **su_ch1_s4_jinju**: deploy_zones.a = ch1_s4 ally_zone_override 24칸(성 안), spawns.a = (20,15)(20,14)(19,15)(21,15). 이유: 시드(GameSeedImjin10:181)는 override 를 im_ 맵에만 적용해 su_ 맵 아군이 성 밖 서쪽에 배치되고 있었음(증원 R1 기병 (11,20)이 아군 배치 칸에서 비용 2). 교체 후 아군 -> R1 11·R2 (21,21) 4·동쪽 부대 10~17·남쪽 포켓 6. R1·R2 칸 유지.
- **su_ch1_s5_pyeongyang**: spawns.b = ch1_s5 부대장 5칸 (23,14)(20,10)(20,19)(19,13)(20,17), meta.spawn_counts.b = 5, deploy_zones.b = spawns.b + 성 안 동쪽 c 칸(x21~26, y9~19, 덧그림·오브젝트 칸 제외) 56칸(무게중심 x23.2 -> 초기 방향 서향 유지). 이전 앵커(성 밖 동쪽 x27~29)는 실제 배치와 어긋나 MapChecker·scaleup_turns 측정이 틀렸음.
- 도구: tmv2.py 옵션 추가(paint '2' 언덕 둘째 덩이, v 칸 R 야영 마당, design `mtn_fill`, design `v8_changed_ok` = 승인된 spawns/deploy_zones 교체를 V8 경고로 낮춤 — tiles 는 예외 없음). 설계 수정 스크립트 `mapfix_20261103.py`, 구역 교체 `mapfix2_zones_20261103.py`(백업을 원본으로 읽어 멱등).
- 검증: tmv2 전 design 맵 오류 0(4맵 V8 경고는 승인 근거 표시), scaleup_embed_check 13맵 오류 0, MapChecker 4맵 전 항목 OK·tileLayerFits true(앱 컨테이너, DB 쓰기 없음). 백업 *.bak-mapfix-20261103(swap·tmv2·pk01/ch102 design), *.bak-mapfix2-20261103(ch1·tmv2·PLAN·s4/s5 design).
- DB 반영(박백엔, 미실행): maps 행 재upsert 금지(meta 의 enemy_extra_zones 등 덮어씀). pk01·ch102_s5 = meta.tile_layer 만, ch1_s4 = spawns·deploy_zones 컬럼만, ch1_s5 = spawns·deploy_zones 컬럼 + meta.spawn_counts.b 만 갱신. 이후 `game:map-check --map=<code>`.

## 11. 군영 세트 반영 camp (2026-11-03, 맵디자이너) [사실]
- 원천: 안아트 `tv2_static5_camp.png`(2600~2656, `camp_tiles_mapping.json`), 산괴 채움 d/e/f(2587~2589, `mtn_tiles_mapping.json`).
- tmv2.py: `src()` i>=2600 -> tv2_static5_camp(2400 분기보다 먼저), `fe_valid` 에 spec.static5_camp 구간, SHEETS 경로. paint 신설 `|` 목책(지형 k/W 만, 바닥 풀 + building 레이어 `ov_palisade_<m4>` N1 E2 S4 W8 자동), `+` 목책 문(p/r, gate_h/gate_v 자동, 목책과 안 닿으면 V2 오류), `:` 스텝 바닥(steppe_a, 칸 해시로 b/c 약 17%). design `mtn_fill` 비율 = 255 55%, b·c 15%, d·e·f 5%(칸 해시, 변형은 가로·세로 이웃과 같은 이름 금지). `mtn_fill` 키가 없는 맵은 이전 규칙 그대로(ch1_s4·s5 등 tile_layer 불변).
- su_pk01_plain_clash: 서 마당(v 2x2, 12~13,11~12) = 아군 게르(ch18·ch21 모두 아군 몽골군), 동 마당(18~19,11~12) = 적갈 대형 장막(적 나이만 잔당·폴란드 연합군 공용). 천막·게르는 v(마을 = 유닛이 서는 집 칸 규약) 칸에만 두고 풀 p 칸에는 두지 않음. 목책은 k/W 칸이 없고 지형 변경 금지라 미사용. 수레·땔감은 길 밖 풀 칸으로 옮김, 언덕 덤불 -> 마른 덤불. 맵 분리 불필요.
- su_ch102_s5_refuge_pass: 새 채움 비율로 재빌드(255 58·b 12·c 16·d 9·e 5·f 8칸).
- 검증: tmv2 전 design 맵 오류 0, scaleup_embed_check 13맵 오류 0, MapChecker 2맵 전 항목 OK·tileLayerFits true. 백업 *.bak-camp-20261103.
- DB 반영(박백엔, 미실행): 두 맵 모두 meta.tile_layer 키만 교체(spawns·deploy_zones·tiles·meta 다른 키 불변). FE 가 2587~2589·2600~2656 을 등록한 빌드와 함께 반영(미등록 빌드에서는 해당 칸이 지형 폴백·오브젝트 생략).

## 11. 2차 배치 (2026-11-03, 맵디자이너) [사실]
- 생성기 `docker/maps/tilemap_v2/scaleup_embed_gen2.py`(1차 생성기의 Grid·embed·finish 를 exec 로 재사용, 1차 main 은 부르지 않음 = 1차 산출물·mapfix 수정분 불변). 산출 `database/data/maps_scaleup_batch2.json`(10맵), 매핑표 `maps_scaleup_mapping.json` 에 batch2 항목 병합(`stages[].extra_refs` = rect·`UNIT@x,y` 문자열). 시드·스테이지 연결 안 함.
- 맵: su_ch18_s6_indus(river_02 → 36x26), su_ch21_s8_mountain_pass(pk_11 → 40x28), su_ch18_s8_desert(desert_01 → 40x28), su_pk04_hill_claim(→36x26, ch18_s3·ch22_s1), su_pk13_crossroads(→36x26, ch18_s2·ch22_s3), su_pk16_cliff_valley(→36x26, ch18_s4), su_ch103_s4_clerk_office(main_a3_4 → 32x24), su_ch104_s4_seventh_hall(main_a4_4 → 36x26), su_ch1_s7_noryang(im_07 → 32x24), su_ch1_s10_last_seoga(im_10 → 32x24). 크기 = 곡선 문서 4절 필요 크기.
- 코어 지형 변경: clerk_office 옆벽 문 2칸(W→p), last_seoga 판자 8칸(V→j). 나머지 0. 코어 칠하기(시각만): 절벽 k → 돌 능선 J(pk_04·pk_11·pk_16), pk_11 바위 m → 산괴 I, 길 잇기 칸.
- 도구 수정: tmv2.py DATA_FILES 에 batch2 추가, scaleup_embed_check.py 면적 기준 = meta.scaleup_min_ratio(곡선 크기), scaleup_turns.py 는 unit_types 에 없는 병종(heavy) 건너뜀. 백업 *.bak-batch2-20261103.
- 산 채움 변형은 design mtn_fill.weights 로 b/c 만 사용(2587~2589 mtn_fill_d/e/f 미사용).
- 검증: tmv2 V1~V8 10맵 오류 0, scaleup_embed_check 오류 0(1차 13맵도 재실행 오류 0), MapChecker(check_pack20.php, DB 쓰기 없음) ERROR 0 / WARN 1(last_seoga 허공 59%, 코어부터 허공 맵), tileLayerFits 10맵 true, 인덱스 최대 2583.

## 12. 2차 배치 개발 DB 적용 (2026-11-03, 박백엔) [사실]
- 시드 허용: `GameSeedMapPack::ALLOWED`·`ScaleUpMaps::FILES` 에 `maps_scaleup_batch2.json` 추가. 10맵은 DB에 없던 신규 코드라 `game:seed-maps-pack --path=maps_scaleup_batch2.json` 로 삽입(기존 맵 재upsert 없음). 스테이지 시드 시 `ensureFor` 는 전부 있으면 no-op.
- 스테이지 12개(ch18_s2·s3·s4·s6·s8, ch21_s8, ch22_s1·s3, ch103_s4, ch104_s4, ch1_s7, ch1_s10)의 `map`·`map_size`·좌표 402개·extra_refs 4개를 매핑표 오프셋대로 이동(스테이지 JSON 8개, 백업 `*.bak-b2apply-20261103`). 이동 전후 지형 전수 비교 불일치 0, 적용 시 현재값=매핑 old 일치 확인.
- 개발 DB: `seed-ch18`, `seed-shelf --update`, `seed-main --act=3|4 --update`, `seed-imjin10 --enemy=stages_ch1_enemy_v3.json --with-npc --named` 로 반영(보상·이름 등 soft 필드 불변). 반영 전후 12스테이지 diff = 좌표·map_id 외 변경 없음. `su_ch1_s2_jeongamjin`·`su_ch1_s3_hansando` 는 meta.tile_tags 만 부분 병합. 백업 `docker/db-backup-20261103/before-scaleup-batch2.sqlite`(적용 전), `after-scaleup-batch2.sqlite`(적용 후).

## 13. ch23 헤이스팅스·ch24 투르-푸아티에 신규 8맵 (2026-11-03, 맵디자이너) [사실]
- 근거: `docs/original_story/ch23_hastings_outline.md`·`ch24_tours_outline.md` 5절. 신규 생성기 `docker/maps/tilemap_v2/ch23_ch24_gen.py`(파일럿 Grid 방식, 코어 없음) -> `tmv2.py all/apply` -> 독립 검사 `ch23_ch24_check.py`. 산출 `database/data/maps_ch23_ch24.json`(8맵, items[], 시드·스테이지 연결 안 함). tmv2.py `DATA_FILES` 에 파일 추가(백업 `tmv2.py.bak-ch2324-20261103`).
- 맵: su_ch23_s1_quay_causeway 32x24 / su_ch23_s2_pevensey 32x24 / su_ch23_s3_low_hill 32x24 / su_ch23_s4_hastings_ridge 40x28 / su_ch23_s5_southwark 32x24 / su_ch24_s1_vienne_ford 32x24 / su_ch24_s2_forest_road 32x24 / su_ch24_s3_uphill 40x28(ch24_s3·s4 공용). 아군 배치 33~112칸, 적-아군 최소 거리 8~10.
- 타일 규칙: 동아시아식 지붕(성문 gate_*·망루 tower_*·한옥·house_small)은 쓰지 않는다. 로마 성벽 출입구 = 고리를 끊은 판석 칸(c). 천막 = v 칸 + object 천막, 천막은 칸 자체가 출입 칸인 구조물(kind tent)로 등록. 숲·늪 덩이는 가장자리 다듬기(blob), 그로 생긴 기병 고립 주머니는 둘레 지형으로 메움(meta.pocket_filled).
- MapChecker 수병 규칙: 물 칸이 하나라도 있으면 수병이 양 지휘관 사이를 오가야 한다. 그래서 ch24_s2 정찰대장은 언덕이 아닌 방앗간터 마당에 두고, ch24_s3 동쪽 개울은 물 대신 늪(x) + 마른 건널목으로 했다.
- 검증: tmv2 V1~V8 8맵 오류 0(경고 = 외딴 작은 천막 1칸 도로 조각 10건), ch23_ch24_check 오류 0(둑길 우회로 1개·성벽 틈 3곳 유일 진입·다리/여울 유일 도하 증명), MapChecker(check_pack20.php, DB 쓰기 없음) ERROR 0 WARN 0, tileLayerFits 8맵 true.

## 14. 서유럽 세트(art_west 2700~3131) 연결과 ch23·ch24 보강 제안판 (2026-11-03, 맵디자이너) [사실]
- tmv2.py(백업 `tmv2.py.bak-west-20261103`): `src()` i>=2700 -> tv2_static6_west(2600 분기보다 먼저), SHEETS 경로, `fe_valid` = 매핑표 `art_west/west_tiles_mapping.json` names 인덱스 집합(빈 프레임 제외). 칠하기 신설 `^`/`_` 능선 ridge47(i, 안쪽 ridge_fill_b/c 섞기, `_` = 둘째 덩이로 꼭대기·비탈 두 단), `[` 석벽(W, building ov_wwall_<m4>), `]` 아치(c/r)·`}` 성문(c)·`{` 무너진 틈(p)(석벽과 안 닿으면 V2 오류), `&` 갈대밭(x, ov_reed_<m4>). 기존 76 design 맵 재검증 오류 0(ground 이름 불변).
- 제안판: `database/data/maps_ch23_ch24_west.json`(8맵, 코드 접미 `_w`, `ch23_ch24_gen.py --west`). 원본 `maps_ch23_ch24.json` 은 바이트 단위로 불변. 능선·언덕 = ridge47, 로마 성벽·런던 성벽 = 석벽 16형 + 아치·틈·성문, 민가 = 2x2 긴 집·석조 장원 + 1x1 집(옛 3줄 지붕 자리의 윗줄을 풀로 비움), 늪 = 갈대밭, 천막 = 파빌리온·원뿔 천막(ch24_s3 적 = 안달루스 장막), s1·s2 상륙선, s5 거룻배. meta.west_proposal = 원본 대비 지형 변경 칸(s1 8, s2 22, s5 24, 나머지 0). 적용(원본 코드 tile_layer 교체 + 변경 칸)은 박백엔 협의 후.
- 검증: tmv2 V1~V8 8맵 오류 0, ch23_ch24_check(파일 인자) 오류 0, MapChecker ERROR 0 WARN 0, tileLayerFits true(최대 인덱스 2848; 2700~ building/object 레이어는 FE 시트 등록 전에는 안 보임).

## 15. 중국 수전·적벽 세트(art_china 3200~3348) 연결 (2026-11-03, 맵디자이너) [사실]
- tmv2.py(백업 `tmv2.py.bak-china-20261103`): `src()` i>=3200 -> tv2_static7_china(2700 분기보다 먼저), SHEETS, `fe_valid` += 매핑표 `art_china/china_tiles_mapping.json` names 인덱스 집합(108). 칠하기 신설 `*` 적벽 redcliff47(지형 m·i·k, 안쪽 redcliff_fill_b/c), `!` 수채 목책(지형 W·k, 바닥 물 + building ov_shuizhai_<m4>), `?` 수문(지형 w·o, gate_h/v, 목책과 안 닿으면 V2 오류). 배·화선·연환·군막·깃발은 object(tv2:이름).
- 회귀: 기존 76 design + ch23·ch24 제안판 8(_w) 오류 0. 합성 시험(적벽 덩이·목책 고리·수문)에서 이름·인덱스 무효 0.
- ch23·ch24 원본 코드: 2026-11-03 18:00 maps_ch23_ch24.json 에 서유럽판(_w 내용)이 적용됨(데이터 백업 `.bak-west-20261103`). 생성기 기본을 서유럽판으로 바꾸고 `--design-only` 로 design/prev_v1/layers 만 맞춤(데이터 미변경, 백업 `_bak_westsync_20261103/`). 남은 V8 오류 3맵(s1·s2·s5 tiles, s5 deploy_zones)은 tmv2 apply 때 생긴 이전 백업 `.bak-mapv2c-20261103` 대비 = 적용으로 생긴 의도된 변경. 기준 백업 정리는 승인 후.

## 16. ch12 적벽 4맵 (2026-11-03, 맵디자이너) [사실]
- 근거 `database/data/stages_ch12_redcliff.json` map_requirements(임밸런). 생성기 `docker/maps/tilemap_v2/ch12_gen.py`(ch23_ch24_gen 의 Grid·finish 를 exec 재사용, 서유럽 그림 끔) -> tmv2 all/apply -> 검사 `ch12_check.py`. 산출 `database/data/maps_ch12_redcliff.json`(시드 안 함). tmv2.py DATA_FILES 추가(백업 `tmv2.py.bak-ch12-20261103`).
- 맵: su_ch12_s1_xiakou 32x24 / su_ch12_s2_riverbank 32x24 / su_ch12_s3_redcliff 40x28 / su_ch12_s4_yiling 36x26. 강 물 = sea o 만(w 0칸). meta.zone_refs = 스테이지 zone_ref 이름별 칸, meta.enemy_squad_cells = 분대별 시작 칸.
- 검증: tmv2 V1~V8 4맵 오류 0, ch12_check 오류 0, MapChecker ERROR 0 / WARN 1(s4 성 안 12칸 고립 = 닫힌 성문, 의도. design known_isolated). 전 design 88맵 재검증 오류 0.
- ch23·ch24 V8 기준 정리(팀장 승인): 옛 `maps_ch23_ch24.json.bak-mapv2c-20261103` -> `.bak-prewest-mapv2c-20261103` 로 이름 보존, 적용 후 데이터를 새 `.bak-mapv2c-20261103` 기준으로 복사 -> 8맵 V8 통과.

## 17. ch13 황산벌 3맵 (2026-11-03, 맵디자이너) [사실]
- 근거 `database/data/stages_ch13_hwangsanbeol.json` map_requirements. 생성기 `docker/maps/tilemap_v2/ch13_gen.py`(ch12_gen 헬퍼 exec 재사용) -> tmv2 all/apply -> 검사 `ch13_check.py`. 산출 `database/data/maps_ch13_hwangsanbeol.json`(시드 안 함). tmv2 DATA_FILES 추가(백업 `tmv2.py.bak-ch13-20261103`).
- su_ch13_s1_tanhyeon 32x24(산괴 사이 폭 3 협곡, 양옆 능선 매복) / su_ch13_s2_hwangsanbeol 40x28(세 언덕, 전언 지점 간격 10·9·9) / su_ch13_s3_sabi 32x24(성곽 남문 3칸, 성루 4칸, 백마강 당군 나루).
- 검증: tmv2 3맵 오류 0, ch13_check 오류 0(김인문->합류 23, 신호->합류 8, 신호-협곡 2), MapChecker ERROR 0 WARN 0. 전 design 91맵 재검증 오류 0.
- s2 남쪽 강은 물 칸 대신 갈대 진창(계백이 언덕 위 = 수병 불가라 MapChecker 수병 규칙에 걸림). 반복 중 apply 자동 백업은 `.bak-iter1-mapv2c-20261103` 로 이름 보존 후 기준 갱신.

## 18. ch16 오를레앙 5맵 (2026-11-03, 맵디자이너) [사실]
- 근거 `database/data/stages_ch16_orleans.json` map_requirements. 생성기 `docker/maps/tilemap_v2/ch16_gen.py`(ch23_ch24_gen exec 재사용, 서유럽 세트) -> tmv2 all/apply -> 검사 `ch16_check.py`. 산출 `database/data/maps_ch16_orleans.json`(시드 안 함). tmv2 DATA_FILES 추가(백업 `tmv2.py.bak-ch16-20261103`).
- s1 보급 호송 32x24(남쪽 길·목책 보루·성문 앞 입성 구역) / s2 생루 32x24(둔덕 위 목책 보루) / s3 오귀스탱 32x24(석벽 수도원·폭 2 해자 shallows) / s4 투렐 40x28(sea 강·판자 다리 16칸·석벽 투렐·목책 흙 보루) / s5 파테 32x24(말뚝 줄 10칸 평지).
- 영국군 보루 = 군영 세트 목책('|' 지형 k + '+' 문). 성벽 = 서유럽 석벽 16형·아치·성문.
- 검증: tmv2 5맵 오류 0, ch16_check 오류 0(수레->입성 16, 신호-요새 문 7, 해자 막으면 수도원 문 도달 불가, 다리 16칸, 말뚝 10칸), MapChecker ERROR 0 WARN 0. 전 design 맵 재검증 오류 0.

## 19. 일본 전국 세트(art_japan 3400~3646) 연결 (2026-11-03, 맵디자이너) [사실]
- tmv2.py(백업 `tmv2.py.bak-japan-20261103`): `src()` i>=3400 -> tv2_static8_japan(3200 분기보다 먼저), SHEETS, `fe_valid` += 매핑표 `art_japan/japan_tiles_mapping.json` names 인덱스. 중국 세트 열린 성문 int_gate_open_L/R(3349·3350)은 매핑표 names 에 들어 있어 별도 수정 없이 유효.
- 칠하기 신설: `~` 마방책(W·k, ov_mabosaku_<m4>), `<` 마방책 틈(p·r), `@` 돌담·토담(W, ov_ishigaki_<m4>), `>` 돌담 성문(c), `;` 도랑·해자 ditch47(w·s), `,` 논 paddy47(x·p). 틈·성문이 담과 안 닿으면 V2 오류.
- 검증: 합성 시험 무효 이름 0, 전 design 96맵 재검증 오류 0.

## 20. ch20 나가시노 3맵 + art_world 5세트 연결 (2026-11-03, 맵디자이너) [사실]
- ch20: `docker/maps/tilemap_v2/ch20_gen.py` -> `database/data/maps_ch20_nagashino.json`(시드 안 함), 검사 `ch20_check.py`. s1 사자 호송 32x24(논 paddy47 = 늪 x, 논둑길 진흙 2칸, 큰길 정찰) / s2 별동대 32x24(산괴·숲 오솔길, 돌담 보루·망루 2) / s3 설락원 40x28(마방책 3줄 = 지형 k + 틈, 틈 엇갈림, 연자천 도랑 = shallows). tmv2 3맵 오류 0, ch20_check 오류 0(사자->합류 23, 횃불 12·10, 표시 11·3·6), MapChecker ERROR 0 WARN 0.
- art_world 5세트(tmv2.py 백업 `tmv2.py.bak-world5-20261103`): src() 4400·4300·4100·4000·3700 분기(큰 구간부터, 3400 앞), fe_valid += 5개 매핑표 names. 칠하기: e 흙벽돌 성벽(W)·h 흙벽 성문(c)·l 건조 점토(p·d)·u 모래 둔덕(i·d) / t 사암 석벽(W)·y 성문·z 아치(c·r)·q 무너진 틈(p)·0 방파제(b) / 8 석조 부두(b)·7 석호(s·w) / 5 물막이 둑(b·p)·6 터진 둑(s·w·o) / 1 흰 바닥·3 흰 벽(W)·4 마지막 칸(p). 문·틈이 같은 계열 벽과 안 닿으면 V2 오류. 합성 시험 무효 이름 0, 전 design 99맵 재검증 오류 0.

## 21. 남은 서가 24맵(ch14·ch11·ch17·ch19·ch15·ch999) + ch20 진막 (2026-11-03, 맵디자이너) [사실]
- 공용 생성기 `docker/maps/tilemap_v2/world_gen.py <루트> <서가>`(정의 world_gen_more.py = ch11·ch17, world_gen_more2.py = ch19·ch15·ch999). 분대·증원 칸은 pick() 으로 구역 안 통행 칸에서 고르고, 요청 경로 비용은 meta.checks 에 적어 공용 검사 `world_check.py <루트> <파일>` 이 확인. 산출 database/data/maps_ch14_salsu.json·maps_ch11_goryeo_khitan.json·maps_ch17_gaugamela.json·maps_ch19_holy_land.json·maps_ch15_mediterranean.json·maps_ch999_finale.json(시드 안 함). tmv2 DATA_FILES 추가(백업 `tmv2.py.bak-worldmaps-20261103`), 방파제·부두 칠하기를 항구 갑판 h 에도 허용(백업 `tmv2.py.bak-moleh-20261103`).
- 사막 서가(ch17·ch19)는 평지 바탕 = 건조 점토 clay47, 흙길 R 도 점토로 칠함(사막에서 풀 테두리 길 회피, 통행 규칙 불변). 서고(ch999)는 흰 바닥·흰 벽 16형, 빈 곳 = 허공 V(MapChecker 불통 비율에서 제외).
- ch20 진막(ov_jinmaku 3647~3650): s1 (30~31,15~16)·s3 (1~2,13~14) 2x2 W 추가. 변경 칸은 그 8칸뿐, spawns·deploy·zone_refs·tags 불변. 이전 기준 백업 `.bak-prejinmaku-mapv2c-20261103` 보존.
- 검증: 24맵 tmv2 V1~V8 오류 0, world_check 오류 0(요청 경로 비용 전부 이내), MapChecker ERROR 0 WARN 0. 전 design 123맵 재검증 오류 0. 반복 중 apply 자동 백업은 `.bak-iter1/iter2-mapv2c-20261103` 로 이름 보존.

## 22. 맵 확장 3차 배치 (2026-11-03, 맵디자이너) [사실]
- 생성기 `docker/maps/tilemap_v2/scaleup_embed_gen3.py`(2차 생성기 exec 재사용 = 8절 코어 보존 확장 그대로). 산출 `database/data/maps_scaleup_batch3.json`(20맵), 매핑표 `database/data/maps_scaleup_mapping.json` 에 batch3 20항목 병합(백업 `.bak-batch3-20261103`, 기존 21항목 불변). 시드·스테이지 JSON 수정 안 함. tmv2 DATA_FILES 추가(백업 `tmv2.py.bak-batch3-20261103`).
- 크기 = 곡선(BALANCE_UNIT_COUNT_CURVE.md 4절) 필요 크기. 같은 맵 공유 스테이지는 offset 하나: pk_14(ch18_s5·ch22_s8, 36x26 +4,+3) / pk_20(ch18_s7·ch21_s4·ch22_s7, 36x26 +4,+3) / pk_18(ch21_s3·ch22_s2, 36x26 +4,+3). 나머지: im_08·im_09 28x20(+2,0), pk_15·pk_12·pk_10 36x26(+4,+3), pk_09·pk_07 36x26(+6,+5), pk_06 40x28(+6,+4), main_a1_4 24x14(0,0), main_a1_5 24x20(0,0), main_a2_1 24x20(0,+2), main_a2_2 28x20(+2,0), main_a2_3 28x20(+2,+2), main_a3_2 32x24(+4,+4), main_a3_5 36x26(+4,+3), main_a4_1 32x24(+4,+4), main_a4_2 36x26(+6,+5).
- 확장 안 함(곡선 x1.0 = 현재 크기가 필요 크기): ch1_s6(im_06 24x20), ch101_s1(16x12)·s2(20x14)·s3(24x16), ch102_s4(24x20), ch103_s1(28x20).
- 판단: main_a1_4 는 곡선 24x16 대신 24x14 — 1막 서고 방 이야기는 본 방 + 붙임 방 하나면 충분하고, 위아래 띠는 빈 벽뿐이라 불통 비율(35%)만 올림. main_a1_4·a1_5 는 동쪽/남쪽 붙임 서고 방(문 = 코어 벽 1·2칸 W -> p, 기록).
- 띠 처리: 들판 = 숲 덩이·어두운 풀, 사막 = 모래 덩이, 산골 = 언덕·숲, 바다·허공 = 이어 그린 그대로. 원본 pk 맵(설계 파일 없음)의 들판에서 끊긴 길 끝은 칠하기만 판 끝·성문까지 이음(core_paint_changes). 띠에만 생긴 기병 고립 주머니는 산 m 으로 메움. 아군 배치 = 코어 + 아군 쪽 띠(적 시작과 tier 최소 거리 이상), 적 앵커 = 곡선 적 수까지. im_08 원본 적 스폰 1칸이 허공 위(20,17)라 가까운 통행 칸으로 바꿈(meta.spawn_b_fixed).
- 검증: tmv2 20맵 오류 0, scaleup_embed_check 오류 0, MapChecker ERROR 0 WARN 2(su_ch1_s8 고립 1칸 = 원본 im_08 known_isolated, su_ch101_s5 벽 54% = 원본 실내 56%), 전 design 143맵 재검증 오류 0, 스테이지 좌표 same_terrain=false 0건, 최대 인덱스 2448. 반복 중 apply 자동 백업은 `.bak-iter1~4-mapv2c-20261103` 로 이름 보존.

## 23. 3차 배치 개발 DB 적용 (2026-11-03, 박백엔) [사실]
- 시드 허용: `GameSeedMapPack::ALLOWED`·`ScaleUpMaps::FILES` 에 `maps_scaleup_batch3.json` 추가, `game:seed-maps-pack --path=maps_scaleup_batch3.json`(20맵 삽입, 검증 ERROR 0). 백업 `docker/db-backup-20261103/before-scaleup-batch3.sqlite`.
- 스테이지 JSON 9개(ch18_mongol, ch21 2개, ch22 3개, main_a1~a4)의 map·map_size·좌표·extra_refs 를 매핑표대로 이동(백업 `*.bak-b3apply-20261103`). 적용 전 현재값=매핑 old 확인, 좌표쌍 752건 이전/이후 지형 불일치 0. 반영: `seed-ch18`, `seed-shelf --chapters=21,22 --update`, `seed-main --act=1..4 --update`. `game:audit-stages` 4건은 batch3 밖 기존 항목, `game:map-check` ERROR 0.
- **미적용(보류)**: ch1_s8·ch1_s9 (`stages_ch1_enemy_v3.json` 58, `_additions` 29, `stages_imjin10.json` 2 좌표 + map/map_size). 임밸런이 같은 파일(ch1 일본군 호위 병사 보강)을 편집 중이라 충돌 방지로 대기. 임밸런이 새로 넣는 ch1_s8·s9 칸은 **새 좌표(+2,0 오프셋 후)** 로 써야 함.

## 23. 서가 확장 파일럿 맵 — ch13 s4~s10, ch20 s4~s10 (2026-11-03, 맵디자이너) [사실]
- 근거: `database/data/scenario/EXPAND_ch13_ch20.md`(송서사), `stages_ch13_ext.json`·`stages_ch20_ext.json` map_requirements(임밸런).
- 생성기 `docker/maps/tilemap_v2/ext_gen.py <루트> <ch13|ch20>`. world_gen.py 의 도구를 exec 로 재사용한다.
  - 출력 `database/data/maps_ch13_ext.json`·`maps_ch20_ext.json`. maps_ch20_nagashino.json 과 같은 형식이다(meta.zone_refs·enemy_squad_cells·checks·tile_tags).
- 복제·변형 판단: 기존 맵을 그대로 다시 쓴 경우는 없다. 기존 s1~s3 맵 meta 를 바꾸면 다시 시드해야 하므로 14맵 모두 새로 만들었다.
  - ch20 s7·s8 은 같은 설락원 목책 앞 바탕 함수(fence_field)의 변형이다.
    - s7: 목책 x19·틈 y6/13/21, 개활지
    - s8: 목책 x17·틈 y7/14/20, 물 댄 논 둘(기병 불가)
- 문화권: ch13 = 동아시아 레거시 성곽·한옥·한대 군막·목책, ch20 = 일본 전국 세트(마방책·돌담·망루·진막·노보리·논·도랑)에 초가 곳간(ov_whouse_thatch)을 더했다.
- 검증:
  - tmv2 V1~V8 14맵 오류 0, world_check 2파일 오류 0
  - MapChecker ERROR 0. WARN 1 = su_ch13_s7 큰 책 봉쇄 안쪽 6칸 고립으로, 의도한 것이다(known_isolated).
  - 전체 설계 회귀 163개 오류 0
  - 스테이지 zone_ref·spawn 칸(_0..)·tile_tags·분대 칸 수가 모두 일치한다.
