// 튜토리얼 개편 1차(2026-11-02): 짧은 프롤로그(prologue_short) -> 첫 전투 조작 안내(G1~G5·G4b) + 처음 마주칠 때 개념 팝업.
// 문구: data/dialogue/tutorial_guide.json(송서사). 기존 tutorial_dialogue.json(tut_00~09)은 수정하지 않고 서고 재열람용으로 그대로 둔다.
// 2026-11-14 시오리 브리핑 통일: 개념 팝업·스테이지 안내를 Modal 대신 ui/ShioriBrief(하단 대사 박스 + 시오리 초상) 큐로 표시.
//   문구 우선순위 = data/dialogue/shiori_brief.json(tutorial/briefData.js, 있으면) > tutorial_guide.json(폴백).
//
// 플래그(단일 지점 GUIDE_FLAGS):
//   enabled(기본 true)      끄기 = localStorage srpg.tutorialGuide=0 또는 URL ?tutguide=0 -> 현행 흐름(10스텝 대사) 그대로.
//   shioriBrief(기본 true)  끄기 = localStorage srpg.shioriBrief=0 또는 URL ?shioribrief=0 -> 이전 Modal 팝업·이전 조작 안내 말풍선.
//   conceptForAll(기본 true) 개념 팝업을 기존 유저(새 흐름이 아닌 사용자)에게도 1회 노출. false = 새 흐름 사용자만(이전 조건).
// 노출 대상: 조작 안내(G)·스테이지 안내 = 이 흐름(새 프롤로그)으로 튜토리얼을 시작한 사용자만(localStorage srpg.tut.newflow.<user>=1, 기존 조건 유지).
//   개념 팝업 = conceptForAll 이면 모든 사용자(종류별 1회). 방 PvP 제외는 호출부(Battle/Deploy).
// '본 기록'(localStorage, 서버 이전 없음): 개념 팝업 = srpg.tip.<key>(기존 srpg.tip.aura 형식 재사용), 스테이지 안내 = srpg.tip.hint.<code>.<kind>, 가이드 = srpg.tut.guide.done.<user>
import { session } from '../api/client.js';
import { Modal } from '../ui/Modal.js';
import { makeText } from '../ui/common.js';
import { L } from '../layout.js';
import { MIN_TOUCH } from '../theme.js';
import { enqueueBrief, briefQueued, BRIEF_PRI } from '../ui/ShioriBrief.js';
import { briefPages } from './briefData.js';

export const GUIDE_FLAGS = { enabled: true, shioriBrief: true, conceptForAll: true };
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장 불가: 이번 세션만 */ } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* 무시 */ } } };
export const tipStore = ls;
const uid = () => session.user?.id ?? session.user?.name ?? 'anon';
const urlOff = (name) => { try { return new URLSearchParams(location.search).get(name) === '0'; } catch { return false; } };

export function guideEnabled() {
    if (urlOff('tutguide') || ls.get('srpg.tutorialGuide') === '0') return false;
    return GUIDE_FLAGS.enabled;
}
// 시오리 브리핑 외형 사용 여부(끄면 이전 Modal·말풍선)
export function briefOn() {
    if (urlOff('shioribrief') || ls.get('srpg.shioriBrief') === '0') return false;
    return GUIDE_FLAGS.shioriBrief;
}

// 새 흐름 사용자 표시(프롤로그 시작 시) / 가이드 대기(첫 전투에서 시작) / 완료
export const markNewFlow = () => { ls.set(`srpg.tut.newflow.${uid()}`, '1'); if (!ls.get(`srpg.tut.guide.done.${uid()}`)) ls.set(`srpg.tut.guide.pending.${uid()}`, '1'); };
export const isNewFlowUser = () => guideEnabled() && ls.get(`srpg.tut.newflow.${uid()}`) === '1';
// 개념 팝업 대상: 새 흐름 사용자 + (conceptForAll 이면) 기존 사용자도
export const conceptEligible = () => isNewFlowUser() || (guideEnabled() && GUIDE_FLAGS.conceptForAll && briefOn());
export const guidePending = () => isNewFlowUser() && ls.get(`srpg.tut.guide.pending.${uid()}`) === '1' && !ls.get(`srpg.tut.guide.done.${uid()}`);
export const guideDone = () => !!ls.get(`srpg.tut.guide.done.${uid()}`);
export const finishGuide = () => { ls.del(`srpg.tut.guide.pending.${uid()}`); ls.set(`srpg.tut.guide.done.${uid()}`, '1'); };

let guidePromise = null;
export function loadGuide() {
    if (!guidePromise) guidePromise = import('../data/dialogue/tutorial_guide.json').then((m) => m.default ?? m).catch((e) => { guidePromise = null; throw e; });
    return guidePromise;
}

// 스테이지별 짧은 안내(tutorial_guide.json stage_hints[code][kind]). 새 흐름 사용자에게 스테이지·종류별 1회(srpg.tip.hint.<code>.<kind>)
export function stageHint(scene, code, kind, tokens = {}) { // tokens = shiori_brief.json 토큰 값(예: 배치 화면 max_cost)
    if (!code || !isNewFlowUser()) return false;
    const k = `srpg.tip.hint.${code}.${kind}`;
    if (ls.get(k)) return false;
    if (!briefOn()) return legacyStageHint(scene, code, kind, k);
    const key = `hint:${code}:${kind}`;
    if (briefQueued(scene, key)) return true;
    const pages = loadGuide().then((g) => {
        const lines = g?.stage_hints?.[code]?.[kind];
        return briefPages(key, Array.isArray(lines) ? lines : [], 'neutral', typeof tokens === 'function' ? tokens() : tokens);
    });
    return enqueueBrief(scene, { key, pri: BRIEF_PRI.hint, pages, onShow: () => ls.set(k, '1') }); // 표시 직전에 기록(건너뛰기·끝까지 봄 모두 '본 것')
}

// 개념 팝업(1차 5종: C_aura·C_terrain·C_facing·C_cost·C_victory_result). 종류별 1회(srpg.tip.<key>). 반환: 큐에 넣었으면(또는 이미 대기 중) true
// 연결 코드 없는 C_affinity·C_hero_down 은 여기 표에 넣지 않는다(2026-11-14 지시: 보고만). C_gacha = 로비(Lobby.maybeGachaConcept) 연결(강화면 v8 펜 안내)
export const POPUP_KEY = { C_aura: 'aura', C_terrain: 'terrain', C_facing: 'facing', C_cost: 'cost', C_victory_result: 'victory', C_gacha: 'gacha' };
export function conceptPopup(scene, id, tokens = {}) { // tokens = shiori_brief.json 토큰 값(C_cost max_cost, C_victory_result reward_exp·reward_gold). 값이 없으면 그 문장만 빠짐
    const key = POPUP_KEY[id];
    if (!key || !conceptEligible() || ls.get(`srpg.tip.${key}`)) return false;
    if ((scene.constructor?.startData?.mode ?? scene.mode) === 'room') return false; // 방 PvP 제외(기존 유저까지 넓히면서 결과창 승리 팝업이 대전에 뜨지 않게)
    if (!briefOn()) return legacyConceptPopup(scene, id, key);
    const qk = `concept:${id}`;
    if (briefQueued(scene, qk)) return true;
    const pages = loadGuide().then((g) => {
        const p = (g?.concept_popups?.popups ?? []).find((x) => x.id === id);
        return briefPages(qk, p?.lines ?? [], p?.expr ?? 'neutral', typeof tokens === 'function' ? tokens() : tokens);
    });
    const victory = id === 'C_victory_result';
    return enqueueBrief(scene, {
        key: qk, pri: BRIEF_PRI.concept, pages,
        overModal: victory, // 승리 정산: 결과창(모달) 위 상단에 표시
        popupCheck: !victory, // 연출 재생 중·결과 진입 후에는 보류(하플레이 #2)
        valid: id === 'C_facing' ? () => scene.store?.state?.phase === 'facing' && !ls.get('srpg.tip.facing') : () => !ls.get(`srpg.tip.${key}`), // 방향 선택 단계가 지나면(또는 G4c 로 이미 안내됨) 기록 없이 버림
        onShow: () => ls.set(`srpg.tip.${key}`, '1'),
    });
}

// G4c(방향 선택 조작 안내)가 뜬 흐름: C_facing 과 문구가 겹치므로 C_facing 을 '본 것'으로 기록하고 건너뜀(둘 다 srpg.tip 기록)
export function markFacingCovered() { ls.set('srpg.tip.facing', '1'); ls.set('srpg.tip.guide.G4c_facing', '1'); }

// ---------- 이전 방식(플래그 shioriBrief=0) ----------
function legacyStageHint(scene, code, kind, k) {
    if ((scene.modalCount ?? 0) > 0 || scene.__popupBusy) return false; // 개념 팝업 로드 중이면 이번엔 생략(이전 동작: 둘 중 하나만)
    loadGuide().then((g) => {
        const lines = g?.stage_hints?.[code]?.[kind];
        if (!Array.isArray(lines) || !lines.length || !scene.sys?.isActive() || (scene.modalCount ?? 0) > 0) return;
        ls.set(k, '1');
        new Modal(scene, { title: '시오리의 조언', body: lines.join('\n'), w: 480, h: Math.max(220, 150 + lines.length * 40), buttons: [{ label: '확인', variant: 'primary' }] });
    }).catch(() => {});
    return true;
}
function legacyConceptPopup(scene, id, key) {
    if ((scene.modalCount ?? 0) > 0 || scene.__popupBusy) return false;
    scene.__popupBusy = true; // 로드 중 중복 호출 방지
    loadGuide().then((g) => {
        scene.__popupBusy = false;
        const p = (g?.concept_popups?.popups ?? []).find((x) => x.id === id);
        if (!p || !scene.sys?.isActive() || (scene.modalCount ?? 0) > 0 || (id !== 'C_victory_result' && scene.popupBlocked?.())) return;
        ls.set(`srpg.tip.${key}`, '1');
        const body = (p.lines ?? []).join('\n');
        const t = makeText(scene, 0, 0, body, { size: L.short ? 16 : 18, wrap: Math.min(480, L.lw - 24) - 48 }); const th = t.height; t.destroy();
        new Modal(scene, { title: `${p.title}`, body, w: 480, h: Math.max(230, Math.ceil(62 + 12 + 8 + th + 24 + Math.max(48, MIN_TOUCH) + 32)), buttons: [{ label: '확인', variant: 'primary' }] });
    }).catch((e) => { scene.__popupBusy = false; console.warn('[guide] 개념 팝업 문구 로드 실패(생략)', e); });
    return true;
}
