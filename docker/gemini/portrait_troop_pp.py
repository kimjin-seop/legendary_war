"""일반 병종 기본 초상화 후처리: 2x2 시트(JPEG, 마젠타 배경) -> 칸 분할 -> 마젠타 키 알파(alpha_process.method_b) -> 3:4 캔버스(840x1120) PNG.
실행(컨테이너): python docker/gemini/portrait_troop_pp.py <raw폴더> <출력폴더> <culture...>
칸 순서 고정: 좌상 sword, 우상 spear, 좌하 cavalry, 우하 archer. 출력: <출력>/<culture>_<troop>.png, <출력>/qa/<culture>_sheet.png(네이비 배경 대조)
의존(pip 공식 레지스트리): pillow numpy scipy opencv-python-headless
"""
import sys, os, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from alpha_process import method_b  # noqa: E402
from scipy import ndimage as ndi  # noqa: E402

ORDER = ['sword', 'spear', 'cavalry', 'archer']
OUT_W, OUT_H = 840, 1120
MARGIN = 10  # 구분선/여백 띠에서 더 깎는 픽셀


CUR = ''
# 파란 의상(default 세트)은 마젠타와 Lab 거리가 가까워 반투명 구멍이 생김 -> 임계값 낮춤(portrait_alpha_batch.sh 의 hyujeong 사례와 같은 방식)
ALPHA = {'default': {'T_lo': 35.0, 'T_hi': 70.0}}
ORDER_V2 = ['naval', 'mage', 'healer', 'assassin']


def keyish(rgb):
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    return (r > 120) & (g < 100) & (b > 90) & (np.abs(r - b) < 110)  # 마젠타 + 분홍·보라 구분선


def clean_lines(rgb):
    """칸 구분선·패널 테두리 제거: 키색 계열이 90% 이상인 행/열의 키 계열 픽셀, 어두운 픽셀이 60% 이상인 행/열(검은 패널 테두리)의 어두운 픽셀을 순수 마젠타로 칠함."""
    out = rgb.copy()
    k = keyish(rgb)
    tot = rgb.astype(int).sum(axis=2)
    for kind, line in (('dark', tot < 150), ('bright', tot > 690)):
        for ax in (0, 1):
            kf = k.mean(axis=ax); df = line.mean(axis=ax); n = len(df)
            if kind == 'dark':
                for idx in np.where(kf > 0.9)[0]:
                    sl = (slice(None), idx) if ax == 0 else (idx, slice(None))
                    out[sl][k[sl]] = (255, 0, 255)
            thin = [i for i in np.where(df > 0.6)[0] if (df[max(0, i - 6)] < 0.3 and df[min(n - 1, i + 6)] < 0.3) or ((i < 80 or i > n - 80 or abs(i - n / 2) < 120) and (kind == 'bright' or min(df[max(0, i - 12)], df[min(n - 1, i + 12)]) < 0.3))]
            if thin: print(f'  [{CUR}] {kind} line ax={ax}: n={len(thin)} {thin[:2]}..{thin[-2:]}')
            for idx in thin:
                for d in (-2, -1, 0, 1, 2):  # 선 두께·안티앨리어싱 포함
                    j = idx + d
                    if 0 <= j < n:
                        sl = (slice(None), j) if ax == 0 else (j, slice(None))
                        near = (tot[sl] < 300) if kind == 'dark' else (tot[sl] > 560)
                        out[sl][line[sl] | k[sl] | near] = (255, 0, 255)
    return out


def split_at(frac, n):
    """중앙 35~65% 구간에서 키색 비율이 가장 높은 띠(최대치의 92% 이상 연속 구간)."""
    lo, hi = int(n * 0.35), int(n * 0.65)
    seg = frac[lo:hi]
    m = seg.max()
    c = lo + int(seg.argmax())
    a = c
    while a - 1 >= lo and frac[a - 1] >= m * 0.92: a -= 1
    b = c
    while b + 1 < hi and frac[b + 1] >= m * 0.92: b += 1
    return a, b, float(m)


def main():
    raw, out = sys.argv[1], sys.argv[2]
    os.makedirs(os.path.join(out, 'qa'), exist_ok=True)
    report = {}
    global CUR
    for cul in sys.argv[3:]:
        CUR = cul
        order = ORDER_V2 if cul.endswith('_v2') else ORDER
        name = cul[:-3] if cul.endswith('_v2') else cul
        rgb = clean_lines(np.asarray(Image.open(os.path.join(raw, f'{cul}.jpg')).convert('RGB')))
        H, W = rgb.shape[:2]
        k = keyish(rgb)
        xa, xb, xm = split_at(k.mean(axis=0), W)
        ya, yb, ym = split_at(k.mean(axis=1), H)
        cx, cy = (xa + xb) // 2, (ya + yb) // 2
        gx, gy = min((xb - xa) // 2 + 4, 14), min((yb - ya) // 2 + 4, 14)  # 얇은 구분선이면 선+4px 제거, 넓은 여백 띠는 키 처리로 투명
        CW = W // 2; CH = round(CW * 4 / 3)
        # (x0,y0,x1,y1, 명목 원점 x) — 같은 시트의 4칸이 같은 배율이 되도록 리사이즈 없이 명목 격자에 붙임
        boxes = [(0, 0, cx - gx, cy - gy, 0), (cx + gx, 0, W, cy - gy, cx), (0, cy + gy, cx - gx, H, 0), (cx + gx, cy + gy, W, H, cx)]
        tiles = []
        for troop, (x0, y0, x1, y1, nx) in zip(order, boxes):
            cell = rgb[y0:y1, x0:x1]
            rgb2, al = method_b(np.ascontiguousarray(cell), **ALPHA.get(name, {}))
            rgba = np.dstack([rgb2, (al * 255 + 0.5).astype(np.uint8)])
            lbl, nlab = ndi.label(al > 0.5)
            if nlab > 1:  # 본체와 떨어진 작은 조각(구분선 잔여·점) 제거: 가장 큰 덩어리의 2% 미만
                sz = ndi.sum(np.ones_like(al), lbl, range(1, nlab + 1)); keep = np.zeros(nlab + 1, bool); keep[1:] = sz >= sz.max() * 0.02
                drop = ~keep[lbl] & (al > 0); al = np.where(ndi.binary_dilation(drop, iterations=2) & ~keep[lbl], 0, al)
            rgba = np.dstack([rgb2, (al * 255 + 0.5).astype(np.uint8)])
            rgba[al <= 0.002, :3] = 0
            im = Image.fromarray(rgba, 'RGBA')
            ch = im.size[1]
            cv = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
            if ch > CH: im = im.crop((0, ch - CH, im.size[0], ch)); ch = CH  # 위쪽 여백에서 잘라냄
            ox = x0 - nx; im = im.crop((0, 0, min(im.size[0], CW - ox), ch)); cv.alpha_composite(im, (ox, CH - ch))  # 아래 정렬, 오른쪽 넘침은 잘라냄
            cv = cv.resize((OUT_W, OUT_H), Image.LANCZOS)
            p = os.path.join(out, f'{name}_{troop}.png')
            cv.save(p, optimize=True, compress_level=9)
            a = np.asarray(cv)[..., 3]
            bb = cv.getbbox()
            report[f'{name}_{troop}'] = {'cell': [int(x0), int(y0), int(x1), int(y1)], 'size': [OUT_W, OUT_H], 'kb': os.path.getsize(p) // 1024,
                                        'opaque_pct': round(float((a > 128).mean()) * 100, 1), 'bbox': list(bb) if bb else None,
                                        'touch': {'top': bool(a[:3].max() > 128), 'left': bool(a[:, :3].max() > 128), 'right': bool(a[:, -3:].max() > 128)}}
            tiles.append(cv)
        report[f'{cul}_split'] = {'x': [xa, xb, round(xm, 3)], 'y': [ya, yb, round(ym, 3)], 'src': [W, H]}
        # QA: 네이비(#101C3A) 위 1x4 + 얼굴 크롭 64/32px 확대
        th = 420; tw = round(th * 3 / 4)
        sheet = Image.new('RGBA', (tw * 4 + 5 * 8 + 3 * 72 + 3 * 40, th + 16), (16, 28, 58, 255))
        x = 8
        for t in tiles:
            sheet.alpha_composite(t.resize((tw, th), Image.LANCZOS), (x, 8)); x += tw + 8
        for t in tiles:  # 상단 정사각 크롭(PortraitCard 규칙) 64px / 32px
            sq = t.crop((0, round(OUT_H * 0.04), OUT_W, round(OUT_H * 0.04) + OUT_W))
            bg = Image.new('RGBA', sq.size, (16, 28, 58, 255)); bg.alpha_composite(sq)
            s64 = bg.resize((64, 64), Image.LANCZOS); s32 = bg.resize((32, 32), Image.LANCZOS)
            sheet.paste(s64, (x, 8)); sheet.paste(s32, (x, 80)); x += 72 + 40 - 40
        sheet.convert('RGB').save(os.path.join(out, 'qa', f'{cul}_sheet.png'))
    rp = os.path.join(out, 'qa', 'pp_report.json')
    old = json.load(open(rp, encoding='utf-8')) if os.path.exists(rp) else {}
    old.update(report)
    json.dump(old, open(rp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
