# 개인 PvP 전적 API와 채팅 운영 보강 (2026-11-03)

## 1. GET /api/me/record[?page=1&per_page=20]
- 인증: 일반 게임 API와 동일(game.actor). per_page 1~50(기본 20).
- 집계 원본: `battles` (mode=pvp, status=finished). 나 = `user_id`(방장, side a) 또는 `opponent_user_id`(참가자, side b). 스키마 변경 없음.
- 포함 범위: 랭크/일반 PvP 방 전투 전부(인정 여부 `pvp_recognized`와 무관, 종료된 대전 전부). solo(자유 대전)·스테이지·시즌 영토 전투 제외.
- 게스트 정책: **전적은 계정(회원)당 집계, 게스트는 `guest:true` + 빈 목록/0 요약**(저장은 되지만 노출 안 함).
- 개인정보: 상대는 `opponent_name`(주인공 표시명 규칙, '#' 앞 12자)만. user id·이메일 없음.

응답
```
{ guest: bool,
  summary: { wins, losses, draws, total, win_rate(승/전체, 0~1, 전적 없으면 null), win_rate_decided(승/(승+패)), recent10: ["win"|"loss"|"draw" ... 최신순 최대 10] },
  records: [ { battle_id, result: "win"|"loss"|"draw",
               reason: "normal"|"forfeit_left"(나가기/포기)|"forfeit_disconnect"(접속 끊김)|"forfeit_timeout"(시간 초과 연속),
               forfeit_by_me: bool(결과가 패배이고 사유가 forfeit_* 이면 true = 내가 포기/타임아웃),
               opponent_name, map_name, my_side: "a"|"b", rounds, ended_at(ISO8601) } ... 최신순 ],
  page: { page, per_page, total, last_page } }
```
- `winner`가 a/b가 아니면 draw. 상대 계정이 삭제되면 `opponent_name`은 빈 문자열.
- 성능: 요약은 내 PvP 행(user_id/opponent_user_id 조건)을 가볍게 훑는다. 전적이 수천 건 규모가 되면 `battles(opponent_user_id, mode, status)` 인덱스 또는 집계 캐시를 검토(현재 미추가, MySQL은 FK 인덱스 존재).

## 2. 채팅 운영
- 폴링 응답 `GET /api/rooms/{code}/messages`, `GET|PUT /api/rooms/{code}/chat-settings`에 `restricted_until`(ISO8601 또는 null) 추가. 제재 중(미래 시각)일 때만 값, 본인 것만 노출. `cannot_send_reason=chat_restricted`와 함께 FE가 해제 시각을 보여 줄 수 있다.
- 관리자 전용(`role=admin`, 기존 `/api/admin/*` 미들웨어, throttle 60/분):
  - `GET /api/admin/chat/reports[?status=open|all&page=]` : 신고 큐(최신순 50건 페이지네이션, Laravel paginate 형식). `open`(기본)은 메시지가 삭제되지 않은 신고만. 항목: `id, message_id, reason, body(신고 시점 원문 스냅샷), counts, created_at, room_code, message_deleted_at, target_user_id, target_name, target_restricted_until, reporter_user_id, reporter_name`.
  - `DELETE /api/admin/chat/messages/{id}` : 메시지 소프트 삭제(`deleted_at`), 멱등(`{ok,already_deleted}`), `audit_logs`에 action=`chat_delete` 기록. 신고 스냅샷(body)은 남는다. 없는 id는 404 `message_not_found`.
- 미구현(후속 후보): 관리자의 수동 제재 해제/부여, 신고 "처리 완료" 상태 컬럼.
