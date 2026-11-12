# ch20 오다 연합·다케다 제안 근거 + 신겐 동일인 여부 (송서사, 2026-11-04)

대상: `database/data/ch20_oda_takeda_roster_proposal.json`. 주인공=오다 노부나가 막하 → 오다 연합=아군, 다케다=적. 오다 연합 기존 9 / 신규 1(시바타 가쓰이에), 다케다 기존 5 / 신규 5.

## 신겐과 가쓰요리는 동일인물인가
아니다. 다케다 신겐(하루노부, 1521~1573)은 아버지, 가쓰요리(1546~1582)는 아들이다. 신겐은 1573년 사망했고 나가시노(1575) 지휘자는 가쓰요리이다. 대사(`ch20_nagashino.json`)의 "선대께서 이룬 가문" 한 줄이 이미 이 관계를 반영한다.
조치: shelf_map_meta.json ch20 칩 목록에서 `takeda_shingen`을 제거하고 `oda_nobunaga`, `npc_takeda_katsuyori`에 `leader: true`를 추가(두 사본 database/data, resources 모두). 스테이지 데이터(stages_ch20_*)·대사·npc_roster에는 신겐 참조가 없음을 확인했다. 남은 노출처: heroes.json 의 `takeda_shingen` 항목(일반 영웅 풀로 존재, 서가와 무관), hero_tips.json 과 hero_native_names.json(생성물/이름표, 칩에서 제거되면 미사용).

## 근거 수준
- 오다: 노부나가·이에야스·사카이 다다쓰구 confirmed, 오쿠다이라 노부마사(구명 사다마사) confirmed, 혼다·히데요시·마에다·삿사·도리이·시바타 accepted.
- 다케다: 가쓰요리·바바·야마가타·나이토·사나다 노부쓰나·마사테루·쓰치야 confirmed(나가시노 전사), 하라 마사타네 accepted, 아마리 노부야스 verify, 다케다 노부카도 accepted.
- 제외/보류: 사쿠마 노부모리·니와 나가히데·사카키바라 야스마사(참전 세부 verify), 아나야마 노부타다(불참 전승), 오야마다 노부시게(퇴각 관련 서술 verify).

## 사람 확인 필요
철포대 규모·3단 사격은 학설 논쟁, 단정 금지. 마에다·삿사의 철포대 직책, 사다마사/노부마사 코드 통일.

## 출처
- https://ko.wikipedia.org/wiki/나가시노_전투 , https://en.wikipedia.org/wiki/Battle_of_Nagashino (재열람 못함)
