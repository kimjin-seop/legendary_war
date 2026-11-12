import { tween, isInstant } from '../ui/motion.js';
import { TILE } from '../UnitView.js';
import { ARROW, arcHeight, fireVolley } from './ArrowFx.js';
import { typeAlias } from '../data/rules.js';

// 월드(맵) 위 공격 모션: 에셋 없이 코드로 만든 병종별 연출(1단계). 컷신이 켜진 일반 공격은 컷신 뒤 hit 만 재생되므로 이 모션은
// 컷신이 꺼졌을 때(settings.cutscene=false)·미스·반격 등 컷신을 건너뛰는 경우에 쓰인다.
// 모든 시간은 motion.tween 을 거쳐 배속(1/2/4x)·연출 끄기·스킵을 따른다(끄기/스킵이면 즉시 최종값 + 이펙트 생략).
// 이펙트 개수는 FxManager.useEffect 상한을 따른다. impact() 는 호출자(FxManager.attack)가 넘기는 '타격 + 복귀' 콜백이다.
const SLASH = new Set(['sword']);
// gunner = 'gun'(직선 탄 + 총구 화염·연기. 안아트 에셋 전 임시 = 코드 도형) // 퇴역 heavy 등은 typeAlias(서버 alias_of)로 sword 판정. 신규 assassin·monster 는 기본 slash
export const attackKind = (type0) => { const type = typeAlias(type0); return (SLASH.has(type) ? 'slash' : type === 'spear' ? 'thrust' : type === 'cavalry' ? 'cav' : type === 'archer' ? 'arrow' : type === 'gunner' ? 'gun'
    : type === 'mage' || type === 'healer' ? 'magic' : type === 'flyer' ? 'dive' : 'slash'); };
const PAL = { slash: 0xfff1c9, thrust: 0xe8e4d8, cav: 0xcbbf9a, arrow: 0xe8e4d8, magic: 0x8f7cff, healer: 0x6bd67a, dive: 0xbfe3ff, spark: 0xffe9a8 };

// 이펙트 1개(그래픽 객체) 생성 -> 애니메이션 -> 정리. instant/상한 초과면 생략
function effect(fxm, make, animate) {
    if (isInstant()) return;
    fxm.useEffect((free) => {
        const o = make(fxm.scene);
        fxm.d.worldFx.add(o);
        animate(o, () => { o.destroy(); free(); });
    });
}

function slashArc(fxm, x, y, ang, color) {
    effect(fxm, (sc) => { const g = sc.add.graphics(); g.lineStyle(5, color, 1).beginPath().arc(0, 0, TILE * 0.55, -0.9, 0.9).strokePath(); return g.setPosition(x, y).setRotation(ang); },
        (g, end) => tween(fxm.scene, { targets: g, to: { alpha: 0, scaleX: 1.25, scaleY: 1.25 }, duration: 150, onComplete: end }));
}

function thrustLine(fxm, x, y, ang, color) {
    effect(fxm, (sc) => { const g = sc.add.graphics(); g.lineStyle(4, color, 1).lineBetween(-TILE * 0.2, 0, TILE * 0.65, 0); return g.setPosition(x, y).setRotation(ang); },
        (g, end) => tween(fxm.scene, { targets: g, to: { alpha: 0 }, duration: 130, onComplete: end }));
}

function burst(fxm, x, y, color, n = 6, r = TILE * 0.45) {
    for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
        effect(fxm, (sc) => sc.add.circle(x, y, 3, color, 0.95),
            (o, end) => tween(fxm.scene, { targets: o, to: { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, alpha: 0 }, duration: 180, ease: 'Quad.easeOut', onComplete: end }));
    }
}

function speedLines(fxm, x, y, ux, uy, ang) {
    for (let i = -1; i <= 1; i++) {
        const ox = -uy * i * 9; const oy = ux * i * 9;
        effect(fxm, (sc) => sc.add.rectangle(x + ox, y + oy, TILE * 0.7, 2, 0xffffff, 0.8).setRotation(ang),
            (o, end) => tween(fxm.scene, { targets: o, to: { alpha: 0, x: o.x - ux * 14, y: o.y - uy * 14 }, duration: 180, onComplete: end }));
    }
    for (let i = 0; i < 3; i++) {
        effect(fxm, (sc) => sc.add.circle(x - ux * 8, y + TILE * 0.3, 4, PAL.cav, 0.7),
            (o, end) => tween(fxm.scene, { targets: o, to: { x: o.x - ux * (10 + i * 8), y: o.y - 6 - i * 3, alpha: 0, scale: 2 }, duration: 260, onComplete: end }));
    }
}

// 포물선 투사체(화살/구슬). from/to: 월드 좌표. 도착 시 onArrive
function projectile(fxm, from, to, make, ms, arc, onArrive) {
    if (isInstant()) { onArrive(); return; }
    let ran = false;
    fxm.useEffect((free) => {
        ran = true;
        const o = make(fxm.scene);
        fxm.d.worldFx.add(o);
        const p = { t: 0 };
        const place = () => {
            const x = from.x + (to.x - from.x) * p.t;
            const y = from.y + (to.y - from.y) * p.t - Math.sin(Math.PI * p.t) * arc;
            const nt = Math.min(1, p.t + 0.02);
            const nx = from.x + (to.x - from.x) * nt;
            const ny = from.y + (to.y - from.y) * nt - Math.sin(Math.PI * nt) * arc;
            o.setPosition(x, y).setRotation(Math.atan2(ny - y, nx - x));
        };
        place();
        tween(fxm.scene, { targets: p, to: { t: 1 }, duration: ms, ease: 'Linear', onUpdate: place, onComplete: () => { o.destroy(); free(); onArrive(); } });
    });
    if (!ran) onArrive(); // 이펙트 상한 초과 시에도 타격 콜백은 반드시 호출(공격 연출 멈춤 방지)
}

export function playAttackMotion(fxm, { type, a, t, ux, uy, len, m, impact }) {
    const sc = fxm.scene;
    const base = { x: a.c.x, y: a.c.y };
    const kind = attackKind(type);
    const ang = Math.atan2(uy, ux);
    const at = () => ({ x: t.c.x, y: t.c.y });
    const go = (to, ms, ease, next) => tween(sc, { targets: a.c, to, duration: ms, ease, onComplete: next });
    const hitMelee = () => { const p = at(); if (kind === 'thrust') thrustLine(fxm, p.x - ux * TILE * 0.3, p.y - uy * TILE * 0.3, ang, PAL.thrust); else slashArc(fxm, p.x, p.y, ang, PAL.slash); burst(fxm, p.x, p.y, PAL.spark, 5); impact(); };

    if (kind === 'slash' || kind === 'thrust' || kind === 'cav') {
        const windup = 3 * m; // 뒤로 2~3px 웅크림 0.08s
        const reach = Math.min(TILE * (kind === 'cav' ? 0.5 : 0.45), len * 0.5) * m;
        go({ x: base.x - ux * windup, y: base.y - uy * windup }, 80, 'Sine.easeOut', () => {
            if (kind === 'cav') speedLines(fxm, a.c.x, a.c.y, ux, uy, ang);
            go({ x: base.x + ux * reach, y: base.y + uy * reach }, kind === 'cav' ? 70 : 100, 'Quad.easeIn', () => { if (kind === 'cav') { const p = at(); burst(fxm, p.x, p.y, PAL.cav, 6); } hitMelee(); });
        });
    } else if (kind === 'dive') { // 비행: 솟구쳤다 급강하
        go({ x: base.x, y: base.y - TILE * 0.35 * m }, 100, 'Sine.easeOut', () => {
            go({ x: base.x + ux * Math.min(TILE * 0.6, len * 0.6) * m, y: base.y + uy * Math.min(TILE * 0.6, len * 0.6) * m }, 90, 'Quad.easeIn', hitMelee);
        });
    } else if (kind === 'arrow') { // 궁수: 뒤로 젖힘 -> 발사 반동 + 섬광 -> 포물선 화살(보조 화살 분산) -> 착탄 시 타격
        go({ x: base.x - ux * 4 * m, y: base.y - uy * 4 * m }, 100, 'Sine.easeOut', () => {
            tween(sc, { targets: a.c, to: { x: base.x + ux * 2 * m, y: base.y + uy * 2 * m }, duration: 50 });
            const from = { x: a.c.x + ux * TILE * 0.2, y: a.c.y - TILE * 0.15 };
            const to = { x: t.c.x, y: t.c.y - TILE * 0.1 };
            const h = arcHeight(len, ARROW.worldArcMul);
            const landMain = () => { const p = at(); burst(fxm, p.x, p.y + TILE * 0.2, PAL.cav, 4, TILE * 0.3); impact(); }; // 먼지 + 타격(데미지·흔들림은 impact -> hit)
            let ran = false;
            fxm.useEffect((free) => {
                ran = true;
                const shots = [{ from, to, h, delay: 0, dur: ARROW.worldFlightMs, onLand: () => { free(); landMain(); } }];
                const extra = m >= 0.8 ? ARROW.worldExtra : 0; // 반복 감쇠·축약이면 보조 화살 생략
                for (let i = 1; i <= extra; i++) {
                    const sp = TILE * ARROW.worldSpreadTile;
                    shots.push({ from: { x: from.x - uy * (i % 2 ? 5 : -5), y: from.y + ux * (i % 2 ? 5 : -5) }, to: { x: to.x + (Math.random() - 0.5) * 2 * sp, y: to.y + (Math.random() - 0.5) * sp },
                        h: h * (0.85 + Math.random() * 0.3), delay: i * ARROW.worldExtraGap, dur: ARROW.worldFlightMs * (0.9 + Math.random() * 0.1) });
                }
                fireVolley(sc, fxm.d.worldFx, shots, { scale: 1, trail: m >= 0.5, land: true });
            });
            if (!ran) landMain(); // 이펙트 상한 초과: 화살 없이 바로 타격(연출이 멈추지 않게)
        });
    } else if (kind === 'gun') { // 총병: 반동 + 총구 화염(섬광) + 연기 -> 직선 탄(arc 0, 빠르게) -> 착탄 불꽃
        const muzzle = { x: a.c.x + ux * TILE * 0.35, y: a.c.y + uy * TILE * 0.35 - TILE * 0.08 };
        tween(sc, { targets: a.c, to: { x: base.x - ux * 3 * m, y: base.y - uy * 3 * m }, duration: 60, yoyo: true });
        effect(fxm, (s) => s.add.circle(muzzle.x, muzzle.y, TILE * 0.16, 0xfff1a8, 1), (o, end) => tween(sc, { targets: o, to: { scale: 1.8, alpha: 0 }, duration: 110, ease: 'Quad.easeOut', onComplete: end }));
        effect(fxm, (s) => s.add.circle(muzzle.x, muzzle.y - 2, TILE * 0.18, 0xb8b8b8, 0.55), (o, end) => tween(sc, { targets: o, to: { scale: 2.2, alpha: 0, y: muzzle.y - TILE * 0.35 }, duration: 520, ease: 'Sine.easeOut', onComplete: end }));
        projectile(fxm, muzzle, { x: t.c.x, y: t.c.y - TILE * 0.08 }, (s) => s.add.rectangle(0, 0, 8, 3, 0xffe9a8, 1).setRotation(ang), 90, 0, () => { const p = at(); burst(fxm, p.x, p.y, PAL.spark, 5, TILE * 0.35); impact(); });
    } else { // magic: 상승 + 발광 링 차징 0.25s -> 구슬 -> 폭발
        const color = type === 'healer' ? PAL.healer : PAL.magic;
        effect(fxm, (s) => s.add.circle(a.c.x, a.c.y, TILE * 0.45).setStrokeStyle(3, color, 1).setScale(1.4),
            (o, end) => tween(sc, { targets: o, to: { scale: 0.4, alpha: 0.2 }, duration: 250, ease: 'Sine.easeIn', onComplete: end }));
        go({ x: base.x, y: base.y - 6 * m }, 250, 'Sine.easeOut', () => {
            projectile(fxm, { x: a.c.x, y: a.c.y - TILE * 0.2 }, { x: t.c.x, y: t.c.y }, (s) => s.add.circle(0, 0, 7, color, 1).setStrokeStyle(2, 0xffffff, 0.9), 160, 0, () => {
                const p = at();
                effect(fxm, (s) => s.add.circle(p.x, p.y, TILE * 0.2, color, 0.65), (o, end) => tween(sc, { targets: o, to: { scale: 2.4, alpha: 0 }, duration: 200, ease: 'Quad.easeOut', onComplete: end }));
                burst(fxm, p.x, p.y, color, 6, TILE * 0.5);
                impact();
            });
        });
    }
}

// 치유: 시전자 발광 링 + 대상에서 상승하는 초록 입자
export function playHealFx(fxm, caster, target) {
    if (isInstant()) return;
    const sc = fxm.scene;
    if (caster) effect(fxm, (s) => s.add.circle(caster.c.x, caster.c.y, TILE * 0.3).setStrokeStyle(3, PAL.healer, 1), (o, end) => tween(sc, { targets: o, to: { scale: 1.6, alpha: 0 }, duration: 320, onComplete: end }));
    for (let i = 0; i < 6; i++) {
        const x = target.c.x + (Math.random() - 0.5) * TILE * 0.6;
        effect(fxm, (s) => s.add.circle(x, target.c.y + TILE * 0.2, 3, PAL.healer, 0.9),
            (o, end) => tween(sc, { targets: o, to: { y: o.y - TILE * 0.7 - Math.random() * 10, alpha: 0 }, duration: 420 + i * 40, ease: 'Sine.easeOut', onComplete: end }));
    }
}
