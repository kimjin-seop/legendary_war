# 총병 무기 교정 2차 반영(호출 없음, 안아트 2026-11-07, 팀장 승인 4순위 + 사용자 정정 '총병=도보+총').
# 대상 10명: 키·경로 불변, 파일만 교체(manifest 수정 없음). 덮어쓰기 전 docker/gemini/gunner_fix/backup/ 에 원본 보존(이미 있으면 유지).
# 각 키의 manifest path(.webp 면 무손실 webp, .png 면 png)와 variants.x2 에 시트/단일 정면을 쓴다. 실행(저장소 루트): python -X utf8 docker/gemini/gunner_fix_publish_p4.py [--dry]
import json, os, shutil, sys
from PIL import Image

A = 'public/assets'; G = 'docker/gemini/gunner_fix'; BK = f'{G}/backup'; os.makedirs(BK, exist_ok=True)
DRY = '--dry' in sys.argv
# 잡 코드(gunner_fix/out/*/hero_<code>_*) -> manifest 키 base
BASE = {'wellington': 'unit.hero.wellington', 'mehmed_ii': 'unit.hero.mehmed_ii', 'gustavus_adolphus': 'unit.hero.gustavus_adolphus', 'frederick_great_v4': 'unit.hero.frederick_great_v4',
        'oda_nobunaga': 'unit.hero.oda_nobunaga', 'suleiman_i': 'unit.hero.suleiman_i', 'napoleon_v4': 'unit.hero.napoleon_v4', 'kutuzov': 'unit.hero.kutuzov', 'qi_jiguang': 'unit.hero.qi_jiguang',
        'npc_jp_shimazu_yoshihiro': 'unit.npc.npc_jp_shimazu_yoshihiro',
        # 3차(부대 병종 gunner, 영웅 시트에 총 없음)
        'leonardo_da_vinci': 'unit.hero.leonardo_da_vinci', 'date_masamune': 'unit.hero.date_masamune', 'sakamoto_ryoma': 'unit.hero.sakamoto_ryoma'}
ONLY = next((a[7:].split(',') for a in sys.argv if a.startswith('--only=')), None)  # --only=code1,code2
d = {it['key']: it for it in json.load(open(f'{A}/manifest.json', encoding='utf-8'))['items']}

def backup(p):
    dst = f'{BK}/{p.replace("/", "__")}'
    if os.path.exists(p) and not os.path.exists(dst): shutil.copy2(p, dst)

def write(img, rel, scale):
    p = f'public/{rel}'
    if DRY: print('  would write', p, img.size, 'x', scale); return
    backup(p)
    if scale != 1: img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    if p.endswith('.webp'): img.save(p, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    else: img.save(p)

done = []
for code, base in BASE.items():
    if ONLY and code not in ONLY: continue
    for side in ['ally', 'enemy']:
        sh = Image.open(f'{G}/out/64/hero_{code}_{side}_sheet.png').convert('RGBA')
        it = d[f'{base}.{side}.64.sheet']
        write(sh, it['path'], 1)
        x2 = (it.get('variants') or {}).get('x2')
        if x2: write(sh, x2, 2)
        done.append(it['path'])
        single = d.get(f'{base}.{side}.64')
        if single:
            sp = f'{G}/out/64/hero_{code}_{side}.png'
            front = Image.open(sp).convert('RGBA') if os.path.exists(sp) else sh.crop((64, 0, 128, 64))
            write(front, single['path'], 1)
            sx2 = (single.get('variants') or {}).get('x2')
            if sx2: write(front, sx2, 2)
            done.append(single['path'])
print('replaced', len(done), 'primary files'); [print(' ', p) for p in done]
