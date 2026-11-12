import Phaser from 'phaser';
import { tween, wait } from '../ui/motion.js';
import { unitTex } from '../assets.js';
import { COLOR, textStyle } from '../theme.js';
import { microChoreo, microRoles, choreoPosAt, microHudValue, microView, arrowPose, CHOREO } from './microChoreo.js';

// 병사 미시 교전 컷신 재생(docs/MICRO_COMBAT_SPEC.md 7·9·10절, 서버 app/Game/Micro/MicroCombat.php).
// 서버 attack 이벤트의 micro 가 확정값(micro.mode 'on')이면 BattleCutscene 이 기존 돌진·접전 연출 대신 이것으로 무대를 재생한다(패널·컷인 초상·배경은 기존 그대로).
// shadow(참고용: 맵 HP는 기존 공식이라 개체 재생과 어긋날 수 있음)·mode 없음은 battleStore 에서 micro 를 넘기지 않는다 -> 기존 연출. QA 샘플(__qa.cutscene)은 store 를 거치지 않아 mode 무관 재생.
// 이벤트가 없거나(off) 형식이 맞지 않으면 microPlayable=false -> 기존 연출(기본 동작 불변).
//  - 개체 = s[i] = [side(0=공격·왼쪽, 1=방어·오른쪽), x, y, hp] (1칸=100 서브유닛). 이동 k = [개체, tick, x, y] 키프레임 사이 선형 보간
//  - 타격 h = [tick, 공격개체, 대상개체, 피해, 대상 남은 HP] -> 막대 = 남은 HP / m[대상](스케일 단위 그대로 비율만 씀)
//  - 사망 d = [tick, 개체]. 사망 기록이 없는 개체는 쓰러지지 않는다(동시 전멸 방지로 HP 1 생존한 개체 포함)
//  - 끝: end_tick x tick_ms 에서 멈추고 e(생존 [개체, HP])로 최종 정합(탭 스킵도 같은 정합)
// 화면은 모두 재생 시각 하나(tMs)에서 계산한다(트윈 1개 + 그래픽 다시 그리기). 탭 스킵(snapAll)은 그 트윈만 끝으로 보내고 정합하므로 중간 연출이 남지 않는다.

// ---- 재생 방식 ----
// 'choreo'(기본, 2026-11-07): 서버 결과(배치 s·타격 순서 h·사망 d·생존 e)만 쓰고 FE 고정 안무로 재생(fx/microChoreo.js: 양측 동시 전진 -> 같은 구간 일제 타격 -> 동시 복귀).
//   서버 이동 k·rt·tick 위치는 쓰지 않는다. 진영 병종은 컷신 유닛(specs)의 type/kind 로 판정
// 'sim': 이전 방식(서버 tick 위치 k 재생 + rt 타격 후 복귀). 아래 상수·함수는 sim 전용으로 그대로 둔다
export const MICRO_STYLE = 'choreo';
// 진형 이름 라벨 표시(2026-11-07 사용자 결정: 진형 제거 -> false). 출발 위치는 서버 배치 좌표 s 그대로(진형 필드 없어도 재생)
export const SHOW_FORMATION = false;

// ---- 재생 속도 튜닝(여기 한 곳에서, sim 전용) ----
// 서버 tick 데이터는 그대로 두고 "시뮬 시각(tick x tick_ms) -> 화면 시각" 만 구간별로 압축한다(이동·접근이 빨라 보이게).
//  - 접근 구간(0 ~ 첫 타격 틱): APPROACH_SPEED 배 / 교전 구간(첫 타격 이후 ~ end_tick): COMBAT_SPEED 배
//  - 아래 효과 길이(PROJ/LUNGE/FLASH/DEATH/SPARK/BLOOD/LABEL)는 화면 시각(ms) 기준이라 압축되지 않는다 -> 타격·사망은 이전과 같은 길이로 읽힌다
//  - 1 = 이전 재생(서버 tick 실시간). 배속(settings.speed)·탭 스킵·연출 끄기는 tween/wait 쪽에서 그대로 적용
// 2026-11-06 "너무 빨라 정신없다" 지적: 서버 이동속도 상향(foot 26 등)과 겹쳐 이중 압축이 되므로 FE 압축 제거(2.0/1.5 -> 1.0/1.0)
const APPROACH_SPEED = 1.0; // 이전 2.0 (rt 없는 응답 = 원본 동작)
const COMBAT_SPEED = 1.0;   // 이전 1.5
// rt 가 있는 micro 컷신 전용 느린 재생(시뮬 시각 -> 화면 시각 확대, 서버 접촉 속도는 그대로 두고 눈으로 따라가게). rt 없는 응답은 위 1.0 그대로
//  RT_PLAY_SPEED 로 시작해 재생 길이가 "원본 길이(1배속 end_tick + 사망 여유) x RT_PLAY_CAP" 를 넘으면 RT_PLAY_STEP 씩 올려(최대 1.0) 맞춘다
const RT_PLAY_SPEED = 0.65;
const RT_PLAY_STEP = 0.05;
const RT_PLAY_CAP = 1.75; // 이전 1.5(0.65배속 유지를 위해 약 2.2초 허용)
const MELEE_SUB = 130;   // 이 서브유닛 거리 이하 타격 = 근접(찌르기), 초과 = 원거리(투사체)
const PROJ_MS = 90;      // 투사체 비행(타격 시각보다 이만큼 먼저 출발해 타격 시각에 도착, 화면 ms)
const LUNGE_MS = 110;
const FLASH_MS = 80;
const DEATH_MS = 320;
const SPARK_MS = 120;
const BLOOD_MS = 220;
const LABEL_MS = [120, 600, 800]; // 진형 이름: 페이드 인 끝 / 유지 끝 / 사라짐 끝(화면 ms). 이전 [140, 900, 1200](재생이 짧아져 함께 당김)

// ---- 타격 후 복귀(서버 rt, config hit_and_return, 문서 12.3) ----
// rt 가 있는 개체는 첫 타격 직전부터 아래 경로가 서버 이동 k 보다 우선한다(k 는 접촉 위치에 고정). rt 없는 응답은 기존 그대로 k 만 쓴다.
//  - 종류 0(보병·창·검): 접촉 지점 타격 -> HIT_HOLD_MS 머묾 -> 배치 위치(s)로 복귀 -> 다음 타격 전 재접근(배치 위치~접촉 지점 거리 비례)
//  - 종류 1 은 처리하지 않는다(무시). 기병 돌격·관통·복귀는 서버 엔진 이동이라 k 보간만으로 재생된다
//  - 시각은 전부 화면 ms(rt 틱은 warp 로 변환). 거리는 서버 서브유닛
const HIT_HOLD_MS = 120;       // 타격 후 접촉 지점에 머무는 시간(찌르기가 보이게). 이전 50
// 배치 위치까지 복귀 시간 = 접촉 지점~배치 위치 거리 / RETURN_SUB_PER_MS 를 [RETURN_MIN_MS, RETURN_MAX_MS] 로 제한(화면 ms).
//  이전: 서버 rt return_ticks(12틱)를 warp 변환(교전 1.5배속이면 80ms, 거리 무관 -> 먼 병사는 순간이동처럼 보임). 서버 return_ticks 는 쓰지 않는다
const RETURN_SUB_PER_MS = 0.55; // 복귀 걸음 속도(서브유닛/화면 ms). 샘플 복귀거리 중앙값 약 210 -> 약 380ms
const RETURN_MIN_MS = 300;
const RETURN_MAX_MS = 450;
// 재접근: 다음 타격 시각보다 (배치 위치~접촉 지점 거리 / REAPPROACH_SUB_PER_MS 를 [MIN, MAX] 로 제한) 먼저 떠난다(복귀가 덜 끝났으면 그 자리에서 바로). 이전 고정 120 -> 200
const REAPPROACH_SUB_PER_MS = 2.0; // 재접근 걸음 속도 상한 근사(서브유닛/화면 ms). 먼 거리(650)도 325ms -> 화면 속도 2.5 이하
const REAPPROACH_MIN_MS = 200;
const REAPPROACH_MAX_MS = 350;
const TAIL_MAX_MS = HIT_HOLD_MS + RETURN_MAX_MS; // end_tick 이후 복귀 경로를 이어 보여 주는 최대 시간(= 마지막 타격 뒤 머묾+최대 복귀 -> 복귀 완료 보장). 넘으면 그 시점 위치에서 멈춘다

// 시뮬 시각 <-> 화면 시각(구간 선형). s0 = 첫 타격 시뮬 ms(타격 없으면 끝)
const makeWarp = (s0, ap = APPROACH_SPEED, cb = COMBAT_SPEED) => {
    const r0 = s0 / ap;
    return {
        speed: [ap, cb],
        real: (s) => (s <= s0 ? s / ap : r0 + (s - s0) / cb),
        sim: (r) => (r <= r0 ? r * ap : s0 + (r - r0) * cb),
    };
};

// 재생 길이(화면 ms): 마지막 사망 쓰러짐(end_tick + DEATH_MS*0.6)과 rt 복귀 끝 중 늦은 쪽(rt 없으면 doneMs = end_tick 이라 이전과 같음)
export function microPlayMs(tl) {
    if (tl.choreo) return Math.max(240, tl.playMs);
    const dead = tl.deathTick.some((t) => t != null);
    return Math.max(Math.max(240, tl.warp.real(tl.endMs)) + (dead ? DEATH_MS * 0.6 : 0), tl.doneMs);
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// 재생 가능 판정(형식이 다르면 기존 연출로 폴백): v 1(또는 없음), s/m 길이 일치, 양측 개체 존재, tick_ms > 0
export function microPlayable(m) {
    if (!m || typeof m !== 'object') return false;
    if (m.v != null && Number(m.v) !== 1) return false;
    if (!Array.isArray(m.s) || !m.s.length || !Array.isArray(m.m) || m.m.length !== m.s.length) return false;
    if (!(Number(m.tick_ms) > 0)) return false;
    if (!m.s.every((r) => Array.isArray(r) && r.length >= 4 && (r[0] === 0 || r[0] === 1) && [1, 2, 3].every((j) => Number.isFinite(Number(r[j]))))) return false;
    return m.s.some((r) => r[0] === 0) && m.s.some((r) => r[0] === 1);
}

// 이벤트 -> 재생용 시간표(순수 함수). 잘못된 개체 번호·틱은 버린다
export function microTimeline(m) {
    const n = m.s.length;
    const ok = (i) => Number.isInteger(i) && i >= 0 && i < n;
    const tickMs = num(m.tick_ms, 10);
    const ticks = Math.max(1, num(m.ticks, 109));
    const ents = m.s.map((r, i) => ({ i, side: r[0], x0: num(r[1]), y0: num(r[2]), hp0: Math.max(0, num(r[3])), max: Math.max(1, num(m.m[i], 1)), kf: [] }));
    (Array.isArray(m.k) ? m.k : []).forEach((r) => { if (Array.isArray(r) && ok(r[0])) ents[r[0]].kf.push([num(r[1]), num(r[2]), num(r[3])]); });
    ents.forEach((e) => e.kf.sort((a, b) => a[0] - b[0]));
    const hits = (Array.isArray(m.h) ? m.h : []).filter((r) => Array.isArray(r) && ok(r[1]) && ok(r[2])).map((r) => ({ tick: num(r[0]), a: r[1], b: r[2], dmg: num(r[3]), hpAfter: Math.max(0, num(r[4])) })).sort((p, q) => p.tick - q.tick);
    const deathTick = new Array(n).fill(null);
    (Array.isArray(m.d) ? m.d : []).forEach((r) => { if (Array.isArray(r) && ok(r[1]) && deathTick[r[1]] == null) deathTick[r[1]] = num(r[0]); });
    // 최종 생존(e). e 가 없으면 사망 기록으로 추정(사망 없음 = 생존, 마지막 타격 HP)
    const finalHp = new Array(n).fill(null);
    if (Array.isArray(m.e)) m.e.forEach((r) => { if (Array.isArray(r) && ok(r[0])) finalHp[r[0]] = Math.max(0, num(r[1])); });
    else ents.forEach((e) => { if (deathTick[e.i] == null) { const last = hits.filter((h) => h.b === e.i).pop(); finalHp[e.i] = last ? last.hpAfter : e.hp0; } });
    let last = -1;
    hits.forEach((h) => { last = Math.max(last, h.tick); });
    deathTick.forEach((t) => { if (t != null) last = Math.max(last, t); });
    ents.forEach((e) => e.kf.forEach((k) => { last = Math.max(last, k[0] - 1); }));
    const endTick = Math.min(ticks, Math.max(0, m.end_tick != null ? num(m.end_tick) : last + 1));
    // 반격 없음(서버 legacy_counter: 원거리가 낀 교전은 방어측 무반격): 방어측 타격 0 + 방어측 생존. 이 경우 '반격 없음' 표시.
    //  공격측이 원거리(사거리 밖에서 쏜 타격이 있음)면 방어측 개체를 제자리에 둔다(무반격 병사가 화살 속으로 걸어와 서 있기만 하던 어색함 방지).
    //  공격측 근접이면 공격측 접근 좌표가 방어측 이동에 맞춰져 있으므로 이동은 그대로 둔다
    const noCounter = hits.length > 0 && !hits.some((h) => ents[h.a].side === 1) && ents.some((e) => e.side === 1 && finalHp[e.i] != null);
    let holdDef = false;
    if (noCounter) {
        holdDef = hits.some((h) => { if (ents[h.a].side !== 0) return false; const pa = microPosAt(ents[h.a], h.tick); const pb = microPosAt(ents[h.b], h.tick); return Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y) > MELEE_SUB; });
        if (holdDef) ents.forEach((e) => { if (e.side === 1) e.kf = []; });
    }
    const s0 = Math.min(endTick, hits.length ? hits[0].tick : endTick) * tickMs;
    const tl = { n, tickMs, ticks, ents, hits, deathTick, finalHp, endTick, endMs: endTick * tickMs, noCounter, holdDef, warp: makeWarp(s0) };
    // 재생 끝(화면 ms): end_tick, 그리고 살아남은 개체의 복귀 경로가 끝나는 시각 중 늦은 쪽
    const place = () => { tl.doneMs = Math.max(tl.warp.real(tl.endMs), buildTracks(tl, m.rt)); };
    if (!Array.isArray(m.rt) || !m.rt.length) { place(); return tl; } // rt 없음 = 원본 배속(불변)
    // rt 있음: 느린 배속부터, 길이 상한(원본 길이 x RT_PLAY_CAP)을 넘으면 배속을 올린다
    const cap = (Math.max(240, tl.endMs) + (deathTick.some((t) => t != null) ? DEATH_MS * 0.6 : 0)) * RT_PLAY_CAP;
    for (let sp = RT_PLAY_SPEED; ; sp = Math.min(1, sp + RT_PLAY_STEP)) {
        tl.warp = makeWarp(s0, sp, sp);
        place();
        if (sp >= 1 || microPlayMs(tl) <= cap) break;
    }
    return tl;
}

// ---- rt 경로(화면 ms 키프레임 [{t, x, y}], 사이 선형 보간) ----
const lerpKf = (a, b, t) => { const f = b.t > a.t ? clamp01((t - a.t) / (b.t - a.t)) : 1; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; };

// 경로 위치. 시작 전이면 null(-> k 사용). moving = 이동 구간
export function microTrackAt(trk, t) {
    if (!trk || !trk.length || t < trk[0].t) return null;
    for (let j = trk.length - 1; j >= 0; j -= 1) {
        if (trk[j].t <= t) {
            const nx = trk[j + 1];
            if (!nx) return { x: trk[j].x, y: trk[j].y, moving: false };
            const p = lerpKf(trk[j], nx, t);
            return { ...p, moving: nx.x !== trk[j].x || nx.y !== trk[j].y };
        }
    }
    return null;
}

// 화면 시각 tMs 의 개체 위치(서브유닛): rt 경로(사망 시각에 고정) 우선, 없거나 시작 전이면 서버 k
export function microPosMs(tl, e, tMs) {
    if (e.trk) {
        const p = microTrackAt(e.trk, e.deadMs != null ? Math.min(tMs, e.deadMs) : tMs);
        if (p) return p;
    }
    return microPosAt(e, Math.min(tl.warp.sim(tMs) / tl.tickMs, tl.ticks));
}

// 단조 증가 보정(겹친 구간은 길이 0으로)
const monotone = (trk) => { for (let j = 1; j < trk.length; j += 1) trk[j].t = Math.max(trk[j].t, trk[j - 1].t); return trk; };

// 종류 0: 접촉 타격 -> 머묾 -> 배치 위치 복귀 -> (다음 타격 전) 재접근. strike(r) = 그 타격의 접촉 지점
function zeroTrack(tl, e, list, strike) {
    const atOf = (tk) => tl.warp.real(tk * tl.tickMs);
    const trk = [];
    list.forEach((r, j) => {
        const T = atOf(r.tick); const p = strike(r);
        const reMs = Math.min(REAPPROACH_MAX_MS, Math.max(REAPPROACH_MIN_MS, Math.hypot(p.x - e.x0, p.y - e.y0) / REAPPROACH_SUB_PER_MS));
        const a = Math.max(0, T - reMs);
        if (j === 0) {
            const k0 = microPosAt(e, tl.warp.sim(a) / tl.tickMs); // 첫 접근은 서버 k 그대로 오다가 a 부터 접촉 지점으로
            trk.push({ t: a, x: k0.x, y: k0.y });
        } else {
            const ret = trk[trk.length - 1]; const hold = trk[trk.length - 2];
            if (a < ret.t) { // 복귀가 덜 끝남: 복귀 키를 a 시점 보간점으로 바꾸고 거기서 재접근
                trk.pop();
                if (a < hold.t) { // 다음 타격이 머묾 안에 옴(돌격 고정점 등): 머묾을 줄여 재접근 시간을 확보(이전엔 머묾 끝까지 서 있다 남은 몇 십 ms 에 튀어 나감)
                    trk.pop(); const st = trk[trk.length - 1]; trk.push({ t: Math.max(a, st.t), x: st.x, y: st.y });
                } else trk.push({ t: a, ...lerpKf(hold, ret, a) });
            } else trk.push({ t: a, x: e.x0, y: e.y0 });
        }
        trk.push({ t: T, x: p.x, y: p.y });
        trk.push({ t: T + HIT_HOLD_MS, x: p.x, y: p.y });
        const back = Math.min(RETURN_MAX_MS, Math.max(RETURN_MIN_MS, Math.hypot(p.x - e.x0, p.y - e.y0) / RETURN_SUB_PER_MS));
        trk.push({ t: T + HIT_HOLD_MS + back, x: e.x0, y: e.y0 });
    });
    return monotone(trk);
}

// rt 파싱 -> 개체별 경로(e.trk). 반환 = 살아남은 개체 경로가 끝나는 화면 ms(없으면 0)
function buildTracks(tl, rt) {
    const { ents, n } = tl;
    const atOf = (tk) => tl.warp.real(tk * tl.tickMs);
    ents.forEach((e) => { e.deadMs = tl.deathTick[e.i] != null ? atOf(tl.deathTick[e.i]) : null; });
    if (!Array.isArray(rt) || !rt.length) return 0;
    const by = new Map();
    rt.forEach((r) => {
        if (!Array.isArray(r) || r.length < 5 || !Number.isInteger(r[1]) || r[1] < 0 || r[1] >= n) return;
        if (![0, 2, 3, 4].every((j) => Number.isFinite(Number(r[j])))) return;
        if (r[5] != null && Number(r[5]) !== 0) return; // 종류 0 만(구 기병 관통 종류 1 은 무시 -> 그 개체는 k)
        const row = { tick: num(r[0]), hx: num(r[2]), hy: num(r[3]), ret: Math.max(0, num(r[4])) };
        if (!by.has(r[1])) by.set(r[1], []);
        by.get(r[1]).push(row);
    });
    const tgt = new Map(); // `${틱}:${공격개체}` -> 대상
    tl.hits.forEach((h) => { const key = `${h.tick}:${h.a}`; if (!tgt.has(key)) tgt.set(key, h.b); });
    // rt 없는 근접 공격자(기병 돌격·영웅)에게 맞는 rt 개체는 그 순간 서버 위치로 나와 맞는다(복귀해 있어 허공을 치는 것 방지): 고정점(anchor) 추가
    tl.hits.forEach((h) => {
        const list = by.get(h.b);
        if (!list || by.has(h.a) || list.some((r) => r.tick === h.tick)) return;
        const pa = microPosAt(ents[h.a], h.tick); const pb = microPosAt(ents[h.b], h.tick);
        if (Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y) > MELEE_SUB) return;
        list.push({ tick: h.tick, hx: pb.x, hy: pb.y, ret: list[0].ret, anchor: true });
    });
    // 1차: 서버 접촉 지점 그대로
    by.forEach((list, i) => {
        list.sort((p, q) => p.tick - q.tick);
        ents[i].trk = zeroTrack(tl, ents[i], list, (r) => ({ x: r.hx, y: r.hy }));
    });
    // 2차(종류 0): 접촉 지점을 대상의 "화면 위치" 기준으로 옮긴다(대상이 이미 복귀해 있으면 허공 찌르기 방지). 대상 위치는 1차 경로(1단계 근사)
    const raw = ents.map((e) => e.trk ?? null);
    by.forEach((list, i) => {
        const e = ents[i];
        e.trk = zeroTrack(tl, e, list, (r) => {
            const b = r.anchor ? null : tgt.get(`${r.tick}:${i}`);
            if (b == null) return { x: r.hx, y: r.hy };
            const tb = ents[b]; const T = atOf(r.tick);
            const shown = microTrackAt(raw[b], T) ?? microPosAt(tb, r.tick);
            const srv = microPosAt(tb, r.tick);
            return { x: shown.x + (r.hx - srv.x), y: shown.y + (r.hy - srv.y) };
        });
    });
    // 꼬리 제한: end_tick + TAIL_MAX_MS 이후 키는 그 시점 보간 위치 하나로 바꾼다(최종 정합도 이 위치)
    const cut = atOf(tl.endTick) + TAIL_MAX_MS;
    ents.forEach((e) => {
        const trk = e.trk;
        if (!trk || trk[trk.length - 1].t <= cut) return;
        const j = trk.findIndex((q) => q.t > cut);
        const p = j > 0 ? lerpKf(trk[j - 1], trk[j], cut) : { x: trk[0].x, y: trk[0].y };
        trk.splice(Math.max(0, j), trk.length, { t: Math.max(cut, j > 0 ? trk[j - 1].t : trk[0].t), x: p.x, y: p.y });
    });
    let done = 0;
    ents.forEach((e) => { if (e.trk && tl.finalHp[e.i] != null) done = Math.max(done, e.trk[e.trk.length - 1].t); });
    return done;
}

// 개체 위치(서브유닛) at tick: 키프레임 사이 선형 보간, 첫 키프레임 전 = 시작 위치, 마지막 뒤 = 마지막 위치
export function microPosAt(e, tick) {
    const kf = e.kf;
    if (!kf.length || tick < kf[0][0]) return { x: e.x0, y: e.y0, moving: false };
    for (let j = kf.length - 1; j >= 0; j -= 1) {
        if (kf[j][0] <= tick) {
            const nx = kf[j + 1];
            if (!nx || nx[0] <= kf[j][0]) return { x: kf[j][1], y: kf[j][2], moving: false };
            const f = (tick - kf[j][0]) / (nx[0] - kf[j][0]);
            return { x: kf[j][1] + (nx[1] - kf[j][1]) * f, y: kf[j][2] + (nx[2] - kf[j][2]) * f, moving: nx[1] !== kf[j][1] || nx[2] !== kf[j][2] };
        }
    }
    return { x: e.x0, y: e.y0, moving: false };
}

// 무대 오브젝트 생성(BattleCutscene 생성자에서 buildSide·컷인 뒤 호출). 기존 병사 군집은 지우고 개체 스프라이트로 바꾼다
// style: 'choreo'(기본, 안무형) | 'sim'(서버 tick 위치 재생)
export function buildMicro(cs, micro, specs, style = MICRO_STYLE) {
    const sc = cs.scene; const { W, SH } = cs;
    const tl = style === 'sim' ? microTimeline(micro) : microChoreo(micro, microRoles(specs, micro));
    cs.sides.forEach((s) => { s.members.forEach((mm) => mm.o?.destroy?.()); s.members = []; });
    // 서브유닛 -> 화면 좌표. 가로 = 전체 범위(최소 1350 = 기본 배치 폭)를 화면 폭 안에, 세로 = 무대 아래쪽 띠(원근: 아래가 앞)
    const xs = []; const ys = [];
    if (tl.choreo) tl.ents.forEach((e) => e.ctrk.forEach((k) => { xs.push(k.x); ys.push(k.y); })); // 안무 경로(배치 위치 포함)
    else tl.ents.forEach((e) => { xs.push(e.x0); ys.push(e.y0); e.kf.forEach((k) => { xs.push(k[1]); ys.push(k[2]); }); (e.trk ?? []).forEach((k) => { xs.push(k.x); ys.push(k.y); }); }); // rt 경로(복귀 지점은 s 범위 안)
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const padX = Math.max(28, W * 0.06);
    // 안무 = 고정 필드(CHOREO.FIELD_*)로만 배율 계산(이동 범위와 무관 -> 모든 교전 같은 스케일·유닛 크기). sim = 이전처럼 이동 범위 기준
    const view = tl.choreo ? microView({ W, H: cs.H, SH, groundY: cs.groundY }) : null;
    const sx = view ? view.sx : (W - padX * 2) / Math.max(1350, maxX - minX);
    const bandMid = cs.groundY - SH * 0.05; const bandH = SH * 0.36;
    const sy = view ? view.sy : bandH / Math.max(600, maxY - minY);
    const cxs = view ? view.cx : (minX + maxX) / 2; const cys = view ? view.cy : (minY + maxY) / 2;
    const toX = view ? view.toX : (x) => W / 2 + (x - cxs) * sx;
    const toY = view ? view.toY : (y) => bandMid + (y - cys) * sy; // 안무 = 배경 지면 띠 안(microView)
    const layer = sc.add.container(0, 0); cs.stage.add(layer);
    // 안무: 유닛 스프라이트는 초상(cutLayer) 바로 아래(맨 뒷열이 초상에 살짝 가림). 막대·이펙트(fxG/barG)는 아래에서 무대 맨 위에 추가돼 초상 위에 보인다
    if (tl.choreo && cs.cutLayer?.scene) { const ci = cs.stage.getIndex(cs.cutLayer); if (typeof ci === 'number' && ci >= 0) cs.stage.moveTo(layer, ci); }
    // 이동 먼지(안무 전용): 유닛 레이어 바로 아래 그래픽(지면 위·유닛 뒤)
    let dustG = null;
    if (tl.choreo && CHOREO.DUST_ON && tl.dust?.length) { dustG = sc.add.graphics(); const li = cs.stage.getIndex(layer); if (typeof li === 'number' && li >= 0) cs.stage.addAt(dustG, li); else cs.stage.add(dustG); }
    const fxG = sc.add.graphics(); const barG = sc.add.graphics();
    cs.stage.add(fxG); cs.stage.add(barG);
    const objs = tl.ents.map((e) => {
        const spec = specs[e.side]; const unit = spec.unit;
        const hero = unit.kind !== 'troop';
        const look = e.side === 0 ? 'right' : 'left';
        const tex = unitTex(sc, hero ? unit : { ...unit, kind: 'troop', hero: null }, look) ?? unitTex(sc, unit, look);
        const srcH = tex ? sc.textures.getFrame(tex.key, tex.frame)?.realHeight ?? 32 : 32;
        // 표시 높이: 기존 컷신 병사 기준(화면 높이 12.5% x 1.5)을 넘지 않고, 개체 간격(150 서브유닛)에 맞춰 줄인다(20기가 다 보이게)
        const want = view ? view.want : Math.max(20, Math.min(cs.H * 0.125 * 1.5, 150 * sx * 1.15, 150 * sy * 2.4)); // 안무 = 고정 높이(UNIT_SCALE 반영)
        const o = tex ? sc.add.image(0, 0, tex.key, tex.frame).setOrigin(0.5, 1).setFlipX(!!tex.flipX).setScale(want / Math.max(1, srcH))
            : sc.add.rectangle(0, 0, want * 0.7, want, e.side === 0 ? COLOR.ally : COLOR.danger).setOrigin(0.5, 1);
        o.setPosition(toX(e.x0), toY(e.y0));
        layer.add(o);
        return { e, o, flip0: !!tex?.flipX, dir: e.side === 0 ? 1 : -1, color: unit.team === 'ally' ? COLOR.ally : COLOR.danger, hp: e.hp0, flashAt: -1e9, lungeAt: -1e9, lunge: { x: 0, y: 0 }, deadAt: null, tinted: false };
    });
    // 진형 이름(formation_ko, 기본 배치 '기본'은 표시 안 함): 각 진영 군집 위에 짧게. SHOW_FORMATION=false(2026-11-07 진형 제거 결정)면 표시 안 함
    const ko = SHOW_FORMATION && Array.isArray(micro.formation_ko) ? micro.formation_ko : [];
    const labels = [0, 1].map((side) => {
        const name = typeof ko[side] === 'string' ? ko[side] : '';
        if (!name || name === '기본') return null;
        const mine = objs.filter((q) => q.e.side === side);
        if (!mine.length) return null;
        const x = mine.reduce((a, q) => a + q.o.x, 0) / mine.length;
        const top = Math.min(...mine.map((q) => q.o.y - q.o.displayHeight));
        const t = sc.add.text(Math.max(48, Math.min(W - 48, x)), Math.max(18, top - 26), name, textStyle(W < 760 ? 15 : 20, side === 0 ? '#BFE6FF' : '#FFC2B8', { fontStyle: 'bold', stroke: '#0B1020', strokeThickness: 4 })).setOrigin(0.5).setAlpha(0);
        cs.stage.add(t);
        return t;
    });
    // 반격 없음 표시(방어측 군집 위, 진형 이름이 있으면 그 위). 첫 타격 때 나타나 끝까지 유지
    let ncLabel = null;
    if (tl.noCounter) {
        const mine = objs.filter((q) => q.e.side === 1);
        const x = mine.reduce((a, q) => a + q.o.x, 0) / Math.max(1, mine.length);
        const top = Math.min(...mine.map((q) => q.o.y - q.o.displayHeight));
        const y = Math.max(18, top - 26 - (labels[1] ? (W < 760 ? 22 : 28) : 0));
        ncLabel = sc.add.text(Math.max(48, Math.min(W - 48, x)), y, '반격 없음', textStyle(W < 760 ? 13 : 17, '#D8D2C4', { fontStyle: 'bold', stroke: '#0B1020', strokeThickness: 4 })).setOrigin(0.5).setAlpha(0);
        cs.stage.add(ncLabel);
    }
    cs.micro = { tl, objs, layer, fxG, barG, dustG, dustLo: 0, dustDrawn: 0, dustCleared: 0, uw: 0, band: view ? { groundTop: view.groundTop, groundBot: view.groundBot } : { groundTop: 0, groundBot: cs.SH }, labels, ncLabel, toX, toY, sx, fxK: tl.choreo ? CHOREO.UNIT_SCALE : 1, hp: tl.ents.map((e) => e.hp0), hitPtr: 0, projPtr: 0, deathPtr: 0, fx: [], hitCount: 0 };
    // 실시간 병력 표시 기준: 진영별 시작 HP 합·최종 HP 합(e)
    cs.micro.hud = [0, 1].map((side) => {
        const ids = tl.ents.filter((e) => e.side === side).map((e) => e.i);
        return { ids, hp0: ids.reduce((a, i) => a + tl.ents[i].hp0, 0), fin: ids.reduce((a, i) => a + (tl.finalHp[i] ?? 0), 0), v: null };
    });
    // 사망 시각(화면 ms): 안무 = 쓰러뜨린 타격 시각, sim = 사망 틱 변환
    cs.micro.deaths = tl.choreo ? tl.deaths.slice() : tl.deathTick.map((t, i) => (t == null ? null : { ms: tl.warp.real(t * tl.tickMs), i })).filter(Boolean).sort((p, q) => p.ms - q.ms);
    render(cs, 0);
}

// 타격의 화면 시각(ms): 안무 = 배정 시각 at, sim = 틱 변환
const hitMs = (tl, h) => (tl.choreo ? h.at : tl.warp.real(h.tick * tl.tickMs));
// 개체 위치(서브유닛) at 화면 ms: 안무 경로 또는 sim(rt 경로/서버 k)
const posMs = (tl, e, tMs) => (tl.choreo ? choreoPosAt(e, tMs) : microPosMs(tl, e, tMs));

// 화면 시각 tMs 의 화면. 위치는 시뮬 시각(warp.sim)으로, 효과 길이는 화면 시각으로 계산. 이벤트(타격·투사체·사망)는 시각이 지날 때 한 번씩 처리(시각은 단조 증가)
function render(cs, tMs) {
    const M = cs.micro; const { tl, objs } = M;
    // 투사체 출발(원거리 타격: 타격 시각 PROJ_MS 전). 안무 = 공격 진영 역할로 근접/원거리 확정(h.melee), sim = 서버 위치 거리
    const PF = tl.choreo ? CHOREO.ARROW_FLIGHT_MS : PROJ_MS; // 안무 화살은 호가 보이게 더 길게 난다(도착 = 타격 시각 그대로)
    while (M.projPtr < tl.hits.length && hitMs(tl, tl.hits[M.projPtr]) - PF <= tMs) {
        const h = tl.hits[M.projPtr]; M.projPtr += 1;
        const at = hitMs(tl, h);
        let ranged;
        if (tl.choreo) ranged = !h.melee && !h.silent; // silent = 원거리 방어자 무반격 연출(피해만 반영)
        else { const pa = microPosAt(tl.ents[h.a], h.tick); const pb = microPosAt(tl.ents[h.b], h.tick); ranged = Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y) > MELEE_SUB; h.melee = !ranged; }
        if (ranged) M.fx.push({ kind: 'proj', a: h.a, b: h.b, t0: at - PF, t1: at });
    }
    // 타격 적용: 대상 남은 HP·흰 깜빡임, 근접 공격자 찌르기, 불꽃
    while (M.hitPtr < tl.hits.length && hitMs(tl, tl.hits[M.hitPtr]) <= tMs) {
        const h = tl.hits[M.hitPtr]; M.hitPtr += 1;
        M.hp[h.b] = tl.choreo ? Math.min(M.hp[h.b], h.hpAfter) : h.hpAfter; // 안무는 같은 대상 타격 순서가 서버와 다를 수 있어 최저값 유지(최종 = 서버 마지막 hp_after)
        const at = hitMs(tl, h);
        objs[h.b].flashAt = at;
        if (h.melee && !h.silent) {
            const pa = posMs(tl, tl.ents[h.a], at); const pb = posMs(tl, tl.ents[h.b], at); // 화면 위치 기준 방향(안무/rt 복귀 반영)
            const dx = pb.x - pa.x; const dy = pb.y - pa.y; const len = Math.hypot(dx, dy) || 1;
            objs[h.a].lungeAt = at; objs[h.a].lunge = { x: dx / len, y: dy / len };
            M.fx.push({ kind: 'spark', b: h.b, t0: at, t1: at + SPARK_MS });
        }
        M.hitCount += 1;
        if (M.hitCount === 1) cs.microFirstHit?.();
        if (M.hitCount % 3 === 1) cs.sfx?.oneShot?.('sfx_battle_clash', 0.16, 1.2 + (M.hitCount % 5) * 0.06);
        if (h.hpAfter > 0 && cs.sfx?.voice) { try { cs.sfx.voice.hurt(tl.ents[h.b].side, at, M.deaths.some((d) => d.ms >= at && d.ms <= at + 120)); } catch { /* 음성 오류 무시 */ } } // 비치명 피격 음성(확률·간격·상한은 BattleVoice)
    }
    while (M.deathPtr < M.deaths.length && M.deaths[M.deathPtr].ms <= tMs) {
        const dd = M.deaths[M.deathPtr]; M.deathPtr += 1;
        const at = dd.ms;
        objs[dd.i].deadAt = at;
        if (cs.sfx?.voice) { try { const side = tl.ents[dd.i].side; cs.sfx.voice.death(side, at, objs.every((q) => q.e.side !== side || q.deadAt != null)); } catch { /* 음성 오류 무시 */ } } // 사망 비명 / 진영 전멸(rout)
        M.fx.push({ kind: 'blood', b: dd.i, t0: at, t1: at + BLOOD_MS, big: !!tl.choreo }); // 안무: 쓰러뜨린 순간 피 효과 강화(크기·개수)
    }
    liveHud(cs);
    // 개체 위치·모션
    objs.forEach((q) => {
        const p = posMs(tl, q.e, tMs); // 안무 경로 / sim: rt 경로 우선, 없으면 서버 k
        let x = M.toX(p.x); let y = M.toY(p.y);
        const amp = tl.choreo ? Math.min(CHOREO.LUNGE_SUB * M.sx, q.o.displayWidth * 0.8) : Math.min(12, q.o.displayWidth * 0.22); // 안무 = 대열 간격을 메우는 찌르기
        const lt = (tMs - q.lungeAt) / LUNGE_MS;
        if (lt >= 0 && lt < 1) { const s = Math.sin(Math.PI * lt) * amp; x += q.lunge.x * s; y += q.lunge.y * s * 0.5; }
        if (p.moving) y -= Math.abs(Math.sin(tMs / 55 + q.e.i)) * 3 * M.fxK; // 걷기 흔들림
        let alpha = 1; let angle = 0;
        const kn = tl.choreo && q.deadAt != null ? q.e.knock : null;
        if (kn) { // 안무 사망 넉백: 튕김(KNOCKBACK_MS, 감속 수평 이동 + 포물선 + 기울기) -> 착지 후 쓰러짐(80도)·사라짐(DEATH_MS)
            const el = tMs - q.deadAt; const KB = CHOREO.KNOCKBACK_MS;
            const u = clamp01(el / KB); const eo = 1 - (1 - u) * (1 - u);
            x += kn.dx * M.sx * eo; y -= Math.sin(Math.PI * u) * kn.lift * q.o.displayHeight;
            if (el < KB) angle = kn.sign * kn.tilt * u;
            else { const dt = clamp01((el - KB) / DEATH_MS); angle = kn.sign * (kn.tilt + (80 - kn.tilt) * Math.min(1, dt / 0.35)); alpha = 1 - clamp01((dt - 0.35) / 0.65) ** 2; }
        } else if (q.deadAt != null) {
            const dt = clamp01((tMs - q.deadAt) / DEATH_MS);
            x -= q.dir * 22 * M.fxK * dt; y -= Math.sin(Math.PI * dt) * 14 * M.fxK; angle = -q.dir * 80 * dt; alpha = 1 - dt * dt;
        }
        q.o.setPosition(x, y); q.o.angle = angle; q.o.alpha = alpha;
        if (tl.choreo && q.o.setFlipX) { const f = q.flip0 !== (!!p.back && q.deadAt == null); if (q.o.flipX !== f) q.o.setFlipX(f); } // 안무 복귀 이동 중엔 뒤돌아 달린다
        const flash = tMs - q.flashAt >= 0 && tMs - q.flashAt < FLASH_MS && q.deadAt == null;
        if (flash !== q.tinted && q.o.setTint) { q.tinted = flash; if (flash) { q.o.setTint(0xffffff); q.o.setTintMode?.(Phaser.TintModes?.FILL ?? 1); } else q.o.clearTint?.(); }
    });
    M.layer.sort('y'); // 아래가 앞
    drawDust(cs, tMs);
    // 효과(투사체·불꽃·피)
    const g = M.fxG; g.clear();
    M.fx = M.fx.filter((f) => tMs < f.t1 + 1);
    if (tl.choreo) arrowFrameStart(cs);
    M.fx.forEach((f) => {
        const pf = clamp01((tMs - f.t0) / Math.max(1, f.t1 - f.t0));
        if (tMs < f.t0) return;
        const b = objs[f.b].o; const by = b.y - b.displayHeight * 0.5;
        if (f.kind === 'proj' && tl.choreo) { drawArrow(cs, f, pf); return; }
        if (f.kind === 'proj') {
            const a = objs[f.a].o; const ax = a.x; const ay = a.y - a.displayHeight * 0.55;
            const x = ax + (b.x - ax) * pf; const y = ay + (by - ay) * pf - Math.sin(Math.PI * pf) * 10 * M.fxK;
            const ang = Math.atan2(by - ay, b.x - ax);
            const pl = 9 * M.fxK; g.lineStyle(Math.max(1, 2 * M.fxK), 0xfff4c8, 1).lineBetween(x - Math.cos(ang) * pl, y - Math.sin(ang) * pl, x, y);
        } else if (f.kind === 'spark') {
            g.fillStyle(0xffe9a8, 1 - pf);
            for (let j = 0; j < 4; j += 1) { const an = (j / 4) * Math.PI * 2 + f.b; const k = M.fxK; const r = (4 + pf * 12) * k; const sz = Math.max(2, 4 * k); g.fillRect(b.x + Math.cos(an) * r - sz / 2, by + Math.sin(an) * r * 0.6 - sz / 2, sz, sz); }
        } else if (f.kind === 'blood') {
            g.fillStyle(0xc8503c, 0.85 * (1 - pf));
            const nb = f.big ? 7 : 5; for (let j = 0; j < nb; j += 1) { const an = (j / nb) * Math.PI * 2; const k = M.fxK * (f.big ? 1.4 : 1); const r = (3 + pf * 16) * k; g.fillCircle(b.x + Math.cos(an) * r, by + Math.sin(an) * r * 0.5 - pf * 8 * k, Math.max(1.2, 2.5 * k)); }
        }
    });
    if (tl.choreo) arrowFrameEnd(cs);
    drawBars(cs);
    // 진형 이름
    M.labels.forEach((t) => {
        if (!t?.scene) return;
        t.alpha = tMs < LABEL_MS[0] ? tMs / LABEL_MS[0] : tMs < LABEL_MS[1] ? 1 : 1 - clamp01((tMs - LABEL_MS[1]) / (LABEL_MS[2] - LABEL_MS[1]));
    });
    if (M.ncLabel?.scene && M.hitCount > 0) { const t0 = hitMs(tl, tl.hits[0]); M.ncLabel.alpha = clamp01((tMs - t0) / 160); }
}

// 하단 패널 병력 숫자·바 실시간 감소(병사 쓰러짐마다 1단계, 영웅은 HP 비율). 값이 바뀔 때만 패널 갱신. 끝 정합은 runMicro settle(stepBar from = 현재 값 -> after)
function liveHud(cs) {
    const M = cs.micro;
    M.hud.forEach((h, side) => {
        const S = cs.sides?.[side];
        if (!S || !cs.microHud) return;
        const deaths = h.ids.reduce((a, i) => a + (M.objs[i].deadAt != null ? 1 : 0), 0);
        const hp = h.ids.reduce((a, i) => a + M.hp[i], 0);
        const v = microHudValue(S, deaths, hp, h.hp0, h.fin);
        if (h.v === v) return;
        h.v = v;
        if (v !== S.before || S.microV != null) cs.microHud(S, v);
    });
}

// ---- 안무 화살(깊이감): 그림자 = 지면 레이어(dustG 와 같은 높이의 shadowG), 화살 = 유닛 레이어의 작은 그래픽(y = 지면 궤적 점 -> 유닛과 같은 y 정렬) ----
function arrowFrameStart(cs) {
    const M = cs.micro;
    if (!M.arrowPool) M.arrowPool = [];
    M.arrowUsed = 0;
    if (!M.shadowG) { M.shadowG = cs.scene.add.graphics(); const li = cs.stage.getIndex(M.layer); if (typeof li === 'number' && li >= 0) cs.stage.addAt(M.shadowG, li); else cs.stage.add(M.shadowG); }
    M.shadowG.clear();
}
function drawArrow(cs, f, pf) {
    const M = cs.micro; const C = CHOREO;
    const qa = M.objs[f.a]; const qb = M.objs[f.b];
    const a = { x: qa.o.x, y: qa.o.y }; const b = { x: qb.o.x, y: qb.o.y }; // 발(원점 아래 가운데)
    const uh = qb.o.displayHeight || qa.o.displayHeight || 40;
    const ps = arrowPose(a, b, pf, uh, M.band);
    // 그림자(땅)
    const sg = M.shadowG;
    sg.lineStyle(Math.max(1, 2.2 * M.fxK * ps.k), C.ARROW_SHADOW_COLOR, ps.salpha)
        .lineBetween(ps.sx - Math.cos(ps.sang) * ps.slen, ps.sy - Math.sin(ps.sang) * ps.slen * 0.5, ps.sx, ps.sy);
    // 화살(유닛 레이어, 지면 궤적 y 로 정렬)
    let ag = M.arrowPool[M.arrowUsed];
    if (!ag) { ag = cs.scene.add.graphics(); M.layer.add(ag); M.arrowPool.push(ag); }
    M.arrowUsed += 1; M.arrowDrawn = (M.arrowDrawn ?? 0) + 1;
    ag.clear(); ag.setPosition(0, ps.gy); ag.setVisible(true);
    const ly = ps.y - ps.gy; // 그래픽 원점(지면 궤적 y) 기준 화살 끝 높이
    ag.lineStyle(Math.max(1, 2 * M.fxK * ps.k), 0xfff4c8, ps.alpha).lineBetween(ps.x - Math.cos(ps.ang) * ps.len, ly - Math.sin(ps.ang) * ps.len, ps.x, ly);
    ag.fillStyle(0xd8d0c0, ps.alpha).fillCircle(ps.x - Math.cos(ps.ang) * ps.len, ly - Math.sin(ps.ang) * ps.len, Math.max(0.8, 1.3 * M.fxK * ps.k)); // 깃
    M.arrowLog?.push({ gx: ps.gx, gy: ps.gy, y: ps.y });
}
function arrowFrameEnd(cs) {
    const M = cs.micro;
    for (let j = M.arrowUsed; j < (M.arrowPool?.length ?? 0); j += 1) { M.arrowPool[j].clear(); M.arrowPool[j].setVisible(false); }
}

// 이동 먼지 그리기(안무): 살아 있는 퍼프(t0 <= tMs < t0 + 수명)만, 동시 DUST_MAX 상한, 필드·화면 밖 생략
function drawDust(cs, tMs) {
    const M = cs.micro; const g = M.dustG; if (!g) return;
    const C = CHOREO; const list = M.tl.dust; g.clear();
    if (!M.uw) M.uw = Math.max(4, (M.objs[0]?.o?.displayWidth ?? 40));
    while (M.dustLo < list.length && list[M.dustLo].t + C.DUST_MS * 1.2 < tMs) M.dustLo += 1;
    let n = 0;
    for (let j = M.dustLo; j < list.length && list[j].t <= tMs && n < C.DUST_MAX; j += 1) {
        const d = list[j]; const life = C.DUST_MS * (0.8 + 0.4 * d.h);
        const age = (tMs - d.t) / life; if (age < 0 || age >= 1) continue;
        if (d.x < C.FIELD_X0 || d.x > C.FIELD_X1) continue;
        const w = M.uw * d.k;
        const x = M.toX(d.x) + d.dir * w * (0.15 + 0.5 * age) + (d.h - 0.5) * w * 0.3;
        const y = M.toY(d.y) - w * 0.08 - age * w * 0.3;
        if (x < -w || x > cs.W + w) continue;
        const r = w * (0.15 + 0.1 * d.h + (0.25 + 0.1 * d.h) * age);
        g.fillStyle(C.DUST_COLOR, 0.5 * (1 - age) * d.a).fillCircle(x, y, r);
        n += 1; M.dustDrawn += 1;
    }
}

// 개체 HP 막대(= HP / m). 살아 있으면 HP 가 아주 작아도(동시 전멸 방지 HP 1) 1px 는 보이게
function drawBars(cs) {
    const M = cs.micro; const g = M.barG; g.clear();
    M.objs.forEach((q, i) => {
        if (q.deadAt != null || q.o.alpha <= 0) return;
        const bw = Math.max(10, Math.min(40 * M.fxK, q.o.displayWidth * 0.6)); const bh = cs.W < 760 ? 3 : 4; // 막대 폭 = 유닛 폭 비례(안무 UNIT_SCALE 반영)
        const x = q.o.x - bw / 2; const y = q.o.y - q.o.displayHeight - bh - 3;
        const r = clamp01(M.hp[i] / q.e.max);
        g.fillStyle(0x05070d, 0.85).fillRect(x - 1, y - 1, bw + 2, bh + 2);
        const w = M.hp[i] > 0 ? Math.max(1, bw * r) : 0;
        if (w > 0) g.fillStyle(q.color, 1).fillRect(x, y, w, bh);
    });
}

// 최종 정합: end_tick 위치 + e(생존·남은 HP). 사망 기록이 없어도 e 에 없으면 쓰러진 것으로, 사망 기록이 있어도 e 에 있으면 서 있는 것으로(서버 e 우선)
function finalize(cs) {
    const M = cs.micro; const { tl, objs } = M;
    M.hitPtr = tl.hits.length; M.projPtr = tl.hits.length; M.deathPtr = M.deaths.length; M.fx = [];
    objs.forEach((q, i) => {
        const p = tl.choreo ? q.e.ctrk[q.e.ctrk.length - 1] : q.e.trk ? q.e.trk[q.e.trk.length - 1] : microPosAt(q.e, tl.endTick); // 안무 = 경로 끝(배치 위치), rt 개체 = 경로 끝, 그 외 = end_tick 의 k
        q.o.setPosition(M.toX(p.x), M.toY(p.y));
        if (q.o.setFlipX && q.o.flipX !== q.flip0) q.o.setFlipX(q.flip0);
        if (q.tinted) { q.tinted = false; q.o.clearTint?.(); }
        const alive = tl.finalHp[i] != null;
        M.hp[i] = alive ? tl.finalHp[i] : 0;
        q.deadAt = alive ? null : (q.deadAt ?? 0);
        q.o.angle = alive ? 0 : -q.dir * 80; q.o.alpha = alive ? 1 : 0;
    });
    M.layer.sort('y');
    M.fxG.clear();
    if (M.dustG) { M.dustG.clear(); M.dustCleared += 1; } // 탭 스킵·끝: 먼지 즉시 정리
    if (M.shadowG) M.shadowG.clear(); (M.arrowPool ?? []).forEach((ag) => { ag.clear(); ag.setVisible(false); }); // 화살·그림자 정리
    drawBars(cs);
    M.labels.forEach((t) => { if (t?.scene) t.alpha = 0; });
    if (M.ncLabel?.scene) M.ncLabel.alpha = 1;
}

// 재생: 진입 와이프 -> 개체 교전(end_tick 기준 길이) -> 최종 정합 + 패널 병력 숫자·바(서버 hp_after 기준 before -> after) -> 유지 -> 와이프아웃
export function runMicro(cs, finish, { holdMs, wipeIn, enterBlack, panelFade, out }) {
    const sc = cs.scene; const k = cs.k; const M = cs.micro;
    let ended = false;
    const end = () => { if (ended) return; ended = true; cs.destroy(); finish(); };
    const playMs = microPlayMs(M.tl); // 화면 ms
    const firstHitMs = M.tl.hits.length ? hitMs(M.tl, M.tl.hits[0]) : playMs;
    cs.sfx.collideAt = (enterBlack + wipeIn * k + firstHitMs) / 1000;
    cs.sfx.start();
    cs.microFirstHit = () => (cs.microImpact ? cs.microImpact() : cs.hitLine?.());
    const curtain = cs.curtain;
    const wipeOut = () => {
        curtain.setPosition(0, -cs.H).setVisible(true);
        tween(sc, { targets: curtain, to: { y: 0 }, duration: out, ease: 'Quad.easeIn', onComplete: end });
    };
    const settle = () => {
        if (cs.destroyed) { end(); return; }
        finalize(cs);
        cs.sides.forEach((s) => {
            if (s.countText?.scene) { s.countText.setText(String(s.after)); if (s.after < s.before) s.countText.setColor('#FF6B5A'); }
            cs.stepBar(s, k, s.microV ?? s.before); // 실시간 표시 값부터 서버 결과(after)까지(탭 스킵 포함 최종 일치)
        });
        wait(sc, holdMs * k, wipeOut);
    };
    cs.root.setAlpha(1);
    cs.panel.setAlpha(0);
    curtain.setPosition(0, 0).setVisible(true);
    wait(sc, enterBlack, () => {
        tween(sc, { targets: cs.panel, to: { alpha: 1 }, duration: panelFade });
        tween(sc, {
            targets: curtain, to: { y: cs.H }, duration: wipeIn * k, ease: 'Quad.easeIn',
            onComplete: () => {
                curtain.setVisible(false);
                cs.affinityRibbon?.();
                const p = { t: 0 };
                tween(sc, {
                    targets: p, to: { t: 1 }, duration: playMs, ease: 'Linear',
                    onUpdate: () => { if (!cs.destroyed) render(cs, p.t * playMs); },
                    onComplete: settle, // 탭 스킵(snapAll)도 여기로 와서 최종 정합
                });
            },
        });
    });
}
