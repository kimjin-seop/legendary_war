# 시즌 전쟁 화면 UI 에셋(호출 없음, 안아트 2026-11-04 — 사용자 시안 images/65.png, 팀장 전달)
#   재사용·후처리만: map.battle.imjin_battle(+landmask) · map.world.ui.chip_frame/ripple_ring · map.icon.palace_hall · ui.flag.joseon · bg.imjin.night_sea
#   사용자 정정: '수도(승리 조건)' 핀·범례 제외 → 거점 핀은 major / normal 2종 + selected
# 출력 public/assets/ui/season/** + 조각 manifest_fragment_season_ui.json + 거점 표 season_map_nodes.json
# 실행(docker python:3.12 + pylib_b): python -X utf8 docker/gemini/season_ui_pp.py
import json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
from scipy import ndimage
A = 'public/assets'; O = f'{A}/ui/season'; os.makedirs(O, exist_ok=True); os.makedirs(f'{O}/cell', exist_ok=True)
items = []; GEN = {'script': 'docker/gemini/season_ui_pp.py(후처리·벡터 드로잉만)', 'calls': 0}
def add(key, path, extra):
    im = Image.open(path); items.append({'key': key, 'path': path.replace('public/', ''), 'type': 'image', 'size': list(im.size), 'alpha': im.mode in ('RGBA', 'LA', 'L'), 'format': path.rsplit('.', 1)[1],
                                         'bytes': os.path.getsize(path), 'scope': 'lazy', 'generator': GEN, 'license': '자체 생성 에셋 재가공', **extra})
def save2(im, name, key, extra, fmt='png'):
    p2 = f'{O}/{name}@2x.{fmt}'; p1 = f'{O}/{name}.{fmt}'
    kw = dict(quality=88, method=6, alpha_quality=95) if fmt == 'webp' else dict(optimize=True)
    im.save(p2, **kw); im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(p1, **kw)
    add(key, p2, {'scale': '@2x', 'display': [im.width // 2, im.height // 2], 'variants': {'x1': p1.replace('public/', '')}, **extra})
SS = 4  # 벡터 드로잉 초표본
def hexc(h, a=255): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)
BLUE, RED, GRAY, GOLD, GOLD_D, INK = '#2E6FD8', '#C8322E', '#6B7280', '#E9B649', '#8A5A14', '#14182A'
# ---------- 1) 지도: 한반도 크롭(경도 124.3~130.2, 위도 34.0~42.4), 바다 투명, 어두운 전장 톤 + 금빛 해안 ----------
B = json.load(open(f'{A}/map_world/regional/imjin_battle_v2_bounds.json', encoding='utf-8')); g = B['geo']; ppd = 240
LON0, LON1, LAT0, LAT1 = 124.3, 130.2, 33.0, 42.4   # 2026-11-04 r2: 서버 거점(제주 33.5·쓰시마 34.2) 포함하도록 남쪽 확장
def px(lon, lat): return ((lon - g['lonMin']) * ppd, (g['latMax'] - lat) * ppd)
x0, y0 = px(LON0, LAT1); x1, y1 = px(LON1, LAT0); box = tuple(int(round(v)) for v in (x0, y0, x1, y1))
src = Image.open(f'{A}/map_world/regional/imjin_battle_v2_1728.webp').convert('RGB').crop(box)
lm = Image.open(f"public/{B['landmask']['desktop']['path']}").getchannel('A').crop(box)   # LA 형식: 알파 = 육지
S2 = 0.75; W2, H2 = int(src.width * S2), int(src.height * S2)   # @2x 1062x1512, @1x 531x756
src = src.resize((W2, H2), Image.LANCZOS); lm = lm.resize((W2, H2), Image.LANCZOS)
land = np.asarray(lm).astype(np.float32) / 255; solid = land > 0.5
lab, n = ndimage.label(solid); sz = ndimage.sum(solid, lab, range(1, n + 1)); keep = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s > 400]); land = land * ndimage.binary_dilation(keep, iterations=2)
# 압록강·두만강 북쪽(만주) 육지 제거: 근사 국경선(경도→위도) 위쪽을 부드럽게 잘라냄
BLON = [124.3, 124.9, 125.6, 126.4, 127.2, 128.0, 128.8, 129.5, 130.2]; BLAT = [39.95, 40.35, 40.85, 41.35, 41.55, 41.75, 41.95, 42.15, 42.2]
gy, gx = np.mgrid[0:H2, 0:W2]; glon = LON0 + gx / W2 * (LON1 - LON0); glat = LAT1 - gy / H2 * (LAT1 - LAT0)
blat = np.interp(glon, BLON, BLAT); land = land * np.clip((blat - glat) / 0.08 + 0.5, 0, 1)
kyushu = ((glon > 129.55) & (glat < 33.95)) | ((glon > 128.9) & (glat < 33.75)); land = land * ~kyushu   # 규슈 북서부·이키·히라도 섬 제거(시즌 영토 아님). 쓰시마(129.2~129.5)는 유지
a = np.asarray(src).astype(np.float32); lum = a.mean(axis=2, keepdims=True) / 255
# r3(2026-11-04): 어두운 배경 위에서 땅이 보이도록 중간 명도 양피지·회갈 톤 + 산세 대비 강화(국소 대비) — 바다는 투명 유지
rel = ndimage.gaussian_filter(lum[..., 0], 6); detail = np.clip((lum[..., 0] - rel) * 2.6, -0.35, 0.35)[..., None]   # 산세 질감(국소 대비)
tone = np.array([150, 138, 112], np.float32) * (0.78 + 0.45 * lum) + 120 * detail   # 중간 명도 양피지 회갈(약 #8F846B~#C2B28C)
coast = ndimage.binary_dilation(land > 0.5, iterations=5) & ~ndimage.binary_erosion(land > 0.5, iterations=1)   # r3: 해안 글로우 폭 확대
rgba = np.dstack([np.clip(tone, 0, 255), land * 255]).astype(np.uint8); base = Image.fromarray(rgba, 'RGBA')
glow = Image.fromarray((coast * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)); gl = Image.new('RGBA', base.size, hexc('#F2C76A', 0)); gl.putalpha(glow.point(lambda v: int(v * 0.85)))
rim = (land > 0.5) & ~ndimage.binary_erosion(land > 0.5, iterations=2)   # r3: 해안선 안쪽 2px 금빛 선
ba = np.asarray(base).astype(np.float32).copy(); ba[rim, :3] = ba[rim, :3] * 0.25 + np.array([242, 199, 106]) * 0.75; base = Image.fromarray(ba.astype(np.uint8), 'RGBA')
mapim = Image.new('RGBA', base.size, (0, 0, 0, 0)); mapim.alpha_composite(gl); mapim.alpha_composite(gl); mapim.alpha_composite(base)
PADB2 = 40   # r3: 남쪽 여백(@2x 40px = @1x 20px). 좌표 원점(좌상단)·변환식은 그대로, 캔버스 높이만 늘어남
_m = Image.new('RGBA', (mapim.width, mapim.height + PADB2), (0, 0, 0, 0)); _m.paste(mapim, (0, 0)); mapim = _m
save2(mapim, 'map_base', 'ui.season.map.base', {'note': '시즌 전쟁 중앙 지도(한반도 + 제주 + 쓰시마, 바다 투명, 중간 명도 양피지 지형 + 금빛 해안선·글로우, 남쪽 여백 20px@1x). 영토 색은 cell 마스크를 FE 가 진영색으로 칠해 위에 얹음', 'src': 'map.battle.imjin_battle + landmask',
    'geo': {'lonMin': LON0, 'lonMax': LON1, 'latMin': LAT0, 'latMax': LAT1, 'projection': 'equirectangular, px@1x = ((lon-124.3)*90, (42.4-lat)*90)', 'revision': 'r3(2026-11-04): r2(남쪽 33.0 확장·규슈 제거) + 땅 명도 상향·산세 대비·해안 금선, 캔버스 아래 여백 20px@1x(좌표 변환식 불변)'}}, fmt='webp')
# ---------- 2) 거점 표 + 영토 셀(보로노이 × 육지) — r2: 서버 database/data/war/imjin.json 거점·links 그대로(서버 데이터 수정 없음) ----------
WAR = json.load(open('database/data/war/imjin.json', encoding='utf-8'))
NODES = [(t['code'], t['name'], t['lon'], t['lat'], 'major' if t.get('kind') == 'capital' else 'normal', t.get('start_country')) for t in WAR['territories']]   # 서버 kind=capital → 핀 등급 major(주요)
EDGES = [tuple(e) for e in WAR['links']]
ISLAND = {'jeju', 'tsushima'}
W1, H1 = W2 // 2, H2 // 2; k1 = W1 / (LON1 - LON0)
def p1(lon, lat): return ((lon - LON0) * k1, (LAT1 - lat) * k1)
pts = np.array([p1(n_[2], n_[3]) for n_ in NODES])
land1 = np.asarray(Image.fromarray((land * 255).astype(np.uint8)).resize((W1, H1), Image.LANCZOS)).astype(np.float32) / 255
lab1, nl = ndimage.label(land1 > 0.3)
def comp_at(x_, y_, r=14):   # 거점 좌표 주변에서 가장 가까운 육지 덩어리 번호
    ys, xs = np.nonzero(lab1[max(0, int(y_) - r):int(y_) + r, max(0, int(x_) - r):int(x_) + r])
    if not len(ys): return 0
    j = np.argmin((ys + max(0, int(y_) - r) - y_) ** 2 + (xs + max(0, int(x_) - r) - x_) ** 2); return lab1[ys[j] + max(0, int(y_) - r), xs[j] + max(0, int(x_) - r)]
icomp = {n_[0]: comp_at(*p1(n_[2], n_[3])) for n_ in NODES if n_[0] in ISLAND}
yy, xx = np.mgrid[0:H1, 0:W1]
main_idx = [i for i, n_ in enumerate(NODES) if n_[0] not in ISLAND]
d = np.stack([(xx - pts[i][0]) ** 2 + (yy - pts[i][1]) ** 2 for i in main_idx]); owner = np.array(main_idx)[d.argmin(axis=0)]
for i, n_ in enumerate(NODES):   # 섬 거점: 그 섬 덩어리 전체 + 주변 바다 반경(번짐 여유)
    if n_[0] in ISLAND and icomp.get(n_[0]):
        isl = ndimage.binary_dilation(lab1 == icomp[n_[0]], iterations=6); owner[isl] = i
for i, (nid, nm, *_r) in enumerate(NODES):
    m = ((owner == i).astype(np.float32)); m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))).astype(np.float32) / 255   # r3: 경계 선명하게(틴트 알파 0.65~0.75 대비)
    _a = Image.new('L', (W1, H1 + PADB2 // 2), 0); _a.paste(Image.fromarray((m * land1 * 255).astype(np.uint8), 'L'), (0, 0))   # r4: 흰색 RGB + 알파 = 마스크(모드 L 은 밖이 불투명 검정이 되어 지도를 덮음)
    for _s, _suf in ((1, ''), (2, '@2x')):
        _al = _a if _s == 1 else _a.resize((_a.width * 2, _a.height * 2), Image.LANCZOS)
        _c = Image.new('RGBA', _al.size, (255, 255, 255, 0)); _c.putalpha(_al); _c.save(f'{O}/cell/{nid}{_suf}.png', optimize=True)
    add(f'ui.season.map.cell.{nid}', f'{O}/cell/{nid}.png', {'scale': '@1x(지도 @1x 와 같은 크기)', 'variants': {'x2': f'assets/ui/season/cell/{nid}@2x.png'}, 'mode': 'RGBA(흰색 RGB + 알파 = 영역 마스크, 밖 알파 0) — FE 는 tint(진영색)만 곱함', 'revision': 'r4', 'territory': nid,
        'note': f'{nm} 영토 셀 마스크(서버 거점 id). FE 가 점령 진영색(조선 {BLUE} · 일본 {RED} · 중립 {GRAY}, 알파 0.55)으로 칠해 지도 위에 얹음' + (' — 섬 전체가 이 거점 영역' if nid in ISLAND else '')})
edge = (np.abs(np.diff(owner, axis=0, prepend=owner[:1])) + np.abs(np.diff(owner, axis=1, prepend=owner[:, :1]))) > 0
edge = ndimage.binary_dilation(edge, iterations=1) & (land1 > 0.5)
ei = Image.new('RGBA', (W1, H1), (0, 0, 0, 0)); ea = Image.fromarray((edge * 150).astype(np.uint8))
ei = Image.composite(Image.new('RGBA', (W1, H1), hexc('#F5E6C4')), ei, ea.filter(ImageFilter.GaussianBlur(0.6))); _e = Image.new('RGBA', (W1, H1 + PADB2 // 2), (0, 0, 0, 0)); _e.paste(ei, (0, 0)); _e.save(f'{O}/cell/edges.png', optimize=True)
add('ui.season.map.cell_edges', f'{O}/cell/edges.png', {'scale': '@1x', 'note': '영토 셀 경계선(옅은 크림, 지도 위·영토색 위에 얹음)'})
# r1(제안 거점) 전용 셀: 파일은 남기고 deprecated 표기(구 크롭 기준이라 현재 지도와 정렬 안 맞음)
for nid in ('hamhung', 'kaesong', 'gangneung', 'sangju', 'mokpo', 'pyongyang'):
    f_ = f'{O}/cell/{nid}.png'
    if os.path.exists(f_): add(f'ui.season.map.cell.{nid}', f_, {'deprecated': True, 'note': 'r1 제안 거점용(서버 거점 아님). 구 크롭(위도 34.0~42.4) 기준이라 현재 ui.season.map.base 와 정렬 안 됨 — 사용 금지, 정리 시 삭제 대상' + (' · 서버 id 는 pyeongyang' if nid == 'pyongyang' else '')})
json.dump({'_note': '시즌 전쟁(임진) 거점 표 r2 — 서버 database/data/war/imjin.json 의 territories(code·name·lon·lat·kind·start_country)와 links 를 그대로 옮김(서버 데이터 수정 없음). x,y = ui.season.map.base @1x 픽셀(@2x 는 2배), nx,ny = 0~1 정규화. rank: 서버 kind=capital → major(주요), 나머지 normal(일반). 화면 표기는 주요/일반만',
           'source': 'database/data/war/imjin.json', 'map_key': 'ui.season.map.base', 'size_1x': [W1, H1 + PADB2 // 2], 'transform_1x': 'x = (lon - 124.3) * 90, y = (42.4 - lat) * 90 (원점 좌상단, r3 에서 캔버스 아래 20px 여백만 추가)', 'revision': 'r3',
           'nodes': [{'id': nid, 'name': nm, 'lon': lo, 'lat': la, 'rank': rk, 'start_country': sc, 'x': round(p1(lo, la)[0], 1), 'y': round(p1(lo, la)[1], 1), 'nx': round(p1(lo, la)[0] / W1, 4), 'ny': round(p1(lo, la)[1] / H1, 4), 'cell_key': f'ui.season.map.cell.{nid}', 'island': nid in ISLAND} for nid, nm, lo, la, rk, sc in NODES],
           'edges': [list(e) for e in EDGES], 'sea_edges': [list(e) for e in EDGES if set(e) & ISLAND], 'route_style': {'color': '#EDE6D3', 'alpha': 0.9, 'width_1x': 3, 'dash_1x': [10, 7], 'outline': '#14182A 5px alpha 0.6', 'sea_route': '섬 연결(sea_edges)은 같은 점선을 바다 위에 그림, 색 #9FC3E8 권장'}},
          open(f'{O}/season_map_nodes.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# ---------- 3) 거점 핀: normal(금테 링 + 진영색 원판) / major(+ 전각 아이콘) / selected(맥동 링) ----------
ring = Image.open(f'{A}/map_world/ui/chip_frame.png').convert('RGBA').resize((112, 112), Image.LANCZOS)
hall = Image.open(f'{A}/map_world/icons/palace_hall.png').convert('RGBA')
def disc(col, s=128):
    c = Image.new('RGBA', (s * SS, s * SS), (0, 0, 0, 0)); dr = ImageDraw.Draw(c); r = 40 * SS; cx = cy = s * SS // 2
    for i in range(r, 0, -SS):   # 위 밝고 아래 어두운 구슬
        t = i / r; cc = tuple(int(v * (0.55 + 0.45 * (1 - t) ** 0.5)) for v in hexc(col)[:3])
        dr.ellipse((cx - i, cy - i - (r - i) * 0.25, cx + i, cy + i - (r - i) * 0.25), fill=cc + (255,))
    dr.ellipse((cx - 14 * SS, cy - 26 * SS, cx + 6 * SS, cy - 14 * SS), fill=(255, 255, 255, 90))
    return c.resize((s, s), Image.LANCZOS)
FAC = {'ally': BLUE, 'enemy': RED, 'neutral': GRAY}
for side, col in FAC.items():
    for rank in ('normal', 'major'):
        cv = Image.new('RGBA', (128, 128), (0, 0, 0, 0)); sh = Image.new('RGBA', (128, 128), (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse((14, 18, 114, 122), fill=(0, 0, 0, 120)); cv.alpha_composite(sh.filter(ImageFilter.GaussianBlur(5)))
        cv.alpha_composite(disc(col)); cv.alpha_composite(ring, (8, 8))
        if rank == 'major':
            big = Image.new('RGBA', (128, 150), (0, 0, 0, 0)); big.alpha_composite(cv, (0, 22)); h = hall.resize((92, 92), Image.LANCZOS); big.alpha_composite(h, (18, 0)); out = big
        else:
            dr = ImageDraw.Draw(cv); dr.ellipse((52, 52, 76, 76), fill=(240, 236, 222, 255), outline=hexc(INK), width=2); out = cv
        save2(out, f'pin_{rank}_{side}', f'ui.season.pin.{rank}.{side}', {'anchor': [0.5, 0.57 if rank == 'major' else 0.5], 'note': f"{'주요 거점(전각 + 진영색 구슬)' if rank == 'major' else '일반 거점(금테 링 + 진영색 구슬)'} — {side}"})
rip = Image.open(f'{A}/map_world/ui/ripple_ring.png').convert('RGBA').resize((160, 160), Image.LANCZOS); ra = np.asarray(rip).astype(np.float32); ra[..., :3] = np.array(hexc('#FFE08A')[:3]); sel = Image.fromarray(ra.astype(np.uint8), 'RGBA')
save2(sel, 'pin_selected', 'ui.season.pin.selected', {'anchor': [0.5, 0.5], 'note': '선택 거점 표시 링(핀 뒤에 깔고 크기 0.9↔1.15·알파 맥동)'})
# ---------- 4) 상태 pill(점령 조선/일본·중립) 3-slice ----------
def pill(col, w=220, h=52):
    c = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0)); dr = ImageDraw.Draw(c); r = h * SS // 2
    dr.rounded_rectangle((0, 0, w * SS - 1, h * SS - 1), r, fill=hexc(GOLD_D)); dr.rounded_rectangle((2 * SS, 2 * SS, w * SS - 2 * SS, h * SS - 2 * SS), r - 2 * SS, fill=hexc(GOLD))
    top, bot = np.array(hexc(col)[:3]) * 1.15, np.array(hexc(col)[:3]) * 0.6
    grad = Image.new('RGBA', (w * SS, h * SS)); ga = np.zeros((h * SS, w * SS, 4), np.uint8); t = np.linspace(0, 1, h * SS)[:, None]
    ga[..., :3] = np.clip(top * (1 - t) + bot * t, 0, 255)[:, None, :].repeat(w * SS, 1) if False else np.clip(top[None, None, :] * (1 - t[..., None]) + bot[None, None, :] * t[..., None], 0, 255).repeat(w * SS, 1); ga[..., 3] = 255
    msk = Image.new('L', (w * SS, h * SS), 0); ImageDraw.Draw(msk).rounded_rectangle((4 * SS, 4 * SS, w * SS - 4 * SS, h * SS - 4 * SS), r - 4 * SS, fill=255)
    c.paste(Image.fromarray(ga, 'RGBA'), (0, 0), msk); return c.resize((w, h), Image.LANCZOS)
for side, col in FAC.items():
    save2(pill(col), f'pill_{side}', f'ui.season.pill.{side}', {'slice_mode': '3h', 'slice_px_at_2x': {'l': 28, 'r': 28, 't': 0, 'b': 0}, 'note': {'ally': '조선 점령', 'enemy': '일본 점령', 'neutral': '중립'}[side] + ' 상태 pill(글자 FE, 흰색 + 짙은 외곽선)'})
# 거점 이름표(어두운 남색 + 금테)
save2(pill('#1A2238', 140, 44), 'label', 'ui.season.label', {'slice_mode': '3h', 'slice_px_at_2x': {'l': 22, 'r': 22, 't': 0, 'b': 0}, 'note': '지도 거점 이름표(글자 FE #F4E6C0)'})
# ---------- 5) 진격 화살표(곡선 붓 화살표 + 빛) ----------
def arrow(col, w=320, h=200):
    c = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0)); dr = ImageDraw.Draw(c)
    P = [(30 + (w - 90) * t, h - 40 - (h - 90) * math.sin(t * math.pi * 0.5) ** 1.2) for t in np.linspace(0, 1, 40)]
    for i in range(len(P) - 1):
        wd = (6 + 22 * (i / len(P))) * SS; x_, y_ = P[i]; x2, y2 = P[i + 1]
        dr.line((x_ * SS, y_ * SS, x2 * SS, y2 * SS), fill=hexc(col), width=int(wd))
    ex, ey = P[-1]; px_, py_ = P[-4]; ang = math.atan2(ey - py_, ex - px_); L_ = 58
    tip = (ex + math.cos(ang) * L_ * 0.8, ey + math.sin(ang) * L_ * 0.8); l = (ex + math.cos(ang + 2.2) * L_ * 0.75, ey + math.sin(ang + 2.2) * L_ * 0.75); rr = (ex + math.cos(ang - 2.2) * L_ * 0.75, ey + math.sin(ang - 2.2) * L_ * 0.75)
    dr.polygon([(v[0] * SS, v[1] * SS) for v in (tip, l, rr)], fill=hexc(col))
    im = c.resize((w, h), Image.LANCZOS); al = im.getchannel('A')
    hi = Image.new('RGBA', im.size, (255, 255, 255, 0)); hi.putalpha(al.filter(ImageFilter.MinFilter(7)).point(lambda v: int(v * 0.35)));
    gl_ = Image.new('RGBA', im.size, hexc(col, 0)); gl_.putalpha(al.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(8)).point(lambda v: int(v * 0.6)))
    out = Image.new('RGBA', im.size, (0, 0, 0, 0)); out.alpha_composite(gl_); out.alpha_composite(im); out.alpha_composite(hi); return out
for side, col in (('ally', '#3B8BFF'), ('enemy', '#E5403A')):
    save2(arrow(col), f'arrow_{side}', f'ui.season.arrow.{side}', {'note': '진격 화살표(왼쪽 아래 → 오른쪽 위로 휘는 붓 곡선 + 빛). 방향은 FE 회전·좌우 반전, 0.9 알파 권장'})
# ---------- 6) 진영 문장(원형 메달) ----------
def medal(inner, s=192):
    cv = Image.new('RGBA', (s, s), (0, 0, 0, 0)); m = Image.new('L', (s, s), 0); ImageDraw.Draw(m).ellipse((18, 18, s - 18, s - 18), fill=255)
    cv.paste(inner.resize((s, s), Image.LANCZOS), (0, 0), m); cv.alpha_composite(Image.open(f'{A}/map_world/ui/chip_frame.png').convert('RGBA').resize((s, s), Image.LANCZOS)); return cv
fl = Image.open(f'{A}/ui/flags/joseon.webp').convert('RGBA'); bb = fl.getchannel('A').getbbox(); fw = bb[2] - bb[0]; cx_, cy_ = (bb[0] + bb[2]) // 2, (bb[1] + bb[3]) // 2; r_ = int(fw * 0.36)
dragon = fl.crop((cx_ - r_, cy_ - r_, cx_ + r_, cy_ + r_)).convert('RGB'); da = np.asarray(dragon).astype(np.float32)
yellow = (da[..., 0] > 170) & (da[..., 1] > 130) & (da[..., 2] < 120); da[yellow] = da[yellow] * 0 + np.array([22, 40, 92]); da[~yellow] = np.clip(da[~yellow] * 0.4 + np.array([233, 182, 73]) * 0.6, 0, 255)  # 남색 바탕 + 금빛 용
save2(medal(Image.fromarray(da.astype(np.uint8))), 'emblem_joseon', 'ui.season.emblem.joseon', {'note': '조선 진영 문장(조선 깃발 용을 금빛으로, 남색 바탕 원형 메달). 특정 가문·현대 문장 아님', 'src': 'ui.flag.joseon'})
S0 = 192 * SS; jp = Image.new('RGB', (S0, S0), hexc('#7A1418')[:3]); dr = ImageDraw.Draw(jp); C_ = S0 / 2
dr.ellipse((C_ - 0.24 * S0, C_ - 0.36 * S0, C_ + 0.24 * S0, C_ + 0.12 * S0), fill=hexc(GOLD)[:3])   # 해
for j, yb in enumerate((0.60, 0.70, 0.80)):   # 물결 3줄
    pts_ = [(x, (yb + 0.035 * math.sin(x / S0 * math.pi * 6 + j)) * S0) for x in np.linspace(0, S0, 60)]
    dr.line(pts_, fill=hexc('#F3D58A')[:3], width=int(0.035 * S0))
save2(medal(jp.resize((192, 192), Image.LANCZOS)), 'emblem_japan', 'ui.season.emblem.japan', {'note': '일본 진영 문장(붉은 바탕에 금빛 해 + 물결 3줄, 국화·오동 등 실존 가문·황실 문장 미사용)', 'src': '벡터 드로잉'})
# ---------- 7) 화면 배경(임진 밤바다 장면 어둡게 + 비네팅) ----------
bgk = 'bg.imjin.night_sea'; man = json.load(open(f'{A}/manifest.json', encoding='utf-8')); KP = {}
def walk(o):
    if isinstance(o, dict):
        if 'key' in o and 'path' in o: KP.setdefault(o['key'], o['path'])
        for v in o.values(): walk(v)
    elif isinstance(o, list):
        for v in o: walk(v)
walk(man)
bg = Image.open(f"public/{KP[bgk]}").convert('RGB').resize((1920, 1080), Image.LANCZOS); bg = ImageEnhance.Brightness(ImageEnhance.Color(bg).enhance(0.8)).enhance(0.55)
vy, vx = np.mgrid[0:1080, 0:1920]; vig = 1 - 0.55 * np.clip(((vx - 960) / 1100) ** 2 + ((vy - 540) / 720) ** 2, 0, 1); ba = np.asarray(bg).astype(np.float32) * vig[..., None]
Image.fromarray(ba.astype(np.uint8)).save(f'{O}/bg_1920.webp', 'WEBP', quality=82, method=6)
add('ui.season.bg', f'{O}/bg_1920.webp', {'alpha': False, 'note': '시즌 전쟁 화면 배경(bg.imjin.night_sea 어둡게 + 비네팅). 진영별 시즌이 생기면 같은 규칙으로 bg.<서가>.* 에서 파생', 'src': bgk})
json.dump({'note': '시즌 전쟁 화면 UI(안아트 2026-11-04, 호출 0, 재가공·벡터 드로잉). 키 ui.season.*. 스펙 season_ui_spec.json, 거점 표 season_map_nodes.json', 'assets': items}, open(f'{O}/manifest_fragment_season_ui.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# ---------- 미리보기(시안 배치 근사) ----------
pv = Image.open(f'{O}/bg_1920.webp').convert('RGBA'); mp = Image.open(f'{O}/map_base.webp').convert('RGBA'); MX, MY = 690, 200; pv.alpha_composite(mp, (MX, MY))
own = {n_[0]: {'joseon': 'ally', 'japan': 'enemy'}.get(n_[5], 'neutral') for n_ in NODES}
for nid, *_ in NODES:
    c = Image.open(f'{O}/cell/{nid}.png'); col = FAC[own[nid]]; t = Image.new('RGBA', c.size, hexc(col, 0)); t.putalpha(c.getchannel('A').point(lambda v: int(v * 0.7))); pv.alpha_composite(t, (MX, MY))
pv.alpha_composite(Image.open(f'{O}/cell/edges.png').convert('RGBA'), (MX, MY))
dr = ImageDraw.Draw(pv); P1 = {n_[0]: p1(n_[2], n_[3]) for n_ in NODES}
for a_, b_ in EDGES:
    (ax, ay), (bx, by) = P1[a_], P1[b_]; L2 = math.hypot(bx - ax, by - ay); nseg = int(L2 / 17)
    for s_ in range(nseg):
        t0, t1 = s_ / nseg, (s_ + 0.6) / nseg; dr.line((MX + ax + (bx - ax) * t0, MY + ay + (by - ay) * t0, MX + ax + (bx - ax) * t1, MY + ay + (by - ay) * t1), fill=(237, 230, 211, 230), width=3)
for nid, nm, lo, la, rk, _sc in NODES:
    pin = Image.open(f'{O}/pin_{rk}_{own[nid]}.png').convert('RGBA'); x_, y_ = P1[nid]
    pv.alpha_composite(pin, (int(MX + x_ - pin.width / 2), int(MY + y_ - pin.height * (0.57 if rk == 'major' else 0.5))))
pv.alpha_composite(Image.open(f'{O}/arrow_ally.png').convert('RGBA'), (560, 700)); pv.alpha_composite(Image.open(f'{O}/arrow_enemy.png').convert('RGBA').transpose(Image.FLIP_LEFT_RIGHT), (1100, 520))
pv.alpha_composite(Image.open(f'{O}/emblem_joseon.png').convert('RGBA'), (300, 640)); pv.alpha_composite(Image.open(f'{O}/emblem_japan.png').convert('RGBA'), (1450, 640))
for i, s_ in enumerate(('ally', 'neutral', 'enemy')): pv.alpha_composite(Image.open(f'{O}/pill_{s_}.png').convert('RGBA'), (1500, 120 + i * 40))
pv.alpha_composite(Image.open(f'{O}/pin_selected.png').convert('RGBA'), (int(MX + P1['hanyang'][0] - 40), int(MY + P1['hanyang'][1] - 40)))
pv.convert('RGB').save('docker/gemini/portrait_s/preview/season_ui_preview.jpg', quality=86); print(len(items), W1, H1)
