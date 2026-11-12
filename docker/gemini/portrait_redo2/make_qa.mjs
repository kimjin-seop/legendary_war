// qa.json 생성(호출 없음): redo_style.mjs P(차별 포인트·근거·URL) + verdicts.json({code:[verdict, notes|null]}) → qa.json(publish.py 입력)
// 실행(프로젝트 루트): node docker/gemini/portrait_redo2/make_qa.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { P, W } from './redo_style.mjs';
const V = JSON.parse(readFileSync(`${W}/verdicts.json`, 'utf8'));
const qa = {
  _checklist: '얼굴 차별 포인트 3개 가시성(군집별 접촉 시트 300px 얼굴 크롭 전후 비교) / 복식·머리쓰개·무기·색이 현행(=스프라이트)과 동일 / 마젠타 잔여·헤일로 / 해부(눈·손) / 썸네일 256 판독',
  _sources_note: 'URL 은 인물 기본 항목(생몰·직위)과 용모 서술 재인용처. 동시대 초상 기반: 샤를 7세(푸케), 베드퍼드(베드퍼드 기도서). 서술 기반: 칭기즈 칸(몽달비록·주즈자니), 하랄(스노리), 윌리엄 1세(맘즈베리), 악진(삼국지). 나머지는 나이·지위·일화 기반 디자인 → 모두 verify',
};
for (const [c, h] of Object.entries(P)) {
  const v = V[c]; if (!v) continue;
  qa[c] = { verdict: v[0], diff_points: h.d, evidence: h.src, evidence_level: h.lv, source_url: h.url, notes: v[1] ?? null, contact: `${W}/qa/` };
}
writeFileSync(`${W}/qa.json`, JSON.stringify(qa, null, 1));
console.log(Object.keys(qa).length - 2, Object.values(qa).filter((x) => x.verdict).reduce((a, x) => ({ ...a, [x.verdict]: (a[x.verdict] ?? 0) + 1 }), {}));
