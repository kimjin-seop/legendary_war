# 영웅 스킬 1차(P1) 적용 절차 (임밸런, 2026-11-08)

데이터: `database/data/hero_skills_p1_20261108.json` (hero_skill_redistribution.json v3와 같은 스키마의 병합용 조각).
수치는 전부 시작값(미측정). 엔진/PHP/DB는 건드리지 않았다. `hero_skill_redistribution.json`, `stages*.json`은 수정하지 않았다(원본은 `docker/db-backup-20261108/hero-skills/hero_skill_redistribution.json.orig`에 복사해 둠).

## 1. 범위 (영웅 25행, 신규 스킬 50개 = 패시브 24 + 액티브 26)

| 구분 | 영웅 | 구성 |
|---|---|---|
| A 신규 6 | npc_jebe, npc_baidar, npc_kadan, npc_batu, npc_babur, npc_rana_sanga | 각 2P+2A |
| B 신규 6 | npc_boorchu, npc_qasar, npc_jelme, npc_jochi, npc_humayun, npc_ibrahim_lodi | 각 2P+1A |
| C 3 (기본 액티브 대체) | diponegoro, jan_zizka, rostam | 기존 패시브 유지 + 고유 액티브 1 |
| 주인공 10행 | protagonist_{male,female}_{sword,spear,archer,cavalry,heavy} | 기존 패시브 2 유지 + 공유 액티브 1(5종) |

기존 템플릿만 사용(패시브: ATK_UP/DEF_UP/ATKDEF_HYBRID/CHARGE/FIRST_STRIKE/COUNTER_ATK/LAST_STAND/FORMATION/REGEN/SIEGE_ATK, 액티브: STRIKE/AOE/BUFF/SURGE). PIERCE/STANCE/지형 특화/MATCHUP_NEGATE는 S 전용 정책이라 쓰지 않았다. HEAL은 쓰지 않았다(대상에 힐러 병종 없음).

## 2. 스킬 표

패시브 (tier는 skill_templates.json의 tiers 값 그대로)

| 영웅 | code | 이름 | 템플릿/tier | 효과 |
|---|---|---|---|---|
| 제베 A | p1_jebe_p1 | 질주하는 화살 | CHARGE strong | 이동 후 공격 +15% |
| | p1_jebe_p2 | 첫 화살 | FIRST_STRIKE strong | 만피 적 +15% |
| 바이다르 A | p1_baidar_p1 | 서진의 선봉 | ATK_UP strong | 공격 +9% |
| | p1_baidar_p2 | 철기의 쇄도 | CHARGE mid | 이동 후 +11% |
| 카단 A | p1_kadan_p1 | 끈질긴 추격대 | HYBRID strong | 공 +6% 방 +12% |
| | p1_kadan_p2 | 추격자의 활 | ATK_UP mid | 공격 +6% |
| 바투 A | p1_batu_p1 | 총사령의 군진 | FORMATION strong | 인접 아군당 공+3 방+8 (최대 3) |
| | p1_batu_p2 | 서방 대원정 | CHARGE mid | 이동 후 +11% |
| 바부르 A | p1_babur_p1 | 화약의 위력 | SIEGE_ATK strong | 성 위 적 +20% |
| | p1_babur_p2 | 잃고도 일어서는 뜻 | LAST_STAND strong | HP 50% 이하 공+15 방+20 |
| 라나 상가 A | p1_rana_sanga_p1 | 상처가 가르친 반격 | COUNTER_ATK strong | 반격 +15% |
| | p1_rana_sanga_p2 | 라지푸트의 돌격 | CHARGE strong | 이동 후 +15% |
| 보르추 B | p1_boorchu_p1 / p2 | 변치 않는 벗 / 곁을 지키는 진형 | DEF_UP mid / FORMATION mid | 방 +20% / 인접 공+2 방+5 |
| 카사르 B | p1_qasar_p1 / p2 | 장사의 힘 / 강궁의 기선 | ATK_UP mid / FIRST_STRIKE mid | 공 +6% / 만피 적 +14% |
| 젤메 B | p1_jelme_p1 / p2 | 충직한 간호 / 충신의 각오 | REGEN mid / DEF_UP weak | 턴 종료 회복 7% / 방 +10% |
| 주치 B | p1_jochi_p1 / p2 | 장자의 기개 / 서방 개척 | ATK_UP mid / CHARGE mid | 공 +6% / 이동 후 +11% |
| 후마윤 B | p1_humayun_p1 / p2 | 유랑 끝의 귀환 / 재기의 의지 | LAST_STAND mid / HYBRID mid | HP 50% 이하 공+12 방+10 / 공+4 방+8 |
| 이브라힘 로디 B | p1_ibrahim_lodi_p1 / p2 | 술탄의 대군 / 굳게 버티는 반격 | DEF_UP mid / COUNTER_ATK mid | 방 +20% / 반격 +13% |

액티브 (cd/uses는 호환 값, 전투는 MP 방식)

| 영웅 | code | 이름 | 템플릿 | params 핵심 |
|---|---|---|---|---|
| 제베 A | p1_jebe_a1 | 장수 저격 | STRIKE | power 130 |
| | p1_jebe_a2 | 쾌속 우회 | SURGE | move+2, atk 105 |
| 바이다르 A | p1_baidar_a1 | 서방 진격 | SURGE | move+2, atk 110 |
| | p1_baidar_a2 | 철기 일격 | STRIKE | 125 |
| 카단 A | p1_kadan_a1 | 화살 장막 | AOE | 100 / 스플래시 60 |
| | p1_kadan_a2 | 추격 호령 | BUFF | atk +11, 1턴, 반경2 |
| 바투 A | p1_batu_a1 | 총사령의 호령 | BUFF | atk +11 |
| | p1_batu_a2 | 서진의 철기 | SURGE | move+2, atk 110 |
| 바부르 A | p1_babur_a1 | 화포와 총의 일제 사격 | AOE | 100 / 60 |
| | p1_babur_a2 | 수레 방어진 | BUFF | def +20 |
| 라나 상가 A | p1_rana_sanga_a1 | 카누아의 일격 | STRIKE | 130 |
| | p1_rana_sanga_a2 | 라지푸트 연합의 결의 | BUFF | atk +11 |
| 보르추 B | p1_boorchu_a1 | 곁을 지키는 방패 | BUFF | def +20 |
| 카사르 B | p1_qasar_a1 | 강궁 일격 | STRIKE | 125 |
| 젤메 B | p1_jelme_a1 | 충신의 질주 | SURGE | move+2, atk 105 |
| 주치 B | p1_jochi_a1 | 도성 돌파 | STRIKE | 125 |
| 후마윤 B | p1_humayun_a1 | 재기의 호령 | BUFF | atk +10 |
| 이브라힘 로디 B | p1_ibrahim_lodi_a1 | 코끼리 부대 돌진 | STRIKE | 125 |
| 디포네고로 C | p1_diponegoro_a1 | 밀림의 기습 | SURGE | move+1, atk 100 (기병 C 기본값과 동일) |
| 얀 지슈카 C | p1_jan_zizka_a1 | 마차 요새 | BUFF | def +15 |
| 로스탐 C | p1_rostam_a1 | 칠난을 넘은 일격 | STRIKE | 120 |
| 주인공 검/(중무장 제외) | p1_pr_sword_a1 | 결단의 일격 | STRIKE | 120 |
| 주인공 창 | p1_pr_spear_a1 | 굳건한 창진 | BUFF | def +15 |
| 주인공 궁 | p1_pr_archer_a1 | 먼 곳의 일제 사격 | AOE | 95 / 55 |
| 주인공 기병 | p1_pr_cavalry_a1 | 역사를 가르는 돌격 | SURGE | move+2, atk 105 |
| 주인공 중무장 | p1_pr_heavy_a1 | 버티는 자의 방벽 | BUFF | def +20 |

주인공 액티브는 남녀 공유 코드(영웅 1명 전용이 아님). 기존 병종 기본 액티브와 수치 수준을 같게 두었으므로 전투력 변화는 이름/연출 외에는 작다(기본값 대비 STRIKE 115->120, 궁 AOE 100/60->95/55, 중무장 방어 버프 신설 등 +-5% 이내).

설계 의도(상성 뚜렷): 평준화 대신 역할 분화. 초원 궁/기병은 CHARGE·FIRST_STRIKE·SURGE 중심(이동 후 한 방), 보르추·이브라힘 로디는 DEF_UP·FORMATION·COUNTER 중심(버티기), 바부르는 AOE+수레 방어진+성 공격으로 포병형.

## 3. 적용 절차 (박백엔, 개발 DB만, 멱등)

1. 스냅샷: `scripts/backup/backup-local.sh`.
2. 병합(데이터만, 원본은 .orig 보관). `game:seed-skill-grades`는 `hero_skill_redistribution.json` 하나만 읽으므로 조각을 병합해야 한다. 3명(디포네고로/얀 지슈카/로스탐)은 기존 항목(`default_only`)을 이 조각의 항목으로 덮어쓴다. 주인공 10행은 원본에 없던 항목이다. 예시 스크립트(저장소 루트에서):

   ```
   node -e "
   const fs=require('fs');const f='database/data/hero_skill_redistribution.json';
   const r=JSON.parse(fs.readFileSync(f,'utf8')),p=JSON.parse(fs.readFileSync('database/data/hero_skills_p1_20261108.json','utf8'));
   for(const c of Object.keys(p.new_skills)) if(r.new_skills[c]) throw new Error('code 충돌 '+c);
   Object.assign(r.new_skills,p.new_skills); Object.assign(r.heroes,p.heroes);
   r.stats.heroes=Object.keys(r.heroes).length; r.stats.new_skills=Object.keys(r.new_skills).length;
   fs.writeFileSync(f,JSON.stringify(r,null,2)+'\n');"
   ```
   (원본 들여쓰기 형식이 다르면 diff가 커질 수 있다. 확인 후 필요하면 형식 맞춤.) 이 스크립트는 실행해 보지 않았다.
3. `php artisan game:seed-skill-grades --dry-run` -> 오류 0 확인 -> `php artisan game:seed-skill-grades`.
4. `php artisan game:audit-skills` (위반 0 기대).
5. 주인공 스킬이 전투에서 쓰이는지, 아군 NPC로 npc_* 12명이 쓰이는 스테이지에서 스킬이 나가는지 1~2판 확인.
6. 중요: `game:seed`가 스킬 연결을 되돌리지 않도록, 반드시 병합본을 `hero_skill_redistribution.json`에 넣고 seed-skill-grades로 `app_settings.skill_grades` 표식에 이 영웅들이 들어가게 해야 한다(별도 파일로만 두면 보호되지 않음).
7. 이펙트 맵 재생성은 선택(아래 4). 미등록이어도 계열 기본값으로 표시된다.

## 4. 이펙트 매핑 요청 (안아트/윤프론)

미등록 코드는 `skillFxResolve.js`가 `fx.skill.<계열>.<variant>` -> 계열 기본값(strike.base, aoe.base, surge.base, buff.atk/def, heal)으로 폴백하므로 매핑이 없어도 동작한다. 연출을 맞추고 싶으면 `SKILL_FX_BY_CODE`에 아래를 추가(시트는 기존 variant 재사용, 신규 시트 불필요). 신규 코드 26개(액티브):

| 코드 | 제안 variant |
|---|---|
| p1_jebe_a1, p1_qasar_a1 | strike.charge (저격/강궁) |
| p1_jebe_a2, p1_baidar_a1, p1_batu_a2, p1_jelme_a1, p1_diponegoro_a1, p1_pr_cavalry_a1 | surge.base |
| p1_baidar_a2, p1_rana_sanga_a1, p1_jochi_a1, p1_ibrahim_lodi_a1, p1_rostam_a1, p1_pr_sword_a1 | strike.base (이브라힘 로디는 strike.charge도 가능) |
| p1_kadan_a1, p1_pr_archer_a1 | aoe.shot |
| p1_babur_a1 | aoe.shot |
| p1_kadan_a2, p1_batu_a1, p1_rana_sanga_a2, p1_humayun_a1 | buff.rally |
| p1_babur_a2, p1_boorchu_a1, p1_jan_zizka_a1, p1_pr_spear_a1, p1_pr_heavy_a1 | buff.def |

(액티브 스킬 코드 합계 26: 위 표의 항목 수와 일치.) 패시브는 연출 없음.
참고: 기존 `w3_*` 18개 미매핑 건은 이번 범위와 별개.

## 5. 위험·사람이 확인할 것

- 모든 수치는 시작값, 시뮬 미실행. 특히 A 초원 3인(제베 CHARGE+FIRST_STRIKE strong, 바이다르/바투 SURGE 110)은 이동 후 공격 편중이라 기병 상성 의존이 큼. 적용 후 대표 시뮬(계열별 300전 이상, 교대 선후공) 필요.
- 이 영웅들은 현재 hero_skill_redistribution 밖(또는 default_only)이라 감사 경고(등급 초과 슬롯 등)가 바뀔 수 있다.
- 스테이지의 적 지휘관은 hero 행이 없어 스킬을 쓰지 않으므로, 이 변경은 아군/수집 영웅만 강화한다(난이도 40~60% 밴드가 위로 이동할 수 있음). 아군 NPC로 등장하는 스테이지의 승률 재측정 권장. stages*.json은 수정하지 않았다.
- 주인공 공유 액티브는 기본 액티브를 대체하므로 모든 신규 유저에 영향. 수치를 기본값 수준으로 둔 이유다.
- 이름/설명은 역사 인물 서사에 맞춘 창작 표현이며 사건 단정은 피했다. 송서사 검수 권장(바부르 "화포와 총", 라나 상가 "카누아", 이브라힘 "코끼리 부대", 젤메 "간호", 제베 "저격"은 널리 알려진 특징에 기댄 표현). 화면 문구에는 근거 수준 표기를 넣지 않았다.
- 검증은 정적 수준: `ActiveParams::violations`(엔진 스키마), Engine::ACTIVE_TEMPLATES/PassiveEffects::SUPPORTED_TEMPLATES, when 지원, code/이름 중복 없음, heroes 테이블 등급·병종 일치, 등급별 슬롯 수 일치 (모두 오류 0). seed 커맨드 dry-run과 시뮬은 실행하지 않았다.
