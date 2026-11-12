// npc_ch25b — ch25(바익당, 쩐 왕조 대 몽골·원) 이름 있는 인물 잔여 7명: 초상 5 + 방향 시트 7 (안아트 2026-11-08, 팀장 지시 '에셋 100% 완비' 배치 A).
// 초상 방식 = ch25_portraits_style.mjs / npc_b11_portrait_style.mjs 와 같음: 이 모듈을 import 한 프로세스 안에서만 P_NPC_STORY 에 항목을 더해
//   portrait_campaign_style.mjs job()(896x1200 3:4, 마젠타 크로마키, neutral 1종)으로 조립.
// 시트 방식 = npc_b11_plan.mjs / npc_b11_gen.mjs 와 같음(refs = 병종 3x3 견본 + 정식 초상, SHEET_RULE3, 무기 1개 규칙, pal_mode unique, 적 시트 = 파랑 계열 적색 스왑).
//   수군(naval) 인물은 npc_naval_style.mjs 의 수병 가독성 문구(배 오버레이 위 상체) 추가.
// 근거: docs/original_story/ch25_bachdang_outline.md(인물표·말투), ch25_dialogue_notes.md, heroes 테이블(name_ko·troop_type·culture·era), ch25_portraits_style.mjs P_CH25(칸즈·오마르 외형 단일 출처).
// 색 축(ch25 기존과 구분): 쩐흥다오 녹색 찰갑 / 녓똥 황토 금 / 칸즈 갈색+청록 / 응우라오 쪽빛+흙갈 / 꽝카이 벽돌 적갈 / 녓주엇 청회+흰 머리띠 / 꾸옥또안 주홍 / 코아이 흑색+황토 / 자뜨엉 회갈+적갈 →
//   타인똥 = 짙은 쪽빛 비단 포+회백 테+검은 사모형 관+회색 섞인 수염+나무 지팡이(48세 상황) / 옛끼에우 = 소매 없는 청회 웃옷+흰 허리띠+맨 상투+어깨 밧줄+작살(잠수 명수)
//   원: 토간 적갈 / 소게투 흑갈+회철 / 오마르 카키+사프란 / 리항 겨자 → 판제 = 회백 전포+검은 옻칠 찰갑+붉은 짧은 술 쇠 투구+창 / 오로치 = 녹슨 적주황 델+회색 늑대털 테 모자+전투 도끼 / 장원호 = 짙은 올리브 갈색 전포+검은 복두+가죽 흉갑+칼집 든 곧은 칼(50대 통통)
import { P_NPC_STORY } from './portrait_npc_story_style.mjs';
export const G = 'docker/gemini/npc_ch25b';
export const RAW_P = `${G}/portraits/raw`, OUT_P = `${G}/portraits/out`, RAW_S = `${G}/raw`, LOG = `${G}/calls_log.jsonl`;
export const CALL_TARGET = 14, CALL_LIMIT = 24;
const REF_DV = 'public/assets/portraits/tran_hung_dao.png', REF_MON = 'public/assets/portraits/kublai_khan.png';
const DV13 = '13세기 말(1285~1288) 다이비엣(쩐 왕조) 복식 일반화: 긴 머리를 정수리에 상투로 틀고 천으로 감싸거나 낮은 관을 씀, 오른쪽 섶을 위로 여민 교령 겉옷과 넓은 천 허리띠, 무장은 가죽·쇠 미늘을 끈으로 엮은 가벼운 찰갑. 19세기 응우옌조 복식(아오자이·둥글게 감은 칸박 터번)·명청대 관복·변발·일본 갑옷·한국 갓 금지. 참조 그림의 녹색 찰갑·둥근 가슴판·문양 머리띠·얼굴은 따르지 않음';
const YUAN13 = '13세기 말(1285~1288) 원(몽골) 장수 복식 일반화: 오른쪽으로 여미는 긴 델과 넓은 가죽 허리띠, 가죽·쇠 미늘을 끈으로 엮은 찰갑(어깨·허벅지 미늘 자락), 펠트·가죽 장화. 귀 뒤로 땋은 머리 고리를 늘어뜨린 몽골식 머리. 일본 갑옷·한국 전립·청대 변발·명대 갑옷 금지. 참조 그림의 흰 털모자·금빛 찰갑·남색 델·얼굴은 따르지 않음';
const HANYUAN = '13세기 말(1285~1288) 원 조정에 속한 한인(漢人) 수군 장수 복식 일반화: 오른쪽 섶을 여민 긴 전포와 넓은 가죽 허리띠, 그 위에 쇠·가죽 미늘을 끈으로 엮은 찰갑, 상투를 튼 머리. 몽골식 땋은 머리 고리 없음. 명청대 갑옷·용머리 장식·청대 변발·일본 갑옷·한국 전립 금지. 참조 그림의 흰 털모자·금빛 찰갑·남색 델·얼굴은 따르지 않음';
const H = (code, name, used, side, ref, era, culture, desc, verify) => ({ [code]: { name, roster: code, used_in: used, side, ref, kind: 'hist', era, culture, desc, verify } });
const V = '용모 기록 없음 — 나이·수염·체격 제안값, 복식 일반화(verify)';
export const P_CH25B = {
  ...H('npc_tran_thanh_tong', '쩐 타인똥', ['ch25_open', 'ch25_end'], 'ally', REF_DV, '13세기(1240~1290)', 'southeast_asia(dai viet, tran)',
    `40대 후반 상황(자리를 물려준 앞 임금), 온화하고 깊은 눈, 이마와 눈가의 옅은 주름, 단정히 다듬은 회색이 섞인 검은 콧수염과 가슴 위까지 오는 가는 턱수염, 차분하고 너그러운 인상. ${DV13}. 상투 위에 쓴 낮고 둥근 검은 비단 사모형 관(뒤쪽에 짧은 날개 두 개, 보석·금관 없음), 오른쪽 섶을 위로 여민 짙은 쪽빛(짙은 남색) 비단 긴 포(무늬 없음, 깃과 소매 끝에 회백색 테), 넓은 짙은 갈색 비단 허리띠. 갑옷 없음. 오른손에 가슴 높이까지 오는 매끈한 짙은 갈색 나무 지팡이를 세워 쥠(지팡이는 이것 하나, 장식 없음, 프레임 안), 왼손은 가슴 앞에 가볍게 둠. 칼·창·부채·용·봉황 문양·글자·염주·불교 법구 없음`,
    '상황(confirmed). 장면 등장 시 이름표만(대사 없음). 어복 색·관 형태 근거 약함 — 일반화(verify). ' + V),
  ...H('npc_yet_kieu', '옛끼에우', ['ch25_s9', 'ch25_s10'], 'ally', REF_DV, '13세기 말(전승)', 'southeast_asia(dai viet, tran)',
    `30세 전후 흥다오의 가신이자 잠수·수전 명수, 햇볕과 바닷물에 그을린 구릿빛 피부, 마르고 탄탄한 근육질 체격, 수염 없는 갸름한 얼굴(턱에 옅은 수염 자국), 침착하고 맑은 검은 눈. ${DV13}(단 갑옷 없음). 상투를 짧은 노끈으로만 질끈 묶은 맨머리(두건·머리띠 없음), 앞섶을 여민 소매 없는 짙은 청회색(물빛 회청) 무명 짧은 웃옷(팔은 어깨부터 드러남), 허리에 굵게 감은 흰 무명 띠, 오른쪽 어깨에서 왼쪽 허리로 둥글게 감은 갈색 밧줄 한 묶음, 무릎 아래까지 걷은 짙은 바지. 오른손에 끝에 미늘 없는 곧은 쇠 작살촉이 달린 짧은 대나무 작살을 세워 쥠(작살촉은 머리 옆, 프레임 안), 왼손은 허리. 칼·활·깃발·갑옷 없음`,
    '후대 전승 비중 큰 인물 — 이름표 가신으로만 사용(verify). 잠수·작살 표현은 전승 기반 게임 표현. ' + V),
  ...H('npc_fan_yi', '판제', ['ch25_s9', 'ch25_s10'], 'enemy', REF_MON, '13세기 말(?~1288)', 'steppe(yuan, han chinese naval)',
    `40대 초반 원 수군 부장(한인 출신), 각지고 단단한 얼굴, 짙은 일자 눈썹, 짧게 다듬은 검은 콧수염과 짧은 턱수염, 고집스럽고 긴장한 눈. ${HANYUAN}. 머리에 둥근 쇠 투구(꼭대기에 짧은 붉은 술 하나, 목 뒤를 덮는 쇠 미늘 드림, 앞장식 없음), 바랜 회백색 무명 전포 위에 검은 옻칠 쇠 미늘 찰갑과 어깨 미늘, 짙은 갈색 가죽 허리띠. 오른손에 쇠 창날이 달린 긴 창을 세워 쥠(창날은 머리 옆, 프레임 안), 왼손은 허리. 칼·깃발·방패 없음`,
    '3차 수군 부장, 바익당에서 투신(accepted). 한인 출신은 이름(樊接) 기반 추정(verify). ' + V),
  ...H('npc_aoluchi', '오로치', ['ch25_s10'], 'enemy', REF_MON, '13세기 말(?~?)', 'steppe(mongol_yuan)',
    `40대 중반 몽골 장수, 넓은 광대와 그을린 넓은 얼굴, 가늘고 날카로운 눈, 짙은 콧수염이 입가로 처지고 턱에 짧은 수염, 다부진 어깨. ${YUAN13}. 가장자리에 짙은 회색 늑대털 테를 두른 둥근 짙은 갈색 펠트 모자(꼭대기 작은 꼭지, 깃털·보석 없음), 그 아래 귀 뒤 땋은 머리 고리, 녹슨 적주황색 델 위에 짙은 갈색 가죽 미늘 찰갑과 어깨 미늘, 넓은 검은 가죽 허리띠. 오른손에 짧은 자루의 몽골식 전투 도끼를 가슴 앞에 비스듬히 쥠(도끼날은 어깨 높이, 프레임 안), 왼손은 허리띠 위. 칼·활·깃발·방패 없음`,
    '3차 몽골 측 장수(verify, 바익당 최후 불확실 — 표현 안 함). ' + V),
  ...H('npc_zhang_wenhu', '장원호', ['ch25_s7'], 'enemy', REF_MON, '13세기 말(?~?)', 'steppe(yuan, han chinese naval)',
    `50대 초반 원 군량선단 지휘관(한인 출신), 살집 있는 둥근 얼굴과 두툼한 볼, 회색이 섞인 짧은 콧수염과 짧은 턱수염, 계산 빠르고 피곤한 눈, 넉넉한 체격. ${HANYUAN}. 머리에 검은 비단 복두형 두건(뒤로 짧은 끈 두 가닥, 장식 없음), 짙은 올리브 갈색(국방색) 비단 전포 위에 갈색 가죽 흉갑(장식 없음), 넓은 짙은 갈색 허리띠. 오른손으로 칼집에 든 곧은 칼을 몸 앞에 세워 쥠(칼은 이것 하나, 프레임 안), 왼손은 허리띠 위. 깃발·방패·장부·창 없음`,
    '군량선단 지휘, 번돈 피해 후 퇴각(accepted). 한인 출신은 이름(張文虎) 기반 추정(verify). ' + V),
};
Object.assign(P_NPC_STORY, P_CH25B);

// ---- 시트 계획(7명). [code, troop, 시트 문화권 폴백, 등장] — 외형 = 정식 초상 + 초상 설명(P_CH25B / P_CH25) ----
const ONE = '무기는 정확히 1개만 든다(두 무기 동시 소지·허리 칼 추가 금지): 초상화에 든 무기·소지품이 있으면 그것 하나를, 없으면 ';
const WEAPON = {
  naval: `${ONE}짧은 칼을 오른손에 듦. 초상화 허리에 다른 칼자루가 보여도 시트에는 그리지 않음`,
  healer: '무기 없는 지휘관·성직자·책사: 초상의 소지품(지팡이) 하나를 몸 앞에 듦, 칼·창 추가 금지',
};
const NAVAL_READ = '가독성: 이 스프라이트는 배 위에 서서 하반신이 뱃전에 가려지므로, 머리 장비 실루엣·상체 색·무기 끝이 칸의 위쪽 절반에서 또렷하게 보여야 한다. 무기 끝은 머리 높이 근처에 두고, 상체는 큰 색면으로';
const LIST = [
  ['npc_tran_thanh_tong', 'healer', 'china', 'ch25_open·end 컷신(이름표)'],
  ['npc_yet_kieu', 'naval', 'default', 'ch25_s9·s10 아군'],
  ['npc_tran_khanh_du', 'naval', 'default', 'ch25_s7·s9·s10 아군'],
  ['npc_fan_yi', 'naval', 'default', 'ch25_s9·s10 적'],
  ['npc_aoluchi', 'naval', 'default', 'ch25_s10 적'],
  ['npc_zhang_wenhu', 'naval', 'default', 'ch25_s7 적'],
  ['npc_omar', 'naval', 'default', 'ch25_s2·s10 적 지휘'],
];
export async function plan() {
  const { P_CH25 } = await import('./ch25_portraits_style.mjs');
  const items = {};
  for (const [c, troop, culture, used] of LIST) {
    const d = P_CH25B[c] ?? P_CH25[c]; const naval = troop === 'naval';
    const layout = troop === 'healer' ? 'dir64_healer' : 'dir64_sword';
    items[c] = { name: d.name, troop, layout, layoutRef: `docker/gemini/hero_dir_refs/${layout}.jpg`, mounted: false, culture, used_in: used, side: d.side,
      portrait: P_CH25B[c] ? `${OUT_P}/${c}.png` : `public/assets/portraits/npc/${c}.png`, portrait_new: !!P_CH25B[c],
      desc: `${String(d.desc).replace(/\s+/g, ' ').trim()}. ${WEAPON[troop]}`, naval_read: naval ? NAVAL_READ : null,
      back: '머리 모양·머리 장비 뒷면과 겉옷 등판, 소지품은 정면과 같은 손·같은 각도', side_view: '무기·소지품을 몸 앞에 같은 각도로 듦, 머리 장비 옆선',
      forbid: '깃발, 문장, 글자, 초상에 없는 큰 방패 추가, 말, 배(배는 게임이 따로 겹침)', fallback: naval ? 'unit.default.naval.enemy.64.sheet' : 'unit.china.healer.enemy.64.sheet',
      verify: d.verify, desc_src: P_CH25B[c] ? 'npc_ch25b_style.mjs#P_CH25B' : 'ch25_portraits_style.mjs#P_CH25' };
  }
  return items;
}
export const QA_SHEET = ['192x256(3x4, 64px), 1px 외곽선, 32색 이하', '초상화와 머리 장비·주색·소지품 일치', '9칸 무기 일관·누락 없음(무기 1개)', '측면 행 좌향 프로필', '알파 0/255, 마젠타 잔여 없음', '64px 1배에서 머리 실루엣·상체 색 식별(수군은 배 오버레이 위 상체 가독성)', '적 시트 파랑→빨강 스왑 후 색 확인'];
