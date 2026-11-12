# 재생성(아웃페인트) 초상 반영(호출 없음, 안아트 2026-11-02): reframe/out/<code>.png → 머리 상단 정렬(아래 잘림선·머리 중심 x 고정) →
# public/assets/portraits/<code>.png + thumb/<code>.webp(256폭 q88). 원본은 reframe_prep.py 가 _orig_framing/ 에 이미 백업(없으면 여기서 백업).
# 사용: python -X utf8 reframe_finalize.py code=scale ...   (scale 1.0 = 정렬 없음)
import os, sys, shutil, json
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from framing_v2 import transform, measure, save_thumb, PORT, BACK
log = []
for arg in sys.argv[1:]:
    code, s = arg.split('='); s = float(s)
    cur, bk = os.path.join(PORT, code + '.png'), os.path.join(BACK, code + '.png')
    tp, tb = os.path.join(PORT, 'thumb', code + '.webp'), os.path.join(BACK, 'thumb', code + '.webp')
    if not os.path.exists(bk): shutil.copy2(cur, bk)
    if not os.path.exists(tb): os.makedirs(os.path.dirname(tb), exist_ok=True); shutil.copy2(tp, tb)
    im = Image.open(os.path.join(HERE, 'reframe', 'out', code + '.png')).convert('RGBA')
    m0 = measure(im)
    new = transform(im, s, m0['head_cx'] * im.width) if s != 1.0 else im
    assert new.size == (896, 1200), new.size
    new.save(cur, optimize=True, compress_level=9); save_thumb(new, tp)
    m = measure(new)
    log.append({'code': code, 'scale': s, 'before': {k: m0[k] for k in ('head_top', 'bbox_top')},
                'after': {k: m[k] for k in ('head_top', 'bbox_top', 'occ_w', 'head_w', 'cut_l', 'cut_r', 'cut_b', 'cut_t')},
                'bytes': os.path.getsize(cur), 'thumb_bytes': os.path.getsize(tp), 'thumb_size': list(Image.open(tp).size)})
    print(json.dumps(log[-1], default=str))
# 비교 시트: 원본 | 새본(밝은/어두운 배경), 0.06·0.08 가이드
cw, ch = 300, 402; sheet = Image.new('RGB', (len(log) * (3 * cw + 20), ch + 24), (30, 30, 34)); d = ImageDraw.Draw(sheet)
for i, x in enumerate(log):
    X = i * (3 * cw + 20)
    for j, (p, bgc) in enumerate([(os.path.join(BACK, x['code'] + '.png'), (92, 86, 78)), (os.path.join(PORT, x['code'] + '.png'), (92, 86, 78)), (os.path.join(PORT, x['code'] + '.png'), (225, 215, 195))]):
        c = Image.open(p).convert('RGBA').resize((cw, ch), Image.LANCZOS); bg = Image.new('RGBA', c.size, bgc + (255,)); bg.alpha_composite(c)
        sheet.paste(bg.convert('RGB'), (X + j * cw, 24))
        for yy in (0.06, 0.08): d.line([(X + j * cw, 24 + int(yy * ch)), (X + j * cw + cw, 24 + int(yy * ch))], fill=(0, 220, 255))
    d.text((X + 4, 6), '%s  orig | new | new(light)  s=%.3f' % (x['code'], x['scale']), fill=(255, 255, 255))
sheet.save(os.path.join(HERE, 'reframe', 'final_sheet.jpg'), quality=90)
json.dump(log, open(os.path.join(HERE, 'reframe', 'finalize_log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
