# 전투 HUD 스킨 후처리(호출 없음, 안아트 2026-11-04): raw/battle_frames.jpg(2x2) · battle_icons.jpg(4x4) → public/assets/ui/battle/*.png(@2x, 투명) + manifest 조각(ui.battle.*)
#   판·버튼은 9/3-slice 인셋(px@2x)을 manifest 에 기록. 턴 종료 버튼 누름·비활성은 기본에서 파생(누름 = 어둡게 + 아래로 2px, 비활성 = 채도 낮춤·어둡게)
#   검증 미리보기: 늘린 판(가로 2배·3배)으로 가장자리 이음·장식 왜곡 확인
# 실행(docker python:3.12 + pillow numpy scipy): python -X utf8 docker/gemini/battle_ui_pp.py
import json, os
import numpy as np
from PIL import Image, ImageEnhance
from scipy import ndimage
R = 'public/assets/ui/battle/raw'; O = 'public/assets/ui/battle'; os.makedirs(O, exist_ok=True)
def keyed(path):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32); r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = np.clip((np.minimum(r, b) - g - 40) / 140.0, 0, 1); a = 1 - m; a = np.where(a < 0.08, 0, a)
    sp = np.clip(np.minimum(r, b) - g - 15, 0, None) * 0.85; out = rgb.copy(); out[..., 0] -= sp; out[..., 2] -= sp
    return Image.fromarray(np.dstack([np.clip(out, 0, 255), a * 255]).astype(np.uint8), 'RGBA'), a > 0.5
def pieces(path, n, cols):
    # 격자 칸 단위로 자른 뒤 칸 안의 가장 큰 덩어리(가까운 조각 포함)만 남김 — 순서 = 행·열 고정
    im, solid = keyed(path); rows = n // cols; W, H = im.size; out = []
    for r in range(rows):
        for c in range(cols):
            x0, x1, y0, y1 = int(c * W / cols), int((c + 1) * W / cols), int(r * H / rows), int((r + 1) * H / rows)
            cell = np.asarray(im.crop((x0, y0, x1, y1))).copy(); sm = solid[y0:y1, x0:x1]
            lab, k = ndimage.label(ndimage.binary_dilation(sm, iterations=10))
            if k:
                sz = ndimage.sum(sm, lab, range(1, k + 1)); keep = lab == (int(np.argmax(sz)) + 1); cell[..., 3] = cell[..., 3] * keep
            ci = Image.fromarray(cell); out.append(ci.crop(ci.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()))
    return out
items = []
def add(key, p, note, extra=None):
    im = Image.open(p); items.append({'key': key, 'path': p.replace('public/', ''), 'type': 'image', 'size': list(im.size), 'scale': '@2x', 'display': [im.width // 2, im.height // 2], 'alpha': True, 'format': 'png', 'scope': 'battle',
        'bytes': os.path.getsize(p), 'generator': {'model': 'gemini-nano-banana-2.1', 'api': 'Interactions API', 'size': '2K', 'script': 'docker/gemini/battle_ui_gen.mjs → battle_ui_pp.py'}, 'license': '자체 생성', 'note': note, **(extra or {})})
def save(im, name): p = f'{O}/{name}.png'; im.save(p, optimize=True); return p
def toh(im, h): return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
tp, tr, mm, bt = pieces(f'{R}/battle_frames.jpg', 4, 2)
# 1) 턴 판 3-slice(높이 64@2x). 왼쪽 인셋 = 엠블럼 칸 + 구분선, 오른쪽 인셋 = 곡선 끝단
t = toh(tp, 64); a = np.asarray(t).astype(int); bright = (a[..., 0] > 170) & (a[..., 2] < 120) & (a[..., 3] > 200)
col = bright[16:48].sum(0); cand = [x for x in range(int(t.height * 0.5), int(t.width * 0.45)) if col[x] >= 20]
L = (cand[0] + 5) if cand else int(t.width * 0.35); Rr = int(t.width * 0.28)   # 구분선 바로 뒤 / 오른쪽 덩굴 장식 시작점
add('ui.battle.turn_panel', save(t, 'turn_panel'), '턴 표시 판(왼쪽 정사각 칸 = 교차 검 엠블럼, 구분선 뒤 = 턴 글자, 오른쪽 곡선 끝). 가로 3-slice', {'slice': {'l': L, 'r': Rr, 't': 0, 'b': 0}, 'slice_mode': '3h', 'emblem_slot_2x': [8, 8, L - 14, 48]})
# 2) 지형 정보 판 9-slice(높이 96@2x)
t2 = toh(tr, 96); ins = 22; add('ui.battle.terrain_panel', save(t2, 'terrain_panel'), '지형 정보 판(모서리 금 덩굴). 9-slice', {'slice': {'l': ins, 'r': ins, 't': ins, 'b': ins}, 'slice_mode': '9'})
# 3) 미니맵 프레임 9-slice(높이 140@2x 기준, 가운데 구멍 투명)
t3 = toh(mm, 140); ins3 = 26; add('ui.battle.minimap_frame', save(t3, 'minimap_frame'), '미니맵 프레임(가운데 투명 구멍, 미니맵 그림 위에 얹음). 9-slice', {'slice': {'l': ins3, 'r': ins3, 't': ins3, 'b': ins3}, 'slice_mode': '9'})
# 4) 턴 종료 금 버튼 3-slice(높이 64@2x) 3상태
t4 = toh(bt, 64); L4 = int(t4.height * 0.55)
add('ui.battle.btn_turn_end', save(t4, 'btn_turn_end'), '턴 종료 큰 금 버튼(기본). 가로 3-slice, 글자·아이콘은 FE', {'slice': {'l': L4, 'r': L4, 't': 0, 'b': 0}, 'slice_mode': '3h', 'states': ['ui.battle.btn_turn_end', 'ui.battle.btn_turn_end.pressed', 'ui.battle.btn_turn_end.disabled']})
pr = ImageEnhance.Brightness(t4).enhance(0.82); pc = Image.new('RGBA', t4.size, (0, 0, 0, 0)); pc.alpha_composite(pr.crop((0, 0, t4.width, t4.height - 2)), (0, 2))
add('ui.battle.btn_turn_end.pressed', save(pc, 'btn_turn_end_pressed'), '턴 종료 버튼(누름): 어둡게 + 아래로 2px', {'slice': {'l': L4, 'r': L4, 't': 0, 'b': 0}, 'slice_mode': '3h'})
dis = ImageEnhance.Brightness(ImageEnhance.Color(t4).enhance(0.15)).enhance(0.7)
add('ui.battle.btn_turn_end.disabled', save(dis, 'btn_turn_end_disabled'), '턴 종료 버튼(비활성): 채도 낮춤·어둡게', {'slice': {'l': L4, 'r': L4, 't': 0, 'b': 0}, 'slice_mode': '3h'})
# 5) 아이콘 16
ic = pieces(f'{R}/battle_icons.jpg', 16, 4)
SPEC = [('ico.swords_cross', 96), ('ico.hourglass', 48), ('ico.move_cost', 40), ('ico.defense', 40), ('ico.terrain.plain', 48), ('ico.terrain.forest', 48), ('ico.terrain.mountain', 48), ('ico.terrain.water', 48),
        ('ico.terrain.castle', 48), ('ico.terrain.sand', 48), ('ico.zoom_in', 64), ('ico.zoom_out', 64), ('ico.collapse', 64), ('ico.expand_all', 64), ('ico.flag', 48), ('ico.crown', 48)]
if os.path.exists(f'{R}/ico_defense.jpg'): ic[3] = pieces(f'{R}/ico_defense.jpg', 1, 1)[0]   # 2026-11-04 방패 재생성분(십자처럼 읽히던 원본 대체)
for (k, S), im in zip(SPEC, ic):
    s = (S - 4) / max(im.size); im2 = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS); c = Image.new('RGBA', (S, S), (0, 0, 0, 0)); c.alpha_composite(im2, ((S - im2.width) // 2, (S - im2.height) // 2))
    add(f'ui.battle.{k}', save(c, k.replace('ico.', 'ico_').replace('.', '_')), f'전투 HUD 아이콘 {k} ({S // 2}px 표시 @2x)')
json.dump({'note': '전투 HUD 스킨(안아트 2026-11-04). 키 ui.battle.*, @2x PNG(표시 = 크기/2). 판·버튼은 slice(px@2x)', 'assets': items}, open(f'{O}/manifest_fragment_battle_ui.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# 미리보기: 늘린 판·버튼 + 아이콘
def stretch3(im, w, l, r):
    out = Image.new('RGBA', (w, im.height)); out.alpha_composite(im.crop((0, 0, l, im.height)), (0, 0)); mid = im.crop((l, 0, im.width - r, im.height)).resize((w - l - r, im.height)); out.alpha_composite(mid, (l, 0)); out.alpha_composite(im.crop((im.width - r, 0, im.width, im.height)), (w - r, 0)); return out
def stretch9(im, w, h, i):
    out = Image.new('RGBA', (w, h)); W, H = im.size
    for (sx0, sx1, dx0, dx1) in ((0, i, 0, i), (i, W - i, i, w - i), (W - i, W, w - i, w)):
        for (sy0, sy1, dy0, dy1) in ((0, i, 0, i), (i, H - i, i, h - i), (H - i, H, h - i, h)):
            out.alpha_composite(im.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0)), (dx0, dy0))
    return out
pv = Image.new('RGBA', (1000, 560), (60, 120, 50, 255)); y = 10
pv.alpha_composite(stretch3(t, 420, L, Rr), (10, y)); pv.alpha_composite(Image.open(f'{O}/ico_swords_cross.png').resize((48, 48)), (18, y + 8)); pv.alpha_composite(stretch3(t, 700, L, Rr), (10, y + 80)); y += 170
pv.alpha_composite(stretch9(t2, 240, 96, ins), (10, y)); pv.alpha_composite(stretch9(t2, 420, 150, ins), (270, y)); pv.alpha_composite(stretch9(t3, 180, 140, ins3), (720, y)); y += 170
for i, im in enumerate((t4, pc, dis)): pv.alpha_composite(stretch3(im, 220, L4, L4), (10 + i * 240, y))
for i, (k, S) in enumerate(SPEC): pv.alpha_composite(Image.open(f'{O}/{k.replace("ico.", "ico_").replace(".", "_")}.png'), (10 + i * 60, y + 90))
os.makedirs('docker/gemini/battle_ui_preview', exist_ok=True); pv.convert('RGB').save('docker/gemini/battle_ui_preview/battle_hud.jpg', quality=90)
print([(i['key'], i['size'], i.get('slice')) for i in items][:6], len(items))
