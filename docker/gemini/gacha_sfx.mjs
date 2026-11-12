// 뽑기(역사책 소집) 연출 효과음 7종 코드 합성 WAV(22.05kHz mono 16bit, 결정적 RNG). 외부 소스·API 호출 없음(안아트-2, 2026-11-03).
// 실행: docker run --rm -v "$PWD":/app -w /app node:22 node docker/gemini/gacha_sfx.mjs   (슬롯 정의 = docker/gemini/gacha_audio_slots.json)
import { writeFileSync, mkdirSync } from 'node:fs';
const SR = 22050, OUT = 'public/assets/audio/sfx', TWO_PI = Math.PI * 2;
let seed = 20261103; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const buf = (dur) => new Float32Array(Math.ceil(dur * SR));
const wave = (type, ph) => { const p = ph - Math.floor(ph); return type === 'square' ? (p < 0.5 ? 1 : -1) : type === 'tri' ? 4 * Math.abs(p - 0.5) - 1 : Math.sin(TWO_PI * p); };
function tone(b, { start = 0, dur, f0, f1 = f0, type = 'sine', vol = 0.5, attack = 0.004, decay = 4 }) { const s0 = Math.floor(start * SR), n = Math.floor(dur * SR); let ph = 0; for (let i = 0; i < n && s0 + i < b.length; i++) { const t = i / n; ph += (f0 + (f1 - f0) * t) / SR; b[s0 + i] += wave(type, ph) * Math.min(1, (i / SR) / attack) * Math.exp(-decay * t) * vol; } }
function chime(b, { start = 0, dur = 0.5, f = 880, vol = 0.4, decay = 5 }) { [[1, 1], [2.01, 0.45], [3.02, 0.25]].forEach(([m, a]) => tone(b, { start, dur, f0: f * m, vol: vol * a, decay, attack: 0.002 })); }
// 필터 노이즈(1차 저역/고역 혼합): lp 0~1 (1 = 거의 원음)
function noise(b, { start = 0, dur, vol = 0.4, lp = 0.2, attack = 0.01, decay = 4, swell = false }) { const s0 = Math.floor(start * SR), n = Math.floor(dur * SR); let y = 0; for (let i = 0; i < n && s0 + i < b.length; i++) { const t = i / n; y += lp * (rnd() - y); const env = swell ? Math.sin(Math.PI * t) ** 1.5 : Math.min(1, (i / SR) / attack) * Math.exp(-decay * t); b[s0 + i] += y * env * vol; } }
const render = (dur, fn) => { const b = buf(dur); fn(b); return b; };
const SFX = {
  // 책 표지 열림: 낮은 나무·가죽 쿵 + 종이 바람
  sfx_gacha_book_open: () => render(0.9, (b) => { tone(b, { dur: 0.35, f0: 110, f1: 70, type: 'sine', vol: 0.7, decay: 6 }); noise(b, { dur: 0.25, vol: 0.5, lp: 0.08, decay: 8 }); noise(b, { start: 0.08, dur: 0.7, vol: 0.35, lp: 0.35, swell: true }); }),
  // 페이지 넘김 1장(짧은 종이 스침). 10연은 겹쳐 재생
  sfx_gacha_page_flip: () => render(0.28, (b) => { noise(b, { dur: 0.24, vol: 0.55, lp: 0.55, swell: true }); noise(b, { start: 0.15, dur: 0.06, vol: 0.4, lp: 0.9, decay: 12 }); }),
  // 빛이 차오름(등급 암시 전 상승음, 1.2s)
  sfx_gacha_light_rise: () => render(1.3, (b) => { tone(b, { dur: 1.25, f0: 220, f1: 660, type: 'tri', vol: 0.25, attack: 0.4, decay: 0.6 }); tone(b, { dur: 1.25, f0: 330, f1: 990, type: 'sine', vol: 0.18, attack: 0.5, decay: 0.6 }); noise(b, { dur: 1.25, vol: 0.18, lp: 0.6, swell: true }); }),
  // 인장 균열·파쇄(밀랍 깨짐)
  sfx_gacha_seal_break: () => render(0.6, (b) => { for (let k = 0; k < 5; k++) noise(b, { start: k * 0.035, dur: 0.05, vol: 0.6, lp: 0.95, decay: 14 }); tone(b, { start: 0.15, dur: 0.3, f0: 180, f1: 90, vol: 0.5, decay: 7 }); noise(b, { start: 0.16, dur: 0.4, vol: 0.35, lp: 0.4, decay: 6 }); }),
  // 팝 인(캐릭터가 책에서 튀어나옴): 바람 + 밝은 타격
  sfx_gacha_pop_in: () => render(0.7, (b) => { noise(b, { dur: 0.18, vol: 0.45, lp: 0.7, swell: true }); tone(b, { start: 0.14, dur: 0.2, f0: 160, f1: 60, vol: 0.8, decay: 8 }); chime(b, { start: 0.15, f: 1318.5, dur: 0.5, vol: 0.3, decay: 5 }); }),
  // 카드 슬라이드 인(옆 카드 등장)
  sfx_gacha_card_slide: () => render(0.3, (b) => { noise(b, { dur: 0.22, vol: 0.4, lp: 0.45, swell: true }); tone(b, { start: 0.18, dur: 0.08, f0: 1400, type: 'tri', vol: 0.2, decay: 9 }); }),
  // 신규 획득 배지 팅
  sfx_gacha_new: () => render(0.6, (b) => { chime(b, { f: 1568, dur: 0.25, vol: 0.35, decay: 6 }); chime(b, { start: 0.09, f: 2093, dur: 0.45, vol: 0.3, decay: 5 }); }),
};
function toWav(s) { const n = s.length, d = Buffer.alloc(44 + n * 2); d.write('RIFF', 0); d.writeUInt32LE(36 + n * 2, 4); d.write('WAVEfmt ', 8); d.writeUInt32LE(16, 16); d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22); d.writeUInt32LE(SR, 24); d.writeUInt32LE(SR * 2, 28); d.writeUInt16LE(2, 32); d.writeUInt16LE(16, 34); d.write('data', 36); d.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) d.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32767), 44 + i * 2); return d; }
mkdirSync(OUT, { recursive: true });
for (const [id, fn] of Object.entries(SFX)) { const s = fn(); let peak = 0; for (const v of s) peak = Math.max(peak, Math.abs(v)); const g = peak ? 0.85 / peak : 1; const fade = Math.floor(0.006 * SR); for (let i = 0; i < s.length; i++) { s[i] *= g; if (i > s.length - fade) s[i] *= (s.length - i) / fade; } const w = toWav(s); writeFileSync(`${OUT}/${id}.wav`, w); console.log(`${id}.wav ${w.length}B ${(s.length / SR).toFixed(2)}s peak=0.85`); }
