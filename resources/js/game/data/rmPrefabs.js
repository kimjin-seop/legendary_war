// RM MV 서드파티 타일셋 조각으로 만든 여러 칸짜리 구조물(프리팹) 정의 — 'rm' 모드 전용, 라이선스 미확인 에셋(NOTICE.md) 격리 규칙 동일.
// 교체 시 이 파일(조각 좌표)만 바꾸면 된다. 렌더·배치는 fx/rmAutotile.js(placePrefabs) 가 한다.
// 형식: { code(지형), w, h(칸 발자국), parts: [[조각, x, bottom, dw, dh, flip?], ...], shadows?: [[cx, cy, rx], ...] }
//  - 조각: RM_SPRITE 이름(B/C 오브젝트) | 'floor:<A5 타일 이름>' | 'auto:<RM_AUTO 이름>:<shape>' (shape: iso = 고립 2x2 쿼터, face = 옆면 아래 줄)
//  - 좌표: 발자국 왼쪽 위 기준 px(1칸 48). bottom = 조각 아래쪽 y(위 칸으로 넘쳐도 됨). parts 는 뒤에서 앞 순서. 그룹 정렬 기준 = 발자국 아래 y
//  - 바이옴 치환: BIOME_SUB[biome][조각 이름]
// 유닛 가림 규칙: 지형 합성 캔버스는 유닛 레이어보다 항상 아래(월드 tileLayer)라 칸을 넘은 수관·지붕이 유닛을 가리지 않는다(반투명 처리 불필요).
// 이동·공격 하이라이트·클릭 판정은 칸 격자 기준 그대로(프리팹은 시각 전용).
export const RM_PREFABS = {
    // ---- 숲 ----
    grove3x2: { code: 'forest', w: 3, h: 2, parts: [['treeBig', 0, 58, 70, 66], ['treeRound', 50, 50, 32, 60], ['treeBig', 72, 54, 70, 66], ['treeRound', 12, 96, 34, 64], ['treeBig', 50, 97, 62, 60, true], ['treeRound', 108, 96, 34, 64, true]], shadows: [[72, 92, 64]] },
    grove2x2a: { code: 'forest', w: 2, h: 2, parts: [['treeRound', -2, 52, 34, 64], ['treeRound', 60, 50, 34, 64, true], ['treeBig', 6, 94, 84, 86], ['bush', 64, 97, 30, 24]], shadows: [[48, 92, 42]] },
    grove2x2b: { code: 'forest', w: 2, h: 2, parts: [['treeRound', 2, 44, 32, 62], ['treeRound', 32, 40, 32, 62, true], ['treeRound', 62, 48, 32, 62], ['treeRound', 12, 94, 34, 66, true], ['treeRound', 50, 97, 34, 66]], shadows: [[48, 92, 40]] },
    grove2x2c: { code: 'forest', w: 2, h: 2, parts: [['treeBig', -6, 60, 62, 60], ['treeBig', 40, 66, 62, 62, true], ['treeRound', 8, 96, 32, 60], ['bush', 58, 97, 28, 22, true]], shadows: [[48, 92, 40]] },
    grove2x1: { code: 'forest', w: 2, h: 1, parts: [['treeRound', 0, 40, 32, 60], ['treeBig', 22, 48, 56, 58, true], ['treeRound', 66, 46, 30, 56]], shadows: [[48, 44, 40]] },
    grove1x2: { code: 'forest', w: 1, h: 2, parts: [['treeRound', 0, 50, 30, 58], ['treeRound', 18, 56, 30, 58, true], ['treeBig', -2, 96, 52, 56]], shadows: [[24, 92, 22]] },
    // ---- 산(작은 군집 2~3칸: 4칸 이상은 절벽 오토타일 고원 + 봉우리) ----
    ridge2x1: { code: 'mountain', w: 2, h: 1, parts: [['rockGrey', -6, 40, 58, 58], ['rockGrey', 38, 46, 62, 62, true], ['rubble', 26, 50, 26, 24]], shadows: [[48, 44, 44]] },
    // 산괴(큰 산 군집): 바위를 뒤→앞 3~4줄로 겹쳐 능선과 봉우리를 이룬다(가운데 뒤쪽이 가장 높음). 바이옴 치환(rockGrey→눈/모래)
    massif3x3a: { code: 'mountain', w: 3, h: 3, parts: [['rockGrey', 30, 52, 84, 84], ['rockGrey', -8, 70, 62, 62, true], ['rockGrey', 92, 74, 60, 60], ['rubble', 60, 82, 28, 24], ['rockGrey', 4, 112, 66, 66], ['rockGrey', 70, 116, 70, 70, true], ['rockGrey', 36, 146, 58, 58], ['rubble', 2, 146, 30, 26, true], ['rubble', 110, 146, 30, 26]], shadows: [[72, 140, 70], [72, 100, 60]] },
    massif3x3b: { code: 'mountain', w: 3, h: 3, parts: [['rockGrey', -4, 56, 70, 70], ['rockGrey', 52, 48, 90, 90, true], ['rockGrey', 18, 104, 72, 72], ['rockGrey', 84, 108, 62, 62], ['rubble', 50, 112, 28, 24], ['rockGrey', -6, 146, 56, 56, true], ['rockGrey', 60, 146, 64, 64], ['rubble', 118, 146, 26, 22]], shadows: [[72, 140, 70], [80, 96, 56]] },
    massif3x2: { code: 'mountain', w: 3, h: 2, parts: [['rockGrey', 36, 50, 78, 78], ['rockGrey', -6, 62, 58, 58, true], ['rockGrey', 92, 64, 58, 58], ['rockGrey', 8, 98, 62, 62], ['rockGrey', 74, 98, 66, 66, true], ['rubble', 56, 98, 28, 24]], shadows: [[72, 94, 70]] },
    massif2x2: { code: 'mountain', w: 2, h: 2, parts: [['rockGrey', 8, 54, 78, 78], ['rockGrey', -8, 98, 58, 58, true], ['rockGrey', 44, 98, 60, 60], ['rubble', 30, 98, 28, 24]], shadows: [[48, 94, 46], [48, 56, 34]] },
    peak1x2: { code: 'mountain', w: 1, h: 2, parts: [['rockGrey', -10, 60, 64, 64], ['rockGrey', 4, 96, 56, 56, true], ['rubble', 0, 98, 22, 20]], shadows: [[24, 92, 24], [22, 56, 22]] },
    // ---- 성 ----
    keep2x2: { code: 'castle', w: 2, h: 2, parts: [['floor:castle', 0, 48, 48, 48], ['floor:castle', 48, 48, 48, 48], ['floor:castle', 0, 96, 48, 48], ['floor:castle', 48, 96, 48, 48], ['tower', 0, 74, 32, 80], ['tower', 64, 74, 32, 80], ['auto:stoneWallFace:face', 0, 97, 96, 22], ['banner', 40, 88, 16, 34]], shadows: [[48, 92, 46]] },
    tower1x2: { code: 'castle', w: 1, h: 2, parts: [['floor:castle', 0, 48, 48, 48], ['floor:castle', 0, 96, 48, 48], ['tower', 6, 90, 36, 96], ['auto:stoneWallFace:face', 0, 97, 48, 18], ['banner', 30, 92, 14, 30]], shadows: [[24, 88, 22]] },
    keep2x1: { code: 'castle', w: 2, h: 1, parts: [['floor:castle', 0, 48, 48, 48], ['floor:castle', 48, 48, 48, 48], ['tower', 2, 40, 30, 70], ['tower', 64, 40, 30, 70], ['auto:stoneWallFace:face', 0, 49, 96, 20], ['banner', 40, 44, 15, 32]], shadows: [[48, 44, 44]] },
    // ---- 마을 ----
    house2x2: { code: 'village', w: 2, h: 2, parts: [['auto:roofOrange:iso', 4, 58, 88, 64], ['auto:wallPlaster:iso', 8, 94, 80, 36], ['door', 40, 95, 18, 24], ['window', 14, 82, 14, 14], ['window', 68, 82, 14, 14], ['barrel', 84, 97, 14, 16]], shadows: [[48, 94, 46]] },
    house2x1: { code: 'village', w: 2, h: 1, parts: [['auto:roofWood:iso', 2, 22, 92, 38], ['auto:wallWood:iso', 6, 47, 84, 25], ['door', 16, 48, 14, 19], ['window', 44, 38, 12, 12], ['window', 68, 38, 12, 12]], shadows: [[48, 46, 46]] },

    // ---- 큰 오브젝트 확장(2026-11 사용자 요청: 4~5칸짜리 B/C 오브젝트 활용) ----
    // 숲: 거목·눈 덮인 나무
    giant2x2: { code: 'forest', w: 2, h: 2, parts: [['treeRound', 62, 40, 30, 58, true], ['treeBig', -6, 96, 108, 108], ['bush', 2, 98, 26, 20]], shadows: [[48, 90, 50]] },
    giantGrove2x3: { code: 'forest', w: 2, h: 3, parts: [['treeBig', -8, 92, 112, 112], ['treeRound', 0, 110, 34, 64], ['treeRound', 60, 118, 34, 64, true], ['treeRound', 20, 144, 36, 68], ['bush', 66, 145, 26, 22, true]], shadows: [[48, 88, 50], [48, 140, 44]] },
    snowGrove2x2: { code: 'forest', w: 2, h: 2, biome: 'snow', parts: [['snowPine', 4, 48, 34, 66], ['snowTree', 6, 96, 90, 90], ['snowPine', 64, 98, 30, 60, true]], shadows: [[48, 92, 44]] },
    // 마을(town): 큰 지붕(C 시트 3x3 우진각 지붕) + A3 벽 + 문·창·도머
    mansion3x3: { code: 'village', w: 3, h: 3, style: 'town', parts: [['roofGreenHip', 0, 100, 144, 132], ['auto:wallPlaster:iso', 6, 144, 132, 46], ['door', 62, 145, 22, 28], ['window', 18, 130, 16, 16], ['window', 40, 130, 16, 16], ['window', 90, 130, 16, 16], ['window', 112, 130, 16, 16], ['dormer', 30, 66, 26, 26], ['dormer', 88, 66, 26, 26]], shadows: [[72, 142, 72]] },
    hall3x2: { code: 'village', w: 3, h: 2, style: 'town', parts: [['roofGreenHip', 2, 64, 140, 104], ['auto:wallPlaster:iso', 8, 96, 128, 34], ['door', 62, 97, 20, 24], ['window', 24, 86, 14, 14], ['window', 106, 86, 14, 14], ['dormer', 58, 34, 28, 28]], shadows: [[72, 94, 70]] },
    inn3x2: { code: 'village', w: 3, h: 2, style: 'town', parts: [['roofBrownHip', 2, 64, 140, 104], ['auto:wallWood:iso', 8, 96, 128, 34], ['door', 30, 97, 20, 24], ['signInn', 62, 84, 30, 20], ['window', 104, 86, 14, 14], ['barrel', 124, 98, 16, 18]], shadows: [[72, 94, 70]] },
    storehouse3x2: { code: 'village', w: 3, h: 2, style: 'town', parts: [['roofYellowHip', 2, 64, 140, 104], ['auto:wallWood:iso', 8, 96, 128, 34], ['gateWood', 56, 98, 32, 30], ['barrel', 8, 98, 16, 18], ['barrel', 22, 99, 16, 18, true]], shadows: [[72, 94, 70]] },
    // 마을(camp, 군영): 대형 천막
    tent3x2: { code: 'village', w: 3, h: 2, style: 'camp', parts: [['tentWhite', 0, 97, 144, 144], ['bannerB', 128, 98, 16, 34]], shadows: [[72, 92, 70]] },
    tentRed3x2: { code: 'village', w: 3, h: 2, style: 'camp', parts: [['tentRed', 0, 97, 144, 144], ['bannerC', 0, 98, 16, 34, true]], shadows: [[72, 92, 70]] },
    tent2x2: { code: 'village', w: 2, h: 2, style: 'camp', parts: [['tentWhite', 0, 96, 96, 96]], shadows: [[48, 92, 46]] },
    // 마을 소품 세트(마을 군집 4칸 이상에서 집 사이를 채움 / decor)
    market4x2: { code: 'village', w: 4, h: 2, style: 'town', parts: [['market', 0, 94, 192, 96], ['signpost', 168, 98, 24, 24]], shadows: [[96, 92, 92]] },
    wellSquare2x1: { code: 'village', w: 2, h: 1, style: 'town', low: true, parts: [['well', 6, 44, 40, 40], ['barrel', 54, 44, 16, 18], ['crops', 68, 47, 26, 26]], shadows: [[26, 42, 20]] },
    // 성: 성문 구간·대탑·본관
    keep4x4: { code: 'castle', w: 4, h: 4, parts: [
        ...[0, 48, 96, 144].flatMap((x) => [48, 96, 144, 192].map((b) => ['floor:castle', x, b, 48, 48])),
        ['towerRound', 0, 110, 52, 130], ['towerRound', 140, 110, 52, 130, true], ['tower', 64, 120, 64, 150],
        ['auto:stoneWallTop:iso', 0, 168, 192, 26], ['auto:stoneWallFace:face', 0, 193, 192, 26], ['gateDoor', 80, 193, 32, 44],
        ['towerRound', -4, 194, 50, 112], ['towerRound', 146, 194, 50, 112, true], ['bannerB', 52, 186, 16, 34], ['bannerB', 124, 186, 16, 34, true]], shadows: [[96, 188, 96]] },
    gate4x3: { code: 'castle', w: 4, h: 3, parts: [['auto:stoneWallTop:iso', 0, 108, 192, 34], ['auto:stoneWallFace:face', 0, 144, 192, 40], ['gateDoor', 76, 145, 40, 64], ['towerRound', -2, 146, 56, 132], ['towerRound', 138, 146, 56, 132, true], ['bannerB', 60, 128, 16, 36], ['bannerB', 116, 128, 16, 36, true]], shadows: [[96, 142, 96]] },
    tower3x4: { code: 'castle', w: 3, h: 4, parts: [['floor:castle', 0, 192, 48, 48], ['floor:castle', 48, 192, 48, 48], ['floor:castle', 96, 192, 48, 48], ['towerRound', 12, 190, 120, 260], ['bannerB', 2, 192, 16, 36], ['bannerB', 126, 192, 16, 36, true]], shadows: [[72, 186, 64]] },
    // 중립 장식(decor 전용, 지형 코드 자동 선택 없음). low = 이동 가능 칸 위에 놓아도 유닛을 가리지 않는 낮은 오브젝트
    statue1x2: { w: 1, h: 2, parts: [['statueKnight', 2, 94, 44, 88]], shadows: [[24, 92, 18]] },
    statueMage1x2: { w: 1, h: 2, parts: [['statueMage', 2, 94, 44, 88]], shadows: [[24, 92, 18]] },
    statueDragon2x2: { w: 2, h: 2, parts: [['statueDragon', 0, 94, 96, 96]], shadows: [[48, 90, 42]] },
    obelisk1x2: { w: 1, h: 2, parts: [['obelisk', 2, 94, 44, 88]], shadows: [[24, 92, 16]] },
    colonnade3x1: { w: 3, h: 1, parts: [['column', 0, 46, 40, 80], ['columnMoss', 52, 46, 40, 80], ['column', 104, 46, 40, 80, true]], shadows: [[72, 44, 66]] },
    monument4x2: { w: 4, h: 2, parts: [['monument', 0, 94, 192, 64]], shadows: [[96, 92, 92]] },
    altar2x1: { w: 2, h: 1, parts: [['stele', 4, 46, 30, 60], ['pillarCarved', 60, 46, 30, 60, true]], shadows: [[48, 44, 40]] },
    bannerRow1x2: { w: 1, h: 2, low: true, parts: [['bannerB', 4, 70, 18, 40], ['bannerC', 26, 94, 18, 40, true]] },
    lanterns1x2: { w: 1, h: 2, low: true, parts: [['lantern', 4, 70, 18, 40], ['lantern', 26, 94, 18, 40]] },
};

// 지형 코드별 시도 순서(큰 것부터). 같은 크기는 좌표 해시로 변형 선택
// 그룹 안에서 바이옴(biome)·마을 양식(style: map.villageStyle 'town'|'camp', 없으면 둘 다)에 맞는 후보만 남긴 뒤 해시로 고른다
export const PREFAB_ORDER = {
    forest: [['grove3x2'], ['giantGrove2x3'], ['grove2x2a', 'grove2x2b', 'grove2x2c', 'giant2x2', 'snowGrove2x2'], ['grove2x1'], ['grove1x2']],
    mountain: [['massif3x3a', 'massif3x3b'], ['massif3x2'], ['massif2x2'], ['ridge2x1'], ['peak1x2']],
    castle: [['keep4x4'], ['tower3x4'], ['gate4x3'], ['keep2x2'], ['tower1x2'], ['keep2x1']],
    village: [['mansion3x3'], ['hall3x2', 'inn3x2', 'storehouse3x2', 'tent3x2', 'tentRed3x2'], ['market4x2'], ['house2x2', 'tent2x2'], ['house2x1', 'wellSquare2x1']],
};

// decor 배치 규칙 검사(맵 데이터 decor:[{prefab,x,y,flip?}] — 시각 전용, 이동·방어 판정 불변).
// blocked(code) = 이동 불가/배치 불가로 볼 지형(기본: 성벽·산·절벽·물). 반환: 문제 목록(빈 배열이면 통과)
export function validateDecor(map, decor = map.decor ?? [], blocked = (c) => ['wall', 'mountain', 'cliff', 'water'].includes(c)) {
    const out = [];
    const used = new Map();
    (decor ?? []).forEach((d, i) => {
        const pf = RM_PREFABS[d?.prefab];
        if (!pf) { out.push(`#${i} 알 수 없는 프리팹 ${d?.prefab}`); return; }
        if (!(d.x >= 0 && d.y >= 0 && d.x + pf.w <= map.w && d.y + pf.h <= map.h)) { out.push(`#${i} ${d.prefab} 맵 범위 밖 (${d.x},${d.y}) ${pf.w}x${pf.h}`); return; }
        for (let y = d.y; y < d.y + pf.h; y++) {
            for (let x = d.x; x < d.x + pf.w; x++) {
                const k = `${x},${y}`;
                if (used.has(k)) out.push(`#${i} ${d.prefab} 이 #${used.get(k)} 와 (${k}) 에서 겹침`);
                used.set(k, i);
                const edge = x === 0 || y === 0 || x === map.w - 1 || y === map.h - 1;
                if (!pf.low && !blocked(map.tiles[y][x]) && !edge) out.push(`#${i} ${d.prefab} 높은 오브젝트가 이동 가능 칸 (${k}) ${map.tiles[y][x]} 위 — 이동 불가 칸·가장자리 권장 또는 low 프리팹 사용`);
            }
        }
    });
    return out;
}

export const BIOME_SUB = {
    snow: { treeRound: 'snowPine', treeBig: 'snowTree', roofGreenHip: 'roofSnowHip', roofYellowHip: 'roofSnowHip', roofBrownHip: 'roofSnowHip', dormer: 'dormerSnow', rockGrey: 'rockSnow', bush: 'rockSnow', 'auto:roofOrange:iso': 'auto:roofSnow:iso', 'auto:roofWood:iso': 'auto:roofSnow:iso' },
    desert: { treeRound: 'palm', treeBig: 'palm', roofGreenHip: 'roofYellowHip', rockGrey: 'rockSand', bush: 'cactus', 'auto:roofOrange:iso': 'auto:roofYellow:iso', 'auto:wallPlaster:iso': 'auto:wallSandstone:iso', 'auto:wallWood:iso': 'auto:wallSandstone:iso' },
};
