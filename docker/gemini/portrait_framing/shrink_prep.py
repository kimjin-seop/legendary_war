# 인물이 과하게 큰 초상 축소 재구도 입력 준비(호출 없음, 안아트 2026-11-03, 손권 요청). reframe_prep.py 와 달리 머리 위를 고정점으로 S 배 축소 ->
# 아래·좌우에 빈 마젠타가 생김(모델이 몸통·소매를 이어 그림). 사용: python shrink_prep.py <code> <S> <목표 head_top>
import os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from framing_v2 import measure, PORT
code, S, tgt = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
src = os.path.join(PORT, code + '.png.bak-reframe-20261103') if os.path.exists(os.path.join(PORT, code + '.png.bak-reframe-20261103')) else os.path.join(PORT, code + '.png')
im = Image.open(src).convert('RGBA'); m = measure(im); W, H = im.size
sm = im.resize((round(W * S), round(H * S)), Image.LANCZOS)
x = round(m['head_cx'] * W - m['head_cx'] * W * S + (0.5 - m['head_cx']) * W * 0.5); y = round(tgt * H - m['head_top'] * H * S)
bg = Image.new('RGBA', (W, H), (255, 0, 255, 255)); bg.alpha_composite(sm, (x, y))
bg.convert('RGB').save(os.path.join(HERE, 'reframe', 'in', code + '_shrink.png'))
print(code, 'S', S, 'pos', x, y, 'old head_top', m['head_top'], 'head_w', m['head_w'], 'bottom gap from y', y + sm.height)
