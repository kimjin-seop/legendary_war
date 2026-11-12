# [안아트 2026-11-06] 통그림 맵 파일럿 판독성 합성 + 칸 일치율(간이 색 분류) 점검
import json, sys
from PIL import Image, ImageDraw, ImageStat
import colorsys
DIR = r'<repo>/scratchpad/painted_map_pilot'
L = json.load(open(DIR + '/pk05_layout.json')); W, H, rows = L['w'], L['h'], L['rows']; PATH = {tuple(p) for p in L['path']}
C = 64
def truth(x, y): return 'road' if (x, y) in PATH else {'p': 'meadow', 'f': 'forest', 'v': 'house'}[rows[y][x]]
def classify(cell):
    px = list(cell.convert('RGB').resize((16, 16), Image.BOX).getdata()); n = len(px)
    cnt = {'forest': 0, 'meadow': 0, 'road': 0, 'house': 0}
    for r, g, b in px:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255); h *= 360
        if 15 <= h <= 50 and s < 0.55 and v > 0.55: cnt['road'] += 1           # 흙길(밝은 황갈)
        elif (h < 60 or h > 300) and v <= 0.55: cnt['house'] += 1                # 갈색 목재·지붕·줄기
        elif 60 <= h <= 170 and v < 0.50: cnt['forest'] += 1
        elif 60 <= h <= 170 and v < 0.62 and s > 0.45: cnt['forest'] += 0.6   # 밝게 칠해진 수관 일부 가산                     # 어두운 수관/그늘
        elif 55 <= h <= 170: cnt['meadow'] += 1
    # 숲 판정: 어두운 녹색 비율 ≥35%, 집: 갈색 ≥35%, 길: 황갈 ≥35%
    if cnt['house'] / n >= .35 and cnt['house'] > cnt['forest']: return 'house'
    if cnt['road'] / n >= .35: return 'road'
    if cnt['forest'] / n >= .35: return 'forest'
    return 'meadow'
COLS = {'forest': (0, 120, 40), 'meadow': (140, 230, 110), 'road': (230, 190, 120), 'house': (220, 60, 40)}
for name in sys.argv[1:]:
    src = Image.open(f'{DIR}/pk05_painted_{name}.jpg').convert('RGB').resize((W * C, H * C), Image.LANCZOS)
    src.save(f'{DIR}/pk05_painted_{name}_64px.png')
    # 1) 판독성 오버레이: 칸 격자 + 숲(보2·기3) 칸 노란 점선 테두리 + 마을 칸 파란 테두리
    ov = src.copy(); d = ImageDraw.Draw(ov, 'RGBA')
    for x in range(W + 1): d.line([x * C, 0, x * C, H * C], fill=(0, 0, 0, 90))
    for y in range(H + 1): d.line([0, y * C, W * C, y * C], fill=(0, 0, 0, 90))
    ok = 0; conf = {}; miss = []
    for y in range(H):
        for x in range(W):
            t = truth(x, y); p = classify(src.crop((x * C, y * C, x * C + C, y * C + C)))
            t2 = 'meadow' if t == 'road' else t; p2 = 'meadow' if p == 'road' else p   # 길=평지(cost1 동일) 통합 판정
            conf[f'{t}->{p}'] = conf.get(f'{t}->{p}', 0) + 1
            if t2 == p2: ok += 1
            else: miss.append((x, y, t, p))
            if t == 'forest': d.rectangle([x * C + 3, y * C + 3, x * C + C - 4, y * C + C - 4], outline=(255, 230, 0, 230), width=3)
            if t == 'house': d.rectangle([x * C + 3, y * C + 3, x * C + C - 4, y * C + C - 4], outline=(60, 140, 255, 230), width=3)
            if t2 != p2: d.line([x * C + 8, y * C + 8, x * C + C - 8, y * C + C - 8], fill=(255, 0, 0, 220), width=4); d.line([x * C + C - 8, y * C + 8, x * C + 8, y * C + C - 8], fill=(255, 0, 0, 220), width=4)
    ov.save(f'{DIR}/pk05_painted_{name}_overlay.png')
    # 2) 분류 결과 지도(가이드와 나란히)
    cm = Image.new('RGB', (W * 16 * 2 + 16, H * 16), (255, 255, 255)); d2 = ImageDraw.Draw(cm)
    for y in range(H):
        for x in range(W):
            d2.rectangle([x * 16, y * 16, x * 16 + 15, y * 16 + 15], fill=COLS[truth(x, y)])
            p = classify(src.crop((x * C, y * C, x * C + C, y * C + C)))
            d2.rectangle([W * 16 + 16 + x * 16, y * 16, W * 16 + 16 + x * 16 + 15, y * 16 + 15], fill=COLS[p])
    cm.save(f'{DIR}/pk05_painted_{name}_classmap.png')
    tot = W * H; fN = sum(1 for y in range(H) for x in range(W) if truth(x, y) == 'forest')
    fok = sum(1 for y in range(H) for x in range(W) if truth(x, y) == 'forest') - sum(1 for m in miss if m[2] == 'forest')
    print(name, f'일치 {ok}/{tot} = {ok / tot:.1%}', f'숲칸 재현 {fok}/{fN}', '불일치', len(miss), json.dumps(conf, ensure_ascii=False))
