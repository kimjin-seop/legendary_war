# 퀘스트 화면 UI 에셋 + 상단 로고 변형(호출 없음, 안아트 2026-11-04 — 사용자 시안 images/64.png, 팀장 전달)
#   기존 에셋 재가공만: atlas.uiskin(panel.sub 등) · bg.* 장면 · ui.logo.header@2x(사용자 제공 로고)
#   출력 public/assets/ui/quest/** + public/assets/ui/logo_topbar*/logo_emblem*/logo_plaque* + 조각 public/assets/ui/quest/manifest_fragment_quest_ui.json
#   매핑표 public/assets/ui/quest/quest_thumb_map.json (퀘스트 code → 썸네일 키, 규칙)
# 실행(docker python:3.12 + pylib_b): python -X utf8 docker/gemini/quest_ui_pp.py
import json, os
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
A = 'public/assets'; Q = f'{A}/ui/quest'; os.makedirs(f'{Q}/thumb', exist_ok=True)
MAN = json.load(open(f'{A}/manifest.json', encoding='utf-8'))
KP = {}
def walk(o):
    if isinstance(o, dict):
        if 'key' in o and 'path' in o: KP.setdefault(o['key'], o['path'])
        for v in o.values(): walk(v)
    elif isinstance(o, list):
        for v in o: walk(v)
walk(MAN)
items = []
GEN = {'script': 'docker/gemini/quest_ui_pp.py(후처리만)', 'calls': 0}
def add(key, path, extra):
    im = Image.open(path); items.append({'key': key, 'path': path.replace('public/', ''), 'type': 'image', 'size': list(im.size), 'alpha': im.mode == 'RGBA', 'format': path.rsplit('.', 1)[1],
                                         'bytes': os.path.getsize(path), 'scope': 'lazy', 'generator': GEN, 'license': '자체 생성 에셋 재가공', **extra})
# ---------- 1) 카드 프레임 9-slice(@3x 원본 = atlas.uiskin panel.sub 102x102, 인셋 45) ----------
U = f'{A}/ui_skin/atlas/ui_skin@3x'; atl = Image.open(U + '.png').convert('RGBA'); fr = json.load(open(U + '.json', encoding='utf-8'))['frames']
def sub(k): f = fr[k]['frame']; return atl.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
base = sub('panel.sub')
def up(im, s): return im.resize((im.width * s // 3, im.height * s // 3), Image.LANCZOS)
card = base.copy(); card.save(f'{Q}/card_normal@3x.png')
# 수령 가능: 테두리 금을 밝게 + 바깥 금빛 글로우(패딩 12px@3x)
pad = 12; a = np.asarray(base).astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
gold = (r > 120) & (r > b + 40) & (a[..., 3] > 0)
hi = a.copy(); hi[gold, :3] = np.clip(hi[gold, :3] * 1.25 + 20, 0, 255)
hi_im = Image.fromarray(hi.astype(np.uint8), 'RGBA')
cv = Image.new('RGBA', (base.width + 2 * pad, base.height + 2 * pad), (0, 0, 0, 0))
al = Image.new('L', cv.size, 0); al.paste(base.getchannel('A'), (pad, pad)); glow = al.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(6))
gl = Image.new('RGBA', cv.size, (255, 200, 90, 0)); gl.putalpha(glow.point(lambda v: int(v * 0.75))); cv.alpha_composite(gl); cv.alpha_composite(hi_im, (pad, pad)); cv.save(f'{Q}/card_claimable@3x.png')
done = ImageEnhance.Brightness(ImageEnhance.Color(base).enhance(0.35)).enhance(0.72); done.save(f'{Q}/card_done@3x.png')
for n, ins in [('normal', 45), ('claimable', 45 + pad), ('done', 45)]:
    src = Image.open(f'{Q}/card_{n}@3x.png'); up(src, 2).save(f'{Q}/card_{n}@2x.png', optimize=True); up(src, 1).save(f'{Q}/card_{n}.png', optimize=True); os.remove(f'{Q}/card_{n}@3x.png')
    add(f'ui.quest.card.{n}', f'{Q}/card_{n}@2x.png', {'scale': '@2x', 'slice_mode': '9', 'slice_px_at_2x': {'l': ins * 2 // 3, 'r': ins * 2 // 3, 't': ins * 2 // 3, 'b': ins * 2 // 3},
        'variants': {'x1': f'assets/ui/quest/card_{n}.png'}, 'note': {'normal': '퀘스트 카드(진행 중·기본)', 'claimable': '수령 가능 카드(밝은 금 테두리 + 바깥 금빛 글로우, 바깥 패딩 8px@2x 포함 — 배치 시 카드 영역보다 8px 크게)', 'done': '수령 완료 카드(채도·밝기 낮춤)'}[n],
        'src': 'atlas.uiskin#panel.sub'})
# ---------- 2) 우상단 배너(장면 재사용, 왼쪽 페이드) ----------
src = Image.open(f"public/{KP['bg.archive.hall']}").convert('RGB'); W, H = src.size
ban = src.crop((int(W * 0.30), int(H * 0.18), int(W * 0.30) + 1100, int(H * 0.18) + 330)).convert('RGBA')
fade = np.ones((ban.height, ban.width), np.float32); x = np.linspace(0, 1, ban.width); fade *= np.clip(x / 0.45, 0, 1)[None, :] ** 1.4
yb = np.linspace(0, 1, ban.height); fade *= np.clip((1 - yb) / 0.25, 0, 1)[:, None] ** 0.8 * 0 + np.clip((1 - yb) / 0.22, 0, 1)[:, None]
ban.putalpha(Image.fromarray((fade * 255).astype(np.uint8))); ban.save(f'{Q}/banner_top@2x.webp', 'WEBP', quality=85, method=6, alpha_quality=90)
ban.resize((550, 165), Image.LANCZOS).save(f'{Q}/banner_top.webp', 'WEBP', quality=85, method=6, alpha_quality=90)
add('ui.quest.banner', f'{Q}/banner_top@2x.webp', {'scale': '@2x', 'variants': {'x1': 'assets/ui/quest/banner_top.webp'}, 'src': 'bg.archive.hall(크롭 + 왼쪽·아래 알파 페이드)', 'note': '퀘스트 화면 우상단 장면 배너(오른쪽 위 정렬, 왼쪽으로 패널에 녹아듦). 회원 가입 버튼은 atlas.uiskin btn.primary 를 위에 얹음'})
# ---------- 3) 퀘스트 썸네일(5:3, 320x192 @2x) ----------
SBG = json.load(open(f'{A}/bg/scene/scene_bg_map.json', encoding='utf-8'))['scenes']
QMAP = {'main_stage_01': 'bg.legnica.castle_plain', 'main_stage_02': 'bg.imjin.fleet_dawn', 'main_stage_03': 'bg.archive.ink', 'main_stage_04': 'bg.panipat.dry_plain',
        'main_stage_05': 'bg.mongol.winter_steppe', 'main_stage_06': 'bg.gaugamela.plain',
        **{f'main_ch1_s{i}': SBG.get(f'ch1_s{i}_pre', 'bg.imjin.fleet_dawn') for i in range(1, 8)},
        'daily_stage_play': 'bg.battle.plain.a', 'daily_stage_win': 'bg.imjin.haengju_sunset', 'daily_gacha': 'bg.screen.gacha', 'daily_pvp': 'bg.battle.castle.a',
        'weekly_stage_win': 'bg.orleans.patay_field', 'weekly_pvp_win': 'bg.hastings.ridge', 'weekly_gacha': 'bg.archive.hall', 'weekly_equip_buy': 'bg.archive.deep'}
EVENT_DEFAULT = {'stage_play': 'bg.battle.plain.a', 'stage_win': 'bg.imjin.haengju_sunset', 'gacha_pull': 'bg.screen.gacha', 'pvp_play': 'bg.battle.castle.a', 'pvp_win': 'bg.hastings.ridge', 'equip_buy': 'bg.archive.deep'}
done_src = {}
def thumb(bgkey):
    if bgkey in done_src: return done_src[bgkey]
    im = Image.open(f"public/{KP[bgkey]}").convert('RGB'); w, h = im.size; tw = min(w, int(h * 5 / 3)); th = int(tw * 3 / 5)
    x0 = (w - tw) // 2; y0 = max(0, (h - th) // 2 - int(h * 0.05)) if h > th else 0
    t = im.crop((x0, y0, x0 + tw, y0 + th)).resize((320, 192), Image.LANCZOS)
    name = bgkey.replace('bg.', '').replace('.', '_'); p = f'{Q}/thumb/{name}.webp'; t.save(p, 'WEBP', quality=84, method=6)
    add(f'ui.quest.thumb.{name}', p, {'scale': '@2x', 'display': [160, 96], 'alpha': False, 'src': bgkey, 'note': '퀘스트 카드 왼쪽 장면 썸네일(5:3, 표시 160x96). 카드 왼쪽 모서리는 FE 가 둥근 마스크 또는 카드 프레임 아래 배치'})
    done_src[bgkey] = f'ui.quest.thumb.{name}'; return done_src[bgkey]
qmap = {c: thumb(k) for c, k in QMAP.items()}
ev = {e: thumb(k) for e, k in EVENT_DEFAULT.items()}
fallback = thumb('bg.archive.hall')
json.dump({'_note': '퀘스트 code → 썸네일 키(ui.quest.thumb.*). 찾는 순서: quests[code] → (main + subject 스테이지) scene_bg_map[<subject>_pre] 에 해당하는 썸네일이 있으면 그것 → events[event] → fallback. 새 메인 퀘스트는 subject 스테이지의 대화 배경과 같은 장면을 쓰는 것이 규칙(썸네일이 없으면 안아트가 추가 생성 없이 후처리로 만듦)',
           'quests': qmap, 'events': ev, 'fallback': fallback}, open(f'{Q}/quest_thumb_map.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# ---------- 4) 상단 로고 변형(사용자 제공 ui.logo.header@2x 1000x333 재가공) ----------
L = Image.open(f'{A}/ui/logo_header@2x.webp').convert('RGBA')
def to_h(im, h): return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
# 2026-11-14: logo_topbar 는 docker/gemini/logo_topbar_rebuild.py 가 만든다(바 금테 정렬 재구성). 여기서는 다시 쓰지 않고 항목만 기록
add('ui.logo.topbar', f'{A}/ui/logo_topbar@2x.webp', {'scale': '@2x', 'display': [266, 60], 'variants': {'x1': 'assets/ui/logo_topbar.webp'}, 'scope': 'boot', 'src': 'ui.logo.header@2x(사용자 제공) 재배치', 'generator': {'script': 'docker/gemini/logo_topbar_rebuild.py(후처리만)', 'calls': 0},
    'align': {'image_h_eq_bar_h': True, 'plaque_top_ratio': 0.0625, 'plaque_bottom_ratio': 0.849, 'emblem_ratio': [0.008, 0.992], 'x_offset_hint': 10},
    'note': '로비 상단 바용 로고(문장 + 현판 + 글자). 이미지 높이 = 상단 바 높이, 이미지 위 = 바 위. 현판 바깥 윗선 6.25%(바 윗 금띠 안쪽 12/192), 아랫선 84.9%(바 아래 가는 금선 163/192)'})
# 문장만(왼쪽 0~290px, 오른쪽 끝 25px 알파 페이드)
em = L.crop((0, 0, 290, 333)); ea = np.asarray(em).astype(np.float32); ea[..., 3] *= np.clip((290 - np.arange(290)) / 25, 0, 1)[None, :]
em = Image.fromarray(ea.astype(np.uint8), 'RGBA'); em = em.crop(em.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox())
for h, suf in [(72, ''), (144, '@2x')]: to_h(em, h).save(f'{A}/ui/logo_emblem{suf}.webp', 'WEBP', quality=92, method=6, alpha_quality=100)
add('ui.logo.emblem', f'{A}/ui/logo_emblem@2x.webp', {'scale': '@2x', 'display': [round(em.width * 72 / em.height), 72], 'variants': {'x1': 'assets/ui/logo_emblem.webp'}, 'scope': 'boot', 'src': 'ui.logo.header@2x 왼쪽 문장', 'note': '문장(방패·왕관·교차 검·리본)만. 좁은 화면·접힌 상단 바용'})
# 글자 없는 현판: 글자 영역(x 275~805, y 88~203)을 행별 오른쪽 깨끗한 면(x 808~838) 색 + 같은 세기 잡음으로 채움
P = np.asarray(L).astype(np.float32).copy(); rng = np.random.default_rng(7)
x0, x1, y0, y1 = 275, 806, 88, 224   # 글자 + 글자에 가려진 장식선까지 지움(가운데 백합 장식 x 512~568 은 아래에서 복원)
keep = P[196:250, 512:568].copy()
refR = P[y0:y1, 808:838, :3]; refL = P[y0:y1, 258:273, :3]
muR = np.median(refR, axis=1); muL = np.median(refL, axis=1); red = muL[:, 0] > muL[:, 2] + 20; muL[red] = muR[red]; sd = refR.std(axis=1).mean(axis=0) * 0.6
t = np.linspace(0, 1, x1 - x0)[None, :, None]
fill = muL[:, None, :] * (1 - t) + muR[:, None, :] * t + rng.normal(0, 1, (y1 - y0, x1 - x0, 3)) * sd
fill = np.asarray(Image.fromarray(np.clip(fill, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)
m = np.ones((y1 - y0, x1 - x0), np.float32); edge = 6
m[:, :edge] *= np.linspace(0, 1, edge)[None, :]; m[:, -edge:] *= np.linspace(1, 0, edge)[None, :]; m[:edge, :] *= np.linspace(0, 1, edge)[:, None]; m[-edge:, :] *= np.linspace(1, 0, edge)[:, None]
P[y0:y1, x0:x1, :3] = P[y0:y1, x0:x1, :3] * (1 - m[..., None]) + fill * m[..., None]
# 백합 장식 복원(밝은 금 화소만 되돌림)
kb = (keep[..., 0] > 150) & (keep[..., 0] > keep[..., 2] + 50); reg = P[196:250, 512:568]; reg[kb] = keep[kb]
pl = Image.fromarray(P.astype(np.uint8), 'RGBA')
for h, suf in [(72, ''), (144, '@2x')]: to_h(pl, h).save(f'{A}/ui/logo_plaque{suf}.webp', 'WEBP', quality=92, method=6, alpha_quality=100)
k = 72 / 333
add('ui.logo.plaque', f'{A}/ui/logo_plaque@2x.webp', {'scale': '@2x', 'display': [round(1000 * k), 72], 'variants': {'x1': 'assets/ui/logo_plaque.webp'}, 'scope': 'boot', 'src': 'ui.logo.header@2x(글자 영역만 지움)',
    'text_box_at_1x': {'x': round(x0 * k), 'y': round(y0 * k), 'w': round((x1 - x0) * k), 'h': round((y1 - y0) * k)},
    'note': '문장 + 글자 없는 현판(글자는 FE 렌더: 금색 #F2C45A~#B8862E 세로 그라데이션, 짙은 갈색 외곽선 2px, 굵은 세리프풍 한글). 아래 백합 장식선은 유지'})
json.dump({'note': '퀘스트 화면 UI + 상단 로고 변형(안아트 2026-11-04, 호출 0, 재가공만). 키 ui.quest.*, ui.logo.{topbar,emblem,plaque}', 'assets': items}, open(f'{Q}/manifest_fragment_quest_ui.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# 미리보기
pv = Image.new('RGBA', (1400, 760), (14, 17, 28, 255))
pv.alpha_composite(Image.open(f'{A}/ui/logo_topbar@2x.webp'), (10, 10)); pv.alpha_composite(Image.open(f'{A}/ui/logo_plaque@2x.webp'), (10, 170)); pv.alpha_composite(Image.open(f'{A}/ui/logo_emblem@2x.webp'), (460, 170))
pv.alpha_composite(Image.open(f'{Q}/banner_top@2x.webp').resize((660, 198)), (720, 10))
def nine(im, w, h, b):
    out = Image.new('RGBA', (w, h)); sw, sh = im.size
    for sx0, sx1, dx0, dx1 in [(0, b, 0, b), (b, sw - b, b, w - b), (sw - b, sw, w - b, w)]:
        for sy0, sy1, dy0, dy1 in [(0, b, 0, b), (b, sh - b, b, h - b), (sh - b, sh, h - b, h)]:
            out.alpha_composite(im.crop((sx0, sy0, sx1, sy1)).resize((max(1, dx1 - dx0), max(1, dy1 - dy0))), (dx0, dy0))
    return out
for i, (n, ins) in enumerate([('done', 30), ('normal', 30), ('claimable', 38)]):
    c = nine(Image.open(f'{Q}/card_{n}@2x.png').convert('RGBA'), 640 + (16 if n == 'claimable' else 0), 150 + (16 if n == 'claimable' else 0), ins)
    yy = 330 + i * 140; pv.alpha_composite(c, (10 - (8 if n == 'claimable' else 0), yy - (8 if n == 'claimable' else 0)))
    pv.alpha_composite(Image.open(f"{Q}/thumb/{qmap['main_ch1_s' + str(i + 1)].split('thumb.')[1]}.webp").convert('RGBA').resize((200, 120)), (26, yy + 15))
pv.convert('RGB').save('docker/gemini/portrait_s/preview/quest_ui_preview.jpg', quality=88); print(len(items))
