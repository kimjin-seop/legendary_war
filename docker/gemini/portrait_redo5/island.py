# 떠 있는 잔여 조각 제거(호출 없음, 안아트 2026-11-10): 알파>0 연결 성분 중 최대 성분 면적의 2% 미만인 섬을 투명 처리 후 썸네일 재생성.
# 실행: python island.py code1 code2 ...  (docker python:3.12 + /pylib)
import sys, numpy as np
from PIL import Image
from scipy.ndimage import label
O='docker/gemini/portrait_redo5/out'
for c in sys.argv[1:]:
    im=Image.open(f'{O}/{c}.png').convert('RGBA'); a=np.array(im)
    lab,n=label(a[...,3]>0); sizes=np.bincount(lab.ravel()); sizes[0]=0
    keep=sizes>=sizes.max()*0.02; rm=~keep[lab]&(lab>0)
    a[rm,3]=0; im=Image.fromarray(a); im.save(f'{O}/{c}.png')
    im.resize((256,343),Image.LANCZOS).save(f'{O}/thumb/{c}.webp','WEBP',quality=88,method=6)
    print(c,'components',n,'removed_px',int(rm.sum()))
