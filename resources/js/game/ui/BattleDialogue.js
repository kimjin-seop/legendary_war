import { Button } from './Button.js';
import { makeText, fitText, bindShortWords } from './common.js';
import { slice, setSliceSize } from './skin.js';
import { tween, isInstant } from './motion.js';
import { L } from '../layout.js';
import { COLOR, CSS, MIN_TOUCH, view } from '../theme.js';
import { fillTokens, speakerInfo } from '../dialogue/dialogueData.js';
import { dialoguePortraitLogical, drawSilhouette, facelessSpeaker } from '../dialogue/portraitStage.js';
import { ensurePortraitTex, texKey } from '../assets.js';
import { settings } from '../settings.js';
import { loadDialogueFont, useDialogueFont, dialogueFontReady } from '../dialogue/dialogueFont.js';
import { LineFx } from '../dialogue/lineFx.js';

// 전투 이벤트 대사 오버레이(노벨/SRPG식). 전투 판정은 서버에 둔다. 닫힐 때까지 Fx 큐의 다음 연출을 기다린다.
// 계약(Battle.onStoryEvent): new BattleDialogue(scene, event, done) / relayout() / 씬 shutdown 시 done 없이 정리.
// - 입력 잠금: 열린 동안 scene.modalCount +1(전투 입력·Enter·ESC 차단). 위에 다른 Modal 이 열리면 그 모달이 우선.
// - 화면: 반투명 차단막 + 화자 초상화(좌/우, 비화자 dim) + 하단 대사 패널(uiskin dialog.box / dialog.nameplate) + 캡션은 상단 띠.
// - 넘기기: 화면 탭 / Enter / Space(타이핑 중이면 전체 표시), 스킵 버튼 / ESC = 즉시 종료(done 호출).
// - 초상화: dialogue/portraitStage.js 키 규약(Dialogue 씬과 공용) + assets.ensurePortraitTex 지연 로드, 없으면 실루엣 + 이름.
const TYPE_MS = 28;
const idOf = (info) => info.code ?? info.name;

export class BattleDialogue {
    constructor(scene, event, done) {
        this.scene = scene;
        this.event = event;
        this.done = done;
        this.lines = (event.dialogue ?? []).filter((line) => line && typeof line.text === 'string' && line.text.trim()); // verify 값과 무관하게 표시(사용자 방침 2026-11-03). 서버 BattleStory 가 unverified 줄을 거르는 것은 BE 쪽
        this.lineIndex = 0;
        this.pageIndex = 0;
        this.portraits = new Map(); // side(left|right) -> { c, img, key, info, expr, id, silText }
        this.active = null;
        this.onShutdown = () => this.destroy();
        scene.events.once('shutdown', this.onShutdown);
        if (!this.lines.length) { this.finish(); return; }
        scene.modalCount = (scene.modalCount ?? 0) + 1;
        this.level = scene.modalCount; // 이 값보다 크면 위에 다른 모달이 열린 상태
        (scene.__modals ??= new Set()).add(this); // 입력 잠금 감시 등록부(ui/Modal 과 같은 규칙)
        scene.events.emit('modal-open'); // 뒤쪽 버튼 호버 해제(Modal 과 동일)
        this.bindKeys();
        this.build(false);
        // 대사 글꼴이 아직 안 왔으면(Battle.create 에서 미리 받는 중) 도착 후 한 번 다시 그린다(캔버스 텍스트는 글꼴이 늦게 와도 저절로 바뀌지 않음)
        if (!dialogueFontReady()) loadDialogueFont(8000).then((ok) => { if (ok && !this.closed && this.root) this.relayout(); });
    }

    // ---- 배치 ----
    layout() {
        const { lw, lh, safe, portrait, short } = L; // short = 가로 폰: dialogueLayout 과 같은 압축 값
        const m = short ? 8 : 12;
        const bh = Math.max(MIN_TOUCH, Math.ceil(MIN_TOUCH / (view.scale || 1)));
        const w = Math.min(1100, lw - safe.l - safe.r - m * 2);
        const h = portrait ? 276 : short ? 150 : 220; // dialogueLayout 과 같은 값(2026-11-02 글자 키움, 이전 236/184)
        const x = safe.l + (lw - safe.l - safe.r - w) / 2;
        const box = { x, y: lh - safe.b - m - h, w, h };
        const topY = safe.t + (short ? 6 : 10);
        const stageTop = topY + bh + (short ? 8 : 16);
        const room = box.y + 32 - stageTop; // 초상화 바닥(box.y + 32)부터 위로 쓸 수 있는 높이
        this.lay = {
            bh, box, topY, m,
            band: { x, y: stageTop, w },
            portraitH: Math.max(120, portrait ? Math.min(room * 0.62, lh * 0.42) : Math.min(room, lh * 0.74)),
            portraitMaxW: portrait ? lw * 0.62 : short ? lw * 0.3 : lw * 0.36,
            baseY: box.y + (short ? 24 : 32),
            textSize: portrait ? 23 : short ? 20 : 26, // 이전 18/20
            nameSize: portrait ? 22 : short ? 18 : 23, // 이전 18
            nameH: short ? 34 : 44, // 이전 36
            textY: short ? 28 : 36, // 이전 30
        };
    }

    slotX(side) {
        const { box } = this.lay;
        const k = L.portrait ? 0.27 : 0.2;
        return side === 'left' ? box.x + box.w * k : box.x + box.w * (1 - k);
    }

    build(instant) {
        const sc = this.scene;
        this.layout();
        const { lw, lh } = L;
        const { box, bh, topY, band } = this.lay;
        this.root = sc.add.container(0, 0).setDepth(1000);
        // 차단막: 전투 화면을 어둡게 + 입력 소비. 이 막에서 눌렀다 뗀 탭만 넘기기(열리기 전 누른 포인터의 pointerup 무시)
        // 대사 카메라가 있는 씬(전투)은 화자 유닛이 보이게 덜 어둡게(0.5 -> 0.3)
        this.block = sc.add.rectangle(0, 0, lw, lh, COLOR.ink, typeof sc.dialogueFocus === 'function' ? 0.3 : 0.5).setOrigin(0).setInteractive();
        this.block.on('pointerdown', () => { this.downOnBlock = true; });
        this.block.on('pointerup', (p) => {
            const ok = this.downOnBlock && p.getDistance() < 16;
            this.downOnBlock = false;
            if (ok && this.usable()) this.advance();
        });
        this.portraitLayer = sc.add.container(0, 0);
        // 줄 효과 덮개(초상화 위·캡션 띠/대사 패널 아래, dialogue/lineFx.js)
        this.lineFx ??= new LineFx(sc);
        this.fxRect = this.lineFx.attach(sc.add.rectangle(0, 0, lw, lh, 0x000000, 1).setOrigin(0).setAlpha(0));
        // 하단 대사 패널
        this.panel = sc.add.container(box.x, box.y);
        this.panel.add(slice(sc, 'dialog', box.w, box.h, 'panel', { corner: L.portrait ? 0.6 : L.short ? 0.75 : 1 })); // Dialogue 와 같은 모서리 배율
        const nh = this.lay.nameH;
        this.nameTag = sc.add.container(16, -Math.round(nh / 2));
        this.nameBg = slice(sc, 'nameplate', 200, nh, 'ribbon');
        this.nameT = useDialogueFont(makeText(sc, 100, nh / 2, '', { size: this.lay.nameSize, heading: true, color: '#f0d58c', origin: [0.5, 0.5] }));
        this.nameTag.add([this.nameBg, this.nameT]);
        this.text = useDialogueFont(makeText(sc, 24, this.lay.textY, '', { size: this.lay.textSize, wrap: box.w - 48 }));
        this.note = makeText(sc, 24, box.h - 22, '', { size: 12, color: CSS.muted, origin: [0, 0.5] });
        this.nextMark = makeText(sc, box.w - 22, box.h - 22, '다음 ▼', { size: 14, bold: true, color: CSS.accent, origin: [1, 0.5] });
        this.panel.add([this.nameTag, this.text, this.note, this.nextMark]);
        this.textMaxH = box.h - this.lay.textY - 40;
        // 캡션 상단 띠(자막: 화자 없음)
        this.band = sc.add.container(band.x, band.y).setVisible(false);
        this.bandBg = slice(sc, 'panel_hud', band.w, 72, 'panel');
        this.bandText = useDialogueFont(makeText(sc, band.w / 2, 18, '', { size: this.lay.textSize - 1, wrap: band.w - 56, align: 'center', origin: [0.5, 0] }));
        this.bandNext = makeText(sc, band.w - 16, 56, '▼', { size: 14, color: CSS.accent, origin: [1, 0.5] });
        this.band.add([this.bandBg, this.bandText, this.bandNext]);
        this.bandMaxH = L.portrait ? 220 : 150;
        // 상단: 이벤트 이름(좌) + 스킵(우)
        const skipW = 96;
        const bx = lw - L.safe.r - this.lay.m - skipW;
        this.title = makeText(sc, L.safe.l + 16, topY + bh / 2, this.event.name || '전장의 기록', { size: 15, heading: true, color: '#f0d58c', origin: [0, 0.5] });
        fitText(this.title, bx - L.safe.l - 32);
        // 이벤트 이름 뒤 불투명 판: 아래 전투 HUD 의 '아군 턴 N' 글자와 겹쳐 보이지 않게(상단 바 높이만큼 가림)
        this.titleBg = sc.add.rectangle(0, 0, Math.max(L.safe.l + 16 + this.title.width + 20, Math.min(320, bx - 8)), topY + bh + 4, COLOR.ink, 1).setOrigin(0); // 최소 320px: 아래 '아군 턴 N' 전체를 가림
        this.skipBtn = new Button(sc, { x: bx, y: topY, w: skipW, h: bh, label: '스킵', size: 15, modal: true, onClick: () => { if (this.usable()) this.close(); } });
        this.root.add([this.block, this.portraitLayer, this.fxRect, this.band, this.panel, this.titleBg, this.title, this.skipBtn]);
        if (settings.get().fxLevel === 0 && !isInstant()) {
            this.blink = sc.tweens.add({ targets: [this.nextMark, this.bandNext], alpha: 0.35, duration: 520, yoyo: true, repeat: -1 });
        }
        if (!instant) { this.root.setAlpha(0); tween(sc, { targets: this.root, to: { alpha: 1 }, duration: 160 }); }
        this.showLine(instant);
    }

    clearView() {
        this.typing?.remove();
        this.typing = null;
        this.blink?.remove();
        this.blink = null;
        this.lineFx?.clear(); // 줄 효과(암전·흔들림) 정리: 스킵·ESC·종료·재배치에서 남지 않게
        // 초상 잔상 방지(fe43): 진행 중 트윈(등장·강조·크로스페이드)을 끊고 화자 컨테이너를 먼저 명시적으로 파괴한 뒤 root 파괴
        const tw = this.scene?.tweens;
        this.portraits.forEach((p) => { tw?.killTweensOf([p.c, p.img].filter(Boolean)); p.c?.destroy(); });
        this.root?.destroy();
        this.root = null;
        this.portraits.clear();
        this.active = null;
    }

    // ---- 입력 ----
    usable() { return !this.closed && !!this.scene?.sys && (this.scene.modalCount ?? 0) <= this.level; }

    bindKeys() {
        const kb = this.scene.input.keyboard;
        if (!kb) return;
        // 전투 씬의 Enter/Space/ESC 핸들러가 먼저 등록되어 있고 modalCount 로 막힌다. 같은 키 이벤트에서 이쪽만 반응.
        this.keyGo = (e) => { if (!e?.repeat && this.usable()) this.advance(); };
        this.keyEsc = (e) => {
            if (e?.repeat || !this.usable() || performance.now() - (this.scene.lastModalEsc ?? 0) < 200) return; // 위 모달을 ESC 로 닫은 같은 입력은 무시
            this.scene.lastModalEsc = performance.now();
            this.close();
        };
        kb.on('keydown-ENTER', this.keyGo);
        kb.on('keydown-SPACE', this.keyGo);
        kb.on('keydown-ESC', this.keyEsc);
    }

    unbindKeys() {
        const kb = this.scene?.input?.keyboard;
        if (!kb || !this.keyGo) return;
        kb.off('keydown-ENTER', this.keyGo);
        kb.off('keydown-SPACE', this.keyGo);
        kb.off('keydown-ESC', this.keyEsc);
        this.keyGo = null;
    }

    // ---- 화자/초상화 ----
    speakerOf(line) {
        if (line.speaker === 'caption' || line.speaker === 'narrator') return { kind: 'caption', name: '기록' }; // narrator = 캡션(Dialogue 씬·CuePlayer 와 같은 규칙, ch26 battle_cues 등)
        const raw = String(line.speaker ?? '');
        const info = { ...speakerInfo(raw.startsWith('npc:') ? raw.slice(4) : raw) };
        if (info.kind === 'hero' && info.code && !info.npc) { // 전투 중 아군 유닛 이름이 있으면 그 이름(코드가 있는 영웅만: null 코드가 무명 유닛과 짝지어지는 오표시 방지)
            const unit = this.scene.store?.state?.units?.find((u) => u.hero === info.code || u.hero?.code === info.code);
            const nm = unit?.hero_name ?? unit?.name_ko ?? unit?.name;
            if (nm) info.name = nm;
        }
        if (typeof line.name === 'string' && line.name.trim()) info.name = line.name.trim(); // 데이터가 이름을 주면 우선
        else if (info.npc && (!info.name || /^npc[_:]/.test(info.name))) info.name = '부장'; // 이름을 모르는 NPC: 코드 대신 일반 이름
        // 초상 폴백(부장/병종 초상)용 병종·문화권: 줄 데이터(액터 sprite.unit_type 등) > 전투 문화권
        if (typeof line.troop === 'string' && line.troop && info.kind !== 'troop') info.troop = line.troop;
        if (info.kind !== 'troop') info.culture ??= line.culture ?? this.scene.store?.state?.culture ?? this.scene.store?.state?.map?.culture ?? null;
        return info;
    }

    sideFor(info) {
        const id = idOf(info);
        for (const [side, p] of this.portraits) if (p.id === id) return side;
        const pref = info.kind === 'shiori' || info.kind === 'protagonist' ? 'left' : 'right'; // 시오리·주인공 좌측, 그 외 우측(Dialogue 씬과 동일)
        const other = pref === 'left' ? 'right' : 'left';
        return this.portraits.get(pref) && this.portraits.get(pref) === this.active ? other : pref; // 같은 쪽 직전 화자와 대화하면 반대편
    }

    showPortrait(info, expr) {
        if (this.closed || !this.root || !this.portraitLayer?.scene) return; // 종료 후 늦게 도착한 초상 로드 콜백·트윈이 새 이미지를 만들지 않게
        const sc = this.scene;
        const id = idOf(info);
        const side = this.sideFor(info);
        const { portraitH: H, portraitMaxW, baseY } = this.lay;
        const line = this.lineIndex;
        const logical = dialoguePortraitLogical(info, expr);
        let p = this.portraits.get(side);
        // 초상 없는 일반 화자: 실루엣 자리를 만들지 않고 이름표+대사만(무대의 다른 화자는 전원 dim). 없는 파일 요청도 하지 않는다
        if ((!p || p.id !== id) && !(logical && sc.textures.exists(texKey(logical))) && facelessSpeaker(info, logical)) { this.setActive(null); return; }
        const key = logical ? ensurePortraitTex(sc, logical, (tex) => {
            // 받기 실패(tex null)여도 논리 키가 폴백(부장/병종 초상)으로 바뀌었으면 다시 그린다(실패 키는 재콜백 없음 -> 반복 없음)
            if ((tex || dialoguePortraitLogical(info, expr) !== logical) && !this.closed && this.root && this.lineIndex === line && this.portraits.get(side)?.id === id) this.showPortrait(info, expr);
        }) : null;
        if (!p || p.id !== id) {
            p?.c.destroy();
            const x = this.slotX(side);
            const c = sc.add.container(x + (side === 'left' ? -40 : 40), baseY).setAlpha(0);
            this.portraitLayer.add(c);
            p = { c, img: null, key: null, info, id, side };
            this.portraits.set(side, p);
            tween(sc, { targets: c, to: { alpha: 1, x }, duration: 220, ease: 'Cubic.easeOut' });
        }
        p.info = info;
        p.expr = expr;
        if (key && sc.textures.exists(key)) {
            if (p.key !== key) {
                const img = sc.add.image(0, 0, key).setOrigin(0.5, 1);
                img.setScale(Math.min(H / img.height, portraitMaxW / img.width));
                if (p.silText) { p.silText.destroy(); p.silText = null; }
                if (p.img) { // 표정 교체: 0.15초 크로스페이드
                    const old = p.img;
                    img.setAlpha(0);
                    p.c.add(img);
                    tween(sc, { targets: img, to: { alpha: 1 }, duration: 150 });
                    tween(sc, { targets: old, to: { alpha: 0 }, duration: 150, onComplete: () => old.destroy() });
                } else p.c.add(img);
                p.img = img;
                p.key = key;
            }
        } else if (!p.img) { // 실루엣 + 이름(받는 중이면 받는 대로 교체)
            const silH = Math.min(H, portraitMaxW / 0.6);
            const [sil, nm] = drawSilhouette(sc, silH, info.name, L.portrait ? 18 : 20);
            if (silH < 240) nm.setVisible(false); // 낮은 화면: 실루엣 이름이 이름표 위로 삐져나오므로 생략(이름은 이름표에)
            p.c.add([sil, nm]);
            p.img = sil;
            p.silText = nm;
            p.key = 'silhouette';
        }
        this.setActive(p);
    }

    // 화자 강조 / 비화자 어둡게(p = null 이면 전원 어둡게: 캡션)
    setActive(p) {
        this.active = p;
        const { baseY } = this.lay;
        this.portraits.forEach((q) => {
            const on = q === p;
            if (q.img?.setTint) q.img.setTint(on ? 0xffffff : 0x5c6070);
            tween(this.scene, { targets: q.c, to: { alpha: 1, scale: on ? 1 : 0.94, y: on ? baseY : baseY + 10 }, duration: 160 });
            if (on) this.portraitLayer.bringToTop(q.c);
        });
    }

    // ---- 대사 ----
    paginate(t, full, maxH) {
        full = bindShortWords(full); // 한 글자 어절이 줄 끝에 홀로 남지 않게(ui/common.js)
        t.setText(full);
        const wrapped = t.getWrappedText(full);
        const lh = t.height / Math.max(1, wrapped.length);
        const per = Math.max(1, Math.floor(maxH / Math.max(1, lh)));
        const pages = [];
        for (let i = 0; i < wrapped.length; i += per) pages.push(wrapped.slice(i, i + per).join('\n'));
        return pages.length ? pages : [''];
    }

    showLine(instant = false) {
        const line = this.lines[this.lineIndex];
        const info = this.speakerOf(line);
        const caption = info.kind === 'caption';
        const full = fillTokens(line.text, this.event.tokens);
        // 줄 효과(sfx·shake·fade·blackout, bg 는 무시)는 줄이 처음 나올 때 1회(쪽 넘김·재배치에서는 재생 안 함, 재배치 시 암전 상태만 복원)
        if (this.fxLine !== this.lineIndex) { this.fxLine = this.lineIndex; this.lineFx?.apply(line); } else if (line.blackout === true || line.fade === 'out') this.fxRect?.setAlpha(1);
        this.panel.setVisible(!caption);
        this.band.setVisible(caption);
        // 대사 카메라(Battle.dialogueFocus): 화자 유닛으로 짧게 팬(배율 유지, 대사창 위). 같은 화자 다음 줄·쪽은 그대로, 유닛 없는 화자는 카메라 그대로
        try { this.scene.dialogueFocus?.(info, line, instant, this.lay?.box?.y); } catch (e) { console.warn('[dialogueCam]', e); } // 카메라 실패는 대사 진행을 막지 않는다
        let target;
        if (caption) {
            this.pages = this.paginate(this.bandText, full, this.bandMaxH);
            this.pageIndex = Math.min(this.pageIndex, this.pages.length - 1);
            this.bandText.setText(this.pages[this.pageIndex]);
            const bh = Math.max(64, this.bandText.height + 40);
            setSliceSize(this.bandBg, this.lay.band.w, bh);
            this.bandNext.y = bh - 16;
            this.setActive(null);
            target = this.bandText;
        } else {
            this.nameT.setText(info.name);
            fitText(this.nameT, Math.min(this.lay.box.w * 0.6, 320) - 40);
            const nw = Math.max(120, this.nameT.width + 40);
            setSliceSize(this.nameBg, nw, this.lay.nameH);
            this.nameT.x = nw / 2;
            this.pages = this.paginate(this.text, full, this.textMaxH);
            this.pageIndex = Math.min(this.pageIndex, this.pages.length - 1);
            const page = this.pages.length > 1 ? ` · ${this.pageIndex + 1}/${this.pages.length}쪽` : '';
            this.note.setText(`${this.lineIndex + 1}/${this.lines.length}${page}`); // 창작 표기 없음(사용자 방침)
            this.showPortrait(info, line.expr);
            target = this.text;
        }
        this.type(target, this.pages[this.pageIndex], instant);
    }

    type(t, str, instant) {
        this.typing?.remove();
        this.typing = null;
        const marks = [this.nextMark, this.bandNext];
        if (instant || isInstant() || settings.get().fxLevel === 2 || !str) { t.setText(str); marks.forEach((m) => m.setVisible(true)); return; }
        marks.forEach((m) => m.setVisible(false));
        this.typingTarget = t;
        this.typingFull = str;
        let n = 0;
        t.setText('');
        this.typing = this.scene.time.addEvent({
            delay: TYPE_MS / (settings.get().speed || 1), loop: true,
            callback: () => { n += 1; t.setText(str.slice(0, n)); if (n >= str.length) this.endTyping(); },
        });
    }

    endTyping() {
        this.typing?.remove();
        this.typing = null;
        this.typingTarget?.setText(this.typingFull);
        this.nextMark?.setVisible(true);
        this.bandNext?.setVisible(true);
    }

    advance() {
        if (this.closed || !this.root) return;
        if (this.typing) { this.endTyping(); return; }
        if (this.pageIndex + 1 < this.pages.length) this.pageIndex += 1;
        else {
            this.lineIndex += 1;
            this.pageIndex = 0;
            if (this.lineIndex >= this.lines.length) { this.close(); return; }
        }
        this.showLine();
    }

    // 회전/리사이즈: 현재 줄·쪽 유지, 무대 위 화자(비화자 -> 화자 순)도 다시 세운다
    relayout() {
        if (this.closed || !this.root) return;
        const cast = [...this.portraits.values()].sort((a, b) => (a === this.active) - (b === this.active)).map((p) => ({ info: p.info, expr: p.expr }));
        this.clearView();
        this.build(true);
        const cur = this.speakerOf(this.lines[this.lineIndex]);
        cast.filter((c) => idOf(c.info) !== idOf(cur)).forEach((c) => this.showPortrait(c.info, c.expr));
        if (cur.kind !== 'caption') this.showPortrait(cur, this.lines[this.lineIndex].expr);
        else this.setActive(null);
    }

    // 끝/스킵: 화면 정리 + 입력 복구 + done(완료 기록·다음 연출은 호출 측)
    close() {
        if (this.closed) return;
        this.teardown();
        this.finish();
    }

    teardown() {
        this.unbindKeys();
        this.clearView();
        const sc = this.scene;
        if (this.level && sc) sc.modalCount = Math.max(0, (sc.modalCount ?? 1) - 1);
        sc?.__modals?.delete(this);
        this.level = 0;
    }

    finish() {
        if (this.closed) return;
        this.closed = true;
        this.scene?.events?.off('shutdown', this.onShutdown);
        const done = this.done;
        this.done = null;
        done?.();
    }

    destroy() {
        if (this.closed) return;
        this.closed = true;
        this.done = null; // 씬 종료 중에는 다음 Fx를 실행하지 않는다. 미완 대사는 재진입 시 다시 표시한다.
        this.teardown();
    }
}
