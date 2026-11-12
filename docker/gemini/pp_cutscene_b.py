"""컷신 일러스트 납품 + 초상화 썸네일(담당 B, API 호출 없음).
  python docker/gemini/pp_cutscene_b.py cut <crops.json>      raw/cutscene/<id>.jpg -> public/assets/cutscenes/<key>.webp (1600x900, q 82→하향, 600KB 상한)
  python docker/gemini/pp_cutscene_b.py thumbs                 portraits/**/<id>.png -> <dir>/thumb/<id>.webp (256x342, 알파, q 85)
의존: pillow(공식 휠, libwebp 포함), numpy
"""
import sys, os, json, glob
import numpy as np
from PIL import Image, ImageOps

RAW = 'public/assets/raw/cutscene'
OUT = 'public/assets/cutscenes'
W, H = 1600, 900
TARGET, CAP = 400_000, 600_000


def crop_norm(im, box):
    w, h = im.size
    x, y, bw, bh = box
    if bw is None:  # 16:9 중앙(가로 x 기준) 자르기, 높이 전체
        bh = 1.0; bw = (h * 16 / 9) / w; x = max(0.0, min(1 - bw, x - bw / 2))
    elif bh is None:
        bh = (w * bw * 9 / 16) / h
    return im.crop((round(x * w), round(y * h), round((x + bw) * w), round((y + bh) * h)))


def save_webp(im, path):
    for q in (84, 82, 80, 78, 75, 72, 70):
        im.save(path, 'WEBP', quality=q, method=6)
        n = os.path.getsize(path)
        if n <= TARGET:
            return q, n
    return q, n


def cut(spec_path):
    spec = json.load(open(spec_path))
    os.makedirs(OUT, exist_ok=True); os.makedirs(f'{OUT}/qa', exist_ok=True)
    rep = {}
    for src, keys in spec['items'].items():
        im = Image.open(f'{RAW}/{src}.jpg').convert('RGB')
        for key, op in keys.items():
            box = op.get('box', [0.5, 0, None, 1])
            c = crop_norm(im, box)
            if op.get('invert'):
                c = ImageOps.invert(c)
                c = Image.blend(c, ImageOps.grayscale(c).convert('RGB'), 0.35)
            c = c.resize((W, H), Image.LANCZOS)
            fn = key.replace('cutscene.', '').replace('.', '_')
            q, n = save_webp(c, f'{OUT}/{fn}.webp')
            rep[key] = {'file': f'assets/cutscenes/{fn}.webp', 'src': f'raw/cutscene/{src}.jpg', 'src_size': list(im.size), 'crop_norm': box, 'quality': q, 'bytes': n, 'over_cap': n > CAP, **({'invert': True} if op.get('invert') else {})}
        # 원본 위 크롭 위치 미리보기
        pv = im.copy(); pv.thumbnail((960, 960))
        from PIL import ImageDraw
        d = ImageDraw.Draw(pv); s = pv.size[0] / im.size[0]
        for key, op in keys.items():
            b = op.get('box', [0.5, 0, None, 1]); cc = crop_norm(im, b)
            x, y, bw, bh = b
            if bw is None:
                bw = (im.size[1] * 16 / 9) / im.size[0]; x = max(0.0, min(1 - bw, x - bw / 2)); bh = 1.0
            elif bh is None:
                bh = (im.size[0] * bw * 9 / 16) / im.size[1]
            d.rectangle([x * pv.size[0], y * pv.size[1], (x + bw) * pv.size[0], (y + bh) * pv.size[1]], outline=(255, 220, 0), width=3)
        pv.save(f'{OUT}/qa/{src}_crops.jpg', quality=80)
    json.dump(rep, open(f'{OUT}/qa/cut_report.json', 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({k: (v['bytes'], v['quality']) for k, v in rep.items()}))


def thumbs():
    rep = {}
    dirs = ['public/assets/portraits', 'public/assets/portraits/shiori', 'public/assets/portraits/troops']
    for d in dirs:
        os.makedirs(f'{d}/thumb', exist_ok=True)
        for p in sorted(glob.glob(f'{d}/*.png')):
            idn = os.path.splitext(os.path.basename(p))[0]
            im = Image.open(p).convert('RGBA')
            w, h = im.size
            tw, th = 256, round(256 * h / w)
            t = im.resize((tw, th), Image.LANCZOS)
            o = f'{d}/thumb/{idn}.webp'
            t.save(o, 'WEBP', quality=85, method=6, alpha_quality=90)
            rep[o.replace('public/', '')] = {'src': p.replace('public/', ''), 'size': [tw, th], 'bytes': os.path.getsize(o), 'src_bytes': os.path.getsize(p)}
    json.dump(rep, open('public/assets/portraits/thumb_report_b.json', 'w'), indent=1)
    tot = sum(v['bytes'] for v in rep.values()); src = sum(v['src_bytes'] for v in rep.values())
    print(f'thumbs {len(rep)} total {tot/1e6:.2f}MB (원본 {src/1e6:.1f}MB)')


if __name__ == '__main__':
    {'cut': lambda: cut(sys.argv[2]), 'thumbs': thumbs}[sys.argv[1]]()
