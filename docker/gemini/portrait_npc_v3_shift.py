"""신규 NPC v3 초상 상단 여백 보정(호출 없음, 안아트 2026-11-02). 창끝·투구 꼭지가 위 가장자리에 닿기만 한(잘리지 않은) 경우
내용 전체를 아래로 N px 내려 위 여백을 만든다(아래 허리 쪽 N px 은 잘림 — 하단은 원래 잘린 가장자리). 896x1200 유지, thumb 재생성.
사용: python -X utf8 docker/gemini/portrait_npc_v3_shift.py <code> <px> [<code> <px> ...]   (portrait_campaign/out 대상, 원본은 out/_preshift/ 보존)"""
import os, sys, shutil
from PIL import Image
O = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'portrait_campaign', 'out')
os.makedirs(os.path.join(O, '_preshift'), exist_ok=True)
a = sys.argv[1:]
for code, px in zip(a[::2], a[1::2]):
    p = os.path.join(O, f'{code}.png'); b = os.path.join(O, '_preshift', f'{code}.png')
    if not os.path.exists(b): shutil.copy2(p, b)
    src = Image.open(b).convert('RGBA'); w, h = src.size; n = int(px)
    dst = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dst.paste(src.crop((0, 0, w, h - n)), (0, n))
    dst.save(p, optimize=True, compress_level=9)
    t = dst.resize((256, round(h * 256 / w)), Image.LANCZOS); t.save(os.path.join(O, 'thumb', f'{code}.webp'), 'WEBP', quality=88, method=6)
    print(code, 'shift', n, dst.size, t.size)
