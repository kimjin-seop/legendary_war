// 기본 부장 초상 반영(호출 없음, 안아트 2026-11-03).
//   docker/gemini/portrait_campaign/out/captain_<g>_<t>.png(+thumb) -> public/assets/portraits/captain/<g>_<t>.png + thumb/<g>_<t>.webp
//   manifest 조각 public/assets/portraits/captain/portrait_captain_manifest_fragment.json (items + item.thumb, 키 portrait.captain.<g>.<t>)
//   FE 조회표 public/assets/portraits/captain/captain_map.json (조회 순서·stage_group·name_rules·culture_group·병종 대체 + 실제 등록된 키 목록)
// QA 단일 출처 docker/gemini/portrait_captain/qa.json ({code:{verdict,...}}). pass/minor 만 게시. 실행(저장소 루트): node docker/gemini/captain_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { P_CAP, GROUPS, G, CAP_LOG } from './captain_style.mjs';
const dry = process.argv.includes('--dry');
const QA = existsSync(`${G}/qa.json`) ? JSON.parse(readFileSync(`${G}/qa.json`, 'utf8')) : {};
const PLAN = JSON.parse(readFileSync(`${G}/plan.json`, 'utf8'));
const L = existsSync(CAP_LOG) ? readFileSync(CAP_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const O = 'docker/gemini/portrait_campaign/out', D = 'public/assets/portraits/captain';
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const items = [], skipped = [], have = {};
for (const [code, h] of Object.entries(P_CAP)) {
  const q = QA[code], src = `${O}/${code}.png`, ts = `${O}/thumb/${code}.webp`;
  if (!q || !['pass', 'minor'].includes(q.verdict) || !existsSync(src)) { skipped.push({ code, reason: !existsSync(src) ? '산출 없음' : `qa=${q?.verdict ?? 'not_checked'}` }); continue; }
  const f = `${h.group}_${h.troop}`, d = `${D}/${f}.png`, t = `${D}/thumb/${f}.webp`;
  if (!dry) { mkdirSync(`${D}/thumb`, { recursive: true }); copyFileSync(src, d); copyFileSync(ts, t); }
  const key = `portrait.captain.${h.group}.${h.troop}`; (have[h.group] ??= []).push(h.troop);
  items.push({ key, path: d.replace('public/', ''), type: 'portrait', subtype: 'captain', size: '896x1200', ratio: '3:4', alpha: true, bytes: sz(d), group: h.group, troop: h.troop,
    name_ko: `${GROUPS[h.group].label} 부장(${h.troop})`, era: h.era, culture: h.culture, expressions: ['neutral'], expression_fallback: '모든 expr → neutral', deferred: true,
    thumb: { key: `${key}.thumb`, path: t.replace('public/', ''), size: '256x343', bytes: sz(t) },
    generator: { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K', script: 'docker/gemini/captain_gen.mjs(portrait_campaign_style.mjs job() + captain_style.mjs) → portrait_npc_v3_pp.sh(alpha_process.py B)' },
    prompt_ref: `docker/gemini/captain_style.mjs GROUPS.${h.group}.troops.${h.troop}`, style_ref: h.ref.replace('public/', ''),
    calls: L.filter((c) => c.id === `portrait_${code}`).length, qa: { checked: true, ...q }, verify: true, verify_note: h.verify, license: LIC });
}
const frag = { note: '기본 부장 초상(클론 무장) 풀(안아트 2026-11-03). 고유 초상이 없는 generic 지휘관·부장용. 조회는 captain_map.json', generated: new Date().toISOString(),
  keyRules: { portrait: 'portrait.captain.<group>.<troop> (+ .thumb). troop = sword|spear|archer|cavalry|naval' }, skipped, items };
const map = { version: 1, generated: new Date().toISOString(), _note: '안아트 2026-11-03. generic 지휘관(npc 코드·영웅 코드 없음)의 초상 조회표. 키 = portrait.captain.<group>.<troop>. available 에 없는 조합은 troop_fallback 순서로, 그래도 없으면 다음 단계',
  key_format: 'portrait.captain.<group>.<troop>',
  order: ['1 고유 portrait.<npc 코드>(기존 portraitCode 규칙)', '2 overrides[display_name_ko] (키 그대로)', '3 name_rules(정규식, display_name_ko) -> group 또는 key', '4 stage_group(스테이지 코드 접두, 가장 긴 접두 우선)', '5 culture_group[culture]', '6 기존 portrait.troop.<culture>.<troop>'],
  troop_alias: PLAN.troop_alias, troop_fallback: { naval: ['naval', 'sword'], mage: ['sword'], healer: ['sword'], heavy: ['sword'], spear: ['spear', 'sword'], archer: ['archer', 'sword'], cavalry: ['cavalry', 'sword'], sword: ['sword', 'spear'] },
  overrides: {}, name_rules: PLAN.resolve.name_rules, stage_group: PLAN.resolve.stage_group, culture_group: PLAN.resolve.culture_group,
  groups: Object.fromEntries(Object.entries(PLAN.groups).map(([g, v]) => [g, { label: v.label, planned: v.troops, available: have[g] ?? [] }])) };
if (!dry) { mkdirSync(D, { recursive: true }); writeFileSync(`${D}/portrait_captain_manifest_fragment.json`, JSON.stringify(frag, null, 1)); writeFileSync(`${D}/captain_map.json`, JSON.stringify(map, null, 1)); }
console.log(`항목 ${items.length}, 건너뜀 ${skipped.length}${dry ? ' (dry)' : ''}`, JSON.stringify(have));
