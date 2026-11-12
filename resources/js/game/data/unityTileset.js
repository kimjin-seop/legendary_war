// Unity 32px 타일셋(settings.terrainStyle === 'unity32') 설정 + 지형 코드 -> 타일 인덱스 매핑(순수 함수, Phaser/DOM 의존 없음 -> node 검증 가능).
// 에셋: public/assets/third_party/unity_tilemap/TileMap.png (320x96, 32x32 타일 10열x3행 = 30칸, NOTICE.md 참조 — 라이선스 미확인·개발 한정)
// 배치 원칙(사용자 지정 가이드 https://uniti.tistory.com/164 기준):
//   - 시트를 32x32 셀 크기로 분할(인덱스 0~29, Unity 스프라이트 TileMap_0~29 와 같은 번호: 0행 0~9, 1행 10~19, 2행 20~29)
//   - 타일 1칸 = 타일 1개 직배치. 이웃 비트마스크 오토타일·경계 블렌딩·여러 칸 합성 없음(가이드에 없는 기법은 쓰지 않음)
//   - 회전은 90도 단위만(rot 0|1|2|3). 현재는 세로로 이어진 다리 판자만 90도 회전
//   - 같은 지형의 변형은 좌표 해시로만 고른다(결정론, 이웃 참조 없음)
// 서버 지형 판정(이동·방어)은 바꾸지 않는다. 이 파일은 시각 표현만 정한다.
export const U32_KEY = 'unity_tilemap'; // Phaser 텍스처 키(spritesheet 32x32, 프레임 번호 = 아래 인덱스)
export const U32_PATH = '/assets/third_party/unity_tilemap/TileMap.png';
export const U32_PX = 32; // 원본 타일 크기(Unity Pixels Per Unit 32)
export const U32_COLS = 10;
export const U32_COUNT = 30;
// 확장 시트(안아트 tileset_ext: 원본 TileMap.png 픽셀을 조립·재색한 파생 타일, 320x256 = 10열x8행, 전역 인덱스 30~103 = 프레임+30, 104~109 빈 칸).
// 명세 public/assets/tiles/legend_tileset/tileset_ext_spec.json. enabled=false 면 로드하지 않고 30 이상 인덱스는 지형 코드 폴백
export const U32_EXT = { enabled: true, key: 'unity_tilemap_ext', path: '/assets/tiles/legend_tileset/tileset_ext.png', cols: 10, count: 74 };
// 투명 오버레이 타일(아래 지형 위에 덧그림): 103 점령 깃발, 400~415 수상 세트 건물 덧그림, 420~425 목표 깃발·탑 덧그림
export const U32_OVERLAY = new Set([103, ...Array.from({ length: 16 }, (_, i) => 400 + i), ...Array.from({ length: 6 }, (_, i) => 420 + i)]);
// 전환 확장 시트 2(안아트 tileset_ext2: 320x192 = 10열x6행 중 54칸, 전역 인덱스 110~163 = 프레임+110). 명세 tileset_ext2_spec.json, 이름표 v2_tilemap_ext2.json.
// 미로드(enabled=false)면 110 이상 인덱스는 tile_layer 에서 지형 코드 단일 타일 폴백
export const U32_EXT2 = { enabled: true, key: 'unity_tilemap_ext2', path: '/assets/tiles/legend_tileset/tileset_ext2.png', cols: 10, count: 54, start: 110 };
// 수상 세트(안아트 water_set, 명세 public/assets/tiles/water_set/ws_spec.json·index_map_ws.json). 전역 인덱스 규약(안아트 제안):
//   200~249 ws_static(프레임=전역-200) / 300~372 ws_anim(4프레임 애니, 시트 프레임=(전역-300)+f*80) / 400~415 ws_building_ov(투명 덧그림, 프레임=전역-400)
//   420~425 ws_overlay(투명 덧그림, 192x32 6칸: 420~423 목표 깃발 4프레임 루프, 424/425 탑). 애니는 전역 시계 f=floor(t/250)%4 를 모든 칸에 동시 적용
// 미로드(enabled=false)면 해당 구간은 무효(tile_layer 는 지형 코드 폴백, 지형 레시피는 기본 시트 타일로 대체)
export const U32_WS = {
    enabled: true,
    static: { key: 'ws_static', path: '/assets/tiles/water_set/ws_static.png', cols: 10, start: 200, count: 50 },
    anim: { key: 'ws_anim', path: '/assets/tiles/water_set/ws_anim.png', cols: 10, start: 300, count: 73, stride: 80, frames: 4 },
    bov: { key: 'ws_building_ov', path: '/assets/tiles/water_set/ws_building_ov.png', cols: 10, start: 400, count: 16 },
    ov: { key: 'ws_overlay', path: '/assets/tiles/water_set/ws_overlay.png', cols: 6, start: 420, count: 6 },
};
export const U32_WS_SHEETS = [U32_WS.static, U32_WS.anim, U32_WS.bov, U32_WS.ov];
// 육상 세트(안아트 land_set, ls_static.png 512x672 = 16열, 330칸). 안아트 제안 시작 200 은 water_set 과 겹쳐 FE 전역 500~829 로 재배정(프레임 = 전역-500).
// 이름 -> 프레임 표는 data/landSetNames.js(docker/gemini/land_names_to_js.mjs 로 ls_names.json 에서 생성). 이웃 규칙 배치는 data/landPaint.js(tile_layer 없는 맵만)
export const U32_EXT3 = { enabled: true, key: 'land_set', path: '/assets/tiles/land_set/ls_static.png', cols: 16, count: 330, start: 500 };
// 타일셋 v2(안아트 RM2003 칩셋 베이크, docs/TILESET_V2_SPEC.md 8절). 전역 1000~1618 tv2_static(프레임 = 전역-1000), 1700~1747 tv2_anim(프레임 = (전역-1700)+f*48, RM 3프레임을 [0,1,2,1] 로 구움).
// 교체 스위치: enabled(기본 ON) — tile_layer 이름을 data/tv2Map.js 표로 먼저 찾는다(unityPrefabs.u32TileLayer). regrounded = 재바탕 표(rg_*)도 사용.
// 롤백: enabled=false(코드) 또는 콘솔 settings.set({terrainTv2:false}) 후 새로고침(assets.queueRmTiles 가 끈다). 시트 로드 실패 시 UnityGround 가 자동으로 끈다(기존 타일)
export const TV2_STATIC3_COUNT = 65; // tv2_static3 구운 칸 수(2200~2264). 예약 슬롯 2300~ 은 별도 시트 tv2_static3_art(U32_TV2.static3_art)
export const U32_TV2 = {
    enabled: true,
    regrounded: true,
    static: { key: 'tv2_static', path: '/assets/tiles/tileset_v2/tv2_static.png', cols: 16, start: 1000, count: 677 }, // 1619~1625 = 투명 오브젝트(chip_index), 1626~1676 = obj2 투명 오브젝트(chip_index_ext2, ext2 2026-11-02)
    anim: { key: 'tv2_anim', path: '/assets/tiles/tileset_v2/tv2_anim.png', cols: 16, start: 1700, count: 48, stride: 48, frames: 4 },
    anim2: { key: 'tv2_anim2', path: '/assets/tiles/tileset_v2/tv2_anim2.png', cols: 16, start: 1800, count: 109, stride: 112, frames: 4 }, // 3단계 확장(ford47 1800~1846, sandwater47 1847~1893, tv2reef 1894~1897) + ext2 fx 1898~1908(모닥불·폭포·소용돌이), 프레임 = (전역-1800)+f*112
    static2: { key: 'tv2_static2', path: '/assets/tiles/tileset_v2/tv2_static2.png', cols: 16, start: 2000, count: 96 }, // ext2: swamp47 2000~2047, void47 2048~2095, 프레임 = 전역-2000
    // ext3 실내 키트(맵디자이너 bake_ext3, 2026-11-03): 2200~2231 지면(서가·벽면·사암·카운터·카펫·문턱) / 2232~2264 실내 오브젝트(투명). 프레임 = 전역-2200.
    // count = 시트에 실제로 구운 칸 수(manifest tileset.tv2_static3.count). 예약 슬롯 2300~2363(walltop47·shelfred·bleed)은 아래 static3_art 시트
    static3: { key: 'tv2_static3', path: '/assets/tiles/tileset_v2/tv2_static3.png', cols: 16, start: 2200, count: TV2_STATIC3_COUNT },
    // ext3 아트 시트(안아트 art_ext3.py, 2026-11-03): 2300~2346 벽 윗면 walltop47 + 2347 단독 / 2350~2358 붉은 줄 서가 (불투명) / 2360~2363 종이 번짐 obj3_bleed_a~d(반투명 오브젝트). 프레임 = 전역-2300
    static3_art: { key: 'tv2_static3_art', path: '/assets/tiles/tileset_v2/tv2_static3_art.png', cols: 16, start: 2300, count: 64 },
    // 2막 아트(안아트 art_a2.py, 2026-11-03): 2364~2365·2370~2377 투명 오브젝트 / 2366~2369 연기 반투명 오버레이 / 2378~2384 지면(잔해·낙석 a2_rockfall 2380·능선). 프레임 = 전역-2364
    static3_a2: { key: 'tv2_static3_a2', path: '/assets/tiles/tileset_v2/tv2_static3_a2.png', cols: 16, start: 2364, count: 21 },
    // 확장 맵 산/절벽(안아트, 2026-11-03, docker/maps/tilemap_v2/mtn_tiles_mapping.json): 2400~2586(187칸, 512x384). 프레임 = 전역-2400
    static4_mtn: { key: 'tv2_static4_mtn', path: '/assets/tiles/tileset_v2/tv2_static4_mtn.png', cols: 16, start: 2400, count: 190 }, // 2026-11-03 187 -> 190(안아트 추가 3칸)
    // 군영(안아트, 2026-11-03): 2600~2656(57칸). 프레임 = 전역-2600
    static5_camp: { key: 'tv2_static5_camp', path: '/assets/tiles/tileset_v2/tv2_static5_camp.png', cols: 16, start: 2600, count: 57 },
    // 서유럽(안아트, 2026-11-03): 2700~3131(432칸). 프레임 = 전역-2700
    static6_west: { key: 'tv2_static6_west', path: '/assets/tiles/tileset_v2/tv2_static6_west.png', cols: 16, start: 2700, count: 432 },
    // 중국 수전(안아트, 2026-11-03): 3200~3348(149칸). 프레임 = 전역-3200
    static7_china: { key: 'tv2_static7_china', path: '/assets/tiles/tileset_v2/tv2_static7_china.png', cols: 16, start: 3200, count: 151 }, // 2026-11-03 149 -> 151(열린 성문 int_gate_open_L 3349 / _R 3350)
    // 일본(안아트, 2026-11-03): 3400~3646(247칸). 프레임 = 전역-3400
    static8_japan: { key: 'tv2_static8_japan', path: '/assets/tiles/tileset_v2/tv2_static8_japan.png', cols: 16, start: 3400, count: 251 }, // 2026-11-03 247 -> 251(진막 2x2 ov_jinmaku_00/01/10/11 = 3647~3650)
    // 사막(안아트, 2026-11-03): 3700~3946(247칸). 프레임 = 전역-3700
    static9_desert: { key: 'tv2_static9_desert', path: '/assets/tiles/tileset_v2/tv2_static9_desert.png', cols: 16, start: 3700, count: 247 },
    // 십자군(안아트, 2026-11-03): 4000~4044(45칸). 프레임 = 전역-4000
    static10_crusader: { key: 'tv2_static10_crusader', path: '/assets/tiles/tileset_v2/tv2_static10_crusader.png', cols: 16, start: 4000, count: 45 },
    // 지중해(안아트, 2026-11-03): 4100~4246(147칸). 프레임 = 전역-4100
    static11_med: { key: 'tv2_static11_med', path: '/assets/tiles/tileset_v2/tv2_static11_med.png', cols: 16, start: 4100, count: 147 },
    // 제방(안아트, 2026-11-03): 4300~4317(18칸). 프레임 = 전역-4300
    static12_levee: { key: 'tv2_static12_levee', path: '/assets/tiles/tileset_v2/tv2_static12_levee.png', cols: 16, start: 4300, count: 18 },
    // 서고(안아트, 2026-11-03): 4400~4425(26칸). 프레임 = 전역-4400
    static13_archive: { key: 'tv2_static13_archive', path: '/assets/tiles/tileset_v2/tv2_static13_archive.png', cols: 16, start: 4400, count: 26 },
    // 인도(안아트 art_india, 2026-11-03): 4500~4698(199칸: 구조 4500~4561, 정원 4600~4648, 붉은 흙 4650~4698). 시트 512x416(16열). 프레임 = 전역-4500
    static14_india: { key: 'tv2_static14_india', path: '/assets/tiles/tileset_v2/tv2_static14_india.png', cols: 16, start: 4500, count: 199 },
};
export const U32_TV2_SHEETS = [U32_TV2.static, U32_TV2.anim, U32_TV2.anim2, U32_TV2.static2, U32_TV2.static3, U32_TV2.static3_art, U32_TV2.static3_a2, U32_TV2.static4_mtn, U32_TV2.static5_camp, U32_TV2.static6_west, U32_TV2.static7_china, U32_TV2.static8_japan, U32_TV2.static9_desert, U32_TV2.static10_crusader, U32_TV2.static11_med, U32_TV2.static12_levee, U32_TV2.static13_archive, U32_TV2.static14_india]; // 로더(assets.queueRmTiles)·UnityGround 소스가 이 배열을 그대로 쓴다
const inTv2 = (s, i) => U32_TV2.enabled && i >= s.start && i < s.start + s.count;
const hasTv2 = (i) => inTv2(U32_TV2.static, i) || inTv2(U32_TV2.anim, i) || inTv2(U32_TV2.anim2, i) || inTv2(U32_TV2.static2, i) || inTv2(U32_TV2.static3, i) || inTv2(U32_TV2.static3_art, i) || inTv2(U32_TV2.static3_a2, i) || inTv2(U32_TV2.static4_mtn, i) || inTv2(U32_TV2.static5_camp, i) || inTv2(U32_TV2.static6_west, i) || inTv2(U32_TV2.static7_china, i) || inTv2(U32_TV2.static8_japan, i) || inTv2(U32_TV2.static9_desert, i) || inTv2(U32_TV2.static10_crusader, i) || inTv2(U32_TV2.static11_med, i) || inTv2(U32_TV2.static12_levee, i) || inTv2(U32_TV2.static13_archive, i) || inTv2(U32_TV2.static14_india, i);
export const U32_ANIM_MS = 250; // 4fps(fps_hint 4)
export const u32AnimFrame = (t) => Math.floor((Number(t) || 0) / U32_ANIM_MS) % 4;
const inWs = (s, i) => U32_WS.enabled && i >= s.start && i < s.start + s.count;
const wsSheetOf = (i) => U32_WS_SHEETS.find((s) => inWs(s, i)) ?? null;
const hasWs = (i) => !!wsSheetOf(i);
const hasExt3 = (i) => U32_EXT3.enabled && i >= U32_EXT3.start && i < U32_EXT3.start + U32_EXT3.count;
const OBJ_FLAG = [420, 423]; // 목표 깃발 4프레임 루프(ws_overlay 0~3)
// 애니 타일 여부(UnityGround 가 4fps 로 다시 그린다): ws_anim 전 구간 + 목표 깃발 덧그림
export const u32Animated = (i) => inWs(U32_WS.anim, i) || (inWs(U32_WS.ov, i) && i >= OBJ_FLAG[0] && i <= OBJ_FLAG[1]) || inTv2(U32_TV2.anim, i) || inTv2(U32_TV2.anim2, i);
const hasExt = (i) => U32_EXT.enabled && i >= U32_COUNT && i < U32_COUNT + U32_EXT.count; // 확장 인덱스 사용 가능 여부
const hasExt2 = (i) => U32_EXT2.enabled && i >= U32_EXT2.start && i < U32_EXT2.start + U32_EXT2.count;
// 인덱스 구간: 0~29 기본 시트, 30~103 확장 시트(프레임=전역-30), 110~163 확장 시트2(프레임=전역-110), 200~425 수상 세트(위 U32_WS). 104~109·164~199 등 빈 번호는 무효
export const u32ValidIndex = (i) => Number.isInteger(i) && i >= 0 && (i < U32_COUNT || hasExt(i) || hasExt2(i) || hasWs(i) || hasExt3(i) || hasTv2(i));

// 타일 의미(시트 실측). collider: Unity TileMap_N.asset 의 m_ColliderType(0 None, 1 Sprite) — 참고용, FE 판정에는 쓰지 않음
export const U32 = {
    SEA: 0, //          짙은 바다                  collider 1
    WATER: 1, //        밝은 물(얕은 물)            collider 1
    SAND: 2, //         모래                        collider 0
    GRASS: 3, //        풀                          collider 0
    GRASS_DARK: 4, //   짙은 풀                     collider 0
    PLANK: 5, //        세로 판자(다리·목재 바닥)    collider 0
    SHORE: 6, //        해안(위 모래, 아래 물결)     collider 1  — 방향 있는 경계 타일이라 미사용
    FOREST: 7, //       숲(수관, 반복 가능)          collider 1
    PEAK_TOP: 8, //     산 군집 윗부분(숲 위 봉우리) collider 1  — 여러 칸 조합용이라 미사용
    DUNGEON_DOOR: 9, // 석조 출입구                  collider 1  — 대응 지형 코드 없음(미사용)
    STONE_A: 10, STONE_B: 11, STONE_C: 12, STONE_D: 13, STONE_E: 14, // 석벽/돌 블록 5종 collider 0
    SLAB: 15, //        큰 판석 바닥                 collider 1
    PLATE: 16, //       돌 받침판                    collider 1
    PEAK_L: 17, PEAK: 18, PEAK_R: 19, // 18 = 칸 전체가 바위 봉우리(단독 반복 가능), 17·19 는 군집 가장자리용(미사용)
    STAIRS: 20, //      계단                         collider 1  — 대응 지형 코드 없음(미사용)
    PILLAR_A: 21, PILLAR_B: 22, PILLAR_C: 23, PILLAR_D: 24, // 석조 기둥(미사용)
    BRICK: 25, //       붉은 벽돌                    collider 1
    FLOOR_GRID: 26, //  격자 석재 바닥               collider 1
    PEAK_BL: 27, PEAK_B: 28, PEAK_BR: 29, // 산 군집 아랫부분(미사용)
};

// 지형 기호(terrains.json symbol) -> 코드. 미리보기 등에서 기호 문자열이 그대로 올 때 대비
export const U32_SYMBOL = { p: 'plain', f: 'forest', m: 'mountain', w: 'water', c: 'castle', s: 'shallows', b: 'bridge', r: 'road', x: 'swamp', n: 'snow_desert', k: 'cliff', W: 'wall', v: 'village', o: 'sea', q: 'reef', h: 'harbor', d: 'sand', i: 'hill', V: 'void', j: 'rift_plank' }; // o~j: 임진왜란 10맵 신규 지형(terrains.json)

// 지형 코드 -> { tiles: [[인덱스, 가중치], ...], tint?: 0xRRGGBB(곱하기 색조), wash?: [0xRRGGBB, 알파](덧칠, 밝게 만들 때) }
// 색조는 타일이 없는 지형의 근사 표현(칸 단위, 이웃 보간 없음). 강화면 4차 검증 가독성 지적 반영(2026-11-01)
// biome: desert | snow | swamp | temperate | mountain ... (서버 map.biome)
// 실내 서고(biome 'library', 메인 스토리 1막·서가 맵): tv2_static3 실내 키트가 있으면 서고 전용 기본값. mid = 바닥 위 투명 오브젝트(유닛 아래, drawCell 의 cell.mid)
// W = 서가(int_shelf_MC), f = 판자 바닥 + 책상(obj3_desk), p = 판자 바닥(woodfloor_a/b), r = 붉은 카펫(int_carpet_MC), c = 카운터(int_counter_1). 시트가 없으면 null -> 기존 레시피
const TV2_WOOD = [[1584, 3], [1585, 1]];
function libraryRecipe(code) {
    if (!hasTv2(2204) || !hasTv2(1584)) return null;
    switch (code) {
    case 'wall': return { tiles: [[2204, 1]] };
    case 'forest': return { tiles: TV2_WOOD, mid: [2232] };
    case 'plain': return { tiles: TV2_WOOD };
    case 'road': return { tiles: [[2226, 1]] };
    case 'castle': return { tiles: [[2219, 1]] };
    default: return null;
    }
}

export function u32Recipe(code, biome) {
    const lib = biome === 'library' ? libraryRecipe(code) : null;
    if (lib) return lib;
    switch (code) {
    case 'plain': return { tiles: [[U32.GRASS, 20], [U32.GRASS_DARK, 1]] }; // 짙은 풀 약 5%(높으면 별도 지형처럼 보임)
    case 'forest': return { tiles: [[U32.FOREST, 1]] };
    case 'mountain': return { tiles: [[U32.PEAK, 1]] };
    case 'water': return { tiles: [[U32.SEA, 1]] };
    case 'shallows': return { tiles: [[U32.WATER, 1]] };
    case 'bridge': return { tiles: [[U32.PLANK, 1]], bridge: true };
    case 'road': return { tiles: [[U32.SAND, 1]], tint: 0xa89a8c }; // 회갈색 흙길(사막·설원 모래와 구분)
    case 'village': return hasExt(92) ? { tiles: [[92, 1]] } : { tiles: [[U32.SAND, 1], [U32.BRICK, 1]] }; // 군집은 unityPrefabs 건물 레시피가 덮어씀. 남는 단독 칸 = 확장 house_small(92), 없으면 모래/벽돌 혼합
    case 'castle': return { tiles: [[U32.SLAB, 3], [U32.FLOOR_GRID, 2]] };
    case 'wall': return { tiles: [[U32.STONE_A, 1], [U32.STONE_D, 1]] }; // 밝은 석벽(인공 성벽)
    case 'cliff': return { tiles: [[U32.STONE_B, 1], [U32.STONE_E, 1]], tint: 0x8a7462 }; // 어두운 석재 + 짙은 흙빛(포장 바닥처럼 보이지 않게)
    case 'swamp': return hasExt(98) ? { tiles: [[97, 1], [98, 1]] } : { tiles: [[U32.GRASS, 2], [U32.GRASS_DARK, 1]], tint: 0x9c8a5a }; // 늪 타일 없음: 풀 + 녹갈색(물 타일은 깊은 물처럼 보여 쓰지 않음)
    case 'snow_desert': if (hasExt(96)) return biome === 'desert' ? { tiles: [[95, 1], [96, 1]] } : { tiles: [[93, 1], [94, 1]] }; // 확장 눈 93/94·사막 95/96
        return biome === 'desert'
        ? { tiles: [[U32.SAND, 1]], tint: 0xf2cf72 } // 사막: 모래 + 황토
        : { tiles: [[U32.SAND, 1]], wash: [0xeef6ff, 0.62] }; // 설원 타일 없음: 모래 결 위에 흰 하늘색 덧칠
    // ---- 임진왜란 10맵 신규 지형(이전에는 default=풀로 그려졌다). tile_layer(index_map) 가 있으면 그쪽이 우선이고 이 레시피는 지형 코드 폴백용 ----
    // 수상 세트(water_set) 시트가 있으면 그 타일(sea_a/b 300·301 애니, reef 303~305 애니, harbor 243~245, hill 200~202, void 350·351 애니, rift_plank 371·372 애니)
    case 'sea': return hasWs(300) ? { tiles: [[300, 6], [301, 1]] } : { tiles: [[U32.SEA, 1]] };
    case 'reef': return hasWs(303) ? { tiles: [[303, 1], [304, 1], [305, 1]] } : { tiles: [[U32.SEA, 1]], tint: 0x8a9aa8 };
    case 'harbor': return hasWs(243) ? { tiles: [[243, 1], [244, 1], [245, 1]] } : { tiles: [[U32.PLANK, 1]] };
    case 'sand': return { tiles: [[U32.SAND, 1]] };
    case 'hill': return hasWs(200) ? { tiles: [[200, 1], [201, 1], [202, 1]] } : { tiles: [[U32.GRASS_DARK, 1]] };
    case 'void': return hasWs(350) ? { tiles: [[350, 3], [351, 1]] } : { tiles: [[U32.STONE_E, 1]], tint: 0x2a2347 };
    case 'rift_plank': return hasWs(371) ? { tiles: [[371, 1], [372, 1]] } : { tiles: [[U32.PLANK, 1]] };
    default: return { tiles: [[U32.GRASS, 1]] };
    }
}

// 좌표 해시(결정론, 0 <= h < 1). 이웃은 보지 않는다
export function u32Hash(x, y, seed = 0) {
    let h = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(seed | 0, 83492791)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function pick(list, r) {
    const total = list.reduce((s, [, w]) => s + w, 0);
    let t = r * total;
    for (const [idx, w] of list) { if (t < w) return idx; t -= w; }
    return list[list.length - 1][0];
}

// 지형 코드 하나의 기본 타일(레시피 가중치 중 좌표 해시로 선택). terrain_change cue 칸 재렌더용(decor·이웃 규칙 없음) -> { idx, tint, wash, mid }
export function u32TileFor(code, biome, x, y) {
    const rc = u32Recipe(code, biome);
    return { idx: pick(rc.tiles, u32Hash(x, y, 7)), tint: rc.tint ?? null, wash: rc.wash ?? null, mid: rc.mid ?? null };
}

const codeOf = (c) => (typeof c === 'string' && c.length === 1 ? U32_SYMBOL[c] ?? 'plain' : c ?? 'plain');
const WET = new Set(['water', 'shallows', 'swamp', 'sea', 'reef']);

// 맵 -> 칸별 타일 목록. map: { w, h, tiles: 코드(또는 기호) 2차원 배열/문자열 행, biome }
// 반환: { cols, rows, cells: [{ x, y, code, idx, rot, tint }] } (행 우선 순서, 칸 수 = cols x rows)
export function u32Compose(map, opts = {}) {
    const rowsArr = (map.tiles ?? []).map((r) => (typeof r === 'string' ? [...r] : r));
    const rows = map.h ?? rowsArr.length;
    const cols = map.w ?? rowsArr[0]?.length ?? 0;
    const seed = (map.code ? [...String(map.code)].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) | 0, 7) : 7);
    const at = (x, y) => codeOf(rowsArr[y]?.[x]);
    const cells = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const code = at(x, y);
            const rc = u32Recipe(code, map.biome);
            const idx = pick(rc.tiles, u32Hash(x, y, seed));
            let rot = 0;
            // 다리: 판자 결이 세로(= 가로 통행)인 타일. 위·아래가 물이 아니고 좌·우가 물이면 세로 통행이므로 90도 회전(가이드 허용 범위)
            if (rc.bridge && !opts.noAutoRotate) {
                const wetN = y > 0 && WET.has(at(x, y - 1)); const wetS = y < rows - 1 && WET.has(at(x, y + 1));
                const wetW = x > 0 && WET.has(at(x - 1, y)); const wetE = x < cols - 1 && WET.has(at(x + 1, y));
                if ((wetW || wetE) && !wetN && !wetS) rot = 1;
            }
            cells.push({ x, y, code, idx, rot, tint: rc.tint ?? null, wash: rc.wash ?? null });
        }
    }
    return { cols, rows, cells };
}

// 인덱스 -> 시트 텍스처 키 + 원본 좌표(px). 0~29 기본, 30~109 확장(104~109 는 빈 칸), 110~199 확장2, 200 이상 수상 세트.
// f = 애니 프레임(0~3, u32AnimFrame). ws_anim 은 (전역-300)+f*80, 목표 깃발 420~423 은 ((전역-420)+f)%4, 그 외는 f 무시
const srcOf = (key, f, cols) => ({ key, sx: (f % cols) * U32_PX, sy: Math.floor(f / cols) * U32_PX, frame: f });
export function u32Src(idx, f = 0) {
    if (idx < U32_COUNT) return srcOf(U32_KEY, idx, U32_COLS);
    if (idx < U32_EXT2.start) return srcOf(U32_EXT.key, idx - U32_COUNT, U32_EXT.cols);
    if (idx < U32_WS.static.start) return srcOf(U32_EXT2.key, idx - U32_EXT2.start, U32_EXT2.cols);
    if (idx >= U32_TV2.static14_india.start) return srcOf(U32_TV2.static14_india.key, idx - U32_TV2.static14_india.start, U32_TV2.static14_india.cols); // tv2 인도(4500~4698) — 가장 큰 시작 구간이라 먼저
    if (idx >= U32_TV2.static13_archive.start) return srcOf(U32_TV2.static13_archive.key, idx - U32_TV2.static13_archive.start, U32_TV2.static13_archive.cols); // tv2 서고(4400~4425)
    if (idx >= U32_TV2.static12_levee.start) return srcOf(U32_TV2.static12_levee.key, idx - U32_TV2.static12_levee.start, U32_TV2.static12_levee.cols); // tv2 제방(4300~4317)
    if (idx >= U32_TV2.static11_med.start) return srcOf(U32_TV2.static11_med.key, idx - U32_TV2.static11_med.start, U32_TV2.static11_med.cols); // tv2 지중해(4100~4246)
    if (idx >= U32_TV2.static10_crusader.start) return srcOf(U32_TV2.static10_crusader.key, idx - U32_TV2.static10_crusader.start, U32_TV2.static10_crusader.cols); // tv2 십자군(4000~4044)
    if (idx >= U32_TV2.static9_desert.start) return srcOf(U32_TV2.static9_desert.key, idx - U32_TV2.static9_desert.start, U32_TV2.static9_desert.cols); // tv2 사막(3700~3946)
    if (idx >= U32_TV2.static8_japan.start) return srcOf(U32_TV2.static8_japan.key, idx - U32_TV2.static8_japan.start, U32_TV2.static8_japan.cols); // tv2 일본(3400~3646) — 3200 분기보다 먼저
    if (idx >= U32_TV2.static7_china.start) return srcOf(U32_TV2.static7_china.key, idx - U32_TV2.static7_china.start, U32_TV2.static7_china.cols); // tv2 중국 수전(3200~3348) — 2700 분기보다 먼저
    if (idx >= U32_TV2.static6_west.start) return srcOf(U32_TV2.static6_west.key, idx - U32_TV2.static6_west.start, U32_TV2.static6_west.cols); // tv2 서유럽(2700~3131) — 2600 분기보다 먼저
    if (idx >= U32_TV2.static5_camp.start) return srcOf(U32_TV2.static5_camp.key, idx - U32_TV2.static5_camp.start, U32_TV2.static5_camp.cols); // tv2 군영(2600~2656) — 2400 분기보다 먼저
    if (idx >= U32_TV2.static4_mtn.start) return srcOf(U32_TV2.static4_mtn.key, idx - U32_TV2.static4_mtn.start, U32_TV2.static4_mtn.cols); // tv2 산/절벽(2400~2586) — 2364 분기보다 먼저
    if (idx >= U32_TV2.static3_a2.start) return srcOf(U32_TV2.static3_a2.key, idx - U32_TV2.static3_a2.start, U32_TV2.static3_a2.cols); // tv2 2막 아트(2364~2384) — 2300 분기보다 먼저
    if (idx >= U32_TV2.static3_art.start) return srcOf(U32_TV2.static3_art.key, idx - U32_TV2.static3_art.start, U32_TV2.static3_art.cols); // tv2 정적3 아트(2300~) — 2200 분기보다 먼저
    if (idx >= U32_TV2.static3.start) return srcOf(U32_TV2.static3.key, idx - U32_TV2.static3.start, U32_TV2.static3.cols); // tv2 정적3(ext3 실내, 2200~) — static2 분기보다 먼저
    if (idx >= U32_TV2.static2.start) return srcOf(U32_TV2.static2.key, idx - U32_TV2.static2.start, U32_TV2.static2.cols); // tv2 정적2(ext2, 2000~)
    if (idx >= U32_TV2.anim2.start) return srcOf(U32_TV2.anim2.key, (idx - U32_TV2.anim2.start) + ((f | 0) % 4) * U32_TV2.anim2.stride, U32_TV2.anim2.cols); // tv2 애니2(1700 분기보다 먼저)
    if (idx >= U32_TV2.anim.start) return srcOf(U32_TV2.anim.key, (idx - U32_TV2.anim.start) + ((f | 0) % 4) * U32_TV2.anim.stride, U32_TV2.anim.cols); // tv2 애니(land_set 분기보다 먼저)
    if (idx >= U32_TV2.static.start) return srcOf(U32_TV2.static.key, idx - U32_TV2.static.start, U32_TV2.static.cols); // tv2 정적
    if (idx >= U32_EXT3.start) return srcOf(U32_EXT3.key, idx - U32_EXT3.start, U32_EXT3.cols);
    const s = U32_WS_SHEETS.find((w) => idx >= w.start && idx < w.start + w.count) ?? U32_WS.static;
    const k = (f | 0) % 4;
    if (s === U32_WS.anim) return srcOf(s.key, (idx - s.start) + k * s.stride, s.cols);
    if (s === U32_WS.ov && idx >= OBJ_FLAG[0] && idx <= OBJ_FLAG[1]) return srcOf(s.key, ((idx - s.start) + k) % 4, s.cols);
    return srcOf(s.key, idx - s.start, s.cols);
}
