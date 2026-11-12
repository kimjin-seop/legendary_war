// 영웅 전용 방향 시트 생성기(영웅 1명 = 1회 호출, 3x3 시트). 스타일 상수는 style_guide.mjs(단일 출처), 복식은 sprite_prompts.json, 방향 디테일은 hero_dir_prompts.json.
// 참조: 1=같은 병종 3x3 방향 시트 raw(격자 배치·도트 크기·방향 구조), 2=해당 영웅 정면 raw(raw/heroes/<code>.jpg, 얼굴·복식·색 고정. 없으면 병종 정면), 3=정식 초상화 raw(복식 세부)
// 실행: docker run --rm --env-file .env -e MAX_CALLS=n -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/hero_dir_gen.mjs code1,code2 [--force] [--note=재시도사유]
// 출력: docker/gemini/hero_dir_raw/<code>.jpg (재생성 시 이전 파일은 <code>_try<n>.jpg 로 보존). 호출 로그: docker/gemini/hero_dir_calls_log.json (키 값은 기록·출력하지 않음)
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { RES, PIXEL64_STYLE, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const ROUND = Number(process.env.ROUND ?? 1), ROUND_BUDGET = Number(process.env.ROUND_BUDGET ?? (ROUND === 1 ? 30 : 10)), TIMEOUT_MS = 150_000, DELAY_MS = 5_000;
const MAX_CALLS = Number(process.env.MAX_CALLS ?? 1);
const RAW_ROOT = 'public/assets/raw', OUT = 'docker/gemini/hero_dir_raw', LOG = 'docker/gemini/hero_dir_calls_log.json';
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const callLog = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : { note: '영웅 방향 시트 이미지 호출 로그(이번 라운드 예산 30회, 영웅당 재시도 1회)', budget: ROUND_BUDGET, calls: [] };
const roundUsed = () => callLog.calls.filter((c) => (c.round ?? 1) === ROUND).length;
const record = (id, status, note) => { callLog.calls.push({ ts: new Date().toISOString(), round: ROUND, id, status, model: RES.model, size: RES.image_size, note }); callLog.used = callLog.calls.length; callLog.rounds = { ...(callLog.rounds ?? {}), [ROUND]: { budget: ROUND_BUDGET, used: roundUsed() } }; writeFileSync(LOG, JSON.stringify(callLog, null, 1)); };

const SP = Object.fromEntries(JSON.parse(readFileSync('docker/gemini/sprite_prompts.json', 'utf8')).items.map((h) => [h.code, h]));
const HD = JSON.parse(readFileSync('docker/gemini/hero_dir_prompts.json', 'utf8')).items;
const RULE =
  '정확히 3열x3행(9칸) 균등 격자, 한 칸에 캐릭터 1프레임(전신, 발까지), 격자선·칸 테두리·글자·문장 없음, 칸 사이 여백 충분(닿지 않음). ' +
  '행 순서(위→아래): 1행 정면(아래를 향함, 두 번째 참조 이미지와 같은 모습), 2행 세 칸 모두 화면 왼쪽을 향한 완전한 옆모습(프로필: 얼굴 옆선·코끝·눈 1개만 보임, 몸통·발끝·얼굴 모두 화면 왼쪽을 향함. 3/4 각도·정면·오른쪽을 보는 칸은 절대 금지, 가운데 칸도 반드시 옆모습으로 두 발을 모으고 선 자세), 3행 뒷모습(위를 향함, 얼굴 안 보임, 투구·모자 형태는 정면과 동일하게 — 정면에 없는 챙·장식을 추가하지 않음). ' +
  '열 순서: 왼발 내딛음(walk1), 서 있음(idle), 오른발 내딛음(walk2) — 걷기 프레임은 다리·팔 끝만 조금 달라지고 몸통·머리·장비 위치는 프레임 간 거의 동일(흔들림 최소). ' +
  '9칸 모두 같은 캐릭터·같은 크기(머리끝~발끝이 칸 높이의 80%, 칸 위아래 여백 확보)·같은 발 위치 기준선·칸 가로 중앙 정렬, 무기·깃발·장비가 칸 밖으로 나가지 않게 몸 가까이.';

function job(arg) {
  const [code, variant] = arg.split('@');
  if (variant) { // 부분 재생성 변형(hero_dir_prompts.json items.<code>.variants.<variant> = { refs, prompt }) — 공통 스타일·금지 문구는 여기서 덧붙임
    const v = HD[code]?.variants?.[variant]; if (!v) throw new Error(`${code}.variants.${variant} 없음`); const h = { ...(SP[code] ?? {}), ...HD[code] };
    return { id: arg, out: `${code}_${variant}`, refs: v.refs, prompt: `${v.prompt}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}` };
  }
  const d = HD[code]; if (!d) throw new Error(`hero_dir_prompts.json 에 ${code} 없음`);
  const h = { ...(SP[code] ?? {}), ...d }; const hasFront = existsSync(`${RAW_ROOT}/heroes/${code}.jpg`);
  const refs = [d.layout, hasFront ? `heroes/${code}.jpg` : d.front_ref, h.portrait ?? `portraits/${code}.jpg`];
  const desc = [`머리: ${h.headgear}`, `몸: ${h.body}`, h.cloak && h.cloak !== '없음' ? `망토: ${h.cloak}` : null, `무기·손: ${h.weapon}`, `상징: ${h.symbol}`, `주요 색: ${h.colors}`].filter(Boolean).join('. ');
  const prompt =
    `첫 번째 참조 이미지는 같은 병종의 3x3 방향 걷기 시트(격자 배치·방향 구조·도트 크기·캐릭터 크기의 기준). 두 번째 참조 이미지는 ${hasFront ? `이 영웅(${h.name})의 정면 도트 스프라이트(얼굴·머리·복식·색·장비를 그대로 유지)` : '같은 병종의 정면 도트 스프라이트(그림체·2.5등신·체형의 기준만, 복식은 따르지 않음)'}. 세 번째 참조 이미지는 이 영웅의 정식 초상화(복식 세부·색 확인용, 그림체는 따르지 않음).\n` +
    `첫 번째 참조 시트와 같은 배치·같은 도트 크기(1도트의 크기가 첫 번째 참조와 동일, 두 번째 참조보다 도트가 작고 촘촘함)·같은 2.5등신·같은 외곽선 두께로, 이 영웅의 방향별 걷기 스프라이트 시트 1장을 그린다.\n` +
    `영웅: ${h.name}${h.mounted ? '(말에 탄 기마 지휘관, 말과 기수를 한 캐릭터로, 첫 번째 참조의 기병처럼)' : ''}. 복식: ${desc}.\n` +
    `방향 디테일: 뒷모습: ${d.back}. 측면: ${d.side}. 뒷모습만 봐도 이 영웅임을 알 수 있게 투구·망토·깃발·장비의 실루엣을 또렷하게.\n` +
    `시트 규칙: ${RULE}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
  return { id: code, out: code, refs, prompt };
}

const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };

const codes = (process.argv[2] ?? '').split(',').filter(Boolean); const force = process.argv.includes('--force');
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
if (process.argv.includes('--dry')) { for (const c of codes) { const j = job(c); console.log(c, j.refs.join(' | ')); console.log(j.prompt); } process.exit(0); }
mkdirSync(OUT, { recursive: true }); let calls = 0, ok = 0;
for (const code of codes) {
  const j = job(code); const out = `${OUT}/${j.out}.jpg`; const outBase = j.out;
  if (existsSync(out) && !force) { console.log(`[${code}] 이미 있음(--force 로 재생성)`); continue; }
  if (calls >= MAX_CALLS) { console.log('MAX_CALLS 도달'); break; }
  if (roundUsed() >= ROUND_BUDGET) { console.log(`라운드 ${ROUND} 예산 ${ROUND_BUDGET}회 소진`); break; }
  const input = [];
  for (const r of j.refs) { const fixed = `docker/gemini/hero_dir_refs/${r.replace('/', '_')}`; // 측면 행 좌향 보정 참조(hero_dir_refs.mjs)가 있으면 우선. 'docker/' 로 시작하면 프로젝트 기준 경로
    const f = r.startsWith('docker/') ? r : r.startsWith('dir64') && existsSync(fixed) ? fixed : path.join(RAW_ROOT, r); console.log(`[${code}] ref ${f}`); if (!existsSync(f)) { console.log(`[${code}] 참조 없음 ${f}`); process.exit(2); } input.push({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') }); }
  input.push({ type: 'text', text: j.prompt });
  calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '1:1', image_size: RES.image_size } }), signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
    record(code, res.status, note);
    const img = res.ok ? findImage(json) : null;
    if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${OUT}/${outBase}_try${n}.jpg`)) n++; renameSync(out, `${OUT}/${outBase}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${code}] 성공 -> ${out}`); }
    else console.log(`[${code}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 400)}`);
  } catch (e) { record(code, 'error', note); console.log(`[${code}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); }
  finally { clearTimeout(t); }
  await sleep(DELAY_MS);
}
console.log(`완료: 성공 ${ok}, 이번 실행 호출 ${calls}회, 라운드 ${ROUND} 누적 ${roundUsed()}/${ROUND_BUDGET}, 전체 ${callLog.calls.length}`);
