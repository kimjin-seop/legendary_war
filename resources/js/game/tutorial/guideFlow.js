// 튜토리얼 개편 1차(2026-11-02): 짧은 프롤로그(prologue_short) -> 첫 전투 조작 안내(G1~G5·G4b) + 처음 마주칠 때 개념 팝업.
// 문구: data/dialogue/tutorial_guide.json(송서사). 기존 tutorial_dialogue.json(tut_00~09)은 수정하지 않고 서고 재열람용으로 그대로 둔다.
//
// 플래그(단일 지점): GUIDE_FLAGS.enabled(기본 true). 끄기 = localStorage srpg.tutorialGuide=0 또는 URL ?tutguide=0 -> 현행 흐름(10스텝 대사) 그대로.
// 노출 대상: 이 흐름(새 프롤로그)으로 튜토리얼을 시작한 사용자만(localStorage srpg.tut.newflow.<user>=1).
//   기존 tutorial_done 유저·방 PvP·이미 진행 중인 전투에는 노출하지 않는다(가이드는 '대기(pending)' 표시가 있는 다음 새 스테이지 전투에서만 시작).
// '본 기록': 개념 팝업 = localStorage srpg.tip.<id>(기존 srpg.tip.aura 형식 재사용), 가이드 = srpg.tut.guide.done.<user>
import { session } from '../api/client.js';
import { Modal } from '../ui/Modal.js';
import { makeText } from '../ui/common.js';
import { L } from '../layout.js';
import { MIN_TOUCH } from '../theme.js';

export const GUIDE_FLAGS = { enabled: true };
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장 불가: 이번 세션만 */ } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* 무시 */ } } };
const uid = () => session.user?.id ?? session.user?.name ?? 'anon';

export function guideEnabled() {
    try {
        if (new URLSearchParams(location.search).get('tutguide') === '0') return false;
        if (ls.get('srpg.tutorialGuide') === '0') return false;
    } catch { /* 무시 */ }
    return GUIDE_FLAGS.enabled;
}

// 새 흐름 사용자 표시(프롤로그 시작 시) / 가이드 대기(첫 전투에서 시작) / 완료
export const markNewFlow = () => { ls.set(`srpg.tut.newflow.${uid()}`, '1'); if (!ls.get(`srpg.tut.guide.done.${uid()}`)) ls.set(`srpg.tut.guide.pending.${uid()}`, '1'); };
export const isNewFlowUser = () => guideEnabled() && ls.get(`srpg.tut.newflow.${uid()}`) === '1';
export const guidePending = () => isNewFlowUser() && ls.get(`srpg.tut.guide.pending.${uid()}`) === '1' && !ls.get(`srpg.tut.guide.done.${uid()}`);
export const finishGuide = () => { ls.del(`srpg.tut.guide.pending.${uid()}`); ls.set(`srpg.tut.guide.done.${uid()}`, '1'); };

let guidePromise = null;
export function loadGuide() {
    if (!guidePromise) guidePromise = import('../data/dialogue/tutorial_guide.json').then((m) => m.default ?? m).catch((e) => { guidePromise = null; throw e; });
    return guidePromise;
}

// 스테이지별 짧은 안내(tutorial_guide.json stage_hints[code][kind]). 새 흐름 사용자에게 스테이지·종류별 1회(srpg.tip.hint.<code>.<kind>), 모달 1개
export function stageHint(scene, code, kind) {
    if (!code || !isNewFlowUser() || (scene.modalCount ?? 0) > 0) return false;
    const k = `srpg.tip.hint.${code}.${kind}`;
    if (ls.get(k)) return false;
    loadGuide().then((g) => {
        const lines = g?.stage_hints?.[code]?.[kind];
        if (!Array.isArray(lines) || !lines.length || !scene.sys?.isActive() || (scene.modalCount ?? 0) > 0) return;
        ls.set(k, '1');
        new Modal(scene, { title: '시오리의 조언', body: lines.join('\n'), w: 480, h: Math.max(220, 150 + lines.length * 40), buttons: [{ label: '확인', variant: 'primary' }] }); // 줄 수만큼 높이(첫 전투 3줄)
    }).catch(() => {});
    return true;
}

// 개념 팝업(1차 5종: C_aura·C_terrain·C_facing·C_cost·C_victory_result). 새 흐름 사용자에게만, 종류별 1회(srpg.tip.<key>).
// 다른 모달이 떠 있으면 미룬다(다음 기회에 다시 판단). 반환: 표시했으면 true
const POPUP_KEY = { C_aura: 'aura', C_terrain: 'terrain', C_facing: 'facing', C_cost: 'cost', C_victory_result: 'victory' };
export function conceptPopup(scene, id) {
    const key = POPUP_KEY[id];
    if (!key || !isNewFlowUser() || ls.get(`srpg.tip.${key}`) || (scene.modalCount ?? 0) > 0 || scene.__popupBusy) return false;
    scene.__popupBusy = true; // 로드 중 중복 호출 방지
    loadGuide().then((g) => {
        scene.__popupBusy = false;
        const p = (g?.concept_popups?.popups ?? []).find((x) => x.id === id);
        if (!p || !scene.sys?.isActive() || (scene.modalCount ?? 0) > 0 || (id !== 'C_victory_result' && scene.popupBlocked?.())) return; // (문구 로드 사이 연출·결과가 시작되면 생략: 하플레이 #2) 표시 못 하면 '본 기록'을 남기지 않음(다음 기회에 다시)
        ls.set(`srpg.tip.${key}`, '1'); // 문구 로드 성공·표시 직전에 기록
        const body = (p.lines ?? []).join('\n');
        // 높이 = 본문 실제 줄 수에 맞춤(하플레이 #3: 고정 230 이라 390 에서 마지막 줄이 스크롤 경계에 반쯤 잘림). 화면보다 길면 Modal 이 본문만 스크롤
        const t = makeText(scene, 0, 0, body, { size: L.short ? 16 : 18, wrap: Math.min(480, L.lw - 24) - 48 }); const th = t.height; t.destroy();
        new Modal(scene, { title: `${p.title}`, body, w: 480, h: Math.max(230, Math.ceil(62 + 12 + 8 + th + 24 + Math.max(48, MIN_TOUCH) + 32)), buttons: [{ label: '확인', variant: 'primary' }] });
    }).catch((e) => { scene.__popupBusy = false; console.warn('[guide] 개념 팝업 문구 로드 실패(생략)', e); });
    return true;
}
