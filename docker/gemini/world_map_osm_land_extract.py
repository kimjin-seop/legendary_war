# OSM 육지 폴리곤(osmdata.openstreetmap.de land-polygons-split-4326, ODbL © OpenStreetMap contributors)에서 경위도 범위만 잘라
# 압축 JSON 으로 저장 → world_map_regional_build.py 의 coast='osm_land' 가 사용.
# 원본 zip(약 930MB)은 프로젝트 밖에 풀어 두고 .shp 경로(또는 zip)를 인자로 줌. pyshp(MIT, PyPI) 필요 — PYLIB 환경변수로 경로 추가 가능.
# 사용: python -X utf8 docker/gemini/world_map_osm_land_extract.py <land_polygons.shp> <id> <lon0> <lon1> <lat0> <lat1>
#  → docker/gemini/world_map_data/osm_land/<id>.json.gz  {"bbox":[...], "source":..., "polys":[[ring0,[hole]...], ...]} (좌표 소수 5자리)
import os, sys, json, time, gzip
if os.environ.get('PYLIB'):
    sys.path.insert(0, os.environ['PYLIB'])
import shapefile

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'world_map_data', 'osm_land')

def ring_area(r):
    s = 0.0
    for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]):
        s += x0 * y1 - x1 * y0
    return s / 2

def main(zp, rid, lon0, lon1, lat0, lat1):
    t0 = time.time()
    rd = shapefile.Reader(zp)
    polys = []; n = 0
    for shp in rd.iterShapes(bbox=(lon0, lat0, lon1, lat1)):   # 레코드 헤더 bbox 로 빠르게 거름
        pts = shp.points; parts = list(shp.parts) + [len(pts)]
        rings = [[(round(x, 5), round(y, 5)) for x, y in pts[a:b]] for a, b in zip(parts, parts[1:])]
        # shapefile: 외곽 시계방향(면적<0), 구멍 반시계 → 외곽마다 뒤따르는 구멍 묶기
        cur = None
        for rg in rings:
            if ring_area(rg) <= 0:
                cur = [rg]; polys.append(cur)
            elif cur is not None:
                cur.append(rg)
        n += 1
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, f'{rid}.json.gz')
    json.dump({'bbox': [lon0, lon1, lat0, lat1], 'source': 'OpenStreetMap land-polygons-split-4326 (osmdata.openstreetmap.de), ODbL — © OpenStreetMap contributors',
               'shapes': n, 'polys': polys}, gzip.open(out, 'wt', encoding='utf-8'), separators=(',', ':'))
    print(out, n, 'shapes', len(polys), 'polys', os.path.getsize(out), 'bytes', f'{time.time() - t0:.0f}s')

if __name__ == '__main__':
    a = sys.argv
    main(a[1], a[2], *map(float, a[3:7]))
