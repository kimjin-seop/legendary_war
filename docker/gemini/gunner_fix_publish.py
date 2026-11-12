# 총병 무기 교정 반영(호출 없음, 안아트 2026-11-07). 실행(저장소 루트): python -X utf8 docker/gemini/gunner_fix_publish.py [--merge]
# 1) 김시민: 기존 파일 백업(docker/gemini/gunner_fix/backup/) 후 같은 경로에 덮어씀(키·경로 불변 -> manifest 수정 없음)
#    64/hero_kim_simin_{side}_sheet.webp(무손실) + 64/hero_kim_simin_{side}.webp(정면 idle 단일) + 64_x2 png 2종
# 2) 중국 총병: public/assets/sprites/{64,64_x2}/china_gunner_{side}_sheet.png 신규 -> 키 unit.china.gunner.{side}.64.sheet
# 3) 안전망: unit.default.gunner.{side}.64.sheet = europe 총병 파일 별칭(새 파일 없음). culturesOf 가 항상 default 를 거치므로 전용 시트 없는 문화권 총병이 궁병 시트로 떨어지지 않음
# 조각: public/assets/sprites/gunner_fix_manifest_fragment.json. --merge: 최신 manifest 를 다시 읽어 '없는 키만' 추가(기존 키는 건드리지 않음), 임시 파일 -> rename
import json, os, shutil, sys, time
from datetime import datetime, timezone
from PIL import Image

A = 'public/assets'; G = 'docker/gemini/gunner_fix'; SP = f'{A}/sprites'
BK = f'{G}/backup'; os.makedirs(BK, exist_ok=True)
QA = json.load(open(f'{G}/qa.json', encoding='utf-8'))
LIC = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요(비차단 메모)'
GEN = {'model': 'gemini-nano-banana-2.1', 'api': 'Interactions API', 'size': '2K', 'script': 'docker/gemini/gunner_fix_gen.mjs -> hero_dir_pp_v4.mjs(HERO_FACE=docker/gemini/gunner_fix/facing.json) -> gunner_fix_publish.py'}

def backup(p):
    if os.path.exists(p):
        d = f'{BK}/{p.replace("/", "__")}'
        if not os.path.exists(d): shutil.copy2(p, d)

# 1) 김시민
for side in ['ally', 'enemy']:
    src1 = f'{G}/out/64/hero_kim_simin_{side}_sheet.png'; src2 = f'{G}/out/64_x2/hero_kim_simin_{side}_sheet.png'
    tg = [f'{SP}/64/hero_kim_simin_{side}_sheet.webp', f'{SP}/64/hero_kim_simin_{side}.webp', f'{SP}/64_x2/hero_kim_simin_{side}_sheet.png', f'{SP}/64_x2/hero_kim_simin_{side}.png']
    for p in tg: backup(p)
    sh = Image.open(src1).convert('RGBA')
    sh.save(tg[0], 'WEBP', lossless=True, quality=100, method=6, exact=True)
    front = sh.crop((64, 0, 128, 64))
    front.save(tg[1], 'WEBP', lossless=True, quality=100, method=6, exact=True)
    shutil.copyfile(src2, tg[2])
    front.resize((128, 128), Image.NEAREST).save(tg[3])

# 2) 중국 총병
items = []
for side in ['ally', 'enemy']:
    f = f'china_gunner_{side}_sheet.png'
    for d in ['64', '64_x2']:
        os.makedirs(f'{SP}/{d}', exist_ok=True); shutil.copyfile(f'{G}/out/{d}/hero_gunner_china_{side}_sheet.png', f'{SP}/{d}/{f}')
    items.append({'key': f'unit.china.gunner.{side}.64.sheet', 'path': f'assets/sprites/64/{f}', 'type': 'spritesheet', 'bytes': os.path.getsize(f'{SP}/64/{f}'), 'verify': True,
        'size': '192x256', 'frameWidth': 64, 'frameHeight': 64, 'grid': '3x4(행: down,left,right,up / 열: walk1,idle,walk2)', 'culture': 'china', 'unit_type': 'gunner', 'display_name_hint': '조총병', 'side': side,
        'mirror_baked': 'right', 'team_mark': '발밑 팀색 받침 마커(#3E8EF7, A안). 의상은 원색' if side == 'ally' else '발밑 팀색 받침 마커(#E04A4A) + 팔레트 스왑(파랑 계열만 빨강 계열)',
        'pixel_pipeline': 'hero_dir_pp_v4.mjs(도트 격자 직접 샘플, 32색, 외곽선 1px)', 'variants': {'x2': f'assets/sprites/64_x2/{f}'}, 'alpha': True, 'filter': 'NEAREST', 'scale': 'integer only(x1/x2/x3, nearest)',
        'fallback': f'unit.china.archer.{side}.64.sheet', 'generator': GEN, 'prompt_ref': 'docker/gemini/gunner_fix_gen.mjs JOBS.gunner_china', 'raw': f'{G}/raw/gunner_china.jpg',
        'ref': 'public/assets/raw/dir64_china/archer.jpg(같은 병사 궁병 시트, 무기만 화승총으로)', 'calls': 1, 'license': LIC, 'qa': {'checked': True, **QA['gunner_china']},
        'verify_note': '명대 조총병 복식 일반화(verify)', 'source_fragment': 'assets/sprites/gunner_fix_manifest_fragment.json'})
# 3) 안전망 별칭
for side in ['ally', 'enemy']:
    f = f'europe_gunner_{side}_sheet.png'
    items.append({'key': f'unit.default.gunner.{side}.64.sheet', 'path': f'assets/sprites/64/{f}', 'type': 'spritesheet', 'bytes': os.path.getsize(f'{SP}/64/{f}'), 'size': '192x256', 'frameWidth': 64, 'frameHeight': 64,
        'grid': '3x4(행: down,left,right,up / 열: walk1,idle,walk2)', 'culture': 'default', 'unit_type': 'gunner', 'side': side, 'alias_of': f'unit.europe.gunner.{side}.64.sheet', 'variants': {'x2': f'assets/sprites/64_x2/{f}'},
        'alpha': True, 'filter': 'NEAREST', 'note': '안전망 별칭(새 파일 없음): 전용 총병 시트가 없는 문화권이 궁병(활) 시트로 폴백되지 않게 default 총병 = 유럽 머스킷병', 'license': LIC, 'qa': {'checked': True, 'verdict': 'pass', 'issues': []},
        'source_fragment': 'assets/sprites/gunner_fix_manifest_fragment.json'})
kim_note = {'replaced_files': ['assets/sprites/64/hero_kim_simin_{ally,enemy}_sheet.webp', 'assets/sprites/64/hero_kim_simin_{ally,enemy}.webp', 'assets/sprites/64_x2/hero_kim_simin_{ally,enemy}_sheet.png', 'assets/sprites/64_x2/hero_kim_simin_{ally,enemy}.png'],
    'keys_unchanged': ['unit.hero.kim_simin.{ally,enemy}.64.sheet', 'unit.hero.kim_simin.{ally,enemy}.64'], 'backup': f'{BK}/', 'raw': f'{G}/raw/kim_simin.jpg', 'ref': 'docker/gemini/hero_dir_raw/kim_simin.jpg(기존 방향 시트 raw, 무기만 승자총통형 총통으로)',
    'generator': GEN, 'prompt_ref': 'docker/gemini/gunner_fix_gen.mjs JOBS.kim_simin', 'calls': 1, 'qa': {'checked': True, **QA['kim_simin']}, 'verify_note': '조선 승자총통 형태 일반화(verify)', 'license': LIC,
    'stale_fields': 'manifest 의 bytes·qa_note(화살통 식별)는 이전 시트 기준 값 — 다음 정식 병합 때 갱신'}
frag = {'_note': '총병 무기 교정(2026-11-07, 안아트): 사용자 지시 "총병인데 활 든 것 전부 교체". 중국 총병 신규 + default 총병 안전망 별칭. 김시민은 같은 키·경로 파일 교체(kim_simin_replacement 기록만, items 아님)',
        'items': items, 'kim_simin_replacement': kim_note}
FP = f'{SP}/gunner_fix_manifest_fragment.json'
json.dump(frag, open(FP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('fragment', FP, [i['key'] for i in items])

if '--merge' in sys.argv:
    MP = f'{A}/manifest.json'
    for p in [i['path'] for i in items] + [i['variants']['x2'] for i in items]:
        assert os.path.exists(f'public/{p}'), p
    t0 = os.path.getmtime(MP)
    m = json.load(open(MP, encoding='utf-8'))
    have = {it.get('key') for it in m['items']}
    add = [i for i in items if i['key'] not in have]
    m['items'].extend(add)
    out = json.dumps(m, ensure_ascii=False, indent=1)
    json.loads(out)
    if os.path.getmtime(MP) != t0: sys.exit('manifest 가 읽는 중 변경됨 — 다시 실행')
    tmp = MP + '.tmp_gunner_fix'; open(tmp, 'w', encoding='utf-8').write(out); os.replace(tmp, MP)
    print('merged keys', [i['key'] for i in add], 'skipped(existing)', [i['key'] for i in items if i['key'] in have])
