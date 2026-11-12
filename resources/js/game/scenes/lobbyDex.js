// 영웅 도감(영웅 그룹 서브 탭 'dex', 2026-11-03): 플레이 가능 영웅 전체(GET /api/gacha heroes[] = 뽑기 풀) + 보유 정보(GET /api/heroes).
// - 보유: 기존 카드 탭 동작과 같은 영웅 상세(scene.heroDetail). 미보유: 초상을 어둡게 + '미보유' 표식, 탭하면 간단 상세(초상·등급·병종·한 줄 소개)
// - 필터: 등급 / 병종 / 문화권(서버 풀 항목 culture > 보유 영웅 detail.culture. 둘 다 없으면 '전체'에서만 보임)
// - 근거 수준·전승·검증 필요 같은 표기는 쓰지 않는다(사용자 방침). 소개 문구 = 보유 detail.profile.one_line/summary > data/hero_tips.json desc
// - 뽑기가 꺼져 있으면(/api/gacha 404) 보유 영웅만으로 표시
import Phaser from 'phaser';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { makeText, fitText } from '../ui/common.js';
import { ScrollList, emptyState } from '../ui/widgets.js';
import { portraitBox, sCard } from '../ui/HeroVisual.js';
import { COLOR, CSS } from '../theme.js';
import { L } from '../layout.js';
import { gameApi } from '../api/gameApi.js';
import { compareRarity, rarityLabel, rarityColor } from '../rarity.js';
import { heroPlainName, unitClassName, cultureName } from '../systems/names.js';
import { manifestHas, ensurePortraitTex, troopPortraitLogical, texKey, captainPortraitLogical, ensureCaptainMap, portraitCodeByName, directLeaderBase } from '../assets.js';

// 도감 보기 전환: 'hero'(플레이 가능 영웅) | 'enc'(조우 장수 = 서가 NPC, GET /api/dex/encounter). 서버가 404(encounter_dex_disabled)면 전환 버튼 숨김
let encCache = null; // {at, heroes|null(꺼짐), err}
async function encList(force = false) {
    if (!force && encCache && Date.now() - encCache.at < 30000) return encCache;
    try { const r = await gameApi.dexEncounter(); encCache = { at: Date.now(), heroes: Array.isArray(r?.heroes) ? r.heroes : [], err: null }; } catch (e) { encCache = { at: Date.now(), heroes: e?.status === 404 ? null : [], err: e?.status === 404 ? null : e }; }
    return encCache;
}

let tipsPromise = null;
const loadTips = () => (tipsPromise ??= import('../data/hero_tips.json').then((m) => (m.default ?? m)?.tips ?? {}).catch(() => ({})));

// 서버 풀 + 보유 목록 -> [{hero, name, title, display_name, rarity, unit_type, culture, owned, own(보유 행|null)}]
async function dexList() {
    const owned = (await gameApi.heroes().catch(() => [])).filter((h) => !h.protagonist);
    const byCode = new Map(owned.map((h) => [h.hero, h]));
    let pool = null;
    try { pool = (await gameApi.gacha.info())?.heroes ?? null; } catch { pool = null; }
    const rows = (Array.isArray(pool) && pool.length ? pool : owned).filter((h) => h?.hero).map((h) => {
        const own = byCode.get(h.hero) ?? null;
        return { ...h, name: h.name ?? own?.name, rarity: h.rarity ?? own?.rarity, unit_type: h.unit_type ?? own?.detail?.unit_type, culture: h.culture ?? own?.detail?.culture ?? null, owned: !!own, own };
    });
    const seen = new Set();
    return { rows: rows.filter((r) => (seen.has(r.hero) ? false : seen.add(r.hero))), fromPool: !!pool };
}

export async function tabDex(scene, p) {
    const a0 = scene.area;
    const [{ rows, fromPool }, enc] = await Promise.all([dexList(), encList()]);
    if (!p.scene) return;
    scene.done();
    const tips = await loadTips();
    if (!p.scene) return;
    // 보기 전환 버튼(조우 장수가 켜져 있을 때만): 영웅 도감 / 조우 장수
    let a = a0;
    if (enc.heroes) {
        const mode = scene.dexMode ?? 'hero';
        [['hero', '영웅 도감'], ['enc', '조우 장수']].forEach(([k, lb], i) => p.add(new Button(scene, { x: a0.x + i * 128, y: a0.y, w: 120, h: 36, label: lb, size: 14, variant: mode === k ? 'primary' : undefined, onClick: () => { if (scene.dexMode !== k) { scene.dexMode = k; scene.show('dex'); } } })));
        a = { ...a0, y: a0.y + 44, h: a0.h - 44 };
        if (mode === 'enc') { encView(scene, p, a, enc); return; }
    }
    const st = scene.dexFilter ?? (scene.dexFilter = { rarity: null, type: null, culture: null });
    const uniq = (f) => [...new Set(rows.map(f).filter(Boolean))];
    const rarities = uniq((r) => r.rarity).sort(compareRarity);
    const types = uniq((r) => r.unit_type);
    const cultures = uniq((r) => r.culture);
    // 필터 버튼(눌러서 다음 값으로 순환: 전체 -> 값1 -> 값2 ...). 좁은 화면은 3개가 한 줄을 나눠 씀
    const bh = 40; const gap = 8;
    const ownedN = rows.filter((r) => r.owned).length;
    const head = makeText(scene, a.x, a.y + bh / 2, `${ownedN} / ${rows.length}명 보유${fromPool ? '' : ' (뽑기 목록을 받지 못해 보유 영웅만 표시)'}`, { size: 13, color: CSS.muted, origin: [0, 0.5] });
    const narrow = a.w < 640;
    const fy = narrow ? a.y + bh + 6 : a.y;
    const fw = narrow ? Math.floor((a.w - gap * 2) / 3) : Math.min(150, Math.floor((a.w - 240 - gap * 2) / 3));
    const fx0 = narrow ? a.x : a.x + a.w - (fw * 3 + gap * 2);
    p.add(head);
    const cycle = (key, vals) => { const i = st[key] == null ? -1 : vals.indexOf(st[key]); st[key] = i + 1 < vals.length ? vals[i + 1] : null; scene.show('dex'); };
    const defs = [
        ['rarity', '등급', rarities, (v) => rarityLabel(v) ?? v],
        ['type', '병종', types, (v) => unitClassName(v)],
        ['culture', '문화권', cultures, (v) => cultureName(v) || '기타'], // 표에 없는 코드는 영문 대신 '기타'
    ];
    defs.forEach(([key, label, vals, fmt], i) => {
        const cur = st[key] == null ? '전체' : fmt(st[key]);
        p.add(new Button(scene, { x: fx0 + i * (fw + gap), y: fy, w: fw, h: bh, label: `${label}: ${cur}`, size: 14, variant: st[key] == null ? undefined : 'primary', disabled: !vals.length, onClick: () => cycle(key, vals) }));
    });
    const top = fy + bh + 10;
    const list = new ScrollList(scene, { x: a.x, y: top, w: a.w, h: a.y + a.h - top, clip: true, bar: true });
    p.add(list);
    const shown = rows.filter((r) => (!st.rarity || r.rarity === st.rarity) && (!st.type || r.unit_type === st.type) && (!st.culture || r.culture === st.culture))
        .sort((x, y) => (y.owned - x.owned) || compareRarity(x.rarity, y.rarity) || String(x.name ?? '').localeCompare(String(y.name ?? ''), 'ko'));
    if (!shown.length) { list.content.add(emptyState(scene, { w: a.w, msg: '조건에 맞는 영웅이 없습니다', sub: '필터를 눌러 전체로 바꿔 보세요.' })); list.setContentHeight(200); return; }
    const g = 10; const usable = a.w - 8;
    const cols = scene.gridCols(usable, L.portrait ? 104 : 132, g, [5, 9], 4);
    const cw = Math.floor((usable - g * (cols - 1)) / cols);
    const ph = Math.round(cw * 1.2); const ch = ph + 40;
    shown.forEach((r, i) => {
        const x = (i % cols) * (cw + g); const y = Math.floor(i / cols) * (ch + g);
        list.content.add(dexCard(scene, r, x, y, cw, ph, ch, () => (r.owned ? scene.heroDetail(r.own) : openDexDetail(scene, r, tips))));
    });
    list.setContentHeight(Math.ceil(shown.length / cols) * (ch + g));
    list.refreshMask();
    scene.lazyPortraits(list);
}

// 카드: 초상(지연 로드) + 이름 + 등급·병종. 미보유 = 초상 위 어두운 막 + '미보유'
function dexCard(scene, r, x, y, w, ph, h, onClick) {
    const c = scene.add.container(x, y);
    const col = rarityColor(r.rarity) ?? COLOR.accent;
    c.add(scene.add.rectangle(0, 0, w, h, COLOR.ink, 0.6).setOrigin(0).setStrokeStyle(1, col, r.owned ? 0.9 : 0.4));
    const pb = portraitBox(scene, r.own ?? r, 0, 0, w, ph, { lazy: true, border: false });
    c.add(pb);
    c.portrait = pb;
    if (!r.owned) {
        c.add(scene.add.rectangle(0, 0, w, ph, 0x05070d, 0.55).setOrigin(0));
        const tag = makeText(scene, w / 2, ph - 12, '미보유', { size: 12, bold: true, color: '#cfd6e4', origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } });
        c.add([scene.add.rectangle(w / 2, ph - 12, tag.width + 14, tag.height + 4, 0x0b1020, 0.8), tag]);
    }
    c.add(fitText(makeText(scene, w / 2, ph + 12, heroPlainName(r), { size: 13, bold: true, color: r.owned ? CSS.text : CSS.muted, origin: [0.5, 0.5] }), w - 8));
    c.add(fitText(makeText(scene, w / 2, ph + 30, [rarityLabel(r.rarity) ?? r.rarity, r.unit_type ? unitClassName(r.unit_type) : ''].filter(Boolean).join(' · '), { size: 11, color: CSS.muted, origin: [0.5, 0.5] }), w - 8));
    const hit = scene.add.rectangle(0, 0, w, h, 0, 0).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', (pt) => {
        if ((scene.modalCount ?? 0) > 0 || pt.getDistance() > 16) return; // 터치 미세 흔들림 허용(12 -> 16)
        try { onClick(); } catch (e) { console.error('[dex] 상세 열기 실패', r.hero, e); } // 미보유 상세가 안 열리던 원인 추적용(예외가 나도 탭이 조용히 사라지지 않게 로그)
    });
    c.add(hit);
    return c;
}

// 미보유 영웅 간단 상세(초상 원본 + 이름·칭호·등급·병종·소개). 보유하면 영웅 탭에서 전체 상세
function openDexDetail(scene, r, tips) {
    const W = Math.min(720, L.lw - 24); const H = Math.min(520, L.lh - 24);
    const m = new Modal(scene, { title: heroPlainName(r), w: W, h: H, buttons: [{ label: '닫기' }] });
    const bodyH = m.footerY - (m.panel.bodyY + 12) - 8;
    const wide = W >= 560;
    const pw = wide ? Math.min(260, Math.floor((W - 48) * 0.42)) : Math.min(W - 48, 200);
    const pH = wide ? Math.min(bodyH, Math.round(pw * 1.3)) : Math.min(Math.round(bodyH * 0.45), Math.round(pw * 1.2));
    const px = wide ? 24 : Math.floor((W - pw) / 2);
    const pb = sCard(scene, r.own ?? r, px, 0, pw, pH, (x0, y0, sl) => portraitBox(scene, r, x0, y0, pw, pH, { thumb: false, bare: sl })); // S 등급 = 배경 판 -> 인물 -> 등급 프레임 -> 장식
    m.inner.add(pb);
    pb.load?.();
    const tx = wide ? px + pw + 20 : 24; const ty = wide ? 0 : pH + 12; const tw = wide ? W - tx - 24 : W - 48;
    // 소개 글은 전문 표시, 칸을 넘치면 스크롤(휠·드래그, 클리핑 + 스크롤바). 짧으면 스크롤 UI 없음
    const sl = new ScrollList(scene, { x: tx, y: ty, w: tw, h: Math.max(80, bodyH - ty), clip: true, bar: true });
    m.inner.add(sl);
    let yy = 0;
    const line = (txt, o) => { if (!txt) return; const t = makeText(scene, 0, yy, txt, { wrap: tw - 8, ...o }); sl.content.add(t); yy += t.height + 8; };
    line(r.title ? `${r.title} ${heroPlainName(r)}` : r.display_name ?? '', { size: 18, bold: true, color: '#f0d58c' });
    line([rarityLabel(r.rarity) ?? r.rarity, r.unit_type ? unitClassName(r.unit_type) : '', r.culture ? cultureName(r.culture) : ''].filter(Boolean).join(' · '), { size: 14, color: CSS.muted });
    // 소개: 서버 풀 항목 profile(박백엔 추가 예정: one_line·summary·life) > data/hero_tips.json(life·desc). 근거 표기 필드는 쓰지 않는다
    const tip = tips?.[r.hero]; const pf = r.profile ?? null;
    line(pf?.life ?? tip?.life ?? '', { size: 14, color: CSS.muted });
    line(pf?.one_line ?? tip?.desc ?? '', { size: 15, bold: !!pf?.one_line });
    if (pf?.summary) line(String(pf.summary), { size: 14, color: CSS.text }); // 전문(서버 120자 잘림 제거됨). 길면 이 스크롤 목록 안에서 스크롤
    line('아직 보유하지 않은 영웅입니다. 뽑기나 스테이지 보상으로 얻으면 능력치와 스킬을 볼 수 있습니다.', { size: 13, color: CSS.muted });
    sl.setContentHeight(yy);
    sl.refreshMask();
}

// ---------- 조우 장수(서가 NPC) ----------
// 서가별 그룹(응답 순서 유지): 머리줄 '서가명  공개 n / m' + 카드 격자. 미공개(silhouette) = 어두운 실루엣 + '???'
function encView(scene, p, a, enc) {
    const list = new ScrollList(scene, { x: a.x, y: a.y, w: a.w, h: a.h, clip: true, bar: true });
    p.add(list);
    const heroes = enc.heroes ?? [];
    if (enc.err || !heroes.length) {
        list.content.add(emptyState(scene, { w: a.w, msg: enc.err ? '조우 장수 목록을 불러오지 못했습니다' : '아직 조우한 장수가 없습니다', sub: enc.err ? '잠시 후 다시 열어 보세요.' : '서가 스테이지를 진행하면 장수가 기록됩니다.' }));
        list.setContentHeight(200); return;
    }
    const groups = new Map();
    heroes.forEach((h) => { const k = h.shelf_code ?? '-'; if (!groups.has(k)) groups.set(k, { name: h.shelf_name ?? '기타', rows: [] }); groups.get(k).rows.push(h); });
    const g = 10; const usable = a.w - 8;
    const cols = scene.gridCols(usable, L.portrait ? 96 : 120, g, [5, 10], 3);
    const cw = Math.floor((usable - g * (cols - 1)) / cols);
    const ph = Math.round(cw * 1.2); const ch = ph + 40;
    let y = 0;
    groups.forEach((gr) => {
        const open = gr.rows.filter((h) => h.revealed).length;
        list.content.add(makeText(scene, 0, y + 12, `${gr.name}`, { size: 16, bold: true, color: '#f0d58c', origin: [0, 0.5] }));
        list.content.add(makeText(scene, usable, y + 12, `공개 ${open} / ${gr.rows.length}`, { size: 12, color: CSS.muted, origin: [1, 0.5] }));
        y += 30;
        gr.rows.forEach((h, i) => {
            const x = (i % cols) * (cw + g); const yy = y + Math.floor(i / cols) * (ch + g);
            list.content.add(encCard(scene, h, gr.name, x, yy, cw, ph, ch));
        });
        y += Math.ceil(gr.rows.length / cols) * (ch + g) + 12;
    });
    list.setContentHeight(y);
    list.refreshMask();
    scene.lazyPortraits(list);
}

// 초상: portrait_key(.thumb) > 문화권·병종 병사 초상(troopPortraitLogical) > 이니셜. 미공개는 실루엣 색으로 칠함. c.load() = 지연 로드
function encPortrait(scene, h, x, y, w, ph, { thumb = true, lazy = true } = {}) {
    const c = scene.add.container(x, y);
    const sil = !h.revealed || !!h.silhouette;
    const col = rarityColor(h.grade) ?? COLOR.accent;
    const pk = typeof h.portrait_key === 'string' ? h.portrait_key : null;
    // 초상 순서: 고유(portrait_key) -> 'X 직속' 이면 X 초상 -> 기본 부장(captain_map: 이름 규칙·서가 스테이지 코드 '<shelf>_'·문화권) -> 병종 병사 초상
    const dpc = directLeaderBase(h.name_ko) ? portraitCodeByName(directLeaderBase(h.name_ko)) : null;
    const capt = captainPortraitLogical({ name: h.name_ko ?? '', culture: h.culture ?? null, troop: h.unit_type ?? null, stageCode: h.shelf_code ? `${h.shelf_code}_` : null }, { thumb });
    const lg = [pk && thumb && `${pk}.thumb`, pk, dpc && thumb && `portrait.${dpc}.thumb`, dpc && `portrait.${dpc}`, capt, troopPortraitLogical(h.unit_type, h.culture, { thumb })].filter(Boolean).find((k) => manifestHas(k)) ?? null;
    if (!capt) ensureCaptainMap(); // 매핑이 아직 없으면 받아 두기(다음 표시부터 적용)
    const draw = (tk) => {
        if (!c.scene) return;
        c.removeAll(true);
        c.add(scene.add.rectangle(0, 0, w, ph, COLOR.ink, 0.55).setOrigin(0));
        if (tk && scene.textures.exists(tk)) {
            const img = scene.add.image(0, 0, tk).setOrigin(0);
            const fw = img.frame.realWidth; const fh = img.frame.realHeight; const ar = w / ph;
            const cw = Math.min(fw, fh * ar); const chh = cw / ar; const cx = (fw - cw) / 2; const cy = Math.max(0, Math.min(fh - chh, fh * 0.04)); const s = w / cw;
            img.setCrop(cx, cy, cw, chh).setScale(s).setPosition(-cx * s, -cy * s);
            if (sil) { // 미공개: 단색 실루엣(디테일 제거, 강화면 gacha66) + 옅은 외곽선(2px 어긋난 사본 4장을 밝은 남색 단색으로 뒤에)
                const FILL = Phaser.TintModes?.FILL ?? 1; const fill = (o, col) => (o.setTintMode ? o.setTint(col).setTintMode(FILL) : o.setTintFill ? o.setTintFill(col) : o.setTint(col)); // Phaser 4 TintModes.FILL, 3 = setTintFill
                [[-2, 0], [2, 0], [0, -2], [0, 2]].forEach(([dx, dy]) => { const o = scene.add.image(0, 0, tk).setOrigin(0).setCrop(cx, cy, cw, chh).setScale(s).setPosition(-cx * s + dx, -cy * s + dy).setAlpha(0.55); fill(o, 0x4a5d82); c.add(o); });
                fill(img, 0x0d1322);
            }
            c.add(img);
        } else c.add(makeText(scene, w / 2, ph / 2, sil ? '?' : String(h.name_ko ?? '?').slice(0, 1), { size: Math.round(Math.min(w, ph) * 0.4), bold: true, color: sil ? CSS.muted : CSS.text, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 4 } }));
        c.add(scene.add.rectangle(0, 0, w, ph, 0, 0).setOrigin(0).setStrokeStyle(1, col, sil ? 0.35 : 0.8));
    };
    let started = false;
    c.load = () => { if (started) return; started = true; const k = ensurePortraitTex(scene, lg, draw); draw(k); };
    if (lazy && !(lg && scene.textures.exists(texKey(lg)))) draw(null); else c.load();
    return c;
}

function encCard(scene, h, shelfName, x, y, w, ph, ch) {
    const c = scene.add.container(x, y);
    const sil = !h.revealed || !!h.silhouette;
    const col = rarityColor(h.grade) ?? COLOR.accent;
    c.add(scene.add.rectangle(0, 0, w, ch, COLOR.ink, 0.6).setOrigin(0).setStrokeStyle(1, col, sil ? 0.3 : 0.8));
    const pb = encPortrait(scene, h, 0, 0, w, ph);
    c.add(pb); c.portrait = pb;
    c.add(fitText(makeText(scene, w / 2, ph + 12, sil ? '???' : (h.name_ko ?? ''), { size: 13, bold: true, color: sil ? CSS.muted : CSS.text, origin: [0.5, 0.5] }), w - 8));
    c.add(fitText(makeText(scene, w / 2, ph + 30, [rarityLabel(h.grade) ?? h.grade, h.unit_type ? unitClassName(h.unit_type) : ''].filter(Boolean).join(' · '), { size: 11, color: CSS.muted, origin: [0.5, 0.5] }), w - 8));
    const hit = scene.add.rectangle(0, 0, w, ch, 0, 0).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', (pt) => {
        if ((scene.modalCount ?? 0) > 0 || pt.getDistance() > 16) return;
        try { openEncDetail(scene, h, shelfName); } catch (e) { console.error('[dex] 조우 장수 상세 실패', h.code, e); }
    });
    c.add(hit);
    return c;
}

// 상세: 공개 = 초상·이름·등급·병종·문화권·생몰년·한 줄 설명 / 미공개 = 실루엣 + 공개 조건 안내
function openEncDetail(scene, h, shelfName) {
    const sil = !h.revealed || !!h.silhouette;
    const W = Math.min(680, L.lw - 24); const H = Math.min(460, L.lh - 24);
    const m = new Modal(scene, { title: sil ? '???' : (h.name_ko ?? ''), w: W, h: H, buttons: [{ label: '닫기' }] });
    const bodyH = m.footerY - (m.panel.bodyY + 12) - 8;
    const wide = W >= 560;
    const pw = wide ? Math.min(220, Math.floor((W - 48) * 0.38)) : Math.min(W - 48, 180);
    const pH = wide ? Math.min(bodyH, Math.round(pw * 1.3)) : Math.min(Math.round(bodyH * 0.45), Math.round(pw * 1.2));
    const px = wide ? 24 : Math.floor((W - pw) / 2);
    m.inner.add(encPortrait(scene, h, px, 0, pw, pH, { thumb: false, lazy: false }));
    const tx = wide ? px + pw + 20 : 24; const ty = wide ? 0 : pH + 12; const tw = wide ? W - tx - 24 : W - 48;
    const sl = new ScrollList(scene, { x: tx, y: ty, w: tw, h: Math.max(80, bodyH - ty), clip: true, bar: true });
    m.inner.add(sl);
    let yy = 0;
    const line = (txt, o) => { if (!txt) return; const t = makeText(scene, 0, yy, txt, { wrap: tw - 8, ...o }); sl.content.add(t); yy += t.height + 8; };
    line([rarityLabel(h.grade) ?? h.grade, h.unit_type ? unitClassName(h.unit_type) : '', h.culture ? cultureName(h.culture) : ''].filter(Boolean).join(' · '), { size: 14, color: CSS.muted });
    if (shelfName) line(`조우 서가: ${shelfName}`, { size: 13, color: CSS.muted });
    if (sil) line(`'${shelfName ?? '해당 서가'}' 스테이지를 하나 이상 클리어하면 이름과 설명이 공개됩니다.`, { size: 14 });
    else { line(h.life ?? '', { size: 14, color: CSS.muted }); line(h.one_line ?? '', { size: 15, bold: true }); }
    sl.setContentHeight(yy);
    sl.refreshMask();
}
