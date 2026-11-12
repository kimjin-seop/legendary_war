"""서고 실내(L) 키트 후처리(안아트 2026-11-08). 문화권 키트(kits_pp.py·hybrid.py·castle.extrude)와 같은 규칙을 그대로 쓴다.
- 스프라이트: AI 시트(마젠타) -> 덩어리 묶기 -> 디스필 -> 목표 폭 BOX 축소 -> tb_lib 팔레트 양자화 -> 1px 외곽선 -> 바닥선 통일(normalize_base) + 지면 그림자
- 벽: AI 정면 벽 모듈 질감(H px) + castle.extrude 47블롭(발자국 = 칸 전체). 윗면 = 짙은 나무 천장색(코드)
- 지면: 절차 생성(호출 0). 32 주기라 같은 종류끼리 이음매 없음. 변형 v0~v2 는 칸 경계 3px 를 같게 둬서 변형끼리도 이음매 동일
- 오토타일: at47(8열x6행, masks_order = terrain_v3 at47_spec) 카펫/바닥, 허공/바닥
사용(프로젝트 루트): python docker/gemini/library_kit_pp.py
출력: public/assets/tiles/terrain_buildings/kits/L/{sprites,autotile,ground}/*.png, kit_L_spec.json, tb_fragment_L.json, manifest_fragment_kit_L.json
미리보기: docker/gemini/library_kit/preview/*.png"""
import sys, json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
TBK = ROOT / 'scratchpad/terrain_buildings'
sys.path.insert(0, str(TBK / 'tools')); sys.path.insert(0, str(TBK / 'kits'))
import landmark_pp as L                                  # noqa: E402
from tb_lib import P, hx, RGBA, SHADOW, save, x_up       # noqa: E402
from castle import footprint, extrude, MASKS, COLS, T    # noqa: E402
from kits_pp import normalize_base                        # noqa: E402

SRC = ROOT / 'docker/gemini/library_kit'; RAW = SRC / 'raw'; PREV = SRC / 'preview'
OUT = ROOT / 'public/assets/tiles/terrain_buildings/kits/L'
REL = 'kits/L'
for d in (OUT / 'sprites', OUT / 'autotile', OUT / 'ground', PREV):
    d.mkdir(parents=True, exist_ok=True)
C = {k: np.array(hx(v), np.uint8) for k, v in P.items()}


# ------------------------------------------------------------------ 덩어리 묶기(가까운 조각끼리 한 소품)
def groups(path, gap):
    rgb = np.array(Image.open(path).convert('RGB'))
    m, lab, n = L.key_alpha(rgb)
    sizes = ndi.sum(m, lab, range(1, n + 1)); sl = ndi.find_objects(lab)
    ids = [i + 1 for i in range(n) if sizes[i] >= 60]
    par = {i: i for i in ids}
    def f(i):
        while par[i] != i:
            par[i] = par[par[i]]; i = par[i]
        return i
    box = {i: (sl[i - 1][0].start, sl[i - 1][0].stop, sl[i - 1][1].start, sl[i - 1][1].stop) for i in ids}
    for a in ids:
        for b in ids:
            if a < b:
                A, B = box[a], box[b]
                dy = max(A[0] - B[1], B[0] - A[1], 0); dx = max(A[2] - B[3], B[2] - A[3], 0)
                if max(dx, dy) <= gap:
                    par[f(a)] = f(b)
    G = {}
    for i in ids:
        G.setdefault(f(i), []).append(i)
    out = []
    H = rgb.shape[0]
    for root, mem in G.items():
        g = np.isin(lab, mem)
        if g.sum() < sizes.max() * 0.02:
            continue
        keep = (ndi.binary_fill_holes(g) & m) | g
        ys, xs = np.where(keep)
        out.append(((ys.min() + ys.max()) / 2 > H / 2, xs.min(), keep, (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))))
    out.sort(key=lambda r: (r[0], r[1]))
    return rgb, out


# 시트 -> [(이름, 목표 폭, 분류, layer, 그림자)] (격자 순서: 위 줄 왼->오, 아래 줄 왼->오). None = 버림
FLOORLEVEL = dict(layer='decal', shadow=False)
JOBS = {
    'l_shelves': (60, [('l_bookcase_tall', 64, 'shelf'), ('l_scroll_rack', 64, 'shelf'), ('l_bookcase_low_ladder', 56, 'shelf'), ('l_bookcase_toppled', 64, 'shelf')]),
    'l_props_a': (6, [('l_book_pile_a', 18, 'prop'), ('l_book_pile_b', 15, 'prop'), ('l_scroll_basket', 22, 'prop'), ('l_candelabra', 13, 'light'), ('l_reading_table', 54, 'furniture', {'bottom': True})]),
    'l_props_b': (60, [('l_writing_desk', 60, 'furniture'), ('l_lectern', 20, 'furniture'), ('l_counter', 64, 'furniture'), ('l_book_chest', 28, 'prop')]),
    'l_structure': (70, [('l_pillar', 20, 'pillar'), ('l_pillar_broken', 32, 'pillar'), ('l_door_arch', 64, 'door'), None]),
    'l_void_edge': (60, [None, ('l_paper_flurry', 40, 'void_deco'), ('l_rope_bridge_h', 64, 'bridge', FLOORLEVEL), None]),
    'l_stairs_front': (60, [('l_stair_down', 64, 'stair', FLOORLEVEL), ('l_stair_up', 48, 'stair'), ('l_float_isle_l', 64, 'void_deco', FLOORLEVEL), ('l_float_isle_s', 32, 'void_deco', FLOORLEVEL)]),
}


def build_sprites():
    spec = {}
    for job, (gap, items) in JOBS.items():
        rgb, comps = groups(RAW / f'{job}.jpg', gap)
        if len(comps) != len(items):
            print(f'[{job}] 경고: 덩어리 {len(comps)} (기대 {len(items)})')
        for it, (_, _, keep, sl) in zip(items, comps):
            if it is None:
                continue
            name, tw, cat = it[:3]; opt = it[3] if len(it) > 3 else {}
            col = L.despill(rgb[sl], keep[sl]); col, A = L.shrink(col, keep[sl].astype(float), tw)
            im0 = L.finish(col, A, shadow=False)
            im, meta = normalize_base(im0, shadow=opt.get('shadow', True), bottom=opt.get('bottom', False))
            save(im, OUT / 'sprites' / f'{name}.png')
            layer = opt.get('layer', 'object')
            spec[name] = {'file': f'{REL}/sprites/{name}.png', 'size': list(im.size), 'anchor': meta['anchor'] if layer == 'object' else None,
                          'layer': layer, 'group': 'kit_l', 'culture': 'lib', 'category': cat, 'footprint_w': meta['footprint_cells_w'],
                          'overhang_bottom_px': meta['overhang_bottom_px'],
                          'source': f'gemini docker/gemini/library_kit/raw/{job}.jpg (jobs.json)', 'verify': False}
    return spec


# ------------------------------------------------------------------ 벽(정면 질감 + 47블롭 돌출)
WALLH = 24


BOOK = ['L1', 'CL2', 'H2', 'B2', 'J2', 'T2', 'CL3', 'L2', 'H3', 'K3']


def wall_texture(idx, H=WALLH):
    """1차(AI 모듈 축소)는 24px 로 줄이면 책이 뭉개져 탈락(미리보기 확인). AI 모듈(l_wall_modules.jpg)의 구성·색만 따르고 도트는 코드로 그림.
    행(위->아래): 0~2 갓 돌림띠, 3~20 선반 3단(책 5줄 + 선반판 1줄), 21 그림자, 22~23 상아 석재 굽. 폭 64 주기, 기둥 32px 마다."""
    TW = 64; a = np.zeros((H, TW, 3), np.uint8); g = rnd(400 + idx)
    a[0] = C['B3']; a[1] = C['B2']; a[2] = C['B0']
    a[21] = C['B0']; a[22] = C['WS5']; a[23] = C['WS3']
    a[22, ::8] = C['WS3']
    if idx in (0, 3):
        for bay in range(3):
            y0 = 3 + bay * 6
            a[y0:y0 + 5] = C['DK']; a[y0 + 5] = C['B1']; a[y0 + 5, ::2] = C['B2']
            x = 2
            while x < TW - 1:
                if x % 32 in (0, 1, 31):
                    x += 1; continue
                w = 1 + int(g.integers(0, 2)); hgt = int(g.integers(3, 6))
                if idx == 3 and g.random() < 0.38:
                    if g.random() < 0.4 and x + 3 < TW and (x + 3) % 32 > 3:      # 눕혀진 책
                        a[y0 + 4, x:x + 3] = C[BOOK[int(g.integers(0, len(BOOK)))]]
                    x += w + 1; continue
                col = BOOK[int(g.integers(0, len(BOOK)))]
                for dx in range(w):
                    if (x + dx) % 32 in (0, 1, 31) or x + dx >= TW:
                        break
                    a[y0 + 5 - hgt:y0 + 5, x + dx] = C[col]
                    a[y0 + 5 - hgt, x + dx] = C['PL2'] if dx == 0 and w == 2 else a[y0 + 5 - hgt, x + dx]
                x += w
        if idx == 3:
            for _ in range(5):                                 # 빈 칸 거미줄·먼지 점
                a[int(g.integers(3, 20)), int(g.integers(3, 60))] = C['K2']
    elif idx == 1:                                             # 두루마리 칸 수납장
        a[3:21] = C['B1']
        for cy in (3, 9, 15):
            for cx in range(2, TW, 6):
                if cx % 32 in (0, 1, 31) or cx + 5 > TW:
                    continue
                a[cy + 1:cy + 6, cx:cx + 5] = C['DK']
                for (sy, sx) in ((cy + 2, cx), (cy + 2, cx + 2), (cy + 4, cx + 1), (cy + 4, cx + 3)):
                    a[sy:sy + 2, sx:sx + 2] = C['H4']; a[sy + 1, sx + 1] = C['H2']
    else:                                                      # 판벽 + 석재 하단
        a[3:13] = C['B2']; a[3:13, ::8] = C['B1']; a[3:13, 1::8] = C['B3']
        a[13] = C['B3']; a[14] = C['B0']
        a[15:21] = C['WS4']; a[17, :] = C['WS2']; a[15:17, ::8] = C['WS2']; a[18:21, 4::8] = C['WS2']; a[15] = C['WS5']
        for bx in (14, 46):                                    # 무지 진홍 걸개(문양 없음)
            a[3:11, bx:bx + 5] = C['L1']; a[3:11, bx] = C['L2']; a[11, bx + 1:bx + 4] = C['L1']; a[12, bx + 2] = C['L1']; a[3, bx - 1:bx + 6] = C['H3']
    a[3:21, 0] = C['B2']; a[3:21, 1] = C['B1']; a[3:21, 31] = C['B0']      # 기둥(32px 마다, 왼쪽 위 빛)
    a[3:21, 32] = C['B2']; a[3:21, 33] = C['B1']; a[3:21, 63] = C['B0']
    return a, TW


def wall_texture_ai(idx, H=WALLH):
    rgb, comps = groups(RAW / 'l_wall_modules.jpg', 40)
    keep, (ys, xs) = comps[idx][2], comps[idx][3]
    w = xs.stop - xs.start
    cut = (ys, slice(xs.start + int(w * 0.03), xs.stop - int(w * 0.03)))
    col = L.despill(rgb[cut], keep[cut])
    tw = max(32, int(round((cut[1].stop - cut[1].start) * H / (ys.stop - ys.start))))
    col, A = L.shrink(col, keep[cut].astype(float), tw)
    col = L.quant(col)
    hh = min(H, col.shape[0]); col = col[-hh:]
    if hh < H:
        col = np.concatenate([np.repeat(col[:1], H - hh, 0), col])
    TW = max(32, (tw // 32) * 32)
    x0 = (tw - TW) // 2
    return col[:, x0:x0 + TW].copy(), TW


def variant_b(K, TW):
    Kb = np.roll(K, TW // 2, axis=1).copy()
    for c in range(TW):
        if c % 32 in (0, 1, 2, 29, 30, 31):
            Kb[:, c] = K[:, c]
    return Kb


def wall_shade(tex, TW, H):
    keys = {}
    def key(c):
        k = 'LW_%02x%02x%02x' % tuple(int(v) for v in c)
        RGBA.setdefault(k, tuple(int(v) for v in c) + (255,)); return k
    K = np.empty(tex.shape[:2], dtype=object)
    for y in range(tex.shape[0]):
        for x in range(tex.shape[1]):
            K[y, x] = key(tex[y, x])

    def shade(ctx):
        k = np.full(ctx['kind'].shape, 'B0', dtype=object)
        x, s, din, kd, y = ctx['x'], ctx['s'], ctx['din'], ctx['kind'], ctx['y']
        face = kd == 1; top = kd == 2
        k[face] = K[np.clip(H - 1 - s, 0, H - 1)[face], (x % TW)[face]]
        k[top & ((y % 8) == 0)] = 'DK'            # 천장 들보 줄(세계 좌표 8px 주기 -> 칸 경계 이음매 없음)
        k[top & (din <= 3.0)] = 'B1'              # 벽 윗면 테두리 몰딩
        k[top & (din <= 1.6)] = 'B2'
        return k
    return shade, K


WALLS = [('wall_l_bookshelf', 0), ('wall_l_scroll', 1), ('wall_l_panel', 2), ('wall_l_bookshelf_worn', 3)]


def build_walls():
    sheets = {}
    for name, idx in WALLS:
        tex, TW = wall_texture(idx)
        for tag, tx in (('', tex), ('_b', variant_b(tex, TW))):
            shade, _ = wall_shade(tx, TW, WALLH)
            sheet = np.zeros((6 * (T + WALLH), COLS * T, 4), np.uint8)
            for i, m in enumerate(MASKS):
                sheet[(i // COLS) * (T + WALLH):(i // COLS + 1) * (T + WALLH), (i % COLS) * T:(i % COLS + 1) * T] = extrude(footprint(m, 0, 32), WALLH, shade)
            save(Image.fromarray(sheet), OUT / 'autotile' / f'at47_{name}{tag}.png')
        sheets[name] = {'file': f'{REL}/autotile/at47_{name}.png', 'cell': [32, 32 + WALLH], 'overhang_top_px': WALLH, 'kind': 'wall', 'kit': 'L',
                        'file_b': f'{REL}/autotile/at47_{name}_b.png'}
    return sheets


# ------------------------------------------------------------------ 절차 지면(32 주기)
def rnd(seed):
    return np.random.default_rng(seed)


def edge_lock(base, var):
    """칸 경계 3px 를 base 와 같게(변형끼리 이음매 동일)"""
    o = var.copy(); m = np.zeros((T, T), bool); m[:3] = m[-3:] = True; m[:, :3] = m[:, -3:] = True
    o[m] = base[m]; return o


def tex_wood(v):
    a = np.zeros((T, T, 3), np.uint8)
    # 2차: 1차는 모든 줄에 이음이 있어 벽돌처럼 보임(미리보기 확인) -> 이음은 2줄에만, 판 경계 빛줄 제거, 대비 낮춤
    seams = {0: 9, 2: 25}
    for r in range(4):
        y0 = r * 8
        a[y0:y0 + 8] = C['D2']
        a[y0 + 7] = C['D1']                      # 판 사이 틈(짙은 선 대신 한 단 어두운 색)
        if r in seams:
            sx = seams[r]; a[y0:y0 + 7, sx] = C['D0']
    g = rnd(11 + v)
    for _ in range(10 + 3 * v):                   # 결(짧은 가로 획, 밝은/어두운 반반)
        y = int(g.integers(1, 6)) + 8 * int(g.integers(0, 4)); x = int(g.integers(0, T - 4)); ln = int(g.integers(2, 6))
        a[y, x:x + ln] = C['D1'] if g.random() < 0.6 else C['D3']
    if v:
        for _ in range(v):                        # 옹이
            y = 8 * int(g.integers(0, 4)) + 3; x = int(g.integers(6, 24))
            a[y:y + 2, x:x + 2] = C['D1']; a[y, x] = C['D0']
    return a


def tex_stone(v):
    a = np.zeros((T, T, 3), np.uint8)
    g = rnd(31 + v)
    # 2차: 1차는 체크무늬로 보임 -> 같은 기본색 판석 + 줄눈(오른쪽·아래 WS3, 왼쪽·위 WS5 빛) 반 칸 엇갈림, 판석별 색 차는 아주 작게
    a[:] = C['WS4']
    for r in range(2):
        y0 = r * 16; off = 8 if r else 0
        a[y0 + 15] = C['WS3']; a[y0] = C['WS5']
        for c in range(2):
            x = (c * 16 + off) % T
            a[y0:y0 + 15, (x - 1) % T] = C['WS3']; a[y0 + 1:y0 + 15, x] = C['WS5']
    for _ in range(8 + 5 * v):                    # 돌 반점
        y, x = int(g.integers(2, 30)), int(g.integers(2, 30))
        if y % 16 not in (0, 15):
            a[y, x] = C['WS3'] if g.random() < 0.7 else C['PL2']
    if v == 2:                                     # 가는 금 1줄
        for (y, x) in ((5, 20), (6, 21), (7, 21)):
            a[y, x] = C['WS2']
    return a


def tex_carpet(v):
    a = np.zeros((T, T, 3), np.uint8); a[:] = C['L1']
    yy, xx = np.mgrid[0:T, 0:T]
    d = (np.abs((xx % 16) - 8) + np.abs((yy % 16) - 8))
    a[d == 6] = C['L0']; a[d == 0] = C['H3']; a[(d == 2) & ((xx + yy) % 2 == 0)] = C['L2']
    if v:
        g = rnd(51 + v)
        for _ in range(6 * v):                    # 닳은 자국
            y, x = int(g.integers(3, 29)), int(g.integers(3, 29)); a[y, x] = C['L2']
    return a


def tex_void(v):
    a = np.zeros((T, T, 3), np.uint8); a[:] = C['OUT']
    yy, xx = np.mgrid[0:T, 0:T]
    n = np.sin(2 * math.pi * (xx / 32 + 0.13)) * np.cos(2 * math.pi * (yy / 32 * 2 + 0.31)) + 0.6 * np.sin(2 * math.pi * ((xx + yy) / 32 * 2))
    a[n > 0.9] = C['K0']
    g = rnd(71 + v)
    for _ in range(2 + v):                         # 먼지·종잇조각 티끌
        y, x = int(g.integers(4, 28)), int(g.integers(4, 28)); a[y, x] = C['K2']
    if v == 2:
        a[12, 18] = C['PL1']
    return a


def tex_plank(v, vertical=False):
    a = tex_void(0).copy()
    for i in range(4):                             # 가로 진행: 세로 판자 4장(8px), 위아래 끝 4px 은 허공
        x0 = i * 8
        tone = ['B2', 'B3', 'B2', 'B1'][(i + v) % 4]
        a[4:28, x0 + 1:x0 + 7] = C[tone]
        a[4:28, x0 + 1] = C['B3'] if tone != 'B3' else C['B4']
        a[4:28, x0 + 7] = C['B0']; a[27, x0 + 1:x0 + 7] = C['B0']
        a[4, x0 + 1:x0 + 7] = C['B0']
        if (i + v) % 3 == 0:
            a[15:17, x0 + 3] = C['B0']               # 못·옹이
    a[6] = np.where((np.arange(T) % 4 < 2)[:, None], C['H2'], C['H1'])   # 밧줄(위)
    a[25] = np.where((np.arange(T) % 4 < 2)[:, None], C['H2'], C['H1'])  # 밧줄(아래)
    a[7] = np.where(a[7].sum(-1)[:, None] > 0, a[7], a[7])
    return np.transpose(a, (1, 0, 2)).copy() if vertical else a


GROUND = [('floor_wood', tex_wood), ('floor_stone', tex_stone), ('carpet', tex_carpet), ('void', tex_void),
          ('plank_h', lambda v: tex_plank(v)), ('plank_v', lambda v: tex_plank(v, True))]


def build_ground():
    rows = []
    for name, fn in GROUND:
        b = fn(0); rows.append([b] + [edge_lock(b, fn(v)) if name not in ('plank_h', 'plank_v') else fn(v) for v in (1, 2)])
    sheet = np.zeros((len(GROUND) * T, 3 * T, 4), np.uint8); sheet[..., 3] = 255
    for r, vs in enumerate(rows):
        for c, t in enumerate(vs):
            sheet[r * T:(r + 1) * T, c * T:(c + 1) * T, :3] = t
    save(Image.fromarray(sheet), OUT / 'ground' / 'l_ground_base.png')
    return {n: rows[i] for i, (n, _) in enumerate(GROUND)}


# ------------------------------------------------------------------ 오토타일 at47 (비트 N1 NE2 E4 SE8 S16 SW32 W64 NW128, 같은 무리 이웃)
def at_carpet(m, carpet):
    a = carpet.copy()
    N, E, S, W = m & 1, m & 4, m & 16, m & 64
    ring = [('L0', 0), ('H2', 1), ('H4', 2), ('L0', 3)]
    for k, d in ring:                               # 바깥 가장자리 테두리(이웃이 카펫이 아니면)
        if not N: a[d, :] = C[k]
        if not S: a[T - 1 - d, :] = C[k]
        if not W: a[:, d] = C[k]
        if not E: a[:, T - 1 - d] = C[k]
    for k, d in ring:                               # 테두리 모서리 정리: 직교 이웃 있는 쪽 테두리는 끝까지 이어짐(위에서 처리) — 안쪽 모서리(대각만 빈 곳)
        pass
    for (bit, a1, a2, ys, xs) in ((128, 1, 64, slice(0, 4), slice(0, 4)), (2, 1, 4, slice(0, 4), slice(T - 4, T)),
                                  (32, 16, 64, slice(T - 4, T), slice(0, 4)), (8, 16, 4, slice(T - 4, T), slice(T - 4, T))):
        if (m & a1) and (m & a2) and not (m & bit):
            a[ys, xs] = C['H2']; a[ys.start + 1:ys.stop - 1, xs.start + 1:xs.stop - 1] = C['H4']
    if not N:                                       # 카펫 바닥 그림자 없음(평면). 대신 바깥 1px 은 짙은 선
        pass
    return a


def jag(x):
    return 7 + 1.6 * np.sin(2 * math.pi * x / 32) + 0.9 * np.sin(2 * math.pi * 3 * x / 32 + 1.1)


def at_void(m, void, floor):
    """칸 = 허공. 북쪽이 바닥이면 바닥 단면(나무판 끝 + 흙·돌)이 위에서 내려옴, 동서가 바닥이면 어두운 옆 단면, 남쪽이 바닥이면 1px 테두리"""
    a = void.copy()
    N, E, S, W = m & 1, m & 4, m & 16, m & 64
    xs = np.arange(T)
    if not N:
        dep = np.round(jag(xs)).astype(int)
        for x in range(T):
            a[0, x] = C['D3']; a[1, x] = C['D1']          # 바닥판 앞 모서리
            for y in range(2, dep[x]):
                a[y, x] = C['WS1'] if (y + x * 3) % 7 else C['WS2']
            a[dep[x] - 1, x] = C['D0']
            if dep[x] < T:
                a[dep[x], x] = C['K0']
        for x in (5, 6, 19, 26):                        # 늘어진 뿌리
            for y in range(dep[x], dep[x] + 3 + (x % 3)):
                a[y, x] = C['D0']
    for side, cols in ((W, (0, 1)), (E, (T - 1, T - 2))):
        if not side:
            a[:, cols[0]] = C['K1']; a[:, cols[1]] = C['K0']
            if not N:
                dep0 = int(round(jag(cols[0])))
                a[0:dep0, cols[0]] = C['D0']
    if not S:
        a[T - 1] = C['K2']
    for (bit, a1, a2, y, x) in ((128, 1, 64, 0, 0), (2, 1, 4, 0, T - 1)):     # 안쪽 모서리: 대각 이웃만 바닥 -> 점 1개 테두리
        if (m & a1) and (m & a2) and not (m & bit):
            a[y:y + 2, max(0, x - 1):x + 2] = C['K1']
    return a


def build_autotiles(G):
    out = {}
    for name, fn, src in (('floor_carpet', lambda m: at_carpet(m, G['carpet'][0]), 'carpet'),
                          ('floor_void', lambda m: at_void(m, G['void'][0], G['floor_wood'][0]), 'void')):
        sheet = np.zeros((6 * T, COLS * T, 4), np.uint8); sheet[..., 3] = 255
        for i, m in enumerate(MASKS):
            sheet[(i // COLS) * T:(i // COLS + 1) * T, (i % COLS) * T:(i % COLS + 1) * T, :3] = fn(m)
        save(Image.fromarray(sheet), OUT / 'autotile' / f'at47_{name}.png')
        out[name] = sheet
    return out


# ------------------------------------------------------------------ 시험 렌더(실제 서고 맵 지형) + 이음매 점검
BIT = [(0, -1, 1), (1, -1, 2), (1, 0, 4), (1, 1, 8), (0, 1, 16), (-1, 1, 32), (-1, 0, 64), (-1, -1, 128)]


def norm(m):
    for d, a1, b1 in ((2, 1, 4), (8, 4, 16), (32, 16, 64), (128, 64, 1)):
        if m & d and not (m & a1 and m & b1):
            m &= ~d
    return m


SLOT = {m: i for i, m in enumerate(MASKS)}


def mask(rows, x, y, pred, oob=True):
    m = 0
    for dx, dy, b in BIT:
        X, Y = x + dx, y + dy
        inside = 0 <= Y < len(rows) and 0 <= X < len(rows[0])
        if (pred(rows[Y][X]) if inside else oob):
            m |= b
    return norm(m)


def h3(x, y, s):
    return ((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) % 1000 / 1000


def render(rows, G, AT, wall, props=()):
    Hh, Ww = len(rows), len(rows[0])
    img = np.zeros((Hh * T, Ww * T, 4), np.uint8); img[..., 3] = 255
    for y in range(Hh):
        for x in range(Ww):
            ch = rows[y][x]; v = 0 if h3(x, y, 1) < 0.6 else (1 if h3(x, y, 1) < 0.85 else 2)
            if ch == 'V':
                t = AT['floor_void']; i = SLOT[mask(rows, x, y, lambda q: q == 'V')]
                tile = t[(i // COLS) * T:(i // COLS + 1) * T, (i % COLS) * T:(i % COLS + 1) * T, :3]
            elif ch == 'r':
                t = AT['floor_carpet']; i = SLOT[mask(rows, x, y, lambda q: q == 'r', oob=False)]
                tile = t[(i // COLS) * T:(i // COLS + 1) * T, (i % COLS) * T:(i % COLS + 1) * T, :3]
            elif ch == 'j':
                hz = (x > 0 and rows[y][x - 1] != 'V') or (x + 1 < Ww and rows[y][x + 1] != 'V')
                vert = not hz
                tile = G['plank_v' if vert else 'plank_h'][v]
            elif ch == 'i':
                tile = G['floor_stone'][v]
            else:
                tile = G['floor_wood'][v]
            img[y * T:(y + 1) * T, x * T:(x + 1) * T, :3] = tile
    im = Image.fromarray(img)
    sh, shb, H = wall
    objs = []
    for y in range(Hh):
        for x in range(Ww):
            if rows[y][x] == 'W':
                i = SLOT[mask(rows, x, y, lambda q: q == 'W')]
                s = shb if h3(x, y, 7) < 0.5 else sh
                objs.append(((y + 1) * T, x * T, s.crop(((i % 8) * T, (i // 8) * (T + H), (i % 8 + 1) * T, (i // 8 + 1) * (T + H))), 'tl_bottom'))
    for key, cx, cy in props:
        p = Image.open(OUT / 'sprites' / f'{key}.png'); spec = SPEC[key]
        if spec['layer'] == 'decal':
            im.alpha_composite(p, (int(cx * T), int(cy * T)))
        else:
            ax, ay = spec['anchor']; objs.append((int(cy * T), int(cx * T) - ax, p, ('a', ay)))
    for yb, x0, spr, mode in sorted(objs, key=lambda o: o[0]):
        y0 = yb - spr.size[1] if mode == 'tl_bottom' else yb - mode[1]
        im.alpha_composite(spr, (x0, max(0, y0)) if y0 >= 0 else (x0, 0), (0, 0 if y0 >= 0 else -y0))
    return im


def seam_check(G, AT):
    """같은 종류 변형끼리 경계 3px 동일 여부 + 오토타일을 임의 격자에 깔았을 때 이웃 칸 경계 색 차(평균 절대차)"""
    res = {}
    for n, vs in G.items():
        if n.startswith('plank'):
            continue
        same = all(np.array_equal(vs[0][:, :3], v[:, :3]) and np.array_equal(vs[0][:, -3:], v[:, -3:]) and np.array_equal(vs[0][:3], v[:3]) and np.array_equal(vs[0][-3:], v[-3:]) for v in vs[1:])
        wrap = float(np.abs(vs[0][:, 0].astype(int) - vs[0][:, -1].astype(int)).mean()), float(np.abs(vs[0][0].astype(int) - vs[0][-1].astype(int)).mean())
        res[n] = {'variant_edges_identical': bool(same), 'self_wrap_mean_absdiff_lr_tb': [round(wrap[0], 1), round(wrap[1], 1)]}
    return res


SPEC = {}

if __name__ == '__main__':
    SPEC.update(build_sprites())
    sheets = build_walls()
    G = build_ground()
    AT = build_autotiles(G)
    sheets['floor_carpet_l'] = {'file': f'{REL}/autotile/at47_floor_carpet.png', 'cell': [32, 32], 'kind': 'ground_at47', 'kit': 'L', 'base(outside)': 'floor_wood', 'over(inside)': 'carpet', 'masks_order': 'terrain_v3/autotile/at47_spec.json'}
    sheets['floor_void_l'] = {'file': f'{REL}/autotile/at47_floor_void.png', 'cell': [32, 32], 'kind': 'ground_at47', 'kit': 'L', 'base(outside)': 'floor(any)', 'over(inside)': 'void', 'masks_order': 'terrain_v3/autotile/at47_spec.json'}
    sheets['ground_l'] = {'file': f'{REL}/ground/l_ground_base.png', 'cell': [32, 32], 'kind': 'ground_base', 'kit': 'L', 'rows': [n for n, _ in GROUND], 'cols': 'variant v0 v1 v2 (가중 60/25/15 권장)'}
    seams = seam_check(G, AT)
    # 시험 렌더 2장: 서고 실내(벽·카펫·책상) / 허공·판자(ch104_s5)
    def load_map(f, code):
        d = json.load(open(ROOT / 'database/data' / f, encoding='utf-8'))
        def walk(n):
            if isinstance(n, dict):
                if 'code' in n and 'tiles' in n:
                    yield n; return
                for v in n.values():
                    yield from walk(v)
            elif isinstance(n, list):
                for v in n:
                    yield from walk(v)
        m = [x for x in walk(d) if x['code'] == code][0]
        return [''.join(r) if isinstance(r, list) else r for r in m['tiles']]
    wall = (Image.open(OUT / 'autotile/at47_wall_l_bookshelf.png'), Image.open(OUT / 'autotile/at47_wall_l_bookshelf_b.png'), WALLH)
    A = load_map('maps_main_a1.json', 'main_a1_4_counter')
    pa = [('l_reading_table', 2, 5), ('l_reading_table', 18, 5), ('l_counter', 5, 10), ('l_counter', 15, 10), ('l_candelabra', 3.5, 3), ('l_candelabra', 16.5, 3),
          ('l_book_pile_a', 6.5, 12), ('l_book_pile_b', 13.5, 12), ('l_lectern', 10, 9), ('l_pillar', 8.5, 4), ('l_pillar', 11.5, 4), ('l_book_chest', 2.5, 9)]
    r1 = render(A, G, AT, wall, pa)
    B = load_map('maps_scaleup_late.json', 'su_ch104_s5_last_shelf')
    pb = [('l_paper_flurry', 3, 3), ('l_float_isle_l', 30, 2), ('l_float_isle_s', 6, 16), ('l_stair_down', 16, 10), ('l_bookcase_toppled', 15, 13), ('l_scroll_rack', 20, 13),
          ('l_pillar_broken', 13.5, 13), ('l_candelabra', 22.5, 9)]
    r2 = render(B, G, AT, (Image.open(OUT / 'autotile/at47_wall_l_bookshelf_worn.png'), Image.open(OUT / 'autotile/at47_wall_l_bookshelf_worn_b.png'), WALLH), pb)
    x_up(r1, 2).save(PREV / 'test_main_a1_4_counter_x2.png'); x_up(r2, 2).save(PREV / 'test_su_ch104_s5_last_shelf_x2.png')
    # 접촉 시트
    names = list(SPEC)
    cw = 140; rows_n = (len(names) + 5) // 6
    cs = Image.new('RGBA', (6 * cw, rows_n * 120), tuple(C['D2']) + (255,)); dr = ImageDraw.Draw(cs)
    for n, k in enumerate(names):
        p = Image.open(OUT / 'sprites' / f'{k}.png'); p2 = x_up(p, 1)
        x, y = (n % 6) * cw + 4, (n // 6) * 120 + 4
        cs.alpha_composite(p2, (x, y + 14)); dr.text((x, y), k, fill=(255, 240, 200, 255))
    x_up(cs, 2).save(PREV / 'contact_sprites_x2.png')
    gs = Image.open(OUT / 'ground/l_ground_base.png')
    x_up(gs, 4).save(PREV / 'ground_base_x4.png')
    for nm in ('floor_carpet', 'floor_void'):
        x_up(Image.open(OUT / f'autotile/at47_{nm}.png'), 2).save(PREV / f'at47_{nm}_x2.png')
    (OUT / 'kit_L_spec.json').write_text(json.dumps({'_note': '서고 실내(L) 키트 명세(안아트 2026-11-08). 생성 docker/gemini/library_kit_gen.mjs + library_kit_pp.py', 'sprites': SPEC, 'sheets': sheets, 'seam_check': seams}, indent=1, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(seams, ensure_ascii=False)); print(len(SPEC), 'sprites', list(sheets))
