# 실측: 패널 경계, 16px 격자 주기, 영역별 마젠타 비율, 수면/애니 프레임 차이
import sys, json
from PIL import Image
src=sys.argv[1]
im=Image.open(src).convert('RGB'); W,H=im.size; px=im.load()
TEAL=(0,128,128); MAG=(225,0,126)
PANELS={'A':(2,2),'B':(484,2),'C':(2,262),'D':(484,262)}
out={'size':[W,H]}
def crop(p): x,y=PANELS[p]; return im.crop((x,y,x+480,y+256))
# 격자 주기: 인접 열/행 차이 합을 x mod 16 별로
def period(img):
    w,h=img.size; p=img.load(); res={}
    for P in (8,16,24,32):
        col=[0]*P; cnt=[0]*P
        for x in range(w-1):
            s=0
            for y in range(h):
                a=p[x,y]; b=p[x+1,y]; s+=abs(a[0]-b[0])+abs(a[1]-b[1])+abs(a[2]-b[2])
            col[(x+1)%P]+=s; cnt[(x+1)%P]+=1
        avg=[col[i]/cnt[i] for i in range(P)]
        res[P]=round(avg[0]/(sum(avg[1:])/(P-1)),3)
    return res
stats={}
for k in PANELS:
    c=crop(k); p=c.load()
    st={'origin':PANELS[k]}
    st['col_boundary_ratio']=period(c)
    st['row_boundary_ratio']=period(c.transpose(Image.Transpose.TRANSPOSE))
    def magfrac(x0,y0,x1,y1):
        n=sum(1 for x in range(x0,x1) for y in range(y0,y1) if p[x,y]==MAG); return round(n/((x1-x0)*(y1-y0)),4)
    st['magenta_frac']={'water_anim_0_0_96_128':magfrac(0,0,96,128),'auto_96_0_192_128':magfrac(96,0,192,128),'auto_0_128_192_256':magfrac(0,128,192,256),
        'lower_192_0_288_256':magfrac(192,0,288,256),'lower_288_0_384_128':magfrac(288,0,384,128),'upper_288_128_384_256':magfrac(288,128,384,256),'upper_384_0_480_256':magfrac(384,0,480,256),
        'tile_288_128':magfrac(288,128,304,144)}
    # 수면 블록 3열(16px) 간 차이: 가로 프레임 가설 검증
    def tdiff(a,b):
        (ax,ay),(bx,by)=a,b; s=0
        for dx in range(16):
            for dy in range(16):
                u=p[ax+dx,ay+dy]; v=p[bx+dx,by+dy]; s+=(u!=v)
        return round(s/256,3)
    st['water_frame_diff']={f'blk{bx}_{by}_row{r}':[tdiff((bx,by+r*16),(bx+16,by+r*16)),tdiff((bx,by+r*16),(bx+32,by+r*16))] for bx,by in ((0,0),(48,0),(0,64)) for r in range(4)}
    st['anim_vertical_diff']={f'x{ax}':[tdiff((ax,64),(ax,64+16*f)) for f in (1,2,3)] for ax in (48,64,80)}
    stats[k]=st
out['panels']=stats
print(json.dumps(out,indent=1))
