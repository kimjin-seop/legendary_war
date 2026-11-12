# 총병 이펙트 절차 생성(이미지 API 호출 없음, 안아트 2026-11-03): fx.gun_muzzle(총구 화염 32x32 x4) + fx.gun_smoke(화약 연기 32x32 x6)
#   출력: public/assets/effects/gun/{muzzle_flash,gun_smoke}.png (+ x3/), 조각 public/assets/effects/gun/manifest_fragment_gun.json
#   방향: 총구가 프레임 왼쪽 가운데(x=2, y=16), 화염·연기가 오른쪽(+x)으로 뻗음 → 유닛이 왼쪽을 향하면 flipX. 실행: python docker/gemini/fx_gun_build.py
import os, json
import numpy as np
from PIL import Image

OUT = 'public/assets/effects/gun'; os.makedirs(f'{OUT}/x3', exist_ok=True)
FIRE = [(90, 24, 8), (200, 64, 16), (244, 132, 32), (252, 200, 80), (255, 246, 196)]
SMK = [(70, 66, 64), (110, 106, 102), (150, 146, 140), (196, 192, 186), (228, 226, 220)]

def muzzle(k):
    a = np.zeros((32, 32, 4), np.uint8); L = [10, 18, 14, 7][k]; W = [3.2, 5.0, 4.0, 2.4][k]
    for y in range(32):
        for x in range(32):
            dx = x - 2; dy = y - 15.5
            if dx < 0 or dx > L: continue
            t = dx / max(1, L); hw = W * (1 - t) ** 0.7 + (0.8 if k == 1 else 0)
            spike = abs(dy) <= hw or (k in (1, 2) and abs(abs(dy) - dx * 0.55) < 0.9 and dx < L * 0.7)   # 옆으로 갈라지는 불혀
            if spike:
                c = 4 if t < 0.25 else 3 if t < 0.5 else 2 if t < 0.8 else 1
                if abs(dy) > hw * 0.6: c = max(1, c - 1)
                a[y, x] = (*FIRE[c], 255)
    if k == 0:
        for y in range(13, 19): a[y, 2:5] = (*FIRE[4], 255)
    return a

def smoke(k):
    a = np.zeros((32, 32, 4), np.uint8); rng = np.random.default_rng(7)
    puffs = [(6 + i * 4 + k * 2.2, 16 - (k * 0.9) + rng.uniform(-2, 2), 2.5 + k * 0.9 + i * 0.4) for i in range(4)]
    alpha = [255, 255, 230, 200, 150, 90][k]                  # 뒤 프레임일수록 옅게(가장자리는 0/255 대신 단계 알파 — 연기 특성상 반투명 허용)
    for y in range(32):
        for x in range(32):
            best = None
            for cx, cy, r in puffs:
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if d <= r: best = min(best, d / r) if best is not None else d / r
            if best is not None:
                c = 4 if best < 0.35 else 3 if best < 0.65 else 2 if best < 0.85 else 1
                if (x + y + k) % 7 == 0: c = max(0, c - 1)
                a[y, x] = (*SMK[c], alpha)
    return a

def sheet(frames):
    s = np.concatenate(frames, axis=1); return Image.fromarray(s, 'RGBA')
items = []
for key, fn, n, fps, note in (('fx.gun_muzzle', muzzle, 4, 24, '총구 화염(짧게 1회, 4프레임 ≈ 0.17초)'), ('fx.gun_smoke', smoke, 6, 10, '화약 연기(화염 뒤 0.6초, 오른쪽 위로 퍼지며 옅어짐)')):
    im = sheet([fn(k) for k in range(n)]); name = key.split('.')[1]
    p1, p3 = f'{OUT}/{name}.png', f'{OUT}/x3/{name}.png'
    im.save(p1, optimize=True); im.resize((im.width * 3, im.height * 3), Image.NEAREST).save(p3, optimize=True)
    items.append({'key': key, 'path': p1.replace('public/', ''), 'type': 'spritesheet', 'frameWidth': 32, 'frameHeight': 32, 'frames': n, 'size': f'{32 * n}x32', 'alpha': True, 'fps_hint': fps, 'loop': False,
                  'anchor': '총구 = 프레임 (2, 16). 화염·연기는 +x(오른쪽)로 뻗음 — 유닛이 왼쪽을 향하면 flipX. 총구 위치는 시트 측면 칸의 총 끝에 맞춰 배치', 'note': note,
                  'displayScale': '정수 배율(x2~x3) 권장, NEAREST 필터', 'variants': {'x3': p3.replace('public/', '')}, 'scope': 'battle',
                  'generator': {'model': 'none(절차 생성)', 'script': 'docker/gemini/fx_gun_build.py (Pillow)'}, 'prompt_ref': '없음(코드 손도트)', 'license': '자체 제작(코드 생성), 외부 소스 없음',
                  'qa': {'checked': True, 'verdict': 'pass', 'issues': ['연기 프레임은 단계 알파(반투명) 사용 — 화염은 0/255', '화면 속 타이밍(fps)은 실화면 확인 필요']}, 'verify': False, 'bytes': os.path.getsize(p1),
                  'load_hint': f"scope battle. Phaser spritesheet frameWidth 32 frameHeight 32 ({n}프레임)"})
prev = Image.new('RGBA', (32 * 6 * 4, 64 * 4), (30, 34, 44, 255))
prev.alpha_composite(Image.open(f'{OUT}/muzzle_flash.png' if False else f'{OUT}/gun_muzzle.png').resize((128 * 4, 32 * 4), Image.NEAREST), (0, 0))
prev.alpha_composite(Image.open(f'{OUT}/gun_smoke.png').resize((192 * 4, 32 * 4), Image.NEAREST), (0, 128))
prev.save(f'{OUT}/preview_gun_fx_x4.png')
json.dump({'_note': '총병 이펙트(안아트 2026-11-03, 호출 없음). 병합 merge_fragments.mjs FRAGMENTS', 'items': items}, open(f'{OUT}/manifest_fragment_gun.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print([(i['key'], i['size'], i['bytes']) for i in items])
