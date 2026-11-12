# 멀티 랭크/대기열 백엔드 명세 (P5, 2026-11-03)

상태: 백엔드 구현 완료, **기본 닫힘**(`config/game.php` `rank.enabled=false`). 닫힌 동안 `/api/rank/*` 는 전부 `404 rank_disabled`이고 정산 훅도 실행되지 않아 기존 PvP/방/시즌전쟁 동작은 불변이다. FE 미연결.
열기 전 확인: 병종 v2·밸런스 완료, 큐별 정규화(랭크=Lv상한 15·장비 0.5·돌파 off, HANDOFF 결정)는 **아직 미구현**(미결 질문 1).

## 확정 규칙
| 항목 | 값 | config |
|---|---|---|
| Elo K / 시작 | 32 / 1000 | `rank.elo_k`, `rank.start_rating` |
| 시즌 길이 | 28일(4주), 첫 시즌은 현재 주 월요일 05:00 KST 시작, 이후 직전 종료 시각에 이어서 지연 생성 | `rank.season_days` |
| 매칭 허용 차 | `min(600, 100 + floor(대기초/10) x 50)`, 두 사람 중 큰 허용치 이내면 성사. 후보 중 차 최소 -> 오래 기다린 순 | `base_range`,`expand_per_10s`,`max_range` |
| 대기 타임아웃 | 120초(status 폴링 시 자동 취소, `timeout:true`) | `queue_timeout_seconds` |
| 유령 대기 | 20초간 status 폴링 없으면 매칭 후보에서 제외·삭제 | `queue_stale_seconds` |
| 배치 제한 | 매칭 후 180초 내 확정. 한쪽 미확정=그쪽 기권패, 둘 다 미확정=무효(레이팅 불변) | `deploy_timeout_seconds` |
| 게스트 | 참가 불가(403 guest_not_allowed) | `allow_guests` |

## 레이팅 반영 규칙
- Elo 변동은 제로섬(`round(K x (S - E))`, B는 -A). 승 1 / 무 0.5 / 패 0.
- **포기=패**: 진행 중 방 나가기(leave), 턴 타임아웃(연속 미응답), 접속 끊김은 기존 방 로직이 상대 승리로 종료 -> 그대로 승패 반영. 배치 단계 이탈/미확정도 패.
- **무효(void, 레이팅 불변)**: 방 TTL 만료(양쪽 장기 이탈) 등으로 전투가 abandoned 된 경우, 배치 시간 초과로 둘 다 미확정.
- 반영은 `BattleService::settle` pvp 분기 훅에서 `rank_matches.status active->settled` 선점으로 멱등 처리. 랭크 매치(rank_matches 행이 있는 battle)만 대상, 일반 PvP 방은 영향 없음.
- 시즌 경계: 매치는 생성 시점 시즌(`rank_matches.season_id`)에 반영. 시즌마다 레이팅은 1000부터(소프트 리셋 없음, 미결 질문 3).
- 어뷰징 방지는 **설계 메모만**(구현 안 함): 동일 상대 반복 시 N회 이후 레이팅 변동 감쇠/미반영(`rank_matches` 의 (user_a,user_b,최근 24h) 집계로 판정 가능), 매칭 시 직전 상대 제외, 기권패 다발 계정 큐 쿨다운, 최소 진행 라운드 미만 종료 시 변동 축소. 인덱스는 `rank_matches(user_a_id)`,`(user_b_id)` 이미 있음.

## 스키마 (마이그레이션 `2026_11_03_100100_create_rank_tables`, 가산 4테이블, 기존 테이블 변경 없음, 롤백=4테이블 drop)
- `rank_seasons`(id,name,starts_at,ends_at,status active|ended)
- `rank_ratings`(season_id,user_id unique쌍,rating,peak_rating,wins,losses,draws,last_match_at; idx season_id+rating)
- `rank_queue`(user_id unique,rating 스냅샷,queued_at,last_polled_at)
- `rank_matches`(season_id,room_id,battle_id,user_a_id(side a·방장·선공 무작위),user_b_id,rating_a/b_before/after,status active|settled|void,result a|b|draw,reason,settled_at)

## API (인증: 기존 `game.actor` 그룹, 모두 JSON. 오류 형식은 기존 `{error:{code,message}}`)
| 메서드/경로 | 응답 |
|---|---|
| `GET /api/rank/me` | `{season{id,name,starts_at,ends_at}, me{rank(0판이면 null),name,rating,peak_rating,wins,losses,draws,games,is_me}}` |
| `GET /api/rank/ranking` | `{season, entries[상위 50 {rank,name,rating,wins,losses,draws,games,is_me}], me}`. 1판 이상만, 정렬 레이팅 내림 -> 먼저 달성 -> id. 게스트·정지 제외, user_id 미노출 |
| `POST /api/rank/queue` | 큐 등록(멱등) 후 즉시 매칭 시도. 응답은 아래 status 형태. 409 `already_in_room`/`already_in_match`, 403 `guest_not_allowed`/`banned` |
| `DELETE /api/rank/queue` | `{state:'idle',cancelled:bool}`. 이미 매칭됐으면 409 `already_matched` (extra.room_code) |
| `GET /api/rank/matches/{id}` | 내 매치 레이팅 변동: `{match_id,status active|settled|void,result win|loss|draw|null,reason,side,rating_before,rating_after,delta,opponent{name,rating},settled_at}`. 미정산(active)이면 result/after/delta null. 비참가자·없는 id는 404 `match_not_found`, 플래그 off 404 `rank_disabled` |
| `GET /api/rank/queue` | 폴링(권장 2~3초). `{state:'idle', timeout?}` / `{state:'queued', waited_seconds, rating, range, timeout_in}` / `{state:'matched', match_id, room_code, side:a|b, opponent{name,rating}, deploy_deadline_seconds}` |
| 플래그 off | 전부 404 `rank_disabled` |

매칭 성사 후 흐름(기존 방 API 그대로): `room_code` 로 `GET /api/rooms/{code}` 폴링 -> `GET|PUT /deployment` -> `POST /confirm` -> 전투 `actions`. 방은 private pvp, 맵은 pvp_fair 후보 무작위, 두 참가자 ready 상태로 이미 `deployment` 단계. 결과 레이팅은 전투 종료 후 `GET /api/rank/me` 로 확인(전투 종료 직후 변동은 `GET /api/rank/matches/{id}`).

## 미결 설계 질문
1. 큐별 정규화(Lv상한 15·장비 0.5·돌파 off)를 랭크 방 생성 시 어떻게 적용할지(엔진/ArmyBuilder 입력 레벨 캡). 현재는 일반 PvP와 동일 편성.
2. 랭크 보상(시즌 종료 보상/칭호)과 시즌 종료 스냅샷 보관(현재 ended 시즌의 rank_ratings 행이 그대로 남아 기록 역할).
3. 시즌 간 소프트 리셋(예: 새 시즌 시작 = 1000 + (이전-1000)/2).
4. (해결) 매치 결과 조회 API `GET /api/rank/matches/{id}` 추가.
5. (해결) 스케줄러 연동: `routes/console.php` 의 `rank:sweep`(매분, withoutOverlapping)이 `expireStale`+`sweep` 호출. 플래그 off면 no-op. 큐 API 호출 시 지연 평가도 유지. 개발 compose 는 `docker compose up -d scheduler` 필요.
6. 동일 상대 반복 제한 정책 수치.

## FE 후속(윤프론)
- 로비에 랭크 탭: 내 레이팅/시즌 남은 기간(`ends_at`), 랭킹 목록, "랭크 대전 찾기" 버튼(큐 등록 -> 2~3초 폴링 -> 대기 시간·허용 범위 표시 -> 취소 버튼).
- `state:matched` 수신 시 기존 Room 씬(배치 단계)으로 진입. 배치 제한 시간(`deploy_deadline_seconds`) 카운트다운, 이탈 시 기권패 경고.
- 플래그 off(404 rank_disabled)면 탭 숨김. 게스트에게는 정식 계정 전환 안내(403 guest_not_allowed).
- 전투 종료 후 레이팅 변동 표시(`GET /api/rank/matches/{id}`).

## FE 연동 흐름 상세 (윤프론용, 2026-11-03)
1. 진입: `GET /api/rank/me` (404 `rank_disabled` -> 탭 숨김, 403 `guest_not_allowed`/`banned` -> 안내). 랭킹 탭 = `GET /api/rank/ranking`.
2. 대기 등록: `POST /api/rank/queue` -> 응답은 status 형태(`queued` 또는 즉시 `matched`). 409 `already_in_room`(다른 방 참가 중), 409 `already_in_match`(진행 중 랭크 매치 -> `GET /api/rank/queue` 로 `matched` 복귀).
3. 대기 중 폴링 `GET /api/rank/queue` 2~3초(20초 이상 끊기면 유령 대기로 큐에서 삭제): `queued{waited_seconds,rating,range,timeout_in}` -> `matched` 로 바뀌면 폴링 종료. 120초 초과 시 `{state:'idle',timeout:true}`(큐 자동 취소, 재등록 안내).
4. 취소: `DELETE /api/rank/queue` -> `{state:'idle',cancelled:bool}`. 이미 매칭됐으면 409 `already_matched`(extra.room_code 로 방 복귀).
5. 매칭 성사 응답: `{state:'matched', match_id, room_code(8자), side:'a'|'b', opponent{name,rating}, deploy_deadline_seconds(=180)}`. **battle id 는 이 응답에 없다** — 방 응답 `GET /api/rooms/{room_code}` 의 `battle` 뷰(+`room.status`)로 얻는다. 방은 private pvp, 두 사람 ready, 이미 `deployment` 단계.
6. 이후 순서(기존 방 API, 모두 `room_code`): `GET /api/rooms/{code}` 폴링(1.5~2초; players[].connected, turn, last_seq, events, battle, result) -> `GET /api/rooms/{code}/deployment`(영역/후보) -> `PUT .../deployment {placements:[{user_hero_id,x,y}]}` -> `POST .../confirm`(양측 확정되면 전투 시작, side a 선공) -> 내 턴에 `POST .../actions` -> 종료 시 방 응답 `result` 또는 `GET /api/rank/matches/{match_id}`.
7. 배치 제한: 매칭 후 `deploy_deadline_seconds`(180) 안에 confirm. 한쪽만 확정=미확정 쪽 기권패, 둘 다 미확정=무효(레이팅 불변). 방 나가기(`POST .../leave`)·턴 타임아웃·접속 끊김은 기권패.
8. 결과: `GET /api/rank/matches/{match_id}` -> `{status:'active'|'settled'|'void', result:'win'|'loss'|'draw'|null, reason, side, rating_before, rating_after, delta, opponent, settled_at}`. active 면 result/after/delta 가 null 이므로 1~2초 간격으로 재조회. 이후 `GET /api/rank/me` 로 갱신된 레이팅·승패.
9. 에러 코드 요약: 404 `rank_disabled`·`match_not_found`·`room_not_found`; 403 `guest_not_allowed`·`banned`·`not_host`; 409 `already_in_room`·`already_in_match`·`already_matched`·`deployment_missing`(confirm 전 배치 미제출)·`deployment_closed`·`battle_finished`·`turn_timeout`; 422 `campaign_only_hero`(배치에 캠페인 전용 영웅). 형식 `{error:{code,message,extra?}}`.
10. 아직 없는 것: 큐별 정규화(Lv상한·장비 감쇠)는 미구현이라 일반 PvP 와 같은 편성이다(미결 질문 1). 시즌 보상/칭호·소프트 리셋 없음.

## 2차 구현 (2026-11-03, 미결 질문 1·3·6 및 시즌 종료/보상 골격)
모두 `config/game.php` `rank.*` 로 조정한다. `rank.enabled=false` 는 그대로(닫힘).
- **큐별 정규화**(`rank.normalize`): 랭크 매치 방(`rank_matches` 행이 있는 방)에서만 `RoomService::beginBattle` 이 영웅 레벨을 `level_cap`(15)으로 깎고 장비 합계에 `equip_scale`(0.5)을 곱해 내림한다(`EquipmentService::attach` 의 추가 배율). 일반 PvP·solo·캠페인 불변. `breakthrough=false`: 별(star)·조각 돌파는 현재 어떤 전투 입력에도 반영되지 않으므로 별도 처리가 없다(명시용).
- **어뷰징 방지 1차**(`rank.abuse`, 보수적 기본값): 같은 두 사람의 24시간 내 N번째 매치 변동 배율 = 1~3번째 100%, 4~6번째 50%, 7번째부터 0%; 직전 상대는 어느 한쪽이 60초 이상 기다리기 전까지 매칭 제외; 60분 안 기권패 3회 이상이면 마지막 기권 후 10분간 큐 등록 불가(429 `queue_cooldown`, extra.retry_after 초); 정상 종료인데 턴 3 미만이면 변동 25%(기권패는 축소 없음). 변동은 항상 제로섬(A 변동을 반올림해 B 에 반대 부호).
- **시즌 종료/소프트 리셋**: `sweep()`(`rank:sweep` 스케줄 매분 + 큐 API 지연 평가)이 `closeSeasons()` 를 호출해 기간이 끝난 active 시즌을 `ended` 로, 진행 중(active) 매치가 하나도 없는 `ended` 시즌을 `final` 로 바꾼다. 진행 중이던 매치는 생성 시점 시즌(옛 시즌)에 정산된다. 새 시즌은 `currentSeason()` 이 지연 생성하며 유저의 첫 레이팅 = `1000 + (이전 시즌 레이팅 - 1000) x season_carry_pct(50)/100`(승·패 수는 이월 없음).
- **티어/보상 골격**: `rank.season_rewards.tiers`(청동 0·은 1100·금 1250·백금 1400·다이아 1600, gold/title 은 비어 있음)로 `/api/rank/me`·`/ranking` 의 `me.tier{code,name}` 를 낸다. `RankService::rewardPlan(seasonId)` 은 `min_games`(5) 이상 유저의 티어별 보상표를 계산만 하며 **지급은 구현·활성화하지 않았다**(`season_rewards.enabled=false`). 보상 금액·칭호는 임밸런/문기획 확정 후 채운다.

## 시즌 보상 지급 커맨드와 이월 보정 (리뷰 반영)
- `php artisan rank:pay-rewards {season?} [--dry-run]`: final 시즌만 지급(시즌 생략 시 final 전부). `rank.enabled=false` 또는 `season_rewards.enabled=false` 면 무동작. 중복 방지는 `quest_event_log(event=rank_season_reward, ref=s{시즌id})`, 칭호는 지급하지 않는다. 스케줄러 등록은 하지 않았다 — 제안: 시즌 확정(`RankService::sweep`/`closeSeasons`) 이후 하루 1회 `rank:pay-rewards` 를 `schedule` 에 추가(재실행 안전).
- 소프트 리셋 이월 보정: 새 시즌 행은 처음 만들 때 이전 시즌 레이팅으로 이월되는데, 이전 시즌에 진행 중 매치가 남아 있으면 값이 낡을 수 있다. 이전 시즌이 `final` 로 확정되는 시점에 다음 시즌의 아직 한 판도 치르지 않은 행(wins+losses+draws=0)만 최종 레이팅 기준으로 다시 계산한다(`RankService::refreshCarry`). 이미 치른 행은 변경하지 않는다.
