// 로비 내비 '캠페인' 아이콘(ui.nav.single) 교체 후보 생성기(안아트 2026-11-14, 사용자 요구: 역사책 느낌, 교차검 제거).
//   입력: public/assets/ui/_candidates_campaign/ref_style.jpg(기존 내비 아이콘 4개, 화풍 참조용)
//   출력: public/assets/ui/_candidates_campaign/raw_<id>.jpg (마젠타 크로마 배경) → nav_campaign_book_pp.py
//   예산: 최대 4회(이 작업). 429 → 즉시 중단. 키는 docker --env-file 로만(출력·기록 금지)
// 실행: docker run --rm --env-file .env -v "<repo>:/app" -w /app node:22 node docker/gemini/nav_campaign_book_gen.mjs <id>
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { RES, UISKIN_PAL as P, CHROMA } from './style_guide.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DIR = 'public/assets/ui/_candidates_campaign', LOG = 'docker/gemini/nav_campaign_book_calls_log.jsonl';
const STYLE = `첨부 이미지의 메뉴 아이콘 4개와 완전히 같은 화풍: 앤티크 금(${P.goldLight}~${P.gold}) 금속 선화풍, 굵고 일정한 짙은 갈금(${P.goldShadow}) 외곽선, ` +
  `2~3단 셀 셰이딩(왼쪽 위 광원), 아주 작은 하이라이트, 단순한 덩어리 형태로 32px 로 줄여도 읽힘, 평면에 가까운 정면 뷰, 같은 선 굵기·같은 명암 단계`;
const BG = `배경은 완전히 균일한 순수 마젠타(${CHROMA}) 단색, 그라데이션·바닥 그림자 없음. 아이콘끼리 넓게 떨어져 있음`;
const NEG = '글자·숫자·문자 같은 무늬·로고·종교 상징 금지, 원형 배경판·테두리 링·격자선 금지, 검·칼 금지, 실사 질감 금지, 마젠타·분홍·보라 색을 아이콘에 쓰지 않음';
const JOBS = {
  trio: ['16:9', `게임 메뉴 아이콘 후보 3개를 가로 한 줄로 배치(각 칸 정중앙, 같은 크기, 칸 테두리 없음). 주제는 모두 '오래된 역사책(고서)':\n` +
    `1) 덮은 두꺼운 가죽 장정 고서 한 권, 정면에서 약간 오른쪽으로 비껴 본 시점이라 왼쪽에 둥근 책등(가로 띠 3줄), 오른쪽·아래에 크림색 종이 가장자리 단면이 보임, 표지 네 모서리에 금박 모서리 쇠장식, 표지 가운데 마름모 금박 장식 하나, 아래로 늘어진 짧은 붉은 책갈피 끈. 표지는 금색 금속 질감.\n` +
    `2) 1과 같은 덮은 고서지만 표지가 짙은 적갈색 가죽(${P.crimson}보다 어두운 갈색 계열)이고 금박 모서리 장식·책등 금띠·금 걸쇠가 있음, 크림색 종이 단면.\n` +
    `3) 1과 같은 금색 덮은 고서 위에 말린 두루마리 하나가 대각선으로 얹혀 있음(두루마리 양 끝에 둥근 축 손잡이), 책 모서리 금박 장식·책등·종이 단면.\n` +
    `스타일: ${STYLE}\n배경: ${BG}\n금지: ${NEG}`],
};
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
const id = process.argv[2]; const extra = process.argv[3] ?? '';
const job = JOBS[id] ?? (extra ? ['1:1', extra] : null); if (!job) { console.log(`[${id}] 작업 없음`); process.exit(1); }
const out = `${DIR}/raw_${id}.jpg`; if (existsSync(out) && !process.argv.includes('--force')) { console.log(`[${id}] 이미 있음`); process.exit(0); }
const input = [{ type: 'text', text: job[1] }, { type: 'image', mime_type: 'image/jpeg', data: readFileSync(`${DIR}/ref_style.jpg`).toString('base64') }];
const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: job[0], image_size: RES.image_size } }) });
const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'nav_campaign_book', id, status: res.status, model: RES.model }) + '\n');
if (res.status === 429) { console.log(`[${id}] 429 — 즉시 중단`); process.exit(3); }
const img = res.ok ? find(json) : null;
if (!img) { console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 200)}`); process.exit(2); }
writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공 ${out}`);
