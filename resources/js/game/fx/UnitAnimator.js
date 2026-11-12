import { settings } from '../settings.js';
import { L } from '../layout.js';
import { TILE } from '../UnitView.js';

// 유닛 모션 공용 업데이트 루프(씬 update 에서 1회 호출). 유닛별 트윈을 만들지 않으므로 유닛 100개에서도 비용이 작다.
// - idle 호흡: 연출 풀(fxLevel 0) + 그래픽 품질 높음·보통(quality < 2)일 때. 축약/끄기/품질 낮음(자동 하향 포함)이면 정지 이미지.
//   (이전: quality 0 만 허용해 모바일 기본 '보통'·자동 하향 사용자는 유닛이 가만히 서 있었다. idle 은 공용 루프의 저비용 연출)
// - acted(행동 완료) 유닛은 모션 정지(어둡게는 UnitView.setActed). 화면 밖 유닛은 갱신 생략.
// - 걷기(walkDir)는 이동 연출 자체의 일부이므로 idle 설정과 무관하게 동작한다(이동 트윈이 즉시 완료되면 walkStop 으로 곧바로 끝남).
// - 선택 유닛 링은 idle 이 켜져 있으면 펄스(초당 1회), 아니면 정지 표시.
export class UnitAnimator {
    constructor(scene, getViews, world) {
        this.scene = scene;
        this.getViews = getViews;
        this.world = world;
    }

    update(time) {
        const st = settings.get();
        const idleOn = st.fxLevel === 0 && st.quality < 2; // 높음·보통(모바일 저사양 기본 보통 포함). 낮음/연출 축약·끄기면 정지
        const w = this.world;
        const s = w.scaleX;
        const pad = TILE * s * 1.5;
        const t = time / 1000;
        // 발밑 오라 링 펄스: 연출 풀 + 품질 낮음 아님일 때만, 교전 컷신 재생 중(cut 컨테이너에 자식 있음)에는 정지
        const auraPulse = st.fxLevel === 0 && st.quality < 2 && !(this.scene.cut?.list?.length);
        this.getViews().forEach((v) => {
            if (v.aura) v.tickAura(t, auraPulse);
            if (v.selected) v.ring.setAlpha(idleOn ? 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2)) : 0.9);
            if (!v.sprite) return;
            if (v.walkDir) { v.walkTick(time); return; }
            const sx = w.x + v.c.x * s;
            const sy = w.y + v.c.y * s;
            if (sx < -pad || sy < -pad || sx > L.lw + pad || sy > L.lh + pad) return; // 화면 밖 생략
            if (!idleOn || v.acted) { if (v.posed) v.resetPose(); return; }
            v.applyIdle(0.5 - 0.5 * Math.cos(((t + v.phase) / v.period) * Math.PI * 2));
        });
    }
}
