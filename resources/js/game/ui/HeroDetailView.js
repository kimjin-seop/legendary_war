// 영웅 상세(스테이터스) 뷰 공용 모듈(2026-11-14 Lobby.js 에서 추출: 로비 영웅 상세·주인공 탭 + 출전 배치 카드 (i) 가 같은 화면을 쓴다).
// 로비 동작·모양은 그대로(Lobby 의 heroStatusBody/historySection/rarityTag/sectionBg/heroDetail 은 이 모듈을 부르는 얇은 래퍼).
import { portraitBox, sCard, heroSprite, ensureHeroSprite, troopBadges, troopSprite, ensureTroopSprite, troopTypeOf } from './HeroVisual.js';
import { Button } from './Button.js';
import { Modal } from './Modal.js';
import { makeText, fitText } from './common.js';
import { slice, skinOn } from './skin.js';
import { rarityBadge, rarityCss, rarityLabel, RARITY_STARS, normRarity } from '../rarity.js';
import { ScrollList } from './widgets.js';
import { SLOT_KO } from '../scenes/lobbyExtra.js';
import { TableView, kvTable } from './TableView.js';
import { statGauges } from './StatGauges.js';
import { troopIcon } from './GameIcons.js';
import { ensureSkillIcons, skillIconFrame, skillIconImage, skillIconsListed, skillIconsReady } from './SkillIcon.js';
import { COLOR, CSS } from '../theme.js';
import { L } from '../layout.js';
import { auraDesc } from '../systems/glossary.js';
import { heroPlainName } from '../systems/names.js';
import { skillDisplayName } from '../systems/skills.js';
import { rarityMark } from './PixelBadge.js';
import { heroLevelText, heroExpToNext, isMaxLevel, troopSlotInfo, heroMaxStats } from './heroLevel.js';

const fmtNum = (n) => Number(n ?? 0).toLocaleString('ko-KR');

// 등급 표식: 도트 badge.rarity.<R> + 별. 아틀라스 없으면 텍스트(S ★★★★). 좌상단 (x, y). 도트면 폭을 cw 에 보관(Phaser 4 setPosition 이 .w 를 0 으로)
export function heroRarityTag(scene, rarity, x, y, textStyle) {
    const mk = rarityMark(scene, rarity, { size: Math.round((textStyle?.size ?? 12) * 1.3) });
    if (!mk) return makeText(scene, x, y, rarityBadge(rarity), textStyle);
    const mw = mk.w; mk.setPosition(x, y); mk.cw = mw;
    return mk;
}

// 섹션 카드 배경(반투명 남색 panel.sub). 스킨이 없으면 단색 + 얇은 금선
export function heroSectionBg(scene, x, y, w, h, alpha = 0.82) {
    const sk = skinOn(scene) ? slice(scene, 'panel_sub', w, h, 'panel') : null;
    if (sk?.skinAtlas) return sk.setPosition(x, y).setAlpha(alpha);
    sk?.destroy();
    return scene.add.rectangle(x, y, w, h, COLOR.navyDeep, alpha).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.5);
}

// 영웅 상세 모달(로비 영웅 카드 탭과 같은 화면). buttons = 하단 버튼(기본 '닫기'). 반환 = Modal
export function openHeroDetail(scene, hh, { buttons = [{ label: '닫기' }] } = {}) {
    // 레이아웃: 와이드 = 좌(큰 초상화 + 전투 유닛 스프라이트) / 우(섹션 카드 스크롤: 2열 + 전폭 표), 좁은 화면 = 상(초상화·스프라이트) / 하(섹션 1열)
    const W = Math.min(1180, L.lw - 24); const H = Math.min(720, L.lh - 24);
    const m = new Modal(scene, { title: heroPlainName(hh), w: W, h: H, buttons, footer: true });
    // 표·섹션 영역은 하단 고정 버튼 바(footerY) 위까지만
    const bodyH = m.footerY - (m.panel.bodyY + 12) - 8;
    heroStatusBody(scene, m.inner, hh, { x: 24, y: 0, w: W - 48, h: bodyH, wide: W >= 760 || L.short }); // 가로 폰(667 포함)은 좌우 배치(세로 쌓기면 스크롤 영역이 28px)
    return m;
}

export function heroStatusBody(scene, tgt, hh, { x: ix, y: iy = 0, w: iw, h: bodyH, wide: wideM }) {
    const skills = (hh.detail?.skills ?? []).filter((k) => k && k.name);
    const tl = hh.troop_label ?? hh.detail?.troop_label;
    const ut = hh.unit_type ?? hh.detail?.unit_type;
    const aura = hh.aura ?? hh.detail?.aura;
    const st = hh.detail?.stats;
    const eqT = hh.equip_total;
    // 역사 프로필(서버 미제공 시 섹션 숨김): profile{era,region,role,summary,evidence_level,needs_verify} — BE 요청 필드
    const pf = hh.profile ?? hh.detail?.profile ?? null;
    // 비주얼 영역
    // 가로 폰(L.short, 와이드): 왼쪽 열 = 초상 + 스프라이트 상자를 본문 높이 안에 나눠 담는다(상자 = 본문 40% 최대 110, 초상 = 나머지, 폭 = 높이/1.3)
    const sbH0 = wideM && L.short ? Math.min(110, Math.round(bodyH * 0.4)) : 0;
    const pw = wideM ? (L.short ? Math.max(90, Math.min(280, Math.floor(iw * 0.28), Math.round((bodyH - sbH0 - 8) / 1.3))) : Math.min(280, Math.floor(iw * 0.28))) : Math.min(150, Math.floor(iw * 0.42));
    const phh = wideM ? (L.short ? Math.max(80, bodyH - sbH0 - 8) : Math.min(Math.round(pw * 1.3), bodyH - 140)) : Math.round(pw * 1.25);
    tgt.add(sCard(scene, hh, ix, iy, pw, phh, (x0, y0, sl) => portraitBox(scene, hh, x0, y0, pw, phh, { focus: 0.02, thumb: false, bare: sl }))); // 상세: 원본(S 등급 = 배경 판 -> 인물 -> 등급 프레임 -> 장식)
    const rTag = heroRarityTag(scene, hh.rarity, ix + 8, iy + 6, { size: 14, heading: true, color: rarityCss(hh.rarity), stroke: { color: '#0B1020', width: 3 } });
    tgt.add(rTag);
    // 병종 뱃지(초상화 우상단). 좁은 초상(390 등)에서 등급 별과 겹치면 세로로 쌓고, 그래도 겹치면 별 줄 아래로 내린다(강화면 Low: 별 4개가 3개로 가려 보임)
    if (ut) {
        // 등급 표식 실제 폭: 컨테이너(rarityMark)는 width 가 0 이라 겹침 판정이 빠져 별 4번째가 병종 뱃지에 가렸다(강화면 gacha41 Low, 390) -> getBounds 우선
        const rbx = rTag.getBounds?.(); const rw = (rbx?.width || 0) > 0 ? rbx.width : (rTag.w ?? rTag.displayWidth ?? rTag.width ?? 0); const rh = (rbx?.height || 0) > 0 ? rbx.height : (rTag.h ?? rTag.displayHeight ?? rTag.height ?? 18);
        const mk = (vertical) => troopBadges(scene, { heroClass: ut, troopClass: hh.troop_type ?? hh.detail?.troop_type, troopLabel: tl, size: wideM ? 34 : 26, vertical });
        let tb = mk(false);
        if (ix + 8 + rw + 6 > ix + pw - 6 - tb.w) { tb.destroy(); tb = mk(true); }
        const below = ix + 8 + rw + 6 > ix + pw - 6 - tb.w;
        tb.setPosition(ix + pw - 6 - tb.w, below ? iy + 6 + rh + 4 : iy + 6);
        tgt.add(tb);
    }
    const sbW = wideM ? pw : Math.min(120, iw - pw - 12); const sbH = wideM ? Math.min(128, bodyH - phh - 8) : phh;
    const sbx = wideM ? ix : ix + pw + 12; const sby = iy + (wideM ? phh + 8 : 0);
    if (sbW >= 60 && sbH >= 60) {
        tgt.add(heroSectionBg(scene, sbx, sby, sbW, sbH, 0.7));
        // 2026-11-03 사용자 요청: 영웅 유닛 오른쪽에 일반 병사(troop_type) 스프라이트를 나란히.
        // 2026-11-08 사용자 요청: 아래 캡션('전투 유닛 · <병종>' / '병사 · <병종>') 제거 -> 캡션 자리 없이 칸 세로 가운데에 배치
        const trT = troopTypeOf(hh);
        const spS = trT ? Math.max(24, Math.min(Math.floor(sbW * 0.44), sbH - 24)) : Math.min(sbW, sbH) - 24;
        const spY = sby + sbH / 2;
        const hx = trT ? sbx + sbW * 0.3 : sbx + sbW / 2; const qx = sbx + sbW * 0.72;
        const shadow = (x) => tgt.add(scene.add.ellipse(x, spY + spS / 2 - 4, Math.min(44, spS * 0.7), 10, 0x000000, 0.35));
        // 영웅 스프라이트: 전용 시트가 아직 안 왔는데 같은 문화권·병종 공용 시트가 이미 로드돼 있으면(병사 스프라이트·다른 화면이 받음) unitTex 가 공용을 돌려준다.
        // 그래서 항상 전용 시트 지연 로드를 먼저 요청하고(받을 것이 있으면 true), 도착하면 공용으로 그린 것을 전용으로 바꿔 그린다(사용자 제보 2026-11-03: 마르쿠스가 공용 보병으로 표시)
        let heroObjs = [];
        const putSp = () => { const sp = heroSprite(scene, hh, hx, spY, spS); if (!sp) return false; heroObjs.forEach((o) => o.destroy()); const sh = scene.add.ellipse(hx, spY + spS / 2 - 4, Math.min(44, spS * 0.7), 10, 0x000000, 0.35); tgt.add([sh, sp]); heroObjs = [sh, sp]; return true; };
        const drawn = putSp();
        const wait = drawn ? null : makeText(scene, hx, spY, trT ? '준비 중' : '스프라이트 준비 중', { size: 12, color: CSS.muted, origin: [0.5, 0.5] });
        if (wait) tgt.add(wait);
        ensureHeroSprite(scene, hh, () => { if (!tgt.scene) return; if (putSp()) wait?.destroy(); }); // 이 영웅 시트 1장만 지연 로드(전용 > 문화권 > 공용 중 manifest 의 첫 후보)
        if (trT) {
            // 병사도 영웅 칸과 같은 방식(강화면 gacha41 Low): 공용 시트가 이미 있으면 먼저 그리고, 문화권 시트(korea_sword 등)를 항상 요청해 도착하면 교체
            let trObjs = [];
            const putTr = () => { const sp = troopSprite(scene, hh, qx, spY, Math.round(spS * 0.86)); if (!sp) return false; trObjs.forEach((o) => o.destroy()); const sh = scene.add.ellipse(qx, spY + spS / 2 - 4, Math.min(44, spS * 0.7), 10, 0x000000, 0.35); tgt.add([sh, sp]); trObjs = [sh, sp]; return true; }; // 병사는 영웅보다 조금 작게
            const trDrawn = putTr();
            const w2 = trDrawn ? null : makeText(scene, qx, spY, '준비 중', { size: 12, color: CSS.muted, origin: [0.5, 0.5] });
            if (w2) tgt.add(w2);
            const trLoading = ensureTroopSprite(scene, hh, () => { if (!tgt.scene) return; if (putTr()) w2?.destroy(); });
            if (!trLoading && w2) { w2.destroy(); tgt.add(troopIcon(scene, trT, qx, spY, Math.min(32, spS), { max: spS })); } // 받을 시트도 없고 그린 것도 없으면 병종 아이콘(단일 소스)
        }
    }
    // 정보 영역(스크롤) — 섹션 카드
    const tx = wideM ? ix + pw + 16 : ix; const ty0 = wideM ? 0 : phh + 12;
    const tw = wideM ? iw - pw - 16 : iw; const th = bodyH - ty0 - 8; // 하단 버튼 바와 8 간격(U01 겹침)
    const list = new ScrollList(scene, { x: tx, y: iy + ty0, w: tw, h: Math.max(80, th), clip: true, bar: true }); // U01: 스크롤바 + 하단 페이드(스킬 표 등 아래 내용 단서) // clip: 경계에 걸친 섹션 카드가 모달 밖·초상화 위로 비치지 않게 픽셀 클리핑(Mid-1)
    tgt.add(list);
    const gap = 10;
    // 섹션 카드: 배경 + 제목(18) + 본문 컨테이너. build(c, innerW) 가 본문 높이를 반환
    const section = (title, w, build, chipText, chipColor) => {
        const c = scene.add.container(0, 0);
        const body = scene.add.container(12, 40);
        const t = makeText(scene, 12, 20, title, { size: 18, heading: true, color: '#f0d58c', origin: [0, 0.5] });
        const bh = build(body, w - 24);
        c.add(heroSectionBg(scene, 0, 0, w, bh + 52, 0.8));
        c.add(t);
        if (chipText) { const ct = makeText(scene, w - 14, 20, chipText, { size: 12, bold: true, origin: [1, 0.5] }); c.add(scene.add.rectangle(ct.x - ct.width - 6, 10, ct.width + 12, 20, chipColor ?? COLOR.ink, 0.9).setOrigin(0)); c.add(ct); }
        c.add(body);
        c.h = bh + 52; c.clipH = c.h;
        return c;
    };
    const kv = (pairs) => (c, w) => { const tb = kvTable(scene, { w, pairs, labelW: Math.min(110, Math.round(w * 0.36)), size: 14 }); c.add(tb); return tb.h; };
    const cols = wideM && tw >= 640 ? 2 : 1;
    const colW = Math.floor((tw - gap * (cols - 1)) / cols);
    const small = [
        ['기본 정보', kv([
            ...(hh.title ? [['칭호', { text: hh.title, color: CSS.accent, bold: true }]] : []),
            ['등급', { text: `${rarityLabel(hh.rarity)} ${'★'.repeat(RARITY_STARS[normRarity(hh.rarity)] ?? 1)}`, color: rarityCss(hh.rarity) }], // 'S등급 ★★★★'(S 중복 제거, 2026-11-08 강화면 Low)
            // 레벨 곡선 v2(2026-11-14): 'Lv.N / 만렙 M'(level_info.max_level), 만렙이면 EXP 대신 '만렙'(exp_to_next=0)
            ['레벨', isMaxLevel(hh) ? { text: heroLevelText(hh), color: CSS.accent, bold: true } : `${heroLevelText(hh)}  (EXP ${fmtNum(hh.exp)}${(() => { const need = heroExpToNext(hh); return need > 0 ? ` / 다음까지 ${fmtNum(Math.max(0, need - (Number(hh.exp) || 0)))}` : ''; })() /* exp_to_next = 현재 레벨 필요 총량, exp = 레벨 안 누적 -> 남은 양 = 총량 - 현재 */})`],
            ...(() => { // 부대 편성 수(rules.troop_slots_by_rarity, 등급별 4번째 해금 S22/A18/B16/C14). 다음 해금이 있으면 잠김 안내
                const ts = troopSlotInfo(hh); if (!ts) return [];
                return [['부대', ts.next ? { text: `${ts.troops}개 편성 · Lv.${ts.next.level}에 ${ts.next.troops}번째 해금(잠김)`, color: CSS.muted } : { text: `${ts.troops}개 편성 (최대)`, color: CSS.allyText }]];
            })(),
            ...(hh.level_info?.next_reward?.label && hh.level_info.next_reward.level != null ? [['다음 레벨 보상', { text: `Lv.${hh.level_info.next_reward.level} ${hh.level_info.next_reward.label}`, color: CSS.accent }]] : []), // 박백엔 level_info.next_reward(없으면 생략)
            // 코스트·성급·조각 줄은 2026-11-08 사용자 요청으로 제거(코스트는 편성 화면, 조각은 가챠 결과에서 표시)
        ])],
        ['능력치', st ? (c, w) => { // 공격·방어 = 라벨 + 게이지 + 숫자(사용자 2026-11-04: 영웅 체력은 고정 10이라 능력치에서 제외. 장비 체력(병력) 보너스는 장비창·장비 칩에서만)(ui/StatGauges, 상한 STAT_GAUGE_CAP, 장비분 금색 + '(+N)'), 그 아래 성장률·기준은 표
            const sn = hh.level_info?.stats_now; // 현재 레벨 능력치(서버 level_info.stats_now). 있으면 게이지를 현재 값으로, 없으면 Lv.1 기본값
            const gs = statGauges(scene, { w, rows: [...((sn?.mp_max ?? st.mp_max) != null ? [{ key: 'mp', label: '마력', base: sn?.mp_max ?? st.mp_max }] : []), { key: 'atk', label: '공격', base: sn?.atk ?? st.atk, bonus: eqT?.atk }, { key: 'def', label: '방어', base: sn?.def ?? st.def, bonus: eqT?.def }] });
            c.add(gs);
            const tb = kvTable(scene, { y: gs.h + 4, w, labelW: Math.min(110, Math.round(w * 0.36)), size: 14, pairs: [
            ...(st.growth_atk_pct != null || st.growth_def_pct != null ? [['성장률', [st.growth_atk_pct != null ? `공격 ${st.growth_atk_pct}%` : '', st.growth_def_pct != null ? `방어 ${st.growth_def_pct}%` : ''].filter(Boolean).join(' · ')]] : []), // 값 없으면 'undefined' 대신 생략(정검수)
            ...(() => { const mx = isMaxLevel(hh) ? null : heroMaxStats(hh); return mx ? [['만렙 예상', { text: `Lv.${mx.level} 공격 ${mx.atk} · 방어 ${mx.def} (장비 제외)`, color: CSS.accent }]] : []; })(), // 서버 미제공 -> ArmyBuilder::scale 과 같은 식으로 계산(ui/heroLevel.heroMaxStats)
            ['기준', { text: sn ? `현재 Lv.${hh.level ?? 1} 능력치 (괄호·금색 = 장비)` : `Lv.1 기본값 · 현재 Lv.${hh.level ?? 1}은 성장률만큼 더 높음 (괄호·금색 = 장비)`, color: CSS.muted, size: 12 }], // 하플레이 gacha104: Lv2 인데 Lv.1 수치로 읽힘(서버가 레벨별 수치를 주지 않아 표기만 명확히)
            ] });
            c.add(tb);
            return gs.h + 4 + tb.h;
        } : kv([['능력치', { text: '정보 없음', color: CSS.muted }]])],
        ...(Array.isArray(hh.level_info?.milestones) && hh.level_info.milestones.length ? [['성장 보상', (c, w) => { // 레벨 마일스톤(level_info.milestones[{level,label,reached}]): 도달 = 녹색 체크, 미도달 = 회색 원
            const rh = 24; let yy = 0;
            hh.level_info.milestones.forEach((m) => {
                const cy = yy + rh / 2; const g = scene.add.graphics();
                if (m.reached) g.fillStyle(0x3fae5a, 1).fillCircle(8, cy, 7).lineStyle(2, 0xffffff, 1).lineBetween(4.5, cy, 7, cy + 3).lineBetween(7, cy + 3, 12, cy - 3);
                else g.lineStyle(1.5, 0x8a93a6, 1).strokeCircle(8, cy, 6.5);
                c.add(g);
                c.add(makeText(scene, 22, cy, `Lv.${m.level}`, { size: 13, bold: true, color: m.reached ? CSS.allyText : CSS.muted, origin: [0, 0.5] }));
                c.add(fitText(makeText(scene, 76, cy, m.label ?? '', { size: 13, color: m.reached ? CSS.text : CSS.muted, origin: [0, 0.5] }), Math.max(40, w - 76)));
                yy += rh;
            });
            return yy;
        }]] : []),
        // '병종' 섹션(영웅 병종·병사 표)은 2026-11-08 사용자 요청으로 제거(병종은 초상화 우상단 뱃지·툴팁으로 표시). 같은 카드에 있던 오라 행은 병종 정보가 아니라 별도 섹션으로 유지
        ...(aura ? [['오라', kv([['오라', { text: auraDesc(aura), color: CSS.accent }]])]] : []),
        ['장비', (c, w) => {
            const eq = hh.equipment ?? {};
            const tb = kvTable(scene, { w, labelW: Math.min(110, Math.round(w * 0.36)), pairs: Object.entries(SLOT_KO).map(([k, lb]) => [lb, eq[k] ? { text: `${rarityBadge(eq[k].rarity)} ${eq[k].name}`, color: rarityCss(eq[k].rarity) } : { text: '비어 있음', color: CSS.muted }]) });
            c.add(tb);
            return tb.h;
        }],
    ];
    let y = 0;
    for (let i = 0; i < small.length; i += cols) {
        const row = small.slice(i, i + cols).map(([t, b], j) => { const c = section(t, colW, b); c.setPosition(j * (colW + gap), y); return c; });
        row.forEach((c) => list.content.add(c));
        y += Math.max(...row.map((c) => c.h)) + gap;
    }
    // 스킬 표: 구분 칩 · 스킬명 · 효과 요약 · 조건/쿨다운 · 횟수 (준비 중 = 회색 행)
    if (skills.length) {
        const narrowT = tw < 560;
        const c = section(`스킬 (${skills.length})`, tw, (b, w) => {
            const typeKo = (k) => (k.type === 'active' ? '액티브' : k.type === 'passive' ? '패시브' : k.type ?? '-');
            const chipC = (k) => (k.type === 'active' ? 0x8a4a1c : 0x2f5d8a);
            // 좁은 표(390·667): 액티브 쿨다운·횟수 줄(강화면 gacha106: 넓은 표의 '조건 / 쿨다운'·'횟수' 열 내용이 좁은 표에서 빠짐). 값 없으면 생략
            const actLine = (k) => (k.type === 'active' ? (k.mp_cost != null ? `마력 ${k.mp_cost}` : [k.cooldown != null ? `쿨 ${k.cooldown}턴` : '', k.uses != null ? `${k.uses}회` : ''].filter(Boolean).join(' · ')) : ''); // MP 방식(mp_cost 있음) = '마력 N', 레거시 = 쿨·횟수
            const condOf = (k) => [k.condition, k.mp_cost != null ? `마력 ${k.mp_cost}` : k.cooldown != null ? `쿨 ${k.cooldown}턴` : ''].filter(Boolean).join(' · ') || '-'; // MP 방식은 쿨다운 대신 마력
            // T_TERRAIN_MASTER(지형 장인): 서버 효과 요약에 이동비용 할인 문구가 없으면 덧붙인다(params.move_discount.amount, 상세 응답에 params 가 없으면 데이터 기준 1)
            const effOf = (k) => { const e0 = k.effect || ''; if (k.template !== 'T_TERRAIN_MASTER' || /이동/.test(e0)) return e0 || '-'; const amt = Number(k.params?.move_discount?.amount ?? 1) || 1; return `${e0 ? `${e0} · ` : ''}해당 지형 이동 비용 -${amt}(최소 1)`; };
            // 스킬 아이콘 열(48, atlas skill_icons 지연 로드 — manifest 에 있을 때만 열 추가). 로드 전에는 칸만 두고 완료 시 아이콘을 얹는다. 해석 실패 행은 비움(빈 사각 없음)
            const withIco = skillIconsListed();
            const icoCol = withIco ? [{ label: '', width: 56, align: 'center' }] : [];
            const icoCell = withIco ? [''] : [];
            const colsT = narrowT
                ? [...icoCol, { label: '구분', width: 64, align: 'center' }, { label: '스킬 · 효과', ratio: 1, wrap: true }]
                : [...icoCol, { label: '구분', width: 70, align: 'center' }, { label: '스킬명', ratio: 1.1 }, { label: '효과 요약', ratio: 2, wrap: true }, { label: skills.some((k) => k.mp_cost != null) ? '조건 / 마력' : '조건 / 쿨다운', ratio: 1.3, wrap: true }, { label: '횟수', width: 52, align: 'center' }];
            const rows = skills.map((k) => ({ muted: k.enabled === false, cells: narrowT
                ? [...icoCell, { text: typeKo(k), chip: chipC(k), size: 12, bold: true }, `${skillDisplayName(k.name)}${k.enabled === false ? ' (준비 중)' : ''}\n${effOf(k)}${k.condition ?`\n조건: ${k.condition}` : ''}${actLine(k) ? `\n${actLine(k)}` : ''}`]
                : [...icoCell, { text: typeKo(k), chip: chipC(k), size: 12, bold: true }, { text: `${skillDisplayName(k.name)}${k.enabled === false ? ' (준비 중)' : ''}`, bold: true }, effOf(k), condOf(k), k.mp_cost == null && k.uses != null ? `${k.uses}회` : '-'] }));
            const tb = new TableView(scene, { w, cols: colsT, rows, rowH: withIco ? 56 : 38, size: 14 });
            b.add(tb);
            if (withIco) {
                const put = () => {
                    if (!tb.scene) return; // 모달이 닫혀 표가 파괴됨
                    const col = tb.colBoxes[0];
                    skills.forEach((k, i) => {
                        const rb = tb.rowBoxes[i];
                        const f = rb && skillIconFrame(scene, k.code, { kind: k.type === 'active' ? 'active' : k.type === 'aura' ? 'aura' : 'passive', unitType: ut, template: k.template });
                        const ic = f ? skillIconImage(scene, f, col.x + col.w / 2, rb.y + Math.min(rb.h, 56) / 2, 48) : null;
                        if (ic) { if (k.enabled === false) ic.setAlpha(0.45); tb.add(ic); }
                    });
                };
                if (skillIconsReady(scene)) put(); else ensureSkillIcons(scene, (ok) => { if (ok) put(); });
            }
            return tb.h;
        });
        c.setPosition(0, y); list.content.add(c); y += c.h + gap;
    }
    // 역사적 설명(BE GameData::heroProfile, 스펙 database/data/HERO_HISTORY_SPEC.md): one_line 헤더 · 시대/지역/역할/생애 표 · 요약 박스(좁은 화면 긴 글 '더 보기')
    // · 전투 스타일 · 일화(있을 때만, 전승/검증 필요 태그) · 인연(최대 3 + 외 N명) · game_note. 필드 없으면 해당 블록 숨김, 전부 없으면 섹션 숨김(근거 없는 창작 금지)
    const hasHist = pf && (pf.summary || pf.era || pf.region || pf.role || pf.one_line || pf.life || pf.battle_style || pf.anecdote?.text || pf.relations?.length);
    const histY = y;
    let histC = null; let noteT = null; let sumOpen = false;
    const renderTail = () => {
        histC?.destroy(); noteT?.destroy(); histC = null;
        let yy0 = histY;
        if (hasHist) { histC = heroHistorySection(scene, pf, tw, section, { open: sumOpen, onToggle: () => { sumOpen = !sumOpen; scene.time.delayedCall(0, () => { if (!list.scene) return; const keep = list.content.y; renderTail(); list.scrollTo(Math.max(keep, -histY)); }); } }); /* 펼침/접기 후 스크롤 보정: 이전 위치 유지하되 역사 섹션 머리(소개 줄)가 위 경계 밖으로 나가지 않게(강화면 18차 390) */ histC.setPosition(0, yy0); list.content.add(histC); yy0 += histC.h + gap; }
        // 등급 면책 문구는 화면 정리로 제거(2026-11-02, docs/PRE_RELEASE_NOTICES.md 에 보존)
        list.setContentHeight(yy0 + 8);
        list.refreshMask();
    };
    renderTail();
}

export function heroHistorySection(scene, pf, tw, section, { open = false, onToggle = null } = {}) {
    // 근거 수준·전승·검증 필요·game_note 표기는 렌더하지 않는다(사용자 방침 2026-11-03, 데이터 필드는 유지)
    const REL_KO = { ally: '동맹', rival: '라이벌', mentor: '스승·제자', kin: '혈연', lord_vassal: '군신', same_event: '같은 사건', lineage: '계보' };
    const SUM_CUT = 110; // 좁은 화면(390px 등)에서 이보다 긴 요약은 접어 둔다
    // 접기 사용 안 함(2026-11-03 강화면 17~19차: 390 상세에서 '더 보기'가 반영되지 않는 결함 반복). 상세 본문은 이미 스크롤 목록이라 요약 전문을 항상 그대로 보여 준다.
    // 되돌리려면 아래를 tw < 560 && 길이 > SUM_CUT + 10 으로(렌더·토글 코드는 남겨 둠)
    const fold = false && tw < 560 && String(pf.summary ?? '').length > SUM_CUT + 10;
    // 정렬 규칙(2026-11-03 사용자 요청 '정렬이 안 맞고 지저분함'): 모든 소제목·본문 왼쪽 x=0 정렬, 문단은 같은 글자 크기(14)·줄 간격(4)·문단 간격(GAP).
    // 긴 글(요약·전투 스타일·일화)은 같은 '인용' 모양(왼쪽 금색 세로줄 + 들여쓰기 IND) 하나로 통일. 라벨-값 항목(시대·지역·역할·생애, 인연)은 같은 폭의 표(kvTable)로 정렬
    return section('역사적 설명', tw, (b, w) => {
        const GAP = 14; const IND = 14; const LS = 4;
        const labelW = Math.min(110, Math.round(w * 0.36)); // 영웅 상세 다른 표(기본 정보 등)와 같은 라벨 폭
        let yy = 0;
        const gap = () => { if (yy > 0) yy += GAP; };
        const sub = (txt) => { gap(); const t = makeText(scene, 0, yy, txt, { size: 13, bold: true, color: '#d9c08a' }); b.add(t); yy += t.height + 6; };
        const para = (txt, { quote = true } = {}) => {
            const x = quote ? IND : 0;
            const t = makeText(scene, x, yy, txt, { size: 14, wrap: w - x - 4 }).setLineSpacing(LS);
            if (quote) b.add(scene.add.rectangle(0, yy + 1, 3, Math.max(8, t.height - 2), COLOR.accent, 0.55).setOrigin(0));
            b.add(t); yy += t.height;
            return t;
        };
        if (pf.one_line) { const t = makeText(scene, 0, yy, pf.one_line, { size: 16, bold: true, color: '#f0d58c', wrap: w - 4 }).setLineSpacing(LS); b.add(t); yy += t.height; }
        const facts = [pf.era && ['시대', pf.era], pf.region && ['지역', pf.region], pf.role && ['역할', pf.role], pf.life && ['생애', pf.life]].filter(Boolean);
        if (facts.length) { gap(); const tb = kvTable(scene, { y: yy, w, labelW, size: 14, pairs: facts }); b.add(tb); yy += tb.h; }
        if (pf.summary) {
            const s = String(pf.summary);
            sub('요약');
            para(fold && !open ? `${[...s].slice(0, SUM_CUT).join('').trimEnd()}…` : s);
            // 영웅 상세는 모달 안: modal:true 가 없으면 modalCount>0 이라 usable() 가 거짓(클릭 무반응)
            if (fold && onToggle) { yy += 8; b.add(new Button(scene, { x: w - 100, y: yy, w: 100, h: 32, label: open ? '접기' : '더 보기', size: 13, modal: true, onClick: onToggle })); yy += 32; }
        }
        if (pf.battle_style) { sub('전투 스타일'); para(pf.battle_style); }
        if (pf.anecdote?.text) { sub('일화'); para(pf.anecdote.text); }
        const rel = (Array.isArray(pf.relations) ? pf.relations : []).filter((r) => r?.name_ko);
        if (rel.length) {
            sub('인연');
            const tb = kvTable(scene, { y: yy, w, labelW, size: 14, pairs: rel.slice(0, 3).map((r) => [r.name_ko, `${REL_KO[r.type] ?? r.type ?? '관계'}${r.note ? ` — ${r.note}` : ''}`]) });
            b.add(tb); yy += tb.h;
            if (rel.length > 3) { const t = makeText(scene, 0, yy + 4, `외 ${rel.length - 3}명`, { size: 13, color: CSS.muted }); b.add(t); yy += t.height + 4; }
        }
        return Math.max(0, yy + 4);
    }, '', COLOR.ink);
}
