// 효과음 24종을 코드로 합성해 WAV(22.05kHz, mono, 16bit)로 렌더링. 외부 소스·저작권 이슈 없음, API 호출 없음.
// 실행: docker run --rm -v "$PWD":/app -w /app node:22 node docker/gemini/generate_sfx.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const SR = 22050;
const OUT = 'public/assets/audio/sfx';
const TWO_PI = Math.PI * 2;

// ---- 합성 도구 ----
const buf = (dur) => new Float32Array(Math.ceil(dur * SR));
function wave(type, ph) {
  const p = ph - Math.floor(ph);
  if (type === 'square') return p < 0.5 ? 1 : -1;
  if (type === 'saw') return 2 * p - 1;
  if (type === 'tri') return 4 * Math.abs(p - 0.5) - 1;
  return Math.sin(TWO_PI * p);
}
// 주파수 슬라이드(f0->f1) 오실레이터 + 어택/지수 감쇠 엔벨로프
function tone(b, { start = 0, dur, f0, f1 = f0, type = 'sine', vol = 0.5, attack = 0.004, decay = 4, vib = 0 }) {
  const s0 = Math.floor(start * SR), n = Math.floor(dur * SR); let ph = 0;
  for (let i = 0; i < n && s0 + i < b.length; i++) {
    const t = i / n, f = (f0 + (f1 - f0) * t) * (1 + vib * Math.sin(TWO_PI * 6 * i / SR));
    ph += f / SR;
    const env = Math.min(1, (i / SR) / attack) * Math.exp(-decay * t);
    b[s0 + i] += wave(type, ph) * env * vol;
  }
}
// 노이즈 버스트(1차 로우패스 cutoff 0~1, 클수록 밝음), 감쇠
function noise(b, { start = 0, dur, vol = 0.5, lp = 0.3, decay = 5, attack = 0.002, sweep = 0 }) {
  const s0 = Math.floor(start * SR), n = Math.floor(dur * SR); let y = 0; let seed = 12345 + s0;
  for (let i = 0; i < n && s0 + i < b.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0; const w = (seed / 4294967296) * 2 - 1;
    const t = i / n, a = Math.min(1, Math.max(0.01, lp + sweep * t)); y += a * (w - y);
    b[s0 + i] += y * Math.min(1, (i / SR) / attack) * Math.exp(-decay * t) * vol;
  }
}
// 벨/차임: 정수배+비정수배 부분음의 합
function chime(b, { start = 0, dur = 0.5, f = 880, vol = 0.4, decay = 5 }) {
  [[1, 1], [2.01, 0.45], [3.02, 0.25], [4.2, 0.12]].forEach(([m, a]) => tone(b, { start, dur, f0: f * m, vol: vol * a, decay, attack: 0.002 }));
}
function render(dur, fn) { const b = buf(dur); fn(b); return b; }

const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };

const SFX = {
  sfx_ui_tap: () => render(0.07, (b) => tone(b, { dur: 0.06, f0: 1400, f1: 1100, type: 'square', vol: 0.25, decay: 6 })),
  sfx_ui_confirm: () => render(0.25, (b) => { tone(b, { dur: 0.1, f0: 660, type: 'tri', vol: 0.45, decay: 3 }); tone(b, { start: 0.09, dur: 0.16, f0: 990, type: 'tri', vol: 0.45, decay: 4 }); }),
  sfx_ui_cancel: () => render(0.22, (b) => { tone(b, { dur: 0.09, f0: 520, type: 'tri', vol: 0.4, decay: 3 }); tone(b, { start: 0.08, dur: 0.13, f0: 340, type: 'tri', vol: 0.4, decay: 5 }); }),
  sfx_move_step: () => render(0.12, (b) => { noise(b, { dur: 0.1, vol: 0.5, lp: 0.12, decay: 9 }); tone(b, { dur: 0.08, f0: 130, f1: 80, vol: 0.4, decay: 8 }); }),
  sfx_hit_normal: () => render(0.3, (b) => { noise(b, { dur: 0.15, vol: 0.7, lp: 0.5, decay: 8 }); tone(b, { dur: 0.22, f0: 220, f1: 70, type: 'tri', vol: 0.6, decay: 6 }); }),
  sfx_hit_crit: () => render(0.55, (b) => { noise(b, { dur: 0.3, vol: 0.9, lp: 0.7, decay: 6 }); tone(b, { dur: 0.4, f0: 320, f1: 50, type: 'saw', vol: 0.5, decay: 5 }); tone(b, { dur: 0.3, f0: 2200, f1: 700, type: 'square', vol: 0.18, decay: 7 }); chime(b, { start: 0.02, f: 1760, dur: 0.4, vol: 0.2, decay: 6 }); }),
  sfx_hit_weak: () => render(0.2, (b) => { noise(b, { dur: 0.1, vol: 0.4, lp: 0.2, decay: 9 }); tone(b, { dur: 0.15, f0: 160, f1: 100, type: 'tri', vol: 0.35, decay: 7 }); }),
  sfx_hit_resist: () => render(0.45, (b) => { noise(b, { dur: 0.05, vol: 0.5, lp: 0.9, decay: 10 }); [900, 1370, 1860, 2430].forEach((f, i) => tone(b, { dur: 0.4, f0: f, vol: 0.28 / (i + 1) ** 0.5, decay: 8, attack: 0.001 })); }),
  sfx_counter: () => render(0.45, (b) => { noise(b, { dur: 0.2, vol: 0.5, lp: 0.15, sweep: 0.7, decay: 1.5 }); noise(b, { start: 0.18, dur: 0.15, vol: 0.7, lp: 0.55, decay: 8 }); tone(b, { start: 0.18, dur: 0.22, f0: 260, f1: 80, type: 'tri', vol: 0.55, decay: 6 }); }),
  sfx_unit_down: () => render(0.9, (b) => { tone(b, { dur: 0.8, f0: 420, f1: 55, type: 'saw', vol: 0.35, decay: 3.5 }); noise(b, { dur: 0.5, vol: 0.3, lp: 0.2, decay: 4 }); }),
  sfx_aura_pulse: () => render(0.9, (b) => { tone(b, { dur: 0.85, f0: 220, f1: 330, vol: 0.35, decay: 2.2, attack: 0.15, vib: 0.01 }); tone(b, { dur: 0.85, f0: 440, f1: 660, vol: 0.2, decay: 2.5, attack: 0.15 }); chime(b, { start: 0.3, f: 1320, dur: 0.5, vol: 0.12, decay: 4 }); }),
  sfx_skill_cutin: () => render(0.7, (b) => { noise(b, { dur: 0.45, vol: 0.5, lp: 0.05, sweep: 0.8, decay: 0.8 }); tone(b, { dur: 0.45, f0: 300, f1: 1800, type: 'saw', vol: 0.22, decay: 1, attack: 0.02 }); [N.C5, N.E5, N.G5].forEach((f) => tone(b, { start: 0.42, dur: 0.28, f0: f, type: 'square', vol: 0.18, decay: 4 })); }),
  sfx_skill_hit: () => render(0.7, (b) => { noise(b, { dur: 0.45, vol: 0.9, lp: 0.45, decay: 5 }); tone(b, { dur: 0.5, f0: 420, f1: 60, type: 'saw', vol: 0.4, decay: 4 }); chime(b, { start: 0.05, f: 1568, dur: 0.5, vol: 0.2, decay: 5 }); }),
  sfx_turn_player: () => render(0.45, (b) => { tone(b, { dur: 0.18, f0: N.G5, type: 'square', vol: 0.22, decay: 3 }); tone(b, { start: 0.15, dur: 0.28, f0: N.C6, type: 'square', vol: 0.22, decay: 4 }); }),
  sfx_turn_enemy: () => render(0.55, (b) => { tone(b, { dur: 0.22, f0: 220, type: 'saw', vol: 0.3, decay: 3 }); tone(b, { start: 0.2, dur: 0.33, f0: 165, type: 'saw', vol: 0.3, decay: 4 }); }),
  sfx_exp_tick: () => render(0.05, (b) => tone(b, { dur: 0.04, f0: 1800, type: 'sine', vol: 0.3, decay: 6 })),
  sfx_levelup: () => render(1.2, (b) => { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(b, { start: i * 0.11, dur: 0.2, f0: f, type: 'tri', vol: 0.4, decay: 4 })); chime(b, { start: 0.45, f: N.C6, dur: 0.75, vol: 0.4, decay: 3 }); chime(b, { start: 0.45, f: N.G6, dur: 0.75, vol: 0.2, decay: 3.5 }); }),
  sfx_cost_up: () => render(0.55, (b) => [N.A5, 1174.7, N.G6].forEach((f, i) => tone(b, { start: i * 0.1, dur: 0.18, f0: f, type: 'square', vol: 0.2, decay: 4 }))),
  sfx_gacha_reveal_n: () => render(0.5, (b) => chime(b, { f: 880, dur: 0.45, vol: 0.4, decay: 5 })),
  sfx_gacha_reveal_r: () => render(0.7, (b) => { chime(b, { f: 880, dur: 0.5, vol: 0.35, decay: 4 }); chime(b, { start: 0.12, f: 1174.7, dur: 0.55, vol: 0.35, decay: 4 }); }),
  sfx_gacha_reveal_sr: () => render(1.1, (b) => { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => chime(b, { start: i * 0.1, f, dur: 0.6, vol: 0.28, decay: 3.5 })); noise(b, { start: 0.3, dur: 0.6, vol: 0.12, lp: 0.9, decay: 3 }); }),
  sfx_gacha_reveal_ssr: () => render(1.9, (b) => {
    noise(b, { dur: 0.7, vol: 0.35, lp: 0.05, sweep: 0.8, decay: 0.7 }); tone(b, { dur: 0.7, f0: 250, f1: 1500, type: 'saw', vol: 0.15, decay: 1, attack: 0.05 });
    [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) => chime(b, { start: 0.65 + i * 0.09, f, dur: 1.0, vol: 0.28, decay: 2.5 }));
    [N.C5, N.G5, N.C6].forEach((f) => tone(b, { start: 0.7, dur: 1.1, f0: f, type: 'tri', vol: 0.2, decay: 2 })); noise(b, { start: 0.7, dur: 1.0, vol: 0.12, lp: 0.95, decay: 2.5 });
  }),
  sfx_victory: () => render(2.2, (b) => {
    const seq = [[N.C5, 0, 0.14], [N.C5, 0.16, 0.14], [N.C5, 0.32, 0.14], [N.G5, 0.5, 0.35], [N.E5, 0.88, 0.2], [N.G5, 1.1, 0.2], [N.C6, 1.35, 0.8]];
    seq.forEach(([f, s, d]) => { tone(b, { start: s, dur: d + 0.1, f0: f, type: 'square', vol: 0.2, decay: 2.5 }); tone(b, { start: s, dur: d + 0.1, f0: f / 2, type: 'tri', vol: 0.25, decay: 2.5 }); });
    chime(b, { start: 1.35, f: N.C6, dur: 0.8, vol: 0.25, decay: 2.5 });
  }),
  sfx_defeat: () => render(2.4, (b) => {
    const seq = [[N.A4, 0, 0.4], [N.G4, 0.45, 0.4], [N.F4, 0.9, 0.4], [N.E4, 1.35, 0.9]];
    seq.forEach(([f, s, d]) => { tone(b, { start: s, dur: d + 0.15, f0: f, type: 'tri', vol: 0.4, decay: 2.2 }); tone(b, { start: s, dur: d + 0.15, f0: f / 2, type: 'saw', vol: 0.12, decay: 2.2 }); });
  }),
};

function toWav(samples) {
  const n = samples.length, data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return data;
}

mkdirSync(OUT, { recursive: true });
const PEAK_TARGET = 0.85; // 클리핑 방지
for (const [id, fn] of Object.entries(SFX)) {
  const s = fn();
  let peak = 0, sq = 0; for (const v of s) { peak = Math.max(peak, Math.abs(v)); sq += v * v; }
  const g = peak > 0 ? PEAK_TARGET / peak : 1;
  const fade = Math.floor(0.004 * SR);
  for (let i = 0; i < s.length; i++) { s[i] *= g; if (i > s.length - fade) s[i] *= (s.length - i) / fade; }
  const wav = toWav(s); writeFileSync(`${OUT}/${id}.wav`, wav);
  console.log(`${id}.wav ${wav.length}B ${(s.length / SR).toFixed(2)}s peak=${PEAK_TARGET} rms=${(Math.sqrt(sq / s.length) * g).toFixed(3)}`);
}
