"""water_set 미리보기: 사용자 원본 10맵(maps_imjin10_user_source.md)을 타일 직배치로 칠해 이음새·가독성 점검.
이웃 판정은 이 미리보기(오프라인 칠하기 예시)에서만 쓴다 — 게임 FE 는 tile_layer 에 칠해진 인덱스를 그대로 놓는다(가이드 방식).
출력: public/assets/tiles/water_set/preview_map_XX.png (1배, 768x640) + preview_maps_contact.png, paint_reference.json(맵별 칠한 타일 이름 행)
"""
import sys, json, re
sys.path.insert(0, '/s/deps')
import numpy as np
from PIL import Image

OUT = 'public/assets/tiles/water_set'; T = 32
spec = json.load(open(f'{OUT}/ws_spec.json', encoding='utf-8'))
st = np.array(Image.open(f'{OUT}/ws_static.png').convert('RGBA'))
an = np.array(Image.open(f'{OUT}/ws_anim.png').convert('RGBA'))
ov = np.array(Image.open(f'{OUT}/ws_overlay.png').convert('RGBA'))
bov = np.array(Image.open(f'{OUT}/ws_building_ov.png').convert('RGBA'))
BOVN = list(spec['sheets']['building_overlay']['frames'].keys())
src = np.array(Image.open('public/assets/third_party/unity_tilemap/TileMap.png').convert('RGBA'))
ext2 = np.array(Image.open('public/assets/tiles/legend_tileset/tileset_ext2.png').convert('RGBA'))
ext1 = np.array(Image.open('public/assets/tiles/legend_tileset/tileset_ext.png').convert('RGBA'))
SN = [t['name'] for t in spec['static_tiles']]; AN = [t['name'] for t in spec['anim_tiles']]
RPF = spec['sheets']['anim']['rows_per_frame']
E2 = {t['name']: t['index'] for t in json.load(open('public/assets/tiles/legend_tileset/tileset_ext2_spec.json', encoding='utf-8'))['tiles']}
E1 = {t['name']: t['index'] for t in json.load(open('public/assets/tiles/legend_tileset/tileset_ext_spec.json', encoding='utf-8'))['ext_tiles']}

def cut(sheet, i, cols=10, row0=0):
    r, c = divmod(i, cols); r += row0
    return sheet[r * T:r * T + T, c * T:c * T + T]
def tile(name, f=0):
    if name in SN: return cut(st, SN.index(name))
    if name in AN: return cut(an, AN.index(name), row0=f * RPF)
    if name.startswith('u'): return cut(src, int(name[1:]))
    if name in E2: return cut(ext2, E2[name] - 110)
    if name in E1: return cut(ext1, E1[name] - 30)
    raise KeyError(name)

md = open('database/data/maps_imjin10_user_source.md', encoding='utf-8').read()
maps = re.findall(r'### (\d\d)\. ([^\n]+)\n[^\n]*\n\n```text\n(.*?)```', md, re.S)
WATER = set('~R')
def h01(x, y, s=0):
    v = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791); v = (v * 2654435761) & 0xffffffff; return (v >> 8) / 16777216

def paint(rows, seoga):
    H, W = len(rows), len(rows[0])
    at = lambda x, y: rows[y][x] if 0 <= x < W and 0 <= y < H else None
    def base_of(x, y):  # A/E/O 는 4방향 최빈 지형으로 대체
        from collections import Counter
        c = Counter(ch for ch in (at(x, y - 1), at(x - 1, y), at(x + 1, y), at(x, y + 1)) if ch and ch not in 'AEO')
        return c.most_common(1)[0][0] if c else '.'
    grid = [[(base_of(x, y) if rows[y][x] in 'AEO' else rows[y][x]) for x in range(W)] for y in range(H)]
    g = lambda x, y: grid[y][x] if 0 <= x < W and 0 <= y < H else None
    names, overs = [], []
    for y in range(H):
        line = []
        for x in range(W):
            ch = g(x, y); n = None
            if rows[y][x] == 'O': overs.append((x, y, 'objective'))
            if ch == '~':
                land = {d: (g(x + dx, y + dy) not in WATER and g(x + dx, y + dy) is not None) for d, (dx, dy) in dict(N=(0, -1), E=(1, 0), S=(0, 1), W=(-1, 0)).items()}
                diag = {d: (g(x + dx, y + dy) not in WATER and g(x + dx, y + dy) is not None) for d, (dx, dy) in dict(NW=(-1, -1), NE=(1, -1), SE=(1, 1), SW=(-1, 1)).items()}
                neigh = [g(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
                kind_land = 'grass' if any(c in ('L', 'F', '.', 'H') for c in neigh if c) and not any(c in ('S', 'P') for c in neigh if c) else 'sand'
                s = [d for d in 'NESW' if land[d]]
                k = None
                if len(s) == 1: k = s[0]
                elif len(s) == 2:
                    k = 'NS' if set(s) == {'N', 'S'} else 'EW' if set(s) == {'E', 'W'} else {frozenset('NW'): 'NW', frozenset('NE'): 'NE', frozenset('SE'): 'SE', frozenset('SW'): 'SW'}[frozenset(s)] + '_inner'
                elif len(s) == 3: k = 'U_' + [d for d in 'NESW' if d not in s][0]
                elif len(s) == 4: k = 'pond'
                else:
                    dd = [d for d in ('NW', 'NE', 'SE', 'SW') if diag[d]]
                    if dd: k = dd[0] + '_outer'
                n = f'{kind_land}_sea_{k}' if k else ('sea_b' if h01(x, y) < 0.16 else 'sea_a')
            elif ch == 'R': n = ('rift_plank_a' if h01(x, y, 2) < 0.5 else 'rift_plank_b') if seoga else ('reef_d' if sum(g(x + a, y + b) == 'R' for a, b in ((0, -1), (1, 0), (0, 1), (-1, 0))) >= 2 else ['reef_a', 'reef_b', 'reef_c'][int(h01(x, y, 3) * 3)])
            elif ch == 'X':
                fl = {d: g(x + dx, y + dy) not in ('X', None, 'R') for d, (dx, dy) in dict(N=(0, -1), E=(1, 0), S=(0, 1), W=(-1, 0)).items()}
                dg = {d: g(x + dx, y + dy) not in ('X', None, 'R') for d, (dx, dy) in dict(NW=(-1, -1), NE=(1, -1), SE=(1, 1), SW=(-1, 1)).items()}
                s = [d for d in 'NESW' if fl[d]]
                if len(s) == 1: n = 'void_edge_' + s[0]
                elif len(s) == 2 and set(s) not in ({'N', 'S'}, {'E', 'W'}): n = 'void_edge_' + {frozenset('NW'): 'NW', frozenset('NE'): 'NE', frozenset('SE'): 'SE', frozenset('SW'): 'SW'}[frozenset(s)] + '_inner'
                elif len(s) == 2: n = 'void_edge_' + ('NS' if set(s) == {'N', 'S'} else 'EW')
                elif len(s) == 3: n = 'void_edge_U_' + [d for d in 'NESW' if d not in s][0]
                elif len(s) == 4: n = 'void_edge_pond'
                else:
                    dd = [d for d in ('NW', 'NE', 'SE', 'SW') if dg[d]]
                    n = ('void_edge_' + dd[0] + '_outer') if dd else ('void_b' if h01(x, y) < 0.3 else 'void_a')
            elif ch == 'L': n = 'u3' if h01(x, y, 5) > 0.02 else 'u4'
            elif ch == '.': n = ('seoga_floor_b' if h01(x, y) < 0.05 else 'seoga_floor_a') if seoga else ('plain_a' if h01(x, y, 6) < 0.15 else 'plain_b' if h01(x, y, 6) < 0.25 else 'u3')
            elif ch == 'S':
                gs = [d for d, (dx, dy) in dict(N=(0, -1), E=(1, 0), S=(0, 1), W=(-1, 0)).items() if g(x + dx, y + dy) in ('L', 'F', '.')]
                n = f'grass_sand_{gs[0]}' if len(gs) == 1 else ('grass_sand_' + ''.join(sorted(gs, key='NESW'.index)) .replace('NW', 'NW').replace('NE', 'NE') + '_inner' if len(gs) == 2 and set(gs) not in ({'N', 'S'}, {'E', 'W'}) else 'u2')
                if n.endswith('_inner'):
                    pair = frozenset(gs); n = 'grass_sand_' + {frozenset('NW'): 'NW', frozenset('NE'): 'NE', frozenset('SE'): 'SE', frozenset('SW'): 'SW'}[pair] + '_inner'
            elif ch == 'F': n = 'u7'
            elif ch == 'H': n = (['seoga_hill_a', 'seoga_hill_b'][int(h01(x, y, 7) * 2)]) if seoga else ['hill_a', 'hill_b', 'hill_c'][int(h01(x, y, 7) * 3)]
            elif ch == 'W': n = 'u1'
            elif ch == 'P':
                sea_side = [d for d, (dx, dy) in dict(N=(0, -1), E=(1, 0), S=(0, 1), W=(-1, 0)).items() if g(x + dx, y + dy) in ('~',)]
                n = 'quay_' + sea_side[0] if sea_side else ['harbor_a', 'harbor_b', 'harbor_c'][int(h01(x, y, 8) * 3)]
            elif ch == 'T':
                n = 'tower_b' if seoga else 'tower_a'
                if sum(g(x + a, y + b) in ('C', 'G', 'B', 'T') for a in (-1, 0, 1) for b in (-1, 0, 1)) >= 9: overs.append((x, y, 'ov:tower_a')); n = 'castle_pave_a'
            elif ch in 'CG':
                isw = lambda xx, yy: g(xx, yy) in ('C', 'G') or (g(xx, yy) in ('B', 'T') and sum(g(xx + a, yy + b) in ('C', 'G', 'B', 'T') for a in (-1, 0, 1) for b in (-1, 0, 1)) >= 9)
                n4 = [isw(x, y - 1), isw(x + 1, y), isw(x, y + 1), isw(x - 1, y)]
                inr = lambda xx, yy: g(xx, yy) in ('C', 'G', 'B', 'T')  # 성 안 건물·탑은 성 구역으로 간주
                if all(inr(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)): n = 'castle_pave_a' if h01(x, y) < 0.8 else 'castle_pave_b'
                elif ch == 'G':
                    l, r = g(x - 1, y) == 'G', g(x + 1, y) == 'G'
                    n = 'gate_C' if l and r else 'gate_R' if l else 'gate_L' if r else 'gate_S'
                else:
                    north = not any(g(x, yy) in ('C', 'G') for yy in range(0, y)); west = not any(g(xx, y) in ('C', 'G') for xx in range(0, x))
                    N_, E_, S_, W_ = n4
                    if E_ and S_ and not N_ and not W_: n = 'wall_NW'
                    elif W_ and S_ and not N_ and not E_: n = 'wall_NE'
                    elif E_ and N_ and not S_ and not W_: n = 'wall_SW'
                    elif W_ and N_ and not S_ and not E_: n = 'wall_SE'
                    elif (E_ or W_) and not (N_ and S_): n = 'wall_h_N' if north else 'wall_h_S'
                    elif N_ or S_: n = 'wall_v_W' if west else 'wall_v_E'
                    else: n = 'wall_h_S'
            elif ch == 'B':
                isb = lambda xx, yy: g(xx, yy) == 'B'
                l, r = isb(x - 1, y), isb(x + 1, y); col = 'C' if l and r else 'R' if l else 'L' if r else 'S'
                up = 0; yy = y - 1
                while isb(x, yy): up += 1; yy -= 1
                dn = 0; yy = y + 1
                while isb(x, yy): dn += 1; yy += 1
                hgt = up + dn + 1
                if col == 'S' and hgt == 1: n = 'hanok_small'
                else:
                    col = 'C' if col == 'S' else col
                    part = 'facade' if dn == 0 else ('full' if hgt == 2 else 'ridge' if up == 0 else 'eave' if dn == 1 else 'mid')
                    n = f'hanok_{part}_{col}'
                if any(g(x + a, y + b) == 'C' for a in (-1, 0, 1) for b in (-1, 0, 1)) and not any(g(x + a, y + b) in ('L', '.', 'F') for a in (-2, -1, 0, 1, 2) for b in (-2, -1, 0, 1, 2)):
                    overs.append((x, y, 'bov:' + n)); n = 'castle_pave_a'
            else: n = 'u3'
            line.append(n)
        names.append(line)
    return names, overs

def render(names, overs, f=0):
    H, W = len(names), len(names[0]); img = np.zeros((H * T, W * T, 4), np.uint8)
    for y in range(H):
        for x in range(W):
            img[y * T:y * T + T, x * T:x * T + T] = tile(names[y][x], f)
    for (x, y, k) in overs:
        if k.startswith('bov:'): o = cut(bov, BOVN.index(k[4:])).astype(float)
        elif k == 'ov:tower_a': o = ov[:, 4 * T:5 * T].astype(float)
        else: o = ov[:, f * T:f * T + T].astype(float)
        a = o[..., 3:4] / 255
        reg = img[y * T:y * T + T, x * T:x * T + T].astype(float); img[y * T:y * T + T, x * T:x * T + T] = (o * a + reg * (1 - a)).astype(np.uint8)
    return img

ref = {}
thumbs = []
for no, title, body in maps:
    rows = [r for r in body.strip('\n').split('\n')]
    assert len(rows) == 20 and all(len(r) == 24 for r in rows), (no, len(rows))
    seoga = 'X' in body
    names, overs = paint(rows, seoga)
    ref[no] = {'title': title.strip(), 'tiles': [' '.join(l) for l in names], 'overlay': [{'x': x, 'y': y, 'name': k} for x, y, k in overs]}
    im = render(names, overs, 0)
    Image.fromarray(im).save(f'{OUT}/preview_map_{no}.png', optimize=True)
    thumbs.append(Image.fromarray(im).resize((384, 320), Image.NEAREST))
cs = Image.new('RGBA', (384 * 5, 320 * 2))
for i, t in enumerate(thumbs): cs.paste(t, ((i % 5) * 384, (i // 5) * 320))
cs.save(f'{OUT}/preview_maps_contact.png', optimize=True)
# 애니 확인용: 01 옥포 일부 4프레임 GIF(정수 2배)
no, title, body = maps[0]; rows = body.strip('\n').split('\n'); names, overs = paint(rows, False)
frames = [Image.fromarray(render(names, overs, f)[4 * T:12 * T, 2 * T:12 * T]).resize((640, 512), Image.NEAREST) for f in range(4)]
frames[0].save(f'{OUT}/preview_anim_okpo.gif', save_all=True, append_images=frames[1:], duration=250, loop=0)
json.dump({'_note': '미리보기용 오프라인 칠하기 결과(타일 이름). tile_layer 작성 시 참고 — 원본 지형 배치 그대로, A/E 는 주변 지형으로 대체, O 는 overlay', 'maps': ref},
          open(f'{OUT}/paint_reference.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('maps', len(maps))
