// v4 눈 검수 판정 기록(호출 없음). 판정 근거 = hero_v4_preview/ 의 [초상화|시트] 묶음(reverify_*, a2rest_*, a3_*, b*_*)과 측면·후면 확대(*_side/_back/_rows).
// checklist 6항목(초상화 대비): hair 머리색·머리형, head 관/모자/투구, armor_color 갑옷·의복 주색, cape 망토, item 무기·소품, gender_skin 성별·피부색. + 방향 시트 일관성(sheet).
// 실행: node docker/gemini/hero_v4_qa_build.mjs  → docker/gemini/hero_v4_qa.json
import { writeFileSync, readFileSync } from 'node:fs';
const OK = { hair: 'O', head: 'O', armor_color: 'O', cape: 'O', item: 'O', gender_skin: 'O', sheet: 'O' };
const audit = JSON.parse(readFileSync('public/assets/sprite_audit.json', 'utf8')).heroes.map((h) => h.code);
const EXISTING_FAIL = { gwanggaeto: '금 뿔 투구·남색 갑옷(초상화 은 투구+금 날개)', wang_geon: '남색 투구(초상화 검은 관모)', darius_i: '창(초상화 금 홀)', napoleon: '이각모(초상화 맨머리)', frederick_great: '삼각모·붉은 소매(초상화 맨머리·남색)' };
const A2A3 = 'amanirenas,archimedes,aristotle,christine_de_pizan,henry_v,heo_jun,ibn_khaldun,jeong_yakyong,leonardo_da_vinci,marcus_aurelius,minamoto_yoritomo,minamoto_yoshitsune,murasaki_shikibu,peter_great,ramesses_ii,saigo_takamori,sakamoto_ryoma,sejong,tokugawa_ieyasu,vauban,william_i,alp_arslan,artemisia_i,date_masamune,guan_yu,gyebaek,honda_tadakatsu,jalal_ad_din,khalid_ibn_walid,kim_yusin,liu_bei,seo_hui,sima_yi,suleiman_i,takeda_shingen,yi_seonggye,zhang_liang,zhou_yu,julius_caesar,oda_nobunaga,charles_martel,leonidas,mehmed_ii,gustavus_adolphus,nelson,richard_i,saladin,scipio_africanus,xiang_yu,cao_cao,han_xin,taizong_tang'.split(',');
// v4 판정(재생성·재후처리분). 값: ['pass'|'fail'|'pending', issues[], checklist override]
const V4 = JSON.parse(readFileSync('docker/gemini/hero_v4_qa_v4.json', 'utf8'));
const NOTE_EXIST = { gwak_jae_u: ['측면 idle 칸 활이 수평(겨눔) — 외형 일치, 경미'], kim_si_min: ['측면 idle 칸 활이 수평(겨눔) — 외형 일치, 경미'], socrates: ['초상화에 없는 둥근 방패(중갑 병종 표현, verify)'], san_martin: ['초상화에 없는 말아 쥔 소품'], liu_bang: ['관모 형태 단순화(작은 금관처럼 보임) — 경미'] };
const heroes = {};
for (const c of audit) {
  if (V4[c]) { const [verdict, issues, ck] = V4[c]; heroes[c] = { verdict, source: 'v4', checklist: { ...OK, ...(ck ?? {}) }, issues }; continue; }
  if (A2A3.includes(c)) { heroes[c] = { verdict: 'pass', source: 'v4', checklist: OK, issues: ['v3 a2/a3 raw 를 v4 파이프라인으로 재후처리(결과 동일 확인), 초상화 대비 6항목 일치'] }; continue; }
  if (EXISTING_FAIL[c]) { heroes[c] = { verdict: 'fail', source: 'existing', checklist: { ...OK, head: 'X' }, issues: [EXISTING_FAIL[c]] }; continue; }
  heroes[c] = { verdict: 'pass', source: 'existing', checklist: OK, issues: NOTE_EXIST[c] ?? ['기존 전용 시트 재검증 — 초상화 대비 6항목 일치'] };
}
const cnt = {}; for (const h of Object.values(heroes)) { const k = `${h.source}:${h.verdict}`; cnt[k] = (cnt[k] ?? 0) + 1; }
writeFileSync('docker/gemini/hero_v4_qa.json', JSON.stringify({ _note: '영웅 전용 시트 v4 눈 검수(안아트 2026-11-01). source=existing(현 manifest 시트 유지) | v4(hero_v4_out 반영 대상). checklist O=일치 △=부분 X=불일치', summary: cnt, heroes }, null, 1));
console.log(cnt);
