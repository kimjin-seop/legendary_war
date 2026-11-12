import { RARITY_COLOR } from './rarity.js';
import { settings } from './settings.js';
import { L, UNIT } from './layout.js';

// 디자인 토큰: 값만 바꾸면 전체 톤이 바뀌도록 모든 UI는 여기만 참조한다.
// 방향: 딥 네이비 패널 + 금색 장식 테두리 + 선명한 포인트색. 좌표계는 설계 단위(1unit = 기준 1080p에서 1.5px).
export const MIN_TOUCH = 44; // 실제 화면(CSS) px 기준 최소 터치 크기
export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24 };

export const COLOR = {
    bg: 0x1b2230,
    panel: 0x232f4b,
    panelLight: 0x2f3e60,
    navyDeep: 0x141d33,
    accent: 0xc9a24b,
    accentLight: 0xf0d58c,
    ally: 0x3fa7a0,
    danger: 0xc8503c,
    move: 0x4a86d8, // 이동 범위(청색 면)
    text: 0xe8e4d8,
    muted: 0xa9b1c0,
    gray: 0x6b7280, // 행동 완료 유닛
    ink: 0x0b1020,
    exp: 0x4a86d8,
};
export const GRADE = RARITY_COLOR; // 등급 테두리(rarity.js 단일 출처: S/A/B/C)

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
export const CSS = {
    bg: hex(COLOR.bg),
    text: hex(COLOR.text),
    muted: hex(COLOR.muted),
    accent: hex(COLOR.accent),
    allyText: '#5cc4bc', // ally 본색은 panel 위 대비 4.3:1이라 텍스트용 밝은 값
    dangerText: '#ee8a76', // danger 본색은 텍스트 대비 3.5:1 미만이라 텍스트용 밝은 값
    onAccent: hex(COLOR.bg),
};

// 한글 웹폰트: Pretendard(OFL) 자체 호스팅 시 CSS @font-face 로 로드(Boot에서 대기). 없으면 시스템 스택으로 폴백.
export const FONT_FAMILY = "'Pretendard', 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
export const FONT_SCALE = [1, 1.25, 1.5]; // 기본 / 크게 / 매우 크게
export const FONT_LABELS = ['기본', '크게', '매우 크게'];

// 화면 보정: scale = CSS px / unit. 작은 화면(휴대폰)에서는 글자를 보정하고 히트 영역을 키운다.
export const view = { scale: 1.5, boost: 1 };
export function syncView() {
    view.scale = L.ui * UNIT;
    view.boost = view.scale < 1 ? 1.15 : 1;
}
syncView();

export const fs = (base) => Math.round(base * FONT_SCALE[settings.get().fontLevel] * view.boost);
// 고해상도에서 선명하도록 텍스트 텍스처 해상도를 백킹 배율에 맞춘다
export const textRes = () => Math.min(4, Math.max(2, Math.ceil(L.u)));

export function textStyle(size, color = CSS.text, extra = {}) {
    return { fontFamily: FONT_FAMILY, fontSize: `${fs(size)}px`, color, resolution: textRes(), ...extra };
}
