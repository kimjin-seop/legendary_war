# UI 디자인 시스템 (시험 단계, v0.1 — 2026-11-01)

단일 출처: 프롬프트·팔레트 상수는 `docker/gemini/style_guide.mjs`의 `UISKIN_*`, 후처리는 `docker/gemini/pp_ui.mjs`. 이 문서는 사람이 읽는 사양이다. 수치가 서로 다르면 `style_guide.mjs`를 따른다.
이 문서는 `public/assets/ui/design_spec.json`(v1)을 대체하지 않는다. 값이 겹치는 부분(팔레트·모션)은 이 문서에 맞춰 v2로 갱신하자고 제안한다. 단 `rankBorder`(N/R/SR/SSR)는 구 체계이므로 C/B/A/S로 바꿔야 한다(§6).

---

## 0. 감사 요약(현재 UI가 그려지는 방식)
- 스킨: `resources/js/game/ui/skin.js`가 런타임에 Graphics로 9-slice 텍스처를 굽는다(S=3). 구성은 그라데이션, 1~2.5px 금선, 코너의 L자와 마름모다. 버튼 3변형(primary·secondary·danger) x 5상태가 이미 있다. 상태는 갖춰져 있지만 재질감이 없다. 금속 베벨, 문양, 두께감, 광택 하이라이트가 없어서 "벡터로 그린 임시 UI"처럼 보인다.
- 이미지 에셋 연결 상태: `ui/icons/*.png` 27종과 `ui/deco/*`(frame_corner·ribbon_end·divider)은 manifest에 있다. 하지만 `icon()` 호출은 Lobby 2곳(gold)뿐이다. deco는 코드 어디에서도 쓰지 않는다.
- 로더 제약(FE 적용 시 필수):
  - `assets.js`는 `ui.*` 키를 이미지로 로드하지 않고 건너뛴다(JSON 스펙용 예약).
  - `icon|deco|tile|unit|fx` 접두 키에는 NEAREST 필터를 강제한다. 128px 일러스트 아이콘을 22~32px로 줄이면 계단 현상과 반짝임이 생긴다.
- 타이포: Pretendard(OFL) Regular·Bold 서브셋 1종만 쓴다. 제목용 서체가 없고 숫자용 비트맵 폰트도 없다.
- 사운드: 코드가 `sfx_ui_hover`를 호출하지만 오디오 manifest에 없다(무음). UI 효과음은 tap·confirm·cancel 3종뿐이다.
- 화면 전환: 카메라 페이드나 와이프가 없고 `scene.start`로 즉시 바뀐다.

### 인디 느낌의 원인(체감 효과가 큰 순서)
| # | 원인 | 위치(코드 근거) | 처방 |
|---|---|---|---|
| 1 | 타이틀·로비에 배경 아트·로고가 없다. 마름모 코드 패턴 위에 시스템 텍스트를 올렸고 "SRPG PROTOTYPE" 문구가 그대로 보인다 | `Title.js` addBackdrop, makeText 3줄 | 키아트 배경 + 로고(사람 디자인) + 비네팅, 로비 배경 1장 |
| 2 | 버튼·패널이 코드 벡터 스킨이라 재질·문양·두께가 없다 | `skin.js` drawButton/drawPanel | 이미지 9-slice 스킨 아틀라스(§4, 시험 완료) |
| 3 | 상단 재화바와 전투 상단바가 단색 사각형에 1~2px 선이다. 설정·로그아웃이 텍스트 버튼이다 | `Lobby.js:90-101`, `Battle.js:441-459` | 상단바 스트립 스킨 + 재화 캡슐(아이콘·수치·+) + 원형 아이콘 버튼 |
| 4 | 하단 탭바가 텍스트만 있고 아이콘·알림 점·선택 연출이 없다 | `Tabs.js`, `Lobby.js:77` | 탭 스킨 on/off + 메뉴 아이콘 + 빨간 점 배지 + 선택 탭 상승 2u |
| 5 | 목록 행·토스트·가챠 카드 뒷면·초상 대체가 rectangle과 stroke로 되어 있다(가챠 뒷면은 "?" 글자, 초상이 없으면 이니셜 사각형) | `widgets.js listRow`, `Toast.js`, `Lobby.js:496-520` | list row·toast pill·card back 스킨 |
| 6 | 아이콘 PNG가 있어도 거의 쓰지 않는다. 쓰더라도 NEAREST 축소로 거칠다. 기호 문자(★ ▲ ! ⓘ)로 아이콘을 대신한다 | `assets.js pixelKeys`, `widgets.noteText` | UI 아이콘은 LINEAR + 미리 축소한 64/32 파일, 기호 문자는 아이콘으로 교체 |
| 7 | 타이포 위계가 약하다. 고딕 1종에 굵기와 외곽선만 다르다. 제목·숫자 전용 서체가 없다 | `theme.js FONT_FAMILY` | 제목 세리프(§3) + 숫자 비트맵 폰트 + 타이포 스케일 고정 |
| 8 | 등급 표현이 약하고 체계가 맞지 않는다. 슬롯은 선과 L자 코너뿐이다. spec은 N~SSR(보라 SR), 코드는 C~S다 | `skin.js drawSlot`, `design_spec.json rankBorder` | 등급 프레임 이미지 4종(S는 장식·광채 추가), spec 정리 |
| 9 | 전투 HUD가 반투명 단색 패널에 1px 선이다. 턴 표시는 회전 사각형이고 버튼은 텍스트 라벨이다 | `FlatPanel.js`, `Battle.js:444-487` | 얇은 HUD 전용 스킨(panel.hud) + 아이콘 버튼(일시정지·로그·전체 보기·맞춤) + 턴 배지 |
| 10 | 모션·사운드 피드백이 비어 있다. 화면 전환이 없고 hover 효과음은 무음이다. 팝업·탭·보상 효과음도 없다 | `motion.js`, audio manifest | §8 모션 규칙, §9 효과음 목록 |
| (기타) | 간격과 모서리가 화면마다 하드코딩되어 있다(m=16, 8, 12, 14, 24 혼재). 빈 상태와 로딩이 텍스트만 있다 | 각 씬 | 8u 그리드 토큰, 빈 상태 일러스트 1종, 스켈레톤 스킨 |

화면별 메모:
- 타이틀: 배경과 로고가 없다(#1).
- 로그인(Auth): DomInput은 CSS 테두리만 있다. 입력 스킨(§5)과 HTML 입력의 색·반경을 맞춘다.
- 로비 5~6탭: 상단바(#3), 탭(#4).
- 영웅 목록·상세: 슬롯 등급 프레임(#8), 능력치 행.
- 편성·출격: 빈 슬롯은 slot_C에 alpha 0.5와 "빈 슬롯" 텍스트다. 점선 테두리와 "+" 아이콘으로 바꾼다.
- 방 매칭: 입력과 목록 행(#5).
- 전투 HUD: #9. 배너는 안내 배너를 리본형으로 바꾼다. 로그는 모달이다. 정보 카드와 초상화 카드는 PortraitCard의 graphics 12회 호출을 프레임 이미지로 대체한다.
- 결과 정산: 승리·패배 리본 배너와 보상 슬롯 연출이 없다.
- 가챠: 소환 배경, 카드 뒷면, 등급별 공개 연출이 없다(#5, #8).
- 설정·모달·토스트·대사 창: 모달 헤더 리본은 코드 버전이다. 토스트는 사각형이다(#5). 대사 창은 panel과 ribbon(코드)이고 이름표·넘김 표시 스킨이 필요하다.

---

## 1. 아트 디렉션(한 장 요약)
- 컨셉: "역사서 속 전장" — 깊은 남색 칠기(漆器)판에 금박 몰딩을 두른다. 동양 구름무늬와 서양 덩굴무늬는 모서리와 양 끝에만 절제해 쓴다. 중앙 면은 비워 정보를 담는다.
- 무드 키워드: 장중함, 정돈, 수집 가치(금·보석), 읽기 쉬움. 화려함은 S등급·가챠·승리에만 쓴다.
- 재질 규칙: 금속(금)은 왼쪽 위 광원으로 위·왼쪽을 밝게 하는 베벨을 준다. 남색 면은 매끈한 칠기에 위쪽 35% 광택을 넣는다. 보석은 청록만 쓴다(보라·분홍·자주 금지 유지).
- 장식 위계(과용 금지):
  - L3: 가챠·승리·S등급 — 보석, 광채, 파티클
  - L2: 모달·주요 패널 — 모서리 문양
  - L1: 버튼·탭 — 양 끝 마름모
  - L0: HUD·목록 행 — 얇은 금선만
- 금지: 특정 상용 게임의 고유 프레임 형태·로고·레이아웃 복제, 글자가 들어간 생성 이미지, 생성 이미지 안의 문장(紋章)·종교 상징.

### 톤 선택지(사람 결정)
| 안 | 바탕 / 장식 | 장점 | 단점 |
|---|---|---|---|
| A(권장, 시험본) | 남색 칠기 + 금박 | 기존 팔레트·아이콘(금 외곽선)·초상 카드와 즉시 정합. 시험 결과가 좋다 | 판타지 RPG에 흔한 조합이라 차별성이 약하다 |
| B | 흑단(먹색) + 주칠(朱漆) + 금 | 동양 사극의 무게감이 강하다 | 유럽·중동 영웅과의 정합이 약하다. 적군 색(빨강)과 겹친다 |
| C | 고지도 양피지 + 청동 + 남색 잉크 | 타이틀 "전장의 지도"와 정합하고 차별성이 크다 | 밝은 면이 넓어 대비를 다시 설계해야 한다. 전투 HUD에는 부적합하다(HUD는 A 유지) |

---

## 2. 팔레트(시험본 기준, 대비비 = WCAG 상대휘도 계산값)
| 역할 | 값 | 비고 |
|---|---|---|
| navyDeep | #0B1328 | 최하단 배경 |
| navy | #101C3A | 패널 면 |
| navyRaised | #172750 | 카드·탭·보조 버튼 면 |
| lineInner | #3C5390 | 안쪽 선 |
| goldLight / gold / goldDark / goldShadow | #F3DC8E / #D9B45A / #8A6A1E / #5C4410 | 몰딩 4단 |
| textOnGold | #1A1406 | 금 버튼 라벨. gold 위 9.3:1 |
| text.primary | #F4EEDC | navy 위 15.2:1 |
| text.secondary | #A9B4CF | navy 위 7.4:1 |
| text.disabledOnSkin | #D5D9E2 + 외곽선 #0A1226 | 비활성 버튼 라벨. 측정값: primary disabled 면(#5B6072) 위 4.4:1(외곽선 필수, 본 생산에서 면을 조금 더 어둡게 해 4.5 이상), secondary disabled(#1E212C) 위 11.3:1. 시험 QA에서 #8A93A8은 읽히지 않음. textOnGold는 primary 면(#D6B374) 위 9.2:1 |
| crimson / crimsonLight | #9E2B25 / #D9694F | danger 면(파생) |
| 등급 C/B/A/S | #8B97A8 / #2FB5A6 / #B06AD8 / #F0B23C | `rarity.js` 단일 출처. A 보라는 코드 프레임에만 쓴다 |

## 3. 타이포그래피
| 용도 | 후보 | 라이선스(확인 필요) | 비고 |
|---|---|---|---|
| 본문·UI | Pretendard(현행) | SIL OFL 1.1(이미 기록됨) | 유지 |
| 제목·화면명·리본 | Noto Serif KR / Gowun Batang / Hahmlet / 나눔명조 | 모두 OFL로 알려짐 → **공식 배포처에서 확인 필요** | 한글 세리프는 용량이 크다(수 MB). 실제 사용 글자로 서브셋을 만들어야 한다 |
| 숫자(HUD·데미지) | 비트맵 폰트(0-9, +-%/, 금·백 2종) | 자체 제작 → 문제 없음 | Phaser BitmapText. Canvas Text는 tabular-nums를 지원하지 않는다 |
| 로고 | 사람 디자이너 제작 권장 | — | 생성 모델은 한글 로고 글자를 망가뜨린다 |

스케일(unit): display 40 / h1 28 / h2 20 / body 16 / caption 13 / numHud 22 / numDamage 36(크리 48). 줄간격은 1.4~1.5다. 버튼 라벨: lg 20, md 17, sm 14, 모두 Bold.

## 4. 스킨 조각 세트(9-slice·아틀라스)
### 4.1 규칙
- 마스터는 1 unit = 3px(@3x, 기존 S=3과 같음)이다. 저해상도용 @1.5x 아틀라스를 함께 만든다. slice 값은 아틀라스마다 그 배율로 기록한다.
- 늘림 모드:
  - `9`: 패널·모달·목록 행. 모서리는 원본 크기를 유지하고 오브젝트 전체에 1/3 스케일을 준다.
  - `3h`: 버튼·탭·바. 가로만 늘린다. 높이는 표시 높이에 맞춰 균일 스케일하므로 slice t=b=0이다.
  - `image`: 늘리지 않는 조각(탭 마름모 등).
- 늘어나는 구간은 생성 후 `pp_ui.mjs`가 "국소 변화 없는 구간"을 자동으로 측정해 12px로 재표본한다. 그래서 무늬가 반복되거나 끊기지 않는다.
- 상태는 생성하지 않고 파생한다. 이렇게 해야 형태가 100% 같다.
  - hover: 명도 x1.12, 글로우는 별도 조각
  - pressed: x0.78, FE에서 1u 하강
  - disabled: 회색조 x0.45
  - selected: hover와 같은 조각 + 마름모 강조(FE)
  - danger: secondary 남색 면을 진홍으로 치환한 파생
- 최소 크기:
  - 버튼(3h): 최소 폭 = (l+r)/frameH x 표시높이. primary는 약 1.1h, secondary는 약 0.76h다.
  - tab.on: 약 1.6h. 이보다 좁으면 모서리가 눌린다.

### 4.2 키 규칙
- 텍스처 키는 `uiskin`이다.
  - `ui.` 접두를 쓰지 않는다. 로더가 건너뛴다.
  - `icon|deco` 접두를 쓰지 않는다. NEAREST가 강제된다.
- 프레임 이름: `<컴포넌트>.<변형>.<상태>`
  - 예: `btn.primary.normal`, `btn.secondary.pressed`, `btn.danger.disabled`, `btn.glow`, `panel.main`, `tab.on`, `tab.off`, `tab.gem`
  - 본 생산 예정: `btn.icon.round.*`, `btn.ghost.*`, `panel.sub`, `panel.hud`, `header.ribbon`, `row.list.*`, `input.field.*`, `bar.track`, `bar.fill.<hp|exp|gold|cost>`, `badge.dot`, `badge.pill`, `topbar.strip`, `currency.capsule`, `frame.rank.<c|b|a|s>`, `card.back`, `toast.pill`, `dialog.box`, `dialog.nameplate`
- manifest: `key: atlas.uiskin`, `type: atlas`, `path/json`, `variants{1.5x}`, `unitPx`, `frames{size, slice, sliceMode, anchor}`, `generator`, `prompt_ref`, `license`, `provenance`, `qa`, `verify`. 시험본은 `public/assets/ui_trial/manifest_fragment.json`에 있다.

### 4.3 Phaser 로딩(권장)
- 프리로드 1회: `load.atlas('uiskin', png, json)`. u≥2(1440p 이상)이면 @3x, 그 외는 @1.5x를 쓴다.
- 필터는 LINEAR다(pixelKeys에 걸리지 않게 키를 둔다).
- 아틀라스 JSON의 프레임별 `slice`는 Phaser가 `frame.customData.slice`로 보존한다.
- nineslice 생성: `scene.add.nineslice(x, y, 'uiskin', frame, w*k, h*k, l, r, t, b).setScale(1/k)`. k = 아틀라스 unitPx(3 또는 1.5)다. 3h 모드는 `k = frameH / h`로 높이를 맞춘다.
- 용량(시험본): @3x 1024x649 PNG 약 691KB, @1.5x 약 203KB. 본 생산은 아틀라스 2장(공용 / 가챠·결과 전용)으로 나누고 화면 진입 시 로드한다.

## 5. 컴포넌트 사양(요약)
| 컴포넌트 | 크기(unit) | 상태 | 비고 |
|---|---|---|---|
| Button primary/secondary/danger | lg 56 / md 44 / sm 32(sm은 히트 영역을 44로 확장) | normal·hover·pressed·disabled(+selected) | 라벨: primary는 textOnGold, 나머지는 text.primary에 외곽선 2px |
| Ghost button | md 44 | 텍스트 + hover 시 하단 금선 2u | 코드로 구현, 이미지 불필요 |
| Icon button(원형) | 44 / 56 | 4상태 | 금 링 + 남색 면, 아이콘 28/36 |
| Tab | h 52~64 | on·off(+hover 밝기) | on은 2u 상승 + 마름모. 빨간 점 배지는 우상단 |
| Panel main / sub / hud | 자유 | — | main은 모달·주요 패널, sub는 카드(장식 L1), hud는 전투(L0, 반투명 92%) |
| Modal header | h 44 | — | 리본(3h) + h1 |
| List row | h 56~72 | normal·hover·selected·disabled | 좌측 4u 금 띠는 selected일 때만 |
| Input | h 44 | normal·focus·error | DomInput CSS도 같은 색·반경으로 맞춘다 |
| Gauge | hud 14 / card 8 / map 4 | — | 감소 시 흰 잔상 400ms |
| Badge | dot 12 / pill h 20 | — | 빨강 #E04A4A + 흰 테두리 |
| Rank frame C/B/A/S | 슬롯 56/72/96 | — | 색 + 하단 점 개수(C1~S4, 색각 보조). S는 모서리 장식과 내측 광채 |
| Currency capsule | h 36 | — | 아이콘 28 + 숫자(tabular) + "+" 아이콘 버튼 |
| Divider·간격 | 8u 그리드(4/8/16/24/32) | — | 패널 안쪽 여백 16, 섹션 간격 24 |

터치·세이프에어리어: 실제 CSS 44px 이상(현행 MIN_TOUCH 유지). 세이프에어리어는 `L.safe`를 쓰고 상단바·탭바 배경만 화면 끝까지 칠한다.
해상도: 논리 좌표는 현행 unit(1080p에서 1u=1.5px)이다. 에셋은 @3x(4K까지 선명)와 @1.5x 두 벌이다.

## 6. 등급 프레임
- `design_spec.json` rankBorder(N/R/SR/SSR)는 폐기 대상이다. `rarity.js` C/B/A/S 색으로 통일한다.
- 생성 1장(공용 장식 프레임) + 코드 재착색 4색 + S 전용 장식 1장으로 만든다. 등급별로 따로 생성하지 않는다(형태 통일).

## 7. 아이콘
- 기존 27종은 유지한다(금 외곽선 셀 셰이딩). UI용은 64·32로 미리 축소해 LINEAR로 쓴다.
- 추가 필요(약 24종): back, close, plus, info, lock, check, mail, quest, notice, shop, inventory, ticket, shard, stamina(쓸 경우), log, fullview, fit, speed, auto, skip, filter, sort, edit, logout.

## 8. 모션 규칙(`motion.js` tween을 통해 쓰면 연출 끄기·스킵 설정이 자동 적용됨)
| 동작 | 시간 | 이징 |
|---|---|---|
| 버튼 hover | 90ms, scale 1.03 + glow | Sine.easeOut |
| 버튼 press | 60ms 하강 1u·어둡게 / release 120ms | Quad.easeOut |
| 팝업 열림 | dim 150ms + 패널 scale 0.92→1, 180ms | Back.easeOut(1.2) |
| 팝업 닫힘 | 120ms, scale 1→0.96 + fade | Quad.easeIn |
| 화면 전환 | 카메라 fade 160ms out / 200ms in(검정) | Linear |
| 탭 전환 | 본문 crossfade 120ms + x 8u 슬라이드 | Sine.easeOut |
| 토스트 | 아래→위 12u, 160ms in / 1.1s 유지 / 250ms out | Quad |
| 보상·획득 | scale 0.6→1.1→1, 240ms + 반짝임 | Back.easeOut |
| 반복 연출 | 초당 3회 이상 점멸 금지(현행 규칙 유지) | — |

## 9. 효과음 목록(안아트 오디오 범위, 청취 검수는 사람 확인)
| 키 | 상태 |
|---|---|
| sfx_ui_tap | 있음 |
| sfx_ui_confirm | 있음 |
| sfx_ui_cancel | 있음 |
| sfx_ui_hover | **코드에서 호출하지만 파일 없음**(생성 또는 호출 제거) |
| sfx_ui_tab, sfx_ui_popup_open, sfx_ui_popup_close, sfx_ui_error(거부·비활성 탭), sfx_ui_reward, sfx_ui_coin, sfx_ui_levelup, sfx_gacha_reveal_ab, sfx_gacha_reveal_s, sfx_ui_transition | 신규 |

## 10. FE 적용(윤프론) — 최소 인터페이스 변경
1. `assets.js`: manifest `type: 'atlas'`를 지원한다(`load.atlas(texKey, path, json)`, LINEAR). `uiskin`은 pixelKeys에 걸리지 않는다.
2. `skin.js`: `slice(scene, key, w, h, kind)` 시그니처를 유지한다. 내부에 기존 키 → 아틀라스 프레임 매핑을 둔다(`btn_primary_normal` → `btn.primary.normal`, `panel` → `panel.main`, `tab_on` → `tab.on` …). 아틀라스가 있으면 프레임의 `customData.slice`로 nineslice를 만들고, 없으면 현행 코드 스킨으로 폴백한다. `setSliceSize`는 3h 모드에서 높이 기준 스케일을 계산한다.
3. `Button.js`:
   - glow는 `btn.glow` 프레임을 쓴다(glowPad 24px@3x = 8u).
   - selected는 hover 프레임 + 테두리 강조로 처리한다.
   - disabled 라벨은 `#D5D9E2`에 외곽선을 둔다.
   - 아이콘 버튼 변형(`variant: 'icon'`, `icon` 키)을 추가한다.
4. `Tabs.js`: tab.on/off, 선택 탭 2u 상승, `tab.gem`(상단 중앙, anchor), 아이콘·배지 옵션을 넣는다.
5. `Panel.js`: panel.main. 리본 제목은 본 생산 `header.ribbon`이 나오기 전까지 현행을 유지한다. `FlatPanel`은 `panel.hud` 생산 후 교체한다.
6. 화면 우선순위:
   ① 공용 컴포넌트(Button·Tabs·Panel·Modal·Toast)
   ② 로비 상단바·탭바
   ③ 타이틀(배경·로고)
   ④ 가챠(카드 뒷면·등급 프레임·공개 연출)
   ⑤ 영웅 목록·상세·편성 슬롯
   ⑥ 전투 HUD
   ⑦ 결과 정산
   ⑧ 방·인증·설정·대사 창

## 11. 시험 생성 기록(2026-11-01, 이미지 호출 4회, 재시도 0)
| 조각 | 판정 | 근거 |
|---|---|---|
| btn.primary(4상태) | 통과(보완 권장) | 마젠타 잔여 0, 반투명 경계 분홍 32px(흰 바탕 x3 확대에서 육안 불가), 보라 0. 3h 늘림 80~480u에서 끊김 없음. sm(32u)에서는 테두리 비중이 커서 무겁다 → 본 생산에서 sm 전용 얇은 테두리 버전 1장 |
| btn.secondary / danger(파생) | 통과 | 잔여 0, danger는 호출 없이 파생. 진홍 톤이 적군 색과 구분됨 |
| panel.main(9-slice) | 통과 | 작게·넓게·높게 늘려도 변이 곧고 모서리 장식이 유지됨. 모서리 inset 42u라서 120u 미만 패널에는 과함 → `panel.sub`(장식 L1) 필요 |
| tab.on / off / gem | 통과(보완 권장) | 상단 마름모를 떼어 늘림 왜곡을 없앰. on의 모서리 문양이 넓어(최소 폭 1.6h) 390px 폭(74x56)에서 모서리가 약간 눌림 → 본 생산 프롬프트에 "모서리 문양 탭 폭의 15% 이내" 추가 |
| disabled 라벨 | 수정함 | #8A93A8은 회색 스킨 위에서 읽히지 않음 → #D5D9E2 + 외곽선 |

교훈:
1. 상태는 생성하지 않고 파생한다.
2. 프롬프트에 "중앙 무늬 금지, 변은 곧은 몰딩"을 넣으면 9-slice가 깨끗하게 나온다.
3. 늘림 구간은 평균 차이가 아니라 국소 변화로 측정해야 가는 금 문양을 놓치지 않는다.

## 12. 본 생산 범위·호출 추정(승인 필요)
| 묶음 | 기본 호출 | 비고 |
|---|---|---|
| 버튼 재확정(primary·secondary sm 얇은 판 포함) + 원형 아이콘 버튼 + 탭 재생성 | 4 | ghost·danger·상태는 파생 |
| 패널 sub·hud, 모달 헤더 리본, 목록 행, 입력, 토스트 pill, 대사 창 + 이름표 | 7 | |
| 상단바 스트립, 재화 캡슐, 게이지 트랙·채움 시트, 배지 시트 | 4 | |
| 등급 프레임(공용 1 + S 장식 1), 카드 뒷면 | 3 | 색은 코드 재착색 |
| 추가 아이콘 약 24종(4x4 시트 2장) | 2 | 참조 이미지 미사용 |
| 타이틀 키아트, 로비 배경, 가챠 소환 배경, 승리·패배 리본 배너 | 5 | 로고는 사람 제작 |
| **소계** | **25** | |
| 재시도 여유(약 40%) | +10 | |
| **합계(승인 요청)** | **약 35회** | 2라운드 잔여는 약 9회(장비 아이콘 24회 대기 건과 별도) |

효과음 신규 10종은 오디오 생성 스크립트로 별도 예산을 잡는다(청취 검수는 사람).

## 13. 본 생산 기록(2026-11-01, A안 확정)
- 생성: `gen.mjs uiskin`(RAW_DIR=`public/assets/ui_skin/raw`) 24회, 재시도 0. 시험 raw(btn_primary·btn_secondary·panel) 재사용. 후처리: `pp_uiskin.mjs`(시험용 `pp_ui.mjs`는 보존).
- 산출: `public/assets/ui_skin/atlas/ui_skin@{3x,1.5x}`(텍스처 키 `uiskin`, 83프레임), `ui_skin_gacha@{3x,1.5x}`(키 `uiskin_gacha`, 9프레임), `bg/{title,lobby,gacha}_{1920,1280}.jpg`, `icons/{64,32}/*.png`, QA `preview/qa_1~4_*.png`, `manifest_fragment.json`.
- 시험 보완 반영: sm 얇은 판(`btn.*.sm.*`), `panel.sub`(inset 15u)·`panel.hud`(17u, 면 알파 0.92), primary disabled 라벨 대비 5.08:1(자동 보정), tab.on 74x56 표시 확인(슬라이스 폭 비율 27%: 둥근 모서리+테두리 포함 측정값, 문양 자체는 작게 나옴).
- 파생 규칙 추가: row selected = hover + 좌측 4u 금 띠, input focus = 금 테두리만 밝힘, error = 금→진홍, 등급 프레임 = 무채색 1장 → C/B/A/S 재착색 + 하단 마름모 점, S 장식은 연결 성분 분리 후 모서리 재배치, 게이지 채움 = 은백 1장 × 역할색(cost는 보라 대신 청록 #3FC1B0, 또는 `bar.fill.base` + setTint).
- 맵 바깥 배경: `gen.mjs mapbg` 2회 → `pp_mapbg.mjs` → `ui_skin/map/map_outside_{512,256}.png`(반 칸 순환 교차 블렌딩, 평균 명도 30·표준편차 6), `map_edge@{3x,1.5x}.png`(9-slice), `map_fragment.json`.
