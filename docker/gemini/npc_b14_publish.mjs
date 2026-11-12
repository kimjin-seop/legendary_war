// npc_b14 반영(호출 없음, 안아트 2026-11-08). npc_b11_publish.mjs + npc_b11_portrait_publish.mjs 통합 사본. manifest.json·assets.js 는 건드리지 않음(윤프론 병합).
//   시트: npc_b14/sprite_out/{64,64_x2}/hero_<code>_<side>_sheet.png → public/assets/sprites/npc/{64,64_x2}/<code>_<side>_sheet.png
//         (기존 파일이 있는 코드 = npc_boat_2 는 내용이 달라 덮어쓰지 않도록 <code>_b14_<side>_sheet.png 로 게시)
//         npc_shadow_ink = npc_ink_shadow_s8 시트 사본(같은 인물, 호출 없음)
//   초상: npc_b14/portraits/out/<code>.png(+thumb webp) → public/assets/portraits/npc/<file>.png + thumb/<file>.webp
//         기존 파일이 있는 코드(다른 인물과 바이트 동일했던 6 + npc_shadow_vanguard)는 <code>_b14.png 로 게시. 수레 1장 → 키 4개(portrait.npc_cart_*)
//   조각: public/assets/sprites/npc/unit_npc_b14_sprite_manifest_fragment.json, public/assets/portraits/npc/npc_b14_portrait_manifest_fragment.json
// QA 단일 출처: npc_b14/qa.json {sprite:{code:{verdict,issues}}, portrait:{code:{verdict,issues}}}. pass/minor 만 게시.
// 실행(프로젝트 루트): node docker/gemini/npc_b14_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { QA as SHEET_CHECKLIST } from './unit_npc_sprite_style.mjs';
import { G, LOG, POUT, P_B14, OBJ_PORTRAIT, sheetItems } from './npc_b14_style.mjs';
const dry = process.argv.includes('--dry');
const SI = sheetItems(); const QA = JSON.parse(readFileSync(`${G}/qa.json`, 'utf8'));
const L = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const R = existsSync(`${G}/sprite_preview/pp_report.json`) ? JSON.parse(readFileSync(`${G}/sprite_preview/pp_report.json`, 'utf8')) : {};
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const conflicts = []; const replaces = [];
const MAN = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')); const MK = new Set((Array.isArray(MAN.items) ? MAN.items : Object.values(MAN.items)).map((x) => x.key));
const safeCopy = (a, b) => { if (!existsSync(a)) throw new Error(`없음 ${a}`); if (dry) return; mkdirSync(b.replace(/\/[^/]+$/, ''), { recursive: true });
  if (!existsSync(b)) return copyFileSync(a, b); if (!readFileSync(a).equals(readFileSync(b))) conflicts.push(b); };
const ok = (q) => q && ['pass', 'minor'].includes(q.verdict);

// ---- 시트 ----
const items = [], skipped = [];
const sheetEntry = (code, side, h, d1, d2, src, extra = {}) => {
  const key = `unit.npc.${code}.${side}.64.sheet`; if (MK.has(key)) replaces.push(key);
  return { key, path: d1.replace('public/', ''), type: 'spritesheet', frameWidth: 64, frameHeight: 64, size: '192x256', cols: 3, rows: 4,
    row_order: ['down', 'left', 'right', 'up'], col_order: ['walk1', 'idle', 'walk2'], alpha: true, filter: 'NEAREST', scale: 'integer only(x1/x2/x3, nearest)',
    variants: { x2: d2.replace('public/', '') }, bytes: sz(src), npc: code, name_ko: h.name, side, culture: h.culture, troop: h.troop, mounted: !!h.mounted, kind: h.kind,
    scope: 'npc', deferred: true, fallback: h.fallback.replace(/\.(ally|enemy)\./, `.${side}.`),
    team_marker: side === 'ally' ? '발밑 파랑 받침(A안)' : '발밑 빨강 받침 + 파랑 계열 색만 적색 스왑(hue 185-265)', ...extra };
};
for (const [code, h] of Object.entries(SI)) {
  const q = QA.sprite?.[code];
  if (!ok(q)) { skipped.push({ code, reason: `qa=${q?.verdict ?? 'not_generated'}` }); continue; }
  const exists = existsSync(`public/assets/sprites/npc/64/${code}_ally_sheet.png`); const stem = exists ? `${code}_b14` : code;
  for (const side of ['ally', 'enemy']) {
    const f = `${stem}_${side}_sheet.png`, s1 = `${G}/sprite_out/64/hero_${code}_${side}_sheet.png`, s2 = `${G}/sprite_out/64_x2/hero_${code}_${side}_sheet.png`;
    const d1 = `public/assets/sprites/npc/64/${f}`, d2 = `public/assets/sprites/npc/64_x2/${f}`; safeCopy(s1, d1); safeCopy(s2, d2);
    items.push(sheetEntry(code, side, h, d1, d2, s1, {
      generator: { ...GEN, script: 'docker/gemini/npc_b14_gen.mjs sheet(refs = 3x3 견본 + 정식 초상) → npc_b14_pp.sh(hero_dir_pp_v4.mjs, HERO_FACE=npc_b14/facing.json pal_mode unique)' },
      prompt_ref: `docker/gemini/npc_b14_style.mjs sheetItems().${code}`, ref_portrait: h.portrait, raw: `${G}/raw/${code}.jpg`, pipeline: R[code] ?? null,
      calls: L.filter((c) => c.id === code).length, qa: { checked: true, verdict: q.verdict, checklist: SHEET_CHECKLIST, issues: q.issues ?? [] },
      verify: h.kind === 'cmd', verify_note: h.verify, license: LIC, used_in: h.used_in,
      ...(h.kind === 'boat' ? { object: 'boat', note: '사물(배) 시트: 행 = 뱃머리 방향, 열 = 흔들림. naval 유닛이라 UnitView 배 오버레이(ship_overlay)가 겹치지 않게 FE 예외 필요' } : {}) }));
  }
}
// npc_shadow_ink: s8 원본 사본
{ const h = { name: '번진 기록의 그림자', culture: 'ink', troop: 'sword', kind: 'ink', fallback: 'unit.npc.npc_ink_shadow_s8.enemy.64.sheet' };
  for (const side of ['ally', 'enemy']) { const f = `npc_shadow_ink_${side}_sheet.png`, s1 = `public/assets/sprites/npc/64/npc_ink_shadow_s8_${side}_sheet.png`, s2 = `public/assets/sprites/npc/64_x2/npc_ink_shadow_s8_${side}_sheet.png`;
    const d1 = `public/assets/sprites/npc/64/${f}`, d2 = `public/assets/sprites/npc/64_x2/${f}`; safeCopy(s1, d1); safeCopy(s2, d2);
    items.push(sheetEntry('npc_shadow_ink', side, h, d1, d2, s1, { copy_of: `unit.npc.npc_ink_shadow_s8.${side}.64.sheet`, calls: 0, qa: { checked: true, verdict: 'pass', issues: [], note: 's8 원본(초상 portrait.npc_shadow_ink = s8 과 같은 그림) 사본' }, verify: false, license: LIC, generator: { note: 'npc_naval_gen.mjs(s8) 사본, 호출 없음' } })); } }
if (!dry) writeFileSync('public/assets/sprites/npc/unit_npc_b14_sprite_manifest_fragment.json', JSON.stringify({
  note: 'npc_b14(안아트 2026-11-08, 배치 D): 이름 없는 지휘관 25명 + 먹그림자 9명 전용 방향 시트 + 나룻배(npc_boat_2) 배 도트 시트. 키 unit.npc.<code>.<ally|enemy>.64.sheet — assets.js npcSheetCode() 가 npc_ref/hero 코드로 자동 선택',
  generated: new Date().toISOString(), keyRules: { npc_sprite: 'unit.npc.<npc_code>.<ally|enemy>.64.sheet' }, replaces_existing_keys: replaces.filter((k) => k.startsWith('unit.')), skipped, items }, null, 1));

// ---- 초상 ----
const pitems = [], pskipped = [];
const pEntry = (key, code, file, thumb, src, extra) => { if (MK.has(key)) replaces.push(key);
  return { key, path: file.replace('public/', ''), type: 'portrait', subtype: 'npc', size: '896x1200', ratio: '3:4', alpha: true, bytes: sz(src), npc: code, roster_code: code,
    expressions: ['neutral'], expression_fallback: '모든 expr → neutral', deferred: true, thumb: { key: `${key}.thumb`, path: thumb.replace('public/', ''), size: '256x343', bytes: sz(thumb) }, license: LIC, ...extra }; };
const QP = QA.portrait ?? {};
for (const code of [...Object.keys(P_B14), ...Object.keys(OBJ_PORTRAIT)]) {
  const q = QP[code]; if (!ok(q)) { pskipped.push({ code, reason: `qa=${q?.verdict ?? 'not_checked'}` }); continue; }
  const o = OBJ_PORTRAIT[code]; const h = P_B14[code];
  const stem = existsSync(`public/assets/portraits/npc/${code}.png`) || existsSync(`public/assets/portraits/npc/${code}.webp`) ? `${code}_b14` : code;
  const d = `public/assets/portraits/npc/${stem}.png`, t = `public/assets/portraits/npc/thumb/${stem}.webp`; safeCopy(`${POUT}/${code}.png`, d); safeCopy(`${POUT}/thumb/${code}.webp`, t);
  const calls = L.filter((c) => c.id === `portrait_${code}`);
  const common = { generator: { ...GEN, script: `docker/gemini/npc_b14_gen.mjs portrait(${o ? '사물 아이콘형 프롬프트' : 'portrait_campaign_style.mjs job() + npc_b14_style.mjs P_B14'}) → npc_b14_portraits_pp.sh(alpha_process.py B)` },
    prompt_ref: `docker/gemini/npc_b14_style.mjs ${o ? 'OBJ_PORTRAIT' : 'P_B14'}.${code}`, calls: calls.length, calls_ok: calls.filter((c) => c.status === 200).length, qa: { checked: true, ...q } };
  if (o) for (const k of o.keys) pitems.push(pEntry(`portrait.${k}`, k, d, t, d, { name_ko: o.name, object: code === 'npc_cart' ? 'cart' : 'boat', shared_file: o.keys.length > 1 ? `수레 ${o.keys.length}행 공용 1장` : null, verify: false, ...common }));
  else pitems.push(pEntry(`portrait.${code}`, code, d, t, d, { name_ko: h.name, side: h.side, era: h.era, culture: h.culture, used_in: h.used_in, style_ref: h.ref, verify: h.kind !== 'ink', verify_note: h.verify,
    ...(stem !== code ? { replaces_note: '기존 portrait 가 다른 인물과 바이트 동일 사본이라 전용 초상으로 교체(기존 파일 보존, 새 파일 _b14)' } : {}), ...common }));
}
for (const it of pitems) it.thumb.bytes = sz('public/' + it.thumb.path);
if (conflicts.length) { console.log('덮어쓰지 않음(내용 다름) — 중단:', conflicts); process.exit(2); }
if (!dry) writeFileSync('public/assets/portraits/npc/npc_b14_portrait_manifest_fragment.json', JSON.stringify({
  note: 'npc_b14 초상(안아트 2026-11-08, 배치 D): 이름 없는 지휘관 12 + 먹그림자 선봉 1 + 짐수레 공용 1장(키 4) + 나룻배 1. replaces_existing_keys 는 merge_fragments --replace 로 교체 필요',
  generated: new Date().toISOString(), keyRules: { portrait: 'portrait.<code> (+ .thumb). 표정 neutral 1종' }, replaces_existing_keys: replaces.filter((k) => k.startsWith('portrait.')), skipped: pskipped, items: pitems }, null, 1));
console.log(`${dry ? '[dry] ' : ''}시트 항목 ${items.length}(건너뜀 ${skipped.length}), 초상 항목 ${pitems.length}(건너뜀 ${pskipped.length}), 기존 키 교체 ${replaces.length}: ${replaces.join(' ')}`);
