# tileset_v2 ext3 실내 키트 — 안아트 신규 그림(placeholder 대체), 안아트 2026-11-03. 이미지 모델 호출 0회(Pillow 절차 도트, 16px 원화 -> x2 최근접).
# 대상(맵디자이너 bake_ext3.py 예약 인덱스):
#   P1 벽 윗면(천장) 47형 int_walltop47_<mask> 2300~2346(red() 정렬 순) + int_walltop_single 2347
#   P3 붉은 줄 덮인 서가 int_shelfred_{TL..BR} 2350~2358 (기존 int_shelf_* = tv2_static3 프레임 0~8 을 읽어 위에 교정 붉은 줄, 원본 시트는 쓰지 않음)
#   종이 번짐 오버레이 4변형(반투명 오브젝트): obj3_bleed_a 2360 단독 얼룩 / b 2361 가로 띠(좌우 이음) / c 2362 세로 띠(상하 이음) / d 2363 칸 전체 번짐(사방 이음)
# 출력 시트: 새 시트 public/assets/tiles/tileset_v2/tv2_static3_art.png (512x128, 16열, 프레임 = 전역-2300). 기존 시트 5장(tv2_static/anim/anim2/static2/static3)은 수정하지 않음.
# 사용(저장소 루트, python:3.12 + pillow·numpy):
#   python -I docker/gemini/tileset_v2/art_ext3.py <루트>                  -> 새 시트 + docker/gemini/tileset_v2/art_ext3/ QA·미리보기 (이름표·표 무수정)
#   python -I docker/gemini/tileset_v2/art_ext3.py <루트> --apply <대상루트> -> <대상루트>/public/assets/tiles/tileset_v2 의 tv2_names.json·tileset_v2_map.json 에 등록(멱등, 첫 실행 .bak-artext3-20261103)
#     순서: bake.py -> map_names.py -> bake_ext.py -> bake_ext2.py -> bake_ext3.py -> art_ext3.py --apply (bake_ext3 가 매번 placeholder 이름을 다시 쓰므로 반드시 그 뒤)
#     그 다음 tmv2.py: src() 에 i>=2300 -> tv2_static3_art(프레임 i-2300) 분기와 유효 구간 2300~2363 추가 후 apply. FE: U32_TV2.static3_art {start:2300,count:64} 를 static3 분기보다 먼저.
# 팔레트: 기존 서가·목재 칩셋 색(#3f1f0f #674020 #885f31 #af7f40 #c79f61 #d8b374 #e8c888) + 천장 채움 2색·외곽 1색 추가. 광원 왼쪽 위.
import sys, os, json, hashlib, shutil
import numpy as np
from PIL import Image

ROOT = sys.argv[1]
APPLY = sys.argv[sys.argv.index('--apply') + 1] if '--apply' in sys.argv else None
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2')
ART = os.path.join(HERE, 'art_ext3')
TVP = os.path.join(ROOT, 'public/assets/tiles/tileset_v2')
ART_SHEET = os.path.join(TVP, 'tv2_static3_art.png')
os.makedirs(os.path.join(ART, 'preview'), exist_ok=True)
H = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
sha_f = lambda p: hashlib.sha1(open(p, 'rb').read()).hexdigest()[:12]
KEEP = [os.path.join(TVP, f) for f in ('tv2_static.png', 'tv2_anim.png', 'tv2_anim2.png', 'tv2_static2.png', 'tv2_static3.png')]
before = {p: sha_f(p) for p in KEEP if os.path.exists(p)}

# ---------------------------------------------------------------- 47형 마스크(bake_ext3.py / tmv2.py red() 와 동일)
BITS = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}
def red(m):
    for d, a, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not ((m & BITS[a]) and (m & BITS[b])): m &= ~BITS[d]
    return m
MASKS = sorted(set(red(m) for m in range(256)))
assert len(MASKS) == 47

# ---------------------------------------------------------------- P1 벽 윗면
OUTL = H('#2a1408')
TONE = {'L': [OUTL, H('#e8c888'), H('#d8b374'), H('#af7f40')],     # 북·서(빛 받는 면)
        'M': [OUTL, H('#c79f61'), H('#af7f40'), H('#885f31')],     # 북동·남서 안쪽 모서리
        'D': [OUTL, H('#af7f40'), H('#885f31'), H('#674020')]}     # 남·동(그늘)
FILL, PLANK, PLANK_HI = H('#4e2e16'), H('#3f1f0f'), H('#5e3a1c')
def fill_px(x, y):
    # 천장 판재: 8px 간격 가로 이음 + 엇갈린 세로 이음(주기 16 -> 칸 경계 이음선 없음)
    if y % 8 == 7: return PLANK
    if y % 8 == 0: return PLANK_HI
    if (y < 8 and x == 4) or (y >= 8 and x == 12): return PLANK
    return FILL
def walltop(mask, single=False):
    im = Image.new('RGBA', (16, 16)); P = im.load()
    has = lambda k: bool(mask & BITS[k])
    for y in range(16):
        for x in range(16):
            vn, hn = ('N' if y < 8 else 'S'), ('W' if x < 8 else 'E')
            dy, dx = (y if y < 8 else 15 - y), (x if x < 8 else 15 - x)
            cand = []
            if not has(vn): cand.append((dy, 'L' if vn == 'N' else 'D', 0))
            if not has(hn): cand.append((dx, 'L' if hn == 'W' else 'D', 1))
            if has(vn) and has(hn) and not has(vn + hn):
                dg = vn + hn
                cand.append((max(dx, dy), 'L' if dg == 'NW' else 'D' if dg == 'SE' else 'M', 2))
            if cand:
                d, t, _ = min(cand, key=lambda c: (c[0], c[1] != 'L', c[2]))
                if d < 4:
                    P[x, y] = TONE[t][d]; continue
            P[x, y] = fill_px(x, y)
    if single:   # 고립 칸: 기둥 머리처럼 가운데 4x4 목재 마개
        for y in range(6, 10):
            for x in range(6, 10):
                P[x, y] = H('#c79f61') if (x, y) != (9, 9) else H('#885f31')
        P[6, 6] = H('#e8c888')
    return im

# ---------------------------------------------------------------- P3 붉은 줄 서가
S3 = Image.open(os.path.join(TVP, 'tv2_static3.png')).convert('RGBA')
fr32 = lambda sh, i: sh.crop((i % 16 * 32, i // 16 * 32, i % 16 * 32 + 32, i // 16 * 32 + 32))
def to16(im32):
    a = np.array(im32); assert (a[::2, ::2] == a[1::2, 1::2]).all(), 'x2 최근접 아님'
    return Image.fromarray(np.ascontiguousarray(a[::2, ::2])).copy()
RED_HI, RED, RED_SH = H('#e8483c'), H('#c8202a'), H('#7a1018')
# 책 띠 위 가로줄 y(16px). x 6~9 에서 1px 내려감(칸 양 끝 y 는 같게 -> 가로로 이어짐)
LINE_Y = {'T': 11, 'M': 6, 'B': 2}   # 책 띠 실측: T 8~15, M 3~10, B 0~5 (가운데)
SHELF = ('TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR')
def shelfred(k):
    p = SHELF[k]; im = to16(fr32(S3, k)); P = im.load()
    x0 = 2 if p[1] == 'L' else 0; x1 = 13 if p[1] == 'R' else 15
    for x in range(x0, x1 + 1):
        y = LINE_Y[p[0]] + (1 if 6 <= x <= 9 else 0)
        P[x, y - 1] = RED_HI if x % 5 else RED
        P[x, y] = RED
        P[x, y + 1] = RED_SH
    if p[1] == 'L': P[x0, LINE_Y[p[0]] - 2] = RED          # 시작점 펜 눌림
    if p[1] == 'R': P[x1, LINE_Y[p[0]] + 2] = RED_SH       # 끝 꼬리
    return im

# ---------------------------------------------------------------- 종이 번짐 오버레이(반투명, 3단 알파)
INK = (28, 18, 12)
PAPER = (232, 220, 192)
def bleed(kind):
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0)); P = im.load()
    rng = np.random.default_rng({'a': 31, 'b': 47, 'c': 53, 'd': 61}[kind])
    for y in range(16):
        for x in range(16):
            if kind == 'a':
                r = ((x - 7.5) ** 2 / 42 + (y - 7.5) ** 2 / 32) ** 0.5 + rng.uniform(-0.15, 0.15)
                inner, edge = r < 0.78, r < 1.0
            elif kind == 'd':   # 사방 이음(r4): 칸 전체 균일 종이빛 번짐 + 4px 간격 성긴 디더(구멍·무늬 없음 -> 여러 칸 깔아도 반복이 드러나지 않음)
                inner, edge = True, True
                if (x % 4 == 1 and y % 4 == 2) or (x % 4 == 3 and y % 4 == 0):
                    P[x, y] = PAPER + (128,); continue
            else:               # b 가로 띠(위아래 경계가 x 주기 16) / c 세로 띠(b 의 전치)
                u, w = (x, y) if kind == 'b' else (y, x)
                c = 8 + 1.5 * np.sin(2 * np.pi * u / 16); hw = 2.6 + 0.8 * np.sin(2 * np.pi * (u + 5) / 16)
                dd = abs(w - c)
                inner, edge = dd < hw, dd < hw + 1.4
            # r2(2026-11-03): 어두운 판자 바닥 위 대비 확보 — 안쪽 = 바랜 종이빛 번짐(글자가 지워진 빈 쪽), 가장자리 = 먹 테두리(체커 디더)
            dither = edge and not inner and (x + y) % 2 == 0
            if inner: P[x, y] = PAPER + ((120 if kind != 'd' else 96),)
            elif edge: P[x, y] = INK + ((170 if dither else 110),)
    pp = {'a': [(5, 7), (6, 7), (9, 9)], 'b': [(4, 8), (11, 7)], 'c': [(8, 4), (7, 11)], 'd': []}[kind]
    for x, y in pp: P[x, y] = INK + (190,)              # 지워지다 남은 먹 점(번짐 d 는 반복이 드러나지 않게 점 없음)
    if kind == 'a':                                      # 얼룩을 가로지르는 바랜 붉은 줄 흔적(교정 줄이 번진 자리)
        for x in range(4, 12):
            if x % 3: P[x, 8] = (160, 34, 30, 150)
    return im

x2 = lambda im: im.resize((32, 32), Image.NEAREST)
FR = {}   # 전역 인덱스 -> (이름, 32px RGBA, 종류)
for k, m in enumerate(MASKS): FR[2300 + k] = (f'int_walltop47_{m}', x2(walltop(m)), 'ground')
FR[2347] = ('int_walltop_single', x2(walltop(0, single=True)), 'ground')
for k, p in enumerate(SHELF): FR[2350 + k] = (f'int_shelfred_{p}', x2(shelfred(k)), 'ground')
for k, p in enumerate('abcd'): FR[2360 + k] = (f'obj3_bleed_{p}', x2(bleed(p)), 'object')

# ---------------------------------------------------------------- QA
sha = lambda im: hashlib.sha1(im.tobytes()).hexdigest()[:12]
qa = {'date': '2026-11-03', 'author': '안아트', 'calls': 0, 'sheet': 'public/assets/tiles/tileset_v2/tv2_static3_art.png', 'items': {}, 'errors': []}
for idx, (n, im, kind) in FR.items():
    a = np.array(im)[..., 3]
    o = float((a == 255).mean())
    if kind == 'ground' and o < 1: qa['errors'].append(f'{n} 지면인데 불투명 {o:.3f}')
    if kind == 'object' and not (a > 0).any(): qa['errors'].append(f'{n} 비어 있음')
    rgb = np.array(im)[..., :3].astype(int)
    mag = int(((rgb[..., 0] > 200) & (rgb[..., 2] > 200) & (rgb[..., 1] < 80) & (a > 0)).sum())
    if mag: qa['errors'].append(f'{n} 마젠타 {mag}px')
    qa['items'][n] = {'index': idx, 'frame': idx - 2300, 'kind': kind, 'opaque_ratio': round(o, 3), 'semi_alpha_px': int(((a > 0) & (a < 255)).sum()), 'sha1_12': sha(im)}
dup = {}
for n, v in qa['items'].items(): dup.setdefault(v['sha1_12'], []).append(n)
qa['pixel_duplicates'] = [v for v in dup.values() if len(v) > 1]
# 이음 검사 1: 벽이 이어지는 변에는 외곽선이 없어야 함
seam_bad = 0
for k, m in enumerate(MASKS):
    im = np.array(FR[2300 + k][1])
    for side, line in (('N', im[0]), ('S', im[31]), ('W', im[:, 0]), ('E', im[:, 31])):
        if m & BITS[side] and (line[:, :3] == np.array(OUTL[:3])).all(axis=1).any() and not any(
                (m & BITS[c]) == 0 for c in {'N': ('NE', 'NW'), 'S': ('SE', 'SW'), 'W': ('NW', 'SW'), 'E': ('NE', 'SE')}[side]):
            seam_bad += 1
qa['seam_outline_on_joined_side'] = seam_bad
# 이음 검사 2: 번짐 b 좌우, c 상하, d 사방 — 이어 붙일 때 맞닿는 열(행)의 알파 차이 합
def wrapdiff(im, axis):
    a = np.array(im)[..., 3].astype(int)
    return int(np.abs(a[:, 0] - a[:, -1]).sum()) if axis == 'x' else int(np.abs(a[0] - a[-1]).sum())
qa['bleed_wrap_alpha_diff'] = {'b_x': wrapdiff(FR[2361][1], 'x'), 'c_y': wrapdiff(FR[2362][1], 'y'), 'd_x': wrapdiff(FR[2363][1], 'x'), 'd_y': wrapdiff(FR[2363][1], 'y')}
if seam_bad: qa['errors'].append(f'이웃 벽 쪽 외곽선 {seam_bad}')

sheet = Image.new('RGBA', (512, 128), (0, 0, 0, 0))
for idx, (n, im, kind) in FR.items():
    f = idx - 2300; sheet.paste(im, (f % 16 * 32, f // 16 * 32))
sheet.save(ART_SHEET, optimize=True)
qa['sheet_bytes'] = os.path.getsize(ART_SHEET); qa['sheet_size'] = list(sheet.size)
# 파일 바이트는 Pillow/zlib 판에 따라 달라짐(2026-11-03 확인: 11.0.0 = 5359B, 맵디자이너 환경 = 5242B, 픽셀 동일). 동일성 판정은 이 픽셀 해시로 한다
qa['sheet_pixel_sha1'] = hashlib.sha1(Image.open(ART_SHEET).convert('RGBA').tobytes()).hexdigest()

# ---------------------------------------------------------------- 미리보기: 1막 5맵에서 placeholder 이름을 새 그림으로 치환해 렌더(32px 칸). 맵 데이터는 읽기만
SHEETS = {'tv2_static': ('tv2_static.png', 1000), 'tv2_static2': ('tv2_static2.png', 2000), 'tv2_static3': ('tv2_static3.png', 2200)}
cache = {}
def tv2(i):
    k = 'tv2_static3' if i >= 2200 else 'tv2_static2' if i >= 2000 else 'tv2_static'
    if k not in cache: cache[k] = Image.open(os.path.join(TVP, SHEETS[k][0])).convert('RGBA')
    return fr32(cache[k], i - SHEETS[k][1])
BYNAME = {n: im for _, (n, im, _) in FR.items()}
def render(code, use_new, red_west=False, bleed_at=()):
    L = json.load(open(os.path.join(ROOT, f'docker/maps/tilemap_v2/{code}.layers.json'), encoding='utf-8'))
    W, Hh = L['size']; out = Image.new('RGBA', (W * 32, Hh * 32), (0, 0, 0, 255))
    for lay in ('ground', 'building', 'object'):
        rows = [list(map(int, r.split())) for r in L['layers'][lay]]
        for y in range(Hh):
            for x in range(W):
                v = rows[y][x]
                if v < 0: continue
                n = L['names'][v]
                if red_west and x < 4: n = n.replace('int_shelf_', 'int_shelfred_')
                if use_new and n in BYNAME: t = BYNAME[n]
                else:
                    i = L['index_map'].get(n)
                    if i is None or i < 1000: continue
                    t = tv2(i)
                out.alpha_composite(t, (x * 32, y * 32))
    for (x, y), k in bleed_at:
        out.alpha_composite(BYNAME['obj3_bleed_' + k], (x * 32, y * 32))
    return out
MAPS = ('main_a1_1_reading_room', 'main_a1_2_scriptorium', 'main_a1_3_corridor', 'main_a1_4_counter', 'main_a1_5_empty_stacks')
for code in MAPS:
    if not os.path.exists(os.path.join(ROOT, f'docker/maps/tilemap_v2/{code}.layers.json')): continue
    old = render(code, False)
    new = render(code, True, red_west=(code == 'main_a1_2_scriptorium'),
                 bleed_at=(((6, 6), 'a'), ((7, 9), 'b'), ((8, 9), 'b'), ((9, 9), 'd'), ((9, 10), 'c')) if code == 'main_a1_5_empty_stacks' else ())
    cmp_ = Image.new('RGBA', (old.width * 2 + 16, old.height), (40, 40, 40, 255)); cmp_.paste(old, (0, 0)); cmp_.paste(new, (old.width + 16, 0))
    cmp_.convert('RGB').save(os.path.join(ART, 'preview', f'{code}_before_after.png'))
# 47형 전수(x2) + 무작위 벽 덩어리 이음 검사판
big = Image.new('RGBA', (16 * 68, 3 * 68), (60, 60, 60, 255))
for k in range(48):
    big.paste(FR[2300 + k][1].resize((64, 64), Image.NEAREST), (k % 16 * 68, k // 16 * 68))
big.convert('RGB').save(os.path.join(ART, 'preview', 'walltop47_all_x2.png'))
rng = np.random.default_rng(7); Wd, Hd = 24, 16
g = (rng.random((Hd, Wd)) < 0.45).astype(int)
for _ in range(3):
    n8 = sum(np.roll(np.roll(g, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    g = (n8 >= 5).astype(int)
floor = tv2(1586)
test = Image.new('RGBA', (Wd * 32, Hd * 32))
idx_of_mask = {m: 2300 + k for k, m in enumerate(MASKS)}
D8 = {'N': (0, -1), 'NE': (1, -1), 'E': (1, 0), 'SE': (1, 1), 'S': (0, 1), 'SW': (-1, 1), 'W': (-1, 0), 'NW': (-1, -1)}
for y in range(Hd):
    for x in range(Wd):
        if not g[y, x]: test.alpha_composite(floor, (x * 32, y * 32)); continue
        m = 0
        for nm, (dx, dy) in D8.items():
            xx, yy = x + dx, y + dy
            if not (0 <= xx < Wd and 0 <= yy < Hd) or g[yy, xx]: m |= BITS[nm]
        test.alpha_composite(FR[idx_of_mask[red(m)]][1], (x * 32, y * 32))
test.convert('RGB').save(os.path.join(ART, 'preview', 'walltop47_seam_test.png'))
ov = Image.new('RGBA', (9 * 32, 4 * 32))
for i in range(9):
    for j in range(4): ov.alpha_composite(floor, (i * 32, j * 32))
ov.alpha_composite(BYNAME['obj3_bleed_a'], (0, 0))
for i in range(3): ov.alpha_composite(BYNAME['obj3_bleed_b'], (i * 32, 2 * 32))
for j in range(4): ov.alpha_composite(BYNAME['obj3_bleed_c'], (4 * 32, j * 32))
for i in range(6, 9):
    for j in range(3): ov.alpha_composite(BYNAME['obj3_bleed_d'], (i * 32, j * 32))
ov.convert('RGB').resize((ov.width * 3, ov.height * 3), Image.NEAREST).save(os.path.join(ART, 'preview', 'bleed_on_floor_x3.png'))

# ---------------------------------------------------------------- 등록(--apply, 맵디자이너 체인 마지막 단계)
if APPLY:
    D = os.path.join(APPLY, 'public/assets/tiles/tileset_v2')
    for f in ('tv2_names.json', 'tileset_v2_map.json'):
        b = os.path.join(D, f + '.bak-artext3-20261103')
        if not os.path.exists(b): shutil.copyfile(os.path.join(D, f), b)
    if os.path.abspath(D) != os.path.abspath(TVP): shutil.copyfile(ART_SHEET, os.path.join(D, 'tv2_static3_art.png'))
    NP = os.path.join(D, 'tv2_names.json'); doc = json.load(open(NP, encoding='utf-8')); names = doc['names']
    for idx, (n, im, kind) in FR.items():
        names[n] = {'sheet': 'tv2_static3_art', 'frame': idx - 2300, 'index': idx, 'src': '안아트 art_ext3.py 절차 도트(2026-11-03, 호출 0)', 'alpha': kind == 'object', 'ext3': True, 'art_ext3': True}
    doc['spec']['static3_art'] = {'key': 'tv2_static3_art', 'path': '/assets/tiles/tileset_v2/tv2_static3_art.png', 'cols': 16, 'start': 2300, 'count': 64, 'size': [512, 128],
        'note': '안아트 art_ext3.py(2026-11-03, 호출 0): 2300~2346 벽 윗면 47형(red() 정렬 순), 2347 고립 칸, 2350~2358 붉은 줄 서가 3x3, 2360~2363 종이 번짐 a~d(반투명 오브젝트). 빈 프레임 2348~2349·2359 는 이름 없음'}
    json.dump(doc, open(NP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    MP = os.path.join(D, 'tileset_v2_map.json'); mp = json.load(open(MP, encoding='utf-8'))
    for idx, (n, im, kind) in FR.items():
        if kind == 'ground': mp.setdefault('index_map_ext3', {})[n] = idx
        if n in mp.get('interior_placeholders', {}): mp['interior_placeholders'][n]['done'] = idx
    mp.setdefault('ranges_ext3', {})['tv2_static3_art'] = [2300, 2363]
    mp['art_ext3_note'] = '안아트 art_ext3.py --apply(2026-11-03): placeholder 이름이 예약 인덱스(2300~, 시트 tv2_static3_art)를 직접 가리킴. obj3_bleed_a~d 는 tv2_names 이름(2360~2363)으로만 등록(칩셋 키 없음)'
    json.dump(mp, open(MP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('applied ->', D)

after = {p: sha_f(p) for p in before}
qa['existing_sheets_unchanged'] = before == after
json.dump(qa, open(os.path.join(ART, 'art_ext3_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'frames': len(FR), 'errors': qa['errors'], 'dup': qa['pixel_duplicates'], 'seam_bad': seam_bad, 'wrap': qa['bleed_wrap_alpha_diff'],
                  'existing_unchanged': qa['existing_sheets_unchanged'], 'sheet': qa['sheet_size'], 'bytes': qa['sheet_bytes']}, ensure_ascii=False))
