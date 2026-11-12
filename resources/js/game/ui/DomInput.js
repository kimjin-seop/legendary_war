import { view, FONT_FAMILY, fs } from '../theme.js';

// DOM 입력 오버레이: 캔버스 위에 <input> 하나만 올린다(IME 한글·비밀번호 마스킹·자동완성 때문에 캔버스로는 불가).
// 좌표는 설계 단위(unit) -> CSS px(view.scale) 로 변환해 캔버스 부모(fixed 컨테이너) 안에 absolute 배치한다.
// - 게임 스킨(딥 네이비 + 금색 이중 테두리, Pretendard), 포커스 링, 비밀번호 표시/숨김 토글(44px 터치)
// - Enter 제출(onEnter), Esc 포커스 해제, Tab 은 DOM 순서대로 이동(생성 순서)
// - visualViewport: 모바일 키보드가 올라와 입력창이 가려지면 보이는 영역 안으로 끌어올린다
// - 입력값은 절대 로그/콘솔/URL 에 남기지 않는다. 씬 shutdown 시 자동 제거.
const STYLE_ID = 'srpg-dom-input-style';
function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
.srpg-in{position:absolute;box-sizing:border-box;display:flex;align-items:stretch;background:#0a1226;
 border:2px solid #c9a24b;border-radius:8px;box-shadow:inset 0 0 0 2px #0b1020, inset 0 0 0 3px rgba(240,213,140,.35);transition:box-shadow .12s}
.srpg-in:focus-within{border-color:#f0d58c;box-shadow:inset 0 0 0 2px #0b1020, inset 0 0 0 3px rgba(240,213,140,.6), 0 0 0 3px rgba(240,213,140,.45)}
.srpg-in.err{border-color:#ee8a76}
.srpg-in.off{opacity:.55;pointer-events:none}
.srpg-in input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#e8e4d8;font-family:${FONT_FAMILY};padding:0 12px;
 font-weight:500;letter-spacing:.01em;-webkit-appearance:none;appearance:none}
.srpg-in input::placeholder{color:#7f8899}
.srpg-in input:-webkit-autofill{-webkit-text-fill-color:#e8e4d8;transition:background-color 9999s ease-in-out 0s}
.srpg-in button{flex:0 0 auto;min-width:44px;background:transparent;border:0;border-left:1px solid rgba(201,162,75,.5);color:#f0d58c;
 font-family:${FONT_FAMILY};font-weight:700;cursor:pointer;padding:0 10px}
.srpg-in button:focus-visible{outline:2px solid #f0d58c;outline-offset:-3px}`;
    document.head.appendChild(s);
}

let seq = 0;
export class DomInput {
    constructor(scene, { x, y, w, h = 44, type = 'text', placeholder = '', autocomplete = 'off', inputmode, maxLength, value = '', name, size = 18, onEnter, onInput, onBlur, toggle = false, ariaLabel }) {
        ensureStyle();
        this.scene = scene;
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.parent = scene.game.canvas.parentElement ?? document.body;
        if (getComputedStyle(this.parent).position === 'static') this.parent.style.position = 'relative';
        const wrap = document.createElement('div');
        wrap.className = 'srpg-in';
        const input = document.createElement('input');
        input.type = type;
        input.id = `srpg-in-${++seq}`;
        if (name) input.name = name;
        input.placeholder = placeholder;
        input.autocomplete = autocomplete;
        input.autocapitalize = 'off';
        input.spellcheck = false;
        if (inputmode) input.inputMode = inputmode;
        if (maxLength) input.maxLength = maxLength;
        if (ariaLabel) input.setAttribute('aria-label', ariaLabel);
        input.value = value;
        input.style.fontSize = `${Math.round(fs(size) * (view.scale || 1))}px`;
        wrap.appendChild(input);
        if (toggle && type === 'password') {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = '표시';
            b.setAttribute('aria-label', '비밀번호 표시');
            b.style.fontSize = `${Math.round(fs(14) * (view.scale || 1))}px`;
            b.addEventListener('click', () => {
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                b.textContent = show ? '숨김' : '표시';
                b.setAttribute('aria-label', show ? '비밀번호 숨김' : '비밀번호 표시');
                input.focus();
            });
            wrap.appendChild(b);
        }
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); }
            else if (e.key === 'Escape') { input.blur(); }
            e.stopPropagation(); // Phaser/모달 키 핸들러로 전파 금지
        });
        input.addEventListener('input', () => onInput?.(input.value));
        input.addEventListener('blur', () => { this.unshift(); onBlur?.(input.value); });
        input.addEventListener('focus', () => this.fitViewport());
        this.wrap = wrap;
        this.input = input;
        this.parent.appendChild(wrap);
        this.place();
        this.onLayout = () => this.place();
        scene.game.events.on('layout', this.onLayout);
        this.onVV = () => { if (document.activeElement === input) this.fitViewport(); else this.unshift(); };
        window.visualViewport?.addEventListener('resize', this.onVV);
        window.visualViewport?.addEventListener('scroll', this.onVV);
        this.onShutdown = () => this.destroy();
        scene.events.once('shutdown', this.onShutdown);
        scene.events.once('destroy', this.onShutdown);
    }

    // unit -> CSS px (카메라 zoom L.u / 백킹 배율 R = view.scale)
    place() {
        const s = view.scale || 1;
        Object.assign(this.wrap.style, { left: `${this.x * s}px`, top: `${this.y * s}px`, width: `${this.w * s}px`, height: `${Math.max(44, this.h * s)}px` });
    }

    // 모바일 키보드가 올라와 입력창이 가려지면 보이는 영역 안으로 끌어올린다(입력창만 이동, 캔버스는 그대로)
    fitViewport() {
        const vv = window.visualViewport;
        if (!vv) return;
        const r = this.wrap.getBoundingClientRect();
        const visibleBottom = vv.offsetTop + vv.height;
        const over = r.bottom + 12 - visibleBottom;
        if (over > 0) this.wrap.style.transform = `translateY(${-over}px)`;
    }
    unshift() { this.wrap.style.transform = ''; }

    get value() { return this.input.value; }
    set value(v) { this.input.value = v; }
    focus() { this.input.focus(); }
    setError(on) { this.wrap.classList.toggle('err', !!on); this.input.setAttribute('aria-invalid', on ? 'true' : 'false'); }
    setEnabled(on) { this.wrap.classList.toggle('off', !on); this.input.disabled = !on; }
    setVisible(on) { this.wrap.style.display = on ? 'flex' : 'none'; }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.scene.game.events.off('layout', this.onLayout);
        this.scene.events.off('shutdown', this.onShutdown);
        this.scene.events.off('destroy', this.onShutdown);
        window.visualViewport?.removeEventListener('resize', this.onVV);
        window.visualViewport?.removeEventListener('scroll', this.onVV);
        this.input.value = ''; // DOM 에 값이 남지 않도록 비운다
        this.wrap.remove();
    }
}

// 씬 안의 모든 DomInput 을 모달 열림/닫힘에 맞춰 비활성+숨김/활성+복원
// (DOM 입력은 캔버스 위 레이어라 비활성만으로는 모달 위에 겹쳐 보인다 -> visibility 로 숨김. setVisible(display)과 독립)
export function bindInputsToModal(scene, inputs) {
    const sync = () => inputs.forEach((i) => {
        if (i.destroyed) return;
        const open = scene.modalCount > 0;
        if (open && document.activeElement === i.input) i.input.blur();
        i.setEnabled(!open);
        i.wrap.style.visibility = open ? 'hidden' : '';
    });
    scene.events.on('modal-open', sync);
    const id = setInterval(sync, 250); // Modal 은 닫힘 이벤트가 없어 폴링으로 복구
    scene.events.once('shutdown', () => { clearInterval(id); scene.events.off('modal-open', sync); });
}
