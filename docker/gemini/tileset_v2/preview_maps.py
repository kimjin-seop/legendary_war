# tileset_v2 미리보기: (1) 지형 샘플 맵(코드 격자 -> 47형 마스크 칠하기, tv2 만) (2) river_02 기존 vs tv2(tile_layer + tileset_v2_map, 미매핑은 기존 시트 폴백)
# 사용: python -I preview_maps.py <저장소 루트>
import sys, os, json
from PIL import Image, ImageDraw, ImageFont
ROOT = sys.argv[1]
P = lambda *a: os.path.join(ROOT, *a)
OUT = P('public/assets/tiles/tileset_v2')
font = ImageFont.load_default(size=14)
tv2 = json.load(open(f'{OUT}/tv2_names.json', encoding='utf-8'))
NAMES = tv2['names']; SPEC = tv2['spec']
_M = json.load(open(f'{OUT}/tileset_v2_map.json', encoding='utf-8')); TV2MAP = _M['index_map']; RGMAP = _M['index_map_regrounded']
img = lambda p: Image.open(P(p)).convert('RGBA')
SHEETS = {
    'base': (img('public/assets/third_party/unity_tilemap/TileMap.png'), 10), 'ext': (img('public/assets/tiles/legend_tileset/tileset_ext.png'), 10),
    'ext2': (img('public/assets/tiles/legend_tileset/tileset_ext2.png'), 10), 'ws_static': (img('public/assets/tiles/water_set/ws_static.png'), 10),
    'ws_anim': (img('public/assets/tiles/water_set/ws_anim.png'), 10), 'ws_bov': (img('public/assets/tiles/water_set/ws_building_ov.png'), 10),
    'ws_ov': (img('public/assets/tiles/water_set/ws_overlay.png'), 6), 'land': (img('public/assets/tiles/land_set/ls_static.png'), 16),
    'tv2_static': (img('public/assets/tiles/tileset_v2/tv2_static.png'), 16), 'tv2_anim': (img('public/assets/tiles/tileset_v2/tv2_anim.png'), 16),
}
def src(i, f=0):  # unityTileset.u32Src 와 같은 구간 규칙 + tv2(1000~1699 정적 / 1700~ 애니)
    if i >= 1700: k, fr = 'tv2_anim', (i - 1700) + f * SPEC['anim']['stride']
    elif i >= 1000: k, fr = 'tv2_static', i - 1000
    elif i >= 500: k, fr = 'land', i - 500
    elif i >= 420: k, fr = 'ws_ov', i - 420
    elif i >= 400: k, fr = 'ws_bov', i - 400
    elif i >= 300: k, fr = 'ws_anim', i - 300
    elif i >= 200: k, fr = 'ws_static', i - 200
    elif i >= 110: k, fr = 'ext2', i - 110
    elif i >= 30: k, fr = 'ext', i - 30
    else: k, fr = 'base', i
    sh, cols = SHEETS[k]
    return sh.crop(((fr % cols) * 32, (fr // cols) * 32, (fr % cols) * 32 + 32, (fr // cols) * 32 + 32))

B = {'N': (0, -1, 1), 'NE': (1, -1, 2), 'E': (1, 0, 4), 'SE': (1, 1, 8), 'S': (0, 1, 16), 'SW': (-1, 1, 32), 'W': (-1, 0, 64), 'NW': (-1, -1, 128)}
def red(m):
    for d, a, b in ((2, 1, 4), (8, 16, 4), (32, 16, 64), (128, 1, 64)):
        if not ((m & a) and (m & b)): m &= ~d
    return m

# (1) 지형 샘플 맵: p 풀 f 숲 w 물 s 모래 r 흙길 n 눈 h 둔덕 c 성 바닥 o 자갈 a 밭 b 다리(물 위)
SAMPLE = [
    'ppppppppppppppppppppppppp',
    'pffffpppppwwwwwpppnnnnnpp',
    'pfffffppppwwwwwwppnnnnnnp',
    'pfffpfpppwwwbwwwppnnpnnnp',
    'ppfffppppwwwbwwwpppnnnppp',
    'pppppprrrrrrbrrrrrrrppppp',
    'pphpppr ppwwbwwppppprpppp',
    'phhhppr pppwwwpppaaarpccc',
    'pphhppr ssspwpppaaaaroccc',
    'ppppppr sssspppppaaaroccc',
    'pfpppprrrrrrrrrrrrrrooooo',
    'ppppppppppppppppppppppppp',
]
SAMPLE = [r.replace(' ', 'p') for r in SAMPLE]
FAMC = {'f': 'forest47', 's': 'sand47', 'r': 'dirt47', 'n': 'snow47', 'h': 'hill47', 'c': 'castlefloor47', 'o': 'cobble47', 'a': 'farm47'}
def paint_sample(grid):
    H, W = len(grid), len(grid[0])
    at = lambda x, y: grid[y][x] if 0 <= x < W and 0 <= y < H else None
    im = Image.new('RGBA', (W * 32, H * 32))
    for y in range(H):
        for x in range(W):
            c = at(x, y)
            same = (lambda t: t in ('w', 'b') or t is None) if c in ('w', 'b') else (lambda t, c=c: t == c or t is None)
            m = red(sum(b for dx, dy, b in B.values() if same(at(x + dx, y + dy))))
            if c == 'p': tile = src(NAMES['grass_a']['index'])
            elif c == 'w': tile = src(NAMES[f'water47_{m}']['index'])
            elif c == 'b':
                tile = src(NAMES[f'water47_{m}']['index']).copy()
                horiz = at(x - 1, y) not in ('w', 'b') or at(x + 1, y) not in ('w', 'b')
                pl = src(NAMES['plank_v' if horiz else 'plank_h_b']['index']); tile = pl
            else: tile = src(NAMES[f'{FAMC[c]}_{m}']['index'])
            im.alpha_composite(tile, (x * 32, y * 32))
    return im

s = paint_sample(SAMPLE)
s2 = s.resize((s.width * 2, s.height * 2), Image.NEAREST)
s2.save(f'{OUT}/preview_tv2_sample_x2.png', optimize=True)

# (2) 파일럿 맵: 기존 / tv2 기본 / tv2 + 재바탕(선택). 인자 3번째 = 맵 코드(기본 river_02)
CODE = sys.argv[2] if len(sys.argv) > 2 else 'river_02'
maps = [x for f in ('maps.json', 'maps_imjin10.json', 'maps_pack20_v2.json') for x in json.load(open(P('database/data', f), encoding='utf-8'))['items']]
m = next(x for x in maps if x['code'] == CODE)
tl = m['tile_layer']; rows = [list(map(int, r.split())) for r in tl['rows']]
def render(mode):
    H, W = len(rows), len(rows[0]); im = Image.new('RGBA', (W * 32, H * 32), (0, 0, 0, 255)); fb = 0
    for y in range(H):
        for x in range(W):
            n = tl['names'][rows[y][x]]
            i = TV2MAP.get(n) if mode else None
            if i is None and mode == 2: i = RGMAP.get(n)
            if i is None: i = tl['index_map'][n]; fb += 1 if mode else 0
            t = src(i); r = tl.get('rotations', {}).get(n, 0)
            if r: t = t.rotate(-90 * r)
            im.alpha_composite(t, (x * 32, y * 32))
    for o in tl.get('overlay', []) or []:
        i = tl['index_map'].get(o.get('name'))
        if i is not None: im.alpha_composite(src(i), (o['x'] * 32, o['y'] * 32))
    return im, fb
imgs = [render(k) for k in (0, 1, 2)]
W2 = imgs[0][0].width; G = 16
canvas = Image.new('RGBA', (W2 * 3 + G * 2, imgs[0][0].height + 28), (30, 30, 36, 255))
d = ImageDraw.Draw(canvas)
labels = [f'{CODE}  OLD (current unity32)', f'TV2 default (fallback {imgs[1][1]} cells)', f'TV2 + regrounded (fallback {imgs[2][1]} cells)']
for k, (im, fb) in enumerate(imgs):
    canvas.alpha_composite(im, (k * (W2 + G), 28)); d.text((k * (W2 + G) + 4, 6), labels[k], font=font, fill=(255, 255, 255, 255) if k == 0 else (255, 255, 0, 255))
canvas.save(f'{OUT}/preview_tv2_{CODE}.png', optimize=True)
imgs[2][0].resize((W2 * 2, imgs[2][0].height * 2), Image.NEAREST).save(f'{OUT}/preview_tv2_{CODE}_rg_x2.png', optimize=True)
print('sample', s2.size, CODE, 'fallback default', imgs[1][1], 'regrounded', imgs[2][1], 'of', len(rows) * len(rows[0]))
