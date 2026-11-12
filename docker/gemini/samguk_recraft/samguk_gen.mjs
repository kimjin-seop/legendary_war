// 삼국 복식 재제작 생성기(안아트 2026-11-08). portrait_campaign_gen.mjs·hero_wave3_sprite_gen.mjs 호출 골격 사본, 작업 정의 = samguk_style.mjs.
// 실행(프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/samguk_recraft/samguk_gen.mjs <portrait|sprite> code1,code2 [--force] [--note=..] [--extra=..] [--dry]
// 출력: raw_portrait/<code>.jpg, raw_sprite/<code>.jpg (재생성 시 이전본 _try<n>.jpg 보존). 로그: calls_log.jsonl(1줄=1호출). 누계가 CAP 이상이면 호출하지 않고 exit 4.
// 429 → 즉시 전체 중단(exit 3). 무이미지/5xx 만 1회 재시도. 키는 --env-file 의 GEMINI_API_KEY 만 사용(출력·기록 없음, 오류문 마스킹).
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES, BASE_STYLE, PORTRAIT_RULE, PORTRAIT_NEGATIVE, KEY_BG, BASE_NEGATIVE, PIXEL64_STYLE } from '../style_guide.mjs';
import { P, W, CAP, EN_POS, EN_LAMELLAR, EN_NEG, KO_NEGATIVE } from './samguk_style.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const LOG = `${W}/calls_log.jsonl`, TIMEOUT_MS = 180_000, DELAY_MS = 3_000, RETRIES = Number(process.env.RETRIES ?? 1);
const NAT = { G: '고구려', B: '백제', S: '신라' };
const STYLE_REF = { G: 'public/assets/portraits/npc/npc_kim_chunchu.webp', B: 'public/assets/portraits/npc/npc_kim_chunchu.webp', S: 'public/assets/portraits/jumong.png' };
const STYLE_REF_LEAD = '첨부한 참조 이미지에서는 그림체·선 굵기·채색 방식·광원·구도·인물 크기·머리 위 여백만 따른다. 참조 인물의 얼굴·머리·관·모자·수염·복식·색·소품·나이는 절대 따르지 않고 아래 설명의 새 인물로 그린다.\n';
const FRAME = '프레이밍: 머리끝(관·깃·투구 포함)이 프레임 위 가장자리에서 약 6% 아래, 프레임 아래 가장자리는 허리 높이에서 잘림, 얼굴 너비가 프레임 너비의 약 20%, 몸은 약간 3/4 로 틀고 얼굴은 정면에 가깝게. 손에 든 무기·소품은 프레임 안(창날·활 끝이 잘리지 않게).';
const RULE =
  '정확히 3열x3행(9칸) 균등 격자, 한 칸에 캐릭터 1프레임(전신, 발까지), 격자선·칸 테두리·글자 없음, 칸 사이 여백 충분(닿지 않음). ' +
  '행 순서(위→아래): 1행 정면(아래를 향함), 2행 세 칸 모두 화면 왼쪽을 향한 완전한 옆모습(프로필: 얼굴 옆선·코끝·눈 1개만, 몸통·발끝·얼굴 모두 왼쪽. 3/4 각도·정면·오른쪽을 보는 칸 절대 금지), 3행 뒷모습(위를 향함, 얼굴 안 보임, 머리·관·모자 형태는 정면과 동일). ' +
  '열 순서: 왼발 내딛음(walk1), 서 있음(idle), 오른발 내딛음(walk2) — 걷기 프레임은 다리·팔 끝만 조금 다르고 몸통·머리·소품 위치는 거의 동일. ' +
  '9칸 모두 같은 캐릭터·같은 크기: 머리끝~발끝이 칸 높이의 85%로 크게(칸 위아래 여백은 조금만), 같은 발 기준선, 칸 가로 중앙 정렬, 무기·소품은 칸 밖으로 나가지 않게 몸 가까이. ' +
  '무기·소지품 일관성: 9칸 모두 같은 무기·소지품을 같은 손에, 같은 길이·같은 각도로 든다(무기 개수는 칸마다 정확히 같음, 복제 금지). 정면 행 3칸에도 무기가 보인다. 측면 행 가운데(idle) 칸, 측면·뒷모습 행 걷기 칸에서 무기를 빠뜨리지 않는다.';
const LAYOUT = { sword: 'sword', spear: 'sword', archer: 'archer', cavalry: 'cavalry', mage: 'mage', healer: 'healer' };

function job(mode, code, extra) {
  const h = P[code]; if (!h) throw new Error(`작업 없음 ${code}`);
  const ex = extra ? `\n추가 지시(재생성): ${extra}` : '';
  if (mode === 'portrait') {
    const who = (h.kind === 'invented' ? '게임 오리지널 허구 인물(실존 인물 아님)' : '실존 역사 인물을 모티프로 한 게임용 일반화 일러스트: 특정 초상·사진의 얼굴을 재현하지 않고 시대 복식과 아래 설명의 나이·인상만으로 그린다') +
      `. 존중감 있게 묘사(희화화·민족 고정관념 금지). ${h.female ? '성인 여성' : h.code === 'npc_gwanchang' ? '16세 소년' : '성인 남성'}. ${NAT[h.nat]} 사람`;
    const prompt = `${STYLE_REF_LEAD}${who}. 인물(${h.name}): ${h.p}.\n고증 기준(영문): ${EN_POS}${/찰갑|미늘/.test(h.p) ? `, ${EN_LAMELLAR}` : ''}.\n표정: 평온하고 진지한 중립 표정, 입은 다문 상태.\n가문 문장·깃발·글자·한자·숫자·종교 상징 없음, 노출 없음.\n` +
      `스타일: ${BASE_STYLE}\n구도: ${PORTRAIT_RULE}. ${FRAME}\n${KEY_BG}\n금지: ${KO_NEGATIVE}. Negative: ${EN_NEG}. ${PORTRAIT_NEGATIVE}, 의상에 마젠타·분홍·밝은 보라 금지${ex}`;
    return { refs: [STYLE_REF[h.nat]], prompt, aspect: '3:4', out: `${W}/raw_portrait` };
  }
  const portrait = `${W}/portrait_out/${code}.png`;
  const prompt =
    '첫 번째 참조 이미지는 3x3 방향 걷기 도트 시트 견본이다. 견본에서는 칸 배치·도트 1개의 크기·2.5등신 비율·외곽선 두께만 따른다. 견본 인물의 얼굴·머리·모자·옷·갑옷·무기·성별·나이는 절대 따르지 않는다.\n' +
    `두 번째 참조 이미지는 이 인물(${h.name}, ${NAT[h.nat]})의 정식 초상화다. 얼굴 특징·머리·관/투구 형태·수염·복식 구성과 색·무기·성별·나이감을 초상화와 똑같이 맞춘다(그림체·상반신 구도는 따르지 않고 결과는 전신 도트 스프라이트).\n` +
    `${h.mounted ? '말에 탄 기마 인물(말과 기수를 한 캐릭터로, 말 전체가 칸 안에). ' : ''}외형: ${h.s}.\n` +
    `방향 디테일: 뒷모습: ${h.back}. 측면: ${h.side}. 작은 크기에서도 관·투구 실루엣·수염·옷 색·무기가 식별되게 큰 색면으로 또렷하게. 갑옷은 직사각 미늘의 가로 줄무늬로 표현(둥근 비늘 금지).${ex}\n` +
    `시트 규칙: ${RULE}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·밝은 자주 금지. 금지: ${h.forbid}, 망토, 케이프, 서양 투구, 일본 갑옷, 중국 장수 복식.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
  return { refs: [`docker/gemini/hero_dir_refs/dir64_${LAYOUT[h.unit]}.jpg`, portrait], prompt, aspect: '1:1', out: `${W}/raw_sprite` };
}

const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mime = (f) => f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
const used = () => existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).length : 0;

const mode = process.argv[2]; if (!['portrait', 'sprite'].includes(mode)) { console.error('mode = portrait|sprite'); process.exit(1); }
const codes = (process.argv[3] ?? '').split(',').filter(Boolean); const force = process.argv.includes('--force');
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
if (process.argv.includes('--dry')) { for (const c of codes) { const j = job(mode, c, extra); console.log(c, j.refs.join(' | ')); console.log(j.prompt); } process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
let ok = 0, calls = 0;
for (const code of codes) {
  const j = job(mode, code, extra); mkdirSync(j.out, { recursive: true });
  const out = `${j.out}/${code}.jpg`;
  if (existsSync(out) && !force) { console.log(`[${code}] 이미 있음`); continue; }
  const miss = j.refs.filter((f) => !existsSync(f)); if (miss.length) { console.log(`[${code}] 참조 없음 ${miss}`); continue; }
  const input = j.refs.map((f) => ({ type: 'image', mime_type: mime(f), data: readFileSync(f).toString('base64') }));
  input.push({ type: 'text', text: j.prompt });
  for (let a = 0; a <= RETRIES; a++) {
    if (used() >= CAP) { console.log(`호출 상한 ${CAP} 도달 — 중단`); process.exit(4); }
    calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS); let retry = false;
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: j.aspect, image_size: RES.image_size } }), signal: ctrl.signal });
      const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
      appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: `samguk_${mode}`, id: code, attempt: a, status: res.status, model: RES.model, size: RES.image_size, note, extra: extra ? extra.slice(0, 200) : null }) + '\n');
      const img = res.ok ? findImage(json) : null;
      if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${j.out}/${code}_try${n}.jpg`)) n++; renameSync(out, `${j.out}/${code}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${code}] 성공`); }
      else { console.log(`[${code}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`); if (res.status === 429) { console.log('429 — 즉시 중단'); process.exit(3); } retry = res.status >= 500 || (res.ok && !img); }
    } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: `samguk_${mode}`, id: code, attempt: a, status: 'error', note }) + '\n'); console.log(`[${code}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); retry = true; }
    finally { clearTimeout(t); }
    if (!retry) break; await sleep(DELAY_MS * (a + 2) * 3);
  }
  await sleep(DELAY_MS);
}
console.log(`완료: 성공 ${ok}/${codes.length}, 이번 호출 ${calls}, 누계 ${used()}/${CAP}`);
