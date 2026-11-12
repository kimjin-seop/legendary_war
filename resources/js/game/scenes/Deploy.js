import Phaser from 'phaser';
import { FlatPanel } from '../ui/FlatPanel.js';
import { terrainTileKey, u32SnapTile } from '../systems/terrainTiles.js';
import { settings } from '../settings.js';
import { tileTexKey, loadMapArtAssets, prefetchMapArtManifest } from '../assets.js';
import { RmGround, rmReady } from '../fx/RmGround.js';
import { MapArtLayer, PaintedGround, paintedKey, tbVillageReady, tbWallReady } from '../fx/MapArtLayer.js';
import { artCulture, mapArtOpts, normalizePainted } from '../data/mapArt.js';
import { TILE } from '../UnitView.js';
import { unitType, terrainName, terrainMod, typeAlias } from '../data/rules.js';
import { unitTex, queueScope, ensureUnitTex } from '../assets.js';
import { trackLoadProgress } from '../ui/LoadProgress.js';
import { rarityColor } from '../rarity.js';
import { auraDesc } from '../systems/glossary.js';
import { heroLabel, heroPlainName, skillLines, unitClassName } from '../systems/names.js';
import { troopIcon } from '../ui/GameIcons.js';
import { enemyTypeCounts, counterOf } from '../systems/enemyComp.js';

// 부대 편성(squad on 배치 응답): 병종 8종, 영웅별 색 밴드(배치 마커·부대 칩·연결선 공통)
const BAND = [0xd8b04a, 0x4fd1c1, 0xb06ad8, 0xf08a55, 0x6aa8f0];
const MAX_TROOP_SLOTS = 4; // 서버 troop_slots 최대(레벨 1:2 / 10:3 / 20:4). 잠금 칸 표시용
import { Button } from '../ui/Button.js';
import { CostMeter } from '../ui/CostMeter.js';
import { StatBar } from '../ui/StatBar.js';
import { showToast } from '../ui/Toast.js';
import { makeText, addBackdrop, fitText } from '../ui/common.js';
import { slice } from '../ui/skin.js';
import { raritySlotKey, rarityBadge } from '../rarity.js';
import { ScrollList, noteText, alertModal, confirmModal } from '../ui/widgets.js';
import { COLOR, CSS, GRADE, syncView } from '../theme.js';
import { L, UNIT, setupCamera, relayoutOnChange } from '../layout.js';
import { MiniMap } from '../ui/MiniMap.js';

// 큰 맵 배치(모바일 세로·좁은 화면): 맞춤 칸이 TOUCH_PX(CSS px) 미만이면 줌/팬 모드. 줌 기본 = 칸 ZOOM_PX, 최대 = MAX_PX
const TOUCH_PX = 32; const ZOOM_PX = 40; const MAX_PX = 64;
import { gameApi } from '../api/gameApi.js';
import { session } from '../api/client.js';
import { messageOf, errorTag } from '../api/errors.js';
import { audio } from '../audio.js';
import { mountRoomChat } from '../ui/RoomChat.js';
import { conceptPopup, stageHint } from '../tutorial/guideFlow.js';

// 배치 화면(스테이지/방 공용). data: {mode:'stage'|'room', battleId?, roomCode?, info?, stageName?}
// info = GET deployment 응답 {max_cost, max_party_slots, default_party, candidates[{user_hero_id,name,rarity,cost,level,unit_type}],
//        deploy_zone[[x,y]], enemy_units[], width, height, tiles[y][x], submitted?, confirmed?, side?}
// 흐름: 후보 선택 -> 배치 가능 칸 클릭 -> PUT deployment(서버 검증) -> POST confirm -> Battle 씬.
//  스테이지: scene.start('Battle', {mode:'stage', battleId, fresh:true})
//  방: confirm 후 Room 씬으로 돌아가 폴링하다가 in_progress 가 되면 Room 씬이 Battle 로 넘긴다.
const TILE_KEYS = ['plain', 'forest', 'mountain', 'water'];

export class DeployScene extends Phaser.Scene {
    constructor() { super('Deploy'); }

    // 전투 scope(유닛 스프라이트·타일·이펙트·전투 배경) 로드: 처음 진입 때만 받고(이후엔 텍스처 재사용으로 즉시), 진행률(MB·남은 개수) 표시. 실패 항목은 코드 생성 폴백
    preload() {
        try { if (queueScope(this, 'battle')) trackLoadProgress(this, { title: '전장 준비' }); } catch (e) { console.warn('[deploy] 전투 에셋 큐 실패(폴백)', e); }
    }

    init(data) {
        this.mode = data?.mode ?? 'stage';
        this.battleId = data?.battleId ?? this.battleId;
        this.roomCode = data?.roomCode ?? this.roomCode;
        // 새 진입(Lobby/Battle/Room 은 placements 키 없이 시작)이면 이전 전투의 배치/부대/초기화 기준/배치 정보를 버린다.
        // Phaser 는 씬 인스턴스를 재사용하므로 안 지우면 이전 전투(튜토리얼 river_02 등)의 좌표가 새 맵에 남아 outside_deploy_zone(422). relayout 재시작은 placements 키를 항상 넘긴다.
        if (data && !('placements' in data)) {
            this.info = null; this.placements = null; this.troops = null; this.troopsDirty = false; this.initialPlacements = null;
        }
        this.info = data?.info ?? this.info ?? null;
        this.stageName = data?.stageName ?? this.stageName ?? '';
        this.stageCode = data?.stageCode ?? this.stageCode ?? null; // 스테이지 안내(tutorial_guide stage_hints)용
        this.placements = data?.placements ?? this.placements ?? null; // [{user_hero_id,x,y}]
        this.troops = data?.troops ?? this.troops ?? null; // Map<user_hero_id, [{class,x?,y?}]> (squad 편성)
        this.troopsDirty = data?.troopsDirty ?? this.troopsDirty ?? false;
        this.initialPlacements = data?.initialPlacements ?? this.initialPlacements ?? null; // '초기화' 기준(최초 배치)
        this.selected = null;
        this.pick = null; // 맵에서 집어 든 유닛 {kind:'hero', uhid} | {kind:'troop', uhid, idx} (탭-탭/드래그 이동)
        this.drag = null;
    }

    create() {
        this.modalCount = 0;
        this.submitting = null; // 배치 확정 진행 중 문구(씬 재사용 시 초기화)
        syncView();
        setupCamera(this, CSS.bg);
        relayoutOnChange(this, () => ({ mode: this.mode, battleId: this.battleId, roomCode: this.roomCode, info: this.info, stageName: this.stageName, placements: this.placements, troops: this.troops, troopsDirty: this.troopsDirty, initialPlacements: this.initialPlacements }));
        addBackdrop(this, L.lw, L.lh);
        audio.bgm(audio.lobbyBgm(), this); // 편성/출격 준비: 로비와 같은 트랙(임시 — 전용 '출진 준비' 트랙 생기면 교체)
        if (this.mode !== 'room') this.time.delayedCall(900, () => { if (this.sys.isActive() && !conceptPopup(this, 'C_cost')) stageHint(this, this.stageCode, 'deploy'); }); // 코스트 팝업이 안 뜨면 스테이지 편성 안내(1회) // 새 흐름 사용자: 첫 편성 화면 코스트 개념 팝업(1회)
        this.loading = makeText(this, L.lw / 2, L.lh / 2, '배치 정보를 불러오는 중...', { size: 18, color: CSS.muted, origin: [0.5, 0.5] });
        // 주의: Phaser 가 씬 인스턴스에 this.load(LoaderPlugin) 를 주입하므로 메서드 이름 load 는 예약어(덮어쓰기 -> "this.load is not a function")
        this.loadData().catch((e) => {
            if (!this.loading?.scene) return;
            this.loading.setText('');
            noteText(this, L.lw / 2, L.lh / 2 - 20, messageOf(e), { kind: 'error', size: 16, origin: [0.5, 0.5], wrap: L.lw - 48 });
            new Button(this, { x: L.lw / 2 - 170, y: L.lh / 2 + 16, w: 160, label: '다시 시도', variant: 'primary', onClick: () => this.scene.restart({}) });
            new Button(this, { x: L.lw / 2 + 10, y: L.lh / 2 + 16, w: 160, label: '로비로', onClick: () => this.scene.start('Lobby', { tab: this.mode === 'room' ? 'room' : 'stage' }) });
        });
    }

    async loadData() {
        // relayout 재시작은 같은 씬 인스턴스를 다시 create 한다: 이전 loadData 가 늦게 끝나 새 로딩 문구를 지우고 build 를 한 번 더 하지 않도록 세대 확인
        const gen = (this.loadGen = (this.loadGen ?? 0) + 1);
        const live = () => gen === this.loadGen && !!this.loading?.scene;
        if (!this.info) {
            prefetchMapArtManifest(this); // tb_manifest.json 을 배치 API 와 병렬로(직렬 왕복 1회 절약)
            this.info = this.mode === 'room' ? await gameApi.rooms.deployment(this.roomCode) : await gameApi.battle.deployment(this.battleId);
        }
        if (!live()) return;
        await this.prepareMapArt(); // 개편 맵: 전투와 같은 v3 시트·소품·통그림을 먼저 받는다(이미 있으면 즉시)
        if (!live()) return;
        this.loading.destroy();
        const info = this.info;
        // 출전 상한: 서버 배치 응답 값이 단일 출처(스테이지 = 캠페인 슬롯 곡선, 방 = PvP 값). 구 응답에 없을 때만 profile 캠페인 값 폴백(스테이지)
        if (this.mode !== 'room') {
            const pf = session.profile;
            info.max_party_slots ??= pf?.campaign_max_party_slots ?? pf?.max_party_slots;
            info.max_cost ??= pf?.campaign_max_cost ?? pf?.max_cost;
        }
        this.byId = new Map(info.candidates.map((c) => [c.user_hero_id, c]));
        // 필수 출전(forced[{hero, user_hero_id, unit_type, troop_type, troop_label, free_slot, free_cost}] + candidates[].forced): 해제 불가 고정 슬롯, 슬롯 면제(free_slot). 코스트는 합산(2026-11-08 free_cost=false)
        this.forced = new Map();
        (info.forced ?? []).forEach((f) => { const c = f?.user_hero_id != null ? this.byId.get(f.user_hero_id) : info.candidates.find((x) => x.hero === f?.hero); if (c) this.forced.set(c.user_hero_id, { ...f, user_hero_id: c.user_hero_id }); });
        info.candidates.forEach((c) => { if (c.forced && !this.forced.has(c.user_hero_id)) this.forced.set(c.user_hero_id, { hero: c.hero, user_hero_id: c.user_hero_id, unit_type: c.unit_type, troop_label: c.troop_label, free_slot: true, free_cost: false }); }); // 코스트 면제 폐지(서버 forced[].free_cost=false)
        // 부대 편성(squad on): formation{user_hero_id:{slots,user_selected,troops:[{class,cost}]}} -> 영웅별 [{class,x?,y?}]
        this.squad = !!info.squad;
        this.radius = info.troop_place_radius ?? 3;
        this.classCost = {};
        if (!this.troops) {
            this.troops = new Map();
            Object.entries(info.formation ?? {}).forEach(([id, f]) => {
                (f.troops ?? []).forEach((t) => { if (t.cost != null) this.classCost[t.class] = t.cost; });
                this.troops.set(Number(id), (f.troops ?? []).map((t) => ({ class: t.class })));
            });
        }
        Object.values(info.formation ?? {}).forEach((f) => (f.troops ?? []).forEach((t) => { if (t.cost != null) this.classCost[t.class] = t.cost; }));
        this.pick = null;
        this.zone = new Set(info.deploy_zone.map(([x, y]) => `${x},${y}`));
        // 배치 슬롯 모드(서버 slot_mode + slots[], docs/DEPLOY_SLOTS_20261108.md): 영웅은 슬롯 칸에만 선다.
        //  고정(kind fixed, locked) = 정해진 영웅 전용·이동/해제 불가·코스트 포함 / 선택(kind free) = 보유 영웅 자유(unit_types 제약). 병사는 기존 배치 영역(deploy_zone) 그대로.
        //  slot_mode false(레거시·방 대전·PvP·자유전)면 기존 동작 그대로
        this.slotMode = !!info.slot_mode && Array.isArray(info.slots) && info.slots.length > 0;
        this.slotAt = new Map(); this.fixedSlotOf = new Map();
        if (this.slotMode) info.slots.forEach((s) => { if (!Number.isInteger(s?.x) || !Number.isInteger(s?.y)) return; this.slotAt.set(`${s.x},${s.y}`, s); if (s.kind === 'fixed' && s.user_hero_id != null) this.fixedSlotOf.set(Number(s.user_hero_id), s); });
        // 고정 슬롯 영웅 = 해제 불가 필수 출전(서버 forced 에 없더라도 보강). 슬롯 수 면제, 코스트 포함
        this.fixedSlotOf.forEach((s, id) => { if (!this.forced.has(id) && this.byId.has(id)) this.forced.set(id, { hero: s.hero, user_hero_id: id, unit_type: s.unit_type ?? null, troop_type: s.troop_type ?? null, free_slot: true, free_cost: false }); });
        if (!this.placements) {
            const sub = info.submitted;
            if (Array.isArray(sub) && sub.length) {
                this.placements = sub.map((p) => ({ user_hero_id: p.user_hero_id, x: p.x, y: p.y }));
                // 제출했던 병사 위치(placements[].troops[{class,x,y}]) 복원 = 수동 지정. 서버 병종 순서대로 같은 병종부터 채운다
                sub.forEach((p) => {
                    const list = this.troops.get(p.user_hero_id) ?? [];
                    (Array.isArray(p.troops) ? p.troops : []).forEach((st) => {
                        const t = list.find((q) => q.x == null && q.class === st.class) ?? list.find((q) => q.x == null);
                        if (t && Number.isInteger(st.x) && Number.isInteger(st.y)) { t.x = st.x; t.y = st.y; }
                    });
                });
            }
            else {
                // 기본 편성 자동 배치: 서버 default_positions[user_hero_id]{x,y}(배치 영역 안·빈 칸)가 있으면 그 위치, 없으면 배치 영역 앞쪽 칸부터. 병사는 서버가 자동 배치
                const dp = info.default_positions ?? {};
                const ids = this.lastPartyIds(); // 마지막 출격 구성(서버 자동 저장) = 기본 선택. 필수 출전은 맨 앞 고정 + 슬롯 면제
                const taken = new Set();
                const pos = new Map();
                ids.forEach((id) => { const p = dp[id] ?? dp[String(id)]; const k = p ? `${p.x},${p.y}` : null; if (k && this.zone.has(k) && !taken.has(k) && !this.heroSlotError(id, p.x, p.y)) { taken.add(k); pos.set(id, { x: p.x, y: p.y }); } });
                const free = info.deploy_zone.filter(([x, y]) => !taken.has(`${x},${y}`));
                // 배치 영역 칸보다 영웅이 많으면(작은 구역) 남는 영웅은 빼고 시작([0,0] 겹침 = 서버 outside_deploy_zone 422 방지). 슬롯 모드 = 그 영웅이 설 수 있는 빈 슬롯
                this.placements = ids.map((id) => { const p = pos.get(id) ?? (this.slotMode ? this.takeSlotCell(id, taken) : (() => { const c = free.shift(); return c ? { x: c[0], y: c[1] } : null; })()); return p ? { user_hero_id: id, x: p.x, y: p.y } : null; }).filter(Boolean);
            }
        }
        if (!this.initialPlacements) this.initialPlacements = this.placements.map((p) => ({ ...p }));
        this.build();
    }

    // 배치 응답 -> 지형 렌더용 map 객체(battleStore s.map 과 같은 키). 개편 필드가 없으면 null -> mapArtOpts 가 기존 경로 유지
    deployMapObj() {
        const i = this.info;
        return { w: i.width, h: i.height, tiles: i.tiles, biome: i.biome ?? null, decor: i.decor ?? null, villageStyle: i.village_style ?? null, tileLayer: i.tile_layer ?? null, props: i.props ?? null, paintedBg: i.painted_bg ?? null, culture: i.culture ?? null, gates: i.gates ?? null, castleRender: i.castle_render ?? null, groundTone: i.ground_tone ?? null, wallStyle: i.wall_style ?? null, pierStyle: i.pier_style ?? i.meta?.pier_style ?? null };
    }

    // 개편 맵 에셋(v3 시트·tb_manifest·이 맵의 소품·통그림) 선로드. 실패·시간 초과는 기존 지면 폴백(build 에서 텍스처 유무로 판정)
    async prepareMapArt() {
        try {
            const mapObj = this.deployMapObj();
            const art = mapArtOpts(settings.get(), mapObj);
            if (!art) return;
            const p0 = art.painted ? normalizePainted(mapObj.paintedBg) : null;
            await loadMapArtAssets(this, mapObj, art, p0 ? { ...p0, key: paintedKey(p0.src) } : null);
        } catch (e) { console.warn('[deploy] mapArt 에셋 로드 실패 -> 기존 지면', e); }
    }

    // 적 미리보기 칩 줄(흐름 배치, 폭 w 에서 줄바꿈, 최대 3줄 — 넘치면 마지막에 '…'). chip = {text, icon?(병종), counter?(유리 병종), color?, bold?}
    // 반환 container(.height = 실제 높이). 칩이 없으면 높이 0
    buildEnemyChips(x, y, w, chips) {
        const c = this.add.container(x, y);
        const LH = 22; const ICO = 16; const GAP = 12; const MAXL = 3;
        let cx = 0; let line = 0; let cut = false;
        for (const ch of chips) {
            const parts = [];
            let pw = 0;
            if (ch.icon) { const ic = troopIcon(this, ch.icon, ICO / 2, LH / 2, ICO, { max: ICO + 4 }); if (ic) { parts.push([ic, 0, true]); pw = ICO + 4; } }
            const t = makeText(this, pw, LH / 2, ch.text, { size: 13, bold: ch.bold ?? !!ch.icon, color: ch.color ?? CSS.dangerText, origin: [0, 0.5] });
            parts.push([t, pw]); pw += t.width;
            if (ch.counter) { const k = makeText(this, pw + 4, LH / 2, `${unitClassName(ch.counter)} 유리`, { size: 12, color: CSS.allyText, origin: [0, 0.5] }); parts.push([k, pw + 4]); pw += 4 + k.width; }
            if (cx > 0 && cx + pw > w) { cx = 0; line += 1; }
            if (line >= MAXL) { parts.forEach(([o]) => o.destroy()); cut = true; break; }
            parts.forEach(([o, ox, isIco]) => { o.x = cx + (isIco ? ICO / 2 : ox); o.y = line * LH + LH / 2; c.add(o); });
            cx += pw + GAP;
        }
        if (cut) c.add(makeText(this, Math.min(cx, w - 12), (MAXL - 1) * LH + LH / 2, '…', { size: 13, color: CSS.muted, origin: [0, 0.5] }));
        c.height = chips.length ? Math.min(line + 1, MAXL) * LH : 0;
        return c;
    }

    build() {
        const info = this.info;
        const m = 12;
        const top = L.safe.t + m;
        const bottom = L.lh - L.safe.b - m;
        const left = L.safe.l + m; const right = L.lw - L.safe.r - m;
        const portrait = L.portrait;
        const sideW = portrait ? right - left : Math.min(340, (right - left) * 0.36);
        const sideH = portrait ? Math.min(300, (bottom - top) * 0.42) : bottom - top;
        const side = portrait ? { x: left, y: bottom - sideH, w: sideW, h: sideH } : { x: right - sideW, y: top, w: sideW, h: sideH };
        const map = portrait ? { x: left, y: top + 44, w: right - left, h: side.y - m - (top + 44) } : { x: left, y: top + 44, w: side.x - m - left, h: bottom - (top + 44) };
        // 맵 조작 버튼(제목 줄 오른쪽): 부대 자동 배치(수동 지정 해제 -> 영웅 주변으로 모으기) / 초기화(최초 배치 + 병사 자동)
        const mapRight = portrait ? right : side.x - m;
        // 버튼 높이 44(Secondary 규격·터치 44): Button 은 h 를 MIN_TOUCH(44) 이상으로 올리므로 배치 계산도 44 기준(Mid-5 재수정: 32 로 계산해 안내문과 8px 겹치던 문제)
        const bw = portrait ? 92 : 104; const bH = 44; let bx = mapRight - bw;
        new Button(this, { x: bx, y: top, w: bw, h: bH, label: '초기화', size: 14, onClick: () => this.resetAll() });
        if (info.squad) { bx -= bw + 8; new Button(this, { x: bx, y: top, w: bw, h: bH, label: '부대 자동 배치', size: 13, onClick: () => this.autoTroops() }); }
        fitText(makeText(this, left, top + bH / 2, `${this.mode === 'room' ? `방 ${this.roomCode} 배치` : `${this.stageTitle()} 배치`}`, { size: portrait ? 18 : 20, heading: true, color: CSS.accent, origin: [0, 0.5] }), Math.max(80, bx - 8 - left), { fallback: this.mode === 'room' ? undefined : this.stageTitle() }); // 좁으면 ' 배치' 생략 → 말줄임
        this.hintW = mapRight - left;
        // 안내문: 버튼 줄 아래 4px 부터(위쪽 원점), 최대 2줄 줄바꿈(말줄임 해소). 가장 긴 안내 문구 기준으로 높이를 예약해 문구가 바뀌어도 아래 줄과 겹치지 않게
        this.hintT = makeText(this, left, top + bH + 4, '초록 칸을 눌러 병사를 옮기세요. 같은 병사를 다시 누르면 자동 배치로 (Esc 취소)', { size: 13, color: CSS.muted, origin: [0, 0], wrap: this.hintW });
        fitText(this.hintT, this.hintW, { maxLines: 2 });
        const hintH = this.hintT.height;
        this.hintT.setText('');
        // 적 정보 미리보기(배치 응답 기준): 적 지휘관·부대 병종 구성·맵 크기·주요 지형. 권장 레벨/맵 이름은 서버 미제공(요청서)
        const en = info.enemy_units ?? [];
        const cmdE = en.find((u) => u.kind === 'commander');
        const comp = enemyTypeCounts(en, (u) => u === cmdE); // 병종 집계(systems/enemyComp, 패배 결과창 힌트와 같은 로직)
        const tc = {};
        info.tiles.forEach((row) => row.forEach((c) => { if (c !== 'plain') tc[c] = (tc[c] ?? 0) + 1; }));
        const terr = Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${terrainName(c)} ${n}`).join(' · ');
        // 맵 크기·지형 칸 수는 디버그 통계 -> 개발 플래그(?debug=1 / localStorage srpg.debug=1)일 때만
        const dbg = (() => { try { return new URLSearchParams(location.search).get('debug') === '1' || localStorage.getItem('srpg.debug') === '1'; } catch { return false; } })();
        // 제목·안내 아래 별도 줄(줄바꿈 높이만큼 맵을 아래로 밀어 겹침 방지: 모바일 세로 [C]).
        // 적 미리보기 칩: '적 N(+증원 k)' + [병종 아이콘]병종×수 ‹유리 병종(MATCHUPS)›. 증원 구성·함정·적 영웅 정보는 표시하지 않음(배치 응답 공개 유닛·서버 공개 수만)
        const ep = info.enemy_preview ?? info.preview_enemy_counts ?? null;
        const enemyN = Number.isFinite(Number(ep?.initial)) ? Number(ep.initial) : en.length;
        const chips = [];
        if (this.mode !== 'room' && enemyN > 0) chips.push({ text: `적 ${enemyN}${Number(ep?.reinforce) > 0 ? `(+증원 ${ep.reinforce})` : ''}`, color: CSS.dangerText, bold: true });
        if (cmdE) chips.push({ icon: cmdE.type, text: '지휘관', counter: counterOf(cmdE.type) });
        comp.forEach(({ type, n }) => chips.push({ icon: type, text: `${unitClassName(type)}×${n}`, counter: counterOf(type) }));
        if (dbg && info.width && info.height) chips.push({ text: `맵 ${info.width}×${info.height}`, color: CSS.muted });
        if (dbg && terr) chips.push({ text: terr, color: CSS.muted });
        if (info.recommended_level) chips.push({ text: `권장 Lv.${info.recommended_level}`, color: CSS.accent });
        const pvY = top + bH + 4 + hintH + 4;
        const pvW = Math.max(200, (portrait ? right : side.x - m) - left);
        this.previewT = this.buildEnemyChips(left, pvY, pvW, chips);
        const ph = this.previewT.y + this.previewT.height + 8 - map.y; // 맵은 적 정보 줄 아래부터
        map.y += ph; map.h -= ph;
        // 맵 아래 범례: 최대 2줄 줄바꿈(말줄임 해소). 실제 높이 + 여백 6 만큼 맵 높이에서 뺀다(I-13: 범례가 화면 아래로 잘림 방지)
        // 강화면 gacha107: 범례가 짧아진 뒤(역할 마크 제거) 한 줄로 그려져 390 화면 밖(x 402)으로 나가고 맵 하단에 겹침 -> 줄바꿈 폭 = 맵 칸 폭과 화면 오른쪽 여백 중 작은 값,
        //  2줄을 넘을 때만 fitText 로 줄이고, 위치는 맵 시야(view) 바로 아래(아래 setPosition)
        const legW = Math.max(120, Math.min(map.w, L.lw - L.safe.r - 8 - map.x));
        const legendT = makeText(this, 0, 0, `청색 칸 = 배치 가능${info.squad ? ' · 흐린 병사 = 자동 배치 예정' : ''} · 유닛을 끌거나 눌러 이동`, { size: 12, color: CSS.muted, wrap: legW });
        if (legendT.height > 12 * 2.8) fitText(legendT, legW, { maxLines: 2 });
        map.h -= legendT.height + 6;
        // 세로: 맵은 폭 기준으로 크기가 정해지므로 남는 세로 공간을 아래 편성 패널(영웅 목록)로 넘긴다(U25: 모바일 목록이 1명만 보이던 문제)
        if (portrait) {
            const spare = Math.floor(map.h - Math.floor(map.w / info.width) * info.height);
            if (spare > 0) { map.h -= spare; side.y -= spare; side.h += spare; }
        }

        // ---- 맵 ----
        // unity32 지형이면 칸 백킹 px 를 32 의 정수배로 내림(정수 배율 = 도트 선명). 지나치게 작아지면 폭 맞춤 유지(u32SnapTile)
        const fitTw = Math.floor(Math.min(map.w / info.width, map.h / info.height));
        const snap = u32SnapTile(fitTw, L.u || 1, ['unity32', 'v3'].includes(settings.get().terrainStyle));
        const tw = snap.tw;
        this.tw = tw;
        console.info(`[deploy] tile ${fitTw} -> ${Math.round(tw * 100) / 100} (backing ${Math.round(tw * (L.u || 1))}px, ${snap.snapped ? '정수 배율' : '폭 맞춤'})`);
        const ox = map.x + (map.w - tw * info.width) / 2; const oy = map.y + (map.h - tw * info.height) / 2;
        // 큰 맵 + 모바일(세로/좁은 화면) + 맞춤 칸 < 32 CSS px: 줌/팬 모드(시야 = 맵 영역, 마스크로 자름). 그 외(작은 맵·데스크톱)는 기존 그대로(배율 1 고정)
        const cssTile = tw * L.ui * UNIT;
        this.zoomable = (portrait || L.lw < 760) && (info.width >= 20 || info.height >= 14) && cssTile < TOUCH_PX;
        this.view = { x: map.x, y: map.y, w: map.w, h: map.h };
        this.cssPerTile = cssTile; // 배율 1 의 칸 CSS px
        this.zMin = 1; this.zTouch = this.zoomable ? ZOOM_PX / cssTile : 1; this.zMax = this.zoomable ? MAX_PX / cssTile : 1;
        this.camZ = 1; this.fullView = null; this.panS = null; this.pinch = null; this.tapBlockUntil = 0; this.fieldPtr = new Set();
        this.slotTags = []; // 슬롯 라벨('고정'·병종 첫 글자): 줌 모드에서 배율 역수로 크기 고정(syncSlotTags)
        // camC(시야 컨테이너: 위치 = 팬, 배율 = 줌) 안에 지형(mapC)·유닛(markC). 배율 1·위치 (ox,oy)면 기존 화면과 같다
        this.camC = this.add.container(ox, oy);
        this.mapC = this.add.container(0, 0);
        this.markC = this.add.container(0, 0);
        this.camC.add([this.mapC, this.markC]);
        if (this.zoomable) this.setupZoomView();
        else this.clipMapView(this.view);
        const mapObj = this.deployMapObj(); // tile_layer: 서버가 있을 때만(names-v1, data/unityPrefabs u32TileLayer). 개편 필드(props·gates·castle_render·ground_tone·culture·painted_bg)는 배치 응답 최상위(GameData::mapExtras)
        // 전투와 같은 지형 렌더(Battle.ensureWorld 와 같은 분기): 통그림 > v3(+마을·성벽 바닥) RmGround > legacy. 개편 소품·성벽·마을은 MapArtLayer(전투 TILE 좌표 -> tw/TILE 배율 컨테이너)
        this.rmGround?.destroy();
        this.rmGround = null;
        this.mapArt?.destroy();
        this.mapArt = null;
        const art = mapArtOpts(settings.get(), mapObj);
        const p0 = art?.painted ? normalizePainted(mapObj.paintedBg) : null;
        const painted = p0 && this.textures.exists(paintedKey(p0.src)) ? { ...p0, key: paintedKey(p0.src) } : null;
        const artScale = tw / TILE;
        if (painted) {
            const pc = this.add.container(0, 0).setScale(artScale);
            this.mapC.add(pc);
            try { this.rmGround = new PaintedGround(this, pc, mapObj, painted, art); } catch (e) { console.warn('[deploy] 통그림 지면 실패 -> 기존 지면', e); this.rmGround?.destroy(); this.rmGround = null; }
        }
        if (!this.rmGround && rmReady(this)) {
            const artOpts = art ? { forceV3: true, villageArt: !!art.village && tbVillageReady(this, artCulture(mapObj, art)), structArt: art.walls !== false && tbWallReady(this), groundTone: mapObj.groundTone ?? null } : {};
            // 줌 모드는 확대 배율(zTouch) 기준 해상도(상한 48), 그 외 zTouch = 1 이라 기존과 같다
            try { this.rmGround = new RmGround(this, this.mapC, mapObj, { tile: tw, res: Math.max(12, Math.min(48, Math.round(tw * this.zTouch * (L.u || 1)))), ...artOpts }); } catch (e) { console.warn('[deploy] rm 지형 실패 -> legacy', e); this.rmGround = null; }
        }
        if (art) {
            const objC = this.add.container(0, 0).setScale(artScale); const upC = this.add.container(0, 0).setScale(artScale);
            this.mapC.add([objC, upC]); // 배치 칸 강조(아래 루프)보다 아래
            const isPainted = this.rmGround instanceof PaintedGround;
            try {
                this.mapArt = new MapArtLayer(this, { groundParent: objC, sortParent: upC }, mapObj, art, { village: !isPainted && !!art.village && (this.rmGround?.villageArt ?? 0) > 0, walls: !isPainted && (this.rmGround?.structArt ?? 0) > 0 });
                this.mapArt.update(0, []); // 솟은 오브젝트끼리 y 정렬 1회(배치 화면은 유닛이 별도 레이어라 매 프레임 갱신 불필요)
            } catch (e) { console.warn('[deploy] mapArt 소품 실패(시각 요소라 무시)', e); this.mapArt?.destroy(); this.mapArt = null; }
        }
        this.events.once('shutdown', () => { this.rmGround?.destroy(); this.rmGround = null; this.mapArt?.destroy(); this.mapArt = null; });
        for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
                const t = info.tiles[y]?.[x] ?? 'plain';
                const tk = this.rmGround ? 'rm' : terrainTileKey(this, mapObj, x, y) ?? tileTexKey(this, t);
                const key = tk ?? (TILE_KEYS.includes(t) ? `tile_${t}` : 'tile_plain');
                if (!this.rmGround) this.mapC.add(this.add.image(x * tw, y * tw, key).setOrigin(0).setDisplaySize(tw, tw));
                if (!tk && !TILE_KEYS.includes(t)) this.mapC.add(makeText(this, x * tw + tw / 2, y * tw + tw / 2, t === 'castle' ? '성' : t[0], { size: Math.max(10, tw * 0.3), heading: true, color: CSS.accent, origin: [0.5, 0.5] }));
                if (this.zone.has(`${x},${y}`)) {
                    // 슬롯 모드: 영웅 자리(슬롯)만 진하게(고정 = 금색 + '고정', 선택 = 청색 + 병종 제약 첫 글자), 나머지 배치 영역(병사용)은 옅게
                    const sl = this.slotMode ? this.slotAt.get(`${x},${y}`) : null;
                    const dim = this.slotMode && !sl;
                    const col = sl?.kind === 'fixed' ? COLOR.accent : COLOR.ally;
                    const z = this.add.rectangle(x * tw + 1, y * tw + 1, tw - 2, tw - 2, col, dim ? 0.1 : 0.28).setOrigin(0).setStrokeStyle(dim ? 1 : 2, col, dim ? 0.35 : 0.9).setInteractive({ useHandCursor: true });
                    z.on('pointerup', (p) => { if (this.modalCount > 0 || p.getDistance() > 12 || this.blockTap(p)) return; this.tapTile(x, y); });
                    this.mapC.add(z);
                    if (sl) {
                        const tag = sl.kind === 'fixed' ? '고정' : (Array.isArray(sl.unit_types) && sl.unit_types.length ? sl.unit_types.map((t) => unitClassName(t).slice(0, 1)).join('') : '');
                        if (tag) {
                            const tagT = makeText(this, x * tw + 3, y * tw + 2, tag, { size: Math.max(9, Math.round(tw * 0.22)), bold: true, color: sl.kind === 'fixed' ? '#f0d58c' : '#cfe8ff', stroke: { color: '#0B1020', width: 3 } });
                            this.mapC.add(tagT);
                            this.slotTags.push({ t: tagT, x: x * tw, y: y * tw });
                        }
                    }
                }
            }
        }
        this.syncSlotTags();
        // 적군 배치 미리보기: 전투와 같은 유닛 스프라이트(적 방향 시트, 정면 idle). 역할 표식 없음(사용자 2026-11-04), 텍스트는 호버 툴팁으로만
        (info.enemy_units ?? []).forEach((u) => {
            const objs = this.unitIcon({ ...u, team: 'enemy' }, u.x, u.y, { size: u.kind === 'troop' ? 0.74 : 0.92, base: COLOR.danger, ring: 0xffb0a0, crown: false }); // 적 지휘관 왕관·금테 제거(사용자 2026-11-04 역할 마크 삭제)
            const hit = this.add.rectangle(u.x * tw, u.y * tw, tw, tw, 0xffffff, 0).setOrigin(0).setInteractive();
            const nm = `적 ${u.display_name ?? u.name ?? ''} (${unitClassName(u.type)})`.replace(/\s+/g, ' ');
            hit.on('pointerover', (p) => { if (!this.zoomable || this.inView(p)) this.showTip(nm, u.x, u.y); });
            hit.on('pointerout', () => this.hideTip());
            hit.on('pointerup', (p) => { if (p.getDistance() <= 12 && this.modalCount <= 0 && !this.blockTap(p)) this.showTip(nm, u.x, u.y); });
            this.markC.add([...objs, hit]);
        });
        legendT.setPosition(map.x, Math.max(oy + tw * info.height, this.zoomable ? map.y + map.h : 0) + 6); // 줌 모드는 시야(맵 영역) 아래, 그 외는 그려진 맵 아래. x = 맵 영역 왼쪽(화면 밖 방지)
        // 이름 툴팁(호버/선택 시): 맵 위 텍스트는 이것만
        this.tipT = makeText(this, 0, 0, '', { size: 12, bold: true, color: '#ffffff', origin: [0.5, 1], stroke: { color: '#0B1020', width: 4 } }).setVisible(false);
        this.tipT.setDepth?.(10);
        this.markC.add(this.tipT);
        // 드래그 이동: 유닛 히트에서 pointerdown -> 12px 이상 움직이면 고스트 표시 -> 놓은 칸으로 이동(탭-탭과 같은 검증)
        // 줌 모드: 핀치(두 손가락) = 연속 확대/축소(두 손가락 가운데 고정), 빈 곳·칸에서 끌기 = 팬, 칸이 작을 때 탭(=더블탭 첫 탭) = 그 지점 확대
        const onMove = (p) => {
            if (this.zoomable && this.camGestureMove(p)) return;
            const d = this.drag;
            if (!d || !p.isDown || this.modalCount > 0) return;
            if (!d.ghost) {
                if (p.getDistance() <= 12) return;
                this.pick = d.ref; this.render(); // 이동 가능 칸 하이라이트
                d.ghost = this.add.container(0, 0, this.unitIcon(d.unit, 0, 0, { size: d.size, base: d.base })).setAlpha(0.75);
                this.markC.add(d.ghost);
            }
            const lp = this.toLocal(p);
            d.ghost.setPosition(lp.x - tw / 2, lp.y - tw / 2);
        };
        const onUp = (p) => {
            if (this.zoomable) this.camGestureUp(p);
            const d = this.drag; this.drag = null;
            if (!d?.ghost) return;
            d.ghost.destroy();
            const lp = this.toLocal(p);
            const x = Math.floor(lp.x / tw); const y = Math.floor(lp.y / tw);
            if (x >= 0 && y >= 0 && x < info.width && y < info.height && (!this.zoomable || this.inView(p))) this.dropAt(d.ref, x, y);
            else { this.pick = null; this.render(); }
        };
        const onDown = (p, over) => { if (this.zoomable) this.camGestureDown(p, over); };
        const onWheel = (p, over, dx, dy) => {
            if (!this.zoomable || this.modalCount > 0 || !this.inView(p) || (over?.[0] && !this.isMapObj(over[0]))) return;
            const q = this.wpt(p);
            this.zoomAt(this.camZ * (dy > 0 ? 1 / 1.25 : 1.25), q.x, q.y);
        };
        this.input.on('pointerdown', onDown);
        this.input.on('pointermove', onMove);
        this.input.on('pointerup', onUp);
        this.input.on('wheel', onWheel);
        this.events.once('shutdown', () => { this.input.off('pointerdown', onDown); this.input.off('pointermove', onMove); this.input.off('pointerup', onUp); this.input.off('wheel', onWheel); });
        if (this.zoomable) this.buildZoomTools();

        // ---- 사이드 패널(후보 + 코스트 + 버튼) ----
        const p = new FlatPanel(this, { x: side.x, y: side.y, w: side.w, h: side.h }); // 전투 HUD 와 같은 플랫 톤
        p.bodyY = 48;
        p.add(makeText(this, 16, 24, '출격 편성', { size: 18, heading: true, color: CSS.accent, origin: [0, 0.5] }));
        // 편성 보조: 자동 편성(레벨 높은 순, 코스트·슬롯 안) / 마지막 편성 불러오기(서버가 확정 때 자동 저장한 마지막 출격 구성)
        p.add(new Button(this, { x: side.w - 16 - 96 * 2 - 6, y: 6, w: 96, h: 36, label: '자동 편성', size: 13, onClick: () => this.autoParty() }));
        p.add(new Button(this, { x: side.w - 16 - 96, y: 6, w: 96, h: 36, label: '마지막 편성', size: 13, onClick: () => this.loadRecent() }));
        const iw = side.w - 32;
        const maxCost = info.max_cost;
        this.meter = maxCost <= 12 ? new CostMeter(this, { x: 16, y: p.bodyY, max: maxCost, value: 0, label: '코스트', inline: true }) : new StatBar(this, { x: 16, y: p.bodyY, w: iw, max: maxCost, value: 0, skin: 'gold', label: '코스트', h: 24 }); // 바 높이 >= 라벨 글자(I-12)
        p.add(this.meter);
        // 슬롯·코스트 요약은 게이지 아래 별도 줄(게이지 안 '코스트 n/m' 글자와 겹침 방지)
        const meterH = Math.max(20, Math.ceil(this.meter.displayHeight || this.meter.height || 24));
        this.slotIw = iw;
        // 핵심(자리·코스트) 1줄 + 부대 전투면 보조(유닛 수) 2줄째(강화면·하플레이 2026-11-09: 한 줄에 네 수치가 붙어 말줄임). 적 수는 맵 위 적 미리보기 칩으로 이동
        const two = !!this.squad;
        this.slotT = makeText(this, 16, p.bodyY + meterH + 12, '', { size: 13, color: CSS.text, origin: [0, 0.5] });
        this.slot2T = two ? makeText(this, 16, p.bodyY + meterH + 29, '', { size: 12, color: CSS.muted, origin: [0, 0.5] }) : null;
        this.reasonT = noteText(this, 16, p.bodyY + meterH + (two ? 40 : 24), '', { kind: 'error', size: 13, wrap: iw });
        p.add([this.slotT, this.reasonT, ...(this.slot2T ? [this.slot2T] : [])]);
        const listY = p.bodyY + meterH + (two ? 66 : 50);
        const btnH = 50;
        this.list = new ScrollList(this, { x: side.x + 16, y: side.y + listY, w: iw, h: side.h - listY - btnH - 24, bar: true }); // U25: 스크롤 단서(우측 바 + 아래 더 있음 페이드)
        this.clipList(this.squad ? 104 : 64); // U25: 이름·칭호·정보 3줄(+ 부대 줄)
        // 확정/포기 버튼은 목록보다 나중에 씬에 추가(표시 순서 = 목록 위). 목록 행이 버튼 영역을 덮어 클릭을 가로채던 문제(I-4)
        const by = side.y + side.h - btnH - 12;
        this.confirmBtn = new Button(this, { x: side.x + 16, y: by, w: iw * 0.6, h: btnH, label: '배치 확정', variant: 'primary', size: 18, onClick: () => this.confirm() });
        new Button(this, { x: side.x + 16 + iw * 0.6 + 8, y: by, w: iw * 0.4 - 8, h: btnH, label: this.mode === 'room' ? '나가기' : '포기', variant: 'danger', size: 16, onClick: () => this.back() });
        this.escFn = (e) => { if (e.key === 'Escape' && !(this.modalCount > 0) && (this.selected || this.pick)) { this.selected = null; this.pick = null; this.render(); } };
        window.addEventListener('keydown', this.escFn);
        this.events.once('shutdown', () => window.removeEventListener('keydown', this.escFn));
        // 방 채팅(방 배치만, solo 방은 서버 409 로 자동 숨김): 가로 = 좌하단(우측 편성 패널·확정 버튼 회피), 세로 = 하단 편성 패널 바로 위 우측. 기본 접힘
        if (this.mode === 'room' && this.roomCode) mountRoomChat(this, { roomCode: this.roomCode, anchor: () => (portrait ? { right: L.safe.r + m, bottom: L.lh - side.y + 8 } : { left, bottom: L.safe.b + m }) });
        this.render();
    }

    // 후보 목록 엄격 클리핑(I-4): ScrollList 기본 클리핑은 경계에 걸친 행을 보이게 둬서 행이 버튼 영역까지 내려와 덮었다.
    // 이 목록만 '영역 안에 완전히 들어온 행'만 보이고 입력을 받게 하고, 스크롤을 행 단위(rowH+6)로 맞춘다(행이 반쯤 걸친 상태 없음).
    // 목록 높이가 한 행보다 낮으면(아주 낮은 화면) 위쪽에 걸친 행만 숨기고 첫 보이는 행은 표시한다.
    clipList(rowH) {
        const list = this.list; const step = rowH + 6;
        const baseScroll = list.scrollTo.bind(list);
        list.clipChildren = () => {
            const top = list.content.y; const all = list.contentH <= list.h;
            list.content.list.forEach((ch) => {
                const h = ch.clipH ?? rowH; const y = top + ch.y;
                const vis = all || (y >= -1 && (y + h <= list.h + 1 || (list.h < h && y < list.h)));
                if (ch.visible !== vis) ch.setVisible(vis);
                (ch.hits ?? []).forEach((o) => { if (o.input) o.input.enabled = vis; });
            });
        };
        // 드래그(시작 위치 + 이동량)는 반올림 스냅(같은 입력 = 같은 결과라 떨림 없음). 맨 아래(min)는 그대로 허용(마지막 행이 바닥에 맞음)
        list.scrollTo = (y) => {
            const min = Math.min(0, list.h - list.contentH);
            baseScroll(y <= min ? min : Math.round(y / step) * step);
        };
        // 휠: 이동량을 누적해 30px 이상이면 한 행씩(트랙패드의 작은 delta 도 동작). ScrollList 기본 휠 핸들러 교체
        this.input.off('wheel', list.onWheel);
        let acc = 0;
        list.onWheel = (p, go, dx, dy) => {
            if (!list.owns(p, go)) return; // 최상단 입력이 이 목록일 때만(모달 위 휠 전파 차단)
            acc += dy;
            if (Math.abs(acc) < 30) return;
            const dir = Math.sign(acc); acc = 0;
            const cur = list.content.y; const min = Math.min(0, list.h - list.contentH);
            const snapped = Math.round(cur / step) * step;
            baseScroll(Math.max(min, Math.min(0, (dir > 0 && cur <= min + 0.5) ? cur : snapped - dir * step)));
        };
        this.input.on('wheel', list.onWheel);
    }

    // 영웅 코스트 합(출전=배치한 영웅만). 2026-11-08 서버 규칙: 필수 출전·고정 슬롯 영웅도 영웅·부대 코스트 모두 합산(코스트 면제 폐지, 슬롯 면제 free_slot 은 유지)
    costOf() { return this.placements.reduce((s, p) => s + (this.byId.get(p.user_hero_id)?.cost ?? 0), 0); }
    isForced(id) { return !!this.forced?.has(id); }
    // 슬롯 모드: 영웅 id 를 (x,y)에 둘 수 없는 사유(서버 not_a_slot / slot_hero_mismatch / slot_unit_type_mismatch 와 같은 조건). 둘 수 있거나 레거시면 null
    heroSlotError(id, x, y) {
        if (!this.slotMode) return null;
        const fx = this.fixedSlotOf.get(Number(id));
        if (fx) return fx.x === x && fx.y === y ? null : '고정 영웅은 정해진 자리에서 옮길 수 없습니다.';
        const s = this.slotAt.get(`${x},${y}`);
        if (!s) return '영웅은 표시된 출전 자리(슬롯)에만 둘 수 있습니다.';
        if (s.kind === 'fixed') return '고정 영웅 전용 자리입니다.';
        const ut = this.byId.get(id)?.unit_type;
        const allow = Array.isArray(s.unit_types) ? s.unit_types : [];
        if (allow.length && !allow.includes(ut) && !allow.includes(typeAlias(ut))) return `이 자리는 ${allow.map((t) => unitClassName(t)).join('·')} 병종만 설 수 있습니다.`;
        return null;
    }
    // 슬롯 모드: 영웅 id 가 설 수 있는 첫 빈 슬롯(taken = 이미 쓴 칸 "x,y" 집합, 쓰면 추가). 없으면 null
    takeSlotCell(id, taken) {
        const s = (this.info.slots ?? []).find((sl) => !taken.has(`${sl.x},${sl.y}`) && !this.heroSlotError(id, sl.x, sl.y));
        if (!s) return null;
        taken.add(`${s.x},${s.y}`);
        return { x: s.x, y: s.y };
    }
    isFreeSlot(id) { return this.forced?.get(id)?.free_slot !== false && this.isForced(id); }
    slotUsed() { return this.placements.filter((p) => !this.isFreeSlot(p.user_hero_id)).length; } // 슬롯 상한 판정용(필수 출전 free_slot 제외)
    // 수군 대여 등 필수 출전 병종 라벨: 대여 병종이 수병이면 '수군 대여', 그 외 '대여 <병종>'
    forcedLabel(id) {
        const f = this.forced?.get(id);
        if (!f) return '';
        if (String(f.hero ?? this.byId.get(id)?.hero ?? '').startsWith('protagonist_')) return '주인공'; // 캠페인 주인공 필수 출전(사망 = 패배)
        const naval = f.unit_type === 'naval' || f.troop_type === 'naval';
        return naval ? `수군 대여${f.troop_label ? `(${f.troop_label})` : ''}` : (f.unit_type || f.troop_type ? `대여 ${f.troop_label ?? unitClassName(f.unit_type ?? f.troop_type)}` : '');
    }
    // 잠금 아이콘(도형: 고리 + 몸통). x,y = 몸통 중심
    lockIcon(x, y, size = 12, color = COLOR.accent) {
        const g = this.add.graphics();
        const w = size; const h = size * 0.72;
        g.lineStyle(Math.max(1.5, size / 7), color, 1).beginPath().arc(x, y - h / 2, w * 0.3, Math.PI, 0, false).strokePath();
        g.fillStyle(color, 1).fillRect(x - w / 2, y - h / 2, w, h);
        g.fillStyle(COLOR.ink, 1).fillRect(x - 1, y - h * 0.15, 2, h * 0.4);
        return g;
    }

    // 출전 코스트(서버가 단일 출처). 배치가 저장된 편성(default_party, 같은 순서)과 같고 부대를 바꾸지 않았으면 서버 default_party_cost 를 그대로 쓰고,
    // 아니면 영웅 합 + 부대 합(formation 서버 구성 기준, 빈 부대는 서버 프리셋 폴백이므로 formation 값)으로 추정한다.
    // 추정치는 진영 유닛 상한 감축(max_units_per_side) 때문에 서버보다 클 수 있다 -> 추정 초과는 안내만, 확정 차단은 서버 값/영웅 합 초과만.
    costInfo() {
        const info = this.info;
        const hero = this.costOf();
        const sc = info.default_party_cost;
        const same = (info.default_party ?? []).join(',') === this.placements.map((p) => p.user_hero_id).join(',');
        if (sc && typeof sc === 'object' && sc.total != null && same && !this.troopsDirty) return { hero: sc.hero ?? hero, troop: sc.troop ?? 0, total: sc.total, exact: true };
        const troop = this.troopCost();
        return { hero, troop, total: hero + troop, exact: !this.squad };
    }

    render() {
        const info = this.info; const tw = this.tw;
        this.markC.list.filter((o) => o.isAlly).forEach((o) => o.destroy());
        this.hideTip();
        this.autoLayout();
        const addA = (objs) => { objs.forEach((o) => { o.isAlly = true; }); this.markC.add(objs); };
        // 집어 든 유닛(영웅/병사)의 이동 가능 칸: 초록 하이라이트(병사는 소속 영웅 반경·통행 지형까지 반영)
        if (this.pick) info.deploy_zone.forEach(([x, y]) => {
            if (!this.canDrop(this.pick, x, y)) return;
            addA([this.add.rectangle(x * tw + 2, y * tw + 2, tw - 4, tw - 4, 0x6bd67a, 0.35).setOrigin(0).setStrokeStyle(2, 0x6bd67a, 1)]);
        });
        // 병사(부대): 병종 공용 시트(아군 청 방향, 정면 idle), 영웅보다 작게. 영웅 색 밴드 받침 + 연결선. 자동 배치 예정(서버가 최종 배치)은 흐리게
        if (this.squad) this.placements.forEach((pl, i) => {
            const band = BAND[i % BAND.length];
            (this.troops.get(pl.user_hero_id) ?? []).forEach((t, idx) => {
                const manual = t.x != null;
                const pos = manual ? t : this.autoPos.get(`${pl.user_hero_id}:${idx}`);
                if (!pos) return;
                const ref = { kind: 'troop', uhid: pl.user_hero_id, idx };
                const picked = this.isPicked(ref);
                const unit = { kind: 'troop', type: t.class, team: 'ally' };
                const ln = this.add.line(0, 0, pl.x * tw + tw / 2, pl.y * tw + tw / 2, pos.x * tw + tw / 2, pos.y * tw + tw / 2, band, manual ? 0.6 : 0.3).setOrigin(0).setLineWidth(manual ? 2 : 1);
                const icon = this.unitIcon(unit, pos.x, pos.y, { size: 0.74, base: band, ring: picked ? 0x6bd67a : band, alpha: manual ? 1 : 0.55 });
                const nm = `${unitClassName(t.class)} ·${heroLabel(this.byId.get(pl.user_hero_id) ?? {}, { compact: true })} 부대${manual ? '' : ' (자동 배치 예정)'}`;
                addA([ln, ...icon, this.unitHit(ref, pos.x, pos.y, nm, { unit, size: 0.74, base: band })]);
            });
        });
        // 영웅: 전용 시트 -> 병종 공용 시트 폴백. 등급색 받침(1번 지휘관 금색 링·왕관 칩은 2026-11-04 사용자 요청으로 제거)
        this.placements.forEach((pl, i) => {
            const c = this.byId.get(pl.user_hero_id) ?? {};
            const ref = { kind: 'hero', uhid: pl.user_hero_id };
            const unit = { kind: i === 0 ? 'commander' : 'hero', hero: c.hero, type: c.unit_type, team: 'ally' };
            const base = rarityColor(c.rarity) ?? COLOR.ally;
            const icon = this.unitIcon(unit, pl.x, pl.y, { size: 0.92, base, ring: this.isPicked(ref) ? 0x6bd67a : base, crown: false }); // 1번(지휘관) 왕관·금테 제거(사용자 2026-11-04 역할 마크 삭제)
            addA([...icon, this.unitHit(ref, pl.x, pl.y, `${heroLabel(c, { compact: true })}`, { unit, size: 0.92, base })]);
        });
        if (this.pick) { const pp = this.posOf(this.pick); if (pp) this.showTip(this.nameOf?.get(this.refKey(this.pick)) ?? '', pp.x, pp.y); }
        this.markC.bringToTop(this.tipT);
        // 후보 목록
        this.list.content.removeAll(true);
        const iw = this.list.w; const rowH = this.squad ? 104 : 64;
        info.candidates.forEach((c, i) => {
            const placed = this.placements.find((p) => p.user_hero_id === c.user_hero_id);
            const sel = this.selected === c.user_hero_id;
            const row = this.add.container(0, i * (rowH + 6));
            row.add(this.add.rectangle(0, 0, iw, rowH, COLOR.navyDeep, 0.8).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.4));
            const rs = slice(this, `${raritySlotKey(c.rarity)}`, 6, rowH, 'slot'); // 등급 색 띠(왼쪽 얇게)
            row.add(rs);
            row.clipH = rowH;
            // 등급 브래킷(9-slice)은 모서리 폭 때문에 지정 폭(6)보다 넓게 그려진다 -> 실제 폭만큼 글자를 오른쪽으로(I-12)
            const tx = Math.max(12, Math.ceil(Math.max(rs.width ?? 6, (rs.leftWidth ?? 0) + (rs.rightWidth ?? 0)) * Math.abs(rs.scaleX ?? 1)) + 6);
            if (sel) row.add(this.add.rectangle(3, 3, iw - 6, rowH - 6, COLOR.accentLight, 0.22).setOrigin(0));
            if (placed) row.add(this.add.rectangle(3, 3, iw - 6, rowH - 6, COLOR.ally, 0.18).setOrigin(0));
            const ry = this.squad ? 62 : rowH; // 위 세 줄(이름·칭호·정보) 기준 높이
            // U25: 이름 중심(칭호 생략형, 말줄임 없이) + 칭호는 둘째 줄 부제 + 셋째 줄 등급·레벨·병종. 좌표(배치됨 (x,y))는 숨김
            const lineY = c.title ? [14, 32, 50] : [16, 38, 38];
            row.add(fitText(makeText(this, tx, lineY[0], heroLabel(c, { compact: true }), { size: 15, bold: true, origin: [0, 0.5] }), Math.max(60, iw - 40 - 72 - 8 - tx)));
            if (c.title) row.add(fitText(makeText(this, tx, lineY[1], c.title, { size: 12, color: '#d9c48a', origin: [0, 0.5] }), Math.max(60, iw - 12 - tx)));
            const forced = this.isForced(c.user_hero_id);
            const fl = forced ? this.forcedLabel(c.user_hero_id) : '';
            // 오른쪽 상태 글자(필수 출전 · 슬롯 면제 등)를 먼저 만들어 실제 폭만큼 왼쪽 정보 줄 폭을 줄인다(겹침 방지)
            const stT = makeText(this, iw - 12, lineY[2], forced ? `필수 출전${this.isFreeSlot(c.user_hero_id) ? ' · 슬롯 면제' : ''}` : placed ? '배치됨' : sel ? '칸을 선택하세요' : '', { size: 12, color: forced ? CSS.accent : placed ? CSS.allyText : CSS.accent, origin: [1, 0.5] });
            row.add(fitText(makeText(this, tx, lineY[2], `${rarityBadge(c.rarity)} · Lv.${c.level}${c.unit_type ? ` · ${unitClassName(c.unit_type)}` : ''}${!this.squad && c.troop_label ? ` · 병사 ${c.troop_label}` : ''}${fl ? ` · ${fl}` : ''}`, { size: 12, color: fl ? '#9fd8c8' : CSS.muted, origin: [0, 0.5] }), Math.max(60, iw - 12 - Math.max(100, stT.width) - 8 - tx)));
            const costT = makeText(this, iw - 40, lineY[0], `코스트 ${c.cost}`, { size: forced ? 12 : 14, color: CSS.accent, origin: [1, 0.5] });
            row.add(costT);
            if (forced) row.add(this.lockIcon(iw - 40 - costT.width - 10, lineY[0], 11)); // 필수 출전 잠금
            row.add(stT);
            const hit = this.add.rectangle(0, 0, iw, rowH, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
            hit.on('pointerup', (p) => {
                if (this.modalCount > 0 || p.getDistance() > 12) return;
                if (placed && forced) { showToast(this, '필수 출전 영웅은 해제할 수 없습니다. 맵에서 위치만 옮길 수 있습니다.'); return; }
                if (placed) { this.placements = this.placements.filter((x) => x.user_hero_id !== c.user_hero_id); this.selected = null; this.pick = null; this.clearTroopPos(c.user_hero_id); }
                else this.selected = sel ? null : c.user_hero_id;
                this.render();
            });
            row.add(hit);
            if (this.squad) this.troopRow(row, c, iw, ry, tx); // 부대 줄(고정 병종 표시만)
            // 영웅 상세(i): 배치 응답에 있는 정보 + 오라(서버가 주면)
            const ib = this.add.rectangle(iw - 30, lineY[0] - 10, 20, 20, COLOR.navyDeep, 1).setOrigin(0).setStrokeStyle(1, COLOR.accentLight, 0.8).setInteractive({ useHandCursor: true });
            ib.on('pointerup', (p) => { if (this.modalCount > 0 || p.getDistance() > 12) return; p.event?.stopPropagation?.(); this.heroInfo(c); });
            row.add([ib, makeText(this, iw - 20, lineY[0], 'i', { size: 13, bold: true, color: CSS.accent, origin: [0.5, 0.5] })]);
            row.hits = [hit, ib]; // clipList: 목록 영역 밖으로 숨긴 행은 입력도 끔
            this.list.content.add(row);
        });
        this.list.setContentHeight(info.candidates.length * (rowH + 6));
        this.list.refreshMask();
        const ci = this.costInfo();
        const cost = ci.total;
        this.meter.setValue(Math.min(cost, info.max_cost), false);
        const units = this.placements.length + (this.squad ? this.placements.reduce((s, p) => s + (this.troops.get(p.user_hero_id)?.length ?? 0), 0) : 0);
        const fp = this.placements.filter((p) => this.isForced(p.user_hero_id)).length;
        // 방 대전: 맵 크기별 고정 출전 수(서버 required_party = min(party_size, 보유 영웅)). 필드 없으면(구 응답·스테이지) 기존 슬롯 상한 표기
        const req = this.mode === 'room' && Number(info.required_party) > 0 ? Number(info.required_party) : 0;
        // 슬롯 모드: '선택 자리 n/free + 고정 k'. 코스트 상한은 서버 max_cost(고정·필수 출전 영웅 코스트 포함 기준), 스테이지 지정 상한이면 '(스테이지)'.
        // 적 병력: 서버 미리보기(enemy_preview/preview_enemy_counts {initial, reinforce})가 있으면 그 값, 없으면 배치 응답 enemy_units 수
        const sc = info.slot_counts;
        const heroPart = req ? `출전 ${this.slotUsed()}/${req}명 필수` : this.slotMode ? `선택 자리 ${this.slotUsed()}/${sc?.free ?? info.max_party_slots}${sc?.fixed ? ` + 고정 ${sc.fixed}` : ''}` : `영웅 ${this.slotUsed()}/${info.max_party_slots}`;
        // 적 수(+증원)는 맵 위 적 미리보기 칩 첫 칸으로 옮김(build). 여기는 내 편성 수치만
        const costPart = `코스트 ${cost}/${info.max_cost}${ci.exact ? '' : '(예상)'}`;
        const unitPart = this.squad ? `유닛 ${units}${info.max_units_per_side ? `/${info.max_units_per_side}` : ''}` : '';
        const fpPart = fp && !this.slotMode ? `필수 ${fp}명 포함` : '';
        const capSrc = info.cost_cap_source === 'stage' ? '코스트 상한: 스테이지 지정' : '';
        if (this.slot2T) {
            this.slotT.setText(`${heroPart} · ${costPart}`);
            this.slot2T.setText([unitPart, fpPart, capSrc].filter(Boolean).join(' · '));
            fitText(this.slot2T, this.slotIw ?? 300);
        } else this.slotT.setText([`${heroPart}${fpPart ? ` (${fpPart})` : ''}`, `${costPart}${info.cost_cap_source === 'stage' ? '(스테이지)' : ''}`].join(' · '));
        fitText(this.slotT, this.slotIw ?? 300);
        let why = '';
        const fcT = Number(info.forced_cost?.total) || 0; // 서버 forced_cost{hero,troop,total}: 고정·필수 출전 영웅 코스트(상한 합산에 포함)
        const fcNote = fcT > 0 ? ` (고정·필수 영웅 ${fcT} 포함)` : '';
        if (!this.placements.length && !req) why = '지휘관을 포함해 최소 1명을 배치하세요.';
        else if (this.slotUsed() > info.max_party_slots) why = `슬롯 상한(${info.max_party_slots})을 초과했습니다.`;
        else if (req && this.slotUsed() !== req) why = `이 맵은 ${req}명을 출전시켜야 합니다. (${this.slotUsed()}/${req})`;
        else if ([...(this.forced?.keys() ?? [])].some((id) => !this.placements.some((p) => p.user_hero_id === id))) why = `필수 출전 영웅(${[...this.forced.keys()].filter((id) => !this.placements.some((p) => p.user_hero_id === id)).map((id) => heroLabel(this.byId.get(id) ?? {}, { compact: true })).join(', ')})을 배치하세요.`;
        else if (ci.hero > info.max_cost) why = `영웅 코스트 ${ci.hero}만으로 상한 ${info.max_cost}을 초과했습니다.${fcNote}`;
        else if (ci.exact && cost > info.max_cost) why = `출전 코스트 ${cost}(영웅 ${ci.hero} + 부대 ${ci.troop})가 상한 ${info.max_cost}을 초과했습니다.${fcNote}`;
        if (this.info.confirmed) why = '이미 확정했습니다. 상대를 기다리는 중입니다.';
        // 진영 유닛 상한 초과는 막지 않고 안내만(서버가 부대 많은 영웅부터 1기씩 균등 감축). 예상 코스트 초과도 안내만(최종 판정은 서버)
        const costNote = !why && !ci.exact && cost > info.max_cost ? `예상 출전 코스트 ${cost}(영웅 ${ci.hero} + 부대 ${ci.troop})가 상한 ${info.max_cost}을 넘을 수 있습니다. 부대를 줄이세요(최종 판정은 서버).` : '';
        const capNote = costNote || (!why && this.squad && info.max_units_per_side && units > info.max_units_per_side ? `유닛 상한 ${info.max_units_per_side} 초과분은 서버가 균등 감축합니다.` : '');
        if (this.submitting) { this.reasonT.setText(this.submitting); this.confirmBtn.setDisabled(true); this.confirmBtn.reason = this.submitting; this.syncHint(); return; } // 제출 중: 다른 갱신(render)이 버튼을 다시 켜지 않게
        this.reasonT.setText(why ? '! ' + why : capNote);
        this.confirmBtn.setDisabled(!!why);
        this.confirmBtn.reason = why;
        this.syncHint();
    }

    syncHint() {
        if (!this.hintT?.scene) return;
        // 줌 모드에서 칸이 작으면(전체 보기 등) 먼저 확대하도록 안내(이 상태의 맵 탭 = 그 지점 확대)
        const zoomFirst = this.zoomable && !this.touchOk();
        this.hintT.setText(zoomFirst ? '맵을 눌러 확대한 뒤 칸을 선택하세요. 두 손가락으로 확대·축소, 끌어서 이동합니다.'
            : this.selected ? `${heroLabel(this.byId.get(this.selected), { compact: true })} 을(를) 놓을 청색 칸을 선택하세요 (Esc 취소)`
                : this.pick ? (this.pick.kind === 'troop' ? '초록 칸을 눌러 병사를 옮기세요. 같은 병사를 다시 누르면 자동 배치로 (Esc 취소)' : '초록 칸을 눌러 영웅을 옮기세요. 병사가 함께 따라갑니다 (Esc 취소)')
                    : `영웅을 고른 뒤 청색 칸을 누르세요. 맵의 ${this.squad ? '영웅·병사' : '영웅'}를 끌거나 눌러 옮깁니다. 해제는 목록에서.`);
        fitText(this.hintT, this.hintW ?? 300, { maxLines: 2 }); // 2줄까지 줄바꿈(높이는 build 에서 예약)
    }

    // ================= 큰 맵 줌/팬(모바일 배치) =================
    // 좌표: 논리(설계 단위) 화면 좌표 -> camC 로컬(배율 1 의 칸 px, 칸 = tw). 시야(this.view) = 맵 영역, 밖은 마스크로 자름
    wpt(p) { return { x: p.x / L.u, y: p.y / L.u }; } // 포인터 화면 좌표 -> 논리 좌표(메인 카메라 = zoom L.u, 원점 좌상단)
    toLocal(p) { const z = this.camZ || 1; return { x: (p.worldX - this.camC.x) / z, y: (p.worldY - this.camC.y) / z }; }
    inView(p) { const v = this.view; const x = p.worldX ?? p.x; const y = p.worldY ?? p.y; return !!v && x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h; }
    touchOk() { return !this.zoomable || this.cssPerTile * this.camZ >= TOUCH_PX - 0.5; }
    isMapObj(o) { while (o) { if (o === this.camC) return true; o = o.parentContainer; } return false; }

    // 맵 칸·유닛 탭 차단(줌 모드만): 시야 밖 / 핀치·확대 직후 / 칸이 작을 때(이때 탭은 camGestureUp 이 '확대'로 처리)
    blockTap(p) {
        if (!this.zoomable) return false;
        return !this.inView(p) || !!this.pinch || this.time.now < this.tapBlockUntil || !this.touchOk();
    }

    setupZoomView() {
        const v = this.view;
        this.clipMapView(v);
        // 초기 시야: 터치 배율로 배치 구역 가운데
        this.fitZone();
    }

    // 맵 시야 밖 자르기(줌 모드 + 일반 모드 공통). 일반 모드도 맨 윗줄 키 큰 소품(건물 지붕 등)이 맵 영역 위 안내 문구를 가리지 않게(강화면 gacha127 ch12_s2)
    clipMapView(v) {
        this.camC.setDepth(-10); // 헤더·편성 패널·도구 버튼이 맵(마스크 밖 히트 포함)보다 위에서 그려지고 입력을 받게(배경 -1000 보다는 위). WebGL 아니어도 문구가 위
        // Phaser 4 Mask 필터(ScrollList.enableClip 과 같은 방식): 시야 사각형(월드 좌표 고정) 밖을 자른다. WebGL 이 아니면 생략(입력은 inView 로 막음)
        if (this.renderer?.gl && typeof this.camC.enableFilters === 'function') {
            const r = new Phaser.GameObjects.Rectangle(this, v.x, v.y, v.w, v.h, 0xffffff, 1).setOrigin(0);
            this.camC.enableFilters();
            this.camC.filters.external.addMask(r, false, this.cameras.main, 'world');
            this.events.once('shutdown', () => r.destroy());
        }
    }

    // 배율·위치 적용(경계 클램프: 맵이 시야보다 작은 축은 가운데, 큰 축은 맵 밖이 보이지 않게)
    applyCam(z, x, y) {
        const v = this.view; const info = this.info;
        const wasOk = this.touchOk();
        this.camZ = Phaser.Math.Clamp(z, this.zMin, this.zMax);
        const W = this.tw * info.width * this.camZ; const H = this.tw * info.height * this.camZ;
        const cx = W <= v.w ? v.x + (v.w - W) / 2 : Phaser.Math.Clamp(x, v.x + v.w - W, v.x);
        const cy = H <= v.h ? v.y + (v.h - H) / 2 : Phaser.Math.Clamp(y, v.y + v.h - H, v.y);
        this.camC.setScale(this.camZ).setPosition(cx, cy);
        this.syncSlotTags();
        if (this.tipT?.visible) this.hideTip();
        if (this.minimap) { this.minimap.key = ''; this.minimap.redraw(); }
        if (wasOk !== this.touchOk()) this.syncHint();
    }

    // 슬롯 라벨 크기 보정(줌 모드만): 시야 배율의 역수로 화면 글자 크기를 배율 1 과 같게 + 칸 폭의 45% 이내로 제한, 칸 왼쪽 위 모서리에 붙이고 약간 투명하게(유닛을 덜 가리게).
    // 일반 모드(데스크톱 등, camZ 항상 1)는 손대지 않아 기존 모습 그대로(강화면 결함 A: 667x375/390x844 에서 '고정'이 확대 배율대로 커져 유닛을 덮음)
    syncSlotTags() {
        if (!this.zoomable || !this.slotTags?.length) return;
        const z = this.camZ || 1; const tw = this.tw;
        for (const { t, x, y } of this.slotTags) {
            if (!t?.scene) continue;
            const s = Math.min(1 / z, (tw * 0.45) / Math.max(1, t.width));
            t.setScale(s).setAlpha(0.85).setPosition(x + 2 / z, y + 1 / z);
        }
    }

    // 화면 점 (px,py) 아래 지점을 고정한 채 배율 z 로
    zoomAt(z, px, py) {
        if (this.fullView) { this.fullView = null; this.fullBtn?.setSelected(false); } // 수동 줌: 전체 보기 토글 해제(전투와 같은 규칙)
        const z0 = this.camZ; const nz = Phaser.Math.Clamp(z, this.zMin, this.zMax);
        const lx = (px - this.camC.x) / z0; const ly = (py - this.camC.y) / z0;
        this.applyCam(nz, px - lx * nz, py - ly * nz);
    }

    // 타일 (tx,ty)(소수 허용)를 시야 가운데로(현재 배율 또는 z)
    focusTile(tx, ty, z = this.camZ) {
        const v = this.view; const s = this.tw * z;
        this.applyCam(z, v.x + v.w / 2 - (tx + 0.5) * s, v.y + v.h / 2 - (ty + 0.5) * s);
    }

    // '배치 구역 맞춤': 터치 배율(칸 40px)로 배치 구역(경계 상자) 가운데
    fitZone() {
        const dz = this.info.deploy_zone ?? [];
        const xs = dz.map((c) => c[0]); const ys = dz.map((c) => c[1]);
        const tx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : (this.info.width - 1) / 2;
        const ty = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : (this.info.height - 1) / 2;
        if (this.fullView) { this.fullView = null; this.fullBtn?.setSelected(false); }
        this.focusTile(tx, ty, this.zTouch);
    }

    // 전체 보기 토글(전투와 같은 규칙): 켜면 배율 1(맵 전체 맞춤), 끄면 이전 배율·중심으로
    toggleFullView() {
        if (this.modalCount > 0) return;
        if (this.fullView) {
            const prev = this.fullView; this.fullView = null;
            this.focusTile(prev.tx, prev.ty, prev.z);
        } else {
            if (Math.abs(this.camZ - this.zMin) < 0.01) { showToast(this, '이미 맵 전체를 보고 있습니다'); return; }
            const v = this.view; const s = this.tw * this.camZ;
            this.fullView = { z: this.camZ, tx: (v.x + v.w / 2 - this.camC.x) / s - 0.5, ty: (v.y + v.h / 2 - this.camC.y) / s - 0.5 };
            this.applyCam(this.zMin, 0, 0);
        }
        this.fullBtn?.setSelected(!!this.fullView);
    }

    camGestureDown(p, over) {
        if (this.modalCount > 0 || !this.inView(p)) return;
        const top = over?.[0];
        if (top && !this.isMapObj(top)) return; // 버튼·미니맵 등 UI 위
        this.fieldPtr.add(p.id);
        if (this.drag) return; // 유닛 끌기 시작(칸이 충분히 클 때만 unitHit 이 설정)
        this.panS = { id: p.id, sx: p.worldX, sy: p.worldY, cx: this.camC.x, cy: this.camC.y, moved: false };
    }

    // 반환 true = 카메라 제스처가 이 이동을 소비(유닛 끌기 처리 생략)
    camGestureMove(p) {
        if (this.modalCount > 0) return false;
        const p1 = this.input.pointer1; const p2 = this.input.pointer2;
        if (p1?.isDown && p2?.isDown && this.fieldPtr.has(p1.id) && this.fieldPtr.has(p2.id)) {
            const a = this.wpt(p1); const b = this.wpt(p2);
            const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
            if (!this.pinch) {
                // 핀치 시작: 진행 중이던 유닛 끌기·팬 취소
                if (this.drag?.ghost) { this.drag.ghost.destroy(); this.pick = null; this.render(); }
                this.drag = null; this.panS = null;
                this.pinch = { d0: d, z0: this.camZ, lx: (mx - this.camC.x) / this.camZ, ly: (my - this.camC.y) / this.camZ };
                if (this.fullView) { this.fullView = null; this.fullBtn?.setSelected(false); }
            }
            const pc = this.pinch;
            const z = Phaser.Math.Clamp(pc.z0 * (d / pc.d0), this.zMin, this.zMax);
            this.applyCam(z, mx - pc.lx * z, my - pc.ly * z); // 두 손가락 가운데 아래 지점 고정(가운데가 움직이면 함께 팬)
            this.tapBlockUntil = this.time.now + 300;
            return true;
        }
        const s = this.panS;
        if (s && p.id === s.id && p.isDown) {
            const dx = p.worldX - s.sx; const dy = p.worldY - s.sy;
            if (!s.moved && Math.hypot(dx, dy) > 10) s.moved = true;
            if (s.moved) this.applyCam(this.camZ, s.cx + dx, s.cy + dy);
            return true;
        }
        return false;
    }

    camGestureUp(p) {
        this.fieldPtr.delete(p.id);
        if (this.pinch && !(this.input.pointer1?.isDown && this.input.pointer2?.isDown)) { this.pinch = null; this.panS = null; this.tapBlockUntil = this.time.now + 300; return; }
        const s = this.panS;
        if (!s || p.id !== s.id) return;
        this.panS = null;
        // 칸이 작을 때의 탭(더블탭 첫 탭 포함) = 그 지점을 터치 배율로 확대. 직후 350ms 탭은 무시(더블탭 둘째 탭이 배치로 이어지지 않게)
        if (!s.moved && this.modalCount <= 0 && this.time.now >= this.tapBlockUntil && !this.touchOk() && this.inView(p)) {
            this.zoomAt(this.zTouch, p.worldX, p.worldY);
            this.tapBlockUntil = this.time.now + 350;
        }
    }

    // 시야 오른쪽 아래 아이콘 도구 줄(전투와 같은 아이콘·툴팁: 전체 보기 토글 / 배치 구역 맞춤) + 오른쪽 위 미니맵
    buildZoomTools() {
        const v = this.view; const S = 44; const gap = 8;
        const defs = [
            { key: 'full', icon: 'fullview', fb: '전체', tip: () => (this.fullView ? '이전 배율' : '전체 보기'), onClick: () => this.toggleFullView() },
            { key: 'fit', icon: 'fit', fb: '맞춤', tip: () => '배치 구역 맞춤', onClick: () => this.fitZone() },
        ];
        const W = defs.length * S + (defs.length - 1) * gap;
        const x0 = v.x + v.w - 6 - W; const y = v.y + v.h - 6 - S;
        this.add.rectangle(x0 - 4, y - 4, W + 8, S + 8, COLOR.navyDeep, 0.8).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.6).setInteractive(); // 입력 소비(아래 맵 탭 방지)
        defs.forEach((d, i) => {
            const b = new Button(this, { x: x0 + i * (S + gap), y, w: S, h: S, label: '', icon: d.icon, size: 13, onClick: () => { d.onClick(); this.flashToolTip(b, d.tip()); } });
            b.arrow.setAlpha(0); // 호버 화살표는 아이콘을 덮으므로 숨김
            if (b.icon) b.icon.setPosition(0, -1).setDisplaySize(26, 26);
            else if (d.fb) b.setLabel(d.fb); // 아이콘 아틀라스 없음: 짧은 글자 폴백
            if (d.key === 'full') this.fullBtn = b;
            b.hit.on('pointerover', (p) => { if (!p.wasTouch) this.showToolTip(b, d.tip()); });
            b.hit.on('pointerout', () => this.hideToolTip());
            b.hit.on('pointerdown', (p) => { if (p.wasTouch) { this.toolHold?.remove(); this.toolHold = this.time.delayedCall(450, () => this.showToolTip(b, d.tip())); } });
            b.hit.on('pointerup', () => { this.toolHold?.remove(); this.toolHold = null; });
        });
        // 미니맵(ui/MiniMap 재사용, 어댑터로 배치 데이터·시야 전달): 지형 + 배치 구역 + 아군/적 점 + 현재 시야. 탭/끌기 = 그 칸으로 이동
        const tw = this.tw; const info = this.info;
        const src = {
            map: () => ({ w: info.width, h: info.height, tiles: info.tiles }),
            zone: () => info.deploy_zone ?? [],
            units: () => {
                const out = (info.enemy_units ?? []).map((u, i) => ({ id: `e${i}`, x: u.x, y: u.y, team: 'enemy', kind: u.kind === 'troop' ? 'troop' : 'hero' }));
                (this.placements ?? []).forEach((pl) => {
                    out.push({ id: `h${pl.user_hero_id}`, x: pl.x, y: pl.y, team: 'ally', kind: 'hero' });
                    if (this.squad) (this.troops?.get(pl.user_hero_id) ?? []).forEach((t, idx) => { const q = t.x != null ? t : this.autoPos?.get(`${pl.user_hero_id}:${idx}`); if (q) out.push({ id: `t${pl.user_hero_id}:${idx}`, x: q.x, y: q.y, team: 'ally', kind: 'troop' }); });
                });
                return out;
            },
            points: () => [],
            built: () => !!this.camC?.scene,
            blocked: () => this.modalCount > 0,
            pt: (p) => this.wpt(p),
            view: () => { const s = tw * this.camZ; return { x: (v.x - this.camC.x) / s, y: (v.y - this.camC.y) / s, w: v.w / s, h: v.h / s }; },
            focus: (tx, ty) => this.focusTile(tx, ty),
        };
        this.minimap = new MiniMap(this, { right: v.x + v.w - 4, top: v.y + 4, maxW: Math.min(120, v.w * 0.3), maxH: Math.min(84, (v.h - S - 24) * 0.5), src });
        this.events.once('shutdown', () => { this.minimap?.destroy(); this.minimap = null; this.hideToolTip(); });
    }

    // 도구 버튼 툴팁(전투 Battle.showTip 과 같은 모양: 호버 = 표시 / 터치 = 길게 누르기 또는 탭 직후 1.2초)
    showToolTip(btn, text) {
        if (!btn?.scene || !text) return;
        this.hideToolTip();
        const pad = 8;
        const t = makeText(this, pad, pad - 2, text, { size: 14, bold: true, color: CSS.text });
        const w = t.width + pad * 2; const h = t.height + pad * 2 - 4;
        const g = this.add.graphics().fillStyle(COLOR.navyDeep, 0.96).fillRoundedRect(0, 0, w, h, 6).lineStyle(1, COLOR.accent, 0.9).strokeRoundedRect(0, 0, w, h, 6);
        const x = Phaser.Math.Clamp(btn.x + btn.w / 2 - w / 2, L.safe.l + 4, L.lw - L.safe.r - 4 - w);
        this.toolTipBox = this.add.container(x, Phaser.Math.Clamp(btn.y - h - 6, 4, L.lh - h - 4), [g, t]).setDepth(960);
    }
    hideToolTip() { this.toolTipTimer?.remove(); this.toolTipTimer = null; this.toolTipBox?.destroy(); this.toolTipBox = null; }
    flashToolTip(btn, text) {
        if (!this.input.activePointer?.wasTouch) { if (this.toolTipBox) this.showToolTip(btn, text); return; }
        this.showToolTip(btn, text);
        this.toolTipTimer = this.time.delayedCall(1200, () => this.hideToolTip());
    }

    // 배치 화면 제목(U25): 서버 stage_name > 진입 시 받은 이름. 'stage1' 같은 영문 id 형태면 '스테이지 N', 없으면 '스테이지'
    stageTitle() {
        const ids = [this.info?.stage_name, this.stageName].map((v) => String(v ?? '').trim()).filter(Boolean);
        const idLike = (v) => /^stage[\s_-]*\d+$/i.test(v);
        const nice = ids.find((v) => !idLike(v));
        if (nice) return nice;
        const n = ids.map((v) => /(\d+)$/.exec(v)?.[1]).find(Boolean);
        return n ? `스테이지 ${Number(n)}` : '스테이지';
    }

    // 자동 편성: 레벨 높은 순으로 코스트·슬롯 안에서 고르고 배치 영역 앞쪽(적에 가까운 순) 칸에 놓는다. 1번 = 지휘관
    autoParty(ids = null) {
        const info = this.info;
        const order = ids ?? [...info.candidates].sort((a, b) => (b.level - a.level) || (b.cost - a.cost)).map((c) => c.user_hero_id);
        const picked = [...(this.forced?.keys() ?? [])]; // 필수 출전: 항상 포함(맨 앞 = 지휘관), 슬롯 면제(코스트는 합산)
        // 출전 코스트 = 영웅 코스트 + 그 영웅 부대 코스트(costInfo/troopCost 와 같은 계산). 2026-11-03 강화면 16차: 부대 코스트를 빼고 골라 상한 초과(서버 422)
        // 서버 ProgressionService::validateParty(2026-11-08): 필수 출전·고정 영웅도 영웅·부대 코스트 합산(상한도 그만큼 늘어난 값이 max_cost 로 온다)
        const partCost = (id) => (this.byId.get(id)?.cost ?? 0) + this.heroTroopCost(id);
        if (this.mode === 'room') this.autoPickRoom(order, picked); // 방 대전: 필수 인원(required_party) 우선 + 진영 유닛 상한 감축 반영 코스트
        else {
            let cost = picked.reduce((a, id) => a + partCost(id), 0);
            let slots = 0;
            order.forEach((id) => {
                const c = this.byId.get(id);
                if (!c || picked.includes(id) || slots >= info.max_party_slots) return;
                const pc = partCost(id);
                if (cost + pc > info.max_cost) return;
                picked.push(id); cost += pc; slots += 1;
            });
        }
        const en = info.enemy_units ?? [];
        const near = (x, y) => Math.min(...en.map((u) => Math.abs(u.x - x) + Math.abs(u.y - y)), 99);
        const free = [...info.deploy_zone].sort((a, b) => near(a[0], a[1]) - near(b[0], b[1]));
        const taken = new Set();
        // 칸 부족 시 남는 영웅 제외([0,0] 겹침 방지). 슬롯 모드 = 고정 영웅은 자기 슬롯, 나머지는 설 수 있는 첫 빈 선택 슬롯(없으면 제외)
        this.placements = picked.map((id) => { const c = this.slotMode ? this.takeSlotCell(id, taken) : (() => { const z = free.shift(); return z ? { x: z[0], y: z[1] } : null; })(); return c ? { user_hero_id: id, x: c.x, y: c.y } : null; }).filter(Boolean);
        for (const id of this.troops.keys()) this.clearTroopPos(id); // 영웅 위치가 바뀌므로 병사는 자동 배치로
        this.selected = null; this.pick = null;
        this.render();
    }

    // 방 대전 자동 편성(picked 에 필수 출전이 들어 있는 상태로 호출, picked 를 채운다).
    // 1) 레벨 순(order)으로 상한(코스트·인원) 안에서 고른다. 코스트는 서버와 같이 진영 유닛 상한 감축을 반영(partyCostRoom).
    // 2) 그래도 필수 인원(required_party)에 못 미치면 필수 출전만 남기고, 매 단계 합계가 가장 작아지는 영웅을 더해 인원을 채운다.
    //    채운 뒤에도 예상 코스트가 상한을 넘으면 그대로 두고 화면 안내(costNote)만 한다(최종 판정은 서버).
    autoPickRoom(order, picked) {
        const info = this.info;
        const req = Number(info.required_party) > 0 ? Math.min(Number(info.required_party), info.max_party_slots) : 0;
        const limit = req || info.max_party_slots;
        const slots = (ids) => ids.filter((id) => !this.isFreeSlot(id)).length;
        const forced = [...picked];
        order.forEach((id) => {
            if (!this.byId.has(id) || picked.includes(id) || slots(picked) >= limit) return;
            if (this.partyCostRoom([...picked, id]) > info.max_cost) return;
            picked.push(id);
        });
        if (!req || slots(picked) >= req) return;
        picked.length = 0; picked.push(...forced);
        const pool = info.candidates.map((c) => c.user_hero_id).filter((id) => !forced.includes(id));
        while (slots(picked) < req) {
            let best = null; let bestCost = Infinity;
            pool.forEach((id) => {
                if (picked.includes(id)) return;
                const cst = this.partyCostRoom([...picked, id]);
                if (cst < bestCost || (cst === bestCost && (this.byId.get(id)?.level ?? 0) > (this.byId.get(best)?.level ?? 0))) { best = id; bestCost = cst; }
            });
            if (best == null) break;
            picked.push(best);
        }
    }

    // 방 대전 출전 코스트 추정(영웅 + 부대, 필수 출전 포함). 부대는 진영 유닛 상한 감축 반영(cappedTroopCost)
    partyCostRoom(ids) {
        return ids.reduce((a, id) => a + (this.byId.get(id)?.cost ?? 0), 0) + this.cappedTroopCost(ids);
    }

    // 마지막 출격 구성(서버 default_party = parties, 캠페인 배치 확정 시 rememberLastParty 자동 저장) 중 현재 후보에 있는 영웅.
    // 필수 출전(슬롯 면제)은 맨 앞에 항상 포함, 나머지는 슬롯 상한(max_party_slots)까지
    lastPartyIds() {
        const info = this.info;
        const forced = [...(this.forced?.keys() ?? [])];
        const rest = (info.default_party ?? []).filter((id) => this.byId.has(id) && !forced.includes(id));
        const free = forced.filter((id) => this.isFreeSlot(id)).length;
        return [...forced, ...rest].slice(0, info.max_party_slots + free);
    }

    // '마지막 편성' 버튼: 마지막 출격 구성을 다시 고른다(코스트·슬롯 안, 배치 영역 앞쪽 칸). '초기화'는 서버 기본 위치까지 복원
    loadRecent() {
        const forced = new Set(this.forced?.keys() ?? []);
        const ids = this.lastPartyIds();
        if (!ids.some((id) => !forced.has(id))) { showToast(this, '저장된 마지막 편성이 없습니다.'); return; }
        this.autoParty(ids);
    }

    heroInfo(c) {
        const t = unitType(c.unit_type);
        const lines = [`${rarityBadge(c.rarity)} · Lv.${c.level} · 코스트 ${c.cost}`, `병종 ${t.label ?? c.unit_type} · 이동 ${t.move} · 사거리 ${t.range_min === t.range_max ? t.range_min : `${t.range_min}-${t.range_max}`}`];
        // 서버 candidates[].detail{culture, aura, stats} 우선(구 응답의 c.aura/c.culture 폴백)
        const d = c.detail ?? {};
        const aura = d.aura ?? c.aura;
        const st = d.stats;
        if (st) lines.push(`능력치(Lv.1) 공 ${st.atk ?? '?'} · 수 ${st.def ?? '?'}`); // 영웅 체력 고정 10(사용자 2026-11-04): HP 표기 제외
        if (aura) lines.push(`오라: ${auraDesc(aura)}`);
        if (d.culture ?? c.culture) lines.push(`문화권 ${d.culture ?? c.culture}`);
        if (d.troop_label ?? c.troop_label) lines.push(`병사 ${d.troop_label ?? c.troop_label} (고정)`);
        if (Array.isArray(d.skills) && d.skills.length) lines.push('', ...skillLines(d.skills));
        if (!aura && !st) lines.push('능력치·스킬·오라 상세는 서버 제공 후 표시됩니다.');
        if (c.title) lines.unshift(`칭호 「${c.title}」`);
        alertModal(this, heroPlainName(c), lines.join('\n')); // 상세 = 정식 이름 + 칭호 줄
    }

    // ---- 맵 유닛 표시(전투와 같은 스프라이트) ----
    // unit{kind, hero?, type, team} -> 칸(x,y) 중심에 받침 + 스프라이트(없으면 병종 글리프 원/마름모) + 지휘관 왕관 칩. 반환 = 표시 객체 배열(입력 없음)
    // size = 칸 대비 배율(영웅 0.92, 병사 0.74): 칸 안에서만 그려 390px(칸 ~24px)에서도 이웃 칸과 겹치지 않는다
    unitIcon(unit, x, y, { size = 0.92, base = COLOR.ally, ring = null, crown = false, alpha = 1 } = {}) {
        const tw = this.tw; const s = tw * size;
        const cx = x * tw + tw / 2; const cy = y * tw + tw / 2;
        const out = [];
        // 받침(발밑 타원): 영웅 = 등급색, 병사 = 영웅 색 밴드, 적 = 적색. 링 = 지휘관 금색/선택 초록
        out.push(this.add.ellipse(cx, cy + tw * 0.3, s * 0.86, Math.max(4, s * 0.3), base, 0.55 * alpha).setStrokeStyle(Math.max(1.5, tw * 0.06), ring ?? base, alpha));
        let tex = null;
        try { tex = unitTex(this, unit); } catch { tex = null; }
        if (tex) {
            const img = this.add.image(cx, cy - tw * 0.04, tex.key, tex.frame).setDisplaySize(s, s).setFlipX(!!tex.flipX).setAlpha(alpha);
            out.push(img);
            // 영웅·주인공·NPC 전용 시트는 유닛별 지연 로드(assets PER_UNIT_LAZY): 받기 전엔 병종/문화권 공용 시트로 그려 두고 받으면 같은 이미지의 텍스처만 교체
            ensureUnitTex(this, unit, (ok) => { if (!ok || !img.active) return; const t2 = unitTex(this, unit); if (t2 && t2.key !== img.texture.key) img.setTexture(t2.key, t2.frame).setDisplaySize(s, s).setFlipX(!!t2.flipX); });
        } else {
            const col = unit.team === 'enemy' ? COLOR.danger : COLOR.ally;
            const r = s * 0.36;
            out.push(unit.team === 'enemy' ? this.add.rectangle(cx, cy, r * 1.5, r * 1.5, col, alpha).setAngle(45).setStrokeStyle(2, COLOR.text, alpha) : this.add.circle(cx, cy, r, col, alpha).setStrokeStyle(2, COLOR.text, alpha));
            out.push(makeText(this, cx, cy, unitType(unit.type).glyph ?? '?', { size: Math.max(9, s * 0.4), bold: true, color: '#ffffff', origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } }).setAlpha(alpha));
        }
        if (crown) {
            const cr = Math.max(4, tw * 0.13);
            const chipX = x * tw + cr + 1; const chipY = y * tw + cr + 1;
            out.push(this.add.circle(chipX, chipY, cr + 1.5, COLOR.ink ?? 0x0b1020, 0.9).setStrokeStyle(1, COLOR.accent, 1));
            out.push(this.add.star(chipX, chipY, 5, cr * 0.45, cr, COLOR.accent));
        }
        return out;
    }

    // 유닛 칸 입력(투명 히트): 탭 = 집기/내려놓기, 누른 채 끌기 = 드래그 이동, 호버 = 이름 툴팁
    unitHit(ref, x, y, name, dragInfo) {
        const tw = this.tw;
        (this.nameOf ??= new Map()).set(this.refKey(ref), name);
        const hit = this.add.rectangle(x * tw, y * tw, tw, tw, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
        hit.on('pointerover', (p) => { if (!this.drag && (!this.zoomable || this.inView(p))) this.showTip(name, x, y); });
        hit.on('pointerout', () => { if (!this.pick) this.hideTip(); });
        // 줌 모드: 시야 밖(마스크로 가려진 부분)·칸이 작을 때(<32px)는 유닛 끌기 대신 맵 팬/확대
        hit.on('pointerdown', (p) => { if (this.modalCount > 0 || this.selected || this.info.confirmed || (this.zoomable && (!this.inView(p) || !this.touchOk()))) return; this.drag = { ref, ...dragInfo, ghost: null }; });
        hit.on('pointerup', (p) => { if (this.modalCount > 0 || p.getDistance() > 12 || this.blockTap(p)) return; this.tapUnit(ref, x, y); });
        return hit;
    }

    showTip(text, x, y) {
        if (!this.tipT?.scene || !text) return;
        const tw = this.tw;
        const w = this.info.width * tw;
        const s = 1 / (this.camZ || 1); // 줌 모드: 시야 배율을 상쇄해 글자 크기 고정(배율 1 이면 기존과 같다)
        this.tipT.setText(text).setScale(s).setVisible(true);
        const half = this.tipT.width * s / 2;
        this.tipT.setPosition(Math.max(half, Math.min(w - half, x * tw + tw / 2)), Math.max(this.tipT.height * s, y * tw - 2 * s));
        this.markC.bringToTop(this.tipT);
    }

    hideTip() { if (this.tipT?.scene) this.tipT.setVisible(false); }

    refKey(r) { return r ? `${r.kind}:${r.uhid}:${r.idx ?? ''}` : ''; }
    isPicked(r) { return !!this.pick && this.refKey(this.pick) === this.refKey(r); }

    // 현재 표시 위치(병사는 수동 지정 위치, 없으면 자동 배치 예정 위치)
    posOf(r) {
        const pl = this.placements.find((p) => p.user_hero_id === r.uhid);
        if (!pl) return null;
        if (r.kind === 'hero') return pl;
        const t = this.troops.get(r.uhid)?.[r.idx];
        if (!t) return null;
        return t.x != null ? t : this.autoPos?.get(`${r.uhid}:${r.idx}`) ?? null;
    }

    passable(x, y, cls) {
        const code = this.info.tiles[y]?.[x] ?? 'plain';
        return terrainMod(code, unitType(cls).move_type).cost !== null;
    }

    // 칸 점유(배치된 영웅·수동 지정 병사·적). 자동 배치 예정 병사는 장애물이 아니다(옮기면 다시 계산). skip = 검사에서 뺄 참조
    occupied(x, y, skip = null) {
        if (this.placements.some((p) => p.x === x && p.y === y && !(skip?.kind === 'hero' && skip.uhid === p.user_hero_id))) return true;
        if ((this.info.enemy_units ?? []).some((u) => u.x === x && u.y === y)) return true;
        for (const [uhid, list] of this.troops) {
            if (!this.placements.some((p) => p.user_hero_id === uhid)) continue;
            if (list.some((t, i) => t.x === x && t.y === y && !(skip?.kind === 'troop' && skip.uhid === uhid && skip.idx === i))) return true;
        }
        return false;
    }

    clearTroopPos(uhid) { (this.troops?.get(uhid) ?? []).forEach((t) => { delete t.x; delete t.y; }); }

    // 수동 지정하지 않은 병사의 예상 위치(서버 ArmyBuilder::autoPlaceTroops 와 같은 규칙: 영웅과 맨해튼 거리 -> x -> y 순, 빈·통행 가능 칸).
    // 서버 최종 배치와 다를 수 있다(표시용). 영웅 순서대로 채운다
    autoLayout() {
        this.autoPos = new Map();
        if (!this.squad) return;
        const taken = new Set();
        this.placements.forEach((p) => taken.add(`${p.x},${p.y}`));
        (this.info.enemy_units ?? []).forEach((u) => taken.add(`${u.x},${u.y}`));
        this.placements.forEach((p) => (this.troops.get(p.user_hero_id) ?? []).forEach((t) => { if (t.x != null) taken.add(`${t.x},${t.y}`); }));
        // 서버 예상 위치 우선: default_troop_positions[id](순서 = formation[id].troops)가 있고, 영웅이 서버 기본 위치(default_positions)에 있으며
        // 그 부대에 직접 지정 병사가 없으면 서버 값을 쓴다. 칸이 하나라도 겹치거나 구역 밖이면 그 영웅은 자체 계산으로 폴백(방 응답 등 필드 없음도 폴백)
        const dtp = this.info.default_troop_positions ?? {};
        const dp = this.info.default_positions ?? {};
        const served = new Set();
        this.placements.forEach((p) => {
            const id = p.user_hero_id;
            const sp = dtp[id] ?? dtp[String(id)]; const hp = dp[id] ?? dp[String(id)];
            const list = this.troops.get(id) ?? [];
            if (!Array.isArray(sp) || !hp || hp.x !== p.x || hp.y !== p.y || !list.length || list.some((t) => t.x != null) || sp.length < list.length) return;
            const keys = list.map((_, i) => `${sp[i]?.x},${sp[i]?.y}`);
            if (keys.some((k) => taken.has(k) || !this.zone.has(k)) || new Set(keys).size !== keys.length) return;
            keys.forEach((k) => taken.add(k));
            list.forEach((_, i) => this.autoPos.set(`${id}:${i}`, { x: sp[i].x, y: sp[i].y }));
            served.add(id);
        });
        this.placements.forEach((p) => {
            if (served.has(p.user_hero_id)) return;
            const cells = [...this.info.deploy_zone].sort((a, b) => ((Math.abs(a[0] - p.x) + Math.abs(a[1] - p.y)) - (Math.abs(b[0] - p.x) + Math.abs(b[1] - p.y))) || (a[0] - b[0]) || (a[1] - b[1]));
            (this.troops.get(p.user_hero_id) ?? []).forEach((t, idx) => {
                if (t.x != null) return;
                const c = cells.find(([x, y]) => !taken.has(`${x},${y}`) && this.passable(x, y, t.class));
                if (!c) return;
                taken.add(`${c[0]},${c[1]}`);
                this.autoPos.set(`${p.user_hero_id}:${idx}`, { x: c[0], y: c[1] });
            });
        });
    }

    // 이동 가능 여부(서버 검증과 같은 조건: 배치 영역·통행 지형·빈 칸, 병사는 소속 영웅 반경 radius 이내). msg=true 면 사유 문자열 반환
    canDrop(ref, x, y, msg = false) {
        const no = (m) => (msg ? m : false);
        if (!this.zone.has(`${x},${y}`)) return no('배치 영역 밖입니다.');
        const hp = this.placements.find((p) => p.user_hero_id === ref.uhid);
        if (!hp) return no('영웅이 배치되어 있지 않습니다.');
        if (ref.kind === 'troop') {
            const t = this.troops.get(ref.uhid)?.[ref.idx];
            if (!t) return no('병사를 찾을 수 없습니다.');
            if (!this.passable(x, y, t.class)) return no('이 병종이 설 수 없는 지형입니다.');
            if (Math.abs(x - hp.x) + Math.abs(y - hp.y) > this.radius) return no(`소속 영웅에서 ${this.radius}칸 이내만 가능합니다.`);
        } else {
            if (!this.passable(x, y, this.byId.get(ref.uhid)?.unit_type)) return no('이 영웅이 설 수 없는 지형입니다.');
            const se = this.heroSlotError(ref.uhid, x, y); if (se) return no(se); // 슬롯 모드(레거시면 null)
        }
        if (this.occupied(x, y, ref)) return no('이미 점유된 칸입니다.');
        return true;
    }

    // 집어 든 유닛을 (x,y)로. 영웅을 옮기면 수동 지정 병사는 상대 위치를 유지해 따라가고, 갈 수 없는 병사는 자동 배치로 돌린다
    dropAt(ref, x, y) {
        const ok = this.canDrop(ref, x, y, true);
        if (ok !== true) { showToast(this, ok); this.pick = null; this.render(); return; }
        if (ref.kind === 'troop') {
            const t = this.troops.get(ref.uhid)[ref.idx];
            t.x = x; t.y = y;
        } else {
            const hp = this.placements.find((p) => p.user_hero_id === ref.uhid);
            const dx = x - hp.x; const dy = y - hp.y;
            const list = this.troops?.get(ref.uhid) ?? [];
            const moving = list.map((t) => (t.x != null ? { t, nx: t.x + dx, ny: t.y + dy } : null)).filter(Boolean);
            moving.forEach(({ t }) => { delete t.x; delete t.y; }); // 자기 부대는 장애물에서 제외하고 다시 놓는다
            hp.x = x; hp.y = y;
            let dropped = 0;
            moving.forEach(({ t, nx, ny }) => {
                const idx = list.indexOf(t);
                if (this.canDrop({ kind: 'troop', uhid: ref.uhid, idx }, nx, ny)) { t.x = nx; t.y = ny; } else dropped++;
            });
            if (dropped) showToast(this, `병사 ${dropped}기는 갈 수 없는 칸이라 자동 배치로 돌렸습니다.`);
        }
        this.pick = null;
        this.render();
    }

    tapUnit(ref, x, y) {
        if (this.info.confirmed) return;
        if (this.selected) { this.tapTile(x, y); return; } // 목록에서 고른 영웅 배치 중: 칸 탭과 같게(자동 배치 예정 병사 칸이면 놓을 수 있다)
        if (this.pick) {
            if (this.isPicked(ref)) { // 같은 유닛 다시 탭: 병사면 수동 지정 해제(자동 배치), 영웅이면 취소
                if (ref.kind === 'troop') { const t = this.troops.get(ref.uhid)?.[ref.idx]; if (t) { delete t.x; delete t.y; } }
                this.pick = null; this.render(); return;
            }
            const t = ref.kind === 'troop' ? this.troops.get(ref.uhid)?.[ref.idx] : null;
            if (t && t.x == null) { this.dropAt(this.pick, x, y); return; } // 자동 배치 예정 병사 칸 = 빈 칸 취급
        }
        this.pick = ref;
        this.render();
    }

    // '부대 자동 배치': 모든 병사 수동 지정 해제 -> 영웅 주변으로 모으기(서버 자동 배치)
    autoTroops() {
        if (this.info.confirmed) return;
        this.placements.forEach((p) => this.clearTroopPos(p.user_hero_id));
        this.pick = null;
        this.render();
    }

    // '초기화': 최초 배치(저장 편성/기본 위치) + 병사 자동 배치
    resetAll() {
        if (this.info.confirmed) return;
        for (const id of this.troops.keys()) this.clearTroopPos(id);
        this.placements = (this.initialPlacements ?? []).map((p) => ({ ...p }));
        this.selected = null; this.pick = null;
        this.render();
    }

    troopCost() {
        if (!this.squad) return 0;
        const formTroops = (id) => (this.info.formation?.[id] ?? this.info.formation?.[String(id)])?.troops ?? [];
        if (this.mode === 'room') return this.cappedTroopCost(this.placements.map((p) => p.user_hero_id)); // 방 대전: 서버처럼 진영 유닛 상한 감축 반영
        return this.placements.reduce((s, p) => s + this.heroTroopCost(p.user_hero_id, formTroops), 0); // 필수 출전 영웅의 부대도 합산(2026-11-08 서버 규칙)
    }

    // 영웅 1명의 부대 유닛별 코스트 목록(소속 off = []). 빈 부대는 서버가 프리셋으로 폴백 -> 서버가 준 구성(formation)의 코스트로 추정
    heroTroopUnitCosts(id, formTroops = (k) => (this.info.formation?.[k] ?? this.info.formation?.[String(k)])?.troops ?? []) {
        if (!this.squad) return [];
        const list = this.troops?.get(id) ?? [];
        if (!list.length) return formTroops(id).map((t) => Number(t.cost) || 0);
        return list.map((t) => this.classCost[t.class] ?? 1); // 코스트 미상 병종은 서버 기본값(1)으로 추정
    }

    // 영웅 1명의 부대 코스트(감축 전). 자동 편성(스테이지)·예상 출전 코스트 공용
    heroTroopCost(id, formTroops) {
        return this.heroTroopUnitCosts(id, formTroops).reduce((a, c) => a + c, 0);
    }

    // 부대 코스트 합(진영 유닛 상한 감축 반영). 서버 ProgressionService::costBreakdown -> SquadPlanner::plan 과 같은 규칙:
    // 합산 대상 = 출전 영웅 전원(순서 유지, 2026-11-08 필수 출전 포함), 영웅 수 + 부대 수가 max_units_per_side 를 넘으면
    // 부대가 가장 많은 영웅(동률이면 뒤 순서)의 마지막 부대부터 1기씩 감축
    cappedTroopCost(ids) {
        if (!this.squad) return 0;
        const lists = ids.map((id) => [...this.heroTroopUnitCosts(id)]);
        const max = Number(this.info.max_units_per_side) || 0;
        if (max > 0) {
            let total = lists.length + lists.reduce((a, l) => a + l.length, 0);
            while (total > max) {
                let pick = -1;
                lists.forEach((l, i) => { if (l.length && (pick < 0 || l.length >= lists[pick].length)) pick = i; });
                if (pick < 0) break;
                lists[pick].pop(); total -= 1;
            }
        }
        return lists.reduce((a, l) => a + l.reduce((b, c) => b + c, 0), 0);
    }

    // 영웅 카드의 부대 줄(고정 병종, 읽기 전용): 서버 formation[id].troops[].class 를 칩으로만 표시. 병종 선택 모달·'+' 슬롯은 제거(2026-11 영웅 고정 병종).
    // 병사 위치는 서버가 자동 배치한다.
    troopRow(row, c, iw, y0, tx = 12) {
        const f = this.info.formation?.[c.user_hero_id] ?? this.info.formation?.[String(c.user_hero_id)] ?? {};
        const list = this.troops.get(c.user_hero_id) ?? [];
        const cw = Math.min(40, (iw - 24 - 150 - (tx - 12)) / Math.max(1, MAX_TROOP_SLOTS) - 4);
        // 병종 이름은 systems/names(병종 v2 표기) 기준, 병종 코드가 없으면 서버 troop_label
        const label = list[0]?.class ? unitClassName(list[0].class) : (f.troop_label ?? c.troop_label);
        row.add(fitText(makeText(this, tx, y0 + 22, label ? `병사 ${label}` : '부대', { size: 12, color: CSS.muted, origin: [0, 0.5] }), 66));
        list.forEach((t, i) => {
            const x = tx + 72 + i * (cw + 4);
            row.add(this.add.rectangle(x, y0 + 8, cw, 28, 0x0b1020, 1).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.6));
            // 병종 아이콘 단일 소스(GameIcons.troopIcon = 영웅 카드 뱃지와 같은 도트 그림 -> ico.troop -> 글자), 칸(cw x 28) 안으로 상한
            row.add(troopIcon(this, t.class, x + cw / 2, y0 + 22, Math.min(24, cw - 4), { glyphSize: 13, stroke: 0, max: Math.min(26, cw - 2) }));
        });
        const manual = list.filter((t) => t.x != null).length;
        row.add(makeText(this, iw - 12, y0 + 22, `병사 ${list.length}기 · ${manual ? `직접 ${manual}` : '자동 배치'}`, { size: 12, color: manual ? CSS.allyText : CSS.muted, origin: [1, 0.5] }));
    }

    // 빈 배치 칸(청색) 탭: 목록에서 고른 영웅 놓기 / 맵에서 집어 든 유닛 옮기기(검증은 canDrop, 최종 판정은 서버)
    tapTile(x, y) {
        if (this.info.confirmed) return;
        if (this.pick) { this.dropAt(this.pick, x, y); return; }
        if (!this.selected) return;
        if (this.occupied(x, y)) { showToast(this, '이미 점유된 칸입니다.'); return; }
        if (!this.passable(x, y, this.byId.get(this.selected)?.unit_type)) { showToast(this, '이 영웅이 설 수 없는 지형입니다.'); return; }
        { const se = this.heroSlotError(this.selected, x, y); if (se) { showToast(this, se); return; } } // 슬롯 모드: 슬롯 칸·고정 영웅·병종 제약
        if (!this.isFreeSlot(this.selected) && this.slotUsed() >= this.info.max_party_slots) { showToast(this, this.mode === 'room' && this.info.required_party != null ? `이 맵은 ${this.info.max_party_slots}명까지 출전합니다. 다른 영웅을 빼고 넣으세요.` : `슬롯은 최대 ${this.info.max_party_slots}개입니다.`); return; }
        this.clearTroopPos(this.selected);
        this.placements.push({ user_hero_id: this.selected, x, y });
        this.selected = null;
        this.render();
    }

    // 진행 표시: 버튼 비활성 + 라벨 + 사유 줄 문구(재클릭 시 같은 문구 토스트). 서버 응답·전투 씬 준비 동안 화면이 멈춘 것처럼 보이지 않게(강화면 관찰 B)
    setSubmitting(label, msg) {
        this.submitting = msg;
        if (!this.confirmBtn?.scene) return;
        this.confirmBtn.setLabel(label);
        this.confirmBtn.setDisabled(true);
        this.confirmBtn.reason = msg;
        if (this.reasonT?.scene) this.reasonT.setText(msg);
    }

    async confirm() {
        if (this.submitting || this.info?.confirmed) return; // 중복 클릭 가드
        this.setSubmitting('제출 중...', '배치를 제출하고 있습니다. 잠시만 기다려 주세요.');
        try {
            // 병사 위치: 직접 옮긴 병사만 placements[].troops[{class,x,y}] 로 보낸다(서버 계약: 선택 필드, 최대 4, class 가 달라도 서버 병종 사용).
            // 직접 옮기지 않은 병사는 생략 -> 서버 자동 배치(화면의 흐린 병사는 예상 위치). 병종 편성은 서버 고정(PUT /api/party troops 미전송)
            const pls = this.placements.map((p) => {
                const out = { user_hero_id: p.user_hero_id, x: p.x, y: p.y };
                const tr = this.squad ? (this.troops.get(p.user_hero_id) ?? []).filter((t) => t.x != null).map((t) => ({ class: t.class, x: t.x, y: t.y })) : [];
                if (tr.length) out.troops = tr;
                return out;
            });
            if (this.mode === 'room') {
                await gameApi.rooms.submit(this.roomCode, pls);
                await gameApi.rooms.confirm(this.roomCode);
                this.setSubmitting('이동 중...', '배치를 확정했습니다. 대기실로 이동합니다.');
                this.scene.start('Room', { code: this.roomCode });
            } else {
                await gameApi.battle.submit(this.battleId, pls);
                await gameApi.battle.confirm(this.battleId); // 성공 시 서버가 마지막 출격 구성(필수 출전 제외)을 자동 저장
                this.setSubmitting('전투 준비 중...', '배치를 확정했습니다. 전투를 준비하고 있습니다.');
                // 문구 최소 노출(강화면 a16 Low: 바로 전환하면 1~2프레임만 보임). submitting 은 유지 -> 대기 중 재클릭도 가드
                const go = { mode: 'stage', battleId: this.battleId, fresh: true, stageCode: this.stageCode };
                this.time.delayedCall(400, () => { if (this.sys?.isActive()) this.scene.start('Battle', go); });
            }
        } catch (e) {
            this.submitting = null;
            if (!this.confirmBtn.scene) return;
            this.confirmBtn.setLabel('배치 확정');
            this.confirmBtn.setDisabled(false);
            this.confirmBtn.reason = '';
            this.render?.();
            console.warn(`[deploy confirm failed] ${errorTag(e)}`);
            if (e.code === 'deployment_closed' && this.mode === 'room') { this.scene.start('Room', { code: this.roomCode }); return; }
            alertModal(this, '배치 오류', (e.fields ? Object.values(e.fields).join('\n') + '\n' : '') + messageOf(e));
        }
    }

    back() {
        if (this.mode === 'room') {
            // 대기실로 돌아가면 폴링이 다시 배치로 보내므로(배치 단계), 방을 나가는 것(기권)만 제공한다
            confirmModal(this, '방 나가기', '배치 단계에서 나가면 기권으로 처리됩니다.', async () => {
                try { await gameApi.rooms.leave(this.roomCode); } catch { /* 이미 닫힘 */ }
                this.scene.start('Lobby', { tab: 'room' });
            }, { okLabel: '나가기', danger: true });
            return;
        }
        confirmModal(this, '전투 포기', '배치 중인 전투를 포기합니다. 보상은 없습니다.', async () => {
            try { await gameApi.battle.abandon(this.battleId); } catch { /* 이미 종료 */ }
            this.scene.start('Lobby', { tab: Number(/^ch(\d+)_/.exec(this.stageCode ?? '')?.[1] ?? 0) >= 101 ? 'main' : 'stage' }); // 메인 스토리(ch101+)면 메인 스토리 탭으로
        }, { okLabel: '포기', danger: true });
    }
}
