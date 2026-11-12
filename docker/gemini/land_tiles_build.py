"""육상 타일 퀄리티 개선 빌드(안아트, 2026-11-01). 이미지 생성 모델 호출 0회(전부 절차 생성).
실행: sh docker/gemini/land_py.sh "python docker/gemini/land_tiles_build.py"
입력(항상 백업본에서 읽음 -> 멱등): TileMap.png.bak-tile-20261101, tileset_ext(.png|2.png).bak-tile-20261101
출력:
 1) 교체(drop-in, 키·인덱스·파일명 유지):
    public/assets/third_party/unity_tilemap/TileMap.png  — 육상 인덱스만 교체(0·1·5·6 물/판자/해안은 원본 유지)
    public/assets/tiles/legend_tileset/tileset_ext.png(+_x2) — 49, 50~102 육상 교체(30~48 해안, 103 깃발 유지)
    public/assets/tiles/legend_tileset/tileset_ext2.png(+_x2) — 134~145 풀↔모래 교체(여울·다리 끝 유지)
 2) 신규 시트: public/assets/tiles/land_set/ls_static.png(+_x2) 16열, ls_spec.json(이름·제안 전역 인덱스 200~·blob47/road16 규칙)
"""
import json, os
import numpy as np
from PIL import Image
from land_tiles_lib import (T, GR, FO, ST, SD, DT, grass_tile, sand_tile, dirt_tex, forest_world, draw_crown, DIRS8, shade_map)
from land_tiles_lib2 import (blend_tile, sand_rule, road_rule, mountain_tile, rock_ground, cliff_tile, MT, scree_tex, peaks_on)
from land_tiles_lib3 import (wall_face, wall_top_v, tower, gate, door_house, stairs, paving, roof_piece, roof_tex, hanok_wall,
                             house_small, fence, lowwall, snow_tile, desert_tile, swamp_tile, RF, WD, PL, fill)

A = 'public/assets'
TMP = f'{A}/third_party/unity_tilemap/TileMap.png'
E1P = f'{A}/tiles/legend_tileset/tileset_ext.png'
E2P = f'{A}/tiles/legend_tileset/tileset_ext2.png'
BAK = '.bak-tile-20261101'
OUT = f'{A}/tiles/land_set'
os.makedirs(OUT, exist_ok=True)

tm = np.array(Image.open(TMP + BAK).convert('RGBA'))
e1 = np.array(Image.open(E1P + BAK).convert('RGBA'))
e2 = np.array(Image.open(E2P + BAK).convert('RGBA'))


def cut(sheet, f, cols=10):
    r, c = divmod(f, cols); return sheet[r * T:(r + 1) * T, c * T:(c + 1) * T, :3].copy()


def paste(sheet, f, tile, cols=10):
    r, c = divmod(f, cols); sheet[r * T:(r + 1) * T, c * T:(c + 1) * T, :3] = tile; sheet[r * T:(r + 1) * T, c * T:(c + 1) * T, 3] = 255


G3, S2 = cut(tm, 3), cut(tm, 2)
# ---------------- 바닥 ----------------
grass = {'a': grass_tile(G3, 11, tufts=3, soft=True), 'b': grass_tile(G3, 22, tufts=3, lush=True, soft=True),
         'c': grass_tile(G3, 33, tufts=3, flowers=4), 'd': grass_tile(G3, 44, tufts=3, pebbles=2)}
sand = {'a': sand_tile(S2, 5), 'b': sand_tile(S2, 6, shells=3), 'c': sand_tile(S2, 7, stones=1)}
dirt = dirt_tex(9)
GA = grass['a']

# ---------------- blob47(8방향 이웃 마스크) ----------------
BITS = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}


def reduce_mask(m):
    for d, a, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not (m & BITS[a] and m & BITS[b]): m &= ~BITS[d]
    return m


BLOB47 = sorted({reduce_mask(m) for m in range(256)})
assert len(BLOB47) == 47


def occ_of(mask):
    o = [[False] * 3 for _ in range(3)]; o[1][1] = True
    for d, b in BITS.items():
        if mask & b: dx, dy = DIRS8[d]; o[1 + dy][1 + dx] = True
    return o


def mask_of_open(open_dirs):
    m = 255
    for d in open_dirs: m &= ~BITS[d]
    return reduce_mask(m)


# ---------------- 숲 ----------------
def _inner_disc(cx, cy, r):
    yy, xx = np.mgrid[0:T, 0:T]
    return ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 < r * r) & (xx >= 2) & (xx <= 29) & (yy >= 2) & (yy <= 29)


def remap(img, mask, pal, step):
    out = img.copy()
    for y, x in zip(*np.nonzero(mask)):
        for k, c in enumerate(pal):
            if (img[y, x] == c).all(): out[y, x] = pal[int(np.clip(k + step, 0, len(pal) - 1))]; break
    return out


FA = forest_world(occ_of(255), GA)
# 변형은 테두리 2px 안쪽만 픽셀 편집 -> 숲 내부 a/b/c 끼리 경계 픽셀 동일 보장
FB = remap(FA, _inner_disc(19, 16, 6.5), FO[:7], +1)  # 안쪽 수관 한 무더기 연둣빛(최고광 제외)
FC = FA.copy(); m = _inner_disc(12, 14, 5.5); FC[m] = grass['b'][m]  # 숲 속 빈터(풀) + 둘레 수관 그늘
yy_, xx_ = np.mgrid[0:T, 0:T]
rim = m & ~_inner_disc(14, 16, 5.5)  # 왼위 초승달 그늘(광원 좌상단 -> 수관이 빈터 왼위에 그림자)
FC = shade_map(FC, rim, GR, -3)
forest_full = {'a': FA, 'b': FB, 'c': FC}
for k in 'bc': assert (forest_full[k][~_inner_disc(16, 16, 99)] == FA[~_inner_disc(16, 16, 99)]).all()
forest47 = [forest_world(occ_of(m), GA) for m in BLOB47]


def sparse_b(crowns):
    return [[32 + 21, 32 + 10, 6, 1003, FO], [32 + 10, 32 + 17, 7, 1004, FO]]


forest_sparse = {'a': forest_world(occ_of(0), GA), 'b': forest_world(occ_of(0), GA, interior_mod=sparse_b)}

# ---------------- 길(16) · 모래(47) ----------------
RBITS = {'N': 1, 'E': 2, 'S': 4, 'W': 8}


def road_occ(m):
    o = [[False] * 3 for _ in range(3)]; o[1][1] = True
    if m & 1: o[0][1] = True
    if m & 2: o[1][2] = True
    if m & 4: o[2][1] = True
    if m & 8: o[1][0] = True
    return o


road16 = [blend_tile(road_occ(m), road_rule(), GA, dirt, GR[3], DT[2], rimB=DT[3]) for m in range(16)]
sand47 = [blend_tile(occ_of(m), sand_rule(), GA, sand['a'], GR[4], SD[2], tufts=True) for m in BLOB47]

# ---------------- 산·험지·절벽 ----------------
mount = {'a': mountain_tile(GA, 1, [(16, 2, 15.5, 29)]), 'b': mountain_tile(GA, 2, [(20, 2, 11, 26), (11, 7, 11, 29)]),
         'c': mountain_tile(GA, 3, [(13, 3, 13, 29), (24, 13, 7.5, 29)]), 'snow': mountain_tile(GA, 4, [(16, 2, 15.5, 29)], snow=True),
         'd': mountain_tile(GA, 5, [(10, 8, 9, 28), (22, 4, 10, 29)])}
rock = {'a': rock_ground(1), 'b': rock_ground(2)}
scree = scree_tex(21)
PEAKSETS = [[(16, 2, 15.5, 29)], [(20, 2, 11, 26), (11, 7, 11, 29)], [(13, 3, 13, 29), (24, 13, 7.5, 29)], [(10, 8, 9, 28), (22, 4, 10, 29)]]
# 산맥 오토타일: 산지 바닥(blob47, 풀 쪽 가장자리 5px 풀) + 봉우리. 축약 마스크 255(사방 산) 는 봉우리 4종 변형 별도
mount47 = [peaks_on(blend_tile(occ_of(m), sand_rule(depth=5), GA, scree, GR[3], MT[2], tufts=False), 40 + i, PEAKSETS[i % 4]) for i, m in enumerate(BLOB47)]
mount_full = [peaks_on(scree, 60 + k, PEAKSETS[k]) for k in range(4)]
rock47 = [blend_tile(occ_of(m), sand_rule(depth=3), GA, rock['a'], GR[2], MT[1], tufts=False) for m in BLOB47]
dirt47 = [blend_tile(occ_of(m), sand_rule(depth=4), GA, dirt, GR[3], DT[2]) for m in BLOB47]
CLIFF_NAMES = ['cliff_S', 'cliff_N', 'cliff_E', 'cliff_W', 'cliff_NW_outer', 'cliff_NE_outer', 'cliff_SE_outer', 'cliff_SW_outer',
               'cliff_NW_inner', 'cliff_NE_inner', 'cliff_SE_inner', 'cliff_SW_inner']
CLIFF_OPEN = [{'S'}, {'N'}, {'E'}, {'W'}, {'N', 'W'}, {'N', 'E'}, {'S', 'E'}, {'S', 'W'}, {'NW'}, {'NE'}, {'SE'}, {'SW'}]
cliffs = [cliff_tile(GA, o, seed=3 + i) for i, o in enumerate(CLIFF_OPEN)]

# ---------------- 성·건물 ----------------
walls = {'face_a': wall_face(1), 'face_b': wall_face(2, moss=3), 'top_v': wall_top_v(3)}
walls['top_h'] = np.rot90(walls['top_v'], -1).copy()
towers = {'a': tower(4), 'b': tower(5)[:, ::-1].copy()}
gate_t = gate(6); door_t = door_house(7); stairs_t = stairs(8)
pave = {'slab': paving(9), 'brick': paving(10, 'brick'), 'square': paving(11, 'square'), 'slab_b': paving(12)}
roofs = {f'{r}_{c}': roof_piece(r, c, 1) for r in ('top', 'mid', 'bot') for c in ('L', 'C', 'R')}


def roof_full(col):  # 2줄 건물용: 용마루 + 처마를 한 칸에
    t = roof_piece('mid', col, 1)
    top = roof_piece('top', col, 1); bot = roof_piece('bot', col, 1)
    t[:7] = top[:7]; t[22:] = bot[22:]; return t


for c in ('L', 'C', 'R'): roofs[f'full_{c}'] = roof_full(c)
chim = roofs['mid_C'].copy()  # 굴뚝(돌 굴뚝 + 연가)
fill(chim, 20, 6, 26, 18, ST[4]); chim[6:18, 20] = ST[6]; chim[6:18, 25] = ST[2]; fill(chim, 19, 4, 27, 7, RF[1]); chim[4, 19:27] = RF[5]
chim[18, 20:26] = RF[0]
hatch = roofs['mid_C'].copy()
fill(hatch, 11, 10, 21, 16, RF[0]); hatch[10, 11:21] = RF[5]; hatch[15, 11:21] = RF[1]
hw = {'L': hanok_wall('L', 1), 'C': hanok_wall('C', 1), 'R': hanok_wall('R', 1), 'window': hanok_wall('C', 2, window=True)}
house = {'giwa': house_small(GA, 1), 'thatch': house_small(GA, 2, thatch=True)}
misc = {'fence_h': fence(GA), 'fence_v': fence(GA, False), 'lowwall_h': lowwall(GA, 1), 'lowwall_v': lowwall(GA, 2, False)}
G4 = grass['b']
biome = {'snow_a': snow_tile(1), 'snow_b': snow_tile(2, grasses=3), 'desert_a': desert_tile(1), 'desert_b': desert_tile(2, rocks=1),
         'swamp_a': swamp_tile(G4, 1), 'swamp_b': swamp_tile(G4, 2)}

# ================= 1) TileMap.png 교체 =================
TM_REPLACE = {2: sand['a'], 3: grass['a'], 4: grass['b'], 7: forest_full['a'], 8: mount['b'], 9: gate_t, 10: walls['face_a'], 11: rock['a'],
              12: walls['face_b'], 13: hw['window'], 14: rock['b'], 15: pave['slab'], 16: pave['square'], 17: mount['c'], 18: mount['a'],
              19: mount['d'], 20: stairs_t, 21: towers['a'], 22: towers['b'], 23: towers['a'], 24: towers['b'], 25: roofs['mid_C'],
              26: pave['brick'], 27: mount['snow'], 28: mount['b'], 29: mount['c']}
tm_new = tm.copy()
for i, t in TM_REPLACE.items(): paste(tm_new, i, t)
# 링 보호 검사: 2·3 테두리 1px 가 원본과 같은가
ring = np.zeros((T, T), bool); ring[0, :] = ring[-1, :] = ring[:, 0] = ring[:, -1] = True
for i in (2, 3):
    assert (cut(tm_new, i)[ring] == cut(tm, i)[ring]).all(), f'ring changed {i}'
for i in (0, 1, 5, 6): assert (cut(tm_new, i) == cut(tm, i)).all()
Image.fromarray(tm_new).save(TMP)

# ================= 2) tileset_ext.png 교체(전역 인덱스 - 30) =================
E1_REPLACE = {49: grass['c']}
for k, n in enumerate(CLIFF_NAMES): E1_REPLACE[50 + k] = cliffs[k]
FOREST_EDGE = [('forest_N', {'N', 'NE', 'NW'}), ('forest_E', {'E', 'NE', 'SE'}), ('forest_S', {'S', 'SE', 'SW'}), ('forest_W', {'W', 'NW', 'SW'}),
               ('forest_NW_outer', {'N', 'W', 'NW', 'NE', 'SW'}), ('forest_NE_outer', {'N', 'E', 'NE', 'NW', 'SE'}),
               ('forest_SE_outer', {'S', 'E', 'SE', 'NE', 'SW'}), ('forest_SW_outer', {'S', 'W', 'SW', 'NW', 'SE'}),
               ('forest_NW_inner', {'NW'}), ('forest_NE_inner', {'NE'}), ('forest_SE_inner', {'SE'}), ('forest_SW_inner', {'SW'})]
for k, (n, op) in enumerate(FOREST_EDGE): E1_REPLACE[62 + k] = forest47[BLOB47.index(mask_of_open(op))]
E1_REPLACE[74] = forest_sparse['a']; E1_REPLACE[75] = forest_sparse['b']
for k, key in enumerate(['top_L', 'top_C', 'top_R', 'mid_L', 'mid_C', 'mid_R', 'bot_L', 'bot_C', 'bot_R']): E1_REPLACE[76 + k] = roofs[key]
E1_REPLACE[85] = chim; E1_REPLACE[86] = hatch
E1_REPLACE.update({87: hw['L'], 88: hw['C'], 89: hw['R'], 90: hw['window'], 91: door_t, 92: house['giwa'],
                   93: biome['snow_a'], 94: biome['snow_b'], 95: biome['desert_a'], 96: biome['desert_b'], 97: biome['swamp_a'], 98: biome['swamp_b'],
                   99: misc['fence_h'], 100: misc['fence_v'], 101: misc['lowwall_h'], 102: misc['lowwall_v']})
e1_new = e1.copy()
for g, t in E1_REPLACE.items(): paste(e1_new, g - 30, t)
for g in list(range(30, 49)) + [103]: assert (e1_new[((g - 30) // 10) * T:((g - 30) // 10 + 1) * T, ((g - 30) % 10) * T:((g - 30) % 10 + 1) * T] == e1[((g - 30) // 10) * T:((g - 30) // 10 + 1) * T, ((g - 30) % 10) * T:((g - 30) % 10 + 1) * T]).all()
Image.fromarray(e1_new).save(E1P)
Image.fromarray(e1_new).resize((e1_new.shape[1] * 2, e1_new.shape[0] * 2), Image.NEAREST).save(E1P.replace('.png', '_x2.png'))

# ================= 3) tileset_ext2.png 풀↔모래(134~145, 모래 칸에 칠함, 이름 방향 = 풀 쪽) =================
GS = [('N', {'N', 'NE', 'NW'}), ('E', {'E', 'NE', 'SE'}), ('S', {'S', 'SE', 'SW'}), ('W', {'W', 'NW', 'SW'}),
      ('NW_inner', {'N', 'W', 'NW', 'NE', 'SW'}), ('NE_inner', {'N', 'E', 'NE', 'NW', 'SE'}), ('SE_inner', {'S', 'E', 'SE', 'NE', 'SW'}), ('SW_inner', {'S', 'W', 'SW', 'NW', 'SE'}),
      ('NW_outer', {'NW'}), ('NE_outer', {'NE'}), ('SE_outer', {'SE'}), ('SW_outer', {'SW'})]
e2_new = e2.copy()
for k, (n, op) in enumerate(GS): paste(e2_new, 134 - 110 + k, sand47[BLOB47.index(mask_of_open(op))])
Image.fromarray(e2_new).save(E2P)
Image.fromarray(e2_new).resize((e2_new.shape[1] * 2, e2_new.shape[0] * 2), Image.NEAREST).save(E2P.replace('.png', '_x2.png'))

# ================= 4) 신규 land_set 시트(16열, 제안 전역 인덱스 200 + 프레임) =================
LS = []  # (name, tile, use)
def add(name, tile, use): LS.append((name, tile, use))
for k in 'abcd': add(f'grass_{k}', grass[k], '평지 풀 변형(a=기본, b=무성, c=들꽃, d=자갈). 좌표 해시 가중 a55 b25 c10 d10 권장. 테두리 1px = 원본 3번과 동일')
for k in 'abc': add(f'sand_{k}', sand[k], '모래 변형. 테두리 1px = 원본 2번과 동일')
add('dirt', dirt, '흙 바탕(길 내부와 동일 텍스처, 넓은 흙마당용)')
for k in 'abc': add(f'forest_{k}', forest_full[k], '숲 내부(8방 모두 숲) 변형 — 서로 이음새 없음')
for k in 'ab': add(f'forest_sparse_{k}', forest_sparse[k], '고립 숲(이웃 숲 없음)')
for k in ('a', 'b', 'c', 'd', 'snow'): add(f'mountain_{k}', mount[k], '산(풀 바탕 위 봉우리, 테두리 1px 풀 유지 -> 어떤 풀 칸과도 이음새 없음)')
for k in 'ab': add(f'rock_{k}', rock[k], '험지(절벽 k 단일 타일용 바위 지면, 주기 32)')
add('wall_face_a', walls['face_a'], '성벽 정면(가로 구간): 여장 윗면 + 성벽 면'); add('wall_face_b', walls['face_b'], '성벽 정면 변형(이끼)')
add('wall_top_v', walls['top_v'], '성벽 세로 구간(위에서 본 성곽길 + 양쪽 여장)'); add('wall_top_h', walls['top_h'], '성벽 가로 윗면(top_v 90도 회전 — 내부 칸이 성벽 뒤일 때)')
add('tower_a', towers['a'], '모서리 망루(치)'); add('tower_b', towers['b'], '망루 좌우 반전')
add('gate', gate_t, '성문(홍예 석문 + 판문)'); add('door_house', door_t, '민가 출입문(한옥 판문 + 댓돌)'); add('stairs', stairs_t, '돌계단')
for k in ('slab', 'slab_b', 'brick', 'square'): add(f'pave_{k}', pave[k], '성 안 바닥(박석/전돌/정방형 판석)')
for k in ('top_L', 'top_C', 'top_R', 'mid_L', 'mid_C', 'mid_R', 'bot_L', 'bot_C', 'bot_R', 'full_L', 'full_C', 'full_R'):
    add(f'roof_{k}', roofs[k], '기와지붕 조각(top=용마루, mid=기와, bot=처마, full=2줄 건물용 용마루+처마). L/R=박공 끝')
add('roof_chimney', chim, '기와지붕 + 굴뚝'); add('roof_vent', hatch, '기와지붕 + 환기창')
for k in ('L', 'C', 'R', 'window'): add(f'hanok_wall_{k}', hw[k], '한옥 벽체(기둥·회벽·창방·기단). 건물 맨 아래 줄')
add('house_giwa', house['giwa'], '한 칸 기와집(마을 v 단독 칸)'); add('house_thatch', house['thatch'], '한 칸 초가(마을 v 단독 칸 변형)')
for k, t in misc.items(): add(k, t, '울타리/돌담(풀 바탕, v=세로는 h 의 90도 회전)')
for k, t in biome.items(): add(k, t, '설원/사막/늪 변형')
for k, n in enumerate(CLIFF_NAMES): add(n, cliffs[k], '절벽 가장자리(높은 땅 칸에 칠함, 이름 방향 = 낮은 쪽)')
n_fixed = len(LS)
for i, m in enumerate(BLOB47): add(f'forest47_{m}', forest47[i], f'숲 오토타일 blob47: 축약 마스크 {m}')
for m in range(16): add(f'road16_{m}', road16[m], f'흙길 오토타일: N1 E2 S4 W8 연결 마스크 {m}')
for i, m in enumerate(BLOB47): add(f'sand47_{m}', sand47[i], f'풀↔모래 오토타일 blob47(모래 칸): 축약 마스크 {m}')
for k in range(4): add(f'mount_full_{"abcd"[k]}', mount_full[k], '산맥 내부(8방 모두 산): 산지 바닥 + 봉우리 변형')
for i, m in enumerate(BLOB47): add(f'mount47_{m}', mount47[i], f'산맥 오토타일 blob47(산 칸): 축약 마스크 {m}. 255 는 mount_full_a~d 해시 권장')
for i, m in enumerate(BLOB47): add(f'rock47_{m}', rock47[i], f'험지(절벽 k) 오토타일 blob47: 축약 마스크 {m}. 255 는 rock_a/b')
for i, m in enumerate(BLOB47): add(f'dirt47_{m}', dirt47[i], f'넓은 흙길/흙마당 blob47(2칸 이상 폭 길): 축약 마스크 {m}')

COLS = 16
rows = (len(LS) + COLS - 1) // COLS
sheet = np.zeros((rows * T, COLS * T, 4), np.uint8)
for f, (n, t, u) in enumerate(LS): paste(sheet, f, t, COLS)
Image.fromarray(sheet).save(f'{OUT}/ls_static.png')
Image.fromarray(sheet).resize((sheet.shape[1] * 2, sheet.shape[0] * 2), Image.NEAREST).save(f'{OUT}/ls_static_x2.png')
START = 200
spec = {
    'version': 1, 'date': '2026-11-01', 'key': 'tileset.land_set',
    'principle': '32x32·여백 0·Point 필터·정수 배율. 광원 좌상단. 바닥 텍스처 테두리 1px 링 = 원본 TileMap 2(모래)/3(풀) 픽셀 동일 -> 기존 해안·여울·언덕 전이 타일과 이음새 없음. 전이 타일은 월드 필드 방식(3x3 이웃 점유의 전역 함수)이라 인접 칸 경계 픽셀이 자동 일치.',
    'source': 'generated(procedural) — 이미지 생성 모델 호출 0회. docker/gemini/land_tiles_build.py + land_tiles_lib*.py. 팔레트는 원본 TileMap 색(풀 a5bd00/86a500, 모래 ffcead, 수관 115100/397b00/5cb625, 석재 959aa8/d0d0ce)을 축으로 명암 단계만 확장',
    'sheet': {'file': '/assets/tiles/land_set/ls_static.png', 'x2': '/assets/tiles/land_set/ls_static_x2.png', 'size': [COLS * T, rows * T], 'cols': COLS, 'count': len(LS), 'proposed_global_index_start': START,
              'note': 'FE 미연결(앱 코드 변경 필요). 전역 인덱스 = 200 + 프레임 제안(110~163 ext2 다음, water_set 과 겹치지 않게 여유)'},
    'autotile': {
        'blob47': {'bits': BITS, 'reduce': '대각 비트는 인접한 두 직교 비트가 모두 같은 지형일 때만 유지', 'order': BLOB47,
                   'lookup': 'frame = first_frame(forest47_0 또는 sand47_0) + order.indexOf(reduce(mask))'},
        'road16': {'bits': RBITS, 'lookup': 'frame = first_frame(road16_0) + mask', 'connect_to': '길 r, 다리 b, (선택) 마을 v·성 c 입구'},
    },
    'tiles': [{'frame': f, 'index': START + f, 'name': n, 'use': u} for f, (n, t, u) in enumerate(LS)],
    'replaced_in_place': {
        'TileMap.png': {str(k): v for k, v in {2: 'sand_a', 3: 'grass_a', 4: 'grass_b', 7: 'forest_a', 8: 'mountain_b', 9: 'gate', 10: 'wall_face_a', 11: 'rock_a', 12: 'wall_face_b', 13: 'hanok_wall_window', 14: 'rock_b', 15: 'pave_slab', 16: 'pave_square', 17: 'mountain_c', 18: 'mountain_a', 19: 'mountain_d', 20: 'stairs', 21: 'tower_a', 22: 'tower_b', 23: 'tower_a', 24: 'tower_b', 25: 'roof_mid_C', 26: 'pave_brick', 27: 'mountain_snow', 28: 'mountain_b', 29: 'mountain_c'}.items()},
        'TileMap.png_untouched': [0, 1, 5, 6],
        'tileset_ext.png': 'global 49~102 육상 교체(이름·의미 유지, 76~86 지붕은 붉은 기와 -> 회청 기와로 재질 변경), 30~48 해안·103 깃발 원본 유지',
        'tileset_ext2.png': 'global 134~145 grass_sand_* 교체(의미 유지), 나머지 원본 유지',
        'backup_suffix': BAK,
    },
}
json.dump(spec, open(f'{OUT}/ls_spec.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
NAMEIDX = {n: START + f for f, (n, t, u) in enumerate(LS)}
json.dump(NAMEIDX, open(f'{OUT}/ls_names.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('TileMap 교체', len(TM_REPLACE), '/ ext 교체', len(E1_REPLACE), '/ ext2 교체', len(GS), '/ land_set', len(LS), 'tiles', sheet.shape)
