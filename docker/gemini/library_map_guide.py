# 잊힌 서고 도서관 지도 배치 가이드(안아트 2026-11-14, API 호출 없음).
# resources/js/game/data/library_map_profile.json 의 구역·노드 좌표(읽기만)로 21:9 가이드 이미지를 만든다.
# 21:9 생성본의 가운데 2.2 비 영역(좌우 각 2.86% 잘림)이 지도 [0,1] 좌표가 된다.
# 실행(저장소 루트): python docker/gemini/library_map_guide.py
import json
from PIL import Image, ImageDraw
P = json.load(open('resources/js/game/data/library_map_profile.json', encoding='utf8'))
GW, GH = 2100, 900                      # 21:9
A = P['aspect']; CW = GH * A; X0 = (GW - CW) / 2
X = lambda x: X0 + x * CW; Y = lambda y: y * GH
TINT = {0: (196, 170, 120), 101: (214, 172, 80), 102: (70, 160, 150), 103: (170, 70, 70), 104: (120, 90, 180)}
im = Image.new('RGB', (GW, GH), (92, 66, 40))  # v2: 칸막이를 검은 틈 대신 중간 갈색(연속된 한 홀로 읽히게)
d = ImageDraw.Draw(im)
pins = {}
for s in P['stages']:
    ch = 0 if s['stage_code'].startswith('stage_') else int(s['stage_code'][2:5])
    pins.setdefault(ch, []).append(s['map']['pin'])
for z in P['zones']:
    x0, y0, x1, y1 = z['rect']; t = TINT[z['chapter']]
    dark = tuple(int(c * 0.45) for c in t)
    d.rectangle([X(x0), 0, X(x1), GH], fill=dark)                      # 구역 전체(서가 벽 톤)
    d.rectangle([X(x0 + 0.02), Y(0.15), X(x1 - 0.02), Y(0.88)], fill=tuple(int(c * 0.75) for c in t))  # 바닥
    cx = (x0 + x1) / 2
    d.rectangle([X(cx - 0.065), Y(0.17), X(cx + 0.065), Y(0.86)], fill=t)  # 비워 둘 핵심 바닥
im.save('docker/gemini/library_map/guide_21x9.png')
# 노드 오버레이(QA 전용, 모델에 주지 않음)
q = im.copy(); dq = ImageDraw.Draw(q)
for ch, ps in pins.items():
    for p in ps: dq.ellipse([X(p['x']) - 12, Y(p['y']) - 12, X(p['x']) + 12, Y(p['y']) + 12], outline=(255, 255, 255), width=3)
dq.rectangle([X0, 0, X0 + CW, GH - 1], outline=(255, 0, 0), width=2)
q.save('docker/gemini/library_map/preview/guide_nodes.png')
print('ok', X0, CW)
