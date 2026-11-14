"""배치·전투에서 바다 칸 유닛 발밑 '소형 배 베이스' 오버레이 — 이미지 생성 모델 호출 0회, 절차적 도트.
유닛 스프라이트 규격(64x64 프레임, 행 = down 0 / left 1 / right 2 / up 3, assets.js SHEET_ROW)과 같은 셀.
팀색 3종(ally 청 / enemy 적 / neutral 갈색) x 레이어 3종:
  boat_base_<team>_back.png   유닛 '뒤'(갑판 안쪽·먼 뱃전·깃대·깃발)          128x256 = 2열(물결 프레임) x 4행(방향)
  boat_base_<team>_front.png  유닛 '앞'(가까운 뱃전·선체·뱃머리·물결)          128x256
  boat_base_<team>_under.png  back+front 합본(유닛 아래 1장만 깔 때의 폴백)     128x256
  x2/ 같은 이름 2배(NEAREST) 256x512
팔레트: 외곽선 #140C1C, 나무 = npc_boat_2 시트 계열, 팀색 = npc_boat_2 ally/enemy 테두리 3단과 동일. 광원 왼쪽 위.
실행(로컬): python docker/gemini/boat_base_build.py   (pillow 13.0.0, numpy 2.5.4)
"""
import os, json
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'units', 'boat_base')
PREV = os.path.join(ROOT, 'docker', 'gemini', 'boat_base_preview')
os.makedirs(os.path.join(OUT, 'x2'), exist_ok=True)
os.makedirs(PREV, exist_ok=True)

F, NF = 64, 2
DIRS = ['down', 'left', 'right', 'up']
YY, XX = np.mgrid[0:F, 0:F]

def hx(s): s = s.lstrip('#'); return np.array([int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255], np.uint8)
OL = hx('140C1C')
WOOD = [hx(c) for c in ['cd9f73', 'ae815e', '987158', '835b4b', '664940', '463030']]  # 밝음 -> 어두움
FOAM = [hx('e8f8ff'), hx('9ad8f0'), hx('5aa8d8')]
TEAMS = {
    'ally':    {'trim': ['96c8f6', '4b87db', '22509e'], 'flag': ['96c8f6', '4b87db', '22509e']},
    'enemy':   {'trim': ['f696a8', 'db4b5e', '9e2230'], 'flag': ['f696a8', 'db4b5e', '9e2230']},
    'neutral': {'trim': ['bd9670', '835b4b', '5a3a37'], 'flag': ['f0e6c8', 'c8b48c', '8c7650']},
}

def blank(): return np.zeros((F, F, 4), np.uint8)
def edge(m):
    p = np.pad(m, 1)
    inner = p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return m & ~inner
def outline_outside(img, m):
    """m 바깥 1px 링(4방향)에 외곽선."""
    p = np.pad(m, 1)
    grow = p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | m
    ring = grow & ~m & (img[..., 3] == 0)
    img[ring] = OL

# ---------------------------------------------------------------- 측면(오른쪽 = 뱃머리). 왼쪽 = 좌우 반전
XS, XB, XM = 5, 59, 30
def side_g(x):  # 가까운 뱃전 윗선 y
    x = np.asarray(x, float)
    return np.where(x < XM, 48 - 3 * ((XM - x) / (XM - XS)) ** 2, 48 - 6 * ((x - XM) / (XB - XM)) ** 2)
def side_k(x):  # 선체 바닥선 y
    x = np.asarray(x, float)
    return np.where(x < XM, 59 - 5 * ((XM - x) / (XM - XS)) ** 2, 59 - 15 * np.clip((x - XM) / (XB - XM), 0, 1) ** 2.4)

def side(team, f):
    t = TEAMS[team]; trim = [hx(c) for c in t['trim']]; flag = [hx(c) for c in t['flag']]
    back, front = blank(), blank()
    g = side_g(XX + 0.5); k = side_k(XX + 0.5)
    inx = (XX >= XS) & (XX <= XB)
    # back: 먼 뱃전(g-4 ~ g) 안쪽 갑판
    far = inx & (YY >= np.floor(g - 4)) & (YY < np.floor(g)) & (XX >= XS + 2) & (XX <= XB - 3)
    back[far] = WOOD[4]
    rim = far & (YY == np.floor(g - 4))
    back[rim] = WOOD[1]
    back[far & (YY == np.floor(g - 3))] = WOOD[3]
    for bx in (18, 32, 44):  # 가로 좌판(멍에)
        back[far & (XX >= bx) & (XX <= bx + 2) & (YY > np.floor(g - 3))] = WOOD[2]
    # 깃대(고물 쪽) + 깃발(바람에 고물 방향으로 나부낌)
    px = 9; top = 28
    gp = int(np.floor(side_g(px + .5)))
    back[top:gp - 3, px] = WOOD[3]
    back[top:gp - 3, px + 1] = WOOD[5]
    back[top - 1, px:px + 2] = hx('f0c84a')
    fl = np.zeros((F, F), bool)
    for i in range(7):  # 삼각 깃발: 깃대에서 왼쪽으로
        ln = 7 - i if f == 0 else (7 - i + (1 if i in (2, 3) else 0))
        y = top + i - (0 if f == 0 else (1 if i < 2 else 0))
        x0 = px - ln
        fl[y, max(0, x0):px] = True
    back[fl] = flag[1]
    back[fl & (np.roll(fl, 1, 0) == False)] = flag[0]
    back[fl & (np.roll(fl, -1, 0) == False)] = flag[2]
    outline_outside(back, fl | (back[..., 3] > 0) & (XX >= px) & (XX <= px + 1) & (YY < gp - 3))
    outline_outside(back, far)
    # front: 가까운 선체
    hull = inx & (YY >= np.floor(g)) & (YY <= np.floor(k))
    front[hull] = WOOD[2]
    gi = np.floor(g)
    front[hull & (YY == gi)] = trim[0]
    front[hull & (YY == gi + 1)] = trim[1]
    front[hull & (YY == gi + 2)] = trim[2]
    d = YY - gi
    front[hull & (d >= 3) & (d <= 4)] = WOOD[1]
    front[hull & (d == 6)] = WOOD[3]           # 판자 이음
    front[hull & (d >= 7) & (d <= 8)] = WOOD[2]
    front[hull & (d == 9)] = WOOD[4]
    front[hull & (d >= 10)] = WOOD[4]
    front[hull & (YY >= np.floor(k) - 1) & (d >= 5)] = WOOD[5]  # 바닥 그늘
    front[hull & (XX >= XB - 3) & (d >= 3)] = WOOD[3]          # 뱃머리 면
    front[hull & (XX <= XS + 1) & (d >= 3)] = WOOD[4]          # 고물 판
    # 고물·이물 꼭대기 장식 1px 하이라이트
    front[hull & (d == 0) & (XX < XS + 6)] = trim[0]
    outline_outside(front, hull)
    # 물결(흘수선): 선체 아래 가장자리 + 양 끝 물거품, 프레임마다 위치 이동
    water = blank()
    yb = 60
    sh = 0 if f == 0 else 2
    for x in range(XS - 2, XB + 4):
        ph = (x + sh) % 6
        if ph in (0, 1, 2):
            water[yb, x] = FOAM[1] if ph != 1 else FOAM[0]
        if ph in (3, 4) and (x < XS + 4 or x > XB - 6 or (x // 6) % 2 == f):
            water[yb + 1, x] = FOAM[2]
    for (x, y) in ([(XB + 1, 57), (XB + 2, 58), (XB + 3, 59)] if f == 0 else [(XB + 1, 58), (XB + 2, 59), (XB + 4, 59)]):
        water[y, x] = FOAM[0]
    for (x, y) in ([(XS - 3, 59), (XS - 2, 58)] if f == 0 else [(XS - 3, 58), (XS - 4, 59)]):
        water[y, x] = FOAM[1]
    water[:, :1] = 0; water[:, F - 1:] = 0; water[F - 1:] = 0  # 셀 1px 여백(이웃 프레임 번짐 방지)
    m = water[..., 3] > 0
    front[m] = water[m]
    return back, front

# ---------------------------------------------------------------- 정면/후면(위에서 비스듬히 본 3/4). down = 뱃머리가 화면 아래
CX = 32
def top_half_w(y, bow_down):
    """y 의 뱃전 반폭(바깥선). bow_down: 뱃머리(뾰족)가 아래쪽."""
    y = np.asarray(y, float)
    y0, y1 = 32.0, 57.0
    t = (y - y0) / (y1 - y0)  # 0 위 끝 ~ 1 아래 끝
    if not bow_down: t = 1 - t
    # t=0 고물(넓은 판) -> 0.35 최대폭 -> 1 뱃머리 뾰족
    w = np.where(t < 0.35, 17 + 7 * np.sin(t / 0.35 * np.pi / 2), 24 * np.clip(np.cos((t - 0.35) / 0.65 * np.pi / 2), 0, 1) ** 0.8)
    return np.where((y >= y0) & (y <= y1), w, -1)

def frontal(team, f, bow_down):
    t = TEAMS[team]; trim = [hx(c) for c in t['trim']]; flag = [hx(c) for c in t['flag']]
    back, front = blank(), blank()
    px = XX + 0.5 - CX
    w = top_half_w(YY + 0.5, bow_down)
    outer = np.abs(px) <= w
    # 선체 옆면(원근으로 뱃전 아래 3px 보임) = outer 를 아래로 3 내린 것 - outer
    sideband = np.zeros_like(outer)
    for s in (1, 2, 3, 4):
        sideband |= np.roll(outer, s, 0)
    sideband &= ~outer
    w_in = top_half_w(YY + 0.5, bow_down) - 2
    inner = (np.abs(px) <= w_in) & outer
    # 안쪽도 위·아래 끝에서 2px 줄임
    inner &= np.roll(outer, 2, 0) & np.roll(outer, -2, 0)
    rim = outer & ~inner
    # 기준선: 유닛 발(앵커 오프셋 적용 후 y=55) 보다 아래 = 앞 레이어
    cut = 52
    # back: 안쪽 갑판 전체 + 위쪽 뱃전
    back[inner] = WOOD[4]
    back[inner & (np.abs(px) > w_in - 2)] = WOOD[5]                  # 안쪽 벽 그늘
    for by in ((38, 46) if bow_down else (44, 52)):                 # 좌판
        back[inner & (YY >= by) & (YY <= by + 1)] = WOOD[2]
    back[rim & (YY < cut)] = trim[1]
    back[rim & (YY < cut) & (px < 0)] = trim[0]                        # 광원 왼쪽
    back[rim & (YY < cut) & (np.roll(rim, 1, 0) == False)] = trim[0]
    # 깃대: 고물 모서리(down=위 오른쪽, up=아래 오른쪽은 앞 레이어로 가므로 위 오른쪽 이물 쪽)
    pxp = CX + 16; top = 22; ybase = 37
    back[top:ybase, pxp] = WOOD[3]; back[top:ybase, pxp + 1] = WOOD[5]
    back[top - 1, pxp:pxp + 2] = hx('f0c84a')
    fl = np.zeros((F, F), bool)
    for i in range(6):
        ln = 7 - i if f == 0 else 6 - i + (1 if i in (1, 2) else 0)
        fl[top + i, pxp + 2:pxp + 2 + max(1, ln)] = True
    back[fl] = flag[1]
    back[fl & (np.roll(fl, 1, 0) == False)] = flag[0]
    back[fl & (np.roll(fl, -1, 0) == False)] = flag[2]
    pole = (XX >= pxp) & (XX <= pxp + 1) & (YY >= top - 1) & (YY < ybase)
    bm = inner | (rim & (YY < cut)) | fl | pole
    outline_outside(back, bm)
    # front: 아래쪽 뱃전 + 옆면 띠
    fm = (rim & (YY >= cut)) | (sideband & (YY >= cut - 6))
    front[rim & (YY >= cut)] = trim[1]
    front[rim & (YY >= cut) & (px < 0)] = trim[0]
    front[rim & (YY >= cut) & (np.roll(rim, -1, 0) == False)] = trim[2]
    sb = sideband & (YY >= cut - 6)
    front[sb] = WOOD[2]
    front[sb & (px < -2)] = WOOD[1]
    front[sb & (px > 6)] = WOOD[3]
    front[sb & (np.roll(sb, -1, 0) == False)] = WOOD[5]
    if not bow_down:  # 고물 판(평평한 뒷면) 가운데 키(방향타)
        front[sb & (np.abs(px) <= 1)] = WOOD[4]
    outline_outside(front, fm)
    # 물결: 옆면 아래 테두리 따라
    bottom = sb & (np.roll(sb, -1, 0) == False)
    ys, xs = np.nonzero(bottom)
    for y, x in zip(ys, xs):
        ph = (x + (0 if f == 0 else 2)) % 5
        yy = min(F - 2, y + 2)
        if front[yy, x, 3] == 0 and ph in (0, 1):
            front[yy, x] = FOAM[1] if ph == 0 else FOAM[0]
    # 좌우 바깥 잔물결
    lo = int(ys.max()) if len(ys) else 60
    for side_x, sgn in ((int(xs.min()) - 2, -1), (int(xs.max()) + 2, 1)):
        for j in range(3):
            x = side_x + sgn * j; y = lo - 2 + (j + f) % 2
            if 1 <= x < F - 1 and 1 <= y < F - 1 and front[y, x, 3] == 0:
                front[y, x] = FOAM[j % 2]
    return back, front

def build(team):
    sheets = {k: Image.new('RGBA', (F * NF, F * 4)) for k in ('back', 'front', 'under')}
    for f in range(NF):
        rb, rf = side(team, f)
        cells = {
            'down': frontal(team, f, True),
            'up': frontal(team, f, False),
            'right': (rb, rf),
            'left': (rb[:, ::-1].copy(), rf[:, ::-1].copy()),
        }
        for r, d in enumerate(DIRS):
            b, fr = cells[d]
            bi = Image.fromarray(b, 'RGBA'); fi = Image.fromarray(fr, 'RGBA')
            u = bi.copy(); u.alpha_composite(fi)
            sheets['back'].paste(bi, (f * F, r * F)); sheets['front'].paste(fi, (f * F, r * F)); sheets['under'].paste(u, (f * F, r * F))
    out = {}
    for k, im in sheets.items():
        p1 = os.path.join(OUT, f'boat_base_{team}_{k}.png'); im.save(p1, optimize=True)
        p2 = os.path.join(OUT, 'x2', f'boat_base_{team}_{k}.png'); im.resize((im.width * 2, im.height * 2), Image.NEAREST).save(p2, optimize=True)
        out[k] = (p1, p2)
    return sheets

ALL = {t: build(t) for t in TEAMS}

# ---------------------------------------------------------------- 미리보기(바다 타일 + 실제 유닛 시트 합성, x2 표시)
A = os.path.join(ROOT, 'public', 'assets')
sea = [Image.open(os.path.join(A, 'tiles', '64', n)).convert('RGBA').resize((64, 64), Image.NEAREST) for n in ('water_a.png', 'water_b.png')]
FOOT = -8  # 유닛 body y 오프셋(64 셀 px)
def cell(sheet_path, row, col=0):
    im = Image.open(os.path.join(A, 'sprites', '64', sheet_path)).convert('RGBA')
    return im.crop((col * 64, row * 64, col * 64 + 64, row * 64 + 64))
def boat_cell(team, layer, row, f):
    return ALL[team][layer].crop((f * F, row * F, f * F + F, row * F + F))
def compose(units, cols, rows, name, f=0):
    can = Image.new('RGBA', (cols * 64, rows * 64))
    for y in range(rows):
        for x in range(cols):
            can.alpha_composite(sea[0], (x * 64, y * 64))
    for (gx, gy, sheet, d, team) in units:
        r = DIRS.index(d)
        ox, oy = gx * 64, gy * 64
        bob = -1 if ((gx + gy + f) % 2) else 0
        can.alpha_composite(boat_cell(team, 'back', r, f), (ox, oy + bob))
        can.alpha_composite(cell(sheet, r), (ox, oy + FOOT + bob))
        can.alpha_composite(boat_cell(team, 'front', r, f), (ox, oy + bob))
    can = can.resize((can.width * 2, can.height * 2), Image.NEAREST)
    can.save(os.path.join(PREV, name)); return can

ally_sheets = ['korea_sword_ally_sheet.png', 'korea_spear_ally_sheet.png', 'korea_archer_ally_sheet.png', 'korea_gunner_ally_sheet.png',
               'korea_heavy_ally_sheet.png', 'korea_healer_ally_sheet.png', 'hero_yi_sun_sin_ally_sheet.webp', 'korea_mage_ally_sheet.png']
enemy_sheets = ['japan_sword_enemy_sheet.png', 'japan_spear_enemy_sheet.png', 'japan_archer_enemy_sheet.png', 'japan_spear_enemy_sheet.png',
                'japan_sword_enemy_sheet.png', 'japan_archer_enemy_sheet.png']
dirs8 = ['down', 'right', 'left', 'up', 'down', 'right', 'down', 'left']
p1 = [(1 + i % 4, 1 + i // 4, ally_sheets[i], dirs8[i], 'ally') for i in range(8)]
compose(p1, 6, 4, 'preview_ally8.png')
p2 = [(1 + i % 3, 1 + i // 3, enemy_sheets[i], ['left', 'down', 'left', 'up', 'left', 'right'][i], 'enemy') for i in range(6)]
compose(p2, 5, 4, 'preview_enemy.png', f=1)
p3 = [(1, 1, ally_sheets[0], 'right', 'ally'), (1, 2, ally_sheets[1], 'right', 'ally'), (4, 1, enemy_sheets[0], 'left', 'enemy'),
      (4, 2, enemy_sheets[1], 'left', 'enemy'), (2, 3, ally_sheets[2], 'up', 'ally'), (3, 0, enemy_sheets[2], 'down', 'enemy'),
      (0, 3, 'spear_ally_sheet.png', 'right', 'neutral'), (5, 3, 'sword_enemy_sheet.png', 'left', 'neutral')]
compose(p3, 6, 4, 'preview_faceoff.png')
# 시트 자체 점검(체크무늬 위)
for t in TEAMS:
    s = ALL[t]['under']; ck = Image.new('RGBA', s.size)
    for y in range(0, s.height, 8):
        for x in range(0, s.width, 8):
            ck.paste((200, 200, 200, 255) if (x // 8 + y // 8) % 2 else (150, 150, 150, 255), (x, y, x + 8, y + 8))
    ck.alpha_composite(s); ck.resize((s.width * 3, s.height * 3), Image.NEAREST).save(os.path.join(PREV, f'sheet_{t}_under_x3.png'))
print('ok')
