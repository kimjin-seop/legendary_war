// 반영(호출 없음, 안아트 2026-11-02): docker/gemini/portrait_campaign/out → public/assets/portraits/preview/ 신규 폴더 복사 + manifest 조각(미병합).
// manifest.json·merge_fragments.mjs·기존 폴더는 수정하지 않는다. 병합은 윤프론.
// 조각: public/assets/portraits/preview/portrait_preview_manifest_fragment.json   QA: docker/gemini/portrait_campaign/qa.json
// 실행(프로젝트 루트): node docker/gemini/portrait_campaign_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { P, LOG } from './portrait_campaign_style.mjs';
const G = 'docker/gemini/portrait_campaign', OUT = `${G}/out`, DST = 'public/assets/portraits/preview', dry = process.argv.includes('--dry');
const QA = existsSync(`${G}/qa.json`) ? JSON.parse(readFileSync(`${G}/qa.json`, 'utf8')) : {};
const L = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const items = [], skipped = [];
for (const [code, h] of Object.entries(P)) {
  const src = `${OUT}/${code}.png`, tsrc = `${OUT}/thumb/${code}.webp`;
  const q = QA[code] ?? { verdict: 'not_checked' };
  if (!existsSync(src) || q.verdict === 'fail') { skipped.push({ code, reason: !existsSync(src) ? '산출 없음' : `QA fail: ${q.issues?.join('; ')}` }); continue; }
  const d = `${DST}/${code}.png`, t = `${DST}/thumb/${code}.webp`;
  if (!dry) { mkdirSync(`${DST}/thumb`, { recursive: true }); copyFileSync(src, d); copyFileSync(tsrc, t); }
  const calls = L.filter((c) => c.id === `portrait_${code}`);
  items.push({ key: `portrait.${code}`, path: d.replace('public/', ''), type: 'portrait', subtype: code.startsWith('npc_') ? 'npc' : 'hero_preview', size: '896x1200', ratio: '3:4', alpha: true, bytes: sz(d),
    code, name_ko: h.name, shelf: h.shelf, side: h.side, era: h.era, culture: h.culture, expressions: ['neutral'], expression_fallback: '모든 expr → neutral', deferred: true,
    thumb: { key: `portrait.${code}.thumb`, path: t.replace('public/', ''), size: '256x343', bytes: sz(t) },
    generator: { ...GEN, script: 'docker/gemini/portrait_campaign_gen.mjs(portrait_campaign_gen.sh) + portrait_campaign_style.mjs → portrait_campaign_pp.sh(alpha_process.py B)' },
    prompt_ref: `docker/gemini/portrait_campaign_style.mjs P.${code}`, style_ref: h.ref ? h.ref.replace('public/', '') : null,
    calls: calls.length, calls_ok: calls.filter((c) => c.status === 200).length, qa: q,
    verify: h.kind !== 'invented', verify_note: h.verify ?? (h.kind === 'invented' ? null : '실존 인물 일반화 일러스트(얼굴 재현 아님)'), license: LIC });
}
const frag = {
  note: '준비 중 캠페인 인물 초상화 manifest 조각(안아트 2026-11-02). 미병합 — manifest.json 직접 수정 안 함(병합은 윤프론, items 배열 + item.thumb 내장 형식은 npc_naval 조각과 동일). 모두 deferred(해당 서가 진입 시 지연 로드).',
  generated: new Date().toISOString(),
  keyRules: { portrait: 'portrait.<code> (+ .thumb). 표정 neutral 1종', codes: '몽골 인물 코드는 heroes.json 미등록 상태의 제안 코드(영문). 표기(칭기스/칭기즈 등)는 사용자 결정 대기 — 파일명·키는 영문 코드로만' },
  ch18_keys: { reuse: ['portrait.genghis_khan'], new: ['portrait.mukhali', 'portrait.subutai', 'portrait.jebe', 'portrait.borchu'],
    proposed_codes: { mukhali: '무칼리(Muqali)', subutai: '수부타이(Subutai)', jebe: '제베(Jebe)', borchu: '보르추(Bo\'orchu)' }, note: 'heroes.json 등록 시 code 를 이 값으로 맞추면 키가 그대로 연결됨. 다른 코드로 정하면 파일명만 바꾸면 됨' },
  skipped, items };
if (!dry) writeFileSync(`${DST}/portrait_preview_manifest_fragment.json`, JSON.stringify(frag, null, 1));
console.log(`항목 ${items.length}, 건너뜀 ${skipped.length}${dry ? ' (dry)' : ''}`, skipped);
