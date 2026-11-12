// 총병 병사 시트 반영(호출 없음, 안아트 2026-11-03): docker/gemini/gunner/sprite_out/{64,64_x2}/hero_gunner_<culture>_<side>_sheet.png
//   -> public/assets/sprites/{64,64_x2}/<culture>_gunner_<side>_sheet.png, 키 unit.<culture>.gunner.<side>.64.sheet (기존 병사 시트 unit.<culture>.<troop>.<side>.64.sheet 규칙)
//   조각 public/assets/sprites/gunner_manifest_fragment.json. 실행: node docker/gemini/gunner_publish.mjs
import { writeFileSync, copyFileSync, statSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
const QA = JSON.parse(readFileSync('docker/gemini/gunner/qa.json', 'utf8'));
const items = [];
const NAME = { japan: '조총병', europe: '머스킷병', korea: '총통수', middle_east: '예니체리 총병' };
for (const cul of ['japan', 'europe', 'korea', 'middle_east']) for (const side of ['ally', 'enemy']) {
  const q = QA[cul]; if (!q || !['pass', 'minor'].includes(q.verdict)) continue;
  const f = `${cul}_gunner_${side}_sheet.png`;
  for (const d of ['64', '64_x2']) { mkdirSync(`public/assets/sprites/${d}`, { recursive: true }); copyFileSync(`docker/gemini/gunner/sprite_out/${d}/hero_gunner_${cul}_${side}_sheet.png`, `public/assets/sprites/${d}/${f}`); }
  items.push({ key: `unit.${cul}.gunner.${side}.64.sheet`, path: `assets/sprites/64/${f}`, type: 'spritesheet', bytes: statSync(`public/assets/sprites/64/${f}`).size, verify: true, size: '192x256', frameWidth: 64, frameHeight: 64,
    grid: '3x4(행: down,left,right,up / 열: walk1,idle,walk2)', culture: cul, unit_type: 'gunner', display_name_hint: NAME[cul], side, mirror_baked: 'right', walk_frames: '[r*3, r*3+1, r*3+2, r*3+1] (r: 0 down,1 left,2 right,3 up)',
    team_mark: side === 'ally' ? '발밑 팀색 받침 마커(#3E8EF7, A안). 의상은 원색' : '발밑 팀색 받침 마커(#E04A4A) + 팔레트 스왑(파랑 계열만 빨강 계열)', pixel_pipeline: 'hero_dir_pp_v4.mjs(도트 격자 직접 샘플, 32색, 외곽선 1px)',
    variants: { x2: `assets/sprites/64_x2/${f}` }, alpha: true, fallback: `unit.${cul}.archer.${side}.64.sheet`,
    generator: { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K', script: 'docker/gemini/gunner_gen.mjs(gunner_style.mjs, 참조 = 궁병 3x3 견본) → hero_dir_pp_v4.mjs(HERO_FACE=gunner/facing.json)' },
    prompt_ref: `docker/gemini/gunner_style.mjs S_B4.gunner_${cul}`, license: 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요', qa: { checked: true, ...q } });
}
writeFileSync('public/assets/sprites/gunner_manifest_fragment.json', JSON.stringify({ _note: '총병(gunner) 병사 시트(일본 조총·유럽 머스킷 2026-11-03, 조선 총통수·오스만 예니체리 2026-11-04, 안아트). 다른 문화권은 후속 — 없는 문화권은 FE SPRITE_CLASS_FALLBACK(gunner→archer)', items }, null, 1));
console.log(items.map((i) => i.key).join(' '));
