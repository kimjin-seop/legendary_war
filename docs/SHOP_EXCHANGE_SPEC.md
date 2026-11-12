# 일일 교환소 · 소탕 BE 명세 (1차)

원본 API 주석은 `routes/api.php`. 이 문서는 동작 규칙과 운영 메모다.

## 1. 일일 교환소 (골드)
- 테이블: `exchange_products`(어드민 관리 상품), `exchange_purchases`(구매 로그, `(user_id, request_id)` 유니크 = 멱등, 가격 스냅샷).
- 상품 종류(`kind`)
  - `equipment`: `payload.equipment_code` 의 장비 개체 1개 지급(인벤토리 상한 `game.equipment.inventory_cap` 적용, 가득 차면 422 inventory_full).
  - `currency`: `payload.currency`(소문자·숫자·밑줄 24자, `gold` 제외) 를 `payload.amount` 만큼 지급(지갑 재화).
- 가격은 서버 값(`price_gold`)만 신뢰한다. 요청 본문의 가격 값은 무시한다.
- 구매 한도: `daily_limit`(유저당, 0=무제한). KST 05:00 경계(`Period::dailyKey`) 일일 카운터 `exchange:{user}:{product}`. 구매 트랜잭션 안에서 증가하므로 실패(골드 부족 등) 시 한도도 소모되지 않는다.
- 멱등: 같은 `request_id` 재전송은 `replay=true` 로 같은 결과를 반환(재차감·한도 소모 없음). 다른 상품에 재사용하면 409 request_id_reused.
- 골드 차감 `wallet_transactions(reason=exchange_buy, ref=exchange_purchase:id)`, 재화 지급 `reason=exchange_grant`.
- API
  - `GET /api/exchange` -> `{products[{code,name,description,kind,payload,price_gold,daily_limit,bought_today,remaining|null}], gold, period_key, reset_at}`
  - `POST /api/exchange/buy {code, request_id}` -> `{replay, purchase_id, code, gold_spent, granted, gold, reset_at}`
  - 오류: 404 product_not_found(없음·비활성) / 422 insufficient_gold, daily_limit_reached, inventory_full, product_unavailable / 409 request_id_reused, exchange_conflict
- 어드민(role=admin): `GET /api/admin/exchange/products`, `POST /api/admin/exchange/products`, `PATCH /api/admin/exchange/products/{id}`. 삭제는 없고 `enabled=false` 로 내린다. 생성·수정은 `audit_logs`(entity=`exchange-products`, `reason` 선택)에 기록한다.
- 상품 시드 데이터는 아직 없다(운영자가 어드민 API 로 등록). 기획 확정 시 `database/data` 시드 추가 필요.

## 2. 소탕 (자동 전투 아님)
- `POST /api/stages/{stage}/sweep {count, request_id}`
- 조건: `user_stage_progress.best_stars = 3`(직접 전투 정산으로만 올라감). 아니면 422 sweep_not_available.
- 보상: 스테이지 `reward_*` x `reward_scale.star_mult[3]` x `retry_mult` x 실행 횟수. 영웅 exp 는 현재 파티 영웅 전원(레벨 격차 규칙은 전투와 동일), 유저 exp, 골드 `reason=stage_sweep`.
- 일일 한도: 전투 보상과 같은 카운터 `stage_reward:user:{U}:stage:{S}`(`reward_scale.stage_daily_cap`, 0=무제한)를 실행 횟수만큼 소모. 초과분은 실행되지 않고(`executed < requested`, `reward_blocked=stage_daily_cap`), 0회면 422 stage_daily_cap.
- 요청당 최대 횟수 `game.sweep.max_count`(기본 10). 기능 스위치 `GAME_SWEEP_ENABLED`(false 면 404 sweep_disabled).
- 멱등: `stage_sweeps (user_id, request_id)` 유니크, 재전송은 저장 결과를 `replay=true` 로 반환.
- 퀘스트 훅: 실행 횟수만큼 `stage_win`, `stage_clear` 기록(멱등 키 `sweep:{id}:{순번}`). `stage_play` 는 기록하지 않는다.
- 1차 한계: 첫 클리어 합류 영웅·별 갱신은 없음(이미 클리어한 스테이지만 대상). 전투 로그 없음.

## 3. 변경 이력 (2026-11-04 정검수 반영·펜 연동)
- 소탕 자체 일일 상한 `game.sweep.daily_cap`(기본 20, 스테이지·유저별, KST 05:00)을 `stage_daily_cap`(0=무제한)과 별개로 항상 적용한다. 실행 횟수 = min(요청, 공유 한도 잔여, 소탕 상한 잔여), 0회면 422 `stage_daily_cap`.
- 소탕 응답에 `profile`(현재 프로필: level, exp, exp_to_next, gold 등. replay 도 최신값)을 추가했다. 기존 `user` 는 유저 exp 정산 결과다.
- 요청 `count` 최대값은 `game.sweep.max_count` 와 같다(초과 422 검증 오류).
- 소탕 영웅 exp 는 현재 파티 영웅 전원이 같은 양을 받는다(전투의 벤치 `bench_exp_pct` 구분 없음). 의도된 단순화이며 밸런스 확정 시 조정한다.
- 교환소 상품에 `price_currency`(gold|pen) 추가. 가격 수량 컬럼은 기존 `price_gold` 를 그대로 쓴다(응답에는 `price`, `price_currency` 병기). 펜 부족은 422 `insufficient_pen`. 응답에 `pen` 잔액 포함.
- 어드민 상품 생성·수정은 `reason` 필수, `price_gold=0` 이면서 `daily_limit=0` 인 조합은 422 `invalid_free_unlimited`.
- 기본 상품 시드: `database/data/exchange_products.json`(골드 10종 + 펜 5종, 임시값) -> `game:seed`(기존 행 보존, `--force` 덮어쓰기).
