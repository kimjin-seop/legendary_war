import { Tabs } from '../ui/Tabs.js';
import { Button } from '../ui/Button.js';
import { StatBar } from '../ui/StatBar.js';
import { Modal } from '../ui/Modal.js';
import { showToast, showRewardToast } from '../ui/Toast.js';
import { makeText, fitText } from '../ui/common.js';
import { ScrollList, noteText, alertModal, emptyState } from '../ui/widgets.js';
import { COLOR, CSS } from '../theme.js';
import { L } from '../layout.js';
import { session, sessionCache } from '../api/client.js';
import { gameApi } from '../api/gameApi.js';
import { messageOf, errorTag } from '../api/errors.js';
import { rarityCss, rarityBadge, normRarity } from '../rarity.js';
import { pixelImage, rankTier } from '../ui/PixelBadge.js';
import { portraitBox, heroSprite, ensureHeroSprite } from '../ui/HeroVisual.js';
import { heroPlainName } from '../systems/names.js';
import { fixJosa, withJosa } from '../systems/josa.js';
import { itemEffectText } from '../systems/items.js';
import { loaded } from '../assets.js';
import { slotIcon, statIcon } from '../ui/GameIcons.js';
import { itemIcon } from '../ui/ItemIcon.js';
import { questCard } from '../ui/QuestCard.js';
import { withUiImage } from '../ui/uiImage.js';
import { heroLevelText, heroExpToNext, isMaxLevel } from '../ui/heroLevel.js';

// 로비 확장 화면(퀘스트·랭킹·상점·인벤토리·영웅 장비). LobbyScene 의 패널(p)·영역(scene.area)·done()·show() 를 그대로 쓴다(공용 UI 스킨).
const fmt = (n) => Number(n ?? 0).toLocaleString('ko-KR');
export const SLOT_KO = { helm: '투구', armor: '갑옷', gloves: '장갑', boots: '신발', accessory: '장신구' };
const SLOTS = Object.keys(SLOT_KO);
const rewardText = (r) => [r?.gold ? `골드 ${fmt(r.gold)}` : '', r?.user_exp ? `EXP ${fmt(r.user_exp)}` : '', r?.pen ? `펜 ${fmt(r.pen)}` : ''].filter(Boolean).join(' · ');
const statText = (s) => [s?.hp ? `병력 +${s.hp}` : '', s?.atk ? `공격 +${s.atk}` : '', s?.def ? `방어 +${s.def}` : ''].filter(Boolean).join(' · ') || '-'; // U17: 공격/방어 용어 통일
const newReqId = (p) => `${p}_${Date.now().toString(36)}_${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '')}`.slice(0, 64);
// 남은 시간 문구(서버 시각 기준): reset ISO, serverNow ms
const leftText = (iso, serverNow) => { const ms = Date.parse(iso) - serverNow; if (!Number.isFinite(ms)) return ''; const m = Math.max(0, Math.floor(ms / 60000)); const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); return d ? `${d}일 ${h}시간` : `${h}시간 ${m % 60}분`; };

// 장비 아이콘(투명 64px) + 등급 프레임: 필요한 것만 지연 로드(public/assets/equip, 본 manifest 미병합)
// 아이콘 목록 = 장비 manifest 조각(assets/equip/manifest_fragment.json items[].key 'icon.equip.<code>' + path64) 또는 본 manifest 의 같은 키.
//  목록에 없는 code 는 로드하지 않고 equipIcon 글자 폴백(하플레이 gacha104: gloves_tut·armor_tut 404 콘솔 오류). 안아트가 키(별칭 포함)를 추가하면 자동 사용
let equipIndexP = null;
function equipIconIndex() {
    equipIndexP ??= fetch('/assets/equip/manifest_fragment.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
        const map = new Map();
        (Array.isArray(d?.items) ? d.items : []).forEach((e) => { const m = /^icon\.equip\.(.+)$/.exec(String(e?.key ?? '')); const pth = e?.path64 ?? e?.path; if (m && pth) map.set(m[1], `/${String(pth).replace(/^\/+/, '')}`); });
        return map;
    }).catch(() => null); // 목록을 못 받으면 null = 기존 규칙(코드 경로로 시도)
    return equipIndexP;
}
const equipIconUrl = (idx, code) => { const lm = loaded.manifest?.[`icon.equip.${code}`]; if (lm?.path) return `/${String(lm.path).replace(/^\/+/, '')}`; if (!idx) return `/assets/equip/icons/64/${code}.png`; return idx.get(code) ?? null; };
export function withEquipIcons(scene, items, cb) {
    equipIconIndex().then((idx) => { if (scene.sys?.isActive()) loadEquipIcons(scene, items, cb, idx); });
}
function loadEquipIcons(scene, items, cb, idx) {
    let n = 0;
    (items ?? []).forEach((it) => {
        if (!it) return;
        const k = `equip_icon_${it.code}`;
        const url = it.code ? equipIconUrl(idx, it.code) : null;
        if (url && !scene.textures.exists(k)) { scene.load.image(k, url); n += 1; }
        const r = String(it.rarity ?? 'c').toLowerCase();
        const fk = `equip_frame_${r}`;
        if (!scene.textures.exists(fk)) { scene.load.image(fk, `/assets/equip/frames/64/${r}.png`); n += 1; }
    });
    if (!n) { cb(); return; }
    scene.load.once('complete', () => { if (scene.sys.isActive()) cb(); });
    scene.load.start();
}
export function equipIcon(scene, it, x, y, size = 48) {
    const c = scene.add.container(x, y);
    const fk = `equip_frame_${String(it?.rarity ?? 'c').toLowerCase()}`;
    if (scene.textures.exists(fk)) c.add(scene.add.image(0, 0, fk).setOrigin(0).setDisplaySize(size, size));
    else c.add(scene.add.rectangle(0, 0, size, size, COLOR.navyDeep, 1).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.6));
    const k = `equip_icon_${it?.code}`;
    if (it?.code && scene.textures.exists(k)) c.add(scene.add.image(0, 0, k).setOrigin(0).setDisplaySize(size, size));
    else if (it?.slot) c.add(makeText(scene, size / 2, size / 2, (SLOT_KO[it.slot] ?? '장비').slice(0, 1), { size: Math.round(size * 0.42), bold: true, color: rarityCss(it.rarity), origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } })); // 아이콘 파일 없음(예 gloves_tut·armor_tut 튜토 지급 장비): 슬롯 첫 글자 폴백
    return c;
}

// 빨간 점 숫자 갱신(로비 상단 퀘스트 버튼)
export async function refreshQuestBadge(scene) {
    try { const d = await gameApi.quests.list(); scene.setQuestBadge?.(d.available === false ? 0 : d.claimable_count ?? 0); } catch { /* 배지 실패는 무시 */ }
}

// ---------- 퀘스트 ----------
export async function tabQuest(scene, p) {
    const d = await gameApi.quests.list();
    if (!p.scene || scene.tab !== 'quest') return;
    scene.done();
    const a = scene.area;
    scene.setQuestBadge?.(d.claimable_count ?? 0);
    if (d.available === false) { p.add(noteText(scene, a.x, a.y, '퀘스트 기능을 잠시 사용할 수 없습니다.', { kind: 'info', size: 15, wrap: a.w })); return; }
    const offset = Number(Date.parse(d.server_time)) - Date.now(); // 서버 시각 보정(남은 시간 표시용)
    const groups = { main: { label: '메인', quests: d.main ?? [] }, daily: { label: '일일', quests: d.daily?.quests ?? [], reset: d.daily?.reset_at }, weekly: { label: '주간', quests: d.weekly?.quests ?? [], reset: d.weekly?.reset_at }, monthly: { label: '월간', quests: d.monthly?.quests ?? [], reset: d.monthly?.reset_at } }; // 월간: 서버에 아직 없으면 빈 목록(빈 상태 안내)
    const cnt = (k) => groups[k].quests.filter((q) => q.claimable).length;
    let cur = scene.questGroup ?? 'main';
    const tabs = new Tabs(scene, { x: a.x, y: a.y, w: Math.min(a.w, 560), h: 44, size: 15, active: cur, items: Object.entries(groups).map(([k, g]) => ({ key: k, label: `${g.label}${cnt(k) ? ` (${cnt(k)})` : ''}` })), onChange: (k) => { cur = k; scene.questGroup = k; render(); } });
    // 우상단 배너(시안 성채 그림) 슬롯: 안아트 키 ui.quest.banner 가 있으면 넓은 화면에서 탭 줄 오른쪽 뒤에(없으면 생략)
    if (a.w >= 900) withUiImage(scene, 'ui.quest.banner', (k) => { if (!p.scene || scene.tab !== 'quest') return; const bw = Math.min(a.w * 0.42, 620); const im = scene.add.image(a.x + a.w, a.y - 6, k).setOrigin(1, 0); im.setScale(bw / im.width); im.setAlpha(0.95); p.addAt(im, Math.max(0, p.getIndex(tabs))); }); // 탭 바로 아래 층(패널 바탕보다 위, 카드보다 아래: gacha111 1280 배너 안 보임)
    p.add(tabs);
    // 수령 가능 배지(시안 '메인 (3)' 옆 점): 라벨 (N) 과 함께 탭 오른쪽 위 붉은 점
    { const ks = Object.keys(groups); const tw0 = Math.min(a.w, 560) / ks.length; ks.forEach((k, i) => { if (!cnt(k)) return; p.add(scene.add.circle(a.x + (i + 1) * tw0 - 12, a.y + 9, 6, 0xe0463c, 1).setStrokeStyle(2, 0x0b1020, 1)); }); }
    // 탭 줄 오른쪽에 '초기화까지 …' 자리가 없으면(390 등: 탭이 전폭) 탭 아래 줄로 내린다(강화면 v6 Low: 주간/월간 탭과 겹침)
    const infoBelow = a.w - Math.min(a.w, 560) < 170;
    const info = makeText(scene, a.x + a.w - (infoBelow ? 4 : 0), infoBelow ? a.y + 60 : a.y + 22, '', { size: 13, color: CSS.muted, origin: [1, 0.5] });
    p.add(info);
    let y0 = a.y + (infoBelow ? 74 : 54);
    if (d.is_guest) {
        // U07: 안내문 높이만큼 내린다(3줄째 잘림 수정). 좁은 화면은 안내문 전폭 + 버튼 아래 줄
        const nb = a.w < 600;
        const nt = noteText(scene, a.x, y0, '게스트는 메인 퀘스트 보상만 받을 수 있습니다. 일일·주간 보상은 회원 가입 후 받을 수 있으며 진행 데이터는 유지됩니다.', { kind: 'info', size: 13, wrap: nb ? a.w : a.w - 156 });
        p.add(nt);
        const by = nb ? y0 + nt.height + 8 : y0;
        p.add(new Button(scene, { x: a.x + a.w - 140, y: by, w: 140, h: 44, label: '회원 가입', size: 14, onClick: () => scene.scene.start('Auth', { mode: 'register' }) }));
        y0 = nb ? by + 44 + 12 : y0 + Math.max(44, nt.height) + 12;
    }
    const list = new ScrollList(scene, { x: a.x, y: y0, w: a.w, h: a.h - (y0 - a.y), clip: true, bar: true }); // U28: 픽셀 클리핑 + 하단 페이드(탭 바 사이 글자 비침 방지)
    p.add(list);
    const render = () => {
        const g = groups[cur];
        info.setText(g.reset ? `초기화까지 ${leftText(g.reset, Date.now() + offset)}` : '');
        list.content.removeAll(true);
        const nbq = a.w < 600;
        const rowH = nbq ? 120 : 112; const gap = 10; // 시안 카드 높이(좁은 화면은 설명 2줄 + 보상 줄)
        const cols = a.w >= 900 ? 2 : 1; // 1280 = 2열, 667·390 = 1열(시안·요청)
        const w = Math.floor((a.w - 10 - gap * (cols - 1)) / cols); // 스크롤 막대 자리(10)를 빼 카드 오른쪽 금테가 막대에 잘리지 않게
        if (!g.quests.length) list.content.add(emptyState(scene, { w: a.w, msg: '진행 중인 퀘스트가 없습니다', sub: g.reset ? '초기화 후 새 퀘스트가 열립니다.' : '스테이지를 진행하면 새 퀘스트가 열립니다.' }));
        // 시안 카드(ui/QuestCard): 썸네일 · 제목 · 설명 · 황금 진행 바 · 보상 · 상태 버튼(수령 완료 / 진행 중 › / 수령)
        g.quests.forEach((q, i) => {
            const row = questCard(scene, q, w, rowH, { onClaim: (qq) => claim(qq), onSignup: () => scene.scene.start('Auth', { mode: 'register' }) });
            row.setPosition((i % cols) * (w + gap), Math.floor(i / cols) * (rowH + gap));
            list.content.add(row);
        });
        list.setContentHeight(Math.ceil(g.quests.length / cols) * (rowH + gap));
        list.refreshMask?.();
    };
    let busy = false;
    let refreshTabs = false;
    const claim = async (q) => {
        if (busy) return;
        busy = true;
        try {
            const r = await gameApi.quests.claim(q.code);
            showToast(scene, `보상 수령: ${rewardText(r.reward)}`);
            refreshTabs = true; // 탭 라벨 '(N)'·붉은 점 갱신(정검수): finally 에서 탭 전체 다시 그림
            Object.assign(q, r.quest ?? { claimed: true, claimable: false });
            scene.setQuestBadge?.(r.claimable_count ?? 0);
            if (r.reward?.pen) scene.refreshPen?.(); // 펜 보상 -> 로비 펜 캡슐 재조회
            await gameApi.profile(true).then(() => scene.refreshBar?.()).catch(() => {});
        } catch (e) {
            console.warn('[quest claim]', errorTag(e));
            alertModal(scene, '수령 실패', messageOf(e));
            if (e?.code === 'quest_already_claimed') Object.assign(q, { claimed: true, claimable: false });
        } finally {
            busy = false;
            if (p.scene && scene.tab === 'quest') { if (refreshTabs) { refreshTabs = false; scene.show('quest'); } else render(); }
        }
    };
    render();
}

// ---------- 랭킹 ----------
export async function tabRanking(scene, p) {
    const a = scene.area;
    let board = scene.rankBoard ?? 'level';
    scene.done();
    p.add(new Tabs(scene, { x: a.x, y: a.y, w: Math.min(a.w, 360), h: 44, size: 15, active: board, items: [{ key: 'level', label: '레벨' }, { key: 'weekly_pvp', label: '주간 PvP 승수' }], onChange: (k) => { board = k; scene.rankBoard = k; load(); } }));
    const sub = makeText(scene, a.x + a.w, a.y + 22, '', { size: 12, color: CSS.muted, origin: [1, 0.5] });
    p.add(sub);
    const meBox = scene.add.container(a.x, a.y + 52);
    p.add(meBox);
    const list = new ScrollList(scene, { x: a.x, y: a.y + 52 + 62, w: a.w, h: a.h - 52 - 62, clip: true, bar: true });
    p.add(list);
    const row = (c, e, y, me) => {
        const w = a.w; const h = 46;
        const r = scene.add.container(0, y); r.clipH = h;
        r.add(scene.add.rectangle(0, 0, w, h, me ? COLOR.panelLight : COLOR.navyDeep, 0.88).setOrigin(0).setStrokeStyle(me ? 2 : 1, me ? COLOR.accentLight : COLOR.accent, me ? 1 : 0.35));
        r.add(makeText(scene, 16, h / 2, e.rank != null ? `${e.rank}위` : '-', { size: 16, bold: true, color: e.rank && e.rank <= 3 ? CSS.accent : CSS.text, origin: [0, 0.5] }));
        { const tier = rankTier(e); const rb = tier ? pixelImage(scene, `badge.rank.${tier}`, 0, h / 2, 26) : null; if (rb) { rb.setOrigin(0, 0.5).setX(84 - rb.displayWidth); r.add(rb); } } // 티어 도트 배지(서버 tier, 없으면 순위 기반 임시 규칙)
        r.add(fitText(makeText(scene, 90, h / 2, `${e.name ?? '-'}${me ? ' (나)' : ''}`, { size: 15, bold: me, origin: [0, 0.5] }), w - 90 - 260));
        r.add(makeText(scene, w - 16, h / 2, board === 'weekly_pvp' ? `${fmt(e.wins)}승 · Lv.${e.level}` : `Lv.${e.level} · EXP ${fmt(e.exp)}`, { size: 14, color: CSS.muted, origin: [1, 0.5] }));
        c.add(r);
    };
    const load = async () => {
        list.content.removeAll(true); meBox.removeAll(true);
        let d;
        try { d = await gameApi.ranking(board); } catch (e) { meBox.add(noteText(scene, 0, 0, messageOf(e), { kind: 'error', size: 14, wrap: a.w })); return; }
        if (!p.scene || scene.tab !== 'ranking') return;
        sub.setText(board === 'weekly_pvp' && d.week?.resets_at ? `이번 주 기준 · 월요일 05:00(KST) 초기화` : '레벨 → EXP 순 · 상위 50명');
        const st = d.me_status;
        if (d.me && st === 'ok') row(meBox, d.me, 0, true);
        else meBox.add(noteText(scene, 0, 8, st === 'excluded_guest' ? '게스트 계정은 랭킹에서 제외됩니다. 회원 가입 후 집계됩니다.' : st === 'unranked' ? '이번 주 PvP 승리 기록이 없습니다(기권·타임아웃 승리는 제외).' : st === 'excluded_banned' ? '이 계정은 랭킹에서 제외되었습니다.' : '내 순위 정보가 없습니다.', { kind: 'info', size: 13, wrap: a.w }));
        (d.entries ?? []).forEach((e, i) => row(list.content, e, i * 52, !!e.is_me));
        if (!(d.entries ?? []).length) list.content.add(emptyState(scene, { w: a.w, msg: '아직 집계된 순위가 없습니다', sub: board === 'weekly_pvp' ? '이번 주 PvP 승리가 쌓이면 순위가 표시됩니다.' : '' }));
        list.setContentHeight((d.entries ?? []).length * 52);
        list.refreshMask?.();
    };
    await load();
}

// 장비 능력치 칩(아이콘 + 값): stats {hp,atk,def} 중 0 이 아닌 것만. diff 모드 = 부호·색(+ 녹색 / − 적색)
const STAT_ORDER = [['atk', '공'], ['def', '방'], ['hp', '병']]; // hp = 장비의 병력 보정(영웅 체력은 고정 10)
function statChips(scene, stats, { x = 0, y = 0, maxW = 9999, diff = false, size = 12 } = {}) {
    const c = scene.add.container(x, y); let cx = 0;
    STAT_ORDER.forEach(([k, lb]) => {
        const v = Number(stats?.[k]) || 0;
        if (!v && !diff) return;
        if (diff && !v) return;
        const col = diff ? (v > 0 ? '#7fe08a' : '#ff8a7a') : '#ffffff';
        const t = makeText(scene, 0, 0, `${lb}${v > 0 ? '+' : '−'}${Math.abs(v)}`, { size, bold: true, color: col, origin: [0, 0.5] });
        const w = 16 + 4 + t.width + 10;
        if (cx + w > maxW) { t.destroy(); return; }
        c.add(scene.add.rectangle(cx, 0, w, size + 10, COLOR.ink, 0.85).setOrigin(0, 0.5).setStrokeStyle(1, diff ? (v > 0 ? 0x3fae5a : 0xc0504a) : COLOR.accent, 0.7));
        c.add(statIcon(scene, k, cx + 5 + 8, 0, 16));
        t.setPosition(cx + 5 + 16 + 4, 0); c.add(t);
        cx += w + 4;
    });
    c.w = Math.max(0, cx - 4);
    return c;
}

// ---------- 상점 ----------
// 상단 줄: [장비][소모품] 전환(scene.shopKind, 재진입 시 유지) + 오른쪽 인벤토리. 둘째 줄 = 보유 골드 안내, 그 아래 목록
const SHOP_TOP = 82; // 목록 시작(전환 줄 40 + 안내 줄)
function shopKindBar(scene, p, a) {
    const kind = scene.shopKind ?? 'equip';
    [['equip', '장비'], ['item', '소모품']].forEach(([k, lb], i) => {
        const b = new Button(scene, { x: a.x + i * 98, y: a.y, w: 92, h: 40, label: lb, size: 14, variant: k === kind ? 'primary' : undefined, onClick: () => { if ((scene.shopKind ?? 'equip') === k) return; scene.shopKind = k; scene.show('shop'); } });
        b.setSelected?.(k === kind);
        p.add(b);
    });
    p.add(new Button(scene, { x: a.x + a.w - 120, y: a.y, w: 120, h: 40, label: '인벤토리', size: 14, onClick: () => scene.show('inventory') }));
}
export async function tabShop(scene, p) {
    if ((scene.shopKind ?? 'equip') === 'item') return tabShopItems(scene, p);
    const d = await gameApi.shop();
    if (!p.scene || scene.tab !== 'shop') return;
    scene.done();
    const a = scene.area;
    shopKindBar(scene, p, a);
    const head = makeText(scene, a.x, a.y + 62, '', { size: 15, bold: true, color: CSS.accent, origin: [0, 0.5] });
    p.add(head);
    const st = { gold: d.gold, count: d.inventory_count, cap: d.inventory_cap };
    const setHead = () => { head.setText(`보유 골드 ${fmt(st.gold)}   ·   인벤토리 ${st.count}/${st.cap ?? 100}`); fitText(head, a.w); };
    setHead();
    const list = new ScrollList(scene, { x: a.x, y: a.y + SHOP_TOP, w: a.w, h: a.h - SHOP_TOP, clip: true, bar: true }); // 상점 부연 안내 문구 제거(2026-11-02 화면 정리) // U28: 하단 행 클립 + 페이드
    p.add(list);
    const items = d.items ?? [];
    const pending = {};
    const render = () => {
        list.content.removeAll(true);
        const rowH = 68; const gap = 8;
        const cols = scene.gridCols?.(a.w, 520, gap, [2, 3], 1) ?? 1; // 와이드 2~3열
        const w = Math.floor((a.w - gap * (cols - 1)) / cols);
        if (!items.length) list.content.add(emptyState(scene, { w: a.w, msg: '판매 중인 장비가 없습니다' }));
        items.forEach((it, i) => {
            const r = scene.add.container((i % cols) * (w + gap), Math.floor(i / cols) * (rowH + gap)); r.clipH = rowH;
            r.add(scene.add.rectangle(0, 0, w, rowH, COLOR.navyDeep, 0.88).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.4));
            r.add(equipIcon(scene, it, 8, 9, 48));
            // U26: 등급은 아이콘 프레임 + 모서리 글자 1곳만('C ★' 중복 제거), 이름은 등급 색
            r.add(makeText(scene, 8 + 48 - 3, 11, normRarity(it.rarity), { size: 12, heading: true, color: rarityCss(it.rarity), origin: [1, 0], stroke: { color: '#0B1020', width: 3 } }));
            const bwS = 120;
            r.add(fitText(makeText(scene, 66, 20, it.name, { size: 15, bold: true, color: rarityCss(it.rarity), origin: [0, 0.5] }), w - 66 - bwS - 20));
            r.add(fitText(makeText(scene, 66, 44, `${SLOT_KO[it.slot] ?? it.slot} · ${statText(it.stats)}${it.req_level ? ` · Lv.${it.req_level}+` : ''}${it.owned ? ` · 보유 ${it.owned}` : ''}`, { size: 12, color: CSS.muted, origin: [0, 0.5] }), w - 66 - bwS - 20));
            const poor = (st.gold ?? 0) < (it.price_gold ?? 0); const full = st.cap != null && st.count >= st.cap;
            const lowLv = it.req_level && (session.profile?.level ?? 0) < it.req_level; // 구매는 가능, 장착 시 영웅 레벨 필요(안내만)
            const why = full ? '인벤토리 가득' : poor ? '골드 부족' : '';
            r.add(new Button(scene, { x: w - bwS - 10, y: why || lowLv ? 6 : 11, w: bwS, h: 44, label: `${fmt(it.price_gold)} G`, size: 14, variant: 'primary', disabled: poor || full, reason: full ? '인벤토리가 가득 찼습니다' : poor ? `골드가 부족합니다 (필요 ${fmt(it.price_gold)}, 보유 ${fmt(st.gold)})` : '', onClick: () => buy(it) }));
            // U26: 비활성 사유를 버튼 아래에 바로 표시(탭해야 보이던 토스트 보완)
            if (why || lowLv) r.add(makeText(scene, w - 10 - bwS / 2, 58, why || `장착 Lv.${it.req_level} 필요`, { size: 12, color: why ? CSS.dangerText : CSS.muted, origin: [0.5, 0.5] }));
            list.content.add(r);
        });
        list.setContentHeight(Math.ceil(items.length / cols) * (rowH + gap) + 12);
        list.refreshMask?.();
    };
    let busy = false;
    const buy = async (it) => {
        if (busy) return;
        busy = true;
        const rid = (pending[it.code] ??= newReqId('s'));
        try {
            const r = await gameApi.buy(it.code, rid);
            delete pending[it.code];
            st.gold = r.gold; st.count = r.inventory_count; st.cap = r.inventory_cap ?? st.cap;
            it.owned = (it.owned ?? 0) + (r.replay ? 0 : 1);
            if (session.profile && Number.isFinite(r.gold)) sessionCache.setProfile({ ...session.profile, gold: r.gold });
            showRewardToast(scene, { title: '구매 완료', name: it.name, qty: 1, icon: it.code ? (s, z) => equipIcon(s, it, -z / 2, -z / 2, z) : null, amount: r.gold_spent, amountFmt: (n) => `-${fmt(n)} G`, fallback: `${it.name} 구매 완료 (-${fmt(r.gold_spent)} G)` });
            setHead();
        } catch (e) {
            if (e?.status && e.status < 500) delete pending[it.code]; // 확정 오류는 새 요청 ID, 네트워크·5xx 는 같은 ID 재사용(멱등)
            console.warn('[shop buy]', errorTag(e));
            alertModal(scene, '구매 실패', messageOf(e));
        } finally {
            busy = false;
            if (p.scene && scene.tab === 'shop') render();
        }
    };
    withEquipIcons(scene, items, () => { if (p.scene && scene.tab === 'shop') render(); });
    render();
}

// ---------- 소모품 상점(docs/BATTLE_ITEMS_SPEC.md 7절): 회복약 소/중/대·강장제. 이름·효과·가격·보유 수 + 구매(request_id 멱등) ----------
export async function tabShopItems(scene, p) {
    let d;
    try { d = await gameApi.shopItems(); } catch (e) {
        if (!p.scene || scene.tab !== 'shop') return;
        if (e?.status === 404) { scene.done(); shopKindBar(scene, p, scene.area); p.add(emptyState(scene, { w: scene.area.w, msg: '소모품 상점 준비 중입니다' }).setPosition(scene.area.x, scene.area.y + SHOP_TOP)); return; } // items_disabled·구 서버
        throw e;
    }
    if (!p.scene || scene.tab !== 'shop' || (scene.shopKind ?? 'equip') !== 'item') return;
    scene.done();
    const a = scene.area;
    shopKindBar(scene, p, a);
    const st = { gold: d.gold };
    const head = makeText(scene, a.x, a.y + 62, '', { size: 15, bold: true, color: CSS.accent, origin: [0, 0.5] });
    p.add(head);
    const setHead = () => { head.setText(`보유 골드 ${fmt(st.gold)}  ·  스테이지 전투당 ${d.max_per_battle ?? 3}회`); fitText(head, a.w); };
    setHead();
    const list = new ScrollList(scene, { x: a.x, y: a.y + SHOP_TOP, w: a.w, h: a.h - SHOP_TOP, clip: true, bar: true });
    p.add(list);
    const items = d.items ?? [];
    const pending = {};
    let busy = false;
    const render = () => {
        list.content.removeAll(true);
        const rowH = 68; const gap = 8;
        const cols = scene.gridCols?.(a.w, 520, gap, [2, 3], 1) ?? 1;
        const w = Math.floor((a.w - gap * (cols - 1)) / cols);
        if (!items.length) list.content.add(emptyState(scene, { w: a.w, msg: '판매 중인 소모품이 없습니다' }));
        items.forEach((it, i) => {
            const r = scene.add.container((i % cols) * (w + gap), Math.floor(i / cols) * (rowH + gap)); r.clipH = rowH;
            r.add(scene.add.rectangle(0, 0, w, rowH, COLOR.navyDeep, 0.88).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.4));
            r.add(itemIcon(scene, it, 8 + 24, rowH / 2, 44));
            const bwS = 120;
            const cap = Number(it.stack_limit) > 0 ? Number(it.stack_limit) : d.max_stack; // 항목별 보유 상한(stack_limit) 우선
            const full = cap != null && (it.owned ?? 0) >= cap;
            const poor = (st.gold ?? 0) < (it.price ?? 0);
            const why = full ? '보유 한도' : poor ? '골드 부족' : '';
            // 3줄(하플레이 #6: 효과·보유·전투당 횟수를 한 줄에 넣어 390 에서 '전투…' 잘림): 이름 / 효과 / 보유·전투당 횟수
            r.add(fitText(makeText(scene, 66, 15, it.name ?? it.code, { size: 15, bold: true, color: '#ffffff', origin: [0, 0.5] }), w - 66 - bwS - 20));
            r.add(fitText(makeText(scene, 66, 35, itemEffectText(it) || '-', { size: 12, color: '#9FE0A8', origin: [0, 0.5] }), w - 66 - bwS - 20));
            r.add(fitText(makeText(scene, 66, 53, [`보유 ${it.owned ?? 0}${cap != null ? `/${cap}` : ''}`, Number(it.per_battle_uses) > 0 ? `전투당 ${it.per_battle_uses}회` : ''].filter(Boolean).join(' · '), { size: 11, color: CSS.muted, origin: [0, 0.5] }), w - 66 - bwS - 20));
            r.add(new Button(scene, { x: w - bwS - 10, y: why ? 6 : 11, w: bwS, h: 44, label: `${fmt(it.price)} G`, size: 14, variant: 'primary', disabled: poor || full, reason: full ? `최대 ${cap}개까지 보유할 수 있습니다` : poor ? `골드가 부족합니다 (필요 ${fmt(it.price)}, 보유 ${fmt(st.gold)})` : '', onClick: () => buy(it) }));
            if (why) r.add(makeText(scene, w - 10 - bwS / 2, 58, why, { size: 12, color: CSS.dangerText, origin: [0.5, 0.5] }));
            list.content.add(r);
        });
        list.setContentHeight(Math.ceil(items.length / cols) * (rowH + gap) + 12);
        list.refreshMask?.();
    };
    const buy = async (it) => {
        if (busy) return;
        busy = true;
        const rid = (pending[it.code] ??= newReqId('si'));
        try {
            const r = await gameApi.buyItem(it.code, 1, rid);
            delete pending[it.code];
            if (Number.isFinite(r.gold)) st.gold = r.gold;
            it.owned = Number.isFinite(r.owned) ? r.owned : (it.owned ?? 0) + (r.replay ? 0 : 1);
            if (session.profile && Number.isFinite(r.gold)) sessionCache.setProfile({ ...session.profile, gold: r.gold });
            showRewardToast(scene, { title: '구매 완료', name: it.name ?? it.code, qty: 1, icon: it.code ? (s, z) => itemIcon(s, it, 0, 0, z) : null, amount: r.gold_spent, amountFmt: (n) => `-${fmt(n)} G`, fallback: `${it.name ?? it.code} 구매 완료 (-${fmt(r.gold_spent)} G)` });
            setHead();
        } catch (e) {
            if (e?.status && e.status < 500) delete pending[it.code]; // 확정 오류는 새 요청 ID, 네트워크·5xx 는 같은 ID 재사용(멱등)
            console.warn('[shop item buy]', errorTag(e));
            alertModal(scene, '구매 실패', messageOf(e));
        } finally {
            busy = false;
            if (p.scene && scene.tab === 'shop') render();
        }
    };
    render();
}

// ---------- 일일 교환소(골드, docs/SHOP_EXCHANGE_SPEC.md §1) ----------
// 상품 목록(이름·설명·가격·오늘 남은 횟수) + 구매(같은 상품 재시도 = 같은 request_id, 멱등). 상품이 없으면 빈 안내(운영자가 어드민으로 등록)
const KIND_KO = { equipment: '장비', currency: '재화' };
const fmtReset = (s) => { const t = Date.parse(s ?? ''); if (!Number.isFinite(t)) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export async function tabExchange(scene, p) {
    let d;
    try { d = await gameApi.exchange(); } catch (e) {
        if (!p.scene || scene.tab !== 'exchange') return;
        if (e?.status === 404 && e.code !== 'product_not_found') { scene.done(); p.add(emptyState(scene, { w: scene.area.w, msg: '교환소 준비 중입니다' }).setPosition(scene.area.x, scene.area.y + 20)); return; } // 구 서버(엔드포인트 없음)
        throw e;
    }
    if (!p.scene || scene.tab !== 'exchange') return;
    scene.done();
    const a = scene.area;
    const st = { gold: d.gold, pen: d.pen ?? null };
    const head = makeText(scene, a.x, a.y + 14, '', { size: 16, bold: true, color: CSS.accent, origin: [0, 0.5] });
    p.add(head);
    const setHead = () => { head.setText(`보유 골드 ${fmt(st.gold)}${st.pen != null ? `   ·   펜 ${fmt(st.pen)}` : ''}${d.reset_at ? `   ·   초기화 ${fmtReset(d.reset_at)}` : ''}`); fitText(head, a.w); };
    setHead();
    const list = new ScrollList(scene, { x: a.x, y: a.y + 40, w: a.w, h: a.h - 40, clip: true, bar: true });
    p.add(list);
    const items = d.products ?? [];
    const pending = {};
    let busy = false;
    const render = () => {
        list.content.removeAll(true);
        const rowH = 68; const gap = 8;
        const cols = scene.gridCols?.(a.w, 520, gap, [2, 3], 1) ?? 1;
        const w = Math.floor((a.w - gap * (cols - 1)) / cols);
        if (!items.length) list.content.add(emptyState(scene, { w: a.w, msg: '오늘 교환할 수 있는 상품이 없습니다', sub: '상품은 매일 05:00에 초기화됩니다.' }));
        items.forEach((it, i) => {
            const r = scene.add.container((i % cols) * (w + gap), Math.floor(i / cols) * (rowH + gap)); r.clipH = rowH;
            r.add(scene.add.rectangle(0, 0, w, rowH, COLOR.navyDeep, 0.88).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.4));
            const bwS = 120;
            const left = it.remaining == null ? '' : `남은 ${it.remaining}/${it.daily_limit}`;
            r.add(fitText(makeText(scene, 14, 20, it.name ?? it.code, { size: 15, bold: true, color: '#ffffff', origin: [0, 0.5] }), w - 14 - bwS - 20));
            r.add(fitText(makeText(scene, 14, 44, [left, KIND_KO[it.kind] ?? it.kind, it.description] /* 남은 횟수를 맨 앞(좁은 화면 말줄임에도 보이게, 강화면 gacha45) */.filter(Boolean).join(' · '), { size: 12, color: CSS.muted, origin: [0, 0.5] }), w - 14 - bwS - 20));
            const penCur = it.price_currency === 'pen'; const price = it.price ?? it.price_gold ?? 0; // 펜 결제 상품(price_currency=pen)
            const poor = penCur ? (st.pen ?? 0) < price : (st.gold ?? 0) < price; const out = it.remaining != null && it.remaining <= 0;
            const why = out ? '오늘 한도 소진' : poor ? (penCur ? '펜 부족' : '골드 부족') : '';
            r.add(new Button(scene, { x: w - bwS - 10, y: why ? 6 : 11, w: bwS, h: 44, label: penCur ? `펜 ${fmt(price)}` : `${fmt(price)} G`, size: 14, variant: 'primary', disabled: poor || out, reason: why, onClick: () => buy(it) }));
            if (why) r.add(makeText(scene, w - 10 - bwS / 2, 58, why, { size: 12, color: CSS.dangerText, origin: [0.5, 0.5] }));
            list.content.add(r);
        });
        list.setContentHeight(Math.ceil(items.length / cols) * (rowH + gap) + 12);
        list.refreshMask?.();
    };
    { const eq = items.filter((x) => x?.kind === 'equipment' && x.payload?.equipment_code).map((x) => ({ code: x.payload.equipment_code, rarity: x.payload?.rarity })); if (eq.length) withEquipIcons(scene, eq, () => {}); } // 교환 완료 연출용 장비 아이콘 미리 받기(실패해도 문구 토스트 폴백)
    const buy = async (it) => {
        if (busy) return;
        busy = true;
        const rid = (pending[it.code] ??= newReqId('x'));
        try {
            const r = await gameApi.exchangeBuy(it.code, rid);
            delete pending[it.code];
            st.gold = r.gold; if (r.pen != null) { st.pen = r.pen; scene.refreshPen?.(r.pen); }
            if (!r.replay) { it.bought_today = (it.bought_today ?? 0) + 1; if (it.remaining != null) it.remaining = Math.max(0, it.remaining - 1); }
            if (session.profile && Number.isFinite(r.gold)) sessionCache.setProfile({ ...session.profile, gold: r.gold });
            const penCur = it.price_currency === 'pen'; const spent = penCur ? (r.pen_spent ?? it.price ?? it.price_gold) : r.gold_spent;
            const ec = it.kind === 'equipment' ? it.payload?.equipment_code : null; // 장비 상품만 아이콘(텍스처가 이미 받아져 있을 때), 재화 상품은 기존 문구 토스트
            showRewardToast(scene, { title: '교환 완료', name: it.name ?? it.code, qty: 1, icon: ec && scene.textures.exists(`equip_icon_${ec}`) ? (s, z) => equipIcon(s, { code: ec, rarity: it.payload?.rarity }, -z / 2, -z / 2, z) : null, amount: spent, amountFmt: (n) => (penCur ? `펜 -${fmt(n)}` : `-${fmt(n)} G`), fallback: penCur ? `${it.name ?? it.code} 교환 완료 (펜 -${fmt(spent)})` : `${it.name ?? it.code} 교환 완료 (-${fmt(spent)} G)` });
            setHead();
        } catch (e) {
            if (e?.status && e.status < 500) delete pending[it.code]; // 확정 오류는 새 요청 ID, 네트워크·5xx 는 같은 ID 재사용(멱등)
            console.warn('[exchange buy]', errorTag(e));
            alertModal(scene, '교환 실패', messageOf(e));
        } finally {
            busy = false;
            if (p.scene && scene.tab === 'exchange') render();
        }
    };
    render();
}

// ---------- 인벤토리 ----------
export async function tabInventory(scene, p) {
    const d = await gameApi.inventory();
    if (!p.scene || scene.tab !== 'inventory') return;
    scene.done();
    const a = scene.area;
    p.add(makeText(scene, a.x, a.y + 14, `보유 장비 ${d.inventory_count ?? (d.items ?? []).length}/${d.inventory_cap ?? 100}`, { size: 16, bold: true, color: CSS.accent, origin: [0, 0.5] }));
    p.add(new Button(scene, { x: a.x + a.w - 130, y: a.y, w: 130, h: 40, label: '상점', size: 14, onClick: () => scene.show('shop') }));
    const list = new ScrollList(scene, { x: a.x, y: a.y + 50, w: a.w, h: a.h - 50, clip: true, bar: true });
    p.add(list);
    const items = d.items ?? [];
    // U27: 미장착 같은 장비(코드·강화 동일)는 한 줄 '×N' 으로 합치고, 장착된 장비는 개별 표시
    const rows = [];
    items.forEach((it) => {
        if (it.equipped_by) { rows.push({ it, n: 1 }); return; }
        const key = `${it.code}|${it.enhance ?? 0}`;
        const g = rows.find((r) => !r.it.equipped_by && r.key === key);
        if (g) g.n += 1; else rows.push({ it, n: 1, key });
    });
    const goEquip = () => { showToast(scene, '영웅을 고른 뒤 상세 → 장비에서 장착하세요.'); if (scene.selectTab) scene.selectTab('hero'); else { scene.tabBar?.setActive?.('hero'); scene.show('hero'); } };
    const render = () => {
        list.content.removeAll(true);
        const rowH = 62; const gap = 8;
        const cols = scene.gridCols?.(a.w, 520, gap, [2, 3], 1) ?? 1; // 와이드 2~3열
        const w = Math.floor((a.w - gap * (cols - 1)) / cols);
        if (!rows.length) list.content.add(emptyState(scene, { w: a.w, msg: '보유한 장비가 없습니다', sub: '장비 상점에서 구매할 수 있습니다.', cta: '장비 상점', onCta: () => scene.show('shop') }));
        rows.forEach(({ it, n }, i) => {
            const r = scene.add.container((i % cols) * (w + gap), Math.floor(i / cols) * (rowH + gap)); r.clipH = rowH;
            r.add(scene.add.rectangle(0, 0, w, rowH, COLOR.navyDeep, 0.88).setOrigin(0).setStrokeStyle(1, it.equipped_by ? COLOR.ally : COLOR.accent, it.equipped_by ? 0.9 : 0.4));
            r.add(equipIcon(scene, it, 8, 7, 48));
            r.add(makeText(scene, 8 + 48 - 3, 9, normRarity(it.rarity), { size: 12, heading: true, color: rarityCss(it.rarity), origin: [1, 0], stroke: { color: '#0B1020', width: 3 } }));
            const rw2 = 112;
            r.add(fitText(makeText(scene, 66, 20, `${it.name}${n > 1 ? `  ×${n}` : ''}`, { size: 15, bold: true, color: rarityCss(it.rarity), origin: [0, 0.5] }), w - 66 - rw2 - 16));
            r.add(fitText(makeText(scene, 66, 42, `${SLOT_KO[it.slot] ?? it.slot} · ${statText(it.stats)}${it.req_level ? ` · Lv.${it.req_level}+` : ''}`, { size: 12, color: CSS.muted, origin: [0, 0.5] }), w - 66 - rw2 - 16));
            if (it.equipped_by) r.add(fitText(makeText(scene, w - 14, rowH / 2, `장착: ${it.equipped_by.display_name ?? it.equipped_by.hero}`, { size: 13, color: CSS.allyText, origin: [1, 0.5] }), rw2));
            else r.add(new Button(scene, { x: w - rw2 - 10, y: (rowH - 44) / 2, w: rw2, h: 44, label: '장착하기', size: 14, onClick: goEquip }));
            list.content.add(r);
        });
        list.setContentHeight(Math.ceil(rows.length / cols) * (rowH + gap) + 12);
        list.refreshMask?.();
    };
    withEquipIcons(scene, items, () => { if (p.scene && scene.tab === 'inventory') render(); });
    render();
}

// ---------- 영웅 장비(5슬롯 장착/해제) ----------
// 레이아웃: 와이드 = 좌(영웅 스프라이트/초상화 + 좌우 5슬롯 아이콘 + Lv·EXP·합계 + 상세 정보) / 우(부위 탭 + 인벤토리 그리드 + 하단 n/100·장착·해제)
//           좁은 화면 = 상(영웅·슬롯) / 하(탭·그리드·버튼). API: gameApi.inventory / gameApi.equip(기존 그대로)
export async function openEquipment(scene, hh, onChanged, { onDetail } = {}) {
    let inv;
    try { inv = await gameApi.inventory(); } catch (e) { alertModal(scene, '장비', messageOf(e)); return; }
    const items = inv.items ?? [];
    const cap = inv.inventory_cap ?? 100;
    const eq = { ...(hh.equipment ?? {}) };
    const W = Math.min(1180, L.lw - 24); const H = Math.min(720, L.lh - 24);
    const wide = W >= 820;
    const m = new Modal(scene, { title: `장비 · ${hh.display_name ?? hh.name ?? ''}`, w: W, h: H, buttons: [{ label: '닫기' }] });
    const bodyH = H - (m.panel.bodyY + 12) - 84;
    const ix = 24; const iw = W - 48;
    // 처음 슬롯 = 장착하지 않은 보유 장비가 있는 첫 슬롯(없으면 보유 장비가 있는 첫 슬롯, 그것도 없으면 투구). 하플레이 gacha104: 항상 빈 '투구' 탭으로 열려 새 장갑·갑옷이 안 보임
    const freeIn = (k) => items.filter((x) => x.slot === k && !x.equipped_by).length;
    let curSlot = SLOTS.find((k) => freeIn(k) > 0) ?? SLOTS.find((k) => items.some((x) => x.slot === k)) ?? SLOTS[0];
    let sel = null; // 선택한 인벤토리 장비
    let busy = false;
    // 영역 계산
    const lw = wide ? Math.min(460, Math.floor(iw * 0.42)) : iw;
    const lh = wide ? bodyH : Math.min(300, Math.floor(bodyH * 0.46));
    const rx = wide ? ix + lw + 16 : ix; const ry = wide ? 0 : lh + 10;
    const rw = wide ? iw - lw - 16 : iw; const rh = bodyH - ry;
    const left = scene.add.container(ix, 0);
    const right = scene.add.container(rx, ry);
    m.inner.add([left, right]);
    const sectionBg = (c, w, h) => { const b = scene.sectionBg ? scene.sectionBg(0, 0, w, h, 0.78) : scene.add.rectangle(0, 0, w, h, COLOR.navyDeep, 0.78).setOrigin(0); c.add(b); };
    // 슬롯 아이콘(등급 프레임 + 장비 아이콘 + 등급 라벨 + 강화 수치). 빈 슬롯은 부위 이름
    const slotCell = (c, slot, x, y, s) => {
        const it = eq[slot];
        const g = scene.add.container(x, y);
        if (it) g.add(equipIcon(scene, it, 0, 0, s));
        else { g.add(scene.add.rectangle(0, 0, s, s, COLOR.ink, 0.6).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.45)); const ic = slotIcon(scene, slot, s / 2, s / 2 - 7, Math.round(s * 0.46)); ic.setAlpha?.(0.55); g.add(ic); g.add(makeText(scene, s / 2, s - 11, SLOT_KO[slot], { size: 11, color: CSS.muted, origin: [0.5, 0.5] })); } // 빈 슬롯 = 흐린 슬롯 아이콘(ico.slot.<slot>) + 이름
        if (it) g.add(makeText(scene, s - 3, 2, normRarity(it.rarity), { size: 12, heading: true, color: rarityCss(it.rarity), origin: [1, 0], stroke: { color: '#0B1020', width: 3 } }));
        if (it?.enhance) g.add(makeText(scene, s - 3, s - 2, `+${it.enhance}`, { size: 12, bold: true, origin: [1, 1], stroke: { color: '#0B1020', width: 3 } }));
        if (slot === curSlot) g.add(scene.add.rectangle(-2, -2, s + 4, s + 4, 0, 0).setOrigin(0).setStrokeStyle(2, COLOR.accentLight, 1));
        const hit = scene.add.rectangle(0, 0, s, s, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', (pt) => { if (pt.getDistance() > 12) return; curSlot = slot; sel = null; tabs.setActive(slot); render(); });
        g.add(hit);
        c.add(g);
    };
    const renderLeft = () => {
        left.removeAll(true);
        sectionBg(left, lw, lh);
        // 참고 배치: 위 = 좌 슬롯 3열(투구·갑옷·장갑) | 캐릭터 + '상세 정보'(우하단) | 우 슬롯 2(신발·장신구), 아래 = LV·이름 / EXP 바(%) / 공격력·체력·방어력
        const infoH = wide ? 96 : 76;
        const top = 10; const sgap = 8;
        const areaH = lh - infoH - top - 6;
        const s = Math.max(44, Math.min(wide ? 108 : 64, Math.floor((areaH - sgap * 2) / 3)));
        ['helm', 'armor', 'gloves'].forEach((k, i) => slotCell(left, k, 10, top + i * (s + sgap), s));
        ['boots', 'accessory'].forEach((k, i) => slotCell(left, k, lw - 10 - s, top + i * (s + sgap), s));
        // 가운데: 전투 스프라이트(없으면 초상화)
        const cx = 10 + s + 10; const cw = lw - 20 - s * 2 - 20; const chh = s * 3 + sgap * 2;
        const spS = Math.min(cw, chh) - 24;
        const putSp = () => { const sp = heroSprite(scene, hh, cx + cw / 2, top + chh / 2 - 10, spS); if (!sp) return false; left.add(scene.add.ellipse(cx + cw / 2, top + chh / 2 - 10 + spS / 2 - 6, Math.min(70, cw * 0.5), 14, 0x000000, 0.35)); left.add(sp); return true; };
        if (!putSp()) {
            const pb = portraitBox(scene, hh, cx, top, cw, chh);
            left.add(pb);
            ensureHeroSprite(scene, hh, () => { if (!left.scene || !pb.scene) return; if (putSp()) pb.destroy(); }); // 시트 1장 지연 로드 후 초상 -> 스프라이트 교체
        }
        if (onDetail) { const bw = Math.min(104, cw); left.add(new Button(scene, { x: cx + cw - bw, y: top + chh - 34, w: bw, h: 34, label: '상세 정보', size: 13, modal: true, onClick: () => { m.close(); onDetail(); } })); }
        // 하단 정보 띠
        const by = lh - infoH;
        left.add(scene.add.rectangle(6, by, lw - 12, infoH - 6, COLOR.ink, 0.55).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.35));
        const lvT = makeText(scene, 18, by + 14, heroLevelText(hh, { short: true }), { size: 16, bold: true, origin: [0, 0.5] }); // 'Lv.N/만렙'(레벨 곡선 v2)
        left.add(lvT);
        const nx = Math.max(90, 18 + lvT.width + 12);
        left.add(fitText(makeText(scene, nx, by + 14, heroPlainName(hh), { size: 16, bold: true, origin: [0, 0.5] }), Math.max(40, lw - nx - 20)));
        const ex = 18; const ew = lw - 36; const ey = by + (wide ? 30 : 26); const eh = wide ? 18 : 14;
        left.add(scene.add.rectangle(ex, ey, ew, eh, 0x07101f, 1).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.6));
        const etn = heroExpToNext(hh); // level_info.exp_to_next(이전 코드는 최상위 exp_to_next 를 읽어 항상 'EXP N'으로 표시됨). 만렙 = 0
        if (isMaxLevel(hh)) {
            left.add(scene.add.rectangle(ex + 1, ey + 1, ew - 2, eh - 2, 0xc9a23a, 1).setOrigin(0));
            left.add(makeText(scene, ex + ew / 2, ey + eh / 2, '만렙', { size: 12, bold: true, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } }));
        } else if (etn) {
            const pct = Math.max(0, Math.min(1, (hh.exp ?? 0) / etn));
            left.add(scene.add.rectangle(ex + 1, ey + 1, Math.max(0, (ew - 2) * pct), eh - 2, 0x3fae5a, 1).setOrigin(0));
            left.add(makeText(scene, ex + ew / 2, ey + eh / 2, `${(pct * 100).toFixed(1)}%`, { size: 12, bold: true, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } }));
        } else left.add(makeText(scene, ex + ew / 2, ey + eh / 2, `EXP ${fmt(hh.exp)}`, { size: 12, bold: true, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } }));
        // 공격력·체력·방어력: Lv.1 기본 + 장비 적용값(현재 레벨 능력치는 서버 미제공)
        const st = hh.detail?.stats; const tot = hh.equip_total ?? {};
        const vals = [['공격', (st?.atk ?? 0) + (tot.atk ?? 0)], ['방어', (st?.def ?? 0) + (tot.def ?? 0)]]; // 영웅 체력 고정 10(사용자 2026-11-04): 체력 제외 // U17 용어 통일
        let sx = 18; const sy = ey + eh + (wide ? 16 : 12);
        const SKEY = { 공격: 'atk', 방어: 'def' };
        vals.forEach(([k, v]) => { // 능력치 아이콘(ico.stat.*) + 이름 + 값
            left.add(statIcon(scene, SKEY[k], sx + 8, sy, 16)); sx += 16 + 4;
            const a = makeText(scene, sx, sy, k, { size: wide ? 15 : 13, bold: true, origin: [0, 0.5] }); left.add(a); sx += a.width + 6;
            const b = makeText(scene, sx, sy, st ? fmt(v) : '-', { size: wide ? 15 : 13, bold: true, color: CSS.accent, origin: [0, 0.5] }); left.add(b); sx += b.width + 14;
        });
    };
    // 우측: 부위 탭 + 그리드 + 하단 바
    const tabIco = rw / SLOTS.length >= 90; // 칸이 좁으면(390 등, 약 68) 탭 아이콘 생략: 아이콘 + '장신구 1' 이 칸을 넘어 말줄임(강화면 gacha106 Low). 슬롯 아이콘은 왼쪽 슬롯 칸에 있음
    const tabs = new Tabs(scene, { x: 0, y: 0, w: rw, h: 44, size: wide ? 15 : 12, modal: true, active: curSlot, items: SLOTS.map((k) => ({ key: k, iconFn: tabIco ? (sc, sz) => slotIcon(sc, k, 0, 0, sz) : undefined, label: freeIn(k) ? `${SLOT_KO[k]} ${freeIn(k)}` : SLOT_KO[k] })), onChange: (k) => { curSlot = k; sel = null; render(); } }); // 라벨 숫자 = 장착 안 한 보유 수
    right.add(tabs);
    const gridY = 52; const barH = 56; const infoH = 40;
    const grid = new ScrollList(scene, { x: 0, y: gridY, w: rw, h: Math.max(80, rh - gridY - barH - infoH) });
    right.add(grid);
    const info = scene.add.container(0, rh - barH - infoH + 4);
    const bar = scene.add.container(0, rh - barH + 6);
    right.add([info, bar]);
    const mine = (it) => it.equipped_by?.user_hero_id === hh.user_hero_id;
    const renderRight = () => {
        grid.content.removeAll(true);
        const list = items.filter((x) => x.slot === curSlot);
        const gap = 10;
        const cols = wide ? 3 : Math.max(3, Math.min(4, Math.floor((rw + gap) / (80 + gap)))); // 참고 화면: 3열
        const s = Math.floor((rw - gap * (cols - 1)) / cols);
        if (!list.length) grid.content.add(noteText(scene, 0, 8, `보유한 ${withJosa(SLOT_KO[curSlot], '이/가')} 없습니다. 장비 상점에서 구매하세요.`, { kind: 'info', size: 13, wrap: rw })); // U09: 조사 자동 처리
        list.forEach((it, i) => {
            const c = scene.add.container((i % cols) * (s + gap), Math.floor(i / cols) * (s + gap));
            c.clipH = s;
            c.add(scene.add.rectangle(0, 0, s, s, COLOR.navyDeep, 0.85).setOrigin(0));
            c.add(equipIcon(scene, it, 4, 4, s - 8));
            c.add(makeText(scene, s - 6, 4, normRarity(it.rarity), { size: 13, heading: true, color: rarityCss(it.rarity), origin: [1, 0], stroke: { color: '#0B1020', width: 3 } }));
            if (it.enhance) c.add(makeText(scene, s - 6, s - 4, `+${it.enhance}`, { size: 13, bold: true, origin: [1, 1], stroke: { color: '#0B1020', width: 3 } }));
            { const k0 = STAT_ORDER.find(([k]) => Number(it.stats?.[k])); if (k0) { const v = Number(it.stats[k0[0]]); const ct = makeText(scene, 0, 0, `+${v}`, { size: 11, bold: true, origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } }); const cw0 = 14 + 2 + ct.width + 6; c.add(scene.add.rectangle(4, 6, cw0, 18, COLOR.ink, 0.85).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.5)); c.add(statIcon(scene, k0[0], 4 + 3 + 7, 15, 16)); ct.setPosition(4 + 3 + 14 + 2, 15); c.add(ct); } } // 주 능력치 칩(아이콘 + 값)
            const other = it.equipped_by && !mine(it);
            if (it.equipped_by) {
                const tag = mine(it) ? '장착중' : '타 영웅';
                c.add(scene.add.rectangle(4, s - 22, Math.min(s - 8, 54), 18, mine(it) ? COLOR.ally : COLOR.ink, 0.9).setOrigin(0));
                c.add(makeText(scene, 8, s - 13, tag, { size: 11, bold: true, origin: [0, 0.5] }));
            }
            if (other) c.add(scene.add.rectangle(0, 0, s, s, COLOR.ink, 0.45).setOrigin(0));
            const on = sel?.id === it.id;
            c.add(scene.add.rectangle(0, 0, s, s, 0, 0).setOrigin(0).setStrokeStyle(on ? 3 : 1, on ? COLOR.accentLight : COLOR.accent, on ? 1 : 0.45));
            const hit = scene.add.rectangle(0, 0, s, s, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
            hit.on('pointerup', (pt) => { if (pt.getDistance() > 12) return; sel = it; render(); });
            c.add(hit);
            grid.content.add(c);
        });
        grid.setContentHeight(Math.ceil(list.length / cols) * (s + gap));
        grid.refreshMask?.();
        // 선택 장비 정보
        info.removeAll(true);
        const cur = eq[curSlot];
        const msg = sel ? `${sel.name} · ${statText(sel.stats)}${sel.req_level ? ` · Lv.${sel.req_level}+` : ''}${sel.equipped_by && !mine(sel) ? ` · ${sel.equipped_by.display_name ?? sel.equipped_by.hero} 장착 중(먼저 해제)` : ''}`
            : cur ? `현재 ${SLOT_KO[curSlot]}: ${cur.name}` : `${SLOT_KO[curSlot]} 비어 있음 · 아래 목록에서 장비를 선택하면 '장착'이 켜집니다`;
        if (sel && !(sel.equipped_by && !mine(sel))) { // 선택 장비: 이름(등급 색) + 능력치 칩 + 현재 장착 대비 ±(같은 부위)
            const nm = fitText(makeText(scene, 0, 14, sel.name, { size: 14, bold: true, color: rarityCss(sel.rarity), origin: [0, 0.5] }), Math.max(80, rw * 0.38)); info.add(nm);
            const chips = statChips(scene, sel.stats, { x: nm.width + 10, y: 14, maxW: rw - nm.width - 10 }); info.add(chips);
            if (!mine(sel)) { const d = {}; ['hp', 'atk', 'def'].forEach((k) => { d[k] = (Number(sel.stats?.[k]) || 0) - (Number(cur?.stats?.[k]) || 0); }); const dc = statChips(scene, d, { x: 0, y: 34, diff: true, size: 11, maxW: rw - 120 }); if (dc.w > 0) { info.add(makeText(scene, dc.w + 8, 34, cur ? '현재 장착 대비' : '빈 슬롯 대비', { size: 11, color: CSS.muted, origin: [0, 0.5] })); info.add(dc); } }
        } else info.add(fitText(makeText(scene, 0, 14, msg, { size: 14, bold: !!sel, color: sel ? rarityCss(sel.rarity) : CSS.muted, origin: [0, 0.5] }), rw));
        // 하단 바: 인벤토리 n/cap + 장착 / 해제
        bar.removeAll(true);
        bar.add(makeText(scene, 0, 22, `보유 ${items.length}/${cap}`, { size: 15, bold: true, color: CSS.accent, origin: [0, 0.5] }));
        const bw = wide ? 120 : 96;
        const canEquip = !!sel && !(sel.equipped_by && !mine(sel)) && !mine(sel);
        // U09: 비활성 '장착'·'해제' 사유(탭 시 토스트 + 선택 정보 줄이 비었을 때 안내)
        const lowLv = sel?.req_level && (hh.level ?? 0) < sel.req_level;
        const eqWhy = !sel ? '장비를 먼저 선택하세요.' : mine(sel) ? '이미 이 영웅이 장착 중입니다.' : sel.equipped_by ? '다른 영웅이 장착 중입니다. 먼저 해제하세요.' : busy ? '처리 중입니다.' : '';
        bar.add(new Button(scene, { x: rw - bw * 2 - 10, y: 0, w: bw, h: 48, label: '장착', size: 15, variant: 'primary', modal: true, disabled: !canEquip || busy, reason: eqWhy, onClick: () => apply(curSlot, sel.id) }));
        bar.add(new Button(scene, { x: rw - bw, y: 2, w: bw, h: 44, label: '해제', size: 15, modal: true, disabled: !eq[curSlot] || busy, reason: !eq[curSlot] ? `${withJosa(SLOT_KO[curSlot], '이/가')} 비어 있습니다.` : '', onClick: () => apply(curSlot, null) }));
        if (lowLv && canEquip) info.add(fitText(makeText(scene, 0, 34, `영웅 Lv.${sel.req_level} 이상 필요 (현재 Lv.${hh.level})`, { size: 12, color: CSS.dangerText, origin: [0, 0.5] }), rw));
    };
    const render = () => { if (!left.scene) return; renderLeft(); renderRight(); };
    const apply = async (slot, id) => {
        if (busy) return;
        busy = true;
        try {
            const r = await gameApi.equip(hh.user_hero_id, { [slot]: id });
            Object.keys(eq).forEach((k) => delete eq[k]);
            Object.assign(eq, r.equipment ?? {});
            hh.equipment = r.equipment; hh.equip_total = r.equip_total;
            const it = items.find((x) => x.id === id);
            items.forEach((x) => { if (x.equipped_by?.user_hero_id === hh.user_hero_id && x.slot === slot) x.equipped_by = null; });
            if (it) it.equipped_by = { user_hero_id: hh.user_hero_id, hero: hh.hero, display_name: hh.display_name };
            sel = null;
            onChanged?.();
        } catch (e) {
            console.warn('[equip]', errorTag(e));
            const extra = e?.code === 'level_too_low' && e.details ? ` (요구 Lv.${e.details.req_level}, 현재 Lv.${e.details.hero_level})` : '';
            alertModal(scene, '장착 실패', messageOf(e) + extra);
        } finally {
            busy = false;
            render();
        }
    };
    withEquipIcons(scene, [...items, ...Object.values(eq)], () => render());
    render();
}
