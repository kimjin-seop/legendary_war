import { FX, FX_TEXTURES } from '../fx_config.js';
import { COLOR, CSS, textStyle } from '../theme.js';
import { L } from '../layout.js';
import { fx, fxScale, isInstant, tween, wait, snapAll } from '../ui/motion.js';
import { settings } from '../settings.js';
import { audio } from '../audio.js';
import { TILE } from '../UnitView.js';
import { BattleCutscene } from './BattleCutscene.js';
import { voiceHeroFall } from './BattleVoice.js';
import { unitDisplayName, heroPlainName, isHeroUnit, unitClassName } from '../systems/names.js';
import { playAttackMotion, playHealFx } from './AttackMotion.js';
import { axisDir } from '../systems/facing.js';
import { auraBonus } from '../systems/combat.js';
import { troopDelta } from '../systems/soldiers.js';
import { UNIT_BASE, TERRAINS, terrainMod, unitType } from '../data/rules.js';
import { worldCharge, worldImpact, passivePop } from './SkillFx.js';
import { playSkillFx } from './SkillFxSheet.js';
import { skillFxFamily } from './skillFxResolve.js';
import { playSkillCutin, prefetchCutinPortrait } from './SkillCutin.js';
import { CUTIN, cutinMs } from './skillCutinLayout.js';
import { waterStateAt } from '../systems/water.js';

const TNAME = { shallows: '여울', bridge: '다리', road: '도로', swamp: '늪', snow_desert: '설원', cliff: '절벽', wall: '성벽', village: '마을' };

// 연출 매니저: 이벤트 큐(순차 재생) / 스킵 / 배속·강도 / 오브젝트 풀 / 개별 연출.
// 연출은 판정을 바꾸지 않는다. 상태는 store 가 서버 응답으로 이미 확정했고, 여기서는 화면만 따라간다(큐 끝의 'sync' 에서 최종값 스냅).
//
// deps: { world, worldFx(월드 위 레이어), ui(UI 레이어), getView(id), removeView(id), getUnit(id) }
export class FxManager {
    constructor(scene, deps) {
        this.scene = scene;
        this.d = deps;
        this.q = [];
        this.busy = false;
        this.counts = new Map();
        this.effects = 0;
        this.particles = 0;
        this.shaking = false;
        this.popupPool = [];
        this.shardPool = [];
        this.tileState = new Map(); // 같은 타일 팝업 스폰 간격/쌓기
        this.onIdle = null;
    }

    // ---- 큐 / 스킵 ----
    // meta(선택): 이동 병렬 묶음 판단용 표식. { kind:'move', unitId, e } | { kind:'camera' }(이동 직전 카메라 따라가기) | { kind:'facing', unitId }
    // 큐 원소는 그대로 함수(CuePlayer 가 q 끝 원소를 함수로 비교한다). 표식은 함수 속성으로 붙인다
    enqueue(fn, meta) {
        if (meta) fn.fxMeta = meta;
        this.q.push(fn);
        this.pump();
    }

    pump() {
        if (this.busy || this.paused) return;
        if (!this.q.length) { this.onIdle?.(); return; }
        if (this.runMoveBatch()) return;
        const fn = this.q.shift();
        this.busy = true;
        fx.skipping = false;
        let called = false;
        let wd = null;
        const done = () => {
            if (called) return;
            called = true;
            wd?.remove?.(false);
            this.busy = false;
            this.pump();
        };
        // 연출 단계 감시(입력 멈춤 감사 2026-11-04): done 이 끝내 안 불리면(트윈 대상 파괴로 onComplete 누락 등) fx.playing 이 영구 true -> 행동 메뉴·팝업이 안 뜬다.
        //  씬 시간 20초(백그라운드에선 루프와 함께 멈춤) 안에 끝나지 않으면 경고 후 강제 진행
        //  단, 이벤트 대사(scene.storyDialogue)가 열려 있으면 사용자가 읽는 중 = 정상 대기 -> 강제 진행하지 않고 다시 20초 감시(강화면 v8: 대사를 20초 넘게 읽으면
        //  큐가 대사 뒤로 흘러 적 턴·전투 판정·결과창이 대사창 아래에서 먼저 진행되던 문제)
        const arm = () => { try { wd = this.scene?.time?.delayedCall?.(20000, () => {
            if (called) return;
            const dlg = this.scene?.storyDialogue;
            if (dlg && !dlg.closed) { arm(); return; }
            console.warn('[fx] 연출 단계가 20초 안에 끝나지 않아 강제 진행', fn.fxMeta ?? ''); done();
        }) ?? null; } catch { wd = null; } };
        arm();
        try { fn(done); } catch (e) { console.error('[fx]', e); done(); }
    }

    // ---- 이동 병렬 묶음(FX.parallel) ----
    // 큐 앞쪽에서 [카메라·방향·이동] 표식만 연달아 있는 구간을 골라 이동 2기 이상이면 동시에 재생한다. 끊는 조건(그 앞까지만 묶음):
    //  표식 없는 연출(공격·회복·배너·sync·대사·cue 등) / 같은 유닛 이동이 다시 나옴 / 묶음 안 이동 유닛의 방향 이벤트(이동 후 방향 = 순서 필요) /
    //  도착 칸 중복 / 원위치 스냅·cue(scripted) 이동 / 상한 max 기. 끝에 남은 카메라·방향(다음 이동 소속)은 큐에 돌려둔다.
    // 묶음 시간: 가장 긴 경로 기준으로 칸당 ms 를 줄여 batchMs 안에, 연달은 묶음 합계는 runMs 안에(1배속 기준. tween 이 배속으로 다시 나눔).
    runMoveBatch() {
        const P = FX.parallel;
        if (!P || settings.get().parallelMoves === false) return false;
        const moving = new Set(); const dests = new Set();
        let n = 0; let take = 0; let moves = 0;
        for (let i = 0; i < this.q.length; i++) {
            const m = this.q[i].fxMeta;
            if (!m) break;
            if (m.kind === 'camera') { n = i + 1; continue; }
            if (m.kind === 'facing') { if (moving.has(String(m.unitId))) break; n = i + 1; continue; }
            if (m.kind !== 'move') break;
            const e = m.e; const last = e?.path?.[e.path.length - 1];
            if (!e || e.snapTo || e.scripted || !last) break;
            const id = String(m.unitId); const dk = `${last.x},${last.y}`;
            if (moving.has(id) || dests.has(dk) || moves >= P.max) break;
            moving.add(id); dests.add(dk); moves += 1;
            n = i + 1; take = n; // 이동으로 끝나는 지점까지만 가져간다
        }
        if (moves < 2) return false;
        const items = this.q.splice(0, take);
        this.busy = true;
        fx.skipping = false;
        const now = this.scene.time?.now ?? 0;
        if (!this.moveRun || now - this.moveRun.end > P.gapResetMs) this.moveRun = { spent: 0, end: now };
        const cap = Math.max(P.minBatchMs, Math.min(P.batchMs, P.runMs - this.moveRun.spent));
        const evs = items.filter((f) => f.fxMeta.kind === 'move').map((f) => f.fxMeta.e);
        const maxLen = Math.max(1, ...evs.map((e) => e.path.length));
        const msPerTile = Math.min(FX.move.msPerTile, cap / maxLen);
        this.moveRun.spent += msPerTile * maxLen;
        let camDone = false;
        let pending = evs.length;
        let finished = false;
        const done = () => {
            if (finished) return;
            finished = true;
            this.moveRun.end = this.scene.time?.now ?? 0;
            this.busy = false;
            this.pump();
        };
        const join = () => { pending -= 1; if (pending === 0) done(); };
        try {
            // 카메라는 첫 이동 것만(여러 번 패닝하면 오히려 어지럽다), 방향은 순서대로 즉시 적용
            items.forEach((f) => {
                const k = f.fxMeta.kind;
                if (k === 'camera') { if (!camDone) { camDone = true; f(() => {}); } }
                else if (k === 'facing') f(() => {});
            });
            evs.forEach((e, i) => this.move({ ...e, msPerTile, quiet: i > 0 }, join));
        } catch (err) { console.error('[fx] move batch', err); done(); }
        return true;
    }

    // 탭 1회: 현재 연출 즉시 종료·최종 상태 스냅. 연출 중이었으면 true
    skip() {
        if (!this.busy) return false;
        fx.skipping = true;
        snapAll();
        return true;
    }

    setSkipTurn(on) { fx.skipTurn = on; }
    resetCounts() { this.counts.clear(); }
    get playing() { return this.busy || this.q.length > 0; }

    // 같은 연출 키 반복 감쇠 x 강도
    mul(key) {
        const n = this.counts.get(key) ?? 0;
        this.counts.set(key, n + 1);
        return fxScale() * FX.repeatDecay[Math.min(n, FX.repeatDecay.length - 1)];
    }

    useEffect(fn) {
        if (this.effects >= FX.limits.effects) return;
        this.effects += 1;
        let freed = false;
        fn(() => { if (!freed) { freed = true; this.effects -= 1; } });
    }

    // ---- 이벤트 진입점(store 'event' 중 연출 이벤트) ----
    handle(e) {
        if (e.type === 'move') this.enqueue((done) => this.move(e, done), { kind: 'move', unitId: e.unitId, e });
        else if (e.type === 'attack') this.enqueue((done) => this.attack(e, done));
        else if (e.type === 'collapse') this.enqueue((done) => this.collapse(e, done));
        else if (e.type === 'look') this.enqueue((done) => { this.d.getView(e.unitId)?.setLook(e.facing); done(); }); // 표시용 시선(규칙 off 대기 방향)
        else if (e.type === 'facing') this.enqueue((done) => { this.d.getView(e.unitId)?.setFacing(e.facing); done(); }, { kind: 'facing', unitId: e.unitId });
        else if (e.type === 'heal') this.enqueue((done) => this.heal(e, done));
        else if (e.type === 'kill') this.enqueue((done) => { const v = this.d.getView(e.unitId); if (v) this.kill(v, done); else done(); });
        else if (e.type === 'cutin') this.enqueue((done) => this.cutin(e, done));
        // 액티브 스킬(서버 skill_use): 영웅 초상 컷인(fx/SkillCutin) 후 시전 시트 -> 이어지는 attack(e.skill)이 컷신(안에 위력 배너) 또는 월드 임팩트.
        //  (2026-11-10 사용자 '스킬 쓸 때 영웅 초상화': 이전엔 컷신이 재생될 교전이면 컷인을 생략하고 컷신 배너만 보였다 -> 컷신 여부와 무관하게 컷인)
        else if (e.type === 'skillUse') {
            const su = this.d.getUnit?.(e.unitId);
            if (su) prefetchCutinPortrait(this.scene, this.cutinOwner(su)); // 컷인 초상 지연 로드(재생 시점에 아직 없으면 병종 엠블럼 -> 도착하면 교체)
            // 스킬 이펙트 시트(시전 계열 buff·surge·stance·decoy·heal): 컷인 뒤 시전자(heal 은 대상)에 1회, 비차단. 시트 없으면 기존 연출만(buffFx·회복 글로우)
            const cast = (done) => { try { playSkillFx(this, e.fx, 'cast', this.d.getView(e.unitId), e.targetId != null ? this.d.getView(e.targetId) : null); } catch (err) { console.warn('[fx] skill sheet', err); } done(); };
            this.enqueue((done) => this.cutin({ unitId: e.unitId, skill: e.name }, () => cast(done)));
        }
        else if (e.type === 'buff') this.enqueue((done) => this.buffFx(e, done)); // 강화 부여(반격 태세 등): 대상 위 방벽 링 + 라벨, 짧게
        else if (e.type === 'turnStart') this.enqueue((done) => { if (e.side === 'ally') { this.resetCounts(); fx.skipTurn = false; } this.banner(e, done); });
        else if (e.type === 'turnEnd') this.enqueue((done) => { audio.play('turn'); this.banner(e, done); });
    }

    tilePos(x, y) { return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 }; }

    // 강화 부여 연출: 반격 태세(counter) = 금색 방벽 링, 그 외 = 청색 링. 라벨 '반격 태세'/'공격 +N%' 가 위로 떠오른다(연출 끄기면 즉시 완료)
    buffFx(e, done) {
        const v = this.d.getView?.(e.unitId);
        if (!v || isInstant() || !this.d.worldFx) { done(); return; }
        const sc = this.scene; const x = v.c.x; const y = v.c.y;
        const col = e.stat === 'counter' ? 0xffd76a : 0x8fd0ff;
        const g = sc.add.graphics(); this.d.worldFx.add(g);
        const STAT = { atk: '공격', def: '방어', counter: '반격 태세', move: '이동' };
        const lb = e.stat === 'counter' ? STAT.counter : `${STAT[e.stat] ?? '강화'} +${e.amount ?? 0}%`;
        const t = sc.add.text(x, y - TILE * 0.7, lb, { fontFamily: 'sans-serif', fontSize: '14px', fontStyle: 'bold', color: e.stat === 'counter' ? '#FFE08A' : '#BFE6FF', stroke: '#0B1020', strokeThickness: 4 }).setOrigin(0.5);
        this.d.worldFx.add(t);
        const p = { t: 0 };
        const draw = () => { if (!g.scene) return; g.clear(); g.lineStyle(3, col, 1 - p.t * 0.7).strokeCircle(x, y, TILE * (0.3 + p.t * 0.35)); g.fillStyle(col, 0.18 * (1 - p.t)).fillCircle(x, y, TILE * 0.45); };
        draw();
        tween(sc, { targets: p, to: { t: 1 }, duration: 420, onUpdate: draw, onComplete: () => { g.destroy(); } });
        tween(sc, { targets: t, to: { y: t.y - 18, alpha: 0 }, duration: 700, onComplete: () => t.destroy() });
        wait(sc, 220, done); // 여러 아군이 받아도 길어지지 않게 다음 연출은 0.22초 뒤 시작
    }

    // ---- 이동: 타일당 슬라이드 + 스쿼시(바운스) ----
    move(e, done) {
        const v = this.d.getView(e.unitId);
        if (!v) { done(); return; }
        // 이동 취소(원위치 스냅): 규칙 on 이면 서버 facing(이동 전 방향)으로 시선 복원(setFacing 은 같은 값이어도 어긋난 시선을 다시 맞춘다)
        if (e.snapTo) { v.place(e.snapTo.x, e.snapTo.y); if (v.facing) v.setFacing(v.facing); done(); return; }
        if (!e.quiet) audio.play('move'); // 병렬 묶음은 첫 유닛만 효과음
        const ms = e.msPerTile ?? FX.move.msPerTile; // 병렬 묶음이면 시간 상한에 맞춰 줄어든 값
        const steps = [...e.path];
        let prev = { x: Math.floor(v.c.x / TILE), y: Math.floor(v.c.y / TILE) };
        const start = prev;
        const next = () => {
            const s = steps.shift();
            if (!s) {
                // 규칙 on: 도착 후 시선 = 전체 이동의 우세 축 방향(서버 Engine::doMove 의 facing 계산과 동일). off 는 마지막 걸음 방향 유지
                const fd = v.facing ? axisDir(prev.x - start.x, prev.y - start.y) : null;
                if (fd && v.walkDir) v.look = fd;
                v.c.setScale(1); v.walkStop(); done(); return;
            }
            const wd = axisDir(s.x - prev.x, s.y - prev.y); // 이동 방향 행/반전(걷기 애니메이션)
            prev = { x: s.x, y: s.y };
            if (wd) v.walkStart(wd);
            // 수상: 칸마다 배 탑승/수면 상태를 지형으로 추정해 갱신(최종값은 sync 의 서버 boarded/naval/on_water). 수면 진입·이탈이면 물보라
            const mu = this.d.getUnit?.(e.unitId);
            const code = this.d.getState?.()?.map?.tiles?.[s.y]?.[s.x];
            if (mu && code && v.water) { const p0 = this.tilePos(s.x, s.y); if (v.setWater(waterStateAt(mu, code), mu)) this.splash(p0.x, p0.y); }
            const p = this.tilePos(s.x, s.y);
            tween(this.scene, { targets: v.c, to: { x: p.x, y: p.y }, duration: ms, ease: 'Linear', onComplete: next });
            const q = FX.move.squash * fxScale();
            if (q > 0) {
                tween(this.scene, {
                    targets: v.c, to: { scaleX: 1 + q, scaleY: 1 - q }, final: { scaleX: 1, scaleY: 1 },
                    duration: ms / 2, yoyo: true,
                });
            }
        };
        next();
    }

    // ---- 공격: 예비동작 -> 돌진 -> 타격(팝업/히트스톱/흔들림/HP/격파) -> 복귀 ----
    attack(e, done) {
        const a = this.d.getView(e.attackerId);
        const t = this.d.getView(e.targetId);
        const ch = e.counterHit ?? null; // 병합된 반격
        const counterEv = ch ? { ...ch, type: 'attack', attackerId: e.targetId, targetId: e.attackerId, miss: false, counter: true, counterHit: null } : null;
        if (ch && (!a || !t)) { const end = done; done = () => { if (a && ch) a.setHp(ch.hpAfter, false); end(); }; }
        if (!a || !t) { if (t) { t.setHp(e.hpAfter, false); if (e.kill) { this.kill(t, done); return; } } done(); return; }
        // 표시용 시선: 공격자는 대상 쪽, 피격 유닛은 공격자 쪽을 돌아본다(서버 facing 이 있으면 UnitView 가 무시)
        const adir = axisDir(Math.floor(t.c.x / TILE) - Math.floor(a.c.x / TILE), Math.floor(t.c.y / TILE) - Math.floor(a.c.y / TILE));
        if (adir) { a.setLook(adir); t.setLook({ up: 'down', down: 'up', left: 'right', right: 'left' }[adir]); }
        // 교전 컷신: 공격측(반격이면 반격하는 쪽)이 항상 왼쪽. 연출 끄기/스킵이면 건너뜀, 축약이면 짧게. 끝나면 기존 후속(hit: 팝업/HP/격파)을 이어간다. 미스는 기존 연출.
        if (!e.miss && this.cutsceneOn(e.attackerId, e.targetId, e)) { // 컷신은 연출 '풀' + 설정 켜짐에서만. 축약·컷신 끄기는 월드 공격 모션
            const au = this.d.getUnit(e.attackerId) ?? e.atkUnit; // 최종 상태에서 빠진(격파된) 유닛은 교전 시점 사본으로
            const tu = this.d.getUnit(e.targetId) ?? e.defUnit;
            if (au && tu) {
                // 서버에 병사 수 필드가 아직 없어 HP 비율로 추정(유닛 soldiers 가 오면 그 값 사용). HP 는 이벤트 순서대로 동기화된 view.hp 기준
                // 부대(troop)의 소속 지휘관: 서버에 소속 필드가 없어 같은 진영의 지휘관(kind=commander)으로 본다(현재 서버는 프리셋 지휘관 1명 + 그 부대 구조). 소속 필드가 오면 u.leader_id 우선
                const units = this.d.getState?.()?.units ?? [];
                const leaderOf = (u) => (u.non_hero ? null : u.kind !== 'troop' ? u : units.find((x) => x.id === u.leader_id) ?? units.find((x) => x.side === u.side && x.kind === 'commander') ?? null); // 수레·배(non_hero): 지휘관 이름·초상 없음(장수로 표시하지 않음)
                const spec = (u, v, left) => ({ unit: u, side: left ? 'left' : 'right', hp: v.hp, hpMax: v.maxHp ?? u.max_hp ?? u.maxHp, soldiers: u.kind === 'troop' ? u.soldiers : undefined, stats: this.statsOf(u), portraitHero: leaderOf(u)?.hero ?? null, leader: leaderOf(u), displayName: u.kind === 'troop' && !u.non_hero ? unitClassName(u.troop_type ?? u.type) : unitDisplayName(u, units), shortName: u.kind === 'troop' && !u.non_hero ? unitClassName(u.troop_type ?? u.type) : unitDisplayName(u, units, { short: true }), leaderName: leaderOf(u) ? heroPlainName(leaderOf(u)) : null, water: v.water ?? null }); // water: 맵 뷰의 수상 상태(배 탑승/수병) -> 컷신 배·수면 배경
                const dStats = this.statsOf(tu);
                // 적·NPC·상대(플레이어가 직접 조작하지 않는 유닛)의 공격: 이동 연출(앞 큐 항목) 뒤 커서가 대상 칸을 지정(d.aim, 약 0.28초)한 다음 컷신. 반격 단독 이벤트·플레이어 조작 공격은 기존대로 바로 컷신
                const playerOwned = au.team === 'ally' && !au.npc_ally;
                const play = () => BattleCutscene.play(this.scene, this.d.cut ?? this.d.ui, {
                    onTap: () => { if (settings.get().cutTapSkip !== false) this.skip(); }, // 컷신이 입력을 막으므로(HUD 차단) 탭 스킵은 여기서(설정 '켜짐'이면 탭해도 끝까지)
                    attacker: spec(au, a, true),
                    defender: spec(tu, t, false),
                    counter: !!e.counter,
                    hit: { crit: !!e.crit, affinity: e.affinity ?? null, counterCrit: !!ch?.crit, counterAffinity: ch?.affinity ?? null }, // 컷신 안 한 줄 강조(치명타·상성). 서버 이벤트 기존 필드만
                    flank: e.flank,
                    terrain: dStats?.code ?? 'plain',
                    terrainAtk: this.statsOf(au)?.code ?? 'plain',
                    skill: e.skill ? { name: e.skill.name, powerPct: e.skill.powerPct, template: e.skill.template, defIgnorePct: e.skill.defIgnorePct ?? null } : null, // 액티브 스킬: 컷신 안 배너 + 강화 임팩트(fx/SkillFx)
                    distance: Math.abs(au.x - tu.x) + Math.abs(au.y - tu.y), // >=2 원거리 분할 배경, 1 근접 한 장면
                    micro: e.micro ?? null, // 서버 미시 교전(shadow/on): 있으면 개체 단위 재생(fx/MicroCutscene), 없으면 기존 연출
                    // 교전 병합(battleStore): counterHit 이 있으면 한 컷에서 양쪽 동시 피해(반격 피해·공격측 병력 손실·공격측 사망)
                    result: { mutual: !!ch, dmgToDef: e.dmg, dmgToAtk: ch?.dmg ?? 0, soldiersLostDef: e.soldiersLost, soldiersLostAtk: ch ? ch.soldiersLost : 0, defenderDead: !!e.kill, attackerDead: !!ch?.kill, hpAfterDef: e.hpAfter, hpAfterAtk: ch ? ch.hpAfter : undefined }, // 서버 hp_after 우선(맵 배지 병력과 일치)
                    // 컷 종료 후 월드 후속을 양쪽 순서대로 한 번에(방어측 hit -> 공격측 hit). 반격 컷신·반격 공격 모션은 따로 재생하지 않는다
                    onDone: () => { if (e.skill && skillFxFamily({ family: e.skill.fxFamily, kind: e.skill.kind, template: e.skill.template }) === 'aoe') playSkillFx(this, e.skill, 'impact', a, t); this.hit(e.skill ? { ...e, skill: null } : e, a, t, () => (ch ? this.hit(counterEv, t, a, done) : done())); }, // 스킬 임팩트는 컷신 안에서 이미 재생(월드 중복 방지). AOE 만 컷신 뒤 월드에 범위 시트(이어지는 주변 피해 위치 안내, 비차단)
                });
                if (!e.counter && !playerOwned && this.d.aim) this.d.aim(e.attackerId, e.targetId, play);
                else play();
                return;
            }
        }
        // 컷신을 쓰지 않는 경우(끄기·스킵·컷신 off): 월드 모션으로 공격 -> 반격을 순차 재생
        if (counterEv) { const end = done; done = () => this.attack(counterEv, end); }
        const base = { x: a.c.x, y: a.c.y };
        const dx = t.c.x - a.c.x;
        const dy = t.c.y - a.c.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const LG = FX.lunge;
        const m = this.mul('lunge');
        const windup = LG.windupPx * m;
        const charge = Math.min(TILE * LG.chargeTile, len * LG.chargeTile) * m;
        let pending = 2;
        const join = () => { pending -= 1; if (pending === 0) done(); };

        const impact = () => {
            this.hit(e, a, t, join);
            tween(this.scene, { targets: a.c, to: { x: base.x, y: base.y }, duration: LG.returnMs, onComplete: join });
        };
        if (m <= 0) { impact(); return; }
        // 병종별 월드 공격 모션(근접 돌진·궁수 포물선 화살·마법 차징·비행 급강하 등). 상세는 fx/AttackMotion.js
        void windup; void charge; void base;
        const motion = () => playAttackMotion(this, { type: this.d.getUnit?.(e.attackerId)?.type, a, t, ux, uy, len, m, impact });
        if (e.skill) worldCharge(this, a, motion); // 액티브 스킬: 시전 모으기 후 공격 모션
        else motion();
    }

    // 이 교전을 컷신으로 재생하는지(attack() 의 분기와 같은 조건). 스킬 컷인 생략 판단에도 쓴다
    // e(선택): attack 이벤트(교전 시점 유닛 사본 atkUnit/defUnit) — 최종 상태에서 사라진 유닛도 컷신 대상(적 턴·멀티 상대 행동·격파 교전 포함, 진영 무관)
    cutsceneOn(attackerId, targetId, e = null) {
        return !isInstant() && !!this.d.getUnit && settings.get().cutscene !== false && settings.get().fxLevel === 0
            && !!this.d.getView(attackerId) && !!this.d.getView(targetId) && !!(this.d.getUnit(attackerId) ?? e?.atkUnit) && !!(this.d.getUnit(targetId) ?? e?.defUnit);
    }

    // 컷신 하단 표용 능력치: 병종 기본(UNIT_BASE) + 보정(영웅 성장 + 오라/패시브), 지형 방어 %(FE 표에 없는 지형은 '-'). 참고용(판정은 서버)
    statsOf(u) {
        const st = this.d.getState?.();
        if (!st || !u) return null;
        const base = UNIT_BASE[u.type];
        const code = st.map?.tiles?.[u.y]?.[u.x] ?? 'plain';
        let [aA, aD] = auraBonus(st.units, u, u.x, u.y);
        aA += u.passive?.atk_pct ?? 0;
        aD += u.passive?.def_pct ?? 0;
        // 보정 = 영웅 성장·보너스(유닛 atk/def - 병종 기본) + 패시브. 오라분은 auraAtk/auraDef 로 분리 표기
        const [oA, oD] = auraBonus(st.units, u, u.x, u.y);
        const at = u.atk != null ? Math.round(u.atk * (1 + (aA - oA) / 100)) : null;
        const df = u.def != null ? Math.round(u.def * (1 + (aD - oD) / 100)) : null;
        return {
            code,
            atBase: base?.atk ?? at, atBonus: at != null && base ? at - base.atk : (at != null ? 0 : null),
            dfBase: base?.def ?? df, dfBonus: df != null && base ? df - base.def : (df != null ? 0 : null),
            auraAtk: oA, auraDef: oD,
            terrain: TERRAINS[code]?.name ?? TNAME[code] ?? code,
            terrainPct: TERRAINS[code] ? terrainMod(code, unitType(u.type).move_type).def_pct : null,
        };
    }

    // 부대 붕괴(영웅 사망 시 소속 유닛 전원 제거): 병사들이 사방으로 흩어지며 사라진다. 시간 상한 약 0.9초(배속·스킵·끄기 반영)
    collapse(e, done) {
        const views = (e.unitIds ?? []).map((id) => this.d.getView(id)).filter(Boolean);
        if (!views.length) { done(); return; }
        let left = views.length;
        const fin = (v) => { this.d.removeView(v.id); left -= 1; if (left === 0) done(); };
        views.forEach((v, i) => {
            const ang = Math.random() * Math.PI * 2;
            const r = TILE * (0.5 + Math.random() * 0.4);
            this.shards(v.c.x, v.c.y);
            tween(this.scene, { targets: v.c, to: { x: v.c.x + Math.cos(ang) * r, y: v.c.y + Math.sin(ang) * r, alpha: 0, scaleX: 0.7, scaleY: 0.7 }, duration: 600, delay: Math.min(300, i * 40), ease: 'Quad.easeOut', onComplete: () => fin(v) });
        });
    }

    // 물보라(안아트 ship_overlay.splash 32x32 6프레임 12fps, 1회). 큐를 붙잡지 않는 장식 연출. 시트가 없거나 연출 즉시(스킵·끄기)면 생략
    splash(x, y) {
        const key = 'ship_overlay_splash';
        if (isInstant() || !this.scene.textures.exists(key) || !this.d.worldFx) return;
        const img = this.scene.add.image(x, y + TILE * 0.4, key, 0).setOrigin(0.5, 0.75).setDisplaySize(TILE / 2, TILE / 2);
        this.d.worldFx.add(img);
        let f = 0;
        const ev = this.scene.time.addEvent({ delay: 83, repeat: 5, callback: () => { f += 1; if (f >= 6 || !img.scene) { ev.remove(); img.destroy(); return; } img.setFrame(f); } });
    }

    hit(e, a, t, onDone) {
        if (!e.miss && t?.water?.onWater) this.splash(t.c.x, t.c.y); // 수상 칸 피격 물보라
        const flank = e.flank === 'back' || e.flank === 'side' ? e.flank : null; // 방향 피격(facing off 면 항상 null -> 기존 동작)
        const kind = e.miss ? 'miss' : e.crit ? 'crit' : flank ? flank : e.affinity === 'adv' ? 'adv' : e.affinity === 'dis' ? 'dis' : 'normal';
        audio.play(e.miss ? 'miss' : e.kill ? 'kill' : e.crit ? 'crit' : e.counter ? 'counter' : e.affinity === 'adv' ? 'hit_adv' : e.affinity === 'dis' ? 'hit_dis' : 'hit');
        const pdx = e.counter ? 18 : -6; // 반격 숫자는 오른쪽으로 어긋나게(공격 숫자와 겹침 방지)
        // 병력 = 체력 표기: 피해 숫자 대신 병력 단계 감소(-N). 서버 hp_after 기준(뷰 hp = 직전 서버 값)
        const lost = -troopDelta({ max_hp: t.maxHp }, t.hp, e.hpAfter);
        this.popup(t, kind, e.miss ? 'MISS' : (lost > 0 ? `-${lost}` : '0'), { dx: pdx });
        if (flank && !e.miss) this.popup(t, 'flankLabel', flank === 'back' ? '배후!' : '측면', { dx: pdx, dy: -30 }); // 라벨은 숫자 위
        if (e.elementPct && !e.miss) this.popup(t, 'flankLabel', e.elementPct > 0 ? '약점!' : '내성', { dx: pdx, dy: flank ? -52 : -30 }); // 속성 약점/내성(이벤트 element_pct, 측면 라벨과 같은 스타일)
        t.setHp(e.hpAfter);
        // 패시브 발동(이름을 아는 코드만, store 가 소유 유닛별로 묶어 줌): 아이콘+이름 0.6초
        (e.passives ?? []).forEach((p) => passivePop(this, this.d.getView(p.unitId), p.names));
        if (e.miss) { onDone(); return; }
        if (e.kill && !e.counter && e.affinity === 'adv') this.affinityKillFx(e, t); // 아군 상성 유리 처치 강조(비차단)
        this.spark(t.c.x, t.c.y, e.affinity === 'adv' || e.crit ? 'fx_slash' : 'fx_hit_spark');
        let sheet = false; // 액티브 스킬 이펙트 시트(strike·pierce·aoe, fx/SkillFxSheet): 재생되면 코드 링·스파크만 생략, 없거나 로드 전·실패면 기존 드로잉
        if (e.skill) { try { sheet = playSkillFx(this, e.skill, 'impact', a, t); } catch (err) { console.warn('[fx] skill sheet', err); } }
        const sk = e.skill ? worldImpact(this, t, e.skill.powerPct, { burst: !sheet }) : null; // 액티브 스킬: 대형 충격 링·방사 스파크 + 슬로모션, 추가 히트스톱·흔들림
        const stopKey = e.kill ? 'kill' : e.crit ? 'crit' : 'normal';
        const frames = FX.hitStop[stopKey] * this.mul('hitstop') + (sk?.hitStopFrames ?? 0);
        const shakePx = FX.shake[e.kill ? 'kill' : e.crit ? 'crit' : e.affinity === 'adv' ? 'adv' : 'normal'];
        this.shake(shakePx + (flank === 'back' ? 2 : 0) + (sk?.shakePx ?? 0));
        t.tintWhite(true);
        // 피격 밀림: 공격 반대 방향으로 작게(후면·측면이면 더 크게) 밀렸다 돌아온다
        const sdx = t.c.x - a.c.x; const sdy = t.c.y - a.c.y; const sl = Math.hypot(sdx, sdy) || 1;
        const shove = flank ? 8 : e.crit ? 6 : 4;
        const bx = t.c.x; const by = t.c.y;
        tween(this.scene, { targets: t.c, to: { x: bx + (sdx / sl) * shove, y: by + (sdy / sl) * shove }, final: { x: bx, y: by }, duration: 70, yoyo: true });
        wait(this.scene, Math.max(FX.kill.whiteMs, frames * FX.hitStop.frameMs), () => {
            t.tintWhite(false);
            if (e.kill) this.kill(t, onDone);
            else onDone();
        });
    }

    // 상성 유리 처치 강조: 아군(플레이어 진영) 공격이 상성 유리(affinity adv)로 적을 처치했을 때 금색 링 + '상성 격파!' 라벨 약 0.5초.
    // 큐를 붙잡지 않는다(다음 연출과 겹쳐 흘러감) -> 탭 스킵·턴 스킵과 무관하게 길이가 늘지 않음. 연출 즉시(끄기·스킵)면 생략. 반격 처치는 서버 affinity_kills 와 같게 제외(호출부)
    affinityKillFx(e, t) {
        if (isInstant() || fxScale() === 0 || !this.d.worldFx || !t?.c) return;
        const au = this.d.getUnit?.(e.attackerId) ?? e.atkUnit;
        if (au?.team !== 'ally') return;
        const sc = this.scene; const x = t.c.x; const y = t.c.y;
        this.popup(t, 'flankLabel', '상성 격파!', { dx: -6, dy: e.flank === 'back' || e.flank === 'side' ? -52 : -30 });
        this.useEffect((free) => {
            const g = sc.add.graphics(); this.d.worldFx.add(g);
            const p = { t: 0 };
            const draw = () => { if (!g.scene) return; g.clear(); g.lineStyle(3, 0xffc27a, 1 - p.t).strokeCircle(x, y, TILE * (0.35 + p.t * 0.55)); g.lineStyle(2, 0xffe08a, 0.8 * (1 - p.t)).strokeCircle(x, y, TILE * (0.2 + p.t * 0.35)); };
            draw();
            tween(sc, { targets: p, to: { t: 1 }, duration: 480, ease: 'Quad.easeOut', onUpdate: draw, onComplete: () => { g.destroy(); free(); } });
        });
    }

    // 타격 이펙트 PNG(fx_hit_spark / fx_slash: assets.js)가 있으면 한 장 팝, 없으면 생략
    spark(x, y, key) {
        if (!this.scene.textures.exists(key) || isInstant()) return;
        this.useEffect((free) => {
            const img = this.scene.add.image(x, y, key).setDisplaySize(TILE * 1.4, TILE * 1.4).setAlpha(0.95).setBlendMode(1);
            this.d.worldFx.add(img);
            tween(this.scene, { targets: img, to: { alpha: 0, scale: img.scale * 1.5 }, duration: 220, onComplete: () => { img.destroy(); free(); } });
        });
    }

    // ---- 회복: 녹색 팝업 + HP 증가 ----
    heal(e, done) {
        const v = this.d.getView(e.unitId);
        if (!v) { done(); return; }
        audio.play('heal');
        playHealFx(this, this.d.getView(e.actorId), v);
        this.popup(v, 'heal', `+${Math.max(0, troopDelta({ max_hp: v.maxHp }, v.hp, e.hpAfter))}`); // 병력 단계 회복(+N)
        v.setHp(e.hpAfter);
        if (this.scene.textures.exists('fx_heal_glow') && !isInstant()) {
            const img = this.scene.add.image(v.c.x, v.c.y, 'fx_heal_glow').setDisplaySize(TILE * 1.3, TILE * 1.3).setAlpha(0.9);
            this.d.worldFx.add(img);
            tween(this.scene, { targets: img, to: { alpha: 0, y: v.c.y - 16 }, duration: FX.heal.ms, onComplete: () => img.destroy() });
        } else if (!isInstant()) { // 글로우 텍스처가 없을 때 코드 폴백: 초록 원광(가산 혼합) 확대·소멸(소모품 회복약 포함, 하플레이 2026-11-04)
            const gl = this.scene.add.circle(v.c.x, v.c.y, TILE * 0.5, 0x5ee07a, 0.55).setBlendMode('ADD');
            this.d.worldFx.add(gl);
            tween(this.scene, { targets: gl, to: { alpha: 0, scale: 1.5 }, duration: FX.heal.ms, onComplete: () => gl.destroy() });
        }
        wait(this.scene, FX.heal.ms * 0.6, done);
    }

    // ---- 격파: 흰 틴트 1f -> 디졸브 + 파편 ----
    kill(view, onDone) {
        const id = view.id;
        const finish = () => { this.d.removeView(id); onDone(); };
        if (isHeroUnit(view.unit)) voiceHeroFall(this.scene, view.unit); // 영웅/지휘관 쓰러짐 외침(쿨다운 4초·BGM 잠깐 덕킹, 부대 격파는 기존 kill 효과음만)
        view.tintWhite(true);
        wait(this.scene, FX.kill.whiteMs, () => {
            this.shards(view.c.x, view.c.y);
            tween(this.scene, {
                targets: view.c, to: { alpha: 0, scaleX: 0.8, scaleY: 0.8 }, duration: FX.kill.dissolveMs, onComplete: finish,
            });
        });
    }

    // ---- 파티클(풀) ----
    shards(x, y) {
        const n = Math.round(FX.kill.shards * this.mul('shards'));
        for (let i = 0; i < n; i++) {
            if (this.particles >= FX.limits.particles) return;
            const s = this.acquireShard();
            this.particles += 1;
            const ang = Math.random() * Math.PI * 2;
            const r = FX.kill.shardSpread * (0.5 + Math.random() * 0.5);
            s.setPosition(x, y).setAlpha(1).setScale(1).setVisible(true).setActive(true);
            const release = () => { if (!s.active) return; s.setVisible(false).setActive(false); this.particles -= 1; };
            tween(this.scene, {
                targets: s, to: { x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r, alpha: 0, scale: 0.3 },
                duration: FX.kill.dissolveMs, ease: 'Quad.easeOut', onComplete: release,
            });
        }
    }

    acquireShard() {
        let s = this.shardPool.find((o) => !o.active);
        if (!s) {
            s = this.scene.textures.exists(FX_TEXTURES.shard)
                ? this.scene.add.image(0, 0, FX_TEXTURES.shard)
                : this.scene.add.rectangle(0, 0, FX.kill.shardSize, FX.kill.shardSize, COLOR.text);
            this.d.worldFx.add(s);
            this.shardPool.push(s);
        }
        return s;
    }

    // ---- 데미지 팝업(풀): 같은 타일 100ms 간격 스폰, 14px씩 쌓기 ----
    popup(view, kind, str, o = {}) { // o.dx/o.dy: 같은 타일 겹침 방지용 오프셋
        const cfg = FX.popup[kind];
        const tx = Math.floor(view.c.x / TILE);
        const ty = Math.floor(view.c.y / TILE);
        const key = `${tx},${ty}`;
        const st = this.tileState.get(key) ?? { last: 0, active: 0 };
        const now = this.scene.time.now;
        const at = Math.max(now, st.last + FX.popup.sameTileGapMs);
        st.last = at;
        this.tileState.set(key, st);
        const offset = st.active * FX.popup.stackPx;
        st.active += 1;
        const vx = view.c.x;
        const vy = view.c.y;
        const spawn = () => {
            const p = this.acquirePopup();
            p.setText(`${cfg.prefix}${str}`.trim());
            p.setStyle(textStyle(cfg.size, cfg.color, { fontStyle: 'bold', resolution: 4, stroke: cfg.strokeColor ?? '#0B1020', strokeThickness: cfg.strokeWidth ?? 5 }));
            p.setFontSize(cfg.size); // 팝업 크기는 글자 크기 설정과 무관하게 고정 수치
            const x0 = vx + (o.dx ?? 0);
            const y0 = vy - 30 - offset + (o.dy ?? 0);
            p.setPosition(x0, y0).setAlpha(1).setScale(1).setVisible(true).setActive(true);
            const end = () => {
                if (!p.active) return;
                p.setVisible(false).setActive(false);
                st.active = Math.max(0, st.active - 1);
            };
            // 연출이 꺼져 있어도 숫자는 정보이므로 제자리에서 보여주고 타이머로 제거
            this.scene.time.delayedCall(FX.popup.ms / settings.get().speed + 100, end);
            if (isInstant()) return;
            const rise = FX.popup.rise * Math.max(fxScale(), 0.5);
            tween(this.scene, { targets: p, to: { y: y0 - rise }, duration: FX.popup.ms, ease: 'Quad.easeOut' });
            tween(this.scene, { targets: p, to: { alpha: 0 }, duration: FX.popup.ms * 0.5, delay: FX.popup.ms * 0.5 / settings.get().speed, onComplete: end });
            if (cfg.scale) {
                p.setScale(cfg.scale[0]);
                tween(this.scene, {
                    targets: p, to: { scale: cfg.scale[1] }, final: { scale: 1 }, duration: 120,
                    onComplete: () => tween(this.scene, { targets: p, to: { scale: cfg.scale[2] }, duration: 120 }),
                });
            }
            if (cfg.shakeX) tween(this.scene, { targets: p, to: { x: x0 + cfg.shakeX }, final: { x: x0 }, duration: 50, yoyo: true, repeat: 2 });
        };
        if (at - now > 0) this.scene.time.delayedCall(at - now, spawn);
        else spawn();
    }

    acquirePopup() {
        let p = this.popupPool.find((o) => !o.active);
        if (!p) {
            p = this.scene.add.text(0, 0, '', textStyle(24, CSS.text)).setOrigin(0.5);
            this.d.worldFx.add(p);
            this.popupPool.push(p);
        }
        return p;
    }

    // ---- 화면 흔들림: 월드만(UI 제외), 상한 12px ----
    // o.ms: 지속 시간 지정(cue shake, 반복 감쇠 없이 강도 배율만). 생략 시 기존 동작
    shake(px, o = {}) {
        const amp = Math.min(FX.shake.max, px * (o.ms ? fxScale() : this.mul('shake')));
        if (amp <= 0 || isInstant() || this.shaking) return;
        const w = this.d.world;
        const base = { x: w.x, y: w.y };
        const proxy = { t: 1 };
        const ms = o.ms ? Math.min(2000, Math.max(100, o.ms)) : Math.min(FX.shake.msMax, FX.shake.msMin + amp * 15);
        this.shaking = true;
        this.useEffect((free) => {
            tween(this.scene, {
                targets: proxy, to: { t: 0 }, duration: ms, ease: 'Linear',
                onUpdate: () => w.setPosition(base.x + (Math.random() * 2 - 1) * amp * proxy.t, base.y + (Math.random() * 2 - 1) * amp * proxy.t),
                onComplete: () => { w.setPosition(base.x, base.y); this.shaking = false; free(); },
            });
        });
        if (this.effects >= FX.limits.effects) this.shaking = false;
    }

    // ---- 턴 배너: 일본 SRPG 풍 리본. 'TURN n' 크게 + 'PLAYER PHASE / ENEMY PHASE'. 2턴째부터 짧게. 전체 화면 플래시 없음 ----
    banner(e, done) {
        const ally = e.side === 'ally';
        const ending = e.type === 'turnEnd';
        audio.play(ally ? 'turn' : 'turn_enemy');
        if (fxScale() === 0 || isInstant()) { done(); return; }
        const total = ending ? FX.banner.endMs : e.turn >= 2 ? FX.banner.msLater : FX.banner.ms;
        const ms = total * (fxScale() >= 1 ? 1 : 0.6);
        const H = FX.banner.ribbonH;
        const c = this.scene.add.container(0, (L.lh - H) / 2);
        const color = ally ? COLOR.ally : COLOR.danger;
        const g = this.scene.add.graphics();
        // 리본 본체(양끝 제비꼬리) + 금색 테두리 선
        g.fillStyle(COLOR.ink, 0.92).fillRect(0, 0, L.lw, H);
        g.fillStyle(color, 0.25).fillRect(0, 10, L.lw, H - 20);
        g.fillStyle(COLOR.accent, 1).fillRect(0, 8, L.lw, 3).fillRect(0, H - 11, L.lw, 3);
        g.fillStyle(color, 1).fillRect(0, 0, L.lw, 8).fillRect(0, H - 8, L.lw, 8);
        const big = this.scene.add.text(L.lw / 2, H / 2 - 16, ending ? (ally ? '아군 턴 종료' : '적군 턴 종료') : `TURN ${e.turn}`, textStyle(66, '#f0d58c', { fontStyle: 'bold', stroke: '#0B1020', strokeThickness: 8 })).setOrigin(0.5);
        const sub = this.scene.add.text(L.lw / 2, H / 2 + 40, ending ? '' : (ally ? 'PLAYER PHASE  —  아군 턴' : `ENEMY PHASE  —  ${e.label ?? '적군'} 턴`), textStyle(26, ally ? CSS.allyText : CSS.dangerText, { fontStyle: 'bold', stroke: '#0B1020', strokeThickness: 5, letterSpacing: 4 })).setOrigin(0.5);
        const mark = this.scene.add.rectangle(L.lw / 2 - big.width / 2 - 40, H / 2 - 16, 20, 20, color).setAngle(ally ? 0 : 45).setStrokeStyle(2, COLOR.text);
        const mark2 = this.scene.add.rectangle(L.lw / 2 + big.width / 2 + 40, H / 2 - 16, 20, 20, color).setAngle(ally ? 0 : 45).setStrokeStyle(2, COLOR.text);
        c.add([g, big, sub, mark, mark2]);
        c.x = -L.lw;
        this.d.ui.add(c);
        const finish = () => { c.destroy(); done(); };
        big.setScale(1.3);
        tween(this.scene, { targets: big, to: { scale: 1 }, duration: ms * 0.3, ease: 'Back.easeOut' });
        tween(this.scene, {
            targets: c, to: { x: 0 }, duration: ms * 0.3, ease: 'Cubic.easeOut',
            onComplete: () => wait(this.scene, ms * 0.4, () => tween(this.scene, {
                targets: c, to: { x: L.lw }, duration: ms * 0.3, ease: 'Cubic.easeIn', onComplete: finish,
            })),
        });
    }

    // 컷인 초상 주인: 영웅·지휘관 = 본인, 부대 = 소속 지휘관(attack 컷신의 leaderOf 와 같은 규칙), 수레·배(non_hero) = 없음(병종 엠블럼)
    cutinOwner(u) {
        if (!u || u.non_hero) return null;
        if (u.kind !== 'troop') return u;
        const units = this.d.getState?.()?.units ?? [];
        return units.find((x) => x.id === u.leader_id) ?? units.find((x) => x.side === u.side && x.kind === 'commander') ?? null;
    }

    // ---- 스킬 컷인(fx/SkillCutin): 영웅 초상 대각선 진입 + 사선 띠·스피드 라인·글로우·비네트 + 글자별 스킬 이름 ----
    // 서버 skill_use(store 'skillUse')·구 계약 'cutin' 에서 호출. e: {unitId, skill(표시 이름)}
    // 길이: 첫 컷인 1.1초 / 직전 컷인 직후(같은 턴 연속) 0.82초 / 같은 유닛 이번 턴 반복 0.65초, 축약 x0.75. 큐로 순차 재생, 탭 스킵(snapAll)
    // 간소화(초상 페이드 + 문구 0.7초): 그래픽 품질 '낮음' 또는 성능 보호 자동 하향 중([perf]). 연출 끄기 = 비차단 간소 표시(큐는 바로 진행). 턴 건너뛰기 중 = 생략
    cutin(e, done) {
        const u = this.d.getUnit?.(e.unitId);
        if (!u || fx.skipTurn) { done(); return; }
        const units = this.d.getState?.()?.units ?? [];
        const owner = this.cutinOwner(u);
        const base = { parent: this.d.cut ?? this.d.ui, W: L.lw, H: L.lh, ally: u.team !== 'enemy', type: u.type, name: e.skill ?? '필살기', who: owner ? heroPlainName(owner) : unitDisplayName(u, units), owner };
        if (isInstant()) {
            if (this.liteCut?.scene) this.liteCut.destroy();
            try { this.liteCut = playSkillCutin(this.scene, { ...base, ms: CUTIN.liteMs, raw: true }, () => {}); } catch (err) { console.warn('[fx] cutin', err); }
            done();
            return;
        }
        audio.play('cutin');
        const n = this.counts.get(`cutin:${e.unitId}`) ?? 0;
        this.counts.set(`cutin:${e.unitId}`, n + 1);
        const now = this.scene.time?.now ?? 0;
        const chained = this.lastCutinEnd != null && now - this.lastCutinEnd < CUTIN.chainGapMs;
        const st = settings.get();
        const lite = st.quality >= 2 || st.quality > (settings.userQuality?.() ?? st.quality);
        const ms = lite ? CUTIN.liteMs : cutinMs({ repeat: n > 0, chained, reduced: fxScale() < 1 });
        const end = () => { this.lastCutinEnd = this.scene.time?.now ?? 0; done(); };
        try { playSkillCutin(this.scene, { ...base, ms, lite, onTap: () => this.skip() }, end); } catch (err) { console.error('[fx] cutin', err); end(); }
    }
}
