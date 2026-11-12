// 누락 영웅 초상 생성기(안아트-2 2026-11-09). 호출 형식 = ch25_portraits_gen.mjs, 프롬프트 문장 = portrait_campaign_style.mjs job() 과 동일 구성.
// 실행(호스트, 프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/missing_heroes/mh_gen.mjs <code,...> [--force] [--note=..] [--extra=..] [--dry]
// 출력 raw/<code>.jpg(재생성 시 이전본 _try<n>.jpg 보존). 장부 calls_log.jsonl(전체 CALL_LIMIT, 인물당 PER_CAP 호출 전 확인). 키는 --env-file 로만, 오류문 마스킹. 429 즉시 중단.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES, BASE_STYLE, PORTRAIT_RULE, PORTRAIT_NEGATIVE, KEY_BG } from '../style_guide.mjs';
import { P_MH, RAW, LOG, CALL_LIMIT, PER_CAP } from './mh_style.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 180_000, DELAY_MS = 3_000;
const NO_SYMBOL = '가문 문장·깃발·글자·한자·숫자·종교 상징 없음, 노출 없음';
const PORTRAIT_FRAME = '프레이밍: 머리끝(관·모자 포함)이 프레임 위 가장자리에서 약 6% 아래, 프레임 아래 가장자리는 허리 높이에서 잘림, 얼굴 너비가 프레임 너비의 약 20%, 몸은 약간 3/4 로 틀고 얼굴은 정면에 가깝게. 손에 든 소품은 가슴~얼굴 옆 높이에서 프레임 안에.';
const STYLE_REF_LEAD = '첨부한 참조 이미지에서는 그림체·선 굵기·채색 방식·광원·구도·인물 크기·머리 위 여백만 따른다. 참조 인물의 얼굴·머리·수염·복식·색·소품·나이는 절대 따르지 않고 아래 설명의 새 인물로 그린다.\n';
const HIST_NOTE = '실존 역사 인물을 모티프로 한 게임용 일반화 일러스트: 특정 초상화·사진의 얼굴을 재현하지 않고, 시대 복식과 아래 설명의 나이·인상만으로 그린다. 위엄 있는 인물로 존중감 있게 묘사(악역 과장·희화화·민족 고정관념 금지). 성인 남성';
const FACE = '얼굴은 정형화된 미형 얼굴이 아니라 설명의 나이·골격·피부·머리·수염을 정확히 따른 개성 있는 얼굴(다른 인물과 확연히 구별). 손은 손가락 5개, 자연스러운 관절';
export const job = (c, extra) => { const h = P_MH[c];
  return `${STYLE_REF_LEAD}${HIST_NOTE}. 인물(${h.name}): ${h.desc}.\n${FACE}.\n표정: 진지한 중립 표정, 입은 다문 상태.\n${NO_SYMBOL}.\n` +
    `스타일: ${BASE_STYLE}\n구도: ${PORTRAIT_RULE.replace('미형 얼굴이되 ', '')}. ${PORTRAIT_FRAME}\n${KEY_BG}\n금지: ${PORTRAIT_NEGATIVE}, 의상에 마젠타·분홍·보라 금지` +
    (extra ? `\n추가 지시(재생성): ${extra}` : ''); };

const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const codes = (process.argv[2] ?? '').split(',').filter(Boolean); const force = process.argv.includes('--force');
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
for (const c of codes) if (!P_MH[c]) { console.error(`작업 없음: ${c}`); process.exit(1); }
if (process.argv.includes('--dry')) { for (const c of codes) { console.log(c, P_MH[c].ref); console.log(job(c, extra)); } process.exit(0); }
const rows = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
mkdirSync(RAW, { recursive: true }); let ok = 0, calls = 0;
for (const c of codes) {
  const h = P_MH[c], out = `${RAW}/${c}.jpg`;
  if (existsSync(out) && !force) { console.log(`[${c}] 이미 있음(--force 로 재생성)`); continue; }
  const L = rows();
  if (L.length >= CALL_LIMIT) { console.log(`호출 한도 ${CALL_LIMIT} 도달 — 중단`); break; }
  if (L.filter((x) => x.id === c).length >= PER_CAP) { console.log(`[${c}] 인물당 상한 ${PER_CAP} — 건너뜀`); continue; }
  const input = [{ type: 'image', mime_type: 'image/png', data: readFileSync(h.ref).toString('base64') }, { type: 'text', text: job(c, extra) }];
  calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '3:4', image_size: RES.image_size } }), signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'missing_hero_portrait', id: c, status: res.status, model: RES.model, size: RES.image_size, aspect: '3:4', ref: h.ref, note, extra: extra ? extra.slice(0, 300) : null }) + '\n');
    const img = res.ok ? findImage(json) : null;
    if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${RAW}/${c}_try${n}.jpg`)) n++; renameSync(out, `${RAW}/${c}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${c}] 성공`); }
    else {
      console.log(`[${c}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`);
      if (res.status === 429) { console.log(`429 — 즉시 중단. 성공 ${ok}, 호출 ${calls}`); process.exit(3); }
    }
  } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'missing_hero_portrait', id: c, status: 'error', note }) + '\n'); console.log(`[${c}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); }
  finally { clearTimeout(t); }
  await sleep(DELAY_MS);
}
console.log(`완료: 성공 ${ok}/${codes.length}, 이번 호출 ${calls}회, 장부 누계 ${rows().length}/${CALL_LIMIT}`);
