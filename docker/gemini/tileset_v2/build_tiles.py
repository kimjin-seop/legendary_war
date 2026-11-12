# tiles.json 생성 + 오토타일 구조 실측 + 팔레트(6열) 미리보기. 사용: python -I build_tiles.py <tileset_v2 폴더>
import sys, os, json, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont
from groups import AUTO, AUTO_ORIGINS, WATER_B, ANIM, STATIC

OUT = sys.argv[1]
T = 16; COLS = 30
font = ImageFont.load_default(size=10)
SRC = json.load(open(f'{OUT}/tile_hashes.json'))

def region(c, r):
    if c < 6 and r < 8: return 'water_anim'
    if c < 12: return 'autotile'
    if c < 18 or (c < 24 and r < 8): return 'lower'
    return 'upper'

# RM2003 편집기 팔레트 순서(6열): lower = 열12~17 행0~15 -> 열18~23 행0~7 / upper = 열18~23 행8~15 -> 열24~29 행0~15
def palette_pos(c, r):
    if c >= 12 and c < 18: return ('lower', c - 12, r)
    if c >= 18 and c < 24 and r < 8: return ('lower', c - 18, 16 + r)
    if c >= 18 and c < 24: return ('upper', c - 18, r - 8)
    if c >= 24: return ('upper', c - 24, 8 + r)
    return (None, None, None)

def lum(p): return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]

tiles = {}; report = {'unclassified': {}, 'empty_mismatch': {}, 'autotile_check': {}, 'counts': {}}
for k in 'ABCD':
    im = Image.open(f'{OUT}/chipsets/chipset_{k}_16.png').convert('RGBA'); px = im.load()
    lab = {}
    for ids, cat, label, *opt in STATIC[k]:
        o = opt[0] if opt else {}
        for n, i in enumerate(ids):
            if i in lab: report.setdefault('dup_label', []).append(f'{k}:{i}')
            e = {'category': cat, 'label': label}
            if o.get('obj'):
                w, h = o['obj']; e['object'] = {'name': label.split('(')[0], 'w': w, 'h': h, 'part': n, 'tiles': ids}
            if o.get('v'): e['verify'] = True
            lab[i] = e
    for r in range(16):
        for c in range(COLS):
            tid = r * COLS + c
            box = (c * T, r * T, c * T + T, r * T + T)
            a = [px[x, y][3] for x in range(box[0], box[2]) for y in range(box[1], box[3])]
            opaque = sum(1 for v in a if v > 0) / 256
            reg = region(c, r)
            e = {'id': tid, 'sheet': k, 'col': c, 'row': r, 'px16': [c * T, r * T], 'px32': [c * 32, r * 32], 'region': reg, 'opaque': round(opaque, 3), 'sha1_12': SRC['hash'][f'{k}:{tid}']}
            pl, pc, pr = palette_pos(c, r)
            if pl: e['rm_layer'] = pl; e['palette'] = [pc, pr]
            if reg == 'water_anim':
                if c < 3: e.update(category='water_auto', label='water_A(풀/흙 물가)', block='waterA', frame=c, sub_row=r) if r < 4 else e.update(category='deep_water', label='deep_water(깊은 물 조각)', block='deep', frame=c, sub_row=r - 4)
                elif r < 4: e.update(category='water_auto', label=f'water_B {WATER_B[k]}', block='waterB', frame=c - 3, sub_row=r)
                else: e.update(category='anim', label=f'anim_{ANIM[k][c - 3]}', anim_frame=r - 4, anim_tile=c - 3)
                e['rm_layer'] = 'lower'
            elif reg == 'autotile':
                for b, (bx, by) in enumerate(AUTO_ORIGINS):
                    if bx <= c < bx + 3 and by <= r < by + 4:
                        e.update(category='terrain_auto', label=AUTO[k][b], block=f'b{b}', block_xy=[c - bx, r - by],
                                 role='isolated_preview' if (c - bx, r - by) == (0, 0) else 'unused_or_base' if (c - bx, r - by) == (1, 0) else 'inner_corners' if (c - bx, r - by) == (2, 0) else 'border_3x3')
                e['rm_layer'] = 'lower'
            else:
                if tid in lab: e.update(lab[tid])
                elif opaque == 0: e.update(category='empty', label='empty')
                else:
                    e.update(category='unclassified', label='?', verify=True); report['unclassified'].setdefault(k, []).append(tid)
                if e.get('category') == 'empty' and opaque > 0: report['empty_mismatch'].setdefault(k, []).append(tid)
                if opaque == 0 and e.get('category') not in ('empty',): report['empty_mismatch'].setdefault(k, []).append(tid)
            tiles[f'{k}:{tid}'] = e
    # 오토타일 구조 실측: (2,0) 타일의 네 모서리 픽셀이 바깥 바탕색(블록 (0,0) 모서리)과 같고 중심 픽셀이 내부색(테두리 3x3 중앙)과 같은지
    chk = {}
    for b, (bx, by) in enumerate(AUTO_ORIGINS):
        x0, y0 = bx * T, by * T
        center = px[x0 + 16 + 8, y0 + 32 + 8]
        outside = px[x0 + 1, y0 + 1]
        ic = [px[x0 + 32 + dx, y0 + dy] for dx, dy in ((0, 0), (15, 0), (0, 15), (15, 15))]
        icc = px[x0 + 32 + 8, y0 + 8]
        dist = lambda p, q: abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2])
        chk[f'b{b}'] = {'label': AUTO[k][b], 'inner_corner_tile_corners_eq_outside': sum(1 for p in ic if dist(p, outside) < 60), 'inner_corner_center_vs_fill_dist': dist(icc, center),
                        'fill_lum': round(lum(center), 1), 'outside_lum': round(lum(outside), 1)}
    report['autotile_check'][k] = chk

cnt = {}
for e in tiles.values(): cnt[e['category']] = cnt.get(e['category'], 0) + 1
report['counts'] = cnt
meta = {
    'source': 'D:/다운로드/PC _ Computer - RPG Maker 2003 - Exclusive Content - Exclusive Tilesets 2.png (복사본 docker/gemini/tileset_v2/src/source.png)',
    'source_sha256': '4f98e35682df75b5e925a39c086c126cea904923e14c172187069465a6e7bf63',
    'source_size': [966, 520], 'separator': 'teal (0,128,128) 2px: 열 x=0-1,482-483,964-965 / 행 y=0-1,258-261(4px),518-519',
    'transparent_key': [225, 0, 126], 'tile_px': 16, 'sheet_px': [480, 256], 'grid': [30, 16],
    'sheets': {'A': {'origin': [2, 2], 'theme': '기본 필드·마을 실내·성 실내'}, 'B': {'origin': [484, 2], 'theme': '용암·눈/얼음·동굴·광산'},
               'C': {'origin': [2, 262], 'theme': '필드(월드맵 축척 요소 포함)·눈숲·산맥'}, 'D': {'origin': [484, 262], 'theme': '마을 건축(목조·통나무·성벽·지붕)·농지·정원'}},
    'files': {k: {'16': f'chipsets/chipset_{k}_16.png', '32': f'chipsets/chipset_{k}_32.png (x2 최근접, 960x512, 32px 격자 = id 같은 위치)'} for k in 'ABCD'},
    'id_rule': 'id = row*30 + col (16px 격자 기준, 32px 확대본에서도 같은 col,row). 전역 키 = "<sheet>:<id>"',
    'palette_rule': 'RM2003 편집기 6열 팔레트: lower = 열12~17 행0~15 -> 열18~23 행0~7, upper = 열18~23 행8~15 -> 열24~29 행0~15. 다타일 오브젝트가 블록 경계를 넘어 팔레트에서 이어질 수 있음(예 B 마법진·석판)',
    'license': '제3자 저작물 가능성(RPG Maker 2003 계열 칩셋) — 공개 전 권리 확인 필요. 개발 한정',
    'categories': sorted(cnt),
}
json.dump({'meta': meta, 'tiles': tiles}, open(f'{OUT}/tiles.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
json.dump(report, open(f'{OUT}/tiles_report.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# 팔레트 미리보기(x3, 6열): lower 24행 / upper 24행 나란히 + 번호
S = 3
for k in 'ABCD':
    im = Image.open(f'{OUT}/chipsets/chipset_{k}_16.png').convert('RGBA')
    sheet = Image.new('RGBA', ((6 * T * S) * 2 + 20, 24 * T * S), (60, 60, 60, 255))
    d = ImageDraw.Draw(sheet)
    for c in range(12, 30):
        for r in range(16):
            pl, pc, pr = palette_pos(c, r)
            if not pl: continue
            ox = 0 if pl == 'lower' else 6 * T * S + 20
            tile = im.crop((c * T, r * T, c * T + T, r * T + T)).resize((T * S, T * S), Image.NEAREST)
            sheet.alpha_composite(tile, (ox + pc * T * S, pr * T * S))
            d.rectangle((ox + pc * T * S, pr * T * S, ox + (pc + 1) * T * S - 1, (pr + 1) * T * S - 1), outline=(0, 0, 0, 120))
            d.text((ox + pc * T * S + 2, pr * T * S + 1), str(r * 30 + c), font=font, fill=(255, 255, 0, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
    sheet.save(f'{OUT}/preview/palette_{k}_x3.png', optimize=True)
print(json.dumps({'counts': cnt, 'unclassified': report['unclassified'], 'empty_mismatch': report['empty_mismatch'], 'dup': report.get('dup_label')}, ensure_ascii=False))
print(json.dumps(report['autotile_check']['A'], ensure_ascii=False))
