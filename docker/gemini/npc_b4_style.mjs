// 승격 NPC 시트 보충 7 + ch23(헤이스팅스 1066)·ch24(투르 732) 신규 NPC 7 — 작업 정의(안아트 2026-11-03, 팀장 지시).
// npc_ch2122b_style.mjs 와 같은 방식: import 한 프로세스 안에서만 P_NPC_STORY(초상)·NPC(시트)에 항목을 더한다(기존 파일 무수정).
//   생성: node docker/gemini/npc_b4_gen.mjs portrait|sprite <codes|all>  /  반영: node docker/gemini/npc_b4_publish.mjs [--dry]
// 대상 근거:
//   승격 7 = npc_roster_v3*.json·npc_roster_shelf_ch*.json 의 playable:true 중 manifest 에 unit.npc.<code>/unit.hero.<code> 시트가 없는 행.
//     초상은 이미 있음(jebe·subutai·borchu 는 preview 폴더의 비접두 코드, 나머지 4는 portraits/npc) → 시트만 생성, 참조 초상은 PORTRAIT_SRC.
//   ch23/24 = database/data/npc_roster_shelf_ch23_24.json 8명 중 npc_frankish_vanguard(전위 대장, 이름 없는 C급)는 범용 재사용(REUSE_MAP) → 7명 초상+시트.
// 규칙: 실존 인물 얼굴 재현 금지(나이·수염만), 문장·십자가·깃발·글자·종교 상징 없음(주교 오도도 성직 표지 없이 무장 모습).
import { P_NPC_STORY } from './portrait_campaign_style.mjs';
import { NPC } from './unit_npc_sprite_style.mjs';

const REF_NOR = 'public/assets/portraits/william_i.png', REF_FRK = 'public/assets/portraits/charles_martel.png', REF_MID = 'public/assets/portraits/saladin.png';
const N1066 = '11세기 중엽(1066) 노르만·앵글로색슨 무사 복식 일반화: 무릎까지 오는 쇠사슬 갑옷(호버크)과 쇠사슬 두건, 코 가리개가 달린 원뿔형 쇠 투구, 무지 단색 천 겉옷 또는 망토(둥근 브로치), 가죽 칼띠. 13세기 이후 서코트·판금 갑옷 금지. 문장·십자가·용 깃발·글자 없음';
const F732 = '8세기 초(732) 프랑크·아키텐 귀족 무사 복식 일반화: 무릎 위까지 오는 쇠사슬 또는 비늘 갑옷, 철판을 이어 붙인 둥근 투구(스팡겐헬름), 어깨에 둥근 금속 브로치(피불라)로 여민 양모 망토, 가죽 칼띠. 중세 후기 판금·서코트·문장 금지';
const U732 = '8세기 초(732) 우마이야 시대 안달루스 아랍 기병 지휘관 복식 일반화: 쇠사슬 갑옷 위 넉넉한 긴 겉옷, 둥근 쇠 투구 둘레에 감은 천 터번, 망토, 곧은 양날 장검. 오스만·맘루크 후대 복식(높은 모자·초승달 장식) 금지. 글자·종교 문양·깃발 없음';
const H = (code, name, used, side, ref, era, culture, desc, verify, extra = {}) => ({ [code]: { name, roster: code, used_in: used, side, ref, kind: 'hist', era, culture, desc, verify, ...extra } });

// ===== ch23/24 초상 =====
export const P_B4 = {
  ...H('npc_odo_bayeux', '오도', ['ch23_s1', 'ch23_s2', 'ch23_s4', 'ch23_s5'], 'ally', REF_NOR, '11세기(1030경~1097)', 'europe(normandy)',
    `40대 중반 무장 성직 귀족, 넓적하고 다부진 얼굴, 수염 없이 깎은 턱, 짧은 갈색 머리(뒷머리를 높게 깎은 노르만식), 위엄 있고 단호한 눈. ${N1066}. 코 가리개 원뿔 투구, 쇠사슬 갑옷 위 짙은 녹청색 무지 망토(둥근 금 브로치 하나). 오른손에 끝이 둥글게 뭉툭한 짧은 나무 곤봉(전투 지휘봉)을 가슴 앞에 쥠, 왼손은 칼띠. 칼·창·방패 없음. 성직 의복·주교관·십자가 없음`,
    '바이외 주교(이름 confirmed). 곤봉 소지는 바이외 자수 도상 착안(verify). 성직 표지는 금지 규칙으로 생략'),
  ...H('npc_william_fitzosbern', '윌리엄 피츠오스번', ['ch23_s1', 'ch23_s2', 'ch23_s4', 'ch23_s5'], 'ally', REF_NOR, '11세기(1020경~1071)', 'europe(normandy)',
    `40대 초반 노르만 귀족 기사, 길쭉하고 날카로운 얼굴, 짧게 다듬은 짙은 갈색 턱수염(콧수염 이어짐), 차분하고 영리한 회갈색 눈. ${N1066}. 투구를 왼팔에 끼고 맨머리(짧은 짙은 갈색 머리), 쇠사슬 두건은 목 뒤로 내림, 쇠사슬 갑옷 위 짙은 황토색 무지 망토(둥근 쇠 브로치). 오른손에 곧은 양날 장검을 칼끝 아래로 쥠`,
    '용모 근거 없음 — 나이·수염 제안값'),
  ...H('npc_harold_godwinson', '해럴드 고드윈슨', ['ch23_s3', 'ch23_s4'], 'enemy', REF_NOR, '11세기(1022경~1066)', 'europe(anglo-saxon england)',
    `40대 중반 잉글랜드 왕, 단단한 얼굴, 턱수염 없이 길고 짙은 금갈색 콧수염(앵글로색슨식), 어깨까지 오는 금갈색 머리, 굳센 회청색 눈. ${N1066}. 코 가리개 원뿔 쇠 투구 아래 가는 금 띠, 쇠사슬 갑옷 위 짙은 진청색 무지 망토(큰 둥근 금 브로치), 넓은 가죽 칼띠. 오른손에 긴 창을 세워 쥠(창날은 머리 옆), 왼팔에 무늬 없는 짙은 갈색 연 모양 방패. 용 깃발·문장 없음`,
    '바이외 자수의 잉글랜드인 콧수염 도상 착안. 금 띠는 왕 표지 각색(verify)'),
  ...H('npc_gyrth_godwinson', '거스 고드윈슨', ['ch23_s3', 'ch23_s4'], 'enemy', REF_NOR, '11세기(1032경~1066)', 'europe(anglo-saxon england)',
    `30대 초반 잉글랜드 백작(해럴드의 동생, 형보다 젊고 날렵함), 갸름한 얼굴, 턱수염 없이 짧은 금갈색 콧수염, 짧은 금갈색 머리, 결연한 눈. ${N1066}. 코 가리개 원뿔 쇠 투구, 쇠사슬 갑옷 위 짙은 적갈색 무지 망토(둥근 쇠 브로치). 오른손에 곧은 양날 장검을 칼끝 위로 세워 쥠, 왼팔에 무늬 없는 짙은 녹색 둥근 방패`,
    '용모 근거 없음 — 해럴드와 구분되는 나이·색 제안값'),
  ...H('npc_edgar_atheling', '에드가 애설링', ['ch23_s5'], 'enemy', REF_NOR, '11세기(1051경~1126경, 1066년 당시 10대 중반)', 'europe(anglo-saxon england)',
    `10대 중반 소년 왕자(15세 전후), 앳되지만 기품 있는 얼굴, 수염 없음, 어깨에 닿는 밝은 금발, 긴장했지만 곧은 눈. 11세기 앵글로색슨 귀족 소년 복식 일반화: 투구·갑옷 없이 무릎 길이 짙은 남색 양모 튜닉(목과 소매 끝에 금빛 띠), 어깨에 짙은 회색 망토(둥근 금 브로치), 가죽 허리띠에 칼집째 찬 짧은 칼(뽑지 않음). 두 손은 허리띠 앞에 가볍게 모음. 왕관·문장·십자가 없음`,
    '대사 전용 인물(c급). 1066년 당시 나이 기준 소년 묘사', { boy: true }),
  ...H('npc_eudes_aquitaine', '외드', ['ch24_s1', 'ch24_s2', 'ch24_s4'], 'ally', REF_FRK, '8세기(650경~735, 생몰 verify)', 'europe(aquitaine)',
    `60대 초반 노련한 공작(노쇠하지 않은 단단한 체격), 깊게 팬 주름, 짧게 다듬은 회백색 턱수염과 콧수염, 짧은 회색 머리, 침착하고 노회한 눈. ${F732}. 철판을 이어 붙인 둥근 투구, 쇠사슬 갑옷 위 짙은 포도주빛 적갈 망토(둥근 금 피불라), 갈색 칼띠. 오른손에 곧은 양날 장검을 칼끝 아래로 쥠, 왼손은 망토 자락`,
    '아키텐 공(이름 confirmed). 용모 근거 없음 — 나이·수염 제안값. 기병 병종(초상은 상반신)'),
  ...H('npc_abd_al_rahman_ghafiqi', '압드 알라흐만 알가피키', ['ch24_s3', 'ch24_s4'], 'enemy', REF_MID, '8세기(?~732)', 'middle_east(al-andalus, umayyad)',
    `40대 후반 총독이자 지휘관, 갈색 피부, 길쭉하고 단호한 얼굴, 짧게 다듬은 검은 턱수염과 콧수염, 침착하고 날카로운 짙은 눈. ${U732}. 둥근 쇠 투구 둘레에 감은 흰 천 터번(투구 꼭대기가 보임), 쇠사슬 갑옷 위 짙은 녹청색 긴 겉옷과 짙은 갈색 망토, 붉은 가죽 칼띠. 오른손에 곧은 양날 장검을 칼끝 위로 세워 쥠, 왼손은 고삐 대신 칼띠를 쥠`,
    '용모 근거 없음 — 나이·수염 제안값. 우마이야 복식 일반화(verify)'),
};

// ===== 시트(승격 7 + ch23/24 7) =====
// troop → layout: sword/spear/heavy = sword 견본, archer = archer 견본, cavalry = 기마 견본(mounted)
const LAY = { sword: 'docker/gemini/hero_dir_refs/dir64_korea_sword.jpg', archer: 'docker/gemini/hero_dir_refs/dir64_archer.jpg', cavalry: 'docker/gemini/hero_dir_refs/dir64_cavalry.jpg' };
const MONGOL13S = '13세기 초 몽골 장수 복식 일반화(오른쪽 여밈 긴 델, 넓은 허리띠, 끈으로 엮은 미늘 찰갑, 펠트 장화. 일본 갑옷·한국 전립·청대 변발 금지)';
const N1066S = '11세기 중엽 노르만·앵글로색슨 무사 복식 일반화(쇠사슬 갑옷, 코 가리개 원뿔 투구, 무지 망토. 서코트·판금·문장·십자가 금지)';
const S = (code, o) => ({ [code]: { layoutRef: LAY[o.layout], fallback: `unit.${o.cult}.${o.troop === 'spear' ? 'spear' : o.troop}.${o.team}.64.sheet`, ...o } });
export const PORTRAIT_SRC = {
  npc_jebe: 'public/assets/portraits/preview/jebe.png', npc_subutai: 'public/assets/portraits/preview/subutai.png', npc_boorchu: 'public/assets/portraits/preview/borchu.png',
  npc_ibrahim_lodi: 'public/assets/portraits/npc/npc_ibrahim_lodi.png', npc_qasar: 'public/assets/portraits/npc/npc_qasar.png', npc_jelme: 'public/assets/portraits/npc/npc_jelme.png', npc_jochi: 'public/assets/portraits/npc/npc_jochi.png',
};
export const S_B4 = {
  // --- 승격 7 ---
  ...S('npc_jebe', { name: '제베', team: 'ally', culture: 'mongol', cult: 'china', troop: 'archer', layout: 'archer',
    sprite: `${MONGOL13S}. 40세 전후 마르고 날렵한 장수, 짧은 콧수염과 턱 끝 짧은 수염. 모자 없이 정수리를 깎은 맨머리(이마 위 앞머리 한 줌), 귀 뒤로 땋은 머리 고리. 녹슨 주홍빛 델 위 짙은 갈색 가죽 미늘 찰갑과 어깨 미늘, 갈색 허리띠, 오른쪽 허리에 화살이 든 가죽 화살통. 왼손에 양 끝이 뒤로 휜 몽골식 복합궁을 세로로 듦`,
    back: '깎은 정수리와 귀 뒤 땋은 고리, 주홍 델 등판과 갈색 미늘, 허리 화살통', side: '활을 몸 앞에 세로로 듦, 주홍 델 자락', forbid: '투구, 모자, 창, 칼을 손에 듦, 말, 방패, 깃발', verify: '용모 일반화' }),
  ...S('npc_subutai', { name: '수부타이', team: 'ally', culture: 'mongol', cult: 'china', troop: 'cavalry', layout: 'cavalry', mounted: true,
    sprite: `${MONGOL13S}. 짙은 밤색 초원 말을 탄 40대 장수(말과 기수가 한 캐릭터, 말 전체가 칸 안에), 짧은 검은 콧수염과 턱수염, 귀 뒤 땋은 머리. 챙이 살짝 위로 접힌 짙은 갈색 펠트 모자, 겨자빛 황토 델 위 짙은 적갈색 미늘 찰갑과 어깨 미늘, 황토 허리띠, 등 뒤 화살통. 오른손에 칼집에서 뽑은 휜 칼을 세워 듦. 말: 짙은 밤색 몸, 검은 갈기, 갈색 안장`,
    back: '말 엉덩이와 검은 꼬리, 기수의 갈색 펠트 모자와 적갈 미늘 등판, 화살통', side: '밤색 말이 왼쪽을 향해 걷고 기수는 휜 칼을 세워 듦, 펠트 모자 옆선', forbid: '쇠 투구, 창, 방패, 깃발, 터번, 보병(말 없는 모습)', verify: '용모 일반화' }),
  ...S('npc_boorchu', { name: '보르추', team: 'ally', culture: 'mongol', cult: 'china', troop: 'sword', layout: 'sword',
    sprite: `${MONGOL13S}. 50대 후반 노장, 회색 턱수염과 귀 뒤 회색 땋은 머리. 꼭대기에 짧은 검은 말총 술이 달린 둥근 쇠 투구(목 뒤 가죽 드림), 짙은 벽돌빛 적색 델 위 은회색 쇠 미늘 찰갑, 검은 가죽 허리띠. 오른손에 창날 아래 작은 갈고리가 달린 긴 창을 세워 듦`,
    back: '둥근 쇠 투구 뒤 검은 말총 술과 가죽 드림, 은회색 미늘 등판, 창 자루가 세로로', side: '갈고리 창을 몸 앞에 세워 쥠, 붉은 델 자락', forbid: '말, 활, 방패, 깃발, 터번, 모자', verify: '초상(borchu) 기준. 병종 sword 이나 초상 소지품(창) 유지' }),
  ...S('npc_ibrahim_lodi', { name: '이브라힘 로디', team: 'enemy', culture: 'south_asia', cult: 'middle_east', troop: 'cavalry', layout: 'cavalry', mounted: true,
    sprite: '16세기 초 델리 술탄국 군주 복식 일반화(터번, 앞여밈 긴 겉옷, 허리 천 띠. 무굴 후대·오스만 복식 금지). 흰 말을 탄 40대 군주(말과 기수가 한 캐릭터, 말 전체가 칸 안에), 짧은 검은 턱수염. 크림색 감은 터번(붉은 보석 하나), 진주 목걸이, 무릎까지 오는 짙은 적갈색 긴 겉옷(금빛 앞단), 금빛 황토 허리띠. 오른손에 휜 칼을 세워 듦. 말: 흰 몸, 회색 갈기, 짙은 적갈 안장 천',
    back: '말 엉덩이와 회색 꼬리, 기수의 크림 터번과 적갈 겉옷 등판', side: '흰 말이 왼쪽을 향해 걷고 기수는 휜 칼을 세워 듦', forbid: '투구, 갑옷, 창, 활, 방패, 깃발, 보병(말 없는 모습)', verify: '용모 일반화' }),
  ...S('npc_qasar', { name: '카사르', team: 'enemy', culture: 'mongol', cult: 'china', troop: 'archer', layout: 'archer',
    sprite: `${MONGOL13S}. 50대 장수, 회색 섞인 콧수염과 턱수염, 귀 뒤 땋은 머리. 짙은 갈색 털 테를 두른 짙은 갈색 펠트 모자, 짙은 청색 델 위 검게 칠한 미늘 찰갑과 어깨 미늘, 붉은 허리띠. 왼손에 큰 몽골식 복합궁을 세로로 듦, 허리에 칼집 찬 휜 칼`,
    back: '털 테 모자 뒷면과 땋은 머리, 검은 미늘 등판과 청색 델 자락', side: '큰 활을 몸 앞에 세로로 듦', forbid: '쇠 투구, 창, 말, 방패, 깃발, 터번', verify: '용모 일반화' }),
  ...S('npc_jelme', { name: '젤메', team: 'enemy', culture: 'mongol', cult: 'china', troop: 'cavalry', layout: 'cavalry', mounted: true,
    sprite: `${MONGOL13S}. 회색 초원 말을 탄 50대 장수(말과 기수가 한 캐릭터, 말 전체가 칸 안에), 길고 흰 턱수염과 콧수염. 둥근 쇠 투구와 쇠사슬 목가리개, 짙은 올리브 녹색 델 위 은회색 쇠 미늘 찰갑, 녹색 허리띠. 오른손에 휜 칼을 세워 듦. 말: 회색 몸, 짙은 갈기, 갈색 안장`,
    back: '말 엉덩이와 짙은 꼬리, 기수의 둥근 쇠 투구와 쇠사슬 목가리개, 은회색 미늘 등판', side: '회색 말이 왼쪽을 향해 걷고 기수는 휜 칼을 세워 듦, 흰 수염', forbid: '창, 활, 방패, 깃발, 모자, 보병(말 없는 모습)', verify: '용모 일반화' }),
  ...S('npc_jochi', { name: '주치', team: 'enemy', culture: 'mongol', cult: 'china', troop: 'cavalry', layout: 'cavalry', mounted: true,
    sprite: `${MONGOL13S}. 검은 초원 말을 탄 30대 장수(말과 기수가 한 캐릭터, 말 전체가 칸 안에), 짧은 콧수염과 턱수염, 정수리를 깎고 뒤로 묶은 검은 머리. 양 어깨를 덮는 은회색 늑대털 망토, 그 아래 은회색 쇠 미늘 찰갑과 짙은 진홍 델 소매, 붉은 허리띠. 오른손에 검은 말총 술이 달린 기병창을 세워 듦(창날은 머리 위, 칸 안). 말: 검은 몸, 검은 갈기, 진홍 안장 천`,
    back: '말 엉덩이와 검은 꼬리, 기수의 은회색 늑대털 망토가 등을 덮음, 창 자루가 세로로', side: '검은 말이 왼쪽을 향해 걷고 기수는 기병창을 세워 듦, 털 망토', forbid: '투구, 모자, 활, 방패, 깃발, 보병(말 없는 모습)', verify: '용모 일반화' }),
  // --- ch23/24 7 ---
  ...S('npc_odo_bayeux', { name: '오도', team: 'ally', culture: 'europe', cult: 'europe', troop: 'sword', layout: 'sword',
    sprite: `${N1066S}. 40대 중반 다부진 체격, 수염 없음. 코 가리개 원뿔 쇠 투구, 무릎까지 오는 쇠사슬 갑옷, 짙은 녹청색 망토(둥근 금 브로치), 갈색 가죽 장화. 오른손에 끝이 뭉툭한 짧은 나무 곤봉을 듦`,
    back: '원뿔 투구 뒤, 녹청 망토가 등을 덮음', side: '곤봉을 몸 앞에 듦, 녹청 망토 자락', forbid: '칼, 창, 방패, 십자가, 주교관, 말, 수염', verify: '성직 표지 생략' }),
  ...S('npc_william_fitzosbern', { name: '윌리엄 피츠오스번', team: 'ally', culture: 'europe', cult: 'europe', troop: 'sword', layout: 'sword',
    sprite: `${N1066S}. 40대 초반 기사, 짧은 짙은 갈색 턱수염. 맨머리 짧은 짙은 갈색 머리(쇠사슬 두건은 목 뒤로 내림), 무릎까지 오는 쇠사슬 갑옷, 짙은 황토색 망토(둥근 쇠 브로치), 갈색 장화. 오른손에 곧은 장검을 칼끝 아래로 듦, 왼팔에 원뿔 투구를 낌`,
    back: '짧은 갈색 뒷머리와 내린 쇠사슬 두건, 황토 망토가 등을 덮음', side: '장검을 몸 앞에 칼끝 아래로, 황토 망토 자락', forbid: '창, 방패, 문장, 말, 녹색 망토', verify: '' }),
  ...S('npc_harold_godwinson', { name: '해럴드 고드윈슨', team: 'enemy', culture: 'europe', cult: 'europe', troop: 'spear', layout: 'sword',
    sprite: `${N1066S}. 40대 중반 왕, 길고 짙은 금갈색 콧수염(턱수염 없음), 어깨까지 오는 금갈색 머리. 코 가리개 원뿔 쇠 투구와 가는 금 띠, 무릎까지 오는 쇠사슬 갑옷, 짙은 진청색 망토(큰 둥근 금 브로치), 갈색 장화. 오른손에 긴 창을 세워 듦, 왼팔에 무늬 없는 짙은 갈색 연 모양 방패`,
    back: '원뿔 투구 뒤와 금갈 뒷머리, 진청 망토, 연 모양 방패 가장자리, 창 자루가 세로로', side: '창을 몸 앞에 세워 쥠, 연 모양 방패가 몸 옆', forbid: '턱수염, 칼을 손에 듦, 말, 용 깃발, 문장', verify: '' }),
  ...S('npc_gyrth_godwinson', { name: '거스 고드윈슨', team: 'enemy', culture: 'europe', cult: 'europe', troop: 'sword', layout: 'sword',
    sprite: `${N1066S}. 30대 초반 날렵한 백작, 짧은 금갈색 콧수염(턱수염 없음). 코 가리개 원뿔 쇠 투구, 무릎까지 오는 쇠사슬 갑옷, 짙은 적갈색 망토(둥근 쇠 브로치), 갈색 장화. 오른손에 곧은 장검을 세워 듦, 왼팔에 무늬 없는 짙은 녹색 둥근 방패`,
    back: '원뿔 투구 뒤, 적갈 망토, 녹색 둥근 방패 가장자리', side: '장검을 몸 앞에 세워 듦, 녹색 둥근 방패가 몸 옆', forbid: '창, 말, 문장, 턱수염, 연 모양 방패', verify: '' }),
  ...S('npc_edgar_atheling', { name: '에드가 애설링', team: 'enemy', culture: 'europe', cult: 'europe', troop: 'sword', layout: 'sword',
    sprite: '11세기 앵글로색슨 귀족 소년 복식 일반화. 10대 중반 소년 왕자, 수염 없음, 어깨에 닿는 밝은 금발. 투구·갑옷 없이 무릎 길이 짙은 남색 튜닉(금빛 띠 장식), 짙은 회색 망토(둥근 금 브로치), 갈색 가죽 허리띠에 칼집째 찬 짧은 칼, 갈색 장화. 두 손은 허리띠 앞',
    back: '금발 뒷머리, 회색 망토가 등을 덮음', side: '허리의 짧은 칼집, 남색 튜닉과 회색 망토 자락', forbid: '투구, 갑옷, 창, 방패, 칼을 뽑아 듦, 왕관, 말, 수염', verify: '대사 전용' }),
  ...S('npc_eudes_aquitaine', { name: '외드', team: 'ally', culture: 'europe', cult: 'europe', troop: 'cavalry', layout: 'cavalry', mounted: true,
    sprite: '8세기 프랑크·아키텐 귀족 기병 복식 일반화(쇠사슬 갑옷, 철판 둥근 투구, 피불라 망토. 판금·서코트·문장 금지). 회갈색 말을 탄 60대 공작(말과 기수가 한 캐릭터, 말 전체가 칸 안에), 회백색 짧은 턱수염. 철판을 이어 붙인 둥근 투구, 쇠사슬 갑옷, 짙은 포도주빛 적갈 망토(금 피불라). 오른손에 곧은 장검을 세워 듦. 말: 회갈색 몸, 짙은 갈기, 갈색 안장',
    back: '말 엉덩이와 짙은 꼬리, 기수의 둥근 투구와 포도주빛 망토', side: '회갈색 말이 왼쪽을 향해 걷고 기수는 장검을 세워 듦', forbid: '창, 활, 방패, 문장, 깃발, 원뿔 코가리개 투구, 보병(말 없는 모습)', verify: '' }),
  ...S('npc_abd_al_rahman_ghafiqi', { name: '압드 알라흐만 알가피키', team: 'enemy', culture: 'middle_east', cult: 'middle_east', troop: 'cavalry', layout: 'cavalry', mounted: true,
    sprite: '8세기 우마이야 시대 안달루스 아랍 기병 지휘관 복식 일반화(쇠사슬 갑옷, 투구에 감은 터번, 긴 겉옷. 오스만·맘루크 후대 복식 금지). 짙은 밤색 아랍 말을 탄 40대 후반 지휘관(말과 기수가 한 캐릭터, 말 전체가 칸 안에), 짧은 검은 턱수염. 둥근 쇠 투구에 감은 흰 터번, 쇠사슬 갑옷 위 짙은 녹청색 긴 겉옷과 짙은 갈색 망토, 붉은 칼띠. 오른손에 곧은 장검을 세워 듦. 말: 짙은 밤색 몸, 검은 갈기, 짙은 녹청 안장 천',
    back: '말 엉덩이와 검은 꼬리, 기수의 흰 터번 감은 투구와 갈색 망토', side: '밤색 말이 왼쪽을 향해 걷고 기수는 장검을 세워 듦', forbid: '휜 칼, 창, 활, 방패, 깃발, 초승달 장식, 보병(말 없는 모습)', verify: '' }),
};

export const REUSE_MAP = {
  npc_frankish_vanguard: { portrait: 'portrait.troop.europe.spear', sheet: 'unit.europe.spear.<ally|enemy>.64.sheet', note: '이름 없는 C급 전위 대장(ch24_s2) — 팀장 지시로 범용 재사용. 전용 제작 없음' },
};
export const P_IDS = Object.keys(P_B4), S_IDS = Object.keys(S_B4);
export const G = 'docker/gemini/npc_b4';
Object.assign(P_NPC_STORY, P_B4);
Object.assign(NPC, S_B4);
