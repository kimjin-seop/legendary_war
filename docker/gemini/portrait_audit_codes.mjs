// NPC 코드·portrait 키 참조 전수 감사(읽기 전용, 안아트 2026-11-04). database/data/**/*.json + resources/js/game/data/**/*.json 의 모든 "npc_*" 문자열과 "portrait.*" 키
//   → assets.js portraitCode 규칙(그대로 → npc_ 접두 → 공용 클론 → 별칭 → npc_jp_/npc_ink_ 접두 → 접두 제거)으로 manifest 키 + 디스크 파일 실존 확인.
// 분류: ok / missing(초상 없음). missing 은 참조 위치(파일·키 경로 일부)와 함께 기록. 비인물 코드(npc_unit·cart·boat·needed·ally·ref·roster 등)는 제외 목록으로 따로.
// 실행(저장소 루트): node docker/gemini/portrait_audit_codes.mjs → docker/gemini/portrait_audit_codes.json
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const man = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')); const M = new Map(man.items.map((i) => [i.key, i]));
const has = (k) => M.has(k) && existsSync(`public/${M.get(k).path}`);
const src = readFileSync('resources/js/game/assets.js', 'utf8');
const ALIAS = Object.fromEntries([...(src.match(/const NPC_ASSET_ALIAS = \{([\s\S]*?)\n\};/)?.[1] ?? '').matchAll(/(npc_[a-z0-9_]+): *'([a-z0-9_]+)'/g)].map((m) => [m[1], m[2]]));
const CLONE = Object.fromEntries([...(src.match(/const NPC_CLONE = \{([\s\S]*?)\n\};/)?.[1] ?? '').matchAll(/(npc_[a-z0-9_]+): *\{[^}]*portrait: *'([a-z0-9_.]+)'/g)].map((m) => [m[1], m[2]]));
const resolve = (c) => { const r = c.replace(/^npc_/, ''); const cands = [c, CLONE[c], ALIAS[c], `npc_jp_${r}`, `npc_ink_${r}`, r]; return cands.find((x) => x && has(`portrait.${x}`)) ?? null; };
const NONPERSON = /^npc_(unit|cart|boat|needed|ally|ref|roster|code|id|name|placeholder|todo|tbd|xxx|sample|test)(_|$)|^npc_\d|_(slot_\d+)$/;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : []; });
const refs = new Map(); const pkeys = new Map();
for (const f of [...walk('database/data'), ...walk('resources/js/game/data')]) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/"(npc_[a-z0-9_]+)"/g)) { const a = refs.get(m[1]) ?? new Set(); a.add(f.replace(/\\/g, '/')); refs.set(m[1], a); }
  for (const m of s.matchAll(/"(portrait\.[a-z0-9_.]+)"/g)) { const a = pkeys.get(m[1]) ?? new Set(); a.add(f.replace(/\\/g, '/')); pkeys.set(m[1], a); }
}
const proposalOnly = (files) => [...files].every((f) => /proposal|scenario\/|_draft|ENEMY_ROSTER|EXPAND_/.test(f));
const missing = [], skipped = [], proposal = [];
for (const [c, files] of refs) {
  if (NONPERSON.test(c)) { skipped.push(c); continue; }
  if (resolve(c)) continue;
  (proposalOnly(files) ? proposal : missing).push({ code: c, files: [...files].slice(0, 6) });
}
const pmissing = [...pkeys].filter(([k]) => !/\.thumb$/.test(k) && !has(k) && !has(k.replace(/\.thumb$/, ''))).map(([k, f]) => ({ key: k, files: [...f].slice(0, 4) }));
writeFileSync('docker/gemini/portrait_audit_codes.json', JSON.stringify({ generated: new Date().toISOString(), npc_codes: refs.size, nonperson_skipped: skipped.length, missing, proposal_only: proposal, portrait_keys: pkeys.size, portrait_keys_missing: pmissing }, null, 1));
console.log('npc 코드', refs.size, '비인물 제외', skipped.length, '누락(실사용 파일)', missing.length, '제안 파일에만', proposal.length, 'portrait 키 참조', pkeys.size, '키 누락', pmissing.length);
console.log('누락', missing.map((m) => m.code).join(' '));
console.log('키 누락', pmissing.map((m) => m.key).join(' '));
