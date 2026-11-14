import Phaser from 'phaser';
import { BootScene } from './scenes/Boot.js';
import { installClientErrorReporter } from './api/clientErrors.js';
import { installInputGuard } from './inputGuard.js';
import { PreloadScene } from './scenes/Preload.js';
import { TitleScene } from './scenes/Title.js';
import { LobbyScene } from './scenes/Lobby.js';
import { BattleScene } from './scenes/Battle.js';
import { UiDemoScene } from './scenes/UiDemo.js';
import { AuthScene } from './scenes/Auth.js';
import { DeployScene } from './scenes/Deploy.js';
import { RoomScene } from './scenes/Room.js';
import { DialogueScene } from './scenes/Dialogue.js';
import { WarScene } from './scenes/War.js';
import { GachaScene } from './scenes/Gacha.js';
import { CSS } from './theme.js';
import { L, computeLayout, watchLayout, startPerfGuard, applyCanvasRendering, installFrameCap } from './layout.js';
import { settings, MSAA_STATE } from './settings.js';
import { watchContextLoss } from './contextLoss.js';
import { session } from './api/client.js';
import { mountPerfOverlay } from './perfOverlay.js';

// 방어: 파괴된 Text(장면 shutdown·모달 닫힘 뒤 비동기 콜백의 setText)는 frame.data 가 null 이라
// Phaser 내부 Frame.updateUVs 에서 "Cannot read properties of null (reading 'drawImage')" 가 난다 -> 파괴된 Text 갱신은 무시
if (!Phaser.GameObjects.Text.prototype.__srpgSafeUpdate) {
    const orig = Phaser.GameObjects.Text.prototype.updateText;
    Phaser.GameObjects.Text.prototype.updateText = function safeUpdateText(...args) {
        if (!this.frame?.data || !this.canvas) return this;
        return orig.apply(this, args);
    };
    Phaser.GameObjects.Text.prototype.__srpgSafeUpdate = true;
}

// 스케일: Scale.NONE + zoom(1/R). 캔버스 백킹 크기 = CSS 크기 x R(고DPI·그래픽 품질 반영, 품질 높음이면 백킹 = 디바이스 px, 상한 4K),
// 캔버스 CSS 보간은 layout.applyCanvasRendering(정수 배율이면 pixelated). pixelArt 는 끔(초상화·일러스트 축소 보간 유지), 도트 텍스처만 NEAREST.
// CSS 크기 = 호스트 요소 100% (레터박스 없음). resize/회전은 layout.js 가 디바운스 후 game.scale.resize + 'layout' 이벤트로 처리.
// (Phaser RESIZE 모드는 CSS px 단위로만 캔버스가 정해져 DPR 선명도를 줄 수 없어 NONE+zoom 방식을 사용)
export function createGame(parent, { scene, sceneData } = {}) {
    computeLayout(parent.clientWidth || window.innerWidth, parent.clientHeight || window.innerHeight);
    const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: L.bw,
        height: L.bh,
        backgroundColor: CSS.bg,
        scale: { mode: Phaser.Scale.NONE, zoom: 1 / L.R },
        // antialiasGL = WebGL 컨텍스트 MSAA(가장자리 계단 완화). 2026-11-14 성능 1단계: 설정 msaa('auto' = 사용자 품질 높음일 때만 켬, 새로고침 후 적용).
        //  주의: antialias:false 는 텍스처 필터까지 NEAREST 로 바꾸므로(초상화·일러스트 모아레) 절대 끄지 않는다 — MSAA 만 antialiasGL 로 끈다
        render: { antialias: true, antialiasGL: (MSAA_STATE.on = settings.msaaWanted()), roundPixels: true },
        input: { activePointers: 3 },
        disableContextMenu: true,
        banner: false,
        scene: [BootScene, PreloadScene, TitleScene, AuthScene, LobbyScene, DeployScene, RoomScene, BattleScene, DialogueScene, WarScene, GachaScene, UiDemoScene],
    });
    installClientErrorReporter(game); // #17 클라이언트 에러 리포트(window error/unhandledrejection -> POST /api/client-errors, 실패 무시)
    applyCanvasRendering(game); // 문서 로드 후면 boot 가 동기라 캔버스가 이미 있다
    game.events.once('ready', () => applyCanvasRendering(game)); // 아닌 경우(DOMContentLoaded 대기) 대비
    game.registry.set('startScene', scene ?? 'Title');
    game.registry.set('startData', sceneData ?? undefined); // 시작 씬에 넘길 data(예: Dialogue {source,id})
    const stopWatch = watchLayout(game, parent);
    const stopCap = installFrameCap(game); // 프레임 상한(settings.fpsCap, 120Hz 이상에서만 실제 건너뜀, blur 30)
    const stopPerf = startPerfGuard(game);
    const stopCtx = watchContextLoss(game); // WebGL 컨텍스트 손실 안내·복구 실패 시 새로고침 안내
    const stopGuard = installInputGuard(game); // 앱 복귀 시 입력 복구 + 모달 잠금 누수 감시(inputGuard.js)
    const stopPerfOverlay = mountPerfOverlay(game); // ?perf=1 일 때만 측정 오버레이 + window.__perf()(없으면 아무것도 안 함)
    // 401(세션 만료/토큰 무효): 어느 씬이든 타이틀로 보낸다(이미 타이틀/인증 화면이면 유지)
    const offAuth = session.on('unauthenticated', () => {
        const active = game.scene.getScenes(true)[0];
        if (!active || ['Title', 'Auth', 'Boot', 'Preload', 'UiDemo'].includes(active.scene.key)) return;
        active.scene.start('Title', { notice: '세션이 만료되었습니다. 다시 로그인하거나 게스트로 시작해 주세요.' });
    });
    game.events.once('destroy', () => { stopWatch(); stopCap(); stopPerf(); stopCtx(); stopGuard(); stopPerfOverlay(); offAuth(); });
    return game;
}
