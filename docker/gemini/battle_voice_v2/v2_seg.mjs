// raw/*.wav -> 무음 기준 분할 -> seg/<id>_<k>.wav (22.05kHz) + 조각별 측정 표
import { readdirSync } from 'node:fs';
import { SR, readWav, writeWav, split, resample, qa, medF0 } from '../battle_voice/bv_dsp.mjs';
const D = 'docker/gemini/battle_voice_v2';
const rows = {};
for (const f of readdirSync(`${D}/raw`).filter((f) => f.endsWith('.wav')).sort()) {
  const id = f.slice(0, -4); const { x, sr } = readWav(`${D}/raw/${f}`);
  split(x, sr, { thr: -40, gap: 0.15, minDur: 0.08, pad: 0.02 }).forEach((c, k) => { const y = resample(c, sr, SR); writeWav(`${D}/seg/${id}_${k}.wav`, y); const q = qa(y); rows[`${id}_${k}`] = { s: q.seconds, pk: q.peakDbfs, rms: q.activeRmsDb, f0: medF0(y) }; });
}
console.table(rows);
