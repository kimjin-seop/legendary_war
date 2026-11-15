import { view, FONT_FAMILY } from '../theme.js';
import { gameApi } from '../api/gameApi.js';
import { watchRealtime, WS_SAFETY_POLL_MS } from '../api/realtime.js';

// 방 채팅 패널(pvp 상대 채팅). 대기실(Room)·방 배치(Deploy)·방 전투(Battle) 공용 DOM 오버레이 컴포넌트.
// 사용: mountRoomChat(scene, { roomCode, anchor: () => ({right|left, top|bottom}: 화면 가장자리에서의 설계 단위 거리), startOpen })
// - 표시 조건: chat-settings 로드 성공 시에만 보인다. solo 방(409 chat_not_available)·비참가자(403)·만료(410)면 끝까지 숨김(폴링도 안 함).
// - 보안: 서버 body 는 이미 HTML 이스케이프됨 -> decodeEntities 로 되돌린 뒤 textContent 로만 넣는다(innerHTML 미사용 = 스크립트 실행 불가).
// - 폴링: 패널 열림 1.5초 / 접힘(또는 탭 숨김) 4초, since_id=마지막 받은 id, 열림+보임일 때만 read=1, has_more 면 즉시 재호출.
//   씬 shutdown/destroy 시 타이머·요청·리스너 전부 해제. 같은 방 코드의 설정·메시지는 모듈 캐시로 씬 전환(대기실->배치->전투) 사이 유지(설정 1회 로드).
// - 입력: <input> (한글 IME: 조합 중 Enter 무시), maxLength = settings.max_length(100). 게스트(free_text=false)는 빠른 채팅 버튼만.
const STYLE_ID = 'srpg-room-chat-style';
const POLL_OPEN_MS = 1500;
const POLL_IDLE_MS = 4000;
const MAX_KEEP = 200;

const REASON_LABEL = { abuse: '욕설·비방', spam: '도배·광고', sexual: '음란·성적', other: '기타' };
const CANNOT_SEND = {
    chat_closed: '대전이 끝나 채팅이 닫혔습니다. (읽기 전용)',
    chat_restricted: '신고 누적으로 채팅이 일시 제한되었습니다.',
    chat_muted: '상대 채팅을 숨긴 상태입니다. 숨김을 해제해야 보낼 수 있습니다.',
};
const SEND_ERROR = {
    guest_text_forbidden: '게스트는 빠른 채팅만 사용할 수 있습니다.',
    chat_muted: CANNOT_SEND.chat_muted,
    chat_closed: CANNOT_SEND.chat_closed,
    banned_word: '사용할 수 없는 단어가 포함되어 있습니다.',
    chat_banned_word: '사용할 수 없는 단어가 포함되어 있습니다.',
    chat_duplicate: '같은 메시지를 연달아 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.',
    empty_message: '메시지를 입력해 주세요.',
    invalid_quick_id: '빠른 채팅 목록이 바뀌었습니다. 다시 선택해 주세요.',
    network: '네트워크에 연결할 수 없습니다.',
};
const GONE = new Set(['chat_not_available', 'not_room_member', 'chat_expired', 'room_not_found']);

// 서버 htmlspecialchars(ENT_QUOTES) 결과 -> 원문. &amp; 는 마지막(이중 디코드 방지). 결과는 textContent 로만 사용
export function decodeEntities(s) {
    return String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
}

// 방 코드별 캐시(현재 방 하나만 유지)
const cache = { code: null, settings: null, msgs: new Map(), lastId: 0, unread: 0, status: null, gone: false, reported: new Set() };
// 채팅 없는 방(solo 409·403·410 등) 코드는 sessionStorage 에도 둔다 -> 새로고침·대기실 미경유 재진입에서도 chat-settings 를 다시 요청하지 않음(저장 불가 환경은 메모리 캐시만)
const GONE_KEY = 'srpg.chat.gone';
const goneCodes = () => { try { const v = JSON.parse(sessionStorage.getItem(GONE_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
function markGone(c) {
    c.gone = true;
    try { const l = goneCodes().filter((x) => x !== c.code); l.push(c.code); sessionStorage.setItem(GONE_KEY, JSON.stringify(l.slice(-20))); } catch { /* 저장 불가: 메모리 캐시만 */ }
}
function cacheFor(code) {
    if (cache.code !== code) Object.assign(cache, { code, settings: null, msgs: new Map(), lastId: 0, unread: 0, status: null, gone: goneCodes().includes(code), reported: new Set() });
    return cache;
}

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
.srpg-chat{position:absolute;z-index:30;font-family:${FONT_FAMILY};color:#e8e4d8;font-size:13px;line-height:1.35;display:flex;flex-direction:column;gap:6px;pointer-events:none;box-sizing:border-box}
.srpg-chat *{box-sizing:border-box}
.srpg-chat.anchor-top{flex-direction:column-reverse}
.srpg-chat button{font-family:inherit;cursor:pointer;pointer-events:auto}
.srpg-chat button:disabled{opacity:.45;cursor:default}
.srpg-chat button:focus-visible{outline:2px solid #f0d58c;outline-offset:1px}
.srpg-chat .pill{align-self:flex-end;min-height:36px;min-width:72px;padding:0 12px;border-radius:18px;background:#0a1226;border:2px solid #c9a24b;color:#f0d58c;font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;justify-content:center}
.srpg-chat.side-left .pill{align-self:flex-start}
.srpg-chat .badge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#d0453a;color:#fff;font-size:11px;line-height:18px;text-align:center}
.srpg-chat .box{pointer-events:auto;display:flex;flex-direction:column;background:rgba(10,18,38,.94);border:2px solid #c9a24b;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.45);overflow:hidden}
.srpg-chat .hd{display:flex;align-items:center;gap:6px;padding:4px 6px 4px 10px;border-bottom:1px solid rgba(201,162,75,.4)}
.srpg-chat .hd b{flex:1;color:#f0d58c;font-size:13px}
.srpg-chat .sm{min-height:30px;padding:0 8px;border-radius:6px;background:#141e38;border:1px solid rgba(201,162,75,.6);color:#e8e4d8;font-size:12px}
.srpg-chat .list{flex:1;overflow-y:auto;padding:6px 8px;display:flex;flex-direction:column;gap:4px;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch}
.srpg-chat .empty{color:#7f8899;font-size:12px;text-align:center;padding:8px 0}
.srpg-chat .msg{display:flex;flex-direction:column;max-width:88%;align-self:flex-start}
.srpg-chat .msg.mine{align-self:flex-end;align-items:flex-end}
.srpg-chat .meta{font-size:11px;color:#9aa3b5;display:flex;gap:6px;align-items:center}
.srpg-chat .meta .rp{min-height:22px;padding:0 6px;font-size:11px;border-radius:4px;background:transparent;border:1px solid rgba(238,138,118,.6);color:#ee8a76}
.srpg-chat .bub{padding:4px 8px;border-radius:6px;background:#1b2747;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.srpg-chat .msg.mine .bub{background:#3a3016}
.srpg-chat .msg.quick .bub{border:1px solid rgba(240,213,140,.45)}
.srpg-chat .rbox{padding:6px 8px;border-top:1px solid rgba(201,162,75,.4);display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.srpg-chat .rbox span{width:100%;font-size:12px;color:#ee8a76}
.srpg-chat .note{padding:4px 8px;font-size:12px;color:#f0c27a;border-top:1px solid rgba(201,162,75,.25)}
.srpg-chat .note.err{color:#ee8a76}
.srpg-chat .quick{display:flex;gap:4px;padding:6px 8px 0;overflow-x:auto;flex-wrap:nowrap;touch-action:pan-x;-webkit-overflow-scrolling:touch}
.srpg-chat .quick.wrap{flex-wrap:wrap;padding-bottom:6px}
.srpg-chat .quick button{flex:0 0 auto;min-height:32px;padding:0 8px;border-radius:16px;background:#141e38;border:1px solid rgba(201,162,75,.6);color:#e8e4d8;font-size:12px;white-space:nowrap}
.srpg-chat .in{display:flex;gap:6px;padding:6px 8px;align-items:center}
.srpg-chat .in input{flex:1;min-width:0;height:36px;background:#0a1226;border:1px solid #c9a24b;border-radius:6px;color:#e8e4d8;padding:0 8px;font-family:inherit;font-size:14px;outline:0;pointer-events:auto}
.srpg-chat .in input:focus{border-color:#f0d58c;box-shadow:0 0 0 2px rgba(240,213,140,.35)}
.srpg-chat .in input:disabled{opacity:.5}
.srpg-chat .in .cnt{font-size:11px;color:#7f8899;min-width:44px;text-align:right}
.srpg-chat .in .send{min-height:36px;padding:0 12px;border-radius:6px;background:#c9a24b;border:0;color:#0b1020;font-weight:700;font-size:13px}`;
    document.head.appendChild(s);
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// 채팅 제재 안내: '채팅 제한 중 · M분 후 해제(HH:MM)'. 시각이 지났거나 형식이 틀리면 null(일반 사유 문구로 폴백)
const restrictText = (iso) => { const t = new Date(iso).getTime(); if (!Number.isFinite(t) || t <= Date.now()) return null; const m = Math.max(1, Math.ceil((t - Date.now()) / 60000)); return `채팅 제한 중 · ${m}분 후 해제(${hhmm(iso)})`; };
const hhmm = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export class RoomChat {
    constructor(scene, { roomCode, anchor, startOpen = false }) {
        ensureStyle();
        this.scene = scene;
        this.code = roomCode;
        this.anchor = anchor ?? (() => ({ right: 12, bottom: 12 }));
        this.c = cacheFor(roomCode);
        this.open = !!startOpen;
        this.alive = true;
        this.timer = null;
        this.failures = 0;
        this.throttleUntil = 0;
        this.reportFor = null;
        this.parent = scene.game.canvas.parentElement ?? document.body;
        if (getComputedStyle(this.parent).position === 'static') this.parent.style.position = 'relative';
        this.build();
        this.root.style.display = 'none'; // 설정 로드 성공 전까지 숨김(solo 방 등은 끝까지 숨김)
        this.parent.appendChild(this.root);
        this.place();
        this.onLayout = () => this.place();
        scene.game.events.on('layout', this.onLayout);
        this.onVis = () => { if (!document.hidden) this.schedule(0); };
        document.addEventListener('visibilitychange', this.onVis);
        this.onVV = () => { if (document.activeElement === this.input) this.fitViewport(); else this.root.style.transform = ''; };
        window.visualViewport?.addEventListener('resize', this.onVV);
        // 씬 모달(Phaser) 이 열리면 DOM 패널이 그 위로 겹치지 않게 숨김(Modal 은 닫힘 이벤트가 없어 주기 확인)
        this.modalSync = setInterval(() => this.syncModal(), 250);
        this.onShutdown = () => this.destroy();
        scene.events.once('shutdown', this.onShutdown);
        scene.events.once('destroy', this.onShutdown);
        if (!this.c.gone) this.init();
    }

    build() {
        const root = el('div', 'srpg-chat');
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', '방 채팅');
        // 접힘 상태 버튼(안 읽음 배지)
        this.pill = el('button', 'pill');
        this.pill.type = 'button';
        this.pill.append(el('span', null, '채팅'));
        this.badge = el('span', 'badge');
        this.pill.append(this.badge);
        this.pill.addEventListener('click', () => this.setOpen(true));
        // 펼친 패널
        this.box = el('div', 'box');
        const hd = el('div', 'hd');
        hd.append(el('b', null, '채팅'));
        this.muteBtn = el('button', 'sm');
        this.muteBtn.type = 'button';
        this.muteBtn.addEventListener('click', () => this.toggleMute());
        const fold = el('button', 'sm', '접기');
        fold.type = 'button';
        fold.setAttribute('aria-label', '채팅 접기');
        fold.addEventListener('click', () => this.setOpen(false));
        hd.append(this.muteBtn, fold);
        this.list = el('div', 'list');
        this.list.setAttribute('aria-live', 'polite');
        this.rbox = el('div', 'rbox');
        this.rbox.style.display = 'none';
        this.note = el('div', 'note');
        this.note.style.display = 'none';
        this.quick = el('div', 'quick');
        this.inRow = el('div', 'in');
        this.input = el('input');
        this.input.type = 'text';
        this.input.autocomplete = 'off';
        this.input.spellcheck = false;
        this.input.placeholder = '메시지 입력 (Enter 전송)';
        this.input.setAttribute('aria-label', '채팅 메시지');
        this.cnt = el('span', 'cnt');
        this.sendBtn = el('button', 'send', '전송');
        this.sendBtn.type = 'button';
        this.sendBtn.addEventListener('click', () => this.sendText());
        this.input.addEventListener('keydown', (e) => {
            e.stopPropagation(); // Phaser(window) 키 단축키로 전파 금지
            if (e.key === 'Enter') {
                if (e.isComposing || e.keyCode === 229) return; // 한글 IME 조합 중 Enter 는 조합 확정용
                e.preventDefault();
                this.sendText();
            } else if (e.key === 'Escape') this.input.blur();
        });
        this.input.addEventListener('keyup', (e) => e.stopPropagation());
        this.input.addEventListener('input', () => this.updateCount());
        this.input.addEventListener('focus', () => this.fitViewport());
        this.input.addEventListener('blur', () => { this.root.style.transform = ''; });
        this.inRow.append(this.input, this.cnt, this.sendBtn);
        this.box.append(hd, this.list, this.rbox, this.note, this.quick, this.inRow);
        // 패널 위 포인터가 캔버스(맵 드래그·탭)로 새지 않게
        ['pointerdown', 'pointerup', 'wheel', 'touchstart'].forEach((t) => [this.box, this.pill].forEach((n) => n.addEventListener(t, (e) => e.stopPropagation(), { passive: true })));
        root.append(this.pill, this.box);
        this.root = root;
    }

    // 설계 단위 anchor -> CSS px. 패널 크기는 화면에 맞춰 제한(모바일 세로 포함)
    place() {
        if (!this.alive) return;
        const s = view.scale || 1;
        const a = this.anchor() ?? {};
        const st = this.root.style;
        st.left = st.right = st.top = st.bottom = '';
        if (a.left != null) st.left = `${a.left * s}px`; else st.right = `${(a.right ?? 12) * s}px`;
        if (a.top != null) st.top = `${a.top * s}px`; else st.bottom = `${(a.bottom ?? 12) * s}px`;
        this.root.classList.toggle('side-left', a.left != null);
        this.root.classList.toggle('anchor-top', a.top != null);
        const pw = this.parent.clientWidth || window.innerWidth;
        const ph = this.parent.clientHeight || window.innerHeight;
        const w = Math.max(220, Math.min(300, pw - 24));
        st.width = `${w}px`;
        // 목록 높이: 화면 높이의 30%(최소 96, 최대 220). 세로 화면에서도 맵 대부분을 남긴다
        this.list.style.height = `${Math.round(Math.max(96, Math.min(220, ph * 0.3)))}px`;
    }

    fitViewport() {
        const vv = window.visualViewport;
        if (!vv) return;
        const r = this.root.getBoundingClientRect();
        const over = r.bottom + 8 - (vv.offsetTop + vv.height);
        this.root.style.transform = over > 0 ? `translateY(${-over}px)` : '';
    }

    syncModal() {
        if (!this.alive) return;
        const hide = (this.scene.modalCount ?? 0) > 0;
        if (hide && document.activeElement === this.input) this.input.blur();
        this.root.style.visibility = hide ? 'hidden' : '';
    }

    async init() {
        try {
            if (!this.c.settings) this.c.settings = await gameApi.chat.settings(this.code);
            if (!this.alive) return;
        } catch (e) {
            if (!this.alive) return;
            if (GONE.has(e.code) || e.status === 403 || e.status === 404 || e.status === 409 || e.status === 410) { if (e.status === 409 || e.code === 'chat_not_available') markGone(this.c); else this.c.gone = true; return; } // 세션 보관은 solo(채팅 없음)만: 403 비참가자는 이후 참가할 수 있음
            this.failures++;
            this.timer = setTimeout(() => this.alive && this.init(), Math.min(15000, 2000 * 2 ** this.failures));
            return;
        }
        this.failures = 0;
        const st = this.c.settings;
        if (st && 'restricted_until' in st) this.restrictUntil = st.restricted_until ?? null; // 제재 해제 시각(본인, 제재 중일 때만 값)
        this.c.status ??= { can_send: st.can_send, cannot_send_reason: st.cannot_send_reason, muted: st.muted, read_only: false };
        this.input.maxLength = st.max_length || 100;
        this.buildQuick();
        this.root.style.display = 'flex';
        this.setOpen(this.open);
        this.renderAll();
        // 웹소켓 푸시(chat.message) -> 즉시 재조회. 연결 중엔 폴링을 안전망 간격으로 늘리고 끊기면 즉시 기존 주기 복귀
        this.rt ??= watchRealtime(`room.${this.code}.chat`, {
            events: { '.chat.message': () => this.kick() },
            onLive: () => this.kick(),
            onDown: () => this.kick(),
        });
        this.schedule(0);
    }

    kick() { clearTimeout(this.timer); this.poll(); }

    buildQuick() {
        const st = this.c.settings;
        this.quick.replaceChildren();
        (st.quick_presets ?? []).forEach((p) => {
            const b = el('button', null, String(p.text ?? ''));
            b.type = 'button';
            b.addEventListener('click', () => this.send(() => gameApi.chat.sendQuick(this.code, p.id)));
            this.quick.append(b);
        });
        // 게스트(free_text=false): 입력창 대신 버튼만(여러 줄로 펼쳐 모두 보이게)
        this.quick.classList.toggle('wrap', !st.free_text);
    }

    setOpen(on) {
        this.open = !!on;
        this.pill.style.display = this.open ? 'none' : 'flex';
        this.box.style.display = this.open ? 'flex' : 'none';
        if (this.open) { this.scrollBottom(); if (this.c.settings) this.schedule(0); } // 열면 바로 read=1 로 갱신(배지 해제)
        else if (document.activeElement === this.input) this.input.blur();
        this.updateBadge();
    }

    schedule(ms) {
        clearTimeout(this.timer);
        if (!this.alive || this.c.gone || !this.c.settings) return;
        this.timer = setTimeout(() => this.poll(), ms);
    }

    nextDelay() { return this.rt?.live() ? WS_SAFETY_POLL_MS : (this.open && !document.hidden ? POLL_OPEN_MS : POLL_IDLE_MS); }

    async poll() {
        if (!this.alive || this.c.gone || !this.c.settings) return;
        if (this.polling) { this.again = true; return; }
        this.polling = true;
        let next = null;
        try {
            this.abort = new AbortController();
            const read = this.open && !document.hidden && this.root.style.visibility !== 'hidden';
            const d = await gameApi.chat.messages(this.code, this.c.lastId, read, this.abort.signal);
            if (!this.alive) return;
            this.failures = 0;
            (d.messages ?? []).forEach((m) => { this.c.msgs.set(m.id, m); if (m.id > this.c.lastId) this.c.lastId = m.id; });
            this.trim();
            this.c.unread = d.unread ?? 0;
            this.c.status = { can_send: !!d.can_send, cannot_send_reason: d.cannot_send_reason ?? null, muted: !!d.muted, read_only: !!d.read_only };
            if ('restricted_until' in d) this.restrictUntil = d.restricted_until ?? null;
            if (this.c.settings) this.c.settings.muted = !!d.muted;
            this.renderAll((d.messages ?? []).length > 0);
            next = d.has_more || this.again ? 0 : this.nextDelay();
            this.again = false;
        } catch (e) {
            if (!this.alive || e.code === 'aborted') return;
            if (GONE.has(e.code) || e.status === 403 || e.status === 404 || e.status === 409 || e.status === 410) {
                this.c.gone = true;
                this.root.style.display = 'none';
                return;
            }
            this.failures++;
            next = Math.min(15000, this.nextDelay() * 2 ** this.failures);
        } finally {
            this.polling = false;
            if (next != null) this.schedule(next);
        }
    }

    trim() {
        if (this.c.msgs.size <= MAX_KEEP) return;
        const ids = [...this.c.msgs.keys()].sort((a, b) => a - b);
        ids.slice(0, ids.length - MAX_KEEP).forEach((id) => this.c.msgs.delete(id));
    }

    renderAll(newArrived = false) {
        if (!this.alive || !this.c.settings) return;
        const nearBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 24;
        this.renderList();
        this.renderControls();
        this.updateBadge();
        if (!newArrived || nearBottom) this.scrollBottom();
    }

    renderList() {
        const muted = !!this.c.status?.muted;
        const msgs = [...this.c.msgs.values()].sort((a, b) => a.id - b.id).filter((m) => m.mine || !muted);
        const frag = document.createDocumentFragment();
        if (!msgs.length) frag.append(el('div', 'empty', muted ? '상대 채팅을 숨기는 중입니다.' : '아직 메시지가 없습니다. 빠른 채팅으로 인사해 보세요.'));
        msgs.forEach((m) => {
            const row = el('div', `msg${m.mine ? ' mine' : ''}${m.kind === 'quick' ? ' quick' : ''}`);
            const meta = el('div', 'meta');
            meta.append(el('span', null, `${m.mine ? '나' : String(m.name || '상대')} · ${hhmm(m.created_at)}`));
            if (!m.mine) {
                const done = this.c.reported.has(m.id);
                const rp = el('button', 'rp', done ? '신고됨' : '신고');
                rp.type = 'button';
                rp.disabled = done;
                rp.setAttribute('aria-label', '이 메시지 신고');
                rp.addEventListener('click', () => this.openReport(m.id));
                meta.append(rp);
            }
            // 서버 이스케이프 결과를 원문으로 되돌려 textContent 로만 넣는다(HTML 해석 없음)
            row.append(meta, el('div', 'bub', decodeEntities(m.body)));
            frag.append(row);
        });
        this.list.replaceChildren(frag);
    }

    renderControls() {
        const st = this.c.settings; const ss = this.c.status ?? {};
        this.muteBtn.textContent = ss.muted ? '숨김 해제' : '상대 숨기기';
        this.muteBtn.setAttribute('aria-pressed', ss.muted ? 'true' : 'false');
        this.muteBtn.title = ss.muted ? '상대 채팅 숨김을 해제합니다' : '상대 채팅을 숨깁니다(상대에게 알리지 않음)';
        const readOnly = !!ss.read_only;
        const throttled = Date.now() < this.throttleUntil;
        const canSend = !!ss.can_send && !readOnly && !this.sending;
        // read_only: 입력·빠른 채팅 모두 숨김. 게스트: 입력 숨김 + 빠른 채팅만
        this.inRow.style.display = readOnly || !st.free_text ? 'none' : 'flex';
        this.quick.style.display = readOnly ? 'none' : 'flex';
        this.input.disabled = !ss.can_send || readOnly;
        this.sendBtn.disabled = !canSend || throttled;
        this.quick.querySelectorAll('button').forEach((b) => { b.disabled = !canSend || throttled; });
        this.updateCount();
        // 안내: 우선순위 = 일시 오류 > 전송 대기(429) > 전송 불가 사유
        let msg = ''; let err = false;
        if (this.flash && Date.now() < this.flash.until) { msg = this.flash.text; err = this.flash.err; }
        else if (throttled) msg = `${Math.ceil((this.throttleUntil - Date.now()) / 1000)}초 후 다시 보낼 수 있습니다.`;
        else if (readOnly) msg = CANNOT_SEND.chat_closed;
        else if (!ss.can_send) msg = (ss.cannot_send_reason === 'chat_restricted' && this.restrictUntil && restrictText(this.restrictUntil)) ? `${restrictText(this.restrictUntil)} — ${CANNOT_SEND.chat_restricted}` : (CANNOT_SEND[ss.cannot_send_reason] ?? '지금은 채팅을 보낼 수 없습니다.');
        else if (!st.free_text) msg = '게스트는 빠른 채팅만 사용할 수 있습니다.';
        this.note.textContent = msg;
        this.note.classList.toggle('err', err);
        this.note.style.display = msg ? 'block' : 'none';
    }

    updateCount() {
        const max = this.c.settings?.max_length || 100;
        this.cnt.textContent = `${this.input.value.length}/${max}`;
    }

    updateBadge() {
        const n = this.c.unread ?? 0;
        this.badge.textContent = n > 99 ? '99+' : String(n);
        this.badge.style.display = n > 0 && !this.open ? 'inline-block' : 'none';
        this.pill.setAttribute('aria-label', n > 0 ? `채팅 열기 (안 읽은 메시지 ${n}개)` : '채팅 열기');
    }

    scrollBottom() { this.list.scrollTop = this.list.scrollHeight; }

    showFlash(text, err = true, ms = 4000) {
        this.flash = { text, err, until: Date.now() + ms };
        this.renderControls();
        clearTimeout(this.flashTimer);
        this.flashTimer = setTimeout(() => this.alive && this.renderControls(), ms + 50);
    }

    startThrottle(sec) {
        this.throttleUntil = Date.now() + Math.max(1, sec) * 1000;
        clearInterval(this.throttleTick);
        this.throttleTick = setInterval(() => {
            if (!this.alive) return;
            if (Date.now() >= this.throttleUntil) clearInterval(this.throttleTick);
            this.renderControls();
        }, 500);
        this.flash = null;
        this.renderControls();
    }

    sendText() {
        const text = this.input.value;
        if (!text.trim()) { this.showFlash(SEND_ERROR.empty_message); return; }
        this.send(() => gameApi.chat.sendText(this.code, text), true);
    }

    async send(fn, clearInput = false) {
        if (this.sending || Date.now() < this.throttleUntil) return;
        this.sending = true;
        this.renderControls();
        try {
            const d = await fn();
            if (!this.alive) return;
            if (clearInput) { this.input.value = ''; this.updateCount(); }
            // 내 메시지는 바로 표시(id 로 중복 제거). lastId 는 폴링으로만 올린다(사이에 온 상대 메시지 누락 방지)
            if (d?.message?.id) this.c.msgs.set(d.message.id, d.message);
            this.flash = null;
            this.startThrottle(this.c.settings?.send_interval_seconds || 3);
            this.renderAll();
            this.schedule(0);
        } catch (e) {
            if (!this.alive) return;
            this.handleSendError(e);
        } finally {
            this.sending = false;
            if (this.alive) this.renderControls();
        }
    }

    handleSendError(e) {
        const det = e.details ?? {};
        const max = this.c.settings?.max_length || 100;
        if (e.status === 429) { this.startThrottle(Number(det.retry_after) || e.retryAfter || this.c.settings?.send_interval_seconds || 3); return; }
        if (e.code === 'chat_restricted') {
            this.restrictUntil = det.until ?? null;
            this.c.status = { ...(this.c.status ?? {}), can_send: false, cannot_send_reason: 'chat_restricted' };
            this.renderControls();
            return;
        }
        if (e.code === 'chat_muted' || e.code === 'chat_closed') {
            this.c.status = { ...(this.c.status ?? {}), can_send: false, cannot_send_reason: e.code, ...(e.code === 'chat_muted' ? { muted: true } : { read_only: true }) };
            this.renderAll();
            return;
        }
        if (GONE.has(e.code)) { this.c.gone = true; this.root.style.display = 'none'; return; }
        if (e.code === 'invalid_quick_id') gameApi.chat.settings(this.code).then((s) => { if (!this.alive) return; this.c.settings = s; this.buildQuick(); this.renderControls(); }).catch(() => {});
        const text = e.code === 'message_too_long' ? `최대 ${max}자까지 보낼 수 있습니다.` : (SEND_ERROR[e.code] ?? '메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
        this.showFlash(text);
    }

    async toggleMute() {
        const next = !this.c.status?.muted;
        this.muteBtn.disabled = true;
        try {
            const st = await gameApi.chat.setMuted(this.code, next);
            if (!this.alive) return;
            this.c.settings = { ...this.c.settings, ...st };
            this.c.status = { ...(this.c.status ?? {}), muted: !!st.muted, can_send: !!st.can_send, cannot_send_reason: st.cannot_send_reason ?? null };
            if ('restricted_until' in st) this.restrictUntil = st.restricted_until ?? null;
            this.renderAll();
            this.showFlash(st.muted ? '상대 채팅을 숨겼습니다. 상대에게는 알리지 않습니다.' : '상대 채팅 숨김을 해제했습니다. 숨긴 동안의 메시지는 보이지 않습니다.', false, 3500);
        } catch (e) {
            if (this.alive) this.showFlash(e.status === 429 ? '잠시 후 다시 시도해 주세요.' : '설정을 바꾸지 못했습니다.');
        } finally {
            if (this.alive) this.muteBtn.disabled = false;
        }
    }

    openReport(id) {
        this.reportFor = id;
        this.rbox.replaceChildren(el('span', null, '신고 사유를 고르세요.'));
        (this.c.settings?.report_reasons ?? Object.keys(REASON_LABEL)).forEach((r) => {
            const b = el('button', 'sm', REASON_LABEL[r] ?? String(r));
            b.type = 'button';
            b.addEventListener('click', () => this.report(id, r));
            this.rbox.append(b);
        });
        const cancel = el('button', 'sm', '취소');
        cancel.type = 'button';
        cancel.addEventListener('click', () => this.closeReport());
        this.rbox.append(cancel);
        this.rbox.style.display = 'flex';
    }

    closeReport() { this.reportFor = null; this.rbox.style.display = 'none'; this.rbox.replaceChildren(); }

    async report(id, reason) {
        this.rbox.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try {
            await gameApi.chat.report(this.code, id, reason);
            if (!this.alive) return;
            this.c.reported.add(id);
            this.closeReport();
            this.renderList();
            this.showFlash('신고를 접수했습니다. 상대 채팅을 숨기려면 [상대 숨기기]를 누르세요.', false, 4000);
        } catch (e) {
            if (!this.alive) return;
            this.closeReport();
            this.showFlash(e.status === 429 ? '신고가 너무 잦습니다. 잠시 후 다시 시도해 주세요.' : '신고하지 못했습니다.');
        }
    }

    destroy() {
        if (!this.alive) return;
        this.alive = false;
        clearTimeout(this.timer);
        clearTimeout(this.flashTimer);
        this.rt?.leave();
        clearInterval(this.throttleTick);
        clearInterval(this.modalSync);
        this.abort?.abort();
        this.scene.game.events.off('layout', this.onLayout);
        this.scene.events.off('shutdown', this.onShutdown);
        this.scene.events.off('destroy', this.onShutdown);
        document.removeEventListener('visibilitychange', this.onVis);
        window.visualViewport?.removeEventListener('resize', this.onVV);
        this.input.value = '';
        this.root.remove();
    }
}

export const mountRoomChat = (scene, opts) => new RoomChat(scene, opts);
// 방 모드를 이미 아는 화면(대기실)이 solo 방임을 알려 둔다 -> 이어지는 배치·전투에서 chat-settings 를 요청하지 않는다(409 콘솔 오류 방지)
export function markRoomChatUnavailable(code) { if (code) markGone(cacheFor(code)); }
