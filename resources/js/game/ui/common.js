import { textStyle } from '../theme.js';
import { L } from '../layout.js';

// 텍스트 생성 헬퍼. opts: size, color, bold, origin, wrap, align, stroke, heading(굵게+외곽선+그림자), res(텍스처 해상도)
export function makeText(scene, x, y, str, opts = {}) {
    const { size = 16, color, bold = false, origin = [0, 0], wrap, align = 'left', stroke, heading = false, res } = opts;
    const style = textStyle(size, color, { fontStyle: bold || heading ? 'bold' : 'normal', align });
    if (res) style.resolution = res;
    if (wrap) style.wordWrap = { width: wrap, useAdvancedWrap: true };
    const st = stroke ?? (heading ? { color: '#0B1020', width: Math.max(3, Math.round(size / 7)) } : null);
    if (st) { style.stroke = st.color; style.strokeThickness = st.width; }
    if (heading) style.shadow = { offsetX: 0, offsetY: 2, color: '#000000', blur: 0, fill: true, stroke: true };
    return scene.add.text(x, y, str, style).setOrigin(origin[0], origin[1]);
}

// 한글 대사 줄바꿈 보정(대사 창 전용): 한 글자 어절(그·이·한·더·수 등) 뒤 공백을 줄바꿈 없는 공백(U+00A0)으로 묶어
// '…폐하, 그⏎안까지만.'처럼 짧은 어절이 줄 끝에 홀로 떨어지지 않게 한다(Phaser advanced wrap 은 ' ' 로만 어절을 나눔)
export const bindShortWords = (s) => String(s ?? '').replace(/(?<=^|[\s\u00a0])([가-힣]) (?=[가-힣])/g, '$1\u00a0');
// wordWrap 결과를 미리 줄바꿈 문자로 확정한 문자열(타이핑 중 어절이 길어지며 다음 줄로 튀는 현상 방지). wordWrap 없으면 묶기만
export const prewrapText = (t, s) => { const b = bindShortWords(s); return t?.style?.wordWrapWidth ? t.getWrappedText(b).join('\n') : b; };

// 말줄임 없이 맞추기(뽑기 화면 풀네임 규칙 2026-11-03): 한 줄이면 폭 안, wordWrap 이면 maxLines 줄 안이 될 때까지 글자 크기만 줄인다(최소 minPx). 최소에서도 넘치면 그대로 둔다(잘라내지 않음)
export function shrinkToFit(t, maxW, minPx = 11, { maxLines = 1 } = {}) {
    let size = parseFloat(t.style.fontSize) || 14;
    const wrapped = !!t.style?.wordWrapWidth;
    const ok = () => (wrapped ? t.getWrappedText(t.text).length <= maxLines : t.width <= maxW);
    while (!ok() && size - 1 >= minPx) { size -= 1; t.setFontSize(`${size}px`); }
    return t;
}

// 긴 이름 말줄임: 한 줄이면 maxW(px) 안으로, wordWrap 텍스트면 maxLines 줄 안으로 끝을 '…'로 자른다.
// opts.fallback: 넘치면 먼저 이 문자열(예: 칭호 생략형)로 바꿔 본 뒤 그래도 넘치면 자른다.
export function fitText(t, maxW, { maxLines = 1, fallback } = {}) {
    const wrapped = !!t.style?.wordWrapWidth;
    const fits = (s) => { t.setText(s); return wrapped ? t.getWrappedText(s).length <= maxLines : t.width <= maxW; };
    let src = String(t.text ?? '');
    if (!maxW || fits(src)) return t;
    if (fallback && fallback !== src) { src = String(fallback); if (fits(src)) return t; }
    let n = src.length - 1;
    while (n > 1 && !fits(`${src.slice(0, n)}…`)) n -= 1;
    return t;
}

// 세로 스택 배치: 각 항목의 height 기준으로 y를 누적(글자 크기 스케일 대응)
export function stack(items, startY = 0, gap = 6) {
    let y = startY;
    items.forEach((o) => { o.y = y; y += (o.displayHeight ?? o.height) + gap; });
    return y;
}

// 레터박스 대신 여백을 채우는 배경 패턴(뷰포트 전체)
// 화면 배경 이미지(이미지 스킨 bgscreen_*, 글자 없음): 화면을 덮게(cover) + 남색 반투명 덮개(로고·글자 가독성). 텍스처가 없으면 기존 패턴 배경
export function addScreenBg(scene, key, dim = 0.4) {
    const base = addBackdrop(scene, L.lw, L.lh);
    if (!scene.textures.exists(key)) return base;
    const img = scene.add.image(L.lw / 2, L.lh / 2, key).setDepth(-999);
    img.setScale(Math.max(L.lw / img.width, L.lh / img.height));
    scene.add.rectangle(0, 0, L.lw, L.lh, 0x0b1020, dim).setOrigin(0).setDepth(-998);
    return img;
}

export function addBackdrop(scene, w, h) {
    return scene.add.tileSprite(0, 0, w, h, 'bg_pattern').setOrigin(0).setTileScale(0.5).setDepth(-1000);
}

// Phaser 4 Transform.setPosition(x, y, z, w) 는 4번째 성분 this.w 를 0 으로 덮어쓴다.
// 폭을 this.w 에 두는 Container 하위 클래스(패널·카드·바·메뉴)는 이 함수로 setPosition 후에도 폭을 보존한다.
export function keepW(Cls) {
    const base = Object.getPrototypeOf(Cls.prototype).setPosition;
    Cls.prototype.setPosition = function (x, y, z, w) { const bw = this.w; base.call(this, x, y, z, w); if (bw !== undefined) this.w = bw; return this; };
    return Cls;
}

// 목록 드래그 스크롤 판정 공유(2026-11-14 모바일 터치 스크롤): ScrollList 가 드래그(8px 초과 이동)로 판정한 포인터는
// 그 누름(downTime)에 표시를 남긴다 -> 같은 누름의 pointerup 에서 버튼·탭 클릭을 무시. 다음 누름(downTime 갱신)부터는 자동 해제
export const DRAG_SCROLL_PX = 8;
export const markScrollDrag = (p) => { if (p) p.lwScrollDragAt = p.downTime; };
export const scrollDragged = (p) => !!p && p.lwScrollDragAt !== undefined && p.lwScrollDragAt === p.downTime;
