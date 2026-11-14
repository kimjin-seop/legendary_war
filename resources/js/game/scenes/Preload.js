import Phaser from 'phaser';
import { generateTextures } from '../textures.js';
import { queueAssets, finishAssets } from '../assets.js';
import { makeText, addScreenBg } from '../ui/common.js';
import { Button } from '../ui/Button.js';
import { trackLoadProgress } from '../ui/LoadProgress.js';
import { createLoadingView } from '../ui/LoadingView.js';
import { CSS, syncView } from '../theme.js';
import { L, setupCamera, relayoutOnChange } from '../layout.js';
import { brandSmall, queueBrand, titleLogoBox } from '../brand.js';

// 로딩: manifest 기반 에셋(assets.js) -> 코드 생성 텍스처(없는 키만) -> 시작 씬. 실패하면 메시지와 재시도 버튼.
// 에셋 파일이 없어도(404) 로더는 계속 진행하며 사용처가 코드 생성 텍스처로 폴백한다.
export class PreloadScene extends Phaser.Scene {
    constructor() { super('Preload'); }

    preload() {
        // 로딩 화면(ui/LoadingView): 세로형 메인 로고(Boot 에서 미리 받음, 없으면 텍스트 폴백) 가운데 + 글로우 + 얇은 진행 바·% + 짧은 문구.
        // 2026-11-14: 이전 회색 스켈레톤 상자(320x16 깜빡임) 제거. 로딩 중 레이아웃이 바뀌면(주소창·회전) 뷰가 스스로 다시 그린다
        //  (이전엔 relayoutOnChange 가 create() 에서야 등록돼 preload 중 크기 변화 시 옛 좌표·옛 카메라 크기로 남았다)
        try { this.view = createLoadingView(this); } catch (e) { this.view = null; syncView(); setupCamera(this, CSS.bg); console.warn('[preload] 로딩 화면 실패(무시)', e); }
        try {
            queueBrand(this, titleLogoBox().v); // 타이틀 메인 로고(현재 방향)
            queueBrand(this, brandSmall(28)); // 로비 상단바 소형 로고
        } catch (e) { console.warn('[preload] 로고 실패(무시)', e); }
        try { queueAssets(this); } catch (e) { console.warn('[preload] 에셋 큐 실패(폴백)', e); } // boot scope 만(초상화·전투·뽑기 에셋은 각 화면 진입 시)
        trackLoadProgress(this, { view: this.view }); // 진행률 % · x/yMB
    }

    create() {
        relayoutOnChange(this);
        try {
            finishAssets(this);
            generateTextures(this);
            this.scene.start(this.game.registry.get('startScene') ?? 'Title', this.game.registry.get('startData'));
        } catch (e) {
            console.error('[preload]', e);
            this.view?.destroy();
            addScreenBg(this, 'bgscreen_title'); // 이미지 스킨 배경(없으면 기존 패턴)
            makeText(this, L.lw / 2, L.lh / 2 - 40, '불러오기에 실패했습니다', { size: 24, bold: true, color: CSS.dangerText, origin: [0.5, 0.5] });
            new Button(this, { x: L.lw / 2 - 80, y: L.lh / 2, w: 160, label: '재시도', variant: 'primary', onClick: () => this.scene.restart() });
        }
    }
}
