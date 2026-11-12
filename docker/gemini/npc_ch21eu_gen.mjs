// ch21 유럽 장수·바투·후마윤 생성 래퍼(안아트 2026-11-03). npc_ch21eu_style.mjs 를 먼저 import 해 이 프로세스 안에서만 작업 정의를 더한 뒤 기존 생성기를 그대로 실행한다.
// 실행(호스트, 프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/npc_ch21eu_gen.mjs portrait|sprite <ids> [--force] [--note=..] [--extra=..]
// portrait ids = portrait_<code>, sprite ids = <code>. 키는 --env-file 로만 전달(출력·기록 없음).
import './npc_ch21eu_style.mjs';
const mode = process.argv[2];
process.argv.splice(2, 1); // 기존 생성기는 argv[2] 를 id 목록으로 읽음
if (mode === 'portrait') await import('./portrait_campaign_gen.mjs');
else if (mode === 'sprite') await import('./unit_npc_sprite_gen.mjs');
else { console.error('mode = portrait | sprite'); process.exit(1); }
