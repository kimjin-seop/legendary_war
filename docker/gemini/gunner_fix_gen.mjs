// 총병 무기 교정(활·쇠뇌 -> 화기) 시트 생성기(안아트 2026-11-07, 사용자 지시 '총병인데 활 든 것 전부 교체').
// 대상: kim_simin(영웅 전용 시트, 활+화살통) / gunner_china(중국 총병 병사, 전용 시트 없어 쇠뇌 궁병 시트로 폴백되던 것).
// 방식: 기존 4문화권 총병과 같음 — 참조 = 같은 인물/같은 병사의 기존 3x3 raw 1장, "복식·색·칸 배치는 그대로, 무기만 화기로". 1건 = 1회 호출(5xx/무이미지만 1회 재시도, 429 즉시 중단).
// 실행(프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/gunner_fix_gen.mjs kim_simin,gunner_china [--force] [--note=..] [--extra=..] [--dry]
// 출력 raw: docker/gemini/gunner_fix/raw/<id>.jpg. 호출 장부(별도): docker/gemini/gunner_fix/calls_log.jsonl. 키는 --env-file 로만(출력·기록 없음)
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES, PIXEL64_STYLE, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const G = 'docker/gemini/gunner_fix', RAW = `${G}/raw`, LOG = `${G}/calls_log.jsonl`;
const NOSYM = '가문 문장·깃발 문양·글자·십자가·종교 상징 없음';
const RULE = '정확히 3열x3행(9칸) 균등 격자, 칸 배치·칸 크기·인물 크기·발 기준선은 참조 시트와 똑같이. 1행 정면, 2행 세 칸 모두 화면 왼쪽을 향한 완전한 옆모습, 3행 뒷모습. 열 = 왼발 내딛음 / 서 있음 / 오른발 내딛음. 9칸 모두 같은 무기를 같은 손에 빠짐없이 듦(정지 칸 포함), 무기가 칸 밖으로 나가지 않게 몸 가까이. 격자선·글자 없음.';
export const JOBS = {
  kim_simin: { ref: 'docker/gemini/hero_dir_raw/kim_simin.jpg',
    who: '첨부한 참조 이미지는 이 캐릭터(16세기 말 조선 장수, 진주성 수성 지휘관)의 기존 3x3 방향 도트 시트다. 얼굴·수염·붉은 상모 달린 투구·남색 두정갑·붉은 허리띠·색·체형·그림체·도트 크기·칸 배치를 참조와 똑같이 유지한다',
    change: '손에 든 활과 등·허리의 화살통·화살을 모두 없애고, 그 대신 두 손으로 짧고 굵은 쇠 총통(긴 나무 자루에 끼운 승자총통형 손 화기, 쇠 총열 짙은 회색)을 몸 앞으로 비스듬히 듦. 허리에 작은 화약 주머니와 심지 줄',
    back: '투구 뒷면·상모·두정갑 등판, 총통 자루가 어깨 위로 비스듬히 보임(화살통 없음)', side: '총통을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)',
    forbid: '활, 활시위, 화살, 화살통, 창, 칼을 손에 듦, 일본식 진가사, 말, 방패, 깃발', verify: '조선 승자총통 형태 일반화(verify)' },
  gunner_china: { ref: 'public/assets/raw/dir64_china/archer.jpg',
    who: '첨부한 참조 이미지는 중국 문화권 병사의 기존 3x3 방향 도트 시트다. 남색 머릿수건·갈색 가죽 미늘 조끼·남색 옷·갈색 장화·체형·그림체·도트 크기·칸 배치를 참조와 똑같이 유지한다(머리카락만 검은색)',
    change: '16세기 명나라 조총병(무명 병사, 20~30대 남성)으로: 손에 든 쇠뇌와 등의 화살통·화살을 모두 없애고, 두 손으로 긴 화승총(조총형: 가는 쇠 총열, 짧은 나무 개머리, 화승 집게)을 앞으로 겨눔. 허리에 작은 화약통 여러 개를 단 끈과 감은 도화선 줄',
    back: '남색 머릿수건 뒷매듭·가죽 조끼 등판·허리 화약통, 총열이 어깨 위로 비스듬히 보임(화살통 없음)', side: '화승총을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)',
    forbid: '쇠뇌, 활, 화살, 화살통, 창, 칼을 손에 듦, 일본식 진가사, 금발, 말, 방패, 깃발', verify: '명대 조총병 복식 일반화(verify)' },
};
// 2차(2026-11-07 팀장 승인 4순위): 총병 영웅 중 칼·창·지휘봉·맨손 9명 -> 같은 인물·복장 그대로 무기만 총. 기마 2명은 말 위에서 총. 잡 id = 게시 시트 코드(hero_<id>_<side>_sheet / npc 시트)
const HERO = (ref, desc, change, back, side, forbid, verify, extraNote = '') => ({ ref,
  who: `첨부한 참조 이미지는 이 인물(${desc})의 기존 3x3 방향 도트 시트다. 얼굴·머리 모양·모자·복장·색·체형${extraNote}·그림체·도트 크기·칸 배치를 참조와 똑같이 유지한다`,
  change, back, side, forbid: `${forbid}, 칼·창·지휘봉을 손에 듦(칼은 허리 칼집에 꽂힌 채로만 허용), 방패, 깃발`, verify });
const MUSKET = '두 손으로 긴 수발총(플린트락 머스킷: 긴 쇠 총열, 나무 개머리, 총검 없음)을 몸 앞에 비스듬히 듦';
const MATCH = '두 손으로 긴 화승총(나무 개머리, 가는 쇠 총열, 화승 집게)을 몸 앞에 비스듬히 듦';
Object.assign(JOBS, {
  wellington: HERO('docker/gemini/hero_v3_raw/wellington.jpg', '19세기 초 영국 장군, 남색 장교 제복·붉은 띠', MUSKET, '남색 제복 등판, 총열이 어깨 위로 비스듬히', '머스킷을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)', '활, 화살', '나폴레옹 전쟁기 장교가 머스킷을 든 연출(게임 각색)'),
  mehmed_ii: HERO('docker/gemini/hero_v4_raw/mehmed_ii.jpg', '15세기 오스만 술탄, 흰 터번·녹색 카프탄·모피 깃', '두 손으로 짧고 굵은 초기 화승총(나무 개머리, 굵은 쇠 총열, 장식 없음)을 몸 앞에 비스듬히 듦', '터번 뒷면·녹색 카프탄 등판, 총열이 어깨 위로 비스듬히', '화승총을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)', '활, 화살, 초승달·글자', '15세기 오스만 초기 화승총 형태 일반화(verify)'),
  gustavus_adolphus: { refs: ['docker/gemini/hero_v4_raw/gustavus_adolphus.jpg', 'docker/gemini/unit_npc_sprite/raw/gunner_europe.jpg'],
    who: '첫 번째 참조 이미지는 이 인물(17세기 스웨덴 국왕)의 기존 3x3 방향 도트 시트(말을 탄 모습)다. 얼굴·금발·수염·흰 레이스 깃·갈색 가죽 상의·남색 망토·색·그림체·도트 크기를 첫 번째 참조와 똑같이 유지한다. 두 번째 참조 이미지는 같은 게임의 도보 총병 시트로, 말 없는 도보 자세·칸 배치·인물 크기·발 기준선·총 드는 자세만 따른다(두 번째 참조 인물의 얼굴·투구·옷은 따르지 않음)',
    change: '말을 완전히 없애고 두 발로 선 도보 인물로 바꿈(갈색 승마 장화와 바지까지 전신이 보임). 손에 든 칼 대신 두 손으로 긴 머스킷 총(나무 개머리, 쇠 총열)을 몸 앞에 비스듬히 듦',
    back: '금발 뒷머리·남색 망토 등판, 총열이 어깨 위로 비스듬히(말 없음)', side: '도보로 왼쪽을 향해 걸으며 머스킷을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)',
    forbid: '말, 말 다리, 안장, 고삐, 활, 화살, 칼·창을 손에 듦(칼은 허리 칼집에만 허용), 투구, 방패, 깃발', verify: '30년 전쟁기 머스킷 일반화. 기승 제거(총병=도보 규칙)' },
  frederick_great_v4: HERO('docker/gemini/hero_v4_raw/frederick_great.jpg', '18세기 프로이센 국왕, 은발 땋은 머리·남색 망토', MUSKET, '땋은 은발·남색 망토 등판, 총열이 어깨 위로 비스듬히', '머스킷을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)', '활, 화살, 스폰툰(창)', '7년 전쟁기 머스킷 일반화'),
  oda_nobunaga: HERO('docker/gemini/hero_v4_raw/oda_nobunaga.jpg', '16세기 일본 다이묘, 상투·남색과 금색 겉옷, 등에 문장', MATCH, '상투·겉옷 등판의 둥근 문장 그대로, 총열이 어깨 위로 비스듬히', '화승총을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)', '활, 화살, 일본도를 손에 듦', '다네가시마 화승총 일반화'),
  suleiman_i: { refs: ['docker/gemini/hero_v4_raw/suleiman_i.jpg', 'docker/gemini/unit_npc_sprite/raw/gunner_middle_east.jpg'],
    who: '첫 번째 참조 이미지는 이 인물(16세기 오스만 술탄)의 기존 3x3 방향 도트 시트(흰 말을 탄 모습)다. 얼굴·수염·큰 흰 터번·갈색 모피 깃·녹색 카프탄·남색 겉옷·색·그림체·도트 크기를 첫 번째 참조와 똑같이 유지한다. 두 번째 참조 이미지는 같은 게임의 도보 총병 시트로, 말 없는 도보 자세·칸 배치·인물 크기·발 기준선·총 드는 자세만 따른다(두 번째 참조 인물의 얼굴·모자·옷은 따르지 않음)',
    change: '말을 완전히 없애고 두 발로 선 도보 인물로 바꿈(발목까지 오는 긴 카프탄 자락과 갈색 장화까지 전신이 보임). 두 손으로 긴 화승총(나무 개머리, 가는 쇠 총열, 장식 없음)을 몸 앞에 비스듬히 듦',
    back: '흰 터번 뒷면·남색 겉옷 등판, 총열이 어깨 위로 비스듬히(말 없음)', side: '도보로 왼쪽을 향해 걸으며 화승총을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)',
    forbid: '말, 말 다리, 안장, 고삐, 활, 화살, 칼·창을 손에 듦(칼은 허리에만 허용), 초승달·글자, 방패, 깃발', verify: '16세기 오스만 화승총 일반화. 기승 제거(총병=도보 규칙)' },
  napoleon_v4: HERO('docker/gemini/hero_v4_raw/napoleon.jpg', '19세기 초 프랑스 황제, 녹색 군복·흰 조끼·남색 망토', MUSKET, '남색 망토 등판, 총열이 어깨 위로 비스듬히', '머스킷을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)', '활, 화살, 지휘봉, 이각모를 새로 씌움', '나폴레옹 전쟁기 머스킷 일반화'),
  kutuzov: HERO('docker/gemini/hero_wave3/sprite_raw/kutuzov.jpg', '19세기 초 러시아 장군, 은발·녹색 군복·흰 바지', MUSKET, '은발 뒷머리·녹색 제복 등판, 총열이 어깨 위로 비스듬히', '머스킷을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)', '활, 화살, 안대를 새로 그림', '나폴레옹 전쟁기 머스킷 일반화'),
  qi_jiguang: HERO('docker/gemini/hero_wave3/sprite_raw/qi_jiguang.jpg', '16세기 명나라 장수, 붉은 깃털 달린 쇠 투구·붉은 미늘 갑옷·금색 어깨 장식', '참조에서 걷기 칸에만 있고 정지 칸(측면·뒷모습)에서 빠진 화승총을 9칸 모두에 한 자루씩 일관되게 듦: 두 손으로 긴 화승총(조총형: 가는 쇠 총열, 나무 개머리)을 몸 앞에 비스듬히. 뒷모습에서 총이 두 자루로 보이지 않게 한 자루만', '투구 뒷면·붉은 갑옷 등판, 총열 한 자루가 어깨 위로 비스듬히', '화승총을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)', '활, 화살, 쇠뇌, 총 두 자루', '명대 조총 일반화'),
  npc_jp_shimazu_yoshihiro: HERO('docker/gemini/npc_naval/raw/npc_jp_shimazu_yoshihiro.jpg', '16세기 말 일본 무장, 회색 수염·짙은 쇠 투구·짙은 갑옷', MATCH, '투구 뒷면·갑옷 등판, 총열이 어깨 위로 비스듬히', '화승총을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)', '활, 화살, 일본도를 손에 듦', '다네가시마 화승총 일반화'),
});
// 오다 r3: 측면 총구가 2회 연속 오른쪽(거꾸로) -> 두 번째 참조로 일본 조총병 시트(측면 총구 왼쪽)를 붙여 자세만 따르게
JOBS.oda_nobunaga = { ...JOBS.oda_nobunaga, refs: ['docker/gemini/hero_v4_raw/oda_nobunaga.jpg', 'docker/gemini/unit_npc_sprite/raw/gunner_japan.jpg'],
  who: JOBS.oda_nobunaga.who.replace('첨부한 참조 이미지는', '첫 번째 참조 이미지는') + '. 두 번째 참조 이미지는 같은 게임의 조총병 시트로, 총 드는 자세(특히 2행 측면: 총구가 화면 왼쪽, 개머리가 몸 쪽)와 칸 배치만 따른다(두 번째 참조 인물의 얼굴·투구·갑옷은 따르지 않음)' };
// 3차(2026-11-07 팀장 추가 점검): 부대 병종 gunner(hero_troop_types.json) 영웅 중 영웅 시트에 총이 없는 3명. 도보 유지, 소지품·무기만 총. 측면 총구 방향 지시를 처음부터 포함
const DIRX = ' 2행(측면) 세 칸 모두 얼굴·몸·발끝이 화면 왼쪽, 총구(쇠 총열 끝)도 화면 왼쪽, 개머리는 몸 쪽. 9칸 모두 총은 정확히 한 자루';
Object.assign(JOBS, {
  leonardo_da_vinci: HERO('docker/gemini/hero_v4_raw/leonardo_da_vinci.jpg', '16세기 초 이탈리아 학자·기술자, 긴 흰 수염·갈색 베레모·적갈색 긴 겉옷', '손에 든 공책·깃펜 대신 두 손으로 긴 초기 화승총(아르케부스: 나무 개머리, 쇠 총열, 장식 없음)을 몸 앞에 비스듬히 듦', '베레모·흰 머리·겉옷 등판, 총열이 어깨 위로 비스듬히', '화승총을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽).' + DIRX, '활, 화살, 공책, 깃펜, 마법 지팡이', '16세기 초 아르케부스 일반화(게임 각색)'),
  date_masamune: HERO('docker/gemini/hero_v4_raw/date_masamune.jpg', '16세기 말~17세기 초 일본 다이묘, 오른쪽 눈 검은 안대·상투·붉은 갑옷 위 남색과 금색 겉옷', '두 손으로 긴 화승총(나무 개머리, 가는 쇠 총열, 화승 집게)을 몸 앞에 비스듬히 듦(일본도는 허리 칼집에만)', '상투·겉옷 등판, 총열이 어깨 위로 비스듬히', '화승총을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽).' + DIRX, '활, 화살, 말, 일본도를 손에 듦', '다네가시마 화승총 일반화'),
  sakamoto_ryoma: HERO('docker/gemini/hero_v4_raw/sakamoto_ryoma.jpg', '19세기 중반 일본 낭인, 흐트러진 검은 머리·검은 하오리·회색 하카마', '두 손으로 긴 서양식 강선 소총(19세기 중반 전장식: 나무 개머리, 긴 쇠 총열, 총검 없음)을 몸 앞에 비스듬히 듦(일본도는 허리 칼집에만)', '흐트러진 검은 뒷머리·하오리 등판, 총열이 어깨 위로 비스듬히', '소총을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽).' + DIRX, '활, 화살, 일본도를 손에 듦', '막말 서양식 소총 일반화'),
});
const build = (id, extra) => { const j = JOBS[id];
  return `${j.who}. 바꾸는 것은 무기뿐이다: ${j.change}. ${NOSYM}.\n방향 디테일: 뒷모습: ${j.back}. 측면: ${j.side}. 64px 1배에서 화기 실루엣(직선 총열)이 활·쇠뇌와 분명히 구분되게.\n` +
    (extra ? `추가 지시(재생성): ${extra}\n` : '') + `시트 규칙: ${RULE}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${j.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`; };
const isMain = process.argv[1] && process.argv[1].endsWith('gunner_fix_gen.mjs');
if (isMain) {
  const ids = (process.argv[2] ?? '').split(',').filter(Boolean);
  for (const c of ids) if (!JOBS[c]) { console.error(`작업 없음: ${c}`); process.exit(1); }
  const force = process.argv.includes('--force');
  const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
  const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
  if (process.argv.includes('--dry')) { for (const c of ids) { console.log('==', c, (JOBS[c].refs ?? [JOBS[c].ref]).map((f) => `${f}:${existsSync(f)}`).join(' ')); console.log(build(c, extra)); } process.exit(0); }
  const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
  const scrub = (s) => String(s).split(key).join('[REDACTED]');
  const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  mkdirSync(RAW, { recursive: true });
  let ok = 0, calls = 0;
  for (const c of ids) {
    const out = `${RAW}/${c}.jpg`;
    if (existsSync(out) && !force) { console.log(`[${c}] 이미 있음(--force 로 재생성)`); continue; }
    const input = [...(JOBS[c].refs ?? [JOBS[c].ref]).map((f) => ({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') })), { type: 'text', text: build(c, extra) }];
    for (let a = 0; a <= 1; a++) {
      calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180_000); let retry = false;
      try {
        const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '1:1', image_size: RES.image_size } }), signal: ctrl.signal });
        const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
        appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'gunner_fix_sprite', id: c, attempt: a, status: res.status, model: RES.model, size: RES.image_size, aspect: '1:1', note, extra: extra ? extra.slice(0, 200) : null }) + '\n');
        const img = res.ok ? findImage(json) : null;
        if (img) { if (existsSync(out)) { let n = 1; while (existsSync(out.replace('.jpg', `_try${n}.jpg`))) n++; renameSync(out, out.replace('.jpg', `_try${n}.jpg`)); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${c}] 성공`); }
        else if (res.status === 429) { console.log(`[${c}] HTTP 429 — 즉시 중단 (호출 ${calls})`); process.exit(3); }
        else { console.log(`[${c}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 300)}`); retry = res.status >= 500 || (res.ok && !img); }
      } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'gunner_fix_sprite', id: c, attempt: a, status: 'error', note }) + '\n'); console.log(`[${c}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); retry = true; }
      finally { clearTimeout(t); }
      if (!retry) break; await sleep(16_000);
    }
    await sleep(3_000);
  }
  console.log(`완료: 성공 ${ok}/${ids.length}, 호출 ${calls}회`);
}
