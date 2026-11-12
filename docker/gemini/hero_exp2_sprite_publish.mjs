// 신규 가챠 영웅 20명 전용 방향 시트 반영(호출 없음, 안아트 2026-11-06, hero_exp1_sprite_publish.mjs 사본).
//   docker/gemini/hero_exp2/sprite_out/{64,64_x2}/hero_<code>_<side>[_sheet].png → public/assets/sprites/{64,64_x2}/ (기존 파일 덮어쓰기 금지)
//   manifest 조각: public/assets/sprites/hero_exp2_sprite_manifest_fragment.json (키 unit.hero.<code>.<ally|enemy>.64[.sheet], v4 와 같은 항목 형식)
//   영웅 → 시트 매핑: public/assets/sprites/hero_sprite_map_v4.json heroes 에 <code>: unit.hero.<code> 추가(백업 .bak-heroexp2-20261106, 기존 항목 불변)
// QA 단일 출처: docker/gemini/hero_exp2/sprite_qa.json ({code:{verdict,checklist,issues}}). pass/minor 만 게시.
// 실행(프로젝트 루트): node docker/gemini/hero_exp2_sprite_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync } from 'node:fs';
const G = 'docker/gemini/hero_exp2', OUT = `${G}/sprite_out`, PUB = 'public/assets/sprites', dry = process.argv.includes('--dry');
const Q = JSON.parse(readFileSync(`${G}/sprite_qa.json`, 'utf8'));
const P = JSON.parse(readFileSync(`${G}/sprite_prompts.json`, 'utf8')).items;
const R = existsSync(`${G}/sprite_preview/pp_report.json`) ? JSON.parse(readFileSync(`${G}/sprite_preview/pp_report.json`, 'utf8')) : {};
const L = existsSync(`${G}/sprite_calls_log.jsonl`) ? readFileSync(`${G}/sprite_calls_log.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const MAPF = `${PUB}/hero_sprite_map_v4.json`, hmap = JSON.parse(readFileSync(MAPF, 'utf8'));
const items = [], pending = {}, added = {};
for (const [code, h] of Object.entries(P)) {
  const q = Q[code];
  if (!q || !['pass', 'minor'].includes(q.verdict)) { pending[code] = q ?? { verdict: 'not_checked' }; continue; }
  const base = `unit.hero.${code}`;
  if (hmap.heroes[code] && hmap.heroes[code] !== base) throw new Error(`hero_sprite_map_v4 에 ${code} 가 다른 키로 있음`);
  for (const side of ['ally', 'enemy']) {
    for (const suf of ['_sheet', '']) for (const sc of ['64', '64_x2']) {
      const src = `${OUT}/${sc}/hero_${code}_${side}${suf}.png`, dst = `${PUB}/${sc}/hero_${code}_${side}${suf}.png`;
      if (!existsSync(src)) throw new Error(`없음 ${src}`);
      if (existsSync(dst) && !readFileSync(src).equals(readFileSync(dst))) throw new Error(`덮어쓰기 금지: ${dst}`);
      if (!dry) copyFileSync(src, dst);
    }
    const p = `assets/sprites/64/hero_${code}_${side}_sheet.png`, s = `assets/sprites/64/hero_${code}_${side}.png`;
    const size = (f) => statSync(`${OUT}/64/${f.split('/').pop()}`).size;
    items.push({ key: `${base}.${side}.64.sheet`, path: p, type: 'spritesheet', size: '192x256', frame: [64, 64], frameWidth: 64, frameHeight: 64,
      layout: { cols: ['walk1', 'idle', 'walk2'], rows: ['down', 'left', 'right', 'up'] }, alpha: 'binary(0/255)', scale: 'integer only(x1/x2/x3, nearest)',
      team: side === 'ally' ? 'ally: 원색 + 발밑 파랑 받침(A안)' : 'enemy: 파랑 계열 → 빨강 스왑 + 발밑 빨강 받침',
      fallback_key: `${base}.${side}.64`, variants: { x2: p.replace('/64/', '/64_x2/') }, bytes: size(p), hero: code, asset_code: code, unit_type: h.unit_type, mounted: !!h.mounted,
      generator: 'gemini interactions', model: 'gemini-nano-banana-2.1', script: 'docker/gemini/hero_exp2_sprite_gen.mjs(hero_v4_gen.mjs 사본) → hero_dir_pp_v4.mjs(HERO_FACE=hero_exp1/sprite_facing.json) → hero_v3_compare.mjs',
      prompt_ref: `docker/gemini/hero_exp2/sprite_prompts.json#${code}`, raw: `${G}/sprite_raw/${code}.jpg`, calls: L.filter((c) => c.id === code).length,
      pipeline: R[code], qa: { checked: true, verdict: q.verdict, checklist: q.checklist, issues: q.issues ?? [], compare: `${G}/sprite_preview/compare/${code}_compare.png` },
      verify: true, verify_note: h.verify || '복식 일반화', license: 'AI 생성(내부 제작, 모델 이용약관 따름) — 외부 배포 전 확인 필요', provenance: 'refs: 병종 방향 시트 견본(hero_dir_refs, 배치·도트 크기만) + 정식 초상화 PNG(public/assets/portraits/<code>.png)' });
    items.push({ key: `${base}.${side}.64`, path: s, type: 'sprite', size: '64x64', alpha: 'binary(0/255)', hero: code, variants: { x2: s.replace('/64/', '/64_x2/') }, bytes: size(s), pose: 'front idle(시트 down idle 프레임)', qa: { checked: true, verdict: q.verdict }, source: `${base}.${side}.64.sheet` });
  }
  added[code] = base;
}
const frag = { note: '신규 가챠 영웅 20명(고대 지중해·유럽·스텝·인도·페르시아·이베리아) 전용 방향 시트 조각(안아트 2026-11-06). 키 규칙은 hero_v4 와 동일(unit.hero.<code>.<side>.64[.sheet]). 매핑은 hero_sprite_map_v4.json 에 추가(병합과 한 묶음)',
  generated: new Date().toISOString(), hero_map_added: added, pending, items };
if (!dry) {
  writeFileSync(`${PUB}/hero_exp2_sprite_manifest_fragment.json`, JSON.stringify(frag, null, 1));
  if (!existsSync(`${MAPF}.bak-heroexp2-20261106`)) copyFileSync(MAPF, `${MAPF}.bak-heroexp2-20261106`);
  Object.assign(hmap.heroes, added); hmap._note_exp2 = '2026-11-06 안아트: 신규 가챠 영웅 20명 추가(hero_exp2_sprite_manifest_fragment.json 병합과 한 묶음)';
  writeFileSync(MAPF, JSON.stringify(hmap, null, 1));
}
console.log(`${dry ? '[dry] ' : ''}게시 ${Object.keys(added).length}, 보류 ${JSON.stringify(Object.keys(pending))}, 항목 ${items.length}`);
