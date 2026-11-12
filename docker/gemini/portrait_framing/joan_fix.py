# 잔 다르크: 깃발만 위로 잘렸고 머리카락 상단은 ~0.131H → 머리 상단 0.07 로 확대(아래 잘림선·얼굴 중심 x 고정). 호출 없음.
import os, sys, json, shutil
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from framing_v2 import transform, measure, save_thumb, PORT, BACK
code = 'joan_of_arc'; cur = os.path.join(PORT, code + '.png'); bk = os.path.join(BACK, code + '.png')
tp = os.path.join(PORT, 'thumb', code + '.webp'); tb = os.path.join(BACK, 'thumb', code + '.webp')
os.makedirs(os.path.dirname(tb), exist_ok=True)
if not os.path.exists(bk): shutil.copy2(cur, bk)
if not os.path.exists(tb): shutil.copy2(tp, tb)
im = Image.open(bk).convert('RGBA'); W, H = im.size
a = np.asarray(im).astype(int)
# 머리카락(짙은 갈색, 채도 낮고 어두움) 첫 행: 얼굴 중심 부근 x 40~62%, 깃발 아래
reg = a[:, int(.40 * W):int(.62 * W)]
hair = (reg[..., 3] > 200) & (reg[..., :3].max(2) < 80) & (np.abs(reg[..., 0] - reg[..., 2]) < 40)
rows = np.flatnonzero(hair.sum(1) > 25); hair_top = rows[rows > 0.05 * H][0] / H
s = (1 - 0.07) / (1 - hair_top); cx = 0.515 * W
new = transform(im, s, cx); new.save(cur, optimize=True, compress_level=9); save_thumb(new, tp)
n = np.asarray(new).astype(int); reg = n[:, int(.40 * W):int(.62 * W)]
hair = (reg[..., 3] > 200) & (reg[..., :3].max(2) < 80) & (np.abs(reg[..., 0] - reg[..., 2]) < 40)
r2 = np.flatnonzero(hair.sum(1) > 25); r2 = r2[r2 > 0.02 * H][0] / H
m = measure(new)
out = {'key': 'portrait.joan_of_arc', 'action': 'fix_up_hair_top', 'scale': round(s, 4), 'hair_top': [round(hair_top, 4), round(r2, 4)],
       'cut_b': m['cut_b'], 'size': list(new.size), 'occ_w_after': m['occ_w']}
json.dump(out, open(os.path.join(HERE, 'joan_fix_log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1); print(out)
