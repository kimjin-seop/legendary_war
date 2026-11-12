"""담당 F 컷신 납품(API 호출 없음). pp_cutscene_b.py 의 크롭·저장 규칙을 그대로 쓰되 산출 보고·미리보기 경로를 분리(qa_f/).
  python docker/gemini/pp_cutscene_f.py <crops.json>
  crops.json items 의 src: 'cutscene_f/<id>' 처럼 raw 하위 경로(확장자 .jpg 제외). 결과 public/assets/cutscenes/<key>.webp (1600x900)
  box: 정규화 [x, y, w, h]; w=null 이면 x 중심 높이 전체 16:9, h=null 이면 w 에서 16:9 높이 계산.
의존: pillow(libwebp 포함), numpy
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw

RAW = 'public/assets/raw'
OUT = 'public/assets/cutscenes'
QA = f'{OUT}/qa_f'
W, H = 1600, 900
TARGET, CAP = 400_000, 600_000


def norm_box(size, box):
    w, h = size
    x, y, bw, bh = box
    if bw is None:
        bh = 1.0; bw = (h * 16 / 9) / w; x = max(0.0, min(1 - bw, x - bw / 2)); y = 0.0
    elif bh is None:
        bh = (w * bw * 9 / 16) / h
    return x, y, bw, bh


def save_webp(im, path):
    for q in (84, 82, 80, 78, 75, 72, 70):
        im.save(path, 'WEBP', quality=q, method=6)
        n = os.path.getsize(path)
        if n <= TARGET:
            return q, n
    return q, n


def main(spec_path):
    spec = json.load(open(spec_path, encoding='utf-8'))
    os.makedirs(QA, exist_ok=True)
    rep_path = f'{QA}/cut_report_f.json'
    rep = json.load(open(rep_path, encoding='utf-8')) if os.path.exists(rep_path) else {}
    for src, keys in spec['items'].items():
        im = Image.open(f'{RAW}/{src}.jpg').convert('RGB')
        pv = im.copy(); pv.thumbnail((960, 960)); d = ImageDraw.Draw(pv)
        for key, op in keys.items():
            x, y, bw, bh = norm_box(im.size, op.get('box', [0.5, 0, None, 1]))
            if x < -1e-6 or y < -1e-6 or x + bw > 1.0001 or y + bh > 1.0001:
                raise SystemExit(f'{key}: 크롭이 원본 밖 {x, y, bw, bh}')
            px = (round(x * im.size[0]), round(y * im.size[1]), round((x + bw) * im.size[0]), round((y + bh) * im.size[1]))
            c = im.crop(px)
            upscale = W / c.size[0]
            c = c.resize((W, H), Image.LANCZOS)
            fn = key.replace('cutscene.', '').replace('.', '_')
            q, n = save_webp(c, f'{OUT}/{fn}.webp')
            rep[key] = {'file': f'assets/cutscenes/{fn}.webp', 'src': f'raw/{src}.jpg', 'src_size': list(im.size),
                        'crop_norm': [round(v, 4) for v in (x, y, bw, bh)], 'crop_px': list(px), 'upscale': round(upscale, 3),
                        'quality': q, 'bytes': n, 'over_target': n > TARGET, 'over_cap': n > CAP}
            d.rectangle([x * pv.size[0], y * pv.size[1], (x + bw) * pv.size[0], (y + bh) * pv.size[1]], outline=(255, 220, 0), width=3)
        pv.save(f'{QA}/{os.path.basename(src)}_crops.jpg', quality=80)
    json.dump(rep, open(rep_path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    for k in spec['items'].values():
        for key in k:
            r = rep[key]; print(key, r['bytes'], 'q', r['quality'], 'up', r['upscale'], 'CAP!' if r['over_cap'] else '')


if __name__ == '__main__':
    main(sys.argv[1])
