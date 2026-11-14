# 전투 유닛 툴팁 보조 도트 에셋(코드 작도, 생성형 모델 호출 0회).
# 기존 도트 아이콘(pix.* 12~14px 기준, 외곽선 #140C1C, 금 4단, 은 4단)과 같은 규칙:
#   - 기준 격자 12x12(아이콘), 1px 외곽선 연속, 광원 좌상단, 반투명 0
#   - 출력 x1/x2/x3 정수 배율(NEAREST). 표시 24px = x2
# 실행: python docker/gemini/tooltip_icons_build.py  -> public/assets/ui/tooltip/
import json, os, sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'ui', 'tooltip')

PAL = {
    'K': '#140C1C',  # 외곽선(기존 pix.* 동일)
    # 청록(유리·아군) - theme ally #3FA7A0 / allyText #5CC4BC 계열
    'a': '#1E6E6A', 'b': '#2FB5A6', 'c': '#5CC4BC', 'd': '#B4F2E6',
    # 적(불리·적) - theme danger #C8503C / dangerText #EE8A76 계열
    'r': '#6E1A1E', 's': '#C0504A', 't': '#EE8A76', 'u': '#FFC8B4',
    # 금(기존 pix.star 램프)
    'g': '#8A5410', 'h': '#DD8104', 'i': '#F5AB0D', 'j': '#FECA23', 'k': '#FEF251',
    # 은(기존 pix.def 램프)
    'm': '#4A5670', 'n': '#8E9AB0', 'o': '#C6CFDE', 'p': '#F0F6FF',
    # 피부
    'F': '#F0C08A', 'G': '#C88A5A',
    # 남색(칩 안쪽, theme navyDeep / panel)
    'N': '#141D33', 'P': '#232F4B',
}
RGB = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for k, v in PAL.items()}


def grid(rows):
    h = len(rows); w = len(rows[0])
    assert all(len(r) == w for r in rows), [len(r) for r in rows]
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.':
                im.putpixel((x, y), RGB[ch])
    return im


ADV_UP = [
    '.....KK.....',
    '....KdcK....',
    '...KdccbK...',
    '..KdccbbbK..',
    '.KdcccbbbaK.',
    'KdccccbbbaaK',
    'KKKKcbbaKKKK',
    '...KcbbaK...',
    '...KcbbaK...',
    '...KcbbaK...',
    '...KbaaaK...',
    '...KKKKKK...',
]
# 불리: 같은 형태를 뒤집되 광원(좌상단)을 유지하도록 다시 칠함
ADV_DOWN = [
    '...KKKKKK...',
    '...KuttsK...',
    '...KtssrK...',
    '...KtssrK...',
    '...KtssrK...',
    'KKKKtssrKKKK',
    'KuttttssssrK',
    '.KtttsssrrK.',
    '..KttssrrK..',
    '...KtssrK...',
    '....KsrK....',
    '.....KK.....',
]
WARN = [
    '.....KK.....',
    '....KkjK....',
    '....KjjK....',
    '...KjKKiK...',
    '...KjKKiK...',
    '..KkjKKiiK..',
    '..KjjKKiiK..',
    '.KkjjiiiihK.',
    '.KjjjKKiihK.',
    'KkjjiKKihhhK',
    'KhhhhhhhhhgK',
    'KKKKKKKKKKKK',
]
AURA = [  # 깃대 + 반짝임 깃발(제비꼬리)
    'KKK.........',
    'KjKKKKKKKKKK',
    'KoKkjjjjjjiK',
    'KoKjjjgjjjiK',
    'KoKjjgjgjjiK',
    'KoKjgjjjgjiK',
    'KoKiiiiiiihK',
    'KoKihhKKihhK',
    'KoKKKK..KKKK',
    'KnK.........',
    'KnK.........',
    'KKK.........',
]
TROOPS = [  # 투구 쓴 병사 흉상(은)
    '....KKKK....',
    '...KpoonK...',
    '..KpooonnK..',
    '.KKKKKKKKKK.',
    '...KFFFGK...',
    '...KFFFGK...',
    '..KKKFGKKK..',
    '.KonnKKnnmK.',
    'KonnnnnnnmmK',
    'KonnnnnnnmmK',
    'KonnnnnnnmmK',
    'KKKKKKKKKKKK',
]
# 병력 눈금(10칸 바 조각) 5x8: 아군 청록 / 적 붉은 / 빈칸
PIP_ALLY = ['KKKKK', 'KddcK', 'KdcbK', 'KcbbK', 'KcbbK', 'KbbaK', 'KbaaK', 'KKKKK']
PIP_ENEMY = ['KKKKK', 'KuutK', 'KutsK', 'KtssK', 'KtssK', 'KssrK', 'KsrrK', 'KKKKK']
PIP_EMPTY = ['KKKKK', 'KNNNK', 'KNNNK', 'KNNNK', 'KNNNK', 'KNNNK', 'KNNPK', 'KKKKK']


def divider(width=96):
    """금 구분선 7px 높이: 양끝 작은 마름모 + 1px 금선(아래 그림자) + 끝 점선 + 가운데 보석 마름모."""
    h = 7; im = Image.new('RGBA', (width, h), (0, 0, 0, 0)); px = im.putpixel
    cx = width // 2  # 보석 중심(짝수 폭이면 오른쪽 열; 보석은 홀수 폭 7)
    # 금선 + 그림자
    for x in range(5, width - 5):
        far = min(x - 5, width - 6 - x)
        if far < 6 and (x % 2):  # 끝 6px 점선
            continue
        px((x, 3), RGB['i']); px((x, 4), RGB['g'])
    # 양끝 마름모(3x3 + 외곽선)
    for ex in (2, width - 3):
        for (dx, dy, c) in [(0, -2, 'K'), (-1, -1, 'K'), (1, -1, 'K'), (-2, 0, 'K'), (2, 0, 'K'), (-1, 1, 'K'), (1, 1, 'K'), (0, 2, 'K'),
                            (0, -1, 'k'), (-1, 0, 'j'), (0, 0, 'j'), (1, 0, 'h'), (0, 1, 'h')]:
            px((ex + dx, 3 + dy), RGB[c])
    # 가운데 보석(청록 보석 + 금테)
    gem = ['...K...', '..KdK..', '.KddcK.', 'KjdcbhK', '.KcbaK.', '..KaK..', '...K...']
    gx = cx - 3
    for y, r in enumerate(gem):
        for x, ch in enumerate(r):
            if ch != '.':
                px((gx + x, y), RGB[ch])
    # 보석 양옆 선 끊김 1px(장식 여백)
    for x in (gx - 1, gx + 7):
        if 0 <= x < width:
            px((x, 3), (0, 0, 0, 0)); px((x, 4), (0, 0, 0, 0))
    return im


def chip(scheme, width=32):
    """섹션 소제목 칩(12px 높이, 모서리 2px 깎음, 가로 3-slice: 좌 4 / 가운데 반복 / 우 4)."""
    light, mid, dark = {'gold': ('k', 'j', 'h'), 'teal': ('d', 'c', 'a'), 'red': ('u', 't', 'r')}[scheme]
    h = 12; im = Image.new('RGBA', (width, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for y in range(h):
        inset = 2 if y in (0, h - 1) else (1 if y in (1, h - 2) else 0)
        for x in range(inset, width - inset):
            edge = x == inset or x == width - 1 - inset or y in (0, h - 1)
            im.putpixel((x, y), RGB['K'] if edge else RGB['N'])
    # 테두리 1px(외곽선 안쪽): 위 = 밝음, 옆 = 중간, 아래 = 어두움
    for x in range(3, width - 3):
        im.putpixel((x, 1), RGB[light]); im.putpixel((x, h - 2), RGB[dark])
    for y in range(3, h - 3):
        im.putpixel((1, y), RGB[mid]); im.putpixel((width - 2, y), RGB[dark])
    for (x, y, c) in [(2, 2, light), (width - 3, 2, mid), (2, h - 3, mid), (width - 3, h - 3, dark)]:
        im.putpixel((x, y), RGB[c])
    # 안쪽 윗줄 살짝 밝게(P)
    for x in range(3, width - 3):
        im.putpixel((x, 2), RGB['P'])
    return im


def save_scaled(im, name, sizes=(1, 2, 3)):
    out = {}
    for s in sizes:
        d = os.path.join(OUT, f'x{s}'); os.makedirs(d, exist_ok=True)
        p = os.path.join(d, f'{name}.png')
        im.resize((im.width * s, im.height * s), Image.NEAREST).save(p, optimize=True)
        out[f'{s}x'] = {'path': os.path.relpath(p, os.path.join(ROOT, 'public')).replace('\\', '/'), 'size': [im.width * s, im.height * s], 'bytes': os.path.getsize(p)}
    return out


def main():
    items = []
    spec = [
        ('tip.adv_up', 'adv_up', grid(ADV_UP), 'icon', '유리 상성(청록 위 화살표)'),
        ('tip.adv_down', 'adv_down', grid(ADV_DOWN), 'icon', '불리 상성(붉은 아래 화살표)'),
        ('tip.warn', 'warn', grid(WARN), 'icon', '주의(삼각 경고)'),
        ('tip.aura', 'aura', grid(AURA), 'icon', '받는 효과·오라(깃발)'),
        ('tip.troops', 'troops', grid(TROOPS), 'icon', '병력(병사 흉상)'),
        ('tip.pip.ally', 'pip_ally', grid(PIP_ALLY), 'bar-piece', '병력 눈금 1칸(아군)'),
        ('tip.pip.enemy', 'pip_enemy', grid(PIP_ENEMY), 'bar-piece', '병력 눈금 1칸(적)'),
        ('tip.pip.empty', 'pip_empty', grid(PIP_EMPTY), 'bar-piece', '병력 눈금 1칸(손실)'),
        ('tip.divider', 'divider', divider(96), 'deco', '금 구분선(가운데 보석, 고정 폭)'),
        ('tip.chip.gold', 'chip_gold', chip('gold'), 'nineslice', '섹션 소제목 칩(금, 기본)'),
        ('tip.chip.teal', 'chip_teal', chip('teal'), 'nineslice', '섹션 소제목 칩(청록, 유리)'),
        ('tip.chip.red', 'chip_red', chip('red'), 'nineslice', '섹션 소제목 칩(붉은, 불리·주의)'),
    ]
    # 구분선 가변 폭용 조각(좌 끝 6 / 선 1 반복 / 보석 9 / 우 끝 6, 높이 7)
    full = divider(96)
    parts = {
        'divider_cap_l': full.crop((0, 0, 6, 7)),
        'divider_line': full.crop((20, 0, 21, 7)),
        'divider_gem': full.crop((48 - 4, 0, 48 + 5, 7)),
        'divider_cap_r': full.crop((90, 0, 96, 7)),
    }
    for (key, name, im, typ, label) in spec:
        v = save_scaled(im, name)
        ent = {'key': key, 'path': v['2x']['path'], 'type': typ, 'label': label, 'baseSize': [im.width, im.height], 'variants': v,
               'alpha': True, 'filter': 'NEAREST', 'pixel': True}
        if typ == 'nineslice':
            ent['slice'] = {'left': 4, 'right': 4, 'top': 0, 'bottom': 0, 'unit': 'x1 px(표시 배율만큼 곱함)', 'mode': '가로 3-slice(높이 고정 12*배율)'}
        items.append(ent)
    for name, im in parts.items():
        v = save_scaled(im, name)
        items.append({'key': 'tip.' + name.replace('_', '.', 1), 'path': v['2x']['path'], 'type': 'deco-part', 'baseSize': [im.width, im.height], 'variants': v,
                      'alpha': True, 'filter': 'NEAREST', 'pixel': True,
                      'label': {'divider_cap_l': '구분선 왼끝', 'divider_line': '구분선 1px 반복', 'divider_gem': '구분선 가운데 보석', 'divider_cap_r': '구분선 오른끝'}[name]})
    json.dump(items, open(os.path.join(OUT, '_items.tmp.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(len(items), 'items')


if __name__ == '__main__':
    main()
