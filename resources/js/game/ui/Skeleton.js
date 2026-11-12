import { COLOR } from '../theme.js';
import { loop } from './motion.js';

// 로딩 자리표시자(연출 끄기 시 정지)
export function createSkeleton(scene, x, y, w, h) {
    const r = scene.add.rectangle(x, y, w, h, COLOR.panelLight, 0.6).setOrigin(0);
    loop(scene, { targets: r, alpha: 0.25, duration: 700 });
    return r;
}
