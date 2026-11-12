// 2026-11-09 사망 단말마 v2 빌드: seg/*.wav -> out/(미리듣기) + public/assets/audio/sfx/<key>.wav + manifest_fragment_v2.json
// 원칙(v1 과 차이): 가변 음정 곡선·떨림(AM)·포화·인공 숨소리 없음 = 원 발성 그대로. 처리는 앞자르기·길이 컷·급속 초크 페이드·대역 정리·정규화만. 잔향 없음(건조).
// 실행: node docker/gemini/battle_voice_v2/v2_build.mjs   (PUBLISH=1 이면 public 에도 기록. 기존 키 파일은 건드리지 않음)
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { SR, readWav, writeWav, filt, peak, activeRmsDb, qa } from '../battle_voice/bv_dsp.mjs';
const D = 'docker/gemini/battle_voice_v2', PUB = 'public/assets/audio/sfx';
mkdirSync(`${D}/out`, { recursive: true });
const PUBLISH = !!process.env.PUBLISH;
const env10 = (x) => { const W = Math.round(SR * 0.01), e = []; for (let o = 0; o + W <= x.length; o += W) { let s = 0; for (let i = o; i < o + W; i++) s += x[i] * x[i]; e.push(10 * Math.log10(s / W + 1e-12)); } return e; };
// 앞자르기: 최대 10ms 에너지 -rel dB 에 처음 닿는 창의 3ms 앞
function snap(x, rel = 20) { const e = env10(x), mx = Math.max(...e), k = e.findIndex((v) => v > mx - rel); return x.slice(Math.max(0, k * Math.round(SR * 0.01) - Math.round(SR * 0.003))); }
// 자연 끝: 최대 대비 -rel dB 아래로 내려간 마지막 창
function natEnd(x, rel = 40) { const e = env10(x), mx = Math.max(...e); let k = e.length - 1; while (k > 0 && e[k] < mx - rel) k--; return Math.min(x.length, (k + 1) * Math.round(SR * 0.01)); }
// 길이 컷 + 초크: 최대 L 초, 끝 chokeS 동안 (1-t)^2 급감(뚝 끊기는 단말마, 클릭 없음)
function cut(x, L, chokeS) { const n = Math.min(natEnd(x), Math.round(L * SR)); const y = x.slice(0, n); const c = Math.min(Math.round(chokeS * SR), n >> 1); for (let i = 0; i < c; i++) y[n - c + i] *= (1 - i / c) ** 2; const a = Math.round(0.002 * SR); for (let i = 0; i < a; i++) y[i] *= i / a; return y; }
// 정규화: 활성 RMS -> target, 단 리미터 진입량은 최대 2dB(과압축·찌그러짐 방지) -> 소프트 리미터 -> 피크 상한 -1.5dBFS
function norm(x, target) { let g = 10 ** ((target - activeRmsDb(x)) / 20); const p = peak(x) * g; const lim = 10 ** (2 / 20) * 0.84; if (p > lim) g *= lim / p; const y = x.map((v) => v * g); const knee = 0.75; for (let i = 0; i < y.length; i++) { const a = Math.abs(y[i]); if (a > knee) y[i] = Math.sign(y[i]) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee))); } const pk = peak(y); if (pk > 0.84) for (let i = 0; i < y.length; i++) y[i] *= 0.84 / pk; return y; }
function build(src, { L, chokeS = 0.045, rel = 20, target = -15, hp = 110 }) { let x = readWav(`${D}/seg/${src}.wav`).x; x = filt(filt(x, 'hp', hp), 'lp', 9500); return norm(cut(snap(x, rel), L, chokeS), target); }

const SET = [
  // 병사 사망(컷 안 개체 쓰러짐): 0.28~0.42s, 목소리 5종, 앞이 터지고 바로 꺼지는 조각만(최대 음량 위치 앞쪽)
  ['sfx_bv_die_v2_1', 'a4_0', { L: 0.40 }, 'die', 'Iapetus'],
  ['sfx_bv_die_v2_2', 'e3_0', { L: 0.40 }, 'die', 'Schedar'],
  ['sfx_bv_die_v2_3', 'e5_0', { L: 0.40 }, 'die', 'Algenib'],
  ['sfx_bv_die_v2_4', 'e2_0', { L: 0.42, chokeS: 0.06 }, 'die', 'Rasalgethi'],
  ['sfx_bv_die_v2_5', 'e4_0', { L: 0.40, chokeS: 0.06 }, 'die', 'Orus'],
  // 남성 영웅 사망 외침: 0.5~0.55s, 병사보다 크고 굵게
  ['sfx_bv_hero_fall_m_v2_1', 'b1_0', { L: 0.52, chokeS: 0.06, target: -13.5 }, 'hero_m', 'Alnilam'],
  ['sfx_bv_hero_fall_m_v2_2', 'b1_3', { L: 0.52, chokeS: 0.07, target: -13.5 }, 'hero_m', 'Alnilam'],
  ['sfx_bv_hero_fall_m_v2_3', 'b2_0', { L: 0.55, chokeS: 0.07, target: -13.5 }, 'hero_m', 'Charon'],
  // 여성 영웅 사망 외침
  ['sfx_bv_hero_fall_f_v2_1', 'c1_0', { L: 0.48, chokeS: 0.06, target: -14 }, 'hero_f', 'Zephyr'],
  ['sfx_bv_hero_fall_f_v2_2', 'c1_2', { L: 0.50, chokeS: 0.06, target: -14 }, 'hero_f', 'Zephyr'],
  ['sfx_bv_hero_fall_f_v2_3', 'f2_0', { L: 0.52, chokeS: 0.07, target: -14 }, 'hero_f', 'Leda'],
];
const SEL = process.env.SET ? JSON.parse(process.env.SET) : null; // 재선별 시 덮어쓰기용 {key:[src,opts]}
const frag = { _note: '2026-11-09 사망 단말마 v2 manifest 조각(안아트). 병합은 윤프론. 기존 sfx_bv_die_*/hero_fall_* 키는 그대로 둠. 사람 청취 UNVERIFIED', slots: {}, cuesPools: { die: [], hero_m: [], hero_f: [] } };
const table = {};
for (let [key, src, o, pool, voice] of SET) {
  if (SEL?.[key]) [src, o] = SEL[key];
  const y = build(src, o); writeWav(`${D}/out/${key}.wav`, y);
  let bytes = statSync(`${D}/out/${key}.wav`).size;
  if (PUBLISH) bytes = writeWav(`${PUB}/${key}.wav`, y);
  const q = qa(y), e = env10(y), mx = Math.max(...e);
  table[key] = { src, ...q, attackMs: e.findIndex((v) => v > mx - 6) * 10, peakAtMs: e.indexOf(mx) * 10, last30dB: +(e.slice(-3).reduce((a, b) => a + b, 0) / 3 - mx).toFixed(1) };
  frag.cuesPools[pool].push(key);
  frag.slots[key] = {
    type: 'sfx', path: `assets/audio/sfx/${key}.wav`, loop: false, volume: pool === 'die' ? 0.55 : 0.75, bytes, approxSeconds: q.seconds,
    category: pool === 'die' ? 'battle_voice.die' : 'battle_voice.hero',
    usage: pool === 'die' ? '컷 안 병사 1명 쓰러짐(즉사) 짧고 건조한 단말마 v2' : `${pool === 'hero_f' ? '여성' : '남성'} 영웅·지휘관 사망 외침(짧은 단말마) v2`,
    source: `Gemini TTS(gemini-2.5-pro-preview-tts, voice ${voice}) 무언어 단발 비명 -> docker/gemini/battle_voice_v2/v2_build.mjs 앞자르기·길이 컷·초크 페이드·대역 정리·정규화(음정·질감 가공 없음, 잔향 없음) (조각 ${src})`,
    license: '확인 필요(Google Gemini API 약관상 생성물 상업 이용 범위 확인, AI 생성 음성)', method: 'ai-generated+code-processing',
    qa: { ...q, clipping: q.clippedSamples ? 'yes' : 'none', listening: 'UNVERIFIED(사람 청취 전)' }, verify: true,
  };
}
console.table(table);
writeFileSync(`${D}/manifest_fragment_v2.json`, JSON.stringify(frag, null, 2) + '\n');
console.log(PUBLISH ? 'public 기록 + fragment 갱신' : '미리듣기 out/ + fragment 갱신(public 미기록)');
