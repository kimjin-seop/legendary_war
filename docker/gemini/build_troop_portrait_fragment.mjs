// 일반 병종 기본 초상화 manifest 조각 생성(manifest.json 직접 수정 안 함). 실행: node docker/gemini/build_troop_portrait_fragment.mjs
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
const DIR = 'public/assets/portraits/troops';
const CULT = ['korea', 'japan', 'china', 'middle_east', 'europe', 'default', 'ancient_med', 'steppe'];
const TROOPS = ['sword', 'spear', 'cavalry', 'archer', 'naval', 'mage', 'healer', 'assassin'];
const NOTE = {
  korea_sword: ['환도가 양날 직검처럼 보임(외날 표현 약함)'], korea_archer: ['복건이 각진 두건보다 머릿수건에 가까움'],
  korea_naval: ['모자가 전립보다 흑립(갓)형에 가까움'], korea_healer: ['장삼 오른쪽 아래 소매 안쪽에 검은 톱니 잔여 약간(소형 표시에서는 안 보임)'],
  korea_assassin: ['복면이 닌자풍으로 읽힐 수 있음(조선 고증 근거 약함, 게임 표현)'],
  china_cavalry: ['극(戟) 곁날 없이 창으로 그려짐'], europe_sword: ['투구가 바시넷·샐릿 절충형'],
  europe_healer: ['작은 나무 십자가 펜던트(스타일 가이드 healer 허용 항목) — 종교 상징 노출 정책 확인'],
  default_mage: ['머리 오른쪽 지팡이 사이 보라 가장자리 미세 잔여'], middle_east_spear: ['여성 창병 흰 스카프+터번 조합 고증 확인'],
  japan_spear: ['창끝이 칸 위 경계에 닿아 약간 잘림'], japan_archer: ['활 위 끝이 위 경계에 닿음'],
};
const report = JSON.parse(readFileSync(`${DIR}/qa/pp_report.json`, 'utf8'));
const items = [], missing = [];
for (const c of CULT) for (const t of TROOPS) {
  const f = `${DIR}/${c}_${t}.png`, id = `${c}_${t}`;
  if (!existsSync(f)) { missing.push(`portrait.troop.${c}.${t}`); continue; }
  const v2 = ['naval', 'mage', 'healer', 'assassin'].includes(t);
  items.push({ key: `portrait.troop.${c}.${t}`, path: `assets/portraits/troops/${id}.png`, type: 'portrait', subtype: 'troop', culture: c, troop: t,
    bytes: statSync(f).size, size: report[id]?.size ?? [840, 1120], alpha: true, ratio: '3:4', face_crop: 'top-center square (PortraitCard 규칙과 동일, y=4%)',
    generator: { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K', sheet: `raw/portrait_troop/${v2 ? `${c}_v2` : c}.jpg (2x2 시트 1회 호출 = 4장)`, script: 'docker/gemini/gen.mjs + style_guide.mjs(portrait_troop) + portrait_troop_pp.py' },
    prompt_ref: `style_guide.mjs TROOP_PORTRAIT_CULT.${c}.types.${t}`,
    license: 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)',
    qa: { checked: true, verdict: NOTE[id] ? 'pass_minor' : 'pass', issues: NOTE[id] ?? [], auto: 'portrait_edge_check ok, portrait_magenta_check opaque<=18px' },
    verify: c !== 'default', load: 'lazy(정보창·카드 진입 시), 프리로드 금지' });
}
const out = { note: '일반 병종(무명 병사) 기본 초상화 manifest 조각(병합 대기, manifest.json 직접 수정 안 함). 영웅 초상화와 별도 경로 assets/portraits/troops/.', generated: new Date().toISOString(),
  keyRule: 'portrait.troop.<culture>.<troop>  culture: korea|japan|china|middle_east|europe|default(+예약 ancient_med|steppe)  troop: sword|spear|cavalry|archer|naval|mage|healer|assassin',
  lookup: ['1) 영웅 유닛(kind!=troop): portrait.<hero_code>', '2) 병사 유닛(kind==troop): portrait.troop.<culture>.<troop> (culture=소속 영웅 문화권 hero_cultures.json, 없거나 미제작 문화권이면 default)', '3) portrait.troop.default.<troop>', '4) 병종 아이콘/글리프(현행 이니셜 폴백)'],
  troopAlias: { heavy: 'sword (중장보병 삭제·보병 통합)', flyer: '없음(범위 밖) -> 아이콘 폴백', monster: '없음(적 전용, 이번 제외) -> 아이콘 폴백' },
  cultureAlias: { ancient_med: 'default(미제작)', steppe: 'default(미제작)', south_asia: 'default', southeast_asia: 'default', africa: 'default', americas: 'default', oceania: 'default' },
  size: [840, 1120], count: items.length, missing, items };
writeFileSync(`${DIR}/manifest_fragment_troops.json`, JSON.stringify(out, null, 1));
console.log(`items ${items.length}, missing ${missing.length}`);
