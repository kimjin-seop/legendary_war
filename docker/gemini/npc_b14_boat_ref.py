# npc_b14: 배 시트 생성용 3x3 배치 견본(호출 없음). 수레 시트(npc_cart_1, 64_x2) 행 down/left/up -> 1024x1024 마젠타 바탕 3x3(칸 341, 도트 x5).
# 실행(프로젝트 루트): python docker/gemini/npc_b14_boat_ref.py
from PIL import Image
src = Image.open('public/assets/sprites/npc/64/npc_cart_1_ally_sheet.png').convert('RGBA')
out = Image.new('RGBA', (1024, 1024), (255, 0, 255, 255))
for r, sr in enumerate([0, 1, 3]):
    for c in range(3):
        f = src.crop((c * 64, sr * 64, c * 64 + 64, sr * 64 + 64)).resize((320, 320), Image.NEAREST)
        out.alpha_composite(f, (c * 341 + 10, r * 341 + 10))
out.convert('RGB').save('docker/gemini/npc_b14/boat_layout_ref.png')
print('ok')
