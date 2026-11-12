# 서드파티 에셋 고지 — RPG Maker MV 'Outside' 타일셋

- **상태: 라이선스 미확인. 개발 프로토타입 한정. 배포(외부 공개·스토어·상용) 전 반드시 교체 또는 권리 확인 필요.**
- RPG Maker 기본/동봉 리소스는 일반적으로 "해당 RPG Maker 제품으로 만든 게임에서만" 사용 가능한 조건이 붙을 수 있다. 이 프로젝트는 RPG Maker 엔진을 쓰지 않으므로(Phaser) 사용 조건 충족 여부는 **법무/권리자 확인 필요**.
- 사용 결정: 사용자 지시(2026-11-01, 사용자가 책임지고 사용 결정)로 개발용 시험 적용.

## 출처
- 원본 경로(로컬 다운로드): `D:\다운로드\MapPack-Village1\MapPack-Village1\img\tilesets\`
  - Outside_A1.png, Outside_A2.png, Outside_A3.png, Outside_A4.png, Outside_A5.png, Outside_B.png, Outside_C.png, tileset-shadow.png
  - 같은 패키지 `data\Tilesets.json`(tileset id 1 "Outside", mode 1, D 슬롯 = tileset-shadow)
- 배포처·저작자·라이선스 문서: 패키지에 포함되어 있지 않음(확인 필요). 원본 파일은 수정하지 않고 그대로 복사함.

## 사용 범위(격리)
- 이 폴더의 파일은 `public/assets/manifest.json`에 등록하지 않는다(안아트 manifest와 분리).
- 참조 코드: `resources/js/game/data/rmTileset.js`(설정), `resources/js/game/data/rmPrefabs.js`(여러 칸 프리팹 조각 정의), `resources/js/game/fx/rmAutotile.js`(오토타일 합성), `resources/js/game/fx/RmGround.js`(렌더), `fx/PropLayer.js`의 `buildRm`(소품), `assets.js`의 `queueRmTiles`.
- 스위치: `resources/js/game/settings.js`의 `terrainStyle`(기본 `'rm'`). `'legacy'`로 바꾸면 이 에셋을 로드·사용하지 않고 기존 64px 타일로 렌더(즉시 롤백).
- 교체/삭제 절차: 이 폴더 삭제 → `terrainStyle` 기본값 `'legacy'` → 위 참조 코드(rmTileset.js·rmAutotile.js·RmGround.js 및 분기) 제거. 시트가 없으면 코드는 자동으로 legacy로 폴백한다.
- `tileset-shadow.png`는 복사만 했고 현재 코드에서 사용하지 않는다.
