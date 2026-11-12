# 스킬 아이콘 후처리(안아트, 2026-11-01). API 호출 없음.
# raw 시트(4x4, 마젠타 배경 JPEG) → 칸 슬라이스 → 마스크 평균 다운샘플(마젠타 번짐 없음) → 색 양자화 → 1px 외곽선
# → 계열 배경판 + 프레임(액티브 금·팔각 / 패시브 은·사각) + 조건부 보라 마름모 → 48px @1x, 96px @2x(NEAREST)
# 실행: <python(Pillow,numpy)> docker/gemini/skill_icon_pp.py [code ...]   (인자 없으면 전체)
# 입력: docker/gemini/skill_icon_sheets.json(node 로 style_skill_icons.mjs 에서 export), skill_icon_skills.json, skill_icon_sources.json(재생성 교체분)
import json, sys, os
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
G = os.path.join(ROOT, 'docker', 'gemini')
OUT = os.path.join(ROOT, 'public', 'assets', 'skill_icons')
RAW = os.path.join(OUT, 'raw')
S = 48            # 최종 1x 크기
MOTIF = 36        # 모티프 최대 변(외곽선 1px 추가 시 38, 안쪽 판 42 안에 2px 여백)
NCOL = 16         # 아이콘당 최대 색 수(외곽선 제외)

CAT = {}
for k, tpls in {
    'atk': ['T_ATK_UP', 'T_ACTIVE_STRIKE', 'T_FIRST_STRIKE', 'T_CHARGE', 'T_PURSUIT', 'T_COUNTER_ATK', 'T_SIEGE_ATK', 'T_VS_TYPE_ATK'],
    'def': ['T_DEF_UP', 'T_TERRAIN_DEF'], 'hyb': ['T_ATKDEF_HYBRID', 'T_LAST_STAND'],
    'heal': ['T_HEAL_UP', 'T_REGEN', 'T_ACTIVE_HEAL'], 'move': ['T_MOVE_UP', 'T_ACTIVE_SURGE'],
    'aoe': ['T_ACTIVE_AOE'], 'cmd': ['T_FORMATION', 'T_ACTIVE_BUFF'], 'trick': ['T_ACTIVE_DECOY']}.items():
    for t in tpls: CAT[t] = k
# 2026-11-03 nx: 오라 템플릿(공격=atk / 방어=def / 복합·광역=hyb 대각 분할). 프레임 종류 'aura' = 원형 청동
CAT.update({'T_TERRAIN_MASTER': 'hyb', 'T_MATCHUP_NEGATE': 'def', 'T_ACTIVE_STANCE': 'def', 'T_ACTIVE_PIERCE': 'atk'})   # 2026-11-04 재분배 phase2 템플릿
CAT.update({'T_AURA_ATK': 'atk', 'T_AURA_DEF': 'def', 'T_AURA_BOTH': 'hyb', 'T_AURA_WIDE_BOTH': 'hyb'})
MOTIF_AURA = 30   # 원형 프레임 안쪽(반지름 약 20px)에 들어가도록 모티프 축소
COND = {'T_TERRAIN_MASTER', 'T_MATCHUP_NEGATE', 'T_FORMATION', 'T_FIRST_STRIKE', 'T_CHARGE', 'T_LAST_STAND', 'T_PURSUIT', 'T_COUNTER_ATK', 'T_SIEGE_ATK', 'T_TERRAIN_DEF', 'T_VS_TYPE_ATK'}
# cmd(진형·버프)는 금 프레임(액티브)과 혼동되지 않게 상아색 강조선. 계열 배경판: (바깥 어두운색, 안쪽 원, 계열 강조선). 판은 어둡게 두어 모티프 대비 확보, 계열은 강조선(안쪽 1px)+색조로 구분. design_spec 과 동일 값 유지
BG = {
    'atk': ('#2E1414', '#5A2A26', '#E0503F'), 'def': ('#121E38', '#2A4268', '#5A9AF0'), 'heal': ('#10281A', '#285238', '#5AD078'),
    'move': ('#0E2A2E', '#215A5E', '#46D6D2'), 'aoe': ('#33190A', '#66381A', '#FF9A36'), 'cmd': ('#262219', '#4A4232', '#F4EEDC'),
    'trick': ('#1A1B30', '#3A3D60', '#AAB4DA'),
}
FRAME = {  # 외곽 어두운선, 하이라이트(위·왼), 본색, 그림자(아래·오른)
    'active': ('#1A1206', '#F3DC8E', '#D9B45A', '#8A6A1E'),
    'passive': ('#14161E', '#EEF2F6', '#AEB8C6', '#5E6878'),
    'aura': ('#1A0E08', '#F2C9A0', '#C8875A', '#7A4526'),  # 지휘관 오라: 원형 청동(금 팔각·은 사각과 모양으로 구분)
}
GEM = ('#2A0E3A', '#E9C6FA', '#B06AD8', '#6A2F8C')
OUTLINE = (18, 14, 24)

hx = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def fg_mask(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    # 마젠타 판정: R·B 높고 G 낮음 + 마젠타 쪽으로 기운 번짐(경계)도 배경으로
    mag = (r > 150) & (b > 150) & (g < 110) & (np.abs(r - b) < 90)
    spill = (r - g > 80) & (b - g > 80) & (np.abs(r - b) < 70)
    return ~(mag | spill)


def motif_from_cell(cell, MOTIF=MOTIF):
    a = np.asarray(cell.convert('RGB'))
    m = fg_mask(a)
    # 칸 가장자리 4% 는 무시(이웃 칸 침범 방지)
    h, w = m.shape; e = int(w * 0.02)
    m[:e, :] = m[-e:, :] = False; m[:, :e] = m[:, -e:] = False
    # 작은 잡티 제거: 3x3 이웃 중 fg 가 3개 미만이면 제거
    pad = np.pad(m, 1); nb = sum(pad[1 + dy:h + 1 + dy, 1 + dx:w + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    m &= nb >= 4
    ys, xs = np.where(m)
    if len(ys) < 50: return None
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    side = max(y1 - y0, x1 - x0)
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    sq = np.zeros((side, side, 3)); sm = np.zeros((side, side))
    oy, ox = cy - side // 2, cx - side // 2
    for arr, src in ((sq, a * m[..., None]), (sm, m.astype(float))):
        ys0, xs0 = max(oy, 0), max(ox, 0); ys1, xs1 = min(oy + side, h), min(ox + side, w)
        arr[ys0 - oy:ys1 - oy, xs0 - ox:xs1 - ox] = src[ys0:ys1, xs0:xs1]
    # 마스크 가중 평균 다운샘플(BOX)
    def box(x):
        if x.ndim == 2: return np.asarray(Image.fromarray(x.astype(np.float32), 'F').resize((MOTIF, MOTIF), Image.BOX))
        return np.stack([box(x[..., i]) for i in range(3)], -1)
    ms = box(sm); cs = box(sq) / np.maximum(ms[..., None], 1e-6)
    alpha = ms >= 0.42
    rgb = np.clip(cs, 0, 255).astype(np.uint8)
    # 색 양자화(불투명 픽셀만, 디더링 없음)
    pts = rgb[alpha]
    if len(pts) == 0: return None
    strip = Image.fromarray(pts.reshape(1, -1, 3), 'RGB').quantize(colors=NCOL, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    rgb[alpha] = np.asarray(strip).reshape(-1, 3)
    # 고립 픽셀 제거(상하좌우 이웃 0)
    p = np.pad(alpha, 1); n4 = p[:-2, 1:-1].astype(int) + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]
    alpha &= n4 > 0
    return rgb, alpha


def add_outline(rgb, alpha):
    n = rgb.shape[0] + 2
    R = np.zeros((n, n, 3), np.uint8); A = np.zeros((n, n), bool)
    R[1:-1, 1:-1] = rgb; A[1:-1, 1:-1] = alpha
    p = np.pad(A, 1); ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~A
    R[ring] = OUTLINE
    return R, A | ring


def octagon_mask(c):  # 모서리 c 픽셀 깎은 팔각
    y, x = np.mgrid[0:S, 0:S]
    return (x + y >= c) & ((S - 1 - x) + y >= c) & (x + (S - 1 - y) >= c) & ((S - 1 - x) + (S - 1 - y) >= c)


def frame_and_bg(cat, active, cond, kind=None):
    kind = kind or ('active' if active else 'passive')
    img = np.zeros((S, S, 4), np.uint8)
    y, x = np.mgrid[0:S, 0:S]
    if kind == 'aura':  # 원형: 중심 거리 기준 1px 씩 안쪽 링
        rr = np.sqrt((x - (S - 1) / 2) ** 2 + (y - (S - 1) / 2) ** 2)
        rings = [rr <= 23.6 - i for i in range(4)]
    else:
        shape = octagon_mask(5) if active else octagon_mask(2)
        rings = [shape]
        for i in range(1, 4):  # 바깥에서 안쪽으로 1px 씩 줄인 링
            inner = np.zeros_like(shape); inner[i:S - i, i:S - i] = shape[i:S - i, i:S - i] & (octagon_mask((5 if active else 2) + i) [i:S - i, i:S - i])
            rings.append(inner)
    dark, hi, mid, lo = map(hx, FRAME[kind])
    img[rings[0]] = (*dark, 255)
    metal = rings[1] & ~rings[3]
    tl = (x + y) < (S - 1)  # 왼쪽 위 절반 = 하이라이트, 오른쪽 아래 = 그림자, 바깥 링은 본색
    band1 = rings[1] & ~rings[2]; band2 = rings[2] & ~rings[3]
    img[band1 & tl] = (*hi, 255); img[band1 & ~tl] = (*mid, 255)
    img[band2 & tl] = (*mid, 255); img[band2 & ~tl] = (*lo, 255)
    inner = rings[3]
    # 안쪽 1px 어두운 테두리 + 배경판
    if cat == 'hyb':
        a1, b1, c1 = map(hx, BG['atk']); a2, b2, c2 = map(hx, BG['def'])
        split = x + y < S - 1  # 왼쪽 위 = 공격(적), 오른쪽 아래 = 방어(청)
        outer = np.where(split[..., None], a1, a2); light = np.where(split[..., None], b1, b2); acc = np.where(split[..., None], c1, c2)
    else:
        o, l, c = map(hx, BG[cat]); outer = np.broadcast_to(o, (S, S, 3)); light = np.broadcast_to(l, (S, S, 3)); acc = np.broadcast_to(c, (S, S, 3))
    r2 = (x - (S - 1) / 2) ** 2 + (y - (S - 1) / 2) ** 2
    disk = r2 <= 17.5 ** 2
    bg = np.where(disk[..., None], light, outer)
    img[inner, :3] = bg[inner]; img[inner, 3] = 255
    er = inner.copy(); er[1:-1, 1:-1] = inner[1:-1, 1:-1] & inner[:-2, 1:-1] & inner[2:, 1:-1] & inner[1:-1, :-2] & inner[1:-1, 2:]; er[0, :] = er[-1, :] = er[:, 0] = er[:, -1] = False
    inner_edge = inner & ~er
    img[inner_edge, :3] = np.array(acc[inner_edge])  # 계열 강조선
    return img


GEM_SHAPE = [  # 7x7 마름모: 0 없음 1 외곽 2 하이라이트 3 본색 4 그림자
    '0001000', '0012100', '0122310', '1223331', '0133410', '0014100', '0001000']


def compose(code, rgb, alpha, tpl, active, kind=None):
    cat = CAT.get(tpl, 'atk'); cond = (not active) and kind != 'aura' and tpl in COND
    img = frame_and_bg(cat, active, cond, kind)
    R, A = add_outline(rgb, alpha)
    o = (S - R.shape[0]) // 2
    sub = img[o:o + R.shape[0], o:o + R.shape[1]]
    sub[A, :3] = R[A]; sub[A, 3] = 255
    if cond:
        cols = {1: hx(GEM[0]), 2: hx(GEM[1]), 3: hx(GEM[2]), 4: hx(GEM[3])}
        gy, gx = 1, S - 8
        for j, row in enumerate(GEM_SHAPE):
            for i, ch in enumerate(row):
                if ch != '0': img[gy + j, gx + i] = (*cols[int(ch)], 255)
    return Image.fromarray(img, 'RGBA')


def main():
    sheets = json.load(open(os.path.join(G, 'skill_icon_sheets.json'), encoding='utf8'))
    skills = {s['code']: s for s in json.load(open(os.path.join(G, 'skill_icon_skills.json'), encoding='utf8'))['skills']}
    srcp = os.path.join(G, 'skill_icon_sources.json')
    override = json.load(open(srcp, encoding='utf8')).get('sources', {}) if os.path.exists(srcp) else {}
    loc = {}
    for sh in sheets:
        for i, c in enumerate(sh['codes']): loc[c] = (sh['id'], i)
    for c, v in override.items(): loc[c] = (v['sheet'], v.get('box') or v['cell'])  # box=[x0,y0,x1,y1](원본 px): 모델이 격자를 어긴 경우 수동 지정
    want = sys.argv[1:] or list(skills)
    os.makedirs(os.path.join(OUT, '48'), exist_ok=True); os.makedirs(os.path.join(OUT, '96'), exist_ok=True)
    cache, done, miss = {}, [], []
    for c in want:
        sid, idx = loc.get(c, (None, None))
        f = os.path.join(RAW, f'{sid}.jpg') if sid else None
        if not f or not os.path.exists(f): miss.append(c); continue
        if sid not in cache: cache[sid] = Image.open(f).convert('RGB')
        im = cache[sid]; cw, ch = im.width / 4, im.height / 4
        if isinstance(idx, list): cell = im.crop(tuple(idx))
        else: cell = im.crop((int(idx % 4 * cw), int(idx // 4 * ch), int((idx % 4 + 1) * cw), int((idx // 4 + 1) * ch)))
        s = skills[c]
        kind = 'aura' if s['type'] == 'aura' else ('active' if s['type'] == 'active' else 'passive')
        r = motif_from_cell(cell, MOTIF_AURA if kind == 'aura' else MOTIF)
        if r is None: miss.append(c); continue
        out = compose(c, *r, s['template'], s['type'] == 'active', kind)
        out.save(os.path.join(OUT, '48', f'{c}.png'), optimize=True)
        out.resize((S * 2, S * 2), Image.NEAREST).save(os.path.join(OUT, '96', f'{c}.png'), optimize=True)
        done.append(c)
    print(f'완료 {len(done)}, 누락 {len(miss)}: {",".join(miss)}')


if __name__ == '__main__':
    main()
