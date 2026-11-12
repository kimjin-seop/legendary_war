# SNES 스타일 시범: Gemini 4열x2행 애니메이션 raw(마젠타) -> walk 4프레임(64x64) 스트립 + attack 4프레임 스트립(프레임 폭 W_ATK, 무기 뻗음 대응)
# 공통 배율(walk 행 최대 키 = 56px), 발 기준선 y=60, 발(하단 6px) 불투명 중심을 프레임 가로 중앙에 고정(앵커), 시트 공통 32색, 톤시프트 외곽선.
# 사용: python docker/gemini/snes_pilot_anim_pp.py <raw.jpg> <out_prefix> [mirror_all=0|1] [flip_frames=예: a1,a2] [atk_w=96]
#   mirror_all=1: raw 전체가 오른쪽을 향할 때 왼쪽 향함으로 통일. flip_frames: 개별 프레임만 좌우반전(w0..w3, a0..a3)
import sys
from PIL import Image

raw, prefix = sys.argv[1], sys.argv[2]
MIRROR = len(sys.argv) > 3 and sys.argv[3] == '1'
FLIP = set(sys.argv[4].split(',')) if len(sys.argv) > 4 and sys.argv[4] not in ('', '-') else set()
ATK_W = int(sys.argv[5]) if len(sys.argv) > 5 else 96
TH, FOOT = 56, 60
im = Image.open(raw).convert('RGB')
W, H = im.size


def is_mag(r, g, b):
    return r > 140 and b > 140 and r - g > 70 and b - g > 70


full = Image.new('RGBA', (W, H)); src = im.load(); dst = full.load()
for y in range(H):
    for x in range(W):
        r, g, b = src[x, y]
        if not is_mag(r, g, b):
            sp = max(0, min(r, b) - g - 25); dst[x, y] = (r - sp, g, b - sp, 255)
A = full.load()
# 마젠타와 섞인 분홍 잔상(속도선 등) 제거: 채도 높은 분홍·연보라 픽셀 투명화
for y in range(H):
    for x in range(W):
        r, g, b, a = A[x, y]
        if a and r > 150 and b > 150 and g < 170 and r - g > 40 and b - g > 40:
            A[x, y] = (0, 0, 0, 0)


# 가장자리 6px 잡티(JPEG 테두리) 제거
for y in range(H):
    for x in range(W):
        if x < 6 or y < 6 or x >= W - 6 or y >= H - 6:
            A[x, y] = (0, 0, 0, 0)


def bands(counts, n):
    out = []; i = 0
    while i < len(counts):
        if counts[i] >= 4:
            j = i
            while j < len(counts) and counts[j] >= 4:
                j += 1
            out.append([i, j]); i = j
        else:
            i += 1
    m = []
    for b in out:
        if m and b[0] - m[-1][1] < 4:
            m[-1][1] = b[1]
        else:
            m.append(b)
    return sorted(sorted(m, key=lambda b: b[1] - b[0], reverse=True)[:n])


rows = bands([sum(1 for x in range(0, W, 2) if A[x, y][3]) for y in range(H)], 2)
cells = []
for (y0, y1) in rows:
    cols = bands([sum(1 for y in range(y0, y1, 2) if A[x, y][3]) for x in range(W)], 4)
    r = []
    for (x0, x1) in cols:
        c = full.crop((x0, y0, x1, y1)); c = c.crop(c.getchannel('A').getbbox()); r.append(c)
    cells.append(r)
names = [['w0', 'w1', 'w2', 'w3'], ['a0', 'a1', 'a2', 'a3']]
for j in range(2):
    for i in range(4):
        if MIRROR ^ (names[j][i] in FLIP):
            cells[j][i] = cells[j][i].transpose(Image.FLIP_LEFT_RIGHT)
scale = TH / max(c.height for c in cells[0])


def small(c):
    s = c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))), Image.BOX)
    s.putalpha(s.getchannel('A').point(lambda v: 255 if v >= 128 else 0)); return s


sm = [[small(c) for c in r] for r in cells]
strip = Image.new('RGB', (sum(s.width for r in sm for s in r), max(s.height for r in sm for s in r)))
x = 0
for r in sm:
    for s in r:
        strip.paste(s.convert('RGB'), (x, 0), s); x += s.width
pal = strip.quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def finish(s):
    q = s.convert('RGB').quantize(palette=pal, dither=Image.Dither.NONE).convert('RGBA'); q.putalpha(s.getchannel('A'))
    p = q.load(); w, h = q.size
    edge = [(x, y) for y in range(h) for x in range(w) if p[x, y][3] and any(not (0 <= x + dx < w and 0 <= y + dy < h) or not p[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in edge:
        r, g, b, a = p[x, y]
        if 0.299 * r + 0.587 * g + 0.114 * b > 60:
            p[x, y] = (int(r * 0.35), int(g * 0.35), int(b * 0.4 + 10), 255)
    return q


def foot_cx(f):
    p = f.load(); xs = [x for y in range(max(0, f.height - 6), f.height) for x in range(f.width) if p[x, y][3]]
    return sum(xs) / len(xs) if xs else f.width / 2


report = []
for j, (fw, tag) in enumerate([(64, 'walk'), (ATK_W, 'attack')]):
    out = Image.new('RGBA', (fw * 4, 64))
    for i in range(4):
        f = finish(sm[j][i]); x = round(i * fw + fw / 2 - foot_cx(f)); y = FOOT - f.height
        clip = x < i * fw or x + f.width > (i + 1) * fw or y < 0
        tile = Image.new('RGBA', (fw, 64)); tile.alpha_composite(f, (x - i * fw, max(0, y)) if x >= i * fw else (0, max(0, y)), (0 if x >= i * fw else i * fw - x, 0 if y >= 0 else -y))
        out.alpha_composite(tile, (i * fw, 0)); report.append((tag, i, f.size, 'CLIP' if clip else 'ok'))
    out.save(f'{prefix}_{tag}.png')
print('scale', round(scale, 4), report)
