# tileset_v2 3단계 확장 베이크(안아트, 2026-11-02): 맵디자이너 요청(docs/TILEMAP_PLAN.md 6-6).
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/bake_ext.py <루트>      (bake.py -> map_names.py 다음에 실행. 멱등)
# 원칙: 기존 1000~1618 / 1700~1747 픽셀·이름·인덱스는 바꾸지 않는다(첫 실행 시 .bak-ext-20261102 백업, 매 실행 시 기존 구간 해시 대조).
#   1) tv2_static 1619~ : 맵 오브젝트(칩셋 상층·하층 단일 칸, 마젠타 키 -> 알파 0, x2 최근접). 이름 obj_*, 칩셋 키 -> 인덱스 표 chip_index.
#   2) tv2_anim2 1800~ (새 시트, 4프레임 [0,1,2,1], stride = 칸 수를 16 배수로 올림):
#      ford47_<m>      여울: sand47 쿼터 합성 위 모래 픽셀에만 C 수면 내부(C:120~122)를 밝고 채도 낮게 반투명 합성. 풀 픽셀은 그대로.
#      sandwater47_<m> 모래 물가 물: water47 쿼터 합성의 물가(풀·흙둑) 픽셀을 C b1 모래 채움(C:70)·모래 테두리 색으로 바꿈.
#      tv2reef_{a..d}  암초: 기존 ws_anim reef(302~305) 4프레임에서 물(파랑·하늘색) 픽셀을 버리고 바위·포말만 tv2 바다(water47_255) 위에 합성.
#   3) tileset_v2_map.json 에 index_map_ext(선택 표, 기존 index_map 은 그대로)·chip_index·ranges_ext 추가.
# 이미지 모델 호출 0회(Pillow 절차 합성).
import sys, os, json, hashlib, shutil, colorsys
from PIL import Image

ROOT = sys.argv[1]
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2')
OUT = os.path.join(ROOT, 'public/assets/tiles/tileset_v2')
TAG = '.bak-ext-20261102'
KEY = (225, 0, 126)
T, Q, COLS = 16, 8, 16
BASE_STATIC = 619          # bake.py 산출 칸 수(1000~1618) — 바꾸지 않음
ANIM2_START = 1800         # 새 애니 구간(1800~1999)
SH = {k: Image.open(f'{HERE}/chipsets/chipset_{k}_16.png').convert('RGBA') for k in 'ABCD'}

for f in ('tv2_static.png', 'tv2_names.json', 'tileset_v2_map.json', 'manifest_fragment_tv2.json'):
    p = os.path.join(OUT, f)
    if not os.path.exists(p + TAG): shutil.copy2(p, p + TAG)

# ---------------------------------------------------------------- 47형 마스크·쿼터 합성(bake.py 와 동일 규칙)
BITS = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}
def red(m):
    for d, a, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not ((m & BITS[a]) and (m & BITS[b])): m &= ~BITS[d]
    return m
MASKS = sorted(set(red(m) for m in range(256)))
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
            ty = 4 if (h and v and d) else 3 if (h and v) else 2 if h else 1 if v else 0
            out.paste(quarter(img, f, ty, cx, cy), (cx * Q, cy * Q))
    return out
def single(sheet, tid):
    c, r = tid % 30, tid // 30
    return SH[sheet].crop((c * T, r * T, c * T + T, r * T + T))
x2 = lambda im: im.resize((im.width * 2, im.height * 2), Image.NEAREST)
hsv = lambda p: colorsys.rgb_to_hsv(*[q / 255 for q in p[:3]])
def is_grass(p):
    h, s, v = hsv(p); return 70 <= h * 360 <= 115 and s > 0.5

# ---------------------------------------------------------------- 1) 오브젝트(정적, 투명)
OBJ = [  # (이름, 칩셋 키, 설명) — design.json objects 의 칩셋 키 전부(river_02·im_01_okpo)
    ('obj_well', 'C:87', '우물(돌, 상층. D:382 와 픽셀 동일 -> chip_index 에서 같은 칸)'),
    ('obj_brazier', 'D:318', '봉화·화로(상층)'), ('obj_signpost', 'D:440', '이정표(상층)'),
    ('obj_firewood', 'D:349', '장작더미(상층)'), ('obj_barrel', 'D:177', '통(상층)'),
    ('obj_crate_a', 'D:202', '상자(하층, 칸 전체 불투명)'), ('obj_crate_b', 'D:203', '상자(하층, 칸 전체 불투명)'),
]
objs = []
for n, key, note in OBJ:
    s, i = key.split(':'); im = single(s, int(i))
    objs.append((n, key, im, note))

# ---------------------------------------------------------------- 2) 애니 확장
WATER_IN = [single('C', 120 + f) for f in range(3)]          # 수면 내부 3프레임(water47_255 와 같은 원본)
SAND_FILL = single('C', 70)
FORD_A, FORD_HI_A, FORD_RIM_A = 0.62, 0.85, 0.40             # 모래 위 수면 불투명도 / 물결 하이라이트 / 모래 테두리(물가 둑)
def ford_water(p):
    h, s, v = hsv(p)
    return tuple(int(c * 255) for c in colorsys.hsv_to_rgb(h - 0.02, s * 0.70, min(1.0, v * 0.80 + 0.30)))   # 청록 쪽으로 약간, 채도 낮게, 밝게
def ford_tile(f, m):
    base = floor_tile('C', 9, 0, m); w = WATER_IN[f]; bp = base.load(); wp = w.load()
    out = base.copy(); op = out.load()
    for y in range(T):
        for x in range(T):
            p = bp[x, y]
            if is_grass(p): continue
            _, _, sv = hsv(p); q = wp[x, y]; _, _, wv = hsv(q)
            a = FORD_HI_A if wv >= 0.92 else FORD_A
            if sv < 0.6: a = FORD_RIM_A                        # 모래 둑 어두운 테두리: 둑이 보이게 덜 덮음
            c = ford_water(q)
            op[x, y] = tuple(int(p[i] * (1 - a) + c[i] * a) for i in range(3)) + (255,)
    return out
RIM = {(75, 43, 23): (107, 93, 74), (119, 94, 65): (137, 124, 87), (142, 119, 86): (169, 142, 90), (164, 144, 107): (185, 156, 95)}   # 흙둑 -> 젖은 모래 둑(C b1 테두리 색)
def sandwater_tile(f, m):
    t = water_tile('C', f, m); tp = t.load(); sp = SAND_FILL.load()
    for y in range(T):
        for x in range(T):
            p = tp[x, y]
            if p[:3] in RIM: tp[x, y] = RIM[p[:3]] + (255,)
            elif is_grass(p): tp[x, y] = sp[x, y]
    return t
WS_ANIM = Image.open(os.path.join(ROOT, 'public/assets/tiles/water_set/ws_anim.png')).convert('RGBA')
def ws_frame(i, f):
    fr = (i - 300) + f * 80; return WS_ANIM.crop((fr % 10 * 32, fr // 10 * 32, fr % 10 * 32 + 32, fr // 10 * 32 + 32))
REEF_FOAM = {(128, 232, 255): (108, 178, 254), (0, 212, 255): (80, 150, 238)}
def reef_tile(old_idx, f, rm_f):
    sea = x2(water_tile('C', rm_f, 255)); rock = ws_frame(old_idx, f); rp = rock.load(); keep = Image.new('RGBA', (32, 32)); kp = keep.load()
    for y in range(32):
        for x in range(32):
            p = rp[x, y]; h, s, v = hsv(p)
            if p[:3] in REEF_FOAM: kp[x, y] = REEF_FOAM[p[:3]] + (255,); continue   # 하늘색 포말 띠 -> tv2 수면 밝은 색(C water_A 팔레트)
            if 180 <= h * 360 <= 240 and s > 0.30: continue      # 기존 물(파랑) 제거
            kp[x, y] = p[:3] + (255,)
    sea.alpha_composite(keep); return sea
ORDER = (0, 1, 2, 1)
anim2 = []   # (이름, [32px x4], 출처)
for m in MASKS:
    fr = [ford_tile(f, m) for f in range(3)]
    anim2.append((f'ford47_{m}', [x2(fr[o]) for o in ORDER], f'여울: C b1 모래 mask {m} + C:120~122 수면(밝게·채도 0.70배, 불투명도 {FORD_A}/{FORD_HI_A}/{FORD_RIM_A})'))
for m in MASKS:
    fr = [sandwater_tile(f, m) for f in range(3)]
    anim2.append((f'sandwater47_{m}', [x2(fr[o]) for o in ORDER], f'모래 물가 물: C water_A mask {m}, 풀 -> C:70 모래, 흙둑 -> 모래 테두리색'))
for nm, old in (('a', 303), ('b', 304), ('c', 305), ('d', 302)):
    anim2.append((f'tv2reef_{nm}', [reef_tile(old, f, ORDER[f]) for f in range(4)], f'암초: 기존 reef_{nm}(ws_anim {old}) 바위·포말 + tv2 바다 water47_255'))

# ---------------------------------------------------------------- 시트 쓰기(기존 구간 보존 검증)
SP = os.path.join(OUT, 'tv2_static.png')
src_static = Image.open(SP + TAG).convert('RGBA')    # 항상 bake.py 원본(백업)에서 시작 -> 멱등
cell = lambda im, i: im.crop((i % COLS * 32, i // COLS * 32, i % COLS * 32 + 32, i // COLS * 32 + 32))
base_hash = hashlib.sha1(b''.join(cell(src_static, i).tobytes() for i in range(BASE_STATIC))).hexdigest()
n_static = BASE_STATIC + len(objs)
S = Image.new('RGBA', (COLS * 32, (n_static + COLS - 1) // COLS * 32), (0, 0, 0, 0))
S.paste(src_static.crop((0, 0, src_static.width, min(src_static.height, S.height))), (0, 0))
for i in range(BASE_STATIC, (S.height // 32) * COLS):   # 원본 마지막 줄의 빈 칸 비우기(보존 대상 아님)
    S.paste(Image.new('RGBA', (32, 32), (0, 0, 0, 0)), (i % COLS * 32, i // COLS * 32))
for k, (n, key, im, note) in enumerate(objs):
    i = BASE_STATIC + k; S.paste(x2(im), (i % COLS * 32, i // COLS * 32))
assert hashlib.sha1(b''.join(cell(S, i).tobytes() for i in range(BASE_STATIC))).hexdigest() == base_hash, '기존 구간 변경됨'
S.save(SP, optimize=True)
stride = (len(anim2) + COLS - 1) // COLS * COLS
A2 = Image.new('RGBA', (COLS * 32, stride // COLS * 4 * 32), (0, 0, 0, 0))
for i, (n, frames, _) in enumerate(anim2):
    for f, im in enumerate(frames):
        j = i + f * stride; A2.paste(im, (j % COLS * 32, j // COLS * 32))
A2.save(os.path.join(OUT, 'tv2_anim2.png'), optimize=True)

# ---------------------------------------------------------------- QA
qa = {'base_static_hash_unchanged': True, 'base_hash': base_hash, 'objects': {}, 'anim2': {'nonopaque': [], 'keycolor': []}}
for n, key, im, note in objs:
    px = list(im.get_flattened_data()); al = [p[3] for p in px]
    qa['objects'][n] = {'chip': key, 'opaque_ratio': round(sum(a == 255 for a in al) / 256, 3), 'semi_alpha_px': sum(0 < a < 255 for a in al),
                        'keycolor_px': sum(p[:3] == KEY and p[3] > 0 for p in px), 'sha1_12': hashlib.sha1(im.tobytes()).hexdigest()[:12]}
for n, frames, _ in anim2:
    for im in frames:
        px = list(im.get_flattened_data())
        if any(p[3] != 255 for p in px): qa['anim2']['nonopaque'].append(n); break
        if any(p[:3] == KEY for p in px): qa['anim2']['keycolor'].append(n); break
def stats(ims):
    ss = vs = ls = 0; n = 0
    for im in ims:
        for p in im.get_flattened_data():
            h, s, v = hsv(p); ss += s; vs += v; ls += 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]; n += 1
    return {'sat': round(ss / n, 3), 'val': round(vs / n, 3), 'luma': round(ls / n, 1)}
river = [x2(water_tile('C', f, 255)) for f in range(3)]
ford = next(fr for n, fr, _ in anim2 if n == 'ford47_255')[:3]
qa['ford_vs_river_fill'] = {'river_water47_255': stats(river), 'ford47_255': stats(ford)}
dup = {}
for n, key, im, note in objs: dup.setdefault(qa['objects'][n]['sha1_12'], []).append(n)
qa['object_pixel_duplicates'] = [v for v in dup.values() if len(v) > 1]
json.dump(qa, open(os.path.join(HERE, 'bake_ext_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- 이름표·표
NP = os.path.join(OUT, 'tv2_names.json')
doc = json.load(open(NP + TAG, encoding='utf-8'))
names = doc['names']
for k, (n, key, im, note) in enumerate(objs):
    names[n] = {'sheet': 'tv2_static', 'frame': BASE_STATIC + k, 'index': 1000 + BASE_STATIC + k, 'src': f'{key} {note}', 'alpha': True, 'chip': key}
for i, (n, _, s) in enumerate(anim2):
    names[n] = {'sheet': 'tv2_anim2', 'frame': i, 'index': ANIM2_START + i, 'src': s, 'frames': 4, 'stride': stride}
doc['spec']['static'].update({'count': n_static, 'size': list(S.size), 'base_count_v1': BASE_STATIC,
                              'note_ext': f'1000~1618 = bake.py(불변), 1619~{1000 + n_static - 1} = bake_ext.py 오브젝트(투명, alpha 0/255)'})
doc['spec']['anim2'] = {'key': 'tv2_anim2', 'path': '/assets/tiles/tileset_v2/tv2_anim2.png', 'cols': COLS, 'start': ANIM2_START, 'count': len(anim2),
                        'stride': stride, 'frames': 4, 'frame_order_from_rm': [0, 1, 2, 1], 'size': list(A2.size), 'capacity': [1800, 1999],
                        'note': '프레임 = (전역-1800) + f*stride. tv2reef_* 는 기존 ws_anim 4프레임 f 와 tv2 수면 [0,1,2,1][f] 를 합성'}
doc['spec']['families'].update({'ford47': '여울(C b1 모래 + C:120~122 수면 반투명, 4프레임)', 'sandwater47': '모래 물가 물(C water_A, 물가 풀/흙 -> 모래)'})
json.dump(doc, open(NP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

B = BITS
def mask_from_edge(edge):
    if edge.endswith('_inner') or edge.endswith('_outer'):
        d, kind = edge.split('_'); other = (B[d[0]] | B[d[1]] | B[d]) if kind == 'inner' else B[d]
    elif edge.startswith('U_'): other = 255 & ~B[edge[2:]]
    elif edge in ('NS', 'EW'): other = B[edge[0]] | B[edge[1]]
    else: other = B[edge]
    return red(255 & ~other)
MP = os.path.join(OUT, 'tileset_v2_map.json')
mp = json.load(open(MP + TAG, encoding='utf-8'))
used = json.load(open(os.path.join(ROOT, 'database/data/tile_layer_names_used.json'), encoding='utf-8'))['names']
ext, why = {}, {}
def put(n, target, note): ext[n] = names[target]['index']; why[n] = f'{target} — {note}'
for n in sorted(used):
    if n in ('ford_a', 'ford_b', 'ford_deep_N', 'ford_deep_S'): put(n, 'ford47_255', '여울 채움(여울은 물과 이음선 없이 맞붙음)')
    elif n.startswith('grass_ford_'): put(n, f'ford47_{mask_from_edge(n[11:])}', '풀->여울 전이(여울 칸, 방향 = 풀 쪽)')
    elif n.startswith('sand_sea_'): put(n, f'sandwater47_{mask_from_edge(n[9:])}', '모래->물 물가(물 칸, 방향 = 모래 쪽)')
    elif n in ('reef_a', 'reef_b', 'reef_c', 'reef_d'): put(n, f'tv2reef_{n[-1]}', '암초(tv2 바다 위)')
mp['ranges_ext'] = {'tv2_static_obj': [1000 + BASE_STATIC, 1000 + n_static - 1], 'tv2_anim2': [ANIM2_START, ANIM2_START + len(anim2) - 1]}
mp['index_map_ext'] = ext
mp['why_ext'] = why
mp['ext_note'] = ('선택 표(안아트 bake_ext.py 2026-11-02): FE 가 tv2_anim2(1800~) 구간을 등록한 뒤 index_map 보다 먼저 적용. '
                  'index_map 의 sand_sea_* 근사(water47) 와 rg_grass_ford_* 를 대체한다. tv2_map_to_js.mjs 의 구간 검사(1000~1618, 1700~1747)는 이 키를 읽지 않음')
mp['chip_index'] = {key: names[n]['index'] for n, key, _, _ in objs} | {'D:382': names['obj_well']['index']}
mp['chip_index_note'] = 'tile_layer.v2 오브젝트 이름 cs:<시트>:<id> -> tv2_static 인덱스(투명 오브젝트, building/object/foreground 레이어용)'
json.dump(mp, open(MP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'static': n_static, 'objects': [(n, names[n]['index']) for n, *_ in objs], 'anim2': len(anim2), 'stride': stride, 'A2': A2.size, 'S': S.size,
                  'index_map_ext': len(ext), 'qa_anim2': qa['anim2'], 'ford_vs_river': qa['ford_vs_river_fill'], 'obj_dup': qa['object_pixel_duplicates']}, ensure_ascii=False))
