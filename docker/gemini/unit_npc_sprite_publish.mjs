// 반영(호출 없음, 안아트-스프라이트 2026-11-02): docker/gemini/unit_npc_sprite/out 결과를 public/assets/sprites/npc/{64,64_x2} 로 복사 + manifest 조각(미병합) 작성.
// manifest.json·다른 조각은 수정하지 않는다. 병합은 팀장: merge_fragments.mjs FRAGMENTS 에 아래 1줄 추가 후 --dry → 실행.
//   { path: `${A}/sprites/npc/unit_npc_sprite_manifest_fragment.json`, kind: 'npc_naval' }   (items 배열, unit.npc.* 는 scope 'npc' — 항목에 이미 명시)
// QA 판정 단일 출처: docker/gemini/unit_npc_sprite/qa.json (qa 가 pass/minor 인 코드만 게시. fail·not_checked 는 건너뜀)
// 실행(프로젝트 루트): node docker/gemini/unit_npc_sprite_publish.mjs [--dry]
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { NPC, QA as CHECKLIST, SAME_AS } from './unit_npc_sprite_style.mjs';
const G = 'docker/gemini/unit_npc_sprite', OUT = `${G}/out`, dry = process.argv.includes('--dry');
const FRAG = 'public/assets/sprites/npc/unit_npc_sprite_manifest_fragment.json';
const QA = JSON.parse(readFileSync(`${G}/qa.json`, 'utf8'));
const LOG = existsSync(`${G}/calls_log.jsonl`) ? readFileSync(`${G}/calls_log.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const callsOf = (id) => LOG.filter((c) => c.id === (SAME_AS[id] ?? id)).length; // 같은 raw 공유 오브젝트는 원본 코드의 호출 수(공유)
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K' };
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const items = []; let copied = 0;
const cp = (src, dst) => { if (!existsSync(src)) throw new Error(`없음 ${src}`); if (!dry) { mkdirSync(dst.replace(/\/[^/]+$/, ''), { recursive: true }); copyFileSync(src, dst); } copied++; };
for (const [code, h] of Object.entries(NPC)) {
  const q = QA[code]; if (!q || !['pass', 'minor'].includes(q.verdict)) { console.log(`[건너뜀] ${code} qa=${q?.verdict ?? 'not_checked'}`); continue; }
  for (const side of ['ally', 'enemy']) {
    const f = `${code}_${side}_sheet.png`, d1 = `public/assets/sprites/npc/64/${f}`, d2 = `public/assets/sprites/npc/64_x2/${f}`;
    cp(`${OUT}/64/hero_${code}_${side}_sheet.png`, d1); cp(`${OUT}/64_x2/hero_${code}_${side}_sheet.png`, d2);
    items.push({ key: `unit.npc.${code}.${side}.64.sheet`, path: d1.replace('public/', ''), type: 'spritesheet', frameWidth: 64, frameHeight: 64, size: '192x256', cols: 3, rows: 4,
      row_order: ['down', 'left', 'right', 'up'], col_order: ['walk1', 'idle', 'walk2'], alpha: true, filter: 'NEAREST', scale: 'integer only(x1/x2/x3, nearest)',
      variants: { x2: d2.replace('public/', '') }, bytes: sz(d1), npc: code, name_ko: h.name, side, npc_default_side: h.side, culture: h.culture, troop: h.troop, mounted: !!h.mounted,
      scope: 'npc', deferred: true, fallback: h.fallback.replace('.ally.', `.${side}.`),
      team_marker: side === 'ally' ? '발밑 파랑 받침(A안)' : '발밑 빨강 받침 + 파랑 계열 색만 적색 스왑(hue 185-265)',
      generator: { ...GEN, script: 'docker/gemini/unit_npc_sprite_gen.mjs(unit_npc_sprite_gen.sh) + unit_npc_sprite_style.mjs → unit_npc_sprite_pp.sh(hero_dir_pp_v4.mjs)' },
      prompt_ref: `docker/gemini/unit_npc_sprite_style.mjs NPC.${code}`, ref_portrait: h.object || h.noPortrait ? null : `docker/gemini/portrait_campaign/raw/portrait_${code}.jpg`, raw: `${G}/raw/${SAME_AS[code] ?? code}.jpg`, ...(h.object ? { object: h.object, map_object: true } : {}), ...(h.noPortrait && !h.object && code !== 'npc_boat_2' ? { provisional: '정식 초상 없음(잠정 시트)' } : {}), ...(code === 'babur' ? { roster_code: 'npc_babur', alias_note: 'assets.js NPC_ASSET_ALIAS npc_babur → babur(초상 portrait.babur 와 같은 코드)' } : {}), ...(SAME_AS[code] ? { same_sheet_as: SAME_AS[code] } : {}), ...(code === "npc_boat_2" ? { ship_overlay: "배 본체는 엔진 ship_overlay(default 거룻배) back/front, 이 시트는 배 위 노꾼 몸통" } : {}),
      calls: callsOf(code), qa: { checked: true, verdict: q.verdict, checklist: CHECKLIST, issues: q.issues ?? [] },
      verify: true, verify_note: h.verify, license: LIC, provenance: h.structRef ? `refs: 3x3 방향 시트 견본(hero_dir_refs) + 구조 참조 ${h.structRef}(짐만 변형, 초상 없음)` : h.object || h.noPortrait ? 'refs: 3x3 방향 시트 견본(hero_dir_refs)만(초상 없음)' : 'refs: 3x3 방향 시트 견본(hero_dir_refs) + 초상 담당 정식 초상 raw(portrait_campaign)', calls_shared: !!SAME_AS[code] });
  }
}
const frag = {
  note: 'NPC 전용 전투 스프라이트(원균·정운·이여송·진린 2026-11-02 + 메인 스토리 2막 봉군·사공·돌 아주머니 2026-11-03 + 후속: 메인 스토리 NPC 12종·짐수레 4코드(3시트: 2026-11-03 npc_cart_rear 짐 변형 별도)·나룻배 노꾼 2026-11-03 + ch21/ch22 카단·바이다르·우스타드 알리 쿨리·바부르(babur)·바투·후마윤(잠정, 초상 없음) 2026-11-03) manifest 조각. 미병합 — manifest.json 직접 수정 안 함. 병합: merge_fragments.mjs FRAGMENTS 에 { path: `${A}/sprites/npc/unit_npc_sprite_manifest_fragment.json`, kind: \'npc_naval\' } 1줄 추가.',
  generated: new Date().toISOString(),
  keyRules: {
    npc_sprite: 'unit.npc.<npc_code>.<ally|enemy>.64.sheet — npc_code 는 로스터 코드 그대로(npc_won_gyun 등, 접두사 변환·별칭 불필요). assets.npcCode() 가 manifest 존재로 바로 인식',
    side: '아군 NPC 는 ally 시트 사용(assets.npcSheetSide: npc_jp_ 접두사만 enemy 고정). enemy 시트는 같은 인물이 적으로 나올 때용(파랑 계열 색만 적색 스왑)',
    lookup: 'unitTex 후보 순서: (영웅이면 unit.hero.*) → unit.npc.<code>.<side>.64.sheet → unit.<culture>.<cls>.<side>.64.sheet → unit.default... → unit.<cls>... (fallback 필드 = 같은 순서의 권장 폴백)',
    sheet_layout: '192x256, 64x64 프레임 3열x4행, 행=down,left,right,up, 열=walk1,idle,walk2 (hero v4·npc_naval 과 동일), x2 는 variants.x2',
  },
  items,
};
if (!dry) writeFileSync(FRAG, JSON.stringify(frag, null, 1));
console.log(`항목 ${items.length}, 복사 ${copied}${dry ? ' (dry)' : ''} -> ${FRAG}`);
