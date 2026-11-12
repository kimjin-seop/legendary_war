// 스테이지 지휘관·부대 초상 해석 전수 감사(읽기 전용, 안아트 2026-11-04). 생성·수정 없음.
// 입력: database/data/stages_*.json(leader/commander) + public/assets/manifest.json + captain_map.json + resources/js/game/assets.js(NPC_ASSET_ALIAS·NPC_CLONE 정적 추출)
// 해석 순서(assets.js unitPortraitLogical 근사): ① 고유 portrait.<ref>(portraitCode: 그대로 → npc_ 접두 → 공용 클론 → 별칭 → npc_jp_/npc_ink_ 접두) ② 기본 부장 portrait.captain.*(이름 규칙 → 스테이지 접두 → 문화권)
//   ③ 병종 초상 portrait.troop.<culture|default>.<troop>(부대 유닛만) ④ 없음(이니셜/실루엣). 지휘관(kind != troop)은 ③을 쓰지 않음(코드 그대로).
// 두 상황을 따로 계산: battle(전투: CAPT.stage = 스테이지 코드) / chip(서가 칩·도감 등 스테이지 문맥 없음: stage 없이)
// 실행(저장소 루트): node docker/gemini/portrait_audit_stages.mjs  → docker/gemini/portrait_audit.json
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
const man = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')); const M = new Map(man.items.map((i) => [i.key, i]));
const has = (k) => M.has(k) && existsSync(`public/${M.get(k).path}`);
const cap = JSON.parse(readFileSync('public/assets/portraits/captain/captain_map.json', 'utf8'));
const src = readFileSync('resources/js/game/assets.js', 'utf8');
const ALIAS = Object.fromEntries([...(src.match(/const NPC_ASSET_ALIAS = \{([\s\S]*?)\n\};/)?.[1] ?? '').matchAll(/(npc_[a-z0-9_]+): *'([a-z0-9_]+)'/g)].map((m) => [m[1], m[2]]));
const CLONE = Object.fromEntries([...(src.match(/const NPC_CLONE = \{([\s\S]*?)\n\};/)?.[1] ?? '').matchAll(/(npc_[a-z0-9_]+): *\{[^}]*portrait: *'([a-z0-9_.]+)'/g)].map((m) => [m[1], m[2]]));
function unique(ref) {
  if (!ref) return null; const c = String(ref).replace(/^npc:/, ''); const r = c.replace(/^npc_/, '');
  const cands = [c, /^npc_/.test(c) ? null : `npc_${c}`, CLONE[c], ALIAS[c], `npc_jp_${r}`, `npc_ink_${r}`, r].filter(Boolean);
  const k = cands.find((x) => has(`portrait.${x}`)); return k ? `portrait.${k}` : null;
}
const alias0 = { heavy: 'sword', infantry: 'sword', mage: 'sword', healer: 'sword', gun: 'archer', gunner: 'archer', bow: 'archer', lance: 'spear', sailor: 'naval', monk: 'sword', ...(cap.troop_alias ?? {}) };
const G = cap.groups ?? {};
function captain(name, culture, troop, stage) {
  const keyOf = (g) => { const tr = (G[g]?.troops ?? cap.troops ?? []); let t = alias0[troop] ?? troop ?? 'sword'; if (!tr.includes(t)) t = 'sword'; return `portrait.captain.${g}.${t}`; };
  for (const r of cap.name_rules ?? []) { try { if (new RegExp(r.match).test(name ?? '')) { const k = r.key ?? keyOf(r.group); if (has(k)) return k; } } catch { /* */ } }
  if (stage) { const pre = Object.keys(cap.stage_group ?? {}).filter((p) => stage.startsWith(p)).sort((a, b) => b.length - a.length)[0]; if (pre) { const k = keyOf(cap.stage_group[pre]); if (has(k)) return k; } }
  const cg = culture ? (cap.culture_group ?? {})[culture] : null; if (cg) { const k = keyOf(cg); if (has(k)) return k; }
  return null;
}
const FB = { hre: 'europe', south_asia: 'middle_east' };
function troopP(troop, culture) { for (const c of [culture, FB[culture], 'default'].filter(Boolean)) { const k = `portrait.troop.${c}.${troop}`; if (has(k)) return k; } return null; }
const rows = [];
for (const f of readdirSync('database/data').filter((f) => /^stages_.*\.json$/.test(f))) {
  let j; try { j = JSON.parse(readFileSync(`database/data/${f}`, 'utf8')); } catch { continue; }
  const stages = Array.isArray(j) ? j : j.items ?? j.stages ?? [];
  for (const st of stages) {
    const sc = st.code ?? st.stage_code ?? ''; const squads = [...(st.enemy_squads ?? []), ...(st.enemy_squad ? [st.enemy_squad] : []), ...(st.ally_squads ?? [])];
    for (const sq of squads) {
      const L = sq.leader ?? sq.commander; if (!L) continue;
      const kind = L.kind ?? (L.ref ? 'npc' : 'generic'); const ref = L.ref ?? L.hero ?? null; const name = L.display_name_ko ?? L.name ?? '';
      const culture = sq.culture ?? L.culture ?? st.culture ?? null; const troop = L.troop_type ?? L.unit_type ?? sq.soldier_type ?? 'sword';
      const u = unique(ref);
      const battle = u ?? captain(name, culture, troop, sc), chip = u ?? captain(name, culture, troop, null);
      const soldier = sq.soldier_type && (sq.soldiers ?? 0) > 0 ? troopP(sq.soldier_type, culture) : 'n/a';
      let cls = u ? 'unique' : battle ? (chip ? 'captain' : 'captain_battle_only') : (ref ? 'ref_missing' : 'generic_none');
      rows.push({ file: f, stage: sc, squad: sq.id ?? null, kind, ref, name, culture, troop, cls, battle, chip, soldier });
    }
  }
}
const sum = {}; rows.forEach((r) => { sum[r.cls] = (sum[r.cls] ?? 0) + 1; });
const bad = rows.filter((r) => r.cls !== 'unique' && r.cls !== 'captain');
const refMissing = [...new Set(rows.filter((r) => r.cls === 'ref_missing').map((r) => r.ref))];
const soldierNone = rows.filter((r) => r.soldier === null);
writeFileSync('docker/gemini/portrait_audit.json', JSON.stringify({ generated: new Date().toISOString(), rules: '고유 > 기본 부장(이름 규칙 > 스테이지 접두 > 문화권) > (병사만) 병종 > 없음', summary: sum, total: rows.length,
  ref_missing_codes: refMissing, soldier_none: soldierNone.length, problems: bad, all: rows }, null, 1));
console.log('총', rows.length, sum, 'ref_missing 코드', refMissing.length, '병사 초상 없음', soldierNone.length);
const g = {}; bad.forEach((r) => { const k = `${r.cls}|${r.file}`; g[k] = (g[k] ?? 0) + 1; }); console.log(g);
console.log('ref_missing', refMissing.slice(0, 40).join(' '));
console.log('예시', bad.slice(0, 8).map((r) => `${r.stage} ${r.name} [${r.kind}/${r.ref}] cult=${r.culture} -> battle=${r.battle} chip=${r.chip}`).join('\n'));
