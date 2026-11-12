import Phaser from 'phaser';
import { L, setupCamera, relayoutOnChange } from '../layout.js';
import { COLOR, CSS, syncView } from '../theme.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { makeText, addBackdrop, fitText } from '../ui/common.js';
import { PortraitPicker, renderProtagonistArt } from '../ui/PortraitPicker.js';
import { protagonistName } from '../dialogue/dialogueData.js';
import { messageOf } from '../api/errors.js';
import { getProtagonist, saveProtagonist, changeFace, mergeState } from '../campaign/protagonistApi.js';
import { classTitle, classTroop, applyProtagonistState } from '../campaign/protagonistQuiz.js';
// import { isSeen, markSeen } from '../campaign/campaignFlow.js'; // (원복 시 복원: complete 의 ch1_open 분기용)

// 캐릭터 생성(열람 카드). 모든 표시 데이터(성별·초상화 후보·클래스·문항·재검사 한도)는 서버 GET /api/protagonist.
// - 미생성: 성별 -> 초상화 -> 검사/직접 선택 -> 저장(POST) -> 결과(다시 검사·직접 선택·이대로 진행) -> 로비(ch1_open 은 ch1_s1 진입 시)
// - 생성됨(mode 'create'): 현재 카드(hub) -> 초상화 변경(PUT face) / 다시 작성(성별 변경은 서버 allow_gender_change 일 때만) / 돌아가기
// - mode 'face': 초상화만 변경(PUT) 후 복귀
// - 건너뛰기(미생성만) = POST mode skip. 서버 장애(조회·저장 실패)면 저장 없이 진행하는 폴백만 제공(나중에 1장 '주인공 열람 카드'에서 작성)
// index.js 에 등록하지 않고 campaign/characterCreate.js 가 런타임 등록한다(index.js 수정 금지 기간).
// 진입 data: { next?:{scene,data}, mode?:'create'|'face', state?(재배치 복구) }
export class CharacterCreateScene extends Phaser.Scene {
    constructor() { super('CharacterCreate'); }

    init(data) {
        this.next = data?.next ?? null;
        this.mode = data?.mode ?? 'create';
        this.st = data?.state ?? { step: 'loading', gender: null, face: null, answers: {}, qi: 0, cls: null, source: null, flow: null };
        this.data0 = data?.data0 ?? null;
        this.modalCount = 0;
        this.busy = false;
    }

    create() {
        syncView();
        setupCamera(this, CSS.bg);
        relayoutOnChange(this, () => ({ next: this.next, mode: this.mode, state: this.st, data0: this.data0 }));
        addBackdrop(this, L.lw, L.lh);
        this.add.graphics().fillGradientStyle(0x0b1328, 0x0b1328, 0x1b2a4a, 0x1b2a4a, 1).fillRect(0, 0, L.lw, L.lh);
        this.root = this.add.container(0, 0);
        if (this.data0 && this.st.step !== 'loading') { this.render(); return; }
        this.loadData();
    }

    loadData() { // 이름 주의: load() 는 Phaser 씬의 LoaderPlugin(this.load)을 덮어쓴다
        this.root.removeAll(true);
        this.loadingT?.destroy();
        this.loadingT = makeText(this, L.lw / 2, L.lh / 2, '열람 카드를 준비하는 중…', { size: 18, color: CSS.muted, origin: [0.5, 0.5] });
        getProtagonist().then((d) => {
            if (!this.sys.isActive()) return;
            if (!d || !d.available) { this.showError('주인공 기능을 아직 사용할 수 없습니다.'); return; }
            this.data0 = d;
            applyProtagonistState(d);
            const base = { gender: d.gender ?? this.st.gender, face: d.face ?? this.st.face, cls: d.cls, source: d.source };
            if (this.mode === 'face') {
                if (!d.created) { this.showError('주인공을 먼저 만들어야 초상화를 바꿀 수 있습니다.'); return; }
                this.go('face', { ...base, flow: 'face' });
            } else if (d.created) this.go('result', { ...base, flow: 'hub' });
            else this.go('gender', { flow: 'new' });
        }).catch((e) => { if (this.sys.isActive()) this.showError(`불러오지 못했습니다: ${messageOf(e)}`); });
    }

    // 조회 실패·기능 꺼짐: 다시 시도 / (미생성 첫 진입) 저장 없이 진행 / 돌아가기
    showError(msg) {
        this.loadingT?.setText(msg);
        const y = L.lh / 2 + 34;
        const firstRun = this.mode === 'create' && !this.next;
        const btns = [['다시 시도', () => this.loadData()], firstRun ? ['건너뛰고 진행', () => this.complete('열람 카드는 임진왜란 기록에서 나중에 작성할 수 있습니다')] : ['돌아가기', () => this.leave()]];
        btns.forEach(([label, fn], i) => this.root.add(new Button(this, { x: L.lw / 2 - 170 + i * 180, y, w: 160, label, variant: i ? 'primary' : 'default', onClick: fn })));
    }

    get quiz() { return this.data0?.quiz ?? null; }
    get classes() { return this.data0?.classes ?? []; }
    get created() { return !!this.data0?.created; }
    get pname() { return this.data0?.displayName || protagonistName(); }
    classOf(code) { return this.classes.find((c) => c.code === code) ?? null; }
    retestLeft() { const r = this.data0?.retest; return !this.created || !r || r.limit <= 0 ? null : r.remaining ?? Math.max(0, r.limit - r.used); }

    // 공통 틀: 제목·부제·본문 영역(area)·하단 건너뛰기(미생성만)
    frame(title, sub) {
        this.loadingT?.destroy(); this.loadingT = null;
        this.root.removeAll(true);
        const m = 16;
        const w = Math.min(980, L.lw - L.safe.l - L.safe.r - m * 2);
        const x = Math.round((L.lw - w) / 2);
        const top = L.safe.t + 16;
        this.root.add(makeText(this, x, top, '열람 카드', { size: 13, color: CSS.muted }));
        this.root.add(fitText(makeText(this, x, top + 20, title, { size: L.portrait ? 22 : 26, heading: true, color: '#f0d58c' }), w));
        const st = makeText(this, x, top + 56, sub ?? '', { size: 15, color: CSS.text, wrap: w });
        this.root.add(st);
        const bottomH = 56;
        const y = top + 56 + st.height + 16;
        if (this.st.flow === 'new' && !this.created) {
            this.root.add(new Button(this, { x: x + w - 140, y: L.lh - L.safe.b - bottomH, w: 140, h: 44, label: '건너뛰기', size: 15, onClick: () => this.askSkip() }));
        }
        return { x, y, w, h: L.lh - L.safe.b - bottomH - 12 - y };
    }

    render() {
        const step = this.st.step;
        if (step === 'gender') return this.stepGender();
        if (step === 'face') return this.stepFace();
        if (step === 'method') return this.stepMethod();
        if (step === 'quiz') return this.stepQuiz();
        if (step === 'pick') return this.stepPick();
        if (step === 'result') return this.stepResult();
        return null;
    }

    go(step, patch = {}) { Object.assign(this.st, patch, { step }); this.render(); }
    backBtn(label, fn) { this.root.add(new Button(this, { x: Math.round((L.lw - Math.min(980, L.lw - L.safe.l - L.safe.r - 32)) / 2), y: L.lh - L.safe.b - 56, w: 120, h: 44, label, size: 15, onClick: fn })); }
    // 다시 작성 흐름의 처음: 성별 변경이 허용되면 성별부터, 아니면 초상화부터
    genderEditable() { return !this.created || this.data0?.retest?.allowGenderChange !== false; }

    stepGender() {
        const a = this.frame('서고에서의 모습', `${this.pname} 님, 서고 안에서 보일 모습을 고르십시오. 대사는 성별과 무관하게 같습니다.`);
        const gs = this.data0?.genders?.length ? this.data0.genders : ['m', 'f'];
        const bw = Math.min(260, Math.floor((a.w - 16 * (gs.length - 1)) / gs.length));
        const by = a.y + Math.max(0, Math.round(a.h / 2 - 60));
        const x0 = a.x + Math.round((a.w - (bw * gs.length + 16 * (gs.length - 1))) / 2);
        gs.forEach((g, i) => {
            this.root.add(new Button(this, { x: x0 + i * (bw + 16), y: by, w: bw, h: 120, label: g === 'f' ? '여성' : '남성', size: 22, variant: this.st.gender === g ? 'primary' : 'default', onClick: () => this.go('face', { gender: g, face: this.st.gender === g ? this.st.face : null }) }));
        });
        if (this.st.flow === 'redo') this.backBtn('취소', () => this.backToHub());
    }

    stepFace() {
        const g = this.st.gender ?? 'm';
        const faceOnly = this.st.flow === 'face';
        const a = this.frame(faceOnly ? '초상화 변경' : '초상화 선택', '세 가지 모습 중 하나를 고르십시오. 카드를 눌러 비교하고, 표정 버튼으로 미리 볼 수 있습니다.');
        const faces = this.data0?.faces?.[g] ?? [];
        const ph = Math.max(260, a.h - 56);
        this.picker = new PortraitPicker(this, {
            x: a.x, y: a.y, w: a.w, h: ph, faces, gender: g, value: this.st.face ?? faces[0], name: this.pname,
            confirmLabel: faceOnly ? '초상화 변경' : '이 모습으로',
            onChange: (f) => { this.st.face = f; },
            onConfirm: (f) => { this.st.face = f; if (faceOnly) this.saveFace(); else this.go('method'); },
        });
        this.root.add(this.picker);
        if (faceOnly) this.backBtn('취소', () => (this.mode === 'face' ? this.leave() : this.backToHub()));
        else if (this.genderEditable()) this.backBtn('이전', () => this.go('gender'));
        else this.backBtn('취소', () => this.backToHub());
    }

    stepMethod() {
        const a = this.frame('지휘 성향', '서고가 카드를 읽어 지휘 성향(공명)을 추천합니다. 정답은 없습니다. 직접 고르셔도 됩니다.');
        const bw = Math.min(320, a.w);
        const bx = a.x + Math.round((a.w - bw) / 2);
        const n = this.quiz?.questions?.length ?? 0;
        if (n) this.root.add(new Button(this, { x: bx, y: a.y + 20, w: bw, h: 64, label: `질문에 답하기 (${n}문항)`, variant: 'primary', size: 18, onClick: () => this.go('quiz', { qi: 0, answers: {} }) }));
        this.root.add(new Button(this, { x: bx, y: a.y + (n ? 100 : 20), w: bw, h: 56, label: '직접 고르기', size: 17, variant: n ? 'default' : 'primary', onClick: () => this.go('pick') }));
        this.retestNote(a.x, a.y + (n ? 176 : 96), a.w);
        this.backBtn('이전', () => this.go('face'));
    }

    // 생성 후 재작성은 일일 상한 소모(서버 retest). 남은 횟수 안내
    retestNote(x, y, w) {
        const left = this.retestLeft();
        if (left == null) return;
        this.root.add(makeText(this, x + w / 2, y, left > 0 ? `카드를 다시 쓰면 오늘 남은 재검사 ${left}회 중 1회를 씁니다.` : '오늘 재검사 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요.', { size: 13, color: left > 0 ? CSS.muted : CSS.dangerText, origin: [0.5, 0] }));
    }

    stepQuiz() {
        const qs = this.quiz?.questions ?? [];
        if (!qs.length) { this.go('pick'); return; }
        const qi = Math.max(0, Math.min(this.st.qi, qs.length - 1));
        const q = qs[qi];
        const a = this.frame(`질문 ${qi + 1} / ${qs.length}`, q.text);
        this.root.add(this.add.rectangle(a.x, a.y - 6, a.w, 4, COLOR.navyDeep, 1).setOrigin(0));
        this.root.add(this.add.rectangle(a.x, a.y - 6, Math.round(a.w * (qi / qs.length)), 4, COLOR.accent, 1).setOrigin(0));
        const cur = this.st.answers?.[q.id];
        const bw = Math.min(640, a.w);
        const bx = a.x + Math.round((a.w - bw) / 2);
        const bh = 52;
        q.choices.forEach((c, k) => {
            this.root.add(new Button(this, { x: bx, y: a.y + 10 + k * (bh + 10), w: bw, h: bh, label: `${k + 1}. ${c.text}`, size: 16, variant: cur === c.id ? 'primary' : 'default', onClick: () => this.answer(q, c) }));
        });
        this.backBtn('이전', () => (qi > 0 ? this.go('quiz', { qi: qi - 1 }) : this.go('method')));
        this.bindNumberKeys(q);
    }

    bindNumberKeys(q) {
        const kb = this.input.keyboard;
        if (!kb) return;
        if (this.numFn) kb.off('keydown', this.numFn);
        this.numFn = (ev) => {
            if (this.st.step !== 'quiz' || this.modalCount || ev.repeat) return;
            const n = Number(ev.key);
            if (n >= 1 && n <= q.choices.length) this.answer(q, q.choices[n - 1]);
        };
        kb.on('keydown', this.numFn);
        this.events.once('shutdown', () => kb.off('keydown', this.numFn));
    }

    answer(q, c) {
        const answers = { ...(this.st.answers ?? {}), [q.id]: c.id };
        const qs = this.quiz.questions;
        const qi = qs.findIndex((x) => x.id === q.id);
        Object.assign(this.st, { answers });
        const missing = qs.findIndex((x) => !answers[x.id]);
        if (qi + 1 < qs.length) { this.go('quiz', { qi: qi + 1 }); return; }
        if (missing >= 0) { this.go('quiz', { qi: missing }); return; } // 서버는 전 문항 답 필수
        // 마지막 문항: 추천(class)은 서버 채점 결과가 단일 출처
        this.save({ mode: 'quiz', answers }, (d) => this.go('result', { cls: d.cls, source: 'quiz', flow: 'done' }));
    }

    stepPick() {
        const a = this.frame('지휘 성향 직접 고르기', '원하는 성향을 고르십시오. 곁에 둘 병사의 병종이 함께 정해집니다.');
        const list = this.classes;
        const cols = a.w >= 720 ? 2 : 1;
        const gap = 12;
        const cw = Math.floor((a.w - gap * (cols - 1)) / cols);
        const ch = 76;
        list.forEach((c, i) => {
            const x = a.x + (i % cols) * (cw + gap); const y = a.y + Math.floor(i / cols) * (ch + gap);
            this.root.add(new Button(this, { x, y, w: cw, h: ch, label: `${classTitle(c)} · ${classTroop(c.code)}`, size: 17, variant: this.st.cls === c.code ? 'primary' : 'default', onClick: () => this.save({ mode: 'manual', cls: c.code }, (d) => this.go('result', { cls: d.cls ?? c.code, source: 'manual', flow: 'done' })) }));
            if (c.summary) this.root.add(fitText(makeText(this, x + 12, y + ch - 4, c.summary, { size: 12, color: CSS.muted, origin: [0, 1] }), cw - 24));
        });
        this.backBtn('이전', () => this.go('method'));
    }

    stepResult() {
        const d = this.data0 ?? {};
        const code = this.st.cls ?? d.cls ?? d.defaultClass;
        const c = this.classOf(code);
        const res = d.cls === code && d.resonance ? d.resonance : c;
        const hub = this.st.flow === 'hub';
        const src = this.st.source;
        const sub = hub ? '현재 열람 카드입니다. 초상화는 언제든 바꿀 수 있고, 카드를 다시 쓸 수도 있습니다.'
            : src === 'quiz' ? '카드를 읽었습니다. 이 공명에 가깝습니다.' : src === 'skip' ? '카드를 비워 두셨군요. 기본 성향으로 시작합니다.' : '선택한 성향입니다.';
        const a = this.frame('열람 카드 결과', sub);
        const cw = Math.min(560, a.w);
        const cx = a.x + Math.round((a.w - cw) / 2);
        const ch = Math.min(260, Math.max(180, a.h - 150));
        this.root.add(this.add.rectangle(cx, a.y, cw, ch, COLOR.navyDeep, 0.92).setOrigin(0).setStrokeStyle(3, COLOR.accent, 1));
        const pw = Math.round(ch * 0.7);
        this.resultArt = { art: this.add.container(cx + 12 + pw / 2, a.y + ch - 8), w: pw, h: ch - 16 };
        this.root.add(this.resultArt.art);
        renderProtagonistArt(this, this.resultArt, { face: this.st.face, gender: this.st.gender, name: this.pname }, 'smile');
        const tx = cx + 24 + pw;
        const tw = cw - pw - 36;
        this.root.add(fitText(makeText(this, tx, a.y + 24, this.pname, { size: 15, color: CSS.muted }), tw));
        this.root.add(fitText(makeText(this, tx, a.y + 50, classTitle(res, code), { size: 26, heading: true, color: '#f0d58c' }), tw));
        this.root.add(fitText(makeText(this, tx, a.y + 92, `병종: ${classTroop(code)}`, { size: 17 }), tw));
        if (res?.summary) this.root.add(makeText(this, tx, a.y + 124, res.summary, { size: 14, color: CSS.muted, wrap: tw }));
        const by = a.y + ch + 20;
        const bw = Math.min(200, Math.floor((a.w - 24) / 3));
        const bx = a.x + Math.round((a.w - (bw * 3 + 24)) / 2);
        const proceed = hub && this.next ? '돌아가기' : '이대로 진행';
        this.root.add(new Button(this, { x: bx + (bw + 12) * 2, y: by, w: bw, h: 52, label: proceed, variant: 'primary', onClick: () => this.complete() }));
        if (hub) {
            this.root.add(new Button(this, { x: bx, y: by, w: bw, h: 52, label: '초상화 변경', onClick: () => this.go('face', { flow: 'face' }) }));
            this.root.add(new Button(this, { x: bx + bw + 12, y: by, w: bw, h: 52, label: '다시 작성', onClick: () => this.startRedo() }));
        } else {
            this.root.add(new Button(this, { x: bx, y: by, w: bw, h: 52, label: '다시 검사', onClick: () => this.guardRetest(() => (this.quiz ? this.go('quiz', { qi: 0, answers: {} }) : this.go('pick'))) }));
            this.root.add(new Button(this, { x: bx + bw + 12, y: by, w: bw, h: 52, label: '직접 선택', onClick: () => this.guardRetest(() => this.go('pick')) }));
        }
        this.retestNote(a.x, by + 64, a.w);
        const kb = this.input.keyboard;
        if (kb) { const f = (ev) => { if (this.st.step === 'result' && !this.modalCount && ev.key === 'Enter' && !ev.repeat) { kb.off('keydown', f); this.complete(); } }; kb.on('keydown', f); this.events.once('shutdown', () => kb.off('keydown', f)); }
    }

    startRedo() { this.guardRetest(() => this.go(this.genderEditable() ? 'gender' : 'face', { flow: 'redo', answers: {}, qi: 0 })); }
    backToHub() { const d = this.data0 ?? {}; this.go('result', { gender: d.gender, face: d.face, cls: d.cls, source: d.source, flow: 'hub' }); }

    // 남은 재검사 0 이면 진입 전에 안내(서버도 429 로 막는다)
    guardRetest(fn) {
        if (this.retestLeft() === 0) { this.limitModal(); return; }
        fn();
    }
    limitModal() {
        new Modal(this, { title: '재검사 횟수', w: 480, h: 250, body: '오늘 재검사 횟수를 모두 사용했습니다. 내일 다시 시도하거나 지금 카드로 진행해 주세요. 초상화는 횟수와 상관없이 바꿀 수 있습니다.', buttons: [{ label: '닫기' }] });
    }

    askSkip() {
        new Modal(this, {
            title: '건너뛰기', w: 480, h: 260, body: '열람 카드를 비워 두고 기본 성향으로 시작할까요? 나중에 임진왜란 기록의 \'주인공 열람 카드\'에서 다시 쓸 수 있습니다.',
            buttons: [{ label: '계속 작성' }, { label: '건너뛰기', variant: 'primary', onClick: () => this.save({ mode: 'skip' }, (d) => this.go('result', { cls: d.cls, source: 'skip', flow: 'done' }), { skipFallback: true }) }],
        });
    }

    // payload 에 현재 성별·초상화를 붙여 POST. 성공 시 서버 상태로 교체. skipFallback: 서버 장애 시 저장 없이 진행 버튼 제공
    async save(payload, then, { skipFallback = false } = {}) {
        if (this.busy) return;
        this.busy = true;
        try {
            const d = await saveProtagonist({ ...payload, gender: this.st.gender ?? undefined, face: this.st.face ?? undefined });
            this.busy = false;
            if (!d) throw Object.assign(new Error('empty'), { status: 500, code: 'server' });
            this.data0 = mergeState(this.data0, d);
            applyProtagonistState(this.data0);
            Object.assign(this.st, { gender: d.gender ?? this.st.gender, face: d.face ?? this.st.face });
            if (this.sys.isActive()) then?.(this.data0);
        } catch (e) {
            this.busy = false;
            if (!this.sys.isActive()) return;
            if (e?.code === 'protagonist_retest_limit' || e?.status === 429) { this.limitModal(); return; }
            const down = !e?.status || e.status >= 500;
            const buttons = [{ label: '닫기' }];
            if (down && (skipFallback || (!this.created && !this.next))) buttons.push({ label: '저장 없이 진행', variant: 'primary', onClick: () => this.complete('열람 카드는 임진왜란 기록에서 나중에 작성할 수 있습니다') });
            new Modal(this, { title: '저장 실패', w: 460, h: 240, body: messageOf(e), buttons });
        }
    }

    async saveFace() {
        if (this.busy) return;
        this.busy = true;
        try {
            const d = await changeFace(this.st.face);
            this.busy = false;
            if (d) { this.data0 = mergeState(this.data0, d); applyProtagonistState(this.data0); }
            if (!this.sys.isActive()) return;
            if (this.mode === 'face') this.leave('초상화를 변경했습니다');
            else this.backToHub();
        } catch (e) {
            this.busy = false;
            if (this.sys.isActive()) new Modal(this, { title: '변경 실패', w: 460, h: 240, body: messageOf(e), buttons: [{ label: '닫기' }] });
        }
    }

    // 완료: next 가 있으면 그쪽, 없으면 로비(권장안 B, 2026-11-02: ch1_open 은 여기서 재생하지 않고 ch1_s1 진입 시 campaignFlow.playBeforeStage 가 미시청이면 재생.
    //   로비 자동 시작 프롤로그(tutorial_guide prologue_short)와 연달아 보이는 문제 방지. 원복 = 아래 주석의 분기 복원)
    complete(notice = '열람 카드를 작성했습니다') {
        if (this.next) { this.scene.start(this.next.scene, this.next.data); return; }
        const lobby = { scene: 'Lobby', data: { tab: 'stage', notice } };
        // (원복용) if (!isSeen('ch1_open')) { markSeen('ch1_open'); this.scene.start('Dialogue', { source: 'campaign', chapter: 1, id: 'ch1_open', next: lobby }); return; }
        this.scene.start(lobby.scene, lobby.data);
    }

    leave(notice = '') { const n = this.next ?? { scene: 'Lobby', data: { tab: 'stage' } }; this.scene.start(n.scene, notice ? { ...(n.data ?? {}), notice } : n.data); }
}
