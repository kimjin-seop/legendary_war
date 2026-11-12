# 세계지도 manifest 조각 생성(미병합, deferred). 출력: public/assets/map_world/world_map_manifest_fragment.json
# 사용: python -X utf8 docker/gemini/world_map_fragment.py
import os, json, datetime
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.normpath(os.path.join(ROOT, '..', '..', 'public'))
MW = os.path.join(PUB, 'assets', 'map_world')

PROV_NE = 'Natural Earth 1:10m/1:50m land·lakes·rivers·geography_regions (퍼블릭 도메인, naturalearthdata.com / github nvkelso/natural-earth-vector) — 해안·산맥·사막 형태'
PROV_GEN = '이미지 모델 gemini-nano-banana-2.1 (docker/gemini/world_map_gen.mjs, 프롬프트 world_map_style.mjs)'
ICON_DESC = {
    'port': ('해전 항구(부두·범선·등대)', '해전 거점'), 'eupseong': ('동아시아 읍성', '성/읍성'), 'mountain_fortress': ('산성(능선 성벽)', '산성'),
    'walled_capital': ('강가 이중 성벽 도성', '성곽도시(평양성·낙양 류)'), 'palace_hall': ('전각·관아', '궁궐/관아'), 'mountains': ('설산과 숲', '능선/산악'),
    'library_tower': ('책 더미 탑', '서고(비지리 허구 거점)'), 'yurt_camp': ('유르트 천막 진영', '초원/유목'), 'gorge_fortress': ('협곡 강 요새', '협곡/강 요새(적벽·장강 류)'),
    'volcano': ('화산', '화산 지대'), 'great_wall': ('장성 구간+망대', '장성/관문'), 'stone_castle': ('서양 석조 성(원뿔 탑)', '서유럽 성(오를레앙 류)'),
    'mudbrick_city': ('사막 흙벽돌 성읍', '메소포타미아·레반트'), 'harbor_city': ('지중해 항구 도시+갤리선', '카르타고·지중해 항구'),
    'beacon_tower': ('돌 봉화탑', '탑/망루/전초'), 'pin_gem': ('초록 보석 핀(금 받침)', '거점 아래 보석 점/핀'),
}

def info(rel):
    p = os.path.join(PUB, rel.replace('/', os.sep)); im = Image.open(p)
    return {'path': rel, 'size': f'{im.width}x{im.height}', 'bytes': os.path.getsize(p), 'alpha': im.mode in ('RGBA', 'LA') or 'transparency' in im.info}

def item(key, rel, typ, **kw):
    d = {'key': key, **info(rel), 'type': typ}; d.update(kw); return d

items = []
qa_base = {'verdict': 'pass', 'notes': '해안 정합: 10개 기준점(서울·낙양·우한·카르타고·오를레앙·교토·압록강 하구·로마·모술·예루살렘·사마르칸트) 십자 마커 검증 이미지에서 실제 해안/강과 일치(데이터 폴리곤 직접 래스터화라 오차는 픽셀 반올림 수준). 글자·국경·라벨·도로선 없음.'}
items.append(item('map.world.base', 'assets/map_world/world_base_4096.webp', 'map_base', variants={'mobile': info('assets/map_world/world_base_2048.webp')},
                  projection='equirectangular: x=(lon+180)/360*W, y=(90-lat)/180*H (lon -180..180, lat 90..-90)',
                  generator='docker/gemini/world_map_build.py (절차 합성) + 면 텍스처 2장(tex/land, tex/sea)', provenance=[PROV_NE, PROV_GEN],
                  qa=qa_base, verify=['압록강 선은 50m 데이터에 없어 손 입력 근사 폴리라인(YALU)', '숲 얼룩 위치는 미술적 배치(식생 데이터 아님)', '아랄해는 현대(축소) 형태']))
items.append(item('map.world.overlay.greatwall', 'assets/map_world/decor/overlay_greatwall_4096.webp', 'map_overlay', variants={'mobile': info('assets/map_world/decor/overlay_greatwall_2048.webp')},
                  generator='world_map_pp.py great_wall()', provenance=['절차 드로잉(명대 장성 대략 경로 손 입력)'], qa={'verdict': 'pass', 'notes': '베이스와 같은 크기·투영, 그대로 겹침. 시대에 따라 FE 토글.'},
                  verify=['경로는 명대 장성 근사(산해관~가욕관); 진·한대 장성과 다름 — 시나리오 시대에 맞는지 송서사 확인']))
items.append(item('map.world.decor.border', 'assets/map_world/decor/border_4096.webp', 'map_overlay', variants={'mobile': info('assets/map_world/decor/border_2048.webp')},
                  generator='world_map_pp.py border() + ui/corner_tl', provenance=['절차 드로잉', PROV_GEN], qa={'verdict': 'pass', 'notes': '테두리 2중선+그을린 가장자리+4모서리 금박 장식. 지도 크기와 동일, 맨 위 레이어.'}))
items.append(item('map.world.decor.sea', 'assets/map_world/decor/sea_ornament_4096.webp', 'map_overlay', variants={'mobile': info('assets/map_world/decor/sea_ornament_2048.webp')},
                  generator='world_map_pp.py sea_decor()', provenance=[PROV_GEN], qa={'verdict': 'pass', 'notes': '대양 8곳 물결 문양(반투명)+남동태평양 나침반. 핀 후보 지역과 겹치지 않음.'}))
for k, f, note in (('chip_frame', 'chip_frame', '영웅 칩 원형 프레임(가운데 투명 구멍, 지름 약 74%). 초상은 아래 레이어에 원형 마스크'),
                   ('compass', 'compass', '나침반(글자 없음)'), ('corner', 'corner_tl', '왼쪽 위 모서리 장식(나머지는 FE 반전)'),
                   ('wave', 'wave', '바다 물결 문양 단품(반투명)'), ('ripple', 'ripple_ring', '선택 파동 링(FE에서 scale 0.6→1.4·opacity 1→0 반복)')):
    v = {'x2': info(f'assets/map_world/ui/{f}@2x.png')} if os.path.exists(os.path.join(MW, 'ui', f + '@2x.png')) else {}
    items.append(item(f'map.world.ui.{k}', f'assets/map_world/ui/{f}.png', 'ui', variants=v, qa={'verdict': 'pass', 'notes': note},
                      generator='world_map_pp.py' + (' (절차)' if k == 'ripple' else ''), provenance=['절차 드로잉'] if k == 'ripple' else [PROV_GEN]))
for n, (desc, use) in ICON_DESC.items():
    v = {'x2': info(f'assets/map_world/icons/{n}@2x.png')}
    if n != 'pin_gem':
        for st in ('locked', 'cleared'):
            v[st] = info(f'assets/map_world/icons/{n}_{st}.png'); v[f'{st}_x2'] = info(f'assets/map_world/icons/{n}_{st}@2x.png')
    items.append(item(f'map.icon.{n}', f'assets/map_world/icons/{n}.png', 'map_icon', desc=desc, use=use, variants=v,
                      anchor='bottom-center(접지 그림자 중심 ≈ x 0.5, y 0.9)', generator='world_map_pp.py icons() ← raw/icon/landmarks_4x4.jpg',
                      provenance=[PROV_GEN], qa={'verdict': 'pass', 'notes': '마젠타 키 제거, 보라 접지 그림자→반투명 갈색 재해석, 어두운/밝은 배경 테두리 점검 통과'}))

frag = {
    'note': '세계지도(캠페인/서가 선택) manifest 조각(안아트). manifest.json 직접 수정 안 함 — 병합은 윤프론. 상태 deferred(화면 구현 시 병합).',
    'status': 'deferred',
    'generated': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
    'keyRules': {
        'map': 'map.world.base(4096x2048, variants.mobile 2048x1024) 위에 map.world.overlay.* → 핀/칩/라벨(코드) → map.world.decor.sea → map.world.decor.border 순',
        'icon': 'map.icon.<name> (96px, variants.x2 192px, variants.locked/cleared[_x2]). selected 상태는 FE 글로우/ripple 로 표현',
        'coords': '정규화 좌표 x=(lon+180)/360, y=(90-lat)/180 를 이미지 폭·높이에 곱함(베이스·오버레이 동일 투영)',
    },
    'loadHints': {'desktop': 'map.world.base(4096) — 화면 폭 ≥1280 또는 지역 줌', 'mobile': 'variants.mobile(2048)', 'preload': ['map.world.base', 'map.icon.pin_gem', 'map.world.ui.chip_frame'],
                  'lazy': 'map.world.decor.*, overlay.*'},
    'items': items,
}
frag['budget'] = {'base_webp_total_bytes': items[0]['bytes'] + items[0]['variants']['mobile']['bytes'], 'target': '≤1.5MB(모바일 ≤600KB)'}
out = os.path.join(MW, 'world_map_manifest_fragment.json')
json.dump(frag, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(out, len(items), frag['budget'])
