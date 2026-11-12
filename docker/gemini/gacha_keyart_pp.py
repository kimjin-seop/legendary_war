# 뽑기 메인 키아트·타이틀 후처리 + 절차 생성(API 호출 없음, 안아트 2026-11-03)
#   raw(gacha_keyart_gen.mjs): public/assets/gacha_ui/raw/{keyart,title,brush}/<id>.jpg
#   산출: public/assets/gacha_ui/keyart/  keyart_<theme>.jpg(1920x1080, ~300KB) · title_<theme>.png(1040x300) · title_brush.png(1200x240)
#         절차: tag_hero.png(520x60) · list_compact.png / list_compact_selected.png(480x152, 표시 240x76)
#   조각: public/assets/gacha_ui/manifest_fragment_keyart.json (kind assets, scope gacha_ui). QA 판정: docker/gemini/gacha_keyart_qa.json(manual)
# 실행(저장소 루트): python docker/gemini/gacha_keyart_pp.py     의존: pillow, numpy(pip 공식 레지스트리)
import json, os, io, sys
RECOLOR = {'imjin'}   # 채움 밝게 보정할 타이틀(gacha_title_recolor.py)
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAW = 'public/assets/gacha_ui/raw'; OUT = 'public/assets/gacha_ui/keyart'; os.makedirs(OUT, exist_ok=True)
THEMES = ['imjin', 'conquest', 'three_kingdoms', 'sengoku', 'normal', 'europe']
QA = json.load(open('docker/gemini/gacha_keyart_qa.json', encoding='utf-8')) if os.path.exists('docker/gemini/gacha_keyart_qa.json') else {}
GEN = {'model': 'gemini-nano-banana-2.1', 'api': 'Interactions API', 'size': '2K', 'script': 'docker/gemini/gacha_keyart_gen.mjs + gacha_keyart_style.mjs / gacha_keyart_pp.py'}
PROC = {'model': 'procedural (gacha_keyart_pp.py, 모델 호출 없음)', 'script': 'docker/gemini/gacha_keyart_pp.py'}
LIC = '자체 생성(이미지 모델 출력 + 절차 생성), 제3자 소스 없음. 모델 출력물 상업 이용 약관은 사람 확인'
GOLD, GOLD_L, GOLD_D, NAVY, NAVY_D = (217, 180, 90), (243, 220, 142), (138, 102, 40), (22, 36, 70), (11, 19, 40)

def key_magenta(rgb, grow=3):  # gacha_pp.py 와 같은 키(복사)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    strict = (r > 150) & (b > 150) & (g < 120) & (r - g > 100) & (b - g > 100)
    loose = (r - g > 50) & (b - g > 50)
    for _ in range(grow):
        n = np.zeros_like(strict); n[1:] |= strict[:-1]; n[:-1] |= strict[1:]; n[:, 1:] |= strict[:, :-1]; n[:, :-1] |= strict[:, 1:]
        strict = strict | (n & loose)
    a = np.where(strict, 0, 255).astype(np.int32)
    edge = np.zeros_like(strict); edge[1:] |= strict[:-1]; edge[:-1] |= strict[1:]; edge[:, 1:] |= strict[:, :-1]; edge[:, :-1] |= strict[:, 1:]; edge &= ~strict
    m = np.clip((np.minimum(r, b) - g) / 255.0, 0, 1)
    a = np.where(edge, (255 * (1 - m * 0.9)).astype(np.int32), a)
    spill = np.clip(np.minimum(r, b) - g - 20, 0, None); out = rgb.copy(); out[..., 0] = r - spill; out[..., 2] = b - spill
    return np.dstack([np.clip(out, 0, 255), a]).astype(np.uint8)

def keyed(path, size, pad=0.04, ghost=True):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    k = key_magenta(rgb).astype(np.float32)
    # 잔상 제거: 모델이 같은 글자를 흐린 분홍 잔상으로 한 벌 더 그리는 경향 → 마젠타가 섞인 화소(min(r,b)-g 큼)는 원본 기준으로 알파를 깎는다
    mix = np.clip((np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1] - 12) / 50.0, 0, 1); k[..., 3] *= (1 - mix) if ghost else 1
    k[..., 3] = np.where(k[..., 3] < 60, 0, k[..., 3])
    from scipy import ndimage
    m = k[..., 3] > 0; lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    if n:  # 본체(가장 큰 덩어리 기준 높이 띠)와 세로로 겹치지 않는 조각 제거
        sizes = ndimage.sum(m, lab, range(1, n + 1)); objs = ndimage.find_objects(lab); bigs = [i for i in range(n) if sizes[i] > sizes.max() * 0.05]
        y0 = min(objs[i][0].start for i in bigs if sizes[i] > sizes.max() * 0.3); y1 = max(objs[i][0].stop for i in bigs if sizes[i] > sizes.max() * 0.3)
        for i in range(n):
            sl = objs[i][0]
            if sl.stop <= y0 + 2 or sl.start >= y1 - 2 or sizes[i] < 30: k[..., 3][lab == i + 1] = 0
    if ghost:   # 잔상 한 벌이 세로로 떨어져 있으면(빈 행으로 구분된 띠 여러 개) 가장 짙은(먹색 화소가 많은) 띠만 남김
        al = k[..., 3] > 0; rows = al.any(1); bands = []; y = 0
        while y < len(rows):
            if rows[y]:
                y0 = y
                while y < len(rows) and rows[y]: y += 1
                bands.append((y0, y))
            y += 1
        if len(bands) > 1:
            dark = (k[..., :3].mean(-1) < 70) & al
            keep = max(bands, key=lambda b: int(dark[b[0]:b[1]].sum()))
            for b0, b1 in bands:
                if (b0, b1) != keep: k[b0:b1, :, 3] = 0
    im = Image.fromarray(k.clip(0, 255).astype(np.uint8)); bb = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox(); im = im.crop(bb)
    W, H = size; s = min(W * (1 - 2 * pad) / im.width, H * (1 - 2 * pad) / im.height); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    c = Image.new('RGBA', size, (0, 0, 0, 0)); c.alpha_composite(im, ((W - im.width) // 2, (H - im.height) // 2))
    a = np.asarray(c); mg = int(((a[..., 0] > 200) & (a[..., 2] > 200) & (a[..., 1] < 80) & (a[..., 3] > 200)).sum())
    return c, mg

def save_jpg_target(im, path, target=300_000):
    lo, hi, best = 60, 95, None
    while lo <= hi:
        q = (lo + hi) // 2; b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True, progressive=True)
        if b.tell() <= target: best = (q, b.getvalue()); lo = q + 1
        else: hi = q - 1
    if best is None: b = io.BytesIO(); im.save(b, 'JPEG', quality=60, optimize=True, progressive=True); best = (60, b.getvalue())
    open(path, 'wb').write(best[1]); return best[0]

def rrect(d, box, r, **kw): d.rounded_rectangle(box, radius=r, **kw)

items = []
def add(key, path, size, display, note, gen, qa_key, extra=None):
    q = QA.get(key, {'verdict': 'not_checked', 'issues': []})
    items.append({'key': key, 'path': path.replace('public/', ''), 'type': 'image', 'size': list(size), 'scope': 'gacha_ui', 'alpha': path.endswith('.png'), 'blend': 'normal',
                  'scale': '@2x' if display != size else '@1x', 'display': list(display), 'note': note, 'qa': q.get('verdict'), 'qa_issues': q.get('issues', []), 'verify': bool(q.get('verify')),
                  'bytes': os.path.getsize(path), 'generator': gen, 'license': LIC, 'prompt_ref': qa_key, **(extra or {})})

# 1) 키아트
for t in THEMES:
    src = f'{RAW}/keyart/keyart_{t}.jpg'
    if not os.path.exists(src): print('raw 없음', src); continue
    if QA.get(f'gacha.keyart.{t}', {}).get('verdict') == 'fail': print('QA fail 제외', t); continue
    im = Image.open(src).convert('RGB')
    L = np.asarray(im.convert('L')).astype(float); flat = L.std(1) < 4; hh = L.shape[0]; t0 = 0  # 레터박스형 단색 띠 자동 제거(호출 없음)
    while t0 < hh and flat[t0]: t0 += 1
    b0 = hh
    while b0 > 0 and flat[b0 - 1]: b0 -= 1
    band = [round(t0 / hh, 3), round(b0 / hh, 3)]
    if t0 or b0 < hh: im = im.crop((0, t0, im.width, b0))
    w, h = im.size; tw = round(h * 16 / 9)
    im = im.crop(((w - tw) // 2, 0, (w - tw) // 2 + tw, h)) if tw <= w else im.crop((0, (h - round(w * 9 / 16)) // 2, w, (h - round(w * 9 / 16)) // 2 + round(w * 9 / 16)))
    im = im.resize((1920, 1080), Image.LANCZOS); p = f'{OUT}/keyart_{t}.jpg'; q = save_jpg_target(im, p)
    add(f'gacha.keyart.{t}', p, (1920, 1080), (1920, 1080), f'뽑기 메인 풀블리드 키아트({t}). 영웅 없음 — FE 가 초상 합성. 가운데 60% 영웅 자리, 오른쪽 30% 타이틀 자리. cover 배치', GEN, f'gacha_keyart_style.mjs JOBS.keyart[keyart_{t}]', {'jpeg_quality': q, 'band_crop': band})
    print('keyart', t, q, os.path.getsize(p) // 1024, 'KB')
# 2) 타이틀(글자 포함) + 붓 띠
for t in THEMES:
    src = f'{RAW}/title/title_{t}.jpg'
    if not os.path.exists(src): print('raw 없음', src); continue
    if QA.get(f'gacha.title.{t}', {}).get('verdict') == 'fail': print('QA fail 제외(FE 글자 + gacha.title.brush 사용)', t); continue
    c, mg = keyed(src, (1040, 300)); p = f'{OUT}/title_{t}.png'; c.save(p, optimize=True)
    if t in RECOLOR:   # 2026-11-03 팀장 요청: 어두운 하늘 위 대비 — 밝은 아이보리~금 채움 + 어두운 외곽선(호출 없음)
        import subprocess; subprocess.run([sys.executable, 'docker/gemini/gacha_title_recolor.py', p, p], check=True)
    add(f'gacha.title.{t}', p, (1040, 300), (520, 150), '붓글씨 타이틀(글자 포함, 투명). 키아트 오른쪽 30% 위쪽에 배치', GEN, f'gacha_keyart_style.mjs JOBS.title[title_{t}]', {'magenta_px': mg})
    print('title', t, mg)
for t in ('conquest', 'three_kingdoms', 'sengoku', 'europe'):   # 원어 타이틀(2026-11-03): gacha.title.<t>.native -> title_<t>_native.png, 한글 타이틀과 같은 규격·여백
    src = f'{RAW}/native/title_{t}_native.jpg'
    if not os.path.exists(src): continue
    if QA.get(f'gacha.title.{t}.native', {}).get('verdict') == 'fail': print('QA fail 제외', t, 'native'); continue
    c, mg = keyed(src, (1040, 300)); p = f'{OUT}/title_{t}_native.png'; c.save(p, optimize=True)
    add(f'gacha.title.{t}.native', p, (1040, 300), (520, 150), '원어 붓글씨 타이틀(글자 포함, 투명). 한글 제목은 아래에 코드 텍스트로 병기(FE). 텍스처 gacha_title_<t>_native', GEN, f'gacha_keyart_style.mjs JOBS.native[title_{t}_native]', {'magenta_px': mg})
    print('native', t, mg)
if os.path.exists(f'{RAW}/brush/title_brush.jpg'):
    c, mg = keyed(f'{RAW}/brush/title_brush.jpg', (1200, 240), 0.02, ghost=False); p = f'{OUT}/title_brush.png'; c.save(p, optimize=True)
    add('gacha.title.brush', p, (1200, 240), (600, 120), '글자 없는 먹 붓터치 띠(FE 글자 뒤). 타이틀 PNG 가 없는 테마의 폴백', GEN, 'gacha_keyart_style.mjs JOBS.brush[title_brush]', {'magenta_px': mg})
# 3) 영웅 이름 태그 띠(절차)
W, H = 520, 60; im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); a = np.zeros((H, W), np.float32)
x = np.linspace(0, 1, W)[None, :]; band = np.clip(1.0 - np.clip((x - 0.62) / 0.38, 0, 1) ** 1.4, 0, 1) * np.ones((H, 1))
body = np.zeros((H, W, 4), np.float32); body[..., 0], body[..., 1], body[..., 2] = NAVY_D; body[..., 3] = 215 * band
body[6:8, 28:, :3] = GOLD; body[6:8, 28:, 3] = 230 * band[6:8, 28:]; body[H - 8:H - 6, 28:, :3] = GOLD_D; body[H - 8:H - 6, 28:, 3] = 220 * band[H - 8:H - 6, 28:]
im = Image.fromarray(body.clip(0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
d.polygon([(30, 4), (56, 30), (30, 56), (4, 30)], fill=(*NAVY, 255), outline=(*GOLD, 255), width=3)  # 마름모 아이콘 칸(FE 아이콘이 위에 겹침)
p = f'{OUT}/tag_hero.png'; im.save(p, optimize=True)
add('gacha.tag.hero', p, (W, H), (260, 30), '영웅 이름 태그 띠. 왼쪽 0~60px(표시 0~30) 마름모 칸에 FE 아이콘, 이름 글자 FE: 흰 15px 굵게, x=34(표시) 부터. 오른쪽 38% 는 투명으로 페이드', PROC, 'gacha_keyart_pp.py(절차)', {'icon_slot': [0, 0, 60, 60], 'text_x': 68})
# 4) 컴팩트 배너 목록 프레임(절차) 480x152, 왼쪽 썸네일 칸 128px(표시 64)
def compact(sel):
    W, H, R = 480, 152, 22; im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    rrect(d, (2, 2, W - 3, H - 3), R, fill=(*NAVY_D, 225))
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(g)  # 위쪽 은은한 광택
    rrect(gd, (6, 6, W - 7, H // 2), R - 4, fill=(255, 255, 255, 14)); im.alpha_composite(g)
    if sel:
        gl = Image.new('RGBA', (W, H), (0, 0, 0, 0)); gld = ImageDraw.Draw(gl); rrect(gld, (4, 4, W - 5, H - 5), R, outline=(*GOLD_L, 200), width=10)
        im.alpha_composite(gl.filter(ImageFilter.GaussianBlur(5)))
    rrect(d, (2, 2, W - 3, H - 3), R, outline=(*(GOLD_L if sel else GOLD_D), 255), width=5 if sel else 3)
    tx, ty, ts = 12, (H - 128) // 2, 128  # 썸네일 칸: 안쪽 투명(FE 가 초상 크롭을 아래에 깔고 이 프레임을 위에)
    d.rounded_rectangle((tx, ty, tx + ts, ty + ts), radius=14, fill=(0, 0, 0, 0))
    m = Image.new('L', (W, H), 255); ImageDraw.Draw(m).rounded_rectangle((tx, ty, tx + ts, ty + ts), radius=14, fill=0)
    im.putalpha(Image.fromarray(np.minimum(np.asarray(im.getchannel('A')), np.asarray(m))))
    d = ImageDraw.Draw(im); d.rounded_rectangle((tx, ty, tx + ts, ty + ts), radius=14, outline=(*(GOLD_L if sel else GOLD), 255), width=3)
    d.line((tx + ts + 18, H // 2, W - 24, H // 2), fill=(*GOLD_D, 140), width=2)  # 제목/부제 구분선
    return im
for sel, key, fn in [(False, 'gacha.list.compact', 'list_compact.png'), (True, 'gacha.list.compact.selected', 'list_compact_selected.png')]:
    p = f'{OUT}/{fn}'; compact(sel).save(p, optimize=True)
    add(key, p, (480, 152), (240, 76), ('선택된 ' if sel else '') + '컴팩트 배너 목록 항목 프레임. 왼쪽 썸네일 칸(2x 기준 x12 y12 128x128, 표시 x6 y6 64x64, 반경 7) 안쪽 투명 — 초상 크롭을 아래에 깔고 프레임을 위에. 글자 FE: 제목 x≈80(표시), 구분선 위/아래', PROC, 'gacha_keyart_pp.py(절차)', {'thumb_slot_2x': [12, 12, 128, 128], 'thumb_slot': [6, 6, 64, 64]})
frag = {'note': '뽑기 메인 키아트·타이틀·태그·컴팩트 목록 프레임(안아트 2026-11-03). scope gacha_ui(진입 시 로드, FE KEYART_SCOPE_PREFIX). 타이틀 PNG 가 없는 테마는 FE 글자 + gacha.title.brush',
        'base_path': 'assets/gacha_ui/keyart', 'assets': items, 'total_bytes': sum(i['bytes'] for i in items)}
json.dump(frag, open('public/assets/gacha_ui/manifest_fragment_keyart.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('items', len(items), 'total KB', frag['total_bytes'] // 1024)
