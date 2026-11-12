"""개별 QA 패널: python portrait_qa_panel.py <in.png> <out.png>
좌: 전체(회색 배경, 600x800) / 우상: 얼굴 영역 2배 확대 / 우하: 손 영역(하반부) 확대 / 하단 띠: 가장자리 확대(흰·검정 배경 2종).
얼굴·손 영역은 알파 기반 자동 추정(상단 불투명 시작점 기준)."""
import sys, numpy as np
from PIL import Image, ImageDraw
src, out = sys.argv[1:3]
im = Image.open(src).convert('RGBA'); w, h = im.size
a = np.asarray(im)[..., 3]
rows = np.where(a.max(1) > 128)[0]; top = int(rows[0]) if len(rows) else 0
def on(bg, img):
    b = Image.new('RGBA', img.size, bg); b.alpha_composite(img); return b.convert('RGB')
P = Image.new('RGB', (1400, 1100), (40, 40, 40))
P.paste(on((128, 128, 128, 255), im).resize((600, 800), Image.LANCZOS), (0, 0))
face = im.crop((w // 2 - 200, top + 40, w // 2 + 200, top + 440))
P.paste(on((128, 128, 128, 255), face).resize((800, 800), Image.LANCZOS).crop((0, 0, 800, 400)).resize((800, 400)), (600, 0))
P.paste(on((128, 128, 128, 255), face).resize((800, 800), Image.LANCZOS).crop((0, 400, 800, 800)), (600, 400))
hands = im.crop((0, h // 2, w, h)).resize((600, 400), Image.LANCZOS)
P.paste(on((128, 128, 128, 255), hands), (0, 800 + 0) if False else (600, 800 - 0)) if False else None
P.paste(on((128, 128, 128, 255), hands).resize((450, 300)), (0, 800))
# 가장자리: 실루엣 오른쪽 경계 중간 높이 근처 150x150 을 2배(흰/검)
mid = h // 2; cols = np.where(a[mid] > 128)[0]; rx = int(cols[-1]) if len(cols) else w - 1
e = im.crop((max(0, rx - 75), mid - 75, min(w, rx + 75), mid + 75))
P.paste(on((255, 255, 255, 255), e).resize((300, 300), Image.NEAREST), (460, 800))
P.paste(on((0, 0, 0, 255), e).resize((300, 300), Image.NEAREST), (770, 800))
lx = int(cols[0]) if len(cols) else 0
e2 = im.crop((max(0, lx - 75), top + 300, lx + 75, top + 450))
P.paste(on((255, 255, 255, 255), e2).resize((300, 300), Image.NEAREST), (1080, 800))
P.save(out)
