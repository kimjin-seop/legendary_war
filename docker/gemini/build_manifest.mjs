// public/assets/manifest.json 생성: 최종 폴더를 스캔해 키 규칙대로 항목 기록. QA 판정은 docker/gemini/qa.json(사람이 눈으로 판정한 결과)을 병합.
// 실행: docker run --rm -v "$PWD":/app -w /app node:22 node docker/gemini/build_manifest.mjs
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { HEROES } from './style_guide.mjs';

const A = 'public/assets';
const qa = existsSync('docker/gemini/qa.json') ? JSON.parse(readFileSync('docker/gemini/qa.json', 'utf8')) : {};
const GEN = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '2K', script: 'docker/gemini/gen.mjs + style_guide.mjs' };
const LIC_AI = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요';
const LIC_CODE = '자체 코드 합성(제3자 저작물 없음)';
const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const rel = (p) => p.replace(/^public\//, '');
const items = [];
const add = (key, path, type, extra = {}) => { if (!existsSync(path)) return; const q = (extra.qaKey && qa[extra.qaKey]) ?? qa[key] ?? qa[key.split('.').slice(0, 2).join('.')] ?? qa[key.split('.')[0]] ?? { checked: false, verdict: null, issues: [] }; items.push({ key, path: rel(path), type, bytes: sz(path), generator: extra.generator ?? GEN, prompt_ref: extra.prompt_ref ?? null, license: extra.license ?? LIC_AI, qa: q, verify: extra.verify ?? false, ...extra.meta }); };

// tiles
if (existsSync(`${A}/tiles/32`)) for (const f of readdirSync(`${A}/tiles/32`).filter((f) => f.endsWith('.png')).sort()) {
  const v = f.slice(0, -4); const code = v.replace(/_(h_)?[a-z]$/, ''); const key = `tile.${code}${v.includes('_h_') ? '.h' : ''}.${v.slice(-1)}`;
  add(key, `${A}/tiles/32/${f}`, 'tile', { prompt_ref: `style_guide.mjs JOBS.tiles[${v.replace('_h_', '_')}]${v.includes('_h_') ? ' (90° 회전 파생)' : ''}`, meta: { size: '32x32', terrain_code: code, variants: { x3: rel(`${A}/tiles/x3/${f}`), x4: rel(`${A}/tiles/x4/${f}`) }, tileset: rel(`${A}/tiles/tileset_32.png`), alpha: false, palette: 'tiles/tileset_32.json' } });
}
// sprites
if (existsSync(`${A}/sprites`)) for (const f of readdirSync(`${A}/sprites`).filter((f) => f.endsWith('.png') && !f.startsWith('preview')).sort()) {
  const [unit, side] = f.slice(0, -4).split('_');
  add(`unit.${unit}.${side}`, `${A}/sprites/${f}`, 'spritesheet', { prompt_ref: `style_guide.mjs JOBS.sprites[sheet_${unit}]${side === 'enemy' ? ' (파랑→빨강 색상 회전 파생)' : ''}`, meta: { size: '96x128', frame: '32x32', frameWidth: 32, frameHeight: 32, grid: '3x4(행: down,left,right,up / 열: walk1,idle,walk2)', idle: rel(`${A}/sprites/idle/${f}`), variants: { x3: rel(`${A}/sprites/x3/${f}`), x4: rel(`${A}/sprites/x4/${f}`) }, alpha: true, palette: 'sprites/palette.json' } });
}
// 64px 타일: tile.<code>.64.<variant>
if (existsSync(`${A}/tiles/64`)) for (const f of readdirSync(`${A}/tiles/64`).filter((f) => f.endsWith('.png')).sort()) {
  const v = f.slice(0, -4); const EXT_CODES = ['snow_desert']; const code = EXT_CODES.find((c) => v.startsWith(`${c}_`)) ?? v.split('_')[0]; const variant = v.slice(code.length + 1); const isExt = ['shallows', 'swamp', 'snow_desert', 'ice', 'cliff', 'wall', 'village', 'bridge'].includes(code);
  add(`tile.${code}.64.${variant}`, `${A}/tiles/64/${f}`, 'tile', { prompt_ref: `style_guide.mjs JOBS.tiles64[${v}]${/_(h|90|180|270)$/.test(v) ? ' (회전 파생)' : ''}`, meta: { size: '64x64', scale: 1, terrain_code: code, variants: { x2: rel(`${A}/tiles/64_x2/${f}`) }, tileset: rel(`${A}/tiles/tileset_64.png`), alpha: false, palette: 'tiles/tileset_64.json', fallback: `tile.${code}.${v.includes('road_corner') ? 'a' : variant.slice(-1) || 'a'}` } });
}
const TILE_FALLBACK = { shallows: 'tile.water.64.a', swamp: 'tile.plain.64.a', snow_desert: 'tile.plain.64.a', ice: 'tile.snow_desert.64.a', cliff: 'tile.mountain.64.a', wall: 'tile.castle.64.a', village: 'tile.plain.64.a', bridge: 'tile.road.64.v' };
const TILE_NOTE = { 'snow_desert.a': '설원', 'ice.a': '얼음 호수(전용 키, terrains.json 미정의)', 'snow_desert.c': '사막', 'snow_desert.d': '사막', 'bridge.h_a': '다리 가로(난간 널판)', 'bridge.h_b': '다리 가로(밧줄)', 'bridge.v_a': '다리 세로(h_a 90도 회전)', 'bridge.v_b': '다리 세로(h_b 90도 회전)' };
for (const it of items) { const m = it.key.match(/^tile\.(shallows|swamp|snow_desert|ice|cliff|wall|village|bridge)\.64\.(.+)$/); if (!m) continue; const [, code, variant] = m;
  it.prompt_ref = `style_guide.mjs JOBS.tsheets (2x2 묶음 시트 1회 호출 → pp_tiles2.mjs)${code === 'bridge' && variant.startsWith('v_') ? ' + 가로 다리 90도 회전 파생' : ''}`; it.tileset = rel(`${A}/tiles/tileset_64_ext.png`); it.palette = 'tiles/tileset_64_ext.json'; it.fallback = TILE_FALLBACK[code]; it.biome_note = TILE_NOTE[`${code}.${variant}`]; it.mode = ['cliff', 'wall', 'bridge', 'village'].includes(code) ? 'piece(가로/세로 이어붙이는 조각, 상하좌우 반복 아님)' : 'seamless-texture(교차 페이드 이음새 보정)'; it.alpha = false; }
// 64px 유닛: unit.<class>.<side>.64 / 영웅 전용: unit.hero.<code>.<side>.64
const poolDefs = existsSync('docker/gemini/cmd_pool.json') ? JSON.parse(readFileSync('docker/gemini/cmd_pool.json', 'utf8')).items : [];
const unitTypeOf = Object.fromEntries((existsSync('database/data/heroes.json') ? JSON.parse(readFileSync('database/data/heroes.json', 'utf8')).items : []).map((h) => [h.code, h.unit_type]));
if (existsSync(`${A}/sprites/64`)) for (const f of readdirSync(`${A}/sprites/64`).filter((f) => f.endsWith('.png') && !f.endsWith('_v1.png') && !/^hero_.+_sheet\.png$/.test(f)) /* hero_*_sheet 는 hero_dir 인스턴스 소유(조각 파일로 병합 대기) */.sort()) {
  const base = f.slice(0, -4);
  const sm = base.match(/^(?:([a-z_]+?)_)?(sword|spear|cavalry|archer|mage|healer|heavy|flying)_(ally|enemy)_sheet$/); // 방향 시트: [<culture>_]<type>_<side>_sheet
  if (sm) { const [, culture, type, sd] = sm; const key = culture ? `unit.${culture}.${type}.${sd}.64.sheet` : `unit.${type}.${sd}.64.sheet`;
    add(key, `${A}/sprites/64/${f}`, 'spritesheet', { qaKey: `dir64.${culture ?? 'default'}.${type}`, verify: !!culture, prompt_ref: culture ? `style_guide.mjs JOBS.dir64_${culture}[${type}] (3x3 시트 1회 호출, 우측=좌측 미러)` : `style_guide.mjs JOBS.dir64[${type}] (3x3 시트 1회 호출, 우측=좌측 미러)`,
      meta: { size: '192x256', frameWidth: 64, frameHeight: 64, grid: '3x4(행: down,left,right,up / 열: walk1,idle,walk2)', culture: culture ?? 'default', unit_type: type, side: sd, mirror_baked: 'right', walk_frames: '[r*3, r*3+1, r*3+2, r*3+1] (r: 0 down,1 left,2 right,3 up)', down_row: 'down 행은 시트의 정면 idle 칸 복제(walk1/walk2 는 1px 위 바운스). 기존 단일 정면 .64 이미지(v1 보간)와는 약간 다름 → 방향 시트를 쓸 때는 down 행도 시트 것을 사용',
        team_mark: sd === 'ally' ? '발밑 팀색 받침 마커(#3E8EF7, 61~63행 타원, 스타일 A). 의상은 원색' : '발밑 팀색 받침 마커(#E04A4A) + 팔레트 스왑(파랑 계열 슬롯만 빨강 계열)', pixel_pipeline: 'v2(도트 격자 직접 샘플 200x200, 32색, 외곽선 1px 통일, 링 없음). 이전 v1 은 *_v1.png 백업', previous: existsSync(`${A}/sprites/64/${f.replace('.png', '_v1.png')}`) ? rel(`${A}/sprites/64/${f.replace('.png', '_v1.png')}`) : undefined,
        variants: { x2: rel(`${A}/sprites/64_x2/${f}`) }, alpha: true, palette: `sprites/palette_64_dir_${culture ?? 'default'}_v2.json`,
        fallback: culture ? `unit.${type}.${sd}.64.sheet` : `unit.${type}.${sd}.64`, single_frame_fallback: culture ? undefined : `unit.${type}.${sd}.64 (정면 단일, down 행과 동일)` } }); continue; }
  const side = base.endsWith('_ally') ? 'ally' : 'enemy'; const name = base.replace(/_(ally|enemy)$/, '');
  if (name.startsWith('cmd_')) { const pid = name.slice(4); const p = poolDefs.find((x) => x.pool_id === pid) ?? {};
    add(`unit.cmd.${pid}.${side}.64`, `${A}/sprites/64/${f}`, 'sprite', { prompt_ref: `style_guide.mjs JOBS.pool (cmd_pool.json[${pid}], 3x3 시트 분할)`, meta: { size: '64x64', scale: 1, pool_id: pid, archetype: p.desc, region: p.region, eras: p.eras, gender: p.gender, unit_types: p.unit_types, team_mark: side === 'ally' ? '외곽 1px #3E8EF7 링 + 12% 틴트' : '외곽 1px #E04A4A 링 + 12% 틴트', variants: { x2: rel(`${A}/sprites/64_x2/${f}`) }, alpha: true, pose: 'front idle(코드 바운스 전제)', fallback: `unit.${(p.unit_types ?? ['sword'])[0]}.${side}.64` } }); continue; }
  if (name.startsWith('hero_')) { const code = name.slice(5); const ut = unitTypeOf[code] ?? 'sword';
    add(`unit.hero.${code}.${side}.64`, `${A}/sprites/64/${f}`, 'sprite', { prompt_ref: `style_guide.mjs heroSpriteJob(sprite_prompts.json[${code}])`, meta: { size: '64x64', scale: 1, hero: code, unit_type: ut, team_mark: side === 'ally' ? '외곽 1px #3E8EF7 링 + 12% 틴트' : '외곽 1px #E04A4A 링 + 12% 틴트', fallback: `unit.${ut}.${side}.64`, variants: { x2: rel(`${A}/sprites/64_x2/${f}`) }, alpha: true, pose: 'front idle(코드 바운스 전제)' } }); }
  else add(`unit.${name}.${side}.64`, `${A}/sprites/64/${f}`, 'sprite', { prompt_ref: `style_guide.mjs JOBS.sprites64[${name}]${side === 'enemy' ? ' (파랑→빨강 색상 회전 파생)' : ''}`, meta: { size: '64x64', scale: 1, variants: { x2: rel(`${A}/sprites/64_x2/${f}`) }, alpha: true, pose: 'front idle(코드 바운스 전제)', palette: 'sprites/palette_64.json', fallback: `unit.${name}.${side}` } });
}
// ui
if (existsSync(`${A}/ui/icons`)) for (const f of readdirSync(`${A}/ui/icons`).filter((f) => f.endsWith('.png')).sort()) add(`icon.${f.slice(0, -4)}`, `${A}/ui/icons/${f}`, 'icon', { prompt_ref: 'style_guide.mjs JOBS.ui[icons_a|icons_b] 시트 분할', meta: { size: '128x128', alpha: true } });
if (existsSync(`${A}/ui/deco`)) for (const f of readdirSync(`${A}/ui/deco`).filter((f) => f.endsWith('.png')).sort()) add(`deco.${f.slice(0, -4)}`, `${A}/ui/deco/${f}`, 'deco', { prompt_ref: `style_guide.mjs JOBS.ui[${f.slice(0, -4)}]`, meta: { alpha: true, placement: 'ui/design_spec.json border.*' } });
if (existsSync(`${A}/ui/design_spec.json`)) add('ui.design_spec', `${A}/ui/design_spec.json`, 'spec', { generator: 'hand-authored', license: '자체 작성' });
// effects
if (existsSync(`${A}/effects/256`)) for (const f of readdirSync(`${A}/effects/256`).filter((f) => f.endsWith('.png')).sort()) add(`fx.${f.slice(0, -4)}`, `${A}/effects/256/${f}`, 'effect', { prompt_ref: `style_guide.mjs JOBS.effects[${f.slice(0, -4)}]`, meta: { size: '256x256', alpha: true, variants: { '128': rel(`${A}/effects/128/${f}`), add_256: rel(`${A}/effects/add_256/${f}`) }, blend_hint: 'add_256 은 검정 배경, Phaser BlendModes.ADD' } });
// portraits
for (const h of HEROES) add(`portrait.${h.id}`, `${A}/portraits/${h.id}.png`, 'portrait', { prompt_ref: `style_guide.mjs HEROES[${h.id}] (표정 변형은 desc 에 SHIORI_EXPR 형식의 표정 문장을 덧붙여 재생성)`, verify: h.verify, meta: { alpha: true, ratio: '3:4', min: '896x1200', preview: rel(`${A}/portraits/preview/${h.id}.png`), expression: 'neutral', campaign_temp_code: h.campaign ? true : undefined, sprite: existsSync(`${A}/sprites/64/hero_${h.id}_ally.png`) ? `unit.hero.${h.id}` : null } });
for (const e of ['neutral', 'smile', 'surprise', 'serious', 'cheer', 'regret']) add(`portrait.shiori.${e}`, `${A}/portraits/shiori/shiori_${e}.png`, 'portrait', { prompt_ref: `style_guide.mjs SHIORI_BASE + SHIORI_EXPR[${e}]`, meta: { alpha: true, ratio: '3:4', min: '896x1200' } });
// audio (이전 라운드 산출 + 추가 SFX)
if (existsSync(`${A}/audio/bgm`)) for (const f of readdirSync(`${A}/audio/bgm`).filter((f) => f.endsWith('.mp3')).sort()) add(`bgm.${f.slice(4, -4)}`, `${A}/audio/bgm/${f}`, 'bgm', { generator: { model: 'lyria-3.5', api: 'Interactions API', script: 'docker/gemini/generate_bgm.mjs + bgm_postprocess.sh(ffmpeg 루프 크로스페이드, 128kbps)' }, prompt_ref: 'generate_bgm.mjs SLOTS', meta: { loop: true, listen_verified: false } });
if (existsSync(`${A}/audio/sfx`)) for (const f of readdirSync(`${A}/audio/sfx`).filter((f) => f.endsWith('.wav')).sort()) add(`sfx.${f.slice(4, -4)}`, `${A}/audio/sfx/${f}`, 'sfx', { generator: { script: 'docker/gemini/generate_sfx.mjs / sfx_extra.mjs (코드 합성)' }, license: LIC_CODE, prompt_ref: null, meta: { loop: false, format: 'wav 22.05kHz mono 16bit', listen_verified: false } });

// terrains.json symbol → 타일 키 매핑표(박백엔·윤프론용). 지형 한 개에 변형 여러 개면 variants 에서 무작위/좌표 해시로 선택, 도로·다리는 방향별 키.
const terr = existsSync('database/data/terrains.json') ? JSON.parse(readFileSync('database/data/terrains.json', 'utf8')).items : [];
const keysOf = (code) => items.filter((i) => i.type === 'tile' && i.key.match(/^tile\.[a-z_]+\.64\./) && i.key.startsWith(`tile.${code}.64.`)).map((i) => i.key);
const terrainMap = Object.fromEntries(terr.map((t) => [t.symbol, { code: t.code, name: t.name, keys: keysOf(t.code), note: t.code === 'road' ? '직선 v/h, 모서리 corner(아래→오른쪽)·corner_90/180/270, 교차 cross — 이웃 도로 방향으로 선택' : t.code === 'bridge' ? '다리 방향이 가로면 h_*, 세로면 v_*' : t.code === 'snow_desert' ? 'a=설원, c·d=사막 (맵 바이옴으로 선택). 얼음 호수는 별도 키 tile.ice.64.a(terrains.json 에 지형 추가 시 사용)' : t.code === 'cliff' || t.code === 'wall' ? '가로로 이어지는 조각. 세로 연결은 90도 회전 필요(미제작, 필요 시 요청)' : undefined }]));
// 다른 인스턴스 조각 파일. hero_dir 조각은 병합(코디네이터 승인, 충돌 키는 조각 채택 + 이전 항목을 previous_v1 로 보존), portraits 조각은 읽기만(병합 지시 전)
const MERGE_FRAGMENTS = [`${A}/sprites/hero_dir_manifest_fragment.json`, `${A}/sprites/hero_v3_manifest_fragment.json`, `${A}/sprites/hero_v4_manifest_fragment.json` /* 영웅 101명 1:1 전용 시트 v4(맵: sprites/hero_sprite_map_v4.json) */, `${A}/portraits/portraits_manifest_fragment.json`, `${A}/portraits/portraits_manifest_fragment_r2.json`];
const READONLY_FRAGMENTS = [];
for (const fp of [...MERGE_FRAGMENTS, ...READONLY_FRAGMENTS]) {
  if (!existsSync(fp)) continue; let fr; try { fr = JSON.parse(readFileSync(fp, 'utf8')); } catch (e) { console.log(`[조각] ${fp} 읽기 실패: ${e.message}`); continue; }
  const merge = MERGE_FRAGMENTS.includes(fp); let added = 0, replaced = 0, missing = 0;
  const list = Array.isArray(fr.items) ? fr.items : Object.entries(fr.items ?? {}).map(([key, v]) => ({ key, ...v })); // 초상화 조각은 { key: {...} } 객체형
  for (const it of list) {
    const idx = items.findIndex((i) => i.key === it.key);
    if (!merge) { if (idx >= 0) console.log(`[조각 읽기전용] 충돌 ${it.key}`); continue; }
    const path = String(it.path ?? '').replace(/^public\//, ''); if (!existsSync(`public/${path}`)) { missing++; console.log(`[조각] 파일 없음 → 건너뜀 ${it.key}`); continue; }
    const norm = { ...it, path, type: it.type === 'sprite_sheet' ? 'spritesheet' : it.type, bytes: sz(`public/${path}`), variants: it.path_x2 ? { x2: String(it.path_x2).replace(/^public\//, '') } : it.variants,
      fallback: it.fallback ?? it.fallback_key, qa: it.qa && typeof it.qa === 'object' && 'verdict' in it.qa ? it.qa : it.qa && typeof it.qa === 'object' ? { checked: true, verdict: it.qa.note ? 'pass(메모)' : 'pass', issues: Object.entries(it.qa).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`), detail: it.qa } : { checked: true, verdict: it.qa ?? null, issues: it.qa_note ? [].concat(it.qa_note) : [] }, source_fragment: fp.replace(/^public\//, '') };
    const fwh = Array.isArray(it.frame) ? it.frame : null; if (fwh) { norm.frameWidth = Number(fwh[0]); norm.frameHeight = Number(fwh[1]); }
    if (Array.isArray(it.size)) norm.size = `${it.size[0]}x${it.size[1]}`;
    delete norm.path_x2;
    if (idx >= 0) { const prev = items[idx]; norm.previous_v1 = { note: '조각 병합 전 build_manifest 항목(같은 파일 경로를 가리켰음, 이전 파이프라인 기준 메타)', path: prev.path, bytes_at_merge: prev.bytes, prompt_ref: prev.prompt_ref, qa: prev.qa, team_mark: prev.team_mark }; items[idx] = norm; replaced++; }
    else { items.push(norm); added++; }
  }
  console.log(`[조각] ${fp}: 항목 ${list.length}개 → ${merge ? `병합(추가 ${added}, 교체 ${replaced}, 누락 ${missing})` : '읽기만'}`);
}
// 초상화 별칭: 풀 코드(gwak_jae_u, kim_si_min)와 기존 파일명(gwak_jaeu, kim_simin) 모두 유효(같은 파일)
for (const [alias, orig] of [['gwak_jae_u', 'gwak_jaeu'], ['kim_si_min', 'kim_simin']]) { const src = items.find((i) => i.key === `portrait.${orig}`); if (src && !items.some((i) => i.key === `portrait.${alias}`)) items.push({ ...src, key: `portrait.${alias}`, alias_of: src.key, note: '풀 코드용 별칭 키(파일은 기존 파일명 유지)' }); }
{ const s = items.find((i) => i.key === 'portrait.shiori.surprise'); if (s && existsSync(`${A}/portraits/shiori/shiori_surprise_v1.png`)) s.previous_v1 = { path: rel(`${A}/portraits/shiori/shiori_surprise_v1.png`), note: '갱신 전 표정(초상화 인스턴스 재생성)' }; }
// 전투 컷신 무대 배경: bg.battle.<terrain>.a (pp_bg.mjs)
const BG_GROUND = { plain: 0.78, forest: 0.8, riverside: 0.78, mountain: 0.8, castle: 0.78, village: 0.78, snow: 0.8, desert: 0.78, swamp: 0.8, bridge: 0.78, mountain_b: 0.82, road: 0.78 };
if (existsSync(`${A}/bg`)) for (const f of readdirSync(`${A}/bg`).filter((f) => /^battle_[a-z]+_[ab]\.png$/.test(f)).sort()) { const t = f.slice(7, -6), v = f.slice(-5, -4);
  add(`bg.battle.${t}.${v}`, `${A}/bg/${f}`, 'image', { prompt_ref: `style_guide.mjs JOBS.bgbattle[${v === 'b' ? t + '_b' : t}] (21:9 생성 → pp_bg.mjs 3.2:1 크롭, 320x100 도트, 48색, 최근접 x3)`, meta: { size: '960x300', dots: '320x100(1도트=3px)', displayScale: '정수 2배 표시 기본(1920x600), x2 확대본 제공', variants: { x2: rel(`${A}/bg/x2/${f}`) }, alpha: false, groundLineRatio: BG_GROUND[v === 'b' ? `${t}_b` : t] ?? BG_GROUND[t] ?? 0.78, groundBand: '0.70~0.85 평탄', light: 'top-left(그림자 오른쪽 아래)', layers: '단일 이미지(레이어 분리 PNG 미제공)', terrain: t } }); }
// 검증: 모든 spritesheet 항목은 frameWidth/frameHeight 필수. .64.sheet 는 64x64, 시트 크기는 프레임의 정수배. 위반 시 빌드 실패(manifest 미기록)
{ const errs = []; for (const it of items) { if (it.type !== 'spritesheet') continue; const fw = it.frameWidth, fh = it.frameHeight;
    if (!Number.isInteger(fw) || !Number.isInteger(fh)) { errs.push(`${it.key}: frameWidth/frameHeight 누락`); continue; }
    if (it.key.endsWith('.64.sheet') && (fw !== 64 || fh !== 64)) errs.push(`${it.key}: .64.sheet 인데 ${fw}x${fh}`);
    const m = String(it.size ?? '').match(/^(\d+)x(\d+)$/); if (m && (m[1] % fw || m[2] % fh)) errs.push(`${it.key}: 시트 ${it.size} 가 프레임 ${fw}x${fh} 의 정수배 아님`); }
  const n64 = items.filter((i) => i.key.endsWith('.64.sheet')).length; console.log(`[검증] spritesheet ${items.filter((i) => i.type === 'spritesheet').length}개, .64.sheet ${n64}개, 오류 ${errs.length}`);
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); } }
// 교전 컷신 배경: terrains.json 지형 코드 → bg.battle 키(a/b 변형 중 택1). 전용 이미지가 없는 지형은 가장 가까운 배경으로 대체(fallback 표시)
const BG_BY_TERRAIN = { plain: ['plain'], forest: ['forest'], mountain: ['mountain'], water: ['riverside', 'fallback: 물 위 전투(비행 유닛만)는 강가 배경'], castle: ['castle'], shallows: ['riverside', 'fallback: 여울 전용 없음, 강가 배경(물가)'], bridge: ['bridge'], road: ['road'], swamp: ['swamp'], snow_desert: ['snow', 'desert', '맵 바이옴으로 설원(snow)/사막(desert) 선택. 타일 a=설원, c·d=사막과 일치'], cliff: ['mountain', 'fallback: 절벽(비행 유닛만) 전용 없음, 산악 b(협곡 암벽) 권장'], wall: ['castle', 'fallback: 성벽(진입 불가 지형) 전용 없음, 성 배경'], village: ['village'] };
const battleBgMap = Object.fromEntries(terr.map((t) => { const [k1, k2, k3] = BG_BY_TERRAIN[t.code] ?? ['plain', 'fallback: 매핑 없음']; const multi = k2 && !k2.startsWith('fallback') && !k2.includes(' '); const bases = multi ? [k1, k2] : [k1]; const note = multi ? k3 : k2;
  return [t.code, { symbol: t.symbol, keys: bases.flatMap((b) => ['a', 'b'].map((v) => `bg.battle.${b}.${v}`)).filter((k) => items.some((i) => i.key === k)), ...(note ? { note } : {}) }]; }));
const out = { version: 2, terrainMap, battleBgMap, generatedAt: new Date().toISOString(), basePath: 'public', keyRules: '[시트 구분] 구 32px 걷기 시트 = unit.<class>.<ally|enemy> (type spritesheet, frameWidth/Height 32, 키에 .64 없음) / 64px 방향 시트 = 키가 .64.sheet 로 끝남(frameWidth/Height 64). 로더는 키 추정 대신 항상 item.frameWidth/frameHeight 를 읽을 것 / tile.<code>[.h].<variant>(32px) / tile.<code>.64.<variant>(64px) / unit.<class>.<ally|enemy>(32px 걷기 시트) / unit.<class>.<ally|enemy>.64 / unit.hero.<code>.<ally|enemy>.64(영웅 전용, 없으면 fallback 키 사용) / unit.hero.<code>.<ally|enemy>.64.sheet(영웅 방향 시트, hero_dir 조각 병합분, 없으면 fallback unit.hero.<code>.<side>.64) / unit.<type>.<ally|enemy>.64.sheet(방향 시트, culture=default 폴백) / unit.<culture>.<type>.<ally|enemy>.64.sheet(문화권 방향 시트; 예약 culture id: korea, japan, china, middle_east, europe — 현재 제작: korea·japan·china·middle_east·europe 5종 전부(각 7병종, flying 은 default 사용); 조회 순서 unit.<culture>.<type>... → unit.<type>...64.sheet → unit.<type>...64) / icon.<name> / deco.<name> / fx.<name> / portrait.<hero_id> / portrait.shiori.<expr> / bgm.<slot> / sfx.<name>', loadHints: { terrains: 'terrainMap[symbol].keys 에서 변형 선택. 신규 확장 타일(여울·늪·설원사막·절벽·성벽·마을·다리)은 tiles/tileset_64_ext.png(Tiled .json 순서 포함), 없는 키는 item.fallback 사용. 성벽·절벽·다리·마을은 조각형이라 인접 타일 방향에 맞춰 배치', pixelLayer: '32px 세트(폴백)와 64px 세트(기본) 병행. 풀HD 기준 64px 타일을 정수 배율 1x~2x 로 표시(Phaser pixelArt:true, roundPixels:true, 카메라 줌은 정수만). 32px 세트는 x3/x4 미리 확대본 제공', heroSprites: 'unit.hero.<code>.<side>.64 가 있으면 지휘관 유닛에 사용, 없으면 item.fallback(unit.<unit_type>.<side>.64). 새 영웅 추가 절차: docker/gemini/sprite_prompts.json 에 항목 추가 → sh docker/gemini/hero_sprite.sh <code>', dirSheet64: '키가 .64.sheet 로 끝나는 모든 시트(unit.[<culture>.]<type>.<side>.64.sheet, unit.hero.<code>.<side>.64.sheet): 192x256 PNG, frameWidth:64, frameHeight:64(항목에 명시, 기본값 32 사용 금지), 3열x4행. 행 순서 down,left,right,up / 열 walk1,idle,walk2. right 행은 left 행을 좌우 미러해 구움(mirror_baked:right, 런타임 flipX 불필요). 걷기 프레임 [r*3, r*3+1, r*3+2, r*3+1]. down 행 3칸은 같은 정면 이미지(1px 바운스). 아군/적은 별도 파일(_ally/_enemy). 문화권 키가 없으면 default 키로, 시트가 없으면 단일 정면 .64 로 폴백. Phaser pixelArt:true, 정수 배율 1x~2x', spritesheet: '[구 32px 전용: unit.<class>.<side> 키만 해당 — .64.sheet 는 dirSheet64 참조] frameWidth:32, frameHeight:32, 행 순서 down,left,right,up, 열 walk1,idle,walk2 → 걷기 프레임 [r*3, r*3+1, r*3+2, r*3+1]', portraits: '알파 PNG, 3:4(896x1200 이상). 필요할 때 지연 로드(해당 장면·대화 진입 시), 전체 프리로드 금지. 얼굴 아이콘이 필요하면 상단 중심 정사각형 크롭(가로 전체 폭, 위에서부터) 사용. 별칭 키(alias_of)는 같은 파일을 가리킴', battleBackgrounds: 'bg.battle.<terrain>.a: 960x300 PNG(320x100 도트 x3), 화면 표시 x2 정수 배율(1920x600), 유닛 발은 groundLineRatio 높이에 정렬, 지형 매핑 plain/forest/riverside(물·여울)/mountain/castle/village/snow·desert(snow_desert)/swamp/bridge', effects: '256 알파 PNG 또는 add_256 + ADD 블렌드', audio: 'bgm mp3 loop:true, sfx wav' }, items };
writeFileSync(`${A}/manifest.json`, JSON.stringify(out, null, 1));
console.log(`manifest: ${items.length}개 항목`);
