# 스킬 아이콘 QA 보정 3종(안아트 2026-11-03 camp 배치). 이미지 모델 호출 0회 — 30px 모티프를 절차 도트로 직접 그리고 skill_icon_pp.compose() 로 원형 청동 프레임·계열 배경판을 씌운다.
#   aura_def  : 청색 방패가 def 청색 판과 겹쳐 24px 대비 낮음 -> 밝은 강철 면 + 놋쇠 테·돌기 + 밝은 청록 물결(명도 대비로 판독)
#   au_def_w  : 청색 깃발·방패 대비 낮음 -> 밝은 하늘색 삼각 깃발(밝은 윗선) + 놋쇠 테 강철 소형 방패
#   au_both_w : 납작한 북 -> 세운 북(상아 북면 타원 + 높은 몸통 + 놋쇠 징 띠 2줄) + 북면 위 비스듬한 북채
# 실행(저장소 루트): python -I docker/gemini/skill_icon_fix_camp.py  -> public/assets/skill_icons/{48,96}/<code>.png 덮어씀(첫 실행 시 .bak-camp-20261103 백업)
#   이후 python -I docker/gemini/skill_icon_build.py 로 아틀라스 재빌드(프레임 순서 = skill_icon_skills.json 순서라 좌표 불변)
import os, sys, shutil
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from skill_icon_pp import compose, S, OUT  # noqa: E402

N = 30
hx = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.uint8)
BR = [hx(c) for c in ('#5E4410', '#8A6A1E', '#D9B45A', '#F3DC8E', '#FFF4C8')]      # 놋쇠 0 어두움 ~ 4 하이라이트
ST = [hx(c) for c in ('#55657E', '#7F93AE', '#AFC0D4', '#D3DEEA', '#F2F7FC')]      # 강철 면
SKY = [hx(c) for c in ('#2D63B8', '#4E8FE6', '#7EC0FF', '#B8E0FF', '#E8F6FF')]     # 밝은 하늘색 깃발
CY = [hx(c) for c in ('#3E9FD0', '#7FD8FF', '#C8F2FF')]                             # 물결
WD = [hx(c) for c in ('#4A2A12', '#7A4A22', '#A8703A', '#D4A060', '#F0CC90')]      # 나무
IV = [hx(c) for c in ('#9C8A66', '#CDBB92', '#E8DCBC', '#FAF4E2')]                  # 상아 가죽 북면
LQ = [hx(c) for c in ('#5A1E14', '#8E3420', '#C05A2C', '#E08A48')]                  # 주칠 북 몸통
DK = hx('#1A1206')


class Canvas:
    def __init__(self): self.rgb = np.zeros((N, N, 3), np.uint8); self.a = np.zeros((N, N), bool)
    def put(self, mask, col):
        self.rgb[mask] = col; self.a |= mask
    def px(self, x, y, col):
        if 0 <= x < N and 0 <= y < N: self.rgb[y, x] = col; self.a[y, x] = True


Y, X = np.mgrid[0:N, 0:N]


def disk(cx, cy, r, ry=None):
    ry = ry or r
    return ((X + 0.5 - cx) / r) ** 2 + ((Y + 0.5 - cy) / ry) ** 2 <= 1.0


def shade(mask, cx, cy, r, pal, ring=False):
    """구형 명암: 광원 왼쪽 위. pal 낮은 인덱스 = 어두움."""
    d = ((X + 0.5 - cx) - (Y + 0.5 - cy)) / (r * 1.4142)   # -1 왼쪽 위 ~ +1 오른쪽 아래
    out = np.zeros((N, N, 3), np.uint8); n = len(pal)
    idx = np.clip(np.round((1 - (d + 1) / 2) * (n - 1.2)), 0, n - 1).astype(int)
    for i in range(n): out[mask & (idx == i)] = pal[i]
    return out


def round_shield(cv, cx, cy, r, rim=2):
    outer = disk(cx, cy, r); inner = disk(cx, cy, r - rim)
    rim_m = outer & ~inner
    s = shade(rim_m, cx, cy, r, BR[1:]); cv.put(rim_m, BR[2]); cv.rgb[rim_m] = s[rim_m]
    f = shade(inner, cx, cy, r - rim, ST[1:]); cv.put(inner, ST[2]); cv.rgb[inner] = f[inner]
    # 면 안쪽 1px 그늘선(테 아래·오른쪽 안쪽) = 테와 면 분리
    edge = inner & ~disk(cx, cy, r - rim - 1) & ((X + 0.5 - cx) + (Y + 0.5 - cy) > 0)
    cv.rgb[edge] = ST[0]
    # 면 하이라이트 반달(왼쪽 위)
    hl = disk(cx - r * 0.33, cy - r * 0.33, max(1.2, r * 0.32)) & inner
    cv.rgb[hl] = ST[4]
    return outer


def boss(cv, cx, cy, r):
    m = disk(cx, cy, r); cv.put(m, BR[2])
    cv.rgb[m] = shade(m, cx, cy, r, BR[1:])[m]
    cv.px(int(cx - r * 0.4), int(cy - r * 0.4), BR[4])
    ring = m & ~disk(cx, cy, r - 1) & ((X + 0.5 - cx) + (Y + 0.5 - cy) > 0.5); cv.rgb[ring] = BR[0]


def line(cv, x0, y0, x1, y1, col, w=1):
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    for t in np.linspace(0, 1, n):
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        for dx in range(w):
            for dy in range(w): cv.px(int(round(x)) + dx, int(round(y)) + dy, col)


def aura_def():
    cv = Canvas()
    round_shield(cv, 15, 13.5, 12.5, rim=2)
    boss(cv, 15, 13.5, 3.2)
    # 방패 면 십자 리벳 4개(문양 아님, 강철판 고정 못)
    for dx, dy in ((0, -7), (0, 7), (-7, 0), (7, 0)): cv.px(15 + dx, 13 + dy, BR[3]); cv.px(15 + dx, 14 + dy, BR[1])
    # 방패 아래 양옆으로 퍼지는 물결 두 줄(밝은 청록, 방패 밖)
    for (y0, amp, col, xs) in ((26, 1, CY[1], (range(0, 9), range(21, 30))), (28, 1, CY[0], (range(1, 12), range(18, 29)))):
        for rg in xs:
            for x in rg:
                y = y0 + (1 if (x // 2) % 2 else 0) * amp
                cv.px(x, y, col)
                if col is CY[1] and (x // 2) % 2 == 0: cv.px(x, y - 1, CY[2]) if x % 4 == 0 else None
    return cv


def au_def_w():
    cv = Canvas()
    # 깃대(나무, 위 창날 금속 꼭지)
    for y in range(4, 29):
        cv.px(8, y, WD[2]); cv.px(9, y, WD[1]); cv.px(10, y, WD[0])
    for y, w in ((1, 1), (2, 2), (3, 3)):
        for dx in range(w): cv.px(9 - w // 2 + dx, y, BR[3] if dx == 0 else BR[2])
    # 삼각 깃발(오른쪽으로 펄럭, 밝은 하늘색) x 11~26, y 4~15
    for x in range(11, 27):
        t = (x - 11) / 15.0
        top = 4 + int(round(t * 5.0 + np.sin(t * 6.0) * 0.8)); bot = 16 - int(round(t * 5.6 - np.sin(t * 6.0) * 0.6))
        for y in range(top, bot + 1):
            col = SKY[3] if y == top else SKY[0] if y == bot else SKY[1] if y >= bot - 1 else SKY[2]
            if (x - 11) % 6 == 5 and top + 1 < y < bot - 1: col = SKY[1]            # 펄럭 주름 그늘
            cv.px(x, y, col)
    # 작은 둥근 방패(깃대 밑동에 기댐)
    round_shield(cv, 17.5, 22.5, 7.0, rim=2)
    boss(cv, 17.5, 22.5, 2.0)
    return cv


def au_both_w():
    cv = Canvas()
    cx, top, bot, rx, ry = 15, 10.5, 24.5, 12.0, 4.2
    # 몸통(약간 배부른 통): 두 타원 사이 + 좌우 볼록
    body = np.zeros((N, N), bool)
    for y in range(N):
        if top <= y + 0.5 <= bot:
            t = (y + 0.5 - top) / (bot - top); bulge = 1.0 + 0.07 * np.sin(np.pi * t)
            body[y] |= np.abs(X[y] + 0.5 - cx) <= rx * bulge
    body |= disk(cx, bot, rx, ry)
    # 몸통 명암: 왼쪽 밝게, 오른쪽 어둡게(원통)
    u = (X + 0.5 - cx) / rx
    col = np.where(u[..., None] < -0.55, LQ[3], np.where(u[..., None] < 0.05, LQ[2], np.where(u[..., None] < 0.6, LQ[1], LQ[0])))
    cv.put(body, LQ[2]); cv.rgb[body] = col[body]
    # 놋쇠 징 띠 2줄(위·아래 가죽 고정 못)
    for yb in (top + 2.2, bot - 0.3):
        for x in range(int(cx - rx) + 1, int(cx + rx)):
            uu = (x + 0.5 - cx) / rx
            if abs(uu) > 0.97: continue
            y = int(round(yb + ry * np.sqrt(max(0, 1 - uu * uu)) * 0.9))
            if body[y, x]: cv.rgb[y, x] = LQ[0]
            if x % 3 == 1 and body[y, x]: cv.rgb[y, x] = BR[3] if uu < 0.2 else BR[2]
    # 위 북면(상아 가죽 타원) + 테두리
    head = disk(cx, top, rx, ry)
    cv.put(head, IV[2])
    hd = ((X + 0.5 - cx) / rx * 0.6 + (Y + 0.5 - top) / ry * 0.4)
    cv.rgb[head & (hd < -0.35)] = IV[3]; cv.rgb[head & (hd > 0.35)] = IV[1]
    hring = head & ~disk(cx, top, rx - 1.2, ry - 1.0)
    cv.rgb[hring] = IV[0]
    cv.rgb[hring & (Y + 0.5 < top)] = LQ[1]
    # 북채(북면 위 비스듬히: 왼쪽 위 손잡이 -> 오른쪽 아래, 끝 둥근 머리)
    line(cv, 3.5, 2.5, 21.5, 11.0, WD[1], 2)
    line(cv, 3.5, 2.0, 21.5, 10.5, WD[4], 1)
    kn = disk(23.0, 11.5, 2.3); cv.put(kn, WD[3]); cv.rgb[kn & (X + Y < 33)] = WD[4]; cv.rgb[kn & (X + Y > 35)] = WD[1]
    return cv


def main():
    for code, fn, tpl in (('aura_def', aura_def, 'T_AURA_DEF'), ('au_def_w', au_def_w, 'T_AURA_DEF'), ('au_both_w', au_both_w, 'T_AURA_BOTH')):
        cv = fn()
        out = compose(code, cv.rgb, cv.a, tpl, False, 'aura')
        for d, im in (('48', out), ('96', out.resize((S * 2, S * 2), Image.NEAREST))):
            p = os.path.join(OUT, d, f'{code}.png')
            if os.path.exists(p) and not os.path.exists(p + '.bak-camp-20261103'): shutil.copy2(p, p + '.bak-camp-20261103')
            im.save(p, optimize=True)
        print('saved', code)


if __name__ == '__main__':
    main()
