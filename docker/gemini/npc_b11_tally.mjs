// npc_b11 호출 누계를 docker/gemini/calls_log.json npc_b11_usage 에 반영(호출 없음, npc_b10_tally.mjs 변형). 실행: node docker/gemini/npc_b11_tally.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : []);
const L = lines('docker/gemini/npc_b11/calls_log.jsonl').map((l) => JSON.parse(l));
const j = JSON.parse(readFileSync('docker/gemini/calls_log.json', 'utf8'));
const by = {}; for (const l of L) by[l.category] = (by[l.category] ?? 0) + 1;
const u = j.npc_b11_usage = { note: '2026-11-07 팀장 지시: 시트 없는 이름 있는 인물(유기 + ch25 쩐·원 측 + 범용 지휘관 상위). 누계(b9+b10+b11) 상한 270(팀장 상향 승인). 상세 = docker/gemini/npc_b11/calls_log.jsonl',
  b9_total: lines('docker/gemini/npc_b9/calls_log.jsonl').length, b10_total: lines('docker/gemini/npc_b10/calls_log.jsonl').length, hard_cap_cumulative: 270, by_category: by, total: L.length,
  non200: L.filter((l) => l.status !== 200).length, regenerations: L.length - new Set(L.map((l) => `${l.category}:${l.id}`)).size, updated: new Date().toISOString() };
u.cumulative = u.b9_total + u.b10_total + u.total;
writeFileSync('docker/gemini/calls_log.json', JSON.stringify(j, null, 1)); console.log(JSON.stringify(u));
