#!/usr/bin/env python3
"""Deterministic offline-baked materials for the original VUYORIN arcology district."""
from pathlib import Path
from PIL import Image, ImageDraw
import random, math

DEST = Path('client/public/assets/architecture')
DEST.mkdir(parents=True, exist_ok=True)
S = 768

def clamp(v):
    return max(0,min(255,int(v)))

def glass(palette,seed,tag):
    rng = random.Random(seed)
    image=Image.new('RGB',(S,S))
    emissive=Image.new('RGB',(S,S))
    pix=image.load(); em=emissive.load()
    base=palette[0]
    for y in range(S):
        streak=6*math.sin(y*.065)+2*math.cos(y*.014)
        for x in range(S):
            n=rng.gauss(0,4.0)
            v=n+streak+9*math.sin(x*.012)
            pix[x,y]=tuple(clamp(v+c) for c in base)
            em[x,y]=(0,0,0)
    draw=ImageDraw.Draw(image)
    glow=ImageDraw.Draw(emissive)
    # Pane sizes and mullions vary by two offset facade modules.
    cellx=64;celly=64
    for row in range(S//celly):
        for col in range(S//cellx):
            x=col*cellx;y=row*celly
            tint=rng.choice(palette)
            lit=rng.random()<(.42 if row%3 else .18)
            light=rng.choice([(254,171,93),(93,226,249),(236,214,181)]) if lit else (0,0,0)
            draw.rectangle((x+8,y+9,x+55,y+50),fill=tuple(clamp(c+rng.randrange(-6,6)) for c in tint))
            draw.rectangle((x+10,y+11,x+53,y+16),fill=tuple(clamp(c+32) for c in tint))
            draw.line((x+32,y+9,x+32,y+50),fill=(18,30,35),width=3)
            draw.rectangle((x+4,y+4,x+59,y+6),fill=(38,54,64))
            if lit:
                glow.rectangle((x+10,y+16,x+31,y+48),fill=light)
                glow.rectangle((x+35,y+16,x+53,y+48),fill=tuple(int(v*.65) for v in light))
            if rng.random()<.23:
                draw.line((x+2,y+10,x+2,y+52),fill=(45,65,76),width=2)
    image.save(DEST/f'{tag}_albedo.png',optimize=True)
    emissive.save(DEST/f'{tag}_emissive.png',optimize=True)

glass([(21,43,54),(26,65,76),(34,88,102),(50,84,91)],1291,'cyan')
glass([(37,30,47),(71,47,75),(90,47,83),(52,53,80)],3701,'magenta')
glass([(43,43,42),(90,69,49),(111,74,52),(59,77,82)],8177,'amber')

def surface(tag,seed,base,horizontal=None,vertical=None):
    rng=random.Random(seed)
    image=Image.new('RGB',(S,S))
    p=image.load()
    # Fine-grained albedo with large-scale stains and windblown grime.
    rows=[rng.randrange(-7,8)+6*math.cos(y/39) for y in range(S)]
    cols=[rng.randrange(-8,8)+4*math.sin(x/31) for x in range(S)]
    for y in range(S):
        for x in range(S):
            shade=rows[y]+cols[x]+rng.gauss(0,9)+8*math.sin((x+y)/127)
            p[x,y]=tuple(clamp(ch+shade) for ch in base)
    d=ImageDraw.Draw(image)
    for i in range(180):
        x=rng.randrange(S); y=rng.randrange(S)
        n=rng.randrange(4,34)
        shade=rng.choice([(20,24,27),(50,55,60),(100,95,84),(67,74,70)])
        d.line((x,y,x+rng.randrange(-3,4),min(S,y+n)),fill=shade,width=rng.choice([1,1,2]))
    if horizontal:
        for y in range(0,S,horizontal):
            d.line((0,y,S,y),fill=(27,35,39),width=4)
            d.line((0,y+5,S,y+5),fill=(105,104,97),width=1)
    if vertical:
        for x in range(0,S,vertical):
            d.line((x,0,x,S),fill=(25,29,31),width=4)
            d.line((x+5,0,x+5,S),fill=(90,99,99),width=1)
    image.save(DEST/f'{tag}_albedo.png',optimize=True)

surface('basalt',2801,(76,83,86),horizontal=128,vertical=96)
surface('titanium',2803,(51,66,76),horizontal=32,vertical=192)
surface('oxidized',2805,(115,75,59),horizontal=128,vertical=256)
print('Architecture materials:', [(x.name, x.stat().st_size) for x in sorted(DEST.glob('*.png'))])
