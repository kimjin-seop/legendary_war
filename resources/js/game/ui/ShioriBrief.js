// 시오리 브리핑(2026-11-14 '처음에 모든 튜토리얼도 시오리가 브리핑하는 방식으로'): 개념 팝업·스테이지 안내·전투 조작 안내(G1~G5)·도움말 다시 보기의 공용 외형.
// 외형 = 하단 대사 박스(uiskin dialog 패널) + 좌측 시오리 초상(portrait.shiori.<expr>) + 이름표 '시오리'(uiskin nameplate, BattleDialogue 와 같은 #f0d58c). 새 이미지 없음.
// 비모달 오버레이: depth 899(로딩 덮개 900 아래, 모달 1000 아래). 입력은 상자 영역만 소비(아래 칸 선택 방지). overModal 항목(승리 정산)만 1001.
// 축소형(compact): 세로 좁은 화면(폭 420 이하)·가로 폰(L.short) — 초상 작게, 글자 작게.
// 효과 줄이기(settings.fxLevel >= 1 '축약'/'끄기' 또는 즉시 모드): 표정 크로스페이드·타이핑 생략.
//
// 큐(씬별 1개만 표시): 우선순위 = 대사·전투 연출(storyDialogue·fx.playing·모달·로딩 = 차단) > G 조작 안내(scene.guideActive) > 개념 팝업 > stageHint.
//  표시 못 한 항목은 큐에 남아 400ms 간격으로 재시도. 같은 key 는 한 번만 들어간다. 씬 종료 시 큐 비움.
import { COLOR, CSS, MIN_TOUCH } from '../theme.js';
import { L } from '../layout.js';
import { makeText } from './common.js';
import { Button } from './Button.js';
import { slice } from './skin.js';
import { tween, isInstant } from './motion.js';
import { settings } from '../settings.js';
import { ensurePortraitTex } from '../assets.js';
import { isBattleScene, battleLandscapePos, pickPortraitY, overlapsFacing } from './briefPlace.js';

export const BRIEF_PRI = { replay: 0, guide: 1, concept: 2, hint: 3 };
export const BRIEF_DEPTH = 899;
const NAME_COLOR = '#f0d58c';
const TYPE_MS = 24;

export const briefReduced = () => (settings.get().fxLevel ?? 0) >= 1 || isInstant();
export const briefCompact = () => !!((L.portrait && L.lw <= 420) || L.short);

// ---------- 초상(표정 크로스페이드) ----------
class BriefPortrait {
    constructor(sc, size) {
        this.sc = sc; this.size = size;
        this.c = sc.add.container(0, 0);
        const g = sc.add.graphics();
        g.fillStyle(COLOR.ink, 0.9).fillRoundedRect(0, 0, size, size, 6).lineStyle(2, COLOR.accent, 0.9).strokeRoundedRect(0, 0, size, size, 6);
        this.fallback = makeText(sc, size / 2, size / 2, '시', { size: Math.round(size * 0.42), heading: true, color: NAME_COLOR, origin: [0.5, 0.5] });
        this.c.add([g, this.fallback]);
        this.img = null; this.expr = null;
    }

    setExpr(expr, instant = false) {
        if (expr === this.expr) return;
        this.expr = expr;
        const logical = `portrait.shiori.${expr || 'neutral'}`;
        const put = (k) => {
            if (!k || !this.c?.scene || this.expr !== expr || !this.sc.textures.exists(k)) return;
            const im = this.sc.add.image(this.size / 2, this.size / 2, k);
            const fw = im.frame.realWidth; const fh = im.frame.realHeight; const side = Math.min(fw, fh);
            im.setCrop((fw - side) / 2, 0, side, side).setOrigin(0.5, (side / 2) / fh).setScale((this.size - 4) / side); // 얼굴 쪽(위) 정사각형만
            this.c.add(im);
            this.fallback.setVisible(false);
            const old = this.img; this.img = im;
            if (instant || briefReduced() || !old) { old?.destroy(); return; }
            im.setAlpha(0);
            tween(this.sc, { targets: im, to: { alpha: 1 }, duration: 150, onComplete: () => old?.destroy() });
        };
        put(ensurePortraitTex(this.sc, logical, put));
    }
}

// ---------- 상자(외형 공용) ----------
// opts: w, text, expr, compact, inline(축소형 한 줄: 버튼을 글 오른쪽에), buttons:[{label, onClick, primary, w}], minText(본문 높이 최소 px), measure(높이 계산용 다른 본문 배열), extra(본문 아래 작은 글), modal(버튼 모달 위 동작)
// 반환: { c, w, h, text, portrait, setText(str), setButtonLabel(i, s) } — c 의 원점 = 이름표 윗단(상자 윗단은 nh/2 아래)
export function drawBriefBox(sc, { w, text = '', expr = 'neutral', compact = false, inline = false, buttons = [], minText = 0, measure = [], extra = null, modal = false, onTap = null }) {
    const nh = compact ? 20 : 26; const nw = compact ? 64 : 84;
    const top = Math.round(nh / 2);
    const pad = compact ? 8 : 10;
    const P = compact ? 40 : 64;
    const size = compact ? 14 : 16;
    const btnH = MIN_TOUCH; // Button 은 높이를 MIN_TOUCH 미만으로 줄이지 않는다
    const bws = buttons.map((b) => b.w ?? (compact ? 76 : 104));
    const btnRowW = bws.reduce((a, b) => a + b, 0) + Math.max(0, bws.length - 1) * 8;
    const tx = pad + P + 10;
    const tw = w - tx - pad - (inline ? btnRowW + 8 : 0);
    const ty = top + pad + (compact ? 2 : 6);
    const c = sc.add.container(0, 0);
    const t = makeText(sc, tx, ty, text, { size, bold: true, color: CSS.text, wrap: tw });
    const tH = Math.max(t.height, minText, ...measure.map((s) => { const p = makeText(sc, 0, 0, s, { size, bold: true, wrap: tw }); const hh = p.height; p.destroy(); return hh; }));
    const ex = extra ? makeText(sc, tx, 0, extra, { size: compact ? 12 : 13, color: CSS.text, wrap: w - tx - pad }) : null;
    let boxH;
    // 일반형 + extra(G1 스테이지 안내): 본문 바로 아래에 안내, 버튼은 맨 아래(이전: 버튼 아래에 안내가 붙어 버튼 왼쪽이 비고 본문이 버튼 밑으로 몰려 보임, 강화면 2026-11-14)
    const exIn = !!ex && !inline;
    if (inline) boxH = pad * 2 + Math.max(tH + (compact ? 2 : 6), btnH, P);
    else boxH = Math.max(P + pad * 2, (ty - top) + (exIn ? Math.max(tH, t.height + 6 + ex.height) : tH) + 8 + btnH + pad); // 본문 최소 높이(minText) 여백 안에 안내가 들어가면 상자를 키우지 않음
    if (exIn) ex.setY(ty + t.height + 6);
    else if (ex) { ex.setY(top + boxH - 2); boxH += ex.height + pad; }
    const bg = slice(sc, 'dialog', w, boxH, 'panel', { corner: compact ? 0.5 : 0.6 }).setPosition(0, top);
    const hit = sc.add.rectangle(0, 0, w, top + boxH, 0xffffff, 0.001).setOrigin(0).setInteractive(); // 상자 영역 입력 소비
    if (onTap) hit.on('pointerup', (p) => { if (p.getDistance() < 16) onTap(); });
    const portrait = new BriefPortrait(sc, P);
    portrait.c.setPosition(pad, top + pad);
    portrait.setExpr(expr, true);
    const nameBg = slice(sc, 'nameplate', nw, nh, 'ribbon').setPosition(pad + 2, 0);
    const nameT = makeText(sc, pad + 2 + nw / 2, nh / 2, '시오리', { size: compact ? 12 : 14, heading: true, color: NAME_COLOR, origin: [0.5, 0.5] });
    const btns = [];
    let bx = w - pad - btnRowW;
    const by = inline ? top + (boxH - (ex ? ex.height + pad : 0) - btnH) / 2 : top + boxH - btnH - pad;
    buttons.forEach((b, i) => {
        btns.push(new Button(sc, { x: bx, y: by, w: bws[i], h: btnH, label: b.label, size: compact ? 12 : 14, variant: b.primary ? 'primary' : 'default', modal, onClick: b.onClick }));
        bx += bws[i] + 8;
    });
    if (inline) t.setY(top + (boxH - (ex ? ex.height + pad : 0) - t.height) / 2);
    c.add([hit, bg, portrait.c, t, ...(ex ? [ex] : []), nameBg, nameT, ...btns]);
    return {
        c, w, h: top + boxH, text: t, portrait, btns,
        setText: (s) => t.setText(s),
        setButtonLabel: (i, s) => btns[i]?.label?.setText(s),
    };
}

// ---------- 자리 ----------
// 배치(Deploy) 화면 맵 영역(Deploy.build 와 같은 계산): 세로 = 맵 아래(하단 카드 패널 위), 가로 = 맵 영역(오른쪽 카드 패널 제외) 아래쪽
function deployArea() {
    const m = 12; const top = L.safe.t + m; const bottom = L.lh - L.safe.b - m;
    const left = L.safe.l + m; const right = L.lw - L.safe.r - m;
    if (L.portrait) { const sideH = Math.min(300, (bottom - top) * 0.42); return { x: left, w: right - left, bottom: bottom - sideH - 6 }; }
    const sideW = Math.min(340, (right - left) * 0.36);
    return { x: left, w: right - sideW - m - left, bottom };
}
const isDeploy = (sc) => sc?.sys?.settings?.key === 'Deploy';

function boxWidth(sc, compact) {
    if (isDeploy(sc)) return Math.min(compact ? L.lw - 16 : 520, deployArea().w);
    if (isBattleScene(sc) && !sc.lay.portrait) return Math.min(compact ? 420 : 460, L.lw - 24);
    return Math.min(compact ? L.lw - 16 : 520, L.lw - 24);
}

// 전투 씬: 가로 = 하단 HUD 사이(battleLandscapePos), 세로 = 유닛·범위·카드 겹침 최소(pickPortraitY). 배치 화면: 맵 영역 아래. 그 밖: 하단 가운데(overModal = 상단)
function placeBox(sc, box, { overModal = false, lastY = null } = {}) {
    const w = box.w; const h = box.h;
    const x0 = (L.lw - w) / 2;
    if (overModal) return { x: x0, y: L.safe.t + 8, ok: true };
    if (isDeploy(sc)) { const a = deployArea(); return { x: a.x + (a.w - w) / 2, y: a.bottom - h, ok: true }; }
    if (isBattleScene(sc)) {
        if (!sc.lay.portrait) { const p = battleLandscapePos(sc, w, h); return { ...p, ok: !overlapsFacing(sc, { ...p, w, h }) }; }
        const r = { x: x0, w, h };
        const { y, best } = pickPortraitY(sc, r, { lastY });
        return { x: x0, y: y ?? 0, ok: y != null && best < 5000, best };
    }
    return { x: x0, y: L.lh - L.safe.b - h - 12, ok: true };
}

// ---------- 페이지형 브리핑 ----------
// pages: [{ expr, lines }]  -> '다음'(마지막 '알겠습니다'), 여러 장이면 '건너뛰기'. onClose(reason: 'done'|'skip'|'destroy')
export class ShioriBrief {
    constructor(scene, { pages, overModal = false, onClose = null }) {
        this.scene = scene; this.pages = pages; this.overModal = overModal; this.onClose = onClose;
        this.i = 0; this.closed = false;
        this.build();
        const un = typeof scene.store?.on === 'function' ? scene.store.on('change', () => this.place()) : null; // 전투: 선택·범위가 바뀌면 자리 다시 고름
        this.unsub = typeof un === 'function' ? un : null;
        this.onLayout = () => { if (!this.closed && scene.sys?.isActive()) this.build(); };
        scene.game?.events.on('layout', this.onLayout);
        this.onShutdown = () => this.destroy();
        scene.events.once('shutdown', this.onShutdown);
    }

    pageText(p) { return (p?.lines ?? []).join('\n'); }

    build() {
        const sc = this.scene;
        this.typing?.remove(); this.typing = null;
        this.box?.c.destroy();
        const compact = briefCompact();
        this.compact = compact;
        const w = boxWidth(sc, compact);
        const last = this.pages.length - 1;
        const buttons = [
            ...(this.pages.length > 1 ? [{ label: '건너뛰기', onClick: () => this.close('skip') }] : []),
            { label: this.i >= last ? '알겠습니다' : '다음', primary: true, w: compact ? 88 : 112, onClick: () => this.next() },
        ];
        this.box = drawBriefBox(sc, { w, text: '', expr: this.pages[this.i]?.expr, compact, buttons, measure: this.pages.map((p) => this.pageText(p)), modal: this.overModal, onTap: () => { if (this.typing) this.finishTyping(); } });
        this.box.c.setDepth(this.overModal ? 1001 : BRIEF_DEPTH);
        if (!this.shownOnce && !briefReduced()) { this.box.c.setAlpha(0); tween(sc, { targets: this.box.c, to: { alpha: 1 }, duration: 160 }); }
        this.shownOnce = true;
        this.showPage(true);
        this.place();
    }

    showPage(first = false) {
        const p = this.pages[this.i]; const str = this.pageText(p);
        this.box.portrait.setExpr(p?.expr ?? 'neutral', first);
        this.box.setButtonLabel(this.pages.length > 1 ? 1 : 0, this.i >= this.pages.length - 1 ? '알겠습니다' : '다음');
        this.typing?.remove(); this.typing = null; this.full = str;
        if (briefReduced() || !str) { this.box.setText(str); return; }
        let n = 0; this.box.setText('');
        this.typing = this.scene.time.addEvent({ delay: TYPE_MS, repeat: str.length - 1, callback: () => { n += 1; this.box?.setText(str.slice(0, n)); if (n >= str.length) { this.typing = null; } } });
    }

    finishTyping() { this.typing?.remove(); this.typing = null; this.box?.setText(this.full ?? ''); }

    next() {
        if (this.closed) return;
        if (this.typing) { this.finishTyping(); return; } // 타이핑 중 = 전체 표시
        if (this.i >= this.pages.length - 1) { this.close('done'); return; }
        this.i += 1; this.showPage();
    }

    place() {
        if (this.closed || !this.box) return;
        const pos = placeBox(this.scene, this.box, { overModal: this.overModal, lastY: this.lastY });
        this.box.c.setPosition(pos.x, pos.y).setVisible(pos.ok);
        if (pos.ok) this.lastY = pos.y;
        this.rect = { x: pos.x, y: pos.y, w: this.box.w, h: this.box.h };
    }

    contains(px, py) { const r = this.rect; return !this.closed && !!this.box?.c.visible && !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }

    close(reason = 'done') {
        if (this.closed) return;
        this.destroy();
        this.onClose?.(reason);
    }

    destroy() {
        if (this.closed) return;
        this.closed = true;
        this.typing?.remove(); this.typing = null;
        this.unsub?.(); this.unsub = null;
        this.scene.game?.events.off('layout', this.onLayout);
        this.scene.events?.off('shutdown', this.onShutdown);
        this.box?.c.destroy(); this.box = null;
    }
}

// ---------- 큐 ----------
// item: { key, pri, pages(배열 또는 Promise), overModal, popupCheck(scene.popupBlocked 확인), valid()(false 면 기록 없이 버림), onShow()(본 기록), onClose(reason), force(로딩·연출 검사 생략: 다시 보기) }
const Q = (sc) => {
    if (!sc.__briefQ) {
        sc.__briefQ = { items: [], cur: null, timer: null, seq: 0 };
        sc.events.once('shutdown', () => { sc.__briefQ?.timer?.remove(); sc.__briefQ = null; });
    }
    return sc.__briefQ;
};

export const currentBrief = (sc) => sc?.__briefQ?.cur ?? null;
export const briefQueued = (sc, key) => !!sc?.__briefQ && (sc.__briefQ.items.some((it) => it.key === key) || sc.__briefQ.cur?.key === key);

function blocked(sc, it) {
    // 로딩: 살아 있고 보이는 경우만 보류(로비 done() 은 문구를 숨기기만 해서 scene 만 보면 영구 보류되던 문제, 2026-11-14)
    const loadingOn = !!(sc.loading?.scene && sc.loading.visible !== false);
    if (sc.storyDialogue || (!it.force && (sc.fx?.playing || loadingOn))) return true; // 대사·전투 연출·로딩 우선
    if (it.overModal) return false;
    if ((sc.modalCount ?? 0) > 0) return true;
    if (it.pri > BRIEF_PRI.guide && sc.guideActive?.()) return true; // G 조작 안내 진행 중엔 개념 팝업·스테이지 안내 보류
    if (it.popupCheck && sc.popupBlocked?.()) return true;
    return false;
}

function pump(sc) {
    const q = sc?.__briefQ;
    if (!q || q.cur || !sc.sys?.isActive()) return;
    q.items = q.items.filter((it) => !it.dead && (!it.valid || it.valid()));
    q.items.sort((a, b) => a.pri - b.pri || a.seq - b.seq);
    const it = q.items.find((x) => Array.isArray(x.pages) && !blocked(sc, x));
    if (!it) return;
    q.items.splice(q.items.indexOf(it), 1);
    it.onShow?.();
    const b = new ShioriBrief(sc, { pages: it.pages, overModal: it.overModal, onClose: (reason) => {
        if (sc.__briefQ) sc.__briefQ.cur = null;
        it.onClose?.(reason);
        sc.guide?.update?.(); // 숨겨 두었던 조작 안내 복귀
        if (sc.sys?.isActive()) sc.time.delayedCall(250, () => pump(sc));
    } });
    b.key = it.key;
    q.cur = b;
    sc.guide?.hide?.(); // 동시에 1개만
}

function ensureTimer(sc) {
    const q = Q(sc);
    if (q.timer) return;
    q.timer = sc.time.addEvent({ delay: 400, loop: true, callback: () => {
        const qq = sc.__briefQ;
        if (!qq) return;
        if (!qq.items.length) { qq.timer?.remove(); qq.timer = null; return; }
        pump(sc);
    } });
}

export function enqueueBrief(sc, item) {
    if (!sc?.sys?.isActive() || !item?.key || briefQueued(sc, item.key)) return false;
    const q = Q(sc);
    const it = { pri: BRIEF_PRI.concept, ...item, seq: (q.seq += 1) };
    if (it.pages && typeof it.pages.then === 'function') {
        const p = it.pages; it.pages = null;
        p.then((pages) => { if (Array.isArray(pages) && pages.length) { it.pages = pages; pump(sc); } else it.dead = true; })
            .catch((e) => { it.dead = true; console.warn('[brief] 문구 로드 실패(생략)', e); });
    }
    q.items.push(it);
    ensureTimer(sc);
    pump(sc);
    return true;
}
