// 사용자 설정 (localStorage 저장). 글자 크기 3단계는 fontLevel 하나로 theme.fs()가 스케일한다.
// fxLevel: 0 풀 / 1 축약 / 2 끄기 (prefers-reduced-motion이면 기본 축약), speed: 1/2/4배속
// quality: 0 높음 / 1 보통 / 2 낮음 (저사양 모바일 기본 보통, 프레임 저하 시 세션 한정 자동 하향 — 아래 setAutoQuality)
const KEY = 'srpg.settings.v3';

function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}

const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// iPadOS 13+ Safari 는 데스크톱 맥 UA(Macintosh)를 보낸다 -> 터치 포인트(>1)로 구분(데스크톱 맥은 maxTouchPoints 0). 2026-11-14 모바일 성능: iPad 기본 품질 '보통'
const mobile = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1));
const lowSpec = mobile || (navigator.hardwareConcurrency ?? 8) <= 4 || (navigator.deviceMemory ?? 8) <= 4; // (구) 기본값 판정 — 아래 마이그레이션에서 '예전 기본값을 그대로 저장한 사용자' 구분용으로만 쓴다

// ---- 기기 성능 기반 품질 기본값(3단계, 2026-11-14 성능 1단계) ----
// 0 높음: 데스크톱(외장 GPU 추정) / 1 보통: 모바일·태블릿·코어 4 이하·메모리 4GB 이하·내장 GPU(Intel UHD/Iris, AMD 'Radeon Graphics' APU 등)
// 2 낮음: deviceMemory <= 2(Chrome 계열 HTTPS 에서만 값이 있음 — HTTP 개발 서버에서는 undefined 라 이 단계가 나오지 않는다)
// 데스크톱 UA 태블릿: iPad(Macintosh+터치) 외에 Chrome 태블릿('데스크톱 사이트' 기본, Linux/Windows UA)은 userAgentData.mobile 이 false 라
//  '주 포인터가 coarse 이고 fine 포인터가 하나도 없음 + 터치 포인트 > 1'로 판정(터치 노트북은 마우스·터치패드가 fine 이라 제외)
const nav = typeof navigator !== 'undefined' ? navigator : {};
const mm = (q) => { try { return typeof matchMedia === 'function' && matchMedia(q).matches; } catch { return false; } };
const touchOnly = (nav.maxTouchPoints ?? 0) > 1 && mm('(pointer: coarse)') && !mm('(any-pointer: fine)');
export const DEVICE = {
    mobile: mobile || nav.userAgentData?.mobile === true || touchOnly,
    memGB: nav.deviceMemory ?? null,
    cores: nav.hardwareConcurrency ?? null,
    gpu: '',
    igpu: false,
};
// WebGL 렌더러 문자열(WEBGL_debug_renderer_info). 별도 1px 컨텍스트를 만들고 바로 해제한다(실패 시 빈 문자열)
function probeGpu() {
    try {
        if (typeof document === 'undefined') return '';
        const c = document.createElement('canvas'); c.width = 1; c.height = 1;
        const gl = c.getContext('webgl', { failIfMajorPerformanceCaveat: false }) || c.getContext('experimental-webgl');
        if (!gl) return '';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const r = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return r;
    } catch { return ''; }
}
if (!DEVICE.mobile) {
    DEVICE.gpu = probeGpu();
    // 내장 GPU 추정: Intel(UHD/Iris/HD Graphics, Arc 제외), AMD APU('Radeon(TM) Graphics'·'Radeon Vega'), SwiftShader/llvmpipe(소프트웨어 렌더)
    //  Apple M 시리즈는 통합이지만 충분히 빨라 제외. NVIDIA·AMD Radeon RX 는 외장
    const g = DEVICE.gpu;
    DEVICE.igpu = /Intel/i.test(g) && !/\bArc\b/i.test(g) ? true
        : /Radeon(\(TM\))?\s*(Graphics|Vega)/i.test(g) && !/\bRX\b/i.test(g) ? true
            : /SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(g);
}
function deviceQuality() {
    if (DEVICE.memGB != null && DEVICE.memGB <= 2) return 2;
    if (DEVICE.mobile) return 1;
    if ((DEVICE.cores ?? 8) <= 4 || (DEVICE.memGB ?? 8) <= 4) return 1;
    if (DEVICE.igpu) return 1;
    return 0;
}
// notify: 전투 알림 표시 방식 0 끄기 / 1 최소(기본) / 2 보통 / 3 상세 (Battle 상단 안내 배너·알림 토스트·로그 빨간 점)
// terrainSmooth: 지형 변형 표현 매끄럽게(기본)/격자. terrainBlend: 코드 경계 전이(GroundBlend) — 기본 꺼짐(전이 타일 에셋 전 임시 보조, UI 없음·콘솔 settings 로만)
// terrainStyle: 지형 렌더 'unity32'(기본, Unity 32px 타일셋 직배치 — 라이선스 미확인·개발 한정, data/unityTileset.js · fx/UnityGround.js)
//   | 'rm'(RPG Maker MV 오토타일, data/rmTileset.js) | 'legacy'(기존 64px 타일)
//   | 'v3'(시범: 자체 제작 지형 public/assets/tiles/terrain_v3, data/terrainV3.js — unity32 위에서 p f m w s r d 칸만 교체, 나머지 칸·사막/설원 바이옴은 unity32 폴백).
//     켜기(UI 없음): localStorage 'srpg.settings.v3' 에 terrainStyle:'v3', terrainStyleRev:2 저장 후 새로고침.
//   롤백: 콘솔 settings.set({terrainStyle:'rm'}) 또는 'legacy'(다음 전투 진입부터, assets 로드 분기 때문에 새로고침 권장) 또는 아래 기본값 변경.
//   terrainStyleRev: 기본값 전환 마이그레이션 표식. 저장값이 2 미만이면(이전 기본 'rm' 이 통째로 저장돼 있음) 1회 'unity32' 로 올린다. 기본값을 되돌릴 때는 STYLE_REV 도 올릴 것 terrainWaterAnim: rm 수면 3프레임 애니메이션(기본 꺼짐)
// mapArt: 맵 개편(자유 배치 소품·통그림 배경·마을/성벽 배치, data/mapArt.js). 없음(기본) = 개편 필드가 있는 맵만 자동 활성, true/객체 = 모든 맵, false = 항상 끔. 상세 docs/HANDOFF.md
// RM 지형 색 보정(코드 값, 저장 안 함): sat 채도 배율, val 명도 배율, warm 따뜻하게(R+/B-), vignette 맵 가장자리 안쪽 남색 감쇠 알파(0=끔)
// 근거: 안아트 검토(RM 풀 #81C240 S0.67 V0.76 이 UI·유닛을 압도). 콘솔 settings.set({terrainGrade:{...}}) 로 시험 덮어쓰기 가능(다음 전투부터)
// 근거 수준·각색·창작 표기(대화 '각색' 배지·'창작 대사'·역사 섹션 태그)는 코드에서 제거(사용자 방침 2026-11-03). 데이터 필드(what_if/is_invented/evidence_level)는 유지
export const TERRAIN_GRADE ={ sat: 0.72, val: 0.88, warm: 0.04, vignette: 0.35 };
const STYLE_REV = 2;
const DEFAULT_STYLE = 'unity32';
// 그래픽 품질 저장값 = '사용자가 고른 값'만. 성능 보호 자동 하향(layout.startPerfGuard)은 setAutoQuality 로 세션 한정 적용(저장 안 함).
// qualityRev 마이그레이션: 이전 빌드는 자동 하향을 settings.set 으로 영구 저장했다(구버전 데이터는 자동/수동 구분 불가).
//  자동 하향은 기본값보다 '낮은 쪽'으로만 움직이므로, 저장값이 기기 기본값보다 낮은 품질(숫자 큼)이면 1회 기본값으로 리셋하고,
//  기본값 이상(사용자만 올릴 수 있는 방향)이면 보존한다. 직접 '낮음'을 골랐던 사용자는 1회 다시 골라야 한다(이후 저장값은 보존).
const QUALITY_REV = 1;
const DEFAULT_QUALITY = deviceQuality();
const LEGACY_DEFAULT_QUALITY = lowSpec ? 1 : 0;
// 프레임 상한(fpsCap): 0 무제한 / 30 / 60(기본). 120Hz 이상 화면에서만 실제로 프레임을 건너뛴다(layout.installFrameCap). 창 포커스를 잃으면 30
// msaa: 'auto'(기본: 사용자 품질 '높음'이면 켜짐, 보통·낮음이면 끔) | true | false — WebGL 컨텍스트 생성 옵션이라 새로고침 후 적용(index.js render.antialiasGL)
// followSoldiers: 턴 종료 시 행동하지 않은 소속 일반병을 영웅 오라 반경 안으로 자동 이동(end_turn follow=true, 싱글/캠페인 전용. 방 대전은 서버가 무시). 기본 켜짐
let state = { fontLevel: 0, fxLevel: prefersReduced ? 1 : 0, speed: 1, quality: DEFAULT_QUALITY, fpsCap: 60, msaa: 'auto', notify: 1, terrainBlend: false, terrainStyle: DEFAULT_STYLE, terrainWaterAnim: false, followSoldiers: true, ...load() };
if ((state.terrainStyleRev ?? 0) < STYLE_REV) state = { ...state, terrainStyle: DEFAULT_STYLE, terrainStyleRev: STYLE_REV };
if ((state.qualityRev ?? 0) < QUALITY_REV) state = { ...state, quality: Math.min(state.quality ?? DEFAULT_QUALITY, DEFAULT_QUALITY), qualityRev: QUALITY_REV };
// qualityPicked(2026-11-14): 사용자가 설정 화면에서 품질을 직접 고른 적이 있는지. 예전 빌드는 아무 설정이나 바꾸면 기본 품질까지 함께 저장했으므로
//  표식이 없고 저장값이 '예전 기본값'과 같으면 사용자 선택이 아니라고 보고 새 기기 기본값을 쓴다(예전 기본값과 다르면 직접 고른 값 -> 보존)
if (state.qualityPicked !== true && (state.quality == null || state.quality === LEGACY_DEFAULT_QUALITY)) state = { ...state, quality: DEFAULT_QUALITY };
let userQuality = state.quality; // 저장 대상(사용자 선택). state.quality 는 자동 하향이 반영된 '유효' 품질(모든 읽기 측은 이 값을 쓴다)
const subs = new Set();
const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...state, quality: userQuality })); } catch { /* 저장 실패 무시 */ }
};

// 이번 세션 WebGL 컨텍스트에 실제로 적용된 MSAA(index.js createGame 이 기록). 설정 화면이 '새로고침 필요' 여부 판단에 사용
export const MSAA_STATE = { on: null };

export const settings = {
    get: () => state,
    set(patch) {
        if ('quality' in patch) { userQuality = patch.quality; patch = { ...patch, qualityPicked: true }; } // 사용자가 직접 고른 품질: 자동 하향 해제 + 저장
        state = { ...state, ...patch };
        persist();
        subs.forEach((fn) => fn(state));
    },
    // 세션 한정 유효 품질(자동 하향/복귀 전용, 저장 안 함). 사용자 선택값보다 높은 품질로는 올리지 않는다.
    setAutoQuality(q) {
        const eff = Math.max(userQuality, q);
        if (eff === state.quality) return;
        state = { ...state, quality: eff };
        subs.forEach((fn) => fn(state));
    },
    userQuality: () => userQuality,
    defaultQuality: () => DEFAULT_QUALITY,
    // MSAA(WebGL antialiasGL) 희망값: msaa true/false 면 그 값, 'auto'(기본)면 사용자 선택 품질이 높음(0)일 때만. 실제 적용은 게임 생성 시(새로고침 후)
    msaaWanted: () => (state.msaa === true || state.msaa === false ? state.msaa : userQuality === 0),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};
