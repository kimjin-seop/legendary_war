import { audio } from '../audio.js';
import { settings } from '../settings.js';
import { isInstant } from '../ui/motion.js';
import { withVer } from '../assetVersion.js';

// 전투 음성(함성·비명·전멸·영웅 사망 외침·승리 환호). 규칙·수치 = public/assets/audio/battle_voice_cues.json(안아트, 청취 검증 전 UNVERIFIED).
// - 슬롯 = audio manifest 의 category 'battle_voice.*'(sfx_bv_*, 약 1.16MB). 부팅에서 받지 않고(assets.queueAudio 가 audio.voiceCatalog 로만 등록)
//   전투 씬 진입 시 voicePreload(scene) 로 지연 로드한다(씬 로더와 별개 fetch+decodeAudio, 월드 구성 2.5초 뒤). 로드 전·실패·규칙 JSON 없음이면 조용히 생략(에러 없음).
// - 끄기/교체: 설정 '전투 음성'(voiceMuted/voiceVolume). 효과음이 음소거/0 이면 같이 무음. 키 단위 교체 = manifest 슬롯 파일 교체 또는 cues.pools 에서 키 제거.
//   코드 전체 끄기 = 아래 VOICE_ON=false.
// - 최종 gain = slot.volume x event.volMul x sfxVolume x voiceVolume(cutscene_sfx_cues 의 vol=최종 gain 규칙과 다름).
// - 컷 소속(CutVoice: 함성·die·hurt·rout)은 컷 종료·스킵·씬 종료(CutsceneSfx.stop)에서 60ms 페이드로 정지. 영웅 사망·승리는 컷 소속 아님.
export const VOICE_ON = true;
const CUES_KEY = 'battle_voice_cues';
const CUES_URL = '/assets/audio/battle_voice_cues.json';
const FADE_MS = 60;
const DEF = { // JSON 이 일부 필드를 빠뜨려도 동작하는 기본값(사양서 값과 같음)
    maxVoices: 3, perCategory: { shout: 2, die: 2, hurt: 1, rout: 1, hero: 1, victory: 1 },
    priority: { hero: 3, rout: 2, shout: 1, die: 1, victory: 1, hurt: 0 },
};
// 영웅 성별(서버·manifest 에 영웅별 성별 필드 없음): unit.gender/sex 가 오면 그 값, 주인공은 hero 코드(protagonist_female_*), 그 외 아래 여성 영웅 코드 목록(hero_native_names 기준), 나머지 m
const FEMALE = new Set(['joan_of_arc', 'hildegard', 'lakshmibai', 'amanirenas', 'eleanor_aquitaine', 'christine_de_pizan', 'elizabeth_i', 'maria_theresa', 'empress_jito', 'murasaki_shikibu', 'seondeok', 'wu_zetian', 'artemisia_i', 'trung_trac']);
export function heroGender(u) {
    const g = String(u?.gender ?? u?.sex ?? '').toLowerCase();
    if (g) return /^f/.test(g) ? 'f' : 'm';
    const code = String(u?.hero ?? '');
    if (/^protagonist_(female|f)(_|$)/.test(code)) return 'f';
    return FEMALE.has(code) ? 'f' : 'm';
}

// ---- 공유 상태(씬·컷 사이 유지: 셔플 가방·피로도·쿨다운·재생 중 목록) ----
export const V = {
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), // 하니스에서 교체 가능
    rand: Math.random,
    bags: new Map(), active: [], failed: new Set(),
    lastShoutAt: -1e9, lastCutEndAt: -1e9, consec: 0, heroAt: -1e9,
};
const cuesOf = (scene) => { try { return scene?.cache?.json?.get(CUES_KEY) ?? null; } catch { return null; } };
const has = (scene, key) => { try { return !!scene?.cache?.audio?.exists(key); } catch { return false; } };

export function voiceEnabled() {
    if (!VOICE_ON) return false;
    const st = settings.get();
    return !(st.muted || st.sfxMuted || st.sfxVolume === 0 || st.voiceMuted || st.voiceVolume === 0);
}

// 전투 씬 진입 시 지연 로드(재생 없이). 씬 로더(scene.load)를 쓰지 않는다: 공유 로더 'complete'(NPC 시트·컷신 배경 지연 로드 완료)를 늦추지 않도록
// 월드 구성 후 PRELOAD_DELAY_MS 뒤 fetch -> sound.decodeAudio(게임 전역 오디오 캐시) 로 동시 PRELOAD_PAR 개씩 받는다. 규칙 JSON 은 cache.json.add.
// 이미 있거나·받는 중이거나·실패한 키는 다시 요청하지 않는다(실패는 세션 동안 기억). WebAudio 가 아니면(decodeAudio 없음) 생략 = 무음
const PRELOAD_DELAY_MS = 2500;
const PRELOAD_PAR = 3;
const inflight = new Set();
export function voicePreload(scene, { delayMs = PRELOAD_DELAY_MS } = {}) {
    if (!VOICE_ON || !scene?.sound || !scene?.cache) return 0;
    const sm = scene.sound; const cache = scene.cache;
    const run = () => {
        try {
            if (typeof fetch !== 'function') return;
            if (!cache.json.exists(CUES_KEY) && !inflight.has(CUES_KEY) && !V.failed.has(CUES_KEY)) {
                inflight.add(CUES_KEY);
                fetch(withVer(CUES_URL)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
                    .then((d) => { if (!cache.json.exists(CUES_KEY)) cache.json.add(CUES_KEY, d); })
                    .catch(() => V.failed.add(CUES_KEY)).finally(() => inflight.delete(CUES_KEY));
            }
            if (typeof sm.decodeAudio !== 'function') return;
            const todo = [...audio.voiceCatalog.entries()].filter(([k, v]) => v?.url && !cache.audio.exists(k) && !inflight.has(k) && !V.failed.has(k));
            todo.forEach(([k]) => inflight.add(k));
            const one = ([key, v]) => fetch(v.url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
                .then((buf) => new Promise((res) => {
                    const done = (k) => { if (k !== key) return; sm.off?.('decoded', done); res(); };
                    sm.on?.('decoded', done);
                    setTimeout(() => { sm.off?.('decoded', done); if (!cache.audio.exists(key)) V.failed.add(key); res(); }, 10000); // 디코드 실패(이벤트 없음) 대비
                    sm.decodeAudio(key, buf);
                }))
                .catch(() => V.failed.add(key)).finally(() => inflight.delete(key));
            const next = () => { const it = todo.shift(); return it ? one(it).then(next) : Promise.resolve(); };
            for (let i = 0; i < PRELOAD_PAR; i += 1) next();
        } catch { /* 무시(무음) */ }
    };
    if (delayMs > 0) setTimeout(run, delayMs); else run();
    return 1;
}

// 셔플 가방 + 직전 2개(풀 3 미만이면 1개) 제외. 로드된 키만
export function pickFrom(scene, cues, pool) {
    const keys = (cues?.pools?.[pool] ?? []).filter((k) => has(scene, k));
    if (!keys.length) return null;
    if (keys.length === 1) return keys[0];
    const noRep = Math.min(keys.length < 3 ? 1 : (cues.pick?.noRepeatLast ?? 2), keys.length - 1);
    let b = V.bags.get(pool);
    if (!b) { b = { q: [], recent: [] }; V.bags.set(pool, b); }
    const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i -= 1) { const j = Math.floor(V.rand() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
    b.q = b.q.filter((k) => keys.includes(k));
    const recent = b.recent.slice(-noRep);
    let j = b.q.findIndex((k) => !recent.includes(k));
    if (j < 0) { b.q = shuffle(keys); j = b.q.findIndex((k) => !recent.includes(k)); }
    const key = b.q.splice(j, 1)[0];
    b.recent.push(key); if (b.recent.length > 2) b.recent.shift();
    return key;
}

const alive = (s) => { try { return !!s && !s.pendingRemove && !!s.manager; } catch { return false; } };
function killEntry(en) {
    if (en.timer) { clearInterval(en.timer); en.timer = null; }
    V.active = V.active.filter((x) => x !== en);
    try { en.snd.stop(); en.snd.destroy(); } catch { /* 이미 정리됨 */ }
}
// 60ms 페이드아웃 후 정지(즉시 목록에서 빼서 동시재생 한도를 비운다)
export function fadeEntry(en, ms = FADE_MS) {
    if (en.stopping) return;
    en.stopping = true;
    V.active = V.active.filter((x) => x !== en);
    if (!alive(en.snd)) { killEntry(en); return; }
    const t0 = V.now(); let from = 0;
    try { from = en.snd.volume ?? 0; } catch { from = 0; }
    en.timer = setInterval(() => {
        const k = Math.min(1, (V.now() - t0) / ms);
        try { if (alive(en.snd)) en.snd.setVolume(from * (1 - k)); } catch { /* 무시 */ }
        if (k >= 1) killEntry(en);
    }, 15);
}

// 재생 한 건(동시재생 한도·우선순위·스틸). 반환 entry 또는 null(생략)
export function playVoice(scene, cues, { pool, cat, volMul = 1, pan = 0, owner = null }) {
    if (!voiceEnabled() || !cues) return null;
    const sm = scene?.sound;
    if (!sm || sm.locked) return null;
    const key = pickFrom(scene, cues, pool);
    if (!key) return null;
    const pri = cues.priority?.[cat] ?? DEF.priority[cat] ?? 1;
    const maxV = cues.concurrency?.maxVoices ?? DEF.maxVoices;
    const perCat = cues.concurrency?.perCategory?.[cat] ?? DEF.perCategory[cat] ?? 1;
    V.active = V.active.filter((en) => alive(en.snd));
    const victimOf = (list) => list.slice().sort((a, b) => a.pri - b.pri || a.t0 - b.t0)[0];
    for (let guard = 0; guard < 4; guard += 1) {
        const same = V.active.filter((en) => en.cat === cat);
        const pool2 = same.length >= perCat ? same : V.active.length >= maxV ? V.active : null;
        if (!pool2) break;
        const v = victimOf(pool2);
        if (v.pri > pri) return null; // 새 소리가 가장 낮은 우선순위면 버림
        fadeEntry(v);
    }
    const st = settings.get();
    const slotVol = audio.voiceCatalog.get(key)?.volume ?? 0.6;
    const vol = Math.min(1, slotVol * volMul * (st.sfxVolume ?? 1) * (st.voiceVolume ?? 1));
    const rg = cues.rate?.[cat] ?? [1, 1];
    const rate = rg[0] + (rg[1] - rg[0]) * V.rand();
    try {
        const snd = sm.add(key, { volume: vol, rate, pan });
        const en = { snd, key, cat, pri, t0: V.now(), owner, stopping: false, timer: null };
        V.active.push(en);
        snd.once?.('complete', () => killEntry(en));
        snd.play();
        return en;
    } catch { return null; }
}

// ---- 컷 1개 분량(BattleCutscene/MicroCutscene) ----
const GROUP = { archer: 'archer', mage: 'mage', cavalry: 'cavalry', flyer: 'flyer', gunner: 'gunner' };
const DOWN = { shout_l: 'shout_m', shout_m: 'shout_s', shout_s: 'shout_s' };
// 부대 함성 규모: 잔존 < 0.4 -> s / 보스·적 지휘관 또는 (영웅·영웅 지휘 부대 && 잔존 >= 0.9) -> l / 그 외 m
export function shoutPool(spec) {
    const u = spec?.unit ?? {};
    const max = Number(spec?.hpMax) || 0;
    const ratio = max > 0 ? Math.max(0, Number(spec?.hp ?? max)) / max : 1;
    if (ratio < 0.4) return 'shout_s';
    const boss = !!(u.boss || u.is_boss || (u.kind === 'commander' && u.team !== 'ally'));
    const heroLed = (u.kind && u.kind !== 'troop' && !u.non_hero) || u.leader_id != null;
    if (boss || (heroLed && ratio >= 0.9)) return 'shout_l';
    return 'shout_m';
}
export const remainRatio = (spec) => { const m = Number(spec?.hpMax) || 0; return m > 0 ? Math.max(0, Number(spec?.hp ?? m)) / m : 1; };

export class CutVoice {
    // atk/def = 컷신 spec({unit, hp, hpMax, ...}). counter = 반격 컷(pan 부호 반전). scale < 1 = 축약 컷
    constructor(scene, { atk, def, counter = false, scale = 1, noCounter = false }) {
        this.scene = scene; this.atk = atk; this.def = def;
        this.sign = counter ? -1 : 1;
        this.noCounter = !!noCounter;
        this.cues = cuesOf(scene);
        const sp = settings.get().speed || 1;
        this.speed = sp;
        this.mode = scale < 1 || sp >= 3 ? 'lite' : sp >= 2 ? 'fast' : 'full';
        const E = this.cues?.events ?? {};
        this.dieMax = this.mode === 'lite' ? 1 : this.mode === 'fast' ? 2 : (E.unit_death_in_cut?.maxPerCut ?? 4);
        this.timers = []; this.stopped = false; this.routed = false;
        this.dieN = 0; this.lastDieMs = -1e9; this.hurtN = 0; this.lastHurtMs = -1e9;
        this.shouted = false;
    }

    off() { return this.stopped || !this.cues || isInstant() || !voiceEnabled(); }

    later(ms, fn) {
        try { this.timers.push(this.scene.time.delayedCall(Math.max(0, ms), () => { if (!this.stopped) fn(); })); } catch { /* 무시 */ }
    }

    // 컷 시작(t=0). 공격측 함성을 냈으면 true(-> CutsceneSfx 가 sfx_battle_roar 를 x0.5 바닥음으로)
    start() {
        if (this.off()) return false;
        const now = V.now();
        const E = this.cues.events?.cut_start ?? {};
        const F = this.cues.fatigue ?? {};
        V.consec = now - V.lastCutEndAt <= 8000 ? V.consec + 1 : 1;
        const fatMul = V.consec >= 3 ? 0.6 : V.consec === 2 ? 0.75 : 1;
        const step = (p) => { let q = p; if (V.consec >= 3) q = DOWN[q]; if (this.mode !== 'full') q = DOWN[q]; return q; };
        // 공격측
        if (now - V.lastShoutAt >= (F.shoutCooldownMs ?? 2500)) {
            const type = GROUP[this.atk?.unit?.type] ?? 'melee';
            const vm = (E.attacker?.volMul?.[type] ?? 1) * fatMul;
            const en = playVoice(this.scene, this.cues, { pool: step(shoutPool(this.atk)), cat: 'shout', volMul: vm, pan: (E.attacker?.pan ?? -0.4) * this.sign, owner: this });
            if (en) { this.shouted = true; V.lastShoutAt = now; }
        }
        // 방어측 응답(0.22s): 1배속 전용, 반격 가능·잔존 >= 0.4, 연속 컷은 2컷에 1번
        const defOk = this.mode === 'full' && !this.noCounter && remainRatio(this.def) >= 0.4 && (V.consec === 1 || V.consec % 2 === 1);
        if (defOk) {
            const t = (E.defender?.t ?? 0.22) * 1000 / this.speed;
            this.later(t, () => playVoice(this.scene, this.cues, { pool: step(shoutPool(this.def)), cat: 'shout', volMul: (E.defender?.volMul ?? 0.7) * fatMul, pan: (E.defender?.pan ?? 0.4) * this.sign, owner: this }));
        }
        return this.shouted;
    }

    sidePan(side) { return (side === 0 ? -0.4 : 0.4) * this.sign; }

    // 컷 안 개체 사망(cs.micro.deaths 도달). atMs = 컷 재생 시각(ms). wiped = 이 사망으로 그 진영 전멸
    death(side, atMs, wiped = false) {
        if (this.off()) return;
        const E = this.cues.events ?? {};
        if (wiped) { // 전멸 순간은 rout(+0.05s)가 대신(마지막 개체 die 와 겹침 방지). 이후 이 컷의 die/hurt 생략
            if (!this.routed) { this.routed = true; this.later(50 / this.speed, () => playVoice(this.scene, this.cues, { pool: 'rout', cat: 'rout', volMul: E.troop_wiped?.volMul ?? 1, pan: this.sidePan(side), owner: this })); }
            return;
        }
        if (this.routed) return;
        const D = E.unit_death_in_cut ?? {};
        if (this.dieN >= this.dieMax) return;
        if (atMs - this.lastDieMs < Math.max(D.minIntervalMs ?? 90, D.clusterMs ?? 60)) return; // 최소 간격·동시 사망 1회
        const en = playVoice(this.scene, this.cues, { pool: 'die', cat: 'die', volMul: D.volMul ?? 0.9, pan: this.sidePan(side), owner: this });
        if (en) { this.dieN += 1; this.lastDieMs = atMs; }
    }

    // 비치명 타격(hpAfter > 0). dieSoon = 120ms 안에 사망이 있음
    hurt(side, atMs, dieSoon = false) {
        if (this.off() || this.routed || this.mode !== 'full') return;
        const H = this.cues.events?.unit_hurt_in_cut ?? {};
        if (dieSoon || this.hurtN >= (H.maxPerCut ?? 3) || atMs - this.lastHurtMs < (H.minIntervalMs ?? 150)) return;
        if (V.rand() >= (H.chance ?? 0.25)) return;
        const en = playVoice(this.scene, this.cues, { pool: 'hurt', cat: 'hurt', volMul: H.volMul ?? 0.8, pan: this.sidePan(side), owner: this });
        if (en) { this.hurtN += 1; this.lastHurtMs = atMs; }
    }

    // 컷 종료·스킵·씬 종료: 예약 취소 + 이 컷 음성 60ms 페이드 정지(영웅 사망 음성은 대상 아님)
    stop() {
        if (this.stopped) return;
        this.stopped = true;
        this.timers.forEach((t) => { try { t.remove(false); } catch { /* 무시 */ } });
        this.timers = [];
        V.active.filter((en) => en.owner === this).forEach((en) => fadeEntry(en));
        V.lastCutEndAt = V.now();
    }
}

const HERO_DUCK = 'battle_voice.hero';
let heroDuckTimer = null;
// 영웅/지휘관 사망(맵 레벨 사건: 연출 끄기여도 재생, 퇴각은 호출하지 않는다)
export function voiceHeroFall(scene, unit) {
    try {
        const cues = cuesOf(scene);
        if (!cues || !voiceEnabled()) return false;
        const H = cues.events?.hero_death ?? {};
        const now = V.now();
        if (now - V.heroAt < (H.cooldownMs ?? 1500)) return false;
        V.active.filter((en) => en.cat === 'die' || en.cat === 'hurt' || en.cat === 'shout').forEach((en) => fadeEntry(en)); // 선점
        const pool = heroGender(unit) === 'f' && (cues.pools?.hero_f ?? []).some((k) => has(scene, k)) ? 'hero_f' : 'hero_m';
        const en = playVoice(scene, cues, { pool, cat: 'hero', volMul: H.volMul ?? 1, pan: 0 });
        if (!en) return false;
        V.heroAt = now;
        const D = H.bgmDuck ?? { mul: 0.5, ms: 1200 };
        audio.duckPush(HERO_DUCK, D.mul ?? 0.5); // 소유자 방식: 다른 덕킹(컷신·결과창)과 겹쳐도 내 것만 해제(남은 소유자 중 가장 낮은 배율 유지)
        if (heroDuckTimer) clearTimeout(heroDuckTimer);
        heroDuckTimer = setTimeout(() => { heroDuckTimer = null; audio.duckPop(HERO_DUCK); }, D.ms ?? 1200);
        return true;
    } catch { return false; }
}

// 승리 환호(win 효과음 0.35s 뒤). 패배는 음성 없음
export function voiceVictory(scene) {
    try {
        const cues = cuesOf(scene);
        if (!cues || !voiceEnabled()) return;
        const E = cues.events?.victory ?? {};
        scene.time.delayedCall(350, () => playVoice(scene, cues, { pool: 'victory', cat: 'victory', volMul: E.volMul ?? 0.85, pan: 0 }));
    } catch { /* 무시 */ }
}
