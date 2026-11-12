// npc_ch26 반영(호출 없음, 안아트 2026-11-08, npc_ch25b_publish.mjs 사본). npc_b11_portrait_publish.mjs + npc_b11_publish.mjs 와 같은 항목 형식, manifest.json·assets.js 는 건드리지 않음(병합은 별도: merge_fragments.mjs).
//   초상: docker/gemini/npc_ch26/portraits/out/<code>.png(+thumb/<code>.webp) → public/assets/portraits/npc/<code>.png + npc/thumb/<code>.webp
//         조각 public/assets/portraits/npc_ch26_portrait_manifest_fragment.json (키 portrait.<code> + .thumb)
//   시트: docker/gemini/npc_ch26/sprite_out/{64,64_x2}/hero_<code>_<side>_sheet.png → public/assets/sprites/npc/{64,64_x2}/<code>_<side>_sheet.png
//         조각 public/assets/sprites/npc/unit_npc_ch26_sprite_manifest_fragment.json (키 unit.npc.<code>.<ally|enemy>.64.sheet)
// QA 단일 출처: docker/gemini/npc_ch26/qa.json ({portrait:{code:{verdict..}}, sprite:{code:{verdict..}}}). pass/minor 만 게시. 기존 파일은 내용이 다르면 덮어쓰지 않음(충돌 보고, exit 2).
// 실행(프로젝트 루트): node docker/gemini/npc_ch26_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { P_CH26, OUT_P, LOG, G, plan, QA_SHEET, ALIAS_PORTRAITS } from './npc_ch26_style.mjs';
const dry = process.argv.includes('--dry');
const QA = JSON.parse(readFileSync(`${G}/qa.json`, 'utf8'));
const L = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const R = existsSync(`${G}/sprite_preview/pp_report.json`) ? JSON.parse(readFileSync(`${G}/sprite_preview/pp_report.json`, 'utf8')) : {};
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const ok = (q) => q && ['pass', 'minor'].includes(q.verdict);
const conflicts = [];
const safeCopy = (a, b) => { if (!existsSync(a)) throw new Error(`없음 ${a}`); if (dry) return; mkdirSync(b.replace(/\/[^/]+$/, ''), { recursive: true });
  if (!existsSync(b)) return copyFileSync(a, b); if (!readFileSync(a).equals(readFileSync(b))) conflicts.push(b); };
// ---- 초상 ----
const pItems = [], pSkip = [];
for (const [code, h] of Object.entries(P_CH26)) {
  const q = QA.portrait?.[code]; if (!ok(q)) { pSkip.push({ code, reason: `qa=${q?.verdict ?? 'not_checked'}` }); continue; }
  const d = `public/assets/portraits/npc/${code}.png`, t = `public/assets/portraits/npc/thumb/${code}.webp`;
  safeCopy(`${OUT_P}/${code}.png`, d); safeCopy(`${OUT_P}/thumb/${code}.webp`, t);
  const calls = L.filter((c) => c.id === `portrait_${code}`);
  pItems.push({ key: `portrait.${code}`, path: d.replace('public/', ''), type: 'portrait', subtype: 'npc', size: '896x1200', ratio: '3:4', alpha: true, bytes: sz(`${OUT_P}/${code}.png`),
    npc: code, roster_code: code, name_ko: h.name, side: h.side, era: h.era, culture: h.culture, used_in: h.used_in,
    expressions: ['neutral'], expression_fallback: '모든 expr → neutral', deferred: true,
    thumb: { key: `portrait.${code}.thumb`, path: t.replace('public/', ''), size: '256x343', bytes: sz(`${OUT_P}/thumb/${code}.webp`) },
    generator: { ...GEN, script: 'docker/gemini/npc_ch26_gen.mjs p(portrait_campaign_style.mjs job() + npc_ch26_style.mjs P_CH26) → npc_ch26_portraits_pp.sh(portrait_alpha_batch.sh, alpha_process.py B)' },
    prompt_ref: `docker/gemini/npc_ch26_style.mjs P_CH26.${code}`, style_ref: h.ref.replace('public/', ''), raw: `${G}/portraits/raw/portrait_${code}.jpg`,
    calls: calls.length, calls_ok: calls.filter((c) => c.status === 200).length, qa: { checked: true, ...q }, verify: true, verify_note: h.verify, license: LIC });
}
// ---- 별칭 초상(신규 그림 없음: 기존 파일을 npc_ 코드 키로도 등록) ----
for (const [code, a] of Object.entries(ALIAS_PORTRAITS)) {
  if (!existsSync("public/" + a.path)) throw new Error("별칭 원본 없음 " + a.path);
  pItems.push({ key: "portrait." + code, path: a.path, type: "portrait", subtype: "npc", size: "896x1200", ratio: "3:4", alpha: true, bytes: sz("public/" + a.path), npc: code, roster_code: code, name_ko: a.name,
    expressions: ["neutral"], expression_fallback: "모든 expr → neutral", deferred: true, alias_of: "portrait." + code.replace(/^npc_/, ""),
    thumb: { key: "portrait." + code + ".thumb", path: a.path.replace("portraits/", "portraits/thumb/").replace(/.png$/, ".webp"), size: "256x343" },
    generator: { note: "신규 생성 없음 — 기존 영웅 초상 재사용(같은 파일 경로)" }, qa: { checked: true, verdict: "pass", notes: "기존 승인 에셋" }, verify: false, license: LIC });
}
// ---- 시트 ----
const P = await plan(); const sItems = [], sSkip = [];
for (const [code, h] of Object.entries(P)) {
  const q = QA.sprite?.[code]; if (!ok(q)) { sSkip.push({ code, reason: `qa=${q?.verdict ?? 'not_generated'}` }); continue; }
  for (const side of ['ally', 'enemy']) {
    const f = `${code}_${side}_sheet.png`, d1 = `public/assets/sprites/npc/64/${f}`, d2 = `public/assets/sprites/npc/64_x2/${f}`;
    safeCopy(`${G}/sprite_out/64/hero_${f}`, d1); safeCopy(`${G}/sprite_out/64_x2/hero_${f}`, d2);
    const portrait = h.portrait_new ? `public/assets/portraits/npc/${code}.png` : h.portrait;
    sItems.push({ key: `unit.npc.${code}.${side}.64.sheet`, path: d1.replace('public/', ''), type: 'spritesheet', frameWidth: 64, frameHeight: 64, size: '192x256', cols: 3, rows: 4,
      row_order: ['down', 'left', 'right', 'up'], col_order: ['walk1', 'idle', 'walk2'], alpha: true, filter: 'NEAREST', scale: 'integer only(x1/x2/x3, nearest)',
      variants: { x2: d2.replace('public/', '') }, bytes: sz(`${G}/sprite_out/64/hero_${f}`), npc: code, name_ko: h.name, side, story_side: h.side, culture: h.culture, troop: h.troop, mounted: false,
      ship_overlay: h.troop === 'naval' ? '수군: 게임이 배 오버레이(back→유닛→front)를 겹침, 하반신 가려짐' : null,
      scope: 'npc', deferred: true, fallback: h.fallback.replace(/\.(ally|enemy)\./, `.${side}.`),
      team_marker: side === 'ally' ? '발밑 파랑 받침(A안)' : '발밑 빨강 받침 + 파랑 계열 색만 적색 스왑(hue 185-265)',
      generator: { ...GEN, script: 'docker/gemini/npc_ch26_gen.mjs s(refs = 병종 3x3 견본 hero_dir_refs + 정식 초상) → npc_ch26_pp.sh(hero_dir_pp_v4.mjs, HERO_FACE=npc_ch26/facing.json, pal_mode unique)' },
      prompt_ref: `docker/gemini/npc_ch26_style.mjs plan()#${code}`, ref_portrait: portrait, raw: `${G}/raw/${code}.jpg`, pipeline: R[code],
      calls: L.filter((c) => c.id === code).length, qa: { checked: true, verdict: q.verdict, checklist: QA_SHEET, issues: q.issues ?? [], notes: q.notes ?? null, contact: q.contact ?? null },
      verify: true, verify_note: h.verify || '복식 일반화', license: LIC, provenance: `refs: 3x3 방향 시트 견본(hero_dir_refs/${h.layout}.jpg, 배치·도트 크기만) + 정식 초상(${portrait})`, used_in: h.used_in });
  }
}
if (conflicts.length) { console.log('덮어쓰지 않음(내용 다름) — 중단:', conflicts); process.exit(2); }
const now = new Date().toISOString();
if (!dry) {
  writeFileSync('public/assets/portraits/npc_ch26_portrait_manifest_fragment.json', JSON.stringify({ note: "npc_ch26 초상 33키(신규 32 + 별칭 npc_pompey_magnus→기존 pompey_magnus 파일, 안아트 2026-11-08): ch26 로스터 29행·대사 화자 전원 + 설계서 컷인 4(카토·렌툴루스·세르빌리아·트레보니우스). 생성 정의 npc_ch26_style.mjs. 영웅 코드 mark_antony·marcus_brutus 는 portrait.npc_<code> 로 portraitCode 접두사 규칙이 연결",
    generated: now, keyRules: { portrait: 'portrait.<code> (+ .thumb). 표정 neutral 1종' }, skipped: pSkip, items: pItems }, null, 1));
  writeFileSync('public/assets/sprites/npc/unit_npc_ch26_sprite_manifest_fragment.json', JSON.stringify({ note: "npc_ch26: ch26 로스터 29행 전용 방향 시트(안아트 2026-11-08, npc_pompey_magnus 는 기존 unit.hero.pompey_magnus 로 npcSheetCode 연결이라 제외, 트레보니우스 추가). 시트 무기는 로스터 troop_type 기준(기병 3 = 기마 시트). 무기 1개 규칙·pal_mode unique. 영웅 코드 mark_antony·marcus_brutus 는 unitOwnKeys 의 unit.npc.npc_<hero> 후보로 연결. 신규 초상 = npc_ch26_portrait_manifest_fragment.json",
    generated: now, keyRules: { npc_sprite: 'unit.npc.<npc_code>.<ally|enemy>.64.sheet' }, skipped: sSkip, items: sItems }, null, 1));
}
console.log(`${dry ? '[dry] ' : ''}초상 ${pItems.length}, 건너뜀 ${JSON.stringify(pSkip)} / 시트 ${sItems.length / 2}명(${sItems.length}항목), 건너뜀 ${JSON.stringify(sSkip)}`);
