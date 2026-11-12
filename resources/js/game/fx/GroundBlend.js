import { L } from '../layout.js';
import { TILE } from '../UnitView.js';
import { settings } from '../settings.js';
import { terrainTileKey, tileColors } from '../systems/terrainTiles.js';

// 지형 경계 전이(코드, 에셋 없음) — 기본 꺼짐(settings.terrainBlend === true 일 때만 생성).
// 2026-11 사용자 피드백("경계 후광이 지저분함") 원인: 고정 대표색(실제 타일보다 훨씬 밝고 채도 높음)을 경계 양쪽 칸에 3도트 깊이로
// 서로 칠해(폭 약 46%) 칸마다 사각 후광 + 계단 노이즈가 생겼고, 도트(4 로컬 단위)가 64px 텍셀 격자와 맞지 않았다.
// 정리: 기본 off. 켜면 (1) 색은 실제 이웃 타일 가장자리 평균색(실측) (2) 우선순위가 낮은 바닥 지형 쪽에서 높은 쪽으로 한 방향만,
// 높은 쪽 칸 가장자리 2도트에만(바닥이 사물 타일의 다른 톤 테두리를 덮는 방향) (3) 도트 크기 TILE/16 = 64px 타일 4텍셀에 정렬.
// 진짜 연속 표현은 전이 타일 에셋(안아트) 필요 — 이 모듈은 보조 수단.
// - 도로·다리·성벽·절벽은 선형/조각 지형이라 선명한 경계를 유지(전이 제외).
// - 8x8 칸 청크마다 Graphics 1개(진입 시 1회 생성) + 화면 밖 청크 숨김. 설정 terrainSmooth=false 면 Battle 이 생성하지 않음.
const CHUNK = 8;
// 낮을수록 바닥(번지는 쪽). 같은 순위끼리는 전이 없음.
const PRI = { plain: 0, snow_desert: 0, swamp: 1, shallows: 1, water: 2, village: 3, forest: 3, castle: 4, mountain: 4 };
const SHARP = new Set(['road', 'bridge', 'wall', 'cliff']);
const CELL = TILE / 16; // 64px 타일 기준 4텍셀
const ROWS = 2;

export class GroundBlend {
    constructor(scene, parent, map) {
        this.chunks = [];
        if (settings.get().terrainBlend !== true) return; // 기본 꺼짐
        const COL = {};
        const colorOf = (x, y) => {
            const k = terrainTileKey(scene, map, x, y);
            if (!k) return null;
            if (!(k in COL)) { const c = tileColors(scene, k); COL[k] = c ? (Math.round(c.edge[0]) << 16) | (Math.round(c.edge[1]) << 8) | Math.round(c.edge[2]) : null; }
            return COL[k];
        };
        for (let cy = 0; cy < map.h; cy += CHUNK) {
            for (let cx = 0; cx < map.w; cx += CHUNK) {
                const g = scene.add.graphics();
                let n = 0;
                for (let y = cy; y < Math.min(map.h, cy + CHUNK); y++) {
                    for (let x = cx; x < Math.min(map.w, cx + CHUNK); x++) {
                        const me = map.tiles[y][x];
                        if (SHARP.has(me) || PRI[me] == null) continue;
                        [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => {
                            const nb = map.tiles[y + dy]?.[x + dx];
                            if (!nb || nb === me || SHARP.has(nb) || PRI[nb] == null || PRI[nb] >= PRI[me]) return; // 바닥(낮은 순위) -> 높은 순위 칸으로만
                            const col = colorOf(x + dx, y + dy);
                            if (col == null) return;
                            g.fillStyle(col, 1);
                            const X = x * TILE; const Y = y * TILE;
                            for (let r = 0; r < ROWS; r++) {
                                for (let i = 0; i < TILE / CELL; i++) {
                                    // 경계 줄은 대부분 채우고(3/4), 안쪽 줄은 드물게(1/4). 위치 해시로 고정
                                    const h = ((x * 73 + y * 151 + i * 31 + r * 17 + dx * 7 + dy * 13) >>> 0) % 4;
                                    if ((r === 0 && h === 3) || (r === 1 && h > 0)) continue;
                                    const along = i * CELL; const depth = r * CELL;
                                    if (dy === -1) g.fillRect(X + along, Y + depth, CELL, CELL);
                                    else if (dy === 1) g.fillRect(X + along, Y + TILE - CELL - depth, CELL, CELL);
                                    else if (dx === -1) g.fillRect(X + depth, Y + along, CELL, CELL);
                                    else g.fillRect(X + TILE - CELL - depth, Y + along, CELL, CELL);
                                    n += 1;
                                }
                            }
                        });
                    }
                }
                if (!n) { g.destroy(); continue; }
                parent.add(g);
                this.chunks.push({ g, x0: cx * TILE, y0: cy * TILE, x1: Math.min(map.w, cx + CHUNK) * TILE, y1: Math.min(map.h, cy + CHUNK) * TILE });
            }
        }
    }

    cull(world) {
        const s = world.scaleX;
        this.chunks.forEach((c) => {
            const vis = world.x + c.x1 * s >= 0 && world.x + c.x0 * s <= L.lw && world.y + c.y1 * s >= 0 && world.y + c.y0 * s <= L.lh;
            if (c.g.visible !== vis) c.g.setVisible(vis);
        });
    }

    destroy() { this.chunks.forEach((c) => c.g.destroy()); this.chunks = []; }
}
