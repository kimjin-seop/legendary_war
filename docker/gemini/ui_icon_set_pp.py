# UI 아이콘 세트(호출 없음, 안아트 2026-11-04): 기존 아이콘 재사용·후처리만
#  1) 병종 ico.troop.<code>.{64,32}: icon.class_* 128 → 64·32 축소(LANCZOS, 알파 유지). 없는 병종(gunner·naval·assassin·monster)은 임시 대체(placeholder) 복사
#  2) 장비 슬롯 ico.slot.<slot>.{64,32}: 장비 C 아이콘(icons/128/<slot>_c.png)을 단색 금빛 실루엣(밝기 → 3단 금 톤 + 남흑 외곽선)으로 통일
#  3) 능력치 ico.stat.<code>.{64,32}: 기존 도트 ico.stat_* 32·x2(64) 복사(정수 배율 유지)
# 출력 public/assets/ui/icons/set/{64,32}/*.png + manifest 조각 public/assets/ui/icons/set/manifest_fragment_ui_icon_set.json
# 실행(docker python:3.12 + pylib_b): python -X utf8 docker/gemini/ui_icon_set_pp.py
import json, os, shutil
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
O = 'public/assets/ui/icons/set'; [os.makedirs(f'{O}/{s}', exist_ok=True) for s in ('64', '32')]
items = []
def reg(key, name, kind, extra):
    for s in ('64', '32'):
        p = f'{O}/{s}/{name}.png'
        items.append({'key': f'{key}.{s}', 'path': p.replace('public/', ''), 'type': 'icon', 'size': f'{s}x{s}', 'alpha': True, 'format': 'png', 'bytes': os.path.getsize(p), 'group': kind, **extra})
TROOP = {'sword': 'sword', 'spear': 'spear', 'cavalry': 'cavalry', 'archer': 'archer', 'mage': 'mage', 'healer': 'healer', 'flyer': 'flying', 'heavy': 'heavy'}
TEMP = {'gunner': 'archer', 'naval': 'sword', 'assassin': 'sword', 'monster': 'heavy'}
NAME = {'sword': '보병', 'spear': '창병', 'cavalry': '기병', 'archer': '궁수', 'mage': '마법사', 'healer': '치유사', 'flyer': '비행', 'heavy': '중보병', 'gunner': '총병', 'naval': '수병', 'assassin': '암살자', 'monster': '마물'}
for code, src in {**TROOP, **TEMP}.items():
    im = Image.open(f'public/assets/ui/icons/class_{src}.png').convert('RGBA')
    for s in (64, 32): im.resize((s, s), Image.LANCZOS).save(f'{O}/{s}/troop_{code}.png', optimize=True)
    ph = code in TEMP
    reg(f'ico.troop.{code}', f'troop_{code}', 'troop', {'unit_type': code, 'name_ko': NAME[code], 'src': f'icon.class_{src}', 'placeholder': ph,
        'note': f'임시 대체(= {src} 그림). 전용 아이콘 생성 후 같은 키·같은 경로로 교체' if ph else '기존 병종 아이콘 축소', 'qa': {'verdict': 'placeholder' if ph else ('minor' if code in ('healer', 'heavy') else 'pass'),
        'issues': (['지팡이 끝·방패 무늬가 십자형으로 읽힘(+치유사 분홍 빛) — 재생성 후보'] if code in ('healer', 'heavy') else [])}})
# 2) 슬롯 실루엣
G0, G1, G2, INK = np.array([122, 92, 40]), np.array([201, 160, 72]), np.array([246, 226, 160]), np.array([20, 24, 42])
SLOT = {'helm': '투구', 'armor': '갑옷', 'gloves': '장갑', 'boots': '신발', 'accessory': '장신구'}
for slot, ko in SLOT.items():
    im = Image.open(f'public/assets/equip/icons/128/{slot}_c.png').convert('RGBA'); im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox())
    S0 = 256; k = (S0 * 0.80) / max(im.size); im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    cv = Image.new('RGBA', (S0, S0), (0, 0, 0, 0)); cv.alpha_composite(im, ((S0 - im.width) // 2, (S0 - im.height) // 2)); a = np.asarray(cv).astype(np.float32)
    al = a[..., 3] / 255; lum = (0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]) / 255
    lo, hi = np.percentile(lum[al > 0.5], [5, 95]); t = np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1)
    t = np.where(t < 0.33, 0, np.where(t < 0.7, 0.5, 1.0))  # 3단 셀 톤
    col = np.where(t[..., None] == 0, G0, np.where(t[..., None] == 0.5, G1, G2)).astype(np.float32)
    solid = al > 0.5; ring = ndimage.binary_dilation(solid, iterations=10) & ~solid   # 바깥 남흑 외곽선(256 기준 10px → 64px 에서 약 2.5px)
    col[ring] = INK; al2 = np.where(ring, 1.0, al); out = np.dstack([col, al2 * 255]).astype(np.uint8)
    big = Image.fromarray(out, 'RGBA')
    for s in (64, 32): big.resize((s, s), Image.LANCZOS).save(f'{O}/{s}/slot_{slot}.png', optimize=True)
    reg(f'ico.slot.{slot}', f'slot_{slot}', 'equip_slot', {'slot': slot, 'name_ko': ko, 'src': f'icon.equip.{slot}_c(실루엣 재착색)', 'qa': {'verdict': 'pass'}, 'note': '빈 슬롯·슬롯 탭 표시용 단색 금빛 아이콘'})
# 3) 능력치(도트, 정수 배율)
STAT = {'hp': '병력', 'atk': '공격', 'def': '방어', 'move': '이동', 'range': '사거리', 'mp': '기력', 'cost': '코스트'}
for st, ko in STAT.items():
    shutil.copyfile(f'public/assets/card/icons/x2/ico.stat_{st}.png', f'{O}/64/stat_{st}.png'); shutil.copyfile(f'public/assets/card/icons/32/ico.stat_{st}.png', f'{O}/32/stat_{st}.png')
    reg(f'ico.stat.{st}', f'stat_{st}', 'stat', {'stat': st, 'name_ko': ko, 'src': f'ico.stat_{st}(카드 도트 아이콘 32·x2)', 'pixel': True, 'filter': 'NEAREST', 'qa': {'verdict': 'pass'}})
json.dump({'note': 'UI 아이콘 세트(안아트 2026-11-04, 호출 0). 키 ico.troop.<unit_type>.<64|32>, ico.slot.<slot>.<64|32>, ico.stat.<stat>.<64|32>. placeholder=true 는 임시 대체(같은 키로 교체 예정)', 'items': items},
          open(f'{O}/manifest_fragment_ui_icon_set.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# 미리보기
pv = Image.new('RGBA', (12 * 72, 3 * 72 + 40), (24, 28, 44, 255))
for row, pre, names in [(0, 'troop', list(TROOP) + list(TEMP)), (1, 'slot', list(SLOT)), (2, 'stat', list(STAT))]:
    for i, n in enumerate(names):
        pv.alpha_composite(Image.open(f'{O}/64/{pre}_{n}.png').convert('RGBA'), (i * 72 + 4, row * 72 + 4))
        if row == 0 or True: pv.alpha_composite(Image.open(f'{O}/32/{pre}_{n}.png').convert('RGBA'), (i * 72 + 36, 3 * 72 + 4) if False else (i * 72 + 40, row * 72 + 40))
pv.save('docker/gemini/portrait_s/preview/ui_icon_set.png'); print(len(items))
