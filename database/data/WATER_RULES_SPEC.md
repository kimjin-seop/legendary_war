# 임진왜란 10맵 변환 + 수상(해전)·목표·증원·서가 규칙 스펙 (임밸런, 시작값/튜닝 대상)

작성: 임밸런. 범위: 데이터·스펙만(엔진/앱 코드·DB 미수정). 모든 수치는 "시작값"이며 최종 확정은 엔진 구현 후 `game:simulate` 재측정 + 사람 플레이 확인 뒤에 한다. 확정 규칙의 근거는 사용자 원문(수상 이동 가능·이동거리 제한·배 오버레이·수병 수상 최강)과 팀장 결정(모든 병종 수상 진입 가능, 허공은 flying 포함 불가).

산출 파일
- `database/data/maps_imjin10.json` : 10맵 변환본(원본 `maps_imjin10_user_source.md` 미수정, 지형 배치 무변경. `meta.source_rows`에 원문 행 보존).
- `database/data/terrains_imjin10_proposal.json` : 신규 7지형 + 기존 13지형의 naval 행 제안(`terrains.json` 미수정).
- 본 문서.

---

## 1. 코드 -> 지형 매핑표 (있음 / 신규 필요)

서버 지형 기호는 `terrains.json` symbol. 엔진은 symbol을 DB `terrains`에서 읽는다(RuleSet `symbols`). 주의: `RuleSet::terrainMod`는 정의 안 된 move_type을 cost 1 / def 0으로 폴백하므로, 신규 지형은 5개 move_type(foot·mounted·heavy·flying·naval)을 모두 명시해야 한다(누락 = 통행 가능).

| 원본 | 의미 | 서버 기호 | 지형 | 상태 | 비고 |
|---|---|---|---|---|---|
| `~` | 바다 | `o` | sea | 신규 | 수상. 비수병 배 탑승 |
| `.` | 평지 | `p` | plain | 있음 | tile_layer 이름 `plain` |
| `L` | 육지(잔디) | `p` | plain | 있음 | tile_layer 이름 `grass`(시각만 구분) |
| `S` | 모래 | `d` | sand | 신규 | 기존 `n`(설원·사막)과 별개. 대체안: `n` 재사용(이동 foot2/mounted2, 해안 연출만 다름) |
| `F` | 숲 | `f` | forest | 있음 | |
| `R` | 암초 | `q` | reef | 신규 | 수상. 단 8번 맵의 R은 `j`(서가 발판)로 변환(아래 3절) |
| `H` | 언덕 | `i` | hill | 신규 | elevation 1(고지 규칙 플래그 on일 때만 효과). 기존 산 `m`은 기병 불가라 부적합 |
| `W` | 얕은 물/강 | `s` | shallows | 있음 | 도하 가능(이동 2, 방어 -10). 배 탑승 아님 |
| `C` | 성벽 | `W` | wall | 있음 | 전 병종 불가. 예외: 평양성(5번)은 `c` castle(아래 열린 질문 1) |
| `G` | 성문 | `c` | castle | 있음 | 이동 1, 방어 +30. tile_layer 이름 `gate` |
| `B` | 건물 | `c` | castle | 있음 | 기존 팩 규칙(bld_c=c)과 동일. tile_layer `building` |
| `T` | 탑 | `c` | castle | 있음 | tile_layer `tower`. (선택) 고지 효과를 원하면 별도 `tower` 지형 elevation 1 |
| `O` | 목표 | 주변 지형 | - | 대체 | 좌표는 `meta.objective_points` |
| `X` | 통행불가 | `V` | void | 신규 | 5종 move_type 전부 불가(비행 포함). 기존 `k`(절벽)는 비행 통과라 부적합, `W`(벽) 재사용은 엔진 변경 0의 대체안(렌더만 void) |
| `A`/`E` | 시작 | 주변 지형 | - | 대체 | 좌표는 `spawns.a`/`spawns.b` |
| `P` | 항구 | `h` | harbor | 신규 | 승선/하선 지점. 모든 병종 이동 1, 방어 +10 |
| (8번 `R`) | 불안정 발판 | `j` | rift_plank | 신규 | 서가 전용. 통행 가능 이동 1 |

A/E/O 대체 규칙(결정적): 해당 칸을 제외한 4방향 이웃의 최빈 지형(동률은 위·좌 우선), 이웃이 모두 마커면 대각 이웃, 반복 5패스. 원본의 A/E/O 아닌 칸은 일절 변경하지 않음.

변환 후 지형 칸수 (`meta.terrain_counts`)

| 맵 | 칸수 |
|---|---|
| 01 옥포 | p97 d47 o316 q14 h6 (수상 69%) |
| 02 정암진 | f240 p181 s46 d13 |
| 03 한산도 | o422 p14 q34 d10 (수상 95%) |
| 04 진주성 | f144 p247 s28 W38 c23 |
| 05 평양성 | f48 p224 c208 |
| 06 행주산성 | p310 f69 i64 W35 c2 |
| 07 노량 | o436 q44 (100%) |
| 08 번진 서가 | V216 p254 j10 |
| 09 명량 | o376 q104 (100%) |
| 10 마지막 서가 | V222 p171 i85 c2 |

## 2. 스폰(A/E)·목표(O) 목록과 검증

맵 코드: im_01_okpo, im_02_jeongamjin, im_03_hansando, im_04_jinju, im_05_pyeongyang, im_06_haengju, im_07_noryang, im_08_seoga_collapse, im_09_myeongnyang, im_10_last_seoga. 좌표는 0-based [x,y](기존 팩과 동일; 원본 (1,1) 기준 문서 좌표 = +1). A=`spawns.a`, E=`spawns.b`.

| 맵 | A수 | E수 | O |
|---|---|---|---|
| 01 | 4 | 4 | 없음 |
| 02 | 4 | 4 | 없음 |
| 03 | 4 | 4 | [12,10] |
| 04 | 4 | 4 | [12,10] |
| 05 | 4 | 4 | [12,10] |
| 06 | 4 | 4 | [11,9] |
| 07 | 4 | 4 | [12,10] |
| 08 | 4 | 4 (1개 무효) | [12,9],[18,12] |
| 09 | 4 | 4 | [11,10] |
| 10 | 4 | 4 | [11,9],[12,9] |

보고 사항
- 부족: 모든 맵이 A 4 / E 4로 부대 6유닛(영웅3+병사 등)에 부족하다.
- 확장 규칙(구현됨, `deploy_zones`): 원본 스폰 점 전부 유지 + 스폰에서 4방향 BFS로 가장 가까운 통행 가능 칸을 채워 측당 10칸까지. 제외: 상대 스폰, 암초 `q`, 벽 `W`, 허공 `V`. 해전 맵은 주변이 바다라 자동으로 수상 칸 우선(바다 계열)으로 채워진다. 원본 지형 칸은 변경하지 않음. `spawns`는 원본 4점 그대로.
- 08번 E (20,17)은 사방이 허공(X)으로 둘러싸인 고립 칸이라 유닛을 둘 수 없다(원본 그대로). `spawns.b`에는 보존, `deploy_zones.b`에서는 제외(측당 3점+확장 7칸). 원본 의도 확인 필요(열린 질문 4).
- 01·02에는 O가 없다.

검증 스크립트 결과 (컨테이너 `php`, 스크립트: scratchpad `verify.php`; 24x20·지형 문자·스폰 통행·연결성)
```
code                     dim   A  E  O  sea%  A->O / A->E (수상 허용) ; 육지만 A->O
im_01_okpo               24x20 4  4  0  69%   -/Y land:-
im_02_jeongamjin         24x20 4  4  0  0%    -/Y land:-
im_03_hansando           24x20 4  4  1  95%   Y/Y land:N   (섬 목표는 배로만 접근)
im_04_jinju              24x20 4  4  1  0%    Y/Y land:Y
im_05_pyeongyang         24x20 4  4  1  0%    Y/Y land:Y   (C=castle 변환 시. C=wall이면 N)
im_06_haengju            24x20 4  4  1  0%    Y/Y land:Y
im_07_noryang            24x20 4  4  1  100%  Y/Y land:N
im_08_seoga_collapse     24x20 4  4  2  0%    Y/Y land:Y   spawnPassable=N voidSpawn=[[20,17]]
im_09_myeongnyang        24x20 4  4  1  100%  Y/Y land:N
im_10_last_seoga         24x20 4  4  2  0%    Y/Y land:Y
maps=10 problems=1   (1건 = 08번 고립 스폰)
```
모든 맵 행 24자·20행 통과, 미정의 문자 0, 허공 외 스폰 전부 통행 가능·상호 연결. 3·7·9번은 육지만으로는 목표에 닿지 않으므로 "모든 병종 수상 진입 가능" 전제가 필수다. node 검증은 미실행(php만 사용; 동일 로직).

## 3. 수상 규칙 (확정 방향 + 시작값)

### 3.1 수상 칸과 배 탑승(boarded) 정의
- 수상 칸 = `sea`(o), `reef`(q) (`water:1, boarding:1`). `harbor`(h)와 `shallows`(s)는 수상 인접 칸이지만 배 탑승 상태가 아니다.
- 배 탑승(boarded) = (병종 move_type이 foot·mounted·heavy) 이고 유닛이 sea/reef 칸에 있음. 파생 상태라 state·DB 필드 추가 불필요(진행 중 전투 호환). 하선 = 수상 아닌 칸으로 이동할 뿐이며 별도 비용 없음(항구·모래·여울이 자연스러운 승하선 지점).
- 비행(flying)은 배를 타지 않는다(오버레이 없음, 바다 이동 1). 수병(naval)은 항상 "자기 배"를 가진 상태(오버레이 `warship`/`flagship`).
- 허공(V): 비행 포함 전 병종 불가. 따라서 flyer 경로 탐색에서도 V는 벽이다.

### 3.2 이동 (데이터만으로 구현 가능, 이동거리 제한 = 지형 이동비)
| 지형 | foot | mounted | heavy | flying | naval |
|---|---|---|---|---|---|
| sea 바다 | 2 | 3 | 3 | 1 | 1 |
| reef 암초 | 3 | 4 | 4 | 1 | 2 |
| harbor 항구 | 1 | 1 | 1 | 1 | 1 |
| shallows 여울 | 2 | 2 | 2 | 1 | 1 |
| sand 모래 | 1 | 2 | 2 | 1 | 1 |
| hill 언덕 | 2 | 2 | 3 | 1 | 불가 |
| plain/road | 1 | 1 | 1 | 1 | 2 |
| forest | 2 | 3 | 2 | 1 | 4 |
| castle(성·문·건물·탑) | 1 | 1 | 1 | 1 | 2 |
| wall / void / cliff / mountain(naval) | 불가 | 불가 | 불가 | 벽·허공 불가 | 불가 |

효과(이동력 보병 4, 기병 6, 마법/승려 3~4, 수병 5 가정): 비수병은 한 턴에 바다 2칸(기병 2칸, 마법사 1칸), 수병은 5칸. 해전 맵 양측 간격 약 9~14칸 -> 수병 접촉 2~3턴, 보병 5~7턴. 마법사 이동 3은 바다 1칸/턴이라 사실상 수상 무력(가설: 바람직한 페널티인지 사람 확인; 대안은 sea foot 비용을 2로 두되 "최소 1칸 이동 보장"이 아니라 마법사 이동 4 상향).
수병 이동은 `unit_types.json`의 `naval`을 이동 5로 제안(TROOP_TYPES_V2_SPEC은 4). 육지에서는 평지 2칸으로 비용이 두 배라 육상 이동은 약 2칸이다.

### 3.3 수병 수상 보너스 / 육상 페널티 (체감 "엄청 쎔")
데이터(terrains) 부분: 수병 방어 sea +25 / reef +35(암초 엄폐 `cover` 가능) / shallows +10 / harbor +15, 비수병 방어 sea -10 / reef +5 / harbor +10. 수병 육상 방어 plain -20, sand -10, forest -10, castle +10.
엔진 규칙(신규, 모두 config/맵 rules 키, 기본 OFF=1.0):
- `naval_water_atk_mult` = 1.35 : 수병 공격자가 sea/reef/shallows/harbor 칸에 있을 때 총배율에 곱(clamp 이후, facing_cap 공유).
- `boarded_atk_mult` = 0.90 : 배 탑승 비수병의 공격 배율(반격 포함).
- `naval_land_atk_mult` = 0.80 : 수병이 수상이 아닌 칸에 있을 때 공격 배율.
- (선택) `naval_water_def_bonus` : 이미 terrains def_pct로 표현했으므로 불필요.
기존 `T_TERRAIN_ATK`/`T_TERRAIN_DEF` 패시브 템플릿(`when.terrain` 목록)으로 영웅 한정 보강 가능: 이순신 수상 atk +15%(terrain: sea, reef), 넬슨 harbor/sea def +10% 등. 영웅 패시브는 이미 있는 데이터 경로이므로 엔진 변경 없음.

산술 (피해 = 공격력x총배율 - 방어x(1+방어보정%), 클램프 [0.6,1.5], def_total_cap 60; 시작값 가정, 영웅 보너스 제외)
| 상황 | 계산 | 피해 | 처치 필요 타수 |
|---|---|---|---|
| 수병(27) -> 보병(HP84 방10) 바다 | 27x1.35 - 10x0.90 = 27.5 | 27 | 4 |
| 보병(28) -> 수병(HP82 방9) 바다 | 28x0.90 - 9x1.25 = 13.95 | 14 | 6 |
| 수병 -> 수병 바다 | 27x1.35 - 9x1.25 = 25.2 | 25 | 4 (미러 치명도 상승, 해전맵 `dmg_mult` 0.85 검토) |
| 수병 -> 보병 평지(육상) | 27x0.80 - 10 = 11.6 | 12 | 8 |
| 보병 -> 수병 평지 | 28 - 9x0.80 = 20.8 | 21 | 4 |
바다에서 수병은 같은 타수 기준 약 1.9배 피해, 처치 타수는 4 대 6. 육지에서는 정반대(8 대 4). 가설: 이 정도가 "엄청 쎔"으로 체감되는지는 사람 확인 필요.
목표 지표(구현 후 `game:simulate`): 수병 1부대 vs 같은 코스트 보병 부대, 바다 맵 승률 85~92%, 육상 맵 30~40%, 해전맵 평균 턴 6~10, 턴상한률 5% 미만.

### 3.4 원거리·상성·지형 보정과 충돌 여부
- 상성 배율 행렬: naval 행은 0.87 한 칸(TROOP_TYPES_V2_SPEC). water_atk_mult는 상성 clamp 이후에 곱하므로 clamp [0.6,1.5]에 안 걸리고 facing_cap 1.8 공유. 후방 1.30 x 1.35 x 상성 1.0 = 1.76 < 1.8 안전. 상성 1.2 x 후방 1.30 x 1.35 = 2.1 -> facing_cap 1.8로 절단됨(수상 후방 공격은 상한 도달, 의도).
- 방어 합산: 수병 sea +25 + 오라/패시브는 def_total_cap 60 이내. reef +35에 오라 +20 -> 55로 상한 직전.
- 암초 `cover` 1: 원거리 공격자 대 암초 위 대상에 `forest_cover_mult`(켜져 있으면) 적용. 암초 위 수병은 원거리에도 강해진다(의도). 궁병 사거리 2는 배 위에서도 유지(원거리 페널티 없음 = 수병을 원거리로 잡는 정석 카운터는 유지).
- 고지: hill elevation 1이 sea 0 위의 수병을 내려다보는 상황은 `highground_mult`가 켜졌을 때만 작동; 해전 맵엔 hill 없음.
- 충돌: 지형 def_pct 모듈은 move_type별이라 "보병이 바다에서 -10"과 "배 탑승 공격 0.9"가 이중 페널티가 되지 않게 방어는 지형, 공격은 엔진 배율로 분리했다. 승려 치유는 바다에서도 가능(마을 회복 `heals`는 sea에 없음).
- 첫 턴 이동 상한(`first_turn_move_cap`)·지휘관 즉사 규칙과 충돌 없음.

### 3.5 배 오버레이 에셋 규약
- 유닛 위 오버레이는 유닛이 sea/reef 칸에 있을 때만 표시. 레이어 2장: `back`(선체, 유닛 아래) + `front`(뱃전/난간, 유닛 위)로 유닛 하반신이 선체에 들어간 듯 연출. 흔들림(bob)은 코드 트윈이라 에셋 불필요.
- 키: `ship.{set}.{kind}.{dir}.{layer}` 예 `ship.korea.warship.e.back`. set = default | korea | japan | china | west. kind = skiff(비수병 탑승용 작은 배) | warship(수병 병사) | flagship(수병 영웅·지휘관). dir = e | s (w = e의 flipX, n = s 재사용 또는 별도 n; 우선순위 낮음). layer = back | front. 폴백 순서: 요청 set -> default, kind 없으면 warship -> skiff.
- 문화권 매핑(후보): 한국 skiff 조각배/warship 판옥선/flagship 거북선(이순신 지정 `ship.korea.turtle`), 일본 skiff 코바야/warship 세키부네/flagship 아타케부네, 중국 skiff 사선/warship 몽충/flagship 누선(주유), 서양 skiff 롱보트/warship 갤리·카락/flagship 전열함(넬슨 `ship.west.ship_of_line`). 영웅별 지정 키가 있으면 문화권 기본값보다 우선.
- 크기: 타일 소스 64px 기준 1칸 64x64 투명 PNG(flagship은 96x64도 허용하되 앵커는 칸 중심, 칸 밖 돌출은 다음 칸을 가리지 않는 범위). 표시 TILE=52.
- 파도 항적 `fx.wake` 4프레임 64x64(선택).
- 1차 에셋 최소 세트: default+korea+japan x {skiff, warship} x {e,s} x {back,front} = 24장, + flagship korea 거북선·west 전열함·china 누선 각 e,s x 2 = 12장. 나머지는 default 폴백.

## 4. 수병 연계 (이순신·넬슨·주유)
- TROOP_TYPES_V2_SPEC 채택 3명(이순신 sword->naval, 넬슨 sword->naval, 주유 archer->naval)의 부대 병종이 수병이면 위 보너스 적용. 영웅 유닛(class)은 수병이 아님(부대 전용).
- 문제: 스테이지 병사 병종은 지휘관 병종 1종(v2 규칙). 플레이어가 이 3명을 지휘관으로 못 두면 해전 4종은 비수병 부대로 진행 -> 보너스를 누리는 쪽은 적(수병 지휘관)뿐이라 불리해짐. 제안: 해전 4스테이지는 "수군 대여" 고정 편성(이순신 지휘관 수병 부대 + 플레이어 영웅이 부지휘관/배 탑승 보병·궁병으로 합류) 또는 넬슨/주유 보유 시 선택. 결정 필요(열린 질문 2).
- 해전 4종 편성 방향(시작값, 구현 후 재조정)
| 스테이지 | 아군(방향) | 적 | 목표 승률 밴드 | 비고 |
|---|---|---|---|---|
| 01 옥포 | 수병(이순신) 위주 소수 정예 | 일본 수병 소수(+병사 레벨 낮게), 유닛 수 아군보다 1~2 적게 | 85~90% | 튜토리얼 해전, 상륙 항구 연출 |
| 03 한산도 | 수병 + 중앙 섬 거점 | 일본 수병 다수 + 목표 [12,10] 유인 | 70~75% | 학익진: 섬 뒤 암초 엄폐, 목표 점유(5절) |
| 07 노량 | 수병 | 일본 수병 다수, 암초 군집 활용, 증원 | 55~60% | 야간(암전 연출), 후반 증원 |
| 09 명량 | 수병 소수 | 적 수 우위(8~10 대 4~6), 좁은 항로 | 40~50% | 암초 양쪽 벽, 병목, 적 증원 없음 |
- 해전 스테이지는 `pvp_fair:false, pvp_listing:excluded`(PvP 제외). 수병 코스트 1 그대로면 해전맵에서 수병 편성이 압도적이므로 PvP·자유대전에 노출하지 않는다.

## 5. 목표(O) 구현 규칙 (전체 범위)
`stage.objective`(전투 생성 시 state에 고정, 기존 `survive_turns`와 같은 방식 `normalizeObjective` 확장):
```
{ "type": "capture", "points": "map"|[[x,y],...], "mode": "any"|"all",
  "hold_turns": 0|N, "by": "any_unit"|"commander", "side": "a",
  "fail_if_enemy_holds": N|null }
```
- 도달형(hold_turns 0): 아군(side a) 유닛이 point 칸에 서는 순간 승리(mode any: 한 곳, all: 전부 동시 또는 누적 mode `all_sticky`).
- 점유형(hold_turns N): 아군이 해당 칸에 N 라운드 연속 위치. 적이 그 칸에 있으면 카운트 리셋. 라운드 종료 시 판정.
- 복수 O(8번 [12,9],[18,12], 10번 [11,9],[12,9])는 mode로 지정: 8번 any(탈출/기록 회수 중 택일) 또는 all, 10번 쌍은 보스 방 중앙 2칸이라 `all` + 보스 처치와 OR 조건 가능(`or_kill_boss`).
- 승패 우선순위: 지휘관 사망 즉시 패배 > 점령 승리 > 턴 상한. `turn_limit` 경로와 동일하게 `finish($state,'a','objective')`.
- 적 봇(HeuristicBot): 목표 칸으로 가는 이동 가중치 + 점령 중인 아군 우선 공격(HeuristicBot 수정 요청).
- 시각: O 칸에 깃발/표식, 점유 진행 UI(N/M). 이번 범위: 시각 표시 + 위 규칙 전체. 규칙 OFF(objective 미지정)이면 현 동작과 동일.

## 6. 증원·우회 트리거 (단계별)
필수(MVP)
- `stage.triggers[]` = `{ "on": {"turn": N}, "action": "spawn", "side": "b", "zone": "E2", "units": [...], "limit": 2 }`. `map.meta.enemy_extra_zones`(이름 있는 좌표 목록)에 증원 구역 정의(맵 데이터 추가는 임밸런 담당, 엔진은 spawn 액션만). 구역에 아군이 서 있으면 인접 빈 칸으로 밀어냄/지연.
- 증원은 전투 생성 시 state에 고정(진행 중 전투 데이터 변경 무영향). 이벤트 로그 `reinforce` 추가(BattleStory 연출).
선택
- 조건 트리거: `unit_hp_below`(보스 HP 66%/33%), `unit_killed`, `object_held`. 액션: spawn, buff(전체 atk +10%), terrain_change(발판 붕괴 `j`->`V`).
- 우회(flank): 증원 구역을 맵 반대편에 둠 + 첫 도착 턴 지연 N 표시 UI(적 증원 예고 턴 카운트).
맵 후보(시작값): 07 노량 3턴 후 후방 증원 2, 09 명량 증원 없음(수적 열세가 서사), 06 행주 3턴 후 측면 증원, 04 진주 5턴 후 외부 증원, 10 보스 페이즈 소환.

## 7. 서가 8·10번 허구 지형·보스
- `V` 허공은 영구 통행 불가, 시각은 별/검은 안개, 가장자리 페이드. `j` 발판(8번의 R 10칸)은 통행 가능하되 (선택 엔진) 밟은 뒤 N라운드 후 붕괴 `j`->`V`로 불안정 지형을 연출 -> 퇴로 단절 위험. 필수 아님.
- 보스 규칙(선택): 10번 중앙 방 보스 지휘관 HP 페이즈 2회(66%/33%): 페이즈 진입 시 마물(monster) 소환(서가 구역), 보스 atk +10% 누적, 회복 상한 `heal_cap` 유지. 보스는 `kind:commander` 즉사 규칙으로 처치 시 승리. 시작값: 보스 HP 일반 지휘관 x1.5, 병사 레벨 +3. 수치는 `game:simulate` 후 확정.
- 8번 목표 2개 + 고립 E (20,17) 처리는 열린 질문 4.

## 8. 시나리오 정정 인계표 (송서사)
| 현재 서사/데이터 | 원본 맵 사실 | 정정 방향 |
|---|---|---|
| 옥포 = 평원(pk_01) | 69% 바다 해상, 서쪽 육지·모래, 항구(P) 6칸, 중앙 암초 | 해전으로 서술. 항구에서 출진 |
| 한산도 = pk_19 호수형 | 95% 바다, 중앙 섬과 암초, 목표 해상 [12,10] | 학익진 유인 장면을 해상 목표 점으로 |
| 행주 = 전용 산성 없음(pk_06 범용 요새) | 중앙 고지 + 성벽 + 주변 숲·언덕 산성 | 행주산성 전용 지형으로 서술 |
| 평양성 = 해자 포함 서술 가능 | 해자 없음, 성곽 전체 + 건물 + 성문 2곳(복수) | 해자 언급 삭제 |
| 노량 = 중앙 섬 | 섬 없음, 암초 군집 다수, 야간 | 중앙 섬 삭제, 암초 지대로 |
| 명량 = 물살/조류 | 조류 규칙 없음(엔진 미지원), 양쪽 암벽 + 좁은 항로 | 물살 대신 좁은 해협·암벽으로 서술(조류는 선택 확장) |
| 진주성 | 방형 성벽 + 남문 4칸 + 내부 건물·망루 + 동쪽 강 | 남문 공성 중심 |
| 정암진 | 숲 속 남북 강, 모래 도하점 3곳 | 도하 지점 매복 서사 |

## 9. 엔진 영향 파일과 작업 분배

엔진 영향: `app/Game/Engine.php`(이동 탐색 reachable/비용, `damageInfo` 수상 배율, objective, triggers), `app/Game/RuleSet.php`(naval move_type·symbols·신규 규칙 키 검증), `app/Game/MapChecker.php`(신규 기호, 스폰·목표 점검, 수상 연결성), `app/Console/Commands/GameSeed.php`·`GameSeedMapPack.php`(maps_imjin10.json·terrains 시드), `app/Services/MapCatalog.php`, `app/Game/ArmyBuilder.php`·`HeuristicBot.php`(수병·목표 봇), `config/game.php`, `database/data/terrains.json`·`unit_types.json`·`stages.json`(승인 후), FE `resources/js/game/data/rules.js`, `assets.js`, `UnitView.js`, `scenes/Battle.js`, `fx/UnityGround.js`·`RmGround.js`(tile_layer 이름), 배치 UI(Deploy).

### 박백엔 (엔진·시드)
| 단위 | 내용 | 인수조건 |
|---|---|---|
| B1 | terrains 시드에 신규 7지형 + naval 행(terrains_imjin10_proposal.json), unit_types `naval` | 시드 멱등 2회 실행 동일, V·W는 5종 move_type 전부 불가 테스트, 누락 move_type 폴백 없음 |
| B2 | 이동 탐색에 naval 반영, 수상 비용 표대로 이동 가능 범위 | 보병 바다 2칸/턴, 수병 5칸, V 비행도 불가 단위 테스트 1~2개 |
| B3 | `naval_water_atk_mult`·`boarded_atk_mult`·`naval_land_atk_mult` (기본 1.0=OFF, 맵 rules 오버라이드 허용) | OFF에서 기존 시뮬 결과와 시드 동일(회귀 0), ON 시 3.3절 표의 피해값 재현 |
| B4 | maps_imjin10.json 시드(`tile_layer`·`meta` 포함), MapChecker가 신규 기호 통과 | `game:map-check` 10맵 ERROR 0, 08번 고립 스폰은 WARN |
| B5 | objective capture(5절) + 스테이지 고정 | any/all/hold 판정 1~2 케이스, 미지정 시 기존 동작 동일 |
| B6 | triggers spawn(6절 필수) | 지정 턴 증원 생성, 로그 이벤트, 진행 중 전투 불변 |
| B7 | HeuristicBot 수상·목표 인식 | 해전맵 봇 전투가 턴상한 5% 미만으로 종료 |
| B8(선택) | 조건 트리거·발판 붕괴·보스 페이즈 | 시뮬로 확인 |

### 윤프론 (FE)
| 단위 | 내용 | 인수조건 |
|---|---|---|
| F1 | 신규 지형 키/색, rules.js 이동 비용·이동 범위 표시(수상 포함) | 해전맵에서 이동 범위가 서버와 일치 |
| F2 | 배 오버레이 레이어(back/front), 키 규약·폴백, bob 트윈, 수병 항상 표시 | sea/reef 위 비수병만 skiff, 수병 warship/flagship, 하선 시 소멸 |
| F3 | tile_layer 신규 이름 렌더(sea 애니메이션, 해안 블렌드, void 연출) | 10맵 실화면 스크린샷 |
| F4 | 배치 UI: deploy_zones 10칸 표시, 고립 스폰 제외 | 6유닛 배치 가능 |
| F5 | 목표 표식·점유 진행 UI, 증원 예고 | O 깃발 표시 |

### 안아트 (에셋)
타일(64px): sea(깊은 바다 3~4프레임), 해안 전이(sea-sand, sea-grass), reef 변형 2, harbor 부두 2, sand, hill(기존 peak 계열 확장), void(별/안개 + 가장자리), rift_plank, shallows 강, wall/gate/castle_district/building 지붕 변형/tower. 배 오버레이는 3.5절 24+12장, `fx.wake`(선택), 마커 O 깃발. 모든 에셋은 manifest 키로 등록.

## 10. 열린 질문
1. 평양성(5번) C(성벽) 처리: 원본은 성곽 내부 전체가 C라 벽=불가로 변환하면 목표(12,10)에 도달 불가 + 성문 G 2곳이 무의미. 현재는 평양성만 C를 통행 가능 castle(방어 +30)로 변환(`meta.needs_user_confirm`). 사용자 확인 필요: (a) 이대로, (b) C=벽 + 내부 일부를 길로 수정(원본 변경이므로 승인 필요).
2. 해전 4종에서 플레이어 수병 지휘관 확보 방식(수군 대여 편성 / 보유 시 선택). 병사 병종이 지휘관 단일 병종이라 이 결정 없이는 수병 우위를 플레이어가 못 쓴다.
3. 건물(B)·탑(T)을 통행 가능(castle)으로 둔 것이 의도인지(건물을 장애물로 원하면 B=`W`).
4. 8번 E (20,17) 고립 칸: 원본 오기인지 확인(현재 spawns에 보존, 배치 제외).
5. 수병 이동 5 상향과 마법사 이동 3의 바다 1칸/턴 수용 여부.
6. 모래 d를 `n` 재사용으로 줄일지, 허공 V를 `W` 재사용으로 줄일지(엔진 작업 감소 vs 의미 분리).
7. 사람 플레이로 확인할 것: 수병 체감 강도(3.3), 바다 맵 길이(턴 수), 배 오버레이 가독성, 해전 4종 난이도 밴드, 8·10번 허구 지형 분위기.

## 부록 (2026-11-09): 재시드 보호 · 시뮬 손실률 · 해전 시뮬 재현 한계

- **재시드 보호**: `game:seed-imjin10`(--force 포함)은 `App\Support\MapRedesignGuard::upsert`를 거쳐 DB `maps.meta.redesign`이 있는 행(im_06_haengju 등)의 tiles·spawns·deploy_zones·meta를 덮어쓰지 않는다(경고 출력 후 건너뜀). 회귀 테스트: `Imjin10SeedTest::test_meta_redesign이_있는_맵_행은_재시드해도_tiles_meta가_보존된다`. 개편 맵을 의도적으로 되돌리려면 먼저 meta.redesign을 제거한다.
- **시뮬 아군 손실률**: `game:simulate` [3] 레벨 표에 `아군 평균 손실률` 열(델타별)과 승/패 판 평균 한 줄, `--by-stage`에는 셀별 `(손실 N%)`가 있다. 손실률 = 시작 시점 아군(아군 NPC 포함, 증원 제외) 체력 합 대비 감소 비율(`Duel::allyLoss`). 기존 열·줄은 그대로다.
- **해전 배치를 시뮬레이터가 재현 못하는 원인(점검 결과, 코드 변경 없음)**: 배치 영역(deploy_zones.a)은 ch1_s1·s3에서 전부 sea 30칸이라 수병 배치 자체는 가능하다. 차이는 `GameSimulate::levels`에 있다. (1) `forced_heroes`의 `yi_sun_sin`을 실제로 쓰지 않고, 순환하는 임의 지휘관(`heroList`는 campaign_only 제외)에 `unit_type/troop_type=naval`만 덮어쓴다. (2) `@protagonist`와 `rules.protagonist_troop`(주인공 병종 덮어쓰기)을 무시한다. (3) `rules.deploy_slots.fixed`(고정 슬롯)와 플레이어 수동 배치(placements)를 반영하지 않고 자동 배치한다. (4) 기본(비 `--realistic`)은 stages.rules 의 cues·sub_objectives·win/lose 조건이 빠진다. 실측: `--stage=ch1_s1`에서 a측 승률 100%·평균 2.6턴으로 실전과 거리가 멀다. 해결하려면 `--party-heroes=<주인공코드>,yi_sun_sin`과 `--realistic`을 쓰거나, 시뮬에 forced 영웅 해석·deploy_slots 반영을 추가하는 중간 규모 변경(별도 승인)이 필요하다.
- **/api/auth/me 게스트 401**: 서버측 원인 아님. `auth:sanctum` 그룹의 정상 응답(비로그인=401)이며, `bootstrap/app.php`는 AuthenticationException을 보고하지 않고 `storage/logs/laravel.log`에도 해당 기록이 없다. 남는 노이즈는 브라우저 콘솔/네트워크 탭 표시뿐이고, FE에서 호출 횟수를 줄이는 것으로 처리(윤프론). 서버가 200+null로 바꾸면 계약 변경이라 권하지 않는다.

### 부록 보강 (2026-11-09): `game:simulate --faithful` (해전 시뮬 충실도, 옵트인)
- 기본 동작·출력은 불변. `--sections=level`에서 `--faithful`을 주면 플레이어 파티를 실전 출전 구성으로 만든다: `stages.forced_heroes`({hero,unit_type,troop_type} 대여 포함) + `rules.deploy_slots.fixed_slots` 영웅(중복 제거, 덮어쓰기 병합), `@protagonist`는 `--protagonist`(기본 protagonist_male_sword)로 해석하고 `rules.protagonist_troop`이 있으면 병종 덮어쓰기, 주인공이 지휘관. 고정 슬롯 좌표는 파티원 전원이 슬롯을 가질 때 a 진영 배치에 쓴다(b 진영으로 뛰는 판은 자동 배치). 자유 슬롯·부대는 자동 배치. `--party-heroes`가 있으면 무시. 구현: `GameSimulate::faithfulParty`, `Duel::run`의 party 스펙 `positions`(없으면 null=기존 동작). 운영 로직 무변경.
- 측정(레벨 델타 -2/+0/+2, 델타당 48판=총 144판, seed=1, 기본 모드/비 realistic):
  - ch1_s1: 기존 31.2/35.4/52.1% -> faithful 20.8/27.1/18.8%
  - ch1_s3: 기존 66.7/87.5/91.7% -> faithful 0/0/0% (a 진영 승률 0%, 평균 3.0턴)
  - ch1_s3 `--faithful --realistic`: 0.0/95.8/100.0%(각 48판). 즉 비 realistic 모드는 capture 목표를 stages.rules 대로 평가하지 않아 faithful 결과를 그대로 믿기 어렵다. 해전 밸런스 판단은 `--faithful --realistic` 사용 권장. (ch1_s3 비 realistic 0%의 정확한 종료 사유는 이번에 추적하지 않음)
  - 참고: ch1_s3 rules에 protagonist_troop 이 없어 주인공은 검 보병이 바다 칸(탑승)에서 출전한다(실전 forcedOf 와 동일 해석).

### 부록 보강 (2026-11-09 추가): `game:simulate --cue-goals / --push-commander / --death-log=N` (realistic 전용, 옵트인)
- 세 옵션 모두 `--realistic` 와 함께 쓰는 시뮬 전용 옵트인이다. 기본 동작·기본 출력은 불변이며 실전 엔진(BattleService)에는 영향이 없다. 구현: `app/Console/Commands/GameSimulate.php`(시그니처·botOptions 설정), `app/Game/StageSim.php`(동작).
- `--cue-goals`: 아직 발동하지 않은 `cue.when` 의 `in_zone`(예: `@protagonist` 신호 타일)도 아군 봇이 목표로 추구한다. 순서는 win 조건 뒤(낮은 우선순위)로 코드 주석에 명시.
- `--push-commander`: `defeat_commander` 목표에서 사거리 안에 적이 없는 비-지휘관·비-치유 유닛이 적 지휘관 쪽으로 진격한다(기본 봇은 목표 추구를 하지 않아 전열이 서 있기만 하는 경우를 보정).
- `--death-log=N`: 플레이어 지휘관이 사망한 판의 직전 이벤트 로그를 최대 N판 출력한다(`[cmd-death] <stage> seed=.. delta=.. 판k: Tn 지휘관 사망 가해=..` + 턴·가해 유닛·피해·지형·상성 줄). 로그 링 크기는 N>1 이면 min(200,N), 아니면 8(`StageSim` 주석: `--bot=sim_death_log=N` 으로도 조절). 판 수 집계에는 영향이 없다.
- 사용 예(컨테이너, 기존 예시와 동일 형식): `php artisan game:simulate --sections=level --stage=<code> --faithful --realistic --cue-goals --push-commander --death-log=3`
- 주의(중요):
  - 이 옵션들은 봇 행동을 바꾸므로 **같은 스테이지라도 승률이 옵션 조합에 따라 달라진다.** 기본 측정(옵션 없음) / `--faithful` / `--realistic` / 위 옵션 포함 결과를 한 표에 섞거나 전후 비교에 쓰지 말고, 비교는 반드시 같은 옵션 조합·같은 seed·같은 판수로 한다. 보고 시 사용한 옵션 전체를 함께 적는다.
  - 코드 주석이 밝히는 미반영 한계: BattleStory(스토리 연출 플래그), 플레이어 수동 판단(회피·집중), lose_conditions 방어(적의 구역 진입 저지), 교대 행동(alternate_activation) 모드의 목표 추구.
  - 이 옵션으로 얻은 승률의 실전 일치 여부: 미확인(플레이 데이터와 비교한 기록을 찾지 못함).

### 부록 보강 (2026-11-10): `game:simulate --must-survive / --objective-only` (realistic 전용, 옵트인)
- 두 옵션 모두 `--realistic` 와 함께 쓰는 시뮬 전용 옵트인이다. 기본 동작·기본 출력은 불변이며 실전 엔진(BattleService/Engine)은 무변경이다. 구현: `GameSimulate.php`(시그니처·botOptions `sim_must_survive`/`sim_objective_only`), `StageSim.php`(동작).
- 판정 사실: `ally_npcs.must_survive:true` 사망 즉시 패배(`Engine::resolveDeath`, `ArmyBuilder::addAllyNpcs`가 플래그 부여)와 `lose_conditions`(`defeated` 포함, `StageRules::check`)는 realistic 모드에서 **옵션 없이도 이미 실전과 같은 경로로 판정**된다(`--no-ally-npc` 제외). 새 옵션은 판정을 바꾸지 않는다.
- `--must-survive`: (1) 생존 의무 유닛 사망으로 끝난 판의 종료 사유를 `lose:commander_defeated(must_survive:<영웅코드>)` 로 구분 표기(기본은 `lose:commander_defeated` 로 지휘관 사망과 합쳐짐), (2) route 없는 must_survive 아군 NPC도 동행(호위) 대상에 포함.
- `--objective-only`: 목표 추구자(in_zone/capture 지정 유닛) 외 플레이어 유닛이 단독 전진하지 않는다. 호위 대상(route NPC + must_survive NPC)이 있으면 그 곁(2칸 초과 시 접근, 봇 이동은 2칸 밖이면 폐기), 없으면 목표 추구자 곁에 머물며 사거리 안 적만 공격한다. `--push-commander` 는 무시된다. 호위 대상도 목표 추구자도 없으면 효과 없음.
- 사용 예: `php artisan game:simulate --sections=level --stage=<code> --levels=8 --faithful --realistic --must-survive --objective-only`
- 측정 메모(8판/델타, seed=1): ch11_s5 `--must-survive` 패배 16판 중 6판이 npc_yang_gyu 사망. ch12_s1 은 옵션 없이도 24판 전패(전부 must_survive:liu_bei 사망으로 표기됨), `--objective-only` 로도 승률 0% 유지(손실률만 20~28% -> 15%).
- 미구현(ch16_s6 포대 돌파구 `wall_breached`): 플래그는 cue(`in_zone side:a` 성벽 앞 4칸)로 세워지며 `--cue-goals` 가 이미 후보를 지정한다. 다만 `assignGoals` 가 유닛당 목표 1개만 허용하고 주인공이 win 조건 구역에 먼저 배정되어 별도 유닛이 배정되지 않을 수 있다 - 변경 규모: 중복 배정 방지 ~5줄 + 성벽 칸 통행 가능 여부 확인(구현 안 함, 실측 필요).
