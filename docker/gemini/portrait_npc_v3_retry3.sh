#!/bin/sh
# 신규 NPC v3 재생성 2회차(마지막, 안아트 2026-11-02): 가토 기요마사 — 긴 투구 상단 잘림 2회 → 투구를 옆구리에 끼는 구도로 변경
G=docker/gemini/portrait_campaign_gen.sh
sh $G portrait_npc_kato_kiyomasa --force --note=npc_v3_r2 "--extra=투구는 쓰지 않음: 위로 길게 솟은 검은 원통형 투구를 왼팔 옆구리에 끼고(투구 전체가 프레임 안, 가슴~허리 높이), 머리는 맨머리 상투. 편겸창은 오른손에, 창날 끝이 머리 꼭대기 높이에서 끝나게. 머리 꼭대기가 프레임 위 가장자리에서 8% 이상 아래"
