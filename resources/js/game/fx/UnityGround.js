import Phaser from 'phaser';
import { L } from '../layout.js';
import { settings } from '../settings.js';
import { U32_EXT, U32_EXT2, U32_EXT3, U32_KEY, U32_PX, U32_TV2, U32_TV2_SHEETS, U32_WS, U32_WS_SHEETS, u32Src, u32Animated, u32AnimFrame, u32TileFor } from '../data/unityTileset.js';
import { u32ComposeWithBuildings } from '../data/unityPrefabs.js';
import { TV2_INDEX_MAP, TV2_INDEX_MAP_REGROUNDED } from '../data/tv2Map.js';
import { TV3_PIER, TV3_PIER_KEY, TV3_TEXTURE_KEYS, tv3Compose, tv3Hash, tv3Tone } from '../data/terrainV3.js';
import { TB_MANIFEST_KEY, pierSheetName } from '../data/mapArt.js';

// Unity 32px 타일셋 지면 렌더(settings.terrainStyle === 'unity32', 기본). 배치 규칙은 data/unityTileset.js(타일 1칸 = 타일 1개 직배치).
// - 진입 시 맵 전체를 칸당 32px 원본 그대로 캔버스에 1회 그려(정수 좌표, imageSmoothing 끔) 청크 텍스처로 캐시한다(28x20 맵 = 896x640 1장).
//   프레임마다 칸 이미지 560개 대신 이미지 1장만 그린다.
// - 필터: NEAREST(가이드의 Filter Mode = Point). 표시 배율 = tile / 32. 텍스처 자체는 보간하지 않는다.
//   예외: 미리보기처럼 res 를 원본보다 작게 요청한 축소 표시(Deploy/MapPicker)는 NEAREST 축소 시 모아레가 심해 LINEAR 로 줄인다(확대 블러는 없음).
// - 청크(64x64 칸, 텍스처 2048px 이하) 경계 이음선 방지: 청크 둘레 1px 에 이웃 칸 픽셀을 함께 그려 겹친다(PAD).
// - 레이어: 이 지면은 tileLayer(가장 아래). 소품·하이라이트·유닛은 기존 컨테이너 순서 그대로(지형 -> 장식 -> 유닛).
const CHUNK = 64;
const PAD = 1;
// mapArt(v3 적용) 맵의 다리(bridge, v3 미지원 = unity 판자 타일) 색 교체: 문화권 -> 칸 평균색(명도 무늬 유지). 채도 높은 주황 판자가 흙벽·건조 지면에서 튀던 문제(강화면 k134 su_ch18_s9_otrar)
// 'me' = M(중앙아시아·중동)·I(인도) 키트 맵. 그 외 문화권은 기존 색 그대로
export const BRIDGE_RECOLOR = { me: 0x7c5a3a };
let seq = 0;

// tile_patch.tile -> tv2 전역 인덱스(정수 1000 이상 그대로, 문자열은 TV2_INDEX_MAP -> 재바탕 표 순). 해석 불가면 null
function tv2TileIdx(tile) {
    if (tile == null || tile === '') return null;
    if (typeof tile === 'number' || /^\d+$/.test(String(tile))) { const n = Number(tile); return Number.isInteger(n) && n >= U32_TV2.static.start ? n : null; }
    return TV2_INDEX_MAP[tile] ?? TV2_INDEX_MAP_REGROUNDED[tile] ?? null;
}

export function unityReady(scene) {
    const st = settings.get().terrainStyle;
    return (st === 'unity32' || st === 'v3') && scene.textures.exists(U32_KEY); // 'v3' = unity32 합성 + 지원 칸만 자체 제작 지형(data/terrainV3.js)
}

export class UnityGround {
    // opts: tile = 칸 표시 크기(월드 단위), res = 표시 백킹 px(작으면 축소 미리보기로 보고 LINEAR)
    // fgParent = tile_layer.v2 foreground(유닛 위) 를 담을 컨테이너(Battle). 없으면 전경도 지면 캔버스에 굽는다
    // mapArt(Battle 만 전달): forceV3 = 설정과 무관하게 v3 지면, villageArt/structArt = 마을 v·성벽 W·성 c 칸을 v3 바닥으로(집·성벽·본관은 MapArtLayer), groundTone = meta.ground_tone
    constructor(scene, parent, map, { tile, res, fgParent, villageArt = false, structArt = false, forceV3 = false, groundTone = null } = {}) {
        this.scene = scene;
        this.chunks = [];
        this.keys = [];
        this.style = 'unity32';
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
        if (U32_EXT.enabled && !scene.textures.exists(U32_EXT.key)) { U32_EXT.enabled = false; console.warn('[terrain] 확장 시트 로드 실패 -> 30 이상 인덱스는 지형 코드 폴백'); } // 빈 칸 방지
        if (U32_EXT2.enabled && !scene.textures.exists(U32_EXT2.key)) { U32_EXT2.enabled = false; console.warn('[terrain] 확장 시트2 로드 실패 -> 110 이상 인덱스는 지형 코드 폴백'); }
        if (U32_EXT3.enabled && !scene.textures.exists(U32_EXT3.key)) { U32_EXT3.enabled = false; console.warn('[terrain] 육상 세트(land_set) 로드 실패 -> 500 이상 인덱스·이웃 규칙 생략(기존 레시피)'); }
        if (U32_WS.enabled && U32_WS_SHEETS.some((w) => !scene.textures.exists(w.key))) { U32_WS.enabled = false; console.warn('[terrain] 수상 세트(water_set) 로드 실패 -> 200 이상 인덱스는 지형 코드 폴백'); }
        if (U32_TV2.enabled && U32_TV2_SHEETS.some((w) => !scene.textures.exists(w.key))) { U32_TV2.enabled = false; console.warn('[terrain] 타일셋 v2 로드 실패 -> 기존 타일(맵 index_map)'); }
        const comp = u32ComposeWithBuildings(map);
        if (comp.warnings.length) console.info(`[terrain] unity32 ${comp.warnings.length}건`, comp.warnings);
        this.biome = map.biome ?? null;
        this.rockfallTile = map.rockfallTile ?? null; // 낙석(terrain_change to mountain) 칸 기본 타일 이름(tile 필드가 없을 때)
        map.rmOccupied = new Set(); // PropLayer 호환(unity32 는 소품을 쓰지 않음)
        // 시트: 기본 30칸 + (있으면) 확장 시트. 확장 인덱스인데 시트가 없으면 그 칸은 지형 코드 폴백 타일로 이미 대체돼 있어야 하므로 기본 시트 0번 대신 건너뜀
        const srcs = { [U32_KEY]: scene.textures.get(U32_KEY).getSourceImage() };
        [U32_EXT, U32_EXT2, U32_EXT3].forEach((s) => { if (s.enabled && scene.textures.exists(s.key)) srcs[s.key] = scene.textures.get(s.key).getSourceImage(); }); // 확장2도 같은 캔버스 합성(imageSmoothing 끔 = NEAREST)
        if (U32_WS.enabled) U32_WS_SHEETS.forEach((s) => { srcs[s.key] = scene.textures.get(s.key).getSourceImage(); }); // 수상 세트 4장(정적·애니·건물 덧그림·덧그림)
        if (U32_TV2.enabled) U32_TV2_SHEETS.forEach((s) => { srcs[s.key] = scene.textures.get(s.key).getSourceImage(); }); // 타일셋 v2 2장(정적·애니)
        // terrainStyle 'v3'(시범): 지원 칸(p f m w s r d)은 v3 질감/경계 타일로 바닥을 바꾸고, 숲·산 칸은 기존 덧그림(mid·fg)을 빼고 v3 오브젝트(소나무·봉우리)를 쓴다.
        // 미지원 칸·미지원 바이옴·시트 미로드 = unity32 그대로(폴백). 오브젝트: 칸 윗변 아래 부분은 지면 캔버스, 윗변 위로 솟은 부분은 fgParent(유닛 위) = 칸 기준 y 정렬
        this.tv3 = null;
        this.villageArt = 0; // mapArt 로 v3 풀로 바꾼 마을 칸 수(0 = 기존 렌더)
        this.structArt = 0; // mapArt 로 v3 바닥으로 바꾼 성벽 W·성 c 칸 수
        let tv3Src = null;
        if (settings.get().terrainStyle === 'v3' || forceV3) {
            const miss = TV3_TEXTURE_KEYS.filter((k) => !scene.textures.exists(k));
            if (miss.length) console.warn(`[terrain] v3 시트 ${miss.length}장 로드 실패 -> unity32 폴백`, miss);
            else {
                const seed = map.code ? [...String(map.code)].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) | 0, 7) : 7;
                // 부두 시트: meta.pier_style(map.pierStyle) 시트가 로드돼 있으면 그 시트(예 pier_stone 32x40, 위로 8px, 변형 _b 칸 해시 ~50%), 아니면 기본 나무 부두(TV3_PIER)
                const pdef = scene.cache.json.get(TB_MANIFEST_KEY)?.sheets ?? null;
                const psn = pierSheetName(map.pierStyle, pdef);
                const psKey = psn ? `tb_sheet_${psn}` : null;
                const pierSh = psKey && scene.textures.exists(psKey) ? { key: psKey, keyB: pdef[psn].file_b && scene.textures.exists(`${psKey}_b`) ? `${psKey}_b` : null, w: pdef[psn].cell[0], h: pdef[psn].cell[1], over: Number(pdef[psn].overhang_top_px) || 0 } : null;
                if (map.pierStyle && !pierSh && !['wood', 'pier_wood'].includes(map.pierStyle)) console.info('[terrain] pier_style 시트 없음 -> 나무 부두', map.pierStyle);
                const pierDraw = pierSh ?? (scene.textures.exists(TV3_PIER_KEY) ? { key: TV3_PIER_KEY, keyB: null, ...TV3_PIER } : null);
                const pier = !!pierDraw;
                const extra = { ...(villageArt ? { village: 'grass' } : {}), ...(structArt ? { wall: 'grass', castle: 'dirt' } : {}) };
                const tv = tv3Compose(comp, { biome: map.biome ?? null, seed, pier, extra: Object.keys(extra).length ? extra : null, pierCell: pierDraw ?? TV3_PIER });
                const tone = tv3Tone(groundTone);
                if (tv.applied) {
                    // 숲·산·암초·언덕·부두(+ mapArt 마을·성벽·성)는 unity 덧그림(mid·fg)을 빼고 v3 오브젝트/MapArtLayer 가 그린다. 바다는 물결 덧그림도 뺀다(정적 v3 물). over(목표 깃발 등)는 유지
                    const strip = new Set(['forest', 'mountain', 'reef', 'hill', 'harbor', 'sea', ...Object.keys(extra)]);
                    tv.cells.forEach((src, i) => { const c = comp.cells[i]; c.v3 = src; if (strip.has(c.code)) { delete c.mid; delete c.fg; } if (tone && c.code !== 'water' && c.code !== 'sea' && c.code !== 'reef' && c.code !== 'harbor') c.tone = tone; if (c.code === 'village') this.villageArt += 1; else if (c.code === 'wall' || c.code === 'castle') this.structArt += 1; });
                    const brc = BRIDGE_RECOLOR[map.culture];
                    if (brc != null) comp.cells.forEach((c) => { if (c.code === 'bridge' && !c.v3 && !u32Animated(c.idx)) c.recolor = brc; });
                    this.tv3Piers = pier ? tv.piers : [];
                    this.tv3PierDraw = pierDraw;
                    this.tv3 = { cols: comp.cols, cells: tv.cells.size, fallback: tv.fallback, objects: tv.objects, img: Object.fromEntries([...new Set(tv.objects.map((o) => o.key))].map((k) => [k, scene.textures.get(k).getSourceImage()])) };
                    tv3Src = Object.fromEntries([...TV3_TEXTURE_KEYS, ...(pier ? [pierDraw.key, ...(pierDraw.keyB ? [pierDraw.keyB] : [])] : [])].map((k) => [k, scene.textures.get(k).getSourceImage()]));
                }
                console.info(`[terrain] v3 ${tv.applied ? `적용 ${tv.cells.size}칸, 오브젝트 ${tv.objects.length}` : `미적용(${tv.reason ?? '지원 칸 없음'})`}, 폴백 칸`, tv.fallback);
            }
        }
        // v3 미적용(실내 서고 biome 'library' 등 미지원 바이옴·시트 미로드)이어도 meta.ground_tone 은 unity32 바닥에 곱한다(물·바다·암초·부두·허공 제외, 2026-11-08 서고 L 키트)
        if (!this.tv3 && groundTone) {
            const tn = tv3Tone(groundTone);
            if (tn) comp.cells.forEach((c) => { if (!['water', 'sea', 'reef', 'harbor', 'void'].includes(c.code)) c.tone = tn; });
        }
        const tintCache = new Map();
        const fgSep = !!fgParent && (comp.fgCells > 0 || !!this.tv3?.objects.length);
        const hideObj = !!map.hideObjectiveOverlay; // 전투: 목표 깃발(420~423)은 Battle.refreshObjectives 가 점유 색과 함께 스프라이트로 그린다(구운 깃발 중복·생존형 맵의 장식 깃발 숨김)
        const tileCanvas = (idx, tint, wash, f = 0, recolor = null) => {
            const k = `${idx}:${tint}:${wash}:${f}:${recolor}`;
            if (tintCache.has(k)) return tintCache.get(k);
            const cv = document.createElement('canvas'); cv.width = U32_PX; cv.height = U32_PX;
            const c = cv.getContext('2d');
            c.imageSmoothingEnabled = false;
            const { key, sx, sy } = u32Src(idx, f);
            const src = srcs[key];
            c.drawImage(src, sx, sy, U32_PX, U32_PX, 0, 0, U32_PX, U32_PX);
            const hex = (v) => `#${v.toString(16).padStart(6, '0')}`;
            if (tint != null) { c.globalCompositeOperation = 'multiply'; c.fillStyle = hex(tint); c.fillRect(0, 0, U32_PX, U32_PX); }
            if (wash) { c.globalCompositeOperation = 'source-over'; c.globalAlpha = wash[1]; c.fillStyle = hex(wash[0]); c.fillRect(0, 0, U32_PX, U32_PX); c.globalAlpha = 1; } // 덧칠(밝게)
            if (recolor != null) { // 명도만 남기고 색 교체(칸 평균 = recolor): 채도 높은 주황 다리 판을 문화권 흙벽 톤으로(BRIDGE_RECOLOR)
                try {
                    const d = c.getImageData(0, 0, U32_PX, U32_PX); const a = d.data;
                    let sum = 0; let n = 0;
                    for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 0) { sum += 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]; n += 1; }
                    const ref = n ? Math.max(1, sum / n) : 1; const rgb = [(recolor >> 16) & 255, (recolor >> 8) & 255, recolor & 255];
                    for (let i = 0; i < a.length; i += 4) { const r = (0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]) / ref; a[i] = Math.min(255, rgb[0] * r); a[i + 1] = Math.min(255, rgb[1] * r); a[i + 2] = Math.min(255, rgb[2] * r); }
                    c.putImageData(d, 0, 0);
                } catch (e) { /* 캔버스 읽기 실패 = 원래 색 */ }
            }
            c.globalCompositeOperation = 'destination-in'; // 원본 알파 유지
            c.drawImage(src, sx, sy, U32_PX, U32_PX, 0, 0, U32_PX, U32_PX);
            tintCache.set(k, cv);
            return cv;
        };
        // f = 애니 프레임(0~3). 애니 칸(ws_anim·목표 깃발)만 의미가 있고 정적 칸은 무시
        const drawCell = (ctx, cell, dx, dy, f = 0) => {
            if (cell.v3 && tv3Src?.[cell.v3.key]) {
                ctx.drawImage(tv3Src[cell.v3.key], cell.v3.sx, cell.v3.sy, U32_PX, U32_PX, dx, dy, U32_PX, U32_PX); // v3 바닥(불투명, 회전·틴트 없음)
                if (cell.tone) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = cell.tone.alpha; ctx.fillStyle = cell.tone.color; ctx.fillRect(dx, dy, U32_PX, U32_PX); ctx.restore(); } // 지면 톤(meta.ground_tone)
            }
            else {
                if (!drawBase(ctx, cell, dx, dy, f)) return; // 기존과 같음: 바닥 시트가 없으면 칸 전체 생략
                if (cell.tone) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = cell.tone.alpha; ctx.fillStyle = cell.tone.color; ctx.fillRect(dx, dy, U32_PX, U32_PX); ctx.restore(); } // 지면 톤(v3 미적용 바이옴, 위 참고)
            }
            if (cell.mid) cell.mid.forEach((m) => { const o = u32Src(m, f); if (srcs[o.key]) ctx.drawImage(srcs[o.key], o.sx, o.sy, U32_PX, U32_PX, dx, dy, U32_PX, U32_PX); }); // tile_layer.v2 building·object(투명 오브젝트, 유닛 아래)
            if (cell.fg != null && !fgSep) { const o = u32Src(cell.fg, f); if (srcs[o.key]) ctx.drawImage(srcs[o.key], o.sx, o.sy, U32_PX, U32_PX, dx, dy, U32_PX, U32_PX); } // 전경: 별도 부모가 없으면(미리보기) 지면에 함께 굽는다
            if (cell.over != null && !(hideObj && cell.over >= 420 && cell.over <= 423)) { const o = u32Src(cell.over, f); if (srcs[o.key]) ctx.drawImage(srcs[o.key], o.sx, o.sy, U32_PX, U32_PX, dx, dy, U32_PX, U32_PX); } // 오버레이(깃발 103·수상 세트 400~425, 투명 PNG)
        };
        const drawBase = (ctx, cell, dx, dy, f) => {
            const { key, sx, sy } = u32Src(cell.idx, f);
            if (!srcs[key]) return false;
            const tinted = cell.tint != null || cell.wash || cell.recolor != null;
            const img = tinted ? tileCanvas(cell.idx, cell.tint, cell.wash, u32Animated(cell.idx) ? f : 0, cell.recolor ?? null) : srcs[key];
            const ox = tinted ? 0 : sx; const oy = tinted ? 0 : sy;
            if (cell.rot) {
                ctx.save();
                ctx.translate(dx + U32_PX / 2, dy + U32_PX / 2);
                ctx.rotate((cell.rot * Math.PI) / 2); // 90도 단위만
                ctx.drawImage(img, ox, oy, U32_PX, U32_PX, -U32_PX / 2, -U32_PX / 2, U32_PX, U32_PX);
                ctx.restore();
            } else ctx.drawImage(img, ox, oy, U32_PX, U32_PX, dx, dy, U32_PX, U32_PX);
            return true;
        };
        this.drawCell = drawCell;
        this.frame = 0;
        const minify = res != null && res < U32_PX * 0.75;
        const sc = tile / U32_PX; // 캔버스 px -> 월드 단위
        const at = (x, y) => comp.cells[y * comp.cols + x];
        for (let cy = 0; cy < comp.rows; cy += CHUNK) {
            for (let cx = 0; cx < comp.cols; cx += CHUNK) {
                const cw = Math.min(CHUNK, comp.cols - cx); const ch = Math.min(CHUNK, comp.rows - cy);
                const W = cw * U32_PX + PAD * 2; const H = ch * U32_PX + PAD * 2;
                const key = `u32_ground_${++seq}`;
                const tex = scene.textures.createCanvas(key, W, H);
                const ctx = tex.getContext();
                ctx.imageSmoothingEnabled = false;
                const anim = []; // 애니 칸(바다·전이·암초·허공 / 목표 깃발 덧그림): tick 에서 이 칸만 다시 그린다(칸 전체 덮어쓰기: 애니 타일은 전부 불투명)
                // 청크 칸 + 둘레 1칸(맵 안일 때만, PAD px 만 보임)
                for (let y = Math.max(0, cy - 1); y < Math.min(comp.rows, cy + ch + 1); y++) {
                    for (let x = Math.max(0, cx - 1); x < Math.min(comp.cols, cx + cw + 1); x++) {
                        const cell = at(x, y); const dx = PAD + (x - cx) * U32_PX; const dy = PAD + (y - cy) * U32_PX;
                        drawCell(ctx, cell, dx, dy, 0);
                        if ((!cell.v3 && u32Animated(cell.idx)) || (cell.over != null && u32Animated(cell.over)) || cell.mid?.some(u32Animated)) anim.push({ cell, dx, dy });
                    }
                }
                // 부두(harbor) 오토타일: 칸 바닥 위에 덧그림(위로 pd.over px 걸침, 평평해서 지면 캔버스). pd = 나무(TV3_PIER) 또는 meta.pier_style 시트
                const pd = this.tv3PierDraw;
                if (this.tv3Piers?.length && pd && tv3Src?.[pd.key]) {
                    this.tv3Piers.forEach((p) => {
                        const c = comp.cells[p.cell];
                        if (c.x < cx - 1 || c.x > cx + cw || c.y < cy - 1 || c.y > cy + ch) return;
                        const im = pd.keyB && tv3Src[pd.keyB] && tv3Hash(c.x, c.y, 71) < 0.5 ? tv3Src[pd.keyB] : tv3Src[pd.key];
                        ctx.drawImage(im, p.sx, p.sy, pd.w, pd.h, PAD + (c.x - cx) * U32_PX, PAD + (c.y - cy) * U32_PX - pd.over, pd.w, pd.h);
                    });
                }
                // v3 오브젝트(by 오름차순 = y 정렬). 칸 윗변 아래 = 지면(유닛 아래), 위 = 전경(유닛 위). 전경 부모가 없으면(미리보기) 통째로 지면에
                const objUp = [];
                if (this.tv3) {
                    const ox0 = PAD - cx * U32_PX; const oy0 = PAD - cy * U32_PX;
                    this.tv3.objects.forEach((o) => {
                        const im = this.tv3.img[o.key]; if (!im) return;
                        const w = im.width; const h = im.height;
                        const L0 = o.cx - Math.floor(w / 2) + ox0; const T0 = o.by - h + oy0;
                        if (L0 >= W || L0 + w <= 0 || T0 >= H || T0 + h <= 0) return;
                        const split = fgSep ? Math.max(0, Math.min(h, (comp.cells[o.cell].y * U32_PX + oy0) - T0)) : 0;
                        if (split < h) ctx.drawImage(im, 0, split, w, h - split, L0, T0 + split, w, h - split);
                        if (split > 0) objUp.push([im, w, split, L0, T0]);
                    });
                }
                tex.refresh();
                tex.setFilter(minify ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST);
                this.keys.push(key);
                const img = scene.add.image(cx * tile - PAD * sc, cy * tile - PAD * sc, key).setOrigin(0).setScale(sc);
                parent.add(img);
                this.chunks.push({ img, keys: [key], tex, ctx, anim, cx, cy, cw, ch, x0: cx * tile, y0: cy * tile, x1: (cx + cw) * tile, y1: (cy + ch) * tile });
                // tile_layer.v2 foreground: 같은 청크 영역의 투명 캔버스 1장을 fgParent(유닛 위)에 둔다. 정적(애니 없음, tick 대상 아님)
                if (fgSep) {
                    const fgList = [];
                    for (let y = Math.max(0, cy - 1); y < Math.min(comp.rows, cy + ch + 1); y++) {
                        for (let x = Math.max(0, cx - 1); x < Math.min(comp.cols, cx + cw + 1); x++) { const cell = at(x, y); if (cell.fg != null) fgList.push([cell.fg, PAD + (x - cx) * U32_PX, PAD + (y - cy) * U32_PX]); }
                    }
                    if (fgList.length || objUp.length) {
                        const fkey = `u32_fg_${++seq}`;
                        const ftex = scene.textures.createCanvas(fkey, W, H);
                        const fctx = ftex.getContext(); fctx.imageSmoothingEnabled = false;
                        fgList.forEach(([i, dx, dy]) => { const o = u32Src(i, 0); if (srcs[o.key]) fctx.drawImage(srcs[o.key], o.sx, o.sy, U32_PX, U32_PX, dx, dy, U32_PX, U32_PX); });
                        objUp.forEach(([im, w, hh, x, y]) => fctx.drawImage(im, 0, 0, w, hh, x, y, w, hh)); // v3 오브젝트 윗부분(y 정렬 순서 유지)
                        ftex.refresh();
                        ftex.setFilter(minify ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST);
                        this.keys.push(fkey);
                        const fimg = scene.add.image(cx * tile - PAD * sc, cy * tile - PAD * sc, fkey).setOrigin(0).setScale(sc);
                        fgParent.add(fimg);
                        this.chunks.push({ img: fimg, keys: [fkey], tex: ftex, ctx: fctx, anim: [], fg: true, fcx: cx, fcy: cy, fcw: cw, fch: ch, x0: cx * tile, y0: cy * tile, x1: (cx + cw) * tile, y1: (cy + ch) * tile });
                    }
                }
            }
        }
        this.animCells = this.chunks.reduce((n, c) => n + c.anim.length, 0);
        this.ms = t0 ? Math.round(performance.now() - t0) : 0;
        this.opCount = comp.cells.length;
        this.detail = comp.layer ? `tile_layer(폴백 ${comp.fallback}칸${comp.tv2 ? `, tv2 ${comp.tv2}칸` : ''}${comp.v2Cells ? `, v2 레이어 ${comp.v2Cells}칸` : ''})` : `건물 ${comp.placed.length}`; // Battle 의 [terrain] 로그와 중복 출력하지 않음
    }

    // 수상 애니(4fps): 전역 시계 프레임이 바뀌면 보이는 청크의 애니 칸만 다시 그려 텍스처 갱신. still=true(연출 끄기 등)면 프레임 0 고정
    tick(time, still = false) {
        if (!this.animCells) return;
        const f = still ? 0 : u32AnimFrame(time);
        if (f === this.frame) return;
        this.frame = f;
        this.chunks.forEach((c) => {
            if (!c.anim.length || !c.img.visible) { c.stale = c.anim.length > 0; return; }
            c.stale = false;
            c.anim.forEach((a) => this.drawCell(c.ctx, a.cell, a.dx, a.dy, f));
            c.tex.refresh();
        });
    }

    // 지형 변경 칸 재렌더(cue terrain_change / battle.cues.tile_patch): 지형 코드 to 의 기본 타일로 칸 전체를 덮어 그린다(정적 tile_layer decor 위).
    // 이웃 청크의 테두리(PAD 1px)는 그대로. 애니 타일이면 tick 대상에 넣고, 기존 그 칸의 애니 항목은 뺀다. list: [{x, y, to, tile?}]
    // tile(선택): tv2 타일 지정 — 전역 인덱스(정수, tv2 1000~) 또는 tv2 타일 이름(TV2_INDEX_MAP 키, 예 'seoga_floor_a'). 시트가 있으면 지형 코드 기본 타일보다 우선
    // (실내 맵에서 W=성벽·f=나무로 덮이는 문제 방지). 없거나 해석 불가면 기존 동작(u32TileFor(to)).
    patchCells(list) {
        (list ?? []).forEach(({ x, y, to, tile }) => {
            const c = this.chunks.find((k) => x >= k.cx && x < k.cx + k.cw && y >= k.cy && y < k.cy + k.ch);
            if (!c || !to) return;
            let ti = tv2TileIdx(tile ?? (to === 'mountain' ? this.rockfallTile : null));
            if (ti != null && !(U32_TV2.enabled && this.scene.textures.exists(u32Src(ti, 0).key))) ti = null; // 시트 없음: 빈 칸 방지 -> 지형 코드 폴백
            const tf = ti != null ? { idx: ti, tint: null, wash: null } : u32TileFor(to, this.biome, x, y);
            const cell = { x, y, code: to, idx: tf.idx, rot: 0, tint: tf.tint, wash: tf.wash, ...(tf.mid?.length ? { mid: tf.mid } : {}) }; // mid: 서고 책상 등 투명 오브젝트(레시피)
            const dx = PAD + (x - c.cx) * U32_PX; const dy = PAD + (y - c.cy) * U32_PX;
            c.ctx.clearRect(dx, dy, U32_PX, U32_PX);
            this.drawCell(c.ctx, cell, dx, dy, this.frame ?? 0);
            c.anim = c.anim.filter((a) => a.dx !== dx || a.dy !== dy);
            if (u32Animated(cell.idx)) { c.anim.push({ cell, dx, dy }); this.animCells = true; }
            c.tex.refresh();
            // 전경(tile_layer.v2 foreground, 유닛 위 별도 캔버스)에 옛 지형의 덧그림(산봉우리·나무 꼭대기 등)이 남지 않게 그 칸만 지운다
            const fc = this.chunks.find((k) => k.fg && x >= k.fcx && x < k.fcx + k.fcw && y >= k.fcy && y < k.fcy + k.fch);
            if (fc) { fc.ctx.clearRect(PAD + (x - fc.fcx) * U32_PX, PAD + (y - fc.fcy) * U32_PX, U32_PX, U32_PX); fc.tex.refresh(); }
            // v3: 바뀐 칸은 unity32 타일(이웃 경계 재계산 없음). 그 칸 오브젝트가 윗칸으로 솟은 전경 부분도 지운다
            if (this.tv3 && fc) {
                const ci = y * this.tv3.cols + x;
                this.tv3.objects.filter((o) => o.cell === ci).forEach((o) => {
                    const im = this.tv3.img[o.key]; if (!im) return;
                    const top = o.by - im.height; const upH = Math.max(0, y * U32_PX - top); // 칸 윗변 위로 솟은 높이
                    if (upH) fc.ctx.clearRect(PAD + o.cx - Math.floor(im.width / 2) - fc.fcx * U32_PX, PAD + top - fc.fcy * U32_PX, im.width, upH);
                });
                this.tv3.objects = this.tv3.objects.filter((o) => o.cell !== ci);
                fc.tex.refresh();
            }
        });
    }

    cull(world) {
        const s = world.scaleX;
        this.chunks.forEach((c) => {
            const vis = world.x + c.x1 * s >= 0 && world.x + c.x0 * s <= L.lw && world.y + c.y1 * s >= 0 && world.y + c.y0 * s <= L.lh;
            if (c.img.visible !== vis) c.img.setVisible(vis);
        });
    }

    destroy() {
        this.chunks.forEach((c) => c.img.destroy());
        this.keys.forEach((k) => { if (this.scene.textures.exists(k)) this.scene.textures.remove(k); });
        this.chunks = []; this.keys = [];
    }
}

// 진단(읽기 전용, 맵 데이터 불필요): tileset_v2 ext2 구간(obj2 1626~1676 투명 오브젝트, fx 1898~1908 애니)을 실제 렌더 경로와 같은 u32Src·u32Animated 로
// 풀 바탕(1000) 위 오브젝트 칸(cell.mid 와 같은 순서)으로 합성한다. 콘솔: window.__tv2Diag() -> { sheets, empty, animated, url } (url 을 새 탭에 열면 4프레임 미리보기)
export function tv2Diag(scene, { base = 1000, ranges = [[1626, 1676], [1898, 1908], [2000, 2095]] } = {}) {
    const sheets = Object.fromEntries(U32_TV2_SHEETS.map((s) => [s.key, scene.textures.exists(s.key)]));
    const src = (k) => (scene.textures.exists(k) ? scene.textures.get(k).getSourceImage() : null);
    const list = ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
    const cols = 16; const rows = Math.ceil(list.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * U32_PX * 4 + 12; cv.height = rows * U32_PX;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const probe = document.createElement('canvas'); probe.width = U32_PX; probe.height = U32_PX; const pc = probe.getContext('2d', { willReadFrequently: true });
    const empty = []; const animated = [];
    list.forEach((idx, n) => {
        if (u32Animated(idx)) animated.push(idx);
        for (let f = 0; f < 4; f += 1) {
            const dx = f * (cols * U32_PX + 4) + (n % cols) * U32_PX; const dy = Math.floor(n / cols) * U32_PX;
            const b = u32Src(base, 0); const o = u32Src(idx, f);
            const bi = src(b.key); const oi = src(o.key);
            if (bi && idx < 2000) ctx.drawImage(bi, b.sx, b.sy, U32_PX, U32_PX, dx, dy, U32_PX, U32_PX); // 2000~ 는 바탕 타일 자체라 바탕 생략
            if (!oi) { if (f === 0) empty.push({ idx, why: `sheet ${o.key} 없음` }); continue; }
            ctx.drawImage(oi, o.sx, o.sy, U32_PX, U32_PX, dx, dy, U32_PX, U32_PX);
            if (f === 0 || u32Animated(idx)) {
                pc.clearRect(0, 0, U32_PX, U32_PX); pc.drawImage(oi, o.sx, o.sy, U32_PX, U32_PX, 0, 0, U32_PX, U32_PX);
                const d = pc.getImageData(0, 0, U32_PX, U32_PX).data; let on = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) on += 1;
                if (!on) empty.push({ idx, f, why: '빈 프레임(전부 투명)' });
            }
        }
    });
    return { sheets, total: list.length, animated: animated.length, empty, url: cv.toDataURL('image/png') };
}
