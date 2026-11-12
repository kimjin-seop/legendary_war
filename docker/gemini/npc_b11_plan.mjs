// npc_b11 작업 계획 빌더(호출 없음, 안아트 2026-11-07): 시트 없이 문화권 공용 시트(NPC_CLONE 포함)로 떨어지던 이름 있는 인물 전용 방향 시트.
// 대상(우선순위 순): 유기(ch12_s6 아군) → ch25 쩐·원 측 도보·기마 인물(수군 = 배 오버레이 표시 인물은 제외). 일본 수군 장수 6명은 전원 unit_type naval(배 표시)로 제외.
// 외형 단일 출처 = 정식 초상(이미지 참조) + 초상 설명(ch25_portraits_style.mjs P_CH25 / npc_b11_portrait_style.mjs P_B11). 무기 1개 규칙·pal_mode unique 는 npc_b10 과 같음.
// 실행(프로젝트 루트): node docker/gemini/npc_b11_plan.mjs → docker/gemini/npc_b11/plan.json
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
const G = 'file:///' + process.cwd().replace(/\\/g, '/') + '/docker/gemini/';
const { P_CH25 } = await import(G + 'ch25_portraits_style.mjs');
const { P_B11 } = await import(G + 'npc_b11_portrait_style.mjs');
const ONE = '무기는 정확히 1개만 든다(두 무기 동시 소지·허리 칼 추가 금지): 초상화에 든 무기·소지품이 있으면 그것 하나를, 없으면 ';
const WEAPON = {
  sword: `${ONE}칼(그 시대의 곧은 칼 또는 휜 칼)을 오른손에 칼끝 아래로 비스듬히 쥠`,
  spear: `${ONE}몸 키보다 조금 긴 창을 오른손에 세워 쥠(창날은 머리 위, 칸 안)`,
  archer: `${ONE}활을 왼손에 세로로 쥠(등이나 허리에 화살통)`,
  cavalry: `말에 탄 기마 지휘관. ${ONE}창을 오른손에 듦`,
  healer: '무기 없는 지휘관·성직자·책사: 초상의 소지품(지팡이·두루마리·책·홀·부채 등) 하나를 몸 앞에 듦, 칼·창 추가 금지',
};
const LAY = { sword: 'dir64_sword', spear: 'dir64_sword', archer: 'dir64_archer', cavalry: 'dir64_cavalry', healer: 'dir64_healer' };
const BACK = { cavalry: '말 엉덩이와 꼬리, 기수의 머리 장비 뒷면과 겉옷 등판', other: '머리 모양·머리 장비 뒷면과 겉옷 등판, 소지품은 정면과 같은 손·같은 각도' };
const SIDE = { cavalry: '말이 왼쪽을 향해 걷고 기수는 무기를 몸 앞에 같은 각도로 듦', other: '무기·소지품을 몸 앞에 같은 각도로 듦, 머리 장비 옆선' };
// [code, tier, troop, 시트 문화권(공용 폴백 기준), 등장]
const LIST = [
  ['npc_liu_qi', 'F1', 'sword', 'china', 'ch12_s6 아군'],
  ['npc_pham_ngu_lao', 'F2', 'spear', 'china', 'ch25_s1·s4·s5·s10 아군'],
  ['npc_toghan', 'F2', 'cavalry', 'middle_east', 'ch25_s5 적 총사령'],
  ['npc_sogetu', 'F2', 'sword', 'middle_east', 'ch25_s3 적장'],
  ['npc_tran_nhat_duat', 'F2', 'archer', 'china', 'ch25_s2·s4·s10 아군'],
  ['npc_tran_quang_khai', 'F2', 'spear', 'china', 'ch25_s3·s6 아군'],
  ['npc_li_heng', 'F2', 'archer', 'middle_east', 'ch25_s5 적장'],
  ['npc_da_tuong', 'F3', 'spear', 'china', 'ch25_s9·s10 아군'],
  ['npc_tran_quoc_toan', 'F3', 'cavalry', 'china', 'ch25_s3 증원'],
  ['npc_nguyen_khoai', 'F3', 'spear', 'china', 'ch25_s2 증원'],
  ['npc_tran_nhan_tong', 'F3', 'healer', 'china', 'ch25 컷신(전투 유닛 배치 없음)'],
  // G: 이름표형 범용 지휘관 중 같은 맵에 같은 병종 공용 시트가 겹쳐 구분이 필요한 상위 10(등장 스테이지 수 → 같은 맵 동종 지휘관 수 순). 초상은 기존 전용/별칭 초상(copy_of 원본 설명 사용). 가상 인물 = 복식 일반화 verify
  ['npc_frankish_vanguard', 'G', 'spear', 'europe', 'ch24_s2·s3·s4·s7 적'],
  ['npc_umayyad_rearguard', 'G', 'cavalry', 'middle_east', 'ch24_s3·s4·s5·s9 적'],
  ['npc_berber_cavalry_chief', 'G', 'cavalry', 'middle_east', 'ch24_s3·s4·s5 적'],
  ['npc_arab_guard_chief', 'G', 'cavalry', 'middle_east', 'ch24_s3·s5·s10 적'],
  ['npc_zaragoza_detachment', 'G', 'cavalry', 'middle_east', 'ch24_s3·s4·s6 적'],
  ['npc_umayyad_infantry_chief', 'G', 'cavalry', 'middle_east', 'ch24_s4·s10 적'],
  ['npc_silesian_knight_captain', 'G', 'cavalry', 'europe', 'ch21_s7'],
  ['npc_aquitaine_cavalry_captain', 'G', 'cavalry', 'europe', 'ch24_s7'],
  ['npc_goguryeo_cavalry_captain', 'G', 'cavalry', 'korea', 'ch14_s5 아군'],
  ['npc_goguryeo_pyongyang_guard', 'G', 'sword', 'korea', 'ch14_s9 아군'],
];
const MAN = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')); const MARR = Array.isArray(MAN.items) ? MAN.items : Object.values(MAN.items);
const { P_NPC_STORY } = await import(G + 'portrait_npc_story_style.mjs');
const GNAME = { npc_frankish_vanguard: '전위 대장', npc_umayyad_rearguard: '우마이야 후위 지휘관', npc_berber_cavalry_chief: '베르베르 기병대장', npc_arab_guard_chief: '아랍 근위 기병대장', npc_zaragoza_detachment: '사라고사 파견대장', npc_umayyad_infantry_chief: '우마이야 기병 대장', npc_silesian_knight_captain: '실레지아 중장기사 대장', npc_aquitaine_cavalry_captain: '아키텐 기병대장', npc_goguryeo_cavalry_captain: '고구려 기병 장수', npc_goguryeo_pyongyang_guard: '평양성 수성 장수' }; // heroes.name_ko(DB)
const gen = (c) => { const it = MARR.find((x) => x.key === `portrait.${c}`); const src = it?.copy_of?.replace('portrait.', '') ?? c; const d = P_NPC_STORY[src] ?? P_NPC_STORY[c];
  return d ? { name: GNAME[c] ?? it?.name_ko ?? d.name, desc: d.desc, verify: `가상 인물(직함형) — 복식 일반화(verify)${it?.copy_of ? `. 초상은 ${src} 별칭 사본 → 같은 외형` : ''}`, por: 'public/' + it.path, src: `portrait_npc_story_style.mjs#P_NPC_STORY.${src}` } : null; };
const portraitOf = (c) => [`public/assets/portraits/npc/${c}.png`, `docker/gemini/npc_b11/portraits/out/${c}.png`, `docker/gemini/ch25_portraits/out/${c}.png`].find((f) => existsSync(f)) ?? `docker/gemini/npc_b11/portraits/out/${c}.png`;
const items = {};
for (const [c, tier, troop, culture, used] of LIST) {
  const g = tier === 'G' ? gen(c) : null; const d = g ?? P_CH25[c] ?? P_B11[c]; if (!d) { console.log('설명 없음', c); continue; } const mounted = troop === 'cavalry';
  items[c] = { name: d.name, tier, troop, layout: LAY[troop], layoutRef: `docker/gemini/hero_dir_refs/${LAY[troop]}.jpg`, mounted, culture, used_in: used,
    portrait: g ? g.por : portraitOf(c), portrait_new: !!P_B11[c], desc: `${String(d.desc).replace(/\s+/g, ' ').trim()}. ${WEAPON[troop]}`,
    back: BACK[mounted ? 'cavalry' : 'other'], side: SIDE[mounted ? 'cavalry' : 'other'],
    forbid: `깃발, 문장, 글자, 초상에 없는 큰 방패 추가${mounted ? '' : ', 말'}`, fallback: `unit.${culture}.${troop}.enemy.64.sheet`, verify: d.verify, desc_src: g ? g.src : P_CH25[c] ? 'ch25_portraits_style.mjs#P_CH25' : 'npc_b11_portrait_style.mjs#P_B11' };
}
mkdirSync('docker/gemini/npc_b11', { recursive: true });
writeFileSync('docker/gemini/npc_b11/plan.json', JSON.stringify({ _note: 'npc_b11: 시트 없는 이름 있는 인물(유기 + ch25 도보·기마 10명). 수군(배 오버레이) 인물·이름표형 범용 지휘관 제외. 누계(b9+b10+b11) 상한 270(팀장 승인). 무기 1개 규칙·pal_mode unique', items }, null, 1));
console.log('items', Object.keys(items).length, Object.values(items).map((v) => `${v.tier}:${v.troop}`).join(' '));
