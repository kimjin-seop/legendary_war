// 2026-11-08 단말마(짧고 날카로운 사망 비명) 재제작: 병사 사망 sfx_bv_die_1~8, 영웅 사망 sfx_bv_hero_fall_m1/m2/f1 교체.
// 원본: Gemini TTS(gemini-2.5-pro-preview-tts) 짧은 지시형 발성 raw/k*.wav, hk*.wav (bv_jobs.mjs k1~k3, hk1, hk2, hkf2). 기존 게임 음원 샘플·모방 없음.
// 처리: 상대 임계 앞자르기(즉시 어택) -> 어택 강조 -> 음정 곡선(위로 터졌다 급하강, 가변 리샘플) -> 거친 질감(포화+후반 떨림)
//       -> 길이 컷 + 급속 초크(숨 끊김) + 짧은 성문 노이즈 -> 잔향 없음 -> 정규화(소프트 리미터, 피크 상한 -1.5dBFS)
// 실행: node docker/gemini/battle_voice/bv_snap.mjs            (미리듣기 out_snap/ 만)
//       FORCE=1 node docker/gemini/battle_voice/bv_snap.mjs    (public/assets/audio/sfx 덮어쓰기 + bv_audio_slots.json·manifest.json 해당 키 메타 갱신)
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { SR, readWav, writeWav, split, resample, filt, normalize, qa, rng, peak, activeRmsDb } from './bv_dsp.mjs';

const DIR = 'docker/gemini/battle_voice', OUT = 'public/assets/audio/sfx', PREV = `${DIR}/out_snap`;
mkdirSync(PREV, { recursive: true });
const FORCE = !!process.env.FORCE;
const seg = {};
for (const id of ['k1', 'k2', 'k3', 'hk1', 'hk2', 'hkf2']) { const { x, sr } = readWav(`${DIR}/raw/${id}.wav`); split(x, sr, { thr: -38, gap: 0.12, minDur: 0.1 }).forEach((c, k) => { seg[`${id}_${k}`] = filt(resample(c, sr, SR), 'hp', 90); }); }

// 상대 임계 앞자르기: 최대 10ms 에너지 -14dB 에 처음 닿는 창 4ms 앞에서 시작(들숨·완만한 시작 제거 -> 즉시 어택)
function snapStart(x, rel = 14) { const W = Math.round(SR * 0.01), e = []; for (let o = 0; o + W <= x.length; o += W) { let s = 0; for (let i = o; i < o + W; i++) s += x[i] * x[i]; e.push(10 * Math.log10(s / W + 1e-12)); } const mx = Math.max(...e), k = e.findIndex((v) => v > mx - rel); return x.slice(Math.max(0, k * W - Math.round(SR * 0.004))); }
// 음정 곡선: 입력 진행률 p 에 따른 재생 속도. 0~rise 구간 1 -> up, 이후 end 까지 하강(급하강일수록 pow 작게)
function contour(x, { base = 1, up = 0.1, rise = 0.16, end = 0.82, curve = 0.7 }) {
  const out = []; let pos = 0;
  while (pos < x.length - 1) { const p = pos / x.length; const r = base * (p < rise ? 1 + up * (p / rise) : (1 + up) - ((1 + up) - end) * Math.pow((p - rise) / (1 - rise), curve)); const k = Math.floor(pos), f = pos - k; out.push(x[k] * (1 - f) + x[k + 1] * f); pos += r; }
  return Float32Array.from(out);
}
function grit(x, { drive = 2.6, wet = 0.35, fry = 0.25, fryHz = 30 }, q) {
  const n = x.length, y = new Float32Array(n), p = peak(x) || 1, t0 = Math.tanh(drive), hz = fryHz * (0.9 + q() * 0.2);
  for (let i = 0; i < n; i++) { const u = i / n, v = x[i] / p, sat = Math.tanh(drive * v) / t0; const am = 1 - fry * Math.pow(u, 1.3) * (0.5 + 0.5 * Math.sin(2 * Math.PI * hz * i / SR + q() * 0.4)); y[i] = ((1 - wet) * v + wet * sat) * am * p; }
  return y;
}
// 길이 컷 + 초크: 끝 chokeS 동안 (1-t)^3 급감, 초크 시작점에 성문 노이즈(숨 끊김 'hk') 짧게
function choke(x, L, chokeS, q, breath = 0.18) {
  const n = Math.min(x.length, Math.round(L * SR)), y = x.slice(0, n), c = Math.round(chokeS * SR), s = n - c;
  for (let i = s; i < n; i++) y[i] *= Math.pow(1 - (i - s) / c, 3);
  const bn = Math.round(0.03 * SR), b = new Float32Array(bn), p = peak(y); for (let i = 0; i < bn; i++) b[i] = (q() * 2 - 1) * Math.exp(-i / SR / 0.008) * Math.min(1, i / (SR * 0.002));
  const bf = filt(filt(b, 'bp', 2200, 1.2), 'hp', 900); const bp = peak(bf) || 1; const at = Math.max(0, s - Math.round(0.006 * SR));
  for (let i = 0; i < bn && at + i < n; i++) y[at + i] += bf[i] / bp * p * breath;
  return y;
}
// 몸통 기울기: 시작 0dB -> 끝 -decDb 선형(dB) 감쇠. 앞이 터지고 뒤로 꺼지는 단말마 모양(크레셴도 방지)
const tilt = (x, decDb) => x.map((v, i) => v * 10 ** (-decDb * (i / x.length) / 20));
function attack(x, boostDb = 3.5, tau = 0.035) { const g = 10 ** (boostDb / 20) - 1; return x.map((v, i) => v * (1 + g * Math.exp(-i / SR / tau))); }
function finish(x, target) { let y = filt(filt(x, 'lp', 9000), 'hp', 120); y = normalize(y, target, 0.84); const a = Math.round(0.002 * SR); for (let i = 0; i < a; i++) y[i] *= i / a; const z = Math.round(0.004 * SR); for (let i = 0; i < z; i++) y[y.length - 1 - i] *= i / z; return y; }

function soldier(src, o, seed) { const q = rng(seed); let y = snapStart(seg[src], o.startDb ?? 14); y = attack(y); y = contour(y, o); y = tilt(y, o.decDb ?? 5); y = grit(y, { wet: o.wet ?? 0.35, fry: o.fry ?? 0.25 }, q); y = choke(y, o.L, o.chokeS ?? 0.05, q, o.breath ?? 0.18); return finish(y, -15); }
function hero(src, o, seed) {
  const q = rng(seed); const m = tilt(contour(attack(snapStart(seg[src], o.startDb ?? 14), 4.5, 0.05), o), o.decDb ?? 6);
  const dbl = tilt(contour(snapStart(seg[src], o.startDb ?? 14), { ...o, base: o.base * 0.93 }), o.decDb ?? 6); // 같은 발성 낮은 겹(두께, 잔향 없음)
  const n = m.length, y = new Float32Array(n), d = Math.round(0.011 * SR); for (let i = 0; i < n; i++) y[i] = m[i] + (i >= d && i - d < dbl.length ? dbl[i - d] * 0.38 : 0);
  return finish(choke(grit(y, { drive: 3.2, wet: 0.42, fry: 0.3, fryHz: 26 }, q), o.L, o.chokeS ?? 0.07, q, 0.22), -14);
}

// 병사 8변형: 서로 다른 목소리·조각 + 피치(base)·길이(L)·급하강 정도 차이(풀에서 섞어 재생 시 반복 피로 감소)
const SOLDIER = [
  ['sfx_bv_die_1', 'k2_2', { base: 1.0, up: 0.12, end: 0.80, L: 0.42 }],
  ['sfx_bv_die_2', 'k2_3', { base: 0.96, up: 0.10, end: 0.78, L: 0.48 }],
  ['sfx_bv_die_3', 'k2_5', { base: 1.04, up: 0.14, end: 0.82, L: 0.46, startDb: 6 }],
  ['sfx_bv_die_4', 'k3_0', { base: 1.06, up: 0.12, end: 0.80, L: 0.40, curve: 0.6 }],
  ['sfx_bv_die_5', 'k3_2', { base: 0.98, up: 0.10, end: 0.76, L: 0.46 }],
  ['sfx_bv_die_6', 'k3_4', { base: 1.04, up: 0.16, end: 0.72, L: 0.47, chokeS: 0.05, startDb: 9, decDb: 9, curve: 0.55 }] /* 자동판정 groan -> 짧게·급하강 강화 */,
  ['sfx_bv_die_7', 'k3_5', { base: 0.94, up: 0.14, end: 0.78, L: 0.50 }],
  ['sfx_bv_die_8', 'hk1_0', { base: 1.08, up: 0.10, end: 0.84, L: 0.36, chokeS: 0.04 }],
];
const HERO = [
  ['sfx_bv_hero_fall_m1', 'hk2_0', { base: 0.92, up: 0.12, rise: 0.2, end: 0.80, L: 0.82, curve: 0.8 }, '남성 영웅·지휘관 사망 외침(짧고 큰 단말마)'],
  ['sfx_bv_hero_fall_m2', 'k3_3', { base: 0.92, up: 0.12, rise: 0.18, end: 0.78, L: 0.9, curve: 0.8, startDb: 9, decDb: 7 }, '남성 영웅·지휘관 사망 외침(짧고 큰 단말마, 낮은 목소리)'],
  ['sfx_bv_hero_fall_f1', 'hkf2_0', { base: 1.0, up: 0.08, rise: 0.18, end: 0.82, L: 0.82, curve: 0.8, decDb: 9 }, '여성 영웅·지휘관 사망 외침(짧고 큰 단말마)'],
];
const SRC = 'Gemini TTS(gemini-2.5-pro-preview-tts) 짧은 무언어 단말마 발성 -> docker/gemini/battle_voice/bv_snap.mjs 앞자르기·음정 곡선·거친 질감·초크·정규화';
const res = {};
const put = (key, y, meta) => { writeWav(`${PREV}/${key}.wav`, y); if (FORCE) writeWav(`${OUT}/${key}.wav`, y); res[key] = { ...meta, qa: qa(y) }; };
SOLDIER.forEach(([key, src, o], i) => put(key, soldier(src, o, 1108 + i), { src, usage: '컷 안 병사 1명 쓰러짐(사망) 단말마' }));
HERO.forEach(([key, src, o, usage], i) => put(key, hero(src, o, 2108 + i), { src, usage }));

// 파형 특성: 어택(시작~최대 -6dB 도달), 최대 에너지 위치, 마지막 50ms 평균 레벨(최대 대비), f0 앞/뒤(음정 하강 확인)
function shape(x) { const W = Math.round(SR * 0.01), e = []; for (let o = 0; o + W <= x.length; o += W) { let s = 0; for (let i = o; i < o + W; i++) s += x[i] * x[i]; e.push(10 * Math.log10(s / W + 1e-12)); } const mx = Math.max(...e); return { attackMs: e.findIndex((v) => v > mx - 6) * 10, peakAtMs: e.indexOf(mx) * 10, last50dB: +(e.slice(-5).reduce((a, b) => a + b, 0) / 5 - mx).toFixed(1) }; }
function f0At(x, a, b) { const s = x.slice(Math.round(a * x.length), Math.round(b * x.length)); const W = Math.round(SR * 0.03); let best = 0, bl = 0; const o = Math.max(0, Math.floor(s.length / 2 - W)); for (let l = Math.round(SR / 1000); l <= Math.round(SR / 80); l++) { let c = 0, n1 = 0, n2 = 0; for (let i = o; i < o + W && i + l < s.length; i++) { c += s[i] * s[i + l]; n1 += s[i] * s[i]; n2 += s[i + l] * s[i + l]; } c /= Math.sqrt(n1 * n2) + 1e-12; if (c > best) { best = c; bl = l; } } return bl ? Math.round(SR / bl) : 0; }
const table = {};
for (const [k, r] of Object.entries(res)) { const { x } = readWav(`${PREV}/${k}.wav`); table[k] = { src: r.src, ...r.qa, ...shape(x), f0early: f0At(x, 0.1, 0.35), f0late: f0At(x, 0.6, 0.85) }; }
console.table(table);

if (FORCE) {
  const slotsP = `${DIR}/bv_audio_slots.json`, slots = JSON.parse(readFileSync(slotsP, 'utf8'));
  const manP = 'public/assets/audio/manifest.json', man = JSON.parse(readFileSync(manP, 'utf8'));
  for (const [k, r] of Object.entries(res)) {
    const bytes = statSync(`${OUT}/${k}.wav`).size;
    const patch = { bytes, approxSeconds: r.qa.seconds, usage: r.usage, source: `${SRC} (조각 ${r.src})`, qa: { ...r.qa, clipping: r.qa.clippedSamples ? 'yes' : 'none', listening: 'UNVERIFIED(사람 청취 전)' }, verify: true };
    slots[k] = { ...slots[k], ...patch };
    if (man.slots[k]) man.slots[k] = { ...man.slots[k], ...patch };
  }
  writeFileSync(slotsP, JSON.stringify(slots, null, 2)); writeFileSync(manP, JSON.stringify(man, null, 2) + '\n');
  console.log('public 덮어쓰기 + 슬롯/manifest 메타 갱신 완료');
}
