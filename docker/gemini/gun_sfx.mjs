// 총병 효과음 2종 코드 합성 WAV(22.05kHz mono 16bit, 결정적 RNG). 외부 소스·API 호출 없음(안아트 2026-11-03, gacha_sfx.mjs 와 같은 합성기).
//   sfx_gun_shot: 화승총 단발 폭음(0.9s)   sfx_gun_volley: 일제 연속 사격(1.6s, 5발 엇박)
// 실행: docker run --rm -v "$PWD":/app -w /app node:22 node docker/gemini/gun_sfx.mjs   (슬롯 정의 = docker/gemini/gun_audio_slots.json)
import { writeFileSync, mkdirSync } from 'node:fs';
const SR = 22050, OUT = 'public/assets/audio/sfx', TWO_PI = Math.PI * 2;
let seed = 20261105; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const buf = (dur) => new Float32Array(Math.ceil(dur * SR));
const wave = (type, ph) => { const p = ph - Math.floor(ph); return type === 'square' ? (p < 0.5 ? 1 : -1) : type === 'tri' ? 4 * Math.abs(p - 0.5) - 1 : Math.sin(TWO_PI * p); };
function tone(b, { start = 0, dur, f0, f1 = f0, type = 'sine', vol = 0.5, attack = 0.004, decay = 4 }) { const s0 = Math.floor(start * SR), n = Math.floor(dur * SR); let ph = 0; for (let i = 0; i < n && s0 + i < b.length; i++) { const t = i / n; ph += (f0 + (f1 - f0) * t) / SR; b[s0 + i] += wave(type, ph) * Math.min(1, (i / SR) / attack) * Math.exp(-decay * t) * vol; } }
function chime(b, { start = 0, dur = 0.5, f = 880, vol = 0.4, decay = 5 }) { [[1, 1], [2.01, 0.45], [3.02, 0.25]].forEach(([m, a]) => tone(b, { start, dur, f0: f * m, vol: vol * a, decay, attack: 0.002 })); }
// 필터 노이즈(1차 저역/고역 혼합): lp 0~1 (1 = 거의 원음)
function noise(b, { start = 0, dur, vol = 0.4, lp = 0.2, attack = 0.01, decay = 4, swell = false }) { const s0 = Math.floor(start * SR), n = Math.floor(dur * SR); let y = 0; for (let i = 0; i < n && s0 + i < b.length; i++) { const t = i / n; y += lp * (rnd() - y); const env = swell ? Math.sin(Math.PI * t) ** 1.5 : Math.min(1, (i / SR) / attack) * Math.exp(-decay * t); b[s0 + i] += y * env * vol; } }
const render = (dur, fn) => { const b = buf(dur); fn(b); return b; };
function shot(b, t0, vol = 1) { noise(b, { start: t0, dur: 0.05, vol: 0.9 * vol, lp: 0.95, decay: 18 }); tone(b, { start: t0, dur: 0.22, f0: 140, f1: 45, vol: 0.8 * vol, decay: 9 });
  noise(b, { start: t0 + 0.01, dur: 0.35, vol: 0.55 * vol, lp: 0.25, decay: 7 }); noise(b, { start: t0 + 0.05, dur: 0.6, vol: 0.18 * vol, lp: 0.08, decay: 4 }); }
const SFX = {
  sfx_gun_shot: () => render(0.9, (b) => { noise(b, { dur: 0.04, vol: 0.25, lp: 0.9, decay: 20 }); shot(b, 0.03, 1); }),
  sfx_gun_volley: () => render(1.6, (b) => { [0.0, 0.09, 0.16, 0.27, 0.35].forEach((t, i) => shot(b, t, [1, 0.8, 0.9, 0.75, 0.85][i])); noise(b, { start: 0.1, dur: 1.4, vol: 0.2, lp: 0.06, swell: true }); }),
};
function toWav(s) { const n = s.length, d = Buffer.alloc(44 + n * 2); d.write('RIFF', 0); d.writeUInt32LE(36 + n * 2, 4); d.write('WAVEfmt ', 8); d.writeUInt32LE(16, 16); d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22); d.writeUInt32LE(SR, 24); d.writeUInt32LE(SR * 2, 28); d.writeUInt16LE(2, 32); d.writeUInt16LE(16, 34); d.write('data', 36); d.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) d.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32767), 44 + i * 2); return d; }
mkdirSync(OUT, { recursive: true });
for (const [id, fn] of Object.entries(SFX)) { const s = fn(); let peak = 0; for (const v of s) peak = Math.max(peak, Math.abs(v)); const g = peak ? 0.85 / peak : 1; const fade = Math.floor(0.006 * SR); for (let i = 0; i < s.length; i++) { s[i] *= g; if (i > s.length - fade) s[i] *= (s.length - i) / fade; } const w = toWav(s); writeFileSync(`${OUT}/${id}.wav`, w); console.log(`${id}.wav ${w.length}B ${(s.length / SR).toFixed(2)}s peak=0.85`); }
