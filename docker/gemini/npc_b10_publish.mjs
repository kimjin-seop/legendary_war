// npc_b10 시트 반영(호출 없음, 안아트 2026-11-07, npc_b8_publish.mjs 시트 부분과 같은 항목 형식).
//   docker/gemini/npc_b10/sprite_out/{64,64_x2}/hero_<code>_<side>_sheet.png → public/assets/sprites/npc/{64,64_x2}/<code>_<side>_sheet.png
//   조각: public/assets/sprites/npc/unit_npc_b10_sprite_manifest_fragment.json (키 unit.npc.<code>.<ally|enemy>.64.sheet, merge_fragments.mjs kind 'npc_naval' 로 병합)
// QA 단일 출처: docker/gemini/npc_b10/qa.json ({sprite:{code:{verdict,issues,notes}}}). pass/minor 만 게시. 기존 파일은 내용이 다르면 덮어쓰지 않음(충돌 보고).
// 실행(프로젝트 루트): node docker/gemini/npc_b10_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { QA as SHEET_CHECKLIST } from './unit_npc_sprite_style.mjs';
const G = 'docker/gemini/npc_b10', dry = process.argv.includes('--dry');
const P = JSON.parse(readFileSync(`${G}/plan.json`, 'utf8')).items;
const QA = JSON.parse(readFileSync(`${G}/qa.json`, 'utf8'));
const L = existsSync(`${G}/calls_log.jsonl`) ? readFileSync(`${G}/calls_log.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const R = existsSync(`${G}/sprite_preview/pp_report.json`) ? JSON.parse(readFileSync(`${G}/sprite_preview/pp_report.json`, 'utf8')) : {};
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const conflicts = [];
const safeCopy = (a, b) => { if (!existsSync(a)) throw new Error(`없음 ${a}`); if (dry) return; mkdirSync(b.replace(/\/[^/]+$/, ''), { recursive: true });
  if (!existsSync(b)) return copyFileSync(a, b); if (!readFileSync(a).equals(readFileSync(b))) conflicts.push(b); };
// b10: 전원 v2 프롬프트(plan.json)
const items = [], skipped = [];
for (const [code, h] of Object.entries(P)) {
  const q = QA.sprite?.[code];
  if (!q || !['pass', 'minor'].includes(q.verdict)) { skipped.push({ code, tier: h.tier, reason: `qa=${q?.verdict ?? 'not_generated'}` }); continue; }
  for (const side of ['ally', 'enemy']) {
    const f = `${code}_${side}_sheet.png`, d1 = `public/assets/sprites/npc/64/${f}`, d2 = `public/assets/sprites/npc/64_x2/${f}`;
    safeCopy(`${G}/sprite_out/64/hero_${f}`, d1); safeCopy(`${G}/sprite_out/64_x2/hero_${f}`, d2);
    items.push({ key: `unit.npc.${code}.${side}.64.sheet`, path: d1.replace('public/', ''), type: 'spritesheet', frameWidth: 64, frameHeight: 64, size: '192x256', cols: 3, rows: 4,
      row_order: ['down', 'left', 'right', 'up'], col_order: ['walk1', 'idle', 'walk2'], alpha: true, filter: 'NEAREST', scale: 'integer only(x1/x2/x3, nearest)',
      variants: { x2: d2.replace('public/', '') }, bytes: sz(`${G}/sprite_out/64/hero_${f}`), npc: code, name_ko: h.name, side, culture: h.culture, troop: h.troop, mounted: !!h.mounted, tier: h.tier,
      scope: 'npc', deferred: true, fallback: h.fallback.replace(/\.(ally|enemy)\./, `.${side}.`),
      team_marker: side === 'ally' ? '발밑 파랑 받침(A안)' : '발밑 빨강 받침 + 파랑 계열 색만 적색 스왑(hue 185-265)',
      generator: { ...GEN, script: 'docker/gemini/npc_b10_gen.mjs(refs = 병종 3x3 견본 hero_dir_refs + 정식 초상) → hero_dir_pp_v4.mjs(HERO_FACE=npc_b10/facing.json)' },
      prompt_ref: `docker/gemini/npc_b10/plan.json#${code}`, ref_portrait: h.portrait, raw: `${G}/raw/${code}.jpg`, pipeline: R[code],
      calls: L.filter((c) => c.id === code).length, qa: { checked: true, verdict: q.verdict, checklist: SHEET_CHECKLIST, issues: q.issues ?? [], contact: q.contact ?? null },
      verify: true, verify_note: h.verify || '복식 일반화', license: LIC, provenance: 'refs: 3x3 방향 시트 견본(hero_dir_refs, 배치·도트 크기만) + 정식 초상(portrait_campaign/out 또는 portraits/npc)' });
  }
}
const frag = { note: 'npc_b10: b9 미제작 실존 인물 NPC 장수 전용 방향 시트(안아트 2026-11-07, 누계 하드 상한 240회). 직함형·공용 클론·수군(배 표시) 제외. 초상은 기존 키(portrait.<code>)',
  generated: new Date().toISOString(), keyRules: { npc_sprite: 'unit.npc.<npc_code>.<ally|enemy>.64.sheet' }, skipped, items };
if (!dry) writeFileSync('public/assets/sprites/npc/unit_npc_b10_sprite_manifest_fragment.json', JSON.stringify(frag, null, 1));
if (conflicts.length) console.log('덮어쓰지 않음(내용 다름):', conflicts);
console.log(`${dry ? '[dry] ' : ''}시트 ${items.length / 2}명(${items.length}항목), 건너뜀 ${skipped.length}`);
