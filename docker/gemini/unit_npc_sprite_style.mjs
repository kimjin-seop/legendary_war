// ===== NPC 전용 전투 스프라이트(아군 NPC·적 지휘관) — 작업 정의(안아트-스프라이트 2026-11-02) =====
// 공통 스타일 상수는 style_guide.mjs(단일 출처). 시트 규칙·프롬프트 골격은 hero_v4_gen.mjs / npc_naval_style.mjs 와 같다(결과 규격 동일: 192x256, 3x4, 32색, 1px 외곽선).
// 다른 안아트 인스턴스와 충돌 방지용 별도 모듈. 출력: raw = docker/gemini/unit_npc_sprite/raw/<code>.jpg, 로그 = docker/gemini/unit_npc_sprite/calls_log.jsonl
// 규칙: 작품명·작가명·기존 캐릭터명 금지, 스타일 묘사어만. 실존 인물은 초상·사진 기반 얼굴 재현이 아니라 시대 복식 중심 일반화.
//       가문 문장·투구 앞장식·깃발·글자·종교 상징·노출 금지. 외형 단일 출처 = 초상 담당이 만든 정식 초상(portrait_campaign raw/out) — 스프라이트는 초상과 머리 장비·색·소지품을 맞춘다.
import { PIXEL64_STYLE, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';

export const DIR = 'docker/gemini/unit_npc_sprite';
export const RAW = `${DIR}/raw`;
const LAYOUT = {
  sword: 'docker/gemini/hero_dir_refs/dir64_korea_sword.jpg', // 조선·명 보병 지휘관(검·창·지휘봉): 조선 보병 3x3 견본(측면 좌향 보정본)
  cavalry: 'docker/gemini/hero_dir_refs/dir64_cavalry.jpg',   // 기마 지휘관: 기마 3x3 견본(말+기수 한 캐릭터)
};
// 초상 참조: 알파 처리본(out) 우선, 없으면 마젠타 raw
const portraitRef = (code) => [`docker/gemini/portrait_campaign/out/${code}.png`, `public/assets/portraits/npc/${code}.png`, `docker/gemini/portrait_campaign/raw/portrait_${code}.jpg`];

const NO_SYMBOL = '가문 문장·투구 앞장식(뿔·초승달·큰 장식판)·깃발·글자·한자·숫자·종교 상징 없음, 노출 없음';
export const SHEET_RULE3 =
  '정확히 3열x3행(9칸) 균등 격자, 한 칸에 캐릭터 1프레임(전신, 발까지), 격자선·칸 테두리·글자 없음, 칸 사이 여백 충분(닿지 않음). ' +
  '행 순서(위→아래): 1행 정면(아래를 향함), 2행 세 칸 모두 화면 왼쪽을 향한 완전한 옆모습(프로필: 얼굴 옆선·코끝·눈 1개만, 몸통·발끝·얼굴 모두 왼쪽. 3/4 각도·정면·오른쪽을 보는 칸 절대 금지), 3행 뒷모습(위를 향함, 얼굴 안 보임, 머리·모자 형태는 정면과 동일). ' +
  '열 순서: 왼발 내딛음(walk1), 서 있음(idle), 오른발 내딛음(walk2) — 걷기 프레임은 다리·팔 끝만 조금 다르고 몸통·머리·소품 위치는 거의 동일. ' +
  '9칸 모두 같은 캐릭터·같은 크기: 머리끝~발끝이 칸 높이의 85%로 크게, 같은 발 기준선, 칸 가로 중앙 정렬, 무기·소품은 칸 밖으로 나가지 않게 몸 가까이. ' +
  '무기·소지품 일관성: 9칸 모두 같은 무기·소지품을 같은 손에, 같은 길이·같은 각도로 든다. 정면 행에도 반드시 보인다(몸 뒤로 숨기지 않음). 측면 행 가운데(idle) 칸과 뒷모습 걷기 칸에서도 무기가 빠지지 않는다. 무기 개수는 칸마다 같음, 복제 금지.';
const SHEET_LEAD = '첫 번째 참조 이미지는 3x3 방향 걷기 도트 시트 견본이다. 견본에서는 칸 배치·도트 1개의 크기·2.5등신 비율·외곽선 두께만 따른다. 견본 인물의 얼굴·머리·모자·옷·무기·성별·나이는 절대 따르지 않는다.\n';
const JOSEON = '16세기 말 조선 무관 복식 일반화(일본 갑옷·청대 복식 금지)';
const MING = '16세기 말 명나라 무관 복식 일반화(청대 복식·변발·일본 갑옷 금지)';

// 시범 4명(초상: portrait_npc_v3_style_low.mjs 정의, 초상 담당 raw 2026-11-02). 64px 에서 서로 구분되도록 머리 실루엣·주색을 분리:
//   원균 = 둥근 쇠 투구+짙은 청색 / 정운 = 챙 넓은 검은 전립+붉은 철릭+창 / 이여송 = 금테 투구+붉은 갑옷+기마 / 진린 = 검은 사모형 관모+녹색+은 미늘
export const NPC = {
  npc_won_gyun: { name: '원균', side: 'ally', culture: 'korea', troop: 'naval', layout: 'sword',
    sprite: `${JOSEON}. 50대 장수, 넓은 얼굴, 짧은 검은 턱수염. 둥근 쇠 투구(꼭대기 짧은 붉은 술, 귀·목을 덮는 짙은 청색 천 드림), 짙은 청색 두정갑(쇠못 박힌 천 갑옷)과 회색 철판 어깨 가리개, 갈색 허리띠. 오른손에 곧은 환도를 칼끝 아래로 쥠`,
    back: '둥근 투구와 청색 목 드림, 청색 갑옷 등판, 칼끝이 몸 옆 아래로', side: '환도를 몸 앞에 칼끝 아래로, 투구 목 드림', forbid: '창, 활, 말, 방패, 붉은 갑옷', fallback: 'unit.korea.sword.ally.64.sheet', verify: '용모 일반화. 두정갑 색(청색)은 초상 기준' },
  npc_jeong_un: { name: '정운', side: 'ally', culture: 'korea', troop: 'naval', layout: 'sword',
    sprite: `${JOSEON}. 40대 선봉 장수, 강직한 얼굴, 짧은 콧수염과 턱수염. 챙이 넓은 검은 전립(꼭대기 작은 붉은 술, 턱끈), 붉은 철릭(긴 군복) 위에 갈색 가죽 찰갑 조끼, 남색 허리띠. 오른손에 긴 창을 세워 쥠(창날은 머리 위, 창날 아래 붉은 술)`,
    back: '전립의 넓은 챙과 붉은 술, 붉은 철릭 등판, 창대가 몸 옆에 세로로', side: '창을 몸 앞에 세워 쥠, 전립 챙 옆선', forbid: '투구, 칼 뽑기, 활, 말, 방패', fallback: 'unit.korea.spear.ally.64.sheet', verify: '붉은 철릭은 roster appearance 근거' },
  npc_i_yeoseong: { name: '이여송', side: 'ally', culture: 'china', troop: 'cavalry', layout: 'cavalry', mounted: true,
    sprite: `${MING}. 짙은 갈색 말을 탄 40대 명군 제독(말과 기수가 한 캐릭터, 말 전체가 칸 안에). 짧은 검은 턱수염. 금빛 테를 두른 둥근 쇠 투구(꼭대기 붉은 술, 붉은 천 목 드림), 붉은 면갑(금빛 못), 금빛 어깨 장식, 붉은 망토. 오른손에 지휘용 짧은 쇠 채찍(편)을 듦. 말: 짙은 갈색 몸, 검은 갈기, 붉은 안장 천`,
    back: '말 엉덩이와 검은 꼬리, 기수의 투구 붉은 술과 붉은 망토', side: '말이 왼쪽을 향해 걷고 기수는 쇠 채찍을 몸 앞에 듦', forbid: '깃발, 창, 활, 칼 뽑기, 보병(말 없는 모습)', fallback: 'unit.china.cavalry.ally.64.sheet', verify: '지휘 깃발은 깃발 금지 규칙으로 생략(초상과 동일)' },
  npc_jin_rin: { name: '진린', side: 'ally', culture: 'china', troop: 'naval', layout: 'sword',
    sprite: `${MING}. 50대 수군 도독, 날카로운 얼굴, 길게 늘어진 검은 콧수염과 뾰족한 턱수염. 검은 칠 관모(사모형, 둥근 윗부분), 짙은 녹색 관복 위에 은회색 쇠미늘 흉갑, 짙은 청색 짧은 망토, 금빛 허리띠. 오른손에 칼집에 든 곧은 칼을 칼자루 위로 쥠`,
    back: '검은 관모 뒷면, 짙은 청색 망토와 녹색 옷자락, 칼집 끝이 몸 옆으로', side: '칼집째 든 칼을 몸 앞에, 긴 콧수염 옆선', forbid: '투구, 창, 활, 말, 깃발', fallback: 'unit.china.sword.ally.64.sheet', verify: '용모 일반화' },
};

// 오리지널 메인 스토리 2막 아군 NPC 3종(안아트 2026-11-03, 초상 portrait_npc_story_style.mjs P_NPC_STORY 기준). 무기 없는 민간인 — 소지품을 무기 자리 규칙(9칸 일관)에 대입.
//   봉군 = 검은 패랭이+쪽빛 겉옷+횃불 / 사공 = 흰 머리띠+누런 저고리·갈색 배자+긴 상앗대 / 돌 아주머니 = 흰 머릿수건+흰 저고리·흙빛 치마+돌 든 덧치마
const JOSEON_CIV = '16세기 말 조선 평민 복식 일반화(일본·중국 복식 금지)';
Object.assign(NPC, {
  npc_bonggun: { name: '봉군', side: 'ally', culture: 'korea', troop: 'sword', layout: 'sword',
    sprite: `${JOSEON_CIV}. 40대 후반 남성, 짧은 검은 턱수염. 둥근 챙의 검은 패랭이(대나무 갓, 턱끈), 무릎 아래까지 오는 짙은 쪽빛 무명 겉옷, 흰 깃, 짚 새끼줄 허리끈, 흰 바지와 짚신. 오른손에 짧은 횃불(끝에 작은 주황 불꽃)을 세워 듦, 왼쪽 어깨 뒤에 묶은 섶나무 다발`,
    back: '검은 패랭이 둥근 챙, 쪽빛 겉옷 등판, 어깨 뒤 섶나무 다발이 크게 보임', side: '횃불을 몸 앞에 세워 듦, 패랭이 챙 옆선', forbid: '칼, 창, 활, 방패, 투구, 연기', fallback: 'unit.korea.sword.ally.64.sheet', verify: '봉수군 복식 일반화(verify)' },
  npc_sagong: { name: '사공', side: 'ally', culture: 'korea', troop: 'naval', layout: 'sword',
    sprite: `${JOSEON_CIV}. 50대 초반 남성, 그을린 넓은 얼굴, 짧고 희끗한 턱수염. 상투에 흰 무명 머리띠(뒤로 짧은 끈), 소매를 걷은 누런빛 저고리 위 짙은 갈색 배자(소매 없는 조끼), 짙은 감색 허리띠, 흰 바지와 짚신. 오른손으로 몸 키보다 조금 긴 나무 상앗대(둥근 장대)를 세워 쥠`,
    back: '흰 머리띠 매듭과 상투, 갈색 배자 등판, 상앗대가 몸 옆에 세로로', side: '상앗대를 몸 앞에 세워 쥠, 흰 머리띠 옆선', forbid: '칼, 창, 활, 방패, 투구, 배', fallback: 'unit.korea.sword.ally.64.sheet', verify: '당항포 사공 복식 일반화(verify)' },
  npc_dol_ajumeoni: { name: '돌 아주머니', side: 'ally', culture: 'korea', troop: 'sword', layout: 'sword',
    sprite: `${JOSEON_CIV}. 40대 중반 성인 여성, 다부진 체격. 쪽진 검은 머리 위 흰 무명 머릿수건, 소매를 걷은 흰 무명 저고리(허리를 덮는 기장), 발목까지 오는 흙빛 황갈색 치마, 그 위 상아색 덧치마. 왼팔로 덧치마 앞자락을 걷어 안았고 그 안에 회색 돌 몇 개, 오른손에 회색 돌 하나를 쥠`,
    back: '흰 머릿수건 매듭과 쪽진 머리, 흰 저고리 등판, 넓게 퍼진 황갈색 치마', side: '돌 든 덧치마를 몸 앞에 안음, 머릿수건 옆선', forbid: '칼, 창, 활, 방패, 투구, 남성 체형', fallback: 'unit.korea.sword.ally.64.sheet', verify: '산성 치마 돌 나르기 전승(verify)' },
});

// ===== 후속(안아트 2026-11-03): 메인 스토리 NPC 12종 + 맵 오브젝트(짐수레·나룻배 노꾼). 초상 = portrait_npc_story_style.mjs P_NPC_STORY(정식 초상과 머리·주색·소지품 일치).
//   색·실루엣 축(64px 구분): 짐꾼 = 검은 망건 띠+황토 저고리+지게 / 마부 = 녹색 두건 망토+갈색 튜닉+채찍 / 보병 = 넓은 챙 쇠 모자+누빈 황갈 갬비슨+빌훅 / 뱃사공 = 갈색 펠트 챙모자+흰 수염+회청 튜닉+긴 노
//   쪽이 = 잿빛 머리+양피지색 후드 외투+빈 종이 / 성당 일꾼 = 흰 머릿수건+적갈 드레스+베이지 앞치마+빗자루 / 길잡이 = 모래색 머리 천+흙갈 망토+매듭 끈 / 대상 상인 = 흰 터번+남청 겉옷+사프란 띠+두루마리
//   양치기 어른 = 짙은 갈색 머리쓰개+회갈 털 망토+갈고리 지팡이 / 지음 = 밤색 단발+안경+청회 코트+두루마리 지도 / 붉은 펜 = 흑발+차콜 제복+진홍 띠+붉은 깃펜 / 교정관 = 회백 쪽머리+슬레이트 회색 정복·어깨 망토+장부
const FR15 = '15세기 초(1429) 프랑스 평민 복식 일반화(17세기 이후 복식·판금 전신갑 금지, 백합 문장·십자가 없음)';
const SYR12 = '12세기 말 시리아 사막 대상로 민간인 복식 일반화(오스만 복식·현대 체크무늬 두건 금지)';
const ARCH = '시대·문화권이 없는 서고 직원 복식(어느 나라 군복·제복도 아님)';
Object.assign(NPC, {
  npc_jimkkun: { name: '짐꾼', side: 'ally', culture: 'korea', troop: 'sword', layout: 'sword',
    sprite: `${JOSEON_CIV}. 30대 중반 마른 남성, 짧고 성긴 콧수염. 쓰개 없는 맨상투에 이마를 두른 검은 망건 띠, 바랜 황토색 무명 저고리(허리를 덮는 기장), 흰 바지와 무릎 아래 흰 행전, 짚신. 등에 나무 지게(A자 틀)를 메고 그 위에 불룩한 연갈색 삼베 자루 하나(입구로 마른 녹색 쑥 잎이 조금). 오른손에 위 끝이 Y자로 갈라진 긴 지게 작대기를 세워 쥠`,
    back: '나무 지게 틀과 삼베 자루가 등 전체를 덮어 크게 보임, 상투, 작대기가 몸 옆에 세로로', side: '지게와 자루가 등 뒤로 튀어나온 옆선, 작대기를 몸 앞에 세워 쥠', forbid: '칼, 창, 활, 방패, 갓, 투구', fallback: 'unit.korea.sword.ally.64.sheet', verify: '보급로 짐꾼 복식 일반화(verify)' },
  npc_mabu: { name: '마부', side: 'ally', culture: 'europe', troop: 'sword', layout: 'sword',
    sprite: `${FR15}. 30대 초반 남성, 둥근 얼굴, 붉은 볼, 짧은 밤색 턱수염. 머리에 쓴 짙은 녹색 양모 두건(어깨를 덮는 짧은 망토와 한 몸, 얼굴은 드러남), 진흙 얼룩 있는 갈색 양모 튜닉(무릎 길이), 가죽 허리띠와 작은 주머니, 짙은 갈색 호즈와 가죽 신. 오른손에 짧은 나무 손잡이 말채찍(가죽 끈이 아래로 늘어짐), 왼손에 가죽 고삐 한 가닥을 감아 쥠`,
    back: '녹색 두건과 어깨 망토 뒷면, 갈색 튜닉 등판, 채찍 끈이 몸 옆으로', side: '녹색 두건 옆선, 채찍을 몸 앞에 듦', forbid: '칼, 창, 활, 방패, 투구, 말', fallback: 'unit.europe.sword.ally.64.sheet', verify: '오를레앙 보급 행렬 마부 복식 일반화(verify)' },
  npc_bobyeong: { name: '보병', side: 'ally', culture: 'europe', troop: 'sword', layout: 'sword',
    sprite: `${FR15}. 20대 후반 야윈 남성, 짧은 수염. 둥글고 넓은 챙이 달린 은회색 쇠 모자(케틀 햇, 턱끈, 무늬 없음), 목에 쇠사슬 깃과 짙은 갈색 두건 망토, 진흙 튄 가로로 누빈 황갈색 천 갑옷(갬비슨, 허벅지까지), 가죽 허리띠, 갈색 호즈와 가죽 신. 오른손으로 긴 나무 자루 끝에 갈고리 진 넓은 쇠날이 달린 장병기(빌훅)를 세워 쥠(날은 머리 위)`,
    back: '넓은 챙 쇠 모자 뒷면, 갈색 두건 망토, 누빈 황갈 갑옷 등판, 장병기 자루가 몸 옆에 세로로', side: '쇠 모자 넓은 챙 옆선, 장병기를 몸 앞에 세워 쥠', forbid: '방패, 깃발, 문장, 판금 갑옷, 활, 말', fallback: 'unit.europe.sword.ally.64.sheet', verify: '15세기 프랑스 민병 장비 일반화(verify)' },
  npc_baetsagong: { name: '뱃사공', side: 'ally', culture: 'europe', troop: 'naval', layout: 'sword',
    sprite: `${FR15}. 50대 후반 마른 남성, 덥수룩한 흰 턱수염과 콧수염. 챙이 넓고 가장자리가 처진 바랜 갈색 펠트 모자, 어깨를 덮는 짙은 갈색 두건 망토, 소매를 걷은 흰 리넨 셔츠 위 회청색 양모 튜닉, 굵은 삼 끈 허리띠, 갈색 호즈. 오른손으로 몸 키보다 긴 나무 노(아래 끝이 넓적한 노깃)를 세워 쥠`,
    back: '처진 갈색 펠트 모자 챙, 갈색 두건 망토, 회청색 튜닉 등판, 노가 몸 옆에 세로로', side: '펠트 모자 처진 챙과 흰 수염 옆선, 노를 몸 앞에 세워 쥠', forbid: '칼, 창, 활, 방패, 투구, 배', fallback: 'unit.default.naval.ally.64.sheet', verify: '루아르 나루 뱃사공 복식 일반화(verify)' },
  npc_jjogi: { name: '쪽이', side: 'ally', culture: 'default', troop: 'sword', layout: 'sword',
    sprite: `${ARCH}. 겉보기 20세 전후 성인(앳된 아이 체형 금지), 성별이 드러나지 않는 중성적 얼굴, 호박색 눈. 어깨에 닿는 헝클어진 연한 잿빛 갈색 머리. 무릎 아래까지 오는 해진 바랜 양피지색(누런 크림) 후드 긴 외투(후드는 등 뒤로 내림, 끝자락이 찢긴 종이처럼 들쭉날쭉), 안에 흰 셔츠, 짙은 갈색 바지와 신. 두 손으로 빈 낱장 종이 서너 장(흰색, 글자 없음)을 가슴 앞에 쥠`,
    back: '잿빛 갈색 머리와 등에 내린 후드, 양피지색 외투 등판의 들쭉날쭉한 끝자락', side: '외투 끝자락 옆선, 종이를 가슴 앞에 쥠', forbid: '칼, 창, 활, 방패, 투구, 글자', fallback: 'unit.default.sword.ally.64.sheet', verify: '오리지널 허구, 외형 제안값' },
  npc_ilkkun: { name: '성당 일꾼', side: 'ally', culture: 'europe', troop: 'sword', layout: 'sword',
    sprite: `${FR15}. 30세 전후 성인 여성. 밤색 머리를 뒤로 묶고 흰 리넨 머릿수건(뒤에서 매듭, 수녀 두건 아님), 소매를 걷은 짙은 적갈색 양모 긴 드레스(발목까지), 그 위 연베이지 삼베 앞치마. 두 손으로 짚을 묶은 긴 나무 자루 빗자루를 몸 앞에 비스듬히 세워 쥠(짚 끝은 아래)`,
    back: '흰 머릿수건 매듭과 묶은 밤색 머리, 적갈색 드레스 등판과 앞치마 끈, 빗자루 자루가 몸 옆으로', side: '머릿수건 옆선, 빗자루를 몸 앞에 비스듬히', forbid: '칼, 창, 활, 방패, 투구, 종교 표지, 남성 체형', fallback: 'unit.europe.sword.ally.64.sheet', verify: '오리지널 허구, 외형 제안값' },
  npc_gilzabi: { name: '길잡이', side: 'ally', culture: 'middle_east', troop: 'sword', layout: 'sword',
    sprite: `${SYR12}. 50대 중반 남성, 그을린 얼굴, 짧은 회색 섞인 검은 턱수염. 머리와 목을 느슨하게 감싼 바랜 모래색 머리 천(끝자락이 어깨로), 발목까지 오는 바랜 흰빛 긴 옷 위 앞이 트인 흙갈색 양모 겉망토, 가죽 허리띠, 가죽 샌들. 오른손에 매듭을 여러 개 지은 굵은 갈색 끈 다발을 가슴 높이로 듦, 왼쪽 허리에 작은 가죽 물주머니`,
    back: '모래색 머리 천 뒷면과 늘어진 끝자락, 흙갈색 망토 등판', side: '머리 천 옆선, 매듭 끈을 몸 앞에 듦', forbid: '칼, 창, 활, 방패, 투구, 지팡이, 체크무늬', fallback: 'unit.middle_east.sword.ally.64.sheet', verify: '12세기 대상로 길잡이 복식 일반화(verify)' },
  npc_sangin: { name: '대상 상인', side: 'ally', culture: 'middle_east', troop: 'sword', layout: 'sword',
    sprite: `${SYR12}. 40대 초반 남성, 둥근 얼굴, 짧은 검은 턱수염. 적당한 크기의 흰 무명 터번(장식 없음), 발목까지 오는 짙은 남청색 긴 겉옷(보라 기운 없음), 허리에 넓게 두른 사프란빛 노란 천 띠와 작은 가죽 주머니, 가죽 샌들. 오른손에 끈으로 묶은 상아색 말린 두루마리 하나를 가슴 앞에 쥠(글자 없음)`,
    back: '흰 터번 뒷면, 남청색 겉옷 등판과 노란 띠', side: '흰 터번 옆선, 두루마리를 가슴 앞에', forbid: '칼, 창, 활, 방패, 투구, 보석 장식', fallback: 'unit.middle_east.sword.ally.64.sheet', verify: '12세기 대상 상인 복식 일반화(verify)' },
  npc_yumokmin: { name: '양치기 무리 어른', side: 'ally', culture: 'middle_east', troop: 'sword', layout: 'sword',
    sprite: `${SYR12}. 60대 성인 여성, 그을린 깊은 주름 얼굴. 머리와 어깨를 덮는 짙은 갈색 양모 머리쓰개(얼굴은 드러남, 이마에 흰머리 몇 가닥), 짙은 쪽빛 긴 옷(발목까지) 위에 염소털로 짠 거친 짙은 회갈색 겉망토(무릎 아래까지). 오른손에 위 끝이 갈고리처럼 굽은 긴 나무 양치기 지팡이를 세워 짚음(갈고리는 머리 위)`,
    back: '갈색 머리쓰개가 어깨까지 덮음, 넓은 회갈색 털 망토 등판, 지팡이가 몸 옆에 세로로', side: '머리쓰개 옆선, 갈고리 지팡이를 몸 앞에 세워 짚음', forbid: '칼, 창, 활, 방패, 투구, 남성 체형, 수염', fallback: 'unit.middle_east.sword.ally.64.sheet', verify: '오리지널 허구, 성별 제안값(확정 필요)' },
  npc_jieum: { name: '지음', side: 'ally', culture: 'default', troop: 'sword', layout: 'sword',
    sprite: `${ARCH}. 30세 전후 성인 여성. 턱선에서 반듯하게 자른 짙은 밤색 단발(앞머리 없이 한쪽 가르마), 가는 은테 둥근 안경. 무릎까지 오는 짙은 청회색(슬레이트 블루그레이) 긴 사무 코트(높은 세운 깃, 앞단추를 끝까지 잠금, 가장자리 가는 놋쇠색 테), 두 팔뚝에 검은 천 토시, 가는 검은 허리띠, 짙은 회색 바지와 검은 신. 왼팔에 끈으로 묶은 짙은 황토색 두루마리 지도 하나를 가슴 앞으로 안음, 오른손에 작은 놋쇠 제도용 디바이더(컴퍼스)를 듦`,
    back: '밤색 단발 뒷머리, 청회색 코트 등판, 두루마리 끝이 몸 옆으로', side: '단발과 안경 옆선, 두루마리를 가슴 앞에 안음', forbid: '칼, 창, 활, 방패, 투구, 견장, 모노클, 청록색 장신구', fallback: 'unit.default.sword.ally.64.sheet', verify: '오리지널 허구, 외형 제안값' },
  npc_red_pen: { name: '붉은 펜의 사자', side: 'enemy', culture: 'default', troop: 'mage', layout: 'sword',
    sprite: `${ARCH}. 40대 초반 마르고 키 큰 남성, 수염 없음, 뒤로 빗어 넘긴 짧은 흑발(관자놀이 희끗). 무릎 아래까지 오는 높은 세운 깃의 차콜 검정 긴 제복 코트(이중 여밈), 깃·소매 끝·앞섶에 진홍색 테, 오른쪽 어깨에서 왼쪽 허리로 맨 넓은 진홍색 띠(무늬 없음), 흰 장갑, 검은 바지와 검은 장화. 오른손에 깃이 붉은 긴 깃펜을 가슴 높이로 세워 듦, 왼손 위에 작은 놋쇠 직인`,
    back: '뒤로 넘긴 흑발, 차콜 검정 코트 등판과 진홍 띠가 비스듬히 지나감', side: '세운 깃과 깃펜 옆선, 깃펜을 몸 앞에 듦', forbid: '칼, 창, 활, 방패, 투구, 괴물화, 망토', fallback: 'unit.default.mage.ally.64.sheet', verify: '오리지널 허구, 외형 제안값' },
  npc_gyojeong: { name: '교정관', side: 'neutral', culture: 'default', troop: 'mage', layout: 'sword',
    sprite: `${ARCH}. 50대 중반 성인 여성, 단정한 얼굴, 안경 없음. 따뜻한 회백색 머리를 뒤로 빗어 낮게 쪽짐. 목까지 여민 높은 세운 깃의 짙은 슬레이트 회색 긴 정복(발목까지), 양어깨를 덮는 짧은 같은 색 어깨 망토(가장자리 가는 은회색 테), 회색 장갑, 왼쪽 깃에 아주 작은 붉은 핀 하나. 두 손으로 두꺼운 회색 가죽 장부 한 권을 가슴 앞에 안음(글자 없음)`,
    back: '회백색 쪽진 머리, 어깨 망토와 긴 회색 정복 등판', side: '쪽진 머리와 세운 깃 옆선, 장부를 가슴 앞에 안음', forbid: '칼, 창, 활, 방패, 투구, 진홍 띠, 안경', fallback: 'unit.default.mage.ally.64.sheet', verify: '오리지널 허구, 외형 제안값. 유닛 아님(음성·대면 전용) — 예비 시트' },
  // 나룻배 NPC(npc_boat_2, 수병 naval): 배 자체는 엔진의 ship_overlay(culture 없음 → default 거룻배) back/front 가 그린다. 이 시트는 배 위에 서는 '노꾼' 몸통.
  npc_boat_2: { name: '나룻배(노꾼)', side: 'ally', culture: 'default', troop: 'naval', layout: 'sword', noPortrait: true,
    sprite: `${FR15}. 20대 초반 젊은 남성 노꾼, 수염 없음, 짧은 곱슬 밤색 머리. 머리에 짧게 동여맨 바랜 붉은 갈색(벽돌색) 천 두건, 소매를 걷은 생베색 리넨 셔츠, 그 위 짙은 녹갈색 소매 없는 가죽 조끼, 갈색 끈 허리띠, 회갈색 호즈. 오른손으로 몸 키만 한 짧은 나무 노(끝이 넓적한 노깃)를 세워 쥠`,
    back: '벽돌색 두건 매듭, 녹갈색 조끼 등판, 노가 몸 옆에 세로로', side: '두건 옆선, 노를 몸 앞에 세워 쥠', forbid: '칼, 창, 활, 방패, 투구, 배, 펠트 모자, 흰 수염', fallback: 'unit.default.naval.ally.64.sheet', verify: '오리지널 허구(3-3 두 번째 나룻배). 배는 ship_overlay default' },
});
// 맵 오브젝트(사람 아님): 짐수레. heavy 병종 자리, 192x256 3x4 시트(행 = 수레가 향하는 방향, 열 = 바퀴 살 위치만 다른 굴러감 3프레임). 소·말 없이 수레만(끄는 짐꾼·마부는 별도 NPC 유닛)
const CART_SHEET_RULE = '정확히 3열x3행(9칸) 균등 격자, 한 칸에 수레 1대(바퀴 밑까지 전부), 격자선·칸 테두리·글자 없음, 칸 사이 여백 충분. ' +
  '행 순서(위→아래): 1행 정면(끌채가 화면 아래쪽·보는 사람 쪽을 향함, 두 바퀴가 좌우에 보임), 2행 세 칸 모두 화면 왼쪽으로 가는 완전한 옆모습(끌채 두 개가 왼쪽으로 뻗음, 바퀴 하나가 크게 보임), 3행 뒷모습(짐칸 뒤판이 보임, 끌채는 위쪽으로 숨음). ' +
  '열 순서: 굴러감 1, 멈춤, 굴러감 2 — 세 칸은 바퀴 살 각도만 조금 다르고 수레·짐 위치와 크기는 완전히 동일. ' +
  '9칸 모두 같은 수레·같은 크기·같은 짐: 수레가 칸 가로의 85%, 바퀴 밑이 같은 기준선, 칸 가로 중앙 정렬. 사람·소·말·그림자 없음';
const OBJ_LEAD = '첫 번째 참조 이미지는 3x3 방향 도트 시트 견본이다. 견본에서는 칸 배치·도트 1개의 크기·외곽선 두께·음영 방식만 따른다. 견본의 인물은 그리지 않는다(이 시트는 사람이 없는 사물).\n';
Object.assign(NPC, {
  npc_cart_front: { name: '짐수레(앞)', side: 'ally', culture: 'korea', troop: 'heavy', layout: 'sword', object: 'cart',
    sprite: '16세기 말 조선 두 바퀴 나무 짐수레(사람이 끌채를 잡고 끄는 손수레형, 소 없음): 짙은 갈색 나무 짐칸과 앞으로 뻗은 긴 끌채 두 개, 나무 살 바퀴 두 개(굵은 테, 쇠 장식 없음). 짐칸 위에 볏짚 거적으로 덮은 누런 곡식 가마니 두세 개와 연갈색 삼베 자루 하나, 굵은 새끼줄로 엮어 묶음',
    forbid: '사람, 소, 말, 깃발, 글자, 쇠 바퀴, 지붕, 덮개 수레', fallback: 'unit.korea.heavy.ally.64.sheet', verify: '조선 달구지 형태 일반화(verify). npc_cart_rear 와 같은 시트' },
  npc_cart_1: { name: '짐수레 1', side: 'ally', culture: 'europe', troop: 'heavy', layout: 'sword', object: 'cart',
    sprite: '15세기 초 프랑스 보급 행렬의 두 바퀴 나무 짐수레(말 없음): 밝은 회갈색 나무 짐칸(옆판에 세로 말뚝), 앞으로 뻗은 끌채 두 개, 큰 나무 살 바퀴 두 개(쇠 테두리). 짐칸 위에 짙은 갈색 나무 통 두 개와 밀가루 자루(흰 생베) 몇 개, 일부를 덮은 바랜 녹회색 아마포 덮개를 밧줄로 묶음',
    forbid: '사람, 소, 말, 깃발, 문장, 글자, 지붕 있는 마차', fallback: 'unit.europe.heavy.ally.64.sheet', verify: '15세기 짐수레 형태 일반화(verify). npc_cart_2 와 같은 시트' },
});
export const SAME_AS = { npc_cart_rear: 'npc_cart_front', npc_cart_2: 'npc_cart_1' }; // 같은 raw 를 쓰는 오브젝트 코드(호출 0, 게시 때 이름만 바꿔 복제)
NPC.npc_cart_rear = { ...NPC.npc_cart_front, name: '짐수레(뒤)', verify: '조선 달구지 형태 일반화(verify). npc_cart_front 와 같은 시트' };
NPC.npc_cart_2 = { ...NPC.npc_cart_1, name: '짐수레 2', verify: '15세기 짐수레 형태 일반화(verify). npc_cart_1 과 같은 시트' };

// ===== ch21(레그니차 1241)·ch22(파니파트 1526) 아군 NPC 4종(안아트 2026-11-03). 초상 = portrait_npc_story_style.mjs H5(정식 초상과 머리 장비·주색·소지품 일치).
//   소지품은 로스터 appearance(복합궁 등)가 아니라 정식 초상 기준(외형 단일 출처 = 초상). 바부르 에셋 코드 = 'babur'(초상 portrait.babur 와 같은 코드여야
//   assets.npcCode('npc_babur') 별칭이 초상·시트를 함께 찾는다. unit.npc.npc_babur 로 만들면 npcKnown 이 먼저 참이 되어 portrait.npc_babur(없음)를 찾게 됨).
//   64px 축: 카단 = 뾰족한 쇠 투구+적갈 델+검은 찰갑+뽑은 휜 칼(보병) / 바이다르 = 털 테 청회 모자+감청 델+강철 찰갑+기마(말채찍) / 알리 쿨리 = 흰 터번+남색 카프탄+갈색 가죽 앞치마+화승 막대 / 바부르 = 흰 터번+올리브녹색 겉옷+갈색 조끼+공책
const MONGOL13S = '13세기 중엽 몽골 장수 복식 일반화(오른쪽 여밈 긴 델, 넓은 허리띠, 끈으로 엮은 미늘 찰갑, 펠트 장화. 일본 갑옷·한국 전립·청대 변발 금지)';
const TURK16S = '16세기 초 중앙아시아·북인도 무장 복식 일반화(앞여밈 긴 겉옷, 허리 천 띠, 터번. 19세기 복식·예니체리 높은 모자·페즈 금지)';
Object.assign(NPC, {
  npc_kadan: { name: '카단', side: 'ally', culture: 'mongol', troop: 'archer', layout: 'sword',
    sprite: `${MONGOL13S}. 20대 후반 날렵한 젊은 장수, 가는 검은 콧수염만(턱수염 없음). 끝이 뾰족하게 솟은 짙은 강철색 쇠 투구(술·장식 없음, 귀와 목을 덮는 짙은 갈색 가죽 드림), 벽돌빛 짙은 적갈색 델(무릎 아래, 가는 금빛 테두리), 그 위 검게 칠한 미늘 찰갑 조끼와 어깨 미늘, 금빛 버클 넓은 갈색 가죽 허리띠, 검은 가죽 장화. 오른손에 칼집에서 뽑은 약간 휜 외날 칼을 칼끝이 아래로 비스듬히 향하게 쥠, 왼쪽 허리에 빈 칼집`,
    back: '뾰족한 투구와 갈색 목 드림, 검은 찰갑 등판 아래 적갈색 델 자락, 칼끝이 몸 옆 아래로', side: '뾰족한 투구 옆선, 휜 칼을 몸 앞에 칼끝 아래로', forbid: '활, 창, 말, 방패, 깃발, 털모자, 붉은 술', fallback: 'unit.china.archer.ally.64.sheet', verify: '생몰·용모 근거 없음(나이 제안값). 로스터 병종 archer 이나 초상 소지품(뽑은 휜 칼) 기준' },
  npc_baidar: { name: '바이다르', side: 'ally', culture: 'mongol', troop: 'cavalry', layout: 'cavalry', mounted: true,
    sprite: `${MONGOL13S}. 회갈색 초원 말을 탄 30대 중반 장수(말과 기수가 한 캐릭터, 말 전체가 칸 안에), 짧은 콧수염과 다듬은 턱수염. 위가 둥글게 솟고 가장자리에 짙은 갈색 털 테를 두른 짙은 청회색 펠트 모자(투구 아님), 짙은 감청색 델 위 짙은 강철 청회색 미늘 찰갑 조끼와 어깨 미늘, 짙은 갈색 허리띠와 허리의 칼집에 든 휜 칼. 오른손에 짧은 가죽 말채찍을 듦. 말: 회갈색(더운 잿빛 갈색) 몸, 짙은 갈기와 꼬리, 갈색 가죽 안장`,
    back: '말 엉덩이와 짙은 꼬리, 기수의 털 테 모자 뒷면과 감청 델 등판', side: '말이 왼쪽을 향해 걷고 기수는 채찍을 몸 앞에 듦, 털 테 모자 옆선', forbid: '깃발, 창, 활, 칼 뽑기, 쇠 투구, 붉은 옷, 보병(말 없는 모습)', fallback: 'unit.china.cavalry.ally.64.sheet', verify: '생몰·용모 근거 없음(나이 제안값). 말 색은 제안값' },
  npc_ustad_ali_quli: { name: '우스타드 알리 쿨리', side: 'ally', culture: 'middle_east', troop: 'archer', layout: 'sword',
    sprite: `16세기 초 오스만 출신 포병 기술자 복식 일반화(예니체리 높은 모자·페즈 금지). 40대 후반 다부진 남성, 회색 섞인 짧은 검은 턱수염과 아래로 처진 콧수염. 위가 조금 보이는 낮은 짙은 붉은 모자를 감싼 흰 무명 터번(장식 없음), 무릎 아래까지 오는 짙은 남색 카프탄, 허리에 감은 회갈색 천 띠, 가슴부터 무릎까지 덮는 그을음 묻은 갈색 가죽 앞치마, 허리에 작은 놋쇠 화약 통. 오른손으로 몸 키만 한 나무 화승 막대를 세워 쥠(위 끝에 꼰 화승과 아주 작은 주황 불씨, 연기 없음)`,
    back: '흰 터번 뒷면, 남색 카프탄 등판과 앞치마 끈, 화승 막대가 몸 옆에 세로로', side: '흰 터번 옆선, 갈색 앞치마, 화승 막대를 몸 앞에 세워 쥠', forbid: '칼, 총, 대포, 활, 방패, 연기, 높은 흰 모자', fallback: 'unit.middle_east.archer.ally.64.sheet', verify: '오스만 출신 포병 복식 일반화(verify). 용모 근거 없음' },
  babur: { name: '바부르', side: 'ally', culture: 'middle_east', troop: 'archer', layout: 'sword',
    sprite: `${TURK16S}. 40대 초반 마르고 단단한 장수 군주, 짧은 콧수염과 짧게 다듬은 검은 턱수염. 짙은 펠트 모자를 감싼 흰 터번(끝자락이 뒤로 짧게 늘어짐), 무릎 아래까지 오는 짙은 올리브녹색 긴 겉옷(가는 금빛 테두리), 그 위 갈색 가죽 조끼형 흉갑, 갈색 가죽 허리띠에 칼집째 찬 휜 칼(왼쪽 허리), 갈색 장화. 왼손에 작은 갈색 가죽 공책 한 권을 가슴 앞에 쥠(글자 없음)`,
    back: '흰 터번과 뒤로 늘어진 끝자락, 올리브녹색 겉옷 등판과 갈색 조끼, 칼집 끝이 몸 옆으로', side: '흰 터번 옆선, 공책을 가슴 앞에 쥠, 허리 칼집', forbid: '활, 창, 말, 방패, 칼 뽑기, 붉은 옷, 보석 장식', fallback: 'unit.middle_east.archer.ally.64.sheet', verify: '용모 일반화(verify). 로스터 코드 npc_babur → 에셋 코드 babur(assets.js NPC_ASSET_ALIAS)' },
});
// 뒤 수레(npc_cart_rear) 짐 변형: 같은 조선 손수레 틀(앞 수레 raw 를 구조 참조로)에 짐만 다르게 — 앞 = 누런 볏짚 가마니+삼베 자루 / 뒤 = 쪽빛 천 덮개+장작 다발+옹기 항아리
NPC.npc_cart_rear = { ...NPC.npc_cart_front, name: '짐수레(뒤)', structRef: 'docker/gemini/unit_npc_sprite/raw/npc_cart_front.jpg',
  sprite: '16세기 말 조선 두 바퀴 나무 짐수레(사람이 끌채를 잡고 끄는 손수레형, 소 없음): 짙은 갈색 나무 짐칸과 앞으로 뻗은 긴 끌채 두 개, 나무 살 바퀴 두 개(굵은 테, 쇠 장식 없음). 짐칸 위 짐은 앞 수레와 완전히 다르게: 짐칸 뒤쪽에 굵게 묶은 회갈색 장작 다발 두 개, 앞쪽에 짙은 적갈색 옹기 항아리 두 개(뚜껑 덮음), 그 위를 반쯤 덮은 짙은 쪽빛(남색) 무명 천 덮개를 흰 새끼줄로 묶음. 누런 볏짚 가마니·노란 짐 금지',
  forbid: '사람, 소, 말, 깃발, 글자, 쇠 바퀴, 지붕, 덮개 수레, 노란 볏짚 가마니', verify: '조선 달구지 형태 일반화(verify). 짐 변형(장작·옹기·쪽빛 덮개)은 제안값 — npc_cart_front 와 짐으로 구분' };
delete SAME_AS.npc_cart_rear;

// ch21_s2 바투·ch22 후마윤(안아트 2026-11-03): 정식 초상 없음 → noPortrait 잠정 시트(로스터 appearance 기준). 초상을 나중에 만들면 이 시트의 머리 장비·주색·소지품에 맞추거나 시트를 재생성.
//   64px 축: 바투 = 흰 말총 술 쇠 투구+금빛 황토 델(금실 테)+흰 말 / 후마윤 = 터번 감은 가벼운 쇠 투구+붉은 겉옷+밤색 말 (바이다르 청회 털모자·회갈 말과 구분)
Object.assign(NPC, {
  npc_batu: { name: '바투', side: 'ally', culture: 'mongol', troop: 'cavalry', layout: 'cavalry', mounted: true, noPortrait: true,
    sprite: `${MONGOL13S}. 흰 말을 탄 30대 중반 총사령(말과 기수가 한 캐릭터, 말 전체가 칸 안에), 짧은 검은 콧수염과 턱수염. 꼭대기에 흰 말총 술이 달린 둥근 쇠 투구(목 뒤 갈색 가죽 드림, 앞장식 없음), 금실 테두리를 두른 짙은 금빛 황토색 비단 델, 그 위 짙은 강철색 미늘 찰갑 조끼, 넓은 갈색 가죽 허리띠. 오른손에 약간 휜 외날 칼을 칼끝 위로 비스듬히 듦. 말: 흰 몸(옅은 회색 음영), 회색 갈기, 짙은 갈색 안장`,
    back: '흰 말 엉덩이와 회색 꼬리, 기수의 흰 술 투구와 금빛 델 등판', side: '흰 말이 왼쪽을 향해 걷고 기수는 휜 칼을 몸 앞에 듦', forbid: '깃발, 창, 활, 털모자, 청색 옷, 보병(말 없는 모습)', fallback: 'unit.china.cavalry.ally.64.sheet', verify: '정식 초상 없음(잠정 시트, 로스터 appearance 기준). 흰 말·황토 델은 제안값' },
  npc_humayun: { name: '후마윤', side: 'ally', culture: 'middle_east', troop: 'cavalry', layout: 'cavalry', mounted: true, noPortrait: true,
    sprite: `${TURK16S}. 밤색 말을 탄 10대 후반~20세 무렵 젊은 장수(성인 체형, 말과 기수가 한 캐릭터, 말 전체가 칸 안에), 아주 짧은 콧수염. 아래에 흰 천을 감은 가볍고 낮은 둥근 쇠 투구(뾰족한 끝 짧게, 장식 없음), 무릎까지 오는 짙은 붉은 긴 겉옷(가는 금빛 테두리), 갈색 가죽 허리띠. 오른손에 약간 휜 외날 칼을 칼끝 위로 비스듬히 듦. 말: 밤색 몸, 검은 갈기, 짙은 녹색 안장 천`,
    back: '밤색 말 엉덩이와 검은 꼬리, 기수의 쇠 투구와 붉은 겉옷 등판', side: '밤색 말이 왼쪽을 향해 걷고 기수는 휜 칼을 몸 앞에 듦', forbid: '깃발, 창, 활, 공책, 올리브녹색 옷, 보병(말 없는 모습)', fallback: 'unit.middle_east.cavalry.ally.64.sheet', verify: '정식 초상 없음(잠정 시트, 로스터 appearance 기준). 1526 당시 약 18세(verify)' },
});

export function job(code, extra) {
  const h = NPC[code]; if (!h) throw new Error(`작업 없음: ${code}`);
  if (h.object && h.structRef) return { refs: [LAYOUT[h.layout], h.structRef], prompt: OBJ_LEAD + '두 번째 참조 이미지는 같은 수레의 기존 시트다. 수레 틀(짐칸·끌채·바퀴)의 형태·색·크기·칸 배치·방향 행 순서는 두 번째 참조와 똑같이 맞추고, 짐칸 위 짐만 아래 설명대로 바꾼다.\n' + `사물: ${h.sprite}.\n작은 크기(64px)에서도 바퀴·짐칸·짐 실루엣이 식별되게 큰 색면으로 또렷하게. 위에서 약간 내려다본 시점(다른 유닛 도트와 같은 각도).\n` +
    (extra ? `추가 지시(재생성): ${extra}\n` : '') + `시트 규칙: ${CART_SHEET_RULE}\n스타일: ${PIXEL64_STYLE}\n마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}` };
  if (h.object) return { refs: [LAYOUT[h.layout]], prompt: OBJ_LEAD + `사물: ${h.sprite}.\n작은 크기(64px)에서도 바퀴·짐칸·짐 실루엣이 식별되게 큰 색면으로 또렷하게. 위에서 약간 내려다본 시점(다른 유닛 도트와 같은 각도).\n` +
    (extra ? `추가 지시(재생성): ${extra}\n` : '') + `시트 규칙: ${CART_SHEET_RULE}\n스타일: ${PIXEL64_STYLE}\n마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}` };
  if (h.noPortrait) return { refs: [LAYOUT[h.layout]], prompt: SHEET_LEAD + `${h.mounted ? '말에 탄 기마 인물(말과 기수를 한 캐릭터로, 말 전체가 칸 안에). ' : ''}외형: ${h.sprite}.\n방향 디테일: 뒷모습: ${h.back}. 측면: ${h.side}. 작은 크기(64px)에서도 머리 장비 실루엣·옷 주색·소지품이 식별되게 큰 색면으로 또렷하게. ${NO_SYMBOL}.\n` +
    (extra ? `추가 지시(재생성): ${extra}\n` : '') + `시트 규칙: ${SHEET_RULE3}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}` };
  const refs = [LAYOUT[h.layout], portraitRef(code)];
  const prompt = SHEET_LEAD +
    `두 번째 참조 이미지는 이 인물(${h.name})의 정식 초상화다. 얼굴 나이감·수염·머리 장비·복식 구성과 색·소지품을 초상화와 똑같이 맞춘다(그림체·상반신 구도는 따르지 않고 결과는 전신 도트 스프라이트).\n` +
    `${h.mounted ? '말에 탄 기마 인물(말과 기수를 한 캐릭터로, 말 전체가 칸 안에). ' : ''}외형: ${h.sprite}.\n` +
    `방향 디테일: 뒷모습: ${h.back}. 측면: ${h.side}. 작은 크기(64px)에서도 머리 장비 실루엣·옷 주색·무기가 식별되게 큰 색면으로 또렷하게. ${NO_SYMBOL}.\n` +
    (extra ? `추가 지시(재생성): ${extra}\n` : '') +
    `시트 규칙: ${SHEET_RULE3}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
  return { refs, prompt };
}

export const QA = ['192x256(3x4, 64px), 1px 외곽선, 32색 이하', '초상화와 머리 장비·주색·소지품 일치', '9칸 무기 일관·누락 없음', '측면 행 좌향 프로필', '알파 0/255, 마젠타 잔여 없음', '64px 1배에서 머리 실루엣·주색 식별, 다른 아군 NPC·공용 병종 시트와 구분'];
