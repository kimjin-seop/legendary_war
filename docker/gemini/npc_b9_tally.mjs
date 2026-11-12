// npc_b9 호출 누계를 docker/gemini/calls_log.json npc_b9_usage 에 반영(호출 없음). 실행: node docker/gemini/npc_b9_tally.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const L = existsSync('docker/gemini/npc_b9/calls_log.jsonl') ? readFileSync('docker/gemini/npc_b9/calls_log.jsonl', 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const P = JSON.parse(readFileSync('docker/gemini/npc_b9/plan.json', 'utf8')).items;
const j = JSON.parse(readFileSync('docker/gemini/calls_log.json', 'utf8')); const u = j.npc_b9_usage;
u.by_tier = { B: 0, C: 0, D: 0 }; for (const l of L) u.by_tier[P[l.id]?.tier ?? 'D']++;
u.total = L.length; u.non200 = L.filter((l) => l.status !== 200).length; u.regenerations = L.length - new Set(L.map((l) => l.id)).size; u.updated = new Date().toISOString();
writeFileSync('docker/gemini/calls_log.json', JSON.stringify(j, null, 1)); console.log(JSON.stringify(u));
