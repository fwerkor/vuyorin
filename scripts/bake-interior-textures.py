#!/usr/bin/env python3
"""Authored HALO EXCHANGE interior PBR albedo atlases (offline, reproducible)."""
from pathlib import Path
from PIL import Image, ImageDraw
import math,random

OUT=Path('client/public/assets/halo')
OUT.mkdir(parents=True, exist_ok=True)
SIZE=768
def clamp(v):return max(0,min(255,int(v)))
def image_noise(name,seed,base,mode):
    rng=random.Random(seed)
    im=Image.new('RGB',(SIZE,SIZE));p=im.load()
    grain=[rng.gauss(0,5) for _ in range(SIZE)]
    for y in range(SIZE):
        sy=math.sin(y/39)*4
        for x in range(SIZE):
            n=rng.gauss(0,7)+sy+grain[x]
            if mode=='wood':
                n+=19*math.sin(x*.051+math.sin(y*.014)*2)+9*math.sin(x*.19+math.cos(y*.02))
            if mode=='marble':
                vein=math.sin((x+y*.41)*.023+math.sin(y*.025)*5)
                n+=16*max(0,vein-.66)
            p[x,y]=tuple(clamp(c+n) for c in base)
    d=ImageDraw.Draw(im)
    if mode=='terrazzo':
        for i in range(7300):
            x,y=rng.randrange(SIZE),rng.randrange(SIZE);r=rng.choice([1,2,2,3,4])
            c=rng.choice([(95,101,105),(181,174,156),(48,65,70),(141,143,140),(54,68,63)])
            d.ellipse((x-r,y-r,x+r,y+r),fill=c)
        for v in range(0,SIZE,192):
            d.line((v,0,v,SIZE),fill=(53,63,67),width=2)
            d.line((0,v,SIZE,v),fill=(53,63,67),width=2)
    if mode=='wood':
        for x in range(0,SIZE,96):
            d.line((x,0,x,SIZE),fill=(25,32,33),width=3)
            d.line((x+5,0,x+5,SIZE),fill=(105,76,52),width=1)
    if mode=='fabric':
        for y in range(0,SIZE,3):
            d.line((0,y,SIZE,y),fill=(33,48,55),width=1)
        for x in range(0,SIZE,4):
            d.line((x,0,x,SIZE),fill=(35,50,60),width=1)
    im.save(OUT/(name+'.png'),optimize=True)
for params in [
  ('terrazzo',7301,(107,117,119),'terrazzo'),
  ('marble',7302,(193,190,177),'marble'),
  ('walnut',7303,(112,75,50),'wood'),
  ('fabric',7304,(49,80,91),'fabric'),
  ('brass',7305,(125,100,64),'metal'),
  ('graphite',7306,(48,59,66),'metal'),
]:image_noise(*params)
print('HALO EXCHANGE: baked',len(list(OUT.glob('*.png'))),'texture atlases')
