// 대사 줄 단위 장면 효과(선택 필드). 스키마·값은 docs/DIALOGUE_SCENE_EFFECTS.md.
// 사용처: scenes/Dialogue.js(스테이지 전·후·튜토리얼), ui/BattleDialogue.js(전투 대사 오버레이). 필드가 없으면 아무것도 하지 않는다(기존과 동일).
// - sfx: audio 슬롯 키 재생. 슬롯이 없으면 생략 + 콘솔 warn 1회(키별)
// - shake: true | 'light' | 'medium' | 'heavy' -> 메인 카메라 흔들림(모션 줄이기/즉시 모드에서는 생략)
// - bg: 배경 논리 키(bg.<set>.<name>). Dialogue 씬만 적용(setBg 콜백), 전투 대사는 배경 층이 없어 무시 + warn 1회. manifest 에 없으면 현재 배경 유지 + warn 1회
// - fade: 'out'(검게 어두워짐, 이 줄 동안 유지) | 'in'(검은 화면에서 밝아짐) | 'flash'(흰 섬광)
// - blackout: true -> 이 줄 동안 배경·초상화를 검게 가림(대사 패널은 보임)
// 덮개(rect)는 호출 측이 만든 화면 전체 사각형(초상화 위·대사 패널 아래 순서)을 attach 로 넘긴다. clear() = 스킵·ESC·종료 시 효과 정리.
import { audio } from '../audio.js';
import { manifestHas } from '../assets.js';
import { isInstant } from '../ui/motion.js';
import { settings } from '../settings.js';

export const LINE_FX_SHAKE = { light: [150, 0.004], medium: [260, 0.008], heavy: [420, 0.014] }; // [ms, 강도]
const FADE_MS = 600;
const FLASH_MS = 260;
const CLEAR_MS = 300;
const FADES = new Set(['out', 'in', 'flash']);
const warned = new Set();
const warnOnce = (k, msg) => { if (warned.has(k)) return; warned.add(k); console.warn(msg); };

export class LineFx {
    constructor(scene, { setBg = null } = {}) {
        this.scene = scene;
        this.setBg = setBg;
        this.rect = null;
        this.tw = null;
    }

    attach(rect) { this.killTween(); this.rect = rect; return rect; }

    reduced() { return isInstant() || settings.get().fxLevel === 2; }

    killTween() { this.tw?.remove?.(); this.tw = null; }

    fadeTo(alpha, ms) {
        const r = this.rect;
        if (!r?.active) return;
        this.killTween();
        if (this.reduced() || ms <= 0) { r.setAlpha(alpha); return; }
        this.tw = this.scene.tweens.add({ targets: r, alpha, duration: ms, ease: 'Sine.easeInOut', onComplete: () => { this.tw = null; } });
    }

    // 줄이 화면에 나올 때 1회. 잘못된 값은 대사 진행을 막지 않는다(warn 1회 후 생략)
    apply(line) {
        if (!line || typeof line !== 'object') return;
        try { this.applyBg(line.bg); } catch (e) { console.warn('[dialogue] bg 효과 실패', e); }
        try { this.applyOverlay(line.fade, line.blackout); } catch (e) { console.warn('[dialogue] fade 효과 실패', e); }
        try { this.applyShake(line.shake); } catch (e) { console.warn('[dialogue] shake 효과 실패', e); }
        try { this.applySfx(line.sfx); } catch (e) { console.warn('[dialogue] sfx 효과 실패', e); }
    }

    applyBg(bg) {
        if (bg == null || bg === '') return;
        if (!this.setBg) { warnOnce('bg:ctx', '[dialogue] 줄 bg 는 대사 씬에서만 적용됩니다(전투 대사 오버레이는 무시)'); return; }
        if (typeof bg !== 'string' || !manifestHas(bg)) { warnOnce(`bg:${bg}`, `[dialogue] 배경 키 없음: ${bg} (현재 배경 유지)`); return; }
        this.setBg(bg);
    }

    applyOverlay(fade, blackout) {
        const r = this.rect;
        if (!r?.active) return;
        if (fade != null && fade !== '' && !FADES.has(fade)) warnOnce(`fade:${fade}`, `[dialogue] fade 값 오류: ${fade} (out|in|flash 만 지원)`);
        if (blackout != null && typeof blackout !== 'boolean') warnOnce(`blackout:${blackout}`, `[dialogue] blackout 값 오류: ${blackout} (true|false)`);
        if (blackout === true) { this.killTween(); r.setFillStyle(0x000000, 1).setAlpha(1); return; }
        if (fade === 'out') { r.setFillStyle(0x000000, 1); this.fadeTo(1, FADE_MS); return; }
        if (fade === 'in') { r.setFillStyle(0x000000, 1).setAlpha(1); this.fadeTo(0, FADE_MS); return; }
        if (fade === 'flash') { if (this.reduced()) { this.fadeTo(0, 0); return; } r.setFillStyle(0xffffff, 1).setAlpha(0.85); this.fadeTo(0, FLASH_MS); return; }
        if (r.alpha > 0) this.fadeTo(0, CLEAR_MS); // 효과 없는 줄: 직전 줄의 암전·페이드 해제
    }

    applyShake(shake) {
        if (shake == null || shake === false) return;
        const p = shake === true ? LINE_FX_SHAKE.medium : LINE_FX_SHAKE[shake];
        if (!p) { warnOnce(`shake:${shake}`, `[dialogue] shake 값 오류: ${shake} (true|light|medium|heavy)`); return; }
        if (this.reduced()) return;
        this.scene.cameras?.main?.shake(p[0], p[1]);
    }

    applySfx(sfx) {
        if (sfx == null || sfx === '') return;
        if (typeof sfx !== 'string' || !audio.has(sfx)) { warnOnce(`sfx:${sfx}`, `[dialogue] 효과음 슬롯 없음: ${sfx} (생략)`); return; }
        audio.play(sfx);
    }

    // 스킵·ESC·종료·재배치: 덮개 투명, 흔들림 즉시 정지(남는 효과 없음)
    clear() {
        this.killTween();
        if (this.rect?.active) this.rect.setAlpha(0);
        try { this.scene.cameras?.main?.shakeEffect?.reset(); } catch { /* 카메라 없음 */ }
    }
}
