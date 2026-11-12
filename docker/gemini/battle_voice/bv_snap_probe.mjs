// 단말마 원본 조각 측정(분할 결과 길이·f0·어택·에너지 분포). 실행: node docker/gemini/battle_voice/bv_snap_probe.mjs
import { mkdirSync } from 'node:fs';
import { SR, readWav, writeWav, split, resample, filt, peak, medF0 } from './bv_dsp.mjs';
const D = 'docker/gemini/battle_voice'; mkdirSync(`${D}/seg_snap`, { recursive: true });
for (const id of ['k1', 'k2', 'k3', 'hk1', 'hk2', 'hkf', 'hkf2']) {
  const { x, sr } = readWav(`${D}/raw/${id}.wav`);
  split(x, sr, { thr: -38, gap: 0.12, minDur: 0.1 }).forEach((c0, k) => {
    const c = filt(resample(c0, sr, SR), 'hp', 90); writeWav(`${D}/seg_snap/${id}_${k}.wav`, c);
    const W = Math.round(SR * 0.01), env = []; for (let o = 0; o + W <= c.length; o += W) { let e = 0; for (let i = o; i < o + W; i++) e += c[i] * c[i]; env.push(10 * Math.log10(e / W + 1e-12)); }
    const mx = Math.max(...env), ia = env.findIndex((v) => v > mx - 6), lastLoud = env.length - 1 - [...env].reverse().findIndex((v) => v > mx - 12);
    console.log(`${id}_${k}`.padEnd(7), (c.length / SR).toFixed(2) + 's', 'pk', (20 * Math.log10(peak(c))).toFixed(1), 'f0', Math.round(medF0(c)), 'att', ia * 10 + 'ms', 'loud~', lastLoud * 10 + 'ms', 'env', env.filter((_, i) => i % 5 === 0).map((v) => Math.round(v - mx)).join(','));
  });
}
