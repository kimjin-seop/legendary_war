# 시나리오 배너 원어 타이틀(gacha.title.sc_chNN.native) 폰트 렌더 + 기존 원어 타이틀(title_<t>_native.png) 스타일 후처리. 안아트 2026-11-08
# 이미지 모델 호출 0: 비라틴 문자 오기 방지를 위해 글리프는 전부 실제 폰트(raqm 셰이핑)로 렌더한다.
# 기존 규격(gacha_keyart_pp.py native): 1040x300 투명 PNG, @2x(display 520x150), 글자 상자 x 41~997 / 높이 <=250, 세로 중앙 150,
#   채움 = 짙은 보라 먹색(#1A1320 계열) + 위쪽 광택, 테두리 = 금색(#E9BB75 계열) 약 4px.
# 실행(저장소 루트, Docker 공식 이미지 + Debian 공식 패키지):
#   docker run --rm -v "$PWD":/app -w /app python:3.12-slim bash -c "apt-get update -qq && apt-get install -y -qq --no-install-recommends \
#     fonts-noto-core fonts-noto-cjk fonts-noto-extra fonts-arphic-ukai fonts-hosny-amiri libraqm0 && pip install -q pillow numpy fonttools && \
#     python docker/gemini/gacha_title_native_sc.py [--preview DIR]"
import json, os, sys, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, features
from fontTools.ttLib import TTFont, TTCollection

assert features.check('raqm'), 'raqm(복잡 문자 셰이핑) 없음 -> 아랍·데바나가리·몽골 문자 렌더 불가'
ROOT = os.getcwd()
OUT = f'{ROOT}/public/assets/gacha_ui/keyart'
FRAG = f'{ROOT}/public/assets/gacha_ui/manifest_fragment_title_native_sc.json'
PREV = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
ONLY = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None

N = '/usr/share/fonts/truetype/noto'
FONTS = {
    'kai': ('/usr/share/fonts/truetype/arphic/ukai.ttc', 2, None),           # AR PL UKai TW(해서 붓글씨, 번체 정자)
    'cinzel': (f'{ROOT}/docker/gemini/fonts/cinzel/Cinzel-VF.ttf', 0, 'Bold'),  # 로마 비문체(conquest/europe 원어와 같은 계열)
    'serif': (f'{N}/NotoSerif-Black.ttf', 0, None),                         # 그리스·베트남어(Cinzel 미지원 글리프). Display 판은 획 대비가 커 가는 획이 테두리에 묻혀 제외
    'amiri': ('/usr/share/fonts/opentype/fonts-hosny-amiri/Amiri-Bold.ttf', 0, None),  # 아랍 나스흐 서예체
    'deva': (f'{N}/NotoSerifDevanagari-ExtraBold.ttf', 0, None),
    'mong': (f'{N}/NotoSansMongolian-Regular.ttf', 0, None),
}
FONT_LICENSE = {'kai': 'AR PL UKai(Arphic Public License, Debian fonts-arphic-ukai)', 'cinzel': 'Cinzel(SIL OFL 1.1, docker/gemini/fonts/cinzel)',
                'serif': 'Noto Serif(SIL OFL 1.1, Debian fonts-noto-core)', 'amiri': 'Amiri(SIL OFL 1.1, Debian fonts-hosny-amiri)',
                'deva': 'Noto Serif Devanagari(SIL OFL 1.1, Debian fonts-noto-core)', 'mong': 'Noto Sans Mongolian(SIL OFL 1.1, Debian fonts-noto-core)'}

# key, 서버 배너 제목(한글), 원어 문자열(줄/열 목록), 폰트, 언어·방향, 옵션
JOBS = [
    ('sc_ch11', '고려-거란 전쟁', ['高麗·契丹'], 'kai', dict(lang='zh-Hant', bold=3, rough=True)),
    ('sc_ch13', '황산벌', ['黃山伐'], 'kai', dict(lang='zh-Hant', bold=3, rough=True)),
    ('sc_ch14', '살수', ['薩水'], 'kai', dict(lang='zh-Hant', bold=3, rough=True)),
    ('sc_ch15', '포에니 전쟁', ['BELLA PUNICA'], 'cinzel', dict(track=0.06, lang='la', bold=1)),
    ('sc_ch16', '오를레앙', ['ORLÉANS'], 'cinzel', dict(track=0.06, lang='fr', bold=1)),
    ('sc_ch17', '가우가멜라', ['ΓΑΥΓΑΜΗΛΑ'], 'serif', dict(track=0.05, lang='el')),
    ('sc_ch18', '몽골 제국', ['ᠮᠣᠩᠭᠣᠯ'], 'mong', dict(lang='mn', vertical=True, bold=int(os.environ.get('MONG_BOLD', '4')))),
    ('sc_ch19', '성지 예루살렘', ['القدس'], 'amiri', dict(lang='ar', direction='rtl')),
    ('sc_ch21', '레그니차', ['LEGNICA'], 'cinzel', dict(track=0.06, lang='pl', bold=1)),
    ('sc_ch22', '파니파트', ['पानीपत'], 'deva', dict(lang='hi')),
    ('sc_ch23', '헤이스팅스', ['HASTINGS'], 'cinzel', dict(track=0.06, lang='en', bold=1)),
    ('sc_ch24', '투르', ['بلاط الشهداء'], 'amiri', dict(lang='ar', direction='rtl')),
    ('sc_ch25', '바익당강', ['BẠCH ĐẰNG'], 'serif', dict(track=0.05, lang='vi')),
]

W, H = 1040, 300
BOX = (41, 997, 25, 275)  # 기존 원어 타이틀 글자 상자(x0,x1,y0,y1)
SS = 2                    # 2배 해상도에서 스타일 후 축소(안티에일리어싱)
FS = 420                  # 래스터 폰트 크기(2x 기준 맞춤 전)


def font(fk, size):
    p, idx, var = FONTS[fk]
    f = ImageFont.truetype(p, size, index=idx, layout_engine=ImageFont.Layout.RAQM)
    if var:
        try: f.set_variation_by_name(var)
        except Exception: f.set_variation_by_axes([700])
    return f


def coverage(fk, s):
    p, idx, _ = FONTS[fk]
    t = TTCollection(p).fonts[idx] if p.endswith('.ttc') else TTFont(p)
    cm = t.getBestCmap()
    return [c for c in s if not c.isspace() and ord(c) not in cm]


def text_mask(s, fk, o, engine_basic=False):
    """한 줄 렌더 -> L 마스크(잘라냄). track = 글자 사이 추가 간격(em 비율, 라틴·그리스만 글자별)."""
    f = font(fk, FS)
    if engine_basic: f = ImageFont.truetype(FONTS[fk][0], FS, index=FONTS[fk][1], layout_engine=ImageFont.Layout.BASIC)
    kw = {k: o[k] for k in ('direction', 'language') if k in o}
    if 'lang' in o: kw['language'] = o['lang']
    if engine_basic: kw = {}
    pad = FS
    if o.get('track'):
        adv = [f.getlength(c, **kw) for c in s]
        tw = int(sum(adv) + FS * o['track'] * (len(s) - 1)) + 2 * pad
        m = Image.new('L', (tw, FS * 3), 0); d = ImageDraw.Draw(m); x = pad
        for c, a in zip(s, adv):
            d.text((x, pad), c, font=f, fill=255, **kw); x += a + FS * o['track']
    else:
        tw = int(f.getlength(s, **kw)) + 2 * pad
        m = Image.new('L', (tw, FS * 3), 0); ImageDraw.Draw(m).text((pad, pad), s, font=f, fill=255, **kw)
    bb = m.getbbox()
    return m.crop(bb) if bb else m


def compose(job):
    key, ko, lines, fk, o = job
    if o.get('vertical'):  # 몽골 문자: 가로로 셰이핑한 뒤 시계 방향 90도 회전 = 위->아래 세로쓰기, 열은 왼쪽->오른쪽
        cols = [text_mask(s, fk, o).rotate(-90, expand=True) for s in lines]
        gap = int(FS * 0.35); hh = max(c.height for c in cols); ww = sum(c.width for c in cols) + gap * (len(cols) - 1)
        m = Image.new('L', (ww, hh), 0); x = 0
        for c in cols: m.paste(c, (x, 0)); x += c.width + gap
        return m
    if '·' in lines[0]:  # 가운뎃점: 폰트 점은 굵기 처리 후 너무 커서 작은 원을 직접(글자 높이 약 13%)
        parts = [text_mask(t, fk, o) for t in lines[0].split('·')]
        hh = max(p.height for p in parts); dot = int(hh * 0.13); gap = int(hh * 0.16)
        ww = sum(p.width for p in parts) + (gap * 2 + dot) * (len(parts) - 1)
        m = Image.new('L', (ww, hh), 0); d = ImageDraw.Draw(m); x = 0
        for i, p in enumerate(parts):
            m.paste(p, (x, (hh - p.height) // 2)); x += p.width
            if i < len(parts) - 1: d.ellipse((x + gap, hh // 2 - dot // 2, x + gap + dot, hh // 2 + dot // 2), fill=255); x += gap * 2 + dot
        return m
    return text_mask(lines[0], fk, o)


def _shift_max(a, offs):
    h, w = a.shape; out = a.copy()
    for dy, dx in offs:
        sy0, sy1 = max(0, -dy), h - max(0, dy); sx0, sx1 = max(0, -dx), w - max(0, dx)
        out[sy0 + dy:sy1 + dy, sx0 + dx:sx1 + dx] = np.maximum(out[sy0 + dy:sy1 + dy, sx0 + dx:sx1 + dx], a[sy0:sy1, sx0:sx1])
    return out


def disc_dilate(a, r):
    """원형 그레이스케일 팽창(안티에일리어싱 가장자리 유지, 선명). 반지름 2 원판을 반복(민코프스키 합 = 큰 원판 근사) + 나머지 1"""
    r = int(round(r))
    d2 = [(dy, dx) for dy in range(-2, 3) for dx in range(-2, 3) if (dy, dx) != (0, 0) and dy * dy + dx * dx <= 5]
    d1 = [(dy, dx) for dy in range(-1, 2) for dx in range(-1, 2) if (dy, dx) != (0, 0) and dy * dy + dx * dx <= 1]
    for _ in range(r // 2): a = _shift_max(a, d2)
    if r % 2: a = _shift_max(a, d1)
    return a


def roughen(a, seed):
    """붓 가장자리: 저주파 잡음으로 임계값을 흔들어 획 끝·가장자리를 불규칙하게(과하지 않게)"""
    rng = np.random.default_rng(seed)
    h, w = a.shape
    nz = Image.fromarray((rng.random((h // 24 + 2, w // 24 + 2)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    nz2 = Image.fromarray((rng.random((h // 6 + 2, w // 6 + 2)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    n = (np.asarray(nz).astype(np.float32) / 255 - 0.5) * 0.35 + (np.asarray(nz2).astype(np.float32) / 255 - 0.5) * 0.3
    soft = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))).astype(np.float32) / 255
    return np.clip((soft - 0.5 + n * 0.4) / 0.08 + 0.5, 0, 1)


def style(mask_img, o, seed):
    # 2x 캔버스 안 글자 상자에 비율 유지 맞춤(세로 중앙 150)
    bx0, bx1, by0, by1 = [v * SS for v in BOX]
    ol = (4 + o.get('bold', 0)) * SS + 2  # 테두리·굵기 여유
    sc = min((bx1 - bx0 - 2 * ol) / mask_img.width, (by1 - by0 - 2 * ol) / mask_img.height)
    mw, mh = max(1, round(mask_img.width * sc)), max(1, round(mask_img.height * sc))
    m = mask_img.resize((mw, mh), Image.LANCZOS)
    cv = Image.new('L', (W * SS, H * SS), 0)
    x = (W * SS - mw) // 2  # 가로 중앙(세로쓰기 포함: FE 글로우 타원이 캔버스 중앙 기준이라 글자 bbox 중심과 일치시킴, 팀장 지시 2026-11-08)
    y = (H * SS - mh) // 2
    cv.paste(m, (x, y))
    a = np.asarray(cv).astype(np.float32) / 255
    if o.get('bold'): a = disc_dilate(a, o['bold'] * SS)  # 획 굵게(최종 px 반지름. 해서체를 붓글씨 무게로)
    if o.get('rough'): a = roughen(a, seed)
    a = np.clip(a, 0, 1)
    out_a = disc_dilate(a, 4 * SS)                        # 금 테두리 바깥선
    ys = np.where(out_a.max(1) > 0.05)[0]; t0, t1 = ys.min(), ys.max(); hgt = max(1, t1 - t0)
    yy = np.clip((np.arange(H * SS) - t0) / hgt, 0, 1)[:, None]
    # 채움: 위 #2E2434 -> 아래 #120C16, 위 38% 광택 띠(부드러운 경계)
    top = np.array([46, 36, 54], np.float32); bot = np.array([18, 12, 22], np.float32)
    fill = top * (1 - yy[..., None]) + bot * yy[..., None]
    gloss = np.clip((0.40 - yy) / 0.06, 0, 1)[..., None] * 16
    fill = np.broadcast_to(fill + gloss, (H * SS, W * SS, 3))
    # 금: 위 #F6D696 -> 아래 #C48C52
    gt = np.array([246, 214, 150], np.float32); gb = np.array([196, 140, 82], np.float32)
    gold = np.broadcast_to(gt * (1 - yy[..., None]) + gb * yy[..., None], (H * SS, W * SS, 3))
    rgb = gold * (1 - a[..., None]) + fill * a[..., None]
    rgba = np.dstack([rgb, out_a * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA').resize((W, H), Image.LANCZOS)
    # 알파 0 픽셀 색 정리(가장자리 색 번짐 방지)
    arr = np.array(im); arr[arr[..., 3] == 0, :3] = 0
    return Image.fromarray(arr, 'RGBA')


def shaping_check(job):
    """복잡 문자: raqm 셰이핑 결과가 기본(셰이핑 없음) 렌더와 달라야 정상 연결(아랍 연결형·데바나가리 모음 부호·몽골 연결형)"""
    key, ko, lines, fk, o = job
    if fk not in ('amiri', 'deva', 'mong'): return None
    a = text_mask(lines[0], fk, o); b = text_mask(lines[0], fk, o, engine_basic=True)
    if a.size != b.size: return 'shaped(크기 다름)'
    diff = np.abs(np.asarray(a, np.int16) - np.asarray(b, np.int16)).mean()
    return f'shaped(diff {diff:.1f})' if diff > 2 else 'NOT_SHAPED'


frag_assets = []; qa = {}
for i, job in enumerate(JOBS):
    key, ko, lines, fk, o = job
    if ONLY and key not in ONLY: continue
    miss = coverage(fk, ''.join(lines))
    sh = shaping_check(job)
    m = compose(job)
    im = style(m, o, seed=1000 + i)
    p = f'{OUT}/title_{key}_native.png'
    im.save(p, optimize=True)
    arr = np.asarray(im); ys, xs = np.where(arr[..., 3] > 20)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    clipped = bbox[0] <= 1 or bbox[1] <= 1 or bbox[2] >= W - 2 or bbox[3] >= H - 2
    qa[key] = dict(text=' / '.join(lines), font=fk, missing_glyphs=miss, shaping=sh, bbox=bbox, edge_clipped=clipped)
    print(key, ' / '.join(lines), 'missing', miss, 'shaping', sh, 'bbox', bbox, 'clipped', clipped, os.path.getsize(p))
    frag_assets.append({
        'key': f'gacha.title.{key}.native', 'path': f'assets/gacha_ui/keyart/title_{key}_native.png', 'type': 'image', 'size': [W, H],
        'scope': 'gacha_ui', 'alpha': True, 'blend': 'normal', 'scale': '@2x', 'display': [W // 2, H // 2],
        'note': f'시나리오 배너 {key}({ko}) 원어 타이틀 "{" ".join(lines)}"(글자 포함, 투명). 한글 제목은 아래에 코드 텍스트로 병기(FE). 텍스처 gacha_title_{key}_native, 서버 배너 key {key}(art_key 없음 -> FE theme = key)',
        'native_text': ' '.join(lines), 'native_lang': o.get('lang'),
        'writing': 'vertical(top-to-bottom, columns left-to-right)' if o.get('vertical') else ('rtl' if o.get('direction') == 'rtl' else 'ltr'),
        'qa': 'pending', 'qa_issues': [], 'verify': False, 'bytes': os.path.getsize(p),
        'generator': {'model': None, 'api': None, 'method': 'font render(Pillow raqm) + 기존 원어 타이틀 스타일 후처리(금 테두리·먹색 채움·광택)', 'script': 'docker/gemini/gacha_title_native_sc.py', 'font': FONT_LICENSE[fk]},
        'license': f'자체 제작(폰트 렌더, 이미지 모델 미사용). 폰트 {FONT_LICENSE[fk]} - 렌더 결과 이미지 사용은 해당 폰트 라이선스상 허용',
        'prompt_ref': f'gacha_title_native_sc.py JOBS[{key}]',
        'sha1': hashlib.sha1(open(p, 'rb').read()).hexdigest()[:12],
    })
    if PREV:
        for bgc, tag in (((40, 46, 60), 'dark'), ((226, 214, 190), 'light')):
            bg = Image.new('RGBA', (W, H), (*bgc, 255)); bg.alpha_composite(im); bg.convert('RGB').save(f'{PREV}/prev_{key}_{tag}.png')

# 조각 기존 qa 기록 보존(재실행 시 사람·안아트 판정 유지)
old = {}
if os.path.exists(FRAG):
    try: old = {a['key']: a for a in json.load(open(FRAG, encoding='utf-8')).get('assets', [])}
    except Exception: old = {}
merged = {**old}
for a in frag_assets:
    prev = old.get(a['key'])
    if prev and prev.get('sha1') == a['sha1']:
        for k in ('qa', 'qa_issues', 'verify'): a[k] = prev.get(k, a[k])
    merged[a['key']] = a
doc = {'note': '시나리오 배너 원어 타이틀(안아트 2026-11-08). scope gacha_ui. FE: Gacha.js theme = 서버 배너 key(art_key 없음) -> THEME_KEYS.titleNative(key) = gacha_title_<key>_native, ensureNativeTitles 는 manifestHas(gacha.title.<key>.native) 일 때만 로드. 병합: merge_fragments.mjs FRAGMENTS 에 이 파일 kind assets 1줄 추가',
       'base_path': 'assets/gacha_ui/keyart', 'assets': sorted(merged.values(), key=lambda a: int(a['key'].split('.')[2][5:]))}
json.dump(doc, open(FRAG, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('fragment', FRAG, len(doc['assets']))
print('QA_JSON', json.dumps(qa, ensure_ascii=False))
