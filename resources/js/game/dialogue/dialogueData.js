// 대화 데이터 임시 로더: 서버 대화 서빙 API 가 생기기 전까지 database/data 의 JSON 을 빌드에 포함(동적 import -> 별도 청크)해 읽는다.
// 반환 구조는 API 호환을 전제로 한다: 튜토리얼 {steps:[{id, step_no, title, lines:[{speaker, expr, text}]}]},
// 캠페인 {chapter, scenes:[{id, stage_code, timing, bg, what_if, lines:[{speaker:'shiori'|'hero:<code|csv_id>', expr, text, is_invented, verify}]}]}
// 후속: fetch('/api/dialogue/tutorial') 등으로 교체 시 이 모듈의 함수 시그니처만 유지하면 된다.
import { session } from '../api/client.js';
import { unitClassName } from '../systems/names.js';
import { loaded, npcCode, portraitCode } from '../assets.js';

const HERO_NAMES = { yi_sun_sin: '이순신', hannibal: '한니발', joan_of_arc: '잔 다르크', alexander: '알렉산드로스 대왕', genghis_khan: '칭기즈 칸', gwanggaeto: '광개토대왕', hildegard: '힐데가르트 폰 빙엔', zhuge_liang: '제갈량',
    babur: '바부르', william_i: '윌리엄 1세', charles_martel: '카를 마르텔',
    // 서가 11~20·종장 대사 화자(database/data/heroes.json name_ko, 강화면 26회차: 'heo_jun' 등 코드값 노출)
    seo_hui: '서희', gang_gamchan: '강감찬', liu_bei: '유비', guan_yu: '관우', zhou_yu: '주유', kim_yusin: '김유신', eulji_mundeok: '을지문덕',
    fabius_maximus: '파비우스 막시무스', scipio_africanus: '스키피오 아프리카누스', saladin: '살라딘', richard_i: '리처드 1세', tokugawa_ieyasu: '도쿠가와 이에야스',
    oda_nobunaga: '오다 노부나가', honda_tadakatsu: '혼다 다다카쓰', toyotomi_hideyoshi: '도요토미 히데요시', heo_jun: '허준',
    cao_cao: '조조', gyebaek: '계백', sun_quan: '손권' }; // 송서사 확인(2026-11-03), heroes.json name_ko 와 같음 // babur: ch22 'hero:babur' 화자(heroes 미등재 가능). 초상 portrait.babur(assets/portraits/npc/babur.png)는 portraitCode 가 그대로 찾음
// 적 지휘관·번진 그림자 화자(npc_jp_*, npc_ink_*) 이름표 (scenario/enemy_lines_draft.json speakers[].name_ko). 초상화는 portrait.<code>(manifest 에 있을 때, 2026-11-01 안아트 npc_naval 조각), 없으면 실루엣
const NPC_NAMES = { /* 송서사 speaker_profile.name 일괄 반영(2026-11-04, 박백엔) */ npc_al_samh: '알삼흐', npc_aldred_york: '올드레드', npc_anbasa: '안바사', npc_andalus_quartermaster: '안달루스 보급 책임자', npc_andalus_relief_commander: '안달루스 구원군 지휘관', npc_arab_guard_chief: '아랍 근위 기병대장', npc_ariobarzanes: '아리오바르자네스', npc_atropates: '아트로파테스', npc_avignon_garrison: '아비뇽 수비대장', npc_barsaentes: '바르사엔테스', npc_beopmin: '김법민', npc_berber_cavalry_chief: '베르베르 기병대장', npc_bessus: '베소스', npc_boksin: '복신', npc_bordeaux_gate_captain: '보르도 성문 대장', npc_buyeo_pung: '부여풍', npc_buyeo_yung: '부여융', npc_buyruq_khan: '부이룩 칸', npc_cai_mao: '채모', npc_cannae_tribune: '칸나이 호민관', npc_canterbury_envoy: '캔터베리 사절', npc_captive_headman: '포로 대표', npc_charles_vii: '샤를 7세', npc_cheng_yu: '정욱', npc_chungsang: '충상', npc_cleitus: '클레이토스', npc_dayir_usun: '다이르 우순', npc_delhi_gate_officer: '델리 성문 책임자', npc_diades: '디아데스', npc_dochim: '도침', npc_dover_reeve: '도버 수비대장', npc_eschiva_tiberias: '에시바', npc_gerard_ridefort: '제라르 드 리드포르', npc_go_geonmu: '고건무', npc_gokbori: '고크보리', npc_hasdrubal_gisgo: '하스드루발 기스고', npc_heukchi_sangji: '흑치상지', npc_heungsu: '흥수', npc_hugh_burgundy: '부르고뉴 공 위그', npc_inalchuq: '이날추크', npc_jamukha: '자모카', npc_jisu_sin: '지수신', npc_kim_jong_hyeon: '김종현', npc_kokse_u_sabraq: '케크세우 사브락', npc_kuchlug: '쿠츨루크', npc_laelius: '라일리우스', npc_lai_huer: '내호아', npc_li_tong: '이통', npc_liaodong_chief: '요동성 수비대장', npc_liu_qi: '유기', npc_liu_rengui: '유인궤', npc_lu_meng: '여몽', npc_maeda_toshiie: '마에다 도시이에', npc_man_chong: '만총', npc_memnon: '멤논', npc_mithraustes: '미트라우스테스', npc_munuza: '무누자', npc_nabarzanes: '낫바르자네스', npc_naiman_captain: '나이만 부장', npc_naito_masatoyo: '나이토 마사토요', npc_orontes: '오론테스', npc_pass_guide: '산길 안내자', npc_phrataphernes: '프라타페르네스', npc_porus: '포로스', npc_publius_scipio: '푸블리우스 스키피오', npc_qaraqush: '카라쿠시', npc_qudu: '쿠두', npc_qutuqa_beki: '쿠투카 베키', npc_richemont: '리슈몽', npc_sanada_nobutsuna: '사나다 노부쓰나', npc_sangyeong: '상영', npc_sassa_narimasa: '삿사 나리마사', npc_satibarzanes: '사티바르자네스', npc_seongchung: '성충', npc_shigi_qutuqu: '시기 쿠투쿠', npc_sialkot_envoy: '시알코트 사절', npc_siege_captain: '몽골 공성 천인장', npc_sinseong_chief: '신성 수비대장', npc_stigand: '스티건드', npc_suffolk: '서퍽 백작', npc_syphax: '시팍스', npc_tayang_khan: '타양 칸', npc_toqto_a_beki: '토크타 베키', npc_uija: '의자왕', npc_umayyad_infantry_chief: '보병 대장', npc_umayyad_rearguard: '후위 지휘관', npc_wa_naval_commander: '왜 수군 지휘관', npc_wen_pin: '문빙', npc_xu_huang: '서황', npc_yamagata_masakage: '야마가타 마사카게', npc_yang_gyu: '양규', npc_ye_sikjin: '예식진', npc_yue_jin: '악진', npc_yunchung: '윤충', npc_yusuf_fihri: '유수프 알피흐리', npc_zaragoza_detachment: '사라고사 파견대장', npc_zhang_fei: '장비', npc_zhang_liao: '장료', npc_zhang_yun: '장윤', npc_zhao_yun: '조운', npc_jp_todo_takatora: '도도 다카토라', npc_jp_okpo_lieutenant: '일본 수군 부장', npc_jp_ankokuji_ekei: '안코쿠지 에케이', npc_jp_wakizaka_yasuharu: '와키자카 야스하루', npc_jp_hasegawa_hidekazu: '하세가와 히데카즈', npc_jp_konishi_yukinaga: '고니시 유키나가', npc_jp_ukita_hideie: '우키타 히데이에', npc_jp_shimazu_yoshihiro: '시마즈 요시히로', npc_jp_kurushima_michifusa: '구루시마 미치후사', npc_ink_shadow_s8: '번진 기록의 그림자', npc_ink_shadow_final: '마지막 그림자',
    // 18장 몽골 장수(ch18_mongol.json 'hero:npc_*' 화자). 로스터 코드 + 초상 별칭 코드(assets NPC_ASSET_ALIAS) 둘 다 등록
    npc_jebe: '제베', jebe: '제베', npc_subutai: '수부타이', subutai: '수부타이', npc_muqali: '무칼리', mukhali: '무칼리', npc_boorchu: '보르추', borchu: '보르추', npc_jochi: '주치', npc_qasar: '카사르', npc_jelme: '젤메', // 초상 portrait.npc_qasar·npc_jelme(안아트 2026-11-03)
    // 1장 재작성 대사 NPC(campaign_ch1_scenes.json 'hero:npc_*'). 초상 없는 코드는 실루엣
    npc_won_gyun: '원균', npc_jeong_un: '정운', npc_kuki_yoshitaka: '구키 요시타카', npc_i_yeoseong: '이여송', npc_jin_rin: '진린',
    // 오리지널 메인 스토리 NPC 15종(docs/original_story/NPC_CODE_TABLE.md). 초상은 portrait.<code>(manifest 에 생기면 자동 연결, 없으면 실루엣)
    npc_jieum: '지음', npc_jjogi: '쪽이', npc_bulssi: '불씨', npc_red_pen: '붉은 펜의 사자', npc_gyojeong: '교정관', npc_bonggun: '봉군', npc_sagong: '사공', npc_jimkkun: '짐꾼',
    npc_dol_ajumeoni: '돌 아주머니', npc_mabu: '마부', npc_bobyeong: '보병', npc_baetsagong: '뱃사공', npc_ilkkun: '성당 일꾼', npc_gilzabi: '길잡이', npc_sangin: '대상 상인',
    npc_yumokmin: '양치기 무리 어른',
    // 수레(병종 v2: 퇴역 heavy -> 서버 별칭 sword)·배(naval) NPC 유닛(npc_roster_main_a2/a3.json). 전용 스프라이트·초상 없음 -> 병종 공용 시트·실루엣
    npc_cart_front: '짐수레(앞)', npc_cart_rear: '짐수레(뒤)', npc_cart_1: '짐수레 1', npc_cart_2: '짐수레 2', npc_boat_2: '나룻배',
    // 21장 레그니차·22장 파니파트 화자(docs/original_story/ch21_ch22_research.md 4절). 초상 없는 코드는 실루엣.
    // npc_babur 는 assets NPC_ASSET_ALIAS 로 portrait.babur 에 이어지므로 별칭 결과 코드 babur 도 등록
    npc_baidar: '바이다르', npc_kadan: '카단', npc_orda: '오르다', npc_batu: '바투', npc_henry_ii_pious: '헨리크 2세', npc_teutonic_commander: '기사단 분견대장', npc_mieszko_ii_opole: '미에슈코 2세',
    // ch21/ch22 구성안(docs/original_story/ch21_ch22_8stage_outline.md) 신규 NPC 명단 표기. 발화 없는 이름표 유닛(파코스와프·벨라 4세 등)도 표시용으로 등록
    npc_mongol_vanguard: '몽골 선발대장', npc_wlodzimierz_krakow: '브워지미에시', npc_pakoslaw_sandomierz: '파코스와프', npc_simon_nagymartoni: '시몬 백작', npc_bela_iv: '벨라 4세',
    // ch21 speaker_profile 대조 추가(2026-11-03). 초상 없음 -> 이름표 + 글자 칩 폴백
    npc_wenceslas_i_bohemia: '바츨라프 1세', npc_ugrin_csak: '우그린 차크', npc_coloman_hungary: '콜로만',
    npc_sulislaw_krakow: '술리스와프', npc_boleslav_depolt: '볼레슬라프', npc_rembald_voczon: '렘발드 드 보송', // 공용 클론 무장(assets NPC_CLONE)
    npc_rana_sanga: '라나 상가', npc_mustafa_rumi: '무스타파 루미', npc_dawlat_khan_lodi: '다울라트 칸 로디', npc_bihar_khan_lodi: '비하르 칸 로디', npc_hamid_khan: '하미드 칸', npc_hasan_khan_mewati: '하산 칸 메와티', npc_mahmud_lodi: '마흐무드 로디',
    npc_babur: '바부르', babur: '바부르', npc_humayun: '후마윤', npc_ustad_ali_quli: '우스타드 알리 쿨리', npc_ibrahim_lodi: '이브라힘 로디', npc_lodi_commander: '로디 군 장수',
    // 23장 헤이스팅스·24장 투르-푸아티에(database/data/npc_roster_shelf_ch23_24.json name_ko). 전용 초상 없음 -> assets NPC_CLONE 공용 병종 초상(전용 초상이 manifest 에 생기면 자동 우선)
    npc_odo_bayeux: '오도', npc_william_fitzosbern: '윌리엄 피츠오스번', npc_harold_godwinson: '해럴드 고드윈슨', npc_gyrth_godwinson: '거스 고드윈슨', npc_edgar_atheling: '에드가 애설링',
    npc_william_i: '윌리엄 1세', npc_charles_martel: '카를 마르텔', // 아군 NPC 행(초상·시트는 assets NPC_ASSET_ALIAS -> 영웅 에셋)
    npc_eudes_aquitaine: '외드', npc_frankish_vanguard: '전위 대장', // 25장 바익당(npc_roster_shelf_ch25_dai_viet_add.json name_ko)
    npc_tran_nhan_tong: '쩐 녓똥', npc_tran_thanh_tong: '쩐 타인똥', npc_tran_quang_khai: '쩐 꽝카이', npc_tran_nhat_duat: '쩐 녓주엇', npc_tran_khanh_du: '쩐 칸즈', npc_pham_ngu_lao: '팜 응우라오', npc_tran_quoc_toan: '쩐 꾸옥 또안', npc_nguyen_khoai: '응우옌 코아이', npc_yet_kieu: '옛끼에우', npc_da_tuong: '자뜨엉', npc_dai_viet_scout_captain: '다이비엣 척후장', npc_dai_viet_boat_captain: '나루 선장', npc_toghan: '토간', npc_sogetu: '소게투', npc_omar: '오마르', npc_li_heng: '리항', npc_fan_yi: '판제', npc_aoluchi: '오로치', npc_zhang_wenhu: '장원호', npc_yuan_vanguard_captain: '몽골 선봉장', npc_yuan_garrison_captain: '도성 수비대장', npc_yuan_patrol_captain: '척후선단장',
    npc_abd_al_rahman_ghafiqi: '압드 알라흐만 알가피키',
    // 12장 적벽·13장 황산벌·16장 오를레앙 화자(준비 중 서가; database/data/npc_roster*.json name_ko 의 표시용 짧은 이름. 로스터 미등록 3명은 화면 이름만)
    npc_kim_yusin: '김유신', npc_joan_of_arc: '잔 다르크', npc_cao_ren: '조인', npc_gan_ning: '감녕', npc_cheng_pu: '정보', npc_huang_gai: '황개', npc_lu_su: '노숙',
    npc_banggul: '반굴', npc_gwanchang: '관창', npc_kim_chunchu: '김춘추', npc_kim_heumsun: '김흠순', npc_kim_inmun: '김인문', npc_kim_pumil: '김품일', npc_so_jeongbang: '소정방',
    npc_dunois: '뒤누아', npc_fastolf: '존 팔스톨프', npc_gilles_de_rais: '질 드 레', npc_glasdale: '윌리엄 글라스데일', npc_jean_alencon: '알랑송 공작', npc_la_hire: '라이르', npc_talbot: '존 탤벗',
    // 11·14·15·17·19·20장 화자(준비 중 서가). 로스터 미등록 3명(강민첨·소배압·소손녕)은 화면 이름만
    npc_gang_min_cheom: '강민첨', npc_so_baeap: '소배압', npc_so_sonnyeong: '소손녕', npc_goryeo_seongjong: '고려 성종',
    npc_wuwenshu: '우문술', npc_yeongyang: '영양왕', npc_yuzhongwen: '우중문',
    npc_masinissa: '마시니사', npc_craterus: '크라테로스', npc_darius_iii: '다리우스 3세', npc_hephaestion: '헤파이스티온', npc_mazaeus: '마자이오스', npc_parmenion: '파르메니온', npc_ptolemy: '프톨레마이오스',
    npc_al_adil: '알아딜', npc_baha_ad_din: '바하 앗딘', npc_balian_ibelin: '발리앙 디벨랭', npc_guy_lusignan: '기 드 뤼지냥',
    npc_baba_nobuharu: '바바 노부하루', npc_okudaira_sadamasa: '오쿠다이라 사다마사', npc_sakai_tadatsugu: '사카이 다다쓰구', npc_takeda_katsuyori: '다케다 가쓰요리', npc_torii_suneemon: '도리이 스네에몬' };
const CSV_NAMES = { 142: '이순신', 143: '권율', 144: '곽재우', 145: '김시민', 148: '휴정', 149: '유정', 147: '허준', 248: '잔 다르크', 322: '살라딘' }; // campaign_ch1_outline.json 의 csv_id -> name_ko (코드 미등재 영웅). 나머지는 outline 로드 시 보강
// csv_id -> 영웅 코드(outline 에 code 가 없는 1장 영웅: 초상화 portrait.<code> 연결. 없으면 실루엣 + '초상화 없음' 경고). shelf_map_meta ch1 heroes 와 같은 코드
const CSV_CODES = { 142: 'yi_sun_sin', 143: 'gwon_yul', 144: 'gwak_jae_u', 145: 'kim_si_min', 148: 'hyujeong', 149: 'yujeong', 147: 'heo_jun', 248: 'joan_of_arc', 322: 'saladin' }; // 147·248·322 = 메인 스토리 실존 3인
let outlineLoaded = false;

async function loadOutlineNames() {
    if (outlineLoaded) return;
    outlineLoaded = true;
    try {
        const m = await import('../data/dialogue/campaign_ch1_outline.json');
        const walk = (v) => {
            if (Array.isArray(v)) v.forEach(walk);
            else if (v && typeof v === 'object') {
                if (v.csv_id != null && v.name_ko) { CSV_NAMES[v.csv_id] = v.name_ko; if (v.code) CSV_CODES[v.csv_id] = v.code; }
                Object.values(v).forEach(walk);
            }
        };
        walk(m.default ?? m);
    } catch { /* outline 없음: 기본 표만 사용 */ }
}

// ---- 장면 배경 ----
// 배경 키 규약: bg.<set>.<name>(manifest 키, 소문자·숫자·밑줄). 기존 scene.bg 는 한국어 장면 설명(나레이션)이라 키 형식일 때만 키로 본다.
// 조회 순서: scene.bg_key > scene.bg(키 형식) > 매핑표[scene.id](data/dialogue/scene_bg_map.json, 안아트 매핑표를 여기 채운다). 없으면 null(그라데이션 폴백)
export const BG_KEY_RE = /^bg\.[a-z0-9_]+(?:\.[a-z0-9_]+)+$/;
export const isBgKey = (s) => typeof s === 'string' && BG_KEY_RE.test(s);
let SCENE_BG_MAP = {};
let bgMapLoaded = false;
async function loadBgMap() {
    if (bgMapLoaded) return;
    bgMapLoaded = true;
    try { const m = await import('../data/dialogue/scene_bg_map.json'); SCENE_BG_MAP = (m.default ?? m)?.scenes ?? {}; } catch { /* 표 없음: 폴백 */ }
}
export function sceneBgKey(sc) {
    if (!sc) return null;
    if (isBgKey(sc.bg_key)) return sc.bg_key;
    if (isBgKey(sc.bg)) return sc.bg;
    const k = sc.id != null ? SCENE_BG_MAP[sc.id] : null;
    return isBgKey(k) ? k : null;
}
// 화면 캡션(연출용 나레이션): scene.caption > scene.bg(키가 아닌 설명문) > ''. 장면 id·키·코드는 절대 캡션으로 쓰지 않는다
export function sceneCaption(sc) {
    const pick = (v) => (typeof v === 'string' && v.trim() && !isBgKey(v.trim()) && !/^[a-z0-9_.:-]+$/i.test(v.trim()) ? v.trim() : '');
    return pick(sc?.caption) || pick(sc?.bg);
}

// 대사 파일의 speaker_profile(화자 키 -> {name}) 을 읽어 둔 이름표. speakerInfo 가 하드코딩 표(HERO_NAMES·NPC_NAMES)보다 먼저 본다(2026-11-04 '화자 이름이 코드로 나옴')
//  키는 원문 그대로 + 'hero:'·'npc:' 접두를 뗀 형태로도 등록. '{protagonist_name}' 같은 토큰 이름은 건너뜀
const SPEAKER_NAMES = new Map();
// 정검수 Medium: 장(대사 파일)마다 이름표를 교체한다(다른 장의 같은 키가 다른 이름이면 오표시 방지). 명시 키가 먼저, 'hero:'/'npc:'/접두 없는 변형은 명시 키가 없을 때만
export function registerSpeakerProfile(sp, { replace = true } = {}) {
    if (!sp || typeof sp !== 'object') return;
    if (replace) SPEAKER_NAMES.clear();
    const explicit = new Map();
    Object.entries(sp).forEach(([k, v]) => { const nm = typeof v === 'string' ? v : v?.name; if (typeof nm === 'string' && nm.trim() && !/[{}]/.test(nm)) explicit.set(k, nm.trim()); });
    explicit.forEach((nm, k) => SPEAKER_NAMES.set(k, nm));
    explicit.forEach((nm, k) => {
        const bare = k.replace(/^hero:/, '').replace(/^npc:/, '');
        [bare, `npc:${bare}`, `hero:${bare}`].forEach((key) => { if (!explicit.has(key) && !SPEAKER_NAMES.has(key)) SPEAKER_NAMES.set(key, nm); });
    });
}
// 영웅 코드 -> 한글 이름 전체 표(하드코딩 HERO_NAMES 30명 의존 축소, 2026-11-04 '권율이 gwon_yul 로 나옴'): FE 데이터 hero_native_names.json(ko, 128명) + hero_tips.json(name, 영웅·NPC 301명).
//  지연 청크로 한 번만 읽는다(loadCampaign/loadTutorial 이 기다림, 전투는 진입 시 loadCampaign 으로 미리)
let HERO_DB = null; let HERO_DB_P = null;
export function ensureHeroNames() {
    if (HERO_DB) return Promise.resolve(HERO_DB);
    HERO_DB_P ??= Promise.all([import('../data/hero_native_names.json').catch(() => null), import('../data/hero_tips.json').catch(() => null)]).then(([nn, tp]) => {
        const m = new Map();
        Object.entries((nn?.default ?? nn)?.items ?? {}).forEach(([c, v]) => { if (v?.ko) m.set(c, v.ko); });
        Object.entries((tp?.default ?? tp)?.tips ?? {}).forEach(([c, v]) => { if (v?.name && !m.has(c)) m.set(c, v.name); });
        HERO_DB = m; return m;
    });
    return HERO_DB_P;
}
// 영웅 코드 -> 한글 이름(동기, 표 로드 전이면 하드코딩 표만). 대사 외 화면(합류 안내 등)용
export const heroNameKo = (code) => (code ? HERO_NAMES[code] ?? HERO_DB?.get(code) ?? NPC_NAMES[code] ?? null : null);
const nameOfKey = (...keys) => { for (const k of keys) { if (k && SPEAKER_NAMES.has(k)) return SPEAKER_NAMES.get(k); } return null; };
// 이름을 끝내 못 찾았을 때: 코드(npc_xxx·영문 키)를 그대로 보이지 않는다 -> '???'
const hideCode = (v) => (/^[a-z0-9_:.#-]+$/i.test(String(v ?? '')) ? '???' : String(v));

export async function loadTutorial() {
    await loadBgMap();
    await ensureHeroNames();
    const m = await import('../data/dialogue/tutorial_dialogue.json');
    registerSpeakerProfile((m.default ?? m)?.speaker_profile);
    return m.default ?? m;
}

// 오리지널 메인 스토리 막별 장면(chapter 100+N = campaign_main_a<N>_scenes.json). 빌드 시점에 있는 파일만 지연 청크로 잡히므로
// 2~4막은 파일을 data/dialogue 에 추가(sync_dialogue_data.mjs FILES)하고 다시 빌드하면 자동 연결. 파일이 없는 막은 빈 장면(대사 없이 진행)
const MAIN_ACTS = import.meta.glob('../data/dialogue/campaign_main_a*_scenes.json');
const CH25 = import.meta.glob('../data/dialogue/ch25_bachdang.json'); // 서가 25장 바익당(송서사 원본 database/data/ch25_bachdang.json -> sync_dialogue_data.mjs; 파일이 아직 없어도 빌드가 깨지지 않도록 glob)
const CH26 = import.meta.glob('../data/dialogue/ch26_caesar.json'); // 서가 26장 카이사르 루비콘(송서사 원본 -> sync_dialogue_data.mjs, ch25 와 같은 glob 방식: 파일이 없어도 빌드 유지)

export async function loadCampaign(chapter = 1) {
    await loadBgMap();
    await ensureHeroNames();
    await loadOutlineNames();
    // 장별 장면 대사(지연 청크). 표에 없는 장은 빈 장면 목록(대사 없이 진행)
    const m = chapter === 1 ? await import('../data/dialogue/campaign_ch1_scenes.json')
        : chapter === 11 ? await import('../data/dialogue/ch11_goryeo_khitan.json')
        : chapter === 14 ? await import('../data/dialogue/ch14_salsu.json')
        : chapter === 15 ? await import('../data/dialogue/ch15_mediterranean.json')
        : chapter === 17 ? await import('../data/dialogue/ch17_gaugamela.json')
        : chapter === 19 ? await import('../data/dialogue/ch19_holy_land.json')
        : chapter === 20 ? await import('../data/dialogue/ch20_nagashino.json')
        : chapter === 999 ? await import('../data/dialogue/ch999_finale.json') // 숨은 종장
        : chapter === 30 ? await import('../data/dialogue/ch30_legacy_stages.json') // 일반 스테이지 stage_02~06 대사(송서사 원본 -> sync_dialogue_data.mjs)
        : chapter === 12 ? await import('../data/dialogue/ch12_redcliff.json') // 서가 12장 적벽(준비 중, 대사만 선탑재)
        : chapter === 13 ? await import('../data/dialogue/ch13_hwangsanbeol.json') // 서가 13장 황산벌
        : chapter === 16 ? await import('../data/dialogue/ch16_orleans.json') // 서가 16장 오를레앙
        : chapter === 18 ? await import('../data/dialogue/ch18_mongol.json')
        : chapter === 21 ? await import('../data/dialogue/ch21_legnica.json') // 원본 database/data(송서사) -> sync_dialogue_data.mjs 로 복사
        : chapter === 22 ? await import('../data/dialogue/ch22_panipat.json')
        : chapter === 23 ? await import('../data/dialogue/ch23_hastings.json') // 서가 23장 헤이스팅스(preview)
        : chapter === 24 ? await import('../data/dialogue/ch24_tours.json') // 서가 24장 투르-푸아티에(preview)
        : chapter === 25 && CH25['../data/dialogue/ch25_bachdang.json'] ? await CH25['../data/dialogue/ch25_bachdang.json']() // 서가 25장 바익당(preview)
        : chapter === 26 && CH26['../data/dialogue/ch26_caesar.json'] ? await CH26['../data/dialogue/ch26_caesar.json']() // 서가 26장 카이사르 루비콘
        : MAIN_ACTS[`../data/dialogue/campaign_main_a${chapter - 100}_scenes.json`] ? await MAIN_ACTS[`../data/dialogue/campaign_main_a${chapter - 100}_scenes.json`]()
        : null;
    const d = m?.default ?? m ?? { chapter, scenes: [] };
    registerSpeakerProfile(d.speaker_profile); // 이 장 화자 이름표
    return d;
}

// 화자 문자열 -> {kind:'shiori'|'hero', code, name}. 'hero:<code|csv_id>'. 코드가 없으면 이름표만(초상화 없음)
export function speakerInfo(speaker) {
    if (!speaker || speaker === 'shiori') return { kind: 'shiori', code: 'shiori', name: '시오리' };
    const pm = /^protagonist(?::(m|f))?$/.exec(String(speaker));
    if (pm) return { kind: 'protagonist', code: 'protagonist', gender: pm[1] ?? protagonistGender(), face: protagonistFace(), name: protagonistName() }; // 오리지널 주인공 = 계정 사용자명. 성별을 알면 portrait.protagonist_<m|f>, 모르면 실루엣
    const tm = /^troop:(?:([a-z_]+).)?([a-z_]+)$/.exec(String(speaker)); // 일반 병사 화자: 'troop:<culture>.<troop>' | 'troop:<troop>' -> 병종 초상화(문화권 -> default)
    if (tm) return { kind: 'troop', code: `troop.${tm[1] ?? 'default'}.${tm[2]}`, culture: tm[1] ?? null, troop: tm[2], name: `${unitClassName(tm[2])} 병사` };
    // 'npc:<code>'(서가11·12 화자) / 'npc_jp_*'·'npc_ink_*' 직접 코드: NPC 초상화 portrait.<code>(안아트 npc_naval 조각, neutral 1종 -> 모든 expr 은 portraitStage 가 portrait.<code> 로 폴백).
    // 초상화가 manifest 에 없으면(서가12 위 NPC 등) 이름표만(portraitStage 가 실루엣). kind 는 'hero' 그대로(초상화 키 규약 공유)
    // 'hero:npc_*'(18장 몽골 장수, campaign_only NPC 영웅 행)도 NPC 경로로: 초상 별칭(npc_jebe -> portrait.jebe) 해석
    const sp = String(speaker).replace(/^hero:(?=npc_)/, '');
    const npc = /^npc:/.test(sp) || /^npc_/.test(sp) ? npcCode(sp) : null;
    if (npc) { // 초상화 없는 NPC(로스터 33명 등): code=null -> 초상화 요청·경고 없이 실루엣(speakerId 는 이름으로)
        const name = nameOfKey(String(speaker), sp, npc) ?? NPC_NAMES[npc] ?? NPC_NAMES[sp.replace(/^npc:/, '')] ?? HERO_DB?.get(npc) ?? HERO_DB?.get(sp.replace(/^npc:/, '')) ?? loaded.manifest?.[`portrait.${npc}`]?.name_ko ?? loaded.manifest?.[`portrait.${portraitCode(npc)}`]?.name_ko ?? hideCode(npc);
        return { kind: 'hero', code: !loaded.manifest || loaded.manifest[`portrait.${portraitCode(npc)}`]?.path ? npc : null, npc: true, name }; // portraitCode: 공용 클론 무장(portrait.troop.europe.*) 포함
    }
    const id = String(speaker).replace(/^hero:/, '');
    if (/^\d+$/.test(id)) { const code = CSV_CODES[id] ?? null; return { kind: 'hero', code, name: CSV_NAMES[id] ?? nameOfKey(String(speaker)) ?? (code ? HERO_NAMES[code] : null) ?? '???' }; }
    return { kind: 'hero', code: id, name: nameOfKey(String(speaker), id) ?? HERO_NAMES[id] ?? HERO_DB?.get(id) ?? NPC_NAMES[id] ?? NPC_NAMES[`npc_${id}`] ?? HERO_DB?.get(`npc_${id}`) ?? loaded.manifest?.[`portrait.${portraitCode(id)}`]?.name_ko ?? hideCode(id) }; // 대사 파일 이름표 > 표 > 초상 manifest name_ko > '???'(코드 비노출)
}

// 오리지널 주인공 이름 = 계정 사용자명. 게스트 '이름#숫자'는 '#' 앞만, 비면 '지휘관', 12자 초과는 말줄임(11자 + …).
// 화면 출력은 Phaser Text 로만(HTML 해석 없음) — 사용자 입력 문자열이 DOM/HTML 로 들어가는 경로 없음. 제어 문자는 제거
export const PROTAGONIST_FALLBACK = '지휘관';
// 주인공 성별(캐릭터 생성 화면 전): setProtagonistGender('m'|'f') 또는 세션 필드(protagonist_gender) — 없으면 null(실루엣 유지, 임의 성별 표시 안 함)
let PROTAGONIST_GENDER = null;
const normGender = (g) => { const v = String(g ?? '').toLowerCase(); return v === 'm' || v === 'male' ? 'm' : v === 'f' || v === 'female' ? 'f' : null; };
export function setProtagonistGender(g) { PROTAGONIST_GENDER = normGender(g); }
// 캐릭터 생성 결과(초상화 face·클래스): setProtagonist({gender, face, cls}). 대사 초상화(portraitStage)와 토큰 {result_class}/{result_troop} 에 사용
let PROTAGONIST = { face: null, cls: null, clsName: null, troopName: null };
export function setProtagonist({ gender, face, cls, clsName, troopName } = {}) { if (gender !== undefined) setProtagonistGender(gender); PROTAGONIST = { face: face ?? null, cls: cls ?? null, clsName: clsName ?? null, troopName: troopName ?? null }; }
export const protagonistFace = () => PROTAGONIST.face;
export const protagonistInfo = () => ({ ...PROTAGONIST, gender: protagonistGender() });
export const protagonistGender = () => PROTAGONIST_GENDER ?? normGender(session?.protagonist_gender);
export function protagonistName(raw = session?.name) {
    let n = String(raw ?? '').split('#')[0].replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!n) n = PROTAGONIST_FALLBACK;
    const chars = [...n];
    return chars.length > 12 ? `${chars.slice(0, 11).join('')}…` : n;
}

// 조사 후처리: {토큰:은/는} 형식. 받침 판정 — 한글은 종성 유무, 숫자는 한국어 읽기(영·일·삼·육·칠·팔 = 받침),
// 영문은 알파벳 이름 끝소리(l·m·n·r = 받침, 엘·엠·엔·알) 단순 규칙, 그 외 문자는 받침 있음(은/이/을/과/아)으로 본다
const JOSA = { '은/는': ['은', '는'], '는/은': ['은', '는'], '이/가': ['이', '가'], '가/이': ['이', '가'], '을/를': ['을', '를'], '를/을': ['을', '를'], '와/과': ['과', '와'], '과/와': ['과', '와'], '아/야': ['아', '야'], '야/아': ['아', '야'] };
export function hasBatchim(word) {
    const chars = [...String(word ?? '').replace(/[…\s.,!?'")\]]+$/u, '')];
    const ch = chars[chars.length - 1];
    if (!ch) return true;
    const c = ch.codePointAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
    if (/[0-9]/.test(ch)) return '0136789'.includes(ch);
    if (/[a-z]/i.test(ch)) return 'lmnr'.includes(ch.toLowerCase());
    return true;
}
export function josa(word, spec) {
    const pair = JOSA[String(spec).replace(/\s/g, '')];
    if (!pair) return '';
    return hasBatchim(word) ? pair[0] : pair[1];
}

// {토큰} / {토큰:조사} 치환. 값이 없으면 토큰을 그대로 둔다(누락이 눈에 보이도록). protagonist_name 기본값 = 현재 계정 이름
// 정합(2026-11-01, unit_type_name 은 당시 기준 유지): 시작 영웅 이순신 고정 병종 = sword(hero_troop_types.json) -> 표시명은 names.unitClassName, max_cost 는 현재 프로필 값(Lv1=16, user_level_costs),
// reward_* 는 stage_01(stages.json reward_exp 60 / reward_gold 100). 프로필이 아직 없을 때만 Lv1 값 16
// hero_name(2026-11-14): 시작 영웅이 C급 무작위 2명(ProgressionService starter, config game.starter_hero_count) -> 특정 영웅명 고정 금지.
//  실제 보유 영웅 중 먼저 받은 순(user_hero_id 오름차순, 주인공·캠페인 전용 제외) 앞 STARTER_COUNT 명을 'A, B'로. 목록이 없으면 중립 문구
export const DEFAULT_TOKENS = { hero_name: '첫 영웅들', unit_type_name: '보병', max_cost: 16, reward_exp: 60, reward_gold: 100 };
const STARTER_COUNT = 2;
export function starterHeroNames(heroes = session?.heroes) {
    const own = (Array.isArray(heroes) ? heroes : []).filter((h) => h && !h.protagonist && !h.campaign_only)
        .sort((a, b) => Number(a.user_hero_id ?? Infinity) - Number(b.user_hero_id ?? Infinity));
    const names = own.slice(0, STARTER_COUNT).map((h) => String(h.short_name || h.name_ko || h.name || '').trim()).filter(Boolean);
    return names.length ? names.join(', ') : null;
}
const dynamicToken = (k) => {
    if (k === 'protagonist_name') return protagonistName();
    if (k === 'hero_name') return starterHeroNames();
    if (k === 'unit_type_name') return unitClassName('sword');
    if (k === 'max_cost') return session?.profile?.max_cost ?? null;
    if (k === 'result_class') return PROTAGONIST.clsName; // 시나리오 P-03 자리표시(확정 전)
    if (k === 'result_troop') return PROTAGONIST.troopName;
    return null;
};
// 토큰 바로 뒤에 조사 한 글자가 고정으로 붙어 있으면({reward_gold}를 -> '100를') 값의 받침에 맞춰 보정. 뒤가 한글 음절이면(예: {x}이다) 조사가 아닌 것으로 보고 그대로 둔다
const BARE_JOSA = { 은: '은/는', 는: '은/는', 이: '이/가', 가: '이/가', 을: '을/를', 를: '을/를', 와: '와/과', 과: '와/과' };
export const fillTokens = (text, tokens = {}) => String(text).replace(/\{(\w+)(?::([^}]+))?\}(?:([은는이가을를와과])(?![가-힣]))?/g, (m, k, j, bare) => {
    const v = tokens[k] ?? dynamicToken(k) ?? DEFAULT_TOKENS[k];
    if (v == null) return m;
    if (j) return `${v}${josa(v, j)}${bare ?? ''}`;
    return bare ? `${v}${josa(v, BARE_JOSA[bare])}` : String(v);
});
