#!/bin/sh
# v4 재시도 3차(카이사르 r3, 다리우스 r2). 실행(프로젝트 루트): sh docker/gemini/hero_v4_batch3.sh
G="sh docker/gemini/hero_v4_gen.sh"
$G julius_caesar --force "--note=v4r3: r2 후면 walk2 칼 누락" "--extra=글라디우스는 9칸 모두 오른손에 칼끝을 아래로 비스듬히 든 같은 자세. 3행(뒷모습) 세 칸은 모두 몸 오른쪽(화면 오른쪽) 아래로 칼날이 뚜렷하게 튀어나와 보인다 — 특히 3행 오른쪽 칸(walk2)에서 칼을 빠뜨리지 않는다. 3행은 붉은 망토가 등 전체를 덮은 완전한 뒷모습. 흉갑은 밝은 청동, 월계관 녹색"
$G darius_i --force "--note=v4r2: 측면 walk2 홀 방향이 반대" "--extra=금 홀은 9칸 모두 오른손에 같은 각도(위쪽 끝 금 구슬이 몸 앞 위로 비스듬히)로 든다. 2행 세 칸 모두 홀의 방향·각도가 똑같다(walk2 칸에서 아래로 뒤집지 않음)"
