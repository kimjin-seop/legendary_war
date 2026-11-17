// 랭크 대전 탭(멀티 그룹 서브 탭 'rank', 2026-11-03 골격). API = gameApi.rank(RankController).
// 구성: 내 랭크(시즌·레이팅·티어·전적) / 큐(찾기 -> 대기(경과·허용 범위·남은 시간, 2초 폴링) -> 매칭 완료(상대·입장)) / 시즌 랭킹 목록
// 상태별 UI: 불러오는 중 / 게스트·정지(403) 안내 / 오류(다시 시도) / 빈 랭킹
// 매칭 후 진입: 서버 status.matched 의 room_code 로 대기실(Room 씬) 진입 — 박백엔 진입 방식 정리 후 확정(현재 가정)
import { Button } from '../ui/Button.js';
import { makeText, fitText } from '../ui/common.js';
import { ScrollList, noteText, emptyState, listRow } from '../ui/widgets.js';
import { showToast } from '../ui/Toast.js';
import { COLOR, CSS } from '../theme.js';
import { gameApi } from '../api/gameApi.js';
import { messageOf } from '../api/errors.js';
import { pixelImage, rankTier } from '../ui/PixelBadge.js';
import { watchRealtime } from '../api/realtime.js';
import { session } from '../api/client.js';

const POLL_MS = 2000;
const WS_RANK_POLL_MS = 10000;
const mmss = (sec) => { const s = Math.max(0, Math.floor(Number(sec) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const record = (e) => `${e?.wins ?? 0}승 ${e?.losses ?? 0}패${e?.draws ? ` ${e.draws}무` : ''}`;
const dateKo = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : ''; };

export async function tabRank(scene, p) {
    const a = scene.area;
    scene.done();
    const alive = () => !!p.scene && scene.tab === 'rank';
    const meBox = scene.add.container(a.x, a.y); p.add(meBox);
    const qBox = scene.add.container(a.x, a.y + 96); p.add(qBox);
    const listTop = a.y + 96 + 64;
    const list = new ScrollList(scene, { x: a.x, y: listTop, w: a.w, h: a.y + a.h - listTop, clip: true, bar: true });
    p.add(list);
    let poll = null;
    let rt = null;
    const stopPoll = () => { poll?.remove(false); poll = null; };
    p.once('destroy', () => { stopPoll(); rt?.leave(); });

    // ---- 내 랭크 ----
    const drawMe = (d) => {
        meBox.removeAll(true);
        const g = scene.add.graphics().fillStyle(COLOR.ink, 0.55).fillRoundedRect(0, 0, a.w, 86, 10).lineStyle(1, COLOR.accent, 0.4).strokeRoundedRect(0, 0, a.w, 86, 10);
        meBox.add(g);
        const me = d?.me ?? {}; const s = d?.season ?? null;
        const tier = rankTier(me);
        const badge = tier ? pixelImage(scene, `badge.rank.${tier}`, 44, 43, 48) : null;
        if (badge) meBox.add(badge); else meBox.add(makeText(scene, 44, 43, me.rank ? `${me.rank}위` : '-', { size: 18, bold: true, color: CSS.accent, origin: [0.5, 0.5] }));
        meBox.add(makeText(scene, 88, 14, s?.name ? `${s.name}${s.ends_at ? ` · ~${dateKo(s.ends_at)}` : ''}` : '랭크 대전', { size: 13, color: CSS.muted }));
        meBox.add(makeText(scene, 88, 34, `레이팅 ${me.rating ?? '-'}`, { size: 22, bold: true, color: '#f0d58c' }));
        meBox.add(fitText(makeText(scene, 88, 64, `${me.rank ? `${me.rank}위 · ` : '배치 전 · '}${record(me)}${me.peak_rating ? ` · 최고 ${me.peak_rating}` : ''}`, { size: 13, color: CSS.text }), a.w - 100));
    };
    // ---- 큐 ----
    const qBtn = (label, onClick, variant) => new Button(scene, { x: a.w - Math.min(220, a.w * 0.45), y: 6, w: Math.min(220, a.w * 0.45), h: 48, label, size: 16, variant, onClick });
    const drawQueue = (st) => {
        qBox.removeAll(true);
        const lw = a.w - Math.min(220, a.w * 0.45) - 12;
        const say = (t, color = CSS.text) => qBox.add(fitText(makeText(scene, 0, 30, t, { size: 14, color, origin: [0, 0.5], wrap: lw }), lw, { maxLines: 2 }));
        if (st?.state === 'queued') {
            say(`상대를 찾는 중 ${mmss(st.waited_seconds)}${st.range ? ` · 레이팅 ±${st.range}` : ''}${st.timeout_in != null ? ` · ${mmss(st.timeout_in)} 뒤 자동 취소` : ''}`, '#9fd8ff');
            qBox.add(qBtn('취소', () => act(() => gameApi.rank.cancel())));
            // 웹소켓 연결 중엔 안전망 간격(서버 stale 20초 미만 유지: 서버가 5초마다 매칭도 수행), 끊기면 2초로 복귀
            if (!poll) poll = scene.time.addEvent({ delay: rt?.live() ? WS_RANK_POLL_MS : POLL_MS, loop: true, callback: () => refreshQueue() });
        } else if (st?.state === 'matched') {
            stopPoll();
            say(`매칭 완료 · 상대 ${st.opponent?.name ?? '?'} (${st.opponent?.rating ?? '-'})${st.deploy_deadline_seconds ? ` · ${mmss(st.deploy_deadline_seconds)} 안에 배치` : ''}`, '#f0d58c');
            qBox.add(qBtn('입장', () => { if (st.room_code) scene.scene.start('Room', { code: st.room_code }); else showToast(scene, '입장 정보를 받지 못했습니다. 잠시 후 다시 시도해 주세요.'); }, 'primary'));
        } else {
            stopPoll();
            say(st?.timeout ? '대기 시간이 지나 자동 취소되었습니다. 다시 찾을 수 있습니다.' : '같은 실력대의 상대와 1:1 대전합니다.', st?.timeout ? CSS.dangerText : CSS.muted);
            qBox.add(qBtn('랭크전 찾기', () => act(() => gameApi.rank.enqueue()), 'primary'));
        }
    };
    let busy = false;
    const act = async (fn) => {
        if (busy) return; busy = true;
        try { const st = await fn(); if (alive()) drawQueue(st?.state ? st : await gameApi.rank.status()); }
        catch (e) {
            if (!alive()) return;
            if (e.code === 'already_matched' && e.details?.room_code) { drawQueue({ state: 'matched', room_code: e.details.room_code }); return; }
            showToast(scene, messageOf(e));
            refreshQueue();
        } finally { busy = false; }
    };
    const refreshQueue = async () => {
        if (!alive()) { stopPoll(); return; }
        try { const st = await gameApi.rank.status(); if (alive()) drawQueue(st); }
        catch (e) { if (alive()) { stopPoll(); qBox.removeAll(true); qBox.add(noteText(scene, 0, 8, e.code === 'rank_disabled' ? '랭크전은 준비 중입니다.' : messageOf(e), { kind: e.code === 'rank_disabled' ? 'info' : 'error', size: 13, wrap: a.w })); } }
    };
    // ---- 시즌 랭킹 ----
    const drawList = (d) => {
        list.content.removeAll(true);
        const rows = Array.isArray(d?.entries) ? d.entries : [];
        if (!rows.length) { list.content.add(emptyState(scene, { w: a.w, msg: '아직 랭킹 기록이 없습니다', sub: '이번 시즌 첫 랭크전을 치르면 순위에 오릅니다.' })); list.setContentHeight(200); return; }
        const h = 52; const gap = 6;
        rows.forEach((e, i) => {
            const r = listRow(scene, { x: 0, y: i * (h + gap), w: a.w - 8, h, selected: !!e.is_me });
            const tier = rankTier(e); const rb = tier ? pixelImage(scene, `badge.rank.${tier}`, 0, h / 2, 26) : null;
            r.add(makeText(scene, 14, h / 2, `${e.rank}위`, { size: 16, bold: true, color: e.rank <= 3 ? CSS.accent : CSS.text, origin: [0, 0.5] }));
            if (rb) { rb.setOrigin(0, 0.5).setX(64); r.add(rb); }
            r.add(fitText(makeText(scene, 98, h / 2, e.name ?? '-', { size: 15, bold: !!e.is_me, origin: [0, 0.5] }), a.w - 98 - 170));
            r.add(makeText(scene, a.w - 22, h / 2, `${e.rating} · ${record(e)}`, { size: 14, color: CSS.muted, origin: [1, 0.5] }));
            list.content.add(r);
        });
        list.setContentHeight(rows.length * (h + gap));
        list.refreshMask();
    };

    meBox.add(makeText(scene, 0, 30, '랭크 정보를 불러오는 중…', { size: 14, color: CSS.muted }));
    let me; let rk;
    try { [me, rk] = await Promise.all([gameApi.rank.me(), gameApi.rank.ranking()]); }
    catch (e) {
        if (!alive()) return;
        meBox.removeAll(true);
        const off = e.code === 'rank_disabled'; // 서버 rank.enabled=false(기본): 404 rank_disabled -> 준비 중 안내(재시도 없음)
        const gate = off || e.code === 'guest_not_allowed' || e.code === 'banned';
        const msg = off ? '랭크전은 준비 중입니다' : gate ? messageOf(e) : '랭크 정보를 불러오지 못했습니다';
        const sub = off ? '열리면 이 탭에서 바로 참여할 수 있습니다.' : gate ? (e.code === 'guest_not_allowed' ? '회원 가입 후 랭크 대전에 참여할 수 있습니다.' : '') : messageOf(e);
        p.add(emptyState(scene, { x: a.x, y: a.y + 40, w: a.w, msg, sub, cta: gate ? undefined : '다시 시도', onCta: gate ? undefined : () => scene.show('rank') }));
        list.setVisible(false);
        return;
    }
    if (!alive()) return;
    drawMe(me);
    drawList(rk);
    // 웹소켓 푸시(rank.matched, user.{id}) -> 즉시 재조회. 연결·끊김 전환 시 폴링 타이머를 새 간격으로 재설정
    const uid = session.user?.id;
    if (uid && session.kind === 'member') {
        const resync = () => { if (!alive()) return; stopPoll(); refreshQueue(); };
        rt = watchRealtime(`user.${uid}`, { events: { '.rank.matched': resync }, onLive: resync, onDown: resync });
    }
    refreshQueue();
}
