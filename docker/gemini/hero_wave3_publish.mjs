// 영웅 풀 확장 3차 신규 35명 초상 반영(호출 없음, 안아트 2026-11-06, hero_exp1_publish.mjs 복제).
//   docker/gemini/portrait_campaign/out/<code>.png(+thumb/<code>.webp) → public/assets/portraits/<code>.png + portraits/thumb/<code>.webp
//   manifest 조각: public/assets/portraits/portrait_hero_wave3_manifest_fragment.json (items + item.thumb 내장, 병합은 merge_fragments.mjs FRAGMENTS)
// QA 단일 출처: docker/gemini/hero_wave3/qa.json ({ code: {verdict, ...} }). pass/minor 만 게시. 기존 파일은 내용이 다르면 덮어쓰지 않음(--replace 시 교체).
// 실행(프로젝트 루트): node docker/gemini/hero_wave3_publish.mjs [--dry] [--replace]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { P_W3 as P_ALL, QA_PATH, W3_LOG as EXP1_LOG } from './hero_wave3_style.mjs';
const P_EXP2 = {};
const dry = process.argv.includes('--dry'), replace = process.argv.includes('--replace');
const QA = JSON.parse(readFileSync(QA_PATH, 'utf8'));
const L = existsSync(EXP1_LOG) ? readFileSync(EXP1_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const NARR = JSON.parse(readFileSync('database/data/proposals/hero_expansion_wave3_candidates.json', 'utf8')).candidates;
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const conflicts = [];
const safeCopy = (a, b) => { if (!existsSync(a)) throw new Error(`없음 ${a}`); if (dry) return; mkdirSync(b.replace(/\/[^/]+$/, ''), { recursive: true });
  if (!existsSync(b) || replace) return copyFileSync(a, b); if (!readFileSync(a).equals(readFileSync(b))) conflicts.push(b); };
const ok = (q) => q && ['pass', 'minor'].includes(q.verdict);
const O = 'docker/gemini/portrait_campaign/out';
const items = [], skipped = [];
for (const [code, h] of Object.entries(P_ALL)) {
  const q = QA[code];
  if (!ok(q)) { skipped.push({ code, reason: `qa=${q?.verdict ?? 'not_checked'}${q?.issues ? ': ' + q.issues.join('; ') : ''}` }); continue; }
  const d = `public/assets/portraits/${code}.png`, t = `public/assets/portraits/thumb/${code}.webp`;
  safeCopy(`${O}/${code}.png`, d); safeCopy(`${O}/thumb/${code}.webp`, t);
  const n = NARR.find((x) => x.code === code) ?? {};
  const calls = L.filter((c) => c.id === `portrait_${code}`);
  items.push({ key: `portrait.${code}`, path: d.replace('public/', ''), type: 'portrait', size: '896x1200', aspect: '3:4', alpha: true, bytes: sz(d),
    code, code_source: 'database/data/proposals/hero_expansion_wave3_candidates.json', name_ko: n.name_ko ?? h.name, era: h.era, culture: h.culture, region_group: n.culture, female: !!h.female,
    expressions: ['neutral'], expression_fallback: '모든 expr → neutral',
    thumb: { key: `portrait.${code}.thumb`, path: t.replace('public/', ''), size: '256x343', bytes: sz(t) },
    generator: { ...GEN, script: 'docker/gemini/hero_wave3_gen.mjs(portrait_campaign_style.mjs job() + hero_wave3_style.mjs P_W3) → portrait_npc_v3_pp.sh(portrait_campaign_pp.sh, alpha_process.py B)' },
    prompt_ref: `docker/gemini/hero_wave3_style.mjs P_W3.${code}`, style_ref: h.ref.replace('public/', ''),
    calls: calls.length, calls_ok: calls.filter((c) => c.status === 200).length, qa: { checked: true, ...q },
    verify: true, verify_note: `실존 인물 일반화 일러스트(얼굴 재현 아님). ${h.verify}`, license: LIC });
}
const frag = { note: '영웅 풀 확장 3차 신규 35명 초상(안아트 2026-11-06). 기존 영웅 초상과 같은 경로·키 규칙(portrait.<code> + .thumb). 승격 25명은 기존 portrait.npc_* 보유',
  generated: new Date().toISOString(), keyRules: { portrait: 'portrait.<code> (+ .thumb). 표정 neutral 1종' }, skipped, items };
if (!dry) writeFileSync('public/assets/portraits/portrait_hero_wave3_manifest_fragment.json', JSON.stringify(frag, null, 1));
if (conflicts.length) console.log('덮어쓰지 않음(내용 다름):', conflicts);
console.log(`항목 ${items.length}, 건너뜀 ${JSON.stringify(skipped)}${dry ? ' (dry)' : ''}`);
