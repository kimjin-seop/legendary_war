// npc_b13 작업 계획 빌더(호출 없음, 안아트 2026-11-08 에셋 완비 배치 C): 시트 없이 문화권 공용 시트로 떨어지던 구대륙 이름 있는 인물 21명 전용 방향 시트.
// 대상 = 감사 CSV(batch B3b, '시트 제작 필요') 중 임진 수군 15·오를레앙 8·ch25 7 을 뺀 구대륙 인물. 아프리카·아메리카(campaign_only, 사용처 없음)는 제외.
// 외형 단일 출처 = 정식 초상(이미지 참조) + 초상 설명(portrait_npc_v3_style.mjs P_NPC_V3 / portrait_npc_ext_style.mjs P_NPC_EXT / portrait_npc_ext2_style.mjs P_NPC_EXT2).
// 무기 1개 규칙·pal_mode unique 는 npc_b11 과 같음. 초상의 소지품이 병종과 안 맞으면(홀·채찍 등) WPN 으로 병종 무기 하나를 지정.
// 실행(프로젝트 루트): node docker/gemini/npc_b13_plan.mjs → docker/gemini/npc_b13/plan.json
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const G = pathToFileURL(process.cwd() + '/docker/gemini/').href;
const { P_NPC_V3 } = await import(G + 'portrait_npc_v3_style.mjs');
const { P_NPC_EXT } = await import(G + 'portrait_npc_ext_style.mjs');
const { P_NPC_EXT2 } = await import(G + 'portrait_npc_ext2_style.mjs');
const ONE = '무기는 정확히 1개만 든다(두 무기 동시 소지·허리 칼 추가·방패 추가 금지): ';
const WEAPON = {
  sword: `${ONE}칼(그 시대의 곧은 칼 또는 휜 칼)을 오른손에 칼끝 아래로 비스듬히 쥠`,
  archer: `${ONE}활을 왼손에 세로로 쥠(등이나 허리에 화살통)`,
  cavalry: `말에 탄 기마 지휘관. ${ONE}기병창을 오른손에 듦`,
};
// 인물별 무기(초상 소지품 우선, 병종과 어긋나면 병종 무기)
const WPN = {
  npc_yeongyang: `${ONE}곧은 고리자루 칼을 오른손에 칼끝 아래로 쥠(관·포는 초상 그대로, 갑옷 추가 금지)`,
  npc_go_geonmu: `${ONE}곧은 칼을 오른손에 칼끝 아래로 쥠`,
  npc_yangdi: `${ONE}곧은 칼(금빛 자루)을 오른손에 칼끝 아래로 쥠(황제 포 그대로, 갑옷 추가 금지)`,
  npc_wuwenshu: `${ONE}긴 자루 끝에 외날 칼날이 달린 언월형 대도를 오른손에 세워 쥠(날은 머리 옆, 칸 안)`,
  npc_xing_yuanheng: `${ONE}곧은 칼을 오른손에 세워 듦(방패 없음)`,
  npc_wei_wensheng: `${ONE}긴 자루 도끼(월부)를 오른손에 세워 쥠(날은 머리 옆, 칸 안)`,
  npc_philip_augustus: `${ONE}곧은 장검을 오른손에 칼끝 아래로 쥠(홀 없음)`,
  npc_al_adil: `${ONE}약간 휜 칼을 오른손에 칼끝 아래로 쥠`,
  npc_isabella_jerusalem: `${ONE}가는 곧은 칼을 오른손에 칼끝 아래로 쥠(드레스·베일·작은 금관 그대로, 갑옷 추가 금지, 성인 여성)`,
  npc_goryeo_seongjong: `${ONE}곧은 칼을 오른손에 칼끝 아래로 쥠(면류관·붉은 포 그대로, 갑옷 추가 금지)`,
  npc_goryeo_hyeonjong: `${ONE}곧은 칼을 오른손에 칼끝 아래로 쥠(복두·청색 포 그대로, 갑옷 추가 금지)`,
  npc_liao_shengzong: `${ONE}곧은 칼을 오른손에 칼끝 아래로 쥠(말채찍 없음, 모피 깃 포 그대로)`,
  npc_muhammad_ii_khwarazm: `${ONE}휜 칼을 오른손에 칼끝 아래로 쥠`,
  npc_wanyan_xun: `${ONE}곧은 칼을 오른손에 칼끝 아래로 쥠(복두·붉은 포·모피 깃 그대로, 갑옷 추가 금지)`,
  npc_li_anquan: `${ONE}곧은 칼을 오른손에 칼끝 아래로 쥠(홀 없음, 관모·청색 포 그대로)`,
  npc_bihar_khan_lodi: `말에 탄 기마 지휘관. ${ONE}휜 외날 칼을 오른손에 듦`,
  npc_hamid_khan: `말에 탄 기마 지휘관. ${ONE}기병창을 오른손에 듦`,
  npc_hasan_khan_mewati: `말에 탄 기마 지휘관. ${ONE}휜 외날 칼을 오른손에 듦`,
  npc_mahmud_lodi: `말에 탄 기마 지휘관. ${ONE}휜 외날 칼을 오른손에 듦`,
  npc_mustafa_rumi: `${ONE}긴 화승총 1자루를 두 손으로 몸 앞에 비스듬히 듦(활·칼 없음, 허리에 작은 화약통)`,
  npc_coloman_hungary: `말에 탄 기마 지휘관. ${ONE}기병창을 오른손에 듦(방패 없음)`,
};
const LAY = { sword: 'dir64_sword', archer: 'dir64_archer', cavalry: 'dir64_cavalry' };
const BACK = { cavalry: '말 엉덩이와 꼬리, 기수의 머리 장비 뒷면과 겉옷 등판', other: '머리 모양·머리 장비 뒷면과 겉옷 등판, 소지품은 정면과 같은 손·같은 각도' };
const SIDE = { cavalry: '말이 왼쪽을 향해 걷고 기수는 무기를 몸 앞에 같은 각도로 듦', other: '무기·소지품을 몸 앞에 같은 각도로 듦, 머리 장비 옆선' };
// [code, 그룹, troop, 시트 문화권(공용 폴백 기준), 등장]
const LIST = [
  ['npc_bihar_khan_lodi', 'C1', 'cavalry', 'middle_east', 'ch22(로디 측)'],
  ['npc_hamid_khan', 'C1', 'cavalry', 'middle_east', 'ch22(로디 측)'],
  ['npc_hasan_khan_mewati', 'C1', 'cavalry', 'middle_east', 'ch22(로디 측)'],
  ['npc_mahmud_lodi', 'C1', 'cavalry', 'middle_east', 'ch22(로디 측)'],
  ['npc_mustafa_rumi', 'C1', 'archer', 'middle_east', 'ch22(바부르 측 총병)'],
  ['npc_coloman_hungary', 'C1', 'cavalry', 'europe', 'ch21 레그니차/모히'],
  ['npc_yeongyang', 'C2', 'sword', 'korea', 'ch14 고구려'],
  ['npc_go_geonmu', 'C2', 'sword', 'korea', 'ch14 고구려'],
  ['npc_yangdi', 'C2', 'sword', 'china', 'ch14 수'],
  ['npc_wuwenshu', 'C2', 'sword', 'china', 'ch14 수'],
  ['npc_xing_yuanheng', 'C2', 'sword', 'china', 'ch14 수'],
  ['npc_wei_wensheng', 'C2', 'sword', 'china', 'ch14 수'],
  ['npc_philip_augustus', 'C3', 'sword', 'europe', 'ch19 십자군'],
  ['npc_al_adil', 'C3', 'sword', 'middle_east', 'ch19 아이유브'],
  ['npc_isabella_jerusalem', 'C3', 'sword', 'europe', 'ch19 예루살렘'],
  ['npc_goryeo_seongjong', 'C4', 'sword', 'korea', 'ch11 고려'],
  ['npc_goryeo_hyeonjong', 'C4', 'sword', 'korea', 'ch11 고려'],
  ['npc_liao_shengzong', 'C4', 'sword', 'china', 'ch11 거란'],
  ['npc_muhammad_ii_khwarazm', 'C4', 'sword', 'middle_east', 'ch18 호라즘'],
  ['npc_wanyan_xun', 'C4', 'sword', 'china', 'ch18 금'],
  ['npc_li_anquan', 'C4', 'sword', 'china', 'ch18 서하'],
];
const portraitOf = (c) => [`public/assets/portraits/npc/${c}.png`, `public/assets/portraits/npc/${c}.webp`].find((f) => existsSync(f)) ?? null;
const items = {};
for (const [c, tier, troop, culture, used] of LIST) {
  const src = P_NPC_V3[c] ? 'portrait_npc_v3_style.mjs#P_NPC_V3' : P_NPC_EXT[c] ? 'portrait_npc_ext_style.mjs#P_NPC_EXT' : 'portrait_npc_ext2_style.mjs#P_NPC_EXT2';
  const d = P_NPC_V3[c] ?? P_NPC_EXT[c] ?? P_NPC_EXT2[c]; if (!d) { console.log('설명 없음', c); continue; }
  const por = portraitOf(c); if (!por) { console.log('초상 없음', c); continue; }
  const mounted = troop === 'cavalry';
  items[c] = { name: d.name, tier, troop, layout: LAY[troop], layoutRef: `docker/gemini/hero_dir_refs/${LAY[troop]}.jpg`, mounted, culture, used_in: used, female: !!d.female,
    portrait: por, desc: `${String(d.desc).replace(/\s+/g, ' ').trim()}. ${WPN[c] ?? WEAPON[troop]}`,
    back: BACK[mounted ? 'cavalry' : 'other'], side: SIDE[mounted ? 'cavalry' : 'other'],
    forbid: `깃발, 문장, 글자, 십자, 큰 방패${mounted ? '' : ', 말'}`, fallback: `unit.${culture}.${troop}.enemy.64.sheet`, verify: d.verify, desc_src: src };
}
mkdirSync('docker/gemini/npc_b13', { recursive: true });
writeFileSync('docker/gemini/npc_b13/plan.json', JSON.stringify({ _note: 'npc_b13(배치 C): 시트 없는 구대륙 이름 있는 인물 21명. 수군·오를레앙·ch25·아프리카/아메리카 제외. 상한 50회. 무기 1개 규칙·pal_mode unique', items }, null, 1));
writeFileSync('docker/gemini/npc_b13/facing.json', JSON.stringify({ _note: 'npc_b13 칸 매핑·옵션. 전원 pal_mode unique', heroes: Object.fromEntries(Object.keys(items).map((k) => [k, { pal_mode: 'unique' }])) }, null, 1));
console.log('items', Object.keys(items).length, Object.values(items).map((v) => `${v.tier}:${v.troop}`).join(' '));
