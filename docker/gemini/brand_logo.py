"""게임 로고 변형 생성(API 호출 없음). 워드마크 렌더·효과는 brand_wordmark.py 를 재사용.
사용(컨테이너, -I 없이 같은 폴더 모듈 import 를 위해 PYTHONPATH 지정):
  PYTHONPATH=docker/gemini python docker/gemini/brand_logo.py emblem <out> <emblem.png>
  PYTHONPATH=docker/gemini python docker/gemini/brand_logo.py build  <out> <emblem.png> <slug...>      (slug: brand_wordmark.FONTS 이름 앞부분, 예 hahmlet black_han)
  WM_FONT=<경로>[:wght] 을 주면 사용자 보유 서체 1종으로 candidates/user_font 생성(서체 경로만 바꾸면 됨)
"""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw
from brand_wordmark import (FONTS, FD, TITLE, wordmark, text_mask, pad, dilate, gold_fill, hexrgb, compose)

NAVY = (11, 19, 40, 255)

def save2(im, path_noext):
    im.save(f'{path_noext}@3x.png', optimize=True)
    im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS).save(f'{path_noext}@1.5x.png', optimize=True)

def mono(im, rgb):
    """단색: 글로우(옅은 알파)는 버리고, 명도로 안쪽 디테일을 남김(어두운 남색 면은 옅게) — 실루엣 덩어리 방지"""
    a = np.asarray(im.getchannel('A')).astype(np.float32) / 255.0
    lum = np.asarray(im.convert('RGB').convert('L')).astype(np.float32) / 255.0
    hard = np.clip((a - 0.55) / 0.25, 0, 1)
    alpha = hard * np.clip(0.18 + 1.1 * lum, 0, 1)
    out = Image.new('RGBA', im.size, rgb + (0,)); out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8))); return out

def small_title(fpath, wght, h):
    """소형(높이 h px 최적화): 글로우·부제 없음, 외곽선 굵게"""
    size = h * 4
    m = text_mask(TITLE, fpath, size, wght, tracking=0.06); m = pad(m, int(size * 0.2)); hh, ww = m.shape
    o = dilate(m, size * 0.07); fill = gold_fill(hh, ww, '#FFF0B8', '#F0CF72', '#C99A3A', '#8A6A1E', 0.55)
    navy = np.broadcast_to(hexrgb('#0A1226'), (hh, ww, 3))
    im = Image.fromarray(compose([(navy, o), (fill, m)], hh, ww), 'RGBA'); im = im.crop(im.getbbox())
    return im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)

def svg_wordmark(fpath, wght, out_svg, size=200, tracking=0.02):
    """서체 윤곽 → SVG path(벡터 워드마크): 금 그라데이션 채움 + 남흑 외곽선"""
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    f = TTFont(fpath)
    if 'fvar' in f and wght is not None:
        from fontTools.varLib import instancer
        f = instancer.instantiateVariableFont(f, {'wght': wght})
    gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm; k = size / upm; asc = f['hhea'].ascent
    x = 0.0; paths = []
    for ch in TITLE:
        g = cmap.get(ord(ch)); adv = f['hmtx'][g][0] if g else upm * 0.3
        if g and ch != ' ':
            pen = SVGPathPen(gs); g_ = gs[g]; g_.draw(TransformPen(pen, (k, 0, 0, -k, x, asc * k))); paths.append(pen.getCommands())
        x += adv * k + tracking * size
    W, H = int(x + size * 0.2), int((asc - f['hhea'].descent) * k + size * 0.2)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-size * 0.1:.0f} {-size * 0.1:.0f} {W} {H}" width="{W}" height="{H}">'
           '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4C8"/><stop offset="0.5" stop-color="#E9C668"/>'
           '<stop offset="0.52" stop-color="#B8862C"/><stop offset="1" stop-color="#6E4E12"/></linearGradient></defs>'
           f'<path d="{" ".join(paths)}" fill="url(#g)" stroke="#0A1226" stroke-width="{size * 0.06:.1f}" stroke-linejoin="round" paint-order="stroke"/></svg>')
    open(out_svg, 'w', encoding='utf-8').write(svg)

def load_emblem(p):
    em = Image.open(p).convert('RGBA'); return em.crop(em.getbbox())

def emblem_set(out, emblem_png):
    os.makedirs(f'{out}/preview', exist_ok=True); em = load_emblem(emblem_png)
    S = 768; e = Image.new('RGBA', (S, S)); k = min(S / em.width, S / em.height); r = em.resize((int(em.width * k), int(em.height * k)), Image.LANCZOS); e.alpha_composite(r, ((S - r.width) // 2, (S - r.height) // 2))
    save2(e, f'{out}/logo_emblem')
    for z in (16, 32, 48): e.resize((z, z), Image.LANCZOS).save(f'{out}/favicon_{z}.png', optimize=True)
    e.resize((48, 48), Image.LANCZOS).save(f'{out}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    for z in (180, 512):
        Z = z * 2; bg = Image.new('RGBA', (Z, Z), NAVY); g = Image.new('L', (Z, Z), 0); gd = ImageDraw.Draw(g)
        for i in range(0, z, 2): gd.ellipse([Z / 2 - (z - i), Z * 0.42 - (z - i), Z / 2 + (z - i), Z * 0.42 + (z - i)], fill=int(90 * i / z))
        bg.paste(Image.new('RGBA', bg.size, (60, 83, 144, 255)), (0, 0), g)
        ee = e.resize((int(Z * 0.8), int(Z * 0.8)), Image.LANCZOS); bg.alpha_composite(ee, (int(Z * 0.1), int(Z * 0.1)))
        bg.resize((z, z), Image.LANCZOS).convert('RGB').save(f'{out}/app_icon_{z}.png', optimize=True)
    pv = Image.new('RGBA', (900, 300), NAVY); ImageDraw.Draw(pv).rectangle([450, 0, 900, 300], fill=(236, 230, 214, 255))
    for x0 in (0, 450):
        pv.alpha_composite(e.resize((200, 200), Image.LANCZOS), (x0 + 20, 50)); pv.alpha_composite(e.resize((64, 64), Image.LANCZOS), (x0 + 250, 50))
        pv.alpha_composite(e.resize((32, 32), Image.LANCZOS), (x0 + 340, 66)); pv.alpha_composite(e.resize((32, 32), Image.LANCZOS).resize((96, 96), Image.NEAREST), (x0 + 250, 150))
    pv.alpha_composite(Image.open(f'{out}/app_icon_180.png').convert('RGBA'), (0, 0)) if False else None
    pv.convert('RGB').save(f'{out}/preview/emblem_check.png', optimize=True)

def build(out, slug, fpath, wght, emblem_png):
    d = f'{out}/candidates/{slug}'; os.makedirs(d, exist_ok=True)
    wm = wordmark(fpath, wght, 240, 'gold'); title = wordmark(fpath, wght, 240, 'gold', sub=False)
    save2(wm, f'{d}/logo_wordmark'); save2(title, f'{d}/logo_wordmark_title')
    em = load_emblem(emblem_png); gap = int(wm.height * 0.12)
    eh = int(wm.height * 1.15); e1 = em.resize((int(em.width * eh / em.height), eh), Image.LANCZOS); H = max(eh, wm.height)
    h_im = Image.new('RGBA', (e1.width + gap + wm.width, H)); h_im.alpha_composite(e1, (0, (H - eh) // 2)); h_im.alpha_composite(wm, (e1.width + gap, (H - wm.height) // 2)); save2(h_im, f'{d}/logo_h')
    eh2 = int(wm.height * 1.6); e2 = em.resize((int(em.width * eh2 / em.height), eh2), Image.LANCZOS); W = max(e2.width, wm.width)
    st = Image.new('RGBA', (W, eh2 + int(gap * 0.6) + wm.height)); st.alpha_composite(e2, ((W - e2.width) // 2, 0)); st.alpha_composite(wm, ((W - wm.width) // 2, eh2 + int(gap * 0.6))); save2(st, f'{d}/logo_stack')
    for hpx in (96, 64, 32):
        t = small_title(fpath, wght, hpx); es = em.resize((int(em.width * hpx * 1.1 / em.height), int(hpx * 1.1)), Image.LANCZOS)
        cv = Image.new('RGBA', (es.width + int(hpx * 0.15) + t.width, es.height)); cv.alpha_composite(es, (0, 0)); cv.alpha_composite(t, (es.width + int(hpx * 0.15), (es.height - t.height) // 2)); cv.save(f'{d}/logo_small_h{hpx}.png', optimize=True)
    save2(mono(h_im, (255, 255, 255)), f'{d}/logo_mono_white'); save2(mono(h_im, (217, 180, 90)), f'{d}/logo_mono_gold')
    svg_wordmark(fpath, wght, f'{d}/logo_wordmark_title.svg')
    pv = Image.new('RGBA', (1800, 1260), NAVY); ImageDraw.Draw(pv).rectangle([900, 0, 1800, 1260], fill=(236, 230, 214, 255))
    for x0 in (0, 900):
        a = h_im.resize((840, int(h_im.height * 840 / h_im.width)), Image.LANCZOS); pv.alpha_composite(a, (x0 + 30, 30))
        b = st.resize((int(st.width * 500 / st.height), 500), Image.LANCZOS); pv.alpha_composite(b, (x0 + (900 - b.width) // 2, 320))
        for i, hpx in enumerate((64, 32)): pv.alpha_composite(Image.open(f'{d}/logo_small_h{hpx}.png'), (x0 + 30, 860 + i * 90))
        mw = mono(h_im, (255, 255, 255) if x0 == 0 else (10, 18, 38)); pv.alpha_composite(mw.resize((420, int(h_im.height * 420 / h_im.width)), Image.LANCZOS), (x0 + 30, 1040))
    pv.convert('RGB').save(f'{d}/preview_logo.png', optimize=True)
    return {'dir': d, 'wordmark': wm.size, 'h': h_im.size, 'stack': st.size}

if __name__ == '__main__':
    mode, out, emb = sys.argv[1], sys.argv[2], sys.argv[3]
    if mode == 'emblem': emblem_set(out, emb)
    else:
        res = []; env = os.environ.get('WM_FONT')
        if env:
            p, _, wg = env.partition(':'); res.append(build(out, 'user_font', p, int(wg) if wg else None, emb))
        for slug in sys.argv[4:]:
            name, rel, wght, *_ = next(f for f in FONTS if f[0].lower().replace(' ', '_').startswith(slug))
            res.append(build(out, slug, os.path.join(FD, rel), wght, emb))
        print(json.dumps(res, ensure_ascii=False))
