#!/bin/sh
# 신규 NPC v3 초상 재생성 1회차(안아트 2026-11-02). 실행(프로젝트 루트): sh docker/gemini/portrait_npc_v3_retry1.sh
# 각 id 1회 호출(이전본은 raw/<id>_try<n>.jpg 로 보존). 키는 portrait_campaign_gen.sh 의 --env-file 방식만 사용.
G=docker/gemini/portrait_campaign_gen.sh
FR='인물을 조금 작게 그려 머리·모자·관·투구·창끝까지 모든 것이 프레임 위 가장자리에서 8% 이상 아래에 완전히 들어오게 한다(잘림 금지)'
sh $G portrait_npc_glasdale --force --note=npc_v3_r1 "--extra=창은 짧게 쥐어 창날 끝이 머리 꼭대기 높이에서 끝나게. 머리 주변에 떠 있는 조각·파편 없음. $FR"
sh $G portrait_npc_fastolf --force --note=npc_v3_r1 "--extra=모자 쓰지 않음(중절모·볼러 모자 같은 근대 모자 절대 금지): 맨머리에 짧게 자른 회색 머리. $FR"
sh $G portrait_npc_jean_alencon --force --note=npc_v3_r1 "--extra=뒤누아(갈색 바가지 머리·푸른 망토)와 확실히 구분: 밝은 금발 곱슬머리를 귀 아래까지, 망토 없음, 갑옷 위 흰 겉옷이 가슴 전체에 크게 보임(금색 테). 흰 깃털 투구는 왼손으로 가슴 앞에 들고 투구 전체가 프레임 안. $FR"
sh $G portrait_npc_cauchon --force --note=npc_v3_r1 "--extra=주교관은 낮게(관 높이는 얼굴 길이의 0.8배 이하). 인물을 작게 그려 주교관 꼭대기가 프레임 위 가장자리에서 10% 이상 아래. $FR"
