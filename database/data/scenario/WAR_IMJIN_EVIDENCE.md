# 시즌 전쟁 imjin 시나리오 근거 문서

작성: 송서사 (2026-11-04). 대상: `database/data/war/imjin.json`. scenario.code 는 DB·FE 키 보호로 imjin 을 유지하고, 표시명은 "1592년 조선 시즌"으로 바꿨다(표시 문자열에서 '임진', '임진왜란' 제거). 게임 문자열에는 근거 표기가 없고 이 문서에만 둔다. 좌표는 현대 시가지 중심 근사값이다.

## 변경 요약
- map_view: lon 124.0~131.2, lat 32.8~43.0 (한반도 전체 + 제주 + 쓰시마).
- 제거: nagoya(히젠 나고야, 일본 수도). 일본 수도는 쓰시마(kind=capital)로 이동. 조선 수도는 한양 하나.
- 추가 7곳: hoeryong, haeju, gangneung, daegu, jinju, naju, jeju. 기존 code 10개(hanyang, gaeseong, pyeongyang, uiju, hamheung, chungju, jeonju, gyeongju, busan, tsushima) 불변.
- 현재 영토 17곳: 조선 시작 15, 일본 시작 2(부산 상륙 거점, 쓰시마).
- 링크: 24개. 제주는 나주(전라 남해안)에 연결. 전체 연결 그래프.

## 영토 근거
| code | 이름 | 시작 | 근거 수준 | 비고 |
|---|---|---|---|---|
| hanyang | 한양 | 조선(capital) | confirmed | 조선 도읍 |
| gaeseong | 개성 | 조선 | confirmed | 1592.5 선조 북상 경로 |
| pyeongyang | 평양 | 조선 | confirmed | 1592.6 일본군 점령 |
| uiju | 의주 | 조선 | confirmed | 선조 피난지 |
| hamheung | 함흥 | 조선 | accepted | 함경도 거점, 가토 군 진출 |
| hoeryong | 회령 | 조선 | accepted | 함경도 북단, 1592 가을 반란 서술은 verify로 다루지 않음 |
| haeju | 해주 | 조선 | accepted | 황해도 거점 |
| gangneung | 강릉 | 조선 | accepted | 강원도 동해안 |
| chungju | 충주 | 조선 | confirmed | 탄금대 전투 1592.5.28 |
| daegu | 대구 | 조선 | accepted | 경상도 내륙 |
| gyeongju | 경주 | 조선 | accepted | 경상도 동남 |
| jinju | 진주 | 조선 | confirmed | 1592.10 1차 진주성 |
| busan | 부산 | 일본 시작 | confirmed | 1592.4.13 상륙. 조선 도시이며 게임 시작 소유를 상륙 거점으로 둔 선택 |
| jeonju | 전주 | 조선 | confirmed | 호남 거점 |
| naju | 나주 | 조선 | accepted | 전라도 남해안 방면 |
| jeju | 제주 | 조선 | accepted | 제주목. 조선의 섬 영토 |
| tsushima | 쓰시마 | 일본(capital) | confirmed | 소 가문의 영지, 일본군 중계 거점 |

## 확인 필요
- 부산 시작 소유: 일본으로 두었으나 조선 영토로 바꾸는 선택도 가능(박백엔/임밸런 판단). 일본이 2곳 영토만으로 시작하므로 밸런스는 임밸런 조정 대상.
- nagoya 참조: 데이터에서는 `database/data/war/imjin.json` 에만 영토 code 로 있었다. `resources/js/game/scenes/War.js`(주석 2곳)·`docs/SEASON_WAR_DESIGN.md`·`public/assets/manifest.json`·`regional_manifest_fragment.json`·`docker/gemini/world_map_regional_fragment.py`(기준점 목록 문구)·`hero_fact_checks.json`(오다 노부나가 출생지 서술)은 지도 에셋 기준점 문구나 주석일 뿐 영토 code 참조가 아니다. 기존 시즌 DB 에 nagoya 영토 행이 남아 있으면 박백엔이 처리.
- 수도가 쓰시마인 설정은 게임 규칙(국가당 수도 1)을 맞추기 위한 선택이다.
