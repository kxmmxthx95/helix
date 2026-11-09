"""Derive preview-only, top-surface textures. Never writes original sprites.
Pillow only; run from any directory: python3 scripts/forest-assets/generate_polish_surfaces.py
"""
import hashlib,json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'public/tiles/twilight'
OUT=SOURCE/'polished'
SOURCES={'grass':'grass_plain','dirt':'dirt_rocks_01','water':'water_01','stone':'stone_floor_moss'}
def generate():
 OUT.mkdir(exist_ok=True)
 entries=[]
 for name,source in SOURCES.items():
  path=SOURCE/f'{source}.png';im=Image.open(path).convert('RGBA')
  result=Image.new('RGBA',(64,64))
  # Unproject a central square of the original diamond; the outer 20% includes
  # generated bevels/skirts and is deliberately not used. Mirror, never blur.
  for y in range(64):
   for x in range(64):
    u=.2+min(x,63-x)/31*.6;v=.2+min(y,63-y)/31*.6
    sx=round(64+(u-v)*64);sy=round((u+v)*32)
    color=im.getpixel((sx,sy))
    assert isinstance(color,tuple)
    if color[3]<255:raise ValueError(f'Non-opaque sample: {source} {sx,sy}')
    result.putpixel((x,y),color)
  result.save(OUT/f'{name}.png')
  entries.append({'id':name,'file':f'{name}.png','source':f'../{source}.png','sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'size':[64,64],'sampling':'central 0.2–0.8 diamond UV, nearest pixel, mirrored repeat'})
 (OUT/'manifest.json').write_text(json.dumps({'version':1,'textures':entries,'note':'Preview-only mirrored interior samples. Exact opposite texture edges; repetition and AI lighting remain. No originals modified.'},indent=2)+'\n')
 print(f'Generated {len(entries)} opaque textures in {OUT}')
if __name__=='__main__':generate()
