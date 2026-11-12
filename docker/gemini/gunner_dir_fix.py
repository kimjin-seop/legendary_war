# 총병 시트 방향 결함 교정(안아트 2026-11-09). 규약: 행0 down, 행1 left, 행2 right(=left 미러), 행3 up / 열 walk1,idle,walk2
# japan: 행1/행2 내용이 뒤바뀜 -> 두 행 교환.  china/europe(default 별칭 포함): 측면 두 행의 walk2(열2)만 반대 방향 -> 해당 칸 좌우반전
# 받침 마커는 칸 중심 대칭(x21~42)이라 반전해도 위치 불변. x2 는 x1 의 nearest 2배로 재생성(기존 x2 와 동일 규칙 확인)
# 원본 백업: docker/db-backup-20261109/gunner-fix/
import sys
from PIL import Image
P = sys.argv[1] if len(sys.argv) > 1 else 'public/assets/sprites'
F = 64
def fix(c, s):
    f = f'{P}/64/{c}_gunner_{s}_sheet.png'; im = Image.open(f).convert('RGBA')
    if c == 'japan':
        r1 = im.crop((0, F, 3*F, 2*F)); r2 = im.crop((0, 2*F, 3*F, 3*F)); im.paste(r2, (0, F)); im.paste(r1, (0, 2*F))
    else:
        for r in (1, 2):
            box = (2*F, r*F, 3*F, (r+1)*F); im.paste(im.crop(box).transpose(Image.FLIP_LEFT_RIGHT), box[:2])
    im.save(f, optimize=True)
    im.resize((im.width*2, im.height*2), Image.NEAREST).save(f'{P}/64_x2/{c}_gunner_{s}_sheet.png', optimize=True)
for c in ('japan', 'china', 'europe'):
    for s in ('ally', 'enemy'): fix(c, s)
print('ok')
