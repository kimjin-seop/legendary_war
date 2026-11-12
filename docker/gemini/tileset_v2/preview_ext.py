# bake_ext.py 결과 미리보기(안아트 2026-11-02). 맵디자이너 tmv2.py 를 읽기 전용으로 import 해 같은 칠하기 규칙으로 렌더(파일은 쓰지 않음).
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/preview_ext.py <루트>
# 출력: public/assets/tiles/tileset_v2/preview_tv2_ext_<code>.png (왼쪽 현재 tmv2 규칙 / 오른쪽 확장 타일 적용, 32px 1배)
#       preview_tv2_ext_tiles_x2.png (여울·모래 물가·암초·오브젝트 샘플, 2배), preview_tv2_ext_okpo_anim.gif (4프레임)
import sys, os, json, copy, importlib.util
from PIL import Image, ImageDraw

ROOT = sys.argv[1]
sys.dont_write_bytecode = True   # 맵디자이너 폴더에 __pycache__ 를 쓰지 않음
OUT = os.path.join(ROOT, 'public/assets/tiles/tileset_v2')
sys.argv = [sys.argv[0], ROOT]
spec = importlib.util.spec_from_file_location('tmv2', os.path.join(ROOT, 'docker/maps/tilemap_v2/tmv2.py'))
tm = importlib.util.module_from_spec(spec); spec.loader.exec_module(tm)
NAMES = json.load(open(os.path.join(OUT, 'tv2_names.json'), encoding='utf-8'))
MAP = json.load(open(os.path.join(OUT, 'tileset_v2_map.json'), encoding='utf-8'))
TV2N, EXT, CHIP = NAMES['names'], MAP['index_map_ext'], MAP['chip_index']
STRIDE2 = NAMES['spec']['anim2']['stride']
A2 = Image.open(os.path.join(OUT, 'tv2_anim2.png')).convert('RGBA')
ST = Image.open(os.path.join(OUT, 'tv2_static.png')).convert('RGBA')

def src(i, f=0):
    if i >= 1800:
        fr = (i - 1800) + f * STRIDE2; return A2.crop((fr % 16 * 32, fr // 16 * 32, fr % 16 * 32 + 32, fr // 16 * 32 + 32))
    if 1619 <= i < 1700:
        fr = i - 1000; return ST.crop((fr % 16 * 32, fr // 16 * 32, fr % 16 * 32 + 32, fr // 16 * 32 + 32))
    return tm.src(i, f)

def names_for(code, ext):
    d = tm.load_design(code); doc, item = tm.load_item(d); tiles = item['tiles']; old = tm.prev_v1(d, item)
    fam, join = dict(tm.FAMILY), copy.deepcopy(tm.JOIN)
    if ext:   # 맵디자이너 적용안(문서 TILESET_V2_SPEC 9절): 여울 1줄 + 모래 물가 2줄
        tm.FAMILY['Y'] = 'ford47'
        tm.JOIN['W'] = tm.JOIN['W'] - {'S'}; tm.JOIN['S'] = tm.JOIN['S'] | {'Z'}
    pg = tm.paint_grid(d, tiles); gn = tm.ground_names(d, tiles, pg, old)
    tm.FAMILY.clear(); tm.FAMILY.update(fam); tm.JOIN.clear(); tm.JOIN.update(join)
    H, W = len(tiles), len(tiles[0])
    if ext:
        for y in range(H):
            for x in range(W):
                n = gn[y][x]
                if pg[y][x] == 'W' and n.startswith('water47_') and any(0 <= x + dx < W and 0 <= y + dy < H and pg[y + dy][x + dx] == 'S' for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                    gn[y][x] = 'sand' + n   # sandwater47_<m>
    return d, old, gn

def index_of(n, old, ext):
    if ext and n in EXT: return EXT[n]
    if n in TV2N: return TV2N[n]['index']
    return tm.engine_index(n, old['index_map'])

def render(code, ext, f=0):
    d, old, gn = names_for(code, ext)
    H, W = len(gn), len(gn[0]); im = Image.new('RGBA', (W * 32, H * 32), (0, 0, 0, 255))
    for y in range(H):
        for x in range(W):
            im.alpha_composite(src(index_of(gn[y][x], old, ext), f), (x * 32, y * 32))
    for o in d.get('objects', []):
        for dy, row in enumerate(o['tiles']):
            for dx, key in enumerate(row):
                if key is None: continue
                t = src(CHIP[key]) if ext else tm.chip_tile(key)
                im.alpha_composite(t, ((o['x'] + dx) * 32, (o['y'] + dy) * 32))
    return im, gn

stats = {}
for code in ('river_02', 'im_01_okpo'):
    a, _ = render(code, False); b, gn = render(code, True)
    c = Image.new('RGBA', (a.width * 2 + 16, a.height + 20), (24, 24, 28, 255)); c.paste(a, (0, 20)); c.paste(b, (a.width + 16, 20))
    dr = ImageDraw.Draw(c); dr.text((4, 4), f'{code}  current tmv2 rules', fill=(255, 255, 255)); dr.text((a.width + 20, 4), 'tv2 ext: ford47 / sandwater47 / tv2reef / obj (preview_ext.py)', fill=(255, 255, 255))
    c.save(os.path.join(OUT, f'preview_tv2_ext_{code}.png'), optimize=True)
    stats[code] = {k: sum(n.startswith(k) for r in gn for n in r) for k in ('ford47', 'sandwater47', 'reef_')}
fr = [render('im_01_okpo', True, f)[0].crop((7 * 32, 3 * 32, 21 * 32, 17 * 32)).resize((14 * 64, 14 * 64), Image.NEAREST).convert('P', palette=Image.ADAPTIVE) for f in range(4)]
fr[0].save(os.path.join(OUT, 'preview_tv2_ext_okpo_anim.gif'), save_all=True, append_images=fr[1:], duration=250, loop=0)

# 샘플: 풀밭 위 여울 띠가 강을 가로지르고, 모래 해변 + 모래 물가 + 암초, 오브젝트 7종
P = ['gggggggggggggggg', 'ggSSSSWWWWWWWggg', 'gSSSSWWWWZWWWWgg', 'gSSSWWWZZZWWWWgg', 'gSSSSWWWZWWWWWgg', 'ggggYYYYYYYYYggg', 'gggYYYYYYYYYYYgg',
     'ggggWWWWWWWWWWgg', 'gggWWWWWWWWWWWgg', 'gggggWWWWWWWgggg', 'gggggggggggggggg']
H, W = len(P), len(P[0])
JOIN = {'W': set('WYZ'), 'Y': set('YWZ'), 'S': set('SWZ'), 'Z': set('ZW')}
def m_at(x, y):
    c = P[y][x]; j = JOIN.get(c, {c}); s = lambda xx, yy: not (0 <= xx < W and 0 <= yy < H) or P[yy][xx] in j
    return tm.red(sum(b for _, dx, dy, b in tm.DIR8 if s(x + dx, y + dy)))
im = Image.new('RGBA', (W * 32, H * 32))
for y in range(H):
    for x in range(W):
        c = P[y][x]; m = m_at(x, y)
        if c == 'g': n = 'grass_a'
        elif c == 'S': n = f'sand47_{m}'
        elif c == 'Y': n = f'ford47_{m}'
        elif c == 'Z': n = 'tv2reef_' + 'abcd'[(x + y) % 4]
        else:
            near_s = any(0 <= x + dx < W and 0 <= y + dy < H and P[y + dy][x + dx] == 'S' for dx in (-1, 0, 1) for dy in (-1, 0, 1))
            if near_s:
                jj = set('WYZ'); s = lambda xx, yy: not (0 <= xx < W and 0 <= yy < H) or P[yy][xx] in jj
                n = 'sandwater47_%d' % tm.red(sum(b for _, dx, dy, b in tm.DIR8 if s(x + dx, y + dy)))
            else: n = f'water47_{m}'
        im.alpha_composite(src(TV2N[n]['index']), (x * 32, y * 32))
objs = [('C:87', 1, 9), ('D:318', 3, 9), ('D:440', 5, 10), ('D:349', 12, 9), ('D:177', 13, 10), ('D:202', 14, 9), ('D:203', 15, 10)]
for k, x, y in objs: im.alpha_composite(src(CHIP[k]), (x * 32, y * 32))
im.resize((W * 64, H * 64), Image.NEAREST).save(os.path.join(OUT, 'preview_tv2_ext_tiles_x2.png'), optimize=True)
print(json.dumps(stats))
