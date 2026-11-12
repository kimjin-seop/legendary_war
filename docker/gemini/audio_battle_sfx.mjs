// 교전 컷신 전용 효과음 8종을 코드로 합성해 WAV(22.05kHz, mono, 16bit)로 렌더링. 외부 소스·원작 오디오 샘플·API 호출 없음.
// 실행: node docker/gemini/audio_battle_sfx.mjs   (결정적 RNG: 재실행해도 동일 결과)
// 타임라인 근거: 참고 영상 교전 컷 12회 객관 수치(ffmpeg 구간 RMS) -> 진입 0.0s 즉시 +8dB 상승(어택 <=0.3s), 1.0~1.25s 플래토,
//   1.25~1.5s 충돌 피크(+9dB), 2.0~2.5s 감쇠. 우리 컷신: 진입 0.25 -> 이동/발사 1.2 -> 충돌 1.0 -> 유지 1.2.
// 생성 슬롯: sfx_battle_roar / charge / clash / arrow / magic / fall / gallop / wing
import { writeFileSync, mkdirSync } from 'node:fs';

const SR = 22050, OUT = 'public/assets/audio/sfx', TWO_PI = Math.PI * 2;
const PEAK = 0.8; // -1.94 dBFS (요구: -1dBFS 이하)

// ---- 결정적 난수 ----
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mk = (dur) => new Float32Array(Math.ceil(dur * SR));
const lerp = (a, b, t) => a + (b - a) * t;

// ---- 바이쿼드 필터 ----
function coefs(type, f, Q = 0.707) {
  const w = TWO_PI * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q); let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al; return [b0 / a0, b1 / a0, b2 / a0, -2 * c / a0, (1 - al) / a0];
}
function filt(x, type, f, Q) { const [b0, b1, b2, a1, a2] = coefs(type, f, Q); const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
// 중심주파수가 시간에 따라 변하는 밴드패스(64샘플 블록마다 계수 갱신)
function sweepBP(x, fa, fb, Q) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, k = [0, 0, 0, 0, 0]; for (let i = 0; i < x.length; i++) { if (i % 64 === 0) k = coefs('bp', lerp(fa, fb, i / x.length), Q); const v = k[0] * x[i] + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
function white(n, r) { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = r() * 2 - 1; return x; }
// 믹스(wrap=true면 루프용 순환 가산)
function add(dst, src, start, g = 1, wrap = false) { const s0 = Math.round(start * SR); for (let i = 0; i < src.length; i++) { let j = s0 + i; if (wrap) j %= dst.length; else if (j >= dst.length) break; if (j >= 0) dst[j] += src[i] * g; } }
const expEnv = (n, tau) => { const e = new Float32Array(n); for (let i = 0; i < n; i++) e[i] = Math.exp(-(i / SR) / tau); return e; };
const mul = (x, e) => { for (let i = 0; i < x.length; i++) x[i] *= e[i]; return x; };
function sine(dur, f0, f1, tau, vol, attack = 0.002) { const n = Math.ceil(dur * SR), y = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { ph += lerp(f0, f1, 1 - Math.exp(-6 * i / n)) / SR; y[i] = Math.sin(TWO_PI * ph) * vol * Math.exp(-(i / SR) / tau) * Math.min(1, i / SR / attack); } return y; }
function noiseBurst(r, dur, tau, type, f, Q, vol) { const n = Math.ceil(dur * SR); const x = filt(white(n, r), type, f, Q); return mul(x, expEnv(n, tau)).map((v) => v * vol); }
function metal(dur, f, tau, vol, ratios = [1, 2.76, 5.4, 8.93]) { const n = Math.ceil(dur * SR), y = new Float32Array(n); ratios.forEach((m, k) => { const fr = f * m; if (fr > 9500) return; const a = vol / (1 + k * 0.7), ta = tau / (1 + k * 0.5); let ph = 0; for (let i = 0; i < n; i++) { ph += fr / SR; y[i] += Math.sin(TWO_PI * ph) * a * Math.exp(-(i / SR) / ta) * Math.min(1, i / SR / 0.0008); } }); return y; }

// 모음(포먼트) 유사 음성: 합성 성문원(배음 합) -> 포먼트 3개 병렬 밴드패스
const VOWEL = { ah: [730, 1090, 2440], oh: [570, 840, 2410], eh: [530, 1840, 2480], oo: [310, 870, 2250] };
function voice(r, dur, f0fn, vowelA, vowelB, env, vol = 1) {
  const n = Math.ceil(dur * SR), src = new Float32Array(n); let ph = 0, walk = 0;
  const vibF = 4.5 + r() * 2, vibA = 0.006 + r() * 0.01, vphi = r() * TWO_PI;
  for (let i = 0; i < n; i++) {
    const t = i / SR; walk += (r() - 0.5) * 0.0009; walk *= 0.9995;
    const f = f0fn(t / dur) * (1 + walk + vibA * Math.sin(TWO_PI * vibF * t + vphi));
    ph += f / SR; let s = 0; const H = Math.min(28, Math.floor(3800 / f));
    for (let h = 1; h <= H; h++) s += Math.sin(TWO_PI * h * ph) / h;
    src[i] = s * env(t, dur);
  }
  const out = new Float32Array(n);
  const mid = [0, 1, 2].map((k) => lerp(VOWEL[vowelA][k], VOWEL[vowelB][k], 0.5));
  [[mid[0], 7, 1], [mid[1], 9, 0.55], [mid[2], 12, 0.3]].forEach(([fc, Q, a]) => { const y = filt(src, 'bp', fc * (0.97 + r() * 0.06), Q); for (let i = 0; i < n; i++) out[i] += y[i] * a * Q * 0.12; });
  return out.map((v) => v * vol);
}

// ---- 1) 군중 함성 ----
function roar() {
  const r = rng(7001), D = 2.0, b = mk(D);
  const G = (t) => { const a = Math.min(1, t / 0.32); const att = a * a * (3 - 2 * a); const dec = t < 1.15 ? 1 : Math.exp(-(t - 1.15) * 2.6); return att * dec; };
  const vows = Object.keys(VOWEL);
  for (let v = 0; v < 28; v++) {
    const base = 95 + r() * 85, delay = r() * 0.28, dur = 1.35 + r() * 0.5, va = vows[Math.floor(r() * 3)], vb = vows[Math.floor(r() * 4)];
    const rise = 0.1 + r() * 0.12, droop = 0.06 + r() * 0.1;
    const f0 = (u) => base * (1 + rise * Math.min(1, u * 5) * (1 - u) - droop * u);
    const env = (t, d) => Math.min(1, t / 0.06) * Math.min(1, (d - t) / 0.25);
    add(b, voice(r, dur, f0, va, vb, env, 0.5 + r() * 0.5), delay, 1 / 9);
  }
  // 호흡/소음 성분(고역 비율: 영상 플래토 고역/중역 약 -1.5dB 근처를 목표로 중고역 노이즈)
  const nz = filt(filt(white(b.length, r), 'bp', 3200, 0.4), 'hp', 1500, 0.7);
  for (let i = 0; i < nz.length; i++) b[i] += nz[i] * G(i / SR) * 0.16;
  // 홀 반사
  const o = Float32Array.from(b); [[0.031, 0.35], [0.057, 0.25], [0.089, 0.16]].forEach(([d, g]) => add(b, o, d, g));
  for (let i = 0; i < b.length; i++) b[i] *= G(i / SR);
  return b;
}

// ---- 2) 질주 발소리 + 갑옷 루프(1.0s, 순환 렌더) ----
function charge() {
  const r = rng(7002), b = mk(1.0), steps = 6;
  for (let k = 0; k < steps; k++) {
    const t = k / steps + (r() - 0.5) * 0.012;
    for (let s = 0; s < 7; s++) {
      const tt = t + (r() - 0.5) * 0.04, g = 0.5 + r() * 0.5;
      add(b, sine(0.1, 120 + r() * 30, 55, 0.03, 0.55 * g), tt, 1, true);
      add(b, noiseBurst(r, 0.07, 0.02, 'lp', 700 + r() * 500, 0.7, 0.9 * g), tt, 1, true);
    }
    for (let j = 0; j < 9; j++) add(b, noiseBurst(r, 0.14, 0.035 + r() * 0.04, 'bp', 2500 + r() * 3800, 5, 1.0), t + 0.01 + r() * 0.1, 0.16 + r() * 0.12, true);
  }
  add(b, noiseBurst(r, 1.0, 5, 'bp', 3200, 1.2, 0.5), 0, 0.03, true); // 갑옷 러스틀 저음량 바닥
  return b;
}

// ---- 3) 충돌: 금속 + 둔탁한 타격 ----
function clash() {
  const r = rng(7003), b = mk(1.1);
  [[0, 1900, 0.5], [0.085, 1500, 0.4], [0.17, 2200, 0.45], [0.29, 1750, 0.9]].forEach(([t, f, g], i) => {
    add(b, noiseBurst(r, 0.05, 0.012, 'hp', 1400, 0.7, 1), t, 0.7 * g);
    add(b, metal(0.7, f * (0.97 + r() * 0.06), 0.28, 0.5), t, g);
    add(b, metal(0.5, f * 0.62, 0.18, 0.3, [1, 2.4, 4.1]), t + 0.004, g * 0.8);
    if (i < 3) add(b, sine(0.08, 200, 90, 0.025, 0.4), t, g);
  });
  add(b, sine(0.45, 150, 45, 0.11, 0.95), 0.29);               // 둔탁한 타격
  add(b, noiseBurst(r, 0.12, 0.03, 'lp', 520, 0.7, 1.1), 0.29, 0.9);
  add(b, noiseBurst(r, 0.1, 0.03, 'bp', 700, 1.5, 1.0), 0.292, 0.7); // 방패/나무 갈라짐
  return b;
}

// ---- 4) 화살 일제사격 ----
function arrow() {
  const r = rng(7004), b = mk(1.3);
  for (let i = 0; i < 7; i++) add(b, sine(0.14, 190 + r() * 60, 180, 0.04, 0.5, 0.001), r() * 0.12, 0.6); // 활시위
  for (let i = 0; i < 7; i++) add(b, noiseBurst(r, 0.05, 0.012, 'bp', 1100, 2, 0.8), r() * 0.12, 0.5);
  for (let i = 0; i < 12; i++) {
    const st = 0.08 + r() * 0.45, d = 0.35 + r() * 0.2, n = Math.ceil(d * SR), w = sweepBP(white(n, r), 3600 + r() * 800, 1300 + r() * 400, 2.2);
    for (let j = 0; j < n; j++) { const u = j / n; w[j] *= Math.sin(Math.PI * Math.pow(u, 0.7)) ** 2; }
    add(b, w, st, 0.7);
    const hit = st + d * 0.92 + 0.03 + r() * 0.05;
    add(b, noiseBurst(r, 0.05, 0.012, 'bp', 1300, 1.5, 0.9), hit, 0.6);
    add(b, sine(0.07, 160, 80, 0.02, 0.5), hit, 0.7);
    add(b, noiseBurst(r, 0.03, 0.006, 'hp', 2500, 0.7, 0.6), hit, 0.3); // 방패에 박히는 틱
  }
  return b;
}

// ---- 5) 마법 시전 ----
function magic() {
  const r = rng(7005), D = 1.6, b = mk(D), n = b.length;
  for (const m of [1, 1.5, 2, 3.01]) { let ph = 0, ph2 = 0; for (let i = 0; i < n; i++) { const t = i / SR, u = Math.min(1, t / 0.95); const f = 200 * m * Math.pow(2.2, u * u); ph += f / SR; ph2 += (f * 1.004) / SR; const env = t < 0.95 ? u * u : Math.exp(-(t - 0.95) * 6); b[i] += (Math.sin(TWO_PI * ph) + Math.sin(TWO_PI * ph2)) * env * 0.11 / Math.sqrt(m) * (0.8 + 0.2 * Math.sin(TWO_PI * 11 * t)); } }
  const sh = filt(white(n, r), 'hp', 4800, 0.7); for (let i = 0; i < n; i++) { const t = i / SR, g = Math.max(0, Math.sin(TWO_PI * 23 * t + Math.sin(t * 40))); b[i] += sh[i] * g * 0.2 * (t < 0.95 ? t / 0.95 : Math.exp(-(t - 0.95) * 4)); }
  add(b, sweepBP(white(Math.ceil(0.55 * SR), r), 6500, 700, 1.4).map((v, i, a) => v * Math.exp(-(i / SR) * 5) * 1.6), 0.95);
  add(b, sine(0.5, 110, 55, 0.15, 0.7, 0.004), 0.95);
  [1318.5, 1975.5, 2637].forEach((f, k) => add(b, metal(0.6, f, 0.22, 0.12, [1, 2.01]), 0.95 + k * 0.03));
  return b;
}

// ---- 6) 병사 격파: 짧은 신음(비명 아님) + 갑옷 쓰러지는 소리. 잔혹 표현 없음 ----
function fall() {
  const r = rng(7006), b = mk(0.95);
  const env = (t, d) => Math.min(1, t / 0.015) * Math.exp(-t * 7) * Math.min(1, (d - t) / 0.05);
  add(b, voice(r, 0.28, (u) => lerp(210, 120, u), 'ah', 'oh', env, 1.0), 0.0, 0.12);
  add(b, voice(r, 0.28, (u) => lerp(150, 95, u), 'oh', 'oo', env, 1.0), 0.01, 0.09);
  [0.17, 0.25, 0.33, 0.43, 0.55].forEach((t, k) => add(b, noiseBurst(r, 0.2, 0.05 + r() * 0.04, 'bp', 2600 + r() * 3500, 6, 1), t + r() * 0.03, 0.45 / (1 + k * 0.35)));
  add(b, sine(0.35, 95, 42, 0.09, 0.9), 0.3);
  add(b, noiseBurst(r, 0.1, 0.03, 'lp', 400, 0.7, 1), 0.3, 0.7);
  return b;
}

// ---- 7) 기병 질주 루프(1.0s) ----
function gallop() {
  const r = rng(7007), b = mk(1.0), cycles = 2, pat = [0, 0.105, 0.2, 0.31];
  for (let c = 0; c < cycles; c++) pat.forEach((p, k) => {
    const t = c * 0.5 + p;
    for (let h = 0; h < 4; h++) {
      const tt = t + (r() - 0.5) * 0.03, g = (k === 3 ? 1 : 0.7) * (0.6 + r() * 0.4);
      add(b, noiseBurst(r, 0.06, 0.016, 'bp', 800 + r() * 300, 1.8, 1), tt, 0.9 * g, true);
      add(b, sine(0.07, 260 + r() * 40, 120, 0.02, 0.6), tt, 0.7 * g, true);
      add(b, sine(0.05, 520 + r() * 60, 300, 0.012, 0.25), tt, 0.5 * g, true);
    }
    for (let j = 0; j < 5; j++) add(b, noiseBurst(r, 0.12, 0.04, 'bp', 3000 + r() * 3000, 6, 1), t + r() * 0.08, 0.12, true);
  });
  return b;
}

// ---- 8) 비행 유닛 날갯짓 ----
function wing() {
  const r = rng(7008), D = 1.0, b = mk(D);
  for (let k = 0; k < 6; k++) {
    const t = 0.02 + k * 0.145 + (r() - 0.5) * 0.01, d = 0.2, n = Math.ceil(d * SR), w = sweepBP(white(n, r), 350, 1100, 0.9);
    for (let j = 0; j < n; j++) { const u = j / n; w[j] *= Math.sin(Math.PI * u) ** 1.5; }
    add(b, w, t, 1.3 * (0.8 + r() * 0.2) * (1 - k * 0.04));
    add(b, noiseBurst(r, 0.1, 0.02, 'lp', 300, 0.7, 0.6), t + 0.03, 0.2);
  }
  for (let i = 0; i < b.length; i++) b[i] *= Math.min(1, (D - i / SR) / 0.15);
  return b;
}

// ---- 9) 충돌 직전 저음 상승(0.35s): 0~0.09s 상승(30->85Hz) 정점 0.09s, 이후 감쇠. 큐 t=충돌-0.1이면 정점이 충돌 직전 ----
function rumble() {
  const r = rng(7009), D = 0.35, b = mk(D), n = b.length, PK = 0.09; let ph = 0, ph2 = 0;
  const env = (t) => (t < PK ? Math.pow(t / PK, 2.2) : Math.exp(-(t - PK) / 0.07));
  for (let i = 0; i < n; i++) { const t = i / SR, f = t < PK ? lerp(30, 85, t / PK) : lerp(85, 45, Math.min(1, (t - PK) / 0.26)); ph += f / SR; ph2 += (f * 0.5) / SR; b[i] = (Math.sin(TWO_PI * ph) * 0.8 + Math.sin(TWO_PI * ph2) * 0.3) * env(t); }
  const nz = filt(filt(white(n, r), 'lp', 160, 0.7), 'lp', 160, 0.7);
  for (let i = 0; i < n; i++) b[i] += nz[i] * 3.0 * env(i / SR);
  for (let i = 0; i < n; i++) b[i] = Math.tanh(b[i] * 1.8) / Math.tanh(1.8); // 소형 스피커용 배음(2·3차) 부여
  return b;
}
// ---- 10) 병력 감소 틱(0.12s): 가벼운 금속 탭 + 가죽 둔탁음. 반복 시 playbackRate 0.94~1.06 변주 전제 ----
function tick() {
  const r = rng(7010), b = mk(0.12);
  add(b, noiseBurst(r, 0.03, 0.005, 'bp', 2200, 1.2, 1), 0, 0.6);
  add(b, metal(0.1, 2600, 0.022, 0.35, [1, 2.76, 3.9]), 0, 1);
  add(b, noiseBurst(r, 0.06, 0.014, 'bp', 380, 1.3, 1), 0.002, 1.1);
  add(b, sine(0.05, 190, 120, 0.015, 0.5), 0.002);
  return b;
}

// ---- 11) 불(봉수·불 구덩이, 1.8s): 0~0.3s 점화 훅(대역 노이즈 상승) + 저음 붕 + 불길 웅웅(저역 노이즈 느린 요동) + 장작 탁탁(짧은 고역 팝, 뒤로 갈수록 드묾). 2막 sfx_fire(안아트 2026-11-03) ----
function fire() {
  const r = rng(7011), D = 1.8, b = mk(D), n = b.length;
  add(b, sweepBP(white(Math.ceil(0.42 * SR), r), 280, 2200, 1.1).map((v, i) => v * Math.min(1, i / SR / 0.26) * Math.exp(-Math.max(0, i / SR - 0.26) * 9) * 1.5), 0);
  add(b, sine(0.45, 95, 48, 0.16, 0.55, 0.01), 0.22);
  const body = filt(filt(white(n, r), 'lp', 520, 0.7), 'hp', 70, 0.7);
  for (let i = 0; i < n; i++) { const t = i / SR, env = Math.min(1, Math.max(0, (t - 0.12) / 0.25)) * (t < 1.0 ? 1 : Math.exp(-(t - 1.0) * 2.6)); b[i] += body[i] * env * 1.6 * (0.75 + 0.25 * Math.sin(TWO_PI * 3.1 * t) * Math.sin(TWO_PI * 1.3 * t + 1)); }
  let t = 0.18;
  while (t < D - 0.06) {
    const g = t < 1.0 ? 1 : Math.exp(-(t - 1.0) * 2.2);
    add(b, noiseBurst(r, 0.025, 0.004 + r() * 0.006, 'hp', 1800 + r() * 2500, 0.7, 1), t, (0.25 + r() * 0.35) * g);
    if (r() < 0.35) add(b, noiseBurst(r, 0.04, 0.01, 'bp', 600 + r() * 500, 1.5, 1), t + 0.002, 0.35 * g);
    t += 0.03 + r() * (t < 1.0 ? 0.09 : 0.18);
  }
  return b;
}

const SFX = {
  sfx_battle_roar: { fn: roar, loop: false },
  sfx_battle_charge: { fn: charge, loop: true },
  sfx_battle_clash: { fn: clash, loop: false },
  sfx_battle_arrow: { fn: arrow, loop: false },
  sfx_battle_magic: { fn: magic, loop: false },
  sfx_battle_fall: { fn: fall, loop: false },
  sfx_battle_gallop: { fn: gallop, loop: true },
  sfx_battle_wing: { fn: wing, loop: false },
  sfx_battle_rumble: { fn: rumble, loop: false },
  sfx_battle_tick: { fn: tick, loop: false },
  sfx_fire: { fn: fire, loop: false },
};
// 인자로 키를 주면 해당 키만 렌더(예: node ... sfx_battle_rumble sfx_battle_tick)
const ONLY = process.argv.slice(2);
if (ONLY.length) for (const k of Object.keys(SFX)) if (!ONLY.includes(k)) delete SFX[k];

function toWav(s) { const n = s.length, d = Buffer.alloc(44 + n * 2); d.write('RIFF', 0); d.writeUInt32LE(36 + n * 2, 4); d.write('WAVEfmt ', 8); d.writeUInt32LE(16, 16); d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22); d.writeUInt32LE(SR, 24); d.writeUInt32LE(SR * 2, 28); d.writeUInt16LE(2, 32); d.writeUInt16LE(16, 34); d.write('data', 36); d.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) d.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32767), 44 + i * 2); return d; }

mkdirSync(OUT, { recursive: true });
for (const [id, { fn, loop }] of Object.entries(SFX)) {
  const s = fn();
  let dc = 0; for (const v of s) dc += v; dc /= s.length; for (let i = 0; i < s.length; i++) s[i] -= dc;
  let peak = 0; for (const v of s) peak = Math.max(peak, Math.abs(v));
  const g = peak ? PEAK / peak : 1; let sq = 0;
  const fin = Math.floor(0.002 * SR), fout = Math.floor(0.012 * SR);
  for (let i = 0; i < s.length; i++) { s[i] *= g; if (!loop) { if (i < fin) s[i] *= i / fin; if (i > s.length - fout) s[i] *= (s.length - i) / fout; } sq += s[i] * s[i]; }
  const wav = toWav(s); writeFileSync(`${OUT}/${id}.wav`, wav);
  console.log(`${id}.wav ${wav.length}B ${(s.length / SR).toFixed(2)}s peak=${(20 * Math.log10(PEAK)).toFixed(2)}dBFS rms=${(20 * Math.log10(Math.sqrt(sq / s.length))).toFixed(1)}dBFS loop=${loop}`);
}
