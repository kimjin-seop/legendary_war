import Phaser from 'phaser';
import { Button } from '../ui/Button.js';
import { openSettings } from '../ui/SettingsModal.js';
import { makeText, addBackdrop, addScreenBg } from '../ui/common.js';
import { noteText } from '../ui/widgets.js';
import { CSS, syncView } from '../theme.js';
import { L, setupCamera, relayoutOnChange } from '../layout.js';
import { auth, session } from '../api/client.js';
import { messageOf } from '../api/errors.js';
import { withJosa } from '../systems/josa.js';
import { audio } from '../audio.js';
import { addBrandLogo, titleLogoBox } from '../brand.js';
import { openInstallGuide, installButtonLabel } from '../ui/InstallModal.js';
import { shouldGate } from '../../pwa.js';

// 타이틀: 세션 복구(게스트 토큰/쿠키) 후 3경로(게스트로 시작 / 로그인 / 가입). 복구된 세션이 있으면 '계속하기'.
// data.notice: 다른 씬에서 넘어온 안내(세션 만료 등)
export class TitleScene extends Phaser.Scene {
    constructor() { super('Title'); }

    init(data) { this.notice = data?.notice ?? ''; this.serverError = data?.serverError ?? ''; }

    create() {
        this.modalCount = 0;
        syncView();
        setupCamera(this, CSS.bg);
        relayoutOnChange(this, () => ({ notice: this.notice }));
        addScreenBg(this, 'bgscreen_title'); // 이미지 스킨 배경(없으면 기존 패턴)
        audio.bgm('bgm_title', this); // 자동재생 잠금이면 첫 클릭/터치 후 재생
        audio.prefetchBgm([audio.lobbyBgm()], this); // 로비 트랙 예열(부팅 용량 증가 없이, 로비 진입 시 바로 재생)
        // 「레전드리 워」 로고(brand.js): 가로 logo_h / 세로 logo_stack, 해상도별 @1.5x/@3x. 텍스처가 없으면 텍스트 폴백 후 지연 로드로 교체
        const tb = titleLogoBox();
        this.side = !!tb.side; // 세로형 메인 로고 + 낮은 가로 화면: 로고 왼쪽 / 메뉴·안내 오른쪽(brand.js titleLogoBox)
        const cx = tb.side ? tb.menuX : L.lw / 2; this.cx = cx;
        const logo = addBrandLogo(this, tb.v, tb.side ? tb.cx : cx, tb.cy, { maxW: tb.maxW, maxH: tb.maxH, fallbackSize: Math.min(64, L.lw / 9), fallbackSub: true, intro: true });
        this.by = tb.side ? L.safe.t + 64 : Math.max(L.lh * 0.46, tb.cy + logo.h / 2 + 60);
        this.noteObj = noteText(this, cx, this.by - 34, this.notice, { kind: 'error', size: 16, origin: [0.5, 0.5], wrap: tb.side ? L.lw * 0.5 : L.lw - 48 });
        this.status = makeText(this, cx, this.by + 20, '세션 확인 중...', { size: 18, color: CSS.muted, origin: [0.5, 0.5] });
        this.menu = this.add.container(0, 0);
        // PWA 설치 게이트(pwa.js PWA_GATE, 기본 꺼짐): 모바일 브라우저면 설치 안내 후 '브라우저로 계속' 시에만 진행
        if (shouldGate()) { this.status.setText(''); openInstallGuide(this, { gate: true, onContinue: () => { this.status.setText('세션 확인 중...'); this.restore(); } }); } else this.restore();
    }

    async restore() {
        const r = await auth.restore();
        if (!this.sys || !this.scene?.isActive?.()) return; // 대기 중 씬이 종료·파괴되면 this.scene(ScenePlugin)이 null
        this.status.setText('');
        if (!r.ok) {
            this.noteObj.setText('! ' + (r.error?.status === 503 ? '서버 점검 중입니다. 잠시 후 다시 시도해 주세요.' : messageOf(r.error)));
            this.buttons([{ label: '다시 시도', variant: 'primary', onClick: () => this.scene.restart({}) }, { label: '설정', onClick: () => this.settings() }]);
            return;
        }
        if (session.authed) {
            const who = session.kind === 'guest' ? `게스트 ${session.name || ''}`.trim() : session.name;
            this.buttons([
                { label: `${withJosa(who, '으로/로')} 계속`, variant: 'primary', onClick: () => this.scene.start('Lobby') },
                { label: '다른 계정으로 로그인', onClick: () => this.scene.start('Auth', { mode: 'login' }) },
                ...(session.kind === 'guest' ? [{ label: '회원 가입(게스트 승격)', onClick: () => this.scene.start('Auth', { mode: 'register' }) }] : []),
                ...this.installItem(),
                { label: '설정', onClick: () => this.settings() },
            ]);
            return;
        }
        this.buttons([
            { label: '게스트로 시작', variant: 'primary', onClick: () => this.scene.start('Auth', { mode: 'guest' }) },
            { label: '로그인', onClick: () => this.scene.start('Auth', { mode: 'login' }) },
            { label: '회원 가입', onClick: () => this.scene.start('Auth', { mode: 'register' }) },
            ...this.installItem(),
            { label: '설정', onClick: () => this.settings() },
        ]);
    }

    buttons(items) {
        this.menu.removeAll(true);
        const w = Math.min(320, this.side ? L.lw * 0.5 : L.lw - 48);
        const mx = this.side ? this.cx : L.lw / 2;
        const h = 54;
        const gap = 14;
        const maxY = L.lh - L.safe.b - 16;
        let y = this.by;
        if (y + items.length * (h + gap) > maxY) y = Math.max(this.side ? L.safe.t + 40 : L.lh * 0.3, maxY - items.length * (h + gap));
        items.forEach((it, i) => {
            this.menu.add(new Button(this, { x: mx - w / 2, y: y + i * (h + gap), w, h, size: 20, label: it.label, variant: it.variant, onClick: it.onClick }));
        });
    }

    // '앱으로 설치' 메뉴(이미 앱으로 실행 중이면 숨김, ui/InstallModal.js)
    installItem() { const label = installButtonLabel(); return label ? [{ label: '앱으로 설치', onClick: () => openInstallGuide(this) }] : []; }

    settings() { openSettings(this, ({ fontChanged }) => { if (fontChanged) this.scene.restart({ notice: this.notice }); }); }
}
