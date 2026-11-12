#!/bin/sh
# 신규 NPC v3 초상 재생성(서가분 1회차, 안아트 2026-11-02). 실행(프로젝트 루트): sh docker/gemini/portrait_npc_v3_retry2.sh
G=docker/gemini/portrait_campaign_gen.sh
FR='인물을 조금 작게 그려 머리·모자·관·투구·창끝까지 모든 것이 프레임 위 가장자리에서 8% 이상 아래에 완전히 들어오게 한다(잘림 금지)'
sh $G portrait_npc_kato_kiyomasa --force --note=npc_v3_r1 "--extra=긴 투구는 높이를 얼굴 길이의 1.5배 이하로, 투구 꼭대기가 프레임 위 가장자리에서 10% 이상 아래. 인물을 작게(얼굴 너비 프레임 너비의 17%). $FR"
sh $G portrait_npc_masinissa --force --note=npc_v3_r1 "--extra=흉갑·금속 갑옷 없음(근육 모양 흉갑 절대 금지). 크림색 튜닉과 붉은 망토만, 가슴에 엇갈린 가죽끈 한 줄. $FR"
sh $G portrait_npc_conrad_iii --force --note=npc_v3_r1 "--extra=왕관은 머리 위에 딱 하나만(그림 전체에 왕관 1개, 옆에 떠 있는 왕관·물체 없음). 쇠사슬 두건 없이 짧은 갈색 머리 위에 금관. $FR"
sh $G portrait_npc_naemul --force --note=npc_v3_r1 "--extra=금관은 머리 위에 딱 하나만(옆에 떠 있는 관·물체 없음). 흰 포 대신 연한 황토색 비단 포. $FR"
sh $G portrait_npc_aemilius_paullus --force --note=npc_v3_r1 "--extra=투구 위 깃털 장식 없음(꼭지만 있는 매끈한 청동 투구). $FR"
