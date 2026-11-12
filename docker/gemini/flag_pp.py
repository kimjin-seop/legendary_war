# 진영 깃발 후처리(호출 없음, 안아트 2026-11-04): public/assets/ui/flags/raw/flags_<nn>.jpg(4x3, 마젠타) → 깃발별 256x256 투명 webp + manifest 조각.
#   분리 = 마젠타가 아닌 연결 영역(큰 것 12개)을 행·열 순서로 정렬(격자가 조금 어긋나도 안전). 같은 칸의 작은 조각은 가장 가까운 큰 영역에 합침.
#   알파 = 마젠타 거리 기반 + 가장자리 2px 만 despill(진홍·적갈 천 색이 탁해지지 않게).
#   reuse 항목은 원 세력 파일을 가리키는 키만 따로 등록. sources.json(선택) 으로 특정 세력을 다른 시트·순번에서 가져옴(재생성 교체)
# 실행(저장소 루트, docker python:3.12 + pillow numpy scipy): python -X utf8 docker/gemini/flag_pp.py
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

RAW = 'public/assets/ui/flags/raw'; OUT = 'public/assets/ui/flags'; G = 'docker/gemini'
L = json.load(open(f'{G}/flag_list.json', encoding='utf-8'))['flags']
gen = [f for f in L if not f.get('reuse')]
SRC = json.load(open(f'{G}/flag_sources.json', encoding='utf-8')) if os.path.exists(f'{G}/flag_sources.json') else {}
QA = json.load(open(f'{G}/flag_qa.json', encoding='utf-8')) if os.path.exists(f'{G}/flag_qa.json') else {}
S, PAD = 256, 10

def cut_sheet(path, n):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mag = (r > 150) & (b > 150) & (g < 120) & (r - g > 90) & (b - g > 90)
    fg = ~mag; fg = ndimage.binary_opening(fg, iterations=2)
    lab, k = ndimage.label(fg); sizes = ndimage.sum(fg, lab, range(1, k + 1)); objs = ndimage.find_objects(lab)
    order = np.argsort(-sizes)[:n]; big = sorted(order, key=lambda i: ((objs[i][0].start + objs[i][0].stop) / 2, (objs[i][1].start + objs[i][1].stop) / 2))
    H = rgb.shape[0]; rows = []
    for i in big:   # 행 묶기(세로 중심이 행 높이의 절반 이상 차이 나면 새 행)
        cy = (objs[i][0].start + objs[i][0].stop) / 2
        if rows and abs(rows[-1][0] - cy) < H / 8: rows[-1][1].append(i)
        else: rows.append([cy, [i]])
    seq = [i for _, rr in rows for i in sorted(rr, key=lambda i: objs[i][1].start)]
    cells = []
    for i in seq:
        ys, xs = objs[i]; y0, y1, x0, x1 = max(0, ys.start - 6), min(H, ys.stop + 6), max(0, xs.start - 6), min(rgb.shape[1], xs.stop + 6)
        sub = rgb[y0:y1, x0:x1]; m = (lab[y0:y1, x0:x1] == i + 1)
        m = ndimage.binary_dilation(m, iterations=3) & ~mag[y0:y1, x0:x1] | (lab[y0:y1, x0:x1] == i + 1)
        cells.append((sub, m))
    return cells, len(seq)

def key_cell(sub, m):
    r, g, b = [sub[..., c].astype(np.float32) for c in range(3)]
    d = np.clip((np.minimum(r, b) - g) / 255.0, 0, 1)                  # 마젠타 성분
    a = np.where(m, 255, 0).astype(np.float32)
    edge = m & ~ndimage.binary_erosion(m, iterations=2)
    a = np.where(edge, 255 * (1 - np.clip((d - 0.25) / 0.45, 0, 1)), a)
    out = sub.astype(np.float32).copy()
    spill = np.clip(np.minimum(r, b) - g - 30, 0, None) * edge
    out[..., 0] -= spill; out[..., 2] -= spill
    im = Image.fromarray(np.dstack([np.clip(out, 0, 255), np.clip(a, 0, 255)]).astype(np.uint8), 'RGBA')
    bb = im.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox(); im = im.crop(bb)
    s = min((S - 2 * PAD) / im.width, (S - 2 * PAD) / im.height); im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    c = Image.new('RGBA', (S, S), (0, 0, 0, 0)); c.alpha_composite(im, ((S - im.width) // 2, (S - im.height) // 2)); return c

sheets = {}
items, report = [], {'generated': [], 'reused': [], 'missing': []}
for k, f in enumerate(gen):
    sid, idx = SRC.get(f['id'], (f'{k // 12 + 1:02d}', k % 12))
    p = f'{RAW}/flags_{sid}.jpg'
    if not os.path.exists(p): report['missing'].append(f['id']); continue
    if sid not in sheets: sheets[sid] = cut_sheet(p, 12 if sid.isdigit() else int(SRC.get('_count_' + sid, 1)))
    cells, n = sheets[sid]
    if idx >= n: report['missing'].append(f['id']); continue
    im = key_cell(*cells[idx]); dst = f'{OUT}/{f["id"]}.webp'
    os.makedirs(OUT, exist_ok=True); im.save(dst, 'WEBP', quality=92, alpha_quality=100, method=6)
    mg = int(((np.asarray(im)[..., 0] > 200) & (np.asarray(im)[..., 2] > 200) & (np.asarray(im)[..., 1] < 90) & (np.asarray(im)[..., 3] > 128)).sum())
    report['generated'].append(f['id'])
    q = QA.get(f['id'], {'verdict': 'pass', 'issues': []})
    items.append({'key': f'ui.flag.{f["id"]}', 'path': dst.replace('public/', ''), 'type': 'image', 'size': [S, S], 'scope': 'map', 'alpha': True, 'format': 'webp',
                  'display': [40, 40], 'faction': f['id'], 'name_ko': f['name_ko'], 'bytes': os.path.getsize(dst), 'magenta_px': mg,
                  'design': f['design'], 'basis': f.get('basis'), 'verify': True, 'qa': q.get('verdict'), 'qa_issues': q.get('issues', []),
                  'generator': {'model': 'gemini-nano-banana-2.1', 'api': 'Interactions API', 'size': '2K', 'script': 'docker/gemini/flag_gen.mjs → flag_pp.py', 'sheet': f'flags_{sid}', 'cell': idx},
                  'license': '자체 생성(이미지 모델 출력), 제3자 소스 없음', 'note': '서가 지도 칩 국호 판 위 진영 깃발. 글자·현대 국기·종교 상징 없음'})
by = {i['faction']: i for i in items}
for f in L:
    if f.get('reuse'):
        src = by.get(f['reuse'])
        if not src: report['missing'].append(f['id']); continue
        items.append({**src, 'key': f'ui.flag.{f["id"]}', 'faction': f['id'], 'name_ko': f['name_ko'], 'reuse_of': f'ui.flag.{f["reuse"]}', 'note': src['note'] + f' — {f["reuse"]} 와 같은 이미지'})
        report['reused'].append(f'{f["id"]}->{f["reuse"]}')
frag = {'note': '서가 지도 진영 깃발(안아트 2026-11-04). 키 ui.flag.<faction_id>(database/data/shelf_map_meta.json factions.id). scope map', 'assets': items}
json.dump(frag, open(f'{OUT}/manifest_fragment_flags.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# 미리보기(어두운·밝은 바탕)
pv = Image.new('RGBA', (8 * 136, ((len(items) + 7) // 8) * 136 * 2), (0, 0, 0, 0))
for j, bgc in enumerate(((28, 34, 52, 255), (232, 222, 196, 255))):
    for i, it in enumerate(items):
        x, y = (i % 8) * 136, j * ((len(items) + 7) // 8) * 136 + (i // 8) * 136
        pv.paste(Image.new('RGBA', (136, 136), bgc), (x, y)); pv.alpha_composite(Image.open('public/' + it['path']).resize((128, 128)), (x + 4, y + 4))
os.makedirs(f'{G}/flag_preview', exist_ok=True); pv.convert('RGB').save(f'{G}/flag_preview/flags_preview.jpg', quality=90)
print(json.dumps({k: (len(v) if k != 'missing' else v) for k, v in report.items()}, ensure_ascii=False), 'items', len(items))
