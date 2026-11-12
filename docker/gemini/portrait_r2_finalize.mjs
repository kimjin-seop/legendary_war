// 초상화 2라운드 정리(2026-11-01): r2 조각 생성 + r1 조각 갱신(요시쓰네 교체·검은 주머니 보정 기록) + qa.json 에 road 배경·시오리 regret 항목 추가.
// 실행: docker run --rm -v "$PWD":/app -w /app node:22 node docker/gemini/portrait_r2_finalize.mjs  (API 호출 없음)
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'public/assets/portraits';
const pool = JSON.parse(readFileSync('database/data/hero_pool100.json', 'utf8')).pool;
const prompts = JSON.parse(readFileSync('docker/gemini/portrait_r2_prompts.json', 'utf8'));
const BACKUP = 'assets/portraits/_backup_20261101'; // manifest 경로 규칙(basePath public 기준)
const GEN = 'gemini-nano-banana-2.1 (portrait_r1_generate.mjs, 참조 2장) + alpha_process.py B(T_lo=40,T_hi=90) + portrait_edge_fix.py(작은 구멍만 메움)';
// 개별 판정(QA 패널 확대 육안: 얼굴·손·가장자리 흰/검 배경)
const R2 = {
  toyotomi_hideyoshi: { att: 1, note: '부채·진바오리, 손 정상' },
  napoleon: { att: 1, note: '장갑 쥔 손 2개 정상, 레지옹 도뇌르 붉은 리본(허용 색)' },
  sakamoto_ryoma: { att: 1, note: '칼집 일본도 왼허리, 손 정상' },
  saigo_takamori: { att: 2, note: '1차본 하오리에 가문 문장(지시 위반) → 2차 민무늬로 해소' },
  alp_arslan: { att: 2, note: '1차본 지시 없는 칼(일본도식 코등이) → 2차 칼 없음. 2차 화살대 자홍색 653px 를 portrait_purple_fix.py 로 갈색 치환' },
  jalal_ad_din: { att: 2, note: '1차본 직선 칼집·원형 코등이(일본도풍) → 2차 휜 사브르·십자 가드' },
  aristotle: { att: 1, note: null },
  socrates: { att: 1, note: '들창코 묘사 약함(경미)' },
  marcus_aurelius: { att: 1, note: '망토 짙은 적갈색(분홍 아님)' },
  fabius_maximus: { att: 1, note: '기본 임계값 후처리에서 튜닉 얼룩 → 낮은 임계값 재후처리로 해소' },
  eleanor_aquitaine: { att: 1, note: null },
  christine_de_pizan: { att: 1, note: '뿔 머리쓰개 끝 가장자리 노이즈 → 재후처리로 해소' },
  maria_theresa: { att: 1, note: '기본 임계값 후처리에서 얼굴·목 갈색 번짐(밝은 분홍 피부가 키색 근처) → 낮은 임계값으로 해소. 왕관 보석 자홍 322px 루비색 치환' },
  empress_jito: { att: 1, note: null },
  murasaki_shikibu: { att: 1, note: null },
  jangsu: { att: 1, note: null },
  seo_hui: { att: 1, note: null },
  sejong: { att: 1, note: '손은 등 뒤(보이지 않음)' },
  heo_jun: { att: 1, note: '흉배가 호랑이(무관용) 문양: 어의는 문관 계열이라 학 흉배가 맞을 수 있음' },
  jeong_yakyong: { att: 1, note: '기본 임계값 후처리에서 소매 회색 얼룩 → 재후처리로 해소' },
  sun_quan: { att: 1, note: '활-시위 사이 검은 면(구 edge_fix 구멍 메움 버그) → 스크립트 수정 후 투명' },
  artemisia_i: { att: 1, note: '활-시위 사이 검은 면 → 수정 후 투명. 여성 근육 흉갑은 창작 요소' },
  harun_rashid: { att: 1, note: '아바스조 검은 터번·의복' },
};
const VERIFY_NOTE_EXTRA = {
  jangsu: '날개 장식 금관은 고구려 조우관·금동관 도상의 일반화, 의복 회문 테두리는 중국식에 가까움',
  seo_hui: '고려 복두는 양옆 각(뿔)이 있는 형태가 일반적: 각 없는 사모형으로 그려짐',
  empress_jito: '아스카 시대 여성 복식(당풍) 일반 복원',
  murasaki_shikibu: '헤이안 뇨보 복식(주니히토에) 간략화, 쥘부채(히오기) 형태',
  sejong: '익선관 뒤 날개가 작게 표현됨',
};
const items = {};
for (const [id, r] of Object.entries(R2)) {
  const p = prompts.find((x) => x.id === id) ?? {};
  items[`portrait.${id}`] = {
    path: `${P}/${id}.png`, size: '896x1200', alpha: true, aspect: '3:4', type: 'portrait', code_source: 'hero_pool100.json',
    csv_id: pool[id]?.csv_id ?? null, name_ko: pool[id]?.name_ko ?? p.name ?? null, generator: GEN, attempts: r.att,
    qa: { anatomy: 'pass(개별 QA 패널 확대: 손·팔 개수)', edge: 'pass(portrait_edge_check 마젠타 링 0px, 검은 주머니 0)', style: '일치', costume: 'pass(육안, verify 참조)', note: r.note },
    verify: true, verify_note: [p.verify, VERIFY_NOTE_EXTRA[id]].filter(Boolean).join(' / '),
  };
}
writeFileSync(`${P}/portraits_manifest_fragment_r2.json`, JSON.stringify({ version: 1, round: 2, created: '2026-11-01', note: '2라운드 23명. QA 패널: public/assets/portraits/_r2/out2/qa/<id>.png', items }, null, 1));

// r1 조각 갱신
const f1p = `${P}/portraits_manifest_fragment.json`; const f1 = JSON.parse(readFileSync(f1p, 'utf8'));
const y = f1.items['portrait.minamoto_yoshitsune'];
y.attempts = 2; y.generator = GEN; y.previous_v1 = { path: `${BACKUP}/minamoto_yoshitsune.png`, note: '1차본(소매 남보라 문양 = 보라 금지 위반, 팔 사이 검은 면)' };
y.qa = { ...y.qa, anatomy: 'pass(QA 패널 확대)', edge: 'pass(마젠타 링 0, 보라 1px)', note: '2026-11-01 재생성: 녹·흰·금 배색, 보라 제거. 타치를 칼날 위로 찬 듯 보임(사람 확인)' };
const POCKET = 'amanirenas date_masamune elizabeth_i gang_gamchan honda_tadakatsu jose_rizal lakshmibai liu_bei minamoto_yoritomo oda_nobunaga ramesses_ii sanada_yukimura seondeok sima_yi taizong_tang vauban xiang_yu yi_seonggye'.split(' ');
for (const id of POCKET) { const it = f1.items[`portrait.${id}`]; if (!it) continue;
  it.post_fix = { date: '2026-11-01', script: 'docker/gemini/portrait_pocket_fix.py', note: '팔-몸통 사이·활 안쪽 등 닫힌 주머니가 검은 면(RGB 0)으로 채워진 결함을 투명 처리(매끈한 영역만, 그림 속 그림자는 유지)', backup: `${BACKUP}/${id}.png` };
  if (id === 'ramesses_ii' && it.qa) it.qa.note = '크룩 고리 내부 투명(검은 면 보정 완료)'; }
f1.updated = '2026-11-01'; writeFileSync(f1p, JSON.stringify(f1, null, 1));

// qa.json
const qp = 'docker/gemini/qa.json'; const qa = JSON.parse(readFileSync(qp, 'utf8'));
qa['bg.battle.road.a'] = { checked: true, verdict: 'pass', issues: ['21:9 1회 생성, CROP_Y 0.8, 320x100 도트·48색·x3, 잔여 마젠타 0, 중앙 1/3 비어 있음, 광원 왼쪽 위', '흙길 띠 0.69~0.92(지면선 0.78), 좌측 나무·돌무더기, 우측 울타리', '경미: 흙길 황토색 채도가 다른 배경보다 약간 높고, 돌무더기가 48색 양자화로 주황 얼룩'] };
qa['bg.battle.road.b'] = { checked: true, verdict: 'pass', issues: ['21:9 1회 생성, 하단 정렬 크롭, 320x100 도트·48색·x3, 잔여 마젠타 0, 중앙 1/3 비어 있음', '판석 포장길 0.45~1.0 평탄(지면선 0.78), 흐린 하늘, 좌측 고목·우측 돌담'] };
qa['portrait.shiori.regret'] = { ...(qa['portrait.shiori'] ?? { checked: true, verdict: 'pass', issues: [] }), issues: [...((qa['portrait.shiori'] ?? {}).issues ?? []), '2026-11-01 팔 사이 검은 면 투명 보정(portrait_pocket_fix.py), 백업 public/assets/portraits/_backup_20261101/shiori/shiori_regret.png'] };
writeFileSync(qp, JSON.stringify(qa, null, 1));
console.log('r2', Object.keys(items).length, 'pocket', POCKET.length);
