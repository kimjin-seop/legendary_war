# UI 스킨·로고·장비 아이콘 통합 적용 가이드 (윤프론용, 2026-11-01)

수치의 단일 출처는 각 아틀라스 JSON과 manifest 조각이다. 이 문서와 값이 다르면 JSON을 따른다.
- `public/assets/ui_skin/manifest_fragment.json`
- `public/assets/ui_skin/map_fragment.json`
- `public/assets/equip/manifest_fragment.json`
- `public/assets/brand/manifest_fragment.json`

본 `manifest.json`에는 병합하지 않았다. 로더에 atlas 지원을 넣을 때 함께 통합한다.

## 1. 텍스처 키와 파일

| 텍스처 키 | 파일(@3x / @1.5x) | 내용 | 로드 시점 |
|---|---|---|---|
| `uiskin` | `assets/ui_skin/atlas/ui_skin@3x.png/.json` / `ui_skin@1.5x.*` | 버튼·탭·패널·HUD·입력·토스트·대사·게이지·배지·아이콘(83프레임) | 부팅 Preload 1회 |
| `uiskin_gacha` | `assets/ui_skin/atlas/ui_skin_gacha@3x.*` / `@1.5x.*` | 등급 프레임·S 장식·카드 뒷면·승패 배너(9프레임) | 가챠·결과·영웅 목록 진입 시 |
| `equipicons128`, `equipicons64` | `assets/equip/atlas/equip_icons_128.png/.json`, `_64.*` | 장비 23종(프레임 이름 `icon.equip.<code>`) | 장비·상점·인벤토리 진입 시 |
| `equipframe_<c\|b\|a\|s>` | `assets/equip/frames/{128,64}/<r>.png` | 장비 등급 판 | 장비 화면 진입 시 |
| `bgscreen_title`, `bgscreen_lobby`, `bgscreen_gacha` | `assets/ui_skin/bg/<name>_1920.jpg` / `_1280.jpg` | 화면 배경(글자 없음) | 해당 씬 |
| `mapoutside` | `assets/ui_skin/map/map_outside_512.png`(저사양 `_256`) | 맵 바깥 반복 배경 | 전투 씬 |
| `mapedge` | `assets/ui_skin/map/map_edge@3x.png` / `@1.5x` | 맵 경계 9-slice | 전투 씬 |
| `brand_*` | `assets/brand/*.png` | 로고(§6) | Title/Preload |

- **해상도 선택**: `game.scale` 기준 1u가 2px 이상(대략 1440p 이상)이면 @3x, 그 외에는 @1.5x를 쓴다. 한 세션 안에서 섞지 않는다.
- **필터**: 전부 LINEAR. 텍스처 키에 `ui.` `icon.` `deco.` `tile` `unit` `fx` 접두를 쓰지 않는다. `assets.js`가 `ui.`는 건너뛰고 `icon|deco|...`는 NEAREST를 강제한다.
  - 프레임 이름 안의 접두(`icon.equip.*`)는 필터와 무관하다.
  - manifest 키(`icon.equip.*`, `deco.map_edge` 등)를 그대로 텍스처 키로 쓰면 NEAREST가 걸린다. 위 표의 텍스처 키로 바꿔 등록한다.

## 2. 프레임 이름 규칙
- 형식: `<컴포넌트>.<변형>[.<크기>].<상태>`
  - 예: `btn.primary.normal`, `btn.secondary.sm.pressed`, `row.list.selected`, `input.field.error`
- 상태:
  - 버튼(primary·secondary·danger, md/lg 공용과 `.sm`): normal / hover / pressed / disabled
  - 원형 아이콘 버튼: `btn.icon.round.*` 4상태 + `.glow`
  - `row.list`: normal / hover / selected / disabled
  - `input.field`: normal / focus / error
- selected 버튼은 hover 프레임에 테두리 강조(FE)로 처리한다. ghost 버튼은 코드로 그린다(텍스트 + hover 시 하단 금선 2u).
- 아이콘: `ico.<name>` 24종(108px@3x). 개별 PNG는 `assets/ui_skin/icons/{64,32}/<name>.png`.
  - back, close, plus, info, lock, check, mail, quest, notice, shop, inventory, ticket, shard, stamina, log, fullview, fit, speed, auto, skip, filter, sort, edit, logout
- 게이지 채움:
  - `bar.fill.{hp,hp_warn,hp_danger,exp,gold,cost}`
  - 임의 색은 `bar.fill.base`에 `setTint(색)`을 쓴다.
  - cost는 보라 대신 청록 #3FC1B0으로 만들었다.

## 3. 슬라이스 값 사용법
각 프레임 JSON 항목:
- `slice{l,r,t,b}`: 해당 아틀라스 px 기준. Phaser가 `frame.customData.slice`로 보존한다.
- `sliceMode`:
  - `9`: 네 변 모두 고정
  - `3h`: 가로만 늘림
  - `image`: 늘리지 않음
- `scale9Borders`: Phaser 3.70+는 자동 인식한다.
- `anchor`, `glowPad`, `pips`: 보조 정보.

```js
// k = 아틀라스 unitPx(3 또는 1.5) / 화면 1u 당 px. 모서리는 원본 픽셀 비율 유지, 오브젝트 전체를 1/k 로 축소
const f = scene.textures.getFrame('uiskin', 'panel.sub'); const s = f.customData.slice;
const k = UNIT_PX_OF_ATLAS / pxPerUnit;
scene.add.nineslice(x, y, 'uiskin', 'panel.sub', w * k, h * k, s.l, s.r, s.t, s.b).setScale(1 / k);
// 3h(버튼·탭·리본·행·바): 높이를 프레임 높이에 맞춰 균일 스케일 → k = frame.height / 표시높이, t=b=0
const kb = f.height / h; scene.add.nineslice(x, y, 'uiskin', 'btn.primary.normal', w * kb, f.height, s.l, s.r, 0, 0).setScale(1 / kb);
```

최소 폭(이보다 좁으면 끝 조각이 눌림) = (l + r) / frame.height × 표시 높이

| 프레임 | 최소 폭 |
|---|---|
| primary md | 1.1h |
| secondary md | 0.76h |
| primary sm | 0.44h |
| secondary sm | 1.2h |
| tab.on | 0.73h |
| tab.off | 0.38h |
| header.ribbon | 2.2h |
| row.list | 0.6h |
| input | 0.9h |
| toast | 1.1h |
| topbar | 2.6h |
| currency | 1.0h |
| bar.track | 3.0h |

### 주요 프레임 값(@3x, @1.5x는 반올림한 절반)

| 프레임 | 크기 | 모드 | slice |
|---|---|---|---|
| btn.primary.* | 198x168 | 3h | 93 |
| btn.secondary.* / danger.* | 140x168 | 3h | 64 |
| btn.primary.sm.* | 54x96 | 3h | 21 |
| btn.secondary.sm.* / danger.sm.* | 128x96 | 3h | 58 |
| btn.glow | 246x216 | 3h | 117(glowPad 24, 버튼보다 사방 8u 크게) |
| btn.icon.round.* | 168x177 | image | — (아이콘 60%, 위로 3% 올려 배치) |
| tab.on / tab.off | 134x168 / 76x168 | 3h | 61 / 32 |
| tab.gem | 31x25 | image | anchor 탭 윗변 중앙, offsetY −4px |
| panel.main / sub / hud | 264² / 102² / 114² | 9 | 126 / 45 / 51 |
| dialog.box | 202x192 | 9 | l/r 95, t/b 90 |
| dialog.nameplate | 154x108 | 3h | 71 |
| header.ribbon | 304x132 | 3h | 146 |
| row.list.* | 128x192 | 3h | 58 |
| input.field.* | 130x132 | 3h | 59 |
| toast.pill | 142x120 | 3h | 65 |
| topbar.strip | 512x192 | 3h | 250 |
| currency.capsule | 122x108 | 3h | 55 |
| bar.track / bar.fill.* | 138x42 / 50x30 | 3h | 63 / 19 (채움은 트랙 높이의 10/14, 상하 가운데) |
| badge.dot / badge.pill | 72x74 / 92x60 | image / 3h | — / 40 |
| frame.rank.{c,b,a,s,base} | 288² | 9 | 72 |
| frame.rank.s.ornament | 312x345 | image | anchor offsetX/Y(프레임 좌상단 기준 px) |
| card.back | 360x563 | image | — |
| banner.victory / defeat | 1440x440 / 1440x518 | image | — (가운데에 FE 텍스트) |
| mapedge | 134² | 9 | 61(@1.5x 67², 31) |

## 4. 화면별 적용 순서와 프레임

1. **공용 컴포넌트**
   - Button: `btn.*`, `btn.glow`
   - 원형 버튼: `btn.icon.round.*` + `ico.*`
   - Tabs: `tab.on`, `tab.off`, `tab.gem`, `badge.dot`
   - Panel·Modal: `panel.main`(120u 이상), `panel.sub`(카드·작은 창), 헤더는 `header.ribbon`
   - Toast: `toast.pill`
2. **로비**
   - 배경: `bgscreen_lobby`
   - 상단바: `topbar.strip`(화면 끝까지, 세이프에어리어 밖까지 칠함)
   - 재화: `currency.capsule` + `ico.shard` / `ico.ticket` / gold 아이콘 + 원형 버튼(`ico.plus`)
   - 좌측: `brand_logo_small_h32`
   - 탭바: `tab.*` + 메뉴 아이콘
3. **타이틀**
   - 배경: `bgscreen_title`
   - 로고: `brand_logo_h`(세로 화면은 `brand_logo_stack`), 화면 위쪽 35% 영역 중앙
   - 버튼: `btn.primary`
4. **가챠**
   - 배경: `bgscreen_gacha`
   - 카드: `card.back` → 공개 시 `frame.rank.<r>`, S는 `frame.rank.s.ornament`를 겹침
   - 행: `row.list`(확률표)
5. **영웅 목록·상세·편성**
   - 슬롯: `frame.rank.<r>`, 빈 슬롯은 `frame.rank.base`에 alpha 0.4 + `ico.plus`
   - 능력치 행: `row.list`, 게이지: `bar.*`
6. **전투 HUD**
   - 패널: `panel.hud`
   - 버튼: 원형 버튼 + `ico.log` / `ico.fullview` / `ico.fit` / `ico.speed` / `ico.auto` / `ico.skip`
   - 게이지: `bar.track` + `bar.fill.hp*`
   - 맵 바깥: `mapoutside`(TileSprite, LINEAR, tileScale 1/3~1/2, scrollFactor 0.3~0.5), 경계: `mapedge`(맵 사각형 바깥에 nineslice, depth는 맵 아래·배경 위)
7. **결과 정산**: `banner.victory` / `banner.defeat` + 보상 슬롯 `frame.rank.*`
8. **방·인증·설정·대사 창**
   - 입력: `input.field.*`(DomInput CSS도 #0A1226 면 + 금 테두리 + 반경 동일)
   - 대사 창: `dialog.box` + `dialog.nameplate`
9. **장비·상점**
   - 슬롯: `equipframe_<r>`(64/128) 위에 `equipicons64/128`의 `icon.equip.<code>`(같은 좌상단, 같은 크기)
   - 빈 슬롯: `equipframe_c`에 alpha 0.4

## 5. 폴백 규칙
- 아틀라스가 없거나 프레임이 없으면(`textures.exists` / `getFrame` 실패) 현행 `skin.js` 코드 스킨으로 그린다. 기존 키 → 프레임 매핑 표를 두고, 실패하면 기존 함수를 호출한다.
  - `btn_primary_normal` → `btn.primary.normal`
  - `panel` → `panel.main`
  - `tab_on` → `tab.on`
- 최소 폭보다 좁으면 sm 프레임으로 바꾸고, 그래도 좁으면 코드 스킨을 쓴다.
- @3x 로드가 실패하면 @1.5x를 다시 시도한다. 둘 다 실패하면 코드 스킨을 쓴다.
- 아이콘이 없으면 기존 기호 텍스트로 대체한다.
- 등급 프레임이 없으면 현행 `drawSlot`(rarity.js 색)을 쓴다.
- 배경 JPG가 없으면 현행 backdrop을 쓴다.
- disabled 라벨: #D5D9E2 + 외곽선 #0A1226. primary 위 라벨은 #1A1406.

## 6. 로고(확정: Hahmlet Black + emblem_a, `assets/brand/`)
- 파일:
  - `logo_h@3x/@1.5x`, `logo_stack`, `logo_wordmark`, `logo_wordmark_title`(+ `.svg`)
  - `logo_small_h{96,64,32}`, `logo_mono_white`, `logo_mono_gold`, `logo_emblem`
  - `favicon_{16,32,48}.png`, `favicon.ico`, `app_icon_{180,512}.png`, `og_image.jpg`(1200x630)
- 사용 규칙은 `assets/brand/brand_spec.json`에 있다(클리어스페이스, 최소 크기, 금지 사항).
- 브라우저: `<title>레전드리 워</title>`, `link rel=icon`(favicon.ico, favicon_32.png), `apple-touch-icon`(app_icon_180.png), `og:image`(og_image.jpg).
- 서체를 바꾸려면 `WM_FONT=<경로>[:wght] python docker/gemini/brand_logo.py build ...`로 만들고 최상위 파일을 교체한다(파일명 동일).
