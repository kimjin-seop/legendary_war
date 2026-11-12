# tileset_v2 일본 전국 세트(ch20 나가시노 1575 필수) — 안아트 2026-11-03. 이미지 모델 호출 0회(Pillow 절차 도트 16px -> x2). 공용 규칙 tile_lib.py.
# 새 시트 tv2_static8_japan.png(16열, 프레임 = 전역 - 3400). 구간:
#   3400~ 성·진지(오버레이): ov_mabosaku_<m4>(마방책 16형: 말뚝 + 가로대 2줄) + ov_mabosaku_gate_h/v(통행 틈), ov_ishigaki_<m4>(돌담 + 흰 토담·검은 기와 갓 16형) + ov_ishigaki_gate_h/v(성문, 통행),
#          ov_yagura_<r><c>(망루 2x2, 불통), ov_nobori_{white,black,red,blue,yellow}(노보리 세로 깃발, 문양 없음)
#   3500~ ditch47_<mask>(도랑·해자 47형 지면: 탁한 물 + 흙 둑, 남쪽 = 맞은편 흙 비탈)   3600~ paddy47_<mask>(논 47형 지면: 물 댄 논 + 모 줄 + 흙 두렁)
# 규칙: 가문 문장(몬)·글자·깃발 문양 없음. 통행: 마방책·돌담·망루 불통 / 문·틈 통행 / 도랑·논 = 맵 규칙(map_rule)
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/art_japan.py <루트> [--apply]
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tile_lib import Hx, sha_f, N_, E_, S_, W_, MASKS, x2, ctx, outline, ext4, arms, classify, split, mask47, mask4, seam4, shape_seam, check, sheet_of, apply, mapping

ROOT = sys.argv[1]; APPLY = '--apply' in sys.argv
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2'); OUTD = os.path.join(HERE, 'art_japan'); os.makedirs(os.path.join(OUTD, 'preview'), exist_ok=True)
TVP, NAMES, crop16 = ctx(ROOT); KEY = 'tv2_static8_japan'; START, END = 3400, 3699; TAG = '.bak-japan-20261103'
SETS = {'castle': 3400, 'ditch': 3500, 'paddy': 3600, 'jinmaku': 3647}
KEEP = [os.path.join(TVP, f) for f in os.listdir(TVP) if f.startswith('tv2_') and f.endswith('.png') and 'static8' not in f]; before = {p: sha_f(p) for p in KEEP}
GRASS = crop16('grass_a'); WATER = crop16('water47_255')
assert MASKS == NAMES['spec']['masks']

WOOD = [Hx(c) for c in ('#3f1f0f', '#684020', '#885f31', '#af7f40', '#c79f61')]
GRANITE = [Hx(c) for c in ('#2a2a2e', '#48484e', '#66666c', '#86868a', '#a6a6a6', '#c6c4bc')]
PLASTER = [Hx(c) for c in ('#7e7a70', '#b8b2a2', '#dedad0', '#f2efe6')]
KAWARA = [Hx(c) for c in ('#1c1e24', '#30343c', '#4a4e58', '#6a6e78')]
IRON = [Hx(c) for c in ('#1a1a1e', '#3a3a42', '#62626e')]
CLOTH = {'white': [Hx(c) for c in ('#5a5446', '#a69e88', '#d4ccb4', '#f0ead6')], 'black': [Hx(c) for c in ('#101014', '#24242c', '#3a3a46', '#56566a')],
         'red': [Hx(c) for c in ('#3a1210', '#7a2420', '#a83a2e', '#cc5a44')], 'blue': [Hx(c) for c in ('#141c3a', '#243a6e', '#3a5a9a', '#5a7cc0')],
         'yellow': [Hx(c) for c in ('#4a3210', '#8a6420', '#b88a34', '#dcb058')]}
MUD = [Hx(c) for c in ('#2a2414', '#4a3e22', '#6a5a32', '#8a7a48')]
EARTH = [Hx(c) for c in ('#3f1f0f', '#684020', '#885f31', '#af7f40', '#c79f61')]
RICE = [Hx(c) for c in ('#2f6a0e', '#4f8a1c', '#76b03a')]
GRASS_SH = Hx('#2f6a0e'); RIM = Hx('#8fc451'); DARK = Hx('#140e0c')
WT = {tuple(c[:3]): None for c in WATER.reshape(-1, 4)}
wcols = sorted(WT, key=lambda c: sum(c))
DWATER = {c: Hx('#%02x%02x%02x' % (int(c[0] * 0.45 + 20), int(c[1] * 0.5 + 24), int(c[2] * 0.45 + 18))) for c in wcols}   # 탁한 해자 물(청색 -> 짙은 청록 갈)
PWATER = {c: Hx('#%02x%02x%02x' % (int(c[0] * 0.5 + 60), int(c[1] * 0.55 + 70), int(c[2] * 0.5 + 40))) for c in wcols}  # 논물(밝은 흙빛 청록)

# ---------------------------------------------------------------- 마방책(말뚝 2px 주기 4 + 가로대 y6·y10, 세로 = 가로대 2줄 + 말뚝 머리)
def mabo_paint(m, put, sp):
    hor = (m & (E_ | W_)) or not (m & (N_ | S_))
    span = lambda x: (m & W_ and x <= 8) or (m & E_ and x >= 7) or (6 <= x <= 9)
    if hor:
        for x in range(-1, 17):
            if not span(x): continue
            if sp == 'h' and 5 <= x <= 10: continue
            if x % 8 in (1, 2):
                top = 3 if x % 16 in (1, 2) else 4
                for y in range(top, 14): put(x, y, WOOD[3] if x % 8 == 1 else WOOD[2])
                put(x, top, WOOD[4])
            put(x, 6, WOOD[3] if x % 8 not in (1, 2) else WOOD[1]); put(x, 10, WOOD[3] if x % 8 not in (1, 2) else WOOD[1]); put(x, 7, WOOD[1] if x % 8 not in (1, 2) else WOOD[2]); put(x, 11, WOOD[1] if x % 8 not in (1, 2) else WOOD[2])
        if sp == 'h':
            for px in (3, 12):
                for y in range(1, 14): put(px, y, WOOD[4]); put(px + 1, y, WOOD[1])
    if m & (N_ | S_):
        y0 = -1 if m & N_ else 4; y1 = 16 if m & S_ else 11
        for y in range(y0, y1 + 1):
            if sp == 'v' and 5 <= y <= 10: continue
            put(6, y, WOOD[2]); put(9, y, WOOD[2])
            if y % 8 in (1, 2): put(7, y, WOOD[4]); put(8, y, WOOD[3])
        if sp == 'v':
            for y in (3, 4, 11, 12): put(6, y, WOOD[4]); put(7, y, WOOD[4]); put(8, y, WOOD[1]); put(9, y, WOOD[1])
def mabo(m, sp=None): return ext4(m, mabo_paint, WOOD[0], sp)

# ---------------------------------------------------------------- 돌담 + 토담(윗면 = 검은 기와 갓, 벽면 위 2줄 = 흰 토담, 아래 = 화강암 돌담)
FACE_H = 6
def ishi_paint(m, put, sp):
    T = arms(m, 4, 11, 3, 8)
    for y in range(-1, 17):
        for x in range(-1, 17):
            if T(x, y):
                c = KAWARA[2] if x % 2 else KAWARA[1]
                if not T(x, y - 1) or not T(x - 1, y): c = KAWARA[3]
                if (m & (E_ | W_)) and y == 5: c = KAWARA[3]                      # 용마루 빛
                put(x, y, c); continue
            k = next((k for k in range(1, FACE_H + 1) if T(x, y - k)), None)
            if k is not None:
                if k == 1: c = KAWARA[0]
                elif k <= 3: c = PLASTER[2] if x % 8 else PLASTER[1]                # 흰 토담
                else:
                    blk = ((x + (3 if (k % 2) else 0)) // 4) % 3
                    c = GRANITE[3 + (blk % 2)] if (x + (3 if k % 2 else 0)) % 4 else GRANITE[1]
                if k == FACE_H: c = GRANITE[0]
                put(x, y, c)
    if sp in ('gate_h',):
        for y in range(9, 15):
            for x in range(5, 11): put(x, y, WOOD[1] if x in (7, 8) else WOOD[2] if (y in (10, 13)) else WOOD[3])
            put(5, y, IRON[1]); put(10, y, IRON[1])
        for x in range(4, 12): put(x, 8, KAWARA[0])
    if sp in ('gate_v',):
        for y in range(5, 11):
            for x in range(4, 12): put(x, y, WOOD[3] if y in (6, 9) else WOOD[2] if x % 3 else WOOD[1])
        for x in range(3, 13): put(x, 4, KAWARA[3]); put(x, 11, KAWARA[0])
def ishi(m, sp=None): return ext4(m, ishi_paint, GRANITE[0], sp)

def yagura():
    a = np.zeros((32, 32, 4), np.uint8); im = Image.fromarray(a); d = ImageDraw.Draw(im)
    d.polygon([(2, 31), (5, 20), (26, 20), (29, 31)], fill=GRANITE[3])                     # 돌담 밑동(경사)
    d.rectangle([6, 12, 25, 20], fill=PLASTER[2]); d.rectangle([20, 12, 25, 20], fill=PLASTER[1])   # 흰 벽
    d.rectangle([9, 14, 11, 16], fill=DARK); d.rectangle([20, 14, 22, 16], fill=DARK)    # 창
    d.polygon([(3, 12), (8, 6), (23, 6), (28, 12)], fill=KAWARA[2]); d.polygon([(16, 6), (23, 6), (28, 12), (16, 12)], fill=KAWARA[1])   # 아래 지붕
    d.rectangle([10, 3, 21, 6], fill=PLASTER[2]); d.polygon([(7, 4), (11, 0), (20, 0), (24, 4)], fill=KAWARA[3])                       # 위층 + 지붕
    a = np.array(im)
    for y in range(21, 31):
        for x in range(32):
            if a[y, x, 3] and (x + (3 if (y // 2) % 2 else 0)) % 4 == 0: a[y, x] = GRANITE[1]
    for x in range(3, 29): a[12, x] = KAWARA[0] if a[12, x, 3] else a[12, x]
    return outline(a, GRANITE[0])
def nobori(c):
    a = np.zeros((16, 16, 4), np.uint8); P = CLOTH[c]
    for y in range(0, 16): a[y, 5] = WOOD[3]; a[y, 6] = WOOD[1]
    for x in range(6, 12): a[1, x] = WOOD[2]                                               # 윗 가로대
    for y in range(2, 15):
        for x in range(7, 11): a[y, x] = P[3] if x < 9 else P[2]
    for y in range(2, 15, 3): a[y, 7] = P[1]                                               # 깃 고리(장대에 단 고리)
    return outline(a, P[0])

# ---------------------------------------------------------------- 도랑·논 47형
def ditch(m):
    cls = classify(m, F=5); a = GRASS.copy(); g = lambda u, v, c: cls[v, u] if 0 <= u < 16 and 0 <= v < 16 else c
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 1: a[y, x] = DWATER[tuple(WATER[y, x][:3])]
            elif c == 2:
                k = 0
                while y - k - 1 >= 0 and cls[y - k - 1, x] == 2: k += 1
                a[y, x] = EARTH[3] if k == 0 else EARTH[2] if k < 3 else EARTH[1]                # 맞은편(남쪽) 흙 비탈
    res = a.copy()
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 0: continue
            if 0 in (g(x, y - 1, c), g(x - 1, y, c), g(x + 1, y, c)): res[y, x] = EARTH[1] if g(x, y - 1, c) == 0 else EARTH[2]    # 북·동·서 흙 둑 1px
            elif c == 1 and (g(x, y - 1, c) == 0 or g(x, y - 2, c) == 0): res[y, x] = MUD[1]                                          # 둑 그늘 물
            if g(x, y + 1, c) == 0 and c == 2: res[y, x] = EARTH[0]
    return res
def paddy(m):
    cls = classify(m, F=3); a = GRASS.copy(); g = lambda u, v, c: cls[v, u] if 0 <= u < 16 and 0 <= v < 16 else c
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 1:
                a[y, x] = PWATER[tuple(WATER[y, x][:3])]
                if y % 4 == 1 and x % 3 == 1: a[y, x] = RICE[2]; (y + 1 < 16) and a.__setitem__((y + 1, x), RICE[1])   # 모 줄(주기 4x3)
            elif c == 2: a[y, x] = EARTH[3] if cls[y - 1, x] != 2 else EARTH[2]
    res = a.copy()
    for y in range(16):
        for x in range(16):
            c = cls[y, x]
            if c == 1 and (g(x, y - 1, c) == 0 or g(x - 1, y, c) == 0 or g(x + 1, y, c) == 0): res[y, x] = EARTH[3]           # 두렁(흙둑) 윗면
            elif c == 1 and (g(x, y - 2, c) == 0 or g(x - 2, y, c) == 0 or g(x + 2, y, c) == 0): res[y, x] = EARTH[2]
            if c == 0 and g(x, y - 1, 0) == 2: res[y, x] = GRASS_SH
    return res

# ---- 진막(陣幕, ch20 오다 본진, 2026-11-03 팀장 요청): 흰/검은 세로 줄무늬 휘장으로 둘러친 본진 2x2(문양 없음, 불통). 뒤 휘장 + 양옆 + 앞 휘장(높이감), 장대 끝 둥근 꼭지
def jinmaku():
    a = np.zeros((32, 32, 4), np.uint8); Wc, Bc = CLOTH['white'], CLOTH['black']
    def panel(x0, x1, y0, y1, shade=0):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                st = Wc if (x // 3) % 2 == 0 else Bc
                a[y, x] = st[3 - shade] if y < y0 + 2 else st[2 - shade] if y < y1 - 1 else st[1]
            # 위 가장자리 천 끈(가로), 아래 끝 물결
        for x in range(x0, x1 + 1): a[y0, x] = Wc[1]; a[y1 + 1 if y1 + 1 < 32 else y1, x] = Bc[0] if x % 2 else a[y1, x]
    panel(2, 29, 3, 9, 1)                                                                    # 뒤 휘장(그늘 한 단)
    for y in range(9, 19):                                                                   # 양옆 휘장(옆면, 좁게)
        for x in (2, 3, 28, 29): a[y, x] = Wc[2] if (y // 3) % 2 == 0 else Bc[2]
    panel(1, 30, 18, 27)                                                                     # 앞 휘장
    for x in (1, 10, 21, 30):                                                                # 장대 + 둥근 꼭지
        top = 15 if x in (10, 21) else 1
        for y in range(top, 30 if x in (1, 30) else 28): a[y, x] = WOOD[3] if y % 2 else WOOD[2]
        a[top - 1, x] = WOOD[4]
    return outline(a, Bc[0])

# ---------------------------------------------------------------- 목록
SPEC = {k: [] for k in SETS}
for mm in range(16): SPEC['castle'].append((f'ov_mabosaku_{mm}', mabo(mm), 'overlay', 'block'))
SPEC['castle'] += [('ov_mabosaku_gate_h', mabo(E_ | W_, 'h'), 'overlay', 'pass'), ('ov_mabosaku_gate_v', mabo(N_ | S_, 'v'), 'overlay', 'pass')]
for mm in range(16): SPEC['castle'].append((f'ov_ishigaki_{mm}', ishi(mm), 'overlay', 'block'))
SPEC['castle'] += [('ov_ishigaki_gate_h', ishi(E_ | W_, 'gate_h'), 'overlay', 'pass'), ('ov_ishigaki_gate_v', ishi(N_ | S_, 'gate_v'), 'overlay', 'pass')]
SPEC['castle'] += [(n, t, 'overlay', 'block') for n, t in split(yagura(), 'ov_yagura')]
for c in ('white', 'black', 'red', 'blue', 'yellow'): SPEC['castle'].append((f'ov_nobori_{c}', nobori(c), 'overlay', 'block'))
for mm in MASKS: SPEC['ditch'].append((f'ditch47_{mm}', ditch(mm), 'ground', 'map_rule'))
for mm in MASKS: SPEC['paddy'].append((f'paddy47_{mm}', paddy(mm), 'ground', 'map_rule'))
SPEC['jinmaku'] = [(n, t, 'overlay', 'block') for n, t in split(jinmaku(), 'ov_jinmaku')]
FR = {}
for k, lst in SPEC.items():
    assert len(lst) <= 100
    for i, (n, a, kind, walk) in enumerate(lst): FR[SETS[k] + i] = (n, x2(a), kind, walk, k)
BY = {v[0]: v[1] for v in FR.values()}

allowed = {tuple(c[:3]) for c in WOOD + GRANITE + PLASTER + KAWARA + IRON + MUD + EARTH + RICE + sum(CLOTH.values(), []) + [GRASS_SH, RIM, DARK] + list(DWATER.values()) + list(PWATER.values())}
allowed |= set(map(tuple, GRASS.reshape(-1, 4)[:, :3].tolist()))
errs, items = check(FR, allowed)
qa = {'date': '2026-11-03', 'author': '안아트', 'calls': 0, 'sheet': f'public/assets/tiles/tileset_v2/{KEY}.png', 'start': START, 'count': len(FR),
      'sets': {k: [SETS[k], SETS[k] + len(v) - 1] for k, v in SPEC.items()}, 'errors': errs, 'items': items}
qa['seam4'] = {'ov_mabosaku': seam4(BY, 'ov_mabosaku', {'gate_h': E_ | W_, 'gate_v': N_ | S_})[:12], 'ov_ishigaki': seam4(BY, 'ov_ishigaki', {'gate_h': E_ | W_, 'gate_v': N_ | S_})[:12]}
for p, b in qa['seam4'].items():
    if b: qa['errors'].append(f'{p} 이음 {len(b)}')
qa['ditch_shape_seam'] = shape_seam(F=5); qa['paddy_shape_seam'] = shape_seam(F=3)
for k in ('ditch_shape_seam', 'paddy_shape_seam'):
    if qa[k]['jumps_gt_1px']: qa['errors'].append(f'{k} 오류')
sheet = sheet_of(FR, START); qa['sheet_size'] = list(sheet.size); qa['keep_unchanged'] = all(sha_f(p) == h for p, h in before.items())

# ---------------------------------------------------------------- 미리보기: 나가시노 들판(논·도랑 + 마방책 3겹 + 성)
G2 = x2(GRASS)
SC = ['..IIIIGIIII.........', '..I.......I...PPPPP.', '..I.......I...PPPPP.', '..I.......I...PPPPP.', '..IIIIIIIII.........', '....................',
      '~~~~~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~~~~~', '....................', 'MMMMMMMMgMMMMMMMMMMM', '....................', 'MMMMgMMMMMMMMMMgMMMM', '....................']
Hh, Ww = len(SC), len(SC[0]); out = Image.new('RGBA', (Ww * 32, Hh * 32))
for y in range(Hh):
    for x in range(Ww):
        ch = SC[y][x]
        if ch == '~': out.paste(BY[f'ditch47_{mask47(SC, x, y, "~")}'], (x * 32, y * 32))
        elif ch == 'P': out.paste(BY[f'paddy47_{mask47(SC, x, y, "P")}'], (x * 32, y * 32))
        else: out.paste(G2, (x * 32, y * 32))
for y in range(Hh):
    for x in range(Ww):
        ch = SC[y][x]
        if ch in 'IG': mm = mask4(SC, x, y, 'IG'); out.alpha_composite(BY['ov_ishigaki_gate_h' if ch == 'G' else f'ov_ishigaki_{mm}'], (x * 32, y * 32))
        if ch in 'Mg': mm = mask4(SC, x, y, 'Mg'); out.alpha_composite(BY['ov_mabosaku_gate_h' if ch == 'g' else f'ov_mabosaku_{mm}'], (x * 32, y * 32))
for r in range(2):
    for c in range(2): out.alpha_composite(BY[f'ov_yagura_{r}{c}'], ((6 + c) * 32, (2 + r) * 32))
for i, c in enumerate(('white', 'black', 'red', 'blue', 'yellow')): out.alpha_composite(BY[f'ov_nobori_{c}'], ((13 + i) * 32, 12 * 32))
for r in range(2):
    for c in range(2): out.alpha_composite(BY[f'ov_jinmaku_{r}{c}'], ((15 + c) * 32, (8 + r) * 32))
out.convert('RGB').resize((out.width * 2, out.height * 2), Image.NEAREST).save(os.path.join(OUTD, 'preview', 'japan_scene_x2.png'))
json.dump(qa, open(os.path.join(OUTD, 'art_japan_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('count', len(FR), {k: len(v) for k, v in SPEC.items()}, 'errors', qa['errors'][:6], 'seam4', {k: len(v) for k, v in qa['seam4'].items()}, qa['ditch_shape_seam'], qa['paddy_shape_seam'], 'keep', qa['keep_unchanged'])

if APPLY:
    if qa['errors']: raise SystemExit('QA 오류 — apply 중단')
    MAPF = 'docker/gemini/tileset_v2/art_japan/japan_tiles_mapping.json'
    cnt, by = apply(TVP, KEY, START, END, FR, sheet, qa['sets'], TAG, 'art_japan.py', '안아트 art_japan.py(2026-11-03): 일본 전국(마방책·돌담 토담·성문·망루·노보리) + 도랑·해자 47형 + 논 47형. 프레임 = 전역-3400',
                    '16세기 후반 일본 성곽·진지 일반화(마방책 = 말뚝+가로대, 돌담 + 흰 토담·검은 기와). 가문 문장 없음', 'docker/gemini/tileset_v2/art_japan/art_japan_qa.json', MAPF)
    mapping(os.path.join(ROOT, MAPF), f'안아트 2026-11-03 일본 전국 세트 사용 매핑표(ch20 나가시노). 시트 public/assets/tiles/tileset_v2/{KEY}.png, 전역 {START}~{max(FR)}(프레임 = 전역-{START}). 이름 = tv2_names.json names / tileset_v2_map.json index_map_static8_japan',
            qa['sets'], {'ov_mabosaku_<m4>': '마방책 16형(말뚝+가로대 2줄). 불통(W 또는 맵 규칙: 기병 차단·보병 엄폐)', 'ov_mabosaku_gate_h/v': '마방책 틈(출입로). 통행',
                         'ov_ishigaki_<m4>': '돌담 + 흰 토담·검은 기와 갓 16형. 불통(W)', 'ov_ishigaki_gate_h/v': '성문(나무 문짝). 통행(c)', 'ov_yagura_<r><c>': '망루 2x2. 불통',
                         'ov_nobori_*': '노보리 세로 깃발(무지). 불통 소품', 'ditch47_<mask>': '도랑·해자 47형(탁한 물 + 흙 둑). 물(w) 또는 얕은 여울(s) — 맵 규칙. 연자천 개울 등',
                         'paddy47_<mask>': '논 47형(물 댄 논 + 모 줄 + 흙 두렁). 늪(x)·논 지형 이동 비용은 맵 규칙', 'ov_jinmaku_<r><c>': '진막(陣幕) 본진 2x2(흰/검은 세로 줄무늬 휘장, 문양 없음). 불통(W). ch20 오다 본진'}, qa['items'], KEY, START, cnt)
    print('applied', by, cnt)
