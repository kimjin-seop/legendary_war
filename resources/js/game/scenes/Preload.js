import Phaser from 'phaser';
import { generateTextures } from '../textures.js';
import { queueAssets, finishAssets } from '../assets.js';
import { makeText, addBackdrop, addScreenBg } from '../ui/common.js';
import { Button } from '../ui/Button.js';
import { createSkeleton } from '../ui/Skeleton.js';
import { trackLoadProgress } from '../ui/LoadProgress.js';
import { CSS, syncView } from '../theme.js';
import { L, setupCamera, relayoutOnChange } from '../layout.js';
import { addBrandLogo, brandSmall, loadingLogoBox, queueBrand, titleLogoBox } from '../brand.js';

// 로딩: manifest 기반 에셋(assets.js) -> 코드 생성 텍스처(없는 키만) -> 시작 씬. 실패하면 메시지와 재시도 버튼.
// 에셋 파일이 없어도(404) 로더는 계속 진행하며 사용처가 코드 생성 텍스처로 폴백한다.
export class PreloadScene extends Phaser.Scene {
    constructor() { super('Preload'); }

    preload() {
        syncView();
        setupCamera(this, CSS.bg);
        // 세로형 로고(Boot 에서 미리 받음, 없으면 텍스트 폴백) + 진행 바. 로고 바닥이 진행 바 위 24단위
        try {
            const lb = loadingLogoBox();
            this.logo = addBrandLogo(this, lb.v, L.lw / 2, L.lh / 2 - 32, { maxW: lb.maxW, maxH: lb.maxH, origin: [0.5, 1], fallbackSize: 40, fallbackSub: true, lazy: false }).obj;
            queueBrand(this, titleLogoBox().v); // 타이틀 메인 로고(현재 방향)
            queueBrand(this, brandSmall(28)); // 로비 상단바 소형 로고
        } catch (e) { console.warn('[preload] 로고 실패(무시)', e); }
        this.sk = createSkeleton(this, L.lw / 2 - 160, L.lh / 2 - 8, 320, 16);
        this.label = makeText(this, L.lw / 2, L.lh / 2 + 24, '불러오는 중 0%', { size: 16, color: CSS.muted, origin: [0.5, 0] });
        try { queueAssets(this); } catch (e) { console.warn('[preload] 에셋 큐 실패(폴백)', e); } // boot scope 만(초상화·전투·뽑기 에셋은 각 화면 진입 시)
        trackLoadProgress(this, { label: this.label }); // '불러오는 중 N% · x/yMB · 남은 n개'
    }

    create() {
        relayoutOnChange(this);
        try {
            finishAssets(this);
            generateTextures(this);
            this.scene.start(this.game.registry.get('startScene') ?? 'Title', this.game.registry.get('startData'));
        } catch (e) {
            console.error('[preload]', e);
            this.sk.destroy();
            this.label.destroy();
            this.logo?.destroy();
            addScreenBg(this, 'bgscreen_title'); // 이미지 스킨 배경(없으면 기존 패턴)
            makeText(this, L.lw / 2, L.lh / 2 - 40, '불러오기에 실패했습니다', { size: 24, bold: true, color: CSS.dangerText, origin: [0.5, 0.5] });
            new Button(this, { x: L.lw / 2 - 80, y: L.lh / 2, w: 160, label: '재시도', variant: 'primary', onClick: () => this.scene.restart() });
        }
    }
}
