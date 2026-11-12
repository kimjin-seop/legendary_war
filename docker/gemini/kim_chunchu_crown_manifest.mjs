// 김춘추 금관 초상 r3 manifest 메타 갱신(호출 없음, 안아트 2026-11-08). 조각·병합본·webp 대응표의 portrait.npc_kim_chunchu 항목만 수정.
// 실행(프로젝트 루트): docker run --rm -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/kim_chunchu_crown_manifest.mjs
import { readFileSync, writeFileSync, statSync } from 'node:fs';
const A = 'public/assets';
const bytes = statSync(`${A}/portraits/npc/npc_kim_chunchu.webp`).size, tb = statSync(`${A}/portraits/npc/thumb/npc_kim_chunchu.webp`).size;
const patch = (it) => {
  it.era = '603~661(게임 표현: 젊은 군주)';
  it.generator = { ...(it.generator || {}), script: 'docker/gemini/portrait_campaign_gen.mjs(portrait_campaign_gen.sh) + portrait_npc_v3_style.mjs P_NPC_V3 r1(2026-11-08 금관) → portrait_campaign_pp.sh(alpha_process.py B) → kim_chunchu_crown_publish.py(상단 여백 6% 맞춤·webp q90 alpha100·썸네일 q88)' };
  it.calls = 4; it.calls_ok = 4; it.revision = 'r1-crown-20261108(채택 3회차 raw, 1·2회차 portrait_campaign/raw/portrait_npc_kim_chunchu_try2~3.jpg 보존)';
  it.qa = { ...(it.qa || {}), verdict: 'pass', checked: true, date: '2026-11-08', batch: 'kim_chunchu_crown',
    issues: ['한 손만 보임(오른손, 다른 손은 소매 안 — 기형 아님, 3회 모두 동일해 허용)'],
    notes: 'r1 금관 교체(사용자 요청). 출자형 입식 3 + 사슴뿔 입식 2, 곡옥·영락·귀 드리개 곡옥, 요패 금 허리띠. 무기 없음, 얼굴 거의 정면, 상단 여백 6.08%, 불투명 마젠타 0, 알파 최대 차 0. 1회차 십자가처럼 보이는 입식으로 탈락, 2회차 출자형 입식 1개로 보류' };
  it.verify = true;
  it.verify_note = '사용자 요청(2026-11-08)으로 금관 착용 젊은 군주로 교체(이전 복두판은 docker/db-backup-20261108/kim-chunchu-portrait/). 출자형 금관은 5~6세기 고분 출토 양식이라 7세기 중엽 김춘추 재위기와 시대가 다를 수 있음(게임 표현). 용모 일반화';
  if ('bytes' in it) it.bytes = bytes;
  if (it.thumb && typeof it.thumb === 'object') it.thumb.bytes = tb;
};
for (const [f, ind] of [[`${A}/portraits/npc/portrait_npc_v3_manifest_fragment.json`], [`${A}/manifest.json`]]) {
  const txt = readFileSync(f, 'utf8'); const j = JSON.parse(txt);
  const indent = /\n( +)"/.exec(txt)[1].length;
  if (JSON.stringify(j, null, indent) + (txt.endsWith('\n') ? '\n' : '') !== txt) { console.log('형식 불일치 — 건너뜀', f); continue; }
  const arr = Array.isArray(j) ? j : (j.items || j.portraits || Object.values(j).find(Array.isArray));
  let n = 0;
  for (const it of arr) { if (it.key === 'portrait.npc_kim_chunchu') { patch(it); n++; } if (it.key === 'portrait.npc_kim_chunchu.thumb' && 'bytes' in it) { it.bytes = tb; n++; } }
  writeFileSync(f, JSON.stringify(j, null, indent) + (txt.endsWith('\n') ? '\n' : '')); console.log(f, '수정', n);
}
const mf = `${A}/webp_map.json`, mt = readFileSync(mf, 'utf8'), m = JSON.parse(mt), ki = /\n( +)"/.exec(mt)[1].length;
const e = m['assets/portraits/npc/npc_kim_chunchu.png'];
if (e && JSON.stringify(m, null, ki) + (mt.endsWith('\n') ? '\n' : '') === mt) { e.bytes_webp = bytes; e.note = 'r1 금관(2026-11-08) 직접 webp 게시(원본 png 없음, kim_chunchu_crown_publish.py)'; writeFileSync(mf, JSON.stringify(m, null, ki) + (mt.endsWith('\n') ? '\n' : '')); console.log('webp_map 수정'); } else console.log('webp_map 건너뜀');
console.log('bytes', bytes, 'thumb', tb);
