# tile_layer 이름(names-v1, database/data/tile_layer_names_used.json 170종) -> tv2 전역 인덱스 표 초안. 표에 없는 이름 = 기존 index_map 폴백.
# 사용: python -I map_names.py <저장소 루트>
# 이름 방향 규약(기존 스펙 실측: tileset_ext_spec / ws_spec / tileset_ext2_spec):
#   전이형(shore_*, grass_sea_*, sand_sea_*, grass_sand_*): 칠하는 칸 = 물(바다)/모래 칸, 방향 = 다른 지형(땅/풀)이 있는 쪽.
#       _inner = 두 직교 변이 다름, _outer = 대각 꼭짓점만 다름, NS/EW = 마주보는 두 변, U_X = X 쪽만 같음(세 변 다름)
#   숲(forest_*): 칠하는 칸 = 숲, 방향 = 트인 쪽. _inner = 대각만 트임, _outer = 두 직교 변 트임 (전이형과 inner/outer 뜻이 반대)
import sys, os, json
ROOT = sys.argv[1]
OUT = os.path.join(ROOT, 'public/assets/tiles/tileset_v2')
names = json.load(open(f'{OUT}/tv2_names.json', encoding='utf-8'))['names']
_u = json.load(open(os.path.join(ROOT, 'database/data/tile_layer_names_used.json'), encoding='utf-8'))['names']
used = sorted(_u); USED_IDX = {k: v['index'] for k, v in _u.items()}
B = {'N': 1, 'NE': 2, 'E': 4, 'SE': 8, 'S': 16, 'SW': 32, 'W': 64, 'NW': 128}
def red(m):
    for d, a, b in (('NE', 'N', 'E'), ('SE', 'S', 'E'), ('SW', 'S', 'W'), ('NW', 'N', 'W')):
        if not ((m & B[a]) and (m & B[b])): m &= ~B[d]
    return m

def mask_from_edge(edge, flip_inner_outer=False):
    """edge: 'N','NE_inner','NE_outer','NS','EW','U_N' 등 -> 같은 지형 이웃 마스크(red 적용)"""
    other = 0
    if edge.endswith('_inner') or edge.endswith('_outer'):
        d, kind = edge.split('_')
        if flip_inner_outer: kind = 'outer' if kind == 'inner' else 'inner'
        if kind == 'inner': other = B[d[0]] | B[d[1]] | B[d]   # 두 직교 변(+그 사이 대각)이 다름
        else: other = B[d]                                      # 대각만 다름
    elif edge.startswith('U_'):
        x = edge[2:]; other = 255 & ~B[x]
    elif edge in ('NS', 'EW'):
        other = B[edge[0]] | B[edge[1]]
    else:
        other = B[edge]
    return red(255 & ~other)

def idx(n):
    assert n in names, n
    return names[n]['index']

table = {}; why = {}
def put(n, target, note):
    table[n] = idx(target); why[n] = f'{target} — {note}'
for n in used:
    if n in ('grass', 'plain_a', 'plain_b'): put(n, 'grass_a', '풀')
    elif n in ('grass_flower', 'grass_dark'): put(n, 'grass_a', '풀(파일럿 확인: 꽃 덤불·짙은 풀 단일 칸은 바둑판 얼룩으로 보여 풀로 통일. 타일 grass_flower 는 시트에 남김)')
    elif n == 'forest': put(n, 'forest47_255', '숲 내부')
    elif n == 'forest_sparse_a': put(n, 'forest_single', '외딴 숲(RM 고립 미리보기)')
    elif n == 'forest_sparse_b': put(n, 'forest47_0', '외딴 숲(쿼터 합성 섬)')
    elif n.startswith('forest_'): put(n, f'forest47_{mask_from_edge(n[7:], flip_inner_outer=True)}', '숲 가장자리')
    elif n in ('sand', 'sand_plain', 'road_sand', 'desert_a'): put(n, 'sand47_255', '모래 채움')
    elif n.startswith('grass_sand_'): put(n, f'sand47_{mask_from_edge(n[11:])}', '풀->모래 전이(모래 칸)')
    elif n in ('sea', 'sea_a', 'sea_b'): put(n, 'water47_255', '물 내부(3프레임)')
    elif n.startswith('shore_'): put(n, f'water47_{mask_from_edge(n[6:])}', '물가(물 칸)')
    elif n.startswith('grass_sea_'): put(n, f'water47_{mask_from_edge(n[10:])}', '풀->물 물가(물 칸)')
    elif n.startswith('sand_sea_'): put(n, f'water47_{mask_from_edge(n[9:])}', '모래->물: 모래 물가 타일 없음, 흙·풀 물가로 근사(verify)')
    elif n in ('hill_a', 'hill_b', 'hill_c'): put(n, 'hill_single', '외딴 둔덕(RM 고립 미리보기)')
    elif n == 'castle_pave_a': put(n, 'castlefloor47_255', '성 내부 석재 단')
    elif n == 'castle_pave_b': put(n, 'flagstone47_255', '성 내부 판석')
    elif n == 'plank_h': put(n, 'plank_v', '다리 판자(기존 5번과 같은 세로 결 -> 맵 rotations 그대로 적용)')
fallback = [n for n in used if n not in table]
rg = {n[3:]: v['index'] for n, v in names.items() if n.startswith('rg_')}
# 맵별 index_map 이 이름표와 같은 인덱스를 쓰는지(재바탕 원본 일치) 검사
mism = []
for f in ('maps.json', 'maps_imjin10.json', 'maps_pack20_v2.json'):
    for m in json.load(open(os.path.join(ROOT, 'database/data', f), encoding='utf-8'))['items']:
        im = (m.get('tile_layer') or {}).get('index_map', {})
        for k, v in im.items():
            if k in rg and v != USED_IDX.get(k): mism.append(f"{m['code']}:{k}={v}")
out = {
    '_note': 'tile_layer 이름 -> tileset_v2 전역 인덱스(1000~ 정적 tv2_static, 1700~ 애니 tv2_anim). 여기에 없는 이름은 맵 index_map(기존 인덱스) 폴백. 맵 rotations/overlay 는 그대로 적용. 생성: docker/gemini/tileset_v2/map_names.py',
    'version': 1, 'source_names': 'database/data/tile_layer_names_used.json',
    'ranges': {'tv2_static': [1000, 1000 + sum(1 for v in names.values() if v['sheet'] == 'tv2_static') - 1], 'tv2_anim': [1700, 1700 + sum(1 for v in names.values() if v['sheet'] == 'tv2_anim') - 1]},
    'index_map': table, 'why': why, 'fallback_names': fallback,
    'index_map_regrounded': rg, 'regrounded_note': '선택(기본 off): 폴백 이름 중 기존 풀 바탕이 있는 타일의 풀·그림자 픽셀만 tv2 풀로 바꾼 rg_* (건물·바위 그림은 기존 그대로). 켜면 index_map 다음 순위로 적용. 맵 index_map 인덱스가 이름표와 다르면 그 맵에서는 쓰지 말 것(rg_mismatch)', 'rg_mismatch': mism,
}
json.dump(out, open(f'{OUT}/tileset_v2_map.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(used), 'mapped', len(table), 'fallback', len(fallback), 'rg', len(rg), 'rg_mismatch', mism); print('fallback:', fallback)
