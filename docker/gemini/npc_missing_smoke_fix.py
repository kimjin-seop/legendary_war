# npc_cannae_tribune 횃불 연기 제거(호출 없음, 안아트 2026-11-09): 불꽃 위 반투명·보랏빛(마젠타 오염) 연기가 상단 가장자리에 닿음 → 상단 좌측 상자 안에서
# 불꽃색(주황·노랑: R 높고 B 낮음)이 아닌 화소와 반투명 화소를 투명 처리. 사용: python npc_missing_smoke_fix.py <png> <x0> <y0> <x1> <y1>
import sys, numpy as np
from PIL import Image
p, x0, y0, x1, y1 = sys.argv[1], *map(int, sys.argv[2:6])
a = np.asarray(Image.open(p).convert('RGBA')).copy(); r, g, b, al = [a[y0:y1, x0:x1, k].astype(int) for k in range(4)]
flame = (r > 150) & (r - b > 90) & (al > 200)
kill = (al > 0) & ~flame
a[y0:y1, x0:x1, 3][kill] = 0
Image.fromarray(a).save(p, optimize=True); print('removed', int(kill.sum()))
