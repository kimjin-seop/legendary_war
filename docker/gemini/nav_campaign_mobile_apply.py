# 모바일 하단 탭 '캠페인' 아이콘(ico.tab_stage, 아틀라스 uiskin_extra) 교체(안아트 2026-11-14, 호출 없음).
#   입력: public/assets/ui/_candidates_campaign/cand_a_plus.png(PC 레일 ui.nav.single 과 같은 A안 보강본, 192x192)
#   대상: public/assets/ui_skin/atlas/ui_skin_extra@{3x,1.5x}.png 의 ico.tab_stage 프레임 칸만(좌표·크기·JSON 불변)
#   백업: public/assets/ui_skin/atlas/_bak_캠페인아이콘_20261114/ (PNG·JSON 원본, 이미 있으면 덮지 않음)
#   검증: 다른 프레임·프레임 밖 픽셀을 디코드 후 sha1 비교(전후 동일해야 통과), JSON 바이트 sha1 불변
# 실행: python -X utf8 docker/gemini/nav_campaign_mobile_apply.py
import os, json, shutil, hashlib
import numpy as np
from PIL import Image
A = 'public/assets/ui_skin/atlas'; BAK = f'{A}/_bak_캠페인아이콘_20261114'; SRC = 'public/assets/ui/_candidates_campaign/cand_a_plus.png'
os.makedirs(BAK, exist_ok=True)
h = lambda b: hashlib.sha1(b).hexdigest()
src = Image.open(SRC).convert('RGBA'); src = src.crop(src.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
report = {}
for sc in ('3x', '1.5x'):
    png, js = f'{A}/ui_skin_extra@{sc}.png', f'{A}/ui_skin_extra@{sc}.json'
    for p in (png, js):
        if not os.path.exists(f'{BAK}/{os.path.basename(p)}'): shutil.copy2(p, f'{BAK}/{os.path.basename(p)}')
    orig = Image.open(f'{BAK}/ui_skin_extra@{sc}.png').convert('RGBA'); jb = open(js, 'rb').read(); fr = json.loads(jb)['frames']
    f = fr['ico.tab_stage']['frame']; x, y, w, hh = f['x'], f['y'], f['w'], f['h']
    pad = round(w * 4 / 108); tgt = hh - 2 * pad; s = tgt / src.height
    ic = src.resize((max(1, round(src.width * s)), tgt), Image.LANCZOS)
    cell = Image.new('RGBA', (w, hh), (0, 0, 0, 0)); cell.alpha_composite(ic, ((w - ic.width) // 2, (hh - ic.height) // 2))
    new = orig.copy(); new.paste(cell, (x, y))   # paste(알파 그대로 덮어씀) — 칸 안만 교체
    def others(im):
        a = np.asarray(im).copy(); a[y:y + hh, x:x + w] = 0; return h(a.tobytes())
    per = {k: (h(np.asarray(orig.crop((v['frame']['x'], v['frame']['y'], v['frame']['x'] + v['frame']['w'], v['frame']['y'] + v['frame']['h']))).tobytes()) ==
               h(np.asarray(new.crop((v['frame']['x'], v['frame']['y'], v['frame']['x'] + v['frame']['w'], v['frame']['y'] + v['frame']['h']))).tobytes())) for k, v in fr.items() if k != 'ico.tab_stage'}
    new.save(png, optimize=True)
    chk = Image.open(png).convert('RGBA')
    report[sc] = {'frame': f, 'icon_px': list(ic.size), 'others_outside_frame_same': others(orig) == others(chk), 'other_frames_same': all(per.values()), 'n_other_frames': len(per),
                  'json_unchanged': h(open(js, 'rb').read()) == h(open(f'{BAK}/ui_skin_extra@{sc}.json', 'rb').read()) == h(jb), 'png_size': list(chk.size), 'png_bytes': os.path.getsize(png)}
print(json.dumps(report, ensure_ascii=False, indent=1))
