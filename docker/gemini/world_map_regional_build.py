# 세계지도 지역 LOD(확대 구간용 고해상도 지역판) 절차 생성기.
# 원칙
#  - 투영은 세계판과 같은 등장방형. 지역판 픽셀 = (lon-lon0)*ppd, (lat1-lat)*ppd (가로·세로 같은 ppd → 세계판 직사각형 크롭과 1:1 대응)
#  - 해안/호수/강/산맥은 Natural Earth(퍼블릭 도메인) 10m 데이터를 지역 해상도로 직접 래스터화(이미지 모델이 해안을 그리지 않음)
#  - 저주파 색(텍스처 tex/land·sea, fbm 노이즈 n1·n2, 숲 얼룩, 사막/고원)은 세계판과 같은 시드·같은 원본을 경위도 기준으로 재샘플
#    → 세계판에서 지역판으로 크로스페이드할 때 큰 색 얼룩 위치가 일치
#  - 고주파 디테일(양피지 결, 산악 능선 음영, 얇은 해안선, 10m 강)은 지역 해상도에서 새로 생성
#  - 글자·국경·라벨·도로선 없음(라벨/도로/핀은 FE 코드)
# 사용: python -X utf8 docker/gemini/world_map_regional_build.py <region|all> [--q 80] [--mq 78] [--no-verify]
# 새 지역 추가: REGIONS 에 경계·ppd·보강 산맥/강(선택)만 넣으면 됨.
import json, sys, os, math, time
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import world_map_build as wb   # 팔레트·헬퍼·숲 얼룩·강 목록 재사용(파일 수정 없음)

PUB = os.path.normpath(os.path.join(ROOT, '..', '..', 'public'))
OUTDIR = os.path.join(PUB, 'assets', 'map_world', 'regional')
PREV = os.path.join(ROOT, 'world_map_preview', 'regional')
DATA = wb.DATA
PAL = wb.PAL
WORLD_PPD = 4096 / 360.0      # 세계판 데스크톱 ppd(11.378)
WORLD_SC = 2.0                # 세계판 4096 의 sc

# ---------------- 지역 정의 ----------------
# ranges: 데이터(geography_regions)에 없는 산줄기 근사 폴리라인 (lon,lat)... , 폭(도) — 미술적 배치, verify
# rivers_extra: 10m 데이터에 없는 강 근사 폴리라인 — verify
REGIONS = {
    'east_asia': {
        'lon0': 115.0, 'lon1': 150.0, 'lat0': 25.0, 'lat1': 45.0, 'ppd': 120, 'mobile_div': 2,
        'desc': '동아시아(한반도·일본 열도·중국 동해안·황해·남해·동해)',
        'ranges': [
            ('taebaek', 0.32, [(128.35, 38.75), (128.6, 38.2), (128.95, 37.6), (129.15, 37.0), (129.15, 36.4), (129.05, 35.8), (128.95, 35.4)]),
            ('sobaek', 0.30, [(128.4, 37.05), (128.0, 36.75), (127.75, 36.2), (127.6, 35.7), (127.6, 35.3)]),
            ('nangnim', 0.32, [(126.9, 41.2), (126.95, 40.6), (126.9, 40.0), (126.75, 39.6)]),
            ('masik', 0.22, [(127.3, 39.1), (127.6, 38.75), (127.9, 38.5)]),
            ('kyushu', 0.28, [(130.6, 33.3), (130.95, 32.8), (131.1, 32.2), (130.95, 31.6)]),
            ('shikoku', 0.22, [(132.7, 33.4), (133.3, 33.75), (134.0, 33.85), (134.4, 33.95)]),
            ('chugoku', 0.26, [(131.7, 34.45), (132.4, 34.85), (133.2, 35.1), (134.2, 35.2), (135.0, 35.3)]),
            ('kii', 0.24, [(135.6, 34.3), (135.9, 34.0), (136.0, 33.75)]),
            ('japan_alps', 0.38, [(136.85, 35.4), (137.4, 35.9), (137.65, 36.35), (137.75, 36.8), (138.6, 36.4), (138.3, 35.6), (138.2, 35.3)]),
            ('ou', 0.30, [(140.0, 37.2), (140.3, 37.9), (140.75, 38.8), (140.95, 39.6), (140.95, 40.4), (140.85, 41.0)]),
            ('hokkaido', 0.32, [(142.0, 42.4), (142.6, 43.0), (142.9, 43.6), (142.5, 44.2), (142.3, 44.8)]),
            ('wuyi_coast', 0.30, [(117.4, 25.4), (118.3, 26.5), (119.2, 27.6), (120.0, 28.6)]),
            ('shandong', 0.22, [(117.0, 36.25), (117.6, 36.2), (118.3, 36.3)]),
            ('changbai', 0.32, [(127.4, 41.6), (128.1, 42.0), (128.6, 42.4)]),
        ],
        'rivers_extra': [
            ('taedong', [(126.95, 40.05), (126.55, 39.6), (126.1, 39.25), (125.75, 39.02), (125.45, 38.85), (125.2, 38.72)]),
            ('geum', [(127.55, 35.8), (127.55, 36.2), (127.45, 36.45), (127.12, 36.47), (126.91, 36.28), (126.85, 36.1), (126.6, 36.0)]),
            ('imjin', [(127.35, 38.9), (127.15, 38.35), (126.95, 38.0), (126.7, 37.75)]),
            ('bukhan', [(127.75, 38.2), (127.55, 37.85), (127.32, 37.53)]),
            ('yeongsan', [(126.95, 35.25), (126.75, 35.0), (126.45, 34.8)]),
        ],
        'river_rank_max': 8,
        'verify_pts': [  # QA 십자 마커(lat, lon)
            ('Seoul', 37.57, 126.98), ('Pyongyang', 39.02, 125.75), ('Busan', 35.10, 129.04), ('Uiju/Yalu mouth', 40.0, 124.4),
            ('Hansan-do', 34.77, 128.47), ('Myeongnyang(Uldolmok)', 34.57, 126.31), ('Tsushima', 34.40, 129.30),
            ('Hizen-Nagoya', 33.53, 129.87), ('Kyoto', 35.01, 135.77), ('Edo/Tokyo', 35.68, 139.77), ('Beijing', 39.90, 116.40),
            ('Shanghai', 31.23, 121.47), ('Shandong tip', 37.40, 122.70), ('Jeju', 33.38, 126.55), ('Hokkaido Hakodate', 41.77, 140.73),
        ],
    },
    # 1장 임진왜란 전장 지도(캠페인 상세 스테이지 목록용). 해안은 OSM 고해상도(ODbL), 영토 폴리곤을 칠하기 좋게 중립 톤.
    'imjin_battle': {
        'lon0': 123.5, 'lon1': 131.5, 'lat0': 32.5, 'lat1': 40.5, 'ppd': 300, 'mobile_div': 2, 'kind': 'battle',
        'desc': '임진왜란 전장(평양~남해안·다도해, 쓰시마·규슈 북부, 요동 남부 일부)',
        'coast': 'osm_land', 'osm_land': 'imjin_battle',   # world_map_osm_land_extract.py <zip> imjin_battle 122.5 132.5 31.5 41.5
        # 실제 폭이 1px 안팎인 해협을 지도 표현용으로 넓힘(과장, verify): (이름, 폭(도), 폴리라인)
        'carve': [
            ('uldolmok_myeongnyang', 0.010, [(126.290, 34.585), (126.306, 34.572), (126.322, 34.561)]),
            ('noryang', 0.008, [(127.862, 34.962), (127.875, 34.948), (127.886, 34.936)]),
        ],
        'neutral': 0.28,                 # 육지 채도 감소(영토 색을 얹기 좋게)
        'edge': {'mid': 0.20, 'thin': 0.02, 'near': 0.012, 'glow': 0.4},
        'shade_mult': 0.45, 'ridge_cpd': (1.0, 3.5), 'meander': 0.018, 'river_px': (7, 5, 4),
        'landmask': True,
        'rivers_extra': None,            # None → east_asia 와 공유(아래에서 채움)
        'ranges_from': ['taebaek', 'sobaek', 'nangnim', 'masik', 'kyushu', 'changbai'],
        'river_rank_max': 9,
        'verify_pts': [
            ('Okpo', 34.89, 128.69), ('Hansan-do', 34.775, 128.48), ('Noryang', 34.95, 127.88), ('Myeongnyang(Uldolmok)', 34.572, 126.306),
            ('Jinju castle', 35.19, 128.08), ('Pyongyang', 39.02, 125.75), ('Haengju sanseong', 37.60, 126.82), ('Seoul(Hanseong)', 37.57, 126.98),
            ('Busanjin', 35.13, 129.05), ('Dongnae', 35.20, 129.08), ('Tsushima Izuhara', 34.20, 129.29), ('Hizen-Nagoya', 33.53, 129.87),
            ('Uiju', 40.20, 124.53), ('Chungju(Tangeumdae)', 36.99, 127.91), ('Jeju', 33.50, 126.53),
        ],
        'crops': [('hansan_okpo_noryang', 127.7, 128.95, 35.2, 34.6), ('myeongnyang', 126.05, 126.6, 34.75, 34.4),
                  ('han_river_haengju', 126.5, 127.25, 37.8, 37.35), ('pyongyang', 125.35, 126.1, 39.3, 38.85)],
    },
}
_EA = REGIONS['east_asia']
REGIONS['imjin_battle']['rivers_extra'] = _EA['rivers_extra']
REGIONS['imjin_battle']['ranges'] = [x for x in _EA['ranges'] if x[0] in REGIONS['imjin_battle']['ranges_from']]

# 시즌 전쟁 프랑스·로마 전장 지도(2026-11-04 안아트, 팀장 큐). 경계 = database/data/war/{france,rome}.json map_view + 여백 1도. 해안 = Natural Earth 10m(퍼블릭 도메인)
#   산줄기 폴리라인은 미술적 근사(verify). 키 규칙 임진과 동일: map.battle.<region>
_EU_RANGES = [
    ('alps', 0.55, [(5.6, 44.0), (6.6, 44.9), (7.0, 45.8), (7.9, 46.2), (9.0, 46.4), (10.5, 46.5), (12.0, 46.7), (13.5, 46.6)]),
    ('pyrenees', 0.40, [(-1.8, 43.1), (-0.8, 42.85), (0.5, 42.7), (1.6, 42.6), (2.8, 42.5)]),
    ('massif_central', 0.55, [(2.4, 44.6), (2.8, 45.3), (3.0, 45.8)]),
    ('jura_vosges', 0.30, [(5.6, 46.3), (6.3, 47.0), (7.0, 47.9), (7.2, 48.4)]),
    ('apennines', 0.38, [(8.6, 44.4), (10.0, 44.2), (11.6, 43.6), (12.8, 42.8), (13.6, 42.0), (14.6, 41.2), (15.6, 40.4), (16.2, 39.4), (16.1, 38.4)]),
    ('atlas', 0.50, [(-8.0, 31.3), (-5.5, 32.6), (-3.0, 33.8), (0.5, 35.0), (3.5, 36.2), (6.5, 36.4), (9.0, 36.6)]),
    ('sierra_nevada_es', 0.30, [(-4.5, 37.0), (-3.2, 37.1), (-2.2, 37.3)]),
    ('dinaric', 0.40, [(14.6, 45.6), (16.0, 44.4), (17.5, 43.3), (19.0, 42.5)]),
]
REGIONS['france_battle'] = {
    'lon0': -3.5, 'lon1': 8.0, 'lat0': 42.5, 'lat1': 52.5, 'ppd': 220, 'mobile_div': 2, 'kind': 'battle',
    'desc': '프랑스 시즌 전장(브르타뉴~라인 서안, 플랑드르~피레네 북쪽)',
    'neutral': 0.28, 'edge': {'mid': 0.20, 'thin': 0.02, 'near': 0.012, 'glow': 0.4},
    'shade_mult': 0.45, 'ridge_cpd': (1.0, 3.5), 'meander': 0.018, 'river_px': (6, 4, 3), 'landmask': True,
    'rivers_extra': [], 'ranges': [r for r in _EU_RANGES if r[0] in ('alps', 'pyrenees', 'massif_central', 'jura_vosges')], 'river_rank_max': 9,
    'verify_pts': [('Paris', 48.86, 2.35), ('Orleans', 47.90, 1.91), ('Reims', 49.26, 4.03), ('Calais', 50.95, 1.86), ('Bordeaux', 44.84, -0.58),
                   ('Lyon', 45.76, 4.84), ('Tours', 47.39, 0.69), ('Rouen', 49.44, 1.10), ('Brest', 48.39, -4.49), ('Marseille', 43.30, 5.37)],
    'crops': [('loire', 0.0, 3.0, 48.5, 47.0), ('channel', 0.5, 3.5, 51.3, 49.5), ('paris_reims', 1.5, 4.5, 49.8, 48.3), ('gironde', -1.8, 0.8, 45.8, 44.2)],
}
REGIONS['rome_battle'] = {
    'lon0': -9.0, 'lon1': 20.0, 'lat0': 33.0, 'lat1': 46.0, 'ppd': 90, 'mobile_div': 2, 'kind': 'battle',
    'desc': '로마 시즌 전장(이베리아 동부~이탈리아·시칠리아·북아프리카 카르타고)',
    'neutral': 0.28, 'edge': {'mid': 0.20, 'thin': 0.02, 'near': 0.012, 'glow': 0.4},
    'shade_mult': 0.55, 'ridge_cpd': (0.8, 2.8), 'meander': 0.018, 'river_px': (5, 4, 3), 'landmask': True,
    'rivers_extra': [], 'ranges': _EU_RANGES, 'river_rank_max': 8,
    'verify_pts': [('Rome', 41.90, 12.50), ('Carthage', 36.86, 10.32), ('Syracuse', 37.07, 15.29), ('Cannae', 41.30, 16.13), ('Zama(approx)', 36.30, 9.45),
                   ('New Carthage(Cartagena)', 37.60, -0.98), ('Saguntum', 39.68, -0.27), ('Massalia', 43.30, 5.37), ('Lake Trasimene', 43.13, 12.10), ('Gibraltar', 36.14, -5.35)],
    'crops': [('italy_south', 12.0, 18.5, 42.5, 37.0), ('tunisia_sicily', 8.5, 16.0, 38.8, 35.5), ('spain_east', -2.5, 2.5, 41.5, 37.0), ('rhone_alps', 4.0, 9.5, 46.0, 43.0)],
}

REGIONS['legnica_battle'] = {   # 2026-11-04 팀장 요청: 시즌 전쟁 레그니차(1241). 키예프 동쪽~프라하·부다 서쪽, 크라쿠프·브로츠와프·레그니차·올로모우츠 포함
    'lon0': 12.0, 'lon1': 33.0, 'lat0': 45.5, 'lat1': 53.5, 'ppd': 120, 'mobile_div': 2, 'kind': 'battle',
    'desc': '레그니차 시즌 전장(보헤미아·실레지아·소폴스카·헝가리 평원·루스 서부)',
    'neutral': 0.28, 'edge': {'mid': 0.20, 'thin': 0.02, 'near': 0.012, 'glow': 0.4},
    'shade_mult': 1.1, 'ridge_cpd': (0.8, 3.0), 'range_width_mult': 1.5, 'ne_ranges': False, 'meander': 0.018, 'river_px': (5, 4, 3), 'landmask': True,
    'rivers_extra': [], 'river_rank_max': 8,
    'ranges': [  # 미술적 근사(verify)
        ('carpathians', 0.55, [(17.2, 48.3), (18.6, 49.0), (20.0, 49.3), (21.8, 49.3), (23.2, 48.9), (24.6, 48.2), (25.4, 47.4), (25.8, 46.4), (25.2, 45.7), (23.4, 45.6), (22.2, 45.5)]),
        ('sudetes', 0.40, [(15.0, 50.9), (15.8, 50.75), (16.6, 50.5), (17.2, 50.25)]),
        ('ore_mountains', 0.35, [(12.2, 50.3), (13.0, 50.5), (13.8, 50.7)]),
        ('bohemian_forest', 0.35, [(12.6, 49.8), (13.3, 49.1), (14.0, 48.7)]),
        ('alps_east', 0.50, [(12.0, 47.2), (13.2, 47.2), (14.5, 47.4), (15.6, 47.6), (16.0, 47.7)]),
        ('apuseni', 0.35, [(22.4, 46.8), (22.9, 46.4), (23.2, 46.0)]),
        ('dinaric_n', 0.40, [(14.6, 45.6), (15.6, 45.5)]),
    ],
    'verify_pts': [('Legnica', 51.21, 16.16), ('Wroclaw', 51.11, 17.03), ('Krakow', 50.06, 19.94), ('Olomouc', 49.59, 17.25), ('Prague', 50.08, 14.43),
                   ('Buda', 47.50, 19.04), ('Kyiv', 50.45, 30.52), ('Sandomierz', 50.68, 21.75), ('Mohi(Sajo)', 47.98, 20.95), ('Vienna', 48.21, 16.37)],
    'crops': [('silesia', 15.0, 18.5, 52.0, 50.3), ('lesser_poland', 19.0, 22.5, 51.2, 49.5), ('hungary_mohi', 18.5, 22.0, 48.6, 47.0), ('kyiv', 29.0, 32.5, 51.5, 49.5)],
}

# 2026-11-04 사용자 지시: 1592년 조선 시즌 전쟁 지도 재제작(한반도 전체 + 제주 + 쓰시마). 기존 imjin_battle 파일은 보존, 새 파일 imjin_battle_v2_*.
#   manifest 키는 그대로 map.battle.imjin_battle(key 지정, replaces 로 옛 지역 항목 대체). 해안 = Natural Earth 10m(OSM 추출 범위가 lat 41.5 까지라 사용 불가)
REGIONS['imjin_battle_v2'] = {
    'lon0': 124.0, 'lon1': 131.2, 'lat0': 32.8, 'lat1': 43.0, 'ppd': 240, 'mobile_div': 2, 'kind': 'battle',
    'key': 'map.battle.imjin_battle', 'replaces': 'imjin_battle',
    'desc': '1592년 조선 전장(한반도 전체·제주·쓰시마, 큐슈 북서 일부)',
    'neutral': 0.28, 'edge': {'mid': 0.20, 'thin': 0.02, 'near': 0.012, 'glow': 0.4},
    'shade_mult': 0.8, 'ridge_cpd': (1.0, 3.5), 'meander': 0.018, 'river_px': (6, 5, 4), 'landmask': True,
    'rivers_extra': _EA['rivers_extra'], 'river_rank_max': 9,
    'ranges': [x for x in _EA['ranges'] if x[0] in ('taebaek', 'sobaek', 'nangnim', 'masik', 'changbai', 'kyushu')],   # 미술 근사(verify)
    'verify_pts': [('Seoul(Hanseong)', 37.57, 126.98), ('Pyongyang', 39.02, 125.75), ('Busanjin', 35.13, 129.05), ('Uiju', 40.20, 124.53),
                   ('Hamhung', 39.92, 127.54), ('Hoeryong', 42.44, 129.75), ('Jeju', 33.50, 126.53), ('Tsushima Izuhara', 34.20, 129.29),
                   ('Hansan-do', 34.775, 128.48), ('Myeongnyang(Uldolmok)', 34.572, 126.306), ('Jinju castle', 35.19, 128.08), ('Hizen-Nagoya', 33.53, 129.87)],
    'crops': [('south_coast', 126.0, 129.5, 35.5, 34.2), ('north_east', 128.5, 131.0, 43.0, 41.0), ('pyongyang_uiju', 124.0, 126.5, 40.6, 38.6), ('jeju_tsushima', 126.0, 130.0, 34.8, 33.0)],
}

# 구대륙 세계 기본판(아메리카·태평양 대부분 제외). 정규화 좌표 정의(x=(lon+180)/360, y=(90-lat)/180)는 그대로, 이 판이 덮는 사각형만 world_view_bounds 로 산출.
REGIONS['oldworld'] = {
    'lon0': -25.0, 'lon1': 175.0, 'lat0': -38.0, 'lat1': 78.0, 'ppd': 20, 'mobile_div': 2, 'kind': 'world',
    'desc': '구대륙(유럽·아프리카·아시아, 아이슬란드~캄차카, 희망봉~타이미르)',
    'outdir': os.path.join(PUB, 'assets', 'map_world', 'oldworld'), 'stem': 'oldworld_base',
    'river_names': set(wb.RIVER_NAMES) | {'Yalu', 'Huang', 'Chang Jiang', 'Yangtze', 'Amur', 'Liao'},
    'river_px': (4, 3, 3), 'edge_fog_deg': 6.0, 'lakes': ('ne_50m_lakes.geojson', 4),
    'ridge_cpd': (0.45, 1.6), 'shade_mult': 2.2, 'range_width_mult': 2.2, 'grain': (0.020, 0.010), 'detail_gain': (0.7, 0.45),
    'ranges': _EA['ranges'], 'rivers_extra': [],
    'verify_pts': [(n, la, lo) for n, la, lo in wb.VERIFY_PTS] + [('Cape of Good Hope', -34.36, 18.47), ('Reykjavik', 64.15, -21.94),
                   ('Petropavlovsk-K', 53.02, 158.65), ('Tokyo', 35.68, 139.77), ('Hokkaido', 43.06, 141.35)],
    'crops': [('korea_japan', 122, 142, 44, 30), ('china_mid', 104, 124, 40, 26), ('med_central', 2, 22, 46, 32),
              ('mesopotamia_levant', 30, 50, 42, 28)],
}

# 다른 캠페인 전장 경계 제안(미생성). 추가 시 REGIONS 로 옮기고 coast/verify_pts/crops 채우면 됨.
BATTLE_PROPOSALS = [
    {'id': 'goryeo_khitan_battle', 'campaign': '고려-거란 전쟁(993·1010·1018, 귀주대첩)', 'lon0': 121.5, 'lon1': 127.5, 'lat0': 37.5, 'lat1': 42.5, 'ppd': 300,
     'size': '1800x1500', 'covers': '요하 하류·요동반도·압록강·귀주·서경(평양)·개경', 'coast': 'osm_land', 'note': '요동 내륙 강(요하·태자하)은 NE 10m 로 충분, 압록강 하구 섬(위화도 등)은 OSM 확인'},
    {'id': 'salsu_battle', 'campaign': '살수대첩(612, 수 침공)', 'lon0': 120.5, 'lon1': 127.0, 'lat0': 38.0, 'lat1': 42.0, 'ppd': 300,
     'size': '1950x1200', 'covers': '요동성(랴오양)·요하·압록강·살수(청천강)·평양', 'coast': 'osm_land', 'note': '청천강은 데이터에 없어 손 입력 필요(verify), 7세기 요하 하류 해안선은 현대와 다름'},
    {'id': 'chibi_battle', 'campaign': '적벽대전(208)', 'lon0': 111.0, 'lon1': 115.5, 'lat0': 28.8, 'lat1': 31.6, 'ppd': 400,
     'size': '1800x1120', 'covers': '강릉(장링)·적벽·하구(우한)·동정호·오림', 'coast': 'ne(내륙)', 'note': '동아시아 지역판(115E~) 밖 → 세계판에서 바로 전환. 장강 폭·동정호(당시 운몽택)는 OSM 수면 폴리곤 또는 손 입력 필요, 고증 verify'},
]

PAD = 2.0   # 블러 가장자리 오차 방지용 여백(도)

class View:
    def __init__(self, r, ppd):
        self.ppd = ppd
        self.lon0 = r['lon0'] - PAD; self.lon1 = r['lon1'] + PAD
        self.lat0 = r['lat0'] - PAD; self.lat1 = r['lat1'] + PAD
        self.W = int(round((self.lon1 - self.lon0) * ppd)); self.H = int(round((self.lat1 - self.lat0) * ppd))
        self.crop = (int(PAD * ppd), int(PAD * ppd), int(PAD * ppd) + int(round((r['lon1'] - r['lon0']) * ppd)),
                     int(PAD * ppd) + int(round((r['lat1'] - r['lat0']) * ppd)))
    def proj(self, lon, lat):
        return ((lon - self.lon0) * self.ppd, (self.lat1 - lat) * self.ppd)
    def px(self, deg):
        return deg * self.ppd

def a(img): return np.asarray(img, dtype=np.float32) / 255.0
def L(arr): return Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))

def blur_deg(img, deg, v):
    """반경(도) 기준 가우시안. 큰 반경은 축소-블러-확대."""
    r = v.px(deg)
    s = 1
    while r / s > 24: s *= 2
    if s == 1:
        return img.filter(ImageFilter.GaussianBlur(r))
    sm = img.resize((max(1, img.width // s), max(1, img.height // s)), Image.BILINEAR)
    return sm.filter(ImageFilter.GaussianBlur(r / s)).resize(img.size, Image.BICUBIC)

def iter_lines(g):
    if g is None: return []
    return g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]

def raster(features, v, filt=None, ss=2):
    img = Image.new('L', (v.W * ss, v.H * ss), 0); d = ImageDraw.Draw(img)
    for ft in features:
        if ft.get('geometry') is None: continue
        if filt and not filt(ft['properties']): continue
        for poly in wb.rings(ft['geometry']):
            for i, ring in enumerate(poly):
                pts = [((x - v.lon0) * v.ppd * ss, (v.lat1 - y) * v.ppd * ss) for x, y, *_ in ring]
                if len(pts) >= 3:
                    d.polygon(pts, fill=255 if i == 0 else 0)
    return img.resize((v.W, v.H), Image.LANCZOS) if ss > 1 else img

# ---- 세계판과 동일한 fbm(같은 시드·같은 격자)을 경위도 박스로 재샘플 ----
def fbm_world(v, seed, base=8, octaves=6, persist=0.55):
    rng = np.random.default_rng(seed)
    out = np.zeros((v.H, v.W), np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        gw = base * (2 ** o); gh = max(2, gw // 2)
        g = rng.random((gh, gw)).astype(np.float32)
        # 세계판: uint8 격자 → (Ww,Hw) bicubic. 같은 격자 좌표의 box 로 리샘플(float 모드로 밴딩 방지)
        gi = Image.fromarray((g * 255).astype(np.uint8)).convert('F')
        box = ((v.lon0 + 180) / 360 * gw, (90 - v.lat1) / 180 * gh, (v.lon1 + 180) / 360 * gw, (90 - v.lat0) / 180 * gh)
        im = gi.resize((v.W, v.H), Image.BICUBIC, box=box)
        out += np.asarray(im, np.float32) / 255.0 * amp; tot += amp; amp *= persist
    return out / tot

# ---- 지역 고유 디테일 노이즈(도당 셀 수 기준) ----
def fbm_local(v, seed, cpd, octaves=4, persist=0.5):
    rng = np.random.default_rng(seed)
    out = np.zeros((v.H, v.W), np.float32); amp = 1.0; tot = 0.0
    wdeg = v.lon1 - v.lon0; hdeg = v.lat1 - v.lat0
    for o in range(octaves):
        c = cpd * (2 ** o)
        gw = max(2, int(math.ceil(wdeg * c)) + 1); gh = max(2, int(math.ceil(hdeg * c)) + 1)
        g = Image.fromarray(rng.random((gh, gw)).astype(np.float32), 'F')
        im = g.resize((v.W, v.H), Image.BICUBIC, box=(0, 0, wdeg * c, hdeg * c))
        out += np.asarray(im, np.float32) * amp; tot += amp; amp *= persist
    return np.clip(out / tot, 0, 1)

def tex_world(v, name):
    """세계판이 쓰는 면 텍스처를 같은 경위도 매핑으로 크롭·확대(저주파 색 일치)."""
    t = Image.open(os.path.join(ROOT, 'world_map_raw', 'tex', name)).convert('RGB')
    tw, th = t.size
    box = ((v.lon0 + 180) / 360 * tw, (90 - v.lat1) / 180 * th, (v.lon1 + 180) / 360 * tw, (90 - v.lat0) / 180 * th)
    return a(t.resize((v.W, v.H), Image.BICUBIC, box=box))

def tex_detail(v, name, scale, blur_px):
    """같은 텍스처를 원본 해상도 근처로 미러 타일링해 고주파(하이패스)만 추출 → 근접 양피지 결."""
    t = Image.open(os.path.join(ROOT, 'world_map_raw', 'tex', name)).convert('RGB')
    # 원본의 가는 갈라짐 선(확대 시 국경·도로처럼 읽힘)은 중간값 필터로 제거, 얼룩·번짐만 남김
    t = t.filter(ImageFilter.MedianFilter(7)).filter(ImageFilter.MedianFilter(5))
    t = t.resize((int(t.width * scale), int(t.height * scale)), Image.BICUBIC)
    tw, th = t.size
    tile = Image.new('RGB', (tw * 2, th * 2))
    tile.paste(t, (0, 0)); tile.paste(t.transpose(Image.FLIP_LEFT_RIGHT), (tw, 0))
    tile.paste(t.transpose(Image.FLIP_TOP_BOTTOM), (0, th)); tile.paste(t.transpose(Image.ROTATE_180), (tw, th))
    big = Image.new('RGB', (v.W, v.H))
    for y in range(0, v.H, tile.height):
        for x in range(0, v.W, tile.width):
            big.paste(tile, (x, y))
    hi = a(big.filter(ImageFilter.GaussianBlur(1.0))) - a(big.filter(ImageFilter.GaussianBlur(blur_px)))
    return np.where(hi < 0, hi * 0.6, hi)   # 어두운 쪽(선·얼룩 테두리) 약화

MACRO = os.path.join(ROOT, 'world_map_raw', 'tex_regional', 'sea_macro.jpg')

def macro_grain(v, scale=1.0, sigma=5.0):
    """근접 종이 결(이미지 모델 생성 sea_macro)의 명도 하이패스, 표준편차 1로 정규화(색 중립 → 육지·바다 공용)."""
    if not os.path.exists(MACRO):
        return np.zeros((v.H, v.W), np.float32)
    t = Image.open(MACRO).convert('L')
    if scale != 1.0:
        t = t.resize((int(t.width * scale), int(t.height * scale)), Image.BICUBIC)
    tw, th = t.size
    tile = Image.new('L', (tw * 2, th * 2))
    tile.paste(t, (0, 0)); tile.paste(t.transpose(Image.FLIP_LEFT_RIGHT), (tw, 0))
    tile.paste(t.transpose(Image.FLIP_TOP_BOTTOM), (0, th)); tile.paste(t.transpose(Image.ROTATE_180), (tw, th))
    big = Image.new('L', (v.W, v.H))
    for y in range(0, v.H, tile.height):
        for x in range(0, v.W, tile.width):
            big.paste(tile, (x, y))
    g = a(big) - a(big.filter(ImageFilter.GaussianBlur(sigma)))
    g = g / max(1e-4, float(g.std()))
    return np.clip(g, -3, 3)

def chaikin(ln, it=3):
    pts = [tuple(p) for p in ln]
    for _ in range(it):
        if len(pts) < 3: break
        out = [pts[0]]
        for p, q in zip(pts, pts[1:]):
            out += [(p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25), (p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75)]
        out.append(pts[-1]); pts = out
    return pts

def meander(ln, amp_deg, seed):
    """손 입력 강을 0.01° 간격으로 촘촘히 하고 진행 방향 수직으로 완만한 사인 합 사행을 줌(미술적, verify)."""
    pts = chaikin(ln, 2); out = []
    rng = np.random.default_rng(seed); ph = rng.random(3) * 6.28; fr = np.array([9.0, 23.0, 51.0])
    tot = 0.0
    for p, q in zip(pts, pts[1:]):
        d = math.dist(p, q); n = max(1, int(d / 0.01))
        for k in range(n):
            t = k / n; x = p[0] + (q[0] - p[0]) * t; y = p[1] + (q[1] - p[1]) * t
            nx, ny = -(q[1] - p[1]) / (d or 1), (q[0] - p[0]) / (d or 1)
            o = amp_deg * (np.sin(tot * fr[0] + ph[0]) * 0.6 + np.sin(tot * fr[1] + ph[1]) * 0.3 + np.sin(tot * fr[2] + ph[2]) * 0.1)
            out.append((x + nx * o, y + ny * o)); tot += d / n
    out.append(pts[-1])
    return chaikin(out, 1)

def raster_polys_local(polys, v, ss=2, k=4):
    """꼭짓점이 1px 보다 촘촘한 고해상도 폴리곤(OSM)용. PIL 폴리곤 채우기는 저해상도에서 내부에 균열이 생기므로
    폴리곤마다 자기 경계 상자 크기의 국소 캔버스에 k배로 그린 뒤 BOX 축소해 max 합성(8배 기준 대비 오차 ~0.007)."""
    W, H = v.W * ss, v.H * ss; s = v.ppd * ss
    C = np.zeros((H, W), np.float32)
    for poly in polys:
        r = np.asarray(poly[0], np.float64)
        xs = (r[:, 0] - v.lon0) * s; ys = (v.lat1 - r[:, 1]) * s
        bx0, by0 = max(0, int(math.floor(xs.min()))), max(0, int(math.floor(ys.min())))
        bx1, by1 = min(W, int(math.ceil(xs.max())) + 1), min(H, int(math.ceil(ys.max())) + 1)
        if bx1 <= bx0 or by1 <= by0: continue
        im = Image.new('L', ((bx1 - bx0) * k, (by1 - by0) * k), 0); dr = ImageDraw.Draw(im)
        dr.polygon(list(zip(((xs - bx0) * k).tolist(), ((ys - by0) * k).tolist())), fill=255)
        for hole in poly[1:]:
            h = np.asarray(hole, np.float64)
            dr.polygon(list(zip((((h[:, 0] - v.lon0) * s - bx0) * k).tolist(), (((v.lat1 - h[:, 1]) * s - by0) * k).tolist())), fill=0)
        loc = np.asarray(im.resize((bx1 - bx0, by1 - by0), Image.BOX), np.float32) / 255
        C[by0:by1, bx0:bx1] = np.maximum(C[by0:by1, bx0:bx1], loc)
    return a(Image.fromarray((C * 255).astype(np.uint8)).resize((v.W, v.H), Image.BOX))

def relpub(p):
    return os.path.relpath(p, PUB).replace(os.sep, '/')

def polylines_mask(lines, v, width_deg_fn):
    img = Image.new('L', (v.W, v.H), 0); d = ImageDraw.Draw(img)
    for ln, wdeg in lines:
        d.line([v.proj(x, y) for x, y in ln], fill=255, width=max(1, int(round(v.px(wdeg)))), joint='curve')
        for x, y in (ln[0], ln[-1]):
            px, py = v.proj(x, y); r = v.px(wdeg) / 2
            d.ellipse([px - r, py - r, px + r, py + r], fill=255)
    return img

def build_region(name, q=80, mq=78, verify=True):
    r = REGIONS[name]
    t0 = time.time()
    v = View(r, r['ppd'])
    print(f'[{name}] canvas {v.W}x{v.H} (pad {PAD}°), ppd {v.ppd} = 세계4096 대비 x{v.ppd / WORLD_PPD:.2f}')
    load = lambda n: json.load(open(os.path.join(DATA, n), encoding='utf-8'))['features']
    land_f = load('ne_10m_land.geojson'); isl_f = load('ne_10m_minor_islands.geojson')
    lakes_f = load('ne_10m_lakes.geojson'); reg_f = load('ne_10m_geography_regions_polys.geojson')
    riv_f = load('ne_10m_rivers_lake_centerlines.geojson')

    land_img = raster(land_f, v)
    isl = raster(isl_f, v)
    if r.get('lakes'):
        lakes_f = load(r['lakes'][0]); lk = r['lakes'][1]
    else:
        lk = 6
    lakes = raster(lakes_f, v, filt=lambda p: (p.get('scalerank') or 9) <= lk and p.get('featurecla') != 'Reservoir')
    land = np.clip(np.maximum(a(land_img), a(isl)) - a(lakes), 0, 1)
    coast_stats = None
    if r.get('coast') == 'osm_land':
        # OSM 육지 폴리곤(범위 추출본) — 수집 범위 안은 OSM, 밖은 NE
        import gzip; od = json.load(gzip.open(os.path.join(DATA, 'osm_land', r['osm_land'] + '.json.gz'), 'rt', encoding='utf-8'))
        om = raster_polys_local(od['polys'], v)
        c0, c1, c2, c3 = od['bbox']
        cin = ((np.linspace(v.lon0, v.lon1, v.W)[None, :] > c0) & (np.linspace(v.lon0, v.lon1, v.W)[None, :] < c1) &
               (np.linspace(v.lat1, v.lat0, v.H)[:, None] > c2) & (np.linspace(v.lat1, v.lat0, v.H)[:, None] < c3))
        land = np.where(cin, np.clip(om - a(lakes), 0, 1), land)
        coast_stats = {'source': od['source'], 'shapes': od['shapes'], 'polys': len(od['polys']), 'cover': od['bbox']}
        print('  osm land', coast_stats['shapes'], 'shapes')
    if r.get('carve'):
        cv = polylines_mask([(ln, w) for _, w, ln in r['carve']], v, None)
        land = np.clip(land - a(cv.filter(ImageFilter.GaussianBlur(0.8))), 0, 1)
    land_img = L(land)
    print(f'  masks {time.time() - t0:.0f}s')

    # 세계판과 같은 '도' 단위 블러 반경(세계: r*sc px @ 11.378ppd)
    wdeg = lambda r_px: r_px * WORLD_SC / WORLD_PPD
    mtn = a(blur_deg(raster(reg_f, v, filt=lambda p: p.get('FEATURECLA') == 'Range/mtn', ss=1), wdeg(3), v))
    if r.get('ne_ranges') is False: mtn = mtn * 0   # 2026-11-04: NE 산악 폴리곤이 분지(헝가리 평원)까지 덮는 지역은 보강 산줄기만 사용
    desert = a(blur_deg(raster(reg_f, v, filt=lambda p: p.get('FEATURECLA') == 'Desert', ss=1), wdeg(5), v))
    plateau = a(blur_deg(raster(reg_f, v, filt=lambda p: p.get('FEATURECLA') == 'Plateau', ss=1), wdeg(6), v))
    fimg = Image.new('L', (v.W, v.H), 0); fd = ImageDraw.Draw(fimg)
    for lon, lat, rl, rt in wb.FORESTS:
        x0, y0 = v.proj(lon - rl, lat + rt); x1, y1 = v.proj(lon + rl, lat - rt)
        fd.ellipse([x0, y0, x1, y1], fill=255)
    forest = a(blur_deg(fimg, wdeg(18), v))
    # 보강 산줄기(지역판 전용 능선 음영·약한 올리브)
    rng_mask = a(blur_deg(polylines_mask([(chaikin(ln), w * r.get('range_width_mult', 1.0)) for _, w, ln in (r.get('ranges') or [])], v, None), 0.12, v))

    yy = np.linspace(v.lat1, v.lat0, v.H, dtype=np.float32)[:, None] * np.ones((1, v.W), np.float32)
    xx = np.ones((v.H, 1), np.float32) * np.linspace(v.lon0, v.lon1, v.W, dtype=np.float32)[None, :]

    n1 = fbm_world(v, 11, 6, 7)          # 세계판 큰 얼룩
    n2 = fbm_world(v, 23, 32, 5)         # 세계판 중간 결
    d1 = fbm_local(v, 101, 1.2, 5)       # 지역 디테일
    d2 = fbm_local(v, 103, 6.0, 4)
    print(f'  noise {time.time() - t0:.0f}s')

    # 해안 거리 근사. 지역판은 해안 띠를 세계판보다 좁혀(근접 디테일) 작은 반도 내부가 통째로 어두워지지 않게 함
    E = {'mid': 0.55, 'thin': 0.12, 'near': 0.05, 'glow': 1.2, **r.get('edge', {})}
    kp = v.ppd / 120.0
    in_near = a(blur_deg(land_img, E['near'], v)); in_mid = a(blur_deg(land_img, E['mid'], v)); in_far = a(blur_deg(land_img, wdeg(40), v))
    in_glow = a(blur_deg(land_img, E['glow'], v))
    edge_in = np.clip((land - in_mid) * 2.0, 0, 1) * land
    edge_thin = np.clip((land - a(blur_deg(land_img, E['thin'], v))) * 2.4, 0, 1) * land
    sea_glow = np.clip(in_glow * 2.0, 0, 1) * (1 - land)
    sea_far = 1 - np.clip(in_far * 2.5, 0, 1)

    # --- 바다 ---
    ts = tex_world(v, 'sea.jpg')
    sg = ts.mean(axis=2, keepdims=True); ts = ts * 0.8 + sg * 0.2
    sea = ts * 0.92 + 0.08
    sdet = tex_detail(v, 'sea.jpg', 1.6, 18)
    DG = r.get('detail_gain', (0.9, 0.55))
    sea = sea + sdet * DG[1] + ((d2 - 0.5) * 0.035)[..., None]
    sea = wb.over(sea, PAL['sea_hi'], np.clip(sea_glow * 0.7, 0, 1))
    sea = wb.over(sea, PAL['sea_lo'], sea_far * 0.18)
    # 연안 물자국 테두리(아주 옅은 청록 등선) — 수채 번짐 느낌
    ring = np.clip(1 - np.abs(in_near * 1.0 - 0.18) / 0.06, 0, 1) * (1 - land)
    ring = a(L(ring).filter(ImageFilter.GaussianBlur(1.2)))
    sea = wb.over(sea, PAL['river'], ring * 0.22)

    # --- 육지 ---
    tl = tex_world(v, 'land.jpg')
    ldet = tex_detail(v, 'land.jpg', 1.6, 22)
    landc = tl + ldet * DG[0] + ((d1 - 0.5) * 0.10)[..., None]
    landc = wb.over(landc, PAL['desert'], desert * (0.35 + 0.35 * wb.smooth(0.35, 0.65, n2)))
    landc = wb.over(landc, PAL['land_lo'], plateau * 0.18 * wb.smooth(0.4, 0.7, n2))
    fmask = np.clip(forest * wb.smooth(0.42, 0.62, n2 * 0.6 + n1 * 0.4), 0, 1) * 0.5
    mtn_wide = a(blur_deg(L(mtn), wdeg(9), v))
    mmask = np.clip(wb.smooth(0.08, 0.45, mtn_wide * (0.6 + 0.8 * n2)), 0, 1) * 0.55
    rmask = np.clip(wb.smooth(0.1, 0.6, rng_mask * (0.7 + 0.6 * d1)), 0, 1) * 0.35
    landc = wb.over(landc, PAL['olive'], np.maximum(np.maximum(fmask, mmask), rmask))
    # 산악 입체(지역 해상도 능선): 높이장 = 산맥 마스크 × 능선 노이즈, 광원 왼쪽 위(세계판과 같은 방향)
    RC = r.get('ridge_cpd', (2.0, 7.0))
    rid = 1.0 - np.abs(fbm_local(v, 107, RC[0], 5, 0.55) - 0.5) * 2.0
    rid2 = 1.0 - np.abs(fbm_local(v, 109, RC[1], 3, 0.5) - 0.5) * 2.0
    mt = np.clip(np.maximum(mtn, rng_mask * 0.9), 0, 1)
    mt = np.maximum(mt, a(blur_deg(L(mtn), 0.25, v)) * 0.8)
    hgt = mt * (0.2 + 0.55 * rid ** 2.2 + 0.25 * rid2 ** 2.0) * land
    hgt = a(L(hgt).filter(ImageFilter.GaussianBlur(1.8)))
    gy, gx = np.gradient(hgt)
    shade = np.clip(-(gx + gy) * 34.0 * kp * r.get('shade_mult', 1.0), -1, 1)
    landc = wb.over(landc, (250, 236, 200), np.clip(shade, 0, 1) * 0.34)
    landc = wb.over(landc, PAL['olive_dk'], np.clip(-shade, 0, 1) * 0.50)
    # 해안 번짐(넓은 띠는 약하게, 좁은 띠는 진하게)
    landc = wb.over(landc, PAL['land_edge'], edge_in * (0.32 + 0.2 * n2))
    landc = wb.over(landc, PAL['land_edge'], edge_thin * 0.38)

    # --- 강(10m 데이터 + 보강) ---
    rv = Image.new('L', (v.W, v.H), 0); rd = ImageDraw.Draw(rv)
    rmax = r.get('river_rank_max', 8); rnames = r.get('river_names')
    RPX = r.get('river_px') or tuple(int(round(x * min(2.0, kp ** 0.5))) for x in (6, 4, 3))
    for ft in riv_f:
        p = ft['properties']; sr = p.get('scalerank') or 10
        if ft.get('geometry') is None: continue
        if rnames is not None:
            if (p.get('name') or '') not in rnames: continue
        elif sr > rmax: continue
        wdt = RPX[0] if sr <= 3 else (RPX[1] if sr <= 6 else RPX[2])
        for ln in iter_lines(ft['geometry']):
            if len(ln) > 1:
                rd.line([v.proj(x, y) for x, y, *_ in ln], fill=255, width=wdt, joint='curve')
    for i_, (_, ln) in enumerate(r.get('rivers_extra') or []):
        lnp = meander(ln, r['meander'], 300 + i_) if r.get('meander') else chaikin(ln)
        rd.line([v.proj(x, y) for x, y in lnp], fill=255, width=RPX[2], joint='curve')
    river = a(rv.filter(ImageFilter.GaussianBlur(0.9))) * land
    landc = wb.over(landc, PAL['river'], river * 0.8)
    # 호수 테두리
    lake_m = a(lakes)

    # --- 합성 ---
    er = land_img.filter(ImageFilter.MinFilter(5 if v.ppd <= 150 else 7))
    coast = np.clip(land - a(er), 0, 1)
    coast = a(L(coast).filter(ImageFilter.GaussianBlur(0.8)))
    bleed = np.clip((in_near - land) * 1.6, 0, 1)
    if r.get('neutral'):
        gl = landc.mean(axis=2, keepdims=True)
        landc = landc * (1 - r['neutral']) + (gl * 0.92 + 0.08) * r['neutral']
    img = sea * (1 - land[..., None]) + landc * land[..., None]
    img = wb.over(img, PAL['land_edge'], bleed * 0.35)
    img = wb.over(img, PAL['coast'], coast * 0.75)
    lake_edge = np.clip(lake_m - a(Image.fromarray((lake_m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))), 0, 1)
    img = wb.over(img, PAL['coast'], lake_edge * 0.4)
    # 세계판과 같은 비네팅 공식(경위도 기준) — 크로스페이드 시 명도 일치
    if r.get('kind') == 'world':
        # 화면(뷰) 기준 가장자리: 안개(바다 청백)로 자연스럽게 끝냄 + 극지 안개(기존 세계판 공식) + 옅은 비네팅
        vr = REGIONS[name]
        de = np.minimum(np.minimum(xx - vr['lon0'], vr['lon1'] - xx), np.minimum(yy - vr['lat0'], vr['lat1'] - yy))
        fd = r.get('edge_fog_deg', 6.0)
        fog = wb.smooth(fd, 0.0, de) * 0.88 + wb.smooth(68, 85, yy) * 0.45
        fog = np.clip(fog * (0.85 + 0.3 * (n1 - 0.5)), 0, 0.9)
        img = wb.over(img, PAL['sea_hi'], fog)
        cxv = (vr['lon0'] + vr['lon1']) / 2; cyv = (vr['lat0'] + vr['lat1']) / 2
        vx = np.abs(xx - cxv) / ((vr['lon1'] - vr['lon0']) / 2); vy = np.abs(yy - cyv) / ((vr['lat1'] - vr['lat0']) / 2)
    else:
        vx = np.abs(xx / 180.0); vy = np.abs(yy / 90.0)
    vig = wb.smooth(0.75, 1.0, np.maximum(vx, vy)) * 0.18
    img = img * (1 - vig[..., None] * 0.6)
    # 근접 종이 결: 명도 곱(육지는 조금 강하게, 바다는 약하게)
    gr = macro_grain(v, 1.0, 5.0)
    GK = r.get('grain', (0.028, 0.016))
    k = (GK[0] * land + GK[1] * (1 - land))[..., None]
    img = img * (1 + gr[..., None] * k)

    full =Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGB').crop(v.crop)
    odir = r.get('outdir', OUTDIR); stem = r.get('stem', name)
    os.makedirs(odir, exist_ok=True)
    W, H = full.size
    out = os.path.join(odir, f'{stem}_{W}.webp')
    full.save(out, 'WEBP', quality=q, method=6)
    mob = full.resize((W // r['mobile_div'], H // r['mobile_div']), Image.LANCZOS)
    out_m = os.path.join(odir, f'{stem}_{mob.width}.webp')
    mob.save(out_m, 'WEBP', quality=mq, method=6)
    print(f'  {out} {os.path.getsize(out)} B / {out_m} {os.path.getsize(out_m)} B  ({time.time() - t0:.0f}s)')

    bounds = write_bounds(name, r, full.size, mob.size, out, out_m)
    if r.get('landmask'):
        lm = L(land).crop(v.crop)
        for im_, tag in ((lm, W), (lm.resize(mob.size, Image.BOX), mob.width)):
            la = Image.merge('LA', (Image.new('L', im_.size, 255), im_))
            pth = os.path.join(odir, f'{stem}_landmask_{tag}.png'); la.save(pth, optimize=True)
            bounds.setdefault('landmask', {})['desktop' if tag == W else 'mobile'] = {
                'path': relpub(pth), 'size': f'{im_.width}x{im_.height}', 'bytes': os.path.getsize(pth),
                'format': 'PNG LA(흰색 + 알파=육지, 경계 안티앨리어싱). canvas destination-in / CSS mask-image 로 영토 폴리곤을 육지에만 클리핑'}
    if coast_stats:
        bounds['coastSource'] = {**coast_stats, 'license': 'ODbL — 화면/크레딧에 © OpenStreetMap contributors 표기 필요'}
    if r.get('carve'):
        bounds['exaggerated'] = [{'name': n_, 'width_deg': w_, 'note': '실제 폭이 1px 안팎이라 표현용으로 넓힘'} for n_, w_, _ in r['carve']]
    json.dump(bounds, open(bounds_path(name), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    # 정합 수치 검증용 마스크(크롭)
    land_c = land_img.crop(v.crop)
    if verify:
        # 세계판 4096 과 같은 해상도·같은 데이터(10m land - 50m lakes ≤4)로 그린 기준 마스크
        vw = View(r, WORLD_PPD)
        wl = np.clip(a(raster(land_f, vw)) - a(raster(load('ne_50m_lakes.geojson'), vw, filt=lambda p: (p.get('scalerank') or 9) <= 4)), 0, 1)
        wmask = L(wl).crop(vw.crop)
        qa = make_qa(name, r, full, land_c, wmask)
        bounds['qa_metrics'] = qa
        json.dump(bounds, open(bounds_path(name), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return bounds

def bounds_path(name):
    r = REGIONS[name]
    return os.path.join(r.get('outdir', OUTDIR), f"{r.get('stem', name)}_bounds.json")

def write_bounds(name, r, size, msize, out, out_m):
    lon0, lon1, lat0, lat1 = r['lon0'], r['lon1'], r['lat0'], r['lat1']
    b = {
        'region': name, 'desc': r['desc'],
        'geo': {'lonMin': lon0, 'lonMax': lon1, 'latMin': lat0, 'latMax': lat1},
        'normalized': {  # 세계판 정규화 좌표(x=(lon+180)/360, y=(90-lat)/180)에서의 사각형
            'x0': (lon0 + 180) / 360, 'x1': (lon1 + 180) / 360, 'y0': (90 - lat1) / 180, 'y1': (90 - lat0) / 180,
            'w': (lon1 - lon0) / 360, 'h': (lat1 - lat0) / 180,
        },
        'projection': 'equirectangular(세계판과 동일). 지역판 px = ((lon-lonMin)*ppd, (latMax-lat)*ppd)',
        'desktop': {'path': relpub(out), 'size': f'{size[0]}x{size[1]}', 'ppd': r['ppd'],
                    'bytes': os.path.getsize(out), 'sharpnessVsWorld4096': round(r['ppd'] / WORLD_PPD, 2)},
        'mobile': {'path': relpub(out_m), 'size': f'{msize[0]}x{msize[1]}', 'ppd': r['ppd'] / r['mobile_div'],
                   'bytes': os.path.getsize(out_m), 'sharpnessVsWorld2048': round(r['ppd'] / r['mobile_div'] / (2048 / 360), 2)},
        'placement': '세계판 이미지 위 정규화 사각형 [x0*Ww, y0*Hw, w*Ww, h*Hw] 에 그대로 늘려 덮으면 해안이 일치(가로·세로 같은 배율)',
    }
    json.dump(b, open(bounds_path(name), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return b

def make_qa(name, r, full, land_c, wmask):
    os.makedirs(PREV, exist_ok=True)
    W, H = full.size; ppd = r['ppd']
    pr = lambda lon, lat: ((lon - r['lon0']) * ppd, (r['lat1'] - lat) * ppd)
    # 1) 정합: 지역 육지 마스크를 세계판 4096 해상도로 축소 vs 세계판 육지(같은 영역, 세계판 빌드와 같은 10m 데이터 래스터)
    world = Image.open(os.path.join(PUB, 'assets', 'map_world', 'world_base_4096.webp')).convert('RGB')
    Ww, Hw = world.size
    bx = ((r['lon0'] + 180) / 360 * Ww, (90 - r['lat1']) / 180 * Hw, (r['lon1'] + 180) / 360 * Ww, (90 - r['lat0']) / 180 * Hw)
    sw, sh = int(round(bx[2] - bx[0])), int(round(bx[3] - bx[1]))
    wcrop = world.resize((sw, sh), Image.BICUBIC, box=bx)
    small = full.resize((sw, sh), Image.LANCZOS)
    # 색 일치도(저주파): 둘 다 강하게 블러 후 평균 절대차
    bw = a(wcrop.filter(ImageFilter.GaussianBlur(6))); bs = a(small.filter(ImageFilter.GaussianBlur(6)))
    col_mae = float(np.abs(bw - bs).mean() * 255)
    # 해안 정합: 세계판 색으로 육지 추정(바다는 밝은 민트: G>200 & B>190 근처) vs 지역 마스크 축소
    w_land = np.asarray(wmask.resize((sw, sh), Image.BILINEAR), np.float32) > 127
    r_land = np.asarray(land_c.resize((sw, sh), Image.BOX), np.float32) > 127
    inter = (w_land & r_land).sum(); uni = (w_land | r_land).sum()
    iou = float(inter / max(1, uni))
    # 계통 오프셋(무게중심 차, 세계4096 px)
    sw_ = np.asarray(wmask.resize((sw, sh), Image.BILINEAR), np.float32) / 255
    sr_ = np.asarray(land_c.resize((sw, sh), Image.BOX), np.float32) / 255
    gy_, gx_ = np.mgrid[0:sh, 0:sw]
    cen = lambda m: ((m * gx_).sum() / m.sum(), (m * gy_).sum() / m.sum())
    cw, cr_ = cen(sw_), cen(sr_)
    off = (round(float(cr_[0] - cw[0]), 3), round(float(cr_[1] - cw[1]), 3))
    area_ratio = round(float(sr_.sum() / sw_.sum()), 4)
    soft_mae = round(float(np.abs(sw_ - sr_).mean()), 4)
    # 세계판 실제 이미지 기준 추정(연안 번짐 포함 → 참고용)
    wc = np.asarray(wcrop, np.float32)
    w_img_land = ~((wc[..., 1] > 196) & (wc[..., 2] > 180) & (wc[..., 1] >= wc[..., 0] - 4))
    iou_img = float((w_img_land & r_land).sum() / max(1, (w_img_land | r_land).sum()))
    # 2) 비교 시트: 같은 영역 세계판 확대(최근접) | 지역판
    cmp_w = 1400
    left = wcrop.resize((cmp_w, int(cmp_w * sh / sw)), Image.NEAREST)
    right = full.resize(left.size, Image.LANCZOS)
    sheet = Image.new('RGB', (cmp_w * 2 + 20, left.height), (20, 20, 20)); sheet.paste(left, (0, 0)); sheet.paste(right, (cmp_w + 20, 0))
    sheet.save(os.path.join(PREV, f'{name}_compare_world_vs_regional.jpg'), 'JPEG', quality=86)
    # 3) 해안 오버레이: 지역판 위에 세계판 해안(빨강, 4096 기준) 윤곽
    ov = full.copy().convert('RGB'); d = ImageDraw.Draw(ov)
    wl = Image.fromarray((w_land * 255).astype(np.uint8)).resize((W, H), Image.NEAREST)
    edge = np.asarray(wl.filter(ImageFilter.FIND_EDGES)) > 0
    o = np.asarray(ov).copy(); o[edge] = (220, 0, 0); ov = Image.fromarray(o)
    d = ImageDraw.Draw(ov)
    gs, gm = (1, 5) if ppd >= 60 else (10, 30)
    for lon in range(int(math.floor(r['lon0'])), int(r['lon1']) + 1):
        if lon % gs: continue
        x = (lon - r['lon0']) * ppd; d.line([(x, 0), (x, H)], fill=(40, 40, 200) if lon % gm == 0 else (90, 90, 170), width=3 if lon % gm == 0 else 1)
    for lat in range(int(math.floor(r['lat0'])), int(r['lat1']) + 1):
        if lat % gs: continue
        y = (r['lat1'] - lat) * ppd; d.line([(0, y), (W, y)], fill=(40, 40, 200) if lat % gm == 0 else (90, 90, 170), width=3 if lat % gm == 0 else 1)
    s = 18 if ppd >= 60 else 8
    for nm, lat, lon in r['verify_pts']:
        x, y = pr(lon, lat)
        d.line([(x - s, y), (x + s, y)], fill=(255, 0, 0), width=4); d.line([(x, y - s), (x, y + s)], fill=(255, 0, 0), width=4)
        d.text((x + s + 4, y - 10), nm, fill=(120, 0, 0))
    ov.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(PREV, f'{name}_verify_full.jpg'), 'JPEG', quality=85)
    # 4) 근접 크롭(원 해상도 100%): 남해안·대한해협, 서울·한강, 규슈 북부, 교토 일대
    crops = r.get('crops') or [('south_coast', 126.0, 129.5, 35.6, 34.0), ('seoul_han', 126.3, 127.9, 38.0, 37.1), ('korea_strait', 128.6, 130.6, 35.2, 33.2),
             ('kinki', 134.8, 136.6, 35.6, 34.3)]
    tiles = []
    for nm, l0, l1, t0, t1 in crops:
        x0, y0 = pr(l0, t0); x1, y1 = pr(l1, t1)
        tiles.append(full.crop((int(x0), int(y0), int(x1), int(y1))).resize((700, int(700 * (t0 - t1) / (l1 - l0))), Image.LANCZOS))
    r0 = max(tiles[0].height, tiles[1].height); r1 = max(tiles[2].height, tiles[3].height)
    cs = Image.new('RGB', (700 * 2 + 10, r0 + r1 + 10), (20, 20, 20))
    for i, t in enumerate(tiles):
        cs.paste(t, ((i % 2) * 710, 0 if i < 2 else r0 + 10))
    cs.save(os.path.join(PREV, f'{name}_zoom_crops.jpg'), 'JPEG', quality=88)
    m = {'land_iou_vs_world4096_datamask': round(iou, 4), 'soft_centroid_offset_world4096_px': off, 'land_area_ratio': area_ratio,
         'soft_mask_mae': soft_mae,
         'note': '차이는 세계판 저해상도 래스터가 해안 경계 픽셀을 포함해 0.25~0.5px(세계4096) 외곽으로 두꺼운 효과(사방 균일, 위치 어긋남 아님). 땅이 서·북에 몰린 영역이라 무게중심이 동남으로 끌림',
         'land_iou_vs_world4096_image_estimate': round(iou_img, 4), 'lowfreq_color_mae_0_255': round(col_mae, 2)}
    print('  QA', m)
    return m

if __name__ == '__main__':
    name = sys.argv[1]
    q = int(sys.argv[sys.argv.index('--q') + 1]) if '--q' in sys.argv else 80
    mq = int(sys.argv[sys.argv.index('--mq') + 1]) if '--mq' in sys.argv else 78
    names = list(REGIONS) if name == 'all' else [name]
    for n in names:
        build_region(n, q, mq, verify='--no-verify' not in sys.argv)
