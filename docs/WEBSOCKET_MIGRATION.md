# 웹소켓 전환 조사·설계 (1차, 코드 변경 없음)

작성 2026-11-15. 사용자 지시("레전드리워도 웹소켓 방식으로", "모든 서버와의 통신을 웹소켓으로만")로 `SEASON_WAR_DESIGN.md`의 "Redis/WebSocket 도입 금지" 제약은 번복된다. 참고: 삼넷 `docs/migration/world_realtime_ws.md`(Reverb 1단계, 개발 환경 한정). 운영 적용은 별도 승인.

## 1. 현재 통신 전수 (routes/api.php 기준, 약 110개 엔드포인트)

인증: 회원 = Sanctum SPA 쿠키(+CSRF), 게스트 = `X-Guest-Token` 헤더(`ResolveActor`). 공통 `throttle:game` 300/분/유저. 서버는 `php artisan serve`(워커 6) + SQLite.

### 1-1. 실시간성이 필요한 흐름 (폴링 중)
| 흐름 | 엔드포인트 | 현재 주기 | 비고 |
|---|---|---|---|
| 방 대기실 | GET /rooms/{code}?after_seq | 1.5s(탭 숨김 4s, 오류 백오프 최대 10s) `scenes/Room.js` | 상태 전이(시작·배치) 감지 |
| PvP 방 전투 | GET /rooms/{code}?after_seq (battleStore.pollOnce) | 1.5s / 숨김 4s / 백오프 10s | 이벤트 시퀀스(after_seq) 기반. 폴링이 서버 tick(자동 종료·시간 초과·90초 끊김 기권)을 유발 |
| 방 채팅 | GET /rooms/{code}/messages?after_id | 열림 1.5s, 닫힘 4s, 오류 백오프 15s `ui/RoomChat.js` | throttle chat-read 120/분 |
| 랭크 대기열 | GET /rank/queue | 2s (lobbyRank.POLL_MS) | 매칭 성사 감지 |
| 시즌 전쟁 안 읽음 | GET /war/unread | 60s + 탭 복귀 시 (Lobby) | War 씬 상태/지도/전황은 진입 시 1회 조회, 주기 폴링 없음 |
| 로비 방 목록 | GET /rooms | 진입·수동 갱신(주기 폴링 미확인) | |

### 1-2. 명령·조회 (요청-응답, 폴링 아님)
| 영역 | 엔드포인트 |
|---|---|
| 인증 | POST /guests, /auth/register, /auth/login, /auth/logout, GET /auth/me, /auth/check-name |
| 공개 | GET /announcements, /maintenance, /rules, POST /client-errors |
| 방 | POST /rooms, /rooms/join, {code}/leave, /ready, /start, /confirm, /actions; PUT {code}/deployment; GET {code}/deployment, /maps, /maps/{code}/preview |
| 채팅 | POST {code}/messages, /messages/{id}/report; GET/PUT chat-settings |
| 스토리 전투(봇) | POST /battles/{id}/actions, /forecast, /abandon, /bot-turn, /confirm; PUT deployment; GET /battles/active, {id}, /units/{unit}/moves, /result |
| 시즌 전쟁 | GET /war/active, seasons, state, map, preview, ranking, events, my-battles, history; POST /war/join, /war/territories/{code}/attack |
| 랭크 | POST/DELETE /rank/queue, GET /rank/me, /rank/ranking, /rank/matches/{id} |
| 육성·상점 | profile, protagonist, tutorial, ranking, me/record, quests(+claim), heroes(+star-up), shop/*, items, inventory, equipment, party, lineup, gacha(+pull), pen, exchange(+buy), dex, stages(+sweep, challenge), hidden-chapter |
| 관리자 | /admin/* (config, users, battles, audit-logs, client-errors, announcements, maintenance, exchange, chat 신고/제재, war season) |

서버가 직접 시간 기반으로 처리하는 것: `war:tick`(시간당), 랭크 sweep(매분)은 scheduler 컨테이너(profile `scheduler`). 방 전투 tick은 폴링 요청에 얹혀 있음(전환 시 반드시 대체 필요).

## 2. 전환 설계

### 2-1. 핵심 판단: "웹소켓으로만"의 해석
| 방식 | 장점 | 위험 |
|---|---|---|
| A. 서버→클라 푸시만 WS, 명령은 HTTP (권장 1~2단계) | 기존 검증·트랜잭션·throttle·CSRF·게스트 헤더 인증 유지. 롤백 쉬움. Reverb 표준 패턴이라 삼넷 선례 재사용 | "모든 통신 WS 전용"에는 미달 |
| B. 명령도 WS(client whisper/자체 프로토콜) | 요청 1왕복 단축, 지시 문구에 부합 | Reverb(Pusher 프로토콜)는 서버 앱 로직 실행용 RPC가 아님: client event는 다른 클라에 중계만 되고 Laravel 컨트롤러를 호출하지 않는다. 즉 명령 수신 서버를 따로 만들어야 함(Ratchet 등 커스텀) = 인증·검증·에러·재시도·멱등·rate limit·서비스 계층 재배선, 게스트 토큰 인증, artisan serve+SQLite 쓰기 경합, 테스트 체계 전면 재작성 |
| C. 하이브리드 | 푸시는 WS, 명령 중 실시간 핵심(전투 action, 채팅 send)만 후속 단계에서 WS RPC | 두 경로 정합성 관리 필요 |

권고: **A로 시작 -> 효과 검증 후 C**. 인증이 필요한 일회성 명령(로그인·구매·가챠·가입)과 파일성 조회는 WS 이관 실익이 없고 위험만 크다. "모든 통신 WS 전용"은 최종 목표로 두되, 전투 명령 WS RPC는 별도 커스텀 서버 승인 후 결정해야 한다(사용자 확인 필요 항목). 모든 푸시 payload는 삼넷 방식대로 **최소 ping(seq/id)** + 기존 HTTP 재조회로 마스킹·권한 정책 불변.

### 2-2. 채널·이벤트
| 채널 | 구독 조건 | 이벤트 | payload |
|---|---|---|---|
| private `room.{code}` | 해당 방 참가자만 | `room.changed`(상태·준비·배치·턴·이벤트 발생), `room.closed` | `{seq}` -> 클라가 `GET /rooms/{code}?after_seq` 1회 |
| private `room.{code}.chat` | 방 참가자(채팅 설정/제재 반영) | `chat.message`(또는 `chat.changed`) | `{id}` -> messages?after_id. 제재·삭제는 `chat.removed {id}` |
| private `user.{id}` | 본인 | `rank.matched {match_id}`, `war.unread {count}`, `notice` | 최소 id/숫자 |
| public/ presence 없음 | 전체 공지·점검: private `lobby`(로그인 전원) | `maintenance.changed`, `announcement.changed` | 플래그만 |
| private `war.{season_id}` (후속) | 시즌 가입자 | `war.changed {seq}` | 이후 /war/events 재조회 |

이벤트 발행: 삼넷과 동일하게 `DB::afterCommit` + 큐 잡(지연·합치기)으로 요청 경로에서 소켓 전송을 하지 않는다. PvP 전투는 지연 합치기 없이 즉시(지연 1초 금지, `ShouldBroadcastNow` 또는 전용 큐) 검토 필요.

### 2-3. 인증
- 채널 인증 `POST /api/broadcasting/auth`: **게스트(X-Guest-Token) 지원이 삼넷과 다른 핵심 차이**. Sanctum 쿠키만으로는 게스트 인증 불가 -> `game.actor`(ResolveActor)를 이 라우트에 적용하고 Echo `auth.headers`에 `X-Guest-Token`(회원이면 `X-XSRF-TOKEN`) 주입. `Broadcast::routes` 대신 커스텀 라우트 + `Broadcast::channel` 콜백이 `$request->user()`(ResolveActor가 setUserResolver) 기준으로 방 참가 여부 검사.
- 정지·점검 게이트 적용. 방 퇴장·밴 시 구독 유지 문제: payload가 ping뿐이므로 정보 유출 없음(재조회 시 HTTP 권한 검사).

### 2-4. 단계별 마이그레이션·폴백
- 원칙: **폴링 코드는 제거하지 않는다.** WS 구독 성공 시 폴링 간격을 안전망(15~30s)으로 늘리고, 연결 오류/구독 실패/`unavailable` 시 즉시 기존 주기로 복귀, 재연결 직후 1회 즉시 조회로 누락 보정. `BROADCAST_CONNECTION=log` 이면 서버는 기존과 완전 동일 동작.
- 1단계: 인프라 + 방/PvP 전투/채팅 푸시. 2단계: 랭크 매칭·war unread·공지/점검. 3단계: 시즌 전쟁 `war.changed`, 방 전투 tick 서버 이관. 4단계(승인 시): 전투 명령·채팅 전송 WS RPC 검토, 폴링 안전망 장기화.
- 주의(필수): 현재 **방 전투의 시간 초과·기권(90초 끊김) 처리가 폴링 요청에 의존**. 푸시 전환으로 폴링이 15s 이상으로 줄면 판정 지연 -> scheduler/큐에 방 tick 잡(예: 5~10초) 추가가 선행돼야 함.

## 3. 인프라 영향
- 신규 compose 서비스(프로젝트명 `laravel-app` 고정 유지, 기존 `vendor/dbdata` 등 볼륨 이름·컨테이너명 변경 없음): `reverb`(`php artisan reverb:start --host=0.0.0.0 --port=8080`), `queue`(`queue:work database`). 둘 다 app과 같은 소스·`vendor`·`dbdata` 볼륨 공유(scheduler 서비스 패턴 재사용). 삼넷처럼 profile 분리 또는 기본 기동 여부는 결정 필요.
- 포트: 호스트 `127.0.0.1:8080`(8000 app, 5173 vite와 충돌 없음). 브라우저는 `ws://localhost:8080`. 운영은 nginx에서 `/app`(Upgrade 헤더) 프록시 + TLS(wss) 필요(`deploy_nginx_tuning.md` 갱신 대상).
- 패키지: composer `laravel/reverb`, npm `laravel-echo`·`pusher-js`. 신설 파일 `config/broadcasting.php`, `config/reverb.php`, `routes/channels.php`. env: `BROADCAST_CONNECTION=reverb`, `REVERB_APP_ID/KEY/SECRET/HOST/PORT/SCHEME`, `VITE_REVERB_*`(값 커밋 금지, `.env.example`엔 빈 값). Dockerfile은 pcntl 이미 설치. Reverb 이벤트 루프 확장(ext-uv)은 선택(동시접속 수백 이하면 불필요).
- DB/큐: 큐 `database` 드라이버 + SQLite 단일 파일이므로 쓰기 경합 증가 -> 푸시 잡은 합치기·지연으로 건수 최소화, jobs 테이블 마이그레이션 존재 여부 확인 필요(`QUEUE_CONNECTION=database` 기본값은 있음). 동시접속 증가 시 MySQL 전환 별건. 수평 확장(Redis scaling) 미사용, 단일 Reverb 프로세스.
- 기존 서버 `artisan serve`(워커 6)는 WS를 처리하지 않으며 영향 없음. 장시간 연결은 Reverb가 전담.
- 효과: 현재 방 전투 1.5s + 채팅 1.5s + 대기열 2s 폴링이 유저당 분당 최대 약 100~160회 요청이므로(300/분 throttle과 근접) 푸시 전환 시 요청 수가 크게 줄어 SQLite·6워커 부담 완화.

## 4. 1단계 구현 범위 제안 (효과 순)
1. 인프라: reverb·queue 서비스, 패키지, `broadcasting/auth`(회원+게스트), env. 개발 환경 한정.
2. **방/PvP 전투 `room.{code}` 푸시**: 폴링 부하·지연 체감이 가장 큼(1.5s 폴링 -> 즉시 반영). 발행 지점은 RoomService의 상태 변경/행동 처리 후 `afterCommit`. FE는 `battleStore.pollOnce`·`Room.js`에 Echo 리스너 + 폴링 간격 가변.
3. **방 채팅 푸시**(`chat.message`): 2번과 같은 인프라, 폴링 120/분 한도 해소.
4. (1단계 말미 선택) 랭크 매칭 `user.{id}` `rank.matched`.
- 제외(2단계 이후): 시즌 전쟁, 공지/점검, 전투 명령 WS 전송, 방 tick 서버 이관(단 푸시로 폴링을 늘리기 전에는 반드시 선행).
- 검증: 단위(발행->큐 1건, `log` 드라이버 무동작, 방 비참가자 채널 인증 403, 게스트 인증 성공), FE 실화면(방 2클라이언트 동기화·Reverb 중단 시 폴링 복귀).

## 5. 결정/확인 필요
1. "명령도 WS" 요구 여부와 커스텀 WS 서버 허용(2-1 B안). 권고는 A -> C.
2. reverb·queue를 기본 `up` 포함할지(profile 여부).
3. 운영 반영 시점·TLS/nginx 승인(삼넷과 동일하게 개발 환경 한정 시작 권고).
4. 위험: 방 전투 tick이 폴링 의존, 게스트 채널 인증, SQLite 큐 쓰기 경합.

## 6. 진행 상태 (1단계 구현, 2026-11-15, 개발 환경 한정)
권고안 A(서버->클라 푸시 WS, 명령은 HTTP 유지) 적용. 운영 반영(nginx wss/TLS)·`.env` 키는 별도 승인.

| 항목 | 상태 | 내용 |
|---|---|---|
| 인프라 | 완료 | `laravel/reverb ^1.13`, npm `laravel-echo`·`pusher-js`. compose `reverb`(**호스트 127.0.0.1:8081**만 노출 -> 컨테이너 8080. 호스트 8080 은 samnet-reverb 가 사용 중이라 충돌 회피)·`queue`(database) 서비스 추가(프로젝트명·볼륨 불변). 기동: `docker compose up -d reverb queue` (+ tick 용 `--profile scheduler up -d scheduler`). 빌드 시 `VITE_REVERB_PORT=8081` |
| 키·설정 | 완료 | `.env` 금지 규칙(AGENTS.md)에 따라 키/시크릿은 gitignore 된 **`.env.reverb`**(compose `env_file`, 없으면 broadcast 비활성). `BROADCAST_CONNECTION=reverb` 일 때만 푸시, 아니면 기존과 동일. 빌드 시 `VITE_REVERB_APP_KEY/HOST/PORT/SCHEME`(키는 공개값) 필요 |
| 채널 인증 | 완료 | `POST /api/broadcasting/auth`(`withBroadcasting`, 미들웨어 api+`game.actor`): 회원 쿠키·게스트 `X-Guest-Token` 모두 지원, 방 참가자만 통과. FE 는 `api()` 로 호출해 기존 헤더/CSRF 재사용 |
| 푸시 | 완료 | private `room.{code}`: `room.changed {seq}`(join/leave/ready/start/confirm/action/기권·tick, pvp 방만), private `room.{code}.chat`: `chat.message {id}`. 커밋 후(`DB::afterCommit`) `ShouldBroadcastNow` 즉시 전송, 실패는 삼키고 report(Guzzle timeout 2초). 발행 진입점 `App\Support\RoomRealtime` |
| 서버 tick | 완료 | `RoomService::tickAll()` + `routes/console.php` `room:tick`(5초, scheduler 서비스 필요: `docker compose up -d scheduler`). 폴링 지연 tick 도 유지 |
| FE | 완료(빌드까지) | `api/realtime.js`(`watchRealtime`) -> Room.js·battleStore(pvp)·RoomChat 가 구독, 푸시 시 즉시 재조회. 구독 성공 시 폴링 20초(안전망), 끊김/구독 실패 시 즉시 기존 1.5~4초 복귀, 재연결 직후 1회 즉시 조회. 폴링 코드는 제거하지 않음 |
| 미적용(3단계~) | 대기 | 공지/점검(`maintenance.changed`·`announcement.changed`), 시즌 전쟁 War 씬 내부 실시간 갱신, 명령 WS RPC(B/C안, 별도 승인) |

### 6-2. 2단계 구현 (2026-11-15, 개발 환경 한정, 빌드·재기동은 팀장 몫)
| 항목 | 상태 | 내용 |
|---|---|---|
| 앞단 프록시(같은 출처) | 코드 완료 | compose `proxy`(nginx:alpine, `docker/nginx-dev.conf`): **호스트 :8000 -> 컨테이너 80**, `/`=app:8000, `/app/`·`/apps/`=reverb:8080(Upgrade). app 은 호스트 포트 게시 해제(`expose 8000`), reverb 직접 노출 127.0.0.1:8081 은 유지(비상 경로). 변수 proxy_pass+resolver 라 reverb/app 이 꺼져도 기동. 포트: 레전드리 8000·8081·5173, 삼넷 8100·8080(충돌 없음). 적용: `docker compose up -d app proxy reverb queue` (app 재생성 필요) |
| FE 접속 설정 | 완료 | `VITE_REVERB_HOST` 미지정이면 현재 접속 출처(호스트·포트·프로토콜)의 `/app` 로 접속(`wss` 자동). 기존 `.env.reverb` 의 `VITE_REVERB_PORT` 는 HOST 를 지정할 때만 사용 -> 값 변경 불필요, **재빌드만 필요**(`VITE_REVERB_APP_KEY` 필요) |
| 채널·이벤트 | 완료 | `RealtimePing`(공용 ShouldBroadcastNow): private `user.{id}` `rank.matched {match_id}`(매칭 양쪽, 본인만 인증) / private `war.{season}` `war.changed {seq}`(WarService::event 훅, 시즌 가입자만, 시즌당 3초 합치기) / private `lobby` `lobby.changed`(공개 pvp 방 생성·참가·퇴장·시작, 1초 합치기, 로그인 전원) / `room.{code}.chat` `chat.removed {id}`(관리자 삭제 id>0, 제재·해제 id=0 -> 상태 재조회). 진입점 `RoomRealtime` |
| 서버 매칭 | 완료 | `RankService::matchQueued()` + `routes/console.php` `rank:match`(5초, scheduler). 폴링 없이도 매칭되므로 연결 시 대기열 폴링을 2초 -> 10초로 확대(서버 stale 20초 미만 유지) |
| FE | 완료 | lobbyRank(user 채널, 연결 시 10초/끊김 2초), Lobby(war 채널: 연결 시 60초 -> 180초 안전망, lobby 채널: 방 목록 탭 자동 갱신·코드 입력 중 제외), RoomChat(`chat.removed`: 삭제 반영) |
| 테스트 | 완료 | `RoomRealtimeTest`: user/war/lobby 채널 인증(남의 user·비가입 war 403), lobby ping, war ping 합치기 |

운영 메모: Reverb 와 queue/scheduler 가 꺼져도 게임은 폴링으로 동작한다(scheduler 가 꺼지면 tick 은 폴링 요청 기반으로만 처리됨). `config/reverb.php` allowed_origins 는 기본 `*`(개발) — 운영 전 도메인 제한 필요. 실화면 검증(2클라이언트 동기화, Reverb 중단 시 폴링 복귀)은 강화면 몫.
