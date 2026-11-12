// 반영(호출 없음, 안아트 2026-11-01): docker/gemini/npc_naval/out 의 결과를 public/assets 신규 폴더로 복사 + manifest 조각(미병합) 작성.
// manifest.json·다른 조각·기존 폴더는 수정하지 않는다. 병합은 윤프론(merge_fragments.mjs FRAGMENTS 에 조각 경로 1줄 추가, kind 'flat' 아님 — items 배열).
// 신규 폴더: public/assets/sprites/naval_troops/{64,64_x2}, public/assets/sprites/npc/{64,64_x2}, public/assets/portraits/npc/(+thumb)
// 조각: public/assets/npc_naval_manifest_fragment.json   QA 판정: docker/gemini/npc_naval/qa.json
// 실행(프로젝트 루트): node docker/gemini/npc_naval_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { JP, INK, S11, NAVAL } from './npc_naval_style.mjs';
const G = 'docker/gemini/npc_naval', OUT = `${G}/out`, dry = process.argv.includes('--dry');
const QA = JSON.parse(readFileSync(`${G}/qa.json`, 'utf8'));
const LOG = existsSync(`${G}/calls_log.jsonl`) ? readFileSync(`${G}/calls_log.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const callsOf = (id) => LOG.filter((c) => c.id === id).length;
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const items = [], copied = [];
const cp = (src, dst) => { if (!existsSync(src)) throw new Error(`없음 ${src}`); if (!dry) { mkdirSync(dst.replace(/\/[^/]+$/, ''), { recursive: true }); copyFileSync(src, dst); } copied.push(dst); };
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const qa = (k) => QA[k] ?? { verdict: 'not_checked', issues: [] };

// 1) 수병 시트
for (const [code, h] of Object.entries(NAVAL)) for (const side of ['ally', 'enemy']) {
  const f = `${h.culture}_naval_${side}_sheet.png`, d1 = `public/assets/sprites/naval_troops/64/${f}`, d2 = `public/assets/sprites/naval_troops/64_x2/${f}`;
  cp(`${OUT}/64/hero_${code}_${side}_sheet.png`, d1); cp(`${OUT}/64_x2/hero_${code}_${side}_sheet.png`, d2);
  items.push({ key: `unit.${h.culture}.naval.${side}.64.sheet`, path: d1.replace('public/', ''), type: 'spritesheet', frameWidth: 64, frameHeight: 64, size: '192x256', cols: 3, rows: 4, row_order: ['down', 'left', 'right', 'up'], alpha: true, filter: 'NEAREST',
    variants: { x2: d2.replace('public/', '') }, bytes: sz(d1), culture: h.culture, troop: 'naval', side, deferred: true,
    fallback: `unit.${h.culture === 'default' ? '' : `${h.culture}.`}spear.${side}.64.sheet`.replace('unit..', 'unit.'),
    overlay_hint: 'ship_overlay.* back→본 시트→front 순(상체만 보임). 흘수선 y=62',
    generator: { ...GEN, script: 'docker/gemini/npc_naval_gen.mjs(npc_naval_gen.sh) + npc_naval_style.mjs → npc_naval_pp.sh(hero_dir_pp_v4.mjs)' },
    prompt_ref: `docker/gemini/npc_naval_style.mjs NAVAL.${code}`, ref_portrait: h.portrait.replace('public/', ''), calls: callsOf(code), qa: qa(code), verify: !!h.verify, verify_note: h.verify, license: LIC });
}
// 2) NPC 시트(일본군 지휘관 8 + 먹물 그림자 2)
for (const [code, h] of [...Object.entries(JP), ...Object.entries(INK)]) for (const side of ['ally', 'enemy']) {
  const f = `${code}_${side}_sheet.png`, d1 = `public/assets/sprites/npc/64/${f}`, d2 = `public/assets/sprites/npc/64_x2/${f}`;
  if (!existsSync(`${OUT}/64/hero_${code}_${side}_sheet.png`)) { console.log(`[건너뜀] 시트 없음 ${code}`); continue; }
  cp(`${OUT}/64/hero_${code}_${side}_sheet.png`, d1); cp(`${OUT}/64_x2/hero_${code}_${side}_sheet.png`, d2);
  items.push({ key: `unit.npc.${code}.${side}.64.sheet`, path: d1.replace('public/', ''), type: 'spritesheet', frameWidth: 64, frameHeight: 64, size: '192x256', cols: 3, rows: 4, row_order: ['down', 'left', 'right', 'up'], alpha: true, filter: 'NEAREST',
    variants: { x2: d2.replace('public/', '') }, bytes: sz(d1), npc: code, name_ko: h.name, side, deferred: true, fallback: code.startsWith('npc_ink') ? null : `unit.japan.${h.layout === 'mage' ? 'mage' : 'sword'}.${side}.64.sheet`,
    generator: { ...GEN, script: 'docker/gemini/npc_naval_gen.mjs + npc_naval_style.mjs → npc_naval_pp.sh(hero_dir_pp_v4.mjs)' },
    prompt_ref: `docker/gemini/npc_naval_style.mjs ${code.startsWith('npc_ink') ? 'INK' : 'JP'}.${code} (sheet)`, calls: callsOf(code), qa: qa(code), verify: !!h.verify, verify_note: h.verify ?? null, license: LIC });
}
// 3) 초상화(일본군 8 + 먹물 2 + 서가11 10) — neutral 1종. 다른 표정(serious/regret 등)은 이 키로 폴백
for (const [code, h, group] of [...Object.entries(JP).map(([c, v]) => [c, v, 'jp']), ...Object.entries(INK).map(([c, v]) => [c, v, 'ink']), ...Object.entries(S11).map(([c, v]) => [c, v, 's11'])]) {
  const src = `${OUT}/portraits/${code}.png`; if (!existsSync(src)) { console.log(`[건너뜀] 초상화 없음 ${code}`); continue; }
  const d = `public/assets/portraits/npc/${code}.png`, t = `public/assets/portraits/npc/thumb/${code}.webp`;
  cp(src, d); cp(`${OUT}/portraits/thumb/${code}.webp`, t);
  items.push({ key: `portrait.${code}`, path: d.replace('public/', ''), type: 'portrait', subtype: 'npc', size: '896x1200', ratio: '3:4', alpha: true, bytes: sz(d), npc: code, name_ko: h.name,
    group: { jp: '일본군 지휘관(서가 임진)', ink: '먹물 그림자(허구)', s11: '서가11 고려-거란' }[group], side: h.side ?? (group === 'ink' ? 'shadow' : 'enemy'), expressions: ['neutral'], expression_fallback: '모든 expr(serious·regret 등) → neutral', deferred: true,
    thumb: { key: `portrait.${code}.thumb`, path: t.replace('public/', ''), size: '256x343', bytes: sz(t) },
    sprite: group === 's11' ? null : `unit.npc.${code}`, sprite_note: group === 's11' ? '스프라이트는 문화권 병종 시트 폴백(korea.<unit> / 거란은 별도 문화권 시트 없음 → default 또는 china 계열 FE 결정)' : undefined,
    generator: { ...GEN, script: 'docker/gemini/npc_naval_gen.mjs + npc_naval_style.mjs → npc_naval_portrait_pp.sh(alpha_process.py B)' },
    prompt_ref: `docker/gemini/npc_naval_style.mjs ${group === 'jp' ? 'JP' : group === 'ink' ? 'INK' : 'S11'}.${code} (portrait)`, raw: `${G}/raw/portrait_${code}.jpg`, calls: callsOf(`portrait_${code}`),
    qa: qa(`portrait_${code}`), verify: !!h.verify || group === 'jp', verify_note: h.verify ?? (group === 'jp' ? '실존 인물 일반화 일러스트(얼굴 재현 아님)' : null), license: LIC });
}
const frag = { note: '수병 전투 시트(일본·조선·공용) + 일본군 지휘관 NPC 시트·초상화 + 먹물 그림자 + 서가11 NPC 초상화 manifest 조각(안아트 2026-11-01). 미병합 — manifest.json 직접 수정 안 함. 병합: merge_fragments.mjs FRAGMENTS 에 { path: `${A}/npc_naval_manifest_fragment.json`, kind: \'npc_naval\' } 추가(items 배열 형식, 썸네일은 item.thumb 내장 → 기존 로직이 처리). 모든 항목 deferred:true(부팅 로드 제외, 해당 스테이지/대화 진입 시 지연 로드 권장)',
  generated: new Date().toISOString(),
  keyRules: { naval: 'unit.<japan|korea|default>.naval.<ally|enemy>.64.sheet (없는 문화권 → unit.default.naval.*; 기존 대체용 보병 시트는 fallback 필드)', npc_sprite: 'unit.npc.<npc_code>.<ally|enemy>.64.sheet (일본군 지휘관은 적으로 나오므로 enemy 사용 권장. 먹물 그림자는 팔레트 스왑 없음 — ally/enemy 차이는 발밑 받침 색만)', npc_portrait: 'portrait.<npc_code> (+ .thumb). 표정은 neutral 1종, 대사 expr 은 모두 이 키로 폴백', sheet_layout: '192x256, 64x64 프레임 3열x4행, 행=down,left,right,up, 열=walk1,idle,walk2 (hero v4 와 동일), x2 는 variants.x2' },
  items };
if (!dry) writeFileSync('public/assets/npc_naval_manifest_fragment.json', JSON.stringify(frag, null, 1));
console.log(`항목 ${items.length}, 복사 ${copied.length}${dry ? ' (dry)' : ''}`);
