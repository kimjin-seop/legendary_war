"""제안 배치 규칙 시뮬레이터(미리보기 전용, 게임 코드 아님). FE 에 요청할 이웃 규칙을 그대로 구현해 land_set 인덱스로 칠한다.
사용: python land_paint_proposed.py <terrain.json> <cells.json> <ls_names.json> <out paint.json>
 - 물·여울·다리 칸은 cells.json(현재 FE 결과) 그대로(수상 타일은 다른 담당)
 - 언덕(i)은 water_set hill_a/b/c(전역 1000+프레임: 미리보기 렌더러 규약)
규칙: plain=grass a55/b25/c10/d10, forest=blob47(8방 내부면 a/b/c 해시), mountain=mountain a/b/c/d 해시(눈 바이옴 snow),
      road=road16(길·다리 연결), castle=pave(slab/slab_b/brick), 성문=성벽 줄 사이 castle 칸 -> gate,
      wall=좌우 성벽이면 face, 위아래만 성벽이면 top_v, 모서리(꺾임) tower, village=군집 사각형이면 지붕/벽 조립·단독은 house(기와/초가 해시)
"""
import sys, json

ter_p, cells_p, names_p, out_p = sys.argv[1:5]
TER = json.load(open(ter_p, encoding='utf-8')); CELLS = json.load(open(cells_p, encoding='utf-8')); N = json.load(open(names_p, encoding='utf-8'))
BITS = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}
D8 = {'N': (0, -1), 'NE': (1, -1), 'E': (1, 0), 'SE': (1, 1), 'S': (0, 1), 'SW': (-1, 1), 'W': (-1, 0), 'NW': (-1, -1)}


def red(m):
    for d, a, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not (m & BITS[a] and m & BITS[b]): m &= ~BITS[d]
    return m


def h(x, y, s=0):
    v = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791); v = (v * 2654435761) & 0xffffffff
    return (v >> 8) / 16777216


HILL = [1000, 1001, 1002]
out = {}
for code, m in TER.items():
    rows = m['tiles']; H, W = len(rows), len(rows[0])
    at = lambda x, y: rows[y][x] if 0 <= x < W and 0 <= y < H else None
    cl = CELLS[code]['cells']
    res = []
    for y in range(H):
        for x in range(W):
            c = at(x, y); orig = cl[y * W + x]
            idx = None
            mask = lambda pred: red(sum(b for d, b in BITS.items() if pred(at(x + D8[d][0], y + D8[d][1]))))
            if c == 'p' or c == 'v' and False:
                r = h(x, y, 1); idx = N['grass_a'] if r < .55 else N['grass_b'] if r < .8 else N['grass_c'] if r < .9 else N['grass_d']
            elif c == 'f':
                mk = mask(lambda t: t in ('f', None))
                if mk == 255: idx = N['forest_' + 'abc'[int(h(x, y, 2) * 3)]]
                elif mk == 0: idx = N['forest_sparse_' + 'ab'[int(h(x, y, 3) * 2)]]
                else: idx = N[f'forest47_{mk}']
            elif c == 'm':
                mk = mask(lambda t: t in ('m', None))
                if m.get('biome') == 'snow' and mk == 0: idx = N['mountain_snow']
                elif mk == 0: idx = N['mountain_' + 'abcd'[int(h(x, y, 4) * 4)]]
                elif mk == 255: idx = N['mount_full_' + 'abcd'[int(h(x, y, 4) * 4)]]
                else: idx = N[f'mount47_{mk}']
            elif c == 'k':
                mk = mask(lambda t: t in ('k', 'm', None))
                idx = N['rock_' + 'ab'[int(h(x, y, 5) * 2)]] if mk == 255 else N[f'rock47_{mk}']
            elif c == 'i':
                idx = HILL[int(h(x, y, 6) * 3)]
            elif c == 'r':
                rd = lambda t: t in ('r', 'b')
                wide = any(rd(at(x + dx, y)) and rd(at(x, y + dy)) and rd(at(x + dx, y + dy)) for dx in (-1, 1) for dy in (-1, 1))
                if wide: idx = N[f'dirt47_{mask(lambda t: t in ("r", "b"))}']
                else:
                    rm = sum(b for (dx, dy), b in (((0, -1), 1), ((1, 0), 2), ((0, 1), 4), ((-1, 0), 8)) if rd(at(x + dx, y + dy)))
                    idx = N[f'road16_{rm}']
            elif c == 'c':
                wl = at(x - 1, y) in ('W', 'c') and at(x + 1, y) in ('W', 'c') and (at(x, y - 1) not in ('W',) and at(x, y + 1) not in ('W',))
                inrow = sum(1 for xx in range(W) if at(xx, y) == 'W') >= 3
                idx = N['gate'] if inrow and (at(x - 1, y) in ('W', 'c')) and (at(x + 1, y) in ('W', 'c')) else N['pave_' + ['slab', 'slab_b', 'brick'][int(h(x, y, 7) * 3)]]
            elif c == 'W':
                n_, s_, w_, e_ = (at(x, y - 1) in ('W', 'c')), (at(x, y + 1) in ('W', 'c')), (at(x - 1, y) in ('W', 'c')), (at(x + 1, y) in ('W', 'c'))
                if (n_ or s_) and (w_ or e_): idx = N['tower_a']
                elif n_ or s_: idx = N['wall_top_v']
                else: idx = N['wall_face_' + 'ab'[int(h(x, y, 8) * 2)]]
            elif c == 'v':
                idx = None  # 아래 군집 처리
            if idx is None: res.append(orig)
            else: res.append([idx, 0, None, None, orig[4] if len(orig) > 4 else None])
    # 마을 군집: 직사각형 2x2 이상이면 지붕/벽 조립, 아니면 칸마다 단독 집
    seen = set()
    for y in range(H):
        for x in range(W):
            if at(x, y) != 'v' or (x, y) in seen: continue
            comp = [(x, y)]; seen.add((x, y)); q = [(x, y)]
            while q:
                a, b = q.pop()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n2 = (a + dx, b + dy)
                    if at(*n2) == 'v' and n2 not in seen: seen.add(n2); comp.append(n2); q.append(n2)
            xs = [p[0] for p in comp]; ys = [p[1] for p in comp]
            w, hh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            x0, y0 = min(xs), min(ys)
            if w * hh == len(comp) and w >= 2 and hh >= 2:
                for (px, py) in comp:
                    col = 'L' if px == x0 else 'R' if px == x0 + w - 1 else 'C'
                    ry = py - y0
                    if ry == hh - 1:
                        nm = 'door_house' if px == x0 + w // 2 else f'hanok_wall_{col}' if col != 'C' else 'hanok_wall_window'
                    elif hh == 2: nm = f'roof_full_{col}'
                    elif ry == 0: nm = f'roof_top_{col}'
                    elif ry == hh - 2: nm = f'roof_bot_{col}'
                    else: nm = f'roof_mid_{col}'
                    orig = cl[py * W + px]
                    res[py * W + px] = [N[nm], 0, None, None, orig[4] if len(orig) > 4 else None]
            else:
                for (px, py) in comp:
                    orig = cl[py * W + px]
                    res[py * W + px] = [N['house_' + ('giwa' if h(px, py, 9) < .65 else 'thatch')], 0, None, None, orig[4] if len(orig) > 4 else None]
    out[code] = {'cells': res}
json.dump(out, open(out_p, 'w', encoding='utf-8'))
print('painted', list(out))
