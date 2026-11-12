# 위가 잘린 초상 재생성(아웃페인트) 입력 캔버스 준비: _orig_framing 원본(없으면 현재본)을 아래 잘림선·머리 중심 x 고정으로 S 배 축소해
# 마젠타(#FF00FF) 896x1200 캔버스에 합성 → reframe/in/<id>.png. 호출 없음.
import os, sys, shutil
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from framing_v2 import transform, measure, PORT, BACK
S = 0.88
for code in sys.argv[1:]:
    cur = os.path.join(PORT, code + '.png'); bk = os.path.join(BACK, code + '.png')
    if not os.path.exists(bk): shutil.copy2(cur, bk)
    tb = os.path.join(BACK, 'thumb', code + '.webp'); os.makedirs(os.path.dirname(tb), exist_ok=True)
    if not os.path.exists(tb): shutil.copy2(os.path.join(PORT, 'thumb', code + '.webp'), tb)
    im = Image.open(bk).convert('RGBA'); m = measure(im)
    sm = transform(im, S, m['head_cx'] * im.width)
    bg = Image.new('RGBA', im.size, (255, 0, 255, 255)); bg.alpha_composite(sm)
    bg.convert('RGB').save(os.path.join(HERE, 'reframe', 'in', code + '.png'))
    print(code, 'head_cx', m['head_cx'], 'cut line y', round(1 - S, 3))
