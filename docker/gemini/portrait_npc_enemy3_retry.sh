#!/bin/sh
# 적 부장 NPC 초상 3차 재생성 1회차(안아트 2026-11-02). 실행(프로젝트 루트): sh docker/gemini/portrait_npc_enemy3_retry.sh
# 각 id 1회 호출(이전본은 raw/<id>_try<n>.jpg 로 보존). 키는 portrait_campaign_gen.sh 의 --env-file 방식만 사용.
G=docker/gemini/portrait_campaign_gen.sh
FR='인물을 조금 작게 그려 투구·볏·술·창끝까지 모든 것이 프레임 위 가장자리에서 6% 이상 아래에 완전히 들어오게 한다(잘림 금지)'
sh $G portrait_npc_huang_zhong --force --note=npc_enemy3_r1 "--extra=활은 왼손에 쥔 큰 활 딱 1개뿐(등에 다른 활을 메지 않음). 화살통은 오른쪽 허리에만. 망토 없음(청색 망토 금지). $FR"
sh $G portrait_npc_qasar --force --note=npc_enemy3_r1 "--extra=활은 왼손에 쥔 크고 두꺼운 활 딱 1개뿐(등에 다른 활을 메지 않음). 화살통은 오른쪽 허리에만(등에 화살통 없음). 화살통·팔토시에 화려한 무늬 없이 단색 가죽. $FR"
sh $G portrait_npc_carthalo --force --note=npc_enemy3_r1 "--extra=흉갑·금속 갑옷 없음(근육 모양 흉갑 절대 금지). 머리에 터번·두건·천을 감지 않음: 맨머리에 짧게 땋은 검은 곱슬머리. 연한 황토색 무릎 길이 튜닉 위에 가슴에 엇갈린 가죽끈 두 줄, 어깨에 짧은 갈색 가죽 망토. 장식 무늬 없는 소박한 경기병 복장. $FR"
sh $G portrait_npc_gisgo --force --note=npc_enemy3_r1 "--extra=흉갑은 근육·복근·가슴 근육 모양이 전혀 없는 평평하고 매끈한 청동 판(위아래로 둥근 통 모양). 어깨 장식 무늬 없음. 오른손으로 칼집째 세운 곧은 칼의 자루를 쥠. $FR"
sh $G portrait_npc_mago_barca --force --note=npc_enemy3_r1 "--extra=흰 말총 볏은 낮고 짧게(투구 높이의 절반 이하). 어깨 띠 자락에 화려한 금 무늬 없음. $FR"
sh $G portrait_npc_perdiccas --force --note=npc_enemy3_r1 "--extra=붉은 볏은 낮고 짧게(투구 위로 조금만). 망토는 분홍·자주 기미가 전혀 없는 짙은 벽돌빛 주홍색(노란 기가 도는 붉은색). $FR"
sh $G portrait_npc_yeom_mo --force --note=npc_enemy3_r1 "--extra=$FR. 창은 짧게 쥐어 창날 끝이 머리 꼭대기 높이 정도에서 끝나게"
sh $G portrait_npc_zhao_yun --force --note=npc_enemy3_r1 "--extra=$FR. 흰 말총 술은 짧게(투구 위로 조금만). 창은 창날 끝이 머리 꼭대기 높이 정도에서 끝나게. 창 자루의 붉은 술 없음"
