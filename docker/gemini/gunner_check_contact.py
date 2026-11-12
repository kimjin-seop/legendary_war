# 총병 시트 접촉 시트(읽기 전용 점검용). 게시본(public) 시트를 3배 확대·라벨링해 영웅별 1장씩 출력.
import json, sys, os, hashlib
from PIL import Image, ImageDraw, ImageFont, ImageOps
ROOT = sys.argv[1]
OUT = os.path.join(ROOT, 'docker/gemini/gunner_check_20261109')
m = json.load(open(os.path.join(ROOT, 'public/assets/manifest.json'), encoding='utf-8'))
items = {v.get('key'): v for v in m['items']}
hm = json.load(open(os.path.join(ROOT, 'public/assets/sprites/hero_sprite_map_v4.json'), encoding='utf-8'))['heroes']
codes = 'tipu_sultan qi_jiguang suvorov wellington mehmed_ii leonardo_da_vinci gustavus_adolphus frederick_great oda_nobunaga date_masamune sakamoto_ryoma suleiman_i napoleon kutuzov kim_si_min npc_shimazu_yoshihiro'.split()
targets = []
for c in codes:
    base = hm.get(c) or ('unit.npc.npc_jp_shimazu_yoshihiro' if c == 'npc_shimazu_yoshihiro' else None)
    targets.append((c, base))
targets.append(('japan_gunner', 'unit.japan.gunner'))
try:
    font = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 18)
except Exception:
    font = ImageFont.load_default()
S = 3
def checker(w, h):
    bg = Image.new('RGBA', (w, h), (120, 130, 120, 255))
    d = ImageDraw.Draw(bg)
    for y in range(0, h, 24):
        for x in range(0, w, 24):
            if (x // 24 + y // 24) % 2: d.rectangle([x, y, x + 23, y + 23], fill=(150, 160, 150, 255))
    return bg
report = {}
rows = ['down', 'left', 'right', 'up']; cols = ['walk1', 'idle', 'walk2']
for code, base in targets:
    sheets = []
    info = {'base': base}
    for side in ('ally', 'enemy'):
        k = f'{base}.{side}.64.sheet'
        v = items.get(k)
        if not v: info[side] = 'MISSING'; continue
        p = os.path.join(ROOT, 'public', v['path'])
        im = Image.open(p).convert('RGBA')
        info[side] = {'path': v['path'], 'size': im.size, 'md5': hashlib.md5(open(p, 'rb').read()).hexdigest()[:10]}
        # 좌/우 행 반전 관계(같은 칸 mirror 차이, 0=완전 거울상)
        L = im.crop((0, 64, 192, 128)); R = im.crop((0, 128, 192, 192))
        diffs = []
        for ci in range(3):
            a = L.crop((ci * 64, 0, ci * 64 + 64, 64)); b = ImageOps.mirror(R.crop((ci * 64, 0, ci * 64 + 64, 64)))
            da = list(a.getchannel('A').getdata()); db = list(b.getchannel('A').getdata())
            diffs.append(sum(1 for x, y in zip(da, db) if (x > 127) != (y > 127)))
        info[side]['lr_mirror_alpha_diff_px'] = diffs
        # 칸별 불투명 픽셀 수·bbox 높이
        cells = {}
        for ri, r in enumerate(rows):
            for ci, cn in enumerate(cols):
                c = im.crop((ci * 64, ri * 64, ci * 64 + 64, ri * 64 + 64))
                bb = c.getchannel('A').point(lambda t: 255 if t > 127 else 0).getbbox()
                cells[f'{r}.{cn}'] = bb
        info[side]['bbox'] = cells
        sheets.append((side, im))
    report[code] = info
    if not sheets: continue
    W = 60 + len(sheets) * (192 * S + 30); H = 40 + 256 * S + 10
    canvas = Image.new('RGBA', (W, H), (40, 40, 44, 255))
    d = ImageDraw.Draw(canvas)
    for i, (side, im) in enumerate(sheets):
        x0 = 60 + i * (192 * S + 30)
        bg = checker(192 * S, 256 * S)
        bg.alpha_composite(im.resize((192 * S, 256 * S), Image.NEAREST))
        canvas.paste(bg, (x0, 40))
        dd = ImageDraw.Draw(canvas)
        for gx in range(1, 3): dd.line([x0 + gx * 64 * S, 40, x0 + gx * 64 * S, 40 + 256 * S], fill=(255, 255, 0, 255))
        for gy in range(1, 4): dd.line([x0, 40 + gy * 64 * S, x0 + 192 * S, 40 + gy * 64 * S], fill=(255, 255, 0, 255))
        d.text((x0, 10), f'{code} [{side}] {base}', fill=(255, 255, 255, 255), font=font)
    for ri, r in enumerate(rows):
        d.text((4, 40 + ri * 64 * S + 80), r, fill=(255, 220, 120, 255), font=font)
    canvas.convert('RGB').save(os.path.join(OUT, f'{code}_contact.png'))
json.dump(report, open(os.path.join(OUT, 'check_data.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
for c, i in report.items():
    print(c, i['base'], *[(s, i[s]['path'] if isinstance(i[s], dict) else i[s], i[s].get('lr_mirror_alpha_diff_px') if isinstance(i[s], dict) else '') for s in ('ally', 'enemy')])
