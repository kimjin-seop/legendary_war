// [npc_b11 사본: ch25_portraits_publish.mjs 복제, --merge 제거(manifest 는 윤프론 병합)] b11 신규 NPC 초상 7 반영(호출 없음, 안아트 2026-11-07)
//   docker/gemini/npc_b11/portraits/out/<code>.png(+thumb/<code>.webp) → public/assets/portraits/npc/<code>.png + npc/thumb/<code>.webp
//   조각: public/assets/portraits/npc_b11_portrait_manifest_fragment.json (items + item.thumb 내장, ch25_manifest_fragment 와 같은 항목 형식)
// QA 단일 출처: docker/gemini/npc_b11/portraits/qa.json ({code: {verdict,...}}). pass/minor 만 게시. 기존 파일은 덮어쓰지 않음(내용이 다르면 중단 목록).
// webp: 본 초상은 기존 규칙대로 PNG 게시 → 이후 webp_convert.py portraits 배치가 webp_map.json 에 넣고 merge_fragments 가 path 교체(썸네일은 처음부터 webp).
// 실행(프로젝트 루트): node docker/gemini/npc_b11_portrait_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync, renameSync } from 'node:fs';
import { P_B11 as P_CH25, OUT, LOG, QA_PATH } from './npc_b11_portrait_style.mjs';
const dry = process.argv.includes('--dry');
const QA = existsSync(QA_PATH) ? JSON.parse(readFileSync(QA_PATH, 'utf8')) : {};
const L = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const FRAG = 'public/assets/portraits/npc_b11_portrait_manifest_fragment.json', SRC = 'assets/portraits/npc_b11_portrait_manifest_fragment.json';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const conflicts = [];
const safeCopy = (a, b) => { if (!existsSync(a)) throw new Error(`없음 ${a}`); if (dry) return; mkdirSync(b.replace(/\/[^/]+$/, ''), { recursive: true });
  if (!existsSync(b)) return copyFileSync(a, b); if (!readFileSync(a).equals(readFileSync(b))) conflicts.push(b); };
const ok = (q) => q && ['pass', 'minor'].includes(q.verdict);
const items = [], skipped = [];
for (const [code, h] of Object.entries(P_CH25)) {
  const q = QA[code];
  if (!ok(q)) { skipped.push({ code, reason: `qa=${q?.verdict ?? 'not_checked'}` }); continue; }
  const d = `public/assets/portraits/npc/${code}.png`, t = `public/assets/portraits/npc/thumb/${code}.webp`;
  safeCopy(`${OUT}/${code}.png`, d); safeCopy(`${OUT}/thumb/${code}.webp`, t);
  const calls = L.filter((c) => c.id === `portrait_${code}`);
  items.push({ key: `portrait.${code}`, path: d.replace('public/', ''), type: 'portrait', subtype: 'npc', size: '896x1200', ratio: '3:4', alpha: true, bytes: sz(d),
    npc: code, roster_code: code, name_ko: h.name, side: h.side, era: h.era, culture: h.culture, used_in: h.used_in,
    expressions: ['neutral'], expression_fallback: '모든 expr → neutral', deferred: true,
    thumb: { key: `portrait.${code}.thumb`, path: t.replace('public/', ''), size: '256x343', bytes: sz(t) },
    generator: { ...GEN, script: 'docker/gemini/npc_b11_portrait_gen.mjs(portrait_campaign_style.mjs job() + npc_b11_portrait_style.mjs P_B11) → npc_b11_portraits_pp.sh(portrait_alpha_batch.sh, alpha_process.py B)' },
    prompt_ref: `docker/gemini/npc_b11_portrait_style.mjs P_B11.${code}`, style_ref: h.ref.replace('public/', ''),
    calls: calls.length, calls_ok: calls.filter((c) => c.status === 200).length, qa: { checked: true, ...q }, verify: true, verify_note: h.verify, license: LIC });
}
if (conflicts.length) { console.log('덮어쓰지 않음(내용 다름) — 중단:', conflicts); process.exit(2); }
const frag = { note: 'npc_b11 신규 NPC 초상 7(안아트 2026-11-07): 유기(ch12_s6) + ch25 쩐·원 측 6명. 전용 시트(unit_npc_b11_sprite_manifest_fragment) 외형 기준. 생성 정의 npc_b11_portrait_style.mjs',
  generated: new Date().toISOString(), keyRules: { portrait: 'portrait.<code> (+ .thumb). 표정 neutral 1종' }, skipped, items };
if (!dry) writeFileSync(FRAG, JSON.stringify(frag, null, 1));
console.log(`항목 ${items.length}, 건너뜀 ${JSON.stringify(skipped)}${dry ? ' (dry)' : ''}`);
