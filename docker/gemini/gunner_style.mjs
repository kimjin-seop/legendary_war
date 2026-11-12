// 총병(gunner) 병사 전투 시트 — 작업 정의(안아트 2026-11-03, 팀장 요청). 1차: 일본(조총 아시가루)·유럽 화약시대(머스킷 병). 나머지 문화권은 후속.
// npc_b5_style.mjs 와 같은 export 형식(gunner_gen.mjs = npc_b5_gen.mjs 사본 + noPortrait). 결과 키 unit.<culture>.gunner.<side>.64.sheet (기존 병사 시트 규칙)
import { NPC } from './unit_npc_sprite_style.mjs';
const LAY = 'docker/gemini/hero_dir_refs/dir64_archer.jpg';
const NOSYM = '가문 문장·깃발 문양·글자·십자가·종교 상징 없음';
export const S_B4 = {
  gunner_japan: { name: '일본 조총병', team: 'ally', culture: 'japan', troop: 'archer', layout: 'archer', layoutRef: LAY, noPortrait: true,
    sprite: `16세기 말 일본 아시가루 조총병(무명 병사, 20~30대 남성). 넓고 납작한 삿갓형 쇠 투구(진가사, 짙은 회색), 앞뒤를 가린 가벼운 짙은 남색 몸통 갑옷(오케가와 도), 짙은 남색 소매와 정강이 가리개, 허리에 작은 화약통과 도화선 줄을 감은 끈. 두 손으로 긴 화승총(나무 개머리, 쇠 총열)을 비스듬히 앞으로 겨눔. ${NOSYM}`,
    back: '진가사 뒷면과 남색 갑옷 등판, 허리 화약통, 총열이 어깨 위로 비스듬히', side: '화승총을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽), 진가사 옆선', forbid: '활, 화살, 창, 칼을 손에 듦, 사시모노(등 깃발), 말, 방패', fallback: 'unit.japan.archer.ally.64.sheet', verify: '아시가루 조총병 복식 일반화' },
  gunner_europe: { name: '유럽 머스킷 병', team: 'ally', culture: 'europe', troop: 'archer', layout: 'archer', layoutRef: LAY, noPortrait: true,
    sprite: `16~17세기 유럽 화약시대 머스킷 병(무명 병사, 20~30대 남성). 챙이 앞뒤로 솟은 쇠 모리온 투구(무늬 없음), 짙은 적갈색 짧은 겉옷 위 가죽 띠에 매단 화약 통 여러 개(밴덜리어), 짙은 회색 바지와 갈색 장화. 두 손으로 긴 머스킷 총을 앞으로 겨눔(나무 개머리, 쇠 총열). ${NOSYM}`,
    back: '모리온 투구 뒷면, 적갈 겉옷 등판과 X자 가죽 띠, 총열이 어깨 위로 비스듬히', side: '머스킷을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽), 모리온 투구 옆선', forbid: '활, 화살, 창, 칼을 손에 듦, 판금 전신갑, 망토, 깃발, 말, 방패', fallback: 'unit.europe.archer.ally.64.sheet', verify: '화약시대 머스킷 병 복식 일반화' },
  // 2차(2026-11-04 팀장 승인): 조선 총통수·오스만 예니체리 총병. 참조 = 같은 문화권 궁병 3x3 원본(복식·색·체형 일관, 활만 총으로 바꿈). 엔진 병종 gunner
  gunner_korea: { name: '조선 총통수', team: 'ally', culture: 'korea', troop: 'archer', layout: 'archer', layoutRef: 'public/assets/raw/dir64_korea/archer.jpg', noPortrait: true,
    sprite: `첨부한 조선 궁병 시트와 같은 병사(같은 복식·색·체형·그림체·칸 배치)를 그대로 두고 손에 든 활과 화살통만 화기로 바꿈: 16세기 말 조선 총통수(무명 병사). 남색 철릭과 검은 전립, 허리에 화약 주머니와 심지 줄, 두 손으로 짧고 굵은 쇠 총통(손잡이가 긴 나무 자루에 끼운 승자총통형 화기)을 앞으로 겨눔. ${NOSYM}`,
    back: '전립 뒷면과 남색 철릭 등판, 허리 화약 주머니, 총통 자루가 어깨 위로 비스듬히', side: '총통을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽)', forbid: '활, 화살, 화살통, 창, 칼을 손에 듦, 일본식 진가사, 말, 방패', fallback: 'unit.korea.archer.ally.64.sheet', verify: '조선 총통수 복식 일반화' },
  gunner_middle_east: { name: '예니체리 총병', team: 'ally', culture: 'middle_east', troop: 'archer', layout: 'archer', layoutRef: 'public/assets/raw/dir64_middle_east/archer.jpg', noPortrait: true,
    sprite: `첨부한 중동 궁병 시트와 같은 그림체·칸 배치·체형으로, 복식만 16세기 오스만 예니체리 총병(무명 병사)으로: 뒤로 길게 늘어진 흰 펠트 모자(보르크, 무늬 없음), 짙은 청색 긴 카프탄과 붉은 허리 띠, 허리에 화약 뿔통. 두 손으로 긴 화승총(나무 개머리, 쇠 총열)을 앞으로 겨눔. ${NOSYM}`,
    back: '흰 펠트 모자 뒤로 늘어진 천, 청색 카프탄 등판, 총열이 어깨 위로 비스듬히', side: '화승총을 몸 앞으로 수평에 가깝게 겨눔(총구가 왼쪽), 모자 옆선', forbid: '활, 화살, 화살통, 창, 칼을 손에 듦, 초승달·종교 상징·글자, 말, 방패', fallback: 'unit.middle_east.archer.ally.64.sheet', verify: '예니체리 총병 복식 일반화' },
};
export const PORTRAIT_SRC = {}; export const P_B4 = {}; export const P_IDS = []; export const S_IDS = Object.keys(S_B4); export const REUSE_MAP = {};
export const G = 'docker/gemini/gunner';
Object.assign(NPC, S_B4);
