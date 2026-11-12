import Phaser from 'phaser';
import { TILE } from '../UnitView.js';
import { KIT_WALL_ART, TB_MANIFEST_KEY, TB_PX, VILLAGE_FIXED_KEYS, WALL_SHEET, artCulture, mapSeed, normalizeProps, placeVillage, placeWalls, resolveKey, tbTexKey, villageKeys, wallKeys, wallSheetName } from '../data/mapArt.js';

export const tbSheetKey = (n) => `tb_sheet_${n}`;
// 소품 에셋 준비 여부(E): manifest + 그 문화권 집·마을 소품 텍스처가 모두 있어야 마을 규칙을 켠다(일부라도 없으면 기존 마을 렌더 유지)
export function tbVillageReady(scene, culture) {
    const items = scene.cache.json.get(TB_MANIFEST_KEY)?.items;
    if (!items) return false;
    const ks = villageKeys(items, culture).filter((k) => items[k]);
    return ks.length > VILLAGE_FIXED_KEYS.length && ks.every((k) => scene.textures.exists(tbTexKey(k))); // 집 1종 이상 + 전부 로드
}
// 성벽 규칙 준비 여부: 시트 2장 + 망루·성문·본관 스프라이트
export function tbWallReady(scene) {
    const items = scene.cache.json.get(TB_MANIFEST_KEY)?.items;
    if (!items) return false;
    return ['wall_east', 'wall_west'].every((n) => scene.textures.exists(tbSheetKey(n))) && wallKeys(items).every((k) => scene.textures.exists(tbTexKey(k)));
}

export class MapArtLayer {
    constructor(scene, { groundParent, sortParent }, map, opts, { village = false, walls = false } = {}) {
        this.scene = scene;
        this.sortParent = sortParent;
        this.opts = opts;
        this.objs = []; // {lo, up, key, x0, x1, y0, y1}
        this.count = 0;
        this.villageCount = 0;
        this.wallCount = 0;
        this.sortSig = null;
        this.missing = new Set();
        this.fadeAt = 0;
        this.containers = [];
        const man = scene.cache.json.get(TB_MANIFEST_KEY);
        const items = man?.items ?? null;
        if (!items) { console.warn('[mapArt] tb_manifest 없음(로드 실패 또는 플래그 켠 뒤 새로고침 전) -> 소품 생략'); return; }
        const has = (k) => !!items[k] && scene.textures.exists(tbTexKey(k));
        const list = opts.props ? normalizeProps(map.props) : [];
        if (village) {
            const v = placeVillage(map.tiles, items, { seed: mapSeed(map), culture: artCulture(map, opts), rule: opts.villageRule });
            this.villageCount = v.length;
            list.push(...v);
        }
        const sheetsDef = man?.sheets ?? {};
        if (walls) {
            // meta.wall_style 키트 시트(예 wall_w_tuffeau, 칸 32x56)가 로드돼 있으면 그 시트, 아니면 문화권 기본(wall_east/west)
            const ws = wallSheetName(map.wallStyle, sheetsDef);
            const sheet = ws && scene.textures.exists(tbSheetKey(ws)) ? { name: ws, h: sheetsDef[ws].cell[1], hasB: !!sheetsDef[ws].file_b && scene.textures.exists(tbSheetKey(`${ws}_b`)) } : null;
            if (map.wallStyle && !sheet && !['east', 'west'].includes(map.wallStyle)) console.info('[mapArt] wall_style 시트 없음 -> 문화권 기본 성벽', map.wallStyle);
            // 키트 시트면 같은 색조 망루·성문(KIT_WALL_ART[kit]): 로드된 키만 쓰고, 없는 부분은 기본 회색 스프라이트 + 틴트
            const ka = sheet ? KIT_WALL_ART[sheetsDef[ws]?.kit] : null;
            const kitArt = ka ? { ...ka, tower: has(ka.tower) ? ka.tower : null, gate: has(ka.gate) ? ka.gate : null, block: has(ka.block) ? ka.block : null } : null;
            const w = placeWalls(map.tiles, { culture: artCulture(map, opts), gates: map.gates, castleRender: map.castleRender, sheet, kitArt });
            this.wallCount = w.length;
            list.push(...w);
        }
        if (!list.length) return;
        // 오토타일 시트 프레임 1회 등록: 칸 크기 = manifest sheets[이름].cell(기본 32x44), 열 수 = 시트 폭 / 칸 폭(8). '<이름>_b' 변형은 본 시트 칸 크기
        [...new Set(list.filter((p) => p.sheet).map((p) => p.sheet))].forEach((n) => {
            const k = tbSheetKey(n);
            if (!scene.textures.exists(k)) return;
            const t = scene.textures.get(k);
            const cell = sheetsDef[n]?.cell ?? sheetsDef[n.replace(/_b$/, '')]?.cell ?? [WALL_SHEET.w, WALL_SHEET.h];
            const cols = Math.max(1, Math.floor((t.getSourceImage()?.width ?? cell[0] * WALL_SHEET.cols) / cell[0]));
            if (!t.has('s0')) for (let i = 0; i < 47; i++) t.add(`s${i}`, 0, (i % cols) * cell[0], Math.floor(i / cols) * cell[1], cell[0], cell[1]);
        });
        const decals = scene.add.container(0, 0); const bridges = scene.add.container(0, 0); const lows = scene.add.container(0, 0);
        groundParent.add([decals, bridges, lows]);
        this.containers = [decals, bridges, lows];
        const base = TILE / TB_PX;
        list.forEach((p) => {
            let ent; let tex; let frame;
            if (p.sheet) { // 오토타일 조각(성벽)
                tex = tbSheetKey(p.sheet); frame = `s${p.frame}`;
                if (!scene.textures.exists(tex) || !scene.textures.get(tex).has(frame)) { this.missing.add(`${p.sheet}#${p.frame}`); return; }
                ent = { layer: 'object', anchor: p.anchor };
            } else {
                const k = resolveKey(p, has);
                if (!k) { this.missing.add(p.variant != null ? `${p.key}(${p.variant})` : p.key); return; }
                ent = items[k]; tex = tbTexKey(k);
            }
            const t = scene.textures.get(tex);
            if (!t.__tbFilter) { t.setFilter(Phaser.Textures.FilterMode.NEAREST); t.__tbFilter = true; } // 도트(v3 와 같은 Point)
            const fr = t.get(frame); const w = fr.realWidth ?? fr.width; const h = fr.realHeight ?? fr.height;
            const layer = p.layer ?? ent.layer ?? 'object';
            const sc = base * (Number(p.scale) > 0 ? Number(p.scale) : 1);
            const anc = Array.isArray(p.anchor) ? p.anchor : p.anchor === 'tl' ? [0, 0] : p.anchor === 'bc' ? [w / 2, h] : (ent.anchor ?? (layer === 'decal' ? [0, 0] : [w / 2, h]));
            const wx = p.x * TILE; const wy = p.y * TILE;
            const mk = () => { const im = scene.add.image(wx, wy, tex, frame).setOrigin(anc[0] / w, anc[1] / h).setScale(sc); if (Number.isFinite(p.tint)) im.setTint(p.tint); return im; }; // tint: 키트 성벽 색조 맞춤(placeWalls kitArt.tint)
            this.count += 1;
            if (layer === 'decal') { decals.add(mk()); return; }
            if (layer === 'bridge') { bridges.add(mk()); return; }
            // 오브젝트: 기준 칸(기준점 y 가 속한 행) 윗변에서 나눈다
            const top = wy - anc[1] * sc; const cellTop = Math.floor(wy / TILE - 1e-6) * TILE;
            const split = Math.max(0, Math.min(h, Math.round((cellTop - top) / sc))); // 원본 px: 0..split = 윗부분
            const o = { lo: null, up: null, key: wy, x0: wx - anc[0] * sc, x1: wx + (w - anc[0]) * sc, y0: top, y1: cellTop };
            if (p.src === 'wall' && !p.sheet) { o.x0 = Math.floor(wx / TILE) * TILE; o.x1 = o.x0 + TILE; } // 망루·성문(성벽 규칙): 가림 판정 x 를 제 칸 폭으로(옆 열 유닛 때문에 반투명 안 되게)
            if (split < h) { o.lo = mk(); if (split > 0) o.lo.setCrop(0, split, w, h - split); lows.add(o.lo); }
            if (split > 0) { o.up = mk(); if (split < h) o.up.setCrop(0, 0, w, split); o.up.__ysort = wy; o.up.__tbWall = !!p.sheet; sortParent.add(o.up); }
            o.wall = !!p.sheet; // 성벽 조각은 반투명 대상에서 제외(띠 전체가 깜빡이지 않게)
            this.objs.push(o);
        });
        this.ups = this.objs.filter((o) => o.up);
        if (this.missing.size) console.info(`[mapArt] 키 없음 ${this.missing.size}종(건너뜀)`, [...this.missing]);
        console.info(`[mapArt] 소품 ${this.count}개(마을 규칙 ${this.villageCount}, 성벽 규칙 ${this.wallCount}), 유닛과 y 정렬 ${this.ups.length}개`);
    }

    // 매 프레임(Battle.update): 유닛·솟은 오브젝트를 기준점 y 로 정렬 + 100ms 마다 가림 반투명
    update(time, views) {
        if (!this.ups?.length) return;
        const keyOf = (c) => (c.__ysort != null ? c.__ysort : c.y + TILE / 2); // 유닛 컨테이너 = 칸 가운데 -> 발 = +TILE/2
        // 정렬은 유닛 위치·자식 수가 바뀐 프레임에만(L3): 유닛(오브젝트 아닌 자식) y 합 서명
        const list = this.sortParent.list;
        let sig = list.length;
        for (let i = 0; i < list.length; i++) { const c = list[i]; if (c.__ysort == null) sig = (Math.imul(sig, 31) + Math.round(c.y * 8) + Math.round(c.x)) | 0; }
        if (sig !== this.sortSig) { this.sortSig = sig; list.sort((a, b) => (keyOf(a) - keyOf(b)) || ((a.__ysort != null) === (b.__ysort != null) ? 0 : a.__ysort != null ? -1 : 1)); } // 같으면 오브젝트 먼저(유닛이 앞)
        const fade = Number(this.opts.fade);
        if (!(fade > 0 && fade < 1) || time - this.fadeAt < 100) return;
        this.fadeAt = time;
        const us = [];
        views?.forEach((v) => { if (v?.c?.visible) us.push(v.c); });
        this.ups.forEach((o) => {
            if (o.wall) return;
            const hit = us.some((c) => c.y + TILE / 2 < o.key && c.x + TILE / 2 > o.x0 && c.x - TILE / 2 < o.x1 && c.y + TILE / 2 > o.y0 && c.y - TILE / 2 < o.y1);
            const a = hit ? fade : 1;
            if (o.up.alpha !== a) { o.up.setAlpha(a); o.lo?.setAlpha(a); }
        });
    }

    destroy() {
        this.objs.forEach((o) => o.up?.destroy());
        this.containers.forEach((c) => c.destroy(true));
        this.objs = []; this.ups = []; this.containers = [];
    }
}

// 통그림 배경 지면(맵 painted_bg). UnityGround 와 같은 인터페이스(chunks/opCount/ms/cull/tick/patchCells/destroy)
// 칸 1개 = tile_px 원본 px -> 표시 TILE(배율 TILE/tile_px, 정수·비정수 모두 맵 (0,0) 칸 왼쪽 위에 정렬). 보조 표시(옅은 격자·숲 경계)는 opts 로 켜고 끔
export const paintedKey = (src) => `painted_${[...String(src)].reduce((s, ch) => (Math.imul(s, 31) + ch.charCodeAt(0)) | 0, 7) >>> 0}`;
export class PaintedGround {
    constructor(scene, parent, map, painted, opts) {
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
        this.style = 'painted';
        this.scene = scene;
        const key = paintedKey(painted.src);
        const tex = scene.textures.get(key);
        tex.setFilter(painted.filter === 'nearest' ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR);
        const sc = TILE / painted.tilePx;
        const img = scene.add.image(-painted.ox * sc, -painted.oy * sc, key).setOrigin(0).setScale(sc);
        parent.add(img);
        const src = tex.getSourceImage();
        const need = [map.w * painted.tilePx + painted.ox, map.h * painted.tilePx + painted.oy];
        if (src.width < need[0] || src.height < need[1]) console.warn(`[mapArt] 통그림 ${src.width}x${src.height} < 맵 ${need[0]}x${need[1]}px(tile_px ${painted.tilePx}) -> 모자란 부분은 비어 보임`);
        this.chunks = [{ img, x0: 0, y0: 0, x1: map.w * TILE, y1: map.h * TILE }];
        this.objs = [img];
        if (opts.grid || opts.forestEdge) {
            const g = scene.add.graphics();
            if (opts.grid) {
                g.lineStyle(1, 0x000000, 0.14);
                for (let x = 1; x < map.w; x++) g.lineBetween(x * TILE, 0, x * TILE, map.h * TILE);
                for (let y = 1; y < map.h; y++) g.lineBetween(0, y * TILE, map.w * TILE, y * TILE);
            }
            if (opts.forestEdge) {
                const f = (x, y) => map.tiles[y]?.[x] === 'forest';
                g.lineStyle(2, 0x1f4416, 0.7);
                for (let y = 0; y < map.h; y++) {
                    for (let x = 0; x < map.w; x++) {
                        if (!f(x, y)) continue;
                        const X = x * TILE; const Y = y * TILE;
                        if (y > 0 && !f(x, y - 1)) g.lineBetween(X, Y, X + TILE, Y);
                        if (y < map.h - 1 && !f(x, y + 1)) g.lineBetween(X, Y + TILE, X + TILE, Y + TILE);
                        if (x > 0 && !f(x - 1, y)) g.lineBetween(X, Y, X, Y + TILE);
                        if (x < map.w - 1 && !f(x + 1, y)) g.lineBetween(X + TILE, Y, X + TILE, Y + TILE);
                    }
                }
            }
            parent.add(g);
            this.objs.push(g);
        }
        this.opCount = 1;
        this.ms = t0 ? Math.round(performance.now() - t0) : 0;
    }

    tick() {}

    cull() {}

    // 지형 변경(낙석 등): 통그림은 칸 단위로 다시 그릴 수 없어 그림은 그대로 둔다(이동 판정은 서버 tiles 기준이라 무관). 1차 한계
    patchCells(list) { if (list?.length) console.info(`[mapArt] 통그림 맵 지형 변경 ${list.length}칸: 그림 갱신 없음(판정만 반영)`); }

    destroy() { this.objs.forEach((o) => o.destroy()); this.objs = []; this.chunks = []; }
}
