# 필수 영웅 소프트 천장 + 시나리오 배너 (2026-11-08)

배경: 영웅은 뽑기로만 얻고, 스테이지는 스토리 필수 영웅(`database/data/stage_required_heroes.json`, 190스테이지 48명)을 보유해야 플레이 가능.
풀 503명 기준 이순신(S) 1명의 기대 뽑기가 약 1,400회라 그대로면 첫 스테이지부터 막히므로 소프트 천장을 둔다.

> 2026-11-14: 소환 결제 통화가 펜으로 전환됨(기본 1회 1펜/10연 9펜). 이 문서의 골드 수치는 골드 모드 기준 기록이며 펜 기준으로는 1골드 100 = 1펜, 즉 '9,400골드'는 약 94펜, '4,500골드'는 약 45펜 규모로 읽는다(시작 펜 10 + 튜토리얼 5 = 단일 15회).

## 1. 승격(작업 1)

- 필수 영웅 48명 중 DB `heroes.campaign_only=1` 이던 14명(npc_boroldai, npc_eudes_aquitaine, npc_gang_min_cheom, npc_gokbori, npc_guyuk, npc_kim_jong_hyeon, npc_kim_pumil, npc_la_hire, npc_liu_rengui, npc_maeda_toshiie, npc_publius_scipio, npc_qaraqush, npc_so_jeongbang, npc_torii_suneemon)을 기존 방식(`playable: true` + `game:npc-promote`)으로 승격했다.
  - 시드: `npc_roster_v3_additions.json`, `npc_roster_v3_additions_shelf.json`, `npc_roster_shelf_ch11*.json`, `..._ch13_20_ext*.json`, `..._ch15_rome_carthage_add.json`, `..._ch19_ayyubid_add.json`, `..._ch21_mongol_add.json`, `..._ch23_24*.json` 의 해당 행에 `"playable": true` 추가(재시드해도 `GameSeedShelf` 가 campaign_only=0 유지).
  - 개발 DB: `php artisan game:npc-promote` (14명 변경, 멱등). 14명 모두 gacha_pool.json v7 `named_npc.ready_codes` 에는 이미 있었고(GameData 가 유효 campaign_only=false 로 취급) DB 플래그만 1이었다.
- 점검 명령: `php artisan game:audit-required-heroes` (읽기 전용). heroes 행 존재 + DB campaign_only=0 + 유효 campaign_only=0 + 가챠 풀 포함을 검사, 미통과 시 종료코드 1.
  - 실행 결과: `필수 영웅 48명 / 통과 48명 / 미통과 0명  등급 분포 {"A":13,"B":23,"C":5,"S":7}`.

### 1-2. 추가 승격 (2026-11-08 2차, 개발 DB 적용)

- 11명: ch25 적장 6(npc_omar, npc_sogetu, npc_toghan, npc_li_heng, npc_zhang_wenhu, npc_fan_yi) + ch25 필수 후보 4(npc_pham_ngu_lao, npc_tran_nhat_duat, npc_tran_quang_khai, npc_tran_khanh_du) + ch15 npc_carthalo.
  - `npc_roster_shelf_ch25_dai_viet_add.json`, `npc_roster_v3_additions.json` 해당 행에 `"playable": true`, `gacha_pool.json` `named_npc.ready_codes` 에 11개 추가(풀 version 7 유지, 테스트가 7 을 단언), `game:npc-promote`(dry-run 후 실행, 11명 변경).
  - 풀 503 -> 514 (S31/A73/B216/C194). `exclude_patterns` 의 `npc_cart*` 가 `npc_carthalo` 까지 걸러내고 있어 `npc_cart_*` 로 좁혔다(실제 수레 코드는 npc_cart_1/2/front/rear).
  - 승격 전에는 생성기가 풀 밖 코드를 조용히 빼고 "풀 밖 제외/필수 대기"로만 보고한다(검증 실패로 배너가 꺼지지 않음). 필수 4명은 아직 `stage_required_heroes.json` 의 `required_when_obtainable` 이라 스테이지 필수가 아니다(필수로 확정하려면 별도 결정).
- DB에 없어 구현하지 않은 인물(목록만): npc_boksin(복신, ch13), npc_memnon, npc_porus(ch17), npc_stigand(ch23). 풀 밖이라 배너에 못 들어간다.
- 아직 campaign_only 로 막힌 배너 후보(요청 범위 밖, 목록만): npc_yu_bang(ch11), npc_liu_qi(ch12), npc_goguryeo_dam_keeper(ch14), baha_ad_din(ch19), npc_yet_kieu/npc_da_tuong/npc_nguyen_khoai/npc_tran_quoc_toan(ch25).
- ch26(루비콘) 필수 후보 5명(npc_mark_antony A, npc_labienus B, npc_publius_crassus C, npc_curio C, npc_asinius_pollio C): `gacha_pool.json` ready_codes 에 선등록(DB 에 없으면 풀이 건너뜀), 로스터 `npc_roster_shelf_ch26_caesar_add.json` 은 이미 `playable: true`. **heroes 행이 아직 DB 에 없어** `game:npc-promote --dry-run` 이 "heroes 행 없음(건너뜀)"만 낸다 -> `game:seed-shelf --chapters=26 --with-npc` (맵 확정 후) 시드 뒤에 `game:npc-promote` 재실행이 필요하다(대기).

## 2. 규칙

설정(`config/game.php` `gacha`): `required_pity`(K, 기본 30, 0=끔, env `GAME_GACHA_REQUIRED_PITY`), `required_boost`(기본 5 [팀장 결정으로 20에서 하향, 코드 기본값도 5 로 일치시킴], env `GAME_GACHA_REQUIRED_BOOST`),
`required_library`(서고에서도 적용, 기본 false, env `GAME_GACHA_REQUIRED_LIBRARY`), `banner_min_per_rarity`(1), `banner_max_pool`(150), `required_path`(테스트용), `registry_path`(테스트용 레지스트리 경로), `banner_overrides`(배너별 차등 훅, 기본 `[]`: `['sc_ch1' => ['required_boost' => 3, 'required_pity' => 40]]` 처럼 배너 key 로 부스트/K 를 덮어쓴다. 지금 적용 중인 값: `sc_ch1` => 천장 8·부스트 5, 나머지 배너는 전역 30·5).

1. 대상 영웅 = 유저가 다음에 막힐 스테이지의 미보유 필수 영웅(풀에 있는 영웅만). 스테이지 선택: 미클리어 스테이지를 `sort_order,id` 순으로 보되, 선행이 없거나 '통과 가능'한 것만 후보. 통과 가능 = 클리어함, 또는 (필수 영웅 전원 보유 + 선행 통과 가능) 이라 필수 영웅을 모은 스테이지 뒤를 한 칸씩 미리 본다. 필수 영웅 출처는 `stages.rules.required_heroes`, 없으면 `stage_required_heroes.json`.
2. 부스트: 이번에 뽑는 풀에 대상이 있으면, 등급이 정해진 뒤 그 등급 안에서 대상의 가중치를 x`required_boost` 로 올린다(등급 확률 불변).
3. 천장: 대상 영웅별 카운터(유저 x 영웅). 그 영웅이 나올 수 있는 풀(대상이 풀에 포함된 소환)에서 미획득으로 쌓인 뽑기 수가 K 이상이면 다음 뽑기 슬롯에서 그 영웅 확정(10연 중에도, 한 슬롯에 1명, 여러 명이면 스테이지 앞선 순). 획득(자연 획득 포함) 시 그 영웅 카운터 삭제.
4. 카운트 정책(권고안 채택): 배너 풀에 없는 영웅은 카운트하지 않는다. 근거: 천장은 '그 영웅이 나올 수 있는 기회를 K번 줬다'를 의미해야 공시가 단순(K회 소환)하고, 다른 배너를 뽑아 천장을 쌓은 뒤 목표 배너에서 즉시 확정받는 우회가 없다. 서고(전체 풀, 기능 ON 시)는 모든 대상이 풀에 있으므로 모든 뽑기가 카운트된다.
5. 우선순위: 필수 천장 확정 > 10연 최소 등급 보장(기존 pity min_rarity) > 부스트. 확정 슬롯이 마지막이고 확정 영웅이 A 미만이며 앞 슬롯에 A 이상이 없으면 그 10연의 최소 등급 보장은 적용되지 않는다. `pity_counter`(A 이상 연속 미출현 표시값)는 배너와 무관하게 공유.
6. 서고(전체 풀)에서는 기본 OFF(`required_library=false`): 부스트·천장 모두 적용 안 함. 시나리오 배너에서만 적용.
7. 이미 보유한 필수 영웅은 대상에서 빠지고, 중복 조각 규칙은 기존 그대로.
8. 멱등: 같은 `request_id`+`count`+`banner` 재전송은 저장된 결과를 `replay=true` 로 반환하고 골드·카운터를 다시 바꾸지 않는다. count 또는 banner 가 다르면 409 `request_id_reused`.
9. 기능 끄기/롤백: `required_pity=0` 이면 기존 동작과 동일. 마이그레이션 컬럼이 없으면 자동으로 꺼진다(시나리오 배너도 `banner_key` 가 없으면 비활성).

## 3. 시나리오 배너

- `database/data/gacha_banners.json` v2: `pool_codes` 가 있는 배너 = 시나리오 배너(`key,title,sub,scenario_chapter,scenario_refs,art_key,required_heroes,hero_codes(쇼케이스),pool_codes,pool_sides,pending_required,generated`). pool_codes 없는 v1 배너는 표시 전용으로 계속 로드되지만 현재 파일에는 없다. 배너 개수 하드코딩 없음.
- 로드 시 검증(`GachaService::scenarioBanners`): pool_codes 전원이 전체 풀에 있음(campaign_only 불가), required_heroes 가 pool_codes 안에 있음, 확률>0 인 등급마다 최소 인원, 풀 크기 상한. 위반 시 해당 배너만 비활성 + `Log::warning`. 사유만 보려면 `scenarioBannerProblems()`(감사 명령이 사용).
- `POST /api/gacha/pull` 에 선택 필드 `banner`. 생략 또는 `normal` = 서고(전체 풀, 기존과 동일). 알 수 없거나 비활성은 422 `banner_unknown`(차감·로그 없음). 배너 풀 안에서 등급 추첨(풀에 없는 등급은 확률 0, 나머지는 상대 가중으로 정규화)·10연 보장 적용(보장 등급이 풀에 없으면 건너뜀). 응답에 `banner`.
- 로그: `gacha_pulls.banner_key`(NULL=서고) — 마이그레이션 `2026_11_08_000200_add_banner_key_to_gacha_pulls.php`.
- `GET /api/gacha` 응답: `banners[]` 시나리오 배너 = `key,title,sub,hero_codes(쇼케이스, 아군만),art_key,scenario,scenario_refs,pool_summary(등급별 인원),rates[{rarity,rate_pct,hero_count,per_hero_rate_pct}],pool_heroes[{...,side,default_visible}],pool_side_counts{ally,enemy},recommended,blocking,required_heroes,required_owned,required_total,required_pity{enabled,threshold,boost_multiplier,targets[{hero,...,base_rate_pct,effective_rate_pct,progress}]}`. 최상위에 `blocking_banners[]`.
- 서고: `heroes[]`(풀 구성 목록)에 `unaffiliated` 표시, 비소속 먼저·등급순 정렬. `hero_count_unaffiliated{total,by_rarity}`. 비소속 = 풀 - 모든 시나리오 배너 풀 합집합. 서고 쇼케이스(`normal.hero_codes`)는 S급만, 비소속 S 우선(부족하면 소속 S), 영웅 직업(`heroes.unit_type`, 마법사·치유사 포함 7종; 부대 병종 `troop_type` 아님. 근거 database/data/S_MAGE_HEALER_PROPOSAL_20261108.md) 라운드로빈, KST 날짜 기준 결정적. 코드가 이미 `unit_type` 기준임을 확인했고 주석만 정정했다.

### 3-1. 시나리오 레지스트리와 생성기

- `database/data/scenario_registry.json`: 시나리오(=`stages.chapter`) 1개당 `scenarios[]` 항목 1개. 현재 시나리오 배너 17개 = ch1, ch11~25, ch26(루비콘; 메인 스토리 ch101~104 는 배너 없음, 아래 exempt 참조). 이전 기록: `sc_ch26`(루비콘, `status: pending`, `art_key: europe`, include julius_caesar). `exempt_chapters`: 999(종장), 101~104(메인 스토리: 영웅 필수 아님·영웅 풀 없음 -> 뽑기 시나리오 배너 비대상). **규칙: 시나리오를 추가하면 배너가 자동 생성되며, 메인 스토리처럼 영웅이 필수가 아닌 시나리오는 `exempt_chapters`(챕터=>사유)에 지정해 배너 대상에서 뺄 수 있고 감사의 "배너 없는 시나리오" FAIL 에서도 제외된다.** 필드: `key, chapter, title, sub, art_key, status(active|pending), appearance_sources(기본 required/stage_allies/stage_enemies), include_enemies(기본 true), exclude_title_pattern, roster, include, exclude, sides, showcase, required_extra, cultures, span, min_counts(기본 S1/A3/B8/C8)`. 필드 설명은 파일 `_meta.fields`.
- `php artisan game:gen-scenario-banners` (**dry-run 기본**, 표만 출력): 레지스트리 + 스테이지 등장자 + 필수 영웅 -> 풀 구성.
  - 필수 영웅 = `stages.rules.required_heroes` 또는 `stage_required_heroes.json`(+`required_when_obtainable`). 아군 = `rules.ally_npcs`, `forced_heroes`(@ 제외), `join_hero`. 적 = `enemy_squad`(squads 포함)의 `npc_ref` + `rules.enemy_commander.hero` (`include_enemies` 기본 true, side=enemy). 직함형·익명(`*_captain/_chief/_guard/_scout/...`, 짐수레)은 정규식·풀 제외 규칙으로 빠진다. 현재 풀에 없는 코드는 조용히 빠지고 보고(풀 밖 제외/필수 대기).
  - 등급 하한 부족분은 `cultures` 우선, `crc32(key|code)` 순으로 결정적 보충(보충 열). 날짜·난수 독립이라 재실행 안전.
  - `--write`: `gacha_banners.json` 을 `.bak-<날짜시각>` 으로 백업한 뒤 갱신(normal 등 나머지 키 유지, pool_codes 없는 v1 배너 제거). `--registry=`, `--banners=` 경로 지정 가능.
  - `--sync-draft=database/data/gacha_banners_v2_draft.json`: 임밸런 초안의 title/sub/art_key/쇼케이스/include(스테이지에서 파생되지 않는 코드)/sides 를 레지스트리에 반영(`--write` 시 레지스트리도 백업 후 갱신). **초안이 갱신되면 이 옵션으로 다시 동기화**하고 `--write` 로 배너를 재생성한다.
- `php artisan game:audit-scenario-banners` (읽기 전용, FAIL 이면 종료코드 1): (a) DB 의 모든 chapter 가 레지스트리에 있음(999 예외) (b) active 인데 배너 없음/스테이지 없음, pending 인데 스테이지가 이미 있음 (c) 필수 영웅(풀 안) 포함 (d) 등급 하한 S1/A3/B8/C8 (e) 풀 상한 전체의 50% 미만 + `banner_max_pool` (f) art_key 가 `gachaKeys.js` 테마 key 에 존재 (g) 풀 코드가 현재 풀에 있고 서비스 검증으로 비활성이 아님. WARN: 생성본과 다름, 레지스트리 밖 배너, 필수 대기, 보충 50% 초과. pending 항목은 막지 않는다.
- 2026-11-08 갱신: 메인 스토리 sc_ch101~104 제거, 배너 17개 + 서고(normal), 감사 `active 17 / 배너 17 / FAIL 0 / WARN 0`, `gacha_pulls` 에 sc_ch10x 이력 0건. (이전 기록) 시나리오 배너 20개 생성(`game:gen-scenario-banners --sync-draft=... --write` 로 적용, 원본은 `gacha_banners.json.bak-*`), 감사 `active 20 / 배너 20 / FAIL 0 / WARN 0`. 임진(sc_ch1)은 43명(아군 11/적군 32), 필수 6.
- ch26 루비콘: `stage_required_heroes.json` 에 `ch26_s1~s10: []`, `required_when_obtainable`(ch26_s1~s8, 코드는 로스터 기준 npc_mark_antony 등; 설계서의 mark_antony 표기와 다름), `_scenario_groups.ch26` 추가. 스테이지 시드 후 레지스트리 `sc_ch26` 의 `status` 를 `active` 로 바꾸고 `--write` 하면 배너가 생긴다(설계서 부록 A 권고대로 필수 영웅과 배너 대표는 분리: 카이사르는 `include`/`showcase` 로만 넣고 필수가 아니다).

### 3-2. side 와 쇼케이스

- 추첨 풀 = 아군 + 적군(+미확정). 적군도 필수가 아니므로 천장 대상이 아니고 일반 풀 구성원이다(확률 = 등급 확률 / 배너 내 같은 등급 인원).
- `pool_sides`: 아군이 아닌 코드만 `enemy`|`unspecified` 로 기록(없으면 아군 확정). 응답 `pool_heroes[].side` 는 `ally|enemy`(미확정은 ally 로 표시되지만 쇼케이스에서는 제외), `default_visible`(= side 가 ally) 로 FE 가 기본 목록에서 적군을 접을 수 있다. 쇼케이스 `hero_codes` 는 아군 확정자만(서버가 한 번 더 필터).

### 3-3. 막힌 스테이지 안내(blocking)

- `GET /api/gacha` 최상위 `blocking_banners[]`: 유저가 다음에 막힐 스테이지의 미보유 필수 영웅(풀 안)이 속한 시나리오 배너 key 목록. 배너별 `blocking` 도 같은 값. 부스트·천장 ON/OFF 와 무관하게 계산한다(`recommended` 는 기능 ON 일 때만 true).

### 3-4. v1 배너 승계

| v1 | 처리 |
|---|---|
| imjin | -> `sc_ch1` (art_key imjin) |
| three_kingdoms | -> `sc_ch12` (art_key three_kingdoms) |
| sengoku | -> `sc_ch20` (art_key sengoku) |
| europe | 삭제. 루비콘 `sc_ch26`(pending)이 art_key europe 로 승계 |
| conquest | 이미 제거. alexander -> `sc_ch17`, genghis_khan -> `sc_ch18` 풀 승계, napoleon 은 서고 전용 |

일러스트(`gacha.title.*`)는 삭제하지 않는다. 배너 key 는 `sc_chN` 이므로 FE 는 `art_key` 로 일러스트를 찾는다(`bannerArt(key, artKey)` 이미 지원).

## 4. 마이그레이션 (개발 DB 에만 적용됨)

| 파일 | 내용 | 운영 |
|---|---|---|
| `2026_11_08_000100_add_required_pity_to_gacha.php` | `gacha_user_states.required_pity_counters`(json null), `gacha_pulls.required_pity_before/after`(json null) | 승인 필요 |
| `2026_11_08_000200_add_banner_key_to_gacha_pulls.php` | `gacha_pulls.banner_key`(string64 null) | 승인 필요 |

둘 다 가산 전용·nullable 이라 EXPLAIN 불필요. 코드는 컬럼이 없으면 기능을 끈다(운영 배포 순서 무관). 최소안 근거: 별도 테이블 대신 JSON 컬럼 1개(유저x영웅 카운터 map)로 DDL 을 최소화.

## 5. 확률 공시 문구 제안

> 다음에 진행할 스테이지의 필수 영웅을 아직 얻지 못했다면, 시나리오 소환에서 그 영웅은 같은 등급 안에서 뽑힐 확률이 5배로 높아집니다. 또한 그 영웅이 나올 수 있는 소환을 30회(첫 번째 시나리오 배너 sc_ch1 은 8회) 하고도 얻지 못했다면 다음 소환에서 그 영웅이 확정으로 나옵니다. 영웅을 얻으면 횟수는 처음부터 다시 셉니다. 역사의 서고 소환에는 이 보정이 적용되지 않습니다. (등급별 확률은 변하지 않습니다.)

실제 수치는 서버가 배너별로 내려준다: sc_ch1 은 8회, 그 외 30회(부스트는 모두 x5). 적용 근거: 임밸런 몬테카를로에서 천장 30·부스트 5는 ch1 s4 진입 시 50%·s6까지 94% 막힘, 천장 8·부스트 5는 0%. 설정은 `banner_overrides['sc_ch1'] = ['required_pity'=>8,'required_boost'=>5]`.

FE 는 `required_pity.threshold/boost_multiplier` 와 배너별 `targets[].effective_rate_pct/progress`, `rates` 로 표기한다.

## 6. 시뮬레이션 (몬테카를로 2,000계정, 단일 뽑기)

`scratchpad/sim_required_pity.php` (같은 규칙 재현). 신규 유저는 starter_gold 500(= 단일 5회) + 튜토리얼 100, 스타터 영웅 이순신·곽재우 보유, 단일 100골드/10연 900골드.
ch1 필수 = s1 이순신, s2 곽재우, s3 이순신, s4 김시민, s5 휴정·유정, s6 권율, s7 이순신.

뽑기 수(단일 기준, 평균 / 95% / 최악). 모두 boost x20 으로 측정했다(기본값을 x5 로 낮춘 뒤 재측정은 하지 않았다: K=30 만(x1) 줄이 부스트 하한 참고치).

| 풀 | 시작 | 천장 없음(기존) | K=30 + x20 | K=30만(x1) |
|---|---|---|---|---|
| 전체 503명 | 스타터 보유(4명 남음) | 1439 / 2968 / 5976 | 69.6 / 93 / 94 | 90 / 94 / 94 |
| 전체 503명 | 6명 전원 | 2233 / 4952 / 12042 | 113 / 150 / 156 | 145 / 156 / 156 |
| 임진 시나리오 20명 | 스타터 보유 | 55.7 / 117 / 254 | 16.5 / 30 / 50 | 40.3 / 63 / 93 |
| 임진 시나리오 20명 | 6명 전원 | 114 / 295 / 638 | 33.3 / 49 / 73 | 51.7 / 79 / 115 |

해석: 신규 유저는 이순신·곽재우를 이미 보유(코드 확인: starter_heroes)하므로 ch1 은 4명(김시민·휴정·유정·권율)만 필요. 시작 재화는 500+튜토리얼 100 = 단일 6회뿐이라 전체 풀 천장만으로는 최악 94회(9,400골드)가 필요해 초반 재화로는 부족하고, 임진 시나리오 배너(20명)에서는 평균 16.5회/95% 30회(약 1,650/3,000골드)로 ch1 스테이지 보상·퀘스트 골드로 감당 가능한 수준이다. 전체 풀(서고)은 천장 OFF 가 기본이므로 시나리오 배너 사용이 전제.

### 6-2. 재측정 (부스트 x5 기본, 2,000계정, 풀 514, `scratchpad/sim_required_pity_v2.php`)

임진 시나리오 배너는 초안 반영으로 20 -> 43명(적군 포함)이 됐다. 단일 뽑기 기준 ch1 필수(스타터 보유 시 4명 / 무보유 6명) 뽑기 수, 평균 / p95 / 최대:

| 풀 | 시작 | 천장 없음 | K30 x20 | K30 x5(기본) | K30 x1 |
|---|---|---|---|---|---|
| 전체 514 | 스타터 보유 | 1478 / 3200 / 7071 | 68.9 / 93 / 94 | 84.9 / 94 / 94 | 89.9 / 94 / 94 |
| 전체 514 | 무보유 6명 | 2289 / 4890 / 9898 | 114.6 / 154 / 156 | 136.4 / 156 / 156 | 145.3 / 156 / 156 |
| sc_ch1 43 | 스타터 보유 | 159 / 335 / 787 | 24.9 / 44 / 79 | **44.8 / 72 / 94** | 65.1 / 94 / 94 |
| sc_ch1 43 | 무보유 6명 | 200 / 390 / 963 | 46.3 / 71 / 102 | **67.6 / 102 / 141** | 88.6 / 124 / 156 |

해석: 풀이 43명으로 커져 x5 에서 ch1 평균이 약 45회(4,500골드)다. 시작 재화(500+튜토리얼 100 = 6회)로는 스테이지 보상 골드가 필요하다. 풀이 작은 챕터는 x5 로도 충분히 빠르다. 배너별 차등이 필요하면 `banner_overrides` 로 `sc_ch1` 만 낮춘다(2026-11-09 적용: 천장 8·부스트 5).

## 7. 테스트

`tests/Feature/GachaRequiredPityTest.php` (부스트, 천장 확정, 멱등/배너 409·422, 필수 없음=기존 동작, 시나리오 배너 풀 한정 + 서고 OFF, 적군 side 필터 + blocking_banners), `tests/Feature/ScenarioBannerTest.php` (생성기 dry-run 20배너 + pending 건너뜀 + 결정성, 감사 실패 케이스), `tests/Feature/GachaTest.php` 배너 단언 수정. 테스트 DB 는 `game:seed` 만 시드해 NPC 가 없으므로 실제 배너 파일은 거기서 비활성이 정상이다(실제 검증은 개발 DB 에서 감사 명령).

## 8. 롤백

- 기능만 끄기: `GAME_GACHA_REQUIRED_PITY=0`(부스트·천장 중지), 배너는 `gacha_banners.json.bak-*` 로 복원하거나 `pool_codes` 배너 제거.
- 2차 승격 되돌리기: 로스터 11행의 `"playable": true` 제거 + `gacha_pool.json` ready_codes 의 11개(+ch26 5개) 제거, `npc_cart_*` 를 `npc_cart*` 로 복원, 개발 DB 에서 해당 code 의 campaign_only=1 복귀.
- 승격 되돌리기: `php artisan game:npc-promote --revert` 후 roster 의 추가한 `"playable": true` 제거(보유 user_heroes 행은 유지).
- 컬럼: `php artisan migrate:rollback --step=2`(개발 DB). 백업: `docker/db-backup-20261108/required-pity/`(수정 전 파일), 개발 DB 스냅샷 `/var/www/dbdata/database.pre_requiredpity_1108.sqlite`.

## 후속 수정 (2026-11-09, 정검수 리뷰 반영)
- `required_pity=0`(enabled=false) 배너 뽑기는 `gacha_user_states.required_pity_counters`를 쓰지 않는다(다른 배너 카운터 보존). 회귀 테스트: `GachaRequiredPityTest::test_required_pity_0_배너_뽑기가_다른_배너의_카운터를_지우지_않는다`.
- `pullTx`: 상태 행 `insertOrIgnore` 후 `lockForUpdate`로 같은 유저의 동시 뽑기를 직렬화(SQLite는 DB 쓰기 잠금이라 무시).
- `GET /api/gacha`: 요청 범위 메모(`GachaService::memo`, info/banners 실행 동안만 켜짐)로 시나리오 배너 검증, 유저 카운터, 스테이지-필수영웅 맵을 한 번만 계산. 응답 불변.
- `game:gen-scenario-banners` 파일 쓰기는 임시 파일 + rename. `ScenarioBannerBuilder::minCounts`: 코드 기본 < 레지스트리 `defaults.min_counts` < 배너 `min_counts`(부분 지정 병합), 생성기와 감사가 같은 기준.
- `game:audit-stages`: 슬롯 스테이지의 `forced_heroes`가 `deploy_slots.fixed_slots`에 없으면 `ERROR forced_not_in_fixed_slot`. 현재 데이터 위반 0건.
