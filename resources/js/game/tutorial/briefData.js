// 시오리 브리핑 문구 로더(2026-11-14). 우선 = data/dialogue/shiori_brief.json(송서사 작성: { entries:[{ id, trigger, pages:[{ expr, lines }] }], tokens, skip_modal }),
// 없거나 해당 id 가 없으면 기존 tutorial_guide.json 문구로 폴백(문장 2개씩 페이지로 나눔).
// 파일이 아직 없어도 빌드가 깨지지 않도록 import.meta.glob 사용(dialogueData.js ch25/ch26 과 같은 방식).
import { session } from '../api/client.js';

export const SHIORI_EXPRS = ['neutral', 'smile', 'surprise', 'serious', 'cheer', 'regret']; // dialogue/portraitStage.js 와 같은 목록(대사 모듈 의존을 피하려 복사)

const BRIEF_FILE = import.meta.glob('../data/dialogue/shiori_brief.json');

// 기존 키 -> shiori_brief.json id(2026-11-14 전수 대응: 파일 entries[].trigger 기준).
//  concept:<C_id> = 개념 팝업, hint:<stage>:<kind> = 스테이지 안내, guide:<G_id> = 전투 조작 안내 단계, guide:<G_id>:follow = 후속 말풍선(follow_up_bubble)
//  값 = 후보 배열(앞에서부터 처음 찾은 것) 또는 { all:[...] }(찾은 항목의 페이지를 모두 이어 붙임: 원래 줄 배열 하나 = 여러 항목)
export const BRIEF_ID_MAP = {
    'concept:C_affinity': ['brief_c_affinity'],
    'concept:C_aura': ['brief_c_aura'],
    'concept:C_terrain': ['brief_c_terrain'],
    'concept:C_facing': ['brief_c_facing'],
    'concept:C_cost': ['brief_c_cost'],
    'concept:C_hero_down': ['brief_c_hero_down'],
    'concept:C_victory_result': ['brief_c_victory'],
    'concept:C_gacha': ['brief_c_gacha'],
    'hint:ch1_s1:deploy': ['brief_ch1s1_deploy'],
    'hint:stage_01:battle': { all: ['brief_stage01_numbers', 'brief_stage01_wait', 'brief_stage01_squads', 'brief_stage01_lose'] },
    'guide:G1_goal_banner': ['brief_g1_goal'],
    'guide:G2_select_unit': ['brief_g2_select'],
    'guide:G3_move': ['brief_g3_move'],
    'guide:G4_attack': ['brief_g4_attack'],
    'guide:G4_attack:follow': ['brief_g4_attack_confirm'],
    'guide:G4b_wait_no_target': ['brief_g4b_wait'],
    'guide:G4c_facing': ['brief_g4c_facing'],
    'guide:G4d_move_others': ['brief_g4d_others'],
    'guide:G5_end_turn': ['brief_g5_end_turn'],
};
// 표에 없는 키도 규칙 이름으로 한 번 더 찾음(concept:C_x -> brief_c_x, hint:ch1_s1:deploy -> brief_ch1s1_deploy)
const autoId = (key) => {
    const [kind, a, b] = key.split(':');
    if (kind === 'concept' && a) return [`brief_${a.toLowerCase()}`];
    if (kind === 'hint' && a && b) return [`brief_${a.replace(/_/g, '')}_${b}`];
    return [];
};

const validExpr = (e) => (SHIORI_EXPRS.includes(e) ? e : 'neutral');

// 줄 배열 -> 한 페이지 2문장 이내 페이지들
export function linesToPages(lines, expr = 'neutral') {
    const sents = (lines ?? []).flatMap((ln) => String(ln ?? '').split(/(?<=[.!?。])\s+/)).map((s) => s.trim()).filter(Boolean);
    const pages = [];
    for (let i = 0; i < sents.length; i += 2) pages.push({ expr: validExpr(expr), lines: sents.slice(i, i + 2) });
    return pages;
}

const normPages = (pages) => (Array.isArray(pages) ? pages : [])
    .map((p) => ({ expr: validExpr(p?.expr), lines: (Array.isArray(p?.lines) ? p.lines : [p?.lines]).map((s) => String(s ?? '').trim()).filter(Boolean) }))
    .filter((p) => p.lines.length);

let briefsP = null;
let briefMeta = null; // { skip_modal }
export function loadBriefs() {
    if (!briefsP) {
        const fn = BRIEF_FILE['../data/dialogue/shiori_brief.json'];
        briefsP = (fn ? fn() : Promise.resolve(null)).then((m) => {
            const d = m?.default ?? m;
            const arr = Array.isArray(d) ? d : (d?.entries ?? d?.briefs ?? d?.items ?? (d && typeof d === 'object' ? Object.values(d).find(Array.isArray) : null) ?? []);
            const map = new Map();
            arr.forEach((e) => { const pages = normPages(e?.pages); if (e?.id && pages.length) map.set(String(e.id), { ...e, pages }); });
            briefMeta = { skip_modal: d?.skip_modal ?? null };
            return map;
        }).catch((e) => { console.warn('[brief] shiori_brief.json 로드 실패(기존 문구 사용)', e); return new Map(); });
    }
    return briefsP;
}

// 조작 안내 '건너뛰기' 확인 문구(shiori_brief.json skip_modal) — 없으면 null
export async function briefSkip() { await loadBriefs(); return briefMeta?.skip_modal ?? null; }

const warned = new Set();
const warnMiss = (key) => { if (import.meta.env?.DEV && !warned.has(key)) { warned.add(key); console.warn(`[brief] shiori_brief.json 미매핑 -> 기존 문구 폴백: ${key}`); } };

// 기존 키의 브리핑 항목(파일에 있으면) — 없으면 null. { all } 키는 찾은 항목들의 페이지를 이어 붙인 항목
export async function briefFor(key) {
    const map = await loadBriefs();
    const ent = BRIEF_ID_MAP[key];
    if (ent && !Array.isArray(ent) && Array.isArray(ent.all)) {
        const found = ent.all.map((id) => map.get(id)).filter(Boolean);
        if (found.length) return { id: found.map((e) => e.id).join('+'), parts: found, pages: found.flatMap((e) => e.pages) };
    } else {
        for (const id of [...(ent ?? []), ...autoId(key)]) if (map.has(id)) return map.get(id);
    }
    if (map.size) warnMiss(key);
    return null;
}

// 토큰 치환({name}). 값이 없는 토큰이 든 문장은 빼고(줄 안에서 문장 단위), 빈 줄·빈 페이지는 버린다 -> 전투 밖(다시 보기)에서도 '{…}'가 그대로 보이지 않음
const TOKEN_RE = /\{(\w+)(?::[^}]*)?\}/g;
export function fillBriefLines(lines, tokens = {}) {
    return (lines ?? []).map((ln) => String(ln ?? '')
        .split(/(?<=[.!?。])\s+/)
        .map((s) => s.replace(TOKEN_RE, (m, k) => (tokens[k] == null || tokens[k] === '' ? m : String(tokens[k]))))
        .filter((s) => !/\{\w+(:[^}]*)?\}/.test(s))
        .join(' ').trim()).filter(Boolean);
}
// 페이지: 줄 하나가 통째로 빠지면(예: '{lose_rule}' 줄만 있는 페이지의 '한 가지만 기억해 두십시오.') 앞말만 남으므로 그 페이지를 버린다
export function fillBriefPages(pages, tokens = {}) {
    return (pages ?? []).map((p) => {
        const lines = fillBriefLines(p.lines, tokens);
        return lines.length === p.lines.length ? { ...p, lines } : null;
    }).filter((p) => p?.lines.length);
}

// 전투 밖에서도 알 수 있는 토큰 기본값(현재 계정 출전 코스트 상한). 호출부 tokens 가 우선
const baseTokens = () => ({ max_cost: session?.profile?.max_cost ?? null });

// 파일 우선 페이지(토큰 치환), 없거나 치환 뒤 비면 폴백 줄로 페이지 구성
export async function briefPages(key, fallbackLines, fallbackExpr = 'neutral', tokens = {}) {
    const b = await briefFor(key);
    if (b) {
        const pages = fillBriefPages(b.pages, { ...baseTokens(), ...tokens });
        if (pages.length) return pages;
    }
    return linesToPages(fillBriefLines(fallbackLines, { ...baseTokens(), ...tokens }), fallbackExpr);
}
