#!/usr/bin/env python3
"""Generate the generic placeholder and loading icon (requires Pillow)."""
from PIL import Image, ImageDraw
import math
from pathlib import Path
out=Path(__file__).resolve().parents[1] / 'miniprogram/images'
for size,filename,bg in [(400,'flower-placeholder.png',(245,238,231,255)),(144,'flower-loading.png',(0,0,0,0))]:
 im=Image.new('RGBA',(size,size),bg); d=ImageDraw.Draw(im)
 cx=cy=size/2; r=size*.20
 for i in range(6):
  a=i*math.tau/6-math.pi/2; x=cx+math.cos(a)*r*.88; y=cy+math.sin(a)*r*.88
  d.ellipse((x-r*.70,y-r*.70,x+r*.70,y+r*.70),fill=(220,147,157,210))
 d.ellipse((cx-r*.46,cy-r*.46,cx+r*.46,cy+r*.46),fill=(226,185,114,255))
 im.save(out/filename,optimize=True)
