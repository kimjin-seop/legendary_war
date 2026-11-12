// 영웅 전용 시트 v4 반영(호출 없음): hero_v4_qa.json 에서 pass 인 영웅 시트를 public/assets/sprites/{64,64_x2}/ 로 복사(기존 파일 덮어쓰기 금지)
// + manifest 조각 public/assets/sprites/hero_v4_manifest_fragment.json + 영웅 101명 전원 매핑 public/assets/sprites/hero_sprite_map_v4.json 작성.
// manifest.json·hero_sprite_map*.json 본 파일은 수정하지 않음(병합·FE 연결은 윤프론).
// 파일명 규칙: 기존 manifest 에 unit.hero.<asset> 키가 없는 영웅 = hero_<asset>_<side>[_sheet].png (키 base unit.hero.<asset>)
//              기존 키가 있는데 v4 로 교체하는 영웅 = hero_<asset>_v4_<side>[_sheet].png (키 base unit.hero.<asset>_v4, 기존 파일·키 보존)
// 실행(프로젝트 루트): node docker/gemini/hero_v4_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync } from 'node:fs';
const G = 'docker/gemini', OUT = `${G}/hero_v4_out`, PUB = 'public/assets/sprites', dry = process.argv.includes('--dry');
const Q = JSON.parse(readFileSync(`${G}/hero_v4_qa.json`, 'utf8')).heroes;
const P = JSON.parse(readFileSync(`${G}/hero_v4_prompts.json`, 'utf8')).items;
const F = JSON.parse(readFileSync(`${G}/hero_v4_facing.json`, 'utf8')).heroes;
const R = existsSync(`${G}/hero_v4_preview/pp_report.json`) ? JSON.parse(readFileSync(`${G}/hero_v4_preview/pp_report.json`, 'utf8')) : {};
const M = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8'));
const audit = JSON.parse(readFileSync('public/assets/sprite_audit.json', 'utf8')).heroes;
const ALIAS = { gwak_jae_u: 'gwak_jaeu', kim_si_min: 'kim_simin' }; // 영웅 code → 에셋 code
const have = new Set(M.items.map((i) => i.key));
const logs = ['hero_v4_calls_log.jsonl', 'hero_v3_calls_log.jsonl', 'hero_v3_calls_log_a2.jsonl', 'hero_v3_calls_log_a3.jsonl']
  .filter((f) => existsSync(`${G}/${f}`)).flatMap((f) => readFileSync(`${G}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => ({ ...JSON.parse(l), _log: f })));
const items = [], map = {}, pending = {}, copied = [], kept = [];
for (const h of audit) {
  const code = h.code, asset = ALIAS[code] ?? code, q = Q[code];
  if (!q) { pending[code] = { verdict: 'not_checked' }; continue; }
  if (q.verdict !== 'pass') { pending[code] = q; if (have.has(`unit.hero.${asset}.ally.64.sheet`)) map[code] = `unit.hero.${asset}`; continue; }
  if (q.source === 'existing') { map[code] = `unit.hero.${asset}`; kept.push(code); continue; } // 기존 시트 재검증 통과 — 키 그대로
  const replace = have.has(`unit.hero.${asset}.ally.64.sheet`), base = replace ? `${asset}_v4` : asset; map[code] = `unit.hero.${base}`;
  const calls = logs.filter((c) => c.id === asset || c.id === code);
  for (const side of ['ally', 'enemy']) {
    for (const [suf, kind] of [['_sheet', 'sheet'], ['', 'single']]) for (const sc of ['64', '64_x2']) {
      const src = `${OUT}/${sc}/hero_${asset}_${side}${suf}.png`, dst = `${PUB}/${sc}/hero_${base}_${side}${suf}.png`;
      if (!existsSync(src)) throw new Error(`없음 ${src}`);
      if (existsSync(dst)) throw new Error(`덮어쓰기 금지: ${dst} 이미 있음`);
      if (!dry) copyFileSync(src, dst); copied.push(dst);
    }
    const p = `assets/sprites/64/hero_${base}_${side}_sheet.png`, s = `assets/sprites/64/hero_${base}_${side}.png`, size = (f) => (dry ? statSync(`${OUT}/64/${f.split('/').pop().replace(`hero_${base}_`, `hero_${asset}_`)}`) : statSync(`public/${f}`)).size;
    items.push({ key: `unit.hero.${base}.${side}.64.sheet`, path: p, type: 'spritesheet', size: '192x256', frame: [64, 64], frameWidth: 64, frameHeight: 64,
      layout: { cols: ['walk1', 'idle', 'walk2'], rows: ['down', 'left', 'right', 'up'] }, alpha: 'binary(0/255)', scale: 'integer only(x1/x2/x3, nearest)',
      team: side === 'ally' ? 'ally: 원색 + 발밑 파랑 받침(A안)' : `enemy: ${F[asset]?.enemy_swap === 'none' ? '의복 원색 유지' : F[asset]?.enemy_swap ? `hue ${JSON.stringify(F[asset].enemy_swap)} 범위만 빨강 스왑` : '파랑 계열 → 빨강 스왑'} + 발밑 빨강 받침`,
      fallback_key: `unit.hero.${base}.${side}.64`, variants: { x2: p.replace('/64/', '/64_x2/') }, bytes: size(p), hero: code, asset_code: asset, unit_type: P[asset]?.unit_type ?? h.unit_type,
      replaces: replace ? `unit.hero.${asset}.${side}.64.sheet(보존, v4 로 교체 권장)` : undefined,
      generator: 'gemini interactions', model: 'gemini-nano-banana-2.1', script: 'docker/gemini/hero_v4_gen.mjs(hero_v4_gen.sh) → hero_dir_pp_v4.mjs(hero_v4_pp.sh, HERO_FACE=hero_v4_facing.json) → hero_v3_compare.mjs',
      prompt_ref: `docker/gemini/hero_v4_prompts.json#${asset}`, facing_ref: `docker/gemini/hero_v4_facing.json#${asset}`, raw: `docker/gemini/hero_v4_raw/${asset}.jpg`, calls: calls.length,
      pipeline: R[asset], qa: { checked: true, verdict: 'pass', checklist: q.checklist, issues: q.issues ?? [], compare: `docker/gemini/hero_v4_preview/compare/${asset}_compare.png` },
      verify: !!P[asset]?.verify, verify_note: P[asset]?.verify || undefined, license: 'AI 생성(내부 제작, 모델 이용약관 따름) — 외부 배포 전 확인 필요', provenance: 'refs: 병종 방향 시트 raw(배치·도트 크기만) + 정식 초상화 PNG' });
    items.push({ key: `unit.hero.${base}.${side}.64`, path: s, type: 'sprite', size: '64x64', alpha: 'binary(0/255)', hero: code, variants: { x2: s.replace('/64/', '/64_x2/') }, bytes: size(s), pose: 'front idle(시트 down idle 프레임)', qa: { checked: true, verdict: 'pass' }, source: `unit.hero.${base}.${side}.64.sheet` });
  }
}
const frag = { note: '영웅 전용 방향 시트 v4 manifest 조각(영웅 101명 1:1 전용 시트, 초상화 기준, 안아트 2026-11-01). manifest.json 직접 수정 안 함 — build_manifest.mjs MERGE_FRAGMENTS 에 이 경로 추가 후 재생성. 기존 키는 그대로 두고 교체분은 unit.hero.<asset>_v4 신규 키. 영웅→키 매핑은 hero_map_v4(=hero_sprite_map_v4.json)',
  generated: new Date().toISOString(), heroes_total: audit.length, mapped: Object.keys(map).length, new_or_replaced: items.length / 4, kept_existing: kept, hero_map_v4: map, pending, items };
const hmap = { version: 4, created_at: '2026-11-01', _note: '영웅 101명 → 전용 시트 키 base(완전 매핑). FE: heroes[<영웅 code>] 를 base 로 `${base}.${side}.64.sheet` 조회. 이 맵은 hero_sprite_map.json·v2 보다 우선(v2 의 문화권 병종 재매핑은 v4 로 전부 대체). manifest 조각(hero_v4_manifest_fragment.json) 병합과 동시에 적용(먼저 적용하면 키 미존재로 로드 실패)', heroes: map };
if (!dry) { writeFileSync(`${PUB}/hero_v4_manifest_fragment.json`, JSON.stringify(frag, null, 1)); writeFileSync(`${PUB}/hero_sprite_map_v4.json`, JSON.stringify(hmap, null, 1)); }
console.log(`${dry ? '[dry] ' : ''}mapped ${Object.keys(map).length}/${audit.length}, new/replaced ${items.length / 4}, kept ${kept.length}, pending ${Object.keys(pending).length}, files ${copied.length}`);
if (Object.keys(pending).length) console.log('pending:', Object.keys(pending).join(','));
