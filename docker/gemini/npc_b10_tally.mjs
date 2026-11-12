// npc_b10 호출 누계를 docker/gemini/calls_log.json npc_b10_usage 에 반영(호출 없음). 실행: node docker/gemini/npc_b10_tally.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const L = existsSync('docker/gemini/npc_b10/calls_log.jsonl') ? readFileSync('docker/gemini/npc_b10/calls_log.jsonl', 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const P = JSON.parse(readFileSync('docker/gemini/npc_b10/plan.json', 'utf8')).items;
const j = JSON.parse(readFileSync('docker/gemini/calls_log.json', 'utf8')); const u = j.npc_b10_usage;
u.by_tier = { E1: 0, E2: 0, E3: 0 }; for (const l of L) u.by_tier[P[l.id]?.tier ?? 'E3']++; u.cumulative_with_b9 = u.b9_total + L.length;
u.total = L.length; u.non200 = L.filter((l) => l.status !== 200).length; u.regenerations = L.length - new Set(L.map((l) => l.id)).size; u.updated = new Date().toISOString();
writeFileSync('docker/gemini/calls_log.json', JSON.stringify(j, null, 1)); console.log(JSON.stringify(u));
