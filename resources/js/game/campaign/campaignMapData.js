// 캠페인 지도 데이터: 지도 메타 로드 + stages 응답에서 캠페인(장) 묶음 파생.
// - 메타 출처(임시): data/shelf_map_meta.json(송서사, 스키마 database/data/SHELF_MAP_META_SPEC.md) 사본.
//   BE 가 stages() 응답에 지도 메타를 노출하면 loadCampaignMapMeta 만 교체한다(호출 측은 같은 모양의 meta 를 받는다).
// - factions[{id, name_ko, side(ally|enemy|neutral), label_pos{x,y}}]·period{as_of, state_label[]} 는 선택 필드(없어도 동작).
//   지도 라벨은 전부 코드 텍스트(에셋에 글자 없음), 당대 국가·세력명(label_policy).
// - 준비 중 장(shelf.status placeholder|preview, 또는 stages 응답에 스테이지 없음, 예: ch11~ch20): 활성 캠페인과 같은 연출(카메라·핀·세력 라벨·영토·영웅 칩·요약)로
//   미리 보여 주고 출정만 비활성('곧 공개'). c.preview = true. MAP_FLAGS.showPlaceholders 로 숨길 수 있다.
import { withJosa } from '../systems/josa.js';
import { protagonistGender } from '../dialogue/dialogueData.js';
// '@protagonist'(출전 강제 주인공) -> 칩 코드: 성별 기본 초상 protagonist_m|f(없으면 m)
const protagonistChip = () => ({ code: `protagonist_${protagonistGender() === 'f' ? 'f' : 'm'}`, name_ko: '주인공' });

export const MAP_FLAGS = {
    autoPins: true, // 지도 메타(stages[].map.pin)가 없는 스테이지에 기본 핀 자동 배치(아래 autoStagePins). 끄기: localStorage srpg.stageMap.autoPins=0
    showPlaceholders: true, // 준비 중 캠페인 핀 표시(false = 숨김). 런타임: localStorage srpg.stageMap.placeholders=0
};

// 가상 스테이지(메타 virtual, map.pin=null) FE 표시 위치 보정값. 역사 지점이 아닌 연출용 자리(전장 안 빈 육지, 다른 핀과 겹치지 않게).
// 메타에 실제 pin 이 있으면 메타가 우선. 정규화 좌표 x=(lon+180)/360, y=(90-lat)/180
export const VIRTUAL_PINS = {
    ch1_s8: { x: 0.856944, y: 0.291389 }, // 강원 내륙(약 128.5E, 37.55N)
    ch1_s10: { x: 0.8575, y: 0.296944 }, // 경상 북부 내륙(약 128.7E, 36.55N)
};

let metaPromise = null;
// 메타 로더(교체 지점). stages 응답에 map_meta 가 있으면 그것을 우선(추후 BE 노출 대비), 없으면 번들 사본(지연 청크)
export function loadCampaignMapMeta(stages = null) {
    const fromApi = Array.isArray(stages) ? stages.map_meta ?? null : null;
    if (fromApi?.shelves) return Promise.resolve(fromApi);
    if (!metaPromise) metaPromise = import('../data/shelf_map_meta.json').then((m) => m.default ?? m).catch((e) => { metaPromise = null; throw e; });
    return metaPromise;
}

// 영토(세력권) 데이터: FE 사본 resources/js/game/data/shelf_territories.json(원본 database/data/shelf_territories.json, 송서사·명세 SHELF_TERRITORIES_SPEC.md)을 지연 청크로 읽는다.
// 원본 수정 후 사본 복사 + 동일성 확인: node resources/js/game/tools/check_data_sync.mjs --fix (dev 서버는 database/** 를 감시하지 않으므로 사본을 쓴다)
// 화면 사용 필드: name_period·plaque.text·color·alliance·label_pos·label_caption·as_of·disclaimer_player (나머지는 제작용)
let terrPromise = null;
export function loadTerritories() {
    if (!terrPromise) terrPromise = import('../data/shelf_territories.json').then((m) => m.default ?? m).catch((e) => { terrPromise = null; throw e; });
    return terrPromise;
}

// 캠페인(+선택 스테이지 stage_overrides)의 표시 세력 목록. 반환: { asOf, factions[{ id, name, plaque, caption, color, alliance, labelPos{x,y}, polys[{conf, pts[{x,y}]}] }](priority 순, 아래 -> 위), range(정규화 bounds|null) }
// faction_ids 가 비면 준비 중 캠페인용 preview_faction_ids(없으면 draft_faction_ids)로 폴백(priority 도 preview_priority > draft_priority > priority). 모두 비면 factions = []
const nonEmpty = (a) => (Array.isArray(a) && a.filter(Boolean).length ? a.filter(Boolean) : null);
export function territoriesFor(data, campaignKey, stageCode = null) {
    const camp = (Array.isArray(data?.campaigns) ? data.campaigns : []).find((x) => x?.campaign_id === campaignKey);
    if (!camp) return { asOf: '', factions: [], range: null };
    const ov = stageCode ? camp.stage_overrides?.[stageCode] ?? null : null;
    const main = nonEmpty(ov?.faction_ids) ?? nonEmpty(camp.faction_ids);
    const pre = main ? null : nonEmpty(camp.preview_faction_ids) ?? nonEmpty(camp.draft_faction_ids);
    const ids = main ?? pre ?? [];
    if (!ids.length) return { asOf: ov?.as_of ?? camp.as_of ?? '', factions: [], range: null };
    const pri = (main ? nonEmpty(ov?.priority) ?? nonEmpty(camp.priority) : nonEmpty(camp.preview_priority) ?? nonEmpty(camp.draft_priority) ?? nonEmpty(camp.priority)) ?? ids;
    // 점령·진군 레이어(id 에 _occ_ / _front_, 또는 세력 layer:'overlay')는 기본 국가 레이어 위에 덧칠(SHELF_TERRITORIES_SPEC 28행). 데이터 priority 가 조선을 맨 위에 두면
    //   점령권이 조선 색에 덮여 '부산 일대만 일본'처럼 보였다(사용자 지적 2026-11-03) -> 같은 priority 순서는 지키되 덧칠 레이어만 맨 위로
    const overlay = (id) => /_(occ|front)_/.test(id) || (Array.isArray(data.factions) ? data.factions : []).find((f) => f.id === id)?.layer === 'overlay';
    const order = [...ids].sort((a, b) => (overlay(a) - overlay(b)) || ((pri.indexOf(a) < 0 ? -1 : pri.indexOf(a)) - (pri.indexOf(b) < 0 ? -1 : pri.indexOf(b))));
    const byId = new Map((Array.isArray(data.factions) ? data.factions : []).map((f) => [f.id, f]));
    const nx = (lon) => (Number(lon) + 180) / 360; const ny = (lat) => (90 - Number(lat)) / 180;
    const factions = order.map((id) => byId.get(id)).filter(Boolean).map((f) => {
        const lp = ov?.label_pos?.[f.id] ?? f.label_pos;
        return {
            id: f.id, name: f.name_period ?? '', plaque: f.plaque?.text ?? '', plaqueScript: f.plaque?.script ?? '',
            // 현지 국호(큰 글자, 자국 문자) + 한글 국호(작은 글자). 필드가 없으면 빈 값(기존 plaque.text 표시)
            native: typeof f.plaque?.native === 'string' ? f.plaque.native.trim() : '', nativeScript: f.plaque?.native_script ?? '', nativeLang: f.plaque?.native_lang ?? '', nativeRtl: f.plaque?.native_rtl === true, ko: f.plaque?.ko ?? '',
            nativeAlt: typeof f.plaque?.native_alt === 'string' ? f.plaque.native_alt.trim() : '', nativeAltScript: f.plaque?.native_alt_script ?? '', nativeAltLang: f.plaque?.native_alt_lang ?? '',
            caption: f.label_caption ?? '', color: f.color ?? '#888888', alliance: f.alliance ?? '',
            labelPos: lp && Number.isFinite(Number(lp.lon)) && Number.isFinite(Number(lp.lat)) ? { x: nx(lp.lon), y: ny(lp.lat) } : null,
            polys: (Array.isArray(f.polygons) ? f.polygons : []).map((p) => ({ conf: p?.boundary_confidence ?? 'medium', pts: (Array.isArray(p?.ring) ? p.ring : []).filter((q) => Array.isArray(q) && Number.isFinite(Number(q[0])) && Number.isFinite(Number(q[1]))).map(([lon, lat]) => ({ x: nx(lon), y: ny(lat) })) }))
                .filter((p) => p.pts.length >= 3),
        };
    });
    // battle_map_range 는 ch1 전장 범위(명세 3장). 다른 캠페인은 폴리곤 bbox
    const r = campaignKey === 'ch1' ? data.battle_map_range : null;
    const range = r ? { x0: nx(r.lon_min), x1: nx(r.lon_max), y0: ny(r.lat_max), y1: ny(r.lat_min) } : null;
    return { asOf: ov?.as_of ?? camp.as_of ?? '', factions, range, preview: !!pre };
}

// 플레이 가능 = 선행 해금 && 필수 영웅 보유(BE stages().playable). 필드가 없던 구 응답은 unlocked && !hero_locked 로 대체
export const stagePlayable = (s) => !!s && (typeof s.playable === 'boolean' ? s.playable : !!s.unlocked && !s.hero_locked);
// 미보유 필수 영웅 [{code, name}] (BE stages().missing_heroes / 422 required_hero_missing 의 missing_heroes)
export const missingHeroesOf = (s) => (Array.isArray(s?.missing_heroes) ? s.missing_heroes : []).filter((h) => h?.code || h?.name);
export const missingHeroText = (list) => (list?.length ? `필요 영웅: ${list.map((h) => h.name || h.code).join(', ')}` : '');
// 잠금 사유(기존 스테이지 카드 문구와 같은 규칙). 선행 스테이지 사유가 먼저, 영웅 부족이 뒤
export const stageLockText = (s) => {
    const pre = s && !s.unlocked ? (s.locked_by?.name ? `${withJosa(`「${s.locked_by.name}」`, '을/를')} 클리어하면 해금` : '이전 스테이지를 클리어하면 해금') : '';
    const hero = missingHeroText(missingHeroesOf(s));
    return [pre, hero].filter(Boolean).join(' · ') || (s ? '' : '이전 스테이지를 클리어하면 해금');
};
// 서가(캠페인) 단위 필수 영웅 보유 현황 = BE stages 응답 chapters["<chapter>"] {need[{code,name,owned}], need_count, owned_count}(주인공 제외, BE 단일 출처).
// chapters 가 없는 응답이면 스테이지별 required_heroes[{code,name,owned}](BE) 합집합으로 대체. 반환 {need, owned, missing[{code,name}]} | null
export function heroNeedOf(items, agg = null) {
    if (agg && Array.isArray(agg.need)) {
        return { need: Number(agg.need_count ?? agg.need.length) || 0, owned: Number(agg.owned_count ?? agg.need.filter((h) => h?.owned).length) || 0, missing: agg.need.filter((h) => h && !h.owned).map((h) => ({ code: h.code, name: h.name || h.code })) };
    }
    const all = new Map();
    (items ?? []).forEach((s) => (Array.isArray(s?.required_heroes) ? s.required_heroes : []).forEach((h) => { if (h?.code && !all.has(h.code)) all.set(h.code, h); }));
    if (!all.size) return null;
    const list = [...all.values()];
    return { need: list.length, owned: list.filter((h) => h.owned).length, missing: list.filter((h) => !h.owned).map((h) => ({ code: h.code, name: h.name || h.code })) };
}

// 대결 구도 데이터(BE): 기준 스테이지의 factions{ally,enemy}·enemy_commander, 서가 전체 ally_npcs 합집합
export function versusOf(items, ref) {
    const npcs = new Map();
    (items ?? []).forEach((s) => (Array.isArray(s?.ally_npcs) ? s.ally_npcs : []).forEach((h) => { if (h?.code && !npcs.has(h.code)) npcs.set(h.code, h); }));
    const f = ref?.factions && typeof ref.factions === 'object' ? ref.factions : null;
    return { factions: f?.ally && f?.enemy ? { ally: f.ally, enemy: f.enemy } : null, commander: ref?.enemy_commander?.name ? ref.enemy_commander : null, allyNpcs: [...npcs.values()] };
}

// 적 대표(enemy_commander)가 역사 인물이 아닌 일반 부대 지휘 직함인지(예: '둔덕 보병대장', '고립 십자군 기사대장', '금 야전군 총사령').
// BE 응답에 인물/일반 구분 필드가 없어 이름 꼬리(직함)로 판정한다. hero_code·npc_ref 가 있으면 인물로 본다. 괄호 설명은 떼고 본다
// ('일본군 지휘관(총대장 실명 verify로 비표기)' -> 일반, '브워지미에시(크라쿠프 보이보다)' -> 인물). 2026-11-04 사용자 제보: 일반 지휘관이 장수 칩에 섞임
const GENERIC_COMMANDER_TAIL = /(대장|지휘관|사령관|총사령|우두머리|장수|초병장|초병조|선동자|선두|총독|반장|선장|선임|개체|병|그림자)$/; // 그림자 = 서가 연출용 보스명('번진 기록의 그림자' 등, 인물 아님)
export function isGenericCommander(cmd) {
    if (!cmd) return false;
    if (cmd.generic === true) return true; // BE enemy_commander.generic(2026-11-04)
    // generic=false 여도 영웅 코드 없이 직함 이름만 보이는 경우('수 후미 대장' = 인물 NPC 설세웅을 직함으로 표시, 강화면 gacha55)는 칩에 넣지 않는다(실제 인물은 메타 칩에 있음)
    if (cmd.hero_code || cmd.hero || cmd.npc_ref) return false; // hero = 시드 rules.enemy_commander 의 영웅 코드
    const n = String(cmd.name ?? '').replace(/\s*\(.*?\)\s*/g, '').trim();
    return !n || GENERIC_COMMANDER_TAIL.test(n);
}

const validPt = (p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
const showPlaceholders = () => { try { if (localStorage.getItem('srpg.stageMap.placeholders') === '0') return false; } catch { /* 무시 */ } return MAP_FLAGS.showPlaceholders; };

// 지도 메타에 영웅이 없는 캠페인(예: 튜토리얼): stages 응답의 사실 데이터로 칩을 채운다.
// required_hero/forced_heroes = key(출전), join_hero(첫 클리어 합류) = companion. 중복 제거, 순서 = 스테이지 순
const heroCode = (h) => (typeof h === 'string' ? h : h?.hero_code ?? h?.code ?? h?.hero ?? null); // forced_heroes 항목은 {hero, unit_type, ...}
export function heroesFromStages(items) {
    const out = new Map();
    (items ?? []).forEach((s) => {
        [s?.required_hero, ...(Array.isArray(s?.forced_heroes) ? s.forced_heroes : [])].map(heroCode).filter(Boolean).forEach((c) => { if (!out.has(c)) out.set(c, 'key'); });
        (Array.isArray(s?.join_hero) ? s.join_hero : []).map(heroCode).filter(Boolean).forEach((c) => { if (!out.has(c)) out.set(c, 'companion'); });
    });
    // '@protagonist' 등 '@' 예약 코드는 초상 키가 아님('@' 글자 칩 방지): 주인공은 성별 기본 초상, 그 외 '@' 코드는 제외
    return [...out].flatMap(([code, role]) => (code === '@protagonist' ? [{ ...protagonistChip(), role }] : code.startsWith('@') ? [] : [{ code, role }]));
}

// 필수 주인공('@protagonist' 출전 강제) 스테이지가 있는 서가: 주인공 칩을 맨 앞에(메타 영웅 목록에 없을 때). proto = 대표 초상 후보에서 제외
function withProtagonist(items, list) {
    const need = (items ?? []).some((s) => (Array.isArray(s?.forced_heroes) ? s.forced_heroes : []).includes('@protagonist'));
    const rest = list.filter((h) => !String(h.code).startsWith('protagonist_'));
    return need ? [{ ...protagonistChip(), role: 'key', proto: true }, ...rest] : list;
}

// stages: gameApi.stages() 결과. chapterOf/chapterTitle: Lobby 의 stageChapter/chapterTitle(문구 단일 출처)
// 반환: { campaigns[], recKey, usable } — usable=false 면 호출 측이 기존 카드 그리드로 폴백
// hidden(선택): GET /api/hidden-chapter 응답. 잠김이면 ch999 서가 메타·스테이지를 지도에서 빼고 이름·위치 없는 '아직 열리지 않은 책장' 항목(hiddenLocked, 진행도 N/M)만 넣는다.
//   해금이면 일반 서가처럼(스테이지는 /api/stages 가 chapter 999 로 준다). 메타에 ch999 위치가 없으면 세계 전체 시야로 진입
export function buildCampaignMap(stages, meta, { chapterOf, chapterTitle, hidden = null, hiddenChapter = 999 }) {
    const hiddenLocked = !!hidden && hidden.unlocked === false;
    const shelves = (Array.isArray(meta?.shelves) ? meta.shelves : []).filter((x) => hidden?.unlocked || Number(x.chapter) !== hiddenChapter); // 해금 전(또는 응답 없음)에는 ch999 서가 메타(이름·위치)를 쓰지 않는다
    if (!hidden?.unlocked) stages = (stages ?? []).filter((s) => chapterOf(s) !== hiddenChapter); // 잠김(또는 응답 없음)이면 ch999 스테이지·메타를 지도에서 제외
    const stageMeta = new Map((Array.isArray(meta?.stages) ? meta.stages : []).map((m) => [m.stage_code, m]));
    const groups = [];
    (stages ?? []).forEach((s) => { const ch = chapterOf(s); let g = groups.find((x) => x.ch === ch); if (!g) { g = { ch, items: [] }; groups.push(g); } g.items.push(s); });
    const make = (ch, items, sh) => {
        const st = items.map((s, k) => {
            const m = stageMeta.get(s.code) ?? null;
            const vp = VIRTUAL_PINS[s.code];
            const pin = m?.map?.pin && validPt(m.map.pin) ? { x: Number(m.map.pin.x), y: Number(m.map.pin.y) } : vp ? { ...vp } : null;
            return { s, no: k + 1, meta: m, pin, radius: Number(m?.map?.radius) || 0, place: m?.map?.place_label ?? '', year: m?.year_label ?? '', title: m?.title ?? s.name };
        });
        const cleared = items.filter((s) => s.clear_count > 0).length;
        const placeholder = !items.length;
        autoStagePins(st, sh); // 메타 핀 없는 스테이지: 서가 초점 둘레 기본 핀(t.autoPin = true)
        const preview = placeholder || sh?.status === 'preview'; // 준비 중(출정 비활성)
        // 지도 초점: map.focus_proposal(미리보기 시야안, 있으면 우선) > map.focus. 핀 위치: map.origin_pin(출신지 상징 핀, 있으면) > 초점
        const fp = sh?.map?.focus_proposal && validPt(sh.map.focus_proposal) ? sh.map.focus_proposal : null;
        const f0 = fp ?? (sh?.map?.focus && validPt(sh.map.focus) ? sh.map.focus : null);
        const focus = f0 ? { x: Number(f0.x), y: Number(f0.y) } : null;
        const op = sh?.map?.origin_pin && validPt(sh.map.origin_pin) ? { x: Number(sh.map.origin_pin.x), y: Number(sh.map.origin_pin.y) } : null;
        return {
            key: sh?.shelf_code ?? `ch${ch}`, ch, placeholder, preview,
            title: placeholder ? (sh?.name_ko ?? chapterTitle(ch)) : chapterTitle(ch),
            name: sh?.name_ko ?? '', era: sh?.era_label ?? '', region: sh?.region_label ?? '', stateLabel: [].concat(sh?.period?.state_label ?? sh?.state_label ?? []).filter(Boolean).join(' · '), asOf: sh?.period?.as_of ?? '',
            summary: sh?.summary ?? '', summaryLines: (Array.isArray(sh?.summary_lines) ? sh.summary_lines : []).filter((x) => typeof x === 'string' && x.trim()),
            focus, pinAt: op ?? focus, zoom: Number(fp?.zoom) || Number(sh?.map?.zoom) || 1,
            // heroes_pending: 초상화 제작 대기 영웅(이니셜 원형 + 이름, 은은하게). pending = true
            heroes: [...withProtagonist(items, Array.isArray(sh?.heroes) && sh.heroes.some((h) => h?.code) ? sh.heroes.filter((h) => h?.code) : heroesFromStages(items)),
                ...(Array.isArray(sh?.heroes_pending) ? sh.heroes_pending.filter((h) => h?.code).map((h) => ({ ...h, pending: true })) : [])],
            factions: (Array.isArray(sh?.factions) ? sh.factions : []).filter((f) => f?.name_ko && validPt(f.label_pos)),
            stages: st,
            unlocked: items.some(stagePlayable), // 출정 가능(선행 해금 + 필수 영웅 보유) 스테이지가 하나라도 있으면 열림
            opened: items.some((s) => s.unlocked), // 선행 조건만 본 해금(장수 칩 실루엣 판정용, 기존 의미)
            heroNeed: heroNeedOf(items, stages?.chapters?.[String(ch)] ?? null),
            vs: versusOf(items, items.find((s) => stagePlayable(s) && !(s.clear_count > 0)) ?? items.find(stagePlayable) ?? items[0]),
            cleared, total: items.length,
            stars: items.reduce((n, s) => n + (s.best_stars ?? 0), 0), maxStars: items.length * 3,
        };
    };
    const campaigns = groups.map((g) => make(g.ch, g.items, shelves.find((x) => Number(x.chapter) === g.ch)));
    // 해금된 숨은 종장인데 메타 위치가 아직 없으면 세계 전체 시야(진입·스테이지 목록은 일반 서가와 같음)
    campaigns.forEach((c) => { if (c.ch === hiddenChapter && !c.focus) { c.focus = { x: 0.5, y: 0.36 }; c.zoom = c.zoom || 1.4; c.hiddenChapter = true; } });
    if (showPlaceholders()) {
        shelves.filter((x) => (x.status === 'placeholder' || x.status === 'preview') && !groups.some((g) => g.ch === Number(x.chapter)))
            .sort((a, b) => Number(a.chapter) - Number(b.chapter))
            .forEach((x) => campaigns.push(make(Number(x.chapter), [], x)));
    }
    if (hiddenLocked) { // 이름·위치·스테이지 비노출 잠김 항목(목록 맨 끝 + 지도 화면 고정 잠김 핀). 진행도만
        const pg = hidden.progress ?? {}; const cl = Number(pg.cleared) || 0; const tt = Number(pg.total) || 0;
        campaigns.push({ key: 'hidden_locked', ch: hiddenChapter, hiddenLocked: true, placeholder: false, preview: true, title: '아직 열리지 않은 책장', name: '', era: '', region: '', stateLabel: '', asOf: '',
            summary: '', summaryLines: [`서가 기록 ${cl}/${tt}`, '모든 서가의 기록을 마치면 이 책장이 열립니다.'], focus: null, pinAt: null, zoom: 1, heroes: [], factions: [], stages: [],
            unlocked: false, opened: false, heroNeed: null, vs: null, cleared: cl, total: tt, stars: 0, maxStars: 0, progress: { cleared: cl, total: tt } });
    }
    const recStage = (stages ?? []).find((s) => stagePlayable(s) && !(s.clear_count > 0));
    const rec = (recStage && campaigns.find((c) => c.stages.some((t) => t.s.id === recStage.id))) ?? campaigns.find((c) => c.unlocked && c.focus) ?? campaigns.find((c) => c.unlocked) ?? campaigns[0];
    const usable = campaigns.some((c) => !c.placeholder && c.focus);
    return { campaigns, recKey: rec?.key ?? null, recStageId: recStage?.id ?? null, usable };
}

// 기본 핀 자동 배치(2026-11-04 사용자 '임진왜란편만 지도 핀·연결선이 있고 다른 서가는 없다'): 송서사 메타(shelf_map_meta stages[].map.pin)가 없는 스테이지에
//  연출용 위치를 준다(역사 지점 아님, 메타가 생기면 메타가 우선). 핀 화면 간격이 서가 기본 줌에서 비슷하도록 정규화 거리 = 기준 / zoom.
//  - 메타 핀이 하나도 없음: 서가 초점(focus_proposal > focus, 출신지 핀 origin_pin 이 있으면 그쪽) 가운데로 좌 -> 우 완만한 물결(스테이지 순서 = 진행 방향)
//  - 일부만 있음: 빠진 스테이지를 앞·뒤 메타 핀 사이에 순서대로 나눠 두고, 한쪽만 있으면 그 핀 옆으로 이어 둔다
const autoPinsOn = () => { try { if (localStorage.getItem('srpg.stageMap.autoPins') === '0') return false; } catch { /* 무시 */ } return MAP_FLAGS.autoPins; };
function autoStagePins(st, sh) {
    if (!autoPinsOn() || !st.length || st.every((t) => t.pin)) return;
    const f0 = sh?.map?.origin_pin && validPt(sh.map.origin_pin) ? sh.map.origin_pin : sh?.map?.focus_proposal && validPt(sh.map.focus_proposal) ? sh.map.focus_proposal : sh?.map?.focus && validPt(sh.map.focus) ? sh.map.focus : null;
    const z = Math.max(1, Number(sh?.map?.focus_proposal?.zoom) || Number(sh?.map?.zoom) || 1);
    const known = st.map((t, i) => (t.pin ? i : -1)).filter((i) => i >= 0);
    const step = 0.07 / z; // 인접 핀 간격(정규화, 기본 줌에서 화면 폭의 약 7%)
    if (!known.length) {
        if (!f0) return; // 초점도 없으면 지도에 둘 곳이 없음(목록만)
        const n = st.length; const span = step * (n - 1);
        st.forEach((t, k) => { t.pin = { x: Number(f0.x) - span / 2 + step * k, y: Number(f0.y) + step * 0.55 * Math.sin(k * 1.25) }; t.autoPin = true; });
        return;
    }
    st.forEach((t, i) => {
        if (t.pin) return;
        const a = [...known].reverse().find((j) => j < i); const b = known.find((j) => j > i);
        if (a != null && b != null) { const r = (i - a) / (b - a); const pa = st[a].pin; const pb = st[b].pin; t.pin = { x: pa.x + (pb.x - pa.x) * r, y: pa.y + (pb.y - pa.y) * r + step * 0.35 * ((i % 2) ? 1 : -1) }; }
        else { const j = a ?? b; const d = i - j; const pj = st[j].pin; t.pin = { x: pj.x + step * d, y: pj.y + step * 0.5 * Math.sin(d * 1.25) }; }
        t.autoPin = true;
    });
}

// 출정 대상: 해금·미클리어 첫 스테이지('출정') > 전부 클리어면 별 3개 미만 첫 스테이지(없으면 첫 스테이지, '복습') > 해금된 첫 스테이지
// 잠김: { stage:null, reason }
export function sortieOf(c) {
    if (c.hiddenLocked) return { stage: null, label: '잠김', reason: `서가 기록 ${c.cleared}/${c.total}`, soon: true };
    if (c.placeholder || c.preview) return { stage: null, label: '곧 공개', reason: '준비 중인 캠페인입니다', soon: true };
    const list = c.stages.map((t) => t.s);
    const ok = list.filter(stagePlayable);
    const next = ok.find((s) => !(s.clear_count > 0));
    if (next) return { stage: next, label: '출정' };
    if (list.length && list.every((s) => s.clear_count > 0)) { const rv = ok.find((s) => (s.best_stars ?? 0) < 3) ?? ok[0]; if (rv) return { stage: rv, label: '복습' }; }
    if (ok.length) return { stage: ok[0], label: '출정' };
    // 잠김: 선행 해금됐지만 영웅이 부족한 스테이지가 있으면 그 사유(+미보유 영웅), 없으면 첫 스테이지의 선행 사유
    const blocked = list.find((s) => s.unlocked && !(s.clear_count > 0)) ?? list.find((s) => s.unlocked) ?? list[0];
    return { stage: null, label: '출정', reason: stageLockText(blocked), missing: missingHeroesOf(blocked) };
}
