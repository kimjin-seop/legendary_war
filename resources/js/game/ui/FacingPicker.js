import Phaser from 'phaser';
import { MIN_TOUCH, view } from '../theme.js';
import { Button } from './Button.js';
import { placeNear } from './ContextMenu.js';
import { DIRS, DIR_VEC, DIR_GLYPH } from '../systems/facing.js';

// 대기 방향 선택(방향 시스템 on 일 때만 사용): 유닛 4변에 화살표 버튼 4개(현재 선택 방향 = 금색 primary).
// 탭/클릭 = 즉시 확정(onPick). 방향키 선택 + Enter 확정, Esc 취소는 Battle 씬 키 입력이 store 로 처리한다.
// 터치 영역은 Button 이 실제 화면 MIN_TOUCH(44px) 이상을 보장한다. 유닛이 맵 가장자리여서 4변 배치가 영역을 벗어나면
// 유닛을 가리지 않도록 유닛 옆(placeNear)에 가로 한 줄로 배치한다(겹침 방지).
export class FacingPicker extends Phaser.GameObjects.Container {
    constructor(scene, { anchor, bounds, selected, onPick, touch = false }) {
        super(scene, 0, 0);
        const bs = Math.max(48, Math.ceil(MIN_TOUCH / (view.scale || 1))); // 버튼 한 변(설계 단위)
        const cx = anchor.x + anchor.w / 2;
        const cy = anchor.y + anchor.h / 2;
        const d = Math.max(anchor.w / 2 + bs / 2 + 2, bs + 2); // 4변 버튼끼리 겹치지 않는 최소 거리
        const fits = cx - d - bs / 2 >= bounds.x && cx + d + bs / 2 <= bounds.x + bounds.w && cy - d - bs / 2 >= bounds.y && cy + d + bs / 2 <= bounds.y + bounds.h;
        this.rects = [];
        const make = (dir, x, y) => {
            const b = new Button(scene, { x: x - bs / 2, y: y - bs / 2, w: bs, h: bs, label: DIR_GLYPH[dir], size: 24, variant: dir === selected ? 'primary' : 'default', onClick: () => onPick(dir) });
            this.add(b);
            this.rects.push({ x: x - bs / 2, y: y - bs / 2, w: bs, h: bs });
        };
        if (fits) {
            DIRS.forEach((dir) => { const [vx, vy] = DIR_VEC[dir]; make(dir, cx + vx * d, cy + vy * d); });
        } else {
            const gap = 6;
            const w = bs * 4 + gap * 3;
            const pos = placeNear(anchor, w, bs, bounds, touch ? ['top', 'bottom', 'right', 'left'] : ['bottom', 'top', 'right', 'left'], 8);
            ['left', 'up', 'down', 'right'].forEach((dir, i) => make(dir, pos.x + bs / 2 + i * (bs + gap), pos.y + bs / 2));
        }
        scene.add.existing(this);
    }

    // 화면 좌표가 선택기 위인지(맵 호버 커서 갱신 억제용)
    contains(px, py) { return this.rects.some((r) => px >= r.x - 6 && px <= r.x + r.w + 6 && py >= r.y - 6 && py <= r.y + r.h + 6); }
}
