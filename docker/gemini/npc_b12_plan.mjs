// npc_b12 작업 계획 빌더(호출 없음, 안아트 2026-11-08): 에셋 100% 완비 배치 B — 시트 없이 공용 시트로 떨어지던 임진왜란 수군 15 + 오를레앙 8 전용 방향 시트.
// 수군 처리 = 기존 수군 장수 시트(npc_won_gyun·npc_jp_todo_takatora·npc_jp_wakizaka_yasuharu)와 같음: 192x256 지상 유닛 규격의 서 있는 지휘관(배는 엔진 오버레이, 시트에 배·물·노·돛 없음).
// 외형 단일 출처 = 정식 초상(public/assets/portraits/npc/<code>.*) + 초상 생성 설명(portrait_campaign_style.mjs allJobs()). 무기 1개 규칙·pal_mode unique 는 npc_b11 과 같음.
// 실행(프로젝트 루트): node docker/gemini/npc_b12_plan.mjs → docker/gemini/npc_b12/plan.json
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
const G = 'file:///' + process.cwd().replace(/\\/g, '/') + '/docker/gemini/';
const C = await import(G + 'portrait_campaign_style.mjs');
const ALL = {}; for (const src of [C.P_NPC_V3, C.P_NPC_ENEMY, C.P, C.P_NPC_STORY]) for (const [k, v] of Object.entries(src ?? {})) { ALL[k] = v; if (v?.roster) ALL[v.roster] = ALL[v.roster] ?? v; }
try { for (const j of C.allJobs()) { const k = j.id ?? j.code; if (k && !ALL[k]) ALL[k] = j; if (j.roster && !ALL[j.roster]) ALL[j.roster] = j; } } catch { /* allJobs 형식 다르면 무시 */ }
const ONE = '무기·소지품은 정확히 1개만 든다(두 무기 동시 소지·허리 칼 추가·등에 멘 무기 금지): ';
const HOLD = {
  sword: `${ONE}초상의 칼 하나를 오른손에 쥠(칼끝 아래로 비스듬히 또는 세워서, 정면·측면·뒷면 모두 같은 손)`,
  spear: `${ONE}초상의 장병기 하나(창·글레이브·폴액스·나기나타 등)를 오른손에 세워 쥠(날은 머리 옆, 칸 안)`,
  archer: `${ONE}활 하나를 왼손에 세로로 쥠(화살통은 허리, 칼 없음)`,
  baton: `${ONE}초상의 짧은 지휘봉(지휘채) 하나를 오른손에 쥠, 칼·창 없음`,
  item: `${ONE}초상의 소지품 하나(두루마리·책·장갑·열쇠 고리 등)를 몸 앞에 듦, 칼·창·활 없음`,
  cavalry: `말에 탄 기마 지휘관. ${ONE}초상의 짧은 기병창 하나를 오른손에 듦`,
};
const LAYREF = { sword: 'dir64_sword', spear: 'dir64_sword', baton: 'dir64_sword', archer: 'dir64_archer', item: 'dir64_healer', cavalry: 'dir64_cavalry' };
const NAVAL = '갑판 위에 선 수군 지휘관(투구·갑옷·지휘 자세). 배·갑판 바닥·물·파도·노·돛·밧줄은 절대 그리지 않음 — 인물만 단색 배경 위에 서 있음';
// [roster code, 초상 설명 키, DB troop(폴백 기준), 시트 문화권, 쥐는 방식, tier, 등장]
const LIST = [
  ['npc_i_eokgi', 'npc_i_eokgi', 'naval', 'korea', 'baton', 'B', 'ch1_s3'],
  ['npc_eo_yeongdam', 'npc_eo_yeongdam', 'naval', 'korea', 'item', 'C', 'ch1_s1·s3'],
  ['npc_u_chijeok', 'npc_u_chijeok', 'naval', 'korea', 'spear', 'C', 'ch1_s1'],
  ['npc_i_unryong', 'npc_i_unryong', 'naval', 'korea', 'sword', 'C', 'ch1_s1'],
  ['npc_song_huirip', 'npc_song_huirip', 'naval', 'korea', 'archer', 'C', 'ch1_s1·s7·s9'],
  ['npc_i_yeongnam', 'npc_i_yeongnam', 'naval', 'korea', 'spear', 'C', 'ch1_s7'],
  ['npc_an_wi', 'npc_an_wi', 'naval', 'korea', 'sword', 'C', 'ch1_s9'],
  ['npc_kim_eunghap', 'npc_kim_eunghap', 'naval', 'korea', 'spear', 'C', 'ch1_s9'],
  ['npc_kuki_yoshitaka', 'npc_kuki_yoshitaka', 'naval', 'japan', 'baton', 'B', 'ch1_s1·s3'],
  ['npc_tachibana_muneshige', 'npc_jp_tachibana_muneshige', 'naval', 'japan', 'sword', 'B', 'ch1_s7'],
  ['npc_kato_yoshiaki', 'npc_jp_kato_yoshiaki', 'naval', 'japan', 'sword', 'B', 'ch1_s9'],
  ['npc_manabe_samanojo', 'npc_jp_manabe_samanojo', 'naval', 'japan', 'archer', 'C', 'ch1_s3'],
  ['npc_kan_michinaga', 'npc_jp_kan_michinaga', 'naval', 'japan', 'spear', 'C', 'ch1_s9'],
  ['npc_mori_takamasa', 'npc_jp_mori_takamasa', 'naval', 'japan', 'spear', 'C', 'ch1_s9'],
  ['npc_deng_zilong', 'npc_deng_zilong', 'naval', 'default', 'sword', 'B', 'ch1_s7'],
  ['npc_richemont', 'npc_richemont', 'sword', 'europe', 'spear', 'B', 'ch16'],
  ['npc_jean_luxembourg', 'npc_jean_luxembourg', 'spear', 'europe', 'spear', 'B', 'ch16'],
  ['npc_charles_vii', 'npc_charles_vii', 'sword', 'europe', 'item', 'C', 'ch16'],
  ['npc_xaintrailles', 'npc_xaintrailles', 'cavalry', 'europe', 'cavalry', 'C', 'ch16'],
  ['npc_jean_daulon', 'npc_jean_daulon', 'sword', 'europe', 'sword', 'C', 'ch16'],
  ['npc_gaucourt', 'npc_gaucourt', 'sword', 'europe', 'item', 'C', 'ch16'],
  ['npc_philip_good', 'npc_philip_good', 'sword', 'europe', 'item', 'C', 'ch16'],
  ['npc_cauchon', 'npc_cauchon', 'sword', 'europe', 'item', 'C', 'ch16'],
];
const portraitOf = (c) => ['png', 'webp'].map((e) => `public/assets/portraits/npc/${c}.${e}`).find((f) => existsSync(f)) ?? null;
const items = {}, miss = [];
for (const [c, dk, troop, culture, hold, tier, used] of LIST) {
  const d = ALL[dk] ?? ALL[c]; if (!d?.desc) { miss.push(c); continue; }
  const mounted = hold === 'cavalry', naval = troop === 'naval';
  const desc = String(d.desc).replace(/\{JP\}/g, '16세기 말 일본 무장 복식 일반화').replace(/\s+/g, ' ').trim();
  items[c] = { name: d.name, tier, troop, hold, layout: LAYREF[hold], layoutRef: `docker/gemini/hero_dir_refs/${LAYREF[hold]}.jpg`, mounted, naval, culture, used_in: used,
    portrait: portraitOf(c), desc: `${naval ? NAVAL + '. ' : ''}${desc}. ${HOLD[hold]}`,
    back: mounted ? '말 엉덩이와 꼬리, 기수의 머리 장비 뒷면과 겉옷 등판' : '머리 모양·머리 장비 뒷면과 겉옷 등판, 소지품은 정면과 같은 손·같은 각도',
    side: mounted ? '말이 왼쪽을 향해 걷고 기수는 무기를 몸 앞에 같은 각도로 듦' : '무기·소지품을 몸 앞에 같은 각도로 듦, 머리 장비 옆선, 얼굴은 진행 방향을 봄',
    forbid: `깃발, 문장, 글자, 초상에 없는 큰 방패 추가${mounted ? '' : ', 말'}${naval ? ', 배, 물, 노, 돛' : ''}`,
    fallback: `unit.${culture}.${troop}.enemy.64.sheet`, verify: d.verify ?? '복식 일반화', desc_src: `portrait_campaign_style.mjs#${dk}` };
}
mkdirSync('docker/gemini/npc_b12', { recursive: true });
writeFileSync('docker/gemini/npc_b12/plan.json', JSON.stringify({ _note: 'npc_b12: 임진왜란 수군 15(배 없이 서 있는 지휘관, 배는 엔진 오버레이) + 오를레앙 8. 호출 목표 32·상한 48. 무기 1개 규칙·pal_mode unique', items }, null, 1));
console.log('items', Object.keys(items).length, 'miss', miss.join(','), 'noPortrait', Object.entries(items).filter(([, v]) => !v.portrait).map(([k]) => k).join(','));
