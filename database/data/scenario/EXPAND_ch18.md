# 서가 확장 인계서: ch18 몽골 (s9~s10, +2)

작성: 송서사 (2026-11-03). 대사 파일은 database/data 에 없고 `resources/js/game/data/dialogue/ch18_mongol.json` 에만 있어 그 파일을 직접 수정했다(기존 s1~s8·open·end 불변). 이 파일은 기존 관행대로 장면 필드에 evidence/verify_note/source 와 줄의 is_invented 를 둔다(대사 본문에는 표기 없음). 시오리 대사는 신규 장면에 0줄. speaker_profile +3, battle_cues 키 신설(s9, s10만).
정정: 이전에 "ch18 대사 파일 없음"으로 보고했으나 resources 쪽에 존재했다. 나이만 잔당 스테이지는 stages_ch18_mongol.json 의 ch18_s1 이다(ch21 아님).

## 스테이지
| 코드 | 제목 | 목표 유형 | 지형 | 적 구성 제안 | 신호/플래그 |
|---|---|---|---|---|---|
| ch18_s9 | 오트라르 서문 (1219 겨울) | 점령(문 확보) | 얼다 만 해자, 서문, 성채 앞 골목 | 호라즘 수비 보병·궁병, 성채 안 총독(후반) | `west_mound_signal` -> `west_mound_signal_up`: 서문 개방(문 타일 통행 가능). 점령 후 주민 무전투 구역 |
| ch18_s10 | 파르완 계곡 (1221) | 탈출(서쪽 출구 도달) | 좁은 계곡, 양 비탈 바위, 동쪽 샛길 | 하마한 호라즘 궁병·창병, 비탈 위 배치 | `side_path_signal` -> `side_path_signal_up`: 샛길 개통(후열·부상자 이동). 플레이어 병종 기병 불리 구간 |
- 순서: 후미 추가이므로 신규 첫 caption 에 "일지의 앞 장" 연도 표기(오트라르 1219 겨울, 파르완 1221).
- s10 은 몽골 측 패배 전투로 설계(승리 조건이 아니라 탈출). post 는 칸의 인더스 추격으로 s6 과 연결.
- 학살·도시 피해는 다루지 않음. 성 안 이탈자는 이름 없는 신호로만 둠.

## 사료 대조 메모 (대사 비노출)
- 오트라르 포위(1219 말~1220 초): 차가타이·오고타이 지휘, 수개월 지속, 총독 이날추크의 성채 항전(accepted). 성 안 지휘관 이탈 서술은 출처 간 상이(verify). 서문 불 신호, 천인장, 개방 방식은 invented.
- 이날추크 한글 표기(Inalchuq/Gayir Khan): verify.
- 파르완(1221): 잘랄 앗딘의 승리, 시기 쿠투쿠 패배(accepted). 월·장소 세부는 verify. 말을 내리고 싸웠다는 서술(출처 일부)은 verify, 샛길은 invented.
- 칸의 반응("졌으면 졌다고 적어라")은 invented. 칸이 쿠투쿠를 위로했다는 전승은 verify, 대사에는 직접 인용하지 않음.

## 신규 NPC 표
| code | 이름 | 병종 | 진영 | 초상 그룹 | 비고 |
|---|---|---|---|---|---|
| npc_siege_captain | 몽골 공성 천인장 | cavalry | 몽골 | 몽골 장수 | invented 익명 |
| npc_inalchuq | 이날추크 | sword | 호라즘 | 중앙아시아 귀족 | 실존, 표기 verify |
| npc_shigi_qutuqu | 시기 쿠투쿠 | cavalry | 몽골 | 몽골 장수 | 실존, 표기 verify |
- NPC_NAMES 등록 필요(박백엔). 잘랄 앗딘은 s6 에서 이미 사용.
