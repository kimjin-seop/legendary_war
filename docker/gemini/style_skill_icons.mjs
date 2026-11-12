// ===== 스킬 아이콘(도트) 스타일·작업 정의 — 안아트, 2026-11-01 =====
// 공통 상수는 style_guide.mjs 단일 출처에서 import(원본 미수정, 담당 A/B/C 와 파일 분리).
// 모티프(사물 묘사)는 skill_icon_motifs.json, 스킬 목록(code·type·template)은 skill_icon_skills.json(DB skills 읽기 전용 스냅샷).
// 배경 색판·프레임·조건부 표식은 후처리(skill_icon_pp.py)가 코드로 그린다 → 모델은 사물만 그린다.
import { readFileSync } from 'node:fs';
import { CHROMA } from './style_guide.mjs';

// ---- 템플릿 → 계열(배경 색판) ----
export const SKILL_CATEGORY = {
  atk: ['T_ATK_UP', 'T_ACTIVE_STRIKE', 'T_FIRST_STRIKE', 'T_CHARGE', 'T_PURSUIT', 'T_COUNTER_ATK', 'T_SIEGE_ATK', 'T_VS_TYPE_ATK'],
  def: ['T_DEF_UP', 'T_TERRAIN_DEF'],
  hyb: ['T_ATKDEF_HYBRID', 'T_LAST_STAND'],
  heal: ['T_HEAL_UP', 'T_REGEN', 'T_ACTIVE_HEAL'],
  move: ['T_MOVE_UP', 'T_ACTIVE_SURGE'],
  aoe: ['T_ACTIVE_AOE'],
  cmd: ['T_FORMATION', 'T_ACTIVE_BUFF'],
  trick: ['T_ACTIVE_DECOY'],
  // 2026-11-03 nx: 오라(지휘관 오라 auras + 공유 오라 조합). 공격=atk, 방어=def, 복합·광역=hyb(대각 분할). 프레임은 원형 청동(aura)
  aura_atk: ['T_AURA_ATK'], aura_def: ['T_AURA_DEF'], aura_hyb: ['T_AURA_BOTH', 'T_AURA_WIDE_BOTH'],
};
// 발동 조건이 붙는 패시브 템플릿 → 우상단 보라 마름모 표식
export const CONDITIONAL_TEMPLATES = ['T_FORMATION', 'T_FIRST_STRIKE', 'T_CHARGE', 'T_LAST_STAND', 'T_PURSUIT', 'T_COUNTER_ATK', 'T_SIEGE_ATK', 'T_TERRAIN_DEF', 'T_VS_TYPE_ATK'];

export const SKILL_ICON_STYLE =
  '16비트 시절 일본 판타지 RPG 의 스킬 아이콘 도트(픽셀아트), 큰 정사각 픽셀이 또렷한 굵고 단순한 덩어리 형태, 한 아이콘은 약 40x40 픽셀 해상도로 그린 것처럼 보이게, ' +
  '요소마다 2~3단 명암만(광원 왼쪽 위), 어두운 1픽셀 외곽선, 안티앨리어싱·그라데이션·블러·디더링 없음, 채도는 중간(차분한 갑옷·나무·금속 색 위주, 불꽃·피어남 같은 강조만 밝게), ' +
  '사물 1~2개만 크게 칸을 꽉 채우도록(칸의 약 75%), 24픽셀로 줄여도 실루엣이 읽히도록 세부는 생략';
export const SKILL_ICON_NEG =
  '글자·숫자·한자·알파벳·룬 문자 금지, 국기·종교 상징·십자 표시·가문 문장 금지, 아이콘 뒤 원형·사각 배경판·액자·테두리 금지, 사람 얼굴 클로즈업·피·잔혹 표현 금지, ' +
  '마젠타·분홍·자주·보라 색을 아이콘 본체에 쓰지 않음(발자국·그림자도 갈색·회색으로), 아이콘 둘레의 빛 고리·후광·발광 테두리 금지, 사각으로 꽉 찬 풍경 장면·배경판 금지(땅·물·산은 사물 아래 작은 조각으로만), 실사·3D 렌더 금지, 칸끼리 닿거나 겹치기 금지';
export const SKILL_SHEET_BG =
  `배경은 완전히 균일한 순수 마젠타(${CHROMA}) 단색 한 가지, 그라데이션·그림자·격자선·칸 테두리 없음`;

const sheetPrompt = (items) =>
  `게임 스킬 아이콘 시트 1장: 정확히 4열 x 4행 균등 격자(16칸)에 아이콘을 왼쪽 위부터 오른쪽으로, 줄을 바꿔 아래로 번호 순서대로 한 칸에 1개씩. ` +
  `각 아이콘은 칸 정중앙, 칸 사이에 넓은 빈 간격. 남는 칸은 배경색으로 비워 둠.\n` +
  `아이콘 목록:\n${items.map((it, i) => `${i + 1}) ${it.motif}`).join('\n')}\n` +
  `스타일: ${SKILL_ICON_STYLE}\n배경: ${SKILL_SHEET_BG}\n금지: ${SKILL_ICON_NEG}`;

// ---- 작업 목록: 액티브 → 영웅 패시브(DB id 순) → 레거시 패시브 → 공유 패시브, 16개씩 시트 ----
const ROOT = new URL('./', import.meta.url);
const SKILLS = JSON.parse(readFileSync(new URL('skill_icon_skills.json', ROOT), 'utf8')).skills;
const MOTIFS = JSON.parse(readFileSync(new URL('skill_icon_motifs.json', ROOT), 'utf8')).motifs;
const rank = (s) => (s.batch === 'nx' ? 4 : s.type === 'active' ? 0 : s.code.startsWith('sh_') ? 3 : s.id < 100 ? 2 : 1); // nx(2026-11-03 추가분)는 맨 뒤: 기존 18시트 배정·아틀라스 순서 불변
export const SKILL_ORDER = [...SKILLS].sort((a, b) => rank(a) - rank(b) || a.id - b.id).map((s) => ({ ...s, motif: MOTIFS[s.code] }));
export const SKILL_SHEETS = [];
const BASE_ORDER = SKILL_ORDER.filter((s) => s.batch !== 'nx'); // 기존 282개(sk01~sk18) 시트 구성 고정
for (let i = 0; i < BASE_ORDER.length; i += 16) {
  const items = BASE_ORDER.slice(i, i + 16);
  SKILL_SHEETS.push({ id: `sk${String(SKILL_SHEETS.length + 1).padStart(2, '0')}`, aspect: '1:1', codes: items.map((s) => s.code), prompt: sheetPrompt(items) });
}
// 재생성(낱개 교체): REGEN 목록의 code 를 16개씩 새 시트(rg01..)로 묶는다
export const regenSheets = (codes, prefix = 'rg') => {
  const out = []; const items = codes.map((c) => SKILL_ORDER.find((s) => s.code === c)).filter(Boolean);
  for (let i = 0; i < items.length; i += 16) { const it = items.slice(i, i + 16); out.push({ id: `${prefix}${String(out.length + 1).padStart(2, '0')}`, aspect: '1:1', codes: it.map((s) => s.code), prompt: sheetPrompt(it) }); }
  return out;
};
// nx 배치(2026-11-03): 병종 기본 액티브 9 + 오라 15 → nx01(16)·nx02(8)
export const NX_SHEETS = regenSheets(SKILL_ORDER.filter((s) => s.batch === 'nx').map((s) => s.code), 'nx');
export const SKILL_ICON_QA = ['24px 축소 시 실루엣 판독', '모티프 중복 없음', '프레임 규칙(액티브 금·팔각 / 패시브 은·사각 / 조건부 보라 마름모) 일관', '계열 배경색 일관', '글자·종교 상징 없음', '마젠타 잔색·헤일로 없음', '누락 0'];
