"""raw 후보 접촉 시트(검수용). 사용: python card_contact.py out.png img1 img2 ..."""
import sys
from PIL import Image
out, fs = sys.argv[1], sys.argv[2:]
th = 700
ims = [Image.open(f).convert('RGB') for f in fs]
ims = [i.resize((round(i.width * th / i.height), th)) for i in ims]
o = Image.new('RGB', (sum(i.width for i in ims) + 10 * len(ims), th), (40, 40, 40)); x = 0
for i in ims:
    o.paste(i, (x, 0)); x += i.width + 10
o.save(out)
