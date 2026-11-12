#!/bin/sh
# 적 부장 NPC 초상 3차 재생성 2회차(마지막, 안아트 2026-11-02). 실행(프로젝트 루트): sh docker/gemini/portrait_npc_enemy3_retry2.sh
G=docker/gemini/portrait_campaign_gen.sh
FR='인물을 조금 작게 그려 머리·투구 꼭대기가 프레임 위 가장자리에서 8% 이상 아래에 오게 한다'
sh $G portrait_npc_qasar --force --note=npc_enemy3_r2 "--extra=그림 전체에 활은 정확히 하나만 존재한다. 그 하나의 활은 왼손에 세로로 쥐고 가슴 앞에 둔다. 등에는 아무것도 메지 않는다(활·화살통·활집 모두 금지, 어깨 뒤로 아무것도 튀어나오지 않음). 화살은 오른쪽 허리의 단색 가죽 화살통에만. $FR"
sh $G portrait_npc_mago_barca --force --note=npc_enemy3_r2 "--extra=투구에 볏·말총·깃털 장식이 전혀 없는 매끈한 청동 기병 투구(넓은 챙). $FR. 창날 끝도 프레임 안"
sh $G portrait_npc_perdiccas --force --note=npc_enemy3_r2 "--extra=투구 위 볏·말총·깃털 장식 없음: 꼭대기가 매끈한 청동 투구(볼가리개 열림). 망토는 분홍·자주 기미가 없는 짙은 벽돌빛 붉은 갈색. $FR"
