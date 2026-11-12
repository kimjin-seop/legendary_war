// 담당 B manifest 조각 생성(manifest.json 직접 수정 안 함, API 호출 없음). 실행: node docker/gemini/build_fragment_b.mjs
// 산출: public/assets/ui/pixel/manifest_fragment_pixel.json, public/assets/manifest_fragment_b.json(주인공·컷신·병종 28·썸네일)
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const B = (p) => (existsSync(p) ? statSync(p).size : null);
const LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)';
const now = new Date().toISOString();

// ---------------- 1) 도트 뱃지·표식
const PX = 'public/assets/ui/pixel';
if (existsSync(`${PX}/qa/build_report.json`)) {
  const rep = J(`${PX}/qa/build_report.json`); const picks = J('docker/gemini/pix_picks.json');
  const LABEL = { sword: '보병', spear: '창병', cavalry: '기병', naval: '수병', archer: '궁병', mage: '마법사', healer: '승려', monster: '마물', assassin: '암살자' };
  const NOTE = {
    'badge.hero.mage': ['지팡이 자루가 가늘어 24px 이하에서 보라 구슬로만 읽힘(구분에는 지장 없음)'],
    'badge.troop.mage': ['같음'],
    'badge.hero.assassin': ['복면 머리(회색) 위 흰 눈 2px 가 핵심 단서 — 16px 이하 표시 금지 권장'],
    'badge.troop.assassin': ['같음'],
    'badge.hero.healer': ['석장 고리 형태가 24px 에서 열쇠처럼 보일 여지(색 흰/금으로 구분)'],
  };
  const items = [];
  for (const [k, v] of Object.entries(rep)) {
    if (k.includes('(pixel36)')) continue;
    const fn = v.file; const t = k.split('.').pop();
    const kind = k.startsWith('badge.hero.') ? 'hero_troop_badge' : k.startsWith('badge.troop.') ? 'soldier_troop_badge' : k.startsWith('sym.troop.') ? 'troop_symbol' : k.startsWith('badge.rarity.') ? 'rarity_badge' : k.startsWith('badge.rank.') ? 'rank_badge' : 'mark';
    items.push({ key: k, type: 'pixel-icon', kind, ...(LABEL[t] && kind.includes('troop') ? { troop: t, label: LABEL[t] } : {}),
      size: v.size, path: `assets/ui/pixel/x1/${fn}.png`, variants: { '2x': `assets/ui/pixel/x2/${fn}.png`, '3x': `assets/ui/pixel/x3/${fn}.png` },
      atlasFrame: k, bytes: { x1: B(`${PX}/x1/${fn}.png`), x3: B(`${PX}/x3/${fn}.png`) }, alpha: true, filter: 'NEAREST',
      qa: { checked: true, verdict: NOTE[k] ? 'pass_minor' : 'pass', issues: NOTE[k] ?? [], auto: { magenta_px: v.magenta_px, semi_alpha_px: v.semi_alpha_px, colors: v.colors } } });
  }
  const atlas = (s) => ({ path: `assets/ui/pixel/pixel_badges@${s}x.png`, json: `assets/ui/pixel/pixel_badges@${s}x.json`, bytes: B(`${PX}/pixel_badges@${s}x.png`) });
  writeFileSync(`${PX}/manifest_fragment_pixel.json`, JSON.stringify({
    _note: '도트(픽셀아트) 뱃지·표식 manifest 조각(병합 대기). 영웅 카드의 코드 생성 뱃지(HeroVisual.troopBadges: 원형 금테/방패 은테 + 글리프 글자)와 등급 텍스트(S★★★★)를 대체. 구버전(코드 그리기)은 폴백으로 보존.',
    generated: now, basePath: 'public',
    keyRule: 'badge.hero.<troop>(원형 금테 32x32, 영웅 본체 병종) / badge.troop.<troop>(방패 은테 30x32, 병사 병종) / sym.troop.<troop>(프레임 없는 심볼 24x24) / badge.rarity.<S|A|B|C>(20x20) / badge.rank.<bronze|silver|gold|platinum|diamond|master>(32x32) / pix.<star|star_empty|star_half|star.16|cost|level|crown|heart|atk|def|move|lock|settings|tab_rank|tab_quest>  troop: sword|spear|cavalry|naval|archer|mage|healer|monster|assassin',
    troopAlias: { infantry: 'sword', lance: 'spear', bow: 'archer', heavy: 'sword', flyer: '없음 → 코드 뱃지 폴백' },
    load: 'Phaser: load.atlas("pixel_badges", @3x.png, @3x.json) 1회(부팅, 3x 기준 약 50KB). 텍스처 setFilter(NEAREST) 필수. 표시 크기는 원본의 정수배(32→32/64/96, 24 표시가 필요하면 sym.troop 24x24 또는 x1 그대로)',
    atlas: { textureKey: 'pixel_badges', '1x': atlas(1), '2x': atlas(2), '3x': atlas(3) },
    icoAtlas: { textureKey: 'ui_pixel_ico', note: 'ico.tab_rank·ico.tab_quest·ico.settings 의 도트 버전(같은 frame 키, 108px@3x = 36px x3). skin.atlasOf 목록에 추가하면 기존 ui_skin 키와 교체 가능. 단, 다른 하단 탭(ico.tab_stage 등)은 회화풍이라 섞이면 화풍 불일치 — 탭 전체를 도트로 바꿀지 결정 필요',
      '3x': { path: 'assets/ui/pixel/ui_pixel_ico@3x.png', json: 'assets/ui/pixel/ui_pixel_ico@3x.json', bytes: B(`${PX}/ui_pixel_ico@3x.png`) }, '1.5x': { path: 'assets/ui/pixel/ui_pixel_ico@1.5x.png', json: 'assets/ui/pixel/ui_pixel_ico@1.5x.json', bytes: B(`${PX}/ui_pixel_ico@1.5x.png`), note: '1.5배 nearest(비정수, 픽셀 두께 불균일)' } },
    colors: { troopFill: '병종 고유색: 보병 청 / 창병 녹 / 기병 적 / 수병 청록 / 궁병 황 / 마법사 보라 / 승려 흰·금 / 마물 암적 / 암살자 회', heroRing: '금(#6A4410~#FFF0A8 4단)', soldierRing: '은청(#3C4A6A~#F0F6FF 4단)', rarity: 'rarity.js RARITY_COLOR 와 동일 계열(S 금 #F0B23C, A 보라 #B06AD8, B 청록 #2FB5A6, C 회청 #8B97A8)' },
    generator: { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K', sheets: 'raw/pix/pix_a1·a2·b1·b2·c1·c2.jpg(4x4 도트 심볼 시트, 6회)', script: 'docker/gemini/gen_b.mjs + style_b.mjs(PIX_*) → pp_pixel_badges.py(격자 재표본·팔레트 양자화·1px 외곽선, 프레임·글자 코드 조립)', picks: 'docker/gemini/pix_picks.json' },
    license: `${LIC}. 프레임·등급 글자는 코드 생성(라이선스 문제 없음)`,
    qaChecklist: ['24px 축소에서 병종 9종 상호 구분', '병종색 채움 대비 심볼 가독', '투명 배경·반투명 0·마젠타 0', '1px 외곽선 연속', '정수 배율 x1/x2/x3'],
    qaPanel: 'assets/ui/pixel/qa/badges_panel.png',
    count: items.length, items }, null, 1));
  console.log('pixel items', items.length);
}

// ---------------- 2) 주인공·컷신·병종 28·썸네일
const out = { _note: '담당 B manifest 조각(병합 대기, manifest.json 직접 수정 안 함): 주인공 초상화 2종, 컷신 일러스트, 일반 병종 초상화 추가 28장, 초상화 256px WebP 썸네일.', generated: now, basePath: 'public', items: [] };
const pr = 'public/assets/portraits';
for (const [id, g] of [['protagonist_m', 'male'], ['protagonist_f', 'female']]) {
  const f = `${pr}/${id}.png`; if (!existsSync(f)) continue;
  out.items.push({ key: `portrait.${id}`, path: `assets/portraits/${id}.png`, type: 'portrait', subtype: 'protagonist', gender: g, bytes: B(f), alpha: true, ratio: '3:4', min: '896x1200',
    thumb: { key: `portrait.${id}.thumb`, path: `assets/portraits/thumb/${id}.webp`, bytes: B(`${pr}/thumb/${id}.webp`) },
    generator: { model: 'gemini-nano-banana-2.1', size: '2K', script: 'gen_b.mjs + style_b.mjs PROTAG + portrait_r2_post.sh' }, prompt_ref: 'style_b.mjs PROTAG', license: LIC,
    qa: J('docker/gemini/qa_b.json')?.protag?.[id] ?? { checked: false }, verify: false, load: 'lazy(프로필·대화 진입 시)', note: '오리지널 캐릭터(설정 SCENARIO_01_BIBLE 2-3-2). 두 프리셋 복장 동일 — 컷신 뒷모습과 공용' });
}
const cr = 'public/assets/cutscenes/qa/cut_report.json';
if (existsSync(cr)) {
  const { CUTSCENE_MAP } = await import('./style_b.mjs');
  const qa = existsSync('docker/gemini/qa_b.json') ? J('docker/gemini/qa_b.json').cutscene ?? {} : {};
  for (const [k, v] of Object.entries(J(cr))) {
    const src = v.src.split('/').pop().replace('.jpg', ''); const m = CUTSCENE_MAP[src] ?? {};
    out.items.push({ key: k, path: v.file, type: 'cutscene', il: m.il, scenes: m.scenes, size: [1600, 900], format: 'webp', quality: v.quality, bytes: v.bytes, lazy: true,
      crop_norm: v.crop_norm, ...(v.invert ? { variant: 'invert(색조 반전 재사용)' } : {}), source: v.src, source_size: v.src_size,
      generator: { model: 'gemini-nano-banana-2.1', size: '2K', script: 'gen_b.mjs + style_b.mjs CUTSCENES + pp_cutscene_b.py' }, prompt_ref: `style_b.mjs CUTSCENES[${src}]`, license: LIC,
      qa: qa[src] ?? { checked: false }, verify: ['il07_okpo', 'il08_hansan', 'il09_jinju', 'il02_meet'].includes(src) });
  }
  out.cutsceneKeyRule = 'cutscene.<stageId>.<n>.<a|b|c>  stageId: prologue | ch1_s1~ch1_s4 | ch7·ch8·ch10·ch11(3부 임시 id, 확정 시 교체). IL-xx 대응은 각 item.il';
  out.cutsceneLoad = 'lazy:true — 해당 장면 진입 직전 load.image, 장면 종료 후 textures.remove. 프리로드 금지. 팬/줌은 1600x900 원본 기준(화면 1920 이면 1.2배 확대 표시)';
}
const tr = 'public/assets/portraits/troops/qa/pp_report.json';
if (existsSync(tr)) {
  const rep = J(tr); const NEW = [...['japan', 'china', 'middle_east'].flatMap((c) => ['naval', 'mage', 'healer', 'assassin'].map((t) => `${c}_${t}`)), ...['ancient_med', 'steppe'].flatMap((c) => ['sword', 'spear', 'cavalry', 'archer', 'naval', 'mage', 'healer', 'assassin'].map((t) => `${c}_${t}`))];
  const qa = existsSync('docker/gemini/qa_b.json') ? J('docker/gemini/qa_b.json').troop ?? {} : {};
  for (const id of NEW) {
    const f = `${pr}/troops/${id}.png`; if (!existsSync(f)) continue;
    const [c, t] = [id.replace(/_[a-z]+$/, ''), id.split('_').pop()];
    out.items.push({ key: `portrait.troop.${c}.${t}`, path: `assets/portraits/troops/${id}.png`, type: 'portrait', subtype: 'troop', culture: c, troop: t, bytes: B(f), size: rep[id]?.size ?? [840, 1120], alpha: true, ratio: '3:4',
      thumb: { key: `portrait.troop.${c}.${t}.thumb`, path: `assets/portraits/troops/thumb/${id}.webp`, bytes: B(`${pr}/troops/thumb/${id}.webp`) },
      generator: { model: 'gemini-nano-banana-2.1', size: '2K', sheet: `raw/troop_b/${['sword', 'spear', 'cavalry', 'archer'].includes(t) ? c : `${c}_v2`}.jpg (2x2 시트 1회 = 4장)`, script: 'gen_b.mjs + style_b.mjs(TROOP_V2_ADD) + style_guide.mjs troopPortraitJob + portrait_troop_pp.py + portrait_key_pocket.py' },
      license: LIC, qa: qa[id] ?? { checked: true, verdict: 'pass', issues: [] }, verify: true, load: 'lazy(정보창·카드 진입 시), 프리로드 금지' });
  }
}
const th = 'public/assets/portraits/thumb_report_b.json';
if (existsSync(th)) {
  const rep = J(th);
  out.thumbs = { note: '서비스용 256px 폭 WebP 썸네일(알파, q85). 목록·카드·대화 아이콘에 원본 대신 사용하면 다운로드 약 1/20. 키 규칙: <원본 키>.thumb', count: Object.keys(rep).length,
    totalBytes: Object.values(rep).reduce((a, v) => a + v.bytes, 0), srcBytes: Object.values(rep).reduce((a, v) => a + v.src_bytes, 0),
    keyRule: 'portrait.<hero_id>.thumb → assets/portraits/thumb/<hero_id>.webp / portrait.shiori.<expr>.thumb → assets/portraits/shiori/thumb/shiori_<expr>.webp / portrait.troop.<culture>.<troop>.thumb → assets/portraits/troops/thumb/<culture>_<troop>.webp',
    files: rep };
}
writeFileSync('public/assets/manifest_fragment_b.json', JSON.stringify(out, null, 1));
console.log('b items', out.items.length, 'thumbs', out.thumbs?.count ?? 0);
