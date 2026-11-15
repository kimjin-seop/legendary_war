// 서버 오류 코드 -> 한국어 안내 문구. (routes/api.php 주석 + 각 Service 의 IllegalAction 코드 기준)
// 서버가 준 message 는 신뢰하되, 코드가 표에 있으면 표의 문구를 우선한다(일관된 톤·보안상 노출 최소화).
export const ERROR_MESSAGES = {
    quest_not_found: '퀘스트를 찾을 수 없습니다.',
    quest_not_completed: '아직 완료하지 않은 퀘스트입니다.',
    quest_already_claimed: '이미 보상을 받은 퀘스트입니다.',
    quest_guest_claim: '게스트는 일일·주간 퀘스트 보상을 받을 수 없습니다. 회원 가입(게스트 승격) 후 받을 수 있으며 진행도는 유지됩니다.',
    quest_unavailable: '퀘스트 기능을 잠시 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    ranking_disabled: '랭킹이 공개되지 않았습니다.',
    invalid_board: '잘못된 랭킹 종류입니다.',
    equipment_disabled: '장비 기능이 꺼져 있습니다.',
    item_not_found: '상품을 찾을 수 없습니다.',
    inventory_full: '인벤토리가 가득 찼습니다. 장비를 정리한 뒤 구매해 주세요.',
    equipment_not_found: '장비를 찾을 수 없습니다.',
    invalid_slot: '잘못된 장비 부위입니다.',
    slot_mismatch: '이 부위에 장착할 수 없는 장비입니다.',
    level_too_low: '영웅 레벨이 장착 요구 레벨보다 낮습니다.',
    equipped_elsewhere: '다른 영웅이 장착 중인 장비입니다. 먼저 해제해 주세요.',
    hero_not_found: '영웅을 찾을 수 없습니다.',
    // 주인공(캐릭터 생성) — ProtagonistService
    invalid_face: '성별과 맞는 초상화를 골라 주세요.',
    invalid_gender: '성별 값이 올바르지 않습니다.',
    invalid_answers: '모든 질문에 답한 뒤 다시 시도해 주세요.',
    invalid_class: '고를 수 없는 성향입니다. 목록을 새로 고친 뒤 다시 선택해 주세요.',
    gender_locked: '성별은 바꿀 수 없습니다. 초상화는 같은 성별 안에서 바꿀 수 있습니다.',
    protagonist_retest_limit: '오늘 재검사 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요.',
    protagonist_not_created: '주인공을 먼저 만들어 주세요.',
    protagonist_unavailable: '주인공 기능을 잠시 사용할 수 없습니다.',
    protagonist_required: '주인공을 먼저 만들어야 이 스테이지에 입장할 수 있습니다.',
    // 필수 영웅·아군 NPC(BattleService)
    required_hero_missing: '필요한 영웅을 보유하지 않아 출정할 수 없습니다.',
    forced_hero_required: '필수 출전 영웅은 편성에서 뺄 수 없습니다.',
    npc_ally_uncontrollable: '지원 아군은 자동으로 행동합니다.',
    hero_is_ally_npc: '이 스테이지에서는 지원 아군으로 등장하는 영웅이라 출전할 수 없습니다.',
    tutorial_unavailable: '튜토리얼 진행 저장을 잠시 사용할 수 없습니다.',
    turn_timeout:'턴 제한시간이 지났습니다. 남은 유닛은 대기 처리되었습니다.',
    invalid_map:'존재하지 않는 맵입니다. 목록을 새로 고친 뒤 다시 선택해 주세요.',
    map_not_allowed: '선택한 맵은 이 모드에서 사용할 수 없습니다. 다른 맵을 선택해 주세요.',
    unauthenticated: '로그인 또는 게스트 시작이 필요합니다.',
    account_banned: '정지된 계정입니다. 고객센터에 문의해 주세요.',
    invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다.',
    too_many_attempts: '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    session_unavailable: '세션을 만들 수 없습니다. 잠시 후 다시 시도해 주세요.',
    name_length: '캐릭터명은 2~12자여야 합니다.',
    name_invalid_chars: '캐릭터명은 한글·영문·숫자만 사용할 수 있습니다.',
    name_digits_only: '캐릭터명은 숫자만으로는 만들 수 없습니다.',
    name_forbidden: '사용할 수 없는 캐릭터명입니다.',
    name_taken: '이미 사용 중인 캐릭터명입니다.',
    email_taken: '가입할 수 없는 정보입니다. 입력값을 확인해 주세요.',
    password_same_as_identity: '비밀번호는 이메일이나 캐릭터명과 달라야 합니다.',
    validation: '입력값을 확인해 주세요.',
    not_your_turn: '지금은 내 차례가 아닙니다.',
    version_conflict: '전투 상태가 바뀌었습니다. 화면을 새로 고칩니다.',
    deployment_phase: '아직 배치 단계입니다.',
    deployment_closed: '배치 단계가 아닙니다.',
    deployment_missing: '배치를 먼저 제출해 주세요.',
    battle_finished: '이미 종료된 전투입니다.',
    // 교대 행동(부대 단위 활성화)
    squad_locked: '현재 활성 부대의 행동을 먼저 끝내세요.',
    squad_already_activated: '이번 라운드에 이미 행동한 부대입니다.',
    squad_not_found: '행동할 수 있는 내 부대가 아닙니다.',
    // 액티브 스킬(use_skill)
    skill_disabled: '이 전투에서는 스킬을 사용할 수 없습니다.',
    skill_unsupported: '아직 지원하지 않는 스킬입니다.',
    skill_not_found: '이 유닛이 보유한 스킬이 아닙니다.',
    skill_cooldown: '스킬 재사용 대기 중입니다.',
    skill_no_uses: '이 전투에서 스킬 사용 횟수를 모두 썼습니다.',
    invalid_target: '공격할 수 없는 대상입니다.',
    out_of_range: '사거리 밖의 대상입니다.',
    already_in_room: '이미 참여 중인 방이 있습니다. 먼저 나가 주세요.',
    room_not_found: '방을 찾을 수 없습니다. 입장 코드를 확인해 주세요.',
    room_full: '방이 가득 찼습니다.',
    not_host: '방장만 시작할 수 있습니다.',
    not_ready: '모든 참가자가 준비되어야 합니다.',
    stage_locked: '아직 해금되지 않은 스테이지입니다.',
    stage_not_found: '스테이지를 찾을 수 없습니다.',
    battle_not_found: '전투를 찾을 수 없습니다.',
    party_empty: '출격 영웅이 최소 1명 필요합니다.',
    too_many_slots: '출격 인원 상한을 초과했습니다.',
    party_size_mismatch: '이 맵은 정해진 수의 영웅을 출전시켜야 합니다. 편성을 확인해 주세요.', // 방 대전: details.required 있으면 partySizeText
    too_many_heroes: '출격 인원이 현재 레벨의 슬롯 수를 초과했습니다. 편성을 수정해 주세요.', // 백엔드 레벨 연동 슬롯(확정 전 예비 매핑)
    duplicate_hero: '같은 영웅을 두 번 넣을 수 없습니다.',
    hero_not_owned: '보유하지 않은 영웅입니다.',
    cost_exceeded: '편성 코스트가 상한을 초과했습니다. 편성을 수정해 주세요.',
    invalid_placement: '배치할 수 없는 칸입니다.',
    // 배치 슬롯(stages.rules.deploy_slots, docs/DEPLOY_SLOTS_20261108.md)
    not_a_slot: '영웅은 지정된 출전 자리(슬롯)에만 둘 수 있습니다.',
    slot_hero_mismatch: '고정 자리에는 정해진 영웅만 설 수 있습니다. 고정 영웅은 자기 자리에서 옮길 수 없습니다.',
    slot_unit_type_mismatch: '이 자리는 정해진 병종의 영웅만 설 수 있습니다.', // required_hero_missing 은 위에 이미 정의(입장 게이트)
    gacha_disabled: '뽑기는 아직 열리지 않았습니다.',
    insufficient_gold: '골드가 부족합니다.',
    insufficient_mp: '마력이 부족합니다.', // 전투 MP 방식(409)
    sweep_not_available: '직접 3성으로 클리어한 스테이지만 소탕할 수 있습니다.', // 소탕
    sweep_disabled: '지금은 소탕을 사용할 수 없습니다.',
    stage_daily_cap: '오늘 이 스테이지의 보상 한도에 도달했습니다. 05:00에 초기화됩니다.',
    insufficient_pen: '펜이 부족합니다. 시즌 전쟁 승리·랭크전 승리·일일 퀘스트로 모을 수 있습니다.', // 펜 결제 상품
    daily_limit_reached: '오늘 교환 한도를 모두 사용했습니다. 05:00에 초기화됩니다.', // 일일 교환소
    product_unavailable: '지금은 교환할 수 없는 상품입니다.',
    product_not_found: '상품을 찾을 수 없습니다. 목록을 새로 고쳐 주세요.',
    exchange_conflict: '교환 처리 중 충돌이 발생했습니다. 잠시 후 다시 시도해 주세요.',
    gacha_conflict: '요청이 잠시 충돌했습니다. 다시 시도해 주세요. (재화는 한 번만 차감됩니다)', // 펜/골드 공용(결제 통화 전환 2026-11-14)
    request_id_reused: '이전 뽑기 요청과 충돌했습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.',
    banner_unknown: '지금은 소환할 수 없는 배너입니다. 화면을 새로 고친 뒤 다른 배너를 골라 주세요.',
    db_busy: '서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.',
    network: '네트워크에 연결할 수 없습니다. 연결을 확인해 주세요.',
    timeout: '서버 응답이 늦습니다. 잠시 후 다시 시도해 주세요.', // client.js 기본 타임아웃(20초)
    server: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    maintenance: '서버 점검 중입니다. 잠시 후 다시 접속해 주세요.',
    // 시즌 전쟁(WarService)
    season_not_found: '진행 중인 시즌이 없습니다.',
    not_joined: '먼저 국가를 선택해야 합니다.',
    already_joined: '이미 국가를 선택했습니다. 시즌 중에는 변경할 수 없습니다.',
    country_full: '해당 국가의 인원이 많아 지금은 가입할 수 없습니다. 인원이 적은 국가를 선택하세요.',
    invalid_country: '선택할 수 없는 국가입니다.',
    guest_not_allowed: '시즌 전쟁은 정식 계정만 참가할 수 있습니다. 회원 가입(게스트 승격) 후 참가해 주세요.',
    territory_not_found: '영토를 찾을 수 없습니다.',
    own_territory: '자국 영토는 공격할 수 없습니다.',
    not_adjacent: '아군 영토와 인접한 적 영토만 공격할 수 있습니다.',
    siege_by_other: '다른 국가가 공성 중인 영토입니다.',
    war_battle_open: '진행 중인 시즌 전투가 있습니다. 먼저 끝내거나 포기하세요.',
    cooldown: '같은 영토는 쿨다운이 끝난 뒤 다시 공격할 수 있습니다.',
    daily_limit: '오늘 공격 가능 횟수를 모두 사용했습니다.',
    // 전투 진입(로딩) 실패 안내
    no_party: '출격할 수 있는 영웅이 없습니다. 편성을 확인해 주세요.',
    render_failed: '지도를 표시하는 중 오류가 발생했습니다. 다시 시도해 주세요.',
    load_timeout: '전투를 불러오는 시간이 오래 걸리고 있습니다.',
};

// 수치형 안내: cost_exceeded 는 서버 부가 정보(details.used/max/hero_cost/troop_cost)를 우선 사용하고,
// 없으면 서버 문구 "편성 코스트(N)가 상한(M)" 에서 숫자를 읽는다(둘 다 없으면 표 문구).
function costNumbers(err) {
    const d = err?.details ?? {};
    let used = Number.isFinite(Number(d.used)) && d.used != null ? Number(d.used) : null;
    let max = Number.isFinite(Number(d.max)) && d.max != null ? Number(d.max) : null;
    if ((used == null || max == null) && typeof err?.message === 'string') {
        const m = err.message.match(/\((\d+)\)[^()]*상한\((\d+)\)/);
        if (m) { used = used ?? Number(m[1]); max = max ?? Number(m[2]); }
    }
    const hero = d.hero_cost != null ? Number(d.hero_cost) : null;
    const troop = d.troop_cost != null ? Number(d.troop_cost) : null;
    return { used, max, hero, troop };
}

export function costExceededText(err) {
    const { used, max, hero, troop } = costNumbers(err);
    if (used == null && max != null) return `편성 코스트가 상한을 초과했습니다. 이 맵의 코스트 상한은 ${max}입니다.`; // 방 대전: details.max = 맵 크기별 상한(서버 cost_cap, 현행 S24/M32/L40)
    if (used == null || max == null) return ERROR_MESSAGES.cost_exceeded;
    const parts = hero != null && troop != null && troop > 0 ? ` (영웅 ${hero} + 부대 ${troop})` : '';
    const over = used > max ? ` ${used - max}만큼 넘습니다.` : '';
    return `출전 코스트 ${used} / 상한 ${max}${parts}로 상한을 초과했습니다.${over} ${troop != null && troop > 0 ? '코스트가 큰 영웅을 바꾸거나 부대를 줄여 주세요.' : '코스트가 큰 영웅을 바꿔 주세요.'}`; // 등급 코스트 C2/B3/A5/S8(서버값)
}

// 소환(가챠) 펜 부족 안내(송서사 확정 2026-11-14). 10연은 서버 price_pen.ten 숫자로 '10연 소환에는 펜 N개가 필요합니다.'를 앞에 붙인다.
//  ERROR_MESSAGES.insufficient_pen 은 교환소(펜 결제 상품) 공용 문구라 그대로 두고, 소환 화면만 이 함수를 쓴다.
export const GACHA_PEN_SHORT = '펜이 부족합니다. 스테이지 첫 클리어·일일 퀘스트·시즌 보상으로 모을 수 있습니다.';
export const GACHA_PEN_SHIORI = '펜이 모자랍니다, 지휘관님. 스테이지 첫 클리어나 일일 퀘스트로 모아 오시지요.';
export function gachaPenShortText({ count = 1, need = null } = {}) {
    const n = Number(need);
    return count >= 10 && Number.isFinite(n) && n > 0 ? `10연 소환에는 펜 ${n}개가 필요합니다. ${GACHA_PEN_SHORT}` : GACHA_PEN_SHORT;
}

// 콘솔 기록용 짧은 태그(민감정보 없음: 코드·HTTP 상태·수치만)
export function errorTag(err) {
    const d = err?.details;
    const nums = d && (d.used != null || d.max != null) ? ` used=${d.used ?? '?'} max=${d.max ?? '?'}` : '';
    return `code=${err?.code ?? 'unknown'} status=${err?.status ?? 0}${nums}`;
}

// 422 검증(Laravel errors) 필드별 한국어 안내(서버 문구는 영문이라 표로 대체)
export const FIELD_MESSAGES = {
    name: '캐릭터명은 2~12자, 한글·영문·숫자만 가능합니다.',
    nickname: '닉네임은 2~12자, 한글·영문·숫자만 가능합니다.',
    email: '이메일 형식이 올바르지 않습니다.',
    password: '비밀번호는 8자 이상, 영문과 숫자를 모두 포함하고 확인과 일치해야 합니다.',
    password_confirmation: '비밀번호 확인이 일치하지 않습니다.',
    terms_accepted: '약관에 동의해 주세요.',
    code: '입장 코드는 영문·숫자 8자입니다.',
    placements: '배치 정보가 올바르지 않습니다.',
    user_hero_ids: '편성 정보가 올바르지 않습니다.',
    count: '뽑기 횟수는 1회 또는 10연만 가능합니다.',
    request_id: '뽑기 요청 정보가 올바르지 않습니다. 다시 시도해 주세요.',
};

// 오류 코드가 가리키는 폼 필드(가입/로그인 화면에서 필드 아래에 표시)
export const CODE_FIELD = {
    name_length: 'name', name_invalid_chars: 'name', name_digits_only: 'name', name_forbidden: 'name', name_taken: 'name',
    password_same_as_identity: 'password', invalid_credentials: 'password',
};
// 편성 라인업 오류(2026-11-14): 문구는 messageOf 가 details 로 조립
Object.assign(ERROR_MESSAGES, {
    lineup_empty: '편성에 영웅이 없습니다. 영웅 > 편성에서 영웅을 넣어 주세요.',
    lineup_too_many: '편성 인원이 최대를 넘었습니다.',
    duplicate_hero: '같은 영웅을 두 번 넣을 수 없습니다.',
    hero_not_owned: '보유하지 않은 영웅입니다.',
    hero_not_allowed: '주인공·전용 영웅은 편성에 넣을 수 없습니다.',
    lineup_insufficient: '편성 인원이 부족합니다. 영웅 > 편성에서 영웅을 더 넣어 주세요.',
    not_in_lineup: '편성에 없는 영웅은 출전할 수 없습니다.',
});

export function messageOf(err) {
    if (!err) return ERROR_MESSAGES.server;
    const code = err.code;
    if (code === 'cost_exceeded') return costExceededText(err);
    if (code === 'party_size_mismatch') { const n = Number(err.details?.required); return n > 0 ? `이 맵은 ${n}명을 출전시켜야 합니다.` : ERROR_MESSAGES.party_size_mismatch; }
    if (code === 'lineup_insufficient') { const d = err.details ?? {}; const need = Number(d.required); return need > 0 ? `이 스테이지는 ${need}명이 필요하지만 편성 인원은 ${Number(d.current ?? d.lineup_count) || 0}명입니다. 영웅 > 편성에서 영웅을 더 넣어 주세요.` : ERROR_MESSAGES.lineup_insufficient; }
    if (code === 'not_in_lineup') { const hs = (err.details?.heroes ?? []).map((h) => h?.name).filter(Boolean); return hs.length ? `편성에 없는 영웅은 출전할 수 없습니다: ${hs.join(', ')}` : ERROR_MESSAGES.not_in_lineup; }
    if (code === 'lineup_too_many') { const m = Number(err.details?.max); return m > 0 ? `편성은 최대 ${m}명입니다.` : ERROR_MESSAGES.lineup_too_many; }
    if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    if (err.status === 429) return ERROR_MESSAGES.too_many_attempts;
    if (err.status === 503) return ERROR_MESSAGES.maintenance;
    if (err.status === 404) return '요청한 대상을 찾을 수 없습니다.';
    if (err.status >= 500) return ERROR_MESSAGES.server;
    // 서버 문자열은 텍스트로만 렌더(Phaser Text 는 HTML 해석 없음)
    return typeof err.message === 'string' && err.message ? err.message : ERROR_MESSAGES.server;
}
