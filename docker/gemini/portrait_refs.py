"""스타일 참조 이미지 생성: 기존 합격본을 마젠타 배경에 합성한 600x800 JPEG. python portrait_refs.py <outdir> <png...>"""
import sys, os
from PIL import Image
od = sys.argv[1]; os.makedirs(od, exist_ok=True)
for f in sys.argv[2:]:
    im = Image.open(f).convert('RGBA'); bg = Image.new('RGBA', im.size, (255, 0, 255, 255)); bg.alpha_composite(im)
    bg.convert('RGB').resize((600, 800), Image.LANCZOS).save(os.path.join(od, os.path.basename(f)[:-4] + '.jpg'), quality=88)
