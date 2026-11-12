# 적 부장 NPC 초상 점검 시트(호출 없음, 안아트 2026-11-02).
# 사용: python -X utf8 portrait_npc_enemy_sheet.py raw <out.jpg> code ...   → raw jpg 5열 시트(라벨)
#       python -X utf8 portrait_npc_enemy_sheet.py out <out_prefix> code ... → out png 밝은/어두운 배경 시트 + 측정(머리 상단·잘림·내부 반투명·마젠타)
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, 'portrait_framing'))
from framing_v2 import measure
G = os.path.join(HERE, 'portrait_campaign')
mode, dst, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
cw, ch, cols = 300, 402, 5
rows = (len(ids) + cols - 1) // cols
def sheet(get, bgc, path):
    s = Image.new('RGB', (cols * cw, rows * (ch + 18)), bgc); d = ImageDraw.Draw(s)
    for k, c in enumerate(ids):
        X, Y = (k % cols) * cw, (k // cols) * (ch + 18)
        s.paste(get(c, bgc), (X, Y + 18)); d.text((X + 3, Y + 3), c.replace('npc_', ''), fill=(255, 255, 255) if sum(bgc) < 300 else (0, 0, 0))
    s.save(path, quality=88)
if mode == 'raw':
    sheet(lambda c, b: Image.open(os.path.join(G, 'raw', f'portrait_{c}.jpg')).convert('RGB').resize((cw, ch), Image.LANCZOS), (0, 0, 0), dst)
else:
    def comp(c, b):
        im = Image.open(os.path.join(G, 'out', f'{c}.png')).convert('RGBA').resize((cw, ch), Image.LANCZOS)
        bg = Image.new('RGBA', im.size, b + (255,)); bg.alpha_composite(im); return bg.convert('RGB')
    sheet(comp, (40, 40, 46), dst + '_dark.jpg'); sheet(comp, (225, 215, 195), dst + '_light.jpg')
    for c in ids:
        im = Image.open(os.path.join(G, 'out', f'{c}.png')).convert('RGBA'); m = measure(im); A = im.getchannel('A'); a = np.asarray(A)
        er = np.asarray(A.point(lambda v: 255 if v > 0 else 0).filter(ImageFilter.MinFilter(13))) > 0
        r = np.asarray(im).astype(int); mg = int(((r[..., 0] > 200) & (r[..., 2] > 200) & (r[..., 1] < 80) & (a > 200)).sum())
        print('%-30s ht %.3f bbox_top %.3f cut l%d r%d t%d interior_partial %d magenta %d' % (c, m['head_top'], m['bbox_top'], m['cut_l'], m['cut_r'], m['cut_t'], int(((a < 250) & er).sum()), mg))
