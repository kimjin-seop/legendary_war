// 스킬 이펙트 시트 매핑 생성기(개발용, 번들에 포함되지 않음). 사용: node resources/js/game/tools/build_skill_fx_map.mjs (프로젝트 루트에서)
// 입력: public/assets/fx/skills/skill_fx_request.json 의 by_skill(안아트 연결 요청서, 스킬 코드 -> fx_key)
// 출력: resources/js/game/data/skillFxMap.js  SKILL_FX_BY_CODE = { <스킬 코드>: '<계열>.<변형>' }  ('fx.skill.' 접두사 생략)
// 검사: --check  = 서버 app/Game/SkillFx.php FAMILY 계열 x (base + 속성 4종) 과 by_skill 키가 manifest 에 모두 있는지(없으면 종료 코드 1)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const req = rd('public/assets/fx/skills/skill_fx_request.json');
const rows0 = Array.isArray(req.by_skill) ? req.by_skill : Object.values(req.by_skill ?? {});
// 추가 원천(안아트 배치별 코드 -> '<계열>.<변형>' 평면 맵, 2026-11-08 배치 E skill_fx_map_b.json 44건). 요청서 by_skill 의 같은 코드를 덮어쓴다(뒤 파일 우선)
const EXTRA_MAPS = ['docker/gemini/skill_fx_map_b.json'];
const extraRows = EXTRA_MAPS.filter((p) => fs.existsSync(path.join(ROOT, p))).flatMap((p) => Object.entries(rd(p)).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string').map(([code, v]) => ({ code, fx_key: v.startsWith('fx.skill.') ? v : `fx.skill.${v}`, src: p })));
const rows = [...rows0.filter((x) => !extraRows.some((e) => e.code === x.code)), ...extraRows];

if (process.argv.includes('--check')) {
    const man = rd('public/assets/manifest.json');
    const items = Array.isArray(man.items) ? man.items : Object.entries(man.items ?? man).map(([key, v]) => ({ key, ...v }));
    const keys = new Set(items.filter((i) => String(i.key).startsWith('fx.skill.')).map((i) => i.key));
    const php = fs.readFileSync(path.join(ROOT, 'app/Game/SkillFx.php'), 'utf8');
    const fam = [...new Set([...(/FAMILY\s*=\s*\[([\s\S]*?)\];/.exec(php)?.[1] ?? '').matchAll(/=>\s*'([a-z_]+)'/g)].map((m) => m[1]))];
    const elems = ['fire', 'thunder', 'water_ice', 'poison']; // Engine::skillElement 가 내는 속성 코드(서버 fx_variant)
    const { resolveSkillFxKey } = await import('../fx/skillFxResolve.js');
    const has = (k) => keys.has(k);
    const miss = [];
    fam.forEach((f) => [null, ...elems].forEach((v) => {
        const k = resolveSkillFxKey({ family: f, variant: v, stat: f === 'buff' ? 'atk' : null, radius: 0 }, has);
        if (!k) miss.push(`${f}/${v ?? '-'}`);
        else if (v && k !== `fx.skill.${f}.${v}`) console.log(`  ${f}/${v} -> ${k} (속성 시트 없음, 계열 기본값)`);
    }));
    ['atk', 'def', 'move', 'x'].forEach((st) => { if (!resolveSkillFxKey({ family: 'buff', stat: st }, has)) miss.push(`buff/stat:${st}`); });
    [0, 2].forEach((r) => { if (!resolveSkillFxKey({ family: 'heal', radius: r }, has)) miss.push(`heal/radius:${r}`); });
    rows.forEach((x) => { if (x.fx_key && !has(x.fx_key)) miss.push(`by_skill ${x.code} -> ${x.fx_key}`); });
    console.log(`server FAMILY: ${fam.join(',')} | manifest fx.skill.* ${keys.size} | by_skill ${rows.length}`);
    console.log(miss.length ? `MISSING ${miss.length}: ${miss.join(', ')}` : 'OK: 모든 계열/변형·by_skill 키가 manifest 로 해석됨');
    process.exit(miss.length ? 1 : 0);
}

const map = {};
rows.slice().sort((a, b) => String(a.code).localeCompare(String(b.code))).forEach((x) => { if (x.code && x.fx_key) map[x.code] = String(x.fx_key).replace(/^fx\.skill\./, ''); });
const ents = Object.entries(map).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
const lines = [];
for (let i = 0; i < ents.length; i += 5) lines.push(`    ${ents.slice(i, i + 5).join(', ')},`);
const out = `// 생성물(직접 수정 금지): node resources/js/game/tools/build_skill_fx_map.mjs. 원천 = public/assets/fx/skills/skill_fx_request.json by_skill + ${EXTRA_MAPS.join(', ')}(같은 코드는 추가 원천 우선, 합계 ${ents.length}건, 안아트)
// 스킬 코드 -> 스킬 이펙트 시트 '<계열>.<변형>'(manifest 키 fx.skill.<계열>.<변형>). 표에 없는 코드는 fx/skillFxResolve.js 가 서버 fx_family/fx_variant -> 계열 기본값 순으로 해석
export const SKILL_FX_BY_CODE = {
${lines.join('\n')}
};
`;
fs.writeFileSync(path.join(ROOT, 'resources/js/game/data/skillFxMap.js'), out);
console.log(`written resources/js/game/data/skillFxMap.js (${ents.length})`);
