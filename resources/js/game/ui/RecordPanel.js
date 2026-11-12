import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { makeText, fitText } from './common.js';
import { ScrollList, emptyState } from './widgets.js';
import { COLOR, CSS } from '../theme.js';
import { L } from '../layout.js';
import { gameApi } from '../api/gameApi.js';
import { messageOf } from '../api/errors.js';

// 내 PvP 전적(GET /api/me/record, docs/PVP_RECORD_SPEC.md §1): 요약(승/패/무·승률·최근 10전 칩) + 목록(최신순, '더 보기' 페이지).
// 게스트는 서버가 guest:true + 빈 목록을 준다 -> '정식 계정에서 전적이 기록됩니다' 안내. 상대는 표시명만(빈 문자열 = 탈퇴 계정)
const PER_PAGE = 20;
const RES = {
    win: { label: '승', fill: COLOR.ally, css: CSS.allyText },
    loss: { label: '패', fill: COLOR.danger, css: CSS.dangerText },
    draw: { label: '무', fill: COLOR.muted, css: CSS.muted },
};
const REASON = { forfeit_left: '포기', forfeit_disconnect: '접속 끊김', forfeit_timeout: '시간 초과' };
const pct = (v) => (v == null || !Number.isFinite(Number(v)) ? '-' : `${Math.round(Number(v) * 1000) / 10}%`);
const two = (n) => String(n).padStart(2, '0');
function when(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}.` : '';
    return `${y}${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
// 사유 라벨: 포기류만. 패배 + 포기류 = 내가 포기(forfeit_by_me), 승리 + 포기류 = 상대 포기, 무승부는 접두어 없음
function reasonLabel(r) {
    const base = REASON[r.reason];
    if (!base) return null;
    if (r.result === 'draw') return base;
    return `${r.forfeit_by_me ? '내' : '상대'} ${base}`;
}

export function openRecord(scene) {
    const mw = Math.min(760, L.lw - 24); const mh = Math.min(720, L.lh - 24);
    const m = new Modal(scene, { title: '내 전적', w: mw, h: mh, buttons: [{ label: '닫기' }], footer: true });
    const W = mw - 48;
    const bodyH = m.footerY - (m.panel.bodyY + 12) - 8;
    const alive = () => !!m.scene && m.active !== false;
    const status = makeText(scene, 24, 8, '불러오는 중…', { size: 15, color: CSS.muted });
    m.inner.add(status);
    let records = []; let pg = { page: 0, last_page: 1 }; let list = null; let busy = false; let summaryBuilt = false;

    const buildSummary = (d) => {
        const s = d.summary ?? {};
        const c = scene.add.container(24, 0);
        c.add(makeText(scene, 0, 0, `${s.wins ?? 0}승 ${s.losses ?? 0}패 ${s.draws ?? 0}무`, { size: 22, bold: true, color: CSS.text }));
        c.add(makeText(scene, W, 2, `승률 ${pct(s.win_rate_decided)}`, { size: 18, bold: true, color: CSS.accent, origin: [1, 0] }));
        c.add(fitText(makeText(scene, W, 26, `무승부 포함 ${pct(s.win_rate)} · 총 ${s.total ?? 0}전`, { size: 12, color: CSS.muted, origin: [1, 0] }), W * 0.5));
        c.add(makeText(scene, 0, 44, '최근 10전', { size: 13, color: CSS.muted }));
        const recent = Array.isArray(s.recent10) ? s.recent10.slice(0, 10) : [];
        const lx = 72; const cs = Math.max(20, Math.min(30, Math.floor((W - lx) / 10) - 4));
        if (!recent.length) c.add(makeText(scene, lx, 44, '-', { size: 13, color: CSS.muted }));
        recent.forEach((r, i) => {
            const k = RES[r] ?? RES.draw;
            const x = lx + i * (cs + 4);
            c.add(scene.add.rectangle(x, 40, cs, cs, k.fill, 0.9).setOrigin(0).setStrokeStyle(1, 0x0b1020, 1));
            c.add(makeText(scene, x + cs / 2, 40 + cs / 2, k.label, { size: Math.round(cs * 0.5), bold: true, color: '#ffffff', origin: [0.5, 0.5] }));
        });
        m.inner.add(c);
        summaryBuilt = true;
        return 40 + cs + 14;
    };

    const rowH = 62; const gap = 6;
    const row = (r, y) => {
        const c = scene.add.container(0, y);
        const k = RES[r.result] ?? RES.draw;
        c.add(scene.add.rectangle(0, 0, W, rowH, COLOR.navyDeep, 0.85).setOrigin(0).setStrokeStyle(1, 0x2b3a66, 1));
        c.add(scene.add.rectangle(8, (rowH - 44) / 2, 44, 44, k.fill, 0.95).setOrigin(0));
        c.add(makeText(scene, 30, rowH / 2, k.label, { size: 22, bold: true, color: '#ffffff', origin: [0.5, 0.5] }));
        const rl = reasonLabel(r);
        let rw = 0;
        if (rl) {
            const t = makeText(scene, W - 10, 12, rl, { size: 12, bold: true, color: r.forfeit_by_me ? CSS.dangerText : CSS.muted, origin: [1, 0] });
            rw = t.width + 12;
            c.add(t);
        }
        const tx = 62;
        c.add(fitText(makeText(scene, tx, 10, `vs ${r.opponent_name || '(탈퇴한 상대)'}`, { size: 16, bold: true, color: CSS.text }), W - tx - 10 - rw));
        const sub = [r.map_name || '-', r.rounds != null ? `${r.rounds}라운드` : null, when(r.ended_at)].filter(Boolean).join(' · ');
        c.add(fitText(makeText(scene, tx, 36, sub, { size: 13, color: CSS.muted }), W - tx - 10));
        return c;
    };

    const renderList = (top) => {
        if (!list) {
            list = new ScrollList(scene, { x: 24, y: top, w: W, h: Math.max(120, bodyH - top), clip: true, bar: true });
            m.inner.add(list);
        }
        const keepY = list.content.y;
        list.content.removeAll(true);
        records.forEach((r, i) => list.content.add(row(r, i * (rowH + gap))));
        let h = records.length * (rowH + gap);
        if (pg.page < pg.last_page) {
            const b = new Button(scene, { x: 0, y: h + 4, w: W, h: 48, label: busy ? '불러오는 중…' : '더 보기', size: 15, modal: true, onClick: () => { if (!busy) load(pg.page + 1); } });
            list.content.add(b);
            h += 60;
        }
        list.setContentHeight(h);
        list.scrollTo(keepY);
        list.refreshMask();
    };

    const showEmpty = (top, msg, sub) => {
        m.inner.add(emptyState(scene, { x: 24, y: top + 8, w: W, msg, sub }));
    };

    let listTop = 0;
    const load = async (page) => {
        busy = true;
        if (list) renderList(listTop);
        try {
            const d = await gameApi.me.record({ page, perPage: PER_PAGE });
            if (!alive()) return;
            status.setVisible(false);
            if (!summaryBuilt) listTop = buildSummary(d);
            if (d.guest) { showEmpty(listTop, '정식 계정에서 전적이 기록됩니다', '게스트로 치른 PvP 대전은 전적에 표시되지 않습니다. 계정을 만들면 이후 대전부터 기록됩니다.'); return; }
            const got = Array.isArray(d.records) ? d.records : [];
            pg = { page: Number(d.page?.page) || page, last_page: Number(d.page?.last_page) || page };
            const seen = new Set(records.map((r) => r.battle_id));
            records = records.concat(got.filter((r) => !seen.has(r.battle_id))); // 페이지 사이 새 전적이 끼어도 중복 표시 안 함
            if (!records.length) { showEmpty(listTop, '아직 PvP 전적이 없습니다', '멀티 탭에서 PvP 방을 만들거나 참가해 보세요.'); return; }
            busy = false;
            renderList(listTop);
        } catch (e) {
            if (!alive()) return;
            busy = false;
            if (!records.length) status.setText(`전적을 불러오지 못했습니다. ${messageOf(e)}`).setColor(CSS.dangerText).setWordWrapWidth(W, true).setVisible(true);
            else renderList(listTop);
        } finally { busy = false; }
    };
    load(1);
    return m;
}
