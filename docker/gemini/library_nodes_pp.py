# 잊힌 서고 지도 노드 아이콘·소품 후처리(안아트 2026-11-14, API 호출 없음)
# raw/n1.jpg(3열x4행 노드 시트) · raw/n2.jpg(3열x2행 소품 시트) -> 마젠타 키 알파 + 디스필 + 열린 문 분홍 번짐 금빛 보정
#   -> 같은 종류의 상태끼리 합집합 bbox 로 같은 축척·같은 위치(바닥 가운데 기준) 정렬 -> 어두운 외곽선 + 옅은 금빛 외곽 링 -> PNG @1x/@2x
# 실행(저장소 루트): python docker/gemini/library_nodes_pp.py
# 산출: public/assets/maps/library/nodes/*.png, docker/gemini/library_nodes/library_nodes_qa.json, preview/*.jpg
import json, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

RAW = 'docker/gemini/library_nodes/raw'; OUT = 'public/assets/maps/library/nodes'; PRE = 'docker/gemini/library_nodes/preview'
os.makedirs(OUT, exist_ok=True); os.makedirs(PRE, exist_ok=True)
OUTLINE = (30, 19, 11)       # 어두운 외곽선(배경 윤곽선 톤)
RING = (240, 213, 140)       # COLOR.accentLight 계열 옅은 금빛 외곽 링
PAD = 0.04

def key_sheet(path):
    c = np.asarray(Image.open(path).convert('RGB'), np.float32)
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    m = np.minimum(R, B) - G                          # 마젠타 정도
    strong = (m > 120) & (R > 170) & (B > 170)
    lbl, _ = ndi.label(strong)                        # 테두리와 연결된 마젠타만 배경(안쪽 분홍 빛은 보존 후 재색)
    el = np.unique(np.concatenate([lbl[0], lbl[-1], lbl[:, 0], lbl[:, -1]])); el = el[el > 0]
    bg = np.isin(lbl, el) | ((m > 150) & (R > 200) & (B > 200) & (G < 80))   # 닫힌 구멍(손잡이 고리 안 등)의 순수 마젠타도 배경
    bg = ndi.binary_closing(bg, iterations=1) | bg
    near = ndi.binary_dilation(bg, iterations=3) & ~bg
    a = np.where(bg, 0.0, 1.0)
    # 경계 띠: 마젠타 혼합 비율로 부드러운 알파(m 30 이하 = 불투명, 150 이상 = 투명)
    a = np.where(near, np.clip((150 - m) / 120, 0, 1), a)
    # 디스필: R·B 가 G 보다 같이 높은 만큼 깎음(경계 띠는 강하게)
    sp = np.clip(m, 0, None) * np.where(near, 1.0, 0.6) * (m > 6)
    rgb = c.copy(); rgb[..., 0] -= sp; rgb[..., 2] -= sp
    return np.clip(rgb, 0, 255), a, c

def warm_pink(rgb, a, box, src):
    """열린 문 안쪽 빛이 마젠타와 섞여 분홍이 된 곳 -> 같은 밝기의 금빛으로 재색(판정은 디스필 전 원본 색)"""
    x0, y0, x1, y1 = box; sub = rgb[y0:y1, x0:x1]; o = src[y0:y1, x0:x1]; R, G, B = o[..., 0], o[..., 1], o[..., 2]
    r2, g2, b2 = sub[..., 0], sub[..., 1], sub[..., 2]
    pink = (((B > G + 2) & (R > G + 2) & ((R + G + B) / 3 > 110)) | ((r2 - g2 > 45) & (b2 > g2 - 25) & (r2 > 190))) & (a[y0:y1, x0:x1] > 0)   # 원본 분홍 + 디스필 뒤 남은 연어색
    lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255
    gold_lo = np.array([150, 95, 35], np.float32); gold_hi = np.array([255, 236, 180], np.float32)
    t = np.clip((lum - 0.25) / 0.6, 0, 1)[..., None]
    sub[pink] = (gold_lo + (gold_hi - gold_lo) * t)[pink]

def cell(rgb, a, cols, rows, i):
    """시트 전체에서 연결 요소를 라벨링해 무게중심이 이 칸에 있는 요소만 남김(옆 칸 물체가 칸 경계를 넘어 들어온 조각 제거). 출력은 칸을 위아래 20% 넓힌 창"""
    H, W = a.shape; cw, ch = W / cols, H / rows; c, r = i % cols, i // cols
    lbl, n = ndi.label(a > 0.5)
    cy, cx = np.array(ndi.center_of_mass(np.ones_like(a), lbl, range(1, n + 1))).T
    sz = ndi.sum(np.ones_like(a), lbl, range(1, n + 1))
    inside = (cx >= c * cw) & (cx < (c + 1) * cw) & (cy >= r * ch) & (cy < (r + 1) * ch)
    big = sz[inside].max() if inside.any() else 1
    keep = np.isin(lbl, 1 + np.flatnonzero(inside & (sz >= big * 0.02)))
    x0, x1 = int(max(0, c * cw - cw * 0.2)), int(min(W, (c + 1) * cw + cw * 0.2)); y0, y1 = int(max(0, r * ch - ch * 0.2)), int(min(H, (r + 1) * ch + ch * 0.2))
    aa = a[y0:y1, x0:x1] * ndi.binary_dilation(keep, iterations=3)[y0:y1, x0:x1]
    return np.dstack([rgb[y0:y1, x0:x1], aa * 255]).astype(np.uint8)

def bbox(arr):
    ys, xs = np.nonzero(arr[..., 3] > 20); return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

def place(arrs, size, ring=True, rings=None):
    """같은 종류의 상태 이미지 묶음 -> 합집합 bbox 로 같은 축척, 바닥 가운데 정렬, size x size"""
    bx = [bbox(x) for x in arrs]; X0 = min(b[0] for b in bx); Y0 = min(b[1] for b in bx); X1 = max(b[2] for b in bx); Y1 = max(b[3] for b in bx)
    S = 1024; inner = S * (1 - 2 * PAD - 0.03); sc = inner / max(X1 - X0, Y1 - Y0)
    res = []
    for j, x in enumerate(arrs):
        im = Image.fromarray(x[Y0:Y1, X0:X1], 'RGBA')
        w, h = round((X1 - X0) * sc), round((Y1 - Y0) * sc)
        im = premul_resize(im, (w, h))
        cv = Image.new('RGBA', (S, S), (0, 0, 0, 0)); cv.alpha_composite(im, ((S - w) // 2, S - h - int(S * PAD)))
        cv = add_edge(cv, (rings[j] if rings else 0.45) if ring else 0)
        res.append({sz: premul_resize(cv, (sz, sz)) for sz in size})
    return res

def premul_resize(im, wh):
    a = np.asarray(im, np.float32) / 255; pm = a.copy(); pm[..., :3] *= pm[..., 3:4]
    r = np.asarray(Image.fromarray((pm * 255 + .5).astype(np.uint8), 'RGBA').resize(wh, Image.LANCZOS), np.float32) / 255
    al = r[..., 3:4]; rgb = np.where(al > 0.004, r[..., :3] / np.maximum(al, 1e-3), 0)
    return Image.fromarray((np.clip(np.dstack([rgb, al]), 0, 1) * 255 + .5).astype(np.uint8), 'RGBA')

def add_edge(im, ring):
    """1024 작업 해상도에서: 어두운 외곽선(약 10px = @2x 에서 약 1.5px) + 옅은 금빛 외곽 링(바깥 약 14px, 알파 0.45 에서 바깥으로 감쇠)"""
    a = np.asarray(im, np.float32)[..., 3] / 255
    solid = a > 0.5
    d_out = ndi.distance_transform_edt(~solid)
    stroke = np.clip((11 - d_out) / 2, 0, 1)                 # 0~10px 진한 선, 끝 2px 부드럽게
    base = np.zeros(a.shape + (4,), np.float32)
    if ring:
        rg = np.clip((26 - d_out) / 16, 0, 1) * ring * (d_out > 0)
        base[..., :3] = RING; base[..., 3] = rg
    # 외곽선 합성(over)
    sa = stroke; ba = base[..., 3]
    oa = sa + ba * (1 - sa); oc = (np.array(OUTLINE, np.float32) * sa[..., None] + base[..., :3] * (ba * (1 - sa))[..., None]) / np.maximum(oa, 1e-4)[..., None]
    under = Image.fromarray(np.dstack([oc, oa * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
    under.alpha_composite(im); return under

def save(im, name):
    p = f'{OUT}/{name}.png'; im.save(p, 'PNG', optimize=True); return p

# ---- 노드 시트 ----
rgb, a, src = key_sheet(f'{RAW}/n1.jpg')
H, W = a.shape; cw, ch = W // 3, H // 4
warm_pink(rgb, a, (cw, 3 * ch, 2 * cw, H), src)        # 행4 열2 = 열린 문
C = lambda i: cell(rgb, a, 3, 4, i)
SPEC = {  # kind: (셀 번호들, 상태 이름, @1x 크기)
    'book': ([0, 1, 2], ['normal', 'locked', 'cleared'], 64),
    'shelf': ([3, 4, 5], ['normal', 'locked', 'cleared'], 96),   # 보스 서가: 뒷벽 서가 앞에 놓여 배경과 비슷 -> 크게 + 링 1.3배
    'desk': ([6, 7, 8], ['normal', 'locked', 'cleared'], 72),
    'door': ([9, 10], ['closed', 'open'], 72),
}
files = {}
for kind, (cells, states, s1) in SPEC.items():
    RINGS = {'normal': 0.45, 'locked': 0.22, 'cleared': 0.85, 'closed': 0.45, 'open': 0.85}   # 금빛 외곽 링: 잠김 약하게, 완료·열림 강하게(작은 크기에서 상태 구분)
    outs = place([C(i) for i in cells], [s1, s1 * 2], rings=[min(1.0, RINGS[t] * (1.3 if kind == 'shelf' else 1)) for t in states])
    for st, o in zip(states, outs):
        files[f'{kind}.{st}'] = {'1x': save(o[s1], f'{kind}_{st}'), '2x': save(o[s1 * 2], f'{kind}_{st}@2x'), 'size': s1}

# ---- 소품 시트(외곽 링 없음: 장식이 노드보다 눈에 띄지 않게, 외곽선만) ----
rgb2, a2, _ = key_sheet(f'{RAW}/n2.jpg')
PROPS = ['book_float', 'candle', 'scroll', 'book_stack', 'quill_ink', 'lantern']
for i, nm in enumerate(PROPS):
    o = place([cell(rgb2, a2, 3, 2, i)], [48, 96], ring=False)[0]
    files[f'prop.{nm}'] = {'1x': save(o[48], f'prop_{nm}'), '2x': save(o[96], f'prop_{nm}@2x'), 'size': 48}

# ---- QA: 잔여 마젠타, 시트 미리보기(어두운·밝은 판), 노드 위치 합성, 대비 ----
def rl(c):
    c = np.asarray(c, np.float64) / 255; c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4); return c @ [0.2126, 0.7152, 0.0722]
cr = lambda l1, l2: (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
qa = {'files': {}, 'nodes': []}
for k, f in files.items():
    x = np.asarray(Image.open(f['2x']), np.float32); al = x[..., 3]; vis = al > 40
    R, G, B = x[..., 0], x[..., 1], x[..., 2]
    mag = int(((np.minimum(R, B) - G > 40) & (R > 150) & (B > 150) & vis).sum())
    qa['files'][k] = {'2x': f['2x'], 'bytes_1x': os.path.getsize(f['1x']), 'bytes_2x': os.path.getsize(f['2x']), 'magenta_px': mag, 'opaque_frac': round(float((al > 200).mean()), 3)}

# 1) 판 미리보기: 서고 4개 바닥색 + 어두운 판
tiles = [(28, 20, 14), (215, 190, 150), (225, 175, 90), (70, 150, 150), (150, 70, 55), (150, 110, 210)]
keys = list(files)
sheet = Image.new('RGB', (len(tiles) * 160, len(keys) * 0 + ((len(keys) + 0) * 0) + 160 * len(keys) // 1), (0, 0, 0))
sheet = Image.new('RGB', (len(tiles) * 150, len(keys) * 150))
for r, k in enumerate(keys):
    ic = Image.open(files[k]['2x']).convert('RGBA'); ic = ic.resize((min(144, ic.width), min(144, ic.height)), Image.LANCZOS) if ic.width > 144 else ic
    for c, t in enumerate(tiles):
        bgc = Image.new('RGBA', (150, 150), t + (255,)); bgc.alpha_composite(ic, ((150 - ic.width) // 2, (150 - ic.height) // 2)); sheet.paste(bgc.convert('RGB'), (c * 150, r * 150))
sheet.save(f'{PRE}/tiles_check.jpg', quality=86)

# 2) 노드 위치 합성(1760x800 배경, @1x 크기 = 지도 높이 800 기준 실표시 근사). 상태 연출: 로비 cleared, 1막 cleared 3 + current, 2~4막 locked + 남색 안개 0.5
P = json.load(open('resources/js/game/data/library_map_profile.json', encoding='utf8'))
bgim = Image.open('public/assets/maps/library/library_base_1760.webp').convert('RGBA'); BW, BH = bgim.size
fog = Image.new('RGBA', bgim.size, (0, 0, 0, 0)); fd = ImageDraw.Draw(fog)
kindmap = {'book': 'book', 'boss': 'shelf', 'desk': 'desk', 'door': 'door'}
state_of = {}
for s in P['stages']:
    c = s['stage_code']
    if c.startswith('stage_'): st = 'cleared'
    elif c.startswith('ch101'): st = 'cleared' if c[-1] in '12' else ('normal' if c[-1] == '3' else 'locked')
    else: st = 'locked'
    state_of[c] = st
comp = bgim.copy(); sh = ImageDraw.Draw(comp, 'RGBA')
lum_bg = np.asarray(bgim.convert('RGB'), np.float64)
for s in P['stages']:
    k = kindmap[s['node']]; st = state_of[s['stage_code']]
    if k == 'door': st = 'open' if st == 'cleared' else 'closed'
    if k in ('book', 'shelf', 'desk') and st not in ('normal', 'locked', 'cleared'): st = 'normal'
    ic = Image.open(files[f'{k}.{st}']['1x']).convert('RGBA')
    x, y = s['map']['pin']['x'] * BW, s['map']['pin']['y'] * BH
    sh.ellipse([x - ic.width * 0.36, y - 5, x + ic.width * 0.36, y + 5], fill=(11, 16, 32, 115))   # 코드 바닥 그림자 근사
    comp.alpha_composite(ic, (int(x - ic.width / 2), int(y - ic.height * (1 - PAD))))
    # 대비: 아이콘 외곽선 고리(아이콘 바깥 2px) vs 주변 배경 / 아이콘 평균 vs 주변 배경
    ia = np.asarray(ic, np.float64); m = ia[..., 3] > 128
    x0, y0 = int(x - ic.width / 2), int(y - ic.height * (1 - PAD))
    patch = lum_bg[max(0, y0):y0 + ic.height, max(0, x0):x0 + ic.width]
    mm = m[:patch.shape[0], :patch.shape[1]]
    bgL = rl(patch[~mm].mean(0)); icL = rl(ia[..., :3][m].mean(0))
    qa['nodes'].append({'stage': s['stage_code'], 'kind': k, 'state': st, 'bg_lum': round(float(bgL), 3), 'icon_lum': round(float(icL), 3), 'cr_icon_bg': round(cr(bgL, icL), 2), 'cr_outline_bg': round(cr(bgL, rl(OUTLINE)), 2)})
for z in P['zones']:
    if z['chapter'] in (102, 103, 104):
        r = z['rect']; fd.rounded_rectangle([r[0] * BW, r[1] * BH, r[2] * BW, r[3] * BH], 8, fill=(11, 16, 32, 128))
comp_fog = comp.copy(); comp_fog.alpha_composite(fog)
comp.convert('RGB').save(f'{PRE}/nodes_on_map.jpg', quality=88)
comp_fog.convert('RGB').save(f'{PRE}/nodes_on_map_fog.jpg', quality=88)
# 소품 배치 시험(구역 장식 위치 예: 바닥 가장자리)
pm = comp.copy()
for i, (nm, px, py) in enumerate([('book_float', 0.29, 0.16), ('candle', 0.405, 0.88), ('scroll', 0.47, 0.9), ('book_stack', 0.6, 0.72), ('quill_ink', 0.79, 0.88), ('lantern', 0.835, 0.14)]):
    ic = Image.open(files[f'prop.{nm}']['1x']).convert('RGBA'); pm.alpha_composite(ic, (int(px * BW - 24), int(py * BH - 44)))
pm.convert('RGB').save(f'{PRE}/props_on_map.jpg', quality=88)
json.dump(qa, open('docker/gemini/library_nodes/library_nodes_qa.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(json.dumps({k: v['magenta_px'] for k, v in qa['files'].items()}))
print('min cr_icon_bg', min(n['cr_icon_bg'] for n in qa['nodes']), 'min cr_outline_bg', min(n['cr_outline_bg'] for n in qa['nodes']))
