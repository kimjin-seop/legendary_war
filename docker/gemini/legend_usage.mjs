// calls_log.json round3_usage(70회 한도)에 legend_tiles 호출 수 반영
import { readFileSync, writeFileSync } from 'node:fs';
const LOG = 'docker/gemini/calls_log.json';
const l = JSON.parse(readFileSync(LOG, 'utf8'));
const n = l.calls.filter((c) => c.round === 'legend_tiles').length;
const u = l.round3_usage;
u.by_category.legend_tiles = n;
u.total = Object.values(u.by_category).reduce((a, b) => a + b, 0);
u.remaining = u.limit - u.total;
if (!u.note.includes('legend_tiles')) u.note += ' / 2026-11-01 legend_tiles: legend32 오리지널 타일셋(재질·오브젝트 4x4 시트), 이번 작업 상한 5회';
u.legend_tiles_non200 = l.calls.filter((c) => c.round === 'legend_tiles' && c.status !== 200).length;
writeFileSync(LOG, JSON.stringify(l, null, 1));
console.log(`round3_usage: legend_tiles ${n}회, 누적 ${u.total}/${u.limit}, 남은 ${u.remaining}`);
