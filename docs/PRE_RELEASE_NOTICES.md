# 공개 전 확인 메모: 화면에서 뺀 고지 문구

법무 항목은 개발을 막지 않는다(HANDOFF.md 법무 메모 방침). 화면을 정리하면서 뺀 고지·면책 문구를 여기에 남긴다. 공개 전에 고지 위치(설정·크레딧·약관 화면 등)를 정한다.

| 날짜 | 원래 위치 | 문구 | 원천 | 비고 |
|------|-----------|------|------|------|
| 2026-11-02 | 서가 지도(캠페인 지도, StageMapView) 지도 오른쪽 아래, 영토를 칠한 캠페인에서만 표시 | 지도에 칠한 영역은 그 무렵의 대략적인 세력권이며, 실제 국경과는 다를 수 있습니다. | `resources/js/game/data/shelf_territories.json` `disclaimer_player`(데이터는 그대로 둠) | 사용자 요청으로 화면에서 제거. 표시 코드: `ui/StageMapView.js` updateTerritories(terrNote 비표시) |
| 2026-11-02 | 로비 영웅 상세 맨 아래 | 등급은 게임 내 희귀도와 전투 역할을 나타내며 인물의 역사적 평가와 무관합니다. | `scenes/Lobby.js` 하드코딩 | 화면 정리로 제거 |
| 2026-11-02 | 로비 영웅 상세 역사 섹션(pf.needs_verify 인물) | ※ 일부 내용은 사료 확인이 필요합니다(2차 자료 기반). | `scenes/Lobby.js` 하드코딩 | 화면 정리로 제거. needs_verify 데이터는 그대로 |

유지한 고지: 전장 지도 `© OpenStreetMap contributors` 크레딧(StageMapView·War). ODbL 표시 의무가 있어 지우지 않았다.

글꼴: 대사창 고운바탕(Gowun Batang, SIL OFL 1.1) — `public/fonts/dialogue/OFL.txt`·`README.txt`. 공개 시 크레딧/라이선스 화면에 표기 검토.
