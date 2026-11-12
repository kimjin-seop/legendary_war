import { TILE } from '../UnitView.js';
import { tween, isInstant } from '../ui/motion.js';
import { unitTex, ensureUnitTex } from '../assets.js';
import { unitType, terrainMod } from '../data/rules.js';
import { allyPassCost } from '../systems/grid.js';

// 연출용 액터(cue spawn_actor/walk/despawn_actor/face, docs/CUTSCENE_SPEC.md 14절, docs/CUTSCENE_ACTOR_WALK_20261108.md 3절).
// 판정 제외: store.state.units 와 분리된 시각 전용 스프라이트(선택·HP·ZOC 없음). 위치 최종값 = 서버 battle.cues.actors(sync 때 맞춤).
// 보행 원칙(사용자 2026-11-08): 걷는 쪽(액터·실제 유닛)은 실제 유닛 칸을 통과하지 않는다. 걸음마다 다음 칸을 확인해 막히면 BFS(4방향) 재탐색,
//  실패하면 그 자리 정지(+ 콘솔 path_blocked). 같은 편 실제 유닛 칸은 전투 규칙(ally_passthrough_cost > 0)일 때만 지나간다(멈추지는 못함). 액터끼리는 충돌 검사 없음.
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const dirOf = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : dx < 0 ? 'left' : null) : dy > 0 ? 'down' : 'up');
const sideOfUnit = (u) => u.side ?? (u.team === 'enemy' ? 'b' : 'a');
const cellOf = (c) => ({ x: Math.floor(c.x / TILE), y: Math.floor(c.y / TILE) });
const toCells = (path) => (Array.isArray(path) ? path : []).map((p) => (Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p?.x), y: Number(p?.y) })).filter((p) => Number.isInteger(p.x) && Number.isInteger(p.y));

export class CueActors {
    constructor(scene) {
        this.scene = scene;
        this.map = new Map(); // id -> { id, side, name, sprite, pseudo, x, y, facing, c, img, label, blocked }
    }

    get(id) { const a = this.map.get(String(id)); return a?.c?.scene ? a : null; }

    // 스프라이트 해석용 가짜 유닛(assets.unitTex 규칙 재사용: 영웅 시트 / NPC 시트 / 병종 공용)
    pseudoOf(id, side, sprite = {}) {
        const s = this.scene.store?.state ?? {};
        const hero = sprite.hero ?? null; const npc = sprite.npc_ref ?? null;
        return { id: `actor:${id}`, kind: hero || npc ? 'hero' : 'troop', type: sprite.unit_type ?? 'sword', hero: hero ?? undefined, npc_ref: npc ?? undefined, team: side === 'a' ? 'ally' : 'enemy', side: side === 'a' ? 'a' : 'b', culture: s.culture ?? s.map?.culture ?? null, hp: 1 };
    }

    // 방향 프레임(시트면 sheet_<행*3+열>, 걷는 중 step 0/1 = 좌우 발, idle = 가운데 열)
    applyDir(a, dir, step = null) {
        const t = unitTex(this.scene, a.pseudo, dir ?? a.facing ?? 'down');
        if (!t || !a.img?.scene) return;
        let frame = t.frame;
        if (t.sheet && step != null) { const m = /^sheet_(\d+)$/.exec(String(frame)); if (m) { const row = Math.floor((Number(m[1]) - 1) / 3); frame = `sheet_${row * 3 + (step % 2 ? 0 : 2)}`; } }
        if (a.img.texture.key !== t.key || a.img.frame.name !== frame) a.img.setTexture(t.key, frame);
        a.img.setFlipX(!!t.flipX).setDisplaySize(TILE * 0.95, TILE * 0.95);
        if (dir) a.facing = dir;
    }

    make(id, { side = 'n', name = null, sprite = {}, x, y, facing = 'down' }) {
        const sc = this.scene;
        this.remove(id);
        const a = { id: String(id), side, name, sprite, pseudo: this.pseudoOf(id, side, sprite), x, y, facing: facing ?? 'down', blocked: false };
        a.c = sc.add.container(x * TILE + TILE / 2, y * TILE + TILE / 2);
        const shadow = sc.add.ellipse(0, TILE * 0.36, TILE * 0.62, TILE * 0.18, 0x000000, 0.32);
        a.img = sc.add.image(0, 0, '__DEFAULT');
        a.c.add([shadow, a.img]);
        if (name) { a.label = sc.add.text(0, -TILE * 0.62, String(name), { fontFamily: 'sans-serif', fontSize: '12px', fontStyle: 'bold', color: side === 'a' ? '#cfe8ff' : side === 'b' ? '#ffd0c8' : '#f0e6d0', stroke: '#0B1020', strokeThickness: 3 }).setOrigin(0.5, 1); a.c.add(a.label); }
        (sc.unitLayer ?? sc.world)?.add(a.c);
        this.applyDir(a, a.facing);
        if (!unitTex(sc, a.pseudo, a.facing)) a.img.setVisible(false); // 텍스처 없음: 그림자·이름만(지연 로드 후 표시)
        ensureUnitTex(sc, a.pseudo, () => { if (a.img?.scene) { a.img.setVisible(true); this.applyDir(a, a.facing); } }); // NPC·영웅 시트 지연 로드
        this.map.set(a.id, a);
        return a;
    }

    remove(id) { const a = this.map.get(String(id)); if (a) { a.c?.destroy(); this.map.delete(String(id)); } }

    // spawn_actor: fx fade(기본) / door(작게 커지며) / ship(배 쪽에서 미끄러져 들어옴: 출발 칸 가로 +0.6칸 바깥에서)
    spawn(c, done) {
        const t = toCells([c.tile])[0];
        if (!c.actor || !t) { done(); return; }
        const a = this.make(c.actor, { side: c.side ?? 'n', name: c.name ?? null, sprite: c.sprite ?? {}, x: t.x, y: t.y, facing: c.facing ?? 'down' });
        if (isInstant()) { done(); return; }
        const fxk = c.fx ?? 'fade';
        a.c.setAlpha(0);
        if (fxk === 'door') a.c.setScale(0.6);
        const tx = a.c.x;
        if (fxk === 'ship') a.c.x = tx + TILE * 0.6;
        tween(this.scene, { targets: a.c, to: { alpha: 1, scaleX: 1, scaleY: 1, x: tx }, duration: fxk === 'ship' ? 450 : 300, onComplete: done });
    }

    // despawn_actor: fade / door / ship(바깥으로 미끄러지며). 보행이 막혀 멈춘 액터는 fx 와 무관하게 제자리 페이드(적 유닛 위를 가로지르지 않는다)
    despawn(c, done) {
        const a = this.get(c.actor);
        if (!a) { this.remove(c.actor); done(); return; }
        if (isInstant()) { this.remove(a.id); done(); return; }
        const fxk = a.blocked ? 'fade' : (c.fx ?? 'fade');
        const to = { alpha: 0 };
        if (fxk === 'ship') to.x = a.c.x + TILE * 0.6;
        if (fxk === 'door') { to.scaleX = 0.6; to.scaleY = 0.6; }
        tween(this.scene, { targets: a.c, to, duration: fxk === 'ship' ? 450 : 300, onComplete: () => { this.remove(a.id); done(); } });
    }

    face(c) {
        if (c.actor) { const a = this.get(c.actor); if (a) this.applyDir(a, c.dir); return; }
        const v = this.scene.views?.get(c.unit_id ?? c.unit);
        v?.setLook?.(c.dir); // 실제 유닛: 표시용 시선(서버 facing 불변)
    }

    // 재접속·스킵·연출 종료: 서버 최종 액터 목록(battle.cues.actors)에 맞춘다(없는 액터 제거, 있는 액터는 최종 칸에 즉시)
    sync(list) {
        const want = new Map((Array.isArray(list) ? list : []).filter((x) => x && x.id != null && x.alive !== false).map((x) => [String(x.id), x]));
        [...this.map.keys()].forEach((id) => { if (!want.has(id) || !this.map.get(id)?.c?.scene) this.remove(id); });
        want.forEach((x, id) => {
            const a = this.get(id);
            if (!a) { this.make(id, { side: x.side ?? 'n', name: x.name ?? null, sprite: x.sprite ?? {}, x: x.x, y: x.y, facing: x.facing ?? 'down' }); return; }
            a.x = x.x; a.y = x.y; a.c.setPosition(x.x * TILE + TILE / 2, x.y * TILE + TILE / 2).setAlpha(1).setScale(1); this.applyDir(a, x.facing ?? a.facing);
        });
    }

    destroy() { [...this.map.keys()].forEach((id) => this.remove(id)); }

    // ---- 보행(액터·실제 유닛 공용) ----
    // mover = { c(컨테이너), side, selfId(실제 유닛 id | null), moveType, ship(수상 출발 액터), setDir(dir, step), stop() }
    // 다음 칸이 막혔는지(실제 유닛 기준): 적대/중립 = 항상, 같은 편 = 통과 비용 0 이면 막힘, 목적지는 같은 편이어도 막힘(멈출 수 없음)
    blockedAt(mover, x, y, isGoal) {
        const units = this.scene.store?.state?.units ?? [];
        const u = units.find((q) => q.hp > 0 && q.x === x && q.y === y && q.id !== mover.selfId);
        if (!u) return false;
        if (mover.side === 'n' || sideOfUnit(u) !== mover.side) return true;
        return isGoal || allyPassCost() <= 0;
    }

    // 4방향 BFS(맵 경계·지형: 저작 경로 칸은 허용, 그 밖은 병종 통행 가능 지형). 반환 = 출발 다음 칸부터 목적지까지 [{x,y}] | null
    reroute(mover, from, goal, authored) {
        const m = this.scene.store?.state?.map; if (!m) return null;
        const okTerrain = (x, y) => authored.has(`${x},${y}`) || (terrainMod(m.tiles?.[y]?.[x], mover.moveType).cost ?? null) !== null;
        const key = (p) => `${p.x},${p.y}`;
        const prev = new Map([[key(from), null]]); const q = [from];
        while (q.length) {
            const cur = q.shift();
            if (cur.x === goal.x && cur.y === goal.y) { const out = []; let k = key(cur); let p = cur; while (k !== key(from)) { out.unshift(p); p = prev.get(k); k = key(p); } return out; }
            for (const [dx, dy] of DIRS) {
                const n = { x: cur.x + dx, y: cur.y + dy };
                if (n.x < 0 || n.y < 0 || n.x >= m.w || n.y >= m.h || prev.has(key(n))) continue;
                const isGoal = n.x === goal.x && n.y === goal.y;
                if (!okTerrain(n.x, n.y) || this.blockedAt(mover, n.x, n.y, isGoal)) continue;
                prev.set(key(n), cur); q.push(n);
            }
            if (prev.size > 4000) break; // 안전 상한
        }
        return null;
    }

    // 경로 걷기: speed 칸/초(1~12, 배속은 tween 이 반영). onStep(cell) = 칸 도착마다(말풍선·카메라 갱신). done(ok)
    walkPath(mover, path, { speed = 4, label = '', onStep = null } = {}, done) {
        mover.blocked = false; // 이전 걷기에서 막혔던 표시 해제(같은 액터를 다시 걷게 할 때 남아 있지 않게)
        let rest = toCells(path);
        const start = cellOf(mover.c);
        if (rest.length && rest[0].x === start.x && rest[0].y === start.y) rest.shift(); // 경로가 현재 칸을 포함하면 뺀다
        if (!rest.length) { done(true); return; }
        const goal = rest[rest.length - 1];
        const authored = new Set(rest.map((p) => `${p.x},${p.y}`));
        const ms = 1000 / Math.min(12, Math.max(1, Number(speed) || 4));
        let cur = start; let n = 0;
        const step = () => {
            if (!mover.c?.scene) { done(false); return; }
            if (!rest.length) { mover.stop(); done(true); return; }
            let nx = rest[0];
            if (this.blockedAt(mover, nx.x, nx.y, nx.x === goal.x && nx.y === goal.y)) {
                const alt = this.reroute(mover, cur, goal, authored);
                if (!alt || !alt.length) { console.warn(`[cue] path_blocked ${label} at ${cur.x},${cur.y}`); mover.blocked = true; mover.stop(); done(false); return; }
                rest = alt; nx = rest[0];
            }
            rest.shift();
            mover.setDir(dirOf(nx.x - cur.x, nx.y - cur.y), n++);
            const p = { x: nx.x * TILE + TILE / 2, y: nx.y * TILE + TILE / 2 };
            if (isInstant()) { mover.c.setPosition(p.x, p.y); cur = nx; onStep?.(cur); step(); return; }
            tween(this.scene, { targets: mover.c, to: { x: p.x, y: p.y }, duration: ms, ease: 'Linear', onComplete: () => { cur = nx; onStep?.(cur); step(); } });
        };
        step();
    }

    // 액터 mover
    actorMover(a) {
        const mt = unitType(a.sprite?.unit_type ?? 'sword').move_type;
        const self = this;
        return { c: a.c, side: a.side, selfId: null, moveType: mt, set blocked(v) { a.blocked = v; }, setDir: (d, step) => { if (d) self.applyDir(a, d, step); }, stop: () => self.applyDir(a, a.facing) };
    }

    // 실제 유닛 mover(UnitView)
    unitMover(v, u) {
        return { c: v.c, side: sideOfUnit(u), selfId: u.id, moveType: unitType(u.type).move_type, blocked: false, setDir: (d) => { if (d) v.walkStart?.(d); }, stop: () => { v.c.setScale?.(1); v.walkStop?.(); } };
    }
}
