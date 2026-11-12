// 종장(ch999) 적 2종 — 안아트 2026-11-03(팀장 지시, 근거 docs/original_story/ch999_finale_outline.md 3절: "사람 얼굴이 없는 먹/종이 몬스터").
//   npc_erased_line  '지워진 줄(먹그림자)' 일반 적 유닛: 전투 시트만(초상 없음, noPortrait). 기존 먹그림자(npc_ink_shadow_s8)와 구분: 세로로 긴 찢어진 종이 띠 + 지워진 먹 줄
//   npc_blank_page   '백지' 보스: 초상(3:4) + 전투 시트(초상 참조)
// 코드는 안아트 제안(로스터 enemy 행은 박백엔). npc_b6_gen.mjs = npc_b4_gen.mjs 사본(+ prompt 직접 지정·noPortrait 시트 지원)
import { NPC } from './unit_npc_sprite_style.mjs';
import { KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';
const NOFACE = '사람·동물·얼굴·눈·입·손·해골 형상 전혀 없음, 읽을 수 있는 글자·숫자·한자·부적 문양 없음, 피 없음';
export const P_B4 = {
  npc_blank_page: { name: '백지', kind: 'ink', side: 'enemy', era: '종장(창작)', culture: 'archive', used_in: ['ch999_s4'], ref: '', verify: '창작 존재(사람 형상 없음)',
    prompt: `판타지 SRPG 의 대화 초상 칸에 들어갈 종장 보스 '백지' 일러스트. 아무것도 적히지 않은 거대한 흰 종이 덩어리: 커다란 빈 종이 여러 장이 겹겹이 접히고 구겨져 위로 솟은 하나의 덩어리를 이루고, 덩어리 가장자리에서 종이 띠들이 천천히 펼쳐지며 바깥으로 휘날림. 종이는 따뜻한 아이보리~흰색, 접힌 골마다 옅은 회청색 그늘. 덩어리 아래쪽 가장자리만 먹물이 빨려 들어가듯 회색으로 지워져 흐려짐(먹이 하얗게 바래는 경계). 중심부 깊은 접힘 안쪽에 아주 옅은 금빛. 고요하지만 압도적인 크기감. ${NOFACE}.\n` +
      '구도: 세로 3:4, 덩어리가 프레임 중앙에서 프레임 높이의 78% 정도, 사방에 여백(가장자리에 닿지 않음). 셀 셰이딩 애니메이션풍으로 또렷한 외곽선(옅은 회갈)과 2~3단 명암, 광원 왼쪽 위.\n' +
      `${KEY_BG}\n금지: ${BASE_NEGATIVE}, 종이에 글씨·선·줄 칸·문양 금지, 마젠타·분홍·보라 색조 금지` },
};
P_B4.npc_erased_line = { name: '지워진 줄', kind: 'ink', side: 'enemy', era: '종장(창작)', culture: 'archive', used_in: ['ch999_s1', 'ch999_s2', 'ch999_s3', 'ch999_s4'], ref: '', verify: '창작 존재(사람 형상 없음)',
  prompt: `판타지 SRPG 의 대화 초상 칸에 들어갈 종장 적 '지워진 줄' 일러스트. 사람 키만 한 세로로 긴 찢어진 미색 종이 띠 한 장이 허공에 서서 떠 있음: 종이 띠 가운데를 가로로 긋는 굵은 먹 줄 세 가닥이 반쯤 지워져 회색으로 번지고, 종이 아래 끝은 먹물에 젖어 검게 흘러내리며 먹 방울 몇 개가 떨어짐, 종이 가장자리는 찢겨 너덜너덜하고 살짝 휘어 있음. 종이는 따뜻한 미색, 접힌 결에 옅은 회청 그늘, 아주 옅은 청록 빛이 먹 줄 사이에 스밈. 고요하고 쓸쓸한 분위기. ${NOFACE}.\n` +
    '구도: 세로 3:4, 종이 띠가 프레임 중앙에서 프레임 높이의 80% 정도, 사방에 여백(가장자리에 닿지 않음). 셀 셰이딩 애니메이션풍으로 또렷한 외곽선(옅은 회갈)과 2~3단 명암, 광원 왼쪽 위. 이미지 안에 설명문·제목·라벨 등 어떤 글자도 넣지 않음, 흰 패널·카드 배경판 금지.\n' +
    `${KEY_BG}
금지: ${BASE_NEGATIVE}, 종이에 읽을 수 있는 글씨·문양 금지(먹 줄은 지워진 가로 획일 뿐), 마젠타·분홍·보라 색조 금지` };
export const P_IDS = Object.keys(P_B4);
const LAY = 'docker/gemini/hero_dir_refs/dir64_korea_sword.jpg';
export const S_B4 = {
  npc_erased_line: { name: '지워진 줄', team: 'enemy', culture: 'default', troop: 'sword', layout: 'sword', layoutRef: LAY, noPortrait: true,
    sprite: `${NOFACE}. 사람 키만 한 세로로 긴 찢어진 미색 종이 띠 한 장이 몸처럼 서서 떠 있고, 종이 띠 가운데를 가로로 긋는 굵은 먹 줄 세 가닥이 반쯤 지워져 회색으로 번짐, 종이 아래 끝은 먹물로 젖어 검게 흘러내리며 바닥 위에 살짝 떠 있음(발 없음), 종이 가장자리에서 작은 먹 방울 2~3개. 팔·무기 없음`,
    back: '종이 띠 뒷면(먹 줄이 비쳐 보이는 옅은 회색), 아래 끝 먹물 흘러내림 동일', side: '종이 띠가 얇게 보이는 옆선(종이 두께 1~2도트), 살짝 앞으로 휨', forbid: '사람 형상, 얼굴, 눈, 팔다리, 무기, 글자, 마젠타·분홍·보라', fallback: 'unit.npc.npc_ink_shadow_s8.enemy.64.sheet', verify: '창작 존재' },
  npc_blank_page: { name: '백지', team: 'enemy', culture: 'default', troop: 'sword', layout: 'sword', layoutRef: LAY,
    sprite: `${NOFACE}. 칸을 거의 채우는 큰 흰 종이 덩어리(겹겹이 접히고 구겨진 빈 종이들이 위로 솟음), 가장자리 종이 띠 2~3개가 바깥으로 휘날림, 접힌 골에 옅은 회청 그늘, 아래쪽 가장자리만 회색으로 지워져 흐림, 중심에 아주 옅은 금빛. 발 없이 바닥 위에 떠 있음`,
    back: '같은 종이 덩어리의 뒷면(접힌 결 방향만 다름), 휘날리는 띠 위치 동일', side: '덩어리 옆선, 종이 띠가 뒤로 휘날림', forbid: '사람 형상, 얼굴, 눈, 팔다리, 무기, 글자, 줄 칸, 마젠타·분홍·보라', fallback: 'unit.npc.npc_ink_shadow_final.enemy.64.sheet', verify: '창작 존재(보스)' },
};
export const S_IDS = Object.keys(S_B4);
export const PORTRAIT_SRC = { npc_blank_page: 'docker/gemini/portrait_campaign/out/npc_blank_page.png' };
export const REUSE_MAP = {};
export const G = 'docker/gemini/npc_b6';
Object.assign(NPC, S_B4);
