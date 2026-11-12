// [안아트 2026-11-06] 통그림 맵 파일럿(pk_05). 가이드(칸 색 구획)+화풍 레퍼런스 → 맵 한 장 다시 그리기.
// 실행: node --env-file=.env docker/gemini/painted_map_pilot_gen.mjs <variant>   (키는 출력·기록 금지, 429 즉시 중단)
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL = 'gemini-nano-banana-2.1';
const DIR = 'scratchpad/painted_map_pilot';
const LOG = `${DIR}/calls_log.jsonl`;
const BUDGET = 6;
const key = process.env.GEMINI_API_KEY;
if (!key || /["'\s]/.test(key)) { console.error('GEMINI_API_KEY 없음/형식 의심'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const used = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).length : 0;
if (used >= BUDGET) { console.log(`예산 ${BUDGET}회 소진`); process.exit(0); }
const variant = process.argv[2] ?? 'v1';
const PROMPTS = {
  base: `Image 1 is a STYLE reference only (ignore its grey dimming; render brighter, daylight). Image 2 is a strict LAYOUT MAP: a 24 columns x 16 rows grid of square cells, each block of color is one terrain.
Repaint Image 2 as one finished top-down (slight 3/4 overhead) battle map in the style of Image 1: detailed illustrative pixel art, rich greens, soft painterly pixel shading, crisp dark outlines, warm light from the upper-left, small grass tufts, tiny flowers, stones.
STRICT CELL MAPPING, keep every terrain exactly inside its colored cells, same positions, no shifting, no extra terrain:
- light green cells = open meadow grass with sparse small flowers and tufts (flat, walkable, keep it calm and low-detail so units stand out).
- dark green cells = dense broadleaf tree groves: big round leafy canopies with visible trunks; the canopy must fill those cells and must NOT spill over into neighbouring light-green cells by more than a few pixels.
- tan cells = a worn dirt road running straight across the whole map, exactly one cell wide, edges softened with grass.
- red cells = small log-cabin houses with dark shingled roofs (each 2x2 red block is one cabin occupying exactly that block), with a tiny fenced yard feel.
Full-bleed image, no border, no frame, no characters, no people, no animals, no text, no UI, no grid lines, no perspective camera tilt, no vignette. The output must keep the same 3:2 framing so that cell (col,row) of Image 2 lands on the same place.`,
};
PROMPTS.v1 = PROMPTS.base;
PROMPTS.e1 = `EDIT Image 1 (do not compose a new scene). Image 1 is a color-coded game map: 24 columns x 16 rows of square cells. Keep its exact composition and repaint every colored region in place, in the art style of Image 2 (Image 2 is only a style sample; ignore its grey dimming, its layout and its buildings).
Style: detailed illustrative pixel art, crisp dark outlines, soft pixel shading, daylight from upper-left, top-down with slight 3/4 overhead view.
Region rules (stay inside the region outline, no spill more than a few pixels):
- light green = flat meadow grass, calm, sparse tiny flowers and tufts.
- dark green = clump of round broadleaf trees seen from above, canopy fills exactly that rectangle. There are exactly 20 small dark-green rectangles; paint exactly 20 tree clumps, nothing else wooded.
- tan horizontal bands = dirt road, same width and rows.
- red = exactly two 2x2 log cabins with dark shingled roofs, in the middle of the map, between the two roads, left and right of the central tree clump.
The four corners and the left and right edges are plain meadow: NO trees, NO houses there. No characters, no animals, no text, no grid lines, no frame.`;
PROMPTS.v2 = PROMPTS.base + `\nIMPORTANT: Previous attempt drifted. Treat Image 2 like a stencil: trace the exact boundaries. Trees appear ONLY where dark green is; meadow ONLY where light green is. Keep the two road bands exactly at rows 7 and 10 from the top (of 16 rows).`;
PROMPTS.v3 = PROMPTS.v2 + `\nPaint each forest block as a tight clump of 2 to 6 smaller round trees viewed from above whose canopies are clipped to the block rectangle; meadow must have uniform flat lighting.`;
PROMPTS.e2 = PROMPTS.e1 + `
CORRECTIONS (critical):
1) Middle band between the two roads, reading cells left to right: columns 1-5 meadow, 6-7 trees, 8-9 meadow, 10-11 CABIN, 12-13 trees, 14-15 CABIN, 16-17 meadow, 18-19 trees, 20-24 meadow. The cabins touch the central tree clump directly (no meadow gap between cabin and central trees) and sit exactly on the red cells, not further out.
2) Richness: match the density of Image 2. Meadow gets varied grass tones, small grass tufts, little flower patches, a few pebbles (all flat ground, no tall objects). Each tree clump shows several overlapping leafy canopies with many leaf clusters, highlights and darker undersides, visible twisted roots at the bottom edge of the rectangle. Cabins are log walls with a dark shingle roof, small window, door facing the road.`;
PROMPTS.r1 = `Image 1 is a DRAFT battle map (24 columns x 16 rows of square cells, each cell is 1/24 of the width). Image 2 is the exact cell layout it must match (dark green = trees, light green = meadow, tan = road, red = cabins). Image 3 is a style sample only (ignore its layout and grey dimming).
Produce a refined version of Image 1:
- Keep every tree clump and both roads at exactly the same position and size as in Image 1. Tree canopies must stay inside their dark-green rectangles of Image 2 (they are rectangles 2 cells wide).
- MOVE the two cabins: in Image 1 they are too far out. Each cabin must occupy exactly its red 2x2 block of Image 2, directly touching the central tree clump on both sides, between the roads, not overlapping the roads.
- Raise the richness toward Image 3: varied grass tones, tufts, small flower patches, pebbles on the meadow (flat only); layered leaf clusters, highlights and darker undersides, visible roots inside the rectangles; log-wall cabins with dark shingle roofs.
Detailed illustrative pixel art, crisp dark outlines, daylight from upper-left, top-down slight 3/4 view. No characters, no text, no grid lines, no frame, no new trees, no new buildings.`;
PROMPTS.r2 = `Image 1 is an almost final battle map; every tree clump, cabin and road is already in the correct place. Image 2 is its cell layout. Image 3 is a style sample only.
Make ONLY these fixes and keep everything else pixel-for-pixel in place:
1) Remove the dark vignette and dark shadowed grass around the edges and corners: all light-green cells of Image 2 must be the same bright, evenly lit meadow green across the whole map, edge to edge.
2) Remove the partial trees, bushes and trunks in the four corners and along the borders (those cells are meadow in Image 2); replace with the same bright meadow with small tufts and flowers.
3) Keep the 20 tree clumps, the two cabins and the two roads exactly as they are.
Detailed illustrative pixel art, crisp outlines. No characters, no text, no grid lines, no frame, no vignette.`;
PROMPTS.a1 = `EDIT Image 1 (do not compose a new scene). Image 1 is a color-coded game map of 30 columns x 20 rows of square cells. Keep its exact composition and repaint every colored region in place, in the art style of Image 2 (style sample only: ignore its grey dimming and its layout).
Style: detailed illustrative pixel art like Image 2, crisp dark outlines, soft pixel shading, warm daylight from upper-left, top-down with slight 3/4 overhead view.
Region rules (stay inside region outlines, spill at most a few pixels):
- dark green = dense broadleaf woodland: many overlapping canopies of DIFFERENT sizes and shapes (big old oaks, smaller round trees, a few bushes and ferns at the edges), denser in the core, with dark gaps between crowns. Inside the woods the two small light-green holes are hidden clearings: show them as small shaded grassy glades enclosed by trees.
- light green = open meadow: varied grass tones, tufts, small flower patches, pebbles; flat ground only.
- tan = a worn winding dirt road: smooth its stair-steps into natural curves but keep it on the tan cells; it forks and it ends/breaks exactly where the tan cells break.
- red 2x2 blocks = four small log cabins with dark shingle roofs, each a little different (size of roof, orientation of door, a chimney, a woodpile, a lean-to), staggered as a hamlet, not in a line.
- yellow = small tilled vegetable field with crop rows. grey = low wooden fence (the grey line cells) and one stone well (the single grey cell near the cabins).
STRICTLY NO SYMMETRY AND NO REPETITION: every tree must look different, no copy-pasted trees, no mirrored halves, no grid-like rows of identical trees. No characters, no animals, no text, no grid lines, no frame, no vignette, even lighting edge to edge.`;
const prompt = PROMPTS[variant] ?? PROMPTS.base;
const img = (f, m) => ({ type: 'image', mime_type: m, data: readFileSync(f).toString('base64') });
const input = variant.startsWith('a') ? [img(`${DIR}/pk05b_guide_64.png`, 'image/png'), img(`${DIR}/ref_style.png`, 'image/png'), { type: 'text', text: prompt }] : variant.startsWith('r') ? [img(variant === 'r2' ? `${DIR}/pk05_painted_r1.jpg` : `${DIR}/pk05_painted_e1.jpg`, 'image/jpeg'), img(`${DIR}/pk05_guide_64.png`, 'image/png'), img(`${DIR}/ref_style.png`, 'image/png'), { type: 'text', text: prompt }] : variant.startsWith('e') ? [img(`${DIR}/pk05_guide_64.png`, 'image/png'), img(`${DIR}/ref_style.png`, 'image/png'), { type: 'text', text: prompt }] : [img(`${DIR}/ref_style.png`, 'image/png'), img(`${DIR}/pk05_guide_64.png`, 'image/png'), { type: 'text', text: prompt }];
const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180000);
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
try {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input, response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '3:2', image_size: '2K' } }), signal: ctrl.signal });
  const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch {}
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), variant, model: MODEL, status: res.status }) + '\n');
  if (res.status === 429) { console.log('HTTP 429 → 즉시 중단'); process.exit(3); }
  const im = res.ok ? findImage(json) : null;
  if (im) { const out = `${DIR}/pk05_painted_${variant}.jpg`; writeFileSync(out, Buffer.from(im.data, 'base64')); console.log('성공', out, `누적 ${used + 1}/${BUDGET}`); }
  else console.log(`실패 HTTP ${res.status}: ${scrub(raw).slice(0, 400)}`);
} catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), variant, status: 'error' }) + '\n'); console.log('오류', e.name === 'AbortError' ? '타임아웃' : scrub(e.message)); }
finally { clearTimeout(t); }
