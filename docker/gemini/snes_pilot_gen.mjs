// SNES 스타일 전환 시범(파일럿) — 현행 3x3 방향 시트(down,left,up x walk1,idle,walk2)를 스타일 샘플(snes_soldier_01) 그림체로 다시 그림.
// 참조: 1=스타일 기준(샘플 01, 8~12배 확대, 마젠타 배경), 2=현행 방향 시트(배치·방향·복식 기준).
// 실행(키는 --env-file 로만): node --env-file=.env docker/gemini/snes_pilot_gen.mjs <id> <styleRef.jpg> <layoutRef.jpg> <out.jpg> "<복식 설명>"
// 호출 로그: docker/gemini/snes_pilot_calls_log.json (키 값은 기록·출력하지 않음)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { RES, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';
import { SNES_STYLE } from './snes_style.mjs'; // 스타일 단일 출처

const RULE =
  '정확히 3열x3행(9칸) 균등 격자, 격자선·글자 없음, 칸마다 캐릭터 1프레임(전신, 발까지), 칸 사이 여백 충분. ' +
  '행 순서(위→아래): 1행 정면(아래를 향함), 2행 화면 왼쪽을 향한 완전한 옆모습, 3행 뒷모습(위를 향함). 열 순서: 왼발 내딛음, 서 있음, 오른발 내딛음. ' +
  '9칸 모두 같은 캐릭터·같은 크기(머리끝~발끝이 칸 높이의 80%)·같은 발 기준선·칸 가로 중앙 정렬, 무기·장비가 칸 밖으로 나가지 않게.';

const [id, styleRef, layoutRef, out, desc, extra = ''] = process.argv.slice(2); // extra = 추가 지시(재시도 보정)
const LOG = 'docker/gemini/snes_pilot_calls_log.json';
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : { note: 'SNES 스타일 시범 Gemini 호출 로그', calls: [] };
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };

const prompt =
  `첫 번째 참조 이미지는 그림체 기준(도트 크기감·치비 비율·외곽선·음영 방식만 따름. 단 첫 번째 참조보다 색을 더 밝고 선명하게, 음영은 더 단순하게). ` +
  `두 번째 참조 이미지는 현재 쓰는 3x3 방향 걷기 시트(배치·방향·자세·복식·장비·색 배치의 기준). 두 번째 참조와 같은 캐릭터·같은 배치를 첫 번째 참조의 그림체로 다시 그린 3x3 시트 1장을 만든다.\n` +
  `캐릭터: ${desc}\n${extra ? `추가 지시: ${extra}\n` : ''}시트 규칙: ${RULE}\n스타일: ${SNES_STYLE}\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
const input = [styleRef, layoutRef].map((f) => ({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') }));
input.push({ type: 'text', text: prompt });
const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 150_000);
try {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '1:1', image_size: RES.image_size } }), signal: ctrl.signal });
  const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
  log.calls.push({ ts: new Date().toISOString(), id, status: res.status, model: RES.model, size: RES.image_size }); writeFileSync(LOG, JSON.stringify(log, null, 1));
  const img = res.ok ? findImage(json) : null;
  if (img) { writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공`); } else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 300)}`);
} catch (e) { log.calls.push({ ts: new Date().toISOString(), id, status: 'error' }); writeFileSync(LOG, JSON.stringify(log, null, 1)); console.log(`[${id}] 오류 ${scrub(e.message)}`); }
finally { clearTimeout(t); }
