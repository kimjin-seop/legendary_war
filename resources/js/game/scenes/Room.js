import Phaser from 'phaser';
import { Panel } from '../ui/Panel.js';
import { Button } from '../ui/Button.js';
import { showToast } from '../ui/Toast.js';
import { makeText, addBackdrop } from '../ui/common.js';
import { noteText, alertModal, confirmModal, listRow } from '../ui/widgets.js';
import { CSS, syncView } from '../theme.js';
import { L, setupCamera, relayoutOnChange } from '../layout.js';
import { gameApi } from '../api/gameApi.js';
import { messageOf } from '../api/errors.js';
import { audio } from '../audio.js';
import { mountRoomChat, markRoomChatUnavailable } from '../ui/RoomChat.js';
import { sizePartyText } from '../ui/MapPicker.js';
import { watchRealtime, WS_SAFETY_POLL_MS } from '../api/realtime.js';

// 맵 code -> 이름(세션 캐시). 서버 room.map_name 미제공 대비: 모드별 /api/maps 목록을 1회 조회해 채운다(실패 시 code 표시 유지)
const mapNames = new Map();
// 모드별 목록 요청 promise. 진행 중인 요청에도 호출자마다 콜백을 걸어(씬 재생성·재렌더 경쟁) 도착 즉시 이름으로 다시 그린다(I-11).
// 실패 시 30초 뒤에만 재요청(폴링마다 재요청하지 않음). 한 모드 목록에 없으면 다른 모드 목록도 1회 조회
const mapListReq = new Map(); // mode -> {p: Promise, failedAt}
function loadMapList(m) {
    const cur = mapListReq.get(m);
    if (cur && !(cur.failedAt && Date.now() - cur.failedAt > 30000)) return cur.p;
    const ent = { p: null, failedAt: 0 };
    ent.p = gameApi.maps.list({ mode: m }).then((d) => { d.maps.forEach((x) => { if (x.code && x.name) mapNames.set(x.code, x.name); }); }).catch(() => { ent.failedAt = Date.now(); });
    mapListReq.set(m, ent);
    return ent.p;
}
// 반환: 이름 / undefined(조회 중 -> 화면은 '불러오는 중') / code(두 목록 모두 조회 끝났는데 없음·실패 -> code 폴백, 30초 뒤 재조회 허용)
// 강화면 gacha129: 첫 렌더에서 code 가 잠깐 보였다가 이름으로 바뀌던 문제 -> 조회 중에는 code 대신 로딩 표기
const mapNameMiss = new Map(); // code -> 조회 실패/미발견 시각
function mapNameOf(code, mode, onLoaded) {
    if (mapNames.has(code)) return mapNames.get(code);
    const miss = mapNameMiss.get(code);
    if (miss && Date.now() - miss < 30000) return code;
    const m = mode === 'pvp' ? 'pvp' : 'solo';
    loadMapList(m).then(() => (mapNames.has(code) ? null : loadMapList(m === 'pvp' ? 'solo' : 'pvp'))).then(() => {
        if (!mapNames.has(code)) mapNameMiss.set(code, Date.now()); else mapNameMiss.delete(code);
        onLoaded?.();
    });
    return undefined;
}

// 대기실: GET /api/rooms/{code}?after_seq 폴링(1.5초, 탭 비활성 4초, 오류 시 백오프 최대 10초).
// 상태머신: waiting(준비/시작) -> deployment(Deploy 씬) -> in_progress(Battle 씬: FE A) -> finished/closed(로비).
// 전투 진입 인터페이스: scene.start('Battle', {mode:'room', roomCode, battleId})
export class RoomScene extends Phaser.Scene {
    constructor() { super('Room'); }

    init(data) {
        this.code = data?.code ?? this.code;
        this.state = data?.state ?? this.state ?? null;
        this.lastSeq = 0;
        this.chat = null;
    }

    create() {
        this.modalCount = 0;
        syncView();
        setupCamera(this, CSS.bg);
        relayoutOnChange(this, () => ({ code: this.code, state: this.state }));
        addBackdrop(this, L.lw, L.lh);
        audio.bgm(audio.lobbyBgm(), this); // 방 대기실: 로비와 같은 트랙(임시 — 전용 '대기실' 트랙 생기면 교체)
        const m = 12;
        const w = Math.min(640, L.lw - L.safe.l - L.safe.r - m * 2);
        const h = Math.min(L.lh - L.safe.t - L.safe.b - m * 2, 520);
        this.panel = new Panel(this, { x: (L.lw - w) / 2, y: Math.max(L.safe.t + m, (L.lh - h) / 2), w, h, title: `대기실  ${this.code}` });
        this.pw = w; this.ph = h;
        this.body = this.add.container(0, 0);
        this.panel.add(this.body);
        this.errT = noteText(this, 16, h - 92, '', { kind: 'error', size: 13, wrap: w - 32 });
        this.panel.add(this.errT);
        this.failures = 0;
        this.alive = true;
        this.onVis = () => this.schedule(0);
        document.addEventListener('visibilitychange', this.onVis);
        // 웹소켓 푸시(room.changed) -> 즉시 재조회. 구독 중엔 폴링을 안전망 간격으로 늘리고, 끊기면 즉시 기존 주기로 복귀(폴링은 제거하지 않음)
        this.rt = watchRealtime(`room.${this.code}`, {
            events: { '.room.changed': () => this.kick() },
            onLive: () => this.kick(),
            onDown: () => this.kick(),
        });
        this.events.once('shutdown', () => { this.alive = false; clearTimeout(this.timer); this.abort?.abort(); this.rt?.leave(); document.removeEventListener('visibilitychange', this.onVis); });
        if (this.state) this.render();
        this.schedule(0);
    }

    schedule(ms) {
        clearTimeout(this.timer);
        if (!this.alive) return;
        this.timer = setTimeout(() => this.poll(), ms);
    }

    // 푸시·연결 상태 변화로 즉시 재조회(진행 중이면 끝난 뒤 한 번 더)
    kick() { clearTimeout(this.timer); this.poll(); }

    pollDelay() { return this.rt?.live() ? WS_SAFETY_POLL_MS : (document.hidden ? 4000 : 1500); }

    async poll() {
        if (!this.alive) return;
        if (this.polling) { this.again = true; return; }
        this.polling = true;
        try {
            this.abort = new AbortController();
            const st = await gameApi.rooms.poll(this.code, this.lastSeq, this.abort.signal);
            if (!this.alive) return;
            this.failures = 0;
            this.state = st;
            this.lastSeq = st.last_seq ?? this.lastSeq;
            this.errT.setText('');
            if (this.transition(st)) return;
            this.render();
            const next = this.again ? 0 : this.pollDelay();
            this.again = false;
            this.schedule(next);
        } catch (e) {
            if (!this.alive || e.code === 'aborted') return;
            if (e.status === 404 || e.status === 401) { this.scene.start('Lobby', { tab: 'room', notice: messageOf(e) }); return; }
            this.failures++;
            this.errT.setText(`! 연결 오류(${messageOf(e)}) 재시도 중... PvP 는 90초 이상 끊기면 기권 처리될 수 있습니다.`);
            this.schedule(Math.min(10000, 1500 * 2 ** this.failures));
        } finally { this.polling = false; }
    }

    // 상태 전이: true 를 반환하면 씬을 떠났다
    transition(st) {
        const s = st.room?.status;
        // solo 방 표시는 전이 전에(첫 폴링이 곧바로 배치/전투로 넘어가면 render 가 불리지 않아 표시가 빠지고 배치·전투에서 chat-settings 409 가 났다)
        if (st.room?.mode === 'solo') markRoomChatUnavailable(this.code);
        if (s === 'deployment') {
            const me = st.players?.find((p) => p.is_me);
            if (!me?.confirmed) { this.scene.start('Deploy', { mode: 'room', roomCode: this.code }); return true; }
            return false; // 내 확정 완료: 상대 대기
        }
        if (s === 'in_progress') {
            this.scene.start('Battle', { mode: 'room', roomCode: this.code, battleId: st.battle?.battle_id ?? st.battle?.id ?? null, fresh: true });
            return true;
        }
        if (s === 'finished' || s === 'closed' || s === 'abandoned') {
            const r = st.result;
            const msg = r ? (r.win ? '승리했습니다.' : r.abandoned ? '상대가 나가 방이 종료되었습니다.' : '패배했습니다.') : '방이 종료되었습니다.';
            this.scene.start('Lobby', { tab: 'room', notice: msg });
            return true;
        }
        return false;
    }

    render() {
        const st = this.state; const w = this.pw; const h = this.ph;
        this.body.removeAll(true);
        const room = st.room; const me = st.players?.find((p) => p.is_me);
        // 방 채팅(pvp 만): 화면 우하단 접이식 DOM 패널. 씬 shutdown 시 자동 해제
        if (room.mode === 'solo') markRoomChatUnavailable(this.code); // solo 방: 배치·전투 화면에서 chat-settings 409 요청 생략
        if (!this.chat && room.mode === 'pvp') this.chat = mountRoomChat(this, { roomCode: this.code, anchor: () => ({ right: L.safe.r + 12, bottom: L.safe.b + 12 }), startOpen: !L.portrait });
        let y = this.panel.bodyY;
        const modeKo = room.mode === 'pvp' ? 'PvP (2인)' : '솔로 (컴퓨터 대전)';
        this.body.add(makeText(this, 16, y, `${modeKo} · ${room.visibility === 'public' ? '공개' : '비공개'} · 턴 ${room.turn_limit_seconds}초 · 상태 ${{ waiting: '대기 중', deployment: '배치 중' }[room.status] ?? room.status}`, { size: 14, color: CSS.muted, wrap: w - 32 }));
        y += 30;
        // 방 옵션: 병사 자동 따라가기(room.follow_troops, 방장이 생성 시 정함 — 양 플레이어 동일 적용)
        const fol = room.follow_troops === true;
        this.body.add(makeText(this, 16, y, `병사 자동 따라가기  ${fol ? '켜짐 (양 플레이어에게 동일하게 적용)' : '꺼짐'}`, { size: 14, color: fol ? CSS.allyText : CSS.muted, wrap: w - 32 }));
        y += 24;
        // 맵: 서버 최종값(랜덤 선택이면 추첨 결과). map_name 이 없으면 /api/maps 목록(세션 캐시)으로 이름 매핑, 그래도 없으면 code
        const mapName = room.map_name ?? (room.map_code ? mapNameOf(room.map_code, room.mode, () => { if (this.alive && this.state?.room?.map_code === room.map_code) this.render(); }) : null);
        // 크기·출전 영웅 수(room.size_class·party_size, 서버가 줄 때만 — 없으면 기존 표기)
        const sp = sizePartyText(room);
        if (room.map_code || mapName) { this.body.add(makeText(this, 16, y, `맵  ${mapName ?? (room.map_code ? '불러오는 중…' : '')}${sp ? ` · ${sp}` : ''}`, { size: 15, bold: true, color: CSS.text, wrap: w - 32 })); y += 26; }
        this.body.add(makeText(this, 16, y + 22, `입장 코드  ${room.code}`, { size: 22, heading: true, color: CSS.accent, origin: [0, 0.5] }));
        this.body.add(new Button(this, { x: w - 16 - 100, y, w: 100, h: 44, label: '코드 복사', size: 14, onClick: () => this.copy(room.code) }));
        y += 58;
        (st.players ?? []).forEach((p, i) => {
            const row = listRow(this, { x: 16, y: y + i * 62, w: w - 32, h: 54 });
            const flags = [p.side === 'a' ? '방장' : '참가자', p.ready ? '✓ 준비' : '… 대기', room.status === 'deployment' ? (p.confirmed ? '✓ 배치 확정' : '… 배치 중') : '', p.connected ? '● 접속' : `○ 끊김 ${p.seconds_since_seen ?? ''}s`].filter(Boolean);
            row.add(makeText(this, 14, 27, `${p.nickname}${p.is_me ? ' (나)' : ''}`, { size: 17, bold: true, origin: [0, 0.5], color: p.connected ? CSS.text : CSS.muted }));
            row.add(makeText(this, w - 32 - 14, 27, flags.join('  ·  '), { size: 13, color: p.connected ? CSS.allyText : CSS.dangerText, origin: [1, 0.5] }));
            this.body.add(row);
        });
        if (room.mode === 'pvp' && (st.players?.length ?? 0) < 2) this.body.add(makeText(this, 16, y + 62 + 27, '상대를 기다리는 중... (코드를 공유하세요)', { size: 15, color: CSS.muted, origin: [0, 0.5] }));
        y += Math.max(2, st.players?.length ?? 0) * 62 + 12;
        if (room.status === 'deployment' && me?.confirmed) this.body.add(noteText(this, 16, y, '배치를 확정했습니다. 상대의 확정을 기다리는 중입니다.', { kind: 'ok', size: 14, wrap: w - 32 }));
        // 버튼: 패널 하단 프레임 장식(약 20px) 안쪽에 둔다(I-5). 안내문은 줄바꿈 높이만큼 버튼 위로 올리고, 연결 오류 문구는 그 위
        const by = h - 48 - 24;
        const note = noteText(this, 24, by - 8, 'PvP 는 90초 이상 접속이 끊기면 기권으로 처리됩니다. 화면을 유지해 주세요.', { kind: 'info', size: 12, wrap: w - 48, origin: [0, 1] });
        this.body.add(note);
        this.errT.setPosition(24, by - 8 - note.height - 6).setOrigin(0, 1).setWordWrapWidth(w - 48, true);
        const bx = 24; // 좌우 프레임 두께 반영(16 -> 24)
        const bw = (w - bx * 2 - 16) / 3;
        if (room.status === 'waiting') {
            if (room.is_host) {
                const allReady = (st.players ?? []).every((p) => p.ready);
                const enough = room.mode === 'solo' || (st.players?.length ?? 0) >= 2;
                const why = !enough ? '상대가 참가해야 시작할 수 있습니다.' : !allReady ? '모든 참가자가 준비해야 합니다.' : '';
                this.body.add(new Button(this, { x: bx, y: by, w: bw, h: 48, label: '시작', variant: 'primary', disabled: !!why, reason: why, onClick: () => this.act(() => gameApi.rooms.start(this.code)) }));
            } else {
                this.body.add(new Button(this, { x: bx, y: by, w: bw, h: 48, label: me?.ready ? '준비 해제' : '준비', variant: me?.ready ? 'default' : 'primary', onClick: () => this.act(() => gameApi.rooms.ready(this.code, !me?.ready)) }));
            }
        }
        this.body.add(new Button(this, { x: bx + bw + 8, y: by, w: bw, h: 48, label: '새로고침', onClick: () => this.schedule(0) }));
        this.body.add(new Button(this, { x: bx + (bw + 8) * 2, y: by, w: bw, h: 48, label: '나가기', variant: 'danger', onClick: () => this.leave() }));
    }

    async act(fn) {
        try { const st = await fn(); if (!this.alive) return; if (st?.room) { this.state = st; this.lastSeq = st.last_seq ?? this.lastSeq; if (!this.transition(st)) this.render(); } else this.schedule(0); }
        catch (e) { if (this.alive) alertModal(this, '실패', messageOf(e)); }
    }

    copy(code) {
        navigator.clipboard?.writeText(code).then(() => showToast(this, '입장 코드를 복사했습니다.'), () => showToast(this, `복사 실패. 코드: ${code}`));
    }

    leave() {
        confirmModal(this, '방 나가기', this.state?.room?.status === 'waiting' ? '방을 나갑니다.' : '진행 중인 방을 나가면 기권 처리됩니다.', async () => {
            try { await gameApi.rooms.leave(this.code); } catch { /* 이미 닫힘 */ }
            this.scene.start('Lobby', { tab: 'room' });
        }, { okLabel: '나가기', danger: true });
    }
}
