import Phaser from 'phaser';
import { COLOR, CSS } from '../theme.js';
import { makeText, fitText, keepW } from './common.js';
import { tween } from './motion.js';
import { rarityColor } from '../rarity.js';
import { auraLabel } from '../systems/glossary.js';
import { soldierCount, troopLabel, MAX_SOLDIERS, TROOP_DANGER } from '../systems/soldiers.js';
import { heroPlainName, unitClassName } from '../systems/names.js';
import { troopIcon, statIcon } from './GameIcons.js';
import { ensurePortraitTex, unitPortraitLogical, portraitLogical, texKey } from '../assets.js';

// 선택(또는 정보 보기) 유닛의 초상화 카드(전투 HUD).
// 구조(2026-11-02): 큰 초상(패널 위, 액자 없이 투명 PNG 전체를 비율 유지로 표시) + 하단 정보 패널(불투명, 이름·상태·병력 바·능력치 게이지). 둘 다 입력을 소비(contains).
//   초상 높이 상한 = 생성 옵션 portMax(데스크톱·모바일 별도, Battle.battleLayout). 패널 위 공간이 topLimit 보다 좁으면 초상을 패널 아래에 둔다.
//   능력치(2026-11-06): 병력·마력·공격·수비·이동·범위 세로 목록(buildStatRows). 공·수 = 막대(기본/보정 색 구분, 상한 STAT_CAP) + '기본 +보정' / 이동·범위 = 칸 눈금(상한 SEG_CAP) + 숫자.
// - 영웅(kind != troop): 본인 초상화. 부대(troop): 소속 영웅(leader) 초상화 + 작은 병종 배지. 적은 붉은 테두리.
// - 초상화는 지연 로드: assets.ensurePortraitTex(전역 큐: 중복 합치기·동시 6·?v=·LRU)에 위임. 부팅에서는 받지 않는다.
//   파일이 없으면(SPA 폴백으로 디코딩 실패) 이니셜 폴백, 경고는 키당 1회.
// - 초상화가 없으면(NPC 등) 진영색 이니셜 칸으로 폴백.
// - 카드 배경은 입력을 소비해 필드 클릭과 겹치지 않는다. 전환은 짧은 크로스페이드(연출 끄기면 즉시).
// 호환 API: 반환 = 텍스처 키(이미 있음) | null(로드 시작, onReady(키|null) 은 완료/실패 시 1회 — 호출 측이 객체 생존 확인)
export function ensurePortrait(scene, code, onReady, { thumb = false } = {}) { // thumb:true -> portrait.<code>.thumb(manifest 에 있을 때)
    if (!code) return null;
    return ensurePortraitTex(scene, portraitLogical(code, { thumb }), onReady ?? null);
}

// 게이지 상한: 임밸런 근거(Lv30 최대 공격 86·방어 40 + 장비) -> 공 90 / 수 45. 넘으면 막대는 가득(숫자는 그대로). 이동·사거리는 칸 눈금
export const STAT_CAP = { at: 92, df: 54 }; // 재산정(2026-11-14 레벨 곡선 v2·등급 만렙 S24): 개발 DB 영웅 만렙 최대 공 83·방 38(S, 중앙값 74·25) + 장비 상한(공 +10%≈8, 방 +40%≈15). 이전 90/45(Lv30 기준)
export const SEG_CAP = { move: 8, range: 3 }; // 이동 상한 8(2026-11-03): 기병·비행 기본 8. 넘으면 눈금 가득(숫자는 그대로)
export class PortraitCard extends Phaser.GameObjects.Container {
    // portMax: 큰 초상 높이 상한(px), topLimit: 초상이 올라갈 수 있는 최상단 y(상단 바 아래)
    constructor(scene, { x, y, w, h, portMax = 200, topLimit = 0 }) {
        super(scene, x, y);
        this.w = w;
        this.h = h;
        this.portMax = portMax; this.topLimit = topLimit;
        this.key = '';
        this.port = scene.add.container(0, 0); // 큰 초상 액자(불투명). 영역 = this.portRect(카드 로컬)
        this.portRect = null;
        this.add(this.port);
        this.bg = scene.add.rectangle(0, 0, w, h, COLOR.navyDeep, 0.95).setOrigin(0) /* U18: 맵·유닛 비침 방지 */.setStrokeStyle(1, COLOR.accent, 0.75).setInteractive();
        this.body = scene.add.container(0, 0);
        this.add([this.bg, this.body]);
        this.setVisible(false);
        this.bg.disableInteractive();
        scene.add.existing(this);
    }

    contains(px, py) {
        if (!this.visible) return false;
        if (px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h) return true;
        const r = this.portRect; // 초상 상자도 입력을 소비(투명 표시지만 Battle.cardHits 가림 판정과 같은 사각형 유지)
        return !!r && px >= this.x + r.x && px <= this.x + r.x + r.w && py >= this.y + r.y && py <= this.y + r.y + r.h;
    }

    hide() {
        if (!this.visible) return;
        this.key = '';
        this.setVisible(false);
        this.bg.disableInteractive();
    }

    // u: 표시 유닛, leader: 초상화 주인(부대면 소속 영웅), extra: {status}
    show(u, leader, extra = {}) {
        // 초상화(썸네일): 영웅 = 본인 / 부대 = 병종 초상화(문화권 -> default) -> 소속 영웅 -> 이니셜
        const pc = unitPortraitLogical(u, leader);
        const key = `${u.id}|${u.hp}|${u.mp ?? ''}|${u.mp_max ?? ''}|${u.mp_pct ?? ''}|${!!extra.mpMode}|${!!extra.mpInline}|${extra.title ?? ''}|${extra.shortName ?? ''}|${extra.resist ?? ''}|${u.acted}|${extra.status ?? ''}|${extra.name ?? ''}|${(extra.stats ?? []).join(',')}|${JSON.stringify(extra.gauges ?? null)}|${extra.terrain ?? ''}|${Math.round(this.y)}|${Math.round(this.portMax)}|${pc}|${!!pc && this.scene.textures.exists(texKey(pc))}`;
        if (key === this.key && this.visible) return;
        const fresh = !this.visible || this.key.split('|')[0] !== u.id;
        this.key = key;
        this.build(u, leader, pc, extra);
        this.setVisible(true);
        this.bg.setInteractive();
        if (fresh) { this.setAlpha(0); tween(this.scene, { targets: this, to: { alpha: 1 }, duration: 140 }); } // 크로스페이드(끄기면 즉시)
    }

    // 큰 초상(패널 위, 위 공간이 모자라면 아래). 2026-11-02(card2): 액자·테두리·바탕 판 없이 투명 PNG(알파) 그대로 = 캐릭터 윤곽만.
    //   표시 방식은 스테이지 화면(StageMapView 영웅 초상)과 같다: 이미지 전체(크롭·확대 없음), 비율 유지, 바닥 기준(origin 0.5,1).
    //   초상 에셋이 전부 3:4(896x1200, 썸네일 256x343) 동일 프레이밍이라 같은 상자에 맞추면 장수별 크기가 일정하다.
    //   초상 없으면(NPC 등) 진영색 실루엣 칸(drawFallback)
    buildPortrait(u, leader, pc, extra, enemy, frameCol) {
        const sc = this.scene; const P = this.port;
        P.removeAll(true);
        if (!(this.portMax > 0)) { this.portRect = null; return; } // 초상 생략(아래 유닛을 가리는 자리)
        const ph = Math.round(this.portMax); const pw = Math.round(ph * 0.75); // 상자 3:4(초상 비율)
        const above = this.y - ph >= this.topLimit;
        const y0 = above ? -ph : this.h; const x0 = 0;
        this.portRect = { x: x0, y: y0, w: pw, h: ph };
        const tex = ensurePortraitTex(sc, pc, () => { if (this.scene && this.visible && this.key.split('|')[0] === u.id) { this.key = ''; this.show(u, leader, extra); } });
        if (tex) {
            const img = sc.add.image(0, 0, tex).setOrigin(0.5, 1);
            const k = Math.min(pw / img.frame.realWidth, ph / img.frame.realHeight); // 상자 안에 전체가 들어가게(contain, 잘라내지 않음)
            img.setScale(k).setPosition(x0 + pw / 2, y0 + ph); // 바닥 = 상자 아래(패널 위 초상이면 패널 윗변에 붙음)
            P.add(img);
        } else {
            const g = sc.add.graphics();
            P.add(g);
            this.drawFallback(P, g, u, leader, enemy, frameCol, x0, y0, pw, ph);
        }
        // 병종 배지(액자 우하단, 32 박스 + 아이콘 28): 부대는 항상, 영웅·지휘관은 초상화가 있을 때(초상 없음 폴백은 가슴에 병종 아이콘이 이미 있음). 강화면 gacha106: 영웅 선택 시 병종 아이콘 없음
        if (u.kind === 'troop' || tex) {
            const bs = 32; const is = 28; const bx = x0 + pw - bs - 4; const by = y0 + ph - bs - 4;
            const bg = sc.add.graphics(); bg.fillStyle(0x0b1020, 0.95).fillRoundedRect(bx, by, bs, bs, 4).lineStyle(1, frameCol, 1).strokeRoundedRect(bx, by, bs, bs, 4);
            P.add(bg);
            P.add(troopIcon(sc, u.type, bx + bs / 2, by + bs / 2, is, { glyphSize: 16, stroke: 0 })); // 병종 아이콘 단일 소스(GameIcons.troopIcon = 영웅 카드 뱃지와 같은 도트 그림)
        }
        // 액자(이중선·모서리 징)는 그리지 않는다(card2: 투명 표시). 진영은 하단 정보 패널 테두리·색 띠로 구분
    }

    // 초상화 없음(NPC 등) 대체 표시: 인물 실루엣(진영색) + 가슴 위치 병종 도트 아이콘 + 좌하단 이니셜 원형 배지.
    // 에셋 생성 없이 기존 pixel_badges(sym.troop.*)만 사용. NPC 초상 키(portrait.<npc>)가 manifest 에 생기면 unitPortraitLogical 이 자동으로 그쪽을 쓴다.
    drawFallback(P, g, u, leader, enemy, frameCol, x0, y0, pw, ph) {
        const sc = this.scene; // card2: 바탕 판(그라데이션) 없음 — 실루엣·아이콘·이니셜만(초상화와 같은 투명 표시)
        // 실루엣(머리 + 어깨), 아래는 액자 밖으로 잘림 없이 액자 하단에 붙인다
        const cx = x0 + pw / 2; const sil = enemy ? 0x8a3a30 : 0x3c5f8f;
        const hr = pw * 0.17; const hy = y0 + ph * 0.36;
        const s = sc.add.graphics();
        s.fillStyle(sil, 0.9).fillCircle(cx, hy, hr);
        const sw = pw * 0.72; const sy = hy + hr + ph * 0.04;
        s.fillRoundedRect(cx - sw / 2, sy, sw, y0 + ph - sy, { tl: pw * 0.2, tr: pw * 0.2, bl: 0, br: 0 });
        P.add(s);
        // 병종 아이콘(가슴): 부대는 우하단 배지가 따로 있어 생략
        if (u.kind !== 'troop') {
            const iz = Math.max(20, Math.round(pw * 0.3)); const iy = sy + Math.min((y0 + ph - sy) / 2, iz * 0.8);
            P.add(troopIcon(sc, u.type, cx, iy, iz, { glyphSize: Math.round(iz * 0.7), glyphColor: '#f0d58c' }));
        }
        // 이니셜 원형 배지(좌하단)
        const ini = heroPlainName(leader ?? u).slice(0, 1);
        if (ini) {
            const r = Math.max(12, Math.round(pw * 0.13)); const bx = x0 + 6 + r; const by = y0 + ph - 6 - r;
            const b = sc.add.graphics();
            b.fillStyle(0x0b1020, 0.95).fillCircle(bx, by, r).lineStyle(2, frameCol, 1).strokeCircle(bx, by, r);
            P.add(b);
            P.add(makeText(sc, bx, by, ini, { size: Math.round(r * 1.1), bold: true, origin: [0.5, 0.5], color: CSS.text }));
        }
    }

    build(u, leader, pc, extra) {
        const sc = this.scene;
        const b = this.body;
        b.removeAll(true);
        const { w, h } = this;
        const enemy = u.team !== 'ally';
        const frameCol = enemy ? COLOR.danger : COLOR.accent;
        this.buildPortrait(u, leader, pc, extra, enemy, frameCol);
        const g = sc.add.graphics();
        b.add(g);
        // 등급 색 띠(영웅 등급이 있으면 그 색, 없으면 진영색) + 진영 테두리
        g.fillStyle(u.rarity ? rarityColor(u.rarity) : (enemy ? COLOR.danger : COLOR.ally), 1).fillRect(0, 0, 4, h);
        g.lineStyle(1.5, frameCol, 0.9).strokeRect(0, 0, w, h);
        const tx = 12; const tw = w - tx - 10;
        // 한 줄 맞춤: 조각(중요도 순)을 뒤에서부터 빼며 폭에 맞춘다(말줄임 대신)
        const fitParts = (parts, style, x = tx, maxW = tw) => {
            const list = parts.filter(Boolean);
            const o = makeText(sc, x, 0, list.join(' · '), style);
            while (list.length > 1 && o.width > maxW) { list.pop(); o.setText(list.join(' · ')); }
            return fitText(o, maxW);
        };
        let y = 6;
        const nm = fitText(makeText(sc, tx, y, extra.name ?? u.name ?? '', { size: 16, bold: true }), tw, { fallback: extra.shortName });
        b.add(nm); y += nm.height;
        const kind = u.kind === 'troop' ? '부대' : '영웅'; // '지휘관' 역할 표기 제거(사용자 2026-11-04 '대장·지원 마크 전부 빼')
        // 둘째 줄 앞 병종 아이콘(16, GameIcons.troopIcon 단일 소스, 글자 폴백 없음): 초상 배지가 없는 화면(가로 폰 portMax 0 등)에서도 병종이 보이게(강화면 gacha106)
        const sic = troopIcon(sc, u.type, tx + 8, 0, 16, { glyph: false });
        const sx = sic ? tx + 20 : tx;
        const sub = fitParts([enemy ? '적' : '', unitClassName(u.type), kind, extra.status, extra.title], { size: 12, color: enemy ? CSS.dangerText : CSS.accent }, sx, tw - (sx - tx));
        sub.setY(y); b.add(sub);
        if (sic) { sic.setY(y + sub.height / 2); b.add(sic); }
        y += Math.max(sub.height, sic ? 16 : 0) + 3;
        const steps = soldierCount(u);
        const danger = steps > 0 && steps <= TROOP_DANGER;
        const segCol = danger ? 0xff5a4a : (u.kind !== 'troop' ? 0xf0d58c : (enemy ? COLOR.danger : COLOR.ally));
        const G = extra.gauges ?? null;
        if (G) { y = this.buildStatRows(g, u, extra, G, { tx, y, steps, danger, segCol }); this.buildTail(u, extra, fitParts, y); return; }
        // ---- 게이지 없는 카드(가로 폰 L.short, 높이 82): 기존 한 줄 구성 유지 ----
        // 병력 = 체력: 10칸 세그먼트 + 오른쪽 '병력 N/10'(기존 규칙 유지)
        const hpTxt = makeText(sc, w - 10, y + 5, `${troopLabel(steps)}${danger ? ' · 위험!' : ''}`, { size: 12, bold: true, color: danger ? '#ff8a7a' : CSS.text, origin: [1, 0.5] });
        const bw = Math.max(60, tw - hpTxt.width - 8);
        g.fillStyle(0x07101f, 1).fillRect(tx, y + 1, bw, 8);
        g.lineStyle(1, COLOR.text, 0.8).strokeRect(tx, y + 1, bw, 8);
        const cw = (bw - 2 - (MAX_SOLDIERS - 1)) / MAX_SOLDIERS;
        for (let i = 0; i < steps; i++) g.fillStyle(segCol, 1).fillRect(tx + 1 + i * (cw + 1), y + 2, cw, 6);
        b.add(hpTxt);
        // 가로 폰(mpInline, 카드 낮음): 병력 바 바로 아래 얇은 마력 바(높이 3, 줄 간격 안). 수치는 능력치 줄 '마력 N/M'
        let mpLine = 0;
        if (extra.mpMode && extra.mpInline && u.kind !== 'troop') { mpLine = 3; const own = u.mp_max != null && Number(u.mp_max) > 0 && u.mp != null; const pc = own ? (Number(u.mp) / Number(u.mp_max)) * 100 : u.mp_pct != null ? Number(u.mp_pct) : null; if (pc != null) { g.fillStyle(0x1c2a44, 1).fillRect(tx, y + 11, bw, 7).lineStyle(1, 0xbfe2ff, 1).strokeRect(tx, y + 11, bw, 7); g.fillStyle(0x6cc4ff, 1).fillRect(tx + 1, y + 12, Math.max(0, (bw - 2) * Math.min(1, pc / 100)), 5); } } /* 7px(테두리 포함, 밝은 파랑): 3px·5px 는 어두운 카드에서 잘 안 보였음(gacha110·112) */
        y += Math.max(12, hpTxt.height) + 3 + mpLine; // mpLine: 가로 폰 마력 바(7px)가 다음 줄과 붙지 않게
        // 마력(MP 방식 전투, 영웅만): 본인 = 'mp/mp_max' 수치 + 바, 상대 = 5% 단위 비율 바 + 'N%'. 아이콘 ico.stat.mp(16). 가로 폰(낮은 카드)은 능력치 줄 앞 글자로(아래 extra.stats)
        const mpOwn = u.mp_max != null && Number(u.mp_max) > 0 && u.mp != null; const mpPct = mpOwn ? Math.round((Number(u.mp) / Number(u.mp_max)) * 100) : (u.mp_pct != null ? Number(u.mp_pct) : null);
        if (extra.mpMode && u.kind !== 'troop' && mpPct != null && !extra.mpInline) {
            const ic = statIcon(sc, 'mp', tx + 8, y + 5, 16); b.add(ic);
            const mt = makeText(sc, w - 10, y + 5, mpOwn ? `${u.mp}/${u.mp_max}` : `${mpPct}%`, { size: 12, bold: true, color: '#9FD8FF', origin: [1, 0.5] });
            const mx = tx + 20; const mw = Math.max(40, tw - 20 - mt.width - 8);
            g.fillStyle(0x07101f, 1).fillRect(mx, y + 1, mw, 8).lineStyle(1, 0x8fc7ff, 0.8).strokeRect(mx, y + 1, mw, 8);
            g.fillStyle(0x4a9be8, 1).fillRect(mx + 1, y + 2, Math.max(0, (mw - 2) * Math.min(1, mpPct / 100)), 6);
            b.add(mt); y += 14;
        }
        if (extra.stats?.length) { const st = fitParts(extra.stats, { size: 12, color: CSS.text }); st.setY(y); b.add(st); y += st.height + 2; }
        this.buildTail(u, extra, fitParts, y);
    }

    // 지형·속성·오라 한 줄(넘치면 오라부터 생략). 카드 높이 안에 들어갈 때만
    buildTail(u, extra, fitParts, y) {
        const tail = [extra.resist, extra.terrain, u.aura && u.kind !== 'troop' ? `오라 ${auraLabel(u.aura)} ${u.aura.radius}칸` : '']; // resist: 속성 약점·내성(systems/elements.resistText)
        if (tail.some(Boolean) && y + 14 <= this.h - 2) { const t = fitParts(tail, { size: 12, color: '#f0d58c' }); t.setY(y); this.body.add(t); }
    }

    // 능력치 세로 목록(2026-11-06 사용자 '병력·마력·공격·수비·이동·범위, 아이콘과 타이틀, 정리정돈'):
    //   한 줄 = [아이콘 16(ico.stat.<key>)] [라벨(고정 폭 열)] [막대(모든 줄 같은 시작 x·같은 폭)] [값(우측 정렬)]
    //   병력 = 10칸(위험 붉은색) / 마력 = 파란 연속 막대(본인 mp/mp_max, 상대 N%) / 공격·수비 = STAT_CAP 기준 기본(금색)+보정(초록, 음수 붉은 끝) /
    //   이동·범위 = 칸 눈금(SEG_CAP 칸 수, 막대 폭은 같고 채운 칸 수로 구분, 범위 min 미만 칸은 흐리게). 마력 줄은 MP 방식 전투의 영웅만(기존 규칙)
    //   줄 높이 = (카드 남은 높이 - 지형 줄) / 줄 수, 15~18 사이. 반환 = 목록 아래 y
    buildStatRows(g, u, extra, G, { tx, y, steps, danger, segCol }) {
        const sc = this.scene; const b = this.body; const w = this.w;
        const VS = { size: 12, bold: true };
        const mpOwn = u.mp_max != null && Number(u.mp_max) > 0 && u.mp != null;
        const mpPct = mpOwn ? Math.round((Number(u.mp) / Number(u.mp_max)) * 100) : (u.mp_pct != null ? Number(u.mp_pct) : null);
        const bonusParts = (base, bonus) => {
            if (base == null) return [['-', CSS.muted]];
            const bn = Number(bonus) || 0;
            return bn ? [[`${base}`, CSS.text], [` ${bn > 0 ? '+' : ''}${bn}`, bn > 0 ? '#7fd67f' : '#ff8a7a']] : [[`${base}`, CSS.text]];
        };
        // 막대 그리기: (x, top, bw, bh)
        const fill = (pct, col, edge) => (x, t, bw, bh) => {
            g.fillStyle(0x07101f, 1).fillRect(x, t, bw, bh).lineStyle(1, edge, 0.8).strokeRect(x, t, bw, bh);
            g.fillStyle(col, 1).fillRect(x + 1, t + 1, Math.max(0, (bw - 2) * Math.min(1, Math.max(0, pct) / 100)), bh - 2);
        };
        const hpBar = (x, t, bw, bh) => { // 기존 병력 막대: 테두리 하나 + 안쪽 10칸
            g.fillStyle(0x07101f, 1).fillRect(x, t, bw, bh).lineStyle(1, COLOR.text, 0.8).strokeRect(x, t, bw, bh);
            const cw = (bw - 2 - (MAX_SOLDIERS - 1)) / MAX_SOLDIERS;
            for (let i = 0; i < steps; i++) g.fillStyle(segCol, 1).fillRect(x + 1 + i * (cw + 1), t + 1, cw, bh - 2);
        };
        const statBar = (base, bonus, cap) => (x, t, bw, bh) => { // 기존 공·수 막대(기본 금색 + 보정 초록 / 음수 붉은 끝)
            g.fillStyle(0x07101f, 1).fillRect(x, t, bw, bh).lineStyle(1, COLOR.text, 0.55).strokeRect(x, t, bw, bh);
            if (base == null) return;
            const bn = Number(bonus) || 0; const k = bw / cap; const tot = Math.max(0, base + bn);
            const wb = Math.min(bw, Math.min(base, tot) * k);
            g.fillStyle(0xf0d58c, 1).fillRect(x + 1, t + 1, Math.max(0, wb - 2), bh - 2);
            if (bn > 0) g.fillStyle(0x7fd67f, 1).fillRect(x + wb, t + 1, Math.max(0, Math.min(bw, tot * k) - wb - 1), bh - 2);
            if (bn < 0) g.fillStyle(0xff5a4a, 1).fillRect(x + wb - 1, t + 1, 2, bh - 2);
        };
        const segBar = (n, cap, minN = 0) => (x, t, bw, bh) => { // 기존 이동·사거리 칸 눈금(칸마다 테두리)
            const sw = (bw - (cap - 1) * 2) / cap;
            for (let i = 0; i < cap; i++) {
                const on = i < Math.min(n, cap); const dim = on && i < minN - 1;
                g.fillStyle(on ? (dim ? 0x8a7a4a : 0x8fc7ff) : 0x07101f, 1).fillRect(x + i * (sw + 2), t, sw, bh);
                g.lineStyle(1, COLOR.text, 0.4).strokeRect(x + i * (sw + 2), t, sw, bh);
            }
        };
        const [r0, r1] = G.range ?? [1, 1];
        const rows = [
            { ico: 'hp', label: '병력', val: [[`${steps}/${MAX_SOLDIERS}${danger ? ' !' : ''}`, danger ? '#ff8a7a' : CSS.text]], draw: hpBar },
            extra.mpMode && u.kind !== 'troop' && mpPct != null ? { ico: 'mp', label: '마력', val: [[mpOwn ? `${u.mp}/${u.mp_max}` : `${mpPct}%`, '#9FD8FF']], draw: fill(mpPct, 0x4a9be8, 0x8fc7ff) } : null,
            { ico: 'atk', label: '공격', val: bonusParts(G.at?.[0], G.at?.[1]), draw: statBar(G.at?.[0], G.at?.[1], STAT_CAP.at) },
            { ico: 'def', label: '수비', val: bonusParts(G.df?.[0], G.df?.[1]), draw: statBar(G.df?.[0], G.df?.[1], STAT_CAP.df) },
            { ico: 'move', label: '이동', val: [[String(G.move ?? 0), CSS.text]], draw: segBar(G.move ?? 0, SEG_CAP.move) },
            { ico: 'range', label: '범위', val: [[r0 === r1 ? String(r1) : `${r0}-${r1}`, CSS.text]], draw: segBar(r1, SEG_CAP.range, r0) },
        ].filter(Boolean);
        // 열: 아이콘(tx..tx+16) | 라벨(고정 폭 = 가장 긴 라벨) | 막대(공통 시작·폭) | 값(공통 폭, 우측 정렬 w-10)
        const labels = rows.map((r) => makeText(sc, 0, 0, r.label, { ...VS, color: CSS.muted, origin: [0, 0.5] }));
        const vals = rows.map((r) => r.val.map(([s, c]) => makeText(sc, 0, 0, s, { ...VS, color: c, origin: [1, 0.5] })));
        const lx = tx + 20; const labW = Math.ceil(Math.max(...labels.map((t) => t.width))) + 8;
        const valW = Math.ceil(Math.max(30, ...vals.map((p) => p.reduce((s, t) => s + t.width, 0))));
        const bx = lx + labW; const vr = w - 10; const bw = Math.max(40, vr - valW - 8 - bx);
        const hasTail = !!(extra.resist || extra.terrain || (u.aura && u.kind !== 'troop'));
        const avail = this.h - y - 3 - (hasTail ? 15 : 0);
        const rowH = Math.max(15, Math.min(18, Math.floor(avail / rows.length)));
        const bh = 8;
        rows.forEach((r, i) => {
            const cy = Math.round(y + i * rowH + rowH / 2);
            const ic = statIcon(sc, r.ico, tx + 8, cy, 16); if (ic) b.add(ic);
            labels[i].setPosition(lx, cy); b.add(labels[i]);
            r.draw(bx, cy - bh / 2, bw, bh);
            let rx = vr; for (let j = vals[i].length - 1; j >= 0; j--) { vals[i][j].setPosition(rx, cy); b.add(vals[i][j]); rx -= vals[i][j].width; }
        });
        return y + rows.length * rowH + 1;
    }
}
keepW(PortraitCard); // setPosition 후 this.w 보존(Phaser 4)
