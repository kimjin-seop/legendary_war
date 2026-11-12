# 신규 병종 '총병' 요구사항 (문기획 정리 + 팀장 기본 결정, 2026-11-03)

원칙: docs/BALANCE_PHILOSOPHY.md 준수(극단 상성·조합·지형 지배·시대별 정체성·레벨 격차 예외). 수치는 임밸런, 이 문서는 방향과 범위.

## 사용자 확정
- 총병은 일본 조총 시대와 나폴레옹 등 화약 시대 영웅을 궁병이 아니라 총병으로 표현하기 위한 병종.
- 사거리: 궁병은 사이에 1칸(거리2), 총병은 사이에 2칸(거리3). **바로 옆(거리1)과 한 칸 너머(거리2)에서는 공격 못 함.** 즉 range_min=3, range_max=3 고정.
- 공격 연출: 포물선이 아니라 **직사사격(직선 탄도)**.

## 팀장 기본 결정 (사용자가 추후 바꿀 수 있음)
1. 병종 이름: **총병** (코드 `gunner`).
2. 사거리 A안(3 고정).
3. 영웅 전환: 핵심 4명으로 시작 — oda_nobunaga, napoleon, wellington, gustavus_adolphus(근거 보강은 송서사). 효과 확인 후 확대.
4. 제외 권고: toyotomi_hideyoshi, honda_tadakatsu, takeda_shingen, date_masamune, sakamoto_ryoma, vauban, mehmed_ii, nelson, yi_sun_sin, suleiman_i.
5. 장전 개념: 새 상태 저장을 피하기 위해 단순형으로 시작 — **이동한 턴에는 사격 불가(사격 후 이동은 가능 여부 임밸런/박백엔 협의)**. 장전 상태 저장이 필요한 형태는 후속.
6. 직사 규칙 추천안: **사이 2칸 중 유닛/차단 지형(숲 칸, 성벽, 건물 등)이 있으면 사선이 막혀 사격 불가**. 궁병은 포물선이라 넘어간다 → 총병은 보병 뒤 지원이 사선을 가리는 조합 문제가 생김(철학상 전술 요소). 엔진에 시선 계산이 있는지 박백엔이 조사 후 확정.
7. 랭크전: 같은 엔진 규칙 적용(레벨 정규화는 그대로).
8. 적·NPC 총병 전환(임진 조총대, 바부르 군 등)은 병종 구현 후 임밸런이 스테이지 단위로 후속 제안.

## 영향 범위
데이터(임밸런): unit_types, matchups, terrains(병종별), hero_troop_types, hero_skill_assignments, skills, active_skill_assignments. 설정(박백엔): config/game.php(hero_troop_types.allowed, troop_unit_cost, troop_default_by_type). BE 엔진/AI/시드/테스트(박백엔): 사거리·사선·이동 후 사격·상성·병종별 AI(카이팅, 창병 뒤 배치), GameData/HeroStatRules/SquadPlanner/ArmyBuilder/GameSimulate/protagonist 등. FE(윤프론): assets.js, rules.js, SkillIcon, PixelBadge, AttackMotion(직선 투사체), Battle/Cutscene/Sfx, 병종 표시·필터·도감·툴팁. 에셋(안아트): 총병 병사 시트(아군/적, 문화권별), 병종 아이콘/배지, 스킬 아이콘 atlas, 총구 화염·연기, 총성 sfx. 기존 on_arquebus_aoe 스킬은 3단 사격 연상 표현 금지.

## 설계 방향 (수치 제외)
- 강점: 거리3 밖에서 보병·창병·궁병에 일방 사격. 방어 높은 상대에 유효(방어 일부 무시 검토, 선례 mage_def_ignore_pct).
- 약점: 거리1~2 접근 시 공격·반격 불가 → 기병/암살자/비행에 궤멸. 보병·창병이 앞을 막아야 제 역할.
- 지형: 성벽·고지 위 유리, 숲 시야 제약, 협곡 방어선 뒤 극도 유리, 도하·늪 불리, 우천 약화(날씨 시스템 유무 확인).
- 시대별 정체성: 전국시대(조총+창 아시가루)와 나폴레옹기(머스킷 횡대)를 스킬·지형으로 차별화.

## 인수 조건
1. gunner가 unit_types·상성·지형·시드·편성 가능 목록·DB에 반영. 2. range 3 고정과 이동 후 사격 제약, 직사 사선 규칙이 서버 판정으로 동작. 3. 시뮬에서 극단 상성(기병에 일방 패배)과 해법(창병 방어선, 지형) 재현. 4. 전환 영웅의 기존 편성·프리셋·스킬 호환(궁병 전용 스킬 재배정). 5. FE 병종 이름·아이콘·도감·필터·직선 투사체 표시와 실화면 검증 통과. 6. 기존 병종 테스트 통과 + 신규 핵심 테스트 1~2개.

## 범위 제외
대포·화포 병종, 함선 사격, 3단 사격 연출, 총기 종류별 병종 분할, 레벨 격차 예외 규칙 변경.

## 작업 분배
임밸런(수치·상성·지형·시뮬 설계) → 박백엔(엔진·시드·AI·테스트·config) ∥ 안아트(시트·아이콘·이펙트) → 윤프론(FE) → 강화면(실화면) → 정검수(리뷰) → 하플레이. 송서사: 전환 영웅 근거 보강·스킬 문구.

---
## 문기획 보강(엔진 현황·직사·연출) 및 팀장 기본 결정 갱신 — 위 "팀장 기본 결정" 5·6항보다 이 절이 우선

### 엔진 현황(확인)
거리=맨해튼(Engine.php:301-304). targetsFrom(438-453)은 거리 범위만 검사하고 시선(LOS) 없음. doAttack(891-893)은 targetsFrom에 대상이 있어야 함. 반격(917-919)은 기본 range_max===1 쌍방·거리1일 때만 → 총병은 인접 적에게 반격 불가가 현행 규칙으로 이미 성립. ranged_counter=true 맵에서도 총병은 거리3에서만 반격. 고지(elevation, highground_mult)·숲 엄폐(forest_cover_mult, range_max>=2 대상)는 있으나 시선 차단 용도 아님. 이동 후 공격 가능 여부는 별도 확인 필요(skillContext에 moved 필드 있음).

### 직사사격과 시선 차단 — 팀장 기본 결정
- **C안(1단계)**: 차단 지형(숲·성벽·건물·절벽 등)만 사선을 막고 유닛(아군·적)은 막지 않음 → 보병 뒤 사격 진형 유지, 조총 vs 숲 대비. 효과를 본 뒤 2단계로 적 유닛 차단 검토. 공격자가 고지면 차단 지형 너머 사격 허용 검토(임밸런 제안, 박백엔 구현).
- 비직선 거리3 칸((2,1),(1,2) 등)도 사격 허용, 사선은 칸 중심 연결선이 지나는 칸을 검사.
- 직사 병종 플래그(예: line_of_fire)로 분기해 궁수·마법사는 영향 없음. 시선 판정은 서버(targetsFrom), FE는 사거리 표시에 반영. AI(HeuristicBot, RouteAi, ArmyBuilder 적 편성)는 시선 포함 계산.
- 이동 후 사격: 초안 **불가**(임밸런 측정 후 확정). 장전 개념은 1단계 미도입. 총병끼리 반격은 거리3에서 허용(ranged_counter 옵션과 무관하게 거리3 규칙 유지).
- 날씨(우천 약화)는 날씨 시스템 존재 확인 후 후속, 1단계 제외.
- AI 카이팅: 거리1~2에 적이 붙으면 거리3 확보(후퇴/보병 뒤 이동) 신규 로직(HeuristicBot/RouteAi/costToReach).

### 연출 요구사항
- 투사체: AttackMotion.js 의 projectile(..., arc, ...)에서 arc=0 직선 재사용(마법 선례 :57-70,:125). attackKind 에 'gun' 추가(:11). 화살 포물선은 ArrowFx.js 유지.
- BattleCutscene.js RANGED 집합에 gunner 추가, 총구 화염·직선 탄환 연출. CutsceneSfx/cutscene_sfx_cues.json 에 gunner 그룹과 총성 오디오 슬롯(안아트 후보: 화승총 폭음 1종 + 연속 사격 변형 1종).
- 에셋(안아트): 총병 병사 시트(총 든 자세·사격 프레임, 문화권별), 병종 아이콘/배지, 스킬 아이콘, 총구 화염·연기, 총성.

## 구현 확정 사항 (박백엔, 2026-11-03, 1차)

- **수치는 임시값(PLACEHOLDER)**: 이동 5, 사거리 3~3, HP 60, ATK 26, DEF 5, move_type foot, cost 1 (`database/data/unit_types.json`, 임밸런 확정 전). 상성(matchups)은 행이 없으면 `RuleSet::multiplier` 가 1.0 을 쓴다(임밸런 작업).
- **사선(LOS)**: `Engine::lineOfFire` — 사격자 칸 중심과 대상 칸 중심을 잇는 선분이 지나는 중간 칸(양 끝 제외)에 `terrains.blocks_line_of_fire=1` 칸이 있으면 사격 불가. 선분이 칸 경계를 정확히 지나면 맞닿은 칸 중 하나라도 막으면 막힘. 기본 차단 지형: forest·mountain·wall·cliff·castle. 사격자/대상 칸 자체는 무관, **유닛(아군·적)은 막지 않음**. 건물 오브젝트는 엔진 상 별도 타일이 아니라(맵 `building` 레이어는 그림 전용) 지형 코드(castle·wall)로만 판정.
- **이동 후 사격 불가**: `moved=true` 이거나 현재 칸이 아닌 가정 위치에서는 `targetsFrom` 이 빈 배열. 사격 후 이동도 기존대로 불가(`acted`).
- **반격**: 기존 규칙 유지(근접끼리만, `ranged_counter` on 이면 방어자 사거리 안(거리 3)에서만).
- **엔진 옵션** `gunner_rules`(기본 true, 총병에만 효과, false=일반 사거리). 고지 사격 예외(차단 지형 위 사격자)는 이번 범위 제외(임밸런 제안 대기).
- 영웅 병종 전환은 하지 않음(`hero_troop_types.allowed` 에 gunner 만 추가). 봇: 이동 후 사격 불가라 `HeuristicBot::gunnerSteps` 가 적이 1~2칸이면 감점(1칸 -12, 2칸 -6)·거리 3 + 사선 확보 칸 +10·멀면 접근하는 카이팅.
- `/api/rules`: `terrains[].blocks_line_of_fire`(0/1), `unit_types` 에 gunner 행(`hero_troop` true).
