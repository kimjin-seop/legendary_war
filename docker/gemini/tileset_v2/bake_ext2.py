# tileset_v2 4단계 확장 베이크(안아트-타일·오브젝트, 2026-11-02): 맵디자이너 요청(오브젝트 확대·애니·늪·서가 허공 경계·누락 이름 매핑).
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/bake_ext2.py <루트>
#   순서: bake.py -> map_names.py -> bake_ext.py -> bake_ext2.py. 멱등(자기가 추가한 칸·이름·키를 먼저 지우고 다시 씀).
# 원칙: 기존 1000~1625 / 1700~1747 / 1800~1897 픽셀·이름·인덱스는 바꾸지 않는다(매 실행 해시 대조, 첫 실행 시 .bak-tilev2-20261102 백업).
#   1) tv2_static 1626~1699: 칩셋 오브젝트(단일·다타일 조각). 이름 obj2_*, 칩셋 키 -> chip_index_ext2.
#   2) tv2_anim2 1898~1911(stride 112 고정 — FE 등록값): 칩셋 애니 칸(열3~5 행4~7, 세로 4프레임) 중 픽셀 고유한 것.
#   3) 새 시트 tv2_static2 2000~: swamp47(여울과 같은 방식: C b0 흙길 위 탁한 수면 반투명, 정적) / void47(B b3 구덩이 블록, 바위 바닥 픽셀 -> D:172 판자 바닥).
#   4) tileset_v2_map.json:
#      index_map_ext 에 기존 유효 구간(1000~1897)만 쓰는 누락 이름 추가(snow_a/b 등, 원인 = tile_layer_names_used.json 170종에 pack20_v2 이름 누락).
#      새 구간(1626~, 1898~, 2000~)은 FE 변환기(tv2_map_to_js.mjs)가 구간 밖이면 예외를 내므로 별도 키 index_map_ext2 / chip_index_ext2 에만 쓴다.
# 이미지 모델 호출 0회(Pillow 절차 합성).
import sys, os, json, hashlib, shutil, colorsys
from PIL import Image

ROOT = sys.argv[1]
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2')
OUT = os.path.join(ROOT, 'public/assets/tiles/tileset_v2')
TAG = '.bak-tilev2-20261102'
T, Q, COLS = 16, 8, 16
BASE_STATIC = 626          # 1000~1625 (bake.py 619 + bake_ext.py 7) — 바꾸지 않음
STATIC_CAP = 700           # 1000~1699
ANIM2_BASE, ANIM2_STRIDE = 98, 112   # 1800~1897 기존, stride 는 FE 등록값 고정
S2_START = 2000            # 새 정적 시트(용량 2000~2199)
SH = {k: Image.open(f'{HERE}/chipsets/chipset_{k}_16.png').convert('RGBA') for k in 'ABCD'}
for f in ('tv2_static.png', 'tv2_anim2.png', 'tv2_names.json', 'tileset_v2_map.json'):
    p = os.path.join(OUT, f)
    if not os.path.exists(p + TAG): shutil.copy2(p, p + TAG)

BITS = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}
def red(m):
    for d, a, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not ((m & BITS[a]) and (m & BITS[b])): m &= ~BITS[d]
    return m
MASKS = sorted(set(red(m) for m in range(256)))
def bits(m, cx, cy):
    return (bool(m & (BITS['E'] if cx else BITS['W'])), bool(m & (BITS['S'] if cy else BITS['N'])),
            bool(m & BITS[('S' if cy else 'N') + ('E' if cx else 'W')]))
def quarter(img, tx, ty, cx, cy):
    return img.crop((tx * T + cx * Q, ty * T + cy * Q, tx * T + cx * Q + Q, ty * T + cy * Q + Q))
def floor_tile(sheet, bx, by, m):     # bake.py 와 같은 쿼터 규칙
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
def single(sheet, tid):
    c, r = tid % 30, tid // 30
    return SH[sheet].crop((c * T, r * T, c * T + T, r * T + T))
x2 = lambda im: im.resize((im.width * 2, im.height * 2), Image.NEAREST)
hsv = lambda p: colorsys.rgb_to_hsv(*[q / 255 for q in p[:3]])
def is_grass(p):
    h, s, v = hsv(p); return 70 <= h * 360 <= 115 and s > 0.5
sha = lambda im: hashlib.sha1(im.tobytes()).hexdigest()[:12]

# ---------------------------------------------------------------- 1) 오브젝트(칩셋 그대로, x2)
# (이름, 칩셋 키 목록(왼->오, 위->아래), 가로 칸 수, 설명). 서양 전용 소품(INN/PUB 간판·십자가·스테인드글라스·피아노·왕좌·갑옷상)은 제외.
OBJ = [
    ('rock_grey', ['C:57'], 1, '바위(회색)'), ('rock_pile', ['C:59'], 1, '돌무더기'), ('rock_pile_b', ['D:178'], 1, '돌무더기(작은 돌)'),
    ('rubble_a', ['D:29'], 1, '잔해 돌(작음)'), ('rubble_b', ['D:59'], 1, '잔해 돌(작음, 다른 모양)'),
    ('tree_small', ['C:259'], 1, '둥근 작은 나무'), ('stump', ['D:259'], 1, '그루터기'), ('sapling_dead', ['C:260'], 1, '마른 묘목'),
    ('bush', ['D:289'], 1, '덤불'), ('bush_flower', ['D:288'], 1, '꽃 덤불'), ('bush_red', ['D:351'], 1, '붉은 꽃 덤불'), ('flowers', ['D:348'], 1, '들꽃'),
    ('conifer', ['D:260', 'D:290'], 1, '침엽수 1x2(위/아래)'), ('dead_tree', ['D:261', 'D:291'], 1, '고목 1x2'),
    ('tree_big', ['D:262', 'D:263', 'D:292', 'D:293'], 2, '큰 활엽수 2x2'),   # C:318 2x2 큰 나무 = D:262 와 픽셀 동일(제외)
    ('menhir', ['C:89', 'C:119'], 1, '선돌 1x2'), ('tombstone', ['D:353'], 1, '비석'), ('bones', ['D:383'], 1, '해골·뼈(전장 흔적)'),
    ('campfire', ['D:381'], 1, '모닥불(정적, 애니는 tv2fx_campfire)'), ('pot', ['D:352'], 1, '항아리'), ('bucket', ['D:207'], 1, '나무 들통'),
    ('ladder', ['D:322'], 1, '사다리(공성)'), ('notice', ['D:320'], 1, '방(종이 쪽지)'), ('wood_pillar', ['D:358', 'D:388'], 1, '나무 기둥 1x2'),
    # 제외(자체 점검): D:149 판자 잔해(하층, 보라 바닥 불투명), D:441 평상(하층 바닥 칸), C:440 폐허 2x2(월드맵 축척), D:471 말뚝(칸 위쪽 조각만 — 다른 물체 일부)
    ('fence_378', ['D:378'], 1, '나무 울타리 조각'), ('fence_379', ['D:379'], 1, '나무 울타리 조각'), ('fence_380', ['D:380'], 1, '나무 울타리 조각'),
    ('fence_408', ['D:408'], 1, '나무 울타리 조각'), ('fence_409', ['D:409'], 1, '나무 울타리 조각'), ('fence_410', ['D:410'], 1, '나무 울타리 조각'),
    ('fence_438', ['D:438'], 1, '나무 울타리 조각'), ('fence_439', ['D:439'], 1, '나무 울타리 조각'),
    ('table_round', ['D:114'], 1, '둥근 탁자'), ('table_small', ['D:117'], 1, '작은 탁자'), ('stool', ['D:147'], 1, '등받이 없는 의자'),
    ('bench', ['D:327', 'D:328'], 2, '긴 의자 2x1'),
    ('wall_crumbled', ['D:268', 'D:269', 'D:298', 'D:299'], 2, '무너진 돌담 2x2'),
    ('wood_frame', ['D:468', 'D:469', 'D:470'], 3, '나무 문틀·가대 3x1(verify: 문/교각 판독 불확실)'),
]
objs = []   # (이름, 키, 16px 이미지, 설명)
for base, keys, w, note in OBJ:
    for k, key in enumerate(keys):
        s, i = key.split(':'); nm = f'obj2_{base}' if len(keys) == 1 else f'obj2_{base}_{k % w}{k // w}'
        objs.append((nm, key, single(s, int(i)), note + ('' if len(keys) == 1 else f' — 조각 x{k % w} y{k // w}')))
assert BASE_STATIC + len(objs) <= STATIC_CAP, len(objs)

# ---------------------------------------------------------------- 2) 애니 칸(세로 4프레임). 고유 픽셀만
KIND = {3: 'waterfall', 4: 'whirl_dark', 5: 'whirlpool'}
anims, seen = [], {}
for s in 'CABD':      # C 를 먼저(지면 세트의 주 시트)
    for col in (3, 4, 5):
        fr = [single(s, (4 + f) * 30 + col) for f in range(4)]
        h = hashlib.sha1(b''.join(f.tobytes() for f in fr)).hexdigest()[:12]
        if h in seen: continue
        kind = KIND[col]
        if s == 'A' and col == 4:                             # A 시트 열4 = 모닥불(판독). 칩셋은 단색 배경(34,34,35) 불투명 -> 배경색 알파 0(오브젝트 레이어용)
            kind = 'campfire'
            for im in fr:
                px = im.load()
                for yy in range(T):
                    for xx in range(T):
                        if px[xx, yy][:3] == (34, 34, 35): px[xx, yy] = (0, 0, 0, 0)
        seen[h] = f'{s}:{4 * 30 + col}'
        anims.append((f'tv2fx_{kind}' + ('' if s == 'C' else f'_{s.lower()}'), [x2(f) for f in fr], f'{s}:{4*30+col},{5*30+col},{6*30+col},{7*30+col} 세로 4프레임({kind})'))
assert ANIM2_BASE + len(anims) <= ANIM2_STRIDE, len(anims)

# ---------------------------------------------------------------- 3) tv2_static2: swamp47 / void47
WATER_IN = single('C', 120)
SWAMP_A, SWAMP_RIM_A = 0.86, 0.40
def swamp_water(p):
    h, s, v = hsv(p)
    # 탁한 늪물: 파랑 -> 올리브 갈색 쪽, 채도 낮게, 어둡게
    return tuple(int(c * 255) for c in colorsys.hsv_to_rgb(0.20, 0.62 - 0.30 * max(0.0, v - 0.85) / 0.15, 0.12 + 0.34 * v))   # 어두운 올리브 녹색, 물결 하이라이트는 밝고 덜 채도
def swamp_tile(m):
    base = floor_tile('C', 6, 0, m); bp = base.load(); wp = WATER_IN.load(); out = base.copy(); op = out.load()
    for y in range(T):
        for x in range(T):
            p = bp[x, y]
            if is_grass(p): continue
            _, _, sv = hsv(p); a = SWAMP_RIM_A if sv < 0.45 else SWAMP_A
            c = swamp_water(wp[x, y])
            op[x, y] = tuple(int(p[i] * (1 - a) + c[i] * a) for i in range(3)) + (255,)
    return out
ROCK = set(px[:3] for px in single('B', 4 * 30 + 9 + 1).get_flattened_data())   # B b3 블록 (1,0) 바탕 칸 = 바위 바닥 색 집합
WOOD = single('D', 172)                                                     # 판자 바닥(가로 결) = woodfloor_h
def void_tile(m):
    t = floor_tile('B', 9, 4, m); tp = t.load(); wp = WOOD.load(); n = 0
    for y in range(T):
        for x in range(T):
            if tp[x, y][:3] in ROCK: tp[x, y] = wp[x, y]; n += 1
    return t, n
s2 = [('swamp_single', swamp_tile(0), 'C b0 흙길 고립 + 늪물(쿼터 섬)')]
for m in MASKS: s2.append((f'swamp47_{m}', swamp_tile(m), f'늪: C b0 흙길 mask {m} + C:120 수면 올리브·어둡게 반투명 {SWAMP_A}/{SWAMP_RIM_A}(정적)'))
void_rock_left = {}
for m in MASKS:
    im, n = void_tile(m); s2.append((f'void47_{m}', im, f'허공: B b3 구덩이 mask {m}, 바위 바닥 픽셀 {n}개 -> D:172 판자 바닥'))
im0, _ = void_tile(0); s2.append(('void_single', im0, 'B b3 구덩이 고립(판자 바닥 위)'))

# ---------------------------------------------------------------- 시트 쓰기(기존 구간 보존 검증)
cell = lambda im, i: im.crop((i % COLS * 32, i // COLS * 32, i % COLS * 32 + 32, i // COLS * 32 + 32))
SP = os.path.join(OUT, 'tv2_static.png'); src = Image.open(SP).convert('RGBA')
h0 = hashlib.sha1(b''.join(cell(src, i).tobytes() for i in range(BASE_STATIC))).hexdigest()
n_static = BASE_STATIC + len(objs)
S = Image.new('RGBA', (COLS * 32, (n_static + COLS - 1) // COLS * 32), (0, 0, 0, 0))
for i in range(BASE_STATIC): S.paste(cell(src, i), (i % COLS * 32, i // COLS * 32))
for k, (n, key, im, note) in enumerate(objs):
    i = BASE_STATIC + k; S.paste(x2(im), (i % COLS * 32, i // COLS * 32))
assert hashlib.sha1(b''.join(cell(S, i).tobytes() for i in range(BASE_STATIC))).hexdigest() == h0
S.save(SP, optimize=True)
AP = os.path.join(OUT, 'tv2_anim2.png'); A2 = Image.open(AP).convert('RGBA')
assert A2.size == (512, ANIM2_STRIDE // COLS * 4 * 32), A2.size
a_idx = [i + f * ANIM2_STRIDE for f in range(4) for i in range(ANIM2_BASE)]
h1 = hashlib.sha1(b''.join(cell(A2, j).tobytes() for j in a_idx)).hexdigest()
for f in range(4):
    for i in range(ANIM2_BASE, ANIM2_STRIDE):
        j = i + f * ANIM2_STRIDE; A2.paste(Image.new('RGBA', (32, 32), (0, 0, 0, 0)), (j % COLS * 32, j // COLS * 32))
for k, (n, frames, _) in enumerate(anims):
    for f, im in enumerate(frames):
        j = ANIM2_BASE + k + f * ANIM2_STRIDE; A2.paste(im, (j % COLS * 32, j // COLS * 32))
assert hashlib.sha1(b''.join(cell(A2, j).tobytes() for j in a_idx)).hexdigest() == h1
A2.save(AP, optimize=True)
S2 = Image.new('RGBA', (COLS * 32, (len(s2) + COLS - 1) // COLS * 32), (0, 0, 0, 0))
for i, (n, im, _) in enumerate(s2): S2.paste(x2(im), (i % COLS * 32, i // COLS * 32))
S2.save(os.path.join(OUT, 'tv2_static2.png'), optimize=True)

# ---------------------------------------------------------------- QA
qa = {'base_static_hash_unchanged': True, 'anim2_base_hash_unchanged': True, 'objects': {}, 'anims': {}, 'static2': {'nonopaque': [], 'magenta': []}}
for n, key, im, note in objs:
    px = list(im.get_flattened_data()); al = [p[3] for p in px]
    qa['objects'][n] = {'chip': key, 'opaque_ratio': round(sum(a == 255 for a in al) / 256, 3), 'semi_alpha_px': sum(0 < a < 255 for a in al),
                        'empty': all(a == 0 for a in al), 'sha1_12': sha(im)}
for n, frames, s in anims:
    qa['anims'][n] = {'src': s, 'opaque': all(p[3] == 255 for f in frames for p in f.get_flattened_data()), 'frame_sha': [sha(f) for f in frames]}
for n, im, _ in s2:
    px = list(im.get_flattened_data())
    if any(p[3] != 255 for p in px): qa['static2']['nonopaque'].append(n)
    if any(p[:3] == (225, 0, 126) for p in px): qa['static2']['magenta'].append(n)
dup = {}
for n, key, im, note in objs: dup.setdefault(qa['objects'][n]['sha1_12'], []).append(n)
qa['object_pixel_duplicates'] = [v for v in dup.values() if len(v) > 1]
old_qa = json.load(open(os.path.join(HERE, 'bake_ext_qa.json'), encoding='utf-8'))
old_sha = {v['sha1_12']: k for k, v in old_qa['objects'].items()}
qa['dup_with_ext1'] = {n: old_sha[v['sha1_12']] for n, v in qa['objects'].items() if v['sha1_12'] in old_sha}
json.dump(qa, open(os.path.join(HERE, 'bake_ext2_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- 이름표
NP = os.path.join(OUT, 'tv2_names.json'); doc = json.load(open(NP, encoding='utf-8')); names = doc['names']
for k in [k for k, v in names.items() if v.get('ext2')]: del names[k]          # 멱등
for k, (n, key, im, note) in enumerate(objs):
    names[n] = {'sheet': 'tv2_static', 'frame': BASE_STATIC + k, 'index': 1000 + BASE_STATIC + k, 'src': f'{key} {note}', 'alpha': True, 'chip': key, 'ext2': True}
for k, (n, _, s) in enumerate(anims):
    names[n] = {'sheet': 'tv2_anim2', 'frame': ANIM2_BASE + k, 'index': 1800 + ANIM2_BASE + k, 'src': s, 'frames': 4, 'stride': ANIM2_STRIDE, 'ext2': True}
for i, (n, _, s) in enumerate(s2):
    names[n] = {'sheet': 'tv2_static2', 'frame': i, 'index': S2_START + i, 'src': s, 'ext2': True}
doc['spec']['static'].update({'count': n_static, 'size': list(S.size),
                              'note_ext2': f'1626~{1000 + n_static - 1} = bake_ext2.py 오브젝트(obj2_*, 투명 alpha 0/255)'})
doc['spec']['anim2'].update({'count': ANIM2_BASE + len(anims), 'note_ext2': f'1898~{1800 + ANIM2_BASE + len(anims) - 1} = bake_ext2.py 칩셋 애니(tv2fx_*, 세로 4프레임 그대로). stride 112 유지'})
doc['spec']['static2'] = {'key': 'tv2_static2', 'path': '/assets/tiles/tileset_v2/tv2_static2.png', 'cols': COLS, 'start': S2_START, 'count': len(s2),
                          'size': list(S2.size), 'capacity': [2000, 2199], 'note': '프레임 = 전역-2000. 전부 불투명. swamp47(늪, 정적)·void47(서가 허공: 판자 바닥 위 구덩이)'}
doc['spec']['families'].update({'swamp47': '늪(C b0 흙길 + 탁한 수면 반투명, 정적, tv2_static2)', 'void47': '허공(B b3 구덩이, 바닥 = D:172 판자, tv2_static2)'})
json.dump(doc, open(NP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- 표
B = BITS
def mask_from_edge(edge):
    if edge.endswith('_inner') or edge.endswith('_outer'):
        d, kind = edge.split('_'); other = (B[d[0]] | B[d[1]] | B[d]) if kind == 'inner' else B[d]
    elif edge.startswith('U_'): other = 255 & ~B[edge[2:]]
    elif edge in ('NS', 'EW'): other = B[edge[0]] | B[edge[1]]
    else: other = B[edge]
    return red(255 & ~other)
MP = os.path.join(OUT, 'tileset_v2_map.json'); mp = json.load(open(MP, encoding='utf-8'))
for k in mp.get('ext2_added_to_index_map_ext', []):           # 멱등: 지난 실행에서 넣은 키 제거
    mp['index_map_ext'].pop(k, None); mp['why_ext'].pop(k, None)
used = set(json.load(open(os.path.join(ROOT, 'database/data/tile_layer_names_used.json'), encoding='utf-8'))['names'])
in_maps = set()
for f in ('maps.json', 'maps_imjin10.json', 'maps_pack20_v2.json'):
    for m in json.load(open(os.path.join(ROOT, 'database/data', f), encoding='utf-8'))['items']:
        in_maps |= set((m.get('tile_layer') or {}).get('index_map', {}))
missing_from_used = sorted(in_maps - used)
added, ext2, why2 = [], {}, {}
def put_ext(n, target, note):                                  # 기존 유효 구간 -> index_map_ext (FE 변환기 통과)
    if n in mp['index_map'] or n in mp['index_map_ext']: return
    mp['index_map_ext'][n] = names[target]['index']; mp['why_ext'][n] = f'{target} — {note} (bake_ext2)'; added.append(n)
def put2(n, target, note):                                     # 새 구간 -> index_map_ext2
    ext2[n] = names[target]['index']; why2[n] = f'{target} — {note}'
for n in sorted(used | in_maps):
    if n in ('snow_a', 'snow_b'): put_ext(n, 'snow47_255', '눈 채움(누락 원인: tile_layer_names_used.json 170종에 pk_08 snow_a/b 없음 -> map_names/bake_ext 순회 대상 아님)')
    elif n.startswith('ford_deep_') or n.startswith('sand_ford_'): put_ext(n, 'ford47_255', '여울 채움(같은 누락 원인, 여울 바탕이 모래라 모래 쪽 테두리 불필요)')
    elif n.startswith('grass_ford_'): put_ext(n, f'ford47_{mask_from_edge(n[11:])}', '풀->여울 전이(같은 누락 원인)')
    elif n == 'shore_S': put_ext(n, f'water47_{mask_from_edge("S")}', '물가(물 칸, 같은 누락 원인)')
    elif n in ('swamp_a', 'swamp_b'): put2(n, 'swamp47_255', '늪 채움(맵 이름에 가장자리 정보 없음 -> 채움. 47형 가장자리는 tmv2 paint 로)')
    elif n in ('void_a', 'void_b'): put2(n, 'void47_255', '허공 채움')
    elif n.startswith('void_edge_'): put2(n, f'void47_{mask_from_edge(n[10:])}', '허공 가장자리(허공 칸, 방향 = 바닥 쪽. ws_spec 규약 가정 verify)')
    elif n in ('seoga_floor_a', 'seoga_floor_b'): put2(n, 'woodfloor_h', '서가 바닥 = D:172 판자 바닥(void47 의 바닥 픽셀과 같은 타일, 이음선 없음)')
mp['ext2_added_to_index_map_ext'] = added
mp['names_missing_from_used_list'] = missing_from_used
mp['ranges_ext2'] = {'tv2_static_obj2': [1000 + BASE_STATIC, 1000 + n_static - 1], 'tv2_anim2_fx': [1800 + ANIM2_BASE, 1800 + ANIM2_BASE + len(anims) - 1],
                     'tv2_static2': [S2_START, S2_START + len(s2) - 1]}
mp['index_map_ext2'] = ext2; mp['why_ext2'] = why2
mp['chip_index_ext2'] = {key: names[n]['index'] for n, key, _, _ in objs}
mp['ext2_note'] = ('안아트 bake_ext2.py 2026-11-02. index_map_ext2·chip_index_ext2 는 새 구간(1626~1687 obj2, 1898~ tv2fx, 2000~ tv2_static2) 이라 '
                   'FE 가 구간을 등록(U32_TV2.static.count, anim2.count, static2 시트)하고 tv2_map_to_js.mjs 구간 검사를 넓힌 뒤 index_map_ext 다음 순위로 병합할 것. '
                   '그 전에는 이 두 키를 읽지 않아도 기존 동작과 같다')
json.dump(mp, open(MP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'objects': len(objs), 'obj_range': mp['ranges_ext2'], 'anims': [(n, names[n]['index']) for n, *_ in anims], 'static2': len(s2),
                  'added_ext': added, 'ext2': len(ext2), 'missing_from_used': len(missing_from_used), 'dup': qa['object_pixel_duplicates'],
                  'dup_ext1': qa['dup_with_ext1'], 'empty': [n for n, v in qa['objects'].items() if v['empty']], 's2qa': qa['static2'],
                  'semi': {n: v['semi_alpha_px'] for n, v in qa['objects'].items() if v['semi_alpha_px']}}, ensure_ascii=False))
