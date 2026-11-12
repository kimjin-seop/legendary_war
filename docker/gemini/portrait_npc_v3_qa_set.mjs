// 신규 NPC v3 QA 기록 도구(호출 없음, 안아트 2026-11-02). 사용: node docker/gemini/portrait_npc_v3_qa_set.mjs <json 파일: {code:{verdict,issues,notes}}>
// docker/gemini/portrait_campaign/qa_npc_v3.json 에 병합(공통 checklist·date·batch 자동 부여)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const F = 'docker/gemini/portrait_campaign/qa_npc_v3.json';
const qa = existsSync(F) ? JSON.parse(readFileSync(F, 'utf8')) : {};
const add = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const CL = ['896x1200 3:4 RGBA', '마젠타 잔여(불투명)·가장자리 점검', '내부 반투명 점검(금속 반사 → T_lo40/T_hi90 재처리)', '머리·투구·소품 상단 잘림 점검', '활 1개·등 소품 점검', '시대 오류(터번·근대 모자 등) 점검', '같은 장 실루엣·색 중복 점검', '문장·깃발·글자·종교 상징 없음', '기존 초상과 선·셀 셰이딩·광원(좌상) 일치'];
for (const [c, v] of Object.entries(add)) qa[c] = { verdict: v.verdict, issues: v.issues ?? [], notes: v.notes ?? '', checked: true, checklist: CL, date: '2026-11-02', batch: v.batch ?? 'npc_v3' };
writeFileSync(F, JSON.stringify(qa, null, 1));
console.log('qa 항목', Object.keys(qa).length, Object.entries(qa).reduce((m, [, v]) => (m[v.verdict] = (m[v.verdict] ?? 0) + 1, m), {}));
