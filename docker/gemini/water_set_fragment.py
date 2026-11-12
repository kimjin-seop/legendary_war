"""water_set + ship_overlay manifest 조각 생성(본 manifest.json 병합 금지 — 병합은 별도 승인 후 merge_fragments.mjs).
출력: public/assets/tiles/water_set/manifest_fragment.json, public/assets/tiles/water_set/index_map_ws.json(논리명 -> 전역 인덱스 제안)
"""
import sys, json
sys.path.insert(0, '/s/deps')
W = 'public/assets/tiles/water_set'; SO = 'public/assets/sprites/ship_overlay'
ws = json.load(open(f'{W}/ws_spec.json', encoding='utf-8')); sp = json.load(open(f'{SO}/ship_spec.json', encoding='utf-8'))
qa = json.load(open(f'{W}/qa_ws.json', encoding='utf-8'))
G_STATIC, G_ANIM, G_BOV, G_OV = 200, 300, 400, 420
an = ws['sheets']['anim']
idx = {}
for t in ws['static_tiles']: idx[t['name']] = G_STATIC + t['frame']
for t in ws['anim_tiles']: idx[t['name']] = G_ANIM + t['tile']
for n, i in ws['sheets']['building_overlay']['frames'].items(): idx['ov_' + n] = G_BOV + i
idx.update({'objective': G_OV, 'ov_tower_a': G_OV + 4, 'ov_tower_b': G_OV + 5})
LIC = '절차 생성(이미지 모델 0회). 바다·모래·풀 텍스처는 원본 TileMap.png(라이선스 미확인, 개발 한정) 픽셀 파생 — 원본 권리 확인 전 외부 공개 금지'
frag = {
    'tileset.water_set_static': {'path': '/assets/tiles/water_set/ws_static.png', 'type': 'tileset', 'frame': [32, 32], 'size': ws['sheets']['static']['size'], 'count': len(ws['static_tiles']),
        'global_index_start': G_STATIC, 'variants': {'x2': '/assets/tiles/water_set/ws_static_x2.png'}, 'alpha': '전부 불투명', 'filter': 'nearest(Point), pixelArt=true, 정수 배율만',
        'spec': '/assets/tiles/water_set/ws_spec.json', 'index_map': '/assets/tiles/water_set/index_map_ws.json', 'generator': 'docker/gemini/water_set_build.py', 'license': LIC, 'verify': True,
        'qa': 'pass(팔레트 일치, 땅쪽 가장자리 픽셀 일치) / 성벽 모서리-세로벽 이음 3px 차이(알려진 한계)',
        'load_hint': "this.load.spritesheet('ws_static', path, {frameWidth:32, frameHeight:32}) — 프레임 = 전역 - 200"},
    'tileset.water_set_anim': {'path': '/assets/tiles/water_set/ws_anim.png', 'type': 'tileset_anim', 'frame': [32, 32], 'size': an['size'], 'count': an['count'], 'anim_frames': an['frames'],
        'rows_per_frame': an['rows_per_frame'], 'global_index_start': G_ANIM, 'variants': {'x2': '/assets/tiles/water_set/ws_anim_x2.png'}, 'alpha': '전부 불투명', 'filter': 'nearest(Point), 정수 배율만',
        'spec': '/assets/tiles/water_set/ws_spec.json', 'generator': 'docker/gemini/water_set_build.py', 'license': LIC, 'verify': True, 'fps_hint': 4,
        'qa': 'pass(프레임0 바다 = 원본 0번 픽셀 동일, 전이 타일 먼 쪽 = 같은 프레임 바다와 동일)',
        'load_hint': "this.load.spritesheet('ws_anim', path, {frameWidth:32, frameHeight:32}) — 시트 프레임 = (전역-300) + f*80, f=floor(time/250)%4 를 모든 애니 칸에 동시 적용"},
    'tileset.water_set_building_ov': {'path': '/assets/tiles/water_set/ws_building_ov.png', 'type': 'tile_overlay', 'frame': [32, 32], 'size': ws['sheets']['building_overlay']['size'],
        'global_index_start': G_BOV, 'alpha': '이진(0/255) + 처마 그림자 1줄 알파 90', 'generator': 'docker/gemini/water_set_build.py', 'license': '절차 생성(원본 파생 없음)', 'verify': False,
        'load_hint': "this.load.spritesheet('ws_building_ov', path, {frameWidth:32, frameHeight:32}) — 바탕 지형 위 덧그림"},
    'tileset.water_set_overlay': {'path': '/assets/tiles/water_set/ws_overlay.png', 'type': 'tile_overlay', 'frame': [32, 32], 'size': ws['sheets']['overlay']['size'], 'frames': ws['sheets']['overlay']['frames'],
        'global_index_start': G_OV, 'alpha': '이진 + 바닥 그림자 타원만 알파 90~110', 'generator': 'docker/gemini/water_set_build.py', 'license': '절차 생성(원본 파생 없음)', 'verify': False, 'fps_hint': 4,
        'load_hint': "this.load.spritesheet('ws_overlay', path, {frameWidth:32, frameHeight:32}) — 목표 O 프레임 0~3 루프, 탑 오버레이 4/5"},
}
for k, t in sp['types'].items():
    for layer in ('back', 'front'):
        frag[f'ship_overlay.{k}.{layer}'] = {'path': t[layer], 'type': 'spritesheet', 'frame': [64, 64], 'size': [256, 256], 'rows': sp['frame']['row_order'], 'anim_frames': 4, 'fps_hint': 4,
            'layer': sp['layers'][layer], 'anchor': [0.5, 0.5], 'display': '유닛 body 와 같은 표시 크기(TILE x TILE), 오프셋 0', 'alpha': '이진(0/255)', 'culture': t['culture'], 'label': t['label'],
            'generator': 'docker/gemini/ship_overlay_build.py', 'license': '절차 생성(원본 파생 없음)', 'verify': bool(t.get('verify')), 'verify_note': t.get('verify'),
            'load_hint': f"this.load.spritesheet('ship_{k}_{layer}', path, {{frameWidth:64, frameHeight:64}}) — 프레임 = 행(down0/left1/right2/up3)*4 + f"}
frag['ship_overlay.wake'] = {'path': sp['shared']['wake'], 'type': 'spritesheet', 'frame': [64, 64], 'size': [256, 256], 'rows': sp['frame']['row_order'], 'anim_frames': 4, 'layer': sp['layers']['wake'],
    'anchor': [0.5, 0.5], 'alpha': '이진', 'generator': 'docker/gemini/ship_overlay_build.py', 'license': '절차 생성', 'verify': False}
frag['ship_overlay.splash'] = {'path': sp['shared']['splash']['file'], 'type': 'spritesheet', 'frame': [32, 32], 'size': [192, 32], 'anim_frames': 6, 'fps_hint': 12, 'loop': False,
    'anchor': [0.5, 0.75], 'display': '유닛 크기의 1/2(64px 유닛 기준 32px = 텍셀 밀도 동일)', 'alpha': '이진', 'generator': 'docker/gemini/ship_overlay_build.py', 'license': '절차 생성', 'verify': False}
json.dump({'_note': '본 manifest.json 미병합 조각(안아트 water_set/ship_overlay, 2026-11-01). 병합은 승인 후 별도 작업', **frag}, open(f'{W}/manifest_fragment.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump({'_note': '논리 타일명 -> 전역 인덱스 제안(기존 0~163 과 겹치지 않음). 200~249 ws_static, 300~372 ws_anim(프레임0 기준), 400~415 건물 오버레이, 420~425 오버레이. FE 수용 시 unityTileset.js 구간 추가 필요',
           'index_map': idx}, open(f'{W}/index_map_ws.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(frag), len(idx))
