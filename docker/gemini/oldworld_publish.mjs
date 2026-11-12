// 구대륙 교체 영웅 20명 초상 반영(호출 없음, 안아트 2026-11-04). 정식 목록 database/data/proposals/old_world_replacement_final.json(slots[].new.code — v1 임시코드와 20/20 일치)
//   docker/gemini/portrait_campaign/out/<code>.png(+thumb/<code>.webp) → public/assets/portraits/<code>.png + portraits/thumb/<code>.webp (키 portrait.<code>(+.thumb))
//   기존(교체 전) 20명 초상은 건드리지 않음(보관). 조각 public/assets/portraits/portrait_oldworld_manifest_fragment.json, 매핑표 docker/gemini/oldworld/code_map.json
//   QA 단일 출처 docker/gemini/oldworld/qa.json ({code:{verdict, issues, notes}}) — pass/minor 만 게시. 실행: node docker/gemini/oldworld_publish.mjs
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { P_OW, S_OW } from './oldworld_style.mjs';
const FIN = JSON.parse(readFileSync('database/data/proposals/old_world_replacement_final.json', 'utf8'));
const QA = JSON.parse(readFileSync('docker/gemini/oldworld/qa.json', 'utf8'));
const O = 'docker/gemini/portrait_campaign/out', P = 'public/assets/portraits';
const logs = ['docker/gemini/oldworld/calls_log.jsonl', 'docker/gemini/portrait_s/calls_log.jsonl'].filter(existsSync).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
mkdirSync(`${P}/thumb`, { recursive: true });
const items = [], map = [], pending = [];
for (const s of FIN.slots) {
  const n = s.new, code = n.code, h = P_OW[code] ?? S_OW[code], q = QA[code];
  map.push({ slot: s.slot, old_code: s.old.code, new_code: code, temp_code: n.temp_code ?? code, name_ko: n.name_ko, rarity: n.rarity, key: `portrait.${code}`, old_key_kept: `portrait.${s.old.code}` });
  if (!h || !existsSync(`${O}/${code}.png`) || !q || !['pass', 'minor'].includes(q.verdict)) { pending.push({ code, reason: !h ? '정의 없음' : !existsSync(`${O}/${code}.png`) ? '미생성' : `QA ${q?.verdict ?? '미점검'}` }); continue; }
  const dst = `${P}/${code}.png`, th = `${P}/thumb/${code}.webp`;
  copyFileSync(`${O}/${code}.png`, dst); copyFileSync(`${O}/thumb/${code}.webp`, th);
  const isS = n.rarity === 'S';
  items.push({ key: `portrait.${code}`, path: dst.replace('public/', ''), type: 'portrait', subtype: 'hero', grade: n.rarity, size: '896x1200', ratio: '3:4', alpha: true, bytes: statSync(dst).size,
    hero: code, name_ko: n.name_ko, culture: n.culture, region: n.region, era: n.era, unit_type: n.unit_type, replaces: s.old.code, slot: s.slot, expressions: ['neutral'], expression_fallback: '모든 expr → neutral',
    ...(isS ? { s_layers: { bg: `portrait.s_bg.${S_OW[code].bg}`, frame: 'atlas.uiskin_gacha#frame.rank.s', ornament: 'atlas.uiskin_gacha#frame.rank.s.ornament', order: 'bg → portrait → frame → ornament' } } : {}),
    thumb: { key: `portrait.${code}.thumb`, path: th.replace('public/', ''), size: '256x343', bytes: statSync(th).size },
    generator: { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K', script: isS ? 'docker/gemini/portrait_s_gen.mjs(oldworld_style.mjs S_OW, 참조 없음) → portrait_npc_v3_pp.sh' : 'docker/gemini/oldworld_gen.mjs(oldworld_style.mjs P_OW → portrait_campaign_style job(), 참조 = 그림체만) → portrait_npc_v3_pp.sh' },
    style_ref: isS ? null : h.ref.replace('public/', ''), prompt_ref: `docker/gemini/oldworld_style.mjs ${isS ? 'S_OW' : 'P_OW'}.${code}`, calls: logs.filter((c) => c.id === `portrait_${code}` || c.id === code).length,
    qa: { checked: true, ...q }, verify: true, verify_note: h.verify ?? '복식 일반화', license: 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)' });
}
writeFileSync(`${P}/portrait_oldworld_manifest_fragment.json`, JSON.stringify({ note: '구대륙 교체 영웅 초상(안아트 2026-11-04). 키 portrait.<new_code>(+.thumb). 교체 전 영웅 초상(portrait.<old_code>)은 그대로 보관', items }, null, 1));
mkdirSync('docker/gemini/oldworld', { recursive: true });
writeFileSync('docker/gemini/oldworld/code_map.json', JSON.stringify({ _note: '슬롯 → 교체 전/후 코드·초상 키. 정식 코드 = old_world_replacement_final.json(임시코드와 동일)', slots: map, pending }, null, 1));
console.log(`게시 ${items.length}, 보류 ${pending.length}`, JSON.stringify(pending));
