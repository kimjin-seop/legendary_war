// 대사 cue 효과음 2종 코드 합성 WAV(22.05kHz mono 16bit, 결정적 RNG). 외부 소스·API 호출 없음(안아트 2026-11-03, gacha_sfx.mjs 와 같은 합성기).
//   sfx_water_rise: ch11 물막이 둑이 터지며 물이 차오름(1.8s)   sfx_page_turn: ch999 종이 넘김(0.6s)
// 키 근거: database/data/ch11_goryeo_khitan.json, ch999_finale.json 의 cue 문자열. 슬롯 정의 = docker/gemini/story_audio_slots.json
// 실행: docker run --rm -v "$PWD":/app -w /app node:22 node docker/gemini/story_sfx.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
const SR = 22050, OUT = 'public/assets/audio/sfx', TWO_PI = Math.PI * 2;
let seed = 20261104; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const buf = (dur) => new Float32Array(Math.ceil(dur * SR));
const wave = (type, ph) => { const p = ph - Math.floor(ph); return type === 'square' ? (p < 0.5 ? 1 : -1) : type === 'tri' ? 4 * Math.abs(p - 0.5) - 1 : Math.sin(TWO_PI * p); };
function tone(b, { start = 0, dur, f0, f1 = f0, type = 'sine', vol = 0.5, attack = 0.004, decay = 4 }) { const s0 = Math.floor(start * SR), n = Math.floor(dur * SR); let ph = 0; for (let i = 0; i < n && s0 + i < b.length; i++) { const t = i / n; ph += (f0 + (f1 - f0) * t) / SR; b[s0 + i] += wave(type, ph) * Math.min(1, (i / SR) / attack) * Math.exp(-decay * t) * vol; } }
function chime(b, { start = 0, dur = 0.5, f = 880, vol = 0.4, decay = 5 }) { [[1, 1], [2.01, 0.45], [3.02, 0.25]].forEach(([m, a]) => tone(b, { start, dur, f0: f * m, vol: vol * a, decay, attack: 0.002 })); }
// 필터 노이즈(1차 저역/고역 혼합): lp 0~1 (1 = 거의 원음)
function noise(b, { start = 0, dur, vol = 0.4, lp = 0.2, attack = 0.01, decay = 4, swell = false }) { const s0 = Math.floor(start * SR), n = Math.floor(dur * SR); let y = 0; for (let i = 0; i < n && s0 + i < b.length; i++) { const t = i / n; y += lp * (rnd() - y); const env = swell ? Math.sin(Math.PI * t) ** 1.5 : Math.min(1, (i / SR) / attack) * Math.exp(-decay * t); b[s0 + i] += y * env * vol; } }
const render = (dur, fn) => { const b = buf(dur); fn(b); return b; };
const SFX = {
  // 둑 터짐 -> 물이 쏟아져 차오름: 낮은 쿵 + 저역 우르릉 상승 + 넓은 물살 노이즈 부풀림 + 끝 물보라
  sfx_water_rise: () => render(1.8, (b) => { tone(b, { dur: 0.45, f0: 90, f1: 45, vol: 0.8, decay: 5 }); noise(b, { dur: 0.3, vol: 0.5, lp: 0.12, decay: 7 });
    tone(b, { start: 0.1, dur: 1.6, f0: 48, f1: 75, type: 'tri', vol: 0.35, attack: 0.3, decay: 1.2 }); noise(b, { start: 0.12, dur: 1.65, vol: 0.55, lp: 0.18, swell: true });
    noise(b, { start: 0.3, dur: 1.4, vol: 0.3, lp: 0.55, swell: true }); for (let k = 0; k < 6; k++) noise(b, { start: 0.9 + k * 0.12, dur: 0.08, vol: 0.18, lp: 0.9, decay: 10 }); }),
  // 종이 한 장 넘김: 들어 올림 스침 -> 넘어가는 바람 -> 끝 톡(가벼운 착지)
  sfx_page_turn: () => render(0.6, (b) => { noise(b, { dur: 0.12, vol: 0.35, lp: 0.7, swell: true }); noise(b, { start: 0.08, dur: 0.36, vol: 0.5, lp: 0.45, swell: true });
    noise(b, { start: 0.42, dur: 0.06, vol: 0.45, lp: 0.95, decay: 14 }); tone(b, { start: 0.43, dur: 0.08, f0: 320, f1: 220, vol: 0.12, decay: 10 }); }),
};
function toWav(s) { const n = s.length, d = Buffer.alloc(44 + n * 2); d.write('RIFF', 0); d.writeUInt32LE(36 + n * 2, 4); d.write('WAVEfmt ', 8); d.writeUInt32LE(16, 16); d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22); d.writeUInt32LE(SR, 24); d.writeUInt32LE(SR * 2, 28); d.writeUInt16LE(2, 32); d.writeUInt16LE(16, 34); d.write('data', 36); d.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) d.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32767), 44 + i * 2); return d; }
mkdirSync(OUT, { recursive: true });
for (const [id, fn] of Object.entries(SFX)) { const s = fn(); let peak = 0; for (const v of s) peak = Math.max(peak, Math.abs(v)); const g = peak ? 0.85 / peak : 1; const fade = Math.floor(0.006 * SR); for (let i = 0; i < s.length; i++) { s[i] *= g; if (i > s.length - fade) s[i] *= (s.length - i) / fade; } const w = toWav(s); writeFileSync(`${OUT}/${id}.wav`, w); console.log(`${id}.wav ${w.length}B ${(s.length / SR).toFixed(2)}s peak=0.85`); }
