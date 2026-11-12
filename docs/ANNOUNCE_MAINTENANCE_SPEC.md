# 공지 · 점검 모드 BE 명세 (#16)

원본 API 주석은 `routes/api.php`.

## 데이터
- `announcements`: kind(notice|event|maintenance), title(100), body(4000), pinned, enabled, starts_at/ends_at(null=무제한), created_by.
- `app_settings(key, value json)`: 키 `maintenance` = `{enabled, message, starts_at, ends_at}`.

## 공개 API (점검 중에도 허용)
- `GET /api/announcements`: enabled 이고 기간 내인 공지, 고정 우선 최신순 최대 50.
- `GET /api/maintenance`: `{active, enabled, message, starts_at, ends_at}`. active = enabled 이고 시작 시각 이후, 종료 시각 이전.

## 점검 모드 동작 (`CheckMaintenance`, api 그룹 전체에 적용)
- active 이면 /api/* 는 비관리자에게 503 `{error:{code:"maintenance", message, ends_at}}` + `Retry-After: 60`.
- 허용: `auth/login`, `auth/logout`, `auth/me`, `rules`, `announcements`, `maintenance`, 그리고 Sanctum 인증된 `role=admin` 의 모든 요청(어드민 우회).
- `/sanctum/csrf-cookie` 는 api 그룹 밖이라 영향 없음.
- app_settings 조회 실패·테이블 없음이면 점검으로 막지 않는다.
- FE: 503 maintenance 응답을 받으면 점검 화면(message, ends_at)을 보여주고, 주기적으로 `GET /api/maintenance` 로 해제 여부를 확인한다. 게스트·일반 회원은 로그인 화면 진입은 가능하지만 이후 API 는 막힌다.

## 어드민 API (role=admin)
- `GET|POST /api/admin/announcements`, `PATCH /api/admin/announcements/{id}` (삭제 없음, enabled=false).
- `GET|PUT /api/admin/maintenance {enabled, message?, starts_at?, ends_at?, confirm:"MAINTENANCE"(켤 때 필수)}`.
- 감사: audit_logs entity=`announcements`(announcement_create|update), `maintenance`(maintenance_set, before/after).
- 점검을 켜 둔 채 관리자가 로그아웃해도 다시 로그인할 수 있다(login 허용). 해제는 PUT enabled=false 또는 ends_at 경과.

## 변경 이력 (2026-11-04 정검수 반영)
- 공지·점검의 `starts_at`/`ends_at` 는 입력 시각(타임존 오프셋 포함 가능, 없으면 UTC 로 해석)을 UTC `Y-m-d H:i:s` 로 정규화해 저장한다.
- 점검 상태는 8초 캐시(`Cache::remember`), `PUT /api/admin/maintenance` 가 즉시 무효화한다. 다중 서버에서 캐시 저장소가 공유되지 않으면 해제가 최대 8초 늦을 수 있다.
- 공지 생성·수정, 점검 설정은 `reason` 필수(감사 로그 `after._reason`).
- `GET /api/admin/announcements` 는 Laravel 페이지네이션 형식(`data`, `total`, `current_page`, `per_page` ...)이다(`per_page` 선택, 기본 50).
