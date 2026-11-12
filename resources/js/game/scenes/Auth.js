import Phaser from 'phaser';
import { Button } from '../ui/Button.js';
import { Panel } from '../ui/Panel.js';
import { makeText, addBackdrop, addScreenBg } from '../ui/common.js';
import { DomInput, bindInputsToModal } from '../ui/DomInput.js';
import { Checkbox, noteText, alertModal } from '../ui/widgets.js';
import { CSS, syncView } from '../theme.js';
import { L, setupCamera, relayoutOnChange } from '../layout.js';
import { auth, session } from '../api/client.js';
import { messageOf, ERROR_MESSAGES, CODE_FIELD } from '../api/errors.js';
import { audio } from '../audio.js';
import { addBrandLogo, brandVariant } from '../brand.js';

// 인증 화면 3모드: guest(닉네임) / login(이메일·비밀번호) / register(캐릭터명 실시간 확인·이메일·비밀번호·확인·약관).
// 입력은 DomInput(오버레이) 이고 라벨/오류/버튼은 Phaser. 레이아웃 변경 시 restart 되므로 입력값은 this.form 으로 보존한다.
const NAME_RE = /^[가-힣A-Za-z0-9]{2,12}$/;
const NAME_REASON = { length: ERROR_MESSAGES.name_length, invalid_chars: ERROR_MESSAGES.name_invalid_chars, digits_only: ERROR_MESSAGES.name_digits_only, forbidden: ERROR_MESSAGES.name_forbidden, taken: ERROR_MESSAGES.name_taken };

function localNameReason(name) {
    if (name.length < 2 || name.length > 12) return 'length';
    if (!NAME_RE.test(name)) return 'invalid_chars';
    if (/^\d+$/.test(name)) return 'digits_only';
    return null;
}

export class AuthScene extends Phaser.Scene {
    constructor() { super('Auth'); }

    init(data) {
        this.mode = data?.mode ?? 'login';
        this.form = data?.form ?? {};
        this.terms = data?.terms ?? false;
    }

    create() {
        this.modalCount = 0;
        this.inputs = {};
        this.errors = {};
        this.busy = false;
        syncView();
        setupCamera(this, CSS.bg);
        relayoutOnChange(this, () => ({ mode: this.mode, form: this.collect(), terms: this.terms }));
        audio.bgm('bgm_title', this); // 타이틀과 같은 트랙이면 끊기지 않고 이어짐
        addScreenBg(this, 'bgscreen_title'); // 이미지 스킨 배경(없으면 기존 패턴)
        const titles = { guest: '게스트로 시작', login: '로그인', register: session.kind === 'guest' ? '회원 가입 (게스트 승격)' : '회원 가입' };
        const m = 12;
        const w = Math.min(520, L.lw - L.safe.l - L.safe.r - m * 2);
        const rows = this.mode === 'register' ? 5 : this.mode === 'login' ? 2 : 1;
        const rowH = 92;
        const headH = 62 + (this.mode === 'register' && session.kind === 'guest' ? 44 : 0);
        const h = Math.min(L.lh - L.safe.t - L.safe.b - m * 2, headH + rows * rowH + 40 + 150 + (this.mode === 'register' ? 24 : 0)); // 가입: 2줄 힌트 여유
        const px = (L.lw - w) / 2; const py = Math.max(L.safe.t + m, (L.lh - h) / 2);
        const p = new Panel(this, { x: px, y: py, w, h, title: titles[this.mode] });
        // 패널 위 남는 공간이 있으면 가로형 로고(사양 최소 48 CSS px 이상일 때만, 패널 배치는 그대로). 없으면 생략
        const logoRoom = py - L.safe.t - m * 2;
        if (logoRoom >= 48 / (L.ui * 1.5)) {
            const lmaxW = Math.min(w, 420); const lmaxH = Math.min(logoRoom, 120);
            addBrandLogo(this, brandVariant('logo_h', lmaxW, lmaxH), L.lw / 2, py - m, { maxW: lmaxW, maxH: lmaxH, origin: [0.5, 1], fallbackSize: 28 });
        }
        let y = p.bodyY + 4;
        const ix = 24; const iw = w - 48;
        if (this.mode === 'register' && session.kind === 'guest') {
            // session.name 이 비어 있으면 '게스트()' 대신 이름 없이 안내(폴백)
            const gName = String(session.name ?? '').trim();
            const gNote = noteText(this, ix, y, `현재 게스트${gName ? `(${gName})` : ' 계정'}의 진행 데이터를 유지한 채 회원으로 전환됩니다.`, { kind: 'info', size: 14, wrap: iw });
            p.add(gNote);
            y += Math.max(44, gNote.height + 8);
        }
        const field = (key, label, opts, hint, aside) => {
            const lab = makeText(this, ix, y, label, { size: 15, color: CSS.muted });
            p.add(lab);
            if (aside) { // 라벨 옆 고정 규칙 한 줄(입력 중 힌트 줄이 실시간 오류로 바뀌어도 유지). 폭이 모자라면 축소
                const a = makeText(this, ix + lab.width + 8, y + 2, aside, { size: 13, color: CSS.muted });
                const room = iw - lab.width - 8;
                if (a.width > room && room > 0) a.setScale(room / a.width);
                p.add(a);
            }
            const inp = new DomInput(this, { x: px + ix, y: py + y + 22, w: iw, h: 44, value: this.form[key] ?? '', name: key, ariaLabel: label, onEnter: () => this.submit(), ...opts });
            this.inputs[key] = inp;
            const err = noteText(this, ix, y + 22 + 44 + 4, hint ?? '', { kind: 'muted', size: 13, wrap: iw });
            this.errors[key] = { obj: err, hint: hint ?? '' };
            // 안내 문구가 2줄 이상으로 접히면 그 높이만큼 다음 필드 라벨을 내린다(모바일 비밀번호 힌트 겹침 I-7)
            y += Math.max(rowH, 22 + 44 + 4 + err.height + 6);
        };
        if (this.mode === 'guest') {
            field('nickname', '닉네임', { placeholder: '2~12자 한글·영문·숫자', autocomplete: 'nickname', maxLength: 12, inputmode: 'text', onInput: (v) => this.liveLocal('nickname', v) }, '표시명은 서버가 "닉네임#4자리" 로 부여합니다. 게스트 진행 데이터는 이 기기·브라우저에만 보관됩니다.');
        } else {
            if (this.mode === 'register') {
                field('name', '캐릭터명', { placeholder: '2~12자 한글·영문·숫자', autocomplete: 'username', maxLength: 12, onInput: (v) => this.liveCheck(v) }, '2~12자, 한글 완성형·영문·숫자만. 숫자만으로는 불가.', '영문·숫자·한글 2~12자, 밑줄 불가'); // 규칙 = 서버 CharacterName::violation
            }
            field('email', '이메일', { type: 'email', placeholder: 'name@example.com', autocomplete: this.mode === 'register' ? 'email' : 'username', inputmode: 'email', maxLength: 190 }, this.mode === 'register' ? '로그인에 사용합니다.' : '');
            field('password', '비밀번호', { type: 'password', placeholder: this.mode === 'register' ? '8자 이상, 영문+숫자' : '', autocomplete: this.mode === 'register' ? 'new-password' : 'current-password', maxLength: 128, toggle: true }, this.mode === 'register' ? '8자 이상, 영문과 숫자를 모두 포함. 이메일·캐릭터명과 같을 수 없음.' : '');
            if (this.mode === 'register') {
                field('password_confirmation', '비밀번호 확인', { type: 'password', autocomplete: 'new-password', maxLength: 128, toggle: true }, '');
                this.termsBox = new Checkbox(this, { x: ix, y, label: '이용약관 및 개인정보 처리방침에 동의합니다 (필수)', checked: this.terms, size: 15, wrap: iw - 70, onChange: (b) => { this.terms = b; this.setError('terms_accepted', ''); } });
                p.add(this.termsBox);
                this.errors.terms_accepted = { obj: noteText(this, ix, y + 34, '', { kind: 'muted', size: 13, wrap: iw }), hint: '' };
                p.add(this.errors.terms_accepted.obj);
                y += 60;
            }
        }
        Object.values(this.errors).forEach((e) => p.add(e.obj));
        // 폼 오류는 마지막 필드의 안내 문구(최대 2줄)와 겹치지 않도록 한 줄 아래에 둔다
        this.formError = noteText(this, ix, y + 14, '', { kind: 'error', size: 15, wrap: iw });
        p.add(this.formError);
        // 패널 하단 프레임 장식(약 24px) 안쪽에 버튼 묶음 전체(주 버튼 50 + 로그인/가입 전환 링크 58+44)가 들어가게(I-8)
        const linkH = this.mode === 'guest' ? 0 : 58;
        const by = Math.min(h - 24 - 50 - linkH, y + 52);
        const labels = { guest: '시작하기', login: '로그인', register: '가입하기' };
        this.submitBtn = new Button(this, { x: ix, y: by, w: iw * 0.58, h: 50, label: labels[this.mode], variant: 'primary', size: 20, onClick: () => this.submit() });
        p.add(this.submitBtn);
        p.add(new Button(this, { x: ix + iw * 0.58 + 12, y: by, w: iw * 0.42 - 12, h: 50, label: '뒤로', size: 18, onClick: () => this.scene.start('Title') }));
        if (this.mode === 'login') p.add(new Button(this, { x: ix, y: by + 58, w: iw, h: 44, label: '계정이 없으신가요? 회원 가입', size: 15, onClick: () => this.scene.start('Auth', { mode: 'register' }) }));
        if (this.mode === 'register') p.add(new Button(this, { x: ix, y: by + 58, w: iw, h: 44, label: '이미 계정이 있으신가요? 로그인', size: 15, onClick: () => this.scene.start('Auth', { mode: 'login' }) }));
        bindInputsToModal(this, Object.values(this.inputs));
        this.escFn = (e) => { if (e.key === 'Escape' && !(this.modalCount > 0) && !(document.activeElement?.tagName === 'INPUT')) this.scene.start('Title'); };
        window.addEventListener('keydown', this.escFn);
        this.events.once('shutdown', () => { window.removeEventListener('keydown', this.escFn); clearTimeout(this.nameTimer); });
        const first = Object.values(this.inputs)[0];
        if (first && L.cls === 'desktop') first.focus();
    }

    collect() {
        const out = {};
        Object.entries(this.inputs).forEach(([k, i]) => { out[k] = i.value; });
        return out;
    }

    setError(key, msg, kind = 'error') {
        const e = this.errors[key];
        if (!e) return;
        const icon = { error: '! ', ok: '✓ ', info: 'ⓘ ', muted: '' }[kind];
        e.obj.setText(msg ? icon + msg : e.hint).setColor(msg ? { error: CSS.dangerText, ok: CSS.allyText, info: CSS.muted }[kind] : CSS.muted);
        this.inputs[key]?.setError(kind === 'error' && !!msg);
    }

    // 입력 중 로컬 규칙 안내(서버 호출 없음): 비어 있으면 안내 문구만, 규칙 위반이면 실시간 경고(아이콘+문구), 통과하면 확인 표시. 금칙어는 서버가 검증
    liveLocal(key, v) {
        const name = v.trim();
        if (!name) { this.setError(key, ''); return; }
        const local = localNameReason(name);
        if (local) this.setError(key, NAME_REASON[local]);
        else this.setError(key, '형식이 올바릅니다(금칙어는 제출 시 서버가 확인).', 'ok');
    }

    // 캐릭터명 실시간 확인: 로컬 규칙 먼저, 통과하면 600ms 디바운스 후 서버(IP당 분당 30회)
    liveCheck(v) {
        clearTimeout(this.nameTimer);
        const name = v.trim();
        if (!name) { this.setError('name', ''); return; }
        const local = localNameReason(name);
        if (local) { this.setError('name', NAME_REASON[local]); return; }
        this.setError('name', '확인 중...', 'info');
        this.nameTimer = setTimeout(async () => {
            try {
                const r = await auth.checkName(name);
                if (this.inputs.name?.value.trim() !== name) return;
                if (r.available) this.setError('name', '사용할 수 있는 캐릭터명입니다.', 'ok');
                else this.setError('name', NAME_REASON[r.reason] ?? ERROR_MESSAGES.name_forbidden);
            } catch (e) {
                if (e.status === 429) this.setError('name', '확인 요청이 많습니다. 잠시 후 다시 입력해 주세요.', 'info');
                else this.setError('name', '');
            }
        }, 600);
    }

    validate(f) {
        let ok = true;
        const fail = (k, msg) => { this.setError(k, msg); ok = false; };
        if (this.mode === 'guest') {
            const r = localNameReason(f.nickname.trim());
            if (r) fail('nickname', NAME_REASON[r]);
        }
        if (this.mode !== 'guest') {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) fail('email', '이메일 형식이 올바르지 않습니다.');
            if (!f.password) fail('password', '비밀번호를 입력해 주세요.');
        }
        if (this.mode === 'register') {
            const r = localNameReason(f.name.trim());
            if (r) fail('name', NAME_REASON[r]);
            if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) fail('password', '8자 이상, 영문과 숫자를 모두 포함해야 합니다.');
            else if (f.password.toLowerCase() === f.email.trim().toLowerCase() || f.password.toLowerCase() === f.name.trim().toLowerCase()) fail('password', ERROR_MESSAGES.password_same_as_identity);
            if (f.password !== f.password_confirmation) fail('password_confirmation', '비밀번호 확인이 일치하지 않습니다.');
            if (!this.terms) fail('terms_accepted', '약관에 동의해 주세요.');
        }
        return ok;
    }

    async submit() {
        if (this.busy || this.modalCount > 0) return;
        const f = this.collect();
        this.formError.setText('');
        Object.keys(this.errors).forEach((k) => { if (k !== 'name' || this.mode !== 'register') this.setError(k, ''); });
        if (!this.validate(f)) return;
        this.busy = true;
        this.submitBtn.setDisabled(true);
        this.submitBtn.setLabel('처리 중...');
        try {
            if (this.mode === 'guest') await auth.startGuest(f.nickname.trim());
            else if (this.mode === 'login') await auth.login(f.email.trim(), f.password);
            else await auth.register({ name: f.name.trim(), email: f.email.trim(), password: f.password, password_confirmation: f.password_confirmation, terms_accepted: true });
            this.scene.start('Lobby');
        } catch (e) {
            this.busy = false;
            this.submitBtn.setDisabled(false);
            this.submitBtn.setLabel({ guest: '시작하기', login: '로그인', register: '가입하기' }[this.mode]);
            if (e.fields) Object.entries(e.fields).forEach(([k, msg]) => this.setError(k, msg));
            const fk = CODE_FIELD[e.code];
            if (fk && this.errors[fk]) this.setError(fk, messageOf(e));
            else if (!e.fields || e.code !== 'validation') {
                if (e.status === 403 || e.status === 429 || e.status === 0 || e.status >= 500) alertModal(this, '오류', messageOf(e));
                else this.formError.setText('! ' + messageOf(e));
            } else this.formError.setText('! ' + ERROR_MESSAGES.validation);
        }
    }
}
