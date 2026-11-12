// npc_b14 — 작업 정의 단일 출처(안아트 2026-11-08, 에셋 100% 완비 배치 D). 호출 없음(정의만).
// 대상: (1) 이름 없는 지휘관 25명 전용 방향 시트(문화권·병종 공용 시트 폴백 제거) + 초상 신규 12
//          - 초상 없음/병종 공용 초상 6: okpo 부장, ch25 척후장·나루 선장·몽골 선봉장·도성 수비대장·척후선단장
//          - 초상이 다른 인물과 같은 파일(바이트 동일)이라 시트를 만들면 그 인물 시트와 똑같아지는 6: 안달루스 경기병·보급·후위·선봉·근위·베르베르 보병
//            (andalus_light_cavalry_captain=berber_cavalry_chief, quartermaster=rearguard_captain=umayyad_rearguard, vanguard_captain=zaragoza_detachment,
//             arab_guard_captain=arab_guard_chief, berber_infantry_captain=umayyad_infantry_chief — md5 동일 확인 2026-11-08)
//      (2) 먹그림자 9명 전용 시트(npc_ink_shadow_s8 공유 해소). npc_shadow_ink = s8 원본 인물이라 s8 시트 사본, 나머지 8 신규. 초상 npc_shadow_vanguard 는 s8 과 바이트 동일 → 신규 1
//      (3) 사물: 짐수레 4행 공용 아이콘형 초상 1장(키 4개), 나룻배 npc_boat_2 배 도트 시트(뱃사공 인물 → 배) + 초상 1
// 스타일 상수 = style_guide.mjs, 시트 규칙 = unit_npc_sprite_style.mjs SHEET_RULE3, 초상 조립 = portrait_campaign_style.mjs job()(P_NPC_STORY 주입, npc_b11 방식)
// 규칙: 작품·작가·기존 캐릭터명 금지. 무기 1개 규칙. pal_mode unique. 의상 파랑은 적 시트에서 빨강으로 바뀌므로(hue 185-265 스왑) 지휘관 고유색은 파랑 계열을 피함.
import { P_NPC_STORY } from './portrait_npc_story_style.mjs';
export const G = 'docker/gemini/npc_b14';
export const LOG = `${G}/calls_log.jsonl`;
export const PRAW = `${G}/portraits/raw`, POUT = `${G}/portraits/out`, PQA = `${G}/portraits/qa.json`;
export const CALL_TARGET = 50, CALL_CAP = 70;

const REF_JP = 'public/assets/portraits/toyotomi_hideyoshi.png', REF_DV = 'public/assets/portraits/tran_hung_dao.png', REF_MON = 'public/assets/portraits/kublai_khan.png', REF_ME = 'public/assets/portraits/tariq_ibn_ziyad.png';
const JP = '16세기 말(1592) 일본 수군 무장 복식 일반화: 가로 비늘판을 끈으로 엮은 찰갑(도마루형), 소매 가리개. 가문 문장·투구 앞장식(뿔·초승달·큰 장식판)·깃발·사시모노 금지. 중국·한국 복식 요소 금지. 참조 그림의 얼굴·복식·색은 따르지 않음';
const DV13 = '13세기 말(1285~1288) 다이비엣(쩐 왕조) 복식 일반화: 긴 머리를 정수리에 상투로 틀고 천으로 감쌈, 오른쪽 섶을 위로 여민 교령 겉옷과 넓은 천 허리띠, 무장은 가죽 미늘을 끈으로 엮은 가벼운 찰갑. 19세기 응우옌조 복식(아오자이·칸박 터번)·명청대 관복·변발·일본 갑옷·한국 갓 금지. 참조 그림의 녹색 찰갑·둥근 가슴판·얼굴은 따르지 않음';
const YUAN13 = '13세기 말(1285~1288) 원(몽골) 장수 복식 일반화: 오른쪽으로 여미는 긴 델과 넓은 가죽 허리띠, 가죽·쇠 미늘을 끈으로 엮은 찰갑(어깨·허벅지 미늘 자락), 펠트·가죽 장화, 귀 뒤로 땋은 머리 고리. 일본 갑옷·한국 전립·청대 변발·명대 갑옷 금지. 참조 그림의 흰 털모자·금빛 찰갑·남색 델·얼굴은 따르지 않음';
const ME8 = '8세기 초(732) 우마이야 안달루스 군 복식 일반화: 끝이 둥글거나 뾰족한 쇠 투구 위에 감은 터번 천 또는 쇠사슬 두건, 무릎 길이 카프탄·튜닉, 쇠사슬 갑옷, 넓은 천 허리띠, 둥근 가죽·나무 방패. 오스만·맘루크 후기 복식(큰 깃털 터번·판금)·십자군 서유럽 갑옷 금지. 참조 그림의 얼굴·수염·복식 색은 따르지 않음';
const V = '이름 없는 직함형 지휘관 — 나이·수염·체격·색은 64px 구분용 제안값, 복식 일반화(verify)';
const H = (code, name, used, side, ref, era, culture, desc, verify) => ({ [code]: { name, roster: code, used_in: used, side, ref, kind: 'invented', era, culture, desc, verify } });
const INK = (code, name, used, desc) => ({ [code]: { name, roster: code, used_in: used, side: 'enemy', ref: null, kind: 'ink', era: '-', culture: 'ink', desc, verify: '가상 적(먹그림자) — 고증 대상 아님' } });

// ---- 초상 신규 13(인물 12 + 먹그림자 1). 사물 초상 2(수레·배)는 OBJ_PORTRAIT ----
export const P_B14 = {
  ...H('npc_jp_okpo_lieutenant', '일본 수군 부장', ['ch1 옥포 대사(도도 다카토라 휘하)'], 'enemy', REF_JP, '16세기 말(1592)', 'japan',
    `30대 초반 수군 부장, 햇볕에 그을린 마른 얼굴, 가늘게 다듬은 짧은 콧수염(턱수염 없음), 긴장한 듯 곧은 눈. ${JP}. 앞장식 없는 낮고 납작한 검은 철 삿갓형 투구(진가사, 테두리 넓음)와 턱끈, 짙은 흑갈색 옻칠 찰갑을 황토빛 겨자색 끈으로 엮음, 겨자색 소매 끝, 회갈색 무명 하카마. 오른손에 칼집에서 뺀 곧은 외날 칼(카타나) 1자루를 칼끝 아래로 비스듬히 쥠, 왼손은 허리. 지휘봉·창·깃발 없음`,
    '도도 다카토라 휘하 직함형 부장(대사 화자). ' + V),
  ...H('npc_dai_viet_scout_captain', '다이비엣 척후장', ['ch25_bachdang'], 'ally', REF_DV, '13세기 말', 'southeast_asia(dai viet, tran)',
    `20대 후반 척후 지휘관, 날렵하고 마른 얼굴, 짧고 가는 콧수염, 경계하는 날카로운 눈. ${DV13}. 상투 위에 얕은 원뿔형 대나무 삿갓(테두리 넓지 않음, 턱끈), 올리브빛 카키 무명 짧은 교령 겉옷(소매를 팔꿈치까지 걷음) 위에 갈색 가죽 미늘 조끼, 진한 녹갈색 천 허리띠, 정강이에 감은 천 각반, 오른쪽 어깨 뒤 대나무 화살통. 왼손에 큰 나무 활 1개를 세로로 쥠(프레임 안), 오른손은 가슴 앞. 칼·창·깃발 없음`,
    '척후 지휘(직함형). 대나무 삿갓 형태 verify. ' + V),
  ...H('npc_dai_viet_boat_captain', '나루 선장', ['ch25_bachdang'], 'ally', REF_DV, '13세기 말', 'southeast_asia(dai viet, tran)',
    `40대 중반 뱃사람 지휘관, 강바람에 짙게 그을린 넓은 얼굴, 이마 주름, 짧고 거친 검은 턱수염과 콧수염, 굵은 팔. ${DV13}. 상투를 짙은 계피색 갈색 무명 두건으로 감쌈, 햇볕에 바랜 모래빛 베이지 짧은 교령 겉옷(소매를 걷어 팔뚝이 드러남) 위에 짙은 갈색 가죽 조끼, 녹슨 적갈색 천 허리띠, 맨 종아리. 오른손에 몸 키보다 긴 대나무 삿대(배를 미는 장대) 1개를 세워 쥠(위끝은 프레임 안), 왼손은 허리. 칼·창·깃발 없음`,
    '바익당 나루 선장(직함형). ' + V),
  ...H('npc_yuan_vanguard_captain', '몽골 선봉장', ['ch25_bachdang'], 'enemy', REF_MON, '13세기 말', 'steppe(yuan)',
    `30대 초반 기병 선봉장, 광대가 높고 각진 얼굴, 짧은 콧수염과 턱 끝 짧은 수염, 공격적인 날카로운 눈. ${YUAN13}. 꼭대기에 짧은 붉은 말총 술이 달린 둥근 쇠 투구와 목 뒤로 늘어진 갈색 가죽 드림, 짙은 올리브녹색 델 위에 회철색 쇠 미늘 찰갑과 어깨 미늘, 갈색 털 깃, 검은 가죽 허리띠. 오른손에 쇠 창날이 달린 긴 기병 창 1개를 세워 쥠(창날은 머리 옆, 프레임 안). 칼·활·깃발 없음`,
    '원 선봉(직함형). ' + V),
  ...H('npc_yuan_garrison_captain', '도성 수비대장', ['ch25_bachdang'], 'enemy', REF_MON, '13세기 말', 'steppe(yuan)',
    `50대 초반 노련한 수비대장, 묵직하고 넓은 얼굴, 회색이 섞인 긴 콧수염과 짧은 턱수염, 무겁게 내리깐 눈, 두꺼운 체격. ${YUAN13}. 챙이 둘린 낮은 쇠 투구(챙 아래 짙은 갈색 가죽 귀덮개), 황갈색(낙타색) 델 위에 검은 옻칠 가죽 미늘 찰갑과 큰 어깨 미늘, 넓은 흑갈색 허리띠. 오른손에 창날 아래 검은 말총 술이 달린 긴 창 1개를 세워 쥠(창날은 머리 옆, 프레임 안), 왼손은 허리. 칼·활·깃발 없음`,
    '탕롱 점령 수비(직함형). ' + V),
  ...H('npc_yuan_patrol_captain', '척후선단장', ['ch25_bachdang'], 'enemy', REF_MON, '13세기 말', 'steppe(yuan)',
    `30대 후반 강 정찰 선단장, 야윈 얼굴에 볕에 탄 피부, 짧게 깎은 염소수염, 경계하는 가는 눈. ${YUAN13}. 회백색 펠트 테를 두른 둥근 갈색 가죽 모자(챙 없음, 깃털 없음), 소매를 걷은 회갈색(모래 회색) 짧은 델 위에 가벼운 갈색 가죽 조끼, 녹슨 적갈색 천 허리띠. 오른손에 살짝 휜 외날 칼 1자루를 칼끝 아래로 쥠, 왼손은 허리. 활·창·깃발 없음`,
    '원 수군 정찰 선단(직함형). ' + V),
  ...H('npc_andalus_light_cavalry_captain', '경기병 대장', ['ch24_tours'], 'enemy', REF_ME, '8세기 초(732)', 'middle_east(andalus)',
    `20대 후반 경기병 대장, 날렵한 얼굴, 짧고 검은 콧수염과 짧게 다듬은 턱수염, 자신만만한 눈. ${ME8}. 투구 없이 머리에 모래빛 크림색 터번(턱 아래로 늘어진 꼬리 천 없음), 쇠사슬 갑옷 대신 사프란 주황색 누빔 천 갑옷 저고리(세로 누빔선), 짙은 갈색 가죽 허리띠와 어깨끈. 오른손에 가볍고 짧은 투창형 창 1개를 세워 쥠(창날은 머리 옆, 프레임 안). 방패·칼·깃발 없음`,
    '경기병 대장(직함형). ' + V),
  ...H('npc_andalus_quartermaster', '안달루스 보급 책임자', ['ch24_tours'], 'enemy', REF_ME, '8세기 초(732)', 'middle_east(andalus)',
    `50대 중반 보급 책임자, 둥글고 살집 있는 얼굴, 풍성한 회색 턱수염, 꼼꼼하고 피곤한 눈. ${ME8}. 크고 둥근 흰 터번(투구 없음), 넉넉한 황토빛 겨자 갈색 긴 카프탄 위에 짙은 갈색 가죽 조끼, 넓은 적갈색 천 허리띠, 어깨에 가죽 장부 가방. 오른손에 둘둘 만 보급 장부 두루마리 1개를 가슴 앞에 듦, 왼손은 허리띠. 칼·창·방패·깃발 없음`,
    '보급 책임자(직함형). ' + V),
  ...H('npc_andalus_rearguard_captain', '후위장', ['ch24_tours_ext2'], 'enemy', REF_ME, '8세기 초(732)', 'middle_east(andalus)',
    `40대 중반 후위 지휘관, 길쭉하고 엄한 얼굴, 회색이 섞인 짧은 검은 턱수염, 침착한 눈. ${ME8}. 끝이 뾰족한 강철 투구와 어깨까지 덮는 쇠사슬 드림(얼굴은 드러남), 짙은 포도주빛 적갈색(와인색) 긴 망토, 망토 안 회철색 쇠사슬 갑옷과 짙은 회색 튜닉, 검은 가죽 허리띠, 등에 둥근 짙은 갈색 가죽 방패. 오른손에 긴 창 1개를 세워 쥠(창날은 머리 옆, 프레임 안). 칼·활·깃발 없음`,
    '후위 지휘(직함형). ' + V),
  ...H('npc_andalus_vanguard_captain', '안달루스 선봉장', ['ch24_tours'], 'enemy', REF_ME, '8세기 초(732)', 'middle_east(andalus)',
    `30대 중반 선봉장, 짙고 풍성한 검은 턱수염, 굵은 눈썹, 대담한 눈. ${ME8}. 끝이 둥근 구릿빛 청동 투구(터번 없음, 장식 없음), 구릿빛 청동 비늘 갑옷 조끼 위에 연한 모래빛 황갈색 튜닉 자락, 짙은 적갈색 천 허리띠, 갈색 가죽 팔 보호대. 오른손에 넓은 창날의 창 1개를 세워 쥠(창날은 머리 옆, 프레임 안). 방패·칼·깃발 없음`,
    '선봉 지휘(직함형). ' + V),
  ...H('npc_arab_guard_captain', '총독 근위대장', ['ch24_tours_ext2'], 'enemy', REF_ME, '8세기 초(732)', 'middle_east(andalus)',
    `40대 근위대장, 단정하게 다듬은 검은 턱수염, 반듯한 얼굴, 위엄 있는 눈. ${ME8}. 금빛 테가 둘린 둥근 강철 투구 위에 흰 터번 천을 낮게 감음, 크림빛 흰 긴 카프탄을 쇠사슬 갑옷 위에 입음, 어깨에 두른 검은 망토, 금빛 장식 없는 짙은 갈색 가죽 허리띠. 오른손에 긴 창 1개를 세워 쥠(창날은 머리 옆, 프레임 안). 방패·칼·깃발 없음`,
    '총독 근위대장(직함형). ' + V),
  ...H('npc_berber_infantry_captain', '베르베르 보병 대장', ['ch24_tours'], 'enemy', REF_ME, '8세기 초(732)', 'middle_east(berber)',
    `30대 후반 보병 대장, 여위고 강인한 얼굴, 짧은 검은 턱수염, 깊은 눈. ${ME8}. 머리에 고깔 달린 짙은 갈색과 흙색 세로 줄무늬 양모 망토(부르누스, 고깔을 머리에 씀)와 그 아래 황갈색 천 머리 두름, 망토 안 짧은 쇠사슬 갑옷과 흙빛 튜닉, 등에 길쭉한 타원형 생가죽 방패(밝은 황갈색). 오른손에 긴 창 1개를 세워 쥠(창날은 머리 옆, 프레임 안). 칼·활·깃발 없음`,
    '베르베르 보병 대장(직함형). ' + V),
  ...INK('npc_shadow_vanguard', '먹그림자 선봉', ['ch1_s8(vice)'],
    '먹물이 앞으로 쏠리며 뭉친 길쭉한 먹물 덩어리, 덩어리 앞쪽에서 먹물로 된 뾰족한 창날 세 개가 앞으로 솟고 그 아래 먹물 꼬리가 뒤로 흐름, 흑남색 먹물에 청록 반사광, 덩어리 주위로 찢긴 낡은 종이 조각 몇 장이 흩날림. 둥근 공 모양이 아니라 앞으로 돌진하는 창끝 형태'),
};
Object.assign(P_NPC_STORY, P_B14);

// ---- 사물 초상(아이콘형, 3:4) ----
export const OBJ_PORTRAIT = {
  npc_cart: { keys: ['npc_cart_front', 'npc_cart_rear', 'npc_cart_1', 'npc_cart_2'], name: '짐수레', ref: 'public/assets/sprites/npc/64_x2/npc_cart_1_ally_sheet.png',
    desc: '나무 두 바퀴 짐수레 한 대, 3/4 위에서 비스듬히 내려다본 시점. 밝은 나무색 판자 짐칸, 큰 나무 바퀴 두 개(쇠 테), 앞으로 뻗은 끌채 두 개. 짐칸 위에 회녹색 천 덮개를 밧줄로 묶었고 그 옆으로 작은 나무통 두 개와 흰 곡식 자루가 보임. 사람·말·소 없음' },
  npc_boat_2: { keys: ['npc_boat_2'], name: '나룻배', ref: null,
    desc: '작은 나무 나룻배 한 척이 잔잔한 물 위에 떠 있는 모습, 3/4 위에서 비스듬히 내려다본 시점(뱃머리가 왼쪽 앞). 밝은 갈색 나무 판자 선체, 뱃전 위쪽 테두리를 따라 칠한 굵은 파란 띠 한 줄, 배 가운데 노 두 개가 뱃전에 걸쳐 있고 뒤쪽에 짧은 대나무 삿대, 앞쪽에 감은 밧줄 한 묶음. 배 아래만 작게 파란 물결 타원(배 둘레를 벗어나지 않음). 사람·돛·깃발 없음' },
};

// ---- 시트 작업 ----
const ONE = '무기·소지품은 정확히 1개만(두 무기 동시 소지·허리 칼 추가 금지): ';
const BACK = { cavalry: '말 엉덩이와 꼬리, 기수의 머리 장비 뒷면과 겉옷·망토 등판', other: '머리 장비 뒷면과 겉옷·망토 등판, 무기·소지품은 정면과 같은 손·같은 각도' };
const SIDE = { cavalry: '말이 왼쪽을 향해 걷고 기수는 무기를 몸 앞에 같은 각도로 듦', other: '무기·소지품을 몸 앞에 같은 각도로 듦, 머리 장비 옆선' };
const LAY = (t, kor) => `docker/gemini/hero_dir_refs/dir64_${kor && ['archer', 'cavalry', 'healer', 'sword'].includes(t) ? 'korea_' : ''}${{ spear: 'sword', naval: 'sword' }[t] ?? t}.jpg`;
const CMD = '이름 없는 지휘관이지만 같은 문화권 일반 병사와 확실히 구별되는 지휘관 외형(병사보다 좋은 갑옷·망토·머리 장비, 아래 고유색)';
const por = (c) => `public/assets/portraits/npc/${c}.webp`;
const newPor = (c) => `${POUT}/${c}.png`;
// [code, 이름, troop(시트 레이아웃), 문화권 폴백, 초상 경로, 외형(시트용), 무기/소지품, 등장, 신규초상?]
const C = [
  ['npc_jp_okpo_lieutenant', '일본 수군 부장', 'naval', 'japan', newPor, '앞장식 없는 넓적한 검은 삿갓형 철 투구, 흑갈색 갑옷에 겨자색 끈과 소매, 회갈색 하카마, 짧은 콧수염', '오른손에 곧은 외날 칼 1자루를 칼끝 아래로', 'ch1 옥포 대사', true],
  ['npc_wa_naval_commander', '왜 수군 지휘관', 'naval', 'japan', por, '챙이 둥근 쇠 투구와 목가리개, 짙은 남흑색 판갑 위 쇠 어깨판, 갈색 겉옷 조끼, 적갈색 소매, 짧은 턱수염(초상과 같게)', '오른손에 곧은 칼 1자루', 'ch13 황산벌', false],
  ['npc_andalus_quartermaster', '안달루스 보급 책임자', 'cavalry', 'middle_east', newPor, '크고 둥근 흰 터번, 겨자 갈색 긴 카프탄과 갈색 가죽 조끼, 적갈색 허리띠, 회색 수염, 통통한 체격, 갈색 말', '오른손에 둘둘 만 두루마리 1개를 가슴 앞에(무기 없음)', 'ch24 투르', true],
  ['npc_goguryeo_pisa_captain', '비사성 수비장', 'archer', 'korea', por, '짧은 깃털 장식 쇠 투구, 갈색 찰갑에 검붉은 테, 회색 염소수염의 노장(초상과 같게), 등에 화살통', '왼손에 활 1개를 세로로', 'ch14 살수', false],
  ['npc_goguryeo_yalu_ferry_captain', '압록강 도하 감시장', 'archer', 'korea', por, '새 깃 두 개를 꽂은 쇠 투구, 회철색 비늘 찰갑과 갈색 가죽 덧옷, 젊은 얼굴(초상과 같게), 등에 화살통', '왼손에 활 1개를 세로로', 'ch14 살수', false],
  ['npc_goguryeo_spear_captain', '장창 부장', 'spear', 'korea', por, '붉은 술 장식 쇠 투구, 회철색 비늘 찰갑에 붉은 엇갈린 띠, 등에 둥근 방패(초상과 같게)', '오른손에 붉은 술 달린 긴 창 1개를 세워', 'ch14 살수', false],
  ['npc_goguryeo_dam_keeper', '살수 물막이 감독', 'healer', 'korea', por, '둥근 쇠 투구, 회철색 비늘 찰갑, 어깨에 감은 굵은 밧줄 타래(초상과 같게)', '오른손에 쇠 날 삽 1자루를 세워 짚음(칼·창 없음)', 'ch14 살수', false],
  ['npc_goguryeo_scout_captain', '척후 대장', 'archer', 'korea', por, '새 깃 꽂은 쇠 투구, 짙은 갈색 두건 달린 망토를 비늘 찰갑 위에 두름(초상과 같게), 등에 화살통', '왼손에 활 1개를 세로로', 'ch14 살수', false],
  ['npc_delhi_elephant_chief', '코끼리 부대장', 'cavalry', 'south_asia', por, '말 대신 작은 회색 아시아 코끼리(큰 귀·말아 올린 코·짧은 상아, 등에 붉은 깔개)에 탄 기수: 흰 터번을 감은 투구와 작은 깃 장식, 금빛 테 강철 갑옷, 녹색 겉옷, 황금빛 허리띠(초상과 같게). 코끼리와 기수 전체가 칸 안', '오른손에 술 달린 긴 창 1개를 세워', 'ch22 델리', false],
  ['npc_frankish_phalanx_captain', '방진 보병 대장', 'spear', 'europe', por, '코 가리개 달린 원뿔 쇠 투구, 쇠사슬 갑옷, 어깨에 두른 갈색 망토, 왼팔에 둥근 나무 방패(초상과 같게)', '오른손에 긴 창 1개를 세워', 'ch24 투르', false],
  ['npc_frankish_archer_captain', '프랑크 궁병대장', 'archer', 'europe', por, '둥근 쇠 투구, 녹색 튜닉 위 갈색 가죽 조끼, 어깨에 회색 두건 망토, 등에 화살통(초상과 같게)', '왼손에 긴 활 1개를 세로로', 'ch24 투르', false],
  ['npc_frankish_baggage_guard', '보급 호위장', 'healer', 'europe', por, '코 가리개 원뿔 쇠 투구, 쇠사슬 갑옷, 진녹색 망토, 등에 둥근 나무 방패(초상과 같게)', '오른손에 둘둘 만 두루마리 1개를 가슴 앞에(칼·창 없음)', 'ch24 투르', false],
  ['npc_frankish_scout_captain', '프랑크 척후장', 'archer', 'europe', por, '코 가리개 원뿔 쇠 투구, 올리브 갈색 두건 망토, 갈색 가죽 조끼와 녹색 튜닉, 등에 화살통(초상과 같게)', '왼손에 활 1개를 세로로', 'ch24 투르', false],
  ['npc_andalus_light_cavalry_captain', '경기병 대장', 'cavalry', 'middle_east', newPor, '크림색 터번(투구 없음), 사프란 주황색 누빔 천 갑옷 저고리, 갈색 가죽 어깨끈, 밤색 말', '오른손에 짧은 창 1개를 세워', 'ch24 투르', true],
  ['npc_berber_infantry_captain', '베르베르 보병 대장', 'spear', 'middle_east', newPor, '고깔을 머리에 쓴 갈색·흙색 세로 줄무늬 양모 망토, 쇠사슬 갑옷, 등에 밝은 황갈색 타원 생가죽 방패', '오른손에 긴 창 1개를 세워', 'ch24 투르', true],
  ['npc_andalus_archer_captain', '안달루스 궁병대장', 'archer', 'middle_east', por, '녹갈색 터번과 쇠사슬 두건, 금빛 테 올리브 카프탄(초상과 같게), 등에 화살통', '왼손에 활 1개를 세로로', 'ch24 투르', false],
  ['npc_andalus_scout_captain', '안달루스 척후장', 'cavalry', 'middle_east', por, '올리브 터번 감은 투구와 쇠사슬 두건, 올리브 갈색 튜닉, 등에 둥근 방패(초상과 같게), 회갈색 말', '오른손에 창 1개를 세워', 'ch24 투르', false],
  ['npc_andalus_vanguard_captain', '안달루스 선봉장', 'cavalry', 'middle_east', newPor, '구릿빛 청동 투구, 구릿빛 청동 비늘 조끼와 모래빛 튜닉, 짙은 검은 턱수염, 검은 말', '오른손에 넓은 창날 창 1개를 세워', 'ch24 투르', true],
  ['npc_arab_guard_captain', '총독 근위대장', 'cavalry', 'middle_east', newPor, '흰 터번 천을 감은 금빛 테 강철 투구, 쇠사슬 위 크림빛 흰 카프탄, 검은 망토, 흰 말', '오른손에 긴 창 1개를 세워', 'ch24 투르', true],
  ['npc_andalus_rearguard_captain', '후위장', 'cavalry', 'middle_east', newPor, '뾰족한 강철 투구와 쇠사슬 드림, 포도주빛 적갈색 긴 망토, 회철색 쇠사슬 갑옷, 등에 둥근 갈색 방패, 짙은 회색 말', '오른손에 긴 창 1개를 세워', 'ch24 투르', true],
  ['npc_dai_viet_scout_captain', '다이비엣 척후장', 'archer', 'china', newPor, '얕은 원뿔 대나무 삿갓, 올리브 카키 짧은 겉옷(소매 걷음)과 갈색 가죽 미늘 조끼, 녹갈색 허리띠, 천 각반, 등에 대나무 화살통', '왼손에 활 1개를 세로로', 'ch25 바익당', true],
  ['npc_dai_viet_boat_captain', '나루 선장', 'naval', 'china', newPor, '계피색 갈색 두건, 바랜 베이지 짧은 겉옷(소매 걷음)과 짙은 갈색 가죽 조끼, 녹슨 적갈색 허리띠, 맨 종아리, 거친 턱수염', '오른손에 몸 키보다 긴 대나무 삿대 1개를 세워(칸 안)', 'ch25 바익당', true],
  ['npc_yuan_vanguard_captain', '몽골 선봉장', 'cavalry', 'middle_east', newPor, '붉은 말총 술 달린 둥근 쇠 투구와 가죽 드림, 올리브녹색 델 위 회철색 미늘 찰갑, 갈색 털 깃, 갈색 몽골 말', '오른손에 긴 기병 창 1개를 세워', 'ch25 바익당', true],
  ['npc_yuan_garrison_captain', '도성 수비대장', 'spear', 'middle_east', newPor, '챙 둘린 낮은 쇠 투구와 가죽 귀덮개, 낙타색 델 위 검은 미늘 찰갑과 큰 어깨 미늘, 회색 섞인 긴 콧수염, 두꺼운 체격', '오른손에 검은 술 달린 긴 창 1개를 세워', 'ch25 바익당', true],
  ['npc_yuan_patrol_captain', '척후선단장', 'naval', 'middle_east', newPor, '회백색 펠트 테 두른 둥근 갈색 가죽 모자, 소매 걷은 모래 회색 짧은 델과 갈색 가죽 조끼, 녹슨 적갈색 허리띠, 염소수염', '오른손에 살짝 휜 외날 칼 1자루를 칼끝 아래로', 'ch25 바익당', true],
];
// 먹그림자 8(시트 신규). 외형 = 각자 정식 초상. npc_shadow_ink 는 s8 원본(같은 인물) → 시트 사본(호출 없음)
const INK_RULE = '먹물로 된 비인간 그림자 존재. 사람 얼굴·눈·입·피부 없음. 바닥에 그림자처럼 붙어 미끄러지듯 움직이고 걷기 프레임은 덩어리가 조금 출렁이거나 1~2px 위아래로 흔들리는 차이만. 흑남색 먹물 몸에 청록 반사광 1단, 아주 짙은 남흑색 외곽선(완전한 검정 단색 덩어리로 뭉개지지 않게 명암 2~3단 유지)';
const S = [
  ['npc_shadow_vanguard', '먹그림자 선봉', 'spear', newPor, '앞으로 쏠린 길쭉한 먹물 덩어리 앞쪽에 먹물 창날 세 개가 솟아 있고 뒤로 먹물 꼬리가 흐름, 주위에 찢긴 종이 조각 2~3장', '창날 세 개는 덩어리의 일부(따로 든 무기 없음)'],
  ['npc_shadow_archivist', '먹그림자 사서', 'archer', por, '두건 달린 긴 먹물 망토를 걸친 키 큰 형체(두건 안은 얼굴 없이 어두운 청록 그늘), 흑남색 투구 윤곽, 망토 자락이 바닥에 먹물처럼 번짐, 주위에 종이 조각 2~3장', '왼손(먹물 손)에 흰 깃 화살 다발 1개를 쥠'],
  ['npc_shadow_warden', '먹그림자 수문장', 'sword', por, '먹물 몸에 낡은 갈색 가죽·청동 어깨갑옷과 허리띠를 걸친 큰 형체(머리는 뾰족한 먹물 투구 윤곽, 얼굴 없음), 허리에 쇠 열쇠 꾸러미', '오른손에 칼 1자루를 칼끝 아래로'],
  ['npc_shadow_proofreader', '먹그림자 교정자', 'spear', por, '검은 먹물이 날카로운 가시처럼 솟은 비스듬한 형체에 붉은 교정 줄(빨간 엇갈린 획) 여러 개가 그어져 있음', '몸에서 길게 뻗은 검은 먹물 창 1개(몸의 일부)'],
  ['npc_shadow_seal', '먹그림자 낙관', 'sword', por, '두꺼운 정사각 먹물 도장 블록(앞면에 굵은 붉은 사각 테두리, 안쪽은 검은 면, 글자 없음), 블록 아래 짧은 먹물 받침이 바닥에 번짐', '블록 오른쪽에 짧은 먹물 가시 1개(몸의 일부)'],
  ['npc_shadow_ironguard', '먹그림자 철갑 호위', 'sword', por, '속이 빈 낡은 회철색 판금 갑옷(어깨판·가슴판·팔 보호대) 안을 검은 먹물이 채우고 아래로 뚝뚝 흘러내림, 머리 자리는 둥근 검은 먹물 덩어리(얼굴 없음)', '무기 없음(빈 갑옷 팔을 몸 앞에)'],
  ['npc_shadow_scribe', '먹그림자 필경사', 'archer', por, '소용돌이치는 흑남색 먹물 회오리 덩어리 위로 검은 깃털 붓(깃펜) 세 자루가 위로 꽂혀 솟음, 주위에 흰 종이 조각 2장', '깃펜 세 자루는 덩어리에 꽂힌 일부(따로 든 무기 없음)'],
  ['npc_shadow_printer', '먹그림자 인쇄공', 'archer', por, '등이 굽은 흑남색 먹물 짐승 형체(얼굴 없음), 가슴 앞에 회색 활자판 격자(작은 네모 칸, 글자 없음)가 박혀 있고 뒤로 긴 먹물 꼬리가 말려 올라감', '무기 없음(활자판이 몸의 일부)'],
];
export function sheetItems() {
  const items = {};
  for (const [code, name, troop, culture, pf, look, weapon, used, newP] of C) {
    const mounted = troop === 'cavalry';
    items[code] = { name, kind: 'cmd', troop, layoutRef: LAY(troop, culture === 'korea'), mounted, culture, used_in: used, portrait: pf(code), portrait_new: newP,
      desc: `${CMD}: ${look}. ${ONE}${weapon}`, back: BACK[mounted ? 'cavalry' : 'other'], side: SIDE[mounted ? 'cavalry' : 'other'],
      forbid: `깃발, 문장, 글자, 초상에 없는 큰 방패 추가${mounted ? '' : ', 말'}${code === 'npc_delhi_elephant_chief' ? ', 말(탈것은 코끼리)' : ''}`,
      fallback: `unit.${{ south_asia: 'middle_east' }[culture] ?? culture}.${troop}.enemy.64.sheet`, verify: V };
  }
  for (const [code, name, lay, pf, look, weapon] of S) {
    items[code] = { name, kind: 'ink', troop: lay, layoutRef: LAY(lay), mounted: false, culture: 'ink', used_in: 'ch1 서고(먹그림자)', portrait: pf(code), portrait_new: code === 'npc_shadow_vanguard',
      desc: `${INK_RULE}. 외형: ${look}. ${weapon}`, back: '같은 덩어리의 뒷면(얼굴 없음), 외형 요소는 정면과 같은 위치', side: '덩어리가 왼쪽으로 기울어 미끄러지는 옆모습',
      forbid: '사람 얼굴, 눈, 입, 피부, 해골, 피, 글자, 한자, 숫자, 부적 문양, 말', fallback: 'unit.npc.npc_ink_shadow_s8.enemy.64.sheet', verify: '가상 적 — 고증 대상 아님' };
  }
  items.npc_boat_2 = { name: '나룻배', kind: 'boat', troop: 'naval', layoutRef: `${G}/boat_layout_ref.png`, mounted: false, culture: 'default', used_in: 'main_a3', portrait: newPor('npc_boat_2'), portrait_new: true,
    desc: '사람이 타지 않은 작은 나무 나룻배 한 척(사물 유닛). 밝은 갈색 나무 판자 선체, 뱃전 위 테두리를 따라 칠한 굵은 파란 띠 한 줄(팀색으로 바뀌는 부분, 파랑은 이 띠에만), 배 안에 노 두 개를 뱃전에 걸쳐 둠, 앞쪽에 감은 밧줄 한 묶음. 배 바닥 아래 아주 얇은 연한 물결 테두리 1줄만(배 밖으로 넓게 퍼지지 않게)',
    back: '배 뒤쪽(고물)이 보이는 뒷모습, 뱃머리는 위쪽으로', side: '배 전체가 왼쪽을 향한 옆모습(뱃머리가 왼쪽, 길쭉한 선체 옆면과 파란 띠가 보임)',
    forbid: '사람, 노꾼, 돛, 돛대, 깃발, 글자, 말', fallback: 'unit.default.naval.ally.64.sheet', verify: '사물(배) — 고증 대상 아님' };
  return items;
}
export const BOAT_SHEET_RULE = '정확히 3열x3행(9칸) 균등 격자, 한 칸에 배 1프레임, 격자선·칸 테두리·글자 없음, 칸 사이 여백 충분. 행 순서(위→아래): 1행 뱃머리가 아래(화면 앞)를 향한 모습(위에서 비스듬히 내려다본 3/4 시점, 뱃머리 뾰족한 끝이 아래쪽), 2행 세 칸 모두 뱃머리가 화면 왼쪽을 향한 완전한 옆모습(위에서 비스듬히), 3행 뱃머리가 위(화면 안쪽)를 향해 고물이 보이는 모습. 열 순서: 살짝 왼쪽으로 기울어 흔들림, 똑바로, 살짝 오른쪽으로 기울어 흔들림(차이는 1~2px 기울기·물결선만). 9칸 모두 같은 배·같은 크기: 배 길이가 칸 너비(옆모습) 또는 칸 높이(앞·뒤 모습)의 80% 정도로 크게, 칸 가로 중앙, 아래 기준선 동일';
