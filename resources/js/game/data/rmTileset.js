// RPG Maker MV 'Outside' 타일셋(서드파티, 라이선스 미확인 — 개발 프로토타입 한정, 배포 전 교체 필요) 설정.
// - 파일: public/assets/third_party/rpgmaker_mv_outside/ (NOTICE.md 참조). public/assets/manifest.json 에는 넣지 않는다(안아트 manifest 분리).
// - 이 파일과 fx/rmAutotile.js · fx/RmGround.js 만 이 에셋을 참조한다. settings.terrainStyle = 'legacy' 면 로드·사용하지 않는다.
// - 교체/삭제: 위 폴더 + 이 파일 + fx/rmAutotile.js + fx/RmGround.js 를 지우고 terrainStyle 분기(assets/Battle/Deploy/PropLayer)를 걷어내면 된다.
// 좌표 단위: 타일(48px). 오토타일 블록 원점(bx, by)은 RPG Maker MV 표준 배치(A1~A4 kind 규약)를 실제 시트로 확인한 값.

export const RM_DIR = '/assets/third_party/rpgmaker_mv_outside/';
export const RM_PX = 48; // RM MV 타일 크기(쿼터 24px)
export const RM_SHEETS = { A1: 'Outside_A1.png', A2: 'Outside_A2.png', A3: 'Outside_A3.png', A4: 'Outside_A4.png', A5: 'Outside_A5.png', B: 'Outside_B.png', C: 'Outside_C.png' };
export const rmTexKey = (sheet) => `rm_${sheet}`; // Phaser 텍스처 키(manifest 키와 겹치지 않게 rm_ 접두)

// 오토타일 블록. type: floor(2x3 타일, 47형) | wall(2x2 타일, 16형). anim: 애니메이션 프레임 간격(타일, A1 수면 3프레임은 가로 2타일 간격)
export const RM_AUTO = {
    // A2 지면(왼쪽 절반 = 불투명 지면, 둘레에 바탕 지면이 구워져 있음)
    grass: { sheet: 'A2', bx: 0, by: 0, type: 'floor' }, //            A2 kind 0  풀밭
    sandOnGrass: { sheet: 'A2', bx: 2, by: 0, type: 'floor' }, //      A2 kind 1  풀 위 모래
    cobbleOnGrass: { sheet: 'A2', bx: 4, by: 0, type: 'floor' }, //    A2 kind 2  풀 위 자갈길
    flagOnGrass: { sheet: 'A2', bx: 6, by: 0, type: 'floor' }, //      A2 kind 3  풀 위 판석
    snowPile: { sheet: 'A2', bx: 8, by: 9, type: 'floor' }, //         A2 kind 28 눈 더미(투명 테두리 오버레이)
    darkGrass: { sheet: 'A2', bx: 14, by: 6, type: 'floor' }, //       A2 kind 23 짙은 풀(투명 테두리 오버레이) — 숲 바닥
    // A1 수면(3프레임: bx, bx+2, bx+4). 둘레 지면이 구워져 있어 바이옴에 맞춰 고른다
    waterGrass: { sheet: 'A1', bx: 0, by: 0, type: 'floor', anim: 2 }, // A1 kind 0  풀 둘레 물
    waterSand: { sheet: 'A1', bx: 0, by: 6, type: 'floor', anim: 2 }, //  A1 kind 8  모래 둘레 물
    waterDirt: { sheet: 'A1', bx: 0, by: 9, type: 'floor', anim: 2 }, //  A1 kind 10 흙 둘레 물
    // A4 벽형(윗면 floor + 옆면 wall)
    leavesTop: { sheet: 'A4', bx: 2, by: 10, type: 'floor' }, //       A4 kind 33 수풀 윗면(내부 구멍 없음, 테두리가 직선)
    treeTop: { sheet: 'A4', bx: 4, by: 10, type: 'floor' }, //         A4 kind 34 나무 윗면(테두리 잎이 불규칙, 내부는 검은 구멍 -> leavesTop 내부로 대체)
    trunksFace: { sheet: 'A4', bx: 4, by: 13, type: 'wall' }, //       A4 kind 42 나무줄기 옆면
    snowTrunksFace: { sheet: 'A4', bx: 6, by: 13, type: 'wall' }, //   A4 kind 43 눈 숲 옆면
    cliffGrassTop: { sheet: 'A4', bx: 8, by: 10, type: 'floor' }, //   A4 kind 36 풀 절벽 윗면
    cliffGrassFace: { sheet: 'A4', bx: 8, by: 13, type: 'wall' }, //   A4 kind 44
    cliffSandTop: { sheet: 'A4', bx: 10, by: 10, type: 'floor' }, //  A4 kind 37 모래 절벽
    cliffSandFace: { sheet: 'A4', bx: 10, by: 13, type: 'wall' },
    cliffDirtTop: { sheet: 'A4', bx: 12, by: 10, type: 'floor' }, //  A4 kind 38 흙 절벽
    cliffDirtFace: { sheet: 'A4', bx: 12, by: 13, type: 'wall' },
    cliffSnowTop: { sheet: 'A4', bx: 14, by: 10, type: 'floor' }, //  A4 kind 39 눈 절벽
    cliffSnowFace: { sheet: 'A4', bx: 14, by: 13, type: 'wall' },
    rockTop: { sheet: 'A4', bx: 4, by: 5, type: 'floor' }, //          A4 kind 18 회색 잡석 윗면(절벽)
    rockFace: { sheet: 'A4', bx: 4, by: 8, type: 'wall' }, //          A4 kind 26 잡석 옆면
    stoneWallTop: { sheet: 'A4', bx: 0, by: 0, type: 'floor' }, //     A4 kind 0  회색 석벽 윗면
    stoneWallFace: { sheet: 'A4', bx: 0, by: 3, type: 'wall' }, //     A4 kind 8  석벽 옆면
    // A3 건물(지붕/벽 모두 wall 형)
    roofOrange: { sheet: 'A3', bx: 4, by: 0, type: 'wall' }, //        A3 kind 2  주황 기와 지붕
    roofYellow: { sheet: 'A3', bx: 6, by: 0, type: 'wall' }, //        A3 kind 3  노란 지붕(사막)
    roofSnow: { sheet: 'A3', bx: 10, by: 4, type: 'wall' }, //         A3 kind 21 눈 지붕
    wallPlaster: { sheet: 'A3', bx: 2, by: 2, type: 'wall' }, //       A3 kind 9  회벽
    wallSandstone: { sheet: 'A3', bx: 0, by: 2, type: 'wall' }, //     A3 kind 8  사암 벽
    wallStone: { sheet: 'A3', bx: 2, by: 6, type: 'wall' }, //         A3 kind 25 석재 벽
    roofWood: { sheet: 'A3', bx: 8, by: 0, type: 'wall' }, //          A3 kind 4  너와(목재) 지붕
    roofNavy: { sheet: 'A3', bx: 14, by: 0, type: 'wall' }, //         A3 kind 7  남색 기와 지붕
    wallWood: { sheet: 'A3', bx: 8, by: 2, type: 'wall' }, //          A3 kind 12 판자 벽
};

// 작은 군집(1~3칸) 스프라이트 원본: 이름 -> [sheet, tx, ty, tw, th, ox?, oy?, w?, h?] (타일 좌표, 선택적 픽셀 오프셋·크기)
export const RM_SPRITE = {
    treeRound: ['B', 13, 3, 1, 2], treeBig: ['B', 8, 6, 2, 2], bush: ['B', 14, 4, 1, 1], snowPine: ['B', 13, 11, 1, 2], palm: ['B', 12, 13, 1, 2],
    rockGrey: ['B', 15, 3, 1, 1], rockSand: ['B', 15, 4, 1, 1], rockSnow: ['B', 15, 11, 1, 1], rubble: ['C', 2, 3, 1, 1],
    tower: ['C', 10, 6, 2, 5], banner: ['C', 0, 12, 1, 2], barrel: ['B', 13, 1, 1, 1], stones: ['B', 11, 5, 1, 1], cactus: ['B', 14, 13, 1, 1], reed: ['A1', 6, 3, 1, 1],
    door: ['B', 2, 14, 1, 1, 4, 0, 40, 48], window: ['B', 0, 12, 1, 1, 8, 8, 32, 32],
    // 큰 오브젝트(프리팹용, 시트 실측 좌표)
    tentWhite: ['B', 5, 0, 3, 3], tentRed: ['B', 5, 3, 3, 3], snowTree: ['B', 8, 8, 2, 2], market: ['B', 12, 6, 4, 2],
    well: ['B', 11, 1, 1, 1], gateWood: ['B', 13, 2, 1, 1], signpost: ['B', 9, 1, 1, 1], signInn: ['B', 6, 8, 1, 1], crops: ['B', 12, 5, 1, 1],
    roofGreenHip: ['C', 8, 0, 3, 3], roofSnowHip: ['C', 13, 0, 3, 3], roofYellowHip: ['C', 8, 3, 3, 3], roofBrownHip: ['C', 13, 3, 3, 3],
    dormer: ['C', 12, 6, 1, 1], dormerSnow: ['C', 13, 6, 1, 1], towerRound: ['C', 8, 6, 2, 5], gateDoor: ['C', 7, 14, 1, 2],
    obelisk: ['C', 0, 0, 1, 2], column: ['C', 1, 0, 1, 2], columnMoss: ['C', 3, 0, 1, 2], pillarCarved: ['C', 5, 0, 1, 2], stele: ['C', 0, 4, 1, 2],
    statueKnight: ['C', 0, 8, 1, 2], statueMage: ['C', 1, 8, 1, 2], statueAngel: ['C', 2, 8, 1, 2], statueGold: ['C', 7, 8, 1, 2], statueDragon: ['C', 5, 8, 2, 2],
    monument: ['C', 2, 4, 6, 2], bannerB: ['C', 1, 12, 1, 2], bannerC: ['C', 2, 12, 1, 2], lantern: ['C', 4, 12, 1, 2],
};

// A5/B/C 단일 타일(타일 좌표 [sheet, tx, ty, tw=1, th=1])
export const RM_TILES = {
    bridgeH: [['A5', 5, 0], ['A5', 6, 0], ['A5', 7, 0]], // 가로 다리: 서쪽 끝 / 가운데 / 동쪽 끝
    bridgeV: [['A5', 2, 0], ['A5', 3, 0], ['A5', 2, 1]], // 세로 다리: 북쪽 끝 / 가운데 / 남쪽 끝
    door: ['B', 3, 13], // 아치 문(축소해 집 정면에)
    castleFloor: [['A5', 0, 5], ['A5', 1, 5]], // 회색 큰 석재 바닥(성)
};

// 소품(PropLayer rm 모드): 이름 -> [sheet, tx, ty, tw, th]. 바닥 중앙 기준점으로 그린다(48px 원본, 표시 배율 TILE/48)
export const RM_PROPS = {
    tuft0: ['B', 9, 3, 1, 1], tuft1: ['B', 10, 3, 1, 1], flowerA: ['B', 8, 4, 1, 1], flowerB: ['B', 10, 4, 1, 1],
    rockGrey: ['B', 15, 3, 1, 1], rockSand: ['B', 15, 4, 1, 1], rockSnow: ['B', 15, 11, 1, 1], pebbles: ['B', 11, 5, 1, 1],
    stump: ['B', 12, 3, 1, 1], cactus: ['B', 14, 13, 1, 1], palm: ['B', 12, 13, 1, 2], deadTree: ['B', 8, 13, 1, 2],
    snowPine: ['B', 13, 11, 1, 2], lily0: ['B', 13, 15, 1, 1], lily1: ['B', 15, 15, 1, 1], reed: ['A1', 6, 3, 1, 1],
    banner: ['C', 0, 12, 1, 2], barrel: ['B', 13, 1, 1, 1], pot: ['B', 8, 2, 1, 1], rubble: ['C', 2, 3, 1, 1],
};

// 지형 코드 -> RM 표현. biome: desert | snow(snow_desert 이면서 desert 아님) | swamp | 기타(temperate)
// elev: 높이 순위(남쪽 이웃 순위가 더 낮으면 칸 아래쪽 절반에 옆면을 그림). 근거 수준은 NOTICE.md 매핑표 참조
export function rmRecipe(code, biome) {
    const snow = biome === 'snow'; const desert = biome === 'desert';
    switch (code) {
    case 'plain': return { ground: 'grass' };
    case 'forest': return { ground: 'grass', elev: 1, top: 'leavesTop', corner: 'treeTop', face: snow ? 'snowTrunksFace' : 'trunksFace' };
    // 산 군집: 풀 고원 + 봉우리 바위(rmAutotile 7단계). 절벽: 흙 절벽 + 모든 칸 큰 바위(판석 kind18 은 광장처럼 보여 제외 — 안아트 검토)
    case 'mountain': return { ground: 'grass', elev: 1, top: snow ? 'cliffSnowTop' : desert ? 'cliffSandTop' : 'cliffGrassTop', face: snow ? 'cliffSnowFace' : desert ? 'cliffSandFace' : 'cliffGrassFace' };
    case 'cliff': return { ground: 'grass', elev: 2, top: snow ? 'cliffSnowTop' : 'cliffDirtTop', face: snow ? 'cliffSnowFace' : 'cliffDirtFace' };
    case 'wall': return { ground: 'grass', elev: 2, top: 'stoneWallTop', face: 'stoneWallFace' };
    case 'castle': return { ground: 'grass', tiles: RM_TILES.castleFloor }; // 군집(4칸 이상): 사각 석재 바닥. 작은 군집은 rmAutotile 의 소형 성채 스프라이트
    case 'road': return { ground: 'cobbleOnGrass' };
    case 'snow_desert': return { ground: desert ? 'sandOnGrass' : 'snowPile' };
    case 'village': return { ground: 'grass', house: snow ? ['roofSnow', 'wallStone'] : desert ? ['roofYellow', 'wallSandstone'] : ['roofOrange', 'wallPlaster'] };
    case 'water': return { wet: 'deep' };
    case 'shallows': return { wet: 'shallow' };
    case 'swamp': return { wet: 'swamp' };
    case 'bridge': return { bridge: true };
    default: return { ground: 'grass' };
    }
}

// 맵 바이옴 추정(서버가 biome 을 주지 않을 수 있음): desert 명시 > 설원(snow_desert 가 있고 desert 아님) > 늪 위주 > temperate
export function rmBiome(map) {
    if (map.biome === 'desert' || map.biome === 'snow' || map.biome === 'swamp') return map.biome;
    let sw = 0; let wa = 0; let sn = 0;
    map.tiles.forEach((r) => r.forEach((c) => { if (c === 'swamp') sw += 1; else if (c === 'water') wa += 1; else if (c === 'snow_desert') sn += 1; }));
    if (sn) return 'snow';
    if (sw > wa) return 'swamp';
    return map.biome ?? 'temperate';
}
// 수면 둘레 지면: 사막=모래, 늪=흙, 그 외 풀
export const rmWaterAuto = (biome) => (biome === 'desert' ? 'waterSand' : biome === 'swamp' ? 'waterDirt' : 'waterGrass');

// 소품 배치(지형별, r = 시드 난수, k = 밀도 배율). 숲·산·성·마을은 합성기(오토타일 군집/작은 군집 스프라이트)가 그리므로 소품 없음.
// 크기 s(0.55~1.0)를 섞어 '찍어낸' 느낌을 줄인다(PropLayer 가 표시 배율에 곱함)
export function rmPropsFor(code, r, k, biome) {
    const out = [];
    const add = (f, x, y, s0 = 0.55, s1 = 1) => out.push({ f, x: Math.round(x), y: Math.round(y), flip: r() < 0.5, s: s0 + r() * (s1 - s0) });
    const chance = (p) => r() < p * k;
    switch (code) {
    case 'plain': if (chance(0.22)) add(['tuft0', 'tuft1', 'flowerA', 'flowerB'][Math.floor(r() * 4)], 10 + r() * 28, 30 + r() * 16, 0.45, 0.9); break;
    case 'shallows': if (chance(0.08)) add(r() < 0.5 ? 'lily0' : 'lily1', 12 + r() * 24, 24 + r() * 20, 0.5, 0.8); break;
    case 'swamp': if (chance(0.25)) add('reed', 10 + r() * 28, 30 + r() * 16, 0.6, 1); else if (chance(0.08)) add('deadTree', 24, 46, 0.8, 1); break;
    case 'snow_desert':
        if (biome === 'desert') { if (chance(0.12)) add('cactus', 12 + r() * 24, 40 + r() * 6); else if (chance(0.05)) add('palm', 24, 46); }
        else if (chance(0.1)) add('snowPine', 24, 46); else if (chance(0.1)) add('rockSnow', 12 + r() * 24, 40);
        break;
    default: break;
    }
    return out;
}
