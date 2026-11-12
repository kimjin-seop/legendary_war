// calls_log.json 의 round3_usage(70회 한도)에 portrait_troop 호출 수를 반영한다. 기존 52회(라운드 시작 시점)는 다른 카테고리 합으로 유지.
import { readFileSync, writeFileSync } from 'node:fs';
const LOG = 'docker/gemini/calls_log.json';
const l = JSON.parse(readFileSync(LOG, 'utf8'));
const n = l.calls.filter((c) => c.round === 'portrait_troop').length;
const non200 = l.calls.filter((c) => c.round === 'portrait_troop' && c.status !== 200).length;
const u = l.round3_usage;
u.by_category.portrait_troop = n;
u.total = Object.values(u.by_category).reduce((a, b) => a + b, 0);
u.remaining = u.limit - u.total;
if (!u.note.includes('portrait_troop')) u.note += ' / 2026-11-01 portrait_troop: 일반 병종 기본 초상화(문화권당 2x2 시트 1회), 이번 라운드 상한 10회';
u.portrait_troop_non200 = non200;
writeFileSync(LOG, JSON.stringify(l, null, 1));
console.log(`round3_usage: portrait_troop ${n}회(non200 ${non200}), 누적 ${u.total}/${u.limit}, 남은 ${u.remaining}`);
