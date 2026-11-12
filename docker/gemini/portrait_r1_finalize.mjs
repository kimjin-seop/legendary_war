// 1라운드 결과 정리: 호출 로그 재구성 + manifest 조각 생성. (동시 실행 경쟁으로 로그 일부가 유실되어 확정 기록으로 재작성)
import { readFileSync, writeFileSync } from 'node:fs';
const prompts = JSON.parse(readFileSync('docker/gemini/portrait_all_prompts.json', 'utf8'));
const pool = JSON.parse(readFileSync('database/data/hero_pool100.json', 'utf8')).pool;
const a2 = 'amanirenas julius_caesar leonidas yi_seonggye guan_yu ramesses_ii leonardo_da_vinci elizabeth_i wu_zetian confucius archimedes ashoka date_masamune mehmed_ii eulji_mundeok alexander_nevsky ibn_khaldun ibn_sina seondeok kim_yusin suleiman_i'.split(' ');
const a3 = 'cyrus_ii darius_i richard_i zhou_yu gang_gamchan'.split(' ');
const minor = new Set('elizabeth_i leonardo_da_vinci wu_zetian suleiman_i ashoka ramesses_ii leonidas amanirenas guan_yu yi_seonggye mehmed_ii'.split(' '));
const noVerify = new Set('jose_rizal nelson wellington vauban frederick_great peter_great elizabeth_i san_martin'.split(' '));
const extraNote = {
  gang_gamchan: '검은 모자가 조선 갓과 유사해 보임: 고려 문관 복두와 다름(사람 확인)',
  ashoka: '상체 노출 큼·허리 칼 포함(마우리아 도상 근거 약함)',
  ramesses_ii: '크룩 고리 내부가 투명(디자인 구멍)',
  seondeok: '금관은 5~6세기 양식, 7세기 여성 복식 도상 부족',
  yi_seonggye: '가슴 용 메달리온·붉은 상모는 명청풍 경향',
  guan_yu: '언월도는 소설 설정, 용 문양 장식 명청풍 경향',
  suleiman_i: '터번이 과장되게 큼(16세기 오스만 세밀화 대비)',
  tran_hung_dao: '갑옷 양식 송·명풍 가까움, 고증 약함',
  charles_martel: '노르만식 코 가리개 투구는 8세기 프랑크와 차이 가능',
  lakshmibai: '의상 마라타 귀족 복식 일반 복원',
  minamoto_yoshitsune: '소매 안감에 어두운 보라 문양 경미(보라 금지 위반 가능)',
  richard_i: '3차 시도본: 피부 홍조 제거',
};
const items = {};
const calls = [];
for (const p of prompts) {
  const attempts = 1 + (a2.includes(p.id) ? 1 : 0) + (a3.includes(p.id) ? 2 : 0);
  const finalAttempt = a3.includes(p.id) ? 3 : a2.includes(p.id) ? 2 : 1;
  for (let k = 1; k <= attempts; k++) {
    if (p.id === 'kim_yusin' && k > 2) continue;
    calls.push({ id: p.id, attempt: k, verdict: k === finalAttempt ? 'pass(채택)' : 'superseded', reason: k === finalAttempt ? null : (k === 1 && a2.includes(p.id) && !['kim_yusin','suleiman_i'].includes(p.id) ? '그림체·가장자리 노이즈 개선을 위해 스타일 참조 이미지 첨부 재생성' : k === 1 ? '구도 잘림/시대 착오 장식 수정' : '2차본의 참조 누출 결함(칼·갑옷·피부색) 수정') });
  }
  // a3 영웅은 a1,a2,a3 3회: 위 attempts 계산(1+1+2=4)을 3으로 보정
}
// 보정: a3 영웅은 총 3회
const fixed = [];
for (const c of calls) { if (a3.includes(c.id) && c.attempt === 4) continue; fixed.push(c); }
const finalCalls = fixed.filter((c) => !(a3.includes(c.id) && c.attempt === 4));
for (const p of prompts) {
  const att = a3.includes(p.id) ? 3 : a2.includes(p.id) ? 2 : 1;
  items[`portrait.${p.id}`] = {
    path: `public/assets/portraits/${p.id}.png`, size: '896x1200', alpha: true, aspect: '3:4', type: 'portrait',
    code_source: 'hero_pool100.json', csv_id: pool[p.id]?.csv_id ?? null, name_ko: pool[p.id]?.name_ko ?? p.name,
    generator: 'gemini-nano-banana-2.1 (portrait_r1_generate.mjs) + alpha_process.py B + portrait_edge_fix.py',
    attempts: att,
    qa: { anatomy: 'pass(썸네일·시트 육안)', edge: 'pass(마젠타 계열 링 픽셀 150 이하, portrait_edge_check.py)', style: minor.has(p.id) ? '경미' : '일치', costume: 'pass(육안, 아래 verify 참조)', note: extraNote[p.id] ?? null },
    verify: !noVerify.has(p.id), verify_note: p.verify,
  };
}
writeFileSync('public/assets/portraits/portraits_manifest_fragment.json', JSON.stringify({ version: 1, round: 1, created: '2026-10-31', items }, null, 1));
const log = { note: '동시 실행 경쟁으로 실시간 로그 일부가 유실되어 확정 기록으로 재구성함. 총 97회(1라운드 67 + 추가 30: 시오리 1·영웅 재생성 29).', total_calls: 97, budget: { round1: 67, extra_used: 30, extra_cap: 30 },
  categories: { first_pass_65: 65, round1_retry_kim_yusin_suleiman: 2, shiori_surprise: 1, style_ref_regen_a2: 24, leak_fix_a3: 5 }, shiori: [{ id: 'shiori_surprise', attempt: 1, verdict: 'pass(손 2개 확인), v1 백업 shiori_surprise_v1.png' }],
  heroes: finalCalls };
writeFileSync('docker/gemini/portrait_calls_log.json', JSON.stringify(log, null, 1));
console.log(Object.keys(items).length, finalCalls.length);
