import Phaser from 'phaser';
import { L } from '../layout.js';
import { settings, TERRAIN_GRADE } from '../settings.js';
import { composeRm } from './rmAutotile.js';
import { RM_PX, RM_SHEETS, rmTexKey } from '../data/rmTileset.js';
import { UnityGround, unityReady } from './UnityGround.js';

// RM MV 타일셋 지면 렌더(settings.terrainStyle === 'rm'): 진입 시 맵 전체를 1회 합성해 청크 캔버스 텍스처로 캐시한다.
// - 합성은 fx/rmAutotile.composeRm(순수 함수)의 그리기 명령을 2D 캔버스로 실행. 이후 프레임마다 타일 이미지 수백 개 대신 청크 이미지 몇 장만 그린다.
// - 해상도: 캔버스는 칸당 res px(기본 RM 원본 48px), 표시 배율 tile/res. 회화풍 타일이라 LINEAR 필터(비정수 배율에서도 계단·깨짐 없음).
//   다른 타일(64px 도트 에셋)의 NEAREST 설정과 분리: 이 모듈이 만드는 텍스처에만 LINEAR 를 건다.
// - 청크(16x16 칸) + 테두리 PAD px 겹침(비정수 배율에서 청크 사이 이음선 방지) + 화면 밖 청크 숨김(cull).
// - 수면 애니메이션(3프레임)은 settings.terrainWaterAnim === true 일 때만(기본 정적: 메모리 3배·저속 교체).
const CHUNK = 16;
const PAD = 2;
let seq = 0;

// 합성 지면 사용 가능 여부(Battle/Deploy/MapPicker 공용 진입점): 'unity32'(기본) 시트 로드됨 또는 'rm' 시트 7장 로드됨. 아니면 호출 측이 legacy 로 폴백
export function rmReady(scene) {
    return unityReady(scene) || rmSheetsReady(scene);
}
// RM 시트 전용 판정(PropLayer 의 RM 소품 분기 등)
export function rmSheetsReady(scene) {
    return settings.get().terrainStyle === 'rm' && Object.keys(RM_SHEETS).every((s) => scene.textures.exists(rmTexKey(s)));
}

export class RmGround {
    // opts: tile = 칸 표시 크기(월드 단위), res = 캔버스 칸당 px(<= 48, 작은 미니맵은 낮춰 축소 품질 확보)
    constructor(scene, parent, map, opts = {}) {
        // terrainStyle 'unity32': 같은 인터페이스(chunks/opCount/ms/cull/destroy)의 UnityGround 를 대신 돌려준다(호출 측 Battle/Deploy/MapPicker 무수정)
        if (unityReady(scene)) return new UnityGround(scene, parent, map, opts); // eslint-disable-line no-constructor-return
        const { tile, res = RM_PX } = opts;
        this.scene = scene;
        this.chunks = [];
        this.keys = [];
        this.timer = null;
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
        const comp = composeRm(map);
        this.biome = comp.biome;
        map.rmOccupied = comp.occupied; // PropLayer 가 소품 금지 칸으로 사용(Battle 은 같은 map 객체를 펼쳐 넘긴다)
        const src = Object.fromEntries(Object.keys(RM_SHEETS).map((s) => [s, scene.textures.get(rmTexKey(s)).getSourceImage()]));
        const softs = comp.ops.filter((o) => o.t === 'soft').map((o) => ({ op: o, cv: softCanvas(o) }));
        const anim = settings.get().terrainWaterAnim === true;
        const grade = { ...TERRAIN_GRADE, ...(settings.get().terrainGrade ?? {}) };
        const k = res / RM_PX; // 합성 픽셀 -> 캔버스 픽셀
        const sc = tile / res; // 캔버스 픽셀 -> 월드 단위
        for (let cy = 0; cy < comp.rows; cy += CHUNK) {
            for (let cx = 0; cx < comp.cols; cx += CHUNK) {
                const cw = Math.min(CHUNK, comp.cols - cx); const ch = Math.min(CHUNK, comp.rows - cy);
                const X0 = cx * RM_PX; const Y0 = cy * RM_PX; const X1 = X0 + cw * RM_PX; const Y1 = Y0 + ch * RM_PX;
                const ops = comp.ops.filter((o) => o.t === 'img' && o.dx < X1 + PAD && o.dx + o.dw > X0 - PAD && o.dy < Y1 + PAD && o.dy + o.dh > Y0 - PAD);
                const frames = anim && ops.some((o) => o.anim) ? 3 : 1;
                const W = Math.ceil(cw * res) + PAD * 2; const H = Math.ceil(ch * res) + PAD * 2;
                const keys = [];
                for (let f = 0; f < frames; f++) {
                    const key = `rm_ground_${++seq}`;
                    const tex = scene.textures.createCanvas(key, W, H);
                    const ctx = tex.getContext();
                    ctx.imageSmoothingEnabled = true;
                    ctx.save();
                    ctx.translate(PAD, PAD);
                    ctx.scale(k, k);
                    ctx.translate(-X0, -Y0);
                    let soft = 0;
                    comp.ops.forEach((o) => {
                        if (o.t === 'img') {
                            if (!(o.dx < X1 + PAD && o.dx + o.dw > X0 - PAD && o.dy < Y1 + PAD && o.dy + o.dh > Y0 - PAD)) return;
                            const sx = o.anim ? o.sx + f * o.anim * RM_PX : o.sx;
                            if (o.flip) { ctx.save(); ctx.translate(o.dx * 2 + o.dw, 0); ctx.scale(-1, 1); ctx.drawImage(src[o.s], sx, o.sy, o.sw, o.sh, o.dx, o.dy, o.dw, o.dh); ctx.restore(); }
                            else ctx.drawImage(src[o.s], sx, o.sy, o.sw, o.sh, o.dx, o.dy, o.dw, o.dh);
                        } else if (o.t === 'soft') drawSoft(ctx, softs[soft++].cv, o, comp);
                        else if (o.t === 'rect') { ctx.fillStyle = o.color; ctx.fillRect(o.dx, o.dy, o.dw, o.dh); }
                        else if (o.t === 'shadow') { ctx.fillStyle = `rgba(0,0,0,${o.a})`; ctx.beginPath(); ctx.ellipse(o.cx, o.cy, o.rx, o.ry, 0, 0, Math.PI * 2); ctx.fill(); }
                        else if (o.t === 'grade') gradeCanvas(ctx, grade);
                        else if (o.t === 'edge' && grade.vignette > 0) drawEdge(ctx, o, comp, grade.vignette);
                    });
                    ctx.restore();
                    tex.refresh();
                    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
                    keys.push(key);
                    this.keys.push(key);
                }
                const img = scene.add.image(cx * tile - PAD * sc, cy * tile - PAD * sc, keys[0]).setOrigin(0).setScale(sc);
                parent.add(img);
                this.chunks.push({ img, keys, x0: cx * tile, y0: cy * tile, x1: (cx + cw) * tile, y1: (cy + ch) * tile });
            }
        }
        if (this.chunks.some((c) => c.keys.length > 1)) {
            const seqF = [0, 1, 2, 1]; let i = 0;
            this.timer = scene.time.addEvent({ delay: 450, loop: true, callback: () => { i = (i + 1) % 4; this.chunks.forEach((c) => { if (c.keys.length > 1) c.img.setTexture(c.keys[seqF[i]]); }); } });
        }
        this.ms = t0 ? Math.round(performance.now() - t0) : 0;
        this.opCount = comp.ops.length;
    }

    cull(world) {
        const s = world.scaleX;
        this.chunks.forEach((c) => {
            const vis = world.x + c.x1 * s >= 0 && world.x + c.x0 * s <= L.lw && world.y + c.y1 * s >= 0 && world.y + c.y0 * s <= L.lh;
            if (c.img.visible !== vis) c.img.setVisible(vis);
        });
    }

    destroy() {
        this.timer?.remove();
        this.chunks.forEach((c) => c.img.destroy());
        this.keys.forEach((k) => { if (this.scene.textures.exists(k)) this.scene.textures.remove(k); });
        this.chunks = []; this.keys = [];
    }
}

// soft 명령: 표본 격자(gw x gh, 칸당 여러 표본, 이미 블러·물가 계수 적용됨) -> 알파 캔버스, 맵 전체 크기로 쌍선형 확대
function softCanvas(o) {
    const cv = document.createElement('canvas');
    cv.width = o.gw; cv.height = o.gh;
    const c = cv.getContext('2d');
    const img = c.createImageData(o.gw, o.gh);
    for (let i = 0; i < o.gw * o.gh; i++) {
        img.data[i * 4] = o.color[0]; img.data[i * 4 + 1] = o.color[1]; img.data[i * 4 + 2] = o.color[2];
        img.data[i * 4 + 3] = Math.round(o.grid[i] * o.alpha * 255);
    }
    c.putImageData(img, 0, 0);
    return cv;
}
// 색 보정: 캔버스 전체(변환 무시) 픽셀 1회. 휘도 기준 채도 배율 -> 명도 배율 -> 따뜻하게
function gradeCanvas(ctx, g) {
    if (g.sat === 1 && g.val === 1 && !g.warm) return;
    const cv = ctx.canvas;
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const d = img.data;
    const kr = g.val * (1 + g.warm); const kg = g.val; const kb = g.val * (1 - g.warm);
    for (let i = 0; i < d.length; i += 4) {
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = (l + (d[i] - l) * g.sat) * kr; d[i + 1] = (l + (d[i + 1] - l) * g.sat) * kg; d[i + 2] = (l + (d[i + 2] - l) * g.sat) * kb;
    }
    ctx.putImageData(img, 0, 0);
}
// 맵 가장자리 안쪽 비네팅: 네 변에서 width 만큼 남색 -> 투명 선형 감쇠(합성 좌표계)
function drawEdge(ctx, o, comp, a) {
    const W = comp.cols * RM_PX; const H = comp.rows * RM_PX; const w = o.width;
    const c = `${o.color[0]},${o.color[1]},${o.color[2]}`;
    const band = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const gr = ctx.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = gr; ctx.fillRect(rx, ry, rw, rh);
    };
    band(0, 0, 0, w, 0, 0, W, w); band(0, H, 0, H - w, 0, H - w, W, w);
    band(0, 0, w, 0, 0, 0, w, H); band(W, 0, W - w, 0, W - w, 0, w, H);
}
function drawSoft(ctx, cv, o, comp) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cv, 0, 0, o.gw, o.gh, 0, 0, comp.cols * RM_PX, comp.rows * RM_PX);
    ctx.restore();
}
