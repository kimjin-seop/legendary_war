// 캠페인 흐름(FE 전용): 스테이지 메타 캐시 + 목표/별 조건/합류 영웅 문구 + 스테이지 전·후 대사 자동 재생 + 대사 시청 기록.
// 대사 데이터는 dialogueData.loadCampaign()(database/data 원본의 빌드 복사본, docker/sync_dialogue_data.mjs 로 동기화).
// 장면 timing: chapter_start(장 첫 스테이지 전) / before_battle(<stage>_pre) / after_clear(<stage>_post, 승리 시 1회) /
//             after_first_clear(<stage>_post, 첫 클리어 승리 시) / chapter_end·ending(장 마지막 스테이지 post 뒤) / epilogue(ending 뒤)
// 장 번호 = 스테이지 코드 ch<N>_ 의 N(오리지널 메인 스토리 1막 = ch101_s1~s5 -> loadCampaign(101))
// 시청 기록: 서버 API 가 없어 localStorage(계정별 키)에만 저장한다(BE 요청: 대사 진행 서버 저장). 기기를 바꾸면 다시 재생된다.
import { session } from '../api/client.js';
import { gameApi } from '../api/gameApi.js';
import { loadCampaign, heroNameKo, ensureHeroNames } from '../dialogue/dialogueData.js';
import { defeatHint } from '../systems/enemyComp.js';
import { withJosa } from '../systems/josa.js';
ensureHeroNames(); // 영웅 이름 표 미리(합류 안내 등 코드 노출 방지)

// ---------- 스테이지 메타 캐시(/api/stages 응답) ----------
const stageCache = new Map(); // id -> stage
export function rememberStages(list) { (list ?? []).forEach((s) => { if (s?.id != null) stageCache.set(Number(s.id), s); }); }
export function cachedStage(id) { return id == null ? null : stageCache.get(Number(id)) ?? null; }
// 이 스테이지 첫 클리어로 새로 열리는 스테이지(캐시 기준: 잠겨 있고 locked_by.id = stageId). 서버 결과에 해금 정보가 없어 로비 목록 캐시로 판정
export const stagesUnlockedBy = (stageId) => (stageId == null ? [] : [...stageCache.values()].filter((s) => !s.unlocked && Number(s.locked_by?.id) === Number(stageId)));
export async function stageById(id) {
    if (id == null) return null;
    if (!stageCache.has(Number(id))) { try { rememberStages(await gameApi.stages()); } catch { return null; } }
    return cachedStage(id);
}

// ---------- 표시 문구 ----------
// 합류 영웅 이름: 서버 join_hero/joined_heroes 는 code 만 준다(BE 요청: 이름 포함). 보유 영웅 캐시 > ch1 고정 표 > code
const CH1_HERO_NAMES = { yi_sun_sin: '이순신', gwak_jae_u: '곽재우', kim_si_min: '김시민', hyujeong: '휴정', yujeong: '유정', gwon_yul: '권율' };
export function heroNameOf(code) {
    const h = (session.heroes ?? []).find((x) => x.hero === code || x.code === code);
    return h?.name_ko ?? h?.name ?? CH1_HERO_NAMES[code] ?? heroNameKo(code) ?? code;
}

// capture(거점 점령): points 가 'map'(맵 objective_points 사용)이면 개수 미상 -> '목표 지점'. hold_turns 0 = 도달 즉시
const capturePts = (obj) => (Array.isArray(obj?.points) ? obj.points.length : null);
export function objectiveText(obj) {
    if (obj?.type === 'survive_turns') return `${obj.turns ?? obj.value ?? '?'}턴 동안 지휘관 생존`;
    if (obj?.type === 'capture') { const n = capturePts(obj); const h = Number(obj.hold_turns) || 0; return `${n ? `거점 ${n}곳 중 ${obj.mode === 'all' ? '전부' : '1곳'}` : '목표 지점'} ${h ? `${h}턴 점령 유지` : '점령'}${obj.by === 'commander' ? '(지휘관)' : ''}`; }
    return '적 지휘관 격파';
}
// 승패 규칙(stage_rules)을 반영한 목표 문구 줄(전투 시작 카드·로비 출정 팝업·카드 목록 공용). rules 형식:
//   전투 view stage_rules {mode:'all'|'only'|'default', conditions[{label}]} 또는 스테이지 rules 원본 {win_mode, win_conditions[{label}]}.
//   only = 추가 조건 라벨만(기본 목표 불인정), all = 기본 목표 + 라벨, 그 외 = 기본 목표(fallback 이 있으면 지휘관 격파 기본형에 그 문구)
export function normRules(r) { if (!r || typeof r !== 'object') return null; return r.win_mode ? { mode: r.win_mode, conditions: r.win_conditions } : r.mode ? r : null; }
export function goalLines(objective, rules, fallback = null) {
    const sr = normRules(rules);
    const labels = (Array.isArray(sr?.conditions) ? sr.conditions : []).map((c) => (typeof c?.label === 'string' ? c.label.trim() : '')).filter(Boolean);
    const custom = objective?.type === 'capture' || objective?.type === 'survive_turns';
    const base = custom || !fallback?.length ? [objectiveText(objective)] : fallback;
    if (sr?.mode === 'only' && labels.length) return labels;
    if (sr?.mode === 'all' && labels.length) return [base[0], ...labels];
    return base;
}
export const objectiveShort = (obj) => (obj?.type === 'survive_turns' ? `${obj.turns ?? obj.value ?? '?'}턴 생존` : obj?.type === 'capture' ? `거점 점령${Number(obj.hold_turns) ? ` ${obj.hold_turns}턴` : ''}` : '지휘관 격파');

// stage(선택): sub_objective 라벨 조회용. c.label > stage.rules.sub_objectives / stage.sub_objectives 의 같은 id label > '보조 목표 달성'.
// /api/stages 응답 sub_objectives:[{id,label,type}](박백엔 2026-11-03)를 우선 사용, 없으면 rules.sub_objectives. 원시 type 문자열은 화면에 내지 않는다(미지의 type = '추가 조건 달성')
const subObjOf = (stage, id) => [...(stage?.sub_objectives ?? []), ...(stage?.rules?.sub_objectives ?? [])].find((o) => o?.id === id);
export function starCondText(c, stage = null) {
    const v = c?.value;
    switch (c?.type) {
        case 'clear': return '승리';
        case 'all_alive': return '아군 전원 생존';
        case 'turn_within': return `${v}턴 이내 승리`;
        case 'commander_hp_pct_min': return `지휘관 병력 ${v}% 이상 유지`;
        case 'sub_objective': { const lb = c?.label || subObjOf(stage, c?.id)?.label; return lb ? `${lb} 달성` : '보조 목표 달성'; }
        default: return '추가 조건 달성';
    }
}
// star_conditions 가 null 인 기존 스테이지는 서버 하드코딩 규칙(승리 / 지휘관 HP 50% 이상 / 15턴 이하) — BattleService::finalize 기준
export const DEFAULT_STAR_CONDS = [{ type: 'clear' }, { type: 'commander_hp_pct_min', value: 50 }, { type: 'turn_within', value: 15 }];
export const starCondsOf = (stage) => (Array.isArray(stage?.star_conditions) && stage.star_conditions.length ? stage.star_conditions : DEFAULT_STAR_CONDS);

// 결과창 슬롯용 문구(데이터 없으면 빈 배열 = 기존 결과창과 동일)
// ctx(선택, 패배 힌트용): { win, abandoned, mode('room'|'war'|...), rulesMode(stage_rules.mode), enemyUnits[{type,non_hero}] }
export function resultExtraLines(result, ctx = null) {
    const out = [];
    if (Array.isArray(result?.star_detail) && result.star_detail.length) {
        out.push({ kind: 'stars', text: result.star_detail.map((d) => `${d.met ? '★' : '☆'} ${starCondText(d)}`).join('   ') });
    }
    // 상성 유리 처치 횟수: 서버 result.affinity_kills(아군 상성 유리 공격 처치, 반격 제외)만 사용. 필드 없음·0 이면 줄 숨김(클라 집계로 대체하지 않음)
    const ak = Number(result?.affinity_kills);
    if (result?.affinity_kills != null && Number.isFinite(ak) && ak > 0) out.push({ kind: 'aff', text: `상성 유리 처치 ${ak}회` });
    const joined = Array.isArray(result?.joined_heroes) ? result.joined_heroes : [];
    if (joined.length) {
        const names = joined.map((j) => `${heroNameOf(j.hero)}${j.is_new ? '' : '(이미 보유)'}`).join(', ');
        out.push({ kind: 'join', text: `새 영웅 합류: ${names}` });
    }
    // 패배 상성 힌트(서버 변경 없음): 지금까지 나온 적 편성 + MATCHUPS. 방 대전·시즌 전쟁·포기·only 규칙(격파와 무관한 승리 조건)은 숨김
    if (ctx && !ctx.win && !ctx.abandoned && ctx.mode !== 'room' && ctx.mode !== 'war' && ctx.rulesMode !== 'only') {
        // 아군 병종(보유 영웅 영웅·부대 병종 + 이번 전투 아군 유닛): 유리 병종이 없으면 defeatHint 가 일반 조언으로 바꾼다
        const own = [...(session.heroes ?? []).flatMap((h) => [h?.troop_type, h?.detail?.unit_type]), ...(ctx.allyUnits ?? []).map((u) => u?.type)].filter(Boolean);
        const hint = defeatHint(ctx.enemyUnits, own);
        if (hint) out.push({ kind: 'hint', text: hint });
    }
    return out;
}

// 패배 결과창 패인 한 줄(battleStore s.endCause = battle_end reason/label + 직전에 쓰러진 아군). 판단할 수 없으면 null(줄 숨김)
export function defeatCauseText(ec) {
    if (!ec) return null;
    if (ec.reason === 'commander_defeated' && ec.down?.name) return `${ec.down.kind === 'commander' ? '지휘관' : '필수 생존 유닛'} ${withJosa(ec.down.name, '이/가')} ${ec.down.turn ? `${ec.down.turn}턴에 ` : ''}쓰러졌습니다`;
    if (ec.reason === 'objective_lost' && ec.label) return `패배 조건: ${ec.label}`;
    if (ec.reason === 'turn_limit') return '제한 턴 안에 승리 조건을 채우지 못했습니다';
    return null;
}

// ---------- 대사 시청 기록(localStorage, 계정별) ----------
const seenKey = () => `srpg.campaign.seen.v1.${session.user?.id ?? session.user?.name ?? 'anon'}`;
function seenSet() { try { return new Set(JSON.parse(localStorage.getItem(seenKey()) ?? '[]')); } catch { return new Set(); } }
export const isSeen = (id) => seenSet().has(id);
export function markSeen(id) {
    try { const s = seenSet(); s.add(id); localStorage.setItem(seenKey(), JSON.stringify([...s])); } catch { /* 저장 불가 환경: 매번 재생 */ }
}

const chapterOfCode = (code) => Number(/^ch(\d+)_/.exec(code ?? '')?.[1] ?? 0);

async function scenesFor(code) {
    const ch = chapterOfCode(code);
    if (!ch) return { list: [], all: [] };
    try {
        const d = await loadCampaign(ch);
        const all = d?.scenes ?? [];
        return { list: all.filter((s) => s.stage_code === code), all };
    } catch (e) { console.warn('[campaign] 대사 데이터 로드 실패', e); return { list: [], all: [] }; }
}

// 대사 장면 id 목록 -> 차례로 재생 후 next 로. 각 장면은 시작 시 seen 으로 기록(스킵해도 다시 재생하지 않음)
function chain(ids, next, chapter) {
    let n = next;
    for (let i = ids.length - 1; i >= 0; i -= 1) n = { scene: 'Dialogue', data: { source: 'campaign', chapter, id: ids[i], next: n } };
    return n;
}
function go(scene, target) { scene.scene.start(target.scene, target.data); }

// 배치 전: (장 첫 스테이지면 chapter_start) + <code>_pre 를 미시청일 때 재생 후 next(Deploy) 로 이동. 재생할 것이 없으면 바로 next.
export async function playBeforeStage(scene, stage, next) {
    const code = stage?.code ?? '';
    const { list, all } = await scenesFor(code);
    const ids = [];
    const firstStage = all.find((s) => s.stage_code)?.stage_code;
    const open = all.find((s) => s.timing === 'chapter_start');
    if (open && code === firstStage && !isSeen(open.id)) ids.push(open.id);
    // 같은 스테이지의 before_battle 장면이 여럿이면(ch12_s3 = 막간 ch12_i1 2줄 + ch12_s3_pre 16줄) 파일 순서대로 모두 재생 — 이전엔 첫 장면만 재생해 2줄 뒤 바로 전투로 넘어갔다
    list.filter((s) => s.timing === 'before_battle').forEach((pre) => { if (!isSeen(pre.id)) ids.push(pre.id); });
    ids.forEach(markSeen);
    if (!scene.sys?.isActive?.()) return;
    go(scene, ids.length ? chain(ids, next, chapterOfCode(code)) : next);
}

// 결과 후: 승리면 <code>_post(after_clear 미시청 / after_first_clear 는 첫 클리어) + 장 마지막 스테이지면 chapter_end 를 재생 후 next.
export async function playAfterStage(scene, stageId, result, next) {
    const stage = result?.win ? await stageById(stageId) : null;
    const code = stage?.code ?? '';
    const ids = [];
    if (code) {
        const { list, all } = await scenesFor(code);
        // 같은 스테이지의 post 장면이 여럿이면(3막 a3e5_post/post2) 파일 순서대로 모두 재생
        list.filter((s) => s.timing === 'after_clear' || s.timing === 'after_first_clear')
            .forEach((post) => { if (!isSeen(post.id) && (post.timing === 'after_clear' || result?.first_clear)) ids.push(post.id); });
        const lastStage = [...all].reverse().find((s) => s.stage_code)?.stage_code;
        // 장 마무리: chapter_end·ending(4막 a4_ending, chapter_end 동의어) 파일 순서 -> epilogue(4막 a4_epilogue) 순
        if (code === lastStage) {
            const ends = [...all.filter((s) => s.timing === 'chapter_end' || s.timing === 'ending'), ...all.filter((s) => s.timing === 'epilogue')];
            ends.forEach((end) => { if (!isSeen(end.id)) ids.push(end.id); });
        }
    }
    ids.forEach(markSeen);
    if (!scene.sys?.isActive?.()) return;
    go(scene, ids.length ? chain(ids, next, chapterOfCode(code)) : next);
}
