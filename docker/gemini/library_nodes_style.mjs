// ===== 잊힌 서고 지도 노드 아이콘·정적 소품(map.library.node.* / map.library.prop.*) 스타일·작업 정의(안아트 2026-11-14) =====
// 공통 규칙 = style_guide.mjs(BASE_NEGATIVE·KEY_BG·RES). 화풍 = 서고 지도 배경(map.library.base: 애니메이션풍 페인터리, 어두운 갈색 윤곽, 왼쪽 위 광원)과 통일.
// 시점 = 배경과 같은 약 60도 내려다본 3/4 시점. 마젠타 크로마키(대상에 분홍·자주·보라 금지: 4막 보랏빛 바닥과도 구분됨).
// 입력: 이미지1 = 화풍·시점 참조(배경 미리보기). n2 는 이미지2 로 n1 결과(같은 세트 화풍 고정)를 추가.
// 출력 후처리 = library_nodes_pp.py. 작품·작가·캐릭터명 금지.
import { BASE_NEGATIVE, KEY_BG, RES } from './style_guide.mjs';
export { RES };
export const BUDGET = 6; // 이 카테고리 호출 상한(팀장 지시)
export const REFS = ['docker/gemini/library_map/preview/lib_a3_final_1760.jpg'];

const STYLE = `Art style: match Image 1 ONLY in rendering (anime-style painterly fantasy game art, clean dark-brown ink contour lines, soft cel shading with gentle gradients, warm golden lamplight, light from the upper-left). Do not copy any part of Image 1's layout; Image 1 is a map background, you paint separate game map marker objects.
Camera: the same high-angle view as Image 1, looking down at about 60 degrees (slight 3/4 from the front): top surfaces and front faces both visible, orthographic feel, no fisheye.
Every object has a clean, thick, continuous dark-brown outer contour line (about 2% of the cell width) all around its silhouette, so it reads on both dark and bright floors. Bold simple silhouettes that stay readable at 60 pixels. Mid-to-rich saturation, palette of oxblood red, deep navy blue, forest green, walnut brown, parchment cream, brass and warm gold.`;
const NEG = `Forbidden: ${BASE_NEGATIVE}; no letters, no runes, no numbers, no symbols on covers (only plain ornamental gold corner pieces and a plain round gold boss), no religious symbols, no heraldry, no people, no animals. No floor, no ground shadow, no cast shadow, no glow halo or light aura around objects, no floating separate sparkles or particles detached from the object; each object is one single connected piece. Never use pink, magenta, purple or violet anywhere on the objects.`;
const GRID = (cols, rows) => `${KEY_BG}. Exactly ${cols} columns x ${rows} rows of equal invisible cells, one object centered in each cell, each object about 70% of its cell size, generous magenta spacing so no two objects touch, no grid lines, no cell borders, no text.`;

const N1_CELLS = `The sheet is a set of map markers for an ancient magical library. Rows = object type, columns = state. The SAME object design must repeat across a row (identical shape, size and angle), only the state changes.
Column states: column 1 = NORMAL (clean, warm, inviting). Column 2 = LOCKED (same object but faded and desaturated grey-brown, covered in grey dust and a few cobwebs, bound by a dark iron chain crossing its front with one small plain iron padlock). Column 3 = CLEARED (same object restored and polished, brighter warm colors, gleaming gold trims, a bright gold silk bookmark ribbon).
Row 1 BOOK: one thick closed antique leather tome lying flat, cover facing up toward the viewer, slightly rotated, thick cream page block visible on the front side; oxblood-red leather cover with plain gold corner caps and a plain round gold boss in the center. (column 3: a gold bookmark ribbon hangs out of the pages over the front edge).
Row 2 BOOKSHELF (large, important): one tall free-standing ornate bookcase of dark walnut with a carved arched crown on top, three shelves packed with colorful book spines (red, navy, green, brown, cream), brass and gold trims; both the top and the front face visible. Make it the largest and most imposing object of the sheet. (column 2: chains crossing the whole front, books dull grey. column 3: gold crown ornament polished, books bright and warm, gold ribbon tied on the crown).
Row 3 RECEPTION DESK: one small curved wooden librarian reception counter with an open ledger book on top, a small brass hand bell and a small brass oil lamp. (column 1: lamp lit with a small warm flame. column 2: lamp unlit, dusty, cobwebs, a chain across its front. column 3: lamp lit, polished gold trims, gold bookmark ribbon in the ledger).
Row 4: column 1 = DOOR CLOSED: one free-standing arched double door of dark oak planks in a carved stone-and-wood arch frame, brass fittings and a plain round brass ring handle, both doors shut. Column 2 = THE SAME DOOR OPEN: both door leaves swung open inward, warm golden light filling only the opening itself. Column 3 = empty magenta.`;

const N2_CELLS = `Image 2 is the finished marker set of this game. Paint small decorative props for the same map in EXACTLY the same rendering style, contour line weight, saturation and camera angle as Image 2.
Row 1: (1) one open antique book drifting in the air, pages fanned slightly, seen from above at 60 degrees; (2) one brass candlestick on a small round base holding one cream wax candle with a small warm flame and a little melted wax; (3) one rolled parchment scroll tied with a red cord, lying slightly diagonal.
Row 2: (4) a small leaning stack of three closed books (red, navy, green covers with plain gold corners); (5) a quill pen standing in a round dark glass inkwell; (6) one small brass hanging lantern with warm glass panes and a short brass ring on top.`;

export const JOBS = {
  n1: { aspect: '3:4', size: '2K', prompt: ['Paint one sprite sheet of game map marker objects on a flat magenta background.', N1_CELLS, GRID(3, 4), STYLE, NEG].join('\n') },
  n2: { aspect: '3:2', size: '2K', refs: [...REFS, 'docker/gemini/library_nodes/raw/n1.jpg'], prompt: ['Paint one sprite sheet of small decorative props on a flat magenta background.', N2_CELLS, GRID(3, 2), STYLE, NEG].join('\n') },
};
