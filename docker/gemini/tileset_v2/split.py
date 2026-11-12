# 4 칩셋 분리(마젠타 225,0,126 -> 알파 0), x2 최근접 확대, 격자 번호 오버레이, 영역 크롭 미리보기, 타일 해시
import sys, json, hashlib, os
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
MAG = (225, 0, 126, 255)
PANELS = {'A': (2, 2), 'B': (484, 2), 'C': (2, 262), 'D': (484, 262)}
T = 16; COLS = 30; ROWS = 16
font = ImageFont.load_default(size=11)
fontS = ImageFont.load_default(size=9)
def keyed(c):
    d = c.load(); w, h = c.size; n = 0
    for y in range(h):
        for x in range(w):
            if d[x, y] == MAG: d[x, y] = (0, 0, 0, 0); n += 1
    return n
# RM2003 칩셋 영역(타일 좌표 열 c0..c1, 행 r0..r1 미포함 끝)
REG = [('water', 0, 6, 0, 8), ('autotile', 6, 12, 0, 8), ('autotile', 0, 12, 8, 16), ('lower', 12, 18, 0, 16), ('lower', 18, 24, 0, 8), ('upper', 18, 24, 8, 16), ('upper', 24, 30, 0, 16)]
REGCOL = {'water': (40, 120, 255), 'autotile': (255, 200, 0), 'lower': (0, 230, 120), 'upper': (255, 80, 200)}
hashes = {}; info = {}
for k, (ox, oy) in PANELS.items():
    c = im.crop((ox, oy, ox + 480, oy + 256))
    n = keyed(c)
    c.save(f'{out}/chipsets/chipset_{k}_16.png', optimize=True)
    c.resize((960, 512), Image.NEAREST).save(f'{out}/chipsets/chipset_{k}_32.png', optimize=True)
    info[k] = {'origin_px': [ox, oy], 'size': [480, 256], 'magenta_px': n}
    for r in range(ROWS):
        for col in range(COLS):
            t = c.crop((col * T, r * T, col * T + T, r * T + T))
            hashes[f'{k}:{r * COLS + col}'] = hashlib.sha1(t.tobytes()).hexdigest()[:12]
    # 격자 오버레이 x3 (체커 배경으로 투명 표시)
    S = 3
    big = c.resize((480 * S, 256 * S), Image.NEAREST)
    bg = Image.new('RGBA', big.size, (60, 60, 60, 255)); dd = ImageDraw.Draw(bg)
    for y in range(0, big.size[1], 12):
        for x in range(0, big.size[0], 12):
            if (x // 12 + y // 12) % 2: dd.rectangle((x, y, x + 11, y + 11), fill=(90, 90, 90, 255))
    bg.alpha_composite(big); d = ImageDraw.Draw(bg)
    for col in range(COLS + 1): d.line((col * T * S, 0, col * T * S, 256 * S), fill=(0, 0, 0, 160))
    for r in range(ROWS + 1): d.line((0, r * T * S, 480 * S, r * T * S), fill=(0, 0, 0, 160))
    for name, c0, c1, r0, r1 in REG: d.rectangle((c0 * T * S, r0 * T * S, c1 * T * S - 1, r1 * T * S - 1), outline=REGCOL[name] + (255,), width=2)
    for r in range(ROWS):
        for col in range(COLS):
            tid = r * COLS + col; x = col * T * S + 2; y = r * T * S + 1
            d.text((x, y), str(tid), font=fontS, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
    bg.save(f'{out}/overlay/grid_{k}_x3.png', optimize=True)
    # 영역 크롭 x4(라벨 판독용)
    S4 = 4
    big4 = c.resize((480 * S4, 256 * S4), Image.NEAREST)
    bg4 = Image.new('RGBA', big4.size, (70, 70, 70, 255)); bg4.alpha_composite(big4); d4 = ImageDraw.Draw(bg4)
    for col in range(COLS + 1): d4.line((col * T * S4, 0, col * T * S4, 256 * S4), fill=(0, 0, 0, 200))
    for r in range(ROWS + 1): d4.line((0, r * T * S4, 480 * S4, r * T * S4), fill=(0, 0, 0, 200))
    for r in range(ROWS):
        for col in range(COLS):
            d4.text((col * T * S4 + 2, r * T * S4 + 1), str(r * COLS + col), font=font, fill=(255, 255, 0, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
    for i, (c0, c1) in enumerate(((0, 12), (12, 24), (24, 30))):
        bg4.crop((c0 * T * S4, 0, c1 * T * S4, 256 * S4)).save(f'{out}/preview/region_{k}_{i}_x4.png', optimize=True)
# 중복 타일(패널 간 동일)
groups = {}
for tid, h in hashes.items(): groups.setdefault(h, []).append(tid)
json.dump({'panels': info, 'tile_px': T, 'cols': COLS, 'rows': ROWS, 'hash': hashes}, open(f'{out}/tile_hashes.json', 'w'), indent=0)
same = {k: 0 for k in PANELS}
for h, ids in groups.items():
    ps = sorted(set(i.split(':')[0] for i in ids))
    for p in ps:
        if 'A' in ps and p != 'A': pass
print(info)
for k in 'BCD':
    n = sum(1 for i in range(480) if hashes[f'{k}:{i}'] == hashes[f'A:{i}'])
    print(k, 'same position as A:', n)
print('unique tiles overall', len(groups))
