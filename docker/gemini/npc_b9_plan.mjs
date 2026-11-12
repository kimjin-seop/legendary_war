// npc_b9 작업 계획 빌더(호출 없음, 안아트 2026-11-07): B~D 실존 인물 NPC 장수 전용 방향 시트(팀장 승인: 목표 135회·하드 상한 170회).
// 입력: 감사 결과 tiers(B/C/D 코드 목록) + 초상 설명(portrait_* 스타일 모듈, npc_naval_style S11) + 스테이지/로스터 병종.
// 출력: docker/gemini/npc_b9/plan.json  { items: { <code>: {name, tier, troop, layout, mounted, culture, portrait, desc, back, side, forbid, fallback, verify} } }
// 실행(프로젝트 루트): node docker/gemini/npc_b9_plan.mjs <tiers.json> <types.json> <real.json>
// 규칙: 기존 v4 파이프라인 프롬프트 골격(unit_npc_sprite_style SHEET_RULE3 / hero_wave3 job) 그대로. 외형 단일 출처 = 정식 초상(이미지 참조) + 초상 설명.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const [tiersF, typesF, realF] = process.argv.slice(2);
const T = JSON.parse(readFileSync(tiersF, 'utf8')), TY = JSON.parse(readFileSync(typesF, 'utf8'));
const REAL = Object.fromEntries(JSON.parse(readFileSync(realF, 'utf8')).map((x) => [x.c, x]));
const G = 'file:///' + process.cwd().replace(/\\/g, '/') + '/docker/gemini/';
const mods = ['portrait_campaign_style.mjs', 'portrait_npc_ext_style.mjs', 'portrait_npc_ext2_style.mjs', 'portrait_npc_ext3_style.mjs', 'portrait_npc_v3_style.mjs', 'portrait_npc_story_style.mjs', 'npc_naval_style.mjs'];
const D = {};
for (const m of mods) { const M = await import(G + m); for (const [k, v] of Object.entries(M)) if (v && typeof v === 'object' && !Array.isArray(v)) for (const [c, d] of Object.entries(v)) if (/^npc_/.test(c) && d && typeof d === 'object' && d.desc && !D[c]) D[c] = { ...d, _src: `${m}#${k}` }; }
const ROSTER = {}; // 로스터 appearance(초상 설명 없는 경우 보조)
for (const f of ['npc_roster_v3.json', 'npc_roster_v3_additions.json']) { const p = `database/data/${f}`; if (!existsSync(p)) continue; const w = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(w); if (typeof o.code === 'string' && o.appearance) ROSTER[o.code] = o; Object.values(o).forEach(w); }; w(JSON.parse(readFileSync(p, 'utf8'))); }
const portraitOf = (c) => [`docker/gemini/portrait_campaign/out/${c}.png`, `public/assets/portraits/npc/${c}.png`, `public/assets/portraits/npc/${c}.webp`].find((f) => existsSync(f));
const CUL = (s) => { s = String(s ?? ''); if (/japan/.test(s)) return 'japan'; if (/korea|goryeo|baekje|silla|goguryeo/.test(s)) return 'korea';
  if (/china|khitan|liao|wei|han|sui|tang|xianbei|ming/.test(s)) return 'china';
  if (/steppe|mongol|naiman|merkit|oirat|persia|bactria|carthage|numidia|ayyubid|middle_east|south_asia/.test(s)) return 'middle_east'; return 'europe'; };
const TROOPS = ['sword', 'spear', 'archer', 'cavalry', 'healer', 'mage'];
const pickTroop = (c) => { const ty = TY[c]?.types ?? {}; const best = Object.entries(ty).filter(([k]) => TROOPS.includes(k)).sort((a, b) => b[1] - a[1])[0]?.[0];
  const rt = REAL[c]?.t; return best ?? (TROOPS.includes(rt) ? rt : 'sword'); };
const LAY = { sword: 'dir64_sword', spear: 'dir64_sword', archer: 'dir64_archer', cavalry: 'dir64_cavalry', healer: 'dir64_healer', mage: 'dir64_mage' };
const ONE = '무기는 정확히 1개만 든다(두 무기 동시 소지·허리 칼 추가 금지): 초상화에 든 무기·소지품이 있으면 그것 하나를, 없으면 ';
const WEAPON = { // v2(2026-11-07 D2~): B/C 에서 초상 무기 + 병종 무기를 함께 드는 사례 6건 → 1개 규칙. v1 프롬프트는 npc_b9/plan_v1.json(B·C·D1)
  sword: `${ONE}칼(그 시대의 곧은 칼 또는 휜 칼)을 오른손에 칼끝 아래로 비스듬히 쥠`,
  spear: `${ONE}몸 키보다 조금 긴 창을 오른손에 세워 쥠(창날은 머리 위, 칸 안)`,
  archer: `${ONE}활을 왼손에 세로로 쥠(등이나 허리에 화살통)`,
  cavalry: `말에 탄 기마 지휘관. ${ONE}창을 오른손에 듦`,
  healer: '무기 없는 지휘관·성직자·책사: 초상의 소지품(지팡이·두루마리·책·홀 등) 하나를 몸 앞에 듦, 칼·창 추가 금지',
  mage: '무기 없는 책사·지휘관: 초상의 소지품(부채·두루마리·지휘봉 등) 하나를 몸 앞에 듦, 칼·창 추가 금지',
};
const BACK = { cavalry: '말 엉덩이와 꼬리, 기수의 머리 장비 뒷면과 겉옷 등판', other: '머리 모양·머리 장비 뒷면과 겉옷 등판, 소지품은 정면과 같은 손·같은 각도' };
const SIDE = { cavalry: '말이 왼쪽을 향해 걷고 기수는 무기를 몸 앞에 같은 각도로 듦', other: '무기·소지품을 몸 앞에 같은 각도로 듦, 머리 장비 옆선' };
const items = {}; const miss = [];
for (const [tier, list] of Object.entries({ B: T.B, C: T.C, D: [...T.D, ...(T.Dx ?? [])] })) for (const c of list) {
  const d = D[c] ?? (D[`npc_jp_${c.slice(4)}`]) ?? null; const r = ROSTER[c];
  const por = portraitOf(c); if (!por) { miss.push(c); continue; }
  const troop = pickTroop(c), mounted = troop === 'cavalry';
  const desc0 = d?.desc ?? (r ? `${r.name_ko ?? ''}: ${r.appearance}` : null); if (!desc0) miss.push(`${c}(desc 없음, 초상만)`);
  const desc = String(desc0 ?? '정식 초상화의 얼굴·머리 장비·복식 색·소지품을 그대로').replace(/\s+/g, ' ').trim();
  const culture = CUL((TY[c]?.cult ?? [])[0] ?? d?.culture ?? REAL[c]?.r?.culture);
  items[c] = { name: d?.name ?? r?.name_ko ?? REAL[c]?.r?.name ?? c, tier, troop, layout: LAY[troop], layoutRef: `docker/gemini/hero_dir_refs/${LAY[troop]}.jpg`, mounted, culture,
    portrait: por, desc: `${desc}. ${WEAPON[troop]}`, back: BACK[mounted ? 'cavalry' : 'other'], side: SIDE[mounted ? 'cavalry' : 'other'],
    forbid: `깃발, 문장, 글자, 초상에 없는 큰 방패 추가${mounted ? '' : ', 말'}`, fallback: `unit.${culture}.${troop}.enemy.64.sheet`,
    verify: d?.verify ?? '용모 기록 없음 — 복식 일반화(verify)', desc_src: d?._src ?? (r ? 'roster appearance' : 'portrait only') };
}
mkdirSync('docker/gemini/npc_b9', { recursive: true });
writeFileSync('docker/gemini/npc_b9/plan.json', JSON.stringify({ _note: 'npc_b9 실존 NPC 장수 방향 시트 계획(안아트 2026-11-07). 팀장 승인 범위: B(ch12 10)→C(2회 이상 등장 22)→D(나머지 실존 80), 목표 135회·하드 상한 170회. 직함형·공용 클론·수군(배 표시) 제외', items }, null, 1));
const cnt = {}; for (const v of Object.values(items)) cnt[`${v.tier}:${v.troop}`] = (cnt[`${v.tier}:${v.troop}`] ?? 0) + 1;
console.log('items', Object.keys(items).length, cnt, 'miss', miss);
