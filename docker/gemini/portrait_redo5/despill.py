# 잔여 마젠타 정리(호출 없음): 마젠타 계열(portrait_magenta_check 기준) 픽셀 중 투명 4px 이내 → 알파 0, 내부(갇힌 배경) → 어두운 중성색(그림자 틈). 썸네일 재생성.
import sys, numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation
O='docker/gemini/portrait_redo5/out'
for c in sys.argv[1:]:
    im=Image.open(f'{O}/{c}.png').convert('RGBA'); a=np.asarray(im).astype(int).copy()
    r,g,b,al=a[...,0],a[...,1],a[...,2],a[...,3]
    mg=(r>140)&(b>140)&(g<r-50)&(g<b-50)&(al>0)
    if not mg.any(): continue
    near=binary_dilation(al<20,iterations=4)
    e=mg&near; i=mg&~near
    a[e,3]=0
    a[i,0]=a[i,1]=a[i,2]=48
    out=Image.fromarray(a.astype('uint8'),'RGBA'); out.save(f'{O}/{c}.png')
    out.resize((256,343),Image.LANCZOS).save(f'{O}/thumb/{c}.webp','WEBP',quality=88,method=6)
    print(c,'edge',int(e.sum()),'interior',int(i.sum()))
