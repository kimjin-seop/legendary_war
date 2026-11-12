"""초상화 전수 '검은 얼룩' 점검(호출 없음, 수정 없음). portrait_darkspot_check.py 와 같은 기준을 public/assets/portraits/*.png 전체에 적용.
원본 후보(최신 우선): portraits/_r4/<id>_a<N>.jpg(N 큰 것) → _r3/<id>_a<N>.jpg → _r2/<id>_a<N>.jpg → _r2/<id>.jpg → raw/portraits/<id>.jpg
원본 대응이 틀리면 수치가 의미 없으므로 불투명 영역 평균 색차(mad)를 함께 출력(mad > 25 = 원본 불일치 의심 → 판정 제외).
사용(컨테이너): python -I docker/gemini/portrait_darkspot_all.py public/assets  > 결과 JSON 은 stdout"""
import sys, os, re, json, glob
import numpy as np
from PIL import Image

root = sys.argv[1] if len(sys.argv) > 1 else 'public/assets'
P = os.path.join(root, 'portraits')

def cands(pid):
    out = []
    for d in ('_r4', '_r3', '_r2'):
        fs = glob.glob(os.path.join(P, d, f'{pid}_a*.jpg'))
        fs = [f for f in fs if re.fullmatch(rf'{re.escape(pid)}_a\d+\.jpg', os.path.basename(f))]
        out += sorted(fs, key=lambda f: -int(re.search(r'_a(\d+)\.jpg$', f).group(1)))
    out += [os.path.join(P, '_r2', f'{pid}.jpg'), os.path.join(root, 'raw', 'portraits', f'{pid}.jpg')]
    return [f for f in out if os.path.exists(f)]

def measure(src, png):
    o = np.asarray(Image.open(png).convert('RGBA')).astype(int)
    im = Image.open(src).convert('RGB')
    if im.size != (o.shape[1], o.shape[0]):
        im = im.resize((o.shape[1], o.shape[0]), Image.LANCZOS)
    s = np.asarray(im).astype(int)
    op = o[..., 3] > 128
    mad = float(np.abs(s[op] - o[..., :3][op]).mean()) if op.any() else 999.0
    bad = (s.max(2) >= 120) & (o[..., :3].max(2) <= 40) & op
    return int(bad.sum()), round(mad, 1)

res = []
for png in sorted(glob.glob(os.path.join(P, '*.png'))):
    pid = os.path.basename(png)[:-4]
    best = None
    for src in cands(pid):
        n, mad = measure(src, png)
        if best is None or mad < best['mad']:
            best = {'id': pid, 'src': os.path.relpath(src, root).replace('\\', '/'), 'darkened_px': n, 'mad': mad}
        if mad <= 12:
            break
    res.append(best or {'id': pid, 'src': None, 'darkened_px': None, 'mad': None})

def grade(r):
    if r['src'] is None: return 'no_source'
    if r['mad'] > 25: return 'source_mismatch'
    n = r['darkened_px']
    return 'ok' if n <= 100 else ('minor' if n <= 1000 else 'major')
for r in res: r['grade'] = grade(r)
summary = {}
for r in res: summary[r['grade']] = summary.get(r['grade'], 0) + 1
print(json.dumps({'total': len(res), 'summary': summary, 'items': sorted(res, key=lambda r: -(r['darkened_px'] or -1))}, ensure_ascii=False, indent=1))
