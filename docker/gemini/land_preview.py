"""육상 타일 before/after 미리보기 렌더러(API 호출 없음).
입력: cells.json(node 로 FE 순수함수 u32ComposeWithBuildings 결과를 덤프한 칸별 [idx, rot, tint, wash, over, code])
사용: python land_preview.py <cells.json> <out_dir> <tag> <TileMap.png> <ext.png> <ext2.png> [land_set.png] [paint.json]
 - paint.json 이 있으면 cells 대신 그 칸별 인덱스(제안 레시피 결과)를 그린다.
FE UnityGround 와 같은 규칙: tint=multiply, wash=source-over 알파, rot=90도 단위(시계방향), over=덧그림.
"""
import sys, json
import numpy as np
from PIL import Image

T = 32
cells_p, out_dir, tag, tm_p, e1_p, e2_p = sys.argv[1:7]
land_p = sys.argv[7] if len(sys.argv) > 7 and sys.argv[7] != '-' else None
paint_p = sys.argv[8] if len(sys.argv) > 8 else None
tm = np.array(Image.open(tm_p).convert('RGBA'))
e1 = np.array(Image.open(e1_p).convert('RGBA'))
e2 = np.array(Image.open(e2_p).convert('RGBA'))
ls = np.array(Image.open(land_p).convert('RGBA')) if land_p else None
LS_START = 200
import os
WS = 'public/assets/tiles/water_set/ws_static.png'  # 읽기 전용(언덕 미리보기용, 수정 안 함)
ws = np.array(Image.open(WS).convert('RGBA')) if os.path.exists(WS) else None


def cut(sheet, f, cols=10):
    r, c = divmod(f, cols)
    return sheet[r * T:(r + 1) * T, c * T:(c + 1) * T].copy()


def src(idx):
    if idx >= 1000: return cut(ws, idx - 1000)
    if idx < 30: return cut(tm, idx)
    if idx < 110: return cut(e1, idx - 30)
    if idx < LS_START: return cut(e2, idx - 110)
    return cut(ls, idx - LS_START, 16)


def hexrgb(v):
    return np.array([(v >> 16) & 255, (v >> 8) & 255, v & 255], dtype=np.float32)


def over(dst, s):
    a = s[..., 3:4].astype(np.float32) / 255
    dst[..., :3] = (dst[..., :3] * (1 - a) + s[..., :3] * a)


data = json.load(open(cells_p, encoding='utf-8'))
paint = json.load(open(paint_p, encoding='utf-8')) if paint_p else None
for code, m in data.items():
    cols, rows = m['cols'], m['rows']
    img = np.zeros((rows * T, cols * T, 3), np.float32)
    cl = paint[code]['cells'] if paint and code in paint else m['cells']
    for i, c in enumerate(cl):
        idx, rot, tint, wash, ov = c[0], c[1], c[2], c[3], c[4]
        y, x = divmod(i, cols)
        if isinstance(idx, list):  # 레이어 [바닥, 덧그림...]
            layers = idx
        else:
            layers = [idx]
        t = src(layers[0]).astype(np.float32)
        if rot: t = np.rot90(t, -rot)
        if tint is not None: t[..., :3] = t[..., :3] * hexrgb(tint) / 255
        if wash: t[..., :3] = t[..., :3] * (1 - wash[1]) + hexrgb(wash[0]) * wash[1]
        tile = t[..., :3].copy()
        for li in layers[1:]:
            s = src(li).astype(np.float32); a = s[..., 3:4] / 255; tile = tile * (1 - a) + s[..., :3] * a
        if ov is not None:
            s = src(ov).astype(np.float32); a = s[..., 3:4] / 255; tile = tile * (1 - a) + s[..., :3] * a
        img[y * T:(y + 1) * T, x * T:(x + 1) * T] = tile
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    im.save(f'{out_dir}/{tag}_{code}.png')
    im.resize((im.width * 2, im.height * 2), Image.NEAREST).save(f'{out_dir}/{tag}_{code}_x2.png')
print('ok', tag, list(data.keys()))
