import { audio } from '../audio.js';
import { settings } from '../settings.js';
import { CutVoice } from './BattleVoice.js';

// 교전 컷신 효과음: public/assets/audio/cutscene_sfx_cues.json 의 cues.{melee|archer|magic|cavalry|flying} 를 컷 시작(t=0) 기준으로 스케줄 재생한다.
// - 사운드 파일(sfx_battle_*)은 audio manifest 슬롯으로 Preload 단계에서 이미 로드된다(assets.queueAudio). 큐 JSON 은 assets.queueAssets 가 'cutscene_sfx_cues' 키로 로드.
//   큐/오디오가 없으면 무음(에러 없음).
// - 필드: t(시작 s) vol(최종 gain, 마스터 SFX 볼륨 별도 곱) pan(-1 공격측 ~ 1 방어측) rate stopAt(루프 정지 s) fadeOut(s) loop when('defender_loses_troops').
// - 시간 스케일: 컷신 길이 배율(축약 0.65) / 배속. 반격 컷: pan 부호 반전 + roar vol x0.8. rate 는 0.97~1.03 랜덤 변주.
// - 전투 음성(fx/BattleVoice.js, battle_voice_cues.json): 컷 시작 함성(공격측 즉시·방어측 0.22s)·컷 안 사망/피격/전멸 음성(MicroCutscene 이 this.voice 호출).
//   함성이 나면 sfx_battle_roar 는 x0.5 바닥 웅성. 음성 슬롯 미로드·전투 음성 끔이면 기존 효과음만.
// - stop(): 컷 종료·스킵·연출 끄기·씬 종료 어디서든 호출하면 예약 타이머·재생 중인 소리(루프 포함)를 즉시 정리하고 BGM 덕킹을 푼다.
const GROUP = { archer: 'archer', mage: 'magic', cavalry: 'cavalry', flyer: 'flying', gunner: 'gunner' }; // gunner: cues.gunner(총성) 없으면 archer 큐로 임시
const DUCK = 0.5; // -6dB
// FE 타이밍 보정: 큐 파일은 충돌 1.45초 기준. 실제 충돌 시각(collideAt, 1배속 초 — BattleCutscene 이 CUT_T 로 계산해 넘김)에 맞춰
//  - 충돌 기준 큐(IMPACT: 충돌음·쓰러짐 등)는 충돌 시각 차이만큼 평행 이동(충돌 이후 간격 유지, 축약 배율 적용)
//  - 그 외(함성·질주 루프·화살·마법·날개)는 [0, 1.45] -> [0, collideAt] 로 비례 압축. 루프 stopAt 도 같은 방식
const SHEET_COLLIDE = 1.45;
const IMPACT = new Set(['sfx_battle_clash', 'sfx_battle_fall', 'sfx_battle_rumble', 'sfx_battle_tick']);

export class CutsceneSfx {
    constructor(scene, { type, counter = false, losesTroops = false, scale = 1, atk = null, def = null, noCounter = false }) {
        this.scene = scene;
        this.counter = counter;
        this.losesTroops = losesTroops;
        this.scale = scale;
        this.group = GROUP[type] ?? 'melee';
        this.timers = [];
        this.tweens = [];
        this.sounds = new Set();
        this.stopped = false;
        this.ducked = false;
        this.collideAt = null; // 실제 충돌 시각(초, 1배속·축약 반영). 없으면 큐 시트 기준(1.45 x scale)
        this.voice = new CutVoice(scene, { atk, def, counter, scale, noCounter }); // 컷 소속 전투 음성(stop 에서 함께 정지)
        this.voiceShout = false;
    }

    // 큐 시트 시각(초) -> 실제 컷 시각(초, 1배속)
    mapT(t, key) {
        const c = this.collideAt ?? SHEET_COLLIDE * this.scale;
        if (IMPACT.has(key) || t > SHEET_COLLIDE) return Math.max(0, c + (t - SHEET_COLLIDE) * this.scale);
        return Math.max(0, t * (c / SHEET_COLLIDE));
    }

    enabled() {
        const st = settings.get();
        return !(st.sfxMuted || st.muted || st.sfxVolume === 0);
    }

    start() {
        try { this.voiceShout = this.voice.start(); } catch { this.voiceShout = false; } // 함성(효과음 큐 유무와 무관)
        let cues = null;
        try { { const all = this.scene.cache.json.get('cutscene_sfx_cues')?.cues; cues = all?.[this.group] ?? (this.group === 'gunner' ? all?.archer?.map((c) => (c.key === 'sfx_battle_arrow' ? { ...c, key: this.scene.cache.audio.exists('sfx_gun_volley') ? 'sfx_gun_volley' : c.key } : c)) : undefined); /* gunner 전용 큐가 없으면 궁병 큐의 화살음만 총성(sfx_gun_volley)으로 */ } } catch { cues = null; }
        if (!cues?.length || !this.enabled()) return;
        const ts = 1 / (settings.get().speed || 1); // 배속(축약 배율은 mapT 에서 반영)
        cues.forEach((cue) => {
            if (cue.when === 'defender_loses_troops' && !this.losesTroops) return;
            const start = this.mapT(cue.t ?? 0, cue.key);
            const at = start * 1000 * ts;
            this.timers.push(this.scene.time.delayedCall(at, () => this.fire(cue, ts, start)));
        });
        if (this.timers.length) { audio.duckPush(this, DUCK); this.ducked = true; } // 컷 중 BGM -6dB
    }

    fire(cue, ts, start = 0) {
        if (this.stopped) return;
        const sm = this.scene.sound;
        try {
            // 오디오 컨텍스트는 사용자 입력 뒤에만 열린다: 잠겨 있으면 resume 시도(Phaser 가 입력 시 unlock) 후 이번 큐는 건너뜀
            if (sm.locked || sm.context?.state === 'suspended') { sm.context?.resume?.(); if (sm.locked) return; }
            if (!this.scene.cache.audio.exists(cue.key)) return;
            const st = settings.get();
            let vol = (cue.vol ?? 0.6) * (st.sfxVolume ?? 1);
            if (this.counter && cue.key === 'sfx_battle_roar') vol *= 0.8;
            if (this.voiceShout && cue.key === 'sfx_battle_roar') vol *= 0.5; // 함성 재생 중: 기존 웅성은 바닥음으로
            const pan = (cue.pan ?? 0) * (this.counter ? -1 : 1);
            const rate = (cue.rate ?? 1) * (0.97 + Math.random() * 0.06);
            const snd = sm.add(cue.key, { loop: !!cue.loop, volume: Math.min(1, vol), rate, pan });
            this.sounds.add(snd);
            if (!cue.loop) snd.once('complete', () => this.kill(snd));
            snd.play();
            if (cue.loop) {
                const stopMs = Math.max(0, (this.mapT(cue.stopAt ?? SHEET_COLLIDE, cue.key) - start) * 1000 * ts);
                const fade = (cue.fadeOut ?? 0.1) * 1000;
                this.timers.push(this.scene.time.delayedCall(stopMs, () => {
                    if (this.stopped || !this.sounds.has(snd)) return;
                    this.tweens.push(this.scene.tweens.add({ targets: snd, volume: 0, duration: fade, onComplete: () => this.kill(snd) }));
                }));
            }
        } catch { /* 오디오 오류가 컷신을 막지 않는다 */ }
    }

    // 즉시 한 번 재생(충돌 피크·숫자 감소 타격음). 큐 JSON 과 별개로 FE 타이밍에 맞춘 보조음. 꺼짐/정지/잠금이면 생략
    oneShot(key, vol = 0.5, rate = 1) {
        if (this.stopped || !this.enabled()) return;
        const sm = this.scene.sound;
        try {
            if (sm.locked || !this.scene.cache.audio.exists(key)) return;
            const st = settings.get();
            const snd = sm.add(key, { volume: Math.min(1, vol * (st.sfxVolume ?? 1)), rate: rate * (0.97 + Math.random() * 0.06) });
            this.sounds.add(snd);
            snd.once('complete', () => this.kill(snd));
            snd.play();
        } catch { /* 무시 */ }
    }

    kill(snd) {
        this.sounds.delete(snd);
        try { snd.stop(); snd.destroy(); } catch { /* 이미 정리됨 */ }
    }

    stop() {
        if (this.stopped) return;
        this.stopped = true;
        try { this.voice.stop(); } catch { /* 무시 */ } // 컷 안 음성 60ms 페이드 정지(영웅 사망 음성 제외)
        this.timers.forEach((t) => { try { t.remove(false); } catch { /* 무시 */ } });
        this.tweens.forEach((t) => { try { t.remove(); } catch { /* 무시 */ } });
        [...this.sounds].forEach((s) => this.kill(s));
        this.timers = [];
        this.tweens = [];
        if (this.ducked) { audio.duckPop(this); this.ducked = false; } // 이 컷 몫만 해제(영웅 사망·결과창 덕킹 유지)
    }
}
