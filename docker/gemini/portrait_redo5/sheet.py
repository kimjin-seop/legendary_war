# 접촉 시트(호출 없음): python sheet.py <out.jpg> <before|after|both> <face|full> code1,code2,...
# before = refs/<code>.jpg(현행 게시본 마젠타 합성), after = out/<code>.png(회색 합성). face = 얼굴 영역 크롭(300px), full = 전체 축소(240x322)
import sys, json
from PIL import Image, ImageDraw, ImageFont
W='docker/gemini/portrait_redo5'
out,mode,kind,codes=sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4].split(',')
try: F=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',16)
except Exception: F=ImageFont.load_default()
def load(c,which):
    if which=='before': im=Image.open(f'{W}/refs/{c}.jpg').convert('RGB')
    else:
        a=Image.open(f'{W}/out/{c}.png').convert('RGBA'); bg=Image.new('RGBA',a.size,(110,110,110,255)); bg.alpha_composite(a); im=bg.convert('RGB')
    im=im.resize((896,1200))
    if kind=='face': return im.crop((248,80,648,480)).resize((300,300))
    return im.resize((240,322))
rows=['before','after'] if mode=='both' else [mode]
cw,ch=(300,300) if kind=='face' else (240,322)
cols=min(len(codes),7); nr=(len(codes)+cols-1)//cols
S=Image.new('RGB',(cols*cw,nr*len(rows)*(ch+22)),(30,30,30)); d=ImageDraw.Draw(S)
for i,c in enumerate(codes):
    x=(i%cols)*cw; y0=(i//cols)*len(rows)*(ch+22)
    for j,r in enumerate(rows):
        y=y0+j*(ch+22)
        try: S.paste(load(c,r),(x,y+22))
        except Exception as e: d.text((x+5,y+40),'없음',fill=(255,80,80),font=F)
        d.text((x+4,y+2),f'{c.replace("npc_","")}{"" if len(rows)==1 else " "+r[0].upper()}',fill=(255,255,255),font=F)
S.save(out,quality=88); print(out,S.size)
