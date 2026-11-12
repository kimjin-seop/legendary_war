# 뽑기 시나리오 배너 키아트 17종 후처리(API 호출 없음, 안아트 2026-11-08)
#   raw(gacha_keyart_sc_gen.mjs): public/assets/gacha_ui/raw/keyart_sc/keyart_<sc_key>[_N].jpg  (채택 후보 = gacha_keyart_sc_qa.json 의 pick)
#   산출: public/assets/gacha_ui/keyart/keyart_<sc_key>.webp (1920x1080, 기존 gacha.keyart.* 와 같은 규격·형식)
#         public/assets/gacha_ui/manifest_fragment_keyart_sc.json (kind assets, scope gacha_ui)
#         public/assets/gacha_ui/keyart_sc_theme_proposal.json (서버 art_key / FE BANNER_THEMES 제안표 데이터)
#         public/assets/gacha_ui/preview/keyart_sc_contact.jpg, keyart_sc_mock.jpg (접촉 시트, 타이틀 얹은 모의 합성)
#   주색: 이미지 실측(채도 가중 색상 히스토그램 최빈 구간) -> tint 제안(명도·채도 정규화) + 기존 테마·DYN_TINTS 와 Lab 거리 기록
# 실행(저장소 루트): python docker/gemini/gacha_keyart_sc_pp.py   의존: pillow, numpy
import json, os, io, colorsys, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont

RAW = 'public/assets/gacha_ui/raw/keyart_sc'; OUT = 'public/assets/gacha_ui/keyart'; PREV = 'public/assets/gacha_ui/preview'
os.makedirs(OUT, exist_ok=True); os.makedirs(PREV, exist_ok=True)
QA = json.load(open('docker/gemini/gacha_keyart_sc_qa.json', encoding='utf-8'))
BANNERS = {b['key']: b for b in json.load(open('database/data/gacha_banners.json', encoding='utf-8'))['banners']}
MAN = json.load(open('public/assets/manifest.json', encoding='utf-8'))
MKEYS = {i['key'] for i in MAN['items']}
KEYS = ['sc_ch11', 'sc_ch13', 'sc_ch14', 'sc_ch15', 'sc_ch16', 'sc_ch17', 'sc_ch18', 'sc_ch19', 'sc_ch21', 'sc_ch22', 'sc_ch23', 'sc_ch24', 'sc_ch25', 'sc_ch101', 'sc_ch102', 'sc_ch103', 'sc_ch104']
EXIST = {'imjin': 0x2a6fa8, 'conquest': 0xb8862b, 'three_kingdoms': 0xa83a2a, 'europe': 0x1f3a8a, 'sengoku': 0x7a3aa8, 'normal': 0x2fb5a6}
DYN = [0x2f7fbf, 0xc0503a, 0x3f9a5a, 0x8a4fc0, 0xc98a2a, 0x2a9a9a, 0xb84a7a, 0x5a6fc8, 0x8a9a2a, 0xd0683a, 0x3a7a5a, 0xa04a4a, 0x4a8ac8, 0x9a6a3a, 0x6a4aa8, 0x3aa07a, 0xc85a8a, 0x7a8aa0, 0xb0902a, 0x5a9ab8]
# 대표 영웅 3인(화면 왼쪽 -> 가운데 -> 오른쪽, layout 'ltr'). 서버 hero_codes(쇼케이스 = 아군 확정자) 안에서 고름. 비어 있는 배너는 [] (서버 선택)
HEROES = {
    'sc_ch11': ['seo_hui', 'gang_gamchan', 'npc_gang_min_cheom'], 'sc_ch13': ['npc_beopmin', 'kim_yusin', 'npc_kim_pumil'],
    'sc_ch14': ['npc_ondal', 'eulji_mundeok', 'npc_yeon_jayu'], 'sc_ch15': ['fabius_maximus', 'scipio_africanus', 'npc_publius_scipio'],
    'sc_ch16': ['npc_la_hire', 'joan_of_arc', 'npc_gilles_de_rais'], 'sc_ch17': ['npc_parmenion', 'alexander', 'npc_craterus'],
    'sc_ch18': ['npc_jebe', 'genghis_khan', 'npc_subutai'], 'sc_ch19': ['npc_gokbori', 'saladin', 'npc_qaraqush'],
    'sc_ch21': ['npc_baidar', 'npc_batu', 'npc_kadan'], 'sc_ch22': ['npc_humayun', 'npc_babur', 'npc_chin_timur_sultan'],
    'sc_ch23': ['npc_odo_bayeux', 'william_i', 'npc_william_fitzosbern'], 'sc_ch24': ['npc_eudes_aquitaine', 'charles_martel', 'npc_childebrand'],
    'sc_ch25': ['npc_tran_quang_khai', 'tran_hung_dao', 'npc_pham_ngu_lao'], 'sc_ch101': [], 'sc_ch102': ['heo_jun'], 'sc_ch103': [], 'sc_ch104': ['saladin'],
}
GEN = {'model': 'gemini-nano-banana-2.1', 'api': 'Interactions API', 'size': '2K', 'script': 'docker/gemini/gacha_keyart_sc_gen.mjs + gacha_keyart_sc_style.mjs / gacha_keyart_sc_pp.py'}
LIC = '자체 생성(이미지 모델 출력 + 후처리), 제3자 소스 없음. 모델 출력물 상업 이용 약관은 사람 확인'

def hx(c): return '#%06X' % c
def to_int(rgb): return (int(rgb[0]) << 16) | (int(rgb[1]) << 8) | int(rgb[2])
def lab(c):
    rgb = np.array([(c >> 16) & 255, (c >> 8) & 255, c & 255]) / 255.0
    rgb = np.where(rgb > 0.04045, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    xyz = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]) @ rgb / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])
def de(a, b): return float(np.linalg.norm(lab(a) - lab(b)))

def main_color(im):
    a = np.asarray(im.resize((320, 180))).reshape(-1, 3) / 255.0
    hsv = np.array([colorsys.rgb_to_hsv(*p) for p in a])
    w = hsv[:, 1] * hsv[:, 2] * (hsv[:, 2] > 0.18)
    bins = (hsv[:, 0] * 24).astype(int) % 24
    hist = np.bincount(bins, weights=w, minlength=24); hist = hist + 0.5 * np.roll(hist, 1) + 0.5 * np.roll(hist, -1)
    b = int(hist.argmax()); sel = (np.abs(((bins - b + 12) % 24) - 12) <= 1) & (w > 0)
    rgb = (a[sel] * w[sel, None]).sum(0) / max(w[sel].sum(), 1e-6)
    avg = a.mean(0)
    return to_int(rgb * 255), to_int(avg * 255)

def tint_from(c, s=None, v=None):
    r, g, b = ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255
    h, s0, v0 = colorsys.rgb_to_hsv(r, g, b)
    s1 = s if s is not None else min(max(s0, 0.45), 0.78); v1 = v if v is not None else min(max(v0, 0.55), 0.78)
    return to_int(np.array(colorsys.hsv_to_rgb(h, s1, v1)) * 255)

def crop_bands(im):
    L = np.asarray(im.convert('L')).astype(float); flat = L.std(1) < 4; hh = L.shape[0]; t0 = 0
    while t0 < hh and flat[t0]: t0 += 1
    b0 = hh
    while b0 > 0 and flat[b0 - 1]: b0 -= 1
    band = [round(t0 / hh, 3), round(b0 / hh, 3)]
    if t0 or b0 < hh: im = im.crop((0, t0, im.width, b0))
    w, h = im.size; tw = round(h * 16 / 9)
    im = im.crop(((w - tw) // 2, 0, (w - tw) // 2 + tw, h)) if tw <= w else im.crop((0, (h - round(w * 9 / 16)) // 2, w, (h - round(w * 9 / 16)) // 2 + round(w * 9 / 16)))
    return im.resize((1920, 1080), Image.LANCZOS), band

def save_webp(im, path, target=200_000):
    lo, hi, best = 50, 92, None
    while lo <= hi:
        q = (lo + hi) // 2; b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=6)
        if b.tell() <= target: best = (q, b.getvalue()); lo = q + 1
        else: hi = q - 1
    if best is None: b = io.BytesIO(); im.save(b, 'WEBP', quality=50, method=6); best = (50, b.getvalue())
    open(path, 'wb').write(best[1]); return best[0]

def zone_stats(im):
    L = np.asarray(im.convert('L')).astype(float)
    t = L[int(1080 * .15):int(1080 * .60), int(1920 * .70):]; c = L[int(1080 * .1):int(1080 * .8), int(1920 * .2):int(1920 * .8)]; bt = L[int(1080 * .8):, :]
    return {'title_zone_lum_mean': round(t.mean(), 1), 'title_zone_lum_std': round(t.std(), 1), 'center_lum_std': round(c.std(), 1), 'bottom20_lum_mean': round(bt.mean(), 1)}

items, prop, done, thumbs = [], [], {}, []
for k in KEYS:
    q = QA.get(f'gacha.keyart.{k}', {})
    if q.get('verdict') in (None, 'fail', 'not_checked') or not q.get('pick'): print('skip', k, q.get('verdict')); continue
    src = f"{RAW}/keyart_{k}{q['pick'] if q['pick'] != 'base' else ''}.jpg"
    im, band = crop_bands(Image.open(src).convert('RGB'))
    p = f'{OUT}/keyart_{k}.webp'; qual = save_webp(im, p)
    mc, avg = main_color(im); tint = int(q['tint_override'], 16) if q.get('tint_override') else tint_from(mc)
    zs = zone_stats(im); done[k] = (im, tint)
    b = BANNERS[k]
    items.append({'key': f'gacha.keyart.{k}', 'path': p.replace('public/', ''), 'type': 'image', 'size': [1920, 1080], 'scope': 'gacha_ui', 'alpha': False, 'blend': 'normal', 'scale': '@1x', 'display': [1920, 1080],
                  'note': f"시나리오 배너 {k}({b['title']}) 전용 풀블리드 키아트. 영웅 없음·글자 없음 — FE 가 쇼케이스 초상·원어 타이틀 합성. 가운데 60% 영웅 자리, 오른쪽 30% 타이틀 자리. cover 배치. 텍스처 gacha_keyart_{k}(서버 art_key 없음 -> FE theme = key)",
                  'qa': q['verdict'], 'qa_issues': q.get('issues', []), 'verify': bool(q.get('verify')), 'bytes': os.path.getsize(p),
                  'palette': {'main_measured': hx(mc), 'avg_measured': hx(avg), 'tint': hx(tint), 'intent': q.get('intent')}, 'zone_stats': zs,
                  'generator': GEN, 'license': LIC, 'prompt_ref': f'gacha_keyart_sc_style.mjs JOBS.keyart_sc[keyart_{k}]', 'raw': src, 'webp_quality': qual, 'band_crop': band})
    heroes = HEROES[k]; miss = [h for h in heroes if f'portrait.{h}' not in MKEYS]
    prop.append({'key': k, 'art_key': k, 'title': b['title'], 'sub': b.get('sub'), 'tint': hx(tint), 'tint_js': '0x%06x' % tint, 'nativeTitle': f'gacha.title.{k}.native' in MKEYS or os.path.exists(f'{OUT}/title_{k}_native.png'),
                 'heroes': heroes, 'layout': 'ltr' if len(heroes) == 3 else None, 'heroes_missing_portrait_in_manifest': miss, 'server_hero_codes': b.get('hero_codes', [])})
    print(k, 'q', qual, os.path.getsize(p) // 1024, 'KB', 'main', hx(mc), 'tint', hx(tint), zs)

# 색 거리(Lab ΔE): 새 tint 끼리 / 기존 테마 / DYN_TINTS
for r in prop:
    t = int(r['tint'][1:], 16)
    others = [(o['key'], int(o['tint'][1:], 16)) for o in prop if o['key'] != r['key']]
    r['min_de_new'] = min(((round(de(t, c), 1), kk) for kk, c in others), default=None)
    r['min_de_existing'] = min((round(de(t, c), 1), kk) for kk, c in EXIST.items())
    r['min_de_dyn'] = min((round(de(t, c), 1), hx(c)) for c in DYN)
    print(r['key'], r['tint'], 'new', r['min_de_new'], 'exist', r['min_de_existing'], 'dyn', r['min_de_dyn'])

frag = {'note': '뽑기 시나리오 배너 17종 전용 키아트(안아트 2026-11-08). scope gacha_ui. FE: Gacha.js theme = 서버 배너 key(art_key 없음) -> THEME_KEYS.keyart(key) = gacha_keyart_<key>, 있으면 cover 로 자동 사용. 병합: merge_fragments.mjs FRAGMENTS 에 이 파일 kind assets 1줄 추가(윤프론)',
        'base_path': 'assets/gacha_ui/keyart', 'assets': items, 'total_bytes': sum(i['bytes'] for i in items)}
json.dump(frag, open('public/assets/gacha_ui/manifest_fragment_keyart_sc.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump({'note': '시나리오 배너 키아트 적용 제안표(안아트 2026-11-08). key = 서버 배너 key = FE BANNER_THEMES key = 텍스처 접미(gacha_keyart_<key>). heroes = 화면 왼쪽->가운데->오른쪽(layout ltr), 서버 hero_codes 중 선택. tint = 키아트 실측 주색 정규화. min_de_* = Lab 색차(낮을수록 비슷)',
           'themes': prop}, open('public/assets/gacha_ui/keyart_sc_theme_proposal.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# 접촉 시트(4열) + 모의 합성(가운데 영웅 자리 표시 + 오른쪽 원어 타이틀)
try: font = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 18)
except Exception: font = ImageFont.load_default()
ks = list(done); cols = 4; W, H = 480, 270; rows = (len(ks) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, (H + 26) * rows), (16, 16, 20)); mock = Image.new('RGB', (W * cols, (H + 26) * rows), (16, 16, 20))
for i, k in enumerate(ks):
    im, tint = done[k]; x, y = (i % cols) * W, (i // cols) * (H + 26)
    th = im.resize((W, H), Image.LANCZOS); sheet.paste(th, (x, y))
    d = ImageDraw.Draw(sheet); d.rectangle([x, y + H, x + W, y + H + 26], fill=((tint >> 16) & 255, (tint >> 8) & 255, tint & 255)); d.text((x + 6, y + H + 2), f"{k} {BANNERS[k]['title']} {hx(tint)}", fill=(255, 255, 255), font=font)
    m = th.convert('RGBA'); ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
    for cx, hh, tt in ((0.5, 0.98, -0.02), (0.2, 0.82, 0.08), (0.8, 0.82, 0.08)):  # 데스크톱 3인 배치 근사(가로 22%~62% 구간)
        px = W * (0.22 + 0.40 * cx); od.ellipse([px - W * 0.07, H * (0.1 + tt), px + W * 0.07, H * (0.1 + tt) + H * 0.9 * hh], fill=(20, 20, 30, 120))
    m.alpha_composite(ov)
    tp = f'{OUT}/title_{k}_native.png'
    if os.path.exists(tp):
        t = Image.open(tp).convert('RGBA'); t = t.resize((int(W * 0.34), int(W * 0.34 * t.height / t.width)), Image.LANCZOS); m.alpha_composite(t, (int(W * 0.64), int(H * 0.2)))
    mock.paste(m.convert('RGB'), (x, y)); d2 = ImageDraw.Draw(mock); d2.text((x + 6, y + H + 2), f"{k} {BANNERS[k]['title']}", fill=(230, 230, 230), font=font)
sheet.save(f'{PREV}/keyart_sc_contact.jpg', quality=86); mock.save(f'{PREV}/keyart_sc_mock.jpg', quality=86)
print('items', len(items), 'total KB', frag['total_bytes'] // 1024)
