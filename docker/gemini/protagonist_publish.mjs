// 주인공 에셋 반영(호출 없음): QA(protagonist_qa.json) 결과가 fail 이 아닌 산출물을 public 으로 복사(기존 파일 덮어쓰기 금지 — 동일 내용이면 통과, 다르면 중단)
// + manifest 조각 public/assets/protagonist_manifest_fragment.json 작성. manifest.json 본 파일은 수정하지 않음(병합·FE 연결은 윤프론).
// 실행(프로젝트 루트): node docker/gemini/protagonist_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, statSync } from 'node:fs';
const G = 'docker/gemini', O = `${G}/protagonist_out`, dry = process.argv.includes('--dry');
const FACES = ['male_a', 'male_b', 'male_c', 'female_a', 'female_b', 'female_c'], EXPRS = ['neutral', 'smile', 'determined', 'hurt'], CLS = ['base', 'sword', 'spear', 'archer', 'cavalry', 'heavy'];
const Q = JSON.parse(readFileSync(`${G}/protagonist_qa.json`, 'utf8'));
const logs = existsSync(`${G}/protagonist_calls_log.jsonl`) ? readFileSync(`${G}/protagonist_calls_log.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
const calls = (id) => logs.filter((c) => c.id === id).length;
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요';
const items = [], skipped = [], copied = [];
function put(src, dst) {
  if (!existsSync(src)) throw new Error(`없음 ${src}`);
  if (existsSync(dst)) { if (Buffer.compare(readFileSync(src), readFileSync(dst)) !== 0) throw new Error(`덮어쓰기 금지: ${dst} 이 다른 내용으로 이미 있음`); return; }
  if (!dry) { mkdirSync(dst.slice(0, dst.lastIndexOf('/')), { recursive: true }); copyFileSync(src, dst); } copied.push(dst);
}
const qa = (id) => Q[id] ?? { verdict: 'not_checked' };
const bytes = (p) => (existsSync(`public/${p}`) ? statSync(`public/${p}`).size : null);
for (const face of FACES) {
  for (const e of EXPRS) {
    const id = `portrait_${face}_${e}`, q = qa(id); if (q.verdict === 'fail' || q.verdict === 'not_checked') { skipped.push({ id, ...q }); continue; }
    const p = `assets/portraits/protagonist/protagonist_${face}_${e}.png`; put(`${O}/portraits/${id}.png`, `public/${p}`);
    items.push({ key: `portrait.protagonist_${face}.${e}`, path: p, type: 'portrait', size: '896x1200', bytes: bytes(p), alpha: true, ratio: '3:4', min: '896x1200', expression: e, face, gender: face.split('_')[0],
      fallback_key: e === 'neutral' ? undefined : `portrait.protagonist_${face}.neutral`, sprite: `unit.protagonist.${face}.base`,
      generator: { ...GEN, script: 'docker/gemini/protagonist_gen.mjs(protagonist_gen.sh) + protagonist_style.mjs → portrait_alpha_batch.sh' }, prompt_ref: `docker/gemini/protagonist_style.mjs portraitJob('${face}','${e}')`,
      raw: `docker/gemini/protagonist_raw/${id}.jpg`, calls: calls(id), qa: { checked: true, ...q }, verify: false, license: LIC, provenance: '오리지널 캐릭터(서고 소환자), 참조는 자체 생성 raw 만 사용' });
  }
  { const id = `fullbody_${face}`, q = qa(id); if (q.verdict === 'fail' || q.verdict === 'not_checked') skipped.push({ id, ...q }); else {
    const p = `assets/portraits/protagonist/fullbody/protagonist_${face}_fullbody.png`; put(`${O}/fullbody/${id}.png`, `public/${p}`);
    items.push({ key: `illust.protagonist_${face}.fullbody`, path: p, type: 'illustration', size: q.size ?? '900x1600', bytes: bytes(p), alpha: true, ratio: '9:16', face, gender: face.split('_')[0], use: '캐릭터 생성 화면 선택 카드/전신 일러스트(작게 쓸 때는 CSS 축소, 정수 배율 불필요)',
      generator: { ...GEN, script: 'docker/gemini/protagonist_gen.mjs + alpha_process.py B' }, prompt_ref: `docker/gemini/protagonist_style.mjs fullbodyJob('${face}')`, raw: `docker/gemini/protagonist_raw/${id}.jpg`, calls: calls(id), qa: { checked: true, ...q }, verify: false, license: LIC }); } }
  for (const c of CLS) {
    const id = `sheet_${face}_${c}`, q = qa(id); if (q.verdict === 'fail' || q.verdict === 'not_checked') { skipped.push({ id, ...q }); continue; }
    for (const side of ['ally', 'enemy']) {
      for (const sc of ['64', '64_x2']) put(`${O}/sprites/${sc}/hero_${id}_${side}_sheet.png`, `public/assets/sprites/protagonist/${sc}/protagonist_${face}_${c}_${side}_sheet.png`);
      const p = `assets/sprites/protagonist/64/protagonist_${face}_${c}_${side}_sheet.png`;
      items.push({ key: `unit.protagonist.${face}.${c}.${side}.64.sheet`, path: p, type: 'spritesheet', size: '192x256', frame: [64, 64], frameWidth: 64, frameHeight: 64,
        layout: { cols: ['walk1', 'idle', 'walk2'], rows: ['down', 'left', 'right', 'up'] }, alpha: 'binary(0/255)', scale: 'integer only(x1/x2/x3, nearest)',
        team: side === 'ally' ? 'ally: 원색 + 발밑 파랑 받침(A안)' : 'enemy: 파랑 계열(hue 185-265) → 빨강 스왑 + 발밑 빨강 받침', variants: { x2: p.replace('/64/', '/64_x2/') }, bytes: bytes(p),
        face, class: c, fallback_key: c === 'base' ? undefined : `unit.protagonist.${face}.base.${side}.64.sheet`, portrait: `portrait.protagonist_${face}.neutral`,
        generator: { ...GEN, script: 'docker/gemini/protagonist_gen.mjs → hero_dir_pp_v4.mjs(protagonist_pp.sh) → protagonist_compare.mjs' }, prompt_ref: `docker/gemini/protagonist_style.mjs sheetJob('${face}','${c}')`,
        raw: `docker/gemini/protagonist_raw/${id}.jpg`, calls: calls(id), qa: { checked: true, ...q, compare: `docker/gemini/protagonist_preview/compare_${face}.png` }, verify: false, license: LIC,
        provenance: c === 'base' ? 'refs: 병종 방향 시트 견본(배치·도트 크기만) + 정식 neutral 초상화' : 'refs: 병종 방향 시트 견본 + 정식 neutral 초상화 + 같은 얼굴 base 시트 raw' });
    }
  }
}
const frag = {
  note: '주인공(서고 소환자) 에셋 manifest 조각(안아트 2026-11-01). manifest.json 직접 수정 안 함 — 병합은 윤프론(build_manifest.mjs MERGE_FRAGMENTS 에 이 경로 추가). 설계: docker/gemini/protagonist_design.md',
  generated: new Date().toISOString(),
  keyRules: {
    faces: FACES, expressions: EXPRS, classes: CLS.slice(1),
    portrait: 'portrait.protagonist_<face>.<expr> (face=male_a|male_b|male_c|female_a|female_b|female_c, expr=neutral|smile|determined|hurt). 없는 표정 → portrait.protagonist_<face>.neutral',
    fullbody: 'illust.protagonist_<face>.fullbody (캐릭터 생성 화면 선택 카드)',
    sprite: 'unit.protagonist.<face>.<class>.<ally|enemy>.64.sheet (class=sword|spear|archer|cavalry|heavy, 기본 복장=base). 조회 순서: unit.protagonist.<face>.<class>.<side>.64.sheet → unit.protagonist.<face>.base.<side>.64.sheet → unit.<class>.<side>.64.sheet(범용 병종) . 주인공 cavalry 의 병종 키는 cavalry, heavy 는 heavy',
    x2: '각 시트 item.variants.x2 (64_x2 폴더, nearest 2배)',
  },
  pending: skipped, items,
};
if (!dry) writeFileSync('public/assets/protagonist_manifest_fragment.json', JSON.stringify(frag, null, 1));
console.log(`${dry ? '[dry] ' : ''}items ${items.length}, copied ${copied.length}, skipped ${skipped.length}${skipped.length ? ': ' + skipped.map((s) => s.id).join(',') : ''}`);
