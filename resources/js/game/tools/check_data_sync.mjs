// 지도 데이터 원본(database/data, 송서사) <-> FE 사본(resources/js/game/data) 동일성 확인(개발용, 번들 미포함).
// 사용: node resources/js/game/tools/check_data_sync.mjs        -> 다르면 목록 출력 + exit 1
//       node resources/js/game/tools/check_data_sync.mjs --fix  -> 원본을 사본으로 복사(원본이 기준)
// 국호(plaque.native) 글자가 바뀌었으면 이어서 node resources/js/game/tools/build_plaque_fonts.mjs 로 폰트 서브셋도 다시 만든다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const PAIRS = ['shelf_map_meta.json', 'shelf_territories.json', 'hero_native_names.json'].map((f) => [path.join(ROOT, 'database/data', f), path.join(ROOT, 'resources/js/game/data', f)]).filter(([src]) => fs.existsSync(src)); // hero_native_names = 영웅 원어 이름(송서사, 원본이 생기면 대상)
const fix = process.argv.includes('--fix');
let bad = 0;
for (const [src, dst] of PAIRS) {
    const a = fs.readFileSync(src);
    const b = fs.existsSync(dst) ? fs.readFileSync(dst) : null;
    const same = !!b && a.equals(b);
    if (!same && fix) { fs.copyFileSync(src, dst); console.log(`[sync] 복사 ${path.relative(ROOT, src)} -> ${path.relative(ROOT, dst)}`); continue; }
    try { JSON.parse(a.toString('utf8')); } catch (e) { console.log(`[sync] 원본 JSON 파싱 실패 ${path.relative(ROOT, src)}: ${e.message}`); bad += 1; }
    console.log(`[sync] ${same ? '동일' : '다름'} ${path.basename(src)}`);
    if (!same) bad += 1;
}
process.exitCode = bad ? 1 : 0;
