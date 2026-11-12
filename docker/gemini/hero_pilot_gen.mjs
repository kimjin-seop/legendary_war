// 초상화 기반 영웅 전용 방향 시트 파일럿: 한 호출에 영웅 2명(16:9, 좌 3열 = 영웅 A, 우 3열 = 영웅 B, 각 3x3 방향 걷기 시트).
// 목적: 영웅 101명 전용 스프라이트의 호출 비용 절감(1명/호출 → 2명/호출) 가능성 시험. 스타일 상수는 style_guide.mjs(단일 출처).
// 참조: 1=병종 3x3 방향 시트(배치·도트 크기·2.5등신 기준만, 인물 외형은 따르지 않음), 2·3=두 영웅의 정식 초상화(얼굴·복식·색 확인용, 그림체는 따르지 않음).
//   교훈(style_guide.mjs 709행 등): 참조 이미지의 얼굴·복식이 복제되는 문제 → 외형은 전부 텍스트로 명시하고 참조 역할을 문장으로 한정.
// 실행: docker run --rm --env-file .env -e MAX_CALLS=1 -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/hero_pilot_gen.mjs <pairId> [--dry]
// 출력: docker/gemini/hero_pilot_raw/<pairId>.jpg (재생성 시 _try<n> 보존). 호출 로그: docker/gemini/calls_log.json(category hero_sprite_pilot, 키 값 기록·출력 없음)
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { RES, PIXEL64_STYLE, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const HARD_CAP = 2; // 이번 파일럿 승인 한도(코디네이터 지시 2026-11-01). 초과 불가
const MAX_CALLS = Math.min(Number(process.env.MAX_CALLS ?? 1), HARD_CAP), TIMEOUT_MS = 150_000;
const OUT = 'docker/gemini/hero_pilot_raw', LOG = 'docker/gemini/calls_log.json', CAT = 'hero_sprite_pilot';

const HEROES = {
  jose_rizal: {
    portrait: 'public/assets/portraits/jose_rizal.png',
    desc: '19세기 말 동남아시아(필리핀) 출신 30세 전후 남성 지식인·의사. 갈색 피부, 짧은 검은 머리(옆가르마, 단정하게 넘김), 얇은 검은 콧수염(턱수염 없음). ' +
      '복식: 무릎 길이의 짙은 회색 프록코트(옷깃에 가는 금색 자수 테두리), 같은 색 조끼, 흰 셔츠의 높은 칼라와 짙은 남색 넥타이, 짙은 회색 바지, 검은 가죽 구두. ' +
      '소품: 왼팔에 갈색 가죽 장정 책 한 권을 끼고 있음. 모자·망토·갑옷·무기·지팡이·두건·로브 없음',
    forbid: '모자, 두건, 베일, 로브, 망토, 턱수염, 갑옷, 무기, 지팡이, 여성 외형, 긴 머리',
  },
  seondeok: {
    portrait: 'public/assets/portraits/seondeok.png',
    desc: '7세기 한반도 신라의 젊은 여왕(여성). 밝은 피부, 검은 머리를 단정히 올려 묶음, 온화한 표정. ' +
      '머리: 금관(이마 둘레 금띠 위로 나뭇가지 모양 세움 장식 3개가 솟고, 양옆으로 짧은 금 드리개와 작은 녹색 곡옥이 달림 — 도트에서는 단순한 금빛 세움 장식으로 읽히면 됨). ' +
      '복식: 넓은 소매의 청록색 긴 포(소매 끝·깃에 금색 테두리, 안쪽 흰 깃), 그 위에 금빛 노란 조끼형 덧옷(앞자락 길게 늘어짐), 짙은 남색 허리띠와 금 장식, 발목까지 오는 갈색 치마. 소품: 두 손을 몸 앞에 가볍게 모음. 갑옷·무기 없음',
    forbid: '남성 외형, 수염, 삭발, 승복, 갑옷, 무기, 일본·중국식 관(면류관·봉관), 흰 두건',
  },
};
const PAIRS = { p1: { layout: 'docker/gemini/hero_dir_refs/dir64_healer.jpg', heroes: ['jose_rizal', 'seondeok'] } };

const RULE =
  '전체 화면을 정확히 6열x3행(18칸) 균등 격자로 나눈다. 왼쪽 3열(1~3열) = 첫 번째 영웅 전용, 오른쪽 3열(4~6열) = 두 번째 영웅 전용. 두 영웅은 서로 섞이지 않고 각자 자기 영역 9칸에만 등장한다. 격자선·칸 테두리·글자 없음, 칸 사이 여백 충분. ' +
  '각 영웅 영역(3열x3행)의 규칙: 1행 정면(아래를 향함), 2행 세 칸 모두 화면 왼쪽을 향한 완전한 옆모습(얼굴 옆선·눈 1개, 몸통·발끝 모두 왼쪽, 3/4 각도·오른쪽을 보는 칸 금지), 3행 뒷모습(얼굴 안 보임). ' +
  '열 순서: 왼발 내딛음(walk1), 서 있음(idle), 오른발 내딛음(walk2) — 걷기 프레임은 다리·팔 끝만 조금 다르고 몸통·머리·소품 위치는 거의 동일. ' +
  '18칸 모두 같은 도트 크기·같은 2.5등신·같은 캐릭터 크기(머리끝~발끝이 칸 높이의 80%)·같은 발 기준선·칸 가로 중앙 정렬, 소품이 칸 밖으로 나가지 않게 몸 가까이.';

function job(pairId) {
  const p = PAIRS[pairId]; if (!p) throw new Error(`pair ${pairId} 없음`);
  const [a, b] = p.heroes.map((c) => ({ code: c, ...HEROES[c] }));
  const refs = [p.layout, a.portrait, b.portrait];
  const prompt =
    '첫 번째 참조 이미지는 3x3 방향 걷기 도트 시트 견본이다. 이 견본에서는 칸 배치·도트 1개의 크기·2.5등신 비율·외곽선 두께만 따른다. 견본 인물의 얼굴·머리 모양·두건·옷·지팡이·성별은 절대 따르지 않는다. ' +
    '두 번째 참조 이미지는 첫 번째 영웅의 초상화, 세 번째 참조 이미지는 두 번째 영웅의 초상화다. 초상화에서는 얼굴 특징·머리 모양·복식 구성·색만 확인하고, 초상화의 그림체·구도·상반신 구도는 따르지 않는다(결과는 반드시 전신 도트 스프라이트).\n' +
    `첫 번째 영웅(왼쪽 3열): ${a.desc}. 금지: ${a.forbid}.\n` +
    `두 번째 영웅(오른쪽 3열): ${b.desc}. 금지: ${b.forbid}.\n` +
    '뒷모습만 봐도 각 영웅임을 알 수 있게 머리 모양·관·코트 자락 실루엣을 또렷하게.\n' +
    `시트 규칙: ${RULE}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
  return { refs, prompt };
}

const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };

const pairId = process.argv[2]; const j = job(pairId);
if (process.argv.includes('--dry')) { console.log(j.refs.join(' | ')); console.log(j.prompt); process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const callLog = JSON.parse(readFileSync(LOG, 'utf8'));
const used = () => callLog.calls.filter((c) => c.category === CAT).length;
if (used() >= HARD_CAP) { console.log(`파일럿 한도 ${HARD_CAP}회 소진(누적 ${used()})`); process.exit(0); }
if (MAX_CALLS < 1) { console.log('MAX_CALLS=0'); process.exit(0); }
const record = (status) => { callLog.calls.push({ ts: new Date().toISOString(), category: CAT, id: pairId, status, size: RES.image_size, round: 'hero_sprite_pilot' }); writeFileSync(LOG, JSON.stringify(callLog, null, 1)); };
mkdirSync(OUT, { recursive: true });
const input = j.refs.map((f) => { if (!existsSync(f)) { console.log(`참조 없음 ${f}`); process.exit(2); } return { type: 'image', mime_type: f.endsWith('.png') ? 'image/png' : 'image/jpeg', data: readFileSync(f).toString('base64') }; });
input.push({ type: 'text', text: j.prompt });
const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
try {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: RES.aspect.wide, image_size: RES.image_size } }), signal: ctrl.signal });
  const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
  record(res.status);
  const img = res.ok ? findImage(json) : null; const out = `${OUT}/${pairId}.jpg`;
  if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${OUT}/${pairId}_try${n}.jpg`)) n++; renameSync(out, `${OUT}/${pairId}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`성공 -> ${out}`); }
  else console.log(`실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 400)}`);
} catch (e) { record('error'); console.log(`오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); }
finally { clearTimeout(t); }
console.log(`파일럿 누적 호출 ${used()}/${HARD_CAP}`);
