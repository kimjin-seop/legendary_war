// 캐릭터 생성 진입: CharacterCreate 씬 런타임 등록(index.js 수정 금지 기간 — 잠금 해제 후 index.js scene 배열에 넣고 ensureScene 제거 가능)
// + 첫 로그인 유도(서버 profile.protagonist_needed) + 저장된 주인공(성별·초상화·클래스)을 대사 상태에 반영.
import { CharacterCreateScene } from '../scenes/CharacterCreate.js';
import { getProtagonist, protagonistNeeded } from './protagonistApi.js';
import { applyProtagonistState } from './protagonistQuiz.js';

function ensureScene(scene) {
    const mgr = scene.game.scene;
    if (!mgr.keys?.CharacterCreate) mgr.add('CharacterCreate', CharacterCreateScene, false);
}

// mode: 'create'(미생성 = 전체 흐름, 생성됨 = 현재 카드 + 초상화 변경·다시 작성) | 'face'(초상화만 변경). next: 끝나면 이동할 {scene, data}
export function openCharacterCreate(scene, { mode = 'create', next = null } = {}) {
    ensureScene(scene);
    scene.scene.start('CharacterCreate', { mode, next });
}

let tried = false;
let hydrated = false;
// 로비 첫 진입에서 아직 캐릭터 생성 필요 여부를 확인하지 않았는지(로비가 잠깐 비쳤다 생성 화면으로 넘어가는 깜빡임 방지용)
export const characterCheckPending = () => !tried;
// 로비 진입 시 1회: 필요하면 캐릭터 생성으로 이동하고 true, 아니면 저장된 주인공을 대사 상태에 반영하고 false
export async function maybeCharacterCreate(scene, profile) {
    if (!tried && protagonistNeeded(profile) && !(scene.modalCount > 0)) {
        tried = true;
        openCharacterCreate(scene, { mode: 'create', next: null }); // next 없음 = 완료 후 로비(권장안 B: ch1_open 은 ch1_s1 진입 시 campaignFlow.playBeforeStage 가 재생)
        return true;
    }
    tried = true;
    if (!hydrated) {
        hydrated = true;
        getProtagonist().then(applyProtagonistState).catch(() => { hydrated = false; });
    }
    return false;
}
