// 수상 표시 헬퍼(순수 함수, Phaser 의존 없음 -> node 검증 가능). 판정은 서버(RuleSet::isWater/isBoarded)가 하고 FE 는 표시만.
// 서버 유닛 뷰의 boarded/naval/on_water 가 있으면 그 값을 쓰고, 이동 연출 중간 칸처럼 서버 값이 없을 때만 지형 속성으로 추정한다.
// 지형 속성: /api/rules terrains[].water/boarding(data/rules.js TERRAINS) -> 받기 전이면 아래 시작값(database/data/terrains.json 과 동일)
import { TERRAINS, unitType, typeAlias } from '../data/rules.js';

const WATER0 = new Set(['water', 'shallows', 'sea', 'reef', 'harbor']);
const BOARD0 = new Set(['sea', 'reef']);
const attr = (code, k, dflt) => (TERRAINS[code] && TERRAINS[code][k] != null ? Number(TERRAINS[code][k]) > 0 : dflt.has(code));
export const isWaterTerrain = (code) => attr(code, 'water', WATER0);
export const isBoardingTerrain = (code) => attr(code, 'boarding', BOARD0);

// 유닛 + 칸 지형 -> { onWater, boarded, naval }. 서버 RuleSet::isBoarded 와 같은 규칙(foot·mounted·heavy 만 탑승, flying 은 없음)
// 수병 판정(병종 v2): 서버 /api/rules 의 move_type naval(신규 병종 포함, 별칭 alias_of 반영) 또는 구 코드 sailor
export const isNavalType = (type) => !!type && (type === 'sailor' || unitType(typeAlias(type)).move_type === 'naval');
export function waterStateAt(unit, code) {
    const mt = unitType(typeAlias(unit?.type)).move_type;
    const naval = isNavalType(unit?.type);
    return { onWater: isWaterTerrain(code), boarded: !naval && isBoardingTerrain(code) && ['foot', 'mounted', 'heavy'].includes(mt), naval };
}
// 서버 뷰 값 우선(boarded/naval/on_water 키가 하나라도 있으면 서버 값), 없으면 지형 추정
export function waterStateOf(unit, code) {
    if (unit && (unit.boarded != null || unit.naval != null || unit.on_water != null)) return { onWater: !!unit.on_water, boarded: !!unit.boarded, naval: !!unit.naval };
    return waterStateAt(unit, code);
}
// 배 오버레이 표시 여부: 탑승(boarded) 또는 수병(naval, 서버 계약상 '항상 자기 배' -> 육상 칸에서도 배 유지)
export const showsShip = (ws) => !!(ws && (ws.boarded || ws.naval));
// 이동 칸 표시 종류(표시 전용, 이동 가능 여부는 서버 reachable tiles 그대로): 'sea' = 수병이 들어가는 수상 칸, 'board' = 비수병이 배에 올라 서는 탑승 칸, null = 일반
export function moveTileKind(unit, code) {
    if (!unit || !code) return null;
    const ws = waterStateAt(unit, code);
    if (ws.naval) return ws.onWater ? 'sea' : null;
    return ws.boarded ? 'board' : null;
}

// 배 종류(안아트 ship_spec.json types): 이순신 = 거북선, 문화권 korea 판옥선 / japan 세키부네(지휘관·보스 = 아타케부네) / europe 서양 갤리 / china 중국 전선 / 그 외 기본형
export function shipTypeOf(unit) {
    if (!unit) return 'default';
    if (unit.hero === 'yi_sun_sin' && unit.kind !== 'troop') return 'korea_geobukseon';
    switch (unit.culture) {
    case 'korea': return 'korea_panokseon';
    case 'japan': return unit.kind === 'commander' || unit.commander || unit.boss ? 'japan_atakebune' : 'japan_sekibune';
    case 'europe': return 'west_galley';
    case 'china': return 'china_junk';
    default: return 'default';
    }
}
// 텍스처 키(manifest ship_overlay.<type>.<back|front> -> assets.texKey). 해당 종류 시트가 없으면 default
export const shipTexKey = (type, part) => `ship_overlay_${type}_${part}`;
export const SHIP_ROW = { down: 0, left: 1, right: 2, up: 3 }; // ship_spec.json row_order(= assets SHEET_ROW)
export const shipFrame = (dir, f) => (SHIP_ROW[dir] ?? 0) * 4 + ((f | 0) % 4);
