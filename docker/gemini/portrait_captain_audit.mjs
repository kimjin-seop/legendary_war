// 전장 지휘관·부장 초상 감사(호출 없음, 안아트 2026-11-03, 사용자 요청 "이름 있는 일반 적 부장에게도 기본 초상").
// 대상: database/data/stages_*.json 의 leader / commander(display_name_ko 있는 객체) 전수. FE 규칙(assets.js unitPortraitLogical·portraitCode·npcByName) 근사:
//   ref/npc_ref/hero 코드 -> portrait.<code> | NPC_ASSET_ALIAS | npc_jp_/npc_ink_ 접두 | NPC_CLONE(공용 병사 초상) ; 코드 없으면 이름(name_ko/short_name)으로 로스터 NPC 대조.
//   어느 것도 없으면 'none'(이니셜/실루엣). 출력: docker/gemini/portrait_captain/audit.json
// 실행(저장소 루트): node docker/gemini/portrait_captain_audit.mjs
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
const DD = 'database/data/';
const M = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')); const KEYS = new Set(M.items.map((i) => i.key));
const has = (c) => KEYS.has(`portrait.${c}`);
const src = readFileSync('resources/js/game/assets.js', 'utf8');
const ALIAS = {}; for (const m of src.slice(src.indexOf('const NPC_ASSET_ALIAS'), src.indexOf('const NPC_CLONE')).matchAll(/(npc_[a-z0-9_]+):\s*'([a-z0-9_.]+)'/g)) ALIAS[m[1]] = m[2];
const CLONE = {}; for (const m of src.slice(src.indexOf('const NPC_CLONE'), src.indexOf('const CULTURE_FALLBACK')).matchAll(/(npc_[a-z0-9_]+):\s*\{\s*portrait:\s*'([a-z0-9_.]+)'/g)) CLONE[m[1]] = m[2];
const ROSTER = new Map(), BYNAME = new Map();
for (const f of readdirSync(DD).filter((f) => /^npc_roster.*\.json$/.test(f))) {
  let d; try { d = JSON.parse(readFileSync(DD + f, 'utf8')); } catch { continue; }
  const a = Array.isArray(d) ? d : (d.items ?? d.npcs ?? Object.values(d).find(Array.isArray) ?? []);
  for (const n of a) { if (!n?.code) continue; ROSTER.set(n.code, { ...n, _f: f }); for (const nm of [n.name_ko, n.short_name]) if (nm && !BYNAME.has(nm)) BYNAME.set(nm, n.code); }
}
const HEROES = new Set(); try { const h = JSON.parse(readFileSync(DD + 'heroes.json', 'utf8')); (Array.isArray(h) ? h : h.heroes ?? h.items ?? []).forEach((x) => x?.code && HEROES.add(x.code)); } catch { /* */ }
function resolve(code) {
  if (!code) return null;
  if (has(code)) return { how: 'direct', key: `portrait.${code}` };
  if (ALIAS[code] && has(ALIAS[code])) return { how: 'alias', key: `portrait.${ALIAS[code]}` };
  const rest = code.replace(/^npc_/, '');
  for (const c of [`npc_jp_${rest}`, `npc_ink_${rest}`]) if (has(c)) return { how: 'prefix', key: `portrait.${c}` };
  if (CLONE[code] && has(CLONE[code])) return { how: 'clone', key: `portrait.${CLONE[code]}` };
  return null;
}
const rows = [];
function walk(node, ctx) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((x) => walk(x, ctx)); return; }
  const c2 = { ...ctx }; if (typeof node.code === 'string' && (node.enemy_squads || node.enemy_squad || node.map || node.objective)) { c2.stage = node.code; c2.culture = node.culture ?? ctx.culture; c2.chapter = node.chapter ?? node.shelf_code ?? ctx.chapter; }
  if (node.culture && typeof node.culture === 'string') c2.culture = node.culture;
  for (const k of ['leader', 'commander']) {
    const L = node[k]; if (!L || typeof L !== 'object' || !L.display_name_ko) continue;
    const code = L.ref ?? L.npc_ref ?? L.npc ?? (typeof L.hero === 'string' ? L.hero : null) ?? null;
    let r = resolve(code); let via = code;
    if (!r && !code && BYNAME.has(L.display_name_ko)) { via = BYNAME.get(L.display_name_ko); r = resolve(via); if (r) r.how = 'name:' + r.how; }
    rows.push({ file: ctx.file, stage: c2.stage ?? null, chapter: c2.chapter ?? null, slot: k, kind: L.kind ?? (code ? 'npc' : 'generic'), code: via ?? null, name: L.display_name_ko,
      culture: c2.culture ?? null, troop: L.troop_type ?? L.unit_type ?? null, portrait: r?.key ?? null, how: r?.how ?? 'none' });
  }
  for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') walk(v, c2);
}
for (const f of readdirSync(DD).filter((f) => /^stages_.*\.json$/.test(f))) { let d; try { d = JSON.parse(readFileSync(DD + f, 'utf8')); } catch { continue; } walk(d, { file: f }); }
const uniq = new Map();
for (const r of rows) { const k = `${r.code ?? ''}|${r.name}|${r.culture}|${r.troop}`; const u = uniq.get(k) ?? { ...r, files: new Set(), stages: new Set(), count: 0 }; u.count++; u.files.add(r.file); if (r.stage) u.stages.add(r.stage); uniq.set(k, u); }
const U = [...uniq.values()].map((u) => ({ ...u, files: [...u.files], stages: [...u.stages] }));
const bad = U.filter((u) => u.how === 'none'), clone = U.filter((u) => u.how.endsWith('clone'));
const byFile = {}; for (const u of bad) for (const f of u.files) (byFile[f] ??= []).push(u.name);
const byCT = {}; for (const u of [...bad, ...clone]) { const k = `${u.culture ?? '?'}/${u.troop ?? '?'}`; byCT[k] = (byCT[k] ?? 0) + 1; }
mkdirSync('docker/gemini/portrait_captain', { recursive: true });
writeFileSync('docker/gemini/portrait_captain/audit.json', JSON.stringify({ _note: '전장 지휘관·부장 초상 감사(안아트 2026-11-03). how: direct|alias|prefix|clone(공용 병사 초상)|name:*(이름 대조)|none(초상 없음 = 이니셜)', generated: new Date().toISOString(),
  totals: { slots: rows.length, unique: U.length, none: bad.length, clone: clone.length, resolved: U.length - bad.length - clone.length }, by_file_none: Object.fromEntries(Object.entries(byFile).map(([f, a]) => [f, a.length])), by_culture_troop: byCT,
  none: bad.map(({ files, stages, count, ...r }) => ({ ...r, count, files, stages: stages.slice(0, 6) })), clone: clone.map(({ files, stages, count, ...r }) => ({ ...r, count, files })) }, null, 1));
console.log('slots', rows.length, 'unique', U.length, 'none', bad.length, 'clone', clone.length);
console.log(Object.entries(byFile).map(([f, a]) => `${f}:${a.length}`).join(' | '));
console.log(JSON.stringify(byCT));
