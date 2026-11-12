// npc_b12 호출 누계를 docker/gemini/calls_log.json npc_b12_usage 에 반영(호출 없음, npc_b11_tally.mjs 변형). 실행: node docker/gemini/npc_b12_tally.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : []);
const L = lines('docker/gemini/npc_b12/calls_log.jsonl').map((l) => JSON.parse(l));
const j = JSON.parse(readFileSync('docker/gemini/calls_log.json', 'utf8'));
const by = {}; for (const l of L) by[l.category] = (by[l.category] ?? 0) + 1;
j.npc_b12_usage = { note: '2026-11-08 팀장 지시(에셋 100% 완비 배치 B): 임진왜란 수군 15 + 오를레앙 8 전용 시트. 목표 32·상한 48. 상세 = docker/gemini/npc_b12/calls_log.jsonl',
  target: 32, hard_cap: 48, by_category: by, total: L.length, non200: L.filter((l) => l.status !== 200).length,
  regenerations: L.length - new Set(L.map((l) => `${l.category}:${l.id}`)).size, updated: new Date().toISOString() };
writeFileSync('docker/gemini/calls_log.json', JSON.stringify(j, null, 1)); console.log(JSON.stringify(j.npc_b12_usage));
