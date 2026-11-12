# 게시(호출 없음, 안아트 2026-11-08). qa.json 에서 pass/minor 인 인물만 기존 경로에 덮어쓰기(키·경로 불변), 덮어쓰기 전 원본 백업, manifest 조각 산출.
# 조각 항목 = 기존 manifest 항목 메타 + 갱신 필드(merge_fragments 가 키 항목을 통째로 교체하므로).
# 대상 키 = manifest 의 portrait.(npc_)?<code|파일코드>(.thumb) (별칭 키는 같은 파일이라 경로 중복 제거). 같은 이름 원본 png 가 있으면 함께 갱신.
# 백업: docker/db-backup-20261109/portrait-redo3/<public 기준 상대경로>(이미 있으면 덮지 않음 = 최초 원본 보존)
# manifest.json·assets.js 는 수정하지 않음 → public/assets/portraits/portrait_redo3_manifest_fragment.json (replaces_existing_keys)
# 실행: docker run --rm -v samguk_pylib:/pylib -v "$(pwd -W):/app" -w /app -e PYTHONPATH=/pylib python:3.12 python docker/gemini/portrait_redo3/publish.py [--dry]
import json, os, re, shutil, sys, datetime
from PIL import Image
W='docker/gemini/portrait_redo3'; PUB='public'; BK='docker/db-backup-20261109/portrait-redo3'
dry='--dry' in sys.argv
man=json.load(open('public/assets/manifest.json',encoding='utf-8'))['items']
qa=json.load(open(f'{W}/qa.json',encoding='utf-8'))
calls=[json.loads(l) for l in open(f'{W}/calls_log.jsonl',encoding='utf-8') if l.strip()]
ALIAS={}
def backup(dst):
    b=os.path.join(BK,os.path.relpath(dst,PUB))
    if os.path.exists(dst) and not os.path.exists(b): os.makedirs(os.path.dirname(b),exist_ok=True); shutil.copy2(dst,b)
def write(src,dst):
    if dry: return
    backup(dst)
    if dst.endswith('.webp') and not src.endswith('.webp'): Image.open(src).convert('RGBA').save(dst,'WEBP',quality=90,alpha_quality=100,method=6)
    else: shutil.copyfile(src,dst)
items,done,files=[],[],[]
for code,q in qa.items():
    if code.startswith('_') or q.get('verdict') not in ('pass','minor'): continue
    names={code,code.replace('npc_',''),ALIAS.get(code,code)}
    pat=re.compile(r'^portrait\.(npc_)?('+'|'.join(map(re.escape,names))+r')(\.thumb)?$')
    seen=set()
    for it in man:
        if not pat.match(it['key']): continue
        p=it['path']; thumb=it['key'].endswith('.thumb')
        src=f'{W}/out/thumb/{code}.webp' if thumb else f'{W}/out/{code}.png'
        if p not in seen:
            seen.add(p); write(src,f'{PUB}/{p}'); files.append(p)
            png=f'{PUB}/{p[:-5]}.png'
            if not thumb and p.endswith('.webp') and os.path.exists(png): write(src,png); files.append(png[7:])
        base={k:v for k,v in it.items() if k not in ('source_fragment','qa','generator','prompt_ref','calls','attempts','verify','verify_note')}  # merge 는 항목 통째 교체 → 기존 메타 보존
        items.append({**base,'key':it['key'],'path':p,'bytes':None if dry else os.path.getsize(f'{PUB}/{p}'),'revision':'portrait-redo3-20261109',
            'generator':{'model':'gemini-nano-banana-2.1','api':'Interactions API','size':'2K','script':f'{W}/redo_gen.mjs(ref=현행 초상, 얼굴만 교체) → pp.sh(alpha_process.py B, 896x1200, thumb 256x343 q88) → publish.py(webp q90 a100)'},
            'prompt_ref':f'{W}/redo_style.mjs P.{code}','calls':len([c for c in calls if c['id']==code]),
            'qa':{'checked':True,**q},'verify':True,'verify_note':q.get('evidence'),'backup':f'{BK}/{p}'})
    done.append(code)
frag={'note':'초상 얼굴 다양성 감사 1배치(안아트 2026-11-09): S/A·쇼케이스 우선, 동남아·고대 지중해·중국·한국·남아시아·중동·초원 닮은 얼굴 군집. 기존 키·경로 그대로 파일만 교체(유닛 스프라이트 불변). 병합 시 replaces_existing_keys 의 bytes·revision·qa 만 갱신. ASSET_VERSION bump 필요(같은 경로 덮어쓰기라 캐시 무효화).',
      'generated':datetime.datetime.now().isoformat(timespec='seconds'),'replaces_existing_keys':sorted({i['key'] for i in items}),'items':items}
if not dry: json.dump(frag,open('public/assets/portraits/portrait_redo3_manifest_fragment.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(('[dry] ' if dry else '')+f'인물 {len(done)}, 키 {len(items)}, 파일 {len(files)}')

# webp_map 대응표 크기값 갱신(1차와 같은 방식: 덮어쓴 webp 를 가리키는 항목의 bytes_src/bytes_webp, batch 에 회차 표시). 갱신 전 원본 백업.
WM='public/assets/webp_map.json'
if not dry:
    backup(WM)
    wm=json.load(open(WM,encoding='utf-8')); pub=set(files); n=0
    for k,v in wm.items():
        if v.get('webp') in pub:
            v['bytes_webp']=os.path.getsize(f"{PUB}/{v['webp']}")
            if os.path.exists(f'{PUB}/{k}'): v['bytes_src']=os.path.getsize(f'{PUB}/{k}')
            if 'portrait-redo3-20261109' not in v.get('batch',''): v['batch']=v.get('batch','')+'+portrait-redo3-20261109'
            n+=1
    json.dump(wm,open(WM,'w',encoding='utf-8'),ensure_ascii=False,indent=1); print('webp_map 갱신',n)
