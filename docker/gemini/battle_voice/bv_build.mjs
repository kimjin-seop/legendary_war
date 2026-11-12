// 전투 음성 최종 클립 빌드: raw TTS 발성(Gemini TTS, bv_gen.mjs) 분할 조각 + 코드 합성(말 울음) -> 레이어링·피치 변형·정규화 -> public/assets/audio/sfx/sfx_bv_*.wav
// 실행: node docker/gemini/battle_voice/bv_build.mjs   (결정적 RNG, 기존 파일 덮어쓰기 금지: 같은 이름이 있으면 FORCE=1 일 때만)
// 출력: 22.05kHz mono 16bit WAV(기존 sfx 규칙), 슬롯 정의 조각 docker/gemini/battle_voice/bv_audio_slots.json(+qa)
// 앞 무음 제거(컷 시작 즉시 소리 나도록): -45dB 넘는 첫 10ms 창 5ms 앞에서 자름
const trimLead = (x) => { const W = Math.round(SR * 0.01); for (let o = 0; o + W <= x.length; o += W) { let e = 0; for (let i = o; i < o + W; i++) e += x[i] * x[i]; if (10 * Math.log10(e / W + 1e-12) > -45) return x.slice(Math.max(0, o - Math.round(SR * 0.005))); } return x; };
import { existsSync, mkdirSync, writeFileSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { SR, readWav, writeWav, split, resample, filt, fades, normalize, trimTail, mix, room, qa, rng, hardFadeTail, medF0 } from './bv_dsp.mjs';

const DIR = 'docker/gemini/battle_voice', OUT = 'public/assets/audio/sfx', PREVIEW = `${DIR}/out`;
mkdirSync(PREVIEW, { recursive: true });
const FORCE = !!process.env.FORCE;
const r = rng(20261107);
// raw -> 조각(22.05kHz). id -> [clip...]
const segs = {};
for (const f of readdirSync(`${DIR}/raw`).filter((f) => f.endsWith('.wav') && f !== 'hf2.wav' && f !== 'h4.wav') /* hf2: 지시문 낭독 섞임(blind QA) -> 제외 */) {
  const id = f.slice(0, -4), { x, sr } = readWav(`${DIR}/raw/${f}`);
  segs[id] = split(x, sr).map((c) => filt(resample(c, sr, SR), 'hp', 90));
}
// 남성 병사 풀: 유성 f0 중앙값 460Hz 초과(날카로워 여성·비명처럼 들리는 조각) 제외
const F0MAX = 460;
const pool = (ids, f0max = F0MAX) => ids.flatMap((id) => (segs[id] ?? []).map((x, k) => ({ id: `${id}_${k}`, x, f0: medF0(x) }))).filter((c) => c.f0 <= f0max);
const SHOUTS = pool(['s1', 's2', 's3', 's4', 's5', 's6']);
const DIES = pool(['d1', 'd2', 'd3', 'd4']);
const pick = (arr) => arr[Math.floor(r() * arr.length)];
const pitch = (x, lo, hi) => resample(x, SR, SR, lo + r() * (hi - lo));

// ---- 말 울음(코드 합성): 높은 f0 하강 + 떨림(트릴) 진폭 변조 + 포먼트 + 콧김 ----
function neigh(seed, dur = 1.05) {
  const q = rng(seed), n = Math.ceil(dur * SR), src = new Float32Array(n); let ph = 0;
  const f0a = 950 + q() * 250, f0b = 420 + q() * 80, trill = 11 + q() * 4;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = t / dur;
    const f = (u < 0.12 ? f0a * (0.8 + 1.7 * u) : f0a - (f0a - f0b) * Math.pow((u - 0.12) / 0.88, 0.7)) * (1 + 0.012 * Math.sin(2 * Math.PI * 6 * t));
    ph += f / SR; let s = 0; const H = Math.min(14, Math.floor(7000 / f)); for (let h = 1; h <= H; h++) s += Math.sin(2 * Math.PI * h * ph) / h ** 1.1;
    const depth = Math.min(0.9, 0.15 + u * 1.1), am = 1 - depth * (0.5 + 0.5 * Math.cos(2 * Math.PI * trill * t * (1 + 0.3 * u)));
    const env = Math.min(1, t / 0.05) * (u < 0.7 ? 1 : Math.exp(-(u - 0.7) * 7));
    src[i] = (s + (q() * 2 - 1) * 0.35) * am * env;
  }
  const y = new Float32Array(n);
  [[1050, 5, 1], [2300, 6, 0.55], [3400, 8, 0.3]].forEach(([fc, Q, a]) => { const b = filt(src, 'bp', fc, Q); for (let i = 0; i < n; i++) y[i] += b[i] * a; });
  // 콧김(끝): 저역 노이즈 버스트
  const sn = Math.ceil(0.22 * SR), snort = new Float32Array(sn); for (let i = 0; i < sn; i++) snort[i] = (q() * 2 - 1) * Math.exp(-i / SR / 0.06) * Math.min(1, i / SR / 0.01);
  return mix(dur + 0.2, [{ x: y, at: 0 }, { x: filt(filt(snort, 'lp', 900), 'hp', 150), at: dur - 0.05, g: 0.5 }]);
}

// ---- 레이어 군중: k 목소리, 시작 산포 spread, 피치 변형 ----
function crowd(len, k, spread, { lo = 0.9, hi = 1.1, gainLo = 0.5, src = SHOUTS, wet = 0.15, lp = 7000 } = {}) {
  const layers = [];
  for (let i = 0; i < k; i++) layers.push({ x: pitch(pick(src).x, lo, hi), at: r() * spread, g: gainLo + r() * (1 - gainLo) });
  return filt(room(mix(len, layers), wet), 'lp', lp);
}
// 대군 웅성 베드: 많은 발성을 저역통과·지연 산포해 '먼 함성' 질감
const murmur = (len) => filt(crowd(len, 18, len * 0.5, { lo: 0.82, hi: 1.0, gainLo: 0.3, wet: 0.3 }), 'lp', 1600);

const OUTS = {};
function emit(key, x, { target = -16, tail = 0.08, cat, usage, volume, src }) {
  let y = trimLead(trimTail(x)); y = fades(y, 0.004, tail); y = normalize(y, target, 0.84); y = fades(y, 0.002, Math.min(0.02, tail));
  const path = `${OUT}/${key}.wav`;
  // 2026-11-08: 사망 단말마(die_*, hero_fall_*)는 bv_snap.mjs 가 담당. 여기서는 공개 파일·슬롯 메타를 덮지 않는다
  if (/^sfx_bv_(die|hero_fall)_/.test(key)) { writeWav(`${PREVIEW}/${key}.wav`, y); return; }
  if (existsSync(path) && !FORCE && !process.env.PREVIEW_ONLY) { console.log(`${key}: 이미 있음(덮어쓰기 안 함)`); }
  else if (!process.env.PREVIEW_ONLY) writeWav(path, y);
  writeWav(`${PREVIEW}/${key}.wav`, y);
  OUTS[key] = { cat, usage, volume, src, qa: qa(y) };
}
const TTS = 'Gemini TTS(gemini-2.5-flash-preview-tts, 일부 2.5-pro-preview-tts) 무언어 발성 생성 -> docker/gemini/battle_voice/bv_build.mjs 분할·레이어·피치·정규화';
const SYN = 'docker/gemini/battle_voice/bv_build.mjs 코드 합성(외부 샘플 없음)';

// 1) 컷 시작 함성
for (let v = 1; v <= 3; v++) emit(`sfx_bv_shout_s_${v}`, (() => { const len = 1.15; const y = crowd(len, 3, 0.12, { wet: 0.08 }); return hardFadeTail(y, 0.8); })(), { cat: 'shout', target: -17, volume: 0.6, src: TTS, usage: '컷 시작 함성(소규모: 병력 적음·잔존 부대·정찰대)' });
for (let v = 1; v <= 3; v++) emit(`sfx_bv_shout_m_${v}`, (() => { const len = 1.3; const y = crowd(len, 8, 0.2, { wet: 0.14 }); return hardFadeTail(y, 0.9); })(), { cat: 'shout', target: -16, volume: 0.65, src: TTS, usage: '컷 시작 함성(보병 기본 규모)' });
for (let v = 1; v <= 2; v++) emit(`sfx_bv_shout_l_${v}`, (() => { const len = 1.5; const y = mix(len, [{ x: crowd(len, 14, 0.3, { wet: 0.2 }), g: 1 }, { x: murmur(len), g: 0.7 }]); return hardFadeTail(y, 1.05); })(), { cat: 'shout', target: -15, volume: 0.7, src: TTS, usage: '컷 시작 함성(대군: 병력 많음·보스 부대)' });
// 2) 말 울음 + 기병 함성
// 말 울음(neigh)·기병 함성(cav): 코드 합성 말 울음이 블라인드 QA에서 고음 비명으로 판정 -> 공개 제외. 기병 컷은 shout_m/l + 기존 sfx_battle_gallop 로 대체(사양서 참고)
// 3) 개체 사망 비명 / 피격 신음: 길이 기준 분류(0.3s 이상 = 사망, 미만 = 피격)
const longD = DIES.filter((d) => d.x.length / SR >= 0.3), shortD = DIES.filter((d) => d.x.length / SR < 0.3);
const pickSpread = (arr, k) => { const s = []; const step = arr.length / k; for (let i = 0; i < k && i * step < arr.length; i++) s.push(arr[Math.floor(i * step)]); return s; };
pickSpread(longD, 8).forEach((d, i) => emit(`sfx_bv_die_${i + 1}`, d.x, { cat: 'die', target: -17, tail: 0.05, volume: 0.55, src: `${TTS} (조각 ${d.id})`, usage: '컷 안 병사 1명 쓰러짐(사망) 비명' }));
pickSpread(shortD.length >= 4 ? shortD : DIES.slice().sort((a, b) => a.x.length - b.x.length), 4).forEach((d, i) => emit(`sfx_bv_hurt_${i + 1}`, d.x, { cat: 'hurt', target: -19, tail: 0.04, volume: 0.45, src: `${TTS} (조각 ${d.id})`, usage: '컷 안 병사 피격(비치명) 짧은 신음' }));
// 4) 부대 전멸: 함성 덩어리가 피치 하강·저역화하며 꺼짐 + 비명 몇 개
for (let v = 1; v <= 2; v++) emit(`sfx_bv_rout_${v}`, (() => {
  const len = 1.5, base = crowd(len, 8, 0.12, { wet: 0.2, lo: 0.92, hi: 1.02 });
  const n = base.length, y = new Float32Array(n); let lp = 0; // 시간에 따라 저역통과 컷오프 하강(소멸감)
  for (let i = 0; i < n; i++) { const u = i / n, a = Math.exp(-2 * Math.PI * (5000 * Math.pow(1 - u, 2) + 400) / SR); lp = lp * a + base[i] * (1 - a); y[i] = lp * Math.pow(1 - u, 1.4); }
  const cries = Array.from({ length: 4 }, (_, k) => ({ x: pitch(pick(longD).x, 0.9, 1.08), at: 0.15 + k * 0.17 + r() * 0.08, g: 0.45 + r() * 0.2 }));
  return mix(len, [{ x: y }, ...cries]);
})(), { cat: 'rout', target: -16, tail: 0.25, volume: 0.65, src: TTS, usage: '부대 전멸(병력 0) 시 함성이 꺼지는 소리' });
// 5) 영웅·지휘관 사망 외침: 조각 중 가장 긴 것 사용(길고 비장)
// 조각 지정 선택(유성 비율·큰 소리 구간 측정 + 블라인드 QA): h1_0(유성 88%, 큰소리 75%), h2_1(큰소리 78%), hf3_0(유성 99%). h2_0·h1_1(원본 피크 1.0)·h4(유성 30%, 숨소리 위주) 제외
const heroPick = (ref) => { const [id, k] = ref.split('_'); return segs[id]?.[Number(k)]; };
[['sfx_bv_hero_fall_m1', 'h1_0'], ['sfx_bv_hero_fall_m2', 'h2_1'], ['sfx_bv_hero_fall_f1', 'hf3_0']].forEach(([key, id]) => { let x = heroPick(id); if (x && x.length > 2.6 * SR) x = hardFadeTail(x.slice(0, Math.round(2.6 * SR)), 1.7); /* 영웅 외침 상한 2.6s */ if (x) emit(key, room(x, 0.12), { cat: 'hero', target: -15, tail: 0.3, volume: 0.75, src: `${TTS} (${id})`, usage: key.endsWith('f1') ? '여성 영웅·지휘관 사망 외침' : '남성 영웅·지휘관 사망 외침' }); });
// 6) 승리 환호(후순위)
emit('sfx_bv_victory_cheer', (() => { const C = pool(['v1', 'v2']); const len = 2.1; return hardFadeTail(mix(len, [{ x: crowd(len, 10, 0.5, { src: C, wet: 0.22 }) }, { x: crowd(len, 6, 0.4, { src: C, wet: 0.22, lo: 0.85, hi: 0.95 }), at: 0.6, g: 0.7 }]), 1.5); })(), { cat: 'cheer', target: -16, tail: 0.3, volume: 0.7, src: TTS, usage: '승리 환호(전투 승리 결과 진입, 후순위)' });

// 슬롯 조각
const slots = {};
for (const [key, o] of Object.entries(OUTS)) {
  const path = `assets/audio/sfx/${key}.wav`, bytes = existsSync(`public/${path}`) ? statSync(`public/${path}`).size : null;
  slots[key] = { type: 'sfx', path, loop: false, volume: o.volume, bytes, approxSeconds: o.qa.seconds, category: `battle_voice.${o.cat}`, usage: o.usage, source: o.src,
    license: o.src.startsWith('docker') ? '자체 생성물(제3자 저작물 없음)' : '확인 필요(Google Gemini API 약관상 생성물 상업 이용 범위 확인, AI 생성 음성)', method: o.src.startsWith('docker') ? 'code-synthesis' : 'ai-generated+code-processing',
    qa: { ...o.qa, clipping: o.qa.clippedSamples ? 'yes' : 'none', listening: 'UNVERIFIED(사람 청취 전)' }, verify: true };
}
{ const prev = existsSync(`${DIR}/bv_audio_slots.json`) ? JSON.parse(readFileSync(`${DIR}/bv_audio_slots.json`, 'utf8')) : {}; for (const k of Object.keys(prev)) if (/^sfx_bv_(die|hero_fall)_/.test(k)) slots[k] = prev[k]; } // bv_snap.mjs 메타 보존
writeFileSync(`${DIR}/bv_audio_slots.json`, JSON.stringify(slots, null, 2));
console.table(Object.fromEntries(Object.entries(OUTS).map(([k, o]) => [k, o.qa])));
