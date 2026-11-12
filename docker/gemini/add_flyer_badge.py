"""도트 뱃지 아틀라스에 flyer(비행) 병종 프레임 추가(안아트, 2026-11-08). API 호출 없음.
pp_pixel_badges.py 의 frame/center/fit/up 을 그대로 써서 badge.hero.flyer(32x32 금 원형)·badge.troop.flyer(30x32 은 방패)·sym.troop.flyer(24x24)
를 만들고, 기존 아틀라스(@1x/@2x/@3x)의 오른쪽 끝에 이어 붙인다(기존 프레임 좌표 불변). 심볼은 코드로 그린 펼친 날개(흰 깃 + 회청 음영 + 1px 짙은 외곽선).
실행: python docker/gemini/add_flyer_badge.py preview <out.png> | write
"""
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, 'docker/gemini')
import pp_pixel_badges as B

B.TROOP_FILL['flyer'] = ['#1A4E7E', '#3486C4', '#78C2EE']  # 하늘색(보병 청 #2C58C0 보다 밝고 청록 수병보다 푸름)
KEYS = ['badge.hero.flyer', 'badge.troop.flyer', 'sym.troop.flyer']


def wing_symbol(n):
    """24 격자 좌표로 설계한 펼친 날개 한 쌍 -> n px. 가운데 몸통(놋쇠) + 좌우 대칭 날개, 깃 사이 음영 줄."""
    S = 4  # 4배로 그린 뒤 nearest 축소(계단 정리)
    im = Image.new('RGBA', (n * S, n * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); k = n * S / 24.0
    P = lambda x, y: (round(x * k), round(y * k))
    W1, W2, W3 = (250, 250, 246, 255), (188, 200, 220, 255), (92, 108, 140, 255)
    for sx in (1, -1):
        X = lambda x: 12 + sx * (x - 12)
        # 위로 치켜든 날개: 윗변은 몸통에서 바깥 위 끝(0.5,1.5)으로, 아랫변은 칼깃 끝이 계단처럼 몸통 쪽으로 내려온다
        wing = [(12.5, 12), (10, 8.5), (7, 5.5), (4, 3), (0.5, 1.5), (1, 5), (0, 7.5), (2, 9), (1, 11.5), (3.5, 12.5), (3, 15),
                (6.5, 15), (6.5, 18), (9.5, 17), (12.5, 18.5)]
        d.polygon([P(X(x), y) for x, y in wing], fill=W2)
        d.polygon([P(X(x), y) for x, y in [(12.5, 12), (10, 8.5), (7, 5.5), (4, 3), (0.5, 1.5), (3, 7), (7, 9.5), (11, 13.5)]], fill=W1)  # 윗깃(밝음)
        for (x0, y0), (x1, y1) in (((9.5, 10.5), (1.5, 6.5)), ((10, 12.5), (2, 10)), ((10.5, 14.5), (4, 13.5)), ((11, 16), (7.5, 16.5))):
            d.line([P(X(x0), y0), P(X(x1), y1)], fill=W3, width=max(1, round(k * 0.9)))
    d.polygon([P(12, 9), P(13.5, 12), P(12, 21), P(10.5, 12)], fill=(220, 176, 64, 255))   # 몸통(놋쇠 깃대)
    d.line([P(11.6, 10.5), P(11.6, 15)], fill=(250, 226, 140, 255), width=max(1, round(k * 0.6)))
    im = im.resize((n, n), Image.NEAREST)
    a = np.asarray(im).copy(); a[..., 3] = np.where(a[..., 3] > 0, 255, 0)
    al = a[..., 3] > 0; o = np.pad(a, ((1, 1), (1, 1), (0, 0))); ap = np.pad(al, 1); add = np.zeros_like(ap)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)): add |= (~ap) & np.roll(np.roll(ap, dy, 0), dx, 1)
    o[add] = (*B.OL, 255)
    return B.trim(o)


def build():
    t = 'flyer'
    return {
        'badge.hero.flyer': B.center(B.frame('circle', 32, 32, B.RING['gold'], B.TROOP_FILL[t]), wing_symbol(20)),
        'badge.troop.flyer': B.center(B.frame('shield', 30, 32, B.RING['silver'], B.TROOP_FILL[t]), wing_symbol(18), dy=-2),
        'sym.troop.flyer': B.fit(wing_symbol(24), 24, 24),
    }


def preview(out, path):
    # 비교: 기존 gunner/naval/sword 3종 + flyer 3종, x4 nearest, 남색/밝은 바탕
    ref = []
    for tr in ('sword', 'naval', 'gunner'):
        for kk in (f'badge_hero_{tr}', f'badge_troop_{tr}', f'sym_troop_{tr}'):
            ref.append(np.asarray(Image.open(f'{B.OUT}/x1/{kk}.png').convert('RGBA')))
    items = ref + [out[k] for k in KEYS]
    cv = Image.new('RGBA', (len(items) * 140, 300), (16, 28, 58, 255))
    ImageDraw.Draw(cv).rectangle([0, 150, cv.width, 300], fill=(236, 232, 222, 255))
    for i, im in enumerate(items):
        cv.alpha_composite(Image.fromarray(B.up(im, 4), 'RGBA'), (i * 140 + 4, 4))
        cv.alpha_composite(Image.fromarray(im, 'RGBA'), (i * 140 + 4, 154))
        cv.alpha_composite(Image.fromarray(B.up(im, 3), 'RGBA'), (i * 140 + 40, 154))
    cv.save(path)


def write(out):
    for k, im in out.items():
        fn = k.replace('.', '_')
        for s in (1, 2, 3):
            Image.fromarray(B.up(im, s), 'RGBA').save(f'{B.OUT}/x{s}/{fn}.png', optimize=True)
    for s in (1, 2, 3):
        jp = f'{B.OUT}/pixel_badges@{s}x.json'; ip = f'{B.OUT}/pixel_badges@{s}x.png'
        J = json.load(open(jp, encoding='utf-8')); atlas = Image.open(ip).convert('RGBA')
        if any(k in J['frames'] for k in KEYS):
            print('skip: already has flyer', s); continue
        pad = 2 * s; x = atlas.width; comps = []
        for k in KEYS:
            u = B.up(out[k], s); h, w = u.shape[:2]
            comps.append((x, u)); J['frames'][k] = {'frame': {'x': x, 'y': pad, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
                                                    'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h}}
            x += w + pad
        cv = Image.new('RGBA', (x, atlas.height), (0, 0, 0, 0)); cv.alpha_composite(atlas, (0, 0))
        for x0, u in comps:
            cv.alpha_composite(Image.fromarray(u, 'RGBA'), (x0, pad))
        cv.save(ip, optimize=True)
        J['meta']['size'] = {'w': x, 'h': atlas.height}
        json.dump(J, open(jp, 'w', encoding='utf-8'), indent=1)
        print('atlas', s, (x, atlas.height))


if __name__ == '__main__':
    out = build()
    for k, v in out.items():
        print(k, v.shape[1], v.shape[0], B.metrics(v))
    if sys.argv[1] == 'preview':
        preview(out, sys.argv[2])
    else:
        write(out)
