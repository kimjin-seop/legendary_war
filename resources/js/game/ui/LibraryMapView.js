import { COLOR } from '../theme.js';
import { makeText, fitText } from './common.js';
import { isInstant } from './motion.js';
import { StageMapView } from './StageMapView.js';
import { stagePlayable } from '../campaign/campaignMapData.js';
import { ensurePortraitTex, loaded, manifestHas, texKey } from '../assets.js';
import { L, texPxPerUnit } from '../layout.js';
import { withVer } from '../assetVersion.js';
import Phaser from 'phaser';
import PROFILE from '../data/library_map_profile.json';

// 메인 스토리 '잊힌 서고' 도서관 지도(MVP, 2026-11-14). 역사 시나리오 지도(StageMapView)의 오른쪽 패널(요약·정보 줄·목록·출정)을 그대로 쓰고,
//  지도 부분만 맵 프로필(data/library_map_profile.json: aspect·구역·노드 좌표·기능 플래그)로 교체한 하위 클래스.
//  - 영토·LOD·지구본 이동·장수 칩·플레이트 = 프로필 features 에서 꺼짐 -> 여기서 no-op 로 덮어쓴다(StageMapView 본체는 수정하지 않아 역사 시나리오 지도 동작 불변)
//  - 단일 조감 지도: 26개 노드(튜토리얼 6 + 4막 x 5)를 항상 표시. 넓은 화면 = 전체 맞춤(contain), 좁은 화면 = 높이 맞춤 + 가로 드래그(선택 막으로 자동 이동)
//  - 잠긴 구역 = 먼지·안개, 현재 진행 노드 = 시오리 얼굴 + 맥동 링, 해금 = 연결선(잠김 구간은 점선)
//  - 배경 = 코드 그림(나무 바닥 + 서가 구역 + 책등 띠). 프로필 bg_key(이미지 논리 키)가 생기면 후속에서 교체
export const LIBRARY_PROFILE = PROFILE;
// buildCampaignMap 에 넣을 메타(shelves·stages 스키마는 shelf_map_meta 와 같음)
export const libraryMeta = () => ({ shelves: PROFILE.shelves ?? [], stages: PROFILE.stages ?? [] });

// 배경 이미지(프로필 bg_key, manifest 항목). 변형(variants.mobile)은 StageMapView.variantKey 와 같은 방식으로 메모리 항목 등록
const texOf = (lg) => loaded.manifest?.[lg]?.textureKey ?? texKey(lg);
function variantOf(lg, name) {
    const v = loaded.manifest?.[lg]; const vv = v?.variants?.[name];
    if (!vv) return null;
    const k = `${lg}.${name}`;
    if (!loaded.manifest[k]) loaded.manifest[k] = { path: typeof vv === 'string' ? vv : vv.path, size: typeof vv === 'string' ? undefined : vv.size, type: 'image', scope: v.scope ?? 'map', variant_of: lg };
    return k;
}
// 노드 아이콘(안아트 2026-11-14, public/assets/maps/library/nodes, manifest 미병합 -> 경로로 직접 지연 로드). 종류 boss -> shelf.
//  상태: book/shelf/desk = locked(잠김) | cleared(클리어) | normal, door = open(클리어) | closed. @2x 사용(LINEAR). 없으면 코드 도형 폴백
const NODE_FILES = ['book_normal', 'book_locked', 'book_cleared', 'shelf_normal', 'shelf_locked', 'shelf_cleared', 'desk_normal', 'desk_locked', 'desk_cleared', 'door_closed', 'door_open'];
const nodeTex = (f) => `libnode_${f}`;
let nodeLoading = false;
function ensureNodeTextures(scene, onDone) {
    const need = NODE_FILES.filter((f) => !scene.textures.exists(nodeTex(f)));
    if (!need.length) { onDone?.(); return; }
    if (nodeLoading || !scene.load) return;
    nodeLoading = true;
    const release = () => { nodeLoading = false; };
    scene.events?.once('shutdown', release); scene.events?.once('destroy', release); // 로드 중 씬 종료 시 플래그 고착 방지
    need.forEach((f) => scene.load.image(nodeTex(f), withVer(`/assets/maps/library/nodes/${f}@2x.png`)));
    scene.load.once('complete', () => { nodeLoading = false; scene.events?.off('shutdown', release); scene.events?.off('destroy', release); if (!scene.sys?.isActive?.()) return; need.forEach((f) => { if (scene.textures.exists(nodeTex(f))) scene.textures.get(nodeTex(f)).setFilter(Phaser.Textures.FilterMode.LINEAR); }); onDone?.(); });
    scene.load.start();
}
// 탭 영역 크기 변경(Shape.setSize 만으로는 입력 hitArea 가 그대로라 함께 갱신)
const sizeHit = (hit, w, h, y) => { hit.setSize(w, h).setPosition(0, y); hit.input?.hitArea?.setSize?.(w, h); };
const NODE_W = { book: 60, desk: 68, door: 68, shelf: 88 }; // 권장 표시 폭(x 이미지 배율 iu)
const NODE = new Map((PROFILE.stages ?? []).map((s) => [s.stage_code, s.node ?? 'book']));
const GOLD = COLOR.accent; const GOLD_L = COLOR.accentLight;
const SPINES = [0x7a2e24, 0x2e4a6a, 0x5a6a2e, 0x6a4a1e, 0x3e2a5a, 0x8a6a2a, 0x2a5a52];

export class LibraryMapView extends StageMapView {
    // 좁은 화면: 장수 칩 줄(124) 자리를 지도에 돌려준다
    layoutRects() {
        super.layoutRects();
        if (!this.wideLayout) {
            this.R.map.h += this.R.chips.h + 4; this.R.side.y = this.R.map.h + 8; this.R.side.h = this.H - this.R.side.y; this.vp = { w: this.R.map.w, h: this.R.map.h };
            this.compact = this.R.side.h < 16 + 116 + 8 + 26 + 2 * 64 + 76; this.sumH = this.compact ? 84 : 116; // StageMapView.layoutRects 와 같은 기준으로 다시 판정
        }
        this.R.chips = { x: 0, y: 0, w: 0, h: 0, inMap: true };
    }

    buildMap() {
        super.buildMap();
        const s = this.scene;
        this.panX = null;
        this.ocean.setFillStyle(0x140e0a, 1);
        this.libBg = s.add.graphics(); this.libFog = s.add.graphics(); this.libLines = s.add.graphics();
        this.imgLayer.add([this.libBg, this.libLines]);
        this.borderLayer.add(this.libFog); // 안개는 노드 위(잠긴 구역의 노드를 흐리게)
        this.zoneLabels = (PROFILE.zones ?? []).map((z) => {
            const t = makeText(s, 0, 0, z.name, { size: 13, bold: true, color: '#F6D98C', origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 4 } });
            this.labelLayer.add(t); return { z, t };
        });
        // 좁은 화면 가로 드래그(배경). 노드 탭 영역은 위층이라 그대로 눌린다
        const hit = s.add.rectangle(0, 0, this.R.map.w, this.R.map.h, 0xffffff, 0).setOrigin(0).setInteractive();
        this.mapBox.addAt(hit, 1);
        let sx = null; let start = 0;
        hit.on('pointerdown', (p) => { sx = p.worldX; start = this.geo?.offX ?? 0; });
        hit.on('pointermove', (p) => { if (sx == null || !p.isDown || !this.geo?.pan) return; this.panX = start + (p.worldX - sx); this.redraw(); });
        hit.on('pointerup', () => { sx = null; });
        hit.on('pointerout', () => { sx = null; });
    }

    // 프로필 기능 플래그(영토·LOD·지구본 이동·칩·플레이트) 끔
    // 배경 이미지: 표시 높이(CSS px x devicePixelRatio) <= 800 이면 mobile(1760x800), 아니면 base(3520x1600). 없거나 실패하면 코드 배경 유지
    loadMapAssets() {
        this.layers = {}; // StageMapView.loadPhase 의 세계판 조기 적용 훅 끔
        const k = PROFILE.bg_key;
        // manifest 병합 전이면 프로필의 bg_entry(안아트 조각과 같은 항목)를 메모리 manifest 에 등록(파일은 public/assets/maps/library 에 있음)
        if (k && !manifestHas(k) && PROFILE.bg_entry?.path && loaded.manifest) loaded.manifest[k] = { ...PROFILE.bg_entry };
        if (!k || !manifestHas(k)) return;
        const g = this.geom();
        const px = g.mh * texPxPerUnit(); // 표시 높이(백킹 px). 예전 L.u x dpr 은 DPR 이중 곱(2026-11-14 수정, 롤백 settings.texDprLegacy)
        const lg = px <= 800 ? (variantOf(k, 'mobile') ?? k) : k;
        this.loadPhase([lg], null, () => this.attachBg(lg));
    }

    attachBg(lg) {
        if (!this.scene || !this.texReady(lg)) { console.warn('[LibraryMap] 배경 이미지 로드 실패(코드 배경 유지)', lg); return; }
        this.bgImg?.destroy();
        this.bgImg = this.scene.add.image(0, 0, texOf(lg)).setOrigin(0);
        this.imgLayer.addAt(this.bgImg, 1); // 코드 바닥(libBg) 위, 연결선 아래
        this.redraw();
    }
    ensureRegions() {}
    ensureBattle() {}
    updateTerritories() {}
    updateLod() {}
    buildFactions() {}
    showFactions() {}
    layoutFactions() {}
    renderPlate() { this.plate?.setVisible(false); this.plateRect = null; }
    showChips(c, onDone) { onDone?.(); }
    cc(cam) { return cam; }
    applyCam(cam) { this.cam = cam; this.rot.setRotation(0).setScale(1); this.redraw(); }
    travelTo(target, onDone) { this.applyCam(target); onDone?.(); }

    // 지도 기하: 넓으면 전체 맞춤, 좁으면 높이 맞춤 + 가로 이동
    geom() {
        const { w, h } = this.vp; const A = Number(PROFILE.aspect) || 2.2;
        let mw; let mh; let offX; let offY; let pan = false;
        if (w / h >= A * 0.7) { const sc = Math.min(w / A, h); mw = sc * A; mh = sc; offX = (w - mw) / 2; offY = (h - mh) / 2; } else {
            mh = h; mw = h * A; offY = 0; pan = true;
            const want = this.panX ?? (w / 2 - (this.sel?.focus?.x ?? 0.11) * mw);
            offX = Math.max(w - mw, Math.min(0, want)); this.panX = offX;
        }
        this.geo = { mw, mh, offX, offY, pan };
        return this.geo;
    }
    P(x, y) { const g = this.geo ?? this.geom(); const sx = g.offX + x * g.mw; const sy = g.offY + y * g.mh; return { x: sx - this.vp.w / 2, y: sy - this.vp.h / 2, sx, sy }; }

    // 노드(스테이지) 26개 생성: 책 / 서가(막 보스) / 문 / 안내 데스크. 탭 = 출정 확인(잠김이면 그 막 선택)
    buildShelfPins() {
        const s = this.scene;
        this.nodes = [];
        this.model.campaigns.forEach((c) => c.stages.forEach((t) => {
            if (!t.pin) return;
            const o = s.add.container(0, 0);
            o.t = t; o.c = c; o.kind = NODE.get(t.s.code) ?? 'book';
            o.g = s.add.graphics(); o.no = makeText(s, 0, 0, String(t.no), { size: 11, bold: true, color: '#FFF4D2', origin: [0.5, 0], stroke: { color: '#0B1020', width: 3 } });
            o.hit = s.add.rectangle(0, 0, 40, 44, 0xffffff, 0).setInteractive({ useHandCursor: true });
            o.hit.on('pointerup', (p) => {
                if (s.modalCount > 0 || p.getDistance() > 12) return;
                if (this.sel !== c) { this.select(c); return; }
                if (!c.preview && stagePlayable(t.s)) this.onPick?.(t.s); else this.select(c, { user: false });
            });
            o.add([o.g, o.hit]);
            this.labelLayer.add(o.no); // 번호는 라벨 층(노드·시오리 표식 위): 현재 진행 표식·이웃 노드에 가리지 않게(강화면 a27h Low: 튜토리얼 3번 숫자)
            o.once('destroy', () => o.no.destroy());
            this.pinLayer.add(o);
            this.nodes.push(o);
        }));
        // 현재 진행 노드: 시오리 얼굴(초상 텍스처가 오면) + 맥동 링
        ensureNodeTextures(s, () => { if (this.scene) this.redraw(); });
        this.curMark = s.add.container(0, 0);
        this.curRing = s.add.graphics();
        this.curMark.add(this.curRing);
        this.pinLayer.add(this.curMark);
        const put = (k) => { if (!k || !this.curMark?.scene || !s.textures.exists(k)) return; this.curFace?.destroy(); const im = s.add.image(0, 0, k); const fw = im.frame.realWidth; const fh = im.frame.realHeight; const side = Math.min(fw, fh); im.setCrop((fw - side) / 2, 0, side, side).setOrigin(0.5, (side / 2) / fh); this.curFace = im; this.curMark.add(im); this.redraw(); };
        put(ensurePortraitTex(s, 'portrait.shiori.smile', put));
        if (!isInstant()) this.loops.push(s.tweens.add({ targets: this.curRing, alpha: 0.35, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    }

    // 이미지 노드: 바닥 그림자(코드) + 선택 원판 + 아이콘(origin 0.5,0.96). 보스 서가는 금테 받침 원판(배경에 묻히지 않게). 텍스처가 없으면 false -> 코드 도형
    drawNodeImage(o, u) {
        const st = o.t.s; const ok = stagePlayable(st) && !o.c.preview; const done = st.clear_count > 0; const sel = o.c === this.sel;
        const kind = o.kind === 'boss' ? 'shelf' : o.kind;
        const f = kind === 'door' ? (done ? 'door_open' : 'door_closed') : `${kind}_${!ok && !done ? 'locked' : done ? 'cleared' : 'normal'}`;
        if (!this.scene.textures.exists(nodeTex(f))) return false;
        const iu = Math.max(0.8, Math.min(1.2, (this.geo?.mh ?? 300) / 300)) * (sel ? 1.12 : 1);
        const dw = NODE_W[kind] * iu;
        if (!o.im) { o.im = this.scene.add.image(0, 0, nodeTex(f)).setOrigin(0.5, 0.96); o.addAt(o.im, o.getIndex(o.g) + 1); }
        o.im.setTexture(nodeTex(f)); const fr = o.im.frame; o.im.setDisplaySize(dw, dw * (fr.realHeight / Math.max(1, fr.realWidth)));
        o.im.setAlpha(kind === 'door' && !ok && !done ? 0.8 : 1).setVisible(true);
        const g = o.g.clear();
        g.fillStyle(0x0b1020, 0.45).fillEllipse(0, 1 * iu, dw * 0.62, 10 * iu);
        if (kind === 'shelf') g.fillStyle(0x0b1020, 0.55).fillEllipse(0, 0, dw * 0.95, 16 * iu).lineStyle(1.5, ok || done ? GOLD : 0x5a5f6a, 0.9).strokeEllipse(0, 0, dw * 0.95, 16 * iu); // 받침 원판
        if (sel) g.fillStyle(GOLD_L, 0.14).fillCircle(0, -o.im.displayHeight * 0.45, dw * 0.42);
        sizeHit(o.hit, Math.max(40, dw * 0.8), Math.max(44, o.im.displayHeight * 0.9), -o.im.displayHeight * 0.45);
        o.no.setPosition(o.x, o.y + 3 * u).setColor(ok || done ? '#FFF4D2' : '#9aa0aa');
        o.setAlpha(1);
        return true;
    }

    drawNode(o, u) {
        if (this.drawNodeImage(o, u)) return;
        o.im?.setVisible(false);
        const st = o.t.s; const ok = stagePlayable(st) && !o.c.preview; const done = st.clear_count > 0;
        const sel = o.c === this.sel;
        const fill = done ? GOLD_L : ok ? GOLD : 0x5a5f6a; const ink = 0x1a1406;
        const g = o.g.clear(); const k = (sel ? 1.12 : 1) * u;
        g.fillStyle(0x0b1020, 0.45).fillEllipse(0, 1 * k, (o.kind === 'boss' || o.kind === 'desk' ? 36 : 26) * k, 10 * k); // 바닥 그림자(밝은 2막 청록·4막 보라 바닥에서 금색 노드 가독성)
        if (sel) g.fillStyle(GOLD_L, 0.16).fillCircle(0, -9 * k, 16 * k);
        if (o.kind === 'boss') { // 서가: 큰 책장(3단)
            const w = 26 * k; const h = 30 * k;
            g.fillStyle(0x4a3220, 1).fillRect(-w / 2, -h, w, h).lineStyle(1.5, fill, 1).strokeRect(-w / 2, -h, w, h);
            for (let r = 0; r < 3; r += 1) for (let i = 0; i < 5; i += 1) g.fillStyle(ok || done ? SPINES[(i + r * 2) % SPINES.length] : 0x3a3e46, 1).fillRect(-w / 2 + 2 + i * ((w - 4) / 5), -h + 2 + r * (h / 3), (w - 4) / 5 - 1, h / 3 - 3);
            g.fillStyle(fill, 1).fillTriangle(-w / 2 - 2, -h, w / 2 + 2, -h, 0, -h - 7 * k); // 지붕 장식
        } else if (o.kind === 'door') { // 문(아치)
            const w = 20 * k; const h = 26 * k;
            g.fillStyle(0x3a2616, 1).fillRect(-w / 2, -h + w / 2, w, h - w / 2).fillCircle(0, -h + w / 2, w / 2);
            g.lineStyle(1.5, fill, 1).strokeRect(-w / 2, -h + w / 2, w, h - w / 2).beginPath().arc(0, -h + w / 2, w / 2, Math.PI, 0, false).strokePath();
            g.fillStyle(fill, 1).fillCircle(w * 0.22, -h * 0.4, 1.8 * k);
        } else if (o.kind === 'desk') { // 안내 데스크
            const w = 28 * k; const h = 14 * k;
            g.fillStyle(0x5a3a22, 1).fillRoundedRect(-w / 2, -h, w, h, 3).lineStyle(1.5, fill, 1).strokeRoundedRect(-w / 2, -h, w, h, 3);
            g.fillStyle(0xf4ecd8, 0.9).fillRect(-w * 0.3, -h - 4 * k, w * 0.28, 4 * k); // 펼친 장부
            g.fillStyle(fill, 1).fillCircle(w * 0.28, -h - 3 * k, 3 * k); // 종
        } else { // 책
            const w = 16 * k; const h = 20 * k;
            g.fillStyle(ok || done ? 0x6a2e24 : 0x3a3e46, 1).fillRect(-w / 2, -h, w, h);
            g.fillStyle(fill, 1).fillRect(-w / 2, -h, 3 * k, h); // 책등
            g.lineStyle(1.2, fill, 1).strokeRect(-w / 2, -h, w, h).lineBetween(-w / 2 + 6 * k, -h * 0.62, w / 2 - 3 * k, -h * 0.62);
            if (done) g.fillStyle(GOLD_L, 1).fillTriangle(w / 2 - 6 * k, -h, w / 2 - 2 * k, -h, w / 2 - 4 * k, -h + 6 * k); // 책갈피 = 클리어
        }
        o.no.setPosition(o.x, o.y + 3 * u).setColor(ok || done ? '#FFF4D2' : '#9aa0aa');
        o.setAlpha(ok || done ? 1 : 0.8);
    }

    redraw() {
        if (!this.scene || !this.libBg) return;
        const g0 = this.geom(); const { vp } = this;
        const ox = -vp.w / 2; const oy = -vp.h / 2;
        const X = (x) => ox + g0.offX + x * g0.mw; const Y = (y) => oy + g0.offY + y * g0.mh;
        const u = Math.max(0.75, Math.min(1.4, g0.mh / 300)); // 노드 배율(지도 높이 기준)
        // 바닥(나무 판자)
        const img = !!this.bgImg?.scene;
        if (img) this.bgImg.setPosition(X(0), Y(0)).setDisplaySize(g0.mw, g0.mh); // 비율 2.2 고정 -> 늘어남 없음
        const bg = this.libBg.clear();
        if (!img) { // 코드 배경(이미지 없을 때 폴백)
            bg.fillStyle(0x2a1d12, 1).fillRect(X(0), Y(0), g0.mw, g0.mh);
            for (let i = 1; i < 14; i += 1) bg.lineStyle(1, 0x1a120a, 0.5).lineBetween(X(0), Y(i / 14), X(1), Y(i / 14));
        }
        bg.lineStyle(2, GOLD, 0.5).strokeRect(X(0), Y(0), g0.mw, g0.mh);
        const fog = this.libFog.clear();
        // 구역(서가 방): 판 + 윗벽 책등 띠 + 잠김 안개
        const camp = new Map(this.model.campaigns.map((c) => [c.ch, c]));
        (PROFILE.zones ?? []).forEach((z, zi) => {
            const [x0, y0, x1, y1] = z.rect; const zx = X(x0); const zy = Y(y0); const zw = X(x1) - zx; const zh = Y(y1) - zy;
            const c = camp.get(z.chapter); const open = !!c && (c.unlocked || c.opened || c.cleared > 0); const sel = c && c === this.sel;
            const sh = Math.max(10, zh * 0.09);
            if (!img) { // 코드 구역 판 + 윗벽 책등 띠(이미지 없을 때만)
                bg.fillStyle(z.tone === 'lobby' ? 0x3a2a1c : 0x2f2418, 1).fillRoundedRect(zx, zy, zw, zh, 8);
                const n = Math.max(6, Math.floor(zw / 7));
                for (let i = 0; i < n; i += 1) { const bw = zw / n; const hh = sh * (0.7 + ((i * 7 + zi * 3) % 5) * 0.07); bg.fillStyle(SPINES[(i + zi) % SPINES.length], open ? 0.95 : 0.5).fillRect(zx + i * bw + 1, zy + 4 + (sh - hh), bw - 2, hh); }
                bg.lineStyle(2, 0x1a120a, 1).lineBetween(zx + 2, zy + 4 + sh, zx + zw - 2, zy + 4 + sh); // 선반
            }
            // 구역 테두리: 선택 = 밝은 금 강조, 그 외 = 이미지 위에서는 옅게
            bg.lineStyle(sel ? 2.5 : 1.2, sel ? GOLD_L : GOLD, sel ? 1 : img ? 0.3 : 0.55).strokeRoundedRect(zx, zy, zw, zh, 8);
            if (!open) { // 먼지·안개: 이미지 위에서는 남색 그늘 + 옅은 먼지(회색 막이 밝은 배경에서 탁해 보이지 않게)
                fog.fillStyle(img ? 0x0b1020 : 0x8a909a, img ? 0.5 : 0.38).fillRoundedRect(zx, zy, zw, zh, 8);
                for (let i = 0; i < 40; i += 1) { const px = zx + ((i * 37 + zi * 13) % 100) / 100 * zw; const py = zy + ((i * 61 + zi * 29) % 100) / 100 * zh; fog.fillStyle(0xd8dce2, img ? 0.14 : 0.18).fillCircle(px, py, 1 + (i % 3)); }
            }
            const lb = this.zoneLabels[zi];
            // 라벨: 이미지가 있으면 구역 윗부분(y 약 0.075, 보스 노드 y 0.25 위), 없으면 책등 띠 아래
            if (lb) { lb.t.setPosition(zx + zw / 2, Y(Number(PROFILE.label_y) || 0.075)).setColor(open ? '#F6D98C' : '#B8BEC8'); fitText(lb.t.setText(lb.z.name), Math.max(30, zw - 8)); }
        });
        // 연결선: 전체 순서(튜토리얼 -> 1~4막) 이웃 노드. 다음 노드가 열렸으면 실선, 아니면 점선
        const ln = this.libLines.clear();
        const seq = this.nodes ?? [];
        for (let i = 1; i < seq.length; i += 1) {
            const a = seq[i - 1].t.pin; const b = seq[i].t.pin; const open = stagePlayable(seq[i].t.s) || seq[i].t.s.clear_count > 0;
            const ax = X(a.x); const ay = Y(a.y) - 8 * u; const bx = X(b.x); const by = Y(b.y) - 8 * u;
            if (open) ln.lineStyle(2.5, GOLD, 0.85).lineBetween(ax, ay, bx, by);
            else { const d = Math.hypot(bx - ax, by - ay); const nn = Math.max(1, Math.floor(d / 9)); for (let k = 0; k < nn; k += 2) ln.lineStyle(1.5, 0x9aa0aa, 0.6).lineBetween(ax + (bx - ax) * (k / nn), ay + (by - ay) * (k / nn), ax + (bx - ax) * ((k + 1) / nn), ay + (by - ay) * ((k + 1) / nn)); }
        }
        // 노드 + 현재 진행 표시
        let cur = null;
        seq.forEach((o) => { o.setPosition(X(o.t.pin.x), Y(o.t.pin.y)); if (!o.im?.visible) sizeHit(o.hit, 40, 44, -10 * u); this.drawNode(o, u); if (o.t.s.id === this.model.recStageId) cur = o; });
        if (this.curMark) {
            this.curMark.setVisible(!!cur);
            if (cur) {
                const r = 13 * u; const cy = -34 * u - r;
                this.curMark.setPosition(cur.x, cur.y);
                this.curRing.clear().fillStyle(0x0b1020, 0.9).fillCircle(0, cy, r + 2).lineStyle(2.5, GOLD_L, 1).strokeCircle(0, cy, r + 2).fillStyle(GOLD_L, 1).fillTriangle(-5, cy + r, 5, cy + r, 0, cy + r + 7);
                if (this.curFace) this.curFace.setPosition(0, cy).setDisplaySize(r * 2, (r * 2) * (this.curFace.frame.realHeight / Math.max(1, Math.min(this.curFace.frame.realWidth, this.curFace.frame.realHeight))));
                else if (!this.curInit) { this.curInit = makeText(this.scene, 0, cy, '시', { size: 13, bold: true, color: '#F6D98C', origin: [0.5, 0.5] }); this.curMark.add(this.curInit); }
                this.curInit?.setY(cy).setVisible(!this.curFace);
            }
        }
    }

    // 막 선택: 지도 이동(좁은 화면 = 그 구역으로 가로 이동) + 오른쪽 패널(요약·목록)
    select(c, { user = true } = {}) {
        if (!this.scene || !c) return;
        if (user && this.sel === c) { if (this.mode === 'shelf' && c.stages.length) this.enterStages(); return; }
        this.cancelFx();
        this.sel = c; this.mode = 'shelf';
        this.panX = null; // 선택 구역 기준으로 다시 맞춤
        this.renderList();
        this.renderSummary(c);
        this.sumBox.setAlpha(1);
        this.redraw();
    }

    enterStages() { this.cancelFx(); this.mode = 'stages'; this.renderList(); this.redraw(); }
    leaveStages() { if (!this.sel) return; this.cancelFx(); this.mode = 'shelf'; this.renderList(); this.redraw(); }
}
