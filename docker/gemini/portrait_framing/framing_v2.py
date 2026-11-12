# 초상화 프레이밍 v2 (생성 API 미사용, 알파 bbox 기준 스케일·정렬만)
# 기준: 머리 상단 y 목표 0.07(허용 0.06~0.08), 아래 잘림선·머리 중심 x 고정 확대/축소.
# 사용: python -X utf8 framing_v2.py measure | fix | sheet
import os, sys, json, shutil, statistics as st
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
PUB = os.path.join(APP, 'public')
PORT = os.path.join(PUB, 'assets', 'portraits')
BACK = os.path.join(PORT, '_orig_framing')
sys.path.insert(0, os.path.dirname(HERE))
T_HT, HT_LO, HT_HI = 0.07, 0.06, 0.08
S_MAX, S_MIN = 1.15, 0.92
SHRINK_BELOW = 0.045

def targets():
    man = json.load(open(os.path.join(PUB, 'assets', 'manifest.json'), encoding='utf-8'))['items']
    seen, t = set(), []
    for i in man:
        k = i['key']
        if not k.startswith('portrait.') or k.endswith('.thumb') or k.startswith(('portrait.troop', 'portrait.shiori')):
            continue
        if '/protagonist/' in i['path']: continue          # 표정 24장은 별도 구도 규격
        grp = 'npc' if '/npc/' in i['path'] else 'hero'
        th = next((x['path'] for x in man if x['key'] == k + '.thumb'), None)
        if i['path'] in seen: continue
        seen.add(i['path']); t.append({'key': k, 'path': i['path'], 'thumb': th, 'group': grp})
    frag = os.path.join(PORT, 'preview', 'portrait_preview_manifest_fragment.json')
    for i in json.load(open(frag, encoding='utf-8'))['items']:
        if 'ink' in i['key'] or 'shadow' in i['key']: continue
        t.append({'key': i['key'], 'path': i['path'], 'thumb': i['thumb']['path'], 'group': 'preview_new'})
    return t

def ab(p): return os.path.join(PUB, p.replace('/', os.sep))
def bk(p): return os.path.join(BACK, os.path.relpath(ab(p), PORT))

def center_run(row, cx):
    idx = np.flatnonzero(row)
    if idx.size == 0: return 0
    sp = np.flatnonzero(np.diff(idx) > 1)
    s = np.r_[idx[0], idx[sp + 1]]; e = np.r_[idx[sp], idx[-1]]
    d = np.where((s <= cx) & (e >= cx), 0, np.minimum(abs(s - cx), abs(e - cx)))
    j = int(np.argmin(d)); return int(e[j] - s[j] + 1)

def measure(im):
    W, H = im.size
    a = np.asarray(im.getchannel('A')) > 32
    rows, cols = a.sum(1), a.sum(0)
    ys, xs = np.flatnonzero(rows), np.flatnonzero(cols)
    hr = np.flatnonzero(rows >= 0.10 * W); head = int(hr[0]) if hr.size else int(ys[0])
    band = a[head + int(.03 * H): head + int(.08 * H)]
    cx = float(np.nonzero(band)[1].mean()) if band.any() else W / 2
    hw = [center_run(a[y], cx) for y in range(head + int(.02 * H), min(H, head + int(.09 * H)))]
    return {'W': W, 'H': H, 'bbox_x0': round(xs[0] / W, 4), 'bbox_x1': round((xs[-1] + 1) / W, 4),
            'occ_w': round((xs[-1] + 1 - xs[0]) / W, 4), 'occ_h': round((ys[-1] + 1 - ys[0]) / H, 4),
            'bbox_top': round(ys[0] / H, 4), 'head_top': round(head / H, 4), 'head_cx': round(cx / W, 4),
            'head_w': round(float(np.median(hw)) / W, 4),
            'cut_l': bool(a[:, :2].sum() > .05 * H), 'cut_r': bool(a[:, -2:].sum() > .05 * H),
            'cut_b': bool(a[-2:, :].sum() > .05 * W), 'cut_t': bool(a[:2, :].sum() > .02 * W)}

def transform(im, s, cx):
    W, H = im.size
    arr = np.asarray(im.convert('RGBA'), np.float32) / 255
    pm = arr.copy(); pm[..., :3] *= pm[..., 3:4]
    pim = Image.fromarray((pm * 255 + .5).astype(np.uint8), 'RGBA')
    r = pim.transform((W, H), Image.AFFINE, (1 / s, 0, cx - cx / s, 0, 1 / s, H - H / s), resample=Image.BICUBIC)
    r = np.asarray(r, np.float32) / 255; al = r[..., 3:4]
    rgb = np.where(al > .003, r[..., :3] / np.maximum(al, 1e-3), 0)
    out = np.clip(np.concatenate([rgb, al], 2), 0, 1)
    out[..., 3][out[..., 3] < 2 / 255] = 0
    return Image.fromarray((out * 255 + .5).astype(np.uint8), 'RGBA')

def load_rows():
    rows = []
    for t in targets():
        cur = ab(t['path'])
        if not os.path.exists(cur): continue
        orig = bk(t['path']) if os.path.exists(bk(t['path'])) else cur
        mo = measure(Image.open(orig).convert('RGBA'))
        mc = measure(Image.open(cur).convert('RGBA'))
        rows.append({**t, 'had_prev_fix': orig != cur, 'orig': mo, 'cur': mc})
    return rows

def decide(r):
    o = r['orig']; ht = o['head_top']
    if 'ink_' in r['key'] or 'shadow' in r['key']: return 0, 'skip_not_person', 1.0
    if o['cut_t'] or ht < 0.005: return 0, 'skip_top_cut', 1.0
    if ht > HT_HI: s = (1 - T_HT) / (1 - ht)                 # 작게 앉은 인물 → 0.07 로 확대
    elif ht < SHRINK_BELOW: s = (1 - HT_LO) / (1 - ht)       # 위가 꽉 찬 인물 → 0.06 으로 축소
    else: return 0, 'in_band', 1.0
    if s < 1:   # 축소: 좌우가 잘린 그림이면 잘린 단면이 드러나므로 불가
        if o['cut_l'] or o['cut_r']: return 0, 'skip_shrink_side_cut', s
        if not o['cut_b']: return 0, 'skip_no_bottom_cut', s
    if s > S_MAX or s < S_MIN: return 0, 'skip_scale_limit', s
    return 1, ('fix_up' if s > 1 else 'fix_down'), s

def cmd_measure():
    rows = load_rows()
    hero = [r['orig'] for r in rows if r['group'] in ('hero', 'preview_new') and not r['orig']['cut_t']]
    stats = {k: {'median': round(st.median(x[k] for x in hero), 4),
                 'p25': round(float(np.percentile([x[k] for x in hero], 25)), 4),
                 'p75': round(float(np.percentile([x[k] for x in hero], 75)), 4)} for k in ('head_top', 'occ_h', 'occ_w', 'head_w')}
    for r in rows:
        r['action'], r['reason'], r['scale'] = decide(r)
        r['scale'] = round(r['scale'], 4)
    json.dump({'stats_orig_hero_preview': stats, 'rows': rows}, open(os.path.join(HERE, 'v2_measure.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(stats))
    for r in rows:
        o, c = r['orig'], r['cur']
        if r['reason'] != 'in_band' or r['had_prev_fix']:
            print('%-34s %-11s prev=%d ht %.3f->cur %.3f occH %.3f occW %.3f hw %.3f cut[l%d r%d b%d t%d] %s s=%.3f' % (
                r['key'], r['group'], r['had_prev_fix'], o['head_top'], c['head_top'], o['occ_h'], o['occ_w'], o['head_w'],
                o['cut_l'], o['cut_r'], o['cut_b'], o['cut_t'], r['reason'], r['scale']))

def save_thumb(im, tp):
    t = im.resize((256, round(im.height * 256 / im.width)), Image.LANCZOS)
    t.save(tp, 'WEBP', quality=88, method=6)

def cmd_fix():
    data = json.load(open(os.path.join(HERE, 'v2_measure.json'), encoding='utf-8'))
    log = []
    for r in data['rows']:
        cur = ab(r['path']); b = bk(r['path'])
        if r['action'] == 0 and not r['had_prev_fix']: continue
        os.makedirs(os.path.dirname(b), exist_ok=True)
        if not os.path.exists(b): shutil.copy2(cur, b)
        tp = ab(r['thumb']) if r.get('thumb') else None
        if tp and os.path.exists(tp):
            tb = bk(r['thumb']); os.makedirs(os.path.dirname(tb), exist_ok=True)
            if not os.path.exists(tb): shutil.copy2(tp, tb)
        src = Image.open(b).convert('RGBA')
        new = transform(src, r['scale'], r['orig']['head_cx'] * src.width) if r['action'] else src.copy()
        assert new.size == src.size
        new.save(cur, optimize=True, compress_level=9)
        if tp: save_thumb(new, tp)
        m = measure(new)
        log.append({'key': r['key'], 'path': r['path'], 'thumb': r.get('thumb'), 'reason': r['reason'], 'scale': r['scale'] if r['action'] else 1.0,
                    'before': {k: r['orig'][k] for k in ('head_top', 'occ_h', 'occ_w', 'head_w')},
                    'prev_fix': {k: r['cur'][k] for k in ('head_top', 'occ_h', 'occ_w', 'head_w')} if r['had_prev_fix'] else None,
                    'after': {k: m[k] for k in ('head_top', 'occ_h', 'occ_w', 'head_w', 'cut_b')}, 'size': list(new.size)})
        print('%-30s %-18s s=%.3f ht %.3f -> %.3f' % (r['key'], r['reason'], log[-1]['scale'], r['orig']['head_top'], m['head_top']))
    json.dump(log, open(os.path.join(HERE, 'v2_fix_log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

def cmd_sheet():
    log = json.load(open(os.path.join(HERE, 'v2_fix_log.json'), encoding='utf-8'))
    cw, ch = 180, 241; cols = 6
    items = [x for x in log]
    nrow = (len(items) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (2 * cw + 16), nrow * (ch + 30)), (40, 38, 44))
    d = ImageDraw.Draw(sheet)
    def cell(p):
        im = Image.open(p).convert('RGBA').resize((cw, ch), Image.LANCZOS)
        bg = Image.new('RGBA', im.size, (92, 86, 78, 255)); bg.alpha_composite(im); return bg.convert('RGB')
    for i, x in enumerate(items):
        X = (i % cols) * (2 * cw + 16); Y = (i // cols) * (ch + 30)
        sheet.paste(cell(bk(x['path'])), (X, Y + 18)); sheet.paste(cell(ab(x['path'])), (X + cw + 4, Y + 18))
        for yy in (0.06, 0.08):
            d.line([(X, Y + 18 + int(yy * ch)), (X + 2 * cw + 4, Y + 18 + int(yy * ch))], fill=(0, 220, 255))
        d.text((X + 2, Y + 3), '%s s=%.3f %.3f>%.3f' % (x['key'].replace('portrait.', ''), x['scale'], x['before']['head_top'], x['after']['head_top']), fill=(255, 255, 255))
    sheet.save(os.path.join(HERE, 'v2_before_after.jpg'), quality=88)
    # 썸네일 일치 확인 시트(보정본 축소 vs 실제 thumb)
    print(sheet.size)

if __name__ == '__main__':
    {'measure': cmd_measure, 'fix': cmd_fix, 'sheet': cmd_sheet}[sys.argv[1]]()
