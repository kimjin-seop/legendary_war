// 서가 지도 장수 칩 툴팁 데이터 생성기(개발용, 번들에 포함되지 않음). 사용: node resources/js/game/tools/build_hero_tips.mjs (프로젝트 루트에서)
// 입력(기존 데이터만, 새 내용 창작 없음):
//  - resources/js/game/data/shelf_map_meta.json  shelves[].heroes / stages[].heroes 의 code(칩 대상)
//  - database/data/heroes.json                    born / died / verify
//  - database/data/hero_history_part*.json        one_line(한 줄 설명) / life
//  - database/data/npc_roster_v3*.json            era('1556~1630') / note / name_ko
//  - database/data/heroes_candidates.csv          born / died / notable (hero_pool100 csv_id 로 연결, 위에서 못 찾은 값만)
// 출력: resources/js/game/data/hero_tips.json { tips: { <code>: { name, life, desc } }, missing: { life: [code], desc: [code] } }
//  life: 'YYYY~YYYY'(기원전은 '기원전 N'), 모르는 쪽은 '?'. 월 정보는 원천 데이터에 없다. verify(검증 필요) 인물은 끝에 ' (추정)'.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const D = 'database/data';

const meta = rd('resources/js/game/data/shelf_map_meta.json');
const codes = new Set();
const names = new Map();
const collect = (arr) => (arr ?? []).forEach((h) => { if (h?.code) { codes.add(h.code); if (h.name_ko && !names.has(h.code)) names.set(h.code, h.name_ko); } });
(meta.shelves ?? []).forEach((s) => collect(s.heroes));
(Array.isArray(meta.stages) ? meta.stages : Object.values(meta.stages ?? {})).forEach((s) => collect(s?.heroes));

const heroes = new Map(rd(`${D}/heroes.json`).items.map((h) => [h.code, h]));
const hist = new Map();
fs.readdirSync(path.join(ROOT, D)).filter((f) => /^hero_history_part(\d+|_npc\d+)\.json$/.test(f)).forEach((f) => rd(`${D}/${f}`).items.forEach((h) => hist.set(h.code, h)));
const npcs = new Map();
fs.readdirSync(path.join(ROOT, D)).filter((f) => /^npc_roster_v3.*\.json$/.test(f)).forEach((f) => (rd(`${D}/${f}`).items ?? []).forEach((n) => { if (n?.code && !npcs.has(n.code)) npcs.set(n.code, n); }));
// 서가 시나리오 NPC(database/data/scenario/shelf_*_npcs.json): era 는 생몰년이 아니라 활동 시기라 period 로만 쓰고, 설명은 title(직함)
const scen = new Map();
fs.readdirSync(path.join(ROOT, D, 'scenario')).filter((f) => /^shelf_\d+_npcs\.json$/.test(f)).forEach((f) => (rd(`${D}/scenario/${f}`).npcs ?? []).forEach((n) => { if (n?.code && !scen.has(n.code)) scen.set(n.code, n); }));
// 서가 로스터(npc_roster_shelf_*.json): 이름·활동 시기(era)만 쓴다(note 는 밸런스 작업 메모라 설명에 쓰지 않음)
const rost = new Map();
fs.readdirSync(path.join(ROOT, D)).filter((f) => /^npc_roster_shelf_.*\.json$/.test(f) && !/_(stats|additions)\.json$/.test(f)).forEach((f) => (rd(`${D}/${f}`).items ?? []).forEach((n) => { if (n?.code && !rost.has(n.code)) rost.set(n.code, n); }));
const pool = rd(`${D}/hero_pool100.json`).pool ?? {};
// CSV(따옴표 안 쉼표 처리)
const csvRows = new Map();
{
    const txt = fs.readFileSync(path.join(ROOT, D, 'heroes_candidates.csv'), 'utf8').replace(/^﻿/, '');
    const lines = txt.split(/\r?\n/).filter(Boolean);
    const head = lines[0].split(',');
    const parse = (line) => { const out = []; let cur = ''; let q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
    lines.slice(1).forEach((l) => { const v = parse(l); const o = {}; head.forEach((k, i) => { o[k] = v[i]; }); csvRows.set(String(o.id), o); });
}

// 원천 note 의 작업용 표기(검증 메모)는 플레이어 툴팁에서 뺀다: '(확실)'·'(... verify ...)'·'웹 대조' 문장 등. 내용 추가는 하지 않는다
const WORK = /verify|확실|웹 대조|대조 안|열람|서술하지 않|싣지 않|쓰지 않|다루지 않|삼지 않|근거 수준|evidence|송서사|\bFE\b|TODO|대사|화자|본편|후속|스테이지|outline|로스터|\.json|npc_|각색|대용|승률|confirmed|accepted|SCENARIO|재검토|표기|구분 필요|다른 인물|\bs\d\b|병기|이설|자료별|기록 적음|후일담|장면|평가는/i;
const clean = (s) => String(s ?? '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^()]*\)/g, (m) => (WORK.test(m) ? '' : m))
    .split(/(?<=[.。])\s+|\.\s*$/).map((x) => x.trim()).filter((x) => x && !WORK.test(x)).join(' ')
    .replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
const yr = (v) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const fmt = (n) => (n === null ? '?' : n < 0 ? `기원전 ${-n}` : String(n));
const tips = {}; const noLife = []; const noDesc = [];
[...codes].sort().forEach((code) => {
    const h = heroes.get(code); const hi = hist.get(code); const n = npcs.get(code);
    const csv = pool[code]?.csv_id != null ? csvRows.get(String(pool[code].csv_id)) : null;
    const sn = scen.get(code);
    const rs = rost.get(code);
    let b = yr(h?.born); let d = yr(h?.died); let eraText = '';
    if (b === null && d === null && n?.era) { const m = /^\s*(-?\d+)?\s*~\s*(-?\d+)?\s*$/.exec(String(n.era)); if (m) { b = yr(m[1]); d = yr(m[2]); } else eraText = String(n.era).trim(); } // '?~1223'·'기원전 400경~330' 등은 원문 그대로
    const lifeYears = (t) => { const m = /^\s*(-?\d+|\?)\s*~\s*(-?\d+|\?)/.exec(String(t ?? '')); return m ? [m[1] === '?' ? null : yr(m[1]), m[2] === '?' ? null : yr(m[2])] : null; };
    if (b === null && d === null) { const ly = lifeYears(hi?.life) ?? lifeYears(sn?.life); if (ly) { [b, d] = ly; } } // npc1 history·서가 시나리오의 'YYYY~YYYY' 형태 생몰년
    if (b === null && csv) b = yr(csv.born);
    if (d === null && csv) d = yr(csv.died);
    const verify = !!h?.verify || (csv?.flag ?? '').includes('verify') || n?.evidence_level === 'low';
    const life = b === null && d === null ? eraText : `${fmt(b)}~${fmt(d)}${verify ? ' (추정)' : ''}`;
    const desc = String(hi?.one_line ?? '').trim() || String(sn?.desc ?? '').trim() || clean(n?.note) || clean(sn?.title) || clean(csv?.notable) || '';
    const name = h?.name_ko || hi?.name_ko || n?.name_ko || sn?.name_ko || rs?.name_ko || names.get(code) || csv?.name_ko || '';
    const period = !life && (sn?.era || rs?.era) ? String(sn?.era || rs.era) : ''; // 생몰년 미상일 때만 '활동 시기'
    tips[code] = period ? { name, life, desc, period } : { name, life, desc };
    if (!life) noLife.push(`${code}(${name || '?'})`);
    if (!desc) noDesc.push(`${code}(${name || '?'})`);
});
const out = { _note: 'generated by resources/js/game/tools/build_hero_tips.mjs — 수동 수정 금지(원천 데이터를 고친 뒤 다시 실행)', generated: new Date().toISOString(), tips, missing: { life: noLife, desc: noDesc } };
fs.writeFileSync(path.join(ROOT, 'resources/js/game/data/hero_tips.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`[hero-tips] ${codes.size}명, 생몰년 없음 ${noLife.length}, 설명 없음 ${noDesc.length}`);
console.log('생몰년 없음:', noLife.join(', ') || '-');
console.log('설명 없음:', noDesc.join(', ') || '-');
