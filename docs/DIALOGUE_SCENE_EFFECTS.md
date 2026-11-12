# 대사 줄 단위 장면 효과 (DIALOGUE_SCENE_EFFECTS)

작성: 윤프론(FE), 2026-11-03. 구현: `resources/js/game/dialogue/lineFx.js`.
적용 화면: `scenes/Dialogue.js`(스테이지 전·후 컷신, 튜토리얼, 프롤로그), `ui/BattleDialogue.js`(전투 중 이벤트 대사 오버레이).

## 원칙

- 모든 필드는 **선택**이다. 필드가 없으면 기존과 똑같이 동작한다.
- 효과는 그 줄이 **처음 화면에 나올 때 1회**만 재생된다. 같은 줄의 다음 쪽으로 넘기거나 화면을 회전·리사이즈해도 다시 재생되지 않는다.
- 값이 틀리거나 키가 없으면 그 효과만 건너뛰고 대사는 그대로 진행된다. 콘솔에는 키별로 `console.warn`이 1회 찍힌다.
- 스킵 버튼, ESC, 마지막 줄 종료, 재배치 때는 암전 덮개를 투명하게 되돌리고 화면 흔들림을 즉시 멈춘다. 끝난 뒤에 효과가 남지 않는다.
- 설정에서 효과를 최소로 했거나(fxLevel 2) 즉시 모드(빠른 진행·스킵 중)이면 shake와 flash는 생략된다. fade는 애니메이션 없이 최종 상태로 바로 바뀐다.

## 필드

줄 객체(`lines[]`의 각 항목, `speaker`/`expr`/`text`와 같은 수준)에 아래 필드를 쓴다.

| 필드 | 값 | 동작 | Dialogue 씬 | 전투 대사 |
|------|-----|------|:---:|:---:|
| `sfx` | audio 슬롯 키 문자열 (예: `"sfx_battle_clash"`) | 줄이 나올 때 효과음을 1회 재생한다. 슬롯이 없으면 생략하고 warn 1회. | O | O |
| `shake` | `true`(= `"medium"`) / `"light"` / `"medium"` / `"heavy"` | 화면 흔들림. light 150ms, medium 260ms, heavy 420ms. | O | O |
| `bg` | 배경 논리 키 `bg.<set>.<name>` (예: `"bg.imjin.fortress"`) | 배경을 크로스페이드로 바꾼다. 이후 줄에도 유지된다. manifest에 없는 키면 현재 배경을 유지하고 warn 1회. | O | X (배경 층이 없어 무시, warn 1회) |
| `fade` | `"out"` / `"in"` / `"flash"` | out: 0.6초 동안 배경과 초상화가 검게 어두워지고, 이 줄 동안 유지된다. in: 검은 화면에서 0.6초 동안 밝아진다. flash: 흰 섬광(0.26초). | O | O |
| `blackout` | `true` / `false` | true면 이 줄 동안 배경과 초상화를 즉시 검게 가린다. 대사 패널과 캡션은 보인다. 암전 위 내레이션에 쓴다. | O | O |

### 덮개 범위와 해제

- 암전 덮개는 **배경과 초상화 위, 대사 패널·이름표·캡션·버튼 아래**에 놓인다. 검은 화면에서도 글자는 읽힌다.
- `fade:"out"`과 `blackout:true`는 **그 줄에서만** 유지된다. 다음 줄에 `fade`/`blackout`이 없으면 0.3초 동안 원래 화면으로 돌아온다.
  - 여러 줄 동안 계속 어둡게 하려면 각 줄에 `"blackout": true`를 쓴다.
  - 암전 뒤 밝아지게 하려면 다음 줄에 `"fade": "in"`을 쓴다.
- `fade`와 `blackout`이 함께 있으면 `blackout`이 우선한다.

## 예시

```json
{ "speaker": "caption", "text": "그날 밤, 진주성.", "blackout": true },
{ "speaker": "caption", "text": "성벽 아래로 횃불이 늘어섰다.", "fade": "in", "bg": "bg.imjin.fortress", "sfx": "sfx_battle_rumble" },
{ "speaker": "hero:kim_si_min", "expr": "angry", "text": "성문을 지켜라!", "shake": "heavy", "sfx": "sfx_battle_clash" },
{ "speaker": "shiori", "text": "…폐하, 그 안까지만.", "fade": "flash" }
```

## 사용 가능한 값 참고

- `sfx`: `public/assets/audio/manifest.json`의 slots 키. 예: `sfx_battle_clash`, `sfx_battle_rumble`, `sfx_battle_roar`, `sfx_battle_charge`, `sfx_battle_gallop`, `sfx_battle_arrow`, `sfx_battle_fall`, `sfx_fire`, `sfx_hit_crit`, `sfx_hit_normal`, `sfx_skill_cutin`, `sfx_defeat`, `sfx_victory`.
- `bg`: `public/assets/manifest.json`의 `bg.<set>.<name>` 키. 예: `bg.archive.hall`, `bg.imjin.fortress`, `bg.imjin.fleet_dawn`. 장면 단위 배경(`scenes[].bg`)과 같은 키 체계를 쓴다.

## 데이터 경로와 제약

- **Dialogue 씬**: `resources/js/game/data/dialogue/*.json` 줄 객체를 그대로 읽으므로 필드를 쓰면 바로 적용된다. 원본은 `database/data`(송서사)이고 `sync_dialogue_data.mjs`로 복사한다.
- **전투 대사(story_dialogue 이벤트, 서버 `app/Game/BattleStory.php`)와 전투 중 `say` cue(`app/Game/Cues.php`)**: 줄 출력 화이트리스트(`speaker`/`expr`/`text`/`is_invented`) 외에 `sfx`/`shake`/`bg`/`fade`/`blackout`을 `BattleStory::lineFx`가 검증해 통과시킨다(2026-11-03). 허용 값: `sfx` 소문자·숫자·밑줄 1~48자, `shake` true/light/medium/heavy, `bg` `bg.<set>.<name>`(64자 이하), `fade` out/in/flash, `blackout` bool. 값이 틀린 필드는 그 필드만 서버가 버리고 대사는 그대로 나간다. `bg`는 전투 대사에 배경 층이 없어 FE가 무시한다. FE(`ui/BattleDialogue.js`)는 이미 받을 준비가 되어 있다.
- 기존 대사 JSON은 수정하지 않았다. 필드를 실제로 넣는 작업은 송서사가 한다.
