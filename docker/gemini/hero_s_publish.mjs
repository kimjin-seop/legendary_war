// S등급 2차 반영(호출 없음, 안아트 2026-11-04): 신규 S 영웅 초상 + S 배경 판 → manifest 조각 public/assets/portraits/portrait_hero_s_manifest_fragment.json
//   초상: docker/gemini/portrait_campaign/out/<code>.png(+thumb/<code>.webp) → public/assets/portraits/<code>.png + thumb/<code>.webp (키 portrait.<code>(+.thumb))
//   배경: docker/gemini/portrait_s/preview/s_bg_<theme>.jpg → public/assets/portraits/s_bg/<theme>.webp (키 portrait.s_bg.<theme>, 불투명 896x1200)
//   배경 webp 변환은 hero_s_bg_webp.py 가 먼저 수행. 실행(저장소 루트): node docker/gemini/hero_s_publish.mjs
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, mkdirSync } from 'node:fs';
import { S_NEW, S_BG_THEMES } from './portrait_s_style.mjs';
const O = 'docker/gemini/portrait_campaign/out', P = 'public/assets/portraits';
const L = readFileSync('docker/gemini/portrait_s/calls_log.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const QA = {
  chok_jun_gyeong: { verdict: 'minor', issues: ['방패 오른쪽 끝이 프레임 가장자리에 닿음', '머리 위 여백이 기존 초상(6%)보다 좁음(약 1.5%)'], notes: '참조 없이 새로 그림. 외곽 글로우 없음, 림라이트가 외곽선 안쪽' },
  belisarius: { verdict: 'minor', issues: ['r0 외곽 크림색 스티커 테두리 → r1 재생성 후에도 일부 남아 portrait_s_outline_fix.py 로 제거(망토 아래 오른쪽 끝에 약간 남음)', '망토 외곽선이 일부 얇아짐'], notes: '능선 투구·라멜라·진홍 망토·기병창. 십자 문양 없음' },
  baybars: { verdict: 'pass', issues: ['투구 앞 코가리개 모양 장식(지시는 없음, 시대상 허용)'], notes: '흰 천 감은 뾰족 투구·라멜라·녹색 전포·복합궁·화살통. 글자·초승달 없음' },
};
mkdirSync(`${P}/thumb`, { recursive: true });
const items = [];
for (const [code, h] of Object.entries(S_NEW)) {
  const src = `${O}/${code}.png`, dst = `${P}/${code}.png`, th = `${P}/thumb/${code}.webp`;
  copyFileSync(src, dst); copyFileSync(`${O}/thumb/${code}.webp`, th);
  items.push({ key: `portrait.${code}`, path: dst.replace('public/', ''), type: 'portrait', subtype: 'hero', grade: 'S', size: '896x1200', ratio: '3:4', alpha: true, bytes: statSync(dst).size,
    hero: code, name_ko: h.name, culture: h.culture, era: h.era, unit_type: h.unit, expressions: ['neutral'], expression_fallback: '모든 expr → neutral',
    s_layers: { bg: `portrait.s_bg.${h.bg}`, frame: 'atlas.uiskin_gacha#frame.rank.s', ornament: 'atlas.uiskin_gacha#frame.rank.s.ornament', order: 'bg → portrait → frame → ornament (전투 대사·목록은 portrait 만)' },
    thumb: { key: `portrait.${code}.thumb`, path: th.replace('public/', ''), size: '256x343', bytes: statSync(th).size },
    generator: { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K', script: 'docker/gemini/portrait_s_gen.mjs(portrait_s_style.mjs S_NEW, 참조 없음) → portrait_npc_v3_pp.sh(alpha_process.py B, T_lo=40 T_hi=90)' + (code === 'belisarius' ? ' → portrait_s_outline_fix.py → alpha_keep_main.py' : '') },
    prompt_ref: `docker/gemini/portrait_s_style.mjs S_NEW.${code}`, calls: L.filter((c) => c.id === code).length, qa: { checked: true, ...QA[code] },
    verify: true, verify_note: '시대 복식 일반화(특정 인물 얼굴 재현 아님)', license: 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)' });
}
// 서버 영웅 코드 별칭(2026-11-04): 서버 heroes 코드 baibars ↔ 에셋 baybars. 파일 복사(webp·thumb) + 별칭 항목, 기존 baybars 키 유지
const ALIAS = { baibars: 'baybars' };
for (const [a, src] of Object.entries(ALIAS)) {
  const base = items.find((i) => i.key === `portrait.${src}`); if (!base) throw new Error(`별칭 원본 없음 ${src}`);
  const w = `${P}/${a}.webp`, th = `${P}/thumb/${a}.webp`;
  copyFileSync(`${P}/${src}.webp`, w); copyFileSync(`${P}/thumb/${src}.webp`, th);
  items.push({ ...base, key: `portrait.${a}`, path: w.replace('public/', ''), format: 'webp', bytes: statSync(w).size, hero: a, copy_of: `portrait.${src}`,
    thumb: { ...base.thumb, key: `portrait.${a}.thumb`, path: th.replace('public/', ''), bytes: statSync(th).size }, note: `서버 영웅 코드 ${a} 별칭(파일 = ${src}.webp 복사)` });
}
const BGQA = { royal_west: '유럽식 첨탑 성(서양 영웅용)', royal_east: '기와 성문 누각(동아시아 영웅용)' };
for (const t of Object.keys(S_BG_THEMES)) {
  if (t === 'royal') continue;
  const f = `${P}/s_bg/${t}.webp`; if (!existsSync(f)) throw new Error(`없음 ${f}`);
  items.push({ key: `portrait.s_bg.${t}`, path: f.replace('public/', ''), type: 'image', subtype: 's_portrait_bg', size: '896x1200', ratio: '3:4', alpha: false, format: 'webp', bytes: statSync(f).size,
    theme: t, desc: S_BG_THEMES[t], note: `S등급 초상 배경 판(영웅 공유 테마). ${BGQA[t] ?? ''}`.trim(), load: 'lazy(카드·상세 화면에서만)',
    generator: { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K', sheet: ['sea', 'fire', 'steppe', 'royal_west'].includes(t) ? 'portrait_s/raw/s_bg_a.jpg' : 'portrait_s/raw/s_bg_b.jpg', script: 'docker/gemini/portrait_s_gen.mjs → portrait_s_mock.py/hero_s_bg_webp.py(2x2 칸 자르기)' },
    qa: { checked: true, verdict: 'pass' }, license: 'Google Gemini API 생성물(SynthID 워터마크 포함)' });
}
writeFileSync(`${P}/portrait_hero_s_manifest_fragment.json`, JSON.stringify({ note: 'S등급 2차(안아트 2026-11-04): 신규 S 영웅 초상(portrait.<code>) + S 배경 판(portrait.s_bg.<theme>). 합성 순서는 item.s_layers', items }, null, 1));
console.log(items.map((i) => i.key).join(' '));
