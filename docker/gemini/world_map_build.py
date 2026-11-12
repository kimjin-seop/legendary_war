# 캠페인(서가) 선택 화면 세계지도 베이스 절차 생성기.
# 해안 정합 우선: 해안선/호수/강/산맥·사막 폴리곤은 Natural Earth(퍼블릭 도메인) 데이터(docker/gemini/world_map_data/)를
# 등장방형(x=(lon+180)/360, y=(90-lat)/180)으로 그대로 래스터화한다. 이미지 생성 모델은 해안을 그리지 않는다.
# 톤: 따뜻한 오렌지~황토 양피지/가죽 육지(번짐·갈라짐 질감), 올리브 녹색 산악/숲 얼룩, 옅은 민트/청백 수채 안개 바다.
# 글자·국경·라벨·도로선 없음(라벨/도로/핀은 FE 코드 드로잉).
# 사용: python -X utf8 docker/gemini/world_map_build.py <W> <out_path> [--verify docker/gemini/world_map_preview/<name>.webp(접미 _full.jpg/_zoom.jpg 로 저장)] [--q 80]
import json, sys, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'world_map_data')

# ---- 팔레트(지도 전용; UI 패널은 style_guide.mjs UISKIN_PAL 유지) ----
PAL = {
    'land_hi':   (233, 178, 104),   # 밝은 황토
    'land_mid':  (214, 146, 74),    # 오렌지 황토
    'land_lo':   (176, 108, 52),    # 짙은 가죽
    'land_edge': (128, 74, 36),     # 해안 번짐(번트 시에나)
    'coast':     (104, 60, 30),     # 해안선
    'desert':    (238, 200, 134),   # 사막 밝은 모래
    'olive':     (118, 128, 66),    # 숲/산 올리브
    'olive_dk':  (78, 88, 44),      # 산 능선 그늘
    'sea_hi':    (226, 238, 228),   # 연안 청백 안개
    'sea_mid':   (196, 222, 210),   # 민트
    'sea_lo':    (166, 198, 192),   # 먼 바다 청회
    'river':     (112, 150, 136),
}

def proj(lon, lat, W, H):
    return ((lon + 180.0) / 360.0 * W, (90.0 - lat) / 180.0 * H)

def load(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as f:
        return json.load(f)['features']

def rings(geom):
    t = geom['type']
    if t == 'Polygon':
        yield geom['coordinates']
    elif t == 'MultiPolygon':
        for p in geom['coordinates']:
            yield p

def raster_polys(features, W, H, filt=None, ss=1):
    img = Image.new('L', (W * ss, H * ss), 0)
    d = ImageDraw.Draw(img)
    for ft in features:
        if filt and not filt(ft['properties']):
            continue
        for poly in rings(ft['geometry']):
            for i, ring in enumerate(poly):
                pts = [proj(x, y, W * ss, H * ss) for x, y, *_ in ring]
                if len(pts) >= 3:
                    d.polygon(pts, fill=255 if i == 0 else 0)
    if ss > 1:
        img = img.resize((W, H), Image.LANCZOS)
    return img

def a(img):
    return np.asarray(img, dtype=np.float32) / 255.0

def blur(img, r):
    return img.filter(ImageFilter.GaussianBlur(r))

def blur_big(img, r, W):
    # 큰 반경은 축소→블러→확대로 근사
    s = 4 if r > 12 else 1
    small = img.resize((img.width // s, img.height // s), Image.BILINEAR)
    return blur(small, r / s).resize(img.size, Image.BILINEAR)

def fbm(H, W, seed, base=8, octaves=6, persist=0.55):
    rng = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        gw = base * (2 ** o); gh = max(2, gw // 2)
        g = rng.random((gh, gw)).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        out += a(im) * amp; tot += amp; amp *= persist
    return out / tot

def ridged(H, W, seed, base=24, octaves=4):
    n = fbm(H, W, seed, base, octaves, 0.5)
    return 1.0 - np.abs(n - 0.5) * 2.0   # 0.5 등고선 근처가 1 → 갈라진 선

def mix(c1, c2, t):
    c1 = np.array(c1, np.float32) / 255; c2 = np.array(c2, np.float32) / 255
    t = t[..., None]
    return c1 * (1 - t) + c2 * t

def over(base, color, alpha):
    c = np.array(color, np.float32) / 255 if not isinstance(color, np.ndarray) else color
    al = np.clip(alpha, 0, 1)[..., None]
    return base * (1 - al) + c * al

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

# 손으로 입력한 보조 요소(Natural Earth 50m 에 없는 강) — 좌표 근사, verify
YALU = [(124.35, 39.85), (124.40, 40.08), (124.90, 40.45), (125.40, 40.65), (126.00, 40.95), (126.30, 41.15),
        (126.90, 41.55), (127.50, 41.45), (128.15, 41.40), (128.10, 41.95)]
RIVER_NAMES = {'Chang Jiang', 'Yangtze', 'Jinsha', 'Huang', 'Nile', 'Rosetta Branch', 'Damietta Branch', 'El Bahr el Abyad',
               'El Bahr el Azraq', 'Euphrates', 'Firat', 'Al Furat', 'Tigris', 'Dicle', 'Shatt al Arab', 'Danube', 'Donau',
               'Rhine', 'Rhein', 'Rhin', 'Loire', 'Seine', 'Rhône', 'Po', 'Volga', 'Indus', 'Ganges', 'Amu  Darya',
               'Syr Darya', 'Amur', 'Heilong Jiang', 'Dnepre', 'Dnipro', 'Don', 'Tajo', 'Tejo', 'Ebro', 'Elbe', 'Vistula',
               'Niger', 'Mekong', 'Liao', 'Xi', 'Hong', 'Tarim', 'Ob', 'Irtysh', 'Ertis', 'Yenisey', 'Lena', 'Jordan'}

# 숲 얼룩(대략 위치, 타원: lon, lat, rlon, rlat) — 데이터가 아닌 미술적 배치
FORESTS = [(15, 50, 14, 5), (30, 56, 18, 5), (60, 59, 22, 4), (95, 60, 28, 5), (128, 56, 14, 5), (127.5, 37.5, 2.2, 2.5),
           (126.5, 41.2, 3.5, 1.6), (113, 27, 9, 4), (104, 24, 5, 4), (137, 36.5, 4, 2.5), (-1, 47, 4, 3), (8, 46.5, 4, 1.8),
           (23, 1, 10, 6), (100, 15, 6, 6), (78, 24, 6, 4), (44, 41.5, 4, 1.4), (-75, 0, 14, 8), (-85, 45, 14, 6)]

def build(W, out, verify=None, q=80):
    H = W // 2
    sc = W / 2048.0
    land_f = load('ne_10m_land.geojson' if W > 2048 else 'ne_50m_land.geojson')
    lakes_f = load('ne_50m_lakes.geojson')
    reg_f = load('ne_10m_geography_regions_polys.geojson')
    riv_f = load('ne_50m_rivers_lake_centerlines.geojson')

    land_img = raster_polys(land_f, W, H, ss=2)
    lakes_img = raster_polys(lakes_f, W, H, filt=lambda p: (p.get('scalerank') or 9) <= 4, ss=2)
    land = np.clip(a(land_img) - a(lakes_img), 0, 1)
    land_img = Image.fromarray((land * 255).astype(np.uint8))
    mtn = a(blur(raster_polys(reg_f, W, H, filt=lambda p: p.get('FEATURECLA') == 'Range/mtn'), 3 * sc))
    desert = a(blur(raster_polys(reg_f, W, H, filt=lambda p: p.get('FEATURECLA') == 'Desert'), 5 * sc))
    plateau = a(blur(raster_polys(reg_f, W, H, filt=lambda p: p.get('FEATURECLA') == 'Plateau'), 6 * sc))
    forest_img = Image.new('L', (W, H), 0); fd = ImageDraw.Draw(forest_img)
    for lon, lat, rl, rt in FORESTS:
        x0, y0 = proj(lon - rl, lat + rt, W, H); x1, y1 = proj(lon + rl, lat - rt, W, H)
        fd.ellipse([x0, y0, x1, y1], fill=255)
    forest = a(blur(forest_img, 18 * sc))

    yy = np.linspace(90, -90, H, dtype=np.float32)[:, None] * np.ones((1, W), np.float32)
    xx = np.ones((H, 1), np.float32) * np.linspace(-180, 180, W, dtype=np.float32)[None, :]

    n1 = fbm(H, W, 11, 6, 7)          # 큰 얼룩
    n2 = fbm(H, W, 23, 32, 5)         # 중간 결
    n3 = fbm(H, W, 37, 128, 3, 0.6)   # 고운 입자
    cr = ridged(H, W, 41, 20, 4)      # 갈라짐
    cr2 = ridged(H, W, 53, 48, 3)

    # 거리 근사(육지 안쪽/바다 쪽)
    in_near = a(blur(land_img, 2.5 * sc)); in_mid = a(blur_big(land_img, 10 * sc, W)); in_far = a(blur_big(land_img, 40 * sc, W))
    edge_in = np.clip((land - in_mid) * 2.2, 0, 1) * land     # 해안 안쪽 번짐 밴드
    sea_glow = np.clip(in_mid * 2.0, 0, 1) * (1 - land)        # 연안 바다의 밝은 띠
    sea_far = 1 - np.clip(in_far * 2.5, 0, 1)

    # --- 텍스처(이미지 모델 생성 면 텍스처, 해안 형태 없음) ---
    TEX = os.path.join(ROOT, 'world_map_raw', 'tex')
    tl = a(Image.open(os.path.join(TEX, 'land.jpg')).convert('RGB').resize((W, H), Image.BICUBIC))
    ts = a(Image.open(os.path.join(TEX, 'sea.jpg')).convert('RGB').resize((W, H), Image.BICUBIC))
    # 바다 텍스처를 살짝 밝히고 채도 낮춤(대비 낮게)
    sg = ts.mean(axis=2, keepdims=True)
    ts = ts * 0.8 + sg * 0.2
    sea = ts * 0.92 + 0.08
    sea = over(sea, PAL['sea_hi'], np.clip(sea_glow * 0.7, 0, 1))
    sea = over(sea, PAL['sea_lo'], sea_far * 0.18)

    # --- 육지: 생성 텍스처(황토 가죽) + 절차 레이어 ---
    landc = tl.copy()
    landc = over(landc, PAL['desert'], desert * (0.35 + 0.35 * smooth(0.35, 0.65, n2)))
    landc = over(landc, PAL['land_lo'], plateau * 0.18 * smooth(0.4, 0.7, n2))
    fmask = np.clip(forest * smooth(0.42, 0.62, n2 * 0.6 + n1 * 0.4), 0, 1) * 0.5
    mtn_wide = a(blur_big(Image.fromarray((mtn * 255).astype(np.uint8)), 9 * sc, W))
    mmask = np.clip(smooth(0.08, 0.45, mtn_wide * (0.6 + 0.8 * n2)), 0, 1) * 0.55
    landc = over(landc, PAL['olive'], np.maximum(fmask, mmask))
    # 산악 입체(힐셰이드): 산맥 마스크 + 능선 노이즈로 높이장, 광원 왼쪽 위
    crh = ridged(H, W, 71, int(96 * sc) // 2 * 2 or 96, 3)
    hgt = np.clip(np.maximum(mtn, mtn_wide * 0.8) * (0.25 + 0.75 * crh ** 2.0), 0, 1)
    hgt = np.asarray(blur(Image.fromarray((hgt * 255).astype(np.uint8)), 0.8 * sc), np.float32) / 255.0
    gy, gx = np.gradient(hgt)
    k = 60.0 / sc
    shade = np.clip(-(gx + gy) * k, -1, 1)
    landc = over(landc, (250, 236, 200), np.clip(shade, 0, 1) * 0.30)
    landc = over(landc, PAL['olive_dk'], np.clip(-shade, 0, 1) * 0.45)
    landc = over(landc, PAL['land_edge'], edge_in * (0.5 + 0.3 * n2))

    # 강
    rv = Image.new('L', (W, H), 0); rd = ImageDraw.Draw(rv)
    for ft in riv_f:
        p = ft['properties']
        if (p.get('name') or '') not in RIVER_NAMES:
            continue
        g = ft['geometry']; lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        wdt = max(1, round((2.0 if (p.get('scalerank') or 6) <= 2 else 1.4) * sc))
        for ln in lines:
            rd.line([proj(x, y, W, H) for x, y, *_ in ln], fill=255, width=wdt, joint='curve')
    rd.line([proj(x, y, W, H) for x, y in YALU], fill=255, width=max(1, round(1.4 * sc)), joint='curve')
    river = a(blur(rv, 0.6 * sc)) * land
    landc = over(landc, PAL['river'], river * 0.75)

    # 해안선(얇은 갈색) + 바다 쪽 아주 옅은 번짐
    er = land_img.filter(ImageFilter.MinFilter(3 if W <= 2048 else 5))
    coast = np.clip(land - a(er), 0, 1)
    coast = a(blur(Image.fromarray((coast * 255).astype(np.uint8)), 0.7 * sc))
    bleed = np.clip((in_near - land) * 1.6, 0, 1)

    img = sea * (1 - land[..., None]) + landc * land[..., None]
    img = over(img, PAL['land_edge'], bleed * 0.35)
    img = over(img, PAL['coast'], coast * 0.7)

    # 아메리카·극지방 흐림(서가 후보 없음): 안개로 덮어 가장자리 정도만
    fog = np.clip(smooth(-25, -60, xx) * 0.78 + smooth(68, 85, yy) * 0.55 + smooth(-50, -68, yy) * 0.7, 0, 0.85)
    fog = fog * (0.85 + 0.3 * (n1 - 0.5))
    img = over(img, PAL['sea_hi'], fog)
    # 종이 비네팅(가장자리 살짝 어둡게)
    vx = np.abs(xx / 180.0); vy = np.abs(yy / 90.0)
    vig = smooth(0.75, 1.0, np.maximum(vx, vy)) * 0.18
    img = img * (1 - vig[..., None] * 0.6)

    out_img = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGB')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    out_img.save(out, 'WEBP', quality=q, method=6)
    print(out, os.path.getsize(out), 'bytes')
    if verify:
        make_verify(out_img, verify)
    return out_img

VERIFY_PTS = [  # (이름, lat, lon) — 대표 5지점 + 보조
    ('Seoul', 37.57, 126.98), ('Luoyang', 34.62, 112.45), ('Wuhan(Yangtze mid)', 30.59, 114.30),
    ('Carthage', 36.86, 10.32), ('Orleans', 47.90, 1.90), ('Kyoto', 35.01, 135.77),
    ('Yalu mouth', 39.85, 124.35), ('Rome', 41.90, 12.50), ('Mosul', 36.34, 43.13), ('Jerusalem', 31.78, 35.22),
    ('Samarkand', 39.65, 66.96),
]

def make_verify(img, path):
    W, H = img.size
    v = img.copy(); d = ImageDraw.Draw(v)
    # 경위선 10도 격자
    for lon in range(-180, 181, 10):
        x = (lon + 180) / 360 * W; d.line([(x, 0), (x, H)], fill=(60, 60, 140) if lon % 30 else (30, 30, 200), width=1)
    for lat in range(-90, 91, 10):
        y = (90 - lat) / 180 * H; d.line([(0, y), (W, y)], fill=(60, 60, 140) if lat % 30 else (30, 30, 200), width=1)
    s = max(6, W // 300)
    for name, lat, lon in VERIFY_PTS:
        x, y = proj(lon, lat, W, H)
        d.line([(x - s, y), (x + s, y)], fill=(220, 0, 0), width=2); d.line([(x, y - s), (x, y + s)], fill=(220, 0, 0), width=2)
    v.save(path.replace('.webp', '_full.jpg'), 'JPEG', quality=85)
    # 지역 확대 크롭(4배): 한반도·일본, 중국 중부, 지중해 중부, 프랑스, 메소포타미아·레반트, 중앙아시아
    crops = [('korea_japan', 122, 142, 44, 30), ('china_mid', 104, 124, 40, 26), ('med_central', 2, 22, 46, 32),
             ('france', -6, 10, 52, 42), ('mesopotamia_levant', 30, 50, 42, 28), ('central_asia', 50, 90, 52, 34)]
    tiles = []
    for nm, l0, l1, t0, t1 in crops:
        x0, y0 = proj(l0, t0, W, H); x1, y1 = proj(l1, t1, W, H)
        c = v.crop((int(x0), int(y0), int(x1), int(y1)))
        c = c.resize((600, int(600 * c.height / c.width)), Image.NEAREST if W <= 2048 else Image.BICUBIC)
        tiles.append(c)
    th = max(t.height for t in tiles)
    sheet = Image.new('RGB', (600 * 3 + 20, th * 2 + 30), (20, 20, 20))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % 3) * 610, (i // 3) * (th + 10)))
    sheet.save(path.replace('.webp', '_zoom.jpg'), 'JPEG', quality=88)

if __name__ == '__main__':
    W = int(sys.argv[1]); out = sys.argv[2]
    ver = sys.argv[sys.argv.index('--verify') + 1] if '--verify' in sys.argv else None
    q = int(sys.argv[sys.argv.index('--q') + 1]) if '--q' in sys.argv else 80
    build(W, out, ver, q)
