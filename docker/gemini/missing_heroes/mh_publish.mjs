// 누락 영웅 초상 게시 + manifest 조각 기록(호출 없음, 안아트-2 2026-11-09). manifest.json 병합은 하지 않음(윤프론 담당).
//   out/<code>.png(+thumb/<code>.webp) → public/assets/portraits/npc/<code>.png + npc/thumb/<code>.webp (기존 파일 덮어쓰기 금지)
//   조각: public/assets/portraits/missing_heroes_manifest_fragment.json (items + item.thumb 내장, ch25_manifest_fragment 와 같은 형식) + reuse(Porus)
// 실행(프로젝트 루트): node docker/gemini/missing_heroes/mh_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { P_MH, REUSE, OUT, LOG, QA_PATH } from './mh_style.mjs';
const dry = process.argv.includes('--dry');
const QA = JSON.parse(readFileSync(QA_PATH, 'utf8'));
const L = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const FRAG = 'public/assets/portraits/missing_heroes_manifest_fragment.json';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const conflicts = [];
const safeCopy = (a, b) => { if (!existsSync(a)) throw new Error(`없음 ${a}`); if (dry) return; mkdirSync(b.replace(/\/[^/]+$/, ''), { recursive: true });
  if (!existsSync(b)) return copyFileSync(a, b); if (!readFileSync(a).equals(readFileSync(b))) conflicts.push(b); };
const items = [], skipped = [];
for (const [code, h] of Object.entries(P_MH)) {
  const q = QA[code];
  if (!q || !['pass', 'minor'].includes(q.verdict)) { skipped.push({ code, reason: `qa=${q?.verdict ?? 'not_checked'}` }); continue; }
  const d = `public/assets/portraits/npc/${code}.png`, t = `public/assets/portraits/npc/thumb/${code}.webp`;
  safeCopy(`${OUT}/${code}.png`, d); safeCopy(`${OUT}/thumb/${code}.webp`, t);
  const calls = L.filter((c) => c.id === code);
  items.push({ key: `portrait.${code}`, path: d.replace('public/', ''), type: 'portrait', subtype: 'npc', size: '896x1200', ratio: '3:4', alpha: true, bytes: sz(d),
    npc: code, roster_code: code, name_ko: h.name, side: h.side, era: h.era, culture: h.culture, used_in: h.used_in,
    expressions: ['neutral'], expression_fallback: '모든 expr → neutral', deferred: true,
    thumb: { key: `portrait.${code}.thumb`, path: t.replace('public/', ''), size: '256x343', format: 'webp', bytes: sz(t) },
    generator: { ...GEN, script: 'docker/gemini/missing_heroes/mh_gen.mjs → mh_pp.sh(portrait_alpha_batch.sh, alpha_process.py B)' },
    prompt_ref: `docker/gemini/missing_heroes/mh_style.mjs P_MH.${code}`, style_ref: h.ref.replace('public/', ''), source_note: h.src,
    calls: calls.length, calls_ok: calls.filter((c) => c.status === 200).length, qa: { checked: true, ...q }, verify: true, verify_note: h.verify, license: LIC });
}
if (conflicts.length) { console.log('덮어쓰지 않음(내용 다름) — 중단:', conflicts); process.exit(2); }
const frag = { note: '누락 영웅 초상(안아트-2 2026-11-09): 멤논·스티건드·벨러 4세·마우론티우스 신규 4, 포로스는 기존 초상 재사용. manifest 병합은 윤프론.',
  generated: new Date().toISOString(), keyRules: { portrait: 'portrait.<code> (+ .thumb). 표정 neutral 1종' }, merge_hint: 'items 와 item.thumb 를 각각 manifest 키로 추가(source_fragment=assets/portraits/missing_heroes_manifest_fragment.json)',
  reuse: Object.entries(REUSE).map(([code, r]) => ({ code, name_ko: r.name, use_keys: r.keys, generated: false, reason: r.reason })), skipped, items };
if (!dry) writeFileSync(FRAG, JSON.stringify(frag, null, 1));
console.log(`항목 ${items.length}, 재사용 ${frag.reuse.length}, 건너뜀 ${JSON.stringify(skipped)}${dry ? ' (dry)' : ''}`);
