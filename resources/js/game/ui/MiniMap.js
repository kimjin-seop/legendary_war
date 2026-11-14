import Phaser from 'phaser';
import { COLOR } from '../theme.js';
import { TILE } from '../UnitView.js';
import { L } from '../layout.js';

// 전투 미니맵(큰 맵 전용, Battle.buildTools 가 생성). 지형 색 칸(정적, 맵이 바뀔 때만) + 유닛 점·목표 점·현재 화면 사각형(200ms 주기, 바뀔 때만 다시 그림).
// 탭/드래그 = 그 칸으로 카메라 이동(scene.focusTile). 입력을 소비하므로 아래 맵 칸이 눌리지 않는다.
// 다른 씬(배치 화면 등)은 src 어댑터로 데이터·시야·이동을 넘긴다. src 가 없으면 전투 씬(store/world/focusTile) 기본 어댑터.
const TERRAIN_COLOR = {
    plain: 0x6f9a52, grass: 0x6f9a52, forest: 0x2f5e3a, mountain: 0x7d6c58, hill: 0x8a7a55, water: 0x2f5f9e, sea: 0x24508c, river: 0x3a6fb0,
    shallows: 0x5a8cc0, swamp: 0x4f6a4a, road: 0xa58a5c, bridge: 0x8a6a40, village: 0xb08a5a, wall: 0x6d6d6d, castle: 0x7a7a7a, gate: 0x8a7050,
    desert: 0xc9b27a, sand: 0xc9b27a, snow: 0xdfe6ea, snow_desert: 0xdfe6ea, cliff: 0x5a4c40,
};
const colorOf = (code) => TERRAIN_COLOR[code] ?? TERRAIN_COLOR[String(code ?? '').split(/[_.]/)[0]] ?? 0x4a5a48;

// 전투 씬 기본 어댑터(기존 동작 그대로). view = 현재 화면이 보는 타일 사각형 {x,y,w,h}(타일 단위), key = 시야 변경 감지용 문자열
function battleSrc(scene) {
    return {
        map: () => scene.store.state.map,
        units: () => scene.store.alive(),
        points: () => scene.store.state.objectivePoints ?? [],
        built: () => !!scene.worldBuilt,
        blocked: () => !!scene.modalCount || !scene.worldBuilt,
        pt: (p) => scene.pt(p),
        view: () => {
            const w = scene.world; const k = TILE * w.scaleX;
            return { x: -w.x / k, y: -w.y / k, w: L.lw / k, h: L.lh / k, key: `${Math.round(w.x)}/${Math.round(w.y)}/${w.scaleX.toFixed(3)}` }; // 월드·UI 는 같은 논리 좌표(L.lw x L.lh 가 화면)
        },
        focus: (tx, ty) => { scene.focusTile(tx, ty, false); scene.popupKey = ''; scene.updatePopups?.(); },
        zone: null,
    };
}

let texSeq = 0;
const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;

export class MiniMap extends Phaser.GameObjects.Container {
    // right = 오른쪽 끝 x, top(위 기준) 또는 bottom(아래 기준), maxW/maxH = 최대 크기(화면 논리 단위). 칸 크기는 맵 비율 유지. src = 데이터 어댑터(선택)
    constructor(scene, { right, top, bottom, maxW, maxH, src = null }) {
        super(scene, 0, 0);
        this.src = src ?? battleSrc(scene);
        const m = this.src.map();
        this.mw = m.w; this.mh = m.h;
        this.cell = Math.max(1.5, Math.min(maxW / m.w, maxH / m.h));
        // 주의: Phaser 4 Transform#setPosition(x, y, z, w) 가 this.w 를 덮어쓰므로 크기는 mmW/mmH 로 둔다
        this.mmW = Math.round(this.cell * m.w); this.mmH = Math.round(this.cell * m.h);
        const pad = 3; // 테두리(bg/hit 가 칸 영역 밖으로 3px)
        const x = Math.max(pad, right - pad - this.mmW); const y = top != null ? top + pad : bottom - pad - this.mmH;
        this.setPosition(x, y);
        this.bg = scene.add.rectangle(-pad, -pad, this.mmW + pad * 2, this.mmH + pad * 2, COLOR.navyDeep, 0.85).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.8);
        // 지형 = 캔버스 텍스처 1장(drawTerrain 이 구움). Phaser 4 Graphics 는 매 프레임 w*h 사각형을 다시 삼각화하므로 이미지로 대체(2026-11-14 모바일 성능)
        this.texKey = `minimap_terrain_${++texSeq}`;
        this.terrain = scene.add.image(0, 0, '__WHITE').setOrigin(0).setVisible(false);
        this.dyn = scene.add.graphics();
        this.hit = scene.add.rectangle(-pad, -pad, this.mmW + pad * 2, this.mmH + pad * 2, 0xffffff, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });
        this.add([this.bg, this.terrain, this.dyn, this.hit]);
        const go = (p) => {
            if (this.src.blocked()) return;
            const q = this.src.pt(p);
            const tx = Phaser.Math.Clamp(Math.floor((q.x - this.x) / this.cell), 0, this.mw - 1);
            const ty = Phaser.Math.Clamp(Math.floor((q.y - this.y) / this.cell), 0, this.mh - 1);
            this.src.focus(tx, ty);
            this.key = ''; this.redraw();
        };
        this.hit.on('pointerdown', (p) => { this.down = true; go(p); });
        this.hit.on('pointermove', (p) => { if (this.down && p.isDown) go(p); });
        this.hit.on('pointerup', () => { this.down = false; });
        this.hit.on('pointerout', () => { this.down = false; });
        this.drawTerrain();
        this.redraw();
        this.timer = scene.time.addEvent({ delay: 200, loop: true, callback: () => this.redraw() });
        scene.add.existing(this);
    }

    rect() { return { x: this.x - 3, y: this.y - 3, w: this.mmW + 6, h: this.mmH + 6 }; }
    contains(px, py) { const r = this.rect(); return this.visible && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }

    drawTerrain() {
        const tiles = this.src.map()?.tiles ?? [];
        const c = this.cell; const cc = Math.ceil(c);
        // 논리 크기(기존 Graphics 와 같은 범위: 마지막 칸은 ceil(c) 폭) x 해상도 배율(카메라 줌 L.u = 논리 1 -> 백킹 u px, 선명도 유지)
        const lw = Math.max(1, Math.ceil((this.mw - 1) * c + cc)); const lh = Math.max(1, Math.ceil((this.mh - 1) * c + cc));
        const res = Math.min(4, Math.max(1, L.u || 1));
        const pw = Math.max(1, Math.round(lw * res)); const ph = Math.max(1, Math.round(lh * res));
        const tm = this.scene.textures;
        let tex = tm.exists(this.texKey) ? tm.get(this.texKey) : null;
        if (tex && (tex.width !== pw || tex.height !== ph)) tex.setSize(pw, ph);
        if (!tex) tex = tm.createCanvas(this.texKey, pw, ph);
        const g = tex.getContext();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, pw, ph);
        g.setTransform(res, 0, 0, res, 0, 0);
        g.globalAlpha = 1;
        for (let y = 0; y < this.mh; y++) for (let x = 0; x < this.mw; x++) { g.fillStyle = hex(colorOf(tiles[y]?.[x])); g.fillRect(x * c, y * c, cc, cc); }
        // 선택: 정적 강조 칸(배치 화면의 배치 구역 [[x,y]]) — 아군 청색 반투명
        const zone = this.src.zone?.() ?? [];
        if (zone.length) { g.globalAlpha = 0.55; g.fillStyle = hex(COLOR.ally); zone.forEach(([zx, zy]) => g.fillRect(zx * c, zy * c, cc, cc)); g.globalAlpha = 1; }
        g.setTransform(1, 0, 0, 1, 0, 0);
        tex.refresh();
        this.terrain.setTexture(this.texKey).setDisplaySize(lw, lh).setVisible(true);
        this.tilesRef = tiles;
    }

    redraw() {
        const sc = this.scene;
        if (!sc || !this.visible || !this.src.built()) return;
        if (this.src.map()?.tiles !== this.tilesRef) this.drawTerrain(); // 지형 변경(tile_patch) 반영
        const v = this.src.view();
        const units = this.src.units();
        const pts = this.src.points();
        const key = [v.key ?? `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.w.toFixed(2)},${v.h.toFixed(2)}`, units.map((u) => `${u.id}:${u.x},${u.y},${u.team}${u.acted ? 1 : 0}`).join('|'), pts.length].join('/');
        if (key === this.key) return;
        this.key = key;
        const g = this.dyn.clear(); const c = this.cell; const r = Math.max(1.5, c * 0.45);
        pts.forEach((p) => { const px = Array.isArray(p) ? p[0] : p?.x; const py = Array.isArray(p) ? p[1] : p?.y; if (px == null) return; g.lineStyle(1.5, 0xf0d58c, 1).strokeRect(px * c - 0.5, py * c - 0.5, c + 1, c + 1); });
        units.forEach((u) => {
            const col = u.team === 'ally' ? (u.npc_ally ? 0x7fd18a : COLOR.ally) : COLOR.danger;
            g.fillStyle(col, u.acted ? 0.55 : 1).fillCircle(u.x * c + c / 2, u.y * c + c / 2, u.commander || u.kind === 'hero' ? r + 0.6 : r);
        });
        // 현재 화면 사각형(맵 범위로 자름)
        const x0 = Phaser.Math.Clamp(v.x, 0, this.mw); const y0 = Phaser.Math.Clamp(v.y, 0, this.mh);
        const x1 = Phaser.Math.Clamp(v.x + v.w, 0, this.mw); const y1 = Phaser.Math.Clamp(v.y + v.h, 0, this.mh);
        if (x1 > x0 && y1 > y0) g.lineStyle(1.5, 0xffffff, 0.95).strokeRect(x0 * c, y0 * c, (x1 - x0) * c, (y1 - y0) * c);
    }

    destroy(fromScene) {
        this.timer?.remove(); this.timer = null;
        const tm = this.scene?.textures; const key = this.texKey;
        super.destroy(fromScene);
        if (tm && key && tm.exists(key)) tm.remove(key); // 지형 텍스처 해제(이미지 파괴 뒤)
    }
}
