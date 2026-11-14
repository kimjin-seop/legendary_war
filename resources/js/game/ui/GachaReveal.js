import Phaser from 'phaser';
import { COLOR, CSS } from '../theme.js';
import { L } from '../layout.js';
import { makeText, fitText, shrinkToFit } from './common.js';
import { Button } from './Button.js';
import { ensurePortrait, STAT_CAP } from './PortraitCard.js';
import { ensureSkillIcons, skillIconFrame, skillIconImage } from './SkillIcon.js';
import { rarityColor, rarityCss, rarityLabel, normRarity, RARITY_STARS, compareRarity } from '../rarity.js';
import { heroPlainName, heroShortName, unitClassName, gachaShortName, getNative, ensureHeroNatives } from '../systems/names.js';
import { plaqueFace, plaqueCovers, loadPlaqueFont, plaqueFontReady, nfc } from './plaqueFonts.js';
// 결과 카드 영웅 원어 이름 표시(구조만 유지). 2026-11-03 사용자 요청 범위 밖이라 기본 꺼짐 = 기존 한글 한 줄
const SHOW_HERO_NATIVE = false;
import { skillDisplayName } from '../systems/skills.js';
import { isInstant } from './motion.js';
import { sfx } from '../audio.js';
import { gameApi } from '../api/gameApi.js';
import { GACHA_KEYS as K, GACHA_SFX, BOOK_GLYPHS, RARITY_SFX, texOr, has, manifestMeta, sheetAnim, gradBand, clipToRect } from './gachaKeys.js';
import { pixelImage } from './PixelBadge.js';
import { sCard } from './HeroVisual.js';
import { ScrollList } from './widgets.js';

// 소환 공개 연출(역사책, gacha_ui_spec.json sequence). 단계(1명):
//  0 닫힌 표지+인장 -> 1 인장 깨짐(seal.crack, 파편 shard.0~5, S/A 틈 섬광) -> 2 표지 열림(cover scaleX 1->0, cover_inner 0->1)
//  -> 3 페이지 넘김(pageflip 24fps x2, S/A x3) + pageglow.<r>(B->A->S 색 전환 암시) + circle 문양 -> 4 빛줄기 beam.<r> + glyph·particle
//  -> 5 팝 인(초상 0.6->1.12->1, flash, pop.<r>, 흔들림 S 6px·A 3px, halo.<r>) -> 6 옆 카드(cardglow.<r> 맥동, aura.<r>)
// 10연: 1번째 전체, 2번째부터 책 펼친 채 3~6(페이지 1회) -> 결과 그리드(최고 등급 카드 뒤 rays). 건너뛰기 = 그리드(1회 = 최종 화면).
// 에셋이 아직 안 왔거나 없으면 각 단계는 코드 도형 폴백. 연출 끄기(isInstant) = 최종 상태 바로(섬광 없음).
// 모든 트윈·타이머는 this.tws/this.tms 로 추적해 건너뛰기·닫기 때 정리한다.

const ADD = Phaser.BlendModes.ADD;
const fmtNum = (n) => Number(n ?? 0).toLocaleString('ko-KR');
const starsOf = (r) => '★'.repeat(RARITY_STARS[normRarity(r)] ?? 1);
const rnd = (a, b) => a + Math.random() * (b - a);
const SKILL_KO = { active: '액티브', passive: '패시브', aura: '오라' };
const BOOK = { w: 600, h: 357, spineX: 299, coverW: 288, coverH: 350, sealC: [135, 166], sealD: 103 }; // 표시 px(manifest layout)
const RFX = { // gacha_ui_spec rarity_fx
    C: { flips: 2, beamW: 0.8, gold: 0, ink: 6, parts: 10, part: 3, shake: 0, flash: 0.5 },
    B: { flips: 2, beamW: 1, gold: 6, ink: 6, parts: 14, part: 0, shake: 0, flash: 0.7 },
    A: { flips: 3, beamW: 1.2, gold: 10, ink: 8, parts: 20, part: 1, shake: 3, flash: 0.9 },
    S: { flips: 3, beamW: 1.5, gold: 16, ink: 10, parts: 30, part: 1, shake: 6, flash: 1 },
};
// 결과 카드 등급 테마(rarity.js 색 체계: S 금 · A 보라 · B 청록 · C 회청). base = 패널 바탕, edge = 테두리·광, sub = 보조 글자
const CARD_THEME = {
    S: { base: 0x241a08, edge: 0xf0b23c, css: '#f6c75a', sub: '#e9d6a8' },
    A: { base: 0x1d1030, edge: 0xb06ad8, css: '#cf98f0', sub: '#d9c6ea' },
    B: { base: 0x0b2227, edge: 0x2fb5a6, css: '#5fd6c7', sub: '#bfe3de' },
    C: { base: 0x171c24, edge: 0x8b97a8, css: '#b8c2d0', sub: '#c3cad6' },
};
const HINT = { C: ['C', 'C', 'C'], B: ['B', 'B', 'B'], A: ['B', 'A', 'A'], S: ['B', 'A', 'S'] }; // 페이지 넘김 회차별 빛 색(기대감)

// 닫힌 역사책(표지). 원점 = 책등(왼쪽 가운데), 오른쪽으로 w. gacha.book.cover 가 있으면 이미지
export function makeClosedBook(scene, w, h) {
    const c = scene.add.container(0, 0);
    if (has(scene, K.bookCover)) { c.add(scene.add.image(0, 0, K.bookCover).setOrigin(0, 0.5).setDisplaySize(w, h)); return c; }
    c.add(scene.add.rectangle(4, 5, w, h, 0x000000, 0.45).setOrigin(0, 0.5));
    c.add(scene.add.rectangle(0, 0, w, h, 0x6b3b22, 1).setOrigin(0, 0.5).setStrokeStyle(2, COLOR.accent, 1));
    c.add(scene.add.rectangle(12, 0, w - 22, h - 20, 0x000000, 0).setOrigin(0, 0.5).setStrokeStyle(1.5, COLOR.accentLight, 0.75));
    const r = Math.min(w, h) * 0.24;
    c.add(scene.add.circle(w / 2 + 4, 0, r, 0x4a2414, 1).setStrokeStyle(2, COLOR.accent, 1));
    c.add(makeText(scene, w / 2 + 4, 0, '史', { size: Math.round(r * 0.95), bold: true, color: CSS.accent, origin: [0.5, 0.5] }));
    c.add(scene.add.rectangle(0, 0, 12, h, 0x3e2114, 1).setOrigin(0.5));
    return c;
}

export class GachaReveal {
    // cardFn(res, x, y, w, h) -> 결과 카드(그리드용, reveal(instant) 지원). onClose() = 닫힘
    constructor(scene, { res, minRarity = 'A', cardFn, onClose, summaryOnly = false }) {
        this.scene = scene;
        this.res = res;
        this.results = res?.results ?? [];
        this.multi = this.results.length > 1;
        this.minRarity = minRarity;
        this.cardFn = cardFn;
        this.onClose = onClose;
        this.tws = []; this.tms = [];
        this.alive = true;
        this.heroMap = null;
        this.mobile = L.portrait || L.lw < 760;
        this.order = this.results.map((r, i) => ({ r, i }))
            .sort((a, b) => compareRarity(a.r.rarity, b.r.rarity) || (Number(!!b.r.is_new) - Number(!!a.r.is_new)) || a.i - b.i)
            .map((x) => x.r);
        this.idx = -1;
        // 영역(로비 오버레이면 상·하 메뉴 사이): T = 위 끝, VH = 높이, 안전 여백은 로비가 처리
        this.T = scene.AY ?? 0; this.VH = scene.AH ?? this.VH;
        this.ST = scene.embedded ? 0 : this.ST; this.SB = scene.embedded ? 0 : this.SB;
        this.layout();
        this.root = scene.add.container(0, this.T).setDepth(900);
        clipToRect(scene, this.root, 0, this.T, L.lw, this.VH);
        this.block = scene.add.rectangle(0, 0, L.lw, this.VH, 0x04060b, 0).setOrigin(0).setInteractive();
        this.block.on('pointerup', () => { [this.card, this.detailCard].forEach((c) => { if (c?.scene && c.played) this.finishCard(c); }); }); // 탭 = 카드 연출 즉시 완료
        this.stage = scene.add.container(0, 0);
        this.ctrl = scene.add.container(0, 0);
        this.root.add([this.block, this.stage, this.ctrl]);
        [...new Set(this.results.map((r) => r.hero).filter(Boolean))].forEach((code) => ensurePortrait(scene, code, null, { thumb: false }));
        if (SHOW_HERO_NATIVE) ensureHeroNatives(); // 원어 이름 표(지연 청크) 미리 받기
        gameApi.heroes(true).then((hs) => { this.heroMap = new Map((hs ?? []).map((h) => [h.hero, h])); this.refreshCard(); })
            .catch(() => { this.heroMap = new Map(); this.refreshCard(); });
        ensureSkillIcons(scene, () => this.refreshCard());
        this.buildControls();
        if (summaryOnly) { this.block.fillAlpha = 0.9; if (this.multi) this.summary(); else this.emerge(0, { instant: true }); return; }
        this.intro();
    }

    // ---------- 배치 ----------
    layout() {
        const m = this.mobile;
        this.bookW = m ? Math.min(340, L.lw - 48) : Math.min(520, L.lw * 0.38);
        this.k = this.bookW / BOOK.w;
        this.bookH = BOOK.h * this.k;
        this.bx = L.lw / 2;
        this.by = m ? this.VH * 0.56 : this.VH * 0.6;
        if (!m) {
            this.PH = Math.min(this.VH * 0.74, 640);
            this.PW = this.PH * 0.75;
            this.cardW = Math.min(400, Math.max(320, L.lw * 0.29));
            this.cardH = Math.min(this.VH - 170, 560);
            const gw = this.PW + 32 + this.cardW;
            this.px = (L.lw - gw) / 2 + this.PW / 2;
            this.py = this.VH / 2 + 4;
            // S 카드 크레스트(HeroVisual.sCard: 카드 위로 약 0.06 x PH 걸침)가 영역 위 끝(상단 바·안전 여백) 밖으로 나가지 않게(강화면 gacha97, 1280): 넘치면 초상 높이를 줄인다
            { const top = (this.ST ?? 0) + 10; if (this.py - this.PH * 0.56 < top) { this.PH = Math.max(240, (this.py - top) / 0.56); this.PW = this.PH * 0.75; this.px = (L.lw - (this.PW + 32 + this.cardW)) / 2 + this.PW / 2; } }
            this.cardX = this.px + this.PW / 2 + 32;
            this.cardY = this.py - this.cardH / 2;
        } else {
            this.PH = Math.min(this.VH * 0.34, 330);
            this.PW = this.PH * 0.75;
            this.px = L.lw / 2;
            this.py = this.ST + 64 + this.PH / 2;
            this.cardX = L.safe.l + 16;
            this.cardW = L.lw - L.safe.l - L.safe.r - 32;
            this.cardY = this.py + this.PH / 2 + 10;
            this.cardH = Math.max(240, Math.min(470, this.VH - this.cardY - 92 - this.SB));
        }
    }

    buildControls() {
        const s = this.scene;
        this.skipBtn = new Button(s, { x: L.lw - L.safe.r - 132, y: this.ST + 10, w: 120, h: 44, label: '건너뛰기', size: 16, onClick: () => this.skip() });
        this.counter = makeText(s, L.safe.l + 18, this.ST + 32, '', { size: 18, heading: true, color: '#f0d58c', origin: [0, 0.5] });
        const nw = this.mobile ? Math.min(260, L.lw - 48) : 240;
        this.nextBtn = new Button(s, { x: (L.lw - nw) / 2, y: this.VH - this.SB - 74, w: nw, h: 56, label: '다음', size: 18, variant: 'primary', onClick: () => this.next() }).setVisible(false);
        this.ctrl.add([this.skipBtn, this.counter, this.nextBtn]);
    }

    // ---------- 트윈·타이머 추적 ----------
    tw(cfg) { if (!this.alive) return null; const t = this.scene.tweens.add(cfg); this.tws.push(t); return t; }
    after(ms, fn) {
        if (!this.alive) return;
        if (isInstant()) { fn(); return; }
        this.tms.push(this.scene.time.delayedCall(ms, () => { if (this.alive) fn(); }));
    }
    cancel() {
        this.tws.forEach((t) => { try { t?.remove?.(); } catch { /* 무시 */ } });
        this.tms.forEach((t) => { try { t?.remove?.(false); } catch { /* 무시 */ } });
        this.tws = []; this.tms = [];
    }
    // 시트 1회/반복 재생 스프라이트(없으면 null). 1회 재생은 끝나면 파괴
    sheet(tex, x, y, frames, fps, repeat = 0) {
        const ak = sheetAnim(this.scene, tex, frames, fps, repeat);
        if (!ak) return null;
        const sp = this.scene.add.sprite(x, y, tex, 0);
        sp.play(ak);
        if (repeat === 0) { // 1회 재생: 끝나면 파괴(완료 이벤트가 안 오는 경우 대비 시간 기준 보조 정리)
            sp.once('animationcomplete', () => sp.destroy());
            this.tms.push(this.scene.time.delayedCall((frames / fps) * 1000 + 150, () => { if (sp.scene) sp.destroy(); }));
        }
        return sp;
    }

    // ---------- 0: 어두워짐 + 닫힌 책(인장) ----------
    // 텍스처 대기: keys 가 모두 생기거나 maxMs 가 지나면 fn(그때 없는 것만 도형 폴백). 100ms 간격 확인, 건너뛰기·닫기 때 cancel 로 정리
    waitTex(keys, maxMs, fn) {
        const ks = keys.filter(Boolean); const t0 = Date.now();
        const tick = () => {
            if (!this.alive) return;
            if (isInstant() || ks.every((k) => has(this.scene, k)) || Date.now() - t0 >= maxMs) { fn(); return; }
            this.tms.push(this.scene.time.delayedCall(100, tick));
        };
        tick();
    }
    fxKeys(r) { return [K.pageglow(r), K.beam(r), K.pop(r), K.halo(r)]; }

    intro() {
        if (isInstant()) this.block.fillAlpha = 0.88;
        else this.tw({ targets: this.block, fillAlpha: 0.88, duration: 260 });
        // 책(공통) + 첫 영웅 등급 묶음이 올 때까지 최대 4초 대기(그동안 '소환 준비 중…'). 늦으면 없는 것만 폴백
        const r0 = normRarity(this.order[0]?.rarity);
        const need = [K.bookCover, K.bookCoverInner, K.bookOpen, K.bookPageflip, K.seal, K.glyph, K.particle, K.flash, ...this.fxKeys(r0)];
        if (!need.every((k) => has(this.scene, k))) {
            this.prepT = makeText(this.scene, L.lw / 2, this.VH / 2, '소환 준비 중…', { size: 18, color: CSS.muted, origin: [0.5, 0.5] });
            this.stage.add(this.prepT);
        }
        this.waitTex(need, 4000, () => { this.prepT?.destroy(); this.prepT = null; this.startBook(); });
    }

    startBook() {
        this.book = this.makeBook();
        this.fxLayer = this.scene.add.container(0, 0);
        this.stage.add([this.book.c, this.fxLayer]);
        const b = this.book;
        if (!isInstant()) { b.c.setAlpha(0).setScale(0.85); this.tw({ targets: b.c, alpha: 1, scale: 1, duration: 300, ease: 'Back.easeOut' }); }
        const r = normRarity(this.order[0]?.rarity);
        this.after(340, () => this.breakSeal(r, () => this.openBook(r, () => this.emerge(0))));
    }

    // 책 컨테이너 원점 = 펼친 책 가운데. 표지는 책등(spineX)에서 오른쪽으로
    makeBook() {
        const s = this.scene; const k = this.k;
        const W = this.bookW; const H = this.bookH;
        const spine = (BOOK.spineX - BOOK.w / 2) * k;
        const c = s.add.container(this.bx, this.by);
        const glow = s.add.image(0, -H * 0.1, texOr(s, K.glow)).setBlendMode(ADD).setAlpha(0);
        glow.setDisplaySize(W * 1.7, W * 1.7);
        const open = s.add.container(0, 0).setVisible(false);
        if (has(s, K.bookOpen)) open.add(s.add.image(0, 0, K.bookOpen).setDisplaySize(W, H));
        else {
            const hw = W / 2;
            open.add(s.add.rectangle(0, 5, W + 18, H + 16, 0x4a2a18, 1).setStrokeStyle(2, COLOR.accent, 0.9));
            [-1, 1].forEach((side) => {
                open.add(s.add.rectangle((side * hw) / 2, 0, hw - 6, H - 6, 0xeadcbc, 1));
                for (let i = 0; i < 7; i += 1) open.add(s.add.rectangle((side * hw) / 2, -H / 2 + 28 + (i * (H - 56)) / 6, hw * 0.66, 2, 0x8a7350, 0.5));
            });
            open.add(s.add.rectangle(0, 0, 10, H - 6, 0x5a4026, 0.55));
        }
        // 페이지 등급 빛(pageglow, 가산) + 문양(circle.inner/glow, 페이지 가운데 납작하게)
        const pglow = s.add.image(0, 0, texOr(s, K.glow)).setVisible(false).setBlendMode(ADD).setAlpha(0);
        const circ = s.add.container(0, -H * 0.04).setScale(1, 0.55).setAlpha(0);
        [K.circleGlow, K.circleInner].forEach((ck) => { if (has(s, ck)) circ.add(s.add.image(0, 0, ck).setBlendMode(ADD).setDisplaySize(H * 0.95, H * 0.95)); });
        open.add([pglow, circ]);
        const cw = BOOK.coverW * k; const ch = BOOK.coverH * k;
        const cover = makeClosedBook(s, cw, ch).setPosition(spine, 0);
        const inner = has(s, K.bookCoverInner) ? s.add.image(spine, 0, K.bookCoverInner).setOrigin(1, 0.5).setDisplaySize(cw, ch).setVisible(false) : null;
        // 인장(표지 위, sealCenter·지름 sealD)
        let seal = null;
        if (has(s, K.seal) && has(s, K.bookCover)) {
            const d = BOOK.sealD * k;
            seal = s.add.container(spine + BOOK.sealC[0] * k, -ch / 2 + BOOK.sealC[1] * k);
            seal.add(s.add.image(0, 0, K.seal).setDisplaySize(d, d));
            seal.d = d;
        }
        c.add([glow, open, cover, ...(inner ? [inner] : []), ...(seal ? [seal] : [])]);
        c.x = this.bx - (spine + cw / 2); // 닫힌 책 = 표지가 화면 가운데
        return { c, glow, open, cover, inner, seal, pglow, circ, spine };
    }

    // ---------- 1: 인장 깨짐 ----------
    breakSeal(r, done) {
        const b = this.book; const s = this.scene;
        if (!b.seal || isInstant()) { b.seal?.setVisible(false); done(); return; }
        sfx(GACHA_SFX.sealBreak);
        b.seal.angle = -4;
        this.tw({ targets: b.seal, angle: 4, duration: 60, yoyo: true, repeat: 2, onComplete: () => {
            if (!this.alive) return;
            b.seal.angle = 0;
            if (has(s, K.sealCrack)) b.seal.add(s.add.image(0, 0, K.sealCrack).setDisplaySize(b.seal.d, b.seal.d));
            if ((r === 'S' || r === 'A') && has(s, K.flash)) { const f = s.add.image(0, 0, K.flash).setBlendMode(ADD).setTint(rarityColor(r)).setDisplaySize(b.seal.d * 1.4, b.seal.d * 1.4); b.seal.add(f); this.tw({ targets: f, alpha: 0, duration: 260 }); }
            this.after(120, () => {
                const k = b.seal.d / 160; // 파편 offset = 인장 160 표시 px 기준
                const ox = b.seal.x - b.seal.d / 2; const oy = b.seal.y - b.seal.d / 2;
                b.seal.setVisible(false);
                for (let i = 0; i < 6; i += 1) {
                    const tk = K.sealShard(i);
                    if (!has(s, tk)) continue;
                    const meta = manifestMeta(`gacha.seal.shard.${i}`) ?? {};
                    const [dw, dh] = meta.display ?? [80, 80]; const [fx, fy] = meta.offset ?? [40, 40]; const dir = Number(meta.dir ?? (i * Math.PI) / 3);
                    const sh = s.add.image(ox + (fx + dw / 2) * k, oy + (fy + dh / 2) * k, tk).setDisplaySize(dw * k, dh * k);
                    b.c.add(sh);
                    const dist = rnd(60, 120) * this.k * 1.6;
                    this.tw({ targets: sh, x: sh.x + Math.cos(dir) * dist, y: sh.y + Math.sin(dir) * dist + 40, angle: rnd(-120, 120), alpha: 0, duration: 500, ease: 'Quad.easeIn', onComplete: () => sh.destroy() });
                }
                this.after(200, done);
            });
        } });
    }

    // ---------- 2·3: 표지 열림 + 페이지 넘김 ----------
    openBook(r, done) {
        const b = this.book;
        b.glow.setTint(rarityColor(r));
        if (isInstant()) { b.cover.setVisible(false); b.inner?.setVisible(false); b.open.setVisible(true); b.c.x = this.bx; b.glow.setAlpha(0.75); this.setPageGlow(r, 1); done(); return; }
        sfx(GACHA_SFX.bookOpen);
        b.open.setVisible(true);
        this.tw({ targets: b.c, x: this.bx, duration: 440, ease: 'Sine.easeInOut' });
        this.tw({ targets: b.cover, scaleX: 0, duration: 220, ease: 'Cubic.easeIn', onComplete: () => {
            b.cover.setVisible(false);
            if (!b.inner) return;
            const sx = b.inner.scaleX; b.inner.scaleX = 0; b.inner.setVisible(true);
            this.tw({ targets: b.inner, scaleX: sx, duration: 220, ease: 'Cubic.easeOut', onComplete: () => this.tw({ targets: b.inner, alpha: 0, duration: 200 }) });
        } });
        this.after(460, () => { sfx(GACHA_SFX.lightRise); this.flipPages(RFX[r].flips, r, done); });
    }

    setPageGlow(r, a) {
        const b = this.book; const s = this.scene;
        const pk = K.pageglow(r);
        if (has(s, pk)) { b.pglow.setTexture(pk).setVisible(true).setDisplaySize(this.bookW, this.bookH).setAlpha(a); b.pglow.clearTint?.(); }
        b.glow.setTint(rarityColor(r));
        b.circ.list.forEach((o) => o.setTint(rarityColor(r)));
        b.circ.setAlpha(Math.min(1, a));
    }

    // n 회 넘김. 회차마다 빛 색 암시(HINT) + 효과음. 시트(pageflip)가 없으면 사각 페이지 넘김
    flipPages(n, r, done) {
        const s = this.scene;
        const hw = this.bookW / 2; const H = this.bookH;
        const hint = HINT[r] ?? [r];
        let k = 0;
        if (this.book.circ.list.length && !isInstant()) this.tw({ targets: this.book.circ, angle: 360, duration: 20000, repeat: -1 });
        const one = () => {
            if (!this.alive || !this.book) return;
            if (k >= n || isInstant()) { this.setPageGlow(r, 1); done(); return; }
            const hr = n === 1 ? r : hint[Math.min(hint.length - 1, Math.floor((k * hint.length) / n))];
            k += 1;
            sfx(GACHA_SFX.pageFlip);
            this.setPageGlow(hr, Math.min(1, 0.35 + (k / n) * 0.65));
            this.tw({ targets: this.book.glow, alpha: Math.min(1, 0.45 + (k / n) * 0.5), duration: 240 });
            const sp = this.sheet(K.bookPageflip, 0, 0, 6, 24, 0);
            if (sp) { sp.setDisplaySize(this.bookW, H); this.book.c.add(sp); this.after(260, one); return; }
            const pg = s.add.rectangle(0, 0, hw - 6, H - 6, 0xf3e7cc, 1).setOrigin(0, 0.5).setStrokeStyle(1, 0xb89f74, 0.8);
            this.book.c.add(pg);
            this.tw({ targets: pg, scaleX: -1, duration: 200, ease: 'Sine.easeInOut', onComplete: () => { pg.destroy(); one(); } });
        };
        one();
    }

    // ---------- 4: 빛줄기 + 글자·빛 파티클 ----------
    burst(rar) {
        const s = this.scene; const col = rarityColor(rar); const fx = RFX[rar];
        const hw = this.bookW / 2; const H = this.bookH;
        const sy = this.by - H * 0.05;
        const fly = (o, dur) => this.tw({ targets: o, y: o.y - rnd(170, 320), x: o.x + rnd(-110, 110), angle: rnd(-60, 60), alpha: 0, duration: dur, ease: 'Cubic.easeOut', onComplete: () => o.destroy() });
        if (has(s, K.glyph)) {
            for (let i = 0; i < fx.ink; i += 1) { const g = s.add.image(this.bx + rnd(-hw * 0.8, hw * 0.8), sy + rnd(-H * 0.2, H * 0.15), K.glyph, Math.floor(rnd(0, 8))).setScale(rnd(0.35, 0.6)); this.fxLayer.add(g); fly(g, rnd(800, 1200)); }
            for (let i = 0; i < fx.gold; i += 1) { const g = s.add.image(this.bx + rnd(-hw * 0.8, hw * 0.8), sy + rnd(-H * 0.2, H * 0.15), K.glyph, 8 + Math.floor(rnd(0, 8))).setScale(rnd(0.35, 0.6)).setBlendMode(ADD).setTint(col); this.fxLayer.add(g); fly(g, rnd(800, 1200)); }
        } else {
            for (let i = 0; i < 12; i += 1) {
                const g = makeText(s, this.bx + rnd(-hw * 0.7, hw * 0.7), sy + rnd(-H * 0.2, H * 0.1), BOOK_GLYPHS[i % BOOK_GLYPHS.length], { size: Math.round(rnd(18, 30)), bold: true, color: i % 3 ? rarityCss(rar) : '#f0d58c', origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } });
                this.fxLayer.add(g); fly(g, rnd(900, 1400));
            }
        }
        if (has(s, K.particle)) for (let i = 0; i < fx.parts; i += 1) {
            const f = i % 3 === 0 ? 2 : (rar === 'S' && i % 5 === 0 ? 6 : fx.part);
            const p = s.add.image(this.bx + rnd(-hw * 0.7, hw * 0.7), sy + rnd(-H * 0.2, H * 0.1), K.particle, f).setBlendMode(ADD).setTint(col).setScale(rnd(0.25, 0.55));
            this.fxLayer.add(p); fly(p, rnd(700, 1300));
        }
        // 빛줄기: beam.<r> 시트(12fps 반복) -> 없으면 코드 생성 세로 빛줄기 부채꼴
        const bk = K.beam(rar);
        if (has(s, bk)) {
            const mk = (alpha, wMul) => {
                const b = this.sheet(bk, this.bx, sy, 8, 12, -1);
                if (!b) return;
                b.setOrigin(0.5, 1).setBlendMode(ADD).setAlpha(alpha);
                b.setDisplaySize(96 * this.k * 2 * fx.beamW * wMul, this.VH * 0.9);
                const ty = b.scaleY; b.scaleY = 0;
                this.fxLayer.add(b);
                this.tw({ targets: b, scaleY: ty, duration: 300, ease: 'Cubic.easeOut' });
                this.tw({ targets: b, alpha: 0, duration: 600, delay: 1100, onComplete: () => b.destroy() });
            };
            mk(0.95, 1);
            if (rar === 'S') mk(0.5, 1.8);
        } else {
            const key = texOr(s, K.ray);
            const n = { S: 7, A: 5, B: 4, C: 3 }[rar] ?? 3;
            if (key) for (let i = 0; i < n; i += 1) {
                const r = s.add.image(this.bx, sy, key).setOrigin(0.5, 1).setBlendMode(ADD).setTint(col).setAlpha(0.85).setAngle(-34 + (68 * i) / Math.max(1, n - 1));
                r.setDisplaySize(rnd(34, 70), this.VH * 0.95);
                const ty = r.scaleY; r.scaleY = 0;
                this.fxLayer.add(r);
                this.tw({ targets: r, scaleY: ty, duration: 320, delay: i * 25, ease: 'Cubic.easeOut' });
                this.tw({ targets: r, alpha: 0, duration: 700, delay: 900, onComplete: () => r.destroy() });
            }
        }
    }

    // ---------- 5·6: 팝 인 -> 초상화 + 카드 ----------
    emerge(i, { instant = false } = {}) {
        if (!this.alive) return;
        const r = this.order[i];
        if (!r) return;
        this.idx = i;
        const inst = instant || isInstant();
        const rar = normRarity(r.rarity);
        this.clearItem();
        this.item = this.scene.add.container(0, 0);
        this.stage.add(this.item);
        this.counter.setText(this.multi ? `${i + 1} / ${this.order.length}` : '');
        this.nextBtn.setVisible(false);
        const cardLayer = this.scene.add.container(0, 0);
        const pc = this.makePortrait(r);
        this.item.add([cardLayer, pc]);
        const card = this.makeCard(r, this.cardW, this.cardH);
        card.setPosition(this.cardX, this.cardY);
        const back = this.cardBack(r);
        cardLayer.add(back);
        cardLayer.add(card);
        card.back = back; card.drawFrame(card.curH); // 이미 맞춰진 높이로 광채 재배치
        this.card = card; this.cardLayer = cardLayer;
        if (inst) { this.finishCard(card); this.settled(i); if (this.book) this.book.c.setAlpha(0); return; }
        if (this.book) this.burst(rar);
        const fast = i > 0 && (rar === 'C' || rar === 'B'); // 10연 C/B 는 짧게
        this.after(fast ? 260 : 480, () => {
            sfx(GACHA_SFX.popIn); sfx(RARITY_SFX[rar]);
            const sy = this.by - this.bookH * 0.3 - this.PH * 0.2;
            pc.setPosition(this.bx, sy + 120).setScale(0.6).setAlpha(0);
            this.tw({ targets: pc, alpha: 1, y: sy, scale: 1.12, duration: 230, ease: 'Back.easeOut', onComplete: () => this.tw({ targets: pc, scale: 1, duration: 120, ease: 'Sine.easeOut' }) });
            this.flash(rar, this.bx, sy);
            this.after(fast ? 360 : 560, () => {
                this.tw({ targets: pc, x: this.px, y: this.py, duration: 340, ease: 'Cubic.easeInOut' });
                if (this.book) this.tw({ targets: this.book.c, alpha: 0, y: this.by + 30, duration: 300 });
                const ox = this.mobile ? 0 : 80; const oy = this.mobile ? 120 : 0;
                cardLayer.setPosition(ox, oy).setAlpha(0);
                this.after(140, () => sfx(GACHA_SFX.cardSlide));
                this.tw({ targets: cardLayer, x: 0, y: 0, alpha: 1, duration: 300, delay: 140, ease: 'Cubic.easeOut', onComplete: () => { this.playCard(card); this.settled(i); } });
            });
        });
        if (!inst) { pc.setAlpha(0); cardLayer.setAlpha(0); }
    }

    // 섬광(flash 이미지 scale 0.5->4 / 폴백 전체 사각) + pop.<r> 충격파 + 흔들림(S 6px, A 3px)
    flash(rar, x, y) {
        const s = this.scene; const fx = RFX[rar]; const col = rarityColor(rar);
        if (has(s, K.flash)) {
            const f = s.add.image(x, y, K.flash).setBlendMode(ADD).setTint(col).setAlpha(fx.flash);
            f.setDisplaySize(256, 256); const sc = f.scale;
            f.setScale(sc * 0.5);
            this.stage.add(f);
            this.tw({ targets: f, scale: sc * 4, alpha: 0, duration: 180, ease: 'Quad.easeOut', onComplete: () => f.destroy() });
        } else {
            const f = s.add.rectangle(0, 0, L.lw, this.VH, 0xffffff, fx.flash * 0.8).setOrigin(0);
            this.stage.add(f);
            this.tw({ targets: f, alpha: 0, duration: 280, onComplete: () => f.destroy() });
        }
        const p = this.sheet(K.pop(rar), x, y, 8, 30, 0);
        if (p) { p.setBlendMode(ADD).setDisplaySize(this.PH * 1.1, this.PH * 1.1); this.stage.add(p); }
        if (fx.shake) try { const cam = s.cameras.main; if (typeof cam.shake === 'function') cam.shake(200, fx.shake / Math.max(1, L.lw)); } catch { /* 무시 */ }
    }

    // 카드 뒤: aura.<r>(1회) + cardglow.<r>(S/A 맥동)
    cardBack(r) {
        const s = this.scene; const c = s.add.container(0, 0); const rar = normRarity(r.rarity);
        const cx = this.cardX + this.cardW / 2; const cy = this.cardY + this.cardH / 2;
        const gk = K.cardglow(rar);
        if (has(s, gk)) {
            const g = s.add.image(cx, cy, gk).setBlendMode(ADD).setDisplaySize(this.cardW * (296 / 224), this.cardH * (372 / 300));
            c.add(g); c.glow = g;
            if ((rar === 'S' || rar === 'A') && !isInstant()) { g.setAlpha(0.7); this.tw({ targets: g, alpha: 1, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); }
        }
        if (!isInstant()) { const a = this.sheet(K.aura(rar), cx, cy, 8, 16, 0); if (a) { a.setBlendMode(ADD).setDisplaySize(this.cardW * 1.6, this.cardW * 1.6); c.add(a); c.aura = a; } }
        return c;
    }

    settled(i) {
        if (!this.alive) return;
        const last = i >= this.order.length - 1;
        this.nextBtn.setLabel(!last ? `다음 (${i + 1}/${this.order.length})` : this.multi ? '결과 보기' : '확인');
        this.nextBtn.setVisible(true);
        if (!this.multi) this.skipBtn.setVisible(false);
    }

    clearItem() {
        if (this.item?.scene) {
            const all = []; const walk = (o) => { all.push(o); o.list?.forEach(walk); }; walk(this.item);
            this.scene.tweens.killTweensOf(all);
            this.item.destroy();
        }
        this.item = null; this.card = null; this.cardLayer = null;
    }

    // 초상화(원본, PW x PH 안 비율 유지) + 후광 halo.<r>(회전 30s, 폴백 = 원형 광원 틴트). 원점 = 가운데
    makePortrait(r) {
        const s = this.scene;
        const pc = s.add.container(this.px, this.py);
        const rar = normRarity(r.rarity); const col = rarityColor(rar);
        const hk = K.halo(rar);
        if (has(s, hk)) {
            const h = s.add.image(0, -this.PH * 0.06, hk).setBlendMode(ADD);
            h.setDisplaySize(this.PH * 1.1, this.PH * 1.1);
            pc.add(h);
            if (!isInstant()) this.tw({ targets: h, angle: 360, duration: 30000, repeat: -1 });
        } else {
            const gk = texOr(s, K.glow);
            if (gk) { const g = s.add.image(0, -this.PH * 0.08, gk).setBlendMode(ADD).setTint(col).setAlpha(0.55); g.setDisplaySize(this.PH * 1.15, this.PH * 1.15); pc.add(g); }
        }
        const holder = s.add.container(0, 0);
        // S 등급: 배경 판(지연) -> 인물(holder) -> frame.rank.s -> 장식. 그 외 등급은 holder 만(현행)
        pc.add(sCard(s, r, -this.PW / 2, -this.PH / 2, this.PW, this.PH, () => holder.setPosition(this.PW / 2, this.PH / 2)));
        const draw = (tex) => {
            if (!holder.scene) return;
            holder.removeAll(true);
            if (tex && s.textures.exists(tex)) {
                const img = s.add.image(0, 0, tex);
                img.setScale(Math.min(this.PW / img.frame.realWidth, this.PH / img.frame.realHeight));
                holder.add(img);
            } else {
                holder.add(s.add.rectangle(0, 0, this.PW * 0.8, this.PH * 0.82, col, 0.3).setStrokeStyle(2, col, 0.9));
                holder.add(makeText(s, 0, 0, heroPlainName(r).slice(0, 1), { size: Math.round(this.PH * 0.22), bold: true, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 5 } }));
            }
        };
        draw(ensurePortrait(s, r.hero, (tex) => draw(tex), { thumb: false }));
        if (!isInstant()) this.after(900, () => { if (holder.scene) this.tw({ targets: holder, scale: 1.015, y: holder.y - 3, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); }); // 호흡
        return pc;
    }

    // ---------- 영웅 카드(재디자인) ----------
    // 등급 테마 패널(바탕·테두리·광채) + 등급 문장 팝·별 순차 팝 + (중복이면) 조각 칩 + 능력치 게이지(카운트업) + 스킬 순차 등장 + 역사 설명.
    // 등장 연출은 card.play()(슬라이드 인 완료 후), 화면 탭 = card.finish()(즉시 최종 상태). 연출 끄기면 처음부터 최종 상태.
    // 역사 = GET /api/heroes detail.profile(one_line·summary·era·region). 없으면 영역 숨김. 근거 수준 등 단서 문구는 표시하지 않는다.
    makeCard(r, w, h) {
        const s = this.scene;
        const rar = normRarity(r.rarity);
        const th = CARD_THEME[rar];
        const c = s.add.container(0, 0);
        c.fx = []; c.r = r; c.cardW = w; c.cardH = h; c.pad = 18; // this.w 는 Phaser 4 setPosition 이 0 으로 덮으므로 별도 이름
        const g = s.add.graphics();
        c.add(g);
        c.add(gradBand(s, 4, 4, w - 8, Math.min(140, h * 0.32), th.edge, 0.28, 0, 'down', 12)); // 상단 등급색 광
        const fr = s.add.graphics();
        c.add(fr);
        // 패널 높이 = 내용에 맞춤(최대 h). 카드 뒤 광채(cardglow)도 같이 맞춘다(c.back = cardBack 반환값)
        c.drawFrame = (hh) => {
            c.curH = hh;
            g.clear().fillStyle(th.base, 0.97).fillRoundedRect(0, 0, w, hh, 14);
            fr.clear().lineStyle(2.5, th.edge, 1).strokeRoundedRect(0, 0, w, hh, 14).lineStyle(1, th.edge, 0.35).strokeRoundedRect(6, 6, w - 12, hh - 12, 10);
            const gl = c.back?.glow;
            if (gl?.scene) { gl.setDisplaySize(w * (296 / 224), hh * (372 / 300)); gl.y = c.y + hh / 2; }
            if (c.back?.aura?.scene) c.back.aura.y = c.y + hh / 2;
        };
        c.drawFrame(h);
        const pad = c.pad;
        // 등급 문장(우상단 원 + 글자) 팝
        const em = s.add.container(w - 40, 40);
        em.add(s.add.circle(0, 0, 26, th.base, 1).setStrokeStyle(3, th.edge, 1));
        em.add(makeText(s, 0, 0, rar, { size: 30, heading: true, color: th.css, origin: [0.5, 0.5] }));
        c.add(em);
        this.cfx(c, em, { scale: 0, alpha: 0 }, { scale: 1, alpha: 1 }, { delay: 80, duration: 320, ease: 'Back.easeOut' });
        if (rar === 'S' || rar === 'A') { const ring = s.add.circle(w - 40, 40, 30, th.edge, 0).setStrokeStyle(2, th.edge, 0.8); c.addAt(ring, c.list.indexOf(em)); this.loopFx(c, { targets: ring, scale: 1.35, alpha: 0, duration: 1400, repeat: -1 }); }
        let y = 18;
        // 중복일 때만 작은 조각 칩(신규 표시는 하지 않음 — 사용자 지시 2026-11-03)
        if (!r.is_new) {
            const chip = s.add.container(pad, y);
            const ct = makeText(s, 8, 10, `조각 +${fmtNum(r.shards_gained)} (보유 ${fmtNum(r.shards_total)})`, { size: 12, bold: true, color: th.sub, origin: [0, 0.5] });
            chip.add(s.add.rectangle(0, 0, ct.width + 16, 20, 0x000000, 0.35).setOrigin(0).setStrokeStyle(1, th.edge, 0.5));
            chip.add(ct);
            c.add(chip);
            this.cfx(c, chip, { alpha: 0 }, { alpha: 1 }, { delay: 40, duration: 260 });
            y += 28;
        } else y += 6;
        const tw = w - pad * 2 - 64; // 우상단 등급 문장 자리 비움
        if (r.title) { const t = makeText(s, pad, y, r.title, { size: 14, color: th.sub }); fitText(t, tw); c.add(t); y += t.height + 2; }
        // 원어 이름(data/hero_native_names.json): 서브셋 폰트가 그 글자를 담을 때만 큰 글씨(한글 이름 크기 이상) + 아래 한글 병기. 폰트를 받는 동안은 한글을 큰 글씨로 두었다가 도착하면 교체
        const ko = gachaShortName(r);
        const nat = SHOW_HERO_NATIVE ? getNative(r.hero) : null;
        const face = nat ? plaqueFace(nat.script, nat.lang) : null;
        const natOk = !!(nat && face?.id && face.file && plaqueCovers(face.id, nat.native));
        const bigSize = this.mobile ? 28 : 32;
        const nm = makeText(s, pad, y, ko, { size: natOk ? bigSize : this.mobile ? 26 : 30, heading: true, color: '#ffffff' }); // 신겐·겐신 등 일본 무장은 정식 이름(names.gachaShortName)
        shrinkToFit(nm, tw, 16); fitText(nm, tw);
        c.add(nm);
        this.cfx(c, nm, { alpha: 0, y: y + 10 }, { alpha: 1, y }, { delay: 60, duration: 280 });
        y += nm.height + 2;
        if (natOk) {
            const sub = makeText(s, pad, y, ko, { size: this.mobile ? 15 : 17, bold: true, color: th.sub }).setVisible(false);
            fitText(sub, tw); c.add(sub); y += sub.height + 4;
            const swap = () => { if (!nm.scene) return; nm.setFontFamily(face.stack); if (face.rtl) nm.setRTL?.(true); nm.setText(nfc(nat.native)); nm.setFontSize(`${bigSize}px`); shrinkToFit(nm, tw, 16); sub.setVisible(true); };
            if (plaqueFontReady(face.id)) swap(); else loadPlaqueFont(face.id).then((ok) => { if (ok) swap(); });
        } else y += 2;
        // 별(순차 팝) + 등급 라벨 + 병종
        const n = RARITY_STARS[rar] ?? 1;
        let sx = pad;
        for (let i = 0; i < n; i += 1) {
            const st = makeText(s, sx + 9, y + 11, '★', { size: 20, bold: true, color: th.css, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } });
            c.add(st);
            this.cfx(c, st, { scale: 0 }, { scale: 1 }, { delay: 200 + i * 90, duration: 220, ease: 'Back.easeOut' });
            sx += 20;
        }
        const rl = makeText(s, sx + 8, y + 11, `${rarityLabel(rar)} · ${unitClassName(r.unit_type)}`, { size: 15, bold: true, color: CSS.text, origin: [0, 0.5] });
        c.add(rl);
        y += 30;
        c.add(s.add.rectangle(pad, y, w - pad * 2, 1, th.edge, 0.45).setOrigin(0));
        y += 10;
        c.bodyY = y;
        this.fillCardBody(c);
        if (isInstant()) this.finishCard(c);
        return c;
    }

    // 카드 연출 등록: from 상태로 두고 play 때 to 로 트윈. finish = 즉시 to
    cfx(c, target, from, to, opt = {}) {
        if (!isInstant()) Object.assign(target, from);
        c.fx.push({ target, to, opt });
    }
    loopFx(c, cfg, delay = 0) { (c.loops ??= []).push({ cfg, delay }); }
    playCard(c) {
        if (!c?.scene || c.played) return;
        c.played = true;
        if (isInstant()) { this.finishCard(c); return; }
        this.playFx(c.fx);
        (c.loops ?? []).forEach(({ cfg, delay }) => this.after(delay + 600, () => { if (cfg.targets?.scene) this.tw(cfg); }));
    }
    playFx(list) {
        if (isInstant()) { list.forEach(({ target, to, opt }) => { Object.assign(target, to); opt.onUpdate?.(); }); return; }
        list.forEach((f) => { const { target, to, opt } = f; if (target.scene || target.isProxy) f.tween = this.tw({ targets: target, ...to, duration: opt.duration ?? 260, delay: opt.delay ?? 0, ease: opt.ease ?? 'Cubic.easeOut', onStart: opt.onStart, onUpdate: opt.onUpdate, onComplete: opt.onComplete }); });
    }
    finishCard(c) {
        if (!c?.scene) return;
        c.fx.forEach((f) => { try { f.tween?.remove(); } catch { /* 무시 */ } f.tween = null; }); // 반복(펄스·링) 트윈은 유지
        c.fx.forEach(({ target, to, opt }) => { if (!target.scene && !target.isProxy) return; Object.assign(target, to); opt.onUpdate?.(); opt.onComplete?.(); });
        c.played = true;
    }

    fillCardBody(c) {
        if (!c?.scene) return;
        const s = this.scene;
        if (c.cbody) { // 다시 그림(능력치 도착 등): 이전 본문 연출 제거
            const old = new Set(c.cbody.list);
            c.fx = c.fx.filter((f) => !old.has(f.target) && !(f.target.isProxy && f.target.owner === c.cbody));
            c.cbody.destroy();
        }
        const body = s.add.container(0, c.bodyY);
        c.cbody = body; c.add(body);
        const fx0 = c.fx.length;
        const pad = c.pad; const w = c.cardW; const maxH = c.cardH - c.bodyY - 14;
        const hh = this.heroMap?.get(c.r.hero);
        if (!this.heroMap || !hh?.detail) {
            body.add(makeText(s, pad, 4, this.heroMap ? '능력치 정보 없음' : '능력치 불러오는 중…', { size: 14, color: CSS.muted }));
            return;
        }
        const th = CARD_THEME[normRarity(c.r.rarity)];
        const st = hh.detail.stats;
        let y = 0;
        // 능력치 게이지(아이콘 + 라벨 + 둥근 바 + 카운트업)
        if (st) {
            const rows = [['pix.atk', '공격', st.atk, STAT_CAP.at, 0xe0663c], ['pix.def', '방어', st.def, STAT_CAP.df, 0x4a9be8]];
            // 이동·사거리(서버 detail.stats.move / range_min·range_max, 부대 병종 기준). 필드가 없으면 행 생략. 상한 = 이동 8(기병·비행) / 사거리 3(마법사)
            if (Number.isFinite(Number(st.move)) && st.move != null) rows.push(['pix.move', '이동', Number(st.move), 8, 0xd8b04a]);
            if (Number.isFinite(Number(st.range_max)) && st.range_max != null) { const rmin = Number(st.range_min ?? st.range_max); const rmax = Number(st.range_max); rows.push(['pix.range', '사거리', rmax, 3, 0x9b7be0, rmin !== rmax ? `${rmin}~${rmax}` : String(rmax)]); }
            const barX = pad + 96; const barW = Math.max(60, w - barX - pad - 44);
            rows.forEach(([ico, lb, v, cap, col, label], i) => {
                const ry = y + i * 30;
                const ic = pixelImage(s, ico, pad + 10, ry + 11, 18);
                if (ic) body.add(ic); else body.add(s.add.circle(pad + 10, ry + 11, 6, col, 1));
                body.add(makeText(s, pad + 26, ry + 11, lb, { size: 14, color: th.sub, origin: [0, 0.5] }));
                const vt = makeText(s, w - pad, ry + 11, label ?? fmtNum(v), { size: 16, bold: true, color: '#ffffff', origin: [1, 0.5] });
                body.add(vt);
                const gg = s.add.graphics();
                body.add(gg);
                const frac = Math.max(0.03, Math.min(1, (Number(v) || 0) / cap));
                const proxy = { t: 0, isProxy: true, owner: body };
                const draw = () => {
                    if (!gg.scene) return;
                    gg.clear();
                    gg.fillStyle(0x000000, 0.45).fillRoundedRect(barX, ry + 5, barW, 12, 6);
                    const fw = Math.max(12, barW * frac * proxy.t);
                    gg.fillStyle(col, 1).fillRoundedRect(barX, ry + 5, fw, 12, 6);
                    gg.fillStyle(0xffffff, 0.28).fillRoundedRect(barX + 2, ry + 6, Math.max(8, fw - 4), 4, 2); // 윗면 하이라이트
                    gg.lineStyle(1, th.edge, 0.5).strokeRoundedRect(barX, ry + 5, barW, 12, 6);
                    if (vt.scene && label == null) vt.setText(fmtNum(Math.round((Number(v) || 0) * proxy.t))); // 사거리 '2~3' 같은 표기는 카운트업 없이 고정
                };
                draw();
                this.cfx(c, proxy, { t: 0 }, { t: 1 }, { delay: 250 + i * 120, duration: 650, ease: 'Cubic.easeOut', onUpdate: draw, onComplete: draw });
            });
            y += rows.length * 30 + 8;
        }
        // 역사 설명(있을 때만): era·region + 한 줄 + 요약(최대 3줄 말줄임)
        const pf = hh.profile ?? hh.detail.profile ?? null;
        const histMain = pf?.one_line || pf?.summary;
        const histNeed = histMain ? 96 : 0;
        // 스킬(순차 등장): 역사 칸을 남기고 들어가는 만큼(최대 3)
        const skills = (hh.detail.skills ?? []).filter((k) => k && k.name);
        const rowH = 32;
        const room = Math.floor((maxH - y - histNeed - 22) / rowH);
        if (skills.length && room > 0) {
            body.add(makeText(s, pad, y, '스킬', { size: 13, bold: true, color: th.css }));
            y += 20;
            const ut = hh.unit_type ?? hh.detail.unit_type;
            skills.slice(0, Math.min(3, room)).forEach((k, i) => {
                const row = s.add.container(0, y);
                const kind = k.type === 'active' ? 'active' : k.type === 'aura' ? 'aura' : 'passive';
                row.add(s.add.rectangle(pad, 0, w - pad * 2, rowH - 4, 0xffffff, 0.05).setOrigin(0));
                const f = skillIconFrame(s, k.code, { kind, unitType: ut, template: k.template });
                const ic = f ? skillIconImage(s, f, pad + 15, (rowH - 4) / 2, 24) : null;
                if (ic) row.add(ic);
                const tx = ic ? pad + 34 : pad + 8;
                const kt = makeText(s, tx, (rowH - 4) / 2, SKILL_KO[kind] ?? '', { size: 12, bold: true, color: th.css, origin: [0, 0.5] });
                row.add(kt);
                const nt = makeText(s, tx + kt.width + 8, (rowH - 4) / 2, skillDisplayName(k.name), { size: 14, origin: [0, 0.5] });
                fitText(nt, w - pad - 6 - (tx + kt.width + 8));
                row.add(nt);
                body.add(row);
                this.cfx(c, row, { alpha: 0, x: 16 }, { alpha: 1, x: 0 }, { delay: 600 + i * 110, duration: 240 });
                y += rowH;
            });
            y += 6;
        } else if (!skills.length) { // 고유 스킬이 없는 영웅(NPC 등): 빈 칸 대신 짧은 표기
            body.add(makeText(s, pad, y, '스킬', { size: 13, bold: true, color: th.css }));
            body.add(makeText(s, pad + 40, y, '고유 스킬 없음', { size: 13, color: CSS.muted }));
            y += 26;
        }
        // 역사: 전문 표시(말줄임 없음). 남은 칸보다 길면 그 칸 안에서 스크롤(휠·드래그, 클리핑 + 얇은 스크롤바 + 하단 페이드). 짧으면 스크롤 UI 없음.
        // 영역 안 드래그 = 스크롤, 짧은 탭 = 기존 동작(카드 연출 즉시 완료)
        if (histMain && maxH - y >= 50) {
            const tags = [pf.era, pf.region].filter(Boolean).join(' · ');
            body.add(makeText(s, pad, y, tags ? `역사 · ${tags}` : '역사', { size: 13, bold: true, color: th.css }));
            y += 20;
            const iw = w - pad * 2 - 8; // 스크롤바 자리
            const hc = s.add.container(0, 0);
            let hy = 0;
            if (pf.one_line) { const ol = makeText(s, 0, hy, pf.one_line, { size: 14, bold: true, color: '#ffffff', wrap: iw }); hc.add(ol); hy += ol.height + 6; }
            if (pf.summary) { const sm = makeText(s, 0, hy, pf.summary, { size: 13, color: th.sub, wrap: iw }); hc.add(sm); hy += sm.height; }
            hc.clipH = hy;
            const avail = maxH - y;
            if (hy <= avail) { hc.setPosition(pad, y); body.add(hc); y += hy + 4; this.cfx(c, hc, { alpha: 0 }, { alpha: 1 }, { delay: 900, duration: 400 }); }
            else {
                const list = new ScrollList(s, { x: pad, y, w: w - pad * 2, h: avail, clip: true, bar: true, fadeColor: th.base });
                list.content.add(hc);
                list.setContentHeight(hy);
                list.refreshMask();
                const hit = list.list[0]; let downY = null;
                hit.on('pointerdown', (pt) => { downY = pt.worldY; });
                hit.on('pointerup', (pt) => { if (downY != null && Math.abs(pt.worldY - downY) < 6 && c.played) this.finishCard(c); downY = null; });
                body.add(list);
                y += avail;
                this.cfx(c, list, { alpha: 0 }, { alpha: 1 }, { delay: 900, duration: 400 });
            }
        }
        c.drawFrame(Math.min(c.cardH, Math.max(c.bodyY + y + 16, 220))); // 내용(스킬·역사 없는 영웅)에 맞춰 패널을 줄인다
        if (c.played) this.playFx(c.fx.slice(fx0)); // 이미 등장한 카드에 늦게 도착한 본문(능력치·스킬·역사)은 그 부분만 연출
    }

    refreshCard() {
        if (!this.alive) return;
        [this.card, this.detailCard].forEach((c) => { if (c?.scene) this.fillCardBody(c); });
    }

    // ---------- 진행 ----------
    next() {
        if (!this.alive || !this.nextBtn.visible) return;
        const i = this.idx;
        if (i < this.order.length - 1) {
            this.nextBtn.setVisible(false);
            const nr = normRarity(this.order[i + 1].rarity);
            const go = () => {
                if (!this.book) { this.emerge(i + 1); return; }
                const b = this.book;
                if (isInstant()) { b.c.setAlpha(1).setY(this.by); this.setPageGlow(nr, 1); this.emerge(i + 1); return; }
                this.tw({ targets: b.c, alpha: 1, y: this.by, duration: 220, ease: 'Sine.easeOut', onComplete: () => this.flipPages(1, nr, () => this.emerge(i + 1)) });
            };
            const goWait = () => this.waitTex(this.fxKeys(nr), 2500, go); // 다음 영웅 등급 묶음 대기(최대 2.5초)
            if (this.item && !isInstant()) this.tw({ targets: this.item, alpha: 0, x: -60, duration: 200, onComplete: goWait });
            else goWait();
            return;
        }
        if (this.multi && !this.summaryShown) { this.summary(); return; }
        this.close();
    }

    skip() {
        if (!this.alive) return;
        this.cancel();
        if (this.multi) { this.summary(); return; }
        this.stage.removeAll(true); this.book = null; this.item = null; this.card = null;
        this.block.fillAlpha = 0.88;
        this.emerge(this.order.length - 1, { instant: true });
    }

    // 결과 그리드(10연 요약). 카드 = 로비와 같은 결과 카드(cardFn). 최고 등급 카드 뒤 회전 광선(gacha.rays)
    summary() {
        this.cancel();
        this.summaryShown = true;
        this.stage.removeAll(true);
        this.book = null; this.item = null; this.card = null;
        this.skipBtn.setVisible(false); this.counter.setText('');
        this.block.fillAlpha = 0.9;
        const s = this.scene;
        const n = this.results.length;
        const r = this.res ?? {};
        const y0 = this.ST + 36;
        this.stage.add(makeText(s, L.lw / 2, y0, `${n}회 소환 결과`, { size: 26, heading: true, color: '#f0d58c', origin: [0.5, 0.5] }));
        const sum = [r.currency === 'pen' ? `펜 -${fmtNum(r.pen_spent)} · 남은 펜 ${fmtNum(r.pen)}` : `골드 -${fmtNum(r.gold_spent)} · 남은 골드 ${fmtNum(r.gold)}`]; // 결제 통화 분기(서버 currency·pen_spent·pen, 강화면 v6)
        const dup = this.results.filter((x) => !x.is_new);
        if (dup.length) sum.push(`중복 ${dup.length}명 · 조각 +${fmtNum(dup.reduce((a, x) => a + (Number(x.shards_gained) || 0), 0))}`);
        if (r.pity?.guarantee_applied) sum.push(`${this.minRarity} 이상 보장 적용`);
        if (r.replay) sum.push('이전 요청 결과');
        this.stage.add(makeText(s, L.lw / 2, y0 + 34, sum.join(' · '), { size: 14, color: CSS.muted, origin: [0.5, 0.5], align: 'center', wrap: L.lw - 40 }));
        const cols = this.mobile ? (L.lw >= 420 ? 4 : 3) : 5;
        const gap = 10;
        const availW = Math.min(L.lw - 32, 900);
        const top = y0 + 64;
        const availH = this.VH - top - 96 - this.SB;
        const rows = Math.ceil(n / cols) || 1;
        let cw = Math.floor(Math.min(160, (availW - gap * (cols - 1)) / cols));
        let ch = Math.floor(Math.min(cw * 1.45, (availH - gap * (rows - 1)) / rows));
        if (ch < cw * 1.2) cw = Math.floor(ch / 1.2);
        ch = Math.max(90, ch);
        const gx = (L.lw - (cw * cols + gap * (cols - 1))) / 2;
        const best = this.results.reduce((bi, x, i) => (compareRarity(x.rarity, this.results[bi].rarity) < 0 ? i : bi), 0);
        this.results.forEach((res, i) => {
            const x = gx + (i % cols) * (cw + gap); const y = top + Math.floor(i / cols) * (ch + gap);
            if (i === best && has(s, K.rays)) {
                const ry = s.add.image(x + cw / 2, y + ch / 2, K.rays).setBlendMode(ADD).setTint(rarityColor(res.rarity)).setAlpha(0.8);
                ry.setDisplaySize(cw * 2, cw * 2);
                this.stage.add(ry);
                if (!isInstant()) this.tw({ targets: ry, angle: 360, duration: 20000, repeat: -1 });
            }
            const card = this.cardFn?.(res, x, y, cw, ch);
            if (!card) return;
            // 카드 뒤 불투명 받침(강화면 v8 Low): 딤(0.9) 너머 로비 배너 목록 글자('필수 n/m')가 카드의 반투명 부분으로 비치지 않게. 딤과 같은 색이라 모서리는 티 나지 않음
            const backing = s.add.rectangle(x, y, cw, ch, 0x04060b, 1).setOrigin(0);
            this.stage.add(backing);
            if (!isInstant()) { backing.setAlpha(0); this.tw({ targets: backing, alpha: 1, duration: 200, delay: i * 45 }); }
            this.stage.add(card);
            const hit = s.add.rectangle(x, y, cw, ch, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
            hit.on('pointerup', () => { if (!this.detail) this.showDetail(res); });
            this.stage.add(hit);
            card.reveal?.(true);
            if (!isInstant()) { card.setAlpha(0); this.tw({ targets: card, alpha: 1, duration: 200, delay: i * 45 }); }
        });
        this.nextBtn.setLabel('확인');
        this.nextBtn.setVisible(true);
    }

    // 결과 그리드에서 1명 다시 보기: 초상 + 같은 결과 카드(연출 포함). 닫기 = 그리드로
    showDetail(r) {
        const s = this.scene;
        const layer = s.add.container(0, 0);
        this.detail = layer;
        this.root.addAt(layer, this.root.list.indexOf(this.ctrl));
        layer.add(s.add.rectangle(0, 0, L.lw, this.VH, 0x04060b, 0.94).setOrigin(0).setInteractive().on('pointerup', () => { if (this.detailCard?.scene && this.detailCard.played) this.finishCard(this.detailCard); }));
        layer.add(this.makePortrait(r));
        const cl = s.add.container(0, 0);
        const card = this.makeCard(r, this.cardW, this.cardH).setPosition(this.cardX, this.cardY);
        const back = this.cardBack(r);
        cl.add([back, card]);
        card.back = back; card.drawFrame(card.curH);
        layer.add(cl);
        this.detailCard = card;
        if (!isInstant()) { cl.setAlpha(0).setPosition(this.mobile ? 0 : 60, this.mobile ? 80 : 0); this.tw({ targets: cl, alpha: 1, x: 0, y: 0, duration: 260, ease: 'Cubic.easeOut', onComplete: () => this.playCard(card) }); } else this.playCard(card);
        sfx(GACHA_SFX.cardSlide);
        this.nextBtn.setVisible(false);
        const nw = this.mobile ? Math.min(260, L.lw - 48) : 240;
        layer.add(new Button(s, { x: (L.lw - nw) / 2, y: this.VH - this.SB - 74, w: nw, h: 56, label: '목록으로', size: 18, onClick: () => this.closeDetail() }));
    }

    closeDetail() {
        if (!this.detail) return;
        const all = []; const walk = (o) => { all.push(o); o.list?.forEach(walk); }; walk(this.detail);
        this.scene.tweens.killTweensOf(all);
        this.detail.destroy(); this.detail = null; this.detailCard = null;
        this.nextBtn.setVisible(true);
    }

    close() {
        if (!this.alive) return;
        this.alive = false;
        this.cancel();
        this.root.destroy();
        this.onClose?.();
    }
}
