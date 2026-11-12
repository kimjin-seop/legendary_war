// 서버 규칙 데이터의 클라이언트 사본(참고용). 원본: database/data/unit_types.json, matchups.json, terrains.json, config/game.php(rules).
// 판정은 서버가 한다. 여기 값은 이동 범위/공격 범위/예상 피해 '표시'에만 쓰며 서버 응답(moves, events)과 다르면 서버가 우선한다.
// 병종 move 시작값(2026-11-03 서버 상향 동기화): database/data/unit_types.json 과 일치. 실제 값은 applyServerRules(GET /api/rules)가 덮어쓴다.
export const UNIT_TYPES = {
    sword: { label: '보병', glyph: '보', move: 6, range_min: 1, range_max: 1, move_type: 'foot', heal: 0 },
    spear: { label: '창병', glyph: '창', move: 6, range_min: 1, range_max: 1, move_type: 'foot', heal: 0 },
    cavalry: { label: '기병', glyph: '기', move: 8, range_min: 1, range_max: 1, move_type: 'mounted', heal: 0 },
    archer: { label: '궁병', glyph: '궁', move: 5, range_min: 2, range_max: 2, move_type: 'foot', heal: 0 },
    mage: { label: '마법사', glyph: '마', move: 4, range_min: 2, range_max: 3, move_type: 'foot', heal: 0 }, // 병종 v2 2단계(2026-11-03): 이동 4·사거리 2~3(unit_types.json). /api/rules 가 덮어씀
    healer: { label: '승려', glyph: '승', move: 6, range_min: 1, range_max: 1, move_type: 'foot', heal: 12 },
    heavy: { label: '보병', glyph: '보', move: 4, range_min: 1, range_max: 1, move_type: 'heavy', heal: 0 },
    flyer: { label: '비행', glyph: '비', move: 8, range_min: 1, range_max: 1, move_type: 'flying', heal: 0 },
    gunner: { label: '총병', glyph: '총', move: 5, range_min: 3, range_max: 3, move_type: 'foot', heal: 0 }, // 총병(2026-11-03 박백엔 1차, 임시 수치): 사거리 3 고정, 이동한 턴 사격 불가, 사선(LOS). /api/rules 가 덮어씀
    naval: { label: '수병', glyph: '수', move: 6, range_min: 1, range_max: 1, move_type: 'naval', heal: 0 }, // database/data/unit_types.json naval(수상 이동 전용, 항상 자기 배)
};
export const unitType = (code) => UNIT_TYPES[code] ?? UNIT_TYPES.sword;
// 병종 v2 별칭: 퇴역 병종 -> 대체 병종(서버 /api/rules unit_types[].alias_of 우선, 받기 전 시작값 heavy -> sword).
// 표시(이름·글리프·모션·아이콘) 분기는 typeAlias 결과로 판단한다. 진행 중 전투의 heavy 유닛은 코드 그대로 두고(UNIT_TYPES.heavy 이동·사거리 유지) 표시만 sword 로
const TYPE_ALIAS_ALL = { heavy: 'sword' };
export const typeAlias = (code) => (code ? TYPE_ALIAS_ALL[code] ?? code : code);

// 상성 배율(attacker -> defender). 미정의 조합 1.0
const M = [
    ['sword', 'spear', 1.25], ['spear', 'cavalry', 1.25], ['cavalry', 'sword', 1.25],
    ['spear', 'sword', 0.8], ['cavalry', 'spear', 0.8], ['sword', 'cavalry', 0.8],
    ['archer', 'flyer', 1.25], ['flyer', 'archer', 0.8], ['mage', 'heavy', 1.25],
];
export const MATCHUPS = {};
M.forEach(([a, d, m]) => { (MATCHUPS[a] ??= {})[d] = m; });
// 퇴역 병종 별칭(서버 unit_types[].alias_of, 예 heavy -> sword). 서버 상성표를 받았을 때만 채운다(서버는 별칭 행/열을 matchups 에서 뺌)
const TYPE_ALIAS = {};
export const multiplier = (a, d) => { const v = Number(MATCHUPS[TYPE_ALIAS[a] ?? a]?.[TYPE_ALIAS[d] ?? d]); return Number.isFinite(v) && v > 0 ? v : 1.0; }; // 없는 키·비정상 값 = 1.0
// 상성 목록(툴팁·가이드용, 하드코딩 대신 MATCHUPS 에서 생성): 퇴역 병종(별칭)은 대체 병종으로 합쳐 9종 기준.
// 반환 { strong:[{type,m}](내 공격 유리, 배율 큰 순), weak:[{type,m}](내 공격 불리, 작은 순), threats:[{type,m}](나를 유리하게 치는 병종) }
export const activeTypes = () => [...new Set([...Object.keys(UNIT_TYPES), ...Object.keys(MATCHUPS)].map(typeAlias))].filter((t) => t && UNIT_TYPES[t] && !TYPE_ALIAS_ALL[t]);
export function matchupOf(type) {
    const me = typeAlias(type);
    const all = activeTypes();
    const pick = (fn, cmp) => all.map((t) => ({ type: t, m: fn(t) })).filter((x) => cmp(x.m)).sort((a, b) => (cmp(2) ? b.m - a.m : a.m - b.m));
    return { strong: pick((t) => multiplier(me, t), (m) => m > 1), weak: pick((t) => multiplier(me, t), (m) => m < 1), threats: pick((t) => multiplier(t, me), (m) => m > 1) };
}
// 서버 matchups -> [[공격, 방어, 배율]]. 형식 {공격:{방어:배율}} 우선, 배열 [{attacker|a, defender|d, multiplier|m}] 도 허용(병종 v2 키 구조 변화 대비). 유효 항목 없으면 []
function parseMatchups(src) {
    const out = [];
    const add = (a, d, m) => { const v = Number(m); if (a && d && Number.isFinite(v) && v > 0) out.push([String(a), String(d), v]); };
    if (Array.isArray(src)) src.forEach((x) => add(x?.attacker ?? x?.a, x?.defender ?? x?.d, x?.multiplier ?? x?.m));
    else if (src && typeof src === 'object') Object.entries(src).forEach(([a, row]) => { if (row && typeof row === 'object') Object.entries(row).forEach(([d, m]) => add(a, d, m)); });
    return out;
}

// 지형: code -> {name, symbol, mod: {move_type: {cost(null=통행불가), def_pct}}}. database/data/terrains.json 과 일치.
const T = (name, symbol, foot, mounted, heavy, flying) => ({ name, symbol, mod: { foot, mounted, heavy, flying } });
const m = (cost, def_pct) => ({ cost, def_pct });
export const TERRAINS = {
    plain: T('평지', 'p', m(1, 0), m(1, 0), m(1, 0), m(1, 0)),
    forest: T('숲', 'f', m(2, 20), m(3, 20), m(2, 20), m(1, 0)), // heavy 2: 서버 database/data/terrains.json 과 일치(이전 3 은 불일치였음)
    mountain: T('산', 'm', m(3, 30), m(null, 0), m(null, 0), m(1, 0)),
    water: T('물', 'w', m(null, 0), m(null, 0), m(null, 0), m(1, 0)),
    castle: T('성', 'c', m(1, 30), m(1, 30), m(1, 30), m(1, 30)),
};
// 지형 한글 표기(TERRAINS 에 없는 확장 지형 포함, 서버 rules 가 영문 name 을 줘도 한글 우선)
export const TERRAIN_KO = { plain: '평지', forest: '숲', mountain: '산', water: '물', castle: '성', shallows: '여울', bridge: '다리', road: '도로', swamp: '늪', snow_desert: '설원·사막', snow: '설원', desert: '사막', sand: '모래', cliff: '절벽', wall: '성벽', village: '마을', gate: '성문', hill: '언덕', sea: '바다', reef: '암초', harbor: '항구', void: '허공', rift_plank: '서가 발판' };
export const terrainName = (code) => TERRAIN_KO[code] ?? (/[가-힣]/.test(TERRAINS[code]?.name ?? '') ? TERRAINS[code].name : code);
export const terrainMod = (code, moveType) => TERRAINS[code]?.mod[moveType] ?? { cost: 1, def_pct: 0 };

// 서버 GET /api/rules 응답으로 규칙표 갱신(진입 시 1회, 실패하면 위 시작값 유지): terrains[] 전체(여울·늪·절벽·성벽·마을 등) + 병종 기본 능력치
let rulesApplied = false;
export function applyServerRules(r) {
    if (!r || rulesApplied) return;
    (r.terrains ?? []).forEach((t) => {
        if (!t?.code || !t.modifiers) return;
        const mod = {};
        Object.entries(t.modifiers).forEach(([mt, v]) => { mod[mt] = { cost: v?.cost ?? null, def_pct: v?.def_pct ?? 0 }; });
        TERRAINS[t.code] = { name: t.name ?? TERRAINS[t.code]?.name ?? t.code, symbol: t.symbol ?? TERRAINS[t.code]?.symbol, mod, elevation: Number(t.elevation ?? 0) || 0, cover: Number(t.cover ?? 0) || 0, water: Number(t.water ?? 0) || 0, boarding: Number(t.boarding ?? 0) || 0, blocks_line_of_fire: Number(t.blocks_line_of_fire ?? 0) || 0 }; // blocks_line_of_fire: 총병 사선 차단 칸 // elevation/cover: 전투 예측(고지·숲 엄폐)용. water/boarding: 수상 칸·배 탑승 칸(systems/water.js, 표시 전용)
    });
    (r.unit_types ?? []).forEach((u) => {
        if (!u?.code) return;
        if (u.atk != null && u.def != null) UNIT_BASE[u.code] = { atk: u.atk, def: u.def };
        const cur = UNIT_TYPES[u.code];
        if (cur) Object.assign(cur, { move: u.move ?? cur.move, range_min: u.range_min ?? cur.range_min, range_max: u.range_max ?? cur.range_max, move_type: u.move_type ?? cur.move_type });
        // 병종 v2 신규(assassin·monster 등): 시작값에 없으면 서버 값으로 추가(없으면 unitType 이 sword 로 폴백해 이동·사거리가 틀어짐). 표시명은 names.js 우선
        else UNIT_TYPES[u.code] = { label: u.name ?? u.code, glyph: String(u.name ?? u.code).slice(0, 1), move: u.move ?? 5, range_min: u.range_min ?? 1, range_max: u.range_max ?? 1, move_type: u.move_type ?? 'foot', heal: u.heal ?? 0 };
        if (u.hero_troop != null) UNIT_TYPES[u.code].hero_troop = !!u.hero_troop;
        if (u.alias_of && u.alias_of !== u.code) TYPE_ALIAS_ALL[u.code] = String(u.alias_of);
    });
    // 상성표: 서버 값이 있으면 통째로 교체(하드코딩 행 제거), 없거나 비어 있으면 위 시작값 유지
    const mu = parseMatchups(r.matchups);
    if (mu.length) {
        Object.keys(MATCHUPS).forEach((k) => delete MATCHUPS[k]);
        mu.forEach(([a, d, v]) => { (MATCHUPS[a] ??= {})[d] = v; });
        (r.unit_types ?? []).forEach((u) => { if (u?.code && u.alias_of && u.alias_of !== u.code) TYPE_ALIAS[u.code] = String(u.alias_of); });
    }
    rulesApplied = true;
}

// 지형 속성(서버 rules API terrains[].elevation/cover, 받기 전 0). 전투 예측 고지·숲 엄폐 판정용
export const terrainAttr = (code, k) => Number(TERRAINS[code]?.[k] ?? 0) || 0;

// config/game.php rules (시작값). 서버와 다르면 서버 우선.
export const RULES = { passive_skills: true, clamp: [0.6, 1.5], min_damage_pct: 0.15, ranged_counter: false, max_turns: 30 };

// 병종 기본 능력치(database/data/unit_types.json 시작값). 컷신 하단 'AT/DF 기본+보정' 표시용(판정은 서버). 서버 값이 바뀌면 함께 갱신 필요(rules API 요청 중)
export const UNIT_BASE = { sword: { atk: 28, def: 10 }, spear: { atk: 28, def: 10 }, cavalry: { atk: 30, def: 8 }, archer: { atk: 26, def: 5 }, mage: { atk: 28, def: 4 }, healer: { atk: 10, def: 6 }, heavy: { atk: 22, def: 15 }, flyer: { atk: 26, def: 6 }, naval: { atk: 27, def: 9 } };

export const SIDE_TEAM = { a: 'ally', b: 'enemy' };
