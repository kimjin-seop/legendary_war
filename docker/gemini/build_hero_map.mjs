// 영웅 → 유닛 스프라이트 매핑 규칙(public/assets/hero_sprite_map.json)과 659명 적용 결과(public/assets/hero_sprite_assign.json) 생성.
// 실행: docker run --rm -v "$PWD":/app -w /app node:22 node docker/gemini/build_hero_map.mjs
// 우선순위: ① 전용 unit.hero.<code> ② S/A(기존 SSR/SR) 인데 전용 없음 → missing 보고(풀로 임시) ③ 풀 unit.cmd.<pool_id> ④ 병종 공용 unit.<unit_type>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const csv = readFileSync('database/data/heroes_candidates.csv', 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const parse = (l) => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') { q = !q; continue; } if (ch === ',' && !q) { o.push(c); c = ''; continue; } c += ch; } o.push(c); return o; };
const H = parse(csv[0]); const rows = csv.slice(1).map(parse).map((r) => Object.fromEntries(H.map((k, i) => [k, r[i] ?? ''])));
const heroes = JSON.parse(readFileSync('database/data/heroes.json', 'utf8')).items; // code, rarity, unit_type, name_ko
const pool = JSON.parse(readFileSync('docker/gemini/cmd_pool.json', 'utf8')).items;
const heroSprites = JSON.parse(readFileSync('docker/gemini/sprite_prompts.json', 'utf8')).items;
const RARITY = { SSR: 'S', SR: 'A', R: 'B', N: 'C', S: 'S', A: 'A', B: 'B', C: 'C' }; // 기존 SSR/SR/R 표기를 S/A/B/C 로 정규화
const rarityOf = (h) => RARITY[h?.rarity] ?? h?.rarity ?? null;
const dedicated = new Set(heroSprites.filter((h) => existsSync(`public/assets/sprites/64/hero_${h.code}_ally.png`)).map((h) => h.code));
const poolReady = new Set(existsSync('public/assets/sprites/pool_names.json') ? JSON.parse(readFileSync('public/assets/sprites/pool_names.json', 'utf8')) : []);

// 성별 추정(CSV 에 성별 없음): role 키워드 + name/story 의 여성 표기. 모르면 null(규칙에서 무시)
const FEMALE_ROLE = /여왕|왕비|황후|여제|수녀|성녀|여성|공주|왕녀|여황|여장군|무녀/;
const genderOf = (r) => (FEMALE_ROLE.test(r.role) || /여성|여왕|왕비|황후|여제|그녀/.test(r.story) || /여성|여왕|여제|왕비/.test(r.notable) ? 'f' : 'm');
// 병종 추정: heroes.json 에 있으면 그 값, 없으면 class_archetype 매핑
const CLASS2UNIT = { 지휘관: 'sword', 책략가: 'mage', 중장갑: 'heavy', 궁수: 'archer', 치유사: 'healer', 기병: 'cavalry', 보병: 'spear', 암살자: 'archer' };
const codeOfCsvId = Object.fromEntries(heroes.map((h) => [h.csv_id ?? null, h.code]).filter(([k]) => k));
const codeByName = Object.fromEntries(heroes.map((h) => [h.name_ko, h.code]));
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };

function pickPool(r, unit, gender) {
  const score = (p) => { let s = 0;
    if (p.region === r.region) s += 100; else return -1;
    if (p.eras.includes(r.era)) s += 40;
    if (p.gender === gender) s += 30; else if (gender === 'f' && p.gender === 'm') s -= 25; // 여성 영웅은 여성 원형 우선
    if (p.unit_types.includes(unit)) s += 20;
    if (p.roles.some((k) => r.role.includes(k))) s += 25;
    return s; };
  let best = [], bs = -1;
  for (const p of pool) { const s = score(p); if (s > bs) { bs = s; best = [p]; } else if (s === bs && s >= 0) best.push(p); }
  if (!best.length) best = pool.filter((p) => p.gender === gender); if (!best.length) best = pool; // 지역 미일치 시 전체
  return best[hash(r.id + ':' + r.name_ko) % best.length].pool_id;
}

const assign = [], missing = [], dist = {};
for (const r of rows) {
  const code = codeByName[r.name_ko] ?? null; const hero = code ? heroes.find((h) => h.code === code) : null;
  const unit = hero?.unit_type ?? CLASS2UNIT[r.class_archetype] ?? 'sword'; const gender = genderOf(r);
  let key, source;
  if (code && dedicated.has(code)) { key = `unit.hero.${code}`; source = 'dedicated'; }
  else { const pid = pickPool(r, unit, gender); key = poolReady.has(pid) ? `unit.cmd.${pid}` : `unit.${unit}`; source = poolReady.has(pid) ? 'pool' : 'class_fallback';
    if (hero && ['S', 'A'].includes(rarityOf(hero))) missing.push({ code, name: r.name_ko, rarity: rarityOf(hero), temp: key });
    dist[pid] = (dist[pid] || 0) + 1; }
  assign.push({ id: +r.id, code, name_ko: r.name_ko, unit_type: unit, gender_guess: gender, sprite_key: key, source, suffix: '.ally.64 / .enemy.64', fallback: [`unit.cmd.${pickPool(r, unit, gender)}`, `unit.${unit}`] });
}
const total = rows.length; const over = Object.entries(dist).filter(([, n]) => n > total * 0.15);
const map = {
  version: 1, note: 'FE 는 speaker/유닛의 영웅 code(없으면 CSV id)로 hero_sprite_assign.json 의 sprite_key 를 찾고, 없으면 rules 로 계산. 키에 .ally.64/.enemy.64 를 붙여 manifest 에서 조회',
  priority: ['unit.hero.<code>(전용)', 'rarity S/A(기존 SSR/SR) 인데 전용 없음 → missing_dedicated 보고(임시로 풀)', 'unit.cmd.<pool_id>(풀)', 'unit.<unit_type>(병종 공용)'],
  exceptions: Object.fromEntries([...dedicated].map((c) => [c, `unit.hero.${c}`])), rarity_scale: 'S/A/B/C (기존 SSR→S, SR→A, R→B). S/A 는 전용 스프라이트 필수', dedicated_required: heroSprites.filter((h) => ['S', 'A'].includes(h.rarity)).map((h) => ({ code: h.code, rarity: h.rarity, ready: dedicated.has(h.code) })),
  rules: { region_must_match: true, score: { era_match: 40, gender_match: 30, female_hero_male_pool_penalty: -25, unit_type_match: 20, role_keyword_match: 25 }, tie_break: 'FNV-1a hash(id:name_ko) % candidates (결정론적)', gender_guess: 'role/story 키워드(여왕·왕비·황후·여제·수녀·성녀·여성 등) → f, 그 외 m (CSV 에 성별 없음, verify)', class_to_unit: CLASS2UNIT },
  pool: pool.map((p) => ({ pool_id: p.pool_id, key: `unit.cmd.${p.pool_id}`, ready: poolReady.has(p.pool_id), region: p.region, eras: p.eras, gender: p.gender, unit_types: p.unit_types, desc: p.desc })),
  missing_dedicated: missing, distribution: Object.fromEntries(Object.entries(dist).sort((a, b) => b[1] - a[1])), over_15pct: over.map(([k, n]) => ({ pool_id: k, n })), total_heroes: total,
};
writeFileSync('public/assets/hero_sprite_map.json', JSON.stringify(map, null, 1));
writeFileSync('public/assets/hero_sprite_assign.json', JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), items: assign }, null, 1));
const srcCnt = assign.reduce((m, a) => (m[a.source] = (m[a.source] || 0) + 1, m), {});
console.log(`heroes ${total}, 전용 ${dedicated.size}, 풀 준비 ${poolReady.size}/${pool.length}, source=${JSON.stringify(srcCnt)}, 여성 추정 ${assign.filter((a) => a.gender_guess === 'f').length}`);
console.log('분포 상위:', Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}=${n}`).join(' '), over.length ? `\n15% 초과: ${JSON.stringify(over)}` : '\n15% 초과 풀 없음');
console.log('S/A 전용 누락:', missing.map((m) => `${m.code}(${m.rarity})`).join(', ') || '없음');
