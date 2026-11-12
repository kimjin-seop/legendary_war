// npc_b13 호출 누계를 docker/gemini/calls_log.json npc_b13_usage 에 반영(호출 없음, npc_b10_tally.mjs 변형). 실행: node docker/gemini/npc_b13_tally.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : []);
const L = lines('docker/gemini/npc_b13/calls_log.jsonl').map((l) => JSON.parse(l));
const j = JSON.parse(readFileSync('docker/gemini/calls_log.json', 'utf8'));
const by = {}; for (const l of L) by[l.category] = (by[l.category] ?? 0) + 1;
const u = j.npc_b13_usage = { note: '2026-11-08 에셋 완비 배치 C: 시트 없는 구대륙 이름 있는 인물 21명(ch22 로디 측·수 양제 측·십자군·고려/거란/금/서하/호라즘). 목표 34·상한 50. 상세 = docker/gemini/npc_b13/calls_log.jsonl',
  target: 34, hard_cap: 50, by_category: by, total: L.length,
  non200: L.filter((l) => l.status !== 200).length, regenerations: L.length - new Set(L.map((l) => `${l.category}:${l.id}`)).size, updated: new Date().toISOString() };
writeFileSync('docker/gemini/calls_log.json', JSON.stringify(j, null, 1)); console.log(JSON.stringify(u));
