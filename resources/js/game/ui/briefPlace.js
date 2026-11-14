// 시오리 안내 상자(ShioriBrief·전투 조작 안내 BattleGuide) 공용 자리 계산. tutorial/battleGuide.js place() 의 겹침 회피 로직을 추출(2026-11-14 시오리 브리핑 통일).
//  - 전투 씬(Battle: store.state.map + anchorOf 가 있는 씬)만 유닛·범위·카드 겹침 점수를 쓴다. 그 밖의 씬은 화면 하단/상단 고정 자리.
import { L } from '../layout.js';
import { TILE } from '../UnitView.js';

export const isBattleScene = (sc) => !!(sc?.store?.state && typeof sc.anchorOf === 'function' && sc.lay);

const overlaps = (b, r, y) => b.x < r.x + r.w && b.x + b.width > r.x && b.y < y + r.h && b.y + b.height > y;

// 세로 화면 상단 자리: 안내 배너 아래, 우상단 미니맵이 보이면 그 아래
export function battleTopY(sc) {
    const lay = sc.lay; const mm = sc.minimap?.visible ? sc.minimap.rect() : null;
    return Math.max((lay.B?.y ?? lay.barH) + (lay.B?.h ?? 52) + 8, mm ? mm.y + mm.h + 8 : 0);
}

// 가로 전투 화면 기본 자리: 화면 맨 아래, 좌하단 유닛 카드와 우하단 도구 줄 사이 빈 칸 가운데(들어갈 폭이 없으면 도구 줄 바로 위 오른쪽 정렬)
export function battleLandscapePos(sc, w, h) {
    const lay = sc.lay;
    const left = (lay.card?.x ?? 12) + (lay.card?.w ?? 0) + 8; const right = (lay.tools?.x ?? L.lw) - 8;
    if (right - left >= w) return { x: left + (right - left - w) / 2, y: (lay.infoY ?? lay.bottom ?? L.lh - 12) - 6 - h }; // 하단 '턴 종료'·정보 바 위(2026-11-03 HUD 개편)
    const mm = sc.minimap?.visible ? sc.minimap.rect() : null;
    return { x: (lay.tools?.x ?? L.lw - w) + (lay.tools?.w ?? w) - w, y: Math.min(lay.tools?.y ?? L.lh - 60, mm ? mm.y : Infinity) - h - 8 };
}

// 가로 전투 화면: 방향 선택 팝업과 겹치는지(겹치면 그동안만 숨김 — 방향 버튼을 가리지 않게)
export function overlapsFacing(sc, r) {
    return [sc.facingPicker].filter((o) => o?.scene && o.visible !== false).some((o) => { try { return overlaps(o.getBounds(), r, r.y); } catch { return false; } });
}

// 세로 전투 화면: 행동 메뉴·전투 예측·방향 선택 팝업과 겹치지 않는 자리 중 유닛·범위·카드를 가장 적게 덮는 y.
// 반환 { y, best } — y=null 이면 둘 곳 없음. best>=60 이면 조작 대상·범위·카드를 덮음(호출 측이 축소형으로 다시 그려 재시도), best>=5000 이면 선택 유닛을 덮음(숨김)
// r = { x, w, h } (현재 상자 크기), lastY = 직전 자리(점수가 같으면 그대로 둠: 단계마다 상자가 위아래로 옮겨 다니지 않게, 하플레이 2026-11-09)
export function pickPortraitY(sc, r, { lastY = null } = {}) {
    const lay = sc.lay;
    const pops = [sc.menuCtx, sc.bubble, sc.facingPicker].filter((o) => o?.scene && o.visible !== false).map((o) => { try { return o.getBounds(); } catch { return null; } }).filter(Boolean);
    const hit = (y) => pops.some((b) => overlaps(b, r, y));
    const top = battleTopY(sc);
    const bottom = (lay.card?.y ?? L.lh - 160) - (sc.card?.visible ? (sc.card.portMax ?? 0) : 0) - r.h - 6;
    // 자리 후보(강화면 gacha101: 상단 안내가 맵 위쪽 절반·유닛을 덮음): 맵 아래 빈 띠 -> 하단(카드 위) -> 맵 위 빈 띠 -> 상단.
    const mp = sc.store?.state?.map; const wd = sc.world; // 맵 화면 사각형 = 월드 원점 + 타일 수 x TILE x 배율(배경 장식은 제외)
    const mb = mp && wd ? { y: wd.y, height: mp.h * TILE * wd.scaleY } : null;
    const cand = Number.isFinite(lastY) && lastY <= bottom ? [lastY] : [];
    if (mb && mb.height > 0) { const below = mb.y + mb.height + 6; if (below >= top && below <= bottom) cand.push(below); }
    cand.push(bottom);
    if (mb && mb.height > 0) { const above = mb.y - r.h - 6; if (above >= top && above <= bottom) cand.push(above); }
    cand.push(top);
    // 겹침 점수(강화면 gacha102·2026-11-07): 선택 유닛 = 금지(5000), 이동·공격 범위 칸 x600, 유닛 카드(초상 포함) 1000, 아직 행동 안 한 아군 x60, 그 밖의 유닛 x3
    const st = sc.store?.state ?? {};
    const rectOf = (t) => { try { return sc.anchorOf(t); } catch { return null; } };
    const unitW = (st.units ?? []).filter((u) => u.hp > 0 && u.id !== st.selectedId).map((u) => ({ b: rectOf(u), k: u.team === 'ally' && !u.acted ? 60 : 3 })).filter((o) => o.b);
    const tiles = [...(st.phase === 'move' ? st.standableTiles ?? [] : []), ...(['target', 'confirm'].includes(st.phase) ? st.attackTiles ?? [] : [])].map(rectOf).filter(Boolean);
    const selU = st.selectedId != null ? (st.units ?? []).find((u) => u.id === st.selectedId) : null; const selR = selU ? rectOf(selU) : null;
    let cardR = null; try { if (sc.card?.visible) { const b = sc.card.getBounds(); cardR = { x: b.x, y: b.y, w: b.width, h: b.height }; } } catch { cardR = null; }
    const ov = (b, yy) => b.x < r.x + r.w && b.x + b.w > r.x && b.y < yy + r.h && b.y + b.h > yy;
    const cover = (yy) => (cardR && ov(cardR, yy) ? 1000 : 0) + (selR && ov(selR, yy) ? 5000 : 0) + unitW.reduce((n, o) => n + (ov(o.b, yy) ? o.k : 0), 0) + tiles.reduce((n, b) => n + (ov(b, yy) ? 600 : 0), 0);
    if (cardR) cand.push(cardR.y - r.h - 6);
    if (selR) cand.push(selR.y + selR.h / 2 > (top + bottom + r.h) / 2 ? top : bottom);
    for (let v = top; v <= bottom; v += 24) cand.push(v); // 마지막 수단: 세로 24px 간격 훑기
    if (cardR) cand.push(cardR.y + 2); // 카드 윗단에 걸치는 자리(점수 1000)
    let y = null; let best = Infinity;
    cand.filter((v) => Number.isFinite(v) && v >= top - 0.5 && !hit(v)).forEach((v) => { const c = cover(v); if (c < best) { best = c; y = v; } });
    return { y, best };
}
