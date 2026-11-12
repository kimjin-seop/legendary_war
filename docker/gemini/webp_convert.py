# 이미지 WebP 교체 1단계: 변환 + 검증 + 대응표(호출 없음, 안아트 2026-11-04, 사용자 승인 — 팀장 전달).
#   원본 PNG/JPG 는 지우지 않음(삭제는 실화면 검증 통과 배치만, 맨 마지막 단계에서 별도).
#   대응표 public/assets/webp_map.json: {"assets/<원본>": {"webp": "assets/<새 파일>.webp", "bytes_src", "bytes_webp", "mode", "q", "dE", "alpha_max_diff", "batch"}}
#   merge_fragments.mjs 가 병합 때 이 표로 manifest path(+thumb)·bytes 를 바꿈 → 조각 파일·발행 스크립트는 그대로 둬도 됨.
# 규칙: 해상도·알파 불변. 일러스트 = lossy q(기본 90, 알파 무손실 alpha_quality 100), 픽셀아트 시트 = lossless.
#   검증 실패(평균 색차 dE > 3.0 또는 알파 최대 차 > 8)면 대응표에 넣지 않음.
# 사용(저장소 루트): python -X utf8 docker/gemini/webp_convert.py <batch> [--dry]
#   batch: portraits(assets/portraits/** 정식 초상, 백업·작업 폴더 제외) | keyart(gacha_ui/keyart) | bg(assets/bg/**) | scene(cutscene 등 대형 JPG) — 목록은 manifest 기준
import json, os, sys
import numpy as np
from PIL import Image

A = 'public/assets'; MAN = f'{A}/manifest.json'; MAP = f'{A}/webp_map.json'
batch = sys.argv[1]; DRY = '--dry' in sys.argv
SKIP_DIRS = ('/_orig_framing/', '/_backup', '/_r4/', '/raw/', '/preview/qa', '/out/')
SEL = {
    'portraits': lambda p: p.startswith('assets/portraits/') and p.endswith('.png'),
    'keyart': lambda p: p.startswith('assets/gacha_ui/keyart/') and p.endswith(('.png', '.jpg')),
    'herosheets': lambda p: p.startswith('assets/sprites/') and '/hero_' in p and p.endswith('.png'),   # 장수 전용 시트(unit.hero.*) — 도트라 무손실
    'bg': lambda p: p.startswith('assets/bg/') and p.endswith(('.png', '.jpg')),
    'scene': lambda p: p.startswith(('assets/cutscene/', 'assets/result/', 'assets/gacha_ui/')) and p.endswith(('.png', '.jpg')) and not p.startswith('assets/gacha_ui/keyart/'),
}[batch]
PIXEL = lambda p: '/sprites/' in p or '/tiles/' in p or 'pixel' in p

man = json.load(open(MAN, encoding='utf-8'))
paths = []
for it in man['items']:
    for p in (it.get('path'), (it.get('thumb') or {}).get('path') if isinstance(it.get('thumb'), dict) else None):
        if p and SEL(p) and not any(s in '/' + p for s in SKIP_DIRS) and os.path.exists(f'public/{p}') and p not in paths: paths.append(p)
wm = json.load(open(MAP, encoding='utf-8')) if os.path.exists(MAP) else {}
done = fail = 0; saved = 0; tot_src = tot_w = 0; fails = []
for p in paths:
    src = f'public/{p}'; dst_rel = os.path.splitext(p)[0] + '.webp'; dst = f'public/{dst_rel}'
    if p in wm and os.path.exists(dst) and wm[p]['bytes_src'] == os.path.getsize(src): continue   # 이미 변환됐고 원본 그대로 → 건너뜀(증분)
    if os.path.exists(dst) and p not in wm and not p.endswith('.webp'):
        fails.append(f'{p}: 같은 이름 webp 가 이미 있음(대응표 밖) — 건너뜀'); fail += 1; continue
    im = Image.open(src); has_a = im.mode in ('RGBA', 'LA', 'P') and 'A' in im.convert('RGBA').getbands()
    rgba = im.convert('RGBA') if has_a else im.convert('RGB')
    lossless = PIXEL(p); q = 90
    if DRY: done += 1; tot_src += os.path.getsize(src); continue
    kw = dict(lossless=True, quality=100, method=6) if lossless else dict(quality=q, alpha_quality=100, method=6)
    rgba.save(dst, 'WEBP', **kw)
    a0 = np.asarray(rgba).astype(np.int16); a1 = np.asarray(Image.open(dst).convert(rgba.mode)).astype(np.int16)
    if a0.shape != a1.shape: fails.append(f'{p}: 크기 불일치'); os.remove(dst); fail += 1; continue
    if has_a:
        al = a0[..., 3] > 0; dE = float(np.abs(a0[..., :3] - a1[..., :3])[al].mean()) if al.any() else 0.0; amax = int(np.abs(a0[..., 3] - a1[..., 3]).max())
    else: dE = float(np.abs(a0 - a1).mean()); amax = 0
    if dE > 3.0 or amax > 8: fails.append(f'{p}: dE {dE:.2f} alpha {amax}'); os.remove(dst); fail += 1; continue
    bs, bw = os.path.getsize(src), os.path.getsize(dst)
    if bw >= bs: os.remove(dst); fails.append(f'{p}: webp 가 더 큼({bw}>={bs}) — 원본 유지'); fail += 1; continue   # 2026-11-04: 커지면 넣지 않음
    tot_src += bs; tot_w += bw
    wm[p] = {'webp': dst_rel, 'bytes_src': bs, 'bytes_webp': bw, 'mode': 'lossless' if lossless else f'lossy q{q} alpha100', 'dE': round(dE, 3), 'alpha_max_diff': amax, 'batch': batch}
    done += 1
if not DRY:
    json.dump(dict(sorted(wm.items())), open(MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{batch}: 대상 {len(paths)} 변환 {done} 실패 {fail} | 원본 {tot_src / 1048576:.1f}MB -> webp {tot_w / 1048576:.1f}MB' + ('' if DRY else f' (절감 {(tot_src - tot_w) / 1048576:.1f}MB)'))
for f in fails[:20]: print('  ', f)
