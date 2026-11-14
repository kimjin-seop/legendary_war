// ===== 잊힌 서고 도서관 지도 배경(map.library.*) 스타일·작업 정의(안아트 2026-11-14) =====
// 공통 규칙은 style_guide.mjs(BASE_NEGATIVE·RES)를 따르고, 화풍은 서고 대사 배경 bg.archive.hall(애니메이션풍 페인터리, 청록 그늘 + 따뜻한 금빛 광원)과 맞춘다.
// 입력: 이미지1 = 배치 가이드(library_map_guide.py 산출, 색 구획), 이미지2 = 화풍 참조(bg.archive.hall). 작품·작가·캐릭터명 금지.
// 출력: 21:9 4K 생성 -> 가운데 2.2 비 크롭 -> 3520x1600 / 1760x800 WebP (library_map_pp.py)
import { BASE_NEGATIVE, RES } from './style_guide.mjs';
export { RES };
export const BUDGET = 8; // 이 카테고리 호출 상한(자체 설정)
export const REFS = ['docker/gemini/library_map/guide_21x9.png', 'public/assets/bg/scene/archive/hall_1280.webp'];

const LAYOUT = `Image 1 is a strict LAYOUT GUIDE (21:9). It shows five tall vertical rooms side by side, separated by thin dark divider strips. In each room:
- the bright inner rectangle = OPEN FLOOR that must stay calm and uncluttered (only floor pattern: polished stone, inlaid wood, a soft rug, light pools). No furniture, no tables, no shelves, no trees, no tall objects inside it. Game markers will be placed there later.
- the medium ring around it, the top band (upper ~15% of the image) and the bottom band (lower ~12%) = decoration zones: tall bookshelves, reading lamps, ladders, small reading tables, potted plants, stacked books.
- the thin dark strips between rooms = high bookshelf walls and pillars with arched openings, small bridges or short stair steps connecting neighbouring rooms at mid-height and near the bottom.
Keep every room exactly at the same horizontal position and width as in Image 1; do not merge rooms, do not add or remove rooms.`;

const ROOMS = `Room themes, left to right:
1) LOBBY (leftmost, warm parchment beige): grand entrance arch at the bottom edge, an ornate curved reception counter tucked into the bottom-left corner outside the bright rectangle, a large round mosaic compass pattern on the floor, an arched doorway at the top right leading onward.
2) ROOM 1 (warm golden): honey-gold lantern light, oak shelves, warm amber glow, a few glowing books floating near the top.
3) ROOM 2 (teal / sea green): cool teal light, verdigris bronze fittings, hanging glass lanterns; an ancient tree grows inside the divider wall on its right side, roots spreading along the wall, branches with soft leaves forming a canopy only over the top band.
4) ROOM 3 (deep crimson embroidery): crimson banners without any symbols, red embroidered rugs at the edges, brass candelabras, rich red-wood shelves.
5) ROOM 4 (violet starlight, rightmost): the top band opens into a partial constellation ceiling dome: deep violet night sky with fine gold star lines (abstract, no symbols), silver-lilac moonlight, floating star motes.
Across the whole image: gently floating open books and small golden light particles (sparse, mostly over the decoration zones), warm lamplight pools, a unified warm-gold accent so it matches a gold-trimmed game UI.`;

const CAMERA = {
  a: 'Camera: high-angle overhead view looking down at about 60 degrees (bird-eye, slight 3/4), the far wall of each room visible in the top band, floors read as flat open areas. Orthographic feel, no fisheye, no strong vanishing point.',
  b: 'Camera: straight top-down view (orthographic map view, directly from above), like an illustrated architectural floor plan painted as a beautiful game map: tops of bookshelves, tables and tree canopies seen from above, soft cast shadows toward the lower right.',
};
const STYLE = 'Art style: match Image 2 (only its rendering style: anime-style painterly fantasy illustration, clean lines, soft cel shading with gentle gradients, teal shadows and warm golden light). Light from the upper-left. Rich but readable, mid-dark overall value so small bright gold markers placed on the open floors will stand out clearly. Very light vignette only.';
const NEG = `Forbidden: ${BASE_NEGATIVE}; no letters, no rune writing, no numbers, no signs, no labels, no UI, no map pins, no icons, no circles marking positions, no people, no characters, no animals, no religious symbols, no heraldry. Do not paint the guide colors as flat blocks; the guide only defines layout. Full-bleed, no border or frame.`;

const HEAD = 'Paint one finished wide fantasy game map background: an enormous forgotten ancient library seen from above.';
// v2(2026-11-14 1차 QA 반영): 1차본이 '검은 틈으로 갈린 방 5칸'처럼 보이고 바닥이 빈 단색 판이라 밋밋함 -> 하나로 이어진 큰 홀, 낮은 서가·기둥·아치로 구역 구분, 바닥은 낮은 대비 문양, 떠다니는 책·빛 입자 증가, 나침반 방위 글자 금지
const FLOW = `IMPORTANT: this is ONE continuous vast hall, not five separate boxes. Zones flow into each other: the medium-brown strips of Image 1 are rows of tall bookshelves and carved pillars with wide open archways, little wooden bridges over a sunken reading gallery, and short stair steps; warm light spills from one zone into the next. Never paint black gaps or hard black panel borders between zones, and no thick outer frame.
Open floors are NOT empty flat color: give them subtle low-contrast detail (worn polished stone or parquet, faint gold inlay lines, soft pools of lamplight, a few scattered loose pages lying flat), but keep them calm and free of tall objects so small markers stay readable.
Make it feel magical and beautiful: many open books drifting in the air above the shelves with soft glowing pages, fine golden dust motes in the light beams, hanging lanterns, ivy and tiny glowing leaves on old wood. Any compass rose or floor medallion has NO letters at all.`;
export const JOBS = {
  lib_a: { aspect: '21:9', size: '4K', prompt: [HEAD, LAYOUT, ROOMS, CAMERA.a, STYLE, NEG].join('\n') },
  lib_b: { aspect: '21:9', size: '4K', prompt: [HEAD, LAYOUT, ROOMS, CAMERA.b, STYLE, NEG].join('\n') },
  lib_a2: { aspect: '21:9', size: '4K', prompt: [HEAD, LAYOUT, ROOMS, FLOW, CAMERA.a, STYLE, NEG].join('\n') },
  lib_b2: { aspect: '21:9', size: '4K', prompt: [HEAD, LAYOUT, ROOMS, FLOW, CAMERA.b, STYLE, NEG].join('\n') },
  // v3 = 추천 후보 lib_a2 를 고치는 편집(2차 QA: 노드 자리 위 소품·나무 뿌리, 로비·1막 바닥이 너무 밝아 금색 노드 대비 부족)
  lib_a3: { aspect: '21:9', size: '4K', refs: ['docker/gemini/library_map/raw/lib_a2.jpg'], prompt: `EDIT Image 1. Keep its exact composition, camera, art style, room positions, bridges, shelves, tree, dome and colors; change only the following:
1) Golden room (2nd from left): remove the small reading table, chair and book stack standing on the floor at the right side around 35-45% of the image height; replace with plain floor continuing the tile pattern.
2) Teal room (middle): the ancient tree trunk and its roots must stay inside the divider wall to the right of the teal room; remove the roots that crawl over the teal floor, the floor rectangle stays clear.
3) Crimson room (4th): remove the side table with candles and books at the lower-left of the floor; plain herringbone floor there.
4) Lobby (leftmost): move nothing, but remove the small reading table near the upper-left of the floor.
5) Tone: make the lobby floor and the golden room floor about 30% darker and less saturated (warm mid-tone, like evening lamplight), keep highlights only near lamps. Keep all other rooms as they are.
${NEG}` },
};
