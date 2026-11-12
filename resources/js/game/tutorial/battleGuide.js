// 첫 전투 조작 안내(G1~G5·G4b). 문구 = tutorial_guide.json guide_steps(송서사). 노출 조건은 guideFlow.guidePending()(새 흐름 사용자의 다음 새 스테이지 전투 1회).
// 한 번에 말풍선 하나, 다음 단계는 사용자가 해당 행동을 해야 넘어간다. 2번째 턴부터(또는 G5 완료) 종료. '안내 건너뛰기'는 항상 가능.
// 말풍선 스타일 = 전투 HUD 패널(FlatPanel 톤)·BattleDialogue 이름표 색 재사용. 전투 대사(storyDialogue)가 떠 있는 동안은 숨김.
import { COLOR, CSS } from '../theme.js';
import { L } from '../layout.js';
import { makeText } from '../ui/common.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { unitType } from '../data/rules.js';
import { TILE } from '../UnitView.js';
import { loadGuide, finishGuide } from './guideFlow.js';
import { goalLines } from '../campaign/campaignFlow.js'; // G1 목표 배너 = 승패 규칙 반영 공용 문구(로비와 같은 규칙)


export class BattleGuide {
    constructor(scene) {
        this.scene = scene; this.step = null; this.done = false; this.box = null; this.unitId = null; this.startTurn = null; this.variant = 'main';
        loadGuide().then((g) => { this.data = g?.guide_steps; this.data0 = g; if (this.scene.sys?.isActive()) this.update(); }).catch((e) => { console.warn('[guide] 안내 문구 로드 실패(안내 생략)', e); this.done = true; });
        this.off = scene.store.on('change', () => this.update());
        scene.events.once('shutdown', () => this.destroy());
    }

    stepDef(id) { return (this.data?.steps ?? []).find((s) => s.id === id) ?? null; }

    enemiesInRange(u) {
        const t = unitType(u.type); const lo = t.range_min ?? 1; const hi = t.range_max ?? 1;
        return this.scene.store.state.units.some((e) => e.team !== 'ally' && e.hp > 0 && (() => { const d = Math.abs(e.x - u.x) + Math.abs(e.y - u.y); return d >= lo && d <= hi; })());
    }

    // 아직 행동하지 않은 다른 아군 영웅(부대·수레·배·아군 NPC 제외): G4d '직접 움직이십시오' 안내 대상
    othersLeft() {
        const st = this.scene.store.state;
        return (st.units ?? []).filter((u) => u.team === 'ally' && u.kind !== 'troop' && !u.non_hero && !u.npc_ally && !u.acted && u.hp > 0 && u.id !== this.unitId);
    }

    // 행동을 마친 뒤 다음 단계: 남은 아군 영웅이 있으면 G4d(데이터에 있을 때), 없으면 G5
    afterAct() { return this.stepDef('G4d_move_others') && this.othersLeft().length ? 'G4d_move_others' : 'G5_end_turn'; }

    heroesText() {
        const nm = (u) => String(u.short_name || u.hero_name || u.name_ko || u.name || '').trim();
        return this.othersLeft().map(nm).filter(Boolean).slice(0, 2).join('·');
    }

    go(id) {
        if (this.done || this.step === id) return; // 건너뛰기·완료 뒤 지연 타이머(G1 -> G2)가 상자를 다시 만들지 않게
        this.step = id; this.variant = 'main'; // compact(세로 화면 축소형)는 한 번 켜지면 단계가 바뀌어도 유지(하플레이 2026-11-09: 단계마다 상자 크기·'건너뛰기' 위치가 달라 보임)
        if (id === 'G1_goal_banner') this.startG1Timer();
        this.render();
    }

    // G1 -> G2 자동 전환: 대사·연출 재생 중에는 보류하고, 화면이 조용해진 뒤 G1 을 다시 최소 2.6초(스테이지 안내가 있으면 6초) 노출한 뒤 넘긴다
    startG1Timer() {
        const sc = this.scene; const dur = this.data0?.stage_hints?.[sc.constructor.startData?.stageCode]?.battle ? 6000 : 2600;
        this.g1Timer?.remove(); let since = null;
        this.g1Timer = sc.time.addEvent({ delay: 200, loop: true, callback: () => {
            if (this.done || this.step !== 'G1_goal_banner') { this.g1Timer?.remove(); this.g1Timer = null; return; }
            if (sc.storyDialogue || sc.fx?.playing || !this.box?.visible) { since = null; return; } // 보류: 대사·연출 중(또는 배너가 숨겨진 동안)은 노출 시간으로 세지 않음
            if (since == null) { since = sc.time.now; return; }
            if (sc.time.now - since >= dur) { this.g1Timer?.remove(); this.g1Timer = null; this.go('G2_select_unit'); }
        } });
    }

    update() {
        if (this.done || !this.data) return;
        const sc = this.scene; const s = sc.store.state;
        if (s.status !== 'battle' || s.mode === 'room') { this.hide(); return; }
        if (sc.storyDialogue) { this.hide(); return; } // 개전 내레이션이 끝난 뒤 시작
        if (this.startTurn == null) { if (Number(s.turn ?? 1) > 1) { this.done = true; this.hide(); return; } this.startTurn = Number(s.turn ?? 1); } // 이미 진행 중인 전투(재개)에는 노출하지 않음(완료 표시도 하지 않음)
        if (Number(s.turn ?? 1) > this.startTurn) { this.finish(); return; } // 2번째 턴부터 종료
        const sel = s.selectedId != null ? sc.store.get(s.selectedId) : null;
        const tracked = this.unitId != null ? sc.store.get(this.unitId) : null;
        switch (this.step) {
            case null: this.go('G1_goal_banner'); return;
            case 'G1_goal_banner': break;
            case 'G2_select_unit': if (sel && sel.team === 'ally' && s.side === 'ally') { this.unitId = sel.id; this.go('G3_move'); return; } break;
            case 'G3_move':
                if (sel && sel.team === 'ally' && sel.id !== this.unitId && !sel.acted) this.unitId = sel.id; // 다른 아군으로 바꿔 골라도 이어서
                if (!s.busy && s.phase === 'idle' && !sel && !tracked?.acted) { this.go('G2_select_unit'); return; } // 이동 단계에서 선택 취소 -> 선택 안내로
                if (s.phase === 'menu' || tracked?.acted) { const u = sc.store.get(this.unitId) ?? sel; this.go(u && this.enemiesInRange(u) ? 'G4_attack' : 'G4b_wait_no_target'); return; }
                break;
            case 'G4_attack': case 'G4b_wait_no_target':
                if (tracked?.acted) { this.go(this.afterAct()); return; }
                if (!s.busy && s.phase === 'move') { this.go('G3_move'); return; } // 메뉴에서 취소해 이동 단계로 돌아감 -> 이동 안내로
                if (!s.busy && s.phase === 'idle' && !sel) { this.go('G2_select_unit'); return; } // 선택까지 취소 -> 선택 안내로
                break;
            case 'G4d_move_others': // 남은 아군 영웅이 모두 행동하면 턴 종료 안내. 이름이 바뀌면(한 명 행동) 문구 갱신
                if (!this.othersLeft().length) { this.go('G5_end_turn'); return; }
                if (this.heroesText() !== this.heroesShown && this.box) this.render();
                break;
            case 'G5_end_turn': if (s.side !== 'ally') { this.finish(); return; } break;
            default: break;
        }
        // 안내와 다른 행동 중이면 문구를 현재 상태에 맞추거나 숨긴다(예: 공격 취소 후 '대기' -> 방향 선택 단계에 '공격 후…' 문구가 남지 않게)
        if (this.step === 'G4_attack' || this.step === 'G4b_wait_no_target' || this.step === 'G4d_move_others') {
            const facingOn = s.phase === 'facing' && !!this.stepDef('G4c_facing'); // 방향 선택 단계(하플레이 2026-11-09: '대기' 뒤 설명 없이 뜸) -> G4c 문구
            if (s.busy || (s.phase === 'facing' && !facingOn) || s.phase === 'skill' || (s.phase === 'target' && s.targetMode === 'skill')) { this.hide(); return; }
            const v = facingOn ? 'facing' : s.phase === 'confirm' && this.stepDef(this.step)?.follow_up_bubble ? 'follow' : 'main'; // 전투 예측 창 = follow_up_bubble('확정'을 누르십시오)
            if (v !== this.variant) { this.variant = v; this.render(); }
        } else if (this.variant !== 'main') { this.variant = 'main'; if (this.box) this.render(); }
        if (!this.box) this.render();
        if (this.box && !this.box.visible) this.shownAt = sc.time.now; // 대사 뒤 다시 보일 때도 0.5초 탭 유예를 새로 적용
        this.box?.setVisible(true);
        this.place();
    }

    render() {
        const sc = this.scene; const def = this.stepDef(this.step);
        this.box?.destroy(); this.box = null;
        if (!def || this.done) return;
        const lay = sc.lay; const cmp = !!(this.compact && lay.portrait); // 축소형: 화면 폭 가득, 이름표 생략, 본문 한 줄로 이어 쓰고 작은 '건너뛰기'를 오른쪽에
        const w = cmp ? L.lw - 16 : Math.min(lay.portrait ? 420 : 320, L.lw - 24); const pad = cmp ? 8 : 10; // 데스크톱은 폭을 줄여 맵 가림 최소화
        const c = sc.add.container(0, 0).setDepth(900);
        const name = makeText(sc, pad, pad, '시오리', { size: 13, bold: true, color: '#f0d58c' });
        if (cmp) name.setVisible(false);
        // stage_01 등 스테이지 안내(tutorial_guide stage_hints[code].battle)는 목표 배너(G1)에 함께
        const hint = this.step === 'G1_goal_banner' ? this.data0?.stage_hints?.[sc.constructor.startData?.stageCode]?.battle : null;
        const raw = this.variant === 'facing' ? this.stepDef('G4c_facing')?.bubble : this.variant === 'follow' && def.follow_up_bubble ? def.follow_up_bubble : this.step === 'G1_goal_banner' ? goalLines(sc.store.state.objective, sc.store.state.stageRules, def.bubble) : def.bubble;
        this.heroesShown = this.heroesText();
        const body = (raw ?? []).map((ln) => String(ln).replace('{heroes}', this.heroesShown || '다른 영웅'));
        const lines = [...body, ...(Array.isArray(hint) ? ['', ...hint] : [])].join('\n');
        const btnH = cmp ? 28 : 30; const bw = cmp ? 76 : 118;
        const t = cmp ? makeText(sc, pad, pad, (body ?? []).join(' '), { size: 14, bold: true, color: CSS.text, wrap: w - pad * 2 - bw - 8 })
            : makeText(sc, pad, pad + name.height + 2, lines, { size: 16, bold: true, color: CSS.text, wrap: w - pad * 2 });
        // 본문 최소 2줄 높이(단계마다 상자 높이가 달라져 '건너뛰기' 위치가 흔들리지 않게, 하플레이 2026-11-09). G1 스테이지 안내처럼 긴 본문만 커진다
        let minT = 0;
        if (!cmp) { const probe = makeText(sc, 0, 0, '가\n가', { size: 16, bold: true, wrap: w - pad * 2 }); minT = probe.height; probe.destroy(); }
        const tH = Math.max(t.height, minT);
        // 축소형 G1 + 스테이지 안내(강화면 2026-11-10: 390x844 에서 stage_hints 4줄이 빠짐): 한 줄 머리(목표+건너뛰기) 아래에 안내를 작은 글씨로 덧붙인다(G1 만 커지고 이후 단계는 기존 한 줄 축소형 유지)
        const rowH = cmp ? pad * 2 + Math.max(t.height, btnH) : 0;
        const ht = cmp && Array.isArray(hint) && hint.length ? makeText(sc, pad, rowH - 2, hint.join('\n'), { size: 13, color: CSS.text, wrap: w - pad * 2 }) : null;
        const h = cmp ? rowH + (ht ? ht.height + pad : 0) : pad + name.height + 2 + tH + 8 + btnH + pad;
        if (cmp) t.setY((rowH - t.height) / 2);
        const g = sc.add.graphics();
        g.fillStyle(COLOR.navyDeep, 0.96).fillRoundedRect(0, 0, w, h, 10).lineStyle(2, COLOR.accent, 0.9).strokeRoundedRect(0, 0, w, h, 10);
        const skip = new Button(sc, { x: w - bw - pad, y: cmp ? (rowH - btnH) / 2 : h - btnH - pad, w: bw, h: btnH, label: cmp ? '건너뛰기' : this.data?.skip?.button_text ?? '안내 건너뛰기', size: cmp ? 12 : 13, onClick: () => this.askSkip() });
        c.add([g, name, t, skip, ...(ht ? [ht] : [])]);
        // 위치: 가로 화면 = 화면 맨 아래, 좌하단 유닛 카드와 우하단 도구 줄 사이 빈 칸 가운데(들어갈 폭이 없으면 도구 줄 바로 위 오른쪽 정렬)
        //       세로 화면 = 상단 안내 배너 아래
        let x; let y;
        if (lay.portrait) { x = (L.lw - w) / 2; y = this.topY(); } // 세로: 기본 상단, 메뉴·팝업과 겹치면 place() 가 옮김
        else {
            const left = (lay.card?.x ?? 12) + (lay.card?.w ?? 0) + 8; const right = (lay.tools?.x ?? L.lw) - 8;
            if (right - left >= w) { x = left + (right - left - w) / 2; y = (lay.infoY ?? lay.bottom ?? L.lh - 12) - 6 - h; } // 하단 '턴 종료'·정보 바 위(2026-11-03 HUD 개편)
            else { const mm = sc.minimap?.visible ? sc.minimap.rect() : null; x = (lay.tools?.x ?? L.lw - w) + (lay.tools?.w ?? w) - w; y = Math.min(lay.tools?.y ?? L.lh - 60, mm ? mm.y : Infinity) - h - 8; }
        }
        c.setPosition(x, y);
        const hit = sc.add.rectangle(0, 0, w, h, 0xffffff, 0.001).setOrigin(0).setInteractive(); // 말풍선 영역은 입력 소비(아래 칸 선택 방지)
        this.shownAt = sc.time.now;
        if (def.kind === 'banner') hit.on('pointerup', () => { if (this.step === 'G1_goal_banner' && sc.time.now - this.shownAt > 500) this.go('G2_select_unit'); }); // 목표 배너: 탭하면 바로 다음(대사를 닫은 같은 탭으로 즉시 넘어가지 않게 0.5초 유예)
        c.addAt(hit, 1);
        this.rect = { x, y, w, h };
        this.box = c;
        this.place();
    }

    // 세로 화면: 행동 메뉴·전투 예측·방향 선택 팝업과 겹치지 않는 자리(상단 배너 아래 -> 하단 유닛 카드 위). 둘 다 겹치면 숨김(메뉴의 '공격' 버튼을 절대 가리지 않게)
    place() {
        const sc = this.scene; const lay = sc.lay; const r = this.rect;
        if (!this.box || !r) return true;
        if (!lay.portrait) { // 가로 화면은 자리 고정. 방향 선택 팝업과 겹치면 그동안만 숨김(G4c 방향 안내가 방향 버튼을 가리지 않게)
            const ov = [sc.facingPicker].filter((o) => o?.scene && o.visible !== false).some((o) => { try { const b = o.getBounds(); return b.x < r.x + r.w && b.x + b.width > r.x && b.y < r.y + r.h && b.y + b.height > r.y; } catch { return false; } });
            if (ov) this.box.setVisible(false);
            return !ov;
        }
        const pops = [sc.menuCtx, sc.bubble, sc.facingPicker].filter((o) => o?.scene && o.visible !== false).map((o) => { try { return o.getBounds(); } catch { return null; } }).filter(Boolean);
        const hit = (y) => pops.some((b) => b.x < r.x + r.w && b.x + b.width > r.x && b.y < y + r.h && b.y + b.height > y);
        const top = this.topY();
        const bottom = (lay.card?.y ?? L.lh - 160) - (sc.card?.visible ? (sc.card.portMax ?? 0) : 0) - r.h - 6;
        // 자리 후보(강화면 gacha101: 상단 안내가 맵 위쪽 절반·유닛을 덮음): 맵 아래 빈 띠 -> 하단(카드 위) -> 맵 위 빈 띠 -> 상단.
        //  팝업과 겹치는 자리는 제외, 그 안에서 살아 있는 유닛(아군·적) 칸을 가장 적게 덮는 자리(같으면 앞 순서)
        const mp = sc.store?.state?.map; const wd = sc.world; // 맵 화면 사각형 = 월드 원점 + 타일 수 x TILE x 배율(배경 장식은 제외)
        const mb = mp && wd ? { y: wd.y, height: mp.h * TILE * wd.scaleY } : null;
        // 직전 자리를 첫 후보로(점수가 같으면 그대로 둠): 단계가 바뀔 때마다 상자가 위아래로 옮겨 다니지 않게(하플레이 2026-11-09)
        const cand = Number.isFinite(this.lastY) && this.lastY <= bottom ? [this.lastY] : [];
        if (mb && mb.height > 0) { const below = mb.y + mb.height + 6; if (below >= top && below <= bottom) cand.push(below); }
        cand.push(bottom);
        if (mb && mb.height > 0) { const above = mb.y - r.h - 6; if (above >= top && above <= bottom) cand.push(above); }
        cand.push(top);
        // 겹침 점수(강화면 gacha102·2026-11-07: 이동 단계 안내가 이동 범위 상단 6칸·아군 4기를 덮음): 선택 유닛 = 금지(5000, 끝내 겹치면 숨김),
        //  이동 범위(standableTiles)·공격 범위(attackTiles) 칸 x600, 유닛 카드(초상 포함) 1000, 아직 행동 안 한 아군 x60, 그 밖의 유닛 x3.
        //  큰 상자로는 x60 이상(조작 대상·범위·카드)을 피할 자리가 없으면 축소형(this.compact)으로 다시 그려 한 번 더 고른다. 팝업과 겹치는 자리는 후보 제외
        const st = sc.store?.state ?? {};
        const rectOf = (t) => { try { return sc.anchorOf(t); } catch { return null; } };
        const unitW = (st.units ?? []).filter((u) => u.hp > 0 && u.id !== st.selectedId).map((u) => ({ b: rectOf(u), k: u.team === 'ally' && !u.acted ? 60 : 3 })).filter((o) => o.b);
        const tiles = [...(st.phase === 'move' ? st.standableTiles ?? [] : []), ...(['target', 'confirm'].includes(st.phase) ? st.attackTiles ?? [] : [])].map(rectOf).filter(Boolean);
        const selU = st.selectedId != null ? (st.units ?? []).find((u) => u.id === st.selectedId) : null; const selR = selU ? rectOf(selU) : null;
        let cardR = null; try { if (sc.card?.visible) { const b = sc.card.getBounds(); cardR = { x: b.x, y: b.y, w: b.width, h: b.height }; } } catch { cardR = null; }
        const ov = (b, yy) => b.x < r.x + r.w && b.x + b.w > r.x && b.y < yy + r.h && b.y + b.h > yy;
        const cover = (yy) => (cardR && ov(cardR, yy) ? 1000 : 0) + (selR && ov(selR, yy) ? 5000 : 0) + unitW.reduce((n, o) => n + (ov(o.b, yy) ? o.k : 0), 0) + tiles.reduce((n, b) => n + (ov(b, yy) ? 600 : 0), 0);
        // 추가 후보: 카드 바로 위(카드가 보이면), 선택 유닛에서 먼 쪽 끝(상단/하단 중 먼 곳)
        if (cardR) cand.push(cardR.y - r.h - 6);
        if (selR) cand.push(selR.y + selR.h / 2 > (top + bottom + r.h) / 2 ? top : bottom);
        for (let v = top; v <= bottom; v += 24) cand.push(v); // 마지막 수단: 세로 24px 간격 훑기(앞 후보와 점수가 같으면 앞 후보 우선)
        if (cardR) cand.push(cardR.y + 2); // 카드 윗단에 걸치는 자리(점수 1000): 범위 칸 2개 이상을 덮는 것보다는 낫다
        let y = null; let best = Infinity;
        cand.filter((v) => Number.isFinite(v) && v >= top - 0.5 && !hit(v)).forEach((v) => { const c = cover(v); if (c < best) { best = c; y = v; } });
        if (!this.compact && (y == null || best >= 60)) { this.compact = true; this.render(); return !!this.box?.visible; } // 축소형으로 다시 그림(render 가 place 재호출)
        if (y == null || best >= 5000) { this.box.setVisible(false); return false; } // 조작 대상 유닛은 끝내 가리지 않음
        r.y = y; this.box.setY(y); this.lastY = y;
        return true;
    }

    // 세로 화면 상단 자리: 안내 배너 아래, 우상단 미니맵이 보이면 그 아래
    topY() { const sc = this.scene; const lay = sc.lay; const mm = sc.minimap?.visible ? sc.minimap.rect() : null; return Math.max((lay.B?.y ?? lay.barH) + (lay.B?.h ?? 52) + 8, mm ? mm.y + mm.h + 8 : 0); }

    hide() { this.box?.setVisible(false); }

    // 전투 씬 HUD 판정(Battle.overHud)용: 보이는 말풍선 영역
    contains(px, py) { const r = this.rect; return !!this.box?.visible && !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }

    askSkip() {
        const sk = this.data?.skip ?? {};
        new Modal(this.scene, { title: sk.button_text ?? '안내 건너뛰기', body: sk.confirm_text ?? '조작 안내를 건너뛰시겠습니까?', w: 460, h: 240, buttons: [{ label: sk.confirm_no ?? '계속 보기' }, { label: sk.confirm_yes ?? '건너뛰기', variant: 'primary', onClick: () => this.finish() }] });
    }

    finish() { if (this.done) return; this.done = true; this.step = null; this.off?.(); this.off = null; this.box?.destroy(); this.box = null; this.rect = null; finishGuide(); } // 상자 즉시 제거 + 이후 갱신 구독 해제(서버 기록은 기존 finishGuide)

    destroy() { this.g1Timer?.remove(); this.g1Timer = null; this.off?.(); this.box?.destroy(); this.box = null; }
}
