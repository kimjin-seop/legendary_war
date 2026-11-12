# UI 스킨 라이브러리 (키·배치 정리)

에셋 제작: 안아트 / 적용·기록: 윤프론. 2026-11-04 기준. 에셋이 없거나 로드 전이면 모두 코드 그림으로 폴백한다.

## 1. 아틀라스 프레임 (atlas.uiskin, 이름 동일 교체 = 코드 변경 없음)

| 프레임 | 방식 | 사용처 | 비고 |
|---|---|---|---|
| dialog.box | 9-slice (3x 모서리 147px) | 대사창 (Dialogue, BattleDialogue) | 모서리 배율 `slice(..., { corner })`: 세로 폰 0.6, 가로 폰 0.75, 데스크톱 1 |
| dialog.nameplate | 3h | 대사 이름표 | |
| panel.main / panel.sub | 9-slice | 일반 패널 (120x120 이상 = main) | |
| panel.hud | 9-slice, 장식 최소 | 작은 HUD 패널 (390 권장) | `slice(scene, 'panel_hud', ...)` |
| topbar.strip | 3h | 로비 상단 바 | |
| currency.capsule | 3h | 골드 캡슐 | |
| gacha.list.compact(.selected) | 이미지 480x152 | 뽑기 좌측 배너 목록 | 같은 규격이라 코드 변경 없음 |

## 2. 단일 이미지 (manifest ui.*, 지연 로드 = `ui/uiImage.js` withUiImage)

| 키 | 크기 | 사용처 · 배치 |
|---|---|---|
| ui.skin.bg_damask | 512 타일 | 대사 씬 바탕 TileSprite (타일 배율 0.5, 틴트 #7a8098, 알파 0.32). 장면 배경 이미지 아래(depth -16)라 배경 없는 대사·막간에만 보임 |
| ui.deco.crest_top | 1200x412 | 대사 씬 상단 가운데. 폭 = 로그·스킵 버튼과 겹치지 않는 폭(최대 520), 높이 = 캡션 띠 시작선까지. 공간이 없으면(390) 생략 |
| ui.deco.globe / books / lantern / scrolls | 384 | 대사 씬 좌하단(지구의·책) / 우하단(등·두루마리), 가로 화면만. 바닥 = 대사창 윗변 아래 12%(대사창 뒤) |
| ui.skin.frame_corner | 512 (기준 = 왼쪽 위) | 대사 씬 네 모서리, flipX/flipY. 크기 = 짧은 변 11%(세로 폰 16%, 최대 96). 변 = 금선 #D9B45A 2px + 안쪽 #8A6A1E 1px |
| ui.nav.single / hero / gacha / multi / growth / reward / more / record | 192 (@2x) | 로비 우측 세로 내비 아이콘. 프레임 지름의 60% 가운데. 키 매핑 = Lobby.js `NAV_ICON` |
| ui.nav.frame / ui.nav.frame_selected | 256 (@2x) | 세로 내비 원형 프레임(기본/선택). 표시 지름 = min(레일 폭 x 0.9, 칸 높이 x 0.72). 레일 폭이 76이라 표시 112는 쓰지 않음 |
| ui.nav.rail | 96x590, 세로 3-slice t35·b35 | 로비 우측 레일 바탕. 폭 = 레일 폭에 맞춰 균일 배율, 가운데만 세로로 늘림 |
| ui.logo.main / ui.logo.header | 768x1024 / 600x200(+@2x) | brand.js `LOGO_FILES` (타이틀·로그인·로딩 / 로비 상단 헤더) |
| ui.vs_emblem_text / ui.vs_emblem | 512 | 서가 지도 VS, 전투 컷신 VS |
| ui.cut_ribbon | 1024x247 | 전투 컷신 상단 상성 리본 (가로 늘림) |

## 3. 전투 컷신 fx (fx.*, BattleCutscene.cutFx)

| 키 | 배치 |
|---|---|
| fx.cut_speedlines | 양 끝(오른쪽 flipX), 무대 높이 92%, 병사 뒤 |
| fx.cut_brush_ally / fx.cut_brush_enemy | 컷인 초상 뒤, 바깥 아래 기준(오른쪽 flipX), 초상 폭 1.55배 x 높이 1.05배 |
