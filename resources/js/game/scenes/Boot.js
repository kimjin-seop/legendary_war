import Phaser from 'phaser';
import { loadingLogoBox, queueBrand } from '../brand.js';

// 폰트 로딩 완료 전 렌더 깨짐 방지: Pretendard(@font-face, resources/css/app.css)와 document.fonts.ready 대기 후 진행.
// 로딩 화면(Preload) 세로형 로고를 미리 받는다(실패해도 진행, Preload 는 텍스트 폴백).
export class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }

    preload() {
        try { queueBrand(this, loadingLogoBox().v); } catch (e) { console.warn('[boot] 로고 큐 실패', e); }
    }

    create() {
        const go = () => this.scene.start('Preload');
        if (!document.fonts) { go(); return; }
        Promise.all([document.fonts.load('400 16px "Pretendard"'), document.fonts.load('700 16px "Pretendard"')])
            .catch(() => {})
            .then(() => document.fonts.ready)
            .then(go, go);
    }
}
