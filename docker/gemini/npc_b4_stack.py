# npc_b4 QA 미리보기 세로 합치기(호출 없음). 사용: python npc_b4_stack.py <out.jpg> code ...
import sys
from PIL import Image, ImageDraw
out, codes = sys.argv[1], sys.argv[2:]
ims = [Image.open(f'docker/gemini/gunner/sprite_preview/{c}_qa.png').convert('RGB') for c in codes]
W = max(i.width for i in ims); s = Image.new('RGB', (W, sum(i.height + 16 for i in ims)), (30, 30, 30)); d = ImageDraw.Draw(s); y = 0
for c, i in zip(codes, ims): d.text((4, y + 2), c, fill=(255, 255, 0)); s.paste(i, (0, y + 16)); y += i.height + 16
s.save(out, quality=85)
