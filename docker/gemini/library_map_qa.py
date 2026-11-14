# 잊힌 서고 지도 배경 QA 미리보기(API 호출 없음). raw/<id>.jpg -> 가운데 2.2 크롭 -> 1760x800 + 노드 26개·구역 경계 오버레이
# 실행(저장소 루트): python docker/gemini/library_map_qa.py lib_a lib_b
import json, sys
from PIL import Image, ImageDraw
P = json.load(open('resources/js/game/data/library_map_profile.json', encoding='utf8'))
A = P['aspect']

def crop22(im):
    w, h = im.size; cw = round(h * A); x0 = (w - cw) // 2
    return im.crop((x0, 0, x0 + cw, h))

for id_ in sys.argv[1:]:
    im = crop22(Image.open(f'docker/gemini/library_map/raw/{id_}.jpg').convert('RGB')).resize((1760, 800), Image.LANCZOS)
    d = ImageDraw.Draw(im); W, H = im.size
    for z in P['zones']:
        x0, y0, x1, y1 = z['rect']; d.rectangle([x0 * W, y0 * H, x1 * W, y1 * H], outline=(255, 255, 0), width=1)
    for s in P['stages']:
        x, y = s['map']['pin']['x'] * W, s['map']['pin']['y'] * H
        d.rectangle([x - 11, y - 28, x + 11, y], outline=(0, 255, 0), width=2)
    im.save(f'docker/gemini/library_map/preview/{id_}_nodes.jpg', quality=88)
    print(id_, 'ok')
