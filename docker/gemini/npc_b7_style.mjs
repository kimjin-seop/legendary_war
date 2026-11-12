// 강화면 검증 지적(2026-11-03): npc_lu_su(노숙, ch12)·npc_torii_suneemon(도리이 스네에몬, ch20) 전용 시트 없음 → 시트만 생성(초상은 기존 portrait.npc_*).
// npc_b5_style.mjs 와 같은 export 형식(npc_b7_gen.mjs·npc_b7_publish.mjs = b5 사본). 외형 = 기존 초상 설명 + 초상 이미지 참조
import { NPC } from './unit_npc_sprite_style.mjs';
import { P_NPC_V3 } from './portrait_npc_v3_style.mjs';
import { P } from './portrait_campaign_style.mjs';
const LAY = 'docker/gemini/hero_dir_refs/dir64_korea_sword.jpg';
const T = [['npc_lu_su', '노숙', 'ally', 'china', P.npc_lu_su], ['npc_torii_suneemon', '도리이 스네에몬', 'ally', 'japan', P_NPC_V3.npc_torii_suneemon]];
export const S_B4 = {}; export const PORTRAIT_SRC = {};
for (const [code, name, team, cult, p] of T) {
  if (!p) throw new Error(`초상 설명 없음 ${code}`);
  S_B4[code] = { name, team, culture: cult, troop: 'sword', layout: 'sword', layoutRef: LAY, sprite: p.desc,
    back: '머리 모양·머리 장비와 겉옷 등판, 소지품은 정면과 같은 손·같은 각도', side: '소지품을 몸 앞에 같은 각도로 듦',
    forbid: '깃발, 문장, 글자, 초상에 없는 무기·방패 추가, 말', fallback: `unit.${cult}.sword.${team}.64.sheet`, verify: p.verify ?? '용모 일반화' };
  PORTRAIT_SRC[code] = code === 'npc_lu_su' ? 'public/assets/portraits/preview/npc_lu_su.png' : `public/assets/portraits/npc/${code}.png`;
}
export const P_B4 = {}; export const P_IDS = []; export const S_IDS = Object.keys(S_B4); export const REUSE_MAP = {};
export const G = 'docker/gemini/npc_b7';
Object.assign(NPC, S_B4);
