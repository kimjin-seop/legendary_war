# 수상 컷신 항적·물보라 스프라이트(fx.cut_wake) 절차 생성: 32x16 프레임 x4 가로 시트(128x16, 투명 PNG) + x3 확대본 + 미리보기.
# 생성 모델 미사용(32x16 은 모델 출력 축소 시 도트가 뭉개짐) — 손도트 규칙을 코드로 찍는다. 팔레트는 bg.battle.sea.* 물색 계열 + 포말 흰색 4단.
# 배가 오른쪽을 향해 갈 때 뱃머리 뒤(왼쪽)로 퍼지는 항적. 왼쪽을 향하면 FE 에서 flipX. 바닥 기준선 = 프레임 아래에서 4px(수면선).
# 실행: python docker/gemini/fx_cut_wake_build.py  (Pillow)
from PIL import Image
import json, os

OUT = 'public/assets/effects/cut'
os.makedirs(f'{OUT}/x3', exist_ok=True)
FW, FH, N = 32, 16, 4
WHITE = (242, 250, 255, 255)
FOAM = (198, 226, 238, 255)
FOAM_D = (140, 190, 212, 255)
WATER_L = (96, 158, 190, 200)   # 반투명 밝은 물(수면 위 얹힘)
WATER_D = (58, 116, 152, 150)
WL = 11  # 수면선 y

def frame(t):
    im = Image.new('RGBA', (FW, FH), (0, 0, 0, 0)); p = im.load()
    def put(x, y, c):
        if 0 <= x < FW and 0 <= y < FH: p[x, y] = c
    # 1) 항적 띠: 뱃머리(오른쪽) 쪽 두께 3 → 왼쪽 끝 1 로 가늘어짐. 위 = 흰 포말, 가운데 = 밝은 포말, 아래 = 반투명 물그늘. 틈(끊김)이 프레임마다 2px 왼쪽으로 흐름
    for x in range(0, 25):
        th = 1 + (x >= 9) + (x >= 17)
        gap = (x + t * 2) % 7 == 0 and x < 20
        top = WL - th + 1
        for dy in range(th):
            c = WHITE if dy == 0 and x >= 12 else FOAM if dy < th - 1 or x < 9 else FOAM_D
            if not gap: put(x, top + dy, c)
        put(x, WL + 1, WATER_D)
    # 2) 아래로 퍼지는 갈래(점선 포말, 흐름)
    for x in range(2, 22):
        y = WL + 2 + (22 - x) // 8
        if (x + t * 2) % 5 < 2: put(x, y, FOAM_D)
    # 3) 뱃머리 물보라: 프레임별 높이(낮음→높음→최고·흩어짐→가라앉음) 왕관 모양 덩어리
    h = [3, 5, 6, 4][t]
    for x in range(23, 32):
        dist = abs(x - 28)
        col_h = max(0, h - dist)
        for k in range(col_h):
            y = WL - k
            put(x, y, WHITE if k >= col_h - 2 else FOAM)
        put(x, WL + 1, FOAM_D)
    # 그늘(왼쪽 아래 면, 광원 왼쪽 위와 반대인 오른쪽 아래)
    for k in range(max(0, h - 2)):
        put(29 + (k > 1), WL - k, FOAM_D)
    drops = {0: [(26, WL - 4)], 1: [(25, WL - 6), (31, WL - 5)], 2: [(24, WL - 8), (30, WL - 8), (22, WL - 5), (27, WL - 9)], 3: [(21, WL - 3), (31, WL - 4), (23, WL - 6)]}[t]
    for (x, y) in drops: put(x, y, WHITE)
    return im

sheet = Image.new('RGBA', (FW * N, FH), (0, 0, 0, 0))
for t in range(N): sheet.paste(frame(t), (t * FW, 0))
sheet.save(f'{OUT}/cut_wake.png', optimize=True)
sheet.resize((FW * N * 3, FH * 3), Image.NEAREST).save(f'{OUT}/x3/cut_wake.png', optimize=True)
# 미리보기: 바다 배경색 위 x8
bg = Image.new('RGBA', (FW * N * 8 + 40, FH * 8 + 20), (44, 104, 147, 255))
bg.alpha_composite(sheet.resize((FW * N * 8, FH * 8), Image.NEAREST), (20, 10))
bg.convert('RGB').save(f'{OUT}/preview_cut_wake.png')
print(json.dumps({'sheet': f'{OUT}/cut_wake.png', 'size': sheet.size, 'bytes': os.path.getsize(f'{OUT}/cut_wake.png')}))
