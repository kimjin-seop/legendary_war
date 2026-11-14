import Phaser from 'phaser';
import { loadTutorial, loadCampaign, speakerInfo, fillTokens, sceneBgKey, sceneCaption } from '../dialogue/dialogueData.js';
import { loadGuide } from '../tutorial/guideFlow.js';
import { ensurePortraitTex, setCaptainStage, texKey } from '../assets.js';
import { dialoguePortraitLogical, drawSilhouette, facelessSpeaker, dialogueBgTex, bgDimAlpha } from '../dialogue/portraitStage.js';
import { dialogueLayout, dialogueSlotX, pickSide, portraitScale, silhouetteH, applySpeakerFocus, speakerId, bgCoverScale, captionBand } from '../dialogue/dialogueLayout.js';
import { settings } from '../settings.js';
import { audio } from '../audio.js';
import { L, setupCamera, relayoutOnChange } from '../layout.js';
import { CSS, syncView } from '../theme.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { makeText, addBackdrop, prewrapText } from '../ui/common.js';
import { createLoadingView } from '../ui/LoadingView.js';
import { slice, setSliceSize } from '../ui/skin.js';
import { tween, isInstant } from '../ui/motion.js';
import { gameApi } from '../api/gameApi.js';
import { session } from '../api/client.js';
import { loadDialogueFont, useDialogueFont } from '../dialogue/dialogueFont.js';
import { LineFx } from '../dialogue/lineFx.js';
import { withUiImage } from '../ui/uiImage.js';

// 대화 씬(튜토리얼·캠페인 공용): 상단 무대 = 화자 초상화(큰 투명 PNG, 좌/우), 하단 = 대사 패널(이름표·타이핑·넘기기·스킵·로그).
// 패널 높이·초상화 크기·좌우 배치·390 세로 대응은 dialogue/dialogueLayout.js(전투 대사 BattleDialogue 와 같은 규칙).
// 진입 data: { source:'tutorial'|'campaign', id:<step id|scene id>, chapter?, tokens?, next:{scene, data} (끝나면 이동, 기본 Lobby), lineIndex?(재시작 복구) }
// 초상화 키: 시오리 portrait.shiori.<expr>(neutral/smile/surprise/serious/cheer/regret, 0.15초 크로스페이드), 영웅 portrait.<code>.<expr> > portrait.<code>.
// 없는 초상화는 실루엣+이름만(콘솔 warn 1회). 연출 끄기(fxLevel 2)/스킵 중에는 즉시 표시. 글자 크기 3단계는 makeText(fs) 가 반영.
const warned = new Set();
const TYPE_MS = 28; // 글자당(배속으로 나눔)
const PROLOGUE_BG = 'bg.archive.hall'; // 짧은 프롤로그(guide_prologue) 기본 배경(manifest 에 없으면 setBackground 가 그라데이션+서고 장식 폴백)

export class DialogueScene extends Phaser.Scene {
    constructor() { super('Dialogue'); }

    init(data) {
        this.src = data?.source ?? 'tutorial';
        this.id = data?.id ?? null;
        this.chapter = data?.chapter ?? 1;
        this.tokens = data?.tokens ?? {};
        this.next = data?.next ?? { scene: 'Lobby', data: { tab: 'stage' } };
        this.lineIndex = data?.lineIndex ?? 0;
        this.skipConfirmed = !!data?.skipConfirmed;
        this.modalCount = 0;
        this.finished = false; // 씬 인스턴스 재사용(연속 대사·튜토리얼 재열람) 시 이전 종료 플래그 초기화
        this.lines = [];
        this.meta = { caption: '', what_if: false, bgKey: null };
        this.portraits = new Map(); // side(left|right) -> {c, img, key, info, id}
        this.activeP = null;
        this.typing = null;
        this.log = data?.log ?? [];
        // 서버 연동 튜토리얼(server:true): steps 를 stepIndex 부터 이어서 재생, 스텝 끝마다 PUT /api/tutorial {step}, 끝 = done(보상), 건너뛰기 = skipped
        this.server = !!data?.server && this.src === 'tutorial';
        // 재열람(설정 > 튜토리얼 보기, 완료 계정 server:false·id 없음): 서버 모드처럼 stepIndex 부터 마지막 스텝까지 이어서 재생하되 진행 저장(PUT)은 하지 않는다
        this.replayAll = this.src === 'tutorial' && !this.server && !this.id;
        // 새 튜토리얼 흐름: source 'guide_prologue' = tutorial_guide.json prologue_short(6줄). 끝 = 서버 튜토리얼 done(보상, 현행처럼 대사 끝에 지급), 건너뛰기 = skipped
        this.guideProlog = this.src === 'guide_prologue';
        this.stepIndex = data?.stepIndex ?? 0;
    }

    create() {
        syncView();
        setupCamera(this, CSS.bg);
        relayoutOnChange(this, () => ({ source: this.src, id: this.id, chapter: this.chapter, tokens: this.tokens, next: this.next, lineIndex: this.lineIndex, skipConfirmed: this.skipConfirmed, log: this.log, server: this.server, stepIndex: this.stepIndex }));
        addBackdrop(this, L.lw, L.lh);
        audio.bgm(audio.currentBgm() ?? audio.lobbyBgm(), this); // 직전 화면 음악 유지, 없으면 로비 트랙(임시 — 전용 '대화/스토리' 트랙 생기면 교체)
        this.layout();
        this.buildBackground();
        // 2026-11-14 로딩 화면 통일: 가운데 글자 대신 로딩 화면(LoadingView 덮개·대기 바). 200ms 안에 끝나면 그리지 않음
        this.loading = createLoadingView(this, { tagline: '대사를 불러오는 중…', overlay: true, indeterminate: true, delay: 200 });
        Promise.all([this.loadLines(), loadDialogueFont()]).then(() => { if (this.scene.isActive()) this.build(); }).catch((e) => {
            console.error('[dialogue]', e);
            this.loading?.destroy();
            this.loading = makeText(this, L.lw / 2, L.lh / 2, '대사를 불러오지 못했습니다', { size: 18, color: CSS.muted, origin: [0.5, 0.5] });
            new Button(this, { x: L.lw / 2 - 80, y: L.lh / 2 + 24, w: 160, label: '돌아가기', variant: 'primary', onClick: () => this.finish('error') });
        });
        this.events.once('shutdown', () => { this.typing?.remove(); this.input.keyboard?.removeAllListeners(); });
    }

    layout() {
        this.lay = dialogueLayout();
        this.box = this.lay.box;
        this.portraitH = this.lay.portraitH;
    }

    async loadLines() {
        if (this.src === 'campaign') {
            const d = await loadCampaign(this.chapter);
            const sc = d.scenes.find((s) => s.id === this.id) ?? d.scenes[0];
            if (!sc) throw new Error('scene not found');
            this.meta = { caption: sceneCaption(sc), what_if: !!sc.what_if, bgKey: sceneBgKey(sc) }; // 장면 id 는 화면에 쓰지 않는다
            setCaptainStage(sc.stage_code ?? null); // 기본 부장 초상 stage_group 판정 + 매핑 파일 미리 받기
            this.lines = sc.lines.filter(Boolean); // verify 값과 무관하게 모두 표시(사용자 방침 2026-11-03, 데이터 필드는 유지)
        } else if (this.guideProlog) {
            const g = await loadGuide();
            const p = g?.prologue_short;
            if (!p?.lines?.length) throw new Error('prologue_short not found');
            this.steps = (await loadTutorial()).steps; // 서버 done 저장 시 step 최댓값(= 기존 스텝 수)
            // 배경: 데이터(bg_key/bg/매핑표) > 서고 홀(시오리 첫 대사 '여기는 시간의 서고', 튜토리얼 tut_00_opening 과 같은 bg.archive.hall). 2026-11-14 '프롤로그 배경 없음'
            // 캡션: 데이터 title '프롤로그(단축)'의 작업용 꼬리표 '(단축)'은 화면에 보이지 않게(v9 실화면: 캡션 띠에 그대로 노출)
            this.meta = { caption: String(p.caption ?? p.title ?? '').replace(/\s*\(단축\)\s*$/, ''), what_if: false, bgKey: sceneBgKey(p) ?? PROLOGUE_BG };
            this.lines = p.lines;
        } else {
            const d = await loadTutorial();
            this.steps = d.steps;
            const seq = this.server || this.replayAll;
            if (seq) this.stepIndex = Math.max(0, Math.min(d.steps.length - 1, this.stepIndex));
            const st = seq ? d.steps[this.stepIndex] : (d.steps.find((s) => s.id === this.id) ?? d.steps[0]);
            if (!st) throw new Error('step not found');
            this.meta = this.stepMeta(st);
            this.lines = st.lines;
        }
        this.lineIndex = Math.min(this.lineIndex, Math.max(0, this.lines.length - 1));
        // {hero_name} = 실제 보유 영웅(dialogueData.firstHeroName). 목록 캐시가 없으면 한 번 받아 둔다(실패 시 중립 문구 '첫 영웅')
        if (session.authed && !session.heroes && [...this.lines, ...(this.steps ?? []).flatMap((s) => s?.lines ?? [])].some((l) => /\{hero_name[}:]/.test(String(l?.text ?? '')))) await gameApi.heroes().catch(() => null);
    }

    build() {
        this.loading?.destroy();
        this.loading = null;
        const b = this.box;
        const bh = this.lay.bh;
        this.setBackground(this.meta.bgKey, true);
        this.buildDecor();
        // 초상화 레이어(대화창 뒤)
        this.portraitLayer = this.add.container(0, 0);
        // 줄 효과 덮개(초상화 위·대화창 아래, 같은 depth 0 의 생성 순서로 쌓임). 줄 bg 는 setBackground(크로스페이드) 재사용 — dialogue/lineFx.js
        this.lineFx = new LineFx(this, { setBg: (k) => this.setBackground(k) });
        this.lineFx.attach(this.add.rectangle(0, 0, L.lw, L.lh, 0x000000, 1).setOrigin(0).setAlpha(0));
        // 대화창
        this.panel = this.add.container(b.x, b.y);
        this.panel.add(slice(this, 'dialog', b.w, b.h, 'panel', { corner: L.portrait ? 0.6 : L.short ? 0.75 : 1 })); // dialog.box 금 모서리(3x 147px = 49단위): 세로 폰 0.6·가로 폰 0.75배
        const nh = this.lay.nameH;
        this.nameTag = this.add.container(16, -Math.round(nh / 2));
        this.nameBg = slice(this, 'nameplate', 200, nh, 'ribbon');
        this.nameT = useDialogueFont(makeText(this, 100, nh / 2, '', { size: this.lay.nameSize, heading: true, color: '#f0d58c', origin: [0.5, 0.5] }));
        this.nameTag.add([this.nameBg, this.nameT]); // 각색·창작 표기 없음(사용자 방침 2026-11-03: 사실/가설/각색/창작 표기 금지)
        this.text = useDialogueFont(makeText(this, 24, this.lay.textY, '', { size: this.lay.textSize, wrap: b.w - 48 }));
        this.textMaxH = b.h - this.lay.textY - 36; // 아래 '다음 ▼' 줄 위까지
        this.textFs = this.text.style.fontSize;
        this.nextMark = makeText(this, b.w - 22, b.h - 22, '다음 ▼', { size: 14, bold: true, color: CSS.accent, origin: [1, 0.5] });
        this.panel.add([this.nameTag, this.text, this.nextMark]);
        if (settings.get().fxLevel === 0 && !isInstant()) this.tweens.add({ targets: this.nextMark, alpha: 0.35, duration: 520, yoyo: true, repeat: -1 });
        // 상단 우측 버튼: 로그 / 스킵
        const bx = L.lw - L.safe.r - 12;
        this.add.existing(new Button(this, { x: bx - 92, y: this.lay.topY, w: 92, h: bh, label: '스킵', size: 15, onClick: () => this.askSkip() }));
        this.add.existing(new Button(this, { x: bx - 92 - 8 - 80, y: this.lay.topY, w: 80, h: bh, label: '로그', size: 15, onClick: () => this.showLog() }));
        // 입력: 화면 어디든 탭(버튼 제외) = 넘기기, Enter/Space 넘기기, Esc 스킵
        const zone = this.add.rectangle(0, 0, L.lw, L.lh, 0, 0).setOrigin(0).setDepth(-5).setInteractive();
        zone.on('pointerup', (p) => { if (!this.modalCount && p.getDistance() < 16) this.advance(); });
        const kb = this.input.keyboard;
        if (kb) {
            const go = (e) => { if (!this.modalCount && !e?.repeat) this.advance(); };
            kb.on('keydown-ENTER', go);
            kb.on('keydown-SPACE', go);
            kb.on('keydown-ESC', (e) => { if (!this.modalCount && !e?.repeat && performance.now() - (this.lastModalEsc ?? 0) > 200) this.askSkip(); });
        }
        this.showLine(this.lineIndex, true);
        this.showCaption(this.lineIndex === 0 ? this.meta.caption : ''); // 재시작 복구(중간 줄)면 캡션 생략
    }

    stepMeta(st) { return { caption: sceneCaption({ caption: st.caption ?? st.title }), what_if: false, bgKey: sceneBgKey(st) }; } // 튜토리얼: 제목(사람이 읽는 문구)을 캡션으로

    // ---- 배경 ----
    // 깔림 순서(뒤 -> 앞): 패턴(-1000) > 그라데이션 폴백(-20) > 배경 이미지(-15, 16:9 cover) > 비네팅(-12) > 입력 존(-5) > 초상화·패널(0) > 캡션(5)
    buildBackground() {
        this.add.graphics().setDepth(-20).fillGradientStyle(0x0b1328, 0x0b1328, 0x1b2a4a, 0x1b2a4a, 1).fillRect(0, 0, L.lw, L.lh);
        this.bgImg = null;
        this.bgWant = null;
        // 비네팅: 하단 절반(대사창·초상화 가독성) + 상단 띠(버튼·캡션). 배경 이미지가 있을 때만 보인다(폴백 그라데이션 모습은 그대로)
        const v = this.add.graphics().setDepth(-12).setAlpha(0);
        const ink = 0x05070d;
        const hb = Math.round(L.lh * 0.55);
        v.fillGradientStyle(ink, ink, ink, ink, 0, 0, 0.85, 0.85).fillRect(0, L.lh - hb, L.lw, hb);
        const ht = Math.round(L.lh * 0.2);
        v.fillGradientStyle(ink, ink, ink, ink, 0.55, 0.55, 0, 0).fillRect(0, 0, L.lw, ht);
        this.bgVignette = v;
        // 밝은 배경(강·설경) 전용 남색 덮개(초상화 뒤, 배경 위). 알파는 portraitStage.bgDimAlpha
        this.bgDim = this.add.rectangle(0, 0, L.lw, L.lh, 0x0b1328, 1).setOrigin(0).setDepth(-14).setAlpha(0);
    }

    // 서고 장식(안아트 UI 스킨 1단계 2026-11-04): 다마스크 타일 바탕 + 상단 문장 + 좌우 하단 소품(가로 화면) + 네 모서리 장식·금선.
    //  depth -16 = 기본 그라데이션(-20) 위·장면 배경 이미지(-15) 아래 -> 장면 배경이 있는 대사에서는 배경에 가려 보이지 않고, 배경 없는 대사·막간에만 보인다.
    //  초상화·대사창·버튼은 모두 이 위. 에셋이 없으면 해당 장식만 생략
    buildDecor() {
        this.decor?.destroy();
        const d = this.add.container(0, 0).setDepth(-16); this.decor = d;
        const { lw, lh, safe, portrait } = L; const lay = this.lay;
        withUiImage(this, 'ui.skin.bg_damask', (k) => { if (!d.scene) return; const t = this.add.tileSprite(0, 0, lw, lh, k).setOrigin(0).setTileScale(0.5).setTint(0x7a8098).setAlpha(0.32); d.addAt(t, 0); });
        // 네 모서리 장식(기준 = 왼쪽 위, flip 으로 나머지) + 변 금선(#D9B45A 2px + 안쪽 #8A6A1E 1px)
        const c = Math.round(Math.min(96, Math.min(lw, lh) * (portrait ? 0.16 : 0.11)));
        const g = this.add.graphics(); d.add(g);
        const ins = Math.round(c * 0.22) + 2;
        g.lineStyle(2, 0xd9b45a, 0.85).strokeRect(safe.l + ins, safe.t + ins, lw - safe.l - safe.r - ins * 2, lh - safe.t - safe.b - ins * 2);
        g.lineStyle(1, 0x8a6a1e, 0.9).strokeRect(safe.l + ins + 3, safe.t + ins + 3, lw - safe.l - safe.r - ins * 2 - 6, lh - safe.t - safe.b - ins * 2 - 6);
        withUiImage(this, 'ui.skin.frame_corner', (k) => {
            if (!d.scene) return;
            [[safe.l, safe.t, false, false], [lw - safe.r, safe.t, true, false], [safe.l, lh - safe.b, false, true], [lw - safe.r, lh - safe.b, true, true]].forEach(([x, y, fx, fy]) => {
                d.add(this.add.image(x, y, k).setOrigin(fx ? 1 : 0, fy ? 1 : 0).setFlip(fx, fy).setDisplaySize(c, c));
            });
        });
        // 상단 문장: 가운데, 오른쪽 위 로그·스킵 버튼(폭 약 192)과 겹치지 않는 폭 + 무대 시작선(캡션 띠) 위까지만
        const btnL = lw - safe.r - 12 - 92 - 8 - 80 - 8;
        const maxW = Math.min(520, 2 * (btnL - lw / 2)); const maxH = Math.max(0, lay.band.y - 2 - (safe.t + 2));
        if (maxW >= 140 && maxH >= 30) withUiImage(this, 'ui.deco.crest_top', (k) => {
            if (!d.scene) return;
            const im = this.add.image(lw / 2, safe.t + 2, k).setOrigin(0.5, 0);
            im.setScale(Math.min(maxW / im.width, maxH / im.height)); d.add(im);
        });
        // 좌우 하단 소품(가로 화면만): 대사창 윗변에 바닥을 맞춰 대사창 뒤로 살짝 들어간다(대사창을 가리지 않음)
        if (!portrait) {
            const ps = Math.round(Math.min(150, lh * (L.short ? 0.2 : 0.22)));
            const by = lay.box.y + Math.round(ps * 0.12);
            [['ui.deco.globe', safe.l + 8, 0], ['ui.deco.books', safe.l + 8 + ps * 0.85, 0], ['ui.deco.lantern', lw - safe.r - 8, 1], ['ui.deco.scrolls', lw - safe.r - 8 - ps * 0.85, 1]].forEach(([lg, x, ox]) => {
                withUiImage(this, lg, (k) => { if (!d.scene) return; d.add(this.add.image(x, by, k).setOrigin(ox, 1).setDisplaySize(ps, ps).setAlpha(0.92)); });
            });
        }
    }

    // 배경 키(bg.<set>.<name>) 표시: 없음/manifest 미등록/로드 실패 = 그라데이션 폴백. 로드 중이면 폴백으로 두고 도착하면 크로스페이드
    setBackground(logical, instant = false) {
        this.bgWant = logical ?? null;
        const tex = logical ? dialogueBgTex(this, logical, (k) => {
            if (!this.sys.isActive() || this.bgWant !== logical) return;
            if (k && this.textures.exists(k)) this.swapBg(k); else if (!this.bgImg) this.swapBg(null);
        }) : null;
        if (tex && this.textures.exists(tex)) { if (this.bgImg?.texture?.key !== tex) this.swapBg(tex, instant); return; }
        this.swapBg(null, instant);
    }

    swapBg(tex, instant = false) {
        const old = this.bgImg;
        if (!tex && !old) return;
        let img = null;
        if (tex) {
            img = this.add.image(L.lw / 2, L.lh / 2, tex).setOrigin(0.5).setDepth(-15);
            img.setScale(bgCoverScale(img.width, img.height));
            img.setAlpha(instant ? 1 : 0);
        }
        this.bgImg = img;
        const d = instant ? 0 : 450;
        if (img && d) tween(this, { targets: img, to: { alpha: 1 }, duration: d });
        if (old) { if (d) tween(this, { targets: old, to: { alpha: 0 }, duration: d, onComplete: () => old.destroy() }); else old.destroy(); }
        if (d) tween(this, { targets: this.bgVignette, to: { alpha: img ? 1 : 0 }, duration: d }); else this.bgVignette.setAlpha(img ? 1 : 0);
        const dim = img ? bgDimAlpha(this.bgWant) : 0;
        if (d) tween(this, { targets: this.bgDim, to: { alpha: dim }, duration: d }); else this.bgDim.setAlpha(dim);
    }

    // ---- 캡션(연출용 나레이션) ----
    // 상단 버튼 줄 아래 반투명 띠(가운데 진하고 양끝 투명) + 가운데 정렬 문장. 첫 넘기기 또는 6초 뒤 흐려진다(초상화 머리를 오래 가리지 않게)
    showCaption(text) {
        this.hideCaption(true);
        if (!text) return;
        const cb = captionBand(this.lay);
        const t = useDialogueFont(makeText(this, cb.w / 2, cb.pad, text, { size: cb.size, color: '#e8edf7', wrap: cb.w - cb.pad * 6, align: 'center', origin: [0.5, 0] }));
        const h = Math.ceil(t.height + cb.pad * 2);
        const ink = 0x05070d;
        const g = this.add.graphics();
        g.fillGradientStyle(ink, ink, ink, ink, 0, 0.7, 0, 0.7).fillRect(0, 0, cb.w / 2, h);
        g.fillGradientStyle(ink, ink, ink, ink, 0.7, 0, 0.7, 0).fillRect(cb.w / 2, 0, cb.w / 2, h);
        // 금색 장식 선: 기본 가운데 60%, 글이 더 넓으면 글 폭 + 여백까지 늘린다(2026-11-03: 2줄 설명문이 선 밖으로 나가 보이던 문제)
        const lw = Math.min(cb.w, Math.max(cb.w * 0.6, t.width + cb.pad * 4));
        g.fillStyle(0xf0d58c, 0.35).fillRect((cb.w - lw) / 2, 0, lw, 1).fillRect((cb.w - lw) / 2, h - 1, lw, 1);
        const c = this.add.container(cb.x, cb.y, [g, t]).setDepth(5).setAlpha(0);
        this.captionC = c;
        tween(this, { targets: c, to: { alpha: 1 }, duration: 400 });
        this.captionTimer = this.time.delayedCall(6000, () => this.hideCaption());
    }

    hideCaption(now = false) {
        this.captionTimer?.remove();
        this.captionTimer = null;
        const c = this.captionC;
        if (!c) return;
        this.captionC = null;
        if (now) { c.destroy(); return; }
        tween(this, { targets: c, to: { alpha: 0 }, duration: 500, onComplete: () => c.destroy() });
    }

    // ---- 초상화 ----
    // 초상화는 hero scope 지연 로드(assets.ensurePortraitTex): 없으면 null 을 돌려주고 받는 대로 onReady(키) — 그때 같은 줄이면 다시 그린다.
    // 영웅 표정 키(portrait.<code>.<expr>)는 manifest 에 있을 때만 요청(없는 파일 요청 방지), 없으면 기본 portrait.<code>
    // 키 규약은 dialogue/portraitStage.js(전투 대사 오버레이와 공용)
    portraitTexFor(info, expr, onReady = null) {
        const logical = dialoguePortraitLogical(info, expr);
        return logical ? ensurePortraitTex(this, logical, onReady) : null;
    }

    sideFor(info) { return pickSide(this.portraits, this.activeP, info); } // 시오리·주인공 좌 / 그 외 우(세로 화면도 좌우 2자리)

    slotX(side) { return dialogueSlotX(this.lay, side); }

    // 화자 초상화 표시/표정 교체, 비화자는 dim + 뒤로
    showPortrait(info, expr) {
        const side = this.sideFor(info);
        let p = this.portraits.get(side);
        const line = this.lineIndex;
        // 초상 없는 일반 화자: 실루엣 자리를 만들지 않고 이름표+대사만(무대의 다른 화자는 전원 dim). portraitStage.facelessSpeaker
        const logical = dialoguePortraitLogical(info, expr);
        if ((!p || p.id !== speakerId(info)) && !(logical && this.textures.exists(texKey(logical))) && facelessSpeaker(info, logical)) {
            this.activeP = null;
            applySpeakerFocus(this, tween, this.portraitLayer, this.portraits, null, this.lay);
            return;
        }
        // 받기 실패(tex null)여도 논리 키가 폴백(부장/병종 초상)으로 바뀌었으면 다시 그린다(실패 키는 재요청·재콜백 없음 -> 반복 없음)
        const key = this.portraitTexFor(info, expr, (tex) => { if ((tex || dialoguePortraitLogical(info, expr) !== logical) && this.sys.isActive() && this.lineIndex === line && this.portraits.get(side)?.id === speakerId(info)) this.showPortrait(info, expr); });
        const baseY = this.lay.baseY; // 패널 위에 살짝 겹치게(바닥 기준, 공용 규칙)
        if (!p || p.id !== speakerId(info)) {
            p?.c.destroy();
            const c = this.add.container(this.slotX(side), baseY);
            this.portraitLayer.add(c);
            p = { c, img: null, key: null, info, side, id: speakerId(info) };
            this.portraits.set(side, p);
            c.setAlpha(0);
            c.x += side === 'left' ? -40 : side === 'right' ? 40 : 0;
            tween(this, { targets: c, to: { alpha: 1, x: this.slotX(side) }, duration: 220, ease: 'Cubic.easeOut' });
        }
        if (key && this.textures.exists(key)) {
            if (p.key !== key) {
                const img = this.add.image(0, 0, key).setOrigin(0.5, 1);
                img.setScale(portraitScale(this.lay, img));
                if (p.silText) { p.silText.destroy(); p.silText = null; } // 실루엣 이름표(지연 로드된 초상화로 교체될 때)
                if (p.img) { // 0.15초 크로스페이드
                    const old = p.img;
                    img.setAlpha(0);
                    p.c.add(img);
                    tween(this, { targets: img, to: { alpha: 1 }, duration: 150 });
                    tween(this, { targets: old, to: { alpha: 0 }, duration: 150, onComplete: () => old.destroy() });
                } else p.c.add(img);
                p.img = img;
                p.key = key;
            } else if (info.kind === 'hero' && !isInstant()) { // 표정 파일이 없는 영웅: 감정은 미세한 바운스로만
                tween(this, { targets: p.img, to: { scaleY: p.img.scaleY * 1.03 }, final: { scaleY: p.img.scaleY }, duration: 90, yoyo: true });
            }
        } else if (!p.img) { // 실루엣 + 이름(초상화를 받는 중이면 받는 대로 교체)
            const k = `${info.code ?? info.name}`;
            if (!info.code && info.kind !== 'protagonist' && info.kind !== 'shiori' && !warned.has(k)) { warned.add(k); console.warn(`[dialogue] 초상화 없음: ${info.code ? `portrait.${info.code}` : info.name}(실루엣 표시)`); }
            const [sil, nm] = drawSilhouette(this, silhouetteH(this.lay), info.name, L.portrait ? 18 : 20);
            p.c.add([sil, nm]);
            p.img = sil;
            p.silText = nm;
            p.key = 'silhouette';
        }
        // 화자 강조 / 비화자 dim(공용 규칙)
        p.info = info;
        this.activeP = p;
        applySpeakerFocus(this, tween, this.portraitLayer, this.portraits, p, this.lay);
    }

    // ---- 대사 ----
    showLine(i, instant = false) {
        const line = this.lines[i];
        if (!line) { this.finish(); return; }
        this.lineIndex = i;
        this.lineFx?.apply(line); // 줄 효과(sfx·shake·bg·fade·blackout). 필드 없으면 직전 암전만 풀고 그대로
        const text = fillTokens(line.text, this.tokens);
        if (line.speaker === 'caption' || line.speaker === 'narrator') { this.showCaptionLine(text, instant); return; }
        this.setCaptionStyle(false);
        const info = speakerInfo(line.speaker);
        this.nameT.setText(info.name);
        const nw = Math.max(120, this.nameT.width + 40);
        setSliceSize(this.nameBg, nw, this.lay.nameH); // 이미지 스킨(dialog.nameplate)·코드 스킨 공통
        this.nameT.x = nw / 2;
        this.showPortrait(info, line.expr);
        this.log.push(`${info.name}: ${text}`);
        if (this.log.length > 60) this.log.shift();
        this.typing?.remove();
        this.typing = null;
        const shown = this.fitBody(text); // 줄바꿈을 미리 확정한 본문(타이핑 중 어절이 다음 줄로 튀지 않게)
        this.nextMark.setVisible(false);
        audio.play('sfx_tut_msg_tick');
        if (instant || isInstant() || settings.get().fxLevel === 2) { this.text.setText(shown); this.nextMark.setVisible(true); return; }
        let n = 0;
        this.full = shown;
        this.text.setText('');
        // 지역 참조(ev)로 정리: 클릭(advance)·다음 줄이 this.typing 을 먼저 null 로 만든 뒤 같은 프레임에 콜백이 한 번 더 불려도 null.remove() 가 나지 않게
        const ev = this.time.addEvent({
            delay: TYPE_MS / settings.get().speed, loop: true,
            callback: () => {
                if (this.typing !== ev) { ev.remove(); return; }
                n += 1; this.text.setText(shown.slice(0, n));
                if (n >= shown.length) { ev.remove(); this.typing = null; this.nextMark.setVisible(true); }
            },
        });
        this.typing = ev;
    }

    // 지문(caption) 줄: 이름표 숨김 + 본문 기울임·옅은 금색, 화면의 초상은 모두 흐리게(화자 없음). 타이핑·로그는 일반 줄과 같다
    setCaptionStyle(on) {
        if (this.text0 == null) this.text0 = { color: this.text.style.color, fontStyle: this.text.style.fontStyle };
        this.nameBg.setVisible(!on); this.nameT.setVisible(!on);
        this.text.setColor(on ? '#e6d29a' : this.text0.color).setFontStyle(on ? 'italic' : this.text0.fontStyle);
    }

    showCaptionLine(text, instant) {
        this.setCaptionStyle(true);
        this.portraits.forEach((p) => { p.img?.setTint?.(0x5c6070); tween(this, { targets: p.c, to: { alpha: 1 }, duration: 160 }); }); // 지문 줄: 초상은 불투명 유지 + 어둡게 틴트(사용자 2026-11-04 '반투명 -> 불투명', 이전 알파 0.45)
        this.activeP = null;
        this.log.push(`(지문) ${text}`);
        if (this.log.length > 60) this.log.shift();
        this.typing?.remove(); this.typing = null;
        const shown = this.fitBody(text);
        this.nextMark.setVisible(false);
        if (instant || isInstant() || settings.get().fxLevel === 2) { this.text.setText(shown); this.nextMark.setVisible(true); return; }
        let n = 0; this.full = shown; this.text.setText('');
        const ev = this.time.addEvent({ delay: TYPE_MS / settings.get().speed, loop: true, callback: () => { if (this.typing !== ev) { ev.remove(); return; } n += 1; this.text.setText(shown.slice(0, n)); if (n >= shown.length) { ev.remove(); this.typing = null; this.nextMark.setVisible(true); } } });
        this.typing = ev;
    }

    // 본문이 패널을 넘치면(긴 대사 x 글자 크기 '매우 크게') 넘치지 않을 때까지 글자를 줄인다(최소 14px). 타이핑 전에 전체 문장으로 잰다
    // 반환: 확정 글자 크기 기준으로 줄바꿈을 미리 넣은 문자열(prewrapText: 한 글자 어절 묶기 + 줄바꿈 확정)
    fitBody(text) {
        const t = this.text;
        t.setFontSize(this.textFs);
        let shown = prewrapText(t, text);
        t.setText(shown);
        let px = parseInt(this.textFs, 10) || 20;
        while (px > 14 && t.height > this.textMaxH) { px -= 1; t.setFontSize(px); shown = prewrapText(t, text); t.setText(shown); }
        return shown;
    }

    advance() {
        if (!this.lines.length) return;
        if (this.typing) { this.typing.remove(); this.typing = null; this.text.setText(this.full); this.nextMark.setVisible(true); return; } // 타이핑 중: 전체 표시
        audio.play('sfx_tut_next');
        this.hideCaption();
        if (this.lineIndex + 1 >= this.lines.length) {
            if ((this.server || this.replayAll) && this.stepIndex + 1 < (this.steps?.length ?? 0)) { this.nextStep(); return; }
            this.finish('end');
        } else this.showLine(this.lineIndex + 1);
    }

    askSkip() {
        if (this.skipConfirmed) { this.finish('skip'); return; }
        new Modal(this, {
            title: '건너뛰기', w: 460, h: 260, body: '남은 대사를 건너뛸까요? (이번 대화에서는 다시 묻지 않습니다)',
            buttons: [{ label: '계속 보기' }, { label: '건너뛰기', variant: 'primary', onClick: () => { this.skipConfirmed = true; this.finish('skip'); } }],
        });
    }

    showLog() {
        const lines = this.log.slice(-14);
        new Modal(this, { title: '대화 로그', w: Math.min(640, L.lw - 24), h: Math.min(520, L.lh - 24), body: lines.join('\n') || '-', buttons: [{ label: '닫기' }] });
    }

    // 서버 모드: 다음 스텝으로(진행 저장은 실패해도 계속 — 서버 step 은 단조 증가·멱등)
    nextStep() {
        this.stepIndex += 1;
        if (this.server) gameApi.tutorial.put({ step: this.stepIndex }).catch((e) => console.warn('[tutorial] 진행 저장 실패', e?.code ?? e));
        const st = this.steps[this.stepIndex];
        this.meta = this.stepMeta(st);
        this.lines = st.lines;
        this.setBackground(this.meta.bgKey); // 스텝마다 배경이 바뀌면 크로스페이드
        this.showLine(0);
        this.showCaption(this.meta.caption);
    }

    // kind: 'end'(끝까지) | 'skip'(건너뛰기) | 'error'
    async finish(kind = 'end') {
        if (this.finished) return;
        this.finished = true;
        this.lineFx?.clear(); // 스킵·ESC·끝: 암전·흔들림을 남기지 않음
        audio.play('sfx_tut_complete');
        const n = this.next ?? { scene: 'Lobby', data: { tab: 'stage' } };
        let notice = '';
        const skipNote = '튜토리얼은 설정 → 튜토리얼 보기에서\n다시 볼 수 있어요.'; // 건너뛰기 안내(보상 여부는 언급하지 않음). 저장 실패여도 표시
        if (kind === 'skip' && (this.server || this.guideProlog)) notice = skipNote;
        if ((this.server || this.guideProlog) && kind !== 'error') {
            const max = this.steps?.length ?? 0;
            try {
                const r = kind === 'end' ? await gameApi.tutorial.put({ step: max, done: true }) : await gameApi.tutorial.put({ step: this.stepIndex, skipped: true });
                const g = r?.granted;
                if (g && (g.gold || g.user_exp || g.pen)) notice = `튜토리얼 완료 보상: ${[g.gold ? `골드 ${g.gold}` : '', g.user_exp ? `EXP ${g.user_exp}` : '', g.pen ? `펜 ${g.pen}` : ''].filter(Boolean).join(' · ')}`; // granted.pen(소환용 펜, 2026-11-14)
                gameApi.profile(true).catch(() => {});
            } catch (e) { console.warn('[tutorial] 종료 저장 실패', e?.code ?? e); }
        }
        this.scene.start(n.scene ?? 'Lobby', notice ? { ...(n.data ?? {}), notice, ...(notice === skipNote ? { noticeMs: 3000 } : {}) } : n.data);
    }
}
