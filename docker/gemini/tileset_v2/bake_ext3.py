# tileset_v2 5단계 확장 베이크 — 실내 키트(서고: 서가·벽면·카운터·카펫·문·책상·소품), 맵디자이너 2026-11-03 (팀장 지시: 오리지널 1막 실내 맵)
# 사용(저장소 루트): python -I docker/gemini/tileset_v2/bake_ext3.py <루트>
#   순서: bake.py -> map_names.py -> bake_ext.py -> bake_ext2.py -> bake_ext3.py. 멱등(자기가 넣은 이름·키를 지우고 다시 씀).
# 원칙: 기존 시트(tv2_static/anim/anim2/static2) 픽셀은 읽지도 쓰지도 않는다. 새 시트 tv2_static3.png 만 만든다(전역 2200~2399, 프레임 = 전역-2200).
#   칩셋 원본 칸을 x2 최근접 복사만 한다(신규 그림 없음). 하층(lower) = 불투명 지면 칸, 상층(upper) = 투명 오브젝트(마젠타 키 -> 알파 0, 칩셋 _16 이미 알파 처리).
#   칩셋에 없는 것(벽 윗면 47형, 붉은 줄 서가, 종이 번짐)은 placeholder 이름만 등록하고 임시 대체 인덱스를 가리킨다(reserved 슬롯 기록). 안아트가 그리면 이름은 그대로 두고 인덱스만 바꾼다.
# 이미지 모델 호출 0회.
import sys, os, json, hashlib
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')   # -I 는 PYTHONIOENCODING 을 무시

ROOT = sys.argv[1]
HERE = os.path.join(ROOT, 'docker/gemini/tileset_v2')
OUT = os.path.join(ROOT, 'public/assets/tiles/tileset_v2')
T, COLS, START, CAP = 16, 16, 2200, 2399
SH = {k: Image.open(f'{HERE}/chipsets/chipset_{k}_16.png').convert('RGBA') for k in 'ABCD'}
CHIP = json.load(open(os.path.join(HERE, 'tiles.json'), encoding='utf-8'))['tiles']
x2 = lambda im: im.resize((im.width * 2, im.height * 2), Image.NEAREST)
sha = lambda im: hashlib.sha1(im.tobytes()).hexdigest()[:12]


def single(key):
    s, i = key.split(':'); i = int(i); c, r = i % 30, i // 30
    return SH[s].crop((c * T, r * T, c * T + T, r * T + T))


# ---------------------------------------------------------------- 지면(하층, 불투명) — tile_layer ground 이름
GROUND = [
    # 서가 3x3(A:18~20 / 48~50 / 78~80): T=윗단(관), M=가운데, B=아랫단(받침) x L/C/R
    ('int_shelf_TL', 'A:18'), ('int_shelf_TC', 'A:19'), ('int_shelf_TR', 'A:20'),
    ('int_shelf_ML', 'A:48'), ('int_shelf_MC', 'A:49'), ('int_shelf_MR', 'A:50'),
    ('int_shelf_BL', 'A:78'), ('int_shelf_BC', 'A:79'), ('int_shelf_BR', 'A:80'),
    # 회벽 목골조 벽면 2행(A:74~77 위 / 104~107 아래). L/R = 기둥 끝, C1/C2 = 가운데 반복
    ('int_wallface_top_L', 'A:74'), ('int_wallface_top_C1', 'A:75'), ('int_wallface_top_C2', 'A:76'), ('int_wallface_top_R', 'A:77'),
    ('int_wallface_bot_L', 'A:104'), ('int_wallface_bot_C1', 'A:105'), ('int_wallface_bot_C2', 'A:106'), ('int_wallface_bot_R', 'A:107'),
    ('int_wall_sand_a', 'A:134'),                      # 사암 블록 — 벽 윗면 47형 placeholder 의 임시 그림
    ('int_counter_0', 'A:198'), ('int_counter_1', 'A:199'), ('int_counter_2', 'A:200'), ('int_counter_3', 'A:201'),
    # 붉은 카펫 3x4(A:375~467): T=위 끝, M=가운데, B=아래 끝단
    ('int_carpet_TL', 'A:375'), ('int_carpet_TC', 'A:376'), ('int_carpet_TR', 'A:377'),
    ('int_carpet_ML', 'A:405'), ('int_carpet_MC', 'A:406'), ('int_carpet_MR', 'A:407'),
    ('int_carpet_BL', 'A:465'), ('int_carpet_BC', 'A:466'), ('int_carpet_BR', 'A:467'),
    ('int_threshold', 'A:163'),                        # 조각 석판(문턱·카운터 안쪽 바닥)
]
# ---------------------------------------------------------------- 오브젝트(상층, 투명) — tile_layer.v2 building/object 의 cs:<키>
OBJ = [
    ('obj3_desk', 'A:295'), ('obj3_chair_a', 'A:267'), ('obj3_chair_b', 'A:268'), ('obj3_chair_c', 'A:297'), ('obj3_chair_d', 'A:298'),
    ('obj3_book_open', 'A:145'), ('obj3_book_red', 'A:175'), ('obj3_scroll_map', 'A:322'), ('obj3_table_items', 'A:25'),
    ('obj3_candelabra', 'A:204'), ('obj3_lamp', 'A:206'), ('obj3_map_painting_0', 'A:114'), ('obj3_map_painting_1', 'A:115'),
    ('obj3_clock_0', 'A:389'), ('obj3_clock_1', 'A:419'), ('obj3_doorway_curtain', 'A:56'),
    ('obj3_arch_0', 'A:116'), ('obj3_arch_1', 'A:146'), ('obj3_arch_2', 'A:176'),   # D:329/359 doorway_dark 는 A:116/146 과 픽셀 동일(1차 실행 QA) -> 제외
    ('obj3_bookcase_0', 'A:147'), ('obj3_bookcase_1', 'A:177'), ('obj3_shelf_0', 'A:148'), ('obj3_shelf_1', 'A:178'),
    ('obj3_wardrobe_0', 'A:149'), ('obj3_wardrobe_1', 'A:179'),
    ('obj3_table_long_h_0', 'A:325'), ('obj3_table_long_h_1', 'A:326'), ('obj3_table_long_h_2', 'A:327'), ('obj3_table_long_h_3', 'A:328'),
    ('obj3_table_long_v_0', 'A:234'), ('obj3_table_long_v_1', 'A:264'), ('obj3_table_long_v_2', 'A:294'), ('obj3_window', 'A:54'),
]
items = [(n, k, 'ground') for n, k in GROUND] + [(n, k, 'object') for n, k in OBJ]
assert START + len(items) - 1 < 2300, len(items)      # 2300~ 은 안아트 신규 그림 예약

qa = {'items': {}, 'errors': []}
S = Image.new('RGBA', (COLS * 32, (len(items) + COLS - 1) // COLS * 32), (0, 0, 0, 0))
for i, (n, key, kind) in enumerate(items):
    t = CHIP.get(key)
    if t is None or t['category'] == 'empty':
        qa['errors'].append(f'{n} {key} 칩셋 빈 칸')
    im = single(key)
    al = [p[3] for p in im.get_flattened_data()]
    opaque = sum(a == 255 for a in al) / 256
    if kind == 'ground' and opaque < 1:
        qa['errors'].append(f'{n} {key} 지면인데 불투명 {opaque:.3f}')
    if kind == 'object' and opaque == 0:
        qa['errors'].append(f'{n} {key} 오브젝트가 비어 있음')
    if any(p[:3] == (225, 0, 126) and p[3] for p in im.get_flattened_data()):
        qa['errors'].append(f'{n} {key} 마젠타 키색 잔존')
    qa['items'][n] = {'chip': key, 'kind': kind, 'rm_layer': t.get('rm_layer') if t else None, 'label': t.get('label') if t else None,
                      'opaque_ratio': round(opaque, 3), 'semi_alpha_px': sum(0 < a < 255 for a in al), 'sha1_12': sha(im)}
    S.paste(x2(im), (i % COLS * 32, i // COLS * 32))
dup = {}
for n, v in qa['items'].items():
    dup.setdefault(v['sha1_12'], []).append(n)
qa['pixel_duplicates'] = [v for v in dup.values() if len(v) > 1]
S.save(os.path.join(OUT, 'tv2_static3.png'), optimize=True)
json.dump(qa, open(os.path.join(HERE, 'bake_ext3_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- placeholder(칩셋에 없는 것: 안아트 신규 그림 대상)
BITS = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}
def red(m):
    for d, a, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not ((m & BITS[a]) and (m & BITS[b])): m &= ~BITS[d]
    return m
MASKS = sorted(set(red(m) for m in range(256)))
idx_of = {n: START + i for i, (n, _, _) in enumerate(items)}
PH = {}
for k, m in enumerate(MASKS):      # 벽 윗면(천장) 47형: 예약 2300~2346, 임시 = 사암 블록
    PH[f'int_walltop47_{m}'] = {'temp': 'int_wall_sand_a', 'reserved_index': 2300 + k, 'art': '벽 윗면(위에서 본 벽 두께·천장) 47형 오토타일, 16px 도트 x2'}
PH['int_walltop_single'] = {'temp': 'int_wall_sand_a', 'reserved_index': 2347, 'art': '벽 윗면 고립 칸'}
for k, p in enumerate(('TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR')):   # 붉은 줄 덮인 서가: 예약 2350~2358, 임시 = 일반 서가
    PH[f'int_shelfred_{p}'] = {'temp': f'int_shelf_{p}', 'reserved_index': 2350 + k, 'art': '서가 3x3 같은 조각에 이름 칸을 가로지르는 붉은 줄(책등 위 붉은 띠)'}
for k, p in enumerate(('a', 'b', 'c', 'd')):     # 종이 번짐 바닥 오버레이: 예약 2360~2363, 임시 = 없음(맵에 미배치, 효과 cue 용 예약)
    PH[f'obj3_bleed_{p}'] = {'temp': None, 'reserved_index': 2360 + k, 'art': '판자 바닥 위 반투명 먹·종이 번짐 오버레이(투명 배경, 칸 경계 넘어 이어지는 4변형)'}

# ---------------------------------------------------------------- 이름표(tv2_names.json)
NP = os.path.join(OUT, 'tv2_names.json'); doc = json.load(open(NP, encoding='utf-8')); names = doc['names']
for k in [k for k, v in names.items() if v.get('ext3')]: del names[k]          # 멱등
for i, (n, key, kind) in enumerate(items):
    names[n] = {'sheet': 'tv2_static3', 'frame': i, 'index': START + i, 'src': f'{key} {qa["items"][n]["label"]}', 'alpha': kind == 'object', 'chip': key, 'ext3': True}
for n, v in PH.items():
    if v['temp'] is None:
        continue                                                                   # 임시 그림 없는 예약(번짐)은 이름표에 넣지 않음(맵 미사용)
    names[n] = {'sheet': 'tv2_static3', 'frame': idx_of[v['temp']] - START, 'index': idx_of[v['temp']], 'src': f"placeholder -> {v['temp']} (안아트 신규: {v['art']})",
                'placeholder': True, 'reserved_index': v['reserved_index'], 'ext3': True}
doc['spec']['static3'] = {'key': 'tv2_static3', 'path': '/assets/tiles/tileset_v2/tv2_static3.png', 'cols': COLS, 'start': START, 'count': len(items),
                          'size': list(S.size), 'capacity': [START, CAP],
                          'note': f'ext3 실내 키트(bake_ext3.py, 맵디자이너 2026-11-03). {START}~{START + len(GROUND) - 1} 지면(불투명), {START + len(GROUND)}~{START + len(items) - 1} 오브젝트(투명 0/255). '
                                  '2300~2363 = 안아트 신규 그림 예약(벽 윗면 47형 2300~2347, 붉은 줄 서가 2350~2358, 종이 번짐 2360~2363). 그 전까지 placeholder 이름은 임시 인덱스를 가리킴'}
json.dump(doc, open(NP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- 표(tileset_v2_map.json) — 새 키만 추가(기존 키·값 불변)
MP = os.path.join(OUT, 'tileset_v2_map.json'); mp = json.load(open(MP, encoding='utf-8'))
mp['ranges_ext3'] = {'tv2_static3_ground': [START, START + len(GROUND) - 1], 'tv2_static3_obj3': [START + len(GROUND), START + len(items) - 1],
                     'reserved_art': {'walltop47': [2300, 2347], 'shelfred': [2350, 2358], 'bleed': [2360, 2363]}}
mp['index_map_ext3'] = {n: START + i for i, (n, _, kind) in enumerate(items) if kind == 'ground'}
mp['index_map_ext3'].update({n: idx_of[v['temp']] for n, v in PH.items() if v['temp'] and not n.startswith('obj3_')})
mp['chip_index_ext3'] = {key: START + i for i, (n, key, kind) in enumerate(items) if kind == 'object'}
mp['interior_placeholders'] = {n: {'temp': v['temp'], 'temp_index': idx_of.get(v['temp']), 'reserved_index': v['reserved_index'], 'art': v['art']} for n, v in PH.items()}
mp['ext3_note'] = ('맵디자이너 bake_ext3.py 2026-11-03: 실내 키트 tv2_static3(2200~). index_map_ext3·chip_index_ext3 는 새 구간이라 FE 가 U32_TV2.static3 시트를 등록하고 '
                   'tv2_map_to_js.mjs 구간 검사(2200~2399)를 넓힌 뒤 병합할 것. 그 전에는 이 키를 읽지 않아도 기존 동작과 같다. '
                   'tile_layer 이름은 맵 index_map 에도 들어가므로, FE 가 2200~ 을 유효 구간으로만 등록해도 맵은 그려진다')
json.dump(mp, open(MP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'count': len(items), 'ground': len(GROUND), 'objects': len(OBJ), 'range': [START, START + len(items) - 1], 'size': S.size,
                  'errors': qa['errors'], 'dup': qa['pixel_duplicates'], 'semi': {n: v['semi_alpha_px'] for n, v in qa['items'].items() if v['semi_alpha_px']},
                  'placeholders': len(PH)}, ensure_ascii=False))

# ---------------------------------------------------------------- 체인 마지막: 안아트 신규 그림 등록(art_ext3.py --apply, 2026-11-03 팀장 지시)
# bake_ext3 가 위에서 placeholder 이름(int_walltop47_* / int_shelfred_* )을 임시 인덱스로 다시 쓰므로, 그림 시트가 있으면 반드시 그 뒤에 등록한다(멱등).
ART_PY = os.path.join(HERE, 'art_ext3.py')
if os.path.exists(ART_PY) and os.path.exists(os.path.join(OUT, 'tv2_static3_art.png')) and '--no-art' not in sys.argv:
    import subprocess
    r = subprocess.run([sys.executable, '-I', ART_PY, ROOT, '--apply', ROOT], capture_output=True)   # 자식 출력 인코딩은 콘솔 기본(cp949)일 수 있어 바이트로 받음
    def dec(bts):
        for enc in ('utf-8', 'cp949'):
            try:
                return bts.decode(enc)
            except (UnicodeDecodeError, AttributeError):
                pass
        return bts.decode('utf-8', errors='replace') if bts else ''
    print('art_ext3 --apply exit', r.returncode, dec(r.stdout).strip().splitlines()[-2:], dec(r.stderr).strip()[-400:])
    if r.returncode:
        raise SystemExit('art_ext3.py --apply 실패')
