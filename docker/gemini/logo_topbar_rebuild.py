# 상단 바 로고 재구성(안아트 2026-11-14, 이미지 모델 호출 0 — 사용자 제공 ui.logo.header@2x 재배치만)
#   요청: 로고 현판 금테를 상단 바(atlas.uiskin#topbar.strip) 금테에 맞춤. 왕관·방패는 이미지 안.
#   방법: 원본(1000x333)에서 문장(왕관·검·방패·월계수·리본)을 분리 -> 현판은 오른쪽 끝 장식을 좌우 반전해 왼쪽 끝을 새로 만들고
#         문장 뒤 가려졌던 구간은 깨끗한 현판 세로줄(x=COL)로 채움 -> 현판/문장을 서로 다른 배율로 다시 합성.
#   출력: public/assets/ui/logo_topbar@2x.webp(H=120) + logo_topbar.webp(H=60), 미리보기는 argv[1] 폴더(선택)
# 실행: python -X utf8 docker/gemini/logo_topbar_rebuild.py [preview_dir] [bottom_ratio]
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd

A = 'public/assets'
SRC = f'{A}/ui/logo_header@2x.webp'
PV = sys.argv[1] if len(sys.argv) > 1 else None
H2 = 120                                   # @2x 높이 = 상단 바 표시 높이 60 x 2
TOP = 12 / 192                             # 현판 바깥 윗선 = 바 윗 금띠 안쪽 끝(strip y 12/192)
BOT = float(sys.argv[2]) if len(sys.argv) > 2 else 163 / 192  # 현판 바깥 아랫선 = 바 아래 가는 금선 아래 끝(strip 실측 y 157~163/192)
PT, PB = 70, 254                           # 원본 현판 바깥 위/아래(실측)
COL = 820                                  # 원본에서 글자·장식 없는 현판 세로줄
CAP0 = 830                                 # 오른쪽 끝 장식 시작(이 열부터 오른쪽 끝까지를 좌우 반전해 왼쪽 끝으로)
TXT0 = 279                                 # 원본 글자 구간 시작(그 왼쪽은 문장 뒤라 COL 로 대체)

src = np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)
Hs, Ws = src.shape[:2]

# ---------- 1) 문장 분리 ----------
r, g, b, al = (src[..., i] for i in range(4))
lum = (r + g + b) / 3
navy = (b >= r + 4) & (lum < 80)
red = (r > 70) & (g < 0.55 * r) & (b < 0.6 * r)   # 리본 빨강(금색 g/r 0.7 이상과 구분)
m = (al > 128) & ~navy & (lum >= 28)
m = nd.binary_fill_holes(m)
xx = np.arange(Ws)[None, :].repeat(Hs, 0); yy = np.arange(Hs)[:, None].repeat(Ws, 1)
m &= xx < 372
m &= ~((xx < 70) & ~red)                    # 왼쪽 현판 끝 장식(뾰족 끝·세로 테) 제외, 리본 꼬리만
m &= ~((xx >= 268) & ~red)                  # 문장 오른쪽: 리본만(현판 위·아래 테·글자 제외)
lab, n = nd.label(m)                        # 작은 파편 제거
sizes = nd.sum(m, lab, range(1, n + 1)); keep = np.isin(lab, 1 + np.where(sizes >= 60)[0]); m &= keep
ys, xs = np.where(m); ey0, ey1, ex0, ex1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
ma = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
ea = src.copy(); ea[..., 3] = np.minimum(al, np.asarray(ma, np.float32))
emb = Image.fromarray(ea.astype(np.uint8), 'RGBA').crop((ex0, ey0, ex1, ey1))

# ---------- 2) 현판 재구성(원본 단위) ----------
def colfill(w):                            # 채움 세로줄: 위 = x376, 가운데 남색 = COL, 아래 테 = x352(글자 구간 아래 테와 같은 단면)
    c = src[:, COL:COL + 1].copy(); c[:100] = src[:100, 376:377]; c[212:225] = src[208:209, COL:COL + 1]; c[225:] = src[225:, 352:353]
    return np.repeat(c, w, 1)
body = src[:, TXT0:].copy()
# 문장 리본이 덮던 현판 윗 테(글자 위 띠)와 리본 잔여 빨강 -> 같은 행의 깨끗한 세로줄로
bx = np.arange(body.shape[1])[None, :]; by = np.arange(Hs)[:, None]
br, bg_, bb = body[..., 0], body[..., 1], body[..., 2]
redb = (br > 70) & (bg_ < 0.55 * br) & (bb < 0.6 * br)
redb = nd.binary_dilation(redb, iterations=2) & (bx < 372 - TXT0) & ((by < 108) | (by > 196))  # 리본 자리만(글자 어두운 주황 가장자리 보호)
def rowsfrom(col): return np.repeat(src[:, col:col + 1], body.shape[1], 1)
TOPC, BOTC = 376, 352                       # 리본에 안 덮인 가까운 현판 세로줄(위 테 / 아래 테)
f1 = redb & (by < 108) | ((by < 100) & (bx < 372 - TXT0)) | ((by < 112) & (bx < 326 - TXT0))  # ㄹ 윗변(y118) 위까지
f2 = (by >= 225) & (bx < 345 - TXT0) | redb & (by >= 225)
f3 = (by >= 196) & (by < 225) & (bx < 322 - TXT0)   # 밑줄 장식(x>=323) 왼쪽은 남색 면
CF = colfill(body.shape[1]); body[f1] = CF[f1]; body[f2] = rowsfrom(BOTC)[f2]; body[f3] = CF[f3]
cap = src[:, CAP0:][:, ::-1]

# ---------- 3) 배율·배치(@2x) ----------
yT, yB = TOP * H2, BOT * H2
s = (yB - yT) / (PB - PT)                   # 현판 배율
se = (H2 - 2) / (ey1 - ey0)                 # 문장 배율(위아래 1px 여백)
PADL = 10                                   # 왼쪽 투명 여백(바 캡 안쪽 선과 간격)
EXL = 8                                     # 현판 왼쪽 끝(반전 장식 끝)에서 문장 왼쪽 끝까지
ex = PADL + EXL; ey = 1
ribbon_end = ex + (ex1 - ex0) * se          # 문장 오른쪽 끝(위 리본 끝)
X_t = ribbon_end + 2                        # 글자 구간 시작(리본이 글자 윗부분을 덮지 않게)
GAPx = max(0, round((X_t - PADL) / s - cap.shape[1]))
plq = np.concatenate([cap, colfill(GAPx), body], 1)
plq_im = Image.fromarray(np.clip(plq, 0, 255).astype(np.uint8), 'RGBA')
pw = round(plq_im.width * s); ph = round(Hs * s)
plq_s = plq_im.resize((pw, ph), Image.LANCZOS)
oy = round(yT - PT * s)
W2 = PADL + pw; W2 += W2 % 2                  # @1x 정수 배율(짝수 폭)
cv = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
cv.alpha_composite(plq_s.crop((0, max(0, -oy), pw, min(ph, H2 - oy))), (PADL, max(0, oy)))
ew, eh = round(emb.width * se), round(emb.height * se)
emb_s = emb.resize((ew, eh), Image.LANCZOS)
# 문장 테두리 그림자(현판 위에서 분리감)
sh = Image.new('RGBA', cv.size, (0, 0, 0, 0)); sa = Image.new('L', cv.size, 0); sa.paste(emb_s.getchannel('A'), (ex, ey))
sa = sa.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2)).point(lambda v: int(v * 0.55))
sh.putalpha(sa); cv.alpha_composite(sh)
cv.alpha_composite(emb_s, (ex, ey))
info = {'size2x': cv.size, 'plaque_scale': round(s, 4), 'emblem_scale': round(se, 4), 'plaque_top_px2x': round(yT, 2), 'plaque_bottom_px2x': round(yB, 2),
        'top_ratio': round(TOP, 4), 'bottom_ratio': round(BOT, 4), 'emblem_box2x': [ex, ey, ex + ew, ey + eh]}
print(json.dumps(info))
if PV:
    cv.save(f'{PV}/logo_topbar@2x_test.png')
else:
    cv.save(f'{A}/ui/logo_topbar@2x.webp', 'WEBP', quality=92, method=6, alpha_quality=100)
    cv.resize((round(cv.width / 2), H2 // 2), Image.LANCZOS).save(f'{A}/ui/logo_topbar.webp', 'WEBP', quality=92, method=6, alpha_quality=100)
