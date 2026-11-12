// npc_missing 초상 반영(호출 없음, 안아트 2026-11-09, npc_ch26_publish.mjs 초상 부분 사본). manifest.json·assets.js 는 건드리지 않음(병합은 윤프론: merge_fragments.mjs).
//   docker/gemini/npc_missing/portraits/out/<code>.png(+thumb/<code>.webp) → public/assets/portraits/npc/<code>.png + npc/thumb/<code>.webp
//   조각 public/assets/portraits/portrait_npc_missing_manifest_fragment.json (키 portrait.<code> + .thumb)
// QA 단일 출처: docker/gemini/npc_missing/qa.json ({portrait:{code:{verdict,issues,notes}}}). pass/minor 만 게시. 기존 파일과 내용이 다르면 덮어쓰지 않음(exit 2).
// 실행(프로젝트 루트): node docker/gemini/npc_missing_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { P_MISS, OUT_P, LOG, G, PRIORITY, ALIAS_ONLY } from './npc_missing_style.mjs';
const dry = process.argv.includes('--dry');
const QA = JSON.parse(readFileSync(`${G}/qa.json`, 'utf8'));
const L = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const ok = (q) => q && ['pass', 'minor'].includes(q.verdict);
const conflicts = [];
const safeCopy = (a, b) => { if (!existsSync(a)) throw new Error(`없음 ${a}`); if (dry) return; mkdirSync(b.replace(/\/[^/]+$/, ''), { recursive: true });
  if (!existsSync(b)) return copyFileSync(a, b); if (!readFileSync(a).equals(readFileSync(b))) conflicts.push(b); };
const items = [], skipped = [];
for (const code of PRIORITY) {
  const h = P_MISS[code]; const q = QA.portrait?.[code]; if (!ok(q)) { skipped.push({ code, reason: `qa=${q?.verdict ?? 'not_generated'}` }); continue; }
  const d = `public/assets/portraits/npc/${code}.png`, t = `public/assets/portraits/npc/thumb/${code}.webp`;
  safeCopy(`${OUT_P}/${code}.png`, d); safeCopy(`${OUT_P}/thumb/${code}.webp`, t);
  const calls = L.filter((c) => c.id === `portrait_${code}`);
  items.push({ key: `portrait.${code}`, path: d.replace('public/', ''), type: 'portrait', subtype: 'npc', size: '896x1200', ratio: '3:4', alpha: true, bytes: sz(`${OUT_P}/${code}.png`),
    npc: code, roster_code: code, name_ko: h.name, side: h.side, era: h.era, culture: h.culture, used_in: h.used_in, priority: PRIORITY.indexOf(code) + 1,
    expressions: ['neutral'], expression_fallback: '모든 expr → neutral', deferred: true,
    thumb: { key: `portrait.${code}.thumb`, path: t.replace('public/', ''), size: '256x343', bytes: sz(`${OUT_P}/thumb/${code}.webp`) },
    generator: { ...GEN, script: 'docker/gemini/npc_missing_gen.mjs p(portrait_campaign_style.mjs job() + npc_missing_style.mjs P_MISS) → npc_missing_portraits_pp.sh(portrait_alpha_batch.sh, alpha_process.py B)' },
    prompt_ref: `docker/gemini/npc_missing_style.mjs P_MISS.${code}`, style_ref: h.ref.replace('public/', ''), raw: `${G}/portraits/raw/portrait_${code}.jpg`,
    calls: calls.length, calls_ok: calls.filter((c) => c.status === 200).length, qa: { checked: true, ...q }, verify: true, verify_note: h.verify, license: LIC,
    provenance: `스타일 참조 ${h.ref.replace('public/', '')}(그림체·구도만), 인물 설명은 프롬프트 생성` });
}
if (conflicts.length) { console.log('덮어쓰지 않음(내용 다름) — 중단:', conflicts); process.exit(2); }
if (!dry) writeFileSync('public/assets/portraits/portrait_npc_missing_manifest_fragment.json', JSON.stringify({
  note: `초상 없던 NPC 초상 ${items.length}키(+thumb, 안아트 2026-11-09): dialogueData NPC_NAMES ↔ manifest portrait.* 대조 누락 26명 중 25명 생성. npc_cleitus 는 생성 안 함 → FE NPC_ASSET_ALIAS 에 npc_cleitus: 'npc_cleitus_black' 추가 권고(같은 인물 기존 초상). 생성 정의 npc_missing_style.mjs`,
  generated: new Date().toISOString(), keyRules: { portrait: 'portrait.<code> (+ .thumb). 표정 neutral 1종' }, alias_recommendations: ALIAS_ONLY, skipped, items }, null, 1));
console.log(`${dry ? '[dry] ' : ''}초상 ${items.length}, 건너뜀 ${JSON.stringify(skipped)}`);
