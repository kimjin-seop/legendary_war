// 전투 음성 후처리 공용 DSP(의존성 없음): WAV 입출력, 무음 분할, 리샘플(피치), 필터, 페이드, 정규화, QA 측정.
import { readFileSync, writeFileSync } from 'node:fs';
export const SR = 22050;
export function readWav(p) {
  const b = readFileSync(p); let o = 12, sr = 24000, ch = 1, data = null;
  while (o < b.length - 8) { const id = b.toString('ascii', o, o + 4), n = b.readUInt32LE(o + 4); if (id === 'fmt ') { ch = b.readUInt16LE(o + 10); sr = b.readUInt32LE(o + 12); } if (id === 'data') { data = b.subarray(o + 8, o + 8 + n); break; } o += 8 + n + (n & 1); }
  const n = data.length / 2 / ch, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2 * ch) / 32768; return { x, sr };
}
export function writeWav(p, x, sr = SR) {
  const pcm = Buffer.alloc(x.length * 2); for (let i = 0; i < x.length; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(p, Buffer.concat([h, pcm])); return 44 + pcm.length;
}
// 선형 보간 리샘플: ratio>1 이면 높고 짧아짐(피치 변형)
export function resample(x, srIn, srOut, ratio = 1) { const step = (srIn / srOut) * ratio, n = Math.floor(x.length / step), y = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i * step, k = Math.floor(t), f = t - k; y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? 0) * f; } return y; }
function coefs(type, f, Q = 0.707) { const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q); let b0, b1, b2; if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; } const a0 = 1 + al; return [b0 / a0, b1 / a0, b2 / a0, -2 * c / a0, (1 - al) / a0]; }
export function filt(x, type, f, Q) { const [b0, b1, b2, a1, a2] = coefs(type, f, Q); const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
// 무음 기준 분할: 20ms RMS 가 thr(dBFS) 이하가 gap 초 이상 이어지면 경계. 최소 길이 minDur 미만은 버림
export function split(x, sr, { thr = -38, gap = 0.28, minDur = 0.12, pad = 0.03 } = {}) {
  const W = Math.round(sr * 0.02), nW = Math.floor(x.length / W), on = [];
  for (let w = 0; w < nW; w++) { let s = 0; for (let i = w * W; i < (w + 1) * W; i++) s += x[i] * x[i]; on.push(10 * Math.log10(s / W + 1e-12) > thr); }
  const segs = []; let st = -1, last = -1;
  for (let w = 0; w < nW; w++) { if (on[w]) { if (st < 0) st = w; last = w; } else if (st >= 0 && (w - last) * 0.02 >= gap) { segs.push([st, last]); st = -1; } }
  if (st >= 0) segs.push([st, last]);
  return segs.map(([a, b]) => [Math.max(0, a * W - Math.round(pad * sr)), Math.min(x.length, (b + 1) * W + Math.round(pad * sr))]).filter(([a, b]) => (b - a) / sr >= minDur).map(([a, b]) => x.slice(a, b));
}
export function fades(x, inS = 0.004, outS = 0.04, sr = SR) { const a = Math.round(inS * sr), b = Math.round(outS * sr); for (let i = 0; i < a && i < x.length; i++) x[i] *= i / a; for (let i = 0; i < b && i < x.length; i++) x[x.length - 1 - i] *= (i / b) ** 2; return x; }
export function hardFadeTail(x, fromS, sr = SR) { const s = Math.round(fromS * sr); for (let i = s; i < x.length; i++) x[i] *= Math.max(0, 1 - (i - s) / (x.length - s)) ** 1.5; return x; }
export const peak = (x) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
export const rmsDb = (x) => { let s = 0; for (const v of x) s += v * v; return 10 * Math.log10(s / x.length + 1e-12); };
// 활성 구간 RMS(-50dB 이상 20ms 창 평균) - 무음 꼬리에 끌리지 않는 음량 지표
export function activeRmsDb(x, sr = SR) { const W = Math.round(sr * 0.02); let s = 0, n = 0; for (let o = 0; o + W <= x.length; o += W) { let e = 0; for (let i = o; i < o + W; i++) e += x[i] * x[i]; e /= W; if (10 * Math.log10(e + 1e-12) > -50) { s += e; n++; } } return n ? 10 * Math.log10(s / n) : -99; }
// 음량 정규화: 활성 RMS 를 target dB 로, 소프트 리미터(tanh) 후 피크 상한 ceil(선형)
export function normalize(x, target = -16, ceil = 0.84) { const g = 10 ** ((target - activeRmsDb(x)) / 20); const y = x.map((v) => v * g); const knee = 0.7; for (let i = 0; i < y.length; i++) { const a = Math.abs(y[i]); if (a > knee) y[i] = Math.sign(y[i]) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee))); } const p = peak(y); if (p > ceil) for (let i = 0; i < y.length; i++) y[i] *= ceil / p; return y; }
export function trimTail(x, thr = -55, sr = SR) { const W = Math.round(sr * 0.01); let end = x.length; for (let o = x.length - W; o > 0; o -= W) { let e = 0; for (let i = o; i < o + W; i++) e += x[i] * x[i]; if (10 * Math.log10(e / W + 1e-12) > thr) { end = Math.min(x.length, o + W * 2); break; } } return x.slice(0, end); }
export function mix(len, layers, sr = SR) { const y = new Float32Array(Math.ceil(len * sr)); for (const { x, at = 0, g = 1 } of layers) { const s0 = Math.round(at * sr); for (let i = 0; i < x.length && s0 + i < y.length; i++) if (s0 + i >= 0) y[s0 + i] += x[i] * g; } return y; }
// 간이 공간감(짧은 피드백 콤 4개 병렬): 군중을 한 덩어리로 묶는다
export function room(x, wet = 0.18, sr = SR) { const ds = [0.029, 0.037, 0.043, 0.051].map((d) => Math.round(d * sr)); const y = Float32Array.from(x); for (const d of ds) { const buf = new Float32Array(x.length); for (let i = 0; i < x.length; i++) buf[i] = x[i] + (i >= d ? buf[i - d] * 0.55 : 0); for (let i = 0; i < x.length; i++) y[i] += buf[i] * wet / ds.length; } return y; }
export function qa(x, sr = SR) {
  const p = peak(x), clip = x.reduce((n, v) => n + (Math.abs(v) >= 0.999 ? 1 : 0), 0);
  const W = Math.round(sr * 0.01); let lead = 0; for (let o = 0; o + W <= x.length; o += W) { let e = 0; for (let i = o; i < o + W; i++) e += x[i] * x[i]; if (10 * Math.log10(e / W + 1e-12) > -50) break; lead += 0.01; }
  let tail = 0; for (let o = x.length - W; o > 0; o -= W) { let e = 0; for (let i = o; i < o + W; i++) e += x[i] * x[i]; if (10 * Math.log10(e / W + 1e-12) > -50) break; tail += 0.01; }
  return { seconds: +(x.length / sr).toFixed(3), peakDbfs: +(20 * Math.log10(p + 1e-12)).toFixed(2), activeRmsDb: +activeRmsDb(x, sr).toFixed(1), clippedSamples: clip, leadSilenceS: +lead.toFixed(2), tailSilenceS: +tail.toFixed(2) };
}
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// 유성 구간 기본주파수 중앙값(Hz, 자기상관). 남성 함성·비명 선별용(과도하게 높은 날카로운 조각 제외)
export function medF0(x, sr = SR) {
  const W = Math.round(sr * 0.04), f0s = [];
  for (let o = 0; o + W * 2 < x.length; o += Math.round(W / 2)) {
    let e = 0; for (let i = o; i < o + W; i++) e += x[i] * x[i]; if (10 * Math.log10(e / W + 1e-12) < -35) continue;
    let best = 0, bl = 0; for (let l = Math.round(sr / 900); l <= Math.round(sr / 70); l++) { let c = 0, n1 = 0, n2 = 0; for (let i = o; i < o + W; i++) { c += x[i] * x[i + l]; n1 += x[i] * x[i]; n2 += x[i + l] * x[i + l]; } c /= Math.sqrt(n1 * n2) + 1e-12; if (c > best) { best = c; bl = l; } }
    if (best > 0.5) f0s.push(sr / bl);
  }
  f0s.sort((a, b) => a - b); return f0s[Math.floor(f0s.length / 2)] ?? 0;
}
