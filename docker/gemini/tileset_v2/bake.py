# tileset_v2 2단계 베이크(안아트): RM2003 오토타일 블록 -> 47형 이웃 마스크 변형 32px 정적/애니 시트 + 이름표 + 이름->인덱스 표.
# 사용: python -I bake.py <저장소 루트>
# 마스크 규칙 = resources/js/game/data/landPaint.js red(): N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128, 대각은 인접 두 직교가 모두 같을 때만 유지 -> 47종.
# 쿼터(8px) 선택(16px 원본 블록 3x4 타일 기준, 블록 원점 bx,by):
#   지면: h·v·d -> 채움(1,2) / h·v·!d -> 안쪽 모서리(2,0) / h만 -> (1, cy?3:1) / v만 -> (cx?2:0, 2) / 둘 다 아님 -> (cx?2:0, cy?3:1)  (각 타일의 같은 쿼터 cx,cy)
#   수면(water_A, 프레임 f = 열 f): !h·!v -> 행0 / !h·v -> 행1 / h·!v -> 행2 / h·v·!d -> 행3 / 전부 같음 -> 깊은 물 블록 행0(열 f, 행4) — 같은 쿼터 위치
# 인덱스: 정적 1000~1699(용량 700), 애니 1700~1799.
# 출력 32px = 16px 합성 후 x2 최근접. 애니는 4프레임 [0,1,2,1](ws_anim 과 같은 stride 형식).
import sys, os, json, hashlib
from PIL import Image

ROOT = sys.argv[1]
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2')
OUT = os.path.join(ROOT, 'public/assets/tiles/tileset_v2')
os.makedirs(OUT, exist_ok=True)
KEY = (225, 0, 126)
SH = {k: Image.open(f'{HERE}/chipsets/chipset_{k}_16.png').convert('RGBA') for k in 'ABCD'}
T = 16; Q = 8

BITS = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}
def red(m):
    for d, a, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not ((m & BITS[a]) and (m & BITS[b])): m &= ~BITS[d]
    return m
MASKS = sorted(set(red(m) for m in range(256)))
assert len(MASKS) == 47, len(MASKS)

def bits(m, cx, cy):
    h = bool(m & (BITS['E'] if cx else BITS['W'])); v = bool(m & (BITS['S'] if cy else BITS['N']))
    d = bool(m & BITS[('S' if cy else 'N') + ('E' if cx else 'W')])
    return h, v, d

def quarter(img, tx, ty, cx, cy):
    return img.crop((tx * T + cx * Q, ty * T + cy * Q, tx * T + cx * Q + Q, ty * T + cy * Q + Q))

def floor_tile(sheet, bx, by, m):
    img = SH[sheet]; out = Image.new('RGBA', (T, T))
    for cy in (0, 1):
        for cx in (0, 1):
            h, v, d = bits(m, cx, cy)
            if h and v: tx, ty = (1, 2) if d else (2, 0)
            elif h: tx, ty = 1, (3 if cy else 1)
            elif v: tx, ty = (2 if cx else 0), 2
            else: tx, ty = (2 if cx else 0), (3 if cy else 1)
            out.paste(quarter(img, bx + tx, by + ty, cx, cy), (cx * Q, cy * Q))
    return out

def water_tile(sheet, f, m):
    img = SH[sheet]; out = Image.new('RGBA', (T, T))
    for cy in (0, 1):
        for cx in (0, 1):
            h, v, d = bits(m, cx, cy)
            if h and v and d: tx, ty = f, 4
            elif h and v: tx, ty = f, 3
            elif h: tx, ty = f, 2
            elif v: tx, ty = f, 1
            else: tx, ty = f, 0
            out.paste(quarter(img, tx, ty, cx, cy), (cx * Q, cy * Q))
    return out

def single(sheet, tid):
    c, r = tid % 30, tid // 30
    return SH[sheet].crop((c * T, r * T, c * T + T, r * T + T))

x2 = lambda im: im.resize((32, 32), Image.NEAREST)

# ---- 정적 패밀리(47형): 이름 접두사 -> (시트, 블록 원점) ----
FAM = [
    ('forest47', 'C', (0, 12), 'C b8 침엽수림(풀 바탕)'),
    ('sand47', 'C', (9, 0), 'C b1 모래(풀 바탕)'),
    ('dirt47', 'C', (6, 0), 'C b0 흙길(풀 바탕)'),
    ('snow47', 'C', (9, 4), 'C b3 눈(풀 바탕)'),
    ('hill47', 'C', (3, 12), 'C b9 둔덕(풀 바탕)'),
    ('grassdark47', 'C', (3, 8), 'C b5 짙은 풀'),
    ('snowforest47', 'C', (6, 8), 'C b6 눈 침엽수림'),
    ('snowhill47', 'C', (9, 8), 'C b7 눈 둔덕'),
    ('cobble47', 'A', (9, 12), 'A b11 자갈 포장'),
    ('castlefloor47', 'A', (6, 12), 'A b10 석재 단'),
    ('flagstone47', 'D', (6, 8), 'D b6 석재 테두리 판석'),
    ('farm47', 'D', (6, 4), 'D b2 밭'),
]
static = []  # (name, Image16, source)
static.append(('grass_a', single('C', 301), 'C:301 풀 채움'))
static.append(('grass_flower', None, 'C:301 + D:348(꽃, 상층) 합성'))
fl = single('C', 301).copy(); fl.alpha_composite(single('D', 348)); static[-1] = ('grass_flower', fl, static[-1][2])
for name, sh, (bx, by), src in FAM:
    static.append((f'{name.replace("47", "")}_single', single(sh, by * 30 + bx), f'{sh}:{by * 30 + bx} 블록 고립 미리보기'))
    for m in MASKS:
        static.append((f'{name}_{m}', floor_tile(sh, bx, by, m), f'{src} mask {m}'))
for tid, nm in ((141, 'plank_v_l'), (142, 'plank_v'), (143, 'plank_v_r'), (171, 'plank_h_a'), (201, 'plank_h_b'), (231, 'plank_h_c')):
    static.append((nm, single('B', tid), f'B:{tid} 판자'))
for tid, nm in ((168, 'woodfloor_a'), (199, 'woodfloor_b'), (172, 'woodfloor_h')):
    static.append((nm, single('D', tid), f'D:{tid} 판자 바닥'))

anim = []  # (name, [Image16 x3], source)
for m in MASKS:
    anim.append((f'water47_{m}', [water_tile('C', f, m) for f in range(3)], f'C water_A mask {m}'))
anim.append(('sea_deep', [single('C', 210 + f) for f in range(3)], 'C:210~212 깊은 물'))

# ---- 재바탕(rg_*): 폴백 이름의 기존 32px 타일에서 기존 풀(TileMap 3번)과 픽셀이 같은 칸 -> tv2 풀, 기존 풀 색상(hue 67~71 +-6, S>0.35)의 그림자 픽셀 -> tv2 풀 x 명도비.
#      건물·바위 등 기존 그림 자체는 그대로(새 그림을 만들지 않음). 기본 표에는 넣지 않고 선택 표 index_map_regrounded 로만 제공.
import colorsys
RG_NAMES = ['house_small', 'peak_full', 'tower_a', 'cliff_E', 'cliff_N', 'cliff_NE_inner', 'cliff_NE_outer', 'cliff_NW_inner', 'cliff_NW_outer', 'cliff_S', 'cliff_SE_inner', 'cliff_SE_outer', 'cliff_SW_inner', 'cliff_SW_outer', 'cliff_W',
            'grass_ford_E', 'grass_ford_N', 'grass_ford_NE_inner', 'grass_ford_NE_outer', 'grass_ford_NW_inner', 'grass_ford_S', 'grass_ford_SE_inner', 'grass_ford_SW_inner', 'grass_ford_SW_outer', 'grass_ford_W',
            'hanok_eave_L', 'hanok_eave_R', 'hanok_facade_L', 'hanok_facade_R', 'hanok_ridge_C', 'hanok_ridge_L', 'hanok_ridge_R']
def old_src(i):
    P = lambda p: Image.open(os.path.join(ROOT, p)).convert('RGBA')
    for lo, hi, p, cols in ((0, 30, 'public/assets/third_party/unity_tilemap/TileMap.png', 10), (30, 110, 'public/assets/tiles/legend_tileset/tileset_ext.png', 10), (110, 200, 'public/assets/tiles/legend_tileset/tileset_ext2.png', 10),
                            (200, 300, 'public/assets/tiles/water_set/ws_static.png', 10), (500, 900, 'public/assets/tiles/land_set/ls_static.png', 16)):
        if lo <= i < hi:
            f = i - lo; return P(p).crop(((f % cols) * 32, (f // cols) * 32, (f % cols) * 32 + 32, (f // cols) * 32 + 32))
    raise ValueError(i)
USED = json.load(open(os.path.join(ROOT, 'database/data/tile_layer_names_used.json'), encoding='utf-8'))['names']
OG = old_src(3); ogp = OG.load(); NG = x2(single('C', 301)); ngp = NG.load()
L = lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
OGL = sum(L(ogp[x, y]) for x in range(32) for y in range(32)) / 1024
HUES = [colorsys.rgb_to_hsv(*[q / 255 for q in ogp[x, y][:3]])[0] * 360 for x in range(32) for y in range(32)]
H0, H1 = min(HUES) - 6, max(HUES) + 6
rg = []; qa_rg = {}
for n in RG_NAMES:
    t = old_src(USED[n]['index']).copy(); tp = t.load(); same = shade = 0
    for y in range(32):
        for x in range(32):
            p = tp[x, y]
            if p == ogp[x, y]: tp[x, y] = ngp[x, y]; same += 1; continue
            h, s, v = colorsys.rgb_to_hsv(*[q / 255 for q in p[:3]])
            if p[3] == 255 and H0 <= h * 360 <= H1 and s > 0.35:
                r = L(p) / OGL; q = ngp[x, y]; tp[x, y] = tuple(min(255, int(q[i] * r)) for i in range(3)) + (255,); shade += 1
    rg.append((f'rg_{n}', t, f'기존 {n}(idx {USED[n]["index"]}) 재바탕: 풀 동일 {same}px, 그림자 {shade}px'))
    qa_rg[n] = {'same': same, 'shade': shade}

COLS = 16
def sheet_of(n_rows): return Image.new('RGBA', (COLS * 32, n_rows * 32), (0, 0, 0, 0))
static += [(n, im, s) for n, im, s in rg]  # 32px 원본(x2 하지 않음)
RG32 = {n for n, _, _ in rg}
rows_s = (len(static) + COLS - 1) // COLS
S = sheet_of(rows_s); names = {}; qa = {'nonopaque': [], 'keycolor': [], 'dup_mask_tiles': 0}
def check(name, im):
    px = im.load()
    for y in range(T):
        for x in range(T):
            p = px[x, y]
            if p[3] != 255: qa['nonopaque'].append(name); return
            if p[:3] == KEY: qa['keycolor'].append(name); return
for i, (n, im, src) in enumerate(static):
    if n in RG32: S.paste(im, ((i % COLS) * 32, (i // COLS) * 32))
    else: check(n, im); S.paste(x2(im), ((i % COLS) * 32, (i // COLS) * 32))
    names[n] = {'sheet': 'tv2_static', 'frame': i, 'index': 1000 + i, 'src': src}
S.save(f'{OUT}/tv2_static.png', optimize=True)
rows_a = (len(anim) + COLS - 1) // COLS; stride = rows_a * COLS
A = sheet_of(rows_a * 4)
for i, (n, frames, src) in enumerate(anim):
    for fi, sf in enumerate((0, 1, 2, 1)):
        check(n, frames[sf])
        j = i + fi * stride
        A.paste(x2(frames[sf]), ((j % COLS) * 32, (j // COLS) * 32))
    names[n] = {'sheet': 'tv2_anim', 'frame': i, 'index': 1700 + i, 'src': src, 'frames': 4, 'stride': stride}
A.save(f'{OUT}/tv2_anim.png', optimize=True)
spec = {'static': {'key': 'tv2_static', 'path': '/assets/tiles/tileset_v2/tv2_static.png', 'cols': COLS, 'start': 1000, 'count': len(static), 'size': list(S.size)},
        'anim': {'key': 'tv2_anim', 'path': '/assets/tiles/tileset_v2/tv2_anim.png', 'cols': COLS, 'start': 1700, 'count': len(anim), 'stride': stride, 'frames': 4, 'frame_order_from_rm': [0, 1, 2, 1], 'size': list(A.size)},
        'masks': MASKS, 'mask_rule': 'landPaint.js red(): N1 NE2 E4 SE8 S16 SW32 W64 NW128, 대각은 인접 두 직교가 같을 때만',
        'families': {n: s for n, _, _, s in [(f[0], 0, 0, f'{f[1]} block {f[2]} — {f[3]}') for f in FAM]} | {'water47': 'C water_A 3프레임 + 내부 C:120~122'}}
json.dump({'spec': spec, 'names': names}, open(f'{OUT}/tv2_names.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
qa['regrounded'] = qa_rg
qa['static_count'] = len(static); qa['anim_count'] = len(anim)
json.dump(qa, open(f'{HERE}/bake_qa.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'static': len(static), 'anim': len(anim), 'stride': stride, 'S': S.size, 'A': A.size, 'nonopaque': qa['nonopaque'][:5], 'keycolor': qa['keycolor'][:5]}))
