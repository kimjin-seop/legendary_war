// [A3 복사본] hero_v3_fragment.mjs 와 동일 로직, 입력·출력만 a3(prompts_a3.a3_codes, preview_a3, qa_a3, calls_log_a3 → hero_v3c_manifest_fragment.json)
// v3 영웅 전용 시트 manifest 조각 생성(호출 없음). 입력: hero_v3_prompts.json, hero_v3_preview_a3/pp_report.json, hero_v3_qa_a3.json(눈 검수 판정), hero_v3_calls_log_a3.jsonl
// 출력: public/assets/sprites/hero_v3c_manifest_fragment.json (manifest.json 직접 수정 안 함 — build_manifest.mjs MERGE_FRAGMENTS 로 병합)
// 실행: node docker/gemini/hero_v3_fragment.mjs   (qa verdict 가 pass 인 영웅만 items 에 넣고, 나머지는 pending 에 기록)
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
const G = 'docker/gemini', P = (() => { const d = JSON.parse(readFileSync(`${G}/hero_v3_prompts_a3.json`, 'utf8')); return Object.fromEntries(d.a3_codes.map((c) => [c, d.items[c]])); })();
const R = JSON.parse(readFileSync(`${G}/hero_v3_preview_a3/pp_report.json`, 'utf8'));
const Q = JSON.parse(readFileSync(`${G}/hero_v3_qa_a3.json`, 'utf8')).heroes;
const calls = readFileSync(`${G}/hero_v3_calls_log_a3.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const F = JSON.parse(readFileSync(`${G}/hero_v3_facing_a3.json`, 'utf8')).heroes; const items = [], pending = {}, map = {};
for (const [code, h] of Object.entries(P)) {
  const q = Q[code]; if (!q || q.verdict !== 'pass') { pending[code] = q ?? { verdict: 'not_checked' }; continue; }
  const n = calls.filter((c) => c.id === code).length; map[code] = `unit.hero.${code}`;
  for (const side of ['ally', 'enemy']) {
    const p = `assets/sprites/64/hero_${code}_${side}_sheet.png`, s = `assets/sprites/64/hero_${code}_${side}.png`;
    items.push({ key: `unit.hero.${code}.${side}.64.sheet`, path: p, type: 'spritesheet', size: '192x256', frame: [64, 64], frameWidth: 64, frameHeight: 64,
      layout: { cols: ['walk1', 'idle', 'walk2'], rows: ['down', 'left', 'right', 'up'] }, alpha: 'binary(0/255)', scale: 'integer only(x1/x2/x3, nearest)',
      team: side === 'ally' ? 'ally: 원색 + 발밑 파랑 받침(A안)' : (F[code]?.enemy_swap === false ? 'enemy: 의복 원색 유지(영웅별 예외) + 발밑 빨강 받침' : 'enemy: 파랑 계열 슬롯 → 빨강 스왑 + 발밑 빨강 받침'), fallback_key: `unit.hero.${code}.${side}.64`,
      variants: { x2: p.replace('/64/', '/64_x2/') }, bytes: statSync(`public/${p}`).size, hero: code, unit_type: h.unit_type, enemy_commander: !!h.enemy_commander,
      generator: 'gemini interactions', model: 'gemini-nano-banana-2.1', script: 'docker/gemini/hero_v3_gen_a3.mjs → hero_dir_pp_a3.mjs(HERO_FACE=hero_v3_facing_a3.json) → hero_v3_compare.mjs',
      prompt_ref: `docker/gemini/hero_v3_prompts_a3.json#${code}`, facing_ref: `docker/gemini/hero_v3_facing_a3.json#${code}`, raw: `docker/gemini/hero_v3_raw_a3/${code}.jpg`, calls: n,
      pipeline: R[code], qa: { checked: true, verdict: 'pass', checklist: q.checklist, issues: q.issues ?? [], compare: `docker/gemini/hero_v3_preview_a3/compare/${code}_compare.png` },
      verify: !!h.verify, verify_note: h.verify || undefined, license: 'AI 생성(내부 제작, 모델 이용약관 따름) — 외부 배포 전 확인 필요', provenance: 'refs: 병종 방향 시트 raw(좌향 보정본, 배치·도트 크기만) + 정식 초상화 PNG' });
    items.push({ key: `unit.hero.${code}.${side}.64`, path: s, type: 'sprite', size: '64x64', alpha: 'binary(0/255)', hero: code, variants: { x2: s.replace('/64/', '/64_x2/') }, bytes: statSync(`public/${s}`).size, pose: 'front idle(시트 down idle 프레임)', qa: { checked: true, verdict: 'pass' }, source: `unit.hero.${code}.${side}.64.sheet` });
  }
}
const out = { note: '[v3c, 안아트 A3 담당 20명] 영웅 전용 방향 시트 v3 manifest 조각(초상화 기준, 안아트 2026-11-01). hero_v3_manifest_fragment.json 과 별도 파일. manifest.json 직접 수정 안 함 — build_manifest.mjs MERGE_FRAGMENTS 에 이 경로 추가 후 재생성. hero_sprite_map_v2 에서 해당 영웅 항목 삭제(또는 hero_map_v3 값 적용)는 manifest 병합과 동시에 해야 함(먼저 하면 키 미존재로 로드 실패)',
  generated: new Date().toISOString(), calls_total: calls.length, hero_map_v3: map, pending, items };
writeFileSync('public/assets/sprites/hero_v3c_manifest_fragment.json', JSON.stringify(out, null, 1));
console.log(`items ${items.length}, heroes ${Object.keys(map).length}, pending ${Object.keys(pending).length}, calls ${calls.length}`);
