// 안아트 land_set 이름표(ls_names.json, 제안 전역 200~) -> FE 프레임 표(resources/js/game/data/landSetNames.js) 변환(윤프론 2026-11-01).
// water_set(200~249·300~372·400~425)과 겹치지 않도록 FE 전역 인덱스 = 500 + 프레임(프레임 = 제안 인덱스 - 200). 이 표는 프레임만 담고 시작 번호는 unityTileset.U32_EXT3.start.
// 실행(저장소 루트): node docker/gemini/land_names_to_js.mjs   (ls_names.json 이 바뀌면 다시 실행)
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'public/assets/tiles/land_set/ls_names.json';
const OUT = 'resources/js/game/data/landSetNames.js';
const PROPOSED_START = 200;
const names = JSON.parse(readFileSync(SRC, 'utf8'));
const frames = Object.fromEntries(Object.entries(names).map(([k, v]) => [k, Number(v) - PROPOSED_START]).sort((a, b) => a[1] - b[1]));
const vals = Object.values(frames);
if (vals.some((f) => !Number.isInteger(f) || f < 0) || new Set(vals).size !== vals.length) throw new Error('ls_names.json 프레임 이상(음수/중복)');
const body = `// 자동 생성(docker/gemini/land_names_to_js.mjs, 원본 ${SRC}) — 직접 수정 금지.
// 이름 -> land_set 시트 프레임(0~${Math.max(...vals)}). FE 전역 인덱스 = U32_EXT3.start(500) + 프레임
export const LS_FRAMES = ${JSON.stringify(frames)};
export const LS_COUNT = ${vals.length};
`;
writeFileSync(OUT, body);
console.log(`${OUT}: ${vals.length}개(프레임 0~${Math.max(...vals)})`);
