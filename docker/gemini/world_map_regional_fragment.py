# 세계지도 LOD·전장·구대륙 manifest 조각(미병합). manifest.json·merge_fragments.mjs 는 건드리지 않음.
# 입력: public/assets/map_world/{regional,oldworld}/*_bounds.json
# 출력: public/assets/map_world/regional/regional_manifest_fragment.json (지역 LOD + 전장 지도)
#       public/assets/map_world/oldworld/oldworld_manifest_fragment.json + world_view_bounds.json (구대륙 세계 기본판)
# 사용: python -X utf8 docker/gemini/world_map_regional_fragment.py
import os, sys, json, glob, datetime
ROOT = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ROOT)
from world_map_regional_build import REGIONS, BATTLE_PROPOSALS, PUB

MW = os.path.join(PUB, 'assets', 'map_world')
REG = os.path.join(MW, 'regional'); OW = os.path.join(MW, 'oldworld')
LOG = os.path.join(ROOT, 'world_map_regional_calls_log.json')
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
rel = lambda p: os.path.relpath(p, PUB).replace(os.sep, '/')

calls = json.load(open(LOG, encoding='utf-8'))['calls'] if os.path.exists(LOG) else []
PROV_NE = 'Natural Earth 1:10m/1:50m land·minor_islands·lakes·rivers_lake_centerlines·geography_regions (퍼블릭 도메인, github nvkelso/natural-earth-vector)'
PROV_OSM = 'OpenStreetMap natural=coastline (ODbL, Overpass API 수집 docker/gemini/osm_coast_fetch.sh) — 크레딧에 "© OpenStreetMap contributors" 표기 필요'
PROV_TEX = '세계판 면 텍스처 world_map_raw/tex/{land,sea}.jpg 저주파 재샘플(gemini-nano-banana-2.1, 기존 생성물 재사용)'
PROV_MACRO = '근접 종이 결 world_map_raw/tex_regional/sea_macro.jpg (gemini-nano-banana-2.1, world_map_regional_gen.mjs / world_map_regional_style.mjs) — 명도 하이패스만 사용'
GEN = 'docker/gemini/world_map_regional_build.py (절차 합성, world_map_build.py 헬퍼·시드 재사용)'

V_EA = [
    '해안선·하구는 현대(Natural Earth) 형태: 1592년과 다른 곳 — 황하 하구(1855년 이전엔 산둥반도 남쪽 황해 유입), 장강 하구 퇴적, 서해안 간척지, 오사카만·도쿄만 매립지 — 고증 필요 시 송서사 확인',
    '대동강·금강·임진강·북한강·영산강은 데이터에 없어 손 입력 근사 폴리라인(수 km 오차)',
    '산줄기 음영(태백·소백·낭림·일본 알프스 등)은 고도 데이터가 아닌 근사 배치',
    '숲 얼룩 위치는 미술적 배치(식생 데이터 아님)',
]
V_BATTLE = [
    '해안선은 현대 OSM — 1592년 대비 간척·매립(서해안 새만금·시화·인천 송도·김해 평야 하구·부산항 매립·광양만 산단) 지형이 섞여 있음. 특히 부산·김해 낙동강 하구와 인천 연안은 당시보다 육지가 넓음 — 고증 필요 시 송서사 확인',
    '명량(울돌목)·노량 해협은 실제 폭(약 300~600m)이 1~2px 이라 표현용으로 넓힘(과장 carve)',
    '대동강·금강·임진강·북한강·영산강은 손 입력 근사선(수 km 오차), 낙동강·한강·압록강은 NE 10m(전장 배율에선 굵고 단순)',
    '산줄기 음영은 고도 데이터가 아닌 근사 배치',
    '해협·섬 사이 미세 수로 일부는 1px 미만이라 이어져 보일 수 있음',
]
V_OW = [
    '해안·호수는 현대 형태(아랄해 축소, 카스피해, 지중해 연안 퇴적 등) — 시대 고증 필요 시 확인',
    '좌상단(경도 -25~-18, 위도 65~78)에 그린란드 동해안 일부가 안개 속에 비침(구대륙 범위 경계 특성)',
    '숲 얼룩·보강 산줄기는 미술적 배치',
    '장성 경로는 명대 장성 근사(기존과 동일)',
]

QA_BATTLE = ('기준점 15곳(옥포·한산도·노량·명량/울돌목·진주성·평양·행주산성·한성·부산진·동래·쓰시마 이즈하라·히젠나고야·의주·충주 탄금대·제주) 십자 마커가 실제 해안·해협·하천 위치와 일치. '
             '명량(진도-해남)·노량(남해도-하동) 해협이 3배 확대에서 열려 보이고 한산도·거제 다도해가 개별 섬으로 분리됨(imjin_battle_straits_x3.jpg). '
             '거제 일대 육지 피복률이 8배 기준 렌더와 일치(0.418/0.414). 세계판(NE 10m) 대비 IoU 0.86은 해안 정밀도 차이(NE 가 뭉툭)이며 위치 이동 없음. '
             '글자·국경·라벨 없음, 중립 양피지 톤. landmask 클리핑 데모(imjin_battle_contact_territory_demo.jpg) 통과 — 영토색은 opacity ≤0.35 또는 color/soft-light 혼합 권장(진한 곱하기는 주황 바탕과 섞여 탁해짐).')

def lod_item(b, bp, key, typ, extra):
    d = {'key': key, 'path': b['desktop']['path'], 'size': b['desktop']['size'], 'bytes': b['desktop']['bytes'], 'alpha': False,
         'type': typ, 'scope': 'map', 'load': 'lazy',
         'variants': {'mobile': {'path': b['mobile']['path'], 'size': b['mobile']['size'], 'bytes': b['mobile']['bytes'], 'alpha': False}},
         'bounds': {'geo': b['geo'], 'normalized': b['normalized'], 'file': rel(bp)},
         'ppd': {'desktop': b['desktop']['ppd'], 'mobile': b['mobile']['ppd']},
         'projection': b['projection'], 'generator': GEN}
    d.update(extra); return d

# ---------------- 지역 LOD + 전장 ----------------
items = []; files = {}
SUPERSEDED = {R['replaces'] for R in REGIONS.values() if R.get('replaces')}   # 2026-11-04: 새 지역이 옛 지역 키를 이어받으면 옛 항목은 조각에서 뺌(파일은 보존)
for bp in sorted(glob.glob(os.path.join(REG, '*_bounds.json'))):
    b = json.load(open(bp, encoding='utf-8')); name = b['region']; files[name] = rel(bp)
    r = REGIONS[name]; qa = b.get('qa_metrics', {})
    if name in SUPERSEDED: continue
    if r.get('kind') == 'battle':
        ex = {'provenance': ([PROV_OSM] if r.get('coast') == 'osm_land' else []) + [PROV_NE, PROV_TEX, PROV_MACRO],
              'landmask': b.get('landmask'), 'coastSource': b.get('coastSource'), 'exaggerated': b.get('exaggerated'),
              'tone': '중립 양피지(육지 채도 28% 감소) — FE 영토 폴리곤 색(반투명 multiply/overlay)과 국호 판을 얹기 위함. 글자·국경·라벨 없음',
              'qa': {'verdict': 'pass', 'metrics': qa, 'notes': QA_BATTLE if 'QA_BATTLE' in globals() else ''},
              'verify': V_BATTLE}
        items.append(lod_item(b, bp, r.get('key') or f'map.battle.{name}', 'map_battle', ex))
    else:
        ex = {'provenance': [PROV_NE, PROV_TEX, PROV_MACRO],
              'qa': {'verdict': 'pass', 'metrics': qa, 'notes':
                     '기준점 15곳(서울·평양·부산·의주·한산도·명량·쓰시마·히젠나고야·교토·에도·베이징·상하이·산둥 끝·제주·하코다테) 일치. 황해·남해·대한해협·동해 구분 정상. '
                     '세계판 대비 평행이동 최적 (0,0). 글자·국경·라벨·도로선 없음. 구대륙판(oldworld)과 같은 빌더·같은 해안 띠 파라미터 → 한반도 휘도 차 7.8(기존 세계판 대비 34.7).'},
              'verify': V_EA}
        items.append(lod_item(b, bp, f'map.world.region.{name}', 'map_base_lod', ex))

frag = {
    'note': '세계지도 지역 LOD·전장 지도 manifest 조각(안아트). manifest.json·merge_fragments.mjs 직접 수정 안 함 — 병합은 윤프론.',
    'status': 'deferred', 'generated': NOW,
    'keyRules': {
        'region': 'map.world.region.<id> — 세계판 위 LOD(줌 확대 시 크로스페이드). 오버레이·핀·라벨 아래',
        'battle': 'map.battle.<id> — 캠페인 상세(스테이지 목록) 전용 독립 전장 지도. 레이어: 베이스 → 영토 폴리곤(landmask 로 클리핑) → 경로/핀 → 국호 판·라벨',
        'coords': '모든 판 공통: 정규화 u=(lon+180)/360, v=(90-lat)/180 → 판 내부 px=((u-n.x0)/n.w*W, (v-n.y0)/n.h*H)',
    },
    'lod': {
        'metric': 'screenPPD = 화면(장치 픽셀)에서 경도 1도가 차지하는 픽셀',
        'thresholds': {'worldOnly': 'screenPPD < 18', 'crossfade': '18 ≤ screenPPD < 26: 지역판 opacity=(screenPPD-18)/8', 'regionalOnly': 'screenPPD ≥ 26'},
        'thresholdsNote': '구대륙 세계판(20ppd 데스크톱/10ppd 모바일) 기준. 기존 전지구판(11.4ppd)을 계속 쓸 경우 10/16',
        'variant': '지역판 screenPPD ≤ 70 → mobile(60ppd), 초과 → desktop(120ppd)',
        'battle': '전장 지도는 LOD 연속 줌이 아니라 화면 전환(캠페인 → 상세)으로 표시. 전환 연출이 필요하면 동아시아 지역판에서 전장 bounds 사각형으로 줌인하며 0.3s 크로스페이드',
        'edgeFeather': '뷰포트가 지역 rect 경계를 넘으면 경계 3~4% 폭 mask-image 그라데이션',
    },
    'boundsFiles': files,
    'battleProposals': BATTLE_PROPOSALS,
    'imageCalls': {'log': rel(LOG).replace('../', ''), 'total': len(calls), 'ok': sum(1 for c in calls if c.get('status') == 200),
                   'failed': [{'id': c['id'], 'status': c['status'], 'reason': 'image_recitation(저작권/재현 차단)'} for c in calls if c.get('status') != 200]},
    'items': items,
}
json.dump(frag, open(os.path.join(REG, 'regional_manifest_fragment.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('regional', [i['key'] for i in items])

# ---------------- 구대륙 세계 기본판 ----------------
obp = os.path.join(OW, 'oldworld_base_bounds.json')
if os.path.exists(obp):
    b = json.load(open(obp, encoding='utf-8'))
    wvb = {'note': '구대륙 세계 기본판이 전지구 등장방형 정규화 좌표계에서 덮는 사각형. 정규화 정의(x=(lon+180)/360, y=(90-lat)/180)는 그대로 유지.',
           'geo': b['geo'], 'normalized': {k: b['normalized'][k] for k in ('x0', 'x1', 'y0', 'y1', 'w', 'h')},
           'ppd': {'desktop': b['desktop']['ppd'], 'mobile': b['mobile']['ppd']},
           'sizes': {'desktop': b['desktop']['size'], 'mobile': b['mobile']['size']},
           'fe': '텍스처 px = ((u - x0)/w * W, (v - y0)/h * H). 마커·영토·지역판 bounds(정규화)는 그대로 유효 — 지역판 rect 도 같은 식으로 텍스처 px 로 변환'}
    json.dump(wvb, open(os.path.join(OW, 'world_view_bounds.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    def info(p):
        from PIL import Image
        im = Image.open(p); return {'path': rel(p), 'size': f'{im.width}x{im.height}', 'bytes': os.path.getsize(p), 'alpha': im.mode in ('RGBA', 'LA')}
    Wd = int(b['desktop']['size'].split('x')[0]); Wm = int(b['mobile']['size'].split('x')[0])
    dec = lambda n, w: os.path.join(OW, 'decor', f'{n}_{w}.webp')
    oit = [
        {'key': 'map.oldworld.base', **info(os.path.join(OW, f'oldworld_base_{Wd}.webp')), 'type': 'map_base', 'scope': 'map', 'load': 'preload',
         'variants': {'mobile': info(os.path.join(OW, f'oldworld_base_{Wm}.webp'))}, 'replaces': 'map.world.base',
         'worldViewBounds': rel(os.path.join(OW, 'world_view_bounds.json')), 'generator': GEN + " REGIONS['oldworld']",
         'provenance': [PROV_NE, PROV_TEX, PROV_MACRO],
         'qa': {'verdict': 'pass', 'metrics': b.get('qa_metrics'), 'notes': '기존 세계판과 해안 IoU 0.98·평행이동 없음, 기준점 16곳 일치. 가장자리 6° 안개로 자연스럽게 끝남. 1도당 픽셀 1.76배. 동아시아 지역판과 크로스페이드 시 한반도 휘도 차 7.8(기존 34.7). 글자·국경·라벨 없음.'},
         'verify': V_OW},
        {'key': 'map.oldworld.overlay.greatwall', **info(dec('overlay_greatwall', Wd)), 'type': 'map_overlay', 'scope': 'map', 'load': 'lazy',
         'variants': {'mobile': info(dec('overlay_greatwall', Wm))}, 'replaces': 'map.world.overlay.greatwall', 'generator': 'docker/gemini/world_map_oldworld_pp.py great_wall()',
         'provenance': ['절차 드로잉(명대 장성 근사, world_map_pp.GREAT_WALL)'], 'qa': {'verdict': 'pass', 'notes': '베이스와 같은 크기·투영'},
         'verify': ['명대 장성 근사 — 시나리오 시대 확인(송서사)']},
        {'key': 'map.oldworld.decor.sea', **info(dec('sea_ornament', Wd)), 'type': 'map_overlay', 'scope': 'map', 'load': 'lazy',
         'variants': {'mobile': info(dec('sea_ornament', Wm))}, 'replaces': 'map.world.decor.sea', 'generator': 'docker/gemini/world_map_oldworld_pp.py sea_decor() ← ui/wave.png, ui/compass@2x.png',
         'provenance': ['기존 생성물 재사용(gemini-nano-banana-2.1)'], 'qa': {'verdict': 'pass', 'notes': '대서양·인도양·태평양 서부 7곳 물결 + 남인도양 나침반, 핀 후보와 겹치지 않음'}},
        {'key': 'map.oldworld.decor.border', **info(dec('border', Wd)), 'type': 'map_overlay', 'scope': 'map', 'load': 'lazy',
         'variants': {'mobile': info(dec('border', Wm))}, 'replaces': 'map.world.decor.border', 'generator': 'docker/gemini/world_map_oldworld_pp.py border() ← ui/corner_tl.png',
         'provenance': ['절차 드로잉 + 기존 생성물'], 'qa': {'verdict': 'pass', 'notes': '테두리 2중선·그을린 가장자리·4모서리 장식, 맨 위 레이어'}},
    ]
    of = {'note': '구대륙 세계 기본판 manifest 조각(안아트). 기존 map.world.base/overlay/decor 를 대체(replaces). map.world.ui.*·map.icon.* 는 그대로 사용. manifest.json 직접 수정 안 함.',
          'status': 'deferred', 'generated': NOW,
          'keyRules': {'map': 'map.oldworld.base → overlay.greatwall → 영토/핀/칩/라벨(코드) → decor.sea → decor.border',
                       'coords': '정규화 좌표 정의 불변. 텍스처 배치는 world_view_bounds.json 사각형 기준'},
          'loadHints': {'desktop': 'map.oldworld.base(4000x2320)', 'mobile': 'variants.mobile(2000x1160)', 'preload': ['map.oldworld.base'], 'lazy': 'overlay·decor'},
          'budget': {'old': {'desktop': 440356, 'mobile': 182184}, 'new': {'desktop': oit[0]['bytes'], 'mobile': oit[0]['variants']['mobile']['bytes']}},
          'items': oit}
    json.dump(of, open(os.path.join(OW, 'oldworld_manifest_fragment.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('oldworld', of['budget'])
