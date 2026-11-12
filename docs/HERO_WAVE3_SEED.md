# 3차 영웅 확장 적재 (`game:seed-hero-wave3`)

개발 DB 전용(운영 환경 거부), 멱등, 기본 dry-run(롤백). 후보 60명(핵심 55 + 예비 5; NPC 승격 25 + 신규 35)을 풀에 편입한다.

## 입력
| 파일 | 작성 | 용도 |
|---|---|---|
| `database/data/proposals/hero_expansion_wave3_candidates.json` | 송서사 | 후보(source=promote/new, tier=core/reserve, culture, 인연) |
| `database/data/proposals/hero_wave3_stats.json` | 임밸런(미작성) | 능력치·스킬. 스키마: `hero_wave3_stats.schema.json` |
| `database/data/proposals/hero_gap_fill_v1.json` | 송서사 | NPC 3명 설명, 인연 보강 |

경로는 `config('game.hero_wave3.{candidates,stats,gap_fill}')` 로 오버라이드(테스트용).

## 사용법 (Docker one-off)
```
bash scripts/backup/backup-local.sh                                   # (선택) 수동 스냅샷. --apply 는 자동 백업도 한다
php artisan game:seed-hero-wave3                                      # dry-run: 중복 검증 + 변경 요약 + 초상/스프라이트 누락 목록
php artisan game:seed-hero-wave3 --apply                              # 적용(docker/db-backup/wave3-*.sqlite 자동 백업, --no-backup 으로 생략)
php artisan game:seed-hero-wave3 --apply --with-reserve               # 예비 5명 포함
php artisan game:seed-hero-wave3 --apply --retire-twins               # npc_william_i / npc_charles_martel 풀 제외
php artisan game:seed-hero-wave3 --write-history                      # 역사 part·인연 오버레이 재생성(DB 무관)
```
## 동작
- 승격: `campaign_only=0`(이미 0 이면 통과), culture 후보값 반영. stats 항목이 있으면 병종·등급·능력치·스킬 연결 갱신. 가챠 풀은 `include_campaign_npc` 가 자동 편입.
- 신규: heroes 행 생성(note `3차 확장 …`, hp_bonus 10 고정, 스킬 연결). stats 항목이 없으면 건너뛰고 목록 출력. 풀은 `gacha_pool.json include_hero_wave3`(v6).
- 검증 실패(신규 코드가 외부 행과 중복, 승격 행 없음, hp_bonus≠10, 스킬/오라/병종 없음, 문화권 오류)는 전체 롤백 + 실패 종료. `mage` 처럼 부대 병종 허용 밖인 영웅은 stats.troop_type 필수.
- 역사/인연: `hero_history_part_wave3.json`(얇은 설명 + NPC 3명 전체 설명), `hero_history_relations_wave3.json`(양방향 인연 오버레이; `GameData::historyItems` 가 기존 relations 뒤에 덧붙임, 상대 역사 항목이 없으면 화면에서 제외). 예비·다음 풀 코드는 인연 상대에서 제외.
- 초상·스프라이트: manifest 에 없으면 FE 폴백(실루엣/병종 공용 시트). 누락 목록은 명령 출력.

## game:seed 재실행 안전성
- `game:seed` 는 heroes.json 코드만 upsert/보충하므로 wave3 행·`campaign_only` 에 영향 없음.
- `game:seed-imjin10 --force`/기본 보정이 로스터 비-playable 승격 NPC 를 `campaign_only=1` 로 되돌리지 않도록 `HeroWave3::promoteCodes()` 보호 추가. seed-shelf/seed-main 은 `where campaign_only=1` 행만 갱신하므로 안전.
- `game:npc-promote --revert` 는 로스터 playable 행만 되돌린다(wave3 비-playable 승격 NPC 는 영향 없음).

## 중복 인물 정리안
`npc_william_i` / `npc_charles_martel` 은 정사 `william_i` / `charles_martel` 과 같은 인물이며 현재 둘 다 campaign_only=0(풀에 동시 존재). 스토리(ch23·24 스테이지)는 npc_ 코드를 계속 쓰므로 삭제하지 않고 `--retire-twins` 로 풀에서만 제외(보유 계정 0건 확인). 주의: 두 npc 가 NPC 로스터에서 `playable:true` 이면 `game:npc-promote` 가 다시 해제하므로 로스터 playable 표기 정리가 함께 필요.

## 후속 반영 (stats 연동·쌍둥이)
- `hero_wave3_stats.json`(임밸런) 형식 지원: 스킬 목록 = `skills` 또는 `passives`+`actives`(순서), 대표 `skills.skill_id` = `passive_skill`(첫 패시브). `region` 은 문화권 표기라 무시한다.
- stats 가 쓰는 신규 스킬(`new_skills` 21종 w3_*)이 skills 테이블에 없으면 dry-run 은 경고(시드 대기)만, `--apply` 는 거부한다(이름 name_ko 확정·스킬 시드 후 재실행. 불완전 적용은 `--allow-pending-skills`).
- mage 영웅의 부대 병종은 stats.troop_type 으로 지정(선례: 서빙 DB 마법사 영웅 부대 병종 archer 3·spear 5·sword 5·cavalry 3·gunner 1·mage 3. stats 는 archer 4 + spear 1).
- 쌍둥이: 로스터 `npc_roster_shelf_ch23_24.json`, `..._core_additions.json` 의 npc_william_i / npc_charles_martel 을 `playable:false` 로 변경(재시드·npc-promote 가 풀에 되돌리지 않음). DB 반영은 `--retire-twins`.

## 스킬 이름·flavor (2026-11-06)
- `hero_wave3_skill_names.json`(송서사, version 2; 경로는 `config('game.hero_wave3.skill_names')` 로 오버라이드) 의 `name_ko` -> `skills.name`, `flavor` -> `skills.flavor`(flavor 가 있으면 `needs_verify=0` 로 화면 노출, 없으면 1 로 숨김), `desc_ko` -> `skills.description`(수치 포함 참고용, 화면 미노출). 효과·쿨다운·횟수 줄은 UI 가 params 에서 자동 생성. 기존 skills 행은 건드리지 않는다(신규 insert 만).

## 서빙 DB 적용 기록 (개발 DB, 2026-11-06)
- 스냅샷: `docker/db-backup/database.pre_wave3_1106.sqlite` (VACUUM INTO, integrity ok, heroes 589) + 명령 자동 백업 `docker/db-backup/wave3-20261106-125901.sqlite`. 롤백: 해당 스냅샷을 docker volume `/var/www/dbdata/database.sqlite` 로 복원.
- 실행: `php artisan game:seed-hero-wave3 --apply --retire-twins --c-boost=B` (복사본 dry-run 오류 0 확인 후).
  결과: skills_new 21, 승격 22, 신규 33, 연결 172, 쌍둥이 퇴역 2, 스킬 규칙 감사 위반 0. heroes 589 -> 622.
- `--with-reserve` 불필요: stats 가 있으면 stats 항목이 있는 후보만 대상이며 격상된 예비 후보는 이미 포함된다. `--write-history` 는 DB 와 무관한 파일 생성이며 재생성 결과가 기존 `hero_history_part_wave3.json`/`hero_history_relations_wave3.json` 과 동일(변경 없음)이라 추가 반영 없음. 역사/인연 파일은 GameData 가 읽는다.
- 초상 누락 33명(신규 전원)·스프라이트 누락 51명은 FE 폴백.

## 해전 NPC 승격 영향 조사 (와키자카 ch1_s3 / 구루시마 ch1_s9 / 황개 ch12_s3)
- 승격으로 heroes.unit_type naval -> sword. troop_type: 와키자카 naval 유지, 구루시마 naval -> sword, 황개 naval -> archer.
- ch1_s3·ch1_s9: 와키자카·구루시마는 `rules.enemy_commander` 표시용 라벨이고 실제 적 편성은 스테이지 `enemy_squad`(v3)에 병종이 박혀 있다(commander unit_type/troop_type = naval). 영웅 행을 참조하지 않으므로 전투 영향 없음.
- ch12_s3: 황개는 cue spawn(`hero: npc_huang_gai`, side a, 칸 [35,18] = 바다 'o')이며 Cues 는 `heroes.unit_type` 을 쓴다. 변경 후 sword 로 소환되어 해상(boarding) 칸에 선다. foot 은 바다 통행 가능(비용 2, 방어 -10%, 탑승 공격 x0.9)이라 오류·막힘은 없으나 같은 cue 의 naval 선단 3척과 달리 수병 보너스를 잃는다(경미한 밸런스/연출 차이). 제외안: 황개만 승격 stats 에서 unit_type 을 naval 로 유지(병종 변경 제외) 또는 cue 에 `unit_type` 지정. 사용자 결정 대기.

### 해전 조사 후속 조치 (팀장 결정, 2026-11-06)
- 황개(`npc_huang_gai`)는 승격에서 병종 변경 제외: `hero_wave3_stats.json` 항목을 unit_type=naval, troop_type=naval 로 되돌리고 서빙 DB 도 최소 UPDATE 로 복원(재적용 아님). 변경 전 `unit_type sword / troop_type archer` -> 후 `naval / naval`(= 승격 전 원래 값). 이유: ch12_s3 cue 소환이 `heroes.unit_type` 을 쓰고, 동반 일반병(game.companions 기본 on)은 `heroes.troop_type` 으로 생성되므로 troop_type 도 archer 이면 선단에 바다 위 궁병 동반병이 붙는다.
- 같은 승격에서 병종이 바뀐 다른 NPC 영향(아군 NPC 만 해당, 적 편성은 스테이지 `enemy_squad` 에 병종이 박혀 영향 없음):
  - ch23_s4 해럴드: `enemy_commander` 표시 라벨 + 적 편성 npc_ref 라벨뿐 -> 영향 없음.
  - ch18_s3 무칼리(ally_npcs, unit_type 미지정): 영웅 유닛 병종은 sword 그대로, 동반 일반병(기본 3)이 troop_type 변경(sword -> cavalry)으로 기병이 된다 -> 영향 있음.
  - ch12_s1 노숙(ally_npcs, unit_type 미지정): `ArmyBuilder::addAllyNpcs` 가 heroes.unit_type 을 쓰므로 sword -> mage 로 바뀌고 동반병은 archer -> 영향 있음.
- 노숙(`npc_lu_su`, ch12_s1 호송 대상): 난이도 보존을 위해 unit_type/troop_type 만 원래 값으로 복원(stats.json 포함, 서빙 DB 최소 UPDATE + 캐시 flush). 변경 전(승격 적용 직후) `mage / archer` -> 후 `sword / sword`(= 승격 전 값). atk/def 는 승격 값 유지: 승격 전 atk 2 / def 2 -> 현재 atk 3 / def 1(rarity C·cost 2·hp_bonus 10 불변).
- 무칼리(`npc_muqali`, ch18_s3 아군 NPC): 동반 일반병이 기병(troop_type cavalry)이 되는 것이 역사적으로 맞아 유지. 임밸런 재측정 대상(ch18_s3)으로만 기록.
