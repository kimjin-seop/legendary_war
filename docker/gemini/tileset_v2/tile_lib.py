# tileset_v2 절차 도트 세트 공용 함수(안아트 2026-11-03). art_west.py·art_china.py 와 같은 규칙을 함수로 묶음(그 두 파일은 수정하지 않음).
#   4방 16형(N1 E2 S4 W8, 확장 캔버스 외곽선) / 47형(landPaint.js red() + classify 요철 주기 16) / 자동 점검(알파 0/255·팔레트·마젠타·이음) / --apply 등록
import os, json, hashlib, shutil
import numpy as np
from PIL import Image

Hx = lambda s: (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16), 255)
sha_f = lambda p: hashlib.sha1(open(p, 'rb').read()).hexdigest()[:12]
N_, E_, S_, W_ = 1, 2, 4, 8
BITS = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}
WOB2 = [0, 1, 1, 2, 2, 1, 1, 0, 0, 1, 2, 2, 1, 0, 0, 0]; FACEW = [0, 0, 1, 1, 0, -1, -1, 0, 1, 1, 1, 0, 0, -1, 0, 0]
x2 = lambda a: Image.fromarray(a).resize((a.shape[1] * 2, a.shape[0] * 2), Image.NEAREST)

def ctx(root):
    tvp = os.path.join(root, 'public/assets/tiles/tileset_v2'); names = json.load(open(os.path.join(tvp, 'tv2_names.json'), encoding='utf-8'))
    def crop16(n):
        nm = names['names'][n]; im = Image.open(os.path.join(tvp, nm['sheet'] + '.png')).convert('RGBA'); f = nm['frame']
        return np.ascontiguousarray(np.array(im.crop((f % 16 * 32, f // 16 * 32, f % 16 * 32 + 32, f // 16 * 32 + 32)))[::2, ::2]).copy()
    return tvp, names, crop16

def outline(a, col):
    al = a[..., 3] > 0; p = np.pad(al, 1); edge = al & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    o = a.copy(); o[edge] = col; return o

def ext4(m, paint, ocol, special=None):
    C = np.zeros((18, 18, 4), np.uint8)
    def put(x, y, col):
        if -1 <= x <= 16 and -1 <= y <= 16: C[y + 1, x + 1] = col
    paint(m, put, special)
    al = C[..., 3] > 0; p = np.pad(al, 1, constant_values=True)
    edge = al & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]); edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = False
    C2 = C.copy(); C2[edge] = ocol
    return C2[1:17, 1:17].copy()

def arms(m, cx0, cx1, cy0, cy1):
    def inside(x, y):
        if cx0 <= x <= cx1 and cy0 <= y <= cy1: return True
        if m & W_ and x <= cx1 and cy0 <= y <= cy1: return True
        if m & E_ and x >= cx0 and cy0 <= y <= cy1: return True
        if m & N_ and y <= cy1 and cx0 <= x <= cx1: return True
        if m & S_ and y >= cy0 and cx0 <= x <= cx1: return True
        return False
    return inside

def red(m):
    for d, a_, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not ((m & BITS[a_]) and (m & BITS[b])): m &= ~BITS[d]
    return m
MASKS = sorted(set(red(m) for m in range(256)))

def classify(m, mN=2, mS=2, mE=2, mW=2, F=7):
    out = lambda d: not (m & BITS[d]); cls = np.ones((16, 16), np.uint8)
    for y in range(16):
        for x in range(16):
            n_ = mN + WOB2[x]; s_ = mS; e_ = mE + WOB2[(y + 3) % 16]; w_ = mW + WOB2[(y + 9) % 16]; Fx = F + FACEW[x]
            dN, dS, dE, dW = y + 0.5, 16 - y - 0.5, 16 - x - 0.5, x + 0.5; c = 1
            if out('N') and dN < n_: c = 0
            if out('W') and dW < w_: c = 0
            if out('E') and dE < e_: c = 0
            if out('S'):
                if dS < s_: c = 0
                elif dS < s_ + Fx and c: c = 2
            if not out('N') and not out('E') and out('NE') and dE < e_ and dN < n_: c = 0
            if not out('N') and not out('W') and out('NW') and dW < w_ and dN < n_: c = 0
            if not out('S') and not out('E') and out('SE') and dE < e_:
                if dS < s_: c = 0
                elif dS < s_ + Fx: c = 2
            if not out('S') and not out('W') and out('SW') and dW < w_:
                if dS < s_: c = 0
                elif dS < s_ + Fx: c = 2
            if c and out('N') and out('W') and dN < n_ + 1 and dW < w_ + 1: c = 0
            if c and out('N') and out('E') and dN < n_ + 1 and dE < e_ + 1: c = 0
            cls[y, x] = c
    return cls

def split(a, prefix):
    R, C = a.shape[0] // 16, a.shape[1] // 16
    return [(f'{prefix}_{r}{c}' if R > 1 and C > 1 else f'{prefix}_{r if R > 1 else c}', a[r * 16:r * 16 + 16, c * 16:c * 16 + 16].copy()) for r in range(R) for c in range(C)]

def mask47(grid, x, y, chars):
    Hh, Ww = len(grid), len(grid[0])
    def g(u, v): return grid[v][u] in chars if 0 <= u < Ww and 0 <= v < Hh else True
    return red(sum(BITS[k] for k, v in {'N': g(x, y - 1), 'NE': g(x + 1, y - 1), 'E': g(x + 1, y), 'SE': g(x + 1, y + 1), 'S': g(x, y + 1), 'SW': g(x - 1, y + 1), 'W': g(x - 1, y), 'NW': g(x - 1, y - 1)}.items() if v))
def mask4(grid, x, y, chars):
    Hh, Ww = len(grid), len(grid[0]); f = lambda u, v: 0 <= u < Ww and 0 <= v < Hh and grid[v][u] in chars
    return (N_ if f(x, y - 1) else 0) | (E_ if f(x + 1, y) else 0) | (S_ if f(x, y + 1) else 0) | (W_ if f(x - 1, y) else 0)

def seam4(BY, prefix, extra=None):
    bad = []; tiles = {m: np.array(BY[f'{prefix}_{m}']) for m in range(16)}
    for k in (extra or {}): tiles[k] = np.array(BY[f'{prefix}_{k}'])
    arm = {m: m for m in range(16)}; arm.update(extra or {})
    for side, bit, sl, edge in (('E', E_, (slice(None), slice(30, 32)), (slice(None), -1)), ('W', W_, (slice(None), slice(0, 2)), (slice(None), 0)),
                                ('N', N_, (slice(0, 2), slice(None)), (0, slice(None))), ('S', S_, (slice(30, 32), slice(None)), (-1, slice(None)))):
        ref = None
        for k, t in tiles.items():
            has = bool(arm[k] & bit); occ = bool((t[edge][..., 3] > 0).any())
            if isinstance(k, int) and has != occ: bad.append(f'{k} {side} 팔/경계')
            if not has: continue
            e = t[sl]
            if ref is None: ref = e
            elif not np.array_equal(ref, e): bad.append(f'{k} {side} 경계')
    return bad

def shape_seam(F=7, mN=2):
    rng = np.random.default_rng(2); jumps = 0; tot = 0
    for _ in range(2000):
        G = rng.random((5, 5)) < 0.62
        grid = [''.join('R' if G[v, u] else '.' for u in range(5)) for v in range(5)]
        for (x, y, u, v) in ((2, 2, 3, 2), (2, 2, 2, 3)):
            ca = classify(mask47(grid, x, y, 'R'), mN=mN, F=F) if G[y, x] else np.zeros((16, 16), np.uint8)
            cb = classify(mask47(grid, u, v, 'R'), mN=mN, F=F) if G[v, u] else np.zeros((16, 16), np.uint8)
            ea, eb = (ca[:, 15], cb[:, 0]) if u != x else (ca[15, :], cb[0, :])
            for i in range(16):
                tot += 1
                if ea[i] != eb[i] and not any(0 <= j < 16 and eb[j] == ea[i] for j in (i - 1, i + 1)): jumps += 1
    return {'pixels': tot, 'jumps_gt_1px': jumps}

def check(FR, allowed, skip_palette_sets=()):
    errs, items, stray_all = [], {}, {}
    for idx, (n, im, kind, walk, st) in FR.items():
        a = np.array(im); al = a[..., 3]
        if kind == 'ground' and (al < 255).any(): errs.append(f'{n} 지면인데 투명')
        if kind == 'overlay' and ((al > 0) & (al < 255)).any(): errs.append(f'{n} 반투명')
        if kind == 'overlay' and not (al == 255).any(): errs.append(f'{n} 빈 칸')
        px = a.reshape(-1, 4); px = px[px[:, 3] > 0][:, :3]; stray = {tuple(c) for c in px.tolist()} - allowed
        if stray and st not in skip_palette_sets: stray_all[n] = len(stray)
        rgb = a[..., :3].astype(int)
        if int(((rgb[..., 0] > 200) & (rgb[..., 2] > 100) & (rgb[..., 1] < 80) & (al > 0)).sum()): errs.append(f'{n} 마젠타 잔여')
        items[n] = {'index': idx, 'set': st, 'kind': kind, 'walk': walk, 'opaque_ratio': round(float((al == 255).mean()), 3)}
    if stray_all: errs.append(f'허용 외 색 {stray_all}')
    return errs, items

def sheet_of(FR, start):
    rows = (max(FR) - start) // 16 + 1; sheet = Image.new('RGBA', (512, rows * 32), (0, 0, 0, 0))
    for idx, (n, im, kind, walk, st) in FR.items(): f = idx - start; sheet.paste(im, (f % 16 * 32, f // 16 * 32))
    return sheet

def apply(tvp, key, start, end, FR, sheet, sets, tag, script, note, verify_note, qa_rel, mapping_rel, lic_extra=''):
    if os.environ.get('TILE_BACKUP') == '1':   # 백업 기본 끔(2026-11-03 팀장 지시). TILE_BACKUP=1 일 때만 <파일><tag>
        for f in ('tv2_names.json', 'tileset_v2_map.json', 'manifest_fragment_tv2.json'):
            p = os.path.join(tvp, f)
            if not os.path.exists(p + tag): shutil.copy2(p, p + tag)
    path = os.path.join(tvp, f'{key}.png'); sheet.save(path, optimize=True); cnt = max(FR) - start + 1; short = key.replace('tv2_', '')
    names = json.load(open(os.path.join(tvp, 'tv2_names.json'), encoding='utf-8'))
    names['spec'][short] = {'key': key, 'path': f'/assets/tiles/tileset_v2/{key}.png', 'cols': 16, 'start': start, 'count': cnt, 'size': list(sheet.size), 'capacity': [start, end], 'sets': sets, 'note': note}
    for idx, (n, im, kind, walk, st) in FR.items(): names['names'][n] = {'sheet': key, 'frame': idx - start, 'index': idx, 'src': f'{script} {st} {kind}', 'walk': walk}
    json.dump(names, open(os.path.join(tvp, 'tv2_names.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    mp = json.load(open(os.path.join(tvp, 'tileset_v2_map.json'), encoding='utf-8'))
    mp[f'ranges_{short}'] = {key: [start, max(FR)], 'sets': sets}; mp[f'index_map_{short}'] = {n: idx for idx, (n, im, kind, walk, st) in FR.items()}
    mp[f'{short}_note'] = f'안아트 {script} --apply(2026-11-03). 새 이름만(기존 키 불변). 사용 규칙 {mapping_rel}'
    json.dump(mp, open(os.path.join(tvp, 'tileset_v2_map.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    fr = json.load(open(os.path.join(tvp, 'manifest_fragment_tv2.json'), encoding='utf-8'))
    fr[f'tileset.{key}'] = {'type': 'tileset', 'frame': [32, 32], 'alpha': '지면 불투명 / ov_* 투명 오버레이(alpha 0/255)', 'filter': 'nearest(Point), pixelArt=true, 정수 배율만',
        'names': '/assets/tiles/tileset_v2/tv2_names.json', 'name_map': '/assets/tiles/tileset_v2/tileset_v2_map.json',
        'generator': f'docker/gemini/tileset_v2/{script}(안아트 2026-11-03, Pillow 절차 도트 16px x2, 이미지 모델 호출 0회){lic_extra}', 'source': '자체 제작', 'prompt_ref': '없음(절차 합성)',
        'license': '이 프로젝트 자체 제작(안아트). 바탕 풀·물 픽셀은 칩셋(라이선스 미확인) 재사용 — 공개 전 권리 확인 필요(비차단)', 'verify': True, 'verify_note': verify_note,
        'scope': 'battle', 'path': f'assets/tiles/tileset_v2/{key}.png', 'width': sheet.size[0], 'height': sheet.size[1], 'cols': 16, 'start': start, 'count': cnt, 'bytes': os.path.getsize(path),
        'load_hint': f"this.load.spritesheet('{key}', path, {{frameWidth:32, frameHeight:32}}) — 프레임 = 전역 인덱스 - {start}",
        'notes': [f"FE 미연결(U32_TV2.{short} start {start} count {cnt}, u32Src 에서 idx >= {start} 분기를 더 작은 시작 구간보다 먼저)", f'tv2_map_to_js.mjs ok() 에 {start}~{end} + index_map_{short} 병합', f'tmv2.py src() 에 i>={start} 분기(맵디자이너)'],
        'qa': qa_rel}
    json.dump(fr, open(os.path.join(tvp, 'manifest_fragment_tv2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return cnt, os.path.getsize(path)

def mapping(path, note, sets, rules, items, key, start, cnt):
    names = {}
    for n, v in items.items(): names.setdefault(v['set'], {})[n] = {'index': v['index'], 'layer': 'ground' if v['kind'] == 'ground' else 'object(overlay)', 'walk': v['walk']}
    short = key.replace('tv2_', '')
    json.dump({'_note': note, 'sets': sets, 'rules': rules, 'names': names,
               'fe': f"미연결 — 윤프론: U32_TV2.{short} = {{key:'{key}', path:'/assets/tiles/tileset_v2/{key}.png', cols:16, start:{start}, count:{cnt}}}, u32Src 에서 idx>={start} 분기를 이전 구간보다 먼저, tv2_map_to_js.mjs ok() 구간 + index_map_{short} 병합",
               'tmv2': f"미연결 — 맵디자이너: tmv2.py src() 에 i>={start} -> ('{key}', i-{start}) 분기(더 작은 시작 구간보다 먼저)"}, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
