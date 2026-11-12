// 김춘추 금관 시트 시험본(1회 호출) 게시 메타 갱신(호출 없음, 안아트 2026-11-08). unit.hero.npc_kim_chunchu.* 4키만 수정(조각·병합본).
import { readFileSync, writeFileSync, statSync } from 'node:fs';
const A = 'public/assets';
const R = JSON.parse(readFileSync('docker/gemini/hero_wave3/sprite_preview/pp_report.json', 'utf8')).npc_kim_chunchu;
const patch = (it) => {
  it.bytes = statSync(`public/${it.path}`).size;
  if (it.key.endsWith('.sheet')) {
    if (R) it.pipeline = R;
    it.calls = 2; it.revision = 'r1-crown-20261108(금관 초상 기준 1회 시험 제작 채택, 이전본 docker/db-backup-20261108/kim-chunchu-portrait/sprites64*)';
    it.qa = { checked: true, verdict: 'pass', checklist: { grid_3x3: true, side_left: true, portrait_match: true, weapon_consistent: true, crown_readable: true }, issues: ['정면 걷기 raw 칸은 손을 내렸으나 pp 가 정면 행을 idle+bob 으로 만들어 게시본은 손 모음 일관'], date: '2026-11-08' };
    it.verify_note = '신라 금관(출자형 입식·사슴뿔 입식) 게임 표현 — 초상 r1 과 일치. 7세기 중엽 시대 부합 verify';
  }
};
for (const f of [`${A}/sprites/hero_wave3_sprite_manifest_fragment.json`, `${A}/manifest.json`]) {
  const txt = readFileSync(f, 'utf8'), j = JSON.parse(txt), ind = /\n( +)"/.exec(txt)[1].length, nl = txt.endsWith('\n') ? '\n' : '';
  if (JSON.stringify(j, null, ind) + nl !== txt) { console.log('형식 불일치 — 건너뜀', f); continue; }
  const arr = Array.isArray(j) ? j : (j.items || Object.values(j).find(Array.isArray)); let n = 0;
  for (const it of arr) if (/^unit\.hero\.npc_kim_chunchu\.(ally|enemy)\.64(\.sheet)?$/.test(it.key)) { patch(it); n++; }
  writeFileSync(f, JSON.stringify(j, null, ind) + nl); console.log(f, '수정', n);
}
