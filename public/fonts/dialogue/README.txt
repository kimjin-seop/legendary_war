대사창 전용 글꼴 (2026-11-02 윤프론)

- 글꼴: 고운바탕 Gowun Batang Regular / Bold
- 저작권: Copyright 2021 The Gowun Batang Project Authors (https://github.com/yangheeryu/Gowun-Batang)
- 라이선스: SIL Open Font License 1.1 (원문: 같은 폴더 OFL.txt). 상용 이용·임베드·서브셋 재배포 허용, 글꼴 단독 판매 금지.
- 받은 곳: https://github.com/google/fonts/tree/main/ofl/gowunbatang (GowunBatang-Regular.ttf, GowunBatang-Bold.ttf)
- 가공: fonttools pyftsubset 로 서브셋 + woff2 변환 (--layout-features=* --no-hinting --desubroutinize)
  글자 범위: KS X 1001 한글 2,350자 + ASCII·Latin-1 + 일반 구두점(U+2010-203B) + CJK 기호(U+3000-303F)
  + 한글 호환 자모(U+3131-318E) + 전각 ASCII(U+FF01-FF5E) + 일부 도형(▼▲●★※ 등)
  + resources/js/game/data/**/*.json 에 쓰인 모든 글자(총 11,742자)
  서브셋에 없는 글자는 폴백 스택(Pretendard -> 시스템 글꼴)으로 표시된다. 대사 데이터에 새 한자 등이 늘면 다시 서브셋할 것.
- 사용처: resources/js/game/dialogue/dialogueFont.js (Dialogue 씬, BattleDialogue 만. 다른 화면은 Pretendard 유지)
- 참고: OFL 상 서브셋본은 "Modified Version" 이며 Reserved Font Name 은 지정되어 있지 않아 이름 유지 가능.
