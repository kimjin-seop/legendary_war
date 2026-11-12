# 퀘스트 에셋 보정 2차(호출 없음, 안아트 2026-11-04 — 팀장 요청)
#  (1) ui.quest.thumb.* 재처리: 시안(images/64.png) 톤 — 밝기·채도·대비 + 따뜻한 톤(과하지 않게) → FE 가산 혼합 보정 불필요
#  (2) 썸네일 둥근 모서리 알파(1x 4px = @2x 8px)
#  (3) ui.quest.btn.progress: 진한 남색 바탕 + 얇은 금테 3-slice(@2x 인셋 기록)
#  (4) atlas.uiskin 에 ico.crown 프레임 추가(전투 HUD 아이콘 원본 시트 battle_icons.jpg 의 왕관 칸에서 생성, 아틀라스 아래에 한 줄 덧붙임 — 기존 프레임 좌표 불변)
# 실행(docker python:3.12 + pylib_b): python -X utf8 docker/gemini/quest_fix_pp.py
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance
from scipy import ndimage
A = 'public/assets'; Q = f'{A}/ui/quest'
fr = json.load(open(f'{Q}/manifest_fragment_quest_ui.json', encoding='utf-8')); items = fr['assets']
KP = {}
def walk(o):
    if isinstance(o, dict):
        if 'key' in o and 'path' in o: KP.setdefault(o['key'], o['path'])
        for v in o.values(): walk(v)
    elif isinstance(o, list):
        for v in o: walk(v)
walk(json.load(open(f'{A}/manifest.json', encoding='utf-8')))
def warm(im):
    mean = np.asarray(im.convert('L')).mean() / 255; kb = float(np.clip(0.46 / max(mean, 1e-3), 1.12, 1.75))   # 어두운 장면일수록 더 밝게(평균 밝기 약 0.46 목표)
    im = Image.fromarray(np.clip(255 * (np.asarray(im).astype(np.float32) / 255) ** (1 / (1 + (kb - 1) * 0.6)), 0, 255).astype(np.uint8)); im = ImageEnhance.Brightness(im).enhance(1 + (kb - 1) * 0.4); im = ImageEnhance.Contrast(im).enhance(1.12); im = ImageEnhance.Color(im).enhance(1.35)
    a = np.asarray(im).astype(np.float32); a[..., 0] *= 1.06; a[..., 1] *= 1.02; a[..., 2] *= 0.92   # 따뜻한 톤(약하게)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
def rounded(im, r):
    m = Image.new('L', (im.width * 4, im.height * 4), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width * 4 - 1, im.height * 4 - 1), r * 4, fill=255)
    out = im.convert('RGBA'); out.putalpha(m.resize(im.size, Image.LANCZOS)); return out
for it in items:
    if not it['key'].startswith('ui.quest.thumb.'): continue
    bgk = it['src']; im = Image.open(f"public/{KP[bgk]}").convert('RGB'); w, h = im.size; tw = min(w, int(h * 5 / 3)); th = int(tw * 3 / 5)
    x0 = (w - tw) // 2; y0 = max(0, (h - th) // 2 - int(h * 0.05)) if h > th else 0
    t = warm(im.crop((x0, y0, x0 + tw, y0 + th)).resize((320, 192), Image.LANCZOS)); t = rounded(t, 8)
    p = f"public/{it['path']}"; t.save(p, 'WEBP', quality=86, method=6, alpha_quality=100)
    it.update(bytes=os.path.getsize(p), alpha=True, corner_radius={'x1': 4, 'x2': 8}, tone='장면별 자동 밝기(평균 0.46 목표, 감마+밝기) · 대비 1.12 · 채도 1.35 · 따뜻한 톤(R×1.06 G×1.02 B×0.92) — FE 가산 혼합 보정 제거 가능', revision='r2(2026-11-04)')
# (3) 진행 중 버튼 3-slice(@2x 300x88, 인셋 l/r 26)
def btn(w=300, h=88, S=4):
    c = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0)); d = ImageDraw.Draw(c); r = 16 * S
    d.rounded_rectangle((0, 2 * S, w * S - 1, h * S - 1), r, fill=(6, 8, 16, 150))                      # 아래 그림자
    d.rounded_rectangle((0, 0, w * S - 1, h * S - 4 * S), r, fill=(122, 86, 30, 255))                   # 바깥 금테(짙은)
    d.rounded_rectangle((2 * S, 2 * S, w * S - 2 * S, h * S - 6 * S), r - 2 * S, fill=(226, 180, 92, 255))  # 금테 밝은 선
    g = np.zeros((h * S, w * S, 4), np.uint8); t = np.linspace(0, 1, h * S)[:, None]
    top, bot = np.array([34, 46, 84]), np.array([14, 20, 42]); g[..., :3] = np.clip(top * (1 - t) + bot * t, 0, 255)[:, None, :].reshape(h * S, 1, 3).repeat(w * S, 1); g[..., 3] = 255
    m = Image.new('L', (w * S, h * S), 0); ImageDraw.Draw(m).rounded_rectangle((4 * S, 4 * S, w * S - 4 * S, h * S - 8 * S), r - 4 * S, fill=255)
    c.paste(Image.fromarray(g, 'RGBA'), (0, 0), m)
    d.line((r, 6 * S, w * S - r, 6 * S), fill=(120, 140, 190, 120), width=S)                             # 윗면 얇은 광택
    return c.resize((w, h), Image.LANCZOS)
b2 = btn(); b2.save(f'{Q}/btn_progress@2x.png', optimize=True); b2.resize((150, 44), Image.LANCZOS).save(f'{Q}/btn_progress.png', optimize=True)
items[:] = [i for i in items if i['key'] != 'ui.quest.btn.progress']
items.append({'key': 'ui.quest.btn.progress', 'path': 'assets/ui/quest/btn_progress@2x.png', 'type': 'image', 'size': [300, 88], 'alpha': True, 'format': 'png', 'bytes': os.path.getsize(f'{Q}/btn_progress@2x.png'), 'scope': 'lazy',
    'scale': '@2x', 'display': [150, 44], 'variants': {'x1': 'assets/ui/quest/btn_progress.png'}, 'slice_mode': '3h', 'slice_px_at_2x': {'l': 26, 'r': 26, 't': 0, 'b': 0}, 'slice_px_at_1x': {'l': 13, 'r': 13, 't': 0, 'b': 0},
    'note': "퀘스트 '진행 중' 상태 버튼(진한 남색 + 얇은 금테, 아래 4px@2x 그림자 포함). 글자 #E6D8B0 + '›'. 수령 가능 = ui.quest.btn.claim(= atlas.uiskin#btn.primary.normal 재사용)", 'generator': {'script': 'docker/gemini/quest_fix_pp.py(벡터 드로잉)', 'calls': 0}, 'license': '자체 제작'})
items[:] = [i for i in items if i['key'] != 'ui.quest.btn.claim']
items.append({'key': 'ui.quest.btn.claim', 'alias_of': 'atlas.uiskin#btn.primary.normal', 'path': 'assets/ui_skin/atlas/ui_skin@3x.png', 'type': 'atlas_frame_alias', 'atlas': 'atlas.uiskin', 'frame': 'btn.primary.normal', 'glow_frame': 'btn.glow',
    'note': '수령 가능 버튼 = 아틀라스 프레임 재사용(파일 추가 없음). 상자 아이콘 result.ico.chest.sm'})
json.dump(fr, open(f'{Q}/manifest_fragment_quest_ui.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# (4) atlas.uiskin ico.crown — battle_icons.jpg 16번째 칸(4x4, 왕관)에서 큰 원본을 잘라 108px@3x 마스터
src = Image.open(f'{A}/ui/battle/raw/battle_icons.jpg').convert('RGB'); W, H = src.size; cell = src.crop((3 * W // 4, 3 * H // 4, W, H)); a = np.asarray(cell).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]; m = np.clip((np.minimum(r, b) - g - 40) / 140.0, 0, 1); al = 1 - m; al = np.where(al < 0.08, 0, al)
sp = np.clip(np.minimum(r, b) - g - 15, 0, None) * 0.85; a[..., 0] -= sp; a[..., 2] -= sp
solid = al > 0.5; lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=8)); sz = ndimage.sum(solid, lab, range(1, n + 1)); keep = lab == (int(np.argmax(sz)) + 1); al = al * keep
ci = Image.fromarray(np.dstack([np.clip(a, 0, 255), al * 255]).astype(np.uint8), 'RGBA'); ci = ci.crop(ci.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
def icon(s):
    k = (s * 0.86) / max(ci.size); im = ci.resize((round(ci.width * k), round(ci.height * k)), Image.LANCZOS); c = Image.new('RGBA', (s, s), (0, 0, 0, 0)); c.alpha_composite(im, ((s - im.width) // 2, (s - im.height) // 2)); return c
res = {}
for scale, fn, s in (('3', 'ui_skin@3x', 108), ('1.5', 'ui_skin@1.5x', 54)):
    jp = f'{A}/ui_skin/atlas/{fn}.json'; pp = f'{A}/ui_skin/atlas/{fn}.png'; J = json.load(open(jp, encoding='utf-8')); at = Image.open(pp).convert('RGBA')
    if 'ico.crown' in J['frames']: res[scale] = 'exists'; continue
    pad = 2; nw, nh = at.width, at.height + s + 2 * pad; big = Image.new('RGBA', (nw, nh), (0, 0, 0, 0)); big.paste(at, (0, 0)); big.alpha_composite(icon(s), (pad, at.height + pad))
    big.save(pp, optimize=True)
    J['frames']['ico.crown'] = {'frame': {'x': pad, 'y': at.height + pad, 'w': s, 'h': s}, 'rotated': False, 'trimmed': False, 'spriteSourceSize': {'x': 0, 'y': 0, 'w': s, 'h': s}, 'sourceSize': {'w': s, 'h': s}, 'slice': None, 'sliceMode': 'image', 'note': '2026-11-04 추가(퀘스트 랭킹 탭): ui/battle/raw/battle_icons.jpg 왕관 칸 후처리'}
    J['meta']['size'] = {'w': nw, 'h': nh}; json.dump(J, open(jp, 'w', encoding='utf-8'), ensure_ascii=False)
    res[scale] = {'size': [nw, nh], 'bytes': os.path.getsize(pp)}
json.dump(res, open('docker/gemini/portrait_s/preview/uiskin_crown_result.json', 'w'), indent=1); print(res)
pv = Image.new('RGBA', (720, 220), (14, 17, 28, 255)); x = 10
for it in items[:]:
    if it['key'].startswith('ui.quest.thumb.') and x < 600: pv.alpha_composite(Image.open(f"public/{it['path']}").convert('RGBA').resize((160, 96)), (x, 10)); x += 170
pv.alpha_composite(Image.open(f'{Q}/btn_progress@2x.png').convert('RGBA'), (10, 120)); pv.alpha_composite(icon(108), (330, 110)); pv.convert('RGB').save('docker/gemini/portrait_s/preview/quest_fix_preview.jpg', quality=90)
