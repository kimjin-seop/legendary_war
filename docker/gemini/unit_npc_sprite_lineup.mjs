// 전투 가독성 미리보기(호출 없음, 안아트-스프라이트 2026-11-02): 신규 NPC 시트 + 비교 대상(영웅·공용 병종)을 풀밭/물 배경 위 64px 1배·2배 idle 로 나란히.
// 실행: docker run --rm -v sharpcache:/sp -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/unit_npc_sprite_lineup.mjs
// 출력: docker/gemini/unit_npc_sprite/preview/lineup_x1.png, lineup_x2.png
import { createRequire } from 'node:module';
const sharp = createRequire('/sp/')('sharp');
const O = 'docker/gemini/unit_npc_sprite/out/64', S = 'public/assets/sprites/64';
const list = [
  [`${O}/hero_npc_won_gyun_ally_sheet.png`], [`${O}/hero_npc_jeong_un_ally_sheet.png`], [`${O}/hero_npc_i_yeoseong_ally_sheet.png`], [`${O}/hero_npc_jin_rin_ally_sheet.png`],
  [`${S}/hero_yi_sun_sin_ally_sheet.png`], [`${S}/hero_gwak_jaeu_ally_sheet.png`], [`${S}/korea_sword_ally_sheet.png`], [`${S}/korea_spear_ally_sheet.png`], [`${S}/china_cavalry_ally_sheet.png`],
  [`${O}/hero_npc_won_gyun_enemy_sheet.png`], [`${O}/hero_npc_jin_rin_enemy_sheet.png`], ['public/assets/sprites/npc/64/npc_jp_todo_takatora_enemy_sheet.png'],
];
const DIRS = [0, 1, 2, 3]; // down,left,right,up idle(col 1)
for (const sc of [1, 2]) {
  const cw = 64 * sc, comps = [];
  for (let i = 0; i < list.length; i++) for (const r of DIRS) {
    const buf = await sharp(list[i][0]).extract({ left: 64, top: r * 64, width: 64, height: 64 }).resize(cw, cw, { kernel: 'nearest' }).toBuffer();
    comps.push({ input: buf, left: i * cw, top: r * cw });
  }
  const W = list.length * cw, H = 4 * cw;
  const bg = Buffer.alloc(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 3; const water = y >= 2 * cw; const n = ((x * 7 + y * 13) % 11) - 5; bg[o] = (water ? 52 : 92) + n; bg[o + 1] = (water ? 96 : 128) + n; bg[o + 2] = (water ? 148 : 70) + n; }
  await sharp(bg, { raw: { width: W, height: H, channels: 3 } }).composite(comps).png().toFile(`docker/gemini/unit_npc_sprite/preview/lineup_x${sc}.png`);
}
console.log('ok');
