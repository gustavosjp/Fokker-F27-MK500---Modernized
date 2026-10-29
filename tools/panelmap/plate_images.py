"""Synthetic stand-ins for the WT21 plate textures (same arithmetic as scaffold.ps1): plate colour + the page area drawn as a sky/ground
rectangle with a white outline, so a textured preview shows where the page lands on the quad.
Usage: python plate_images.py <wt21-layout.json> <outDir>   -> <outDir>/<id>.png"""
import json, os, sys
from PIL import Image, ImageDraw
L = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
for u in L['units']:
    pw, ph = u['page']; kx = pw / u['screen']['size'][0]; ky = ph / u['screen']['size'][1]
    tw = round(u['plate']['size'][0] * kx); th = round(u['plate']['size'][1] * ky)
    gx = round(((u['plate']['center'][0] + u['plate']['size'][0] / 2) - (u['screen']['center'][0] + u['screen']['size'][0] / 2)) * kx)
    gy = round(((u['plate']['center'][1] + u['plate']['size'][1] / 2) - (u['screen']['center'][1] + u['screen']['size'][1] / 2)) * ky)
    im = Image.new('RGB', (tw, th), tuple(L['plateColor'])); d = ImageDraw.Draw(im)
    d.rectangle([gx, gy, gx + pw, gy + ph // 2], fill=(40, 110, 230)); d.rectangle([gx, gy + ph // 2, gx + pw, gy + ph], fill=(150, 90, 30))
    d.rectangle([gx, gy, gx + pw - 1, gy + ph - 1], outline=(255, 255, 255), width=8)
    im.save(os.path.join(out, u['id'] + '.png')); print(u['id'], tw, th, gx, gy)
