# 3x3 시트 raw(JPEG) 의 지정 사각형을 크로마키 마젠타로 칠해 복제 소품을 지운다(호출 없음, 안아트 2026-11-03).
# 사용: python sprite_raw_patch.py <in.jpg> <out.jpg> x0,y0,x1,y1 [...] [--crop=x0,y0,x1,y1:<preview.png>]
import sys
from PIL import Image, ImageDraw
src, dst, *rest = sys.argv[1:]
im = Image.open(src).convert('RGB'); d = ImageDraw.Draw(im)
crop = None
for a in rest:
    if a.startswith('--crop='):
        box, out = a[7:].split(':', 1); crop = (tuple(int(v) for v in box.split(',')), out); continue
    if a.startswith('--flip='):  # 칸 좌우 반전(측면 행에서 오른쪽을 보는 칸 → 왼쪽)
        b = tuple(int(v) for v in a[7:].split(',')); im.paste(im.crop(b).transpose(Image.FLIP_LEFT_RIGHT), b[:2]); continue
    x0, y0, x1, y1 = (int(v) for v in a.split(','))
    d.rectangle([x0, y0, x1, y1], fill=(255, 0, 255))
im.save(dst, quality=97)
if crop:
    im.crop(crop[0]).save(crop[1])
print('patched', dst, im.size)
