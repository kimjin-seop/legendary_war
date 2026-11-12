"""비교 시트: python portrait_sheet.py <out.png> <ref1.png,ref2,...> <png...>  (첫 줄 기준 초상화, 이후 신규; 회색 배경, 파일명 표기)"""
import sys
from PIL import Image, ImageDraw
out, refs = sys.argv[1], sys.argv[2].split(',')
files = refs + sys.argv[3:]
W, H, C = 190, 253, 7
rows = (len(files) + C - 1) // C
sheet = Image.new('RGB', (W * C, (H + 14) * rows), (120, 120, 120)); d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGBA').resize((W, H), Image.LANCZOS)
    x, y = (i % C) * W, (i // C) * (H + 14)
    sheet.paste(im, (x, y), im); d.text((x + 2, y + H + 1), f.split('/')[-1][:-4][:26], fill=(255, 255, 255))
sheet.save(out)
