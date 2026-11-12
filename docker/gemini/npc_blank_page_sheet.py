# 보스 '백지' 전투 시트 절차 대체(이미지 API 호출 없음, 안아트 2026-11-03): 시트 생성 2회(r0·r1)가 모두 도트 격자 판정 실패(회화체·칸 넘침)라
# 정식 초상(portrait_campaign/out/npc_blank_page.png)을 64px 도트로 축소·감색(24색)·1px 외곽선 → 방향 없는 부유체 3x4 시트(걷기 = 1px 떠오름).
# 출력: docker/gemini/npc_b6/sprite_out/{64,64_x2}/hero_npc_blank_page_{ally,enemy}_sheet.png (hero_dir_pp_v4 와 같은 192x256 규격, 발밑 팀색 받침 A안)
import numpy as np
from PIL import Image
src = 'docker/gemini/portrait_campaign/out/npc_blank_page.png'; O = 'docker/gemini/npc_b6/sprite_out'
im = Image.open(src).convert('RGBA'); im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 60 else 0).getbbox())
W, H = 50, 54; s = min(W / im.width, H / im.height); im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
rgb = im.convert('RGB').quantize(24, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
from PIL import ImageFilter
A0 = im.getchannel('A').point(lambda v: 255 if v > 128 else 0).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))   # 가는 종이 띠(1~2px) 제거 — 외곽선만 남아 다리처럼 보이는 것 방지
a = np.dstack([np.array(rgb), np.array(A0)]).astype(np.uint8)
al = a[..., 3] > 0; p = np.pad(al, 1); edge = al & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]); a[edge, :3] = (58, 50, 48)
spr = Image.fromarray(a)
def frame(img, lift, side):
    f = Image.new('RGBA', (64, 64), (0, 0, 0, 0)); x = (64 - img.width) // 2; y = 59 - img.height - lift
    m = np.zeros((64, 64, 4), np.uint8); c1, c2 = ((62, 142, 247), (43, 99, 173)) if side == 'ally' else ((224, 74, 74), (160, 46, 46))
    for yy, x0, x1, col in ((61, 24, 39, c1), (62, 21, 42, c1), (63, 24, 39, c2)): m[yy, x0:x1 + 1] = (*col, 255)
    f = Image.fromarray(m); f.alpha_composite(img, (x, y)); return f
for side in ('ally', 'enemy'):
    sh = Image.new('RGBA', (192, 256), (0, 0, 0, 0))
    for r, img in enumerate((spr, spr, spr.transpose(Image.FLIP_LEFT_RIGHT), spr)):
        for c, lift in enumerate((1, 0, 1)): sh.paste(frame(img, lift, side), (c * 64, r * 64))
    sh.save(f'{O}/64/hero_npc_blank_page_{side}_sheet.png', optimize=True)
    sh.resize((384, 512), Image.NEAREST).save(f'{O}/64_x2/hero_npc_blank_page_{side}_sheet.png', optimize=True)
print('ok', spr.size)
