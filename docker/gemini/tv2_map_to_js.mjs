// 안아트 tileset_v2 이름표(tileset_v2_map.json) -> FE 표(resources/js/game/data/tv2Map.js) 변환(윤프론 2026-11-02).
// JSON 을 직접 import 하지 않고 JS 로 굽는 이유: data/unityPrefabs.js 를 node 에서 그대로 import 해 검증할 수 있게(landSetNames.js 와 같은 방식).
// 실행(저장소 루트): node docker/gemini/tv2_map_to_js.mjs   (tileset_v2_map.json 이 바뀌면 다시 실행)
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'public/assets/tiles/tileset_v2/tileset_v2_map.json';
const OUT = 'resources/js/game/data/tv2Map.js';
const m = JSON.parse(readFileSync(SRC, 'utf8'));
// 구간: 1000~1676 tv2_static(1619~1625 투명 오브젝트, 1626~1676 obj2), 1700~1747 tv2_anim, 1800~1908 tv2_anim2(1898~1908 fx), 2000~2095 tv2_static2(ext2 2026-11-02), 2200~2264 tv2_static3(ext3 실내 2026-11-03), 2300~2363 tv2_static3_art, 2364~2384 tv2_static3_a2
const ok = (i) => Number.isInteger(i) && ((i >= 4500 && i <= 4698) || (i >= 1000 && i <= 1676) || (i >= 1700 && i <= 1747) || (i >= 1800 && i <= 1908) || (i >= 2000 && i <= 2095) || (i >= 2200 && i <= 2264) || (i >= 2300 && i <= 2363) || (i >= 2364 && i <= 2384) || (i >= 2400 && i <= 2599) || (i >= 2600 && i <= 2663) || (i >= 2700 && i <= 3699) || (i >= 3200 && i <= 3399) || (i >= 3400 && i <= 3699) || (i >= 3700 && i <= 4499)); // 3700~4499 = tv2_static9_desert(3700~)·static10_crusader(4000~)·static11_med(4100~)·static12_levee(4300~)·static13_archive(4400~) (안아트 2026-11-03) // 3400~3699 = tv2_static8_japan(안아트 일본 3400~3646, 2026-11-03) // 3200~3399 = tv2_static7_china(안아트 중국 수전 3200~3348, 2026-11-03. 2700~3699 범위와 겹치지만 명시) // 2700~3699 = tv2_static6_west(안아트 서유럽 2700~3131, 2026-11-03) // 2600~2663 = tv2_static5_camp(안아트 군영 2600~2656, 2026-11-03) // 2400~2599 = tv2_static4_mtn(안아트 산·절벽 2400~2586, 2026-11-03). 2200~2264 = tv2_static3(ext3 실내), 2300~2363 = tv2_static3_art(안아트 벽 윗면·붉은 서가·번짐), 2364~2384 = tv2_static3_a2(2막 아트)
const pick = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => ok(v)).sort((a, b) => a[0].localeCompare(b[0])));
const ext = pick(m.index_map_ext); const chip = pick({ ...(m.chip_index ?? {}), ...(m.chip_index_ext2 ?? {}), ...(m.chip_index_ext3 ?? {}) });
// 우선순위: index_map_ext > index_map_ext2 > index_map_ext3 > index_map_mtn > index_map (같은 이름은 앞쪽 값. ext3 int_*·mtn mtn47_*/cliff47_* 는 새 이름이라 기존 이름과 겹치지 않음)
const im = pick({ ...(m.index_map ?? {}), ...(m.index_map_mtn ?? {}), ...(m.index_map_camp ?? {}), ...(m.index_map_west ?? {}), ...(m.index_map_china ?? {}), ...(m.index_map_static8_japan ?? {}), ...(m.index_map_static9_desert ?? {}), ...(m.index_map_static10_crusader ?? {}), ...(m.index_map_static11_med ?? {}), ...(m.index_map_static12_levee ?? {}), ...(m.index_map_static13_archive ?? {}), ...(m.index_map_static14_india ?? {}), ...(m.index_map_ext3 ?? {}), ...(m.index_map_ext2 ?? {}), ...(m.index_map_ext ?? {}) }); const rg = pick(m.index_map_regrounded);
const bad = [...Object.entries(m.index_map ?? {}), ...Object.entries(m.index_map_regrounded ?? {}), ...Object.entries(m.index_map_ext ?? {}), ...Object.entries(m.index_map_ext2 ?? {}), ...Object.entries(m.chip_index ?? {}), ...Object.entries(m.chip_index_ext2 ?? {}), ...Object.entries(m.index_map_ext3 ?? {}), ...Object.entries(m.chip_index_ext3 ?? {}), ...Object.entries(m.index_map_mtn ?? {}), ...Object.entries(m.index_map_camp ?? {}), ...Object.entries(m.index_map_west ?? {}), ...Object.entries(m.index_map_china ?? {}), ...Object.entries(m.index_map_static8_japan ?? {}), ...Object.entries(m.index_map_static9_desert ?? {}), ...Object.entries(m.index_map_static10_crusader ?? {}), ...Object.entries(m.index_map_static11_med ?? {}), ...Object.entries(m.index_map_static12_levee ?? {}), ...Object.entries(m.index_map_static13_archive ?? {})].filter(([, v]) => !ok(v));
if (bad.length) throw new Error(`구간 밖 인덱스: ${JSON.stringify(bad)}`);
const body = `// 자동 생성(docker/gemini/tv2_map_to_js.mjs, 원본 ${SRC}) — 직접 수정 금지.
// tile_layer 이름 -> tileset_v2 전역 인덱스(1000~1676 tv2_static, 1700~1747 tv2_anim, 1800~1908 tv2_anim2, 2000~2095 tv2_static2, 2200~2264 tv2_static3, 2300~2363 tv2_static3_art, 2364~2384 tv2_static3_a2, 2400~2589 tv2_static4_mtn, 2600~2656 tv2_static5_camp). 우선순위 index_map_ext > index_map_ext2 > index_map_ext3 > index_map_mtn > index_map. 없는 이름은 맵 index_map(기존 인덱스) 폴백
export const TV2_INDEX_MAP = ${JSON.stringify(im)};
// 참고용: 위 표에 이미 병합된 index_map_ext 원본
export const TV2_INDEX_MAP_EXT = ${JSON.stringify(ext)};
// tile_layer.v2(layers-v1) building/object/foreground 이름 cs:<시트>:<id> -> tv2_static 투명 오브젝트 인덱스(키 = '<시트>:<id>', chip_index + chip_index_ext2 obj2 1626~1676 + chip_index_ext3 실내 2232~2264)
export const TV2_CHIP_INDEX = ${JSON.stringify(chip)};
// 선택 표(재바탕 rg_*): 폴백 이름 중 기존 풀 바탕 타일의 바탕만 tv2 풀로 바꾼 것. TV2_INDEX_MAP 다음 순위
export const TV2_INDEX_MAP_REGROUNDED = ${JSON.stringify(rg)};
// 재바탕 표를 쓰면 안 되는 맵 코드(맵 index_map 이 이름표와 다름)
export const TV2_RG_MISMATCH = ${JSON.stringify(Array.isArray(m.rg_mismatch) ? m.rg_mismatch.map((x) => (typeof x === 'string' ? x : x?.code)).filter(Boolean) : [])};
`;
writeFileSync(OUT, body);
console.log(`${OUT}: index_map ${Object.keys(im).length}개(ext ${Object.keys(ext).length}), chip ${Object.keys(chip).length}개, regrounded ${Object.keys(rg).length}개, rg_mismatch ${(m.rg_mismatch ?? []).length}`);
