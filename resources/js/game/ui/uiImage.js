// ui.* 단일 이미지(manifest 키, 일반 scope 로더가 건너뛰는 접두) 지연 로드 공용 함수.
// 반환 = 텍스처 키(이미 있으면) | null(manifest 에 없음 또는 로드 전). 로드 전이면 요청 후 도착 시 onReady(키). 실패하면 호출 안 함(호출 측 코드 그림 폴백 유지)
import { loaded, texKey, withVer } from '../assets.js';

const REQ = new WeakMap(); // scene -> Set(요청한 키): 같은 씬에서 중복 요청 방지
export const uiHas = (lg) => !!loaded.manifest?.[lg]?.path;
export function uiImageLoad(scene, lg, onReady = null) {
    const ent = loaded.manifest?.[lg];
    if (!ent?.path) return null;
    const tk = texKey(lg);
    if (scene.textures.exists(tk)) return tk;
    if (onReady) scene.load.once(`filecomplete-image-${tk}`, () => { if (scene.sys?.isActive?.() !== false) onReady(tk); });
    let s = REQ.get(scene); if (!s) { s = new Set(); REQ.set(scene, s); }
    if (!s.has(tk)) { s.add(tk); const p = String(ent.path); scene.load.image(tk, withVer(p.startsWith('/') ? p : `/${p}`)); }
    if (!scene.load.isLoading()) scene.load.start();
    return null;
}
// 이미지가 준비되면 cb(키) 한 번(이미 있으면 즉시). manifest 에 없으면 false
export function withUiImage(scene, lg, cb) {
    if (!uiHas(lg)) return false;
    const k = uiImageLoad(scene, lg, cb);
    if (k) cb(k);
    return true;
}
