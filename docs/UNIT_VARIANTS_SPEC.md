# 특수유닛(variant) 1차 구조 명세

문기획 기획안 요약을 바탕으로 구현한 1차 구조다. 수치 데이터(items)는 임밸런이 채운다. 현재 `unit_variants.json`의 3건은 구조 확인용 샘플(`enabled:false`)이다.

## 1. 데이터
- `database/data/unit_variants.json` `items[]`: `code, base_type, scope(hero_unique|culture_common), min_rarity(S|A|null), cultures[], name_ko, enabled, mods{hp_pct, atk_pct, def_pct, move_delta}, sprite_key|null`
- `database/data/hero_variants.json` `heroes{ <영웅코드>: {self_variant, troop_variant} }`
  - self_variant = 영웅 본인, troop_variant = 소속 병사.
  - S는 둘 다, A는 영웅별 지정, B/C는 지정 불가.
  - 가정: 영웅 데이터에 DB 컬럼을 추가하지 않고 별도 파일로 둔다(마이그레이션 없음, 되돌리기 쉬움).

## 2. 검증 (`App\Game\UnitVariants`, `game:seed` 끝에서 실행 -- 위반 시 시드 실패)
- base_type 은 unit_types.json 의 기존 병종이어야 하며 수군(naval)·마물(monster)은 제외.
- hp/atk/def 는 각 정수 ±15%, move_delta 는 ±1.
- 합산 순증 = (hp+atk+def)/3 + 5*move_delta, 절대값 10% 이하. 이동력 +1 은 장점 5% 로 환산한다(기획안 표현 "move+1=-5%"를 보수적으로 해석한 가정이며 문기획 확인 필요).
- 장점(양수 스탯, 이동 +1)만 있는 변형은 금지하고 단점을 쌍으로 둔다.
- 등급 한도: S 장점 최대 +15%·합산 ±10%, A 장점 최대 +10%·합산 ±7%. B/C 영웅에 변형을 지정하면 오류(영웅 코드·등급 포함).
- 변형 base_type 은 영웅 unit_type 과 일치해야 한다. `min_rarity` S 변형은 S 영웅만, culture_common 은 영웅 culture 가 cultures 에 있어야 한다(영웅 culture 가 있을 때만 검사).

## 3. 적용 (`ArmyBuilder::makeUnit(..., ?string $variant = null)`)
- 변형이 존재하고 enabled 이며 base_type 이 유닛 type 과 같을 때만 hp/atk/def/move 에 보정을 적용한다. 같지 않거나 비활성이면 기존과 완전히 동일하다.
- type 은 기본 병종을 유지하므로 상성·지형·사거리는 변하지 않는다(사거리 변경은 2차).
- 유닛 상태·응답에 `variant`(코드), `variant_name`(표시명)을 추가한다. 변형이 없으면 두 필드를 생략해 기존 전투 상태와 호환된다. 병사 유닛의 이름은 변형 name_ko 로 표시한다(영웅 이름은 유지).

## 4. 지정 경로
- 스테이지/스쿼드 명시: `enemy_squad.commander.variant`(지휘관), `enemy_squad.variant`(병사), `squads[].commander.variant`, `squads[].variant`. 서가 NPC 지휘관의 스테이지 명시 변형도 이 경로로 허용한다.
- 영웅 지정: `hero_variants.json`. 플레이어 편성(`addSide`)에서 영웅은 self_variant, 병사는 troop_variant 를 사용한다.

## 5. 기본안 (사용자 확정 대기 항목)
- 랭크전은 변형 비활성(기본 병종): 랭크 매치 방은 `state.no_variants=true`.
- 방 대전(일반 PvP)은 영웅 지정 변형을 사용한다.
- 수군 제외, 사거리 변경 없음(2차).

## 6. 테스트
- `tests/Unit/UnitVariantsTest.php`: 변형 스탯 계산과 검증 규칙, 등급 미달·병종 불일치 거절, makeUnit 보정 + 미지정 시 동일.

## 7. 알려진 한계
- 현재 sprite_key 는 저장만 하고 FE 해석 경로는 없다(FE 협의 필요).
- 시뮬레이터(Duel)·WarService 경로는 `addSide` 를 거치므로 hero_variants 가 적용되지만, 랭크 외 `no_variants` 를 켜는 곳은 RoomService 랭크 매치 방뿐이다.

## 8. 정검수 반영 (2026-11-04)
- 전투 경로(`UnitVariants::get`/`forHero`)는 정의·영웅 지정 파일이 손상되거나 검증 오류가 있어도 예외 없이 빈 값으로 폴백하고 로그만 남긴다(변형 없이 전투 진행). 파일이 없을 때도 빈 값. 검증 실패는 `game:seed`에서만 시드 실패로 처리한다.
- `game:seed` 는 DB 쓰기 전에 검증한다(정의·`hero_variants.json`·`database/data/stages*.json`의 `enemy_squad` 지정). 부분 적재가 생기지 않는다.
- 스테이지 명시 지정(`commander.variant`, `squad.variant`, `squads[]`)은 시드에서 정의 존재·enabled·기본 병종 일치를 검사한다(오타·`enabled:false` 는 시드 실패).
- 의도: 스테이지 명시 지정은 영웅 등급 한도·장점 한도를 적용하지 않는다(적/NPC 연출용, 정의 자체의 ±15%/±10% 한도는 적용). 영웅 지정(`hero_variants.json`)만 등급 한도를 적용한다.
- `mods.move_delta` 정수 검사와 `cultures` 배열 검사를 추가했다.
