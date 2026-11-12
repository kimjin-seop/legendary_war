// ch21 유럽 장수 3명·바투·후마윤 반영(호출 없음, 안아트 2026-11-03). portrait_npc_story_publish.mjs / unit_npc_sprite_publish.mjs 와 같은 항목 형식,
// 다른 인스턴스와 충돌하지 않도록 별도 조각 2개에 쓴다(병합은 merge_fragments.mjs FRAGMENTS 등록 후 --dry → 실행).
//   초상: docker/gemini/portrait_campaign/out/<code>.png(+thumb) → public/assets/portraits/npc/ + portraits/npc/portrait_npc_ch21eu_manifest_fragment.json
//   시트: docker/gemini/unit_npc_sprite/out/{64,64_x2}/hero_<code>_{ally,enemy}_sheet.png → public/assets/sprites/npc/ + sprites/npc/unit_npc_ch21eu_sprite_manifest_fragment.json
// QA 단일 출처: docker/gemini/npc_ch21eu/qa.json ({ portrait: {code: {verdict,...}}, sprite: {...} }). pass/minor 만 게시. 기존 파일은 내용이 다르면 덮어쓰지 않음.
// 실행(프로젝트 루트): node docker/gemini/npc_ch21eu_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { P_EU, S_EU, GENERIC_MAP } from './npc_ch21eu_style.mjs';
import { QA as SHEET_CHECKLIST } from './unit_npc_sprite_style.mjs';
const dry = process.argv.includes('--dry');
const QA = JSON.parse(readFileSync('docker/gemini/npc_ch21eu/qa.json', 'utf8'));
const readLog = (p) => (existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const PLOG = readLog('docker/gemini/portrait_campaign/calls_log.jsonl'), SLOG = readLog('docker/gemini/unit_npc_sprite/calls_log.jsonl');
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const conflicts = [];
const safeCopy = (a, b) => { if (!existsSync(a)) throw new Error(`없음 ${a}`); if (dry) return; mkdirSync(b.replace(/\/[^/]+$/, ''), { recursive: true });
  if (!existsSync(b)) return copyFileSync(a, b); if (!readFileSync(a).equals(readFileSync(b))) conflicts.push(b); };
const ok = (q) => q && ['pass', 'minor'].includes(q.verdict);

const pItems = [], pSkip = [];
for (const [code, h] of Object.entries(P_EU)) {
  const q = QA.portrait?.[code], O = 'docker/gemini/portrait_campaign/out';
  if (!ok(q)) { pSkip.push({ code, reason: `qa=${q?.verdict ?? 'not_checked'}` }); continue; }
  const d = `public/assets/portraits/npc/${code}.png`, t = `public/assets/portraits/npc/thumb/${code}.webp`;
  safeCopy(`${O}/${code}.png`, d); safeCopy(`${O}/thumb/${code}.webp`, t);
  const calls = PLOG.filter((c) => c.id === `portrait_${code}`);
  pItems.push({ key: `portrait.${code}`, path: d.replace('public/', ''), type: 'portrait', subtype: 'npc', size: '896x1200', ratio: '3:4', alpha: true, bytes: sz(d),
    npc: code, roster_code: code, name_ko: h.name, side: h.side, era: h.era, culture: h.culture, used_in: h.used_in,
    expressions: ['neutral'], expression_fallback: '모든 expr → neutral', deferred: true,
    thumb: { key: `portrait.${code}.thumb`, path: t.replace('public/', ''), size: '256x343', bytes: sz(t) },
    generator: { ...GEN, script: 'docker/gemini/npc_ch21eu_gen.mjs portrait(portrait_campaign_gen.mjs + npc_ch21eu_style.mjs P_EU → portrait_campaign_style.mjs job()) → portrait_npc_v3_pp.sh(alpha_process.py B; 유럽 3명은 ALPHA_ARGS T_lo=40 T_hi=90)' },
    prompt_ref: `docker/gemini/npc_ch21eu_style.mjs P_EU.${code}`, style_ref: h.ref.replace('public/', ''),
    calls: calls.length, calls_ok: calls.filter((c) => c.status === 200).length, qa: { checked: true, ...q }, verify: true, verify_note: h.verify, license: LIC });
}
const sItems = [], sSkip = [];
for (const [code, h] of Object.entries(S_EU)) {
  const q = QA.sprite?.[code], O = 'docker/gemini/unit_npc_sprite/out';
  if (!ok(q)) { sSkip.push({ code, reason: `qa=${q?.verdict ?? 'not_checked'}` }); continue; }
  for (const side of ['ally', 'enemy']) {
    const f = `${code}_${side}_sheet.png`, d1 = `public/assets/sprites/npc/64/${f}`, d2 = `public/assets/sprites/npc/64_x2/${f}`;
    safeCopy(`${O}/64/hero_${f}`, d1); safeCopy(`${O}/64_x2/hero_${f}`, d2);
    sItems.push({ key: `unit.npc.${code}.${side}.64.sheet`, path: d1.replace('public/', ''), type: 'spritesheet', frameWidth: 64, frameHeight: 64, size: '192x256', cols: 3, rows: 4,
      row_order: ['down', 'left', 'right', 'up'], col_order: ['walk1', 'idle', 'walk2'], alpha: true, filter: 'NEAREST', scale: 'integer only(x1/x2/x3, nearest)',
      variants: { x2: d2.replace('public/', '') }, bytes: sz(d1), npc: code, name_ko: h.name, side, npc_default_side: h.side, culture: h.culture, troop: h.troop, mounted: !!h.mounted,
      scope: 'npc', deferred: true, fallback: h.fallback.replace(/\.(ally|enemy)\./, `.${side}.`),
      team_marker: side === 'ally' ? '발밑 파랑 받침(A안)' : '발밑 빨강 받침 + 파랑 계열 색만 적색 스왑(hue 185-265)',
      generator: { ...GEN, script: 'docker/gemini/npc_ch21eu_gen.mjs sprite(unit_npc_sprite_gen.mjs + npc_ch21eu_style.mjs S_EU) → unit_npc_sprite_pp.sh(hero_dir_pp_v4.mjs)' },
      prompt_ref: `docker/gemini/npc_ch21eu_style.mjs S_EU.${code}`, ref_portrait: `public/assets/portraits/npc/${code}.png`, raw: `docker/gemini/unit_npc_sprite/raw/${code}.jpg`,
      calls: SLOG.filter((c) => c.id === code).length, qa: { checked: true, verdict: q.verdict, checklist: SHEET_CHECKLIST, issues: q.issues ?? [] },
      verify: true, verify_note: h.verify, license: LIC, provenance: 'refs: 3x3 방향 시트 견본(hero_dir_refs) + 정식 초상(portrait_campaign/out)' });
  }
}
const note = 'ch21 유럽 장수 전용 3명(바츨라프 1세·우그린 차크·파코스와프) + 바투·후마윤 초상(안아트 2026-11-03). 술리스와프·볼레슬라프·콜로만·렘발드는 전용 에셋 없음 → generic_map 의 공용 키 사용(팀장 지시)';
const pf = { note, generated: new Date().toISOString(), keyRules: { portrait: 'portrait.<code> (+ .thumb). 표정 neutral 1종', generic_map: GENERIC_MAP }, skipped: pSkip, items: pItems };
const sf = { note, generated: new Date().toISOString(), keyRules: { npc_sprite: 'unit.npc.<npc_code>.<ally|enemy>.64.sheet (unit_npc_sprite_manifest_fragment.json 과 같은 규칙)', generic_map: GENERIC_MAP }, skipped: sSkip, items: sItems };
if (!dry) { writeFileSync('public/assets/portraits/npc/portrait_npc_ch21eu_manifest_fragment.json', JSON.stringify(pf, null, 1)); writeFileSync('public/assets/sprites/npc/unit_npc_ch21eu_sprite_manifest_fragment.json', JSON.stringify(sf, null, 1)); }
if (conflicts.length) console.log('덮어쓰지 않음(내용 다름):', conflicts);
console.log(`초상 ${pItems.length}(건너뜀 ${JSON.stringify(pSkip)}), 시트 ${sItems.length}(건너뜀 ${JSON.stringify(sSkip)})${dry ? ' (dry)' : ''}`);
