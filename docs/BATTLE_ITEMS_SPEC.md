# 전투 소모품 명세 (기본안, 수치는 임밸런 표 도착 시 교체)

상태: 설계 기본안만 있고 구현은 하지 않았다. 아래 수치는 모두 가정 시작값이다.

## 1. 종류
| code | 이름(가칭) | 효과 | 시작값(가정) |
|---|---|---|---|
| potion_s / potion_m / potion_l | 회복약 소/중/대 | 대상 HP 회복 | 최대 HP의 15% / 30% / 50% (정수 반올림, 최대 HP 초과 불가) |
| antidote | 해독약 | 상태이상 해제 | 대상의 부정 상태(예: 둔화·중독 등 엔진이 지원하는 상태이상) 전부 제거. 현재 엔진에 상태이상 시스템이 없으면 이 항목은 구현 보류 |
| buff_tonic | 강장제 | 버프 | 대상 공격 +10% 1턴(`T_ACTIVE_BUFF` 의 `applyBuffs` 재사용) |

## 2. 획득
- 장비 상점에서 구매한다(장비 구매와 같은 재화·검증 경로). 보유 수량은 사용자별 `user_items(user_id, item_code, qty)` 로 둔다(신규 테이블, 마이그레이션 필요).
- 가격과 1회 구매 상한은 임밸런 표(가정: 소 100 / 중 250 / 대 500, 해독약 150, 강장제 200).

## 3. 전투 중 사용
- 행동: `POST /api/battles/{id}/item_use` { unit_id, item_code, target_unit_id }.
- 사용자(영웅 유닛)가 아직 행동하지 않았을 때만 가능하며, 사용 시 그 영웅의 행동 1회를 소모한다(이동 후 사용 가능, 사용 후 공격 불가).
- 대상은 자신 또는 인접(거리 1) 아군이며 생존 유닛이어야 한다. 적·사망 유닛·거리 초과는 거부한다.
- 전투당 총 사용 횟수 3회(아이템 종류 합산). 초과 시 거부한다. 사용한 소모품은 전투 시작 시 보유 수량에서 확정 차감하지 않고, 사용 시점에 `user_items` 에서 1 차감한다(전투 포기·패배해도 환불 없음).
- 이벤트: `item_used`(unit_id, target_unit_id, item_code, 효과량)를 이벤트 로그에 남긴다.

## 4. 제한
- PvP·랭크전·방 대전에서는 사용 불가(`state.items_enabled=false`). 캠페인/스테이지 전투 생성 시에만 `items_enabled=true` 와 `items_left=3` 을 state 에 고정한다(구 전투는 키 없음 = 사용 불가).
- 3성 판정에는 영향이 없다. 3성 조건(예: 턴 수, 생존 유닛)은 소모품 사용 여부와 무관하게 계산하며, 소모품 회복으로 생존한 유닛도 일반 생존으로 센다.
- 자동 전투와 무관하다(자동 전투 금지 정책 유지). 봇(적)은 소모품을 사용하지 않는다.

## 5. 구현 계획
1. 마이그레이션: `user_items`. 설정: `database/data/battle_items.json`(종류·효과·가격, 임밸런 수치 반영) + `GameSeed` 적재 또는 JSON 직접 로드.
2. 상점: 기존 장비 구매 API에 `item` 종류를 추가하거나 `POST /api/shop/items/{code}/buy` 신설(재화 차감 트랜잭션).
3. 엔진: `Engine::useItem($state, $unitId, $itemCode, $targetId)` — 검증(행동 가능·거리·횟수), 회복/버프 적용, `acted=true`. `BattleService` 에서 보유 수량 차감.
4. API/문서: `routes/api.php` 주석 갱신, 유닛 응답에 `items_left`.
5. 테스트(핵심): 회복약 사용 시 HP·행동 소모·횟수 차감, PvP/랭크 거부.

## 6. 미결정(임밸런/기획 확인)
- 해독약의 상태이상 범위(엔진에 상태이상 시스템 유무 확인 필요).
- 가격·구매 상한·재화 종류.
- 소모품 사용 시 이동 전/후 순서 제한 여부.

## 7. 구현 현황과 API 계약 (2026-11-04, FE 연동용)
구현 완료(개발 DB 마이그레이션 적용). 해독약은 엔진에 상태이상이 없어 제외했고, 종류는 회복약 소/중/대(`potion_s|m|l`) + 강장제(`buff_tonic`)다. 수치·가격은 `database/data/battle_items.json`(임시값, 임밸런 표 도착 시 교체, `enabled:false` 로 전체 끄기 -> 404 `items_disabled`).

### 상점·보유
- `GET /api/shop/items` -> `{items[{code,name,kind(heal|buff),price,owned, heal_pct | stat,amount,duration}], gold, max_per_battle, max_stack}`
- `GET /api/items` -> `{items[{code,qty}]}` (보유 1개 이상만)
- `POST /api/shop/items/buy` `{code, qty(1~max_buy_qty, 기본 1), request_id(8~64자 [A-Za-z0-9_-], 멱등키)}` -> `{replay, code, qty, gold_spent, gold, owned}`
  - 오류: 404 `items_disabled|item_not_found`, 422 `insufficient_gold|invalid_qty|stack_full`, 409 `request_id_reused|shop_conflict`
  - 가격은 서버 값만 신뢰. 골드 차감은 지갑 원장(`reason=shop_item`, ref=`item_purchase`)과 같은 트랜잭션.

### 전투 중 사용
- `POST /api/battles/{id}/actions` `{type:'use_item', unit_id:<내 영웅/지휘관>, item:<code>, target_id?:<생략=자신, 인접(거리 1) 아군>}`
- 규칙: 스테이지 전투만(state `items.left` 가 있을 때). 영웅 행동 1회 소모(이동 전후 모두 가능, 사용 후 그 영웅은 이동·공격 불가), 전투당 총 `max_per_battle`(3)회, 보유 수량은 사용 확정 시 1 차감(전투 포기·패배해도 환불 없음). 봇은 사용하지 않는다. 3성 판정에 영향 없음.
- 거부: 방 대전·랭크·시즌 전쟁 전투는 `items.left` 가 없어 422 `items_disabled`(방 API 는 `use_item` 타입 자체를 검증에서 거부).
- 오류: 422 `items_disabled|item_not_owned|not_hero|item_no_effect(HP 가득)|already_acted|out_of_range`, 409 `item_limit`, 404 `item_not_found|invalid_target`.
- 이벤트: `item_use{actor_unit_id,target_unit_id,item,name,kind,items_left}` 뒤에 회복약 `heal{actor_unit_id,target_unit_id,hp_before,hp_after,via_item}` 또는 강장제 `buff_apply{actor_unit_id,target_unit_id,stat,amount,left}`.
- 전투 state/뷰: `battle.state.items.left`(남은 횟수, 키가 없으면 사용 불가 전투). 남은 보유 수량은 `GET /api/items`.

### 테스트
- `tests/Feature/BattleItemsTest.php`: 구매(차감·멱등·잔액 부족) + 전투 중 회복약(행동 소모·횟수/수량 차감·재사용 거부).

### 8. 수치 정책 반영 (임밸런 consumables_policy_v1, 2026-11-04)
- 종류/가격/전투당 상한: `potion_s` HP+15 / 15골드 / 2회, `potion_m` HP+30 / 40골드 / 2회, `potion_l` 최대 HP 50% / 90골드 / 1회, `tonic_atk`(사기 고양약) 공격 +10% 1턴 / 50골드 / 1회, `tonic_def`(철벽약) 방어 +20% 1턴 / 50골드 / 1회, `cleanse`(해제약)는 비활성. 보유 상한(stack_limit) 소 20·중 20·대 10·강장제류 10. 전투 전체 합계 3회 유지.
- 6절 `buff_tonic` 은 `tonic_atk` 로 대체됐다. 상점 응답 items 에 `per_battle_uses`, `stack_limit`, `heal_flat|heal_pct` 가 포함된다. 소모품별 전투당 상한 초과는 409 `item_limit`. 전투 state `items.used{code:n}` 에 소모품별 사용 횟수가 기록된다.
