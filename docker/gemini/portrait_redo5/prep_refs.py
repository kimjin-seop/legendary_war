# 참조 준비(호출 없음): 현행 초상(manifest 경로, 같은 이름 png 있으면 png)을 마젠타 위에 합성해 refs/<code>.jpg, 출처 맵 refs/src.json
import json, os, sys
from PIL import Image
W='docker/gemini/portrait_redo5'
codes=sys.argv[1].split(',')
man={it['key']:it for it in json.load(open('public/assets/manifest.json',encoding='utf-8'))['items']}
alias={}
src={}
for c in codes:
    it=man.get(f'portrait.{alias.get(c,c)}') or man.get(f'portrait.npc_{c}')
    p='public/'+it['path']; png=p[:-5]+'.png'
    s=p  # 게시 중인 webp 를 기준(png 는 낡았을 수 있음)
    im=Image.open(s).convert('RGBA'); bg=Image.new('RGBA',im.size,(255,0,255,255)); bg.alpha_composite(im)
    bg.convert('RGB').save(f'{W}/refs/{c}.jpg',quality=93)
    src[c]={'manifest_key':it['key'],'path':it['path'],'ref_from':s,'size':im.size}
json.dump(src,open(f'{W}/refs/src.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(len(src))
