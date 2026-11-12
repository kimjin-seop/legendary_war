import { Tabs } from './Tabs.js';
import { Chips } from './Chips.js';
import { makeText, fitText } from './common.js';
import { ScrollList, noteText } from './widgets.js';
import { COLOR, CSS } from '../theme.js';
import { L } from '../layout.js';
import { gameApi } from '../api/gameApi.js';
import { messageOf } from '../api/errors.js';
import { RmGround, rmReady } from '../fx/RmGround.js';
import { u32SnapTile } from '../systems/terrainTiles.js';
import { settings } from '../settings.js';

// 방 만들기 맵 선택(목록 + 필터 + 선택 시 미리보기). 모달 inner 등 컨테이너 안에 그린다.
// - 목록: GET /api/maps?mode&per_side&biome&size_class (타일 없이). 첫 항목 '랜덤'(서버 추첨), 기본 선택 = default_code
// - 미리보기: 카드 선택 시에만 GET /api/maps/{code}/preview(gameApi 캐시) -> RM 지형(terrainStyle 'rm' + 시트 로드됨) 또는 지형색 썸네일
// - value(): 선택 code | 'random' | null(목록 실패 등 -> 서버 기본)
const SYM = { p: 'plain', f: 'forest', m: 'mountain', w: 'water', c: 'castle', s: 'shallows', b: 'bridge', r: 'road', x: 'swamp', n: 'snow_desert', k: 'cliff', W: 'wall', v: 'village' };
const TCOLOR = { plain: 0x7aa04a, forest: 0x2f6b2f, mountain: 0x8a7350, water: 0x2f6fb0, castle: 0x9a9aa0, shallows: 0x6fb0c8, bridge: 0xa07840, road: 0xb8a888, swamp: 0x4f5a2e, snow_desert: 0xe0d090, cliff: 0x5a5048, wall: 0x6a6a72, village: 0xc0603a };
// 서버 /api/maps 의 biome = meta.biome_tag ?? maps.biome. 값 출처: database/data/maps.json(temperate·mountain·desert·swamp) + maps_pack20.json biome_tag(grass·coast·desert·snow·swamp)
// library·castle·sea_night·strait·hill·forest_river·sea: 캠페인/문화권 맵 biome(강화면 gacha129: 188맵 중 41개 아이콘 없음)
const BIOME_KO = { temperate: '온대', grass: '초원', mountain: '산악', desert: '사막', snow: '설원', swamp: '늪지', coast: '해안', library: '서고', castle: '성채', sea_night: '밤바다', strait: '해협', hill: '구릉', forest_river: '숲강', sea: '바다' };
const biomeKo = (b) => BIOME_KO[b] ?? null; // 매핑 없는 값은 숨김(영문 노출 금지)
// 지형 아이콘(맵 목록 항목, 코드 도형 — 새 이미지 없음): 둥근 칸 바탕색 + 간단한 기호. 매핑 없는 지형은 기본 아이콘(평지 + 언덕) + 툴팁 '지형'
const BIOME_BG = { temperate: 0x5f8a3c, grass: 0x8fb64e, mountain: 0x7a6548, desert: 0xc9a85a, snow: 0xd8dee8, swamp: 0x4f5a2e, coast: 0x2f6fb0,
    library: 0x6a4a2e, castle: 0x8a8a92, sea_night: 0x1e2f5a, strait: 0x2f6fb0, hill: 0x7f9a4a, forest_river: 0x4f7a34, sea: 0x2a5ea0 };
const BIOME_DEFAULT_BG = 0x6f7f5a;
function biomeIcon(s, x, y, sz, b) {
    const g = s.add.graphics({ x, y });
    g.fillStyle(BIOME_BG[b] ?? BIOME_DEFAULT_BG, 1).fillRoundedRect(0, 0, sz, sz, 6);
    g.lineStyle(1, COLOR.accent, 0.6).strokeRoundedRect(0, 0, sz, sz, 6);
    const k = sz / 28; const ink = COLOR.ink;
    const P = (pts) => pts.map(([px, py]) => ({ x: px * k, y: py * k }));
    if (b === 'temperate') { g.fillStyle(0x234a1e, 1).fillTriangle(14 * k, 5 * k, 6 * k, 19 * k, 22 * k, 19 * k); g.fillStyle(0x5a3b20, 1).fillRect(12.5 * k, 19 * k, 3 * k, 4 * k); }
    else if (b === 'grass') { g.lineStyle(2 * k, 0x2f5a1e, 1); [[8, 22, 6, 12], [14, 22, 14, 9], [20, 22, 22, 12]].forEach(([a, b1, c, d]) => g.lineBetween(a * k, b1 * k, c * k, d * k)); }
    else if (b === 'mountain') { g.fillStyle(0x3e3328, 1).fillPoints(P([[3, 23], [11, 8], [15, 14], [18, 10], [25, 23]]), true); g.fillStyle(0xf0ece0, 1).fillTriangle(11 * k, 8 * k, 8.6 * k, 12.5 * k, 13.4 * k, 12.5 * k); }
    else if (b === 'desert') { g.fillStyle(0xf2d27a, 1).fillCircle(20 * k, 9 * k, 4 * k); g.fillStyle(0x9a7a38, 1).fillEllipse(11 * k, 23 * k, 20 * k, 9 * k); }
    else if (b === 'snow') { g.lineStyle(2 * k, 0x4a6a9a, 1); for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; g.lineBetween((14 - 8 * Math.cos(a)) * k, (14 - 8 * Math.sin(a)) * k, (14 + 8 * Math.cos(a)) * k, (14 + 8 * Math.sin(a)) * k); } }
    else if (b === 'swamp') { g.fillStyle(0x2c3a40, 1).fillEllipse(14 * k, 19 * k, 20 * k, 7 * k); g.lineStyle(2 * k, 0x9ab060, 1); g.lineBetween(9 * k, 17 * k, 9 * k, 8 * k); g.lineBetween(19 * k, 17 * k, 19 * k, 10 * k); }
    else if (b === 'coast') { g.lineStyle(2 * k, 0xd8ecf4, 1); [10, 17].forEach((wy) => { g.beginPath(); g.moveTo(5 * k, wy * k); for (let i = 1; i <= 6; i++) g.lineTo((5 + i * 3) * k, (wy + (i % 2 ? -2.5 : 0)) * k); g.strokePath(); }); }
    else if (b === 'library') { [[6, 0x9a3a2a], [11, 0x2f5a8a], [16, 0x6a8a3a]].forEach(([bx, col]) => { g.fillStyle(col, 1).fillRect(bx * k, 7 * k, 4 * k, 15 * k); }); g.fillStyle(0xc9a85a, 1).fillPoints(P([[20, 22], [21, 7.5], [24, 8.5], [23.5, 22]]), true); g.fillStyle(0x3a2814, 1).fillRect(4 * k, 22 * k, 20 * k, 2 * k); }
    else if (b === 'castle') { g.fillStyle(0x4a4a52, 1).fillRect(8 * k, 11 * k, 12 * k, 12 * k); [8, 12.5, 17].forEach((cx) => g.fillRect(cx * k, 7 * k, 3 * k, 4 * k)); g.fillStyle(0x2a1a10, 1).fillRect(12.5 * k, 17 * k, 3 * k, 6 * k); }
    else if (b === 'sea_night') { g.fillStyle(0xf0e0a0, 1).fillCircle(19 * k, 9 * k, 4 * k); g.fillStyle(BIOME_BG.sea_night, 1).fillCircle(21 * k, 7.5 * k, 3.5 * k); g.lineStyle(2 * k, 0x8fb0d8, 1); g.beginPath(); g.moveTo(4 * k, 20 * k); for (let i = 1; i <= 7; i++) g.lineTo((4 + i * 3) * k, (20 + (i % 2 ? -2.5 : 0)) * k); g.strokePath(); }
    else if (b === 'strait') { g.fillStyle(0x7a9a4a, 1).fillPoints(P([[2, 4], [10, 4], [8, 14], [10, 24], [2, 24]]), true).fillPoints(P([[26, 4], [18, 4], [20, 14], [18, 24], [26, 24]]), true); g.lineStyle(1.5 * k, 0xd8ecf4, 1); g.lineBetween(12 * k, 11 * k, 16 * k, 11 * k); g.lineBetween(12 * k, 17 * k, 16 * k, 17 * k); }
    else if (b === 'hill') { g.fillStyle(0x4f6a2e, 1).fillEllipse(10 * k, 22 * k, 16 * k, 12 * k); g.fillStyle(0x5f7a38, 1).fillEllipse(19 * k, 22 * k, 14 * k, 9 * k); g.fillStyle(BIOME_BG.hill, 1).fillRect(2 * k, 22 * k, 24 * k, 4 * k); }
    else if (b === 'forest_river') { g.fillStyle(0x234a1e, 1).fillTriangle(10 * k, 4 * k, 4 * k, 15 * k, 16 * k, 15 * k).fillTriangle(19 * k, 6 * k, 14 * k, 15 * k, 24 * k, 15 * k); g.fillStyle(0x2f6fb0, 1).fillRect(2 * k, 18 * k, 24 * k, 5 * k); g.lineStyle(1 * k, 0xd8ecf4, 0.9).lineBetween(6 * k, 20.5 * k, 12 * k, 20.5 * k); }
    else if (b === 'sea') { g.lineStyle(2 * k, 0xd8ecf4, 1); [9, 15, 21].forEach((wy) => { g.beginPath(); g.moveTo(4 * k, wy * k); for (let i = 1; i <= 7; i++) g.lineTo((4 + i * 3) * k, (wy + (i % 2 ? -2.5 : 0)) * k); g.strokePath(); }); }
    else { g.fillStyle(0x3e4a30, 1).fillPoints(P([[4, 21], [12, 11], [17, 16], [20, 13], [24, 21]]), true); g.fillStyle(0x9a8a5a, 1).fillRect(4 * k, 21 * k, 20 * k, 2 * k); } // 기본 아이콘(매핑 없는 지형)
    return g;
}
function randomBadge(s, x, y, sz) {
    const c = s.add.container(x, y);
    const g = s.add.graphics();
    g.fillStyle(COLOR.navyDeep, 1).fillRoundedRect(0, 0, sz, sz, 6).lineStyle(1, COLOR.accent, 0.8).strokeRoundedRect(0, 0, sz, sz, 6);
    c.add([g, makeText(s, sz / 2, sz / 2, '?', { size: 16, bold: true, color: CSS.accent, origin: [0.5, 0.5] })]);
    return c;
}
// 맵 태그(maps_pack20 meta.tags) 한글. 매핑 없는 태그는 표시하지 않는다
const TAG_KO = {
    open: '개활지', flank: '측면 우회', hill_center: '중앙 언덕', tutorial: '입문', choke: '병목', bridge: '다리', ford: '여울', river: '강', gorge: '협곡',
    mounted_funnel: '기병 병목', highground: '고지', village_center: '중앙 마을', forest_ambush: '숲 매복', cover: '엄폐', oasis: '오아시스', sand_slow: '모래 감속',
    center_control: '중앙 장악', desert: '사막', snow: '설원', ridge: '능선', swamp: '늪', detour: '우회로', mounted_block: '기병 차단', pass: '고개', crossroads: '교차로',
    road: '도로', village: '마을', heal: '회복', cliff: '절벽', ranged_rim: '고지 사격', lake: '호수', loop: '순환로', coast: '해안', island: '섬', siege: '공성',
    keep: '성채', castle: '성', gate: '성문', double_crossing: '이중 도하', three_lanes: '3차선', mounted_lane: '기병로', mixed: '혼합', large: '대형', defense: '방어전',
    wall: '성벽', asymmetric: '비대칭', moat: '해자',
};
const tagsKo = (tags) => (Array.isArray(tags) ? tags.map((t) => TAG_KO[t]).filter(Boolean) : []);
const SIZE_KO = { S: '소형', M: '중형', L: '대형' };
// 출전 영웅 수 표기(서버 party_size 가 올 때만, 없으면 ''). 맵 목록·방 목록·대기실 공용
export const partySizeText = (ps) => { const n = Number(ps); return Number.isFinite(n) && n > 0 ? `${n}명 출전` : ''; };
// 크기·출전 수 한 줄(예: '중형 · 4명 출전'). 두 필드 모두 없으면 '' (구 응답 폴백 = 표시 안 함)
export const sizePartyText = (o) => [SIZE_KO[o?.size_class] ?? '', partySizeText(o?.party_size)].filter(Boolean).join(' · ');
// 타일 행이 문자열(maps.json 형식)이면 기호 -> 지형 코드로
export const normalizeTiles = (tiles) => (tiles ?? []).map((r) => (typeof r === 'string' ? [...r] : r).map((c) => (typeof c === 'string' && c.length === 1 ? SYM[c] ?? 'plain' : c)));
const recText = (m) => (Array.isArray(m.recommended_per_side) ? `권장 ${m.recommended_per_side[0]}~${m.recommended_per_side[1]}명/편` : '');

export class MapPicker {
    // clip: 목록을 픽셀 클리핑(ScrollList clip). 기본 false = 기존 가시성 클리핑(경계에 걸친 행이 영역 밖으로 일부 보임)
    constructor(scene, parent, { x, y, w, h, mode = 'solo', clip = false }) {
        this.scene = scene; this.parent = parent;
        this.box = { x, y, w, h };
        this.mode = mode;
        this.filters = { size_class: null }; // 서버 필터
        this.perSide = null; // 인원 구간 [min,max](클라이언트 필터: 서버 per_side 는 단일 정수라 구간 선택 시 빈 목록이 생김)
        this.biome = null; // 지형(클라이언트 필터, UI 제거 2026-11-06 -> 항상 null = 전체)
        this.maps = []; this.defaultCode = null; this.selected = null; this.token = 0; this.pvToken = 0; this.ground = null;
        this.root = scene.add.container(x, y);
        parent.add(this.root);
        const wide = w >= 640;
        this.wide = wide;
        const SIZE_ITEMS = [{ key: 'all', label: '전체' }, { key: 'S', label: '소형' }, { key: 'M', label: '중형' }, { key: 'L', label: '대형' }];
        const onSize = (k) => this.setFilter('size_class', k === 'all' ? null : k);
        // 2026-11-06: 인원·지형 필터 UI 제거(1:1 전제·지형은 목록 항목 아이콘으로 표시만). perSide·biome 은 항상 null(전체) — 서버로는 size_class 만 보낸다
        // 필터 1줄(높이 30 칩, 오른쪽 정렬): [크기] 전체·소형·중형·대형. 왼쪽 빈 자리는 호출 측(로비) '맵 선택' 제목이 쓴다
        const sizeChips = new Chips(scene, { x: 0, y: 0, h: 30, size: 12, modal: true, active: 'all', items: SIZE_ITEMS, onChange: onSize });
        sizeChips.setX(w - sizeChips.width);
        this.root.add(makeText(scene, sizeChips.x - 8, 15, '크기', { size: 12, color: CSS.muted, origin: [1, 0.5] }));
        this.root.add(sizeChips);
        let top = 42; // 칩 30 + 간격 12
        if (!wide) {
            // 좁은 화면(모바일): 2줄 = 목록/미리보기 전환 -> 목록·미리보기가 본문 전체 높이를 쓴다
            this.viewTabs = new Tabs(scene, { x: 0, y: top, w, h: 44, size: 13, modal: true, active: 'list', items: [{ key: 'list', label: '맵 목록' }, { key: 'pv', label: '미리보기' }], onChange: (k) => this.showView(k) });
            this.root.add(this.viewTabs);
            top += 52;
        }
        const bodyH = h - top;
        // 넓은 화면: 목록(왼쪽) + 미리보기(오른쪽) / 좁은 화면: 같은 영역을 탭으로 전환
        const lw = wide ? Math.floor(w * 0.46) : w;
        this.list = new ScrollList(scene, { x: 0, y: top, w: lw, h: bodyH, clip });
        this.root.add(this.list);
        this.pv = wide ? { x: lw + 16, y: top, w: w - lw - 16, h: bodyH } : { x: 0, y: top, w, h: bodyH };
        this.pvC = scene.add.container(this.pv.x, this.pv.y);
        this.root.add(this.pvC);
        if (!wide) this.showView('list');
        // 모달을 닫지 않고 장면이 바뀌어도(scene.start) 지연 콜백 무효화 + RM 캐시 텍스처 해제
        this.onShutdown = () => this.destroy();
        scene.events.once('shutdown', this.onShutdown);
        this.reload();
    }

    // 좁은 화면 목록/미리보기 전환(숨긴 쪽은 화면 밖으로 옮겨 입력도 막는다)
    showView(k) {
        if (this.wide) return;
        this.view = k;
        this.list.setVisible(k === 'list').setX(k === 'list' ? 0 : -100000);
        this.pvC.setVisible(k === 'pv').setX(k === 'pv' ? this.pv.x : -100000);
        this.viewTabs?.setActive(k);
    }

    value() { return this.selected; }
    setMode(mode) { if (mode !== this.mode) { this.mode = mode; this.reload(); } }
    setFilter(k, v) { this.filters[k] = v; this.reload(); }

    async reload() {
        const t = ++this.token;
        this.renderList(null, '맵 목록을 불러오는 중…');
        try {
            const q = { mode: this.mode, ...Object.fromEntries(Object.entries(this.filters).filter(([, v]) => v != null)) };
            const d = await gameApi.maps.list(q);
            if (t !== this.token || !this.root.scene) return;
            // 인원 구간: 권장 범위 [min,max] 가 구간과 겹치거나 권장값이 없는 맵
            const ps = this.perSide;
            this.maps = d.maps.filter((m) => (!ps || !Array.isArray(m.recommended_per_side) || (m.recommended_per_side[0] <= ps[1] && m.recommended_per_side[1] >= ps[0])) && (!this.biome || m.biome === this.biome));
            this.defaultCode = d.default_code;
            const keep = this.selected === 'random' || this.maps.some((m) => m.code === this.selected);
            if (!keep) this.selected = this.maps.some((m) => m.code === this.defaultCode) ? this.defaultCode : (this.maps[0]?.code ?? 'random');
            this.renderList();
            this.preview();
        } catch (e) {
            if (t !== this.token || !this.root.scene) return;
            this.maps = []; this.selected = null;
            this.renderList(null, `맵 목록을 불러오지 못했습니다(기본 맵으로 생성). ${messageOf(e)}`);
            this.clearPreview();
        }
    }

    renderList(_, msg) {
        const s = this.scene; const list = this.list;
        this.hideTip();
        list.content.removeAll(true);
        const w = list.w;
        if (msg) { list.content.add(noteText(s, 6, 8, msg, { kind: 'info', size: 13, wrap: w - 12 })); list.setContentHeight(60); return; }
        const rowH = 52; const gap = 6; // 2026-11-06: 58 -> 52(목록이 더 많이 보이게)
        const items = [{ code: 'random', name: '랜덤', random: true }, ...this.maps];
        items.forEach((m, i) => {
            const sel = m.code === this.selected;
            const c = s.add.container(0, i * (rowH + gap));
            const bg = s.add.rectangle(0, 0, w, rowH, sel ? COLOR.panelLight : COLOR.navyDeep, 0.9).setOrigin(0).setStrokeStyle(2, sel ? COLOR.accentLight : COLOR.accent, sel ? 1 : 0.45).setInteractive({ useHandCursor: true });
            bg.on('pointerup', (p) => { if (p.getDistance() > 12) return; this.select(m.code); });
            c.add(bg); c.clipH = rowH;
            // 지형 아이콘(코드 도형, 이미지 없음) — 마우스 올림/누름 시 지형명 툴팁. 랜덤 행은 '?' 배지. 글자는 아이콘 오른쪽 46 에서 시작(행 정렬 통일)
            const isz = 28; const ix = 10; const iy = (rowH - isz) / 2;
            const ic = m.random ? randomBadge(s, ix, iy, isz) : biomeIcon(s, ix, iy, isz, m.biome);
            c.add(ic);
            const bk = m.random ? null : biomeKo(m.biome);
            if (!m.random) {
                const tip = bk ? `지형: ${bk}` : '지형'; // 매핑 없는 biome = 기본 아이콘 + '지형'(영문 노출 금지)
                const ih = s.add.rectangle(ix - 4, 0, isz + 8, rowH, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
                ih.on('pointerover', () => this.showTip(ic, tip));
                ih.on('pointerout', () => this.hideTip());
                ih.on('pointerdown', () => this.showTip(ic, tip));
                ih.on('pointerup', (p) => { if (p.getDistance() > 12) return; this.select(m.code); });
                c.add(ih);
            }
            const tx = 46;
            const title = makeText(s, tx, 16, m.random ? '랜덤 (서버 추첨)' : `${m.name}${m.code === this.defaultCode ? ' · 기본' : ''}`, { size: 15, bold: true, origin: [0, 0.5], color: sel ? CSS.accent : CSS.text });
            fitText(title, w - tx - 12 - (m.size_class === 'L' ? 46 : 0));
            c.add(title);
            if (m.size_class === 'L') {
                c.add(s.add.rectangle(w - 50, 6, 42, 20, COLOR.accent, 1).setOrigin(0));
                c.add(makeText(s, w - 29, 16, '대형', { size: 12, bold: true, color: CSS.onAccent, origin: [0.5, 0.5] }));
            }
            // 보조줄: 크기·권장 인원(정보)·출전 영웅 수(서버 party_size 가 올 때만)·난이도. 지형명은 아이콘 툴팁으로
            const sub = m.random ? '조건에 맞는 맵 중 하나를 서버가 고릅니다' : [`${m.width}×${m.height}`, sizePartyText(m), recText(m), m.difficulty_hint != null ? `난이도 ${m.difficulty_hint}` : ''].filter(Boolean).join(' · ');
            const st = makeText(s, tx, 37, sub, { size: 12, color: CSS.muted, origin: [0, 0.5] });
            fitText(st, w - tx - 12);
            c.add(st);
            list.content.add(c);
        });
        let hgt = items.length * (rowH + gap);
        if (!this.maps.length) { list.content.add(noteText(s, 6, hgt + 4, '조건에 맞는 맵이 없습니다. 크기 필터를 바꾸거나 랜덤을 선택하세요.', { kind: 'info', size: 13, wrap: w - 12 })); hgt += 50; }
        list.setContentHeight(hgt);
    }

    // 지형 아이콘 툴팁(장면 최상단, 목록 마스크 밖). 2.2초 뒤 자동 해제
    showTip(target, text) {
        this.hideTip();
        const s = this.scene;
        if (!target.scene || !s?.add) return;
        const mtx = target.getWorldTransformMatrix();
        const t = makeText(s, 8, 5, text, { size: 12, bold: true });
        const tw = t.width + 16; const th = t.height + 10;
        const x = Math.max(4, Math.min(L.lw - tw - 4, mtx.tx));
        const y = mtx.ty - th - 4 < 0 ? mtx.ty + 32 : mtx.ty - th - 4;
        const c = s.add.container(x, y).setDepth(5000);
        c.add([s.add.rectangle(0, 0, tw, th, COLOR.ink, 0.95).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.8), t]);
        this.tip = c;
        s.time.delayedCall(2200, () => { if (this.tip === c) this.hideTip(); });
    }
    hideTip() { if (this.tip?.scene) this.tip.destroy(); this.tip = null; }

    select(code) {
        if (code === this.selected) return;
        this.selected = code;
        const y = this.list.content.y;
        this.renderList();
        this.list.scrollTo(y);
        this.preview();
    }

    clearPreview() { this.ground?.destroy(); this.ground = null; this.pvC.removeAll(true); }

    async preview() {
        const s = this.scene; const pv = this.pv;
        const t = ++this.pvToken;
        this.clearPreview();
        const m = this.maps.find((x) => x.code === this.selected);
        if (!m) { this.pvC.add(noteText(s, 0, 4, this.selected === 'random' ? '랜덤: 방을 만들 때 서버가 맵을 정합니다. 결정된 맵은 대기실에 표시됩니다.' : '맵을 선택하세요.', { kind: 'info', size: 14, wrap: pv.w })); return; }
        const info = makeText(s, 0, 0, `${m.name}`, { size: 17, heading: true, color: CSS.accent });
        fitText(info, pv.w);
        const tk = tagsKo(m.tags);
        const lines = [[`${m.width}×${m.height} ${SIZE_KO[m.size_class] ?? ''}`, biomeKo(m.biome), recText(m)].filter(Boolean).join(' · '), [m.theme ? `테마 ${m.theme}` : '', m.difficulty_hint != null ? `난이도 ${m.difficulty_hint}` : '', tk.length ? tk.join(', ') : ''].filter(Boolean).join(' · ')].filter(Boolean);
        const sub = makeText(s, 0, 26, lines.join('\n'), { size: 13, color: CSS.muted, wrap: pv.w });
        this.pvC.add([info, sub]);
        const mapY = 26 + sub.height + 8;
        const loading = makeText(s, pv.w / 2, mapY + 30, '미리보기 불러오는 중…', { size: 13, color: CSS.muted, origin: [0.5, 0.5] });
        this.pvC.add(loading);
        let p;
        try { p = await gameApi.maps.preview(m.code); } catch (e) { if (t === this.pvToken && loading.scene && this.pvC.scene) loading.setText(`미리보기 실패: ${messageOf(e)}`); return; }
        // 지연 응답 방어: 모달 닫힘·장면 전환(shutdown) 뒤면 그리지 않는다(파괴된 컨테이너/텍스처에 그리기 방지)
        if (t !== this.pvToken || !this.root.scene || !this.pvC.scene || !s.sys?.isActive?.() || !s.textures) return;
        loading.destroy();
        const tiles = normalizeTiles(p.tiles);
        const W = p.width ?? tiles[0]?.length ?? 0; const H = p.height ?? tiles.length;
        if (!W || !H) return;
        // unity32 지형이면 칸 백킹 px 를 32 정수배로 내림(정수 배율). 지나치게 작아지면 폭 맞춤 유지(u32SnapTile)
        const tw = u32SnapTile(Math.max(4, Math.floor(Math.min(pv.w / W, (pv.h - mapY - 22) / H))), L.u || 1, ['unity32', 'v3'].includes(settings.get().terrainStyle)).tw;
        const ox = Math.floor((pv.w - tw * W) / 2);
        const mapC = s.add.container(ox, mapY);
        this.pvC.add(mapC);
        const mapObj = { w: W, h: H, tiles, biome: m.biome ?? p.biome ?? null, decor: p.decor ?? m.decor ?? null, villageStyle: p.village_style ?? null, tileLayer: p.tile_layer ?? null }; // tile_layer: preview 응답에 있을 때만
        if (rmReady(s)) {
            try { this.ground = new RmGround(s, mapC, mapObj, { tile: tw, res: Math.max(8, Math.min(48, Math.round(tw * (L.u || 1)))) }); } catch (e) { console.warn('[maps] rm 미리보기 실패 -> 색 썸네일', e); this.ground = null; }
        }
        const g = s.add.graphics();
        if (!this.ground) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g.fillStyle(TCOLOR[tiles[y]?.[x]] ?? TCOLOR.plain, 1).fillRect(x * tw, y * tw, tw, tw);
        // 배치 구역(옅은 면) + 시작 위치(첫 좌표 = 지휘관, 큰 점)
        const side = { a: COLOR.ally, b: COLOR.danger };
        Object.entries(p.deploy_zones ?? {}).forEach(([k, cells]) => (cells ?? []).forEach(([x, y]) => g.fillStyle(side[k] ?? COLOR.muted, 0.28).fillRect(x * tw, y * tw, tw, tw)));
        Object.entries(p.spawns ?? {}).forEach(([k, cells]) => (cells ?? []).forEach(([x, y], i) => { g.fillStyle(side[k] ?? COLOR.muted, 1).fillCircle((x + 0.5) * tw, (y + 0.5) * tw, Math.max(2, tw * (i === 0 ? 0.32 : 0.2))); g.lineStyle(1, COLOR.ink, 0.9).strokeCircle((x + 0.5) * tw, (y + 0.5) * tw, Math.max(2, tw * (i === 0 ? 0.32 : 0.2))); }));
        g.lineStyle(2, COLOR.accent, 0.85).strokeRect(0, 0, W * tw, H * tw);
        mapC.add(g);
        this.pvC.add(makeText(s, 0, mapY + H * tw + 6, '청색 = 우리 편 시작·배치 구역 · 적색 = 상대 · 큰 점 = 지휘관', { size: 11, color: CSS.muted }));
    }

    // 모달 닫힘(onClose)에서 호출: 컨테이너는 이미 파괴됐을 수 있으므로 RM 캐시 텍스처만 확실히 해제
    destroy() { this.hideTip(); this.scene?.events?.off('shutdown', this.onShutdown); this.token += 1; this.pvToken += 1; try { this.ground?.destroy(); } catch { /* 이미 해제 */ } this.ground = null; if (this.root.scene) this.root.destroy(true); }
}
