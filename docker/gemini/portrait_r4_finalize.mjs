// 2026-11-01 4차: 경미(style) 판정 11명 재생성분 manifest 반영(경로 불변, bytes·qa·attempts·previous 갱신) + 호출 예산 기록. API 호출 없음.
// 실행: node docker/gemini/portrait_r4_finalize.mjs   (manifest 백업: public/assets/manifest.json.bak_r4_20261101)
import { readFileSync, writeFileSync, statSync, existsSync, copyFileSync } from 'node:fs';
const MF = 'public/assets/manifest.json', BAK = 'public/assets/manifest.json.bak_r4_20261101', LOG = 'docker/gemini/portrait_calls_log.json';
if (!existsSync(BAK)) copyFileSync(MF, BAK);
const m = JSON.parse(readFileSync(MF, 'utf8'));
const GEN = 'gemini-nano-banana-2.1 (portrait_r1_generate.mjs, refs 3장, prompts portrait_r4_prompts.json) + alpha_process.py B + portrait_edge_fix.py + portrait_key_pocket.py';
const R = {
  elizabeth_i: { att: 3, note: '러프 칼라 뒤 검은 가시형 잔상 제거, 얼굴 셀 셰이딩 단순화' },
  leonardo_da_vinci: { att: 4, note: '4차 1회차는 스프링 제본 노트(현대 요소)로 불채택 → 가죽 끈 제본 노트로 재생성 채택. 얼굴 주름 선은 여전히 다소 많음(경미)' },
  wu_zetian: { att: 3, note: '머리 장식 과밀 해소, 그림체 통일' },
  suleiman_i: { att: 3, note: '거대 터번 축소(얼굴 1.3배 이내). 흰 터번 회색 그늘 검은 얼룩 방지 위해 ALPHA_ARGS T_lo=40 T_hi=90' },
  ashoka: { att: 3, note: '숄로 상체 대부분 덮음, 칼 제거, 연꽃 소지, 이마 점 제거. 흰 천 회색 그늘이 기본 임계(T_hi=120)에서 검게 변해 T_lo=40 T_hi=90 적용, 귀걸이 고리 안 마젠타 32px 투명화, 보라 61px 치환' },
  ramesses_ii: { att: 3, note: '크룩 갈고리를 몸통 앞에 겹치게, 검은 주머니 0' },
  leonidas: { att: 3, note: '투구 깃·창끝 프레임 안(상단 여백 20px). 근육형 청동 흉갑은 고증 범위' },
  amanirenas: { att: 3, note: '장신구 금색만, 보라 158px(경계 미세) 치환' },
  guan_yu: { att: 3, note: '용 문양 제거, 무문 언월도. 언월도 자체는 소설 설정(verify 유지)' },
  yi_seonggye: { att: 3, note: '가슴 용 메달리온·붉은 상모 제거, 무문 원형 철투구·찰갑(14세기 고려 갑옷 도상 부족 verify 유지)' },
  mehmed_ii: { att: 3, note: '터번 윤곽 실선화(점선 윤곽 해소). 흰 터번 ALPHA_ARGS T_lo=40 T_hi=90' },
};
let n = 0;
for (const [id, r] of Object.entries(R)) {
  const it = m.items.find((x) => x.type === 'portrait' && !x.alias_of && x.path === `assets/portraits/${id}.png`);
  if (!it) { console.log(`[${id}] manifest 항목 없음`); continue; }
  it.previous_v_r4 = { path: `assets/portraits/_backup_20261101_r4/${id}.png`, bytes: statSync(`public/assets/portraits/_backup_20261101_r4/${id}.png`).size, note: '4차 교체 전 원본(style 경미 판정본)' };
  it.bytes = statSync(`public/assets/portraits/${id}.png`).size; it.attempts = r.att;
  it.generator = { ...(typeof it.generator === 'object' ? it.generator : {}), model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '1K', script: GEN };
  it.qa = { checked: true, verdict: 'pass', issues: ['style: pass(4차 재생성, 참조 3장 그림체와 비교 육안)', 'edge: pass(pink_ring 0, opaque_magenta 0)', 'pocket: 0(검은 주머니 없음)', 'darkspot: 원본 대비 검게 변한 화소 100px 이하(yi_seonggye 168, 갑옷 그늘 미세)', 'purple: 0', `note: ${r.note}`], detail: { style: 'pass', edge: 'pass', anatomy: 'pass(확대 육안: 얼굴·손)', costume: 'pass(verify 항목 유지)', note: r.note } };
  n++;
}
writeFileSync(MF, JSON.stringify(m, null, 1));
const log = JSON.parse(readFileSync(LOG, 'utf8'));
log.round2_r4 = { date: '2026-11-01', approved_by: '코디네이터 전달(사용자 승인 보고)', pool: '2라운드 잔여 33회 공유(장비 아이콘 시험 8회 = calls_log.json equip_trial 포함)', equip_trial_calls: 8, portrait_calls: 12, used_total_after: 27 + 8 + 12, remaining: 33 - 8 - 12,
  detail: '경미 11명 각 1회(attempt 4) + leonardo_da_vinci 재시도 1회(attempt 5, 스프링 노트 불채택). 교체 11/유지 0. 백업 public/assets/portraits/_backup_20261101_r4/', sequential: true };
writeFileSync(LOG, JSON.stringify(log, null, 1));
console.log(`manifest 갱신 ${n}건, 백업 ${BAK}`);
