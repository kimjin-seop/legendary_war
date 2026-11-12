# ch23 연합국·바이킹 제안 근거와 서가 칩 산정 (송서사, 2026-11-04)

대상: `database/data/ch23_alliance_viking_roster_proposal.json`. 전원 기존 코드 재사용(기존 20 / 신규 0).

## 칩 산정 (변경 전)
shelf_map_meta ch23 heroes: 아군 3(윌리엄·오도·피츠오스번) + 에드가 1, 적 2(해럴드·거스). 진영별 10명이 되지 않았다. 스테이지 적 대표 합산 여부는 StageMapView 로직 확인이 필요(앱 코드 미수정).

## 변경 (메타 JSON 두 사본: database/data, resources)
- heroes: 연합국(노르망디·브르타뉴·프랑스 지원) 10명 `companion`(윌리엄 1세 `key`·`leader`), 바이킹 10명 `enemy`(하랄 하르드라다 `leader`).
- 해럴드·거스·에드가는 `heroes_pending`으로 이동(코드 유지, 대사·스테이지 불변). 잉글랜드 진영은 별도 목록 제안 가능.
- 윌리엄 코드는 메타 `william_i`(영웅), 로스터 `npc_william_i` — 칩 연결 시 확인 필요.

## 근거 수준
NORMAN_VIKING_ROSTER_EVIDENCE.md 와 동일(하랄·토스티그·윌리엄·오도·피츠오스번·로베르 confirmed, 스튀르카르·하콘 이바르손 verify, 나머지 accepted).
시대 주의: 하랄 하르드라다·토스티그는 1066.09.25 스탬퍼드 브리지에서 전사했고 헤이스팅스(10.14) 이전이다.

## 사람 확인 필요
메타 `heroes_pending` 이 칩에 노출되는지, 바이킹이 헤이스팅스 스테이지에 직접 등장하는지(현재 s1만).

## 출처
- https://en.wikipedia.org/wiki/Battle_of_Stamford_Bridge , https://en.wikipedia.org/wiki/Battle_of_Hastings
