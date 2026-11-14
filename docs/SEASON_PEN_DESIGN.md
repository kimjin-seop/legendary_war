# 시즌 포인트 재화 '펜' BE 설계 (초안, 구현 전 — 기획 확정 필요)

상태: 설계 문서. 코드·DB 변경 없음. 자동 전투는 어떤 경로로도 도입하지 않는다.

## 1. 목적과 전제
- '펜'은 시즌 전쟁(`seasons`)에서 얻어 시즌 전용 상품(교환소 `currency` 상품 등)에 쓰는 재화로 가정한다.
- 기존 재화 인프라(`wallets`, `wallet_transactions`, `ProgressionService::credit`)를 그대로 쓴다. 새 재화 코드는 `pen`(`currency_code`) 하나이며 지갑 행은 첫 지급 때 생성된다.
- 멱등은 `credit(userId, 'pen', amount, reason, refType, refId)` 의 `(wallet, reason, ref_type, ref_id)` 유니크로 보장한다(이중 지급 불가).
- 확정이 필요한 가정: (a) 시즌 간 이월 여부, (b) 획득 원천과 수량, (c) 사용처, (d) 일일/시즌 획득 상한.

## 2. 획득 원천(제안)
기존 시즌 전쟁 정산 지점에 1줄 지급을 붙이는 방식이다. 각 지점은 이미 중복 지급 방지(유니크)가 있어 같은 키를 refId 로 재사용한다.

| 원천 | 지점 | reason | ref(type,id) | 제안 수량 |
|---|---|---|---|---|
| 영토 공격 승리 | `WarService::attack` 정산, `territory_contributions(kind=attack_win)` 삽입과 같은 트랜잭션 | `war_pen_attack` | (`territory_battle`, battle id) | 기여 점수 x 1 (config `war.pen.attack_mult`) |
| 점령 성공 보너스 | `capture_bonus` 삽입 지점 | `war_pen_capture` | (`territory_battle`, battle id) | 고정 20 |
| 시즌 종료 순위 보상 | `WarTickService` 시즌 확정(`season_results` 삽입 직후) | `war_pen_season_rank` | (`season_result`, season id) 단, 유저별이라 ref 는 `season_members.id` | 상위 기여자 순위표(1위 300, ~10위 150, 참여 50) |
| 승리 국가 보너스 | 같은 지점 | `war_pen_season_win` | (`season_member`, member id) | 승리 국가 소속 +100 |

- 지급 수량은 `config/war.php` 의 `pen` 블록(`attack_mult`, `capture`, `rank_table`, `win_bonus`, `daily_cap`)으로 외부화한다.
- 일일 상한: `DailyCounter::tryIncrement('war_pen:user:{id}', daily_cap, amount)` (KST 05:00). 초과분은 지급하지 않는다(전투 결과는 유지). 시즌 종료 보상은 상한 밖.
- `credit()` 은 재화 마이너스 방지만 한다. 상한 로직은 호출부에서 처리한다.

## 3. 사용처
- 2026-11-14 확정: **소환(가챠)은 펜으로 결제**한다(`game.gacha.currency='pen'`, 1회 1펜/10연 9펜, `GAME_GACHA_CURRENCY=gold` 로 골드 롤백). 공급: 신규 시작 10, 튜토리얼 완료 5, PvE 스테이지 첫 클리어 1, 일일 퀘스트 5, 시즌 전쟁·랭크전(일일 상한 20, 시즌 종료 보상은 상한 밖). 기존 계정은 `game:grant-pen-switch` 로 10 보정(개발 DB 전용). 수치는 임밸런 후속 검증.
- 1차: 교환소(`exchange_products`)에 `price_currency` 컬럼(기본 `gold`)을 추가해 `pen` 으로 결제하는 상품을 허용한다. `ExchangeService::buyTx` 의 골드 차감을 `price_currency` 로 일반화하고, 시즌 전용 상품은 `season_scope`(시즌 시나리오 코드 또는 null) 로 구분한다.
- 소비 reason: `exchange_buy_pen`, ref=(`exchange_purchase`, 구매 id). 환불·되돌리기는 지원하지 않는다.

## 4. 시즌 경계·이월
- 안 A(권장 시작값): 이월한다. 단순하고 이중 소멸 이슈가 없다. 대신 총 발행량 관리를 위해 시즌당 획득 상한(`season_cap`)을 둔다.
- 안 B: 시즌 종료 시 소멸. 구현은 `WarTickService` 종료 지점에서 `pen` 잔액을 `credit(-balance, reason=war_pen_expire, ref=season_member id)` 로 0 만들며 로그를 남긴다. 소멸 공지가 필요하다.
- 결정 전까지 안 A 로 구현하고 안 B 는 `war.pen.expire_on_season_end` 스위치로 후속 추가한다.

## 5. API(제안)
- `GET /api/profile` 응답에 `pen`(잔액) 추가, 기존 지갑 응답 형식을 따른다.
- `GET /api/war/pen` -> `{balance, earned_today, daily_cap, season_earned, season_cap, recent[{reason,delta,created_at}]}` (최근 20건, `wallet_transactions` 조회).
- 어드민: `GET /api/admin/war/pen?user_id=` 지갑·최근 거래 조회, `POST /api/admin/war/pen/adjust {user_id, delta, reason(필수)}` (운영 보정, `credit` ref=(`admin_adjust`, audit_logs id), audit 기록, `confirm` 필요).

## 6. 마이그레이션·데이터
- 신규 테이블 없음(지갑 재사용). 선택: `exchange_products.price_currency`(string, 기본 gold), `exchange_products.season_scope`(nullable).
- 통계용: `wallet_transactions` 에 reason 인덱스가 없다면 `(reason_code, created_at)` 인덱스 추가 검토.

## 7. 테스트 계획(구현 시)
1. 영토 공격 승리 정산 1회 -> pen 지급, 같은 battle 재정산 시 중복 지급 없음.
2. 일일 상한 초과분 미지급, 전투 결과 불변.
3. 시즌 종료 tick 2회 실행해도 순위 보상 1회만.

## 8. 리스크
- 시즌 정산 지점이 이미 복잡해(동시 tick) 지급을 같은 트랜잭션에 넣어야 한다. 별도 지급은 이중 지급·누락 위험.
- 시나리오(imjin/france/rome) 동시 시즌이면 유저가 여러 시즌에서 획득 가능 -> 시즌 상한은 시즌 단위, 일일 상한은 유저 전체 합산으로 둘지 결정 필요.
- 이월(안 A)이면 총 발행량이 누적되므로 교환소 가격 조정 수단(어드민 상품 관리)을 우선 확보했다.

## 9. 1차 구현 현황 (2026-11-04, 기본안 확정 반영)
- 결정: 시즌 이월·소멸 없는 영구 재화(`wallets.currency_code='pen'`). 획득 3곳 + 일일 상한, 사용처는 교환소 `price_currency='pen'` 상품.
- 획득(모두 `PenService`, 멱등 = `credit` (reason, ref) 유니크, 이미 지급된 원천은 상한도 소모하지 않음)
  - 시즌 전쟁: 영토 공격 승리 `war_pen_attack_win`, 점령 보너스 `war_pen_capture_bonus` — `WarService::addContribution` 에서 기여 기록이 새로 생길 때(ref = territory_battle id, 사람 공격자만).
  - 랭크전: 정상 종료 승리자에게 `rank_pen_win` — `RankService::onBattleSettled`(기권·접속끊김 승리·무승부 제외, ref = rank_match id).
  - 일일 퀘스트: 보상 수령 시 `quest_pen` (ref = user_quest id).
- config `game.pen`(전부 임시값): `enabled`(env GAME_PEN_ENABLED), `daily_cap` 60(유저·KST 05:00, 남은 한도만큼 부분 지급, 0=무제한), `war_attack_win` 5, `war_capture` 15, `rank_win` 8, `daily_quest` 3.
- API: `GET /api/pen`, `GET /api/exchange` 응답에 `pen` 잔액, 교환소 상품 `price_currency`. 시즌 종료 순위 보상은 이번 범위에서 제외(2장 표 참고, 후속).
- 마이그레이션: `2026_11_04_200100_add_price_currency_to_exchange`(add-only).
- 시드: `database/data/exchange_products.json`(골드 10종 + 펜 5종, 임시값). '영웅 조각'·'장비 상자'는 소비처 시스템이 없어 제외하고 장비 직접 교환으로 대체.

## 10. 후속 구현 + 윤프론용 API 명세 (2026-11-04)
- 시즌 종료 순위 보상(구현): `WarTickService::endSeason` 트랜잭션 안에서 `PenService::grantSeasonRewards`. `season_members.contribution>0` 참가자를 기여 순(기여 desc, 가입 시각, id)으로 순위 매겨 `game.pen.season.rank_table`([[max_rank, 수량]...] 첫 해당 구간) 지급, 구간 밖은 `participate`, 우승 국가 소속은 `winner_bonus` 가산. 임시값: 1위 200, 2위 120, 3위 80, 4~10위 40, 나머지 15, 우승 보너스 50. reason `war_pen_season`, ref (`season_member`, member id) 멱등, 일일 상한 대상 아님.
- 펜 잔액 노출 위치
  - `GET /api/profile` 의 `profile.pen`(정수, 골드와 같은 위치), 소탕 응답 `profile.pen` 도 동일.
  - `GET /api/pen` -> `{enabled, balance, earned_today, daily_cap(0=무제한), remaining_today|null, recent[{reason,delta,balance_after,created_at}]}` (최근 20건).
  - `GET /api/exchange` 응답 최상위 `pen`(잔액), `POST /api/exchange/buy` 응답 `pen`, 상품마다 `price_currency`(gold|pen)·`price`.
- FE 표시 가이드: 로비/교환소 재화 줄에 골드 옆 펜 표시. 펜 상품은 `price_currency==='pen'` 이면 펜 아이콘·잔액과 비교. 부족 시 서버가 422 `insufficient_pen`.
- 획득 사유 코드(recent[].reason): `war_pen_attack_win`, `war_pen_capture_bonus`, `rank_pen_win`, `quest_pen`, `war_pen_season`(시즌 종료), 소비 `exchange_buy_pen`.
- 제약: 교환소 `currency` 상품으로 펜을 지급할 수 없다(획득 상한 우회 방지, 어드민 등록 시 422 invalid_payload). 일일 상한 계산·카운터 증가는 같은 트랜잭션에서 잠금 읽기로 처리한다.

## 펜 공급 권고안 적용 (2026-11-14, 임밸런 pen_supply_v1)
- 일일 퀘스트 펜은 일일 상한 제외 경로로 지급한다: `PenService::grant(..., bool $ignoreCap=false)`(grantFor 도 동일 옵션). 멱등((reason, ref)=`daily_quest_pen`/user_quest id)·원장 사유는 그대로. 카운터(`pen_earn`)는 증가하지 않아 `earned_today`/`remaining_today` 는 클리어·전쟁·랭크분만 반영.
- 퀘스트 정의별 `pen`(config `game.quests.defs`): daily_stage_play 2 / daily_stage_win 2 / daily_gacha 3 / daily_pvp 3 = 하루 10. `game.pen.daily_quest`=0(공통 수령 펜 폐지, env GAME_PEN_DAILY_QUEST 로만 복구). 수령 응답 `reward.pen` 은 유지.
- `game.pen.daily_cap` 20 -> 15: 스테이지 첫 클리어·전쟁·랭크 전용(퀘스트·시작·튜토리얼·시즌 종료는 상한 밖).
- 교환소 펜 가격(`exchange_products.json`): px_helm_a 4, px_armor_a 6, px_gloves_a 6, px_boots_a 8, px_accessory_s 12(하루 1개 한정 유지). `game:seed` 는 기존 행을 보존하므로 이미 시드된 DB 는 `price_gold` 를 직접 갱신해야 한다(개발 DB 는 갱신 완료, 백업 database.sqlite.bak_pen_20261114).
- 필수 영웅 천장 카운트: `GachaService::pullTx` 가 슬롯(소환) 단위로 카운터를 +1 하고 슬롯마다 임계 도달을 검사하므로 10연 안에서도 소환 1회=1카운트이며 10연 중간 슬롯에서 확정된다.
