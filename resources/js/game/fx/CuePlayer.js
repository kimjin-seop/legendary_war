import { TILE } from '../UnitView.js';
import { tween, wait, isInstant, fxScale } from '../ui/motion.js';
import { settings } from '../settings.js';
import { audio } from '../audio.js';
import { BattleDialogue } from '../ui/BattleDialogue.js';
import { CueActors } from './CueActors.js';

// 전투 연출 cue 재생기(docs/CUTSCENE_SPEC.md). 판정 없음: 화면(카메라·대사·효과음·흔들림·불 오버레이)만 바꾼다.
// store 'cue' 이벤트 -> handle(cue): Fx 큐(scene.fx)에 순서대로 넣는다. 불은 store.state.cueFires(서버 view.cues.fires 우선)와 sync 마다 맞춘다.
// 모르는 do 는 무시(전방 호환). 방 모드는 store 가 cue 를 내보내지 않는다.
const FIRE_TEX = 'fx_fire_burst'; // manifest fx.fire_burst (기존 이펙트)
const FIRE_CAP_FULL = 40; // 서버 상한과 같음
const FIRE_CAP_LOW = 12; // 품질 '낮음'·연출 축약/끄기: 칸 수 상한 + 정지 이미지

const clampN = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export class CuePlayer {
    constructor(scene) {
        this.scene = scene;
        this.fires = new Map(); // cue_id -> { objs[], tweens[] }
        this.layer = null;
        this.saved = null; // camera restore 지점 {k, x, y}
        this.missingSfx = new Set();
        this.actors = new CueActors(scene); // 연출 액터(판정 제외, 14절)
        this.groupBuf = null; // parallel: 같은 group 정수의 연속 이벤트를 모아 동시 재생
        this.duringSays = new Map(); // walk_id -> [say cue](이동 중 말풍선, 아직 시작 안 한 walk)
        this.activeWalks = new Map(); // walk_id -> mover(진행 중)
        scene.events.once('shutdown', () => this.destroy());
    }

    get fx() { return this.scene.fx; }

    // ---- parallel(group): 같은 group 의 연속 cue 를 한 연출 단계로 묶어 동시에 재생, 모두 끝나면 다음. 모달 say 는 그룹이 끝난 뒤 ----
    // Battle 은 cue·보행 move 가 아닌 이벤트를 처리하기 전에 flushGroup() 을 불러 순서를 지킨다. 같은 동기 루프 끝(microtask)에도 비운다
    put(c, fn) {
        const g = Number.isInteger(c?.group) ? c.group : null;
        if (g == null) { this.flushGroup(); this.fx.enqueue(fn); return; }
        if (this.groupBuf && this.groupBuf.id !== g) this.flushGroup();
        if (!this.groupBuf) { this.groupBuf = { id: g, fns: [], after: [] }; queueMicrotask(() => this.flushGroup()); }
        this.groupBuf.fns.push(fn);
    }

    flushGroup() {
        const g = this.groupBuf;
        if (!g) return;
        this.groupBuf = null;
        if (g.fns.length) {
            this.fx.enqueue((done) => {
                let left = g.fns.length;
                const one = () => { left -= 1; if (left === 0) done(); };
                g.fns.forEach((fn) => { let called = false; const cb = () => { if (!called) { called = true; one(); } }; try { fn(cb); } catch (e) { console.error('[cue] parallel', e); cb(); } });
            });
        }
        g.after.forEach((c) => this.say({ ...c, group: null }));
    }

    handle(c) {
        if (!c || typeof c !== 'object') return;
        // 14절 연출 액터·보행(모르는 do 는 아래 분기에 안 걸려 무시)
        if (c.do === 'spawn_actor') { this.put(c, (done) => this.actors.spawn(c, done)); return; }
        if (c.do === 'despawn_actor') { this.put(c, (done) => this.actors.despawn(c, done)); return; }
        if (c.do === 'face') { this.put(c, (done) => { this.actors.face(c); done(); }); return; }
        if (c.do === 'wait') { this.put(c, (done) => { if (isInstant()) done(); else wait(this.scene, clampN(c.ms, 100, 5000, 500), done); }); return; }
        if (c.do === 'walk') {
            if (c.path_ok === false || !c.actor) return; // 실제 유닛 walk 는 store 의 move(walk:true) 이벤트로 온다(walkUnit). path_ok:false = 이동 생략·제자리 유지
            this.queueWalk(c, { kind: 'actor', id: c.actor, path: c.path, to: c.to, speed: c.speed, wait: c.wait !== false, walkId: c.walk_id ?? null });
            return;
        }
        if (c.do === 'say') {
            if (c.during) { this.sayDuring(c); return; } // 이동 중 말풍선(큐 정지 없음)
            if (Number.isInteger(c.group)) { if (this.groupBuf?.id !== c.group) this.flushGroup(); if (!this.groupBuf) { this.groupBuf = { id: c.group, fns: [], after: [] }; queueMicrotask(() => this.flushGroup()); } this.groupBuf.after.push(c); return; } // 그룹 안 모달 say = 그룹 끝난 뒤
            this.flushGroup();
        } else this.flushGroup();
        if (c.do === 'say') this.say(c);
        else if (c.do === 'camera') { this.camAt = performance.now(); this.fx.enqueue((done) => this.camera(c, done)); } // 같은 cue 묶음(직후 say)이면 대사 카메라보다 우선(camHold)
        else if (c.do === 'sfx') this.fx.enqueue((done) => { this.sfx(c.key); done(); });
        else if (c.do === 'shake') this.fx.enqueue((done) => this.shake(c, done));
        else if (c.do === 'fire') this.fx.enqueue((done) => { this.addFire(c.cue_id, c.tiles); done(); });
        else if (c.do === 'fire_end') this.fx.enqueue((done) => { this.removeFire(c.cue_id); done(); });
        else if (c.do === 'terrain_change' && Array.isArray(c.changed) && c.changed.length) {
            if (c.fx === 'water_rise') this.fx.enqueue((done) => this.waterRise(c, done)); // 물 차오름(12절): dir 순서로 ms 에 걸쳐 칸별 수위 상승 후 타일 교체
            else this.fx.enqueue((done) => { this.scene.applyTilePatch?.(c.changed, { flash: true }); done(); }); // 칸 재렌더 + 번쩍임(skipped 칸 무시). 모르는 fx 도 여기
        }
    }

    // ---- terrain_change fx:"water_rise": changed 칸을 dir(up|down|left|right, 없으면 changed 순서) 단계로 나눠 ms 동안 차례로
    // 수면 오버레이(칸 아래에서 위로 차오름) -> 새 지형 타일 교체 -> 오버레이 페이드 + 물결 고리. 판정 없음(store 가 이미 지도 갱신). 스킵/연출 끄기 = 즉시 교체
    waterRise(c, done) {
        const sc = this.scene;
        const m = sc.store.state.map;
        const list = c.changed.filter((t) => t && Number.isInteger(t.x) && Number.isInteger(t.y) && t.x >= 0 && t.y >= 0 && t.x < m.w && t.y < m.h);
        if (!sc.worldBuilt || !list.length) { done(); return; }
        if (isInstant()) { sc.applyTilePatch?.(list); done(); return; }
        const ms = clampN(c.ms, 200, 3000, 1200);
        const xs = list.map((t) => t.x); const ys = list.map((t) => t.y);
        const rankOf = { up: (t) => Math.max(...ys) - t.y, down: (t) => t.y - Math.min(...ys), left: (t) => Math.max(...xs) - t.x, right: (t) => t.x - Math.min(...xs) }[c.dir] ?? ((t, i) => i);
        const ranks = list.map((t, i) => rankOf(t, i));
        const order = [...new Set(ranks)].sort((a, b) => a - b); // 같은 줄(행/열)은 동시에
        const steps = order.length;
        const riseMs = steps === 1 ? ms : clampN((ms / steps) * 1.5, 180, 600, 300);
        const stepMs = steps > 1 ? Math.max(0, (ms - riseMs) / (steps - 1)) : 0;
        const layer = this.ensureLayer();
        const low = this.low();
        const col = c.to === 'sea' ? 0x1f5a9e : c.to === 'shallows' ? 0x5fa8d8 : 0x3a7fc4;
        let left = list.length;
        const fin = () => { left -= 1; if (left === 0) done(); };
        list.forEach((t, i) => {
            const delay = order.indexOf(ranks[i]) * stepMs;
            const r = sc.add.rectangle(t.x * TILE, (t.y + 1) * TILE, TILE, TILE, col, 0.6).setOrigin(0, 1).setScale(1, 0.04);
            layer.add(r);
            tween(sc, { targets: r, to: { scaleY: 1 }, duration: riseMs, delay, ease: 'Sine.easeOut', onComplete: () => {
                if (!r.scene) { fin(); return; }
                sc.applyTilePatch?.([t]);
                if (!low) {
                    const ring = sc.add.ellipse(t.x * TILE + TILE / 2, t.y * TILE + TILE / 2, TILE * 0.8, TILE * 0.45).setFillStyle(0xffffff, 0).setStrokeStyle(2, 0xdff1ff, 0.8).setScale(0.3);
                    layer.add(ring);
                    tween(sc, { targets: ring, to: { scaleX: 1.15, scaleY: 1.15, alpha: 0 }, duration: 420, onComplete: () => ring.destroy() });
                }
                tween(sc, { targets: r, to: { alpha: 0 }, duration: 260, onComplete: () => { r.destroy(); fin(); } });
            } });
        });
    }

    // ---- say: 연속 say 는 아직 시작 안 한 같은 대사창에 줄을 이어 붙인다(창 깜빡임 방지) ----
    say(c) {
        if (typeof c.text !== 'string' || !c.text.trim()) return;
        const line = { speaker: !c.speaker || c.speaker === 'narrator' ? 'caption' : c.speaker, expr: c.expr ?? null, text: c.text };
        // 14절 say 확장: actor(화자 액터) / speaker 'actor:<id>' -> 재생 시점에 액터 스프라이트 코드로 화자 해석(resolveActorLine). focus:false = 대사 카메라 이동 안 함(생략 = true)
        const aid = c.actor ?? /^actor:(.+)$/.exec(String(c.speaker ?? ''))?.[1] ?? null;
        if (aid) line.actor = String(aid);
        if (c.focus === false) line.focus = false;
        const q = this.fx.q;
        if (this.pendingSay && q[q.length - 1] === this.pendingSay.fn) { this.pendingSay.lines.push(line); return; }
        const batch = { lines: [line], fn: null, hold: performance.now() - (this.camAt ?? -1e9) < 100 }; // 같은 cue 묶음에서 camera 큐 직후 say = 데이터 카메라 우선
        batch.fn = (done) => {
            if (this.pendingSay === batch) this.pendingSay = null;
            const sc = this.scene;
            if (!sc.scene.isActive()) { done(); return; }
            sc.drag = null; sc.pinch = null; sc.fieldPointers?.clear(); sc.clearPopups?.();
            this.sayHold = batch.hold;
            batch.lines.forEach((ln) => this.resolveActorLine(ln));
            sc.storyDialogue = new BattleDialogue(sc, { event_id: 'cue', dialogue: batch.lines }, () => {
                sc.storyDialogue = null;
                this.sayHold = false;
                // 대사 카메라 상태 해제(원위치 복귀 없음). 예전에는 이 경로가 dlgCamEnd 를 부르지 않아 dlgCam 이 남아
                //  이후 followTile·focus 가 계속 막히고, 다음 대사 종료·리사이즈 때 오래된 위치/배율로 튀었다(2026-11-08 '맵이 멋대로 움직임')
                const fin = () => { done(); sc.popupKey = ''; sc.syncPopups?.(); };
                if (sc.dlgCamEnd) sc.dlgCamEnd(fin); else fin();
            });
        };
        this.pendingSay = batch;
        this.fx.enqueue(batch.fn);
    }

    // 지금 재생 중인 cue 대사 묶음이 데이터 camera 큐와 같은 묶음인지(Battle.dialogueFocus 가 대사 카메라 이동을 생략)
    camHold() { return !!this.sayHold; }

    // 액터 화자 줄: 스프라이트가 영웅이면 hero:<code>, NPC 면 npc:<code>(초상·이름), 아니면 이름만(초상 없음). 이름은 액터 name 우선
    resolveActorLine(ln) {
        if (!ln?.actor) return;
        const a = this.actors.get(ln.actor) ?? this.actorRec(ln.actor);
        const sp = a?.sprite ?? {};
        ln.speaker = sp.hero ? `hero:${sp.hero}` : sp.npc_ref ? `npc:${sp.npc_ref}` : `npc:actor_${ln.actor}`;
        if (a?.name && !ln.name) ln.name = a.name;
    }

    actorRec(id) { return (this.scene.store?.state?.cueActors ?? []).find((x) => String(x?.id) === String(id)) ?? null; }

    // Battle.dialogueFocus 용: 화자 액터의 화면 컨테이너(살아 있을 때만)
    actorC(id) { return this.actors.get(id)?.c ?? null; }

    // ---- 보행 ----
    queueWalk(c, spec) {
        this.put(c, (done) => {
            if (!spec.wait) { this.runWalk(spec, () => {}); done(); return; } // wait:false = 걷기 시작만 하고 다음 연출 진행
            this.runWalk(spec, done);
        });
    }

    // 실제 유닛 보행: store 가 move 이벤트(walk:true, path, from, speed, wait, walk_id, group)를 그대로 넘긴다(Battle.onStoreEvent -> 여기)
    walkUnit(e) {
        const w = e.walk ?? {};
        this.queueWalk({ group: w.group }, { kind: 'unit', unitId: e.unitId, from: e.from ?? null, path: e.path, speed: w.speed, wait: w.wait !== false, walkId: w.walkId ?? null });
    }

    runWalk(spec, done) {
        const sc = this.scene;
        let mover = null; let v = null;
        if (spec.kind === 'actor') { const a = this.actors.get(spec.id); if (!a) { done(); return; } mover = this.actors.actorMover(a); }
        else {
            v = sc.views?.get(spec.unitId); const u = sc.store?.get?.(spec.unitId);
            if (!v || !u) { done(); return; }
            if (spec.from) v.place(spec.from.x, spec.from.y); // 시작 연출: 뷰는 이미 서버 최종 칸 -> 출발 칸에서 걷기
            mover = this.actors.unitMover(v, u);
        }
        let path = spec.path;
        if ((!Array.isArray(path) || !path.length) && spec.to) { // to 만: 전투 이동과 같은 4방향 경로 탐색(막히면 직선 1칸씩 시도)
            const to = Array.isArray(spec.to) ? { x: spec.to[0], y: spec.to[1] } : spec.to;
            const cur = { x: Math.floor(mover.c.x / TILE), y: Math.floor(mover.c.y / TILE) };
            path = this.actors.reroute(mover, cur, to, new Set([`${to.x},${to.y}`])) ?? [to];
        }
        const wid = spec.walkId;
        if (wid) this.activeWalks.set(wid, mover);
        const bub = wid ? this.startBubble(wid, mover) : null;
        this.actors.walkPath(mover, path, { speed: spec.speed, label: spec.kind === 'actor' ? `actor:${spec.id}` : `unit:${spec.unitId}` }, () => {
            if (wid) this.activeWalks.delete(wid);
            bub?.end();
            if (v?.c?.scene) { const cx = Math.floor(v.c.x / TILE); const cy = Math.floor(v.c.y / TILE); v.place(cx, cy); } // 멈춘 칸 정렬(최종 좌표는 sync 가 서버 값으로)
            done();
        });
    }

    // say during:<walk_id> -> 그 walk 가 재생되는 동안 이동하는 쪽 머리 위 말풍선(모달 아님). 이미 걷는 중이면 바로, 아니면 walk 시작 때
    sayDuring(c) {
        if (typeof c.text !== 'string' || !c.text.trim()) return;
        const id = String(c.during);
        const mv = this.activeWalks.get(id);
        if (mv) { this.bubbleOn(mv, [c]); return; }
        const list = this.duringSays.get(id) ?? [];
        list.push(c); this.duringSays.set(id, list);
    }

    startBubble(wid, mover) {
        const list = this.duringSays.get(String(wid));
        if (!list?.length) return null;
        this.duringSays.delete(String(wid));
        return this.bubbleOn(mover, list);
    }

    bubbleOn(mover, list) {
        const sc = this.scene;
        if (!mover.c?.scene) return null;
        const text = list.map((c) => c.text.trim()).join('\n');
        const t = sc.add.text(0, 0, text, { fontFamily: 'sans-serif', fontSize: '13px', color: '#1a1406', wordWrap: { width: 170 }, align: 'center' }).setOrigin(0.5, 1);
        const w = t.width + 16; const h = t.height + 10;
        const g = sc.add.graphics();
        g.fillStyle(0xfff6dc, 0.96).fillRoundedRect(-w / 2, -h, w, h, 8).lineStyle(1.5, 0x5a4a2a, 0.9).strokeRoundedRect(-w / 2, -h, w, h, 8);
        g.fillStyle(0xfff6dc, 0.96).fillTriangle(-6, 0, 6, 0, 0, 7);
        const b = sc.add.container(0, -TILE * 0.62, [g, t.setPosition(0, -5)]);
        mover.c.add(b);
        const focus = list.some((c) => c.focus !== false);
        if (focus && !this.follow) this.follow = { c: mover.c }; // 이동하는 화자 카메라 추적(tickFollow)
        return { end: () => { b.destroy(); if (this.follow?.c === mover.c) this.follow = null; } };
    }

    sfx(key) {
        if (!key) return;
        if (!audio.has(key) && !this.missingSfx.has(key)) { this.missingSfx.add(key); console.info(`[cue] 효과음 슬롯 없음(무음): ${key}`); }
        audio.play(key);
    }

    shake(c, done) {
        const ms = clampN(c.ms, 100, 2000, 400);
        const power = clampN(c.power, 1, 10, 3);
        if (isInstant()) { done(); return; }
        this.fx.shake(power * 1.2, { ms });
        wait(this.scene, ms + 30, done); // 흔들림이 끝난 뒤 다음 연출(카메라 이동과 겹치면 흔들림 복귀가 위치를 덮어씀)
    }

    // ---- camera: focus(이동) / overview(전체 보기 배율) / restore(첫 카메라 cue 직전 상태로) ----
    camera(c, done) {
        const sc = this.scene;
        if (!sc.worldBuilt) { done(); return; }
        const w = sc.world;
        const ms = clampN(c.ms, 0, 3000, 500);
        const mode = c.mode ?? 'focus';
        this.follow = null; // 다음 camera cue 는 항상 추적을 끝낸다
        const fin = () => { sc.clampWorld?.(); sc.popupKey = ''; sc.updatePopups?.(); done(); };
        const centerPos = (tx, ty) => { const a = sc.lay.fit; const s = w.scaleX; return sc.clampPos(a.x + a.w / 2 - (tx + 0.5) * TILE * s, a.y + a.h / 2 - (ty + 0.5) * TILE * s); };
        if (mode === 'restore') {
            const sv = this.saved;
            this.saved = null;
            if (!sv) { done(); return; }
            this.zoomPan(sv.k, () => sc.clampPos(sv.x, sv.y), ms, fin);
            return;
        }
        if (!this.saved) this.saved = { k: sc.k, x: w.x, y: w.y };
        if (mode === 'overview') {
            const m = sc.store.state.map;
            this.zoomPan(sc.kAll ?? sc.k, () => centerPos((m.w - 1) / 2, (m.h - 1) / 2), ms, fin);
            return;
        }
        // 유닛 기준 focus(unit_id = 서버 해석 id 우선, unit = 'b5'/'hero:<code>'): 재생 시점의 유닛 화면 위치. 유닛이 없으면 tile 로 폴백
        const v = this.unitView(c.unit_id ?? c.unit ?? (c.actor ? `actor:${c.actor}` : null));
        const vt = v ? [Math.floor(v.c.x / TILE), Math.floor(v.c.y / TILE)] : null;
        const tile = vt ?? (Array.isArray(c.tile) ? c.tile : null);
        if (!tile) { done(); return; }
        const [tx, ty] = tile;
        // follow:true + 유닛: 도착 후 그 유닛을 매 프레임 따라간다(tickFollow). 다음 camera cue·드래그·연출 큐 종료·유닛 소멸 시 해제
        this.zoomPan(sc.k, () => centerPos(tx, ty), ms, () => { if (c.follow && v) this.follow = v.id != null ? { id: v.id } : { c: v.c }; fin(); });
    }

    // 안전망(fe44): 연출 큐가 비었는데 camera focus/overview 뒤 restore 가 없으면(예: ch101_s1 battle_start focus 후 restore 는 5턴) 플레이어 시점으로 되돌린다.
    // 저장 시점 = 첫 focus 직전(전투 시작이면 아군 지휘관 중심). restore 가 있는 저작은 saved 가 이미 비어 있어 아무 일도 하지 않는다
    autoRestore() {
        if (!this.saved || this.fx.playing) return;
        this.fx.enqueue((done) => this.camera({ mode: 'restore', ms: 400 }, done));
    }

    // 유닛 참조 -> UnitView. 유닛 id 그대로 또는 'hero:<code>'(u.hero / u.npc_ref, 생존 유닛만)
    unitView(ref) {
        if (ref == null || ref === '') return null;
        const sc = this.scene;
        const r = String(ref);
        if (r.startsWith('actor:')) { const a = this.actors.get(r.slice(6)); return a ? { id: null, c: a.c } : null; } // 연출 액터(14절)
        if (!r.startsWith('hero:')) return sc.views?.get(r) ?? null;
        const code = r.slice(5);
        const u = (sc.store.state.units ?? []).find((x) => (x.hero === code || x.npc_ref === code) && (x.hp ?? 1) > 0);
        return u ? sc.views?.get(u.id) ?? null : null;
    }

    // Battle.update 에서 매 프레임 호출: follow 중이면 대상 유닛(이동 tween 중인 실제 화면 위치)을 화면 중앙으로 부드럽게 맞춘다
    tickFollow() {
        const f = this.follow;
        if (!f) return;
        const sc = this.scene;
        const c = f.c ?? sc.views?.get(f.id)?.c; // f.c = 이동 중 말풍선 화자(액터·유닛 컨테이너)
        if (!c?.scene || sc.drag?.moved || sc.pinch || !this.fx.playing) { this.follow = null; return; } // 유닛 소멸·사용자 조작·연출 끝
        if (this.fx.shaking) return; // 흔들림이 기준 위치를 쥐고 있음
        const w = sc.world; const a = sc.lay.fit; const s = w.scaleX;
        const p = sc.clampPos(a.x + a.w / 2 - c.x * s, a.y + a.h / 2 - c.y * s);
        const t = isInstant() ? 1 : 0.25;
        const nx = w.x + (p.x - w.x) * t; const ny = w.y + (p.y - w.y) * t;
        if (Math.abs(nx - w.x) < 0.1 && Math.abs(ny - w.y) < 0.1) return;
        w.setPosition(nx, ny);
        sc.popupKey = ''; sc.updatePopups?.();
    }

    // 배율 k 로(바뀌면 보간) 이동. target() 은 해당 배율 기준 목표 위치. 연출 끄기/스킵이면 tween 이 즉시 최종값
    zoomPan(k, target, ms, fin) {
        const sc = this.scene;
        const w = sc.world;
        const k0 = sc.k;
        const p0 = { x: w.x, y: w.y };
        sc.setZoomK(k);
        const p1 = target();
        if (Math.abs(k - k0) > 0.001) sc.setZoomK(k0);
        const proxy = { t: 0 };
        const apply = (t) => {
            if (Math.abs(k - k0) > 0.001) sc.setZoomK(k0 + (k - k0) * t);
            w.setPosition(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t);
        };
        if (ms <= 0) { apply(1); sc.setZoomK(k); w.setPosition(p1.x, p1.y); fin(); return; }
        tween(sc, { targets: proxy, to: { t: 1 }, duration: ms, ease: 'Sine.easeInOut', onUpdate: () => apply(proxy.t), onComplete: () => { sc.setZoomK(k); w.setPosition(p1.x, p1.y); fin(); } });
    }

    // ---- fire: 시각 전용 불 오버레이(유닛 아래, 지형·목표 위) ----
    ensureLayer() {
        const sc = this.scene;
        if (this.layer?.scene) return this.layer;
        this.layer = sc.add.container(0, 0);
        const idx = sc.world.getIndex(sc.unitLayer);
        if (idx >= 0) sc.world.addAt(this.layer, idx); else sc.world.add(this.layer);
        return this.layer;
    }

    low() { return (settings.get().quality ?? 0) >= 2 || fxScale() < 1; }

    addFire(id, tiles) {
        const sc = this.scene;
        if (!sc.worldBuilt || id == null || !Array.isArray(tiles)) return;
        id = String(id);
        this.removeFire(id);
        const m = sc.store.state.map;
        let list = tiles.filter((t) => Array.isArray(t) && t[0] >= 0 && t[1] >= 0 && t[0] < m.w && t[1] < m.h);
        const low = this.low();
        const cap = low ? FIRE_CAP_LOW : FIRE_CAP_FULL;
        if (list.length > cap) { const step = list.length / cap; list = Array.from({ length: cap }, (_, i) => list[Math.floor(i * step)]); }
        const layer = this.ensureLayer();
        const hasTex = sc.textures.exists(FIRE_TEX);
        const rec = { objs: [], tweens: [] };
        list.forEach(([x, y], i) => {
            const cx = x * TILE + TILE / 2;
            const by = y * TILE + TILE * 0.95;
            let o;
            if (hasTex) o = sc.add.image(cx, by, FIRE_TEX).setOrigin(0.5, 0.85).setDisplaySize(TILE * 0.95, TILE * 0.95).setAlpha(0.9).setBlendMode(1);
            else o = sc.add.rectangle(cx, y * TILE + TILE / 2, TILE - 6, TILE - 6, 0xff6a1a, 0.35); // 텍스처 없음: 단순 색 칸
            layer.add(o);
            rec.objs.push(o);
            if (low || !hasTex) return; // 낮은 품질·연출 축약/끄기: 정지 이미지(스킵 중 생성돼도 일렁임은 유지)
            const sx = o.scaleX; const sy = o.scaleY;
            rec.tweens.push(sc.tweens.add({ targets: o, scaleX: sx * 1.08, scaleY: sy * 1.16, alpha: 0.7, duration: 380 + (i % 4) * 70, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: (i * 53) % 300 }));
        });
        this.fires.set(id, rec);
    }

    removeFire(id) {
        id = String(id);
        const rec = this.fires.get(id);
        if (!rec) return;
        rec.tweens.forEach((t) => t?.remove?.());
        rec.objs.forEach((o) => o?.destroy?.());
        this.fires.delete(id);
    }

    // sync 시점: store.state.cueFires(최종값)와 화면 불을 맞춘다(재접속·새로고침 복원 포함)
    syncFires() {
        if (!this.scene.worldBuilt) return;
        const want = new Map((this.scene.store.state.cueFires ?? []).filter((f) => f && f.cue_id != null).map((f) => [String(f.cue_id), f]));
        [...this.fires.keys()].forEach((id) => { if (!want.has(String(id))) this.removeFire(id); });
        want.forEach((f, id) => { if (!this.fires.has(id)) this.addFire(id, f.tiles); });
    }

    // sync 시점: 불 + 연출 액터를 store 최종값(cueFires / cueActors = 서버 battle.cues.actors + 이벤트 반영)에 맞춘다(재접속·스킵·연출 종료 정리)
    onSync() { this.flushGroup(); this.fx.enqueue((done) => { this.syncFires(); if (this.scene.worldBuilt) this.actors.sync(this.scene.store?.state?.cueActors ?? []); done(); }); }

    destroy() {
        [...this.fires.keys()].forEach((id) => this.removeFire(id));
        this.layer = null;
        this.pendingSay = null;
        this.follow = null;
        this.sayHold = false;
        this.groupBuf = null;
        this.duringSays?.clear(); this.activeWalks?.clear();
        this.actors?.destroy();
    }
}
