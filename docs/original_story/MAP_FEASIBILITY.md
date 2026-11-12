# 오리지널 메인 스토리 맵 선행 판정 (맵디자이너, 2026-11-03)

범위: 읽기·분석만 했다. 맵 데이터 생성, DB 변경, `gen_tile_layers.py --write`는 실행하지 않았다. 아래 레이아웃은 개요(설계 초안)이고 tile_layer는 만들지 않았다.
근거 파일: `public/assets/tiles/tileset_v2/tv2_names.json`(930 이름), `docker/gemini/tileset_v2/tiles.json`(칩셋 1920칸 라벨), `preview/region_A_1_x4.png`·`region_A_2_x4.png`(직접 확인), `database/data/terrains.json`, `maps.json`·`maps_imjin10.json`·`maps_pack20_v2.json`, `app/Game/Cues.php`, `resources/js/game/data/unityTileset.js`.

## 1. 실내 표현 가능성 (tileset_v2 구운 구간 기준)

핵심 사실: 칩셋 A(실내 시트)에는 서가·카운터·책상·벽·문이 **원본으로 있다**. 하지만 지금 구운 tv2 구간(1000~1676, 1700~1747, 1800~1908, 2000~2095)에는 **바닥과 일부 소품만 들어 있다**. 서가·벽·문·카운터는 '없는 타일'이 아니라 '아직 굽지 않은 타일'이다. 따라서 새로 그릴 필요는 없고, 안아트가 칩셋 A에서 베이크만 하면 된다(신규 제작은 붉은 줄·번짐뿐).

| 요소 | tv2 구운 구간 후보(전역 id) | 칩셋 원본(구울 대상, `시트:id`) | 판정 |
|---|---|---|---|
| 목재 바닥 | woodfloor_a/b/h 1584~1586, plank_v/l/r 1578~1580, plank_h_a~c 1581~1583 | D:168~170·198~200·228~230(wood_floor_v 3x3), D:171~173 | **가능** |
| 석재 바닥·복도 | flagstone47 1483~1529, castlefloor47 1435~1481(보라 석단, 단차가 보일 수 있음), cobble47 1387~1433 | A:163 floor_carved_stone | **가능**(castlefloor는 렌더 확인 필요) |
| 카펫(주 통로) | 없음 | A:375~377·405~407·435~437·465~467 red_carpet 3x4 | 미구움 |
| 서가 | 없음 | A:18~20·48~50·78~80 bookshelf 3x3(lower, 불투명), A:147+177 bookcase_small 1x2, A:148+178 shelf 1x2 | **미구움** |
| 벽(벽면) | 없음(기존 구간 wall_* 211~218은 성벽, wallstone_a/d 10·13은 구 화풍) | A:74~77·104~107 회벽 목골조 2행, A:14~17·44~47 벽돌 목골조, A:134~137·164~167 사암 블록 | **미구움** |
| 벽 윗면(천장, 위에서 본 벽 두께) | 없음 | **칩셋에 없음**(A 오토타일 12블록에 벽 윗면 블록 없음) | **불가 → 신규 요청** |
| 문 | 없음 | A:116+146+176 어두운 아치 1x3(verify), A:56 커튼 출입구, D:329+359 doorway_dark 1x2, A:373 석조 소형 출입구(verify) | 미구움 |
| 카운터 | 없음 | A:198~201 counter_wood_front 4x1(lower), A:22~23·52~53 counter_sink 2x2 | **미구움** |
| 책상·의자 | obj2_table_round 1665, obj2_table_small 1666, obj2_stool 1667, obj2_bench 1668~1669 | A:295 desk, A:325~328 table_long_h 4x1, A:234·264·294 table_long_v 1x3, A:267·268·297·298 의자, A:408~410·438~440·468~469 L자 책상(verify) | **부분 가능**(원형·소형 탁자만) |
| 책·종이 소품 | 없음 | A:145 펼친 책, A:175 붉은 책, A:322 지도 두루마리, D:320 쪽지, A:114~115 지도 액자 | 미구움 |
| 조명 | obj_brazier 1620(실외 화로) | A:204 촛대, A:206 램프, B:263+293 스탠드 횃불 | 미구움 |
| 창고 상자·통 | obj_barrel 1623, obj_crate_a/b 1624~1625 | D:202~203 | **가능** |
| 계단 | 없음 | A:111·141·171 석조 계단 1x3 | 미구움 |
| 붉은 줄·종이 번짐 | 없음(void47 2048~2094는 판자 바닥 위 구덩이라 '허공'용) | **칩셋에 없음** | **불가 → 신규 요청** |

지형 코드 매핑(엔진 규칙 변경 없음, terrains.json 값 그대로):

| 실내 요소 | 지형 코드 | 근거(이동/방어) | 비고 |
|---|---|---|---|
| 목재·석재 바닥, 의자 칸 | `p` plain | 전 병종 1/0 | 의자는 오버레이만 |
| 카펫·중앙 통로 | `r` road | 1/0 | 시각 구분용(규칙상 p와 같음) |
| 서가·벽·카운터 몸체 | `W` wall | 전 병종 불가(비행 포함) | 실내는 비행도 막는 것이 자연스러움. 비행 통과를 원하면 `k` cliff |
| 책상(엄폐) | `f` forest | 도보 2/+20, cover 1 | 가설: '책상 뒤 엄폐'로 재사용. terrain_change로 바뀌면 나무 그림이 나오는 점 주의(아래 5절) |
| 카운터 안쪽 | `c` castle | 1/+30 | 1-4 버티기용, 칸 수를 제한해 과보정 방지 |
| 문(도달 목표) | `p` + 목표 칸 | - | 닫힌 문은 `W`+문 오버레이 |

## 2. 1막 맵 레이아웃 개요 (크기 규칙: 기존 10x8 / 16x12 / 20x14 / 24x16 / 24x20 / 28x20 중 선택)

범례: `W` 벽 `S` 서가(W) `K` 카운터(W) `G` 닫힌 문(W) / `p` 목재 바닥 `r` 석재·카펫 통로 / `f` 책상(엄폐) `B` 책 놓인 책상(f + 보호 표식) `c` 카운터 안쪽 / `D` 문 `a` 아군 배치 `e` 적 `H` 거점 `x` 전투 중 닫힐 통로.
검증(스크래치 스크립트, 4방향 BFS): 5개 모두 아군 시작에서 모든 이동 가능 칸 도달, 고립 칸 0. 1-5는 x 칸을 W로 바꾼 뒤에도 고립 0. G(1-2 서쪽 문)는 의도적 통행 불가.

### 1-1 열람실 16x12 (공백병 3 격퇴, 책 칸 보호)
```
WWWWWWWWWWWWWWWW
WSSSppSSSSSSppSW
WSSSpeSSSSSSepSW
WppppppppppppppW
WppSSpffBfpSSppW
WppSSpffffpSSpeW
WppppppppppppppW
WpfBppppppppfBpW
WpffpprrrrppffpW
WppppprrrrppppSW
WpppppaaaappppSW
WWWWWWWDDWWWWWWW
```
북벽 서가 사이 틈 2곳에서 적 진입, 중앙 열람 탁자(B 1칸)와 좌우 탁자(B 각 1칸). e1-E3 이동 대상은 중앙 B 인접 칸. 소형이라 튜토리얼 성격 유지.

### 1-2 필사실 20x14 (격퇴 + 책상 10 중 5 보호)
```
WWWWWWWWWDDWWWWWWWWW
WSSppppppeeppppppSSW
WSSpfpfpfppppfpfppSW
WSSppppppppppppppppW
WSSpfpfpfpprppfpfppW
WSSppppppppprpppppeW
GppppppppppprpppppSW
WSSppppppppprppppppW
WSSpppppppprrrpppppW
WSSSpppppprrrrrppppW
WppppppppppppppppppW
WppppppaaaaaaapppSSW
WSSppppppaaappppppSW
WWWWWWWWWDDWWWWWWWWW
```
책상 10 = 좌측 6(x4·6·8) / 우측 4(x13~16). 좌측 서가 열(x1~2)이 '기우는 책장', 좌측 6개가 '위험 구간'(e2-E2 대사와 일치). 서쪽 벽 G(0,6) = 지도에 없는 문(1-3 입구, 이번 편은 연출만).

### 1-3 복도 24x16 (복도 끝 문 도달 + 공백병 격퇴)
```
WWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWW
WWSSpSSSSpSSSSSWWWWWWWWW
DaarrrrrrrrrrrrrpeWWWWWW
WaarrrrrrrrrrrrrrpWWWWWW
WWSSpSSSSSSpSSrrrpWWWWWW
WWWWeWWWWWWeWWrrrSWWWWWW
WWWWWWWWWWWWWSrrrSWWWWWW
WWWWWWWWWWWWWSrrrSSSSWWW
WWWWWWWWWWWWWprrrrrrrpWW
WWWWWWWWWWWWWerrrrrrrrrD
WWWWWWWWWWWWWprrrrrrrpWW
WWWWWWWWWWWWWSSSSSSSeSWW
WWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWW
```
서쪽 D(필사실 쪽 입구)에서 2~3칸 폭 ㄱ자 복도, 동쪽 끝 D(23,10)이 목표. 벽 감실(e 4,6 / 11,6)이 e3-E4 '뒤쪽 서가' 기습 위치. 꺾임 구간(x14~16) 3칸 폭이 '한 줄로 막는' 병목. 외곽 막힘 행·열이 많으므로 확정 때 20x14로 줄일지 검토(카메라 낭비).

### 1-4 대출 카운터 20x14 (버티기)
```
WWWWWWWWWDDWWWWWWWWW
WSSSppppeeeepppppSSW
WSSppprrrrrrrrppppSW
WpppeprrrrrrrrpepppW
WffpppprrrrrrppppffW
WpppppprrrrrrpppppeW
WSpppppprrrrpppppppW
WppKKKKpprrppKKKKppW
WppccccpppppppccccpW
WppcaacppppppcaacppW
WSSppppppaappppppSSW
WSSppffppppppffppSSW
WSSSppppppppppppSSSW
WWWWWWWWWDWWWWWWWWWW
```
북문에서 카펫(줄 선 공백병)이 카운터 중앙 통로로 이어진다. 카운터 2개(A:198~201 4x1 각 1개) 뒤 c 8칸 + 배치칸만 방어 보정. 중앙 통로 2칸과 양끝 우회로가 압박 경로. 남쪽 D(9,13) = 직인함 창고 문, e4-E5 사자 퇴장 칸 후보.

### 1-5 빈 책 창고 24x16 (거점 확보, 보스 없음)
```
WWWWWWWWWWWWWWWWWWWWWWWW
WSSSSSSSSSSSSSSSSSSSSSSW
WppppppppppppppppppppppW
WSSSSSSpSSSSSSSpSSSSSppW
WppppppppppppppppppeSSpW
WSSSSpSSSSSSSSxSSSSSSppW
DaapppppppppppxppppHHSSW
DaapppppppppppxppppHSSSW
WSSSSpSSSSSSSSxSSSSHHSSW
WppppppppppppppppppeSSpW
WSSSSSSpSSSSSSSpSSSSSppW
WpppppppppppppppppppppeW
WSSSSSSSSSSSSSSSSSSSSSSW
WWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWW
```
서쪽 D 2칸 = 입구(e5-E1에서 terrain_change → W, 아군 배치는 x1~2라 점유 충돌 없음). 동쪽 H 5칸 = 쪽이의 책 서가 앞(hold_zone). x 4칸 = e5-E3 '서가 한 줄 닫힘'(terrain_change → W). 하단 3행은 확정 때 통로 1줄 추가로 채운다(현재는 개요).

## 3. 기존 맵 재활용 판정 (1막)

| 편 | 재활용 후보 | 판정 | 이유 |
|---|---|---|---|
| 1-1 열람실 | 없음 | 불가 | 기존 39맵 중 실내 방(벽·서가·탁자) 구조 0. im_08/10은 허공 섬형 서가 |
| 1-2 필사실 | 없음 | 불가 | 책상 10개 배치·서쪽 벽 문 필요 |
| 1-3 복도 | im_08_seoga_collapse(일부) | 불가(대체 시 연출 붕괴) | 판자 발판 j 통로는 있으나 '복도 끝 문' 구조 없음 |
| 1-4 카운터 | 없음 | 불가 | 카운터 선 + 안쪽 방어 구도 없음 |
| 1-5 창고 | im_10_last_seoga | 조건부 가능 | 중앙 hold 목표점(11,9)(12,9)·고립 거점 구조는 맞음. 단 허공·언덕 화풍이라 '끝없는 서가 창고'와 다르고 임진왜란 10편과 중복 사용 |

권장: 1막 5편은 신규 제작(위 2절). 실내 키트 한 벌로 1막 5편 + 3-4 서기소 + 4-4/4-5 7층까지 재사용 가능.

### 안아트 요청 타일 (우선순위)
| 순위 | 요청 | 방식 | 쓰임 |
|---|---|---|---|
| P1 | 서가 A:18~20·48~50·78~80(3x3), A:147+177·148+178(1x2) | 칩셋 베이크(신규 제작 없음) | 전 편 |
| P1 | 실내 벽면 A:74~77·104~107(회벽), A:134~137·164~167(사암) | 베이크 | 전 편 외벽 |
| P1 | **벽 윗면(천장) 47형 오토타일** | **신규 제작**(칩셋에 없음, 16px 도트 문법 맞춤) | 벽 두께 표현. 없으면 벽이 한 줄 그림으로만 보임 |
| P1 | 카운터 A:198~201, 책상 A:295·325~328·234/264/294, 의자 A:267·268·297·298 | 베이크(상층은 투명 오버레이) | 1-2, 1-4 |
| P2 | 문 A:116/146/176(verify), D:329/359, A:56 | 베이크 + 판독 확인 | 1-2 G, 1-3 목표, 1-5 입구 |
| P2 | 카펫 A:375~467(3x4), 석조 계단 A:111/141/171 | 베이크 | 1-4 통로, 4-3 계단 |
| P2 | 책·종이 A:145·175·322, D:320 / 조명 A:204·206 | 베이크(투명) | B 칸 표식, 분위기 |
| P3 | **붉은 줄 덮인 서가 변형**(서가 3x3에 붉은 띠), **종이 번짐 바닥 오버레이**(반투명) | **신규 제작** | 1-2 e2-E1, 1-5 e5-E2 연출 |
| P3 | 꺼진 조명 행 어둡게(틴트) | FE 연출(윤프론) | 1-2 e2-E3 |

## 4. 2~4막 기존 맵 재활용 1차 제안

서양 중세 계열 tv2는 3막(프랑스)과 화풍이 맞는다. 2막(조선)은 한옥·성곽 타일 부재로 기존 im_* 화풍을 그대로 쓴다.

| 편 | 무대·목표 | 1순위 | 2순위 | 메모 |
|---|---|---|---|---|
| 2-1 | 봉수대, 불 구덩이 hold_zone | pk_04_hill_claim(24x16) | im_06_haengju(24x20) | 중앙 마을 v 칸을 불 구덩이로. 봉수대 석축 오브젝트 없음(obj_brazier 1620 대용) |
| 2-2 | 당항포 수로·배, 적선 격파 | im_01_okpo(24x20, 항구 h) | im_09_myeongnyang | 해전 규칙 맵 그대로. 임진왜란 캠페인과 중복 사용 |
| 2-3 | 질은 골짜기 보급로 통과 | pk_11_mountain_pass(24x16, 고갯길 r) | pk_03_narrow_gorge(16x12) | 길 일부 x(늪)로 바꿔 진흙 표현(데이터 수정 필요) |
| 2-4 | 산성 안 돌무더기 방어 | im_06_haengju(행주산성, W35) | pk_06_fortress_siege(28x20) | terrain_change 돌무더기 칸 지정 필요 |
| 2-5 | 피난길 좁은 고개 돌파 | pk_03_narrow_gorge | pk_16_cliff_valley | 바위 그늘 = 목표 칸 지정 |
| 3-1 | 성벽 아래 보급로, 성문 도달 | pk_18_wall_breach(28x20) | pk_06_fortress_siege | 성문 칸 도달 목표 |
| 3-2 | 진창 평원, 격파 | pk_09_swamp_detour(24x16) | pk_17_three_lanes(28x20) | 진창 = x(늪). 기병 이동 불가 규칙과 대사 일치 |
| 3-3 | 루아르 나루터, 배 맞은편 도달 | pk_02_ford_small(16x12) | pk_14_twin_rivers(28x20) | 배 도달 판정은 박백엔 확인 대상 |
| 3-4 | 서기소 문서함 hold_zone | 없음(1막 실내 키트로 신규 20x14) | pk_13_crossroads(거리 대체, 실내 아님) | 문서함 = 서가 W + 서랍 소품 |
| 3-5 | 대성당 앞 광장, 성당 문 도달 | pk_12_central_keep(28x20) | pk_13_crossroads | 성문 하나를 성당 문 목표로 |
| 4-1 | 사막 대상로, 바위 그늘 도달 | pk_07_oasis(24x16) | desert_01(maps.json 24x16) | 모래폭풍 terrain_change 대상 = n(설원·사막) |
| 4-2 | 우물가 hold_zone | pk_07_oasis | - | 중앙 물·여울을 우물(obj_well 1619) 둘레로 |
| 4-3 | 서고 심층 입구, 아래 문 도달 | im_08_seoga_collapse(24x20) | 1-3 복도 변형 | 목표점 (12,9)(18,12) 중 하나를 문으로 |
| 4-4 | 7층 홀 중앙 카운터, 격파 | 1-4 카운터 맵 변형 | im_10_last_seoga | 붉은 줄 연출 필요(P3) |
| 4-5 | 7층 안쪽 서가 빈 자리, 지휘관 격파 | im_10_last_seoga | 1-5 창고 변형 | im_10은 2-x 없이 4-5만 쓰면 중복 최소 |

## 5. 엔진·데이터 쪽 확인 요청 (수정하지 않음)
1. 책상 보호 개수 판정(1-2), 책 칸 보호(1-1): 오브젝트 HP·파손 판정 없음 → 박백엔. 대안: 책상 칸을 적이 밟으면 실패 카운트.
2. `terrain_change` 재렌더(`UnityGround.patchCells` → `u32TileFor(code, biome)`)는 지형 코드의 기본 타일만 그린다. 실내에서 `W`로 바꾸면 성벽, `f`로 바꾸면 나무가 그려질 가능성이 높다(코드 확인, 화면 미확인) → 윤프론에 실내 바이옴 레시피(`library`: W=서가, f=책상) 또는 cue에 타일 이름 지정 옵션 요청.
3. 문 칸 도달 승리 판정 유무(1-3, 3-1, 3-3, 3-5, 4-1)는 act 문서마다 '확인 필요'로 남아 있음 → 박백엔.
4. tile_layer 칸당 오버레이 1개 제약: 책상 위 책 + 의자 같은 겹침 불가. 1칸 1소품으로 설계했다.

## 6. 확인하지 않은 것
- 칩셋 A 문 타일(116/146/176, 373)과 L자 책상(408~469)의 실제 연결 모양(verify 표시 그대로).
- castlefloor47을 실내 바닥으로 깔았을 때 단차가 보이는지(렌더 미실행).
- 2~4막 후보 맵의 실제 좌표 적합성(크기·지형 분포만 확인, 목표 칸 미지정).

## 7. 확정 반영 (2026-11-03, 팀장 지시 2차)
- 1막 5맵 확정 데이터: `database/data/maps_main_a1.json`(코드 main_a1_1_reading_room / main_a1_2_scriptorium / main_a1_3_corridor / main_a1_4_counter / main_a1_5_empty_stacks). 2절 개요에서 바뀐 점: 1-2 카펫 2칸 폭·우측 서가 정리·적 5, 1-4 카펫 2칸 폭 직선·카운터 안쪽 c 를 카운터와 정렬, 1-5 동쪽 쪽이의 책 서가를 (21~22,6~8) 블록으로 정리·거점 6칸·하단 통로 1줄 추가·적 8. 적 수는 stages_main_a1.json(박백엔 v0)에 맞춤.
- 실내 키트 베이크: `docker/gemini/tileset_v2/bake_ext3.py` -> `public/assets/tiles/tileset_v2/tv2_static3.png`(전역 2200~2264, 지면 32 + 오브젝트 33). 벽 윗면·붉은 줄 서가·종이 번짐은 placeholder(예약 2300~2363).
- 생성·검증: `docker/maps/tilemap_v2/main_a1_gen.py` -> `tmv2.py all/apply`, 독립 검사 `main_a1_check.py`. 미리보기 `docker/maps/tilemap_v2/preview/main_a1_*`.
- cue 좌표: `docs/original_story/act1_cues_coords.json`(12건 + 입구 닫힘 1건).
