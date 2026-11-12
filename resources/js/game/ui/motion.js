import { settings } from '../settings.js';
import { FX } from '../fx_config.js';

// 연출 헬퍼: fxLevel 끄기 또는 스킵 중이면 즉시 최종값 반영. 진행 중 연출은 registry에 기록해 snapAll()로 한 번에 스냅한다.
export const fx = { skipping: false, skipTurn: false };
export const fxScale = () => FX.scaleLevels[settings.get().fxLevel];
export const isInstant = () => fxScale() === 0 || fx.skipping || fx.skipTurn;
const speed = () => settings.get().speed;
const active = new Set();

// to: 숫자 속성 목표. final: 스냅 시 최종값(yoyo 등 to와 다를 때). rest: onUpdate/yoyo/delay 등
export function tween(scene, { targets, to, final, duration = 200, ease = 'Sine.easeOut', onComplete, ...rest }) {
    const fin = final ?? to;
    if (isInstant()) {
        [].concat(targets).forEach((t) => Object.assign(t, fin));
        onComplete?.();
        return null;
    }
    const rec = { targets, fin, onComplete };
    rec.t = scene.tweens.add({
        targets, ...to, duration: duration / speed(), ease, ...rest,
        onComplete: () => { active.delete(rec); onComplete?.(); },
    });
    active.add(rec);
    return rec.t;
}

export function wait(scene, ms, fn) {
    if (isInstant()) { fn(); return; }
    const rec = { fn };
    rec.timer = scene.time.delayedCall(ms / speed(), () => { active.delete(rec); fn(); });
    active.add(rec);
}

// 현재 재생 중인 모든 연출을 최종 상태로 스냅하고 완료 콜백을 호출
export function snapAll() {
    const recs = [...active];
    active.clear();
    recs.forEach((r) => {
        if (r.timer) { r.timer.remove(false); r.fn(); return; }
        r.t.remove();
        [].concat(r.targets).forEach((t) => Object.assign(t, r.fin));
        r.onComplete?.();
    });
}

export function clearRegistry() { active.clear(); }

// 반복 연출(커서 깜빡임 등): 축약/끄기에서는 생성하지 않는다(초당 3회 이상 점멸 금지 준수).
export function loop(scene, cfg) {
    if (settings.get().fxLevel > 0) return null;
    return scene.tweens.add({ repeat: -1, yoyo: true, ...cfg });
}
