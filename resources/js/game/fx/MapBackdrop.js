import Phaser from 'phaser';
import { L } from '../layout.js';
import { settings } from '../settings.js';
import { COLOR } from '../theme.js';

// 맵 바깥 배경(연장 타일 대체, 'rm'·'legacy' 공통): 화면 전체 TileSprite 1개 + 맵 경계 금색 테두리.
// - 레이어: 씬 기본 배경(addBackdrop, depth -1000) 위, 월드(depth 0) 아래 = depth -900. 화면 고정(카메라 스크롤 없음).
// - 텍스처: 안아트 에셋 'bg.map_outside'(manifest 키 -> 텍스처 키 bg_map_outside)가 있으면 그것, 없으면 코드 생성 임시 문양
//   'map_outside_gen'(남색 바탕 + 옅은 금색 마름모 격자, 256px 이음새 없음). 에셋이 나중에 로드되면 setTextureKey(key)만 호출하면 된다.
// - 패럴랙스: 맵 이동량의 PARALLAX 배, 줌은 1 + (배율비 - 1) x PARALLAX 로 약하게(0.8~1.25 제한: 축소 시 모아레 방지).
//   설정 연출 축약/끄기(fxLevel >= 1)면 고정.
// - 테두리: 월드 좌표 Graphics(맵 영역 바로 바깥 사각형). 선 두께는 월드 단위 고정이라 줌에 비례하되 얇게(TILE 52 기준 1.6 단위).
//   안아트 'deco.map_edge'(deco_map_edge)가 오면 9-slice 등 적용 방식은 에셋 규격 확인 후 결정(현재는 선만).
export const OUTSIDE_KEY = 'bg_map_outside';
const GEN_KEY = 'map_outside_gen';
const PARALLAX = 0.35;
const SIZE = 256;

function ensureGenTexture(scene) {
    if (scene.textures.exists(GEN_KEY)) return GEN_KEY;
    const tex = scene.textures.createCanvas(GEN_KEY, SIZE, SIZE);
    const g = tex.getContext();
    g.fillStyle = '#121a2c';
    g.fillRect(0, 0, SIZE, SIZE);
    // 은은한 세로 명암(칠기 결): 이음새 없게 주기 SIZE 의 사인
    for (let x = 0; x < SIZE; x++) { g.fillStyle = `rgba(40,56,92,${(0.08 + 0.05 * Math.sin((x / SIZE) * Math.PI * 4)).toFixed(3)})`; g.fillRect(x, 0, 1, SIZE); }
    // 금색 마름모 격자(64px 간격, 경계에서 이어지도록 -64~SIZE+64 범위로 그림)
    g.strokeStyle = 'rgba(201,162,75,0.10)';
    g.lineWidth = 1;
    for (let i = -SIZE; i <= SIZE * 2; i += 64) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + SIZE, SIZE); g.stroke();
        g.beginPath(); g.moveTo(i, SIZE); g.lineTo(i + SIZE, 0); g.stroke();
    }
    // 격자 교차점의 작은 구름 점(절제된 금박)
    g.fillStyle = 'rgba(240,213,140,0.10)';
    for (let y = 0; y < SIZE; y += 64) for (let x = 0; x < SIZE; x += 64) { g.beginPath(); g.arc(x + 32, y + 32, 3, 0, Math.PI * 2); g.fill(); }
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return GEN_KEY;
}

export class MapBackdrop {
    constructor(scene) {
        this.scene = scene;
        const key = scene.textures.exists(OUTSIDE_KEY) ? OUTSIDE_KEY : ensureGenTexture(scene);
        this.ts = scene.add.tileSprite(0, 0, L.lw, L.lh, key).setOrigin(0).setDepth(-900);
        // 기본 무늬 배율: 안아트 512px 에셋은 가이드 권장 1/3~1/2(여기 0.4), 코드 임시 문양은 1
        this.base = key === OUTSIDE_KEY ? 0.4 : 1;
        this.ts.setTileScale(this.base, this.base);
        this.border = null;
        this.s0 = null;
        this.mapPx = null; // 맵 월드 크기 {w,h}(makeBorder 가 기록). 덮음 판정용
        this.covered = false;
    }

    // 안아트 에셋 도착 시 텍스처 키만 교체
    setTextureKey(key) { if (this.scene.textures.exists(key)) { this.ts.setTexture(key); this.base = key === OUTSIDE_KEY ? 0.4 : 1; this.ts.setTileScale(this.base, this.base); } }

    resize() { this.ts.setSize(L.lw, L.lh); }

    // 맵 경계 테두리(월드 컨테이너 안, 타일 위·소품/하이라이트 아래에 넣는다)
    makeBorder(parent, w, h, tile) {
        this.border?.destroy();
        const g = this.scene.add.graphics();
        const lw = tile * 0.05; // 52 -> 약 2.6 월드 단위(강화면 Low: 기존 1.6/0.55 는 금색이 약함)
        g.lineStyle(lw * 2.2, COLOR.ink, 0.45).strokeRect(-lw * 1.1, -lw * 1.1, w * tile + lw * 2.2, h * tile + lw * 2.2); // 바깥 어두운 그림자
        g.lineStyle(lw, COLOR.accent, 0.85).strokeRect(-lw / 2, -lw / 2, w * tile + lw, h * tile + lw);
        parent.add(g);
        this.border = g;
        this.mapPx = { w: w * tile, h: h * tile };
        return g;
    }

    // 맵(불투명 지면)이 화면 전체를 덮으면 전체 화면 배경 2장(씬 기본 scene.backdrop + 이 TileSprite)을 숨겨 overdraw 를 줄인다(2026-11-14 모바일 성능).
    // 판정: 월드 컨테이너는 화면 논리 좌표(L.lw x L.lh)에 직접 놓이므로 맵 사각형 [world.x, world.x + w*scale] 이 [0, lw] 를 포함하면 덮음. 1 단위 여유.
    syncCover(world) {
        const m = this.mapPx;
        const cov = !!m && world.visible !== false && world.alpha >= 1 && world.rotation === 0
            && world.x <= -1 && world.y <= -1 && world.x + m.w * world.scaleX >= L.lw + 1 && world.y + m.h * world.scaleY >= L.lh + 1;
        if (cov === this.covered) return cov;
        this.covered = cov;
        this.ts.setVisible(!cov);
        const bd = this.scene.backdrop; if (bd?.setVisible && bd.scene) bd.setVisible(!cov);
        return cov;
    }

    // 매 프레임: 월드 위치·배율에 약하게 따라감
    follow(world) {
        if (this.syncCover(world)) return; // 가려진 동안은 무늬 위치 갱신 생략(다시 보일 때 아래에서 즉시 맞춤)
        if (settings.get().fxLevel >= 1) { if (this.ts.tilePositionX || this.ts.tilePositionY) this.ts.setTilePosition(0, 0); return; }
        if (this.s0 == null) this.s0 = world.scaleX || 1;
        const z = Phaser.Math.Clamp(1 + (world.scaleX / this.s0 - 1) * PARALLAX, 0.8, 1.25);
        const zs = z * (this.base ?? 1);
        if (Math.abs(this.ts.tileScaleX - zs) > 0.001) this.ts.setTileScale(zs, zs);
        this.ts.setTilePosition((-world.x * PARALLAX) / zs, (-world.y * PARALLAX) / zs);
    }

    destroy() {
        const bd = this.scene?.backdrop; if (this.covered && bd?.scene) bd.setVisible(true);
        this.ts.destroy(); this.border?.destroy();
    }
}
