import sys, os
import numpy as np
from collections import deque
from PIL import Image, ImageDraw, ImageFilter
"""
Pictures of the parts for the designer: the drawing of a part cut out of a screenshot of the PERI
catalogue (frames and bars removed), enlarged 4×, firm dark lines on a transparent ground.
Usage: part-pictures.py <screenshots dir> <out dir> <check sheet.png> [<json {file key: name}>]
(file key: the end of the file name before ".png").
"""
import json
src, out, chk = sys.argv[1:4]
names = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {'144014':'uvr150','144018':'uvr100','144021':'uvr50','144025':'uvr200','144030':'uvr300','144034':'uvh50','144037':'uvh100','144044':'uvh150','144047':'uvh200','144051':'uvh250','144102':'ubk','144114':'uh','144123':'uhv','144141':'ujb','144213':'ucm'}
SCALE=4
res=[]
for f in sorted(os.listdir(src)):
    key=next((k for k in names if f[:-4].endswith(k)), None)
    if key is None or not f.endswith('.png'): continue
    a=np.asarray(Image.open(os.path.join(src,f)).convert('RGB')).astype(int)
    h,w,_=a.shape
    r,g,b=a[...,0],a[...,1],a[...,2]
    blue=(b-r)>30
    gray=(r+g+b)/3
    ink=(gray<228)&~blue
    lab=-np.ones((h,w),int); best=None; comp=0
    for y0 in range(h):
        for x0 in range(w):
            if not ink[y0,x0] or lab[y0,x0]>=0: continue
            q=deque([(y0,x0)]); lab[y0,x0]=comp; pts=[]
            while q:
                y,x=q.popleft(); pts.append((y,x))
                for dy in range(-2,3):
                    for dx in range(-2,3):
                        yy,xx=y+dy,x+dx
                        if 0<=yy<h and 0<=xx<w and ink[yy,xx] and lab[yy,xx]<0:
                            lab[yy,xx]=comp; q.append((yy,xx))
            ys=[p[0] for p in pts]; xs=[p[1] for p in pts]
            wd=max(xs)-min(xs)+1; ht=max(ys)-min(ys)+1
            # frames: long thin lines along the border of the screenshot
            edge=min(xs)<14 or max(xs)>w-14 or min(ys)<2 or max(ys)>h-3
            frame=(wd>0.85*w) or (edge and wd<=6 and ht>0.6*h) or (edge and ht<=4 and wd>0.5*w) or ((min(xs)<=2 or max(xs)>=w-3) and ht>0.6*h)
            if not frame and (best is None or len(pts)>len(best[1])): best=(comp,pts)
            comp+=1
    c,pts=best
    mask=(lab==c)
    ys,xs=np.nonzero(mask)
    y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    pad=2
    crop=np.full((y1-y0+2*pad,x1-x0+2*pad),255.0)
    sub=gray[y0:y1,x0:x1].copy(); sub[~mask[y0:y1,x0:x1]]=255
    crop[pad:-pad,pad:-pad]=sub
    im=Image.fromarray(crop.clip(0,255).astype('uint8'),'L')
    big=im.resize((im.width*SCALE,im.height*SCALE),Image.LANCZOS)
    arr=np.asarray(big).astype(float)
    arr=np.clip((arr-60)/(235-60),0,1)
    arr=arr**1.6
    big=Image.fromarray((arr*255).astype('uint8'),'L').filter(ImageFilter.UnsharpMask(radius=1.2,percent=80,threshold=2))
    alpha=Image.fromarray((255-np.asarray(big)).astype('uint8'),'L')
    # thicker, firmer lines: they stay visible when the picture is shown small
    # (inclined lines thicken into steps: less for the diagonals)
    alpha=alpha.filter(ImageFilter.MaxFilter(3 if names[key] in ('ubk', 'ubl') else 5)).filter(ImageFilter.GaussianBlur(1.0 if names[key] in ('ubk', 'ubl') else 0.6))
    alpha=Image.fromarray(np.clip(np.asarray(alpha).astype(float)*1.35,0,255).astype('uint8'),'L')
    rgba=Image.new('RGBA',big.size,(30,41,59,0)); rgba.putalpha(alpha)
    p=os.path.join(out,names[key]+'.png'); rgba.save(p,optimize=True)
    res.append((names[key],rgba)); print(names[key],(int(x0),int(y0),int(x1),int(y1)),rgba.size,os.path.getsize(p))
W=sum(c.width+20 for _,c in res); H=max(c.height for _,c in res)+30
s=Image.new('RGBA',(W,H),(255,255,255,255)); d=ImageDraw.Draw(s); x=0
for n,c in res:
    s.alpha_composite(c,(x,0)); d.text((x,H-22),n,fill='red'); x+=c.width+20
s.convert('RGB').save(chk)
