// 추가 효과음 6종(ui_hover, 튜토리얼 5종) 코드 합성 WAV(22.05kHz mono 16bit). 외부 소스·API 호출 없음.
// 실행: docker run --rm -v "$PWD":/app -w /app node:22 node docker/gemini/sfx_extra.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
const SR = 22050, OUT = 'public/assets/audio/sfx', TWO_PI = Math.PI * 2;
const buf = (dur) => new Float32Array(Math.ceil(dur * SR));
const wave = (type, ph) => { const p = ph - Math.floor(ph); return type === 'square' ? (p < 0.5 ? 1 : -1) : type === 'tri' ? 4 * Math.abs(p - 0.5) - 1 : Math.sin(TWO_PI * p); };
function tone(b, { start = 0, dur, f0, f1 = f0, type = 'sine', vol = 0.5, attack = 0.004, decay = 4 }) { const s0 = Math.floor(start * SR), n = Math.floor(dur * SR); let ph = 0; for (let i = 0; i < n && s0 + i < b.length; i++) { const t = i / n; ph += (f0 + (f1 - f0) * t) / SR; b[s0 + i] += wave(type, ph) * Math.min(1, (i / SR) / attack) * Math.exp(-decay * t) * vol; } }
function chime(b, { start = 0, dur = 0.5, f = 880, vol = 0.4, decay = 5 }) { [[1, 1], [2.01, 0.45], [3.02, 0.25]].forEach(([m, a]) => tone(b, { start, dur, f0: f * m, vol: vol * a, decay, attack: 0.002 })); }
const render = (dur, fn) => { const b = buf(dur); fn(b); return b; };
const SFX = {
  sfx_ui_hover: () => render(0.05, (b) => tone(b, { dur: 0.04, f0: 1900, f1: 2100, type: 'sine', vol: 0.18, decay: 7 })),
  sfx_tut_msg_tick: () => render(0.04, (b) => tone(b, { dur: 0.03, f0: 2400, type: 'square', vol: 0.12, decay: 8 })),
  sfx_tut_next: () => render(0.2, (b) => { tone(b, { dur: 0.08, f0: 880, type: 'tri', vol: 0.35, decay: 4 }); tone(b, { start: 0.07, dur: 0.13, f0: 1174.7, type: 'tri', vol: 0.35, decay: 5 }); }),
  sfx_tut_success: () => render(0.6, (b) => [523.25, 659.25, 783.99].forEach((f, i) => chime(b, { start: i * 0.09, f, dur: 0.4, vol: 0.3, decay: 4 }))),
  sfx_tut_fail: () => render(0.5, (b) => { tone(b, { dur: 0.2, f0: 330, f1: 300, type: 'tri', vol: 0.35, decay: 3 }); tone(b, { start: 0.18, dur: 0.3, f0: 247, f1: 220, type: 'tri', vol: 0.35, decay: 4 }); }),
  sfx_tut_complete: () => render(1.4, (b) => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(b, { start: i * 0.1, dur: 0.22, f0: f, type: 'tri', vol: 0.35, decay: 4 })); chime(b, { start: 0.45, f: 1046.5, dur: 0.9, vol: 0.35, decay: 3 }); chime(b, { start: 0.5, f: 1568, dur: 0.8, vol: 0.18, decay: 3.5 }); }),
};
function toWav(s) { const n = s.length, d = Buffer.alloc(44 + n * 2); d.write('RIFF', 0); d.writeUInt32LE(36 + n * 2, 4); d.write('WAVEfmt ', 8); d.writeUInt32LE(16, 16); d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22); d.writeUInt32LE(SR, 24); d.writeUInt32LE(SR * 2, 28); d.writeUInt16LE(2, 32); d.writeUInt16LE(16, 34); d.write('data', 36); d.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) d.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32767), 44 + i * 2); return d; }
mkdirSync(OUT, { recursive: true });
for (const [id, fn] of Object.entries(SFX)) { const s = fn(); let peak = 0; for (const v of s) peak = Math.max(peak, Math.abs(v)); const g = peak ? 0.85 / peak : 1; const fade = Math.floor(0.004 * SR); for (let i = 0; i < s.length; i++) { s[i] *= g; if (i > s.length - fade) s[i] *= (s.length - i) / fade; } const w = toWav(s); writeFileSync(`${OUT}/${id}.wav`, w); console.log(`${id}.wav ${w.length}B ${(s.length / SR).toFixed(2)}s peak=0.85`); }
