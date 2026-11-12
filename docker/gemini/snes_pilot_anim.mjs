// SNES 스타일 시범: 걷기(4)·공격(4) 측면(왼쪽 향함) 애니메이션 시트. 참조 = 이미 확정한 SNES 3x3 방향 시트 raw(같은 캐릭터·그림체 고정).
// 출력 배치: 4열x2행(1행 walk: 접지·통과·반대 접지·반대 통과 / 2행 attack: 준비·타격·여파·복귀), 16:9 캔버스.
// 실행(키는 --env-file 로만): node --env-file=.env docker/gemini/snes_pilot_anim.mjs <id> <ref3x3.jpg> <out.jpg> "<캐릭터·무기 설명>"
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { RES, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';
import { SNES_STYLE } from './snes_style.mjs';

const [id, ref, out, desc] = process.argv.slice(2);
const LOG = 'docker/gemini/snes_pilot_calls_log.json';
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : { note: 'SNES 스타일 시범 Gemini 호출 로그', calls: [] };
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };

const prompt =
  `참조 이미지는 이 캐릭터의 확정된 방향 시트(2행 = 화면 왼쪽을 향한 옆모습). 같은 캐릭터를 같은 그림체·같은 색·같은 도트 크기·같은 머리 비율·같은 키로 그린 애니메이션 시트 1장을 만든다.\n` +
  `캐릭터: ${desc}\n` +
  '배치: 정확히 4열x2행(8칸) 균등 격자, 이미지 가운데 영역에 배치, 격자선·글자 없음. 8칸 모두 화면 왼쪽을 향한 완전한 옆모습, 같은 발 기준선, 같은 키(무기 제외 머리끝~발끝 동일).\n' +
  '1행 걷기 4프레임: (1) 앞발 내딛고 뒷발 뻗은 접지 (2) 두 다리가 몸 아래에서 교차하는 통과, 몸 1도트 위 (3) 반대 발 접지 (4) 반대 통과, 몸 1도트 위. 상체·머리·장비 위치는 거의 고정, 팔은 다리와 반대로 작게 흔듦.\n' +
  '2행 공격 4프레임: (1) 준비: 무기를 뒤로 당기고 몸을 웅크림 (2) 타격: 무기를 앞(왼쪽)으로 크게 뻗고 앞발 딛음 (3) 여파: 무기가 끝까지 지나가고 몸이 따라감 (4) 복귀: 서 있는 자세로 돌아옴. 공격 중에도 몸통 크기·머리 크기 동일, 무기 끝이 칸 밖으로 나가지 않게.\n' +
  `스타일: ${SNES_STYLE}\n${KEY_BG}\n금지: ${BASE_NEGATIVE}, 칸마다 다른 캐릭터·다른 색·다른 비율 금지`;
const input = [{ type: 'image', mime_type: 'image/jpeg', data: readFileSync(ref).toString('base64') }, { type: 'text', text: prompt }];
const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 150_000);
try {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '16:9', image_size: RES.image_size } }), signal: ctrl.signal });
  const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
  log.calls.push({ ts: new Date().toISOString(), id, status: res.status, model: RES.model, size: RES.image_size }); writeFileSync(LOG, JSON.stringify(log, null, 1));
  const img = res.ok ? findImage(json) : null;
  if (img) { writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공`); } else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 300)}`);
} catch (e) { log.calls.push({ ts: new Date().toISOString(), id, status: 'error' }); writeFileSync(LOG, JSON.stringify(log, null, 1)); console.log(`[${id}] 오류 ${scrub(e.message)}`); }
finally { clearTimeout(t); }
