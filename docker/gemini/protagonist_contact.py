# 주인공 QA 보조(호출 없음): 이미지 여러 장을 한 줄/격자로 묶음. 사용: python protagonist_contact.py out.png cols h img1 img2 ...
import sys
from PIL import Image
out, cols, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); ims = []
for p in sys.argv[4:]:
    im = Image.open(p).convert('RGBA'); im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS); bg = Image.new('RGBA', im.size, (70, 70, 80, 255)); bg.alpha_composite(im); ims.append(bg)
w = max(i.width for i in ims); rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows), (40, 40, 40))
for k, im in enumerate(ims): sheet.paste(im.convert('RGB'), ((k % cols) * w, (k // cols) * h))
sheet.save(out)
