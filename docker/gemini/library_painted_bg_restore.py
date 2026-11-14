# 서고 실내 painted_bg 통그림 복원(안아트 2026-11-14, 이미지 모델 호출 0)
#   맵디자이너 docker/maps/library/build_library.py 의 build() 만 모듈로 불러 public/assets/maps/library/<code>.png 를 다시 굽는다.
#   build_library.py 의 __main__(DB 패치 JSON·미리보기·report 기록)은 실행하지 않음 -> database/data 는 건드리지 않음.
# 실행(저장소 루트): python -X utf8 docker/gemini/library_painted_bg_restore.py
import sys, json, runpy
from pathlib import Path
ROOT = Path('.').resolve()
sys.argv = ['build_library.py', str(ROOT)]
g = runpy.run_path(str(ROOT / 'docker/maps/library/build_library.py'), run_name='library_restore')
rep = json.load(open(ROOT / 'docker/maps/library/report.json', encoding='utf-8'))
out = {}
for code, cfg in g['CFG'].items():
    item, bg = g['build'](code, cfg)
    p = ROOT / 'public/assets/maps/library' / f'{code}.png'
    kb = round(p.stat().st_size / 1024, 1)
    out[code] = {'stage': cfg['stage'], 'size': list(bg.size), 'kb': kb, 'kb_2026_11_08': rep.get(code, {}).get('bg_kb'), 'src': item['painted_bg']['src']}
    print(code, out[code])
json.dump(out, open(ROOT / 'docker/gemini/library_painted_bg_restore_log.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
