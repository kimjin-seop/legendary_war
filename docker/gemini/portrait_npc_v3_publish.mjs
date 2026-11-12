// 신규 NPC v3 초상 반영(ch16 오를레앙·서가 신규)(호출 없음, 안아트 2026-11-02): docker/gemini/portrait_campaign/out/<code>.png(+thumb) → public/assets/portraits/npc/
// + manifest 조각 public/assets/portraits/npc/portrait_npc_v3_manifest_fragment.json (병합은 merge_fragments.mjs 로만).
// 작업 정의: portrait_npc_v3_style.mjs P_NPC_V3(프롬프트 조립 portrait_campaign_style.mjs job()). QA: docker/gemini/portrait_campaign/qa_npc_v3.json (qa 없는 코드는 반영하지 않음)
// 실행(프로젝트 루트): node docker/gemini/portrait_npc_v3_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
// 3차(2026-11-02): 기존 파일 덮어쓰기 금지 — 대상이 이미 있고 내용이 같으면 건너뜀, 다르면 복사하지 않고 skipped 에 기록
const same = (a, b) => existsSync(b) && readFileSync(a).equals(readFileSync(b));
const safeCopy = (a, b, code) => { if (!existsSync(b)) { copyFileSync(a, b); return 'new'; } if (same(a, b)) return 'same'; conflictsCopy.push(`${code}: ${b} 내용 다름(덮어쓰지 않음)`); return 'conflict'; };
const conflictsCopy = [];
import { P_NPC_V3, LOG } from './portrait_campaign_style.mjs';
const G = 'docker/gemini/portrait_campaign', OUT = `${G}/out`, DST = 'public/assets/portraits/npc', dry = process.argv.includes('--dry');
const QA = existsSync(`${G}/qa_npc_v3.json`) ? JSON.parse(readFileSync(`${G}/qa_npc_v3.json`, 'utf8')) : {};
const L = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const items = [], skipped = [];
for (const [code, h] of Object.entries(P_NPC_V3)) {
  const src = `${OUT}/${code}.png`, tsrc = `${OUT}/thumb/${code}.webp`;
  const q = QA[code] ?? { verdict: 'not_checked' };
  if (!existsSync(src) || q.verdict === 'fail' || q.verdict === 'not_checked') { skipped.push({ code, reason: !existsSync(src) ? '산출 없음' : `QA fail: ${q.issues?.join('; ')}` }); continue; }
  const d = `${DST}/${code}.png`, t = `${DST}/thumb/${code}.webp`;
  if (!dry) { mkdirSync(`${DST}/thumb`, { recursive: true }); safeCopy(src, d, code); safeCopy(tsrc, t, code); }
  const calls = L.filter((c) => c.id === `portrait_${code}`);
  items.push({ key: `portrait.${code}`, path: d.replace('public/', ''), type: 'portrait', subtype: 'npc', size: '896x1200', ratio: '3:4', alpha: true, bytes: sz(d),
    npc: code, roster_code: h.roster, name_ko: h.name, side: h.side, era: h.era, culture: h.culture, used_in: h.used_in,
    expressions: ['neutral'], expression_fallback: '모든 expr → neutral', deferred: true,
    thumb: { key: `portrait.${code}.thumb`, path: t.replace('public/', ''), size: '256x343', bytes: sz(t) },
    generator: { ...GEN, script: 'docker/gemini/portrait_campaign_gen.mjs(portrait_campaign_gen.sh) + portrait_npc_v3_style.mjs P_NPC_V3 → (portrait_campaign_style.mjs job()) → portrait_campaign_pp.sh(alpha_process.py B)' },
    prompt_ref: `docker/gemini/portrait_npc_v3_style.mjs P_NPC_V3.${code}`, style_ref: h.ref ? h.ref.replace('public/', '') : null,
    calls: calls.length, calls_ok: calls.filter((c) => c.status === 200).length, qa: q,
    verify: true, verify_note: h.verify ?? '실존 인물 일반화 일러스트(얼굴 재현 아님)', license: LIC });
}
const frag = {
  note: '신규 NPC v3 초상화 조각(안아트 2026-11-02). npc_roster_v3_additions.json ch16 오를레앙 + npc_roster_v3_additions_shelf.json 초상 누락 인물. 모두 deferred(개별 지연 로드). 키는 로스터 코드 그대로 portrait.<code>',
  generated: new Date().toISOString(),
  keyRules: { portrait: 'portrait.<code> (+ .thumb). 표정 neutral 1종', alias: '별칭 없음(로스터 code = 키 code)' },
  skipped, items };
if (!dry) writeFileSync(`${DST}/portrait_npc_v3_manifest_fragment.json`, JSON.stringify(frag, null, 1));
if (conflictsCopy.length) console.log('복사 충돌(덮어쓰지 않음):', conflictsCopy);
console.log(`항목 ${items.length}, 건너뜀 ${skipped.length}${dry ? ' (dry)' : ''}`, JSON.stringify(skipped));
