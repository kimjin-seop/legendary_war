# 초상화 프레이밍 측정·정렬(재생성 없음). 알파 기준.
# 측정: 머리 상단 y%(폭 ≥ 10%W 인 첫 행 — 창끝·깃·술처럼 가는 돌출은 제외), 머리 폭(상단 아래 2~9%H 띠에서 중앙 연속 구간 폭의 중앙값),
#       어깨 폭(상단 아래 18~38%H 띠의 중앙 연속 구간 폭 60퍼센타일), 알파 bbox, 좌/우/아래 가장자리 잘림 여부.
# 사용: python -X utf8 docker/gemini/portrait_framing.py measure   → docker/gemini/portrait_framing/measure.json + 표
#       python -X utf8 docker/gemini/portrait_framing.py fix         → 이상치 보정(원본 백업 public/assets/portraits/_orig_framing/<상대경로>)
import os, sys, json, glob, shutil
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.normpath(os.path.join(ROOT, '..', '..'))
PUB = os.path.join(APP, 'public')
OUT = os.path.join(ROOT, 'portrait_framing')
BACK = os.path.join(PUB, 'assets', 'portraits', '_orig_framing')

def targets():
    man = json.load(open(os.path.join(PUB, 'assets', 'manifest.json'), encoding='utf-8'))['items']
    t = []
    for i in man:
        k = i['key']
        if not k.startswith('portrait.') or k.endswith('.thumb') or k.startswith('portrait.troop') or k.startswith('portrait.shiori'):
            continue
        grp = 'protagonist' if '/protagonist/' in i['path'] else ('npc' if '/npc/' in i['path'] else 'hero')
        th = next((x['path'] for x in man if x['key'] == k + '.thumb'), None)
        t.append({'key': k, 'path': i['path'], 'thumb': th, 'group': grp})
    frag = os.path.join(PUB, 'assets', 'portraits', 'preview', 'portrait_preview_manifest_fragment.json')
    if os.path.exists(frag):
        for i in json.load(open(frag, encoding='utf-8'))['items']:
            t.append({'key': i['key'], 'path': i['path'], 'thumb': i['thumb']['path'], 'group': 'preview_new'})
    return t

def center_run(row, cx):
    """row: bool 배열. cx 에 가장 가까운 연속 True 구간의 폭."""
    idx = np.flatnonzero(row)
    if idx.size == 0: return 0, 0, 0
    splits = np.flatnonzero(np.diff(idx) > 1)
    starts = np.r_[idx[0], idx[splits + 1]]; ends = np.r_[idx[splits], idx[-1]]
    d = np.where((starts <= cx) & (ends >= cx), 0, np.minimum(np.abs(starts - cx), np.abs(ends - cx)))
    j = int(np.argmin(d)); return int(ends[j] - starts[j] + 1), int(starts[j]), int(ends[j])

def measure(path):
    im = Image.open(path).convert('RGBA'); W, H = im.size
    a = np.asarray(im.getchannel('A')) > 32
    cols = a.sum(0); rows = a.sum(1)
    ys = np.flatnonzero(rows); xs = np.flatnonzero(cols)
    if ys.size == 0: return None
    bb = (xs[0] / W, ys[0] / H, (xs[-1] + 1) / W, (ys[-1] + 1) / H)
    head = int(np.flatnonzero(rows >= 0.10 * W)[0])
    # 머리 중심 x: 상단 아래 3~8%H 띠의 무게중심
    band = a[head + int(0.03 * H): head + int(0.08 * H)]
    cx = float(np.nonzero(band)[1].mean()) if band.any() else W / 2
    hw = [center_run(a[y], cx)[0] for y in range(head + int(0.02 * H), min(H, head + int(0.09 * H)))]
    sw = [center_run(a[y], cx)[0] for y in range(head + int(0.18 * H), min(H, head + int(0.38 * H)))]
    return {'W': W, 'H': H, 'bbox': [round(v, 4) for v in bb], 'head_top': round(head / H, 4), 'head_cx': round(cx / W, 4),
            'head_w': round(float(np.median(hw)) / W, 4), 'shoulder_w': round(float(np.percentile(sw, 60)) / W, 4),
            'cut_left': bool(a[:, :2].sum() > 0.05 * H), 'cut_right': bool(a[:, -2:].sum() > 0.05 * H), 'cut_bottom': bool(a[-2:, :].sum() > 0.05 * W),
            'fill': round(float(a.mean()), 4)}

def cmd_measure():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for t in targets():
        p = os.path.join(PUB, t['path'].replace('/', os.sep))
        if not os.path.exists(p): continue
        m = measure(p)
        if m: rows.append({**t, **m})
    json.dump(rows, open(os.path.join(OUT, 'measure.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    import statistics as st
    for g in ('hero', 'npc', 'preview_new', 'protagonist'):
        r = [x for x in rows if x['group'] == g]
        if not r: continue
        print(g, len(r), 'head_top med %.3f' % st.median(x['head_top'] for x in r), 'head_w med %.3f' % st.median(x['head_w'] for x in r),
              'shoulder_w med %.3f' % st.median(x['shoulder_w'] for x in r))
    return rows

if __name__ == '__main__':
    if sys.argv[1] == 'measure':
        cmd_measure()

# ---------------- 보정(fix) ----------------
T_FACE = 0.217      # 영웅 중앙값 얼굴 중심 y
S_MIN, S_MAX, HT_MIN = 1.03, 1.15, 0.02

def plan(rows):
    """확대만(아래 잘림선 고정, 머리 중심 x 고정). 축소는 아래 빈 공간이 생겨 재생성 대상으로 분리."""
    seen = set(); out = []
    for x in rows:
        if x['group'] == 'protagonist' or x['face_cy'] is None or x['face_w'] < 0.08 or 'ink' in x['key'] or 'shadow' in x['key']:
            continue
        if x['path'] in seen: continue
        s = (1 - T_FACE) / (1 - x['face_cy'])
        if s <= S_MIN: continue
        s = min(s, S_MAX, (1 - HT_MIN) / (1 - x['head_top']))
        seen.add(x['path']); out.append({**x, 'scale': round(s, 4)})
    return out

def transform(im, s, cx):
    W, H = im.size
    # x' = s*(x-cx)+cx, y' = s*(y-H)+H  → 역변환 x = (x'-cx)/s+cx, y = (y'-H)/s+H
    a = 1 / s; c = cx - cx / s; e = 1 / s; f = H - H / s
    # 프리멀티플라이 리샘플(가장자리 색 번짐 방지)
    arr = np.asarray(im.convert('RGBA'), np.float32) / 255
    pm = arr.copy(); pm[..., :3] *= pm[..., 3:4]
    pim = Image.fromarray((pm * 255 + 0.5).astype(np.uint8), 'RGBA')
    r = pim.transform((W, H), Image.AFFINE, (a, 0, c, 0, e, f), resample=Image.BICUBIC)
    r = np.asarray(r, np.float32) / 255; al = r[..., 3:4]
    rgb = np.where(al > 0.003, r[..., :3] / np.maximum(al, 1e-3), 0)
    return Image.fromarray((np.clip(np.concatenate([rgb, al], 2), 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')

def cmd_fix():
    rows = json.load(open(os.path.join(OUT, 'measure.json'), encoding='utf-8'))
    P = plan(rows); done = []
    for x in P:
        src = os.path.join(PUB, x['path'].replace('/', os.sep))
        rel = os.path.relpath(src, os.path.join(PUB, 'assets', 'portraits'))
        bk = os.path.join(BACK, rel)
        os.makedirs(os.path.dirname(bk), exist_ok=True)
        if not os.path.exists(bk): shutil.copy2(src, bk)          # 원본 1회만 백업(재실행 시 원본 기준)
        im = Image.open(bk).convert('RGBA')
        new = transform(im, x['scale'], x['head_cx'] * im.width)
        new.save(src, optimize=True, compress_level=9)
        th = None
        if x.get('thumb'):
            tp = os.path.join(PUB, x['thumb'].replace('/', os.sep))
            tbk = os.path.join(BACK, os.path.relpath(tp, os.path.join(PUB, 'assets', 'portraits')))
            os.makedirs(os.path.dirname(tbk), exist_ok=True)
            if os.path.exists(tp) and not os.path.exists(tbk): shutil.copy2(tp, tbk)
            t = new.resize((256, round(new.height * 256 / new.width)), Image.LANCZOS)
            if tp.endswith('.webp'): t.save(tp, 'WEBP', quality=88, method=6)
            else: t.save(tp, optimize=True)
            th = x['thumb']
        m2 = measure(src)
        done.append({'key': x['key'], 'path': x['path'], 'thumb': th, 'scale': x['scale'], 'before': {'head_top': x['head_top'], 'face_cy': x['face_cy']},
                     'after': {'head_top': m2['head_top'], 'face_cy_est': round(1 - x['scale'] * (1 - x['face_cy']), 4), 'cut_bottom': m2['cut_bottom']},
                     'backup': os.path.relpath(bk, PUB).replace(os.sep, '/')})
        print(x['key'], x['scale'], '->', m2['head_top'])
    json.dump(done, open(os.path.join(OUT, 'fix_log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return done

if __name__ == '__main__' and sys.argv[1] == 'fix':
    cmd_fix()
