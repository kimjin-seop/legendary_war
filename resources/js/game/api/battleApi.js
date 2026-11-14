import { request, auth, ApiError } from './client.js';
import { messageOf } from './errors.js';

// 전투 관련 API 래퍼(FE A 소유). HTTP/인증은 FE B 의 client.js(request(method, path, body) -> JSON, 실패 시 ApiError{status, code, message, retryAfter} throw,
// 503 db_busy / 네트워크는 client 가 Retry-After 로 재시도)를 그대로 사용하고 여기서는 경로와 사유 코드 안내만 담당한다.
// 서버 문서: routes/api.php 상단 주석. 전투 객체의 id 키는 battle_id.
export { ApiError };

function normalize(e) {
    if (e instanceof ApiError) return e;
    return new ApiError({ status: e?.status ?? 0, code: e?.code ?? (e?.name === 'AbortError' ? 'timeout' : 'network'), message: e?.message ?? '', retryAfter: e?.retryAfter ?? 0 });
}

export async function call(method, path, body) {
    try { return await request(method, path, body); } catch (e) { throw normalize(e); }
}

export const battleApi = {
    stages: () => call('GET', '/api/stages'),
    challenge: (stageId) => call('POST', `/api/stages/${stageId}/challenge`),
    show: (id) => call('GET', `/api/battles/${id}`),
    deployment: (id) => call('GET', `/api/battles/${id}/deployment`),
    submitDeployment: (id, placements) => call('PUT', `/api/battles/${id}/deployment`, { placements }),
    confirm: (id) => call('POST', `/api/battles/${id}/confirm`),
    // 교대 행동 전투(view.alternate=true): {type: activate, squad_id} | {type: end_activation} 추가, end_turn 은 invalid_action. 활성 부대 소속 유닛만 move/attack/wait
    // action: {type: move|attack|wait|end_turn, unit_id, x, y, target_id, facing?(wait 전용 up|down|left|right, 서버 방향 시스템 on 일 때만 의미)}. end_turn 뒤 봇 턴 이벤트가 함께 온다
    action: (id, action) => call('POST', `/api/battles/${id}/actions`, action),
    moves: (id, unitId) => call('GET', `/api/battles/${id}/units/${unitId}/moves`),
    botTurn: (id) => call('POST', `/api/battles/${id}/bot-turn`),
    abandon: (id) => call('POST', `/api/battles/${id}/abandon`),
    result: (id) => call('GET', `/api/battles/${id}/result`),
    profile: () => call('GET', '/api/profile'),
    rules: () => call('GET', '/api/rules'), // 공개 규칙표(terrains, unit_types, matchups, rules). auras 는 아직 미포함
    // 방(룸) 전투: 폴링(after_seq 증분 이벤트, turn.is_my_turn/remaining_seconds), 행동 제출(응답 = {events} + 최신 방 상태), 나가기(진행 중이면 기권)
    room: {
        poll: (code, afterSeq = 0) => call('GET', `/api/rooms/${code}?after_seq=${afterSeq}`),
        action: (code, action) => call('POST', `/api/rooms/${code}/actions`, action),
        leave: (code) => call('POST', `/api/rooms/${code}/leave`),
    },
    // 임시: Auth 씬 없이 전투를 바로 시작할 때 게스트 생성(FE B client 의 auth.guest 재사용, 토큰 저장은 client 담당)
    createGuest: (nickname) => auth.guest(nickname),
};

// 전투 전용 사유 코드 안내(FE B errors.js 에 없는 것만). 그 외는 messageOf 재사용
export const ERROR_TEXT = {
    not_your_turn: '지금은 내 턴이 아닙니다', version_conflict: '상태가 바뀌었습니다. 다시 시도하세요', deployment_phase: '배치 단계에서는 행동할 수 없습니다',
    battle_finished: '이미 종료된 전투입니다', out_of_range: '사거리 밖입니다', unit_not_owned: '내 유닛이 아닙니다', unit_not_found: '유닛을 찾을 수 없습니다',
    already_acted: '이미 행동을 마친 유닛입니다', already_moved: '이미 이동했습니다', unreachable: '이동할 수 없는 타일입니다', tile_occupied: '점유된 타일입니다',
    out_of_bounds: '맵 밖 좌표입니다', invalid_target: '공격할 수 없는 대상입니다', invalid_action: '알 수 없는 행동입니다', battle_not_found: '전투를 찾을 수 없습니다',
    deployment_closed: '이미 확정된 전투입니다', deployment_missing: '배치를 먼저 제출하세요', outside_deploy_zone: '배치 가능 영역 밖입니다', impassable_tile: '배치할 수 없는 지형입니다',
    stage_locked: '선행 스테이지를 먼저 클리어해야 합니다', stage_not_found: '스테이지를 찾을 수 없습니다', battle_not_finished: '아직 종료되지 않은 전투입니다',
    timeout: '서버 응답이 늦습니다. 잠시 후 다시 시도해 주세요',network: '서버에 연결할 수 없습니다', no_party: '배치할 영웅이 없습니다',
    // 교대 행동(부대 단위 활성화)
    squad_locked: '현재 활성 부대의 행동을 먼저 끝내세요', squad_already_activated: '이번 라운드에 이미 행동한 부대입니다', squad_not_found: '행동할 수 있는 내 부대가 아닙니다',
};
export const errorText = (e) => ERROR_TEXT[e?.code] ?? (() => { try { return messageOf(e); } catch { return e?.message || '오류가 발생했습니다'; } })();
