import { createEmitter } from './emitter.js';
import { settings } from './settings.js';

// 오디오 단일 진입점. 에셋이 없으면 무음(에러 없음). assets.js 가 오디오 manifest(public/assets/audio/manifest.json) 슬롯을 register 한다.
// 코드 슬롯(move/hit/...) 은 ALIAS 로 manifest 슬롯(sfx_*)에 연결한다.
export const sfxBus = createEmitter();
const handlers = new Map();
const ALIAS = {
    cursor: 'sfx_ui_hover', select: 'sfx_ui_tap', cancel: 'sfx_ui_cancel', confirm: 'sfx_ui_confirm',
    move: 'sfx_move_step', hit: 'sfx_hit_normal', hit_adv: 'sfx_hit_weak', hit_dis: 'sfx_hit_resist', crit: 'sfx_hit_crit', counter: 'sfx_counter',
    kill: 'sfx_unit_down', heal: 'sfx_aura_pulse', turn: 'sfx_turn_player', turn_enemy: 'sfx_turn_enemy', win: 'sfx_victory', lose: 'sfx_defeat',
    cutin: 'sfx_skill_cutin', skill_hit: 'sfx_skill_hit', exp: 'sfx_exp_tick', levelup: 'sfx_levelup', costup: 'sfx_cost_up', miss: 'sfx_hit_resist',
    sfx_fire: 'sfx_battle_magic', // 폴백 전용: manifest 에 sfx_fire 슬롯이 있으면 그 슬롯이 먼저 재생된다(handlers.get(slot) 우선). 슬롯 파일 로드 실패 시에만 마법 시전음
};
// ---- BGM 매니저(게임 전역 단일 인스턴스) ----
// - Phaser 사운드 매니저(game.sound)는 씬과 무관하게 유지되므로, 씬이 바뀌어도 같은 트랙이면 끊기지 않고 이어서 재생한다.
// - 다른 트랙이면 FADE_MS 동안 크로스페이드. 동시에 재생되는 BGM 은 현재 1개 + 페이드아웃 중인 것뿐(중복 재생 방지).
// - 자동재생 잠금(sound.locked): 재생을 미루고 Phaser 가 첫 사용자 입력에서 잠금을 풀면('unlocked') 그때의 현재 트랙을 재생.
// - 볼륨 = 슬롯 기본 볼륨 x 설정 bgmVolume(기본 1) x 덕킹 배율. bgmMuted 면 0(위치는 유지). 설정 변경은 즉시 반영.
// - BGM 은 부팅에서 받지 않는다. audio.bgm(key, scene) 의 scene 로더로 지연 로드(로드 전엔 무음, 로드되면 그때도 원하는 트랙일 때만 재생).
//   전투·결과 트랙은 로비 대기 중 audio.prefetchBgm 으로 미리 받는다.
const FADE_MS = 700;
const B = { sm: null, cache: null, catalog: new Map(), cur: null, curKey: null, outs: new Set(), duckMul: 1, ducks: new Map(), wantKey: null, pending: new Set(), unlockHooked: false };

const musicGain = () => { const st = settings.get(); return st.bgmMuted || st.muted ? 0 : Math.max(0, Math.min(1, st.bgmVolume ?? 1)); };
const targetVol = (key) => (B.catalog.get(key)?.volume ?? 0.5) * musicGain() * B.duckMul;

function cancelFade(snd) { if (snd?.__fadeTimer) { clearInterval(snd.__fadeTimer); snd.__fadeTimer = null; } }
// 이미 destroy 된 Phaser 사운드는 volume getter/setVolume 이 null gain 노드에 접근해 throw 한다(씬 전환 중 pageerror). 이런 사운드는 건너뛴다
const alive = (snd) => !!snd && !snd.pendingRemove && !!snd.manager && (!('volumeNode' in snd) || !!snd.volumeNode);
const volOf = (snd) => { try { return alive(snd) ? (snd.volume ?? 0) : 0; } catch { return 0; } };
// setInterval + 경과 시간 기반(탭 백그라운드에서 타이머가 늦어져도 끝 값으로 수렴)
function fade(snd, to, ms, onDone, from = volOf(snd)) {
    cancelFade(snd);
    if (!alive(snd)) { onDone?.(); return; }
    const t0 = performance.now();
    const step = () => {
        let k = Math.min(1, (performance.now() - t0) / ms);
        try { if (alive(snd)) snd.setVolume(from + (to - from) * k); else k = 1; } catch { k = 1; }
        if (k >= 1) { cancelFade(snd); onDone?.(); }
    };
    snd.__fadeTimer = setInterval(step, 40);
    step();
}
function killSound(snd) { cancelFade(snd); B.outs.delete(snd); if (!alive(snd)) return; try { snd.stop(); snd.destroy(); } catch { /* 무시 */ } }
function fadeOut(snd) {
    if (!snd) return;
    if (!alive(snd) || !snd.isPlaying) { killSound(snd); return; }
    B.outs.add(snd);
    fade(snd, 0, FADE_MS, () => killSound(snd));
}
function startPlaying(snd) {
    if (!alive(snd)) return;
    try { snd.play(); snd.setVolume(0); } catch { return; }
    fade(snd, targetVol(B.curKey), FADE_MS, null, 0); // 0 부터 페이드인(play 직후 snd.volume 이 1.0 으로 읽혀 첫 프레임에 튀는 것 방지)
}
// 잠금 해제 시 '그 시점의' 현재 트랙만 재생(잠금 중 여러 번 바뀌어도 1곡만 나온다)
function hookUnlock() {
    if (B.unlockHooked || !B.sm) return;
    B.unlockHooked = true;
    B.sm.once('unlocked', () => { B.unlockHooked = false; if (B.cur && !B.cur.isPlaying) startPlaying(B.cur); });
}
function lazyLoad(scene, key) {
    const e = B.catalog.get(key);
    const Ld = scene?.load;
    if (!e?.url || !Ld || B.pending.has(key)) return;
    B.pending.add(key);
    const onErr = (f) => { if (f?.key !== key) return; cleanup(); console.warn(`[audio] BGM 로드 실패: ${key}`); };
    const onDone = () => { cleanup(); if (B.wantKey === key) audio.bgm(key); };
    const cleanup = () => { B.pending.delete(key); Ld.off('loaderror', onErr); Ld.off(`filecomplete-audio-${key}`, onDone); };
    Ld.on('loaderror', onErr);
    Ld.once(`filecomplete-audio-${key}`, onDone);
    scene.events.once('shutdown', cleanup); // 씬 종료로 로더가 리셋되면 다음 씬이 다시 요청할 수 있게
    Ld.audio(key, e.url);
    if (!Ld.isLoading()) Ld.start();
}
// 덕킹 소유자 목록 -> 유효 배율 반영(재생 중 BGM 즉시 적용)
function applyDuck() {
    try {
        B.duckMul = B.ducks.size ? Math.min(...B.ducks.values()) : 1;
        if (!alive(B.cur) || !B.cur.isPlaying) return;
        cancelFade(B.cur);
        B.cur.setVolume(targetVol(B.curKey));
    } catch { /* 무시 */ }
}
// iOS(WebKit) 오디오 잠금 해제 보강.
// Phaser 기본 unlock 은 body 의 touchstart 에서도 context.resume() 을 부르는데, WebKit 은 touchstart 를 사용자 제스처로 인정하지 않아
// resume() 을 NotAllowedError 로 reject 하고, Phaser 는 reject 시 touchend 등 모든 리스너까지 제거한다 -> sound.locked 가 영구 true(BGM·효과음 전부 무음).
// 여기서는 사용자 활성화로 인정되는 이벤트(touchend/pointerup/click/keydown/mousedown)마다 suspended/interrupted 컨텍스트를 resume 하고,
// 구형 iOS 대비 1샘플 무음 버퍼를 재생, running 이 되면 Phaser 의 unlocked 플래그를 세워 'unlocked' 이벤트(hookUnlock)가 정상 발생하게 한다.
// 리스너는 유지(통화·Siri 등으로 'interrupted' 된 뒤 다음 터치에서 복구). 데스크톱은 이미 running 이라 아무것도 하지 않는다.
const UNLOCK_EVENTS = ['touchend', 'pointerup', 'click', 'keydown', 'mousedown'];
function installGestureUnlock(sm) {
    if (typeof window === 'undefined' || !sm?.context || sm.__gestureUnlock) return;
    sm.__gestureUnlock = true;
    const kick = () => {
        const ctx = sm.context;
        if (!ctx || ctx.state === 'closed') return;
        const markUnlocked = () => { if (ctx.state === 'running' && sm.locked) sm.unlocked = true; }; // Phaser update() 가 locked=false + 'unlocked' emit
        if (ctx.state === 'running') { markUnlocked(); return; }
        try {
            const src = ctx.createBufferSource();
            src.buffer = ctx.createBuffer(1, 1, 22050);
            src.connect(ctx.destination);
            src.start(0);
        } catch { /* 무시 */ }
        try { const p = ctx.resume(); if (p?.then) p.then(markUnlocked, () => { /* 제스처 아님: 다음 입력에서 재시도 */ }); else markUnlocked(); } catch { /* 무시 */ }
    };
    UNLOCK_EVENTS.forEach((ev) => window.addEventListener(ev, kick, { capture: true, passive: true }));
}
settings.subscribe(() => { try { if (alive(B.cur) && B.cur.isPlaying) { cancelFade(B.cur); B.cur.setVolume(targetVol(B.curKey)); } } catch { /* 무시 */ } });

export const audio = {
    play(slot) {
        try {
            (handlers.get(slot) ?? handlers.get(ALIAS[slot]))?.();
            sfxBus.emit('play', slot);
        } catch { /* 오디오 오류가 게임을 멈추지 않는다 */ }
    },
    register(slot, fn) { handlers.set(slot, fn); },
    has: (slot) => handlers.has(slot) || handlers.has(ALIAS[slot]),
    // 전투 음성 슬롯(manifest category 'battle_voice.*', sfx_bv_*): 부팅에서 받지 않고 key -> {url, volume} 만 등록(assets.queueAudio).
    // 전투 씬 진입 시 fx/BattleVoice.voicePreload 가 지연 로드, 재생도 BattleVoice 전용(audio.play 핸들러 없음)
    voiceCatalog: new Map(),
    // BGM: assets.js(finishAssets)가 initBgm 으로 사운드 매니저·캐시·트랙 목록(audio manifest 의 bgm 슬롯)을 넘긴다.
    initBgm({ sm, cache, catalog }) { B.sm = sm; B.cache = cache; B.catalog = catalog ?? new Map(); installGestureUnlock(sm); },
    // key 트랙으로 전환. 같은 트랙이면 이어서 재생, 다른 트랙이면 크로스페이드. scene 을 주면 미로드 트랙을 그 씬 로더로 지연 로드.
    bgm(key, scene = null) {
        try {
            if (!key) { audio.stopBgm(); return; }
            B.wantKey = key;
            // 외부에서 이미 destroy 된 사운드는 버린다(아래에서 새로 만들거나 지연 로드)
            if (B.cur && !alive(B.cur)) { cancelFade(B.cur); B.cur = null; B.curKey = null; }
            B.outs.forEach((s) => { if (!alive(s)) { cancelFade(s); B.outs.delete(s); } });
            if (B.curKey === key && B.cur) {
                if (B.sm?.locked) hookUnlock();
                else if (!B.cur.isPlaying) startPlaying(B.cur);
                else fade(B.cur, targetVol(key), FADE_MS);
                return;
            }
            // 직전에 페이드아웃 중인 같은 트랙(예: 전투 씬 재시작 shutdown->create)은 되살려 이어서 재생
            const revive = [...B.outs].find((s) => s.key === key);
            if (revive) {
                B.outs.delete(revive);
                fadeOut(B.cur);
                B.cur = revive; B.curKey = key;
                fade(revive, targetVol(key), FADE_MS);
                return;
            }
            if (!B.sm || !B.cache?.exists(key)) { lazyLoad(scene, key); return; } // 로드되면 wantKey 가 그대로일 때만 재생
            fadeOut(B.cur);
            // 마커 루프(loopStart/loopEnd)는 브라우저별로 재생이 곧바로 멈추는 사례가 있어 쓰지 않고 파일 전체를 네이티브 루프한다
            const snd = B.sm.add(key, { loop: true, volume: 0 });
            B.cur = snd; B.curKey = key;
            if (B.sm.locked) hookUnlock(); else startPlaying(snd);
        } catch (e) { console.warn('[audio] BGM 재생 실패', key, e); B.cur = null; B.curKey = null; }
    },
    currentBgm: () => B.wantKey,
    // 로비 공통 트랙 키(로비 모든 탭·대기실·편성·대화 기본값). bgm_lobby 가 manifest 에 없으면 기존 bgm_map
    lobbyBgm: () => (B.catalog?.has?.('bgm_lobby') ? 'bgm_lobby' : 'bgm_map'),
    // 재생 없이 미리 받기(로비 대기 중 전투·결과 BGM). 이미 있거나 받는 중이면 무시. 씬 종료로 끊기면 다음 요청 때 다시 받는다
    prefetchBgm(keys, scene) { try { (keys ?? []).forEach((k) => { if (!B.cache?.exists(k)) lazyLoad(scene, k); }); } catch { /* 무시 */ } },
    hasBgm: (key) => !!B.cache?.exists(key),
    // BGM 덕킹(소유자 방식): duckPush(owner, mul) / duckPop(owner). 유효 배율 = 남은 소유자 중 가장 낮은 값, 비어 있으면 1(원래 볼륨).
    //  소유자: CutsceneSfx 인스턴스(컷 중 -6dB)·'battle.result'(승리 결과창)·'battle_voice.hero'(영웅 사망 2.6초). 같은 소유자 재push 는 값 교체. stopBgm 은 전부 해제
    duckPush(owner, mul = 0.5) { B.ducks.set(owner, mul); applyDuck(); },
    duckPop(owner) { if (B.ducks.delete(owner)) applyDuck(); },
    // 이전 API 호환: duck(true, mul) / duck(false) = 'legacy' 소유자 한 칸(다른 소유자 덕킹은 건드리지 않음)
    duck(on, mul = 0.5) { if (on) audio.duckPush('legacy', mul); else audio.duckPop('legacy'); },
    duckLevel: () => B.duckMul, // 현재 유효 덕킹 배율(1 = 없음, 진단용)
    // 현재 BGM 페이드아웃 후 정지(전투 종료 등). 페이드 중 같은 트랙을 다시 요청하면 되살린다.
    stopBgm() { try { B.wantKey = null; B.ducks.clear(); B.duckMul = 1; fadeOut(B.cur); } catch { /* 무시 */ } B.cur = null; B.curKey = null; },
};
export const sfx = (slot) => audio.play(slot);
// 진단용(읽기 전용): 콘솔에서 __bgm() 로 BGM 상태 확인
if (typeof window !== 'undefined') window.__bgm = () => ({ want: B.wantKey, cur: B.curKey, playing: !!B.cur?.isPlaying, vol: volOf(B.cur), target: B.curKey ? targetVol(B.curKey) : null, locked: B.sm?.locked, ctx: B.sm?.context?.state, cached: B.curKey ? !!B.cache?.exists(B.curKey) : null, settings: settings.get() });
