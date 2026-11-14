// GET /api/stages 의 챕터(서가) 단위 부가 정보 보관소(의존성 없음).
// - chapters: {"<chapter>": {need[{code,name,owned}], need_count, owned_count, ready}} | null
// - order: chapter_order(충족 챕터 먼저, 그 안은 기존 순서) [chapter:int] | null. JSON 객체 키 순서는 보장되지 않아 서버가 별도 배열로 준다.
// gameApi.stages() 가 배열 속성(.chapters/.chapterOrder)에도 붙이지만, 호출 측이 filter() 로 새 배열을 만들면 속성이 사라지므로 마지막 응답을 여기 보관한다.
export const stageChapterInfo = { chapters: null, order: null };

export function rememberStageChapters(chapters, order) {
    stageChapterInfo.chapters = chapters && typeof chapters === 'object' ? chapters : null;
    stageChapterInfo.order = Array.isArray(order) ? order.map(Number).filter(Number.isFinite) : null;
}
