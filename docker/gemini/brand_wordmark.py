"""게임 제목 워드마크 조판(API 호출 없음): 「레전드리 워」 + 부제 LEGENDARY WAR 를 서체 파일로 직접 렌더하고 금박/각인 후처리.
- 서체는 FONTS 표(경로·축 값·라이선스 근거)에서 고르거나, 환경변수 WM_FONT=<경로>[:wght] 로 사용자 보유(유료) 서체로 교체할 수 있다(경로만 바꾸면 됨).
- 모드:
    sheet  : 후보 서체 시안 비교표(contact sheet) → <out>/preview/wordmark_contact_sheet.png
    build  : 선택 서체 1종으로 워드마크 PNG(@3x·@1.5x) + SVG(벡터 윤곽) → <out>/
- 실행(컨테이너): docker run --rm -v "<프로젝트>":/app -w /app python:3.12 sh -c "pip install -q numpy==2.1.3 pillow==11.0.0 fonttools==4.55.0 && python -I docker/gemini/brand_wordmark.py sheet public/assets/brand"
- 의존: numpy(BSD), Pillow(MIT-CMU/HPND), fontTools(MIT). 서체: docker/gemini/fonts/<dir>/ (각 폴더에 OFL.txt 원문 보관, SHA256SUMS.txt)
"""
import os, sys, json, math
import numpy as np
from PIL import Image, ImageFont, ImageDraw, ImageFilter

FD = 'docker/gemini/fonts'
TITLE, SUB = '레전드리 워', 'LEGENDARY WAR'
# (이름, 파일, wght 축 값 또는 None, 분류, 라이선스 근거)
FONTS = [
    ('Noto Serif KR Black', 'noto_serif_kr/NotoSerifKR-VF.ttf', 900, '굵은 명조', 'SIL OFL 1.1 — github.com/google/fonts ofl/notoserifkr/OFL.txt'),
    ('Hahmlet Black', 'hahmlet/Hahmlet-VF.ttf', 900, '현대 명조(각진 세리프)', 'SIL OFL 1.1 — google/fonts ofl/hahmlet/OFL.txt'),
    ('Nanum Myeongjo ExtraBold', 'nanummyeongjo/NanumMyeongjo-ExtraBold.ttf', None, '명조', 'SIL OFL 1.1 — google/fonts ofl/nanummyeongjo/OFL.txt'),
    ('Gowun Batang Bold', 'gowunbatang/GowunBatang-Bold.ttf', None, '부드러운 바탕', 'SIL OFL 1.1 — google/fonts ofl/gowunbatang/OFL.txt'),
    ('Song Myung', 'songmyung/SongMyung-Regular.ttf', None, '서각·목판 명조', 'SIL OFL 1.1 — google/fonts ofl/songmyung/OFL.txt'),
    ('Black Han Sans', 'blackhansans/BlackHanSans-Regular.ttf', None, '초굵은 고딕(제목용)', 'SIL OFL 1.1 — google/fonts ofl/blackhansans/OFL.txt'),
    ('Do Hyeon', 'dohyeon/DoHyeon-Regular.ttf', None, '각진 고딕', 'SIL OFL 1.1 — google/fonts ofl/dohyeon/OFL.txt'),
    ('Gugi', 'gugi/Gugi-Regular.ttf', None, '장식 디스플레이', 'SIL OFL 1.1 — google/fonts ofl/gugi/OFL.txt'),
    ('Yeon Sung', 'yeonsung/YeonSung-Regular.ttf', None, '붓 손글씨', 'SIL OFL 1.1 — google/fonts ofl/yeonsung/OFL.txt'),
    ('Nanum Brush Script', 'nanumbrushscript/NanumBrushScript-Regular.ttf', None, '붓글씨', 'SIL OFL 1.1 — google/fonts ofl/nanumbrushscript/OFL.txt'),
    ('East Sea Dokdo', 'eastseadokdo/EastSeaDokdo-Regular.ttf', None, '거친 붓글씨', 'SIL OFL 1.1 — google/fonts ofl/eastseadokdo/OFL.txt'),
]
SUBFONT = ('Cinzel Bold', 'cinzel/Cinzel-VF.ttf', 700)

def font(path, size, wght=None):
    f = ImageFont.truetype(path, size)
    if wght is not None:
        try: f.set_variation_by_axes([wght])
        except Exception: pass
    return f

def text_mask(text, path, size, wght=None, tracking=0.0, ss=2):
    """글자 마스크(0~1 float). tracking = 자간(em 비율). ss 배 슈퍼샘플 후 축소."""
    f = font(path, size * ss, wght)
    widths = [f.getlength(ch) for ch in text]
    W = int(sum(widths) + tracking * size * ss * (len(text) - 1) + size * ss)
    H = int(size * ss * 1.8)
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im); x = size * ss * 0.5
    for ch, w in zip(text, widths):
        d.text((x, size * ss * 0.3), ch, font=f, fill=255); x += w + tracking * size * ss
    bb = im.getbbox(); im = im.crop(bb)
    im = im.resize((max(1, im.width // ss), max(1, im.height // ss)), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0

def pad(m, p):
    return np.pad(m, p)

def blur(m, r):
    return np.asarray(Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255.0

def dilate(m, r):
    """원형 팽창(근사): 블러 후 낮은 임계로 부드럽게 넓힘"""
    if r <= 0: return m
    b = blur(m, r * 0.9)
    return np.clip(np.maximum(m, np.clip((b - 0.03) / 0.1, 0, 1)), 0, 1)

def lerp(a, b, t): return a + (b - a) * t
def hexrgb(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)

def gold_fill(h, w, top='#FFF4C8', mid='#E9C668', low='#B8862C', bot='#6E4E12', split=0.52):
    y = np.linspace(0, 1, h)[:, None, None]
    c1, c2, c3, c4 = map(hexrgb, (top, mid, low, bot))
    g = np.where(y < split, lerp(c1, c2, y / split), lerp(c3, c4, (y - split) / (1 - split)))
    return np.broadcast_to(g, (h, w, 3)).copy()

def bevel(m, r, k=1.0):
    """왼쪽 위 광원 베벨 음영(-1~1). 글자 안쪽 가장자리에서만 크게."""
    hgt = blur(m, r)
    gy, gx = np.gradient(hgt)
    s = (gx + gy) / math.sqrt(2)
    s = s / (np.abs(s).max() + 1e-6)
    return np.clip(s * k, -1, 1) * m

def compose(layers, h, w):
    """layers: [(rgb(h,w,3), alpha(h,w))] 아래→위 순서. 결과 RGBA uint8"""
    out = np.zeros((h, w, 3), np.float32); oa = np.zeros((h, w), np.float32)
    for rgb, a in layers:
        a = np.clip(a, 0, 1); na = a + oa * (1 - a)
        out = np.where(na[..., None] > 0, (rgb * a[..., None] + out * oa[..., None] * (1 - a[..., None])) / np.maximum(na[..., None], 1e-6), 0)
        oa = na
    return np.dstack([np.clip(out, 0, 255), np.clip(oa * 255, 0, 255)]).astype(np.uint8)

def style_gold(m, em):
    """금박: 금 그라데이션 + 베벨 + 남흑 외곽선(2단) + 약한 금 글로우 + 아래 그림자"""
    p = int(em * 0.35); m = pad(m, p); h, w = m.shape
    o1 = dilate(m, em * 0.045); o2 = dilate(m, em * 0.085)
    fill = gold_fill(h, w); b = bevel(m, em * 0.035, 1.6)
    fill = fill + np.where(b[..., None] > 0, (255 - fill) * b[..., None] * 0.75, fill * b[..., None] * 0.55)
    inner = m - np.clip(m - dilate(1 - m, em * 0.012), 0, 1)  # 가장자리 얇은 띠
    rim = gold_fill(h, w, '#FFF8DA', '#F3DC8E', '#C9A040', '#7A5A18')
    sh = np.roll(np.roll(o2, int(em * 0.05), 0), int(em * 0.02), 1)
    glow = blur(o2, em * 0.07) * 0.22
    navy = np.broadcast_to(hexrgb('#0A1226'), (h, w, 3)); gd = np.broadcast_to(hexrgb('#8A6A1E'), (h, w, 3))
    return compose([(np.broadcast_to(hexrgb('#F3DC8E'), (h, w, 3)), glow), (np.broadcast_to(hexrgb('#000000'), (h, w, 3)), sh * 0.55), (navy, o2), (gd, o1 * 0.95), (navy, dilate(m, em * 0.018)), (fill, m), (rim, np.clip(inner, 0, 1) * 0.0)], h, w)

def style_engrave(m, em):
    """금속 판 위 음각/각인: 금 판(테두리 없는 둥근 띠) 위에 글자가 파여 들어간 느낌(안쪽 그림자 왼쪽 위, 반사광 오른쪽 아래)"""
    p = int(em * 0.35); m = pad(m, p); h, w = m.shape
    ys, xs = np.nonzero(m > 0.5); mg = int(em * 0.14); rr = int(em * 0.12)
    pim = Image.new('L', (w * 2, h * 2), 0); ImageDraw.Draw(pim).rounded_rectangle([(xs.min() - mg) * 2, (ys.min() - mg) * 2, (xs.max() + mg) * 2, (ys.max() + mg) * 2], radius=rr * 2, fill=255)
    plate = np.asarray(pim.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0
    plate_rgb = gold_fill(h, w, '#F6E6A8', '#D9B45A', '#B8923A', '#7A5A18', 0.5)
    pb = bevel(plate, em * 0.05, 1.4); plate_rgb = plate_rgb + np.where(pb[..., None] > 0, (255 - plate_rgb) * pb[..., None] * 0.6, plate_rgb * pb[..., None] * 0.5)
    b = bevel(m, em * 0.03, 1.8)
    groove = gold_fill(h, w, '#4A3410', '#5C4410', '#3A2A0A', '#2A1E06', 0.5)
    groove = groove + np.where(b[..., None] < 0, (np.array([255, 236, 170]) - groove) * (-b[..., None]) * 0.7, groove * b[..., None] * 0.6)
    navy = np.broadcast_to(hexrgb('#0A1226'), (h, w, 3))
    po = dilate(plate, em * 0.03)
    return compose([(navy, po), (plate_rgb, plate), (groove, m)], h, w)

def wordmark(fpath, wght, size, style, sub=True):
    m = text_mask(TITLE, fpath, size, wght, tracking=0.02)
    im = Image.fromarray((style_gold if style == 'gold' else style_engrave)(m, size), 'RGBA')
    if not sub: return im
    sm = text_mask(SUB, os.path.join(FD, SUBFONT[1]), int(size * 0.26), SUBFONT[2], tracking=0.32)
    s_im = Image.fromarray(style_gold(sm, int(size * 0.26 * 1.6)), 'RGBA')
    W = max(im.width, s_im.width + int(size * 0.9)); H = im.height + int(s_im.height * 0.78)
    cv = Image.new('RGBA', (W, H)); cv.alpha_composite(im, ((W - im.width) // 2, 0))
    sy = im.height - int(s_im.height * 0.42)
    # 부제 양옆 장식선 + 마름모
    d = ImageDraw.Draw(cv); cy = sy + s_im.height // 2; L = int(size * 0.32); gx = (W - s_im.width) // 2
    for sgn, x0 in ((-1, gx + int(size * 0.06)), (1, gx + s_im.width - int(size * 0.06))):
        x1 = x0 + sgn * L; d.line([(x0, cy), (x1, cy)], fill=(10, 18, 38, 255), width=max(3, size // 26)); d.line([(x0, cy), (x1, cy)], fill=(217, 180, 90, 255), width=max(1, size // 60))
        r = max(3, size // 28); d.polygon([(x1, cy - r), (x1 + r, cy), (x1, cy + r), (x1 - r, cy)], fill=(243, 220, 142, 255), outline=(10, 18, 38, 255))
    cv.alpha_composite(s_im, (gx, sy))
    return cv.crop(cv.getbbox())

def label(text, size=20, color=(244, 238, 220)):
    f = font(os.path.join(FD, 'noto_serif_kr/NotoSerifKR-VF.ttf'), size, 600)
    w = int(f.getlength(text)) + 8; im = Image.new('RGBA', (w, int(size * 1.5))); ImageDraw.Draw(im).text((4, 0), text, font=f, fill=color + (255,)); return im

def sheet(out):
    os.makedirs(f'{out}/preview', exist_ok=True)
    fonts = FONTS
    env = os.environ.get('WM_FONT')
    if env:
        p, _, wg = env.partition(':'); fonts = [('사용자 서체', p, int(wg) if wg else None, '사용자 지정', '사용자 제공(라이선스 사용자 확인)')]
    rows = []; info = []
    for name, rel, wght, kind, lic in fonts:
        path = rel if os.path.isabs(rel) or rel.startswith('docker/') else os.path.join(FD, rel)
        if not os.path.exists(path): info.append({'font': name, 'error': 'missing'}); continue
        g = wordmark(path, wght, 120, 'gold'); e = wordmark(path, wght, 120, 'engrave', sub=False)
        tiny = g.resize((max(1, int(g.width * 32 / g.height)), 32), Image.LANCZOS)
        tiny_t = wordmark(path, wght, 40, 'gold', sub=False); tiny_t = tiny_t.resize((max(1, int(tiny_t.width * 32 / tiny_t.height)), 32), Image.LANCZOS)
        rows.append((name, kind, lic, g, e, tiny, tiny_t)); info.append({'font': name, 'file': path, 'wght': wght, 'kind': kind, 'license': lic, 'gold_px': g.size})
    RH = 300; W = 2400; H = 70 + RH * len(rows)
    cv = Image.new('RGBA', (W, H), (11, 19, 40, 255))
    cv.alpha_composite(label('「레전드리 워」 워드마크 시안 — 왼쪽: 금박(부제 포함) / 가운데: 금속 각인 / 오른쪽: 높이 32px 축소(부제 포함·제목만) x1 과 x2', 24, (243, 220, 142)), (20, 16))
    for i, (name, kind, lic, g, e, tiny, tiny_t) in enumerate(rows):
        y = 70 + i * RH
        if i % 2: ImageDraw.Draw(cv).rectangle([0, y, W, y + RH - 1], fill=(16, 28, 58, 255))
        cv.alpha_composite(label(f'{i + 1}. {name}  ({kind})', 22), (20, y + 8)); cv.alpha_composite(label(lic, 15, (169, 180, 207)), (20, y + 40))
        gg = g if g.height <= 220 else g.resize((int(g.width * 220 / g.height), 220), Image.LANCZOS)
        if gg.width > 900: gg = gg.resize((900, int(gg.height * 900 / gg.width)), Image.LANCZOS)
        cv.alpha_composite(gg, (20, y + 70))
        ee = e if e.width <= 760 else e.resize((760, int(e.height * 760 / e.width)), Image.LANCZOS)
        if ee.height > 220: ee = ee.resize((int(ee.width * 220 / ee.height), 220), Image.LANCZOS)
        cv.alpha_composite(ee, (960, y + 70))
        x = 1760; cv.alpha_composite(tiny, (x, y + 80)); cv.alpha_composite(tiny_t, (x, y + 130))
        cv.alpha_composite(tiny_t.resize((tiny_t.width * 2, 64), Image.NEAREST), (x, y + 180))
    cv.convert('RGB').save(f'{out}/preview/wordmark_contact_sheet.png', optimize=True)
    # 밝은 배경 확인용(상위 4종)
    lb = Image.new('RGBA', (2400, 70 + 260 * min(4, len(rows))), (236, 230, 214, 255))
    for i, r in enumerate(rows[:4]):
        g = r[3]; g = g.resize((int(g.width * 220 / g.height), 220), Image.LANCZOS) if g.height > 220 else g; lb.alpha_composite(g, (20, 70 + i * 260)); lb.alpha_composite(r[4] if r[4].width < 1100 else r[4].resize((1100, int(r[4].height * 1100 / r[4].width))), (1150, 70 + i * 260))
    lb.convert('RGB').save(f'{out}/preview/wordmark_on_light.png', optimize=True)
    json.dump({'fonts': info, 'subtitle_font': {'name': SUBFONT[0], 'file': os.path.join(FD, SUBFONT[1]), 'license': 'SIL OFL 1.1 — google/fonts ofl/cinzel/OFL.txt'}}, open(f'{out}/preview/wordmark_candidates.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(info, ensure_ascii=False))

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'sheet'; out = sys.argv[2] if len(sys.argv) > 2 else 'public/assets/brand'
    if mode == 'sheet': sheet(out)
