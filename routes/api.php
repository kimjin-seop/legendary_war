<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\EquipmentController;
use App\Http\Controllers\GachaController;
use App\Http\Controllers\GameController;
use App\Http\Controllers\RoomController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API (prefix /api) -- API 문서는 이 주석이 원본이다.
|--------------------------------------------------------------------------
| 오류 형식: {"error":{"code":"<사유코드>","message":"..."}} (검증 실패는 Laravel 기본 422 errors)
| 인증: 회원 = Sanctum SPA 쿠키(먼저 GET /sanctum/csrf-cookie), 게스트 = 헤더 X-Guest-Token.
|
| [인증]
|  POST /api/guests            {nickname}                      -> {user, guest_token}  (토큰은 1회만 노출)
|  GET  /api/auth/check-name?name=  {available, reason: length|invalid_chars|digits_only|forbidden|taken|null} (로그인 불필요, IP당 분당 30회)
|  POST /api/auth/register     {name(캐릭터명 2~12자 한글/영문/숫자, 대소문자 무시 유니크), email, password(+confirmation), terms_accepted:true}
|                              (X-Guest-Token 있으면 게스트 승격). 오류코드: name_length|name_invalid_chars|name_digits_only|name_forbidden|name_taken|email_taken|password_same_as_identity
|  게스트 표시명 = 닉네임#4자리(서버 부여, 유니크 제외)
|  POST /api/auth/login        {email,password}                (정지 계정 403 account_banned)
|  POST /api/auth/logout | GET /api/auth/me
|  (이메일 인증 / 비밀번호 재설정: 미구현 - 메일 인프라 없음)
|
| [플레이어] (회원/게스트 공통)
|  GET  /api/rules                         (공개, 로그인 불필요, Cache-Control max-age=60, 분당 60회) FE rules.js 하드코딩 대체용 읽기 전용:
|                                          {terrains:[{code,name,symbol,modifiers{move_type:{cost(null=통행불가),def_pct}}}],
|                                           unit_types:[{code,name,move,range_min,range_max,hp,atk,def,move_type,heal}], matchups{공격병종:{방어병종:배율}},
|                                           sweep{enabled,max_count,daily_cap}(소탕 규칙, 최상위 키),
|                                           rules{second_atk_pct,dmg_mult(피해 배율, 현재 1.2),snowball(null=off | {basis,dead,slope,cap,hero_factor}),facing,facing_mult,facing_cap,...}}
|  GET  /api/profile                       {profile: 레벨, exp, max_cost, gold, ...,
|                                           rules: {second_atk_pct(후공 공격 보정 %), dmg_mult, snowball(null=off), facing(방향 시스템 on/off), facing_mult{side,back}, facing_cap}}
|                                          rules는 안내용 읽기 전용(config 기준)
|  (공통 응답 확장) 전투 view와 deployment 응답: map_code, biome(maps.biome, 값 없으면 null); deployment 응답: stage_name, recommended_level;
|     heroes/candidates[].detail{culture, unit_type, aura{code,name,radius,atk_pct,def_pct}|null, stats{hp,atk,def(레벨1 병종 기본+보너스), *_bonus, growth_*_pct}};
|     /api/rules: auras[{code,name,radius,atk_pct,def_pct}] 추가, 전투 유닛 aura에 code·name 포함
|  (공통 응답 확장: 영웅 호칭) GET /api/heroes, deployment/방 deployment의 candidates[], 전투 view의 units[]·deployment enemy_units[]에
|     title(string|null 칭호), short_name(string|null), display_name(string) 추가. display_name = title 있으면 `${title} ${short_name ?? name_ko}`, 없으면 name_ko.
|     units[]는 영웅 유닛만 title/short_name 값이 있고 부대(troop) 유닛은 title/short_name=null, display_name=name. 기존 name 필드는 그대로(하위 호환).
|     데이터 원본 database/data/hero_titles.json -> heroes.title/short_name(game:seed가 멱등 동기화). 공간 부족 시 FE는 short_name ?? name 사용(display_rule).
|  (시즌 전쟁, 수직 슬라이스. 규칙 수치 config/war.php, 시나리오 database/data/war/imjin.json, 시즌 생성 php artisan war:seed. 게스트는 config war.allow_guests=false면 join 403 guest_not_allowed)
|     GET  /api/war/active                 -> {active,season_id|null,joined} (가벼운 진입 분기용. 시즌 없음/종료여도 404 아닌 active=false)
|     GET  /api/war/state                  -> {season{id,name,status,start_at,end_at}, scenario_code, countries[{code,name,color,member_count,score,is_ai,recommended,plaque{native,native_script,native_lang}|null,territory_faction_id|null,allies[{code,name,label}](영토 없는 지원 세력=원군)}], me{joined,country,contribution,rank(미가입 null)}, attacks{limit,used,left}, rules{occupation_gain,occupation_required,cooldown_minutes}}. 시즌 없음 404 season_not_found
|     POST /api/war/join {country}         -> state와 같은 응답. 오류: 409 already_joined(재선택 거부)|country_full(정원 차 war.max_member_gap), 422 invalid_country, 403 guest_not_allowed
|     GET  /api/war/preview?scenario=imjin -> 시즌/가입 없이 시나리오 지도 미리보기: map 과 같은 territories 형식(owner=start_country, state=peace, attackable=false, attack_blocked_reason='preview') + {season_id:null, preview:true, view, countries[]}. 없는 시나리오 404 scenario_not_found
|     GET  /api/war/map                    -> {season_id, scenario_code, view, countries[{code,name,color,allies[{code,name,label}]}], territories[{code,name,kind,lon,lat,defense_level,start_country,is_capital,defense{level,level_per_defense,max_heroes,max_cost,commander(null=랜덤 편성)},owner{code,name,color},state(peace|siege),siege_country,occupation,occupation_required,neighbors[],attackable,attack_blocked_reason}]}
|     POST /api/war/territories/{code}/attack -> 201 {battle_id, territory_battle_id, territory, battle(전투 view, 이미 in_progress; 방어=영토 난이도 고정 AI 부대, 자동 배치)}.
|        이후 전투는 기존 /api/battles/{battle_id}/actions 등으로 진행하고 종료 시 서버가 점령도(승 +20, 그 외 0)·소유권 이전을 1회만 반영(/battles/{id}/result 의 result.war=true, occupation_before/after/delta, captured).
|        오류: 403 not_joined, 422 own_territory|not_adjacent, 409 siege_by_other|war_battle_open, 429 cooldown|daily_limit, 422 party_empty|cost_exceeded
|     (2단계) 주 대립 2세력(조선·일본)·11영토. 명은 국가/영토 없이 조선 소속 원군 메타(countries[].allies, 시나리오 supporters)이며 join 시 422 invalid_country. 기존 3국 시즌은 war:seed 동기화 시 명 국가·영토 정리(가입자는 조선으로 이동). 시간당 php artisan war:tick = 시즌 종료/정체 감소(48h 후 일 -10, 영토당 일 -20 상한)/AI 국가 행동
|     GET  /api/war/ranking               -> {season_id, countries[{rank,code,name,color,ai_only,score,territories,member_count}](AI 전용 국가도 표시), players[{rank,name,country,contribution,me}], my_country_members[{name,contribution,attack_wins,captures,me}], me{contribution,rank}|null}. 내부 user_id 미노출(me 플래그)
|     GET  /api/war/events?after_id=&limit= -> {season_id, order(desc=after_id 없음 최신순|asc=after_id 지정 시 오래된 것부터 limit), events[{id,type(siege_start|capital_siege|capture|capital_fall|siege_end|ai_attack|season_end),country,country_name,territory,territory_name,user,payload(국가는 코드),created_at}], last_id(실제 반환한 최대 id = 다음 after_id)}
|     GET  /api/war/unread?after_id=N      -> {count,last_id,my_country,season_id} 로비 뱃지용(season_id=활성 시즌 id, 시즌 없음 null). count=after_id 이후 내 국가 관련 이벤트(capture|capital_fall|capital_siege 중 country==내국가 | payload.from==내국가 | capital_siege이고 영토 현재 소유국==내국가; FE isMyCountryAlert 와 동일, 최대 200 집계), last_id=활성 시즌 최대 이벤트 id. 시즌 없음·미가입·게스트는 {0,0,null,season_id}
|     (시즌 전투 보상) 정산 시 result.war.reward{exp,heroes[],blocked(null|daily_cap)} + result.heroes 동일. 출전 영웅 각자 exp(승 reward_win_exp, 패 reward_lose_exp, 점령 +reward_capture_bonus_exp), 일일 reward_daily_cap회, gold 0. config game.war.*. 포기 전투 무보상
|     GET  /api/war/my-battles?limit=10     -> {season_id, battles[{battle_id,territory,territory_name,status(battle),result(att_win|def_win|draw|null=진행중),win|null,occ_before,occ_after,occ_delta,captured,created_at,settled_at}]} 내 공격 이력(활성 시즌, 최신순, limit 1~50)
|     (state 추가) open_battle{battle_id,territory_id,territory_name,turn,status}|null, party_check{code|null,used,max} (map 에도 party_check). 시즌 전투 result.war 추가: my_contribution_gain, capture_bonus_gain, rank_before/rank_after{personal,country}
|     GET  /api/war/history               -> {seasons[{season_id,name,start_at,ended_at,winner{rank,code,name,ai_only,score,territories}|null(AI 전용 국가 제외, 사람 가입 가능 국가 중 최고),ranking[](AI 전용 포함),mvp{name,country,contribution,me}|null,top_contributors[],battles}]} (종료 시즌 기록, 영구 보존)
|  (가챠, config game.gacha.enabled 항상 on(개발용 고정; 코드 값을 false로 바꾸면) GET/POST 모두 404 {error.code:gacha_disabled}. 켜짐 여부는 GET /api/rules·/api/profile의 rules.gacha(bool)로 노출)
|  GET  /api/gacha                         {enabled, pool_version, rates[{rarity,rate_pct,hero_count,per_hero_rate_pct,duplicate_shards}], price{single,ten},
|                                           pity{rule:ten_pull_min_rarity,min_rarity:A,applies_to_count:10,progress(A 이상 연속 미출현 횟수, 표시용)}, gold,
|                                           heroes[{hero,name,title,short_name,display_name,rarity,unit_type,owned}]}  (원본 database/data/gacha_pool.json, 추첨과 같은 값)
|  POST /api/gacha/pull                    {count:1|10, request_id(클라 생성 8~64자 [A-Za-z0-9_-], 멱등키)} -> {replay, pull_id, pool_version, count, gold_spent, gold,
|                                           pity{before,after,guarantee_applied}, results[{hero,name,title,short_name,display_name,rarity,unit_type,user_hero_id,is_new,shards_gained,shards_total}]}
|                                          같은 request_id 재전송 = 같은 결과(replay=true, 이중 차감 없음). 오류: 404 gacha_disabled, 422 insufficient_pen(기본 통화; gold 모드는 insufficient_gold, 차감 없음)|검증 오류(count/request_id),
|                                          409 request_id_reused(같은 request_id에 다른 count)|gacha_conflict. 10연은 A 이상 1회 보장(전부 미만이면 마지막 슬롯 S/A 재추첨).
|                                          중복 영웅은 user_heroes.shards += duplicate_shards[등급]. 로그 gacha_pulls, 차감 wallet_transactions(reason=gacha_pull, ref=로그 id). 값은 모두 가정 시작값.
|  (튜토리얼, 서버 저장) GET /api/profile 의 profile.tutorial{step(도달한 대사 수, 0=미시작), done(완료 또는 건너뛰기로 종료), skipped, reward_claimed, auto_start(첫 로비 자동 시작 여부: 미시작·미종료 + config game.tutorial.auto_start_after 이후 가입자만),
|     max_step(database/data/tutorial_dialogue.json steps 개수), reward{gold,user_exp}}. GET /api/tutorial 은 같은 값만 {tutorial}.
|  PUT  /api/tutorial                      {step:int 0..max_step, skipped?:bool, done?:bool} -> {tutorial, granted:{gold,user_exp}|null}. step은 단조 증가(낮은 값은 무시=멱등),
|                                          skipped=true 건너뛰기 종료(보상 없음, config tutorial.reward_on_skip), done=true 는 step>=max_step 필요(아니면 422 tutorial_incomplete)하며 보상 1회(멱등키 wallet_transactions tutorial_reward, ref user:id).
|                                          오류: 422 tutorial_step_invalid|tutorial_invalid_flags(skipped+done 동시)|tutorial_incomplete|검증 오류, 503 tutorial_unavailable(컬럼 없음). 건너뛴 뒤 재열람으로 끝까지 완료하면 완료로 전환·보상 1회.
|  (퀘스트: 메인 6 + 일일 4 + 주간 4, 정의 config game.quests.defs 코드 값, 보상 gold+user_exp 고정) GET /api/quests -> {available, server_time, is_guest, claimable_count(빨간 점),
|     daily{reset_at(다음 05:00 KST, UTC ISO), quests[]}, weekly{reset_at(다음 월요일 05:00 KST), quests[]}, main[]}; quest={code,title,desc,target,progress,completed,claimed,claimable,claim_blocked(null|guest_not_allowed),reward{gold,user_exp}}.
|     POST /api/quests/{code}/claim (수령 버튼) -> {claimed:true,reward,quest,claimable_count}. 오류: 404 quest_not_found, 422 quest_not_completed, 409 quest_already_claimed(중복 수령 불가), 403 quest_guest_claim, 503 quest_unavailable(테이블 없음).
|     진행도 훅(멱등 quest_event_log, 실패해도 본 흐름 무영향): 스테이지 정산(stage_play/stage_win/stage_clear), PvP 정산(pvp_play 양측/pvp_win 승자, 기권·타임아웃·퇴장 종료 판 제외), 가챠(gacha_pull=뽑은 횟수), 장비 구매(equip_buy). 일일 05:00 KST·주간 월요일 05:00 KST 리셋.
|     게스트: 진행도는 누적, 수령은 main만(config game.quests.guest_claim), 일일·주간은 정식 계정 전환 후 수령(진행도 유지).
|  (액티브 스킬, config game.rules.active_skills 코드 on) POST /api/battles/{id}/actions {type:'use_skill', unit_id(내 영웅/지휘관), skill:<code>, target_id(템플릿별: strike/aoe=적(일반 공격 사거리), heal=아군(자신 포함, cast_range 이내), buff target_mode=ally=아군, buff self_area·surge=생략)}, 교대 행동은 활성 부대 유닛만.
|     템플릿(영웅당 액티브 1개, 쿨다운 cooldown=자기 턴/라운드 시작마다 -1, 전투당 횟수 uses): T_ACTIVE_STRIKE=일반 피해식 x power_pct/100(영웅 행동 소모, 반격 일반 규칙) /
|       T_ACTIVE_AOE=대상 유닛 중심(타일 지정 없음, v2) 주 대상 power_pct(반격 일반 규칙) + 반경 radius(1) 안 다른 적 splash_pct% 감쇠 피해(반격 없음, friendly_fire=false), 소모 /
|       T_ACTIVE_BUFF=stat(atk|def|move) +amount(atk/def %, move 칸) duration(시전 진영 다음 턴 시작에 만료, 교대 행동(alternate_activation) on이면 다음 라운드 시작에 만료, 같은 stat은 max 갱신), self_area=시전자 중심 radius 내 아군 전원(본인 포함)|ally=지정 아군 중심, atk/def는 영웅 행동 소모·move는 미소모(이동 전 사용), 이동력 가산은 first_turn_move_cap 초과 불가 /
|       T_ACTIVE_HEAL=지정 아군 min(결손, max(heal_flat, ceil(max_hp x heal_pct%))), radius=1이면 인접 아군 area_pct%. heal_cap(패시브 치유 진영 합 상한)과 분리, 소모 /
|       T_ACTIVE_SURGE=이번 턴 이동력 +move_bonus(영웅 행동 미소모, 이동 전에만, min_turn 이후), attack_pct>100이면 그 턴 첫 일반 공격 배율. 사용 -> 일반 move -> 일반 attack.
|     이벤트: skill_use{actor_unit_id,skill,name,template,kind(strike|aoe|buff|heal|surge|pierce|stance),target_unit_id|null,targets[],power_pct(strike/aoe),cooldown_left,uses_left + aoe:center[x,y],radius,splash_pct,friendly_fire / buff:center,radius,stat,amount,duration,target_mode / heal:heal_flat,heal_pct,radius / surge:move_bonus,attack_pct / pierce:power_pct,def_ignore_pct / stance:center,radius,stat='counter',amount,duration,target_mode}
|       뒤에 strike·aoe=attack(via_skill, splash=true는 범위 피해, 키 없음=기존 의미)/counter/kill, buff=buff_apply{actor_unit_id,target_unit_id,stat,amount,left}(만료 시 buff_expire{target_unit_id,stat}가 turn_start 직전에 발행), heal=heal{actor_unit_id,target_unit_id,hp_before,hp_after,via_skill}. 키 없음=하위 호환.
|     오류: 422 skill_disabled|skill_unsupported|skill_no_effect(만피 치유), 404 skill_not_found, 409 skill_cooldown|skill_no_uses|skill_turn_locked(surge min_turn 이전), 422 already_moved(surge는 이동 전만), invalid_target|out_of_range(상태 불변).
|     view units[].active_skills[]={code,name,type:'active',template,kind,target_kind(enemy|ally|self|none),params{서버 검증값},power_pct(strike/aoe, 그 외 0),cooldown,cooldown_left,uses,uses_left,range[min,max],usable,targets[미리보기 id: enemy=사거리 내 적, heal=부상 아군, buff ally=아군, buff self_area=효과 받을 아군, surge=빈 배열]}
|       (액티브 보유 영웅만). 유닛 state에 buffs[{stat,amount,left}](있을 때만)·skill_move_bonus·skill_attack_pct(surge 사용 턴만) 키가 추가될 수 있다. 활성: 기존 4종(naval_barrage, cannae_encirclement, cavalry_charge, horde_arrows) + 2단계 20명(database/data/active_skill_assignments.json, php artisan game:seed-active-skills), 근거 확인 필요 5명은 enabled=false(공성계 DECOY도 비활성).
|  (액티브 스킬 MP 방식, config game.rules.mp_skills 기본 false. 켜면 새 전투부터 battle.mp_mode=true(전투 생성 시 state.mp_mode/mp_knobs 고정, 진행 중 전투는 레거시 cd/uses 유지))
|     규칙: 쿨다운/횟수 폐지, 영웅 1턴 스킬 1회(surge·move 버프 포함, 위반 409 skill_turn_locked), mp_max=clamp(희귀도 C40/B45/A50/S55 + 2x(Lv-1) + mage·healer +10, 30, 100), 시작 50%, 진영 턴 시작(교대 행동=라운드 시작)에 max(5, round(mp_max x 15%)) 회복(상한 초과 버림). 진영 턴 모드는 후공의 1턴 시작 회복 1회 생략(노브 mp_skip_first_regen 기본 true). 병사 MP 없음.
|     비용: skills.params.mp_cost(5~100) 우선, 없으면 MpRules 기본식(strike 20+(power-100)/2, aoe 40+..., buff atk 22+amount x0.8/def 10+amount x0.75/move 20, heal 30(radius1 +4), surge 25(atk_pct>=110 +3)). 모두 가정 시작값.
|     오류: 409 insufficient_mp(MP 부족, 상태 불변), 409 skill_turn_locked(이번 턴 이미 스킬 사용). skill_cooldown|skill_no_uses는 MP 방식에서 나오지 않는다.
|     이벤트: mp_change{unit_id,actor_unit_id,side,delta,mp,mp_max,mp_pct,reason(turn_start|wait|skill),overflow} (스킬 사용 시 skill_use보다 먼저 발행. delta!=0일 때만, 만땅 무변화 회복은 미발행),
|     레벨 보상: GET /heroes 항목 level_info{exp_to_next(현재 레벨→다음, 최고 레벨 0),next_reward{level,label}|null,milestones[{level,label,reached}],stats_now{hp,atk,def,mp_max}(장비 제외)}, 전투 결과 heroes[].exp_to_next·rewards_unlocked[{level,label}](이번 레벨업으로 넘은 마일스톤, 없으면 []). 최대 MP = 기존 공식 + 마일스톤 mp_bonus(Lv10 +10, Lv30 +10)
|     속성(element): skill_use.element(속성 스킬만), attack.element + attack.element_pct(+30 약점/-30 내성, 없으면 키 생략), 스킬 view.element, units[].resists{fire|thunder|water_ice|poison:%}
|       skill_use에 mp_cost,mp_left,mp_pct,side 추가(cooldown_left=0, uses_left=null). 상대 진영 이벤트는 mp/mp_max/delta/overflow/mp_left 제거(mp_cost는 정적 값이라 공개), mp_pct는 5% 단위(상대 MP는 5% 단위 비율만 공개).
|     view: battle.mp_mode(bool), units[].mp,mp_max(내 영웅만 수치) + mp_pct(모든 MP 영웅), 상대 영웅은 mp/mp_max 키 없음, mp_pct는 5% 단위, 상대 active_skills[]는 usable/mp_left 제거, targets=[](usable 누설 방지), mp_cost는 정적 카탈로그라 공개. active_skills[]에 mp_cost, mp_left(내 영웅만, 레거시 null) 추가, MP 방식에서 cooldown=0,cooldown_left=0,uses=null,uses_left=null. usable=MP 충분+이번 턴 미사용+기존 조건.
|       GET /api/game/rules(규칙 안내) rules.mp_skills(bool). 방 폴링/행동 응답은 내 진영 기준으로 같은 가림 적용(스테이지·솔로는 항상 a 기준).
|  (랭킹, config game.ranking.public 코드 고정 true, false면 404 ranking_disabled) GET /api/ranking?board=level|weekly_pvp(기본 level)
|                                          -> {board, week{key,starts_at,resets_at}|null, entries[상위 50 {rank,name,level,exp,wins?(weekly만),is_me}], me{rank|null,name,level,exp,wins?,is_me}|null,
|                                          me_status: ok|unranked(주간 0승)|excluded_guest|excluded_banned}. 게스트·정지 계정 제외, user_id/이메일 미노출, 상위 목록 60초 캐시(내 순위는 실시간).
|                                          level: 레벨->exp->가입순. weekly_pvp: 이번 주(월 05:00 KST~) PvP 완주 승수->레벨->exp->마지막 승리가 빠른 순. 기권·타임아웃·퇴장 승리는 제외(game.ranking.count_forfeit_wins). 오류: 422 invalid_board.
|  GET  /api/heroes                        보유 영웅 (+equipment{slot:{id,code,name,rarity}}, equip_total{hp,atk,def}(클램프 후 실제 적용값), equip_raw(클램프 전 합계))
|  (장비·상점, config game.equipment 코드 값, off/테이블 없음이면 상점·인벤토리·장착 404 equipment_disabled; 수치·가격 원본 database/data/equipment_*.json -> game:seed -> equipment_items)
|  GET  /api/shop                          {items[{code,name,description,culture,slot,rarity,stats{hp,atk,def},req_level,price_gold,owned}], gold, inventory_count, inventory_cap}
|  POST /api/shop/buy                      {code, request_id(8~64자 [A-Za-z0-9_-], 멱등키)} -> {replay, purchase_id, item, user_equipment_id, gold_spent, gold, inventory_count, inventory_cap}
|                                          같은 request_id 재전송=같은 결과(replay=true, 이중 차감 없음). 오류: 404 item_not_found|422 insufficient_gold|422 inventory_full|409 request_id_reused(같은 id 다른 code)|검증 422.
|                                          가격은 DB 값만 신뢰. 차감 wallet_transactions(reason=shop_equip, ref=equipment_purchase 로그 id), 개체 생성·로그·차감은 한 트랜잭션.
|  GET  /api/inventory                     {items[{id(개체 id),code,name,slot,rarity,stats,req_level,acquired_at,source,equipped_by{user_hero_id,hero,display_name}|null}], inventory_count, inventory_cap}
|  PUT  /api/heroes/{user_hero_id}/equipment {equipment:{helm|armor|gloves|boots|accessory: 개체 id | null(해제)}} 주어진 슬롯만 변경(원자). -> {user_hero_id, hero, equipment, equip_total, equip_raw}
|                                          오류: 404 hero_not_found|404 equipment_not_found(없음/타 유저 개체)|422 invalid_slot|422 slot_mismatch|422 level_too_low{req_level,hero_level}|409 equipped_elsewhere{user_hero_id}
|  (장비 전투 적용) 영웅 유닛(병사 제외)에만, scale() 이후 평탄 가산, 스탯별 min(합계, floor(Lv1x cap_pct/100), cap_flat). 스테이지·방(solo/PvP) 공통, 전투 생성 시 고정(진행 중 장착 변경 영향 없음).
|     전투 units[]에 장비 있는 영웅만 equip_total{hp,atk,def}(적용값)·equipment{slot:{code,name}} 추가(없으면 키 없음), battle state.equip_applied{unit_id:{hp,atk,def,hero}}. PvP는 equipment.pvp_scale(기본 1.0)을 합계에 곱해 내림. 스테이지 적 NPC는 장비 없음.
|  GET  /api/party | PUT /api/party        {user_hero_ids:[..]} 슬롯 순서, 1번=지휘관. 코스트/보유/중복/슬롯 검증
|     (deprecated, 호환용) 별도 '편성' 메뉴는 제거됨: 영웅 선택은 출격(배치) 화면에서만. parties = '마지막 출격 구성'으로, POST /api/battles/{id}/confirm 성공 시 자동 저장(강제/대여 영웅 제외, 배치 순서)되고 다음 deployment의 default_party로 복원(강제 영웅이 항상 맨 앞).
|  (편성 라인업, 2026-11-14) 영웅 메뉴 '편성' 탭. 캠페인 스테이지 출정은 라인업(최대 5명)+필수/고정/대여 영웅+주인공 안에서만 선택(방 대전·랭크·시즌 전쟁·자유전·소탕은 현행). 별도 테이블 user_lineups(parties 와 무관).
|     GET  /api/lineup                   -> {lineup[{slot,user_hero_id,hero,name,display_name,rarity,cost,level,unit_type,troop_type,troop_label,portrait}], count, max(5), avg_level(소수 1자리|null)}. 라인업이 비어 있으면 이 조회에서 보유 일반 영웅 레벨 상위 5명으로 자동 채움(신규 영웅 획득 시 5명 미만이면 자동 추가)
|     PUT  /api/lineup {hero_ids:[user_hero_id..]} 순서=슬롯, 전량 교체 -> GET 과 같은 응답. 오류 422: lineup_empty | lineup_too_many{max} | duplicate_hero | hero_not_owned | hero_not_allowed{user_hero_id}(주인공/campaign_only)
|     GET  /api/stages 추가: 행마다 min_party(필수/고정/대여 영웅 수, 최소 1), lineup_ready(bool: 풀>=min_party), lineup_reason(null|lineup_empty|below_min_party); 최상위 lineup{count,max}. FE 사전 판정은 이 값만, 최종 판정은 서버.
|     GET /api/stages 행·deployment 추가: recommended_party(N_stage: 슬롯 모드=고정+선택 슬롯 수, 그 외=campaign_slots 곡선에 recommended_level 대입한 슬롯 수[필수 영웅 면제분 제외]), recommended_total(= recommended_level x recommended_party, 서버 계산). recommended_level 값·의미는 불변.
|     deployment 응답 추가: lineup_enforced, lineup[](GET /api/lineup 과 같은 항목), lineup_avg_level, lineup_max, min_party, pool_size, lineup_ready, lineup_reason; candidates[] 항목에 in_lineup, lineup_slot|null, in_pool. default_party 는 풀 안으로 필터.
|     PUT /api/battles/{id}/deployment · confirm 신규 오류 422: lineup_insufficient{required,current,reason(lineup_empty|below_min_party),lineup_count,max} (FE: '편성 화면에서 편성' 얼럿) | not_in_lineup{heroes[{user_hero_id,hero,name}],user_hero_ids[]} (필수/고정/대여·주인공 면제)
|     (캠페인 슬롯 곡선) 스테이지 전투에만 game.campaign_slots 적용: 유저 Lv1~2=2슬롯, 3~4=3, 5~6=4, 7~8=5, 9+=6, 코스트 상한=max(user_level_costs, game.campaign_slots.cost_cap_by_level 표[없으면 슬롯x8]). /api/rules 에 troop_slots_by_rarity 추가(등급별 부대 해금, troop_slots 는 FE 호환 유지). GET /api/battles/{id}/deployment 에 default_party_trimmed·default_party_notice 추가. deployment의 max_party_slots/max_cost와 profile.campaign_max_party_slots/campaign_max_cost가 캠페인 값, profile.max_party_slots/max_cost는 PvP·방·자유전(불변).
|     (배치 슬롯, 2026-11-08, docs/DEPLOY_SLOTS_20261108.md) stages.rules.deploy_slots={fixed_slots[{id,x,y,hero('코드'|'@protagonist'),unit_type?,troop_type?}], free_slots[{id,x,y,unit_types?[]}], cost_cap?} 가 있는 스테이지만 슬롯 모드(전투 생성 시 state.deploy_slots 에 고정, 진행 중 전투·키 없음=현행 검증).
|        deployment 응답 추가 키: slot_mode(bool), slots[{id,kind:'fixed'|'free',locked,x,y, fixed: hero,user_hero_id|null,unit_type?,troop_type? / free: unit_types|null}], slot_counts{fixed,free,total}|null, forced_cost{hero,troop,total}, cost_cap_source('stage'|'level').
|        슬롯 모드에서 max_party_slots = 선택(free) 슬롯 수(고정 영웅은 슬롯 면제), max_cost = rules.deploy_slots.cost_cap 우선(없으면 캠페인 곡선 max(user_level_costs, 슬롯x8)). default_party/default_positions 는 고정 영웅=자기 슬롯 + 저장 파티를 맞는 선택 슬롯에 배치.
|        PUT /api/battles/{id}/deployment 슬롯 모드 신규 오류(422): not_a_slot(슬롯 타일 아님) | slot_hero_mismatch(고정 슬롯 영웅 이동/선택 슬롯에 고정 영웅) | slot_unit_type_mismatch(unit_types 불일치{slot,unit_types}).
|        재사용: forced_hero_required(고정 영웅 누락·교체) | protagonist_must_lead | hero_not_owned | duplicate_hero | tile_occupied | too_many_slots(선택 슬롯 수 초과) | cost_exceeded. 선택 슬롯은 비워도 확정 가능. 부대는 영웅에 딸려 기존 troop_place_radius·자동 배치.
|        코스트 변경: 강제/고정 영웅(영웅+부대)도 코스트 합산에 포함(슬롯 수만 면제). deployment.forced[].free_cost=false. 필수 영웅 = forced_heroes + 고정 슬롯 영웅 + rules.required_heroes(스테이지 단위, 대여 없음) 미보유 시 입장 422 required_hero_missing{missing_heroes[{code,name}]}.
|        GET /api/stages 행 추가 키: deploy_slot_counts{fixed,free,cost_cap}|null.
|  GET  /api/hidden-chapter                숨은 종장 {unlocked,progress{cleared,total},chapter|null} (docs/HIDDEN_CHAPTER_SPEC.md)
|  GET  /api/stages                        스테이지 목록(unlocked, best_stars, stage_rules{mode(win_mode|default),conditions[{label}],lose[label]}|null: 승/패배 조건 없으면 null, met 제외)
|                                          + hero_locked/playable/missing_heroes/required_heroes[{code,name,owned}]/ally_npcs/enemy_commander/factions, 최상위 chapters{<chapter>:{need,need_count,owned_count}}
|                                          캠페인 확장(추가 키): chapter(0=기존 모험, 1=1장), objective({type:defeat_commander}|{type:survive_turns,turns}), star_conditions(null=기존 기본 별 규칙|[{type:clear|all_alive|turn_within|commander_hp_pct_min,value?}]),
|                                          locked_by(잠김일 때 선행 {id,code,name}), join_hero(첫 클리어 합류 영웅 코드[]). 전투 view·배치 응답에 objective, view에 survive_remaining(survive_turns만: 승리까지 남은 라운드 수, 현재 포함, 그 외 null).
|                                          정산 result 추가 키(해당 시): star_detail[{type,value,met}], joined_heroes[{hero,is_new}]. survive_turns 승리 = N라운드 종료 시 지휘관 생존(battle_end.reason=survive_turns), 적 지휘관 격파도 승리.
|  POST /api/stages/{id}/challenge         전투 생성(status=deployment), 적 배치 공개
|  GET  /api/battles/active                이어하기: {battles[{battle_id,stage_id,stage_code,stage_name,status(deployment|in_progress),turn,current_side,updated_at}] 최근순, max_open}. 스테이지 전투만(방·전쟁 제외). 이어가기=status별 GET /battles/{id}(+/deployment). 상태는 행동마다 서버 저장(별도 저장 API 없음), 나가기=그냥 이탈, 포기=/abandon
|  GET  /api/battles/{id}                  상태 조회(본인 전투만, 타인 404)
|  GET  /api/battles/{id}/deployment       출격 후보/코스트/배치 영역/적 배치
|  (영웅-부대 편성 squad on 전용 확장) PUT deployment/방 deployment의 placements[]에 선택 필드 troops:[{class,x,y}] 허용: class는 파티 편성의 부대 병종과 일치(다중집합 부분집합),
|     배치 영역·통행·점유 중복 불가, 소속 영웅 주변 troop_place_radius(기본 3, 맨해튼) 이내. 위반 422 {troop_class_mismatch|outside_deploy_zone|impassable_tile|tile_occupied|troop_too_far},
|     영역 용량 부족 422 deploy_capacity_exceeded. 위치를 보내지 않은 부대는 영웅 주변 자동 배치(라운드로빈). squad off에서는 troops 무시.
|     GET deployment 응답에 squad(bool), troop_place_radius, max_units_per_side, formation{user_hero_id:{slots,user_selected,troops:[{class,cost}]}} 추가.
|     max_units_per_side: 스테이지(캠페인) 전투는 config game.max_units_per_side_stage(24), PvP 방/자유전은 game.max_units_per_side(12). GET /api/rules rules에 max_units_per_side_stage·max_units_enemy_stage·max_alive_per_side_stage 추가(PvP 값은 max_units_per_side 그대로).
|  PUT  /api/party                         {user_hero_ids:[..]}. (영웅별 고정 부대 병종) 요청의 troops 키는 검증·저장 없이 무시(하위 호환, 더는 422 없음). GET /api/party의 troops는 항상 {}.
|                                          부대 병종은 heroes.troop_type(sword|spear|cavalry|archer|naval, 병종 v2로 heavy 폐지, 시드 database/data/hero_troop_types.json)로 서버가 결정: 슬롯 수(레벨 슬롯+troop_bonus, cap 4)만큼 1종 고정. 적 편성(프리셋·enemy_extra_troops)은 예외.
|                                          응답 확장: GET /api/heroes[]·deployment/방 candidates[]에 troop_type, troop_label(예 "검병"), heroes[].detail에도 동일. formation[id]={slots,user_selected:false,troop_type,troop_label,troops:[{class,cost}]}. troop_type null 영웅(데이터 누락)은 기존 폴백.
|                                          placements[].troops[].class가 서버 병종과 달라도 오류 없이 서버 병종 사용(위치만 반영, 위치 수가 부대 수 초과 시 422 troop_class_mismatch).
|                                          rules.troop_cost on이면 영웅 cost + 부대 cost 합이 max_cost 이내.
|  (선택 필드) GET deployment 응답: submitted(제출한 placements 그대로, troops[{class,x,y}] 포함, 미제출 null), default_troop_positions{user_hero_id:[{x,y}...]}(squad on일 때 기본 파티 자동 배치 예상 병사 위치, 읽기 전용 계산, off/실패 시 {}).
|     맵 응답(battle view/deployment/방/GET /api/maps/{code}/preview) 최상위 tile_layer{format:'names-v1',names[],rows[],index_map}: 있을 때만(목록 /api/maps 제외), 진행 중 전투는 state 크기와 다르면 생략.
|  PUT  /api/battles/{id}/deployment       {placements:[{user_hero_id,x,y}]} 첫 항목=지휘관. 확정 전 재제출 가능
|  POST /api/battles/{id}/confirm          배치 확정 -> in_progress (부대는 지휘관 주변 자동 배치)
|  (events 계약: 각 이벤트는 고정 키 seq,type(move|attack|counter|heal|kill|turn_start|battle_end),actor_unit_id,target_unit_id,
|   from,to,dmg,crit(항상 false),affinity(adv|dis|none),multiplier,terrain,terrain_def_pct,hp_before,hp_after,kill,
|   flank(none|side|back), facing(행동 후 행동 유닛 방향 up|down|left|right|null))
|   방향(facing) 시스템(config game.rules.facing, 항상 on(개발용 고정), 구 전투(state.facing 없음)는 off 취급, 전투 생성 시 state.facing에 고정): off면 flank=none/facing=null이고 wait 이벤트 없음.
|   on이면 move/attack/counter 이벤트에 방향 정보가 채워지고 wait{actor_unit_id,facing} 이벤트(type=wait)가 추가된다. units[].facing 제공.
|   지형 2단계(기본 off, 전역 config/맵 rules): attack/counter 이벤트에 elevation_mult(고지 배율, 기본 1.0), cover_mult(숲 엄폐 배율, 기본 1.0), def_capped(방어 보정 상한 적용 여부) 추가.
|   피해 배율 dmg_mult(전역 config 1.2, 맵 rules 오버라이드 0.5~2.0): dmg=max(최소피해, round((공격-방어)xdmg_mult)), 공격·반격 공통. 이벤트: dmg_mult가 1.0이 아닐 때 attack/counter에 dmg_mult 필드 가산(없으면 1.0).
|   병력 우위 스노볼 snowball(config game.rules.snowball, 기본 null=off, 전투 생성 시 state.snowball에 고정): 진영 강도(basis=hp 남은 HP 합 | units 유닛 수; units는 후공 편향이 커 비추천) 비 r=own/en, bonus=min(cap, max(0,r-1-dead)xslope)(영웅은 xhero_factor)를 상성 clamp 이후 방향·고지 이전 총배율에 (1+bonus)로 곱함. 보너스>0이면 attack/counter 이벤트에 snow_bonus 필드 가산(없으면 0).
|   terrains[].elevation|cover|heals(0/1, /api/rules), 규칙 highground_mult|forest_cover_mult|forest_cover_exclude_ranged_target|village_heal_pct|def_total_cap(/api/rules rules 블록).
|   마을 회복은 heal 이벤트(actor_unit_id=null, 대상=회복 유닛)로 나오며 치유사 회복과 heal_cap을 공유한다. 맵 rules로 맵 단위 on/off.
|   병사 수(soldiers_*) 개념은 엔진에 없어 미제공(HP만).
|   영웅-부대 소속(squad, config game.rules.squad, 항상 on(개발용 고정), 구 전투는 off 취급, 전투 생성 시 state.squad에 고정): on이면 units[].leader_id(영웅=null, 부대=소속 영웅 id) 제공,
|   영웅(commander/hero) 사망 시 소속 유닛 전원 즉시 제거 + 이벤트 collapse{actor_unit_id=처치자, target_unit_id=쓰러진 영웅 id, unit_ids[]}
|   (kill 직후, battle_end 이전). 오라: 수혜=오라원 소속(leader_id===오라원.id) 유닛 + 본인(squad_aura_self, 기본 true), 다른 영웅/그 부대는 비수혜,
|   오라원=commander/hero(kind!=troop), 유닛당 1개, 반경·종류·수치는 기존. off면 leader_id/collapse 없음(기존 규칙).
|   이번 증분의 부대 구성은 지휘관 1명 + 프리셋 부대(leader_id=지휘관)이므로 효과는 '지휘관 부대만 오라 수혜'+'지휘관 사망 시 붕괴'뿐이다.
|  POST /api/battles/{id}/actions          {type: move|attack|wait|end_turn|activate|end_activation, unit_id, x, y, target_id, facing?, squad_id?, follow?}
|      end_turn follow:true(기본 false, 싱글/캠페인만): 턴 종료 시 미행동 소속 일반병(치유사·npc_ally 제외)이 영웅 오라 반경(없으면 2) 안으로 자동 이동(move 이벤트, 공격 없음, move_from 미기록). 봇·시간초과 자동종료·방(RoomController)은 follow 무시.
|                                          facing: wait 전용 up|down|left|right(그 외 422 / 엔진 invalid_action), 누락 시 현재 방향 유지
|                                          end_turn 후 봇 턴이 서버에서 처리되어 이벤트가 함께 반환
|    [턴 입력 제한시간] config game.turn_input_seconds(60, 코드 값)+turn_input_grace_seconds(2). 내 턴 시작부터 60초 안에 입력. **PvP 방 대전에만 적용**(스테이지·튜토리얼·solo 방은 무제한: turn_input_seconds=0, turn_deadline=null, 마감 미생성·만료 평가 없음).
|      battle view·moves 응답에 turn_input_seconds(int, 0=해제), turn_deadline(epoch ms|null) 추가. 마감+유예 후 다음 요청(actions/GET battle/moves/방 poll) 때 서버가 지연 평가로
|      남은 유닛을 대기 처리하고 end_turn(+봇 턴) 수행, 응답에 turn_timed_out:true. 그 뒤 도착한 move/attack은 409 turn_timeout, wait/end_turn은 200으로 무시(turn_timed_out:true). 봇 턴 제외, state.no_turn_timer=true면 해제.
|    [교대 행동(alternate activation)] config game.rules.alternate_activation(현재 false 고정=유저(진영) 단위 턴 페이즈, 코드 값, env 없음, 코드는 보존해 재도입 가능, 전투 생성 시 state.alternate에 고정, 구 상태는 off).
|      활성화 단위=부대(squad on: 영웅 1체+소속 유닛, leader_id 기준 / squad off: 유닛 1기). 한쪽씩 번갈아 부대를 활성화하고,
|      활성 부대 소속 유닛은 각자 move->attack/wait 가능(이동만 하고 종료 가능). 소속 유닛이 모두 acted이거나 end_activation이면 부대 완료.
|      상대 부대가 소진되면 남은 쪽이 이어서 활성화하되 연속 최대 alt_consecutive_cap(기본 2)회, 초과 시 라운드 종료(미행동 부대 행동권 소멸).
|      라운드 종료 조건=양쪽 모두 활성화 가능 부대 없음(또는 연속 상한). 종료 시 양측 치유사·마을 회복 일괄, round(=turn)+1, max_turns 초과 시 HP 판정(finishByHp).
|      선공=first_side 고정, alt_first_rotate=true면 짝수 라운드는 선후공 교체. on이면 first_turn_move_cap/first_move_limit/second_atk_pct 무시.
|      activate {squad_id}: 부대(영웅/유닛 id) 선택. end_activation: 활성 부대 종료(활성 부대가 없으면 squad_locked). 교대 on에서 end_turn은 invalid_action.
|      move|attack|wait는 활성 부대 소속 유닛만(그 외/활성 부대 없음 409 squad_locked). 에러: squad_locked(409), squad_already_activated(409),
|      squad_not_found(404, 내 부대 아님/붕괴), not_your_turn(409, state.side=현재 활성 플레이어), 그 외 기존 코드.
|      영웅 사망으로 부대 붕괴 시 해당 부대는 gone(행동권 소멸), 활성 중이면 즉시 활성화 종료(activation_end reason=collapse) 후 상대 차례.
|      battle view 추가 필드: alternate(bool), round, alt{round, side(현재 활성 플레이어), active_squad|null, round_first_side,
|        consecutive{side,count,cap}, squads[{id,side,status:ready|active|done|gone,unit_ids[]}]} (off면 alternate=false, alt=null).
|      이벤트 추가(교대 on 전투만): activation_start{actor_unit_id=squad_id, unit_ids, side, turn}, activation_end{actor_unit_id, side, reason:end|done|collapse|timeout, turn},
|        round_end{turn, reason:exhausted|cap}, 이어서 기존 turn_start{turn,side}(새 라운드 선공). end_turn/turn_start 의미는 off 전투에서 불변.
|      솔로: 플레이어 활성화 종료 후 봇이 1부대 처리(플레이어에게 활성 가능 부대가 없으면 봇이 연속 상한까지 이어서 진행). GET /units/{unit}/moves는 활성 부대 유닛만 결과 반환(잠기면 tiles=[] + locked=true, reason=squad_locked, active_squad). alt_implicit_activate(기본 on): 활성 부대가 없을 때 ready 부대 유닛의 move/attack/wait는 암묵 activate.
|  POST /api/battles/{id}/forecast         일반 공격 예측(조회 전용·저장 없음): {unit_id,target_id,x?,y?(임시 이동 칸, 함께)} -> {target_hp_before,target_hp_after,target_max_hp,attacker_hp_before,attacker_hp_after,attacker_max_hp,dmg,counter_dmg,target_defeated,attacker_defeated,micro,flank,affinity}. 실제 /actions(move->attack) 와 동일 경로(미시 on 포함). 오류는 actions 와 동일(IllegalAction)·타인 전투 404 battle_not_found. 스킬 공격 제외
|  GET  /api/battles/{id}/units/{unit}/moves 이동 가능 타일[{x,y,cost}]과 현재 위치 공격 대상(조회 전용, 판정은 서버)
|  POST /api/battles/{id}/abandon          포기(배치/진행 중만): 패배 처리, 보상 없음(시작값), 중복 호출 멱등
|  POST /api/battles/{id}/bot-turn         봇 차례에 멈춘 전투 재처리
|  GET  /api/battles/{id}/result           종료 후 정산 결과(exp/gold/레벨업/max_cost)
|                                          result.heroes[]: {user_hero_id, hero, gained, from_level, level, exp, leveled, exp_to_next(0=만렙), bench?(true=미참전 벤치 영웅)}
|                                          result.reward_mult(별점x재도전 배율, 기본 1.0), first_clear(스테이지 승리만 bool, 그 외 null),
|                                          reward_blocked: null|too_short|daily_cap|stage_daily_cap. 배율은 config game.reward_scale(기본 현행 동일)
|                                          재도전 배율(retry_mult)과 스테이지 일일 상한(stage_daily_cap)은 패배 정산에도 적용(별점 배율은 승리만, 패배 상한은 지급 보상이 있을 때만 카운터 소모, 승·패 카운터 공유)
|
| [방(룸)] mode=solo(컴퓨터 자유 대전, 승리 보상 축소) | pvp(2인, 보상 없음). 방 코드=8자 난수. 비참가자 404
|  GET  /api/maps?mode=solo|pvp&per_side=N&biome=&size_class=S|M|L&include_tiles=1  전장 프리셋 목록 {maps:[{code,name,width,height,theme,tags,biome,size_class,recommended_per_side,pvp_fair,pvp_listing,campaign_ok,difficulty_hint,contact_rounds?,decor?,tiles?}],default_code}. 보류(hold)·모드 불가 맵 제외, size_class(S,M,L)→이름 정렬
|  GET  /api/maps/{code}/preview           {code,width,height,tiles,spawns,deploy_zones,decor?} 60초 캐시(목록에 없는 맵 404)
|       POST /api/rooms map_code: 생략=기본, 'random'=서버 추첨(solo 전체/pvp는 pvp_fair 후보, 응답 room.map_code가 최종), 422 invalid_map(없는 코드)·map_not_allowed(PvP 비공정/보류 맵)
|  GET  /api/rooms                          공개 대기 pvp 방 목록(code, host)
|  POST /api/rooms          {mode: solo|pvp, visibility: public|private, follow_troops?: bool(기본 false; 방 단위 '병사 자동 따라가기' 허용, 방장이 정하고 양측 동일. 응답 room.follow_troops, 행동 body follow:true 는 end_turn에서 이 값이 true일 때만 효력), map_code?: river_01|river_02|plain_01|forest_01|mountain_01|desert_01|swamp_01|castle_01|random(solo 전용)}
|                           map_code 생략=기본(첫) 맵, 허용 밖/없는 맵 422 invalid_map. 방 view의 room{map_code,map_width,map_height}, 공개 방 목록 항목에 map_code|map_width|map_height 포함.
|                           맵별 rules(maps.rules)는 방 전투에도 initialState 경유로 적용된다.   -> 방 상태(방장=side a)
|  POST /api/rooms/join     {code}                                          pvp 참가(side b), 이미 참가했으면 멱등
|  GET  /api/rooms/{code}?after_seq=N      폴링: players(connected, seconds_since_seen, missed_turns), turn{side, owner_user_id,
|                                          is_my_turn, remaining_seconds(서버계산)}, last_seq, events(seq>after_seq), battle, result
|  POST /api/rooms/{code}/ready {ready}    준비(참가자)   POST /leave 나가기(진행 중이면 기권)
|  POST /api/rooms/{code}/start            방장: pvp는 2인 준비 필요 -> 배치 단계
|  GET|PUT /api/rooms/{code}/deployment    내 진영 배치 영역/후보 조회, {placements:[{user_hero_id,x,y}]} 제출
|  POST /api/rooms/{code}/confirm          내 배치 확정 -> 모든 사람 참가자 확정 시 전투 시작(방장 선공)
|  POST /api/rooms/{code}/actions          현재 턴 소유자만. {type(+activate|end_activation 교대 행동 전용, 위 [교대 행동] 참조),squad_id?,unit_id,x,y,target_id,facing?(wait 전용)}. 불법/타인 턴 4xx, 상태 불변
|                                          (이벤트 계약은 위 events 참조: facing on 전투에서만 wait 이벤트/flank·facing 채움, 폴링 events에도 동일)
|  [방 채팅] pvp 참가자 전용(비참가자 403 not_room_member, solo 409 chat_not_available). 폴링(전투 중 1.5s/숨김 4s는 FE 결정). 설정 config/chat.php
|  GET  /api/rooms/{code}/messages?since_id=N&read=0|1  {messages[{id,side,name,mine,kind:text|quick,quick_id,body(HTML 이스케이프 완료),created_at}],latest_id,has_more,unread,can_send,cannot_send_reason,muted,read_only}
|                                          since_id=0 -> 최근 50개. read=1이면 안 읽음 위치 갱신. 종료 후 30분까지 읽기(read_only=true), 이후 410 chat_expired
|  POST /api/rooms/{code}/messages         {kind:text,text} | {kind:quick,quick_id} -> 201 {message}. 게스트 text 403 guest_text_forbidden, 3초 간격 429 chat_throttled(retry_after),
|                                          422 empty_message|message_too_long(100자)|banned_word|chat_duplicate|invalid_quick_id, 403 chat_restricted(until), 409 chat_muted|chat_closed
|  POST /api/rooms/{code}/messages/{id}/report {reason:abuse|spam|sexual|other}  상대 메시지만, 멱등. 7일 내 서로 다른 신고자 3명이면 60분 채팅 제한
|  GET|PUT /api/rooms/{code}/chat-settings {muted}  내 채팅 끄기. 응답 {muted,can_send,cannot_send_reason,is_guest,free_text,max_length,send_interval_seconds,report_reasons,quick_presets[{id,text}]}
|  규칙: 턴 제한 60초(서버 시각), 초과 시 자동 턴 종료(교대 행동 전투는 활성화당 60초, 초과 시 활성 부대 자동 end_activation/없으면 첫 ready 부대 소진), 연속 2회 미응답 기권, pvp 90초 폴링 부재 기권(방 API 호출 시 지연 평가)
|
| [어드민] /api/admin/* (role=admin + Sanctum 쿠키 필수)
|  GET /api/admin/config/{entity}  GET|PATCH /api/admin/config/{entity}/{id}
|     entity: heroes, unit-types, matchups, terrain-modifiers, skills, maps(rules만 수정), presets, stages, user-level-costs, hero-levels
|     maps.rules: 맵별 규칙 오버라이드(선택, null=전역 config). 허용 키 second_atk_pct|dmg_mult|facing_mult{side,back}|facing_cap|first_turn_move_cap|first_move_limit|highground_mult|forest_cover_mult|forest_cover_exclude_ranged_target|village_heal_pct|def_total_cap만
|       (봇 옵션 등 그 외 키는 422). 전투 생성 시 state.rules에 기록되어 진행 중 전투는 불변
|     (삭제 없음. 수정은 audit_logs 기록)
|     skills 응답에 메타 컬럼 추가: template, tags[], evidence_level, source, is_invented, rarity_min, fx_key, flavor, enabled(false=보류, 엔진 미적용).
|     영웅당 복수 스킬은 hero_skills(hero_id, skill_id, sort_order)이며 passive는 키별 합산(heroes.skill_id 단일 연결 호환). params.effects[]로
|     효과 배열(when 조건 필드 보존, 현재 조건부 효과는 무시) 허용 - 어드민 PATCH는 기존 params 키만 허용(effects 편집 미지원).
|  GET /api/admin/users[?banned=1]  POST /api/admin/users/{id}/ban|unban
|  POST /api/admin/users/{id}/reset-progress {confirm:대상 이름 정확 일치, reason:2~200자 필수} -> 200 {ok,counts{테이블:삭제행수,battles_abandoned,wallet_balance_zeroed},granted{gold,pen,level,heroes[]},audit_id,warning,kept[]}
|     계정·채팅·신고·감사로그·재화 원장·종료 전투 기록은 유지하고 진행도만 신규 가입 상태로 초기화. 422 confirm_mismatch|cannot_reset_self|cannot_reset_admin, 409 user_in_active_room, 404 not_found.
|     운영 실행 전 DB 백업 필수(docs/BACKUP_PROCEDURE.md). docs/ADMIN_API_SPEC.md
|  GET /api/admin/battles[?status=&user_id=]  GET /api/admin/battles/{id}/actions
|  GET /api/admin/audit-logs  GET /api/admin/chat/reports  DELETE /api/admin/chat/messages/{id}
*/

// 공지·점검(공개, 점검 중에도 허용): GET /api/announcements {announcements[{id,kind(notice|event|maintenance),title,body,pinned,starts_at,ends_at,created_at}]} (enabled+기간 내, 고정 우선 최신순)
//   GET /api/maintenance {active,enabled,message,starts_at,ends_at}. 점검 활성 시 그 외 /api/* 는 비관리자에게 503 {error:{code:maintenance,message,ends_at}} + Retry-After. 허용: auth/login|logout|me, rules, announcements, maintenance, 관리자(role=admin). docs/ANNOUNCE_MAINTENANCE_SPEC.md
// 클라이언트 에러 리포트(인증 불필요, IP당 분당 20회, 본문 8KB 상한 413): POST /api/client-errors {message(필수,300자 저장), stack?(2000자), level?(error|warn), scene?, url?(경로만 저장), app_version?, platform?} -> 202 {ok:true}
//   개인정보 미수집(사용자 id·IP 저장 안 함, URL 쿼리 제거, 이메일·토큰 형태 마스킹). 같은 fingerprint 는 하루 1행 count 누적. 점검 중에도 허용. docs/ADMIN_API_SPEC.md
Route::post('/client-errors', [\App\Http\Controllers\ClientErrorController::class, 'store'])->middleware('throttle:client-errors');
Route::get('/announcements', [\App\Http\Controllers\AnnouncementController::class, 'index'])->middleware('throttle:60,1');
Route::get('/maintenance', [\App\Http\Controllers\AnnouncementController::class, 'status'])->middleware('throttle:60,1');
Route::get('/rules', [GameController::class, 'rules'])->middleware('throttle:60,1');   // 공개 읽기 전용 규칙표
Route::post('/guests', [AuthController::class, 'guest'])->middleware('throttle:guest-create');
Route::get('/auth/check-name', [AuthController::class, 'checkName'])->middleware('throttle:check-name');
Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:register');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me'])->middleware('not.banned');   // logout은 정지 계정도 허용(세션 정리)
});

Route::middleware(['game.actor', 'throttle:game'])->group(function () {
    Route::get('/profile', [GameController::class, 'profile']);
    Route::get('/protagonist', [\App\Http\Controllers\ProtagonistController::class, 'show']);
    Route::post('/protagonist', [\App\Http\Controllers\ProtagonistController::class, 'store']);
    Route::put('/protagonist/face', [\App\Http\Controllers\ProtagonistController::class, 'face']);
    Route::get('/tutorial', [\App\Http\Controllers\TutorialController::class, 'show']);
    Route::put('/tutorial', [\App\Http\Controllers\TutorialController::class, 'update']);
    Route::get('/ranking', [\App\Http\Controllers\RankingController::class, 'show']);
    // GET /api/me/record[?page=1&per_page=20] 내 PvP 전적(summary{wins,losses,draws,total,win_rate,recent10[]}, records[], page{}). 게스트는 guest=true + 빈 목록. docs/PVP_RECORD_SPEC.md
    Route::get('/me/record', [\App\Http\Controllers\RecordController::class, 'show']);
    // GET /api/rank/matches/{id}: 내 매치 레이팅 변동 {match_id,status,result win|loss|draw|null,reason,side,rating_before,rating_after,delta,opponent{name,rating},settled_at}, 비참가 404 match_not_found
    // 멀티 랭크/대기열(game.rank.enabled=false 기본 -> 404 rank_disabled). 명세 docs/RANK_QUEUE_SPEC.md
    Route::get('/rank/me', [\App\Http\Controllers\RankController::class, 'me']);
    Route::get('/rank/ranking', [\App\Http\Controllers\RankController::class, 'ranking']);
    Route::post('/rank/queue', [\App\Http\Controllers\RankController::class, 'enqueue'])->middleware('throttle:room-create');
    Route::delete('/rank/queue', [\App\Http\Controllers\RankController::class, 'cancel']);
    Route::get('/rank/queue', [\App\Http\Controllers\RankController::class, 'status']);
    Route::get('/rank/matches/{id}', [\App\Http\Controllers\RankController::class, 'match'])->whereNumber('id');
    Route::get('/quests', [\App\Http\Controllers\QuestController::class, 'index']);
    Route::post('/quests/{code}/claim', [\App\Http\Controllers\QuestController::class, 'claim'])->where('code', '[a-z0-9_]{1,48}');
    Route::get('/heroes', [GameController::class, 'heroes']);
    // 영웅 강화(★): POST /api/heroes/{user_hero_id}/star-up {request_id(8~64자 [A-Za-z0-9_-], 멱등키)} -> {replay,star_up_id,user_hero_id,hero,star_before,star,shards_spent,gold_spent,shards(남은 조각),gold,bonus_pct,star_next{gold,shards_need,bonus_pct}|null}
    //   한 트랜잭션: 조각 차감+골드 차감(wallet_transactions reason=hero_star_up, ref=hero_star_ups.id)+star+1+audit_logs. 확정 성공(실패 없음). 같은 request_id 재전송=replay=true(이중 차감 없음).
    //   오류: 404 hero_not_found|star_disabled(config game.star.enabled off 또는 hero_star_ups 마이그레이션 전), 422 star_max|insufficient_shards|insufficient_gold(쓰기 없음), 409 request_id_reused|star_conflict, 검증 오류(request_id).
    //   GET /api/heroes[] 추가 필드: star(0~5), star_max, star_next{gold,shards_need,bonus_pct}|null(최고 단계), star_bonus_pct(현재 누적 공·방 보너스 %). 별 보너스는 스테이지 PvE 전투만 적용(공·방, 체력 제외; 랭크·자유대전·시즌전쟁은 game.star.apply_pvp=false 기본). 비용·보너스 config game.star(임시값).
    Route::post('/heroes/{userHeroId}/star-up', [\App\Http\Controllers\HeroStarController::class, 'starUp'])->whereNumber('userHeroId');
    Route::get('/shop', [EquipmentController::class, 'shop']);
    Route::post('/shop/buy', [EquipmentController::class, 'buy']);
    // 일일 교환소(골드): GET /api/exchange {products[{code,name,description,kind(equipment|currency),payload,price(=price_gold),price_currency(gold|pen),daily_limit(0=무제한),bought_today,remaining|null}],gold,period_key,reset_at(다음 KST 05:00)}
    //   POST /api/exchange/buy {code,request_id(8~64자 멱등키)} -> {replay,purchase_id,code,gold_spent,granted{kind,...},gold,reset_at}. 가격·한도는 서버 값만 신뢰, 한도는 KST 05:00 기준.
    //   오류: 404 product_not_found | 422 insufficient_gold|daily_limit_reached|inventory_full|product_unavailable | 409 request_id_reused|exchange_conflict. docs/SHOP_EXCHANGE_SPEC.md
    // 펜(영구 재화): GET /api/pen {enabled,balance,earned_today,daily_cap(0=무제한),remaining_today|null,recent[{reason,delta,balance_after,created_at}]}.
    //   획득: 시즌 전쟁 공격 승리·점령(war_pen_*), 랭크전 정상 승리(rank_pen_win), 일일 퀘스트 수령(quest_pen). 수량·일일 상한은 config game.pen(임시값). 사용: 교환소 price_currency=pen 상품.
    Route::get('/pen', [\App\Http\Controllers\PenController::class, 'show']);
    Route::get('/exchange', [\App\Http\Controllers\ExchangeController::class, 'list']);
    Route::post('/exchange/buy', [\App\Http\Controllers\ExchangeController::class, 'buy']);
    // 전투 소모품(골드, database/data/battle_items.json 임시 수치): GET /api/shop/items {items[{code,name,kind(heal|buff),price,owned,heal_pct|stat,amount,duration}],gold,max_per_battle,max_stack}, GET /api/items {items[{code,qty}]},
    //   POST /api/shop/items/buy {code,qty(1~max_buy_qty),request_id(8~64자 멱등키)} -> {replay,code,qty,gold_spent,gold,owned}. 오류 404 items_disabled|item_not_found, 422 insufficient_gold|invalid_qty|stack_full, 409 request_id_reused|shop_conflict.
    //   전투 중 사용: POST /api/battles/{id}/actions {type:'use_item', unit_id(내 영웅/지휘관), item:<code>, target_id?(생략=자신, 인접 아군)} (스테이지 전투만, 영웅 행동 1회 소모, 전투당 총 max_per_battle회). 이벤트 item_use{actor_unit_id,target_unit_id,item,name,kind,items_left} + heal{via_item}|buff_apply.
    //   오류 422 items_disabled(방·랭크·전쟁 전투)|item_not_owned|not_hero|item_no_effect, 409 item_limit, 404 item_not_found|invalid_target. 전투 state.items.left = 남은 횟수(키 없음 = 사용 불가). 3성 판정 무영향. docs/BATTLE_ITEMS_SPEC.md
    Route::get('/shop/items', [\App\Http\Controllers\ItemController::class, 'shop']);
    Route::get('/items', [\App\Http\Controllers\ItemController::class, 'owned']);
    Route::post('/shop/items/buy', [\App\Http\Controllers\ItemController::class, 'buy']);
    Route::get('/inventory', [EquipmentController::class, 'inventory']);
    Route::put('/heroes/{userHeroId}/equipment', [EquipmentController::class, 'equip'])->whereNumber('userHeroId');
    Route::get('/party', [GameController::class, 'party']);
    Route::put('/party', [GameController::class, 'saveParty']);
    Route::get('/lineup', [GameController::class, 'lineup']);
    Route::put('/lineup', [GameController::class, 'saveLineup']);
    // 도감 '조우 장수'(서가 NPC) 열람 전용: GET /api/dex/encounter -> {heroes[{code,name_ko|null,culture,unit_type,grade,one_line|null,life|null,shelf_code,shelf_name,portrait_key,revealed,silhouette}]}
    //   서가 스테이지 1개 이상 클리어 시 revealed=true, 아니면 name_ko·one_line·life=null + silhouette=true. 끄기: config game.encounter_dex.enabled(env GAME_ENCOUNTER_DEX) -> 404 encounter_dex_disabled
    Route::get('/dex/encounter', [\App\Http\Controllers\EncounterDexController::class, 'index']);
    // 가챠 결제 통화(config game.gacha.currency pen|gold, 기본 pen=2026-11-14 전환, GAME_GACHA_CURRENCY=gold 로 롤백; 기본 가격 1회 1펜/10연 9펜): GET /api/gacha 추가 필드 currency, price(현재 통화 기준 {single,ten}), price_gold, price_pen{single,ten}, pen(잔액). POST /api/gacha/pull 응답 추가 currency, pen_spent, pen.
    //   펜 결제 시 gold_spent=0, pen_spent=가격, 차감 reason=gacha_pull_pen, 오류 422 insufficient_pen, 503 gacha_pen_unavailable(gacha_pulls.pay_currency/pen_spent 마이그레이션 전). 천장 카운터·확률 공개 불변.
    //   펜 획득 설정(game.pen): daily_cap(기본 60, 권고 80)·daily_quest(기본 3, 권고 5)·pve_first_clear{enabled(기본 false),amount} -> 스테이지 첫 클리어 승리 정산 result.pen_first_clear(지급 시만 포함, 소탕·재클리어 0).
    Route::get('/gacha', [GachaController::class, 'show']);
    Route::post('/gacha/pull', [GachaController::class, 'pull']);
    // 시즌 전쟁(수직 슬라이스): 국가 선택·지도·영토 공격. 전투 진행/정산은 기존 /battles/{id}/* (정산 시 BattleService::settle 훅이 WarService로 위임)
    Route::get('/war/active', [\App\Http\Controllers\WarController::class, 'active']);
    Route::get('/war/seasons', [\App\Http\Controllers\WarController::class, 'seasons']);   // 진행 중인 시즌 목록(시나리오 선택용). 다른 war 조회는 ?scenario= 로 시즌 지정
    Route::get('/war/state', [\App\Http\Controllers\WarController::class, 'state']);
    Route::post('/war/join', [\App\Http\Controllers\WarController::class, 'join']);
    Route::get('/war/map', [\App\Http\Controllers\WarController::class, 'map']);
    Route::get('/war/preview', [\App\Http\Controllers\WarController::class, 'preview']);   // 시즌 없이 시나리오 지도 미리보기(?scenario=imjin, owner=start_country)
    Route::get('/war/ranking', [\App\Http\Controllers\WarController::class, 'ranking']);
    Route::get('/war/events', [\App\Http\Controllers\WarController::class, 'events']);
    Route::get('/war/unread', [\App\Http\Controllers\WarController::class, 'unread']);
    Route::get('/war/my-battles', [\App\Http\Controllers\WarController::class, 'myBattles']);
    Route::get('/war/history', [\App\Http\Controllers\WarController::class, 'history']);
    Route::post('/war/territories/{code}/attack', [\App\Http\Controllers\WarController::class, 'attack'])->where('code', '[a-z0-9_]{1,48}');
    Route::get('/stages', [GameController::class, 'stages']);
    Route::get('/hidden-chapter', [GameController::class, 'hiddenChapter']);   // 숨은 종장(ch999) 진행도/해금 상태: 잠김 시 이름·위치 비노출
    // 소탕(수동 3성 클리어 스테이지만, 전투 없음): POST /api/stages/{stage}/sweep {count(1~game.sweep.max_count), request_id} -> {replay,sweep_id,stage_id,requested,executed,reward_blocked(stage_daily_cap|null),gold,hero_exp_total,user_exp,heroes[],user}
    //   best_stars<3 이면 422 sweep_not_available. 일일 한도는 전투 보상(stage_daily_cap)과 같은 카운터 공유, 초과분은 미실행(executed<requested), 0회면 422 stage_daily_cap. 멱등(request_id). 자동 전투 아님. docs/SHOP_EXCHANGE_SPEC.md
    Route::post('/stages/{stage}/sweep', [\App\Http\Controllers\SweepController::class, 'sweep'])->whereNumber('stage');
    Route::post('/stages/{stage}/challenge', [GameController::class, 'challenge'])->whereNumber('stage');
    // 방(룸): solo(컴퓨터 자유 대전) / pvp(2인). 참가자만 접근(비참가자 404)
    Route::get('/maps', [RoomController::class, 'maps']);
    Route::get('/maps/{code}/preview', [RoomController::class, 'mapPreview'])->where('code', '[A-Za-z0-9_]{1,40}');
    Route::get('/rooms', [RoomController::class, 'index']);
    Route::post('/rooms', [RoomController::class, 'store'])->middleware('throttle:room-create');
    Route::post('/rooms/join', [RoomController::class, 'join'])->middleware('throttle:room-create');
    Route::prefix('rooms/{code}')->where(['code' => '[A-Za-z0-9]{8}'])->group(function () {
        Route::get('/', [RoomController::class, 'show']);
        Route::post('/leave', [RoomController::class, 'leave']);
        Route::post('/ready', [RoomController::class, 'ready']);
        Route::post('/start', [RoomController::class, 'start']);
        Route::get('/deployment', [RoomController::class, 'deployment']);
        Route::put('/deployment', [RoomController::class, 'submitDeployment']);
        Route::post('/confirm', [RoomController::class, 'confirm']);
        Route::post('/actions', [RoomController::class, 'action']);
        // 방 채팅(pvp 참가자 전용, 폴링)
        Route::get('/messages', [\App\Http\Controllers\ChatController::class, 'index'])->middleware('throttle:chat-read');
        Route::post('/messages', [\App\Http\Controllers\ChatController::class, 'store'])->middleware('throttle:chat-send');
        Route::post('/messages/{id}/report', [\App\Http\Controllers\ChatController::class, 'report'])->whereNumber('id')->middleware('throttle:chat-report');
        Route::get('/chat-settings', [\App\Http\Controllers\ChatController::class, 'settings'])->middleware('throttle:chat-read');
        Route::put('/chat-settings', [\App\Http\Controllers\ChatController::class, 'updateSettings'])->middleware('throttle:chat-send');
    });
    Route::get('/battles/active', [GameController::class, 'activeBattles']);
    Route::prefix('battles/{id}')->where(['id' => '[0-9]+'])->group(function () {
        Route::get('/', [GameController::class, 'showBattle']);
        Route::get('/deployment', [GameController::class, 'deployment']);
        Route::put('/deployment', [GameController::class, 'submitDeployment']);
        Route::post('/confirm', [GameController::class, 'confirmDeployment']);
        Route::post('/actions', [GameController::class, 'action']);
        Route::get('/units/{unit}/moves', [GameController::class, 'moves']);
        Route::post('/forecast', [GameController::class, 'forecast']);   // 일반 공격 예측(조회 전용, throttle:game 그룹 공통)
        Route::post('/abandon', [GameController::class, 'abandon']);
        Route::post('/bot-turn', [GameController::class, 'botTurn']);
        Route::get('/result', [GameController::class, 'result']);
    });
});

Route::prefix('admin')->middleware(['auth:sanctum', 'admin', 'throttle:60,1'])->group(function () {
    Route::get('/config/{entity}', [AdminController::class, 'index']);
    Route::get('/config/{entity}/{id}', [AdminController::class, 'show'])->whereNumber('id');
    Route::patch('/config/{entity}/{id}', [AdminController::class, 'update'])->whereNumber('id');
    Route::get('/users', [AdminController::class, 'users']);
    Route::post('/users/{id}/ban', [AdminController::class, 'ban'])->whereNumber('id');
    Route::post('/users/{id}/unban', [AdminController::class, 'unban'])->whereNumber('id');
    Route::post('/users/{id}/reset-progress', [AdminController::class, 'resetProgress'])->whereNumber('id');   // 진행도 초기화(계정 유지). confirm=대상 이름, reason 필수
    Route::get('/battles', [AdminController::class, 'battles']);
    Route::get('/battles/{id}/actions', [AdminController::class, 'battleActions'])->whereNumber('id');
    Route::get('/audit-logs', [AdminController::class, 'auditLogs']);
    // 클라이언트 에러 조회: GET /api/admin/client-errors[?q=&level=&from=&to=&min_count=&per_page=] 최근 발생 순 페이지네이션(data/total)
    Route::get('/client-errors', [\App\Http\Controllers\ClientErrorController::class, 'index']);
    // 공지/점검 관리: GET|POST /announcements {kind,title,body,pinned?,enabled?,starts_at?,ends_at?}, PATCH /announcements/{id}, GET|PUT /maintenance {enabled,message?,starts_at?,ends_at?,confirm:"MAINTENANCE"(켤 때)}. audit entity=announcements|maintenance
    Route::get('/announcements', [\App\Http\Controllers\AnnouncementController::class, 'adminIndex']);
    Route::post('/announcements', [\App\Http\Controllers\AnnouncementController::class, 'store']);
    Route::patch('/announcements/{id}', [\App\Http\Controllers\AnnouncementController::class, 'update'])->whereNumber('id');
    Route::get('/maintenance', [\App\Http\Controllers\AnnouncementController::class, 'adminMaintenance']);
    Route::put('/maintenance', [\App\Http\Controllers\AnnouncementController::class, 'setMaintenance']);
    // 교환소 상품 관리(삭제 없음, enabled=false 로 내림): GET /exchange/products, POST /exchange/products {code,name_ko,kind,payload,price_gold,daily_limit,...,reason?}, PATCH /exchange/products/{id}. audit entity=exchange-products
    Route::get('/exchange/products', [\App\Http\Controllers\AdminExchangeController::class, 'index']);
    Route::post('/exchange/products', [\App\Http\Controllers\AdminExchangeController::class, 'store']);
    Route::patch('/exchange/products/{id}', [\App\Http\Controllers\AdminExchangeController::class, 'update'])->whereNumber('id');
    Route::get('/dashboard', [AdminController::class, 'dashboard']);   // 간단 집계(활성 시즌·미처리 신고·오늘 가입/전투)
    // 채팅 운영: GET /api/admin/chat/reports[?status=open|all&page=] 신고 큐, DELETE /api/admin/chat/messages/{id} 메시지 소프트 삭제(멱등, audit_logs 기록)
    Route::get('/chat/reports', [\App\Http\Controllers\AdminChatController::class, 'reports']);
    Route::delete('/chat/messages/{id}', [\App\Http\Controllers\AdminChatController::class, 'deleteMessage'])->whereNumber('id');
    Route::post('/chat/reports/{id}/handle', [\App\Http\Controllers\AdminChatController::class, 'handle'])->whereNumber('id');   // 신고 처리 완료 {action:dismissed|resolved,note?}
    Route::post('/chat/users/{id}/restrict', [\App\Http\Controllers\AdminChatController::class, 'restrict'])->whereNumber('id');   // 수동 제재 {minutes,reason}
    Route::post('/chat/users/{id}/unrestrict', [\App\Http\Controllers\AdminChatController::class, 'unrestrict'])->whereNumber('id');   // 제재 해제 {reason}
    // 시즌 전쟁 관리: 요약/생성/강제 종료/점령도 보정(confirm·reason 필요, war:tick 과 같은 락). docs/ADMIN_API_SPEC.md
    Route::get('/war/season', [\App\Http\Controllers\AdminWarController::class, 'season']);
    Route::get('/war/scenarios', [\App\Http\Controllers\AdminWarController::class, 'scenarios']);   // 시즌 시나리오 목록(생성 UI용)
    Route::post('/war/seasons', [\App\Http\Controllers\AdminWarController::class, 'create']);
    Route::post('/war/seasons/{id}/end', [\App\Http\Controllers\AdminWarController::class, 'end'])->whereNumber('id');
    Route::patch('/war/territories/{id}/occupation', [\App\Http\Controllers\AdminWarController::class, 'occupation'])->whereNumber('id');
});
