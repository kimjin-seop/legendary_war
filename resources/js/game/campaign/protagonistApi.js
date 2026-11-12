// 주인공(캐릭터 생성) API 호출부. 계약(BE ProtagonistController/ProtagonistService 기준):
//   GET  /api/protagonist      -> { protagonist: { available, created, needed, display_name, gender(male|female), face, portrait, class, source,
//                                  resonance{class,resonance,summary}, scores, hero{...}, retest{daily_limit,used_today,remaining,allow_gender_change},
//                                  options{genders, faces{male:[..],female:[..]}, classes[{class,resonance,summary}], default_class}, quiz{version, questions[{id,text,options[{id,text}]}]} } }
//   POST /api/protagonist      body { mode:'quiz', answers:{q1:'a',...}(전 문항) } | { mode:'manual', class } | { mode:'skip' } (+ gender?, face?)
//                              -> { protagonist: (위와 같음, quiz 제외) }. 오류 422 invalid_face/invalid_answers/invalid_class/gender_locked, 429 protagonist_retest_limit
//   PUT  /api/protagonist/face body { face } -> { protagonist } (초상화만 즉시 변경, 미생성 409 protagonist_not_created)
//   GET  /api/profile          -> profile.protagonist_needed (true 면 첫 로그인 진입 유도)
// 서버 값이 단일 출처. FE 내부 성별 표기는 'm'|'f'(대사 portrait.protagonist_<m|f> 규약), 서버로 보낼 때 male|female 로 바꾼다.
import { api } from '../api/client.js';

const G_IN = { male: 'm', female: 'f', m: 'm', f: 'f' };
const G_OUT = { m: 'male', f: 'female' };
export const toFeGender = (g) => G_IN[String(g ?? '').toLowerCase()] ?? null;
export const toServerGender = (g) => G_OUT[toFeGender(g)] ?? undefined;

function normalizeQuiz(q) {
    const items = Array.isArray(q?.questions) ? q.questions : [];
    const questions = items
        .map((x) => ({ id: String(x?.id ?? ''), text: String(x?.text ?? ''), choices: (Array.isArray(x?.options) ? x.options : []).map((o) => ({ id: String(o?.id ?? ''), text: String(o?.text ?? '') })).filter((o) => o.id) }))
        .filter((x) => x.id && x.choices.length);
    return questions.length ? { version: Number(q?.version ?? 1), questions } : null;
}

// 서버 protagonist 객체 -> FE 모델. 표시 데이터(클래스·초상화 후보·문항)는 모두 서버 options/quiz 에서 온다
export function normalizeState(p) {
    if (!p || typeof p !== 'object') return null;
    const o = p.options ?? {};
    const faces = { m: [], f: [] };
    Object.entries(o.faces ?? {}).forEach(([g, list]) => { const k = toFeGender(g); if (k && Array.isArray(list)) faces[k] = list.map(String); });
    const classes = (Array.isArray(o.classes) ? o.classes : []).map((c) => ({ code: String(c?.class ?? ''), resonance: c?.resonance ?? null, summary: c?.summary ?? null })).filter((c) => c.code);
    const r = p.retest ?? {};
    return {
        available: p.available !== false,
        created: !!p.created,
        needed: !!p.needed,
        displayName: p.display_name ?? null,
        gender: toFeGender(p.gender),
        face: p.face ?? null,
        portrait: p.portrait ?? null,
        cls: p.class ?? null,
        source: p.source ?? null, // quiz | manual | skip | auto
        resonance: p.resonance ?? null,
        scores: p.scores ?? null,
        hero: p.hero ?? null,
        retest: { limit: Number(r.daily_limit ?? 0), used: Number(r.used_today ?? 0), remaining: r.remaining == null ? null : Number(r.remaining), allowGenderChange: r.allow_gender_change !== false },
        genders: (Array.isArray(o.genders) ? o.genders : ['male', 'female']).map(toFeGender).filter(Boolean),
        faces,
        classes,
        defaultClass: o.default_class ?? classes[0]?.code ?? null,
        quiz: normalizeQuiz(p.quiz),
    };
}

// 저장 응답에는 quiz 가 없으므로 이전 상태의 quiz 를 유지
export const mergeState = (prev, next) => (next ? { ...next, quiz: next.quiz ?? prev?.quiz ?? null } : prev);

export async function getProtagonist() {
    const d = await api('GET', '/api/protagonist', { retry: 0 });
    return normalizeState(d?.protagonist);
}

// payload: { mode:'quiz', answers:{qid:optionId} } | { mode:'manual', cls } | { mode:'skip' } + gender?('m'|'f'), face?
export function buildSaveBody(payload) {
    const body = { mode: payload.mode };
    const g = toServerGender(payload.gender);
    if (g) body.gender = g;
    if (payload.face) body.face = payload.face;
    if (payload.mode === 'quiz') body.answers = { ...(payload.answers ?? {}) };
    if (payload.mode === 'manual') body.class = payload.cls;
    return body;
}
export async function saveProtagonist(payload) {
    const d = await api('POST', '/api/protagonist', { body: buildSaveBody(payload), retry: 0 });
    return normalizeState(d?.protagonist);
}

export async function changeFace(face) {
    const d = await api('PUT', '/api/protagonist/face', { body: { face }, retry: 0 });
    return normalizeState(d?.protagonist);
}

// 첫 로그인 진입 유도: 서버 profile.protagonist_needed 만 따른다(게스트·미배포는 서버가 false)
export const protagonistNeeded = (profile) => profile?.protagonist_needed === true;
