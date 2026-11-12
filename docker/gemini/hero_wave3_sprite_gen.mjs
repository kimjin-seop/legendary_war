// [hero_wave3 사본(3차 신규 35명 + 승격 무시트 17명, 안아트 2026-11-06) ← hero_exp2_sprite_gen.mjs. 경로만 hero_wave3/]
// [hero_exp2 사본(신규 영웅 20명, 2026-11-06) ← hero_exp1 사본: hero_v4_gen.mjs 와 동일 로직(1:1 2K 3x3 시트, refs = 병종 견본 + 정식 초상), 경로만 hero_wave3/(sprite_prompts·sprite_raw·sprite_calls_log) + HTTP 429 즉시 전체 중단·재시도 1회(안아트 2026-11-03)]
// 영웅 전용 방향 시트 v3 생성기: 초상화 기준, 영웅 1명 = 1호출(1:1 2K, 3x3 시트). 파일럿(2인 16:9, 키 43px) 크기 미달 보완.
// 참조: 1=병종 3x3 방향 시트(측면 좌향 보정본, 배치·도트 크기·등신만), 2=영웅 정식 초상화 PNG(얼굴·머리·복식·색·소지품). 외형은 hero_v3_prompts.json 텍스트로 고정.
// 스타일 상수는 style_guide.mjs(단일 출처). 키는 --env-file 로 받은 GEMINI_API_KEY 만 사용(출력·기록 없음).
// 실행: docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/hero_v3_gen.mjs code1,code2 [--force] [--note=사유] [--extra=추가지시] [--dry]
// 출력: docker/gemini/hero_v3_raw/<code>.jpg(재생성 시 이전본 <code>_try<n>.jpg 보존). 로그: docker/gemini/hero_v3_calls_log.jsonl(1줄=1호출)
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES, PIXEL64_STYLE, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 180_000, DELAY_MS = 4_000, RETRIES = Number(process.env.RETRIES ?? 1); // 호출 상한이 빡빡하면 RETRIES=0
const OUT = 'docker/gemini/hero_wave3/sprite_raw', LOG = 'docker/gemini/hero_wave3/sprite_calls_log.jsonl';
const D = JSON.parse(readFileSync('docker/gemini/hero_wave3/sprite_prompts.json', 'utf8'));
const RULE =
  '정확히 3열x3행(9칸) 균등 격자, 한 칸에 캐릭터 1프레임(전신, 발까지), 격자선·칸 테두리·글자 없음, 칸 사이 여백 충분(닿지 않음). ' +
  '행 순서(위→아래): 1행 정면(아래를 향함), 2행 세 칸 모두 화면 왼쪽을 향한 완전한 옆모습(프로필: 얼굴 옆선·코끝·눈 1개만, 몸통·발끝·얼굴 모두 왼쪽. 3/4 각도·정면·오른쪽을 보는 칸 절대 금지), 3행 뒷모습(위를 향함, 얼굴 안 보임, 머리·관·모자 형태는 정면과 동일). ' +
  '열 순서: 왼발 내딛음(walk1), 서 있음(idle), 오른발 내딛음(walk2) — 걷기 프레임은 다리·팔 끝만 조금 다르고 몸통·머리·소품 위치는 거의 동일. ' +
  '9칸 모두 같은 캐릭터·같은 크기: 머리끝~발끝이 칸 높이의 85%로 크게(칸 위아래 여백은 조금만), 같은 발 기준선, 칸 가로 중앙 정렬, 무기·소품은 칸 밖으로 나가지 않게 몸 가까이. ' +
  '무기·소지품 일관성: 9칸 모두 같은 무기·소지품을 같은 손에, 같은 길이·같은 각도로 든다. 정면 행 3칸에도 무기·소지품이 반드시 보인다(몸 옆으로 비켜 보이게, 몸 뒤로 숨기지 않음). 뒷모습 행 걷기 칸에서도 무기의 각도·좌우 위치·개수는 뒷모습 idle 칸과 똑같다(무기 개수는 칸마다 같음, 복제 금지). 특히 측면 행 가운데(idle) 칸, 측면·뒷모습 행의 걷기 칸에서 무기·소지품을 빠뜨리기 쉬우니 9칸 전부 하나씩 확인해 반드시 그린다.';

function job(code, extra) {
  const h = D.items[code]; if (!h) throw new Error(`hero_v4_prompts.json 에 ${code} 없음`);
  const refs = [D.layouts[h.layout], h.portrait ?? `public/assets/portraits/${code}.png`]; // h.portrait = 초상 경로 덮어쓰기(2026-11-04 S 2차, NPC 초상 webp 등)
  const prompt =
    '첫 번째 참조 이미지는 3x3 방향 걷기 도트 시트 견본이다. 견본에서는 칸 배치·도트 1개의 크기·2.5등신 비율·외곽선 두께만 따른다. 견본 인물의 얼굴·머리·모자·옷·무기·성별·나이는 절대 따르지 않는다.\n' +
    `두 번째 참조 이미지는 이 영웅(${h.name})의 정식 초상화다. 얼굴 특징·머리색·머리 모양·수염·복식 구성과 색·소지품·성별·나이감을 초상화와 똑같이 맞춘다(그림체·상반신 구도는 따르지 않고 결과는 전신 도트 스프라이트).\n` +
    `${h.mounted ? '말에 탄 기마 인물(말과 기수를 한 캐릭터로, 말 전체가 칸 안에). ' : ''}외형: ${h.desc}.\n` +
    `방향 디테일: 뒷모습: ${h.back}. 측면: ${h.side}. 작은 크기에서도 머리 모양·수염·옷 색·소지품이 식별되게 큰 색면으로 또렷하게.\n` +
    (extra ? `추가 지시(재생성): ${extra}\n` : '') +
    `시트 규칙: ${RULE}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
  return { refs, prompt };
}

const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const codes = (process.argv[2] ?? '').split(',').filter(Boolean); const force = process.argv.includes('--force');
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
if (process.argv.includes('--dry')) { for (const c of codes) { const j = job(c, extra); console.log(c, j.refs.join(' | ')); console.log(j.prompt); } process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
mkdirSync(OUT, { recursive: true }); let ok = 0, calls = 0;
for (const code of codes) {
  const out = `${OUT}/${code}.jpg`;
  if (existsSync(out) && !force) { console.log(`[${code}] 이미 있음(--force 로 재생성)`); continue; }
  const j = job(code, extra);
  const input = j.refs.map((f) => { if (!existsSync(f)) throw new Error(`참조 없음 ${f}`); return { type: 'image', mime_type: f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg', data: readFileSync(f).toString('base64') }; });
  input.push({ type: 'text', text: j.prompt });
  for (let a = 0; a <= RETRIES; a++) {
    calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS); let retry = false;
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '1:1', image_size: RES.image_size } }), signal: ctrl.signal });
      const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
      appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'hero_sprite_wave3', id: code, attempt: a, status: res.status, model: RES.model, size: RES.image_size, note, extra: extra ? extra.slice(0, 200) : null }) + '\n');
      const img = res.ok ? findImage(json) : null;
      if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${OUT}/${code}_try${n}.jpg`)) n++; renameSync(out, `${OUT}/${code}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${code}] 성공 -> ${out}`); }
      else { console.log(`[${code}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`); if (res.status === 429) { console.log(`[${code}] HTTP 429 — 한도 도달, 즉시 중단`); console.log(`완료: 성공 ${ok}/${codes.length}, 호출 ${calls}회 — 429 로 중단`); process.exit(3); } retry = res.status >= 500 || (res.ok && !img); }
    } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'hero_sprite_wave3', id: code, attempt: a, status: 'error', note }) + '\n'); console.log(`[${code}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); retry = true; }
    finally { clearTimeout(t); }
    if (!retry) break; await sleep(DELAY_MS * (a + 2) * 3); // 재시도 백오프(12s, 18s)
  }
  await sleep(DELAY_MS);
}
console.log(`완료: 성공 ${ok}/${codes.length}, 호출 ${calls}회`);
