# TILESET_V2 명세 (1단계: 분석·분리·매핑·교체 지점) — 안아트, 2026-11-02

브리프: `docs/TILEMAP_DESIGN_BRIEF.md`. 이 문서는 실측 결과와 교체 제안만 다룬다. 소스(JS/PHP)는 수정하지 않았다.
법무 메모(비차단): 원본은 RPG Maker 2003 계열 칩셋으로 제3자 저작물일 가능성이 있다. 개발용으로만 쓰고, 공개 전에 권리를 확인해야 한다.

## 1. 실측 결과 (Pillow 13.0.0, `docker/gemini/tileset_v2/measure.py`, `split.py`)

| 항목 | 값 | 근거 |
|---|---|---|
| 원본 | 966x520 RGBA, sha256 `4f98e356…e7bf63` (전체 값은 tiles.json meta) | 복사본 `docker/gemini/tileset_v2/src/source.png` |
| 구분선 | 청록 (0,128,128). 세로 x=0-1, 482-483, 964-965 / 가로 y=0-1, 258-261(4px), 518-519 | 90% 이상이 청록인 행·열. 청록 픽셀 10800개가 전부 구분선(내부에는 없음) |
| 칩셋 4장 | A(2,2), B(484,2), C(2,262), D(484,262), 각각 480x256 | 구분선 사이 크기 |
| 투명 키 | 마젠타 (225,0,126), 원본 최빈색 56706px | 시트별 키 픽셀 A 15020 / B 14747 / C 12849 / D 14090 |
| 타일 크기 | **16px** (30열 x 16행 = 480칸/시트) | 인접 열 차이 비(경계/비경계): 16주기 1.57~1.75, 8주기 1.16~1.23. 오토타일 3x4 블록과 정적 타일 경계가 16px 격자와 일치 |
| 확대 | x2 최근접 → 32px (960x512). 현재 엔진 `U32_PX = 32` 와 같은 정수배 | `chipsets/chipset_*_32.png` |
| 마젠타 분포 | 수면·오토타일·하층 0%(빈 칸 233만 투명), 상층 33~53%, 상층 첫 칸(열18 행8) 100% 투명 | RM2003 규약(상층 0번 = 빈 칸)과 일치 |
| 수면 애니 | water_A 열0~2 가로 3프레임(프레임 간 픽셀 차이 31~76%), 깊은 물(행4~7)도 3프레임. water_B(열3~5): A·C 는 정적(차이 0), B·D 는 3프레임 | `measure_result.json` water_frame_diff |
| 애니 타일 | 열3·4·5 x 행4~7, 세로 4프레임(차이 15~91%) | anim_vertical_diff |
| 시트 간 중복 | 전체 1920칸 중 고유 1542칸. C와 A 같은 위치 동일 57칸, D-A 37칸, B-A 4칸 | `tile_hashes.json` |

## 2. 칩셋 구조 (RM2003 규약, 실측 확인)

타일 id = 행*30 + 열 (16px 기준. 32px 확대본에서도 열·행 같음). 전역 키 `"<시트>:<id>"`.

- 수면·애니(열0~5 행0~7): water_A(열0~2 행0~3, 물가 조각 4행 x 3프레임), water_B(열3~5 행0~3: A·C 얼음 물가 / B·D 석조 수로(해자)), 깊은 물(열0~2 행4~7), 애니 3종(열3~5 행4~7: 폭포·모닥불 또는 어두운 소용돌이·소용돌이).
- 지면 오토타일 12블록(각 3x4 타일): 원점 (6,0)(9,0)(6,4)(9,4)(0,8)(3,8)(6,8)(9,8)(0,12)(3,12)(6,12)(9,12).
  - 블록 안 위치: (0,0) = 고립 미리보기, (1,0) = 바탕(미사용), (2,0) = **안쪽 모서리 4조각**, (0..2,1..3) = 3x3 테두리(가운데 (1,2) = 채움).
  - 실측 근거(`tiles_report.json` autotile_check): 48블록 중 47블록에서 (2,0) 타일 중심색이 채움 (1,2) 중심색과 같음(차이 0). 풀 위 블록은 (2,0) 타일의 네 모서리 픽셀이 바깥 풀색과 같음(4/4). 예외는 A b7 청록 무늬 바닥(무늬 타일이라 차이 93).
  - 합성 규칙(8x8 쿼터, 47형): 쿼터(cx,cy)마다 가로 이웃 h·세로 이웃 v·대각 이웃 d가 같은 지형인지 보고 고른다. h·v·d 모두 같으면 채움, h·v만 같으면 (2,0) 안쪽 모서리, h만 같으면 3x3의 위/아래 가운데, v만 같으면 3x3의 좌/우 가운데, 둘 다 다르면 3x3 모서리. 기존 `fx/rmAutotile.js floorQuarter` 와 같은 원리이고 블록 배치만 다르다. 2단계 베이크에서 렌더로 검증한다.
  - 수면 블록(16x64, 프레임당): 행0 = 사방 물가, 행1 = 좌우 물가, 행2 = 상하 물가, 행3 = 안쪽 모서리. 물 내부(테두리 없음)는 깊은 물 블록 행0(120~122). 4x 확대로 판독했으며, 행 의미는 2단계 렌더에서 확인한다(verify).
- 정적 하층(lower): 열12~17 행0~15 → 열18~23 행0~7 (144칸). 정적 상층(upper): 열18~23 행8~15 → 열24~29 행0~15 (144칸, 첫 칸 투명).
- **팔레트 연속성**: RM2003 편집기 팔레트는 6열이고 위 순서로 이어진다. 그래서 다타일 오브젝트가 시트 블록 경계를 넘을 수 있다. B 석판 3x3 = 438~440, 468~470, **24~26** / B 마법진 3x3 = 441~443, 471~473, **27~29**. 확인 이미지는 `preview/palette_B_x3.png`.

시트 성격: A = 기본 필드·마을/성 실내, B = 용암·눈/얼음·동굴·광산, C = 필드·눈숲·산맥(월드맵 축척 성/마을 아이콘 포함), D = 마을 건축(목조·통나무·성벽·지붕)·농지·정원.

## 3. 산출물 (`docker/gemini/tileset_v2/`)

| 파일 | 내용 |
|---|---|
| `chipsets/chipset_{A,B,C,D}_16.png` | 480x256 투명 PNG(마젠타→알파 0) |
| `chipsets/chipset_{A,B,C,D}_32.png` | 960x512, x2 최근접 |
| `overlay/grid_{A..D}_x3.png` | 1440x768, 격자 + id + 영역 테두리(파랑 수면, 노랑 오토타일, 초록 하층, 분홍 상층), 체커 배경 |
| `preview/region_{A..D}_{0,1,2}_x4.png` | x4 판독용(열0~11 / 12~23 / 24~29) + id |
| `preview/palette_{A..D}_x3.png` | RM 6열 팔레트 순서(왼쪽 하층, 오른쪽 상층). 다타일 연속 확인용 |
| `tiles.json` | 1920칸: sheet, col, row, px16, px32, region, rm_layer, palette, opaque, sha1_12, category, label, block/role, object{name,w,h,part,tiles}, verify |
| `tiles_report.json` | 분류 누락 0, 빈칸 불일치 0, 오토타일 구조 실측값, 분류별 개수 |
| `terrain_map.json` | 지형 코드 20종 → 후보 타일, 상태(ok/partial/missing), tile_layer 이름 계열 대응 |
| `measure.py` `split.py` `groups.py` `build_tiles.py` | 재현 스크립트(`python -I`로 실행, 인자는 경로) |

분류 개수: terrain_auto 576, wall 170, cliff 155, furniture 151, structure 144, floor 112, object 103, water_auto 96, ground 64, decor 58, rock 58, deep_water 48, anim 48, door_window 35, plant 35, roof 25, sign 18, empty 8, effect 6, bridge 6, stairs 4.
판독이 불확실한 항목은 `verify: true`로 표시했다(레일·바퀴, 월드맵 아이콘, 일부 소품 등).

## 4. 지형 코드 매핑 요약 (상세: `terrain_map.json`)

| 코드 | 상태 | 1순위 후보 |
|---|---|---|
| plain | ok | C b4 풀(채움 C:301) |
| forest | ok | C b8 침엽수림 오토타일(채움 C:421). 소군집에는 상층 나무 C:318 2x2, D:260 1x2 |
| mountain | partial | C b9 둔덕(채움 C:424). 전투 축척의 바위산 전용 타일 없음 |
| water | ok | C water_A(물가 조각 + 내부 120~122, 3프레임) |
| sea | partial | 깊은 물 C:210~212 |
| shallows / swamp / reef | missing | 대체 표현만 가능 |
| bridge / rift_plank | partial | B:141~143(가로), B:171·201·231(세로). 난간·교대 없음 |
| road | ok | C b0 흙길(채움 C:67), 포장도로는 A b11 자갈(A:430) |
| snow_desert / sand | ok | 눈 C b3(C:190), 모래 C b1(C:70) |
| hill | ok | C b9(C:424) |
| cliff | partial | C 고원 3x3 정적 블록, B 암석 단면 |
| wall / village | partial | D 성벽·원탑·목조벽·기와지붕(서양식) |
| castle | ok | A b10 석재 단(A:427), D b6 판석(D:307), 붉은 카펫 |
| harbor | partial | D 판자 바닥 |
| void | partial | B b3 구덩이(B:190) |

## 5. 부족 타일 (임의로 만들지 않음, 사람·추가 에셋 필요)

1. **문화권 불일치(최중요)**: 세트 전체가 서양 중세 판타지다(팀버프레임, INN/PUB 간판, 십자가, 스테인드글라스, 피아노, 마법진). 한옥(기와·초가), 조선 성곽(여장·옹성·문루 성문), 왜성, 군영 천막, 목책, 배가 없다. 임진왜란 맵의 hanok_* / ov_hanok_* / house_small / gate_* 는 대체할 수 없다.
2. 수변: 여울(ford), 늪, 암초, 모래 물가 물(물가는 풀/흙·얼음·석조 수로뿐), 부두 기둥·선착장 가장자리.
3. 다리 난간·교대(양끝)·교각.
4. 전투 축척의 산·절벽: 임의 모양 군집용 절벽 옆면(높이) 조각. C의 산맥 V조각·봉우리·성/마을 아이콘은 월드맵 축척이라 전투 맵에 맞지 않는다.
5. 대형 성문(문짝·문루), 성벽 꺾임·모서리 조각(D 성가퀴 3x3에 모서리가 있는지 verify), 절벽 계단(A 석조 계단 1x3은 실내용).
6. 목표 깃발: 서양식 붉은 깃발(D:179+209)만 있다. 현재 ws_overlay 깃발은 유지한다.

## 6. 현재 엔진 구조와 교체 지점 (조사 결과, 수정 안 함)

- 렌더 스타일 스위치: `resources/js/game/settings.js` `terrainStyle` = `'unity32'`(기본, STYLE_REV 2) | `'rm'`(RM MV 48px) | `'legacy'`(64px 칸별 이미지).
- 로드: `assets.js queueRmTiles()` — unity32이면 `TileMap.png`(320x96) + ext(320x256) + ext2(320x192) + water_set 4장 + land_set(`ls_static.png` 512x672)을 32x32 spritesheet로 로드하고 `applyFilters`에서 NEAREST로 설정한다. manifest의 `tileset.*` 항목은 기록용이며 queueScope는 건너뛴다.
- 진입점: `Battle.js:254-255`, `Deploy.js:209-210`, `MapPicker.js:224-225` → `new RmGround(...)`. `RmGround` 생성자는 `unityReady()`이면 `UnityGround`를 반환한다(호출 측 무수정 구조).
- 합성: `UnityGround` → `unityPrefabs.u32ComposeWithBuildings(map)` → **맵에 `tile_layer`가 있으면 `u32TileLayer`**(names-v1 이름 → `index_map` 전역 인덱스, 칸당 1타일 + 오버레이 1개)를 쓰고, 없으면 `u32Compose`(지형 코드 레시피) + `lsPaint`(이웃 마스크 47/16형 이름) + 프리팹을 쓴다. 칸마다 `u32Src(idx)`로 시트와 좌표를 구하고, 칸당 32px로 청크 캔버스에 1회 굽는다. 애니는 전역 4프레임 시계(250ms)를 쓴다.
- 전역 인덱스 사용 구간: 0~29 기본, 30~103 ext, 110~163 ext2, 200~425 수상 세트, 500~829 land_set. **1000 이상은 비어 있다.**
- 데이터: 맵 39개(maps.json 9, maps_imjin10.json 10, maps_pack20_v2.json 20)가 **전부 tile_layer를 보유**한다. 실제 화면은 지형 코드가 아니라 tile_layer 이름(170종, `database/data/tile_layer_names_used.json`)으로 결정된다.

### 교체 제안 (2단계, 권장안 A)

A. **오프라인 베이크 + 인덱스 구간 추가 (권장)**
1. 안아트: RM2003 오토타일 블록(수면 3프레임 포함)을 47형 마스크 변형 전부 32px로 합성해 정적 시트 `public/assets/tiles/tileset_v2/tv2_*.png`와 이름표 `tv2_names.json`을 만든다(이름 예: `grass47_<mask>`, `forest47_<mask>`, `water47_<mask>`). 기존 `landPaint`의 `red()` 대각 축약 마스크와 같은 규칙을 쓴다. 정적·상층 타일은 32px로 복사한다. 다타일 오브젝트는 칸별 조각 + 오버레이로 만든다. manifest에는 `merge_fragments.mjs` fragment로만 등록한다.
2. 윤프론: `unityTileset.js`에 `TV2 = { enabled, start: 1000, ... }` 구간과 `u32Src` 분기를 추가하고, `queueRmTiles`에 로드를 추가한다.
3. **교체 스위치**: `u32TileLayer`에서 `TV2.enabled`(또는 `terrainStyle: 'tv2'`)이면 맵의 `index_map` 대신 FE 표 `TV2_INDEX_MAP`(tile_layer 이름 → tv2 인덱스)을 우선 쓴다. 표에 없는 이름(한옥·여울 등 missing)은 기존 인덱스로 폴백하므로 맵 데이터를 고치지 않고 켜고 끌 수 있다. tile_layer가 없는 맵에는 `lsPaint`와 같은 형식의 `tv2Paint`를 둔다.
4. 애니: RM 3프레임을 전역 4프레임 시계에 `[0,1,2,1]`로 대응시킨다.
5. 롤백: 플래그 off 또는 `terrainStyle` 원복. 기존 시트·코드는 삭제하지 않는다.

B. 런타임 RM2003 오토타일 합성기(`rmAutotile.js`처럼 16px 쿼터 직접 합성): 이웃 47형 판정을 실행 중에 하므로 tile_layer 이름 체계와 다시 맞춰야 하고 코드량이 크다. 비권장.

주의: 다타일 오브젝트(나무 2x2, 지붕 박공 2x2)는 현재 칸당 오버레이가 1개라 겹침 표현에 한계가 있다. 2단계에서 오버레이 배열이나 오브젝트 레이어가 필요한지 윤프론과 정한다. 지형 판정(이동·방어)은 바꾸지 않는다.

## 7. 사람이 확인할 것
- verify 항목 판독(레일·바퀴, 월드맵 아이콘, D 성곽 3x4 구조물, 성가퀴 모서리 유무).
- 문화권 불일치를 받아들일지(서양식 마을·성을 임진왜란 맵에 쓸지) 또는 한옥·성곽 타일을 같은 16px 도트 문법으로 추가 제작할지 결정.
- 라이선스 확인(공개 전).

## 8. 2단계 결과 — 베이크 시트·이름표·윤프론 요청서 (2026-11-02)

팀장 결정: 권장안 A를 채택했다. 서양식 건물은 한옥·성곽 이름에 쓰지 않으며, 그 이름들은 기존 타일로 폴백한다(맵 데이터는 바꾸지 않는다). 대응되는 지형만 교체한다. 추가 타일 제작은 후속 작업으로 미룬다.

### 8.1 산출물 (`public/assets/tiles/tileset_v2/`)
| 파일 | 내용 |
|---|---|
| `tv2_static.png` | 512x1248, 32px, 16열, 619칸. 전역 **1000~1618** (프레임 = 전역-1000). 할당 용량은 1000~1699 |
| `tv2_anim.png` | 512x384, 32px, 16열, 48칸 x 4프레임, stride 48. 전역 **1700~1747** (프레임 = (전역-1700) + f*48, f = `u32AnimFrame(t)`). RM 3프레임을 [0,1,2,1] 순서로 구웠다 |
| `tv2_names.json` | 이름 → {sheet, frame, index, src}. spec(구간·마스크 규칙·패밀리) 포함 |
| `tileset_v2_map.json` | **tile_layer 이름 → tv2 인덱스 표**(`index_map` 74개), 선택 표 `index_map_regrounded`(32개), `fallback_names` 96개, `why`(이름별 근거) |
| `manifest_fragment_tv2.json` | `tileset.tv2_static`, `tileset.tv2_anim` (merge_fragments.mjs로 병합 완료: --dry 추가 2·충돌 0 → 실제 병합, 백업 `manifest.json.bak_merge_20261102T112255`) |
| `preview_tv2_sample_x2.png` | 지형 샘플 맵(호수·다리·숲·모래·흙길·눈·둔덕·밭·성 바닥·자갈), 47형 마스크 칠하기 결과 |
| `preview_tv2_river_02.png` | river_02 3면 비교: 기존 / tv2 기본(폴백 52칸) / tv2 + 재바탕(폴백 28칸) |
| `preview_tv2_river_02_rg_x2.png` | river_02 tv2 + 재바탕, 2배 확대(맵디자이너 파일럿용) |

재현 방법(저장소 루트에서 `python -I`): `docker/gemini/tileset_v2/bake.py <루트>` → `map_names.py <루트>` → `preview_maps.py <루트> [맵코드]`.

### 8.2 베이크 규칙
- 이름: `<패밀리>47_<mask>`(47종, mask = landPaint.js `red()`와 같은 비트·대각 축약), `<패밀리>_single`(RM 블록 고립 미리보기 칸). 패밀리 13종: forest, sand, dirt, snow, hill, grassdark, snowforest, snowhill, cobble, castlefloor, flagstone, farm, water(애니). 단일 타일: grass_a, grass_flower, plank_v/plank_v_l/plank_v_r(세로 결), plank_h_a/b/c(가로 결), woodfloor_a/b/h, sea_deep(애니, 예비).
- 쿼터 합성은 2절 규칙을 따른다. 수면 행 의미(행0 사방, 행1 좌우, 행2 상하, 행3 안쪽 모서리, 내부 = 깊은 물 블록 행0)는 샘플 렌더로 확인했다(호수·만곡·ㄷ자에서 내부 이음선 없음).
- QA(`docker/gemini/tileset_v2/bake_qa.json`): 지면·수면 667칸 모두 완전 불투명이고 마젠타 키색은 0. 확대는 정수배 최근접이라 할로·경계 색이 생기지 않는다.
- 재바탕 `rg_*`(선택): 폴백 이름 중 기존 풀(TileMap 3번) 바탕이 있는 32칸(house_small, peak_full, tower_a, cliff_* 12, grass_ford_* 10, hanok_eave/facade/ridge 7)이 대상이다. 기존 풀과 픽셀이 같은 칸은 tv2 풀로 바꾸고, 기존 풀 색상(hue 61~77, S>0.35)의 그림자 픽셀은 tv2 풀 x 명도비로 바꾼다. 건물·바위 그림은 그대로 둔다. 2배 확대로 할로가 없음을 확인했다. 맵별 index_map과 이름표 인덱스는 39맵 모두 일치한다(`rg_mismatch` 0).

### 8.3 윤프론 요청서 (FE 연동, 앱 코드는 윤프론이 수정)
1. **표 파일 위치**: 안아트는 resources/js를 수정하지 않으므로 표를 `public/assets/tiles/tileset_v2/tileset_v2_map.json`에 두었다. `resources/js/game/data/tileset_v2_map.json`으로 복사(import)하거나 fetch해서 쓴다. 원본을 다시 만들 때는 `map_names.py`를 쓴다.
2. **구간 등록**(`data/unityTileset.js`): `U32_TV2 = { enabled, static: { key: 'tv2_static', path: '/assets/tiles/tileset_v2/tv2_static.png', cols: 16, start: 1000, count: 619 }, anim: { key: 'tv2_anim', path: '/assets/tiles/tileset_v2/tv2_anim.png', cols: 16, start: 1700, count: 48, stride: 48, frames: 4 } }`.
   - `u32ValidIndex`: 1000~1618, 1700~1747을 유효로 판정(enabled이고 텍스처가 로드됐을 때만).
   - `u32Src`: `idx >= 1700` → `srcOf('tv2_anim', (idx-1700) + (f%4)*48, 16)`, `idx >= 1000` → `srcOf('tv2_static', idx-1000, 16)`. 반드시 기존 `idx >= U32_EXT3.start(500)` 분기보다 **먼저** 판정한다.
   - `u32Animated`: 1700~1747을 true로.
3. **로드**(`assets.js queueRmTiles`): unity32이고 `U32_TV2.enabled`이면 두 시트를 spritesheet 32x32로 로드하고, `applyFilters`의 NEAREST 목록에 추가한다. `UnityGround` 생성자에서는 미로드 시 `enabled=false`로 폴백한다(기존 EXT 처리와 같은 방식).
4. **교체 스위치**(`unityPrefabs.u32TileLayer`): `U32_TV2.enabled`이면 칸 이름을 `TV2.index_map[name]` → (선택 플래그 `regrounded`가 켜져 있으면) `index_map_regrounded[name]` → 맵 `tl.index_map[name]` 순서로 찾는다. 회전은 맵 `rotations`를 그대로 적용한다(plank_h → plank_v는 기존 5번과 같은 세로 결). overlay도 그대로다. 끄면 현재 동작과 완전히 같다.
5. tile_layer가 없는 맵(현재 0개)은 지금처럼 `lsPaint`를 쓴다. tv2용 칠하기는 필요할 때 `<패밀리>47_${red(mask)}` 이름 규칙으로 추가할 수 있다.
6. 검증 요청(강화면): river_02 전투 실화면에서 `preview_tv2_river_02.png` 가운데·오른쪽 패널과 같은지, 물 애니(4fps)와 이음선 없음, 청크 경계 PAD 이상 없음을 확인한다.

### 8.4 남은 제약 (파일럿에서 보이는 것)
- 여울(ford_*, grass_ford_*의 물 쪽)과 ford_deep_N/S는 기존 하늘색 타일 그대로라 새 강물 옆에서 색이 다르다(ford_deep는 강 칸 안에 있어 특히 눈에 띈다). 여울 전용 타일이 생기면 해소된다.
- 기본 표만 켜면 집·봉우리·성문 칸이 기존 노란 풀 바탕 네모로 보인다. **재바탕 표(regrounded)를 함께 켜는 것을 권장한다.** 단 건물 화풍(기존 32px 도트)과 RM 16px x2 화풍 차이는 남는다.
- grass_flower·grass_dark는 단일 칸 얼룩(바둑판)으로 보여서 풀로 통일했다.
- sand_sea_*는 모래 물가 물이 없어 흙·풀 물가로 근사했다(verify). cliff·wall·gate·hanok·harbor·reef·swamp·void·seoga는 기존 타일을 쓴다.

## 9. 3단계 확장 — 여울·모래 물가·암초·오브젝트 (안아트, 2026-11-02)

- 생성: `docker/gemini/tileset_v2/bake_ext.py <루트>`. `bake.py` → `map_names.py` 다음에 실행하며 멱등이다.
- 구간 `tv2_static` **1619~1625**(투명 오브젝트): 1619 우물, 1620 봉화, 1621 이정표, 1622 장작, 1623 통, 1624·1625 상자.
- 새 시트 `tv2_anim2.png`(512x896, 4프레임, stride 112, 용량 1800~1999):
  - `ford47` 1800~1846
  - `sandwater47` 1847~1893
  - `tv2reef_a~d` 1894~1897
  - 기존 `tv2_anim`은 stride 48로 고정돼 있어 확장하지 않는다.
- 표: `tileset_v2_map.json`의 `index_map_ext`(`index_map`보다 우선)와 `chip_index`. 적용 안내는 `tv2_ext_mapping.json`에 있다.
- 맵 반영 기록(맵디자이너 tmv2.py 적용, river_02·im_01_okpo 재빌드)은 `docs/TILEMAP_PLAN.md` 7절에 있다.

## 10. 5단계 확장 — 실내 키트 ext3 (맵디자이너, 2026-11-03)
- 생성: `docker/gemini/tileset_v2/bake_ext3.py <루트>`(bake_ext2.py 다음, 멱등). 기존 시트 4장은 읽지도 쓰지도 않는다(전후 sha1 동일 확인).
- 새 시트 `tv2_static3.png`(512x160, 16열): **2200~2231** 지면(서가 3x3 `int_shelf_*`, 회벽 벽면 2행 `int_wallface_{top,bot}_*`, 사암 `int_wall_sand_a`, 카운터 `int_counter_0~3`, 카펫 3x3 `int_carpet_*`, 문턱 `int_threshold`), **2232~2264** 투명 오브젝트 `obj3_*`(칩셋 키 -> `chip_index_ext3`).
- placeholder(칩셋에 없음, 안아트 신규): `int_walltop47_<mask>`·`int_walltop_single`(예약 2300~2347, 임시 = 사암), `int_shelfred_*`(예약 2350~2358, 임시 = 일반 서가), `obj3_bleed_a~d`(예약 2360~2363, 임시 없음·맵 미배치). 목록 `tileset_v2_map.json interior_placeholders`.
- 표: `tileset_v2_map.json`에 `index_map_ext3`·`chip_index_ext3`·`ranges_ext3`만 추가(기존 키 값 불변). manifest 조각 `tileset.tv2_static3` 추가(merge_fragments --dry: 추가 1·충돌 0, 실제 병합은 FE 등록과 함께).
- FE 요청(윤프론): `U32_TV2.static3 = {key:'tv2_static3', path:'/assets/tiles/tileset_v2/tv2_static3.png', cols:16, start:2200, count:65}`를 `U32_TV2_SHEETS`·`hasTv2`에 추가, `u32Src`에서 `idx >= 2200` 분기를 static2(2000) 분기보다 먼저. `tv2_map_to_js.mjs` 구간 검사에 2200~2399 추가 후 `chip_index_ext3` 병합. 등록 전에는 main_a1 맵이 지형 코드 기본 타일로 폴백된다(오류 없음).
- (2026-11-03 추가) 안아트 신규 그림 `tv2_static3_art.png`(512x128, 전역 2300~2363, 프레임 = 전역-2300) 등록: `bake_ext3.py`가 마지막에 `art_ext3.py <루트> --apply <루트>`를 호출한다(`--no-art`로 생략 가능). placeholder 이름이 예약 인덱스를 직접 가리킨다(`int_walltop47_*` 2300~2346, `int_walltop_single` 2347, `int_shelfred_*` 2350~2358, `obj3_bleed_a~d` 2360~2363). tmv2.py: `src()` 2300 분기(static3보다 먼저), 유효 구간 2300~2363, 오브젝트 키 `tv2:<이름>`(칩셋 키 없는 번짐 오버레이). FE 요청: `U32_TV2.static3_art = {key:'tv2_static3_art', path:'/assets/tiles/tileset_v2/tv2_static3_art.png', cols:16, start:2300, count:64}`, `u32Src`에서 `idx >= 2300`을 `>= 2200`보다 먼저. manifest 조각 `tileset.tv2_static3_art` 추가(--dry 충돌 0).
