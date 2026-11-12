// 주인공 캐릭터 생성 표시 보조(문항·클래스·초상화 후보는 서버 GET /api/protagonist 가 단일 출처 — FE 임시 데이터 없음).
import { unitClassName } from '../systems/names.js';
import { setProtagonist } from '../dialogue/dialogueData.js';
import { setProtagonistFace } from '../assets.js';

// 초상화 후보 라벨(male_a / female_b ...): 끝 글자 a/b/c -> 순번 문구. 그 외는 코드 그대로
export const FACE_LABEL = { a: '첫째 모습', b: '둘째 모습', c: '셋째 모습' };
export const faceLabel = (face) => FACE_LABEL[String(face ?? '').slice(-1)] ?? String(face ?? '');

// 클래스(= 영웅 병종 = 병사 병종) 표시: 공명 이름(서버 resonance) / 병종명(names.js 단일 지점)
export const classTitle = (c, code = c?.code) => c?.resonance || unitClassName(code);
export const classTroop = (code) => unitClassName(code);

// 서버 상태(protagonistApi.normalizeState) -> 대사 상태(초상화 face·성별, {result_class}/{result_troop} 토큰). 미생성이면 무시
export function applyProtagonistState(st) {
    if (!st?.created) return;
    const c = st.classes?.find((x) => x.code === st.cls) ?? null;
    setProtagonistFace(st.face); // 전투 시트 unit.protagonist.<face>.* 조회용(assets.unitTex)
    setProtagonist({ gender: st.gender, face: st.face, cls: st.cls, clsName: st.resonance?.resonance ?? classTitle(c, st.cls), troopName: st.cls ? classTroop(st.cls) : null });
}
