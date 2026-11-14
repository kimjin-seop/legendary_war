// 런타임 manifest 생성(2026-11-14 성능 1단계): public/assets/manifest.json(제작 메타 포함 약 7.4MB)에서
// 게임(FE)이 읽지 않는 제작 메타 필드를 뺀 public/assets/manifest.runtime.json 을 만든다. 원본 manifest.json 은 건드리지 않는다.
// FE 로더(resources/js/game/assets.js queueAssets)는 runtime 을 먼저 받고, 없거나 실패하면 manifest.json 으로 폴백한다.
//
// 사용(저장소 루트):
//   node scripts/build_runtime_manifest.mjs            생성
//   node scripts/build_runtime_manifest.mjs --check    runtime 이 현재 manifest.json 기준으로 최신인지 확인(오래됐으면 종료 코드 1)
//   (호스트에 node 가 없으면) docker run --rm -v "${PWD}:/app" -w /app node:22-alpine node scripts/build_runtime_manifest.mjs
// manifest.json 을 고치는 모든 작업(docker/gemini/merge_fragments.mjs 병합 등) 뒤에 다시 실행해야 한다(오래된 runtime 은 새 항목이 안 보인다).
//
// 제외 규칙
//  1) META_ANY: 항목 안 어느 깊이에서든 빼는 제작 메타(qa·generator·provenance·license·prompt_ref 등)
//  2) META_TOP: 항목 최상위에서만 빼는 필드 — FE 소스(resources/js)에 식별자로 한 번도 나오지 않는 필드(2026-11-14 스캔).
//     FE 가 새 필드를 읽게 되면 여기서 빼야 한다(빠뜨리면 runtime 에 그 필드가 없어 기능이 안 보임 -> 콘솔 settings.set({ manifestFull: true }) 로 원본 강제 사용 가능)
//  3) 최상위 fragmentsMerged(병합 조각 목록) 제외
// 보강: 크기(size)가 없는 아틀라스·도트 아틀라스 항목/변형에 PNG·WebP 헤더에서 읽은 "WxH" 를 넣는다(최대 텍스처 크기 판정용, assets.texFits)
import { readFileSync, writeFileSync, existsSync, statSync, renameSync, openSync, readSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';

const A = 'public/assets';
const SRC = `${A}/manifest.json`;
const OUT = `${A}/manifest.runtime.json`;
const CHECK = process.argv.includes('--check');

const META_ANY = new Set([
    'qa', 'qa_issues', 'qa_note', 'generator', 'provenance', 'license', 'prompt_ref', 'pipeline', 'pixel_pipeline', 'source_fragment',
    'verify', 'verify_note', 'verify_items', 'backup', 'src_path', 'src_raw', 'src_format', 'src_bytes', 'raw', 'script', 'model', 'calls', 'calls_ok', 'calls_shared',
    'style_ref', 'ref_portrait', 'revision', 'previous', 'previous_v1', 'previous_v_r4', 'post_fix', 'edit_note', 'source_note', 'replaces_note',
    'reframe_20261103', 'attempts', 'md5', 'sha1', 'listen_verified', 'webp_quality', 'jpeg_quality', 'magenta_px', 'notes', 'fallback_note', 'sprite_note', 'alias_note', 'biome_note',
]);
const META_TOP = new Set([
    'thumb_of', 'col_order', 'fallback_key', 'load_hint', 'expression_fallback', 'pose', 'subtype', 'down_row', 'facing_ref', 'used_in', 'roster_code', 'expressions',
    'palette', 'files', 'walk_frames', 'team_mark', 'code_source', 'asset_code', 'bytes_variants', 'npc_default_side', 'usage', 'face_crop', 'copy_of', 'design',
    'zone_stats', 'name_map', 'replaces', 'region_group', 'mirror_baked', 'single_frame_fallback', 'keyRule', 'loadHints', 'framing', 'story_side', 'dots',
    'projection', 'terrain_code', 'faction', 'mergedFrom', 'loader', 'expression', 'empty_last', 'overlay_hint', 'corner_radius', 'blend_hint', 'zones_in_image',
    'slice_px_at_2x', 'placement', 'source_size', 'crop_norm', 'slice9_px_at_3x', 'source_slice9_px_at_3x', 'band_crop', 'native_text', 'asym', 'writing',
    'groundLineRatio', 'coords', 'states', 'troopAlias', 'base_sheet', 'provisional', 'frameNames', 'display_name_hint', 'textureKeyHint', 'shared_file',
    'textureKeyRuntime', 'recipes', 'slice_mode', 'updatedAt', 'capacity', 'global_index_start', 'mapping', 'frameMap', 'map_object', 'thumb_slot_2x',
    'text_box_at_1x', 'campaign_temp_code', 'slice_px_at_1x', 'same_sheet_as', 'tintable', 'thumb_slot', 'horizonRatio', 'display_range', 'anim_frames',
    'slice9', 'coastSource', 'exaggerated', 'frames_added', 'flip_for_right_side', 'icon_slot', 'safe_center_x', 'emblem_slot_2x', 'glow_frame', 'has_text',
    'cardInset', 'proposed_global_index_start', 'glowPad', 'text_x', 'rows_per_frame', 'atlasTexture',
]);

// 최대 텍스처 4096 기기용 축소판(원본 4200x2400 -> 4096x2341, PIL LANCZOS q80, 2026-11-14). FE: ui/StageMapView.js regionHi
const EXTRA_VARIANTS = {
    'map.world.region.east_asia': { max4096: 'assets/map_world/regional/east_asia_4096.webp' },
};

// PNG/WebP 헤더에서 크기 읽기(실패 시 null)
function imageSize(rel) {
    const p = `public/${rel.replace(/^\//, '')}`;
    if (!existsSync(p)) return null;
    const fd = openSync(p, 'r'); const b = Buffer.alloc(40);
    try { readSync(fd, b, 0, 40, 0); } finally { closeSync(fd); }
    if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
        const fmt = b.toString('ascii', 12, 16);
        if (fmt === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
        if (fmt === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
        if (fmt === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    }
    return null;
}

function strip(v, top) {
    if (Array.isArray(v)) return v.map((x) => strip(x, false));
    if (!v || typeof v !== 'object') return v;
    const o = {};
    for (const [k, x] of Object.entries(v)) {
        if (META_ANY.has(k)) continue;
        if (top && META_TOP.has(k)) continue;
        o[k] = strip(x, false);
    }
    return o;
}

const srcText = readFileSync(SRC, 'utf8');
const sha1 = createHash('sha1').update(srcText).digest('hex');
if (CHECK) {
    if (!existsSync(OUT)) { console.error('[runtime manifest] 없음 — 생성 필요'); process.exit(1); }
    const cur = JSON.parse(readFileSync(OUT, 'utf8'));
    if (cur.__runtime?.source_sha1 !== sha1) { console.error('[runtime manifest] 오래됨(manifest.json 이 바뀜) — node scripts/build_runtime_manifest.mjs 실행 필요'); process.exit(1); }
    console.log('[runtime manifest] 최신'); process.exit(0);
}

const man = JSON.parse(srcText);
const out = {};
for (const [k, v] of Object.entries(man)) {
    if (k === 'items' || k === 'fragmentsMerged') continue;
    out[k] = v;
}
let sized = 0;
out.items = (man.items ?? []).map((it) => {
    const o = strip(it, true);
    // 아틀라스·도트 아틀라스·대형 지도: size 가 없으면 헤더에서 읽어 넣는다(본 항목 + 객체 변형)
    if (/atlas|nineslice|map_base|bg/.test(String(o.type ?? '')) || /^map\./.test(String(o.key ?? ''))) {
        if (!o.size && o.path) { const s = imageSize(o.path); if (s) { o.size = `${s[0]}x${s[1]}`; sized += 1; } }
        if (o.variants && typeof o.variants === 'object') {
            for (const vv of Object.values(o.variants)) {
                if (vv && typeof vv === 'object' && !vv.size && vv.path) { const s = imageSize(vv.path); if (s) { vv.size = `${s[0]}x${s[1]}`; sized += 1; } }
            }
        }
    }
    // 4096 초과 텍스처의 축소 변형(성능 1단계에서 생성한 파일, 원본 보존). 파일이 있을 때만 variants 에 추가
    const ex = EXTRA_VARIANTS[o.key];
    if (ex) for (const [n, rel] of Object.entries(ex)) {
        if (o.variants?.[n] || !existsSync(`public/${rel}`)) continue;
        const s = imageSize(rel);
        o.variants = { ...(o.variants ?? {}), [n]: { path: rel, ...(s ? { size: `${s[0]}x${s[1]}` } : {}), bytes: statSync(`public/${rel}`).size } };
    }
    return o;
});
out.__runtime = { source: 'manifest.json', source_sha1: sha1, source_bytes: Buffer.byteLength(srcText), generatedAt: new Date().toISOString(), by: 'scripts/build_runtime_manifest.mjs' };
const text = JSON.stringify(out);
JSON.parse(text);
const tmp = `${OUT}.tmp_${process.pid}`;
writeFileSync(tmp, text);
renameSync(tmp, OUT);
const before = statSync(SRC).size; const after = statSync(OUT).size;
console.log(`[runtime manifest] 항목 ${out.items.length} | ${(before / 1048576).toFixed(2)}MB -> ${(after / 1048576).toFixed(2)}MB (${((1 - after / before) * 100).toFixed(1)}% 감소) | size 보강 ${sized}`);
