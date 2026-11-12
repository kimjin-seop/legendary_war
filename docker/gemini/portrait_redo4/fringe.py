# 테두리 보라 잔광 정리(호출 없음, 안아트 2026-11-09): 투명 영역 또는 이미지 가장자리에서 3px 이내의 마젠타 기운 픽셀(r,b 가 g 보다 25 이상 큼)을 같은 밝기의 중성 회색으로 탈색. 썸네일 재생성.
# 실행: python fringe.py code1 code2 ...  (docker python:3.12 + /pylib, 또는 로컬 pillow+numpy+scipy)
import sys, numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation
O='docker/gemini/portrait_redo4/out'
for c in sys.argv[1:]:
    im=Image.open(f'{O}/{c}.png').convert('RGBA'); a=np.asarray(im).astype(int).copy()
    r,g,b,al=a[...,0],a[...,1],a[...,2],a[...,3]
    tint=(r>g+25)&(b>g+25)&(al>0)
    edge=np.zeros_like(tint); edge[:3,:]=edge[-3:,:]=edge[:,:3]=edge[:,-3:]=True
    near=binary_dilation((al<20)|edge,iterations=3)
    m=tint&near
    if not m.any(): continue
    L=((r+g+b)//3)[m]*0.85
    for k in range(3): a[...,k][m]=L
    out=Image.fromarray(np.clip(a,0,255).astype('uint8'),'RGBA'); out.save(f'{O}/{c}.png')
    out.resize((256,343),Image.LANCZOS).save(f'{O}/thumb/{c}.webp','WEBP',quality=88,method=6)
    print(c,int(m.sum()))
