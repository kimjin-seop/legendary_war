import Phaser from 'phaser';
import { COLOR } from './theme.js';
import { FX_TEXTURES } from './fx_config.js';
import { generateSkin, generateIcons } from './ui/skin.js';

// 임시 도트 타일(원본 32px)과 패턴을 코드로 생성(무료 에셋은 후속 교체). 게임당 1회만 생성(exists 체크).
// 키 규격: tile_<terrain>(32px, NEAREST), hatch, bg_pattern, FX_TEXTURES.*, ui/skin.js 의 키들.
// 타일은 정수 배율(x1,x2,x3...)로만 표시해 흐려지지 않게 한다(Battle.fitMap).
export const TILE_SRC = 32;

function bake(scene, key, w, h, draw, nearest = false) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
    if (nearest) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export function generateTextures(scene) {
    const T = TILE_SRC;
    const frame = (g) => g.lineStyle(1, COLOR.ink, 0.55).strokeRect(0.5, 0.5, T - 1, T - 1);

    bake(scene, 'tile_plain', T, T, (g) => {
        g.fillStyle(0x3b475c, 1).fillRect(0, 0, T, T);
        g.fillStyle(0x47546b, 1);
        [[6, 7], [19, 5], [12, 19], [25, 24], [5, 26]].forEach(([x, y]) => g.fillRect(x, y, 2, 2));
        frame(g);
    }, true);
    bake(scene, 'tile_forest', T, T, (g) => {
        g.fillStyle(0x2f4a46, 1).fillRect(0, 0, T, T);
        g.fillStyle(0x1f3a35, 1);
        [[9, 15], [23, 14], [16, 25]].forEach(([x, y]) => g.fillTriangle(x, y - 9, x - 6, y + 4, x + 6, y + 4));
        frame(g);
    }, true);
    bake(scene, 'tile_mountain', T, T, (g) => {
        g.fillStyle(0x5b6174, 1).fillRect(0, 0, T, T);
        g.fillStyle(0x8a90a3, 1).fillTriangle(16, 4, 4, 26, 28, 26);
        g.fillStyle(0xd7d9e0, 1).fillTriangle(16, 4, 12, 12, 20, 12);
        frame(g);
    }, true);
    bake(scene, 'tile_water', T, T, (g) => {
        g.fillStyle(0x27476e, 1).fillRect(0, 0, T, T);
        g.fillStyle(0x5f8fc4, 1);
        [8, 17, 26].forEach((y, i) => { for (let x = 3; x < T - 3; x += 6) g.fillRect(x + (i % 2) * 3, y + ((x / 6) % 2 ? -1 : 1), 4, 1); });
        frame(g);
    }, true);
    // 공격 범위 빗금(대각선, 2x 해상도)
    bake(scene, 'hatch', 104, 104, (g) => {
        g.lineStyle(6, COLOR.danger, 0.9);
        for (let i = -104; i < 208; i += 24) g.lineBetween(i, 0, i + 104, 104);
    });
    // 레터박스 대신 여백을 채우는 배경 패턴
    bake(scene, 'bg_pattern', 128, 128, (g) => {
        g.fillStyle(0x161d2d, 1).fillRect(0, 0, 128, 128);
        g.lineStyle(2, 0x222c44, 1).strokeRect(1, 1, 126, 126);
        g.fillStyle(0x1e2840, 1).fillPoints([{ x: 64, y: 28 }, { x: 100, y: 64 }, { x: 64, y: 100 }, { x: 28, y: 64 }], true);
        g.fillStyle(0x161d2d, 1).fillPoints([{ x: 64, y: 44 }, { x: 84, y: 64 }, { x: 64, y: 84 }, { x: 44, y: 64 }], true);
    });
    bake(scene, FX_TEXTURES.shard, 8, 8, (g) => { g.fillStyle(COLOR.text, 1).fillRect(0, 0, 8, 8); });
    generateSkin(scene);
    generateIcons(scene);
}
