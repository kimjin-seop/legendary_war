# 서드파티 에셋 고지 — Unity 32px TileMap

- **상태: 라이선스 미확인. 개발 프로토타입 한정. 외부 공개·스토어·상용 배포 전 반드시 권리 확인 또는 교체 필요.**
- 출처: 사용자 제공(2026-11-01). 원본 로컬 경로 `D:\다운로드\Map (1)\Map\` (TileMap.png, TileMap.png.meta, TileMap_0~29.asset, StageMap.prefab). 배포처·저작자·라이선스 문서는 패키지에 없음 — 확인 필요.
- 원본 파일은 수정하지 않고 `TileMap.png`만 그대로 복사함(320x96, 32x32 타일 10열x3행 = 30칸).

## 원본 Unity 설정(TileMap.png.meta 실측)
- spriteMode 2(Multiple), 32x32 셀 30개(TileMap_0~29), spritePixelsToUnits 32, filterMode 0(Point).
- 스프라이트 번호: 0행(이미지 위) 0~9, 1행 10~19, 2행 20~29 — Phaser spritesheet 프레임 번호와 같다.
- 충돌(TileMap_N.asset m_ColliderType): None = 2,3,4,5,10~14 / Sprite = 나머지. 이 게임의 이동 판정은 서버 지형이 결정하므로 FE 는 시각 참고로만 기록(`data/unityTileset.js` U32_COLLIDER).

## 사용 범위
- 참조 코드: `resources/js/game/data/unityTileset.js`(타일 의미·지형 매핑), `resources/js/game/fx/UnityGround.js`(렌더), `fx/RmGround.js`(진입점 분기), `assets.js`(로드), `settings.js`(`terrainStyle` 기본 `'unity32'`).
- manifest: `public/assets/manifest.json` 항목 `tileset.unity32`(등록 기록용, 로드는 assets.js 가 직접 수행).
- 롤백: 콘솔 `settings.set({terrainStyle:'rm'})` 또는 `'legacy'` 후 새로고침. 삭제 시 이 폴더 + 위 두 신규 파일 제거, settings 기본값 변경.

## 2026-11-01 육상 타일 교체(안아트)
- `TileMap.png` 의 육상 인덱스(2~4, 7~29)를 자체 절차 생성 타일로 교체했다. 0·1·5·6(물·판자·해안)은 원본 픽셀 그대로. 2·3 은 테두리 1px 만 원본 픽셀(기존 전이 타일과 이음새 호환).
- 원본 사본: `TileMap.png.bak-tile-20261101`. 생성기: `docker/gemini/land_tiles_build.py`. 명세: `/assets/tiles/land_set/ls_spec.json`(replaced_in_place).
