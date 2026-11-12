import Phaser from 'phaser';
import { COLOR } from './theme.js';
import { makeText } from './ui/common.js';
import { unitType } from './data/rules.js';
import { unitTex, ensureUnitTex, mountedTex, SHEET_ROW, SINGLE_FLIP, npcCodeOf, npcSheetCode, loaded } from './assets.js';
import { DIR_VEC } from './systems/facing.js';
import { tween } from './ui/motion.js';
import { auraKind, AURA_COLOR } from './systems/glossary.js';
import { soldierCount, MAX_SOLDIERS, TROOP_DANGER } from './systems/soldiers.js';
import { showsShip, shipTypeOf, shipTexKey, shipFrame } from './systems/water.js';

// 사람 없는 배 NPC 시트(배 자체가 그림): 코드 /^npc_boat_/ 또는 manifest 시트 항목 object:'boat'. 배 오버레이(ship_back/front)를 얹지 않는다
export function isBoatSheetUnit(unit) {
    try {
        const raw = npcCodeOf(unit) ?? unit?.npc_ref ?? unit?.hero ?? null;
        if (!raw) return false;
        const code = npcSheetCode(raw) ?? raw;
        if (/^npc_boat_/.test(String(code)) || /^npc_boat_/.test(String(raw))) return true;
        const m = loaded.manifest ?? {};
        return ['ally', 'enemy'].some((sd) => m[`unit.npc.${code}.${sd}.64.sheet`]?.object === 'boat');
    } catch { return false; }
}
// 기병 표시 배율(1.15 = 타일 64 기준 약 +10px). 기병 계열 판정 = 병종 규칙 이동 유형 mounted 또는 코드에 cavalry/horse
const MOUNTED_K = 1.15;
const mountedLook = (u) => { try { return unitType(u?.type).move_type === 'mounted' || /cavalry|horse|mounted/.test(String(u?.type ?? '')); } catch { return false; } };

export const TILE = 52;
// 병력 배지/세그먼트(타일 로컬 단위, 타일 = -26..26). 배지 15x12 는 오른쪽 아래 모서리, 세그먼트 10칸은 그 왼쪽(-25..8.4)
const BADGE_W = 15;
const BADGE_H = 12;
const SEG = { x0: -25, y: TILE / 2 - 8, w: 2.8, gap: 0.6, h: 5 };
const SEG_MIN_PX = 36; // 타일 CSS 크기가 이보다 작으면 숫자만
const BADGE_MIN_FONT = 10; // 숫자 최소 CSS 글자 크기(역스케일 목표)
const HERO_GOLD = 0xf0d58c;
const DANGER_COL = 0xff5a4a;
const WALK_SEQ = [0, 1, 2, 1]; // walk1 - idle - walk2 - idle
// 걷기 프레임 간격(ms): 이동 연출 FX.move.msPerTile(90) 에 맞춰 약 1타일당 1프레임(10fps, 이전 125ms/8fps 설계를 이동 속도에 맞게 소폭 단축)
const WALK_MS = 100;

// 유닛 뷰: 32x32 도트 정면 스프라이트(unit_<type>_<team>, assets.js)가 있으면 사용, 없으면 코드 생성 도형(아군=원, 적군=마름모) 폴백.
// 서버 유닛 필드: id, side, kind(commander|hero|troop), type, name, hp, max_hp, x, y, acted (store 가 team/maxHp/commander 를 덧붙인다)
// 모션(idle 호흡/걷기)은 fx/UnitAnimator 의 공용 업데이트 루프가 body 의 y/scaleY 를 '원본 텍셀 단위'로 양자화해 적용한다(소수 픽셀 번짐 방지).
export class UnitView {
    constructor(scene, parent, unit) {
        this.scene = scene;
        this.id = unit.id;
        this.team = unit.team;
        this.hp = unit.hp;
        this.maxHp = unit.max_hp ?? unit.maxHp;
        this.c = scene.add.container(0, 0);
        this.unit = unit;
        this.facing = null; // 서버 방향(facing) 값. 시스템이 꺼져 있으면 항상 null(마커/FacingPicker 는 이 값이 있을 때만)
        this.look = null; // 표시용 시선(visual facing): 서버 facing 이 있으면 그 값, 없으면 클라이언트 계산(초기 적 방향/이동/공격/피격)
        this.teamColor = unit.team === 'ally' ? COLOR.ally : COLOR.danger;
        // 모션 상태(공용 루프가 사용)
        this.phase = Math.random() * 10;
        this.period = 1.4 + Math.random() * 0.6; // idle 주기 1.4~2.0s, 위상 어긋남
        this.walkDir = null;
        this.walkT0 = 0;
        this.selected = false;
        this.posed = false;
        const tex = unitTex(scene, unit); // 영웅 전용 -> 병종 공용 -> null(도형) 폴백. 스프라이트시트면 정면 idle 프레임
        this.sprite = !!tex;
        // 발밑 그림자 타원(스프라이트 아래)
        this.shadow = scene.add.ellipse(0, TILE / 2 - 9, 28, 9, 0x000000, 0.35);
        this.c.add(this.shadow);
        if (scene.mapArtRing) this.setFootRing(true); // 통그림 맵 보조 표시(settings.mapArt.unitRing): 발밑 진영색 링. 기본 꺼짐
        // 오라 보유 영웅: 발밑 은은한 빛 링(스프라이트·HP 바 뒤, 그림자 바로 위). 색 = 오라 종류색(공격 주황/방어 청록/복합 금색, 아군·적 공통)
        //  적은 링 바깥에 붉은 점선 호를 약하게 덧그려 구분(drawAuras 의 '적=점선' 규약과 동일). 수치는 정보 카드·툴팁(auraLines)에서 확인
        //  펄스는 트윈 없이 공용 루프(fx/UnitAnimator → tickAura)가 알파만 갱신. 범위는 선택/hover 시 drawAuras 가 표시
        if (unit.aura && unit.kind !== 'troop') {
            const col = AURA_COLOR[auraKind(unit.aura)];
            const g = scene.add.graphics();
            const cy = TILE / 2 - 12; // 발밑(HP 바 위쪽 가장자리와 살짝 겹침: 아래 반은 HP 바가 덮는다)
            const rx = 22; const ry = 7;
            // 부드러운 글로우: 바깥→안쪽으로 겹친 반투명 타원(가장자리 감쇠)
            [[1.35, 0.10], [1.18, 0.14], [1.0, 0.16]].forEach(([k, a]) => g.fillStyle(col, a).fillEllipse(0, cy, rx * 2 * k, ry * 2 * k));
            g.lineStyle(1.5, col, 0.95).strokeEllipse(0, cy, rx * 2, ry * 2); // 얇은 링
            if (unit.team !== 'ally') {
                // 적: 링 바깥 점선(짧은 호 12개)
                g.lineStyle(1, AURA_COLOR.enemy, 0.8);
                const ox = rx + 4; const oy = ry + 3;
                for (let i = 0; i < 12; i++) {
                    const a0 = (i / 12) * Math.PI * 2; const a1 = a0 + Math.PI / 14;
                    g.lineBetween(Math.cos(a0) * ox, cy + Math.sin(a0) * oy, Math.cos(a1) * ox, cy + Math.sin(a1) * oy);
                }
            }
            this.aura = g.setAlpha(0.4);
            this.c.add(g);
        }
        // 팀 발밑 마커 폴백: 안아트가 unit.team_marker.<ally|enemy> 키를 제공하면 발밑에 렌더(없으면 생략, 기존 HP 바/삼각형 표시 유지)
        const mk = ['unit_team_marker_' + unit.team, 'unit_team_marker'].find((k) => scene.textures.exists(k));
        if (mk) { this.marker = scene.add.image(0, TILE / 2 - 10, mk).setDisplaySize(TILE * 0.8, TILE * 0.4); this.c.add(this.marker); }
        // 기병(이동 유형 mounted) 표시 보정(사용자 2026-11-04 '기병이 작아 보임'): 64 칸 시트 안에 말+기수를 넣어 불투명 높이는 보병과 같지만(61 vs 64px) 기수가 작게 보인다.
        //  표시 크기를 타일의 1.15배로 키우고 아래 끝(발·말굽)은 타일 바닥에 맞춘다(yOff). 다른 병종은 1
        //  병종이 기병이 아니어도 표시 시트가 manifest mounted:true(기마 시트)면 같은 배율(2026-11-06 신규 가챠 shah_jahan·rana_pratap)
        this.sizeK = this.sprite && (mountedLook(unit) || mountedTex(tex.key)) ? MOUNTED_K : 1;
        this.yOff = -(TILE * (this.sizeK - 1)) / 2;
        if (this.sprite) {
            // 타일 안에 꽉 차게(원본 32/64 어느 쪽이든 타일 크기로 표시: 배율은 fitMap 의 정수 k 로 정수 유지)
            this.body = scene.add.image(0, this.yOff, tex.key, tex.frame).setDisplaySize(TILE * this.sizeK, TILE * this.sizeK);
            this.isSheet = !!tex.sheet;
            this.c.add(this.body);
            this.rebase();
        } else {
            this.body = unit.team === 'ally'
                ? scene.add.circle(0, 0, 19, this.teamColor)
                : scene.add.rectangle(0, 0, 28, 28, this.teamColor).setAngle(45);
            this.body.setStrokeStyle(3, COLOR.text);
            const glyph = makeText(scene, 0, 0, unitType(unit.type).glyph, { size: 18, bold: true, color: '#ffffff', origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 4 } });
            glyph.setFontSize(18); glyph.setResolution(4);
            this.c.add([this.body, glyph]);
        }
        // 선택 윤곽 펄스용 링(선택된 유닛만 표시)
        this.ring = scene.add.rectangle(0, 0, TILE - 4, TILE - 4).setStrokeStyle(2, COLOR.accentLight, 0.9).setVisible(false);
        this.c.add(this.ring);
        // 방향 마커(타일 가장자리 쐐기)는 제거됨(사용자 요청): 방향은 스프라이트 시선(방향 시트 행 / 단일 이미지 flipX)으로만 표현
        // 병력 표시(병력 = 체력, HP 바 대체): 발밑 10칸 세그먼트(채워진 칸 = 병력) + 오른쪽 아래 숫자 배지.
        //  영웅(kind != troop)은 금색 칸·금테 배지, 부대는 진영색 칸·진영색 배지. 위험(<=3)은 붉은 톤 + 경고 삼각형(색약 대비 모양 병행).
        //  줌 축소(타일 CSS 36px 미만)면 세그먼트를 숨기고 숫자 배지만 역스케일로 키운다(setDetail).
        this.isTroop = unit.kind === 'troop';
        this.troopN = -1;
        this.segG = scene.add.graphics();
        this.badge = scene.add.container(TILE / 2, TILE / 2 - 1); // 배지 기준점 = 타일 오른쪽 아래 모서리(역스케일 시 안쪽 위로 커진다)
        this.badgeG = scene.add.graphics();
        this.countText = makeText(scene, -BADGE_W / 2, -BADGE_H / 2, '', { size: 11, bold: true, color: '#ffffff', origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } });
        this.badge.add([this.badgeG, this.countText]);
        this.c.add([this.segG, this.badge]);
        // 역할 마크 제거(사용자 2026-11-04 "대장·지원 마크 전부 빼"): 표시만 제거, 데이터·로직(npc_ally·commander·support·boss)은 그대로 — 지휘관 머리 위 금색 별·아군 NPC '지원' 배지 삭제
        if (unit.team === 'enemy' && this.sprite) this.c.add(scene.add.triangle(TILE / 2 - 7, -TILE / 2 + 7, 0, 0, 8, 0, 4, 8, COLOR.danger).setStrokeStyle(1, COLOR.ink));
        // 아군 영웅 이름표(하플레이 2026-11-09: 맵에서 영웅과 병사 구분이 어려움): 아군 영웅(부대·수레·배 제외)만 머리 위 작은 금색 이름. 역할 마크(대장·지원)가 아니라 이름만.
        //  유닛당 텍스트 1개(아군 영웅 수만큼), 줌 축소(세그먼트 숨김 단계)에서는 가림 방지로 숨김(setDetail)
        if (unit.team === 'ally' && unit.kind !== 'troop' && !unit.non_hero) {
            const nm = String(unit.short_name || unit.hero_name || unit.name_ko || unit.name || '').trim();
            if (nm) {
                const topY = this.sprite ? this.yOff - (TILE * this.sizeK) / 2 + 4 : -TILE / 2 + 2;
                this.nameTag = makeText(scene, 0, topY, nm.length > 5 ? `${nm.slice(0, 5)}…` : nm, { size: 10, bold: true, color: '#f0d58c', origin: [0.5, 1], stroke: { color: '#0B1020', width: 3 } });
                this.c.add(this.nameTag);
            }
        }
        parent.add(this.c);
        this.setDetail(scene.tileCssPx ?? 48);
        this.setHp(unit.hp, false);
        this.place(unit.x, unit.y);
        this.setActed(unit.acted);
        if (unit.facing) this.setFacing(unit.facing);
        this.ship = null; // 수상 배 오버레이(setWater 가 필요할 때 만든다)
        this.water = null;
        // NPC 전용 시트·수병 시트(scope npc/naval)는 이 유닛이 나올 때만 지연 로드 -> 받으면 같은 body 의 텍스처만 교체(배 back/front 레이어 순서 유지).
        // 로드 전·실패 시 현재 폴백(문화권 창병 등) 유지. 도형 폴백(sprite=false)은 body 가 이미지가 아니라 교체 대상 아님
        if (this.sprite) ensureUnitTex(scene, unit, (ok) => { if (ok && this.c?.active && this.body?.active) this.refreshFrame(this.look ?? 'down'); });
    }

    // ---- 수상(배 오버레이, 안아트 ship_overlay): wake(맨 아래, 그림자 대신) -> ship_back -> body -> ship_front -> 팀마커·HP 바·배지 ----
    // ws = { onWater, boarded, naval } (systems/water.waterStateOf). 배 표시 = 탑승 또는 수병, 물결(wake) = 배 + 수상 칸, 그림자 타원 = 수상 칸에서 숨김.
    // 반환: 수면 진입/이탈 여부(true = splash 대상). 시트가 없으면 배 없이 그림자만 처리
    setWater(ws, unit = this.unit) {
        const prev = this.water;
        this.water = ws ? { onWater: !!ws.onWater, boarded: !!ws.boarded, naval: !!ws.naval } : null;
        if (this.boatSelf === undefined) this.boatSelf = isBoatSheetUnit(unit); // 사람 없는 배 시트(npc_boat_* / manifest object:'boat')는 시트 자체가 배 -> 배 오버레이 생략(이중 그림 방지, 2026-11-08 배치 D)
        const on = showsShip(this.water) && this.sprite && !this.boatSelf;
        if (on && !this.ship) this.makeShip(unit);
        if (this.ship) {
            this.ship.back.setVisible(!!on);
            this.ship.front.setVisible(!!on);
            this.ship.wake?.setVisible(!!on && !!this.water?.onWater);
            if (on) this.tickShip(this.shipF ?? 0, true);
            else this.setBob(0); // 하선(육상 칸): 물결 흔들림 해제
        }
        this.shadow.setVisible(!this.water?.onWater);
        return !!prev && prev.onWater !== !!this.water?.onWater;
    }

    makeShip(unit) {
        const sc = this.scene;
        let type = shipTypeOf(unit);
        if (!sc.textures.exists(shipTexKey(type, 'back'))) type = 'default';
        const bk = shipTexKey(type, 'back'); const fk = shipTexKey(type, 'front');
        if (!sc.textures.exists(bk) || !sc.textures.exists(fk)) return; // 배 시트 미로드: 배 없이 표시(그림자만 숨김)
        const back = sc.add.image(0, 0, bk, 0).setDisplaySize(TILE, TILE);
        const front = sc.add.image(0, 0, fk, 0).setDisplaySize(TILE, TILE);
        const wake = sc.textures.exists('ship_overlay_wake') ? sc.add.image(0, 0, 'ship_overlay_wake', 0).setDisplaySize(TILE, TILE) : null;
        const bi = this.c.getIndex(this.body);
        this.c.addAt(back, bi); // body 바로 뒤
        this.c.addAt(front, this.c.getIndex(this.body) + 1); // body 바로 앞(ring·병력 세그먼트·배지·지휘관 별은 그 뒤에 추가돼 있어 front 위)
        if (wake) this.c.addAt(wake, 0); // 맨 아래(그림자 자리)
        if (this.marker) { this.c.remove(this.marker); this.c.addAt(this.marker, this.c.getIndex(front) + 1); } // 팀 발밑 마커도 front 위
        this.ship = { type, back, front, wake };
        if (this.acted) this.setActed(true);
    }

    // 물결 흔들림(bob): 배(back/front)와 몸통(body)을 같은 정수 오프셋(32 기준 텍셀 0/1)만큼 함께 올렸다 내린다. wake(수면 물결)는 고정.
    // Battle.tickWater 가 매 프레임 호출(유닛별 위상 차). 값이 바뀔 때만 위치를 갱신해 비용은 사실상 0. 연출 끄기(isInstant)는 호출 측에서 0
    tickBob(time, still = false) {
        if (!this.ship || !this.ship.back.visible) { if (this.bobY) this.setBob(0); return; }
        if (still) { this.setBob(0); return; }
        if (this.bobPh == null) { // id 해시 + 비트 섞기(fmix32): 'b0'/'b1' 처럼 한 글자 차이여도 위상이 고르게 흩어져 배마다 박자가 다르다
            let h = String(this.id ?? '').split('').reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 0x01000193), 0x811c9dc5);
            h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
            this.bobPh = ((h >>> 0) / 4294967296) * Math.PI * 2;
        }
        const step = Math.round(Math.sin(time / 520 + this.bobPh) * 0.9 + 0.1); // 0 또는 1(위로만 뜬다: 흘수선 아래로 가라앉지 않게)
        this.setBob(Math.max(0, step) * -(TILE / 32));
    }

    setBob(y) {
        if (y === (this.bobY ?? 0)) return;
        this.bobY = y;
        if (this.ship) { this.ship.back.y = y; this.ship.front.y = y; }
        if (this.body) this.body.y = (this.poseY ?? 0) + y + (this.yOff ?? 0); // yOff: 기병 표시 보정(바닥 맞춤)
    }

    // 몸통 자세 y(idle 호흡·호핑) + 물결 오프셋. body.y 는 여기서만 쓴다
    setPoseY(py) {
        this.poseY = py;
        if (this.body) this.body.y = py + (this.bobY ?? 0) + (this.yOff ?? 0);
    }

    // 배 프레임(4fps 전역 시계 f, 행 = 시선/걷기 방향). Battle.update 가 프레임이 바뀔 때만 호출
    tickShip(f, force = false) {
        if (!this.ship || !this.ship.back.visible) { this.shipF = f; return; }
        if (!force && f === this.shipF && this.shipDir === (this.walkDir ?? this.look)) return;
        this.shipF = f;
        this.shipDir = this.walkDir ?? this.look ?? 'down';
        const fr = shipFrame(this.shipDir, f);
        this.ship.back.setFrame(fr); this.ship.front.setFrame(fr);
        this.ship.wake?.setFrame(fr);
    }

    // 현재 프레임 기준 원본 텍셀 크기(로컬 단위). 모션은 이 단위로 양자화한다.
    rebase() {
        if (!this.sprite) return;
        const f = this.body.frame;
        this.texW = f.realWidth || 32;
        this.texH = f.realHeight || 32;
        this.texel = (TILE * (this.sizeK ?? 1)) / this.texW; // 텍셀 1개의 로컬(타일 좌표계) 크기(기병 표시 보정 배율 포함)
        this.base = { sx: this.body.scaleX, sy: this.body.scaleY };
    }

    // 방향 설정(up|down|left|right|null). 서버 facing 값(규칙 on)이 오면 시선(look)을 그 값으로 맞추고 스프라이트를 갱신한다(서버 값 우선).
    // null 이면 시선은 바꾸지 않는다(off 전투는 표시용 시선 setLook 만 사용). 마커(타일 가장자리 쐐기) 그리기는 제거됨.
    // 같은 값이 다시 와도 시선이 어긋나 있으면(이동 걷기·이동 취소 후 등) 다시 맞춘다(이전: dir === facing 이면 바로 return 해 복원이 안 됐다).
    setFacing(dir) {
        const d = dir && DIR_VEC[dir] ? dir : null;
        if (d === this.facing && (!d || d === this.look)) return;
        this.facing = d;
        if (!d) return;
        this.look = d;
        this.refreshFrame();
    }

    // 표시용 시선 설정(서버 facing 이 있으면 무시: 서버 값 우선). 시트가 있으면 그 행, 없으면 단일 이미지 + left 만 flipX.
    setLook(dir) {
        if (!dir || this.facing || dir === this.look) return;
        this.look = dir;
        this.refreshFrame();
    }

    // 방향 시트가 있으면 해당 행/프레임(right 행은 미러 구움: flipX 불필요), 단일 정면 이미지면 좌우 반전 규약(assets.SINGLE_FLIP)으로 갱신.
    refreshFrame(dir = this.look) {
        if (!this.sprite || !this.body.setTexture) return;
        const t = unitTex(this.scene, this.unit, dir);
        if (!t) return;
        const k = mountedLook(this.unit) || mountedTex(t.key) ? MOUNTED_K : 1; // 지연 로드로 공용 시트 -> 기마 전용 시트로 바뀌면 배율·바닥 맞춤 갱신
        if (k !== this.sizeK) { this.sizeK = k; this.yOff = -(TILE * (k - 1)) / 2; this.body.y = (this.poseY ?? 0) + (this.bobY ?? 0) + this.yOff; }
        this.body.setTexture(t.key, t.frame).setDisplaySize(TILE * (this.sizeK ?? 1), TILE * (this.sizeK ?? 1));
        // 단일 이미지의 위/아래: 좌우 반전 규약상 정보가 없으므로 직전 좌우(flipX)를 유지(가장 가까운 좌우 시선). 시트는 해당 행 사용
        if (t.sheet || dir === 'left' || dir === 'right' || !dir) this.body.setFlipX(t.flipX);
        this.isSheet = !!t.sheet;
        this.rebase();
        this.posed = false;
    }

    // ---- 모션(공용 루프 fx/UnitAnimator 가 호출) ----
    // idle: e(0~1 이징값) -> 상승 bob + 세로 늘임 sq(발 기준) 텍셀. 시트 해상도 비례(k = texH/32)라 32/64 시트가 같은 물리 크기로 움직인다.
    //  64 시트: 상승 0~2 + 늘임 0~3 텍셀 -> 머리 끝 최대 5텍셀(타일 52 기준 약 4.1 로컬 = 타일 CSS 48px 에서 약 3.8 CSS px), 발 이동 최대 2텍셀(약 1.5 CSS px).
    //  32 시트: 상승 0~1 + 늘임 0~2 텍셀(머리 끝 3텍셀 ≈ 4.9 로컬). 이전(64 시트 머리 끝 4텍셀 ≈ 3 CSS px)보다 소폭 크게, 발 들림은 유지해 호흡처럼 보이게.
    //  모두 정수 텍셀이라 픽셀이 번지지 않는다.
    applyIdle(e) {
        if (!this.sprite || !this.base) return;
        const k = this.texH / 32;
        const bob = Math.round(e * k);
        const sq = Math.round(e * 1.5 * k);
        this.setPoseY(-(bob + sq / 2) * this.texel);
        this.body.scaleY = this.base.sy * (this.texH + sq) / this.texH;
        this.posed = true;
    }

    resetPose() {
        if (!this.sprite || !this.base) return;
        this.setPoseY(0);
        this.body.setScale(this.base.sx, this.base.sy);
        this.posed = false;
    }

    // 걷기: 방향 시트면 이동 방향 행의 walk1-idle-walk2-idle 순환(animator), 시트가 없으면 호핑 + 이동 방향 좌우 반전(SINGLE_FLIP)
    // 타일마다 호출된다(FxManager.moveAlong). 이미 걷는 중이면 walkT0 를 유지해 프레임 순환이 이어지고, 방향만 바뀌면 행만 바뀐다.
    // (이전: 매 타일 walkT0 를 초기화해 타일당 90ms < 프레임 간격 125ms 라 항상 walk1 만 보였다)
    walkStart(dir) {
        if (!this.walkDir) {
            this.walkT0 = this.scene.time.now;
            if (this.posed) this.resetPose(); // idle 호흡 자세(y/scaleY) 해제 후 걷기
        }
        this.walkDir = dir;
        // 걷는 방향이 마지막 시선(규칙 on 이어도: 서버도 이동 후 facing 을 이동 방향으로 바꾼다 Engine::doMove). 서버 값이 오면 setFacing 이 다시 맞춘다.
        // 이전: facing 이 있으면(규칙 on, 현재 항상 on) look 을 갱신하지 않아 walkStop 의 refreshFrame 이 이동 전 방향으로 되돌렸다.
        this.look = dir;
        if (this.sprite && !this.isSheet && (dir === 'left' || dir === 'right')) this.body.setFlipX(!!SINGLE_FLIP[dir]);
    }

    walkStop() {
        if (!this.walkDir) return;
        this.walkDir = null;
        this.resetPose();
        this.refreshFrame(); // 방향 시스템 off 면 정면 idle 로 복귀(flip 도 원복)
    }

    walkTick(now) {
        if (!this.sprite || !this.base) return;
        const t = Math.max(0, now - this.walkT0);
        if (this.isSheet) {
            this.body.setFrame(`sheet_${(SHEET_ROW[this.walkDir] ?? 0) * 3 + WALK_SEQ[Math.floor(t / WALK_MS) % 4]}`); // 이름 프레임(원본 3x4 기준)
        } else {
            const hop = Math.round(Math.abs(Math.sin((Math.PI * t) / WALK_MS)) * 2); // 0~2 텍셀 호핑
            this.setPoseY(-hop * this.texel);
        }
    }

    // 오라 적용 배지(머리 위 "+N" 칩)는 제거됨(사용자 요청: 발밑 빛 링으로 대체). 호출부(Battle.refreshAuraBadges: 첫 오라 안내 포함)
    // 호환을 위해 no-op 으로 남긴다. 수치는 정보 카드·툴팁(Battle.auraLines), 범위·수혜자는 hover/선택 시 drawAuras 에서 확인.
    setAuraBadge() {}

    // 발밑 오라 링 펄스(공용 루프에서 매 프레임 호출, 트윈 없음). pulse=false 면 정적 알파(연출 축약/끄기·품질 낮음·컷신 중 정지)
    tickAura(t, pulse) {
        if (!this.aura) return;
        const a = pulse ? 0.375 + 0.125 * Math.sin((t / 2.6) * Math.PI * 2 + this.phase) : 0.4; // 0.25~0.5, 주기 2.6s(유닛별 위상 어긋남)
        if (Math.abs(this.aura.alpha - a) > 0.004) this.aura.setAlpha(a);
    }

    setSelected(b) {
        this.selected = b;
        this.ring.setVisible(b);
        if (!b) this.ring.setAlpha(1);
    }

    // 발밑 진영색 링(통그림 맵에서 유닛이 배경에 묻히지 않게, MapArt 보조 표시). 그림자 바로 위
    setFootRing(on) {
        if (!on) { this.footRing?.destroy(); this.footRing = null; return; }
        if (this.footRing) return;
        this.footRing = this.scene.add.ellipse(0, TILE / 2 - 9, 38, 13).setStrokeStyle(2.5, this.teamColor, 0.95);
        this.c.addAt(this.footRing, this.c.getIndex(this.shadow) + 1);
    }

    tilePos(x, y) { return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 }; }

    place(x, y) {
        const p = this.tilePos(x, y);
        this.c.setPosition(p.x, p.y);
        this.c.setAlpha(this.acted ? 0.8 : 1).setScale(1);
    }

    // HP(서버 값) -> 병력 N/10 표시 갱신. 병력이 줄면 사라진 칸 흰 섬광 페이드 + 숫자 펀치(0.3초, 연출 끄기/스킵이면 즉시)
    setHp(hp, animate = true) {
        this.hp = hp;
        const n = soldierCount({ max_hp: this.maxHp, hp, soldiers: this.unit?.soldiers }, hp);
        const prev = this.troopN;
        if (n === prev) return;
        this.troopN = n;
        this.drawTroops(n);
        if (!animate || prev < 0 || n >= prev) return;
        if (this.segOn) {
            const g = this.scene.add.graphics();
            g.fillStyle(0xffffff, 1);
            for (let i = n; i < prev; i++) g.fillRect(SEG.x0 + i * (SEG.w + SEG.gap), SEG.y - SEG.h / 2, SEG.w, SEG.h);
            this.c.add(g);
            tween(this.scene, { targets: g, to: { alpha: 0 }, duration: 300, onComplete: () => g.destroy() });
        }
        this.countText.setScale(1.45);
        tween(this.scene, { targets: this.countText, to: { scaleX: 1, scaleY: 1 }, duration: 300, ease: 'Back.easeOut' });
    }

    drawTroops(n) {
        const hero = !this.isTroop;
        const danger = n > 0 && n <= TROOP_DANGER;
        const fillCol = danger ? DANGER_COL : (hero ? HERO_GOLD : this.teamColor);
        // 세그먼트 10칸(어두운 바탕 띠 + 채워진 칸)
        const g = this.segG.clear();
        const total = MAX_SOLDIERS * SEG.w + (MAX_SOLDIERS - 1) * SEG.gap;
        g.fillStyle(COLOR.ink, 0.85).fillRect(SEG.x0 - 1, SEG.y - SEG.h / 2 - 1, total + 2, SEG.h + 2);
        g.lineStyle(1, hero ? HERO_GOLD : this.teamColor, 0.9).strokeRect(SEG.x0 - 1, SEG.y - SEG.h / 2 - 1, total + 2, SEG.h + 2);
        for (let i = 0; i < MAX_SOLDIERS; i++) {
            const x = SEG.x0 + i * (SEG.w + SEG.gap);
            if (i < n) g.fillStyle(fillCol, 1).fillRect(x, SEG.y - SEG.h / 2, SEG.w, SEG.h);
            else g.fillStyle(0x3a4256, 0.9).fillRect(x, SEG.y - SEG.h / 2 + SEG.h - 1.5, SEG.w, 1.5); // 빈 칸: 바닥 눈금만
        }
        // 숫자 배지: 부대 = 진영색 바탕, 영웅 = 어두운 바탕 + 금테 이중선. 위험이면 어두운 바탕 + 붉은 숫자 + 경고 삼각형
        const b = this.badgeG.clear();
        const bx = -BADGE_W; const by = -BADGE_H;
        b.fillStyle(danger || hero ? COLOR.ink : this.teamColor, 0.95).fillRect(bx, by, BADGE_W, BADGE_H);
        if (hero) {
            b.lineStyle(1.5, HERO_GOLD, 1).strokeRect(bx, by, BADGE_W, BADGE_H);
            b.lineStyle(0.75, HERO_GOLD, 0.7).strokeRect(bx + 2, by + 2, BADGE_W - 4, BADGE_H - 4);
        } else b.lineStyle(1, danger ? DANGER_COL : COLOR.ink, 1).strokeRect(bx, by, BADGE_W, BADGE_H);
        if (danger) { // 경고 삼각형(배지 왼쪽 위 바깥, 모양으로도 위험 구분)
            b.fillStyle(DANGER_COL, 1).fillTriangle(bx - 1, by - 1, bx - 8, by - 1, bx - 4.5, by - 7);
            b.lineStyle(0.75, COLOR.ink, 1).strokeTriangle(bx - 1, by - 1, bx - 8, by - 1, bx - 4.5, by - 7);
            b.fillStyle(COLOR.ink, 1).fillRect(bx - 5, by - 5.5, 1, 2.5).fillRect(bx - 5, by - 2.5, 1, 1);
        }
        this.countText.setText(String(n)).setColor(danger ? '#ff8a7a' : hero ? '#f0d58c' : '#ffffff');
    }

    // 줌 단계별 표시: 타일 CSS 크기(px)가 SEG_MIN_PX 이상이면 세그먼트+숫자, 미만이면 숫자 배지만(최소 글자 크기까지 역스케일, 최대 2.4배)
    setDetail(tilePx) {
        const px = Math.max(1, tilePx || 48);
        this.segOn = px >= SEG_MIN_PX;
        this.segG.setVisible(this.segOn);
        this.nameTag?.setVisible(this.segOn);
        const cssFont = (11 * px) / TILE;
        this.badge.setScale(Math.min(2.4, Math.max(1, BADGE_MIN_FONT / cssFont)));
    }

    setActed(b) {
        this.acted = b;
        if (this.sprite) { if (b) this.body.setTint(0x7a8090); else this.body.clearTint(); }
        else this.body.setFillStyle(b ? COLOR.gray : this.teamColor);
        if (this.ship) [this.ship.back, this.ship.front].forEach((o) => { if (b) o.setTint(0x7a8090); else o.clearTint(); }); // 행동 완료 흐림: 배도 같은 톤(본체 분기와 독립)
        this.c.setAlpha(b ? 0.8 : 1);
    }

    // 피격/격파용 흰 틴트(전체 화면 플래시가 아닌 스프라이트 단위)
    tintWhite(on) {
        // Phaser 4: setTintFill 제거 -> setTint + setTintMode(FILL). 해제는 clearTint(모드 MULTIPLY 복원) 후 행동 완료 틴트 재적용
        if (this.sprite) { if (on) this.body.setTint(0xffffff).setTintMode(Phaser.TintModes?.FILL ?? 1); else { this.body.clearTint(); this.setActed(this.acted); } }
        else this.body.setFillStyle(on ? 0xffffff : (this.acted ? COLOR.gray : this.teamColor));
    }

    destroy() { this.c.destroy(); }
}
