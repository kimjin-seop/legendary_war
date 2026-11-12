// 사용자 설정 (localStorage 저장). 글자 크기 3단계는 fontLevel 하나로 theme.fs()가 스케일한다.
// fxLevel: 0 풀 / 1 축약 / 2 끄기 (prefers-reduced-motion이면 기본 축약), speed: 1/2/4배속
// quality: 0 높음 / 1 보통 / 2 낮음 (저사양 모바일 기본 보통, 프레임 저하 시 세션 한정 자동 하향 — 아래 setAutoQuality)
const KEY = 'srpg.settings.v3';

function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}

const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const lowSpec = mobile || (navigator.hardwareConcurrency ?? 8) <= 4 || (navigator.deviceMemory ?? 8) <= 4;
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
const DEFAULT_QUALITY = lowSpec ? 1 : 0;
// followSoldiers: 턴 종료 시 행동하지 않은 소속 일반병을 영웅 오라 반경 안으로 자동 이동(end_turn follow=true, 싱글/캠페인 전용. 방 대전은 서버가 무시). 기본 켜짐
let state = { fontLevel: 0, fxLevel: prefersReduced ? 1 : 0, speed: 1, quality: DEFAULT_QUALITY, notify: 1, terrainBlend: false, terrainStyle: DEFAULT_STYLE, terrainWaterAnim: false, followSoldiers: true, ...load() };
if ((state.terrainStyleRev ?? 0) < STYLE_REV) state = { ...state, terrainStyle: DEFAULT_STYLE, terrainStyleRev: STYLE_REV };
if ((state.qualityRev ?? 0) < QUALITY_REV) state = { ...state, quality: Math.min(state.quality ?? DEFAULT_QUALITY, DEFAULT_QUALITY), qualityRev: QUALITY_REV };
let userQuality = state.quality; // 저장 대상(사용자 선택). state.quality 는 자동 하향이 반영된 '유효' 품질(모든 읽기 측은 이 값을 쓴다)
const subs = new Set();
const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...state, quality: userQuality })); } catch { /* 저장 실패 무시 */ }
};

export const settings = {
    get: () => state,
    set(patch) {
        if ('quality' in patch) userQuality = patch.quality; // 사용자가 직접 고른 품질: 자동 하향 해제 + 저장
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
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};
