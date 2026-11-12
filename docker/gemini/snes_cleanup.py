# SNES 스타일 유닛 "얼룩(디더·점 노이즈)" 정리 후처리. 호출 없음, 결정적(같은 입력 = 같은 출력).
# 여러 파일을 한 번에 넣으면 공통 팔레트로 처리 -> 방향 시트·걷기·공격 간 색 일관성 유지.
# 단계: (1) 불투명 픽셀 공통 K색 메디안컷(디더 없음) (2) Lab 거리 MERGE 이하 팔레트 색 병합(클러스터 단순화)
#       (3) 고립 픽셀 제거: 4이웃에 같은 색이 없고 8이웃 다수색이 있으면 그 색으로(2회) (4) 외톨이 불투명 픽셀(불투명 이웃<=1) 제거
#       (5) 윤곽선 정리: 외곽 경계 픽셀을 인접 내부색의 어두운 톤으로 통일(끊김 없이 1px) (6) 선택: --lift 채도·명도 보정(탁한 색 밝게)
# 사용: python docker/gemini/snes_cleanup.py --k 16 --merge 9 [--lift 1.0] 'in1.png=>out1.png' 'in2.png=>out2.png' ...
import argparse, colorsys
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--k', type=int, default=16)
ap.add_argument('--merge', type=float, default=9.0)
ap.add_argument('--lift', type=float, default=0.0, help='0=끔, 1.0=채도x1.25·명도x1.12')
ap.add_argument('pairs', nargs='+')
a = ap.parse_args()
pairs = [p.split('=>') for p in a.pairs]  # 구분자 '=>'(윈도 드라이브 콜론과 충돌 방지)
ims = [Image.open(i).convert('RGBA') for i, _ in pairs]


def lift(c):
    if a.lift <= 0: return c
    r, g, b = [v / 255 for v in c]; h, l, s = colorsys.rgb_to_hls(r, g, b)
    s = min(1, s * (1 + 0.25 * a.lift)); l = min(0.95, l * (1 + 0.12 * a.lift)) if l > 0.12 else l
    return tuple(round(v * 255) for v in colorsys.hls_to_rgb(h, l, s))


def lab(c):
    def f(t): return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    rgb = [((v / 255 + 0.055) / 1.055) ** 2.4 if v / 255 > 0.04045 else v / 255 / 12.92 for v in c]
    X = (0.4124 * rgb[0] + 0.3576 * rgb[1] + 0.1805 * rgb[2]) / 0.95047
    Y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    Z = (0.0193 * rgb[0] + 0.1192 * rgb[1] + 0.9505 * rgb[2]) / 1.08883
    return (116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z)))


# (1) 공통 팔레트
ops = [p[:3] for im in ims for p in im.get_flattened_data() if p[3] >= 128] if hasattr(Image.Image, 'get_flattened_data') else [p[:3] for im in ims for p in im.getdata() if p[3] >= 128]
strip = Image.new('RGB', (len(ops), 1)); strip.putdata(ops)
q = strip.quantize(colors=a.k, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
NP = min(a.k, len(q.getpalette()) // 3)  # 입력 색이 K보다 적으면 실제 색 수만
pal = [tuple(q.getpalette()[i * 3:i * 3 + 3]) for i in range(NP)]
counts = q.histogram()[:NP]
# (2) 가까운 색 병합(빈도 높은 색으로 흡수)
order = sorted(range(NP), key=lambda i: -counts[i]); rep = {}
L = [lab(c) for c in pal]
for i in order:
    if counts[i] == 0: continue
    tgt = next((j for j in order if j in rep.values() and sum((x - y) ** 2 for x, y in zip(L[i], L[j])) ** 0.5 < a.merge), None)
    rep[i] = tgt if tgt is not None else i
final = {i: lift(pal[rep[i]]) for i in rep}
palimg = Image.new('P', (1, 1)); palimg.putpalette([v for i in range(256) for v in pal[i % len(pal)]])  # 남는 칸은 팔레트 반복(검정 패딩이 선택되는 문제 방지)
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1)); N8 = N4 + ((1, 1), (1, -1), (-1, 1), (-1, -1))
stats = []
for im, (_, out) in zip(ims, pairs):
    w, h = im.size
    idx = im.convert('RGB').quantize(palette=palimg, dither=Image.Dither.NONE).load(); al = im.getchannel('A').load()
    g = [[(rep.get(idx[x, y] % len(pal), idx[x, y] % len(pal)) if al[x, y] >= 128 else -1) for x in range(w)] for y in range(h)]
    changed = 0
    # (4) 외톨이 불투명 픽셀 제거 (경계·잡티)
    for y in range(h):
        for x in range(w):
            if g[y][x] >= 0 and sum(1 for dx, dy in N8 if 0 <= x + dx < w and 0 <= y + dy < h and g[y + dy][x + dx] >= 0) <= 1:
                g[y][x] = -1; changed += 1
    # (3) 고립 픽셀 -> 이웃 다수색 (2회)
    for _ in range(2):
        ng = [r[:] for r in g]
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                c = g[y][x]
                if c < 0 or any(g[y + dy][x + dx] == c for dx, dy in N4): continue
                nb = [g[y + dy][x + dx] for dx, dy in N8 if g[y + dy][x + dx] >= 0]
                if len(nb) < 6: continue  # 외곽 근처는 (5)가 처리
                best = max(set(nb), key=nb.count)
                if nb.count(best) >= 3: ng[y][x] = best; changed += 1
        g = ng
    o = Image.new('RGBA', (w, h)); p = o.load()
    for y in range(h):
        for x in range(w):
            if g[y][x] >= 0: p[x, y] = final[g[y][x]] + (255,)
    # (5) 윤곽선: 투명과 맞닿은 불투명 픽셀 = 가장 가까운 내부색의 어두운 톤(밝기 이미 낮으면 유지)
    edge = {(x, y) for y in range(h) for x in range(w) if g[y][x] >= 0 and any(not (0 <= x + dx < w and 0 <= y + dy < h) or g[y + dy][x + dx] < 0 for dx, dy in N4)}
    for x, y in edge:
        inner = [final[g[y + dy][x + dx]] for dx, dy in N8 if 0 <= x + dx < w and 0 <= y + dy < h and g[y + dy][x + dx] >= 0 and (x + dx, y + dy) not in edge]
        base = inner[0] if inner else final[g[y][x]]
        r, gg, b = base
        if 0.299 * r + 0.587 * gg + 0.114 * b > 55:
            p[x, y] = (int(r * 0.3), int(gg * 0.3), int(b * 0.35 + 12), 255)
    o.save(out); stats.append((out.replace('\\', '/').split('/')[-1], changed, len(set(c for r in g for c in r if c >= 0))))
print('palette', NP, '-> merged', len(set(rep.values())), 'colors; per file (name, pixels changed, colors used):', stats)
