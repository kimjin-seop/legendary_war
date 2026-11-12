# face_audit.py 결과(audit_rows.json·audit_pairs.json·_crops.npy·_chapters.json) → 범위 확정 + 문화권 내 평균연결 군집 + 접촉 시트.
# 실행(프로젝트 루트): <venv>/python docker/gemini/portrait_redo/audit/face_cluster_sheets.py [score_cut=0.78]
import json, os, sys, collections
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import squareform

A = 'docker/gemini/portrait_redo/audit'
CUT = float(sys.argv[1]) if len(sys.argv) > 1 else 0.78
rows = json.load(open(f'{A}/audit_rows.json', encoding='utf-8'))['rows']
pairs = json.load(open(f'{A}/audit_pairs.json', encoding='utf-8'))
chap = json.load(open(f'{A}/_chapters.json', encoding='utf-8'))
crops = {r[0]: tuple(int(v) for v in r[1:]) for r in np.load(f'{A}/_crops.npy', allow_pickle=True)}
FIX = {'npc_so_baeap': 'steppe', 'npc_so_sonnyeong': 'steppe'}
for c in ['npc_phrataphernes', 'npc_atropates', 'npc_orontes', 'npc_mithraustes', 'npc_barsaentes', 'npc_satibarzanes', 'npc_nabarzanes']: FIX[c] = 'middle_east'
for r in rows:
    r['culture'] = FIX.get(r['code'], r['culture']); r['chapters'] = chap.get(r['code'], [])
    r['scope'] = r['culture'] != 'none' and (r['co'] == 0 or bool(r['chapters']))
S = {r['code']: r for r in rows if r['scope']}
score = {}
for p in pairs:
    a, b = p['a'], p['b']
    if a in S and b in S and S[a]['culture'] == S[b]['culture']: score[(a, b)] = score[(b, a)] = p['score']
try: FONT = ImageFont.truetype('arial.ttf', 13); FONTB = ImageFont.truetype('arialbd.ttf', 15)
except Exception: FONT = FONTB = ImageFont.load_default()
RC = {'S': (230, 180, 40), 'A': (180, 90, 220), 'B': (60, 140, 230), 'C': (150, 150, 150)}

def face(code, w=150, h=170):
    r = S[code]; im = Image.open(os.path.join('public', r['path'])).convert('RGBA')
    if im.size != (896, 1200): im = im.resize((896, 1200), Image.LANCZOS)
    x0, y0, x1, y1 = crops[code]
    c = im.crop((x0, y0, x1, y1)); bg = Image.new('RGBA', c.size, (120, 120, 120, 255)); bg.alpha_composite(c)
    c = bg.convert('RGB'); c.thumbnail((w, h), Image.LANCZOS)
    t = Image.new('RGB', (w, h + 34), (24, 24, 28)); t.paste(c, ((w - c.width) // 2, 0))
    d = ImageDraw.Draw(t); d.rectangle([0, 0, w - 1, h + 33], outline=RC[r['rarity']], width=3)
    tag = {'redo1': ' [R1]', 'redo2': ' [R2]', 'audit': ''}[r['status']]
    d.text((4, h + 1), (r['rarity'] + ('' if r['co'] == 0 else ' npc') + tag), fill=RC[r['rarity']], font=FONTB)
    d.text((4, h + 17), code.replace('npc_', '')[:21], fill=(235, 235, 235), font=FONT)
    return t

def sheet(codes, path, title, cols=10):
    tiles = [face(c) for c in codes]; w, h = tiles[0].size
    n = len(tiles); rws = (n + cols - 1) // cols
    sh = Image.new('RGB', (cols * w, rws * h + 30), (12, 12, 14)); ImageDraw.Draw(sh).text((8, 6), title, fill=(255, 255, 255), font=FONTB)
    for i, t in enumerate(tiles): sh.paste(t, ((i % cols) * w, 30 + (i // cols) * h))
    sh.save(path, quality=88)

RK = {'S': 0, 'A': 1, 'B': 2, 'C': 3}
os.makedirs(f'{A}/by_culture', exist_ok=True); os.makedirs(f'{A}/clusters', exist_ok=True)
clusters = []
for cul in sorted({r['culture'] for r in S.values()}):
    g = [r for r in S.values() if r['culture'] == cul]
    g.sort(key=lambda r: (RK[r['rarity']], r['co'], r['code']))
    for k in range(0, len(g), 50):
        part = g[k:k + 50]
        sheet([r['code'] for r in part], f'{A}/by_culture/{cul}_{k // 50 + 1}.jpg', f'{cul} {k + 1}-{k + len(part)} / {len(g)}  (border = rarity S gold, A purple, B blue, C grey; [R1]=pilot redone, [R2]=2nd pass in progress)')
    # 군집: 2차 진행 중(R2)은 곧 바뀌므로 제외, R1 은 이웃 기준으로 포함(재작업 대상 아님)
    cand = [r['code'] for r in g if r['status'] != 'redo2']
    if len(cand) < 2: continue
    n = len(cand); D = np.ones((n, n))
    for i in range(n):
        D[i, i] = 0
        for j in range(i + 1, n): D[i, j] = D[j, i] = 1 - score.get((cand[i], cand[j]), 0)
    Z = linkage(squareform(D, checks=False), 'average'); lab = fcluster(Z, 1 - CUT, 'distance')
    for l in set(lab):
        mem = [cand[i] for i in range(n) if lab[i] == l]
        if len(mem) < 2: continue
        sc = [score[(a, b)] for i, a in enumerate(mem) for b in mem[i + 1:]]
        mem.sort(key=lambda c: (RK[S[c]['rarity']], c))
        clusters.append(dict(culture=cul, members=mem, mean=round(float(np.mean(sc)), 3), min=round(float(np.min(sc)), 3)))
clusters.sort(key=lambda c: (c['culture'], -len(c['members'])))
for i, c in enumerate(clusters):
    c['id'] = f"{c['culture']}_{i + 1:02d}"
    sheet(c['members'], f"{A}/clusters/{c['id']}.jpg", f"{c['id']}  n={len(c['members'])} mean={c['mean']} min={c['min']}", cols=min(8, len(c['members'])))
json.dump(dict(cut=CUT, scope=[{k: r[k] for k in ('code', 'name', 'culture', 'rarity', 'co', 'status', 'pools', 'showcase', 'chapters', 'path', 'det', 'beard', 'skinL', 'born')} for r in S.values()], clusters=clusters),
          open(f'{A}/audit_clusters.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
cnt = collections.Counter(r['culture'] for r in S.values())
print('scope', len(S), dict(cnt)); print('status', collections.Counter(r['status'] for r in S.values()))
print('clusters', len(clusters), 'members', sum(len(c['members']) for c in clusters))
for c in clusters: print(c['id'], len(c['members']), c['mean'], c['members'])
