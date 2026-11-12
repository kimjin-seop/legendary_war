// manifest.json 증분 병합: 안아트 조각(fragment) 파일들을 기존 public/assets/manifest.json 위에 병합한다(윤프론 2026-11-01).
// build_manifest.mjs 는 폴더 스캔으로 manifest 를 "새로" 만들기 때문에 이후 pp_uiskin 등이 직접 병합한 항목(atlas.uiskin*, brand.*, bg.screen.*, tileset.* 등)을
// 잃는다. 그래서 조각 병합은 기존 manifest 를 읽어 키 단위로 추가/교체하는 이 스크립트로 한다(멱등: 같은 조각을 다시 돌려도 결과 동일).
//
// 실행(저장소 루트): node docker/gemini/merge_fragments.mjs [--dry]      (Docker: docker run --rm -v "$PWD":/app -w /app node:22 node docker/gemini/merge_fragments.mjs)
//   --dry : 파일을 쓰지 않고 검증·통계만 출력
// 동작:
//   1) (--backup 일 때만) manifest.json, hero_sprite_map_v2.json 을 <파일>.bak_merge_<시각> 으로 백업. 기본은 백업 없음
//   2) FRAGMENTS 의 항목을 정규화해 병합. 같은 키가 다른 출처(source_fragment)에 이미 있으면 충돌로 보고하고 건너뜀(--replace 로 교체)
//      같은 출처에서 온 키는 교체(조각 재생성 반영)
//   3) 조각별 부가 처리: pixel → atlas.pixel_badges 항목(+개별 프레임 항목은 scope 'pixel_atlas', 개별 로드 안 함)
//                         fragment_b → thumbs.files 를 portrait.<...>.thumb 항목으로, cutscene.* 은 scope 'cutscene'(부팅·전투 로드 제외)
//                         hero_v3* → hero_map_v3 에 든 영웅을 hero_sprite_map_v2.json 에서 제거(전용 시트 unit.hero.<code> 사용) — manifest 와 같은 실행에서 함께 기록
//   4) 검증: JSON 재파싱, 키 유일성, 조각 키 파일 존재(누락 시 실패·미기록), scope 별 용량
// 새 조각 추가 절차: 아래 FRAGMENTS 에 경로 1줄 추가(영웅 시트 조각이면 kind:'hero') → node docker/gemini/merge_fragments.mjs --dry → 누락 0 확인 → 인자 없이 실행
import { readFileSync, writeFileSync, existsSync, statSync, copyFileSync, renameSync, constants as FS } from 'node:fs';

const A = 'public/assets';
const FRAGMENTS = [
    { path: `${A}/sprites/hero_v3_manifest_fragment.json`, kind: 'hero' },
    { path: `${A}/sprites/hero_v3b_manifest_fragment.json`, kind: 'hero', optional: true }, // 안아트 A2(생성 중)
    { path: `${A}/sprites/hero_v3c_manifest_fragment.json`, kind: 'hero', optional: true }, // 안아트 A3(생성 중)
    { path: `${A}/sprites/hero_v4_manifest_fragment.json`, kind: 'hero' }, // 영웅 101명 1:1 전용 시트 v4(2026-11-01). 영웅→키 맵은 sprites/hero_sprite_map_v4.json(assets.js 가 최우선 로드)
    { path: `${A}/ui/pixel/manifest_fragment_pixel.json`, kind: 'pixel' },
    { path: `${A}/portraits/troops/manifest_fragment_troops.json`, kind: 'portrait' },
    { path: `${A}/manifest_fragment_b.json`, kind: 'b' },
    { path: `${A}/protagonist_manifest_fragment.json`, kind: 'protagonist' }, // 안아트 주인공(초상화 6얼굴x4표정·전신 illust·전투 시트 unit.protagonist.*). illust.* 는 hero scope(부팅 제외)
    { path: `${A}/tiles/water_set/manifest_fragment.json`, kind: 'flat' },
    { path: `${A}/tiles/land_set/manifest_fragment_land.json`, kind: 'flat' },
    { path: `${A}/tiles/tileset_v2/manifest_fragment_tv2.json`, kind: 'flat' }, // 안아트 tileset_v2(RM2003 칩셋 베이크, tileset.tv2_static 1000~ / tileset.tv2_anim 1700~ 기록용 — 로드는 FE 연동 후 assets.js queueRmTiles) // 육상 세트(tileset.land_set 기록용, 로드는 assets.js queueRmTiles. FE 전역 500~ 재배정은 unityTileset U32_EXT3)
    { path: `${A}/bg/scene/manifest_fragment_scene_bg.json` }, // 대사 장면 배경 12장(bg.archive.* / bg.imjin.*, scope lazy·deferred, variants 1280). 매핑표 = data/dialogue/scene_bg_map.json
    { path: `${A}/map_world/world_map_manifest_fragment.json` },
    { path: `${A}/map_world/regional/regional_manifest_fragment.json` },
    { path: `${A}/map_world/oldworld/oldworld_manifest_fragment.json` }, // 구대륙 세계 기본판(map.oldworld.*, scope 'map'). 표시 영역 = oldworld/world_view_bounds.json(StageMapView MAP_VIEW.bounds) // 세계지도 지역판 LOD(map.world.region.east_asia 4200/variants.mobile 2100, scope 'map' — StageMapView 가 1장 선택 시 filter 로 지연 로드) // 세계지도(map.world.* / map.icon.*): scope 'map'(스테이지 탭 StageMapView 가 필요한 것만 지연 로드, 부팅 제외)
    { path: `${A}/portraits/preview/portrait_preview_manifest_fragment.json`, optional: true }, // 안아트 준비 중 캠페인 영웅 초상화(preview). 구도 보정 중 — 안아트 완료 보고 후 병합
    { path: `${A}/sprites/npc/unit_npc_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 NPC 전용 시트(원균·정운·이여송·진린, unit.npc.<code>.<ally|enemy>.64.sheet)
    { path: `${A}/npc_naval_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 수병 시트(unit.<culture>.naval.*: scope 'naval') + NPC 시트(unit.npc.*: scope 'npc') + NPC 초상화(portrait.npc_*, hero scope 개별 지연). 전투 유닛이 필요한 키만 assets.ensureUnitTex 로 지연 로드(battle scope 일괄 로드 제외)
    { path: `${A}/portraits/npc/portrait_npc_enemy_manifest_fragment.json` }, // 안아트 적 부장 NPC 초상 8(portrait.npc_* / portrait.npc_jp_*, hero scope 개별 지연. 2026-11-02)
    { path: `${A}/portraits/npc/portrait_npc_v3_manifest_fragment.json` }, // 안아트 신규 NPC v3 초상 119(ch16 오를레앙 18·서가 46·3순위 55, portrait.npc_*, hero scope 개별 지연. 2026-11-02)
    { path: `${A}/portraits/npc/portrait_npc_story_manifest_fragment.json` }, // 안아트 오리지널 메인 스토리 1막 NPC 초상 3(portrait.npc_jieum·npc_jjogi·npc_red_pen, hero scope 개별 지연. 2026-11-03)
    { path: `${A}/portraits/npc/portrait_npc_ch21eu_manifest_fragment.json` }, // 안아트 ch21 유럽 장수 3(바츨라프 1세·우그린·파코스와프)+바투·후마윤 초상(portrait.npc_*, 2026-11-03). 생성 정의 npc_ch21eu_style.mjs
    { path: `${A}/sprites/npc/unit_npc_ch21eu_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 같은 3명 전용 시트(unit.npc.<code>.<ally|enemy>.64.sheet, scope npc). 2026-11-03
    { path: `${A}/portraits/npc/portrait_npc_ch2122b_manifest_fragment.json` }, // 안아트 ch21 브워지미에시·미에슈코 2세 + ch18 나이만 잔당 우두머리 초상(portrait.npc_*, 2026-11-03). 생성 정의 npc_ch2122b_style.mjs
    { path: `${A}/sprites/npc/unit_npc_ch2122b_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 같은 3명 전용 시트(unit.npc.<code>.<ally|enemy>.64.sheet). 2026-11-03
    { path: `${A}/portraits/portrait_hero_exp1_manifest_fragment.json` }, // 안아트 소수 진영 확충 영웅 초상 12(남아시아 4·동남아시아 8, portrait.<code> + .thumb, 기존 영웅 초상과 같은 폴더). 2026-11-03. 생성 정의 hero_exp1_style.mjs
    { path: `${A}/portraits/portrait_hero_s_manifest_fragment.json` }, // 안아트 S등급 2차: 신규 S 영웅 초상 portrait.<code> + S 배경 판 portrait.s_bg.<theme>. 2026-11-04
    { path: `${A}/portraits/portrait_oldworld_manifest_fragment.json` }, // 안아트 구대륙 교체 영웅 초상 20(portrait.<new_code>). 2026-11-04
    { path: `${A}/portraits/portrait_hero_wave3_manifest_fragment.json` }, // 안아트 영웅 풀 확장 3차 신규 35명 초상(portrait.<code> + .thumb, 호출 37). 생성 정의 hero_wave3_style.mjs. 2026-11-06
    { path: `${A}/ui/icons/set/manifest_fragment_ui_icon_set.json` }, // 안아트 UI 아이콘 세트 ico.troop/slot/stat.<code>.<64|32>(호출 0, 기존 아이콘 후처리). 2026-11-04
    { path: `${A}/ui/quest/manifest_fragment_quest_ui.json`, kind: 'assets' }, // 안아트 퀘스트 화면 UI ui.quest.* + 상단 로고 변형 ui.logo.{topbar,emblem,plaque}(호출 0, 재가공). 2026-11-04
    { path: `${A}/ui/season/manifest_fragment_season_ui.json`, kind: 'assets' }, // 안아트 시즌 전쟁 화면 ui.season.*(호출 0, 재가공·벡터). 2026-11-04
    { path: `${A}/sprites/hero_exp1_sprite_manifest_fragment.json`, kind: 'hero' }, // 안아트 소수 진영 확충 영웅 12명 전용 방향 시트(unit.hero.<code>.<ally|enemy>.64[.sheet], v4 규격). 매핑 hero_sprite_map_v4.json 에 함께 추가. 2026-11-03
    { path: `${A}/sprites/hero_exp2_sprite_manifest_fragment.json`, kind: 'hero' }, // 안아트 신규 가챠 영웅 20명 전용 방향 시트(unit.hero.<code>.<side>.64[.sheet], 2026-11-06)
    { path: `${A}/sprites/hero_wave3_sprite_manifest_fragment.json`, kind: 'hero' }, // 안아트 영웅 풀 확장 3차 전용 방향 시트 52명(신규 35 + 승격 무시트 17, unit.hero.<code>.<side>.64[.sheet]). 매핑 hero_sprite_map_v4.json 에 함께 추가. 2026-11-06
    { path: `${A}/portraits/npc/portrait_npc_b4_manifest_fragment.json` }, // 안아트 ch23/24 신규 NPC 초상 7(portrait.npc_*, 2026-11-03). 생성 정의 npc_b4_style.mjs. npc_frankish_vanguard 는 범용 재사용(reuse_map)
    { path: `${A}/sprites/npc/unit_npc_b4_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 승격 NPC 7 + ch23/24 NPC 7 전용 시트(unit.npc.<code>.<ally|enemy>.64.sheet, scope npc). 2026-11-03
    { path: `${A}/portraits/npc/portrait_npc_b5_manifest_fragment.json` }, // 안아트 npc_mongol_vanguard 초상(가챠 풀 무초상 NPC 보충, 2026-11-03)
    { path: `${A}/sprites/npc/unit_npc_b5_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 준비 중 서가 ch12·13·16 NPC 15 + 몽골 선발대장 전용 시트(unit.npc.<code>.<side>.64.sheet). 2026-11-03
    { path: `${A}/portraits/npc/portrait_npc_b6_manifest_fragment.json` }, // 안아트 종장 보스 '백지' 초상(portrait.npc_blank_page, 2026-11-03)
    { path: `${A}/sprites/npc/unit_npc_b6_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 종장 적 '지워진 줄'·'백지' 시트(unit.npc.npc_erased_line / npc_blank_page). 2026-11-03
    { path: `${A}/sprites/npc/unit_npc_b7_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 npc_lu_su·npc_torii_suneemon 전용 시트(강화면 지적 보충, 2026-11-03)
    { path: `${A}/sprites/npc/unit_npc_b8_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 npc_craterus·npc_ptolemy 전용 시트(강화면 25회차 보충, 2026-11-03)
    { path: `${A}/sprites/npc/unit_npc_b9_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 B~D 실존 인물 NPC 129명 전용 방향 시트(unit.npc.<code>.<ally|enemy>.64.sheet, 258키, scope npc). 2026-11-07
    { path: `${A}/sprites/npc/unit_npc_b10_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 NPC 93명 전용 방향 시트 b10(unit.npc.<code>.<ally|enemy>.64.sheet, 186키, scope npc). 2026-11-07
    { path: `${A}/sprites/npc/unit_npc_b11_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 NPC 21명 전용 방향 시트 b11(unit.npc.<code>.<ally|enemy>.64.sheet, 42키, scope npc). 2026-11-07
    { path: `${A}/sprites/npc/unit_npc_b12_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 NPC 전용 방향 시트 b12(수군 15 + 오를레앙 8, 46키, scope npc). 2026-11-08
    { path: `${A}/sprites/npc/unit_npc_b13_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 NPC 전용 방향 시트 b13(구대륙 이름 있는 인물 21명, scope npc). NPC_CLONE 정리는 실화면 검증 후. 2026-11-08
    { path: `${A}/sprites/npc/unit_npc_ch25b_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 ch25 이름 있는 인물 전용 방향 시트 7(수군 6 + 쩐 타인똥, scope npc). 2026-11-08
    { path: `${A}/portraits/npc_ch25b_portrait_manifest_fragment.json` }, // 안아트 ch25 신규 NPC 초상 5(portrait.npc_*, hero scope 개별 지연). 2026-11-08
    { path: `${A}/sprites/npc/unit_npc_b14_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 배치 D NPC 전용 시트 b14(70항목, scope npc). replaces_existing_keys: unit.npc.npc_boat_2 2키(사람 없는 배 시트 교체). 2026-11-08
    { path: `${A}/portraits/npc/npc_b14_portrait_manifest_fragment.json` },
    { path: `${A}/sprites/npc/unit_npc_ch26_sprite_manifest_fragment.json`, kind: 'npc_naval' }, // 안아트 ch26 카이사르 루비콘 NPC 전용 시트 29명 58키(unit.npc.<code>.<side>.64.sheet, scope npc). 2026-11-08
    { path: `${A}/portraits/npc_ch26_portrait_manifest_fragment.json` },
    { path: `${A}/samguk_recraft_manifest_fragment.json`, kind: 'npc_naval' },
    { path: `${A}/portraits/portrait_redo_manifest_fragment.json` }, // 안아트 초상 얼굴 차별화 재제작(portrait.* 70키 replaces_existing_keys, 경로 WebP, webp_map 14항목 크기값 갱신 동반). 원본 백업 docker/db-backup-20261108/portrait-redo/. 2026-11-08 // 안아트 삼국(고구려·백제·신라) 고증 재제작 42/42(초상 90·영웅 시트 36·NPC 시트 68 = 194키 전부 replaces_existing_keys 교체). kind npc_naval = unit.npc.* scope 'npc' 유지(조각 항목에 scope 없음). 2026-11-08 // 안아트 ch26 NPC 초상 32 + 별칭 1(portrait.npc_*, hero scope 개별 지연). 2026-11-08 // 안아트 배치 D NPC 초상 b14(18항목). replaces_existing_keys: 초상 7키. 2026-11-08
    { path: `${A}/portraits/portrait_redo2_manifest_fragment.json` }, // 안아트 초상 얼굴 차별화 2차(112항목 replaces_existing_keys, 같은 경로 덮어쓰기). 2026-11-09
    { path: `${A}/portraits/portrait_redo3_manifest_fragment.json` }, // 안아트 초상 얼굴 다양성 감사 1배치(114항목 replaces_existing_keys, PNG 13장은 webp_map 로 WebP 전환). 2026-11-09
    { path: `${A}/portraits/missing_heroes_manifest_fragment.json` }, // 안아트-2 누락 영웅 초상 신규 4(멤논·스티건드·벨러 4세·마우론티우스, PNG -> webp_map WebP). 포로스는 기존 portrait.porus 재사용(reuse). 2026-11-09
    { path: `${A}/portraits/portrait_redo4_manifest_fragment.json` }, // 안아트 초상 얼굴 다양성 감사 2배치(116항목 replaces_existing_keys, 같은 경로 WebP 덮어쓰기). 2026-11-09
    { path: `${A}/portraits/portrait_npc_missing_manifest_fragment.json` }, // 안아트 초상 없던 NPC 25명(portrait.npc_* + .thumb 50키, PNG 25장 -> webp_map WebP). npc_cleitus 는 assets.js 별칭(npc_cleitus_black). 2026-11-09
    { path: `${A}/portraits/npc_b11_portrait_manifest_fragment.json` }, // 안아트 NPC 초상 b11 7명(portrait.npc_* + 내장 .thumb, 14키). 생성 정의 npc_b11_portrait_style.mjs. 2026-11-07
    { path: `${A}/portraits/ch25_manifest_fragment.json` }, // 안아트 ch25 쩐 왕조 대 몽골·원 NPC 초상 6(portrait.npc_* + 내장 .thumb, 12키). 생성 정의 ch25_portraits_style.mjs. 2026-11-07
    { path: `${A}/portraits/captain/portrait_captain_manifest_fragment.json` }, // 안아트 기본 부장 초상(클론 무장) portrait.captain.<group>.<troop>(+.thumb). 조회표 portraits/captain/captain_map.json. 2026-11-03
    { path: `${A}/effects/gun/manifest_fragment_gun.json` }, // 안아트 총병 이펙트 fx.gun_muzzle·fx.gun_smoke(battle scope). 2026-11-03
    { path: `${A}/fx/skills/manifest_fragment_skill_fx.json` }, // 안아트 영웅 스킬 이펙트 시트 39(fx.skill.<fx_family>.<variant>, spritesheet 1회 재생, scope battle, 호출 0 절차 생성). 연결 요청서 fx/skills/skill_fx_request.json. 2026-11-06
    { path: `${A}/fx/skills/manifest_fragment_skill_fx_b.json` }, // 안아트 배치 E 스킬 이펙트 시트 추가분(fx.skill.<계열>.<변형>, 코드 매핑 docker/gemini/skill_fx_map_b.json -> build_skill_fx_map.mjs). 2026-11-08
    { path: `${A}/sprites/gunner_manifest_fragment.json` }, // 안아트 총병 병사 시트 unit.<culture>.gunner.<side>.64.sheet(japan·europe 1차). 2026-11-03
    { path: `${A}/bg/manifest_fragment_battle_water.json` }, // 안아트 수상 전투 컷신 배경(bg.battle.sea.a/b·reef.a·harbor.a·river.a, 960x300 + x2, battle scope) + fx.cut_wake(32x16x4 시트). 2026-11-03
    { path: `${A}/skill_icons/manifest_fragment.json` }, // 안아트 스킬 아이콘 아틀라스 306(atlas.skill_icons, textureKey skill_icons, scope 'skill' 지연 로드, 프레임명 skill.<code>, 코드별 메타 skill_icons/skill_icon_map.json). 2026-11-03
    { path: `${A}/gacha_ui/manifest_fragment.json`, kind: 'assets' }, // 안아트-2 뽑기(역사책 소집) 화면 gacha.*: scope gacha_ui(메인) / gacha_fx(연출, 등급별 filter 로드). 스펙 public/assets/gacha_ui/gacha_ui_spec.json. 2026-11-03
    { path: `${A}/portraits/npc/portrait_npc_alias_manifest_fragment.json` }, // 안아트 NPC 코드 별칭 초상(기존 영웅 초상 복제: portrait.npc_william_i). 2026-11-04
    { path: `${A}/ui/vs_emblem/manifest_fragment_vs_emblem.json`, kind: 'assets' }, // 안아트 서가 지도 VS 엠블럼 ui.vs_emblem(글자 없음)·ui.vs_emblem_text('VS'), 512 webp 투명, 채택 B안. 2026-11-04
    { path: `${A}/portraits/troops/manifest_fragment_troop_gunner.json` }, // 안아트 무명 병사 총병 초상 portrait.troop.<culture>.gunner(japan·europe·middle_east·default). 2026-11-04
    { path: `${A}/portraits/troops/manifest_fragment_troop_library.json` }, // 안아트 공백병 무명 병사 초상 portrait.troop.library.<troop> 8. 2026-11-04
    { path: `${A}/fx/cut/manifest_fragment_cut_fx.json`, kind: 'assets' }, // 안아트 전투 컷신 연출 fx.cut_speedlines·fx.cut_brush_ally/enemy·ui.cut_ribbon (webp 투명, scope battle). 2026-11-04
    { path: `${A}/ui/manifest_fragment_logo.json`, kind: 'assets' }, // 안아트 게임 로고 ui.logo.main(세로형 768/384)·ui.logo.header(가로형 600/1000), 사용자 제공 원본 후처리. 2026-11-04
    { path: `${A}/ui_skin/library/manifest_fragment_library.json`, kind: 'assets' }, // 안아트 서고 UI 스킨 1단계 새 조각 ui.skin.bg_damask·ui.skin.frame_corner·ui.deco.*. 2026-11-04
    { path: `${A}/ui_skin/library/nav/manifest_fragment_nav.json`, kind: 'assets' }, // 안아트 로비 크롬 ui.nav.*(아이콘 8·프레임 2·레일). 2026-11-04
    { path: `${A}/ui/battle/manifest_fragment_battle_ui.json`, kind: 'assets' }, // 안아트 전투 HUD 스킨 ui.battle.*(@2x png, slice). 2026-11-04
    { path: `${A}/ui/flags/manifest_fragment_flags.json`, kind: 'assets' }, // 안아트 서가 지도 진영 깃발 ui.flag.<faction_id>(256x256 webp 투명, scope map). 2026-11-04
    { path: `${A}/gacha_ui/manifest_fragment_keyart.json`, kind: 'assets' },
    { path: `${A}/gacha_ui/manifest_fragment_title_native_sc.json`, kind: 'assets' }, // 안아트 시나리오 배너 원어 타이틀 13종 gacha.title.sc_chNN.native(scope gacha_ui, 텍스처 gacha_title_sc_chNN_native = Gacha 동적 테마 theme=서버 key). 2026-11-08 // 안아트 뽑기 메인 키아트 gacha.keyart.<theme>·gacha.title.<theme>·gacha.title.brush·gacha.tag.hero·gacha.list.compact(.selected), scope gacha_ui. 2026-11-03
    { path: `${A}/gacha_ui/manifest_fragment_keyart_sc.json`, kind: 'assets', excludeKeys: ['gacha.keyart.sc_ch101', 'gacha.keyart.sc_ch102', 'gacha.keyart.sc_ch103', 'gacha.keyart.sc_ch104'] }, // 안아트 시나리오 배너 전용 키아트 gacha.keyart.sc_chNN(scope gacha_ui). 메인스토리 배너(ch101~104) 제거로 13개만 병합(excludeKeys). 2026-11-08
    { path: `${A}/tiles/terrain_buildings/kits/L/manifest_fragment_kit_L.json`, kind: 'flat' }, // 안아트 서고 실내(L) 키트 tile.kit_l.*(scope map_kit, 부팅 제외 기록용 — 실제 로드는 tb_manifest.json / mapArt). 스펙 kits/L/kit_L_spec.json. 2026-11-08
    { path: `${A}/result_ui/manifest_fragment.json`, kind: 'assets' },
    { path: `${A}/portraits/portrait_redo5_manifest_fragment.json` }, // 안아트 초상 얼굴 다양성 감사 3배치(132항목 replaces_existing_keys, 같은 경로 교체). 반드시 맨 마지막: 같은 키가 portrait_npc_story·portrait_npc_v3·samguk_recraft·npc_ch26·npc_b14·ch25·portrait_npc_alias 등 이전 조각에도 있어 REPL 소유자가 redo5 가 되도록 순서 고정. 2026-11-10 // 결과 화면(result.*): assets 배열, scope 'result'(결과 창 진입 시 지연 로드) // 안아트 수상 세트(tileset.water_set_* 기록용 — 로드는 assets.js queueRmTiles) + ship_overlay.*(전투 scope). 최상위 키 = 항목(_ 접두사 제외)
];
const DRY = process.argv.includes('--dry');
const REPLACE = process.argv.includes('--replace');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rel = (p) => String(p ?? '').replace(/^\/?public\//, '').replace(/^\//, '');
const fsz = (p) => (existsSync(`public/${p}`) ? statSync(`public/${p}`).size : null);
const SCOPE_PREVIEW = (k, v) => { // assets.js scopeOf 와 같은 규칙(용량 산출용)
    if (v.scope) return v.scope; if (v.lazy === false) return 'boot';
    const [p, s] = k.split('.');
    if (p === 'portrait') return k.endsWith('.thumb') ? 'hero(thumb)' : 'hero';
    if (p === 'skill' || (p === 'icon' && s === 'skill')) return 'hero';
    if (['unit', 'tile', 'fx', 'effect'].includes(p) || v.type === 'effect') return 'battle';
    if (p === 'bg' && s === 'battle') return 'battle';
    if (k === 'bg.map_outside') return 'battle';
    if (k === 'atlas.uiskin_gacha' || k === 'bg.screen.gacha') return 'gacha';
    if (p === 'equip') return 'equip';
    if (v.deferred || v.lazy === true) return 'lazy';
    if (['bgm', 'sfx', 'ui', 'brand', 'tileset'].includes(p)) return `(skip:${p})`;
    return 'boot';
};

const man = J(`${A}/manifest.json`);
const items = man.items;
const idx = new Map(items.map((it, i) => [it.key, i]));
const stats = []; const errors = []; const conflicts = [];
// 조각별 교체 선언(replaces_existing_keys, 2026-11-08 배치 D, 초상 키 교체 = 딸린 .thumb 도 교체): 그 조각만 해당 키를 교체할 수 있고, 다른(옛) 조각의 같은 키는 건너뛴다(매 실행 충돌 방지). 전역 --replace 불필요
const REPL = new Map();
for (const fr of FRAGMENTS) { if (!existsSync(fr.path)) continue; try { const d0 = JSON.parse(readFileSync(fr.path, 'utf8')); (Array.isArray(d0.replaces_existing_keys) ? d0.replaces_existing_keys : []).forEach((k) => { REPL.set(String(k), rel(fr.path)); if (String(k).startsWith('portrait.') && !String(k).endsWith('.thumb')) REPL.set(`${k}.thumb`, rel(fr.path)); }); } catch { /* 파싱 오류는 아래 본 루프가 보고 */ } }
const put = (it, src) => {
    it.source_fragment = src;
    const owner = REPL.get(it.key);
    if (owner && owner !== src) return 'skip'; // 다른 조각이 이 키를 교체한다고 선언
    const i = idx.get(it.key);
    if (i == null) { idx.set(it.key, items.length); items.push(it); return 'add'; }
    const prev = items[i];
    if (prev.source_fragment === src || REPLACE || owner === src) { items[i] = it; return 'replace'; }
    conflicts.push(`${it.key} (기존 ${prev.source_fragment ?? 'build_manifest'} / 신규 ${src})`); return 'conflict';
};
const norm = (it) => {
    const o = { ...it, path: rel(it.path) };
    if (o.type === 'sprite_sheet') o.type = 'spritesheet';
    if (Array.isArray(it.frame) && o.frameWidth == null) { o.frameWidth = Number(it.frame[0]); o.frameHeight = Number(it.frame[1]); }
    if (Array.isArray(it.size)) o.size = `${it.size[0]}x${it.size[1]}`;
    if (it.bytes && typeof it.bytes === 'object') o.bytes_variants = it.bytes;
    o.bytes = fsz(o.path);
    if (o.fallback == null && it.fallback_key) o.fallback = it.fallback_key;
    if (o.variants && typeof o.variants === 'object') o.variants = Object.fromEntries(Object.entries(o.variants).map(([k, v]) => [k, typeof v === 'string' ? rel(v) : v]));
    return o;
};
// WebP 대응표(2026-11-04, webp_convert.py): 원본 경로 -> webp. 원본이 지워졌어도 webp 가 있으면 통과
const WMAP = existsSync(`${A}/webp_map.json`) ? J(`${A}/webp_map.json`) : {};
const fileCheck = (key, p) => { if (!p || !(existsSync(`public/${p}`) || (WMAP[p] && existsSync(`public/${WMAP[p].webp}`)))) errors.push(`파일 없음: ${key} -> ${p}`); };

let heroMapV3 = {};
for (const fr of FRAGMENTS) {
    if (!existsSync(fr.path)) { if (!fr.optional) errors.push(`조각 없음: ${fr.path}`); else console.log(`[건너뜀] 아직 없음(선택): ${fr.path}`); continue; }
    let d; try { d = J(fr.path); } catch (e) { errors.push(`조각 파싱 실패: ${fr.path} ${e.message}`); continue; }
    const src = rel(fr.path);
    const flat = fr.kind === 'flat' && !d.items ? Object.fromEntries(Object.entries(d).filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object')) : null; // 평면 조각: {키: 항목}
    const list0 = fr.kind === 'assets' && Array.isArray(d.assets) ? d.assets : Array.isArray(d.items) ? d.items : Object.entries(flat ?? d.items ?? {}).map(([key, v]) => ({ key, ...v }));
    const EXC = new Set(fr.excludeKeys ?? []); // 조각 일부 키 제외(예: 제거된 배너의 키아트)
    const list = EXC.size ? list0.filter((x) => !EXC.has(x.key)) : list0;
    const c = { add: 0, replace: 0, conflict: 0, skip: 0 };
    for (const raw of list) {
        const it = norm(raw);
        fileCheck(it.key, it.path);
        if (fr.kind === 'pixel') { it.scope = 'pixel_atlas'; it.atlasTexture = d.atlas?.textureKey ?? 'pixel_badges'; } // 개별 PNG 는 로드 안 함(아틀라스 프레임으로 사용)
        if (it.key.startsWith('cutscene.')) it.scope = it.scope ?? 'cutscene'; // 재생기 연결 전: 어떤 화면에서도 로드 안 함
        if (it.key.startsWith('result.')) it.scope = it.scope ?? 'result'; // 결과 화면 전용(Battle.showResult 가 ensureScope)
        if (it.key.startsWith('illust.')) it.scope = it.scope ?? 'hero'; // 전신 일러스트: 캐릭터 생성 화면에서 개별 지연 로드(ensurePortraitTex)
        if (it.key.startsWith('ship_overlay.')) it.scope = it.scope ?? 'battle'; // 수상 배 오버레이: 편성·전투 진입 시 로드(부팅 제외)
        if (fr.kind === 'npc_naval' && it.key.startsWith('unit.npc.')) it.scope = it.scope ?? 'npc'; // NPC 전투 시트: 해당 NPC 유닛이 나올 때만(assets.ensureUnitTex)
        if (fr.kind === 'npc_naval' && /^unit\.[a-z_]+\.naval\./.test(it.key)) it.scope = it.scope ?? 'naval'; // 수병 시트: 수병 유닛이 나올 때만(assets.ensureUnitTex)
        if (it.key.startsWith('map.world.') || it.key.startsWith('map.icon.')) it.scope = it.scope ?? 'map'; // 세계지도: 부팅 제외(ui/StageMapView.js 가 ensureScope('map', filter))
        c[put(it, src)] += 1;
        if (raw.thumb?.key && raw.thumb?.path) { // 주인공 초상화 등 항목 내장 썸네일
            const t = { key: raw.thumb.key, path: rel(raw.thumb.path), type: 'portrait', subtype: 'thumb', thumb_of: it.key, format: 'webp', bytes: fsz(rel(raw.thumb.path)) };
            fileCheck(t.key, t.path); c[put(t, src)] += 1;
        }
    }
    if (fr.kind === 'pixel' && d.atlas) { // 도트 뱃지 아틀라스(부팅 1회). 해상도: assets.js skinFiles(pixel-atlas) 가 @3x/@2x 선택(@1.5x 금지)
        const v = (s) => ({ path: rel(d.atlas[s].path), json: rel(d.atlas[s].json), bytes: fsz(rel(d.atlas[s].path)), scale: Number(s[0]) });
        const at = { key: 'atlas.pixel_badges', type: 'pixel-atlas', textureKey: d.atlas.textureKey ?? 'pixel_badges', scope: 'boot', ...v('3x'), variants: { '1x': v('1x'), '2x': v('2x'), '3x': v('3x') }, filter: 'NEAREST', troopAlias: d.troopAlias, keyRule: d.keyRule, note: '도트 뱃지·표식 아틀라스. 프레임 이름 = 조각 키(badge.hero.<troop> 등). 표시 크기는 원본 도트 크기의 정수배(ui/PixelBadge.js)' };
        ['1x', '2x', '3x'].forEach((s) => { fileCheck(`atlas.pixel_badges@${s}`, at.variants[s].path); fileCheck(`atlas.pixel_badges@${s}.json`, at.variants[s].json); });
        c[put(at, src)] += 1;
    }
    if (fr.kind === 'b' && d.thumbs?.files) { // portrait.<...>.thumb: 원본 경로(src)를 가진 manifest 항목 키 + '.thumb'(별칭 키 포함)
        const byPath = new Map(); items.forEach((x) => { if (x.key.startsWith('portrait.') && !x.key.endsWith('.thumb')) { const a = byPath.get(x.path) ?? []; a.push(x.key); byPath.set(x.path, a); } });
        let skipped = 0;
        for (const [tp, info] of Object.entries(d.thumbs.files)) {
            const keys = byPath.get(rel(info.src));
            if (!keys) { skipped += 1; continue; } // 예: shiori_surprise_v1(이전 버전 백업) — 키 없음
            for (const k of keys) { const t = { key: `${k}.thumb`, path: rel(tp), type: 'portrait', subtype: 'thumb', thumb_of: k, format: 'webp', size: Array.isArray(info.size) ? `${info.size[0]}x${info.size[1]}` : info.size, bytes: fsz(rel(tp)), src_bytes: info.src_bytes };
                fileCheck(t.key, t.path); c[put(t, src)] += 1; }
        }
        if (skipped) console.log(`[썸네일] 원본 키 없음 ${skipped}개 건너뜀`);
    }
    if (fr.kind === 'hero' && d.hero_map_v3) Object.assign(heroMapV3, d.hero_map_v3);
    stats.push(`${src}: 항목 ${list.length} → 추가 ${c.add}, 교체 ${c.replace}, 충돌 ${c.conflict}${c.skip ? `, 다른 조각이 교체(건너뜀) ${c.skip}` : ''}`);
}

// hero_sprite_map_v2: v3 전용 시트가 manifest 에 실제로 있는 영웅만 임시 재매핑 제거(시트 없으면 유지 → 로드 실패 방지)
const mapPath = `${A}/hero_sprite_map_v2.json`;
const hm = J(mapPath); const removed = []; const kept = [];
for (const [code, base] of Object.entries(heroMapV3)) {
    if (!(code in (hm.heroes ?? {}))) continue;
    if (idx.has(`${base}.ally.64.sheet`) && idx.has(`${base}.enemy.64.sheet`)) { delete hm.heroes[code]; removed.push(code); } else kept.push(code);
}

// WebP 적용: 대응표에 있고 webp 가 있으면 path·bytes·format 교체. 원본이 아직 있는데 크기가 표와 다르면(원본을 새로 덮어씀) webp 가 낡은 것 → 원본 유지 + 경고
const wStale = []; let wApplied = 0;
// 원래 format 보존(정검수 권고 2026-11-04): 교체 시 src_format 에 원값(없으면 '__none__') 저장, 되돌릴 때 복원
const restoreFmt = (it) => { if (it.src_format === undefined) { if (it.format === 'webp') delete it.format; } else if (it.src_format === '__none__') delete it.format; else it.format = it.src_format; delete it.src_format; };
for (const it of items) {
    // 이전 병합에서 바꾼 항목도 매번 원본 기준으로 다시 판정(대응표에서 빠졌으면 원본 경로로 복구)
    if (it.src_path && it.format === 'webp') { it.path = it.src_path; delete it.src_path; restoreFmt(it); if (existsSync(`public/${it.path}`)) it.bytes = statSync(`public/${it.path}`).size; }
    const e = WMAP[it.path]; if (!e || !existsSync(`public/${e.webp}`)) continue;
    if (existsSync(`public/${it.path}`) && statSync(`public/${it.path}`).size !== e.bytes_src) { wStale.push(it.key); it.bytes = statSync(`public/${it.path}`).size; continue; }
    it.src_path = it.path; it.src_format = it.format ?? '__none__'; it.path = e.webp; it.bytes = statSync(`public/${e.webp}`).size; it.format = 'webp'; wApplied += 1;
}
console.log(`[webp] 적용 ${wApplied}${wStale.length ? ` / 원본이 더 새로움(webp 재변환 필요, 원본 유지) ${wStale.length}: ${wStale.slice(0, 8).join(', ')}` : ''}`);
// 전체 경로 존재 검증(정검수 권고): path·thumb.path·json·variants 가 실제 파일을 가리키지 않으면 오류 → 기록하지 않음
{
    const miss = []; const chk = (k, p) => { if (typeof p === 'string' && p && !existsSync(`public/${rel(p)}`)) miss.push(`${k} -> ${p}`); };
    for (const it of items) {
        chk(it.key, it.path); if (it.thumb && typeof it.thumb === 'object') chk(`${it.key}.thumb`, it.thumb.path); chk(`${it.key}.json`, it.json);
        if (it.variants && typeof it.variants === 'object') for (const [s, v] of Object.entries(it.variants)) { chk(`${it.key}@${s}`, typeof v === 'string' ? v : v?.path); if (v && typeof v === 'object') chk(`${it.key}@${s}.json`, v.json); }
    }
    if (miss.length) errors.push(`경로 없음 ${miss.length}: ${miss.slice(0, 20).join(' | ')}`);
    console.log(`[경로 검증] 누락 ${miss.length}`);
}

// 검증
const keys = items.map((i) => i.key);
const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
if (dup.length) errors.push(`중복 키 ${dup.length}: ${dup.slice(0, 10).join(', ')}`);
if (conflicts.length) errors.push(`충돌 ${conflicts.length}: ${conflicts.slice(0, 10).join(' | ')}`);
const scope = {};
items.forEach((it) => { const s = SCOPE_PREVIEW(it.key, it); const o = (scope[s] ??= { n: 0, bytes: 0 }); o.n += 1; o.bytes += Number(it.bytes) || 0; });
stats.forEach((s) => console.log(`[조각] ${s}`));
console.log(`[hero_sprite_map_v2] 제거 ${removed.length}명${removed.length ? `: ${removed.join(', ')}` : ''}${kept.length ? ` / 시트 없음으로 유지 ${kept.join(', ')}` : ''}`);
console.log(`[검증] 항목 ${items.length}, 중복 ${dup.length}, 충돌 ${conflicts.length}, 오류 ${errors.length}`);
console.log('[scope 용량] ' + Object.entries(scope).sort().map(([s, o]) => `${s}: ${o.n}개 ${(o.bytes / 1048576).toFixed(2)}MB`).join(' / '));
if (errors.length) { console.error(errors.join('\n')); console.error('오류가 있어 기록하지 않음'); process.exit(1); }
if (DRY) { console.log('--dry: 기록 안 함'); process.exit(0); }

// 백업은 기본 끔(2026-11-03 팀장 지시). --backup 을 줄 때만 <파일>.bak_merge_<YYYYMMDDTHHMMSS>(같은 이름이 있으면 _2, _3, COPYFILE_EXCL)
const BACKUP = process.argv.includes('--backup');
let stamp = null;
if (BACKUP) {
  stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  for (let n = 1; existsSync(`${A}/manifest.json.bak_merge_${stamp}`) || existsSync(`${mapPath}.bak_merge_${stamp}`); n += 1) stamp = `${stamp.replace(/_\d+$/, '')}_${n + 1}`;
  copyFileSync(`${A}/manifest.json`, `${A}/manifest.json.bak_merge_${stamp}`, FS.COPYFILE_EXCL);
  copyFileSync(mapPath, `${mapPath}.bak_merge_${stamp}`, FS.COPYFILE_EXCL);
}
// 원자적 쓰기: 임시 파일에 쓴 뒤 rename(중간에 끊겨도 원본이 반쯤 쓰인 상태로 남지 않게)
const writeAtomic = (path, text) => { const tmp = `${path}.tmp_${process.pid}`; writeFileSync(tmp, text); renameSync(tmp, path); };
man.fragmentsMergedAt = new Date().toISOString();
man.fragmentsMerged = FRAGMENTS.filter((f) => existsSync(f.path)).map((f) => rel(f.path));
const outM = JSON.stringify(man, null, 1); JSON.parse(outM);
writeAtomic(`${A}/manifest.json`, outM);
if (removed.length) { hm._v3_removed = [...new Set([...(hm._v3_removed ?? []), ...removed])]; hm._v3_note = 'hero_map_v3(전용 시트) 병합으로 제거된 영웅: 기본 규칙 unit.hero.<code> 사용. merge_fragments.mjs 가 manifest 와 같은 실행에서 기록'; }
writeAtomic(mapPath, JSON.stringify(hm, null, 1));
console.log(BACKUP ? `기록 완료(백업 *.bak_merge_${stamp})` : '기록 완료(백업 없음, 필요하면 --backup)');
