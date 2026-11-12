# SNES 스타일 시범 후처리: Gemini 3x3 raw(마젠타 배경) -> 현행 규격 192x256 시트(3열x4행, 행 down,left,right,up / 열 walk1,idle,walk2)
# 규칙: 마젠타 키 + 디스필, 시트 공통 배율(칸마다 따로 맞추지 않음 = 프레임 간 크기 드리프트 방지), 발 기준선 y=60, 알파 0/255,
#       시트 공통 32색 메디안컷(디더링 없음), 외곽 경계 픽셀을 같은 색의 어두운 톤으로(톤시프트 1px 외곽선), right=left 미러, down=정면 idle(+1px bob).
# 사용: python docker/gemini/snes_pilot_pp.py <raw.jpg> <out_sheet.png> [target_h=56] [zoom=1|2]
import sys
from PIL import Image

raw, out = sys.argv[1], sys.argv[2]
TH = int(sys.argv[3]) if len(sys.argv) > 3 else 56
ZOOM = int(sys.argv[4]) if len(sys.argv) > 4 else 1  # 2 = TH/2 도트로 축소 후 2배 최근접 확대(굵은 도트 SNES 감)
FOOT = 60
im = Image.open(raw).convert('RGB')
W, H = im.size
cw, ch = W // 3, H // 3


def is_mag(r, g, b):
    return r > 140 and b > 140 and r - g > 70 and b - g > 70


def cut(c):
    px = c.load(); w, h = c.size
    o = Image.new('RGBA', (w, h)); op = o.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if is_mag(r, g, b):
                continue
            sp = max(0, min(r, b) - g - 25)  # 마젠타 번짐 제거
            op[x, y] = (r - sp, g, b - sp, 255)
    return o


# 등분 격자 대신 투영 간격으로 행·열 띠를 찾음(모델이 칸 경계를 넘겨 그리는 경우 대응)
full = cut(im); A = full.getchannel('A').load()


def bands(counts, n, minrun=3):
    on = [c >= 4 for c in counts]; out = []; i = 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]:
                j += 1
            out.append([i, j]); i = j
        else:
            i += 1
    # 가까운 띠 병합(간격 < 4px) 후 가장 큰 n개
    m = []
    for b in out:
        if m and b[0] - m[-1][1] < 4:
            m[-1][1] = b[1]
        else:
            m.append(b)
    m = sorted(sorted(m, key=lambda b: b[1] - b[0], reverse=True)[:n])
    return m


rowb = bands([sum(1 for x in range(0, W, 2) if A[x, y]) for y in range(H)], 3)
cells, boxes = [], []
for (y0, y1) in rowb:
    colb = bands([sum(1 for y in range(y0, y1, 2) if A[x, y]) for x in range(W)], 3)
    cells.append([full for _ in colb]); boxes.append([(x0, y0, x1, y1) for (x0, x1) in colb])
# 칸별 실제 bbox(띠 안에서)
boxes = [[full.crop(b).getchannel('A').getbbox() and (lambda bb, b=b: (b[0] + bb[0], b[1] + bb[1], b[0] + bb[2], b[1] + bb[3]))(full.crop(b).getchannel('A').getbbox()) for b in row] for row in boxes]
maxh = max(b[3] - b[1] for row in boxes for b in row if b)
scale = TH / ZOOM / maxh


def small(c, b):
    s = c.crop(b)
    w, h = max(1, round(s.width * scale)), max(1, round(s.height * scale))
    s = s.resize((w, h), Image.BOX)
    a = s.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    s.putalpha(a)
    return s


smalls = [[small(cells[j][i], boxes[j][i]) for i in range(3)] for j in range(3)]
# 시트 공통 팔레트
strip = Image.new('RGB', (sum(s.width for r in smalls for s in r), max(s.height for r in smalls for s in r)), (0, 0, 0))
x = 0; masks = []
for r in smalls:
    for s in r:
        strip.paste(s.convert('RGB'), (x, 0), s); x += s.width
pal = strip.quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def finish(s):
    q = s.convert('RGB').quantize(palette=pal, dither=Image.Dither.NONE).convert('RGBA')
    q.putalpha(s.getchannel('A'))
    p = q.load(); w, h = q.size; edge = []
    for y in range(h):
        for x in range(w):
            if p[x, y][3] and any(not (0 <= x + dx < w and 0 <= y + dy < h) or not p[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                edge.append((x, y))
    for x, y in edge:
        r, g, b, a = p[x, y]
        if 0.299 * r + 0.587 * g + 0.114 * b > 60:
            p[x, y] = (int(r * 0.35), int(g * 0.35), int(b * 0.4 + 10), 255)
    return q


fr = [[(lambda q: q.resize((q.width * ZOOM, q.height * ZOOM), Image.NEAREST))(finish(s)) for s in r] for r in smalls]
sheet = Image.new('RGBA', (192, 256))


def place(f, col, row, bob=0, mirror=False):
    if mirror:
        f = f.transpose(Image.FLIP_LEFT_RIGHT)
    x = col * 64 + (64 - f.width) // 2
    y = row * 64 + FOOT - f.height - bob
    sheet.alpha_composite(f, (max(col * 64, x), max(row * 64, y)))


for c in range(3):
    place(fr[0][1], c, 0, bob=0 if c == 1 else 1)  # down = 정면 idle
    place(fr[1][c], c, 1)                          # left
    place(fr[1][c], c, 2, mirror=True)             # right = left 미러
    place(fr[2][c], c, 3)                          # up
sheet.save(out)
print('saved', out, 'scale', round(scale, 4), 'maxh', maxh, 'sizes', [[(f.width, f.height) for f in r] for r in fr])
