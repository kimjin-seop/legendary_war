// 초상 얼굴 차별화 재생성기(안아트 2026-11-08). 골격 = samguk_recraft/samguk_gen.mjs(portrait 모드), 정의 = redo_style.mjs.
// 실행(프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/portrait_redo5/redo_gen.mjs code1,code2 [--force] [--extra=..] [--dry]
// 참조 = refs/<code>.jpg(현행 초상 마젠타 합성). 출력 raw/<code>.jpg(재생성 시 이전본 _try<n>.jpg). 장부 calls_log.jsonl. 인물당 PER_CAP 회 초과 시 그 인물은 건너뜀. 429 즉시 중단.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES, BASE_STYLE, PORTRAIT_NEGATIVE, KEY_BG } from '../style_guide.mjs';
import { P, W, PER_CAP, TOTAL_CAP } from './redo_style.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const LOG = `${W}/calls_log.jsonl`, TIMEOUT_MS = 180_000;
const LEAD = '첨부 이미지는 이 인물의 현재 게임 초상화다. 그림체·선 굵기·채색·광원·구도·프레이밍·인물 크기·자세·의상·갑옷·머리쓰개(터번·투구·관·두건·베일·왕관)의 형태와 색·무기·소품은 참조와 똑같이 유지한다. ' +
  '바꾸는 것은 얼굴·머리카락·수염·나이·얼굴 살집뿐이다: 참조 얼굴을 따르지 말고 아래 설명의 고유한 얼굴로 완전히 새로 그린다. 다른 인물들과 확연히 구별되는 개성 있는 얼굴(정형화된 미형 얼굴 금지).';
function job(code, extra) {
  const h = P[code]; if (!h) throw new Error(`작업 없음 ${code}`);
  return `${LEAD}\n실존 역사 인물을 모티프로 한 게임용 일러스트(특정 초상·사진 재현 아님), 존중감 있게(희화화·민족 고정관념 금지).\n` +
    `인물(${h.name}) 얼굴: ${h.f}.\n반드시 보여야 할 차별 포인트: ${h.d.join(' / ')}.\n표정: 인물 성격에 맞는 진지한 표정, 입은 다문 상태.\n` +
    `스타일: ${BASE_STYLE}\n구도: 참조와 동일한 허리 위 상반신, 세로 3:4, 머리 위 여백·프레이밍 참조와 동일.\n${KEY_BG}\n` +
    `금지: ${PORTRAIT_NEGATIVE}, 의상·복식·머리쓰개 변경, 글자·문장·깃발 문자, 의상에 마젠타·분홍 금지${extra ? `\n추가 지시(재생성): ${extra}` : ''}`;
}
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const usedBy = (c) => existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.id === c).length : 0;
const totalUsed = () => existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split(String.fromCharCode(10)).filter(Boolean).length : 0;
const codes = (process.argv[2] ?? '').split(',').filter(Boolean); const force = process.argv.includes('--force');
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
if (process.argv.includes('--dry')) { for (const c of codes) console.log(c, '\n', job(c, extra)); process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
mkdirSync(`${W}/raw`, { recursive: true });
let ok = 0, calls = 0;
const runOne = async (code) => {
  const out = `${W}/raw/${code}.jpg`;
  if (existsSync(out) && !force) { console.log(`[${code}] 이미 있음`); return; }
  for (let a = 0; a <= 1; a++) {
    if (totalUsed() >= TOTAL_CAP) { console.log(`총 호출 상한 ${TOTAL_CAP} 도달 — 중단`); return; }
    if (usedBy(code) >= PER_CAP) { console.log(`[${code}] 인물당 상한 ${PER_CAP} 도달 — 건너뜀`); return; }
    calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS); let retry = false;
    try {
      const input = [{ type: 'image', mime_type: 'image/jpeg', data: readFileSync(`${W}/refs/${code}.jpg`).toString('base64') }, { type: 'text', text: job(code, extra) }];
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '3:4', image_size: RES.image_size } }), signal: ctrl.signal });
      const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
      appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'portrait_redo5', id: code, attempt: a, status: res.status, model: RES.model, size: RES.image_size, extra: extra ? extra.slice(0, 200) : null }) + '\n');
      const img = res.ok ? findImage(json) : null;
      if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${W}/raw/${code}_try${n}.jpg`)) n++; renameSync(out, `${W}/raw/${code}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${code}] 성공`); }
      else { console.log(`[${code}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 200)}`); if (res.status === 429) { console.log('429 — 중단'); process.exit(3); } retry = res.status >= 500 || (res.ok && !img); }
    } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'portrait_redo5', id: code, attempt: a, status: 'error' }) + '\n'); console.log(`[${code}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); retry = true; }
    finally { clearTimeout(t); }
    if (!retry) return; await sleep(8000);
  }
};
// 동시 3개
const q = [...codes]; await Promise.all([0, 1, 2].map(async () => { while (q.length) { await runOne(q.shift()); await sleep(1500); } }));
console.log(`완료: 성공 ${ok}/${codes.length}, 이번 호출 ${calls}`);
