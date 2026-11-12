# 타일맵 교체 계획 (맵디자이너, 2026-11-02, 1차 읽기 전용 조사)

브리프: `docs/TILEMAP_DESIGN_BRIEF.md`. 새 타일셋 분석(`docs/TILESET_V2_SPEC.md`, `docker/gemini/tileset_v2/`)은 안아트가 작성 중이고 이 문서 작성 시점에는 **SPEC 문서가 아직 없다**. 그래서 타일 ID 매핑은 아직 확정하지 않았다(아래 3-4절은 가설과 확인할 항목만 적음).
이번 작업에서 소스(JS/PHP)·DB·데이터 파일은 수정하지 않았다. DB는 `database/database.sqlite`를 `mode=ro`로 조회만 했다.

표기: **[사실]** = 파일·DB에서 직접 확인한 것 / **[가설]** = 확인하지 않은 추정 / **[요청]** = 다른 담당자의 변경이 필요한 것

---

## 1. 현재 전투 맵 데이터 구조

### 1-1. 저장 위치와 흐름 [사실]
| 단계 | 위치 | 내용 |
|---|---|---|
| 원본 데이터 | `database/data/maps.json`(9), `maps_pack20.json`(v1, 20), `maps_pack20_v2.json`(v2, 20, DB 반영본), `maps_imjin10.json`(10) | `code,name,biome,tiles,spawns,deploy_zones,rules?,decor?,meta?,tile_layer?` |
| 생성기 | `docker/maps/gen_pack20.py`, `gen_pack20_v2.py`(pk_* 지형+tile_layer), `gen_tile_layers.py`(maps.json·imjin용 tile_layer, `check` 모드 검증 포함), `v2_prefab_params.json`, `v2_tilemap.json` | 오프라인에서 결정적으로 생성 |
| 시드 | `game:seed`(`GameSeed.php`, maps.json + 스테이지), `game:seed-maps-pack --path=maps_pack20_v2.json`(`GameSeedMapPack.php`), `game:seed-imjin10`(`GameSeedImjin10.php`) | `tile_layer`·`decor`·`village_style`은 `maps.meta` JSON에 저장. `GameData::tileLayerFits`로 크기를 검사하고, 맞지 않으면 저장하지 않음 |
| DB | `maps(id, code, name, width, height, tiles JSON(행 문자열, terrains.symbol), spawns, deploy_zones, rules, biome, meta)` | 마이그레이션: `2026_10_31_000100`, `001300`(rules), `001500`(biome), `2026_11_01_000600`(meta) |
| 서버 판정 | `app/Game/RuleSet.php`(`terrainMod(terrain, move_type)`), `Engine.php`, `MapChecker.php`(`game:map-check`) | 이동·방어 판정은 **`tiles`만** 본다. tile_layer는 시각용 |
| 응답 | `GameData::mapExtras()` → 전투 view·배치·방 응답 최상위에 `decor`·`village_style`·`tile_layer`(state 크기와 같을 때만). `MapCatalog`: 목록에는 tile_layer 제외, 미리보기에는 포함 | |
| FE 수신 | `store/battleStore.js:67` `s.map = {w,h,tiles,biome,decor,villageStyle,tileLayer}`. `Deploy.js:205`, `ui/MapPicker.js:223`도 같은 형태 | |

### 1-2. 지형 코드 (terrains.json = DB terrains/terrain_modifiers) [사실]
비용 `null`은 통행 불가, 방어는 `def_pct`(%). 셀 값은 `비용/방어`.

| 기호 | 코드 | 이름 | 보병 foot | 기병 mounted | 중장 heavy | 비행 flying | 수병 naval | 속성 |
|---|---|---|---|---|---|---|---|---|
| p | plain | 평지 | 1/0 | 1/0 | 1/0 | 1/0 | 2/-20 | |
| f | forest | 숲 | 2/20 | 3/20 | 2/20 | 1/0 | 4/-10 | cover |
| m | mountain | 산 | 3/30 | 불가 | 불가 | 1/0 | 불가 | elevation |
| w | water | 물 | 불가 | 불가 | 불가 | 1/0 | 1/25 | water |
| c | castle | 성(바닥) | 1/30 | 1/30 | 1/30 | 1/30 | 2/10 | |
| s | shallows | 얕은 여울 | 2/-10 | 2/-10 | 2/-10 | 1/0 | 1/10 | water |
| b | bridge | 다리 | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 | |
| r | road | 도로 | 1/0 | 1/0 | 1/0 | 1/0 | 2/-20 | |
| x | swamp | 늪 | 3/-10 | 불가 | 불가 | 1/0 | 4/-20 | |
| n | snow_desert | 설원·사막 | 2/0 | 2/0 | 2/0 | 1/0 | 3/-15 | biome으로 설원/사막 구분 |
| k | cliff | 절벽 | 불가 | 불가 | 불가 | 1/0 | 불가 | |
| W | wall | 성벽 | 불가 | 불가 | 불가 | 불가 | 불가 | elevation |
| v | village | 마을 | 1/10 | 1/10 | 1/10 | 1/0 | 2/-10 | heals(미구현) |
| o | sea | 바다 | 2/-10 | 3/-10 | 3/-10 | 1/0 | 1/25 | water, boarding |
| q | reef | 암초 | 3/5 | 4/5 | 4/5 | 1/0 | 2/35 | cover, water, boarding |
| h | harbor | 항구 | 1/10 | 1/10 | 1/10 | 1/0 | 1/15 | water |
| d | sand | 모래 | 1/-5 | 2/-5 | 2/-5 | 1/0 | 1/-10 | |
| i | hill | 언덕 | 2/15 | 2/15 | 3/15 | 1/0 | 불가 | elevation |
| V | void | 허공 | 불가(전부) | | | | | 장식 |
| j | rift_plank | 서가 발판 | 1/-10 | 1/-10 | 1/-10 | 1/0 | 불가 | |

주의: `RuleSet::terrainMod`는 정의되지 않은 move_type을 cost 1로 처리한다. 타일 교체는 이 표를 **바꾸지 않는다**.

### 1-3. 렌더링 경로 [사실]
- 스타일 스위치: `settings.terrainStyle` = `'unity32'`(기본) | `'rm'`(RPG Maker MV 48px, `data/rmTileset.js`·`fx/RmGround.js`·`fx/rmAutotile.js`) | `'legacy'`(manifest 칸 이미지, `systems/terrainTiles.js`).
- 로드: `assets.js` `queueRmTiles()`. unity32이면 32x32 spritesheet 여러 장을 로드한다(manifest 밖, `?v=` 캐시 버스팅).
- 합성: `Battle.js:247~267`에서 `tileLayer` 컨테이너(가장 아래)에 `RmGround` → unity32이면 `UnityGround`(`fx/UnityGround.js`). 맵 전체를 칸당 32px로 캔버스에 한 번 그리고, 64x64칸 청크 텍스처로 만든다. NEAREST 필터, 표시 배율 = TILE/32. 수상 애니 4fps(250ms, 4프레임)는 해당 칸만 다시 그린다. 컨테이너 순서는 `tileLayer → propLayer → auraGfx → overlay → objLayer → cursor → unitLayer → worldFx`.
- 칸 결정: `data/unityPrefabs.js u32ComposeWithBuildings(map)`
  1. `tile_layer`(format `names-v1` + `index_map`)가 있으면 `u32TileLayer`: 칸마다 `index_map[names[rows[y][x]]]`를 그대로 놓는다. 이웃 판정·자동 프리팹·decor는 쓰지 않는다. 무효 인덱스는 지형 코드 폴백. `overlay[{x,y,name}]`는 투명 덧그림 1장.
  2. 없으면 `u32Compose`(지형 코드 → `u32Recipe` 해시 선택) + `lsPaint`(land_set 이웃 규칙) + 마을·성 프리팹 + decor.
- 전역 타일 인덱스 구간(`data/unityTileset.js`): 0~29 TileMap.png / 30~103 tileset_ext / 110~163 tileset_ext2 / 200~249 ws_static / 300~372 ws_anim(4프레임, stride 80) / 400~415 ws_building_ov / 420~425 ws_overlay(420~423 목표 깃발 애니) / 500~829 land_set(ls_static, 16열). `u32ValidIndex()`로 판정.
- 현재 tile_layer는 **단일 바닥 레이어 + overlay 1장**뿐이다. 건축물·오브젝트·전경 레이어는 없고, 지붕도 바닥 칸에 그려진다(유닛 아래).

### 1-4. 현재 구조의 제약 (교체 시 영향) [사실 + 판단]
1. 칸당 1장 직배치이고 회전은 90도 단위만이다(사용자 방침: 유니티 가이드, 런타임 오토타일 금지). 새 타일셋의 오토타일도 **오프라인에서 구워 tile_layer에 칠해야** 한다.
2. 마을 `v`는 통행 가능(1/10)인데 현재 지붕·벽 타일이 `v` 칸 위에 그려진다. 그래서 유닛이 지붕 위에 서는 모습이 된다(브리프의 "구조적으로 안 맞는" 사례에 해당).
3. `tileLayerFits`는 행 수와 **첫 행** 폭만 검사한다. 나머지 행의 폭이 틀린 경우는 검증기에서 따로 잡아야 한다.
4. `u32TileLayer`는 `format !== 'names-v1'`이면 null을 돌려준다. 그러면 지형 레시피가 폴백으로 쓰인다. 새 키를 추가할 때는 기존 키를 깨지 않는 **추가 방식**이어야 한다.

---

## 2. 맵 종류·개수와 대표 맵

### 2-1. DB 등록 맵 39개 [사실, 개발 DB 읽기 전용 조회]
| 그룹 | 개수 | 크기 | 용도 | tile_layer |
|---|---|---|---|---|
| 레거시(maps.json) | 9 | 16x12(river_01), 10x8(river_01_small, 예약), 20x14 ×5, 24x16 ×2 | stage_01~06, 방 기본 맵(`room_map_codes`), 시즌전(`battle_map_code` plain_01·mountain_01·castle_01) | 있음(unity32 이름) |
| 전장 프리셋 v2(pk_*) | 20 | 16x12 ×3, 24x16 ×10, 28x20 ×7 | 방 생성(solo/pvp 선택), ch18 몽골 초안 | 있음 |
| 임진 10(im_*) | 10 | 24x20 | ch1_s1~s10 캠페인 | 있음(water_set 포함) |

스테이지 연결(DB): stage_01=river_02, stage_02=plain_01, stage_03=forest_01, stage_04=plain_01, stage_05=desert_01, stage_06=castle_01, ch1_s1~s10=im_01~im_10.
기본(자유 대전·방 기본) 맵 = `MapCatalog::defaultMapId()` = id 최솟값 = **river_01**.
개발 DB 전투 수(테스트 포함, 노출 정도를 보는 참고값): river_02 84, im_01_okpo 50, river_01 40, plain_01 19, forest_01 11, pk_12 10, pk_17·pk_15 각 6, 나머지 5 이하.

### 2-2. 대표 맵 5개 현재 레이아웃 [사실: 지형 / 판단: 문제점]
DB `tiles`와 JSON이 같은지 5개 모두 확인했다(일치).

**① river_02 "큰 강 전장" 20x14: stage_01, 신규 유저의 첫 전투**
```
    01234567890123456789
  0 ppfpppppwwwwpppppfpp
  1 pppvppppbbbbppppvppp
  2 ppfppmppwwwwppmppfpp
  3 ppppppsssssssssspppp
  4 pcpppfppwwwwppfpppcp
  5 ppppppmpwwwwpmpppppp
  6 ppppppssbbbbsspppppp
  7 ppppppssbbbbsspppppp
  8 ppppppmpwwwwpmpppppp
  9 pcpppfppwwwwppfpppcp
 10 ppppsssssssssspppppp
 11 ppfppmppwwwwppmppfpp
 12 pppvppppbbbbppppvppp
 13 ppfpppppwwwwpppppfpp
```
- 중앙에 폭 4인 남북 강(x8~11)이 있다. 다리 3곳(y1, y6~7 폭 2, y12)과 여울 2줄(y3, y10)이 있다. 지휘관 스폰은 a(0,6)·b(19,7), 배치 영역은 각 42칸.
- 문제(브리프 기준): 성 `c`가 1칸짜리 4개라 구조물이 아니다. 마을 `v`도 1칸이다. 도로가 없어 다리·성·마을이 길로 이어지지 않는다. 숲 `f`·산 `m`은 1칸씩 흩어져 있다(군집 아님). 외곽 다리 y1·y12는 아무 곳에도 연결되지 않는다.

**② river_01 "강가 전장" 16x12: 자유 대전·방 기본 맵(id 1), rules second_atk_pct=2**
```
    0123456789012345
  0 ppfppppwwppppfpp
  1 pmpfpppwwpppfpmp
  2 cpppppbbbbpppppc
  3 ppfpvppwwppvpfpp
  4 cpfpppswwspppfpc
  5 ppppppsssspppppp
  6 ppppppsssspppppp
  7 cpfpppswwspppfpc
  8 ppfpvppwwppvpfpp
  9 cpppppbbbbpppppc
 10 pmpfpppwwpppfpmp
 11 ppfppppwwppppfpp
```
- 폭 2인 강, 다리 2개(y2, y9 폭 4), 중앙 여울 4x2. 지휘관은 a(0,5)·b(15,6).
- 문제: 가장자리 `c` 1칸 ×8(성벽 없음)과 단독 `v`. river_02와 같은 지형 종류(p w s b f m v c)라 **타일 매핑 하나로 두 맵을 함께 처리할 수 있다**.

**③ plain_01 "대평원" 20x14: stage_02·stage_04, 시즌전**
```
    01234567890123456789
  0 ppppppfffpppppppfppp
  1 pppvppppfppppppppppp
  2 ppppppppppffpppppppp
  3 ppfppppppppppppvpppp
  4 pppppppffppppppppfpp
  5 rrrrpppppppppppprrrr
  6 rrrrrrrrrrrrrrrrrrrr
  7 rrrrrrrrrrrrrrrrrrrr
  8 rrrrpppppppppppprrrr
  9 ppfppppppppffppppppp
 10 ppppvppppppppppppfpp
 11 ppppppppffpppppppppp
 12 pppppppppppfppppvppp
 13 pppfpppppppfffpppppp
```
- 폭 2인 가로 도로(y6~7), 양 끝에 4x4 도로 광장. 숲 소군집, 단독 마을 `v` 4개.
- 문제: 마을이 도로와 연결되지 않는다(브리프의 "길과 안 이어진 집"). 도로 끝 광장은 목적지가 없다.

**④ im_01_okpo "옥포해전" 24x20: ch1_s1, 캠페인 첫 맵, 해전**
```
    012345678901234567890123
  0 pppppdddoooooooooooooooo
  4 pppppdddooqooooooooooooo
  5 pppppdddqqqqqooooooooooo
  8 pppphhddoooooooooooooooo
  9 pppphhddoooooooooooooooo
 10 pppphhdooooooooooooooooo
 14 pppppddooooooooqqqqqoooo
 19 pppppddooooooooooooooooo   (나머지 행은 같은 패턴: 육지 x0~4, 모래 x5~7, 바다)
```
- 바다 69%(o 316). 서쪽 육지 띠, 모래 해안, 항구 `h` 2x3(x4~5, y8~10), 십자형 암초 2개. 스폰은 바다 위(a 4·b 4, 배치 각 10칸). 원본 `maps_imjin10_user_source.md`의 지형 변경은 **금지**(사용자 지시).
- 타일 쪽 관심사: 바다 애니, 해안 전이, 부두. 새 칩셋에 바다·암초·항구 타일이 있는지 SPEC에서 확인해야 한다.

**⑤ pk_12_central_keep "중앙 요새 쟁탈" 28x20: PvP 기본 등록, 프리셋 중 전투 수 1위**
```
    0123456789012345678901234567
  3 pppppvvvmmppppppppmmvvvppppp
  6 ppppppppppWWWccWWWpppppppppp
  8 ppppppmpppWpccccpWpppmpppppp
  9 ppppppppppcpccccpcpppppppppp
 13 ppppppppppWWWccWWWpppppppppp
 16 pppppvvvmmppppppppmmvvvppppp   (상하·좌우 대칭)
```
- 중앙 8x8 성벽 고리(W)에 4방 성문(c 2칸), 내부 성 바닥 4x4. 네 모서리에 3x3 마을과 숲 3x2가 있다. decor 10.
- 성벽·성문·마을 군집이 있어 **건축물 조립 검증의 기준 맵**으로 적합하다. 다만 마을 3x3 `v`(통행 가능) 위에 지붕을 그리는 문제(1-4의 2번)가 그대로 있다.

(참고: pk_01_plain_clash 16x12는 tag에 `tutorial`이 있고 meta에 "stage_01 후보"로 적혀 있다. 숲 2x2 군집 4개, 중앙 산 2칸, 마을 2x2 ×2.)

---

## 3. 새 타일셋 적용용 맵 데이터 레이어 스키마 제안

### 3-1. 원칙
1. **서버 판정의 단일 원천은 `tiles`(지형 코드)로 유지한다.** 타일·레이어는 시각 표현이고, 충돌·이동 레이어는 `tiles`에서 파생한 것을 검증하는 용도다. 엔진·RuleSet은 변경하지 않는다.
2. **추가만 한다**: 기존 `tile_layer`(names-v1, unity32)는 그대로 두고 새 데이터를 `tile_layer.v2`에 넣는다. 그러면 서버 저장·전달(`meta.tile_layer` 통째 전달)에 BE 변경이 필요 없고, 구 FE는 v2를 무시한다. `settings.terrainStyle = 'rm2003'`로 켜고 끄는 **교체 스위치**를 둔다(브리프의 "교체 스위치 가능하게").
3. 오토타일은 오프라인에서 굽는다. RM2003 칩셋의 오토타일(8x8 쿼터 조합으로 추정 [가설])은 생성기가 47/16형 변형을 미리 조립한 시트로 만들고, 맵에는 완성 타일 ID만 칠한다(런타임 이웃 판정 금지 방침 유지).
4. 해상도: 원본이 16x16이면 [가설: 966x520 = 2px 테두리 + 480x256 패널 4장, RM2000/2003 칩셋 규격과 일치. SPEC으로 확정 필요] **최근접 2배 = 32px**로 맞춘다. 그러면 현재 `U32_PX = 32` 합성 파이프라인(UnityGround, NEAREST, 정수 배율)을 그대로 쓸 수 있다.

### 3-2. 스키마 (`tile_layer.v2`, format `layers-v1`)
```jsonc
"tile_layer": {
  "format": "names-v1", ...기존 unity32 그대로...,
  "v2": {
    "format": "layers-v1",
    "tileset": "rm2003_v2",              // 안아트 SPEC의 시트 ID
    "src_px": 16, "tile_px": 32,
    "names": ["grass_a", "water_47_255", "house_roof_L", ...],   // 논리명(SPEC 타일 ID와 1:1)
    "index_map": { "grass_a": 1000, ... }, // 전역 인덱스: 1000번대 신규 구간(기존 0~829와 겹치지 않음)
    "layers": {                            // 모두 H행 x W열, 공백 구분 names 인덱스, -1 = 빈 칸
      "ground":     ["..."],   // 지형 바닥(불투명, 빈 칸 금지). 전이·해안·도로 오토타일 포함
      "building":   ["..."],   // 다타일 건축물 몸체(벽·문·성벽·성문·다리 난간). 유닛 아래
      "object":     ["..."],   // 소품(통·상자·울타리·우물·묘목·바위). 유닛 아래, 군집 배치
      "foreground": ["..."]    // 유닛 위(지붕 처마·성벽 윗단·나무 수관 끝). 통행 가능 칸 위에는 금지(검증기 V7)
    },
    "anim": { "1500": { "frames": [1500, 1501, 1502, 1501], "ms": 250 } }, // RM 수면 3프레임 왕복 = 4스텝 [가설]
    "structures": [   // 건축 규칙 검증용 논리 오브젝트(렌더에는 쓰지 않음)
      { "id": "house_01", "kind": "house", "x": 3, "y": 1, "w": 4, "h": 4,
        "door": [5, 4], "front": [5, 5], "footprint": "W", "zone": "village_w" }
    ],
    "zones": [ { "id": "village_w", "kind": "village", "rect": [2, 0, 7, 6], "purpose": "서측 주거·우물" } ],
    "collision": "derived:tiles",   // 이동·충돌 = tiles 지형 코드(서버 판정). 별도 저장하지 않음
    "generator": "docker/maps/gen_tilemap_v2.py", "validated": "2026-11-xx"
  }
}
```
- 렌더 순서(FE 요청 사항): ground → building → object → (propLayer·overlay·objLayer·cursor) → unitLayer → **foreground**(새 컨테이너, unitLayer 위) → worldFx.
- 크기: 28x20 맵 기준 4레이어 약 12~18KB/맵 [추정]. meta JSON 저장에는 문제없다.

### 3-3. 기존 지형 코드 호환 방안
| 단계 | 내용 | `tiles` 변경 | 승인·재측정 |
|---|---|---|---|
| **A. 리스킨** | 기존 `tiles`를 그대로 두고 새 타일로만 칠한다. 지형 코드별 타일 계열을 매핑하고, 구조물은 `tiles`가 허락하는 범위에서만 조립 | 없음 | 밸런스 영향 없음. `game:map-check` 결과 불변 |
| **B. 재설계** | 브리프 수준의 공간 설계(성벽 고리·마을 군집·도로 연결). 1칸짜리 성·마을 정리 등 | 있음 | 임밸런 재측정(`game:map-check --strict`, 시뮬 승률), 스테이지 맵은 사용자 승인 |

지형 코드 → 타일 계열 매핑(초안, **SPEC 확정 후 갱신**. 패널 구분은 브리프의 "좌상 기본 필드/성/가구, 우상 용암·눈·동굴, 좌하 필드·눈·숲, 우하 성벽·목조·농지·정원" 기준 [가설]):

| 코드 | 바닥(ground) | 건축·오브젝트·전경 | 비고 |
|---|---|---|---|
| plain | 풀 오토타일 + 변형 | 꽃·풀 소품(object, 저밀도) | |
| forest | 짙은 풀 바닥 | 나무 군집(object). 수관은 ground/object에 둔다(숲은 통행 가능이라 foreground 금지) | 브리프: 숲은 군집 |
| mountain / cliff / hill | 바위·절벽 오토타일(높이 단) | 절벽 윗단은 foreground 가능(불가 칸일 때만) | hill 타일 유무 확인 필요 |
| water / shallows / sea | 물 오토타일(애니), 여울 = 얕은 물 계열 | 연잎·갈대 object | 바다 깊이 구분 확인 필요 |
| bridge | 물 바닥 | 다리 판자·난간(building) | 양 끝이 육지·도로와 이어져야 함(V6) |
| road | 흙길 오토타일 | | 목적지(성문·문·광장)로 연결(V6) |
| castle | 석재 바닥 | 성문(building) = `c` 칸, 성벽 사이 | |
| wall | 성벽 몸체(building) | 성벽 윗단(foreground, 불가 칸이라 허용) | 끊긴 성벽 금지(V4) |
| village | 마을 마당 바닥(흙·포석) | 집 정면(문)·우물·울타리(building/object) | 아래 "마을 정책" 참고 |
| snow_desert | 설원/사막(biome) | 눈 덮인 나무·선인장 [유무 확인] | |
| swamp / reef / harbor / sand / void / rift_plank | SPEC에서 대응 타일 확인 | | **없으면 부족 타일로 보고하고 임의 제작하지 않음**. 해당 칸은 기존 unity32 타일로 폴백(셀 단위 혼용 허용 여부는 FE 결정) |

**마을 정책(중요)**: 단계 A에서는 `v` 칸이 통행 가능하므로 집 몸체를 `v` 칸에 올리지 않는다. `v`는 "마을 마당" 바닥과 문·우물·울타리 같은 낮은 오브젝트로 표현하고, 집 몸체는 인접한 통행 불가 칸(W·m 등)이 있을 때만 그 칸에 조립한다. 단계 B에서는 **집 몸체 = `W`(불가), 문 앞·광장 = `v`**로 재설계할 것을 제안한다(pk_15 v2가 이미 "마을=v, 성벽=W" 규약을 쓰고 있다). 이 경우 heals·방어 보정 칸 수가 바뀌므로 임밸런 재측정이 필요하다.

### 3-4. 필요한 FE·BE 변경 요청 (맵디자이너는 엔진·JS를 수정하지 않음)
- **[요청: 윤프론]** ① `unityTileset.js`에 rm2003 시트 구간(전역 1000번대, 애니 1500번대) 추가와 `u32ValidIndex`·`u32Src` 분기 ② `tile_layer.v2`가 있고 `terrainStyle === 'rm2003'`이면 레이어 4장을 합성(UnityGround 확장, ground+building+object는 기존 청크 캔버스에, foreground는 unitLayer 위 별도 청크) ③ v2가 없는 맵은 기존 names-v1로 폴백. 검증: 대표 맵 실화면 스크린샷(강화면), 폴백 칸 0, 4fps 애니 유지, 28x20 합성 시간 기존 대비.
- **[요청: 박백엔, 낮음]** `GameData::tileLayerFits`가 모든 행의 폭을 검사하도록 하는 것. 그리고 v2를 넣은 뒤 `game:seed-maps-pack --dry-run`과 `MapTileLayerTest` 통과 확인. 추가 키만 있는 변경이라 필수는 아니다.
- **[요청: 안아트]** SPEC에 타일별 ① ID ② 레이어 구분(RM 하층/상층, 별표 = 유닛 위 여부) ③ 오토타일 연결 규칙 ④ 허용 지형 코드 ⑤ 다타일 구조물 묶음(지붕·벽·문 조합)을 적어 달라는 것. 매니페스트 병합은 `merge_fragments.mjs`로만 한다.

### 3-5. 검증 스크립트 목록 (계획, `docker/maps/` 아래 신규. 기존 파일은 수정하지 않음)
| ID | 스크립트 | 검사 |
|---|---|---|
| V1 | `validate_tilemap_v2.py --check index` | 모든 레이어가 H x W(**전 행**), names·index_map의 ID가 SPEC에 실재, ground 빈 칸 없음, 애니 프레임 ID 실재 |
| V2 | `... --check terrain` | 칸 타일의 허용 지형 코드에 그 칸의 `tiles` 코드가 포함되는지(예: 물 타일은 w/s/o만, 가구는 c/v 실내만) |
| V3 | `... --check edges` | 오토타일 이웃 경계 서명 일치(해안·도로·절벽 이음 끊김 없음) |
| V4 | `... --check buildings` | structures: 지붕·벽·문 완결, 문 1개 이상, 문 앞 칸 통행 가능, 문 앞이 도로·광장과 연결, 성벽 고리 연속 + 성문 존재, footprint 지형 코드 정합 |
| V5 | `... --check objects` | 오브젝트 허용 지형(물 위 가구 금지, 잔디 위 촛대 금지), 구역별 밀도 상한, 주 동선 위 차단 소품 금지 |
| V6 | `... --check paths` + 기존 `php artisan game:map-check --strict` | 지휘관 간 도달(병종별), 고립 칸 0, 배치 영역 통행, 다리·계단 양 끝 연결, 도로 끝 목적지 존재. meta.contact·choke 재계산(단계 B) |
| V7 | `... --check foreground` | foreground가 통행 가능 칸을 덮지 않음(유닛 가림 방지) |
| V8 | `render_tilemap_v2.py` | 미리보기 PNG(1x·2x), 지형 코드·충돌 격자 오버레이 비교본, 구 타일 대비 전후 비교 PNG |
| V9 | 기존 `docker/maps/gen_tile_layers.py check`, `tests/Feature/MapTileLayerTest.php`, `game:seed-maps-pack --dry-run` | 기존 names-v1 무결성 회귀(v2 추가 후에도 통과) |
| V10 | node 순수 함수 검사(FE 구현 후) | `u32TileLayer` 계열 폴백 칸 0·경고 0 |

편집 원본은 `docker/maps/tilemap_v2/<code>.layers.json`에 두고, 생성기가 데이터 JSON의 `tile_layer.v2`로 병합한다. 병합 전에는 `<파일>.bak-tilemapv2-<날짜>`로 백업한다.

---

## 4. 제작 우선순위 (첫인상 맵 우선)

| 순위 | 맵 | 이유 | 단계 |
|---|---|---|---|
| 1 | **river_02**(stage_01) | 신규 유저 흐름 "생성 → 프롤로그 → stage_01"의 첫 전투. 전투 수 1위 | A(리스킨) 먼저, B 제안서 별도 |
| 2 | **river_01**(자유 대전·방 기본 맵) | 기본 선택 맵. 지형 종류가 river_02와 같아 매핑을 공유(추가 비용 작음) | A |
| 3 | **im_01_okpo**(ch1_s1) | 캠페인 첫 맵. 지형 변경 금지 맵이라 A만 가능. 바다·해안·항구 타일 유무에 좌우됨 | A(타일 부족 시 부분 폴백) |
| 4 | plain_01(stage_02·04, 시즌전) | 두 번째 스테이지. 도로 오토타일 검증용 | A → B(마을-도로 연결) |
| 5 | pk_12_central_keep | PvP 노출 1위. 성벽·성문·마을 조립 규칙(V4)의 기준 맵 | A |
| 6 | forest_01(stage_03) → desert_01·castle_01(stage_05·06) | 스테이지 순서 | A |
| 7 | pk_* 나머지(전투 수 순: pk_17, pk_15, pk_10, pk_01 ...) | 방 선택 | A |
| 8 | im_02~im_10 | 서가(void·rift_plank) 타일이 칩셋에 없을 가능성이 높음 [가설] | SPEC 확인 후 |
| 보류 | river_01_small(예약, 미연결), mountain_01·swamp_01 | 노출 낮음. 늪 타일 유무 확인 필요 | |

진행 순서: (0) SPEC 도착 → 타일 ID·연결 규칙 실측 확인(좌표 추측 금지) → (1) 지형 코드 → 타일 매핑표와 부족 타일 목록 확정 → (2) 생성기·검증기 V1~V8 작성 → (3) river_02 파일럿(리스킨) 미리보기 PNG와 검증 결과 → (4) FE 연동 요청(윤프론) → 강화면 실화면 검증 → (5) river_01·im_01 순으로 확대. 단계 B 재설계안은 임밸런 재측정과 사용자 승인 뒤에 진행한다.

## 5. 확인하지 않은 것·남은 제약
- 새 타일셋의 실제 격자·ID·오토타일 구조(SPEC 미완성). 16px·패널 4장은 `measure_result.json` 일부와 브리프에서 나온 가설이다.
- 실화면 렌더는 보지 않았다(이번 임무는 읽기 전용). 1-4절의 "지붕 위 유닛" 문제는 코드 구조로 추론한 것이다.
- 전투 수는 개발 DB 값(테스트·에이전트 플레이 포함)이라 실제 유저 노출과 다를 수 있다.
- 라이선스: RPG Maker 2003 칩셋은 제3자 저작물일 수 있다. 공개 전에 확인할 메모로만 둔다(개발 비차단).

---

## 6. 파일럿 결과 — tile_layer.v2 + river_02·im_01_okpo 재설계 (맵디자이너, 2026-11-02)

표기: [사실] 실행·파일로 확인 / [가설] 미확인 / [요청] 다른 담당 변경 필요.

### 6-1. 반영 방식과 되돌리기 [사실]
- 편집 원본: `docker/maps/tilemap_v2/<code>.design.json`(paint 덧칠·objects·structures·zones·routes). 도구: `docker/maps/tilemap_v2/tmv2.py`(build·validate·render·apply·revert·all).
- 산출: `<code>.layers.json` = `tile_layer.v2`(format `layers-v1`, 레이어 ground/building/object/foreground, -1 = 빈 칸, 충돌 = `derived:tiles`).
- 데이터 반영(`apply --write`): 데이터 JSON의 `tile_layer`를 **ground 레이어를 평탄화한 names-v1**로 바꾸고 `tile_layer.v2`를 그 안에 같이 넣는다. 현재 엔진(`u32TileLayer`)은 names-v1만 읽고 `v2` 키는 무시한다. 이전 names-v1은 `<code>.prev_v1.json`에 보관한다.
- 되돌리기: `python -I docker/maps/tilemap_v2/tmv2.py <루트> revert <code> --write` 후 재시드. 또는 백업 `database/data/maps.json.bak-mapdes-20261102`, `maps_imjin10.json.bak-mapdes-20261102` 복원.
- 런타임 스위치 `settings.set({terrainTv2:false})`: 파일럿 두 맵의 tv2 이름 칸(1000번대)은 무효가 되어 **지형 코드 기본 타일로 폴백**한다(이전 모습으로 돌아가지 않음). `peak_full`·`reef_*` 같은 레거시 이름 칸만 기존 타일로 돌아간다. 이전 모습으로 완전히 되돌리려면 위 revert를 쓴다.
- DB 반영은 하지 않았다. 게임 화면에 보이려면 `game:seed`(maps.json, tile_layer 키만 보충)·`game:seed-imjin10`이 필요하다.

### 6-2. 지형 불변 [사실]
- 두 맵 모두 `tiles`·`spawns`·`deploy_zones`가 백업과 같다(V8). 적 배치 칸(stage_01 v3 6칸, ch1_s1 v3 5칸)은 모두 통행 가능한 칸이고 오브젝트를 올리지 않았다. **이동 가능/불가 칸 변경 0, 비용·방어 변경 0** → 임밸런 재측정은 필요 없다.
- 길(R)·밭(A)·장터(O)는 평지 `p` 위의 시각 표현이다. `p`와 `r`은 모든 병종에서 비용·방어가 같지만, 지형 코드는 바꾸지 않았다. 그래서 툴팁에는 '평지'로 나온다.

### 6-3. paint 코드 → 타일 (ID 매핑)
| paint | 지형 코드 | ground 이름 | 전역 인덱스 |
|---|---|---|---|
| g | p | grass_a | 1000 |
| R 흙길 / A 밭 / O 자갈 마당 / C 초소 석단 / F 숲 / S 모래 / Y 여울 | p / p / v·p / c / f / d / s | dirt47_m / farm47_m / cobble47_m(고립 = cobble_single) / castlefloor_single / forest47_m(고립 = forest_single) / sand47_m / sand47_m | tv2_names.json 그대로(1000~1618) |
| W 물·바다 | w, o | water47_m (애니) | 1700~1746 |
| B 다리 | b | plank_v(동서 통행), plank_h_b(남북) | 1000번대 |
| K 선소 데크 | h | woodfloor_a / woodfloor_b 교대 | 1000번대 |
| M 바위산 | m | peak_full(레거시 이름) | tv2 on + rg = 1588, off = 18 |
| Z 유지 | q | 원래 reef_a~d | 302~305(ws_anim) |
- m = 47형 마스크(`landPaint.js red()` 규칙, 맵 밖 = 같은 지형). 이음 규칙(JOIN): 물 = 물·다리·암초·여울·모래, 길 = 길·다리·석단·마당·데크·여울, 여울 = 물·다리·길, 모래 = 모래·데크·물.
- 오브젝트(칩셋 키, 아직 굽지 않음, 미리보기 전용): C:87·D:382 우물, D:318 봉화, D:440 이정표, D:349 장작, D:177 통, D:202·D:203 상자.

### 6-4. 구역·동선
**river_02**(stage_01): 강(x8~11)을 사이에 두고 점대칭 구조다.
- 대로(폭 2): 서 진영(0~5,6~7) → 모래톱 → 중앙 다리 → 동 진영. 주 교전 병목은 중앙 다리이고, 바위산 4개가 양쪽 어깨 역할을 한다.
- 강변길 x3·x16: 남북을 잇는다. 마을 마당, 북·남 여울 연결로, 초소 지선, 대로와 십자로로 만난다.
- 북·남 다리: 양쪽 마을 마당을 잇는 측면로다.
- 초소 4곳(c)은 지선 끝의 석단과 봉화로 표현했다. 마을 4곳(v)은 자갈 마당에 우물과 밭을 붙였다.
- 여울 2줄은 모래톱으로 강을 가로지르게 했다(물과 이음선 없이 맞붙음). 서쪽 끝은 연결로(4~5,3)에, 동쪽 끝은 강변길에 닿는다.

**im_01_okpo**(ch1_s1): 서쪽 육지는 배경이다.
- 해안 길(x2, 선소 앞 x3로 꺾임)이 북쪽 맵 밖에서 남쪽 맵 밖까지 이어진다.
- 선소(h 2x3)는 목재 데크이고, 길과 바로 붙어 있으며 앞은 해변이다. 맞은편에 자갈 장터(1~2,8~10)가 있다.
- 밭은 북 2x4, 남 2x3+1 두 곳이다. 해변 모래는 바다와 직접 맞붙는다. 바다와 암초는 지형 그대로다.

### 6-5. 검증 (tmv2.py validate)
V1 인덱스(전 레이어·전 행 크기, 엔진 해석 인덱스 유효, 칩셋 키 실재), V2 지형 정합(지형 코드별 허용 paint: 물 그림은 w/o에만, 숲 그림은 f에만 등), V3 47형 이음 재계산 일치, V4 구조물 출입구(통행 가능하고 길·광장에 면함)·다리 양끝(통행 가능하고 길에 닿음)·막다른 길 금지, V5 오브젝트 허용 지형·동선(길·다리) 위 금지·목적 필수·구역 밀도 상한·시작 유닛 칸 경고, V6 병종별 지휘관 간 도달·고립 통행 칸·배치/적 칸 통행, V7 통행 가능 칸 위 전경 금지, V8 tiles·spawns·deploy_zones 백업 대비 불변.
결과: 두 맵 모두 오류 0, 경고 0. 회귀 테스트 `MapTileLayerTest`·`TerrainAndMapCheckTest` 4개 통과(앱 컨테이너).

### 6-6. 남은 제약·요청
1. **여울 전용 타일 없음**: 지금은 모래톱으로 근사했다. 통행 가능하다는 점은 잘 보이지만, 물(방어 -10, 수병 통행)이라는 느낌은 약하다. **[요청: 안아트]** 같은 칩셋 픽셀로 `ford47`(sand47 바탕 위에 water_A 수면을 반투명으로 겹치고 물결 하이라이트를 유지, 47형 + 3프레임)을 구워 달라. 강 본류(water47)보다 명도는 높고 채도는 낮게 해서, 이전 검증의 '채도 높은 하늘색' 문제를 피한다. 구워지면 `FAMILY['Y']`만 바꾸면 된다.
2. 모래 물가 물이 없다. 그래서 해변이 바다와 칸 경계로 직선으로 맞닿는다(계단형). 암초는 기존 water_set 타일이라 tv2 바다 위에 하늘색 테두리가 보이고, (8,5) 칸에는 풀 조각이 남는다. 부족 타일: 모래 물가, 암초.
3. 숲·산·마을이 1칸씩 흩어진 문제(군집 숲)는 지형 코드를 바꾸지 않으면 해결할 수 없다. 숲 군집화는 3-3절 B단계(임밸런 재측정과 사용자 승인)로 남긴다.
4. (2026-11-03 8-2절로 대체: v = 집 그림) 마을 `v`는 집 없이 마당(자갈) + 우물로만 표현했다(3-3 마을 정책: 통행 가능 칸에 집 몸체를 올리지 않음). 엔진 화면에는 우물이 아직 보이지 않는다.
5. **[요청: 안아트]** 오브젝트 칩셋 타일 7종(6-3절)을 tv2 시트 1619번부터 투명 오브젝트로 굽기. **[요청: 윤프론]** `tile_layer.v2.layers`의 building·object(유닛 아래)와 foreground(unitLayer 위)를 합성하고, tv2 static count를 늘린 구간을 등록하기. 검증은 강화면이 `preview/<code>_full_x2.png`와 실화면을 비교한다.
6. `docker/maps/gen_tile_layers.py check`는 tv2·land_set 구간을 모르기 때문에 파일럿 두 맵을 오류로 낸다(river_02 176, im_01 441, 나머지 맵 0). 또 `imjin` 모드로 `--write`하면 im_01의 tile_layer를 덮어쓸 수 있다. 이 도구를 다시 실행할 때는 tmv2.py `apply`를 다시 해야 한다.
7. 실제 브라우저 화면은 확인하지 않았다. 미리보기는 `u32TileLayer`의 조회 순서(tv2 표 → 재바탕 표 → 맵 index_map)를 Python으로 흉내 낸 렌더다. PropLayer의 무작위 소품(여울 갈대, 평지 풀꽃)은 미리보기에 없다.

## 7. 3단계 확장 타일 반영 — ford47·sandwater47·tv2reef·오브젝트 (맵디자이너, 2026-11-02)

근거 자료: 안아트 `public/assets/tiles/tileset_v2/tv2_ext_mapping.json`, `tileset_v2_map.json`(`index_map_ext`·`chip_index`·`ranges_ext`), `docs/TILESET_V2_SPEC.md` 9절.

### 7-1. tmv2.py 변경 [사실]
백업: `docker/maps/tilemap_v2/tmv2.py.bak-mapdes2-20261102`
- `FAMILY['Y'] = 'ford47'`. 여울은 모래톱 대용을 끝내고 전용 47형 애니 타일을 쓴다.
- `SHEETS`에 `tv2_anim2`(16열)를 추가했다. `src()`는 `i >= 1800`일 때 `('tv2_anim2', (i-1800) + f*112)`로 분기하며, 이 분기를 맨 앞에서 판정한다.
- `fe_valid` tv2 유효 구간: 1000~1625, 1700~1747, 1800~1897.
- `engine_index()`: tv2가 켜져 있으면 `index_map_ext`를 먼저 조회한다(암초 `reef_a~d` → 1894~1897). BEFORE 렌더(`render_old`)는 확장 이전 해석(`use_ext=False`)을 유지한다.
- `build()`: `cs:<키>`를 `chip_index`로 해소한다. 두 맵 모두 `pending_bake`가 0이다. `render_layers`는 해소된 인덱스로 tv2 시트에서 그린다.
- 모래 물가:
  - `JOIN['W']`에서 `S`를 뺐다. 물이 모래를 다른 지형으로 보고 테두리를 그린다.
  - `JOIN['S']`에 `Z`를 더했다. 모래가 암초 쪽에 풀 테두리를 그리지 않는다.
  - `ground_names()`에서 W 칸의 8방 이웃에 S가 있으면 패밀리를 `sandwater47`로 쓴다.
- V1 검사: 칩셋 해소 인덱스도 유효 구간인지 확인한다. V8 검사: 백업 `.bak-mapdes-20261102`·`.bak-mapdes2-20261102` 둘 다와 비교한다.

### 7-2. 데이터 반영 [사실]
- `database/data/maps.json`(river_02)과 `maps_imjin10.json`(im_01_okpo)은 `tile_layer`만 교체했다. 파싱 비교 결과 두 파일 모두 바뀐 키가 해당 항목의 `tile_layer` 하나뿐이다.
- 백업: `*.bak-mapdes2-20261102`. 되돌리기 원본 `<code>.prev_v1.json`(1차 파일럿 이전 names-v1)은 그대로다.
- river_02: ground 이름에 `ford47_68/95/124/199/245/255`가 새로 들어갔다(1800번대).
- im_01_okpo: ground 이름에 `sandwater47_7/28/31/127/223`이 새로 들어갔다. `reef_a~d`는 레거시 이름이 그대로라 맵 index_map 값도 기존 값(ws_anim)이다. tv2가 켜져 있으면 `index_map_ext`로 1894~1897이 된다.
- 지형 코드·스폰·배치는 바뀌지 않았다(V8). 개발 DB에는 반영하지 않았다(팀장 → 박백엔).

### 7-3. 검증 [사실]
- `tmv2.py all`/`validate`: river_02, im_01_okpo 모두 V1~V8 오류 0, 경고 0, 미베이크 0. 1800·1846·1893·1897·1619·1625 인덱스는 4프레임 모두 빈 타일이 아니다.
- 미리보기: `docker/maps/tilemap_v2/preview/<code>_{engine_x2,full_x2,grid,compare}.png`. 이전 미리보기는 `preview_prev_mapdes2/`에 보관했다.
- 혼합 칸은 수동으로 확인했다(4배 확대).
  - river_02 여울 ↔ 강 본류: 이음선 없이 맞붙는다. 여울 ↔ 다리·흙길 경계는 자연스럽고, 여울 위아래 풀 테두리도 정상이다.
  - im_01_okpo 모래 해변 ↔ 바다: 풀 띠가 없어지고 모래 물가 테두리가 생겼다.
  - 오브젝트(우물·봉화·이정표·장작·통·상자)는 full 미리보기에서 지형·용도와 맞는다.

### 7-4. 남은 제약·요청
1. im_01_okpo (8,5) 암초 칸이 모래 (7,5)와 직접 맞닿는다. 암초 타일 바탕이 깊은 물(water47_255)이라 모래와 수직 직선 경계가 생긴다(1칸). 데이터로는 고칠 수 없다(q 칸 paint는 Z만 허용). **[요청: 안아트, 선택]** 모래 물가용 암초 변형(sandwater47 바탕)을 구워 주면 `index_map_ext` 대신 칸별 이름으로 쓸 수 있다.
2. 해변이 계단형인 것은 지형 코드(d/o 경계)가 계단형이기 때문이다. 타일 문제가 아니므로 지형을 바꾸지 않았다.
3. **[윤프론]** FE가 아직 1800번대(`tv2_anim2`)와 `index_map_ext`를 지원하지 않으면, 반영된 두 맵의 여울·모래 물가 칸이 무효 인덱스가 되어 지형 코드 기본 타일로 폴백한다(예상). 개발 DB 시드는 FE 연동과 함께 진행하는 것을 권장한다. 오브젝트 레이어는 FE 합성 전까지 화면에 나오지 않는 것이 정상이다.
4. 6-6절 1·2·5번 중 타일 굽기 부분은 해소됐다. FE 레이어 합성은 남아 있다. 실제 브라우저 화면은 확인하지 않았다(강화면 몫).

## 8. v2 적용 현황 25맵 + 마을 집 그림·river_02 여울 이음 (맵디자이너, 2026-11-03)

표기: [사실] 실행·파일로 확인 / [판단] 설계 판단 / [요청] 다른 담당 변경 필요. 개발 DB 시드는 하지 않았다(박백엔 몫).

### 8-1. 적용 현황 [사실]
데이터 JSON 39맵 중 25맵의 `tile_layer`가 tmv2.py 산출물(names-v1 평탄화 + `v2` 키)이다. 25맵 모두 `validate` 오류 0, V8(tiles·spawns·deploy_zones 불변) 통과.

| 파일 | 적용 맵 |
|---|---|
| maps.json (6/9) | river_02, plain_01, swamp_01, castle_01, desert_01, forest_01 |
| maps_imjin10.json (10/10) | im_01_okpo ~ im_10_last_seoga 전부 |
| maps_pack20_v2.json (9/20) | pk_01, pk_04, pk_08, pk_09, pk_13, pk_14, pk_16, pk_17, pk_20 |

### 8-2. 이번 변경 (2026-11-03) [사실]
백업 태그 `.bak-mapv2c-20261103`: `tmv2.py`, 전 `*.design.json`·`*.layers.json`, `database/data/maps.json`·`maps_imjin10.json`·`maps_pack20_v2.json`, 이 문서. 이전 미리보기는 `docker/maps/tilemap_v2/preview_prev_mapv2c/`.
1. **마을(v) = 집 그림.** 6-6절 4번(자갈 마당 + 우물) 정책을 바꿨다. `DEFAULT_PAINT['v'] = 'Z'`(원래 names-v1 집 타일 유지), `PAINT_ALLOWED['v'] = ZOL`. design의 v 칸 명시 `O`를 기본(`.`)으로 되돌렸다. 각 design에 `_v_policy` 메모.
   - 집 타일 재활용: `house_small`(tv2 on = 재바탕 rg 1587, tv2 풀 바탕) / 2칸 높이 한옥 `roof_bot_L·C·R` + `wall_L·R·window·door`(레거시 82~91, 칸 전체가 그림이라 풀 이음 문제 없음). tv2 칩셋에 집 오브젝트가 없어 새 오브젝트는 쓰지 않았다.
   - **정책 예외(명시)**: v는 통행 가능(방문·점령) 칸인데 집 몸체를 ground에 그린다. 근거: SRPG 관례상 마을 칸 = 집 칸, 유닛은 ground 위에 그려지므로 가리지 않는다(foreground 아님, V7 대상 아님). 집 칸 주변 자갈·판석 마당 칸(p 위 덧칠)은 그대로 둬서 집이 풀밭에 떠 보이지 않게 했다.
   - 대상 11맵: castle_01, plain_01, river_02, swamp_01, pk_01, pk_04, pk_09, pk_13, pk_14, pk_16, pk_20.
   - castle_01: 병영 칸(1,4)(22,4)(1,11)(22,11)이 마당(O)에서 집으로 바뀌어 V4 출입구 검사(앞이 길·광장)가 오류 4건을 냈다 → 각 집 앞 2칸(p)을 판석(L) 오솔길로 덧칠해 안뜰 석단과 이었다. 구조물 purpose 갱신.
2. **river_02 여울 이음 보정**(강화면 지적: 경계 전환 없는 밝은 청색 사각형). design `join_override = {"Y": "YWBZESX"}` — 여울이 흙길(R)을 다른 지형으로 보고 풀 둑 테두리를 그린다. 길(R)은 여울과 계속 이어져 물가까지 닿는다. 물(W)·다리(B)와의 이음은 유지. 대칭 분리(R도 Y 분리)는 길이 물가 전에 끊겨 보여 기각. tmv2.py `ground_names()`에 맵별 `join_override` 지원을 추가했다(다른 맵 영향 없음, 24맵 layers 동일 확인).
3. 데이터 반영: maps.json 4맵·maps_pack20_v2.json 7맵의 `tile_layer`만 교체. 파싱 비교로 최상위 키·항목 순서 동일, `tile_layer` 외 변경 0. maps_imjin10.json은 변경 없음(v 칸 없음).

### 8-3. 경고 (오류 아님) [사실 + 판단]
| 맵 | 경고 | 내용 |
|---|---|---|
| castle_01 | 8 | 도로망 조각(병영 앞 석단·판석 조각이 가장자리 미접). 성채 안뜰 구조상 정상 [판단] |
| plain_01 | 2 | 이번 신규: 집 옆 자갈 마당 L자 조각이 집(목적지 1곳)에만 닿음 |
| pk_14_twin_rivers | 2 | 이번 신규: 중앙 집 좌우 흙길 조각이 집·여울 사이에서 끝남 |
| swamp_01 | 14 | 늪 섬 둑길 조각·기병/중보병 고립 칸(지형 결함, known_isolated 포함) — 이전과 동일 |
| pk_09_swamp_detour | 5 | 늪 중앙 둑길 조각·기병/중보병 고립 8칸 — 이전과 동일 |
| im_08_seoga_collapse | 5 | 서가 발판 조각·알려진 고립 칸(4,14) — 이전과 동일 |
| im_10_last_seoga | 4 | 서가 발판 조각 4 — 이전과 동일 |
| im_02_jeongamjin | 2 | 모래톱 도하 길 조각 — 이전과 동일 |
| im_06_haengju / pk_17 | 1 / 1 | 도로망 조각 — 이전과 동일 |
| 나머지 15맵 | 0 | |

### 8-4. 미적용 14맵 [사실: 지형 구성 / 판단: 난점]
| 맵 | 크기 | 특이 지형 | 난점 |
|---|---|---|---|
| river_01, river_01_small, pk_02_ford_small, pk_05_forest_ambush, pk_07_oasis, pk_19_lake_loop | 10x8~24x16 | 일반(p f w s b v m n) | 기존 paint로 가능. 미착수 |
| mountain_01, pk_03_narrow_gorge, pk_11_mountain_pass | 16x12~24x16 | 절벽 k 20~32칸 | tv2 절벽 없음 → Z(레거시) 유지, 바위산 peak_full과 혼재 |
| pk_15_village_war | 28x20 | 마을 v 43칸 | 집이 덩어리로 이어짐 → 다칸 한옥 조립 규칙 필요 |
| pk_10_coast_isles | 28x20 | 바다 w 120칸·섬 | 가능. 섬 해변 모래 물가 손질 필요 |
| pk_06_fortress_siege, pk_12_central_keep, pk_18_wall_breach | 28x20 | 성벽 W 16~32·성 c 24~28 | 조선 성곽·성문 tv2 부재 → Z 유지(castle_01·im_04~06 방식) |

### 8-5. 안아트 요청 목록 [요청]
1. **집 오브젝트(tv2 칩셋 톤)**: 1칸 초가/기와 단독(house_small 대체)과 2칸 높이 한옥 조립 세트(지붕 위·아래 L/C/R, 벽 L/R/창/문). 지금은 레거시 타일(1587, 82~91) 재활용이라 tv2 풀·길과 화풍이 약간 다르다. pk_15(v 43칸) 적용 전 필요.
2. **조선 성곽·성문·여장 47형(또는 조립 세트)**: W/c 칸이 Z(레거시) 유지 중(castle_01, im_04~06, 미적용 pk_06·12·18).
3. **절벽 k 타일(47형 또는 가장자리 세트)**: 미적용 mountain_01·pk_03·pk_11.
4. **여울-흙길 전환**: ford47 테두리가 풀 둑뿐이라 길과 만나는 쪽에 풀 띠가 생긴다. 흙 둑 변형(ford 가장자리 흙)이 있으면 river_02·pk_14·pk_20의 길-여울 경계가 더 자연스럽다.
5. **여울-늪 전환**: swamp_01·pk_09에서 여울이 늪과 이음 없이 직선으로 맞닿아 사각형으로 보인다.
6. (7-4절 유지) 모래 물가용 암초 변형(sandwater47 바탕).

### 8-6. 남은 어색한 점·미확인 [판단]
- pk_14·pk_20의 1~2칸 폭 여울(길과 다리 사이)은 river_02와 같은 '밝은 사각형' 경향이 있다. river_02 방식(`join_override`)을 pk_14에 시험했으나 1칸 폭 여울이 웅덩이처럼 보여 오히려 어색해 되돌렸다(안아트 4번 요청 후 재검토).
- 2칸 한옥(pk 맵)은 지붕 아래(roof_bot) + 벽 두 줄만 있어 지붕 윗부분이 없다(원래 데이터 그대로).
- 실제 브라우저 화면은 확인하지 않았다(강화면 몫). 미리보기는 `u32TileLayer` 조회 순서를 Python으로 흉내 낸 렌더다. 개발 DB 미반영.
