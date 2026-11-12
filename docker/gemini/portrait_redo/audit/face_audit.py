# 초상 얼굴 다양성 감사(안아트 2026-11-08). API 호출 없음, 읽기 전용(초상·manifest·DB 덤프·배너 데이터).
# 1) 대상 집합: heroes 덤프(JSON, DB 읽기 전용 tinker 로 추출) + manifest portrait.<code> + gacha_banners(pool/showcase) + 파일럿/2차 제외 목록
# 2) 얼굴 검출: OpenCV Haar(frontal_default + anime 없음) → 실패 시 피부색 블롭 휴리스틱(상단 45% 영역)
# 3) 특징: 얼굴 크롭 48x48 그레이 정규화 픽셀 + Sobel 에지 + 피부 Lab 평균 + 하관 어두움 비율(수염 대리 지표) + 얼굴 종횡비
# 4) 같은 문화권 안 쌍별 유사도 → 임계값 이상 연결요소 = 군집 후보 → 접촉 시트로 눈 확인
# 실행: <venv>/python face_audit.py <heroes.json> <redo2_codes.txt>   (프로젝트 루트에서)
import json, sys, os, hashlib, itertools, collections
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import cv2

ROOT = os.getcwd()
OUT = os.path.join(ROOT, 'docker/gemini/portrait_redo/audit')
HEROES, REDO2 = sys.argv[1], sys.argv[2]

def load_cascade(name):
    xml = open(os.path.join(cv2.data.haarcascades, name), 'r', encoding='utf-8').read()
    fs = cv2.FileStorage(xml, cv2.FILE_STORAGE_READ | cv2.FILE_STORAGE_MEMORY)
    cc = cv2.CascadeClassifier(); cc.read(fs.getFirstTopLevelNode()); return cc

CASC = [load_cascade('haarcascade_frontalface_default.xml'), load_cascade('haarcascade_frontalface_alt2.xml'), load_cascade('haarcascade_profileface.xml')]

def rgba(path):
    im = Image.open(path).convert('RGBA')
    if im.size != (896, 1200): im = im.resize((896, 1200), Image.LANCZOS)
    return im

def detect(im):
    a = np.array(im); rgb = a[..., :3]; al = a[..., 3]
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY); g[al < 20] = 128
    top = g[:600]  # 머리는 상단 절반 안
    for i, cc in enumerate(CASC):
        r = cc.detectMultiScale(top, scaleFactor=1.05, minNeighbors=4, minSize=(90, 90), maxSize=(420, 420))
        if len(r):
            x, y, w, h = max(r, key=lambda b: b[2] * b[3]); return (int(x), int(y), int(w), int(h)), 'haar%d' % i
    # 휴리스틱: 상단 45% 의 피부색(YCrCb) 최대 블롭
    ycc = cv2.cvtColor(rgb, cv2.COLOR_RGB2YCrCb)
    m = ((ycc[..., 1] > 133) & (ycc[..., 1] < 178) & (ycc[..., 2] > 77) & (ycc[..., 2] < 130) & (al > 200)).astype(np.uint8)
    m[540:] = 0
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        x, y, w, h, area = st[k]
        if area > 4000:
            s = int(max(w, h * 0.85)); cx = x + w // 2
            return (int(cx - s // 2), int(y), s, int(s * 1.1)), 'skin'
    return (300, 120, 300, 330), 'default'

def feats(im, box):
    x, y, w, h = box
    # 이마~턱까지 조금 넓게(수염 포함): 아래로 25% 확장
    x0, y0 = max(0, x - w // 10), max(0, y - h // 10); x1, y1 = min(896, x + w + w // 10), min(1200, y + int(h * 1.25))
    crop = im.crop((x0, y0, x1, y1))
    bg = Image.new('RGBA', crop.size, (128, 128, 128, 255)); bg.alpha_composite(crop); c = bg.convert('RGB')
    g = np.asarray(c.convert('L').resize((48, 56), Image.LANCZOS), np.float32)
    gn = (g - g.mean()) / (g.std() + 1e-6)
    sx = cv2.Sobel(g, cv2.CV_32F, 1, 0); sy = cv2.Sobel(g, cv2.CV_32F, 0, 1); e = np.hypot(sx, sy); e = (e - e.mean()) / (e.std() + 1e-6)
    arr = np.asarray(c, np.uint8)
    hh, ww = arr.shape[:2]
    lab = cv2.cvtColor(arr, cv2.COLOR_RGB2LAB).astype(np.float32)
    cheek = lab[int(hh * .35):int(hh * .55), int(ww * .25):int(ww * .75)].reshape(-1, 3)
    skin = np.median(cheek, 0)
    L = lab[..., 0]
    jaw = L[int(hh * .68):int(hh * .95), int(ww * .3):int(ww * .7)]
    beard = float((jaw < skin[0] - 45).mean())  # 피부보다 확연히 어두운 하관 비율 = 수염 대리 지표
    hair = L[0:int(hh * .18), int(ww * .2):int(ww * .8)]
    return dict(g=gn.ravel(), e=e.ravel(), skin=skin.tolist(), beard=beard, hairL=float(np.median(hair)), crop=(x0, y0, x1, y1))

def main():
    H = json.load(open(HEROES, encoding='utf-8'))
    redo2 = set(open(REDO2, encoding='utf-8').read().split())
    qa1 = json.load(open('docker/gemini/portrait_redo/qa.json', encoding='utf-8'))
    redo1 = {k for k in qa1 if not k.startswith('_')}
    man = json.load(open('public/assets/manifest.json', encoding='utf-8'))['items']
    pmap = {x['key'][9:]: x['path'] for x in man if x.get('key', '').startswith('portrait.') and x.get('subtype') in (None, 'npc', 'hero') and x['key'].count('.') == 1 and str(x.get('path', '')).endswith(('.webp', '.png'))}
    gb = json.load(open('database/data/gacha_banners.json', encoding='utf-8'))['banners']
    pool_of = collections.defaultdict(list); show_of = collections.defaultdict(list)
    THEME = {'sc_ch1': ['yi_sun_sin', 'gwon_yul', 'gwak_jae_u'], 'sc_ch12': ['cao_cao', 'liu_bei', 'sun_quan'], 'sc_ch20': ['takeda_shingen', 'oda_nobunaga', 'uesugi_kenshin']}
    NORMAL = ['joan_of_arc', 'genghis_khan', 'oda_nobunaga', 'guan_yu', 'alexander']
    for b in gb:
        for c in b.get('pool_codes', []): pool_of[c].append(b['key'])
        sc = THEME.get(b['key'], []) + [c for c in b.get('hero_codes', []) if c not in THEME.get(b['key'], [])]
        for c in sc[:3]: show_of[c].append(b['key'])
    for c in NORMAL: show_of[c].append('normal')
    rows = []
    for h in H:
        if h['is_protagonist'] or h['code'] not in pmap: continue
        p = pmap[h['code']]
        st = 'redo1' if h['code'] in redo1 else 'redo2' if h['code'] in redo2 else 'audit'
        rows.append(dict(code=h['code'], name=h['name_ko'], culture=h['culture'] or 'none', rarity=h['rarity'], co=h['campaign_only'], path=p, status=st,
                         pools=pool_of.get(h['code'], []), showcase=show_of.get(h['code'], []), born=h['born']))
    # 파일 공유·동일 해시
    byhash = collections.defaultdict(list)
    for r in rows:
        r['sha'] = hashlib.sha1(open(os.path.join('public', r['path']), 'rb').read()).hexdigest()[:12]; byhash[r['sha']].append(r['code'])
    F = {}; method = collections.Counter()
    for r in rows:
        im = rgba(os.path.join('public', r['path'])); box, m = detect(im); method[m] += 1
        f = feats(im, box); f['method'] = m; F[r['code']] = f; r['det'] = m; r['beard'] = round(f['beard'], 3); r['skinL'] = round(f['skin'][0], 1)
    # 문화권 내 쌍 유사도
    pairs = []
    for cul, grp in itertools.groupby(sorted(rows, key=lambda r: r['culture']), key=lambda r: r['culture']):
        grp = list(grp)
        for a, b in itertools.combinations(grp, 2):
            fa, fb = F[a['code']], F[b['code']]
            sg = float(np.dot(fa['g'], fb['g']) / len(fa['g'])); se = float(np.dot(fa['e'], fb['e']) / len(fa['e']))
            dsk = float(np.linalg.norm(np.array(fa['skin']) - np.array(fb['skin'])))
            db = abs(fa['beard'] - fb['beard'])
            score = 0.5 * sg + 0.3 * se + 0.2 * (1 - min(dsk / 40, 1)) - 0.5 * min(db / 0.4, 1) * 0.3
            pairs.append(dict(culture=cul, a=a['code'], b=b['code'], sg=round(sg, 3), se=round(se, 3), dskin=round(dsk, 1), dbeard=round(db, 3), score=round(score, 3)))
    json.dump(dict(rows=rows, dup_files={k: v for k, v in byhash.items() if len(v) > 1}, det=method), open(os.path.join(OUT, 'audit_rows.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(sorted(pairs, key=lambda p: -p['score']), open(os.path.join(OUT, 'audit_pairs.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    np.save(os.path.join(OUT, '_crops.npy'), np.array([[r['code'], *F[r['code']]['crop']] for r in rows], dtype=object), allow_pickle=True)
    print('rows', len(rows), 'pairs', len(pairs), dict(method), 'dupfiles', sum(len(v) for v in byhash.values() if len(v) > 1))

if __name__ == '__main__':
    main()
