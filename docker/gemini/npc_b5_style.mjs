// 준비 중 서가 ch12·ch13·ch16 NPC 전용 전투 시트 보충 15(안아트 2026-11-03, 팀장 지시). 초상은 이미 있음(portrait_npc_v3_style.mjs P_NPC_V3, public/assets/portraits/npc/) → 시트만.
// npc_b4_style.mjs 와 같은 export 이름(npc_b5_gen.mjs = npc_b4_gen.mjs 사본이 그대로 사용). 외형 = P_NPC_V3 초상 설명 + 초상 이미지 참조, 병종 = 로스터 unit_type.
import { NPC } from './unit_npc_sprite_style.mjs';
import { P_NPC_V3 } from './portrait_npc_v3_style.mjs';
import { P_NPC_STORY } from './portrait_campaign_style.mjs';
const LAY = { sword: 'docker/gemini/hero_dir_refs/dir64_korea_sword.jpg', cavalry: 'docker/gemini/hero_dir_refs/dir64_cavalry.jpg' };
const T = [ // code, 이름, team, culture(fallback 문화권), troop, 말 색(기병)
  ['npc_gan_ning', '감녕', 'ally', 'china', 'sword'], ['npc_cao_ren', '조인', 'enemy', 'china', 'sword'],
  ['npc_kim_heumsun', '김흠순', 'ally', 'korea', 'sword'], ['npc_banggul', '반굴', 'ally', 'korea', 'sword'], ['npc_gwanchang', '관창', 'ally', 'korea', 'sword'],
  ['npc_kim_inmun', '김인문', 'ally', 'korea', 'sword'], ['npc_so_jeongbang', '소정방', 'ally', 'china', 'sword'], ['npc_kim_pumil', '김품일', 'ally', 'korea', 'sword'],
  ['npc_dunois', '뒤누아', 'ally', 'europe', 'cavalry', '짙은 밤색'], ['npc_la_hire', '라이르', 'ally', 'europe', 'cavalry', '검은'], ['npc_gilles_de_rais', '질 드 레', 'ally', 'europe', 'sword'],
  ['npc_jean_alencon', '알랑송', 'ally', 'europe', 'cavalry', '회백색'], ['npc_glasdale', '글라스데일', 'enemy', 'europe', 'sword'], ['npc_talbot', '탤벗', 'enemy', 'europe', 'cavalry', '짙은 회색'],
  ['npc_fastolf', '파스톨프', 'enemy', 'europe', 'sword'],
  ['npc_mongol_vanguard', '몽골 선발대장', 'ally', 'china', 'cavalry', '흙 묻은 회갈색 초원'],
];
function P_B4_DESC() { return '13세기 중엽 몽골 기병 지휘관, 짧은 콧수염. 꼭대기에 붉은 말총 술이 달린 둥근 쇠 투구(목 뒤 가죽 드림), 젖어 거무스름한 짙은 갈색 가죽 찰갑, 짙은 청록색 델 소매, 흙 묻은 가죽 허리띠. 오른손에 기병창을 세워 듦(창날은 머리 위, 칸 안)'; }
export const S_B4 = {};
export const PORTRAIT_SRC = {};
const P_LOCAL = { npc_mongol_vanguard: { desc: '' } };
for (const [code, name, team, cult, troop, horse] of T) {
  const p = P_NPC_V3[code] ?? (code === 'npc_mongol_vanguard' ? { desc: P_B4_DESC(), verify: '창작 인물' } : null); if (!p) throw new Error(`초상 설명 없음 ${code}`);
  const mounted = troop === 'cavalry';
  S_B4[code] = { name, team, culture: cult, troop, layout: troop, mounted, layoutRef: LAY[troop],
    sprite: (mounted ? `${horse} 말을 탄 기마 인물(말과 기수가 한 캐릭터, 말 전체가 칸 안에, 말: ${horse} 몸·짙은 갈기·무늬 없는 안장 천). 기수: ` : '') + p.desc,
    back: '머리 장비·머리 모양과 겉옷 등판, 무기는 정면과 같은 손·같은 각도' + (mounted ? ', 말 엉덩이와 꼬리' : ''),
    side: (mounted ? '말이 왼쪽을 향해 걷고 기수는 ' : '') + '무기를 몸 앞에 같은 각도로 듦',
    forbid: '깃발, 문장, 글자, 초상에 없는 무기·방패 추가, 망토 추가' + (mounted ? ', 보병(말 없는 모습)' : ', 말'),
    fallback: `unit.${cult}.${troop}.${team}.64.sheet`, verify: p.verify ?? '용모 일반화' };
  PORTRAIT_SRC[code] = code === 'npc_mongol_vanguard' ? 'docker/gemini/portrait_campaign/out/npc_mongol_vanguard.png' : `public/assets/portraits/npc/${code}.png`;
}
// 가챠 풀 점검(2026-11-03): 초상·시트가 전혀 없는 NPC 영웅 행 = npc_mongol_vanguard(ch21_s2 아군 B 기병, 창작 인물) -> 초상+시트 신규
const STEPPE = '13세기 중엽(1241) 몽골 기병 지휘관 복식 일반화: 오른쪽 여밈 긴 델, 넓은 허리띠, 가죽·쇠 미늘을 끈으로 엮은 찰갑, 펠트·가죽 장화. 일본 갑옷·한국 전립·청대 변발·터번 금지. 십자가·종교 표지 없음';
export const P_B4 = { npc_mongol_vanguard: { name: '몽골 선발대장', roster: 'npc_mongol_vanguard', used_in: ['ch21_s2'], side: 'ally', ref: 'public/assets/portraits/genghis_khan.png', kind: 'invented', era: '13세기 중엽(1241, 창작 인물)', culture: 'steppe(mongol)',
  desc: `30대 중반 선발대 기병 지휘관, 햇볕과 바람에 그을린 얼굴, 짧은 콧수염과 턱 끝 짧은 수염, 지쳤지만 단단한 눈. ${STEPPE}. 꼭대기에 붉은 말총 술이 달린 둥근 쇠 투구(목 뒤 가죽 드림), 강을 건너 젖어 거무스름한 짙은 갈색 가죽 찰갑, 짙은 청록색 델 소매, 흙이 묻은 넓은 가죽 허리띠. 오른손에 기병창을 세워 쥠(창날은 머리 옆)`,
  verify: '창작 인물(appearance: 붉은 술 투구·젖은 가죽 갑옷·흙 묻은 마구)' } };
export const P_IDS = Object.keys(P_B4);
Object.assign(P_NPC_STORY, P_B4); export const S_IDS = Object.keys(S_B4);
export const REUSE_MAP = {};
export const G = 'docker/gemini/npc_b5';
Object.assign(NPC, S_B4);
